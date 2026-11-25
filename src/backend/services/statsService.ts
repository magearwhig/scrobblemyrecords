import { createHash } from 'crypto';

import {
  AlbumArcBucket,
  AlbumDetailResponse,
  AlbumDetailMergedTrack,
  AlbumDetailTrack,
  AlbumHistoryEntry,
  AlbumMapping,
  AlbumPlayCount,
  ArtistDetailResponse,
  LabelDetailResponse,
  LabelPlayCount,
  ArtistPlayCount,
  CalendarHeatmapData,
  CollectionCoverage,
  CollectionItem,
  CollectionValueCacheStore,
  DateAlbumsResult,
  DayOfWeekDistributionResult,
  DustyCornerAlbum,
  ForgottenTrack,
  HistoryAlbumRow,
  HistoryArtistRow,
  HistoryListPage,
  HistoryListQuery,
  HistoryTrackRow,
  HourlyDistributionResult,
  ListeningHours,
  MilestoneInfo,
  OnThisDayResult,
  OnThisDayYear,
  RoiScoreItem,
  ScrobbleCounts,
  ScrobbleHistoryIndex,
  ScrobbleSession,
  SourceBreakdownItem,
  StatsCache,
  StatsOverview,
  StreakInfo,
  TimelineDataPoint,
  TrackDetailResponse,
  TrackPlayCount,
} from '../../shared/types';
import {
  albumNameKey,
  isCollectionLinked,
  stripDiscogsSuffixes,
} from '../../shared/utils/albumMapping';
import { toDisplayName } from '../../shared/utils/displayName';
import {
  isPlaceholderLabel,
  labelDisplayName,
  labelKey,
} from '../../shared/utils/labels';
import {
  TrackSpellings,
  trackMatchKey,
} from '../../shared/utils/trackNormalization';
import { FileStorage } from '../utils/fileStorage';
import {
  albumFromAlbumKey,
  artistFromAlbumKey,
  countUnresolvedPlays,
  forEachListeningPlay,
  listeningEntries,
  UNKNOWN_ALBUM_LABEL,
} from '../utils/historyPlays';
import { createLogger } from '../utils/logger';

import { AlbumLabelCandidate, AlbumLabelService } from './albumLabelService';
import { artistMappingService } from './artistMappingService';
import { ArtistNameResolver } from './artistNameResolver';
import { CompoundArtistMappingServiceLike } from './compoundArtistMappingService';
import { MappingService } from './mappingService';
import { loadAlbumMappings } from './mergedAlbumHistory';
import { PlayIdentityResolver } from './playIdentity';
import { PlayIdentityService, ResolvedPlay } from './playIdentity/service';
import { ScrobbleHistoryStorage } from './scrobbleHistoryStorage';
import { TrackMappingService } from './trackMappingService';

const VALUE_CACHE_PATH = 'collection-analytics/value-cache.json';

const STATS_CACHE_FILE = 'stats/stats-cache.json';

// Milestone thresholds
const MILESTONES = [
  1000, 2500, 5000, 10000, 25000, 50000, 75000, 100000, 150000, 200000, 250000,
  500000, 1000000,
];

// Average track duration in seconds (3.5 minutes) for listening time estimation
const AVG_TRACK_DURATION_SECONDS = 210;

/**
 * Bump when a change alters what warm-cached stats contain (e.g. how albums
 * are grouped), so caches built by older code are recomputed.
 */
const WARM_CACHE_VERSION = 8;

// Album shown for unresolved plays; re-exported for existing importers
export { UNKNOWN_ALBUM_LABEL };

/**
 * Prefix for grouping keys of unresolved plays, so they never merge with a
 * real album that happens to be called "Unknown album".
 */
const UNRESOLVED_GROUP_PREFIX = '\u0000unresolved|';

/**
 * Identifies the history contents the warm cache was built from. The sync
 * timestamp alone misses plays added below the newest one (backfill), and
 * plays moving between albums and unresolved.
 *
 * Parts are `name:value` joined with ';' so more can be appended later (e.g.
 * a resolution-rules hash) without changing how existing parts read.
 */
export function computeHistoryFingerprint(
  index: Pick<ScrobbleHistoryIndex, 'totalScrobbles' | 'unresolved'> | null,
  rulesFingerprint = ''
): string {
  if (!index) return '';
  const parts = [
    `scrobbles:${index.totalScrobbles}`,
    `unresolved:${countUnresolvedPlays(index)}`,
  ];
  // Re-pointing a rule to another album changes neither count above
  if (rulesFingerprint) parts.push(`rules:${rulesFingerprint}`);
  return parts.join(';');
}

/**
 * Service for calculating and caching listening statistics.
 * Uses scrobble history index as the data source.
 *
 * Timezone handling:
 * - All timestamps are stored in UTC (Unix epoch seconds)
 * - Day boundary calculations use user's local timezone via Date object
 * - Streak calculations are based on calendar days in local time
 */
export class StatsService {
  private fileStorage: FileStorage;
  private historyStorage: ScrobbleHistoryStorage;
  private trackMappingService: TrackMappingService | null = null;
  private mappingService: MappingService | null = null;
  private artistNameResolver: ArtistNameResolver | null = null;
  /** Resolves plays and finds a record's plays; shared with other services */
  private playIdentity: PlayIdentityService;
  /** History list rows by index and rules; see cachedHistoryRows */
  private historyRowsCache = new WeakMap<
    object,
    Map<string, Promise<unknown[]>>
  >();
  private albumLabelService: Pick<AlbumLabelService, 'getAll'> | null = null;
  private compoundArtistMappingService: CompoundArtistMappingServiceLike | null =
    null;
  private logger = createLogger('StatsService');

