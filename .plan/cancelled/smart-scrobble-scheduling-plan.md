# Smart Scrobble Scheduling - Implementation Plan

## Overview

Make backfilling scrobbles easier with intelligent timestamp suggestions, batch operations, and a listening queue system. This feature learns from your listening history to suggest realistic timestamps for backfilling past listening sessions.

---

## Feature Concept

### What It Does
- **Pattern Learning**: Analyzes your scrobble history to learn when you typically listen (time of day, day of week, session lengths)
- **Backfill Mode**: Select multiple albums, choose a date/time window, and auto-calculate realistic timestamps
- **Quick Presets**: "Yesterday evening", "Last Saturday afternoon" shortcuts based on your patterns
- **Listening Queue**: Real-time tracker for "I'm listening now" → "Done" workflow
- **Conflict Detection**: Warns when proposed timestamps overlap with existing scrobbles

### Why It's Valuable
- **Accuracy**: Scrobbles get realistic timestamps instead of all bunched at "now"
- **Efficiency**: Batch scrobble multiple albums in one operation
- **Convenience**: Quick presets eliminate manual date/time picking for common cases
- **Flexibility**: Real-time queue for live sessions, backfill for past sessions

---

## User Interface

### Backfill Mode Dialog

When user selects multiple albums (or single album with "Backfill" option):

```
┌─────────────────────────────────────────────────────────────┐
│ Backfill Listening Session                           [×]    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Albums to scrobble:                                         │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ [cover] Radiohead - OK Computer (53 min)          [×]   │ │
│ │ [cover] Pink Floyd - DSOTM (42 min)               [×]   │ │
│ │ [cover] Boards of Canada - MHTRTC (62 min)        [×]   │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ [+ Add Another Album]                                       │
│                                                             │
│ When did you listen?                                        │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ○ Yesterday evening (7:30 PM - based on your patterns)  │ │
│ │ ○ Yesterday afternoon (2:00 PM)                         │ │
│ │ ○ Last Saturday evening (7:00 PM)                       │ │
│ │ ● Custom: [Jan 15, 2026] [6:00 PM] to [9:30 PM]        │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Gap between albums: [22 min] (your typical gap)             │
│                                                             │
│ Preview:                                                    │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ OK Computer        Wed Jan 15, 6:00 PM - 6:53 PM        │ │
│ │ DSOTM              Wed Jan 15, 7:15 PM - 7:57 PM        │ │
│ │ MHTRTC             Wed Jan 15, 8:19 PM - 9:21 PM        │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ⚠️ Warning: You have scrobbles between 7-8 PM on this date │
│    [Adjust Times] [Scrobble Anyway]                         │
│                                                             │
│ [Cancel]                            [Scrobble All (3)]      │
└─────────────────────────────────────────────────────────────┘
```

### Quick Preset Enhancement to Existing Scrobble Dialog

Add preset buttons to existing ScrobblePage timestamp section:

```
┌─────────────────────────────────────────────────────────────┐
│ When did you listen?                                        │
│                                                             │
│ [Just now] [Earlier today] [Yesterday evening] [Custom...]  │
│                                                             │
│ Tip: You usually listen around 8 PM on weekday evenings     │
└─────────────────────────────────────────────────────────────┘
```

### Listening Queue Widget (Optional Sidebar Addition)

```
┌───────────────────────────────────┐
│ 🎵 Listening Session              │
│ Started 45 min ago                │
├───────────────────────────────────┤
│ ✓ OK Computer         (scrobbled) │
│ ▶ DSOTM               (playing)   │
│   MHTRTC              (queued)    │
├───────────────────────────────────┤
│ [Finished Current] [End Session]  │
└───────────────────────────────────┘
```

---

## Data Source Analysis

### Existing Pattern Data Available

From `ScrobbleHistoryStorage`:
- `getHourlyDistribution()` - Scrobbles by hour (0-23)
- `getDayOfWeekDistribution()` - Scrobbles by day (0=Sun, 6=Sat)

From `AnalyticsService`:
- `getTimeOfDayPreference()` - Combined hour+day preference score

### What's Missing (Need to Build)

1. **Session Detection**: Group consecutive scrobbles into "listening sessions"
2. **Typical Start Times**: Extract when sessions typically begin per day-of-week
3. **Session Duration**: How long sessions typically last
4. **Gap Analysis**: Time gaps between albums within sessions
5. **Conflict Check**: Compare proposed timestamps against existing history

### Session Detection Algorithm

A "session" is a period of continuous listening. Detect by:
- Gap between consecutive scrobbles > 60 minutes = new session

**Note on threshold difference from `getAlbumCompleteness()`:**
The existing `getAlbumCompleteness()` uses a 2-hour (7200s) threshold to group plays into "album listening sessions" - this is intentionally generous because it's trying to detect when someone listened to most of an album, even with interruptions (bathroom break, phone call, etc.).

