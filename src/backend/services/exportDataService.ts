/**
 * Export Data Service - the shared, read-only data layer behind data exports
 * and the Pocket List (Backlog #9).
 *
 * Turns the cached collection, Discogs wants and local wants into complete,
 * documented rows (see ExportCollectionRow / ExportWishlistRow) and works out
 * whether each want is already owned. Everything comes from local caches: no
 * API calls, no writes, and nothing from settings except the Discogs username.
 * See .plan/data-export-plan.md, "Shared export data layer".
 */

import {
  CollectionItem,
  EnrichedWishlistItem,
  EXPORT_SCHEMA_VERSION,
  ExportCollectionCacheInfo,
  ExportCollectionRow,
  ExportRowLink,
  ExportSnapshotMeta,
  ExportWishlistRow,
  LocalWantItem,
  MatchBasis,
  MatchConfidence,
  OwnedMatchStatus,
  ReleaseVersion,
  ScrobbleHistoryIndex,
  VersionsCache,
  WishlistStore,
} from '../../shared/types';
import {
  albumGroupKey,
  discogsArtistIdentityKey,
  stripDiscogsSuffixes,
} from '../../shared/utils/albumMapping';
import { readCollectionCacheSnapshot } from '../utils/collectionCache';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';
import { toIsoSeconds } from '../utils/timestamps';

const WISHLIST_CACHE = 'wishlist/wishlist-items.json';
const SETTINGS_FILE = 'settings/user-settings.json';

/** Release detail files read at once, to stay well under the open file limit */
const RELEASE_READ_BATCH = 50;

/** CollectionNote field ids Discogs gives every collection */
const MEDIA_CONDITION_FIELD = 1;
const SLEEVE_CONDITION_FIELD = 2;
const NOTES_FIELD = 3;

const CONFIDENCE_RANK: Record<MatchConfidence, number> = {
  certain: 0,
  confident: 1,
  likely: 2,
};

const BASIS_RANK: Record<MatchBasis, number> = {
  'release-id': 0,
  'master-id': 1,
  'search-master-id': 2,
  name: 3,
};

const OWNED_STATUS_BY_BASIS: Record<MatchBasis, OwnedMatchStatus> = {
  'release-id': 'owned-same-release',
  'master-id': 'owned-other-version',
  'search-master-id': 'owned-other-version',
  name: 'owned-name-match',
};

type WishlistSource = ExportWishlistRow['source'];

interface CollectionSnapshot {
  items: CollectionItem[];
  info: ExportCollectionCacheInfo;
}

interface CollectionRowsSnapshot {
  rows: ExportCollectionRow[];
  info: ExportCollectionCacheInfo;
}

/** One collection read, shared by every call that overlaps it */
interface SharedCollectionRead {
  snapshot: Promise<CollectionSnapshot>;
  rows?: Promise<CollectionRowsSnapshot>;
  /** Rows without genres and styles (no release files read) */
  leanRows?: Promise<CollectionRowsSnapshot>;
  users: number;
}

/** Collection rows indexed for owned matching */
interface CollectionIndex {
  byRelease: Map<number, ExportCollectionRow[]>;
  byMaster: Map<number, ExportCollectionRow[]>;
  byAlbumName: Map<string, ExportCollectionRow[]>;
}

const MISSING_CACHE: ExportCollectionCacheInfo = {
  status: 'missing',
  pagesExpected: null,
  pagesRead: 0,
  itemsExpected: null,
  itemsRead: 0,
  oldestPageAt: null,
  newestPageAt: null,
};

export class ExportDataService {
  private logger = createLogger('ExportDataService');
  // Calls that overlap (e.g. the Pocket List asking for collection and
  // wishlist rows together) share one collection read, so they see one
  // snapshot. It is dropped once the last of them finishes.
  private sharedRead: SharedCollectionRead | null = null;

  constructor(
    private fileStorage: FileStorage,
    private wishlistService: {
      getWishlistItems(): Promise<EnrichedWishlistItem[]>;
      getLocalWantList(): Promise<LocalWantItem[]>;
      getVersionsCache(): Promise<VersionsCache>;
    },
    private historyStorage: {
      getIndex(): Promise<ScrobbleHistoryIndex | null>;
    },
    private now: () => Date = () => new Date()
  ) {}

