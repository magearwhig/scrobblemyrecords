import { DiscogsService } from '../../../src/backend/services/discogsService';
import { ImageService } from '../../../src/backend/services/imageService';
import { ScrobbleHistoryStorage } from '../../../src/backend/services/scrobbleHistoryStorage';
import { StatsService } from '../../../src/backend/services/statsService';
import { WrappedService } from '../../../src/backend/services/wrappedService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';
import { ScrobbleHistoryIndex } from '../../../src/shared/types';

// Mock dependencies
jest.mock('../../../src/backend/services/statsService');
jest.mock('../../../src/backend/services/scrobbleHistoryStorage');
jest.mock('../../../src/backend/services/discogsService');
jest.mock('../../../src/backend/services/imageService');
jest.mock('../../../src/backend/utils/fileStorage');

const MockedStatsService = StatsService as jest.MockedClass<
  typeof StatsService
>;
const MockedHistoryStorage = ScrobbleHistoryStorage as jest.MockedClass<
  typeof ScrobbleHistoryStorage
>;
const MockedDiscogsService = DiscogsService as jest.MockedClass<
  typeof DiscogsService
>;
const MockedImageService = ImageService as jest.MockedClass<
  typeof ImageService
>;
const MockedFileStorage = FileStorage as jest.MockedClass<typeof FileStorage>;

