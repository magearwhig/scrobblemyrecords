/**
 * Pocket List collation: sort keys, A–Z section buckets and the comparators
 * for artist blocks, album groups and version lines. Pure, no I/O.
 * See .plan/done/pocket-list-export-plan.md, "Collation & Grouping Rules".
 *
 * Section buckets come from the sort key's first character (fold table and
 * \p{N} rule), never from the collator, and the section rank is compared
 * first, so the collator can never move an entry out of its section.
 * Code-point tie-breaks use plain `<`, never localeCompare, so the order is
 * total and deterministic.
 */

import { POCKET_SECTION_BUCKETS, PocketSectionBucket } from './pocketListTypes';

/** Leading articles ignored for sorting. Fixed to "The" in the MVP. */
export const POCKET_ARTICLES: readonly string[] = ['The'];

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

const NUM_BUCKET = POCKET_SECTION_BUCKETS[0];
const OTHER_BUCKET = POCKET_SECTION_BUCKETS[POCKET_SECTION_BUCKETS.length - 1];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Artist sort key: NFC and trim, strip leading punctuation, strip one leading
 * article (only if something remains), strip punctuation again; a name made
 * only of punctuation keeps its NFC spelling (and files under "#").
 */
export function artistSortKey(
  name: string,
  articles: readonly string[] = POCKET_ARTICLES
): string {
  const original = name.normalize('NFC').trim();
  let key = original.replace(LEADING_NON_ALNUM, '');
  for (const article of articles) {
    const match = new RegExp(`^${escapeRegExp(article)}\\s+`, 'iu').exec(key);
    if (match && match[0].length < key.length) {
      key = key.slice(match[0].length);
      break;
    }
  }
  key = key.replace(LEADING_NON_ALNUM, '');
  return key || original;
}

/** Album sort key: NFC, trim, leading punctuation stripped; articles kept */
export function albumSortKey(title: string): string {
  const original = title.normalize('NFC').trim();
  return original.replace(LEADING_NON_ALNUM, '') || original;
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

/** What an artist block is sorted by (rules 1–4), from its heading */
export interface PocketArtistSortFields {
  section: PocketSectionBucket;
  /** artistSortKey of the heading spelling */
  sortKey: string;
  /** discogsSuffixNumbers of the block's own credit; [] for local-only blocks */
  suffixes: number[];
  /** null for a block made only of local wants */
  identityKey: string | null;
}

/** Rules 1–4: section rank, sort key (collator, code points), identity */
export function compareArtistFields(
  a: PocketArtistSortFields,
  b: PocketArtistSortFields,
  collator: Intl.Collator
): number {
  return (
    a.section.rank - b.section.rank ||
    compareText(collator, a.sortKey, b.sortKey) ||
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
  /** albumSortKey of the album line title */
  sortKey: string;
  /** Earliest non-null year in the group */
  year: number | null;
  /** Lowest rowId in the group (code points) */
  firstRowId: string;
}

/** Rule 5 on the album line title, then earliest year, then lowest rowId */
export function compareAlbumFields(
  a: PocketAlbumSortFields,
  b: PocketAlbumSortFields,
  collator: Intl.Collator
): number {
  return (
    compareText(collator, a.sortKey, b.sortKey) ||
    compareYears(a.year, b.year) ||
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
}

/**
 * The full nine-rule comparison for flat entries. Total, because rowId is
 * unique. The model applies the same rules per level (blocks, groups,
 * versions) so a block or group is never interleaved with another.
 */
export function comparePocketEntries(
  a: PocketEntrySortFields,
  b: PocketEntrySortFields,
  collator: Intl.Collator
): number {
  return (
    compareArtistFields(a, b, collator) ||
    compareText(collator, a.albumSortKey, b.albumSortKey) ||
    compareVersionFields(a, b)
  );
}
