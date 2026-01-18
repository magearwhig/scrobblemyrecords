# New Release Tracking - Implementation Plan

## Overview

Track new and upcoming releases from artists in your collection using MusicBrainz data. Artists are matched by name from your Discogs collection, with disambiguation UI for ambiguous matches. Combined with Discogs for vinyl availability checking on releases.

---

## Feature Concept

### What It Does
- Fetches releases from MusicBrainz for artists in your Discogs collection
- Shows new/recent releases (past 3 months) and upcoming releases (future)
- Allows manual artist disambiguation when name matches are ambiguous
- Integrates with wishlist for one-click "Add to Wishlist"
- Checks Discogs for vinyl availability on new releases

### Why It's Valuable
- Stay informed about new music from artists you already collect
- Discover upcoming releases to pre-order or watch for
- Connect new releases to vinyl availability for physical collectors

---

## User Interface

### Location
New top-level page: **New Releases** (in sidebar navigation)

### UI Layout

```
+-------------------------------------------------------------------------+
| New Releases                                                             |
+-------------------------------------------------------------------------+
|                                                                          |
| Warning: 3 artists need disambiguation                    [Resolve Now]  |
|                                                                          |
+-------------------------------------------------------------------------+
|                                                                          |
| Last checked: 2 days ago                              [Check Now]        |
|                                                                          |
| Filter: [All v]  Time: [Recent & Upcoming v]  Type: [All Types v]        |
|                                                                          |
| +---------------------------------------------------------------------+ |
| | [cover]  Radiohead - Kid Amnesia                                    | |
| |          Released: Mar 2026                                         | |
| |          [Album]  [Check Vinyl]  [Add to Wishlist]                  | |
| +---------------------------------------------------------------------+ |
|                                                                          |
| +---------------------------------------------------------------------+ |
| | [cover]  Bjork - Fossora Remixes                                    | |
| |          Released: Feb 2026  - Upcoming                             | |
| |          [EP]  [Vinyl Available $32-48]  [Add to Wishlist]          | |
| +---------------------------------------------------------------------+ |
|                                                                          |
| +---------------------------------------------------------------------+ |
| | [cover]  Boards of Canada - New Single                              | |
| |          Released: Jan 2026                                         | |
| |          [Single]  [CD Only]  [Watch for Vinyl]                     | |
| +---------------------------------------------------------------------+ |
|                                                                          |
+-------------------------------------------------------------------------+
```

### Disambiguation Dialog

When artist matching returns multiple results:

```
+-------------------------------------------------------------------------+
| Select the correct artist: "Radiohead"                                   |
+-------------------------------------------------------------------------+
|                                                                          |
| ( ) Radiohead                                                            |
|     UK rock band (1985-present)                                          |
|     198 releases - Oxford, England                                       |
|                                                                          |
| ( ) Radiohead (tribute band)                                             |
|     Radiohead cover band                                                 |
|     3 releases - Los Angeles, USA                                        |
|                                                                          |
| ( ) None of these                                                        |
|     Skip this artist                                                     |
|                                                                          |
| [Cancel]                                         [Confirm Selection]     |
+-------------------------------------------------------------------------+
```

### Filters

**Time Period:**
- Recent & Upcoming (default) - Past 3 months + future
- Recent Only - Past 3 months
- Upcoming Only - Future releases
- Past Year - Last 12 months
- All Time - All releases for tracked artists

**Release Type:**
- All Types (default)
- Albums
- EPs
- Singles
- Compilations

**Additional Filters:**
- Vinyl Available Only
- Hide items already in wishlist

---

## Data Model

### New Type Definitions

