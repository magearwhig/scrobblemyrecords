import {
  CollectionItem,
  MissingAlbum,
  MissingArtist,
} from '../../shared/types';
import { createLogger } from '../utils/logger';

import { LastFmService, LastFmTopArtist } from './lastfmService';
import { MappingService } from './mappingService';
import { ScrobbleHistoryStorage } from './scrobbleHistoryStorage';

/**
 * Service for analyzing listening patterns and generating analytics
 * used by the suggestion algorithm.
 */
export class AnalyticsService {
  private historyStorage: ScrobbleHistoryStorage;
  private lastFmService: LastFmService;
  private mappingService: MappingService | null = null;
  private logger = createLogger('AnalyticsService');

  // Cache for expensive computations
  private topArtistsCache: Map<string, number> | null = null;
  private topArtistsCacheTime = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(
    historyStorage: ScrobbleHistoryStorage,
    lastFmService: LastFmService
  ) {
    this.historyStorage = historyStorage;
    this.lastFmService = lastFmService;
  }

  /**
   * Set the mapping service (optional dependency)
   */
  setMappingService(mappingService: MappingService): void {
    this.mappingService = mappingService;
  }

  /**
   * Get top artists from Last.fm as a map of artist name -> play count
   */
  async getTopArtistsMap(limit: number = 100): Promise<Map<string, number>> {
    const now = Date.now();
    if (
      this.topArtistsCache &&
      now - this.topArtistsCacheTime < this.CACHE_TTL
    ) {
      return this.topArtistsCache;
    }

    try {
      // Fetch top artists for multiple periods and combine
      const [weekArtists, monthArtists, yearArtists] = await Promise.all([
        this.lastFmService.getTopArtists('7day', limit),
        this.lastFmService.getTopArtists('1month', limit),
        this.lastFmService.getTopArtists('12month', limit),
      ]);

      const artistMap = new Map<string, number>();

      // Weight recent plays more heavily
      const processArtists = (artists: LastFmTopArtist[], weight: number) => {
        for (const artist of artists) {
          const name = artist.name.toLowerCase();
          const playcount = parseInt(artist.playcount || '0', 10) * weight;
          artistMap.set(name, (artistMap.get(name) || 0) + playcount);
        }
      };

      processArtists(weekArtists, 3); // Recent plays weighted 3x
      processArtists(monthArtists, 2); // Month weighted 2x
      processArtists(yearArtists, 1); // Year weighted 1x

      this.topArtistsCache = artistMap;
      this.topArtistsCacheTime = now;

      return artistMap;
    } catch (error) {
      this.logger.error('Error fetching top artists', error);
      return new Map();
    }
  }

  /**
   * Calculate artist affinity score (0-1) for a given artist
   */
  async getArtistAffinity(artistName: string): Promise<number> {
    const topArtists = await this.getTopArtistsMap();
    if (topArtists.size === 0) {
      return 0;
    }

    const normalizedName = artistName.toLowerCase();
    const artistPlayCount = topArtists.get(normalizedName);

    if (!artistPlayCount) {
      return 0;
    }

    // Find max play count to normalize
    const maxPlayCount = Math.max(...topArtists.values());
    return artistPlayCount / maxPlayCount;
  }

  /**
   * Get era/decade preference score (0-1) for a given year
   */
  async getEraPreference(year: number): Promise<number> {
    // Get decade distribution from listening history
    const index = await this.historyStorage.getIndex();
    if (!index) {
      return 0.5; // Neutral if no history
    }

    // Calculate release year preferences
    // This requires cross-referencing with collection data
    // For now, we'll use listening time patterns as a proxy
    const decade = Math.floor(year / 10) * 10;

    // Simple heuristic: newer releases (2000+) get slight preference
    // This is a placeholder - ideally we'd analyze actual release years
    if (decade >= 2010) return 0.7;
    if (decade >= 2000) return 0.6;
    if (decade >= 1990) return 0.55;
    if (decade >= 1980) return 0.5;
    if (decade >= 1970) return 0.45;
    return 0.4;
  }

  /**
   * Get time-of-day preference score (0-1) based on current time
   */
  async getTimeOfDayPreference(): Promise<number> {
    const hourlyDist = await this.historyStorage.getHourlyDistribution();
    const dayOfWeekDist = await this.historyStorage.getDayOfWeekDistribution();

    if (hourlyDist.size === 0) {
      return 0.5; // Neutral if no history
    }

    const currentHour = new Date().getHours();
    const currentDay = new Date().getDay();

    // Find max hour count to normalize
    const maxHourCount = Math.max(...hourlyDist.values());
    const currentHourCount = hourlyDist.get(currentHour) || 0;
    const hourScore = maxHourCount > 0 ? currentHourCount / maxHourCount : 0.5;

    // Find max day count to normalize
    const maxDayCount =
      dayOfWeekDist.size > 0 ? Math.max(...dayOfWeekDist.values()) : 1;
    const currentDayCount = dayOfWeekDist.get(currentDay) || 0;
    const dayScore = maxDayCount > 0 ? currentDayCount / maxDayCount : 0.5;

    // Combine hour and day scores
    return hourScore * 0.7 + dayScore * 0.3;
  }

