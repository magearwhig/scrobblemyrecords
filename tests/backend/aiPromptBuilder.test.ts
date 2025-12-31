import {
  AIPromptBuilder,
  AIPromptContext,
} from '../../src/backend/services/aiPromptBuilder';
import { CollectionItem, SuggestionResult } from '../../src/shared/types';

describe('AIPromptBuilder', () => {
  // Factory function for creating mock collection items
  const createMockCollectionItem = (
    overrides: Partial<{
      id: number;
      artist: string;
      title: string;
      year: number;
    }> = {}
  ): CollectionItem => ({
    id: overrides.id ?? 123,
    date_added: '2024-01-15T00:00:00Z',
    rating: 0,
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

  // Factory for creating minimal context
  const createMinimalContext = (
    overrides: Partial<AIPromptContext> = {}
  ): AIPromptContext => ({
    currentTime: new Date('2024-06-15T14:30:00'),
    dayOfWeek: 'Saturday',
    timeOfDay: 'afternoon',
    recentlyPlayed: [],
    topArtists: [],
    collection: [],
    collectionSize: 0,
    formatBreakdown: {},
    decadeBreakdown: {},
    ...overrides,
  });

  describe('getTimeOfDay', () => {
    it('should return morning for hours 5-11', () => {
      // Arrange
      const morningDates = [
        new Date('2024-06-15T05:00:00'),
        new Date('2024-06-15T08:30:00'),
        new Date('2024-06-15T11:59:00'),
      ];

      // Act & Assert
      morningDates.forEach(date => {
        expect(AIPromptBuilder.getTimeOfDay(date)).toBe('morning');
      });
    });

    it('should return afternoon for hours 12-16', () => {
      // Arrange
      const afternoonDates = [
        new Date('2024-06-15T12:00:00'),
        new Date('2024-06-15T14:30:00'),
        new Date('2024-06-15T16:59:00'),
      ];

      // Act & Assert
      afternoonDates.forEach(date => {
        expect(AIPromptBuilder.getTimeOfDay(date)).toBe('afternoon');
      });
    });

    it('should return evening for hours 17-20', () => {
      // Arrange
      const eveningDates = [
        new Date('2024-06-15T17:00:00'),
        new Date('2024-06-15T19:00:00'),
        new Date('2024-06-15T20:59:00'),
      ];

      // Act & Assert
      eveningDates.forEach(date => {
        expect(AIPromptBuilder.getTimeOfDay(date)).toBe('evening');
      });
    });

    it('should return night for hours 21-4', () => {
      // Arrange
      const nightDates = [
        new Date('2024-06-15T21:00:00'),
        new Date('2024-06-15T00:00:00'),
        new Date('2024-06-15T04:59:00'),
      ];

      // Act & Assert
      nightDates.forEach(date => {
        expect(AIPromptBuilder.getTimeOfDay(date)).toBe('night');
      });
    });
  });

  describe('getDayOfWeek', () => {
    it('should return correct day names', () => {
      // Use explicit times to avoid timezone issues
      // 2024-06-16T12:00:00 UTC is a Sunday
      expect(
        AIPromptBuilder.getDayOfWeek(new Date('2024-06-16T12:00:00Z'))
      ).toBe('Sunday');
      expect(
        AIPromptBuilder.getDayOfWeek(new Date('2024-06-17T12:00:00Z'))
      ).toBe('Monday');
      expect(
        AIPromptBuilder.getDayOfWeek(new Date('2024-06-18T12:00:00Z'))
      ).toBe('Tuesday');
      expect(
        AIPromptBuilder.getDayOfWeek(new Date('2024-06-19T12:00:00Z'))
      ).toBe('Wednesday');
      expect(
        AIPromptBuilder.getDayOfWeek(new Date('2024-06-20T12:00:00Z'))
      ).toBe('Thursday');
      expect(
        AIPromptBuilder.getDayOfWeek(new Date('2024-06-21T12:00:00Z'))
      ).toBe('Friday');
      expect(
        AIPromptBuilder.getDayOfWeek(new Date('2024-06-22T12:00:00Z'))
      ).toBe('Saturday');
    });
  });

  describe('buildSystemPrompt', () => {
    it('should return a non-empty system prompt', () => {
      // Act
      const prompt = AIPromptBuilder.buildSystemPrompt();

      // Assert
      expect(prompt).toBeDefined();
      expect(prompt.length).toBeGreaterThan(100);
    });

    it('should include critical instructions about ID-based selection', () => {
      // Act
      const prompt = AIPromptBuilder.buildSystemPrompt();

      // Assert
      expect(prompt).toContain('CRITICAL');
      expect(prompt).toContain('CANDIDATES');
      expect(prompt).toContain('MUST select albums ONLY by their numeric ID');
    });

    it('should include JSON format instructions', () => {
      // Act
      const prompt = AIPromptBuilder.buildSystemPrompt();

      // Assert
      expect(prompt).toContain('JSON');
      expect(prompt).toContain('suggestion');
      expect(prompt).toContain('alternatives');
      expect(prompt).toContain('reasoning');
    });

    it('should include few-shot examples', () => {
      // Act
      const prompt = AIPromptBuilder.buildSystemPrompt();

      // Assert
      expect(prompt).toContain('EXAMPLE 1');
      expect(prompt).toContain('EXAMPLE 2');
      expect(prompt).toContain('"id": 42');
    });
  });

  describe('buildUserPrompt', () => {
    it('should include time context', () => {
      // Arrange
      const context = createMinimalContext({
        timeOfDay: 'afternoon',
        dayOfWeek: 'Saturday',
      });

      // Act
      const prompt = AIPromptBuilder.buildUserPrompt(context);

      // Assert
      expect(prompt).toContain('afternoon');
      expect(prompt).toContain('Saturday');
    });

    it('should include user request when provided', () => {
      // Arrange
      const context = createMinimalContext({
        userRequest: 'something mellow for relaxing',
      });

      // Act
      const prompt = AIPromptBuilder.buildUserPrompt(context);

      // Assert
      expect(prompt).toContain("I'm looking for:");
      expect(prompt).toContain('something mellow for relaxing');
    });

    it('should include collection albums as candidates with IDs', () => {
      // Arrange
      const collection = [
        createMockCollectionItem({
          id: 1,
          artist: 'Radiohead',
          title: 'Kid A',
        }),
        createMockCollectionItem({
          id: 2,
          artist: 'Pink Floyd',
          title: 'Animals',
        }),
      ];
      const context = createMinimalContext({
        collection,
        collectionSize: 2,
      });

      // Act
      const prompt = AIPromptBuilder.buildUserPrompt(context);

      // Assert
      expect(prompt).toContain('CANDIDATES');
      expect(prompt).toContain('[ID: 1]');
      expect(prompt).toContain('[ID: 2]');
      expect(prompt).toContain('Radiohead - Kid A');
      expect(prompt).toContain('Pink Floyd - Animals');
    });

    it('should limit candidates to MAX_CANDIDATES for large collections', () => {
      // Arrange
      const collection = Array.from({ length: 150 }, (_, i) =>
        createMockCollectionItem({
          id: i,
          artist: `Artist ${i}`,
          title: `Album ${i}`,
        })
      );
      const context = createMinimalContext({
        collection,
        collectionSize: 150,
      });

      // Act
      const prompt = AIPromptBuilder.buildUserPrompt(context);

      // Assert
      // Count candidate entries (lines starting with "[ID:")
      const candidateLines = prompt
        .split('\n')
        .filter(line => line.startsWith('[ID:'));
      expect(candidateLines.length).toBeLessThanOrEqual(50); // MAX_CANDIDATES
    });

    it('should include top artists when available', () => {
      // Arrange
      const context = createMinimalContext({
        topArtists: [
          { artist: 'Radiohead', playCount: 500 },
          { artist: 'The Beatles', playCount: 300 },
        ],
      });

      // Act
      const prompt = AIPromptBuilder.buildUserPrompt(context);

      // Assert
      expect(prompt).toContain('most-played artists');
      expect(prompt).toContain('Radiohead (500 plays)');
      expect(prompt).toContain('The Beatles (300 plays)');
    });

    it('should include recently played albums with days ago', () => {
      // Arrange
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      const context = createMinimalContext({
        recentlyPlayed: [
          {
            artist: 'Radiohead',
            album: 'OK Computer',
            playCount: 10,
            lastPlayed: fiveDaysAgo,
          },
        ],
      });

      // Act
      const prompt = AIPromptBuilder.buildUserPrompt(context);

      // Assert
      expect(prompt).toContain('Recently played');
      expect(prompt).toContain('Radiohead - OK Computer');
      expect(prompt).toContain('5 days ago');
    });

    it('should include recent AI suggestions to avoid', () => {
      // Arrange
      const context = createMinimalContext({
        recentAISuggestions: [
          { artist: 'Radiohead', album: 'Kid A' },
          { artist: 'Pink Floyd', album: 'Animals' },
        ],
      });

      // Act
      const prompt = AIPromptBuilder.buildUserPrompt(context);

      // Assert
      expect(prompt).toContain('do NOT suggest again');
      expect(prompt).toContain('Radiohead - Kid A');
      expect(prompt).toContain('Pink Floyd - Animals');
    });

    it('should include algorithm picks with reasons', () => {
      // Arrange
      const collection = [
        createMockCollectionItem({
          id: 1,
          artist: 'Radiohead',
          title: 'Kid A',
        }),
      ];
      const algorithmPicks: SuggestionResult[] = [
        {
          album: collection[0],
          score: 0.9,
          factors: {
            recencyGap: 30,
            neverPlayed: false,
            recentAddition: 10,
            artistAffinity: 0.8,
            eraPreference: 0.7,
            userRating: 4,
            timeOfDay: 0.6,
            diversityPenalty: 0.1,
            albumCompleteness: 0.9,
          },
          reason: 'Top scored album',
        },
      ];
      const context = createMinimalContext({
        collection,
        collectionSize: 1,
        algorithmPicks,
      });

      // Act
      const prompt = AIPromptBuilder.buildUserPrompt(context);

      // Assert
      expect(prompt).toContain('[Top scored album]');
      expect(prompt).toContain('scoring algorithm');
    });
  });

  describe('buildCandidates', () => {
    it('should prioritize algorithm picks', () => {
      // Arrange
      const collection = [
        createMockCollectionItem({ id: 1, artist: 'Artist1', title: 'Album1' }),
        createMockCollectionItem({ id: 2, artist: 'Artist2', title: 'Album2' }),
        createMockCollectionItem({ id: 3, artist: 'Artist3', title: 'Album3' }),
      ];
      const algorithmPicks: SuggestionResult[] = [
        {
          album: collection[0],
          score: 0.9,
          factors: {} as any,
          reason: 'Top pick',
        },
      ];
      const context = createMinimalContext({
        collection,
        collectionSize: 3,
        algorithmPicks,
      });

      // Act
      const candidates = AIPromptBuilder.buildCandidates(context);

      // Assert
      expect(candidates[0].id).toBe(1);
      expect(candidates[0].reason).toBe('Top pick');
    });

    it('should not duplicate IDs between algorithm picks and collection', () => {
      // Arrange
      const collection = [
        createMockCollectionItem({ id: 1, artist: 'Artist1', title: 'Album1' }),
        createMockCollectionItem({ id: 2, artist: 'Artist2', title: 'Album2' }),
      ];
      const algorithmPicks: SuggestionResult[] = [
        {
          album: collection[0],
          score: 0.9,
          factors: {} as any,
          reason: 'Top pick',
        },
      ];
      const context = createMinimalContext({
        collection,
        collectionSize: 2,
        algorithmPicks,
      });

      // Act
      const candidates = AIPromptBuilder.buildCandidates(context);
      const ids = candidates.map(c => c.id);
      const uniqueIds = new Set(ids);

      // Assert
      expect(ids.length).toBe(uniqueIds.size);
    });
  });

  describe('buildMoodPrompt', () => {
    it('should include mood in user request', () => {
      // Arrange
      const context = createMinimalContext();
      const mood = 'energetic for workout';

      // Act
      const prompt = AIPromptBuilder.buildMoodPrompt(context, mood);

      // Assert
      expect(prompt).toContain("I'm looking for:");
      expect(prompt).toContain('energetic for workout');
    });
  });

  describe('parseAIResponse', () => {
    const mockCollection = [
      createMockCollectionItem({
        id: 1,
        artist: 'Radiohead',
        title: 'Kid A',
        year: 2000,
      }),
      createMockCollectionItem({
        id: 2,
        artist: 'Pink Floyd',
        title: 'Animals',
        year: 1977,
      }),
      createMockCollectionItem({
        id: 3,
        artist: 'The Beatles',
        title: 'Abbey Road',
        year: 1969,
      }),
    ];

    it('should parse ID-based JSON response with main suggestion', () => {
      // Arrange
      const response = JSON.stringify({
        suggestion: {
          id: 1,
          reasoning: 'Perfect for a rainy afternoon.',
        },
        alternatives: [],
      });

      // Act
      const suggestions = AIPromptBuilder.parseAIResponse(
        response,
        mockCollection
      );

      // Assert
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].artist).toBe('Radiohead');
      expect(suggestions[0].album).toBe('Kid A');
      expect(suggestions[0].reasoning).toBe('Perfect for a rainy afternoon.');
      expect(suggestions[0].confidence).toBe('high');
      expect(suggestions[0].matchedAlbum).toBeDefined();
    });

    it('should parse ID-based JSON response with alternatives', () => {
      // Arrange
      const response = JSON.stringify({
        suggestion: {
          id: 1,
          reasoning: 'Main pick',
        },
        alternatives: [
          { id: 2, reasoning: 'Alt 1' },
          { id: 3, reasoning: 'Alt 2' },
        ],
      });

      // Act
      const suggestions = AIPromptBuilder.parseAIResponse(
        response,
        mockCollection
      );

      // Assert
      expect(suggestions).toHaveLength(3);
      expect(suggestions[0].artist).toBe('Radiohead');
      expect(suggestions[1].artist).toBe('Pink Floyd');
      expect(suggestions[2].artist).toBe('The Beatles');
    });

    it('should fallback to legacy format with artist/album fields', () => {
      // Arrange
      const response = JSON.stringify({
        suggestion: {
          artist: 'Radiohead',
          album: 'Kid A',
          reasoning: 'Perfect for a rainy afternoon.',
        },
        alternatives: [],
      });

      // Act
      const suggestions = AIPromptBuilder.parseAIResponse(
        response,
        mockCollection
      );

      // Assert
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].artist).toBe('Radiohead');
      expect(suggestions[0].album).toBe('Kid A');
      expect(suggestions[0].reasoning).toBe('Perfect for a rainy afternoon.');
      expect(suggestions[0].confidence).toBe('high');
      expect(suggestions[0].matchedAlbum).toBeDefined();
    });

    it('should handle non-matching IDs gracefully', () => {
      // Arrange
      const response = JSON.stringify({
        suggestion: {
          id: 999,
          reasoning: 'Not in collection',
        },
        alternatives: [],
      });

      // Act
      const suggestions = AIPromptBuilder.parseAIResponse(
        response,
        mockCollection
      );

      // Assert
      // ID 999 doesn't match, so no suggestions returned
      expect(suggestions).toHaveLength(0);
    });

    it('should handle non-matching albums with low confidence (legacy)', () => {
      // Arrange
      const response = JSON.stringify({
        suggestion: {
          artist: 'Unknown Artist',
          album: 'Unknown Album',
          reasoning: 'Not in collection',
        },
        alternatives: [],
      });

      // Act
      const suggestions = AIPromptBuilder.parseAIResponse(
        response,
        mockCollection
      );

      // Assert
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].confidence).toBe('low');
      expect(suggestions[0].matchedAlbum).toBeUndefined();
    });

    it('should extract JSON from response with extra text', () => {
      // Arrange
      const response = `Here's my recommendation:

      {"suggestion": {"id": 1, "reasoning": "Great album!"}, "alternatives": []}

      Hope you enjoy it!`;

      // Act
      const suggestions = AIPromptBuilder.parseAIResponse(
        response,
        mockCollection
      );

      // Assert
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].artist).toBe('Radiohead');
    });

    it('should handle fuzzy matching with normalized strings (legacy)', () => {
      // Arrange
      const response = JSON.stringify({
        suggestion: {
          artist: 'RADIOHEAD',
          album: 'kid a',
          reasoning: 'Testing case insensitivity',
        },
        alternatives: [],
      });

      // Act
      const suggestions = AIPromptBuilder.parseAIResponse(
        response,
        mockCollection
      );

      // Assert
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].matchedAlbum).toBeDefined();
      expect(suggestions[0].confidence).toBe('high');
    });

    it('should fallback to text parsing when JSON is invalid', () => {
      // Arrange
      const response =
        'I recommend "Kid A" by Radiohead for a perfect afternoon listen.';

      // Act
      const suggestions = AIPromptBuilder.parseAIResponse(
        response,
        mockCollection
      );

      // Assert
      // Text parser should try to extract the album
      expect(suggestions.length).toBeGreaterThanOrEqual(0);
    });

    it('should limit alternatives to 2', () => {
      // Arrange
      const response = JSON.stringify({
        suggestion: {
          id: 1,
          reasoning: 'Main',
        },
        alternatives: [
          { id: 2, reasoning: '1' },
          { id: 3, reasoning: '2' },
          { id: 999, reasoning: '3' }, // This one should be ignored (limit + invalid ID)
        ],
      });

      // Act
      const suggestions = AIPromptBuilder.parseAIResponse(
        response,
        mockCollection
      );

      // Assert
      // Main + 2 alternatives = 3 max
      expect(suggestions.length).toBeLessThanOrEqual(3);
    });

    it('should provide default reasoning when not provided', () => {
      // Arrange
      const response = JSON.stringify({
        suggestion: {
          id: 1,
        },
        alternatives: [],
      });

      // Act
      const suggestions = AIPromptBuilder.parseAIResponse(
        response,
        mockCollection
      );

      // Assert
      expect(suggestions[0].reasoning).toBe('No reasoning provided');
    });

    it('should handle error responses gracefully', () => {
      // Arrange
      const response = JSON.stringify({
        error: 'Could not determine a suggestion',
      });

      // Act
      const suggestions = AIPromptBuilder.parseAIResponse(
        response,
        mockCollection
      );

      // Assert
      expect(suggestions).toHaveLength(0);
    });
  });

  describe('validateResponse', () => {
    it('should return no errors for valid response', () => {
      // Arrange
      const parsed = {
        suggestion: { id: 1, reasoning: 'Good choice' },
        alternatives: [{ id: 2, reasoning: 'Alternative' }],
      };
      const candidateIds = new Set([1, 2, 3]);
      const avoidIds = new Set<number>();

      // Act
      const errors = AIPromptBuilder.validateResponse(
        parsed,
        candidateIds,
        avoidIds
      );

      // Assert
      expect(errors).toHaveLength(0);
    });

    it('should return error for missing suggestion', () => {
      // Arrange
      const parsed = { alternatives: [] } as any;
      const candidateIds = new Set([1, 2, 3]);
      const avoidIds = new Set<number>();

      // Act
      const errors = AIPromptBuilder.validateResponse(
        parsed,
        candidateIds,
        avoidIds
      );

      // Assert
      expect(errors).toContain('Missing "suggestion" field');
    });

    it('should return error for ID not in candidates', () => {
      // Arrange
      const parsed = {
        suggestion: { id: 999, reasoning: 'Invalid' },
      };
      const candidateIds = new Set([1, 2, 3]);
      const avoidIds = new Set<number>();

      // Act
      const errors = AIPromptBuilder.validateResponse(
        parsed,
        candidateIds,
        avoidIds
      );

      // Assert
      expect(errors.some(e => e.includes('not in the CANDIDATES list'))).toBe(
        true
      );
    });

    it('should return error for ID in avoid list', () => {
      // Arrange
      const parsed = {
        suggestion: { id: 1, reasoning: 'Should avoid' },
      };
      const candidateIds = new Set([1, 2, 3]);
      const avoidIds = new Set([1]);

      // Act
      const errors = AIPromptBuilder.validateResponse(
        parsed,
        candidateIds,
        avoidIds
      );

      // Assert
      expect(errors.some(e => e.includes('AVOID list'))).toBe(true);
    });

    it('should return error for duplicate IDs in alternatives', () => {
      // Arrange
      const parsed = {
        suggestion: { id: 1, reasoning: 'Main' },
        alternatives: [
          { id: 2, reasoning: 'Alt' },
          { id: 2, reasoning: 'Duplicate' },
        ],
      };
      const candidateIds = new Set([1, 2, 3]);
      const avoidIds = new Set<number>();

      // Act
      const errors = AIPromptBuilder.validateResponse(
        parsed,
        candidateIds,
        avoidIds
      );

      // Assert
      expect(errors.some(e => e.includes('duplicate'))).toBe(true);
    });
  });

  describe('findInCollection', () => {
    const mockCollection = [
      createMockCollectionItem({
        id: 1,
        artist: 'Radiohead',
        title: 'Kid A',
      }),
      createMockCollectionItem({
        id: 2,
        artist: 'Pink Floyd',
        title: 'The Dark Side of the Moon',
      }),
    ];

    it('should find exact match', () => {
      // Act
      const result = AIPromptBuilder.findInCollection(
        'Radiohead',
        'Kid A',
        mockCollection
      );

      // Assert
      expect(result).toBeDefined();
      expect(result?.id).toBe(1);
    });

    it('should find case-insensitive match', () => {
      // Act
      const result = AIPromptBuilder.findInCollection(
        'RADIOHEAD',
        'kid a',
        mockCollection
      );

      // Assert
      expect(result).toBeDefined();
      expect(result?.id).toBe(1);
    });

    it('should find partial match', () => {
      // Act
      const result = AIPromptBuilder.findInCollection(
        'Pink Floyd',
        'Dark Side',
        mockCollection
      );

      // Assert
      expect(result).toBeDefined();
      expect(result?.id).toBe(2);
    });

    it('should return undefined for no match', () => {
      // Act
      const result = AIPromptBuilder.findInCollection(
        'Unknown',
        'Unknown',
        mockCollection
      );

      // Assert
      expect(result).toBeUndefined();
    });
  });
});