  // ============================================
  // Public API
  // ============================================

  /**
   * One row per cached collection item, sorted by rowId. With
   * `releaseDetails: false`, genres and styles are null and no
   * collections/release-{id}.json files are read.
   */
  async getCollectionRows(opts?: {
    releaseDetails?: boolean;
  }): Promise<ExportCollectionRow[]> {
    const withDetails = opts?.releaseDetails ?? true;
    return this.withCollection(
      async read => (await this.rowsOf(read, withDetails)).rows
    );
  }

  /**
   * Discogs wants and local wants as rows, sorted by source, then rowId.
   * `sources` limits the rows returned; owned matching and related links
   * always use both sources and the whole collection.
   */
  async getWishlistRows(opts?: {
    sources?: WishlistSource[];
  }): Promise<ExportWishlistRow[]> {
    const sources = new Set<WishlistSource>(
      opts?.sources ?? ['discogs-want', 'local-want']
    );
    const [wants, localWants, versionsCache, collection] = await Promise.all([
      this.wishlistService.getWishlistItems(),
      this.wishlistService.getLocalWantList(),
      this.wishlistService.getVersionsCache(),
      // Owned matching doesn't use genres or styles
      this.withCollection(read => this.rowsOf(read, false)),
    ]);

    const versionsByRelease = indexVersions(versionsCache, wants);
    const discogsRows = wants.map(want =>
      this.discogsWantRow(want, versionsByRelease)
    );
    const localRows = localWants.map(want => this.localWantRow(want));

    const index = indexCollection(collection.rows);
    for (const row of [...discogsRows, ...localRows]) {
      applyOwnedMatch(row, index, collection.info);
    }
    linkRelatedWants(discogsRows, localRows);

    return [...discogsRows, ...localRows]
      .filter(row => sources.has(row.source))
      .sort(compareRows);
  }

  /** Freshness and completeness of the data behind the rows */
  async getSnapshotMeta(): Promise<ExportSnapshotMeta> {
    const generatedAt = toIsoSeconds(this.now().getTime());
    const [collection, username, wishlistUpdatedAt, historySyncedAt] =
      await Promise.all([
        this.withCollection(read => read.snapshot),
        this.getDiscogsUsername(),
        this.getWishlistUpdatedAt(),
        this.getHistorySyncedAt(),
      ]);

    return {
      schemaVersion: EXPORT_SCHEMA_VERSION,
      generatedAt,
      collectionCachedAt: collection.info.oldestPageAt,
      collectionCache: collection.info,
      wishlistUpdatedAt,
      historySyncedAt,
      discogsUsername: username,
    };
  }

  // ============================================
  // Loading
  // ============================================

  /**
   * The Discogs username, read straight from the settings file (it is stored
   * in plain text). AuthService.getUserSettings() would decrypt tokens this
   * service must never touch, and writes default settings when none exist.
   */
  private async getDiscogsUsername(): Promise<string | null> {
    try {
      const settings = await this.fileStorage.readJSON<{
        discogs?: { username?: string };
      }>(SETTINGS_FILE);
      return settings?.discogs?.username || null;
    } catch {
      return null;
    }
  }

  private async withCollection<T>(
    use: (read: SharedCollectionRead) => Promise<T>
  ): Promise<T> {
    if (!this.sharedRead) {
      this.sharedRead = { snapshot: this.readCollection(), users: 0 };
    }
    const read = this.sharedRead;
    read.users++;
    try {
      return await use(read);
    } finally {
      read.users--;
      if (read.users === 0 && this.sharedRead === read) this.sharedRead = null;
    }
  }

  private rowsOf(
    read: SharedCollectionRead,
    withDetails: boolean
  ): Promise<CollectionRowsSnapshot> {
    if (withDetails) {
      if (!read.rows) read.rows = this.buildCollectionRows(read.snapshot, true);
      return read.rows;
    }
    // Full rows already on the way serve lean callers too
    if (read.rows) return read.rows;
    if (!read.leanRows) {
      read.leanRows = this.buildCollectionRows(read.snapshot, false);
    }
    return read.leanRows;
  }