For pattern learning, we use a stricter 60-minute threshold because:
1. We're detecting "when did a user start listening" not "did they finish an album"
2. A 60-min gap strongly suggests a new listening intent (came home from work, woke up, etc.)
3. Two albums back-to-back with 60+ minutes gap are likely separate listening decisions
4. This gives more granular session data for typical start times

```typescript
interface ListeningSession {
  startTimestamp: number;      // First scrobble
  endTimestamp: number;        // Last scrobble
  dayOfWeek: number;           // 0-6
  hourOfDay: number;           // 0-23 (start hour)
  durationMinutes: number;     // Session length
  albumCount: number;          // Number of distinct albums
}
```

---

## Data Model

### New Type Definitions

```typescript
// src/shared/types.ts

/**
 * Learned listening patterns from scrobble history
 */
export interface ListeningPatterns {
  // Time-of-day patterns by day of week
  typicalStartTimes: {
    dayOfWeek: number;  // 0-6 (Sunday = 0)
    morning: number | null;    // Hour (6-11) if user listens then
    afternoon: number | null;  // Hour (12-17)
    evening: number | null;    // Hour (18-23)
  }[];

  // Session patterns
  averageSessionLengthMinutes: number;
  averageGapBetweenAlbumsMinutes: number;
  averageAlbumsPerSession: number;

  // Weekday vs weekend
  weekdayPattern: { peakHour: number; sessionCount: number };
  weekendPattern: { peakHour: number; sessionCount: number };

  // Metadata
  analyzedFromTimestamp: number;  // Oldest scrobble considered
  analyzedToTimestamp: number;    // Newest scrobble considered
  sessionCount: number;           // Total sessions analyzed
  lastCalculated: number;         // When patterns were computed
}

/**
 * Suggested timestamps for backfilling albums
 */
export interface BackfillSuggestion {
  presetLabel: string;           // "Yesterday evening", "Last Saturday"
  presetDescription: string;     // "7:30 PM - based on your typical evening start"
  startTimestamp: number;        // Unix seconds
  calculatedTimestamps: {
    albumIndex: number;
    startTimestamp: number;      // When album starts
    endTimestamp: number;        // When album ends
  }[];
  hasConflicts: boolean;
  conflictMessage?: string;
  isOutsideLastFmWindow: boolean;  // True if > 14 days ago
  lastFmWindowWarning?: string;    // "This date is outside Last.fm's 2-week limit"
}

/**
 * Album in backfill queue with duration
 */
export interface BackfillAlbum {
  releaseId: number;
  artist: string;
  album: string;
  durationSeconds: number;       // Total album duration
  trackCount: number;
  coverUrl?: string;
}

/**
 * Active listening queue for real-time tracking
 *
 * Storage: localStorage (frontend) - survives page refresh, cleared on logout
 * This is frontend-only state, not persisted to backend files.
 */
export interface ListeningQueue {
  id: string;
  sessionStarted: number;        // Unix timestamp when session began
  albums: {
    releaseId: number;
    artist: string;
    album: string;
    addedAt: number;             // When added to queue
    startedAt?: number;          // When marked as playing
    finishedAt?: number;         // When marked finished
    scrobbled: boolean;
  }[];
  status: 'active' | 'completed';
}
```

---

## Backend Implementation

### Phase 3A: Pattern Learning Service

**File:** `src/backend/services/listeningPatternService.ts`