  /**
   * Calculate album completeness score (0-1)
   * How often is this album played in full vs partial tracks?
   */
  async getAlbumCompleteness(
    artist: string,
    album: string,
    totalTracks: number
  ): Promise<number> {
    if (totalTracks === 0) {
      return 0.5; // Neutral if no track info
    }

    // Check if there's an album mapping for this collection item
    let searchArtist = artist;
    let searchAlbum = album;

    if (this.mappingService) {
      const albumMapping =
        await this.mappingService.getAlbumMappingForCollection(artist, album);

      if (albumMapping) {
        searchArtist = albumMapping.historyArtist;
        searchAlbum = albumMapping.historyAlbum;
        this.logger.debug(
          `Album Completeness: using album mapping "${artist}|${album}" -> "${searchArtist}|${searchAlbum}"`
        );
      }
    }

    const history = await this.historyStorage.getAlbumHistory(
      searchArtist,
      searchAlbum
    );
    if (!history || history.playCount === 0) {
      return 0.5; // Neutral if never played
    }

    // Group plays by session (within 2 hours of each other)
    const sessions: number[][] = [];
    const sortedPlays = [...history.plays].sort(
      (a, b) => a.timestamp - b.timestamp
    );

    for (const play of sortedPlays) {
      const lastSession = sessions[sessions.length - 1];
      if (
        lastSession &&
        play.timestamp - lastSession[lastSession.length - 1] < 7200 // 2 hours
      ) {
        lastSession.push(play.timestamp);
      } else {
        sessions.push([play.timestamp]);
      }
    }

    // Calculate average tracks per session
    const avgTracksPerSession = history.playCount / sessions.length;
    const completionRatio = Math.min(avgTracksPerSession / totalTracks, 1);

    return completionRatio;
  }

