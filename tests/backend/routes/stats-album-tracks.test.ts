import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import request from 'supertest';

import createStatsRouter from '../../../src/backend/routes/stats';
import { AuthService } from '../../../src/backend/services/authService';
import { StatsService } from '../../../src/backend/services/statsService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';

// Mock dependencies
jest.mock('../../../src/backend/services/authService');
jest.mock('../../../src/backend/services/statsService');
jest.mock('../../../src/backend/utils/fileStorage');

const MockedAuthService = AuthService as jest.MockedClass<typeof AuthService>;
const MockedStatsService = StatsService as jest.MockedClass<
  typeof StatsService
>;
const MockedFileStorage = FileStorage as jest.MockedClass<typeof FileStorage>;

describe('Stats Routes - Album Tracks Played', () => {
  let app: express.Application;
  let mockFileStorage: jest.Mocked<FileStorage>;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockStatsService: jest.Mocked<StatsService>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock instances
    mockFileStorage = new MockedFileStorage('test') as jest.Mocked<FileStorage>;
    mockAuthService = new MockedAuthService(
      mockFileStorage
    ) as jest.Mocked<AuthService>;
    mockStatsService = new MockedStatsService(
      mockFileStorage,
      {} as never
    ) as jest.Mocked<StatsService>;

    // Setup default mocks
    mockAuthService.getUserSettings = jest.fn().mockResolvedValue({
      discogs: { username: 'testuser' },
      lastfm: {},
      preferences: {
        defaultTimestamp: 'now' as const,
        batchSize: 50,
        autoScrobble: false,
      },
    });

    mockFileStorage.readJSON = jest.fn().mockResolvedValue(null);

    // Create Express app
    app = express();
    app.use(helmet());
    app.use(cors());
    app.use(express.json());

    // Mount stats routes
    app.use(
      '/api/v1/stats',
      createStatsRouter(mockFileStorage, mockAuthService, mockStatsService)
    );
  });

  describe('GET /api/v1/stats/album-tracks-played', () => {
    it('should return 400 when artist parameter is missing', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/stats/album-tracks-played?album=OK+Computer'
      );

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('artist and album');
    });

    it('should return 400 when album parameter is missing', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/stats/album-tracks-played?artist=Radiohead'
      );

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('artist and album');
    });

    it('should return 400 when both parameters are missing', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/stats/album-tracks-played'
      );

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should return tracks played for a known album', async () => {
      // Arrange
      const tracksPlayed = [
        'Airbag',
        'Paranoid Android',
        'Subterranean Homesick Alien',
      ];
      mockStatsService.getAlbumTracksPlayed = jest
        .fn()
        .mockResolvedValue(tracksPlayed);

      // Act
      const response = await request(app).get(
        '/api/v1/stats/album-tracks-played?artist=Radiohead&album=OK+Computer'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.artist).toBe('Radiohead');
      expect(response.body.data.album).toBe('OK Computer');
      expect(response.body.data.tracksPlayed).toEqual(tracksPlayed);
      expect(response.body.data.totalScrobbledTracks).toBe(3);
      expect(mockStatsService.getAlbumTracksPlayed).toHaveBeenCalledWith(
        'Radiohead',
        'OK Computer'
      );
    });

    it('should return empty array for unknown album', async () => {
      // Arrange
      mockStatsService.getAlbumTracksPlayed = jest.fn().mockResolvedValue([]);

      // Act
      const response = await request(app).get(
        '/api/v1/stats/album-tracks-played?artist=Unknown&album=Unknown'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.tracksPlayed).toEqual([]);
      expect(response.body.data.totalScrobbledTracks).toBe(0);
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockStatsService.getAlbumTracksPlayed = jest
        .fn()
        .mockRejectedValue(new Error('Storage error'));

      // Act
      const response = await request(app).get(
        '/api/v1/stats/album-tracks-played?artist=Radiohead&album=OK+Computer'
      );

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Storage error');
    });
  });
});
