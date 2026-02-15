import {
  ArtistTagsCacheStore,
  GenreData,
  GenreDistributionResult,
} from '../../shared/types';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

import { LastFmService } from './lastfmService';
import { ScrobbleHistoryStorage } from './scrobbleHistoryStorage';

const CACHE_FILE = 'cache/artist-tags.json';
const CACHE_ENTRY_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const FETCH_DELAY_MS = 200; // delay between Last.fm API calls

/**
 * Tags to exclude from genre analysis. Last.fm tags are user-generated and
 * often include non-genre metadata. These fall into several categories:
 * - Listening context: 'seen live'
 * - User curation: 'favorites', 'my favorites', 'check out', 'albums i own'
 * - Popularity metrics: 'under 2000 listeners'
 * - Subjective qualities: 'beautiful', 'awesome', 'love', 'classic'
 * - Physical formats / platforms: 'vinyl', 'spotify'
 * - Demographics: 'female vocalists', 'male vocalists'
 * - Geographic origins: 'british', 'american', 'canadian', 'australian'
 * - Decade tags: '60s'-'90s' (too broad, overlap with actual genre tags)
 */
const TAG_BLOCKLIST = new Set([
  'seen live',
  'favorites',
  'my favorites',
  'check out',
  'under 2000 listeners',
  'beautiful',
  'awesome',
  'love',
  'classic',
  'albums i own',
  'vinyl',
  'spotify',
  'female vocalists',
  'male vocalists',
  'british',
  'american',
  'canadian',
  'australian',
  '90s',
  '80s',
  '70s',
  '60s',
]);

/** Common tag variants that should be merged */
const TAG_MERGES: Record<string, string> = {
  'hip hop': 'hip-hop',
  'hip hop/rap': 'hip-hop',
  'trip hop': 'trip-hop',
  'post rock': 'post-rock',
  'post punk': 'post-punk',
  'synth pop': 'synthpop',
  'synth-pop': 'synthpop',
  'electro pop': 'electropop',
  'electro-pop': 'electropop',
  'indie pop': 'indie pop',
  'indie rock': 'indie rock',
  rnb: 'r&b',
  'r and b': 'r&b',
  'rhythm and blues': 'r&b',
  'lo fi': 'lo-fi',
  shoegaze: 'shoegaze',
  'dream pop': 'dream pop',
};

/**
 * Service for analyzing genre distribution based on Last.fm artist tags.
 *
 * Algorithm overview:
 * 1. Identifies the user's top artists by scrobble play count
 * 2. Fetches each artist's tags from Last.fm (artist.getTopTags API)
 * 3. Filters, normalizes, and merges tags into canonical genre names
 * 4. Weights each genre by artist play proportion * tag relevance score
 * 5. Normalizes final weights to sum to 1.0
 *
 * Rate limiting: Inserts a 200ms delay between Last.fm API calls to stay
 * well within Last.fm's rate limits (5 requests/second).
 *
 * Caching: Artist tags are cached on disk with a 30-day TTL per entry.
 * After initial population, subsequent calls are mostly cache hits.
 */
export class GenreAnalysisService {
  private lastFmService: LastFmService;
  private historyStorage: ScrobbleHistoryStorage;
  private fileStorage: FileStorage;
  private logger = createLogger('GenreAnalysisService');

  constructor(
    lastFmService: LastFmService,
    historyStorage: ScrobbleHistoryStorage,
    fileStorage: FileStorage
  ) {
    this.lastFmService = lastFmService;
    this.historyStorage = historyStorage;
    this.fileStorage = fileStorage;
  }