  /**
   * Normalize a string to alphanumeric only for fuzzy matching
   */
  private normalizeForMatch(s: string): string {
    // Remove Discogs disambiguation suffixes like "(2)", "(5)", etc.
    let normalized = s.replace(/\s*\(\d+\)\s*$/g, '');
    // Remove common album suffixes
    normalized = normalized.replace(
      /\s*\[(explicit|deluxe|remastered|vinyl|lp)\]\s*/gi,
      ''
    );
    normalized = normalized.replace(
      /\s*\((explicit|deluxe|remastered|vinyl|lp)\)\s*/gi,
      ''
    );
    // Then remove all remaining non-alphanumeric characters
    return normalized.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  /**
   * Check if two artist names match, handling multi-artist entries
   * "Aesop Rock, Blockhead" should match "Aesop Rock"
   */
  private artistsMatch(
    collectionArtist: string,
    historyArtist: string
  ): boolean {
    const normalizedHistory = this.normalizeForMatch(historyArtist);
    const normalizedCollection = this.normalizeForMatch(collectionArtist);

    // Direct match
    if (normalizedHistory === normalizedCollection) {
      return true;
    }

    // Check if history artist matches any of the collection artists (split on ", ")
    const collectionArtists = collectionArtist
      .split(/[,&]/)
      .map(a => this.normalizeForMatch(a.trim()));
    if (collectionArtists.some(a => a === normalizedHistory)) {
      return true;
    }

    return false;
  }

  /**
   * Check if two album names match, handling variations
   * "Gentlemen At 21" should match "Gentlemen"
   */
  private albumsMatch(collectionAlbum: string, historyAlbum: string): boolean {
    const normalizedHistory = this.normalizeForMatch(historyAlbum);
    const normalizedCollection = this.normalizeForMatch(collectionAlbum);

    // Direct match
    if (normalizedHistory === normalizedCollection) {
      return true;
    }

    // Check if one contains the other (for variations like "Gentlemen At 21" vs "Gentlemen")
    // Only match if the shorter one is reasonably substantial (at least 6 chars to avoid false positives)
    if (
      normalizedHistory.length >= 6 &&
      normalizedCollection.startsWith(normalizedHistory)
    ) {
      return true;
    }
    if (
      normalizedCollection.length >= 6 &&
      normalizedHistory.startsWith(normalizedCollection)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Get albums from listening history that are NOT in the collection
   * (Missing from Collection feature)
   *
   * Uses sophisticated matching to handle:
   * - "Artist (2)" disambiguation suffixes
   * - Multi-artist entries like "Aesop Rock, Blockhead"
   * - Album variations like "Gentlemen At 21" vs "Gentlemen"
   */
  async getMissingAlbums(
    collection: CollectionItem[],
    limit: number = 20
  ): Promise<MissingAlbum[]> {
    const historyAlbums = await this.historyStorage.getAllAlbums();
    if (historyAlbums.length === 0) {
      return [];
    }

    // Find albums in history but not in collection
    const missing: MissingAlbum[] = [];
    for (const { artist, album, history } of historyAlbums) {
      // Skip albums with too few plays
      if (history.playCount < 3) {
        continue;
      }

      // First, check if there's a manual mapping for this album
      if (this.mappingService) {
        const mapping = await this.mappingService.getAlbumMapping(
          artist,
          album
        );
        if (mapping) {
          // Manual mapping exists, skip this album (it's in collection)
          continue;
        }
      }

      // Check if this album matches any collection item
      let foundMatch = false;
      for (const item of collection) {
        if (
          this.artistsMatch(item.release.artist, artist) &&
          this.albumsMatch(item.release.title, album)
        ) {
          foundMatch = true;
          break;
        }
      }

      if (!foundMatch) {
        missing.push({
          artist,
          album,
          playCount: history.playCount,
          lastPlayed: history.lastPlayed,
        });
      }
    }

    // Sort by play count and return top N
    return missing.sort((a, b) => b.playCount - a.playCount).slice(0, limit);
  }

  /**
   * Get artists from listening history that are NOT in the collection
   * (Missing from Collection feature)
   *
   * Uses sophisticated matching to handle:
   * - "Artist (2)" disambiguation suffixes
   * - Multi-artist entries like "Aesop Rock, Blockhead"
   */
  async getMissingArtists(
    collection: CollectionItem[],
    limit: number = 20
  ): Promise<MissingArtist[]> {
    const uniqueArtists = await this.historyStorage.getUniqueArtists();
    if (uniqueArtists.size === 0) {
      return [];
    }

    // Find artists in history but not in collection
    const missing: MissingArtist[] = [];
    for (const [artistName, stats] of uniqueArtists) {
      // Skip artists with too few plays
      if (stats.playCount < 10) {
        continue;
      }

      // First, check if there's a manual mapping for this artist
      if (this.mappingService) {
        const mapping = await this.mappingService.getArtistMapping(artistName);
        if (mapping) {
          // Manual mapping exists, skip this artist (it's in collection)
          continue;
        }
      }

      // Check if this artist matches any collection item
      let foundMatch = false;
      for (const item of collection) {
        if (this.artistsMatch(item.release.artist, artistName)) {
          foundMatch = true;
          break;
        }
      }

      if (!foundMatch) {
        missing.push({
          artist: artistName,
          playCount: stats.playCount,
          albumCount: stats.albumCount,
          lastPlayed: stats.lastPlayed,
        });
      }
    }

    // Sort by play count and return top N
    return missing.sort((a, b) => b.playCount - a.playCount).slice(0, limit);
  }

  /**
   * Get a summary of listening analytics
   */
  async getAnalyticsSummary(): Promise<{
    hasHistory: boolean;
    totalScrobbles: number;
    uniqueAlbums: number;
    uniqueArtists: number;
    topArtists: Array<{ artist: string; playCount: number }>;
    listeningPatterns: {
      peakHour: number;
      peakDay: string;
    };
  }> {
    const stats = await this.historyStorage.getStorageStats();
    const uniqueArtists = await this.historyStorage.getUniqueArtists();
    const topArtistsMap = await this.getTopArtistsMap(10);

    const hourlyDist = await this.historyStorage.getHourlyDistribution();
    const dayOfWeekDist = await this.historyStorage.getDayOfWeekDistribution();

    // Find peak hour
    let peakHour = 0;
    let peakHourCount = 0;
    for (const [hour, count] of hourlyDist) {
      if (count > peakHourCount) {
        peakHour = hour;
        peakHourCount = count;
      }
    }

    // Find peak day
    const dayNames = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];
    let peakDay = 'Unknown';
    let peakDayCount = 0;
    for (const [day, count] of dayOfWeekDist) {
      if (count > peakDayCount) {
        peakDay = dayNames[day];
        peakDayCount = count;
      }
    }

    // Convert top artists map to array
    const topArtists = Array.from(topArtistsMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([artist, playCount]) => ({ artist, playCount }));

    return {
      hasHistory: stats.totalScrobbles > 0,
      totalScrobbles: stats.totalScrobbles,
      uniqueAlbums: stats.totalAlbums,
      uniqueArtists: uniqueArtists.size,
      topArtists,
      listeningPatterns: {
        peakHour,
        peakDay,
      },
    };
  }
}
