import { ScrobbleHistoryIndex, AlbumHistoryEntry } from '../../shared/types';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

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

  constructor(fileStorage: FileStorage) {
    this.fileStorage = fileStorage;
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
   * Get the full history index (with caching)
   */
  async getIndex(): Promise<ScrobbleHistoryIndex | null> {
    const now = Date.now();
    if (this.cachedIndex && now - this.cacheTimestamp < this.CACHE_TTL) {
      return this.cachedIndex;
    }

    try {
      const index =
        await this.fileStorage.readJSON<ScrobbleHistoryIndex>(
          HISTORY_INDEX_FILE
        );
      if (index) {
        this.cachedIndex = index;
        this.cacheTimestamp = now;
        // Build fuzzy index for O(1) fuzzy lookups
        this.buildFuzzyIndex();
      }
      return index;
    } catch {
      this.logger.debug('History index not found');
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
    album: string
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
      return {
        entry: index.albums[exactKey],
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
   * Get unique artists from the index
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
      const existing = artists.get(artist.toLowerCase());
      if (existing) {
        existing.playCount += history.playCount;
        existing.albumCount++;
        if (history.lastPlayed > existing.lastPlayed) {
          existing.lastPlayed = history.lastPlayed;
        }
      } else {
        artists.set(artist.toLowerCase(), {
          playCount: history.playCount,
          albumCount: 1,
          lastPlayed: history.lastPlayed,
        });
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

    for (const history of Object.values(index.albums)) {
      // We don't have year data in the scrobble history
      // This would need to be cross-referenced with collection data
      // For now, we'll track by listening time decades
      for (const play of history.plays) {
        const year = new Date(play.timestamp * 1000).getFullYear();
        const decade = Math.floor(year / 10) * 10;
        decades.set(decade, (decades.get(decade) || 0) + 1);
      }
    }

    return decades;
  }

  /**
   * Get listening patterns by hour of day
   */
  async getHourlyDistribution(): Promise<Map<number, number>> {
    const index = await this.getIndex();
    if (!index) {
      return new Map();
    }

    const hours = new Map<number, number>();

    for (const history of Object.values(index.albums)) {
      for (const play of history.plays) {
        const hour = new Date(play.timestamp * 1000).getHours();
        hours.set(hour, (hours.get(hour) || 0) + 1);
      }
    }

    return hours;
  }

  /**
   * Get listening patterns by day of week (0 = Sunday, 6 = Saturday)
   */
  async getDayOfWeekDistribution(): Promise<Map<number, number>> {
    const index = await this.getIndex();
    if (!index) {
      return new Map();
    }

    const days = new Map<number, number>();

    for (const history of Object.values(index.albums)) {
      for (const play of history.plays) {
        const day = new Date(play.timestamp * 1000).getDay();
        days.set(day, (days.get(day) || 0) + 1);
      }
    }

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

    let newestTimestamp = 0;
    for (const history of Object.values(index.albums)) {
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
