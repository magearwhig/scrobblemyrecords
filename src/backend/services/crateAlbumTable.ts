/**
 * Album table for Smart Crates: the owned collection deduped by release ID,
 * grouped into albums the way Stats groups them, with listening data
 * attributed per album. Built once and memoised until its inputs change.
 * See .plan/done/smart-crates-plan.md sections 5 and 7.
 */

import {
  AlbumMapping,
  CollectionItem,
  DiscogsCollectionProgress,
  DiscogsRelease,
  ScrobbleHistoryIndex,
} from '../../shared/types';
import {
  createAlbumCanonicalizer,
  createAlbumGroupNameResolver,
  stripDiscogsSuffix,
} from '../../shared/utils/albumMapping';
import { computeReleaseRuntime } from '../../shared/utils/releaseRuntime';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

import {
  CrateAlbumTable,
  CrateReleaseFacts,
  CrateTableAlbum,
  CrateTableCopy,
} from './crateTableTypes';
import { loadAlbumMappings, lookupMergedHistory } from './mergedAlbumHistory';
import { ScrobbleHistoryStorage } from './scrobbleHistoryStorage';

/** Bump when the table derivation changes so memoised tables are rebuilt */
export const CRATE_TABLE_VERSION = 1;

const HISTORY_INDEX_FILE = 'history/scrobble-history-index.json';
const ALBUM_MAPPINGS_FILE = 'mappings/album-mappings.json';
const DISCARD_PILE_FILE = 'collections/discard-pile.json';

const FACTS_TTL_MS = 10 * 60 * 1000;
const FACTS_CONCURRENCY = 16;
const SNAPSHOT_RETRY_DELAY_MS = 500;

type HistoryStorageLike = Pick<
  ScrobbleHistoryStorage,
  'batchLookup' | 'normalizeKey' | 'getIndex'
> &
  Partial<Pick<ScrobbleHistoryStorage, 'invalidateCache'>>;

interface ArtistNameResolverLike {
  resolveArtist(name: string): string;
  getFingerprint(): string;
}

interface CollectionPageFile {
  data?: CollectionItem[];
  timestamp?: number;
  pagination?: { page?: number; pages?: number; items?: number };
}

