import { createHash } from 'crypto';

import { ScrobbleHistoryIndex, AlbumHistoryEntry } from '../../shared/types';
import { FileStorage } from '../utils/fileStorage';
import {
  applyUnresolvedResolutions,
  creditedArtists,
  excludeArtists,
  forEachListeningPlay,
  UNKNOWN_ALBUM_LABEL,
  UnresolvedResolutionRule,
} from '../utils/historyPlays';
import { createLogger } from '../utils/logger';

import { ArtistNameResolver } from './artistNameResolver';

const HISTORY_INDEX_FILE = 'history/scrobble-history-index.json';

/**
 * Service for reading and querying the scrobble history index.
 * The index is written by ScrobbleHistorySyncService.
 * This service provides efficient lookup operations.
 */
export class ScrobbleHistoryStorage {
  private fileStorage: FileStorage;
  private logger = createLogger('ScrobbleHistoryStorage');
  private cachedIndex: ScrobbleHistoryIndex | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL = 60000; // 1 minute cache

  // Fuzzy index: maps fuzzy keys to arrays of exact keys for O(1) lookups
  private fuzzyIndex: Map<string, string[]> = new Map();

  // Cached distributions: computed once on index load, cleared on invalidation
  private cachedHourlyDist: Map<number, number> | null = null;
  private cachedDayOfWeekDist: Map<number, number> | null = null;

  private artistNameResolver: ArtistNameResolver | null = null;

  /** Rules that attribute unresolved (albumless) plays to albums */
  private resolutionRules: (() => Promise<UnresolvedResolutionRule[]>) | null =
    null;

  /** Artists left out of listening stats entirely (e.g. podcasts) */
  private excludedArtists: (() => Promise<string[]>) | null = null;

  constructor(fileStorage: FileStorage) {
    this.fileStorage = fileStorage;
  }

  /**
   * Supply the Unresolved Listening History rules. getIndex() then returns
   * the index with them applied (resolved plays counted under their album).
   * Call invalidateCache() after the rules change.
   */
  setResolutionRulesProvider(
    provider: () => Promise<UnresolvedResolutionRule[]>
  ): void {
    this.resolutionRules = provider;
    this.invalidateCache();
  }

  /**
   * Supply the excluded artists. getIndex() then leaves their plays out
   * entirely. Call invalidateCache() after the list changes.
   */
  setExcludedArtistsProvider(provider: () => Promise<string[]>): void {
    this.excludedArtists = provider;
    this.invalidateCache();
  }

  setArtistNameResolver(resolver: ArtistNameResolver): void {
    this.artistNameResolver = resolver;
  }

  /**
   * Resolve an artist name to its canonical form using the resolver,
   * falling back to simple toLowerCase() if no resolver is set.
   */
  private resolveArtistName(name: string): string {
    if (this.artistNameResolver) {
      return this.artistNameResolver.resolveArtist(name);
    }
    return name.toLowerCase();
  }

  /**
   * Resolve an artist name to all canonical forms it should be attributed to.
   * For compound artists, returns each component's canonical key.
   */
  private resolveArtistNames(name: string): string[] {
    if (this.artistNameResolver) {
      return this.artistNameResolver.resolveArtistMulti(name);
    }
    return [name.toLowerCase()];
  }

  /**
   * Normalize artist|album key for consistent matching with existing index
   * Uses simple lowercase/trim to match the format stored in the index
   */
  normalizeKey(artist: string, album: string): string {
    return `${artist.toLowerCase().trim()}|${album.toLowerCase().trim()}`;
  }

