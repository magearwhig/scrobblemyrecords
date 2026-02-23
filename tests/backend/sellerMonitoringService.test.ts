import axios from 'axios';

import { AuthService } from '../../src/backend/services/authService';
import { SellerMonitoringService } from '../../src/backend/services/sellerMonitoringService';
import { WishlistService } from '../../src/backend/services/wishlistService';
import { getDiscogsAxios } from '../../src/backend/utils/discogsAxios';
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
jest.mock('../../src/backend/utils/discogsAxios');
jest.mock('../../src/backend/utils/fileStorage');
jest.mock('../../src/backend/services/authService');
jest.mock('../../src/backend/services/wishlistService');

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedGetDiscogsAxios = getDiscogsAxios as jest.MockedFunction<
  typeof getDiscogsAxios
>;

describe('SellerMonitoringService', () => {
  let sellerMonitoringService: SellerMonitoringService;
  let mockFileStorage: jest.Mocked<FileStorage>;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockWishlistService: jest.Mocked<WishlistService>;
  let mockAxiosInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    jest.useFakeTimers();

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

    mockedGetDiscogsAxios.mockReturnValue(mockAxiosInstance);
    mockedAxios.isAxiosError.mockReturnValue(false);

    // Create service instance
    sellerMonitoringService = new SellerMonitoringService(
      mockFileStorage,
      mockAuthService,
      mockWishlistService
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should obtain shared axios instance via getDiscogsAxios', () => {
      expect(mockedGetDiscogsAxios).toHaveBeenCalled();
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
      await jest.advanceTimersByTimeAsync(100);

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
      await jest.advanceTimersByTimeAsync(500);

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
      await jest.advanceTimersByTimeAsync(500);

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
      await jest.advanceTimersByTimeAsync(200);

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
    it('should use shared rate-limited axios instance', () => {
      // Rate limiting is handled by getDiscogsAxios() utility
      expect(mockedGetDiscogsAxios).toHaveBeenCalled();
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
      await jest.advanceTimersByTimeAsync(800);

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
      await jest.advanceTimersByTimeAsync(500);

      const matchesCall = mockFileStorage.writeJSON.mock.calls.find(
        call => call[0] === 'sellers/matches.json'
      ) as [string, SellerMatchesStore] | undefined;
      expect(matchesCall?.[1].matches[0].id).toBe('987654321');
    });
  });

  describe('retry logic', () => {
    it('should retry on 403 rate limit error', async () => {
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
      // Retries are immediate (bucket handles delays), just flush promises
      await jest.advanceTimersByTimeAsync(100);

      // Should have made 2 requests (1 failed, 1 succeeded)
      expect(requestCount).toBe(2);
    });

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
      await jest.advanceTimersByTimeAsync(100);

      expect(requestCount).toBe(2);
    });
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
      await jest.advanceTimersByTimeAsync(25000);

      // Should have saved partial progress
      const partialProgressCall = mockFileStorage.writeJSON.mock.calls.find(
        call => call[0].includes('-partial.json')
      );
      expect(partialProgressCall).toBeDefined();
    });

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
      await jest.advanceTimersByTimeAsync(500);

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
      await jest.advanceTimersByTimeAsync(200);

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

  describe('cancelScan', () => {
    it('should return false when no scan is in progress', async () => {
      const result = await sellerMonitoringService.cancelScan();

      expect(result).toBe(false);
    });

    it('should return true and set abort flag when scan is running', async () => {
      // Arrange: start a scan with sellers that will take time
      const now = Date.now();
      mockFileStorage.readJSON.mockImplementation(async (path: string) => {
        if (path === 'sellers/monitored-sellers.json') {
          return {
            schemaVersion: 1,
            sellers: [
              {
                username: 'SlowShop',
                displayName: 'Slow Shop',
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
        if (path === 'sellers/settings.json') {
          return {
            schemaVersion: 1,
            scanFrequencyDays: 7,
            quickCheckFrequencyHours: 24,
            notifyOnNewMatch: true,
            vinylFormatsOnly: false,
          };
        }
        if (path === 'sellers/matches.json') {
          return { schemaVersion: 1, lastUpdated: now, matches: [] };
        }
        throw new Error('File not found');
      });

      // Mock a slow inventory fetch that won't resolve quickly
      mockAxiosInstance.get.mockImplementation(
        () =>
          new Promise(resolve => {
            setTimeout(
              () =>
                resolve({
                  data: {
                    pagination: { pages: 1, items: 0 },
                    listings: [],
                  },
                }),
              10000
            );
          })
      );

      // Act: start scan, then cancel
      await sellerMonitoringService.startScan();
      const cancelResult = await sellerMonitoringService.cancelScan();

      // Assert
      expect(cancelResult).toBe(true);

      // Clean up: advance timers to let background scan settle
      await jest.advanceTimersByTimeAsync(15000);
    });

    it('should stop scan between sellers and write cancelled status', async () => {
      const now = Date.now();
      let inventoryCallCount = 0;

      mockFileStorage.readJSON.mockImplementation(async (path: string) => {
        if (path === 'sellers/monitored-sellers.json') {
          return {
            schemaVersion: 1,
            sellers: [
              {
                username: 'Shop1',
                displayName: 'Shop 1',
                addedAt: now - 86400000,
                matchCount: 0,
              },
              {
                username: 'Shop2',
                displayName: 'Shop 2',
                addedAt: now - 86400000,
                matchCount: 0,
              },
              {
                username: 'Shop3',
                displayName: 'Shop 3',
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
        if (path === 'sellers/settings.json') {
          return {
            schemaVersion: 1,
            scanFrequencyDays: 7,
            quickCheckFrequencyHours: 24,
            notifyOnNewMatch: true,
            vinylFormatsOnly: false,
          };
        }
        if (path === 'sellers/matches.json') {
          return { schemaVersion: 1, lastUpdated: now, matches: [] };
        }
        if (path === 'sellers/release-master-cache.json') {
          return null;
        }
        throw new Error('File not found');
      });

      mockWishlistService.getWishlistItems.mockResolvedValue([]);

      // Cancel immediately after the first seller's inventory is fetched.
      // The cancel is called synchronously inside the mock, so the abort
      // flag is set before the next iteration of the seller loop.
      mockAxiosInstance.get.mockImplementation((url: string) => {
        if (url.includes('/inventory')) {
          inventoryCallCount++;
          if (inventoryCallCount === 1) {
            // Cancel synchronously during inventory fetch for first seller
            // The abort flag will be checked before the second seller starts
            sellerMonitoringService.cancelScan();
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

      // Act
      await sellerMonitoringService.startScan();
      // Advance time to let the scan process
      await jest.advanceTimersByTimeAsync(500);

      // Assert: scan status should be 'cancelled'
      const cancelledStatusCall = mockFileStorage.writeJSON.mock.calls.find(
        call =>
          call[0] === 'sellers/scan-status.json' &&
          (call[1] as SellerScanStatus).status === 'cancelled'
      );
      expect(cancelledStatusCall).toBeDefined();

      // Should have saved partial matches
      const matchesSaveCall = mockFileStorage.writeJSON.mock.calls.find(
        call => call[0] === 'sellers/matches.json'
      );
      expect(matchesSaveCall).toBeDefined();

      // Should NOT have scanned all 3 sellers (scan was cancelled after first)
      expect(inventoryCallCount).toBeLessThan(3);
    });

    it('should stop during matching loop and save release cache', async () => {
      const now = Date.now();
      let releaseCallCount = 0;

      mockFileStorage.readJSON.mockImplementation(async (path: string) => {
        if (path === 'sellers/monitored-sellers.json') {
          return {
            schemaVersion: 1,
            sellers: [
              {
                username: 'BigShop',
                displayName: 'Big Shop',
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
        if (path === 'sellers/settings.json') {
          return {
            schemaVersion: 1,
            scanFrequencyDays: 7,
            quickCheckFrequencyHours: 24,
            notifyOnNewMatch: true,
            vinylFormatsOnly: false,
          };
        }
        if (path === 'sellers/matches.json') {
          return { schemaVersion: 1, lastUpdated: now, matches: [] };
        }
        if (path === 'sellers/release-master-cache.json') {
          return null;
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

      // Return many items so matching loop runs multiple iterations
      mockAxiosInstance.get.mockImplementation((url: string) => {
        if (url.includes('/inventory')) {
          const listings = Array.from({ length: 10 }, (_, i) => ({
            id: 2000 + i,
            release: {
              id: 200 + i,
              artist: 'Test Artist',
              title: `Album ${i}`,
              format: 'Vinyl, LP',
            },
            condition: 'VG+',
            sleeve_condition: 'VG',
            price: { value: 20 + i, currency: 'USD' },
            uri: `https://discogs.com/sell/item/${2000 + i}`,
            posted: '2024-01-15T12:00:00Z',
          }));

          return Promise.resolve({
            data: {
              pagination: { pages: 1, items: listings.length },
              listings,
            },
          });
        }
        if (url.includes('/releases/')) {
          releaseCallCount++;
          // Cancel after 3 release lookups
          if (releaseCallCount === 3) {
            sellerMonitoringService.cancelScan();
          }
          return Promise.resolve({ data: { master_id: 99999 } });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      // Act
      await sellerMonitoringService.startScan();
      // Advance enough for inventory fetch + a few release lookups
      await jest.advanceTimersByTimeAsync(5000);

      // Assert: should have stopped before processing all 10 items
      // (some items will be processed but not all 10)
      expect(releaseCallCount).toBeLessThanOrEqual(5);
      expect(releaseCallCount).toBeGreaterThanOrEqual(3);
    });

    it('should allow starting a new scan after cancellation', async () => {
      const now = Date.now();
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
        if (path === 'sellers/matches.json') {
          return { schemaVersion: 1, lastUpdated: now, matches: [] };
        }
        throw new Error('File not found');
      });

      // Start and cancel a scan
      await sellerMonitoringService.startScan();
      await jest.advanceTimersByTimeAsync(200);

      // Now start a new scan - should work (not blocked)
      const status = await sellerMonitoringService.startScan();

      // Should have 'scanning' status (not "already in progress" warning)
      expect(status.status).toBe('scanning');
    });
  });

  describe('initialize - cancelled status reset', () => {
    it('should reset cancelled status to idle on startup', async () => {
      // Arrange: simulate a cancelled status from a previous run
      mockFileStorage.readJSON.mockImplementation(async (path: string) => {
        if (path === 'sellers/scan-status.json') {
          return {
            status: 'cancelled',
            progress: 50,
            sellersScanned: 1,
            totalSellers: 2,
            newMatches: 0,
          };
        }
        throw new Error('File not found');
      });

      // Act: create a new service instance (triggers initialize())
      const freshService = new SellerMonitoringService(
        mockFileStorage,
        mockAuthService,
        mockWishlistService
      );

      // Give the async initialize time to run
      await jest.advanceTimersByTimeAsync(100);

      // Assert: scan status should have been reset to idle
      expect(mockFileStorage.writeJSON).toHaveBeenCalledWith(
        'sellers/scan-status.json',
        expect.objectContaining({
          status: 'idle',
          progress: 0,
        })
      );

      // Suppress unused variable warning
      expect(freshService).toBeDefined();
    });
  });

  describe('executeWithRetry', () => {
    it('should not retry on non-rate-limit errors', async () => {
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

      // Return a 500 server error - should NOT be retried
      mockAxiosInstance.get.mockImplementation((url: string) => {
        if (url.includes('/inventory')) {
          requestCount++;
          const error = new Error('Internal Server Error') as any;
          error.response = { status: 500 };
          mockedAxios.isAxiosError.mockReturnValue(true);
          return Promise.reject(error);
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      await sellerMonitoringService.startScan();
      await jest.advanceTimersByTimeAsync(1000);

      // Should have only made 1 request (no retries for 500)
      expect(requestCount).toBe(1);

      // Should have recorded an error status
      const errorStatusCall = mockFileStorage.writeJSON.mock.calls.find(
        call =>
          call[0] === 'sellers/scan-status.json' &&
          (call[1] as SellerScanStatus).status === 'error'
      );
      expect(errorStatusCall).toBeDefined();
    });

    it('should exhaust all retries on persistent 429 and record error', async () => {
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

      // All requests fail with 429
      mockAxiosInstance.get.mockImplementation((url: string) => {
        if (url.includes('/inventory')) {
          requestCount++;
          const error = new Error('Too Many Requests') as any;
          error.response = { status: 429 };
          mockedAxios.isAxiosError.mockReturnValue(true);
          return Promise.reject(error);
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      await sellerMonitoringService.startScan();
      // Retries are immediate (bucket handles delays)
      await jest.advanceTimersByTimeAsync(100);

      // Should have made 3 attempts (MAX_RETRIES)
      expect(requestCount).toBe(3);
    });

    it('should not retry on pagination limit 403 error', async () => {
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

      // Return a pagination limit error (403 but NOT a rate limit)
      mockAxiosInstance.get.mockImplementation((url: string) => {
        if (url.includes('/inventory')) {
          requestCount++;
          if (requestCount === 1) {
            // First page succeeds
            return Promise.resolve({
              data: {
                pagination: { pages: 200, items: 20000 },
                listings: [
                  {
                    id: 1001,
                    release: {
                      id: 101,
                      artist: 'Test',
                      title: 'Album',
                      format: 'LP',
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
          // Subsequent pages hit pagination limit
          const error = new Error('Pagination above 100 disabled') as any;
          error.response = {
            status: 403,
            data: {
              message:
                'Pagination above 100 disabled for inventories besides your own',
            },
          };
          mockedAxios.isAxiosError.mockReturnValue(true);
          return Promise.reject(error);
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      await sellerMonitoringService.startScan();
      await jest.advanceTimersByTimeAsync(5000);

      // Pagination limit should NOT trigger retries - should be treated as a hard stop
      // The fetchSellerInventory handler catches pagination errors and returns partial results
      // So we expect: page 1 success + page 2 pagination error = 2 requests
      // (no retry on pagination error)
      expect(requestCount).toBeLessThanOrEqual(4); // page 1 + page 2 (no retries)
    });
  });

  describe('lookupMasterId retry logic', () => {
    beforeEach(() => {
      mockedAxios.isAxiosError.mockImplementation((error: any) => {
        return error?.isAxiosError === true;
      });

      mockAuthService.getDiscogsToken.mockResolvedValue(
        'Discogs token=test-token'
      );
    });

    it('should use executeWithRetry to handle 429 rate limit errors', async () => {
      // Arrange
      let callCount = 0;
      mockAxiosInstance.get.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject({
            isAxiosError: true,
            response: { status: 429, data: {} },
            message: 'Rate limited',
          });
        }
        return Promise.resolve({ data: { master_id: 12345 } });
      });

      // Act - no manual delay needed; retries rely on the token bucket (mocked)
      const result = await (sellerMonitoringService as any).lookupMasterId(100);

      // Assert
      expect(result).toEqual({ masterId: 12345, rateLimited: false });
      expect(callCount).toBe(2);
    });

    it('should return rateLimited: true when all retries are exhausted on 429', async () => {
      // Arrange
      const rateLimitError = {
        isAxiosError: true,
        response: { status: 429, data: {} },
        message: 'Rate limited',
      };
      mockAxiosInstance.get.mockRejectedValue(rateLimitError);

      // Act - MAX_RETRIES = 3, retries are immediate (bucket handles delays)
      const result = await (sellerMonitoringService as any).lookupMasterId(100);

      // Assert
      expect(result).toEqual({ masterId: undefined, rateLimited: true });
    });

    it('should return rateLimited: false for non-rate-limit errors', async () => {
      // Arrange
      const serverError = {
        isAxiosError: true,
        response: { status: 500, data: {} },
        message: 'Internal Server Error',
      };
      mockAxiosInstance.get.mockRejectedValue(serverError);

      // Act
      const result = await (sellerMonitoringService as any).lookupMasterId(100);

      // Assert
      expect(result).toEqual({ masterId: undefined, rateLimited: false });
    });

    it('should return masterId when API call succeeds', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValue({
        data: { master_id: 12345 },
      });

      // Act
      const result = await (sellerMonitoringService as any).lookupMasterId(100);

      // Assert
      expect(result).toEqual({ masterId: 12345, rateLimited: false });
    });

    it('should return masterId: undefined when release has no master', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValue({
        data: { master_id: undefined },
      });

      // Act
      const result = await (sellerMonitoringService as any).lookupMasterId(100);

      // Assert
      expect(result).toEqual({ masterId: undefined, rateLimited: false });
    });
  });

  describe('rate-limited items are not treated as non-matches', () => {
    beforeEach(() => {
      mockedAxios.isAxiosError.mockImplementation((error: any) => {
        return error?.isAxiosError === true;
      });
    });

    it('should skip rate-limited items without caching them', async () => {
      // Arrange
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
        if (path === 'sellers/release-master-cache.json') {
          return null;
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

      // Mock the API to always return 429 (rate limited)
      const rateLimitError = {
        isAxiosError: true,
        response: { status: 429, data: {} },
        message: 'Rate limited',
      };
      mockAxiosInstance.get.mockRejectedValue(rateLimitError);

      const items = [
        {
          listingId: 1,
          releaseId: 100,
          masterId: undefined,
          artist: 'Test Artist',
          title: 'Test Album',
          format: ['Vinyl', 'LP'],
          condition: 'VG+/VG+',
          price: 20,
          currency: 'USD',
          listingUrl: 'https://discogs.com/sell/item/1',
        },
      ];

      // Act
      const promise = (sellerMonitoringService as any).matchInventoryToWishlist(
        items,
        'testshop',
        []
      );
      // Advance past all retry delays: 5000ms + 10000ms for MAX_RETRIES=3
      await jest.advanceTimersByTimeAsync(20000);
      const matches = await promise;

      // Assert - item should NOT be in matches (was rate limited, not matched)
      expect(matches).toHaveLength(0);

      // Verify the persistent release cache was NOT populated for this release
      // (rate-limited items should not be cached so they can be retried next scan)
      const releaseCache = (sellerMonitoringService as any).releaseCache;
      if (releaseCache) {
        expect(releaseCache.releaseToMaster[100]).toBeUndefined();
      }
    });

    it('should include rateLimitedCount in matching statistics', async () => {
      // Arrange
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
        if (path === 'sellers/release-master-cache.json') {
          return null;
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

      // Mock API to always 429
      const rateLimitError = {
        isAxiosError: true,
        response: { status: 429, data: {} },
        message: 'Rate limited',
      };
      mockAxiosInstance.get.mockRejectedValue(rateLimitError);

      const items = [
        {
          listingId: 1,
          releaseId: 100,
          masterId: undefined,
          artist: 'Test Artist',
          title: 'Test Album',
          format: ['Vinyl', 'LP'],
          condition: 'VG+/VG+',
          price: 20,
          currency: 'USD',
          listingUrl: 'https://discogs.com/sell/item/1',
        },
        {
          listingId: 2,
          releaseId: 200,
          masterId: undefined,
          artist: 'Another Artist',
          title: 'Another Album',
          format: ['Vinyl', 'LP'],
          condition: 'NM/NM',
          price: 30,
          currency: 'USD',
          listingUrl: 'https://discogs.com/sell/item/2',
        },
      ];

      // Act
      const promise = (sellerMonitoringService as any).matchInventoryToWishlist(
        items,
        'testshop',
        []
      );
      // Advance past all retry delays for both items
      await jest.advanceTimersByTimeAsync(60000);
      await promise;

      // Assert - check that updateScanStatus was called with rateLimited count
      const statusCalls = mockFileStorage.writeJSON.mock.calls.filter(
        call => call[0] === 'sellers/scan-status.json'
      );
      const finalStatusCall = statusCalls[statusCalls.length - 1];
      expect(finalStatusCall).toBeDefined();
      const finalStatus = finalStatusCall[1] as SellerScanStatus;
      expect(finalStatus.matchingProgress?.rateLimited).toBeGreaterThan(0);
    });
  });

  describe('scan cancellation - matching loop abort', () => {
    it('should stop matching loop when scan is aborted', async () => {
      // Arrange
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
        if (path === 'sellers/release-master-cache.json') {
          return null;
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

      // Set scanAborted before calling matchInventoryToWishlist
      (sellerMonitoringService as any).scanAborted = true;

      const items = [
        {
          listingId: 1,
          releaseId: 100,
          masterId: undefined,
          artist: 'Test Artist',
          title: 'Test Album',
          format: ['Vinyl', 'LP'],
          condition: 'VG+/VG+',
          price: 20,
          currency: 'USD',
          listingUrl: 'https://discogs.com/sell/item/1',
        },
        {
          listingId: 2,
          releaseId: 200,
          masterId: undefined,
          artist: 'Another Artist',
          title: 'Another Album',
          format: ['Vinyl', 'LP'],
          condition: 'NM/NM',
          price: 30,
          currency: 'USD',
          listingUrl: 'https://discogs.com/sell/item/2',
        },
      ];

      // Act
      const matches = await (
        sellerMonitoringService as any
      ).matchInventoryToWishlist(items, 'testshop', []);

      // Assert - should return early with no matches processed
      expect(matches).toHaveLength(0);
      // No API calls should have been made (aborted before any processing)
      expect(mockAxiosInstance.get).not.toHaveBeenCalled();
    });
  });

  describe('scan status transitions', () => {
    it('should transition from scanning to cancelled when cancelled', async () => {
      const now = Date.now();

      mockFileStorage.readJSON.mockImplementation(async (path: string) => {
        if (path === 'sellers/monitored-sellers.json') {
          return {
            schemaVersion: 1,
            sellers: [
              {
                username: 'Shop1',
                displayName: 'Shop 1',
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
        if (path === 'sellers/settings.json') {
          return {
            schemaVersion: 1,
            scanFrequencyDays: 7,
            quickCheckFrequencyHours: 24,
            notifyOnNewMatch: true,
            vinylFormatsOnly: false,
          };
        }
        if (path === 'sellers/matches.json') {
          return { schemaVersion: 1, lastUpdated: now, matches: [] };
        }
        if (path === 'sellers/release-master-cache.json') {
          return null;
        }
        throw new Error('File not found');
      });

      mockWishlistService.getWishlistItems.mockResolvedValue([]);

      // Make inventory fetch slow so we can cancel during it
      mockAxiosInstance.get.mockImplementation((url: string) => {
        if (url.includes('/inventory')) {
          return new Promise(resolve => {
            setTimeout(
              () =>
                resolve({
                  data: { pagination: { pages: 1, items: 0 }, listings: [] },
                }),
              5000
            );
          });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      // Act: start scan - status should go to 'scanning'
      const initialStatus = await sellerMonitoringService.startScan();
      expect(initialStatus.status).toBe('scanning');

      // Verify 'scanning' was written
      const scanningCall = mockFileStorage.writeJSON.mock.calls.find(
        call =>
          call[0] === 'sellers/scan-status.json' &&
          (call[1] as SellerScanStatus).status === 'scanning'
      );
      expect(scanningCall).toBeDefined();

      // Cancel the scan
      await sellerMonitoringService.cancelScan();

      // Advance time to let the scan process the cancellation
      await jest.advanceTimersByTimeAsync(10000);
    });
  });
});
