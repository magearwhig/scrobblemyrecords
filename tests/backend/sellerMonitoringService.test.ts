import axios from 'axios';

import { AuthService } from '../../src/backend/services/authService';
import { SellerMonitoringService } from '../../src/backend/services/sellerMonitoringService';
import { WishlistService } from '../../src/backend/services/wishlistService';
import { FileStorage } from '../../src/backend/utils/fileStorage';
import {
  MonitoredSellersStore,
  SellerMatch,
  SellerMatchesStore,
  SellerMonitoringSettings,
  SellerScanStatus,
} from '../../src/shared/types';

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

// Mock dependencies
jest.mock('axios');
jest.mock('../../src/backend/utils/fileStorage');
jest.mock('../../src/backend/services/authService');
jest.mock('../../src/backend/services/wishlistService');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('SellerMonitoringService', () => {
  let sellerMonitoringService: SellerMonitoringService;
  let mockFileStorage: jest.Mocked<FileStorage>;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockWishlistService: jest.Mocked<WishlistService>;
  let mockAxiosInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Mock FileStorage
    mockFileStorage = new FileStorage('test') as jest.Mocked<FileStorage>;
    mockFileStorage.readJSON = jest.fn();
    mockFileStorage.writeJSON = jest.fn().mockResolvedValue(undefined);
    mockFileStorage.delete = jest.fn().mockResolvedValue(undefined);

    // Mock AuthService
    mockAuthService = new AuthService(
      mockFileStorage
    ) as jest.Mocked<AuthService>;
    mockAuthService.getDiscogsToken = jest
      .fn()
      .mockResolvedValue('Discogs token=test-token');

    // Mock WishlistService
    mockWishlistService = new WishlistService(
      mockFileStorage,
      mockAuthService
    ) as jest.Mocked<WishlistService>;
    mockWishlistService.getWishlistItems = jest.fn().mockResolvedValue([]);
    mockWishlistService.getLocalWantList = jest.fn().mockResolvedValue([]);

    // Mock axios instance
    mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      interceptors: {
        request: {
          use: jest.fn(),
        },
      },
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance);
    mockedAxios.isAxiosError.mockReturnValue(false);

    // Create service instance
    sellerMonitoringService = new SellerMonitoringService(
      mockFileStorage,
      mockAuthService,
      mockWishlistService
    );
  });

  describe('constructor', () => {
    it('should create axios instance with correct configuration', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'https://api.discogs.com',
        timeout: 30000,
        headers: {
          'User-Agent': 'RecordScrobbles/1.0',
        },
      });
    });

    it('should set up rate limiting interceptor', () => {
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });
  });

  describe('getSettings', () => {
    it('should return saved settings when they exist', async () => {
      const savedSettings: SellerMonitoringSettings = {
        schemaVersion: 1,
        scanFrequencyDays: 3,
        quickCheckFrequencyHours: 12,
        notifyOnNewMatch: false,
        vinylFormatsOnly: false,
      };

      mockFileStorage.readJSON.mockResolvedValue(savedSettings);

      const result = await sellerMonitoringService.getSettings();

      expect(result).toEqual(savedSettings);
      expect(mockFileStorage.readJSON).toHaveBeenCalledWith(
        'sellers/settings.json'
      );
    });

    it('should return default settings when no file exists', async () => {
      mockFileStorage.readJSON.mockRejectedValue(new Error('File not found'));

      const result = await sellerMonitoringService.getSettings();

      expect(result).toEqual({
        schemaVersion: 1,
        scanFrequencyDays: 7,
        quickCheckFrequencyHours: 24,
        notifyOnNewMatch: true,
        vinylFormatsOnly: true,
      });
    });

    it('should return default settings when schema version mismatch', async () => {
      mockFileStorage.readJSON.mockResolvedValue({
        schemaVersion: 0, // Old schema
        scanFrequencyDays: 3,
      });

      const result = await sellerMonitoringService.getSettings();

      expect(result.schemaVersion).toBe(1);
      expect(result.scanFrequencyDays).toBe(7); // Default
    });
  });

  describe('saveSettings', () => {
    it('should merge settings with existing and save', async () => {
      const existingSettings: SellerMonitoringSettings = {
        schemaVersion: 1,
        scanFrequencyDays: 7,
        quickCheckFrequencyHours: 24,
        notifyOnNewMatch: true,
        vinylFormatsOnly: true,
      };

      mockFileStorage.readJSON.mockResolvedValue(existingSettings);

      const result = await sellerMonitoringService.saveSettings({
        scanFrequencyDays: 3,
        notifyOnNewMatch: false,
      });

      expect(result).toEqual({
        schemaVersion: 1,
        scanFrequencyDays: 3,
        quickCheckFrequencyHours: 24,
        notifyOnNewMatch: false,
        vinylFormatsOnly: true,
      });

      expect(mockFileStorage.writeJSON).toHaveBeenCalledWith(
        'sellers/settings.json',
        expect.objectContaining({
          scanFrequencyDays: 3,
          notifyOnNewMatch: false,
        })
      );
    });
  });

  describe('getScanStatus', () => {
    it('should return saved scan status when it exists', async () => {
      const savedStatus: SellerScanStatus = {
        status: 'completed',
        sellersScanned: 5,
        totalSellers: 5,
        progress: 100,
        newMatches: 3,
        lastScanTimestamp: Date.now(),
      };

      mockFileStorage.readJSON.mockResolvedValue(savedStatus);

      const result = await sellerMonitoringService.getScanStatus();

      expect(result).toEqual(savedStatus);
    });

    it('should return idle status when no file exists', async () => {
      mockFileStorage.readJSON.mockRejectedValue(new Error('File not found'));

      const result = await sellerMonitoringService.getScanStatus();

      expect(result).toEqual({
        status: 'idle',
        sellersScanned: 0,
        totalSellers: 0,
        progress: 0,
        newMatches: 0,
      });
    });
  });

  describe('getSellers', () => {
    it('should return sellers when they exist', async () => {
      const store: MonitoredSellersStore = {
        schemaVersion: 1,
        sellers: [
          {
            username: 'testshop',
            displayName: 'Test Shop',
            addedAt: Date.now(),
            matchCount: 0,
          },
        ],
      };

      mockFileStorage.readJSON.mockResolvedValue(store);

      const result = await sellerMonitoringService.getSellers();

      expect(result).toHaveLength(1);
      expect(result[0].username).toBe('testshop');
    });

    it('should return empty array when no file exists', async () => {
      mockFileStorage.readJSON.mockRejectedValue(new Error('File not found'));

      const result = await sellerMonitoringService.getSellers();

      expect(result).toEqual([]);
    });

    it('should return empty array when schema version mismatch', async () => {
      mockFileStorage.readJSON.mockResolvedValue({
        schemaVersion: 0,
        sellers: [{ username: 'test' }],
      });

      const result = await sellerMonitoringService.getSellers();

      expect(result).toEqual([]);
    });
  });

  describe('validateSellerExists', () => {
    it('should return valid when user exists', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          username: 'TestShop',
          id: 12345,
          seller_num_for_sale: 500,
        },
      });

      const result =
        await sellerMonitoringService.validateSellerExists('testshop');

      expect(result.valid).toBe(true);
      expect(result.info).toEqual({
        username: 'TestShop',
        id: 12345,
        inventoryCount: 500,
      });
    });

    it('should return invalid when user not found (404)', async () => {
      const error = new Error('Not Found') as any;
      error.response = { status: 404 };
      mockedAxios.isAxiosError.mockReturnValue(true);
      mockAxiosInstance.get.mockRejectedValue(error);

      const result =
        await sellerMonitoringService.validateSellerExists('nonexistent');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('User not found on Discogs');
    });

    it('should return invalid on other errors', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Network error'));

      const result =
        await sellerMonitoringService.validateSellerExists('testshop');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('addSeller', () => {
    beforeEach(() => {
      // Default: no existing sellers
      mockFileStorage.readJSON.mockImplementation(async (path: string) => {
        if (path === 'sellers/monitored-sellers.json') {
          throw new Error('File not found');
        }
        throw new Error('File not found');
      });

      // Mock successful validation
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          username: 'TestShop',
          id: 12345,
          seller_num_for_sale: 500,
        },
      });
    });

    it('should add a new seller successfully', async () => {
      const result = await sellerMonitoringService.addSeller(
        'testshop',
        'Test Record Shop'
      );

      expect(result.username).toBe('TestShop'); // Canonical from Discogs
      expect(result.displayName).toBe('Test Record Shop');
      expect(result.inventorySize).toBe(500);
      expect(result.matchCount).toBe(0);

      expect(mockFileStorage.writeJSON).toHaveBeenCalledWith(
        'sellers/monitored-sellers.json',
        expect.objectContaining({
          schemaVersion: 1,
          sellers: expect.arrayContaining([
            expect.objectContaining({ username: 'TestShop' }),
          ]),
        })
      );
    });

    it('should use username as displayName when not provided', async () => {
      const result = await sellerMonitoringService.addSeller('testshop');

      expect(result.displayName).toBe('TestShop');
    });

    it('should throw error when seller already exists', async () => {
      mockFileStorage.readJSON.mockImplementation(async (path: string) => {
        if (path === 'sellers/monitored-sellers.json') {
          return {
            schemaVersion: 1,
            sellers: [
              {
                username: 'TestShop',
                displayName: 'Test',
                addedAt: Date.now(),
                matchCount: 0,
              },
            ],
          };
        }
        throw new Error('File not found');
      });

      await expect(
        sellerMonitoringService.addSeller('testshop')
      ).rejects.toThrow('Already monitoring this seller');
    });

    it('should throw error when seller validation fails', async () => {
      const error = new Error('Not Found') as any;
      error.response = { status: 404 };
      mockedAxios.isAxiosError.mockReturnValue(true);
      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(
        sellerMonitoringService.addSeller('nonexistent')
      ).rejects.toThrow('User not found on Discogs');
    });
  });

  describe('removeSeller', () => {
    beforeEach(() => {
      mockFileStorage.readJSON.mockImplementation(async (path: string) => {
        if (path === 'sellers/monitored-sellers.json') {
          return {
            schemaVersion: 1,
            sellers: [
              {
                username: 'TestShop',
                displayName: 'Test Shop',
                addedAt: Date.now(),
                matchCount: 2,
              },
            ],
          };
        }
        if (path === 'sellers/matches.json') {
          return {
            schemaVersion: 1,
            lastUpdated: Date.now(),
            matches: [
              { id: '123', sellerId: 'TestShop', artist: 'Test Artist' },
              { id: '456', sellerId: 'OtherShop', artist: 'Other Artist' },
            ],
          };
        }
        throw new Error('File not found');
      });
    });

    it('should remove seller and their matches', async () => {
      const result = await sellerMonitoringService.removeSeller('testshop');

      expect(result).toBe(true);

      // Check sellers file was updated
      expect(mockFileStorage.writeJSON).toHaveBeenCalledWith(
        'sellers/monitored-sellers.json',
        expect.objectContaining({
          sellers: [],
        })
      );

      // Check matches file was updated (only OtherShop matches remain)
      expect(mockFileStorage.writeJSON).toHaveBeenCalledWith(
        'sellers/matches.json',
        expect.objectContaining({
          matches: expect.arrayContaining([
            expect.objectContaining({ sellerId: 'OtherShop' }),
          ]),
        })
      );

      // Check cache was deleted
      expect(mockFileStorage.delete).toHaveBeenCalledWith(
        'sellers/inventory-cache/testshop.json'
      );
    });

    it('should return false when seller not found', async () => {
      const result = await sellerMonitoringService.removeSeller('nonexistent');

      expect(result).toBe(false);
    });

    it('should handle cache deletion errors gracefully', async () => {
      mockFileStorage.delete.mockRejectedValue(new Error('Delete failed'));

      // Should not throw
      const result = await sellerMonitoringService.removeSeller('testshop');

      expect(result).toBe(true);
    });
  });

  describe('getAllMatches', () => {
    it('should return all matches when they exist', async () => {
      const store: SellerMatchesStore = {
        schemaVersion: 1,
        lastUpdated: Date.now(),
        matches: [
          {
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
          },
        ],
      };

      mockFileStorage.readJSON.mockResolvedValue(store);

      const result = await sellerMonitoringService.getAllMatches();

      expect(result).toHaveLength(1);
      expect(result[0].artist).toBe('Test Artist');
    });

    it('should return empty array when no matches exist', async () => {
      mockFileStorage.readJSON.mockRejectedValue(new Error('File not found'));

      const result = await sellerMonitoringService.getAllMatches();

      expect(result).toEqual([]);
    });
  });

  describe('getMatchesBySeller', () => {
    beforeEach(() => {
      mockFileStorage.readJSON.mockResolvedValue({
        schemaVersion: 1,
        lastUpdated: Date.now(),
        matches: [
          { id: '1', sellerId: 'ShopA', artist: 'Artist A' },
          { id: '2', sellerId: 'ShopB', artist: 'Artist B' },
          { id: '3', sellerId: 'ShopA', artist: 'Artist C' },
        ],
      });
    });

    it('should return only matches for specified seller', async () => {
      const result = await sellerMonitoringService.getMatchesBySeller('ShopA');

      expect(result).toHaveLength(2);
      expect(result.every(m => m.sellerId === 'ShopA')).toBe(true);
    });

    it('should be case-insensitive', async () => {
      const result = await sellerMonitoringService.getMatchesBySeller('shopa');

      expect(result).toHaveLength(2);
    });

    it('should return empty array for unknown seller', async () => {
      const result =
        await sellerMonitoringService.getMatchesBySeller('NonExistent');

      expect(result).toEqual([]);
    });
  });

  describe('markMatchAsSeen', () => {
    it('should update match status to seen', async () => {
      const store: SellerMatchesStore = {
        schemaVersion: 1,
        lastUpdated: Date.now() - 1000,
        matches: [
          createMatch({ id: '123', sellerId: 'Shop', status: 'active' }),
        ],
      };

      mockFileStorage.readJSON.mockResolvedValue(store);

      await sellerMonitoringService.markMatchAsSeen('123');

      expect(mockFileStorage.writeJSON).toHaveBeenCalledWith(
        'sellers/matches.json',
        expect.objectContaining({
          matches: expect.arrayContaining([
            expect.objectContaining({ id: '123', status: 'seen' }),
          ]),
        })
      );
    });

    it('should not throw when match not found', async () => {
      mockFileStorage.readJSON.mockResolvedValue({
        schemaVersion: 1,
        lastUpdated: Date.now(),
        matches: [],
      });

      // Should not throw
      await sellerMonitoringService.markMatchAsSeen('nonexistent');

      // Should not write when nothing changed
      expect(mockFileStorage.writeJSON).not.toHaveBeenCalled();
    });
  });

  describe('markMatchAsNotified', () => {
    it('should update match notified flag to true', async () => {
      const store: SellerMatchesStore = {
        schemaVersion: 1,
        lastUpdated: Date.now() - 1000,
        matches: [
          createMatch({ id: '123', sellerId: 'Shop', notified: false }),
        ],
      };

      mockFileStorage.readJSON.mockResolvedValue(store);

      await sellerMonitoringService.markMatchAsNotified('123');

      expect(mockFileStorage.writeJSON).toHaveBeenCalledWith(
        'sellers/matches.json',
        expect.objectContaining({
          matches: expect.arrayContaining([
            expect.objectContaining({ id: '123', notified: true }),
          ]),
        })
      );
    });
  });

  describe('removeStaleMatches', () => {
    it('should remove sold matches older than 30 days', async () => {
      const now = Date.now();
      const oldDate = now - 35 * 24 * 60 * 60 * 1000; // 35 days ago
      const recentDate = now - 5 * 24 * 60 * 60 * 1000; // 5 days ago

      const store: SellerMatchesStore = {
        schemaVersion: 1,
        lastUpdated: now,
        matches: [
          createMatch({ id: '1', status: 'active', dateFound: oldDate }), // Keep
          createMatch({ id: '2', status: 'seen', dateFound: oldDate }), // Keep
          createMatch({ id: '3', status: 'sold', dateFound: oldDate }), // Remove (old sold)
          createMatch({ id: '4', status: 'sold', dateFound: recentDate }), // Keep (recent sold)
        ],
      };

      mockFileStorage.readJSON.mockResolvedValue(store);

      const removed = await sellerMonitoringService.removeStaleMatches();

      expect(removed).toBe(1);
      expect(mockFileStorage.writeJSON).toHaveBeenCalledWith(
        'sellers/matches.json',
        expect.objectContaining({
          matches: expect.arrayContaining([
            expect.objectContaining({ id: '1' }),
            expect.objectContaining({ id: '2' }),
            expect.objectContaining({ id: '4' }),
          ]),
        })
      );
    });

    it('should return 0 when no matches to remove', async () => {
      mockFileStorage.readJSON.mockResolvedValue({
        schemaVersion: 1,
        lastUpdated: Date.now(),
        matches: [
          createMatch({ id: '1', status: 'active', dateFound: Date.now() }),
        ],
      });

      const removed = await sellerMonitoringService.removeStaleMatches();

      expect(removed).toBe(0);
      expect(mockFileStorage.writeJSON).not.toHaveBeenCalled();
    });
  });

  describe('startScan', () => {
    beforeEach(() => {
      mockFileStorage.readJSON.mockImplementation(async (path: string) => {
        if (path === 'sellers/monitored-sellers.json') {
          return { schemaVersion: 1, sellers: [] };
        }
        if (path === 'sellers/scan-status.json') {
          return {
            status: 'idle',
            progress: 0,
            sellersScanned: 0,
            totalSellers: 0,
            newMatches: 0,
          };
        }
        throw new Error('File not found');
      });
    });

    it('should return current status when scan already in progress', async () => {
      // Simulate scan in progress by starting one
      sellerMonitoringService.startScan();

      // Try to start another
      const result = await sellerMonitoringService.startScan();

      expect(result.status).toBe('idle'); // Returns current status
    });

    it('should complete immediately when no sellers', async () => {
      await sellerMonitoringService.startScan();

      // Give the background scan time to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockFileStorage.writeJSON).toHaveBeenCalledWith(
        'sellers/scan-status.json',
        expect.objectContaining({
          status: 'completed',
          progress: 100,
          sellersScanned: 0,
          totalSellers: 0,
        })
      );
    });
  });

  describe('isVinylFormat (via matching)', () => {
    // Test the vinyl format detection indirectly through matching
    beforeEach(() => {
      const now = Date.now();

      mockFileStorage.readJSON.mockImplementation(async (path: string) => {
        if (path === 'sellers/settings.json') {
          return {
            schemaVersion: 1,
            scanFrequencyDays: 7,
            quickCheckFrequencyHours: 24,
            notifyOnNewMatch: true,
            vinylFormatsOnly: true,
          };
        }
        if (path === 'sellers/monitored-sellers.json') {
          return {
            schemaVersion: 1,
            sellers: [
              {
                username: 'TestShop',
                displayName: 'Test Shop',
                addedAt: now - 86400000,
                matchCount: 0,
              },
            ],
          };
        }
        if (path === 'sellers/scan-status.json') {
          return {
            status: 'idle',
            progress: 0,
            sellersScanned: 0,
            totalSellers: 0,
            newMatches: 0,
          };
        }
        if (path === 'sellers/matches.json') {
          return { schemaVersion: 1, lastUpdated: now, matches: [] };
        }
        if (path === 'sellers/release-master-cache.json') {
          // Return empty cache - will be populated during scan
          return null;
        }
        throw new Error('File not found');
      });

      mockWishlistService.getWishlistItems.mockResolvedValue([
        {
          id: 1,
          masterId: 12345,
          releaseId: 67890,
          artist: 'Test Artist',
          title: 'Test Album',
          dateAdded: '2024-01-15',
          vinylStatus: 'has_vinyl' as const,
          vinylVersions: [],
        },
      ]);
    });

    it('should match vinyl formats like LP', async () => {
      // Mock inventory endpoint (no master_id - real API doesn't return it)
      // and release lookup endpoint (returns master_id)
      mockAxiosInstance.get.mockImplementation((url: string) => {
        if (url.includes('/inventory')) {
          return Promise.resolve({
            data: {
              pagination: { pages: 1, items: 1 },
              listings: [
                {
                  id: 1001,
                  release: {
                    id: 111,
                    artist: 'Test Artist',
                    title: 'Test Album',
                    format: 'Vinyl, LP, Album',
                    thumbnail: 'https://example.com/thumb.jpg',
                  },
                  condition: 'VG+',
                  sleeve_condition: 'VG',
                  price: { value: 25, currency: 'USD' },
                  uri: 'https://discogs.com/sell/item/1001',
                  posted: '2024-01-15T12:00:00Z',
                },
              ],
            },
          });
        }
        if (url.includes('/releases/111')) {
          return Promise.resolve({ data: { master_id: 12345 } });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      await sellerMonitoringService.startScan();
      // Wait longer due to API_CALL_DELAY_MS (200ms per API call)
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(mockFileStorage.writeJSON).toHaveBeenCalledWith(
        'sellers/matches.json',
        expect.objectContaining({
          matches: expect.arrayContaining([
            expect.objectContaining({
              masterId: 12345,
              artist: 'Test Artist',
            }),
          ]),
        })
      );
    });

    it('should match 12" format', async () => {
      mockAxiosInstance.get.mockImplementation((url: string) => {
        if (url.includes('/inventory')) {
          return Promise.resolve({
            data: {
              pagination: { pages: 1, items: 1 },
              listings: [
                {
                  id: 1002,
                  release: {
                    id: 112,
                    artist: 'Test Artist',
                    title: 'Test Album',
                    format: '12", Single',
                    thumbnail: 'https://example.com/thumb.jpg',
                  },
                  condition: 'NM',
                  sleeve_condition: 'NM',
                  price: { value: 15, currency: 'USD' },
                  uri: 'https://discogs.com/sell/item/1002',
                  posted: '2024-01-15T12:00:00Z',
                },
              ],
            },
          });
        }
        if (url.includes('/releases/112')) {
          return Promise.resolve({ data: { master_id: 12345 } });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      await sellerMonitoringService.startScan();
      // Wait longer due to API_CALL_DELAY_MS (200ms per API call)
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(mockFileStorage.writeJSON).toHaveBeenCalledWith(
        'sellers/matches.json',
        expect.objectContaining({
          matches: expect.arrayContaining([
            expect.objectContaining({ masterId: 12345 }),
          ]),
        })
      );
    });

    it('should skip CD format when vinylFormatsOnly is true', async () => {
      // CD format is filtered out before master_id lookup, so no lookup mock needed
      mockAxiosInstance.get.mockImplementation((url: string) => {
        if (url.includes('/inventory')) {
          return Promise.resolve({
            data: {
              pagination: { pages: 1, items: 1 },
              listings: [
                {
                  id: 1003,
                  release: {
                    id: 113,
                    artist: 'Test Artist',
                    title: 'Test Album',
                    format: 'CD, Album',
                    thumbnail: 'https://example.com/thumb.jpg',
                  },
                  condition: 'NM',
                  sleeve_condition: 'NM',
                  price: { value: 10, currency: 'USD' },
                  uri: 'https://discogs.com/sell/item/1003',
                  posted: '2024-01-15T12:00:00Z',
                },
              ],
            },
          });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      await sellerMonitoringService.startScan();
      await new Promise(resolve => setTimeout(resolve, 200));

      // Matches should be empty because CD is not vinyl
      const matchesCall = mockFileStorage.writeJSON.mock.calls.find(
        call => call[0] === 'sellers/matches.json'
      ) as [string, SellerMatchesStore] | undefined;
      expect(matchesCall?.[1].matches).toHaveLength(0);
    });
  });

  describe('getCacheKey', () => {
    it('should sanitize usernames with special characters', () => {
      // Access private method via any
      const service = sellerMonitoringService as any;

      expect(service.getCacheKey('Normal_User-123')).toBe('normal_user-123');
      expect(service.getCacheKey('User With Spaces')).toBe('user_with_spaces');
      expect(service.getCacheKey('user@special#chars!')).toBe(
        'user_special_chars_'
      );
      expect(service.getCacheKey('../../etc/passwd')).toBe('______etc_passwd');
    });
  });

  describe('getAuthHeaders', () => {
    it('should handle Personal Access Token format', async () => {
      mockAuthService.getDiscogsToken.mockResolvedValue('Discogs token=abc123');

      const service = sellerMonitoringService as any;
      const headers = await service.getAuthHeaders();

      expect(headers).toEqual({
        Authorization: 'Discogs token=abc123',
      });
    });

    it('should throw error when no token available', async () => {
      mockAuthService.getDiscogsToken.mockResolvedValue(undefined);

      const service = sellerMonitoringService as any;

      await expect(service.getAuthHeaders()).rejects.toThrow(
        'No Discogs token available'
      );
    });
  });

  describe('rate limiting', () => {
    it('should apply rate limiting to requests', async () => {
      jest.useFakeTimers();

      const interceptor =
        mockAxiosInstance.interceptors.request.use.mock.calls[0][0];
      const mockConfig = { url: '/test' };

      const promise = interceptor(mockConfig);

      // Fast-forward time
      jest.advanceTimersByTime(1000);

      const result = await promise;

      expect(result).toBe(mockConfig);

      jest.useRealTimers();
    });
  });

  describe('inventory fetching', () => {
    it('should skip items whose master_id lookup returns no match in wishlist', async () => {
      const now = Date.now();

      mockFileStorage.readJSON.mockImplementation(async (path: string) => {
        if (path === 'sellers/settings.json') {
          return {
            schemaVersion: 1,
            scanFrequencyDays: 7,
            quickCheckFrequencyHours: 24,
            notifyOnNewMatch: true,
            vinylFormatsOnly: false, // Allow all formats
          };
        }
        if (path === 'sellers/monitored-sellers.json') {
          return {
            schemaVersion: 1,
            sellers: [
              {
                username: 'TestShop',
                displayName: 'Test',
                addedAt: now - 86400000,
                matchCount: 0,
              },
            ],
          };
        }
        if (path === 'sellers/scan-status.json') {
          return {
            status: 'idle',
            progress: 0,
            sellersScanned: 0,
            totalSellers: 0,
            newMatches: 0,
          };
        }
        if (path === 'sellers/matches.json') {
          return { schemaVersion: 1, lastUpdated: now, matches: [] };
        }
        if (path === 'sellers/release-master-cache.json') {
          return null; // Empty cache
        }
        throw new Error('File not found');
      });

      mockWishlistService.getWishlistItems.mockResolvedValue([
        {
          id: 1,
          masterId: 12345, // Only looking for master 12345
          releaseId: 67890,
          artist: 'Test',
          title: 'Album',
          dateAdded: '2024-01-15',
          vinylStatus: 'has_vinyl' as const,
          vinylVersions: [],
        },
      ]);

      // Mock inventory (no master_id in response - real API behavior)
      // and release lookups
      mockAxiosInstance.get.mockImplementation((url: string) => {
        if (url.includes('/inventory')) {
          return Promise.resolve({
            data: {
              pagination: { pages: 1, items: 2 },
              listings: [
                {
                  id: 1001,
                  release: {
                    id: 111, // Release 111 -> master 99999 (not in wishlist)
                    artist: 'Test',
                    title: 'Album',
                    format: 'LP',
                    thumbnail: 'https://example.com/thumb.jpg',
                  },
                  condition: 'VG+',
                  sleeve_condition: 'VG',
                  price: { value: 25, currency: 'USD' },
                  uri: 'https://discogs.com/sell/item/1001',
                  posted: '2024-01-15T12:00:00Z',
                },
                {
                  id: 1002,
                  release: {
                    id: 112, // Release 112 -> master 12345 (in wishlist!)
                    artist: 'Test',
                    title: 'Album',
                    format: 'LP',
                    thumbnail: 'https://example.com/thumb.jpg',
                  },
                  condition: 'NM',
                  sleeve_condition: 'NM',
                  price: { value: 30, currency: 'USD' },
                  uri: 'https://discogs.com/sell/item/1002',
                  posted: '2024-01-15T12:00:00Z',
                },
              ],
            },
          });
        }
        if (url.includes('/releases/111')) {
          return Promise.resolve({ data: { master_id: 99999 } }); // Not in wishlist
        }
        if (url.includes('/releases/112')) {
          return Promise.resolve({ data: { master_id: 12345 } }); // In wishlist!
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      await sellerMonitoringService.startScan();
      // Wait longer due to API_CALL_DELAY_MS (200ms per API call) - 2 releases to look up
      await new Promise(resolve => setTimeout(resolve, 800));

      // Only item 1002 should be in matches (its master_id 12345 is in wishlist)
      const matchesCall = mockFileStorage.writeJSON.mock.calls.find(
        call => call[0] === 'sellers/matches.json'
      ) as [string, SellerMatchesStore] | undefined;
      expect(matchesCall?.[1].matches).toHaveLength(1);
      expect(matchesCall?.[1].matches[0].listingId).toBe(1002);
    });
  });

  describe('match ID generation', () => {
    it('should use listingId.toString() for deterministic match IDs', async () => {
      const now = Date.now();

      mockFileStorage.readJSON.mockImplementation(async (path: string) => {
        if (path === 'sellers/settings.json') {
          return {
            schemaVersion: 1,
            scanFrequencyDays: 7,
            quickCheckFrequencyHours: 24,
            notifyOnNewMatch: true,
            vinylFormatsOnly: false,
          };
        }
        if (path === 'sellers/monitored-sellers.json') {
          return {
            schemaVersion: 1,
            sellers: [
              {
                username: 'TestShop',
                displayName: 'Test',
                addedAt: now - 86400000,
                matchCount: 0,
              },
            ],
          };
        }
        if (path === 'sellers/scan-status.json') {
          return {
            status: 'idle',
            progress: 0,
            sellersScanned: 0,
            totalSellers: 0,
            newMatches: 0,
          };
        }
        if (path === 'sellers/matches.json') {
          return { schemaVersion: 1, lastUpdated: now, matches: [] };
        }
        if (path === 'sellers/release-master-cache.json') {
          return null; // Empty cache
        }
        throw new Error('File not found');
      });

      mockWishlistService.getWishlistItems.mockResolvedValue([
        {
          id: 1,
          masterId: 12345,
          releaseId: 67890,
          artist: 'Test',
          title: 'Album',
          dateAdded: '2024-01-15',
          vinylStatus: 'has_vinyl' as const,
          vinylVersions: [],
        },
      ]);

      mockAxiosInstance.get.mockImplementation((url: string) => {
        if (url.includes('/inventory')) {
          return Promise.resolve({
            data: {
              pagination: { pages: 1, items: 1 },
              listings: [
                {
                  id: 987654321,
                  release: {
                    id: 111,
                    artist: 'Test',
                    title: 'Album',
                    format: 'LP',
                    thumbnail: 'https://example.com/thumb.jpg',
                  },
                  condition: 'VG+',
                  sleeve_condition: 'VG',
                  price: { value: 25, currency: 'USD' },
                  uri: 'https://discogs.com/sell/item/987654321',
                  posted: '2024-01-15T12:00:00Z',
                },
              ],
            },
          });
        }
        if (url.includes('/releases/111')) {
          return Promise.resolve({ data: { master_id: 12345 } });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      await sellerMonitoringService.startScan();
      // Wait longer due to API_CALL_DELAY_MS (200ms per API call)
      await new Promise(resolve => setTimeout(resolve, 500));

      const matchesCall = mockFileStorage.writeJSON.mock.calls.find(
        call => call[0] === 'sellers/matches.json'
      ) as [string, SellerMatchesStore] | undefined;
      expect(matchesCall?.[1].matches[0].id).toBe('987654321');
    });
  });

  describe('retry logic', () => {
    it('should retry on 403 rate limit error with exponential backoff', async () => {
      const now = Date.now();
      let requestCount = 0;

      mockFileStorage.readJSON.mockImplementation(async (path: string) => {
        if (path === 'sellers/settings.json') {
          return {
            schemaVersion: 1,
            scanFrequencyDays: 7,
            quickCheckFrequencyHours: 24,
            notifyOnNewMatch: true,
            vinylFormatsOnly: false,
          };
        }
        if (path === 'sellers/monitored-sellers.json') {
          return {
            schemaVersion: 1,
            sellers: [
              {
                username: 'TestShop',
                displayName: 'Test',
                addedAt: now - 86400000,
                matchCount: 0,
              },
            ],
          };
        }
        if (path === 'sellers/scan-status.json') {
          return {
            status: 'idle',
            progress: 0,
            sellersScanned: 0,
            totalSellers: 0,
            newMatches: 0,
          };
        }
        if (path === 'sellers/matches.json') {
          return { schemaVersion: 1, lastUpdated: now, matches: [] };
        }
        throw new Error('File not found');
      });

      mockWishlistService.getWishlistItems.mockResolvedValue([]);

      // First request fails with 403, second succeeds
      mockAxiosInstance.get.mockImplementation((url: string) => {
        if (url.includes('/inventory')) {
          requestCount++;
          if (requestCount === 1) {
            const error = new Error('Rate limited') as any;
            error.response = { status: 403 };
            mockedAxios.isAxiosError.mockReturnValue(true);
            return Promise.reject(error);
          }
          return Promise.resolve({
            data: {
              pagination: { pages: 1, items: 0 },
              listings: [],
            },
          });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      await sellerMonitoringService.startScan();
      // Wait for retry delay + scan completion
      await new Promise(resolve => setTimeout(resolve, 6000));

      // Should have made 2 requests (1 failed, 1 succeeded)
      expect(requestCount).toBe(2);
    }, 10000);

    it('should retry on 429 rate limit error', async () => {
      const now = Date.now();
      let requestCount = 0;

      mockFileStorage.readJSON.mockImplementation(async (path: string) => {
        if (path === 'sellers/settings.json') {
          return {
            schemaVersion: 1,
            scanFrequencyDays: 7,
            quickCheckFrequencyHours: 24,
            notifyOnNewMatch: true,
            vinylFormatsOnly: false,
          };
        }
        if (path === 'sellers/monitored-sellers.json') {
          return {
            schemaVersion: 1,
            sellers: [
              {
                username: 'TestShop',
                displayName: 'Test',
                addedAt: now - 86400000,
                matchCount: 0,
              },
            ],
          };
        }
        if (path === 'sellers/scan-status.json') {
          return {
            status: 'idle',
            progress: 0,
            sellersScanned: 0,
            totalSellers: 0,
            newMatches: 0,
          };
        }
        if (path === 'sellers/matches.json') {
          return { schemaVersion: 1, lastUpdated: now, matches: [] };
        }
        throw new Error('File not found');
      });

      mockWishlistService.getWishlistItems.mockResolvedValue([]);

      // First request fails with 429, second succeeds
      mockAxiosInstance.get.mockImplementation((url: string) => {
        if (url.includes('/inventory')) {
          requestCount++;
          if (requestCount === 1) {
            const error = new Error('Too many requests') as any;
            error.response = { status: 429 };
            mockedAxios.isAxiosError.mockReturnValue(true);
            return Promise.reject(error);
          }
          return Promise.resolve({
            data: {
              pagination: { pages: 1, items: 0 },
              listings: [],
            },
          });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      await sellerMonitoringService.startScan();
      await new Promise(resolve => setTimeout(resolve, 6000));

      expect(requestCount).toBe(2);
    }, 10000);
  });

  describe('partial scan progress', () => {
    it('should save partial progress when scan fails', async () => {
      const now = Date.now();
      let pageRequests = 0;

      mockFileStorage.readJSON.mockImplementation(async (path: string) => {
        if (path === 'sellers/settings.json') {
          return {
            schemaVersion: 1,
            scanFrequencyDays: 7,
            quickCheckFrequencyHours: 24,
            notifyOnNewMatch: true,
            vinylFormatsOnly: false,
          };
        }
        if (path === 'sellers/monitored-sellers.json') {
          return {
            schemaVersion: 1,
            sellers: [
              {
                username: 'TestShop',
                displayName: 'Test',
                addedAt: now - 86400000,
                matchCount: 0,
              },
            ],
          };
        }
        if (path === 'sellers/scan-status.json') {
          return {
            status: 'idle',
            progress: 0,
            sellersScanned: 0,
            totalSellers: 0,
            newMatches: 0,
          };
        }
        if (path === 'sellers/matches.json') {
          return { schemaVersion: 1, lastUpdated: now, matches: [] };
        }
        throw new Error('File not found');
      });

      mockWishlistService.getWishlistItems.mockResolvedValue([]);

      // Pages 1-2 succeed, page 3 fails with persistent 403
      mockAxiosInstance.get.mockImplementation((url: string) => {
        if (url.includes('/inventory')) {
          pageRequests++;
          // Calculate which page this is based on request count
          // (retries will increase the count for the same page)
          const pageNumber = Math.ceil(pageRequests / 4); // 4 = 1 initial + 3 retries max

          if (pageNumber <= 2 || pageRequests <= 2) {
            // Pages 1-2 succeed
            return Promise.resolve({
              data: {
                pagination: { pages: 3, items: 300 },
                listings: [
                  {
                    id: 1000 + pageRequests,
                    release: {
                      id: 100 + pageRequests,
                      artist: 'Test',
                      title: 'Album',
                      format: 'LP',
                    },
                    condition: 'VG+',
                    sleeve_condition: 'VG',
                    price: { value: 25, currency: 'USD' },
                    uri: `https://discogs.com/sell/item/${1000 + pageRequests}`,
                    posted: '2024-01-15T12:00:00Z',
                  },
                ],
              },
            });
          }
          // Page 3 fails persistently
          const error = new Error('Rate limited') as any;
          error.response = { status: 403 };
          mockedAxios.isAxiosError.mockReturnValue(true);
          return Promise.reject(error);
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      await sellerMonitoringService.startScan();
      // Wait for retries to complete
      await new Promise(resolve => setTimeout(resolve, 25000));

      // Should have saved partial progress
      const partialProgressCall = mockFileStorage.writeJSON.mock.calls.find(
        call => call[0].includes('-partial.json')
      );
      expect(partialProgressCall).toBeDefined();
    }, 30000);

    it('should resume from partial progress on next scan', async () => {
      const now = Date.now();

      // Return partial progress for TestShop
      mockFileStorage.readJSON.mockImplementation(async (path: string) => {
        if (path === 'sellers/settings.json') {
          return {
            schemaVersion: 1,
            scanFrequencyDays: 7,
            quickCheckFrequencyHours: 24,
            notifyOnNewMatch: true,
            vinylFormatsOnly: false,
          };
        }
        if (path === 'sellers/monitored-sellers.json') {
          return {
            schemaVersion: 1,
            sellers: [
              {
                username: 'TestShop',
                displayName: 'Test',
                addedAt: now - 86400000,
                matchCount: 0,
              },
            ],
          };
        }
        if (path === 'sellers/scan-status.json') {
          return {
            status: 'idle',
            progress: 0,
            sellersScanned: 0,
            totalSellers: 0,
            newMatches: 0,
          };
        }
        if (path === 'sellers/matches.json') {
          return { schemaVersion: 1, lastUpdated: now, matches: [] };
        }
        if (path === 'sellers/inventory-cache/testshop-partial.json') {
          return {
            items: [
              {
                listingId: 1001,
                releaseId: 101,
                artist: 'Test',
                title: 'Album',
                format: ['LP'],
                condition: 'VG+/VG',
                price: 25,
                currency: 'USD',
                listingUrl: 'https://discogs.com/1001',
              },
              {
                listingId: 1002,
                releaseId: 102,
                artist: 'Test',
                title: 'Album 2',
                format: ['LP'],
                condition: 'VG+/VG',
                price: 30,
                currency: 'USD',
                listingUrl: 'https://discogs.com/1002',
              },
            ],
            lastCompletedPage: 2,
            totalPages: 3,
            totalItems: 300,
            savedAt: now - 60000, // 1 minute ago (not stale)
          };
        }
        throw new Error('File not found');
      });

      mockWishlistService.getWishlistItems.mockResolvedValue([]);

      let requestedPage: number | undefined;
      mockAxiosInstance.get.mockImplementation((url: string, config: any) => {
        if (url.includes('/inventory')) {
          requestedPage = config?.params?.page;
          return Promise.resolve({
            data: {
              pagination: { pages: 3, items: 300 },
              listings: [
                {
                  id: 1003,
                  release: {
                    id: 103,
                    artist: 'Test',
                    title: 'Album 3',
                    format: 'LP',
                  },
                  condition: 'VG+',
                  sleeve_condition: 'VG',
                  price: { value: 35, currency: 'USD' },
                  uri: 'https://discogs.com/sell/item/1003',
                  posted: '2024-01-15T12:00:00Z',
                },
              ],
            },
          });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      await sellerMonitoringService.startScan();
      await new Promise(resolve => setTimeout(resolve, 500));

      // Should have started from page 3 (continuing from lastCompletedPage 2)
      expect(requestedPage).toBe(3);

      // Should have deleted partial progress after successful completion
      expect(mockFileStorage.delete).toHaveBeenCalledWith(
        'sellers/inventory-cache/testshop-partial.json'
      );
    });

    it('should ignore stale partial progress older than 24 hours', async () => {
      const now = Date.now();

      mockFileStorage.readJSON.mockImplementation(async (path: string) => {
        if (path === 'sellers/settings.json') {
          return {
            schemaVersion: 1,
            scanFrequencyDays: 7,
            quickCheckFrequencyHours: 24,
            notifyOnNewMatch: true,
            vinylFormatsOnly: false,
          };
        }
        if (path === 'sellers/monitored-sellers.json') {
          return {
            schemaVersion: 1,
            sellers: [
              {
                username: 'TestShop',
                displayName: 'Test',
                addedAt: now - 86400000,
                matchCount: 0,
              },
            ],
          };
        }
        if (path === 'sellers/scan-status.json') {
          return {
            status: 'idle',
            progress: 0,
            sellersScanned: 0,
            totalSellers: 0,
            newMatches: 0,
          };
        }
        if (path === 'sellers/matches.json') {
          return { schemaVersion: 1, lastUpdated: now, matches: [] };
        }
        if (path === 'sellers/inventory-cache/testshop-partial.json') {
          return {
            items: [
              {
                listingId: 1001,
                releaseId: 101,
                artist: 'Test',
                title: 'Album',
                format: ['LP'],
                condition: 'VG+/VG',
                price: 25,
                currency: 'USD',
                listingUrl: 'https://discogs.com/1001',
              },
            ],
            lastCompletedPage: 50,
            totalPages: 100,
            totalItems: 10000,
            savedAt: now - 25 * 60 * 60 * 1000, // 25 hours ago (stale!)
          };
        }
        throw new Error('File not found');
      });

      mockWishlistService.getWishlistItems.mockResolvedValue([]);

      let requestedPage: number | undefined;
      mockAxiosInstance.get.mockImplementation((url: string, config: any) => {
        if (url.includes('/inventory')) {
          requestedPage = config?.params?.page;
          return Promise.resolve({
            data: {
              pagination: { pages: 1, items: 0 },
              listings: [],
            },
          });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      await sellerMonitoringService.startScan();
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should have started from page 1 (stale progress ignored)
      expect(requestedPage).toBe(1);
    });
  });

  describe('verifyListingStatus', () => {
    it('should return available=true when listing exists', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: { id: 123, status: 'For Sale' },
      });

      const result = await sellerMonitoringService.verifyListingStatus(123);

      expect(result.available).toBe(true);
      expect(result.error).toBeUndefined();
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/marketplace/listings/123',
        expect.any(Object)
      );
    });

    it('should return available=false when listing returns 404', async () => {
      const error: any = new Error('Not found');
      error.response = { status: 404 };
      error.isAxiosError = true;
      mockAxiosInstance.get.mockRejectedValue(error);

      // Mock axios.isAxiosError
      (axios.isAxiosError as unknown as jest.Mock) = jest
        .fn()
        .mockReturnValue(true);

      const result = await sellerMonitoringService.verifyListingStatus(123);

      expect(result.available).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it('should return error when request fails with other error', async () => {
      const error = new Error('Network error');
      mockAxiosInstance.get.mockRejectedValue(error);

      // Mock axios.isAxiosError to return false
      (axios.isAxiosError as unknown as jest.Mock) = jest
        .fn()
        .mockReturnValue(false);

      const result = await sellerMonitoringService.verifyListingStatus(123);

      expect(result.available).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('verifyAndUpdateMatch', () => {
    beforeEach(() => {
      // Setup a match to verify
      mockFileStorage.readJSON.mockImplementation((path: string) => {
        if (path.includes('matches')) {
          const store: SellerMatchesStore = {
            schemaVersion: 1,
            lastUpdated: Date.now() - 86400000,
            matches: [
              createMatch({
                id: 'match-1',
                listingId: 123,
                status: 'sold',
                statusConfidence: 'unverified',
              }),
            ],
          };
          return Promise.resolve(store);
        }
        return Promise.resolve(null);
      });
    });

    it('should reactivate match when listing is still available', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: { id: 123 },
      });

      const result =
        await sellerMonitoringService.verifyAndUpdateMatch('match-1');

      expect(result.updated).toBe(true);
      expect(result.status).toBe('active');

      // Check that store was updated
      expect(mockFileStorage.writeJSON).toHaveBeenCalled();
      const savedStore = mockFileStorage.writeJSON.mock
        .calls[0][1] as SellerMatchesStore;
      const savedMatch = savedStore.matches.find(
        (m: SellerMatch) => m.id === 'match-1'
      );
      expect(savedMatch?.status).toBe('active');
      expect(savedMatch?.statusConfidence).toBe('verified');
    });

    it('should confirm sold status when listing is not available', async () => {
      const error: any = new Error('Not found');
      error.response = { status: 404 };
      error.isAxiosError = true;
      mockAxiosInstance.get.mockRejectedValue(error);
      (axios.isAxiosError as unknown as jest.Mock) = jest
        .fn()
        .mockReturnValue(true);

      const result =
        await sellerMonitoringService.verifyAndUpdateMatch('match-1');

      expect(result.updated).toBe(false); // Status unchanged
      expect(result.status).toBe('sold');

      const savedStore = mockFileStorage.writeJSON.mock
        .calls[0][1] as SellerMatchesStore;
      const savedMatch = savedStore.matches.find(
        (m: SellerMatch) => m.id === 'match-1'
      );
      expect(savedMatch?.statusConfidence).toBe('verified');
    });

    it('should return not_found for unknown match', async () => {
      mockFileStorage.readJSON.mockResolvedValue({
        schemaVersion: 1,
        lastUpdated: Date.now(),
        matches: [],
      });

      const result =
        await sellerMonitoringService.verifyAndUpdateMatch('unknown-id');

      expect(result.updated).toBe(false);
      expect(result.status).toBe('not_found');
      expect(result.error).toBe('Match not found');
    });
  });

  describe('getAllMatchesWithCacheInfo', () => {
    it('should return matches with cache info', async () => {
      const now = Date.now();
      mockFileStorage.readJSON.mockImplementation((path: string) => {
        if (path.includes('matches')) {
          return Promise.resolve({
            schemaVersion: 1,
            lastUpdated: now - 3600000, // 1 hour ago
            matches: [createMatch({ id: 'match-1' })],
          });
        }
        if (path.includes('monitored-sellers')) {
          return Promise.resolve({
            schemaVersion: 1,
            sellers: [
              {
                username: 'TestShop',
                displayName: 'Test Shop',
                addedAt: now - 86400000,
                lastScanned: now - 7200000, // 2 hours ago
              },
            ],
          });
        }
        return Promise.resolve(null);
      });

      const result = await sellerMonitoringService.getAllMatchesWithCacheInfo();

      expect(result.matches).toHaveLength(1);
      expect(result.cacheInfo.lastUpdated).toBe(now - 3600000);
      expect(result.cacheInfo.oldestScanAge).toBeGreaterThan(7000000);
      expect(result.cacheInfo.nextScanDue).toBeDefined();
    });
  });
});
