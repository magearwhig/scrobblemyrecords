/**
 * Pocket List collation: sort keys, A–Z section buckets and the comparators
 * for artist blocks, album groups and version lines. Pure, no I/O.
 * See .plan/done/pocket-list-export-plan.md, "Collation & Grouping Rules",
 * and .plan/done/record-store-filing-plan.md, "Filing rules" (sort names, spelled
 * numbers, head/tail comparison, Various and Soundtracks sections).
 *
 * Section buckets come from the sort key's first character (fold table and
 * \p{N} rule), never from the collator, and the section rank is compared
 * first, so the collator can never move an entry out of its section.
 * Code-point tie-breaks use plain `<`, never localeCompare, so the order is
 * total and deterministic.
 */

import { POCKET_SECTION_BUCKETS, PocketSectionBucket } from './pocketListTypes';

/** Articles ignored for filing, leading ("The Smiths") or trailing ("Smiths, The") */
export const POCKET_ARTICLES: readonly string[] = ['The', 'A', 'An'];

const LEADING_NON_ALNUM = /^[^\p{L}\p{N}]+/u;
const COMBINING_MARKS = /\p{M}/gu;
const LATIN = /^\p{Script=Latin}$/u;
const NUMBER = /^\p{N}$/u;
const LETTER_OR_NUMBER = /^[\p{L}\p{N}]$/u;

/**
 * Latin letters that don't decompose under NFKD. Pinned by unit tests;
 * extend deliberately.
 */
export const POCKET_SECTION_FOLDS: Readonly<Record<string, string>> = {
  Æ: 'A',
  æ: 'A',
  Œ: 'O',
  œ: 'O',
  Ø: 'O',
  ø: 'O',
  Ł: 'L',
  ł: 'L',
  Đ: 'D',
  đ: 'D',
  Ð: 'D',
  ð: 'D',
  Þ: 'T',
  þ: 'T',
  ß: 'S',
  ẞ: 'S',
  Ħ: 'H',
  ħ: 'H',
  Ŧ: 'T',
  ŧ: 'T',
  ı: 'I',
};

function bucketById(id: PocketSectionBucket['id']): PocketSectionBucket {
  return POCKET_SECTION_BUCKETS.find(b => b.id === id) as PocketSectionBucket;
}

const NUM_BUCKET = bucketById('sec-num');
const OTHER_BUCKET = bucketById('sec-other');
export const VARIOUS_BUCKET = bucketById('sec-various');
export const SOUNDTRACKS_BUCKET = bucketById('sec-soundtracks');

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Album sort key: NFC, trim, leading punctuation stripped; articles kept */
export function albumSortKey(title: string): string {
  const original = title.normalize('NFC').trim();
  return original.replace(LEADING_NON_ALNUM, '') || original;
}

const ONES = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
];
const SCALES: Array<[number, string]> = [
  [1e12, 'Trillion'],
  [1e9, 'Billion'],
  [1e6, 'Million'],
  [1e3, 'Thousand'],
];

function underHundred(n: number): string {
  if (n < 20) return ONES[n];
  const tens = TENS[Math.floor(n / 10)];
  return n % 10 === 0 ? tens : `${tens}-${ONES[n % 10]}`;
}

function underThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds === 0) return underHundred(rest);
  const head = `${ONES[hundreds]} Hundred`;
  return rest === 0 ? head : `${head} ${underHundred(rest)}`;
}

/** English cardinal: 10000 → "Ten Thousand"; 0 → "Zero" */
export function numberToWords(n: number): string {
  if (n < 1000) return underThousand(n);
  const parts: string[] = [];
  let rest = n;
  for (const [scale, word] of SCALES) {
    if (rest >= scale) {
      parts.push(`${underThousand(Math.floor(rest / scale))} ${word}`);
      rest %= scale;
    }
  }
  if (rest > 0) parts.push(underThousand(rest));
  return parts.join(' ');
}

/**
 * A number as a record store reads it: four digits from 1100–1999 and
 * 2010–2099 as a year ("Nineteen Seventy-Five"), 2000–2009 as "Two Thousand
 * (N)", leading zeros digit by digit ("007" → "Zero Zero Seven"), else the
 * cardinal ("10,000" → "Ten Thousand"). null when too large to spell.
 */
export function spellNumber(digits: string): string | null {
  const plain = digits.replace(/,/g, '');
  if (plain.length > 1 && plain.startsWith('0')) {
    return Array.from(plain, d => ONES[Number(d)]).join(' ');
  }
  const n = Number(plain);
  if (!Number.isSafeInteger(n) || n >= 1e15) return null;
  if (plain.length === 4 && !digits.includes(',')) {
    const high = Math.floor(n / 100);
    const low = n % 100;
    if ((n >= 1100 && n <= 1999) || (n >= 2010 && n <= 2099)) {
      if (low === 0) return `${underHundred(high)} Hundred`;
      return `${underHundred(high)} ${low < 10 ? `Oh ${ONES[low]}` : underHundred(low)}`;
    }
  }
  return numberToWords(n);
}

