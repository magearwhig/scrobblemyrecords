import { ArtistSimilarityStorageService } from '../../../src/backend/services/artistSimilarityStorageService';
import { RecommendationLogService } from '../../../src/backend/services/recommendationLogService';
import {
  ScoringEngineService,
  ScoreRecordParams,
} from '../../../src/backend/services/scoringEngineService';
import {
  createMockEmbedding,
  createMockRelease,
  createMockRecommendationWeights,
  createMockArtistSimilarityEntries,
} from '../../fixtures/embeddingFixtures';

jest.mock('../../../src/backend/services/artistSimilarityStorageService');
jest.mock('../../../src/backend/services/recommendationLogService');

const MockedArtistSimilarityStorageService =
  ArtistSimilarityStorageService as jest.MockedClass<
    typeof ArtistSimilarityStorageService
  >;
const MockedRecommendationLogService =
  RecommendationLogService as jest.MockedClass<typeof RecommendationLogService>;

describe('ScoringEngineService', () => {
  let service: ScoringEngineService;
  let mockArtistSimilarityStorage: jest.Mocked<ArtistSimilarityStorageService>;
  let mockRecommendationLogService: jest.Mocked<RecommendationLogService>;

  const defaultWeights = createMockRecommendationWeights();
  const sessionEmbedding = createMockEmbedding(768);
  const recordEmbedding = createMockEmbedding(768);

  function makeParams(
    overrides: Partial<ScoreRecordParams> = {}
  ): ScoreRecordParams {
    return {
      recordEmbedding,
      sessionEmbedding,
      artistName: 'Radiohead',
      recentArtists: ['Portishead', 'Massive Attack'],
      lastPlayedAt: null,
      releaseId: 12345,
      weights: defaultWeights,
      recencyHalfLifeDays: 90,
      recentRecommendationIds: new Set<number>(),
      ...overrides,
    };
  }

  beforeEach(() => {
    mockArtistSimilarityStorage = new MockedArtistSimilarityStorageService(
      {} as never
    ) as jest.Mocked<ArtistSimilarityStorageService>;

    mockRecommendationLogService = new MockedRecommendationLogService(
      {} as never
    ) as jest.Mocked<RecommendationLogService>;

    // Default: no similar artists found
    mockArtistSimilarityStorage.getSimilarArtists = jest
      .fn()
      .mockResolvedValue([]);

    service = new ScoringEngineService(
      mockArtistSimilarityStorage,
      mockRecommendationLogService
    );
  });

  describe('scoreRecord', () => {
    it('should return a score and breakdown object', async () => {
      // Arrange
      const params = makeParams();

      // Act
      const result = await service.scoreRecord(params);

      // Assert
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('breakdown');
      expect(typeof result.score).toBe('number');
      expect(result.breakdown).toHaveProperty('cosine');
      expect(result.breakdown).toHaveProperty('artistSimilarity');
      expect(result.breakdown).toHaveProperty('recency');
      expect(result.breakdown).toHaveProperty('diversity');
    });

    it('should produce a score in the range [0, 1] for normal inputs', async () => {
      // Arrange
      const params = makeParams();

      // Act
      const { score } = await service.scoreRecord(params);

      // Assert — weights sum to 1.0, each sub-score in [0,1], so score ∈ [0,1]
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should apply weights correctly to produce the final score', async () => {
      // Arrange — use identical vectors so cosine = 1.0
      const vec = createMockEmbedding(768);
      const params = makeParams({
        recordEmbedding: vec,
        sessionEmbedding: vec,
        lastPlayedAt: null, // recency = 1.0 (never played)
        recentArtists: [], // artistSimilarity = 0
        recentRecommendationIds: new Set<number>(), // diversity = 1.0
      });

      // Act
      const { score, breakdown } = await service.scoreRecord(params);

      // Assert
      // cosine ≈ 1.0 (clamped), recency = 1.0, artistSimilarity = 0, diversity = 1.0
      const expectedScore =
        breakdown.cosine * defaultWeights.cosineSimilarity +
        breakdown.artistSimilarity * defaultWeights.artistSimilarity +
        breakdown.recency * defaultWeights.recencyDecay +
        breakdown.diversity * defaultWeights.diversityBonus;

      expect(score).toBeCloseTo(expectedScore, 10);
    });

    describe('recency sub-score', () => {
      it('should return recency = 1.0 for a record never played', async () => {
        // Arrange
        const params = makeParams({ lastPlayedAt: null });

        // Act
        const { breakdown } = await service.scoreRecord(params);

        // Assert
        expect(breakdown.recency).toBe(1.0);
      });

      it('should return a low recency score for a recently played record', async () => {
        // Arrange — played 1 day ago with halfLife=90
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        const params = makeParams({ lastPlayedAt: oneDayAgo });

        // Act
        const { breakdown } = await service.scoreRecord(params);

        // Assert — 1 day vs 90-day halfLife → very small score
        expect(breakdown.recency).toBeGreaterThan(0);
        expect(breakdown.recency).toBeLessThan(0.1);
      });

      it('should return ~0.5 recency for record played exactly halfLife days ago', async () => {
        // Arrange
        const halfLifeDays = 90;
        const halfLifeAgo = Date.now() - halfLifeDays * 24 * 60 * 60 * 1000;
        const params = makeParams({
          lastPlayedAt: halfLifeAgo,
          recencyHalfLifeDays: halfLifeDays,
        });

        // Act
        const { breakdown } = await service.scoreRecord(params);

        // Assert — exponential decay: 1 - exp(-1 * ln2) = 1 - 0.5 = 0.5
        expect(breakdown.recency).toBeCloseTo(0.5, 2);
      });

      it('should return 0.5 when halfLifeDays is 0 (edge case guard)', async () => {
        // Arrange
        const params = makeParams({
          lastPlayedAt: Date.now() - 1000,
          recencyHalfLifeDays: 0,
        });

        // Act
        const { breakdown } = await service.scoreRecord(params);

        // Assert
        expect(breakdown.recency).toBe(0.5);
        expect(isNaN(breakdown.recency)).toBe(false);
      });
    });

    describe('diversity sub-score', () => {
      it('should return diversity = 1.0 for a record not recently recommended', async () => {
        // Arrange
        const params = makeParams({
          recentRecommendationIds: new Set<number>([999, 888]),
          releaseId: 12345,
        });

        // Act
        const { breakdown } = await service.scoreRecord(params);

        // Assert
        expect(breakdown.diversity).toBe(1.0);
      });

      it('should return diversity = 0 for a record that was recently recommended', async () => {
        // Arrange
        const params = makeParams({
          recentRecommendationIds: new Set<number>([12345]),
          releaseId: 12345,
        });

        // Act
        const { breakdown } = await service.scoreRecord(params);

        // Assert
        expect(breakdown.diversity).toBe(0.0);
      });
    });

    describe('artist similarity sub-score', () => {
      it('should return 1.0 for an exact match with a recently played artist', async () => {
        // Arrange
        const params = makeParams({
          artistName: 'Radiohead',
          recentArtists: ['Radiohead', 'Portishead'],
        });

        // Act
        const { breakdown } = await service.scoreRecord(params);

        // Assert
        expect(breakdown.artistSimilarity).toBe(1.0);
      });

      it("should return > 0 when the artist appears in a recently played artist's similar list", async () => {
        // Arrange
        const similarEntries = createMockArtistSimilarityEntries('Portishead', [
          { similarArtistName: 'Radiohead', matchScore: 0.75 },
        ]);
        mockArtistSimilarityStorage.getSimilarArtists.mockResolvedValue(
          similarEntries.slice(0, 1)
        );

        const params = makeParams({
          artistName: 'Radiohead',
          recentArtists: ['Portishead'],
        });

        // Act
        const { breakdown } = await service.scoreRecord(params);

        // Assert
        expect(breakdown.artistSimilarity).toBeGreaterThan(0);
      });

      it('should return 0 when there are no recent artists', async () => {
        // Arrange
        const params = makeParams({ recentArtists: [] });

        // Act
        const { breakdown } = await service.scoreRecord(params);

        // Assert
        expect(breakdown.artistSimilarity).toBe(0);
      });
    });

    it('should clamp negative cosine similarity to 0', async () => {
      // Arrange — vectors pointing in opposite directions
      const vecA = createMockEmbedding(768);
      const vecB = vecA.map(v => -v);
      const params = makeParams({
        recordEmbedding: vecA,
        sessionEmbedding: vecB,
      });

      // Act
      const { breakdown } = await service.scoreRecord(params);

      // Assert
      expect(breakdown.cosine).toBeGreaterThanOrEqual(0);
    });
  });

  describe('generateExplanation', () => {
    it('should produce a non-empty string', () => {
      // Arrange
      const release = createMockRelease();
      const breakdown = {
        cosine: 0.8,
        artistSimilarity: 0.6,
        recency: 0.9,
        diversity: 1.0,
      };

      // Act
      const explanation = service.generateExplanation(release, breakdown);

      // Assert
      expect(typeof explanation).toBe('string');
      expect(explanation.length).toBeGreaterThan(0);
    });

    it('should mention matching tags when provided', () => {
      // Arrange
      const release = createMockRelease();
      const breakdown = {
        cosine: 0.5,
        artistSimilarity: 0.0,
        recency: 0.5,
        diversity: 1.0,
      };
      const matchingTags = ['trip-hop', 'atmospheric', 'electronic'];

      // Act
      const explanation = service.generateExplanation(
        release,
        breakdown,
        matchingTags
      );

      // Assert
      expect(explanation).toContain('trip-hop');
    });

    it('should mention similar artist when artistSimilarity is > 0.5', () => {
      // Arrange
      const release = createMockRelease();
      const breakdown = {
        cosine: 0.4,
        artistSimilarity: 0.7,
        recency: 0.5,
        diversity: 1.0,
      };
      const similarArtists = ['Portishead'];

      // Act
      const explanation = service.generateExplanation(
        release,
        breakdown,
        [],
        similarArtists
      );

      // Assert
      expect(explanation).toContain('Portishead');
    });

    it('should mention "never played" when recency is > 0.99', () => {
      // Arrange
      const release = createMockRelease();
      const breakdown = {
        cosine: 0.0,
        artistSimilarity: 0.0,
        recency: 1.0,
        diversity: 1.0,
      };

      // Act
      const explanation = service.generateExplanation(release, breakdown);

      // Assert
      expect(explanation).toContain('never played');
    });

    it('should use year as fallback when no other reasons apply', () => {
      // Arrange
      const release = createMockRelease({ year: 1997 });
      const breakdown = {
        cosine: 0.1,
        artistSimilarity: 0.1,
        recency: 0.4,
        diversity: 1.0,
      };

      // Act
      const explanation = service.generateExplanation(release, breakdown);

      // Assert
      expect(explanation).toContain('1997');
    });

    it('should fall back to listening patterns when no year and no strong signals', () => {
      // Arrange
      const release = createMockRelease({ year: undefined });
      const breakdown = {
        cosine: 0.1,
        artistSimilarity: 0.1,
        recency: 0.4,
        diversity: 1.0,
      };

      // Act
      const explanation = service.generateExplanation(release, breakdown);

      // Assert
      expect(explanation).toContain('listening patterns');
    });

    it('should not exceed 3 explanation parts', () => {
      // Arrange
      const release = createMockRelease();
      const breakdown = {
        cosine: 0.8,
        artistSimilarity: 0.9,
        recency: 1.0,
        diversity: 1.0,
      };
      const tags = ['electronic', 'ambient'];
      const similarArtists = ['Massive Attack'];

      // Act
      const explanation = service.generateExplanation(
        release,
        breakdown,
        tags,
        similarArtists
      );

      // Assert — parts are joined by '. '
      const parts = explanation.split('. ').filter(Boolean);
      expect(parts.length).toBeLessThanOrEqual(3);
    });
  });
});