```typescript
import { ScrobbleHistoryStorage } from './scrobbleHistoryStorage';
import { ListeningPatterns, BackfillSuggestion, BackfillAlbum } from '../../shared/types';
import { logger } from '../utils/logger';

// Session gap threshold: 60 minutes between scrobbles = new session
const SESSION_GAP_MINUTES = 60;

// Analyze last 6 months of history for patterns
const ANALYSIS_WINDOW_DAYS = 180;

export class ListeningPatternService {
  private patterns: ListeningPatterns | null = null;
  private patternsLastCalculated: number = 0;
  private readonly PATTERN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  constructor(private historyStorage: ScrobbleHistoryStorage) {}

  /**
   * Get listening patterns, recalculating if stale
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
   * Analyze scrobble history to extract listening patterns
   */
  async calculatePatterns(): Promise<ListeningPatterns | null> {
    const index = await this.historyStorage.getIndex();
    if (!index || Object.keys(index.albums).length === 0) {
      return null;
    }

    // Collect all plays with timestamps
    const allPlays: { timestamp: number; albumKey: string }[] = [];
    const cutoffTimestamp = (Date.now() / 1000) - (ANALYSIS_WINDOW_DAYS * 24 * 60 * 60);

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

    // Calculate patterns
    const patterns = this.calculatePatternsFromSessions(sessions, allPlays);

    this.patterns = patterns;
    this.patternsLastCalculated = Date.now();

    return patterns;
  }

  /**
   * Group plays into sessions based on time gaps
   */
  private detectSessions(
    plays: { timestamp: number; albumKey: string }[]
  ): Array<{
    startTimestamp: number;
    endTimestamp: number;
    plays: typeof plays;
  }> {
    const sessions: Array<{
      startTimestamp: number;
      endTimestamp: number;
      plays: typeof plays;
    }> = [];

    let currentSession: typeof plays = [];
    let lastTimestamp = 0;

    for (const play of plays) {
      if (
        currentSession.length === 0 ||
        (play.timestamp - lastTimestamp) < SESSION_GAP_MINUTES * 60
      ) {
        currentSession.push(play);
      } else {
        // Gap detected - save previous session
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

    // Don't forget last session
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
   * Extract patterns from detected sessions
   */
  private calculatePatternsFromSessions(
    sessions: Array<{
      startTimestamp: number;
      endTimestamp: number;
      plays: { timestamp: number; albumKey: string }[];
    }>,
    allPlays: { timestamp: number; albumKey: string }[]
  ): ListeningPatterns {
    // Typical start times per day of week
    const dayStartTimes: Map<number, { morning: number[]; afternoon: number[]; evening: number[] }> = new Map();
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
      } else if (hour >= 18 || hour < 6) {
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

      // Gaps between albums (approximate via timestamp differences)
      // This is simplified - a more accurate version would track album boundaries
      if (session.plays.length > 1) {
        for (let i = 1; i < session.plays.length; i++) {
          const gap = (session.plays[i].timestamp - session.plays[i - 1].timestamp) / 60;
          // Reasonable gap range: 3-30 minutes (track length variation)
          if (gap >= 3 && gap <= 30) {
            gapsBetweenAlbums.push(gap);
          }
        }
      }
    }

    // Calculate averages
    const avgSession = sessionDurations.length > 0
      ? sessionDurations.reduce((a, b) => a + b, 0) / sessionDurations.length
      : 60;
    const avgAlbums = albumsPerSession.length > 0
      ? albumsPerSession.reduce((a, b) => a + b, 0) / albumsPerSession.length
      : 2;
    const avgGap = gapsBetweenAlbums.length > 0
      ? gapsBetweenAlbums.reduce((a, b) => a + b, 0) / gapsBetweenAlbums.length
      : 15;

    // Build typical start times per day
    const typicalStartTimes = [];
    for (let day = 0; day < 7; day++) {
      const dayData = dayStartTimes.get(day)!;
      typicalStartTimes.push({
        dayOfWeek: day,
        morning: dayData.morning.length > 0
          ? Math.round(dayData.morning.reduce((a, b) => a + b, 0) / dayData.morning.length)
          : null,
        afternoon: dayData.afternoon.length > 0
          ? Math.round(dayData.afternoon.reduce((a, b) => a + b, 0) / dayData.afternoon.length)
          : null,
        evening: dayData.evening.length > 0
          ? Math.round(dayData.evening.reduce((a, b) => a + b, 0) / dayData.evening.length) % 24
          : null,
      });
    }

    // Weekday vs weekend patterns
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

    const weekdayPeak = this.findPeakHour(weekdayHours);
    const weekendPeak = this.findPeakHour(weekendHours);

    return {
      typicalStartTimes,
      averageSessionLengthMinutes: Math.round(avgSession),
      averageGapBetweenAlbumsMinutes: Math.round(avgGap),
      averageAlbumsPerSession: Math.round(avgAlbums * 10) / 10,
      weekdayPattern: { peakHour: weekdayPeak, sessionCount: weekdayHours.length },
      weekendPattern: { peakHour: weekendPeak, sessionCount: weekendHours.length },
      analyzedFromTimestamp: allPlays[0].timestamp,
      analyzedToTimestamp: allPlays[allPlays.length - 1].timestamp,
      sessionCount: sessions.length,
      lastCalculated: Date.now(),
    };
  }

  private findPeakHour(hours: number[]): number {
    if (hours.length === 0) return 20; // Default to 8 PM

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
   * Generate timestamp suggestions for backfilling albums
   */
  async suggestBackfillTimestamps(
    albums: BackfillAlbum[],
    options?: {
      targetDate?: Date;      // Specific date to backfill to
      timeOfDay?: 'morning' | 'afternoon' | 'evening';
      customStartTime?: number;  // Unix timestamp override
    }
  ): Promise<BackfillSuggestion[]> {
    const patterns = await this.getPatterns();
    const suggestions: BackfillSuggestion[] = [];
    const now = new Date();

    // Calculate total duration
    const totalDurationSeconds = albums.reduce((sum, a) => sum + a.durationSeconds, 0);
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
          ? 'This date is outside Last.fm\'s 2-week limit. Scrobbles will be rejected.'
          : undefined,
      });
    }

    return suggestions;
  }

  // Last.fm accepts scrobbles up to 14 days in the past
  private readonly LASTFM_WINDOW_SECONDS = 14 * 24 * 60 * 60;

  private generatePresets(
    now: Date,
    patterns: ListeningPatterns | null
  ): Array<{ label: string; description: string; startTimestamp: number; isOutsideLastFmWindow: boolean }> {
    const presets: Array<{ label: string; description: string; startTimestamp: number; isOutsideLastFmWindow: boolean }> = [];
    const currentDayOfWeek = now.getDay();
    const yesterdayDayOfWeek = (currentDayOfWeek + 6) % 7;
    const nowTimestamp = Math.floor(now.getTime() / 1000);
    const lastFmCutoff = nowTimestamp - this.LASTFM_WINDOW_SECONDS;

    // Get typical times from patterns or use defaults
    const getTypicalHour = (dayOfWeek: number, period: 'morning' | 'afternoon' | 'evening') => {
      if (patterns) {
        const dayPattern = patterns.typicalStartTimes[dayOfWeek];
        if (dayPattern) {
          const hour = dayPattern[period];
          if (hour !== null) return hour;
        }
      }
      // Defaults
      if (period === 'morning') return 9;
      if (period === 'afternoon') return 14;
      return 20;
    };

    const addPreset = (label: string, date: Date, description: string) => {
      const timestamp = Math.floor(date.getTime() / 1000);
      const isOutside = timestamp < lastFmCutoff;
      presets.push({
        label,
        description: isOutside ? `${description} (outside Last.fm window)` : description,
        startTimestamp: timestamp,
        isOutsideLastFmWindow: isOutside,
      });
    };

    // Yesterday evening
    const yesterdayEvening = new Date(now);
    yesterdayEvening.setDate(yesterdayEvening.getDate() - 1);
    yesterdayEvening.setHours(getTypicalHour(yesterdayDayOfWeek, 'evening'), 0, 0, 0);
    addPreset(
      'Yesterday evening',
      yesterdayEvening,
      `${this.formatTime(yesterdayEvening)} - based on your typical evening start`
    );

    // Yesterday afternoon
    const yesterdayAfternoon = new Date(now);
    yesterdayAfternoon.setDate(yesterdayAfternoon.getDate() - 1);
    yesterdayAfternoon.setHours(getTypicalHour(yesterdayDayOfWeek, 'afternoon'), 0, 0, 0);
    addPreset('Yesterday afternoon', yesterdayAfternoon, this.formatTime(yesterdayAfternoon));

    // Last Saturday evening (if not already Saturday)
    if (currentDayOfWeek !== 6) {
      const lastSaturday = new Date(now);
      const daysBack = currentDayOfWeek === 0 ? 1 : (currentDayOfWeek + 1);
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

  private calculateAlbumTimestamps(
    albums: BackfillAlbum[],
    startTimestamp: number,
    gapMinutes: number
  ): Array<{ albumIndex: number; startTimestamp: number; endTimestamp: number }> {
    const results: Array<{ albumIndex: number; startTimestamp: number; endTimestamp: number }> = [];
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
      currentTime = albumEnd + (gapMinutes * 60);
    }

    return results;
  }

  /**
   * Check for conflicts with existing scrobbles
   *
   * Performance optimization: Early pruning using album-level lastPlayed timestamps.
   * Only scans plays within albums that could possibly have conflicts.
   * For a typical 3-hour window, this reduces the search space significantly
   * compared to scanning all plays across all albums.
   */
  async checkConflicts(
    startTimestamp: number,
    endTimestamp: number
  ): Promise<{ hasConflicts: boolean; message?: string; existingCount?: number }> {
    const index = await this.historyStorage.getIndex();
    if (!index) {
      return { hasConflicts: false };
    }

    // Count scrobbles in the time window with early pruning
    let conflictCount = 0;
    for (const albumHistory of Object.values(index.albums)) {
      // Early pruning: skip albums whose last play is before our window
      // or whose earliest possible play (approximated by lastPlayed - playCount * avgTrackDuration)
      // is after our window. Most albums won't have plays in a specific 3-hour window.
      if (albumHistory.lastPlayed < startTimestamp) {
        continue; // Album's most recent play is before our window
      }

      // Scan this album's plays
      for (const play of albumHistory.plays) {
        if (play.timestamp >= startTimestamp && play.timestamp <= endTimestamp) {
          conflictCount++;
        }
        // Early exit if we've found enough conflicts to warn
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
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
}
```

