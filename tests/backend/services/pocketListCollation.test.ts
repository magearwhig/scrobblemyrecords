import {
  POCKET_SECTION_FOLDS,
  PocketEntrySortFields,
  albumSortKey,
  compareAlbumFields,
  compareArtistFields,
  comparePocketEntries,
  compareVersionFields,
  createPocketCollator,
  discogsSuffixNumbers,
  filingParts,
  filingText,
  numberToWords,
  sectionFor,
  spellLeadingNumber,
  spellNumber,
} from '../../../src/backend/services/pocketList/pocketListCollation';
import { POCKET_SECTION_BUCKETS } from '../../../src/backend/services/pocketList/pocketListTypes';

const collator = createPocketCollator();

let nextRow = 0;
function entry(
  artist: string,
  overrides: Partial<PocketEntrySortFields> & {
    articles?: string[];
    sortName?: string;
  } = {}
): PocketEntrySortFields {
  const { articles, sortName, ...rest } = overrides;
  const { head, tail } = filingParts(sortName ?? artist, articles);
  return {
    section: sectionFor(head),
    head,
    tail,
    collaboration: null,
    suffixes: discogsSuffixNumbers(artist),
    identityKey: artist.toLowerCase(),
    albumSortKey: albumSortKey('Album'),
    albumYear: null,
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

/** Sort [label, sortName] pairs; returns the labels in order */
function sortFiled(pairs: Array<[string, string]>): string[] {
  const entries = pairs.map(([name, sortName]) => ({
    name,
    e: entry(name, { sortName }),
  }));
  entries.sort((a, b) => comparePocketEntries(a.e, b.e, collator));
  return entries.map(x => x.name);
}

const label = (name: string, articles?: string[]) =>
  sectionFor(filingParts(name, articles).head).label;

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

describe('filingText', () => {
  it('drops a leading The, A or An', () => {
    expect(filingText('The Beatles')).toBe('Beatles');
    expect(filingText('the beatles')).toBe('beatles');
    expect(filingText('A Tribe Called Quest')).toBe('Tribe Called Quest');
    expect(filingText('An Horse')).toBe('Horse');
    expect(label('A Tribe Called Quest')).toBe('T');
  });

  it('leaves words that only start like an article', () => {
    expect(filingText('Theatre of Tragedy')).toBe('Theatre of Tragedy');
    expect(filingText('A-ha')).toBe('A-ha');
    expect(filingText('Anthrax')).toBe('Anthrax');
    expect(filingText('Abba')).toBe('Abba');
  });

  it('drops a trailing article in MusicBrainz style', () => {
    expect(filingText('Wedding Present, The')).toBe('Wedding Present');
    expect(filingText('Tribe Called Quest, A')).toBe('Tribe Called Quest');
    expect(filingText('Smiths, the')).toBe('Smiths');
  });

  it('sorts "The Beatles" between "Beach House" and "Beck"', () => {
    expect(sortNames(['Beck', 'The Beatles', 'Beach House'])).toEqual([
      'Beach House',
      'The Beatles',
      'Beck',
    ]);
  });

  it('sorts "The The" as "The" and keeps a bare "The"', () => {
    expect(filingText('The The')).toBe('The');
    expect(filingText('The')).toBe('The');
    expect(label('The The')).toBe('T');
  });

  it('honours a custom article list', () => {
    expect(filingText('A Tribe Called Quest', ['The'])).toBe(
      'A Tribe Called Quest'
    );
    expect(label('A Tribe Called Quest', ['The'])).toBe('A');
  });

  it('strips punctuation before the article', () => {
    expect(filingText('“The Beatles”')).toBe('Beatles”');
    expect(label('“The Beatles”')).toBe('B');
    expect(label("'The Beatles'")).toBe('B');
    expect(filingText('...And You Will Know Us')).toBe('And You Will Know Us');
    expect(label('...And You Will Know Us')).toBe('A');
    expect(filingText('The ...And Friends')).toBe('And Friends');
    expect(filingText('¿Quién?')).toBe('Quién?');
  });

  it('keeps punctuation-only names and files them under #', () => {
    expect(filingText('!!!')).toBe('!!!');
    expect(filingText('+/-')).toBe('+/-');
    expect(label('!!!')).toBe('#');
    expect(label('+/-')).toBe('#');
  });

  it('NFC-normalizes and trims', () => {
    expect(filingText('  Björk ')).toBe('Björk');
  });
});

describe('spelled numbers', () => {
  it.each([
    [0, 'Zero'],
    [7, 'Seven'],
    [13, 'Thirteen'],
    [50, 'Fifty'],
    [99, 'Ninety-Nine'],
    [311, 'Three Hundred Eleven'],
    [808, 'Eight Hundred Eight'],
    [1000, 'One Thousand'],
    [10000, 'Ten Thousand'],
    [1000001, 'One Million One'],
  ])('numberToWords(%d) is %s', (n, words) => {
    expect(numberToWords(n)).toBe(words);
  });

  it.each([
    ['1975', 'Nineteen Seventy-Five'],
    ['1905', 'Nineteen Oh Five'],
    ['1900', 'Nineteen Hundred'],
    ['2000', 'Two Thousand'],
    ['2005', 'Two Thousand Five'],
    ['2012', 'Twenty Twelve'],
    ['1000', 'One Thousand'],
    ['10,000', 'Ten Thousand'],
    ['1,975', 'One Thousand Nine Hundred Seventy-Five'],
    ['007', 'Zero Zero Seven'],
  ])('reads %s as %s', (digits, words) => {
    expect(spellNumber(digits)).toBe(words);
  });

  it('gives up on numbers too large to spell', () => {
    expect(spellNumber('1234567890123456789')).toBeNull();
    expect(spellLeadingNumber('1234567890123456789 Band')).toBe(
      '1234567890123456789 Band'
    );
  });

  it('spells a leading number and separates it from letters', () => {
    expect(spellLeadingNumber('2Pac')).toBe('Two Pac');
    expect(spellLeadingNumber('50 Cent')).toBe('Fifty Cent');
    expect(spellLeadingNumber('10,000 Maniacs')).toBe('Ten Thousand Maniacs');
    expect(spellLeadingNumber('99 Luftballons')).toBe(
      'Ninety-Nine Luftballons'
    );
    expect(spellLeadingNumber('4.0')).toBe('Four.0');
    expect(spellLeadingNumber('Blink-182')).toBe('Blink-182');
  });

  it('files numbered names under their spelled letter', () => {
    expect(label('10,000 Maniacs')).toBe('T');
    expect(label('2Pac')).toBe('T');
    expect(label('The 1975')).toBe('N');
    expect(label('311')).toBe('T');
    expect(label('50 Cent')).toBe('F');
    expect(label('808 State')).toBe('E');
  });
});

describe('filingParts', () => {
  it('splits a person sort name at the first comma', () => {
    expect(filingParts('Smith, Elliott')).toEqual({
      head: 'Smith',
      tail: 'Elliott',
    });
    expect(filingParts('Dylan, Bob')).toEqual({ head: 'Dylan', tail: 'Bob' });
  });

  it('drops trailing articles before splitting', () => {
    expect(filingParts('Wedding Present, The')).toEqual({
      head: 'Wedding Present',
      tail: '',
    });
  });

  it('spells numbers before splitting, so thousands commas never split', () => {
    expect(filingParts('10,000 Maniacs')).toEqual({
      head: 'Ten Thousand Maniacs',
      tail: '',
    });
  });

  it('keeps a name without a comma whole', () => {
    expect(filingParts('Modest Mouse')).toEqual({
      head: 'Modest Mouse',
      tail: '',
    });
    expect(filingParts('!!!')).toEqual({ head: '!!!', tail: '' });
  });

  it('files people by surname and bands by first word', () => {
    expect(
      sortFiled([
        ['Smith Westerns', 'Smith Westerns'],
        ['The Smiths', 'Smiths, The'],
        ['Patti Smith', 'Smith, Patti'],
        ['Elliott Smith', 'Smith, Elliott'],
        ['Modest Mouse', 'Modest Mouse'],
        ['Sleater-Kinney', 'Sleater-Kinney'],
      ])
    ).toEqual([
      'Modest Mouse',
      'Sleater-Kinney',
      'Elliott Smith',
      'Patti Smith',
      'The Smiths',
      'Smith Westerns',
    ]);
  });
});

describe('sectionFor', () => {
  it('has #, A–Z, Other, then Various Artists and Soundtracks', () => {
    expect(POCKET_SECTION_BUCKETS.map(b => b.label)).toEqual([
      '#',
      ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
      'Other',
      'Various Artists',
      'Soundtracks',
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

  it('puts numerals it cannot spell under #', () => {
    expect(label('２ Fullwidth')).toBe('#');
    expect(label('४ Devanagari four')).toBe('#');
    expect(label('Ⅻ Twelve')).toBe('#');
    expect(label('² Superscript')).toBe('#');
    expect(sectionFor('2Pac').id).toBe('sec-num');
  });

  it('never returns Various Artists or Soundtracks for a name', () => {
    for (const name of ['Various', 'Soundtracks', 'क', '!!!', 'Zappa']) {
      expect(['sec-various', 'sec-soundtracks']).not.toContain(
        sectionFor(name).id
      );
    }
  });

  it('uses ASCII anchor ids', () => {
    expect(sectionFor('Beck').id).toBe('sec-b');
    expect(sectionFor('').id).toBe('sec-num');
  });
});

describe('comparePocketEntries', () => {
  it('files spelled numbers among the letters', () => {
    expect(
      sortNames(['Abba', '10,000 Maniacs', '2Pac', '9 Inch', 'Television'])
    ).toEqual(['Abba', '9 Inch', 'Television', '10,000 Maniacs', '2Pac']);
  });

  it("files a collaboration after the first artist's solo records", () => {
    const solo = entry('Lou Reed', { sortName: 'Reed, Lou' });
    const collab = entry('Lou Reed, John Cale', {
      sortName: 'Reed, Lou',
      collaboration: 'John Cale',
    });
    const other = entry('Lou Reed, Metallica', {
      sortName: 'Reed, Lou',
      collaboration: 'Metallica',
    });
    const reeds = entry('The Reeds', { sortName: 'Reeds, The' });
    const sorted = [reeds, other, collab, solo].sort((a, b) =>
      comparePocketEntries(a, b, collator)
    );
    expect(sorted).toEqual([solo, collab, other, reeds]);
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
        sectionFor(filingParts(n).head)
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
      head: 'Girls',
      tail: '',
      collaboration: null,
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

  const groups = () => [
    { sortKey: 'Zen', year: 1990, firstRowId: 'a' },
    { sortKey: 'abbey road', year: null, firstRowId: 'b' },
    { sortKey: 'Abbey Road', year: 1969, firstRowId: 'z' },
    { sortKey: 'Abbey Road', year: 1969, firstRowId: 'c' },
    { sortKey: 'Abbey Road', year: 1987, firstRowId: 'a' },
    { sortKey: 'Help', year: 1965, firstRowId: 'h' },
  ];
  const keys = (list: ReturnType<typeof groups>) =>
    list.map(g => `${g.sortKey}|${g.year}|${g.firstRowId}`);

  it("orders an artist's albums oldest first (unknown last), then title, then rowId", () => {
    const list = groups().sort((a, b) => compareAlbumFields(a, b, collator));
    expect(keys(list)).toEqual([
      'Help|1965|h',
      'Abbey Road|1969|c',
      'Abbey Road|1969|z',
      'Abbey Road|1987|a',
      'Zen|1990|a',
      'abbey road|null|b',
    ]);
  });

  it('orders Various and Soundtracks albums by title, then year, then rowId', () => {
    const list = groups().sort((a, b) =>
      compareAlbumFields(a, b, collator, 'title')
    );
    expect(keys(list)).toEqual([
      'Abbey Road|1969|c',
      'Abbey Road|1969|z',
      'Abbey Road|1987|a',
      'abbey road|null|b',
      'Help|1965|h',
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
      entry('The Beatles', { albumYear: 1965, albumSortKey: 'Help' }),
      entry('Elliott Smith', { sortName: 'Smith, Elliott' }),
      entry('The Smiths', { sortName: 'Smiths, The' }),
      entry('Lou Reed, John Cale', {
        sortName: 'Reed, Lou',
        collaboration: 'John Cale',
      }),
      entry('Lou Reed', { sortName: 'Reed, Lou' }),
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