  // In-memory cache for forgotten favorites (5 minute TTL)
  private forgottenFavoritesCache: {
    data: ForgottenTrack[];
    params: string; // JSON of {dormantPeriodDays, minPlayCount}
    timestamp: number;
  } | null = null;
  private readonly FORGOTTEN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    fileStorage: FileStorage,
    historyStorage: ScrobbleHistoryStorage
  ) {
    this.fileStorage = fileStorage;
    this.historyStorage = historyStorage;
    this.playIdentity = new PlayIdentityService(historyStorage);
    // Records are also found under the Last.fm name of their artist
    this.playIdentity.setLastfmArtistOf(
      name => artistMappingService.getLastfmName(name),
      () =>
        JSON.stringify(
          (artistMappingService.getAllMappings?.() ?? []).map(m => [
            m.discogsName,
            m.lastfmName,
          ])
        )
    );
  }

  /**
   * Set the track mapping service for applying mappings in forgotten favorites.
   * This is optional and should be set after construction.
   */
  setTrackMappingService(service: TrackMappingService): void {
    this.trackMappingService = service;
    this.playIdentity.setTrackMappingService(service);
  }

  /**
   * Set the mapping service for applying album mappings in dusty corners and other features.
   * This is optional and should be set after construction.
   */
  setMappingService(service: MappingService): void {
    this.mappingService = service;
    this.playIdentity.setMappingService(service);
  }

  setArtistNameResolver(resolver: ArtistNameResolver): void {
    this.artistNameResolver = resolver;
    this.playIdentity.setArtistNameResolver(resolver);
  }

  /**
   * The shared play identity service (resolver and read model), for other
   * services to count plays and find a record's plays the same way
   */
  getPlayIdentityService(): PlayIdentityService {
    return this.playIdentity;
  }

  /** Optional: enables compound-artist surfacing on the album detail endpoint. */
  setCompoundArtistMappingService(
    service: CompoundArtistMappingServiceLike
  ): void {
    this.compoundArtistMappingService = service;
  }

  /**
   * Album mappings that merge another history album into the given album
   * (linked to the collection or not), excluding a mapping of the album itself.
   */
  private async getMappingsMergedInto(
    artist: string,
    album: string
  ): Promise<AlbumMapping[]> {
    const albumKey = album.toLowerCase().trim();
    return (await loadAlbumMappings(this.mappingService)).filter(
      m =>
        m.collectionAlbum.toLowerCase().trim() === albumKey &&
        this.historyStorage.normalizeKey(m.historyArtist, m.historyAlbum) !==
          this.historyStorage.normalizeKey(
            m.collectionArtist,
            m.collectionAlbum
          ) &&
        (this.isArtistMatch(m.collectionArtist, artist) ||
          this.isArtistMatch(m.historyArtist, artist))
    );
  }

  /**
   * Scrobble history for each collection item (same order): every play that
   * resolves to the record (play identity), so a record's plays agree with
   * Top Albums and History
   */
  private async lookupCollectionHistory(collection: CollectionItem[]) {
    const model = await this.playIdentity.readModel(collection);
    return collection.map(item => model.recordPlays(item));
  }

  /**
   * Resolve an album name to the album it is merged into (album mapping), or
   * itself. Returns the album's own mapping, if any, for display.
   */
  private async resolveMergedAlbum(
    artist: string,
    album: string
  ): Promise<{ artist: string; album: string; mapping: AlbumMapping | null }> {
    const mapping =
      (this.mappingService &&
        (await this.mappingService.getAlbumMapping(artist, album))) ||
      null;
    if (
      mapping &&
      this.historyStorage.normalizeKey(
        mapping.collectionArtist,
        mapping.collectionAlbum
      ) !== this.historyStorage.normalizeKey(artist, album)
    ) {
      return {
        artist: mapping.collectionArtist,
        album: mapping.collectionAlbum,
        mapping,
      };
    }
    return { artist, album, mapping };
  }

  /**
   * The plays of an album (play identity): the merged album's plays, or every
   * play of the record when it's owned. `plays` have the track as it counts;
   * `sources` holds the same plays by the history album they were scrobbled
   * on, with the track as scrobbled.
   */
  private async collectMergedAlbumHistory(
    artist: string,
    album: string,
    collection: CollectionItem[] = []
  ): Promise<{
    plays: AlbumHistoryEntry['plays'];
    sources: Array<{
      artist: string;
      album: string;
      plays: AlbumHistoryEntry['plays'];
    }>;
    resolvedPlays: ResolvedPlay[];
    totalPlayCount: number;
    mergedMappings: AlbumMapping[];
  }> {
    const mergedMappings = await this.getMappingsMergedInto(artist, album);
    const model = await this.playIdentity.readModel(collection);
    const found = model.albumPlays(artist, album);
    if (!found) {
      return {
        plays: [],
        sources: [],
        resolvedPlays: [],
        totalPlayCount: 0,
        mergedMappings,
      };
    }
    const bySource = new Map<
      string,
      { artist: string; album: string; plays: AlbumHistoryEntry['plays'] }
    >();
    for (const play of found.plays) {
      if (!play.sourceKey) continue;
      const source = bySource.get(play.sourceKey) ?? {
        artist: artistFromAlbumKey(play.sourceKey),
        album: albumFromAlbumKey(play.sourceKey),
        plays: [],
      };
      source.plays.push({
        timestamp: play.timestamp,
        ...(play.sourceTrack && { track: play.sourceTrack }),
      });
      bySource.set(play.sourceKey, source);
    }
    return {
      plays: found.plays.map(play => ({
        timestamp: play.timestamp,
        ...(play.track && { track: play.track }),
      })),
      sources: Array.from(bySource.values()),
      resolvedPlays: found.plays,
      totalPlayCount: found.playCount,
      mergedMappings,
    };
  }

  private resolveArtistName(name: string): string {
    if (this.artistNameResolver) {
      return this.artistNameResolver.resolveArtist(name);
    }
    return name.toLowerCase();
  }

  /**
   * Returns all canonical artist keys a name should be attributed to.
   * For compound artists with decomposition mappings, returns each component.
   * For non-compound artists, returns [resolveArtistName(name)].
   */
  private resolveArtistNames(name: string): string[] {
    if (this.artistNameResolver) {
      return this.artistNameResolver.resolveArtistMulti(name);
    }
    return [name.toLowerCase()];
  }

  private isSameArtist(a: string, b: string): boolean {
    if (this.artistNameResolver) {
      return this.artistNameResolver.areSameArtist(a, b);
    }
    return a.toLowerCase() === b.toLowerCase();
  }

  /**
   * Returns true if the given artist entry should be attributed to the
   * queried artist. Handles both direct alias match and compound decomposition.
   */
  private isArtistMatch(entryArtist: string, queriedArtist: string): boolean {
    // Direct alias match via union-find
    if (this.isSameArtist(entryArtist, queriedArtist)) {
      return true;
    }
    // Check compound decomposition: if entryArtist is compound and decomposes
    // to include the queried artist
    if (this.artistNameResolver) {
      const resolved = this.artistNameResolver.resolveArtistMulti(entryArtist);
      const queriedCanonical =
        this.artistNameResolver.resolveArtist(queriedArtist);
      return resolved.includes(queriedCanonical);
    }
    return false;
  }

  /**
   * Build a map of lowercased artist name → total play count from the raw
   * scrobble index. This is used to weight display name selection and should
   * be called BEFORE the resolver is built (it doesn't use the resolver).
   */
  async buildArtistPlayCountMap(): Promise<Map<string, number>> {
    const index = await this.historyStorage.getIndex();
    const counts = new Map<string, number>();
    if (!index) return counts;

    // Unresolved plays count too: the artist is known
    for (const { artist, entry } of listeningEntries(index)) {
      const lc = artist.toLowerCase();
      counts.set(lc, (counts.get(lc) ?? 0) + entry.playCount);
    }

    return counts;
  }

  /**
   * Clear the forgotten favorites cache.
   * Should be called when track mappings change.
   */
  clearForgottenFavoritesCache(): void {
    this.forgottenFavoritesCache = null;
    this.logger.debug('Cleared forgotten favorites cache');
  }

  /**
   * Get all stats for the overview dashboard.
   * Individual stat methods serve from cache when warm; collection-dependent
   * stats (collectionCoverage) are always computed live.
   */
  async getStatsOverview(collection: CollectionItem[]): Promise<StatsOverview> {
    const [streaks, counts, listeningHours, collectionCoverage, milestones] =
      await Promise.all([
        this.calculateStreaks(),
        this.getScrobbleCounts(),
        this.getListeningHours(),
        this.getCollectionCoverage(collection),
        this.getMilestones(),
      ]);

    const newArtistsThisMonth = await this.getNewArtistsThisMonth();

    return {
      streaks,
      counts,
      listeningHours,
      newArtistsThisMonth,
      collectionCoverage,
      milestones,
    };
  }

  /**
   * Precompute all expensive stats (excluding collection-dependent ones) and
   * persist to stats-cache.json. Called asynchronously after a sync completes.
   * Does not throw — errors are logged and the cache simply stays cold.
   */
  async warmCache(): Promise<void> {
    try {
      this.logger.info('Warming stats cache...');

      const lastSyncTimestamp =
        await this.historyStorage.getLastSyncTimestamp();
      if (lastSyncTimestamp === null) {
        this.logger.debug('No sync timestamp — skipping cache warm');
        return;
      }

      // Taken before computing, so a change made while warming still
      // invalidates the result
      const artistAliasFingerprint = this.artistAliasFingerprint();
      const albumMappingFingerprint = await this.albumMappingFingerprint();
      const trackMappingFingerprint = await this.trackMappingFingerprint();
      const historyFingerprint = await this.historyFingerprint();

      const WARM_PERIODS = ['month', 'year', 'all'] as const;
      const TOP_LIMIT = 10;

      const [
        streaks,
        counts,
        listeningHours,
        milestones,
        newArtistsThisMonth,
        hourlyDistribution,
        dayOfWeekDistribution,
      ] = await Promise.all([
        this.calculateStreaks(),
        this.getScrobbleCounts(),
        this.getListeningHours(),
        this.getMilestones({ refreshHistoryDates: true }),
        this.getNewArtistsThisMonth(),
        this.getHourlyDistribution(),
        this.getDayOfWeekDistribution(),
      ]);

      // Pre-fetch top artists/albums/tracks for each period in parallel
      const [topArtistsResults, topAlbumsResults, topTracksResults] =
        await Promise.all([
          Promise.all(WARM_PERIODS.map(p => this.getTopArtists(p, TOP_LIMIT))),
          Promise.all(WARM_PERIODS.map(p => this.getTopAlbums(p, TOP_LIMIT))),
          Promise.all(WARM_PERIODS.map(p => this.getTopTracks(p, TOP_LIMIT))),
        ]);

      const topArtists: Record<string, ArtistPlayCount[]> = {};
      const topAlbums: Record<string, AlbumPlayCount[]> = {};
      const topTracks: Record<string, TrackPlayCount[]> = {};

      WARM_PERIODS.forEach((period, i) => {
        topArtists[period] = topArtistsResults[i];
        topAlbums[period] = topAlbumsResults[i];
        topTracks[period] = topTracksResults[i];
      });

      // Preserve existing milestone history when updating the cache
      const existing = await this.loadStatsCache();
      const now = Math.floor(Date.now() / 1000);

      await this.saveStatsCache({
        schemaVersion: 1,
        lastUpdated: now,
        streaks,
        milestoneHistory: existing?.milestoneHistory ?? [],
        warm: {
          warmedAt: now,
          syncTimestamp: lastSyncTimestamp,
          version: WARM_CACHE_VERSION,
          artistAliasFingerprint,
          albumMappingFingerprint,
          trackMappingFingerprint,
          historyFingerprint,
          streaks,
          counts,
          listeningHours,
          newArtistsThisMonth,
          milestones,
          topArtists,
          topAlbums,
          topTracks,
          hourlyDistribution,
          dayOfWeekDistribution,
        },
      });

      this.logger.info('Stats cache warmed successfully');
    } catch (error) {
      this.logger.error('Failed to warm stats cache', error);
    }
  }

  /**
   * Invalidate the persisted warm cache so the next request recomputes live.
   * Should be called when a new sync starts.
   */
  async invalidateStatsCache(): Promise<void> {
    try {
      const existing = await this.loadStatsCache();
      if (existing?.warm) {
        await this.saveStatsCache({
          ...existing,
          warm: undefined,
        });
        this.logger.debug('Stats warm cache invalidated');
      }
    } catch (error) {
      this.logger.error('Failed to invalidate stats cache', error);
    }
  }

  /**
   * Load the warm cache and validate freshness against current sync timestamp.
   * Returns the warm cache block if valid, null otherwise.
   */
  private async getValidWarmCache(): Promise<StatsCache['warm'] | null> {
    const cache = await this.loadStatsCache();
    if (!cache?.warm) return null;
    const lastSyncTimestamp = await this.historyStorage.getLastSyncTimestamp();
    if (lastSyncTimestamp === null) return null;
    if (cache.warm.syncTimestamp !== lastSyncTimestamp) return null;
    if (cache.warm.version !== WARM_CACHE_VERSION) return null;
    if (cache.warm.artistAliasFingerprint !== this.artistAliasFingerprint()) {
      return null;
    }
    // Album mappings merge album versions in top albums, so any mapping change
    // (including auto-created mappings and backup restores) invalidates
    if (
      (cache.warm.albumMappingFingerprint ?? '') !==
      (await this.albumMappingFingerprint())
    ) {
      return null;
    }
    // Track mappings merge spellings in top tracks
    if (
      (cache.warm.trackMappingFingerprint ?? '') !==
      (await this.trackMappingFingerprint())
    ) {
      return null;
    }
    // Plays added below the newest timestamp (backfill) or moved between
    // albums and unresolved leave syncTimestamp unchanged
    if (cache.warm.historyFingerprint !== (await this.historyFingerprint())) {
      return null;
    }
    return cache.warm;
  }

  /** History contents plus Unresolved Listening History rules */
  private async historyFingerprint(): Promise<string> {
    const index = await this.historyStorage.getIndex();
    const rules =
      typeof this.historyStorage.getResolutionRulesFingerprint === 'function'
        ? await this.historyStorage.getResolutionRulesFingerprint()
        : '';
    return computeHistoryFingerprint(index, rules);
  }

  private artistAliasFingerprint(): string {
    return this.artistNameResolver?.getFingerprint?.() ?? '';
  }

  /** Identifies the current track mappings; '' when there are none. */
  private async trackMappingFingerprint(): Promise<string> {
    return (await this.trackMappingService?.getFingerprint?.()) ?? '';
  }

  /** Identifies the rules a play identity resolver is built from */
  private async playIdentityKey(collection: CollectionItem[]): Promise<string> {
    return this.playIdentity.rulesKey(collection);
  }

  /**
   * A History list's rows, built once per history index and set of rules,
   * so paging, sorting and searching only slice them
   */
  private async cachedHistoryRows<Row>(
    index: ScrobbleHistoryIndex,
    list: string,
    collection: CollectionItem[],
    build: () => Promise<Row[]>
  ): Promise<Row[]> {
    const key = [
      list,
      index.lastSyncTimestamp,
      index.totalScrobbles,
      await this.playIdentityKey(collection),
    ].join('\u0002');
    let byKey = this.historyRowsCache.get(index);
    if (!byKey) {
      byKey = new Map();
      this.historyRowsCache.set(index, byKey);
    }
    const cached = byKey.get(key) as Promise<Row[]> | undefined;
    if (cached) return cached;
    // Only the latest rows of each list are worth keeping
    for (const old of byKey.keys()) {
      if (old.startsWith(`${list}\u0002`)) byKey.delete(old);
    }
    const rows = build();
    byKey.set(key, rows);
    rows.catch(() => byKey!.delete(key));
    return rows;
  }

  /**
   * What each play counts as (artist, album, track, owned record): the one
   * resolver every list of plays groups by, so pages agree. See
   * services/playIdentity.
   */
  private async createPlayIdentity(
    collection: CollectionItem[] = []
  ): Promise<PlayIdentityResolver> {
    return this.playIdentity.resolver(collection);
  }

  /** Identifies the current album mappings; '' when there are none. */
  private async albumMappingFingerprint(): Promise<string> {
    const mappings = await loadAlbumMappings(this.mappingService);
    if (mappings.length === 0) return '';
    const lines = mappings
      .map(m =>
        [
          albumNameKey(m.historyArtist, m.historyAlbum),
          m.collectionId,
          albumNameKey(m.collectionArtist, m.collectionAlbum),
        ].join('\t')
      )
      .sort();
    return createHash('sha1').update(lines.join('\n')).digest('hex');
  }

  /**
   * Calculate daily listening streak.
   * A streak is consecutive calendar days (in local time) with at least one scrobble.
   */
  async calculateStreaks(): Promise<StreakInfo> {
    const warm = await this.getValidWarmCache();
    if (warm) {
      this.logger.debug('Serving calculateStreaks from warm cache');
      return warm.streaks;
    }

    const index = await this.historyStorage.getIndex();
    if (!index) {
      return {
        currentStreak: 0,
        longestStreak: 0,
      };
    }

    // Collect all play timestamps, including unresolved plays
    const allTimestamps: number[] = [];
    forEachListeningPlay(index, play => {
      allTimestamps.push(play.timestamp);
    });

    if (allTimestamps.length === 0) {
      return {
        currentStreak: 0,
        longestStreak: 0,
      };
    }

    // Group scrobbles by calendar day (local time)
    const daySet = new Set<string>();
    for (const timestamp of allTimestamps) {
      const date = new Date(timestamp * 1000);
      const dayKey = this.formatDateKey(date);
      daySet.add(dayKey);
    }

    // Convert to sorted array of day keys
    const sortedDays = Array.from(daySet).sort();

    // Helper to check if two date strings are consecutive days
    const areConsecutiveDays = (earlier: string, later: string): boolean => {
      // Parse as local dates by appending time component
      const date1 = new Date(`${earlier}T00:00:00`);
      // Add one day to the earlier date and compare
      const nextDay = new Date(date1);
      nextDay.setDate(nextDay.getDate() + 1);
      return this.formatDateKey(nextDay) === later;
    };

    // Helper to parse date string to timestamp
    const parseDateKey = (dateStr: string): number => {
      return new Date(`${dateStr}T00:00:00`).getTime() / 1000;
    };

    // Calculate streaks
    let longestStreak = 0;
    let longestStreakStart: string | undefined;
    let longestStreakEnd: string | undefined;

    // Check if streak is still active (today or yesterday had a scrobble)
    const today = this.formatDateKey(new Date());
    const yesterday = this.formatDateKey(
      new Date(Date.now() - 24 * 60 * 60 * 1000)
    );

    // Build streaks by scanning through sorted days
    let streakStart = sortedDays[0];
    let streakLength = 1;

    for (let i = 1; i < sortedDays.length; i++) {
      if (areConsecutiveDays(sortedDays[i - 1], sortedDays[i])) {
        // Extend current streak
        streakLength++;
      } else {
        // Streak broken - record if longest
        if (streakLength > longestStreak) {
          longestStreak = streakLength;
          longestStreakStart = streakStart;
          longestStreakEnd = sortedDays[i - 1];
        }
        // Start new streak
        streakStart = sortedDays[i];
        streakLength = 1;
      }
    }

    // Check final streak
    if (streakLength > longestStreak) {
      longestStreak = streakLength;
      longestStreakStart = streakStart;
      longestStreakEnd = sortedDays[sortedDays.length - 1];
    }

    // Find current streak (must include today or yesterday)
    let currentStreak = 0;
    let currentStreakStart: string | undefined;

    // Work backwards from the most recent day
    const lastDay = sortedDays[sortedDays.length - 1];
    const streakIsActive = lastDay === today || lastDay === yesterday;

    if (streakIsActive) {
      currentStreak = 1;
      currentStreakStart = lastDay;

      // Count backwards from the end
      for (let i = sortedDays.length - 2; i >= 0; i--) {
        if (areConsecutiveDays(sortedDays[i], sortedDays[i + 1])) {
          currentStreak++;
          currentStreakStart = sortedDays[i];
        } else {
          break; // Streak broken
        }
      }
    }

    return {
      currentStreak,
      longestStreak,
      currentStreakStart: currentStreakStart
        ? parseDateKey(currentStreakStart)
        : undefined,
      longestStreakStart: longestStreakStart
        ? parseDateKey(longestStreakStart)
        : undefined,
      longestStreakEnd: longestStreakEnd
        ? parseDateKey(longestStreakEnd)
        : undefined,
    };
  }

  /**
   * Get scrobble counts for various time periods
   */
  async getScrobbleCounts(): Promise<ScrobbleCounts> {
    const warm = await this.getValidWarmCache();
    if (warm) {
      this.logger.debug('Serving getScrobbleCounts from warm cache');
      return warm.counts;
    }

    const index = await this.historyStorage.getIndex();
    if (!index) {
      return {
        today: 0,
        thisWeek: 0,
        thisMonth: 0,
        thisYear: 0,
        allTime: 0,
      };
    }

    const now = new Date();
    const todayStart = this.getStartOfDay(now).getTime() / 1000;
    const weekStart = this.getStartOfWeek(now).getTime() / 1000;
    const monthStart = this.getStartOfMonth(now).getTime() / 1000;
    const yearStart = this.getStartOfYear(now).getTime() / 1000;

    let today = 0;
    let thisWeek = 0;
    let thisMonth = 0;
    let thisYear = 0;

    // Listening events: album plays and unresolved plays
    forEachListeningPlay(index, play => {
      if (play.timestamp >= todayStart) {
        today++;
      }
      if (play.timestamp >= weekStart) {
        thisWeek++;
      }
      if (play.timestamp >= monthStart) {
        thisMonth++;
      }
      if (play.timestamp >= yearStart) {
        thisYear++;
      }
    });

    return {
      today,
      thisWeek,
      thisMonth,
      thisYear,
      // Album plays + unresolved plays (recomputed by the sync)
      allTime: index.totalScrobbles,
    };
  }

  /**
   * Estimate listening hours based on scrobble counts.
   * Uses average track duration of 3.5 minutes.
   */
  async getListeningHours(): Promise<ListeningHours> {
    const warm = await this.getValidWarmCache();
    if (warm) {
      this.logger.debug('Serving getListeningHours from warm cache');
      return warm.listeningHours;
    }

    const counts = await this.getScrobbleCounts();

    return {
      today:
        Math.round(((counts.today * AVG_TRACK_DURATION_SECONDS) / 3600) * 10) /
        10,
      thisWeek:
        Math.round(
          ((counts.thisWeek * AVG_TRACK_DURATION_SECONDS) / 3600) * 10
        ) / 10,
      thisMonth:
        Math.round(
          ((counts.thisMonth * AVG_TRACK_DURATION_SECONDS) / 3600) * 10
        ) / 10,
    };
  }

  /**
   * Get cutoff timestamp for a given period
   * Supports calendar-based (week/month/year) and rolling (days30/days90/days365) periods
   */
  private getPeriodCutoff(period: string): number {
    const now = new Date();
    const nowSeconds = now.getTime() / 1000;

    switch (period) {
      case 'week':
        return this.getStartOfWeek(now).getTime() / 1000;
      case 'month':
        return this.getStartOfMonth(now).getTime() / 1000;
      case 'year':
        return this.getStartOfYear(now).getTime() / 1000;
      case 'days30':
        return nowSeconds - 30 * 24 * 60 * 60;
      case 'days90':
        return nowSeconds - 90 * 24 * 60 * 60;
      case 'days365':
        return nowSeconds - 365 * 24 * 60 * 60;
      case 'all':
      default:
        return 0;
    }
  }

  /**
   * Get top artists for a time period or custom date range
   */
  async getTopArtists(
    period:
      | 'week'
      | 'month'
      | 'year'
      | 'all'
      | 'days30'
      | 'days90'
      | 'days365'
      | 'custom',
    limit: number = 10,
    startDate?: number,
    endDate?: number
  ): Promise<ArtistPlayCount[]> {
    // Serve from warm cache for standard periods at default limit
    if (
      (period === 'month' || period === 'year' || period === 'all') &&
      limit === 10 &&
      startDate === undefined &&
      endDate === undefined
    ) {
      const warm = await this.getValidWarmCache();
      if (warm?.topArtists[period]) {
        this.logger.debug(`Serving getTopArtists(${period}) from warm cache`);
        return warm.topArtists[period];
      }
    }

    const index = await this.historyStorage.getIndex();
    if (!index) {
      return [];
    }

    // Determine time range
    let cutoffTimestamp: number;
    let endTimestamp: number = Date.now() / 1000;

    if (
      period === 'custom' &&
      startDate !== undefined &&
      endDate !== undefined
    ) {
      cutoffTimestamp = startDate;
      endTimestamp = endDate;
    } else {
      cutoffTimestamp = this.getPeriodCutoff(period);
    }

    // Count plays per artist in the period, by the artist each play counts
    // as (play identity: a track mapping can move a play to another artist).
    // Compound artists (e.g., "Danny Brown, Jane Remover") add a play to each
    // component. Unresolved plays count: the artist is known.
    const identity = await this.createPlayIdentity();
    const artistCounts = new Map<string, number>();
    const keysFor = new Map<string, string[]>();

    for (const { artist, album, entry } of listeningEntries(index)) {
      for (const play of entry.plays) {
        if (play.timestamp < cutoffTimestamp || play.timestamp > endTimestamp) {
          continue;
        }
        const playArtist = play.track
          ? identity.play(artist, album, play.track).artist
          : artist;
        let keys = keysFor.get(playArtist);
        if (!keys) {
          keys = this.resolveArtistNames(playArtist);
          keysFor.set(playArtist, keys);
        }
        for (const key of keys) {
          artistCounts.set(key, (artistCounts.get(key) || 0) + 1);
        }
      }
    }

    // Sort and return top artists
    return Array.from(artistCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([artist, playCount]) => ({
        artist: this.artistNameResolver
          ? this.artistNameResolver.getDisplayName(artist)
          : this.capitalizeArtist(artist),
        playCount,
      }));
  }

  /**
   * Get top albums for a time period or custom date range
   */
  async getTopAlbums(
    period:
      | 'week'
      | 'month'
      | 'year'
      | 'all'
      | 'days30'
      | 'days90'
      | 'days365'
      | 'custom',
    limit: number = 10,
    startDate?: number,
    endDate?: number,
    collection?: CollectionItem[]
  ): Promise<AlbumPlayCount[]> {
    // Serve from warm cache for standard periods at default limit (without collection enrichment)
    if (
      (period === 'month' || period === 'year' || period === 'all') &&
      limit === 10 &&
      startDate === undefined &&
      endDate === undefined &&
      !collection
    ) {
      const warm = await this.getValidWarmCache();
      if (warm?.topAlbums[period]) {
        this.logger.debug(`Serving getTopAlbums(${period}) from warm cache`);
        return warm.topAlbums[period];
      }
    }

    const index = await this.historyStorage.getIndex();
    if (!index) {
      return [];
    }

    // Determine time range
    let cutoffTimestamp: number;
    let endTimestamp: number = Date.now() / 1000;

    if (
      period === 'custom' &&
      startDate !== undefined &&
      endDate !== undefined
    ) {
      cutoffTimestamp = startDate;
      endTimestamp = endDate;
    } else {
      cutoffTimestamp = this.getPeriodCutoff(period);
    }

    // Count plays per album in the period by play identity: versions merged
    // by album mappings are one album, a play a track mapping moves counts on
    // the album it moved to, and the album shows under its most-played artist
    const identity = await this.createPlayIdentity(collection ?? []);
    const albumCounts = new Map<
      string,
      {
        album: string;
        playCount: number;
        lastPlayed: number;
        artistPlays: Map<string, number>;
        collectionItem?: CollectionItem;
      }
    >();

    for (const { artist, album, entry } of listeningEntries(index)) {
      if (album === null) continue;
      for (const play of entry.plays) {
        if (play.timestamp < cutoffTimestamp || play.timestamp > endTimestamp) {
          continue;
        }
        const target = play.track
          ? identity.play(artist, album, play.track)
          : identity.album(artist, album);
        if (target.album === null || target.albumKey === null) continue;
        const existing = albumCounts.get(target.albumKey);
        if (existing) {
          existing.playCount++;
          existing.lastPlayed = Math.max(existing.lastPlayed, play.timestamp);
          existing.artistPlays.set(
            target.artist,
            (existing.artistPlays.get(target.artist) ?? 0) + 1
          );
          existing.collectionItem ??= target.collectionItem;
        } else {
          albumCounts.set(target.albumKey, {
            album: target.album,
            playCount: 1,
            lastPlayed: play.timestamp,
            artistPlays: new Map([[target.artist, 1]]),
            collectionItem: target.collectionItem,
          });
        }
      }
    }

    // Sort by play count and take top results
    const topEntries = Array.from(albumCounts.values())
      .sort((a, b) => b.playCount - a.playCount)
      .slice(0, limit);
    const result: AlbumPlayCount[] = topEntries.map(entry => {
      const [topArtist] = Array.from(entry.artistPlays.entries()).sort(
        (a, b) => b[1] - a[1]
      )[0];
      const owned = entry.collectionItem;
      return {
        artist: this.capitalizeArtist(topArtist),
        album: this.capitalizeTitle(entry.album),
        playCount: entry.playCount,
        lastPlayed: entry.lastPlayed,
        ...(owned && {
          inCollection: true,
          collectionReleaseId: owned.release.id,
          ...(owned.release.cover_image && {
            coverUrl: owned.release.cover_image,
          }),
        }),
      };
    });

    return result;
  }

  /** The owned record of each album (play identity), or undefined */
  async ownedRecordsOf(
    albums: Array<{ artist: string; album: string }>,
    collection: CollectionItem[]
  ): Promise<Array<CollectionItem | undefined>> {
    if (collection.length === 0) return albums.map(() => undefined);
    const identity = await this.createPlayIdentity(collection);
    return albums.map(
      ({ artist, album }) => identity.album(artist, album).collectionItem
    );
  }

  /**
   * Records each artist owns and a cover from one (play identity), for rows
   * of artists that don't carry ownership themselves (e.g. cached top artists)
   */
  async withArtistOwnership<Row extends { artist: string }>(
    rows: Row[],
    collection: CollectionItem[]
  ): Promise<Array<Row & { ownedCount: number; ownedCoverUrl?: string }>> {
    const identity = await this.createPlayIdentity(collection);
    return rows.map(row => {
      const owned = identity.ownedByArtist(row.artist);
      const cover = owned.find(item => item.release.cover_image)?.release
        .cover_image;
      return {
        ...row,
        ownedCount: owned.length,
        ...(cover && { ownedCoverUrl: cover }),
      };
    });
  }

  /**
   * Get top tracks for a time period or custom date range
   */
  async getTopTracks(
    period:
      | 'week'
      | 'month'
      | 'year'
      | 'all'
      | 'days30'
      | 'days90'
      | 'days365'
      | 'custom',
    limit: number = 10,
    startDate?: number,
    endDate?: number
  ): Promise<TrackPlayCount[]> {
    // Serve from warm cache for standard periods at default limit
    if (
      (period === 'month' || period === 'year' || period === 'all') &&
      limit === 10 &&
      startDate === undefined &&
      endDate === undefined
    ) {
      const warm = await this.getValidWarmCache();
      if (warm?.topTracks[period]) {
        this.logger.debug(`Serving getTopTracks(${period}) from warm cache`);
        return warm.topTracks[period];
      }
    }

    const index = await this.historyStorage.getIndex();
    if (!index) {
      return [];
    }

    // Determine time range
    let cutoffTimestamp: number;
    let endTimestamp: number = Date.now() / 1000;

    if (
      period === 'custom' &&
      startDate !== undefined &&
      endDate !== undefined
    ) {
      cutoffTimestamp = startDate;
      endTimestamp = endDate;
    } else {
      cutoffTimestamp = this.getPeriodCutoff(period);
    }

    // Count plays per track in the period, after track mappings and merged
    // album versions. Key: normalized "artist|album|track"
    const identity = await this.createPlayIdentity();
    const trackCounts = new Map<
      string,
      {
        // Aliases merge into one row, named by the most-played spelling
        artists: TrackSpellings;
        album: string | null;
        spellings: TrackSpellings;
        count: number;
        lastPlayed: number;
      }
    >();

    // Unresolved plays form their own "Unknown album" row per track (album: null)
    for (const { artist, album, entry } of listeningEntries(index)) {
      for (const play of entry.plays) {
        if (
          play.timestamp >= cutoffTimestamp &&
          play.timestamp <= endTimestamp &&
          play.track
        ) {
          const target = identity.play(artist, album, play.track);
          const trackKey = target.trackKey;
          const existing = trackCounts.get(trackKey);
          if (existing) {
            existing.count++;
            existing.spellings.add(target.track);
            existing.artists.add(target.artist);
            if (play.timestamp > existing.lastPlayed) {
              existing.lastPlayed = play.timestamp;
            }
          } else {
            const spellings = new TrackSpellings();
            spellings.add(target.track);
            const artists = new TrackSpellings();
            artists.add(target.artist);
            trackCounts.set(trackKey, {
              artists,
              album: target.album,
              spellings,
              count: 1,
              lastPlayed: play.timestamp,
            });
          }
        }
      }
    }

    // Sort and return top tracks, each named by its most-played spelling
    return Array.from(trackCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map(item => ({
        artist: this.capitalizeArtist(item.artists.best),
        album: this.displayAlbum(item.album),
        track: this.capitalizeTitle(item.spellings.best),
        playCount: item.count,
        lastPlayed: item.lastPlayed,
      }));
  }

  /**
   * Calculate collection coverage - what percentage of owned albums have been played
   */
  async getCollectionCoverage(
    collection: CollectionItem[]
  ): Promise<CollectionCoverage> {
    if (collection.length === 0) {
      return {
        thisMonth: 0,
        thisYear: 0,
        allTime: 0,
        days30: 0,
        days90: 0,
        days365: 0,
        albumsPlayedThisMonth: 0,
        albumsPlayedThisYear: 0,
        albumsPlayedAllTime: 0,
        albumsPlayedDays30: 0,
        albumsPlayedDays90: 0,
        albumsPlayedDays365: 0,
        totalAlbums: 0,
      };
    }

    const now = new Date();
    const nowSeconds = now.getTime() / 1000;
    const monthStart = this.getStartOfMonth(now).getTime() / 1000;
    const yearStart = this.getStartOfYear(now).getTime() / 1000;
    const days30Start = nowSeconds - 30 * 24 * 60 * 60;
    const days90Start = nowSeconds - 90 * 24 * 60 * 60;
    const days365Start = nowSeconds - 365 * 24 * 60 * 60;

    let albumsPlayedThisMonth = 0;
    let albumsPlayedThisYear = 0;
    let albumsPlayedAllTime = 0;
    let albumsPlayedDays30 = 0;
    let albumsPlayedDays90 = 0;
    let albumsPlayedDays365 = 0;

    // Every collection item's plays, across all names mapped to it
    const collectionHistory = await this.lookupCollectionHistory(collection);

    for (const result of collectionHistory) {
      if (result?.entry && result.entry.playCount > 0) {
        // Album has been played at least once
        albumsPlayedAllTime++;

        // Check if played this month
        const hasMonthPlays = result.entry.plays.some(
          p => p.timestamp >= monthStart
        );
        if (hasMonthPlays) {
          albumsPlayedThisMonth++;
        }

        // Check if played this year
        const hasYearPlays = result.entry.plays.some(
          p => p.timestamp >= yearStart
        );
        if (hasYearPlays) {
          albumsPlayedThisYear++;
        }

        // Check rolling periods
        const hasDays30Plays = result.entry.plays.some(
          p => p.timestamp >= days30Start
        );
        if (hasDays30Plays) {
          albumsPlayedDays30++;
        }

        const hasDays90Plays = result.entry.plays.some(
          p => p.timestamp >= days90Start
        );
        if (hasDays90Plays) {
          albumsPlayedDays90++;
        }

        const hasDays365Plays = result.entry.plays.some(
          p => p.timestamp >= days365Start
        );
        if (hasDays365Plays) {
          albumsPlayedDays365++;
        }
      }
    }

    return {
      thisMonth: Math.round((albumsPlayedThisMonth / collection.length) * 100),
      thisYear: Math.round((albumsPlayedThisYear / collection.length) * 100),
      allTime: Math.round((albumsPlayedAllTime / collection.length) * 100),
      days30: Math.round((albumsPlayedDays30 / collection.length) * 100),
      days90: Math.round((albumsPlayedDays90 / collection.length) * 100),
      days365: Math.round((albumsPlayedDays365 / collection.length) * 100),
      albumsPlayedThisMonth,
      albumsPlayedThisYear,
      albumsPlayedAllTime,
      albumsPlayedDays30,
      albumsPlayedDays90,
      albumsPlayedDays365,
      totalAlbums: collection.length,
    };
  }

  /**
   * Get albums in collection not played in 6+ months ("Dusty Corners")
   */
  async getDustyCorners(
    collection: CollectionItem[],
    limit: number = 20
  ): Promise<DustyCornerAlbum[]> {
    const now = Date.now();
    const sixMonthsAgo = now - 180 * 24 * 60 * 60 * 1000;
    const sixMonthsAgoSeconds = sixMonthsAgo / 1000;

    const dustyAlbums: DustyCornerAlbum[] = [];

    // countsOnly since we only need lastPlayed/playCount
    const collectionHistory = await this.lookupCollectionHistory(collection);

    for (const [i, item] of collection.entries()) {
      const result = collectionHistory[i];

      // Album never played or last played more than 6 months ago
      if (!result?.entry || result.entry.lastPlayed < sixMonthsAgoSeconds) {
        const lastPlayed = result?.entry?.lastPlayed || 0;
        const daysSincePlay = lastPlayed
          ? Math.floor((now / 1000 - lastPlayed) / (24 * 60 * 60))
          : Infinity;

        dustyAlbums.push({
          artist: item.release.artist,
          album: item.release.title,
          coverUrl: item.release.cover_image,
          lastPlayed,
          daysSincePlay: daysSincePlay === Infinity ? -1 : daysSincePlay,
          collectionId: item.id,
        });
      }
    }

    // Sort by most neglected first (never played, then oldest played)
    return dustyAlbums
      .sort((a, b) => {
        // Never played items come first
        if (a.daysSincePlay === -1 && b.daysSincePlay !== -1) return -1;
        if (b.daysSincePlay === -1 && a.daysSincePlay !== -1) return 1;
        if (a.daysSincePlay === -1 && b.daysSincePlay === -1) return 0;
        // Then sort by most days since play
        return b.daysSincePlay - a.daysSincePlay;
      })
      .slice(0, limit);
  }

  /**
   * Get most played albums from collection ("Heavy Rotation")
   */
  async getHeavyRotation(
    collection: CollectionItem[],
    limit: number = 10
  ): Promise<AlbumPlayCount[]> {
    const albumsWithPlays: AlbumPlayCount[] = [];

    // countsOnly since we only need playCount/lastPlayed
    const collectionHistory = await this.lookupCollectionHistory(collection);

    for (const [i, item] of collection.entries()) {
      const result = collectionHistory[i];

      if (result?.entry && result.entry.playCount > 0) {
        albumsWithPlays.push({
          artist: item.release.artist,
          album: item.release.title,
          playCount: result.entry.playCount,
          lastPlayed: result.entry.lastPlayed,
          coverUrl: item.release.cover_image,
        });
      }
    }

    // Sort by play count descending
    return albumsWithPlays
      .sort((a, b) => b.playCount - a.playCount)
      .slice(0, limit);
  }

  /**
   * Get calendar heatmap data for the past year
   */
  async getCalendarHeatmap(year?: number): Promise<CalendarHeatmapData[]> {
    const index = await this.historyStorage.getIndex();
    if (!index) {
      return [];
    }

    const targetYear = year || new Date().getFullYear();
    const yearStart = new Date(targetYear, 0, 1).getTime() / 1000;
    const yearEnd = new Date(targetYear + 1, 0, 1).getTime() / 1000;

    // Count scrobbles per day
    const dayCounts = new Map<string, number>();

    forEachListeningPlay(index, play => {
      if (play.timestamp >= yearStart && play.timestamp < yearEnd) {
        const date = new Date(play.timestamp * 1000);
        const dayKey = this.formatDateKey(date);
        dayCounts.set(dayKey, (dayCounts.get(dayKey) || 0) + 1);
      }
    });

    // Convert to array
    return Array.from(dayCounts.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Get milestone information
   * Calculates when each milestone was actually reached based on scrobble history
   */
  async getMilestones(options?: {
    /**
     * Recompute the dates of already-recorded milestones from the index
     * (used when warming, so plays added to the history, such as backfilled
     * or newly counted unresolved plays, correct earlier dates)
     */
    refreshHistoryDates?: boolean;
  }): Promise<MilestoneInfo> {
    const refreshHistoryDates = options?.refreshHistoryDates ?? false;
    const warm = refreshHistoryDates ? null : await this.getValidWarmCache();
    if (warm) {
      this.logger.debug('Serving getMilestones from warm cache');
      return warm.milestones;
    }

    const total = await this.historyStorage.getTotalScrobbles();

    // Find next milestone
    let nextMilestone = MILESTONES[MILESTONES.length - 1];
    for (const milestone of MILESTONES) {
      if (milestone > total) {
        nextMilestone = milestone;
        break;
      }
    }

    const scrobblesToNext = nextMilestone - total;
    const prevMilestone = MILESTONES.filter(m => m <= total).pop() || 0;
    const progressPercent =
      prevMilestone > 0
        ? Math.round(
            ((total - prevMilestone) / (nextMilestone - prevMilestone)) * 100
          )
        : Math.round((total / nextMilestone) * 100);

    // Load cached milestone history
    const cache = await this.loadStatsCache();
    let history = cache?.milestoneHistory || [];

    // Validate cached history - if any milestone dates appear incorrect
    // (all dates are suspiciously within the last day), force recalculation
    const oneDayAgo = Math.floor(Date.now() / 1000) - 86400;
    const needsRecalculation =
      history.length > 0 &&
      history.every(h => h.reachedAt > oneDayAgo) &&
      total > 1000; // Only if user has substantial history

    if (needsRecalculation) {
      // Clear cached history to force recalculation
      history = [];
    }

    // A milestone above the current total is no longer reached (e.g. after
    // excluding an artist); drop it so it is re-dated if reached again
    let historyChanged = false;
    if (history.some(h => h.milestone > total)) {
      history = history.filter(h => h.milestone <= total);
      historyChanged = true;
    }

    // Check if we've hit any new milestones
    const reachedMilestones = MILESTONES.filter(m => m <= total);
    const newMilestones = reachedMilestones.filter(
      m => !history.some(h => h.milestone === m)
    );

    if (newMilestones.length > 0 || (refreshHistoryDates && history.length)) {
      // Get all timestamps to find when each milestone was actually reached
      const index = await this.historyStorage.getIndex();
      if (index) {
        // Every listening event counts, including unresolved plays
        const allTimestamps: number[] = [];
        forEachListeningPlay(index, play => {
          allTimestamps.push(play.timestamp);
        });
        // Sort chronologically (oldest first)
        allTimestamps.sort((a, b) => a - b);

        // Correct recorded dates the index can now place exactly; keep the
        // rest (the index may hold fewer plays than were counted)
        if (refreshHistoryDates) {
          history = history.map(h => {
            const reachedAt = allTimestamps[h.milestone - 1];
            if (reachedAt === undefined || reachedAt === h.reachedAt) return h;
            historyChanged = true;
            return { ...h, reachedAt };
          });
        }

        for (const milestone of newMilestones) {
          // The Nth scrobble is at index N-1, so milestone 1000 = index 999
          const milestoneIndex = milestone - 1;
          const reachedAt =
            milestoneIndex < allTimestamps.length
              ? allTimestamps[milestoneIndex]
              : Math.floor(Date.now() / 1000);
          history.push({ milestone, reachedAt });
        }
      } else {
        // Fallback if no index available
        const now = Math.floor(Date.now() / 1000);
        for (const milestone of newMilestones) {
          history.push({ milestone, reachedAt: now });
        }
      }
    }

    if (newMilestones.length > 0 || historyChanged) {
      // Update cache — preserve the warm block so we don't inadvertently clear it
      const now = Math.floor(Date.now() / 1000);
      await this.saveStatsCache({
        schemaVersion: 1,
        lastUpdated: now,
        streaks: cache?.streaks || {
          currentStreak: 0,
          longestStreak: 0,
        },
        milestoneHistory: history,
        warm: cache?.warm,
      });
    }

    return {
      total,
      nextMilestone,
      scrobblesToNext,
      progressPercent,
      history: history.sort((a, b) => a.milestone - b.milestone),
    };
  }

  /**
   * Count new artists discovered this month
   */
  async getNewArtistsThisMonth(): Promise<number> {
    const warm = await this.getValidWarmCache();
    if (warm) {
      this.logger.debug('Serving getNewArtistsThisMonth from warm cache');
      return warm.newArtistsThisMonth;
    }

    const details = await this.getNewArtistsDetails();
    return details.length;
  }

  /**
   * Get detailed list of new artists discovered this month
   */
  async getNewArtistsDetails(): Promise<
    Array<{ artist: string; firstPlayed: number; playCount: number }>
  > {
    const index = await this.historyStorage.getIndex();
    if (!index) {
      return [];
    }

    const now = new Date();
    const monthStart = this.getStartOfMonth(now).getTime() / 1000;

    // Find artists with their first play this month (multi-attribution aware)
    const artistFirstPlay = new Map<string, number>();
    const artistOriginalName = new Map<string, string>();

    // Unresolved plays count: an artist heard only on singles is still new
    const entries = listeningEntries(index);
    for (const { artist, entry: albumHistory } of entries) {
      const canonicals = this.resolveArtistNames(artist);

      for (const normalizedArtist of canonicals) {
        // Track original casing
        if (!artistOriginalName.has(normalizedArtist)) {
          artistOriginalName.set(
            normalizedArtist,
            this.artistNameResolver
              ? this.artistNameResolver.getDisplayName(normalizedArtist)
              : artist
          );
        }

        for (const play of albumHistory.plays) {
          const existing = artistFirstPlay.get(normalizedArtist);
          if (!existing || play.timestamp < existing) {
            artistFirstPlay.set(normalizedArtist, play.timestamp);
          }
        }
      }
    }

    // Filter artists whose first play was this month and calculate play counts
    const newArtists: Array<{
      artist: string;
      firstPlayed: number;
      playCount: number;
    }> = [];

    for (const [normalizedArtist, firstPlay] of artistFirstPlay.entries()) {
      if (firstPlay >= monthStart) {
        // Calculate total plays this month for this artist
        let playCount = 0;
        for (const { artist, entry: albumHistory } of entries) {
          if (this.isArtistMatch(artist, normalizedArtist)) {
            playCount += albumHistory.plays.filter(
              p => p.timestamp >= monthStart
            ).length;
          }
        }

        newArtists.push({
          artist: artistOriginalName.get(normalizedArtist) || normalizedArtist,
          firstPlayed: firstPlay * 1000, // Convert to milliseconds
          playCount,
        });
      }
    }

    // Sort by first play time (most recent first)
    return newArtists.sort((a, b) => b.firstPlayed - a.firstPlayed);
  }

  /**
   * Get source breakdown - identifies scrobbles from this app vs other sources
   * We identify "RecordScrobbles" scrobbles by matching timestamps from our scrobble sessions
   */
  async getSourceBreakdown(): Promise<SourceBreakdownItem[]> {
    const index = await this.historyStorage.getIndex();
    if (!index) {
      return [];
    }

    // Get all our scrobble session timestamps
    const ourScrobbleTimestamps = new Set<number>();
    try {
      const files = await this.fileStorage.listFiles('scrobbles');
      for (const file of files) {
        if (file.startsWith('session-')) {
          const session = await this.fileStorage.readJSON<ScrobbleSession>(
            `scrobbles/${file}`
          );
          if (session && session.status === 'completed') {
            for (const track of session.tracks) {
              if (track.timestamp) {
                ourScrobbleTimestamps.add(track.timestamp);
              }
            }
          }
        }
      }
    } catch {
      // If we can't read sessions, all scrobbles will be "Other"
    }

    // Count all scrobbles and match against our sessions
    // Optimization: Convert Set to sorted array for efficient binary search
    const sortedTimestamps = Array.from(ourScrobbleTimestamps).sort(
      (a, b) => a - b
    );

    // Binary search helper to check if a timestamp is within tolerance of any in our list
    const isOurScrobble = (
      targetTs: number,
      tolerance: number = 5
    ): boolean => {
      if (sortedTimestamps.length === 0) return false;

      // Binary search to find the closest timestamp
      let left = 0;
      let right = sortedTimestamps.length - 1;

      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const midTs = sortedTimestamps[mid];

        if (Math.abs(midTs - targetTs) <= tolerance) {
          return true;
        }

        if (midTs < targetTs) {
          left = mid + 1;
        } else {
          right = mid - 1;
        }
      }

      // Check neighbors after binary search (in case we're between two values)
      if (
        left < sortedTimestamps.length &&
        Math.abs(sortedTimestamps[left] - targetTs) <= tolerance
      ) {
        return true;
      }
      if (
        right >= 0 &&
        Math.abs(sortedTimestamps[right] - targetTs) <= tolerance
      ) {
        return true;
      }

      return false;
    };

    let totalScrobbles = 0;
    let ourScrobbles = 0;

    // All listening events, including unresolved plays
    forEachListeningPlay(index, play => {
      totalScrobbles++;
      if (isOurScrobble(play.timestamp)) {
        ourScrobbles++;
      }
    });

    const otherScrobbles = totalScrobbles - ourScrobbles;

    if (totalScrobbles === 0) {
      return [];
    }

    const result: SourceBreakdownItem[] = [];

    if (ourScrobbles > 0) {
      result.push({
        source: 'RecordScrobbles',
        count: ourScrobbles,
        percentage: Math.round((ourScrobbles / totalScrobbles) * 100),
      });
    }

    if (otherScrobbles > 0) {
      result.push({
        source: 'Other',
        count: otherScrobbles,
        percentage: Math.round((otherScrobbles / totalScrobbles) * 100),
      });
    }

    return result.sort((a, b) => b.count - a.count);
  }

  /**
   * Get listening timeline data aggregated by week or month
   * @param period - Time period preset or 'custom' for custom range
   * @param granularity - How to aggregate data: by day, week, or month
   * @param customStartDate - Start timestamp in seconds (for custom period)
   * @param customEndDate - End timestamp in seconds (for custom period)
   */
  async getListeningTimeline(
    period:
      | 'week'
      | 'month'
      | 'year'
      | 'days30'
      | 'days90'
      | 'days365'
      | 'custom' = 'year',
    granularity: 'day' | 'week' | 'month' = 'week',
    customStartDate?: number,
    customEndDate?: number
  ): Promise<TimelineDataPoint[]> {
    const index = await this.historyStorage.getIndex();
    if (!index) {
      return [];
    }

    const now = new Date();
    let startTimestamp: number;
    let endTimestamp: number = now.getTime() / 1000;

    // Handle custom date range
    if (
      period === 'custom' &&
      customStartDate !== undefined &&
      customEndDate !== undefined
    ) {
      startTimestamp = customStartDate;
      endTimestamp = customEndDate;
    } else {
      let startDate: Date;

      // Determine the time range based on period
      switch (period) {
        case 'week':
          startDate = new Date(now);
          startDate.setDate(startDate.getDate() - 7);
          break;
        case 'month':
          startDate = new Date(now);
          startDate.setMonth(startDate.getMonth() - 1);
          break;
        case 'days30':
          startDate = new Date(now);
          startDate.setDate(startDate.getDate() - 30);
          break;
        case 'days90':
          startDate = new Date(now);
          startDate.setDate(startDate.getDate() - 90);
          break;
        case 'days365':
          startDate = new Date(now);
          startDate.setDate(startDate.getDate() - 365);
          break;
        case 'year':
        default:
          startDate = new Date(now);
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
      }

      startTimestamp = startDate.getTime() / 1000;
    }

    const counts = new Map<string, number>();

    // Aggregate scrobbles (album plays and unresolved plays)
    forEachListeningPlay(index, play => {
      if (play.timestamp >= startTimestamp && play.timestamp <= endTimestamp) {
        const date = new Date(play.timestamp * 1000);
        let key: string;

        switch (granularity) {
          case 'day':
            key = this.formatDateKey(date);
            break;
          case 'week': {
            // Use ISO week format: YYYY-Www
            const weekStart = this.getStartOfWeek(date);
            key = this.formatDateKey(weekStart);
            break;
          }
          case 'month':
          default:
            key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            break;
        }

        counts.set(key, (counts.get(key) || 0) + 1);
      }
    });

    // Convert to sorted array
    return Array.from(counts.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /** Artist name with display casing from the alias mappings, if any */
  private artistDisplayName(artist: string): string {
    return this.artistNameResolver
      ? this.artistNameResolver.getDisplayName(artist)
      : artist;
  }

  /** Search, sort and page one History list */
  private pageHistoryRows<Row extends { playCount: number }>(
    rows: Row[],
    query: HistoryListQuery<string>,
    searchText: (row: Row) => string[],
    sortValue: (row: Row, sortBy: string) => number | string
  ): HistoryListPage<Row> {
    // A copy: rows may be cached, and sorting is in place
    let filtered = [...rows];
    const search = query.search?.toLowerCase().trim();
    if (search) {
      filtered = rows.filter(row =>
        searchText(row).some(text => text.toLowerCase().includes(search))
      );
    }
    filtered.sort((a, b) => {
      const x = sortValue(a, query.sortBy);
      const y = sortValue(b, query.sortBy);
      const comparison =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y));
      return query.sortOrder === 'desc' ? -comparison : comparison;
    });
    const start = (query.page - 1) * query.perPage;
    return {
      items: filtered.slice(start, start + query.perPage),
      total: filtered.length,
      totalPages: Math.ceil(filtered.length / query.perPage),
      page: query.page,
      maxPlayCount: filtered.reduce(
        (max, row) => Math.max(max, row.playCount),
        0
      ),
    };
  }

  /**
   * History's Tracks list: one row per track by play identity, the same rows
   * as Top Tracks, with the owned record attached
   */
  async getHistoryTracks(
    query: HistoryListQuery<
      'playCount' | 'lastPlayed' | 'artist' | 'album' | 'track'
    >,
    collection: CollectionItem[] = []
  ): Promise<HistoryListPage<HistoryTrackRow>> {
    const index = await this.historyStorage.getIndex();
    if (!index) {
      return {
        items: [],
        total: 0,
        totalPages: 0,
        page: query.page,
        maxPlayCount: 0,
      };
    }
    const items = await this.cachedHistoryRows<HistoryTrackRow>(
      index,
      'tracks',
      collection,
      async () => {
        const identity = await this.createPlayIdentity(collection);
        const rows = new Map<
          string,
          {
            artists: TrackSpellings;
            spellings: TrackSpellings;
            album: string | null;
            playCount: number;
            firstPlayed: number;
            lastPlayed: number;
            collectionItem?: CollectionItem;
          }
        >();
        for (const { artist, album, entry } of listeningEntries(index)) {
          for (const play of entry.plays) {
            if (!play.track) continue;
            const target = identity.play(artist, album, play.track);
            const row = rows.get(target.trackKey);
            if (row) {
              row.playCount++;
              row.artists.add(target.artist);
              row.spellings.add(target.track);
              row.firstPlayed = Math.min(row.firstPlayed, play.timestamp);
              row.lastPlayed = Math.max(row.lastPlayed, play.timestamp);
              row.collectionItem ??= target.collectionItem;
            } else {
              const artists = new TrackSpellings();
              artists.add(target.artist);
              const spellings = new TrackSpellings();
              spellings.add(target.track);
              rows.set(target.trackKey, {
                artists,
                spellings,
                album: target.album,
                playCount: 1,
                firstPlayed: play.timestamp,
                lastPlayed: play.timestamp,
                collectionItem: target.collectionItem,
              });
            }
          }
        }
        const items: HistoryTrackRow[] = Array.from(rows.values(), row => {
          const artist = row.artists.best;
          return {
            artist,
            artistName: this.artistDisplayName(artist),
            album: row.album ?? UNKNOWN_ALBUM_LABEL,
            ...(row.album === null && { albumUnknown: true }),
            track: row.spellings.best,
            playCount: row.playCount,
            firstPlayed: row.firstPlayed,
            lastPlayed: row.lastPlayed,
            ...(row.collectionItem && { collectionItem: row.collectionItem }),
          };
        });
        return items;
      }
    );
    return this.pageHistoryRows(
      items,
      query,
      row => [row.artist, row.album, row.track],
      (row, sortBy) =>
        sortBy === 'artist' || sortBy === 'album' || sortBy === 'track'
          ? row[sortBy]
          : sortBy === 'lastPlayed'
            ? row.lastPlayed
            : row.playCount
    );
  }

  /**
   * History's Albums list: one row per album by play identity (versions
   * joined by album mappings are one album), with the owned record attached.
   * Plays with no album aren't albums, so they aren't listed.
   */
  async getHistoryAlbums(
    query: HistoryListQuery<'playCount' | 'lastPlayed' | 'artist' | 'album'>,
    collection: CollectionItem[] = []
  ): Promise<HistoryListPage<HistoryAlbumRow>> {
    const index = await this.historyStorage.getIndex();
    if (!index) {
      return {
        items: [],
        total: 0,
        totalPages: 0,
        page: query.page,
        maxPlayCount: 0,
      };
    }
    const items = await this.cachedHistoryRows<HistoryAlbumRow>(
      index,
      'albums',
      collection,
      async () => {
        const identity = await this.createPlayIdentity(collection);
        const rows = new Map<
          string,
          {
            artists: TrackSpellings;
            album: string;
            playCount: number;
            firstPlayed: number;
            lastPlayed: number;
            collectionItem?: CollectionItem;
          }
        >();
        for (const { artist, album, entry } of listeningEntries(index)) {
          if (album === null) continue;
          for (const play of entry.plays) {
            // A track mapping can move a play to another album
            const target = play.track
              ? identity.play(artist, album, play.track)
              : identity.album(artist, album);
            if (target.album === null || target.albumKey === null) continue;
            const row = rows.get(target.albumKey);
            if (row) {
              row.playCount++;
              row.artists.add(target.artist);
              row.firstPlayed = Math.min(row.firstPlayed, play.timestamp);
              row.lastPlayed = Math.max(row.lastPlayed, play.timestamp);
              row.collectionItem ??= target.collectionItem;
            } else {
              const artists = new TrackSpellings();
              artists.add(target.artist);
              rows.set(target.albumKey, {
                artists,
                album: target.album,
                playCount: 1,
                firstPlayed: play.timestamp,
                lastPlayed: play.timestamp,
                collectionItem: target.collectionItem,
              });
            }
          }
        }
        const items: HistoryAlbumRow[] = Array.from(rows.values(), row => {
          const artist = row.artists.best;
          return {
            artist,
            artistName: this.artistDisplayName(artist),
            album: row.album,
            playCount: row.playCount,
            firstPlayed: row.firstPlayed,
            lastPlayed: row.lastPlayed,
            ...(row.collectionItem && { collectionItem: row.collectionItem }),
          };
        });
        return items;
      }
    );
    return this.pageHistoryRows(
      items,
      query,
      row => [row.artist, row.album],
      (row, sortBy) =>
        sortBy === 'artist' || sortBy === 'album'
          ? row[sortBy]
          : sortBy === 'lastPlayed'
            ? row.lastPlayed
            : row.playCount
    );
  }

  /**
   * History's Artists list: plays per artist (a compound credit counts for
   * each artist it splits into), albums counted once per merged album, and
   * the records each artist owns
   */
  async getHistoryArtists(
    query: HistoryListQuery<
      'playCount' | 'lastPlayed' | 'artist' | 'albumCount'
    >,
    collection: CollectionItem[] = []
  ): Promise<HistoryListPage<HistoryArtistRow>> {
    const index = await this.historyStorage.getIndex();
    if (!index) {
      return {
        items: [],
        total: 0,
        totalPages: 0,
        page: query.page,
        maxPlayCount: 0,
      };
    }
    const items = await this.cachedHistoryRows<HistoryArtistRow>(
      index,
      'artists',
      collection,
      async () => {
        const identity = await this.createPlayIdentity(collection);
        const keysFor = new Map<string, string[]>();
        const artistKeys = (artist: string) => {
          let keys = keysFor.get(artist);
          if (!keys) {
            keys = this.resolveArtistNames(artist);
            keysFor.set(artist, keys);
          }
          return keys;
        };
        const rows = new Map<
          string,
          {
            playCount: number;
            albums: Set<string>;
            firstPlayed: number;
            lastPlayed: number;
          }
        >();
        for (const { artist, album, entry } of listeningEntries(index)) {
          for (const play of entry.plays) {
            const target = play.track
              ? identity.play(artist, album, play.track)
              : album === null
                ? { artist, albumKey: null }
                : identity.album(artist, album);
            for (const key of artistKeys(target.artist)) {
              const row = rows.get(key) ?? {
                playCount: 0,
                albums: new Set<string>(),
                firstPlayed: play.timestamp,
                lastPlayed: play.timestamp,
              };
              row.playCount++;
              if (target.albumKey !== null) row.albums.add(target.albumKey);
              row.firstPlayed = Math.min(row.firstPlayed, play.timestamp);
              row.lastPlayed = Math.max(row.lastPlayed, play.timestamp);
              rows.set(key, row);
            }
          }
        }
        const items: HistoryArtistRow[] = Array.from(
          rows.entries(),
          ([key, row]) => {
            const artist = this.artistDisplayName(key);
            const owned = identity.ownedByArtist(artist);
            const cover = owned.find(item => item.release.cover_image)?.release
              .cover_image;
            return {
              artist,
              playCount: row.playCount,
              albumCount: row.albums.size,
              firstPlayed: row.firstPlayed,
              lastPlayed: row.lastPlayed,
              ownedCount: owned.length,
              ...(cover && { ownedCoverUrl: cover }),
            };
          }
        );
        return items;
      }
    );
    return this.pageHistoryRows(
      items,
      query,
      row => [row.artist],
      (row, sortBy) =>
        sortBy === 'artist'
          ? row.artist
          : sortBy === 'lastPlayed'
            ? row.lastPlayed
            : sortBy === 'albumCount'
              ? row.albumCount
              : row.playCount
    );
  }

  /**
   * Get tracks with high play counts that haven't been played recently.
   * Surfaces forgotten favorites from the scrobble history.
   *
   * Performance: O(n) scan of all plays in history index.
   * Results are cached for 5 minutes to avoid repeated scans.
   *
   * @param dormantPeriodDays - Days since last play to consider "forgotten" (default: 90)
   * @param minPlayCount - Minimum all-time plays to qualify (default: 10)
   * @param limit - Max tracks to return (capped at 100)
   * @returns Tracks and total count of matching tracks
   */
  async getForgottenFavorites(
    dormantPeriodDays: number = 90,
    minPlayCount: number = 10,
    limit: number = 100,
    collection: CollectionItem[] = []
  ): Promise<{ tracks: ForgottenTrack[]; totalMatching: number }> {
    // Cap limit at 100
    const cappedLimit = Math.min(limit, 100);

    // Check cache (keyed by params excluding limit - we store all results).
    // Artist aliases decide which plays share a row.
    // The rules (mappings, aliases) and the collection decide the rows and
    // their owned records
    const cacheKey = JSON.stringify({
      dormantPeriodDays,
      minPlayCount,
      rules: await this.playIdentityKey(collection),
    });
    if (
      this.forgottenFavoritesCache &&
      this.forgottenFavoritesCache.params === cacheKey &&
      Date.now() - this.forgottenFavoritesCache.timestamp <
        this.FORGOTTEN_CACHE_TTL_MS
    ) {
      return {
        tracks: this.forgottenFavoritesCache.data.slice(0, cappedLimit),
        totalMatching: this.forgottenFavoritesCache.data.length,
      };
    }

    const index = await this.historyStorage.getIndex();
    if (!index) {
      return { tracks: [], totalMatching: 0 };
    }

    const now = Date.now() / 1000;
    const cutoffTimestamp = now - dormantPeriodDays * 24 * 60 * 60;

    // Build track play counts from all albums
    // Key: "artist|album|track" (normalized)
    const trackStats = new Map<
      string,
      {
        // Aliases merge into one row, named by the most-played spelling
        artists: TrackSpellings;
        album: string | null;
        spellings: TrackSpellings;
        count: number;
        lastPlayed: number;
        firstPlayed: number;
        collectionItem?: CollectionItem;
      }
    >();

    // Track mappings are keyed by album, so they never apply to unresolved
    // plays (album null), which form their own "Unknown album" track rows.
    // Album versions merged by a mapping count as one album, so a play on any
    // version keeps the track from looking forgotten.
    const identity = await this.createPlayIdentity(collection);
    for (const { artist, album, entry: albumHistory } of listeningEntries(
      index
    )) {
      for (const play of albumHistory.plays) {
        // Skip plays without track info
        if (!play.track) continue;

        const {
          artist: targetArtist,
          album: targetAlbum,
          track: targetTrack,
          trackKey,
          collectionItem,
        } = identity.play(artist, album, play.track);

        const existing = trackStats.get(trackKey);

        if (existing) {
          existing.count++;
          existing.spellings.add(targetTrack);
          existing.artists.add(targetArtist);
          if (play.timestamp > existing.lastPlayed) {
            existing.lastPlayed = play.timestamp;
          }
          if (play.timestamp < existing.firstPlayed) {
            existing.firstPlayed = play.timestamp;
          }
          existing.collectionItem ??= collectionItem;
        } else {
          const spellings = new TrackSpellings();
          spellings.add(targetTrack);
          const artists = new TrackSpellings();
          artists.add(targetArtist);
          trackStats.set(trackKey, {
            artists,
            album: targetAlbum,
            spellings,
            count: 1,
            lastPlayed: play.timestamp,
            firstPlayed: play.timestamp,
            collectionItem,
          });
        }
      }
    }

    // Filter to forgotten tracks only
    const forgottenTracks: ForgottenTrack[] = [];

    for (const stats of trackStats.values()) {
      // Must have enough plays AND be dormant (not played since cutoff)
      if (stats.count >= minPlayCount && stats.lastPlayed < cutoffTimestamp) {
        forgottenTracks.push({
          artist: this.capitalizeArtist(stats.artists.best),
          album:
            stats.album === null
              ? UNKNOWN_ALBUM_LABEL
              : stats.album
                ? this.capitalizeTitle(stats.album)
                : '',
          track: this.capitalizeTitle(stats.spellings.best),
          allTimePlayCount: stats.count,
          lastPlayed: stats.lastPlayed,
          daysSincePlay: Math.floor((now - stats.lastPlayed) / (24 * 60 * 60)),
          firstPlayed: stats.firstPlayed,
          ...(stats.collectionItem && { collectionItem: stats.collectionItem }),
        });
      }
    }

    // Sort by play count (most played forgotten tracks first)
    forgottenTracks.sort((a, b) => b.allTimePlayCount - a.allTimePlayCount);

    // Update cache (store all results, not just limited)
    this.forgottenFavoritesCache = {
      data: forgottenTracks,
      params: cacheKey,
      timestamp: Date.now(),
    };

    return {
      tracks: forgottenTracks.slice(0, cappedLimit),
      totalMatching: forgottenTracks.length,
    };
  }

  /**
   * Get unique track names that have been scrobbled for a given album.
   * Uses fuzzy matching to handle naming differences between Discogs and Last.fm.
   *
   * @param artist - Artist name
   * @param album - Album name
   * @returns Array of unique track names that have been scrobbled
   */
  async getAlbumTracksPlayed(
    artist: string,
    album: string,
    collection: CollectionItem[] = []
  ): Promise<string[]> {
    // The album's plays by play identity: versions merged by album mappings,
    // and for an owned record every version that resolves to it. Each track
    // under the name it counts as and as it was scrobbled, so a tracklist
    // matches either.
    const resolved = await this.resolveMergedAlbum(artist, album);
    const { resolvedPlays } = await this.collectMergedAlbumHistory(
      resolved.artist,
      resolved.album,
      collection
    );
    const tracks = new Set<string>();
    for (const play of resolvedPlays) {
      if (play.track) tracks.add(play.track);
      if (play.sourceTrack) tracks.add(play.sourceTrack);
    }
    return Array.from(tracks);
  }

  // ============================================
  // Artist & Track Deep Dive Methods
  // ============================================

  /**
   * Get detailed stats for a specific artist.
   * Aggregates data across all albums by that artist in the scrobble history.
   *
   * @param artistName - Artist name (case-insensitive matching against history index)
   * @param trendPeriod - Granularity for the play trend chart ('month' or 'week')
   * @param collection - User's Discogs collection, used to cross-reference album ownership
   * @returns Aggregate stats including play counts, top tracks, albums, and trend data
   */
  async getArtistDetail(
    artistName: string,
    trendPeriod: 'month' | 'week' = 'month',
    collection: CollectionItem[]
  ): Promise<ArtistDetailResponse> {
    // No history yet: the records you own are still listed
    const index = await this.historyStorage.getIndex();

    // Period cutoffs (timestamps in seconds)
    const now = new Date();
    const weekStart = this.getStartOfWeek(now).getTime() / 1000;
    const monthStart = this.getStartOfMonth(now).getTime() / 1000;
    const yearStart = this.getStartOfYear(now).getTime() / 1000;

    // Aggregate data across all albums by this artist
    let totalPlayCount = 0;
    let firstPlayed: number | null = null;
    let lastPlayed: number | null = null;
    let thisWeek = 0;
    let thisMonth = 0;
    let thisYear = 0;

    // Track play counts by play identity (track mappings, merged album
    // versions), value = { spellings, album, count, lastPlayed }
    const identity = await this.createPlayIdentity(collection);
    const trackCounts = new Map<
      string,
      {
        spellings: TrackSpellings;
        album: string | null;
        count: number;
        lastPlayed: number;
      }
    >();

    // Album data: key = normalized album name, value = { artist, album, playCount, lastPlayed }.
    // historyEntries holds every raw history artist/album merged into the entry so the
    // collection lookup can match on any of them.
    const albumCounts = new Map<
      string,
      {
        artist: string;
        album: string;
        playCount: number;
        lastPlayed: number;
        historyEntries: Array<{ artist: string; album: string }>;
        collectionItem?: CollectionItem;
      }
    >();

    // Play trend data: key = period string (YYYY-MM or YYYY-Www), value = count
    const trendCounts = new Map<string, number>();

    // Every play is resolved first (play identity), and counts here when it
    // counts as this artist: a track mapping can move plays to or away from
    // them. Unresolved plays (no album) count in totals, periods, trend and
    // top tracks (as "Unknown album"), but never in the albums list.
    const movesPlaysHere = identity.movesPlaysTo(name =>
      this.isArtistMatch(name, artistName)
    );
    for (const { artist, album: historyAlbum, entry: albumHistory } of index
      ? listeningEntries(index)
      : []) {
      if (
        !this.isArtistMatch(artist, artistName) &&
        !movesPlaysHere(artist, historyAlbum)
      ) {
        continue;
      }
      for (const play of albumHistory.plays) {
        const target = play.track
          ? identity.play(artist, historyAlbum, play.track)
          : historyAlbum === null
            ? null
            : identity.album(artist, historyAlbum);
        if (!this.isArtistMatch(target?.artist ?? artist, artistName)) {
          continue;
        }

        totalPlayCount++;
        if (firstPlayed === null || play.timestamp < firstPlayed) {
          firstPlayed = play.timestamp;
        }
        if (lastPlayed === null || play.timestamp > lastPlayed) {
          lastPlayed = play.timestamp;
        }
        if (play.timestamp >= weekStart) thisWeek++;
        if (play.timestamp >= monthStart) thisMonth++;
        if (play.timestamp >= yearStart) thisYear++;
        const periodKey = this.trendPeriodKey(play.timestamp, trendPeriod);
        trendCounts.set(periodKey, (trendCounts.get(periodKey) || 0) + 1);

        // Albums, by merged album (versions joined by mappings are one)
        if (target?.album && target.albumKey) {
          const existing = albumCounts.get(target.albumKey);
          if (existing) {
            existing.playCount++;
            existing.lastPlayed = Math.max(existing.lastPlayed, play.timestamp);
            existing.collectionItem ??= target.collectionItem;
            if (
              historyAlbum !== null &&
              !existing.historyEntries.some(
                e => e.artist === artist && e.album === historyAlbum
              )
            ) {
              existing.historyEntries.push({ artist, album: historyAlbum });
            }
          } else {
            albumCounts.set(target.albumKey, {
              artist: target.artist,
              album: target.album,
              playCount: 1,
              lastPlayed: play.timestamp,
              historyEntries:
                historyAlbum === null ? [] : [{ artist, album: historyAlbum }],
              collectionItem: target.collectionItem,
            });
          }
        }

        // Top tracks, by track identity
        if (play.track && target && 'trackKey' in target) {
          const existing = trackCounts.get(target.trackKey);
          if (existing) {
            existing.count++;
            existing.spellings.add(target.track);
            existing.lastPlayed = Math.max(existing.lastPlayed, play.timestamp);
          } else {
            const spellings = new TrackSpellings();
            spellings.add(target.track);
            trackCounts.set(target.trackKey, {
              spellings,
              album: target.album,
              count: 1,
              lastPlayed: play.timestamp,
            });
          }
        }
      }
    }

    // Build top tracks (sorted by play count descending)
    const topTracks = Array.from(trackCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)
      .map(t => ({
        track: this.capitalizeTitle(t.spellings.best),
        album: this.displayAlbum(t.album),
        playCount: t.count,
        lastPlayed: t.lastPlayed,
      }));

    // Records you own that no row above covers, once per record (copies of
    // one album are one record). Their plays can be credited to another
    // artist (a collaboration scrobbled under one of its artists), so the
    // record's own plays decide; plays belong to the album, never a copy.
    const listedRecords = new Set(
      Array.from(albumCounts.values()).flatMap(a =>
        a.collectionItem ? [identity.recordKey(a.collectionItem)] : []
      )
    );
    const otherRecords: Array<{
      album: string;
      playCount: number;
      lastPlayed: number | null;
      historyEntries: Array<{ artist: string; album: string }>;
      collectionItem?: CollectionItem;
    }> = [];
    const unlisted = identity
      .ownedByArtist(artistName)
      .filter(item => !listedRecords.has(identity.recordKey(item)));
    if (unlisted.length > 0) {
      const model = await this.playIdentity.readModel(collection);
      for (const item of unlisted) {
        const key = identity.recordKey(item);
        if (listedRecords.has(key)) continue;
        listedRecords.add(key);
        const { entry } = model.recordPlays(item);
        otherRecords.push({
          album: item.release.title,
          playCount: entry?.playCount ?? 0,
          lastPlayed: entry?.lastPlayed ?? null,
          historyEntries: [],
          collectionItem: item,
        });
      }
    }

    // Played albums by plays, then records never played by title
    const albums = [...Array.from(albumCounts.values()), ...otherRecords]
      .sort(
        (a, b) =>
          b.playCount - a.playCount ||
          (b.playCount === 0 ? a.album.localeCompare(b.album) : 0)
      )
      .map((a): ArtistDetailResponse['albums'][number] => {
        // Decided by play identity
        const { collectionItem } = a;
        return {
          album: this.capitalizeTitle(a.album),
          playCount: a.playCount,
          lastPlayed: a.lastPlayed,
          coverUrl: collectionItem?.release.cover_image,
          inCollection: !!collectionItem,
          collectionReleaseId: collectionItem?.release.id,
          collectionItemId: collectionItem?.id,
          collectionArtist: collectionItem?.release.artist,
          collectionAlbum: collectionItem?.release.title,
          historyEntries: a.historyEntries,
        };
      });

    // Build play trend (sorted chronologically)
    const playTrend = Array.from(trendCounts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([period, count]) => ({ period, count }));

    return {
      artist: this.artistNameResolver
        ? this.artistNameResolver.getDisplayName(artistName)
        : this.capitalizeArtist(artistName),
      totalPlayCount,
      firstPlayed,
      lastPlayed,
      periodCounts: {
        thisWeek,
        thisMonth,
        thisYear,
        allTime: totalPlayCount,
      },
      playTrend,
      topTracks,
      albums,
    };
  }

  /** Optional: labels looked up for albums you don't own */
  setAlbumLabelService(service: Pick<AlbumLabelService, 'getAll'>): void {
    this.albumLabelService = service;
  }

  /**
   * Match every owned album to the history albums its plays are under (play
   * identity: the plays that resolve to the record). Copies of one album
   * (same master, or same merged album) form one group; each history album
   * goes to one group at most.
   */
  private async matchCollectionToHistory(collection: CollectionItem[]) {
    type OwnedGroup = {
      artist: string;
      album: string;
      items: CollectionItem[];
    };
    const model = await this.playIdentity.readModel(collection);
    const { identity } = model;
    const groups: OwnedGroup[] = [];
    const groupByKey = new Map<string, OwnedGroup>();
    for (const item of collection) {
      const artist = stripDiscogsSuffixes(item.release.artist);
      const keys = [
        identity.recordKey(item),
        ...(item.release.master_id ? [`master:${item.release.master_id}`] : []),
      ];
      let group = keys
        .map(k => groupByKey.get(k))
        .find((g): g is OwnedGroup => g !== undefined);
      if (group) {
        if (!group.items.some(existing => existing.id === item.id)) {
          group.items.push(item);
        }
      } else {
        group = { artist, album: item.release.title, items: [item] };
        groups.push(group);
      }
      for (const k of keys) groupByKey.set(k, group);
    }

    const index = await this.historyStorage.getIndex();
    const albums = index?.albums ?? {};

    // Each group's plays: every play that resolves to one of its copies,
    // once, and only in the first group that reaches it
    const playsByGroup = new Map<OwnedGroup, ResolvedPlay[]>(
      groups.map(group => [group, []])
    );
    const placed = new Set<ResolvedPlay>();
    for (const group of groups) {
      for (const copy of group.items) {
        for (const play of model.recordResolvedPlays(copy)) {
          if (placed.has(play)) continue;
          placed.add(play);
          playsByGroup.get(group)!.push(play);
        }
      }
    }

    /** Albums you don't own (play identity), one per merged album */
    const unowned = new Map<
      string,
      {
        artist: string;
        album: string;
        historyKeys: string[];
        plays: ResolvedPlay[];
      }
    >();
    for (const album of model.albums()) {
      if (album.collectionItem) continue;
      const historyKeys = Array.from(
        new Set(
          album.plays
            .map(play => play.sourceKey)
            .filter((key): key is string => key !== null && !!albums[key])
        )
      );
      unowned.set(album.albumKey, {
        artist: album.artist.toLowerCase().trim(),
        album: album.album.toLowerCase().trim(),
        historyKeys,
        plays: album.plays,
      });
    }

    return { albums, groups, playsByGroup, unowned };
  }

  /**
   * The album key label lookups are stored under: the album grouping key
   * after album mappings and artist aliases, so an album page (display
   * names) and the label pages (history names) agree.
   */
  async albumLabelKey(artist: string, album: string): Promise<string> {
    return (await this.createPlayIdentity()).album(artist, album).albumKey;
  }

  /**
   * Albums you don't own with at least `minPlays` plays: the ones whose label
   * is looked up in the background. Keyed (artist, album) the way
   * AlbumLabelService stores lookups.
   */
  async getAlbumLabelCandidates(
    collection: CollectionItem[],
    minPlays = 3
  ): Promise<AlbumLabelCandidate[]> {
    const { albums, unowned } = await this.matchCollectionToHistory(collection);
    const candidates: AlbumLabelCandidate[] = [];
    for (const [key, entry] of unowned) {
      // The album's plays (play identity); the MusicBrainz id from the
      // most recently played history album it was scrobbled under
      const playCount = entry.plays.length;
      let lastPlayed = 0;
      for (const play of entry.plays) {
        lastPlayed = Math.max(lastPlayed, play.timestamp);
      }
      let mbid: string | undefined;
      let mbidPlayed = -1;
      for (const historyKey of entry.historyKeys) {
        const history = albums[historyKey];
        if (history.mbid && history.lastPlayed > mbidPlayed) {
          mbid = history.mbid;
          mbidPlayed = history.lastPlayed;
        }
      }
      if (playCount < minPlays) continue;
      const candidate: AlbumLabelCandidate = {
        key,
        artist: entry.artist,
        album: entry.album,
        playCount,
        lastPlayed,
      };
      if (mbid) candidate.mbid = mbid;
      candidates.push(candidate);
    }
    return candidates.sort((a, b) => b.lastPlayed - a.lastPlayed);
  }

  /**
   * The most played labels in a period. Counts the same way as the label
   * page: an owned album counts to the labels of the copies you own, an album
   * you don't own to its found or owner-set label (unless `includeUnowned` is
   * false), a release on two labels to both, and a play once per label.
   * Placeholder labels ("Not On Label") are left out.
   */
  async getTopLabels(
    period:
      | 'week'
      | 'month'
      | 'year'
      | 'all'
      | 'days30'
      | 'days90'
      | 'days365'
      | 'custom',
    limit: number,
    collection: CollectionItem[],
    options: {
      startDate?: number;
      endDate?: number;
      includeUnowned?: boolean;
    } = {}
  ): Promise<LabelPlayCount[]> {
    const custom =
      period === 'custom' &&
      options.startDate !== undefined &&
      options.endDate !== undefined;
    const start = custom ? options.startDate! : this.getPeriodCutoff(period);
    const end = custom ? options.endDate! : Date.now() / 1000;

    const { groups, playsByGroup, unowned } =
      await this.matchCollectionToHistory(collection);

    type Tally = {
      ownedSpellings: Map<string, number>;
      lookedUpSpellings: Map<string, number>;
      plays: Set<string>;
      ownedPlays: number;
      albumCount: number;
      lastPlayed: number;
      cover?: { url: string; plays: number };
    };
    const tallies = new Map<string, Tally>();
    const tallyFor = (key: string): Tally => {
      let tally = tallies.get(key);
      if (!tally) {
        tally = {
          ownedSpellings: new Map(),
          lookedUpSpellings: new Map(),
          plays: new Set(),
          ownedPlays: 0,
          albumCount: 0,
          lastPlayed: 0,
        };
        tallies.set(key, tally);
      }
      return tally;
    };
    const addSpelling = (spellings: Map<string, number>, raw: string) => {
      const name = labelDisplayName(raw);
      spellings.set(name, (spellings.get(name) ?? 0) + 1);
    };

    /** These plays in the period, each with an id to count it once */
    const playsInPeriod = (plays: ResolvedPlay[]) => {
      const found: Array<{ identity: string; timestamp: number }> = [];
      for (const play of plays) {
        if (play.timestamp < start || play.timestamp > end) continue;
        found.push({
          identity: JSON.stringify([
            this.resolveArtistName(play.artist),
            play.timestamp,
            (play.sourceTrack ?? '').toLowerCase().trim(),
          ]),
          timestamp: play.timestamp,
        });
      }
      return found;
    };

    const credit = (
      key: string,
      found: Array<{ identity: string; timestamp: number }>,
      owned: boolean,
      coverUrl?: string
    ) => {
      const tally = tallyFor(key);
      let counted = 0;
      for (const { identity, timestamp } of found) {
        if (tally.plays.has(identity)) continue;
        tally.plays.add(identity);
        counted++;
        if (owned) tally.ownedPlays++;
        tally.lastPlayed = Math.max(tally.lastPlayed, timestamp);
      }
      if (counted === 0) return;
      tally.albumCount++;
      if (coverUrl && (!tally.cover || counted > tally.cover.plays)) {
        tally.cover = { url: coverUrl, plays: counted };
      }
    };

    // Owned albums count to the labels of the copies you own
    for (const group of groups) {
      const found = playsInPeriod(playsByGroup.get(group) ?? []);
      const copiesByLabel = new Map<string, CollectionItem[]>();
      for (const copy of group.items) {
        for (const raw of copy.release.label ?? []) {
          if (isPlaceholderLabel(raw)) continue;
          const key = labelKey(raw);
          addSpelling(tallyFor(key).ownedSpellings, raw);
          const copies = copiesByLabel.get(key) ?? [];
          if (!copies.includes(copy)) copies.push(copy);
          copiesByLabel.set(key, copies);
        }
      }
      for (const [key, copies] of copiesByLabel) {
        credit(key, found, true, copies[0].release.cover_image);
      }
    }

    // Albums you don't own, by their found or owner-set label
    if ((options.includeUnowned ?? true) && this.albumLabelService) {
      const lookups = await this.albumLabelService.getAll();
      for (const [albumKey, entry] of unowned) {
        const info = lookups.get(albumKey);
        if (!info || (info.status !== 'found' && info.status !== 'override')) {
          continue;
        }
        const keys = new Set<string>();
        for (const raw of info.labels) {
          if (isPlaceholderLabel(raw)) continue;
          const key = labelKey(raw);
          addSpelling(tallyFor(key).lookedUpSpellings, raw);
          keys.add(key);
        }
        if (keys.size === 0) continue;
        const found = playsInPeriod(entry.plays);
        for (const key of keys) credit(key, found, false);
      }
    }

    const commonest = (spellings: Map<string, number>) =>
      Array.from(spellings.entries()).sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
      )[0]?.[0];

    return Array.from(tallies.entries())
      .filter(([, tally]) => tally.plays.size > 0)
      .map(([key, tally]) => {
        const row: LabelPlayCount = {
          label:
            commonest(tally.ownedSpellings) ??
            commonest(tally.lookedUpSpellings) ??
            key,
          labelKey: key,
          playCount: tally.plays.size,
          ownedPlayCount: tally.ownedPlays,
          albumCount: tally.albumCount,
          lastPlayed: tally.lastPlayed,
        };
        if (tally.cover) row.coverUrl = tally.cover.url;
        return row;
      })
      .sort(
        (a, b) => b.playCount - a.playCount || a.label.localeCompare(b.label)
      )
      .slice(0, limit);
  }

  /**
   * Listening stats for one label. Plays of an owned album count to the
   * labels of that copy (a reissue counts to its reissue label). With
   * `includeUnowned` (the default), albums you don't own count too, using the
   * label looked up for them (or set by you); unsure lookups don't count.
   * Returns null for a placeholder label ("Not On Label") or one with no
   * owned copies and no looked-up albums.
   */
  async getLabelDetail(
    labelName: string,
    trendPeriod: 'month' | 'week' = 'month',
    collection: CollectionItem[],
    options: { includeUnowned?: boolean } = {}
  ): Promise<LabelDetailResponse | null> {
    if (isPlaceholderLabel(labelName)) return null;
    const key = labelKey(labelName);
    const includeUnowned = options.includeUnowned ?? true;
    const onLabel = (raw: string) =>
      !isPlaceholderLabel(raw) && labelKey(raw) === key;

    const { groups, playsByGroup, unowned } =
      await this.matchCollectionToHistory(collection);

    type Unit = {
      artist: string;
      album: string;
      owned: boolean;
      source: LabelDetailResponse['topAlbums'][number]['source'];
      coverUrl?: string;
      copies: CollectionItem[];
      /** The unit's plays, resolved (play identity) */
      plays: ResolvedPlay[];
    };
    const units: Unit[] = [];
    const spellings = new Map<string, number>();
    const countSpelling = (raw: string) => {
      const name = labelDisplayName(raw);
      spellings.set(name, (spellings.get(name) ?? 0) + 1);
    };

    // Owned albums on this label: the copies on it, and the group's plays
    let ownedCopyCount = 0;
    for (const group of groups) {
      const copies = group.items.filter(copy =>
        (copy.release.label ?? []).some(onLabel)
      );
      if (copies.length === 0) continue;
      ownedCopyCount += copies.length;
      for (const copy of copies) {
        (copy.release.label ?? []).filter(onLabel).forEach(countSpelling);
      }
      units.push({
        artist: group.artist,
        album: group.album,
        owned: true,
        source: 'owned',
        coverUrl: copies[0].release.cover_image,
        copies,
        plays: playsByGroup.get(group) ?? [],
      });
    }

    // Albums you don't own, by their looked-up or owner-set label
    if (includeUnowned && this.albumLabelService) {
      const lookups = await this.albumLabelService.getAll();
      for (const [albumKey, entry] of unowned) {
        const info = lookups.get(albumKey);
        if (!info || (info.status !== 'found' && info.status !== 'override')) {
          continue;
        }
        const labels = info.labels.filter(onLabel);
        if (labels.length === 0) continue;
        if (ownedCopyCount === 0) labels.forEach(countSpelling);
        units.push({
          artist: entry.artist,
          album: entry.album,
          owned: false,
          source: info.source,
          copies: [],
          plays: entry.plays,
        });
      }
    }
    if (units.length === 0) return null;

    const [label, ...otherSpellings] = Array.from(spellings.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name);

    const now = new Date();
    const weekStart = this.getStartOfWeek(now).getTime() / 1000;
    const monthStart = this.getStartOfMonth(now).getTime() / 1000;
    const yearStart = this.getStartOfYear(now).getTime() / 1000;

    let totalPlayCount = 0;
    let ownedPlayCount = 0;
    let firstPlayed: number | null = null;
    let lastPlayed: number | null = null;
    let thisWeek = 0;
    let thisMonth = 0;
    let thisYear = 0;
    const trendCounts = new Map<string, number>();
    const seenPlays = new Set<string>();
    const artistStats = new Map<
      string,
      { playCount: number; lastPlayed: number; albums: Set<number> }
    >();
    const trackCounts = new Map<
      string,
      {
        artist: string;
        album: string;
        spellings: TrackSpellings;
        count: number;
        lastPlayed: number;
      }
    >();
    const topAlbums: LabelDetailResponse['topAlbums'] = [];
    const unplayedCopies: LabelDetailResponse['unplayedCopies'] = [];

    // The resolver hands back the lowercase key when it has no preferred
    // spelling; title-case that instead of showing it as is
    const displayArtist = (name: string) => {
      const display = this.artistNameResolver?.getDisplayName(name) ?? name;
      return display === display.toLowerCase()
        ? this.capitalizeArtist(display)
        : display;
    };

    for (const [unitIndex, unit] of units.entries()) {
      const albumTitle = unit.owned
        ? unit.album
        : this.capitalizeTitle(unit.album);
      let albumPlays = 0;
      let albumLastPlayed = 0;
      for (const play of unit.plays) {
        const historyArtist = play.artist;
        const identity = JSON.stringify([
          this.resolveArtistName(historyArtist),
          play.timestamp,
          (play.sourceTrack ?? '').toLowerCase().trim(),
        ]);
        if (seenPlays.has(identity)) continue;
        seenPlays.add(identity);

        totalPlayCount++;
        if (unit.owned) ownedPlayCount++;
        albumPlays++;
        albumLastPlayed = Math.max(albumLastPlayed, play.timestamp);
        if (firstPlayed === null || play.timestamp < firstPlayed) {
          firstPlayed = play.timestamp;
        }
        if (lastPlayed === null || play.timestamp > lastPlayed) {
          lastPlayed = play.timestamp;
        }
        if (play.timestamp >= weekStart) thisWeek++;
        if (play.timestamp >= monthStart) thisMonth++;
        if (play.timestamp >= yearStart) thisYear++;
        const periodKey = this.trendPeriodKey(play.timestamp, trendPeriod);
        trendCounts.set(periodKey, (trendCounts.get(periodKey) ?? 0) + 1);

        // Each artist of a split collaboration gets the play
        for (const artistKey of this.resolveArtistNames(historyArtist)) {
          const stats = artistStats.get(artistKey) ?? {
            playCount: 0,
            lastPlayed: 0,
            albums: new Set<number>(),
          };
          stats.playCount++;
          stats.lastPlayed = Math.max(stats.lastPlayed, play.timestamp);
          stats.albums.add(unitIndex);
          artistStats.set(artistKey, stats);
        }

        // Tracks by play identity, shown under this unit's album
        if (play.track && play.trackKey) {
          const trackKey = `${unitIndex}|${play.trackKey}`;
          const existing = trackCounts.get(trackKey);
          if (existing) {
            existing.count++;
            existing.spellings.add(play.track);
            existing.lastPlayed = Math.max(existing.lastPlayed, play.timestamp);
          } else {
            const trackSpellings = new TrackSpellings();
            trackSpellings.add(play.track);
            trackCounts.set(trackKey, {
              artist: historyArtist,
              album: albumTitle,
              spellings: trackSpellings,
              count: 1,
              lastPlayed: play.timestamp,
            });
          }
        }
      }

      if (albumPlays === 0) {
        for (const copy of unit.copies) {
          unplayedCopies.push({
            artist: stripDiscogsSuffixes(copy.release.artist),
            album: copy.release.title,
            releaseId: copy.release.id,
          });
        }
        continue;
      }
      topAlbums.push({
        artist: unit.owned ? unit.artist : displayArtist(unit.artist),
        album: albumTitle,
        playCount: albumPlays,
        lastPlayed: albumLastPlayed,
        coverUrl: unit.coverUrl,
        collectionReleaseIds: unit.copies.map(copy => copy.release.id),
        owned: unit.owned,
        source: unit.source,
      });
    }

    return {
      labelKey: key,
      label,
      otherSpellings,
      totalPlayCount,
      ownedPlayCount,
      lookedUpPlayCount: totalPlayCount - ownedPlayCount,
      includeUnowned,
      firstPlayed,
      lastPlayed,
      periodCounts: {
        thisWeek,
        thisMonth,
        thisYear,
        allTime: totalPlayCount,
      },
      playTrend: Array.from(trendCounts.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([period, count]) => ({ period, count })),
      topArtists: Array.from(artistStats.entries())
        .sort((a, b) => b[1].playCount - a[1].playCount)
        .slice(0, 20)
        .map(([artist, stats]) => ({
          artist: displayArtist(artist),
          playCount: stats.playCount,
          albumCount: stats.albums.size,
          lastPlayed: stats.lastPlayed,
        })),
      topAlbums: topAlbums
        .sort((a, b) => b.playCount - a.playCount)
        .slice(0, 50),
      topTracks: Array.from(trackCounts.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 20)
        .map(t => ({
          artist: displayArtist(t.artist),
          track: this.capitalizeTitle(t.spellings.best),
          album: t.album,
          playCount: t.count,
          lastPlayed: t.lastPlayed,
        })),
      ownedCopyCount,
      unplayedCopies,
    };
  }

  /**
   * Get detailed stats for a specific track.
   * Scans all album entries for plays matching the track name.
   *
   * @param artist - Artist name (case-insensitive matching)
   * @param track - Track name (case-insensitive matching)
   * @param album - Optional album filter; when provided, only counts plays from that album
   * @param trendPeriod - Granularity for the play trend chart ('month' or 'week')
   * @param collection - User's Discogs collection, used to mark albums as "In Collection"
   * @returns Play counts, trend data, and list of albums the track appears on
   */
  async getTrackDetail(
    artist: string,
    track: string,
    album?: string,
    trendPeriod: 'month' | 'week' = 'month',
    collection: CollectionItem[] = []
  ): Promise<TrackDetailResponse> {
    const index = await this.historyStorage.getIndex();
    if (!index) {
      return {
        artist,
        track,
        totalPlayCount: 0,
        firstPlayed: null,
        lastPlayed: null,
        playTrend: [],
        appearsOn: [],
      };
    }

    const identity = await this.createPlayIdentity(collection);

    let totalPlayCount = 0;
    let firstPlayed: number | null = null;
    let lastPlayed: number | null = null;

    // Play trend data
    const trendCounts = new Map<string, number>();

    // Albums this track appears on, by play identity: versions merged by
    // album mappings count as one album
    const albumAppearances = new Map<
      string,
      {
        album: string | null;
        artist: string;
        playCount: number;
        lastPlayed: number;
        collectionItem?: CollectionItem;
      }
    >();

    // An album filter of "Unknown album" selects plays with no album
    const unknownAlbumFilter =
      album?.toLowerCase() === UNKNOWN_ALBUM_LABEL.toLowerCase();
    const albumFilterKey =
      album && !unknownAlbumFilter
        ? identity.album(artist, album).albumKey
        : undefined;
    // Opened from an album row, the track is named as that album counts it
    const requestedKey = trackMatchKey(
      album && !unknownAlbumFilter
        ? identity.play(artist, album, track).track
        : track
    );

    // Each play is resolved before filtering, so a play a track mapping moved
    // to another album or artist counts there, and only there
    const artistMatches = new Map<string, boolean>();
    const matchesArtist = (name: string) => {
      let match = artistMatches.get(name);
      if (match === undefined) {
        match = this.isArtistMatch(name, artist);
        artistMatches.set(name, match);
      }
      return match;
    };

    // Other artists' plays only matter when a track mapping moves some to
    // this artist; skip the rest without resolving each play
    const movesPlaysHere = identity.movesPlaysTo(matchesArtist);

    for (const {
      artist: entryArtist,
      album: entryAlbum,
      entry: albumHistory,
    } of listeningEntries(index)) {
      if (
        !matchesArtist(entryArtist) &&
        !movesPlaysHere(entryArtist, entryAlbum)
      ) {
        continue;
      }
      // The requested name as this album counts it, when a track mapping
      // renames it on this same album. A mapping that moves it to another
      // album makes it another album's track, so it doesn't count here.
      const requestedHere = identity.play(entryArtist, entryAlbum, track);
      const entryRequestedKey =
        requestedHere.albumKey ===
        (entryAlbum === null
          ? null
          : identity.album(entryArtist, entryAlbum).albumKey)
          ? trackMatchKey(requestedHere.track)
          : requestedKey;
      for (const play of albumHistory.plays) {
        if (!play.track) continue;
        const target = identity.play(entryArtist, entryAlbum, play.track);
        if (!matchesArtist(target.artist)) continue;
        if (unknownAlbumFilter) {
          if (target.album !== null) continue;
        } else if (albumFilterKey && target.albumKey !== albumFilterKey) {
          continue;
        }
        const playKey = trackMatchKey(target.track);
        if (playKey !== requestedKey && playKey !== entryRequestedKey) {
          continue;
        }

        totalPlayCount++;

        // Track first/last played
        if (firstPlayed === null || play.timestamp < firstPlayed) {
          firstPlayed = play.timestamp;
        }
        if (lastPlayed === null || play.timestamp > lastPlayed) {
          lastPlayed = play.timestamp;
        }

        // Album appearances
        const appearanceKey = target.albumKey ?? UNRESOLVED_GROUP_PREFIX;
        const existing = albumAppearances.get(appearanceKey);
        if (existing) {
          existing.playCount++;
          if (play.timestamp > existing.lastPlayed) {
            existing.lastPlayed = play.timestamp;
          }
          existing.collectionItem ??= target.collectionItem;
        } else {
          albumAppearances.set(appearanceKey, {
            album: target.album,
            artist: target.artist,
            playCount: 1,
            lastPlayed: play.timestamp,
            collectionItem: target.collectionItem,
          });
        }

        // Play trend aggregation
        const playDate = new Date(play.timestamp * 1000);
        let periodKey: string;
        if (trendPeriod === 'month') {
          periodKey = `${playDate.getFullYear()}-${String(playDate.getMonth() + 1).padStart(2, '0')}`;
        } else {
          const weekStartDate = this.getStartOfWeek(playDate);
          const year = weekStartDate.getFullYear();
          const jan1 = new Date(year, 0, 1);
          const daysSinceJan1 = Math.floor(
            (weekStartDate.getTime() - jan1.getTime()) / (24 * 60 * 60 * 1000)
          );
          const weekNum = Math.ceil((daysSinceJan1 + jan1.getDay() + 1) / 7);
          periodKey = `${year}-W${String(weekNum).padStart(2, '0')}`;
        }
        trendCounts.set(periodKey, (trendCounts.get(periodKey) || 0) + 1);
      }
    }

    // Build appearsOn list with collection cross-reference
    const appearsOn = Array.from(albumAppearances.values())
      .sort((a, b) => b.playCount - a.playCount)
      .map(a => {
        // Decided by play identity
        const { collectionItem } = a;
        return {
          album: this.displayAlbum(a.album),
          artist: this.capitalizeArtist(a.artist),
          playCount: a.playCount,
          lastPlayed: a.lastPlayed,
          coverUrl: collectionItem?.release.cover_image,
          inCollection: !!collectionItem,
          collectionReleaseId: collectionItem?.release.id,
        };
      });

    // Build play trend (sorted chronologically)
    const playTrend = Array.from(trendCounts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([period, count]) => ({ period, count }));

    return {
      artist: this.artistNameResolver
        ? this.artistNameResolver.getDisplayName(artist)
        : this.capitalizeArtist(artist),
      track: this.capitalizeTitle(track),
      totalPlayCount,
      firstPlayed,
      lastPlayed,
      playTrend,
      appearsOn,
    };
  }

  // ============================================
  // Listening Patterns (Hourly & Day-of-Week)
  // ============================================

  /**
   * Get hourly distribution of scrobbles with peak-hour insight.
   *
   * Data source: Delegates to ScrobbleHistoryStorage's cached hourly data
   * (computed once on index load, O(1) retrieval afterward).
   *
   * Insight calculation: Sums scrobbles into four 6-hour blocks
   * (morning 6-11, afternoon 12-17, evening 18-23, night 0-5) and
   * returns the block with the highest aggregate as the insight label.
   *
   * @returns Distribution array (always 24 entries), peak hour, total count, and insight
   */
  async getHourlyDistribution(): Promise<HourlyDistributionResult> {
    const warm = await this.getValidWarmCache();
    if (warm) {
      this.logger.debug('Serving getHourlyDistribution from warm cache');
      return warm.hourlyDistribution;
    }

    const hourlyMap = await this.historyStorage.getHourlyDistribution();

    // Build array for all 24 hours (Map may not have entries for every hour)
    const hourCounts = new Array(24).fill(0);
    let totalScrobbles = 0;
    for (const [hour, count] of hourlyMap.entries()) {
      hourCounts[hour] = count;
      totalScrobbles += count;
    }

    // Find peak hour
    let peakHour = 0;
    let peakCount = 0;
    for (let h = 0; h < 24; h++) {
      if (hourCounts[h] > peakCount) {
        peakCount = hourCounts[h];
        peakHour = h;
      }
    }

    // Determine insight based on which 6-hour block has highest aggregate
    const blocks = {
      morning: 0, // 6-11
      afternoon: 0, // 12-17
      evening: 0, // 18-23
      night: 0, // 0-5
    };
    for (let h = 0; h < 24; h++) {
      if (h >= 6 && h < 12) blocks.morning += hourCounts[h];
      else if (h >= 12 && h < 18) blocks.afternoon += hourCounts[h];
      else if (h >= 18) blocks.evening += hourCounts[h];
      else blocks.night += hourCounts[h];
    }

    const insight = (
      Object.entries(blocks) as Array<
        [HourlyDistributionResult['insight'], number]
      >
    ).sort((a, b) => b[1] - a[1])[0][0];

    return {
      distribution: hourCounts.map((count, hour) => ({ hour, count })),
      peakHour,
      totalScrobbles,
      insight,
    };
  }

  /**
   * Get day-of-week distribution of scrobbles with weekday/weekend insight.
   *
   * Data source: Delegates to ScrobbleHistoryStorage's cached day-of-week data
   * (computed once on index load, O(1) retrieval afterward).
   *
   * Day numbering follows JavaScript's Date.getDay() convention:
   * 0 = Sunday, 1 = Monday, ..., 6 = Saturday.
   *
   * Insight calculation: Computes average scrobbles per weekday (Mon-Fri, divided by 5)
   * vs. per weekend day (Sat-Sun, divided by 2). The higher average determines the insight.
   *
   * @returns Distribution array (always 7 entries), peak day, weekday/weekend averages, and insight
   */
  async getDayOfWeekDistribution(): Promise<DayOfWeekDistributionResult> {
    const warm = await this.getValidWarmCache();
    if (warm) {
      this.logger.debug('Serving getDayOfWeekDistribution from warm cache');
      return warm.dayOfWeekDistribution;
    }

    const dayMap = await this.historyStorage.getDayOfWeekDistribution();

    const dayNames = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];

    // Build array for all 7 days (Map may not have entries for every day)
    const dayCounts = new Array(7).fill(0);
    for (const [day, count] of dayMap.entries()) {
      dayCounts[day] = count;
    }

    // Find peak day
    let peakDay = 0;
    let peakCount = 0;
    for (let d = 0; d < 7; d++) {
      if (dayCounts[d] > peakCount) {
        peakCount = dayCounts[d];
        peakDay = d;
      }
    }

    // Calculate weekday (Mon-Fri) and weekend (Sat-Sun) averages
    const weekdayTotal =
      dayCounts[1] + dayCounts[2] + dayCounts[3] + dayCounts[4] + dayCounts[5];
    const weekendTotal = dayCounts[0] + dayCounts[6];
    const weekdayAvg = Math.round(weekdayTotal / 5);
    const weekendAvg = Math.round(weekendTotal / 2);

    const insight: DayOfWeekDistributionResult['insight'] =
      weekendAvg > weekdayAvg ? 'weekend' : 'weekday';

    return {
      distribution: dayCounts.map((count, day) => ({
        day,
        dayName: dayNames[day],
        count,
      })),
      peakDay,
      weekdayAvg,
      weekendAvg,
      insight,
    };
  }

  // ============================================
  // Heatmap Date Detail
  // ============================================

  /**
   * Get albums played on a specific date (heatmap drill-down).
   *
   * Scans all plays in the history index and filters to those whose
   * timestamp falls within the given calendar day in the user's local timezone.
   * Albums are returned sorted by play count descending.
   *
   * Note: coverUrl is returned as null; callers that need album art should
   * enrich results via the Last.fm album.getInfo API or collection data.
   *
   * @param dateStr - Date in YYYY-MM-DD format (parsed as local time)
   * @returns The date, total scrobble count, and albums with per-album play counts
   */
  async getAlbumsForDate(dateStr: string): Promise<DateAlbumsResult> {
    // Parse date and compute day boundaries in local time
    const dateParts = dateStr.split('-');
    const year = parseInt(dateParts[0]);
    const month = parseInt(dateParts[1]) - 1; // Date constructor uses 0-based month
    const day = parseInt(dateParts[2]);
    const dayStart = new Date(year, month, day, 0, 0, 0).getTime() / 1000;
    const dayEnd = new Date(year, month, day, 23, 59, 59).getTime() / 1000 + 1;

    const index = await this.historyStorage.getIndex();
    const albumMap = new Map<
      string,
      { artist: string; album: string; playCount: number }
    >();
    let totalScrobbles = 0;

    if (index) {
      // The day total includes unresolved plays, grouped as one
      // "Unknown album" entry per artist
      for (const { artist, album, entry } of listeningEntries(index)) {
        for (const play of entry.plays) {
          if (play.timestamp >= dayStart && play.timestamp < dayEnd) {
            totalScrobbles++;
            const albumKey = this.albumGroupKey(artist, album);
            const existing = albumMap.get(albumKey);
            if (existing) {
              existing.playCount++;
            } else {
              albumMap.set(albumKey, {
                artist: this.capitalizeArtist(artist),
                album: this.displayAlbum(album),
                playCount: 1,
              });
            }
          }
        }
      }
    }

    const albums = Array.from(albumMap.values())
      .sort((a, b) => b.playCount - a.playCount)
      .map(a => ({ ...a, coverUrl: null as string | null }));

    return { date: dateStr, totalScrobbles, albums };
  }

  // ============================================
  // On This Day
  // ============================================

  /**
   * Get "On This Day" data - what was listened to on this calendar date across all years.
   *
   * Scans the full history index and groups plays by year for any play whose
   * local-time date matches the given month/day. Years with no matching plays
   * are omitted from the result. Results are sorted with the most recent year first.
   *
   * Timezone handling: Uses the user's local timezone via JavaScript's Date object
   * to determine which calendar date each scrobble falls on.
   *
   * @param month - Month number (1-12, January = 1)
   * @param day - Day of month (1-31)
   * @returns The queried date and an array of year summaries with album breakdowns
   */
  async getOnThisDay(month: number, day: number): Promise<OnThisDayResult> {
    const index = await this.historyStorage.getIndex();
    const currentYear = new Date().getFullYear();

    // Map: year -> Map<albumKey, { artist, album, playCount }>
    const yearData = new Map<
      number,
      Map<string, { artist: string; album: string; playCount: number }>
    >();

    if (index) {
      // Unresolved plays count toward the day, as one "Unknown album" group
      // per artist
      for (const { artist, album, entry } of listeningEntries(index)) {
        for (const play of entry.plays) {
          const date = new Date(play.timestamp * 1000);
          // month is 1-based, getMonth() is 0-based
          if (date.getMonth() + 1 === month && date.getDate() === day) {
            const yr = date.getFullYear();
            if (!yearData.has(yr)) {
              yearData.set(yr, new Map());
            }
            const albums = yearData.get(yr)!;
            const albumKey = this.albumGroupKey(artist, album);
            const existing = albums.get(albumKey);
            if (existing) {
              existing.playCount++;
            } else {
              albums.set(albumKey, {
                artist: this.capitalizeArtist(artist),
                album: this.displayAlbum(album),
                playCount: 1,
              });
            }
          }
        }
      }
    }

    // Build result, only including years with data
    const years: OnThisDayYear[] = [];
    for (const [yr, albums] of yearData.entries()) {
      const albumList = Array.from(albums.values())
        .sort((a, b) => b.playCount - a.playCount)
        .map(a => ({ ...a, coverUrl: null as string | null }));

      const totalScrobbles = albumList.reduce((s, a) => s + a.playCount, 0);

      years.push({
        year: yr,
        yearsAgo: currentYear - yr,
        totalScrobbles,
        albums: albumList,
      });
    }

    // Sort by most recent year first
    years.sort((a, b) => b.year - a.year);

    return { date: { month, day }, years };
  }

  // ============================================
  // Helper Methods
  // ============================================

  /** Grouping key for an artist's album, or its unresolved plays (album null). */
  private albumGroupKey(artist: string, album: string | null): string {
    return album === null
      ? `${UNRESOLVED_GROUP_PREFIX}${artist}`
      : `${artist}|${album}`;
  }

  /** Display name for an album; "Unknown album" for unresolved plays. */
  private displayAlbum(album: string | null): string {
    return album === null ? UNKNOWN_ALBUM_LABEL : this.capitalizeTitle(album);
  }

  /** Play trend bucket: 'YYYY-MM', or 'YYYY-Www' with weeks starting Monday */
  private trendPeriodKey(timestamp: number, period: 'month' | 'week'): string {
    const playDate = new Date(timestamp * 1000);
    if (period === 'month') {
      return `${playDate.getFullYear()}-${String(playDate.getMonth() + 1).padStart(2, '0')}`;
    }
    const weekStartDate = this.getStartOfWeek(playDate);
    const year = weekStartDate.getFullYear();
    const jan1 = new Date(year, 0, 1);
    const daysSinceJan1 = Math.floor(
      (weekStartDate.getTime() - jan1.getTime()) / (24 * 60 * 60 * 1000)
    );
    const weekNum = Math.ceil((daysSinceJan1 + jan1.getDay() + 1) / 7);
    return `${year}-W${String(weekNum).padStart(2, '0')}`;
  }

  private formatDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getStartOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private getStartOfWeek(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as first day
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private getStartOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  private getStartOfYear(date: Date): Date {
    return new Date(date.getFullYear(), 0, 1);
  }

  // History keys are lowercased; these give them display casing (the same
  // rules the History lists use)
  private capitalizeArtist(artist: string): string {
    return toDisplayName(artist);
  }

  private capitalizeTitle(title: string): string {
    return toDisplayName(title);
  }

  private async loadStatsCache(): Promise<StatsCache | null> {
    try {
      return await this.fileStorage.readJSON<StatsCache>(STATS_CACHE_FILE);
    } catch {
      return null;
    }
  }

  private async saveStatsCache(cache: StatsCache): Promise<void> {
    try {
      await this.fileStorage.writeJSONWithBackup(STATS_CACHE_FILE, cache);
    } catch (error) {
      this.logger.error('Failed to save stats cache', error);
    }
  }

  /**
   * Get collection ROI score: plays-per-dollar leaderboard.
   * Cross-references history play counts with Discogs collection + value cache.
   * Only includes albums that have both play history and a known median price.
   *
   * @param limit - Maximum number of items to return (default: all)
   */
  async getCollectionROI(
    collection: CollectionItem[],
    limit?: number
  ): Promise<RoiScoreItem[]> {
    const index = await this.historyStorage.getIndex();
    if (!index || collection.length === 0) {
      return [];
    }

    // Load value cache
    let valueCache: CollectionValueCacheStore | null = null;
    try {
      valueCache =
        await this.fileStorage.readJSON<CollectionValueCacheStore>(
          VALUE_CACHE_PATH
        );
    } catch {
      this.logger.warn('Value cache not available for ROI calculation');
    }

    if (!valueCache || !valueCache.items) {
      return [];
    }

    // Plays per owned record, by play identity (the record each play
    // resolves to), so versions mapped to one record give one row
    const model = await this.playIdentity.readModel(collection);
    const playsByItem = new Map<
      number,
      { item: CollectionItem; plays: number }
    >();
    for (const album of model.albums()) {
      for (const play of album.plays) {
        const item = play.collectionItem;
        if (!item) continue;
        const existing = playsByItem.get(item.id);
        if (existing) existing.plays++;
        else playsByItem.set(item.id, { item, plays: 1 });
      }
    }

    // Plays reach one copy of an album; other pressings of it (same master,
    // or same artist and title) get the album's plays too
    const albumKeys = (item: CollectionItem): string[] => [
      model.identity.recordKey(item),
      ...(item.release.master_id ? [`master:${item.release.master_id}`] : []),
    ];
    const albumPlays = new Map<string, number>();
    for (const { item, plays } of playsByItem.values()) {
      for (const key of albumKeys(item)) {
        albumPlays.set(key, (albumPlays.get(key) ?? 0) + plays);
      }
    }

    // Owned records with no plays count too (0 plays), so the lowest
    // values reflect the whole collection, not just what's been played
    for (const item of collection) {
      if (playsByItem.has(item.id)) continue;
      const plays = Math.max(
        0,
        ...albumKeys(item).map(key => albumPlays.get(key) ?? 0)
      );
      playsByItem.set(item.id, { item, plays });
    }

    const results: RoiScoreItem[] = [];

    for (const {
      item: collectionItem,
      plays: playCount,
    } of playsByItem.values()) {
      const releaseId = collectionItem.release.id;
      const cachedValue = valueCache.items[releaseId];
      if (
        !cachedValue ||
        !cachedValue.medianPrice ||
        cachedValue.medianPrice <= 0
      ) {
        continue;
      }

      const roiScore = playCount / cachedValue.medianPrice;

      results.push({
        artist: collectionItem.release.artist,
        album: collectionItem.release.title,
        playCount,
        medianPrice: cachedValue.medianPrice,
        currency: cachedValue.currency,
        roiScore,
        releaseId,
        coverUrl: collectionItem.release.cover_image,
      });
    }

    // Most plays per unit of value first; among equal scores (records never
    // played), the dearest last
    results.sort(
      (a, b) => b.roiScore - a.roiScore || a.medianPrice - b.medianPrice
    );

    return limit !== undefined ? results.slice(0, limit) : results;
  }

  /**
   * Get the listening arc for a specific album: monthly play counts over its lifetime.
   * Returns non-cumulative buckets per YYYY-MM period.
   *
   * @param artist - Artist name
   * @param album - Album title
   */
  async getAlbumListeningArc(
    artist: string,
    album: string,
    collection: CollectionItem[] = []
  ): Promise<AlbumArcBucket[]> {
    // The same plays as the album page (play identity)
    const { resolvedPlays } = await this.collectMergedAlbumHistory(
      artist,
      album,
      collection
    );
    if (resolvedPlays.length === 0) {
      return [];
    }

    // Bucket plays by YYYY-MM
    const buckets = new Map<
      string,
      { playCount: number; tracks: Set<string> }
    >();

    for (const play of resolvedPlays) {
      const date = new Date(play.timestamp * 1000);
      const period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      const existing = buckets.get(period);
      if (existing) {
        existing.playCount++;
        if (play.track) {
          existing.tracks.add(play.track.toLowerCase());
        }
      } else {
        const tracks = new Set<string>();
        if (play.track) {
          tracks.add(play.track.toLowerCase());
        }
        buckets.set(period, { playCount: 1, tracks });
      }
    }

    if (buckets.size === 0) {
      return [];
    }

    // Sort chronologically and return
    return Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([period, data]) => ({
        period,
        playCount: data.playCount,
        trackCount: data.tracks.size,
      }));
  }

  /** Album detail: plays, tracks, arc, collection match, all relevant mappings. */
  async getAlbumDetail(
    artistName: string,
    albumName: string,
    collection?: CollectionItem[]
  ): Promise<AlbumDetailResponse> {
    // A history album merged into another (album mapping) shows the canonical
    // album, so it reports the same totals whichever version name was opened.
    const {
      artist: resolvedArtist,
      album: resolvedAlbum,
      mapping: albumMapping,
    } = await this.resolveMergedAlbum(artistName, albumName);

    const { plays, sources, resolvedPlays, totalPlayCount, mergedMappings } =
      await this.collectMergedAlbumHistory(
        resolvedArtist,
        resolvedAlbum,
        collection
      );

    if (totalPlayCount === 0) {
      throw new Error('ALBUM_NOT_FOUND');
    }

    // Per-track aggregation by play identity (track mappings, including
    // merges saved under any version of the album), then variants merged by
    // trackMatchKey. Each row keeps the spellings scrobbled, so the page can
    // merge rows by hand.
    const trackAgg = new Map<
      string,
      {
        spellings: TrackSpellings;
        scrobbled: Set<string>;
        playCount: number;
        lastPlayed: number;
      }
    >();
    let firstPlayed: number | null = null;
    let lastPlayed: number | null = null;

    for (const play of plays) {
      if (firstPlayed === null || play.timestamp < firstPlayed) {
        firstPlayed = play.timestamp;
      }
      if (lastPlayed === null || play.timestamp > lastPlayed) {
        lastPlayed = play.timestamp;
      }
    }

    const addTrackPlay = (
      scrobbledAs: string,
      track: string,
      timestamp: number
    ) => {
      const key = trackMatchKey(track);
      const existing = trackAgg.get(key);
      if (existing) {
        existing.playCount += 1;
        existing.spellings.add(track);
        existing.scrobbled.add(scrobbledAs);
        if (timestamp > existing.lastPlayed) {
          existing.lastPlayed = timestamp;
        }
      } else {
        const spellings = new TrackSpellings();
        spellings.add(track);
        trackAgg.set(key, {
          spellings,
          scrobbled: new Set([scrobbledAs]),
          playCount: 1,
          lastPlayed: timestamp,
        });
      }
    };

    for (const play of resolvedPlays) {
      if (!play.track) continue;
      addTrackPlay(play.sourceTrack ?? play.track, play.track, play.timestamp);
    }

    const tracks: AlbumDetailTrack[] = Array.from(trackAgg.values())
      .map(t => ({
        track: this.capitalizeTitle(t.spellings.best),
        playCount: t.playCount,
        lastPlayed: t.lastPlayed,
        spellings: Array.from(t.scrobbled),
      }))
      .sort((a, b) => {
        if (b.playCount !== a.playCount) return b.playCount - a.playCount;
        return b.lastPlayed - a.lastPlayed;
      });

    // Listening arc (monthly buckets)
    const arc = await this.getAlbumListeningArc(
      resolvedArtist,
      resolvedAlbum,
      collection
    );

    // The owned record, by play identity: a link on any merged version, then
    // the album's names (the same answer Top Albums and History give)
    let collectionItem: CollectionItem | undefined;
    if (collection && collection.length > 0) {
      const identity = await this.createPlayIdentity(collection);
      collectionItem = identity.album(
        resolvedArtist,
        resolvedAlbum
      ).collectionItem;
    }

    // Artist mapping (Discogs ↔ Last.fm). Search both directions since the
    // queried artistName could match either side of the recorded mapping.
    let artistMappingProjection:
      | { discogsName: string; lastfmName: string }
      | undefined;
    const allArtistMappings = artistMappingService.getAllMappings();
    const lcArtist = artistName.toLowerCase();
    const matchedArtistMapping = allArtistMappings.find(
      m =>
        m.discogsName.toLowerCase() === lcArtist ||
        m.lastfmName.toLowerCase() === lcArtist
    );
    if (matchedArtistMapping) {
      artistMappingProjection = {
        discogsName: matchedArtistMapping.discogsName,
        lastfmName: matchedArtistMapping.lastfmName,
      };
    }

    // Compound artist mapping (e.g. "Run The Jewels" → ["El-P", "Killer Mike"])
    let compoundProjection:
      | { compoundName: string; components: string[] }
      | undefined;
    if (this.compoundArtistMappingService) {
      const compound =
        await this.compoundArtistMappingService.getMapping(artistName);
      if (compound) {
        compoundProjection = {
          compoundName: compound.compoundName,
          components: compound.components,
        };
      }
    }

    // Display name resolution (uses union-find aliases when resolver is wired)
    const displayArtist = this.artistNameResolver
      ? this.artistNameResolver.getDisplayName(artistName)
      : this.capitalizeArtist(artistName);

    // Track names counted as another track on this album (track mappings),
    // saved under the album as opened here or a history album merged into it
    const mergedTracks = new Map<string, AlbumDetailMergedTrack>();
    for (const name of [
      { artist: resolvedArtist, album: resolvedAlbum },
      ...sources,
    ]) {
      const albumMappings =
        (await this.trackMappingService?.getMappingsForAlbum?.(
          name.artist,
          name.album
        )) ?? [];
      for (const m of albumMappings) {
        mergedTracks.set(
          `${m.historyArtist}|${m.historyAlbum}|${m.historyTrack}`,
          {
            historyArtist: m.historyArtist,
            historyAlbum: m.historyAlbum,
            historyTrack: m.historyTrack,
            cacheTrack: m.cacheTrack,
          }
        );
      }
    }

    const response: AlbumDetailResponse = {
      artist: displayArtist,
      album: this.capitalizeTitle(resolvedAlbum),
      playCount: totalPlayCount,
      firstPlayed,
      lastPlayed,
      tracks,
      trackMappingAlbum: { artist: resolvedArtist, album: resolvedAlbum },
      arc,
      inCollection: !!collectionItem,
      mappings: {
        albumMapping: albumMapping
          ? {
              historyArtist: albumMapping.historyArtist,
              historyAlbum: albumMapping.historyAlbum,
              collectionArtist: albumMapping.collectionArtist,
              collectionAlbum: albumMapping.collectionAlbum,
              collectionLinked: isCollectionLinked(albumMapping),
            }
          : undefined,
        artistMapping: artistMappingProjection,
        compoundArtist: compoundProjection,
        mergedTracks:
          mergedTracks.size > 0 ? Array.from(mergedTracks.values()) : undefined,
        mergedVersions:
          mergedMappings.length > 0
            ? mergedMappings.map(m => ({
                historyArtist: m.historyArtist,
                historyAlbum: m.historyAlbum,
                collectionArtist: m.collectionArtist,
                collectionAlbum: m.collectionAlbum,
                collectionLinked: isCollectionLinked(m),
              }))
            : undefined,
      },
    };

    if (collectionItem) {
      response.collectionReleaseId = collectionItem.release.id;
      response.collectionArtist = collectionItem.release.artist;
      response.collectionAlbum = collectionItem.release.title;
      response.coverUrl = collectionItem.release.cover_image;
    }

    return response;
  }
}
