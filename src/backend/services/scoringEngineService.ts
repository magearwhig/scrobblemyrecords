/**
 * Scoring engine for the embedding-based recommendation system.
 *
 * Implements the weighted scoring formula:
 *   final_score = (
 *       cosine_similarity(record_embedding, session_embedding) * 0.50
 *     + artist_similarity_score * 0.20
 *     + recency_decay_score * 0.20
 *     + diversity_bonus * 0.10
 *   )
 *
 * All weights are configurable via RecommendationWeights.
 */

import {
  ArtistSimilarityEntry,
  DiscogsRelease,
  RecommendationWeights,
} from '../../shared/types';
import { createLogger } from '../utils/logger';
import { cosineSimilarity } from '../utils/vectorOps';

import { ArtistSimilarityStorageService } from './artistSimilarityStorageService';
import { RecommendationLogService } from './recommendationLogService';

const log = createLogger('ScoringEngineService');

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const LN2 = Math.LN2;

export interface ScoreBreakdown {
  cosine: number;
  artistSimilarity: number;
  recency: number;
  diversity: number;
}

export interface ScoreRecordParams {
  recordEmbedding: number[];
  sessionEmbedding: number[];
  artistName: string;
  recentArtists: string[];
  lastPlayedAt: number | null;
  releaseId: number;
  weights: RecommendationWeights;
  recencyHalfLifeDays: number;
  recentRecommendationIds: Set<number>;
}

export interface ScoreRecordSyncParams {
  recordEmbedding: number[];
  sessionEmbedding: number[];
  artistName: string;
  recentArtistsLower: string[];
  lastPlayedAt: number | null;
  releaseId: number;
  weights: RecommendationWeights;
  recencyHalfLifeDays: number;
  recentRecommendationIds: Set<number>;
  similarityMap: Record<string, ArtistSimilarityEntry[]>;
}

export class ScoringEngineService {
  private artistSimilarityStorageService: ArtistSimilarityStorageService;
  private recommendationLogService: RecommendationLogService;

  constructor(
    artistSimilarityStorageService: ArtistSimilarityStorageService,
    recommendationLogService: RecommendationLogService
  ) {
    this.artistSimilarityStorageService = artistSimilarityStorageService;
    this.recommendationLogService = recommendationLogService;
  }

  /**
   * Score a single record against the current session embedding.
   * Returns the weighted final score plus the per-factor breakdown.
   */
  async scoreRecord(params: ScoreRecordParams): Promise<{
    score: number;
    breakdown: ScoreBreakdown;
  }> {
    const {
      recordEmbedding,
      sessionEmbedding,
      artistName,
      recentArtists,
      lastPlayedAt,
      releaseId,
      weights,
      recencyHalfLifeDays,
      recentRecommendationIds,
    } = params;

    // 1. Cosine similarity (core semantic match)
    let cosine = 0;
    try {
      const raw = cosineSimilarity(recordEmbedding, sessionEmbedding);
      // Clamp to [0, 1] since cosine can be negative; we treat negative similarity as no match
      cosine = Math.max(0, raw);
    } catch (err) {
      log.warn('Cosine similarity failed for release', { releaseId, err });
    }

    // 2. Artist similarity score
    const artistSimilarity = await this.computeArtistSimilarity(
      artistName,
      recentArtists
    );

    // 3. Recency decay — higher score for records NOT played recently
    const recency = this.computeRecencyScore(lastPlayedAt, recencyHalfLifeDays);

    // 4. Diversity bonus — reward records not recently recommended
    const diversity = recentRecommendationIds.has(releaseId) ? 0.0 : 1.0;

    const breakdown: ScoreBreakdown = {
      cosine,
      artistSimilarity,
      recency,
      diversity,
    };

    const score =
      cosine * weights.cosineSimilarity +
      artistSimilarity * weights.artistSimilarity +
      recency * weights.recencyDecay +
      diversity * weights.diversityBonus;

    log.debug('Scored record', {
      releaseId,
      score: score.toFixed(4),
      breakdown,
    });

    return { score, breakdown };
  }

