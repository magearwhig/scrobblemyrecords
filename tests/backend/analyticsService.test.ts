import { AnalyticsService } from '../../src/backend/services/analyticsService';
import { LastFmService } from '../../src/backend/services/lastfmService';
import { MappingService } from '../../src/backend/services/mappingService';
import { ScrobbleHistoryStorage } from '../../src/backend/services/scrobbleHistoryStorage';
import { CollectionItem } from '../../src/shared/types';

// Mock dependencies
jest.mock('../../src/backend/services/scrobbleHistoryStorage');
jest.mock('../../src/backend/services/lastfmService');
jest.mock('../../src/backend/services/mappingService');

describe('AnalyticsService', () => {
  let analyticsService: AnalyticsService;
  let mockHistoryStorage: jest.Mocked<ScrobbleHistoryStorage>;
  let mockLastFmService: jest.Mocked<LastFmService>;
  let mockMappingService: jest.Mocked<MappingService>;

  // Factory for creating mock collection items
  const createMockCollectionItem = (
    overrides: Partial<{
      id: number;
      artist: string;
      title: string;
    }> = {}
  ): CollectionItem => ({
    id: overrides.id ?? 123,
    date_added: '2024-01-15T00:00:00Z',
    rating: 0,
    release: {
      id: overrides.id ?? 123,
      title: overrides.title ?? 'Test Album',
      artist: overrides.artist ?? 'Test Artist',
      year: 2021,
      format: ['Vinyl', 'LP'],
      label: ['Test Label'],
      cover_image: 'https://example.com/cover.jpg',
      resource_url: 'https://api.discogs.com/releases/123',
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockHistoryStorage = {
      getIndex: jest.fn().mockResolvedValue(null),
      getAlbumHistory: jest.fn().mockResolvedValue(null),
      getHourlyDistribution: jest.fn().mockResolvedValue(new Map()),
      getDayOfWeekDistribution: jest.fn().mockResolvedValue(new Map()),
      getAllAlbums: jest.fn().mockResolvedValue([]),
      getUniqueArtists: jest.fn().mockResolvedValue(new Map()),
      getStorageStats: jest.fn().mockResolvedValue({
        totalAlbums: 0,
        totalScrobbles: 0,
        oldestScrobble: null,
        newestScrobble: null,
        lastSync: null,
        estimatedSizeBytes: 0,
      }),
    } as unknown as jest.Mocked<ScrobbleHistoryStorage>;

    mockLastFmService = {
      getTopArtists: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<LastFmService>;

    mockMappingService = {
      getAlbumMapping: jest.fn().mockResolvedValue(null),
      getArtistMapping: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<MappingService>;

    analyticsService = new AnalyticsService(
      mockHistoryStorage,
      mockLastFmService
    );
  });

  describe('setMappingService', () => {
    it('should set the mapping service', () => {
      // Act
      analyticsService.setMappingService(mockMappingService);

      // Assert - no error thrown
      expect(true).toBe(true);
    });
  });

  describe('getTopArtistsMap', () => {
    it('should return empty map when no artists from Last.fm', async () => {
      // Arrange
      mockLastFmService.getTopArtists.mockResolvedValue([]);

      // Act
      const artists = await analyticsService.getTopArtistsMap();

      // Assert
      expect(artists.size).toBe(0);
    });

    it('should combine artists from multiple time periods', async () => {
      // Arrange
      mockLastFmService.getTopArtists
        .mockResolvedValueOnce([
          {
            name: 'Radiohead',
            playcount: '10',
            url: 'https://last.fm/music/Radiohead',
          },
        ]) // 7day
        .mockResolvedValueOnce([
          {
            name: 'Radiohead',
            playcount: '20',
            url: 'https://last.fm/music/Radiohead',
          },
        ]) // 1month
        .mockResolvedValueOnce([
          {
            name: 'Radiohead',
            playcount: '100',
            url: 'https://last.fm/music/Radiohead',
          },
        ]); // 12month

      // Act
      const artists = await analyticsService.getTopArtistsMap();

      // Assert
      // Expected: 10*3 + 20*2 + 100*1 = 30 + 40 + 100 = 170
      expect(artists.get('radiohead')).toBe(170);
    });

    it('should cache results', async () => {
      // Arrange
      mockLastFmService.getTopArtists.mockResolvedValue([
        {
          name: 'Artist',
          playcount: '10',
          url: 'https://last.fm/music/Artist',
        },
      ]);

      // Act
      await analyticsService.getTopArtistsMap();
      await analyticsService.getTopArtistsMap();

      // Assert - should only call Last.fm once per period (3 calls total)
      expect(mockLastFmService.getTopArtists).toHaveBeenCalledTimes(3);
    });
  });

  describe('getArtistAffinity', () => {
    it('should return 0 when no top artists', async () => {
      // Arrange
      mockLastFmService.getTopArtists.mockResolvedValue([]);

      // Act
      const affinity = await analyticsService.getArtistAffinity('Unknown');

      // Assert
      expect(affinity).toBe(0);
    });

    it('should return 0 for unknown artist', async () => {
      // Arrange
      mockLastFmService.getTopArtists.mockResolvedValue([
        {
          name: 'Radiohead',
          playcount: '100',
          url: 'https://last.fm/music/Radiohead',
        },
      ]);

      // Act
      const affinity =
        await analyticsService.getArtistAffinity('Unknown Artist');

      // Assert
      expect(affinity).toBe(0);
    });

    it('should return 1 for top artist', async () => {
      // Arrange - set all periods to same artist so they combine
      mockLastFmService.getTopArtists.mockResolvedValue([
        {
          name: 'Radiohead',
          playcount: '100',
          url: 'https://last.fm/music/Radiohead',
        },
      ]);

      // Act
      const affinity = await analyticsService.getArtistAffinity('Radiohead');

      // Assert
      expect(affinity).toBe(1);
    });

    it('should return proportional score for other artists', async () => {
      // Arrange
      mockLastFmService.getTopArtists.mockResolvedValue([
        {
          name: 'Radiohead',
          playcount: '100',
          url: 'https://last.fm/music/Radiohead',
        },
        {
          name: 'Pink Floyd',
          playcount: '50',
          url: 'https://last.fm/music/Pink+Floyd',
        },
      ]);

      // Act
      const affinity = await analyticsService.getArtistAffinity('Pink Floyd');

      // Assert
      expect(affinity).toBeLessThan(1);
      expect(affinity).toBeGreaterThan(0);
    });
  });

  describe('getEraPreference', () => {
    it('should return 0.5 when no history', async () => {
      // Arrange
      mockHistoryStorage.getIndex.mockResolvedValue(null);

      // Act
      const preference = await analyticsService.getEraPreference(2000);

      // Assert
      expect(preference).toBe(0.5);
    });

    it('should prefer newer releases', async () => {
      // Arrange
      mockHistoryStorage.getIndex.mockResolvedValue({
        albums: {},
        totalScrobbles: 100,
        lastSyncTimestamp: Date.now(),
        oldestScrobbleDate: 0,
      });

      // Act
      const pref2020 = await analyticsService.getEraPreference(2020);
      const pref1970 = await analyticsService.getEraPreference(1970);

      // Assert
      expect(pref2020).toBeGreaterThan(pref1970);
    });
  });

  describe('getTimeOfDayPreference', () => {
    it('should return 0.5 when no hourly distribution', async () => {
      // Arrange
      mockHistoryStorage.getHourlyDistribution.mockResolvedValue(new Map());

      // Act
      const preference = await analyticsService.getTimeOfDayPreference();

      // Assert
      expect(preference).toBe(0.5);
    });

    it('should return higher score for peak listening hours', async () => {
      // Arrange
      const currentHour = new Date().getHours();
      const hourlyDist = new Map([[currentHour, 100]]);
      mockHistoryStorage.getHourlyDistribution.mockResolvedValue(hourlyDist);
      mockHistoryStorage.getDayOfWeekDistribution.mockResolvedValue(new Map());

      // Act
      const preference = await analyticsService.getTimeOfDayPreference();

      // Assert
      expect(preference).toBeGreaterThan(0);
    });
  });

  describe('getAlbumCompleteness', () => {
    it('should return 0.5 when no track info', async () => {
      // Act
      const completeness = await analyticsService.getAlbumCompleteness(
        'Artist',
        'Album',
        0
      );

      // Assert
      expect(completeness).toBe(0.5);
    });

    it('should return 0.5 when never played', async () => {
      // Arrange
      mockHistoryStorage.getAlbumHistory.mockResolvedValue(null);

      // Act
      const completeness = await analyticsService.getAlbumCompleteness(
        'Artist',
        'Album',
        10
      );

      // Assert
      expect(completeness).toBe(0.5);
    });

    it('should calculate completeness based on plays per session', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);
      mockHistoryStorage.getAlbumHistory.mockResolvedValue({
        lastPlayed: now,
        playCount: 10,
        plays: [
          { timestamp: now },
          { timestamp: now + 60 },
          { timestamp: now + 120 },
          { timestamp: now + 180 },
          { timestamp: now + 240 },
          // New session (more than 2 hours later)
          { timestamp: now + 10000 },
          { timestamp: now + 10060 },
          { timestamp: now + 10120 },
          { timestamp: now + 10180 },
          { timestamp: now + 10240 },
        ],
      });

      // Act
      const completeness = await analyticsService.getAlbumCompleteness(
        'Artist',
        'Album',
        10 // 10 track album
      );

      // Assert - 10 plays / 2 sessions = 5 tracks per session / 10 total = 0.5
      expect(completeness).toBeCloseTo(0.5, 1);
    });
  });

  describe('getMissingAlbums', () => {
    it('should return empty array when no history', async () => {
      // Arrange
      mockHistoryStorage.getAllAlbums.mockResolvedValue([]);

      // Act
      const missing = await analyticsService.getMissingAlbums([]);

      // Assert
      expect(missing).toEqual([]);
    });

    it('should filter out albums with low play counts', async () => {
      // Arrange
      mockHistoryStorage.getAllAlbums.mockResolvedValue([
        {
          key: 'radiohead|kid a',
          artist: 'radiohead',
          album: 'kid a',
          history: { lastPlayed: 0, playCount: 2, plays: [] }, // Less than 3
        },
      ]);

      // Act
      const missing = await analyticsService.getMissingAlbums([]);

      // Assert
      expect(missing).toEqual([]);
    });

    it('should return albums not in collection', async () => {
      // Arrange
      mockHistoryStorage.getAllAlbums.mockResolvedValue([
        {
          key: 'radiohead|kid a',
          artist: 'radiohead',
          album: 'kid a',
          history: { lastPlayed: 1000000, playCount: 50, plays: [] },
        },
      ]);

      // Act
      const missing = await analyticsService.getMissingAlbums([]);

      // Assert
      expect(missing).toHaveLength(1);
      expect(missing[0].artist).toBe('radiohead');
      expect(missing[0].album).toBe('kid a');
    });

    it('should match albums in collection (exact match)', async () => {
      // Arrange
      mockHistoryStorage.getAllAlbums.mockResolvedValue([
        {
          key: 'radiohead|kid a',
          artist: 'radiohead',
          album: 'kid a',
          history: { lastPlayed: 0, playCount: 50, plays: [] },
        },
      ]);
      const collection = [
        createMockCollectionItem({ artist: 'Radiohead', title: 'Kid A' }),
      ];

      // Act
      const missing = await analyticsService.getMissingAlbums(collection);

      // Assert
      expect(missing).toEqual([]);
    });

    it('should match albums with disambiguation suffix', async () => {
      // Arrange
      mockHistoryStorage.getAllAlbums.mockResolvedValue([
        {
          key: 'radiohead|kid a',
          artist: 'radiohead',
          album: 'kid a',
          history: { lastPlayed: 0, playCount: 50, plays: [] },
        },
      ]);
      const collection = [
        createMockCollectionItem({ artist: 'Radiohead (2)', title: 'Kid A' }),
      ];

      // Act
      const missing = await analyticsService.getMissingAlbums(collection);

      // Assert - should match despite "(2)" suffix
      expect(missing).toEqual([]);
    });

    it('should sort by play count descending', async () => {
      // Arrange
      mockHistoryStorage.getAllAlbums.mockResolvedValue([
        {
          key: 'a|a',
          artist: 'artist a',
          album: 'album a',
          history: { lastPlayed: 0, playCount: 10, plays: [] },
        },
        {
          key: 'b|b',
          artist: 'artist b',
          album: 'album b',
          history: { lastPlayed: 0, playCount: 50, plays: [] },
        },
        {
          key: 'c|c',
          artist: 'artist c',
          album: 'album c',
          history: { lastPlayed: 0, playCount: 30, plays: [] },
        },
      ]);

      // Act
      const missing = await analyticsService.getMissingAlbums([]);

      // Assert
      expect(missing[0].playCount).toBe(50);
      expect(missing[1].playCount).toBe(30);
      expect(missing[2].playCount).toBe(10);
    });

    it('should respect limit parameter', async () => {
      // Arrange
      mockHistoryStorage.getAllAlbums.mockResolvedValue(
        Array.from({ length: 50 }, (_, i) => ({
          key: `artist${i}|album${i}`,
          artist: `artist${i}`,
          album: `album${i}`,
          history: { lastPlayed: 0, playCount: 10 + i, plays: [] },
        }))
      );

      // Act
      const missing = await analyticsService.getMissingAlbums([], 10);

      // Assert
      expect(missing).toHaveLength(10);
    });

    it('should skip albums with manual mappings', async () => {
      // Arrange
      analyticsService.setMappingService(mockMappingService);
      mockMappingService.getAlbumMapping.mockResolvedValue({
        historyArtist: 'radiohead',
        historyAlbum: 'kid a',
        collectionId: 123,
        collectionArtist: 'Radiohead',
        collectionAlbum: 'Kid A',
        createdAt: Date.now(),
      });
      mockHistoryStorage.getAllAlbums.mockResolvedValue([
        {
          key: 'radiohead|kid a',
          artist: 'radiohead',
          album: 'kid a',
          history: { lastPlayed: 0, playCount: 50, plays: [] },
        },
      ]);

      // Act
      const missing = await analyticsService.getMissingAlbums([]);

      // Assert - should be skipped due to mapping
      expect(missing).toEqual([]);
    });
  });

  describe('getMissingArtists', () => {
    it('should return empty array when no history', async () => {
      // Arrange
      mockHistoryStorage.getUniqueArtists.mockResolvedValue(new Map());

      // Act
      const missing = await analyticsService.getMissingArtists([]);

      // Assert
      expect(missing).toEqual([]);
    });

    it('should filter out artists with low play counts', async () => {
      // Arrange
      mockHistoryStorage.getUniqueArtists.mockResolvedValue(
        new Map([['radiohead', { playCount: 5, albumCount: 1, lastPlayed: 0 }]]) // Less than 10
      );

      // Act
      const missing = await analyticsService.getMissingArtists([]);

      // Assert
      expect(missing).toEqual([]);
    });

    it('should return artists not in collection', async () => {
      // Arrange
      mockHistoryStorage.getUniqueArtists.mockResolvedValue(
        new Map([
          ['radiohead', { playCount: 100, albumCount: 5, lastPlayed: 1000 }],
        ])
      );

      // Act
      const missing = await analyticsService.getMissingArtists([]);

      // Assert
      expect(missing).toHaveLength(1);
      expect(missing[0].artist).toBe('radiohead');
    });

    it('should match artists in collection', async () => {
      // Arrange
      mockHistoryStorage.getUniqueArtists.mockResolvedValue(
        new Map([
          ['radiohead', { playCount: 100, albumCount: 5, lastPlayed: 0 }],
        ])
      );
      const collection = [createMockCollectionItem({ artist: 'Radiohead' })];

      // Act
      const missing = await analyticsService.getMissingArtists(collection);

      // Assert
      expect(missing).toEqual([]);
    });
  });

  describe('getAnalyticsSummary', () => {
    it('should return summary with no history', async () => {
      // Act
      const summary = await analyticsService.getAnalyticsSummary();

      // Assert
      expect(summary.hasHistory).toBe(false);
      expect(summary.totalScrobbles).toBe(0);
      expect(summary.uniqueAlbums).toBe(0);
    });

    it('should return complete summary with history', async () => {
      // Arrange
      mockHistoryStorage.getStorageStats.mockResolvedValue({
        totalAlbums: 100,
        totalScrobbles: 5000,
        oldestScrobble: new Date('2020-01-01'),
        newestScrobble: new Date(),
        lastSync: new Date(),
        estimatedSizeBytes: 500000,
      });
      mockHistoryStorage.getUniqueArtists.mockResolvedValue(
        new Map([
          ['radiohead', { playCount: 100, albumCount: 5, lastPlayed: 0 }],
          ['pink floyd', { playCount: 50, albumCount: 3, lastPlayed: 0 }],
        ])
      );
      mockHistoryStorage.getHourlyDistribution.mockResolvedValue(
        new Map([
          [20, 500],
          [21, 1000],
          [22, 800],
        ])
      );
      mockHistoryStorage.getDayOfWeekDistribution.mockResolvedValue(
        new Map([
          [5, 1000], // Friday
          [6, 1500], // Saturday
        ])
      );
      mockLastFmService.getTopArtists.mockResolvedValue([
        {
          name: 'Radiohead',
          playcount: '200',
          url: 'https://last.fm/music/Radiohead',
        },
      ]);

      // Act
      const summary = await analyticsService.getAnalyticsSummary();

      // Assert
      expect(summary.hasHistory).toBe(true);
      expect(summary.totalScrobbles).toBe(5000);
      expect(summary.uniqueAlbums).toBe(100);
      expect(summary.uniqueArtists).toBe(2);
      expect(summary.listeningPatterns.peakHour).toBe(21);
      expect(summary.listeningPatterns.peakDay).toBe('Saturday');
    });
  });
});
