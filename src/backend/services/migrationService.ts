/**
 * Migration Service - handles schema versioning and data file migrations.
 *
 * This service ensures all data files have consistent schema versioning and
 * can be upgraded safely as the application evolves.
 *
 * CRITICAL: All migrations are NON-DESTRUCTIVE. Original data is always
 * backed up before any modifications.
 */

import {
  VersionedStore,
  DataFileMeta,
  MigrationReport,
} from '../../shared/types';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

const log = createLogger('MigrationService');

export class MigrationService {
  private storage: FileStorage;
  private registry: Map<string, DataFileMeta> = new Map();

  constructor(storage: FileStorage) {
    this.storage = storage;
    this.registerAllFiles();
  }

  /**
   * Register all known data files and their migrations.
   * Files are grouped by category for clarity.
   */
  private registerAllFiles(): void {
    // ============================================
    // Critical Files
    // ============================================
    this.register('scrobble-history-index', {
      path: 'history/scrobble-history-index.json',
      currentVersion: 1,
      migrations: [],
    });

    // ============================================
    // Settings Files
    // ============================================
    this.register('user-settings', {
      path: 'settings/user-settings.json',
      currentVersion: 1,
      migrations: [],
    });

    this.register('suggestion-settings', {
      path: 'settings/suggestion-settings.json',
      currentVersion: 1,
      migrations: [],
      optional: true,
    });

    this.register('ai-settings', {
      path: 'settings/ai-settings.json',
      currentVersion: 1,
      migrations: [],
      optional: true,
    });

    this.register('sync-settings', {
      path: 'history/sync-settings.json',
      currentVersion: 1,
      migrations: [],
      optional: true,
    });

    // ============================================
    // Mapping Files
    // ============================================
    // Artist mappings for Discogs->Last.fm name transformation (used by artistMappingService)
    this.register('artist-mappings', {
      path: 'mappings/artist-mappings.json',
      currentVersion: 1,
      migrations: [],
      optional: true,
    });

    // Artist mappings for History->Collection matching (used by mappingService)
    this.register('history-artist-mappings', {
      path: 'mappings/history-artist-mappings.json',
      currentVersion: 1,
      migrations: [],
      optional: true,
    });

    this.register('album-mappings', {
      path: 'mappings/album-mappings.json',
      currentVersion: 1,
      migrations: [],
      optional: true,
    });

    // ============================================
    // Discovery Files
    // ============================================
    this.register('hidden-albums', {
      path: 'discovery/hidden-albums.json',
      currentVersion: 1,
      migrations: [],
      optional: true,
    });

    this.register('hidden-artists', {
      path: 'discovery/hidden-artists.json',
      currentVersion: 1,
      migrations: [],
      optional: true,
    });

    // ============================================
    // Image Caches
    // ============================================
    this.register('album-covers-cache', {
      path: 'images/album-covers.json',
      currentVersion: 1,
      migrations: [],
      optional: true,
    });

    this.register('artist-images-cache', {
      path: 'images/artist-images.json',
      currentVersion: 1,
      migrations: [],
      optional: true,
    });

    // ============================================
    // Stats Cache
    // ============================================
    this.register('stats-cache', {
      path: 'stats/stats-cache.json',
      currentVersion: 1,
      migrations: [],
      optional: true,
    });

    // ============================================
    // Wishlist Files (already have schemaVersion)
    // ============================================
    this.register('wishlist-settings', {
      path: 'wishlist/settings.json',
      currentVersion: 1,
      migrations: [],
      optional: true,
    });

    this.register('wishlist-items', {
      path: 'wishlist/wishlist-items.json',
      currentVersion: 1,
      migrations: [],
      optional: true,
    });

    this.register('vinyl-watch-list', {
      path: 'wishlist/vinyl-watch-list.json',
      currentVersion: 1,
      migrations: [],
      optional: true,
    });

    this.register('local-want-list', {
      path: 'wishlist/local-want-list.json',
      currentVersion: 1,
      migrations: [],
      optional: true,
    });

    this.register('versions-cache', {
      path: 'wishlist/versions-cache.json',
      currentVersion: 1,
      migrations: [],
      optional: true,
    });

    // ============================================
    // Seller Monitoring Files (already have schemaVersion)
    // ============================================
    this.register('monitored-sellers', {
      path: 'sellers/monitored-sellers.json',
      currentVersion: 1,
      migrations: [],
      optional: true,
    });

    this.register('seller-matches', {
      path: 'sellers/matches.json',
      currentVersion: 1,
      migrations: [],
      optional: true,
    });

    this.register('seller-settings', {
      path: 'sellers/settings.json',
      currentVersion: 1,
      migrations: [],
      optional: true,
    });
  }

  private register(key: string, meta: DataFileMeta): void {
    this.registry.set(key, meta);
  }

  /**
   * Get the current expected version for a file key.
   */
  getCurrentVersion(fileKey: string): number {
    const meta = this.registry.get(fileKey);
    return meta?.currentVersion ?? 1;
  }

  /**
   * Get all registered file keys.
   */
  getRegisteredFiles(): string[] {
    return Array.from(this.registry.keys());
  }

