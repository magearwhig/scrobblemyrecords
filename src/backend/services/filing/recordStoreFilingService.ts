/**
 * Record-store filing data: MusicBrainz sort names and Discogs master years
 * (caches), the user's "file under" overrides, and the background job that
 * fills the caches. The Pocket List export only reads getSnapshot(); it never
 * fetches. See .plan/done/record-store-filing-plan.md, "Data" and "Refresh job".
 */

import {
  ArtistFilingCacheEntry,
  ArtistFilingCacheStore,
  ArtistFilingOverride,
  ArtistFilingOverridesStore,
  ArtistFilingRow,
  ArtistMbidMapping,
  ExportCollectionRow,
  ExportWishlistRow,
  MasterYearCacheStore,
  MusicBrainzArtistMatch,
  RecordStoreFilingJobStatus,
  RecordStoreFilingStatus,
} from '../../../shared/types';
import { stripDiscogsSuffixes } from '../../../shared/utils/albumMapping';
import { FileStorage } from '../../utils/fileStorage';
import { createLogger } from '../../utils/logger';
import {
  createPocketCollator,
  filingParts,
  sectionFor,
} from '../pocketList/pocketListCollation';

import {
  FilingSnapshot,
  creditParts,
  filingNameKey,
  isFilingEntryDue,
  isVariousCredit,
  resolveArtistFiling,
} from './filingRules';

const log = createLogger('RecordStoreFiling');

export const ARTIST_FILING_CACHE_FILE = 'cache/artist-filing.json';
export const MASTER_YEAR_CACHE_FILE = 'cache/master-years.json';
export const ARTIST_FILING_OVERRIDES_FILE =
  'mappings/artist-filing-overrides.json';

/** Search results per lookup; a cut-off list of exact hits is ambiguous */
const SEARCH_LIMIT = 25;
/** Save the caches after this many lookups */
const SAVE_EVERY = 25;
/** Stop a queue after this many failures in a row (offline, no token) */
const MAX_CONSECUTIVE_FAILURES = 5;
const MAX_FILE_UNDER_LENGTH = 200;

export interface FilingRowSource {
  getCollectionRows(): Promise<ExportCollectionRow[]>;
  getWishlistRows(): Promise<ExportWishlistRow[]>;
}

export interface FilingMusicBrainz {
  getArtistById(mbid: string): Promise<MusicBrainzArtistMatch | null>;
  searchArtistWithCount(
    name: string,
    limit?: number
  ): Promise<{ artists: MusicBrainzArtistMatch[]; count: number }>;
}

export interface FilingMasters {
  getMasterYear(masterId: number): Promise<number | null>;
}

export interface FilingTrackerMappings {
  getArtistMappings(): Promise<ArtistMbidMapping[]>;
}

export class FilingOverrideError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FilingOverrideError';
  }
}

/** One distinct credit in the lists */
interface Credit {
  key: string;
  /** First spelling seen, suffixes stripped */
  artist: string;
  count: number;
}

function idleJob(): RecordStoreFilingJobStatus {
  return {
    running: false,
    startedAt: null,
    finishedAt: null,
    artistsDone: 0,
    artistsTotal: 0,
    mastersDone: 0,
    mastersTotal: 0,
    failures: 0,
    cancelled: false,
    error: null,
  };
}

/** Confirmed Discogs master ids (never a local want's search guess) */
function confirmedMasterIds(
  rows: Array<ExportCollectionRow | ExportWishlistRow>
): number[] {
  const ids = new Set<number>();
  for (const row of rows) {
    if (
      row.masterIdSource === 'release-data' &&
      row.masterId !== null &&
      row.masterId > 0
    ) {
      ids.add(row.masterId);
    }
  }
  return [...ids].sort((a, b) => a - b);
}

function creditsOf(
  rows: Array<ExportCollectionRow | ExportWishlistRow>
): Credit[] {
  const credits = new Map<string, Credit>();
  for (const row of rows) {
    if (isVariousCredit(row.artistDisplay)) continue;
    const artist = stripDiscogsSuffixes(row.artistDisplay).trim();
    if (!artist) continue;
    const key = filingNameKey(artist);
    const credit = credits.get(key);
    if (credit) credit.count++;
    else credits.set(key, { key, artist, count: 1 });
  }
  return [...credits.values()];
}

