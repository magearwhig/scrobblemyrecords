import { ArtistNameResolver } from '../../src/backend/services/artistNameResolver';
import { MappingService } from '../../src/backend/services/mappingService';
import { ScrobbleHistoryStorage } from '../../src/backend/services/scrobbleHistoryStorage';
import { StatsService } from '../../src/backend/services/statsService';
import { TrackMappingService } from '../../src/backend/services/trackMappingService';
import { FileStorage } from '../../src/backend/utils/fileStorage';
import { CollectionItem, ScrobbleHistoryIndex } from '../../src/shared/types';

// Mock dependencies
jest.mock('../../src/backend/services/scrobbleHistoryStorage');
jest.mock('../../src/backend/utils/fileStorage');
jest.mock('../../src/backend/services/trackMappingService');
jest.mock('../../src/backend/services/mappingService');
jest.mock('../../src/backend/services/artistNameResolver');

describe('StatsService', () => {
  let statsService: StatsService;
  let mockFileStorage: jest.Mocked<FileStorage>;
  let mockHistoryStorage: jest.Mocked<ScrobbleHistoryStorage>;

  // Factory for creating mock collection items
  const createMockCollectionItem = (
    overrides: Partial<{
      id: number;
      artist: string;
      title: string;
      coverImage: string;
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
      cover_image: overrides.coverImage ?? 'https://example.com/cover.jpg',
      resource_url: 'https://api.discogs.com/releases/123',
    },
  });

  // Helper to create a mock history index
  const createMockIndex = (
    albums: Record<
      string,
      { lastPlayed: number; playCount: number; plays: { timestamp: number }[] }
    > = {}
  ): ScrobbleHistoryIndex => ({
    albums,
    totalScrobbles: Object.values(albums).reduce(
      (sum, a) => sum + a.playCount,
      0
    ),
    lastSyncTimestamp: Math.floor(Date.now() / 1000),
    oldestScrobbleDate: 0,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockFileStorage = {
      readJSON: jest.fn().mockResolvedValue(null),
      writeJSON: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<FileStorage>;

    mockHistoryStorage = {
      getIndex: jest.fn().mockResolvedValue(null),
      getAlbumHistoryFuzzy: jest.fn().mockResolvedValue({
        entry: null,
        matchType: 'none',
      }),
      getTotalScrobbles: jest.fn().mockResolvedValue(0),
      fuzzyNormalizeKey: jest
        .fn()
        .mockImplementation((artist: string, album: string) => {
          const norm = (s: string) =>
            s
              .replace(/\s*\(\d+\)\s*$/g, '')
              .toLowerCase()
              .replace(/[^a-z0-9]/g, '');
          return `${norm(artist)}|${norm(album)}`;
        }),
    } as unknown as jest.Mocked<ScrobbleHistoryStorage>;

    statsService = new StatsService(mockFileStorage, mockHistoryStorage);
  });

  describe('calculateStreaks', () => {
    it('should return zeros when no history', async () => {
      // Arrange
      mockHistoryStorage.getIndex.mockResolvedValue(null);

      // Act
      const streaks = await statsService.calculateStreaks();

      // Assert
      expect(streaks.currentStreak).toBe(0);
      expect(streaks.longestStreak).toBe(0);
    });

    it('should return zeros when no plays', async () => {
      // Arrange
      mockHistoryStorage.getIndex.mockResolvedValue(createMockIndex({}));

      // Act
      const streaks = await statsService.calculateStreaks();

      // Assert
      expect(streaks.currentStreak).toBe(0);
      expect(streaks.longestStreak).toBe(0);
    });

    it('should calculate a single day streak', async () => {
      // Arrange
      const today = new Date();
      today.setHours(12, 0, 0, 0);
      const todayTimestamp = Math.floor(today.getTime() / 1000);

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'artist|album': {
            lastPlayed: todayTimestamp,
            playCount: 1,
            plays: [{ timestamp: todayTimestamp }],
          },
        })
      );

      // Act
      const streaks = await statsService.calculateStreaks();

      // Assert
      expect(streaks.currentStreak).toBe(1);
      expect(streaks.longestStreak).toBe(1);
    });

    it('should calculate consecutive day streaks', async () => {
      // Arrange
      const now = new Date();
      now.setHours(12, 0, 0, 0);

      // Create plays for 5 consecutive days ending today
      const plays: { timestamp: number }[] = [];
      for (let i = 0; i < 5; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        plays.push({ timestamp: Math.floor(date.getTime() / 1000) });
      }

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'artist|album': {
            lastPlayed: plays[0].timestamp,
            playCount: plays.length,
            plays,
          },
        })
      );

      // Act
      const streaks = await statsService.calculateStreaks();

      // Assert
      expect(streaks.currentStreak).toBe(5);
      expect(streaks.longestStreak).toBe(5);
    });

    it('should detect broken streaks', async () => {
      // Arrange
      const now = new Date();
      now.setHours(12, 0, 0, 0);

      // 3 days ago, 2 days ago (current streak = 2)
      // Gap
      // 10 days ago to 7 days ago (old streak = 4)
      const plays: { timestamp: number }[] = [];

      // Current streak
      for (let i = 2; i <= 3; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        plays.push({ timestamp: Math.floor(date.getTime() / 1000) });
      }

      // Old longer streak
      for (let i = 7; i <= 10; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        plays.push({ timestamp: Math.floor(date.getTime() / 1000) });
      }

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'artist|album': {
            lastPlayed: plays[0].timestamp,
            playCount: plays.length,
            plays,
          },
        })
      );

      // Act
      const streaks = await statsService.calculateStreaks();

      // Assert
      // Current streak should be 0 (nothing today or yesterday)
      expect(streaks.currentStreak).toBe(0);
      // Longest streak should be 4 (the older streak)
      expect(streaks.longestStreak).toBe(4);
    });
  });

  describe('getScrobbleCounts', () => {
    it('should return zeros when no history', async () => {
      // Arrange
      mockHistoryStorage.getIndex.mockResolvedValue(null);

      // Act
      const counts = await statsService.getScrobbleCounts();

      // Assert
      expect(counts.today).toBe(0);
      expect(counts.thisWeek).toBe(0);
      expect(counts.thisMonth).toBe(0);
      expect(counts.thisYear).toBe(0);
      expect(counts.allTime).toBe(0);
    });

    it('should count scrobbles correctly', async () => {
      // Arrange - Use noon to avoid midnight boundary issues
      const today = new Date();
      today.setHours(12, 0, 0, 0);
      const todayTimestamp = Math.floor(today.getTime() / 1000);

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'artist|album': {
            lastPlayed: todayTimestamp,
            playCount: 5,
            plays: [
              { timestamp: todayTimestamp },
              { timestamp: todayTimestamp - 3600 }, // 1 hour ago (11am)
              { timestamp: todayTimestamp - 7200 }, // 2 hours ago (10am)
              { timestamp: todayTimestamp - 86400 * 3 }, // 3 days ago
              { timestamp: todayTimestamp - 86400 * 40 }, // 40 days ago
            ],
          },
        })
      );

      // Act
      const counts = await statsService.getScrobbleCounts();

      // Assert
      expect(counts.today).toBe(3); // 3 scrobbles today
      expect(counts.allTime).toBe(5);
    });
  });

  describe('getListeningHours', () => {
    it('should return zeros when no history', async () => {
      // Arrange
      mockHistoryStorage.getIndex.mockResolvedValue(null);

      // Act
      const hours = await statsService.getListeningHours();

      // Assert
      expect(hours.today).toBe(0);
      expect(hours.thisWeek).toBe(0);
      expect(hours.thisMonth).toBe(0);
    });

    it('should estimate listening hours based on track counts', async () => {
      // Arrange
      const now = new Date();
      const todayTimestamp = Math.floor(now.getTime() / 1000);

      // 10 scrobbles today = 10 * 3.5 min = 35 min = 0.6 hours
      const plays = Array.from({ length: 10 }, (_, i) => ({
        timestamp: todayTimestamp - i * 300,
      }));

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'artist|album': {
            lastPlayed: todayTimestamp,
            playCount: 10,
            plays,
          },
        })
      );

      // Act
      const hours = await statsService.getListeningHours();

      // Assert
      expect(hours.today).toBeCloseTo(0.6, 1); // 10 * 210 sec / 3600 = 0.58
    });
  });

  describe('getTopArtists', () => {
    it('should return empty array when no history', async () => {
      // Arrange
      mockHistoryStorage.getIndex.mockResolvedValue(null);

      // Act
      const topArtists = await statsService.getTopArtists('all', 10);

      // Assert
      expect(topArtists).toEqual([]);
    });

    it('should return top artists sorted by play count', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'radiohead|kid a': {
            lastPlayed: now,
            playCount: 50,
            plays: Array.from({ length: 50 }, () => ({ timestamp: now })),
          },
          'radiohead|ok computer': {
            lastPlayed: now,
            playCount: 30,
            plays: Array.from({ length: 30 }, () => ({ timestamp: now })),
          },
          'pink floyd|the wall': {
            lastPlayed: now,
            playCount: 40,
            plays: Array.from({ length: 40 }, () => ({ timestamp: now })),
          },
        })
      );

      // Act
      const topArtists = await statsService.getTopArtists('all', 10);

      // Assert
      expect(topArtists).toHaveLength(2);
      expect(topArtists[0].artist).toBe('Radiohead');
      expect(topArtists[0].playCount).toBe(80); // Combined from both albums
      expect(topArtists[1].artist).toBe('Pink Floyd');
      expect(topArtists[1].playCount).toBe(40);
    });

    it('should respect limit parameter', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);
      const albums: Record<string, any> = {};

      for (let i = 0; i < 20; i++) {
        albums[`artist${i}|album`] = {
          lastPlayed: now,
          playCount: 10,
          plays: Array.from({ length: 10 }, () => ({ timestamp: now })),
        };
      }

      mockHistoryStorage.getIndex.mockResolvedValue(createMockIndex(albums));

      // Act
      const topArtists = await statsService.getTopArtists('all', 5);

      // Assert
      expect(topArtists).toHaveLength(5);
    });
  });

  describe('getTopAlbums', () => {
    it('should return empty array when no history', async () => {
      // Arrange
      mockHistoryStorage.getIndex.mockResolvedValue(null);

      // Act
      const topAlbums = await statsService.getTopAlbums('all', 10);

      // Assert
      expect(topAlbums).toEqual([]);
    });

    it('should return top albums sorted by play count', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'radiohead|kid a': {
            lastPlayed: now,
            playCount: 50,
            plays: Array.from({ length: 50 }, () => ({ timestamp: now })),
          },
          'pink floyd|the wall': {
            lastPlayed: now,
            playCount: 30,
            plays: Array.from({ length: 30 }, () => ({ timestamp: now })),
          },
        })
      );

      // Act
      const topAlbums = await statsService.getTopAlbums('all', 10);

      // Assert
      expect(topAlbums).toHaveLength(2);
      expect(topAlbums[0].album).toBe('Kid A');
      expect(topAlbums[0].playCount).toBe(50);
      expect(topAlbums[1].album).toBe('The Wall');
      expect(topAlbums[1].playCount).toBe(30);
    });

    it('should filter by time period', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);
      const oneMonthAgo = now - 35 * 24 * 60 * 60; // 35 days ago

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'radiohead|kid a': {
            lastPlayed: now,
            playCount: 30,
            plays: Array.from({ length: 30 }, () => ({ timestamp: now })),
          },
          'pink floyd|the wall': {
            lastPlayed: oneMonthAgo,
            playCount: 50,
            plays: Array.from({ length: 50 }, () => ({
              timestamp: oneMonthAgo,
            })),
          },
        })
      );

      // Act
      const topAlbums = await statsService.getTopAlbums('month', 10);

      // Assert
      // Only Kid A should be in this month
      expect(topAlbums).toHaveLength(1);
      expect(topAlbums[0].album).toBe('Kid A');
    });
  });

  describe('getTopAlbums collection enrichment', () => {
    it('should set inCollection when album matches collection item', async () => {
      const now = Math.floor(Date.now() / 1000);
      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'radiohead|ok computer': {
            lastPlayed: now,
            playCount: 50,
            plays: Array.from({ length: 50 }, () => ({ timestamp: now })),
          },
        })
      );
      mockHistoryStorage.fuzzyNormalizeKey.mockImplementation(
        (artist: string, album: string) => {
          return `${artist.toLowerCase().replace(/[^a-z0-9]/g, '')}|${album.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
        }
      );

      const collection = [
        createMockCollectionItem({
          artist: 'Radiohead',
          title: 'OK Computer',
          id: 456,
        }),
      ];

      const topAlbums = await statsService.getTopAlbums(
        'all',
        10,
        undefined,
        undefined,
        collection
      );

      expect(topAlbums).toHaveLength(1);
      expect(topAlbums[0].inCollection).toBe(true);
      expect(topAlbums[0].collectionReleaseId).toBe(456);
    });

    it('should not set inCollection when album is not in collection', async () => {
      const now = Math.floor(Date.now() / 1000);
      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'radiohead|ok computer': {
            lastPlayed: now,
            playCount: 50,
            plays: Array.from({ length: 50 }, () => ({ timestamp: now })),
          },
        })
      );
      mockHistoryStorage.fuzzyNormalizeKey.mockImplementation(
        (artist: string, album: string) => {
          return `${artist.toLowerCase().replace(/[^a-z0-9]/g, '')}|${album.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
        }
      );

      const collection = [
        createMockCollectionItem({
          artist: 'Pink Floyd',
          title: 'The Wall',
        }),
      ];

      const topAlbums = await statsService.getTopAlbums(
        'all',
        10,
        undefined,
        undefined,
        collection
      );

      expect(topAlbums).toHaveLength(1);
      expect(topAlbums[0].inCollection).toBeUndefined();
    });

    it('should match Discogs disambiguation artist via fuzzy key', async () => {
      const now = Math.floor(Date.now() / 1000);
      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'nirvana|nevermind': {
            lastPlayed: now,
            playCount: 100,
            plays: Array.from({ length: 100 }, () => ({ timestamp: now })),
          },
        })
      );
      mockHistoryStorage.fuzzyNormalizeKey.mockImplementation(
        (artist: string, album: string) => {
          // Simulate fuzzy normalization that strips disambiguation numbers
          const norm = (s: string) =>
            s
              .replace(/\s*\(\d+\)\s*$/g, '')
              .toLowerCase()
              .replace(/[^a-z0-9]/g, '');
          return `${norm(artist)}|${norm(album)}`;
        }
      );

      // Discogs has "Nirvana (2)" but Last.fm history has "nirvana"
      const collection = [
        createMockCollectionItem({
          artist: 'Nirvana (2)',
          title: 'Nevermind',
          id: 789,
        }),
      ];

      const topAlbums = await statsService.getTopAlbums(
        'all',
        10,
        undefined,
        undefined,
        collection
      );

      expect(topAlbums).toHaveLength(1);
      expect(topAlbums[0].inCollection).toBe(true);
      expect(topAlbums[0].collectionReleaseId).toBe(789);
    });

    it('should set coverUrl from collection item', async () => {
      const now = Math.floor(Date.now() / 1000);
      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'radiohead|ok computer': {
            lastPlayed: now,
            playCount: 50,
            plays: Array.from({ length: 50 }, () => ({ timestamp: now })),
          },
        })
      );
      mockHistoryStorage.fuzzyNormalizeKey.mockImplementation(
        (artist: string, album: string) => {
          return `${artist.toLowerCase().replace(/[^a-z0-9]/g, '')}|${album.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
        }
      );

      const collection = [
        createMockCollectionItem({
          artist: 'Radiohead',
          title: 'OK Computer',
          coverImage: 'https://example.com/ok-computer-cover.jpg',
        }),
      ];

      const topAlbums = await statsService.getTopAlbums(
        'all',
        10,
        undefined,
        undefined,
        collection
      );

      expect(topAlbums[0].coverUrl).toBe(
        'https://example.com/ok-computer-cover.jpg'
      );
    });

    it('should work without collection parameter (backward compatible)', async () => {
      const now = Math.floor(Date.now() / 1000);
      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'radiohead|ok computer': {
            lastPlayed: now,
            playCount: 50,
            plays: Array.from({ length: 50 }, () => ({ timestamp: now })),
          },
        })
      );

      const topAlbums = await statsService.getTopAlbums('all', 10);

      expect(topAlbums).toHaveLength(1);
      expect(topAlbums[0].inCollection).toBeUndefined();
    });
  });

  describe('getCollectionCoverage', () => {
    it('should return zeros for empty collection', async () => {
      // Act
      const coverage = await statsService.getCollectionCoverage([]);

      // Assert
      expect(coverage.thisMonth).toBe(0);
      expect(coverage.thisYear).toBe(0);
      expect(coverage.albumsPlayedThisMonth).toBe(0);
      expect(coverage.albumsPlayedThisYear).toBe(0);
      expect(coverage.totalAlbums).toBe(0);
    });

    it('should calculate coverage correctly', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);
      const collection = [
        createMockCollectionItem({
          id: 1,
          artist: 'Artist 1',
          title: 'Album 1',
        }),
        createMockCollectionItem({
          id: 2,
          artist: 'Artist 2',
          title: 'Album 2',
        }),
        createMockCollectionItem({
          id: 3,
          artist: 'Artist 3',
          title: 'Album 3',
        }),
      ];

      mockHistoryStorage.getAlbumHistoryFuzzy
        .mockResolvedValueOnce({
          entry: {
            lastPlayed: now,
            playCount: 10,
            plays: [{ timestamp: now }],
          },
          matchType: 'exact',
        })
        .mockResolvedValueOnce({
          entry: {
            lastPlayed: now - 40 * 24 * 60 * 60, // 40 days ago
            playCount: 5,
            plays: [{ timestamp: now - 40 * 24 * 60 * 60 }],
          },
          matchType: 'exact',
        })
        .mockResolvedValueOnce({
          entry: null,
          matchType: 'none',
        });

      // Act
      const coverage = await statsService.getCollectionCoverage(collection);

      // Assert
      expect(coverage.totalAlbums).toBe(3);
      expect(coverage.albumsPlayedThisMonth).toBe(1); // Only Album 1
      expect(coverage.thisMonth).toBe(33); // 1/3 = 33%
    });
  });

  describe('getDustyCorners', () => {
    it('should return empty array for empty collection', async () => {
      // Act
      const dusty = await statsService.getDustyCorners([]);

      // Assert
      expect(dusty).toEqual([]);
    });

    it('should return albums not played in 6+ months', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);
      const sevenMonthsAgo = now - 210 * 24 * 60 * 60;

      const collection = [
        createMockCollectionItem({
          id: 1,
          artist: 'Artist 1',
          title: 'Recent Album',
        }),
        createMockCollectionItem({
          id: 2,
          artist: 'Artist 2',
          title: 'Dusty Album',
        }),
        createMockCollectionItem({
          id: 3,
          artist: 'Artist 3',
          title: 'Never Played',
        }),
      ];

      mockHistoryStorage.getAlbumHistoryFuzzy
        .mockResolvedValueOnce({
          entry: {
            lastPlayed: now - 10 * 24 * 60 * 60, // 10 days ago
            playCount: 5,
            plays: [{ timestamp: now - 10 * 24 * 60 * 60 }],
          },
          matchType: 'exact',
        })
        .mockResolvedValueOnce({
          entry: {
            lastPlayed: sevenMonthsAgo,
            playCount: 3,
            plays: [{ timestamp: sevenMonthsAgo }],
          },
          matchType: 'exact',
        })
        .mockResolvedValueOnce({
          entry: null,
          matchType: 'none',
        });

      // Act
      const dusty = await statsService.getDustyCorners(collection, 10);

      // Assert
      expect(dusty).toHaveLength(2);
      // Never played should come first
      expect(dusty[0].album).toBe('Never Played');
      expect(dusty[0].daysSincePlay).toBe(-1);
      // Then dusty album
      expect(dusty[1].album).toBe('Dusty Album');
    });
  });

  describe('getHeavyRotation', () => {
    it('should return empty array for empty collection', async () => {
      // Act
      const heavy = await statsService.getHeavyRotation([]);

      // Assert
      expect(heavy).toEqual([]);
    });

    it('should return most played albums from collection', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);

      const collection = [
        createMockCollectionItem({
          id: 1,
          artist: 'Artist 1',
          title: 'Album 1',
        }),
        createMockCollectionItem({
          id: 2,
          artist: 'Artist 2',
          title: 'Album 2',
        }),
      ];

      mockHistoryStorage.getAlbumHistoryFuzzy
        .mockResolvedValueOnce({
          entry: { lastPlayed: now, playCount: 100, plays: [] },
          matchType: 'exact',
        })
        .mockResolvedValueOnce({
          entry: { lastPlayed: now, playCount: 50, plays: [] },
          matchType: 'exact',
        });

      // Act
      const heavy = await statsService.getHeavyRotation(collection, 10);

      // Assert
      expect(heavy).toHaveLength(2);
      expect(heavy[0].playCount).toBe(100);
      expect(heavy[1].playCount).toBe(50);
    });
  });

  describe('getCalendarHeatmap', () => {
    it('should return empty array when no history', async () => {
      // Arrange
      mockHistoryStorage.getIndex.mockResolvedValue(null);

      // Act
      const heatmap = await statsService.getCalendarHeatmap();

      // Assert
      expect(heatmap).toEqual([]);
    });

    it('should return day counts for the year', async () => {
      // Arrange
      const year = new Date().getFullYear();
      const jan15 = new Date(year, 0, 15, 12, 0, 0);
      const jan16 = new Date(year, 0, 16, 12, 0, 0);

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'artist|album': {
            lastPlayed: Math.floor(jan16.getTime() / 1000),
            playCount: 5,
            plays: [
              { timestamp: Math.floor(jan15.getTime() / 1000) },
              { timestamp: Math.floor(jan15.getTime() / 1000) + 300 },
              { timestamp: Math.floor(jan15.getTime() / 1000) + 600 },
              { timestamp: Math.floor(jan16.getTime() / 1000) },
              { timestamp: Math.floor(jan16.getTime() / 1000) + 300 },
            ],
          },
        })
      );

      // Act
      const heatmap = await statsService.getCalendarHeatmap(year);

      // Assert
      expect(heatmap).toHaveLength(2);
      const jan15Data = heatmap.find(d => d.date === `${year}-01-15`);
      const jan16Data = heatmap.find(d => d.date === `${year}-01-16`);
      expect(jan15Data?.count).toBe(3);
      expect(jan16Data?.count).toBe(2);
    });
  });

  describe('getMilestones', () => {
    it('should return milestone info', async () => {
      // Arrange
      mockHistoryStorage.getTotalScrobbles.mockResolvedValue(4500);
      mockFileStorage.readJSON.mockResolvedValue(null);

      // Act
      const milestones = await statsService.getMilestones();

      // Assert
      expect(milestones.total).toBe(4500);
      expect(milestones.nextMilestone).toBe(5000);
      expect(milestones.scrobblesToNext).toBe(500);
      expect(milestones.progressPercent).toBeGreaterThan(0);
    });

    it('should record new milestones', async () => {
      // Arrange
      mockHistoryStorage.getTotalScrobbles.mockResolvedValue(5100);
      mockFileStorage.readJSON.mockResolvedValue({
        schemaVersion: 1,
        lastUpdated: 0,
        streaks: { currentStreak: 0, longestStreak: 0 },
        milestoneHistory: [{ milestone: 1000, reachedAt: 1000000 }],
      });

      // Act
      const milestones = await statsService.getMilestones();

      // Assert
      expect(mockFileStorage.writeJSON).toHaveBeenCalled();
      // Should have added 2500 and 5000 milestones
      expect(milestones.history).toContainEqual(
        expect.objectContaining({ milestone: 1000 })
      );
    });
  });

  describe('getNewArtistsThisMonth', () => {
    it('should return 0 when no history', async () => {
      // Arrange
      mockHistoryStorage.getIndex.mockResolvedValue(null);

      // Act
      const count = await statsService.getNewArtistsThisMonth();

      // Assert
      expect(count).toBe(0);
    });

    it('should count new artists this month', async () => {
      // Arrange
      const now = new Date();
      const thisMonthTimestamp = Math.floor(now.getTime() / 1000);
      const lastYearTimestamp = Math.floor(
        new Date(now.getFullYear() - 1, 0, 1).getTime() / 1000
      );

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'new artist|album': {
            lastPlayed: thisMonthTimestamp,
            playCount: 1,
            plays: [{ timestamp: thisMonthTimestamp }],
          },
          'old artist|album': {
            lastPlayed: thisMonthTimestamp,
            playCount: 10,
            plays: [
              { timestamp: lastYearTimestamp }, // First play was last year
              { timestamp: thisMonthTimestamp },
            ],
          },
        })
      );

      // Act
      const count = await statsService.getNewArtistsThisMonth();

      // Assert
      expect(count).toBe(1); // Only new artist counts
    });
  });

  describe('getNewArtistsDetails', () => {
    it('should return empty array when no history', async () => {
      // Arrange
      mockHistoryStorage.getIndex.mockResolvedValue(null);

      // Act
      const details = await statsService.getNewArtistsDetails();

      // Assert
      expect(details).toEqual([]);
    });

    it('should return detailed info for new artists this month', async () => {
      // Arrange
      const now = new Date();
      const thisMonthTimestamp = Math.floor(now.getTime() / 1000);
      const lastYearTimestamp = Math.floor(
        new Date(now.getFullYear() - 1, 0, 1).getTime() / 1000
      );

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'New Artist|Album 1': {
            lastPlayed: thisMonthTimestamp,
            playCount: 5,
            plays: [
              { timestamp: thisMonthTimestamp },
              { timestamp: thisMonthTimestamp + 100 },
              { timestamp: thisMonthTimestamp + 200 },
              { timestamp: thisMonthTimestamp + 300 },
              { timestamp: thisMonthTimestamp + 400 },
            ],
          },
          'New Artist|Album 2': {
            lastPlayed: thisMonthTimestamp + 500,
            playCount: 2,
            plays: [
              { timestamp: thisMonthTimestamp + 500 },
              { timestamp: thisMonthTimestamp + 600 },
            ],
          },
          'Old Artist|Album': {
            lastPlayed: thisMonthTimestamp,
            playCount: 3,
            plays: [
              { timestamp: lastYearTimestamp }, // First play was last year
              { timestamp: thisMonthTimestamp },
              { timestamp: thisMonthTimestamp + 50 },
            ],
          },
        })
      );

      // Act
      const details = await statsService.getNewArtistsDetails();

      // Assert
      expect(details).toHaveLength(1);
      expect(details[0]).toEqual({
        artist: 'New Artist',
        firstPlayed: thisMonthTimestamp * 1000, // Converted to milliseconds
        playCount: 7, // Total plays for all albums by this artist this month
      });
    });

    it('should sort by first played time (most recent first)', async () => {
      // Arrange
      const now = new Date();
      const thisMonthTimestamp = Math.floor(now.getTime() / 1000);

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'Artist A|Album': {
            lastPlayed: thisMonthTimestamp,
            playCount: 1,
            plays: [{ timestamp: thisMonthTimestamp }],
          },
          'Artist B|Album': {
            lastPlayed: thisMonthTimestamp + 1000,
            playCount: 1,
            plays: [{ timestamp: thisMonthTimestamp + 1000 }],
          },
          'Artist C|Album': {
            lastPlayed: thisMonthTimestamp + 500,
            playCount: 1,
            plays: [{ timestamp: thisMonthTimestamp + 500 }],
          },
        })
      );

      // Act
      const details = await statsService.getNewArtistsDetails();

      // Assert
      expect(details).toHaveLength(3);
      expect(details[0].artist).toBe('Artist B'); // Most recent
      expect(details[1].artist).toBe('Artist C');
      expect(details[2].artist).toBe('Artist A'); // Oldest
    });

    it('should preserve original artist name casing', async () => {
      // Arrange
      const now = new Date();
      const thisMonthTimestamp = Math.floor(now.getTime() / 1000);

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'The Beatles|Abbey Road': {
            lastPlayed: thisMonthTimestamp,
            playCount: 1,
            plays: [{ timestamp: thisMonthTimestamp }],
          },
          'THE BEATLES|White Album': {
            lastPlayed: thisMonthTimestamp + 100,
            playCount: 1,
            plays: [{ timestamp: thisMonthTimestamp + 100 }],
          },
        })
      );

      // Act
      const details = await statsService.getNewArtistsDetails();

      // Assert - Should count as one artist with first encountered casing
      expect(details).toHaveLength(1);
      expect(details[0].artist).toBe('The Beatles');
      expect(details[0].playCount).toBe(2);
    });
  });

  describe('getStatsOverview', () => {
    it('should return complete overview', async () => {
      // Arrange
      const collection = [createMockCollectionItem()];
      mockHistoryStorage.getIndex.mockResolvedValue(createMockIndex({}));
      mockHistoryStorage.getTotalScrobbles.mockResolvedValue(0);
      mockHistoryStorage.getAlbumHistoryFuzzy.mockResolvedValue({
        entry: null,
        matchType: 'none',
      });

      // Act
      const overview = await statsService.getStatsOverview(collection);

      // Assert
      expect(overview).toHaveProperty('streaks');
      expect(overview).toHaveProperty('counts');
      expect(overview).toHaveProperty('listeningHours');
      expect(overview).toHaveProperty('collectionCoverage');
      expect(overview).toHaveProperty('milestones');
      expect(overview).toHaveProperty('newArtistsThisMonth');
    });
  });

  describe('getTopArtists with periods', () => {
    it('should filter by week period', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);
      const twoWeeksAgo = now - 14 * 24 * 60 * 60;

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'recent artist|album': {
            lastPlayed: now,
            playCount: 10,
            plays: Array.from({ length: 10 }, () => ({ timestamp: now })),
          },
          'old artist|album': {
            lastPlayed: twoWeeksAgo,
            playCount: 20,
            plays: Array.from({ length: 20 }, () => ({
              timestamp: twoWeeksAgo,
            })),
          },
        })
      );

      // Act
      const topArtists = await statsService.getTopArtists('week', 10);

      // Assert
      expect(topArtists).toHaveLength(1);
      expect(topArtists[0].artist).toBe('Recent Artist');
    });

    it('should filter by year period', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);
      const twoYearsAgo = now - 730 * 24 * 60 * 60;

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'this year artist|album': {
            lastPlayed: now,
            playCount: 10,
            plays: Array.from({ length: 10 }, () => ({ timestamp: now })),
          },
          'old artist|album': {
            lastPlayed: twoYearsAgo,
            playCount: 20,
            plays: Array.from({ length: 20 }, () => ({
              timestamp: twoYearsAgo,
            })),
          },
        })
      );

      // Act
      const topArtists = await statsService.getTopArtists('year', 10);

      // Assert
      expect(topArtists).toHaveLength(1);
      expect(topArtists[0].artist).toBe('This Year Artist');
    });
  });

  describe('getTopAlbums with periods', () => {
    it('should filter by week period', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);
      const twoWeeksAgo = now - 14 * 24 * 60 * 60;

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'artist|recent album': {
            lastPlayed: now,
            playCount: 10,
            plays: Array.from({ length: 10 }, () => ({ timestamp: now })),
          },
          'artist|old album': {
            lastPlayed: twoWeeksAgo,
            playCount: 20,
            plays: Array.from({ length: 20 }, () => ({
              timestamp: twoWeeksAgo,
            })),
          },
        })
      );

      // Act
      const topAlbums = await statsService.getTopAlbums('week', 10);

      // Assert
      expect(topAlbums).toHaveLength(1);
      expect(topAlbums[0].album).toBe('Recent Album');
    });

    it('should filter by year period', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);
      const twoYearsAgo = now - 730 * 24 * 60 * 60;

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'artist|this year album': {
            lastPlayed: now,
            playCount: 10,
            plays: Array.from({ length: 10 }, () => ({ timestamp: now })),
          },
          'artist|old album': {
            lastPlayed: twoYearsAgo,
            playCount: 20,
            plays: Array.from({ length: 20 }, () => ({
              timestamp: twoYearsAgo,
            })),
          },
        })
      );

      // Act
      const topAlbums = await statsService.getTopAlbums('year', 10);

      // Assert
      expect(topAlbums).toHaveLength(1);
      expect(topAlbums[0].album).toBe('This Year Album');
    });
  });

  describe('getMilestones edge cases', () => {
    it('should calculate progress when no previous milestone', async () => {
      // Arrange
      mockHistoryStorage.getTotalScrobbles.mockResolvedValue(500);
      mockFileStorage.readJSON.mockResolvedValue(null);

      // Act
      const milestones = await statsService.getMilestones();

      // Assert
      expect(milestones.total).toBe(500);
      expect(milestones.nextMilestone).toBe(1000);
      expect(milestones.progressPercent).toBe(50); // 500/1000 = 50%
    });

    it('should handle very high scrobble counts', async () => {
      // Arrange - beyond all milestones
      mockHistoryStorage.getTotalScrobbles.mockResolvedValue(2000000);
      mockFileStorage.readJSON.mockResolvedValue(null);

      // Act
      const milestones = await statsService.getMilestones();

      // Assert
      expect(milestones.total).toBe(2000000);
      // Should use highest milestone as next
      expect(milestones.nextMilestone).toBe(1000000);
    });
  });

  describe('getCollectionCoverage edge cases', () => {
    it('should count albums played this year but not this month', async () => {
      // Arrange - Use a timestamp that's definitely this year but not this month
      const now = new Date();
      // Go back to start of this year, then add 15 days to be safely in January
      const thisYearStart = new Date(now.getFullYear(), 0, 15, 12, 0, 0);
      const thisYearTimestamp = Math.floor(thisYearStart.getTime() / 1000);

      // Only run this test logic if we're past January, otherwise the timestamp
      // would be in this month
      const isAfterJanuary = now.getMonth() > 0;

      const collection = [
        createMockCollectionItem({ id: 1, artist: 'Artist', title: 'Album' }),
      ];

      if (isAfterJanuary) {
        mockHistoryStorage.getAlbumHistoryFuzzy.mockResolvedValue({
          entry: {
            lastPlayed: thisYearTimestamp,
            playCount: 10,
            plays: [{ timestamp: thisYearTimestamp }],
          },
          matchType: 'exact',
        });

        // Act
        const coverage = await statsService.getCollectionCoverage(collection);

        // Assert
        expect(coverage.albumsPlayedThisMonth).toBe(0);
        expect(coverage.albumsPlayedThisYear).toBe(1);
      } else {
        // In January, just verify the method works with this month data
        const nowTimestamp = Math.floor(now.getTime() / 1000);
        mockHistoryStorage.getAlbumHistoryFuzzy.mockResolvedValue({
          entry: {
            lastPlayed: nowTimestamp,
            playCount: 10,
            plays: [{ timestamp: nowTimestamp }],
          },
          matchType: 'exact',
        });

        const coverage = await statsService.getCollectionCoverage(collection);
        expect(coverage.albumsPlayedThisMonth).toBe(1);
        expect(coverage.albumsPlayedThisYear).toBe(1);
      }
    });
  });

  describe('calculateStreaks edge cases', () => {
    it('should handle streak ending yesterday', async () => {
      // Arrange
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(12, 0, 0, 0);

      const plays: { timestamp: number }[] = [];
      // 3 consecutive days ending yesterday
      for (let i = 1; i <= 3; i++) {
        const date = new Date(yesterday);
        date.setDate(date.getDate() - (i - 1));
        plays.push({ timestamp: Math.floor(date.getTime() / 1000) });
      }

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'artist|album': {
            lastPlayed: plays[0].timestamp,
            playCount: plays.length,
            plays,
          },
        })
      );

      // Act
      const streaks = await statsService.calculateStreaks();

      // Assert
      expect(streaks.currentStreak).toBe(3);
    });
  });

  describe('getForgottenFavorites', () => {
    // Helper to create index with track info
    const createMockIndexWithTracks = (
      albums: Record<
        string,
        {
          lastPlayed: number;
          playCount: number;
          plays: { timestamp: number; track?: string }[];
        }
      >
    ): ScrobbleHistoryIndex => ({
      albums,
      totalScrobbles: Object.values(albums).reduce(
        (sum, a) => sum + a.playCount,
        0
      ),
      lastSyncTimestamp: Math.floor(Date.now() / 1000),
      oldestScrobbleDate: 0,
    });

    it('should return empty array when no history', async () => {
      // Arrange
      mockHistoryStorage.getIndex.mockResolvedValue(null);

      // Act
      const result = await statsService.getForgottenFavorites(90, 10, 100);

      // Assert
      expect(result.tracks).toEqual([]);
      expect(result.totalMatching).toBe(0);
    });

    it('should return empty array when no tracks meet criteria', async () => {
      // Arrange - Recent plays with few plays
      const now = Math.floor(Date.now() / 1000);

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndexWithTracks({
          'artist|album': {
            lastPlayed: now,
            playCount: 5,
            plays: Array.from({ length: 5 }, (_, i) => ({
              timestamp: now - i * 86400,
              track: 'Track 1',
            })),
          },
        })
      );

      // Act
      const result = await statsService.getForgottenFavorites(90, 10, 100);

      // Assert
      expect(result.tracks).toEqual([]);
      expect(result.totalMatching).toBe(0);
    });

    it('should return forgotten tracks that meet criteria', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);
      const sixMonthsAgo = now - 180 * 24 * 60 * 60;

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndexWithTracks({
          'radiohead|ok computer': {
            lastPlayed: sixMonthsAgo,
            playCount: 20,
            plays: Array.from({ length: 20 }, () => ({
              timestamp: sixMonthsAgo,
              track: 'Paranoid Android',
            })),
          },
        })
      );

      // Act
      const result = await statsService.getForgottenFavorites(90, 10, 100);

      // Assert
      expect(result.tracks).toHaveLength(1);
      expect(result.tracks[0].artist).toBe('Radiohead');
      expect(result.tracks[0].track).toBe('Paranoid Android');
      expect(result.tracks[0].allTimePlayCount).toBe(20);
      expect(result.tracks[0].daysSincePlay).toBeGreaterThanOrEqual(179);
    });

    it('should exclude tracks played recently', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);
      const oneMonthAgo = now - 30 * 24 * 60 * 60;
      const sixMonthsAgo = now - 180 * 24 * 60 * 60;

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndexWithTracks({
          'artist|album1': {
            lastPlayed: oneMonthAgo, // Recent - should be excluded
            playCount: 50,
            plays: Array.from({ length: 50 }, () => ({
              timestamp: oneMonthAgo,
              track: 'Recent Track',
            })),
          },
          'artist|album2': {
            lastPlayed: sixMonthsAgo, // Dormant - should be included
            playCount: 15,
            plays: Array.from({ length: 15 }, () => ({
              timestamp: sixMonthsAgo,
              track: 'Old Track',
            })),
          },
        })
      );

      // Act - 90 day dormant period
      const result = await statsService.getForgottenFavorites(90, 10, 100);

      // Assert
      expect(result.tracks).toHaveLength(1);
      expect(result.tracks[0].track).toBe('Old Track');
    });

    it('should exclude tracks with insufficient plays', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);
      const sixMonthsAgo = now - 180 * 24 * 60 * 60;

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndexWithTracks({
          'artist|album1': {
            lastPlayed: sixMonthsAgo,
            playCount: 5, // Below threshold
            plays: Array.from({ length: 5 }, () => ({
              timestamp: sixMonthsAgo,
              track: 'Low Play Track',
            })),
          },
          'artist|album2': {
            lastPlayed: sixMonthsAgo,
            playCount: 15, // Above threshold
            plays: Array.from({ length: 15 }, () => ({
              timestamp: sixMonthsAgo,
              track: 'High Play Track',
            })),
          },
        })
      );

      // Act
      const result = await statsService.getForgottenFavorites(90, 10, 100);

      // Assert
      expect(result.tracks).toHaveLength(1);
      expect(result.tracks[0].track).toBe('High Play Track');
    });

    it('should sort by play count descending', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);
      const sixMonthsAgo = now - 180 * 24 * 60 * 60;

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndexWithTracks({
          'artist|album1': {
            lastPlayed: sixMonthsAgo,
            playCount: 20,
            plays: Array.from({ length: 20 }, () => ({
              timestamp: sixMonthsAgo,
              track: 'Medium Track',
            })),
          },
          'artist|album2': {
            lastPlayed: sixMonthsAgo,
            playCount: 50,
            plays: Array.from({ length: 50 }, () => ({
              timestamp: sixMonthsAgo,
              track: 'Popular Track',
            })),
          },
          'artist|album3': {
            lastPlayed: sixMonthsAgo,
            playCount: 15,
            plays: Array.from({ length: 15 }, () => ({
              timestamp: sixMonthsAgo,
              track: 'Less Popular Track',
            })),
          },
        })
      );

      // Act
      const result = await statsService.getForgottenFavorites(90, 10, 100);

      // Assert
      expect(result.tracks).toHaveLength(3);
      expect(result.tracks[0].track).toBe('Popular Track');
      expect(result.tracks[0].allTimePlayCount).toBe(50);
      expect(result.tracks[1].track).toBe('Medium Track');
      expect(result.tracks[2].track).toBe('Less Popular Track');
    });

    it('should respect limit parameter', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);
      const sixMonthsAgo = now - 180 * 24 * 60 * 60;

      const albums: Record<string, any> = {};
      for (let i = 0; i < 20; i++) {
        albums[`artist|album${i}`] = {
          lastPlayed: sixMonthsAgo,
          playCount: 15 + i,
          plays: Array.from({ length: 15 + i }, () => ({
            timestamp: sixMonthsAgo,
            track: `Track ${i}`,
          })),
        };
      }

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndexWithTracks(albums)
      );

      // Act
      const result = await statsService.getForgottenFavorites(90, 10, 5);

      // Assert
      expect(result.tracks).toHaveLength(5);
      expect(result.totalMatching).toBe(20);
    });

    it('should cap limit at 100', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);
      const sixMonthsAgo = now - 180 * 24 * 60 * 60;

      const albums: Record<string, any> = {};
      for (let i = 0; i < 150; i++) {
        albums[`artist${i}|album`] = {
          lastPlayed: sixMonthsAgo,
          playCount: 15,
          plays: Array.from({ length: 15 }, () => ({
            timestamp: sixMonthsAgo,
            track: `Track ${i}`,
          })),
        };
      }

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndexWithTracks(albums)
      );

      // Act
      const result = await statsService.getForgottenFavorites(90, 10, 500); // Request more than cap

      // Assert
      expect(result.tracks.length).toBeLessThanOrEqual(100);
      expect(result.totalMatching).toBe(150);
    });

    it('should aggregate plays for same track across plays array', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);
      const sixMonthsAgo = now - 180 * 24 * 60 * 60;

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndexWithTracks({
          'artist|album': {
            lastPlayed: sixMonthsAgo,
            playCount: 15,
            plays: [
              // Same track played multiple times
              { timestamp: sixMonthsAgo, track: 'Repeated Track' },
              { timestamp: sixMonthsAgo - 1000, track: 'Repeated Track' },
              { timestamp: sixMonthsAgo - 2000, track: 'Repeated Track' },
              { timestamp: sixMonthsAgo - 3000, track: 'repeated track' }, // Different case
              { timestamp: sixMonthsAgo - 4000, track: 'Repeated Track' },
              { timestamp: sixMonthsAgo - 5000, track: 'Repeated Track' },
              { timestamp: sixMonthsAgo - 6000, track: 'Repeated Track' },
              { timestamp: sixMonthsAgo - 7000, track: 'Repeated Track' },
              { timestamp: sixMonthsAgo - 8000, track: 'Repeated Track' },
              { timestamp: sixMonthsAgo - 9000, track: 'Repeated Track' },
              { timestamp: sixMonthsAgo - 10000, track: 'Other Track' },
              { timestamp: sixMonthsAgo - 11000, track: 'Other Track' },
              { timestamp: sixMonthsAgo - 12000, track: 'Other Track' },
              { timestamp: sixMonthsAgo - 13000, track: 'Other Track' },
              { timestamp: sixMonthsAgo - 14000, track: 'Other Track' },
            ],
          },
        })
      );

      // Act - Need at least 10 plays per track
      const result = await statsService.getForgottenFavorites(90, 10, 100);

      // Assert
      expect(result.tracks).toHaveLength(1);
      expect(result.tracks[0].track).toBe('Repeated Track');
      expect(result.tracks[0].allTimePlayCount).toBe(10); // 9 + 1 case-insensitive match
    });

    it('should skip plays without track info', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);
      const sixMonthsAgo = now - 180 * 24 * 60 * 60;

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndexWithTracks({
          'artist|album': {
            lastPlayed: sixMonthsAgo,
            playCount: 15,
            plays: [
              // Plays without track names
              { timestamp: sixMonthsAgo },
              { timestamp: sixMonthsAgo - 1000 },
              { timestamp: sixMonthsAgo - 2000 },
              // Plays with track names
              ...Array.from({ length: 12 }, (_, i) => ({
                timestamp: sixMonthsAgo - (3000 + i * 1000),
                track: 'Named Track',
              })),
            ],
          },
        })
      );

      // Act
      const result = await statsService.getForgottenFavorites(90, 10, 100);

      // Assert
      expect(result.tracks).toHaveLength(1);
      expect(result.tracks[0].allTimePlayCount).toBe(12); // Only plays with track names
    });

    it('should use cache for repeated calls with same parameters', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);
      const sixMonthsAgo = now - 180 * 24 * 60 * 60;

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndexWithTracks({
          'artist|album': {
            lastPlayed: sixMonthsAgo,
            playCount: 15,
            plays: Array.from({ length: 15 }, () => ({
              timestamp: sixMonthsAgo,
              track: 'Track',
            })),
          },
        })
      );

      // Act - Call twice with same parameters
      await statsService.getForgottenFavorites(90, 10, 100);
      await statsService.getForgottenFavorites(90, 10, 100);

      // Assert - getIndex should only be called once due to caching
      expect(mockHistoryStorage.getIndex).toHaveBeenCalledTimes(1);
    });

    it('should invalidate cache when parameters change', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);
      const sixMonthsAgo = now - 180 * 24 * 60 * 60;

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndexWithTracks({
          'artist|album': {
            lastPlayed: sixMonthsAgo,
            playCount: 15,
            plays: Array.from({ length: 15 }, () => ({
              timestamp: sixMonthsAgo,
              track: 'Track',
            })),
          },
        })
      );

      // Act - Call with different parameters
      await statsService.getForgottenFavorites(90, 10, 100);
      await statsService.getForgottenFavorites(180, 10, 100); // Different dormant period

      // Assert - getIndex should be called twice (different params = cache miss)
      expect(mockHistoryStorage.getIndex).toHaveBeenCalledTimes(2);
    });

    it('should invalidate cache after TTL expires', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);
      const sixMonthsAgo = now - 180 * 24 * 60 * 60;

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndexWithTracks({
          'artist|album': {
            lastPlayed: sixMonthsAgo,
            playCount: 15,
            plays: Array.from({ length: 15 }, () => ({
              timestamp: sixMonthsAgo,
              track: 'Track',
            })),
          },
        })
      );

      // Act - First call populates cache
      await statsService.getForgottenFavorites(90, 10, 100);

      // Simulate TTL expiry by manipulating the cache timestamp
      // Access private cache property for testing
      const service = statsService as any;
      service.forgottenFavoritesCache.timestamp = Date.now() - 6 * 60 * 1000; // 6 minutes ago (TTL is 5 min)

      // Second call should refetch due to expired TTL
      await statsService.getForgottenFavorites(90, 10, 100);

      // Assert - getIndex should be called twice (TTL expired)
      expect(mockHistoryStorage.getIndex).toHaveBeenCalledTimes(2);
    });

    it('should handle malformed album keys gracefully', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);
      const sixMonthsAgo = now - 180 * 24 * 60 * 60;

      // Create index with various malformed keys
      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndexWithTracks({
          // Normal key
          'artist|album': {
            lastPlayed: sixMonthsAgo,
            playCount: 15,
            plays: Array.from({ length: 15 }, () => ({
              timestamp: sixMonthsAgo,
              track: 'Normal Track',
            })),
          },
          // Key with empty artist (malformed)
          '|album': {
            lastPlayed: sixMonthsAgo,
            playCount: 12,
            plays: Array.from({ length: 12 }, () => ({
              timestamp: sixMonthsAgo,
              track: 'No Artist Track',
            })),
          },
          // Key with empty album (single)
          'artist|': {
            lastPlayed: sixMonthsAgo,
            playCount: 11,
            plays: Array.from({ length: 11 }, () => ({
              timestamp: sixMonthsAgo,
              track: 'Single Track',
            })),
          },
          // Key with only pipe (very malformed)
          '|': {
            lastPlayed: sixMonthsAgo,
            playCount: 10,
            plays: Array.from({ length: 10 }, () => ({
              timestamp: sixMonthsAgo,
              track: 'Malformed Track',
            })),
          },
        })
      );

      // Act - Should not throw
      const result = await statsService.getForgottenFavorites(90, 10, 100);

      // Assert - Should return results without crashing
      expect(result.tracks.length).toBeGreaterThan(0);
      // Normal track should be included
      expect(result.tracks.some(t => t.track === 'Normal Track')).toBe(true);
    });
  });

  describe('getAlbumTracksPlayed', () => {
    it('should return empty array when album has no plays', async () => {
      // Arrange
      mockHistoryStorage.getAlbumHistoryFuzzy.mockResolvedValue({
        entry: null,
        matchType: 'none',
      });

      // Act
      const result = await statsService.getAlbumTracksPlayed(
        'Unknown Artist',
        'Unknown Album'
      );

      // Assert
      expect(result).toEqual([]);
      expect(mockHistoryStorage.getAlbumHistoryFuzzy).toHaveBeenCalledWith(
        'Unknown Artist',
        'Unknown Album'
      );
    });

    it('should return unique track names from album plays', async () => {
      // Arrange
      mockHistoryStorage.getAlbumHistoryFuzzy.mockResolvedValue({
        entry: {
          lastPlayed: 1700000000,
          playCount: 5,
          plays: [
            { timestamp: 1700000000, track: 'Airbag' },
            { timestamp: 1699999000, track: 'Paranoid Android' },
            { timestamp: 1699998000, track: 'Airbag' },
            { timestamp: 1699997000, track: 'Subterranean Homesick Alien' },
            { timestamp: 1699996000, track: 'Paranoid Android' },
          ],
        },
        matchType: 'exact',
      });

      // Act
      const result = await statsService.getAlbumTracksPlayed(
        'Radiohead',
        'OK Computer'
      );

      // Assert
      expect(result).toHaveLength(3);
      expect(result).toContain('Airbag');
      expect(result).toContain('Paranoid Android');
      expect(result).toContain('Subterranean Homesick Alien');
    });

    it('should skip plays without track names', async () => {
      // Arrange
      mockHistoryStorage.getAlbumHistoryFuzzy.mockResolvedValue({
        entry: {
          lastPlayed: 1700000000,
          playCount: 4,
          plays: [
            { timestamp: 1700000000, track: 'Track A' },
            { timestamp: 1699999000 }, // No track name
            { timestamp: 1699998000, track: 'Track B' },
            { timestamp: 1699997000 }, // No track name
          ],
        },
        matchType: 'fuzzy',
      });

      // Act
      const result = await statsService.getAlbumTracksPlayed('Artist', 'Album');

      // Assert
      expect(result).toHaveLength(2);
      expect(result).toContain('Track A');
      expect(result).toContain('Track B');
    });

    it('should use fuzzy matching via historyStorage', async () => {
      // Arrange - Fuzzy match "Album" to "Album (Deluxe Edition)"
      mockHistoryStorage.getAlbumHistoryFuzzy.mockResolvedValue({
        entry: {
          lastPlayed: 1700000000,
          playCount: 2,
          plays: [
            { timestamp: 1700000000, track: 'Song 1' },
            { timestamp: 1699999000, track: 'Song 2' },
          ],
        },
        matchType: 'fuzzy',
        matchedKeys: ['artist|album (deluxe edition)'],
      });

      // Act
      const result = await statsService.getAlbumTracksPlayed('Artist', 'Album');

      // Assert
      expect(result).toHaveLength(2);
      expect(result).toContain('Song 1');
      expect(result).toContain('Song 2');
      expect(mockHistoryStorage.getAlbumHistoryFuzzy).toHaveBeenCalledWith(
        'Artist',
        'Album'
      );
    });

    it('should return empty array when album has plays but no track names', async () => {
      // Arrange
      mockHistoryStorage.getAlbumHistoryFuzzy.mockResolvedValue({
        entry: {
          lastPlayed: 1700000000,
          playCount: 3,
          plays: [
            { timestamp: 1700000000 },
            { timestamp: 1699999000 },
            { timestamp: 1699998000 },
          ],
        },
        matchType: 'exact',
      });

      // Act
      const result = await statsService.getAlbumTracksPlayed('Artist', 'Album');

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('getTopTracks', () => {
    // Helper to create index with track data
    const createIndexWithTracks = (
      albums: Record<
        string,
        {
          lastPlayed: number;
          playCount: number;
          plays: { timestamp: number; track?: string }[];
        }
      >
    ): ScrobbleHistoryIndex => ({
      albums,
      totalScrobbles: Object.values(albums).reduce(
        (sum, a) => sum + a.playCount,
        0
      ),
      lastSyncTimestamp: Math.floor(Date.now() / 1000),
      oldestScrobbleDate: 0,
    });

    it('should return empty array when no history', async () => {
      // Arrange
      mockHistoryStorage.getIndex.mockResolvedValue(null);

      // Act
      const topTracks = await statsService.getTopTracks('all', 10);

      // Assert
      expect(topTracks).toEqual([]);
    });

    it('should return top tracks sorted by play count', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);

      mockHistoryStorage.getIndex.mockResolvedValue(
        createIndexWithTracks({
          'radiohead|ok computer': {
            lastPlayed: now,
            playCount: 60,
            plays: [
              ...Array.from({ length: 30 }, () => ({
                timestamp: now,
                track: 'Paranoid Android',
              })),
              ...Array.from({ length: 20 }, () => ({
                timestamp: now,
                track: 'Karma Police',
              })),
              ...Array.from({ length: 10 }, () => ({
                timestamp: now,
                track: 'No Surprises',
              })),
            ],
          },
        })
      );

      // Act
      const topTracks = await statsService.getTopTracks('all', 10);

      // Assert
      expect(topTracks).toHaveLength(3);
      expect(topTracks[0].track).toBe('Paranoid Android');
      expect(topTracks[0].playCount).toBe(30);
      expect(topTracks[1].track).toBe('Karma Police');
      expect(topTracks[1].playCount).toBe(20);
      expect(topTracks[2].track).toBe('No Surprises');
      expect(topTracks[2].playCount).toBe(10);
    });

    it('should respect limit parameter', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);
      const plays = Array.from({ length: 20 }, (_, i) => ({
        timestamp: now,
        track: `Track ${i}`,
      }));

      mockHistoryStorage.getIndex.mockResolvedValue(
        createIndexWithTracks({
          'artist|album': {
            lastPlayed: now,
            playCount: 20,
            plays,
          },
        })
      );

      // Act
      const topTracks = await statsService.getTopTracks('all', 5);

      // Assert
      expect(topTracks).toHaveLength(5);
    });

    it('should filter by time period', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);
      const oneMonthAgo = now - 35 * 24 * 60 * 60;

      mockHistoryStorage.getIndex.mockResolvedValue(
        createIndexWithTracks({
          'artist|album': {
            lastPlayed: now,
            playCount: 20,
            plays: [
              ...Array.from({ length: 10 }, () => ({
                timestamp: now,
                track: 'Recent Track',
              })),
              ...Array.from({ length: 10 }, () => ({
                timestamp: oneMonthAgo,
                track: 'Old Track',
              })),
            ],
          },
        })
      );

      // Act
      const topTracks = await statsService.getTopTracks('month', 10);

      // Assert
      expect(topTracks).toHaveLength(1);
      expect(topTracks[0].track).toBe('Recent Track');
    });

    it('should skip plays without track info', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);

      mockHistoryStorage.getIndex.mockResolvedValue(
        createIndexWithTracks({
          'artist|album': {
            lastPlayed: now,
            playCount: 15,
            plays: [
              { timestamp: now },
              { timestamp: now },
              ...Array.from({ length: 13 }, () => ({
                timestamp: now,
                track: 'Named Track',
              })),
            ],
          },
        })
      );

      // Act
      const topTracks = await statsService.getTopTracks('all', 10);

      // Assert
      expect(topTracks).toHaveLength(1);
      expect(topTracks[0].playCount).toBe(13);
    });

    it('should support custom date range', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);
      const customStart = now - 60 * 24 * 60 * 60;
      const customEnd = now - 30 * 24 * 60 * 60;
      const inRange = customStart + 10 * 24 * 60 * 60;
      const outOfRange = now - 5 * 24 * 60 * 60;

      mockHistoryStorage.getIndex.mockResolvedValue(
        createIndexWithTracks({
          'artist|album': {
            lastPlayed: now,
            playCount: 20,
            plays: [
              ...Array.from({ length: 10 }, () => ({
                timestamp: inRange,
                track: 'In Range Track',
              })),
              ...Array.from({ length: 10 }, () => ({
                timestamp: outOfRange,
                track: 'Out Of Range Track',
              })),
            ],
          },
        })
      );

      // Act
      const topTracks = await statsService.getTopTracks(
        'custom',
        10,
        customStart,
        customEnd
      );

      // Assert
      expect(topTracks).toHaveLength(1);
      expect(topTracks[0].track).toBe('In Range Track');
    });
  });

  describe('getSourceBreakdown', () => {
    it('should return empty array when no history', async () => {
      // Arrange
      mockHistoryStorage.getIndex.mockResolvedValue(null);

      // Act
      const breakdown = await statsService.getSourceBreakdown();

      // Assert
      expect(breakdown).toEqual([]);
    });

    it('should return empty array when no scrobbles', async () => {
      // Arrange
      mockHistoryStorage.getIndex.mockResolvedValue(createMockIndex({}));
      mockFileStorage.listFiles = jest.fn().mockResolvedValue([]);

      // Act
      const breakdown = await statsService.getSourceBreakdown();

      // Assert
      expect(breakdown).toEqual([]);
    });

    it('should classify scrobbles as Other when no sessions available', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);
      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'artist|album': {
            lastPlayed: now,
            playCount: 10,
            plays: Array.from({ length: 10 }, (_, i) => ({
              timestamp: now - i * 300,
            })),
          },
        })
      );
      mockFileStorage.listFiles = jest.fn().mockResolvedValue([]);

      // Act
      const breakdown = await statsService.getSourceBreakdown();

      // Assert
      expect(breakdown).toHaveLength(1);
      expect(breakdown[0].source).toBe('Other');
      expect(breakdown[0].count).toBe(10);
      expect(breakdown[0].percentage).toBe(100);
    });

    it('should handle file storage errors gracefully', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);
      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'artist|album': {
            lastPlayed: now,
            playCount: 5,
            plays: Array.from({ length: 5 }, () => ({ timestamp: now })),
          },
        })
      );
      mockFileStorage.listFiles = jest
        .fn()
        .mockRejectedValue(new Error('File system error'));

      // Act
      const breakdown = await statsService.getSourceBreakdown();

      // Assert - Should not throw, all scrobbles should be "Other"
      expect(breakdown).toHaveLength(1);
      expect(breakdown[0].source).toBe('Other');
    });
  });

  describe('getListeningTimeline', () => {
    it('should return empty array when no history', async () => {
      // Arrange
      mockHistoryStorage.getIndex.mockResolvedValue(null);

      // Act
      const timeline = await statsService.getListeningTimeline('year', 'week');

      // Assert
      expect(timeline).toEqual([]);
    });

    it('should aggregate scrobbles by day', async () => {
      // Arrange
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'artist|album': {
            lastPlayed: Math.floor(today.getTime() / 1000),
            playCount: 5,
            plays: [
              { timestamp: Math.floor(today.getTime() / 1000) },
              { timestamp: Math.floor(today.getTime() / 1000) + 1000 },
              { timestamp: Math.floor(today.getTime() / 1000) + 2000 },
              { timestamp: Math.floor(yesterday.getTime() / 1000) },
              { timestamp: Math.floor(yesterday.getTime() / 1000) + 1000 },
            ],
          },
        })
      );

      // Act
      const timeline = await statsService.getListeningTimeline('week', 'day');

      // Assert
      expect(timeline.length).toBeGreaterThan(0);
      const todayData = timeline.find(
        t =>
          t.date ===
          `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      );
      expect(todayData?.count).toBe(3);
    });

    it('should aggregate scrobbles by week', async () => {
      // Arrange
      const now = new Date();
      const nowSeconds = Math.floor(now.getTime() / 1000);

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'artist|album': {
            lastPlayed: nowSeconds,
            playCount: 10,
            plays: Array.from({ length: 10 }, (_, i) => ({
              timestamp: nowSeconds - i * 86400,
            })),
          },
        })
      );

      // Act
      const timeline = await statsService.getListeningTimeline('month', 'week');

      // Assert
      expect(timeline.length).toBeGreaterThan(0);
      expect(timeline.every(t => t.count > 0)).toBe(true);
    });

    it('should aggregate scrobbles by month', async () => {
      // Arrange
      const now = new Date();
      const nowSeconds = Math.floor(now.getTime() / 1000);

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'artist|album': {
            lastPlayed: nowSeconds,
            playCount: 100,
            plays: Array.from({ length: 100 }, (_, i) => ({
              timestamp: nowSeconds - i * 86400,
            })),
          },
        })
      );

      // Act
      const timeline = await statsService.getListeningTimeline('year', 'month');

      // Assert
      expect(timeline.length).toBeGreaterThan(0);
      expect(timeline[0]).toHaveProperty('date');
      expect(timeline[0]).toHaveProperty('count');
    });

    it('should support custom date range', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);
      const customStart = now - 60 * 24 * 60 * 60;
      const customEnd = now - 30 * 24 * 60 * 60;
      const inRange = customStart + 10 * 24 * 60 * 60;
      const outOfRange = now - 5 * 24 * 60 * 60;

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'artist|album': {
            lastPlayed: now,
            playCount: 20,
            plays: [
              ...Array.from({ length: 10 }, () => ({ timestamp: inRange })),
              ...Array.from({ length: 10 }, () => ({
                timestamp: outOfRange,
              })),
            ],
          },
        })
      );

      // Act
      const timeline = await statsService.getListeningTimeline(
        'custom',
        'day',
        customStart,
        customEnd
      );

      // Assert
      expect(timeline.length).toBeGreaterThan(0);
      const totalCount = timeline.reduce((sum, t) => sum + t.count, 0);
      expect(totalCount).toBe(10);
    });
  });

  describe('getHourlyDistribution', () => {
    it('should return hourly distribution from historyStorage', async () => {
      // Arrange
      const hourlyMap = new Map<number, number>([
        [0, 5],
        [6, 10],
        [12, 20],
        [18, 15],
        [23, 3],
      ]);
      mockHistoryStorage.getHourlyDistribution = jest
        .fn()
        .mockResolvedValue(hourlyMap);

      // Act
      const result = await statsService.getHourlyDistribution();

      // Assert
      expect(result.distribution).toHaveLength(24);
      expect(result.distribution[0].count).toBe(5);
      expect(result.distribution[12].count).toBe(20);
      expect(result.peakHour).toBe(12);
      expect(result.totalScrobbles).toBe(53);
    });

    it('should handle empty distribution', async () => {
      // Arrange
      mockHistoryStorage.getHourlyDistribution = jest
        .fn()
        .mockResolvedValue(new Map());

      // Act
      const result = await statsService.getHourlyDistribution();

      // Assert
      expect(result.distribution).toHaveLength(24);
      expect(result.totalScrobbles).toBe(0);
      expect(result.peakHour).toBe(0);
    });

    it('should identify morning insight', async () => {
      // Arrange - Heavy listening between 6-11am
      const hourlyMap = new Map<number, number>([
        [6, 100],
        [7, 100],
        [8, 100],
        [9, 100],
        [10, 100],
        [11, 100],
      ]);
      mockHistoryStorage.getHourlyDistribution = jest
        .fn()
        .mockResolvedValue(hourlyMap);

      // Act
      const result = await statsService.getHourlyDistribution();

      // Assert
      expect(result.insight).toBe('morning');
    });

    it('should identify afternoon insight', async () => {
      // Arrange - Heavy listening between 12-17
      const hourlyMap = new Map<number, number>([
        [12, 100],
        [13, 100],
        [14, 100],
        [15, 100],
        [16, 100],
        [17, 100],
      ]);
      mockHistoryStorage.getHourlyDistribution = jest
        .fn()
        .mockResolvedValue(hourlyMap);

      // Act
      const result = await statsService.getHourlyDistribution();

      // Assert
      expect(result.insight).toBe('afternoon');
    });

    it('should identify evening insight', async () => {
      // Arrange - Heavy listening between 18-23
      const hourlyMap = new Map<number, number>([
        [18, 100],
        [19, 100],
        [20, 100],
        [21, 100],
        [22, 100],
        [23, 100],
      ]);
      mockHistoryStorage.getHourlyDistribution = jest
        .fn()
        .mockResolvedValue(hourlyMap);

      // Act
      const result = await statsService.getHourlyDistribution();

      // Assert
      expect(result.insight).toBe('evening');
    });

    it('should identify night insight', async () => {
      // Arrange - Heavy listening between 0-5
      const hourlyMap = new Map<number, number>([
        [0, 100],
        [1, 100],
        [2, 100],
        [3, 100],
        [4, 100],
        [5, 100],
      ]);
      mockHistoryStorage.getHourlyDistribution = jest
        .fn()
        .mockResolvedValue(hourlyMap);

      // Act
      const result = await statsService.getHourlyDistribution();

      // Assert
      expect(result.insight).toBe('night');
    });
  });

  describe('getDayOfWeekDistribution', () => {
    it('should return day of week distribution from historyStorage', async () => {
      // Arrange
      const dayMap = new Map<number, number>([
        [0, 10], // Sunday
        [1, 20], // Monday
        [2, 15],
        [3, 25],
        [4, 30],
        [5, 18],
        [6, 12], // Saturday
      ]);
      mockHistoryStorage.getDayOfWeekDistribution = jest
        .fn()
        .mockResolvedValue(dayMap);

      // Act
      const result = await statsService.getDayOfWeekDistribution();

      // Assert
      expect(result.distribution).toHaveLength(7);
      expect(result.distribution[0].dayName).toBe('Sunday');
      expect(result.distribution[0].count).toBe(10);
      expect(result.distribution[1].count).toBe(20);
      expect(result.peakDay).toBe(4); // Thursday with 30
    });

    it('should handle empty distribution', async () => {
      // Arrange
      mockHistoryStorage.getDayOfWeekDistribution = jest
        .fn()
        .mockResolvedValue(new Map());

      // Act
      const result = await statsService.getDayOfWeekDistribution();

      // Assert
      expect(result.distribution).toHaveLength(7);
      expect(result.peakDay).toBe(0);
      expect(result.weekdayAvg).toBe(0);
      expect(result.weekendAvg).toBe(0);
    });

    it('should identify weekday insight', async () => {
      // Arrange - Heavy weekday listening
      const dayMap = new Map<number, number>([
        [0, 5], // Sunday
        [1, 50], // Monday
        [2, 50],
        [3, 50],
        [4, 50],
        [5, 50],
        [6, 5], // Saturday
      ]);
      mockHistoryStorage.getDayOfWeekDistribution = jest
        .fn()
        .mockResolvedValue(dayMap);

      // Act
      const result = await statsService.getDayOfWeekDistribution();

      // Assert
      expect(result.insight).toBe('weekday');
      expect(result.weekdayAvg).toBeGreaterThan(result.weekendAvg);
    });

    it('should identify weekend insight', async () => {
      // Arrange - Heavy weekend listening
      const dayMap = new Map<number, number>([
        [0, 100], // Sunday
        [1, 10], // Monday
        [2, 10],
        [3, 10],
        [4, 10],
        [5, 10],
        [6, 100], // Saturday
      ]);
      mockHistoryStorage.getDayOfWeekDistribution = jest
        .fn()
        .mockResolvedValue(dayMap);

      // Act
      const result = await statsService.getDayOfWeekDistribution();

      // Assert
      expect(result.insight).toBe('weekend');
      expect(result.weekendAvg).toBeGreaterThan(result.weekdayAvg);
    });
  });

  describe('getAlbumsForDate', () => {
    it('should return albums played on a specific date', async () => {
      // Arrange
      const date = new Date(2024, 0, 15, 12, 0, 0); // Jan 15, 2024 noon
      const dateStr = '2024-01-15';
      const timestamp = Math.floor(date.getTime() / 1000);

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'radiohead|ok computer': {
            lastPlayed: timestamp,
            playCount: 5,
            plays: Array.from({ length: 5 }, () => ({ timestamp })),
          },
          'pink floyd|the wall': {
            lastPlayed: timestamp,
            playCount: 3,
            plays: Array.from({ length: 3 }, () => ({ timestamp })),
          },
        })
      );

      // Act
      const result = await statsService.getAlbumsForDate(dateStr);

      // Assert
      expect(result.date).toBe(dateStr);
      expect(result.totalScrobbles).toBe(8);
      expect(result.albums).toHaveLength(2);
      expect(result.albums[0].artist).toBe('Radiohead');
      expect(result.albums[0].playCount).toBe(5);
    });

    it('should return empty result when no plays on date', async () => {
      // Arrange
      mockHistoryStorage.getIndex.mockResolvedValue(createMockIndex({}));

      // Act
      const result = await statsService.getAlbumsForDate('2024-01-15');

      // Assert
      expect(result.date).toBe('2024-01-15');
      expect(result.totalScrobbles).toBe(0);
      expect(result.albums).toEqual([]);
    });

    it('should return empty result when no history', async () => {
      // Arrange
      mockHistoryStorage.getIndex.mockResolvedValue(null);

      // Act
      const result = await statsService.getAlbumsForDate('2024-01-15');

      // Assert
      expect(result.totalScrobbles).toBe(0);
      expect(result.albums).toEqual([]);
    });

    it('should filter plays to only the specified date', async () => {
      // Arrange
      const targetDate = new Date(2024, 0, 15, 12, 0, 0);
      const otherDate = new Date(2024, 0, 16, 12, 0, 0);

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'artist|album': {
            lastPlayed: Math.floor(otherDate.getTime() / 1000),
            playCount: 10,
            plays: [
              ...Array.from({ length: 5 }, () => ({
                timestamp: Math.floor(targetDate.getTime() / 1000),
              })),
              ...Array.from({ length: 5 }, () => ({
                timestamp: Math.floor(otherDate.getTime() / 1000),
              })),
            ],
          },
        })
      );

      // Act
      const result = await statsService.getAlbumsForDate('2024-01-15');

      // Assert
      expect(result.totalScrobbles).toBe(5);
    });
  });

  describe('getOnThisDay', () => {
    it('should return plays from this date across multiple years', async () => {
      // Arrange
      const date2023 = new Date(2023, 0, 15, 12, 0, 0);
      const date2024 = new Date(2024, 0, 15, 12, 0, 0);
      const otherDate = new Date(2024, 0, 20, 12, 0, 0);

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'radiohead|ok computer': {
            lastPlayed: Math.floor(date2024.getTime() / 1000),
            playCount: 8,
            plays: [
              ...Array.from({ length: 5 }, () => ({
                timestamp: Math.floor(date2024.getTime() / 1000),
              })),
              ...Array.from({ length: 3 }, () => ({
                timestamp: Math.floor(date2023.getTime() / 1000),
              })),
            ],
          },
          'pink floyd|the wall': {
            lastPlayed: Math.floor(otherDate.getTime() / 1000),
            playCount: 2,
            plays: Array.from({ length: 2 }, () => ({
              timestamp: Math.floor(otherDate.getTime() / 1000),
            })),
          },
        })
      );

      // Act
      const result = await statsService.getOnThisDay(1, 15);

      // Assert
      expect(result.date).toEqual({ month: 1, day: 15 });
      expect(result.years).toHaveLength(2);
      expect(result.years[0].year).toBe(2024);
      expect(result.years[0].totalScrobbles).toBe(5);
      expect(result.years[1].year).toBe(2023);
      expect(result.years[1].totalScrobbles).toBe(3);
    });

    it('should return empty result when no plays on this date', async () => {
      // Arrange
      mockHistoryStorage.getIndex.mockResolvedValue(createMockIndex({}));

      // Act
      const result = await statsService.getOnThisDay(12, 25);

      // Assert
      expect(result.date).toEqual({ month: 12, day: 25 });
      expect(result.years).toEqual([]);
    });

    it('should return empty result when no history', async () => {
      // Arrange
      mockHistoryStorage.getIndex.mockResolvedValue(null);

      // Act
      const result = await statsService.getOnThisDay(6, 1);

      // Assert
      expect(result.years).toEqual([]);
    });

    it('should sort years in descending order', async () => {
      // Arrange
      const date2020 = new Date(2020, 5, 10, 12, 0, 0);
      const date2022 = new Date(2022, 5, 10, 12, 0, 0);
      const date2024 = new Date(2024, 5, 10, 12, 0, 0);

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'artist|album': {
            lastPlayed: Math.floor(date2024.getTime() / 1000),
            playCount: 6,
            plays: [
              { timestamp: Math.floor(date2020.getTime() / 1000) },
              { timestamp: Math.floor(date2020.getTime() / 1000) },
              { timestamp: Math.floor(date2022.getTime() / 1000) },
              { timestamp: Math.floor(date2022.getTime() / 1000) },
              { timestamp: Math.floor(date2024.getTime() / 1000) },
              { timestamp: Math.floor(date2024.getTime() / 1000) },
            ],
          },
        })
      );

      // Act
      const result = await statsService.getOnThisDay(6, 10);

      // Assert
      expect(result.years).toHaveLength(3);
      expect(result.years[0].year).toBe(2024);
      expect(result.years[1].year).toBe(2022);
      expect(result.years[2].year).toBe(2020);
    });

    it('should calculate years ago correctly', async () => {
      // Arrange
      const currentYear = new Date().getFullYear();
      const twoYearsAgo = new Date(currentYear - 2, 2, 15, 12, 0, 0);

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'artist|album': {
            lastPlayed: Math.floor(twoYearsAgo.getTime() / 1000),
            playCount: 1,
            plays: [{ timestamp: Math.floor(twoYearsAgo.getTime() / 1000) }],
          },
        })
      );

      // Act
      const result = await statsService.getOnThisDay(3, 15);

      // Assert
      expect(result.years).toHaveLength(1);
      expect(result.years[0].yearsAgo).toBe(2);
    });
  });

  describe('getArtistDetail', () => {
    it('should return default response when no history', async () => {
      // Arrange
      mockHistoryStorage.getIndex.mockResolvedValue(null);

      // Act
      const result = await statsService.getArtistDetail(
        'Radiohead',
        'month',
        []
      );

      // Assert
      expect(result.artist).toBe('Radiohead');
      expect(result.totalPlayCount).toBe(0);
      expect(result.firstPlayed).toBeNull();
      expect(result.lastPlayed).toBeNull();
      expect(result.periodCounts.allTime).toBe(0);
      expect(result.topTracks).toEqual([]);
      expect(result.albums).toEqual([]);
    });

    it('should aggregate plays across all albums by an artist', async () => {
      // Arrange
      const now = new Date();
      const nowSeconds = Math.floor(now.getTime() / 1000);

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'radiohead|ok computer': {
            lastPlayed: nowSeconds,
            playCount: 30,
            plays: Array.from({ length: 30 }, () => ({
              timestamp: nowSeconds,
            })),
          },
          'radiohead|kid a': {
            lastPlayed: nowSeconds,
            playCount: 20,
            plays: Array.from({ length: 20 }, () => ({
              timestamp: nowSeconds,
            })),
          },
          'pink floyd|the wall': {
            lastPlayed: nowSeconds,
            playCount: 10,
            plays: Array.from({ length: 10 }, () => ({
              timestamp: nowSeconds,
            })),
          },
        })
      );

      // Act
      const result = await statsService.getArtistDetail(
        'Radiohead',
        'month',
        []
      );

      // Assert
      expect(result.artist).toBe('Radiohead');
      expect(result.totalPlayCount).toBe(50);
      expect(result.albums).toHaveLength(2);
    });

    it('should filter by artist name case-insensitively', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'RADIOHEAD|ok computer': {
            lastPlayed: now,
            playCount: 10,
            plays: Array.from({ length: 10 }, () => ({ timestamp: now })),
          },
        })
      );

      // Act
      const result = await statsService.getArtistDetail(
        'radiohead',
        'month',
        []
      );

      // Assert
      expect(result.totalPlayCount).toBe(10);
    });

    it('should return empty result when artist not found', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);

      mockHistoryStorage.getIndex.mockResolvedValue(
        createMockIndex({
          'other artist|album': {
            lastPlayed: now,
            playCount: 10,
            plays: Array.from({ length: 10 }, () => ({ timestamp: now })),
          },
        })
      );

      // Act
      const result = await statsService.getArtistDetail(
        'Radiohead',
        'month',
        []
      );

      // Assert
      expect(result.totalPlayCount).toBe(0);
      expect(result.albums).toEqual([]);
    });
  });

  describe('getTrackDetail', () => {
    it('should return default response when no history', async () => {
      // Arrange
      mockHistoryStorage.getIndex.mockResolvedValue(null);

      // Act
      const result = await statsService.getTrackDetail(
        'Radiohead',
        'Paranoid Android',
        undefined,
        'month',
        []
      );

      // Assert
      expect(result.artist).toBe('Radiohead');
      expect(result.track).toBe('Paranoid Android');
      expect(result.totalPlayCount).toBe(0);
      expect(result.firstPlayed).toBeNull();
      expect(result.lastPlayed).toBeNull();
      expect(result.playTrend).toEqual([]);
      expect(result.appearsOn).toEqual([]);
    });

    it('should aggregate plays for a track across albums', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);

      const createIndexWithTracks = (
        albums: Record<
          string,
          {
            lastPlayed: number;
            playCount: number;
            plays: { timestamp: number; track?: string }[];
          }
        >
      ): ScrobbleHistoryIndex => ({
        albums,
        totalScrobbles: Object.values(albums).reduce(
          (sum, a) => sum + a.playCount,
          0
        ),
        lastSyncTimestamp: now,
        oldestScrobbleDate: 0,
      });

      mockHistoryStorage.getIndex.mockResolvedValue(
        createIndexWithTracks({
          'radiohead|ok computer': {
            lastPlayed: now,
            playCount: 10,
            plays: Array.from({ length: 10 }, () => ({
              timestamp: now,
              track: 'Paranoid Android',
            })),
          },
          'radiohead|live album': {
            lastPlayed: now,
            playCount: 5,
            plays: Array.from({ length: 5 }, () => ({
              timestamp: now,
              track: 'Paranoid Android',
            })),
          },
        })
      );

      // Act
      const result = await statsService.getTrackDetail(
        'Radiohead',
        'Paranoid Android',
        undefined,
        'month',
        []
      );

      // Assert
      expect(result.totalPlayCount).toBe(15);
      expect(result.appearsOn).toHaveLength(2);
    });

    it('should filter by album when provided', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);

      const createIndexWithTracks = (
        albums: Record<
          string,
          {
            lastPlayed: number;
            playCount: number;
            plays: { timestamp: number; track?: string }[];
          }
        >
      ): ScrobbleHistoryIndex => ({
        albums,
        totalScrobbles: Object.values(albums).reduce(
          (sum, a) => sum + a.playCount,
          0
        ),
        lastSyncTimestamp: now,
        oldestScrobbleDate: 0,
      });

      mockHistoryStorage.getIndex.mockResolvedValue(
        createIndexWithTracks({
          'radiohead|ok computer': {
            lastPlayed: now,
            playCount: 10,
            plays: Array.from({ length: 10 }, () => ({
              timestamp: now,
              track: 'Paranoid Android',
            })),
          },
          'radiohead|live album': {
            lastPlayed: now,
            playCount: 5,
            plays: Array.from({ length: 5 }, () => ({
              timestamp: now,
              track: 'Paranoid Android',
            })),
          },
        })
      );

      // Act
      const result = await statsService.getTrackDetail(
        'Radiohead',
        'Paranoid Android',
        'OK Computer',
        'month',
        []
      );

      // Assert
      expect(result.totalPlayCount).toBe(10);
      expect(result.appearsOn).toHaveLength(1);
      expect(result.appearsOn[0].album).toBe('Ok Computer');
    });

    it('should match track names case-insensitively', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);

      const createIndexWithTracks = (
        albums: Record<
          string,
          {
            lastPlayed: number;
            playCount: number;
            plays: { timestamp: number; track?: string }[];
          }
        >
      ): ScrobbleHistoryIndex => ({
        albums,
        totalScrobbles: Object.values(albums).reduce(
          (sum, a) => sum + a.playCount,
          0
        ),
        lastSyncTimestamp: now,
        oldestScrobbleDate: 0,
      });

      mockHistoryStorage.getIndex.mockResolvedValue(
        createIndexWithTracks({
          'radiohead|ok computer': {
            lastPlayed: now,
            playCount: 10,
            plays: Array.from({ length: 10 }, () => ({
              timestamp: now,
              track: 'PARANOID ANDROID',
            })),
          },
        })
      );

      // Act
      const result = await statsService.getTrackDetail(
        'Radiohead',
        'paranoid android',
        undefined,
        'month',
        []
      );

      // Assert
      expect(result.totalPlayCount).toBe(10);
    });
  });

  describe('clearForgottenFavoritesCache', () => {
    it('should clear the forgotten favorites cache', async () => {
      // Arrange - First populate the cache
      const now = Math.floor(Date.now() / 1000);
      const sixMonthsAgo = now - 180 * 24 * 60 * 60;

      const createIndexWithTracks = (
        albums: Record<
          string,
          {
            lastPlayed: number;
            playCount: number;
            plays: { timestamp: number; track?: string }[];
          }
        >
      ): ScrobbleHistoryIndex => ({
        albums,
        totalScrobbles: Object.values(albums).reduce(
          (sum, a) => sum + a.playCount,
          0
        ),
        lastSyncTimestamp: now,
        oldestScrobbleDate: 0,
      });

      mockHistoryStorage.getIndex.mockResolvedValue(
        createIndexWithTracks({
          'artist|album': {
            lastPlayed: sixMonthsAgo,
            playCount: 15,
            plays: Array.from({ length: 15 }, () => ({
              timestamp: sixMonthsAgo,
              track: 'Track',
            })),
          },
        })
      );

      // First call to populate cache
      await statsService.getForgottenFavorites(90, 10, 100);
      expect(mockHistoryStorage.getIndex).toHaveBeenCalledTimes(1);

      // Act - Clear the cache
      statsService.clearForgottenFavoritesCache();

      // Second call should refetch (not use cache)
      await statsService.getForgottenFavorites(90, 10, 100);

      // Assert - getIndex should be called twice (cache was cleared)
      expect(mockHistoryStorage.getIndex).toHaveBeenCalledTimes(2);
    });
  });

  describe('setTrackMappingService', () => {
    it('should set the track mapping service', () => {
      // Arrange
      const mockTrackMappingService = {
        getTrackMapping: jest.fn(),
      } as unknown as TrackMappingService;

      // Act
      statsService.setTrackMappingService(mockTrackMappingService);

      // Assert - Service should be set (verify by checking it's used in forgotten favorites)
      // No direct way to assert, but the method should execute without error
      expect(() =>
        statsService.setTrackMappingService(mockTrackMappingService)
      ).not.toThrow();
    });
  });

  describe('setMappingService', () => {
    it('should set the mapping service', () => {
      // Arrange
      const mockMappingService = {
        getAlbumMappingForCollection: jest.fn(),
      } as unknown as MappingService;

      // Act
      statsService.setMappingService(mockMappingService);

      // Assert - Service should be set (verify by checking it's used)
      expect(() =>
        statsService.setMappingService(mockMappingService)
      ).not.toThrow();
    });
  });

  describe('setArtistNameResolver', () => {
    it('should set the artist name resolver', () => {
      // Arrange
      const mockResolver = {
        resolveArtist: jest.fn().mockReturnValue('resolved artist'),
        areSameArtist: jest.fn().mockReturnValue(true),
        getDisplayName: jest.fn().mockReturnValue('Display Name'),
      } as unknown as ArtistNameResolver;

      // Act
      statsService.setArtistNameResolver(mockResolver);

      // Assert - Resolver should be set
      expect(() =>
        statsService.setArtistNameResolver(mockResolver)
      ).not.toThrow();
    });
  });
});
