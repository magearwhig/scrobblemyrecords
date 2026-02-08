# Wishlist New Release Tracking - Implementation Plan

## Overview

Track new vinyl releases (pressings) for albums on your wishlist by monitoring the Discogs master ID to release ID cache. When a master release gets a new vinyl version, notify the user so they can consider purchasing it.

This feature leverages the **existing versions cache** (`wishlist/versions-cache.json`) which already maps master IDs to their release versions. By periodically re-checking masters and comparing against cached versions, we can detect when new releases appear.

---

## Feature Concept

### What It Does
- Monitors master releases from your **Discogs wishlist** for new vinyl pressings
- Also monitors masters from your **local want list** (albums you're tracking locally)
- Also monitors masters from your **vinyl watch list** (CD-only albums being watched for vinyl availability)
- Detects when a new vinyl release ID appears for a tracked master
- Creates notifications for new vinyl availability
- Shows a "New Releases" tab on the Wishlist page

### Why It's Valuable
- Don't miss limited vinyl pressings for albums you want
- Automatically tracks both your Discogs wishlist and locally monitored albums
- Leverages existing cache infrastructure - minimal new code needed

### Key Terminology

| Term | Definition |
|------|------------|
| **New release** | A Discogs release ID that exists on a master but was NOT in our versions cache on last check |
| **Newly detected** | When we first observed the release (stored as `detectedAt`) |
| **Release date** | The year the vinyl was actually pressed (from Discogs `year` field) |
| **detectedAt** | Timestamp when our system first saw this release ID - used for "Past 7 days" filter |

**Important:** Filters like "Past 7 days" filter by `detectedAt` (when we found it), NOT by the vinyl's release year. A 2020 pressing could appear as "newly detected" if it was just added to our cache.

### Data Sources

| Source | Master ID Location | Purpose | Notes |
|--------|-------------------|---------|-------|
| Discogs Wishlist | `WishlistItem.masterId` | Albums you want to buy | Synced from Discogs API |
| Local Want List | `LocalWantItem.discogsMasterId` | Albums tracked locally (not on Discogs) | Currently lacks master ID - needs migration |
| Vinyl Watch List | `VinylWatchItem.masterId` | CD-only albums being watched for vinyl | Alerts when vinyl finally becomes available |

**Vinyl Watch List UX:** Items in the vinyl watch list are CD-only albums where the user is waiting for a vinyl pressing to exist. When a new vinyl release appears for these masters, it's especially notable since it means vinyl is now available for something that previously had none.

---

## User Interface

### Location
New **"New Releases"** tab on the existing Wishlist page

### UI Layout

```
+-------------------------------------------------------------------------+
| Wishlist                                                                 |
+-------------------------------------------------------------------------+
| [All] [Has Vinyl] [CD Only] [Affordable] [Wanted] [New Releases (3)]    |
+-------------------------------------------------------------------------+
|                                                                          |
| Last checked: 6 hours ago                            [Check Now]         |
| Checking 45 of 120 masters...  [=====>          ] 38%                    |
|                                                                          |
| Filter: [All Sources ▼]  [Detected: All Time ▼]  [ ] Show dismissed      |
|                                                                          |
| New vinyl releases detected for albums you're tracking:                  |
|                                                                          |
| +---------------------------------------------------------------------+ |
| | [cover]  Radiohead - OK Computer                                    | |
| |          NEW: 2026 180g reissue (EU)                                | |
| |          Pressed: 2026 · $35 · LP · XL Recordings                   | |
| |          From: Discogs Wishlist · Detected 2 days ago               | |
| |          [View on Discogs] [View Source Item]        [Dismiss]      | |
| +---------------------------------------------------------------------+ |
|                                                                          |
| +---------------------------------------------------------------------+ |
| | [cover]  Bjork - Homogenic                                          | |
| |          NEW: Japanese pressing (OBI)                               | |
| |          Pressed: 2025 · $52 · LP · One Little Independent          | |
| |          From: Vinyl Watch · Detected today                         | |
| |          [View on Discogs] [View Source Item]        [Dismiss]      | |
| +---------------------------------------------------------------------+ |
|                                                                          |
+-------------------------------------------------------------------------+
```

### Filter Options (within New Releases tab)

**Source Filter:**
- All Sources (default)
- Discogs Wishlist only
- Local Want List only
- Vinyl Watch List only

**Time Filter (by detectedAt):**
- All Time (default)
- Detected in past 7 days
- Detected in past 30 days
- Detected in past 90 days

**Toggle:**
- [ ] Show dismissed - includes previously dismissed items

### Error States

```
+-------------------------------------------------------------------------+
| Check failed: Rate limited by Discogs API                               |
| Will retry in 5 minutes. [Retry Now]                                    |
+-------------------------------------------------------------------------+
```

### Large List Handling

For users with 50+ new releases:
- Virtualized list rendering (react-window or similar)
- Load 20 items initially, infinite scroll for more
- "Load more" button as fallback

---

## Data Model

### New Type Definitions

```typescript
// src/shared/types.ts

/**
 * A newly detected release for a tracked master
 */
export interface WishlistNewRelease {
  id: string;                    // Unique ID (masterId-releaseId)
  masterId: number;              // Parent master release
  releaseId: number;             // New release ID detected

  // Release info (from Discogs)
  title: string;                 // Release-specific title (may include edition info)
  artist: string;
  year: number;                  // Year pressed (from Discogs)
  country: string;
  format: string[];              // e.g., ["LP", "Album", "180g"]
  label: string;
  catalogNumber?: string;

  // Pricing (if available)
  lowestPrice?: number;
  priceCurrency?: string;
  numForSale?: number;

  // Tracking
  source: 'wishlist' | 'local_want' | 'vinyl_watch';  // Where the master came from
  sourceItemId: string | number;                       // ID of the source item
  detectedAt: number;                                  // When we first saw this release
  notified: boolean;                                   // Have we notified the user?
  dismissed: boolean;                                  // User dismissed this alert

  // Links
  discogsUrl: string;            // Direct link to release page
}

/**
 * Store for tracking new releases
 */
export interface WishlistNewReleasesStore {
  schemaVersion: 1;
  lastCheck: number;             // Last time we completed a check
  releases: WishlistNewRelease[];
}

/**
 * Sync status for new release checking (parallels ReleaseTrackingSyncStatus)
 */
export interface NewReleaseSyncStatus {
  status: 'idle' | 'syncing' | 'completed' | 'error';
  lastFullCheck: number | null;           // Last completed full cycle
  mastersProcessed: number;               // Current progress
  totalMasters: number;                   // Total to process
  newReleasesFound: number;               // Found in current/last run
  lastCheckedIndex: number;               // For resumable batching
  progress: number;                        // 0-100 percentage
  currentMaster?: string;                  // Artist - Album being checked
  estimatedTimeRemaining?: number;         // Seconds
  error?: string;                          // Error message if status is 'error'
  lastError?: {                            // Last error details for retry
    message: string;
    masterId?: number;
    timestamp: number;
    retryCount: number;
  };
}

/**
 * Extended LocalWantItem with master ID support
 */
export interface LocalWantItem {
  id: string;
  artist: string;
  album: string;
  playCount: number;
  lastPlayed: number;
  coverUrl?: string;
  addedAt: number;
  vinylStatus: VinylStatus;
  lowestVinylPrice?: number;
  priceCurrency?: string;
  vinylCheckedAt?: number;
  discogsMasterId?: number;      // NEW: Master ID for release tracking
  discogsReleaseId?: number;     // NEW: Specific release found on Discogs
  masterIdLookupFailed?: boolean; // NEW: True if we tried and failed to find master ID
}

/**
 * Settings for new release tracking
 */
export interface WishlistNewReleaseSettings {
  enabled: boolean;              // Enable/disable tracking
  checkFrequencyDays: number;    // How often to check (default: 7)
  notifyOnNewRelease: boolean;   // Create notifications
  autoCheck: boolean;            // Check on app startup
  trackLocalWantList: boolean;   // Include local want list items
  trackVinylWatchList: boolean;  // Include vinyl watch list items
}
```

### Modified Existing Types

```typescript
// Extend WishlistSettings to include new release tracking
export interface WishlistSettings {
  schemaVersion: 1;
  priceThreshold: number;
  currency: string;
  autoSyncEnabled: boolean;
  syncIntervalHours: number;
  // NEW fields
  newReleaseTracking: WishlistNewReleaseSettings;
}
```

### VersionsCache Structure (Existing - For Reference)

The existing versions cache structure that this feature depends on:

```typescript
interface ReleaseVersion {
  releaseId: number;
  title: string;
  format: string[];
  label: string;
  country: string;
  year: number;
  hasVinyl: boolean;              // Pre-computed vinyl detection
  marketplaceStats?: {
    lowestPrice?: { value: number; currency: string };
    numForSale?: number;
  };
  lastFetched?: number;
}

interface VersionsCacheEntry {
  masterId: number;
  versions: ReleaseVersion[];
  fetchedAt: number;
}

interface VersionsCache {
  schemaVersion: 1;
  entries: Record<number, VersionsCacheEntry>; // masterId -> cache entry
}
```

**Key assumption:** `hasVinyl` and `marketplaceStats` are already computed by the existing wishlist vinyl checking code. This feature piggybacks on that infrastructure.

---

## Data Storage

### File Structure

```
data/wishlist/
├── wishlist-items.json           # Existing: Discogs wishlist with master IDs
├── versions-cache.json           # Existing: Master ID → release versions cache
├── local-want-list.json          # Existing: Local want items (needs masterId field)
├── vinyl-watch-list.json         # Existing: CD-only items being watched
├── new-releases.json             # NEW: Detected new releases
├── new-release-sync-status.json  # NEW: Sync progress/status
└── settings.json                 # Existing: Add newReleaseTracking section
```

### new-releases.json Schema

```json
{
  "schemaVersion": 1,
  "lastCheck": 1705000000000,
  "releases": [
    {
      "id": "12345-67890",
      "masterId": 12345,
      "releaseId": 67890,
      "title": "OK Computer (2026 Remaster)",
      "artist": "Radiohead",
      "year": 2026,
      "country": "Europe",
      "format": ["LP", "Album", "Reissue", "180g"],
      "label": "XL Recordings",
      "catalogNumber": "XLLP123",
      "lowestPrice": 34.99,
      "priceCurrency": "USD",
      "numForSale": 12,
      "source": "wishlist",
      "sourceItemId": 98765,
      "detectedAt": 1705000000000,
      "notified": true,
      "dismissed": false,
      "discogsUrl": "https://www.discogs.com/release/67890"
    }
  ]
}
```

### new-release-sync-status.json Schema

```json
{
  "schemaVersion": 1,
  "status": "idle",
  "lastFullCheck": 1705000000000,
  "mastersProcessed": 0,
  "totalMasters": 120,
  "newReleasesFound": 3,
  "lastCheckedIndex": 0,
  "progress": 0,
  "error": null,
  "lastError": null
}
```

---

## Backend Implementation

### 1. Extend WishlistService

**File:** `src/backend/services/wishlistService.ts`

Add new methods for tracking new releases:

```typescript
// New constants
private readonly NEW_RELEASES_FILE = 'wishlist/new-releases.json';
private readonly SYNC_STATUS_FILE = 'wishlist/new-release-sync-status.json';

// Pagination and batching constants
private readonly MASTERS_PER_BATCH = 20;
private readonly MAX_VERSIONS_PER_MASTER = 100;  // Limit for masters with 500+ versions
private readonly CHECK_INTERVAL_MS = 1100;       // 1.1 sec between API calls
private readonly MAX_RETRIES = 3;
private readonly INITIAL_BACKOFF_MS = 2000;
private readonly MAX_BACKOFF_MS = 60000;

// ============================================
// New Release Tracking Methods
// ============================================

/**
 * Get all tracked master IDs from wishlist, local want list, and vinyl watch list
 */
async getTrackedMasterIds(): Promise<Map<number, { source: string; itemId: string | number; artistAlbum: string }>> {
  const masterMap = new Map<number, { source: string; itemId: string | number; artistAlbum: string }>();

  // 1. Discogs wishlist items
  const wishlist = await this.getWishlistItems();
  for (const item of wishlist) {
    if (item.masterId) {
      masterMap.set(item.masterId, {
        source: 'wishlist',
        itemId: item.id,
        artistAlbum: `${item.artist} - ${item.title}`
      });
    }
  }

  // 2. Local want list items (if they have master IDs)
  const localWant = await this.getLocalWantList();
  for (const item of localWant) {
    if (item.discogsMasterId && !masterMap.has(item.discogsMasterId)) {
      masterMap.set(item.discogsMasterId, {
        source: 'local_want',
        itemId: item.id,
        artistAlbum: `${item.artist} - ${item.album}`
      });
    }
  }

  // 3. Vinyl watch list items
  const vinylWatch = await this.getWatchList();
  for (const item of vinylWatch) {
    if (item.masterId && !masterMap.has(item.masterId)) {
      masterMap.set(item.masterId, {
        source: 'vinyl_watch',
        itemId: item.masterId,
        artistAlbum: `${item.artist} - ${item.title}`
      });
    }
  }

  return masterMap;
}

/**
 * Check for new releases with batching, retry logic, and progress tracking
 */
async checkForNewReleases(force = false): Promise<WishlistNewRelease[]> {
  const settings = await this.getSettings();
  if (!settings.newReleaseTracking?.enabled && !force) {
    return [];
  }

  const syncStatus = await this.getNewReleaseSyncStatus();

  // Don't start new check if one is in progress
  if (syncStatus.status === 'syncing') {
    this.logger.warn('New release check already in progress');
    return [];
  }

  const trackedMasters = await this.getTrackedMasterIds();
  const allMasterIds = Array.from(trackedMasters.keys());

  // Initialize sync status
  await this.updateNewReleaseSyncStatus({
    status: 'syncing',
    totalMasters: allMasterIds.length,
    mastersProcessed: 0,
    newReleasesFound: 0,
    lastCheckedIndex: syncStatus.lastCheckedIndex || 0,
    progress: 0,
    error: null,
  });

  const newReleases: WishlistNewRelease[] = [];
  const versionsCache = await this.getVersionsCache();
  const existingNew = await this.getNewReleases();
  const existingNewIds = new Set(existingNew.releases.map(r => r.id));

  let startIndex = syncStatus.lastCheckedIndex || 0;
  const endIndex = Math.min(startIndex + this.MASTERS_PER_BATCH, allMasterIds.length);

  try {
    for (let i = startIndex; i < endIndex; i++) {
      const masterId = allMasterIds[i];
      const sourceInfo = trackedMasters.get(masterId)!;

      // Skip if source settings disable this type
      if (sourceInfo.source === 'local_want' && !settings.newReleaseTracking?.trackLocalWantList) {
        continue;
      }
      if (sourceInfo.source === 'vinyl_watch' && !settings.newReleaseTracking?.trackVinylWatchList) {
        continue;
      }

      // Update progress
      await this.updateNewReleaseSyncStatus({
        mastersProcessed: i - startIndex + 1,
        progress: Math.round(((i - startIndex + 1) / (endIndex - startIndex)) * 100),
        currentMaster: sourceInfo.artistAlbum,
      });

      // Fetch with retry logic
      const freshVersions = await this.fetchMasterVersionsWithRetry(masterId);

      // Get cached versions (what we knew about before)
      const cachedEntry = versionsCache.entries[masterId];
      const cachedReleaseIds = new Set(
        cachedEntry?.versions.map(v => v.releaseId) || []
      );

      // Find new vinyl releases
      for (const version of freshVersions) {
        if (!cachedReleaseIds.has(version.releaseId) && version.hasVinyl) {
          const releaseId = `${masterId}-${version.releaseId}`;

          // Skip if already tracked
          if (existingNewIds.has(releaseId)) {
            continue;
          }

          const newRelease: WishlistNewRelease = {
            id: releaseId,
            masterId,
            releaseId: version.releaseId,
            title: version.title,
            artist: sourceInfo.artistAlbum.split(' - ')[0],
            year: version.year,
            country: version.country,
            format: version.format,
            label: version.label,
            catalogNumber: undefined, // Would need separate API call
            lowestPrice: version.marketplaceStats?.lowestPrice?.value,
            priceCurrency: version.marketplaceStats?.lowestPrice?.currency,
            numForSale: version.marketplaceStats?.numForSale,
            source: sourceInfo.source as 'wishlist' | 'local_want' | 'vinyl_watch',
            sourceItemId: sourceInfo.itemId,
            detectedAt: Date.now(),
            notified: false,
            dismissed: false,
            discogsUrl: `https://www.discogs.com/release/${version.releaseId}`,
          };

          newReleases.push(newRelease);
        }
      }

      // Update versions cache with fresh data
      await this.updateVersionsCache(masterId, freshVersions);

      // Rate limiting
      await new Promise(r => setTimeout(r, this.CHECK_INTERVAL_MS));
    }

    // Determine if we completed a full cycle
    const completedFullCycle = endIndex >= allMasterIds.length;

    // Save new releases
    if (newReleases.length > 0) {
      await this.saveNewReleases(newReleases);

      // Create notifications
      if (settings.newReleaseTracking?.notifyOnNewRelease) {
        await this.createNewReleaseNotifications(newReleases);
      }
    }

    // Update sync status
    await this.updateNewReleaseSyncStatus({
      status: 'completed',
      lastCheckedIndex: completedFullCycle ? 0 : endIndex,
      lastFullCheck: completedFullCycle ? Date.now() : syncStatus.lastFullCheck,
      newReleasesFound: newReleases.length,
      progress: 100,
      currentMaster: undefined,
    });

    return newReleases;

  } catch (error) {
    this.logger.error('New release check failed', error);
    await this.updateNewReleaseSyncStatus({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      lastError: {
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
        retryCount: (syncStatus.lastError?.retryCount || 0) + 1,
      },
    });
    throw error;
  }
}

