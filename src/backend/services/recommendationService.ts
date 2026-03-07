/**
 * Recommendation Service
 *
 * Orchestrates the full recommendation pipeline:
 *   1. Build session profile from recent scrobbles
 *   2. Get or create session embedding
 *   3. Load all record embeddings
 *   4. Score each record against session embedding
 *   5. Filter, sort, and return top N results
 *   6. Log recommendations for diversity scoring
 *
 * Also provides debug breakdown, feedback logging, and settings management.
 */

import {
  DiscogsRelease,
  RecommendationLogEntry,
  RecommendationResult,
  RecommendationSettings,
  RecommendationWeights,
} from '../../shared/types';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';
import { base64ToVector } from '../utils/vectorSerialization';

import { ArtistSimilarityStorageService } from './artistSimilarityStorageService';
import { CollectionIndexerService } from './collectionIndexerService';
import { EmbeddingStorageService } from './embeddingStorageService';
import { ProfileBuilderService, RecentScrobble } from './profileBuilderService';
import { RecommendationLogService } from './recommendationLogService';
import { ScoringEngineService } from './scoringEngineService';
import { ScrobbleHistoryStorage } from './scrobbleHistoryStorage';
import { SessionEmbedderService } from './sessionEmbedderService';

const log = createLogger('RecommendationService');

const SETTINGS_FILE = 'settings/recommendation-settings.json';

const DEFAULT_WEIGHTS: RecommendationWeights = {
  cosineSimilarity: 0.5,
  artistSimilarity: 0.2,
  recencyDecay: 0.2,
  diversityBonus: 0.1,
};

const DEFAULT_SETTINGS: RecommendationSettings = {
  schemaVersion: 1,
  defaultCount: 10,
  defaultWindowHours: 168,
  weights: DEFAULT_WEIGHTS,
  recencyDecayHalfLifeDays: 90,
  excludeRecentlyPlayed: true,
  excludeRecentlyRecommended: true,
  recentlyRecommendedWindowDays: 7,
  embedding: {
    model: 'nomic-embed-text',
    ollamaUrl: 'http://localhost:11434',
    batchSize: 5,
    concurrency: 2,
    cacheMaxAgeDays: 30,
  },
};

export interface GetRecommendationsParams {
  count?: number;
  windowHours?: number;
  excludeRecent?: boolean;
  minScore?: number;
  recentScrobbles: RecentScrobble[];
}

export class RecommendationService {
  private embeddingStorageService: EmbeddingStorageService;
  private scoringEngineService: ScoringEngineService;
  private sessionEmbedderService: SessionEmbedderService;
  private profileBuilderService: ProfileBuilderService;
  private collectionIndexerService: CollectionIndexerService;
  private recommendationLogService: RecommendationLogService;
  private artistSimilarityStorageService: ArtistSimilarityStorageService;
  private scrobbleHistoryStorage: ScrobbleHistoryStorage;
  private fileStorage: FileStorage;

  constructor(
    embeddingStorageService: EmbeddingStorageService,
    scoringEngineService: ScoringEngineService,
    sessionEmbedderService: SessionEmbedderService,
    profileBuilderService: ProfileBuilderService,
    collectionIndexerService: CollectionIndexerService,
    recommendationLogService: RecommendationLogService,
    fileStorage: FileStorage,
    artistSimilarityStorageService: ArtistSimilarityStorageService,
    scrobbleHistoryStorage: ScrobbleHistoryStorage
  ) {
    this.embeddingStorageService = embeddingStorageService;
    this.scoringEngineService = scoringEngineService;
    this.sessionEmbedderService = sessionEmbedderService;
    this.profileBuilderService = profileBuilderService;
    this.collectionIndexerService = collectionIndexerService;
    this.recommendationLogService = recommendationLogService;
    this.artistSimilarityStorageService = artistSimilarityStorageService;
    this.scrobbleHistoryStorage = scrobbleHistoryStorage;
    this.fileStorage = fileStorage;
  }

