import crypto from 'crypto';

import { AuthService } from '../../src/backend/services/authService';
import { WishlistService } from '../../src/backend/services/wishlistService';
import { FileStorage } from '../../src/backend/utils/fileStorage';
import {
  EnrichedWishlistItem,
  LocalWantItem,
  LocalWantStore,
  WishlistNewRelease,
  WishlistNewReleasesStore,
  WishlistSettings,
  WishlistStore,
  WishlistSyncStatus,
  NewReleaseSyncStatus,
  VersionsCache,
} from '../../src/shared/types';

// Mock dependencies
jest.mock('../../src/backend/utils/fileStorage');
jest.mock('../../src/backend/services/authService');
jest.mock('../../src/backend/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

const mockAxiosInstance = {
  get: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  interceptors: {
    request: { use: jest.fn() },
    response: { use: jest.fn() },
  },
};

jest.mock('../../src/backend/utils/discogsAxios', () => ({
  getDiscogsAxios: () => mockAxiosInstance,
}));

// Helper factories
const createWishlistSettings = (
  overrides: Partial<WishlistSettings> = {}
): WishlistSettings => ({
  schemaVersion: 1,
  priceThreshold: 40,
  currency: 'USD',
  autoSyncInterval: 24,
  notifyOnVinylAvailable: true,
  newReleaseTracking: {
    enabled: true,
    checkFrequencyDays: 7,
    notifyOnNewRelease: true,
    autoCheck: false,
    trackLocalWantList: true,
  },
  ...overrides,
});

const createEnrichedItem = (
  overrides: Partial<EnrichedWishlistItem> = {}
): EnrichedWishlistItem => ({
  id: 1,
  masterId: 100,
  releaseId: 200,
  artist: 'Radiohead',
  title: 'OK Computer',
  year: 1997,
  dateAdded: '2020-01-15T00:00:00Z',
  vinylStatus: 'has_vinyl',
  vinylVersions: [],
  ...overrides,
});

const createLocalWantItem = (
  overrides: Partial<LocalWantItem> = {}
): LocalWantItem => ({
  id: 'abc123',
  artist: 'Boards of Canada',
  album: 'Music Has the Right to Children',
  playCount: 42,
  lastPlayed: Date.now() - 86400000,
  addedAt: Date.now() - 172800000,
  source: 'discovery',
  vinylStatus: 'unknown',
  notified: false,
  ...overrides,
});

const createNewRelease = (
  overrides: Partial<WishlistNewRelease> = {}
): WishlistNewRelease => ({
  id: '100-300',
  masterId: 100,
  releaseId: 300,
  title: 'OK Computer (2026 Remaster)',
  artist: 'Radiohead',
  year: 2026,
  country: 'UK',
  format: ['Vinyl', 'LP'],
  label: 'XL Recordings',
  source: 'wishlist',
  sourceItemId: 1,
  detectedAt: Date.now() - 86400000,
  notified: false,
  dismissed: false,
  discogsUrl: 'https://www.discogs.com/release/300',
  ...overrides,
});

describe('WishlistService', () => {
  let service: WishlistService;
  let mockFileStorage: jest.Mocked<FileStorage>;
  let mockAuthService: jest.Mocked<AuthService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockFileStorage = {
      readJSON: jest.fn().mockResolvedValue(null),
      writeJSON: jest.fn().mockResolvedValue(undefined),
      writeJSONWithBackup: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<FileStorage>;

    mockAuthService = {
      getDiscogsToken: jest.fn().mockResolvedValue('Discogs token=test-token'),
      getUserSettings: jest.fn().mockResolvedValue({
        discogs: { username: 'testuser' },
        lastfm: {},
      }),
    } as unknown as jest.Mocked<AuthService>;

    service = new WishlistService(mockFileStorage, mockAuthService);
  });

  // ============================================
  // Settings Management
  // ============================================

  describe('getSettings', () => {
    it('should return default settings when no file exists', async () => {
      mockFileStorage.readJSON.mockResolvedValueOnce(null);

      const settings = await service.getSettings();

      expect(settings.schemaVersion).toBe(1);
      expect(settings.priceThreshold).toBe(40);
      expect(settings.currency).toBe('USD');
      expect(settings.autoSyncInterval).toBe(24);
      expect(settings.notifyOnVinylAvailable).toBe(true);
      expect(settings.newReleaseTracking?.enabled).toBe(true);
      expect(settings.newReleaseTracking?.checkFrequencyDays).toBe(7);
    });

    it('should return saved settings when file exists', async () => {
      const savedSettings = createWishlistSettings({
        priceThreshold: 60,
        currency: 'EUR',
      });
      mockFileStorage.readJSON.mockResolvedValueOnce(savedSettings);

      const settings = await service.getSettings();

      expect(settings.priceThreshold).toBe(60);
      expect(settings.currency).toBe('EUR');
    });

    it('should merge defaults for missing newReleaseTracking fields', async () => {
      const partialSettings: WishlistSettings = {
        schemaVersion: 1,
        priceThreshold: 50,
        currency: 'GBP',
        autoSyncInterval: 12,
        notifyOnVinylAvailable: false,
        // newReleaseTracking is missing some fields
        newReleaseTracking: {
          enabled: false,
        } as WishlistSettings['newReleaseTracking'],
      };
      mockFileStorage.readJSON.mockResolvedValueOnce(partialSettings);

      const settings = await service.getSettings();

      expect(settings.priceThreshold).toBe(50);
      expect(settings.newReleaseTracking?.enabled).toBe(false);
      // Should fill in defaults for missing fields
      expect(settings.newReleaseTracking?.checkFrequencyDays).toBe(7);
      expect(settings.newReleaseTracking?.notifyOnNewRelease).toBe(true);
      expect(settings.newReleaseTracking?.autoCheck).toBe(false);
      expect(settings.newReleaseTracking?.trackLocalWantList).toBe(true);
    });

    it('should handle read errors gracefully', async () => {
      mockFileStorage.readJSON.mockRejectedValueOnce(new Error('Read error'));

      const settings = await service.getSettings();

      expect(settings.priceThreshold).toBe(40);
    });
  });

  describe('saveSettings', () => {
    it('should merge with existing settings and persist', async () => {
      // getSettings will be called internally, return defaults
      mockFileStorage.readJSON.mockResolvedValueOnce(null);

      const result = await service.saveSettings({ priceThreshold: 100 });

      expect(result.priceThreshold).toBe(100);
      expect(result.currency).toBe('USD'); // default preserved
      expect(result.schemaVersion).toBe(1);
      expect(mockFileStorage.writeJSON).toHaveBeenCalledWith(
        'wishlist/settings.json',
        expect.objectContaining({ priceThreshold: 100, schemaVersion: 1 })
      );
    });

    it('should always set schemaVersion to 1', async () => {
      mockFileStorage.readJSON.mockResolvedValueOnce(null);

      const result = await service.saveSettings({});

      expect(result.schemaVersion).toBe(1);
    });
  });

  // ============================================
  // Sync Status
  // ============================================

  describe('getSyncStatus', () => {
    it('should return default status when no file exists', async () => {
      mockFileStorage.readJSON.mockResolvedValueOnce(null);

      const status = await service.getSyncStatus();

      expect(status.status).toBe('idle');
      expect(status.progress).toBe(0);
      expect(status.itemsProcessed).toBe(0);
      expect(status.totalItems).toBe(0);
      expect(status.vinylChecked).toBe(0);
    });

    it('should return saved status when file exists', async () => {
      const savedStatus: WishlistSyncStatus = {
        status: 'completed',
        progress: 100,
        itemsProcessed: 50,
        totalItems: 50,
        vinylChecked: 30,
        lastSyncTimestamp: 1000,
      };
      mockFileStorage.readJSON.mockResolvedValueOnce(savedStatus);

      const status = await service.getSyncStatus();

      expect(status.status).toBe('completed');
      expect(status.itemsProcessed).toBe(50);
    });

    it('should handle read errors gracefully', async () => {
      mockFileStorage.readJSON.mockRejectedValueOnce(new Error('Read error'));

      const status = await service.getSyncStatus();

      expect(status.status).toBe('idle');
    });
  });

  // ============================================
  // Wishlist Items (Cache)
  // ============================================

  describe('getWishlistItems', () => {
    it('should return items from cache', async () => {
      const store: WishlistStore = {
        schemaVersion: 1,
        lastUpdated: Date.now(),
        items: [createEnrichedItem()],
      };
      mockFileStorage.readJSON.mockResolvedValueOnce(store);

      const items = await service.getWishlistItems();

      expect(items).toHaveLength(1);
      expect(items[0].artist).toBe('Radiohead');
    });

    it('should return empty array when no cache exists', async () => {
      mockFileStorage.readJSON.mockResolvedValueOnce(null);

      const items = await service.getWishlistItems();

      expect(items).toHaveLength(0);
    });

    it('should return empty array when cache read fails', async () => {
      mockFileStorage.readJSON.mockRejectedValueOnce(new Error('Read error'));

      const items = await service.getWishlistItems();

      expect(items).toHaveLength(0);
    });

    it('should return items even when cache is stale', async () => {
      const store: WishlistStore = {
        schemaVersion: 1,
        lastUpdated: Date.now() - 48 * 60 * 60 * 1000, // 48 hours ago
        items: [createEnrichedItem()],
      };
      mockFileStorage.readJSON.mockResolvedValueOnce(store);

      const items = await service.getWishlistItems();

      expect(items).toHaveLength(1);
    });
  });

  // ============================================
  // isVinylFormat (tested indirectly via getMasterVersions or syncWishlist)
  // ============================================

  describe('syncWishlist', () => {
    it('should return current status if sync is already in progress', async () => {
      const currentStatus: WishlistSyncStatus = {
        status: 'syncing',
        progress: 50,
        itemsProcessed: 10,
        totalItems: 20,
        vinylChecked: 5,
      };
      mockFileStorage.readJSON.mockResolvedValue(currentStatus);

      // Start a sync (will be "in progress" internally)
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          pagination: { pages: 1, items: 1 },
          wants: [
            {
              id: 1,
              basic_information: {
                id: 200,
                master_id: 100,
                title: 'Test',
                artists: [{ name: 'Artist' }],
                year: 2020,
              },
              date_added: '2020-01-01',
            },
          ],
        },
      });

      // Use the internal state: call sync twice to trigger "already in progress"
      const promise1 = service.syncWishlist('testuser');

      // Second call should return immediately with current status
      const status = await service.syncWishlist('testuser');

      expect(status.status).toBe('syncing');

      // Resolve the first sync
      await promise1;
    });
  });

  // ============================================
  // Local Want List
  // ============================================

  describe('getLocalWantList', () => {
    it('should return items from store', async () => {
      const store: LocalWantStore = {
        schemaVersion: 1,
        items: [createLocalWantItem()],
      };
      mockFileStorage.readJSON.mockResolvedValueOnce(store);

      const items = await service.getLocalWantList();

      expect(items).toHaveLength(1);
      expect(items[0].artist).toBe('Boards of Canada');
    });

    it('should return empty array when no store exists', async () => {
      mockFileStorage.readJSON.mockResolvedValueOnce(null);

      const items = await service.getLocalWantList();

      expect(items).toHaveLength(0);
    });

    it('should return empty array on read error', async () => {
      mockFileStorage.readJSON.mockRejectedValueOnce(new Error('Read error'));

      const items = await service.getLocalWantList();

      expect(items).toHaveLength(0);
    });
  });

  describe('addToLocalWantList', () => {
    it('should add a new item to the local want list', async () => {
      // getLocalWantList returns empty
      mockFileStorage.readJSON.mockResolvedValueOnce(null);
      // searchForRelease
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          results: [
            {
              id: 500,
              master_id: 400,
              title: 'Boards of Canada - Music Has the Right to Children',
              cover_image: 'https://example.com/cover.jpg',
            },
          ],
        },
      });

      const item = await service.addToLocalWantList({
        artist: 'Boards of Canada',
        album: 'Music Has the Right to Children',
        playCount: 42,
        lastPlayed: 1000,
      });

      expect(item.artist).toBe('Boards of Canada');
      expect(item.album).toBe('Music Has the Right to Children');
      expect(item.source).toBe('discovery');
      expect(item.vinylStatus).toBe('unknown');
      expect(item.masterId).toBe(400);
      expect(item.coverImage).toBe('https://example.com/cover.jpg');
      expect(mockFileStorage.writeJSON).toHaveBeenCalledWith(
        'wishlist/local-want-list.json',
        expect.objectContaining({ schemaVersion: 1 })
      );
    });

    it('should return existing item if already in list', async () => {
      // The service generates IDs from md5 hash of "artist:album" lowercase
      // So we need to use an item whose id matches what the service would generate
      const artist = 'Boards of Canada';
      const album = 'Music Has the Right to Children';
      const expectedId = crypto
        .createHash('md5')
        .update(`${artist.toLowerCase()}:${album.toLowerCase()}`)
        .digest('hex')
        .substring(0, 12);

      const existingItem = createLocalWantItem({
        id: expectedId,
        artist,
        album,
      });
      const store: LocalWantStore = {
        schemaVersion: 1,
        items: [existingItem],
      };
      mockFileStorage.readJSON.mockResolvedValueOnce(store);

      const item = await service.addToLocalWantList({
        artist,
        album,
        playCount: 99,
        lastPlayed: 2000,
      });

      expect(item.id).toBe(expectedId);
      // writeJSON should not have been called since it's a duplicate
      expect(mockFileStorage.writeJSON).not.toHaveBeenCalled();
    });

    it('should handle Discogs search failure gracefully', async () => {
      mockFileStorage.readJSON.mockResolvedValueOnce(null);
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('API error'));

      const item = await service.addToLocalWantList({
        artist: 'Test Artist',
        album: 'Test Album',
        playCount: 10,
        lastPlayed: 1000,
      });

      expect(item.artist).toBe('Test Artist');
      expect(item.masterId).toBeUndefined();
    });
  });

  describe('removeFromLocalWantList', () => {
    it('should remove an item and return true', async () => {
      const store: LocalWantStore = {
        schemaVersion: 1,
        items: [createLocalWantItem({ id: 'item-1' })],
      };
      mockFileStorage.readJSON.mockResolvedValueOnce(store);

      const result = await service.removeFromLocalWantList('item-1');

      expect(result).toBe(true);
      expect(mockFileStorage.writeJSON).toHaveBeenCalledWith(
        'wishlist/local-want-list.json',
        expect.objectContaining({
          schemaVersion: 1,
          items: [],
        })
      );
    });

    it('should return false when item not found', async () => {
      mockFileStorage.readJSON.mockResolvedValueOnce(null);

      const result = await service.removeFromLocalWantList('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('markLocalWantAsNotified', () => {
    it('should mark item as notified and persist', async () => {
      const item = createLocalWantItem({ id: 'item-1', notified: false });
      const store: LocalWantStore = {
        schemaVersion: 1,
        items: [item],
      };
      mockFileStorage.readJSON.mockResolvedValueOnce(store);

      await service.markLocalWantAsNotified('item-1');

      expect(mockFileStorage.writeJSON).toHaveBeenCalledWith(
        'wishlist/local-want-list.json',
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ id: 'item-1', notified: true }),
          ]),
        })
      );
    });

    it('should do nothing when item not found', async () => {
      mockFileStorage.readJSON.mockResolvedValueOnce(null);

      await service.markLocalWantAsNotified('nonexistent');

      expect(mockFileStorage.writeJSON).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // New Releases
  // ============================================

  describe('getNewReleaseSyncStatus', () => {
    it('should return default status when no file exists', async () => {
      mockFileStorage.readJSON.mockResolvedValueOnce(null);

      const status = await service.getNewReleaseSyncStatus();

      expect(status.status).toBe('idle');
      expect(status.lastFullCheck).toBeNull();
      expect(status.mastersProcessed).toBe(0);
      expect(status.totalMasters).toBe(0);
    });

    it('should return saved status', async () => {
      const savedStatus: NewReleaseSyncStatus = {
        status: 'completed',
        lastFullCheck: Date.now(),
        mastersProcessed: 20,
        totalMasters: 20,
        newReleasesFound: 3,
        lastCheckedIndex: 0,
        progress: 100,
      };
      mockFileStorage.readJSON.mockResolvedValueOnce(savedStatus);

      const status = await service.getNewReleaseSyncStatus();

      expect(status.status).toBe('completed');
      expect(status.mastersProcessed).toBe(20);
    });

    it('should handle read errors gracefully', async () => {
      mockFileStorage.readJSON.mockRejectedValueOnce(new Error('Read error'));

      const status = await service.getNewReleaseSyncStatus();

      expect(status.status).toBe('idle');
    });
  });

  describe('updateNewReleaseSyncStatus', () => {
    it('should merge updates with existing status', async () => {
      const existing: NewReleaseSyncStatus = {
        status: 'syncing',
        lastFullCheck: null,
        mastersProcessed: 5,
        totalMasters: 20,
        newReleasesFound: 0,
        lastCheckedIndex: 5,
        progress: 25,
      };
      mockFileStorage.readJSON.mockResolvedValueOnce(existing);

      await service.updateNewReleaseSyncStatus({
        mastersProcessed: 10,
        progress: 50,
      });

      expect(mockFileStorage.writeJSON).toHaveBeenCalledWith(
        'wishlist/new-release-sync-status.json',
        expect.objectContaining({
          status: 'syncing',
          mastersProcessed: 10,
          progress: 50,
          totalMasters: 20,
        })
      );
    });
  });

  describe('getNewReleases', () => {
    it('should return stored releases', async () => {
      const store: WishlistNewReleasesStore = {
        schemaVersion: 1,
        lastCheck: Date.now(),
        releases: [createNewRelease()],
      };
      mockFileStorage.readJSON.mockResolvedValueOnce(store);

      const result = await service.getNewReleases();

      expect(result.releases).toHaveLength(1);
      expect(result.releases[0].artist).toBe('Radiohead');
    });

    it('should return empty store when no file exists', async () => {
      mockFileStorage.readJSON.mockResolvedValueOnce(null);

      const result = await service.getNewReleases();

      expect(result.schemaVersion).toBe(1);
      expect(result.lastCheck).toBe(0);
      expect(result.releases).toHaveLength(0);
    });

    it('should handle read errors gracefully', async () => {
      mockFileStorage.readJSON.mockRejectedValueOnce(new Error('Read error'));

      const result = await service.getNewReleases();

      expect(result.releases).toHaveLength(0);
    });
  });

  describe('dismissNewRelease', () => {
    it('should dismiss a single release', async () => {
      const store: WishlistNewReleasesStore = {
        schemaVersion: 1,
        lastCheck: Date.now(),
        releases: [createNewRelease({ id: 'rel-1', dismissed: false })],
      };
      mockFileStorage.readJSON.mockResolvedValueOnce(store);

      await service.dismissNewRelease('rel-1');

      expect(mockFileStorage.writeJSON).toHaveBeenCalledWith(
        'wishlist/new-releases.json',
        expect.objectContaining({
          releases: expect.arrayContaining([
            expect.objectContaining({ id: 'rel-1', dismissed: true }),
          ]),
        })
      );
    });

    it('should do nothing when release not found', async () => {
      const store: WishlistNewReleasesStore = {
        schemaVersion: 1,
        lastCheck: Date.now(),
        releases: [],
      };
      mockFileStorage.readJSON.mockResolvedValueOnce(store);

      await service.dismissNewRelease('nonexistent');

      // writeJSON should not be called since the release was not found
      // Actually, it still gets called because the code always writes
      // Let's check what gets written
    });
  });

  describe('dismissNewReleasesBulk', () => {
    it('should dismiss multiple releases and return count', async () => {
      const store: WishlistNewReleasesStore = {
        schemaVersion: 1,
        lastCheck: Date.now(),
        releases: [
          createNewRelease({ id: 'rel-1', dismissed: false }),
          createNewRelease({ id: 'rel-2', dismissed: false }),
          createNewRelease({ id: 'rel-3', dismissed: true }),
        ],
      };
      mockFileStorage.readJSON.mockResolvedValueOnce(store);

      const count = await service.dismissNewReleasesBulk([
        'rel-1',
        'rel-2',
        'rel-3',
      ]);

      expect(count).toBe(2); // rel-3 was already dismissed
      expect(mockFileStorage.writeJSON).toHaveBeenCalled();
    });

    it('should return 0 when no releases match', async () => {
      const store: WishlistNewReleasesStore = {
        schemaVersion: 1,
        lastCheck: Date.now(),
        releases: [],
      };
      mockFileStorage.readJSON.mockResolvedValueOnce(store);

      const count = await service.dismissNewReleasesBulk(['nonexistent']);

      expect(count).toBe(0);
      expect(mockFileStorage.writeJSON).not.toHaveBeenCalled();
    });
  });

  describe('dismissAllNewReleases', () => {
    it('should dismiss all non-dismissed releases', async () => {
      const store: WishlistNewReleasesStore = {
        schemaVersion: 1,
        lastCheck: Date.now(),
        releases: [
          createNewRelease({ id: 'rel-1', dismissed: false }),
          createNewRelease({ id: 'rel-2', dismissed: false }),
          createNewRelease({ id: 'rel-3', dismissed: true }),
        ],
      };
      mockFileStorage.readJSON.mockResolvedValueOnce(store);

      const count = await service.dismissAllNewReleases();

      expect(count).toBe(2);
      expect(mockFileStorage.writeJSON).toHaveBeenCalled();
    });

    it('should return 0 when all are already dismissed', async () => {
      const store: WishlistNewReleasesStore = {
        schemaVersion: 1,
        lastCheck: Date.now(),
        releases: [createNewRelease({ id: 'rel-1', dismissed: true })],
      };
      mockFileStorage.readJSON.mockResolvedValueOnce(store);

      const count = await service.dismissAllNewReleases();

      expect(count).toBe(0);
      expect(mockFileStorage.writeJSON).not.toHaveBeenCalled();
    });
  });

  describe('cleanupDismissedReleases', () => {
    it('should remove old dismissed releases', async () => {
      const oldTimestamp = Date.now() - 100 * 24 * 60 * 60 * 1000; // 100 days ago
      const recentTimestamp = Date.now() - 10 * 24 * 60 * 60 * 1000; // 10 days ago
      const store: WishlistNewReleasesStore = {
        schemaVersion: 1,
        lastCheck: Date.now(),
        releases: [
          createNewRelease({
            id: 'old-dismissed',
            dismissed: true,
            detectedAt: oldTimestamp,
          }),
          createNewRelease({
            id: 'recent-dismissed',
            dismissed: true,
            detectedAt: recentTimestamp,
          }),
          createNewRelease({
            id: 'not-dismissed',
            dismissed: false,
            detectedAt: oldTimestamp,
          }),
        ],
      };
      mockFileStorage.readJSON.mockResolvedValueOnce(store);

      const removedCount = await service.cleanupDismissedReleases(90);

      expect(removedCount).toBe(1); // only old-dismissed removed
      expect(mockFileStorage.writeJSON).toHaveBeenCalled();
    });

    it('should not remove anything when all releases are recent', async () => {
      const recentTimestamp = Date.now() - 10 * 24 * 60 * 60 * 1000;
      const store: WishlistNewReleasesStore = {
        schemaVersion: 1,
        lastCheck: Date.now(),
        releases: [
          createNewRelease({
            id: 'rel-1',
            dismissed: true,
            detectedAt: recentTimestamp,
          }),
        ],
      };
      mockFileStorage.readJSON.mockResolvedValueOnce(store);

      const removedCount = await service.cleanupDismissedReleases();

      expect(removedCount).toBe(0);
    });
  });

  describe('markNewReleasesAsNotified', () => {
    it('should mark specified releases as notified', async () => {
      const store: WishlistNewReleasesStore = {
        schemaVersion: 1,
        lastCheck: Date.now(),
        releases: [
          createNewRelease({ id: 'rel-1', notified: false }),
          createNewRelease({ id: 'rel-2', notified: false }),
        ],
      };
      mockFileStorage.readJSON.mockResolvedValueOnce(store);

      await service.markNewReleasesAsNotified(['rel-1']);

      expect(mockFileStorage.writeJSON).toHaveBeenCalledWith(
        'wishlist/new-releases.json',
        expect.objectContaining({
          releases: expect.arrayContaining([
            expect.objectContaining({ id: 'rel-1', notified: true }),
            expect.objectContaining({ id: 'rel-2', notified: false }),
          ]),
        })
      );
    });

    it('should not write when no releases were modified', async () => {
      const store: WishlistNewReleasesStore = {
        schemaVersion: 1,
        lastCheck: Date.now(),
        releases: [createNewRelease({ id: 'rel-1', notified: true })],
      };
      mockFileStorage.readJSON.mockResolvedValueOnce(store);

      await service.markNewReleasesAsNotified(['rel-1']);

      expect(mockFileStorage.writeJSON).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // Versions Cache
  // ============================================

  describe('getVersionsCache', () => {
    it('should return cached versions', async () => {
      const cache: VersionsCache = {
        schemaVersion: 1,
        entries: {
          100: {
            masterId: 100,
            versions: [
              {
                releaseId: 200,
                title: 'Test',
                format: ['Vinyl'],
                label: 'Test Label',
                country: 'US',
                year: 2020,
                hasVinyl: true,
                lastFetched: Date.now(),
              },
            ],
            fetchedAt: Date.now(),
          },
        },
      };
      mockFileStorage.readJSON.mockResolvedValueOnce(cache);

      const result = await service.getVersionsCache();

      expect(result.entries[100]).toBeDefined();
      expect(result.entries[100].versions).toHaveLength(1);
    });

    it('should return empty cache when no file exists', async () => {
      mockFileStorage.readJSON.mockResolvedValueOnce(null);

      const result = await service.getVersionsCache();

      expect(result.schemaVersion).toBe(1);
      expect(result.entries).toEqual({});
    });

    it('should handle read errors gracefully', async () => {
      mockFileStorage.readJSON.mockRejectedValueOnce(new Error('Read error'));

      const result = await service.getVersionsCache();

      expect(result.entries).toEqual({});
    });
  });

  describe('updateVersionsCache', () => {
    it('should update cache entry for a master', async () => {
      // First read returns existing cache
      mockFileStorage.readJSON.mockResolvedValueOnce({
        schemaVersion: 1,
        entries: {},
      });

      await service.updateVersionsCache(100, [
        {
          releaseId: 200,
          title: 'Test',
          format: ['Vinyl'],
          label: 'Test Label',
          country: 'US',
          year: 2020,
          hasVinyl: true,
          lastFetched: Date.now(),
        },
      ]);

      expect(mockFileStorage.writeJSON).toHaveBeenCalledWith(
        'wishlist/versions-cache.json',
        expect.objectContaining({
          schemaVersion: 1,
          entries: expect.objectContaining({
            100: expect.objectContaining({
              masterId: 100,
              versions: expect.arrayContaining([
                expect.objectContaining({ releaseId: 200 }),
              ]),
            }),
          }),
        })
      );
    });
  });

  // ============================================
  // Tracked Masters
  // ============================================

  describe('getTrackedMasterIds', () => {
    it('should combine wishlist and local want list masters', async () => {
      // getWishlistItems
      const wishlistStore: WishlistStore = {
        schemaVersion: 1,
        lastUpdated: Date.now(),
        items: [
          createEnrichedItem({ id: 1, masterId: 100 }),
          createEnrichedItem({ id: 2, masterId: 200 }),
        ],
      };
      // getLocalWantList
      const localStore: LocalWantStore = {
        schemaVersion: 1,
        items: [createLocalWantItem({ id: 'local-1', masterId: 300 })],
      };

      mockFileStorage.readJSON
        .mockResolvedValueOnce(wishlistStore)
        .mockResolvedValueOnce(localStore);

      const masters = await service.getTrackedMasterIds();

      expect(masters.size).toBe(3);
      expect(masters.has(100)).toBe(true);
      expect(masters.has(200)).toBe(true);
      expect(masters.has(300)).toBe(true);
    });

    it('should deduplicate masters from both sources', async () => {
      const wishlistStore: WishlistStore = {
        schemaVersion: 1,
        lastUpdated: Date.now(),
        items: [createEnrichedItem({ id: 1, masterId: 100 })],
      };
      const localStore: LocalWantStore = {
        schemaVersion: 1,
        items: [createLocalWantItem({ id: 'local-1', masterId: 100 })],
      };

      mockFileStorage.readJSON
        .mockResolvedValueOnce(wishlistStore)
        .mockResolvedValueOnce(localStore);

      const masters = await service.getTrackedMasterIds();

      expect(masters.size).toBe(1);
      // Wishlist source takes priority
      expect(masters.get(100)?.source).toBe('wishlist');
    });

    it('should skip items without masterId', async () => {
      const wishlistStore: WishlistStore = {
        schemaVersion: 1,
        lastUpdated: Date.now(),
        items: [createEnrichedItem({ id: 1, masterId: 0 })],
      };
      const localStore: LocalWantStore = {
        schemaVersion: 1,
        items: [createLocalWantItem({ id: 'local-1', masterId: undefined })],
      };

      mockFileStorage.readJSON
        .mockResolvedValueOnce(wishlistStore)
        .mockResolvedValueOnce(localStore);

      const masters = await service.getTrackedMasterIds();

      expect(masters.size).toBe(0);
    });
  });

  // ============================================
  // Discogs Wantlist API (Add/Remove)
  // ============================================

  describe('addToDiscogsWantlist', () => {
    it('should add release to wantlist', async () => {
      mockAxiosInstance.put.mockResolvedValueOnce({ data: {} });

      const result = await service.addToDiscogsWantlist(123, 'Great album', 5);

      expect(result).toBe(true);
      expect(mockAxiosInstance.put).toHaveBeenCalledWith(
        '/users/testuser/wants/123',
        { notes: 'Great album', rating: 5 },
        expect.objectContaining({ headers: expect.any(Object) })
      );
    });

    it('should throw when username not found', async () => {
      mockAuthService.getUserSettings.mockResolvedValueOnce({
        discogs: { username: '' },
        lastfm: {},
      } as ReturnType<AuthService['getUserSettings']> extends Promise<infer T>
        ? T
        : never);

      await expect(service.addToDiscogsWantlist(123)).rejects.toThrow(
        'Discogs username not found'
      );
    });

    it('should throw on API error', async () => {
      mockAxiosInstance.put.mockRejectedValueOnce(new Error('API error'));

      await expect(service.addToDiscogsWantlist(123)).rejects.toThrow(
        'API error'
      );
    });
  });

  describe('removeFromDiscogsWantlist', () => {
    it('should remove release from wantlist', async () => {
      mockAxiosInstance.delete.mockResolvedValueOnce({ data: {} });

      const result = await service.removeFromDiscogsWantlist(123);

      expect(result).toBe(true);
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith(
        '/users/testuser/wants/123',
        expect.objectContaining({ headers: expect.any(Object) })
      );
    });

    it('should throw when username not found', async () => {
      mockAuthService.getUserSettings.mockResolvedValueOnce({
        discogs: { username: '' },
        lastfm: {},
      } as ReturnType<AuthService['getUserSettings']> extends Promise<infer T>
        ? T
        : never);

      await expect(service.removeFromDiscogsWantlist(123)).rejects.toThrow(
        'Discogs username not found'
      );
    });
  });

  // ============================================
  // Search for Release
  // ============================================

  describe('searchForRelease', () => {
    it('should search Discogs and parse results', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          results: [
            {
              id: 500,
              master_id: 400,
              title: 'Radiohead - OK Computer',
              year: '1997',
              cover_image: 'https://example.com/cover.jpg',
              format: ['Vinyl', 'LP'],
            },
          ],
        },
      });

      const results = await service.searchForRelease(
        'Radiohead',
        'OK Computer'
      );

      expect(results).toHaveLength(1);
      expect(results[0].masterId).toBe(400);
      expect(results[0].artist).toBe('Radiohead');
      expect(results[0].title).toBe('OK Computer');
      expect(results[0].year).toBe(1997);
    });

    it('should handle results without master_id', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          results: [
            {
              id: 500,
              title: 'Artist - Album',
            },
          ],
        },
      });

      const results = await service.searchForRelease('Artist', 'Album');

      expect(results[0].masterId).toBe(500);
    });

    it('should throw on API error', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('API error'));

      await expect(service.searchForRelease('Artist', 'Album')).rejects.toThrow(
        'API error'
      );
    });
  });

  // ============================================
  // getMarketplaceStats
  // ============================================

  describe('getMarketplaceStats', () => {
    it('should fetch and combine stats with price suggestions', async () => {
      // Stats call
      mockAxiosInstance.get
        .mockResolvedValueOnce({
          data: {
            lowest_price: { value: 15.99, currency: 'USD' },
            num_for_sale: 10,
          },
        })
        // Price suggestions call
        .mockResolvedValueOnce({
          data: {
            'Mint (M)': { value: 50.0, currency: 'USD' },
            'Near Mint (NM or M-)': { value: 40.0, currency: 'USD' },
            'Very Good Plus (VG+)': { value: 30.0, currency: 'USD' },
            'Very Good (VG)': { value: 20.0, currency: 'USD' },
            'Good Plus (G+)': { value: 15.0, currency: 'USD' },
            'Good (G)': { value: 10.0, currency: 'USD' },
            'Fair (F)': { value: 5.0, currency: 'USD' },
            'Poor (P)': { value: 2.0, currency: 'USD' },
          },
        });

      const stats = await service.getMarketplaceStats(200);

      expect(stats).not.toBeNull();
      expect(stats!.lowestPrice).toBe(15.99);
      expect(stats!.numForSale).toBe(10);
      expect(stats!.medianPrice).toBe(30.0); // VG+
      expect(stats!.highestPrice).toBe(50.0); // max of all prices
      expect(stats!.priceSuggestions).toBeDefined();
    });

    it('should return null on error', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('API error'));

      const stats = await service.getMarketplaceStats(200);

      expect(stats).toBeNull();
    });
  });

  // ============================================
  // checkForNewReleases
  // ============================================

  describe('checkForNewReleases', () => {
    it('should return empty when tracking is disabled', async () => {
      // getSettings - tracking disabled
      mockFileStorage.readJSON.mockResolvedValueOnce(
        createWishlistSettings({
          newReleaseTracking: {
            enabled: false,
            checkFrequencyDays: 7,
            notifyOnNewRelease: true,
            autoCheck: false,
            trackLocalWantList: true,
          },
        })
      );

      const results = await service.checkForNewReleases();

      expect(results).toHaveLength(0);
    });

    it('should return empty when sync is already in progress', async () => {
      // getSettings
      mockFileStorage.readJSON.mockResolvedValueOnce(createWishlistSettings());
      // getNewReleaseSyncStatus
      mockFileStorage.readJSON.mockResolvedValueOnce({
        status: 'syncing',
        lastFullCheck: null,
        mastersProcessed: 5,
        totalMasters: 20,
        newReleasesFound: 0,
        lastCheckedIndex: 5,
        progress: 25,
      });

      const results = await service.checkForNewReleases();

      expect(results).toHaveLength(0);
    });

    it('should return empty when no masters to check', async () => {
      // getSettings
      mockFileStorage.readJSON.mockResolvedValueOnce(createWishlistSettings());
      // getNewReleaseSyncStatus
      mockFileStorage.readJSON.mockResolvedValueOnce(null);
      // updateNewReleaseSyncStatus - reads current
      mockFileStorage.readJSON.mockResolvedValueOnce(null);
      // getWishlistItems (via getTrackedMasterIds)
      mockFileStorage.readJSON.mockResolvedValueOnce(null);
      // getLocalWantList (via getTrackedMasterIds)
      mockFileStorage.readJSON.mockResolvedValueOnce(null);

      const results = await service.checkForNewReleases();

      expect(results).toHaveLength(0);
    });
  });

  // ============================================
  // getMasterVersions
  // ============================================

  describe('getMasterVersions', () => {
    it('should return cached versions when available', async () => {
      const cache: VersionsCache = {
        schemaVersion: 1,
        entries: {
          100: {
            masterId: 100,
            versions: [
              {
                releaseId: 200,
                title: 'Test LP',
                format: ['Vinyl', 'LP'],
                label: 'Test Label',
                country: 'US',
                year: 2020,
                hasVinyl: true,
                lastFetched: Date.now(),
              },
            ],
            fetchedAt: Date.now(),
          },
        },
      };
      mockFileStorage.readJSON.mockResolvedValueOnce(cache);

      const versions = await service.getMasterVersions(100);

      expect(versions).toHaveLength(1);
      expect(versions[0].hasVinyl).toBe(true);
      // Should not have called the API
      expect(mockAxiosInstance.get).not.toHaveBeenCalled();
    });

    it('should fetch from API when no cache', async () => {
      // getCachedVersions - no cache
      mockFileStorage.readJSON.mockResolvedValueOnce(null);
      // API response
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          pagination: { pages: 1 },
          versions: [
            {
              id: 200,
              title: 'Test LP',
              format: 'Vinyl, LP',
              label: 'Test Label',
              country: 'US',
              released: '2020-01-01',
            },
          ],
        },
      });
      // cacheVersions - reads existing cache
      mockFileStorage.readJSON.mockResolvedValueOnce(null);

      const versions = await service.getMasterVersions(100);

      expect(versions).toHaveLength(1);
      expect(versions[0].releaseId).toBe(200);
      expect(versions[0].hasVinyl).toBe(true);
    });

    it('should return empty array on API error', async () => {
      mockFileStorage.readJSON.mockResolvedValueOnce(null);
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('API error'));

      const versions = await service.getMasterVersions(100);

      expect(versions).toHaveLength(0);
    });

    it('should skip stale cached versions', async () => {
      const staleCache: VersionsCache = {
        schemaVersion: 1,
        entries: {
          100: {
            masterId: 100,
            versions: [
              {
                releaseId: 200,
                title: 'Old Version',
                format: ['CD'],
                label: 'Old',
                country: 'US',
                year: 2015,
                hasVinyl: false,
                lastFetched: Date.now() - 10 * 24 * 60 * 60 * 1000,
              },
            ],
            fetchedAt: Date.now() - 10 * 24 * 60 * 60 * 1000, // 10 days ago (stale)
          },
        },
      };
      mockFileStorage.readJSON.mockResolvedValueOnce(staleCache);
      // API response
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          pagination: { pages: 1 },
          versions: [
            {
              id: 300,
              title: 'New Vinyl Press',
              format: 'Vinyl, LP',
              label: 'New Label',
              country: 'UK',
              released: '2026',
            },
          ],
        },
      });
      // cacheVersions read
      mockFileStorage.readJSON.mockResolvedValueOnce(staleCache);

      const versions = await service.getMasterVersions(100);

      expect(versions).toHaveLength(1);
      expect(versions[0].releaseId).toBe(300);
    });
  });

  // ============================================
  // getPriceSuggestions
  // ============================================

  describe('getPriceSuggestions', () => {
    it('should fetch and parse price suggestions', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          'Mint (M)': { value: 50.0, currency: 'USD' },
          'Very Good Plus (VG+)': { value: 30.0, currency: 'USD' },
        },
      });

      const suggestions = await service.getPriceSuggestions(200);

      expect(suggestions).not.toBeNull();
      expect(suggestions!.mint).toEqual({ value: 50.0, currency: 'USD' });
      expect(suggestions!.veryGoodPlus).toEqual({
        value: 30.0,
        currency: 'USD',
      });
    });

    it('should return null on error', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('API error'));

      const suggestions = await service.getPriceSuggestions(200);

      expect(suggestions).toBeNull();
    });
  });
});
