import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import request from 'supertest';

import createSellersRouter from '../../../src/backend/routes/sellers';
import { AuthService } from '../../../src/backend/services/authService';
import { SellerMonitoringService } from '../../../src/backend/services/sellerMonitoringService';
import { WishlistService } from '../../../src/backend/services/wishlistService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';
import {
  MonitoredSeller,
  SellerMatch,
  SellerMonitoringSettings,
  SellerScanStatus,
} from '../../../src/shared/types';

// Mock dependencies
jest.mock('../../../src/backend/services/authService');
jest.mock('../../../src/backend/services/sellerMonitoringService');
jest.mock('../../../src/backend/services/wishlistService');
jest.mock('../../../src/backend/utils/fileStorage');

const MockedAuthService = AuthService as jest.MockedClass<typeof AuthService>;
const MockedSellerMonitoringService =
  SellerMonitoringService as jest.MockedClass<typeof SellerMonitoringService>;
const MockedWishlistService = WishlistService as jest.MockedClass<
  typeof WishlistService
>;
const MockedFileStorage = FileStorage as jest.MockedClass<typeof FileStorage>;

// Helper to create a complete SellerMatch object
function createMatch(partial: Partial<SellerMatch>): SellerMatch {
  return {
    id: '123',
    sellerId: 'TestShop',
    releaseId: 111,
    masterId: 222,
    artist: 'Test Artist',
    title: 'Test Album',
    format: ['LP'],
    condition: 'VG+/VG+',
    price: 25,
    currency: 'USD',
    listingUrl: 'https://discogs.com/sell/item/123',
    listingId: 123,
    dateFound: Date.now(),
    notified: false,
    status: 'active',
    ...partial,
  };
}

// Helper to create a complete MonitoredSeller object
function createSeller(partial: Partial<MonitoredSeller>): MonitoredSeller {
  return {
    username: 'testshop',
    displayName: 'Test Shop',
    addedAt: Date.now(),
    matchCount: 0,
    ...partial,
  };
}