/** The collection cache as read, with whether it is a complete snapshot */
export interface CollectionSnapshot {
  items: CollectionItem[];
  collection: CrateAlbumTable['collection'];
  /** Pages disagree, a page is missing or counts don't add up */
  mixed: boolean;
  /** The progress file says a preload is running */
  loading: boolean;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function pageNumbers(files: string[], username: string): number[] {
  const pattern = new RegExp(`^${escapeRegExp(username)}-page-(\\d+)\\.json$`);
  const numbers: number[] = [];
  for (const file of files) {
    const match = pattern.exec(file);
    if (match) numbers.push(Number(match[1]));
  }
  return numbers.sort((a, b) => a - b);
}

/**
 * Read every cached collection page and judge whether together they are a
 * complete snapshot (plan section 7.1): pages 1..P all exist, all report the
 * same pagination.pages = P and pagination.items = T, their item counts add
 * up to T, and the progress file is absent or not 'loading'. Legacy pages
 * without pagination count as complete only when progress says 'completed'.
 * Items from every page present are returned either way.
 */
export async function readCollectionSnapshot(
  fileStorage: FileStorage,
  username: string
): Promise<CollectionSnapshot> {
  const [files, progress] = await Promise.all([
    fileStorage.listFiles('collections'),
    fileStorage.readJSON<DiscogsCollectionProgress>(
      `collections/${username}-progress.json`
    ),
  ]);
  const numbers = pageNumbers(files, username);

  const items: CollectionItem[] = [];
  const pagesSeen = new Set<string>();
  const totalsSeen = new Set<string>();
  let pagesRead = 0;
  let withPagination = 0;
  let missingPage = false;
  for (const n of numbers) {
    const page = await fileStorage.readJSON<CollectionPageFile>(
      `collections/${username}-page-${n}.json`
    );
    if (!page || !Array.isArray(page.data)) {
      // Listed but unreadable (deleted mid-rewrite or corrupt)
      missingPage = true;
      continue;
    }
    pagesRead++;
    items.push(...page.data);
    if (page.pagination) {
      withPagination++;
      pagesSeen.add(String(page.pagination.pages));
      totalsSeen.add(String(page.pagination.items));
    }
  }

  const loading = progress?.status === 'loading';
  const allPaginated = pagesRead > 0 && withPagination === pagesRead;
  const consistent = pagesSeen.size === 1 && totalsSeen.size === 1;
  const expected = consistent ? Number([...pagesSeen][0]) : null;
  const pagesExpected =
    expected !== null && Number.isFinite(expected)
      ? expected
      : (progress?.totalPages ?? null);

  let mixed = missingPage || (withPagination > 0 && !consistent);
  if (allPaginated && consistent) {
    const total = Number([...totalsSeen][0]);
    const contiguous =
      numbers.length === expected && numbers.every((n, i) => n === i + 1);
    if (!contiguous || items.length !== total) mixed = true;
  } else if (pagesRead > 0 && !allPaginated && withPagination > 0) {
    // Some pages paginated, some legacy: two writers' output
    mixed = true;
  }

  let complete: boolean;
  if (mixed || loading || pagesRead === 0) {
    complete = false;
  } else if (allPaginated) {
    complete = true;
  } else {
    // Legacy pages: trust only a finished preload, and only without gaps
    complete =
      progress?.status === 'completed' &&
      numbers.every((n, i) => n === i + 1) &&
      (progress.totalPages === undefined ||
        numbers.length === progress.totalPages);
  }

  return {
    items,
    collection: { complete, pagesRead, pagesExpected },
    mixed,
    loading,
  };
}

/** Inputs of the pure table build */
export interface AlbumTableInputs {
  items: CollectionItem[];
  mappings: AlbumMapping[];
  resolveArtist: (name: string) => string;
  /** CollectionItem.id values in the discard pile */
  discardIds: Set<number>;
  collection: CrateAlbumTable['collection'];
  fingerprint: string;
  now: number;
}

/**
 * Build the album table (plan section 5): dedupe entries by release ID,
 * group releases by the album canonicalizer key (not by master_id), and
 * attribute plays with one lookupMergedHistory call for the whole
 * collection. The history storage is the only I/O.
 */
export async function buildAlbumTable(
  inputs: AlbumTableInputs,
  historyStorage: HistoryStorageLike
): Promise<CrateAlbumTable> {
  const { items, mappings, resolveArtist, discardIds } = inputs;

  // Discogs-numbered names the resolver doesn't know fall back to the plain
  // name, as createAlbumCanonicalizer does
  const groupArtist = (artist: string) => {
    const resolved = resolveArtist(artist);
    const plain = stripDiscogsSuffix(artist);
    return plain !== artist && resolved.toLowerCase() === artist.toLowerCase()
      ? resolveArtist(plain)
      : resolved;
  };

  // 1. Dedupe by release ID
  const byRelease = new Map<number, CrateTableCopy>();
  // Latest date_added among a release's entries ("owned ×2" added twice)
  const latestAdded = new Map<number, number>();
  for (const item of items) {
    const release = item.release;
    if (!release) continue;
    const releaseId = release.id ?? item.id;
    const addedMs = Date.parse(item.date_added);
    const rating = item.rating && item.rating > 0 ? item.rating : undefined;
    const inDiscard = discardIds.has(item.id);
    if (!Number.isNaN(addedMs)) {
      latestAdded.set(
        releaseId,
        Math.max(latestAdded.get(releaseId) ?? 0, addedMs)
      );
    }
    const existing = byRelease.get(releaseId);
    if (existing) {
      existing.copyCount++;
      if (addedMs < existing.dateAddedMs) {
        existing.dateAddedMs = addedMs;
        existing.dateAdded = item.date_added;
      }
      if (rating && (!existing.rating || rating > existing.rating)) {
        existing.rating = rating;
      }
      existing.inDiscardPile ||= inDiscard;
      continue;
    }
    byRelease.set(releaseId, {
      releaseId,
      masterId: release.master_id || undefined,
      artist: release.artist,
      title: release.title,
      year: release.year && release.year > 0 ? release.year : undefined,
      format: release.format ?? [],
      dateAdded: item.date_added,
      dateAddedMs: Number.isNaN(addedMs) ? 0 : addedMs,
      rating,
      copyCount: 1,
      coverUrl: release.cover_image || undefined,
      inDiscardPile: inDiscard,
      resolvedArtist: groupArtist(release.artist),
    });
  }

  // 2. Group into albums
  const canonicalize = createAlbumCanonicalizer(mappings, resolveArtist);
  const groups = new Map<string, CrateTableCopy[]>();
  for (const copy of byRelease.values()) {
    const { key } = canonicalize(copy.artist, copy.title);
    const copies = groups.get(key) ?? [];
    copies.push(copy);
    groups.set(key, copies);
  }

  const albums: CrateTableAlbum[] = [];
  for (const [albumKey, copies] of groups) {
    copies.sort(
      (a, b) => a.dateAddedMs - b.dateAddedMs || a.releaseId - b.releaseId
    );
    const display = copies[0];
    albums.push({
      albumKey,
      artist: display.artist,
      album: display.title,
      coverUrl: display.coverUrl,
      copies,
      firstAddedMs: display.dateAddedMs,
      latestAddedMs: Math.max(
        ...copies.map(c => latestAdded.get(c.releaseId) ?? c.dateAddedMs)
      ),
      listening: {
        scrobbleCount: 0,
        lastPlayed: null,
        playTimestamps: [],
        matchType: 'none',
        matchedKeys: [],
      },
    });
  }

  // 3. Attribute plays: one lookup for the whole collection
  const index: ScrobbleHistoryIndex | null = await historyStorage.getIndex();
  if (index && albums.length > 0) {
    const namesFor = createAlbumGroupNameResolver(mappings, resolveArtist);
    const results = await lookupMergedHistory(
      historyStorage,
      albums.map(album => namesFor(album.copies, album.albumKey))
    );
    albums.forEach((album, i) => {
      const result = results[i];
      const timestamps = (result?.entry?.plays ?? [])
        .map(play => play.timestamp)
        .sort((a, b) => a - b);
      album.listening = {
        scrobbleCount: result?.entry?.playCount ?? 0,
        lastPlayed: result?.entry?.lastPlayed || null,
        playTimestamps: timestamps,
        matchType: result?.matchType ?? 'none',
        matchedKeys: result?.matchedKeys ?? [],
      };
    });
  }

  // 4. Competition ranking ("1, 2, 2, 4"): ties share a rank, albums with no
  // scrobbles get none
  const ranked = albums
    .filter(album => album.listening.scrobbleCount > 0)
    .sort((a, b) => b.listening.scrobbleCount - a.listening.scrobbleCount);
  ranked.forEach((album, i) => {
    const prev = ranked[i - 1];
    album.scrobbleRank =
      prev && prev.listening.scrobbleCount === album.listening.scrobbleCount
        ? prev.scrobbleRank
        : i + 1;
  });

  return {
    albums,
    rankedAlbumCount: ranked.length,
    totalAlbums: albums.length,
    totalReleases: byRelease.size,
    hasHistory: index !== null,
    historyFrom: index?.oldestScrobbleDate || null,
    newestScrobbleAt: index?.lastSyncTimestamp || null,
    lastSyncCompletedAt: index?.lastSyncCompletedAt ?? null,
    collection: inputs.collection,
    fingerprint: inputs.fingerprint,
    builtAt: inputs.now,
  };
}

/** Facts from one release-details cache file (null when there is none) */
export function releaseFactsFrom(
  release: DiscogsRelease | null
): CrateReleaseFacts {
  if (!release) return {};
  // Without genres the file came from basic collection data, so its styles
  // can't be trusted either
  const hasGenres = Array.isArray(release.genres);
  return {
    genres: hasGenres ? release.genres : undefined,
    styles: hasGenres ? (release.styles ?? []) : undefined,
    runtime: computeReleaseRuntime(release.tracklist),
  };
}

export interface CrateAlbumTableBuilderOptions {
  /** Delay before re-reading a mixed set of collection pages */
  snapshotRetryDelayMs?: number;
}

/**
 * Builds and memoises the album table, and lazily loads release facts.
 * Both are single flight: concurrent callers share one in-flight promise.
 */
export class CrateAlbumTableBuilder {
  private logger = createLogger('CrateAlbumTableBuilder');
  private artistResolver: ArtistNameResolverLike | null = null;