export class RecordStoreFilingService {
  private job: RecordStoreFilingJobStatus = idleJob();
  private cancelRequested = false;
  private refreshPromise: Promise<void> = Promise.resolve();
  private overrideWrites: Promise<unknown> = Promise.resolve();
  private readonly now: () => number;

  constructor(
    private readonly fileStorage: FileStorage,
    private readonly rows: FilingRowSource,
    private readonly musicBrainz: FilingMusicBrainz,
    private readonly masters: FilingMasters,
    private readonly tracker: FilingTrackerMappings,
    options: { now?: () => number } = {}
  ) {
    this.now = options.now ?? (() => Date.now());
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  /** Everything the filing rules read; no network */
  async getSnapshot(): Promise<FilingSnapshot> {
    const [artists, masters, overrides] = await Promise.all([
      this.readArtistCache(),
      this.readMasterCache(),
      this.readOverrides(),
    ]);
    return {
      artists: artists.entries,
      masterYears: masters.entries,
      overrides: new Map(overrides.map(o => [o.key, o])),
    };
  }

  async getStatus(): Promise<RecordStoreFilingStatus> {
    const [collection, wishlist, snapshot, mappings] = await Promise.all([
      this.rows.getCollectionRows(),
      this.rows.getWishlistRows(),
      this.getSnapshot(),
      this.trackerMappingsByKey(),
    ]);
    const rows = [...collection, ...wishlist];
    const now = this.now();
    const artists = {
      total: 0,
      musicbrainz: 0,
      override: 0,
      unmatched: 0,
      missing: 0,
    };
    for (const credit of creditsOf(rows)) {
      artists.total++;
      // An override files the artist whatever the cache says; otherwise a
      // lookup that is due (missing, expired, or its tracker mbid changed)
      // counts as missing even while an older result still files it
      const { source } = resolveArtistFiling(credit.artist, snapshot);
      if (source === 'override') artists.override++;
      else if (this.namesDue(credit.artist, snapshot, mappings, now).length > 0)
        artists.missing++;
      else if (source === 'musicbrainz') artists.musicbrainz++;
      else artists.unmatched++;
    }
    const masterIds = confirmedMasterIds(rows);
    const cached = masterIds.filter(
      id => snapshot.masterYears[String(id)] !== undefined
    ).length;
    return {
      artists,
      masters: {
        total: masterIds.length,
        cached,
        missing: masterIds.length - cached,
      },
      job: { ...this.job },
    };
  }

  /** Every credit in the lists, in filing order, with its filing */
  async listArtists(): Promise<ArtistFilingRow[]> {
    const [collection, wishlist, snapshot, mappings] = await Promise.all([
      this.rows.getCollectionRows(),
      this.rows.getWishlistRows(),
      this.getSnapshot(),
      this.trackerMappingsByKey(),
    ]);
    const now = this.now();
    const collator = createPocketCollator();
    const rows = creditsOf([...collection, ...wishlist]).map(credit => {
      const resolved = resolveArtistFiling(credit.artist, snapshot);
      const parts = filingParts(resolved.sortName);
      const entry = snapshot.artists[credit.key];
      const due = this.namesDue(credit.artist, snapshot, mappings, now);
      const row: ArtistFilingRow = {
        artist: credit.artist,
        key: credit.key,
        fileUnder: resolved.sortName,
        section: sectionFor(parts.head).label,
        source: resolved.source,
        filedAs: resolved.filedAs,
        lookup:
          entry && !due.includes(credit.artist) ? entry.status : 'missing',
        type: entry?.status === 'found' ? entry.type : null,
        override: snapshot.overrides.get(credit.key)?.fileUnder ?? null,
        count: credit.count,
      };
      return { row, parts, rank: sectionFor(parts.head).rank };
    });
    rows.sort(
      (a, b) =>
        a.rank - b.rank ||
        collator.compare(a.parts.head, b.parts.head) ||
        collator.compare(a.parts.tail, b.parts.tail) ||
        collator.compare(a.row.artist, b.row.artist) ||
        (a.row.key < b.row.key ? -1 : a.row.key > b.row.key ? 1 : 0)
    );
    return rows.map(r => r.row);
  }

  // ---------------------------------------------------------------------------
  // Overrides
  // ---------------------------------------------------------------------------

  /**
   * Set "file under" for an artist; an empty fileUnder removes it. Saves run
   * one at a time, so two quick edits never overwrite each other.
   */
  setOverride(
    artist: string,
    fileUnder: string
  ): Promise<ArtistFilingOverride | null> {
    const run = this.overrideWrites.then(() =>
      this.writeOverride(artist, fileUnder)
    );
    this.overrideWrites = run.catch(() => undefined);
    return run;
  }

  private async writeOverride(
    artist: string,
    fileUnder: string
  ): Promise<ArtistFilingOverride | null> {
    const name = stripDiscogsSuffixes(artist.normalize('NFC')).trim();
    const value = fileUnder.normalize('NFC').trim();
    if (!name) throw new FilingOverrideError('artist is required');
    if (value.length > MAX_FILE_UNDER_LENGTH) {
      throw new FilingOverrideError(
        `fileUnder must be at most ${MAX_FILE_UNDER_LENGTH} characters`
      );
    }
    const key = filingNameKey(name);
    const overrides = (await this.readOverrides()).filter(o => o.key !== key);
    const saved: ArtistFilingOverride | null = value
      ? { key, artist: name, fileUnder: value, updatedAt: this.now() }
      : null;
    if (saved) overrides.push(saved);
    overrides.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const store: ArtistFilingOverridesStore = { schemaVersion: 1, overrides };
    await this.fileStorage.writeJSONWithBackup(
      ARTIST_FILING_OVERRIDES_FILE,
      store
    );
    return saved;
  }

  // ---------------------------------------------------------------------------
  // Refresh job
  // ---------------------------------------------------------------------------

  isRunning(): boolean {
    return this.job.running;
  }

  /**
   * Start filling the caches in the background. Fetches what is missing or
   * due for a retry; `full` refetches everything. Returns at once; poll
   * getStatus(). Throws when a job is already running.
   */
  startRefresh(options: { full?: boolean } = {}): RecordStoreFilingJobStatus {
    if (this.job.running) {
      throw new Error('Filing refresh already running');
    }
    this.cancelRequested = false;
    this.job = { ...idleJob(), running: true, startedAt: this.now() };
    this.refreshPromise = this.refreshInner(options.full ?? false)
      .catch(error => {
        log.error('Filing refresh failed', error);
        this.job.error = error instanceof Error ? error.message : String(error);
      })
      .finally(() => {
        this.job.running = false;
        this.job.finishedAt = this.now();
      });
    return { ...this.job };
  }

  /** Ask a running job to stop after its current lookup */
  cancel(): boolean {
    if (!this.job.running) return false;
    this.cancelRequested = true;
    return true;
  }

  /** Resolves when the running job (if any) has finished */
  waitForRefresh(): Promise<void> {
    return this.refreshPromise;
  }

  private async refreshInner(full: boolean): Promise<void> {
    const [collection, wishlist, snapshot, mappings] = await Promise.all([
      this.rows.getCollectionRows(),
      this.rows.getWishlistRows(),
      this.getSnapshot(),
      this.trackerMappingsByKey(),
    ]);
    const rows = [...collection, ...wishlist];
    const now = this.now();

    const credits = creditsOf(rows);
    const artistQueue: string[] = [];
    const queued = new Set<string>();
    const enqueue = (name: string) => {
      const key = filingNameKey(name);
      if (queued.has(key)) return;
      queued.add(key);
      artistQueue.push(name);
    };
    for (const credit of credits) {
      const names = full
        ? [credit.artist]
        : this.namesDue(credit.artist, snapshot, mappings, now);
      names.forEach(enqueue);
    }

    const masterQueue = confirmedMasterIds(rows).filter(
      id => full || snapshot.masterYears[String(id)] === undefined
    );

    this.job.artistsTotal = artistQueue.length;
    this.job.mastersTotal = masterQueue.length;
    log.info('Filing refresh started', {
      artists: artistQueue.length,
      masters: masterQueue.length,
      full,
    });

    // Let both queues settle before the lock is released: a failed cache
    // write in one must not free the lock while the other still runs
    const results = await Promise.allSettled([
      this.refreshArtists(artistQueue, mappings, full, enqueue),
      this.refreshMasters(masterQueue),
    ]);
    const failed = results.find(
      (r): r is PromiseRejectedResult => r.status === 'rejected'
    );
    if (failed) throw failed.reason;

    this.job.cancelled = this.cancelRequested;
    log.info('Filing refresh finished', {
      artistsDone: this.job.artistsDone,
      mastersDone: this.job.mastersDone,
      failures: this.job.failures,
      cancelled: this.job.cancelled,
    });
  }

  private async refreshArtists(
    queue: string[],
    mappings: Map<string, ArtistMbidMapping>,
    full: boolean,
    enqueue: (name: string) => void
  ): Promise<void> {
    const cache = await this.readArtistCache();
    let pending = 0;
    let failuresInRow = 0;
    try {
      // The queue grows while it runs: a not-found collaboration adds its
      // first artist
      for (let i = 0; i < queue.length; i++) {
        if (this.cancelRequested) break;
        const name = queue[i];
        const key = filingNameKey(name);
        try {
          const entry = await this.lookupArtist(name, mappings.get(key));
          cache.entries[key] = entry;
          pending++;
          failuresInRow = 0;
          if (entry.status === 'not-found') {
            const parts = creditParts(name);
            const firstKey = parts.length > 1 ? filingNameKey(parts[0]) : null;
            if (
              firstKey !== null &&
              (full ||
                isFilingEntryDue(
                  cache.entries[firstKey],
                  mappings.get(firstKey)?.mbid,
                  this.now()
                ))
            ) {
              enqueue(parts[0]);
              this.job.artistsTotal = queue.length;
            }
          }
        } catch (error) {
          this.job.failures++;
          failuresInRow++;
          log.warn(`MusicBrainz lookup failed for "${name}"`, {
            error: error instanceof Error ? error.message : String(error),
          });
          if (failuresInRow >= MAX_CONSECUTIVE_FAILURES) {
            this.job.error = 'MusicBrainz is not responding; try again later';
            break;
          }
        }
        this.job.artistsDone++;
        if (pending >= SAVE_EVERY) {
          await this.fileStorage.writeJSON(ARTIST_FILING_CACHE_FILE, cache);
          pending = 0;
        }
      }
    } finally {
      if (pending > 0) {
        await this.fileStorage.writeJSON(ARTIST_FILING_CACHE_FILE, cache);
      }
    }
  }

  private async refreshMasters(queue: number[]): Promise<void> {
    const cache = await this.readMasterCache();
    let pending = 0;
    let failuresInRow = 0;
    try {
      for (const masterId of queue) {
        if (this.cancelRequested) break;
        try {
          const year = await this.masters.getMasterYear(masterId);
          cache.entries[String(masterId)] = { year, fetchedAt: this.now() };
          pending++;
          failuresInRow = 0;
        } catch (error) {
          this.job.failures++;
          failuresInRow++;
          log.warn(`Discogs master year failed for ${masterId}`, {
            error: error instanceof Error ? error.message : String(error),
          });
          if (failuresInRow >= MAX_CONSECUTIVE_FAILURES) {
            this.job.error = 'Discogs is not responding; try again later';
            break;
          }
        }
        this.job.mastersDone++;
        if (pending >= SAVE_EVERY) {
          await this.fileStorage.writeJSON(MASTER_YEAR_CACHE_FILE, cache);
          pending = 0;
        }
      }
    } finally {
      if (pending > 0) {
        await this.fileStorage.writeJSON(MASTER_YEAR_CACHE_FILE, cache);
      }
    }
  }

  /**
   * One MusicBrainz lookup. A tracker mapping is used when the user
   * confirmed it or MusicBrainz's canonical name equals ours; a user's
   * "none of these" stops the lookup. Otherwise a strict exact-name search.
   */
  async lookupArtist(
    name: string,
    mapping: ArtistMbidMapping | undefined
  ): Promise<ArtistFilingCacheEntry> {
    const key = filingNameKey(name);
    const fetchedAt = this.now();

    if (mapping?.mbid === null && mapping.confirmedBy === 'user') {
      return { name, status: 'none', mbid: null, fetchedAt };
    }
    if (mapping?.mbid) {
      const artist = await this.musicBrainz.getArtistById(mapping.mbid);
      if (
        artist?.sortName &&
        (mapping.confirmedBy === 'user' || filingNameKey(artist.name) === key)
      ) {
        return {
          name,
          status: 'found',
          sortName: artist.sortName,
          type: artist.type ?? null,
          mbid: mapping.mbid,
          via: 'mbid-map',
          fetchedAt,
        };
      }
    }

    const { artists, count } = await this.musicBrainz.searchArtistWithCount(
      name,
      SEARCH_LIMIT
    );
    const exact = artists.filter(
      a => a.sortName && filingNameKey(a.name) === key
    );
    if (exact.length === 0) return { name, status: 'not-found', fetchedAt };
    const last = artists[artists.length - 1];
    const truncated =
      count > artists.length && filingNameKey(last.name) === key;
    const filings = new Set(
      exact.map(a => `${a.sortName}\u0000${a.type ?? ''}`)
    );
    if (truncated || filings.size > 1) {
      return { name, status: 'ambiguous', fetchedAt };
    }
    return {
      name,
      status: 'found',
      sortName: exact[0].sortName as string,
      type: exact[0].type ?? null,
      mbid: exact.length === 1 ? exact[0].mbid : null,
      via: 'search',
      fetchedAt,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Names a refresh would look up for one credit: the credit when its entry
   * is due; or, for a not-found credit of several artists, its first artist
   * when that entry is due
   */
  private namesDue(
    credit: string,
    snapshot: FilingSnapshot,
    mappings: Map<string, ArtistMbidMapping>,
    now: number
  ): string[] {
    const key = filingNameKey(credit);
    const entry = snapshot.artists[key];
    if (isFilingEntryDue(entry, mappings.get(key)?.mbid, now)) return [credit];
    const parts = creditParts(credit);
    if (entry?.status !== 'not-found' || parts.length < 2) return [];
    const firstKey = filingNameKey(parts[0]);
    return isFilingEntryDue(
      snapshot.artists[firstKey],
      mappings.get(firstKey)?.mbid,
      now
    )
      ? [parts[0]]
      : [];
  }

  /** Release tracker mappings by filing key (first mapping wins) */
  private async trackerMappingsByKey(): Promise<
    Map<string, ArtistMbidMapping>
  > {
    let mappings: ArtistMbidMapping[] = [];
    try {
      mappings = await this.tracker.getArtistMappings();
    } catch (error) {
      log.warn('Could not read release tracker artist mappings', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    const byKey = new Map<string, ArtistMbidMapping>();
    for (const mapping of mappings) {
      const key = filingNameKey(mapping.discogsArtistName);
      if (!byKey.has(key)) byKey.set(key, mapping);
    }
    return byKey;
  }

  private async readArtistCache(): Promise<ArtistFilingCacheStore> {
    const store = await this.fileStorage
      .readJSON<ArtistFilingCacheStore>(ARTIST_FILING_CACHE_FILE)
      .catch(() => null);
    return store?.schemaVersion === 1 && store.entries
      ? store
      : { schemaVersion: 1, entries: {} };
  }

  private async readMasterCache(): Promise<MasterYearCacheStore> {
    const store = await this.fileStorage
      .readJSON<MasterYearCacheStore>(MASTER_YEAR_CACHE_FILE)
      .catch(() => null);
    return store?.schemaVersion === 1 && store.entries
      ? store
      : { schemaVersion: 1, entries: {} };
  }

  private async readOverrides(): Promise<ArtistFilingOverride[]> {
    const store = await this.fileStorage
      .readJSON<ArtistFilingOverridesStore>(ARTIST_FILING_OVERRIDES_FILE)
      .catch(() => null);
    return store?.schemaVersion === 1 && Array.isArray(store.overrides)
      ? store.overrides
      : [];
  }
}
