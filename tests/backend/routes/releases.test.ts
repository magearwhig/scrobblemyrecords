import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import request from 'supertest';

import createReleasesRouter from '../../../src/backend/routes/releases';
import { AuthService } from '../../../src/backend/services/authService';
import { HiddenReleasesService } from '../../../src/backend/services/hiddenReleasesService';
import { ReleaseTrackingService } from '../../../src/backend/services/releaseTrackingService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';

// Mock dependencies
jest.mock('../../../src/backend/services/authService');
jest.mock('../../../src/backend/services/releaseTrackingService');
jest.mock('../../../src/backend/services/hiddenReleasesService');
jest.mock('../../../src/backend/utils/fileStorage');

const MockedAuthService = AuthService as jest.MockedClass<typeof AuthService>;
const MockedReleaseTrackingService = ReleaseTrackingService as jest.MockedClass<
  typeof ReleaseTrackingService
>;
const MockedHiddenReleasesService = HiddenReleasesService as jest.MockedClass<
  typeof HiddenReleasesService
>;
const MockedFileStorage = FileStorage as jest.MockedClass<typeof FileStorage>;

describe('Releases Routes - Hidden/Excluded', () => {
  let app: express.Application;
  let mockFileStorage: jest.Mocked<FileStorage>;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockReleaseTrackingService: jest.Mocked<ReleaseTrackingService>;
  let mockHiddenReleasesService: jest.Mocked<HiddenReleasesService>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock instances
    mockFileStorage = new MockedFileStorage('test') as jest.Mocked<FileStorage>;
    mockAuthService = new MockedAuthService(
      mockFileStorage
    ) as jest.Mocked<AuthService>;
    mockReleaseTrackingService = {
      getFilteredReleases: jest.fn().mockResolvedValue([]),
      getSyncStatus: jest.fn().mockResolvedValue({ status: 'idle' }),
      getSettings: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<ReleaseTrackingService>;
    mockHiddenReleasesService = new MockedHiddenReleasesService(
      mockFileStorage
    ) as jest.Mocked<HiddenReleasesService>;

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

    // HiddenReleasesService mocks
    mockHiddenReleasesService.getAllHiddenReleases = jest
      .fn()
      .mockResolvedValue([]);
    mockHiddenReleasesService.getAllExcludedArtists = jest
      .fn()
      .mockResolvedValue([]);
    mockHiddenReleasesService.hideRelease = jest
      .fn()
      .mockResolvedValue(undefined);
    mockHiddenReleasesService.unhideRelease = jest.fn().mockResolvedValue(true);
    mockHiddenReleasesService.excludeArtist = jest
      .fn()
      .mockResolvedValue(undefined);
    mockHiddenReleasesService.includeArtist = jest.fn().mockResolvedValue(true);
    mockHiddenReleasesService.getCounts = jest
      .fn()
      .mockResolvedValue({ releases: 0, artists: 0 });

    // Create Express app with releases router
    app = express();
    app.use(helmet());
    app.use(cors());
    app.use(express.json());
    app.use(
      '/api/v1/releases',
      createReleasesRouter(
        mockAuthService,
        mockReleaseTrackingService,
        mockHiddenReleasesService
      )
    );
  });

  describe('GET /api/v1/releases/hidden', () => {
    it('should return empty array when no hidden releases', async () => {
      const response = await request(app).get('/api/v1/releases/hidden');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
      expect(response.body.total).toBe(0);
    });

    it('should return hidden releases', async () => {
      const mockHidden = [
        {
          mbid: 'mbid123',
          title: 'Test Album',
          artistName: 'Test Artist',
          hiddenAt: Date.now(),
        },
      ];
      mockHiddenReleasesService.getAllHiddenReleases.mockResolvedValue(
        mockHidden
      );

      const response = await request(app).get('/api/v1/releases/hidden');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].mbid).toBe('mbid123');
    });
  });

  describe('POST /api/v1/releases/hidden', () => {
    it('should hide a release', async () => {
      const response = await request(app).post('/api/v1/releases/hidden').send({
        mbid: 'mbid123',
        title: 'Test Album',
        artistName: 'Test Artist',
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Release hidden');
      expect(mockHiddenReleasesService.hideRelease).toHaveBeenCalledWith(
        'mbid123',
        'Test Album',
        'Test Artist'
      );
    });

    it('should return 400 if required fields are missing', async () => {
      const response = await request(app).post('/api/v1/releases/hidden').send({
        mbid: 'mbid123',
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/v1/releases/hidden/:mbid', () => {
    it('should unhide a release', async () => {
      const response = await request(app).delete(
        '/api/v1/releases/hidden/mbid123'
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Release unhidden');
    });

    it('should return 404 if release not found', async () => {
      mockHiddenReleasesService.unhideRelease.mockResolvedValue(false);

      const response = await request(app).delete(
        '/api/v1/releases/hidden/nonexistent'
      );

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/releases/excluded-artists', () => {
    it('should return empty array when no excluded artists', async () => {
      const response = await request(app).get(
        '/api/v1/releases/excluded-artists'
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
      expect(response.body.total).toBe(0);
    });

    it('should return excluded artists', async () => {
      const mockExcluded = [
        {
          artistName: 'Test Artist',
          normalizedName: 'test artist',
          excludedAt: Date.now(),
        },
      ];
      mockHiddenReleasesService.getAllExcludedArtists.mockResolvedValue(
        mockExcluded
      );

      const response = await request(app).get(
        '/api/v1/releases/excluded-artists'
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
    });
  });

  describe('POST /api/v1/releases/excluded-artists', () => {
    it('should exclude an artist', async () => {
      const response = await request(app)
        .post('/api/v1/releases/excluded-artists')
        .send({
          artistName: 'Test Artist',
          artistMbid: 'mbid-artist',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockHiddenReleasesService.excludeArtist).toHaveBeenCalledWith(
        'Test Artist',
        'mbid-artist'
      );
    });

    it('should return 400 if artistName is missing', async () => {
      const response = await request(app)
        .post('/api/v1/releases/excluded-artists')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/v1/releases/excluded-artists/:artistName', () => {
    it('should include an artist back', async () => {
      const response = await request(app).delete(
        '/api/v1/releases/excluded-artists/Test%20Artist'
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockHiddenReleasesService.includeArtist).toHaveBeenCalledWith(
        'Test Artist'
      );
    });

    it('should return 404 if artist not found', async () => {
      mockHiddenReleasesService.includeArtist.mockResolvedValue(false);

      const response = await request(app).delete(
        '/api/v1/releases/excluded-artists/nonexistent'
      );

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/releases/filters/counts', () => {
    it('should return counts', async () => {
      mockHiddenReleasesService.getCounts.mockResolvedValue({
        releases: 5,
        artists: 3,
      });

      const response = await request(app).get(
        '/api/v1/releases/filters/counts'
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.releases).toBe(5);
      expect(response.body.data.artists).toBe(3);
    });
  });
});
