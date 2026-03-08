/**
 * MusicBrainz Genre Enricher Service
 *
 * Fetches genre data from MusicBrainz for artists that have confirmed MBID mappings.
 * Caches results to avoid repeated API calls during rebuilds.
 */

import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

import { MusicBrainzService } from './musicbrainzService';
import { ReleaseTrackingService } from './releaseTrackingService';

const log = createLogger('MusicBrainzGenreEnricherService');

const CACHE_FILE = 'embeddings/mb-artist-genres.json';
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface ArtistGenreCache {
  [normalizedArtistName: string]: {
    genres: string[];
    fetchedAt: number;
  };
}

export class MusicBrainzGenreEnricherService {
  private musicBrainzService: MusicBrainzService;
  private releaseTrackingService: ReleaseTrackingService;
  private fileStorage: FileStorage;
  private cache: ArtistGenreCache | null = null;

  constructor(
    musicBrainzService: MusicBrainzService,
    releaseTrackingService: ReleaseTrackingService,
    fileStorage: FileStorage
  ) {
    this.musicBrainzService = musicBrainzService;
    this.releaseTrackingService = releaseTrackingService;
    this.fileStorage = fileStorage;
  }

  private async loadCache(): Promise<ArtistGenreCache> {
    if (this.cache) return this.cache;
    this.cache =
      (await this.fileStorage.readJSON<ArtistGenreCache>(CACHE_FILE)) ?? {};
    return this.cache;
  }

  private async saveCache(): Promise<void> {
    if (this.cache) {
      await this.fileStorage.writeJSON(CACHE_FILE, this.cache);
    }
  }

  /**
   * Get MusicBrainz genres for an artist.
   * Looks up the artist's MBID from the release tracking mappings,
   * then fetches genres from MusicBrainz (with caching).
   */
  async getArtistGenres(artistName: string): Promise<string[]> {
    const cache = await this.loadCache();
    const normalized = artistName.toLowerCase().trim();

    // Check cache freshness
    const cached = cache[normalized];
    if (cached && Date.now() - cached.fetchedAt < CACHE_MAX_AGE_MS) {
      return cached.genres;
    }

    // Look up MBID from existing artist mappings
    const mapping =
      await this.releaseTrackingService.findArtistMapping(artistName);
    if (!mapping || !mapping.mbid) {
      cache[normalized] = { genres: [], fetchedAt: Date.now() };
      return [];
    }

    try {
      const genres = await this.musicBrainzService.getArtistGenres(
        mapping.mbid
      );
      cache[normalized] = { genres, fetchedAt: Date.now() };
      await this.saveCache();
      return genres;
    } catch (err) {
      log.warn('Failed to fetch MB genres for artist', { artistName, err });
      cache[normalized] = { genres: [], fetchedAt: Date.now() };
      return [];
    }
  }

  /**
   * Pre-warm the genre cache for a batch of artists.
   * Used during embedding rebuilds to batch-fetch all artist genres.
   */
  async enrichBatch(
    artistNames: string[],
    onProgress?: (current: number, total: number) => void
  ): Promise<void> {
    const cache = await this.loadCache();

    // Filter to artists that need fetching
    const needsFetch = artistNames.filter(name => {
      const normalized = name.toLowerCase().trim();
      const cached = cache[normalized];
      return !cached || Date.now() - cached.fetchedAt >= CACHE_MAX_AGE_MS;
    });

    log.info(
      `Pre-warming MB genres for ${needsFetch.length}/${artistNames.length} artists`
    );

    for (let i = 0; i < needsFetch.length; i++) {
      onProgress?.(i + 1, needsFetch.length);
      await this.getArtistGenres(needsFetch[i]);
    }

    log.info('MusicBrainz genre enrichment complete');
  }
}