describe('Sellers Routes', () => {
  let app: express.Application;
  let mockFileStorage: jest.Mocked<FileStorage>;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockWishlistService: jest.Mocked<WishlistService>;
  let mockSellerMonitoringService: jest.Mocked<SellerMonitoringService>;

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
    mockSellerMonitoringService = new MockedSellerMonitoringService(
      mockFileStorage,
      mockAuthService,
      mockWishlistService
    ) as jest.Mocked<SellerMonitoringService>;

    // Setup default mocks
    mockSellerMonitoringService.getSellers = jest.fn().mockResolvedValue([
      createSeller({
        username: 'localvinyl',
        displayName: 'Local Vinyl Shop',
        inventorySize: 500,
        matchCount: 3,
        lastScanned: Date.now() - 3600000,
      }),
    ]);

    mockSellerMonitoringService.addSeller = jest
      .fn()
      .mockImplementation((username, displayName) =>
        createSeller({
          username,
          displayName: displayName || username,
          inventorySize: 100,
        })
      );

    mockSellerMonitoringService.removeSeller = jest
      .fn()
      .mockResolvedValue(true);

    mockSellerMonitoringService.getAllMatches = jest.fn().mockResolvedValue([
      createMatch({
        id: '1001',
        sellerId: 'localvinyl',
        artist: 'The Beatles',
        title: 'Abbey Road',
      }),
    ]);

    mockSellerMonitoringService.getMatchesBySeller = jest
      .fn()
      .mockResolvedValue([
        createMatch({
          id: '1001',
          sellerId: 'localvinyl',
          artist: 'The Beatles',
          title: 'Abbey Road',
        }),
      ]);

    mockSellerMonitoringService.startScan = jest.fn().mockResolvedValue({
      status: 'scanning',
      sellersScanned: 0,
      totalSellers: 1,
      progress: 0,
      newMatches: 0,
    } as SellerScanStatus);

    mockSellerMonitoringService.getScanStatus = jest.fn().mockResolvedValue({
      status: 'completed',
      sellersScanned: 1,
      totalSellers: 1,
      progress: 100,
      newMatches: 2,
      lastScanTimestamp: Date.now(),
    } as SellerScanStatus);

    mockSellerMonitoringService.getSettings = jest.fn().mockResolvedValue({
      schemaVersion: 1,
      scanFrequencyDays: 7,
      quickCheckFrequencyHours: 24,
      notifyOnNewMatch: true,
      vinylFormatsOnly: true,
    } as SellerMonitoringSettings);

    mockSellerMonitoringService.saveSettings = jest
      .fn()
      .mockImplementation(settings => ({
        schemaVersion: 1,
        scanFrequencyDays: settings.scanFrequencyDays ?? 7,
        quickCheckFrequencyHours: settings.quickCheckFrequencyHours ?? 24,
        notifyOnNewMatch: settings.notifyOnNewMatch ?? true,
        vinylFormatsOnly: settings.vinylFormatsOnly ?? true,
      }));

    mockSellerMonitoringService.markMatchAsSeen = jest
      .fn()
      .mockResolvedValue(undefined);
    mockSellerMonitoringService.markMatchAsNotified = jest
      .fn()
      .mockResolvedValue(undefined);

    // Create Express app
    app = express();
    app.use(helmet());
    app.use(cors());
    app.use(express.json());

    // Mount sellers routes
    app.use(
      '/api/v1/sellers',
      createSellersRouter(
        mockFileStorage,
        mockAuthService,
        mockSellerMonitoringService
      )
    );
  });

  describe('GET /api/v1/sellers', () => {
    it('should return list of monitored sellers', async () => {
      const response = await request(app).get('/api/v1/sellers');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.total).toBe(1);
      expect(response.body.data[0].username).toBe('localvinyl');
    });

    it('should handle empty seller list', async () => {
      mockSellerMonitoringService.getSellers.mockResolvedValue([]);

      const response = await request(app).get('/api/v1/sellers');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
      expect(response.body.total).toBe(0);
    });

    it('should handle errors gracefully', async () => {
      mockSellerMonitoringService.getSellers.mockRejectedValue(
        new Error('Database error')
      );

      const response = await request(app).get('/api/v1/sellers');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Database error');
    });
  });

  describe('POST /api/v1/sellers', () => {
    it('should add a new seller', async () => {
      const response = await request(app).post('/api/v1/sellers').send({
        username: 'newshop',
        displayName: 'New Record Shop',
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.username).toBe('newshop');
      expect(response.body.data.displayName).toBe('New Record Shop');
      expect(mockSellerMonitoringService.addSeller).toHaveBeenCalledWith(
        'newshop',
        'New Record Shop'
      );
    });

    it('should add seller without displayName', async () => {
      const response = await request(app).post('/api/v1/sellers').send({
        username: 'simpleseller',
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockSellerMonitoringService.addSeller).toHaveBeenCalledWith(
        'simpleseller',
        undefined
      );
    });

    it('should return 400 when username is missing', async () => {
      const response = await request(app).post('/api/v1/sellers').send({
        displayName: 'No Username Shop',
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Username is required');
    });

    it('should return 400 for invalid username format', async () => {
      const response = await request(app).post('/api/v1/sellers').send({
        username: 'invalid<script>user',
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid username format');
    });

    it('should return 400 when already monitoring seller', async () => {
      mockSellerMonitoringService.addSeller.mockRejectedValue(
        new Error('Already monitoring this seller')
      );

      const response = await request(app).post('/api/v1/sellers').send({
        username: 'existingseller',
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Already monitoring this seller');
    });

    it('should return 400 when seller not found on Discogs', async () => {
      mockSellerMonitoringService.addSeller.mockRejectedValue(
        new Error('User not found on Discogs')
      );

      const response = await request(app).post('/api/v1/sellers').send({
        username: 'nonexistent',
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('User not found on Discogs');
    });

    it('should handle server errors', async () => {
      mockSellerMonitoringService.addSeller.mockRejectedValue(
        new Error('Network timeout')
      );

      const response = await request(app).post('/api/v1/sellers').send({
        username: 'timeout_seller',
      });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/v1/sellers/:username', () => {
    it('should remove a seller', async () => {
      const response = await request(app).delete('/api/v1/sellers/localvinyl');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Seller removed');
      expect(mockSellerMonitoringService.removeSeller).toHaveBeenCalledWith(
        'localvinyl'
      );
    });

    it('should return 404 when seller not found', async () => {
      mockSellerMonitoringService.removeSeller.mockResolvedValue(false);

      const response = await request(app).delete('/api/v1/sellers/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Seller not found');
    });

    it('should return 400 for invalid username format', async () => {
      const response = await request(app).delete(
        '/api/v1/sellers/invalid<user>'
      );

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid username format');
    });

    it('should handle errors gracefully', async () => {
      mockSellerMonitoringService.removeSeller.mockRejectedValue(
        new Error('Storage error')
      );

      const response = await request(app).delete('/api/v1/sellers/localvinyl');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/sellers/matches', () => {
    it('should return all matches', async () => {
      const response = await request(app).get('/api/v1/sellers/matches');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.total).toBe(1);
      expect(response.body.data[0].artist).toBe('The Beatles');
    });

    it('should handle empty matches', async () => {
      mockSellerMonitoringService.getAllMatches.mockResolvedValue([]);

      const response = await request(app).get('/api/v1/sellers/matches');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
      expect(response.body.total).toBe(0);
    });

    it('should handle errors gracefully', async () => {
      mockSellerMonitoringService.getAllMatches.mockRejectedValue(
        new Error('Database error')
      );

      const response = await request(app).get('/api/v1/sellers/matches');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/sellers/:username/matches', () => {
    it('should return matches for specific seller', async () => {
      const response = await request(app).get(
        '/api/v1/sellers/localvinyl/matches'
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(
        mockSellerMonitoringService.getMatchesBySeller
      ).toHaveBeenCalledWith('localvinyl');
    });

    it('should return 400 for invalid username format', async () => {
      const response = await request(app).get(
        '/api/v1/sellers/invalid<user>/matches'
      );

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid username format');
    });

    it('should handle errors gracefully', async () => {
      mockSellerMonitoringService.getMatchesBySeller.mockRejectedValue(
        new Error('Query error')
      );

      const response = await request(app).get(
        '/api/v1/sellers/localvinyl/matches'
      );

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/sellers/scan', () => {
    it('should start a scan', async () => {
      const response = await request(app).post('/api/v1/sellers/scan');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('scanning');
      expect(mockSellerMonitoringService.startScan).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockSellerMonitoringService.startScan.mockRejectedValue(
        new Error('Scan initialization failed')
      );

      const response = await request(app).post('/api/v1/sellers/scan');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/sellers/scan/status', () => {
    it('should return scan status', async () => {
      const response = await request(app).get('/api/v1/sellers/scan/status');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('completed');
      expect(response.body.data.progress).toBe(100);
      expect(response.body.data.newMatches).toBe(2);
    });

    it('should return idle status when no scan has run', async () => {
      mockSellerMonitoringService.getScanStatus.mockResolvedValue({
        status: 'idle',
        sellersScanned: 0,
        totalSellers: 0,
        progress: 0,
        newMatches: 0,
      });

      const response = await request(app).get('/api/v1/sellers/scan/status');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('idle');
    });

    it('should handle errors gracefully', async () => {
      mockSellerMonitoringService.getScanStatus.mockRejectedValue(
        new Error('Status read error')
      );

      const response = await request(app).get('/api/v1/sellers/scan/status');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/sellers/settings', () => {
    it('should return settings', async () => {
      const response = await request(app).get('/api/v1/sellers/settings');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.scanFrequencyDays).toBe(7);
      expect(response.body.data.vinylFormatsOnly).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      mockSellerMonitoringService.getSettings.mockRejectedValue(
        new Error('Settings read error')
      );

      const response = await request(app).get('/api/v1/sellers/settings');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/sellers/settings', () => {
    it('should save settings', async () => {
      const response = await request(app)
        .post('/api/v1/sellers/settings')
        .send({
          scanFrequencyDays: 3,
          notifyOnNewMatch: false,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockSellerMonitoringService.saveSettings).toHaveBeenCalledWith({
        scanFrequencyDays: 3,
        notifyOnNewMatch: false,
      });
    });

    it('should handle partial settings update', async () => {
      const response = await request(app)
        .post('/api/v1/sellers/settings')
        .send({
          vinylFormatsOnly: false,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockSellerMonitoringService.saveSettings).toHaveBeenCalledWith({
        vinylFormatsOnly: false,
      });
    });

    it('should handle errors gracefully', async () => {
      mockSellerMonitoringService.saveSettings.mockRejectedValue(
        new Error('Save error')
      );

      const response = await request(app)
        .post('/api/v1/sellers/settings')
        .send({
          scanFrequencyDays: 5,
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/sellers/matches/:matchId/seen', () => {
    it('should mark match as seen', async () => {
      const response = await request(app).post(
        '/api/v1/sellers/matches/1001/seen'
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Match marked as seen');
      expect(mockSellerMonitoringService.markMatchAsSeen).toHaveBeenCalledWith(
        '1001'
      );
    });

    it('should handle errors gracefully', async () => {
      mockSellerMonitoringService.markMatchAsSeen.mockRejectedValue(
        new Error('Update error')
      );

      const response = await request(app).post(
        '/api/v1/sellers/matches/1001/seen'
      );

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/sellers/matches/:matchId/notified', () => {
    it('should mark match as notified', async () => {
      const response = await request(app).post(
        '/api/v1/sellers/matches/1001/notified'
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Match marked as notified');
      expect(
        mockSellerMonitoringService.markMatchAsNotified
      ).toHaveBeenCalledWith('1001');
    });

    it('should handle errors gracefully', async () => {
      mockSellerMonitoringService.markMatchAsNotified.mockRejectedValue(
        new Error('Update error')
      );

      const response = await request(app).post(
        '/api/v1/sellers/matches/1001/notified'
      );

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Route ordering', () => {
    // These tests ensure static routes aren't captured by parameterized routes
    it('should route /matches to getAllMatches, not getMatchesBySeller', async () => {
      await request(app).get('/api/v1/sellers/matches');

      expect(mockSellerMonitoringService.getAllMatches).toHaveBeenCalled();
      expect(
        mockSellerMonitoringService.getMatchesBySeller
      ).not.toHaveBeenCalled();
    });

    it('should route /scan to startScan', async () => {
      await request(app).post('/api/v1/sellers/scan');

      expect(mockSellerMonitoringService.startScan).toHaveBeenCalled();
      expect(mockSellerMonitoringService.removeSeller).not.toHaveBeenCalled();
    });

    it('should route /settings to getSettings', async () => {
      await request(app).get('/api/v1/sellers/settings');

      expect(mockSellerMonitoringService.getSettings).toHaveBeenCalled();
      expect(
        mockSellerMonitoringService.getMatchesBySeller
      ).not.toHaveBeenCalled();
    });
  });
});