  private table: { username: string; value: CrateAlbumTable } | null = null;
  private inflight = new Map<string, Promise<CrateAlbumTable>>();
  /** Bumped by invalidate() so builds started before it aren't memoised */
  private generation = 0;

  private facts = new Map<number, { value: CrateReleaseFacts; at: number }>();
  /** Bumped by invalidate() so reads started before it aren't memoised */
  private factsGeneration = 0;
  /** History index mtime the last fingerprint saw */
  private historyMtime: number | null = null;
  private factsInflight = new Map<number, Promise<CrateReleaseFacts>>();
  private activeReads = 0;
  private readQueue: Array<() => void> = [];

  private readonly snapshotRetryDelayMs: number;

  constructor(
    private fileStorage: FileStorage,
    private historyStorage: HistoryStorageLike,
    private mappingService: {
      getAllAlbumMappings(): Promise<AlbumMapping[]>;
    } | null,
    private discardPileService: {
      getDiscardPileCollectionIds(): Promise<Set<number>>;
    } | null,
    options: CrateAlbumTableBuilderOptions = {}
  ) {
    this.snapshotRetryDelayMs =
      options.snapshotRetryDelayMs ?? SNAPSHOT_RETRY_DELAY_MS;
  }

  setArtistNameResolver(resolver: ArtistNameResolverLike): void {
    this.artistResolver = resolver;
  }

