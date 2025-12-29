import { promises as fs } from 'fs';

import { ScrobbleHistoryStorage } from '../../src/backend/services/scrobbleHistoryStorage';
import { FileStorage } from '../../src/backend/utils/fileStorage';
import { ScrobbleHistoryIndex } from '../../src/shared/types';

describe('ScrobbleHistoryStorage', () => {
  let fileStorage: FileStorage;
  let storage: ScrobbleHistoryStorage;
  const testDataDir = './test-data-scrobble-history-storage';

  // Factory for creating mock index
  const createMockIndex = (
    overrides: Partial<ScrobbleHistoryIndex> = {}
  ): ScrobbleHistoryIndex => ({
    lastSyncTimestamp: Date.now(),
    totalScrobbles: 100,
    oldestScrobbleDate: Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60,
    albums: {},
    ...overrides,
  });

  beforeEach(async () => {
    fileStorage = new FileStorage(testDataDir);
    await fileStorage.ensureDataDir();
    storage = new ScrobbleHistoryStorage(fileStorage);
  });

  afterEach(async () => {
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch {
      // Ignore errors if directory doesn't exist
    }
  });

  describe('normalizeKey', () => {
    it('should normalize artist and album to lowercase', () => {
      // Arrange
      const artist = 'Radiohead';
      const album = 'Kid A';

      // Act
      const key = storage.normalizeKey(artist, album);

      // Assert
      expect(key).toBe('radiohead|kid a');
    });

    it('should trim whitespace', () => {
      // Arrange
      const artist = '  Radiohead  ';
      const album = '  Kid A  ';

      // Act
      const key = storage.normalizeKey(artist, album);

      // Assert
      expect(key).toBe('radiohead|kid a');
    });
  });

  describe('fuzzyNormalizeKey', () => {
    it('should remove Discogs disambiguation numbers', () => {
      // Arrange
      const artist = 'Radiohead (2)';
      const album = 'Kid A';

      // Act
      const key = storage.fuzzyNormalizeKey(artist, album);

      // Assert
      expect(key).toBe('radiohead|kida');
    });

    it('should remove common album suffixes', () => {
      // Arrange
      const testCases = [
        {
          artist: 'Radiohead',
          album: 'Kid A [Explicit]',
          expected: 'radiohead|kida',
        },
        {
          artist: 'Radiohead',
          album: 'Kid A (Deluxe)',
          expected: 'radiohead|kida',
        },
        {
          artist: 'Radiohead',
          album: 'Kid A (Remastered)',
          expected: 'radiohead|kida',
        },
      ];

      // Act & Assert
      testCases.forEach(({ artist, album, expected }) => {
        expect(storage.fuzzyNormalizeKey(artist, album)).toBe(expected);
      });
    });

    it('should remove non-alphanumeric characters', () => {
      // Arrange
      const artist = 'The Beatles';
      const album = "Sgt. Pepper's Lonely Hearts Club Band";

      // Act
      const key = storage.fuzzyNormalizeKey(artist, album);

      // Assert
      expect(key).toBe('thebeatles|sgtpepperslonelyheartsclubband');
    });
  });

  describe('getIndex', () => {
    it('should return null when no index exists', async () => {
      // Act
      const index = await storage.getIndex();

      // Assert
      expect(index).toBeNull();
    });

    it('should return the index when it exists', async () => {
      // Arrange
      const mockIndex = createMockIndex({
        totalScrobbles: 500,
        albums: {
          'radiohead|kid a': {
            lastPlayed: Math.floor(Date.now() / 1000),
            playCount: 10,
            plays: [],
          },
        },
      });
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        mockIndex
      );

      // Act
      const index = await storage.getIndex();

      // Assert
      expect(index).toBeDefined();
      expect(index?.totalScrobbles).toBe(500);
      expect(index?.albums['radiohead|kid a']).toBeDefined();
    });

    it('should cache the index', async () => {
      // Arrange
      const mockIndex = createMockIndex();
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        mockIndex
      );

      // Act
      const index1 = await storage.getIndex();
      const index2 = await storage.getIndex();

      // Assert
      expect(index1).toBe(index2); // Same reference (cached)
    });
  });

  describe('invalidateCache', () => {
    it('should clear the cached index', async () => {
      // Arrange
      const mockIndex = createMockIndex({ totalScrobbles: 100 });
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        mockIndex
      );
      await storage.getIndex(); // Populate cache

      // Act
      storage.invalidateCache();

      // Update the file
      const updatedIndex = createMockIndex({ totalScrobbles: 200 });
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        updatedIndex
      );
      const index = await storage.getIndex();

      // Assert
      expect(index?.totalScrobbles).toBe(200);
    });
  });

  describe('hasIndex', () => {
    it('should return false when no index exists', async () => {
      // Act
      const hasIndex = await storage.hasIndex();

      // Assert
      expect(hasIndex).toBe(false);
    });

    it('should return true when index exists', async () => {
      // Arrange
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex()
      );

      // Act
      const hasIndex = await storage.hasIndex();

      // Assert
      expect(hasIndex).toBe(true);
    });
  });

  describe('getTotalScrobbles', () => {
    it('should return 0 when no index exists', async () => {
      // Act
      const total = await storage.getTotalScrobbles();

      // Assert
      expect(total).toBe(0);
    });

    it('should return the total scrobble count', async () => {
      // Arrange
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex({ totalScrobbles: 1000 })
      );

      // Act
      const total = await storage.getTotalScrobbles();

      // Assert
      expect(total).toBe(1000);
    });
  });

  describe('getLastSyncTimestamp', () => {
    it('should return null when no index exists', async () => {
      // Act
      const timestamp = await storage.getLastSyncTimestamp();

      // Assert
      expect(timestamp).toBeNull();
    });

    it('should return the last sync timestamp', async () => {
      // Arrange
      const syncTime = Date.now();
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex({ lastSyncTimestamp: syncTime })
      );

      // Act
      const timestamp = await storage.getLastSyncTimestamp();

      // Assert
      expect(timestamp).toBe(syncTime);
    });
  });

  describe('getOldestScrobbleDate', () => {
    it('should return null when no index exists', async () => {
      // Act
      const date = await storage.getOldestScrobbleDate();

      // Assert
      expect(date).toBeNull();
    });

    it('should return the oldest scrobble date as Date object', async () => {
      // Arrange - use a specific timestamp to avoid timezone issues
      // Jan 15, 2015 12:00:00 UTC
      const oldestTimestamp = 1421323200;
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex({ oldestScrobbleDate: oldestTimestamp })
      );

      // Act
      const date = await storage.getOldestScrobbleDate();

      // Assert
      expect(date).toBeInstanceOf(Date);
      expect(date?.getUTCFullYear()).toBe(2015);
      expect(date?.getUTCMonth()).toBe(0); // January
    });
  });

  describe('getAlbumHistory', () => {
    it('should return null when album not found', async () => {
      // Arrange
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex()
      );

      // Act
      const history = await storage.getAlbumHistory('Unknown', 'Unknown');

      // Assert
      expect(history).toBeNull();
    });

    it('should return album history when found', async () => {
      // Arrange
      const albumEntry = {
        lastPlayed: Math.floor(Date.now() / 1000),
        playCount: 15,
        plays: [{ timestamp: Math.floor(Date.now() / 1000) }],
      };
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex({
          albums: {
            'radiohead|kid a': albumEntry,
          },
        })
      );

      // Act
      const history = await storage.getAlbumHistory('Radiohead', 'Kid A');

      // Assert
      expect(history).toBeDefined();
      expect(history?.playCount).toBe(15);
    });
  });

  describe('getLastPlayed', () => {
    it('should return null when album not found', async () => {
      // Arrange
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex()
      );

      // Act
      const lastPlayed = await storage.getLastPlayed('Unknown', 'Unknown');

      // Assert
      expect(lastPlayed).toBeNull();
    });

    it('should return last played timestamp', async () => {
      // Arrange
      const timestamp = Math.floor(Date.now() / 1000);
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex({
          albums: {
            'radiohead|kid a': {
              lastPlayed: timestamp,
              playCount: 5,
              plays: [],
            },
          },
        })
      );

      // Act
      const lastPlayed = await storage.getLastPlayed('Radiohead', 'Kid A');

      // Assert
      expect(lastPlayed).toBe(timestamp);
    });
  });

  describe('getPlayCount', () => {
    it('should return 0 when album not found', async () => {
      // Arrange
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex()
      );

      // Act
      const count = await storage.getPlayCount('Unknown', 'Unknown');

      // Assert
      expect(count).toBe(0);
    });

    it('should return play count for album', async () => {
      // Arrange
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex({
          albums: {
            'radiohead|kid a': { lastPlayed: 0, playCount: 42, plays: [] },
          },
        })
      );

      // Act
      const count = await storage.getPlayCount('Radiohead', 'Kid A');

      // Assert
      expect(count).toBe(42);
    });
  });

  describe('hasBeenPlayed', () => {
    it('should return false when album not found', async () => {
      // Arrange
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex()
      );

      // Act
      const played = await storage.hasBeenPlayed('Unknown', 'Unknown');

      // Assert
      expect(played).toBe(false);
    });

    it('should return true when album has plays', async () => {
      // Arrange
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex({
          albums: {
            'radiohead|kid a': { lastPlayed: 0, playCount: 1, plays: [] },
          },
        })
      );

      // Act
      const played = await storage.hasBeenPlayed('Radiohead', 'Kid A');

      // Assert
      expect(played).toBe(true);
    });

    it('should return false when play count is 0', async () => {
      // Arrange
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex({
          albums: {
            'radiohead|kid a': { lastPlayed: 0, playCount: 0, plays: [] },
          },
        })
      );

      // Act
      const played = await storage.hasBeenPlayed('Radiohead', 'Kid A');

      // Assert
      expect(played).toBe(false);
    });
  });

  describe('getDaysSinceLastPlayed', () => {
    it('should return null when album not found', async () => {
      // Arrange
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex()
      );

      // Act
      const days = await storage.getDaysSinceLastPlayed('Unknown', 'Unknown');

      // Assert
      expect(days).toBeNull();
    });

    it('should calculate days since last played', async () => {
      // Arrange
      const fiveDaysAgo = Math.floor(Date.now() / 1000) - 5 * 24 * 60 * 60;
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex({
          albums: {
            'radiohead|kid a': {
              lastPlayed: fiveDaysAgo,
              playCount: 1,
              plays: [],
            },
          },
        })
      );

      // Act
      const days = await storage.getDaysSinceLastPlayed('Radiohead', 'Kid A');

      // Assert
      expect(days).toBe(5);
    });
  });

  describe('getAllAlbums', () => {
    it('should return empty array when no index exists', async () => {
      // Act
      const albums = await storage.getAllAlbums();

      // Assert
      expect(albums).toEqual([]);
    });

    it('should return all albums with parsed artist/album', async () => {
      // Arrange
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex({
          albums: {
            'radiohead|kid a': { lastPlayed: 0, playCount: 10, plays: [] },
            'pink floyd|animals': { lastPlayed: 0, playCount: 5, plays: [] },
          },
        })
      );

      // Act
      const albums = await storage.getAllAlbums();

      // Assert
      expect(albums).toHaveLength(2);
      expect(albums[0].artist).toBe('radiohead');
      expect(albums[0].album).toBe('kid a');
    });
  });

  describe('getTopAlbumsByPlayCount', () => {
    it('should return albums sorted by play count', async () => {
      // Arrange
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex({
          albums: {
            'radiohead|kid a': { lastPlayed: 0, playCount: 10, plays: [] },
            'pink floyd|animals': { lastPlayed: 0, playCount: 50, plays: [] },
            'the beatles|abbey road': {
              lastPlayed: 0,
              playCount: 25,
              plays: [],
            },
          },
        })
      );

      // Act
      const top = await storage.getTopAlbumsByPlayCount(2);

      // Assert
      expect(top).toHaveLength(2);
      expect(top[0].playCount).toBe(50);
      expect(top[1].playCount).toBe(25);
    });
  });

  describe('getUniqueArtists', () => {
    it('should aggregate artists with play counts', async () => {
      // Arrange
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex({
          albums: {
            'radiohead|kid a': { lastPlayed: 100, playCount: 10, plays: [] },
            'radiohead|ok computer': {
              lastPlayed: 200,
              playCount: 15,
              plays: [],
            },
            'pink floyd|animals': { lastPlayed: 50, playCount: 5, plays: [] },
          },
        })
      );

      // Act
      const artists = await storage.getUniqueArtists();

      // Assert
      expect(artists.size).toBe(2);
      const radiohead = artists.get('radiohead');
      expect(radiohead?.playCount).toBe(25); // 10 + 15
      expect(radiohead?.albumCount).toBe(2);
      expect(radiohead?.lastPlayed).toBe(200); // Most recent
    });
  });

  describe('getStorageStats', () => {
    it('should return zero stats when no index exists', async () => {
      // Act
      const stats = await storage.getStorageStats();

      // Assert
      expect(stats.totalAlbums).toBe(0);
      expect(stats.totalScrobbles).toBe(0);
      expect(stats.oldestScrobble).toBeNull();
      expect(stats.lastSync).toBeNull();
    });

    it('should return accurate storage statistics', async () => {
      // Arrange
      const now = Math.floor(Date.now() / 1000);
      const oldestDate = Math.floor(new Date('2015-01-01').getTime() / 1000);
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex({
          totalScrobbles: 1000,
          oldestScrobbleDate: oldestDate,
          lastSyncTimestamp: Date.now(),
          albums: {
            'radiohead|kid a': { lastPlayed: now, playCount: 10, plays: [] },
            'pink floyd|animals': {
              lastPlayed: now - 100,
              playCount: 5,
              plays: [],
            },
          },
        })
      );

      // Act
      const stats = await storage.getStorageStats();

      // Assert
      expect(stats.totalAlbums).toBe(2);
      expect(stats.totalScrobbles).toBe(1000);
      expect(stats.oldestScrobble).toBeInstanceOf(Date);
      expect(stats.newestScrobble).toBeInstanceOf(Date);
      expect(stats.lastSync).toBeInstanceOf(Date);
      expect(stats.estimatedSizeBytes).toBeGreaterThan(0);
    });
  });
});
