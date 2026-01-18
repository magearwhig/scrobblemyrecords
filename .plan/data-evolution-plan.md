# Data Evolution & Storage Implementation Plan

## Overview

Feature 0C establishes a **shared migration strategy** for all data files, ensuring consistent schema versioning, timezone handling, and storage bounds across the application. This foundation is critical for the backup system (Feature 10) and prevents data incompatibility as the application evolves.

---

## Current State Analysis

### Existing Schema Versioning

The following files **already have** `schemaVersion: 1`:

| File | Location | Has Version |
|------|----------|-------------|
| Stats Cache | `stats/stats-cache.json` | Yes |
| Notification Store | localStorage | Yes (client-side) |
| Wishlist Settings | `wishlist/settings.json` | Yes |
| Wishlist Store | `wishlist/wishlist-items.json` | Yes |
| Vinyl Watch Store | `wishlist/vinyl-watch-list.json` | Yes |
| Local Want Store | `wishlist/local-want-list.json` | Yes |
| Versions Cache | `wishlist/versions-cache.json` | Yes |
| Monitored Sellers | `sellers/monitored-sellers.json` | Yes |
| Seller Matches | `sellers/matches.json` | Yes |
| Seller Settings | `sellers/settings.json` | Yes |

### Files **Missing** Schema Versioning

| File | Location | Impact |
|------|----------|--------|
| **Scrobble History Index** | `history/scrobble-history-index.json` | **Critical** - 5.5MB, most important file |
| User Settings | `settings/user-settings.json` | High - API credentials |
| Suggestion Settings | `settings/suggestion-settings.json` | Medium |
| AI Settings | `settings/ai-settings.json` | Low |
| Sync Settings | `history/sync-settings.json` | Medium |
| Artist Mappings (Discogs→Last.fm) | `mappings/artist-mappings.json` | Medium |
| Artist Mappings (History→Collection) | `mappings/history-artist-mappings.json` | Medium |
| Album Mappings | `mappings/album-mappings.json` | Medium |
| Hidden Albums | `discovery/hidden-albums.json` | Low |
| Hidden Artists | `discovery/hidden-artists.json` | Low |
| Image Caches | `images/*.json` | Low (recoverable) |

> **✅ Resolved:** Artist mappings path conflict has been fixed:
> - `artistMappingService.ts` now uses `mappings/artist-mappings.json` (Discogs→Last.fm name mapping for scrobbling)
> - `mappingService.ts` now uses `mappings/history-artist-mappings.json` (History→Collection mapping for discovery/analytics)
>
> Both mapping systems are now in the `mappings/` directory, consistent with `album-mappings.json`.

### Timestamp Format Audit

**Current state:** All timestamps in the codebase use **milliseconds** (13-digit Unix timestamps from `Date.now()`).

Examples from existing files:
- `sellers/monitored-sellers.json`: `"addedAt": 1768682866907` (ms)
- `mappings/artist-mappings.json`: `"dateAdded": 1759018990959` (ms)
- `history/scrobble-history-index.json`: `"lastSyncTimestamp": 1768705983000` (ms)

**Decision:** Maintain milliseconds as the standard. Do NOT migrate to seconds - this would break existing data and require complex migrations. The plan originally specified seconds, but milliseconds is already the established convention.

---

## Implementation

### Phase 1: Schema Version Infrastructure

#### 1.1 Types (`src/shared/types.ts`)

Add base interfaces and registry types for versioned data:

```typescript
/**
 * Base interface for all versioned data stores.
 * All new data files MUST extend this interface.
 */
export interface VersionedStore {
  schemaVersion: number;
}

/**
 * Migration function signature for schema upgrades.
 * Takes data at version N and returns data at version N+1.
 */
export type MigrationFn<TFrom, TTo> = (data: TFrom) => TTo;

/**
 * Metadata for a registered data file in the migration system.
 */
export interface DataFileMeta {
  /** Relative path from data directory (e.g., 'history/scrobble-history-index.json') */
  path: string;
  /** Current schema version expected by the application */
  currentVersion: number;
  /** Ordered list of migrations to apply when upgrading */
  migrations: MigrationDefinition[];
  /** If true, skip stamping (file doesn't exist yet or is optional) */
  optional?: boolean;
}

/**
 * A single migration step from one version to the next.
 */
export interface MigrationDefinition {
  fromVersion: number;
  toVersion: number;
  migrate: MigrationFn<unknown, unknown>;
  /** Human-readable description for logging */
  description?: string;
}
```

