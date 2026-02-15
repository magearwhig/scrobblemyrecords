import {
  CollectionItem,
  ScrobbleSession,
  WrappedCollectionItem,
  WrappedCollectionStats,
  WrappedCrossSourceStats,
  WrappedData,
  WrappedListeningStats,
  WrappedNewArtist,
  WrappedTopItem,
} from '../../shared/types';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

import { ArtistNameResolver } from './artistNameResolver';
import { DiscogsService } from './discogsService';
import { ImageService } from './imageService';
import { ScrobbleHistoryStorage } from './scrobbleHistoryStorage';
import { StatsService } from './statsService';

// Average track duration in minutes for listening time estimation
const AVG_TRACK_DURATION_MINUTES = 3.5;

/**
 * Service for generating Wrapped (Period In Review) data.
 * Aggregates listening and collection stats for a given date range.
 * Stateless -- generates fresh data on each request, no data files.
 */
export class WrappedService {
  private logger = createLogger('WrappedService');
  private artistNameResolver: ArtistNameResolver | null = null;

  constructor(
    private statsService: StatsService,
    private historyStorage: ScrobbleHistoryStorage,
    private discogsService: DiscogsService,
    private imageService: ImageService,
    private fileStorage: FileStorage
  ) {}

  setArtistNameResolver(resolver: ArtistNameResolver): void {
    this.artistNameResolver = resolver;
  }

  /**
   * Resolve an artist name to its canonical form using the resolver if available,
   * falling back to simple toLowerCase().
   */
  private resolveArtistName(name: string): string {
    if (this.artistNameResolver) {
      return this.artistNameResolver.resolveArtist(name);
    }
    return name.toLowerCase();
  }

  /**
   * Get the display name for an artist, using the resolver if available,
   * falling back to capitalizeArtist().
   */
  private getArtistDisplayName(name: string): string {
    if (this.artistNameResolver) {
      return this.artistNameResolver.getDisplayName(name);
    }
    return this.capitalizeArtist(name);
  }

  /**
   * Generate complete wrapped data for a date range.
   * @param startDate Start of range in milliseconds
   * @param endDate End of range in milliseconds
   * @returns Complete WrappedData for the range
   */
  async generateWrapped(
    startDate: number,
    endDate: number
  ): Promise<WrappedData> {
    this.logger.info('Generating wrapped data', {
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate).toISOString(),
    });

    // Convert to seconds for index queries (history index stores seconds)
    const startSec = startDate / 1000;
    const endSec = endDate / 1000;

    // Run independent operations in parallel
    const [listening, collection, crossSource] = await Promise.all([
      this.computeListeningStats(startSec, endSec),
      this.computeCollectionStats(startDate, endDate, startSec, endSec),
      this.computeCrossSourceStats(startSec, endSec),
    ]);

