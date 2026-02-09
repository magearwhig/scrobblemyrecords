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

  // ============================================
  // Releases List, Sync, Settings, Disambiguations,
  // Mappings, Search, Vinyl, Covers, Wishlist, Collection
  // ============================================

  describe('GET /api/v1/releases', () => {
    it('should return releases list', async () => {
      const mockReleases = [
        { mbid: 'mbid1', title: 'Album 1', artistName: 'Artist 1' },
      ];
      mockReleaseTrackingService.getFilteredReleases.mockResolvedValue(
        mockReleases as never
      );

      const response = await request(app).get('/api/v1/releases');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.total).toBe(1);
    });

    it('should pass filter parameters to service', async () => {
      mockReleaseTrackingService.getFilteredReleases.mockResolvedValue(
        [] as never
      );

      await request(app).get(
        '/api/v1/releases?types=album,ep&vinylOnly=true&upcomingOnly=true&sortBy=releaseDate&sortOrder=desc&limit=10'
      );

      expect(
        mockReleaseTrackingService.getFilteredReleases
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          types: ['album', 'ep'],
          vinylOnly: true,
          upcomingOnly: true,
          sortBy: 'releaseDate',
          sortOrder: 'desc',
          limit: 10,
        })
      );
    });

    it('should filter out invalid types', async () => {
      mockReleaseTrackingService.getFilteredReleases.mockResolvedValue(
        [] as never
      );

      await request(app).get('/api/v1/releases?types=album,invalid,ep');

      expect(
        mockReleaseTrackingService.getFilteredReleases
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          types: ['album', 'ep'],
        })
      );
    });

    it('should handle errors', async () => {
      mockReleaseTrackingService.getFilteredReleases.mockRejectedValue(
        new Error('Service error')
      );

      const response = await request(app).get('/api/v1/releases');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Service error');
    });
  });

  describe('GET /api/v1/releases/sync', () => {
    it('should return sync status', async () => {
      const mockStatus = {
        status: 'completed',
        progress: 100,
        mastersProcessed: 20,
      };
      mockReleaseTrackingService.getSyncStatus.mockResolvedValue(
        mockStatus as never
      );

      const response = await request(app).get('/api/v1/releases/sync');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('completed');
    });

    it('should handle errors', async () => {
      mockReleaseTrackingService.getSyncStatus.mockRejectedValue(
        new Error('Service error')
      );

      const response = await request(app).get('/api/v1/releases/sync');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/releases/sync', () => {
    beforeEach(() => {
      mockReleaseTrackingService.syncReleases = jest
        .fn()
        .mockResolvedValue({ status: 'completed' });
    });

    it('should trigger release sync', async () => {
      const response = await request(app).post('/api/v1/releases/sync');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Release sync completed');
      expect(mockReleaseTrackingService.syncReleases).toHaveBeenCalledWith(
        'testuser'
      );
    });

    it('should return 401 when no Discogs username', async () => {
      mockAuthService.getUserSettings.mockResolvedValue({
        discogs: { username: '' },
        lastfm: {},
        preferences: {
          defaultTimestamp: 'now' as const,
          batchSize: 50,
          autoScrobble: false,
        },
      });

      const response = await request(app).post('/api/v1/releases/sync');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should handle errors', async () => {
      mockReleaseTrackingService.syncReleases = jest
        .fn()
        .mockRejectedValue(new Error('Sync failed'));

      const response = await request(app).post('/api/v1/releases/sync');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/releases/settings', () => {
    it('should return release settings', async () => {
      const mockSettings = { autoCheckOnStartup: true, checkFrequencyDays: 7 };
      mockReleaseTrackingService.getSettings.mockResolvedValue(
        mockSettings as never
      );

      const response = await request(app).get('/api/v1/releases/settings');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.autoCheckOnStartup).toBe(true);
    });

    it('should handle errors', async () => {
      mockReleaseTrackingService.getSettings.mockRejectedValue(
        new Error('Service error')
      );

      const response = await request(app).get('/api/v1/releases/settings');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/releases/settings', () => {
    beforeEach(() => {
      mockReleaseTrackingService.saveSettings = jest
        .fn()
        .mockResolvedValue({ autoCheckOnStartup: false });
    });

    it('should save release settings', async () => {
      const response = await request(app)
        .post('/api/v1/releases/settings')
        .send({ autoCheckOnStartup: false, checkFrequencyDays: 14 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockReleaseTrackingService.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({ autoCheckOnStartup: false })
      );
    });

    it('should handle errors', async () => {
      mockReleaseTrackingService.saveSettings = jest
        .fn()
        .mockRejectedValue(new Error('Save failed'));

      const response = await request(app)
        .post('/api/v1/releases/settings')
        .send({});

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/releases/disambiguations', () => {
    beforeEach(() => {
      mockReleaseTrackingService.getPendingDisambiguations = jest
        .fn()
        .mockResolvedValue([]);
    });

    it('should return pending disambiguations', async () => {
      const mockDisambiguations = [
        { id: 'dis-1', artistName: 'Radiohead', candidates: [] },
      ];
      mockReleaseTrackingService.getPendingDisambiguations.mockResolvedValue(
        mockDisambiguations as never
      );

      const response = await request(app).get(
        '/api/v1/releases/disambiguations'
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.total).toBe(1);
    });

    it('should handle errors', async () => {
      mockReleaseTrackingService.getPendingDisambiguations = jest
        .fn()
        .mockRejectedValue(new Error('Error'));

      const response = await request(app).get(
        '/api/v1/releases/disambiguations'
      );

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/releases/disambiguations/:id/resolve', () => {
    beforeEach(() => {
      mockReleaseTrackingService.resolveDisambiguation = jest.fn();
    });

    it('should resolve disambiguation', async () => {
      mockReleaseTrackingService.resolveDisambiguation.mockResolvedValue({
        id: 'dis-1',
        resolved: true,
      } as never);

      const response = await request(app)
        .post('/api/v1/releases/disambiguations/dis-1/resolve')
        .send({ mbid: 'mbid-123' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Disambiguation resolved');
    });

    it('should accept null mbid for "none of these"', async () => {
      mockReleaseTrackingService.resolveDisambiguation.mockResolvedValue({
        id: 'dis-1',
      } as never);

      const response = await request(app)
        .post('/api/v1/releases/disambiguations/dis-1/resolve')
        .send({ mbid: null });

      expect(response.status).toBe(200);
      expect(
        mockReleaseTrackingService.resolveDisambiguation
      ).toHaveBeenCalledWith('dis-1', null);
    });

    it('should return 400 if mbid not provided', async () => {
      const response = await request(app)
        .post('/api/v1/releases/disambiguations/dis-1/resolve')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should return 404 if disambiguation not found', async () => {
      mockReleaseTrackingService.resolveDisambiguation.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/v1/releases/disambiguations/nonexistent/resolve')
        .send({ mbid: 'mbid-123' });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('should handle errors', async () => {
      mockReleaseTrackingService.resolveDisambiguation.mockRejectedValue(
        new Error('Error')
      );

      const response = await request(app)
        .post('/api/v1/releases/disambiguations/dis-1/resolve')
        .send({ mbid: 'mbid-123' });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/releases/disambiguations/:id/skip', () => {
    beforeEach(() => {
      mockReleaseTrackingService.skipDisambiguation = jest.fn();
    });

    it('should skip disambiguation', async () => {
      mockReleaseTrackingService.skipDisambiguation.mockResolvedValue(
        true as never
      );

      const response = await request(app).post(
        '/api/v1/releases/disambiguations/dis-1/skip'
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Disambiguation skipped');
    });

    it('should return 404 if not found', async () => {
      mockReleaseTrackingService.skipDisambiguation.mockResolvedValue(
        false as never
      );

      const response = await request(app).post(
        '/api/v1/releases/disambiguations/nonexistent/skip'
      );

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('should handle errors', async () => {
      mockReleaseTrackingService.skipDisambiguation.mockRejectedValue(
        new Error('Error')
      );

      const response = await request(app).post(
        '/api/v1/releases/disambiguations/dis-1/skip'
      );

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/releases/mappings', () => {
    beforeEach(() => {
      mockReleaseTrackingService.getArtistMappings = jest
        .fn()
        .mockResolvedValue([]);
    });

    it('should return artist mappings', async () => {
      const mockMappings = [
        { artistName: 'Radiohead', mbid: 'mbid-123', source: 'user' },
      ];
      mockReleaseTrackingService.getArtistMappings.mockResolvedValue(
        mockMappings as never
      );

      const response = await request(app).get('/api/v1/releases/mappings');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.total).toBe(1);
    });

    it('should handle errors', async () => {
      mockReleaseTrackingService.getArtistMappings.mockRejectedValue(
        new Error('Error')
      );

      const response = await request(app).get('/api/v1/releases/mappings');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/releases/mappings', () => {
    beforeEach(() => {
      mockReleaseTrackingService.setArtistMapping = jest
        .fn()
        .mockResolvedValue({});
    });

    it('should create artist mapping', async () => {
      const response = await request(app)
        .post('/api/v1/releases/mappings')
        .send({ artistName: 'Radiohead', mbid: 'mbid-123' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Artist mapping saved');
      expect(mockReleaseTrackingService.setArtistMapping).toHaveBeenCalledWith(
        'Radiohead',
        'mbid-123',
        'user'
      );
    });

    it('should return 400 if artistName is missing', async () => {
      const response = await request(app)
        .post('/api/v1/releases/mappings')
        .send({ mbid: 'mbid-123' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should handle errors', async () => {
      mockReleaseTrackingService.setArtistMapping.mockRejectedValue(
        new Error('Error')
      );

      const response = await request(app)
        .post('/api/v1/releases/mappings')
        .send({ artistName: 'Test', mbid: 'mbid-123' });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/v1/releases/mappings/:artistName', () => {
    beforeEach(() => {
      mockReleaseTrackingService.removeArtistMapping = jest.fn();
    });

    it('should remove artist mapping', async () => {
      mockReleaseTrackingService.removeArtistMapping.mockResolvedValue(
        true as never
      );

      const response = await request(app).delete(
        '/api/v1/releases/mappings/Radiohead'
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Artist mapping removed');
    });

    it('should return 404 if mapping not found', async () => {
      mockReleaseTrackingService.removeArtistMapping.mockResolvedValue(
        false as never
      );

      const response = await request(app).delete(
        '/api/v1/releases/mappings/nonexistent'
      );

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('should decode URL-encoded artist names', async () => {
      mockReleaseTrackingService.removeArtistMapping.mockResolvedValue(
        true as never
      );

      await request(app).delete('/api/v1/releases/mappings/The%20Beatles');

      expect(
        mockReleaseTrackingService.removeArtistMapping
      ).toHaveBeenCalledWith('The Beatles');
    });

    it('should handle errors', async () => {
      mockReleaseTrackingService.removeArtistMapping.mockRejectedValue(
        new Error('Error')
      );

      const response = await request(app).delete(
        '/api/v1/releases/mappings/Test'
      );

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/releases/search/artist', () => {
    beforeEach(() => {
      mockReleaseTrackingService.searchArtist = jest.fn().mockResolvedValue([]);
    });

    it('should search for an artist', async () => {
      const mockResults = [{ mbid: 'mbid-1', name: 'Radiohead', score: 100 }];
      mockReleaseTrackingService.searchArtist.mockResolvedValue(
        mockResults as never
      );

      const response = await request(app).get(
        '/api/v1/releases/search/artist?name=Radiohead'
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(mockReleaseTrackingService.searchArtist).toHaveBeenCalledWith(
        'Radiohead'
      );
    });

    it('should return 400 if name is missing', async () => {
      const response = await request(app).get('/api/v1/releases/search/artist');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should handle errors', async () => {
      mockReleaseTrackingService.searchArtist.mockRejectedValue(
        new Error('Error')
      );

      const response = await request(app).get(
        '/api/v1/releases/search/artist?name=Test'
      );

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/releases/check-vinyl', () => {
    beforeEach(() => {
      mockReleaseTrackingService.checkVinylAvailability = jest
        .fn()
        .mockResolvedValue(5);
    });

    it('should check vinyl availability', async () => {
      const response = await request(app).post('/api/v1/releases/check-vinyl');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.checked).toBe(5);
    });

    it('should handle errors', async () => {
      mockReleaseTrackingService.checkVinylAvailability.mockRejectedValue(
        new Error('Error')
      );

      const response = await request(app).post('/api/v1/releases/check-vinyl');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/releases/check-vinyl/:mbid', () => {
    beforeEach(() => {
      mockReleaseTrackingService.checkSingleReleaseVinyl = jest.fn();
    });

    it('should check vinyl for a single release', async () => {
      mockReleaseTrackingService.checkSingleReleaseVinyl.mockResolvedValue({
        mbid: 'mbid-1',
        vinylStatus: 'has_vinyl',
      } as never);

      const response = await request(app).post(
        '/api/v1/releases/check-vinyl/mbid-1'
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return 404 if release not found', async () => {
      mockReleaseTrackingService.checkSingleReleaseVinyl.mockResolvedValue(
        null
      );

      const response = await request(app).post(
        '/api/v1/releases/check-vinyl/nonexistent'
      );

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('should handle errors', async () => {
      mockReleaseTrackingService.checkSingleReleaseVinyl.mockRejectedValue(
        new Error('Error')
      );

      const response = await request(app).post(
        '/api/v1/releases/check-vinyl/mbid-1'
      );

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/releases/fetch-covers', () => {
    beforeEach(() => {
      mockReleaseTrackingService.fetchMissingCoverArt = jest
        .fn()
        .mockResolvedValue(3);
    });

    it('should fetch missing cover art', async () => {
      const response = await request(app).post('/api/v1/releases/fetch-covers');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.updated).toBe(3);
    });

    it('should handle errors', async () => {
      mockReleaseTrackingService.fetchMissingCoverArt.mockRejectedValue(
        new Error('Error')
      );

      const response = await request(app).post('/api/v1/releases/fetch-covers');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/releases/:mbid/wishlist', () => {
    beforeEach(() => {
      mockReleaseTrackingService.addToWishlist = jest.fn();
    });

    it('should add release to wishlist', async () => {
      mockReleaseTrackingService.addToWishlist.mockResolvedValue(true as never);

      const response = await request(app).post(
        '/api/v1/releases/mbid-1/wishlist'
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Added to wishlist');
    });

    it('should return 400 if release cannot be added', async () => {
      mockReleaseTrackingService.addToWishlist.mockResolvedValue(
        false as never
      );

      const response = await request(app).post(
        '/api/v1/releases/mbid-1/wishlist'
      );

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should handle errors', async () => {
      mockReleaseTrackingService.addToWishlist.mockRejectedValue(
        new Error('Error')
      );

      const response = await request(app).post(
        '/api/v1/releases/mbid-1/wishlist'
      );

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/releases/collection-artists', () => {
    beforeEach(() => {
      mockReleaseTrackingService.getCollectionArtists = jest
        .fn()
        .mockResolvedValue([]);
    });

    it('should return collection artists', async () => {
      const mockArtists = ['Radiohead', 'Boards of Canada'];
      mockReleaseTrackingService.getCollectionArtists.mockResolvedValue(
        mockArtists as never
      );

      const response = await request(app).get(
        '/api/v1/releases/collection-artists'
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.total).toBe(2);
    });

    it('should return 401 when no Discogs username', async () => {
      mockAuthService.getUserSettings.mockResolvedValue({
        discogs: { username: '' },
        lastfm: {},
        preferences: {
          defaultTimestamp: 'now' as const,
          batchSize: 50,
          autoScrobble: false,
        },
      });

      const response = await request(app).get(
        '/api/v1/releases/collection-artists'
      );

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should handle errors', async () => {
      mockReleaseTrackingService.getCollectionArtists.mockRejectedValue(
        new Error('Error')
      );

      const response = await request(app).get(
        '/api/v1/releases/collection-artists'
      );

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });
});
