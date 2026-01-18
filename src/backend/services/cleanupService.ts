/**
 * CleanupService - manages cache retention and cleanup routines.
 *
 * This service removes stale cached data to prevent unbounded growth.
 * All cleanup operations are safe - they only remove recoverable cache data,
 * never critical user data like settings, mappings, or history.
 *
 * Retention policies:
 * - Image cache (album/artist): 30 days max age
 * - Sold matches: 30 days max age after status changed to 'sold'
 * - Versions cache (wishlist): 7 days max age
 * - Seller inventory cache: 7 days max age (based on file mtime)
 * - Collection artists cache (releases): 24 hours max age (uses fetchedAt timestamp)
 */

import {
  CollectionArtistsCacheStore,
  SellerMatchesStore,
  VersionsCache,
} from '../../shared/types';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';
import { nowUnixMs } from '../utils/timestamps';

const log = createLogger('CleanupService');

/**
 * Image cache structure (matches imageService.ts)
 */
interface ImageCacheEntry {
  url: string | null;
  fetchedAt: number;
}

interface ImageCache {
  schemaVersion: 1;
  entries: Record<string, ImageCacheEntry>;
}

/**
 * Report of cleanup operations performed.
 */
export interface CleanupReport {
  imagesRemoved: number;
  soldMatchesRemoved: number;
  versionsCacheEntriesRemoved: number;
  inventoryCacheFilesRemoved: number;
  collectionArtistsCacheCleared: boolean;
  errors: string[];
  durationMs: number;
}

export class CleanupService {
  private storage: FileStorage;

  // Retention periods in milliseconds
  private readonly IMAGE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
  private readonly SOLD_MATCH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
  private readonly VERSIONS_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  private readonly INVENTORY_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  private readonly COLLECTION_ARTISTS_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

  constructor(storage: FileStorage) {
    this.storage = storage;
  }

  /**
   * Run all cleanup routines. Safe to call frequently (idempotent).
   * This is designed to run on app startup without blocking.
   */
  async runCleanup(): Promise<CleanupReport> {
    const startTime = nowUnixMs();

    const report: CleanupReport = {
      imagesRemoved: 0,
      soldMatchesRemoved: 0,
      versionsCacheEntriesRemoved: 0,
      inventoryCacheFilesRemoved: 0,
      collectionArtistsCacheCleared: false,
      errors: [],
      durationMs: 0,
    };

    log.info('Starting cache cleanup...');

    // Image caches
    try {
      report.imagesRemoved += await this.cleanupImageCache(
        'images/album-covers.json'
      );
      report.imagesRemoved += await this.cleanupImageCache(
        'images/artist-images.json'
      );
    } catch (e) {
      const msg = `Image cleanup failed: ${e instanceof Error ? e.message : String(e)}`;
      report.errors.push(msg);
      log.error(msg);
    }

    // Sold matches
    try {
      report.soldMatchesRemoved = await this.cleanupSoldMatches();
    } catch (e) {
      const msg = `Sold match cleanup failed: ${e instanceof Error ? e.message : String(e)}`;
      report.errors.push(msg);
      log.error(msg);
    }

    // Versions cache (wishlist)
    try {
      report.versionsCacheEntriesRemoved = await this.cleanupVersionsCache();
    } catch (e) {
      const msg = `Versions cache cleanup failed: ${e instanceof Error ? e.message : String(e)}`;
      report.errors.push(msg);
      log.error(msg);
    }

    // Seller inventory caches
    try {
      report.inventoryCacheFilesRemoved = await this.cleanupInventoryCaches();
    } catch (e) {
      const msg = `Inventory cache cleanup failed: ${e instanceof Error ? e.message : String(e)}`;
      report.errors.push(msg);
      log.error(msg);
    }

    // Collection artists cache (release tracking)
    try {
      report.collectionArtistsCacheCleared =
        await this.cleanupCollectionArtistsCache();
    } catch (e) {
      const msg = `Collection artists cache cleanup failed: ${e instanceof Error ? e.message : String(e)}`;
      report.errors.push(msg);
      log.error(msg);
    }

    report.durationMs = nowUnixMs() - startTime;

    log.info(
      `Cleanup complete in ${report.durationMs}ms: ` +
        `${report.imagesRemoved} image entries, ` +
        `${report.soldMatchesRemoved} sold matches, ` +
        `${report.versionsCacheEntriesRemoved} version cache entries, ` +
        `${report.inventoryCacheFilesRemoved} inventory cache files removed${
          report.collectionArtistsCacheCleared
            ? ', collection artists cache cleared'
            : ''
        }${report.errors.length > 0 ? ` (${report.errors.length} errors)` : ''}`
    );

    return report;
  }

  /**
   * Clean up expired entries from an image cache file.
   * Removes entries where fetchedAt is older than IMAGE_CACHE_MAX_AGE_MS.
   *
   * @returns Number of entries removed
   */
  async cleanupImageCache(filePath: string): Promise<number> {
    const cutoff = nowUnixMs() - this.IMAGE_CACHE_MAX_AGE_MS;

    const cache = await this.storage.readJSON<ImageCache>(filePath);
    if (!cache?.entries) return 0;

    const entries = cache.entries;
    let removed = 0;

    // Filter out expired entries
    for (const key of Object.keys(entries)) {
      if (entries[key].fetchedAt < cutoff) {
        delete entries[key];
        removed++;
      }
    }

    if (removed > 0) {
      await this.storage.writeJSONWithBackup(filePath, cache);
      log.debug(`Removed ${removed} expired entries from ${filePath}`);
    }

    return removed;
  }

