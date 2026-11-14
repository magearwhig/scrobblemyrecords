import {
  AlbumLabelInfo,
  AlbumLabelSource,
  AlbumLabelStatus,
} from '../../shared/types';
import { albumNameKey } from '../../shared/utils/albumMapping';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

export type { AlbumLabelInfo, AlbumLabelSource, AlbumLabelStatus };

const CACHE_FILE = 'cache/album-labels.json';
const OVERRIDES_FILE = 'mappings/album-label-overrides.json';

const DAY_MS = 24 * 60 * 60 * 1000;
/** A found or unsure label is checked again after a year */
const RECHECK_FOUND_MS = 365 * DAY_MS;
/** An album nothing was found for is tried again after 90 days */
const RECHECK_NONE_MS = 90 * DAY_MS;

/** An album to find a label for (history names, after album mappings) */
export interface AlbumLabelCandidate {
  /** Album key lookups are stored under (defaults to keyFor(artist, album)) */
  key?: string;
  artist: string;
  album: string;
  /** MusicBrainz release MBID Last.fm reported, if any */
  mbid?: string;
  playCount: number;
  lastPlayed: number;
}

export interface LabelFinderResult {
  labels: string[];
  /** 'unsure': a likely match that isn't counted until the owner confirms it */
  status: 'found' | 'unsure';
  matchedArtist?: string;
  matchedTitle?: string;
  year?: number;
}

export type LabelFinder = (query: {
  artist: string;
  album: string;
  mbid?: string;
}) => Promise<LabelFinderResult | null>;

interface CachedLookup {
  labels: string[];
  status: 'found' | 'unsure' | 'none';
  source?: 'musicbrainz' | 'discogs';
  matchedArtist?: string;
  matchedTitle?: string;
  year?: number;
  checkedAt: number;
}

interface LookupCache {
  schemaVersion: 1;
  albums: Record<string, CachedLookup>;
}

/** An owner-set label for an album (key: history artist|album) */
export interface AlbumLabelOverride {
  key: string;
  labels: string[];
  setAt: number;
}

export interface AlbumLabelOverridesStore {
  schemaVersion: 1;
  overrides: AlbumLabelOverride[];
}

interface OverrideStore {
  schemaVersion: 1;
  overrides: Record<string, { labels: string[]; setAt: number }>;
}

/**
 * Labels for albums the owner doesn't own, looked up in the background
 * (MusicBrainz first, then Discogs) and cached, plus the owner's own
 * corrections, which always win. Albums are keyed by history artist|album
 * after album mappings.
 */
export class AlbumLabelService {
  private logger = createLogger('AlbumLabelService');
  private cache: Promise<LookupCache> | null = null;
  private overrides: Promise<OverrideStore> | null = null;
  private writeQueue: Promise<unknown> = Promise.resolve();
  private running = false;
  private lastRunAt?: number;
  private initialTimer: NodeJS.Timeout | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;
  private readonly now: () => number;
  /**
   * Names the album a lookup belongs to. The server passes the album
   * grouping key (artist aliases, album mappings and spelling differences
   * give the same key), so an album page and the label pages agree.
   */
  private readonly keyFor: (
    artist: string,
    album: string
  ) => Promise<string> | string;

  constructor(
    private fileStorage: FileStorage,
    private finders: { musicbrainz?: LabelFinder; discogs?: LabelFinder },
    options: {
      now?: () => number;
      keyFor?: (artist: string, album: string) => Promise<string> | string;
    } = {}
  ) {
    this.now = options.now ?? Date.now;
    this.keyFor = options.keyFor ?? albumNameKey;
  }

  private async candidateKey(candidate: AlbumLabelCandidate): Promise<string> {
    return (
      candidate.key ?? (await this.keyFor(candidate.artist, candidate.album))
    );
  }

  // ---------------------------------------------------------------------------
  // Reading
  // ---------------------------------------------------------------------------

  async get(artist: string, album: string): Promise<AlbumLabelInfo | null> {
    const key = await this.keyFor(artist, album);
    const [cache, overrides] = await Promise.all([
      this.loadCache(),
      this.loadOverrides(),
    ]);
    return this.effective(cache.albums[key], overrides.overrides[key]);
  }