  /**
   * Run the full recommendation pipeline.
   * Returns top N scored records ordered by descending score.
   */
  async getRecommendations(
    params: GetRecommendationsParams
  ): Promise<RecommendationResult[]> {
    const settings = await this.getSettings();

    const count = params.count ?? settings.defaultCount;
    const windowHours = params.windowHours ?? settings.defaultWindowHours;
    const excludeRecent =
      params.excludeRecent ?? settings.excludeRecentlyPlayed;
    const minScore = params.minScore ?? 0.3;

    log.info('Starting recommendation pipeline', {
      count,
      windowHours,
      excludeRecent,
      minScore,
      scrobbleCount: params.recentScrobbles.length,
    });

    if (params.recentScrobbles.length === 0) {
      log.warn('No recent scrobbles — cannot build session profile');
      return [];
    }

    // 1. Build session profile from recent scrobbles
    const sessionProfile = await this.profileBuilderService.buildSessionProfile(
      params.recentScrobbles
    );

    if (!sessionProfile || sessionProfile.trim().length === 0) {
      log.warn('Session profile is empty — cannot generate recommendations');
      return [];
    }

    // 2. Get or create session embedding (cached for 30 minutes)
    const sessionEntry =
      await this.sessionEmbedderService.getOrCreateSessionEmbedding(
        sessionProfile,
        windowHours
      );

    const sessionEmbedding = base64ToVector(sessionEntry.sessionEmbedding);

    // 3. Load all record embeddings
    const allEmbeddings = await this.embeddingStorageService.getAllEmbeddings();

    if (allEmbeddings.length === 0) {
      log.warn('No record embeddings found — run rebuild first');
      return [];
    }

    log.info(`Scoring ${allEmbeddings.length} records`);

    // 4. Build context sets for scoring — load all inputs in parallel
    const recentArtists = this.extractRecentArtists(params.recentScrobbles);
    const recentArtistsLower = recentArtists.map(a => a.toLowerCase());

    const [recentRecs, similarityMap] = await Promise.all([
      settings.excludeRecentlyRecommended
        ? this.recommendationLogService.getRecentRecommendations(
            settings.recentlyRecommendedWindowDays
          )
        : Promise.resolve([]),
      this.artistSimilarityStorageService.getAllSimilarities(),
    ]);

    const recentRecommendationIds = new Set(
      recentRecs.map(r => r.discogsReleaseId)
    );

    // 4b. Build lastPlayedAt lookup from scrobble history.
    // We pre-load this for all records so the scoring loop stays synchronous.
    const lastPlayedMap = await this.buildLastPlayedMap(allEmbeddings);

    // 5. Score each record — synchronous hot loop, no I/O per record
    const scored: Array<{
      release: DiscogsRelease;
      score: number;
      breakdown: {
        cosine: number;
        artistSimilarity: number;
        recency: number;
        diversity: number;
      };
    }> = [];

    for (const entry of allEmbeddings) {
      try {
        const recordEmbedding = base64ToVector(entry.embedding);

        const { score, breakdown } = this.scoringEngineService.scoreRecordSync({
          recordEmbedding,
          sessionEmbedding,
          artistName: entry.textProfile
            ? this.extractArtistFromProfile(entry.textProfile)
            : '',
          recentArtistsLower,
          lastPlayedAt: lastPlayedMap.get(entry.discogsReleaseId) ?? null,
          releaseId: entry.discogsReleaseId,
          weights: settings.weights,
          recencyHalfLifeDays: settings.recencyDecayHalfLifeDays,
          recentRecommendationIds,
          similarityMap,
        });

        if (score < minScore) continue;

        const release = this.buildReleaseFromEntry(entry);
        scored.push({ release, score, breakdown });
      } catch (err) {
        log.warn('Failed to score record', {
          releaseId: entry.discogsReleaseId,
          err,
        });
      }
    }

    // 6. Sort descending and take top N
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, count);

    log.info(
      `Recommendation pipeline complete: ${top.length} results (from ${scored.length} above minScore)`
    );

    // 7. Build results with explanations
    // Build a quick lookup of embedding entries for tag/artist enrichment data
    const embeddingByReleaseId = new Map(
      allEmbeddings.map(e => [e.discogsReleaseId, e])
    );