/**
 * Fetch master versions with exponential backoff retry
 * Retries on: 429 (rate limit), 503 (service unavailable), network timeouts
 */
private async fetchMasterVersionsWithRetry(masterId: number): Promise<ReleaseVersion[]> {
  let delay = this.INITIAL_BACKOFF_MS;

  for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
    try {
      return await this.fetchMasterVersionsPaginated(masterId);
    } catch (error) {
      const isRetryable = this.isRetryableError(error);

      if (!isRetryable || attempt === this.MAX_RETRIES) {
        throw error;
      }

      this.logger.warn(`Retryable error fetching master ${masterId}, retry ${attempt}/${this.MAX_RETRIES} in ${delay}ms`, error);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, this.MAX_BACKOFF_MS);
    }
  }

  throw new Error('Max retries exceeded');
}

/**
 * Determine if an error is retryable (rate limits, service unavailable, network issues)
 */
private isRetryableError(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    // HTTP errors that are retryable
    if (error.response?.status === 429 || error.response?.status === 503) {
      return true;
    }
    // Network errors (no response received)
    if (!error.response && error.code) {
      const retryableCodes = ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'];
      return retryableCodes.includes(error.code);
    }
  }
  return false;
}

/**
 * Fetch master versions with pagination for large masters (500+ versions)
 */