### Phase 3B: API Endpoints

**File:** `src/backend/routes/patterns.ts`

```typescript
import { Router, Request, Response } from 'express';
import { ListeningPatternService } from '../services/listeningPatternService';
import { scrobbleHistoryStorage } from '../services/scrobbleHistoryStorage';
import { logger } from '../utils/logger';

const router = Router();
const patternService = new ListeningPatternService(scrobbleHistoryStorage);

/**
 * GET /api/v1/patterns
 * Get learned listening patterns
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const patterns = await patternService.getPatterns();

    if (!patterns) {
      return res.json({
        success: true,
        data: null,
        message: 'Insufficient listening history to detect patterns',
      });
    }

    res.json({
      success: true,
      data: patterns,
    });
  } catch (error) {
    logger.error('Error getting patterns', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/v1/patterns/suggest
 * Get timestamp suggestions for backfilling albums
 *
 * Body: {
 *   albums: BackfillAlbum[],
 *   targetDate?: string (ISO date),
 *   timeOfDay?: 'morning' | 'afternoon' | 'evening',
 *   customStartTime?: number (Unix timestamp)
 * }
 */
router.post('/suggest', async (req: Request, res: Response) => {
  try {
    const { albums, targetDate, timeOfDay, customStartTime } = req.body;

    if (!albums || !Array.isArray(albums) || albums.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'albums array is required',
      });
    }

    // Validate albums have required fields
    for (const album of albums) {
      if (!album.artist || !album.album || typeof album.durationSeconds !== 'number') {
        return res.status(400).json({
          success: false,
          error: 'Each album must have artist, album, and durationSeconds',
        });
      }
    }

    const suggestions = await patternService.suggestBackfillTimestamps(albums, {
      targetDate: targetDate ? new Date(targetDate) : undefined,
      timeOfDay,
      customStartTime,
    });

    res.json({
      success: true,
      data: suggestions,
    });
  } catch (error) {
    logger.error('Error generating suggestions', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/v1/patterns/check-conflicts
 * Check if a time range has existing scrobbles
 *
 * Body: {
 *   startTimestamp: number,
 *   endTimestamp: number
 * }
 */
router.post('/check-conflicts', async (req: Request, res: Response) => {
  try {
    const { startTimestamp, endTimestamp } = req.body;

    if (typeof startTimestamp !== 'number' || typeof endTimestamp !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'startTimestamp and endTimestamp are required',
      });
    }

    const result = await patternService.checkConflicts(startTimestamp, endTimestamp);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error checking conflicts', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/v1/patterns/recalculate
 * Force recalculation of patterns (admin/debug)
 */
router.post('/recalculate', async (req: Request, res: Response) => {
  try {
    const patterns = await patternService.calculatePatterns();

    res.json({
      success: true,
      data: patterns,
      message: patterns ? 'Patterns recalculated' : 'Insufficient data',
    });
  } catch (error) {
    logger.error('Error recalculating patterns', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
```