  /**
   * Get genre distribution based on top artists' Last.fm tags.
   *
   * Weight calculation for each genre tag:
   *   tagWeight = (artistPlays / totalPlays) * (tag.count / 100)
   * where tag.count is Last.fm's 0-100 relevance score for that tag on the artist.
   * Tags with count < 20 are excluded as noise. Final weights are normalized
   * so the returned genres sum to 1.0.
   *
   * @param topArtistLimit - Number of top artists to analyze (default: 50)
   * @param maxGenres - Maximum genres to return (default: 10)
   * @returns Genre entries with normalized weights, count of artists analyzed, and timestamp
   */
  async getGenreDistribution(
    topArtistLimit: number = 50,
    maxGenres: number = 10
  ): Promise<GenreDistributionResult> {
    // Get top artists by play count from history
    const index = await this.historyStorage.getIndex();
    if (!index) {
      return {
        genres: [],
        totalArtistsAnalyzed: 0,
        lastUpdated: Date.now(),
      };
    }

    // Count plays per artist
    const artistPlays = new Map<string, number>();
    let totalPlays = 0;

    for (const [key, albumHistory] of Object.entries(index.albums)) {
      const [artist] = key.split('|');
      const normalizedArtist = artist.toLowerCase();
      artistPlays.set(
        normalizedArtist,
        (artistPlays.get(normalizedArtist) || 0) + albumHistory.playCount
      );
      totalPlays += albumHistory.playCount;
    }

    if (totalPlays === 0) {
      return {
        genres: [],
        totalArtistsAnalyzed: 0,
        lastUpdated: Date.now(),
      };
    }

    // Sort by play count, take top N
    const topArtists = Array.from(artistPlays.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topArtistLimit);

    // Load tag cache
    const cache = await this.loadTagCache();
    const now = Date.now();
    let cacheUpdated = false;

    // Genre accumulation: tag -> { rawWeight, artistCount }
    const genreWeights = new Map<
      string,
      { rawWeight: number; artistCount: number }
    >();
    let artistsWithTags = 0;

    for (const [artist, plays] of topArtists) {
      // Try cache first
      let tags: Array<{ name: string; count: number }> | null = null;
      const cached = cache.tags[artist];

      if (cached && now - cached.fetchedAt < CACHE_ENTRY_TTL_MS) {
        tags = cached.tags;
      } else {
        // Fetch from Last.fm with delay between requests
        try {
          if (cacheUpdated) {
            // Only delay after the first fetch (not before the first one)
            await new Promise(resolve => setTimeout(resolve, FETCH_DELAY_MS));
          }
          tags = await this.lastFmService.getArtistTopTags(artist);
          cache.tags[artist] = { tags, fetchedAt: now };
          cacheUpdated = true;
        } catch {
          this.logger.warn('Failed to fetch tags for artist, skipping', {
            artist,
          });
          continue;
        }
      }

      if (!tags || tags.length === 0) continue;
      artistsWithTags++;

      const artistWeight = plays / totalPlays;

      for (const tag of tags) {
        // Filter low-count tags
        if (tag.count < 20) continue;

        const normalizedTag = this.normalizeTag(tag.name);
        if (!normalizedTag) continue; // Blocked or empty

        const tagWeight = artistWeight * (tag.count / 100);
        const existing = genreWeights.get(normalizedTag);
        if (existing) {
          existing.rawWeight += tagWeight;
          existing.artistCount++;
        } else {
          genreWeights.set(normalizedTag, {
            rawWeight: tagWeight,
            artistCount: 1,
          });
        }
      }
    }

    // Save updated cache
    if (cacheUpdated) {
      await this.saveTagCache(cache);
    }

    // Sort by weight, take top maxGenres
    const sortedGenres = Array.from(genreWeights.entries())
      .sort((a, b) => b[1].rawWeight - a[1].rawWeight)
      .slice(0, maxGenres);

    // Normalize weights so the returned genres sum to 1.0.
    // Round to 3 decimal places (e.g., 0.234) to avoid floating-point noise
    // while preserving enough precision for proportional UI rendering.
    const totalWeight = sortedGenres.reduce((s, g) => s + g[1].rawWeight, 0);

    const genres: GenreData[] = sortedGenres.map(([name, data]) => ({
      name,
      weight:
        totalWeight > 0
          ? Math.round((data.rawWeight / totalWeight) * 1000) / 1000
          : 0,
      artistCount: data.artistCount,
    }));

    return {
      genres,
      totalArtistsAnalyzed: artistsWithTags,
      lastUpdated: Date.now(),
    };
  }

  /**
   * Normalize a tag name: lowercase, trim, merge variants, check blocklist.
   * Returns null if the tag should be filtered out.
   */
  private normalizeTag(tag: string): string | null {
    let normalized = tag.toLowerCase().trim();

    if (TAG_BLOCKLIST.has(normalized)) return null;
    if (normalized.length === 0) return null;

    // Check merges
    if (TAG_MERGES[normalized]) {
      normalized = TAG_MERGES[normalized];
    }

    return normalized;
  }

  private async loadTagCache(): Promise<ArtistTagsCacheStore> {
    try {
      const data =
        await this.fileStorage.readJSON<ArtistTagsCacheStore>(CACHE_FILE);
      if (data && data.tags) {
        return data;
      }
    } catch {
      // Cache doesn't exist yet
    }
    return { schemaVersion: 1, tags: {} };
  }

  private async saveTagCache(cache: ArtistTagsCacheStore): Promise<void> {
    try {
      await this.fileStorage.writeJSONWithBackup(CACHE_FILE, cache);
    } catch (error) {
      this.logger.error('Failed to save artist tags cache', error);
    }
  }
}
