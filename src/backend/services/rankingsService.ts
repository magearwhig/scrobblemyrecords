import { createLogger } from '../utils/logger';

import { ScrobbleHistoryStorage } from './scrobbleHistoryStorage';

export type RankingType = 'tracks' | 'artists' | 'albums';

export interface RankingItem {
  name: string; // track, artist, or album name
  artist?: string; // for tracks and albums
  count: number;
  rank: number;
}

export interface RankingSnapshot {
  period: string; // YYYY-MM format
  timestamp: number; // month start timestamp
  rankings: RankingItem[];
}

export interface RankingsOverTimeResponse {
  snapshots: RankingSnapshot[];
  type: RankingType;
  topN: number;
}

/**
 * Service for calculating ranking snapshots over time.
 * Processes scrobble history to show how top tracks/artists/albums change monthly.
 */
export class RankingsService {
  private historyStorage: ScrobbleHistoryStorage;
  private logger = createLogger('RankingsService');

  constructor(historyStorage: ScrobbleHistoryStorage) {
    this.historyStorage = historyStorage;
  }

  /**
   * Calculate rankings over time for tracks, artists, or albums.
   * Returns monthly snapshots showing top N items.
   */
  async getRankingsOverTime(
    type: RankingType,
    topN: number = 10,
    startDate?: number,
    endDate?: number
  ): Promise<RankingsOverTimeResponse> {
    const index = await this.historyStorage.getIndex();
    if (!index) {
      return { snapshots: [], type, topN };
    }

    // Determine date range
    // If no dates provided, get ALL scrobbles (true all-time)
    const useFilter = startDate !== undefined || endDate !== undefined;
    const now = Date.now();
    const start = startDate !== undefined ? startDate : 0;
    const end = endDate !== undefined ? endDate : now;

    // Collect all scrobbles with timestamps
    const scrobbles: Array<{
      timestamp: number;
      artist: string;
      album: string;
      track?: string;
    }> = [];

    for (const [albumKey, albumEntry] of Object.entries(index.albums)) {
      const [artist, album] = albumKey.split('|');
      for (const play of albumEntry.plays) {
        // Convert timestamp from seconds to milliseconds
        const timestampMs = play.timestamp * 1000;

        // If no filter, include all scrobbles; otherwise apply date filter
        if (!useFilter || (timestampMs >= start && timestampMs <= end)) {
          scrobbles.push({
            timestamp: timestampMs,
            artist,
            album,
            track: play.track,
          });
        }
      }
    }

    // Sort by timestamp
    scrobbles.sort((a, b) => a.timestamp - b.timestamp);

    if (scrobbles.length === 0) {
      return { snapshots: [], type, topN };
    }

    // Generate monthly snapshots
    const snapshots: RankingSnapshot[] = [];
    const firstScrobbleDate = new Date(scrobbles[0].timestamp);
    const lastScrobbleDate = new Date(
      scrobbles[scrobbles.length - 1].timestamp
    );

    // Start from the beginning of the first month with scrobbles
    let currentDate = new Date(
      firstScrobbleDate.getFullYear(),
      firstScrobbleDate.getMonth(),
      1
    );
    const endMonth = new Date(
      lastScrobbleDate.getFullYear(),
      lastScrobbleDate.getMonth(),
      1
    );

    while (currentDate <= endMonth) {
      const monthStart = currentDate.getTime();
      const monthEnd = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        0,
        23,
        59,
        59,
        999
      ).getTime();

      // Get scrobbles up to end of this month (cumulative)
      const scrobblesUpToMonth = scrobbles.filter(s => s.timestamp <= monthEnd);

      if (scrobblesUpToMonth.length > 0) {
        const rankings = this.calculateRankings(scrobblesUpToMonth, type, topN);

        snapshots.push({
          period: `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`,
          timestamp: monthStart,
          rankings,
        });
      }

      // Move to next month
      currentDate = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        1
      );
    }

    return { snapshots, type, topN };
  }

  /**
   * Calculate rankings from a set of scrobbles
   */
  private calculateRankings(
    scrobbles: Array<{
      timestamp: number;
      artist: string;
      album: string;
      track?: string;
    }>,
    type: RankingType,
    topN: number
  ): RankingItem[] {
    const counts = new Map<string, { count: number; artist?: string }>();

    for (const scrobble of scrobbles) {
      let key: string;
      let artist: string | undefined;

      switch (type) {
        case 'tracks':
          if (!scrobble.track) continue;
          key = `${scrobble.artist}|${scrobble.track}`;
          artist = scrobble.artist;
          break;
        case 'artists':
          key = scrobble.artist;
          break;
        case 'albums':
          key = `${scrobble.artist}|${scrobble.album}`;
          artist = scrobble.artist;
          break;
      }

      const existing = counts.get(key);
      if (existing) {
        existing.count++;
      } else {
        counts.set(key, { count: 1, artist });
      }
    }

    // Sort by count and take top N
    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, topN);

    return sorted.map(([name, data], index) => ({
      name: type === 'tracks' || type === 'albums' ? name.split('|')[1] : name,
      artist: data.artist,
      count: data.count,
      rank: index + 1,
    }));
  }
}