  private async readCollection(): Promise<CollectionSnapshot> {
    const username = await this.getDiscogsUsername();
    if (!username) {
      return { items: [], info: { ...MISSING_CACHE } };
    }
    try {
      return await readCollectionCacheSnapshot(username, this.fileStorage);
    } catch (error) {
      // An unreadable cache is reported like a missing one
      this.logger.warn('Collection cache could not be read', error);
      return { items: [], info: { ...MISSING_CACHE } };
    }
  }

  private async buildCollectionRows(
    snapshot: Promise<CollectionSnapshot>,
    withDetails: boolean
  ): Promise<CollectionRowsSnapshot> {
    const { items, info } = await snapshot;
    const details = withDetails
      ? await this.readReleaseDetails(
          Array.from(new Set(items.map(item => item.id)))
        )
      : new Map<number, { genres?: string[]; styles?: string[] }>();

    // Copies of one release share an id; number them by dateAdded, then
    // cache order (the sort is stable)
    const copiesByRelease = new Map<number, CollectionItem[]>();
    for (const item of items) {
      const copies = copiesByRelease.get(item.id) ?? [];
      copies.push(item);
      copiesByRelease.set(item.id, copies);
    }

    const rows: ExportCollectionRow[] = [];
    for (const [releaseId, copies] of copiesByRelease) {
      const ordered = [...copies].sort(
        (a, b) => dateSortValue(a.date_added) - dateSortValue(b.date_added)
      );
      ordered.forEach((item, i) => {
        rows.push(
          collectionRow(item, i + 1, ordered.length, details.get(releaseId))
        );
      });
    }
    return { rows: rows.sort(compareRows), info };
  }

  /** Genres and styles from collections/release-{id}.json, where fetched */
  private async readReleaseDetails(
    releaseIds: number[]
  ): Promise<Map<number, { genres?: string[]; styles?: string[] }>> {
    const details = new Map<number, { genres?: string[]; styles?: string[] }>();
    for (let i = 0; i < releaseIds.length; i += RELEASE_READ_BATCH) {
      const batch = releaseIds.slice(i, i + RELEASE_READ_BATCH);
      const releases = await Promise.all(
        batch.map(id =>
          this.fileStorage
            .readJSON<{
              genres?: string[];
              styles?: string[];
            }>(`collections/release-${id}.json`)
            .catch(() => null)
        )
      );
      batch.forEach((id, j) => {
        const release = releases[j];
        if (release) details.set(id, release);
      });
    }
    return details;
  }

  private async getWishlistUpdatedAt(): Promise<string | null> {
    try {
      const store =
        await this.fileStorage.readJSON<WishlistStore>(WISHLIST_CACHE);
      return store?.lastUpdated ? toIsoSeconds(store.lastUpdated) : null;
    } catch {
      return null;
    }
  }

  private async getHistorySyncedAt(): Promise<string | null> {
    try {
      const index = await this.historyStorage.getIndex();
      // lastSyncTimestamp is ms
      return index?.lastSyncTimestamp
        ? toIsoSeconds(index.lastSyncTimestamp)
        : null;
    } catch {
      return null;
    }
  }

  // ============================================
  // Wishlist rows
  // ============================================

