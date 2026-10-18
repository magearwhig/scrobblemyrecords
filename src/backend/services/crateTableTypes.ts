/**
 * Internal data shapes shared by the Smart Crates engine
 * (crateAlbumTable, crateEvaluator, crateService, crateSuggestionService).
 * Not sent to the client. See .plan/smart-crates-plan.md sections 5 and 7.
 */

import { CrateCoverage } from '../../shared/types';
import { ReleaseRuntime } from '../../shared/utils/releaseRuntime';

/** One owned release (collection entries deduped by release ID) */
export interface CrateTableCopy {
  releaseId: number;
  masterId?: number;
  artist: string;
  title: string;
  /** Pressing year; undefined when missing or 0 */
  year?: number;
  format: string[];
  /** Earliest date_added among the entries with this release ID (ISO) */
  dateAdded: string;
  /** ms of dateAdded */
  dateAddedMs: number;
  /** Discogs rating 1-5; undefined when 0 or missing */
  rating?: number;
  /** Number of collection entries with this release ID */
  copyCount: number;
  coverUrl?: string;
  inDiscardPile: boolean;
  /** Artist name after the artist alias resolver */
  resolvedArtist: string;
}

/** Listening data attributed to an album (plan section 5.3) */
export interface CrateTableListening {
  scrobbleCount: number;
  /** seconds; null when none recorded */
  lastPlayed: number | null;
  /** Sorted ascending, seconds */
  playTimestamps: number[];
  matchType: 'exact' | 'fuzzy' | 'none';
  matchedKeys: string[];
}

/** One album: owned copies grouped by the album canonicalizer key */
export interface CrateTableAlbum {
  albumKey: string;
  /** Display copy: earliest dateAdded, then lowest release ID */
  artist: string;
  album: string;
  coverUrl?: string;
  /** Sorted by dateAddedMs, then releaseId */
  copies: CrateTableCopy[];
  firstAddedMs: number;
  latestAddedMs: number;
  listening: CrateTableListening;
  /**
   * 1-based rank by scrobbleCount among all owned albums with at least one
   * scrobble (ties share a rank); undefined when the album has none.
   */
  scrobbleRank?: number;
}

/** Genre/style/runtime of a release, from its release-details cache file */
export interface CrateReleaseFacts {
  /** undefined when the details file is missing or has no genres */
  genres?: string[];
  styles?: string[];
  /** undefined when the details file is missing */
  runtime?: ReleaseRuntime;
}

export interface CrateAlbumTable {
  albums: CrateTableAlbum[];
  /** Albums with scrobbleRank set (denominator for "#37 of 1,150") */
  rankedAlbumCount: number;
  /** Owned albums, for topPercent */
  totalAlbums: number;
  totalReleases: number;
  hasHistory: boolean;
  /** seconds */
  historyFrom: number | null;
  /** ms */
  newestScrobbleAt: number | null;
  /** ms */
  lastSyncCompletedAt: number | null;
  collection: CrateCoverage['collection'];
  /** Fingerprint of the inputs the table was built from */
  fingerprint: string;
  builtAt: number;
}

/** Everything the pure evaluator needs besides the crate itself */
export interface CrateEvalContext {
  table: CrateAlbumTable;
  /** Facts per release ID; absent IDs are treated as "details not fetched" */
  facts: Map<number, CrateReleaseFacts>;
  /** Artist alias resolver (identity when not ready) */
  resolveArtist: (name: string) => string;
  now: Date;
}