```typescript
// src/shared/types.ts

/**
 * MusicBrainz artist match result for disambiguation
 */
export interface MusicBrainzArtistMatch {
  mbid: string;              // MusicBrainz artist ID
  name: string;              // Artist name
  disambiguation?: string;   // Disambiguation text (e.g., "UK rock band")
  country?: string;          // Country of origin
  beginYear?: number;        // Year artist started
  endYear?: number;          // Year artist ended (if applicable)
  releaseCount?: number;     // Number of releases
  score: number;             // Match score (0-100)
}

/**
 * Stored artist mapping from Discogs to MusicBrainz
 */
export interface ArtistMbidMapping {
  discogsArtistId?: number;  // Discogs artist ID (if available)
  discogsArtistName: string; // Original name from Discogs (canonical)
  normalizedName: string;    // Lowercase, normalized for lookup
  mbid: string | null;       // MusicBrainz ID (null if "none of these" selected)
  confirmedAt: number;       // When user confirmed this mapping
  confirmedBy: 'auto' | 'user'; // How it was confirmed
}

/**
 * A release from MusicBrainz
 */
export interface MusicBrainzRelease {
  mbid: string;              // Release group MBID
  title: string;
  artistName: string;
  artistMbid: string;
  releaseDate: string | null;  // ISO date string (YYYY-MM-DD or YYYY-MM or YYYY)
  releaseType: 'album' | 'ep' | 'single' | 'compilation' | 'other';
  primaryType?: string;       // MusicBrainz primary type
  secondaryTypes?: string[];  // MusicBrainz secondary types
  coverArtUrl?: string;       // Cover art URL from Cover Art Archive
}

/**
 * A tracked release with vinyl availability info
 */
export interface TrackedRelease {
  mbid: string;
  title: string;
  artistName: string;
  artistMbid: string;
  releaseDate: string | null;
  releaseType: MusicBrainzRelease['releaseType'];
  coverArtUrl?: string;

  // Vinyl availability (from Discogs lookup)
  vinylStatus: 'unknown' | 'checking' | 'available' | 'cd-only' | 'not-found';
  vinylPriceRange?: {
    min: number;
    max: number;
    currency: string;
  };
  discogsUrl?: string;        // Link to Discogs release/master
  discogsMasterId?: number;   // For wishlist integration

  // Tracking
  firstSeen: number;          // When we first detected this release
  isUpcoming: boolean;        // Release date is in the future
  inWishlist: boolean;        // Already in user's wishlist
}

/**
 * Artist disambiguation status
 */
export interface ArtistDisambiguationStatus {
  id: string;                  // Unique ID for this disambiguation request
  artistName: string;
  normalizedName: string;
  status: 'pending' | 'resolved' | 'skipped';
  candidates?: MusicBrainzArtistMatch[];
  selectedMbid?: string | null;
  createdAt: number;           // When this was added to pending list
  resolvedAt?: number;         // When user resolved (for cleanup)
}

/**
 * Release tracking sync status
 */
export interface ReleaseTrackingSyncStatus {
  status: 'idle' | 'syncing' | 'completed' | 'error';
  lastSync: number | null;
  artistsProcessed: number;
  totalArtists: number;
  releasesFound: number;
  pendingDisambiguations: number;
  error?: string;
}

/**
 * Release tracking settings
 */
export interface ReleaseTrackingSettings {
  schemaVersion: 1;
  autoCheckOnStartup: boolean;      // Check for new releases on app startup
  checkFrequencyDays: number;       // How often to re-check (default: 7)
  notifyOnNewRelease: boolean;      // Create notification for new releases
  includeEps: boolean;              // Include EPs in results
  includeSingles: boolean;          // Include singles in results
  includeCompilations: boolean;     // Include compilations in results
}
```

---

## Data Storage

### File Structure

```
data/releases/
├── artist-mbid-map.json          # Confirmed artist mappings
├── tracked-releases.json         # Cached releases
├── sync-status.json              # Sync progress/status
├── settings.json                 # User preferences
├── pending-disambiguations.json  # Artists needing user input
└── collection-artists-cache.json # Cached artist list from collection
```

### Schema Versions (aligned with Feature 0C)

All data files include `schemaVersion` for future migration compatibility:

**artist-mbid-map.json:**
```json
{
  "schemaVersion": 1,
  "mappings": [
    {
      "discogsArtistName": "Radiohead",
      "normalizedName": "radiohead",
      "mbid": "a74b1b7f-71a5-4011-9441-d0b5e4122711",
      "confirmedAt": 1705000000000,
      "confirmedBy": "auto"
    }
  ]
}
```

