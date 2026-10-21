import {
  escapeHtml,
  loadPocketListFonts,
  MAX_UNSPLIT_VERSIONS,
  pocketListDocumentTitle,
  renderPocketListHtml,
} from '../../src/backend/services/pocketList/pocketListHtml';
import { POCKET_SECTION_BUCKETS } from '../../src/backend/services/pocketList/pocketListTypes';
import {
  buildPocketListFixture,
  LONG_ARTIST,
  LONG_GROUP_TITLE,
} from '../integration/fixtures/pocketListFixture';

const NO_FONTS = { css: '' };

describe('pocketListHtml', () => {
  const model = buildPocketListFixture();
  const html = renderPocketListHtml(model, NO_FONTS);

  it('escapes <, &, and quotes in names', () => {
    expect(escapeHtml(`a<b>&"c'`)).toBe('a&lt;b&gt;&amp;&quot;c&#39;');
    expect(html).toContain('Muse &amp; &lt;Friends&gt; &quot;Quoted&quot;');
    expect(html).toContain('Rock &amp; Roll&#39;s &lt;Greatest&gt;');
    expect(html).not.toContain('<Friends>');
    expect(html).not.toContain('<Greatest>');
  });

  it('has no scripts, no http(s) URLs and no non-data sources', () => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/https?:/i);
    expect(html).not.toMatch(/\bsrc\s*=\s*["']?(?!data:)/i);
    expect(html).not.toMatch(/url\(\s*["']?(?!data:)/i);
    expect(html).not.toMatch(/\son\w+\s*=/i);
  });

  it('renders one h2 per section and an index that links only to existing sections', () => {
    const h2Ids = [...html.matchAll(/<h2 id="([^"]+)">/g)].map(m => m[1]);
    expect(h2Ids).toEqual(model.sections.map(s => s.id));

    const links = [
      ...html.matchAll(/<a class="cell[^"]*" href="#([^"]+)"/g),
    ].map(m => m[1]);
    expect(links).toEqual(model.sections.map(s => s.id));
    for (const link of links) expect(h2Ids).toContain(link);

    const present = new Set<string>(model.sections.map(s => s.id));
    const empty = POCKET_SECTION_BUCKETS.filter(b => !present.has(b.id));
    expect(empty.length).toBeGreaterThan(0);
    const emptyCells = [
      ...html.matchAll(/<span class="cell cell-empty[^"]*">([^<]+)<\/span>/g),
    ].map(m => m[1]);
    expect(emptyCells).toEqual(empty.map(b => b.label));
    expect(links.length + emptyCells.length).toBe(28);
  });

  it('gives every section an Index link back to the index', () => {
    expect(html).toContain('<nav class="index" id="index"');
    const back = html.match(/<a class="to-index" href="#index">Index ↑<\/a>/g);
    expect(back).toHaveLength(model.sections.length);
  });

  it('puts each artist heading in a thead, not a heading element', () => {
    const tables = html.match(/<table class="artist" role="presentation">/g);
    const artistCount = model.sections.reduce(
      (n, s) => n + s.artists.length,
      0
    );
    expect(tables).toHaveLength(artistCount);
    expect(html).toContain(
      `<thead><tr><td><p class="artist-name">${LONG_ARTIST}</p></td></tr></thead>`
    );
    expect(html).not.toMatch(/<h[13-6][\s>]/);
  });

  it('gives long album groups a nested thead that repeats the album line', () => {
    const longGroup = model.sections
      .flatMap(s => s.artists)
      .flatMap(a => a.albums)
      .find(g => g.title === LONG_GROUP_TITLE);
    expect(longGroup!.versions.length).toBeGreaterThan(MAX_UNSPLIT_VERSIONS);
    expect(html).toContain(
      `<tr class="album album-long"><td><table class="album-table" role="presentation"><thead><tr><td><div class="album-line"><span class="album-title">${LONG_GROUP_TITLE}</span>`
    );
    // Short groups are a single unsplittable row
    expect(html).toContain('<tr class="album"><td><div class="album-line">');
  });

  it('prints markers as real text, not CSS content', () => {
    expect(html).toContain('<span class="badge badge-owned">OWNED</span>');
    expect(html).toContain('<span class="badge badge-wanted">WANTED</span>');
    expect(html).not.toMatch(/(^|[\s;{])content\s*:/m);
  });

  it('shows the disambiguation tag for a second artist with the same name', () => {
    expect(html).toContain(
      '<span class="artist-disambiguation">(another artist named Girls · Discogs #2)</span>'
    );
  });

  it('sets the page box, ligatures and hyphenation rules', () => {
    expect(html).toContain('@page { size: 4in 8in; margin: 0.3in 0.25in; }');
    expect(html).toContain('font-variant-ligatures: none');
    expect(html).toContain('hyphens: manual');
  });

  it('titles the document with lists and local date', () => {
    const title = pocketListDocumentTitle(model.meta);
    expect(title).toMatch(
      /^Listenography Pocket List – Wishlist \+ Collection – \d{4}-\d{2}-\d{2}$/
    );
    expect(html).toContain(`<title>${title}</title>`);
    expect(
      pocketListDocumentTitle({ ...model.meta, lists: ['collection'] })
    ).toContain('– Collection –');
  });

  it('shows cover counts, freshness and warnings', () => {
    const withWarning = renderPocketListHtml(
      {
        ...model,
        meta: {
          ...model.meta,
          warnings: ['Collection cache incomplete (3 of 24 pages)'],
        },
      },
      NO_FONTS
    );
    expect(withWarning).toContain('Listenography Pocket List');
    expect(withWarning).toContain('Wishlist synced 4 Oct 2026');
    expect(withWarning).toContain('Collection cached 11 Oct 2026');
    expect(withWarning).toContain(
      '<p class="cover-warning">Collection cache incomplete (3 of 24 pages)</p>'
    );
    expect(withWarning).toContain(model.meta.wantsSummary!);
  });

  it('normalizes text to NFC', () => {
    const decomposed = 'Björk';
    const out = renderPocketListHtml(
      {
        ...model,
        sections: [
          {
            id: 'sec-b',
            label: 'B',
            artists: [
              {
                identityKey: 'bjork',
                displayArtist: decomposed,
                disambiguation: null,
                albums: [
                  {
                    title: 'Post',
                    year: null,
                    versions: [],
                    ownedCount: 1,
                    wantedCount: 0,
                    badges: [{ text: 'OWNED', tone: 'owned' }],
                  },
                ],
              },
            ],
          },
        ],
      },
      NO_FONTS
    );
    expect(out).toContain('Björk');
    expect(out).not.toContain(decomposed);
    // Album-level badges show when version lines are off
    expect(out).toContain(
      '<span class="album-title">Post</span> <span class="badge badge-owned">OWNED</span>'
    );
  });

  it('inlines Noto Sans 400 and 700 as data: fonts', () => {
    const fonts = loadPocketListFonts();
    expect(fonts.css).toMatch(/font-weight: 400/);
    expect(fonts.css).toMatch(/font-weight: 700/);
    expect(fonts.css).toContain('src: url(data:font/woff2;base64,');
    expect(fonts.css).not.toContain('./files/');
    expect(fonts.css).toMatch(/unicode-range: U\+0900-097F/); // Devanagari
    expect(loadPocketListFonts()).toBe(fonts); // cached

    const full = renderPocketListHtml(model, fonts);
    expect(full).not.toMatch(/url\(\s*["']?(?!data:)/i);
  });
});