  private discogsWantRow(
    want: EnrichedWishlistItem,
    versionsByRelease: Map<number, ReleaseVersion>
  ): ExportWishlistRow {
    const artistRaw = want.artist ?? '';
    const artistDisplay = stripDiscogsSuffixes(artistRaw);
    const masterId = positiveOrNull(want.masterId);
    const releaseId = positiveOrNull(want.releaseId);
    const version =
      releaseId !== null ? versionsByRelease.get(releaseId) : undefined;
    const dateAdded = discogsDate(want.dateAdded);

    return {
      rowId: `discogs-want:${want.id}`,
      source: 'discogs-want',
      releaseId,
      masterId,
      masterIdSource: masterId !== null ? 'release-data' : null,
      artistRaw,
      artistDisplay,
      artistIdentityKey: discogsArtistIdentityKey(artistRaw),
      albumNameKey: albumGroupKey(artistDisplay, want.title ?? ''),
      title: want.title ?? '',
      year: positiveOrNull(want.year),
      formats: version?.format ? [...version.format] : [],
      labels: nonEmptyList(version?.label),
      catalogNumbers: [],
      notes: textOrNull(want.notes),
      priority: positiveOrNull(want.rating),
      ...dateAdded,
      vinylStatus: want.vinylStatus ?? 'unknown',
      lowestVinylPrice: want.lowestVinylPrice ?? null,
      priceCurrency: want.priceCurrency ?? null,
      playCount: null,
      ...notMatched(),
      relatedWishlistLinks: [],
      searchMasterIdCandidate: null,
      coverImageUrl: textOrNull(want.coverImage),
    };
  }

  /**
   * Local wants come from Last.fm names plus the first hit of a Discogs
   * master search. The stored releaseId is really a master id (see the
   * plan's "Local-want ids"), so it is never exported as releaseId or used
   * for matching.
   */
  private localWantRow(want: LocalWantItem): ExportWishlistRow {
    const masterId = positiveOrNull(want.masterId);
    const stored = positiveOrNull(want.releaseId);
    // addedAt is ms (lastPlayed, not exported, is seconds)
    const addedAtMs = want.addedAt;
    const validAddedAt =
      typeof addedAtMs === 'number' && Number.isFinite(addedAtMs);

    return {
      rowId: `local-want:${want.id}`,
      source: 'local-want',
      releaseId: null,
      masterId,
      masterIdSource: masterId !== null ? 'search-guess' : null,
      artistRaw: want.artist,
      artistDisplay: want.artist,
      artistIdentityKey: null,
      albumNameKey: albumGroupKey(want.artist, want.album),
      title: want.album,
      year: null,
      formats: [],
      labels: [],
      catalogNumbers: [],
      notes: null,
      priority: null,
      dateAdded: validAddedAt ? toIsoSeconds(addedAtMs) : null,
      dateAddedUnix: validAddedAt ? Math.floor(addedAtMs / 1000) : null,
      dateAddedRaw: addedAtMs,
      vinylStatus: want.vinylStatus ?? 'unknown',
      lowestVinylPrice: null,
      priceCurrency: null,
      playCount: want.playCount ?? null,
      ...notMatched(),
      relatedWishlistLinks: [],
      searchMasterIdCandidate:
        stored !== null && stored !== masterId ? stored : null,
      coverImageUrl: textOrNull(want.coverImage),
    };
  }
}

// ============================================
// Row helpers
// ============================================

/** Owned-match fields before matching (see applyOwnedMatch) */
function notMatched(): Pick<
  ExportWishlistRow,
  | 'ownedMatch'
  | 'ownedMatchConfidence'
  | 'ownedCollectionRowIds'
  | 'ownedCollectionLinks'
> {
  return {
    ownedMatch: 'not-owned',
    ownedMatchConfidence: null,
    ownedCollectionRowIds: [],
    ownedCollectionLinks: [],
  };
}

function collectionRow(
  item: CollectionItem,
  copyIndex: number,
  copyCount: number,
  details: { genres?: string[]; styles?: string[] } | undefined
): ExportCollectionRow {
  const release = item.release;
  const artistRaw = release?.artist ?? '';
  const artistDisplay = stripDiscogsSuffixes(artistRaw);
  const masterId = positiveOrNull(release?.master_id);
  const title = release?.title ?? '';

  return {
    rowId: `discogs-collection:${item.id}:${copyIndex}`,
    source: 'discogs-collection',
    releaseId: item.id,
    masterId,
    masterIdSource: masterId !== null ? 'release-data' : null,
    copyIndex,
    copyCount,
    artistRaw,
    artistDisplay,
    artistIdentityKey: discogsArtistIdentityKey(artistRaw),
    albumNameKey: albumGroupKey(artistDisplay, title),
    title,
    year: positiveOrNull(release?.year),
    formats: [...(release?.format ?? [])],
    labels: [...(release?.label ?? [])],
    catalogNumbers: nonEmptyList(release?.catalog_number),
    genres: Array.isArray(details?.genres) ? [...details.genres] : null,
    styles: Array.isArray(details?.styles) ? [...details.styles] : null,
    rating: positiveOrNull(item.rating),
    ...splitNotes(item),
    ...discogsDate(item.date_added),
    coverImageUrl: textOrNull(release?.cover_image),
  };
}