private async fetchMasterVersionsPaginated(masterId: number): Promise<ReleaseVersion[]> {
  const allVersions: ReleaseVersion[] = [];
  let page = 1;
  const perPage = 50; // Discogs max per page

  while (allVersions.length < this.MAX_VERSIONS_PER_MASTER) {
    const response = await this.axios.get(
      `/masters/${masterId}/versions`,
      {
        params: {
          page,
          per_page: perPage,
          sort: 'released',      // Most recent first
          sort_order: 'desc',
        },
        headers: await this.getAuthHeaders(),
      }
    );

    const versions = response.data.versions || [];
    if (versions.length === 0) break;

    for (const v of versions) {
      allVersions.push({
        releaseId: v.id,
        title: v.title,
        format: v.format ? [v.format] : [],
        label: v.label || '',
        country: v.country || '',
        year: v.released ? parseInt(v.released.substring(0, 4)) : 0,
        hasVinyl: this.isVinylFormat(v.format ? [v.format] : []),
        // Note: marketplaceStats would require additional API call per version
      });

      if (allVersions.length >= this.MAX_VERSIONS_PER_MASTER) break;
    }

    // Check if there are more pages
    const pagination = response.data.pagination;
    if (!pagination || page >= pagination.pages) break;

    page++;
    await new Promise(r => setTimeout(r, this.CHECK_INTERVAL_MS));
  }

  return allVersions;
}

