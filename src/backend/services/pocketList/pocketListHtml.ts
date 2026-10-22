/**
 * Pocket List HTML print template (pure).
 *
 * Turns a PocketListModel into one self-contained HTML document that headless
 * Chromium prints to a 4 × 8 in PDF. This is a print template, not a React
 * page: inline CSS, `data:` fonts, no scripts, no external URLs. The model
 * decides every printed string; this module only lays out and escapes.
 *
 * See .plan/done/pocket-list-export-plan.md, "Layout Specification".
 */

import * as fs from 'fs';

import { PocketListKind } from '../../../shared/types';

import {
  POCKET_SECTION_BUCKETS,
  PocketBadge,
  PocketListAlbumGroup,
  PocketListArtistBlock,
  PocketListMeta,
  PocketListModel,
  PocketListSection,
  PocketListVersionLine,
  PocketSectionBucket,
} from './pocketListTypes';

/** `@font-face` rules with `data:` URLs, from loadPocketListFonts() */
export interface PocketListFonts {
  css: string;
}

/** Font family name used by the template; distinct from any installed "Noto Sans" */
export const POCKET_FONT_FAMILY = 'Pocket Noto Sans';

/** Album groups with more version lines than this may split across pages */
export const MAX_UNSPLIT_VERSIONS = 6;

/** Fragment id of the A–Z index on page 1 */
export const INDEX_ANCHOR_ID = 'index';

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape text for element content and double-quoted attribute values */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => ESCAPES[ch]);
}

/** NFC, so the PDF text layer matches the input spelling */
function text(value: string): string {
  return escapeHtml(value.normalize('NFC'));
}