**tracked-releases.json:**
```json
{
  "schemaVersion": 1,
  "lastUpdated": 1705000000000,
  "releases": [...]
}
```

**pending-disambiguations.json:**
```json
{
  "schemaVersion": 1,
  "pending": [
    {
      "id": "disamb_1705000000000_radiohead",
      "artistName": "Radiohead",
      "normalizedName": "radiohead",
      "status": "pending",
      "candidates": [...],
      "createdAt": 1705000000000
    }
  ]
}
```

**collection-artists-cache.json:**
```json
{
  "schemaVersion": 1,
  "fetchedAt": 1705000000000,
  "artists": [
    { "name": "Radiohead", "id": 3840, "normalizedName": "radiohead" }
  ]
}
```

### Pending Disambiguations Lifecycle

| Event | Action |
|-------|--------|
| Artist search returns multiple/low-confidence matches | Create pending entry with `status: 'pending'` |
| User selects an artist | Set `status: 'resolved'`, `selectedMbid`, `resolvedAt`; create mapping |
| User selects "None of these" | Set `status: 'skipped'`, `selectedMbid: null`, `resolvedAt`; create mapping with `mbid: null` |
| User cancels dialog | No change (stays pending) |
| Sync runs again | Skip artists with existing mapping (resolved or skipped); don't re-add to pending |
| Cleanup (weekly) | Remove entries with `status !== 'pending'` older than 30 days |

**Deduplication:** Before adding to pending, check if `normalizedName` already exists in pending list OR in mappings. Skip if found.

---

## Backend Implementation

### 1. MusicBrainz Service

**File:** `src/backend/services/musicbrainzService.ts`

Core functionality:
- `searchArtist(name, limit)` - Search for artists, return candidates for disambiguation
- `getArtistReleases(artistMbid, types)` - Get all release groups for an artist
- `getCoverArtUrl(releaseGroupMbid)` - Fetch cover art from Cover Art Archive

Rate limiting: 1 request per second (MusicBrainz requirement)

#### Cover Art Archive Integration

**Endpoint:** `https://coverartarchive.org/release-group/{mbid}`

The Cover Art Archive (CAA) uses MusicBrainz release group MBIDs directly:

```typescript
async getCoverArtUrl(releaseGroupMbid: string): Promise<string | null> {
  try {
    // CAA returns JSON with image list for release groups
    const response = await axios.get(
      `https://coverartarchive.org/release-group/${releaseGroupMbid}`,
      { timeout: 5000 }
    );

    // Find front cover image
    const frontImage = response.data.images?.find((img: any) => img.front);

    // Prefer small thumbnail for list views (250px), fall back to full image
    return frontImage?.thumbnails?.small
        || frontImage?.thumbnails?.['250']
        || frontImage?.image
        || null;
  } catch (error) {
    // 404 is common (no cover art) - not an error
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    this.logger.debug(`CAA lookup failed for ${releaseGroupMbid}`, error);
    return null;
  }
}
```

**Caching strategy:**
- Cache cover art URLs in `tracked-releases.json` alongside release data
- URLs are stable (CDN-hosted), cache for 30 days
- Lazy load: only fetch when release card is rendered
- Batch fetch during sync for visible releases (first 50)

### 2. Release Tracking Service

**File:** `src/backend/services/releaseTrackingService.ts`

Core functionality:
- Settings management (CRUD)
- Artist mapping management (save, get, normalize names)
- Disambiguation management (pending list, resolve, cleanup)
- Release tracking (sync, filter, dedupe)
- Vinyl availability checking (Discogs integration)
- Collection artist caching

Key methods:
- `startSync()` - Non-blocking background sync
- `getTrackedReleases()` - Get cached releases with filters
- `checkVinylAvailability(mbid)` - On-demand Discogs search
- `resolveDisambiguation(id, mbid, artistName)` - User confirms artist (by ID, not name)
- `getCollectionArtists()` - Get/cache unique artists from collection
- `cleanupOldDisambiguations()` - Remove resolved entries older than 30 days

#### Collection Artists Caching

To avoid re-fetching the full collection on every sync:

```typescript
async getCollectionArtists(): Promise<CollectionArtist[]> {
  // Check cache first
  const cache = await this.fileStorage.readJSON<CollectionArtistsCache>(
    this.ARTISTS_CACHE_FILE
  );

  const cacheAge = cache ? Date.now() - cache.fetchedAt : Infinity;
  const CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

  if (cache && cacheAge < CACHE_MAX_AGE) {
    this.logger.debug(`Using cached artist list (${cache.artists.length} artists)`);
    return cache.artists;
  }

  // Fetch from collection with pagination
  const artists = await this.extractArtistsFromCollection();

  // Save cache
  await this.fileStorage.writeJSON(this.ARTISTS_CACHE_FILE, {
    schemaVersion: 1,
    fetchedAt: Date.now(),
    artists,
  });

  return artists;
}

