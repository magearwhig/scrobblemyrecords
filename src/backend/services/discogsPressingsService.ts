import axios, { AxiosInstance } from 'axios';

import {
  DiscogsPressingsMaster,
  DiscogsPressingsStore,
  DiscogsPressingVersion,
  ReleaseVersion,
  VersionsCache,
  WishlistNewRelease,
} from '../../shared/types';
import { getDiscogsAxios } from '../utils/discogsAxios';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

const CATALOGUE_FILE = 'discogs/pressings.json';
const PER_PAGE = 100; // Discogs maximum

// Files the catalogue replaces; moved aside once imported
const LEGACY_SELLER_CACHE = 'sellers/release-master-cache.json';
const LEGACY_VERSIONS_CACHE = 'wishlist/versions-cache.json';
const LEGACY_KNOWN_PRESSINGS = 'wishlist/known-pressings.json';
const LEGACY_FILES = [
  LEGACY_SELLER_CACHE,
  LEGACY_VERSIONS_CACHE,
  LEGACY_KNOWN_PRESSINGS,
];
/** Where an imported legacy file is kept (FileStorage allows one dot) */
const legacyBackupPath = (path: string) =>
  path.replace(/\.json$/, '-pre-catalogue.bak');
// Read during import, still owned by WishlistService
const NEW_RELEASES_FILE = 'wishlist/new-releases.json';
const WISHLIST_ITEMS_FILE = 'wishlist/wishlist-items.json';

/**
 * How long a list of every pressing of a master is used before every page is
 * fetched again (seller matching, CD-only checks, undated pressings)
 */
export const MASTER_COMPLETE_FRESH_MS = 30 * 24 * 60 * 60 * 1000;

const VINYL_FORMATS = [
  'vinyl',
  'lp',
  '12"',
  '10"',
  '7"',
  "12''",
  "10''",
  "7''",
];

/** Whether a Discogs format list is a vinyl format */
export function isVinylFormat(formats: string[]): boolean {
  const formatStr = formats.join(' ').toLowerCase();
  return VINYL_FORMATS.some(f => formatStr.includes(f));
}

/** A row of Discogs /masters/:id/versions */
export interface DiscogsVersionRow {
  id: number;
  title?: string;
  format?: string;
  label?: string;
  country?: string;
  released?: string;
}

/** Turn a row of Discogs /masters/:id/versions into a ReleaseVersion */
export function toReleaseVersion(v: DiscogsVersionRow): ReleaseVersion {
  const format = v.format ? v.format.split(', ') : [];
  const year = v.released ? parseInt(v.released.substring(0, 4), 10) : 0;
  return {
    releaseId: v.id,
    title: v.title || '',
    format,
    label: v.label || '',
    country: v.country || '',
    year: Number.isFinite(year) ? year : 0,
    hasVinyl: isVinylFormat(format),
    lastFetched: Date.now(),
  };
}

/** How much of a master's pressing list a fetch returned */
export type PressingCoverage = 'complete' | 'newest' | 'partial';

/**
 * Decides who cares about newly seen pressings and raises alerts. Runs inside
 * the catalogue's commit queue, so it must not call `exclusive`. If it throws,
 * the pressings are not remembered and are offered again next time.
 */
export type PressingsDetector = (
  masterId: number,
  candidates: ReleaseVersion[],
  context: { alertOverride: boolean }
) => Promise<WishlistNewRelease[]>;

export interface PressingsRequest {
  /**
   * `newest`: the newest 100 pressings are enough (new-pressing checks,
   * vinyl status). `complete`: every pressing (seller matching).
   */
  need: 'newest' | 'complete';
  /** Use the stored list if it was fetched this recently */
  maxAgeMs: number;
  /** Raise alerts even when tracking is switched off (a manual check) */
  alertOverride?: boolean;
  /**
   * Only learn pressings, flagging nothing: a further fetch that is part of
   * a record's first look (whose first fetch started the baseline)
   */
  learnOnly?: boolean;
}

export interface PressingsResult {
  /** Pressings with details, newest first */
  versions: ReleaseVersion[];
  /** Every pressing known for the master, with or without details */
  releaseIds: number[];
  /** Whether Discogs was asked this time */
  fetched: boolean;
  /** Whether that fetch failed part-way (what came back is still kept) */
  failed: boolean;
  /** Alerts raised for pressings seen for the first time */
  alerts: WishlistNewRelease[];
}