### Phase 3C: Listening Queue Hook (Frontend localStorage)

The listening queue is **frontend-only state** stored in localStorage. This is appropriate because:
1. Queue is transient - only relevant during active listening
2. No need for backend persistence or sync
3. Survives page refresh but can be cleared without data loss
4. Simpler implementation without backend routes

**File:** `src/renderer/hooks/useListeningQueue.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';
import { ListeningQueue } from '../../shared/types';
import { v4 as uuid } from 'uuid';

const STORAGE_KEY = 'recordscrobbles.listeningQueue';

export function useListeningQueue() {
  const [queue, setQueue] = useState<ListeningQueue | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as ListeningQueue;
        // Only restore active sessions
        if (parsed.status === 'active') {
          setQueue(parsed);
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  // Persist to localStorage on change
  useEffect(() => {
    if (queue) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [queue]);

  const startSession = useCallback(() => {
    if (queue?.status === 'active') {
      throw new Error('A session is already active');
    }
    const newQueue: ListeningQueue = {
      id: uuid(),
      sessionStarted: Math.floor(Date.now() / 1000),
      albums: [],
      status: 'active',
    };
    setQueue(newQueue);
    return newQueue;
  }, [queue]);

  const addAlbum = useCallback((
    releaseId: number,
    artist: string,
    album: string
  ) => {
    if (!queue || queue.status !== 'active') {
      throw new Error('No active session');
    }
    setQueue(prev => prev ? {
      ...prev,
      albums: [...prev.albums, {
        releaseId,
        artist,
        album,
        addedAt: Math.floor(Date.now() / 1000),
        scrobbled: false,
      }],
    } : null);
  }, [queue]);

  const startPlaying = useCallback((releaseId: number) => {
    setQueue(prev => {
      if (!prev) return null;
      return {
        ...prev,
        albums: prev.albums.map(a =>
          a.releaseId === releaseId
            ? { ...a, startedAt: Math.floor(Date.now() / 1000) }
            : a
        ),
      };
    });
  }, []);

  const finishAlbum = useCallback((releaseId: number) => {
    setQueue(prev => {
      if (!prev) return null;
      return {
        ...prev,
        albums: prev.albums.map(a =>
          a.releaseId === releaseId
            ? { ...a, finishedAt: Math.floor(Date.now() / 1000), scrobbled: true }
            : a
        ),
      };
    });
    // Note: Actual scrobbling happens via existing scrobble API
    // The caller should call api.scrobbleAlbum() after this
  }, []);

  const removeAlbum = useCallback((releaseId: number) => {
    setQueue(prev => {
      if (!prev) return null;
      const album = prev.albums.find(a => a.releaseId === releaseId);
      if (album?.scrobbled) {
        throw new Error('Cannot remove already scrobbled album');
      }
      return {
        ...prev,
        albums: prev.albums.filter(a => a.releaseId !== releaseId),
      };
    });
  }, []);

  const endSession = useCallback(() => {
    setQueue(prev => prev ? { ...prev, status: 'completed' } : null);
    // Clear after marking complete
    setTimeout(() => setQueue(null), 0);
  }, []);

  return {
    queue,
    isActive: queue?.status === 'active',
    startSession,
    addAlbum,
    startPlaying,
    finishAlbum,
    removeAlbum,
    endSession,
  };
}
```