private async extractArtistsFromCollection(): Promise<CollectionArtist[]> {
  const artistMap = new Map<string, CollectionArtist>();
  let page = 1;
  const perPage = 100;

  while (true) {
    const items = await this.discogsService.getCollectionPage(page, perPage);
    if (items.length === 0) break;

    for (const item of items) {
      const artistName = item.artists?.[0]?.name || item.artist;
      if (!artistName) continue;

      const normalized = this.normalizeArtistName(artistName);
      if (!artistMap.has(normalized)) {
        artistMap.set(normalized, {
          name: artistName,
          id: item.artists?.[0]?.id,
          normalizedName: normalized,
        });
      }
    }

    page++;
  }

  return Array.from(artistMap.values());
}
```

### 3. Discogs Vinyl Availability Strategy

**File:** `src/backend/services/releaseTrackingService.ts`

Detailed strategy for matching MusicBrainz releases to Discogs:

```typescript
async checkVinylAvailability(releaseMbid: string): Promise<TrackedRelease | null> {
  const releases = await this.getTrackedReleases();
  const release = releases.find(r => r.mbid === releaseMbid);
  if (!release) return null;

  release.vinylStatus = 'checking';
  await this.saveTrackedReleases(releases);

  try {
    // Step 1: Search Discogs by artist + title (exact match first)
    const searchQuery = `${release.artistName} ${release.title}`;
    const searchResults = await this.discogsService.search({
      query: searchQuery,
      type: 'master',  // Search masters first (groups all pressings)
      per_page: 10,
    });

    // Step 2: Find best match using fuzzy matching
    const match = this.findBestDiscogsMatch(release, searchResults);

    if (!match) {
      // Step 3: Fallback - search releases directly if no master found
      const releaseResults = await this.discogsService.search({
        query: searchQuery,
        type: 'release',
        per_page: 10,
      });
      const releaseMatch = this.findBestDiscogsMatch(release, releaseResults);

      if (!releaseMatch) {
        release.vinylStatus = 'not-found';
        await this.saveTrackedReleases(releases);
        return release;
      }

      // Use release match
      return this.processDiscogsMatch(release, releaseMatch, releases);
    }

    return this.processDiscogsMatch(release, match, releases);
  } catch (error) {
    this.logger.error(`Vinyl check failed for ${release.title}`, error);
    release.vinylStatus = 'unknown';
    await this.saveTrackedReleases(releases);
    return release;
  }
}

private findBestDiscogsMatch(
  mbRelease: TrackedRelease,
  discogsResults: DiscogsSearchResult[]
): DiscogsSearchResult | null {
  const normalizedArtist = this.normalizeArtistName(mbRelease.artistName);
  const normalizedTitle = this.normalizeTitle(mbRelease.title);

  for (const result of discogsResults) {
    const resultArtist = this.normalizeArtistName(result.artist || '');
    const resultTitle = this.normalizeTitle(result.title || '');

    // Exact match on both artist and title
    if (resultArtist === normalizedArtist && resultTitle === normalizedTitle) {
      return result;
    }

    // Fuzzy match: artist matches and title contains or is contained
    if (resultArtist === normalizedArtist) {
      if (resultTitle.includes(normalizedTitle) || normalizedTitle.includes(resultTitle)) {
        return result;
      }
    }
  }

  return null;
}