Update existing interfaces to extend VersionedStore:

```typescript
export interface ScrobbleHistoryIndex extends VersionedStore {
  schemaVersion: 1;
  lastSyncTimestamp: number;  // milliseconds
  totalScrobbles: number;
  oldestScrobbleDate: number; // seconds (Last.fm API returns seconds)
  albums: Record<string, AlbumHistory>;
}

export interface UserSettings extends VersionedStore {
  schemaVersion: 1;
  // existing fields...
}

export interface ArtistMappingsStore extends VersionedStore {
  schemaVersion: 1;
  mappings: ArtistMapping[];
}

export interface AlbumMappingsStore extends VersionedStore {
  schemaVersion: 1;
  mappings: AlbumMapping[];
}

export interface HiddenAlbumsStore extends VersionedStore {
  schemaVersion: 1;
  items: HiddenAlbum[];
}

export interface HiddenArtistsStore extends VersionedStore {
  schemaVersion: 1;
  items: HiddenArtist[];
}

export interface ImageCacheStore extends VersionedStore {
  schemaVersion: 1;
  entries: ImageCacheEntry[];
  lastCleanup: number;  // milliseconds
}
```

#### 1.2 Migration Service (`src/backend/services/migrationService.ts`)

```typescript
import { FileStorage } from '../utils/fileStorage';
import { VersionedStore, DataFileMeta, MigrationDefinition } from '../../shared/types';
import { logger } from '../utils/logger';

export class MigrationService {
  private storage: FileStorage;
  private registry: Map<string, DataFileMeta> = new Map();

  constructor(storage: FileStorage) {
    this.storage = storage;
    this.registerAllFiles();
  }

  /**
   * Register all known data files and their migrations.
   */
  private registerAllFiles(): void {
    // Critical files
    this.register('scrobble-history-index', {
      path: 'history/scrobble-history-index.json',
      currentVersion: 1,
      migrations: [],
    });

    // Settings files
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

    // Mapping files
    // Artist mappings for Discogs→Last.fm name transformation (used by artistMappingService)
    this.register('artist-mappings', {
      path: 'mappings/artist-mappings.json',
      currentVersion: 1,
      migrations: [],
    });

    // Artist mappings for History→Collection matching (used by mappingService)
    this.register('history-artist-mappings', {
      path: 'mappings/history-artist-mappings.json',
      currentVersion: 1,
      migrations: [],
    });

    this.register('album-mappings', {
      path: 'mappings/album-mappings.json',
      currentVersion: 1,
      migrations: [],
    });

    // Discovery files
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

    // Image caches
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
   * Load a data file, applying any necessary migrations.
   * Returns null if file doesn't exist.
   */
  async loadWithMigration<T extends VersionedStore>(fileKey: string): Promise<T | null> {
    const meta = this.registry.get(fileKey);
    if (!meta) {
      throw new Error(`Unknown data file key: ${fileKey}`);
    }

    const data = await this.storage.readJSON<Record<string, unknown>>(meta.path);
    if (!data) {
      return null;
    }

    const fileVersion = typeof data.schemaVersion === 'number' ? data.schemaVersion : 0;

    // Future version check - reject if file is newer than we support
    if (fileVersion > meta.currentVersion) {
      throw new Error(
        `File ${meta.path} has schemaVersion ${fileVersion}, but this app only supports up to v${meta.currentVersion}. ` +
        `Please update the application.`
      );
    }

    // Apply migrations if needed
    if (fileVersion < meta.currentVersion) {
      logger.info(`Migrating ${fileKey} from v${fileVersion} to v${meta.currentVersion}`);
      const migrated = this.applyMigrations(data, fileVersion, meta);
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
        logger.debug(`Applying migration: ${migration.description || `v${version} -> v${migration.toVersion}`}`);
        current = migration.migrate(current) as Record<string, unknown>;
        version = migration.toVersion;
      }
    }

    current.schemaVersion = meta.currentVersion;
    return current;
  }

  /**
   * Run on app startup to ensure all files are migrated.
   * Runs asynchronously and reports progress.
   */
  async migrateAllOnStartup(onProgress?: (file: string, status: 'checking' | 'migrating' | 'done' | 'error') => void): Promise<MigrationReport> {
    const report: MigrationReport = {
      checked: 0,
      migrated: 0,
      stamped: 0,
      errors: [],
      startTime: Date.now(),
      endTime: 0,
    };

    logger.info('Starting data file migration check...');

    for (const [key, meta] of this.registry) {
      try {
        onProgress?.(key, 'checking');

        const exists = await this.storage.exists(meta.path);
        if (!exists) {
          if (!meta.optional) {
            logger.debug(`Skipping ${key}: file does not exist`);
          }
          continue;
        }

        report.checked++;

        const data = await this.storage.readJSON<Record<string, unknown>>(meta.path);
        if (!data) continue;

        const fileVersion = typeof data.schemaVersion === 'number' ? data.schemaVersion : 0;

        if (fileVersion === 0) {
          // Stamp with version 1
          onProgress?.(key, 'migrating');
          data.schemaVersion = 1;
          await this.storage.writeJSONWithBackup(meta.path, data);
          report.stamped++;
          logger.info(`Stamped ${key} with schemaVersion: 1`);
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
        logger.error(`Migration check failed for ${key}: ${message}`);
      }
    }

    report.endTime = Date.now();
    logger.info(`Migration check complete: ${report.checked} checked, ${report.stamped} stamped, ${report.migrated} migrated, ${report.errors.length} errors (${report.endTime - report.startTime}ms)`);

    return report;
  }
}

export interface MigrationReport {
  checked: number;
  migrated: number;
  stamped: number;
  errors: { file: string; error: string }[];
  startTime: number;
  endTime: number;
}
```