  /**
   * Synchronous variant of scoreRecord for use in batch scoring loops.
   *
   * Accepts a pre-loaded similarity map (from getAllSimilarities()) so the
   * hot loop does zero file I/O — all similarity lookups are in-memory.
   * recentArtistsLower must be pre-lowercased by the caller.
   */
  scoreRecordSync(params: ScoreRecordSyncParams): {
    score: number;
    breakdown: ScoreBreakdown;
  } {
    const {
      recordEmbedding,
      sessionEmbedding,
      artistName,
      recentArtistsLower,
      lastPlayedAt,
      releaseId,
      weights,
      recencyHalfLifeDays,
      recentRecommendationIds,
      similarityMap,
    } = params;

    let cosine = 0;
    try {
      const raw = cosineSimilarity(recordEmbedding, sessionEmbedding);
      cosine = Math.max(0, raw);
    } catch (err) {
      log.warn('Cosine similarity failed for release', { releaseId, err });
    }

    const artistSimilarity = this.computeArtistSimilaritySync(
      artistName,
      recentArtistsLower,
      similarityMap
    );

    const recency = this.computeRecencyScore(lastPlayedAt, recencyHalfLifeDays);
    const diversity = recentRecommendationIds.has(releaseId) ? 0.0 : 1.0;

    const breakdown: ScoreBreakdown = {
      cosine,
      artistSimilarity,
      recency,
      diversity,
    };

    const score =
      cosine * weights.cosineSimilarity +
      artistSimilarity * weights.artistSimilarity +
      recency * weights.recencyDecay +
      diversity * weights.diversityBonus;

    return { score, breakdown };
  }

  /**
   * Compute the artist similarity sub-score.
   *
   * Checks if any recently played artist is similar to the record's artist
   * using cached artist.getSimilar data. Returns the highest match score found,
   * or 0 if no similarity data is available.
   */
  private async computeArtistSimilarity(
    artistName: string,
    recentArtists: string[]
  ): Promise<number> {
    if (recentArtists.length === 0) return 0;

    try {
      // Look up similarities stored for each recently played artist
      // and check if the record's artist appears in their similar-artists list
      let maxScore = 0;

      for (const recentArtist of recentArtists) {
        // Exact match: the record IS one of the recently played artists
        if (recentArtist.toLowerCase() === artistName.toLowerCase()) {
          maxScore = Math.max(maxScore, 1.0);
          continue;
        }

        const similarEntries =
          await this.artistSimilarityStorageService.getSimilarArtists(
            recentArtist
          );

        for (const entry of similarEntries) {
          if (
            entry.similarArtistName.toLowerCase() === artistName.toLowerCase()
          ) {
            maxScore = Math.max(maxScore, entry.matchScore);
          }
        }
      }

      // Also check from the record artist's perspective
      const recordSimilarEntries =
        await this.artistSimilarityStorageService.getSimilarArtists(artistName);

      for (const entry of recordSimilarEntries) {
        for (const recentArtist of recentArtists) {
          if (
            entry.similarArtistName.toLowerCase() === recentArtist.toLowerCase()
          ) {
            maxScore = Math.max(maxScore, entry.matchScore);
          }
        }
      }

      return Math.min(1.0, maxScore);
    } catch (err) {
      log.warn('Artist similarity lookup failed', { artistName, err });
      return 0;
    }
  }

