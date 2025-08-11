import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import request from 'supertest';

import createCollectionRouter from '../../../src/backend/routes/collection';
import { AuthService } from '../../../src/backend/services/authService';
import { DiscogsService } from '../../../src/backend/services/discogsService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';

// Mock dependencies
jest.mock('../../../src/backend/services/discogsService');
jest.mock('../../../src/backend/services/authService');
jest.mock('../../../src/backend/utils/fileStorage');

const MockedDiscogsService = DiscogsService as jest.MockedClass<
  typeof DiscogsService
>;
const MockedAuthService = AuthService as jest.MockedClass<typeof AuthService>;
const MockedFileStorage = FileStorage as jest.MockedClass<typeof FileStorage>;

describe('Collection Routes', () => {
  let app: express.Application;
  let mockDiscogsService: jest.Mocked<DiscogsService>;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockFileStorage: jest.Mocked<FileStorage>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock instances
    mockFileStorage = new MockedFileStorage('test') as jest.Mocked<FileStorage>;
    mockAuthService = new MockedAuthService(
      mockFileStorage
    ) as jest.Mocked<AuthService>;
    mockDiscogsService = new MockedDiscogsService(
      mockFileStorage,
      mockAuthService
    ) as jest.Mocked<DiscogsService>;

    // Setup mock methods
    mockDiscogsService.isCacheValid = jest.fn();
    mockDiscogsService.searchCollectionFromCache = jest.fn();
    mockDiscogsService.getCacheProgress = jest.fn();
    mockDiscogsService.clearCache = jest.fn();
    mockDiscogsService.getUserCollection = jest.fn();

    // Create Express app with mocked services
    app = express();
    app.use(helmet());
    app.use(cors());
    app.use(express.json());

    // Add the mocked services to app.locals
    app.locals.discogsService = mockDiscogsService;
    app.locals.authService = mockAuthService;
    app.locals.fileStorage = mockFileStorage;

    // Mount collection routes
    app.use(
      '/api/v1/collection',
      createCollectionRouter(
        mockFileStorage,
        mockAuthService,
        mockDiscogsService
      )
    );
  });

  describe('GET /:username', () => {
    it('should get user collection successfully', async () => {
      const mockCollection = {
        success: true,
        data: [
          {
            id: 1,
            release: {
              id: 123,
              title: 'Test Album',
              artist: 'Test Artist',
              format: ['Vinyl'],
              label: ['Test Label'],
              resource_url: 'test-url',
            },
            folder_id: 1,
            date_added: '2023-01-01',
          },
        ],
        pagination: {
          page: 1,
          pages: 1,
          per_page: 50,
          items: 1,
        },
      };

      mockDiscogsService.getUserCollection.mockResolvedValue(mockCollection);

      const response = await request(app)
        .get('/api/v1/collection/testuser')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockCollection.data);
      expect(mockDiscogsService.getUserCollection).toHaveBeenCalledWith(
        'testuser',
        1,
        50,
        false
      );
    });

    it('should handle pagination parameters', async () => {
      const mockCollection = {
        success: true,
        data: [],
        pagination: { page: 2, pages: 5, per_page: 25, items: 0 },
      };

      mockDiscogsService.getUserCollection.mockResolvedValue(mockCollection);

      const response = await request(app)
        .get('/api/v1/collection/testuser')
        .query({ page: 2, per_page: 25, force_reload: true })
        .expect(200);

      expect(mockDiscogsService.getUserCollection).toHaveBeenCalledWith(
        'testuser',
        2,
        25,
        true
      );
    });

    it('should handle service errors', async () => {
      mockDiscogsService.getUserCollection.mockRejectedValue(
        new Error('Collection error')
      );

      const response = await request(app)
        .get('/api/v1/collection/testuser')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Collection error');
    });

    it('should validate username parameter', async () => {
      const response = await request(app)
        .get('/api/v1/collection/')
        .expect(404);
    });
  });

  describe('GET /:username/all', () => {
    it('should get entire collection from cached pages', async () => {
      const mockCachedPage1 = {
        timestamp: Date.now(),
        data: [
          {
            id: 1,
            release: {
              id: 123,
              title: 'Test Album',
              artist: 'Test Artist',
              format: ['Vinyl'],
              label: ['Test Label'],
              resource_url: 'test-url',
            },
            folder_id: 1,
            date_added: '2023-01-01',
          },
        ],
      };

      const mockCachedPage2 = {
        timestamp: Date.now(),
        data: [
          {
            id: 2,
            release: {
              id: 124,
              title: 'Test Album 2',
              artist: 'Test Artist 2',
            },
            folder_id: 1,
            date_added: '2023-01-02',
          },
        ],
      };

      // Mock file storage to return cached pages
      mockFileStorage.readJSON
        .mockResolvedValueOnce(mockCachedPage1) // page 1
        .mockResolvedValueOnce(mockCachedPage2) // page 2
        .mockResolvedValueOnce(null); // no more pages

      // Mock isCacheValid to return true
      mockDiscogsService.isCacheValid.mockReturnValue(true);

      const response = await request(app)
        .get('/api/v1/collection/testuser/all')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.total).toBe(2);
    });

    it('should handle empty cache gracefully', async () => {
      // Mock file storage to return no cached pages
      mockFileStorage.readJSON.mockResolvedValue(null);
      mockDiscogsService.isCacheValid.mockReturnValue(false);

      const response = await request(app)
        .get('/api/v1/collection/testuser/all')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
      expect(response.body.total).toBe(0);
    });
  });

  describe('GET /:username/search', () => {
    it('should search collection successfully', async () => {
      const mockSearchResults = [
        {
          id: 1,
          release: {
            id: 123,
            title: 'Test Album',
            artist: 'Test Artist',
            format: ['Vinyl'],
            label: ['Test Label'],
            resource_url: 'test-url',
          },
          folder_id: 1,
          date_added: '2023-01-01',
        },
      ];

      mockDiscogsService.searchCollection.mockResolvedValue(mockSearchResults);

      const response = await request(app)
        .get('/api/v1/collection/testuser/search')
        .query({ q: 'test query' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockSearchResults);
      expect(mockDiscogsService.searchCollection).toHaveBeenCalledWith(
        'testuser',
        'test query'
      );
    });

    it('should require search query', async () => {
      const response = await request(app)
        .get('/api/v1/collection/testuser/search')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Search query is required');
    });

    it('should handle empty search query', async () => {
      const response = await request(app)
        .get('/api/v1/collection/testuser/search')
        .query({ q: '' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Search query is required');
    });
  });

  describe('GET /:username/search-paginated', () => {
    it('should search collection with pagination', async () => {
      const mockPaginatedResults = {
        items: [
          {
            id: 1,
            release: {
              id: 123,
              title: 'Test Album',
              artist: 'Test Artist',
              format: ['Vinyl'],
              label: ['Test Label'],
              resource_url: 'test-url',
            },
            folder_id: 1,
            date_added: '2023-01-01',
          },
        ],
        total: 1,
        totalPages: 1,
        page: 1,
        perPage: 10,
      };

      mockDiscogsService.searchCollectionFromCache.mockResolvedValue(
        mockPaginatedResults
      );

      const response = await request(app)
        .get('/api/v1/collection/testuser/search-paginated')
        .query({ q: 'test', page: 1, per_page: 10 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockPaginatedResults.items);
      expect(response.body.pagination).toEqual({
        page: 1,
        per_page: 10,
        total: 1,
        pages: 1,
      });
      expect(mockDiscogsService.searchCollectionFromCache).toHaveBeenCalledWith(
        'testuser',
        'test',
        1,
        10
      );
    });

    it('should use default pagination values', async () => {
      const mockResults = {
        items: [],
        total: 0,
        totalPages: 0,
        page: 1,
        perPage: 50,
      };

      mockDiscogsService.searchCollectionFromCache.mockResolvedValue(
        mockResults
      );

      await request(app)
        .get('/api/v1/collection/testuser/search-paginated')
        .query({ q: 'test' })
        .expect(200);

      expect(mockDiscogsService.searchCollectionFromCache).toHaveBeenCalledWith(
        'testuser',
        'test',
        1,
        50
      );
    });
  });

  describe('POST /:username/preload', () => {
    it('should start collection preloading', async () => {
      mockDiscogsService.preloadAllCollectionPages.mockResolvedValue();

      const response = await request(app)
        .post('/api/v1/collection/testuser/preload')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe(
        'Collection preloading started in background'
      );
      expect(mockDiscogsService.preloadAllCollectionPages).toHaveBeenCalledWith(
        'testuser'
      );
    });

    it('should handle preloading errors', async () => {
      // The preload method runs in background and doesn't throw errors to the client
      // The error is logged but the response is still successful
      mockDiscogsService.preloadAllCollectionPages.mockRejectedValue(
        new Error('Preload error')
      );

      const response = await request(app)
        .post('/api/v1/collection/testuser/preload')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe(
        'Collection preloading started in background'
      );
    });
  });

  describe('GET /:username/progress', () => {
    it('should get cache progress', async () => {
      const mockProgress = {
        status: 'loading',
        totalPages: 10,
        currentPage: 5,
        lastUpdated: Date.now(),
      };

      mockDiscogsService.getCacheProgress.mockResolvedValue(mockProgress);

      const response = await request(app)
        .get('/api/v1/collection/testuser/progress')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockProgress);
      expect(mockDiscogsService.getCacheProgress).toHaveBeenCalledWith(
        'testuser'
      );
    });

    it('should handle missing progress data', async () => {
      mockDiscogsService.getCacheProgress.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/v1/collection/testuser/progress')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeNull();
    });
  });

  describe('GET /release/:releaseId', () => {
    it('should get release details', async () => {
      const mockRelease = {
        id: 123,
        title: 'Test Album',
        artist: 'Test Artist',
        tracklist: [
          { position: '1', title: 'Track 1' },
          { position: '2', title: 'Track 2' },
        ],
        format: ['Vinyl'],
        label: ['Test Label'],
        resource_url: 'test-url',
      };

      mockDiscogsService.getReleaseDetails.mockResolvedValue(mockRelease);

      const response = await request(app)
        .get('/api/v1/collection/release/123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockRelease);
      expect(mockDiscogsService.getReleaseDetails).toHaveBeenCalledWith(123);
    });

    it('should handle invalid release ID', async () => {
      const response = await request(app)
        .get('/api/v1/collection/release/invalid')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid release ID');
    });

    it('should handle release not found', async () => {
      mockDiscogsService.getReleaseDetails.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/v1/collection/release/999')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Release not found');
    });
  });

  describe('DELETE /cache', () => {
    it('should clear collection cache', async () => {
      mockDiscogsService.clearCache.mockResolvedValue();

      const response = await request(app)
        .delete('/api/v1/collection/cache')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Collection cache cleared');
      expect(mockDiscogsService.clearCache).toHaveBeenCalledTimes(1);
    });

    it('should handle cache clearing errors', async () => {
      mockDiscogsService.clearCache.mockRejectedValue(new Error('Clear error'));

      const response = await request(app)
        .delete('/api/v1/collection/cache')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Clear error');
    });
  });
});