/** A leading ASCII number, with optional thousands commas ("10,000") */
const LEADING_NUMBER = /^(\d{1,3}(?:,\d{3})+|\d+)(?![\d,]\d)/;

/** Spell out a leading ASCII number: "2Pac" → "Two Pac", "10,000 Maniacs" → "Ten Thousand Maniacs" */
export function spellLeadingNumber(text: string): string {
  const match = LEADING_NUMBER.exec(text);
  if (!match) return text;
  const words = spellNumber(match[1]);
  if (words === null) return text;
  const rest = text.slice(match[1].length);
  return /^[\p{L}\p{N}]/u.test(rest) ? `${words} ${rest}` : `${words}${rest}`;
}

function stripArticles(text: string, articles: readonly string[]): string {
  let key = text;
  for (const article of articles) {
    const trailing = new RegExp(`,\\s*${escapeRegExp(article)}$`, 'iu').exec(
      key
    );
    if (trailing && trailing.index > 0) {
      key = key.slice(0, trailing.index);
      break;
    }
  }
  for (const article of articles) {
    const leading = new RegExp(`^${escapeRegExp(article)}\\s+`, 'iu').exec(key);
    if (leading && leading[0].length < key.length) {
      key = key.slice(leading[0].length);
      break;
    }
  }
  return key;
}

/**
 * A name or title as filed: NFC and trim, leading punctuation stripped, one
 * trailing (", The") then one leading ("The ") article dropped when
 * something remains, punctuation stripped again, a leading number spelled
 * out. A string made only of punctuation keeps its NFC spelling.
 */
export function filingText(
  name: string,
  articles: readonly string[] = POCKET_ARTICLES
): string {
  const original = name.normalize('NFC').trim();
  let key = original.replace(LEADING_NON_ALNUM, '');
  key = stripArticles(key, articles).replace(LEADING_NON_ALNUM, '');
  key = spellLeadingNumber(key).trim();
  return key || original;
}

/** A sort name split for comparison: head (surname or band name) and tail */
export interface FilingParts {
  /** Up to the first comma: "Smith" of "Smith, Elliott" */
  head: string;
  /** After the first comma, trimmed: "Elliott"; '' when none */
  tail: string;
}

/**
 * Filing parts of a sort name ("Smith, Elliott", "Wedding Present, The",
 * "10,000 Maniacs"). Numbers are spelled and articles dropped before the
 * comma split, so "10,000" never splits.
 */
export function filingParts(
  sortName: string,
  articles: readonly string[] = POCKET_ARTICLES
): FilingParts {
  const key = filingText(sortName, articles);
  const comma = key.indexOf(',');
  if (comma <= 0) return { head: key, tail: '' };
  const head = key.slice(0, comma).trim();
  const tail = key
    .slice(comma + 1)
    .replace(LEADING_NON_ALNUM, '')
    .trim();
  return head ? { head, tail } : { head: key, tail: '' };
}

/**
 * Section bucket of a sort key, from its first character: numbers → "#",
 * Latin letters (accents dropped, fold table applied) → A–Z, punctuation
 * only → "#", anything else → "Other"
 */
export function sectionFor(sortKey: string): PocketSectionBucket {
  const first = Array.from(sortKey)[0];
  if (first === undefined) return NUM_BUCKET;
  if (NUMBER.test(first)) return NUM_BUCKET;
  if (!LETTER_OR_NUMBER.test(first)) return NUM_BUCKET;

  let folded = first;
  const decomposed = first.normalize('NFKD');
  const base = Array.from(decomposed)[0];
  if (base !== undefined && LATIN.test(base)) {
    folded = decomposed.replace(COMBINING_MARKS, '');
  }
  folded = POCKET_SECTION_FOLDS[folded] ?? folded;

  const letter = folded.charAt(0).toUpperCase();
  if (/^[A-Z]$/.test(letter)) {
    return POCKET_SECTION_BUCKETS[letter.charCodeAt(0) - 64];
  }
  return OTHER_BUCKET;
}

/** The one shared collator: base strength, numeric, punctuation ignored */
export function createPocketCollator(): Intl.Collator {
  return new Intl.Collator('en', {
    sensitivity: 'base',
    numeric: true,
    ignorePunctuation: true,
  });
}

