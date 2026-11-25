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
  ScrobbleHistoryIndex,
} from '../../src/shared/types';

// Mock the artistMappingService singleton
jest.mock('../../src/backend/services/artistMappingService', () => ({
  artistMappingService: {
    getLastfmName: jest.fn((name: string) => name),
    getAllMappings: jest.fn(() => []),
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

/** A history entry with `count` plays, the last at `lastPlayed` */
const played = (count: number, lastPlayed = 1700000000) => ({
  lastPlayed,
  playCount: count,
  plays: Array.from({ length: count }, (_, i) => ({
    timestamp: lastPlayed - i,
    track: `Track ${i}`,
  })),
});

const indexOf = (albums: ScrobbleHistoryIndex['albums']) =>
  ({
    albums,
    totalScrobbles: Object.values(albums).reduce((n, a) => n + a.playCount, 0),
    lastSyncTimestamp: 1700000000,
    oldestScrobbleDate: 0,
  }) as ScrobbleHistoryIndex;

/** Like the real key: case, Discogs "(N)" suffixes and edition words don't count */
const fuzzyNormalizeKey = (artist: string, album: string) => {
  const norm = (s: string) =>
    s
      .replace(/\s*\(\d+\)\s*$/g, '')
      .replace(/\s*\((deluxe|deluxe edition|remastered)\)\s*$/gi, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  return `${norm(artist)}|${norm(album)}`;
};

function createTestApp(
  historyStorage?: Partial<ScrobbleHistoryStorage>,
  mappingService?: Partial<MappingService>
): express.Application {
  const app = express();
  app.use(express.json());

  const mockFileStorage = {} as FileStorage;
  const mockAuthService = {} as AuthService;
  // Play counts come from the shared play identity service
  const statsService = new StatsService(
    mockFileStorage,
    (historyStorage ?? {}) as ScrobbleHistoryStorage
  );
  if (mappingService) {
    statsService.setMappingService(mappingService as MappingService);
  }

  const router = createStatsRouter(
    mockFileStorage,
    mockAuthService,
    statsService,
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

const historyOf = (albums: ScrobbleHistoryIndex['albums']) => ({
  getIndex: jest.fn().mockResolvedValue(indexOf(albums)),
  fuzzyNormalizeKey,
});

const post = (app: express.Application, albums: AlbumIdentifier[]) =>
  request(app)
    .post('/api/v1/stats/album-play-counts')
    .send({ albums })
    .expect(200);

describe('POST /api/v1/stats/album-play-counts', () => {
  let mockHistoryStorage: ReturnType<typeof historyOf>;
  let mockMappingService: {
    getAllAlbumMappings: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockHistoryStorage = historyOf({});

    mockMappingService = {
      getAllAlbumMappings: jest.fn().mockResolvedValue([]),
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

      const response = await post(app, []);

      expect(response.body.success).toBe(true);
      expect(response.body.data.results).toEqual([]);
    });

    it('should return play count for a single album with exact match', async () => {
      const app = createTestApp(
        historyOf({ 'radiohead|ok computer': played(42, 1700000000) }),
        mockMappingService
      );

      const response = await post(app, [
        { artist: 'Radiohead', title: 'OK Computer' },
      ]);

      expect(response.body.data.results).toEqual([
        {
          artist: 'Radiohead',
          title: 'OK Computer',
          playCount: 42,
          lastPlayed: 1700000000,
          matchType: 'exact',
        },
      ]);
    });

    it('should return results for multiple albums', async () => {
      const app = createTestApp(
        historyOf({
          'radiohead|ok computer': played(10),
          'bjork|homogenic': played(5),
        }),
        mockMappingService
      );

      const response = await post(app, [
        { artist: 'Radiohead', title: 'OK Computer' },
        { artist: 'Bjork', title: 'Homogenic' },
        { artist: 'Nobody', title: 'Nothing' },
      ]);

      expect(
        response.body.data.results.map(
          (r: { playCount: number }) => r.playCount
        )
      ).toEqual([10, 5, 0]);
    });

    it('should return zero play count with matchType none for unplayed album', async () => {
      const app = createTestApp(mockHistoryStorage, mockMappingService);

      const response = await post(app, [
        { artist: 'Unknown', title: 'Unplayed' },
      ]);

      expect(response.body.data.results[0]).toEqual({
        artist: 'Unknown',
        title: 'Unplayed',
        playCount: 0,
        lastPlayed: null,
        matchType: 'none',
      });
    });
  });

  // ==========================================
  // Matching logic
  // ==========================================
  describe('Matching logic', () => {
    const mapping = (
      historyArtist: string,
      historyAlbum: string,
      collectionArtist: string,
      collectionAlbum: string
    ): AlbumMapping => ({
      historyArtist,
      historyAlbum,
      collectionArtist,
      collectionAlbum,
      collectionId: 1,
      createdAt: 1,
    });

    it('should use album mappings when available', async () => {
      mockMappingService.getAllAlbumMappings.mockResolvedValue([
        mapping('lice', 'lice', 'Aesop Rock, Homeboy Sandman', 'Lice'),
      ]);
      const app = createTestApp(
        historyOf({ 'lice|lice': played(7) }),
        mockMappingService
      );

      const response = await post(app, [
        { artist: 'Aesop Rock, Homeboy Sandman', title: 'Lice' },
      ]);

      expect(response.body.data.results[0]).toMatchObject({
        playCount: 7,
        matchType: 'exact',
      });
    });

    it('should fall back to artist name mapping (Discogs to Last.fm)', async () => {
      mockedArtistMappingService.getLastfmName.mockImplementation(
        (name: string) =>
          name === 'Aesop Rock, Blockhead' ? 'aesop rock' : name
      );
      const app = createTestApp(
        historyOf({ 'aesop rock|garbology': played(9) }),
        mockMappingService
      );

      const response = await post(app, [
        { artist: 'Aesop Rock, Blockhead', title: 'Garbology' },
      ]);

      expect(response.body.data.results[0].playCount).toBe(9);
    });

    it('should fall back to a spelling-tolerant match when the name was never played', async () => {
      const app = createTestApp(
        historyOf({ 'artist|album (deluxe edition)': played(4) }),
        mockMappingService
      );

      const response = await post(app, [{ artist: 'Artist', title: 'Album' }]);

      expect(response.body.data.results[0]).toMatchObject({
        playCount: 4,
        matchType: 'fuzzy',
      });
    });

    it('should aggregate play counts from multiple album mappings', async () => {
      mockMappingService.getAllAlbumMappings.mockResolvedValue([
        mapping('tallulah', 'tallulah (live)', 'The Go-Betweens', 'Tallulah'),
        mapping(
          'the go-betweens',
          'tallulah (remastered)',
          'The Go-Betweens',
          'Tallulah'
        ),
      ]);
      const app = createTestApp(
        historyOf({
          'the go-betweens|tallulah': played(3),
          'the go-betweens|tallulah (remastered)': played(2),
          'tallulah|tallulah (live)': played(1),
        }),
        mockMappingService
      );

      const response = await post(app, [
        { artist: 'The Go-Betweens', title: 'Tallulah' },
      ]);

      expect(response.body.data.results[0].playCount).toBe(6);
    });

    it('should work without a mapping service', async () => {
      const app = createTestApp(
        historyOf({ 'radiohead|ok computer': played(3) }),
        undefined
      );

      const response = await post(app, [
        { artist: 'Radiohead', title: 'OK Computer' },
      ]);

      expect(response.body.data.results[0].playCount).toBe(3);
    });

    it('ignores Discogs number suffixes on the artist', async () => {
      const app = createTestApp(
        historyOf({ 'the format|dog problems': played(5) }),
        mockMappingService
      );

      const response = await post(app, [
        { artist: 'The Format (2)', title: 'Dog Problems' },
      ]);

      expect(response.body.data.results[0].playCount).toBe(5);
    });
  });

  // ==========================================
  // Edge cases
  // ==========================================
  describe('Edge cases', () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        artist: `Artist ${i}`,
        title: `Album ${i}`,
      }));

    it.each([50, 51, 120])('should handle %i albums', async n => {
      const app = createTestApp(
        historyOf({ 'artist 0|album 0': played(2) }),
        mockMappingService
      );

      const response = await post(app, many(n));

      expect(response.body.data.results).toHaveLength(n);
      expect(response.body.data.results[0].playCount).toBe(2);
      expect(response.body.data.results[n - 1].playCount).toBe(0);
    });

    it('should handle special characters in artist and title names', async () => {
      const app = createTestApp(
        historyOf({ 'sigur rós|( )': played(3) }),
        mockMappingService
      );

      const response = await post(app, [{ artist: 'Sigur Rós', title: '( )' }]);

      expect(response.body.data.results[0].playCount).toBe(3);
    });

    it('should preserve original artist/title in results regardless of matching', async () => {
      const app = createTestApp(
        historyOf({ 'the format|dog problems': played(1) }),
        mockMappingService
      );

      const response = await post(app, [
        { artist: 'The Format (2)', title: 'Dog Problems' },
      ]);

      expect(response.body.data.results[0]).toMatchObject({
        artist: 'The Format (2)',
        title: 'Dog Problems',
      });
    });
  });
});
