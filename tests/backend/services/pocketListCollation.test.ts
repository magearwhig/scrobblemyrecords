import {
  POCKET_SECTION_FOLDS,
  PocketEntrySortFields,
  albumSortKey,
  artistSortKey,
  compareAlbumFields,
  compareArtistFields,
  comparePocketEntries,
  compareVersionFields,
  createPocketCollator,
  discogsSuffixNumbers,
  sectionFor,
} from '../../../src/backend/services/pocketList/pocketListCollation';
import { POCKET_SECTION_BUCKETS } from '../../../src/backend/services/pocketList/pocketListTypes';

const collator = createPocketCollator();

let nextRow = 0;
function entry(
  artist: string,
  overrides: Partial<PocketEntrySortFields> & { articles?: string[] } = {}
): PocketEntrySortFields {
  const { articles, ...rest } = overrides;
  const sortKey = artistSortKey(artist, articles);
  return {
    section: sectionFor(sortKey),
    sortKey,
    suffixes: discogsSuffixNumbers(artist),
    identityKey: artist.toLowerCase(),
    albumSortKey: albumSortKey('Album'),
    year: null,
    status: 'owned',
    format: 'Vinyl',
    rowId: `row-${String(nextRow++).padStart(4, '0')}`,
    ...rest,
  };
}

/** Sort artist names with the full comparator; returns the names in order */
function sortNames(names: string[], articles?: string[]): string[] {
  const entries = names.map(name => ({
    name,
    e: entry(name, { articles }),
  }));
  entries.sort((a, b) => comparePocketEntries(a.e, b.e, collator));
  return entries.map(x => x.name);
}

const label = (name: string, articles?: string[]) =>
  sectionFor(artistSortKey(name, articles)).label;

/** Deterministic shuffle */
function shuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe('artistSortKey', () => {
  it('ignores a leading "The" only', () => {
    expect(artistSortKey('The Beatles')).toBe('Beatles');
    expect(artistSortKey('the beatles')).toBe('beatles');
    expect(artistSortKey('Theatre of Tragedy')).toBe('Theatre of Tragedy');
    expect(artistSortKey('A Tribe Called Quest')).toBe('A Tribe Called Quest');
  });

  it('sorts "The Beatles" between "Beach House" and "Beck"', () => {
    expect(sortNames(['Beck', 'The Beatles', 'Beach House'])).toEqual([
      'Beach House',
      'The Beatles',
      'Beck',
    ]);
  });

  it('sorts "The The" as "The" and keeps a bare "The"', () => {
    expect(artistSortKey('The The')).toBe('The');
    expect(artistSortKey('The')).toBe('The');
    expect(label('The The')).toBe('T');
  });

  it('files "A Tribe Called Quest" under A, or T when "A" is an article', () => {
    expect(label('A Tribe Called Quest')).toBe('A');
    expect(artistSortKey('A Tribe Called Quest', ['The', 'A'])).toBe(
      'Tribe Called Quest'
    );
    expect(label('A Tribe Called Quest', ['The', 'A'])).toBe('T');
  });

  it('strips punctuation before the article', () => {
    expect(artistSortKey('“The Beatles”')).toBe('Beatles”');
    expect(label('“The Beatles”')).toBe('B');
    expect(label("'The Beatles'")).toBe('B');
    expect(artistSortKey('...And You Will Know Us')).toBe(
      'And You Will Know Us'
    );
    expect(label('...And You Will Know Us')).toBe('A');
    expect(artistSortKey('The ...And Friends')).toBe('And Friends');
    expect(artistSortKey('¿Quién?')).toBe('Quién?');
  });

  it('keeps punctuation-only names and files them under #', () => {
    expect(artistSortKey('!!!')).toBe('!!!');
    expect(artistSortKey('+/-')).toBe('+/-');
    expect(label('!!!')).toBe('#');
    expect(label('+/-')).toBe('#');
  });

  it('NFC-normalizes and trims', () => {
    expect(artistSortKey('  Björk ')).toBe('Björk');
  });

  it('sorts comma-joined credits by the full string and leaves Various under V', () => {
    expect(artistSortKey('Miles Davis, John Coltrane')).toBe(
      'Miles Davis, John Coltrane'
    );
    expect(label('Various')).toBe('V');
  });
});

describe('albumSortKey', () => {
  it('strips leading punctuation but keeps articles', () => {
    expect(albumSortKey('"The Wall"')).toBe('The Wall"');
    expect(albumSortKey('  A Love Supreme')).toBe('A Love Supreme');
    expect(albumSortKey('...')).toBe('...');
  });
});