/**
 * Get sync status
 */
async getNewReleaseSyncStatus(): Promise<NewReleaseSyncStatus> {
  const status = await this.fileStorage.readJSON<NewReleaseSyncStatus>(
    this.SYNC_STATUS_FILE
  );

  return status || {
    status: 'idle',
    lastFullCheck: null,
    mastersProcessed: 0,
    totalMasters: 0,
    newReleasesFound: 0,
    lastCheckedIndex: 0,
    progress: 0,
  };
}

/**
 * Update sync status (partial update)
 */
async updateNewReleaseSyncStatus(updates: Partial<NewReleaseSyncStatus>): Promise<void> {
  const current = await this.getNewReleaseSyncStatus();
  const updated = { ...current, ...updates };
  await this.fileStorage.writeJSON(this.SYNC_STATUS_FILE, updated);
}

/**
 * Get stored new releases
 */
async getNewReleases(): Promise<WishlistNewReleasesStore> {
  const cached = await this.fileStorage.readJSON<WishlistNewReleasesStore>(
    this.NEW_RELEASES_FILE
  );

  return cached || {
    schemaVersion: 1,
    lastCheck: 0,
    releases: [],
  };
}

/**
 * Dismiss a new release alert
 */
async dismissNewRelease(releaseId: string): Promise<void> {
  const store = await this.getNewReleases();
  const release = store.releases.find(r => r.id === releaseId);
  if (release) {
    release.dismissed = true;
    await this.fileStorage.writeJSON(this.NEW_RELEASES_FILE, store);
  }
}

/**
 * Remove old dismissed releases (cleanup)
 */
async cleanupDismissedReleases(maxAgeDays = 90): Promise<number> {
  const store = await this.getNewReleases();
  const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
  const originalCount = store.releases.length;

  store.releases = store.releases.filter(r =>
    !r.dismissed || r.detectedAt > cutoff
  );

  await this.fileStorage.writeJSON(this.NEW_RELEASES_FILE, store);
  return originalCount - store.releases.length;
}
```

### 2. Add Master ID to Local Want Items

**Migration Strategy:**

```typescript
/**
 * Migration: Backfill discogsMasterId for existing LocalWantItem entries
 * Run once on startup if schemaVersion indicates migration needed
 */