private async processDiscogsMatch(
  release: TrackedRelease,
  match: DiscogsSearchResult,
  releases: TrackedRelease[]
): Promise<TrackedRelease> {
  release.discogsMasterId = match.master_id || match.id;
  release.discogsUrl = match.uri;

  // Step 4: Check formats for vinyl
  if (match.type === 'master' && match.master_id) {
    // Fetch master versions to check for vinyl
    const versions = await this.discogsService.getMasterVersions(match.master_id, {
      format: 'Vinyl',
      per_page: 5,
    });

    if (versions.length > 0) {
      release.vinylStatus = 'available';
      // Get price stats if available
      const priceStats = await this.getVinylPriceRange(versions);
      if (priceStats) {
        release.vinylPriceRange = priceStats;
      }
    } else {
      release.vinylStatus = 'cd-only';
    }
  } else {
    // Single release - check format directly
    const hasVinyl = this.isVinylFormat(match.format || []);
    release.vinylStatus = hasVinyl ? 'available' : 'cd-only';
  }

  await this.saveTrackedReleases(releases);
  return release;
}

private normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, '')  // Remove parentheticals
    .replace(/[^\w\s]/g, '')        // Remove punctuation
    .replace(/\s+/g, ' ')
    .trim();
}
```

### 4. API Routes

**File:** `src/backend/routes/releases.ts`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/releases` | GET | Get tracked releases with filters |
| `/api/v1/releases/sync/status` | GET | Get sync status |
| `/api/v1/releases/sync` | POST | Start a sync |
| `/api/v1/releases/disambiguations` | GET | Get pending disambiguations |
| `/api/v1/releases/disambiguations/resolve` | POST | Resolve a disambiguation (body: `{id, mbid, artistName}`) |
| `/api/v1/releases/mappings` | GET | Get all artist mappings |
| `/api/v1/releases/mappings` | DELETE | Remove a mapping (body: `{normalizedName}`) |
| `/api/v1/releases/:mbid/check-vinyl` | POST | Check vinyl availability |
| `/api/v1/releases/settings` | GET | Get settings |
| `/api/v1/releases/settings` | POST | Update settings |

**Note:** Changed disambiguation resolve endpoint from `/:name/resolve` to body-based POST to avoid URL encoding issues with normalized names containing special characters.

---

## Rate Limiting & Backoff Strategy

### Combined Flow Rate Limiting

During initial sync, we hit both MusicBrainz and potentially Discogs APIs:

