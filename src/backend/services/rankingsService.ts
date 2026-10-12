import { AlbumMapping } from '../../shared/types';
import {
  createAlbumCanonicalizer,
  stripDiscogsSuffix,
} from '../../shared/utils/albumMapping';
import {
  albumFromAlbumKey,
  artistFromAlbumKey,
  UNKNOWN_ALBUM_LABEL,
} from '../utils/historyPlays';
import { createLogger } from '../utils/logger';

import { ArtistNameResolver } from './artistNameResolver';
import { loadAlbumMappings } from './mergedAlbumHistory';
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
  private mappingService: {
    getAllAlbumMappings(): Promise<AlbumMapping[]>;
  } | null = null;
  private artistNameResolver: Pick<ArtistNameResolver, 'resolveArtist'> | null =
    null;
  private logger = createLogger('RankingsService');

  constructor(historyStorage: ScrobbleHistoryStorage) {
    this.historyStorage = historyStorage;
  }

  /** Optional: album rankings group spellings of one artist (see ArtistNameResolver). */
  setArtistNameResolver(
    resolver: Pick<ArtistNameResolver, 'resolveArtist'>
  ): void {
    this.artistNameResolver = resolver;
  }

  /** Optional: album rankings count versions merged by album mappings as one album. */
  setMappingService(service: {
    getAllAlbumMappings(): Promise<AlbumMapping[]>;
  }): void {
    this.mappingService = service;
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
      albumArtist: string;
      /** null for unresolved (albumless) plays: never ranked as an album */
      albumKey: string | null;
      track?: string;
    }> = [];

    const resolver = this.artistNameResolver;
    const canonicalize = createAlbumCanonicalizer(
      await loadAlbumMappings(this.mappingService),
      resolver ? name => resolver.resolveArtist(name) : undefined
    );

    for (const [albumKey, albumEntry] of Object.entries(index.albums)) {
      const artist = artistFromAlbumKey(albumKey);
      const historyAlbum = albumFromAlbumKey(albumKey);
      // Merged versions share the canonical album and its artist (index keys
      // are lowercase); artist rankings still use the scrobble's own artist
      const canonical = canonicalize(artist, historyAlbum);
      const album = canonical.mapping
        ? canonical.album.toLowerCase()
        : historyAlbum;
      const albumArtist = canonical.mapping
        ? stripDiscogsSuffix(canonical.artist).toLowerCase()
        : artist;
      for (const play of albumEntry.plays) {
        // Convert timestamp from seconds to milliseconds
        const timestampMs = play.timestamp * 1000;

        // If no filter, include all scrobbles; otherwise apply date filter
        if (!useFilter || (timestampMs >= start && timestampMs <= end)) {
          scrobbles.push({
            timestamp: timestampMs,
            artist,
            album,
            albumArtist,
            albumKey: canonical.key,
            track: play.track,
          });
        }
      }
    }

    // Unresolved plays count for artist and track rankings. Track rankings
    // key on artist|track, so they merge with album plays of the same track.
    // Album rankings leave them out entirely, so they cannot even add a
    // snapshot month (calculateRankings also skips a null albumKey).
    const unresolvedEntries =
      type === 'albums' ? [] : Object.entries(index.unresolved ?? {});
    for (const [artist, entry] of unresolvedEntries) {
      for (const play of entry.plays) {
        const timestampMs = play.timestamp * 1000;
        if (!useFilter || (timestampMs >= start && timestampMs <= end)) {
          scrobbles.push({
            timestamp: timestampMs,
            artist,
            album: UNKNOWN_ALBUM_LABEL,
            albumArtist: artist,
            albumKey: null,
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
      albumArtist: string;
      albumKey: string | null;
      track?: string;
    }>,
    type: RankingType,
    topN: number
  ): RankingItem[] {
    const counts = new Map<
      string,
      { count: number; name: string; artist?: string }
    >();

    for (const scrobble of scrobbles) {
      let key: string;
      let name: string;
      let artist: string | undefined;

      switch (type) {
        case 'tracks':
          if (!scrobble.track) continue;
          key = `${scrobble.artist}|${scrobble.track}`;
          name = scrobble.track;
          artist = scrobble.artist;
          break;
        case 'artists':
          key = scrobble.artist;
          name = scrobble.artist;
          break;
        case 'albums':
          // Unresolved plays have no album to rank
          if (scrobble.albumKey === null) continue;
          // Group spelling variants together; show the first name seen
          key = scrobble.albumKey;
          name = scrobble.album;
          artist = scrobble.albumArtist;
          break;
      }

      const existing = counts.get(key);
      if (existing) {
        existing.count++;
      } else {
        counts.set(key, { count: 1, name, artist });
      }
    }

    // Sort by count and take top N
    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, topN);

    return sorted.map(([, data], index) => ({
      name: data.name,
      artist: data.artist,
      count: data.count,
      rank: index + 1,
    }));
  }
}