    return {
      startDate,
      endDate,
      generatedAt: Date.now(),
      listening,
      collection,
      crossSource,
    };
  }

  /**
   * Compute all listening stats from the scrobble history index.
   */
  private async computeListeningStats(
    startSec: number,
    endSec: number
  ): Promise<WrappedListeningStats> {
    const index = await this.historyStorage.getIndex();

    if (!index) {
      return this.emptyListeningStats();
    }

    // Single pass through all plays to compute aggregates
    let totalScrobbles = 0;
    const artistCounts = new Map<string, number>();
    const albumSet = new Set<string>();
    const dayCounts = new Map<string, number>();
    const hourCounts = new Map<number, number>();
    // Track first-ever play per artist across entire history
    const artistFirstEverPlay = new Map<string, number>();
    // Track plays in range per artist
    const artistRangePlays = new Map<string, number>();

    for (const [key, albumHistory] of Object.entries(index.albums)) {
      const [artist] = key.split('|');
      const normalizedArtist = this.resolveArtistName(artist);

      for (const play of albumHistory.plays) {
        // Track first-ever play for each artist (across all history)
        const existing = artistFirstEverPlay.get(normalizedArtist);
        if (!existing || play.timestamp < existing) {
          artistFirstEverPlay.set(normalizedArtist, play.timestamp);
        }

        // Filter to range
        if (play.timestamp >= startSec && play.timestamp <= endSec) {
          totalScrobbles++;

          // Artist counts
          artistCounts.set(
            normalizedArtist,
            (artistCounts.get(normalizedArtist) || 0) + 1
          );

          // Unique albums
          albumSet.add(key);

          // Artist range plays
          artistRangePlays.set(
            normalizedArtist,
            (artistRangePlays.get(normalizedArtist) || 0) + 1
          );

          // Day counts for peak day and heatmap
          const date = new Date(play.timestamp * 1000);
          const dayKey = this.formatDateKey(date);
          dayCounts.set(dayKey, (dayCounts.get(dayKey) || 0) + 1);

          // Hour counts for peak hour
          const hour = date.getHours();
          hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
        }
      }
    }

    if (totalScrobbles === 0) {
      return this.emptyListeningStats();
    }

    const estimatedListeningHours =
      Math.round((totalScrobbles * AVG_TRACK_DURATION_MINUTES) / 6) / 10;

    const uniqueArtists = artistCounts.size;
    const uniqueAlbums = albumSet.size;

    // Get top lists from StatsService (handles capitalization properly)
    const [topArtists, topAlbums, topTracks] = await Promise.all([
      this.statsService.getTopArtists('custom', 5, startSec, endSec),
      this.statsService.getTopAlbums('custom', 5, startSec, endSec),
      this.statsService.getTopTracks('custom', 5, startSec, endSec),
    ]);

    // Enrich top lists with images
    const enrichedTopArtists = await this.enrichTopArtistsWithImages(
      topArtists.map(a => ({
        name: a.artist,
        artist: a.artist,
        playCount: a.playCount,
      }))
    );

    const enrichedTopAlbums = await this.enrichTopAlbumsWithImages(
      topAlbums.map(a => ({
        name: `${a.artist} - ${a.album}`,
        artist: a.artist,
        album: a.album,
        playCount: a.playCount,
      }))
    );

    const enrichedTopTracks: WrappedTopItem[] = topTracks.map(t => ({
      name: t.track,
      artist: t.artist,
      album: t.album,
      playCount: t.playCount,
    }));

    // New artists discovered (first-ever play falls within range)
    const newArtists: WrappedNewArtist[] = [];
    for (const [artist, firstPlay] of artistFirstEverPlay.entries()) {
      if (firstPlay >= startSec && firstPlay <= endSec) {
        const rangePlays = artistRangePlays.get(artist) || 0;
        newArtists.push({
          name: this.getArtistDisplayName(artist),
          playCount: rangePlays,
          firstPlayDate: firstPlay * 1000, // Convert to milliseconds
        });
      }
    }
    newArtists.sort((a, b) => b.playCount - a.playCount);
    const newArtistsList = newArtists.slice(0, 10);

    // Enrich new artists with images
    if (newArtistsList.length > 0) {
      const artistImages = await this.imageService.batchGetArtistImages(
        newArtistsList.map(a => a.name)
      );
      for (const artist of newArtistsList) {
        const imageUrl = artistImages.get(artist.name.toLowerCase().trim());
        if (imageUrl) {
          artist.imageUrl = imageUrl;
        }
      }
    }

    // Peak listening day
    let peakListeningDay: WrappedListeningStats['peakListeningDay'] = null;
    if (dayCounts.size > 0) {
      let maxDay = '';
      let maxCount = 0;
      for (const [day, count] of dayCounts.entries()) {
        if (count > maxCount) {
          maxDay = day;
          maxCount = count;
        }
      }
      peakListeningDay = { date: maxDay, scrobbleCount: maxCount };
    }

    // Peak listening hour
    let peakListeningHour: WrappedListeningStats['peakListeningHour'] = null;
    if (hourCounts.size > 0) {
      let maxHour = 0;
      let maxCount = 0;
      for (const [hour, count] of hourCounts.entries()) {
        if (count > maxCount) {
          maxHour = hour;
          maxCount = count;
        }
      }
      peakListeningHour = { hour: maxHour, scrobbleCount: maxCount };
    }

    // Longest streak within range
    const longestStreak = this.calculateLongestStreak(dayCounts);

    // Heatmap data
    const heatmapData = Array.from(dayCounts.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalScrobbles,
      estimatedListeningHours,
      uniqueArtists,
      uniqueAlbums,
      topArtists: enrichedTopArtists,
      topAlbums: enrichedTopAlbums,
      topTracks: enrichedTopTracks,
      newArtistsDiscovered: newArtists.length,
      newArtistsList,
      peakListeningDay,
      peakListeningHour,
      longestStreak,
      heatmapData,
    };
  }

  /**
   * Compute collection stats from Discogs collection data.
   */
  private async computeCollectionStats(
    startDateMs: number,
    endDateMs: number,
    startSec: number,
    endSec: number
  ): Promise<WrappedCollectionStats> {
    const collection = await this.loadCollection();
    if (!collection || collection.length === 0) {
      return {
        recordsAdded: 0,
        recordsList: [],
        mostPlayedNewAddition: null,
      };
    }

    // Filter collection items added within the date range
    const addedInRange: CollectionItem[] = [];
    for (const item of collection) {
      if (item.date_added) {
        const addedMs = new Date(item.date_added).getTime();
        if (addedMs >= startDateMs && addedMs <= endDateMs) {
          addedInRange.push(item);
        }
      }
    }

    // Build records list
    const recordsList: WrappedCollectionItem[] = addedInRange.map(item => ({
      artist: item.release.artist,
      title: item.release.title,
      coverUrl: item.release.cover_image || undefined,
      dateAdded: new Date(item.date_added).getTime(),
      year: item.release.year || undefined,
    }));

    // Sort by date added (newest first)
    recordsList.sort((a, b) => b.dateAdded - a.dateAdded);

    // Find most-played new addition
    let mostPlayedNewAddition: WrappedCollectionStats['mostPlayedNewAddition'] =
      null;

    if (addedInRange.length > 0) {
      let maxPlays = 0;
      let bestItem: CollectionItem | null = null;

      for (const item of addedInRange) {
        const result = await this.historyStorage.getAlbumHistoryFuzzy(
          item.release.artist,
          item.release.title
        );

        if (result.entry) {
          // Count plays that occurred after the item was added and within the range
          const addedSec = new Date(item.date_added).getTime() / 1000;
          const playsInRange = result.entry.plays.filter(
            p => p.timestamp >= addedSec && p.timestamp <= endSec
          ).length;

          if (playsInRange > maxPlays) {
            maxPlays = playsInRange;
            bestItem = item;
          }
        }
      }

      if (bestItem && maxPlays > 0) {
        mostPlayedNewAddition = {
          artist: bestItem.release.artist,
          title: bestItem.release.title,
          coverUrl: bestItem.release.cover_image || undefined,
          dateAdded: new Date(bestItem.date_added).getTime(),
          playCount: maxPlays,
        };
      }
    }

    return {
      recordsAdded: addedInRange.length,
      recordsList: recordsList.slice(0, 20), // Limit to 20 for UI
      mostPlayedNewAddition,
    };
  }

  /**
   * Compute cross-source stats (collection coverage, vinyl vs digital).
   */
  private async computeCrossSourceStats(
    startSec: number,
    endSec: number
  ): Promise<WrappedCrossSourceStats> {
    const index = await this.historyStorage.getIndex();
    const collection = await this.loadCollection();

    // Collection coverage: what % of collection was played in this range
    let collectionCoverage = 0;
    let albumsPlayed = 0;
    const totalCollectionSize = collection?.length || 0;

    if (collection && collection.length > 0 && index) {
      for (const item of collection) {
        const result = await this.historyStorage.getAlbumHistoryFuzzy(
          item.release.artist,
          item.release.title
        );

        if (result.entry) {
          const hasRangePlays = result.entry.plays.some(
            p => p.timestamp >= startSec && p.timestamp <= endSec
          );
          if (hasRangePlays) {
            albumsPlayed++;
          }
        }
      }

      collectionCoverage = Math.round((albumsPlayed / collection.length) * 100);
    }

    // Source breakdown: vinyl (RecordScrobbles) vs other
    const sourceBreakdown = await this.computeSourceBreakdownForRange(
      startSec,
      endSec
    );

    return {
      collectionCoverage,
      totalCollectionSize,
      albumsPlayed,
      vinylScrobbles: sourceBreakdown.vinyl,
      otherScrobbles: sourceBreakdown.other,
      vinylPercentage: sourceBreakdown.vinylPercentage,
    };
  }

  /**
   * Compute source breakdown for a specific date range.
   * Identifies RecordScrobbles scrobbles by matching timestamps from session files.
   */
  private async computeSourceBreakdownForRange(
    startSec: number,
    endSec: number
  ): Promise<{ vinyl: number; other: number; vinylPercentage: number }> {
    const index = await this.historyStorage.getIndex();
    if (!index) {
      return { vinyl: 0, other: 0, vinylPercentage: 0 };
    }

    // Load our scrobble session timestamps
    const ourTimestamps = new Set<number>();
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
                ourTimestamps.add(track.timestamp);
              }
            }
          }
        }
      }
    } catch {
      // If sessions can't be read, all will be "Other"
    }

    const sortedTimestamps = Array.from(ourTimestamps).sort((a, b) => a - b);

    let vinyl = 0;
    let other = 0;

    for (const albumHistory of Object.values(index.albums)) {
      for (const play of albumHistory.plays) {
        if (play.timestamp >= startSec && play.timestamp <= endSec) {
          if (this.isOurScrobble(play.timestamp, sortedTimestamps)) {
            vinyl++;
          } else {
            other++;
          }
        }
      }
    }

    const total = vinyl + other;
    const vinylPercentage = total > 0 ? Math.round((vinyl / total) * 100) : 0;

    return { vinyl, other, vinylPercentage };
  }

  /**
   * Binary search to check if a timestamp matches one of our scrobble sessions.
   */
  private isOurScrobble(
    targetTs: number,
    sortedTimestamps: number[],
    tolerance: number = 5
  ): boolean {
    if (sortedTimestamps.length === 0) return false;

    let left = 0;
    let right = sortedTimestamps.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (Math.abs(sortedTimestamps[mid] - targetTs) <= tolerance) {
        return true;
      }
      if (sortedTimestamps[mid] < targetTs) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    // Check neighbors
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
  }

  /**
   * Calculate longest streak of consecutive days with scrobbles.
   */
  private calculateLongestStreak(
    dayCounts: Map<string, number>
  ): WrappedListeningStats['longestStreak'] {
    if (dayCounts.size === 0) return null;

    const sortedDays = Array.from(dayCounts.keys()).sort();

    let longestDays = 1;
    let longestStart = sortedDays[0];
    let longestEnd = sortedDays[0];
    let currentDays = 1;
    let currentStart = sortedDays[0];

    for (let i = 1; i < sortedDays.length; i++) {
      if (this.areConsecutiveDays(sortedDays[i - 1], sortedDays[i])) {
        currentDays++;
      } else {
        if (currentDays > longestDays) {
          longestDays = currentDays;
          longestStart = currentStart;
          longestEnd = sortedDays[i - 1];
        }
        currentDays = 1;
        currentStart = sortedDays[i];
      }
    }

    // Check final streak
    if (currentDays > longestDays) {
      longestDays = currentDays;
      longestStart = currentStart;
      longestEnd = sortedDays[sortedDays.length - 1];
    }

    return {
      days: longestDays,
      startDate: longestStart,
      endDate: longestEnd,
    };
  }

  /**
   * Check if two YYYY-MM-DD date strings are consecutive days.
   */
  private areConsecutiveDays(earlier: string, later: string): boolean {
    const date1 = new Date(`${earlier}T00:00:00`);
    const nextDay = new Date(date1);
    nextDay.setDate(nextDay.getDate() + 1);
    return this.formatDateKey(nextDay) === later;
  }

  /**
   * Format a Date as YYYY-MM-DD.
   */
  private formatDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Capitalize an artist name.
   */
  private capitalizeArtist(name: string): string {
    return name
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Load the full user collection from cache.
   */
  private async loadCollection(): Promise<CollectionItem[] | null> {
    try {
      // Get username from auth settings
      const settings = await this.fileStorage.readJSON<{
        discogs?: { username?: string };
      }>('settings/user-settings.json');
      const username = settings?.discogs?.username;
      if (!username) return null;

      const allItems: CollectionItem[] = [];
      let pageNumber = 1;

      while (true) {
        const cacheKey = `collections/${username}-page-${pageNumber}.json`;
        const cached = await this.fileStorage.readJSON<{
          data: CollectionItem[];
          timestamp: number;
        }>(cacheKey);

        if (!cached || !cached.data) break;
        allItems.push(...cached.data);
        pageNumber++;
      }

      return allItems.length > 0 ? allItems : null;
    } catch {
      this.logger.warn('Failed to load collection for wrapped');
      return null;
    }
  }

  /**
   * Enrich top artists with image URLs.
   */
  private async enrichTopArtistsWithImages(
    items: WrappedTopItem[]
  ): Promise<WrappedTopItem[]> {
    if (items.length === 0) return items;

    const artistImages = await this.imageService.batchGetArtistImages(
      items.map(i => i.artist)
    );

    return items.map(item => ({
      ...item,
      imageUrl: artistImages.get(item.artist.toLowerCase().trim()) || undefined,
    }));
  }

  /**
   * Enrich top albums with cover art URLs.
   */
  private async enrichTopAlbumsWithImages(
    items: WrappedTopItem[]
  ): Promise<WrappedTopItem[]> {
    if (items.length === 0) return items;

    const albumCovers = await this.imageService.batchGetAlbumCovers(
      items.map(i => ({ artist: i.artist, album: i.album || '' }))
    );

    return items.map(item => {
      const key = `${item.artist.toLowerCase().trim()}|${(item.album || '').toLowerCase().trim()}`;
      return {
        ...item,
        imageUrl: albumCovers.get(key) || undefined,
      };
    });
  }

  /**
   * Return empty listening stats for when there's no data.
   */
  private emptyListeningStats(): WrappedListeningStats {
    return {
      totalScrobbles: 0,
      estimatedListeningHours: 0,
      uniqueArtists: 0,
      uniqueAlbums: 0,
      topArtists: [],
      topAlbums: [],
      topTracks: [],
      newArtistsDiscovered: 0,
      newArtistsList: [],
      peakListeningDay: null,
      peakListeningHour: null,
      longestStreak: null,
      heatmapData: [],
    };
  }
}