#### 1.3 Server Integration (`src/server.ts`)

```typescript
// During server startup, after FileStorage is ready but before accepting requests
const migrationService = new MigrationService(fileStorage);

// Run migrations asynchronously - don't block server startup
// but log progress for visibility
migrationService.migrateAllOnStartup((file, status) => {
  if (status === 'migrating') {
    logger.info(`Migrating data file: ${file}`);
  }
}).then(report => {
  if (report.errors.length > 0) {
    logger.warn(`Migration completed with ${report.errors.length} errors`);
  }
}).catch(err => {
  logger.error('Migration startup check failed:', err);
  // Don't crash server - migrations are best-effort on startup
});
```

---

### Phase 2: Timestamp Handling

#### 2.1 Timestamp Conventions

**All timestamps in data files use milliseconds** (consistent with existing data):

```typescript
// Utility functions (src/backend/utils/timestamps.ts)

/** Convert Date to Unix milliseconds */
export const toUnixMs = (date: Date): number => date.getTime();

/** Convert Unix milliseconds to Date */
export const fromUnixMs = (timestamp: number): Date => new Date(timestamp);

/** Get current time as Unix milliseconds */
export const nowUnixMs = (): number => Date.now();

/** Check if a timestamp appears to be seconds (10 digits) vs milliseconds (13 digits) */
export const isLikelySeconds = (timestamp: number): boolean => {
  return timestamp < 10000000000; // Before year 2286 in seconds, or year 1970 in ms
};

/** Normalize a timestamp to milliseconds (handles both seconds and ms input) */
export const normalizeToMs = (timestamp: number): number => {
  return isLikelySeconds(timestamp) ? timestamp * 1000 : timestamp;
};
```

**Exception:** Last.fm API returns timestamps in **seconds**. These should be normalized when stored:
- `oldestScrobbleDate` in history index uses seconds (from Last.fm)
- Scrobble timestamps in `plays[]` arrays use seconds (from Last.fm)

