import {
  ListeningPatterns,
  BackfillSuggestion,
  BackfillAlbum,
} from '../../shared/types';
import { createLogger } from '../utils/logger';

import { ScrobbleHistoryStorage } from './scrobbleHistoryStorage';

const log = createLogger('ListeningPatternService');

/** Gap between consecutive scrobbles (seconds) that indicates a new session */
const SESSION_GAP_SECONDS = 60 * 60; // 60 minutes

/** How far back to look for pattern analysis */
const ANALYSIS_WINDOW_DAYS = 180;

/** Last.fm accepts scrobbles up to 14 days in the past */
const LASTFM_WINDOW_SECONDS = 14 * 24 * 60 * 60;

interface DetectedSession {
  startTimestamp: number;
  endTimestamp: number;
  plays: { timestamp: number; albumKey: string }[];
}

export class ListeningPatternService {
  private patterns: ListeningPatterns | null = null;
  private patternsLastCalculated: number = 0;
  private readonly PATTERN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  constructor(private historyStorage: ScrobbleHistoryStorage) {}

  /**
   * Get listening patterns, recalculating if stale.
   */
  async getPatterns(): Promise<ListeningPatterns | null> {
    if (
      this.patterns &&
      Date.now() - this.patternsLastCalculated < this.PATTERN_TTL_MS
    ) {
      return this.patterns;
    }
    return this.calculatePatterns();
  }

  /**
   * Analyze scrobble history to extract listening patterns.
   * Collects all plays within the analysis window, detects sessions,
   * and computes aggregate statistics.
   */
  async calculatePatterns(): Promise<ListeningPatterns | null> {
    const index = await this.historyStorage.getIndex();
    if (!index || Object.keys(index.albums).length === 0) {
      return null;
    }

    // Collect all plays with timestamps within the analysis window
    const allPlays: { timestamp: number; albumKey: string }[] = [];
    const cutoffTimestamp =
      Math.floor(Date.now() / 1000) - ANALYSIS_WINDOW_DAYS * 24 * 60 * 60;

    for (const [key, albumHistory] of Object.entries(index.albums)) {
      for (const play of albumHistory.plays) {
        if (play.timestamp >= cutoffTimestamp) {
          allPlays.push({ timestamp: play.timestamp, albumKey: key });
        }
      }
    }

    if (allPlays.length === 0) {
      return null;
    }

    // Sort chronologically
    allPlays.sort((a, b) => a.timestamp - b.timestamp);

    // Detect sessions
    const sessions = this.detectSessions(allPlays);

    if (sessions.length === 0) {
      return null;
    }

    // Calculate patterns from sessions
    const patterns = this.buildPatterns(sessions, allPlays);
    this.patterns = patterns;
    this.patternsLastCalculated = Date.now();

    log.info(
      `Calculated listening patterns: ${sessions.length} sessions from ${allPlays.length} plays`
    );

    return patterns;
  }

  /**
   * Group plays into sessions based on time gaps.
   * A gap > SESSION_GAP_SECONDS between consecutive plays starts a new session.
   */
  private detectSessions(
    plays: { timestamp: number; albumKey: string }[]
  ): DetectedSession[] {
    const sessions: DetectedSession[] = [];
    let currentSession: { timestamp: number; albumKey: string }[] = [];
    let lastTimestamp = 0;

    for (const play of plays) {
      if (
        currentSession.length === 0 ||
        play.timestamp - lastTimestamp < SESSION_GAP_SECONDS
      ) {
        currentSession.push(play);
      } else {
        // Gap detected - finalize previous session
        if (currentSession.length > 0) {
          sessions.push({
            startTimestamp: currentSession[0].timestamp,
            endTimestamp: currentSession[currentSession.length - 1].timestamp,
            plays: currentSession,
          });
        }
        currentSession = [play];
      }
      lastTimestamp = play.timestamp;
    }

    // Finalize last session
    if (currentSession.length > 0) {
      sessions.push({
        startTimestamp: currentSession[0].timestamp,
        endTimestamp: currentSession[currentSession.length - 1].timestamp,
        plays: currentSession,
      });
    }

    return sessions;
  }

