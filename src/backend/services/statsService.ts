import {
  AlbumPlayCount,
  ArtistPlayCount,
  CalendarHeatmapData,
  CollectionCoverage,
  CollectionItem,
  DustyCornerAlbum,
  ForgottenTrack,
  ListeningHours,
  MilestoneInfo,
  ScrobbleCounts,
  ScrobbleSession,
  SourceBreakdownItem,
  StatsCache,
  StatsOverview,
  StreakInfo,
  TimelineDataPoint,
  TrackPlayCount,
} from '../../shared/types';
import { createNormalizedTrackKey } from '../../shared/utils/trackNormalization';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

import { ScrobbleHistoryStorage } from './scrobbleHistoryStorage';
import { TrackMappingService } from './trackMappingService';

const STATS_CACHE_FILE = 'stats/stats-cache.json';

// Milestone thresholds
const MILESTONES = [
  1000, 2500, 5000, 10000, 25000, 50000, 75000, 100000, 150000, 200000, 250000,
  500000, 1000000,
];

// Average track duration in seconds (3.5 minutes) for listening time estimation
const AVG_TRACK_DURATION_SECONDS = 210;

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
  }

  /**
   * Set the track mapping service for applying mappings in forgotten favorites.
   * This is optional and should be set after construction.
   */
  setTrackMappingService(service: TrackMappingService): void {
    this.trackMappingService = service;
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
   * Get all stats for the overview dashboard
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
   * Calculate daily listening streak.
   * A streak is consecutive calendar days (in local time) with at least one scrobble.
   */
  async calculateStreaks(): Promise<StreakInfo> {
    const index = await this.historyStorage.getIndex();
    if (!index) {
      return {
        currentStreak: 0,
        longestStreak: 0,
      };
    }

    // Collect all play timestamps
    const allTimestamps: number[] = [];
    for (const albumHistory of Object.values(index.albums)) {
      for (const play of albumHistory.plays) {
        allTimestamps.push(play.timestamp);
      }
    }

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

    for (const albumHistory of Object.values(index.albums)) {
      for (const play of albumHistory.plays) {
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
      }
    }

    return {
      today,
      thisWeek,
      thisMonth,
      thisYear,
      allTime: index.totalScrobbles,
    };
  }

  /**
   * Estimate listening hours based on scrobble counts.
   * Uses average track duration of 3.5 minutes.
   */
  async getListeningHours(): Promise<ListeningHours> {
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

    // Count plays per artist in the period
    const artistCounts = new Map<string, number>();

    for (const [key, albumHistory] of Object.entries(index.albums)) {
      const [artist] = key.split('|');
      for (const play of albumHistory.plays) {
        if (
          play.timestamp >= cutoffTimestamp &&
          play.timestamp <= endTimestamp
        ) {
          const normalizedArtist = artist.toLowerCase();
          artistCounts.set(
            normalizedArtist,
            (artistCounts.get(normalizedArtist) || 0) + 1
          );
        }
      }
    }

    // Sort and return top artists
    return Array.from(artistCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([artist, playCount]) => ({
        artist: this.capitalizeArtist(artist),
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
    endDate?: number
  ): Promise<AlbumPlayCount[]> {
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

    // Count plays per album in the period
    const albumCounts: Array<{
      artist: string;
      album: string;
      playCount: number;
      lastPlayed: number;
    }> = [];

    for (const [key, albumHistory] of Object.entries(index.albums)) {
      const [artist, album] = key.split('|');
      let periodPlays = 0;
      let periodLastPlayed = 0;

      for (const play of albumHistory.plays) {
        if (
          play.timestamp >= cutoffTimestamp &&
          play.timestamp <= endTimestamp
        ) {
          periodPlays++;
          if (play.timestamp > periodLastPlayed) {
            periodLastPlayed = play.timestamp;
          }
        }
      }

      if (periodPlays > 0) {
        albumCounts.push({
          artist: this.capitalizeArtist(artist),
          album: this.capitalizeTitle(album),
          playCount: periodPlays,
          lastPlayed: periodLastPlayed,
        });
      }
    }

    // Sort by play count and return
    return albumCounts
      .sort((a, b) => b.playCount - a.playCount)
      .slice(0, limit);
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

    // Count plays per track in the period
    // Key: normalized "artist|album|track"
    const trackCounts = new Map<
      string,
      {
        artist: string;
        album: string;
        track: string;
        count: number;
        lastPlayed: number;
      }
    >();

    for (const [key, albumHistory] of Object.entries(index.albums)) {
      const [artist, album] = key.split('|');

      for (const play of albumHistory.plays) {
        if (
          play.timestamp >= cutoffTimestamp &&
          play.timestamp <= endTimestamp &&
          play.track
        ) {
          const trackKey = createNormalizedTrackKey(artist, album, play.track);
          const existing = trackCounts.get(trackKey);
          if (existing) {
            existing.count++;
            if (play.timestamp > existing.lastPlayed) {
              existing.lastPlayed = play.timestamp;
            }
          } else {
            trackCounts.set(trackKey, {
              artist,
              album,
              track: play.track,
              count: 1,
              lastPlayed: play.timestamp,
            });
          }
        }
      }
    }

    // Sort and return top tracks
    return Array.from(trackCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map(item => ({
        artist: this.capitalizeArtist(item.artist),
        album: this.capitalizeTitle(item.album),
        track: this.capitalizeTitle(item.track),
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

    for (const item of collection) {
      const result = await this.historyStorage.getAlbumHistoryFuzzy(
        item.release.artist,
        item.release.title
      );

      if (result.entry && result.entry.playCount > 0) {
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

    for (const item of collection) {
      const result = await this.historyStorage.getAlbumHistoryFuzzy(
        item.release.artist,
        item.release.title
      );

      // Album never played or last played more than 6 months ago
      if (!result.entry || result.entry.lastPlayed < sixMonthsAgoSeconds) {
        const lastPlayed = result.entry?.lastPlayed || 0;
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

    for (const item of collection) {
      const result = await this.historyStorage.getAlbumHistoryFuzzy(
        item.release.artist,
        item.release.title
      );

      if (result.entry && result.entry.playCount > 0) {
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

    for (const albumHistory of Object.values(index.albums)) {
      for (const play of albumHistory.plays) {
        if (play.timestamp >= yearStart && play.timestamp < yearEnd) {
          const date = new Date(play.timestamp * 1000);
          const dayKey = this.formatDateKey(date);
          dayCounts.set(dayKey, (dayCounts.get(dayKey) || 0) + 1);
        }
      }
    }

    // Convert to array
    return Array.from(dayCounts.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Get milestone information
   * Calculates when each milestone was actually reached based on scrobble history
   */
  async getMilestones(): Promise<MilestoneInfo> {
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

    // Check if we've hit any new milestones
    const reachedMilestones = MILESTONES.filter(m => m <= total);
    const newMilestones = reachedMilestones.filter(
      m => !history.some(h => h.milestone === m)
    );

    if (newMilestones.length > 0) {
      // Get all timestamps to find when each milestone was actually reached
      const index = await this.historyStorage.getIndex();
      if (index) {
        const allTimestamps: number[] = [];
        for (const albumHistory of Object.values(index.albums)) {
          for (const play of albumHistory.plays) {
            allTimestamps.push(play.timestamp);
          }
        }
        // Sort chronologically (oldest first)
        allTimestamps.sort((a, b) => a - b);

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

      // Update cache
      const now = Math.floor(Date.now() / 1000);
      await this.saveStatsCache({
        schemaVersion: 1,
        lastUpdated: now,
        streaks: cache?.streaks || {
          currentStreak: 0,
          longestStreak: 0,
        },
        milestoneHistory: history,
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
    const index = await this.historyStorage.getIndex();
    if (!index) {
      return 0;
    }

    const now = new Date();
    const monthStart = this.getStartOfMonth(now).getTime() / 1000;

    // Find artists with their first play this month
    const artistFirstPlay = new Map<string, number>();

    for (const [key, albumHistory] of Object.entries(index.albums)) {
      const [artist] = key.split('|');
      const normalizedArtist = artist.toLowerCase();

      for (const play of albumHistory.plays) {
        const existing = artistFirstPlay.get(normalizedArtist);
        if (!existing || play.timestamp < existing) {
          artistFirstPlay.set(normalizedArtist, play.timestamp);
        }
      }
    }

    // Count artists whose first play was this month
    let newArtists = 0;
    for (const firstPlay of artistFirstPlay.values()) {
      if (firstPlay >= monthStart) {
        newArtists++;
      }
    }

    return newArtists;
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

    for (const albumHistory of Object.values(index.albums)) {
      for (const play of albumHistory.plays) {
        totalScrobbles++;
        if (isOurScrobble(play.timestamp)) {
          ourScrobbles++;
        }
      }
    }

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

    // Aggregate scrobbles
    for (const albumHistory of Object.values(index.albums)) {
      for (const play of albumHistory.plays) {
        if (
          play.timestamp >= startTimestamp &&
          play.timestamp <= endTimestamp
        ) {
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
      }
    }

    // Convert to sorted array
    return Array.from(counts.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
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
    limit: number = 100
  ): Promise<{ tracks: ForgottenTrack[]; totalMatching: number }> {
    // Cap limit at 100
    const cappedLimit = Math.min(limit, 100);

    // Check cache (keyed by params excluding limit - we store all results)
    const cacheKey = JSON.stringify({ dormantPeriodDays, minPlayCount });
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
        artist: string;
        album: string;
        track: string;
        count: number;
        lastPlayed: number;
        firstPlayed: number;
      }
    >();

    for (const [key, albumHistory] of Object.entries(index.albums)) {
      const [artist, album] = key.split('|');

      for (const play of albumHistory.plays) {
        // Skip plays without track info
        if (!play.track) continue;

        // Check if this track has a mapping and apply it
        let targetArtist = artist;
        let targetAlbum = album;
        let targetTrack = play.track;

        if (this.trackMappingService) {
          const mapping = await this.trackMappingService.getTrackMapping(
            artist,
            album,
            play.track
          );
          if (mapping) {
            // Use the mapped track coordinates for aggregation
            targetArtist = mapping.cacheArtist;
            targetAlbum = mapping.cacheAlbum;
            targetTrack = mapping.cacheTrack;
          }
        }

        const trackKey = createNormalizedTrackKey(
          targetArtist,
          targetAlbum,
          targetTrack
        );
        const existing = trackStats.get(trackKey);

        if (existing) {
          existing.count++;
          if (play.timestamp > existing.lastPlayed) {
            existing.lastPlayed = play.timestamp;
          }
          if (play.timestamp < existing.firstPlayed) {
            existing.firstPlayed = play.timestamp;
          }
        } else {
          trackStats.set(trackKey, {
            artist: targetArtist,
            album: targetAlbum,
            track: targetTrack,
            count: 1,
            lastPlayed: play.timestamp,
            firstPlayed: play.timestamp,
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
          artist: this.capitalizeArtist(stats.artist),
          album: stats.album ? this.capitalizeTitle(stats.album) : '',
          track: this.capitalizeTitle(stats.track),
          allTimePlayCount: stats.count,
          lastPlayed: stats.lastPlayed,
          daysSincePlay: Math.floor((now - stats.lastPlayed) / (24 * 60 * 60)),
          firstPlayed: stats.firstPlayed,
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

  // ============================================
  // Helper Methods
  // ============================================

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

  private capitalizeArtist(artist: string): string {
    // Simple title case for artist names
    return artist
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private capitalizeTitle(title: string): string {
    return title
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
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
      await this.fileStorage.writeJSON(STATS_CACHE_FILE, cache);
    } catch (error) {
      this.logger.error('Failed to save stats cache', error);
    }
  }
}