  /** Every album with a label the label pages can count, by album key */
  async getAll(): Promise<Map<string, AlbumLabelInfo>> {
    const [cache, overrides] = await Promise.all([
      this.loadCache(),
      this.loadOverrides(),
    ]);
    const result = new Map<string, AlbumLabelInfo>();
    const keys = new Set([
      ...Object.keys(cache.albums),
      ...Object.keys(overrides.overrides),
    ]);
    for (const key of keys) {
      const info = this.effective(cache.albums[key], overrides.overrides[key]);
      if (info) result.set(key, info);
    }
    return result;
  }

  async getStatus(
    candidates: AlbumLabelCandidate[]
  ): Promise<AlbumLabelStatus> {
    const [cache, overrides] = await Promise.all([
      this.loadCache(),
      this.loadOverrides(),
    ]);
    const status: AlbumLabelStatus = {
      total: candidates.length,
      checked: 0,
      found: 0,
      unsure: 0,
      notFound: 0,
      overridden: 0,
      pending: 0,
      running: this.running,
      lastRunAt: this.lastRunAt,
    };
    for (const candidate of candidates) {
      const key = await this.candidateKey(candidate);
      if (overrides.overrides[key]) {
        status.overridden++;
        status.checked++;
        continue;
      }
      const cached = cache.albums[key];
      if (!cached) {
        status.pending++;
        continue;
      }
      status.checked++;
      if (cached.status === 'found') status.found++;
      else if (cached.status === 'unsure') status.unsure++;
      else status.notFound++;
    }
    return status;
  }

  // ---------------------------------------------------------------------------
  // Owner corrections
  // ---------------------------------------------------------------------------

  /** Set the labels for an album; [] means "don't count it on any label" */
  async setOverride(
    artist: string,
    album: string,
    labels: string[]
  ): Promise<void> {
    const cleaned = Array.from(
      new Set(labels.map(label => label.trim()).filter(Boolean))
    );
    const key = await this.keyFor(artist, album);
    await this.updateOverrides(store => {
      store.overrides[key] = {
        labels: cleaned,
        setAt: this.now(),
      };
    });
  }

  async clearOverride(artist: string, album: string): Promise<void> {
    const key = await this.keyFor(artist, album);
    await this.updateOverrides(store => {
      delete store.overrides[key];
    });
  }

  /** Accept the looked-up labels (e.g. an unsure match) as the owner's own */
  async confirm(artist: string, album: string): Promise<void> {
    const key = await this.keyFor(artist, album);
    const cached = (await this.loadCache()).albums[key];
    await this.setOverride(artist, album, cached?.labels ?? []);
  }

  /** The looked-up labels are wrong: count the album on no label */
  async reject(artist: string, album: string): Promise<void> {
    await this.setOverride(artist, album, []);
  }

  // ---------------------------------------------------------------------------
  // Lookups
  // ---------------------------------------------------------------------------

  /**
   * Look up up to `max` albums that need it, most recently played first.
   * Returns how many were looked up.
   */
  async scan(candidates: AlbumLabelCandidate[], max: number): Promise<number> {
    const [cache, overrides] = await Promise.all([
      this.loadCache(),
      this.loadOverrides(),
    ]);
    const keyed = await Promise.all(
      candidates.map(async candidate => ({
        candidate,
        key: await this.candidateKey(candidate),
      }))
    );
    const due = keyed
      .filter(
        ({ key }) => !overrides.overrides[key] && this.isDue(cache.albums[key])
      )
      .sort((a, b) => b.candidate.lastPlayed - a.candidate.lastPlayed)
      .slice(0, max);

    let looked = 0;
    for (const { candidate, key } of due) {
      const result = await this.lookup(candidate);
      if (result === undefined) continue; // failed: try again next time
      cache.albums[key] = result;
      looked++;
    }
    if (looked > 0) {
      await this.enqueueWrite(() =>
        this.fileStorage.writeJSON(CACHE_FILE, cache)
      );
    }
    this.lastRunAt = this.now();
    return looked;
  }

