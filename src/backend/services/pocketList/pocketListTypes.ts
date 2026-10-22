/**
 * Internal shapes for the Pocket List PDF. Built by pocketListModel.ts from
 * export rows, rendered by pocketListHtml.ts. Not sent to the client.
 * See .plan/done/pocket-list-export-plan.md ("Data Model", "Layout Specification").
 *
 * Every user-visible string the PDF prints for an entry (badges, version
 * text, summaries) is decided by the model, so the HTML template only lays
 * out and escapes.
 */

import {
  ExportCollectionCacheInfo,
  PocketListKind,
} from '../../../shared/types';

export type PocketSectionId =
  | 'sec-num'
  | `sec-${Lowercase<
      | 'A'
      | 'B'
      | 'C'
      | 'D'
      | 'E'
      | 'F'
      | 'G'
      | 'H'
      | 'I'
      | 'J'
      | 'K'
      | 'L'
      | 'M'
      | 'N'
      | 'O'
      | 'P'
      | 'Q'
      | 'R'
      | 'S'
      | 'T'
      | 'U'
      | 'V'
      | 'W'
      | 'X'
      | 'Y'
      | 'Z'
    >}`
  | 'sec-other'
  | 'sec-various'
  | 'sec-soundtracks';

export interface PocketSectionBucket {
  id: PocketSectionId;
  /** "#", "A"…"Z", "Other", "Various Artists", "Soundtracks" */
  label: string;
  /** 0 for "#", 1–26 for A–Z, 27 for Other, 28 Various Artists, 29 Soundtracks */
  rank: number;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/**
 * All 30 buckets in order: #, A–Z, Other, then the title-sorted Various
 * Artists and Soundtracks sections (.plan/done/record-store-filing-plan.md)
 */
export const POCKET_SECTION_BUCKETS: PocketSectionBucket[] = [
  { id: 'sec-num', label: '#', rank: 0 },
  ...LETTERS.map((letter, i) => ({
    id: `sec-${letter.toLowerCase()}` as PocketSectionId,
    label: letter,
    rank: i + 1,
  })),
  { id: 'sec-other', label: 'Other', rank: 27 },
  { id: 'sec-various', label: 'Various Artists', rank: 28 },
  { id: 'sec-soundtracks', label: 'Soundtracks', rank: 29 },
];

/** A text marker drawn as a bordered badge; meaning never relies on color */
export interface PocketBadge {
  /** e.g. "OWNED", "WANTED", "OWNED: another version", "Possibly owned", "any version" */
  text: string;
  /** Styling hint only */
  tone: 'owned' | 'wanted' | 'possible' | 'neutral';
}

export interface PocketListVersionLine {
  /** rowId of the first row this line stands for */
  rowId: string;
  status: 'owned' | 'wanted';
  /**
   * "1994 · Label · Vinyl" (parts per the detail options; non-vinyl formats
   * always shown). Empty string when no part applies.
   */
  text: string;
  /** e.g. OWNED ×2, WANTED, any version, monitored */
  badges: PocketBadge[];
  /** "credited: Artist, Orchestra" when the credit differs from the block heading */
  credited: string | null;
  /**
   * Owned-version note on a wanted line, e.g.
   * "OWNED: another version (1994 · Vinyl) +1 more", or
   * "may be the same as above" for a likely local/Discogs overlap
   */
  note: string | null;
  /** Wishlist free-text notes, cut at ~100 characters with "…" */
  notes: string | null;
}

export interface PocketListAlbumGroup {
  /** Album line title */
  title: string;
  /**
   * Original year: the cached Discogs master year of a confirmed master, or
   * the earliest row year when lower or when no master year is cached
   */
  year: number | null;
  /** Empty when version lines are turned off (format, pressing and notes all off) */
  versions: PocketListVersionLine[];
  /** Owned copies (rows) */
  ownedCount: number;
  /** Wanted rows after overlap collapsing */
  wantedCount: number;
  /** Album-level badges, e.g. "OWNED ×2", "WANTED (2 pressings)", owned-version flag */
  badges: PocketBadge[];
}

export interface PocketListArtistBlock {
  /** null for a block made only of local wants */
  identityKey: string | null;
  displayArtist: string;
  /** e.g. "another artist named Girls · Discogs #5"; null when not needed */
  disambiguation: string | null;
  albums: PocketListAlbumGroup[];
}

export interface PocketListSection {
  id: PocketSectionId;
  label: string;
  artists: PocketListArtistBlock[];
}

export interface PocketListCounts {
  /** Album groups */
  albums: number;
  /** Version lines (or album lines when versions are off) */
  entries: number;
  /** Owned copies (collection rows) */
  owned: number;
  /** Wanted entries after collapsing confident overlaps */
  wanted: number;
  discogsWants: number;
  localWants: number;
  /** Discogs/local overlaps collapsed (certain/confident) */
  overlapsCollapsed: number;
  /** Likely overlaps shown as separate lines */
  overlapsShown: number;
  ownedFlags: {
    thisPressing: number;
    otherVersion: number;
    possibly: number;
  };
}

export interface PocketListMeta {
  /** ISO 8601 UTC */
  generatedAt: string;
  lists: PocketListKind[];
  counts: PocketListCounts;
  /** e.g. "219 wants (206 Discogs + 13 monitored; 1 possible overlap shown)" */
  wantsSummary: string | null;
  /** ISO, from export meta */
  wishlistUpdatedAt: string | null;
  collectionCachedAt: string | null;
  collectionCache: ExportCollectionCacheInfo;
  /**
   * Cover warnings, e.g. "Collection not cached: owned flags unavailable" or
   * "Collection cache incomplete (N of M pages): unflagged wants may still be owned"
   */
  warnings: string[];
}

export interface PocketListModel {
  meta: PocketListMeta;
  /** Only non-empty sections, in bucket order */
  sections: PocketListSection[];
}