describe('WrappedService', () => {
  let wrappedService: WrappedService;
  let mockStatsService: jest.Mocked<StatsService>;
  let mockHistoryStorage: jest.Mocked<ScrobbleHistoryStorage>;
  let mockDiscogsService: jest.Mocked<DiscogsService>;
  let mockImageService: jest.Mocked<ImageService>;
  let mockFileStorage: jest.Mocked<FileStorage>;

  // Test date range: Jan 1 2024 to Dec 31 2024
  const startDateMs = new Date('2024-01-01T00:00:00Z').getTime();
  const endDateMs = new Date('2024-12-31T23:59:59Z').getTime();

  // Sample scrobble history index
  const sampleIndex: ScrobbleHistoryIndex = {
    lastSyncTimestamp: Date.now() / 1000,
    totalScrobbles: 100,
    oldestScrobbleDate: new Date('2023-01-01').getTime() / 1000,
    albums: {
      'radiohead|ok computer': {
        lastPlayed: new Date('2024-06-15').getTime() / 1000,
        playCount: 50,
        plays: [
          // Plays in range
          {
            timestamp: new Date('2024-03-01T20:00:00Z').getTime() / 1000,
            track: 'Paranoid Android',
          },
          {
            timestamp: new Date('2024-03-02T20:00:00Z').getTime() / 1000,
            track: 'Karma Police',
          },
          {
            timestamp: new Date('2024-03-03T14:00:00Z').getTime() / 1000,
            track: 'Lucky',
          },
          {
            timestamp: new Date('2024-06-15T21:00:00Z').getTime() / 1000,
            track: 'Paranoid Android',
          },
          // Play outside range (2023)
          {
            timestamp: new Date('2023-06-01T20:00:00Z').getTime() / 1000,
            track: 'Paranoid Android',
          },
        ],
      },
      'pink floyd|dark side of the moon': {
        lastPlayed: new Date('2024-04-10').getTime() / 1000,
        playCount: 30,
        plays: [
          {
            timestamp: new Date('2024-04-10T19:00:00Z').getTime() / 1000,
            track: 'Money',
          },
          {
            timestamp: new Date('2024-04-10T19:05:00Z').getTime() / 1000,
            track: 'Time',
          },
        ],
      },
      // Artist first discovered in 2024 (no plays before range)
      'boards of canada|music has the right to children': {
        lastPlayed: new Date('2024-05-20').getTime() / 1000,
        playCount: 10,
        plays: [
          {
            timestamp: new Date('2024-05-20T10:00:00Z').getTime() / 1000,
            track: 'Roygbiv',
          },
          {
            timestamp: new Date('2024-05-21T10:00:00Z').getTime() / 1000,
            track: 'Telephasic Workshop',
          },
        ],
      },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockFileStorage = new MockedFileStorage('test') as jest.Mocked<FileStorage>;
    mockStatsService = new MockedStatsService(
      mockFileStorage,
      new MockedHistoryStorage(mockFileStorage)
    ) as jest.Mocked<StatsService>;
    mockHistoryStorage = new MockedHistoryStorage(
      mockFileStorage
    ) as jest.Mocked<ScrobbleHistoryStorage>;
    mockDiscogsService = new MockedDiscogsService(
      mockFileStorage,
      {} as any
    ) as jest.Mocked<DiscogsService>;
    mockImageService = new MockedImageService(
      mockFileStorage,
      {} as any
    ) as jest.Mocked<ImageService>;

    wrappedService = new WrappedService(
      mockStatsService,
      mockHistoryStorage,
      mockDiscogsService,
      mockImageService,
      mockFileStorage
    );

    // Default mocks
    mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(sampleIndex);
    mockHistoryStorage.getAlbumHistoryFuzzy = jest.fn().mockResolvedValue({
      entry: null,
      match: 'none',
    });
    mockHistoryStorage.normalizeKey = jest
      .fn()
      .mockImplementation(
        (artist: string, album: string) =>
          `${artist.toLowerCase().trim()}|${album.toLowerCase().trim()}`
      );
    // batchLookup delegates to getAlbumHistoryFuzzy so existing test setups still work
    mockHistoryStorage.batchLookup = jest
      .fn()
      .mockImplementation(
        async (keys: Array<{ artist: string; album: string }>) => {
          const result = new Map();
          for (const { artist, album } of keys) {
            const mapKey = `${artist.toLowerCase().trim()}|${album.toLowerCase().trim()}`;
            const fuzzyResult = await mockHistoryStorage.getAlbumHistoryFuzzy(
              artist,
              album
            );
            result.set(mapKey, fuzzyResult);
          }
          return result;
        }
      );

    mockStatsService.getTopArtists = jest.fn().mockResolvedValue([
      { artist: 'Radiohead', playCount: 4 },
      { artist: 'Pink Floyd', playCount: 2 },
    ]);
    mockStatsService.getTopAlbums = jest.fn().mockResolvedValue([
      {
        artist: 'Radiohead',
        album: 'OK Computer',
        playCount: 4,
        lastPlayed: 0,
      },
    ]);
    mockStatsService.getTopTracks = jest.fn().mockResolvedValue([
      {
        artist: 'Radiohead',
        album: 'OK Computer',
        track: 'Paranoid Android',
        playCount: 2,
        lastPlayed: 0,
      },
    ]);

    mockImageService.batchGetArtistImages = jest
      .fn()
      .mockResolvedValue(new Map());
    mockImageService.batchGetAlbumCovers = jest
      .fn()
      .mockResolvedValue(new Map());

    // FileStorage mocks for collection loading
    mockFileStorage.readJSON = jest.fn().mockResolvedValue(null);
    mockFileStorage.listFiles = jest.fn().mockResolvedValue([]);
  });

  describe('generateWrapped', () => {
    it('should generate wrapped data with correct structure', async () => {
      // Act
      const result = await wrappedService.generateWrapped(
        startDateMs,
        endDateMs
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.startDate).toBe(startDateMs);
      expect(result.endDate).toBe(endDateMs);
      expect(result.generatedAt).toBeGreaterThan(0);
      expect(result.listening).toBeDefined();
      expect(result.collection).toBeDefined();
      expect(result.crossSource).toBeDefined();
    });

    it('should compute correct total scrobbles for range', async () => {
      // Act
      const result = await wrappedService.generateWrapped(
        startDateMs,
        endDateMs
      );

      // Assert: 4 radiohead + 2 pink floyd + 2 boards of canada = 8 in range
      expect(result.listening.totalScrobbles).toBe(8);
    });

    it('should compute estimated listening hours', async () => {
      // Act
      const result = await wrappedService.generateWrapped(
        startDateMs,
        endDateMs
      );

      // Assert: 8 scrobbles * 3.5 min / 60 = 0.47 hours ~ 0.5 rounded
      expect(result.listening.estimatedListeningHours).toBeGreaterThan(0);
    });

    it('should compute unique artists count', async () => {
      // Act
      const result = await wrappedService.generateWrapped(
        startDateMs,
        endDateMs
      );

      // Assert: radiohead, pink floyd, boards of canada
      expect(result.listening.uniqueArtists).toBe(3);
    });

    it('should compute unique albums count', async () => {
      // Act
      const result = await wrappedService.generateWrapped(
        startDateMs,
        endDateMs
      );

      // Assert: ok computer, dark side of the moon, music has the right to children
      expect(result.listening.uniqueAlbums).toBe(3);
    });

    it('should detect new artists discovered in range', async () => {
      // Act
      const result = await wrappedService.generateWrapped(
        startDateMs,
        endDateMs
      );

      // Assert: boards of canada has no plays before 2024, so it's new
      // radiohead and pink floyd have plays before range (radiohead has 2023 play)
      expect(result.listening.newArtistsDiscovered).toBe(2);
      // Pink Floyd and Boards of Canada are both new (no plays before 2024)
    });

    it('should find peak listening day', async () => {
      // Act
      const result = await wrappedService.generateWrapped(
        startDateMs,
        endDateMs
      );

      // Assert
      expect(result.listening.peakListeningDay).not.toBeNull();
      expect(result.listening.peakListeningDay!.scrobbleCount).toBeGreaterThan(
        0
      );
    });

    it('should find peak listening hour', async () => {
      // Act
      const result = await wrappedService.generateWrapped(
        startDateMs,
        endDateMs
      );

      // Assert
      expect(result.listening.peakListeningHour).not.toBeNull();
      expect(result.listening.peakListeningHour!.hour).toBeGreaterThanOrEqual(
        0
      );
      expect(result.listening.peakListeningHour!.hour).toBeLessThanOrEqual(23);
    });

    it('should calculate longest streak', async () => {
      // Act
      const result = await wrappedService.generateWrapped(
        startDateMs,
        endDateMs
      );

      // Assert: March 1-3 has 3 consecutive days
      expect(result.listening.longestStreak).not.toBeNull();
      expect(result.listening.longestStreak!.days).toBeGreaterThanOrEqual(3);
    });

    it('should generate heatmap data', async () => {
      // Act
      const result = await wrappedService.generateWrapped(
        startDateMs,
        endDateMs
      );

      // Assert
      expect(result.listening.heatmapData.length).toBeGreaterThan(0);
      expect(result.listening.heatmapData[0]).toHaveProperty('date');
      expect(result.listening.heatmapData[0]).toHaveProperty('count');
    });

    it('should delegate top lists to StatsService', async () => {
      // Act
      await wrappedService.generateWrapped(startDateMs, endDateMs);

      // Assert
      expect(mockStatsService.getTopArtists).toHaveBeenCalledWith(
        'custom',
        5,
        startDateMs / 1000,
        endDateMs / 1000
      );
      expect(mockStatsService.getTopAlbums).toHaveBeenCalledWith(
        'custom',
        5,
        startDateMs / 1000,
        endDateMs / 1000
      );
      expect(mockStatsService.getTopTracks).toHaveBeenCalledWith(
        'custom',
        5,
        startDateMs / 1000,
        endDateMs / 1000
      );
    });
  });

  describe('empty data handling', () => {
    it('should handle empty scrobble history gracefully', async () => {
      // Arrange
      mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(null);

      // Act
      const result = await wrappedService.generateWrapped(
        startDateMs,
        endDateMs
      );

      // Assert
      expect(result.listening.totalScrobbles).toBe(0);
      expect(result.listening.estimatedListeningHours).toBe(0);
      expect(result.listening.uniqueArtists).toBe(0);
      expect(result.listening.topArtists).toEqual([]);
      expect(result.listening.peakListeningDay).toBeNull();
      expect(result.listening.longestStreak).toBeNull();
    });

    it('should handle empty collection gracefully', async () => {
      // Act
      const result = await wrappedService.generateWrapped(
        startDateMs,
        endDateMs
      );

      // Assert
      expect(result.collection.recordsAdded).toBe(0);
      expect(result.collection.recordsList).toEqual([]);
      expect(result.collection.mostPlayedNewAddition).toBeNull();
    });

    it('should handle range with no data gracefully', async () => {
      // Arrange: set range to a period with no plays
      const emptyStart = new Date('2020-01-01').getTime();
      const emptyEnd = new Date('2020-12-31').getTime();

      // Act
      const result = await wrappedService.generateWrapped(emptyStart, emptyEnd);

      // Assert
      expect(result.listening.totalScrobbles).toBe(0);
    });
  });

  describe('collection stats', () => {
    it('should filter collection items by date_added', async () => {
      // Arrange: mock collection with items
      mockFileStorage.readJSON = jest
        .fn()
        .mockImplementation((path: string) => {
          if (path === 'settings/user-settings.json') {
            return Promise.resolve({
              discogs: { username: 'testuser' },
            });
          }
          if (path === 'collections/testuser-page-1.json') {
            return Promise.resolve({
              data: [
                {
                  id: 1,
                  date_added: '2024-06-15T00:00:00Z',
                  release: {
                    id: 100,
                    artist: 'Radiohead',
                    title: 'In Rainbows',
                    year: 2007,
                    cover_image: 'http://example.com/cover.jpg',
                    format: ['Vinyl'],
                    label: ['XL'],
                    resource_url: '',
                  },
                },
                {
                  id: 2,
                  date_added: '2023-01-01T00:00:00Z',
                  release: {
                    id: 200,
                    artist: 'Pink Floyd',
                    title: 'Animals',
                    year: 1977,
                    format: ['Vinyl'],
                    label: ['Harvest'],
                    resource_url: '',
                  },
                },
              ],
              timestamp: Date.now(),
            });
          }
          if (path === 'collections/testuser-page-2.json') {
            return Promise.resolve(null);
          }
          return Promise.resolve(null);
        });

      // Act
      const result = await wrappedService.generateWrapped(
        startDateMs,
        endDateMs
      );

      // Assert: only Radiohead was added in 2024
      expect(result.collection.recordsAdded).toBe(1);
      expect(result.collection.recordsList[0].artist).toBe('Radiohead');
    });
  });

  describe('cross source stats', () => {
    it('should compute collection coverage', async () => {
      // Arrange: mock a small collection
      mockFileStorage.readJSON = jest
        .fn()
        .mockImplementation((path: string) => {
          if (path === 'settings/user-settings.json') {
            return Promise.resolve({
              discogs: { username: 'testuser' },
            });
          }
          if (path === 'collections/testuser-page-1.json') {
            return Promise.resolve({
              data: [
                {
                  id: 1,
                  date_added: '2023-01-01T00:00:00Z',
                  release: {
                    id: 100,
                    artist: 'Radiohead',
                    title: 'OK Computer',
                    year: 1997,
                    format: ['Vinyl'],
                    label: ['Parlophone'],
                    resource_url: '',
                  },
                },
                {
                  id: 2,
                  date_added: '2023-01-01T00:00:00Z',
                  release: {
                    id: 200,
                    artist: 'Never Played Artist',
                    title: 'Never Played Album',
                    year: 2020,
                    format: ['Vinyl'],
                    label: ['Label'],
                    resource_url: '',
                  },
                },
              ],
              timestamp: Date.now(),
            });
          }
          if (path === 'collections/testuser-page-2.json') {
            return Promise.resolve(null);
          }
          return Promise.resolve(null);
        });

      // Mock fuzzy lookup to match Radiohead but not the other
      mockHistoryStorage.getAlbumHistoryFuzzy = jest
        .fn()
        .mockImplementation((artist: string) => {
          if (artist.toLowerCase().includes('radiohead')) {
            return Promise.resolve({
              entry: {
                lastPlayed: new Date('2024-06-15').getTime() / 1000,
                playCount: 4,
                plays: [
                  {
                    timestamp:
                      new Date('2024-03-01T20:00:00Z').getTime() / 1000,
                  },
                ],
              },
              match: 'fuzzy',
            });
          }
          return Promise.resolve({ entry: null, match: 'none' });
        });

      // Act
      const result = await wrappedService.generateWrapped(
        startDateMs,
        endDateMs
      );

      // Assert: 1 out of 2 albums played = 50%
      expect(result.crossSource.collectionCoverage).toBe(50);
      expect(result.crossSource.albumsPlayed).toBe(1);
      expect(result.crossSource.totalCollectionSize).toBe(2);
    });

    it('should handle zero collection coverage', async () => {
      // Act
      const result = await wrappedService.generateWrapped(
        startDateMs,
        endDateMs
      );

      // Assert
      expect(result.crossSource.totalCollectionSize).toBe(0);
      expect(result.crossSource.collectionCoverage).toBe(0);
    });

    it('should compute vinyl vs digital breakdown from session files', async () => {
      // Arrange: mock session files that match some scrobble timestamps
      const march1Timestamp = new Date('2024-03-01T20:00:00Z').getTime() / 1000;
      const march2Timestamp = new Date('2024-03-02T20:00:00Z').getTime() / 1000;

      mockFileStorage.listFiles = jest
        .fn()
        .mockResolvedValue(['session-abc.json']);

      mockFileStorage.readJSON = jest
        .fn()
        .mockImplementation((path: string) => {
          if (path === 'scrobbles/session-abc.json') {
            return Promise.resolve({
              id: 'abc',
              status: 'completed',
              tracks: [
                { timestamp: march1Timestamp },
                { timestamp: march2Timestamp },
              ],
              timestamp: Date.now(),
              albumInfo: {},
            });
          }
          if (path === 'settings/user-settings.json') {
            return Promise.resolve(null);
          }
          return Promise.resolve(null);
        });

      // Act
      const result = await wrappedService.generateWrapped(
        startDateMs,
        endDateMs
      );

      // Assert: 2 scrobbles match session timestamps (vinyl), rest are other
      expect(result.crossSource.vinylScrobbles).toBe(2);
      expect(result.crossSource.otherScrobbles).toBe(
        result.listening.totalScrobbles - 2
      );
      expect(result.crossSource.vinylPercentage).toBeGreaterThan(0);
      expect(result.crossSource.vinylPercentage).toBeLessThanOrEqual(100);
    });
  });

  describe('collection stats - most played new addition', () => {
    it('should find most-played new addition with fuzzy matching', async () => {
      // Arrange: collection item added in range
      mockFileStorage.readJSON = jest
        .fn()
        .mockImplementation((path: string) => {
          if (path === 'settings/user-settings.json') {
            return Promise.resolve({
              discogs: { username: 'testuser' },
            });
          }
          if (path === 'collections/testuser-page-1.json') {
            return Promise.resolve({
              data: [
                {
                  id: 1,
                  date_added: '2024-02-01T00:00:00Z',
                  release: {
                    id: 100,
                    artist: 'Radiohead',
                    title: 'OK Computer',
                    year: 1997,
                    cover_image: 'http://example.com/cover.jpg',
                    format: ['Vinyl'],
                    label: ['Parlophone'],
                    resource_url: '',
                  },
                },
                {
                  id: 2,
                  date_added: '2024-03-01T00:00:00Z',
                  release: {
                    id: 200,
                    artist: 'Pink Floyd',
                    title: 'Dark Side Of The Moon',
                    year: 1973,
                    cover_image: 'http://example.com/dsotm.jpg',
                    format: ['Vinyl'],
                    label: ['Harvest'],
                    resource_url: '',
                  },
                },
              ],
              timestamp: Date.now(),
            });
          }
          if (path === 'collections/testuser-page-2.json') {
            return Promise.resolve(null);
          }
          return Promise.resolve(null);
        });

      const feb1Sec = new Date('2024-02-01T00:00:00Z').getTime() / 1000;
      const mar1Sec = new Date('2024-03-01T00:00:00Z').getTime() / 1000;

      // Mock fuzzy lookup: Radiohead has 3 plays after add, Pink Floyd has 1
      mockHistoryStorage.getAlbumHistoryFuzzy = jest
        .fn()
        .mockImplementation((artist: string) => {
          if (artist.toLowerCase().includes('radiohead')) {
            return Promise.resolve({
              entry: {
                lastPlayed: new Date('2024-06-15').getTime() / 1000,
                playCount: 50,
                plays: [
                  { timestamp: feb1Sec + 86400 }, // Day after add
                  { timestamp: feb1Sec + 172800 },
                  { timestamp: feb1Sec + 259200 },
                ],
              },
              match: 'fuzzy',
            });
          }
          if (artist.toLowerCase().includes('pink floyd')) {
            return Promise.resolve({
              entry: {
                lastPlayed: new Date('2024-04-10').getTime() / 1000,
                playCount: 30,
                plays: [{ timestamp: mar1Sec + 86400 }],
              },
              match: 'fuzzy',
            });
          }
          return Promise.resolve({ entry: null, match: 'none' });
        });

      // Act
      const result = await wrappedService.generateWrapped(
        startDateMs,
        endDateMs
      );

      // Assert: Radiohead has 3 plays after being added (most played)
      expect(result.collection.mostPlayedNewAddition).not.toBeNull();
      expect(result.collection.mostPlayedNewAddition!.artist).toBe('Radiohead');
      expect(result.collection.mostPlayedNewAddition!.title).toBe(
        'OK Computer'
      );
      expect(result.collection.mostPlayedNewAddition!.playCount).toBe(3);
    });

    it('should return null when no new additions have plays', async () => {
      // Arrange: collection item added in range but no plays found
      mockFileStorage.readJSON = jest
        .fn()
        .mockImplementation((path: string) => {
          if (path === 'settings/user-settings.json') {
            return Promise.resolve({
              discogs: { username: 'testuser' },
            });
          }
          if (path === 'collections/testuser-page-1.json') {
            return Promise.resolve({
              data: [
                {
                  id: 1,
                  date_added: '2024-06-15T00:00:00Z',
                  release: {
                    id: 100,
                    artist: 'Unplayed Artist',
                    title: 'Unplayed Album',
                    year: 2024,
                    format: ['Vinyl'],
                    label: ['Label'],
                    resource_url: '',
                  },
                },
              ],
              timestamp: Date.now(),
            });
          }
          if (path === 'collections/testuser-page-2.json') {
            return Promise.resolve(null);
          }
          return Promise.resolve(null);
        });

      // Act
      const result = await wrappedService.generateWrapped(
        startDateMs,
        endDateMs
      );

      // Assert
      expect(result.collection.mostPlayedNewAddition).toBeNull();
    });
  });
});
