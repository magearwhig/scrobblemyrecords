/**
 * Artist Similarity Enricher Service
 *
 * Fetches and caches artist.getSimilar data from Last.fm.
 * Uses ArtistSimilarityStorageService for persistence and staleness checks.
 *
 * Rate limiting: delegates to LastFmService's rate-limited Axios instance.
 * Errors return empty arrays — callers must handle missing similarity gracefully.
 */

import { ArtistSimilarityEntry } from '../../shared/types';
import { createLogger } from '../utils/logger';

import { ArtistSimilarityStorageService } from './artistSimilarityStorageService';
import { LastFmService } from './lastfmService';

const log = createLogger('ArtistSimilarityEnricherService');

/** Default cache TTL in days */
const DEFAULT_MAX_AGE_DAYS = 30;

export class ArtistSimilarityEnricherService {
  private lastfmService: LastFmService;
  private artistSimilarityStorageService: ArtistSimilarityStorageService;

  constructor(
    lastfmService: LastFmService,
    artistSimilarityStorageService: ArtistSimilarityStorageService
  ) {
    this.lastfmService = lastfmService;
    this.artistSimilarityStorageService = artistSimilarityStorageService;
  }

  /**
   * Get similar artists for a given artist name.
   *
   * Checks the cache first. If the cached data is stale (older than
   * maxAgeDays) or missing, fetches fresh data from Last.fm and
   * caches the result.
   *
   * @param artistName  - The artist to look up
   * @param maxAgeDays  - Cache TTL in days (default 30)
   * @returns Array of ArtistSimilarityEntry, empty on failure
   */
  async getSimilarArtists(
    artistName: string,
    maxAgeDays: number = DEFAULT_MAX_AGE_DAYS
  ): Promise<ArtistSimilarityEntry[]> {
    const isStale = await this.artistSimilarityStorageService.isStale(
      artistName,
      maxAgeDays
    );

    if (!isStale) {
      const cached =
        await this.artistSimilarityStorageService.getSimilarArtists(artistName);
      log.debug('Returning cached similar artists', {
        artistName,
        count: cached.length,
      });
      return cached;
    }

    log.info('Fetching similar artists from Last.fm', { artistName });

    try {
      const rawSimilar = await this.lastfmService.getSimilarArtists(artistName);

      if (rawSimilar.length === 0) {
        log.debug('No similar artists returned from Last.fm', { artistName });
        return [];
      }

      const now = Date.now();
      const entries: ArtistSimilarityEntry[] = rawSimilar.map(s => ({
        artistName,
        similarArtistName: s.name,
        matchScore: s.match,
        lastFetchedAt: now,
      }));

      await this.artistSimilarityStorageService.setSimilarArtists(
        artistName,
        entries
      );

      log.info('Cached similar artists', {
        artistName,
        count: entries.length,
      });

      return entries;
    } catch (err) {
      log.warn('Failed to fetch similar artists from Last.fm', {
        artistName,
        err,
      });
      return [];
    }
  }

  /**
   * Given an artist and the full list of artists in the user's collection,
   * returns which collection artists are similar to the given artist
   * (as reported by Last.fm).
   *
   * Comparison is case-insensitive.
   *
   * @param artistName       - Artist to find similarities for
   * @param collectionArtists - All artists present in the Discogs collection
   * @returns Names of collection artists that are similar, in match-score order
   */
  async findSimilarInCollection(
    artistName: string,
    collectionArtists: string[]
  ): Promise<string[]> {
    const similar = await this.getSimilarArtists(artistName);
    if (similar.length === 0) {
      return [];
    }

    const collectionSet = new Set(
      collectionArtists.map(a => a.toLowerCase().trim())
    );

    return similar
      .filter(s => collectionSet.has(s.similarArtistName.toLowerCase().trim()))
      .sort((a, b) => b.matchScore - a.matchScore)
      .map(s => s.similarArtistName);
  }
}