  /**
   * Extract aggregate patterns from detected sessions.
   */
  private buildPatterns(
    sessions: DetectedSession[],
    allPlays: { timestamp: number; albumKey: string }[]
  ): ListeningPatterns {
    // Collect start hours grouped by day-of-week and time-of-day period
    const dayStartTimes: Map<
      number,
      { morning: number[]; afternoon: number[]; evening: number[] }
    > = new Map();
    for (let i = 0; i < 7; i++) {
      dayStartTimes.set(i, { morning: [], afternoon: [], evening: [] });
    }

    const sessionDurations: number[] = [];
    const albumsPerSession: number[] = [];
    const gapsBetweenAlbums: number[] = [];

    for (const session of sessions) {
      const startDate = new Date(session.startTimestamp * 1000);
      const dayOfWeek = startDate.getDay();
      const hour = startDate.getHours();

      const dayData = dayStartTimes.get(dayOfWeek)!;
      if (hour >= 6 && hour < 12) {
        dayData.morning.push(hour);
      } else if (hour >= 12 && hour < 18) {
        dayData.afternoon.push(hour);
      } else {
        // evening: 18-23 or 0-5 (late night wraps)
        dayData.evening.push(hour >= 18 ? hour : hour + 24);
      }

      // Session duration in minutes
      const duration = (session.endTimestamp - session.startTimestamp) / 60;
      if (duration > 0) {
        sessionDurations.push(duration);
      }

      // Unique albums in session
      const uniqueAlbums = new Set(session.plays.map(p => p.albumKey));
      albumsPerSession.push(uniqueAlbums.size);

      // Gaps between consecutive plays (proxy for between-album gaps)
      if (session.plays.length > 1) {
        for (let i = 1; i < session.plays.length; i++) {
          const gap =
            (session.plays[i].timestamp - session.plays[i - 1].timestamp) / 60;
          // Reasonable gap range: 3-30 minutes
          if (gap >= 3 && gap <= 30) {
            gapsBetweenAlbums.push(gap);
          }
        }
      }
    }

    // Averages
    const avgSession =
      sessionDurations.length > 0
        ? sessionDurations.reduce((a, b) => a + b, 0) / sessionDurations.length
        : 60;
    const avgAlbums =
      albumsPerSession.length > 0
        ? albumsPerSession.reduce((a, b) => a + b, 0) / albumsPerSession.length
        : 2;
    const avgGap =
      gapsBetweenAlbums.length > 0
        ? gapsBetweenAlbums.reduce((a, b) => a + b, 0) /
          gapsBetweenAlbums.length
        : 15;

    // Build typical start times per day
    const typicalStartTimes = [];
    for (let day = 0; day < 7; day++) {
      const dayData = dayStartTimes.get(day)!;
      typicalStartTimes.push({
        dayOfWeek: day,
        morning:
          dayData.morning.length > 0
            ? Math.round(
                dayData.morning.reduce((a, b) => a + b, 0) /
                  dayData.morning.length
              )
            : null,
        afternoon:
          dayData.afternoon.length > 0
            ? Math.round(
                dayData.afternoon.reduce((a, b) => a + b, 0) /
                  dayData.afternoon.length
              )
            : null,
        evening:
          dayData.evening.length > 0
            ? Math.round(
                dayData.evening.reduce((a, b) => a + b, 0) /
                  dayData.evening.length
              ) % 24
            : null,
      });
    }

    // Weekday vs weekend peak hours
    const weekdayHours = sessions
      .filter(s => {
        const day = new Date(s.startTimestamp * 1000).getDay();
        return day >= 1 && day <= 5;
      })
      .map(s => new Date(s.startTimestamp * 1000).getHours());

    const weekendHours = sessions
      .filter(s => {
        const day = new Date(s.startTimestamp * 1000).getDay();
        return day === 0 || day === 6;
      })
      .map(s => new Date(s.startTimestamp * 1000).getHours());

    return {
      typicalStartTimes,
      averageSessionLengthMinutes: Math.round(avgSession),
      averageGapBetweenAlbumsMinutes: Math.round(avgGap),
      averageAlbumsPerSession: Math.round(avgAlbums * 10) / 10,
      weekdayPattern: {
        peakHour: this.findPeakHour(weekdayHours),
        sessionCount: weekdayHours.length,
      },
      weekendPattern: {
        peakHour: this.findPeakHour(weekendHours),
        sessionCount: weekendHours.length,
      },
      analyzedFromTimestamp: allPlays[0].timestamp,
      analyzedToTimestamp: allPlays[allPlays.length - 1].timestamp,
      sessionCount: sessions.length,
      lastCalculated: Date.now(),
    };
  }