describe('sectionFor', () => {
  it('has exactly #, A–Z and Other, with no "Other scripts" bucket', () => {
    expect(POCKET_SECTION_BUCKETS.map(b => b.label)).toEqual([
      '#',
      ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
      'Other',
    ]);
    expect(POCKET_SECTION_BUCKETS.map(b => b.rank)).toEqual(
      POCKET_SECTION_BUCKETS.map((_, i) => i)
    );
  });

  it('drops Latin accents', () => {
    expect(label('Björk')).toBe('B');
    expect(label('Émilie Simon')).toBe('E');
    expect(label('Ólafur Arnalds')).toBe('O');
    expect(label('Émilie (decomposed)')).toBe('E');
    expect(label('İbrahim')).toBe('I');
  });

  it.each([
    ['Æ', 'A'],
    ['æ', 'A'],
    ['Œ', 'O'],
    ['œ', 'O'],
    ['Ø', 'O'],
    ['ø', 'O'],
    ['Ł', 'L'],
    ['ł', 'L'],
    ['Đ', 'D'],
    ['đ', 'D'],
    ['Ð', 'D'],
    ['ð', 'D'],
    ['Þ', 'T'],
    ['þ', 'T'],
    ['ß', 'S'],
    ['ẞ', 'S'],
    ['Ħ', 'H'],
    ['ħ', 'H'],
    ['Ŧ', 'T'],
    ['ŧ', 'T'],
    ['ı', 'I'],
  ])('folds %s to %s', (letter, expected) => {
    expect(POCKET_SECTION_FOLDS[letter]).toBe(expected);
    expect(sectionFor(`${letter}xyz`).label).toBe(expected);
  });

  it('pins the whole fold table', () => {
    expect(Object.keys(POCKET_SECTION_FOLDS).sort()).toEqual(
      [
        'Æ',
        'æ',
        'Œ',
        'œ',
        'Ø',
        'ø',
        'Ł',
        'ł',
        'Đ',
        'đ',
        'Ð',
        'ð',
        'Þ',
        'þ',
        'ß',
        'ẞ',
        'Ħ',
        'ħ',
        'Ŧ',
        'ŧ',
        'ı',
      ].sort()
    );
  });

  it('files "Æther" under A but sorts it as "AE"', () => {
    expect(label('Æther')).toBe('A');
    expect(sortNames(['Aftermath', 'Æther', 'Adele'])).toEqual([
      'Adele',
      'Æther',
      'Aftermath',
    ]);
  });

  it('puts non-Latin scripts and unmapped Latin letters in Other', () => {
    expect(label('कबीर')).toBe('Other'); // Devanagari
    expect(label('坂本龍一')).toBe('Other'); // CJK
    expect(label('あい')).toBe('Other'); // Hiragana
    expect(label('Αλφα')).toBe('Other'); // Greek
    expect(label('Ɔkay')).toBe('Other'); // Ɔ, unmapped Latin
    expect(sectionFor('क').id).toBe('sec-other');
  });

  it('puts any Unicode number first under #', () => {
    expect(label('2Pac')).toBe('#');
    expect(label('２ Fullwidth')).toBe('#');
    expect(label('४ Devanagari four')).toBe('#');
    expect(label('Ⅻ Twelve')).toBe('#');
    expect(label('² Superscript')).toBe('#');
    expect(sectionFor('2Pac').id).toBe('sec-num');
  });

  it('uses ASCII anchor ids', () => {
    expect(sectionFor('Beck').id).toBe('sec-b');
    expect(sectionFor('').id).toBe('sec-num');
  });
});