async migrateLocalWantListMasterIds(): Promise<{ processed: number; found: number; failed: number }> {
  const store = await this.getLocalWantListStore();
  let processed = 0;
  let found = 0;
  let failed = 0;

  for (const item of store.items) {
    // Skip if already has master ID or lookup previously failed
    if (item.discogsMasterId || item.masterIdLookupFailed) {
      continue;
    }

    processed++;

    try {
      const searchResults = await this.searchDiscogs(`${item.artist} ${item.album}`, 'master');
      const match = this.findBestMatch(item.artist, item.album, searchResults);

      if (match) {
        item.discogsMasterId = match.master_id || match.id;
        item.discogsReleaseId = match.id;
        found++;
      } else {
        item.masterIdLookupFailed = true;
        failed++;
      }

      // Rate limiting
      await new Promise(r => setTimeout(r, this.CHECK_INTERVAL_MS));
    } catch (error) {
      this.logger.warn(`Failed to find master ID for ${item.artist} - ${item.album}`, error);
      item.masterIdLookupFailed = true;
      failed++;
    }
  }

  await this.saveLocalWantListStore(store);
  return { processed, found, failed };
}

/**
 * Enhanced addToLocalWantList with master ID lookup
 */
async addToLocalWantList(
  artist: string,
  album: string,
  playCount: number,
  lastPlayed: number,
  coverUrl?: string
): Promise<LocalWantItem> {
  // Search Discogs to find master ID
  let discogsMasterId: number | undefined;
  let discogsReleaseId: number | undefined;
  let masterIdLookupFailed = false;

  try {
    const searchResults = await this.searchDiscogs(`${artist} ${album}`, 'master');
    const match = this.findBestMatch(artist, album, searchResults);
    if (match) {
      discogsMasterId = match.master_id || match.id;
      discogsReleaseId = match.id;
    } else {
      masterIdLookupFailed = true;
    }
  } catch (error) {
    this.logger.warn('Failed to find Discogs master ID for local want item', error);
    masterIdLookupFailed = true;
  }

  const item: LocalWantItem = {
    id: this.generateLocalWantId(artist, album),
    artist,
    album,
    playCount,
    lastPlayed,
    coverUrl,
    addedAt: Date.now(),
    vinylStatus: 'unknown',
    discogsMasterId,
    discogsReleaseId,
    masterIdLookupFailed,
  };

  // ... rest of existing logic
  return item;
}
```

### 3. Handle Wishlist Items Missing Master ID

Some Discogs wishlist items may not have a `masterId` (e.g., releases that aren't linked to a master):

```typescript
/**
 * Get tracked masters, logging items without master IDs
 */
async getTrackedMasterIds(): Promise<Map<number, SourceInfo>> {
  const masterMap = new Map();
  const itemsWithoutMasterId: string[] = [];

  const wishlist = await this.getWishlistItems();
  for (const item of wishlist) {
    if (item.masterId) {
      masterMap.set(item.masterId, { source: 'wishlist', itemId: item.id, artistAlbum: `${item.artist} - ${item.title}` });
    } else {
      // Log for debugging - these items can't be tracked for new releases
      itemsWithoutMasterId.push(`${item.artist} - ${item.title} (release ${item.releaseId})`);
    }
  }

  if (itemsWithoutMasterId.length > 0) {
    this.logger.info(`${itemsWithoutMasterId.length} wishlist items have no master ID and won't be tracked for new releases`);
    this.logger.debug('Items without master ID:', itemsWithoutMasterId);
  }

  // ... rest of method
}
```

### 4. API Routes

**File:** `src/backend/routes/wishlist.ts`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/wishlist/new-releases` | GET | Get detected new releases |
| `/api/v1/wishlist/new-releases/check` | POST | Trigger check for new releases |
| `/api/v1/wishlist/new-releases/status` | GET | Get sync status |
| `/api/v1/wishlist/new-releases/:id/dismiss` | PATCH | Dismiss a new release alert |
| `/api/v1/wishlist/new-releases/cleanup` | POST | Clean up old dismissed items |

```typescript
// GET /api/v1/wishlist/new-releases
router.get('/new-releases', async (req, res) => {
  try {
    const store = await wishlistService.getNewReleases();

    // Filter options
    const { source, days, showDismissed } = req.query;
    let releases = store.releases;

    if (showDismissed !== 'true') {
      releases = releases.filter(r => !r.dismissed);
    }

    if (source && typeof source === 'string') {
      releases = releases.filter(r => r.source === source);
    }

    if (days && typeof days === 'string') {
      const cutoff = Date.now() - (parseInt(days) * 24 * 60 * 60 * 1000);
      releases = releases.filter(r => r.detectedAt >= cutoff);
    }

    // Sort by detectedAt descending (newest first)
    releases.sort((a, b) => b.detectedAt - a.detectedAt);

    res.json({
      success: true,
      data: {
        lastCheck: store.lastCheck,
        releases,
        count: releases.length,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// GET /api/v1/wishlist/new-releases/status
router.get('/new-releases/status', async (req, res) => {
  try {
    const status = await wishlistService.getNewReleaseSyncStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST /api/v1/wishlist/new-releases/check
router.post('/new-releases/check', async (req, res) => {
  try {
    // Return immediately, check runs in background
    res.json({ success: true, data: { message: 'Check started' } });

    // Run check asynchronously
    wishlistService.checkForNewReleases(true).catch(error => {
      logger.error('Background new release check failed', error);
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// PATCH /api/v1/wishlist/new-releases/:id/dismiss
router.patch('/new-releases/:id/dismiss', async (req, res) => {
  try {
    await wishlistService.dismissNewRelease(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST /api/v1/wishlist/new-releases/cleanup
router.post('/new-releases/cleanup', async (req, res) => {
  try {
    const { maxAgeDays = 90 } = req.body;
    const removed = await wishlistService.cleanupDismissedReleases(maxAgeDays);
    res.json({ success: true, data: { removed } });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});
```

