/**
 * Renders the tricky-name fixture with real Chromium and inspects the PDF with
 * PDF.js (tests/integration/helpers/inspectPdf.mjs, run as a subprocess
 * because pdfjs-dist is ESM-only).
 *
 * Skipped with a warning when the Playwright Chromium build isn't installed,
 * unless POCKET_LIST_PDF_REQUIRED=1 (CI), in which case it fails.
 */
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';

import {
  loadPocketListFonts,
  renderPocketListHtml,
} from '../../src/backend/services/pocketList/pocketListHtml';
import { ChromiumPdfRenderer } from '../../src/backend/services/pocketList/pocketListPdfRenderer';

import {
  buildPocketListFixture,
  fixtureArtistNames,
  LONG_ARTIST,
  LONG_GROUP_TITLE,
} from './fixtures/pocketListFixture';

const execFileAsync = promisify(execFile);

const REQUIRED = process.env.POCKET_LIST_PDF_REQUIRED === '1';

function chromiumInstalled(): boolean {
  try {
    return fs.existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}

const AVAILABLE = chromiumInstalled();
if (!AVAILABLE && !REQUIRED) {
  console.warn(
    'SKIPPING tests/integration/pocketListPdf.test.ts: Playwright Chromium is not installed. ' +
      'Run `npx playwright install chromium` (CI sets POCKET_LIST_PDF_REQUIRED=1 to make this fail instead).'
  );
}

interface PdfReport {
  pages: Array<{
    width: number;
    height: number;
    lines: string[];
    fonts: Array<{ name: string | null; embedded: boolean }>;
    annotations: Array<{
      subtype: string;
      destPage: number | null;
      hasDest: boolean;
      url: string | null;
      unsafeUrl: string | null;
      action: string | null;
      actions: string[];
      attachment: boolean;
    }>;
  }>;
  outline: Array<{
    title: string;
    destPage: number | null;
    url: string | null;
    action: string | null;
  }>;
  jsActions: unknown;
  openAction: unknown;
  attachments: unknown;
  actualTextMismatch: boolean;
}

interface NodeFonts {
  selector: string;
  text: string;
  fonts: Array<{
    familyName: string;
    postScriptName: string;
    isCustomFont: boolean;
  }>;
}

/** Elements whose direct text children are entries, headings or markers */
const FONT_CHECK_SELECTOR =
  '.artist-name, .artist-disambiguation, .album-title, .album-year, .ver-text, .ver-extra, .badge, h2, .cell, .cover-line, .cover-title';

/**
 * Before page.pdf(): ask Chromium (CDP CSS.getPlatformFontsForNode) which
 * fonts actually drew each node's text. This catches tofu that
 * document.fonts.ready can't.
 */
async function collectPlatformFonts(page: Page): Promise<NodeFonts[]> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', {
    nodeId: root.nodeId,
    selector: FONT_CHECK_SELECTOR,
  });
  const texts = await page.$$eval(FONT_CHECK_SELECTOR, els =>
    els.map(el =>
      Array.from(el.childNodes)
        .filter(n => n.nodeType === 3)
        .map(n => n.textContent ?? '')
        .join('')
    )
  );
  const classes = await page.$$eval(FONT_CHECK_SELECTOR, els =>
    els.map(el => `${el.tagName.toLowerCase()}.${el.className}`)
  );
  expect(texts).toHaveLength(nodeIds.length);

  const result: NodeFonts[] = [];
  for (let i = 0; i < nodeIds.length; i++) {
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', {
      nodeId: nodeIds[i],
    });
    result.push({ selector: classes[i], text: texts[i], fonts });
  }
  await cdp.detach();
  return result;
}

/** Text Noto Sans covers (Latin, Latin-ext, Greek, Cyrillic, Devanagari, punctuation) */
const NOTO_COVERED =
  /^[\s\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Devanagari}\p{Script=Common}\p{Script=Inherited}]*$/u;
/** Common-script symbols Noto Sans does not have, drawn by a system fallback */
const NOT_IN_NOTO = /[★↑]/u;
/**
 * Fonts allowed to draw text: our Noto Sans plus the usual system fallbacks
 * for CJK and symbols on macOS and Linux (CI).
 */
const ALLOWED_FONT =
  /Noto|Hiragino|PingFang|Heiti|Songti|STHeiti|Apple Symbols|Lucida Grande|LucidaGrande|Arial Unicode|Helvetica|Menlo|DejaVu|WenQuanYi|WQY|IPA|Free(Sans|Serif|Mono)|Liberation|Droid|Takao|VL Gothic|Unifont|Symbola/i;
