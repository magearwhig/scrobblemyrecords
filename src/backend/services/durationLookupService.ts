import { DiscogsRelease, DurationLookupResult } from '../../shared/types';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

import { DiscogsService } from './discogsService';
import { LastFmService } from './lastfmService';

export class DurationLookupService {
  private fileStorage: FileStorage;
  private lastfmService: LastFmService;
  private discogsService: DiscogsService;
  private logger = createLogger('DurationLookupService');

  constructor(
    fileStorage: FileStorage,
    lastfmService: LastFmService,
    discogsService: DiscogsService
  ) {
    this.fileStorage = fileStorage;
    this.lastfmService = lastfmService;
    this.discogsService = discogsService;
  }

  /**
   * Look up the duration of a track using a multi-source chain.
   * Short-circuits on the first source that returns a valid duration.
   *
   * Chain: Discogs collection cache → Last.fm track.getInfo → not_found
   *
   * @param artist - Artist name
   * @param track - Track name
   * @param album - Optional album name (unused currently, reserved for future refinement)
   * @returns Duration in seconds with source, or null duration if not found
   */
  async lookupDuration(
    artist: string,
    track: string,
    album?: string
  ): Promise<DurationLookupResult> {
    this.logger.debug('Starting duration lookup', { artist, track, album });

    // Step 1: Discogs collection cache
    const discogsDuration = await this.lookupFromDiscogsCollection(
      artist,
      track
    );
    if (discogsDuration !== null) {
      this.logger.debug('Found duration in Discogs collection', {
        artist,
        track,
        duration: discogsDuration,
      });
      return {
        artist,
        track,
        duration: discogsDuration,
        source: 'discogs_collection',
      };
    }

    // Step 2: Last.fm track.getInfo
    const lastfmDuration = await this.lookupFromLastfm(artist, track);
    if (lastfmDuration !== null) {
      this.logger.debug('Found duration via Last.fm', {
        artist,
        track,
        duration: lastfmDuration,
      });
      return { artist, track, duration: lastfmDuration, source: 'lastfm' };
    }

    // Step 3: Discogs API search — skipped (discogsService doesn't expose
    // a database search method that returns tracklists with durations)

    // Step 4: Not found
    this.logger.debug('Duration not found for track', { artist, track });
    return { artist, track, duration: null, source: 'not_found' };
  }

  /**
   * Search cached Discogs release files for a matching artist + track.
   * Parses duration from the "MM:SS" format used by Discogs.
   *
   * @returns Duration in seconds, or null if not found
   */
  private async lookupFromDiscogsCollection(
    artist: string,
    track: string
  ): Promise<number | null> {
    try {
      const files = await this.fileStorage.listFiles('collections');
      const releaseFiles = files.filter(
        f => f.startsWith('release-') && f.endsWith('.json')
      );

      this.logger.debug(`Scanning ${releaseFiles.length} cached release files`);

      const lowerArtist = artist.toLowerCase();
      const lowerTrack = track.toLowerCase();

      for (const file of releaseFiles) {
        const release = await this.fileStorage.readJSON<DiscogsRelease>(
          `collections/${file}`
        );
        if (!release || !release.tracklist) {
          continue;
        }

        const releaseArtist = release.artist.toLowerCase();
        if (releaseArtist !== lowerArtist) {
          continue;
        }

        for (const t of release.tracklist) {
          if (t.title.toLowerCase() === lowerTrack) {
            const seconds = this.parseTrackDuration(t.duration);
            if (seconds !== null && seconds > 0) {
              return seconds;
            }
          }
        }
      }

      return null;
    } catch {
      this.logger.debug('Error searching Discogs collection cache', {
        artist,
        track,
      });
      return null;
    }
  }

  /**
   * Look up track duration from Last.fm track.getInfo API.
   *
   * @returns Duration in seconds, or null if not found or zero
   */
  private async lookupFromLastfm(
    artist: string,
    track: string
  ): Promise<number | null> {
    try {
      const info = await this.lastfmService.getTrackInfo(artist, track);
      if (!info) {
        return null;
      }

      // Last.fm returns duration in ms; convert to seconds
      const seconds = Math.round(info.duration / 1000);
      if (seconds <= 0) {
        return null;
      }

      return seconds;
    } catch {
      this.logger.debug('Error looking up duration from Last.fm', {
        artist,
        track,
      });
      return null;
    }
  }

  /**
   * Parse a Discogs-style duration string ("MM:SS" or "H:MM:SS") into seconds.
   * Returns null for empty, missing, or "0:00" durations.
   */
  private parseTrackDuration(duration?: string): number | null {
    if (!duration || duration.trim() === '') {
      return null;
    }

    const parts = duration.trim().split(':');
    if (parts.length < 2 || parts.length > 3) {
      return null;
    }

    let totalSeconds: number;

    if (parts.length === 3) {
      // H:MM:SS
      const hours = parseInt(parts[0], 10);
      const minutes = parseInt(parts[1], 10);
      const seconds = parseInt(parts[2], 10);
      if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) {
        return null;
      }
      totalSeconds = hours * 3600 + minutes * 60 + seconds;
    } else {
      // MM:SS
      const minutes = parseInt(parts[0], 10);
      const seconds = parseInt(parts[1], 10);
      if (isNaN(minutes) || isNaN(seconds)) {
        return null;
      }
      totalSeconds = minutes * 60 + seconds;
    }

    // Treat 0 as "not found"
    return totalSeconds > 0 ? totalSeconds : null;
  }
}