---

## Detection Algorithm

### How New Releases Are Detected

```
1. Collect all tracked master IDs
   ├── From Discogs wishlist items (skip items without masterId)
   ├── From local want list (if discogsMasterId exists)
   └── From vinyl watch list

2. For each master ID (in batches of 20):
   ├── Get cached versions from versions-cache.json
   ├── Fetch fresh versions from Discogs API: GET /masters/{id}/versions
   │   ├── Sort by released DESC (newest first)
   │   ├── Paginate if needed (max 100 versions)
   │   └── Retry with exponential backoff on 429/503
   ├── Compare release IDs:
   │   ├── If release ID exists in cache → skip (known)
   │   └── If release ID NOT in cache → NEW RELEASE
   │       ├── Check if vinyl format (hasVinyl) → include
   │       └── Check if already in new-releases.json → skip
   └── Update versions cache with fresh data

3. For each new release detected:
   ├── Create WishlistNewRelease entry
   ├── Save to new-releases.json
   └── Create notification (if enabled)

4. Update sync status:
   ├── If completed all masters → reset lastCheckedIndex to 0
   └── If partial → save lastCheckedIndex for resumption
```

### Rate Limiting & Backoff Strategy

| Scenario | Strategy |
|----------|----------|
| Normal operation | 1.1 sec delay between API calls |
| 429 Rate Limited | Exponential backoff: 2s → 4s → 8s → ... → max 60s |
| 503 Service Unavailable | Same as 429 |
| ETIMEDOUT / ECONNRESET | Same as 429 (network flakiness) |
| ECONNREFUSED / ENOTFOUND | Same as 429 (temporary DNS/server issues) |
| Max retries exceeded | Fail operation, save error state |
| Other errors (4xx, etc.) | Immediate fail (no retry) |

### Expected Runtime

| Wishlist Size | Masters per Batch | Batches | Est. Time per Batch | Full Cycle Time |
|---------------|-------------------|---------|---------------------|-----------------|
| 50 masters | 20 | 3 | ~25 sec | ~1.5 min |
| 100 masters | 20 | 5 | ~25 sec | ~2.5 min |
| 200 masters | 20 | 10 | ~25 sec | ~5 min |
| 500 masters | 20 | 25 | ~25 sec | ~12 min |

Note: With batching, only one batch runs per "Check Now". Full cycle completes over multiple check sessions.

---

## Frontend Implementation

### 1. API Client

**File:** `src/renderer/services/api.ts`

```typescript
// Wishlist new releases
async getWishlistNewReleases(options?: {
  source?: 'wishlist' | 'local_want' | 'vinyl_watch';
  days?: number;
  showDismissed?: boolean;
}): Promise<{ lastCheck: number; releases: WishlistNewRelease[]; count: number }> {
  const params = new URLSearchParams();
  if (options?.source) params.set('source', options.source);
  if (options?.days) params.set('days', options.days.toString());
  if (options?.showDismissed) params.set('showDismissed', 'true');

  const response = await this.get(`/wishlist/new-releases?${params}`);
  return response.data;
}

async getNewReleaseSyncStatus(): Promise<NewReleaseSyncStatus> {
  const response = await this.get('/wishlist/new-releases/status');
  return response.data;
}

async checkForNewReleases(): Promise<void> {
  await this.post('/wishlist/new-releases/check');
}

async dismissNewRelease(id: string): Promise<void> {
  await this.patch(`/wishlist/new-releases/${id}/dismiss`);
}
```

### 2. NewReleasesTab Component

**File:** `src/renderer/components/wishlist/NewReleasesTab.tsx`

```typescript
interface Props {
  onCountChange: (count: number) => void;
}

export const NewReleasesTab: React.FC<Props> = ({ onCountChange }) => {
  const [releases, setReleases] = useState<WishlistNewRelease[]>([]);
  const [lastCheck, setLastCheck] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<NewReleaseSyncStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<{
    source?: string;
    days?: number;
    showDismissed: boolean;
  }>({ showDismissed: false });

  // Poll sync status while syncing
  useEffect(() => {
    if (syncStatus?.status === 'syncing') {
      const interval = setInterval(fetchSyncStatus, 2000);
      return () => clearInterval(interval);
    }
  }, [syncStatus?.status]);

  const fetchSyncStatus = async () => {
    try {
      const status = await api.getNewReleaseSyncStatus();
      setSyncStatus(status);
    } catch (err) {
      // Ignore status fetch errors
    }
  };

  const fetchNewReleases = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getWishlistNewReleases(filter);
      setReleases(data.releases);
      setLastCheck(data.lastCheck);
      onCountChange(data.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckNow = async () => {
    setError(null);
    try {
      await api.checkForNewReleases();
      await fetchSyncStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check failed');
    }
  };

  const handleDismiss = async (id: string) => {
    try {
      await api.dismissNewRelease(id);
      setReleases(releases.filter(r => r.id !== id));
      onCountChange(releases.length - 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dismiss failed');
    }
  };

  return (
    <div className="new-releases-tab">
      {/* Header with sync status */}
      <div className="new-releases-header">
        <div className="last-check">
          Last checked: {lastCheck ? formatRelativeTime(lastCheck) : 'Never'}
        </div>

        {syncStatus?.status === 'syncing' ? (
          <div className="sync-progress">
            <span>Checking {syncStatus.currentMaster}...</span>
            <progress value={syncStatus.progress} max="100" />
            <span>{syncStatus.progress}%</span>
          </div>
        ) : (
          <button
            className="check-now-btn"
            onClick={handleCheckNow}
            disabled={syncStatus?.status === 'syncing'}
          >
            Check Now
          </button>
        )}
      </div>

      {/* Error state */}
      {(error || syncStatus?.status === 'error') && (
        <div className="error-banner">
          <span>{error || syncStatus?.error}</span>
          <button onClick={handleCheckNow}>Retry</button>
        </div>
      )}

      {/* Filters */}
      <div className="new-releases-filters">
        <select
          value={filter.source || ''}
          onChange={e => setFilter({ ...filter, source: e.target.value || undefined })}
        >
          <option value="">All Sources</option>
          <option value="wishlist">Discogs Wishlist</option>
          <option value="local_want">Local Want List</option>
          <option value="vinyl_watch">Vinyl Watch List</option>
        </select>

        <select
          value={filter.days?.toString() || ''}
          onChange={e => setFilter({ ...filter, days: e.target.value ? parseInt(e.target.value) : undefined })}
        >
          <option value="">Detected: All Time</option>
          <option value="7">Detected: Past 7 Days</option>
          <option value="30">Detected: Past 30 Days</option>
          <option value="90">Detected: Past 90 Days</option>
        </select>

        <label className="show-dismissed-toggle">
          <input
            type="checkbox"
            checked={filter.showDismissed}
            onChange={e => setFilter({ ...filter, showDismissed: e.target.checked })}
          />
          Show dismissed
        </label>
      </div>

      {/* Content */}
      {loading ? (
        <div className="loading">Loading...</div>
      ) : releases.length === 0 ? (
        <div className="empty-state">
          <p>No new releases detected.</p>
          <p className="hint">
            New vinyl pressings for albums on your wishlist will appear here.
          </p>
        </div>
      ) : (
        <VirtualizedList
          items={releases}
          itemHeight={120}
          renderItem={(release) => (
            <NewReleaseCard
              key={release.id}
              release={release}
              onDismiss={() => handleDismiss(release.id)}
            />
          )}
        />
      )}
    </div>
  );
};
```