---

## Frontend Implementation

### Phase 3D: Quick Preset Enhancement

**Modify:** `src/renderer/pages/ScrobblePage.tsx`

Add quick preset buttons above the existing timestamp picker:

```typescript
// New component: src/renderer/components/scrobble/QuickTimePresets.tsx

interface QuickTimePresetsProps {
  patterns: ListeningPatterns | null;
  onSelectPreset: (timestamp: number) => void;
  onSelectCustom: () => void;
}

export function QuickTimePresets({
  patterns,
  onSelectPreset,
  onSelectCustom,
}: QuickTimePresetsProps) {
  const now = new Date();

  const getYesterdayEvening = () => {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    const hour = patterns?.weekdayPattern.peakHour || 20;
    d.setHours(hour, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
  };

  const getEarlierToday = () => {
    const d = new Date(now);
    const hour = patterns?.typicalStartTimes[d.getDay()]?.afternoon || 14;
    d.setHours(hour, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
  };

  return (
    <div className="quick-time-presets">
      <div className="preset-label">When did you listen?</div>
      <div className="preset-buttons">
        <button
          className="preset-btn"
          onClick={() => onSelectPreset(Math.floor(Date.now() / 1000))}
        >
          Just now
        </button>
        <button
          className="preset-btn"
          onClick={() => onSelectPreset(getEarlierToday())}
        >
          Earlier today
        </button>
        <button
          className="preset-btn"
          onClick={() => onSelectPreset(getYesterdayEvening())}
        >
          Yesterday evening
        </button>
        <button
          className="preset-btn preset-btn-custom"
          onClick={onSelectCustom}
        >
          Custom...
        </button>
      </div>
      {patterns && (
        <div className="pattern-hint">
          Tip: You usually listen around {patterns.weekdayPattern.peakHour}:00 on weekday evenings
        </div>
      )}
    </div>
  );
}
```

### Phase 3E: Backfill Mode Dialog

**New Component:** `src/renderer/components/scrobble/BackfillDialog.tsx`

```typescript
interface BackfillDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialAlbums?: BackfillAlbum[];
}

export function BackfillDialog({ isOpen, onClose, initialAlbums = [] }: BackfillDialogProps) {
  const [albums, setAlbums] = useState<BackfillAlbum[]>(initialAlbums);
  const [suggestions, setSuggestions] = useState<BackfillSuggestion[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<number | 'custom'>(0);
  const [customStartTime, setCustomStartTime] = useState<string>('');
  const [customDate, setCustomDate] = useState<string>('');
  const [gapMinutes, setGapMinutes] = useState<number>(15);
  const [isLoading, setIsLoading] = useState(false);
  const [isScrobbling, setIsScrobbling] = useState(false);

  useEffect(() => {
    if (albums.length > 0) {
      fetchSuggestions();
    }
  }, [albums]);

  const fetchSuggestions = async () => {
    setIsLoading(true);
    try {
      const response = await api.post('/patterns/suggest', { albums });
      setSuggestions(response.data.data);
    } catch (error) {
      console.error('Failed to fetch suggestions', error);
    }
    setIsLoading(false);
  };

  const handleScrobbleAll = async () => {
    setIsScrobbling(true);
    try {
      const suggestion = selectedPreset === 'custom'
        ? { calculatedTimestamps: calculateCustomTimestamps(), isOutsideLastFmWindow: false }
        : suggestions[selectedPreset as number];

      if (!suggestion?.calculatedTimestamps) return;

      // Warn if outside Last.fm window
      if (suggestion.isOutsideLastFmWindow) {
        // Show confirmation dialog - scrobbles will be rejected
        const confirmed = await showConfirmDialog(
          'These scrobbles are outside Last.fm\'s 2-week window and will be rejected. Continue anyway?'
        );
        if (!confirmed) {
          setIsScrobbling(false);
          return;
        }
      }

      // Use existing batch scrobble endpoint: POST /api/v1/scrobble/batch
      // This endpoint already exists and handles album scrobbling with timestamps
      for (const ts of suggestion.calculatedTimestamps) {
        const album = albums[ts.albumIndex];
        // Fetch tracks for this album, then batch scrobble
        const tracks = await api.getAlbumTracks(album.releaseId);
        await api.scrobbleBatch({
          releaseId: album.releaseId,
          artist: album.artist,
          album: album.album,
          tracks: tracks.map((t, i) => ({
            ...t,
            // Distribute track timestamps across album duration
            timestamp: ts.startTimestamp + Math.floor((album.durationSeconds / tracks.length) * i),
          })),
        });
      }

      onClose();
    } catch (error) {
      console.error('Failed to scrobble', error);
    }
    setIsScrobbling(false);
  };

  // ... render logic with presets, preview, conflict warnings
}
```