#### 2.2 Day Boundary for Streaks

**Note:** All internal timestamps use milliseconds. The "Unix seconds" reference previously in this section was an error - see section 2.1 Timestamp Conventions above.

A "day" for streak purposes is defined as:
- User's local timezone
- Midnight (00:00:00) to 23:59:59

```typescript
/** Get local date string (YYYY-MM-DD) from millisecond timestamp */
export function getLocalDateString(timestampMs: number): string {
  const date = new Date(timestampMs);
  return date.toLocaleDateString('en-CA'); // YYYY-MM-DD format
}

/** Check if two timestamps are on the same local calendar day */
export function areSameLocalDay(ts1Ms: number, ts2Ms: number): boolean {
  return getLocalDateString(ts1Ms) === getLocalDateString(ts2Ms);
}

/** Check if two timestamps are on consecutive local calendar days */
export function areConsecutiveLocalDays(ts1Ms: number, ts2Ms: number): boolean {
  const date1 = new Date(ts1Ms);
  const date2 = new Date(ts2Ms);
  date1.setHours(0, 0, 0, 0);
  date2.setHours(0, 0, 0, 0);
  const diffDays = Math.abs(date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24);
  return Math.round(diffDays) === 1;
}
```

---

### Phase 3: Storage Bounds & Cleanup

#### 3.1 Cache Retention Policy

| Cache Type | Max Age | Max Entries | Cleanup Trigger |
|------------|---------|-------------|-----------------|
| Image URLs (album/artist) | 30 days | 10,000 | App startup |
| Seller Inventory Cache | 7 days | Per seller | After scan |
| Wishlist Versions Cache | 7 days | Unlimited | After sync |
| Price Data (in versions cache) | 24 hours | Per release | On access (lazy) |
| Sold Matches | 30 days | Unlimited | After scan |

#### 3.2 Cleanup Service (`src/backend/services/cleanupService.ts`)