    const results: RecommendationResult[] = top.map(
      ({ release, score, breakdown }) => {
        const entry = embeddingByReleaseId.get(release.id);

        // Extract flat tag list from tagsJson for explanation context
        let matchingTags: string[] | undefined;
        if (entry?.tagsJson) {
          const allTags = Object.values(entry.tagsJson).flat();
          if (allTags.length > 0) matchingTags = allTags;
        }

        // Keep only similar artists that overlap with recent listening for relevance
        let similarArtists: string[] | undefined;
        if (entry?.artistSimilarJson && entry.artistSimilarJson.length > 0) {
          const recentArtistSet = new Set(
            recentArtists.map(a => a.toLowerCase())
          );
          const relevant = entry.artistSimilarJson
            .filter(a => recentArtistSet.has(a.name.toLowerCase()))
            .map(a => a.name);
          if (relevant.length > 0) similarArtists = relevant;
        }

        return {
          release,
          score,
          breakdown,
          explanation: this.scoringEngineService.generateExplanation(
            release,
            breakdown,
            matchingTags,
            similarArtists
          ),
        };
      }
    );

    // 8. Log recommendations for diversity scoring
    if (results.length > 0) {
      const logEntries: RecommendationLogEntry[] = results.map(r => ({
        discogsReleaseId: r.release.id,
        recommendedAt: Date.now(),
        score: r.score,
        wasSelected: false,
      }));

      await this.recommendationLogService.logBatch(logEntries).catch(err => {
        log.warn('Failed to log recommendations', err);
      });
    }

