/**
 * Record-store filing rules: name keys, Various detection, collaboration
 * splitting and the sort name in effect for an artist credit. Pure, no I/O;
 * shared by the Pocket List model and the filing routes.
 * See .plan/done/record-store-filing-plan.md, "Filing rules" and "Keys".
 */

import {
  ArtistFilingCacheEntry,
  ArtistFilingOverride,
  ArtistFilingSource,
} from '../../../shared/types';
import { stripDiscogsSuffixes } from '../../../shared/utils/albumMapping';

/** Release styles that put a Various release in the Soundtracks section */
export const SOUNDTRACK_STYLES: ReadonlySet<string> = new Set([
  'Soundtrack',
  'Score',
  'Video Game Music',
]);

/** Retry not-found and ambiguous MusicBrainz results after this long */
export const FILING_RETRY_MS = 30 * 24 * 60 * 60 * 1000;

/** Everything the filing rules read; loaded once per export */
export interface FilingSnapshot {
  /** MusicBrainz results by filingNameKey */
  artists: Record<string, ArtistFilingCacheEntry>;
  /** User overrides by key */
  overrides: Map<string, ArtistFilingOverride>;
  /** Discogs master years by master id */
  masterYears: Record<string, { year: number | null }>;
}

export const EMPTY_FILING_SNAPSHOT: FilingSnapshot = {
  artists: {},
  overrides: new Map(),
  masterYears: {},
};

/**
 * Key for one artist name or credit: NFC, Discogs "(N)" suffixes stripped,
 * curly apostrophes made straight, Unicode hyphens and dashes made ASCII
 * (MusicBrainz writes "Run‐DMC" with U+2010), " & " read as " and ",
 * whitespace collapsed, lowercased. Keeps "The" and other punctuation, so
 * "The The" and "Tyler, The Creator" stay distinct. Two Discogs artists with
 * one name share a key.
 */
export function filingNameKey(name: string): string {
  return stripDiscogsSuffixes(name.normalize('NFC'))
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/ & /g, ' and ');
}

/** Discogs "Various", Last.fm "Various Artists" */
export function isVariousCredit(artist: string): boolean {
  const key = filingNameKey(artist);
  return key === 'various' || key === 'various artists';
}

/**
 * Artists of a Discogs credit. The collection cache joins artists with ", ",
 * so "&" and "and" are always inside one name and never split.
 */
export function creditParts(credit: string): string[] {
  return stripDiscogsSuffixes(credit)
    .split(', ')
    .map(part => part.trim())
    .filter(Boolean);
}

/** The sort name in effect for one artist credit */
export interface ResolvedArtistFiling {
  /** e.g. "Smith, Elliott"; the credit itself under 'default' */
  sortName: string;
  source: ArtistFilingSource;
  /** First artist a collaboration files under; null for a solo credit */
  filedAs: string | null;
  /** Rest of a collaboration credit; null for a solo credit */
  collaboration: string | null;
}

function filingForName(
  name: string,
  snapshot: FilingSnapshot
): { sortName: string; source: ArtistFilingSource } | null {
  const key = filingNameKey(name);
  const override = snapshot.overrides.get(key);
  if (override && override.fileUnder.trim()) {
    return { sortName: override.fileUnder.trim(), source: 'override' };
  }
  const entry = snapshot.artists[key];
  if (entry?.status === 'found') {
    return { sortName: entry.sortName, source: 'musicbrainz' };
  }
  return null;
}

/**
 * Override, then MusicBrainz, for the whole credit. A credit of several
 * artists whose whole-credit lookup came back not-found files under its
 * first artist: that artist's override or MusicBrainz sort name, else its
 * own name ('default'). Any other credit without a filing is its own sort
 * name ('default').
 */
export function resolveArtistFiling(
  credit: string,
  snapshot: FilingSnapshot
): ResolvedArtistFiling {
  const display = stripDiscogsSuffixes(credit).trim();
  const whole = filingForName(display, snapshot);
  if (whole) return { ...whole, filedAs: null, collaboration: null };

  const parts = creditParts(display);
  const wholeEntry = snapshot.artists[filingNameKey(display)];
  if (parts.length > 1 && wholeEntry?.status === 'not-found') {
    const first = filingForName(parts[0], snapshot) ?? {
      sortName: parts[0],
      source: 'default' as const,
    };
    return {
      ...first,
      filedAs: parts[0],
      collaboration: parts.slice(1).join(', '),
    };
  }
  return {
    sortName: display,
    source: 'default',
    filedAs: null,
    collaboration: null,
  };
}

/** Cached Discogs master year, or null */
export function masterYearOf(
  masterId: number,
  snapshot: FilingSnapshot
): number | null {
  return snapshot.masterYears[String(masterId)]?.year ?? null;
}

/**
 * True when a cached MusicBrainz result should be fetched again: missing,
 * a not-found/ambiguous result older than FILING_RETRY_MS, or a result
 * based on a tracker mbid that has since changed
 */
export function isFilingEntryDue(
  entry: ArtistFilingCacheEntry | undefined,
  trackerMbid: string | null | undefined,
  now: number
): boolean {
  if (!entry) return true;
  if (entry.status === 'found') {
    return entry.via === 'mbid-map' && trackerMbid !== entry.mbid;
  }
  if (entry.status === 'none') return trackerMbid !== null;
  return now - entry.fetchedAt >= FILING_RETRY_MS;
}