```typescript
import { FileStorage } from '../utils/fileStorage';
import { ImageCacheStore, VersionsCache, SellerMatchesStore } from '../../shared/types';
import { logger } from '../utils/logger';
import { nowUnixMs } from '../utils/timestamps';

export class CleanupService {
  private storage: FileStorage;

  // Retention periods in milliseconds
  private readonly IMAGE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;  // 30 days
  private readonly SOLD_MATCH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;   // 30 days
  private readonly VERSIONS_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  private readonly INVENTORY_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  constructor(storage: FileStorage) {
    this.storage = storage;
  }

  /**
   * Run all cleanup routines. Safe to call frequently (idempotent).
   */
  async runCleanup(): Promise<CleanupReport> {
    const report: CleanupReport = {
      imagesRemoved: 0,
      soldMatchesRemoved: 0,
      versionsCacheEntriesRemoved: 0,
      inventoryCacheFilesRemoved: 0,
      errors: [],
    };

    // Image caches
    try {
      report.imagesRemoved += await this.cleanupImageCache('images/album-covers.json');
      report.imagesRemoved += await this.cleanupImageCache('images/artist-images.json');
    } catch (e) {
      report.errors.push(`Image cleanup failed: ${e}`);
    }

    // Sold matches
    try {
      report.soldMatchesRemoved = await this.cleanupSoldMatches();
    } catch (e) {
      report.errors.push(`Sold match cleanup failed: ${e}`);
    }

    // Versions cache (wishlist)
    try {
      report.versionsCacheEntriesRemoved = await this.cleanupVersionsCache();
    } catch (e) {
      report.errors.push(`Versions cache cleanup failed: ${e}`);
    }

    // Seller inventory caches
    try {
      report.inventoryCacheFilesRemoved = await this.cleanupInventoryCaches();
    } catch (e) {
      report.errors.push(`Inventory cache cleanup failed: ${e}`);
    }

    logger.info(`Cleanup complete: ${JSON.stringify(report)}`);
    return report;
  }

  private async cleanupImageCache(filePath: string): Promise<number> {
    const cutoff = nowUnixMs() - this.IMAGE_CACHE_MAX_AGE_MS;

    const cache = await this.storage.readJSON<ImageCacheStore>(filePath);
    if (!cache?.entries) return 0;

    const before = cache.entries.length;
    cache.entries = cache.entries.filter(e => e.fetchedAt > cutoff);

    if (cache.entries.length < before) {
      cache.lastCleanup = nowUnixMs();
      await this.storage.writeJSON(filePath, cache);
    }

    return before - cache.entries.length;
  }

  private async cleanupSoldMatches(): Promise<number> {
    const cutoff = nowUnixMs() - this.SOLD_MATCH_MAX_AGE_MS;

    const store = await this.storage.readJSON<SellerMatchesStore>('sellers/matches.json');
    if (!store?.matches) return 0;

    const before = store.matches.length;
    store.matches = store.matches.filter(m =>
      m.status !== 'sold' || !m.statusChangedAt || m.statusChangedAt > cutoff
    );

    if (store.matches.length < before) {
      await this.storage.writeJSON('sellers/matches.json', store);
    }

    return before - store.matches.length;
  }

  private async cleanupVersionsCache(): Promise<number> {
    const cutoff = nowUnixMs() - this.VERSIONS_CACHE_MAX_AGE_MS;

    const cache = await this.storage.readJSON<VersionsCache>('wishlist/versions-cache.json');
    if (!cache?.entries) return 0;

    const before = Object.keys(cache.entries).length;
    const filtered: Record<number, typeof cache.entries[number]> = {};

    for (const [masterId, entry] of Object.entries(cache.entries)) {
      if (entry.fetchedAt > cutoff) {
        filtered[Number(masterId)] = entry;
      }
    }

    cache.entries = filtered;
    const after = Object.keys(cache.entries).length;

    if (after < before) {
      await this.storage.writeJSON('wishlist/versions-cache.json', cache);
    }

    return before - after;
  }

  private async cleanupInventoryCaches(): Promise<number> {
    const cutoff = nowUnixMs() - this.INVENTORY_CACHE_MAX_AGE_MS;
    const files = await this.storage.listFiles('sellers/inventory-cache');
    let removed = 0;

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = `sellers/inventory-cache/${file}`;
      const stats = await this.storage.getStats(filePath);

      if (stats.mtime && stats.mtime.getTime() < cutoff) {
        await this.storage.delete(filePath);
        removed++;
      }
    }

    return removed;
  }
}

export interface CleanupReport {
  imagesRemoved: number;
  soldMatchesRemoved: number;
  versionsCacheEntriesRemoved: number;
  inventoryCacheFilesRemoved: number;
  errors: string[];
}
```

---

### Phase 4: Client-Side Migration (localStorage)

The notification store in localStorage also has `schemaVersion`. Client-side migration is handled separately in the renderer:

```typescript
// src/renderer/hooks/useNotifications.ts (existing file)

const STORAGE_KEY = 'recordscrobbles.notifications';
const CURRENT_VERSION = 1;

function loadNotifications(): NotificationStore {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { schemaVersion: CURRENT_VERSION, notifications: [] };
  }

  try {
    const data = JSON.parse(raw);

    // Handle missing version (legacy data)
    if (typeof data.schemaVersion !== 'number') {
      data.schemaVersion = 1;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    // Future: Add client-side migrations here
    // if (data.schemaVersion < CURRENT_VERSION) {
    //   data = migrateNotifications(data);
    //   localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    // }

    return data;
  } catch {
    return { schemaVersion: CURRENT_VERSION, notifications: [] };
  }
}
```

---

## Integration with Backup System (Feature 10)

1. **Export**: Include per-file `schemaVersion` in backup metadata
2. **Import**: Check version compatibility before restoring each file
3. **Version Mismatch**: Apply migrations during import if backup is older
4. **Forward Compatibility**: Reject backups with versions newer than supported