  /**
   * Find the most common hour from an array of hours.
   * Returns 20 (8 PM) as default when no data is available.
   */
  private findPeakHour(hours: number[]): number {
    if (hours.length === 0) return 20;

    const counts = new Map<number, number>();
    for (const h of hours) {
      counts.set(h, (counts.get(h) || 0) + 1);
    }

    let maxCount = 0;
    let peakHour = 20;
    for (const [hour, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        peakHour = hour;
      }
    }
    return peakHour;
  }

  /**
   * Generate timestamp suggestions for backfilling a list of albums.
   * Produces preset options (e.g. "Yesterday evening") with calculated
   * per-album start/end times and conflict info.
   */
  async suggestBackfillTimestamps(
    albums: BackfillAlbum[],
    _options?: {
      targetDate?: Date;
      timeOfDay?: 'morning' | 'afternoon' | 'evening';
      customStartTime?: number;
    }
  ): Promise<BackfillSuggestion[]> {
    const patterns = await this.getPatterns();
    const suggestions: BackfillSuggestion[] = [];
    const now = new Date();

    const gapMinutes = patterns?.averageGapBetweenAlbumsMinutes || 15;

    // Generate preset suggestions
    const presets = this.generatePresets(now, patterns);

    for (const preset of presets) {
      const timestamps = this.calculateAlbumTimestamps(
        albums,
        preset.startTimestamp,
        gapMinutes
      );

      const conflicts = await this.checkConflicts(
        preset.startTimestamp,
        timestamps[timestamps.length - 1]?.endTimestamp || preset.startTimestamp
      );

      suggestions.push({
        presetLabel: preset.label,
        presetDescription: preset.description,
        startTimestamp: preset.startTimestamp,
        calculatedTimestamps: timestamps,
        hasConflicts: conflicts.hasConflicts,
        conflictMessage: conflicts.message,
        isOutsideLastFmWindow: preset.isOutsideLastFmWindow,
        lastFmWindowWarning: preset.isOutsideLastFmWindow
          ? "This date is outside Last.fm's 2-week limit. Scrobbles will be rejected."
          : undefined,
      });
    }

    return suggestions;
  }