/** Condition fields, free-text notes and any other custom fields */
function splitNotes(
  item: CollectionItem
): Pick<
  ExportCollectionRow,
  'mediaCondition' | 'sleeveCondition' | 'notes' | 'customFields'
> {
  const result: ReturnType<typeof splitNotes> = {
    mediaCondition: null,
    sleeveCondition: null,
    notes: null,
    customFields: [],
  };
  for (const note of item.notes ?? []) {
    const value = textOrNull(note.value);
    if (value === null) continue;
    if (note.field_id === MEDIA_CONDITION_FIELD) result.mediaCondition = value;
    else if (note.field_id === SLEEVE_CONDITION_FIELD) {
      result.sleeveCondition = value;
    } else if (note.field_id === NOTES_FIELD) result.notes = value;
    else result.customFields.push({ fieldId: note.field_id, value });
  }
  result.customFields.sort((a, b) => a.fieldId - b.fieldId);
  return result;
}

/**
 * A Discogs date string with a local offset, as ISO UTC and Unix seconds;
 * both null when it can't be parsed (dateAddedRaw keeps the original)
 */
function discogsDate(raw: string | undefined): {
  dateAdded: string | null;
  dateAddedUnix: number | null;
  dateAddedRaw: string;
} {
  const text = raw ?? '';
  const ms = Date.parse(text);
  if (Number.isNaN(ms)) {
    return { dateAdded: null, dateAddedUnix: null, dateAddedRaw: text };
  }
  return {
    dateAdded: toIsoSeconds(ms),
    dateAddedUnix: Math.floor(ms / 1000),
    dateAddedRaw: text,
  };
}

/** Sort value for copy order; unparseable dates go last */
function dateSortValue(raw: string | undefined): number {
  const ms = Date.parse(raw ?? '');
  return Number.isNaN(ms) ? Number.MAX_SAFE_INTEGER : ms;
}

/** Discogs uses 0 for "none" (year, rating, master id) */
function positiveOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && value > 0 ? value : null;
}

function textOrNull(value: string | null | undefined): string | null {
  return value && value.trim() ? value : null;
}

function nonEmptyList(value: string | null | undefined): string[] {
  const text = textOrNull(value);
  return text === null ? [] : [text];
}

/** Machine order: source, then rowId (plain code-unit comparison) */
function compareRows(
  a: { source: string; rowId: string },
  b: { source: string; rowId: string }
): number {
  if (a.source !== b.source) return a.source < b.source ? -1 : 1;
  if (a.rowId === b.rowId) return 0;
  return a.rowId < b.rowId ? -1 : 1;
}

/**
 * The versions cache entry for each want's release: from its master's entry
 * when there is one, else from any entry (wants with masterId 0), else from
 * the want's own vinyl versions.
 */
function indexVersions(
  cache: VersionsCache,
  wants: EnrichedWishlistItem[]
): Map<number, ReleaseVersion> {
  const byRelease = new Map<number, ReleaseVersion>();
  const add = (version: ReleaseVersion) => {
    if (!byRelease.has(version.releaseId)) {
      byRelease.set(version.releaseId, version);
    }
  };
  const entries = cache.entries ?? {};
  for (const want of wants) {
    for (const version of entries[want.masterId]?.versions ?? []) {
      if (version.releaseId === want.releaseId) add(version);
    }
  }
  for (const entry of Object.values(entries)) {
    for (const version of entry.versions ?? []) add(version);
  }
  for (const want of wants) {
    for (const version of want.vinylVersions ?? []) add(version);
  }
  return byRelease;
}