/** Exact code-point order with plain `<` */
export function compareCodePoints(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Discogs "(N)" suffix of each joined artist in a raw credit, 0 when absent:
 * "Turnstile (2), Someone" → [2, 0]
 */
export function discogsSuffixNumbers(artistRaw: string): number[] {
  return artistRaw.split(',').map(part => {
    const match = /\((\d+)\)\s*$/.exec(part.trim());
    return match ? Number(match[1]) : 0;
  });
}

function compareNumberLists(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

/** Year ascending, missing last */
export function compareYears(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

/** Collator first, then exact code points */
function compareText(collator: Intl.Collator, a: string, b: string): number {
  return collator.compare(a, b) || compareCodePoints(a, b);
}

/** What an artist block is sorted by, from its filing */
export interface PocketArtistSortFields {
  section: PocketSectionBucket;
  /** filingParts of the sort name in effect */
  head: string;
  tail: string;
  /**
   * Rest of a collaboration credit filed under its first artist
   * ("John Cale" of "Lou Reed, John Cale"); null for a solo credit, which
   * sorts before the artist's collaborations
   */
  collaboration: string | null;
  /** discogsSuffixNumbers of the block's own credit; [] for local-only blocks */
  suffixes: number[];
  /** null for a block made only of local wants */
  identityKey: string | null;
}

/**
 * Section rank, head, tail, solo before collaboration, collaboration text,
 * then identity
 */
export function compareArtistFields(
  a: PocketArtistSortFields,
  b: PocketArtistSortFields,
  collator: Intl.Collator
): number {
  return (
    a.section.rank - b.section.rank ||
    compareText(collator, a.head, b.head) ||
    compareText(collator, a.tail, b.tail) ||
    Number(a.collaboration !== null) - Number(b.collaboration !== null) ||
    compareText(collator, a.collaboration ?? '', b.collaboration ?? '') ||
    compareIdentity(a, b)
  );
}

/**
 * Rule 4: Discogs identities before local-only blocks, then suffix number
 * ascending (unsuffixed first), then identity key code points
 */
function compareIdentity(
  a: PocketArtistSortFields,
  b: PocketArtistSortFields
): number {
  if (a.identityKey === null || b.identityKey === null) {
    if (a.identityKey === b.identityKey) return 0;
    return a.identityKey === null ? 1 : -1;
  }
  return (
    compareNumberLists(a.suffixes, b.suffixes) ||
    compareCodePoints(a.identityKey, b.identityKey)
  );
}

/** What an album group is sorted by within a block */
export interface PocketAlbumSortFields {
  /**
   * albumSortKey of the album line title in an artist's bin; filingText in
   * the Various and Soundtracks sections
   */
  sortKey: string;
  /** Original year: confirmed master year or earliest row year */
  year: number | null;
  /** Lowest rowId in the group (code points) */
  firstRowId: string;
}

/**
 * Album groups: oldest first in an artist's bin ('year'), by title in the
 * Various and Soundtracks sections ('title'); then the other field, then
 * lowest rowId
 */
export function compareAlbumFields(
  a: PocketAlbumSortFields,
  b: PocketAlbumSortFields,
  collator: Intl.Collator,
  order: 'year' | 'title' = 'year'
): number {
  const byYear = compareYears(a.year, b.year);
  const byTitle = compareText(collator, a.sortKey, b.sortKey);
  return (
    (order === 'year' ? byYear || byTitle : byTitle || byYear) ||
    compareCodePoints(a.firstRowId, b.firstRowId)
  );
}

/** What a version line is sorted by within an album group */
export interface PocketVersionSortFields {
  year: number | null;
  status: 'owned' | 'wanted';
  /** Display format string */
  format: string;
  /** Unique */
  rowId: string;
}

/** Rules 6–9: year (missing last), owned before wanted, format, rowId */
export function compareVersionFields(
  a: PocketVersionSortFields,
  b: PocketVersionSortFields
): number {
  return (
    compareYears(a.year, b.year) ||
    (a.status === b.status ? 0 : a.status === 'owned' ? -1 : 1) ||
    compareCodePoints(a.format, b.format) ||
    compareCodePoints(a.rowId, b.rowId)
  );
}

/** One flat entry, carrying every field the full comparison needs */
export interface PocketEntrySortFields
  extends PocketArtistSortFields,
    PocketVersionSortFields {
  albumSortKey: string;
  /** Original year of the entry's album group */
  albumYear: number | null;
}

/**
 * The full comparison for flat entries (artist bins; album order by year).
 * Total, because rowId is unique. The model applies the same rules per level
 * (blocks, groups, versions) so a block or group is never interleaved with
 * another.
 */
export function comparePocketEntries(
  a: PocketEntrySortFields,
  b: PocketEntrySortFields,
  collator: Intl.Collator
): number {
  return (
    compareArtistFields(a, b, collator) ||
    compareYears(a.albumYear, b.albumYear) ||
    compareText(collator, a.albumSortKey, b.albumSortKey) ||
    compareVersionFields(a, b)
  );
}