  /** Identity until a resolver is set */
  getResolveArtist(): (name: string) => string {
    const resolver = this.artistResolver;
    return resolver ? name => resolver.resolveArtist(name) : name => name;
  }

  /**
   * Fingerprint of everything the table is derived from (plan section 7.1).
   * Changes that re-derive the history index without writing its file
   * (excluded artists, unresolved-play rules) are not seen here; callers
   * should invalidate() after them.
   */
  async fingerprint(username: string): Promise<string> {
    const mtime = async (path: string) =>
      (await this.fileStorage.getStats(path)).mtime?.getTime() ?? 0;

    // A rewrite of the index file (e.g. merge-split-entries) may not have
    // cleared the history storage's own cache; building from that cache under
    // the new fingerprint would keep stale plays until the next change
    const history = await mtime(HISTORY_INDEX_FILE);
    if (this.historyMtime !== null && history !== this.historyMtime) {
      this.historyStorage.invalidateCache?.();
    }
    this.historyMtime = history;

    const files = await this.fileStorage.listFiles('collections');
    const pages = pageNumbers(files, username);
    const [pageMtimes, progress, mappings, discard, index] = await Promise.all([
      Promise.all(
        pages.map(n => mtime(`collections/${username}-page-${n}.json`))
      ),
      mtime(`collections/${username}-progress.json`),
      mtime(ALBUM_MAPPINGS_FILE),
      mtime(DISCARD_PILE_FILE),
      this.historyStorage.getIndex(),
    ]);

    return [
      `v${CRATE_TABLE_VERSION}`,
      username,
      `pages:${pages.length}:${Math.max(0, ...pageMtimes)}`,
      `progress:${progress}`,
      `history:${history}:${index?.lastSyncTimestamp ?? 0}`,
      `mappings:${mappings}`,
      `artists:${this.artistResolver?.getFingerprint() ?? ''}`,
      `discard:${discard}`,
    ].join('|');
  }