```typescript
interface BackupFile {
  version: 2;  // Backup format version
  exportedAt: number;
  appVersion: string;
  dataSchemaVersions: Record<string, number>;  // Per-file versions at export time
  // ...
}

// During import validation:
for (const [fileKey, exportedVersion] of Object.entries(backup.dataSchemaVersions)) {
  const currentVersion = migrationService.getCurrentVersion(fileKey);
  if (exportedVersion > currentVersion) {
    throw new Error(
      `Backup contains ${fileKey} at v${exportedVersion}, ` +
      `but this app only supports v${currentVersion}. ` +
      `Please update the app before importing.`
    );
  }
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/shared/types.ts` | Add `VersionedStore`, `DataFileMeta`, `MigrationDefinition`, update store interfaces |
| `src/backend/services/migrationService.ts` | **NEW** - Migration infrastructure with full registry |
| `src/backend/services/cleanupService.ts` | **NEW** - Cache cleanup for all retention policies |
| `src/backend/utils/timestamps.ts` | **NEW** - Timestamp utilities (ms-based) |
| `src/server.ts` | Call `migrationService.migrateAllOnStartup()` async on startup |
| `src/renderer/hooks/useNotifications.ts` | Add client-side version checking |

---

## Implementation Checklist

### Phase 1: Schema Infrastructure
- [ ] Add `VersionedStore`, `DataFileMeta`, `MigrationDefinition` to types.ts
- [ ] Update all store interfaces to extend VersionedStore
- [ ] Create `migrationService.ts` with full registry and migration logic
- [ ] Create `timestamps.ts` utility module (millisecond-based)
- [ ] Add async startup migration to server.ts (non-blocking)

### Phase 2: Version Stamping
- [ ] Run migration service on dev data
- [ ] Verify all backend files have schemaVersion
- [ ] Add client-side version check for localStorage

### Phase 3: Cleanup Routines
- [ ] Create `cleanupService.ts` with all cache types
- [ ] Integrate image cache cleanup (album + artist)
- [ ] Integrate sold match cleanup
- [ ] Integrate versions cache cleanup
- [ ] Integrate inventory cache cleanup
- [ ] Add cleanup trigger on app startup

### Phase 4: Documentation
- [ ] Document timestamp conventions (milliseconds) in code comments
- [ ] Document day boundary logic for streaks
- [ ] Note Last.fm API returns seconds (normalize on store)

---

## Testing Requirements

| Test | Description |
|------|-------------|
| Migration round-trip | Load v0 file -> stamp -> save -> load = same data + version |
| Missing version handling | File without schemaVersion gets stamped as v1 |
| Future version rejection | v99 file throws clear error with upgrade message |
| Cleanup - images | Entries older than 30 days removed |
| Cleanup - versions cache | Entries older than 7 days removed |
| Cleanup - inventory cache | Files older than 7 days deleted |
| Cleanup - sold matches | Sold matches older than 30 days removed |
| Streak day boundary | 11:59pm and 12:01am on adjacent days = 2 different days |
| Startup performance | Migration check completes in <500ms for typical data |
| Large file handling | 5.5MB history file migrates without timeout |

---

## Performance Considerations

**Large File Migration (scrobble-history-index.json at 5.5MB):**

1. Migration runs **asynchronously** on startup - does not block server
2. Uses `writeJSONWithBackup` which creates backup before modifying
3. Progress callback allows UI feedback if needed
4. Timeout handling: if migration takes >10 seconds, log warning but continue
5. On migration error: log error, skip file, continue with other files

**Startup Ordering:**
1. Server binds to port and starts accepting requests
2. Migration check runs in background
3. If a request needs a file that's being migrated, it reads the pre-migration version (safe because migrations are additive)

---

## Summary

- **Scope**: Infrastructure for all data files (backend + localStorage)
- **Effort**: ~500 lines across 4 new/modified files
- **Risk**: Low - additive changes, existing data preserved, async startup
- **Dependencies**: None (foundation for Features 1, 10)
- **Blockers**: Backup system (Feature 10) should wait for this
- **Key Decision**: Keep milliseconds as timestamp standard (matches existing data)