### 3. NewReleaseCard Component

**File:** `src/renderer/components/wishlist/NewReleaseCard.tsx`

```typescript
interface Props {
  release: WishlistNewRelease;
  onDismiss: () => void;
}

export const NewReleaseCard: React.FC<Props> = ({ release, onDismiss }) => {
  const isRecent = Date.now() - release.detectedAt < 7 * 24 * 60 * 60 * 1000;

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'wishlist': return 'Discogs Wishlist';
      case 'local_want': return 'Local Want List';
      case 'vinyl_watch': return 'Vinyl Watch';
      default: return source;
    }
  };

  const getSourceRoute = (source: string, itemId: string | number) => {
    switch (source) {
      case 'wishlist': return `/wishlist?highlight=${itemId}`;
      case 'local_want': return `/wishlist?tab=wanted&highlight=${itemId}`;
      case 'vinyl_watch': return `/wishlist?tab=cdOnly&highlight=${itemId}`;
      default: return '/wishlist';
    }
  };

  return (
    <div className={`new-release-card ${release.dismissed ? 'dismissed' : ''}`}>
      <div className="release-cover">
        <div className="cover-placeholder">
          <span className="vinyl-icon">💿</span>
        </div>
      </div>

      <div className="release-info">
        <div className="release-title">
          <span className="artist">{release.artist}</span>
          <span className="separator"> - </span>
          <span className="title">{release.title}</span>
        </div>

        <div className="release-details">
          {isRecent && <span className="badge new-badge">NEW</span>}
          <span className="format">{release.format.join(' · ')}</span>
          <span className="year">Pressed: {release.year}</span>
          <span className="country">{release.country}</span>
        </div>

        <div className="release-meta">
          <span className="label">{release.label}</span>
          {release.catalogNumber && (
            <span className="catalog">({release.catalogNumber})</span>
          )}
        </div>

        {release.lowestPrice && (
          <div className="release-price">
            From {formatCurrency(release.lowestPrice, release.priceCurrency)}
            {release.numForSale && (
              <span className="for-sale">({release.numForSale} for sale)</span>
            )}
          </div>
        )}

        <div className="release-source">
          <span className="source-badge" data-source={release.source}>
            {getSourceLabel(release.source)}
          </span>
          <span className="detected">
            Detected {formatRelativeTime(release.detectedAt)}
          </span>
        </div>
      </div>

      <div className="release-actions">
        <a
          href={release.discogsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary"
        >
          View on Discogs
        </a>
        <Link
          to={getSourceRoute(release.source, release.sourceItemId)}
          className="btn-secondary"
        >
          View Source
        </Link>
        <button
          className="btn-dismiss"
          onClick={onDismiss}
          title={release.dismissed ? 'Already dismissed' : 'Dismiss'}
        >
          {release.dismissed ? '✓' : '×'}
        </button>
      </div>
    </div>
  );
};
```

---

## Notification Integration

```typescript
async createNewReleaseNotifications(releases: WishlistNewRelease[]): Promise<void> {
  const store = await this.getNewReleases();

  for (const release of releases) {
    // Skip if already notified
    if (release.notified) continue;

    const notification: AppNotification = {
      id: `new-release-${release.id}`,
      type: 'alert',
      title: 'New vinyl pressing available!',
      message: `${release.artist} - ${release.title} (${release.format.join(', ')})`,
      timestamp: Date.now(),
      read: false,
      action: {
        label: 'View',
        route: '/wishlist?tab=newReleases',
        externalUrl: release.discogsUrl,
      },
    };

    await this.notificationService.addNotification(notification);

    // Mark as notified in the store
    const storeRelease = store.releases.find(r => r.id === release.id);
    if (storeRelease) {
      storeRelease.notified = true;
    }
  }

  // Persist the notified flags
  await this.fileStorage.writeJSON(this.NEW_RELEASES_FILE, store);
}
```

---

## Implementation Phases