  /**
   * Synchronous in-memory variant of computeArtistSimilarity.
   *
   * recentArtistsLower must already be lowercased.
   * similarityMap is the full store loaded once per scoring run.
   */
  private computeArtistSimilaritySync(
    artistName: string,
    recentArtistsLower: string[],
    similarityMap: Record<string, ArtistSimilarityEntry[]>
  ): number {
    if (recentArtistsLower.length === 0) return 0;

    const artistNameLower = artistName.toLowerCase();
    let maxScore = 0;

    for (const recentArtistLower of recentArtistsLower) {
      if (recentArtistLower === artistNameLower) {
        return 1.0;
      }

      const similarEntries = similarityMap[recentArtistLower] ?? [];
      for (const entry of similarEntries) {
        if (entry.similarArtistName.toLowerCase() === artistNameLower) {
          if (entry.matchScore > maxScore) maxScore = entry.matchScore;
        }
      }
    }

    const recordSimilarEntries = similarityMap[artistName] ?? [];
    for (const entry of recordSimilarEntries) {
      const entryLower = entry.similarArtistName.toLowerCase();
      for (const recentArtistLower of recentArtistsLower) {
        if (entryLower === recentArtistLower) {
          if (entry.matchScore > maxScore) maxScore = entry.matchScore;
        }
      }
    }

    return Math.min(1.0, maxScore);
  }

  /**
   * Compute the recency decay sub-score.
   *
   * Uses exponential decay: score = 1 - exp(-daysSince * ln(2) / halfLifeDays)
   * Records never played get score 1.0 (maximum).
   * Records played very recently get a low score (near 0).
   * Records played exactly halfLifeDays ago get score ~0.5.
   */
  private computeRecencyScore(
    lastPlayedAt: number | null,
    halfLifeDays: number
  ): number {
    if (lastPlayedAt === null) {
      // Never played — maximum recency score to encourage discovery
      return 1.0;
    }

    if (halfLifeDays <= 0) {
      log.warn('recencyHalfLifeDays is <= 0, defaulting recency score to 0.5', {
        halfLifeDays,
      });
      return 0.5;
    }

    const daysSince = (Date.now() - lastPlayedAt) / MS_PER_DAY;

    if (daysSince < 0) {
      // Defensive: future timestamp
      return 0;
    }

    // Exponential decay: grows from 0 toward 1 as days increase
    return 1 - Math.exp((-daysSince * LN2) / halfLifeDays);
  }

  /**
   * Generate a human-readable explanation for a recommendation.
   *
   * Combines information from the score breakdown, matching tags, and similar
   * artists to produce a short, friendly explanation.
   */
  generateExplanation(
    release: DiscogsRelease,
    breakdown: ScoreBreakdown,
    matchingTags?: string[],
    similarArtists?: string[]
  ): string {
    const parts: string[] = [];

    // Genre/tag match
    if (matchingTags && matchingTags.length > 0) {
      const tagList = matchingTags.slice(0, 3).join(', ');
      parts.push(`Matches your current mood (${tagList})`);
    } else if (breakdown.cosine > 0.7) {
      parts.push('Strong match with your recent listening style');
    } else if (breakdown.cosine > 0.4) {
      parts.push('Fits your current listening mood');
    }

    // Artist similarity
    if (breakdown.artistSimilarity > 0.8) {
      parts.push('From an artist you love');
    } else if (breakdown.artistSimilarity > 0.5) {
      if (similarArtists && similarArtists.length > 0) {
        parts.push(
          `Similar to ${similarArtists[0]} (who you've been listening to)`
        );
      } else {
        parts.push("Similar to artists you've been listening to");
      }
    } else if (breakdown.artistSimilarity > 0.3) {
      parts.push('From an artist in your orbit');
    }

    // Recency
    if (breakdown.recency > 0.99) {
      parts.push("You've never played this");
    } else if (breakdown.recency > 0.9) {
      // recency > 0.9 means many months not played — compute approximate days
      // halfLife=90 → recency=0.9 at ~299 days
      parts.push("You haven't played this in a long time");
    } else if (breakdown.recency > 0.7) {
      parts.push("You haven't played this in a few months");
    } else if (breakdown.recency > 0.5) {
      parts.push("It's been a while since you played this");
    }

    // Fallback
    if (parts.length === 0) {
      if (release.year) {
        parts.push(`A ${release.year} record worth revisiting`);
      } else {
        parts.push('Suggested based on your listening patterns');
      }
    }

    return parts.slice(0, 3).join('. ');
  }
}