const LAST_RESORT = /last\s*resort/i;

/** Compare extracted and input text ignoring whitespace and compatibility forms */
function compact(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, '');
}

const describeIfBrowser = AVAILABLE || REQUIRED ? describe : describe.skip;

describeIfBrowser('Pocket List PDF (real Chromium)', () => {
  const model = buildPocketListFixture();
  let report: PdfReport;
  let rawPdf: Buffer;
  let platformFonts: NodeFonts[] = [];
  let renderMs = 0;
  let tmpDir: string;

  beforeAll(async () => {
    if (!AVAILABLE) {
      throw new Error(
        'POCKET_LIST_PDF_REQUIRED=1 but Playwright Chromium is not installed (npx playwright install chromium)'
      );
    }
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pocket-list-pdf-'));
    const renderer = new ChromiumPdfRenderer();
    try {
      const html = renderPocketListHtml(model, loadPocketListFonts());
      const started = Date.now();
      rawPdf = await renderer.renderPdf(html, {
        deadline: Date.now() + 60_000,
        beforePdf: async page => {
          platformFonts = await collectPlatformFonts(page);
        },
      });
      renderMs = Date.now() - started;
    } finally {
      await renderer.close();
    }
    const pdfPath = path.join(tmpDir, 'fixture.pdf');
    fs.writeFileSync(pdfPath, rawPdf);
    const { stdout } = await execFileAsync(
      process.execPath,
      [path.join(__dirname, 'helpers', 'inspectPdf.mjs'), pdfPath],
      { maxBuffer: 64 * 1024 * 1024 }
    );
    report = JSON.parse(stdout) as PdfReport;
  }, 90_000);

  afterAll(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('renders in reasonable time and size', () => {
    expect(rawPdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(renderMs).toBeLessThan(60_000);
    expect(rawPdf.length).toBeLessThan(2 * 1024 * 1024);
  });

  it('makes every page 288 × 576 pt', () => {
    expect(report.pages.length).toBeGreaterThan(5);
    for (const page of report.pages) {
      expect(Math.abs(page.width - 288)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(page.height - 576)).toBeLessThanOrEqual(0.5);
    }
  });

  it('extracts every artist name, in order, matching the NFC input', () => {
    expect(report.actualTextMismatch).toBe(false);
    const body = report.pages.slice(1).flatMap(p => p.lines);
    const stream = compact(body.join(''));
    let cursor = 0;
    for (const name of fixtureArtistNames(model)) {
      const at = stream.indexOf(compact(name), cursor);
      expect({ name, found: at >= 0 }).toEqual({ name, found: true });
      cursor = at + 1;
    }

    // Exact (not just compacted) text for names that fit on one line and
    // don't need ActualText shaping
    const lines = new Set(body);
    for (const name of fixtureArtistNames(model)) {
      if (name.length > 30 || /\p{Script=Devanagari}/u.test(name)) continue;
      const nfc = name.normalize('NFC');
      const hit = [...lines].some(l => l === nfc || l.startsWith(`${nfc} (`));
      expect({ name, hit }).toEqual({ name, hit: true });
    }
  });

  it('prints OWNED and WANTED markers as text', () => {
    const text = report.pages
      .slice(1)
      .flatMap(p => p.lines)
      .join('\n');
    expect(text).toMatch(/\bOWNED\b/);
    expect(text).toMatch(/\bWANTED\b/);
    expect(text).toContain('OWNED: another version');
  });

  it('embeds every font, and uses only Noto Sans plus system fallbacks', () => {
    const fonts = report.pages.flatMap(p => p.fonts);
    expect(fonts.length).toBeGreaterThan(0);
    for (const font of fonts) {
      expect({ font: font.name, embedded: font.embedded }).toEqual({
        font: font.name,
        embedded: true,
      });
      const base = (font.name ?? '').replace(/^[A-Z]{6}\+/, '');
      expect({ base, allowed: ALLOWED_FONT.test(base) }).toEqual({
        base,
        allowed: true,
      });
    }
    expect(fonts.some(f => /NotoSans-Regular/.test(f.name ?? ''))).toBe(true);
    expect(fonts.some(f => /NotoSans-Bold/.test(f.name ?? ''))).toBe(true);
  });

  it('draws every glyph with Noto Sans or an allowed fallback (no tofu)', () => {
    expect(platformFonts.length).toBeGreaterThan(100);
    for (const node of platformFonts) {
      if (!node.text.trim()) continue;
      const families = node.fonts.map(f => f.familyName);
      const label = `${node.selector} "${node.text}" → ${families.join(', ')}`;
      expect(node.fonts.length).toBeGreaterThan(0);
      for (const font of node.fonts) {
        expect({
          label,
          lastResort: LAST_RESORT.test(
            `${font.familyName} ${font.postScriptName}`
          ),
        }).toEqual({
          label,
          lastResort: false,
        });
        // familyName can be localized (e.g. "蘋方-簡"), so test the PostScript name too
        const allowed =
          font.isCustomFont ||
          ALLOWED_FONT.test(`${font.familyName} ${font.postScriptName}`);
        expect({ label, allowed }).toEqual({
          label,
          allowed: true,
        });
      }
      if (NOTO_COVERED.test(node.text) && !NOT_IN_NOTO.test(node.text)) {
        expect({
          label,
          onlyNoto: node.fonts.every(f => f.isCustomFont),
        }).toEqual({
          label,
          onlyNoto: true,
        });
      }
    }
  });

  it('links every index cell to the page that starts with its section', () => {
    const indexLinks = report.pages[0].annotations;
    expect(indexLinks).toHaveLength(model.sections.length);
    indexLinks.forEach((link, i) => {
      const section = model.sections[i];
      expect(link.subtype).toBe('Link');
      expect(link.destPage).not.toBeNull();
      const firstLine = report.pages[link.destPage!].lines[0];
      expect({ section: section.label, firstLine }).toEqual({
        section: section.label,
        firstLine: `${section.label} Index ↑`,
      });
    });
    const labels = indexLinks.map(
      l => report.pages[l.destPage!].lines[0].split(' ')[0]
    );
    expect(labels).toEqual(expect.arrayContaining(['#', 'Other']));
  });

  it('links each section back to the index', () => {
    for (const page of report.pages.slice(1)) {
      if (!/ Index ↑$/.test(page.lines[0])) continue;
      expect(page.annotations).toHaveLength(1);
      expect(page.annotations[0].destPage).toBe(0);
    }
  });

  it('has one outline item per non-empty section, landing on its page', () => {
    expect(report.outline.map(o => o.title)).toEqual(
      model.sections.map(s => s.label)
    );
    for (const item of report.outline) {
      expect(item.destPage).not.toBeNull();
      expect(item.url).toBeNull();
      expect(report.pages[item.destPage!].lines[0]).toBe(
        `${item.title} Index ↑`
      );
    }
  });

  it('contains no external actions, scripts or attachments', () => {
    for (const page of report.pages) {
      for (const a of page.annotations) {
        expect(a.subtype).toBe('Link');
        expect(a.hasDest).toBe(true);
        expect(a.url).toBeNull();
        expect(a.unsafeUrl).toBeNull();
        expect(a.action).toBeNull();
        expect(a.actions).toEqual([]);
        expect(a.attachment).toBe(false);
      }
    }
    expect(report.jsActions).toBeFalsy();
    expect(report.openAction).toBeFalsy();
    expect(report.attachments).toBeFalsy();

    const raw = rawPdf.toString('latin1');
    for (const token of [
      '/URI',
      '/JS',
      '/JavaScript',
      '/Launch',
      '/GoToR',
      '/SubmitForm',
      'http',
    ]) {
      expect({ token, found: raw.includes(token) }).toEqual({
        token,
        found: false,
      });
    }
  });

  it('repeats the artist heading at the top of continuation pages', () => {
    const sectionHeads = new Set(model.sections.map(s => `${s.label} Index ↑`));
    const artistNames = new Set(
      fixtureArtistNames(model).map(n => n.normalize('NFC'))
    );
    const longPages: number[] = [];

    report.pages.slice(1).forEach((page, i) => {
      const first = page.lines[0];
      // No page begins with a version line or album line
      const startsWell =
        sectionHeads.has(first) ||
        artistNames.has(first) ||
        [...artistNames].some(n => first.startsWith(`${n} (`));
      expect({ page: i + 1, first, startsWell }).toEqual({
        page: i + 1,
        first,
        startsWell: true,
      });
      if (first === LONG_ARTIST) longPages.push(i + 1);
    });

    // The long block spans several continuation pages
    expect(longPages.length).toBeGreaterThanOrEqual(2);
    // The long album group splits, and its album line repeats under the artist
    const groupContinuations = report.pages.filter(
      p =>
        p.lines[0] === LONG_ARTIST && p.lines[1]?.startsWith(LONG_GROUP_TITLE)
    );
    expect(groupContinuations.length).toBeGreaterThanOrEqual(2);
  });
});
