import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import request from 'supertest';

import createWishlistRouter from '../../../src/backend/routes/wishlist';
import { AuthService } from '../../../src/backend/services/authService';
import { WishlistService } from '../../../src/backend/services/wishlistService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';

// Mock dependencies
jest.mock('../../../src/backend/services/authService');
jest.mock('../../../src/backend/services/wishlistService');
jest.mock('../../../src/backend/utils/fileStorage');

const MockedAuthService = AuthService as jest.MockedClass<typeof AuthService>;
const MockedWishlistService = WishlistService as jest.MockedClass<
  typeof WishlistService
>;
const MockedFileStorage = FileStorage as jest.MockedClass<typeof FileStorage>;

describe('Wishlist Routes', () => {
  let app: express.Application;
  let mockFileStorage: jest.Mocked<FileStorage>;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockWishlistService: jest.Mocked<WishlistService>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock instances
    mockFileStorage = new MockedFileStorage('test') as jest.Mocked<FileStorage>;
    mockAuthService = new MockedAuthService(
      mockFileStorage
    ) as jest.Mocked<AuthService>;
    mockWishlistService = new MockedWishlistService(
      mockFileStorage,
      mockAuthService
    ) as jest.Mocked<WishlistService>;

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

    // Wishlist service mocks
    mockWishlistService.getWishlistItems = jest.fn().mockResolvedValue([
      {
        id: 1,
        masterId: 12345,
        releaseId: 67890,
        artist: 'Test Artist',
        title: 'Test Album',
        year: 2024,
        coverImage: 'https://example.com/cover.jpg',
        dateAdded: '2024-01-15',
        vinylStatus: 'has_vinyl',
        vinylVersions: [],
        lowestVinylPrice: 25.0,
        priceCurrency: 'USD',
      },
    ]);

    mockWishlistService.getSyncStatus = jest.fn().mockResolvedValue({
      schemaVersion: 1,
      status: 'idle',
      progress: 0,
      itemsProcessed: 0,
      totalItems: 0,
      vinylChecked: 0,
      lastSyncTimestamp: Date.now(),
    });

    mockWishlistService.syncWishlist = jest.fn().mockResolvedValue({
      schemaVersion: 1,
      status: 'syncing',
      progress: 0,
      itemsProcessed: 0,
      totalItems: 10,
      vinylChecked: 0,
    });

    mockWishlistService.getMasterVersions = jest.fn().mockResolvedValue([
      {
        releaseId: 111,
        title: 'Vinyl Version',
        format: ['Vinyl', 'LP'],
        label: 'Test Label',
        country: 'US',
        year: 2024,
        hasVinyl: true,
      },
      {
        releaseId: 222,
        title: 'CD Version',
        format: ['CD'],
        label: 'Test Label',
        country: 'UK',
        year: 2023,
        hasVinyl: false,
      },
    ]);

    mockWishlistService.getMarketplaceStats = jest.fn().mockResolvedValue({
      lowestPrice: 20.0,
      medianPrice: 30.0,
      highestPrice: 50.0,
      numForSale: 15,
      currency: 'USD',
      lastFetched: Date.now(),
    });

    mockWishlistService.getSettings = jest.fn().mockResolvedValue({
      schemaVersion: 1,
      priceThreshold: 40,
      currency: 'USD',
      autoSyncInterval: 7,
      notifyOnVinylAvailable: true,
    });

    mockWishlistService.saveSettings = jest
      .fn()
      .mockImplementation(settings => ({
        schemaVersion: 1,
        priceThreshold: settings.priceThreshold ?? 40,
        currency: settings.currency ?? 'USD',
        autoSyncInterval: settings.autoSyncInterval ?? 7,
        notifyOnVinylAvailable: settings.notifyOnVinylAvailable ?? true,
      }));

    // Local want list mocks
    mockWishlistService.getLocalWantList = jest.fn().mockResolvedValue([
      {
        id: 'test-id-1',
        artist: 'Local Artist',
        album: 'Local Album',
        playCount: 5,
        lastPlayed: Date.now(),
        addedAt: Date.now(),
        source: 'discovery',
        vinylStatus: 'unknown',
        notified: false,
      },
    ]);

    mockWishlistService.addToLocalWantList = jest
      .fn()
      .mockImplementation(item => ({
        id: 'generated-id',
        ...item,
        addedAt: Date.now(),
        source: 'discovery',
        vinylStatus: 'unknown',
        notified: false,
      }));

    mockWishlistService.removeFromLocalWantList = jest
      .fn()
      .mockResolvedValue(true);

    mockWishlistService.checkLocalWantListForVinyl = jest
      .fn()
      .mockResolvedValue([
        {
          id: 'test-id-2',
          artist: 'Newly Available Artist',
          album: 'Newly Available Album',
          playCount: 10,
          lastPlayed: Date.now(),
          addedAt: Date.now() - 86400000,
          source: 'discovery',
          masterId: 33333,
          vinylStatus: 'has_vinyl',
          vinylAvailableSince: Date.now(),
          notified: false,
        },
      ]);

    // Feature 5.5: New release tracking mocks
    mockWishlistService.getNewReleases = jest.fn().mockResolvedValue({
      schemaVersion: 1,
      lastCheck: Date.now() - 3600000,
      releases: [
        {
          id: '12345-67890',
          masterId: 12345,
          releaseId: 67890,
          title: 'Test Album (2024 Remaster)',
          artist: 'Test Artist',
          year: 2024,
          country: 'Europe',
          format: ['LP', 'Album', 'Reissue'],
          label: 'Test Label',
          lowestPrice: 29.99,
          priceCurrency: 'USD',
          numForSale: 5,
          source: 'wishlist',
          sourceItemId: 1,
          detectedAt: Date.now() - 86400000,
          notified: false,
          dismissed: false,
          discogsUrl: 'https://www.discogs.com/release/67890',
        },
      ],
    });

    mockWishlistService.getNewReleaseSyncStatus = jest.fn().mockResolvedValue({
      status: 'idle',
      lastFullCheck: Date.now() - 86400000,
      mastersProcessed: 0,
      totalMasters: 50,
      newReleasesFound: 1,
      lastCheckedIndex: 0,
      progress: 0,
    });

    mockWishlistService.checkForNewReleases = jest.fn().mockResolvedValue([]);
    mockWishlistService.dismissNewRelease = jest
      .fn()
      .mockResolvedValue(undefined);
    mockWishlistService.dismissNewReleasesBulk = jest.fn().mockResolvedValue(3);
    mockWishlistService.dismissAllNewReleases = jest.fn().mockResolvedValue(5);
    mockWishlistService.cleanupDismissedReleases = jest
      .fn()
      .mockResolvedValue(5);

    // Create Express app
    app = express();
    app.use(helmet());
    app.use(cors());
    app.use(express.json());

    // Mount wishlist routes
    app.use(
      '/api/v1/wishlist',
      createWishlistRouter(
        mockFileStorage,
        mockAuthService,
        mockWishlistService
      )
    );
  });

  describe('GET /api/v1/wishlist', () => {
    it('should return wishlist items', async () => {
      // Act
      const response = await request(app).get('/api/v1/wishlist');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.total).toBe(1);
      expect(response.body.data[0].artist).toBe('Test Artist');
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockWishlistService.getWishlistItems.mockRejectedValue(
        new Error('Database error')
      );

      // Act
      const response = await request(app).get('/api/v1/wishlist');

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Database error');
    });
  });

  describe('GET /api/v1/wishlist/sync', () => {
    it('should return sync status', async () => {
      // Act
      const response = await request(app).get('/api/v1/wishlist/sync');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('idle');
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockWishlistService.getSyncStatus.mockRejectedValue(
        new Error('Status error')
      );

      // Act
      const response = await request(app).get('/api/v1/wishlist/sync');

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/wishlist/sync', () => {
    it('should start sync when authenticated', async () => {
      // Act
      const response = await request(app).post('/api/v1/wishlist/sync');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Wishlist sync completed');
      expect(mockWishlistService.syncWishlist).toHaveBeenCalledWith(
        'testuser',
        false
      );
    });

    it('should return 401 when not authenticated', async () => {
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
      const response = await request(app).post('/api/v1/wishlist/sync');

      // Assert
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Discogs authentication required');
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockWishlistService.syncWishlist.mockRejectedValue(
        new Error('Sync error')
      );

      // Act
      const response = await request(app).post('/api/v1/wishlist/sync');

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/wishlist/:masterId/versions', () => {
    it('should return master versions', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/wishlist/12345/versions'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.total).toBe(2);
      expect(response.body.vinylCount).toBe(1);
      expect(mockWishlistService.getMasterVersions).toHaveBeenCalledWith(12345);
    });

    it('should return 400 for invalid master ID', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/wishlist/invalid/versions'
      );

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid master ID');
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockWishlistService.getMasterVersions.mockRejectedValue(
        new Error('Version error')
      );

      // Act
      const response = await request(app).get(
        '/api/v1/wishlist/12345/versions'
      );

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/wishlist/:releaseId/marketplace', () => {
    it('should return marketplace stats', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/wishlist/67890/marketplace'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.lowestPrice).toBe(20.0);
      expect(response.body.data.numForSale).toBe(15);
    });

    it('should return 400 for invalid release ID', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/wishlist/abc/marketplace'
      );

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid release ID');
    });

    it('should return 404 when stats not available', async () => {
      // Arrange
      mockWishlistService.getMarketplaceStats.mockResolvedValue(null);

      // Act
      const response = await request(app).get(
        '/api/v1/wishlist/99999/marketplace'
      );

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Marketplace stats not available');
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockWishlistService.getMarketplaceStats.mockRejectedValue(
        new Error('Marketplace error')
      );

      // Act
      const response = await request(app).get(
        '/api/v1/wishlist/67890/marketplace'
      );

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/wishlist/settings', () => {
    it('should return wishlist settings', async () => {
      // Act
      const response = await request(app).get('/api/v1/wishlist/settings');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.priceThreshold).toBe(40);
      expect(response.body.data.currency).toBe('USD');
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockWishlistService.getSettings.mockRejectedValue(
        new Error('Settings error')
      );

      // Act
      const response = await request(app).get('/api/v1/wishlist/settings');

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/wishlist/settings', () => {
    it('should save wishlist settings', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/wishlist/settings')
        .send({
          priceThreshold: 50,
          currency: 'EUR',
          autoSyncInterval: 14,
          notifyOnVinylAvailable: false,
        });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockWishlistService.saveSettings).toHaveBeenCalledWith({
        priceThreshold: 50,
        currency: 'EUR',
        autoSyncInterval: 14,
        notifyOnVinylAvailable: false,
      });
    });

    it('should handle partial settings update', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/wishlist/settings')
        .send({
          priceThreshold: 30,
        });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockWishlistService.saveSettings).toHaveBeenCalledWith({
        priceThreshold: 30,
        currency: undefined,
        autoSyncInterval: undefined,
        notifyOnVinylAvailable: undefined,
      });
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockWishlistService.saveSettings.mockRejectedValue(
        new Error('Save error')
      );

      // Act
      const response = await request(app)
        .post('/api/v1/wishlist/settings')
        .send({ priceThreshold: 50 });

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  // ============================================
  // Local Want List Routes
  // ============================================

  describe('GET /api/v1/wishlist/local', () => {
    it('should return local want list items', async () => {
      // Act
      const response = await request(app).get('/api/v1/wishlist/local');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.total).toBe(1);
      expect(response.body.data[0].artist).toBe('Local Artist');
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockWishlistService.getLocalWantList.mockRejectedValue(
        new Error('Local want list error')
      );

      // Act
      const response = await request(app).get('/api/v1/wishlist/local');

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/wishlist/local', () => {
    it('should add item to local want list', async () => {
      // Act
      const response = await request(app).post('/api/v1/wishlist/local').send({
        artist: 'New Artist',
        album: 'New Album',
        playCount: 3,
        lastPlayed: Date.now(),
      });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Added to local want list');
      expect(mockWishlistService.addToLocalWantList).toHaveBeenCalledWith(
        expect.objectContaining({
          artist: 'New Artist',
          album: 'New Album',
          playCount: 3,
        })
      );
    });

    it('should return 400 when required fields missing', async () => {
      // Act - missing album
      const response = await request(app)
        .post('/api/v1/wishlist/local')
        .send({ artist: 'Artist Only' });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('artist and album are required');
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockWishlistService.addToLocalWantList.mockRejectedValue(
        new Error('Add error')
      );

      // Act
      const response = await request(app).post('/api/v1/wishlist/local').send({
        artist: 'Test Artist',
        album: 'Test Album',
      });

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/v1/wishlist/local/:id', () => {
    it('should remove item from local want list', async () => {
      // Act
      const response = await request(app).delete(
        '/api/v1/wishlist/local/test-id-1'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Removed from local want list');
      expect(mockWishlistService.removeFromLocalWantList).toHaveBeenCalledWith(
        'test-id-1'
      );
    });

    it('should return 404 when item not found', async () => {
      // Arrange
      mockWishlistService.removeFromLocalWantList.mockResolvedValue(false);

      // Act
      const response = await request(app).delete(
        '/api/v1/wishlist/local/nonexistent'
      );

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Item not found in local want list');
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockWishlistService.removeFromLocalWantList.mockRejectedValue(
        new Error('Remove error')
      );

      // Act
      const response = await request(app).delete(
        '/api/v1/wishlist/local/test-id-1'
      );

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/wishlist/local/check', () => {
    it('should check local want list for newly available vinyl', async () => {
      // Act
      const response = await request(app).post('/api/v1/wishlist/local/check');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.newlyAvailableCount).toBe(1);
      expect(response.body.data[0].artist).toBe('Newly Available Artist');
    });

    it('should return empty array when no new vinyl found', async () => {
      // Arrange
      mockWishlistService.checkLocalWantListForVinyl.mockResolvedValue([]);

      // Act
      const response = await request(app).post('/api/v1/wishlist/local/check');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
      expect(response.body.newlyAvailableCount).toBe(0);
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockWishlistService.checkLocalWantListForVinyl.mockRejectedValue(
        new Error('Check error')
      );

      // Act
      const response = await request(app).post('/api/v1/wishlist/local/check');

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  // ============================================
  // Feature 5.5: New Release Tracking Routes
  // ============================================

  describe('GET /api/v1/wishlist/new-releases', () => {
    it('should return new releases', async () => {
      // Act
      const response = await request(app).get('/api/v1/wishlist/new-releases');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.releases).toHaveLength(1);
      expect(response.body.data.releases[0].artist).toBe('Test Artist');
      expect(response.body.data.count).toBe(1);
      expect(mockWishlistService.getNewReleases).toHaveBeenCalled();
    });

    it('should filter by source', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/wishlist/new-releases?source=wishlist'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.releases).toHaveLength(1);
    });

    it('should filter by days', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/wishlist/new-releases?days=7'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should filter out dismissed by default', async () => {
      // Arrange
      mockWishlistService.getNewReleases.mockResolvedValue({
        schemaVersion: 1,
        lastCheck: Date.now(),
        releases: [
          {
            id: '12345-67890',
            masterId: 12345,
            releaseId: 67890,
            title: 'Dismissed Album',
            artist: 'Test Artist',
            year: 2024,
            country: 'EU',
            format: ['LP'],
            label: 'Label',
            source: 'wishlist',
            sourceItemId: 1,
            detectedAt: Date.now(),
            notified: false,
            dismissed: true,
            discogsUrl: 'https://discogs.com/release/67890',
          },
        ],
      });

      // Act
      const response = await request(app).get('/api/v1/wishlist/new-releases');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.releases).toHaveLength(0);
    });

    it('should include dismissed when showDismissed=true', async () => {
      // Arrange
      mockWishlistService.getNewReleases.mockResolvedValue({
        schemaVersion: 1,
        lastCheck: Date.now(),
        releases: [
          {
            id: '12345-67890',
            masterId: 12345,
            releaseId: 67890,
            title: 'Dismissed Album',
            artist: 'Test Artist',
            year: 2024,
            country: 'EU',
            format: ['LP'],
            label: 'Label',
            source: 'wishlist',
            sourceItemId: 1,
            detectedAt: Date.now(),
            notified: false,
            dismissed: true,
            discogsUrl: 'https://discogs.com/release/67890',
          },
        ],
      });

      // Act
      const response = await request(app).get(
        '/api/v1/wishlist/new-releases?showDismissed=true'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.releases).toHaveLength(1);
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockWishlistService.getNewReleases.mockRejectedValue(
        new Error('Database error')
      );

      // Act
      const response = await request(app).get('/api/v1/wishlist/new-releases');

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/wishlist/new-releases/status', () => {
    it('should return sync status', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/wishlist/new-releases/status'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('idle');
      expect(response.body.data.totalMasters).toBe(50);
      expect(mockWishlistService.getNewReleaseSyncStatus).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockWishlistService.getNewReleaseSyncStatus.mockRejectedValue(
        new Error('Status error')
      );

      // Act
      const response = await request(app).get(
        '/api/v1/wishlist/new-releases/status'
      );

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/wishlist/new-releases/check', () => {
    it('should start new release check', async () => {
      // Act
      const response = await request(app).post(
        '/api/v1/wishlist/new-releases/check'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Check started');
      // Note: checkForNewReleases is called asynchronously
    });

    it('should handle errors gracefully', async () => {
      // Note: Even if the background check fails, the route should return 200
      // because it returns immediately before the check starts
      mockWishlistService.checkForNewReleases.mockRejectedValue(
        new Error('Check error')
      );

      // Act
      const response = await request(app).post(
        '/api/v1/wishlist/new-releases/check'
      );

      // Assert
      expect(response.status).toBe(200);
    });
  });

  describe('PATCH /api/v1/wishlist/new-releases/:id/dismiss', () => {
    it('should dismiss a new release', async () => {
      // Act
      const response = await request(app).patch(
        '/api/v1/wishlist/new-releases/12345-67890/dismiss'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockWishlistService.dismissNewRelease).toHaveBeenCalledWith(
        '12345-67890'
      );
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockWishlistService.dismissNewRelease.mockRejectedValue(
        new Error('Dismiss error')
      );

      // Act
      const response = await request(app).patch(
        '/api/v1/wishlist/new-releases/12345-67890/dismiss'
      );

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/wishlist/new-releases/dismiss-bulk', () => {
    it('should dismiss multiple releases', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/wishlist/new-releases/dismiss-bulk')
        .send({ ids: ['id1', 'id2', 'id3'] });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.dismissed).toBe(3);
      expect(mockWishlistService.dismissNewReleasesBulk).toHaveBeenCalledWith([
        'id1',
        'id2',
        'id3',
      ]);
    });

    it('should return 400 when ids is missing', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/wishlist/new-releases/dismiss-bulk')
        .send({});

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('ids array is required');
    });

    it('should return 400 when ids is not an array', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/wishlist/new-releases/dismiss-bulk')
        .send({ ids: 'not-an-array' });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('ids array is required');
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockWishlistService.dismissNewReleasesBulk.mockRejectedValue(
        new Error('Bulk dismiss error')
      );

      // Act
      const response = await request(app)
        .post('/api/v1/wishlist/new-releases/dismiss-bulk')
        .send({ ids: ['id1'] });

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/wishlist/new-releases/dismiss-all', () => {
    it('should dismiss all new releases', async () => {
      // Act
      const response = await request(app).post(
        '/api/v1/wishlist/new-releases/dismiss-all'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.dismissed).toBe(5);
      expect(mockWishlistService.dismissAllNewReleases).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockWishlistService.dismissAllNewReleases.mockRejectedValue(
        new Error('Dismiss all error')
      );

      // Act
      const response = await request(app).post(
        '/api/v1/wishlist/new-releases/dismiss-all'
      );

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/wishlist/new-releases/cleanup', () => {
    it('should cleanup old dismissed releases with default age', async () => {
      // Act
      const response = await request(app).post(
        '/api/v1/wishlist/new-releases/cleanup'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.removed).toBe(5);
      expect(mockWishlistService.cleanupDismissedReleases).toHaveBeenCalledWith(
        90
      );
    });

    it('should cleanup with custom max age', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/wishlist/new-releases/cleanup')
        .send({ maxAgeDays: 30 });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockWishlistService.cleanupDismissedReleases).toHaveBeenCalledWith(
        30
      );
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockWishlistService.cleanupDismissedReleases.mockRejectedValue(
        new Error('Cleanup error')
      );

      // Act
      const response = await request(app).post(
        '/api/v1/wishlist/new-releases/cleanup'
      );

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });
});