/**
 * The one store of Discogs master -> pressings data. Every feature that needs
 * a master's pressings (wishlist vinyl status, new-pressing checks, seller
 * listing matching) asks here; each fetch is merged into the catalogue and
 * checked for pressings not seen before.
 */
export class DiscogsPressingsService {
  private axios: AxiosInstance;
  private logger = createLogger('DiscogsPressingsService');
  private store: DiscogsPressingsStore | null = null;
  private loading: Promise<DiscogsPressingsStore> | null = null;
  private byMaster = new Map<number, Set<number>>();
  private queue: Promise<unknown> = Promise.resolve();
  private inflight = new Map<number, Promise<PressingsResult>>();
  /** Bumped by every in-memory change; a save covers the changes up to it */
  private changes = 0;
  private savedChanges = 0;
  private detector: PressingsDetector | null = null;
  private readonly retryDelayMs: number;
  private readonly maxRetries: number;

  constructor(
    private fileStorage: FileStorage,
    private getAuthHeaders: () => Promise<Record<string, string>>,
    options: { retryDelayMs?: number; maxRetries?: number } = {}
  ) {
    this.axios = getDiscogsAxios();
    this.retryDelayMs = options.retryDelayMs ?? 2000;
    this.maxRetries = options.maxRetries ?? 3;
  }

  setDetector(detector: PressingsDetector): void {
    this.detector = detector;
  }

  /**
   * Run `fn` after every earlier queued call finishes. Catalogue commits and
   * the wishlist's new-release writes all go through here.
   */
  exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  // ============================================
  // Reading
  // ============================================

  /**
   * A master's pressings: from the catalogue when fetched recently enough for
   * `need`, otherwise from Discogs (merged into the catalogue first).
   */
  async getPressings(
    masterId: number,
    request: PressingsRequest
  ): Promise<PressingsResult> {
    await this.load();

    // Wait for a fetch of this master already under way, then see whether it
    // was enough
    for (;;) {
      const running = this.inflight.get(masterId);
      if (!running) break;
      await running.catch(() => undefined);
    }
    if (this.isFresh(masterId, request)) {
      return this.resultFromStore(masterId, {
        fetched: false,
        failed: false,
        alerts: [],
      });
    }

    const fetching = this.fetchAndRecord(masterId, request);
    this.inflight.set(masterId, fetching);
    try {
      return await fetching;
    } finally {
      if (this.inflight.get(masterId) === fetching) {
        this.inflight.delete(masterId);
      }
    }
  }

  /** A master's known pressings with details, newest first, without fetching */
  async knownVersions(masterId: number): Promise<ReleaseVersion[]> {
    await this.load();
    return this.versionsOf(this.byMaster.get(masterId) ?? []);
  }

  /** The master a release belongs to, if the catalogue knows it */
  async masterOf(releaseId: number): Promise<number | undefined> {
    const store = await this.load();
    return store.releases[releaseId]?.masterId;
  }

  /** When a master's pressings were last fetched, and how many are known */
  async masterStatus(
    masterId: number
  ): Promise<DiscogsPressingsMaster & { knownCount: number }> {
    const store = await this.load();
    return {
      ...(store.masters[masterId] ?? {}),
      knownCount: this.byMaster.get(masterId)?.size ?? 0,
    };
  }

  async stats(): Promise<{ totalReleases: number; totalMasters: number }> {
    const store = await this.load();
    return {
      totalReleases: Object.keys(store.releases).length,
      totalMasters: this.byMaster.size,
    };
  }

  /** The catalogue in the old versions-cache shape (data export) */
  async versionsCacheView(): Promise<VersionsCache> {
    const store = await this.load();
    const entries: VersionsCache['entries'] = {};
    for (const [masterId, releaseIds] of this.byMaster) {
      const versions = this.versionsOf(releaseIds);
      if (versions.length === 0) continue;
      const master = store.masters[masterId];
      entries[masterId] = {
        masterId,
        versions,
        fetchedAt: master?.newestCheckedAt ?? master?.completeCheckedAt ?? 0,
      };
    }
    return { schemaVersion: 1, entries };
  }

  // ============================================
  // Writing
  // ============================================

  /**
   * Remember which master a release belongs to (from a /releases lookup).
   * Kept in memory until `flush`, since seller scans note thousands.
   */
  async noteReleaseMaster(releaseId: number, masterId: number): Promise<void> {
    const store = await this.load();
    if (store.releases[releaseId]) return;
    store.releases[releaseId] = { masterId, firstSeenAt: Date.now() };
    this.index(releaseId, masterId);
    this.changes++;
  }

