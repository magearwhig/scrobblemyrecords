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
        {
          artist: 'Dr. Dog',
          album: 'Shame Shame (Deluxe Edition)',
          expected: 'drdog|shameshame',
        },
        {
          artist: 'The Beatles',
          album: 'Abbey Road (Special Edition)',
          expected: 'thebeatles|abbeyroad',
        },
        {
          artist: 'Radiohead',
          album: 'OK Computer (Remastered 2017)',
          expected: 'radiohead|okcomputer',
        },
        {
          artist: 'Pink Floyd',
          album: 'Dark Side of the Moon (50th Anniversary)',
          expected: 'pinkfloyd|darksideofthemoon',
        },
        {
          artist: 'Artist',
          album: 'Album [Bonus Tracks]',
          expected: 'artist|album',
        },
        {
          artist: 'Artist',
          album: 'Album (Limited Edition)',
          expected: 'artist|album',
        },
        {
          artist: 'Artist',
          album: 'Album (Expanded Edition)',
          expected: 'artist|album',
        },
        {
          artist: 'Artist',
          album: 'Album - EP',
          expected: 'artist|album',
        },
        {
          artist: 'Artist',
          album: 'Album EP',
          expected: 'artist|album',
        },
        {
          artist: 'Artist',
          album: 'Album Deluxe Edition',
          expected: 'artist|album',
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

  describe('getAlbumHistoryFuzzy', () => {
    it('should return exact match when available', async () => {
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
      const result = await storage.getAlbumHistoryFuzzy('Radiohead', 'Kid A');

      // Assert
      expect(result.matchType).toBe('exact');
      expect(result.entry?.playCount).toBe(15);
      expect(result.matchedKeys).toEqual(['radiohead|kid a']);
    });

    it('should match album with deluxe edition suffix', async () => {
      // Arrange - simulates "Shame Shame (Deluxe Edition)" matching "Shame Shame"
      const albumEntry = {
        lastPlayed: Math.floor(Date.now() / 1000),
        playCount: 81,
        plays: [{ timestamp: Math.floor(Date.now() / 1000) }],
      };
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex({
          albums: {
            'dr. dog|shame shame (deluxe edition)': albumEntry,
          },
        })
      );

      // Act
      const result = await storage.getAlbumHistoryFuzzy(
        'Dr. Dog',
        'Shame Shame'
      );

      // Assert
      expect(result.matchType).toBe('fuzzy');
      expect(result.entry?.playCount).toBe(81);
      expect(result.matchedKeys).toContain(
        'dr. dog|shame shame (deluxe edition)'
      );
    });

    it('should match album with special edition suffix', async () => {
      // Arrange
      const albumEntry = {
        lastPlayed: Math.floor(Date.now() / 1000),
        playCount: 50,
        plays: [],
      };
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex({
          albums: {
            'the beatles|abbey road (special edition)': albumEntry,
          },
        })
      );

      // Act
      const result = await storage.getAlbumHistoryFuzzy(
        'The Beatles',
        'Abbey Road'
      );

      // Assert
      expect(result.matchType).toBe('fuzzy');
      expect(result.entry?.playCount).toBe(50);
    });

    it('should match album with remastered year suffix', async () => {
      // Arrange
      const albumEntry = {
        lastPlayed: Math.floor(Date.now() / 1000),
        playCount: 30,
        plays: [],
      };
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex({
          albums: {
            'radiohead|ok computer (remastered 2017)': albumEntry,
          },
        })
      );

      // Act
      const result = await storage.getAlbumHistoryFuzzy(
        'Radiohead',
        'OK Computer'
      );

      // Assert
      expect(result.matchType).toBe('fuzzy');
      expect(result.entry?.playCount).toBe(30);
    });

    it('should match artist with Discogs disambiguation number', async () => {
      // Arrange
      const albumEntry = {
        lastPlayed: Math.floor(Date.now() / 1000),
        playCount: 25,
        plays: [],
      };
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex({
          albums: {
            'radiohead (2)|kid a': albumEntry,
          },
        })
      );

      // Act
      const result = await storage.getAlbumHistoryFuzzy('Radiohead', 'Kid A');

      // Assert
      expect(result.matchType).toBe('fuzzy');
      expect(result.entry?.playCount).toBe(25);
    });

    it('should aggregate multiple fuzzy matches', async () => {
      // Arrange - when both regular and deluxe versions exist
      const regularEntry = {
        lastPlayed: Math.floor(Date.now() / 1000) - 86400, // 1 day ago
        playCount: 20,
        plays: [{ timestamp: Math.floor(Date.now() / 1000) - 86400 }],
      };
      const deluxeEntry = {
        lastPlayed: Math.floor(Date.now() / 1000), // now
        playCount: 30,
        plays: [{ timestamp: Math.floor(Date.now() / 1000) }],
      };
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex({
          albums: {
            'artist|album': regularEntry,
            'artist|album (deluxe edition)': deluxeEntry,
          },
        })
      );

      // Act
      const result = await storage.getAlbumHistoryFuzzy(
        'Artist',
        'Album (Special Edition)'
      );

      // Assert
      expect(result.matchType).toBe('fuzzy');
      expect(result.entry?.playCount).toBe(50); // 20 + 30 aggregated
      expect(result.matchedKeys).toHaveLength(2);
    });

    it('should return none when no match found', async () => {
      // Arrange
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex({
          albums: {
            'radiohead|kid a': { lastPlayed: 0, playCount: 10, plays: [] },
          },
        })
      );

      // Act
      const result = await storage.getAlbumHistoryFuzzy(
        'Completely Different',
        'Album'
      );

      // Assert
      expect(result.matchType).toBe('none');
      expect(result.entry).toBeNull();
    });

    it('should match EP suffix', async () => {
      // Arrange
      const albumEntry = {
        lastPlayed: Math.floor(Date.now() / 1000),
        playCount: 10,
        plays: [],
      };
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex({
          albums: {
            'artist|album - ep': albumEntry,
          },
        })
      );

      // Act
      const result = await storage.getAlbumHistoryFuzzy('Artist', 'Album');

      // Assert
      expect(result.matchType).toBe('fuzzy');
      expect(result.entry?.playCount).toBe(10);
    });

    it('should match explicit tag in brackets', async () => {
      // Arrange
      const albumEntry = {
        lastPlayed: Math.floor(Date.now() / 1000),
        playCount: 40,
        plays: [],
      };
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex({
          albums: {
            'artist|album [explicit]': albumEntry,
          },
        })
      );

      // Act
      const result = await storage.getAlbumHistoryFuzzy('Artist', 'Album');

      // Assert
      expect(result.matchType).toBe('fuzzy');
      expect(result.entry?.playCount).toBe(40);
    });

    it('should match anniversary edition', async () => {
      // Arrange
      const albumEntry = {
        lastPlayed: Math.floor(Date.now() / 1000),
        playCount: 60,
        plays: [],
      };
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex({
          albums: {
            'pink floyd|dark side of the moon (50th anniversary)': albumEntry,
          },
        })
      );

      // Act
      const result = await storage.getAlbumHistoryFuzzy(
        'Pink Floyd',
        'Dark Side of the Moon'
      );

      // Assert
      expect(result.matchType).toBe('fuzzy');
      expect(result.entry?.playCount).toBe(60);
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

  describe('getAlbumsPaginated', () => {
    it('should return empty result when no index exists', async () => {
      // Act
      const result = await storage.getAlbumsPaginated();

      // Assert
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
      expect(result.page).toBe(1);
    });

    it('should return paginated results with default sorting (playCount desc)', async () => {
      // Arrange
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex({
          albums: {
            'radiohead|kid a': { lastPlayed: 100, playCount: 10, plays: [] },
            'pink floyd|animals': { lastPlayed: 200, playCount: 50, plays: [] },
            'the beatles|abbey road': {
              lastPlayed: 150,
              playCount: 25,
              plays: [],
            },
          },
        })
      );

      // Act
      const result = await storage.getAlbumsPaginated(1, 2);

      // Assert
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(3);
      expect(result.totalPages).toBe(2);
      expect(result.items[0].playCount).toBe(50); // Pink Floyd first (highest)
      expect(result.items[1].playCount).toBe(25); // Beatles second
    });

    it('should support pagination', async () => {
      // Arrange
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex({
          albums: {
            'radiohead|kid a': { lastPlayed: 100, playCount: 10, plays: [] },
            'pink floyd|animals': { lastPlayed: 200, playCount: 50, plays: [] },
            'the beatles|abbey road': {
              lastPlayed: 150,
              playCount: 25,
              plays: [],
            },
          },
        })
      );

      // Act - get second page
      const result = await storage.getAlbumsPaginated(2, 2);

      // Assert
      expect(result.items).toHaveLength(1);
      expect(result.page).toBe(2);
      expect(result.items[0].playCount).toBe(10); // Radiohead on page 2
    });

    it('should sort by lastPlayed', async () => {
      // Arrange
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex({
          albums: {
            'radiohead|kid a': { lastPlayed: 100, playCount: 10, plays: [] },
            'pink floyd|animals': { lastPlayed: 300, playCount: 50, plays: [] },
            'the beatles|abbey road': {
              lastPlayed: 200,
              playCount: 25,
              plays: [],
            },
          },
        })
      );

      // Act
      const result = await storage.getAlbumsPaginated(
        1,
        10,
        'lastPlayed',
        'desc'
      );

      // Assert
      expect(result.items[0].artist).toBe('pink floyd'); // Most recent
      expect(result.items[1].artist).toBe('the beatles');
      expect(result.items[2].artist).toBe('radiohead'); // Oldest
    });

    it('should sort by artist alphabetically', async () => {
      // Arrange
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex({
          albums: {
            'radiohead|kid a': { lastPlayed: 100, playCount: 10, plays: [] },
            'pink floyd|animals': { lastPlayed: 200, playCount: 50, plays: [] },
            'the beatles|abbey road': {
              lastPlayed: 150,
              playCount: 25,
              plays: [],
            },
          },
        })
      );

      // Act
      const result = await storage.getAlbumsPaginated(1, 10, 'artist', 'asc');

      // Assert
      expect(result.items[0].artist).toBe('pink floyd');
      expect(result.items[1].artist).toBe('radiohead');
      expect(result.items[2].artist).toBe('the beatles');
    });

    it('should sort by album alphabetically', async () => {
      // Arrange
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex({
          albums: {
            'radiohead|kid a': { lastPlayed: 100, playCount: 10, plays: [] },
            'pink floyd|animals': { lastPlayed: 200, playCount: 50, plays: [] },
            'the beatles|abbey road': {
              lastPlayed: 150,
              playCount: 25,
              plays: [],
            },
          },
        })
      );

      // Act
      const result = await storage.getAlbumsPaginated(1, 10, 'album', 'asc');

      // Assert
      expect(result.items[0].album).toBe('abbey road');
      expect(result.items[1].album).toBe('animals');
      expect(result.items[2].album).toBe('kid a');
    });

    it('should support ascending sort order', async () => {
      // Arrange
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex({
          albums: {
            'radiohead|kid a': { lastPlayed: 100, playCount: 10, plays: [] },
            'pink floyd|animals': { lastPlayed: 200, playCount: 50, plays: [] },
          },
        })
      );

      // Act
      const result = await storage.getAlbumsPaginated(
        1,
        10,
        'playCount',
        'asc'
      );

      // Assert
      expect(result.items[0].playCount).toBe(10); // Lowest first
      expect(result.items[1].playCount).toBe(50);
    });

    it('should filter by search query', async () => {
      // Arrange
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex({
          albums: {
            'radiohead|kid a': { lastPlayed: 100, playCount: 10, plays: [] },
            'pink floyd|animals': { lastPlayed: 200, playCount: 50, plays: [] },
            'the beatles|abbey road': {
              lastPlayed: 150,
              playCount: 25,
              plays: [],
            },
          },
        })
      );

      // Act - search for "pink"
      const result = await storage.getAlbumsPaginated(
        1,
        10,
        'playCount',
        'desc',
        'pink'
      );

      // Assert
      expect(result.items).toHaveLength(1);
      expect(result.items[0].artist).toBe('pink floyd');
      expect(result.total).toBe(1);
    });

    it('should filter by album name in search query', async () => {
      // Arrange
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex({
          albums: {
            'radiohead|kid a': { lastPlayed: 100, playCount: 10, plays: [] },
            'pink floyd|animals': { lastPlayed: 200, playCount: 50, plays: [] },
            'the beatles|abbey road': {
              lastPlayed: 150,
              playCount: 25,
              plays: [],
            },
          },
        })
      );

      // Act - search for "road"
      const result = await storage.getAlbumsPaginated(
        1,
        10,
        'playCount',
        'desc',
        'road'
      );

      // Assert
      expect(result.items).toHaveLength(1);
      expect(result.items[0].album).toBe('abbey road');
    });

    it('should handle case-insensitive search', async () => {
      // Arrange
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        createMockIndex({
          albums: {
            'radiohead|kid a': { lastPlayed: 100, playCount: 10, plays: [] },
          },
        })
      );

      // Act
      const result = await storage.getAlbumsPaginated(
        1,
        10,
        'playCount',
        'desc',
        'RADIOHEAD'
      );

      // Assert
      expect(result.items).toHaveLength(1);
      expect(result.items[0].artist).toBe('radiohead');
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
