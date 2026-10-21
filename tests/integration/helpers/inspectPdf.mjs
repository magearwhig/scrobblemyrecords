/* global process, console, Buffer */
/**
 * Inspect a PDF with PDF.js and print a JSON report on stdout.
 *
 * Run as a subprocess from Jest (pdfjs-dist is ESM-only):
 *   node tests/integration/helpers/inspectPdf.mjs path/to/file.pdf
 *
 * Report shape:
 *   {
 *     pages: [{ width, height, lines: string[], fonts: [{ name, embedded }],
 *               annotations: [{ subtype, destPage, url, unsafeUrl, action }] }],
 *     outline: [{ title, destPage }],
 *     jsActions, openAction, attachments
 *   }
 * destPage is a 0-based page index (null when the destination does not resolve).
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const file = process.argv[2];
if (!file) {
  console.error('usage: inspectPdf.mjs <file.pdf>');
  process.exit(2);
}

const raw = readFileSync(file);
const data = new Uint8Array(raw);

/**
 * Chromium (Skia) wraps shaped clusters whose glyphs don't map 1:1 to
 * characters (Devanagari conjuncts and reordered vowel signs, some accents) in
 * `/Span <</ActualText <FEFF…>>> BDC … EMC`. PDF.js text extraction ignores
 * ActualText, so collect the strings from the inflated content streams in file
 * order and substitute them for the Span contents while walking the pages.
 */
function collectActualTexts(bytes) {
  const latin1 = bytes.toString('latin1');
  const out = [];
  const streamRe = /stream\r?\n/g;
  let m;
  while ((m = streamRe.exec(latin1))) {
    const start = m.index + m[0].length;
    const end = latin1.indexOf('endstream', start);
    if (end < 0) break;
    let decoded;
    try {
      decoded = inflateSync(bytes.subarray(start, end)).toString('latin1');
    } catch {
      continue;
    }
    for (const hit of decoded.matchAll(/\/ActualText\s*<([0-9A-Fa-f]*)>/g)) {
      let hex = hit[1];
      if (hex.toUpperCase().startsWith('FEFF')) hex = hex.slice(4);
      out.push(Buffer.from(hex, 'hex').swap16().toString('utf16le'));
    }
    streamRe.lastIndex = end;
  }
  return out;
}

const actualTexts = collectActualTexts(raw);
let actualTextSpans = 0;
const doc = await pdfjs.getDocument({
  data,
  fontExtraProperties: true,
  disableFontFace: true,
  useSystemFonts: false,
  isEvalSupported: false,
  verbosity: 0,
}).promise;

async function resolveDest(dest) {
  if (dest == null) return null;
  let explicit = dest;
  if (typeof dest === 'string') explicit = await doc.getDestination(dest);
  if (!Array.isArray(explicit) || explicit.length === 0) return null;
  const ref = explicit[0];
  if (typeof ref === 'number') return ref;
  try {
    return await doc.getPageIndex(ref);
  } catch {
    return null;
  }
}

/**
 * Group text items into visual lines (same baseline), top to bottom, with
 * ActualText substituted for Span contents.
 */
function toLines(items) {
  const runs = [];
  const stack = [];
  for (const item of items) {
    if (
      item.type === 'beginMarkedContentProps' ||
      item.type === 'beginMarkedContent'
    ) {
      if (item.tag === 'Span') {
        actualTextSpans += 1;
        stack.push({ actual: actualTexts.shift() ?? null, emitted: false });
      } else {
        stack.push(null);
      }
      continue;
    }
    if (item.type === 'endMarkedContent') {
      stack.pop();
      continue;
    }
    if (typeof item.str !== 'string') continue;
    const span = [...stack].reverse().find(s => s && s.actual !== null);
    let str = item.str;
    if (span) {
      if (span.emitted || item.str.trim() === '') continue;
      span.emitted = true;
      str = span.actual;
    }
    runs.push({ y: item.transform[5], str, eol: item.hasEOL });
  }

  const lines = [];
  let current = null;
  for (const run of runs) {
    if (current && Math.abs(current.y - run.y) < 2) {
      current.text += run.str;
    } else {
      if (current) lines.push(current);
      current = { y: run.y, text: run.str };
    }
    if (run.eol) {
      lines.push(current);
      current = null;
    }
  }
  if (current) lines.push(current);
  return lines
    .sort((a, b) => b.y - a.y)
    .map(l => l.text.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

const pages = [];
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const [x0, y0, x1, y1] = page.view;
  const content = await page.getTextContent({
    disableNormalization: true,
    includeMarkedContent: true,
  });

  // Loading the operator list makes the page's fonts available in commonObjs
  const ops = await page.getOperatorList();
  const fontIds = new Set();
  for (let k = 0; k < ops.fnArray.length; k++) {
    if (ops.fnArray[k] === pdfjs.OPS.setFont) fontIds.add(ops.argsArray[k][0]);
  }
  const fonts = [];
  for (const id of fontIds) {
    const font = page.commonObjs.has(id) ? page.commonObjs.get(id) : null;
    fonts.push({
      id,
      name: font?.name ?? null,
      embedded: font ? !font.missingFile : false,
    });
  }

  const annotations = [];
  for (const a of await page.getAnnotations({ intent: 'display' })) {
    annotations.push({
      subtype: a.subtype,
      destPage: await resolveDest(a.dest),
      hasDest: a.dest != null,
      url: a.url ?? null,
      unsafeUrl: a.unsafeUrl ?? null,
      action: a.action ?? null,
      actions: a.actions ? Object.keys(a.actions) : [],
      attachment: a.attachment ? true : false,
    });
  }

  pages.push({
    width: x1 - x0,
    height: y1 - y0,
    lines: toLines(content.items),
    fonts,
    annotations,
  });
}

const outline = [];
async function walk(items) {
  for (const item of items ?? []) {
    outline.push({
      title: item.title,
      destPage: await resolveDest(item.dest),
      url: item.url ?? null,
      action: item.action ?? null,
    });
    await walk(item.items);
  }
}
await walk(await doc.getOutline());

const report = {
  pages,
  outline,
  jsActions: await doc.getJSActions(),
  openAction: await doc.getOpenAction(),
  attachments: await doc.getAttachments(),
  // Every ActualText string was matched to exactly one Span marker
  actualTextMismatch:
    actualTexts.length !== 0 || actualTextSpans === 0
      ? actualTexts.length !== 0
      : false,
};

await doc.loadingTask?.destroy?.();
process.stdout.write(JSON.stringify(report));
