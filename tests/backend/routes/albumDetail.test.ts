import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import request from 'supertest';

import createStatsRouter from '../../../src/backend/routes/stats';
import { AuthService } from '../../../src/backend/services/authService';
import { StatsService } from '../../../src/backend/services/statsService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';
import { AlbumArcBucket, AlbumDetailResponse } from '../../../src/shared/types';

// Mock dependencies
jest.mock('../../../src/backend/services/authService');
jest.mock('../../../src/backend/services/statsService');
jest.mock('../../../src/backend/utils/fileStorage');

const MockedAuthService = AuthService as jest.MockedClass<typeof AuthService>;
const MockedStatsService = StatsService as jest.MockedClass<
  typeof StatsService
>;
const MockedFileStorage = FileStorage as jest.MockedClass<typeof FileStorage>;

describe('GET /api/v1/stats/album-detail', () => {
  let app: express.Application;
  let mockFileStorage: jest.Mocked<FileStorage>;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockStatsService: jest.Mocked<StatsService>;

  const mockArc: AlbumArcBucket[] = [
    { period: '2024-01', playCount: 4, trackCount: 3 },
    { period: '2024-02', playCount: 2, trackCount: 2 },
  ];

  const baseAlbumDetail: AlbumDetailResponse = {
    artist: 'Radiohead',
    album: 'Kid A',
    playCount: 12,
    firstPlayed: 1704067200,
    lastPlayed: 1706745600,
    tracks: [
      {
        track: 'Everything In Its Right Place',
        playCount: 5,
        lastPlayed: 1706745600,
      },
      { track: 'Idioteque', playCount: 4, lastPlayed: 1706659200 },
      { track: 'The National Anthem', playCount: 3, lastPlayed: 1706572800 },
    ],
    arc: mockArc,
    inCollection: false,
    mappings: {},
  };

  beforeEach(() => {
    // Create mock instances
    mockFileStorage = new MockedFileStorage('test') as jest.Mocked<FileStorage>;
    mockAuthService = new MockedAuthService(
      mockFileStorage
    ) as jest.Mocked<AuthService>;
    mockStatsService = new MockedStatsService(
      mockFileStorage,
      {} as never
    ) as jest.Mocked<StatsService>;

    mockAuthService.getUserSettings = jest.fn().mockResolvedValue({
      discogs: { username: 'testuser' },
      lastfm: {},
      preferences: {
        defaultTimestamp: 'now' as const,
        batchSize: 50,
        autoScrobble: false,
      },
    });

    // Default: no cached collection
    mockFileStorage.readJSON = jest.fn().mockResolvedValue(null);

    mockStatsService.getAlbumDetail = jest
      .fn()
      .mockResolvedValue(baseAlbumDetail);

    app = express();
    app.use(helmet());
    app.use(cors());
    app.use(express.json());
    app.use((_req, res, next) => {
      res.set('Connection', 'close');
      next();
    });
    app.use(
      '/api/v1/stats',
      createStatsRouter(mockFileStorage, mockAuthService, mockStatsService)
    );
  });

  describe('Happy path', () => {
    it('should return AlbumDetailResponse shape with all expected keys', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/stats/album-detail?artist=Radiohead&album=Kid%20A'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      const data = response.body.data;
      expect(data).toHaveProperty('artist', 'Radiohead');
      expect(data).toHaveProperty('album', 'Kid A');
      expect(data).toHaveProperty('playCount', 12);
      expect(data).toHaveProperty('firstPlayed', 1704067200);
      expect(data).toHaveProperty('lastPlayed', 1706745600);
      expect(data).toHaveProperty('tracks');
      expect(Array.isArray(data.tracks)).toBe(true);
      expect(data.tracks).toHaveLength(3);
      expect(data.tracks[0]).toEqual({
        track: 'Everything In Its Right Place',
        playCount: 5,
        lastPlayed: 1706745600,
      });
      expect(data).toHaveProperty('arc');
      expect(data.arc[0]).toHaveProperty('period');
      expect(data.arc[0]).toHaveProperty('playCount');
      expect(data.arc[0]).toHaveProperty('trackCount');
      expect(data).toHaveProperty('inCollection', false);
      expect(data).toHaveProperty('mappings');
    });

    it('should pass collection items when user is authenticated', async () => {
      // Arrange
      mockFileStorage.readJSON
        .mockResolvedValueOnce({
          data: [
            {
              id: 1,
              release: { id: 456, artist: 'Radiohead', title: 'Kid A' },
            },
          ],
          timestamp: Date.now(),
        })
        .mockResolvedValueOnce(null);

      // Act
      await request(app).get(
        '/api/v1/stats/album-detail?artist=Radiohead&album=Kid%20A'
      );

      // Assert
      expect(mockStatsService.getAlbumDetail).toHaveBeenCalledWith(
        'Radiohead',
        'Kid A',
        expect.arrayContaining([expect.objectContaining({ id: 1 })])
      );
    });

    it('should pass an empty collection when user has no Discogs username', async () => {
      // Arrange
      mockAuthService.getUserSettings.mockResolvedValue({
        discogs: { username: '' },
        lastfm: {},
        preferences: {
          defaultTimestamp: 'now' as const,
          batchSize: 50,
          autoScrobble: false,
        },
      });

      // Act
      await request(app).get(
        '/api/v1/stats/album-detail?artist=Radiohead&album=Kid%20A'
      );

      // Assert
      expect(mockStatsService.getAlbumDetail).toHaveBeenCalledWith(
        'Radiohead',
        'Kid A',
        []
      );
    });
  });

  describe('Validation errors', () => {
    it('should return 400 when artist query param is missing', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/stats/album-detail?album=Kid%20A'
      );

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('artist and album');
    });

    it('should return 400 when album query param is missing', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/stats/album-detail?artist=Radiohead'
      );

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('artist and album');
    });

    it('should return 400 when both query params are missing', async () => {
      // Act
      const response = await request(app).get('/api/v1/stats/album-detail');

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should return 400 when artist is empty string', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/stats/album-detail?artist=&album=Kid%20A'
      );

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Not-found handling', () => {
    it('should return 404 when no plays exist (ALBUM_NOT_FOUND)', async () => {
      // Arrange
      mockStatsService.getAlbumDetail.mockRejectedValue(
        new Error('ALBUM_NOT_FOUND')
      );

      // Act
      const response = await request(app).get(
        '/api/v1/stats/album-detail?artist=NoSuchArtist&album=NoSuchAlbum'
      );

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });
  });

  describe('Server errors', () => {
    it('should return 500 for non-ALBUM_NOT_FOUND errors', async () => {
      // Arrange
      mockStatsService.getAlbumDetail.mockRejectedValue(
        new Error('Storage exploded')
      );

      // Act
      const response = await request(app).get(
        '/api/v1/stats/album-detail?artist=Radiohead&album=Kid%20A'
      );

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Storage exploded');
    });
  });

  describe('Mappings branches', () => {
    it('should surface compoundArtist when service returns a mapping', async () => {
      // Arrange
      const compoundResponse: AlbumDetailResponse = {
        ...baseAlbumDetail,
        artist: 'Run The Jewels',
        mappings: {
          compoundArtist: {
            compoundName: 'Run The Jewels',
            components: ['El-P', 'Killer Mike'],
          },
        },
      };
      mockStatsService.getAlbumDetail.mockResolvedValue(compoundResponse);

      // Act
      const response = await request(app).get(
        '/api/v1/stats/album-detail?artist=Run%20The%20Jewels&album=RTJ4'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.mappings.compoundArtist).toEqual({
        compoundName: 'Run The Jewels',
        components: ['El-P', 'Killer Mike'],
      });
    });

    it('should surface albumMapping when one is recorded', async () => {
      // Arrange
      const mappedResponse: AlbumDetailResponse = {
        ...baseAlbumDetail,
        mappings: {
          albumMapping: {
            historyArtist: 'Radiohead',
            historyAlbum: 'Kid A',
            collectionArtist: 'Radiohead',
            collectionAlbum: 'Kid A (Reissue)',
          },
        },
      };
      mockStatsService.getAlbumDetail.mockResolvedValue(mappedResponse);

      // Act
      const response = await request(app).get(
        '/api/v1/stats/album-detail?artist=Radiohead&album=Kid%20A'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.mappings.albumMapping).toEqual({
        historyArtist: 'Radiohead',
        historyAlbum: 'Kid A',
        collectionArtist: 'Radiohead',
        collectionAlbum: 'Kid A (Reissue)',
      });
    });

    it('should surface artistMapping when Discogs↔Last.fm mapping exists', async () => {
      // Arrange
      const artistMappedResponse: AlbumDetailResponse = {
        ...baseAlbumDetail,
        mappings: {
          artistMapping: {
            discogsName: 'Tool (2)',
            lastfmName: 'Tool',
          },
        },
      };
      mockStatsService.getAlbumDetail.mockResolvedValue(artistMappedResponse);

      // Act
      const response = await request(app).get(
        '/api/v1/stats/album-detail?artist=Tool&album=Lateralus'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.mappings.artistMapping).toEqual({
        discogsName: 'Tool (2)',
        lastfmName: 'Tool',
      });
    });
  });

  describe('Collection branches', () => {
    it('should populate collection fields when album is in collection', async () => {
      // Arrange
      const inCollectionResponse: AlbumDetailResponse = {
        ...baseAlbumDetail,
        inCollection: true,
        collectionReleaseId: 456,
        collectionArtist: 'Radiohead',
        collectionAlbum: 'Kid A',
        coverUrl: 'https://example.com/kida.jpg',
      };
      mockStatsService.getAlbumDetail.mockResolvedValue(inCollectionResponse);

      // Act
      const response = await request(app).get(
        '/api/v1/stats/album-detail?artist=Radiohead&album=Kid%20A'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.inCollection).toBe(true);
      expect(response.body.data.collectionReleaseId).toBe(456);
      expect(response.body.data.collectionArtist).toBe('Radiohead');
      expect(response.body.data.collectionAlbum).toBe('Kid A');
      expect(response.body.data.coverUrl).toBe('https://example.com/kida.jpg');
    });

    it('should omit collection fields when album is not in collection', async () => {
      // Act (uses default mock: inCollection=false, no collection fields)
      const response = await request(app).get(
        '/api/v1/stats/album-detail?artist=Radiohead&album=Kid%20A'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.inCollection).toBe(false);
      expect(response.body.data.collectionReleaseId).toBeUndefined();
      expect(response.body.data.collectionArtist).toBeUndefined();
      expect(response.body.data.collectionAlbum).toBeUndefined();
      expect(response.body.data.coverUrl).toBeUndefined();
    });
  });

  describe('Aliased artist behavior', () => {
    it('should honor display name returned by service for aliased artist', async () => {
      // Arrange — service handles "danny brown" / "danny brown (2)" merge upstream;
      // route just trusts the resolved display name.
      const aliasedResponse: AlbumDetailResponse = {
        ...baseAlbumDetail,
        artist: 'Danny Brown',
        album: 'Atrocity Exhibition',
        playCount: 47, // merged total across alias variants
      };
      mockStatsService.getAlbumDetail.mockResolvedValue(aliasedResponse);

      // Act
      const response = await request(app).get(
        '/api/v1/stats/album-detail?artist=danny%20brown%20(2)&album=Atrocity%20Exhibition'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.artist).toBe('Danny Brown');
      expect(response.body.data.playCount).toBe(47);
      // The route forwards the raw artist param to the service; resolver does the merge
      expect(mockStatsService.getAlbumDetail).toHaveBeenCalledWith(
        'danny brown (2)',
        'Atrocity Exhibition',
        []
      );
    });
  });

  describe('Tracks ordering', () => {
    it('should preserve tracks sorted by playCount DESC, ties broken by lastPlayed DESC', async () => {
      // Arrange
      const sortedResponse: AlbumDetailResponse = {
        ...baseAlbumDetail,
        tracks: [
          { track: 'Track A', playCount: 5, lastPlayed: 1706745600 },
          { track: 'Track B', playCount: 5, lastPlayed: 1706659200 }, // tie on count, newer first
          { track: 'Track C', playCount: 3, lastPlayed: 1706572800 },
        ],
      };
      mockStatsService.getAlbumDetail.mockResolvedValue(sortedResponse);

      // Act
      const response = await request(app).get(
        '/api/v1/stats/album-detail?artist=Radiohead&album=Kid%20A'
      );

      // Assert
      expect(response.status).toBe(200);
      const tracks = response.body.data.tracks;
      expect(tracks[0].track).toBe('Track A');
      expect(tracks[1].track).toBe('Track B');
      expect(tracks[2].track).toBe('Track C');
    });
  });
});