  /**
   * Clean up old sold matches.
   * Removes matches where status is 'sold' and statusChangedAt is older than
   * SOLD_MATCH_MAX_AGE_MS.
   *
   * Note: We use statusChangedAt as the timestamp since that's when the match
   * became sold. If statusChangedAt is not set, we fall back to dateFound.
   * Sold items older than 30 days are cleaned up.
   *
   * @returns Number of matches removed
   */
  async cleanupSoldMatches(): Promise<number> {
    const cutoff = nowUnixMs() - this.SOLD_MATCH_MAX_AGE_MS;

    const store = await this.storage.readJSON<SellerMatchesStore>(
      'sellers/matches.json'
    );
    if (!store?.matches) return 0;

    const before = store.matches.length;

    // Keep matches that are:
    // - Not sold, OR
    // - Sold but statusChangedAt (or dateFound fallback) is within retention period
    store.matches = store.matches.filter(m => {
      if (m.status !== 'sold') return true;
      // Use statusChangedAt if available, otherwise fall back to dateFound
      const timestamp = m.statusChangedAt ?? m.dateFound;
      return timestamp > cutoff;
    });

    const removed = before - store.matches.length;

    if (removed > 0) {
      await this.storage.writeJSONWithBackup('sellers/matches.json', store);
      log.debug(`Removed ${removed} old sold matches`);
    }

    return removed;
  }

  /**
   * Clean up old versions cache entries.
   * Removes entries where fetchedAt is older than VERSIONS_CACHE_MAX_AGE_MS.
   *
   * @returns Number of entries removed
   */
  async cleanupVersionsCache(): Promise<number> {
    const cutoff = nowUnixMs() - this.VERSIONS_CACHE_MAX_AGE_MS;

    const cache = await this.storage.readJSON<VersionsCache>(
      'wishlist/versions-cache.json'
    );
    if (!cache?.entries) return 0;

    let removed = 0;

    // Filter out expired entries
    for (const masterIdStr of Object.keys(cache.entries)) {
      const masterId = Number(masterIdStr);
      const entry = cache.entries[masterId];
      if (entry && entry.fetchedAt < cutoff) {
        delete cache.entries[masterId];
        removed++;
      }
    }

    if (removed > 0) {
      await this.storage.writeJSONWithBackup(
        'wishlist/versions-cache.json',
        cache
      );
      log.debug(`Removed ${removed} expired versions cache entries`);
    }

    return removed;
  }

  /**
   * Clean up old seller inventory cache files.
   * Removes files where file mtime is older than INVENTORY_CACHE_MAX_AGE_MS.
   *
   * @returns Number of files removed
   */
  async cleanupInventoryCaches(): Promise<number> {
    const cutoff = nowUnixMs() - this.INVENTORY_CACHE_MAX_AGE_MS;

    const files = await this.storage.listFiles('sellers/inventory-cache');
    let removed = 0;

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = `sellers/inventory-cache/${file}`;
      const stats = await this.storage.getStats(filePath);

      if (stats.exists && stats.mtime && stats.mtime.getTime() < cutoff) {
        await this.storage.delete(filePath);
        removed++;
        log.debug(`Removed stale inventory cache: ${file}`);
      }
    }

    return removed;
  }

  /**
   * Clean up expired collection artists cache.
   * Removes the entire cache file if fetchedAt is older than
   * COLLECTION_ARTISTS_CACHE_MAX_AGE_MS.
   *
   * @returns True if cache was cleared, false otherwise
   */
  async cleanupCollectionArtistsCache(): Promise<boolean> {
    const cutoff = nowUnixMs() - this.COLLECTION_ARTISTS_CACHE_MAX_AGE_MS;
    const filePath = 'releases/collection-artists-cache.json';

    const cache =
      await this.storage.readJSON<CollectionArtistsCacheStore>(filePath);
    if (!cache?.fetchedAt) return false;

    if (cache.fetchedAt < cutoff) {
      await this.storage.delete(filePath);
      log.debug('Removed stale collection artists cache');
      return true;
    }

    return false;
  }

  /**
   * Get the retention period settings (for testing/debugging).
   */
  getRetentionSettings(): {
    imageCacheMaxAgeMs: number;
    soldMatchMaxAgeMs: number;
    versionsCacheMaxAgeMs: number;
    inventoryCacheMaxAgeMs: number;
    collectionArtistsCacheMaxAgeMs: number;
  } {
    return {
      imageCacheMaxAgeMs: this.IMAGE_CACHE_MAX_AGE_MS,
      soldMatchMaxAgeMs: this.SOLD_MATCH_MAX_AGE_MS,
      versionsCacheMaxAgeMs: this.VERSIONS_CACHE_MAX_AGE_MS,
      inventoryCacheMaxAgeMs: this.INVENTORY_CACHE_MAX_AGE_MS,
      collectionArtistsCacheMaxAgeMs: this.COLLECTION_ARTISTS_CACHE_MAX_AGE_MS,
    };
  }
}