### Phase 3F: Listening Queue Widget

**New Component:** `src/renderer/components/ListeningQueueWidget.tsx`

Sidebar-mounted widget for real-time session tracking.

---

## API Client Updates

**File:** `src/renderer/services/api.ts`

```typescript
// Pattern endpoints (new)
async getPatterns(): Promise<ListeningPatterns | null> {
  const response = await this.api.get('/patterns');
  return response.data.data;
}

/**
 * Get backfill timestamp suggestions for a list of albums
 * Uses POST because albums array can be large
 */
async suggestBackfillTimestamps(
  albums: BackfillAlbum[],
  options?: { targetDate?: string; timeOfDay?: string; customStartTime?: number }
): Promise<BackfillSuggestion[]> {
  const response = await this.api.post('/patterns/suggest', { albums, ...options });
  return response.data.data;
}

async checkConflicts(
  startTimestamp: number,
  endTimestamp: number
): Promise<{ hasConflicts: boolean; message?: string }> {
  const response = await this.api.post('/patterns/check-conflicts', {
    startTimestamp,
    endTimestamp,
  });
  return response.data.data;
}

// Note: Listening queue is localStorage-only (no backend endpoints)
// Use the useListeningQueue hook for queue operations

// Existing scrobble endpoint used by backfill:
// POST /api/v1/scrobble/batch - already exists, accepts tracks with timestamps
```

---

## Implementation Phases

### Phase 1: Pattern Learning (Backend Core)

**Deliverables:**
1. `ListeningPatterns` type in `types.ts`
2. `ListeningPatternService` with session detection and pattern calculation
3. `/api/v1/patterns` endpoint to retrieve patterns
4. `/api/v1/patterns/suggest` endpoint for timestamp suggestions
5. `/api/v1/patterns/check-conflicts` endpoint
6. Unit tests for pattern calculation logic
7. Integration tests for pattern routes

**Effort:** Medium
**Dependencies:** Existing `ScrobbleHistoryStorage`

### Phase 2: Quick Presets (Frontend Enhancement)

**Deliverables:**
1. `QuickTimePresets.tsx` component
2. Integration with existing `ScrobblePage.tsx`
3. Pattern display ("You usually listen at...")
4. CSS styles for preset buttons
5. Component tests

**Effort:** Low
**Dependencies:** Phase 1

### Phase 3: Backfill Mode (Full Feature)

**Deliverables:**
1. `BackfillDialog.tsx` component
2. Album queue management (add/remove/reorder)
3. Timestamp preview with calculations
4. Conflict detection and warnings
5. Batch scrobble submission
6. CSS styles for dialog
7. Component and integration tests

**Effort:** Medium-High
**Dependencies:** Phases 1-2

### Phase 4: Listening Queue (Optional Enhancement)

**Deliverables:**
1. `useListeningQueue.ts` hook (localStorage-based, frontend only)
2. `ListeningQueueWidget.tsx` sidebar component
3. Integration with existing scrobble batch endpoint
4. Component tests

**Note:** No backend changes needed - queue is transient frontend state.

**Effort:** Low-Medium
**Dependencies:** Phase 1 (for pattern-based defaults)

---

## Decisions Made

| Question | Decision | Rationale |
|----------|----------|-----------|
| Session gap threshold? | 60 minutes | Stricter than `getAlbumCompleteness()` (2hr) because we're detecting session start intent, not album completion. See "Session Detection Algorithm" section for full reasoning. |
| Pattern analysis window? | 6 months | Recent enough to reflect current habits, long enough for patterns |
| Cache TTL for patterns? | 7 days | Patterns change slowly; recalculate weekly |
| Default gap between albums? | 15 minutes | Accounts for break, bathroom, picking next album |
| Handle no pattern data? | Use sensible defaults (8 PM evenings) | Don't block feature if history is sparse |
| Last.fm timestamp constraint? | Filter and warn for presets > 14 days | Show "(outside Last.fm window)" in UI, sort valid presets first |
| Conflict resolution? | Show warning, let user decide | User knows their data best |
| API method for /suggest? | POST (not GET) | Albums array can be large; body is more appropriate than query params |
| Listening queue storage? | localStorage (frontend only) | Transient state, no need for backend persistence, survives page refresh |
| Conflict check performance? | Early pruning via lastPlayed | Skip albums with lastPlayed < window start; cap at 100 conflicts |
| Scrobble submission? | Use existing POST /api/v1/scrobble/batch | No new endpoint needed; existing endpoint accepts timestamps |