// ============================================
// Matching
// ============================================

function indexCollection(rows: ExportCollectionRow[]): CollectionIndex {
  const index: CollectionIndex = {
    byRelease: new Map(),
    byMaster: new Map(),
    byAlbumName: new Map(),
  };
  const add = <K>(
    map: Map<K, ExportCollectionRow[]>,
    key: K,
    row: ExportCollectionRow
  ) => {
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  };
  for (const row of rows) {
    add(index.byRelease, row.releaseId, row);
    if (row.masterId !== null) add(index.byMaster, row.masterId, row);
    add(index.byAlbumName, row.albumNameKey, row);
  }
  return index;
}

/**
 * Owned-match tiers, strongest first: same confirmed release (certain), same
 * master (confident when both masters come from release data, likely for a
 * search guess), same names (likely). The status and confidence come from the
 * strongest link; every matching collection row is listed, each with its own
 * strongest basis. Without a complete cache, "not owned" can't be known.
 */
function applyOwnedMatch(
  row: ExportWishlistRow,
  index: CollectionIndex,
  cache: ExportCollectionCacheInfo
): void {
  const links = new Map<string, ExportRowLink>();
  const link = (
    rows: ExportCollectionRow[] | undefined,
    basis: MatchBasis,
    confidence: MatchConfidence
  ) => {
    for (const owned of rows ?? []) {
      if (!links.has(owned.rowId)) {
        links.set(owned.rowId, { rowId: owned.rowId, basis, confidence });
      }
    }
  };

  if (row.releaseId !== null) {
    link(index.byRelease.get(row.releaseId), 'release-id', 'certain');
  }
  if (row.masterId !== null) {
    if (row.masterIdSource === 'release-data') {
      link(index.byMaster.get(row.masterId), 'master-id', 'confident');
    } else {
      link(index.byMaster.get(row.masterId), 'search-master-id', 'likely');
    }
  }
  const sameName = (index.byAlbumName.get(row.albumNameKey) ?? []).filter(
    owned =>
      // Discogs wants need the same artist identity, suffixes included;
      // Last.fm names (local wants) have none to compare
      row.artistIdentityKey === null ||
      owned.artistIdentityKey === row.artistIdentityKey
  );
  link(sameName, 'name', 'likely');

  const ordered = [...links.values()].sort(compareLinks);
  if (ordered.length === 0) {
    row.ownedMatch = cache.status === 'complete' ? 'not-owned' : 'unknown';
    return;
  }
  row.ownedMatch = OWNED_STATUS_BY_BASIS[ordered[0].basis];
  row.ownedMatchConfidence = ordered[0].confidence;
  row.ownedCollectionLinks = ordered;
  row.ownedCollectionRowIds = ordered.map(l => l.rowId);
}

/**
 * Links between Discogs wants and local wants for the same album. Local-want
 * masters are search guesses and names prove nothing, so every link is
 * 'likely'; all of them are kept.
 */
function linkRelatedWants(
  discogsRows: ExportWishlistRow[],
  localRows: ExportWishlistRow[]
): void {
  for (const want of discogsRows) {
    for (const local of localRows) {
      let basis: MatchBasis | null = null;
      if (want.masterId !== null && want.masterId === local.masterId) {
        basis = 'search-master-id';
      } else if (want.albumNameKey === local.albumNameKey) {
        basis = 'name';
      }
      if (!basis) continue;
      want.relatedWishlistLinks.push({
        rowId: local.rowId,
        basis,
        confidence: 'likely',
      });
      local.relatedWishlistLinks.push({
        rowId: want.rowId,
        basis,
        confidence: 'likely',
      });
    }
  }
  for (const row of [...discogsRows, ...localRows]) {
    row.relatedWishlistLinks.sort(compareLinks);
  }
}

/** Strongest first, then rowId */
function compareLinks(a: ExportRowLink, b: ExportRowLink): number {
  return (
    CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence] ||
    BASIS_RANK[a.basis] - BASIS_RANK[b.basis] ||
    (a.rowId < b.rowId ? -1 : a.rowId > b.rowId ? 1 : 0)
  );
}