  /** Memoised by fingerprint; single flight; one history lookup per build */
  async getTable(username: string): Promise<CrateAlbumTable> {
    const fingerprint = await this.fingerprint(username);
    if (
      this.table?.username === username &&
      this.table.value.fingerprint === fingerprint
    ) {
      return this.table.value;
    }

    const key = `${username}\n${fingerprint}`;
    const pending = this.inflight.get(key);
    if (pending) return pending;

    const generation = this.generation;
    const build = this.build(username, fingerprint)
      .then(table => {
        if (generation === this.generation) {
          this.table = { username, value: table };
        }
        return table;
      })
      .finally(() => {
        if (this.inflight.get(key) === build) this.inflight.delete(key);
      });
    this.inflight.set(key, build);
    return build;
  }

  private async build(
    username: string,
    fingerprint: string
  ): Promise<CrateAlbumTable> {
    const started = Date.now();
    let snapshot = await readCollectionSnapshot(this.fileStorage, username);
    if (snapshot.mixed && !snapshot.loading) {
      // Probably an update-new rewrite in progress; look once more
      await new Promise(resolve =>
        setTimeout(resolve, this.snapshotRetryDelayMs)
      );
      snapshot = await readCollectionSnapshot(this.fileStorage, username);
    }

    const [mappings, discardIds] = await Promise.all([
      loadAlbumMappings(this.mappingService),
      this.discardPileService
        ? this.discardPileService.getDiscardPileCollectionIds()
        : Promise.resolve(new Set<number>()),
    ]);

    const table = await buildAlbumTable(
      {
        items: snapshot.items,
        mappings,
        resolveArtist: this.getResolveArtist(),
        discardIds,
        collection: snapshot.collection,
        fingerprint,
        now: Date.now(),
      },
      this.historyStorage
    );
    this.logger.debug('Built crate album table', {
      albums: table.totalAlbums,
      releases: table.totalReleases,
      complete: table.collection.complete,
      ms: Date.now() - started,
    });
    return table;
  }

  /**
   * Genre/style/runtime per release, read lazily from
   * collections/release-{id}.json with fileStorage.readJSON only (never the
   * Discogs API). Memoised per ID for 10 minutes; at most 16 reads in flight;
   * concurrent requests for an ID share one read.
   */
  async getFacts(
    releaseIds: number[]
  ): Promise<Map<number, CrateReleaseFacts>> {
    const now = Date.now();
    const result = new Map<number, CrateReleaseFacts>();
    const pending: Array<Promise<void>> = [];
    for (const id of new Set(releaseIds)) {
      const cached = this.facts.get(id);
      if (cached && now - cached.at < FACTS_TTL_MS) {
        result.set(id, cached.value);
        continue;
      }
      let read = this.factsInflight.get(id);
      if (!read) {
        read = this.readFacts(id).finally(() => this.factsInflight.delete(id));
        this.factsInflight.set(id, read);
      }
      pending.push(read.then(value => void result.set(id, value)));
    }
    await Promise.all(pending);
    return result;
  }

  private async readFacts(id: number): Promise<CrateReleaseFacts> {
    const generation = this.factsGeneration;
    await this.acquireRead();
    try {
      const release = await this.fileStorage.readJSON<DiscogsRelease>(
        `collections/release-${id}.json`
      );
      const value = releaseFactsFrom(release);
      if (generation === this.factsGeneration) {
        this.facts.set(id, { value, at: Date.now() });
      }
      return value;
    } catch (error) {
      // Unreadable file: treat as not fetched, and try again next time
      this.logger.warn(`Could not read release details ${id}`, error);
      return {};
    } finally {
      this.releaseRead();
    }
  }

  private acquireRead(): Promise<void> {
    if (this.activeReads < FACTS_CONCURRENCY) {
      this.activeReads++;
      return Promise.resolve();
    }
    return new Promise(resolve => this.readQueue.push(resolve));
  }

  private releaseRead(): void {
    const next = this.readQueue.shift();
    if (next) {
      // The slot passes straight to the next reader
      next();
    } else {
      this.activeReads--;
    }
  }

  /** Drop the memoised table and release facts */
  invalidate(): void {
    this.generation++;
    this.table = null;
    this.inflight.clear();
    this.facts.clear();
    this.factsInflight.clear();
    this.factsGeneration++;
  }
}
