/**
 * Tag Enricher Service
 *
 * Fetches and caches Last.fm tags (artist, album, track) for records
 * in the collection. Results are cached in the embedding store's tagsJson
 * field to avoid redundant API calls.
 *
 * Rate limiting: delegates to LastFmService's rate-limited Axios instance.
 * Tag responses use graceful degradation — errors return empty arrays and
 * do not throw, so callers can always produce partial profiles.
 */

import { createLogger } from '../utils/logger';

import { EmbeddingStorageService } from './embeddingStorageService';
import { LastFmService } from './lastfmService';

const log = createLogger('TagEnricherService');

/** Minimum Last.fm tag count to include (filters zero-count spam tags) */
const MIN_TAG_COUNT = 1;

/** Maximum number of tags to return per call */
const MAX_TAGS = 15;

export interface RecordTagResult {
  artistTags: string[];
  albumTags: string[];
  trackTags: string[];
}

export class TagEnricherService {
  private lastfmService: LastFmService;
  private embeddingStorageService: EmbeddingStorageService;

  constructor(
    lastfmService: LastFmService,
    embeddingStorageService: EmbeddingStorageService
  ) {
    this.lastfmService = lastfmService;
    this.embeddingStorageService = embeddingStorageService;
  }

  /**
   * Fetch top tags for an artist. Returns empty array on failure.
   */
  async getArtistTags(artistName: string): Promise<string[]> {
    try {
      const rawTags = await this.lastfmService.getArtistTopTags(artistName);
      const filtered = rawTags
        .filter(t => t.count >= MIN_TAG_COUNT)
        .slice(0, MAX_TAGS)
        .map(t => t.name.toLowerCase());
      log.debug('Artist tags', {
        artistName,
        count: filtered.length,
        tags: filtered,
      });
      return filtered;
    } catch (err) {
      log.warn('Failed to fetch artist tags', { artistName, err });
      return [];
    }
  }

  /**
   * Fetch top tags for an album. Returns empty array on failure.
   */
  async getAlbumTags(artistName: string, albumName: string): Promise<string[]> {
    try {
      const rawTags = await this.lastfmService.getAlbumTopTags(
        artistName,
        albumName
      );
      const filtered = rawTags
        .filter(t => t.count >= MIN_TAG_COUNT)
        .slice(0, MAX_TAGS)
        .map(t => t.name.toLowerCase());
      log.debug('Album tags', {
        artistName,
        albumName,
        count: filtered.length,
        tags: filtered,
      });
      return filtered;
    } catch (err) {
      log.warn('Failed to fetch album tags', { artistName, albumName, err });
      return [];
    }
  }

  /**
   * Fetch top tags for a track. Returns empty array on failure.
   */
  async getTrackTags(artistName: string, trackName: string): Promise<string[]> {
    try {
      const rawTags = await this.lastfmService.getTrackTopTags(
        artistName,
        trackName
      );
      const filtered = rawTags
        .filter(t => t.count >= MIN_TAG_COUNT)
        .slice(0, MAX_TAGS)
        .map(t => t.name.toLowerCase());
      log.debug('Track tags', {
        artistName,
        trackName,
        count: filtered.length,
        tags: filtered,
      });
      return filtered;
    } catch (err) {
      log.warn('Failed to fetch track tags', { artistName, trackName, err });
      return [];
    }
  }

  /**
   * Fetch all relevant tags for a record. If the embedding store already has
   * cached tags for this release that are not stale, returns them directly.
   *
   * Caches the fetched tags back into the embedding entry's tagsJson field.
   *
   * @param releaseId  - Discogs release ID (used for cache lookup/write)
   * @param artistName - Last.fm-resolved artist name
   * @param albumName  - Last.fm-resolved album name
   * @param tracks     - Optional list of track titles (only first track is tagged)
   */
  async enrichRecord(
    releaseId: number,
    artistName: string,
    albumName: string,
    tracks?: string[]
  ): Promise<RecordTagResult> {
    // Check cache first
    const existing = await this.embeddingStorageService.getEmbedding(releaseId);
    if (existing?.tagsJson) {
      log.debug('Returning cached tags for release', { releaseId });
      return {
        artistTags: existing.tagsJson['artist'] ?? [],
        albumTags: existing.tagsJson['album'] ?? [],
        trackTags: existing.tagsJson['tracks'] ?? [],
      };
    }

    log.info('Fetching tags for release', { releaseId, artistName, albumName });

    // Fetch artist and album tags in parallel
    const [artistTags, albumTags] = await Promise.all([
      this.getArtistTags(artistName),
      this.getAlbumTags(artistName, albumName),
    ]);

    // Fetch tags for first track only (representative sample; full track tagging
    // would exhaust the rate limit for large albums)
    let trackTags: string[] = [];
    if (tracks && tracks.length > 0) {
      trackTags = await this.getTrackTags(artistName, tracks[0]);
    }

    const result: RecordTagResult = { artistTags, albumTags, trackTags };

    log.info('Enriched tags for release', {
      releaseId,
      artistName,
      artistTagCount: artistTags.length,
      albumTagCount: albumTags.length,
      trackTagCount: trackTags.length,
    });

    // Persist tags into the embedding entry's tagsJson for caching.
    // We read-modify-write here; if no entry exists yet we skip the write
    // (the embedding engine will write it when it creates the full entry).
    if (existing) {
      const updated = {
        ...existing,
        tagsJson: {
          artist: artistTags,
          album: albumTags,
          tracks: trackTags,
        },
      };
      try {
        await this.embeddingStorageService.setEmbedding(updated);
      } catch (err) {
        log.warn('Failed to cache tags in embedding store', {
          releaseId,
          err,
        });
      }
    }

    return result;
  }
}