  /** Save release lookups noted since the last save */
  async flush(): Promise<void> {
    await this.exclusive(async () => {
      if (this.changes !== this.savedChanges) await this.persist();
    });
  }

  // ============================================
  // Fetching
  // ============================================

  private isFresh(masterId: number, request: PressingsRequest): boolean {
    const master = this.store?.masters[masterId];
    const checkedAt =
      request.need === 'complete'
        ? master?.completeCheckedAt
        : Math.max(
            master?.newestCheckedAt ?? -Infinity,
            master?.completeCheckedAt ?? -Infinity
          );
    return (
      checkedAt !== undefined &&
      Number.isFinite(checkedAt) &&
      Date.now() - checkedAt < request.maxAgeMs
    );
  }

  private async fetchAndRecord(
    masterId: number,
    request: PressingsRequest
  ): Promise<PressingsResult> {
    const fetched: ReleaseVersion[] = [];
    let coverage: PressingCoverage = 'partial';
    let failed = false;

    try {
      const headers = await this.getAuthHeaders();
      for (let page = 1; ; page++) {
        const response = await this.withRetry(
          () =>
            this.axios.get(`/masters/${masterId}/versions`, {
              headers,
              params: {
                page,
                per_page: PER_PAGE,
                sort: 'released',
                sort_order: 'desc',
              },
            }),
          `versions of master ${masterId} page ${page}`
        );
        const rows: DiscogsVersionRow[] = response.data?.versions ?? [];
        for (const row of rows) {
          if (row?.id) fetched.push(toReleaseVersion(row));
        }

        const pages: number = response.data?.pagination?.pages ?? 1;
        if (rows.length === 0 || page >= pages) {
          coverage = 'complete';
          break;
        }
        if (request.need === 'newest') {
          coverage = 'newest';
          break;
        }
      }
    } catch (error) {
      failed = true;
      coverage = 'partial';
      this.logger.warn(
        `Failed to fetch pressings for master ${masterId}`,
        error
      );
    }

    const alerts = await this.record(masterId, fetched, coverage, request);
    return this.resultFromStore(masterId, { fetched: true, failed, alerts });
  }

  /**
   * Merge a fetch into the catalogue. For a master with a baseline, vinyl
   * pressings not seen before go to the detector first: released last year or
   * later, or undated once a complete list had been seen (newest-first lists
   * can leave undated ones out). Older ones newly listed on Discogs are not
   * new releases. The first newest/complete fetch only starts the baseline.
   */
  private record(
    masterId: number,
    versions: ReleaseVersion[],
    coverage: PressingCoverage,
    { alertOverride = false, learnOnly = false }: PressingsRequest
  ): Promise<WishlistNewRelease[]> {
    return this.exclusive(async () => {
      const store = await this.load();
      const master: DiscogsPressingsMaster = {
        ...(store.masters[masterId] ?? {}),
      };

      let alerts: WishlistNewRelease[] = [];
      if (master.baselineSince && !learnOnly && this.detector) {
        const minYear = new Date().getFullYear() - 1;
        const seen = new Set<number>();
        const candidates = versions.filter(v => {
          // Known under any master: Discogs sometimes moves a pressing to
          // another master, which doesn't make it a new release
          if (store.releases[v.releaseId] || seen.has(v.releaseId)) {
            return false;
          }
          seen.add(v.releaseId);
          if (!v.hasVinyl) return false;
          return v.year === 0 ? !!master.everComplete : v.year >= minYear;
        });
        if (candidates.length > 0) {
          // Alerts are saved before the pressings, so a failure here means
          // they are offered again next time rather than lost
          alerts = await this.detector(masterId, candidates, { alertOverride });
        }
      }

      const now = Date.now();
      for (const version of versions) {
        const existing = store.releases[version.releaseId];
        if (existing && existing.masterId !== masterId) {
          // Moved to this master on Discogs
          this.byMaster.get(existing.masterId)?.delete(version.releaseId);
        }
        store.releases[version.releaseId] = {
          masterId,
          version: stripVersion(version),
          firstSeenAt: existing?.firstSeenAt ?? now,
        };
        this.index(version.releaseId, masterId);
      }

      this.changes++;

      if (coverage !== 'partial') {
        master.baselineSince = master.baselineSince ?? now;
        master.newestCheckedAt = now;
        if (coverage === 'complete') {
          master.completeCheckedAt = now;
          master.everComplete = true;
        }
        store.masters[masterId] = master;
      }

      if (versions.length > 0 || coverage !== 'partial') {
        await this.persist();
      }
      if (alerts.length > 0) {
        this.logger.info(
          `${alerts.length} new pressing(s) for master ${masterId}`
        );
      }
      return alerts;
    });
  }

