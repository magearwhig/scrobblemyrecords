import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import request from 'supertest';

import createStatsRouter from '../../../src/backend/routes/stats';
import { AuthService } from '../../../src/backend/services/authService';
import { StatsService } from '../../../src/backend/services/statsService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';
import {
  ArtistDetailResponse,
  TrackDetailResponse,
} from '../../../src/shared/types';

// Mock dependencies
jest.mock('../../../src/backend/services/authService');
jest.mock('../../../src/backend/services/statsService');
jest.mock('../../../src/backend/utils/fileStorage');

const MockedAuthService = AuthService as jest.MockedClass<typeof AuthService>;
const MockedStatsService = StatsService as jest.MockedClass<
  typeof StatsService
>;
const MockedFileStorage = FileStorage as jest.MockedClass<typeof FileStorage>;

describe('Artist & Track Detail Endpoints', () => {
  let app: express.Application;
  let mockFileStorage: jest.Mocked<FileStorage>;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockStatsService: jest.Mocked<StatsService>;

  const mockArtistDetail: ArtistDetailResponse = {
    artist: 'Radiohead',
    totalPlayCount: 1247,
    firstPlayed: 1553040000,
    lastPlayed: 1706745600,
    periodCounts: {
      thisWeek: 12,
      thisMonth: 47,
      thisYear: 312,
      allTime: 1247,
    },
    playTrend: [
      { period: '2024-01', count: 35 },
      { period: '2024-02', count: 42 },
    ],
    topTracks: [
      {
        track: 'Everything In Its Right Place',
        album: 'Kid A',
        playCount: 87,
        lastPlayed: 1706745600,
      },
      {
        track: 'Idioteque',
        album: 'Kid A',
        playCount: 63,
        lastPlayed: 1706659200,
      },
    ],
    albums: [
      {
        album: 'Kid A',
        playCount: 150,
        lastPlayed: 1706745600,
        inCollection: true,
        collectionReleaseId: 456,
      },
      {
        album: 'OK Computer',
        playCount: 120,
        lastPlayed: 1706659200,
        inCollection: false,
      },
    ],
    imageUrl: 'https://example.com/radiohead.jpg',
  };

  const mockTrackDetail: TrackDetailResponse = {
    artist: 'Radiohead',
    track: 'Everything In Its Right Place',
    totalPlayCount: 87,
    firstPlayed: 1555718400,
    lastPlayed: 1706745600,
    playTrend: [
      { period: '2024-01', count: 8 },
      { period: '2024-02', count: 12 },
    ],
    appearsOn: [
      {
        album: 'Kid A',
        artist: 'Radiohead',
        playCount: 47,
        lastPlayed: 1706745600,
        inCollection: true,
        collectionReleaseId: 456,
      },
      {
        album: 'Kid A (Deluxe Edition)',
        artist: 'Radiohead',
        playCount: 40,
        lastPlayed: 1706659200,
        inCollection: false,
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock instances
    mockFileStorage = new MockedFileStorage('test') as jest.Mocked<FileStorage>;
    mockAuthService = new MockedAuthService(
      mockFileStorage
    ) as jest.Mocked<AuthService>;
    mockStatsService = new MockedStatsService(
      mockFileStorage,
      {} as any
    ) as jest.Mocked<StatsService>;

    // Setup default auth mock (authenticated user)
    mockAuthService.getUserSettings = jest.fn().mockResolvedValue({
      discogs: { username: 'testuser' },
      lastfm: {},
      preferences: {
        defaultTimestamp: 'now' as const,
        batchSize: 50,
        autoScrobble: false,
      },
    });

    // Setup collection loading mock (empty collection by default)
    mockFileStorage.readJSON = jest.fn().mockResolvedValue(null);

    // Setup service mocks
    mockStatsService.getArtistDetail = jest
      .fn()
      .mockResolvedValue(mockArtistDetail);
    mockStatsService.getTrackDetail = jest
      .fn()
      .mockResolvedValue(mockTrackDetail);

    // Create Express app
    app = express();
    app.use(helmet());
    app.use(cors());
    app.use(express.json());
    app.use((_req, res, next) => {
      res.set('Connection', 'close');
      next();
    });

    // Mount stats routes
    app.use(
      '/api/v1/stats',
      createStatsRouter(mockFileStorage, mockAuthService, mockStatsService)
    );
  });

  // ============================================
  // Artist Detail Endpoint
  // ============================================

  describe('GET /api/v1/stats/artist/:artistName', () => {
    it('should return correct data shape for known artist', async () => {
      // Act
      const response = await request(app).get('/api/v1/stats/artist/Radiohead');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const data = response.body.data;
      expect(data.artist).toBe('Radiohead');
      expect(data.totalPlayCount).toBe(1247);
      expect(data.firstPlayed).toBe(1553040000);
      expect(data.lastPlayed).toBe(1706745600);
      expect(data.periodCounts).toEqual({
        thisWeek: 12,
        thisMonth: 47,
        thisYear: 312,
        allTime: 1247,
      });
      expect(data.playTrend).toHaveLength(2);
      expect(data.playTrend[0]).toHaveProperty('period');
      expect(data.playTrend[0]).toHaveProperty('count');
      expect(data.topTracks).toHaveLength(2);
      expect(data.topTracks[0]).toHaveProperty('track');
      expect(data.topTracks[0]).toHaveProperty('album');
      expect(data.topTracks[0]).toHaveProperty('playCount');
      expect(data.topTracks[0]).toHaveProperty('lastPlayed');
      expect(data.albums).toHaveLength(2);
      expect(data.albums[0]).toHaveProperty('album');
      expect(data.albums[0]).toHaveProperty('playCount');
      expect(data.albums[0]).toHaveProperty('inCollection');
      expect(data.imageUrl).toBe('https://example.com/radiohead.jpg');
    });

    it('should call getArtistDetail with correct arguments', async () => {
      // Act
      await request(app).get('/api/v1/stats/artist/Radiohead');

      // Assert
      expect(mockStatsService.getArtistDetail).toHaveBeenCalledWith(
        'Radiohead',
        'month',
        []
      );
    });

    it('should return empty data for unknown artist', async () => {
      // Arrange
      const emptyArtistResponse: ArtistDetailResponse = {
        artist: 'Unknown Artist',
        totalPlayCount: 0,
        firstPlayed: null,
        lastPlayed: null,
        periodCounts: { thisWeek: 0, thisMonth: 0, thisYear: 0, allTime: 0 },
        playTrend: [],
        topTracks: [],
        albums: [],
      };
      mockStatsService.getArtistDetail.mockResolvedValue(emptyArtistResponse);

      // Act
      const response = await request(app).get(
        '/api/v1/stats/artist/Unknown%20Artist'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.totalPlayCount).toBe(0);
      expect(response.body.data.firstPlayed).toBeNull();
      expect(response.body.data.lastPlayed).toBeNull();
      expect(response.body.data.playTrend).toEqual([]);
      expect(response.body.data.topTracks).toEqual([]);
      expect(response.body.data.albums).toEqual([]);
    });

    it('should handle trendPeriod query parameter', async () => {
      // Act
      await request(app).get('/api/v1/stats/artist/Radiohead?trendPeriod=week');

      // Assert
      expect(mockStatsService.getArtistDetail).toHaveBeenCalledWith(
        'Radiohead',
        'week',
        []
      );
    });

    it('should default trendPeriod to month when not specified', async () => {
      // Act
      await request(app).get('/api/v1/stats/artist/Radiohead');

      // Assert
      expect(mockStatsService.getArtistDetail).toHaveBeenCalledWith(
        'Radiohead',
        'month',
        []
      );
    });

    it('should URL-decode artist name', async () => {
      // Act
      await request(app).get('/api/v1/stats/artist/AC%2FDC');

      // Assert
      expect(mockStatsService.getArtistDetail).toHaveBeenCalledWith(
        'AC/DC',
        'month',
        []
      );
    });

    it('should handle artist name with special characters', async () => {
      // Act
      await request(app).get('/api/v1/stats/artist/Sunn%20O)))');

      // Assert
      expect(mockStatsService.getArtistDetail).toHaveBeenCalledWith(
        'Sunn O)))',
        'month',
        []
      );
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
      await request(app).get('/api/v1/stats/artist/Radiohead');

      // Assert
      expect(mockStatsService.getArtistDetail).toHaveBeenCalledWith(
        'Radiohead',
        'month',
        expect.arrayContaining([expect.objectContaining({ id: 1 })])
      );
    });

    it('should pass empty collection when user has no Discogs username', async () => {
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
      await request(app).get('/api/v1/stats/artist/Radiohead');

      // Assert
      expect(mockStatsService.getArtistDetail).toHaveBeenCalledWith(
        'Radiohead',
        'month',
        []
      );
    });

    it('should handle server errors gracefully', async () => {
      // Arrange
      mockStatsService.getArtistDetail.mockRejectedValue(
        new Error('Database connection failed')
      );

      // Act
      const response = await request(app).get('/api/v1/stats/artist/Radiohead');

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Database connection failed');
    });
  });

  // ============================================
  // Track Detail Endpoint
  // ============================================

  describe('GET /api/v1/stats/track', () => {
    it('should return correct data shape for known track', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/stats/track?artist=Radiohead&track=Everything%20In%20Its%20Right%20Place'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const data = response.body.data;
      expect(data.artist).toBe('Radiohead');
      expect(data.track).toBe('Everything In Its Right Place');
      expect(data.totalPlayCount).toBe(87);
      expect(data.firstPlayed).toBe(1555718400);
      expect(data.lastPlayed).toBe(1706745600);
      expect(data.playTrend).toHaveLength(2);
      expect(data.playTrend[0]).toHaveProperty('period');
      expect(data.playTrend[0]).toHaveProperty('count');
      expect(data.appearsOn).toHaveLength(2);
      expect(data.appearsOn[0]).toHaveProperty('album');
      expect(data.appearsOn[0]).toHaveProperty('artist');
      expect(data.appearsOn[0]).toHaveProperty('playCount');
      expect(data.appearsOn[0]).toHaveProperty('lastPlayed');
      expect(data.appearsOn[0]).toHaveProperty('inCollection');
    });

    it('should call getTrackDetail with correct arguments', async () => {
      // Act
      await request(app).get(
        '/api/v1/stats/track?artist=Radiohead&track=Idioteque'
      );

      // Assert
      expect(mockStatsService.getTrackDetail).toHaveBeenCalledWith(
        'Radiohead',
        'Idioteque',
        undefined,
        'month',
        []
      );
    });

    it('should require artist query parameter', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/stats/track?track=Idioteque'
      );

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain(
        'Both artist and track query parameters are required'
      );
    });

    it('should require track query parameter', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/stats/track?artist=Radiohead'
      );

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain(
        'Both artist and track query parameters are required'
      );
    });

    it('should return 400 when both artist and track are missing', async () => {
      // Act
      const response = await request(app).get('/api/v1/stats/track');

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain(
        'Both artist and track query parameters are required'
      );
    });

    it('should accept optional album parameter', async () => {
      // Act
      await request(app).get(
        '/api/v1/stats/track?artist=Radiohead&track=Idioteque&album=Kid%20A'
      );

      // Assert
      expect(mockStatsService.getTrackDetail).toHaveBeenCalledWith(
        'Radiohead',
        'Idioteque',
        'Kid A',
        'month',
        []
      );
    });

    it('should handle trendPeriod query parameter', async () => {
      // Act
      await request(app).get(
        '/api/v1/stats/track?artist=Radiohead&track=Idioteque&trendPeriod=week'
      );

      // Assert
      expect(mockStatsService.getTrackDetail).toHaveBeenCalledWith(
        'Radiohead',
        'Idioteque',
        undefined,
        'week',
        []
      );
    });

    it('should default trendPeriod to month when not specified', async () => {
      // Act
      await request(app).get(
        '/api/v1/stats/track?artist=Radiohead&track=Idioteque'
      );

      // Assert
      expect(mockStatsService.getTrackDetail).toHaveBeenCalledWith(
        'Radiohead',
        'Idioteque',
        undefined,
        'month',
        []
      );
    });

    it('should return empty data for unknown track', async () => {
      // Arrange
      const emptyTrackResponse: TrackDetailResponse = {
        artist: 'Radiohead',
        track: 'Nonexistent Track',
        totalPlayCount: 0,
        firstPlayed: null,
        lastPlayed: null,
        playTrend: [],
        appearsOn: [],
      };
      mockStatsService.getTrackDetail.mockResolvedValue(emptyTrackResponse);

      // Act
      const response = await request(app).get(
        '/api/v1/stats/track?artist=Radiohead&track=Nonexistent%20Track'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.totalPlayCount).toBe(0);
      expect(response.body.data.firstPlayed).toBeNull();
      expect(response.body.data.lastPlayed).toBeNull();
      expect(response.body.data.playTrend).toEqual([]);
      expect(response.body.data.appearsOn).toEqual([]);
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
        '/api/v1/stats/track?artist=Radiohead&track=Idioteque'
      );

      // Assert
      expect(mockStatsService.getTrackDetail).toHaveBeenCalledWith(
        'Radiohead',
        'Idioteque',
        undefined,
        'month',
        expect.arrayContaining([expect.objectContaining({ id: 1 })])
      );
    });

    it('should pass empty collection when user has no Discogs username', async () => {
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
        '/api/v1/stats/track?artist=Radiohead&track=Idioteque'
      );

      // Assert
      expect(mockStatsService.getTrackDetail).toHaveBeenCalledWith(
        'Radiohead',
        'Idioteque',
        undefined,
        'month',
        []
      );
    });

    it('should accept all query parameters together', async () => {
      // Act
      await request(app).get(
        '/api/v1/stats/track?artist=Radiohead&track=Idioteque&album=Kid%20A&trendPeriod=week'
      );

      // Assert
      expect(mockStatsService.getTrackDetail).toHaveBeenCalledWith(
        'Radiohead',
        'Idioteque',
        'Kid A',
        'week',
        []
      );
    });

    it('should handle server errors gracefully', async () => {
      // Arrange
      mockStatsService.getTrackDetail.mockRejectedValue(
        new Error('Database connection failed')
      );

      // Act
      const response = await request(app).get(
        '/api/v1/stats/track?artist=Radiohead&track=Idioteque'
      );

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Database connection failed');
    });
  });
});
