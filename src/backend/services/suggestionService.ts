import {
  CollectionItem,
  SuggestionFactors,
  SuggestionWeights,
  SuggestionResult,
  SuggestionSettings,
} from '../../shared/types';
import { createLogger } from '../utils/logger';

import { AnalyticsService } from './analyticsService';
import { ScrobbleHistoryStorage } from './scrobbleHistoryStorage';

/**
 * Default weights for suggestion factors.
 * These can be customized by users.
 */
export const DEFAULT_WEIGHTS: SuggestionWeights = {
  recencyGap: 1.0, // Strong - encourages rediscovery
  neverPlayed: 1.5, // Very strong - encourage discovery
  recentAddition: 0.8, // Medium - new records are exciting
  artistAffinity: 0.6, // Medium - familiar but not dominant
  eraPreference: 0.3, // Low - subtle preference
  userRating: 1.2, // Strong when available
  timeOfDay: 0.2, // Low - subtle contextual signal
  diversityPenalty: 0.5, // Medium penalty for repetition
  albumCompleteness: 0.4, // Low-Medium - quality indicator
};

/**
 * Service for generating intelligent album suggestions
 * based on multiple weighted factors.
 */
export class SuggestionService {
  private analyticsService: AnalyticsService;
  private historyStorage: ScrobbleHistoryStorage;
  private logger = createLogger('SuggestionService');

  // Track recently suggested albums to avoid repetition
  private recentSuggestions: Map<number, number> = new Map(); // albumId -> timestamp
  private readonly SUGGESTION_MEMORY_TTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor(
    analyticsService: AnalyticsService,
    historyStorage: ScrobbleHistoryStorage
  ) {
    this.analyticsService = analyticsService;
    this.historyStorage = historyStorage;
  }