  private async withRetry<T>(fn: () => Promise<T>, what: string): Promise<T> {
    let delay = this.retryDelayMs;
    for (let attempt = 1; ; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (attempt >= this.maxRetries || !isRetryable(error)) throw error;
        this.logger.warn(
          `Retrying ${what} (${attempt}/${this.maxRetries}) in ${delay}ms`
        );
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, 60000);
      }
    }
  }

  // ============================================
  // Storage
  // ============================================

  private resultFromStore(
    masterId: number,
    extra: Omit<PressingsResult, 'versions' | 'releaseIds'>
  ): PressingsResult {
    const releaseIds = Array.from(this.byMaster.get(masterId) ?? []);
    return { versions: this.versionsOf(releaseIds), releaseIds, ...extra };
  }

  private versionsOf(releaseIds: Iterable<number>): ReleaseVersion[] {
    const versions: ReleaseVersion[] = [];
    for (const releaseId of releaseIds) {
      const version = this.store?.releases[releaseId]?.version;
      if (version) versions.push({ releaseId, ...version });
    }
    // Newest first; undated last
    const dated = (year: number) => (year > 0 ? year : 0);
    return versions.sort(
      (a, b) => dated(b.year) - dated(a.year) || b.releaseId - a.releaseId
    );
  }

  private index(releaseId: number, masterId: number): void {
    let releases = this.byMaster.get(masterId);
    if (!releases) {
      releases = new Set();
      this.byMaster.set(masterId, releases);
    }
    releases.add(releaseId);
  }

  /**
   * Write the catalogue. If the write fails, memory keeps the changes and a
   * later save retries them: alerts were saved first and are deduplicated, so
   * a pressing that reaches disk late is never flagged twice.
   */
  private async persist(): Promise<void> {
    if (!this.store) return;
    const upTo = this.changes;
    await this.fileStorage.writeJSON(CATALOGUE_FILE, this.store);
    // Changes made while this write was in progress are saved next time
    this.savedChanges = Math.max(this.savedChanges, upTo);
  }

  private load(): Promise<DiscogsPressingsStore> {
    if (this.store) return Promise.resolve(this.store);
    if (!this.loading) {
      this.loading = this.readOrMigrate().then(
        store => {
          this.store = store;
          this.byMaster.clear();
          for (const [releaseId, row] of Object.entries(store.releases)) {
            this.index(Number(releaseId), row.masterId);
          }
          return store;
        },
        error => {
          this.loading = null;
          throw error;
        }
      );
    }
    return this.loading;
  }

  /**
   * Read the catalogue. Only a missing file starts a new one (imported from
   * the old caches); a file that can't be read stops here, so it is never
   * written over.
   */
  private async readOrMigrate(): Promise<DiscogsPressingsStore> {
    if (await this.fileStorage.exists(CATALOGUE_FILE)) {
      const store =
        await this.fileStorage.readJSON<DiscogsPressingsStore>(CATALOGUE_FILE);
      if (
        !store ||
        store.schemaVersion !== 1 ||
        !store.releases ||
        !store.masters
      ) {
        throw new Error(
          `${CATALOGUE_FILE} could not be read; not changing it. Restore it from a backup or move it aside to rebuild.`
        );
      }
      await this.retireLegacyFiles();
      return store;
    }
    return this.migrate();
  }

  /**
   * Move imported legacy files aside so they are never read again. Also
   * finishes the job if an earlier import stopped after writing the catalogue.
   */
  private async retireLegacyFiles(): Promise<void> {
    for (const path of LEGACY_FILES) {
      if (!(await this.fileStorage.exists(path))) continue;
      const data = await this.fileStorage.readJSON<unknown>(path);
      // Unreadable: leave it where it is rather than lose it
      if (data === null) continue;
      await this.fileStorage.writeJSON(legacyBackupPath(path), data);
      await this.fileStorage.delete(path);
    }
  }

  /**
   * Build the catalogue from the caches it replaces. Nothing is flagged:
   * baselines are kept only where the new-pressing check recorded one.
   */
  private async migrate(): Promise<DiscogsPressingsStore> {
    const now = Date.now();
    const store: DiscogsPressingsStore = {
      schemaVersion: 1,
      releases: {},
      masters: {},
    };
    const addId = (releaseId: number, masterId: number) => {
      if (!releaseId || !masterId) return;
      store.releases[releaseId] ??= { masterId, firstSeenAt: now };
    };
    const addVersion = (
      masterId: number,
      version: Partial<ReleaseVersion> & { releaseId: number }
    ) => {
      if (!version?.releaseId || !masterId) return;
      const existing = store.releases[version.releaseId];
      store.releases[version.releaseId] = {
        masterId: existing?.masterId ?? masterId,
        version: stripVersion(version),
        firstSeenAt: existing?.firstSeenAt ?? now,
      };
    };

    const seller = await this.readLegacy<{
      releaseToMaster?: Record<string, number>;
      masterToReleases?: Record<string, { releases?: number[] } | number[]>;
    }>(LEGACY_SELLER_CACHE);
    for (const [releaseId, masterId] of Object.entries(
      seller?.releaseToMaster ?? {}
    )) {
      addId(Number(releaseId), masterId);
    }
    for (const [masterId, entry] of Object.entries(
      seller?.masterToReleases ?? {}
    )) {
      const releases = Array.isArray(entry) ? entry : (entry?.releases ?? []);
      for (const releaseId of releases) addId(releaseId, Number(masterId));
    }

    const alerts = await this.readLegacy<{ releases?: WishlistNewRelease[] }>(
      NEW_RELEASES_FILE
    );
    for (const alert of alerts?.releases ?? []) {
      addVersion(alert.masterId, { ...alert, hasVinyl: true });
    }

    const wishlist = await this.readLegacy<{
      items?: { masterId?: number; vinylVersions?: ReleaseVersion[] }[];
    }>(WISHLIST_ITEMS_FILE);
    for (const item of wishlist?.items ?? []) {
      for (const version of item.vinylVersions ?? []) {
        addVersion(item.masterId ?? 0, version);
      }
    }

    const versionsCache = await this.readLegacy<VersionsCache>(
      LEGACY_VERSIONS_CACHE
    );
    for (const entry of Object.values(versionsCache?.entries ?? {})) {
      for (const version of entry?.versions ?? []) {
        addVersion(entry.masterId, version);
      }
    }

    const known = await this.readLegacy<{
      masters?: Record<
        string,
        {
          releaseIds?: number[];
          checkedAt?: number;
          complete?: boolean;
          updatedAt?: number;
        }
      >;
    }>(LEGACY_KNOWN_PRESSINGS);
    for (const [id, entry] of Object.entries(known?.masters ?? {})) {
      const masterId = Number(id);
      for (const releaseId of entry.releaseIds ?? []) {
        addId(releaseId, masterId);
      }
      store.masters[masterId] = {
        // No check date: its pressing details weren't kept, so the next
        // request fetches them (against this baseline)
        baselineSince: entry.checkedAt ?? entry.updatedAt ?? now,
        ...(entry.complete ? { everComplete: true } : {}),
      };
    }

    await this.fileStorage.writeJSON(CATALOGUE_FILE, store);
    await this.retireLegacyFiles();

    this.logger.info(
      `Built the pressings catalogue: ${Object.keys(store.releases).length} pressings, ${Object.keys(store.masters).length} masters with a baseline`
    );
    return store;
  }

  private async readLegacy<T>(path: string): Promise<T | null> {
    if (!(await this.fileStorage.exists(path))) return null;
    return this.fileStorage.readJSON<T>(path);
  }
}

function stripVersion(
  version: Partial<ReleaseVersion>
): DiscogsPressingVersion {
  const format = version.format ?? [];
  return {
    title: version.title ?? '',
    format,
    label: version.label ?? '',
    country: version.country ?? '',
    year: version.year ?? 0,
    hasVinyl: version.hasVinyl ?? isVinylFormat(format),
  };
}

function isRetryable(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  if (status === 429 || status === 503) return true;
  return (
    !error.response &&
    !!error.code &&
    [
      'ETIMEDOUT',
      'ECONNRESET',
      'ECONNREFUSED',
      'ENOTFOUND',
      'EAI_AGAIN',
    ].includes(error.code)
  );
}
