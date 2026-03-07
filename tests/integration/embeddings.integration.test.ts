/**
 * Integration tests for the embeddings API routes.
 *
 * Uses supertest against a real Express app. All external dependencies
 * (CollectionIndexerService, EmbeddingStorageService, etc.) are mocked.
 */

import request from 'supertest';

import { createEmbeddingsRouter } from '../../src/backend/routes/embeddings';
import { AuthService } from '../../src/backend/services/authService';
import { CollectionIndexerService } from '../../src/backend/services/collectionIndexerService';
import { DiscogsService } from '../../src/backend/services/discogsService';
import { EmbeddingStorageService } from '../../src/backend/services/embeddingStorageService';
import { ProfileBuilderService } from '../../src/backend/services/profileBuilderService';
import { FileStorage } from '../../src/backend/utils/fileStorage';
import { createMockEmbeddingStatus } from '../fixtures/embeddingFixtures';
import { createTestApp } from '../utils/testHelpers';

jest.mock('../../src/backend/services/collectionIndexerService');
jest.mock('../../src/backend/services/embeddingStorageService');
jest.mock('../../src/backend/services/profileBuilderService');
jest.mock('../../src/backend/services/discogsService');
jest.mock('../../src/backend/services/authService');
jest.mock('../../src/backend/utils/fileStorage');

const MockedCollectionIndexerService =
  CollectionIndexerService as jest.MockedClass<typeof CollectionIndexerService>;
const MockedEmbeddingStorageService =
  EmbeddingStorageService as jest.MockedClass<typeof EmbeddingStorageService>;
const MockedProfileBuilderService = ProfileBuilderService as jest.MockedClass<
  typeof ProfileBuilderService
>;
const MockedDiscogsService = DiscogsService as jest.MockedClass<
  typeof DiscogsService
>;
const MockedAuthService = AuthService as jest.MockedClass<typeof AuthService>;
const MockedFileStorage = FileStorage as jest.MockedClass<typeof FileStorage>;