    return results;
  }

  /**
   * Full scoring breakdown for a single release.
   * Useful for debugging why a record was or wasn't recommended.
   */
  async getDebugBreakdown(
    releaseId: number,
    recentScrobbles: RecentScrobble[]
  ): Promise<{
    release: DiscogsRelease;
    breakdown: {
      cosine: number;
      artistSimilarity: number;
      recency: number;
      diversity: number;
    };
    explanation: string;
  } | null> {
    const entry = await this.embeddingStorageService.getEmbedding(releaseId);
    if (!entry) {
      log.warn('No embedding found for release', { releaseId });
      return null;
    }

    if (recentScrobbles.length === 0) {
      log.warn('No recent scrobbles for debug breakdown');
      return null;
    }

    const settings = await this.getSettings();

    const sessionProfile =
      await this.profileBuilderService.buildSessionProfile(recentScrobbles);

    if (!sessionProfile || sessionProfile.trim().length === 0) {
      return null;
    }

    const sessionEntry =
      await this.sessionEmbedderService.getOrCreateSessionEmbedding(
        sessionProfile,
        settings.defaultWindowHours
      );

    const sessionEmbedding = base64ToVector(sessionEntry.sessionEmbedding);
    const recordEmbedding = base64ToVector(entry.embedding);
    const recentArtists = this.extractRecentArtists(recentScrobbles);

    const recentRecs =
      await this.recommendationLogService.getRecentRecommendations(
        settings.recentlyRecommendedWindowDays
      );
    const recentRecommendationIds = new Set(
      recentRecs.map(r => r.discogsReleaseId)
    );

    // Look up actual last-played timestamp from scrobble history
    const artistName = this.extractArtistFromProfile(entry.textProfile);
    const albumMatch = entry.textProfile.match(/^Album:\s*(.+)$/m);
    const albumName = albumMatch ? albumMatch[1].trim() : '';
    const lastPlayedSec = await this.scrobbleHistoryStorage.getLastPlayed(
      artistName,
      albumName
    );
    const lastPlayedAt = lastPlayedSec ? lastPlayedSec * 1000 : null;

    const { breakdown } = await this.scoringEngineService.scoreRecord({
      recordEmbedding,
      sessionEmbedding,
      artistName,
      recentArtists,
      lastPlayedAt,
      releaseId,
      weights: settings.weights,
      recencyHalfLifeDays: settings.recencyDecayHalfLifeDays,
      recentRecommendationIds,
    });

    const release = this.buildReleaseFromEntry(entry);
    const explanation = this.scoringEngineService.generateExplanation(
      release,
      breakdown
    );

    return { release, breakdown, explanation };
  }

  /**
   * Log user feedback (played, skipped, not interested) for a recommendation.
   */
  async submitFeedback(
    releaseId: number,
    action: 'played' | 'skipped' | 'not_interested'
  ): Promise<void> {
    log.info('Submitting feedback', { releaseId, action });

    if (action === 'played') {
      await this.recommendationLogService.markAsSelected(releaseId);
    }

    // For 'skipped' and 'not_interested', log a new entry with score 0
    // so the diversity scorer will suppress it
    if (action === 'skipped' || action === 'not_interested') {
      await this.recommendationLogService.logRecommendation({
        discogsReleaseId: releaseId,
        recommendedAt: Date.now(),
        score: 0,
        wasSelected: false,
      });
    }
  }

  /**
   * Load recommendation settings from file, returning defaults if not found.
   */
  async getSettings(): Promise<RecommendationSettings> {
    const data =
      await this.fileStorage.readJSON<RecommendationSettings>(SETTINGS_FILE);
    if (!data) {
      return { ...DEFAULT_SETTINGS };
    }
    // Merge with defaults so new fields are always present
    return {
      ...DEFAULT_SETTINGS,
      ...data,
      weights: { ...DEFAULT_WEIGHTS, ...data.weights },
      embedding: { ...DEFAULT_SETTINGS.embedding, ...data.embedding },
    };
  }

  /**
   * Update recommendation settings.
   */
  async updateSettings(
    settings: Partial<RecommendationSettings>
  ): Promise<void> {
    const current = await this.getSettings();
    const updated: RecommendationSettings = {
      ...current,
      ...settings,
      schemaVersion: 1,
      weights: settings.weights
        ? { ...current.weights, ...settings.weights }
        : current.weights,
      embedding: settings.embedding
        ? { ...current.embedding, ...settings.embedding }
        : current.embedding,
    };
    await this.fileStorage.writeJSONWithBackup(SETTINGS_FILE, updated);
    log.info('Recommendation settings updated');
  }

  /**
   * Extract unique artist names from recent scrobbles (ordered by frequency).
   */
  private extractRecentArtists(scrobbles: RecentScrobble[]): string[] {
    const counts = new Map<string, number>();
    for (const s of scrobbles) {
      const name = s.artist.trim();
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name]) => name);
  }

  /**
   * Build a map of releaseId → lastPlayedAt (milliseconds) from the scrobble
   * history index. Uses fuzzy matching so Discogs album titles match Last.fm
   * titles even with edition suffixes, etc.
   */
  private async buildLastPlayedMap(
    embeddings: Array<{ discogsReleaseId: number; textProfile: string }>
  ): Promise<Map<number, number>> {
    const map = new Map<number, number>();

    try {
      for (const entry of embeddings) {
        const artist = this.extractArtistFromProfile(entry.textProfile);
        const albumMatch = entry.textProfile.match(/^Album:\s*(.+)$/m);
        const album = albumMatch ? albumMatch[1].trim() : '';

        if (!artist || !album) continue;

        const lastPlayedSec = await this.scrobbleHistoryStorage.getLastPlayed(
          artist,
          album
        );
        if (lastPlayedSec) {
          map.set(entry.discogsReleaseId, lastPlayedSec * 1000);
        }
      }
    } catch (err) {
      log.warn('Failed to build lastPlayedAt map from scrobble history', err);
    }

    log.info(
      `Built lastPlayedAt map: ${map.size}/${embeddings.length} records have play history`
    );
    return map;
  }

  /**
   * Extract artist name from text profile string.
   * Text profile format: "Artist: Pink Floyd\nAlbum: ..."
   */
  private extractArtistFromProfile(textProfile: string): string {
    const match = textProfile.match(/^Artist:\s*(.+)$/m);
    return match ? match[1].trim() : '';
  }

  /**
   * Build a minimal DiscogsRelease object from a RecordEmbeddingEntry.
   *
   * The embedding entry stores only the textProfile, not the full release.
   * We parse what we can from the text profile; the frontend can enrich this
   * from the collection cache.
   */
  private buildReleaseFromEntry(entry: {
    discogsReleaseId: number;
    textProfile: string;
    embeddingModel: string;
  }): DiscogsRelease {
    const profile = entry.textProfile;
    const artistMatch = profile.match(/^Artist:\s*(.+)$/m);
    const albumMatch = profile.match(/^Album:\s*(.+)$/m);
    const yearMatch = profile.match(/^Year:\s*(\d{4})$/m);

    return {
      id: entry.discogsReleaseId,
      title: albumMatch ? albumMatch[1].trim() : 'Unknown Album',
      artist: artistMatch ? artistMatch[1].trim() : 'Unknown Artist',
      year: yearMatch ? parseInt(yearMatch[1], 10) : undefined,
      format: [],
      label: [],
      resource_url: '',
    };
  }
}