---

## Technical Considerations

### Last.fm API Constraints

- **Timestamp limit**: Scrobbles accepted up to 2 weeks in the past
- **Duplicate detection**: Same track + timestamp = rejected
- **Rate limit**: Standard Discogs/Last.fm rate limits apply

### Performance

| Concern | Mitigation |
|---------|------------|
| Pattern calculation is O(n) | Cache patterns for 7 days |
| Conflict check scans history | Only scan relevant time window |
| Large backfill batches | Process sequentially with progress |

### Edge Cases

| Case | Behavior |
|------|----------|
| No listening history | Return null patterns, use defaults |
| History < 30 days | Return patterns with low confidence note |
| Album duration unknown | Estimate 45 minutes per album |
| Backfill > 2 weeks ago | Warn user scrobbles will be rejected |
| Overlapping timestamps | Last.fm handles; we warn but allow |

---

## Test Checklist

### Backend Tests

- [ ] **ListeningPatternService**
  - [ ] Session detection with various gap sizes
  - [ ] Pattern calculation with mixed data
  - [ ] Handles empty history gracefully
  - [ ] Cache behavior (TTL, invalidation)
  - [ ] Timestamp suggestion accuracy
  - [ ] Conflict detection logic

- [ ] **Pattern Routes**
  - [ ] GET /patterns returns data or null
  - [ ] POST /suggest validates input
  - [ ] POST /check-conflicts validates timestamps
  - [ ] Error handling for all endpoints

### Frontend Tests

- [ ] **QuickTimePresets**
  - [ ] Renders all preset buttons
  - [ ] Calculates timestamps correctly
  - [ ] Shows pattern hint when available
  - [ ] Handles no patterns gracefully

- [ ] **BackfillDialog**
  - [ ] Album list management (add/remove)
  - [ ] Preset selection updates preview
  - [ ] Custom time input works
  - [ ] Conflict warning displays
  - [ ] Scrobble button enabled/disabled states

- [ ] **ListeningQueueWidget** (Phase 4)
  - [ ] Session start/end
  - [ ] Album lifecycle (added → playing → scrobbled)
  - [ ] Persists across page refreshes

---

## File Changes Summary

### New Files

- `src/backend/services/listeningPatternService.ts` - Pattern learning, suggestions, conflict detection
- `src/backend/routes/patterns.ts` - `/api/v1/patterns/*` endpoints
- `src/renderer/components/scrobble/QuickTimePresets.tsx` - Preset buttons for timestamp selection
- `src/renderer/components/scrobble/BackfillDialog.tsx` - Multi-album backfill UI
- `src/renderer/hooks/useListeningQueue.ts` (Phase 4) - localStorage-based queue state
- `src/renderer/components/ListeningQueueWidget.tsx` (Phase 4) - Sidebar queue widget
- `tests/backend/services/listeningPatternService.test.ts`
- `tests/backend/routes/patterns.test.ts`
- `tests/frontend/components/QuickTimePresets.test.tsx`
- `tests/frontend/components/BackfillDialog.test.tsx`
- `tests/frontend/hooks/useListeningQueue.test.tsx` (Phase 4)

### Modified Files

- `src/shared/types.ts` - Add `ListeningPatterns`, `BackfillSuggestion`, `BackfillAlbum`, `ListeningQueue`
- `src/server.ts` - Register `/api/v1/patterns` routes
- `src/renderer/services/api.ts` - Add pattern API methods (no queue endpoints - localStorage only)
- `src/renderer/pages/ScrobblePage.tsx` - Integrate quick presets, add backfill mode trigger
- `src/renderer/styles.css` - Add styles for new components

### No Changes Needed

- `src/backend/routes/scrobble.ts` - Existing `POST /batch` endpoint already supports timestamps
- Backend queue service - Not needed, queue is frontend-only localStorage

---

## Summary

Smart Scrobble Scheduling learns from your listening history to make backfilling scrobbles faster and more accurate. The core value is in the pattern learning (Phase 1) and quick presets (Phase 2), which provide immediate benefit with minimal UI changes. The full backfill dialog (Phase 3) enables power users to batch-scrobble multiple albums with realistic timestamps. The listening queue (Phase 4) is an optional enhancement for real-time tracking.

Key technical insight: By analyzing session boundaries in existing scrobble history, we can extract typical listening times, session durations, and gaps between albums - all without requiring the user to configure anything manually.
