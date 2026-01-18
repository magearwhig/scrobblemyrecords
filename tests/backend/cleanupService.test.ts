import * as fs from 'fs/promises';

import { CleanupService } from '../../src/backend/services/cleanupService';
import { FileStorage } from '../../src/backend/utils/fileStorage';
import { SellerMatchesStore, VersionsCache } from '../../src/shared/types';

describe('CleanupService', () => {
  const testDataDir = './test-data-cleanup';
  let fileStorage: FileStorage;
  let cleanupService: CleanupService;

  // Helper to create timestamps relative to now
  const daysAgo = (days: number): number => {
    return Date.now() - days * 24 * 60 * 60 * 1000;
  };

  beforeEach(async () => {
    // Create fresh instances for each test
    fileStorage = new FileStorage(testDataDir);
    await fileStorage.ensureDataDir();
    cleanupService = new CleanupService(fileStorage);
  });

  afterEach(async () => {
    // Clean up test data directory
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch {
      // Ignore errors if directory doesn't exist
    }
  });

  describe('getRetentionSettings', () => {
    it('should return retention settings', () => {
      const settings = cleanupService.getRetentionSettings();

      expect(settings.imageCacheMaxAgeMs).toBe(30 * 24 * 60 * 60 * 1000);
      expect(settings.soldMatchMaxAgeMs).toBe(30 * 24 * 60 * 60 * 1000);
      expect(settings.versionsCacheMaxAgeMs).toBe(7 * 24 * 60 * 60 * 1000);
      expect(settings.inventoryCacheMaxAgeMs).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });

  describe('cleanupImageCache', () => {
    it('should remove expired image cache entries', async () => {
      // Arrange
      await fs.mkdir(`${testDataDir}/images`, { recursive: true });
      const cache = {
        schemaVersion: 1,
        entries: {
          'old-artist|old-album': {
            url: 'http://example.com/old.jpg',
            fetchedAt: daysAgo(35), // 35 days ago - expired
          },
          'new-artist|new-album': {
            url: 'http://example.com/new.jpg',
            fetchedAt: daysAgo(5), // 5 days ago - fresh
          },
        },
      };
      await fs.writeFile(
        `${testDataDir}/images/album-covers.json`,
        JSON.stringify(cache)
      );

      // Act
      const removed = await cleanupService.cleanupImageCache(
        'images/album-covers.json'
      );

      // Assert
      expect(removed).toBe(1);

      // Verify file was updated
      const content = JSON.parse(
        await fs.readFile(`${testDataDir}/images/album-covers.json`, 'utf-8')
      );
      expect(content.entries['old-artist|old-album']).toBeUndefined();
      expect(content.entries['new-artist|new-album']).toBeDefined();
    });

    it('should preserve entries within retention period', async () => {
      // Arrange
      await fs.mkdir(`${testDataDir}/images`, { recursive: true });
      const cache = {
        schemaVersion: 1,
        entries: {
          'fresh-1|album-1': {
            url: 'http://example.com/1.jpg',
            fetchedAt: daysAgo(1),
          },
          'fresh-2|album-2': {
            url: 'http://example.com/2.jpg',
            fetchedAt: daysAgo(29), // Just under 30 day limit
          },
        },
      };
      await fs.writeFile(
        `${testDataDir}/images/album-covers.json`,
        JSON.stringify(cache)
      );

      // Act
      const removed = await cleanupService.cleanupImageCache(
        'images/album-covers.json'
      );

      // Assert
      expect(removed).toBe(0);
    });

    it('should handle missing file gracefully', async () => {
      // Act
      const removed = await cleanupService.cleanupImageCache(
        'images/nonexistent.json'
      );

      // Assert
      expect(removed).toBe(0);
    });

    it('should handle empty entries gracefully', async () => {
      // Arrange
      await fs.mkdir(`${testDataDir}/images`, { recursive: true });
      const cache = { schemaVersion: 1, entries: {} };
      await fs.writeFile(
        `${testDataDir}/images/album-covers.json`,
        JSON.stringify(cache)
      );

      // Act
      const removed = await cleanupService.cleanupImageCache(
        'images/album-covers.json'
      );

      // Assert
      expect(removed).toBe(0);
    });
  });

  describe('cleanupSoldMatches', () => {
    it('should remove old sold matches', async () => {
      // Arrange
      await fs.mkdir(`${testDataDir}/sellers`, { recursive: true });
      const store: SellerMatchesStore = {
        schemaVersion: 1,
        lastUpdated: Date.now(),
        matches: [
          {
            id: '1',
            sellerId: 'seller1',
            releaseId: 100,
            artist: 'Artist 1',
            title: 'Album 1',
            format: ['LP'],
            condition: 'VG+',
            price: 20,
            currency: 'USD',
            listingUrl: 'http://example.com/1',
            listingId: 1,
            dateFound: daysAgo(35), // 35 days ago - expired
            notified: true,
            status: 'sold',
          },
          {
            id: '2',
            sellerId: 'seller2',
            releaseId: 200,
            artist: 'Artist 2',
            title: 'Album 2',
            format: ['LP'],
            condition: 'NM',
            price: 30,
            currency: 'USD',
            listingUrl: 'http://example.com/2',
            listingId: 2,
            dateFound: daysAgo(5), // 5 days ago - fresh
            notified: true,
            status: 'sold',
          },
        ],
      };
      await fs.writeFile(
        `${testDataDir}/sellers/matches.json`,
        JSON.stringify(store)
      );

      // Act
      const removed = await cleanupService.cleanupSoldMatches();

      // Assert
      expect(removed).toBe(1);

      // Verify file was updated
      const content = JSON.parse(
        await fs.readFile(`${testDataDir}/sellers/matches.json`, 'utf-8')
      );
      expect(content.matches).toHaveLength(1);
      expect(content.matches[0].id).toBe('2');
    });

    it('should preserve active and seen matches regardless of age', async () => {
      // Arrange
      await fs.mkdir(`${testDataDir}/sellers`, { recursive: true });
      const store: SellerMatchesStore = {
        schemaVersion: 1,
        lastUpdated: Date.now(),
        matches: [
          {
            id: '1',
            sellerId: 'seller1',
            releaseId: 100,
            artist: 'Artist 1',
            title: 'Album 1',
            format: ['LP'],
            condition: 'VG+',
            price: 20,
            currency: 'USD',
            listingUrl: 'http://example.com/1',
            listingId: 1,
            dateFound: daysAgo(60), // 60 days ago but active
            notified: true,
            status: 'active',
          },
          {
            id: '2',
            sellerId: 'seller2',
            releaseId: 200,
            artist: 'Artist 2',
            title: 'Album 2',
            format: ['LP'],
            condition: 'NM',
            price: 30,
            currency: 'USD',
            listingUrl: 'http://example.com/2',
            listingId: 2,
            dateFound: daysAgo(60), // 60 days ago but seen
            notified: true,
            status: 'seen',
          },
        ],
      };
      await fs.writeFile(
        `${testDataDir}/sellers/matches.json`,
        JSON.stringify(store)
      );

      // Act
      const removed = await cleanupService.cleanupSoldMatches();

      // Assert
      expect(removed).toBe(0);
    });

    it('should handle missing file gracefully', async () => {
      // Act
      const removed = await cleanupService.cleanupSoldMatches();

      // Assert
      expect(removed).toBe(0);
    });
  });

  describe('cleanupVersionsCache', () => {
    it('should remove expired versions cache entries', async () => {
      // Arrange
      await fs.mkdir(`${testDataDir}/wishlist`, { recursive: true });
      const cache: VersionsCache = {
        schemaVersion: 1,
        entries: {
          1234: {
            masterId: 1234,
            versions: [],
            fetchedAt: daysAgo(10), // 10 days ago - expired (7 day limit)
          },
          5678: {
            masterId: 5678,
            versions: [],
            fetchedAt: daysAgo(3), // 3 days ago - fresh
          },
        },
      };
      await fs.writeFile(
        `${testDataDir}/wishlist/versions-cache.json`,
        JSON.stringify(cache)
      );

      // Act
      const removed = await cleanupService.cleanupVersionsCache();

      // Assert
      expect(removed).toBe(1);

      // Verify file was updated
      const content = JSON.parse(
        await fs.readFile(
          `${testDataDir}/wishlist/versions-cache.json`,
          'utf-8'
        )
      );
      expect(content.entries['1234']).toBeUndefined();
      expect(content.entries['5678']).toBeDefined();
    });

    it('should handle missing file gracefully', async () => {
      // Act
      const removed = await cleanupService.cleanupVersionsCache();

      // Assert
      expect(removed).toBe(0);
    });
  });

  describe('cleanupInventoryCaches', () => {
    it('should remove old inventory cache files', async () => {
      // Arrange
      await fs.mkdir(`${testDataDir}/sellers/inventory-cache`, {
        recursive: true,
      });

      // Create an old file
      const oldFilePath = `${testDataDir}/sellers/inventory-cache/old-seller.json`;
      await fs.writeFile(oldFilePath, JSON.stringify({ items: [] }));
      // Set mtime to 10 days ago
      const oldTime = new Date(daysAgo(10));
      await fs.utimes(oldFilePath, oldTime, oldTime);

      // Create a fresh file
      const freshFilePath = `${testDataDir}/sellers/inventory-cache/fresh-seller.json`;
      await fs.writeFile(freshFilePath, JSON.stringify({ items: [] }));

      // Act
      const removed = await cleanupService.cleanupInventoryCaches();

      // Assert
      expect(removed).toBe(1);

      // Verify old file was deleted
      await expect(fs.access(oldFilePath)).rejects.toThrow();
      // Verify fresh file still exists
      await expect(fs.access(freshFilePath)).resolves.toBeUndefined();
    });

    it('should skip non-JSON files', async () => {
      // Arrange
      await fs.mkdir(`${testDataDir}/sellers/inventory-cache`, {
        recursive: true,
      });
      const txtPath = `${testDataDir}/sellers/inventory-cache/readme.txt`;
      await fs.writeFile(txtPath, 'not a json file');
      const oldTime = new Date(daysAgo(10));
      await fs.utimes(txtPath, oldTime, oldTime);

      // Act
      const removed = await cleanupService.cleanupInventoryCaches();

      // Assert
      expect(removed).toBe(0);
      await expect(fs.access(txtPath)).resolves.toBeUndefined();
    });

    it('should handle missing directory gracefully', async () => {
      // Act
      const removed = await cleanupService.cleanupInventoryCaches();

      // Assert
      expect(removed).toBe(0);
    });
  });

  describe('runCleanup', () => {
    it('should return cleanup report with all operations', async () => {
      // Arrange - create various data files
      await fs.mkdir(`${testDataDir}/images`, { recursive: true });
      await fs.mkdir(`${testDataDir}/sellers/inventory-cache`, {
        recursive: true,
      });
      await fs.mkdir(`${testDataDir}/wishlist`, { recursive: true });

      // Old image cache entry
      await fs.writeFile(
        `${testDataDir}/images/album-covers.json`,
        JSON.stringify({
          schemaVersion: 1,
          entries: {
            'old|album': { url: 'http://old.jpg', fetchedAt: daysAgo(35) },
          },
        })
      );

      // Old sold match
      await fs.writeFile(
        `${testDataDir}/sellers/matches.json`,
        JSON.stringify({
          schemaVersion: 1,
          lastUpdated: Date.now(),
          matches: [
            {
              id: '1',
              sellerId: 's1',
              releaseId: 1,
              artist: 'A',
              title: 'T',
              format: ['LP'],
              condition: 'VG',
              price: 10,
              currency: 'USD',
              listingUrl: 'url',
              listingId: 1,
              dateFound: daysAgo(35),
              notified: true,
              status: 'sold',
            },
          ],
        })
      );

      // Old versions cache
      await fs.writeFile(
        `${testDataDir}/wishlist/versions-cache.json`,
        JSON.stringify({
          schemaVersion: 1,
          entries: {
            123: { masterId: 123, versions: [], fetchedAt: daysAgo(10) },
          },
        })
      );

      // Old inventory cache file
      const invPath = `${testDataDir}/sellers/inventory-cache/old.json`;
      await fs.writeFile(invPath, '{}');
      await fs.utimes(invPath, new Date(daysAgo(10)), new Date(daysAgo(10)));

      // Act
      const report = await cleanupService.runCleanup();

      // Assert
      expect(report.imagesRemoved).toBe(1);
      expect(report.soldMatchesRemoved).toBe(1);
      expect(report.versionsCacheEntriesRemoved).toBe(1);
      expect(report.inventoryCacheFilesRemoved).toBe(1);
      expect(report.errors).toHaveLength(0);
      expect(report.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should continue on errors and report them', async () => {
      // Arrange - create an invalid JSON file
      await fs.mkdir(`${testDataDir}/images`, { recursive: true });
      await fs.writeFile(
        `${testDataDir}/images/album-covers.json`,
        'not valid json'
      );

      // Act
      const report = await cleanupService.runCleanup();

      // Assert
      expect(report.errors.length).toBeGreaterThan(0);
      expect(report.errors[0]).toContain('Image cleanup failed');
    });

    it('should handle empty data directory', async () => {
      // Act
      const report = await cleanupService.runCleanup();

      // Assert
      expect(report.imagesRemoved).toBe(0);
      expect(report.soldMatchesRemoved).toBe(0);
      expect(report.versionsCacheEntriesRemoved).toBe(0);
      expect(report.inventoryCacheFilesRemoved).toBe(0);
      expect(report.errors).toHaveLength(0);
    });
  });
});