  /**
   * Run `scan` in the background: first after `initialDelayMs`, then every
   * `intervalMs`, `batchSize` albums at a time.
   */
  start(
    getCandidates: () => Promise<AlbumLabelCandidate[]>,
    options: { initialDelayMs: number; intervalMs: number; batchSize: number }
  ): void {
    if (this.initialTimer || this.intervalTimer) return;
    const run = async () => {
      if (this.running) return;
      this.running = true;
      try {
        await this.scan(await getCandidates(), options.batchSize);
      } catch (error) {
        this.logger.warn('Album label lookup failed', error);
      } finally {
        this.running = false;
      }
    };
    this.initialTimer = setTimeout(() => {
      this.initialTimer = null;
      void run();
      this.intervalTimer = setInterval(() => void run(), options.intervalMs);
      this.intervalTimer.unref?.();
    }, options.initialDelayMs);
    this.initialTimer.unref?.();
  }

  stop(): void {
    if (this.initialTimer) clearTimeout(this.initialTimer);
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    this.initialTimer = null;
    this.intervalTimer = null;
  }

  /** undefined when a lookup failed (network, rate limit), so it's retried */
  private async lookup(
    candidate: AlbumLabelCandidate
  ): Promise<CachedLookup | undefined> {
    const query = {
      artist: candidate.artist,
      album: candidate.album,
      mbid: candidate.mbid,
    };
    try {
      for (const source of ['musicbrainz', 'discogs'] as const) {
        const finder = this.finders[source];
        if (!finder) continue;
        const result = await finder(query);
        if (result && result.labels.length > 0) {
          return {
            ...result,
            source,
            checkedAt: this.now(),
          };
        }
      }
      return { labels: [], status: 'none', checkedAt: this.now() };
    } catch (error) {
      this.logger.debug(
        `Label lookup failed for ${candidate.artist} - ${candidate.album}`,
        error
      );
      return undefined;
    }
  }

  private isDue(cached: CachedLookup | undefined): boolean {
    if (!cached) return true;
    const age = this.now() - cached.checkedAt;
    return cached.status === 'none'
      ? age > RECHECK_NONE_MS
      : age > RECHECK_FOUND_MS;
  }

  private effective(
    cached: CachedLookup | undefined,
    override: { labels: string[] } | undefined
  ): AlbumLabelInfo | null {
    if (override) {
      return {
        labels: override.labels,
        source: 'override',
        status: 'override',
      };
    }
    if (!cached || !cached.source) {
      return cached
        ? { labels: [], source: 'musicbrainz', status: 'none' }
        : null;
    }
    const info: AlbumLabelInfo = {
      labels: cached.labels,
      source: cached.source,
      status: cached.status,
    };
    if (cached.matchedArtist) info.matchedArtist = cached.matchedArtist;
    if (cached.matchedTitle) info.matchedTitle = cached.matchedTitle;
    if (cached.year) info.year = cached.year;
    return info;
  }

  // ---------------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------------

  // Loads are shared promises, so callers arriving together get one store
  private loadCache(): Promise<LookupCache> {
    this.cache ??= this.fileStorage
      .readJSON<LookupCache>(CACHE_FILE)
      .catch(() => null)
      .then(stored =>
        stored?.albums ? stored : { schemaVersion: 1 as const, albums: {} }
      );
    return this.cache;
  }

  private loadOverrides(): Promise<OverrideStore> {
    this.overrides ??= this.fileStorage
      .readJSON<AlbumLabelOverridesStore>(OVERRIDES_FILE)
      .catch(() => null)
      .then(stored => {
        const overrides: OverrideStore['overrides'] = {};
        for (const entry of Array.isArray(stored?.overrides)
          ? stored.overrides
          : []) {
          overrides[entry.key] = { labels: entry.labels, setAt: entry.setAt };
        }
        return { schemaVersion: 1 as const, overrides };
      });
    return this.overrides;
  }

  private async updateOverrides(
    change: (store: OverrideStore) => void
  ): Promise<void> {
    const store = await this.loadOverrides();
    change(store);
    const file: AlbumLabelOverridesStore = {
      schemaVersion: 1,
      overrides: Object.entries(store.overrides).map(([key, entry]) => ({
        key,
        labels: entry.labels,
        setAt: entry.setAt,
      })),
    };
    await this.enqueueWrite(() =>
      this.fileStorage.writeJSONWithBackup(OVERRIDES_FILE, file)
    );
  }

  /** Forget loaded files, e.g. after a backup restore rewrote them */
  clearCache(): void {
    this.cache = null;
    this.overrides = null;
  }

  private enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
    const run = this.writeQueue.then(task);
    this.writeQueue = run.catch(() => undefined);
    return run;
  }
}