  /**
   * Load a data file, applying any necessary migrations.
   * Returns null if file doesn't exist.
   *
   * IMPORTANT: This method creates a backup before any modifications.
   */
  async loadWithMigration<T extends VersionedStore>(
    fileKey: string
  ): Promise<T | null> {
    const meta = this.registry.get(fileKey);
    if (!meta) {
      throw new Error(`Unknown data file key: ${fileKey}`);
    }

    const data = await this.storage.readJSON<Record<string, unknown>>(
      meta.path
    );
    if (!data) {
      return null;
    }

    const fileVersion =
      typeof data.schemaVersion === 'number' ? data.schemaVersion : 0;

    // Future version check - reject if file is newer than we support
    if (fileVersion > meta.currentVersion) {
      throw new Error(
        `File ${meta.path} has schemaVersion ${fileVersion}, but this app only supports up to v${meta.currentVersion}. ` +
          `Please update the application.`
      );
    }

    // Apply migrations if needed
    if (fileVersion < meta.currentVersion) {
      log.info(
        `Migrating ${fileKey} from v${fileVersion} to v${meta.currentVersion}`
      );
      const migrated = this.applyMigrations(data, fileVersion, meta);
      // writeJSONWithBackup creates backup before writing
      await this.storage.writeJSONWithBackup(meta.path, migrated);
      return migrated as T;
    }

    return data as T;
  }

  /**
   * Apply migrations sequentially from current version to target.
   */
  private applyMigrations(
    data: Record<string, unknown>,
    fromVersion: number,
    meta: DataFileMeta
  ): Record<string, unknown> {
    let current = { ...data };
    let version = fromVersion;

    const sortedMigrations = [...meta.migrations].sort(
      (a, b) => a.fromVersion - b.fromVersion
    );

    for (const migration of sortedMigrations) {
      if (migration.fromVersion === version && migration.toVersion > version) {
        log.debug(
          `Applying migration: ${migration.description || `v${version} -> v${migration.toVersion}`}`
        );
        current = migration.migrate(current) as Record<string, unknown>;
        version = migration.toVersion;
      }
    }

    current.schemaVersion = meta.currentVersion;
    return current;
  }

  /**
   * Run on app startup to ensure all files are migrated.
   * This is NON-BLOCKING and runs asynchronously.
   *
   * For files without schemaVersion, we ONLY ADD the version field
   * without modifying any other data.
   */
  async migrateAllOnStartup(
    onProgress?: (
      file: string,
      status: 'checking' | 'migrating' | 'done' | 'error'
    ) => void
  ): Promise<MigrationReport> {
    const report: MigrationReport = {
      checked: 0,
      migrated: 0,
      stamped: 0,
      errors: [],
      startTime: Date.now(),
      endTime: 0,
    };

    log.info('Starting data file migration check...');

    for (const [key, meta] of this.registry) {
      try {
        onProgress?.(key, 'checking');

        const exists = await this.storage.exists(meta.path);
        if (!exists) {
          if (!meta.optional) {
            log.debug(`Skipping ${key}: file does not exist`);
          }
          continue;
        }

        report.checked++;

        const data = await this.storage.readJSON<Record<string, unknown>>(
          meta.path
        );
        if (!data) continue;

        const fileVersion =
          typeof data.schemaVersion === 'number' ? data.schemaVersion : 0;

        if (fileVersion === 0) {
          // Stamp with version 1 - ONLY add schemaVersion, preserve all other data
          onProgress?.(key, 'migrating');
          data.schemaVersion = 1;
          // Use writeJSONWithBackup to ensure backup is created
          await this.storage.writeJSONWithBackup(meta.path, data);
          report.stamped++;
          log.info(`Stamped ${key} with schemaVersion: 1`);
        } else if (fileVersion < meta.currentVersion) {
          // Apply migrations
          onProgress?.(key, 'migrating');
          await this.loadWithMigration(key);
          report.migrated++;
        }

        onProgress?.(key, 'done');
      } catch (error) {
        onProgress?.(key, 'error');
        const message = error instanceof Error ? error.message : String(error);
        report.errors.push({ file: key, error: message });
        log.error(`Migration check failed for ${key}: ${message}`);
      }
    }

    report.endTime = Date.now();
    log.info(
      `Migration check complete: ${report.checked} checked, ${report.stamped} stamped, ` +
        `${report.migrated} migrated, ${report.errors.length} errors (${report.endTime - report.startTime}ms)`
    );

    return report;
  }

  /**
   * Check if a file needs migration (for testing/debugging).
   */
  async checkFileStatus(fileKey: string): Promise<{
    exists: boolean;
    currentVersion: number | null;
    expectedVersion: number;
    needsMigration: boolean;
  }> {
    const meta = this.registry.get(fileKey);
    if (!meta) {
      throw new Error(`Unknown data file key: ${fileKey}`);
    }

    const exists = await this.storage.exists(meta.path);
    if (!exists) {
      return {
        exists: false,
        currentVersion: null,
        expectedVersion: meta.currentVersion,
        needsMigration: false,
      };
    }

    const data = await this.storage.readJSON<Record<string, unknown>>(
      meta.path
    );
    const currentVersion =
      data && typeof data.schemaVersion === 'number' ? data.schemaVersion : 0;

    return {
      exists: true,
      currentVersion,
      expectedVersion: meta.currentVersion,
      needsMigration: currentVersion < meta.currentVersion,
    };
  }
}