  /**
   * Fuzzy normalize for matching across naming variations
   * Handles:
   * - "Artist (2)" vs "Artist" (Discogs disambiguation numbers)
   * - "Album (Deluxe Edition)" vs "Album"
   * - "Album [Explicit]" vs "Album"
   * - "Album - EP" vs "Album"
   * - Extra spaces or punctuation differences
   */
  fuzzyNormalizeKey(artist: string, album: string): string {
    const normalizeString = (s: string) => {
      // First, remove Discogs disambiguation suffixes like "(2)", "(5)", etc.
      // These are numbers in parentheses at the end of artist names
      let normalized = s.replace(/\s*\(\d+\)\s*$/g, '');

      // Remove common album edition/format suffixes in brackets
      // Matches: [Explicit], [Deluxe], [Remastered], [Vinyl], [LP], etc.
      normalized = normalized.replace(
        /\s*\[(explicit|deluxe|deluxe edition|special edition|expanded|expanded edition|remastered|remaster|anniversary|anniversary edition|bonus tracks|bonus track|vinyl|lp|cd|digital|limited|limited edition|collector's edition|collectors edition|japan|japanese|uk|us|import)\]\s*/gi,
        ''
      );

      // Remove common album edition/format suffixes in parentheses
      // Matches: (Deluxe Edition), (Special Edition), (Remastered 2021), etc.
      normalized = normalized.replace(
        /\s*\((explicit|deluxe|deluxe edition|special edition|expanded|expanded edition|remastered|remaster|remastered \d{4}|anniversary|anniversary edition|\d+th anniversary|bonus tracks|bonus track|vinyl|lp|cd|digital|limited|limited edition|collector's edition|collectors edition|japan|japanese|uk|us|import)\)\s*/gi,
        ''
      );

      // Remove "at XX" anniversary suffixes (e.g., "Gentlemen at 21")
      normalized = normalized.replace(/\s+at\s+\d+\s*$/gi, '');

      // Remove trailing " - EP", " - Single", " EP", " Single"
      normalized = normalized.replace(/\s*-?\s*(ep|single)\s*$/gi, '');

      // Remove trailing edition indicators without brackets
      normalized = normalized.replace(
        /\s+(deluxe|deluxe edition|special edition|expanded edition|remastered|remaster)\s*$/gi,
        ''
      );

      // Then remove all remaining non-alphanumeric characters
      return normalized.toLowerCase().replace(/[^a-z0-9]/g, '');
    };
    return `${normalizeString(artist)}|${normalizeString(album)}`;
  }

  /**
   * Build the fuzzy index from the current cached index
   * Maps each fuzzy key to an array of exact keys that match it
   */
  private buildFuzzyIndex(): void {
    this.fuzzyIndex.clear();

    if (!this.cachedIndex) {
      return;
    }

    for (const exactKey of Object.keys(this.cachedIndex.albums)) {
      const [artist, album] = exactKey.split('|');
      const fuzzyKey = this.fuzzyNormalizeKey(artist, album);

      const existing = this.fuzzyIndex.get(fuzzyKey);
      if (existing) {
        existing.push(exactKey);
      } else {
        this.fuzzyIndex.set(fuzzyKey, [exactKey]);
      }
    }

    this.logger.debug(
      `Built fuzzy index with ${this.fuzzyIndex.size} unique keys from ${Object.keys(this.cachedIndex.albums).length} albums`
    );
  }

  /**
   * Build hourly and day-of-week distribution caches in a single pass.
   * Called on index load to avoid recomputing distributions on every access.
   * Counts every listening event, including unresolved (albumless) plays.
   */
  private buildDistributionCaches(): void {
    this.cachedHourlyDist = new Map();
    this.cachedDayOfWeekDist = new Map();

    if (!this.cachedIndex) {
      return;
    }

    const hourly = this.cachedHourlyDist;
    const daily = this.cachedDayOfWeekDist;
    forEachListeningPlay(this.cachedIndex, play => {
      const date = new Date(play.timestamp * 1000);
      const hour = date.getHours();
      const day = date.getDay();
      hourly.set(hour, (hourly.get(hour) || 0) + 1);
      daily.set(day, (daily.get(day) || 0) + 1);
    });

    this.logger.debug(
      `Built distribution caches from ${this.cachedIndex.totalScrobbles} scrobbles`
    );
  }

  /**
   * Get the history index (with caching), with Unresolved Listening History
   * rules applied: unresolved plays a rule attributes to an album appear
   * under that album. This is a derived view; it is never written back, so
   * writers (sync, merge) read the raw file via getRawIndex()/FileStorage.
   */
  async getIndex(): Promise<ScrobbleHistoryIndex | null> {
    const now = Date.now();
    if (this.cachedIndex && now - this.cacheTimestamp < this.CACHE_TTL) {
      return this.cachedIndex;
    }

    try {
      const raw = await this.getRawIndex();
      // Leave excluded artists out first, then apply resolution rules
      const withoutExcluded = await this.applyExclusions(raw);
      const index =
        withoutExcluded && this.resolutionRules
          ? applyUnresolvedResolutions(
              withoutExcluded,
              await this.resolutionRules()
            ).index
          : withoutExcluded;
      if (index) {
        this.cachedIndex = index;
        this.cacheTimestamp = now;
        // Build fuzzy index for O(1) fuzzy lookups
        this.buildFuzzyIndex();
        // Build distribution caches to avoid recomputing on every access
        this.buildDistributionCaches();
      }
      return index;
    } catch {
      this.logger.debug('History index not found');
      return null;
    }
  }

  /**
   * Hash of the current resolution rules and excluded artists; '' when there
   * are none. Both change what getIndex() returns.
   */
  async getResolutionRulesFingerprint(): Promise<string> {
    const rules = this.resolutionRules ? await this.resolutionRules() : [];
    const excluded = this.excludedArtists ? await this.excludedArtists() : [];
    if (rules.length === 0 && excluded.length === 0) return '';
    const lines = [
      ...rules.map(rule =>
        JSON.stringify([rule.artist, rule.track, rule.album])
      ),
      ...excluded.map(artist => JSON.stringify(['excluded', artist])),
    ].sort();
    return createHash('sha1').update(lines.join('\n')).digest('hex');
  }

  /**
   * Which excluded artist (if any) an index artist key belongs to: the exact
   * name, an alias the artist resolver links to it, or a credit naming it
   * ("doug benson, guest", "x feat. doug benson"). Null when nothing is
   * excluded.
   */
  async getExclusionMatcher(): Promise<
    ((artistKey: string) => string | null) | null
  > {
    const excluded = this.excludedArtists ? await this.excludedArtists() : [];
    if (excluded.length === 0) return null;

    const byName = new Map<string, string>();
    for (const name of excluded) {
      const key = name.toLowerCase().trim();
      byName.set(key, key);
      const canonical = this.artistNameResolver?.resolveArtist(key);
      if (canonical && !byName.has(canonical)) byName.set(canonical, key);
    }
    const lookup = (name: string): string | null => {
      const direct = byName.get(name);
      if (direct) return direct;
      const canonical = this.artistNameResolver?.resolveArtist(name);
      return (canonical && byName.get(canonical)) || null;
    };

    const memo = new Map<string, string | null>();
    return (artistKey: string) => {
      const cached = memo.get(artistKey);
      if (cached !== undefined) return cached;
      let match = lookup(artistKey);
      if (!match) {
        const parts = [
          ...creditedArtists(artistKey),
          ...(this.artistNameResolver?.resolveArtistMulti(artistKey) ?? []),
        ];
        for (const part of parts) {
          match = lookup(part);
          if (match) break;
        }
      }
      memo.set(artistKey, match);
      return match;
    };
  }

  /** The stored index with excluded artists left out (no resolution rules). */
  async getExclusionView(): Promise<ScrobbleHistoryIndex | null> {
    return this.applyExclusions(await this.getRawIndex());
  }

  private async applyExclusions(
    raw: ScrobbleHistoryIndex | null
  ): Promise<ScrobbleHistoryIndex | null> {
    if (!raw) return raw;
    const matcher = await this.getExclusionMatcher();
    return matcher
      ? excludeArtists(raw, key => matcher(key) !== null).index
      : raw;
  }

  /** The index exactly as stored, without resolution rules applied. */
  async getRawIndex(): Promise<ScrobbleHistoryIndex | null> {
    try {
      return await this.fileStorage.readJSON<ScrobbleHistoryIndex>(
        HISTORY_INDEX_FILE
      );
    } catch {
      return null;
    }
  }

  /**
   * Invalidate the cache (call after sync completes)
   */
  invalidateCache(): void {
    this.cachedIndex = null;
    this.cacheTimestamp = 0;
    this.fuzzyIndex.clear();
    this.cachedHourlyDist = null;
    this.cachedDayOfWeekDist = null;
  }

  /**
   * Check if index exists
   */
  async hasIndex(): Promise<boolean> {
    const index = await this.getIndex();
    return index !== null;
  }

  /**
   * Get total scrobble count
   */
  async getTotalScrobbles(): Promise<number> {
    const index = await this.getIndex();
    return index?.totalScrobbles || 0;
  }

  /**
   * Get last sync timestamp
   */
  async getLastSyncTimestamp(): Promise<number | null> {
    const index = await this.getIndex();
    return index?.lastSyncTimestamp || null;
  }

  /**
   * Get oldest scrobble date
   */
  async getOldestScrobbleDate(): Promise<Date | null> {
    const index = await this.getIndex();
    if (!index?.oldestScrobbleDate) {
      return null;
    }
    return new Date(index.oldestScrobbleDate * 1000);
  }

  /**
   * Get history for a specific album (exact match only)
   */
  async getAlbumHistory(
    artist: string,
    album: string
  ): Promise<AlbumHistoryEntry | null> {
    const index = await this.getIndex();
    if (!index) {
      return null;
    }

    const key = this.normalizeKey(artist, album);
    return index.albums[key] || null;
  }

  /**
   * Get history for a specific album with fuzzy matching fallback.
   * First tries exact match, then falls back to fuzzy matching.
   * Returns aggregated stats if multiple fuzzy matches are found.
   *
   * Example: "Shame Shame" by "Dr. Dog" will match "Shame Shame (Deluxe Edition)" by "Dr. Dog"
   */
  async getAlbumHistoryFuzzy(
    artist: string,
    album: string,
    options?: { countsOnly?: boolean }
  ): Promise<{
    entry: AlbumHistoryEntry | null;
    matchType: 'exact' | 'fuzzy' | 'none';
    matchedKeys?: string[];
  }> {
    const index = await this.getIndex();
    if (!index) {
      return { entry: null, matchType: 'none' };
    }

    // Try exact match first
    const exactKey = this.normalizeKey(artist, album);
    if (index.albums[exactKey]) {
      const entry = index.albums[exactKey];
      if (options?.countsOnly) {
        return {
          entry: {
            playCount: entry.playCount,
            lastPlayed: entry.lastPlayed,
            plays: [],
          },
          matchType: 'exact',
          matchedKeys: [exactKey],
        };
      }
      return {
        entry,
        matchType: 'exact',
        matchedKeys: [exactKey],
      };
    }

    // Fall back to fuzzy match
    const fuzzyKey = this.fuzzyNormalizeKey(artist, album);
    const matchedExactKeys = this.fuzzyIndex.get(fuzzyKey);

    if (!matchedExactKeys || matchedExactKeys.length === 0) {
      return { entry: null, matchType: 'none' };
    }

    // Aggregate all matching albums
    let totalPlayCount = 0;
    let latestPlayed = 0;

    if (options?.countsOnly) {
      // Skip play-level aggregation — only compute counts
      for (const key of matchedExactKeys) {
        const entry = index.albums[key];
        if (entry) {
          totalPlayCount += entry.playCount;
          if (entry.lastPlayed > latestPlayed) {
            latestPlayed = entry.lastPlayed;
          }
        }
      }

      return {
        entry: {
          playCount: totalPlayCount,
          lastPlayed: latestPlayed,
          plays: [],
        },
        matchType: 'fuzzy',
        matchedKeys: matchedExactKeys,
      };
    }

    const allPlays: Array<{ timestamp: number; track?: string }> = [];

    for (const key of matchedExactKeys) {
      const entry = index.albums[key];
      if (entry) {
        totalPlayCount += entry.playCount;
        if (entry.lastPlayed > latestPlayed) {
          latestPlayed = entry.lastPlayed;
        }
        allPlays.push(...entry.plays);
      }
    }

    // Sort plays by timestamp (most recent first)
    allPlays.sort((a, b) => b.timestamp - a.timestamp);

    return {
      entry: {
        playCount: totalPlayCount,
        lastPlayed: latestPlayed,
        plays: allPlays,
      },
      matchType: 'fuzzy',
      matchedKeys: matchedExactKeys,
    };
  }

  /**
   * Batch lookup for multiple artist|album keys in a single index load.
   * Performs the same fuzzy matching as getAlbumHistoryFuzzy() but for many
   * keys at once, avoiding repeated index reads.
   *
   * The map key is `artist|album` (lowercase/trimmed), matching the format
   * returned by normalizeKey().
   */
  async batchLookup(
    keys: Array<{ artist: string; album: string }>,
    options?: { countsOnly?: boolean }
  ): Promise<
    Map<
      string,
      {
        entry: AlbumHistoryEntry | null;
        matchType: 'exact' | 'fuzzy' | 'none';
        matchedKeys?: string[];
      }
    >
  > {
    const result: Map<
      string,
      {
        entry: AlbumHistoryEntry | null;
        matchType: 'exact' | 'fuzzy' | 'none';
        matchedKeys?: string[];
      }
    > = new Map();

    if (keys.length === 0) {
      return result;
    }

    // Load index once — leverages existing 1-min cache
    const index = await this.getIndex();

    for (const { artist, album } of keys) {
      const mapKey = this.normalizeKey(artist, album);

      if (!index) {
        result.set(mapKey, { entry: null, matchType: 'none' });
        continue;
      }

      // Try exact match first (mapKey is already normalizeKey(artist, album))
      if (index.albums[mapKey]) {
        const entry = index.albums[mapKey];
        if (options?.countsOnly) {
          result.set(mapKey, {
            entry: {
              playCount: entry.playCount,
              lastPlayed: entry.lastPlayed,
              plays: [],
            },
            matchType: 'exact',
            matchedKeys: [mapKey],
          });
        } else {
          result.set(mapKey, {
            entry,
            matchType: 'exact',
            matchedKeys: [mapKey],
          });
        }
        continue;
      }

      // Fall back to fuzzy match using already-built fuzzy index (O(1))
      const fuzzyKey = this.fuzzyNormalizeKey(artist, album);
      const matchedExactKeys = this.fuzzyIndex.get(fuzzyKey);

      if (!matchedExactKeys || matchedExactKeys.length === 0) {
        result.set(mapKey, { entry: null, matchType: 'none' });
        continue;
      }

      // Aggregate all matching albums
      let totalPlayCount = 0;
      let latestPlayed = 0;

      if (options?.countsOnly) {
        for (const key of matchedExactKeys) {
          const albumEntry = index.albums[key];
          if (albumEntry) {
            totalPlayCount += albumEntry.playCount;
            if (albumEntry.lastPlayed > latestPlayed) {
              latestPlayed = albumEntry.lastPlayed;
            }
          }
        }

        result.set(mapKey, {
          entry: {
            playCount: totalPlayCount,
            lastPlayed: latestPlayed,
            plays: [],
          },
          matchType: 'fuzzy',
          matchedKeys: matchedExactKeys,
        });
        continue;
      }

      const allPlays: Array<{ timestamp: number; track?: string }> = [];

      for (const key of matchedExactKeys) {
        const albumEntry = index.albums[key];
        if (albumEntry) {
          totalPlayCount += albumEntry.playCount;
          if (albumEntry.lastPlayed > latestPlayed) {
            latestPlayed = albumEntry.lastPlayed;
          }
          allPlays.push(...albumEntry.plays);
        }
      }

      // Sort plays by timestamp (most recent first)
      allPlays.sort((a, b) => b.timestamp - a.timestamp);

      result.set(mapKey, {
        entry: {
          playCount: totalPlayCount,
          lastPlayed: latestPlayed,
          plays: allPlays,
        },
        matchType: 'fuzzy',
        matchedKeys: matchedExactKeys,
      });
    }

    this.logger.debug(
      `batchLookup: processed ${keys.length} keys, index loaded once`
    );

    return result;
  }

  /**
   * Get last played timestamp for an album (with fuzzy matching)
   */
  async getLastPlayed(artist: string, album: string): Promise<number | null> {
    const result = await this.getAlbumHistoryFuzzy(artist, album);
    return result.entry?.lastPlayed || null;
  }

  /**
   * Get play count for an album (with fuzzy matching)
   */
  async getPlayCount(artist: string, album: string): Promise<number> {
    const result = await this.getAlbumHistoryFuzzy(artist, album);
    return result.entry?.playCount || 0;
  }

  /**
   * Check if an album has ever been played (with fuzzy matching)
   */
  async hasBeenPlayed(artist: string, album: string): Promise<boolean> {
    const result = await this.getAlbumHistoryFuzzy(artist, album);
    return result.entry !== null && result.entry.playCount > 0;
  }

  /**
   * Get days since last played for an album
   */
  async getDaysSinceLastPlayed(
    artist: string,
    album: string
  ): Promise<number | null> {
    const lastPlayed = await this.getLastPlayed(artist, album);
    if (!lastPlayed) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    const daysSince = Math.floor((now - lastPlayed) / (60 * 60 * 24));
    return daysSince;
  }

  /**
   * Get all albums in the index
   */
  async getAllAlbums(): Promise<
    Array<{
      key: string;
      artist: string;
      album: string;
      history: AlbumHistoryEntry;
    }>
  > {
    const index = await this.getIndex();
    if (!index) {
      return [];
    }

    return Object.entries(index.albums).map(([key, history]) => {
      const [artist, album] = key.split('|');
      return { key, artist, album, history };
    });
  }

  /**
   * Get top albums by play count
   */
  async getTopAlbumsByPlayCount(limit: number = 20): Promise<
    Array<{
      artist: string;
      album: string;
      playCount: number;
      lastPlayed: number;
    }>
  > {
    const albums = await this.getAllAlbums();
    return albums
      .sort((a, b) => b.history.playCount - a.history.playCount)
      .slice(0, limit)
      .map(({ artist, album, history }) => ({
        artist,
        album,
        playCount: history.playCount,
        lastPlayed: history.lastPlayed,
      }));
  }

  /**
   * Get most recently played albums (sorted by lastPlayed timestamp, newest first)
   */
  async getRecentlyPlayedAlbums(limit: number = 10): Promise<
    Array<{
      artist: string;
      album: string;
      playCount: number;
      lastPlayed: number;
    }>
  > {
    const albums = await this.getAllAlbums();
    return albums
      .filter(a => a.history.lastPlayed > 0)
      .sort((a, b) => b.history.lastPlayed - a.history.lastPlayed)
      .slice(0, limit)
      .map(({ artist, album, history }) => ({
        artist,
        album,
        playCount: history.playCount,
        lastPlayed: history.lastPlayed,
      }));
  }

  /**
   * Unresolved (albumless) entries, keyed by normalized artist.
   * Album-level callers never use this; listening-level artist and track
   * lists add these plays on top of the album entries.
   */
  private async getUnresolvedEntries(): Promise<
    Array<{ artist: string; history: AlbumHistoryEntry }>
  > {
    const index = await this.getIndex();
    return Object.entries(index?.unresolved ?? {}).map(([artist, history]) => ({
      artist,
      history,
    }));
  }

  /**
   * Get unique artists from the index.
   * playCount and lastPlayed include unresolved (albumless) plays;
   * albumCount counts album entries only.
   */
  async getUniqueArtists(): Promise<
    Map<string, { playCount: number; albumCount: number; lastPlayed: number }>
  > {
    const albums = await this.getAllAlbums();
    const artists = new Map<
      string,
      { playCount: number; albumCount: number; lastPlayed: number }
    >();

    for (const { artist, history } of albums) {
      const keys = this.resolveArtistNames(artist);
      for (const key of keys) {
        const existing = artists.get(key);
        if (existing) {
          existing.playCount += history.playCount;
          existing.albumCount++;
          if (history.lastPlayed > existing.lastPlayed) {
            existing.lastPlayed = history.lastPlayed;
          }
        } else {
          artists.set(key, {
            playCount: history.playCount,
            albumCount: 1,
            lastPlayed: history.lastPlayed,
          });
        }
      }
    }

    for (const { artist, history } of await this.getUnresolvedEntries()) {
      for (const key of this.resolveArtistNames(artist)) {
        const existing = artists.get(key);
        if (existing) {
          existing.playCount += history.playCount;
          if (history.lastPlayed > existing.lastPlayed) {
            existing.lastPlayed = history.lastPlayed;
          }
        } else {
          artists.set(key, {
            playCount: history.playCount,
            albumCount: 0,
            lastPlayed: history.lastPlayed,
          });
        }
      }
    }

    return artists;
  }

  /**
   * Get decade distribution from listening history
   */
  async getDecadeDistribution(): Promise<Map<number, number>> {
    const index = await this.getIndex();
    if (!index) {
      return new Map();
    }

    const decades = new Map<number, number>();

    // We don't have year data in the scrobble history
    // This would need to be cross-referenced with collection data
    // For now, we'll track by listening time decades (all listening events)
    forEachListeningPlay(index, play => {
      const year = new Date(play.timestamp * 1000).getFullYear();
      const decade = Math.floor(year / 10) * 10;
      decades.set(decade, (decades.get(decade) || 0) + 1);
    });

    return decades;
  }

  /**
   * Get listening patterns by hour of day.
   *
   * Returns a Map keyed by hour (0-23) with scrobble counts as values.
   * Hours with zero scrobbles may be absent from the Map.
   *
   * Caching: The distribution is computed during getIndex() and cached in
   * `cachedHourlyDist`. Subsequent calls return the cached result in O(1).
   * The cache is invalidated when the index cache expires (CACHE_TTL = 1 minute).
   *
   * Fallback: If the cache wasn't populated during index load (edge case),
   * a full O(n) scan of all plays is performed.
   */
  async getHourlyDistribution(): Promise<Map<number, number>> {
    if (this.cachedHourlyDist) {
      return this.cachedHourlyDist;
    }

    const index = await this.getIndex();
    if (!index) {
      return new Map();
    }

    // Fallback: if getIndex() populated the cache, return it
    if (this.cachedHourlyDist) {
      return this.cachedHourlyDist;
    }

    // Manual computation for edge cases where index exists but cache wasn't built
    const hours = new Map<number, number>();
    forEachListeningPlay(index, play => {
      const hour = new Date(play.timestamp * 1000).getHours();
      hours.set(hour, (hours.get(hour) || 0) + 1);
    });

    return hours;
  }

  /**
   * Get listening patterns by day of week.
   *
   * Returns a Map keyed by day index (0 = Sunday, 6 = Saturday, matching
   * JavaScript's Date.getDay()) with scrobble counts as values.
   * Days with zero scrobbles may be absent from the Map.
   *
   * Caching: Same strategy as getHourlyDistribution() -- computed during
   * getIndex() and cached in `cachedDayOfWeekDist` with 1-minute TTL.
   */
  async getDayOfWeekDistribution(): Promise<Map<number, number>> {
    if (this.cachedDayOfWeekDist) {
      return this.cachedDayOfWeekDist;
    }

    const index = await this.getIndex();
    if (!index) {
      return new Map();
    }

    // Fallback: if getIndex() populated the cache, return it
    if (this.cachedDayOfWeekDist) {
      return this.cachedDayOfWeekDist;
    }

    // Manual computation for edge cases where index exists but cache wasn't built
    const days = new Map<number, number>();
    forEachListeningPlay(index, play => {
      const day = new Date(play.timestamp * 1000).getDay();
      days.set(day, (days.get(day) || 0) + 1);
    });

    return days;
  }

  /**
   * Get paginated albums with sorting and search
   */
  async getAlbumsPaginated(
    page: number = 1,
    perPage: number = 50,
    sortBy: 'playCount' | 'lastPlayed' | 'artist' | 'album' = 'playCount',
    sortOrder: 'asc' | 'desc' = 'desc',
    searchQuery?: string
  ): Promise<{
    items: Array<{
      artist: string;
      album: string;
      playCount: number;
      lastPlayed: number;
    }>;
    total: number;
    totalPages: number;
    page: number;
  }> {
    const allAlbums = await this.getAllAlbums();

    // Filter by search query if provided
    let filtered = allAlbums;
    if (searchQuery && searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = allAlbums.filter(
        item =>
          item.artist.toLowerCase().includes(query) ||
          item.album.toLowerCase().includes(query)
      );
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'playCount':
          comparison = a.history.playCount - b.history.playCount;
          break;
        case 'lastPlayed':
          comparison = a.history.lastPlayed - b.history.lastPlayed;
          break;
        case 'artist':
          comparison = a.artist.localeCompare(b.artist);
          break;
        case 'album':
          comparison = a.album.localeCompare(b.album);
          break;
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    // Paginate
    const total = filtered.length;
    const totalPages = Math.ceil(total / perPage);
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginatedItems = filtered.slice(startIndex, endIndex);

    return {
      items: paginatedItems.map(({ artist, album, history }) => ({
        artist,
        album,
        playCount: history.playCount,
        lastPlayed: history.lastPlayed,
      })),
      total,
      totalPages,
      page,
    };
  }

  /**
   * Get paginated artists with sorting and search
   * Aggregates play counts across all albums per artist, plus unresolved
   * (albumless) plays; albumCount counts album entries only.
   */
  async getArtistsPaginated(
    page: number = 1,
    perPage: number = 50,
    sortBy: 'playCount' | 'lastPlayed' | 'artist' | 'albumCount' = 'playCount',
    sortOrder: 'asc' | 'desc' = 'desc',
    searchQuery?: string
  ): Promise<{
    items: Array<{
      artist: string;
      playCount: number;
      albumCount: number;
      lastPlayed: number;
    }>;
    total: number;
    totalPages: number;
    page: number;
  }> {
    const allAlbums = await this.getAllAlbums();

    // Aggregate by artist, preserving first-seen casing
    const artistMap = new Map<
      string,
      {
        artist: string;
        playCount: number;
        albumCount: number;
        lastPlayed: number;
      }
    >();

    for (const { artist, history } of allAlbums) {
      const keys = this.resolveArtistNames(artist);
      for (const key of keys) {
        const existing = artistMap.get(key);
        if (existing) {
          existing.playCount += history.playCount;
          existing.albumCount++;
          if (history.lastPlayed > existing.lastPlayed) {
            existing.lastPlayed = history.lastPlayed;
          }
        } else {
          const displayName = this.artistNameResolver
            ? this.artistNameResolver.getDisplayName(key)
            : artist;
          artistMap.set(key, {
            artist: displayName,
            playCount: history.playCount,
            albumCount: 1,
            lastPlayed: history.lastPlayed,
          });
        }
      }
    }

    for (const { artist, history } of await this.getUnresolvedEntries()) {
      for (const key of this.resolveArtistNames(artist)) {
        const existing = artistMap.get(key);
        if (existing) {
          existing.playCount += history.playCount;
          if (history.lastPlayed > existing.lastPlayed) {
            existing.lastPlayed = history.lastPlayed;
          }
        } else {
          const displayName = this.artistNameResolver
            ? this.artistNameResolver.getDisplayName(key)
            : artist;
          artistMap.set(key, {
            artist: displayName,
            playCount: history.playCount,
            albumCount: 0,
            lastPlayed: history.lastPlayed,
          });
        }
      }
    }

    let artists = Array.from(artistMap.values());

    // Filter by search query if provided
    if (searchQuery && searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      artists = artists.filter(item =>
        item.artist.toLowerCase().includes(query)
      );
    }

    // Sort
    artists.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'playCount':
          comparison = a.playCount - b.playCount;
          break;
        case 'lastPlayed':
          comparison = a.lastPlayed - b.lastPlayed;
          break;
        case 'artist':
          comparison = a.artist.localeCompare(b.artist);
          break;
        case 'albumCount':
          comparison = a.albumCount - b.albumCount;
          break;
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    // Paginate
    const total = artists.length;
    const totalPages = Math.ceil(total / perPage);
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginatedItems = artists.slice(startIndex, endIndex);

    return {
      items: paginatedItems,
      total,
      totalPages,
      page,
    };
  }

  /**
   * Get paginated tracks with sorting and search
   * Aggregates all plays from all albums into individual track entries.
   * Unresolved (albumless) plays form their own rows with album
   * UNKNOWN_ALBUM_LABEL, separate from any album row for the same track.
   */
  async getTracksPaginated(
    page: number = 1,
    perPage: number = 50,
    sortBy:
      | 'playCount'
      | 'lastPlayed'
      | 'artist'
      | 'album'
      | 'track' = 'playCount',
    sortOrder: 'asc' | 'desc' = 'desc',
    searchQuery?: string
  ): Promise<{
    items: Array<{
      artist: string;
      album: string;
      track: string;
      playCount: number;
      lastPlayed: number;
    }>;
    total: number;
    totalPages: number;
    page: number;
  }> {
    const index = await this.getIndex();
    if (!index) {
      return { items: [], total: 0, totalPages: 0, page };
    }

    // Aggregate all tracks across all albums
    const trackMap = new Map<
      string,
      {
        artist: string;
        album: string;
        track: string;
        playCount: number;
        lastPlayed: number;
      }
    >();

    forEachListeningPlay(index, (play, artist, albumOrNull) => {
      if (!play.track) return;
      const album = albumOrNull ?? UNKNOWN_ALBUM_LABEL;

      // Unique key for this track (artist|album|track). Unresolved plays use
      // a marker that no album key can contain, so they never merge with a
      // real album that happens to be named "Unknown album".
      const albumPart = albumOrNull ?? '\u0000unresolved';
      const trackKey = `${artist}|${albumPart}|${play.track.toLowerCase()}`;
      const existing = trackMap.get(trackKey);

      if (existing) {
        existing.playCount++;
        if (play.timestamp > existing.lastPlayed) {
          existing.lastPlayed = play.timestamp;
        }
      } else {
        trackMap.set(trackKey, {
          artist,
          album,
          track: play.track,
          playCount: 1,
          lastPlayed: play.timestamp,
        });
      }
    });

    let tracks = Array.from(trackMap.values());

    // Filter by search query if provided
    if (searchQuery && searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      tracks = tracks.filter(
        item =>
          item.artist.toLowerCase().includes(query) ||
          item.album.toLowerCase().includes(query) ||
          item.track.toLowerCase().includes(query)
      );
    }

    // Sort
    tracks.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'playCount':
          comparison = a.playCount - b.playCount;
          break;
        case 'lastPlayed':
          comparison = a.lastPlayed - b.lastPlayed;
          break;
        case 'artist':
          comparison = a.artist.localeCompare(b.artist);
          break;
        case 'album':
          comparison = a.album.localeCompare(b.album);
          break;
        case 'track':
          comparison = a.track.localeCompare(b.track);
          break;
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    // Paginate
    const total = tracks.length;
    const totalPages = Math.ceil(total / perPage);
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginatedItems = tracks.slice(startIndex, endIndex);

    return {
      items: paginatedItems,
      total,
      totalPages,
      page,
    };
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    totalAlbums: number;
    totalScrobbles: number;
    oldestScrobble: Date | null;
    newestScrobble: Date | null;
    lastSync: Date | null;
    estimatedSizeBytes: number;
  }> {
    const index = await this.getIndex();

    if (!index) {
      return {
        totalAlbums: 0,
        totalScrobbles: 0,
        oldestScrobble: null,
        newestScrobble: null,
        lastSync: null,
        estimatedSizeBytes: 0,
      };
    }

    // Newest listening event, including unresolved (albumless) plays.
    // totalScrobbles already counts both stores; totalAlbums counts albums only.
    let newestTimestamp = 0;
    for (const history of [
      ...Object.values(index.albums),
      ...Object.values(index.unresolved ?? {}),
    ]) {
      if (history.lastPlayed > newestTimestamp) {
        newestTimestamp = history.lastPlayed;
      }
    }

    // Rough estimate: ~100 bytes per scrobble entry
    const estimatedSize = index.totalScrobbles * 100;

    return {
      totalAlbums: Object.keys(index.albums).length,
      totalScrobbles: index.totalScrobbles,
      oldestScrobble: index.oldestScrobbleDate
        ? new Date(index.oldestScrobbleDate * 1000)
        : null,
      newestScrobble: newestTimestamp ? new Date(newestTimestamp * 1000) : null,
      lastSync: index.lastSyncTimestamp
        ? new Date(index.lastSyncTimestamp)
        : null,
      estimatedSizeBytes: estimatedSize,
    };
  }
}