### Phase 1: Core Infrastructure
1. Add new types to `types.ts` (WishlistNewRelease, NewReleaseSyncStatus, etc.)
2. Add `discogsMasterId` field to `LocalWantItem` type
3. Create migration service for existing LocalWantItem entries
4. Implement `getTrackedMasterIds()` method with logging for items without master IDs
5. Implement `checkForNewReleases()` with batching and retry logic
6. Implement `fetchMasterVersionsPaginated()` for large masters
7. Add sync status tracking and persistence
8. Add API routes

### Phase 2: UI Implementation
1. Add "New Releases" tab to WishlistPage
2. Create `NewReleasesTab` component with filter controls
3. Create `NewReleaseCard` component with source navigation
4. Add tab badge for unread count
5. Add sync progress indicator
6. Add error state with retry button
7. Implement virtualized list for large results

### Phase 3: Settings & Notifications
1. Add settings for new release tracking
2. Integrate with notification system (with notified flag updates)
3. Add "Check Now" manual trigger
4. Settings page integration

### Phase 4: Optimization & Polish
1. Background auto-check on startup (if enabled and stale)
2. Cleanup routine for old dismissed items
3. Add "show dismissed" toggle to UI
4. Source navigation links (View Source Item)

---

## Decisions Made

| Question | Decision | Rationale |
|----------|----------|-----------|
| Filter by detectedAt or release year? | detectedAt | We track when WE found it, not when it was pressed |
| How to handle 500+ version masters? | Limit to 100, sorted by newest | Avoids API abuse, newest pressings most relevant |
| Batching strategy? | 20 masters per check | Balances progress vs. rate limits |
| Retry strategy? | Exponential backoff, max 3 retries | Standard resilience pattern |
| API method for dismiss? | PATCH (not POST) | RESTful - partial update to existing resource |
| How to track sync progress? | Separate status file | Survives app restart, supports polling |
| Handle items without masterId? | Log and skip | Can't track releases without master reference |
| Migration for existing LocalWantItems? | Background migration on first run | Non-blocking, progressive |
| Large list rendering? | Virtualization (react-window) | Performance for 100+ items |
| Cancel sync support? | **No** - batches are small (~25s) | Not worth complexity; user can navigate away |
| Price stats for new releases? | **Optional** - not fetched by default | Would require extra API call per release; can add later if needed |
| Retry network timeouts? | **Yes** - treat ETIMEDOUT/ECONNRESET like 429 | Flaky connectivity is common on desktop apps |
| Discogs "released DESC" ordering? | **Good enough** - not perfect but practical | Discogs doesn't have "date_added"; newest pressed is best proxy |

### Ordering Limitation Note

Discogs `/masters/{id}/versions` supports sorting by `released` (year pressed) but NOT by "date added to database". This means:
- A 2015 pressing added to Discogs today won't appear first when sorted by `released DESC`
- However, most new pressings ARE recent releases (2024-2026), so this works well in practice
- Edge case: reissue campaigns may add old pressings - these could be missed until next full cache refresh

**Mitigation:** The 7-day versions cache TTL ensures we eventually see all versions, just not immediately for old pressings added late.

---

## Test Coverage Targets

### Backend Tests

**Unit Tests:**
- `getTrackedMasterIds()` - aggregates from all sources, handles missing masterIds
- `checkForNewReleases()` - detects new releases, respects settings
- `fetchMasterVersionsWithRetry()` - retry logic, backoff timing
- `fetchMasterVersionsPaginated()` - pagination, MAX_VERSIONS limit
- `dismissNewRelease()` - marks as dismissed, persists
- `cleanupDismissedReleases()` - removes old items, respects cutoff
- `migrateLocalWantListMasterIds()` - backfill logic

**Integration Tests:**
- API routes - all endpoints with success/error cases
- Rate limiting behavior - mocked 429 responses
- Sync status updates during check

### Frontend Tests

- NewReleasesTab - loading, empty, error, populated states
- NewReleasesTab - filter controls (source, days, showDismissed)
- NewReleasesTab - sync progress display
- NewReleaseCard - all badge states, actions
- Tab badge - shows correct count, updates on dismiss
- Source navigation - correct routes generated

---

## File Changes Summary

### New Files

- `src/renderer/components/wishlist/NewReleasesTab.tsx`
- `src/renderer/components/wishlist/NewReleaseCard.tsx`
- `tests/backend/wishlistService.newReleases.test.ts`
- `tests/frontend/components/NewReleasesTab.test.tsx`

### Modified Files

- `src/shared/types.ts` - Add new types
- `src/backend/services/wishlistService.ts` - Add new release tracking methods
- `src/backend/services/migrationService.ts` - Register LocalWantItem migration
- `src/backend/routes/wishlist.ts` - Add new routes
- `src/renderer/services/api.ts` - Add API methods
- `src/renderer/pages/WishlistPage.tsx` - Add new tab
- `src/renderer/pages/SettingsPage.tsx` - Add settings section
- `src/renderer/styles.css` - Add component styles

---

## Summary

This feature enables tracking new vinyl releases for wishlist albums by leveraging the existing versions cache infrastructure. Key improvements in this revision:

1. **Clear terminology** - Defined "new release" vs "newly detected" with filter behavior clarified
2. **Robust rate limiting** - Exponential backoff with configurable retries
3. **Pagination support** - Handles masters with 500+ versions (limited to 100)
4. **Sync status tracking** - Progress indicator, resumable batching, error state
5. **Migration path** - Backfill discogsMasterId for existing LocalWantItem entries
6. **UI completeness** - Error states, progress, virtualization, source navigation
7. **Decisions documented** - Aligned with Feature 5 plan format

The feature complements Feature 5 (MusicBrainz new release tracking) by focusing on **new pressings of existing albums** rather than **new albums from artists**.
