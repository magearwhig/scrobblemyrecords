import express from 'express';
import request from 'supertest';

import createStatsRouter from '../../src/backend/routes/stats';
import { artistMappingService } from '../../src/backend/services/artistMappingService';
import { AuthService } from '../../src/backend/services/authService';
import { MappingService } from '../../src/backend/services/mappingService';
import { ScrobbleHistoryStorage } from '../../src/backend/services/scrobbleHistoryStorage';
import { StatsService } from '../../src/backend/services/statsService';
import { FileStorage } from '../../src/backend/utils/fileStorage';
import {
  AlbumIdentifier,
  AlbumMapping,
  AlbumHistoryEntry,
} from '../../src/shared/types';

// Mock the artistMappingService singleton
jest.mock('../../src/backend/services/artistMappingService', () => ({
  artistMappingService: {
    getLastfmName: jest.fn((name: string) => name),
    loadMappings: jest.fn(),
  },
}));

// Mock logger to avoid file system side effects
jest.mock('../../src/backend/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockedArtistMappingService = artistMappingService as jest.Mocked<
  typeof artistMappingService
>;

interface FuzzyResult {
  entry: AlbumHistoryEntry | null;
  matchType: 'exact' | 'fuzzy' | 'none';
  matchedKeys?: string[];
}

function createTestApp(
  historyStorage?: Partial<ScrobbleHistoryStorage>,
  mappingService?: Partial<MappingService>
): express.Application {
  const app = express();
  app.use(express.json());

  const mockFileStorage = {} as FileStorage;
  const mockAuthService = {} as AuthService;
  const mockStatsService = {} as StatsService;

  const router = createStatsRouter(
    mockFileStorage,
    mockAuthService,
    mockStatsService,
    historyStorage as ScrobbleHistoryStorage | undefined,
    undefined, // wishlistService
    undefined, // sellerMonitoringService
    undefined, // analyticsService
    undefined, // rankingsService
    mappingService as MappingService | undefined
  );

  app.use('/api/v1/stats', router);
  return app;
}

function makeNoneResult(): FuzzyResult {
  return { entry: null, matchType: 'none' };
}

function makeExactResult(playCount: number, lastPlayed: number): FuzzyResult {
  return {
    entry: { playCount, lastPlayed, plays: [] },
    matchType: 'exact',
    matchedKeys: ['key'],
  };
}

function makeFuzzyResult(playCount: number, lastPlayed: number): FuzzyResult {
  return {
    entry: { playCount, lastPlayed, plays: [] },
    matchType: 'fuzzy',
    matchedKeys: ['key'],
  };
}

describe('POST /api/v1/stats/album-play-counts', () => {
  let mockHistoryStorage: { getAlbumHistoryFuzzy: jest.Mock };
  let mockMappingService: {
    getAllAlbumMappingsForCollection: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockHistoryStorage = {
      getAlbumHistoryFuzzy: jest.fn().mockResolvedValue(makeNoneResult()),
    };

    mockMappingService = {
      getAllAlbumMappingsForCollection: jest.fn().mockResolvedValue([]),
    };

    // Default: no artist name remapping
    mockedArtistMappingService.getLastfmName.mockImplementation(
      (name: string) => name
    );
  });

  // ==========================================
  // Validation tests
  // ==========================================
  describe('Validation', () => {
    it('should return 400 when albums field is missing', async () => {
      const app = createTestApp(mockHistoryStorage, mockMappingService);

      const response = await request(app)
        .post('/api/v1/stats/album-play-counts')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe(
        'Request body must contain an albums array'
      );
    });

    it('should return 400 when albums is not an array', async () => {
      const app = createTestApp(mockHistoryStorage, mockMappingService);

      const response = await request(app)
        .post('/api/v1/stats/album-play-counts')
        .send({ albums: 'not-an-array' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe(
        'Request body must contain an albums array'
      );
    });

    it('should return 400 when album is missing artist', async () => {
      const app = createTestApp(mockHistoryStorage, mockMappingService);

      const response = await request(app)
        .post('/api/v1/stats/album-play-counts')
        .send({ albums: [{ title: 'Some Album' }] })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe(
        'Each album must have artist and title strings'
      );
    });

    it('should return 400 when album is missing title', async () => {
      const app = createTestApp(mockHistoryStorage, mockMappingService);

      const response = await request(app)
        .post('/api/v1/stats/album-play-counts')
        .send({ albums: [{ artist: 'Some Artist' }] })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe(
        'Each album must have artist and title strings'
      );
    });

    it('should return 400 when artist is not a string', async () => {
      const app = createTestApp(mockHistoryStorage, mockMappingService);

      const response = await request(app)
        .post('/api/v1/stats/album-play-counts')
        .send({ albums: [{ artist: 123, title: 'Album' }] })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe(
        'Each album must have artist and title strings'
      );
    });

    it('should return 400 when title is not a string', async () => {
      const app = createTestApp(mockHistoryStorage, mockMappingService);

      const response = await request(app)
        .post('/api/v1/stats/album-play-counts')
        .send({ albums: [{ artist: 'Artist', title: null }] })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe(
        'Each album must have artist and title strings'
      );
    });

    it('should return 400 when request body has no albums key', async () => {
      const app = createTestApp(mockHistoryStorage, mockMappingService);

      const response = await request(app)
        .post('/api/v1/stats/album-play-counts')
        .send({ unrelated: 'data' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe(
        'Request body must contain an albums array'
      );
    });

    it('should return 503 when history storage is not available', async () => {
      const app = createTestApp(undefined, mockMappingService);

      const response = await request(app)
        .post('/api/v1/stats/album-play-counts')
        .send({ albums: [{ artist: 'Artist', title: 'Album' }] })
        .expect(503);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Scrobble history not available');
    });
  });

  // ==========================================
  // Success cases
  // ==========================================
  describe('Success cases', () => {
    it('should return empty results for an empty albums array', async () => {
      const app = createTestApp(mockHistoryStorage, mockMappingService);

      const response = await request(app)
        .post('/api/v1/stats/album-play-counts')
        .send({ albums: [] })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.results).toEqual([]);
    });

    it('should return play count for a single album with exact match', async () => {
      mockHistoryStorage.getAlbumHistoryFuzzy.mockResolvedValue(
        makeExactResult(15, 1700000000)
      );
      const app = createTestApp(mockHistoryStorage, mockMappingService);

      const response = await request(app)
        .post('/api/v1/stats/album-play-counts')
        .send({
          albums: [{ artist: 'Radiohead', title: 'OK Computer' }],
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      const results = response.body.data.results;
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        artist: 'Radiohead',
        title: 'OK Computer',
        playCount: 15,
        lastPlayed: 1700000000,
        matchType: 'exact',
      });
    });

    it('should return results for multiple albums', async () => {
      mockHistoryStorage.getAlbumHistoryFuzzy
        .mockResolvedValueOnce(makeExactResult(10, 1700000000))
        .mockResolvedValueOnce(makeFuzzyResult(5, 1699000000))
        .mockResolvedValueOnce(makeNoneResult());

      const app = createTestApp(mockHistoryStorage, mockMappingService);

      const albums: AlbumIdentifier[] = [
        { artist: 'Radiohead', title: 'OK Computer' },
        { artist: 'Pink Floyd', title: 'The Wall' },
        { artist: 'Unknown Artist', title: 'Unknown Album' },
      ];

      const response = await request(app)
        .post('/api/v1/stats/album-play-counts')
        .send({ albums })
        .expect(200);

      expect(response.body.success).toBe(true);
      const results = response.body.data.results;
      expect(results).toHaveLength(3);

      expect(results[0].playCount).toBe(10);
      expect(results[0].matchType).toBe('exact');

      expect(results[1].playCount).toBe(5);
      expect(results[1].matchType).toBe('fuzzy');

      expect(results[2].playCount).toBe(0);
      expect(results[2].matchType).toBe('none');
    });

    it('should return zero play count with matchType none for unplayed album', async () => {
      mockHistoryStorage.getAlbumHistoryFuzzy.mockResolvedValue(
        makeNoneResult()
      );
      const app = createTestApp(mockHistoryStorage, mockMappingService);

      const response = await request(app)
        .post('/api/v1/stats/album-play-counts')
        .send({
          albums: [{ artist: 'New Band', title: 'Debut Album' }],
        })
        .expect(200);

      const result = response.body.data.results[0];
      expect(result.playCount).toBe(0);
      expect(result.lastPlayed).toBeNull();
      expect(result.matchType).toBe('none');
    });
  });

  // ==========================================
  // Matching logic
  // ==========================================
  describe('Matching logic', () => {
    it('should use album mappings when available', async () => {
      const mappings: AlbumMapping[] = [
        {
          historyArtist: 'Various Artists',
          historyAlbum: 'Compilation Vol 1',
          collectionId: 123,
          collectionArtist: 'VA',
          collectionAlbum: 'Compilation Vol 1',
          createdAt: Date.now(),
        },
      ];
      mockMappingService.getAllAlbumMappingsForCollection.mockResolvedValue(
        mappings
      );

      // The mapped lookup finds a match
      mockHistoryStorage.getAlbumHistoryFuzzy.mockResolvedValue(
        makeExactResult(8, 1700000000)
      );

      const app = createTestApp(mockHistoryStorage, mockMappingService);

      const response = await request(app)
        .post('/api/v1/stats/album-play-counts')
        .send({
          albums: [{ artist: 'VA', title: 'Compilation Vol 1' }],
        })
        .expect(200);

      expect(
        mockMappingService.getAllAlbumMappingsForCollection
      ).toHaveBeenCalledWith('VA', 'Compilation Vol 1');
      expect(mockHistoryStorage.getAlbumHistoryFuzzy).toHaveBeenCalledWith(
        'Various Artists',
        'Compilation Vol 1',
        { countsOnly: true }
      );

      const result = response.body.data.results[0];
      expect(result.playCount).toBe(8);
      expect(result.matchType).toBe('exact');
    });

    it('should fall back to artist name mapping when mapping lookup returns none', async () => {
      const mappings: AlbumMapping[] = [
        {
          historyArtist: 'Discogs Name',
          historyAlbum: 'Album Name',
          collectionId: 1,
          collectionArtist: 'Discogs Name',
          collectionAlbum: 'Album Name',
          createdAt: Date.now(),
        },
      ];
      mockMappingService.getAllAlbumMappingsForCollection.mockResolvedValue(
        mappings
      );

      // First call via mapping: no match
      // Second call with artist remap: exact match
      mockHistoryStorage.getAlbumHistoryFuzzy
        .mockResolvedValueOnce(makeNoneResult())
        .mockResolvedValueOnce(makeExactResult(3, 1695000000));

      mockedArtistMappingService.getLastfmName.mockImplementation(
        (name: string) => {
          if (name === 'Discogs Name') return 'Lastfm Name';
          return name;
        }
      );

      const app = createTestApp(mockHistoryStorage, mockMappingService);

      const response = await request(app)
        .post('/api/v1/stats/album-play-counts')
        .send({
          albums: [{ artist: 'Discogs Name', title: 'Album Name' }],
        })
        .expect(200);

      // Should have called getAlbumHistoryFuzzy twice: once with original, once with mapped name
      expect(mockHistoryStorage.getAlbumHistoryFuzzy).toHaveBeenCalledWith(
        'Discogs Name',
        'Album Name',
        { countsOnly: true }
      );
      expect(mockHistoryStorage.getAlbumHistoryFuzzy).toHaveBeenCalledWith(
        'Lastfm Name',
        'Album Name',
        { countsOnly: true }
      );

      const result = response.body.data.results[0];
      expect(result.playCount).toBe(3);
      expect(result.matchType).toBe('exact');
    });

    it('should fall back to direct fuzzy match when no mappings exist', async () => {
      mockMappingService.getAllAlbumMappingsForCollection.mockResolvedValue([]);
      mockHistoryStorage.getAlbumHistoryFuzzy.mockResolvedValue(
        makeFuzzyResult(7, 1698000000)
      );

      const app = createTestApp(mockHistoryStorage, mockMappingService);

      const response = await request(app)
        .post('/api/v1/stats/album-play-counts')
        .send({
          albums: [{ artist: 'Dr. Dog', title: 'Shame Shame' }],
        })
        .expect(200);

      const result = response.body.data.results[0];
      expect(result.playCount).toBe(7);
      expect(result.matchType).toBe('fuzzy');
    });

    it('should try artist name mapping as last resort for direct lookup', async () => {
      mockMappingService.getAllAlbumMappingsForCollection.mockResolvedValue([]);

      // Direct lookup fails, then artist mapping lookup succeeds
      mockHistoryStorage.getAlbumHistoryFuzzy
        .mockResolvedValueOnce(makeNoneResult())
        .mockResolvedValueOnce(makeExactResult(2, 1690000000));

      mockedArtistMappingService.getLastfmName.mockImplementation(
        (name: string) => {
          if (name === 'Discogs Artist') return 'Lastfm Artist';
          return name;
        }
      );

      const app = createTestApp(mockHistoryStorage, mockMappingService);

      const response = await request(app)
        .post('/api/v1/stats/album-play-counts')
        .send({
          albums: [{ artist: 'Discogs Artist', title: 'Some Album' }],
        })
        .expect(200);

      expect(mockHistoryStorage.getAlbumHistoryFuzzy).toHaveBeenCalledTimes(2);
      expect(mockHistoryStorage.getAlbumHistoryFuzzy).toHaveBeenCalledWith(
        'Lastfm Artist',
        'Some Album',
        { countsOnly: true }
      );

      const result = response.body.data.results[0];
      expect(result.playCount).toBe(2);
      expect(result.matchType).toBe('exact');
    });

    it('should aggregate play counts from multiple album mappings', async () => {
      const mappings: AlbumMapping[] = [
        {
          historyArtist: 'Artist A',
          historyAlbum: 'Album Disc 1',
          collectionId: 1,
          collectionArtist: 'Artist A',
          collectionAlbum: 'Album',
          createdAt: Date.now(),
        },
        {
          historyArtist: 'Artist A',
          historyAlbum: 'Album Disc 2',
          collectionId: 1,
          collectionArtist: 'Artist A',
          collectionAlbum: 'Album',
          createdAt: Date.now(),
        },
      ];
      mockMappingService.getAllAlbumMappingsForCollection.mockResolvedValue(
        mappings
      );

      mockHistoryStorage.getAlbumHistoryFuzzy
        .mockResolvedValueOnce(makeExactResult(10, 1700000000))
        .mockResolvedValueOnce(makeFuzzyResult(5, 1701000000));

      const app = createTestApp(mockHistoryStorage, mockMappingService);

      const response = await request(app)
        .post('/api/v1/stats/album-play-counts')
        .send({
          albums: [{ artist: 'Artist A', title: 'Album' }],
        })
        .expect(200);

      const result = response.body.data.results[0];
      expect(result.playCount).toBe(15); // 10 + 5
      expect(result.lastPlayed).toBe(1701000000); // later timestamp
      expect(result.matchType).toBe('exact'); // exact takes priority over fuzzy
    });

    it('should work without a mapping service', async () => {
      mockHistoryStorage.getAlbumHistoryFuzzy.mockResolvedValue(
        makeExactResult(12, 1700000000)
      );

      // Create app without mapping service
      const app = createTestApp(mockHistoryStorage, undefined);

      const response = await request(app)
        .post('/api/v1/stats/album-play-counts')
        .send({
          albums: [{ artist: 'Radiohead', title: 'Kid A' }],
        })
        .expect(200);

      const result = response.body.data.results[0];
      expect(result.playCount).toBe(12);
      expect(result.matchType).toBe('exact');
    });
  });

  // ==========================================
  // Edge cases
  // ==========================================
  describe('Edge cases', () => {
    it('should handle large batches with chunking (>50 items)', async () => {
      mockHistoryStorage.getAlbumHistoryFuzzy.mockResolvedValue(
        makeExactResult(1, 1700000000)
      );

      const albums: AlbumIdentifier[] = Array.from({ length: 75 }, (_, i) => ({
        artist: `Artist ${i}`,
        title: `Album ${i}`,
      }));

      const app = createTestApp(mockHistoryStorage, mockMappingService);

      const response = await request(app)
        .post('/api/v1/stats/album-play-counts')
        .send({ albums })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.results).toHaveLength(75);

      // Verify all albums were processed (75 calls total)
      expect(mockHistoryStorage.getAlbumHistoryFuzzy).toHaveBeenCalledTimes(75);
    });

    it('should handle special characters in artist and title names', async () => {
      mockHistoryStorage.getAlbumHistoryFuzzy.mockResolvedValue(
        makeExactResult(3, 1700000000)
      );

      const app = createTestApp(mockHistoryStorage, mockMappingService);

      const albums: AlbumIdentifier[] = [
        { artist: "Guns N' Roses", title: 'Appetite for Destruction' },
        { artist: 'AC/DC', title: 'Back in Black' },
        { artist: 'Beyonce\u0301', title: 'Lemonade' },
        { artist: 'Sigur Ro\u0301s', title: '( )' },
      ];

      const response = await request(app)
        .post('/api/v1/stats/album-play-counts')
        .send({ albums })
        .expect(200);

      expect(response.body.data.results).toHaveLength(4);
      expect(response.body.data.results[0].artist).toBe("Guns N' Roses");
      expect(response.body.data.results[1].artist).toBe('AC/DC');
      expect(response.body.data.results[3].title).toBe('( )');
    });

    it('should preserve original artist/title in results regardless of matching', async () => {
      mockMappingService.getAllAlbumMappingsForCollection.mockResolvedValue([]);
      mockHistoryStorage.getAlbumHistoryFuzzy.mockResolvedValue(
        makeFuzzyResult(5, 1700000000)
      );

      const app = createTestApp(mockHistoryStorage, mockMappingService);

      const response = await request(app)
        .post('/api/v1/stats/album-play-counts')
        .send({
          albums: [
            { artist: 'My Original Artist', title: 'My Original Title' },
          ],
        })
        .expect(200);

      const result = response.body.data.results[0];
      expect(result.artist).toBe('My Original Artist');
      expect(result.title).toBe('My Original Title');
    });

    it('should handle exactly 50 items (boundary of chunk size)', async () => {
      mockHistoryStorage.getAlbumHistoryFuzzy.mockResolvedValue(
        makeExactResult(1, 1700000000)
      );

      const albums: AlbumIdentifier[] = Array.from({ length: 50 }, (_, i) => ({
        artist: `Artist ${i}`,
        title: `Album ${i}`,
      }));

      const app = createTestApp(mockHistoryStorage, mockMappingService);

      const response = await request(app)
        .post('/api/v1/stats/album-play-counts')
        .send({ albums })
        .expect(200);

      expect(response.body.data.results).toHaveLength(50);
    });

    it('should handle exactly 51 items (just over chunk boundary)', async () => {
      mockHistoryStorage.getAlbumHistoryFuzzy.mockResolvedValue(
        makeExactResult(1, 1700000000)
      );

      const albums: AlbumIdentifier[] = Array.from({ length: 51 }, (_, i) => ({
        artist: `Artist ${i}`,
        title: `Album ${i}`,
      }));

      const app = createTestApp(mockHistoryStorage, mockMappingService);

      const response = await request(app)
        .post('/api/v1/stats/album-play-counts')
        .send({ albums })
        .expect(200);

      expect(response.body.data.results).toHaveLength(51);
    });
  });
});
