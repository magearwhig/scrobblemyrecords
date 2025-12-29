import { AnalyticsService } from '../../src/backend/services/analyticsService';
import { ScrobbleHistoryStorage } from '../../src/backend/services/scrobbleHistoryStorage';
import {
  SuggestionService,
  DEFAULT_WEIGHTS,
} from '../../src/backend/services/suggestionService';
import { CollectionItem, SuggestionFactors } from '../../src/shared/types';

// Mock dependencies
jest.mock('../../src/backend/services/analyticsService');
jest.mock('../../src/backend/services/scrobbleHistoryStorage');

describe('SuggestionService', () => {
  let suggestionService: SuggestionService;
  let mockAnalyticsService: jest.Mocked<AnalyticsService>;
  let mockHistoryStorage: jest.Mocked<ScrobbleHistoryStorage>;

  // Factory for creating mock collection items
  const createMockCollectionItem = (
    overrides: Partial<{
      id: number;
      artist: string;
      title: string;
      year: number;
      rating: number;
      date_added: string;
    }> = {}
  ): CollectionItem => ({
    id: overrides.id ?? 123,
    date_added: overrides.date_added ?? '2024-01-15T00:00:00Z',
    rating: overrides.rating ?? 0,
    release: {
      id: overrides.id ?? 123,
      title: overrides.title ?? 'Test Album',
      artist: overrides.artist ?? 'Test Artist',
      year: overrides.year ?? 2021,
      format: ['Vinyl', 'LP'],
      label: ['Test Label'],
      cover_image: 'https://example.com/cover.jpg',
      resource_url: 'https://api.discogs.com/releases/123',
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockAnalyticsService = {
      getArtistAffinity: jest.fn().mockResolvedValue(0.5),
      getEraPreference: jest.fn().mockResolvedValue(0.5),
      getTimeOfDayPreference: jest.fn().mockResolvedValue(0.5),
      getAlbumCompleteness: jest.fn().mockResolvedValue(0.5),
    } as unknown as jest.Mocked<AnalyticsService>;

    mockHistoryStorage = {
      getAlbumHistory: jest.fn().mockResolvedValue(null),
      getDaysSinceLastPlayed: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<ScrobbleHistoryStorage>;

    suggestionService = new SuggestionService(
      mockAnalyticsService,
      mockHistoryStorage
    );
  });

  describe('DEFAULT_WEIGHTS', () => {
    it('should have all required weight properties', () => {
      // Assert
      expect(DEFAULT_WEIGHTS.recencyGap).toBeDefined();
      expect(DEFAULT_WEIGHTS.neverPlayed).toBeDefined();
      expect(DEFAULT_WEIGHTS.recentAddition).toBeDefined();
      expect(DEFAULT_WEIGHTS.artistAffinity).toBeDefined();
      expect(DEFAULT_WEIGHTS.eraPreference).toBeDefined();
      expect(DEFAULT_WEIGHTS.userRating).toBeDefined();
      expect(DEFAULT_WEIGHTS.timeOfDay).toBeDefined();
      expect(DEFAULT_WEIGHTS.diversityPenalty).toBeDefined();
      expect(DEFAULT_WEIGHTS.albumCompleteness).toBeDefined();
    });

    it('should have reasonable weight values', () => {
      // Assert - weights should be positive (except diversityPenalty is applied as subtraction)
      Object.values(DEFAULT_WEIGHTS).forEach(weight => {
        expect(weight).toBeGreaterThan(0);
        expect(weight).toBeLessThan(5); // Reasonable upper bound
      });
    });
  });

  describe('calculateFactors', () => {
    it('should mark album as never played when no history', async () => {
      // Arrange
      const album = createMockCollectionItem();
      mockHistoryStorage.getAlbumHistory.mockResolvedValue(null);

      // Act
      const factors = await suggestionService.calculateFactors(album);

      // Assert
      expect(factors.neverPlayed).toBe(true);
      expect(factors.recencyGap).toBe(9999);
    });

    it('should calculate recency gap from play history', async () => {
      // Arrange
      const album = createMockCollectionItem();
      mockHistoryStorage.getAlbumHistory.mockResolvedValue({
        lastPlayed: Math.floor(Date.now() / 1000),
        playCount: 5,
        plays: [],
      });
      mockHistoryStorage.getDaysSinceLastPlayed.mockResolvedValue(30);

      // Act
      const factors = await suggestionService.calculateFactors(album);

      // Assert
      expect(factors.neverPlayed).toBe(false);
      expect(factors.recencyGap).toBe(30);
    });

    it('should calculate days since added', async () => {
      // Arrange
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const album = createMockCollectionItem({
        date_added: thirtyDaysAgo.toISOString(),
      });

      // Act
      const factors = await suggestionService.calculateFactors(album);

      // Assert
      expect(factors.recentAddition).toBeCloseTo(30, 0);
    });

    it('should get artist affinity from analytics service', async () => {
      // Arrange
      const album = createMockCollectionItem({ artist: 'Radiohead' });
      mockAnalyticsService.getArtistAffinity.mockResolvedValue(0.8);

      // Act
      const factors = await suggestionService.calculateFactors(album);

      // Assert
      expect(mockAnalyticsService.getArtistAffinity).toHaveBeenCalledWith(
        'Radiohead'
      );
      expect(factors.artistAffinity).toBe(0.8);
    });

    it('should get era preference based on release year', async () => {
      // Arrange
      const album = createMockCollectionItem({ year: 1975 });
      mockAnalyticsService.getEraPreference.mockResolvedValue(0.7);

      // Act
      const factors = await suggestionService.calculateFactors(album);

      // Assert
      expect(mockAnalyticsService.getEraPreference).toHaveBeenCalledWith(1975);
      expect(factors.eraPreference).toBe(0.7);
    });

    it('should include user rating in factors', async () => {
      // Arrange
      const album = createMockCollectionItem({ rating: 4 });

      // Act
      const factors = await suggestionService.calculateFactors(album);

      // Assert
      expect(factors.userRating).toBe(4);
    });
  });

  describe('scoreAlbum', () => {
    it('should give high score to never played albums', () => {
      // Arrange
      const factors: SuggestionFactors = {
        recencyGap: 9999,
        neverPlayed: true,
        recentAddition: 100,
        artistAffinity: 0.5,
        eraPreference: 0.5,
        userRating: 0,
        timeOfDay: 0.5,
        diversityPenalty: 0,
        albumCompleteness: 0.5,
      };

      // Act
      const score = suggestionService.scoreAlbum(factors, DEFAULT_WEIGHTS);

      // Assert - never played should give a significant boost
      expect(score).toBeGreaterThan(2);
    });

    it('should give high score to recently added albums', () => {
      // Arrange
      const recentlyAdded: SuggestionFactors = {
        recencyGap: 0,
        neverPlayed: false,
        recentAddition: 7, // Added a week ago
        artistAffinity: 0.5,
        eraPreference: 0.5,
        userRating: 0,
        timeOfDay: 0.5,
        diversityPenalty: 0,
        albumCompleteness: 0.5,
      };

      const oldAddition: SuggestionFactors = {
        ...recentlyAdded,
        recentAddition: 500, // Added years ago
      };

      // Act
      const recentScore = suggestionService.scoreAlbum(
        recentlyAdded,
        DEFAULT_WEIGHTS
      );
      const oldScore = suggestionService.scoreAlbum(
        oldAddition,
        DEFAULT_WEIGHTS
      );

      // Assert - recently added should score higher (on average, accounting for randomness)
      // We can't test exact values due to randomness, but the base should be higher
      // Run multiple times and check trend
      let recentHigher = 0;
      for (let i = 0; i < 10; i++) {
        const r = suggestionService.scoreAlbum(recentlyAdded, DEFAULT_WEIGHTS);
        const o = suggestionService.scoreAlbum(oldAddition, DEFAULT_WEIGHTS);
        if (r > o) recentHigher++;
      }
      expect(recentHigher).toBeGreaterThan(5); // Should win most of the time
    });

    it('should apply diversity penalty', () => {
      // Arrange
      const noPenalty: SuggestionFactors = {
        recencyGap: 30,
        neverPlayed: false,
        recentAddition: 100,
        artistAffinity: 0.5,
        eraPreference: 0.5,
        userRating: 3,
        timeOfDay: 0.5,
        diversityPenalty: 0,
        albumCompleteness: 0.5,
      };

      const withPenalty: SuggestionFactors = {
        ...noPenalty,
        diversityPenalty: 1.0, // Maximum penalty
      };

      // Act
      const noPenaltyScore = suggestionService.scoreAlbum(
        noPenalty,
        DEFAULT_WEIGHTS
      );
      const withPenaltyScore = suggestionService.scoreAlbum(
        withPenalty,
        DEFAULT_WEIGHTS
      );

      // Assert - penalty should reduce score (on average)
      let noPenaltyHigher = 0;
      for (let i = 0; i < 10; i++) {
        const np = suggestionService.scoreAlbum(noPenalty, DEFAULT_WEIGHTS);
        const wp = suggestionService.scoreAlbum(withPenalty, DEFAULT_WEIGHTS);
        if (np > wp) noPenaltyHigher++;
      }
      expect(noPenaltyHigher).toBeGreaterThan(5);
    });

    it('should boost high-rated albums', () => {
      // Arrange
      const lowRated: SuggestionFactors = {
        recencyGap: 30,
        neverPlayed: false,
        recentAddition: 100,
        artistAffinity: 0.5,
        eraPreference: 0.5,
        userRating: 1,
        timeOfDay: 0.5,
        diversityPenalty: 0,
        albumCompleteness: 0.5,
      };

      const highRated: SuggestionFactors = {
        ...lowRated,
        userRating: 5,
      };

      // Act & Assert - high rated should score higher most of the time
      let highRatedHigher = 0;
      for (let i = 0; i < 10; i++) {
        const l = suggestionService.scoreAlbum(lowRated, DEFAULT_WEIGHTS);
        const h = suggestionService.scoreAlbum(highRated, DEFAULT_WEIGHTS);
        if (h > l) highRatedHigher++;
      }
      expect(highRatedHigher).toBeGreaterThan(5);
    });
  });

  describe('generateReason', () => {
    it('should explain never played albums', () => {
      // Arrange
      const factors: SuggestionFactors = {
        recencyGap: 9999,
        neverPlayed: true,
        recentAddition: 100,
        artistAffinity: 0.5,
        eraPreference: 0.5,
        userRating: 0,
        timeOfDay: 0.5,
        diversityPenalty: 0,
        albumCompleteness: 0.5,
      };

      // Act
      const reason = suggestionService.generateReason(factors);

      // Assert
      expect(reason).toContain('never scrobbled');
    });

    it('should explain albums not played in years', () => {
      // Arrange
      const factors: SuggestionFactors = {
        recencyGap: 400, // Over a year
        neverPlayed: false,
        recentAddition: 500,
        artistAffinity: 0.5,
        eraPreference: 0.5,
        userRating: 0,
        timeOfDay: 0.5,
        diversityPenalty: 0,
        albumCompleteness: 0.5,
      };

      // Act
      const reason = suggestionService.generateReason(factors);

      // Assert
      expect(reason).toContain('year');
    });

    it('should explain recently added albums', () => {
      // Arrange
      const factors: SuggestionFactors = {
        recencyGap: 0,
        neverPlayed: false,
        recentAddition: 14, // Two weeks ago
        artistAffinity: 0.5,
        eraPreference: 0.5,
        userRating: 0,
        timeOfDay: 0.5,
        diversityPenalty: 0,
        albumCompleteness: 0.5,
      };

      // Act
      const reason = suggestionService.generateReason(factors);

      // Assert
      expect(reason).toContain('Recently added');
    });

    it('should explain high artist affinity', () => {
      // Arrange
      const factors: SuggestionFactors = {
        recencyGap: 30,
        neverPlayed: false,
        recentAddition: 100,
        artistAffinity: 0.8, // High affinity
        eraPreference: 0.5,
        userRating: 0,
        timeOfDay: 0.5,
        diversityPenalty: 0,
        albumCompleteness: 0.5,
      };

      // Act
      const reason = suggestionService.generateReason(factors);

      // Assert
      expect(reason).toContain('big fan');
    });

    it('should explain high ratings', () => {
      // Arrange
      const factors: SuggestionFactors = {
        recencyGap: 30,
        neverPlayed: false,
        recentAddition: 100,
        artistAffinity: 0.5,
        eraPreference: 0.5,
        userRating: 5,
        timeOfDay: 0.5,
        diversityPenalty: 0,
        albumCompleteness: 0.5,
      };

      // Act
      const reason = suggestionService.generateReason(factors);

      // Assert
      expect(reason).toContain('rated this 5/5');
    });

    it('should return default message when no special factors', () => {
      // Arrange
      const factors: SuggestionFactors = {
        recencyGap: 20, // Not long enough
        neverPlayed: false,
        recentAddition: 100, // Not recent
        artistAffinity: 0.3, // Not high
        eraPreference: 0.5,
        userRating: 2, // Not high
        timeOfDay: 0.3, // Not high
        diversityPenalty: 0,
        albumCompleteness: 0.3, // Not high
      };

      // Act
      const reason = suggestionService.generateReason(factors);

      // Assert
      expect(reason).toBe('Suggested for variety');
    });
  });

  describe('getSuggestions', () => {
    it('should return empty array for empty collection', async () => {
      // Act
      const suggestions = await suggestionService.getSuggestions([], 5);

      // Assert
      expect(suggestions).toEqual([]);
    });

    it('should return requested number of suggestions', async () => {
      // Arrange
      const collection = Array.from({ length: 10 }, (_, i) =>
        createMockCollectionItem({ id: i, title: `Album ${i}` })
      );

      // Act
      const suggestions = await suggestionService.getSuggestions(collection, 5);

      // Assert
      expect(suggestions.length).toBe(5);
    });

    it('should return all if collection is smaller than requested count', async () => {
      // Arrange
      const collection = [
        createMockCollectionItem({ id: 1 }),
        createMockCollectionItem({ id: 2 }),
      ];

      // Act
      const suggestions = await suggestionService.getSuggestions(collection, 5);

      // Assert
      expect(suggestions.length).toBe(2);
    });

    it('should sort suggestions by score descending', async () => {
      // Arrange
      const collection = Array.from({ length: 5 }, (_, i) =>
        createMockCollectionItem({ id: i, title: `Album ${i}` })
      );

      // Act
      const suggestions = await suggestionService.getSuggestions(collection, 5);

      // Assert
      for (let i = 1; i < suggestions.length; i++) {
        expect(suggestions[i - 1].score).toBeGreaterThanOrEqual(
          suggestions[i].score
        );
      }
    });

    it('should include factors and reason in each suggestion', async () => {
      // Arrange
      const collection = [createMockCollectionItem()];

      // Act
      const suggestions = await suggestionService.getSuggestions(collection, 1);

      // Assert
      expect(suggestions[0].factors).toBeDefined();
      expect(suggestions[0].reason).toBeDefined();
      expect(suggestions[0].album).toBeDefined();
      expect(suggestions[0].score).toBeDefined();
    });

    it('should exclude recently played when setting enabled', async () => {
      // Arrange
      const recentlyPlayed = createMockCollectionItem({
        id: 1,
        title: 'Recent',
      });
      const notRecent = createMockCollectionItem({
        id: 2,
        title: 'Not Recent',
      });
      const collection = [recentlyPlayed, notRecent];

      // Mock recently played for first album
      mockHistoryStorage.getAlbumHistory
        .mockResolvedValueOnce({
          lastPlayed: Date.now(),
          playCount: 1,
          plays: [],
        })
        .mockResolvedValue(null);
      mockHistoryStorage.getDaysSinceLastPlayed
        .mockResolvedValueOnce(2) // First album played 2 days ago
        .mockResolvedValue(100); // Others not recently

      // Act
      const suggestions = await suggestionService.getSuggestions(
        collection,
        5,
        {
          excludeRecentlyPlayed: true,
        }
      );

      // Assert - should only include the album not played recently
      expect(suggestions.length).toBe(1);
      expect(suggestions[0].album.release.title).toBe('Not Recent');
    });
  });

  describe('getSuggestion', () => {
    it('should return null for empty collection', async () => {
      // Act
      const suggestion = await suggestionService.getSuggestion([]);

      // Assert
      expect(suggestion).toBeNull();
    });

    it('should return single top suggestion', async () => {
      // Arrange
      const collection = [
        createMockCollectionItem({ id: 1 }),
        createMockCollectionItem({ id: 2 }),
      ];

      // Act
      const suggestion = await suggestionService.getSuggestion(collection);

      // Assert
      expect(suggestion).toBeDefined();
      expect(suggestion?.album).toBeDefined();
    });
  });

  describe('clearSuggestionMemory', () => {
    it('should clear recent suggestions tracking', async () => {
      // Arrange
      const collection = [createMockCollectionItem({ id: 1 })];
      await suggestionService.getSuggestions(collection, 1);

      // Act
      suggestionService.clearSuggestionMemory();

      // Assert - should not throw and subsequent suggestions should work
      const suggestions = await suggestionService.getSuggestions(collection, 1);
      expect(suggestions.length).toBe(1);
    });
  });

  describe('dismissSuggestion', () => {
    it('should apply penalty to dismissed album', async () => {
      // Arrange
      const collection = [
        createMockCollectionItem({ id: 1, title: 'Dismissed' }),
        createMockCollectionItem({ id: 2, title: 'Not Dismissed' }),
      ];

      // Act
      suggestionService.dismissSuggestion(1);
      const suggestions = await suggestionService.getSuggestions(collection, 2);

      // Assert - dismissed album should have lower score
      const dismissed = suggestions.find(s => s.album.id === 1);
      const notDismissed = suggestions.find(s => s.album.id === 2);
      expect(dismissed?.factors.diversityPenalty).toBeGreaterThan(0);
      expect(notDismissed?.factors.diversityPenalty).toBe(0);
    });
  });

  describe('getDefaultWeights', () => {
    it('should return a copy of default weights', () => {
      // Act
      const weights1 = suggestionService.getDefaultWeights();
      const weights2 = suggestionService.getDefaultWeights();

      // Assert
      expect(weights1).toEqual(DEFAULT_WEIGHTS);
      expect(weights1).not.toBe(weights2); // Different objects
    });
  });
});