  /**
   * Calculate all suggestion factors for a single album
   */
  async calculateFactors(album: CollectionItem): Promise<SuggestionFactors> {
    const artist = album.release.artist;
    const title = album.release.title;

    // Get album history from local index with fuzzy matching
    // This allows "Shame Shame" to match "Shame Shame (Deluxe Edition)"
    const historyResult = await this.historyStorage.getAlbumHistoryFuzzy(
      artist,
      title
    );

    // Calculate recency gap (days since last played)
    let recencyGap = Infinity;
    let neverPlayed = true;

    if (historyResult.entry && historyResult.entry.playCount > 0) {
      neverPlayed = false;
      const daysSince = await this.historyStorage.getDaysSinceLastPlayed(
        artist,
        title
      );
      recencyGap = daysSince ?? Infinity;
    }

    // Calculate days since added to collection
    const dateAdded = new Date(album.date_added);
    const daysSinceAdded = Math.floor(
      (Date.now() - dateAdded.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Get artist affinity from listening history
    const artistAffinity =
      await this.analyticsService.getArtistAffinity(artist);

    // Get era preference based on release year
    const releaseYear = album.release.year || new Date().getFullYear();
    const eraPreference =
      await this.analyticsService.getEraPreference(releaseYear);

    // Get user rating (default to 0 if not rated)
    const userRating = album.rating || 0;

    // Get time-of-day preference
    const timeOfDay = await this.analyticsService.getTimeOfDayPreference();

    // Calculate diversity penalty based on recent suggestions
    const diversityPenalty = this.calculateDiversityPenalty(album);

    // Calculate album completeness (how often full album is played)
    const trackCount = album.release.tracklist?.length || 0;
    const albumCompleteness = await this.analyticsService.getAlbumCompleteness(
      artist,
      title,
      trackCount
    );

    return {
      recencyGap: recencyGap === Infinity ? 9999 : recencyGap,
      neverPlayed,
      recentAddition: daysSinceAdded,
      artistAffinity,
      eraPreference,
      userRating,
      timeOfDay,
      diversityPenalty,
      albumCompleteness,
    };
  }

  /**
   * Calculate diversity penalty based on how recently this album
   * or similar albums were suggested
   */
  private calculateDiversityPenalty(album: CollectionItem): number {
    const now = Date.now();

    // Clean up old entries
    for (const [id, timestamp] of this.recentSuggestions) {
      if (now - timestamp > this.SUGGESTION_MEMORY_TTL) {
        this.recentSuggestions.delete(id);
      }
    }

    // Check if this specific album was recently suggested
    const lastSuggested = this.recentSuggestions.get(album.id);
    if (lastSuggested) {
      const hoursSince = (now - lastSuggested) / (1000 * 60 * 60);
      // Higher penalty for more recent suggestions (max 1.0 for just suggested)
      return Math.max(0, 1 - hoursSince / 24);
    }

    return 0;
  }

  /**
   * Score an album based on its factors and the user's weight preferences
   */
  scoreAlbum(factors: SuggestionFactors, weights: SuggestionWeights): number {
    let score = 0;

    // Recency Gap: More days = higher score (log scale to avoid extremes)
    // Albums played years ago get high scores
    if (factors.recencyGap > 0) {
      score += weights.recencyGap * (Math.log(factors.recencyGap + 1) / 10);
    }

    // Never Played: Strong boolean boost for discovery
    if (factors.neverPlayed) {
      score += weights.neverPlayed * 2;
    }

    // Recent Addition: Inverse decay (more recent = higher)
    // Albums added within the last year get a boost
    score +=
      weights.recentAddition * Math.max(0, 1 - factors.recentAddition / 365);

    // Artist Affinity: Direct 0-1 mapping
    score += weights.artistAffinity * factors.artistAffinity;

    // Era Preference: Direct 0-1 mapping
    score += weights.eraPreference * factors.eraPreference;

    // User Rating: Scale to 0-1 (rating is 0-5)
    score += weights.userRating * (factors.userRating / 5);

    // Time of Day: Direct 0-1 mapping
    score += weights.timeOfDay * factors.timeOfDay;

    // Album Completeness: Direct 0-1 mapping
    score += weights.albumCompleteness * factors.albumCompleteness;

    // Diversity Penalty: Subtract
    score -= weights.diversityPenalty * factors.diversityPenalty;

    // Add randomness (10-20% variance) to prevent staleness
    score *= 0.9 + Math.random() * 0.2;

    return score;
  }

  /**
   * Generate a human-readable explanation for why this album was suggested
   */
  generateReason(factors: SuggestionFactors): string {
    const reasons: string[] = [];

    if (factors.neverPlayed) {
      reasons.push("You've never scrobbled this album");
    } else if (factors.recencyGap > 365) {
      reasons.push(
        `You haven't played this in over ${Math.floor(factors.recencyGap / 365)} year(s)`
      );
    } else if (factors.recencyGap > 90) {
      reasons.push(
        `You haven't played this in ${Math.floor(factors.recencyGap / 30)} months`
      );
    } else if (factors.recencyGap > 30) {
      reasons.push(
        `You haven't played this in ${Math.floor(factors.recencyGap / 7)} weeks`
      );
    }

    if (factors.recentAddition < 30) {
      reasons.push('Recently added to your collection');
    }

    if (factors.artistAffinity > 0.7) {
      reasons.push("You're a big fan of this artist");
    } else if (factors.artistAffinity > 0.4) {
      reasons.push('From an artist you enjoy');
    }

    if (factors.userRating >= 4) {
      reasons.push(`You rated this ${factors.userRating}/5`);
    }

    if (factors.albumCompleteness > 0.8) {
      reasons.push('You tend to listen to this album in full');
    }

    if (factors.timeOfDay > 0.7) {
      reasons.push('Good for this time of day based on your habits');
    }

    // Return the top 2-3 reasons
    return reasons.slice(0, 3).join(' • ') || 'Suggested for variety';
  }

  /**
   * Get multiple album suggestions ranked by score
   */
  async getSuggestions(
    collection: CollectionItem[],
    count: number = 5,
    settings?: Partial<SuggestionSettings>
  ): Promise<SuggestionResult[]> {
    const weights = settings?.weights || DEFAULT_WEIGHTS;
    const excludeRecentlyPlayed = settings?.excludeRecentlyPlayed ?? false;
    const preferNeverPlayed = settings?.preferNeverPlayed ?? false;

    this.logger.debug(
      `Generating ${count} suggestions from ${collection.length} albums`
    );

    // Score all albums
    const scoredAlbums: SuggestionResult[] = [];

    for (const album of collection) {
      try {
        const factors = await this.calculateFactors(album);

        // Optional filtering
        if (excludeRecentlyPlayed && factors.recencyGap < 7) {
          continue; // Skip albums played in the last week
        }

        // Apply preference boost for never-played albums
        let adjustedWeights = weights;
        if (preferNeverPlayed && factors.neverPlayed) {
          adjustedWeights = {
            ...weights,
            neverPlayed: weights.neverPlayed * 1.5, // Extra boost
          };
        }

        const score = this.scoreAlbum(factors, adjustedWeights);
        const reason = this.generateReason(factors);

        scoredAlbums.push({
          album,
          score,
          factors,
          reason,
        });
      } catch (error) {
        this.logger.error(`Error scoring album ${album.release.title}`, error);
      }
    }

    // Sort by score (highest first) and take top N
    scoredAlbums.sort((a, b) => b.score - a.score);
    const topSuggestions = scoredAlbums.slice(0, count);

    // Record these as recently suggested
    for (const suggestion of topSuggestions) {
      this.recentSuggestions.set(suggestion.album.id, Date.now());
    }

    this.logger.debug(
      `Generated ${topSuggestions.length} suggestions, top score: ${topSuggestions[0]?.score.toFixed(2) || 'N/A'}`
    );

    return topSuggestions;
  }

  /**
   * Get a single top suggestion
   */
  async getSuggestion(
    collection: CollectionItem[],
    settings?: Partial<SuggestionSettings>
  ): Promise<SuggestionResult | null> {
    const suggestions = await this.getSuggestions(collection, 1, settings);
    return suggestions[0] || null;
  }

  /**
   * Clear the recent suggestions memory
   * (useful for getting fresh suggestions)
   */
  clearSuggestionMemory(): void {
    this.recentSuggestions.clear();
    this.logger.debug('Suggestion memory cleared');
  }

  /**
   * Mark an album as dismissed (apply a temporary penalty)
   */
  dismissSuggestion(albumId: number): void {
    // Set to current time to maximize diversity penalty
    this.recentSuggestions.set(albumId, Date.now());
    this.logger.debug(`Album ${albumId} dismissed`);
  }

  /**
   * Get the default weights
   */
  getDefaultWeights(): SuggestionWeights {
    return { ...DEFAULT_WEIGHTS };
  }
}