```typescript
// Rate limit configuration
const MUSICBRAINZ_DELAY_MS = 1100;  // 1 req/sec + buffer
const DISCOGS_DELAY_MS = 1000;      // 60 req/min = 1/sec
const COVER_ART_DELAY_MS = 100;     // Generous, but batch

// Exponential backoff for rate limit errors
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 30000;

async executeWithBackoff<T>(
  operation: () => Promise<T>,
  context: string
): Promise<T> {
  let delay = INITIAL_BACKOFF_MS;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const isRateLimited = axios.isAxiosError(error) &&
        (error.response?.status === 429 || error.response?.status === 503);

      if (!isRateLimited || attempt === MAX_RETRIES) {
        throw error;
      }

      this.logger.warn(`Rate limited (${context}), retry ${attempt}/${MAX_RETRIES} in ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, MAX_BACKOFF_MS);
    }
  }

  throw new Error('Max retries exceeded');
}
```

### Sync Flow with Batching

```typescript
async runSyncInBackground(): Promise<void> {
  const artists = await this.getCollectionArtists();
  const BATCH_SIZE = 10;  // Process artists in batches

  for (let i = 0; i < artists.length; i += BATCH_SIZE) {
    const batch = artists.slice(i, i + BATCH_SIZE);

    for (const artist of batch) {
      // Check mapping first (no API call)
      const mapping = await this.getMappingByName(artist.normalizedName);

      if (mapping) {
        if (mapping.mbid) {
          // Fetch releases (MusicBrainz API)
          await new Promise(r => setTimeout(r, MUSICBRAINZ_DELAY_MS));
          const releases = await this.musicbrainzService.getArtistReleases(mapping.mbid);
          // Process releases...
        }
        // Skip if mapping.mbid is null (user selected "none of these")
      } else {
        // Search MusicBrainz for candidates
        await new Promise(r => setTimeout(r, MUSICBRAINZ_DELAY_MS));
        const candidates = await this.musicbrainzService.searchArtist(artist.name);
        // Handle disambiguation...
      }

      // Update progress
      await this.updateSyncStatus({
        artistsProcessed: i + batch.indexOf(artist) + 1,
      });
    }

    // Save progress after each batch (resumability)
    await this.saveTrackedReleases(this.currentReleases);
  }
}
```

---

## Frontend Implementation

### 1. API Client Extension

**File:** `src/renderer/services/api.ts` (additions)

Add methods for all release tracking endpoints.

### 2. New Releases Page

**File:** `src/renderer/pages/NewReleasesPage.tsx`

Key components:
- Disambiguation banner (shown when pending disambiguations exist)
- Filter controls (time period, release type)
- Release card grid
- Sync status bar with "Check Now" button

### 3. Components

| Component | File | Purpose |
|-----------|------|---------|
| DisambiguationDialog | `releases/DisambiguationDialog.tsx` | Artist selection UI |
| ReleaseCard | `releases/ReleaseCard.tsx` | Individual release display |
| ReleaseFilters | `releases/ReleaseFilters.tsx` | Filter controls |
| SyncStatusBar | `releases/SyncStatusBar.tsx` | Sync progress/status |

---

## Implementation Phases

### Phase 1: Core Infrastructure

**Deliverables:**
1. Type definitions in `types.ts` (with schemaVersion on all)
2. `MusicBrainzService` with artist search and release fetching
3. `ReleaseTrackingService` core logic with collection caching
4. API routes for releases
5. Basic `NewReleasesPage` (list view only)
6. CSS styles

### Phase 2: Artist Disambiguation

**Deliverables:**
1. Disambiguation UI component
2. Pending disambiguation management with lifecycle
3. Auto-match logic for high-confidence results (score >= 95, single result)
4. Manual resolution flow with ID-based API
5. Cleanup routine for old resolved entries

### Phase 3: Vinyl Integration

**Deliverables:**
1. Discogs search integration with fuzzy matching
2. Master vs release lookup strategy
3. Vinyl availability status with format detection
4. "Add to Wishlist" integration
5. Price range display (from marketplace stats)

### Phase 4: Notifications & Polish

**Deliverables:**
1. Notification integration for new releases
2. Cover art fetching from Cover Art Archive with caching
3. Settings page integration
4. Performance optimizations (batch cover art fetching)

---

## Technical Considerations

### Rate Limiting

| API | Rate Limit | Strategy |
|-----|------------|----------|
| MusicBrainz | 1 req/sec | Built-in interceptor delay + exponential backoff |
| Cover Art Archive | Generous | Cache responses, lazy load, batch during sync |
| Discogs (vinyl check) | 60 req/min | Reuse existing rate limiter + backoff |

### Caching

| Data | Cache Duration | Notes |
|------|----------------|-------|
| Artist mappings | Permanent | User-confirmed, stored in JSON |
| Collection artists | 24 hours | Avoids re-fetching full collection |
| Releases | 7 days | Re-fetch weekly |
| Cover art URLs | 30 days | CDN-hosted, stable |
| Vinyl availability | 24 hours | Marketplace prices change |

### Artist Matching Strategy

1. Normalize artist name (lowercase, remove "The ", normalize "&" to "and", remove punctuation)
2. Check existing mapping first (no API call)
3. Search MusicBrainz for matches
4. If single result with score >= 95: auto-confirm
5. If multiple results or low confidence: queue for disambiguation
6. User selects correct artist (or "none of these")
7. Store mapping permanently for future syncs

### Edge Cases

| Case | Handling |
|------|----------|
| Artist not found in MusicBrainz | Skip silently, log for debugging |
| Multiple artists with same name | Disambiguation UI |
| No release date | Treat as unknown, don't show in "upcoming" |
| Cover art not available | Show placeholder/vinyl icon |
| Discogs rate limited during vinyl check | Retry with exponential backoff |
| Normalized name with special chars | Use ID-based API, not URL params |
| User cancels disambiguation | Stays pending, can resolve later |
| Duplicate disambiguation requests | Dedupe by normalizedName before adding |

---

## Test Coverage Targets

### Backend Tests

- `musicbrainzService.searchArtist()` - returns candidates
- `musicbrainzService.getArtistReleases()` - pagination, type filtering
- `musicbrainzService.getCoverArtUrl()` - success, 404, error cases
- `releaseTrackingService.normalizeArtistName()` - various formats
- `releaseTrackingService.saveMapping()` / `getMappingByName()`
- `releaseTrackingService.startSync()` - end-to-end flow
- `releaseTrackingService.checkVinylAvailability()` - status updates, fuzzy matching
- `releaseTrackingService.getCollectionArtists()` - caching behavior
- `releaseTrackingService.cleanupOldDisambiguations()` - lifecycle
- API routes - all endpoints with success/error cases

### Frontend Tests

- NewReleasesPage - loading, empty, error states
- DisambiguationDialog - render, selection, submit
- ReleaseCard - all badge states, button actions
- Filter controls - filter application

---

## Decisions Made

| Question | Decision | Rationale |
|----------|----------|-----------|
| Where to get releases? | MusicBrainz | Free, comprehensive, well-documented API |
| How to match artists? | Normalized name search | Simple, handles most cases; disambiguation for edge cases |
| Auto-match threshold? | Score >= 95, single result | Conservative to avoid false positives |
| What counts as "recent"? | Past 3 months | Reasonable window for discovery |
| Include singles by default? | No | Too noisy; opt-in via settings |
| Vinyl check timing? | On-demand | Saves API calls; user-initiated |
| Cover art source? | Cover Art Archive | Free, uses MusicBrainz release group IDs directly |
| Disambiguation API? | POST with body | Avoids URL encoding issues with special characters |
| Artist caching? | 24-hour cache | Avoids re-fetching collection on every sync |
| Schema versioning? | All data files | Aligned with Feature 0C for backup compatibility |

---

## File Changes Summary

### New Files

- `src/backend/services/musicbrainzService.ts`
- `src/backend/services/releaseTrackingService.ts`
- `src/backend/routes/releases.ts`
- `src/renderer/pages/NewReleasesPage.tsx`
- `src/renderer/components/releases/DisambiguationDialog.tsx`
- `src/renderer/components/releases/ReleaseCard.tsx`
- `src/renderer/components/releases/ReleaseFilters.tsx`
- `tests/backend/services/musicbrainzService.test.ts`
- `tests/backend/services/releaseTrackingService.test.ts`
- `tests/backend/routes/releases.test.ts`
- `tests/frontend/pages/NewReleasesPage.test.tsx`

### Modified Files

- `src/shared/types.ts` - Add new types
- `src/renderer/services/api.ts` - Add API methods
- `src/server.ts` - Register releases routes
- `src/renderer/App.tsx` - Add route
- `src/renderer/components/Sidebar.tsx` - Add nav item
- `src/renderer/styles.css` - Add component styles
- `roadmap.md` - Update Feature 5 status

---

## Summary

Feature 5 enables tracking new releases from artists in your collection using MusicBrainz as the data source. The key challenges are:

1. **Artist matching** - Solved with normalized name search + disambiguation UI with proper lifecycle
2. **Rate limiting** - Built-in delays with exponential backoff for both MusicBrainz and Discogs
3. **Vinyl integration** - On-demand Discogs search with master/release fallback and fuzzy matching
4. **Collection efficiency** - 24-hour artist cache avoids re-fetching full collection
5. **Data consistency** - All files have schemaVersion aligned with Feature 0C

The feature is self-contained with clear boundaries to existing services (wishlist, discogs) and follows established patterns in the codebase for services, routes, and UI components.