/** "Wishlist", "Collection" or "Wishlist + Collection" (wishlist first) */
export function pocketListsLabel(lists: PocketListKind[]): string {
  const parts: string[] = [];
  if (lists.includes('wishlist')) parts.push('Wishlist');
  if (lists.includes('collection')) parts.push('Collection');
  return parts.join(' + ');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** YYYY-MM-DD in the server's local time zone */
export function localIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "4 Oct 2026" in local time; null for a missing or invalid timestamp */
function humanDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "4 Oct 2026, 14:05" in local time */
function humanDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${humanDate(iso)}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Document <title>: "Listenography Pocket List – {lists} – {date}" */
export function pocketListDocumentTitle(meta: PocketListMeta): string {
  const generated = new Date(meta.generatedAt);
  const date = Number.isNaN(generated.getTime())
    ? meta.generatedAt
    : localIsoDate(generated);
  return `Listenography Pocket List – ${pocketListsLabel(meta.lists)} – ${date}`;
}

function badge(b: PocketBadge): string {
  return `<span class="badge badge-${b.tone}">${text(b.text)}</span>`;
}

/** Badges joined by spaces so they stay separate words in the text layer */
function badges(list: PocketBadge[]): string {
  return list.map(badge).join(' ');
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// ---------------------------------------------------------------------------
// Cover (page 1)
// ---------------------------------------------------------------------------

function renderCover(model: PocketListModel): string {
  const { meta } = model;
  const { counts } = meta;
  const lines: string[] = [];

  lines.push(`<p class="cover-title">Listenography Pocket List</p>`);
  lines.push(
    `<p class="cover-lists">${text(pocketListsLabel(meta.lists))}</p>`
  );
  lines.push(
    `<p class="cover-line">Generated ${text(humanDateTime(meta.generatedAt))}</p>`
  );

  const countParts = [
    plural(counts.albums, 'album', 'albums'),
    plural(counts.entries, 'entry', 'entries'),
  ];
  if (meta.lists.includes('collection')) {
    countParts.push(`${counts.owned} owned`);
  }
  if (meta.lists.includes('wishlist')) {
    countParts.push(`${counts.wanted} wanted`);
  }
  lines.push(`<p class="cover-line">${text(countParts.join(' · '))}</p>`);

  if (meta.wantsSummary) {
    lines.push(`<p class="cover-line">${text(meta.wantsSummary)}</p>`);
  }

  const flags = counts.ownedFlags;
  if (
    meta.lists.includes('wishlist') &&
    flags.thisPressing + flags.otherVersion + flags.possibly > 0
  ) {
    lines.push(
      `<p class="cover-line">${text(
        `Owned flags: ${flags.thisPressing} this pressing · ${flags.otherVersion} another version · ${flags.possibly} possibly`
      )}</p>`
    );
  }

  const freshness: string[] = [];
  if (meta.lists.includes('wishlist')) {
    const d = humanDate(meta.wishlistUpdatedAt);
    freshness.push(d ? `Wishlist synced ${d}` : 'Wishlist never synced');
  }
  const cached = humanDate(meta.collectionCachedAt);
  if (cached) {
    freshness.push(`Collection cached ${cached}`);
  } else if (meta.lists.includes('collection')) {
    freshness.push('Collection not cached');
  }
  if (freshness.length > 0) {
    lines.push(`<p class="cover-line">${text(freshness.join(' · '))}</p>`);
  }

  for (const warning of meta.warnings) {
    lines.push(`<p class="cover-warning">${text(warning)}</p>`);
  }

  return `<header class="cover">\n${lines.join('\n')}\n${renderLegend()}\n${renderIndex(model.sections)}\n</header>`;
}

const LEGEND: Array<[PocketBadge, string]> = [
  [{ text: 'OWNED', tone: 'owned' }, 'in your collection (×N copies)'],
  [{ text: 'WANTED', tone: 'wanted' }, 'on your wishlist'],
  [
    { text: 'OWNED: this pressing', tone: 'owned' },
    'you own this exact release',
  ],
  [
    { text: 'OWNED: another version', tone: 'owned' },
    'you own a different pressing',
  ],
  [
    { text: 'Possibly owned', tone: 'possible' },
    'similar album in your collection; check',
  ],
  [
    { text: 'any version', tone: 'neutral' },
    'monitored want, no pressing chosen',
  ],
];

function renderLegend(): string {
  const items = LEGEND.map(
    ([b, meaning]) => `<li>${badge(b)} ${text(meaning)}</li>`
  ).join('\n');
  return `<ul class="legend">\n${items}\n</ul>
<p class="legend-note">${text(
    'Filed like a record store: people by surname, bands by name, a leading “The”, “A” or “An” ignored, numbers spelled out (10,000 Maniacs under T). Albums run oldest to newest. Compilations and soundtracks are at the end, by title. # holds symbols, Other holds non-Latin scripts.'
  )}</p>`;
}

/** Index cells wider than one letter: Various Artists and Soundtracks share the last row */
const INDEX_SPANS: Partial<Record<PocketSectionBucket['id'], number>> = {
  'sec-various': 3,
  'sec-soundtracks': 4,
};

function renderIndex(sections: PocketListSection[]): string {
  const present = new Set(sections.map(s => s.id));
  const cells = POCKET_SECTION_BUCKETS.map(bucket => {
    const span = INDEX_SPANS[bucket.id];
    const wide =
      (bucket.label.length > 1 ? ' cell-wide' : '') +
      (span ? ` cell-span-${span}` : '');
    if (present.has(bucket.id)) {
      return `<a class="cell${wide}" href="#${bucket.id}">${text(bucket.label)}</a>`;
    }
    return `<span class="cell cell-empty${wide}">${text(bucket.label)}</span>`;
  }).join('\n');
  return `<nav class="index" id="${INDEX_ANCHOR_ID}" aria-label="A–Z index">\n${cells}\n</nav>`;
}

// ---------------------------------------------------------------------------
// Sections and artist blocks
// ---------------------------------------------------------------------------

function renderVersion(version: PocketListVersionLine): string {
  const parts: string[] = [];
  if (version.text)
    parts.push(`<span class="ver-text">${text(version.text)}</span>`);
  if (version.badges.length > 0) parts.push(badges(version.badges));
  if (version.credited) {
    parts.push(`<span class="ver-extra">${text(version.credited)}</span>`);
  }
  if (version.note) {
    parts.push(`<span class="ver-extra">${text(version.note)}</span>`);
  }
  if (version.notes) {
    parts.push(`<span class="ver-notes">${text(version.notes)}</span>`);
  }
  return `<div class="ver ver-${version.status}">${parts.join(' ')}</div>`;
}

function renderAlbumLine(album: PocketListAlbumGroup): string {
  const parts = [`<span class="album-title">${text(album.title)}</span>`];
  if (album.year !== null) {
    parts.push(`<span class="album-year">· ${album.year}</span>`);
  }
  if (album.badges.length > 0) parts.push(badges(album.badges));
  return `<div class="album-line">${parts.join(' ')}</div>`;
}

/** One body row of an artist table */
function renderAlbumRow(album: PocketListAlbumGroup): string {
  if (album.versions.length <= MAX_UNSPLIT_VERSIONS) {
    return `<tr class="album"><td>${renderAlbumLine(album)}${album.versions
      .map(renderVersion)
      .join('')}</td></tr>`;
  }
  // Long group: may split across pages. A nested table repeats the album line
  // (in its thead) at the top of each continuation page, under the repeated
  // artist heading.
  const rows = album.versions
    .map(v => `<tr class="ver-row"><td>${renderVersion(v)}</td></tr>`)
    .join('');
  return `<tr class="album album-long"><td><table class="album-table" role="presentation"><thead><tr><td>${renderAlbumLine(
    album
  )}</td></tr></thead><tbody>${rows}</tbody></table></td></tr>`;
}

function renderArtist(block: PocketListArtistBlock): string {
  const disambiguation = block.disambiguation
    ? ` <span class="artist-disambiguation">(${text(block.disambiguation)})</span>`
    : '';
  const heading = `<p class="artist-name">${text(block.displayArtist)}${disambiguation}</p>`;
  const body = block.albums.map(renderAlbumRow).join('\n');
  return `<table class="artist" role="presentation">
<thead><tr><td>${heading}</td></tr></thead>
<tbody>
${body}
</tbody>
</table>`;
}

function renderSection(section: PocketListSection): string {
  return `<section class="letter">
<div class="letter-head"><h2 id="${section.id}">${text(section.label)}</h2><a class="to-index" href="#${INDEX_ANCHOR_ID}">Index ↑</a></div>
${section.artists.map(renderArtist).join('\n')}
</section>`;
}

// ---------------------------------------------------------------------------
// Stylesheet
// ---------------------------------------------------------------------------

const STYLES = `
:root {
  --ink: #000;
  --paper: #fff;
  --dim: #555;
  --faint: #bbb;
  --rule: #999;
  --accent: #b5651d;
  --size-letter: 20pt;
  --size-artist: 13pt;
  --size-album: 12pt;
  --size-line: 10.5pt;
  --size-small: 9pt;
  --cell: 34pt;
  --cell-gap: 2pt;
}
@page { size: 4in 8in; margin: 0.3in 0.25in; }
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  color: var(--ink);
  background: var(--paper);
}
body {
  font-family: '${POCKET_FONT_FAMILY}', 'Noto Sans', sans-serif;
  font-size: var(--size-line);
  line-height: 1.3;
  font-variant-ligatures: none;
  font-kerning: normal;
  hyphens: manual;
  -webkit-hyphens: manual;
  overflow-wrap: anywhere;
  orphans: 2;
  widows: 2;
}
p { margin: 0; }
a { color: var(--ink); text-decoration: none; }

.cover-title { font-size: var(--size-letter); font-weight: 700; line-height: 1.15; margin-bottom: 4pt; }
.cover-lists { font-size: var(--size-album); font-weight: 700; margin-bottom: 4pt; }
.cover-line { font-size: var(--size-small); color: var(--ink); margin-bottom: 2pt; }
.cover-warning { font-size: var(--size-small); font-weight: 700; color: var(--ink); border-left: 2pt solid var(--ink); padding-left: 4pt; margin: 3pt 0; }
.legend { list-style: none; margin: 6pt 0 2pt; padding: 0; font-size: var(--size-small); }
.legend li { margin-bottom: 2pt; }
.legend-note { font-size: var(--size-small); color: var(--dim); margin-bottom: 6pt; }

.index {
  display: grid;
  grid-template-columns: repeat(7, var(--cell));
  grid-auto-rows: var(--cell);
  gap: var(--cell-gap);
  break-inside: avoid-page;
}
.cell {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--cell);
  height: var(--cell);
  border: 1pt solid var(--ink);
  border-radius: 3pt;
  font-size: var(--size-album);
  font-weight: 700;
  color: var(--ink);
  background: var(--paper);
}
.cell-wide { font-size: var(--size-small); }
.cell-span-3 { grid-column: span 3; width: auto; }
.cell-span-4 { grid-column: span 4; width: auto; }
.cell-empty { color: var(--faint); border-color: var(--faint); font-weight: 400; }

.letter { break-before: page; }
.letter-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  border-bottom: 1pt solid var(--ink);
  margin-bottom: 4pt;
  break-after: avoid-page;
  break-inside: avoid-page;
}
h2 { font-size: var(--size-letter); font-weight: 700; margin: 0; line-height: 1.2; }
.to-index { font-size: var(--size-line); color: var(--ink); padding: 4pt 0 4pt 12pt; }

table { border-collapse: collapse; border-spacing: 0; width: 100%; table-layout: fixed; }
td { padding: 0; vertical-align: top; }
thead { display: table-header-group; break-inside: avoid; }
.artist { margin-bottom: 5pt; }
.artist-name {
  font-size: var(--size-artist);
  font-weight: 700;
  padding-top: 3pt;
  break-after: avoid-page;
}
.artist-disambiguation { font-weight: 400; font-size: var(--size-line); color: var(--dim); }
tr { break-inside: avoid; }
tr.album { break-inside: avoid-page; }
tr.album-long { break-inside: auto; }
.album-line {
  font-size: var(--size-album);
  padding-left: 6pt;
  margin-top: 2pt;
  break-after: avoid-page;
  break-inside: avoid;
}
.album-year { color: var(--dim); }
.ver {
  font-size: var(--size-line);
  padding-left: 16pt;
  text-indent: -4pt;
  break-inside: avoid;
}
.ver-text { color: var(--ink); }
.ver-extra { color: var(--dim); }
.ver-notes { color: var(--dim); font-style: italic; }
.badge {
  display: inline-block;
  font-size: var(--size-line);
  line-height: 1.15;
  font-weight: 700;
  text-indent: 0;
  border: 1pt solid var(--ink);
  border-radius: 2pt;
  padding: 0 2pt;
  color: var(--ink);
  background: var(--paper);
}
.badge-wanted { border-color: var(--accent); border-width: 1.5pt; }
.badge-possible { border-style: dashed; font-weight: 400; }
.badge-neutral { border-color: var(--rule); font-weight: 400; }
`;

/**
 * Render the full HTML document.
 *
 * @param model - Built by buildPocketListModel; already sorted and worded
 * @param fonts - `@font-face` CSS with `data:` URLs (see loadPocketListFonts)
 */
export function renderPocketListHtml(
  model: PocketListModel,
  fonts: PocketListFonts
): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${text(pocketListDocumentTitle(model.meta))}</title>
<style>
${fonts.css}
${STYLES}
</style>
</head>
<body>
${renderCover(model)}
${model.sections.map(renderSection).join('\n')}
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Fonts (I/O; called once by the service and cached)
// ---------------------------------------------------------------------------

let cachedFonts: PocketListFonts | null = null;

const FONTSOURCE_PACKAGE = '@fontsource/noto-sans';

/**
 * Build `@font-face` rules for Noto Sans 400 and 700 with every woff2 subset
 * inlined as a base64 `data:` URL. The `unicode-range` of each subset is kept,
 * so Chromium only loads the subsets a document uses (and embeds only the
 * glyphs it draws). Files are located with require.resolve so this works from
 * both `src/` (ts-node, Jest) and `dist/`.
 */
export function loadPocketListFonts(): PocketListFonts {
  if (cachedFonts) return cachedFonts;

  const rules: string[] = [];
  for (const weight of [400, 700]) {
    const cssPath = require.resolve(`${FONTSOURCE_PACKAGE}/${weight}.css`);
    const css = fs.readFileSync(cssPath, 'utf8');
    for (const block of css.match(/@font-face\s*{[^}]*}/g) ?? []) {
      const file = /url\(\.\/files\/([\w.-]+\.woff2)\)/.exec(block)?.[1];
      const range = /unicode-range:\s*([^;]+);/.exec(block)?.[1];
      if (!file || !range) continue;
      const data = fs
        .readFileSync(require.resolve(`${FONTSOURCE_PACKAGE}/files/${file}`))
        .toString('base64');
      rules.push(`@font-face {
  font-family: '${POCKET_FONT_FAMILY}';
  font-style: normal;
  font-weight: ${weight};
  font-display: block;
  src: url(data:font/woff2;base64,${data}) format('woff2');
  unicode-range: ${range.trim()};
}`);
    }
  }
  if (rules.length === 0) {
    throw new Error(`No woff2 font faces found in ${FONTSOURCE_PACKAGE}`);
  }

  cachedFonts = { css: rules.join('\n') };
  return cachedFonts;
}