describe('Embeddings Routes (Integration)', () => {
  let mockCollectionIndexer: jest.Mocked<CollectionIndexerService>;
  let mockEmbeddingStorage: jest.Mocked<EmbeddingStorageService>;
  let mockProfileBuilder: jest.Mocked<ProfileBuilderService>;
  let mockDiscogsService: jest.Mocked<DiscogsService>;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockFileStorage: jest.Mocked<FileStorage>;

  const mockStatus = createMockEmbeddingStatus();

  // A minimal collection page for the cache
  const mockCollectionPage = {
    data: [
      {
        id: 1,
        release: {
          id: 12345,
          title: 'OK Computer',
          artist: 'Radiohead',
          year: 1997,
          format: ['Vinyl'],
          label: ['Parlophone'],
          resource_url: '',
        },
        date_added: '2024-01-01',
      },
    ],
    timestamp: Date.now(),
  };

  function buildApp() {
    return createTestApp({
      mountPath: '/api/v1/embeddings',
      routerFactory: () =>
        createEmbeddingsRouter(
          mockCollectionIndexer,
          mockEmbeddingStorage,
          mockProfileBuilder,
          mockDiscogsService,
          mockAuthService,
          mockFileStorage
        ),
      mocks: {},
    }).app;
  }

  beforeEach(() => {
    mockCollectionIndexer = new MockedCollectionIndexerService(
      {} as never,
      {} as never
    ) as jest.Mocked<CollectionIndexerService>;

    mockEmbeddingStorage = new MockedEmbeddingStorageService(
      {} as never
    ) as jest.Mocked<EmbeddingStorageService>;

    mockProfileBuilder = new MockedProfileBuilderService(
      {} as never,
      {} as never,
      {} as never
    ) as jest.Mocked<ProfileBuilderService>;

    mockDiscogsService = new MockedDiscogsService(
      {} as never,
      {} as never
    ) as jest.Mocked<DiscogsService>;

    mockAuthService = new MockedAuthService(
      {} as never
    ) as jest.Mocked<AuthService>;

    mockFileStorage = new MockedFileStorage(
      'test-data'
    ) as jest.Mocked<FileStorage>;

    const defaultPreferences = {
      defaultTimestamp: 'now' as const,
      batchSize: 10,
      autoScrobble: false,
    };

    // Default: authenticated
    mockAuthService.getUserSettings = jest.fn().mockResolvedValue({
      discogs: { username: 'testuser', token: 'tok' },
      lastfm: { username: 'testuser', apiKey: 'key', sessionKey: 'sess' },
      preferences: defaultPreferences,
    });

    // Default: not currently rebuilding
    mockCollectionIndexer.isRebuilding = jest.fn().mockReturnValue(false);
    mockCollectionIndexer.cancelRebuild = jest.fn();

    // Default: collection cache has one page of data
    mockFileStorage.readJSON = jest
      .fn()
      .mockResolvedValueOnce(mockCollectionPage)
      .mockResolvedValue(null);

    // Default: profile builder produces a valid profile
    mockProfileBuilder.buildRecordProfile = jest
      .fn()
      .mockResolvedValue('Artist: Radiohead\nAlbum: OK Computer\nYear: 1997');

    // Default: indexer rebuild succeeds
    mockCollectionIndexer.rebuildAll = jest.fn().mockResolvedValue({
      embedded: 1,
      skipped: 0,
      failed: 0,
    });

    // Default: storage stats
    mockEmbeddingStorage.getStats = jest.fn().mockResolvedValue(mockStatus);
  });

  describe('POST /api/v1/embeddings/rebuild', () => {
    it('should return 200 with status "started" when rebuild begins', async () => {
      // Arrange
      const app = buildApp();

      // Act
      const response = await request(app).post('/api/v1/embeddings/rebuild');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('started');
    });

    it('should return "already_running" when a rebuild is in progress', async () => {
      // Arrange
      mockCollectionIndexer.isRebuilding.mockReturnValue(true);
      const app = buildApp();

      // Act
      const response = await request(app).post('/api/v1/embeddings/rebuild');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('already_running');
    });

    it('should return 401 when Discogs is not authenticated', async () => {
      // Arrange
      mockAuthService.getUserSettings.mockResolvedValue({
        discogs: { username: '', token: '' },
        lastfm: { username: '', apiKey: '', sessionKey: '' },
        preferences: {
          defaultTimestamp: 'now' as const,
          batchSize: 10,
          autoScrobble: false,
        },
      });
      const app = buildApp();

      // Act
      const response = await request(app).post('/api/v1/embeddings/rebuild');

      // Assert
      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Discogs authentication required');
    });

    it('should return 400 when no collection is cached', async () => {
      // Arrange — reset to clear any queued mockResolvedValueOnce calls, then return null always
      mockFileStorage.readJSON.mockReset();
      mockFileStorage.readJSON.mockResolvedValue(null);
      const app = buildApp();

      // Act
      const response = await request(app).post('/api/v1/embeddings/rebuild');

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('No collection found');
    });

    it('should return 500 when auth service throws', async () => {
      // Arrange
      mockAuthService.getUserSettings.mockRejectedValue(
        new Error('Auth error')
      );
      const app = buildApp();

      // Act
      const response = await request(app).post('/api/v1/embeddings/rebuild');

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/embeddings/status', () => {
    it('should return 200 with embedding status', async () => {
      // Arrange
      const app = buildApp();

      // Act
      const response = await request(app).get('/api/v1/embeddings/status');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.totalRecords).toBeDefined();
      expect(response.body.data.isRebuilding).toBeDefined();
    });

    it('should report isRebuilding = true when rebuild is running', async () => {
      // Arrange
      mockCollectionIndexer.isRebuilding.mockReturnValue(true);
      const app = buildApp();

      // Act
      const response = await request(app).get('/api/v1/embeddings/status');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.isRebuilding).toBe(true);
    });

    it('should include staleRecords and embeddedRecords in response', async () => {
      // Arrange
      const app = buildApp();

      // Act
      const response = await request(app).get('/api/v1/embeddings/status');

      // Assert
      expect(response.body.data.staleRecords).toBeDefined();
      expect(response.body.data.embeddedRecords).toBeDefined();
    });

    it('should return 500 when storage throws', async () => {
      // Arrange
      mockEmbeddingStorage.getStats.mockRejectedValue(
        new Error('Storage error')
      );
      const app = buildApp();

      // Act
      const response = await request(app).get('/api/v1/embeddings/status');

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/embeddings/cancel', () => {
    it('should return 200 with cancellation_requested when rebuild is running', async () => {
      // Arrange
      mockCollectionIndexer.isRebuilding.mockReturnValue(true);
      const app = buildApp();

      // Act
      const response = await request(app).post('/api/v1/embeddings/cancel');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('cancellation_requested');
      expect(mockCollectionIndexer.cancelRebuild).toHaveBeenCalled();
    });

    it('should return 400 when no rebuild is running', async () => {
      // Arrange
      mockCollectionIndexer.isRebuilding.mockReturnValue(false);
      const app = buildApp();

      // Act
      const response = await request(app).post('/api/v1/embeddings/cancel');

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('No rebuild is currently running');
    });
  });

  describe('POST /api/v1/embeddings/refresh/:releaseId', () => {
    beforeEach(() => {
      mockCollectionIndexer.indexSingle = jest
        .fn()
        .mockResolvedValue(undefined);
    });

    it('should return 200 when a valid release is refreshed', async () => {
      // Arrange
      const app = buildApp();

      // Act
      const response = await request(app).post(
        '/api/v1/embeddings/refresh/12345'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return 400 for an invalid release ID', async () => {
      // Arrange
      const app = buildApp();

      // Act
      const response = await request(app).post(
        '/api/v1/embeddings/refresh/not-a-number'
      );

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid releaseId');
    });

    it('should return 401 when Discogs is not authenticated', async () => {
      // Arrange
      mockAuthService.getUserSettings.mockResolvedValue({
        discogs: { username: '', token: '' },
        lastfm: { username: '', apiKey: '', sessionKey: '' },
        preferences: {
          defaultTimestamp: 'now' as const,
          batchSize: 10,
          autoScrobble: false,
        },
      });
      const app = buildApp();

      // Act
      const response = await request(app).post(
        '/api/v1/embeddings/refresh/12345'
      );

      // Assert
      expect(response.status).toBe(401);
    });

    it('should return 404 when release is not in the collection cache', async () => {
      // Arrange — reset queue and provide a page with a different release ID
      mockFileStorage.readJSON.mockReset();
      mockFileStorage.readJSON
        .mockResolvedValueOnce({
          data: [
            {
              id: 1,
              release: {
                id: 99999, // Different ID — not 12345
                title: 'Other Album',
                artist: 'Other Artist',
                format: [],
                label: [],
                resource_url: '',
              },
              date_added: '2024-01-01',
            },
          ],
          timestamp: Date.now(),
        })
        .mockResolvedValue(null);
      const app = buildApp();

      // Act
      const response = await request(app).post(
        '/api/v1/embeddings/refresh/12345'
      );

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found in collection cache');
    });
  });
});