describe('comparePocketEntries', () => {
  it('orders numbers numerically under #, which comes first', () => {
    expect(sortNames(['Abba', '10,000 Maniacs', '2Pac', '9 Inch'])).toEqual([
      '2Pac',
      '9 Inch',
      '10,000 Maniacs',
      'Abba',
    ]);
  });

  it('puts Other after Z', () => {
    expect(sortNames(['कबीर', 'ZZ Top', 'Abba', '!!!'])).toEqual([
      '!!!',
      'Abba',
      'ZZ Top',
      'कबीर',
    ]);
  });

  it('never orders an entry outside its section', () => {
    const names = [
      '!!!',
      '+/-',
      '2Pac',
      '10,000 Maniacs',
      '２ Fullwidth',
      'Ⅻ',
      'Abba',
      'Æther',
      'AEther',
      'AC/DC',
      'ACDC',
      'The Beatles',
      'Björk',
      'Łona',
      'Øyvind',
      'Straße',
      'Þorgeir',
      'Zappa',
      'क',
      '春',
      'Ɔkay',
      '...And You Will Know Us',
    ];
    for (const seed of [1, 2, 3, 4, 5]) {
      const sorted = sortNames(shuffle(names, seed)).map(n =>
        sectionFor(artistSortKey(n))
      );
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].rank).toBeGreaterThanOrEqual(sorted[i - 1].rank);
      }
    }
  });

  it('breaks collator ties by code point', () => {
    expect(collator.compare('AC/DC', 'ACDC')).toBe(0);
    expect(sortNames(['ACDC', 'AC/DC'])).toEqual(['AC/DC', 'ACDC']);
    expect(sortNames(['Æther', 'AEther'])).toEqual(['AEther', 'Æther']);
    expect(sortNames(['bjork', 'Björk', 'Bjork'])).toEqual([
      'Bjork',
      'Björk',
      'bjork',
    ]);
  });

  it('orders same-name identities unsuffixed, (2), (3), local-only last', () => {
    const fields = (identityKey: string | null, suffixes: number[]) => ({
      section: sectionFor('Girls'),
      sortKey: 'Girls',
      suffixes,
      identityKey,
    });
    const blocks = [
      fields(null, []),
      fields('girls#3', [3]),
      fields('girls', [0]),
      fields('girls#2', [2]),
    ];
    blocks.sort((a, b) => compareArtistFields(a, b, collator));
    expect(blocks.map(b => b.identityKey)).toEqual([
      'girls',
      'girls#2',
      'girls#3',
      null,
    ]);
  });

  it('parses Discogs suffixes per joined artist', () => {
    expect(discogsSuffixNumbers('Girls (5)')).toEqual([5]);
    expect(discogsSuffixNumbers('Turnstile (2), Someone')).toEqual([2, 0]);
    expect(discogsSuffixNumbers('Girls')).toEqual([0]);
  });

  it('orders album groups by title, then earliest year, then lowest rowId', () => {
    const groups = [
      { sortKey: 'Zen', year: 1990, firstRowId: 'a' },
      { sortKey: 'abbey road', year: null, firstRowId: 'b' },
      { sortKey: 'Abbey Road', year: 1969, firstRowId: 'z' },
      { sortKey: 'Abbey Road', year: 1969, firstRowId: 'c' },
      { sortKey: 'Abbey Road', year: 1987, firstRowId: 'a' },
    ];
    groups.sort((a, b) => compareAlbumFields(a, b, collator));
    expect(groups.map(g => `${g.sortKey}|${g.year}|${g.firstRowId}`)).toEqual([
      'Abbey Road|1969|c',
      'Abbey Road|1969|z',
      'Abbey Road|1987|a',
      'abbey road|null|b',
      'Zen|1990|a',
    ]);
  });

  it('orders version lines by year (missing last), owned first, format, rowId', () => {
    const lines = [
      { year: null, status: 'owned' as const, format: 'Vinyl', rowId: 'a' },
      { year: 1994, status: 'wanted' as const, format: 'Vinyl', rowId: 'b' },
      { year: 1994, status: 'owned' as const, format: 'Vinyl', rowId: 'c' },
      { year: 1994, status: 'owned' as const, format: 'CD', rowId: 'd' },
      { year: 1980, status: 'wanted' as const, format: 'Vinyl', rowId: 'e' },
      { year: 1994, status: 'owned' as const, format: 'CD', rowId: 'a2' },
    ];
    lines.sort(compareVersionFields);
    expect(lines.map(l => l.rowId)).toEqual(['e', 'a2', 'd', 'c', 'b', 'a']);
  });

  it('is total and gives identical output for shuffled input', () => {
    const base = [
      entry('The Beatles', { year: 1969 }),
      entry('The Beatles', { year: 1969, status: 'wanted' }),
      entry('Beatles', { year: null }),
      entry('AC/DC'),
      entry('ACDC'),
      entry('Æther'),
      entry('AEther'),
      entry('Girls'),
      entry('Girls (2)'),
      entry('Girls (3)'),
      entry('2Pac'),
      entry('10,000 Maniacs'),
      entry('क'),
      entry('春'),
      entry('!!!'),
      entry('Abba', { albumSortKey: 'Arrival' }),
      entry('Abba', { albumSortKey: 'arrival', format: 'CD' }),
    ];
    const reference = [...base]
      .sort((a, b) => comparePocketEntries(a, b, collator))
      .map(e => e.rowId);
    for (const seed of [7, 11, 13, 17]) {
      const sorted = shuffle(base, seed)
        .sort((a, b) => comparePocketEntries(a, b, collator))
        .map(e => e.rowId);
      expect(sorted).toEqual(reference);
    }
    for (const a of base) {
      for (const b of base) {
        const ab = comparePocketEntries(a, b, collator);
        const ba = comparePocketEntries(b, a, collator);
        expect(Math.sign(ab) + Math.sign(ba)).toBe(0);
        if (a !== b) expect(ab).not.toBe(0);
      }
    }
  });
});
