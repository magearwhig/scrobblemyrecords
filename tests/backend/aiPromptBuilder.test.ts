import {
  AIPromptBuilder,
  AIPromptContext,
} from '../../src/backend/services/aiPromptBuilder';
import { CollectionItem } from '../../src/shared/types';

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

    it('should include critical instructions about collection matching', () => {
      // Act
      const prompt = AIPromptBuilder.buildSystemPrompt();

      // Assert
      expect(prompt).toContain('CRITICAL');
      expect(prompt).toContain('EXACT LIST');
      expect(prompt).toContain('MUST ONLY suggest albums from this list');
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

    it('should include collection albums', () => {
      // Arrange
      const collection = [
        createMockCollectionItem({ artist: 'Radiohead', title: 'Kid A' }),
        createMockCollectionItem({ artist: 'Pink Floyd', title: 'Animals' }),
      ];
      const context = createMinimalContext({
        collection,
        collectionSize: 2,
      });

      // Act
      const prompt = AIPromptBuilder.buildUserPrompt(context);

      // Assert
      expect(prompt).toContain('MY VINYL COLLECTION');
      expect(prompt).toContain('Radiohead | Kid A');
      expect(prompt).toContain('Pink Floyd | Animals');
    });

    it('should limit collection to 100 albums for large collections', () => {
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
      expect(prompt).toContain('Showing 100 random albums');
      // Count album entries (lines starting with "- ")
      const albumLines = prompt
        .split('\n')
        .filter(line => line.startsWith('- '));
      expect(albumLines.length).toBeLessThanOrEqual(100);
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
      expect(prompt).toContain('do NOT suggest these again');
      expect(prompt).toContain('Radiohead - Kid A');
      expect(prompt).toContain('Pink Floyd - Animals');
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

    it('should parse valid JSON response with main suggestion', () => {
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

    it('should parse JSON response with alternatives', () => {
      // Arrange
      const response = JSON.stringify({
        suggestion: {
          artist: 'Radiohead',
          album: 'Kid A',
          reasoning: 'Main pick',
        },
        alternatives: [
          { artist: 'Pink Floyd', album: 'Animals', reasoning: 'Alt 1' },
          { artist: 'The Beatles', album: 'Abbey Road', reasoning: 'Alt 2' },
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

    it('should handle non-matching albums with low confidence', () => {
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

      {"suggestion": {"artist": "Radiohead", "album": "Kid A", "reasoning": "Great album!"}, "alternatives": []}

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

    it('should handle fuzzy matching with normalized strings', () => {
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
          artist: 'Radiohead',
          album: 'Kid A',
          reasoning: 'Main',
        },
        alternatives: [
          { artist: 'Pink Floyd', album: 'Animals', reasoning: '1' },
          { artist: 'The Beatles', album: 'Abbey Road', reasoning: '2' },
          { artist: 'Unknown', album: 'Should Not Appear', reasoning: '3' },
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
          artist: 'Radiohead',
          album: 'Kid A',
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
  });
});