  /**
   * Generate preset options for backfill timestamps.
   */
  private generatePresets(
    now: Date,
    patterns: ListeningPatterns | null
  ): Array<{
    label: string;
    description: string;
    startTimestamp: number;
    isOutsideLastFmWindow: boolean;
  }> {
    const presets: Array<{
      label: string;
      description: string;
      startTimestamp: number;
      isOutsideLastFmWindow: boolean;
    }> = [];

    const currentDayOfWeek = now.getDay();
    const yesterdayDayOfWeek = (currentDayOfWeek + 6) % 7;
    const nowTimestamp = Math.floor(now.getTime() / 1000);
    const lastFmCutoff = nowTimestamp - LASTFM_WINDOW_SECONDS;

    const getTypicalHour = (
      dayOfWeek: number,
      period: 'morning' | 'afternoon' | 'evening'
    ): number => {
      if (patterns) {
        const dayPattern = patterns.typicalStartTimes[dayOfWeek];
        if (dayPattern) {
          const hour = dayPattern[period];
          if (hour !== null) return hour;
        }
      }
      if (period === 'morning') return 9;
      if (period === 'afternoon') return 14;
      return 20;
    };

    const addPreset = (label: string, date: Date, description: string) => {
      const timestamp = Math.floor(date.getTime() / 1000);
      const isOutside = timestamp < lastFmCutoff;
      presets.push({
        label,
        description: isOutside
          ? `${description} (outside Last.fm window)`
          : description,
        startTimestamp: timestamp,
        isOutsideLastFmWindow: isOutside,
      });
    };

    // Yesterday evening
    const yesterdayEvening = new Date(now);
    yesterdayEvening.setDate(yesterdayEvening.getDate() - 1);
    yesterdayEvening.setHours(
      getTypicalHour(yesterdayDayOfWeek, 'evening'),
      0,
      0,
      0
    );
    addPreset(
      'Yesterday evening',
      yesterdayEvening,
      `${this.formatTime(yesterdayEvening)} - based on your typical evening start`
    );

    // Yesterday afternoon
    const yesterdayAfternoon = new Date(now);
    yesterdayAfternoon.setDate(yesterdayAfternoon.getDate() - 1);
    yesterdayAfternoon.setHours(
      getTypicalHour(yesterdayDayOfWeek, 'afternoon'),
      0,
      0,
      0
    );
    addPreset(
      'Yesterday afternoon',
      yesterdayAfternoon,
      this.formatTime(yesterdayAfternoon)
    );

    // Last Saturday evening (if not already Saturday)
    if (currentDayOfWeek !== 6) {
      const lastSaturday = new Date(now);
      const daysBack = currentDayOfWeek === 0 ? 1 : currentDayOfWeek + 1;
      lastSaturday.setDate(lastSaturday.getDate() - daysBack);
      lastSaturday.setHours(getTypicalHour(6, 'evening'), 0, 0, 0);
      addPreset(
        'Last Saturday evening',
        lastSaturday,
        `${this.formatDate(lastSaturday)} ${this.formatTime(lastSaturday)}`
      );
    }

    // Last Sunday afternoon
    if (currentDayOfWeek !== 0) {
      const lastSunday = new Date(now);
      const daysBack = currentDayOfWeek;
      lastSunday.setDate(lastSunday.getDate() - daysBack);
      lastSunday.setHours(getTypicalHour(0, 'afternoon'), 0, 0, 0);
      addPreset(
        'Last Sunday afternoon',
        lastSunday,
        `${this.formatDate(lastSunday)} ${this.formatTime(lastSunday)}`
      );
    }

    // Sort: valid presets first, then outside-window presets
    return presets.sort((a, b) => {
      if (a.isOutsideLastFmWindow !== b.isOutsideLastFmWindow) {
        return a.isOutsideLastFmWindow ? 1 : -1;
      }
      return 0;
    });
  }

  /**
   * Calculate per-album start and end timestamps given a session start time.
   */
  private calculateAlbumTimestamps(
    albums: BackfillAlbum[],
    startTimestamp: number,
    gapMinutes: number
  ): Array<{
    albumIndex: number;
    startTimestamp: number;
    endTimestamp: number;
  }> {
    const results: Array<{
      albumIndex: number;
      startTimestamp: number;
      endTimestamp: number;
    }> = [];
    let currentTime = startTimestamp;

    for (let i = 0; i < albums.length; i++) {
      const album = albums[i];
      const albumStart = currentTime;
      const albumEnd = albumStart + album.durationSeconds;

      results.push({
        albumIndex: i,
        startTimestamp: albumStart,
        endTimestamp: albumEnd,
      });

      // Add gap before next album
      currentTime = albumEnd + gapMinutes * 60;
    }

    return results;
  }

  /**
   * Check for conflicts with existing scrobbles in a time window.
   * Uses early pruning via album-level lastPlayed timestamps.
   */
  async checkConflicts(
    startTimestamp: number,
    endTimestamp: number
  ): Promise<{
    hasConflicts: boolean;
    message?: string;
    existingCount?: number;
  }> {
    const index = await this.historyStorage.getIndex();
    if (!index) {
      return { hasConflicts: false };
    }

    let conflictCount = 0;
    for (const albumHistory of Object.values(index.albums)) {
      // Early pruning: skip albums whose last play is before our window
      if (albumHistory.lastPlayed < startTimestamp) {
        continue;
      }

      for (const play of albumHistory.plays) {
        if (
          play.timestamp >= startTimestamp &&
          play.timestamp <= endTimestamp
        ) {
          conflictCount++;
        }
        if (conflictCount >= 100) break;
      }
      if (conflictCount >= 100) break;
    }

    if (conflictCount > 0) {
      const startDate = new Date(startTimestamp * 1000);
      const endDate = new Date(endTimestamp * 1000);
      return {
        hasConflicts: true,
        message: `You have ${conflictCount >= 100 ? '100+' : conflictCount} existing scrobble(s) between ${this.formatTime(startDate)} and ${this.formatTime(endDate)}`,
        existingCount: conflictCount,
      };
    }

    return { hasConflicts: false };
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }
}
