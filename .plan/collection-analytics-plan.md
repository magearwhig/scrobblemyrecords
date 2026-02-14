# Feature 13: Collection Analytics - Implementation Plan

## Overview

Collection Analytics transforms the raw Discogs collection data into actionable insights about a user's vinyl library. This is a **Discogs-only** feature -- no Last.fm scrobble data is required. It answers questions like: "What's my collection worth?", "Which decades dominate my shelves?", "Which labels do I buy from most?", and "How has my collection grown over time?"

### Why It's Valuable
- **Collection value estimation** -- Users want to know what their vinyl is worth without manually checking each release
- **Format breakdown** -- Understand the physical composition of a collection (LPs vs 7"s vs box sets)
- **Label distribution** -- Surface collecting patterns users might not be aware of
- **Decade histogram** -- Visualize musical era preferences
- **Growth timeline** -- Track collecting activity over time with adds/removes
- **No sync dependency** -- Works immediately with cached collection data; no Last.fm sync needed

### Design Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Where does this page live? | New tab on existing CollectionPage or new "Collection Analytics" page under Library | Keeps collection-related features grouped; avoids top-level nav bloat (see UI Navigation Guidelines in dev_prompt.md) |
| Data source for values? | Discogs `/marketplace/stats/{release_id}` + `/marketplace/price_suggestions/{release_id}` | Same APIs already used by wishlist/discard pile features; `getMarketplaceStats()` exists in `wishlistService.ts` |
| Cache strategy for value data? | 7-day TTL per release, progressive fetching (10-20 releases per batch) | Marketplace stats don't change rapidly; rate limiting requires progressive approach |
| Store analytics results? | Cache computed analytics in `collection-analytics/analytics-cache.json` (7-day TTL) | Avoid recomputing expensive cross-collection aggregations on every page load |
| Chart library? | recharts (already in project) | Consistency with StatsPage charts; no new dependency |
| Value currency? | Use Discogs API currency (usually USD); display user's preferred currency from wishlist settings | Consistent with existing currency handling in wishlist/discard pile features |

---

## Data Source Analysis

### Existing Data Available (No Changes Needed)

**From Discogs collection cache** (`collections/{username}-page-{N}.json`):
- `CollectionItem.release.format: string[]` -- e.g., `["Vinyl", "LP", "Album"]`
- `CollectionItem.release.label: string[]` -- e.g., `["Warp Records", "Warp Records Ltd."]`
- `CollectionItem.release.year?: number` -- Release year
- `CollectionItem.release.id: number` -- Release ID (for marketplace stats)
- `CollectionItem.release.master_id?: number` -- Master ID (for grouping pressings)
- `CollectionItem.date_added: string` -- ISO date when added to collection
- `CollectionItem.release.cover_image?: string` -- Cover art URL
- `CollectionItem.release.artist: string` -- Artist name
- `CollectionItem.release.title: string` -- Release title
- `CollectionItem.rating?: number` -- User rating (0-5)

**From existing services:**
- `WishlistService.getMarketplaceStats(releaseId)` -- Marketplace pricing (lowest, median, highest, numForSale, price suggestions by condition)
- `loadCollection(username)` helper in `stats.ts` route -- Loads all cached collection pages

### What Needs New Logic

1. **Collection value estimation** -- Batch-fetch marketplace stats for all (or sampled) collection items, aggregate totals
2. **Format breakdown** -- Parse `CollectionItem.release.format[]` arrays, normalize format names, count occurrences
3. **Label distribution** -- Parse `CollectionItem.release.label[]` arrays, normalize label names, count and rank
4. **Decade/year histogram** -- Group by `CollectionItem.release.year`, handle null/0 years
5. **Growth timeline** -- Parse `CollectionItem.date_added` into monthly/yearly buckets, track cumulative growth
6. **Records added/removed tracking** -- Compare collection snapshots over time (requires storing historical snapshots)

### Discogs API Calls Required

| Endpoint | Purpose | Rate Impact | Caching |
|----------|---------|-------------|---------|
| `/marketplace/stats/{release_id}` | Lowest price, num_for_sale | 1 call per release | 7-day cache |
| `/marketplace/price_suggestions/{release_id}` | Price by condition (VG, VG+, NM, M) | 1 call per release | 7-day cache |
| None (collection already cached) | Format, label, year, date_added | 0 calls | Uses existing collection cache |

**Critical constraint:** For a 500-item collection, value estimation requires up to 1000 API calls (2 per release: stats + suggestions). At 1 req/sec Discogs rate limit, that's ~17 minutes for a full collection scan. This demands progressive batching with progress UI.

---

## API Endpoint Design

All endpoints follow the existing `/api/v1/` convention with factory pattern.

### New Route File: `src/backend/routes/collectionAnalytics.ts`

```typescript
export default function createCollectionAnalyticsRouter(
  fileStorage: FileStorage,
  authService: AuthService,
  collectionAnalyticsService: CollectionAnalyticsService,
  wishlistService: WishlistService
): Router
```

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/collection-analytics/overview` | Get all collection analytics (format breakdown, label distribution, decade histogram, growth timeline) |
| `GET` | `/api/v1/collection-analytics/value` | Get collection value estimation (cached result + scan status) |
| `POST` | `/api/v1/collection-analytics/value/scan` | Trigger progressive value scan |
| `GET` | `/api/v1/collection-analytics/value/scan/status` | Get value scan progress |
| `GET` | `/api/v1/collection-analytics/formats` | Get format breakdown only |
| `GET` | `/api/v1/collection-analytics/labels` | Get label distribution only |
| `GET` | `/api/v1/collection-analytics/decades` | Get decade/year histogram only |
| `GET` | `/api/v1/collection-analytics/growth` | Get growth timeline only |
| `GET` | `/api/v1/collection-analytics/growth?granularity=month\|year` | Growth with granularity control |

### Endpoint Details

**GET `/api/v1/collection-analytics/overview`**
Returns all non-value analytics in a single request. These computations are cheap (derived from cached collection data, no API calls).

```typescript
// Response
{
  success: true,
  data: {
    formats: FormatBreakdown,
    labels: LabelDistribution,
    decades: DecadeHistogram,
    growth: GrowthTimeline,
    summary: CollectionSummary
  }
}
```

**GET `/api/v1/collection-analytics/value`**
Returns the latest cached value estimation. If no scan has been run, returns null with instructions to trigger a scan.

```typescript
// Response
{
  success: true,
  data: {
    estimation: CollectionValueEstimation | null,
    scanStatus: ValueScanStatus,
    lastScanTimestamp: number | null,
    cacheAge: number // milliseconds since last scan
  }
}
```

**POST `/api/v1/collection-analytics/value/scan`**
Triggers a progressive value scan. Body can include options:

```typescript
// Request body (optional)
{
  batchSize?: number, // Default: 20, max: 50
  force?: boolean     // Rescan even if cache is fresh
}
```

---

## Backend Service Design

### New Service: `src/backend/services/collectionAnalyticsService.ts`

**Dependencies (injected via constructor):**
- `FileStorage` -- for reading collection cache and storing analytics cache
- `WishlistService` -- for `getMarketplaceStats()` (reuse existing API integration)
- `AuthService` -- for getting Discogs username

```typescript
export class CollectionAnalyticsService {
  constructor(
    fileStorage: FileStorage,
    authService: AuthService,
    wishlistService: WishlistService
  ) {}

  // Non-API analytics (fast, from cached collection data)
  async getCollectionOverview(): Promise<CollectionAnalyticsOverview>
  async getFormatBreakdown(collection: CollectionItem[]): Promise<FormatBreakdown>
  async getLabelDistribution(collection: CollectionItem[]): Promise<LabelDistribution>
  async getDecadeHistogram(collection: CollectionItem[]): Promise<DecadeHistogram>
  async getGrowthTimeline(collection: CollectionItem[], granularity: 'month' | 'year'): Promise<GrowthTimeline>
  async getCollectionSummary(collection: CollectionItem[]): Promise<CollectionSummary>

  // Value estimation (requires API calls, progressive)
  async getValueEstimation(): Promise<CollectionValueEstimation | null>
  async startValueScan(batchSize?: number, force?: boolean): Promise<void>
  async getValueScanStatus(): Promise<ValueScanStatus>

  // Helpers
  private async loadCollection(): Promise<CollectionItem[]>
  private normalizeFormatName(format: string): string
  private normalizeLabelName(label: string): string
}
```

### Format Normalization Logic

The Discogs `format` field is an array of strings like `["Vinyl", "LP", "Album"]`, `["Vinyl", "7\"", "Single", "45 RPM"]`, `["Vinyl", "LP", "Album", "Box Set"]`. We need to extract the **physical format** (LP, 7", 12", 10", Box Set) separately from the **media type** (Vinyl, CD, Cassette) and **release type** (Album, Single, Compilation).

```typescript
// Physical format categories
const FORMAT_CATEGORIES: Record<string, string> = {
  'LP': 'LP (12")',
  '12"': '12" Single/EP',
  '10"': '10"',
  '7"': '7" Single',
  'Box Set': 'Box Set',
  'Flexi-disc': 'Flexi-disc',
  'Shellac': 'Shellac (78rpm)',
  'Picture Disc': 'Picture Disc',
  // Fallbacks
  'Vinyl': 'Vinyl (Other)',
  'CD': 'CD',
  'Cassette': 'Cassette',
  'File': 'Digital',
};
```

### Label Normalization Logic

Labels often have variants: "Warp Records", "Warp Records Ltd.", "Warp". The service should normalize by:
1. Strip common suffixes: "Ltd.", "Inc.", "Records", "Recordings", "Music"
2. Lowercase comparison for grouping
3. Display the most common variant as the canonical name

### Value Scan Algorithm

```typescript
async startValueScan(batchSize: number = 20, force: boolean = false): Promise<void> {
  const collection = await this.loadCollection();
  const existingCache = await this.loadValueCache();

  // Filter to items needing fresh data
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const itemsToScan = collection.filter(item => {
    if (force) return true;
    const cached = existingCache?.items[item.release.id];
    return !cached || cached.fetchedAt < sevenDaysAgo;
  });

  // Process in batches with rate limiting
  for (let i = 0; i < itemsToScan.length; i += batchSize) {
    const batch = itemsToScan.slice(i, i + batchSize);
    for (const item of batch) {
      const stats = await this.wishlistService.getMarketplaceStats(item.release.id);
      if (stats) {
        await this.cacheItemValue(item.release.id, stats);
      }
      // Update scan progress
      await this.updateScanProgress(i + 1, itemsToScan.length);
    }
    // Save progress after each batch (resumable)
    await this.saveValueCache();
  }
}
```

---

## Data Model / Type Changes

### New Types in `src/shared/types.ts`

```typescript
// ============================================
// Collection Analytics Types (Feature 13)
// ============================================

/**
 * Summary stats for the collection
 */
export interface CollectionSummary {
  totalItems: number;
  totalArtists: number;
  totalLabels: number;
  oldestRelease: { year: number; artist: string; title: string } | null;
  newestRelease: { year: number; artist: string; title: string } | null;
  oldestAddition: { date: string; artist: string; title: string } | null;
  newestAddition: { date: string; artist: string; title: string } | null;
  averageReleaseYear: number | null;
  ratedCount: number;
  averageRating: number | null;
}

/**
 * Format breakdown (LP, 7", 12", etc.)
 */
export interface FormatBreakdown {
  categories: FormatCategory[];
  totalItems: number;
}

export interface FormatCategory {
  name: string;           // e.g., "LP (12\")"
  count: number;
  percentage: number;     // 0-100
  examples: { artist: string; title: string; coverImage?: string }[];  // Up to 3 examples
}

/**
 * Label distribution (top labels in collection)
 */
export interface LabelDistribution {
  labels: LabelCount[];
  totalLabels: number;    // Total unique labels
  totalItems: number;
}

export interface LabelCount {
  name: string;           // Canonical label name
  count: number;
  percentage: number;     // 0-100
  variants: string[];     // Original label name variants found
}

/**
 * Decade/year histogram
 */
export interface DecadeHistogram {
  decades: DecadeBucket[];
  years: YearBucket[];
  unknownYearCount: number;  // Items with no year data
}

export interface DecadeBucket {
  decade: string;         // e.g., "1970s", "2000s"
  startYear: number;      // e.g., 1970, 2000
  count: number;
  percentage: number;     // 0-100
}

export interface YearBucket {
  year: number;
  count: number;
}

/**
 * Collection growth over time
 */
export interface GrowthTimeline {
  dataPoints: GrowthDataPoint[];
  granularity: 'month' | 'year';
  totalAdded: number;
}

export interface GrowthDataPoint {
  period: string;         // "2024-01" for month, "2024" for year
  added: number;          // Items added in this period
  cumulative: number;     // Running total at end of period
}

/**
 * Collection value estimation
 */
export interface CollectionValueEstimation {
  totalEstimatedValue: number;        // Sum of median prices
  totalLowestValue: number;           // Sum of lowest prices
  totalHighestValue: number;          // Sum of highest condition prices
  currency: string;                   // Primary currency
  itemsWithPricing: number;           // How many items have price data
  itemsWithoutPricing: number;        // Items with no marketplace data
  totalItems: number;
  averageItemValue: number;           // totalEstimatedValue / itemsWithPricing
  mostValuableItems: CollectionValueItem[];  // Top 10 by value
  leastValuableItems: CollectionValueItem[]; // Bottom 10 by value
  valueByDecade: { decade: string; value: number; count: number }[];
  valueByFormat: { format: string; value: number; count: number }[];
}

export interface CollectionValueItem {
  releaseId: number;
  artist: string;
  title: string;
  year?: number;
  format: string[];
  coverImage?: string;
  estimatedValue: number;       // Median/VG+ price
  lowestPrice?: number;
  highestPrice?: number;
  numForSale: number;
  currency: string;
}

/**
 * Value scan progress tracking
 */
export interface ValueScanStatus {
  status: 'idle' | 'scanning' | 'completed' | 'error';
  itemsScanned: number;
  totalItems: number;
  progress: number;               // 0-100
  currentItem?: string;           // "Artist - Title" being scanned
  estimatedTimeRemaining?: number; // Seconds
  error?: string;
  lastScanTimestamp?: number;
}

/**
 * Cached value data per release
 */
export interface CachedReleaseValue {
  releaseId: number;
  lowestPrice?: number;
  medianPrice?: number;
  highestPrice?: number;
  numForSale: number;
  currency: string;
  fetchedAt: number;              // Unix timestamp ms
}

/**
 * Versioned store for collection analytics value cache
 */
export interface CollectionValueCacheStore extends VersionedStore {
  schemaVersion: 1;
  lastUpdated: number;
  items: Record<number, CachedReleaseValue>;  // releaseId -> cached value
}

/**
 * Versioned store for analytics scan status
 */
export interface CollectionValueScanStatusStore extends VersionedStore {
  schemaVersion: 1;
  status: ValueScanStatus;
}

/**
 * Combined analytics overview (returned by /overview endpoint)
 */
export interface CollectionAnalyticsOverview {
  summary: CollectionSummary;
  formats: FormatBreakdown;
  labels: LabelDistribution;
  decades: DecadeHistogram;
  growth: GrowthTimeline;
}
```

---

## Frontend Visualization Specs

### Page Structure

Collection Analytics will be accessible as a dedicated page under the Library navigation group (alongside Collection). The page has a **tab-based layout** with the following sections:

```
┌──────────────────────────────────────────────────────────────┐
│ Collection Analytics                                          │
│                                                               │
│ [Overview] [Value] [Formats] [Labels] [Timeline]              │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  (Tab content area)                                           │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### Overview Tab

```
┌──────────────────────────────────────────────────────────────┐
│ Summary Cards (top row):                                      │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│ │ 487      │ │ 142      │ │ 67       │ │ 1978     │          │
│ │ Records  │ │ Artists  │ │ Labels   │ │ Avg Year │          │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
│                                                               │
│ ┌─────────────────────────┐ ┌─────────────────────────┐       │
│ │ Format Breakdown        │ │ Top Labels              │       │
│ │ (Donut chart)           │ │ (Horizontal bar chart)  │       │
│ │                         │ │                         │       │
│ │  LP 62%                 │ │ Warp Records    ████ 23 │       │
│ │  7" 18%                 │ │ Sub Pop         ███  17 │       │
│ │  12" 11%                │ │ 4AD             ██   12 │       │
│ │  Box Set 5%             │ │ Merge           ██   10 │       │
│ │  Other 4%               │ │ Domino          █    8  │       │
│ └─────────────────────────┘ └─────────────────────────┘       │
│                                                               │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ Decade Distribution (Bar chart)                           │ │
│ │                                                           │ │
│ │     ██                                                    │ │
│ │     ██  ██                                                │ │
│ │ ██  ██  ██  ██                                            │ │
│ │ ██  ██  ██  ██  ██                                        │ │
│ │ 60s 70s 80s 90s 00s 10s 20s                               │ │
│ └───────────────────────────────────────────────────────────┘ │
│                                                               │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ Collection Growth (Area chart)                            │ │
│ │          Granularity: [Monthly] [Yearly]                  │ │
│ │ 500 ─                              ╱──                    │ │
│ │ 400 ─                         ╱───╱                       │ │
│ │ 300 ─                    ╱───╱                            │ │
│ │ 200 ─              ╱────╱                                 │ │
│ │ 100 ─         ╱───╱                                       │ │
│ │   0 ─────────╱                                            │ │
│ │     2019  2020  2021  2022  2023  2024  2025              │ │
│ └───────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### Value Tab

```
┌──────────────────────────────────────────────────────────────┐
│ Collection Value Estimation                                   │
│                                                               │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│ │ $12,450  │ │ $8,230   │ │ $18,670  │ │ 412/487  │          │
│ │ Estimated│ │ Low      │ │ High     │ │ Priced   │          │
│ │ (VG+)    │ │ (Floor)  │ │ (Mint)   │ │ Items    │          │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
│                                                               │
│ ┌───────────────────────────────────────────────────────────┐ │
│ │ Most Valuable Records                                     │ │
│ │ [cover] Miles Davis - Kind of Blue (1959 LP)   $245 VG+  │ │
│ │ [cover] Radiohead - Kid A (2000 LP)            $180 VG+  │ │
│ │ [cover] Pink Floyd - DSOTM (1973 LP)           $155 VG+  │ │
│ │ ...                                                       │ │
│ └───────────────────────────────────────────────────────────┘ │
│                                                               │
│ ┌──────────────────────┐ ┌──────────────────────┐             │
│ │ Value by Decade      │ │ Value by Format      │             │
│ │ (Bar chart)          │ │ (Horizontal bars)    │             │
│ └──────────────────────┘ └──────────────────────┘             │
│                                                               │
│ [Scan Collection Value]  Last scanned: 3 days ago             │
│ Scanning: 45/487 items... [████████░░░░░░░] 9%               │
│ Estimated time remaining: ~14 minutes                        │
└──────────────────────────────────────────────────────────────┘
```

**Scan Progress Polling:** Reuse the existing `useJobPoller` hook pattern for scan progress polling (poll every 3 seconds while scan is active). Show estimated time remaining based on items scanned so far and elapsed time.

**Idempotency:** Reject concurrent scan requests. If a scan is already in progress, `POST /value/scan` returns the current scan status instead of starting a new scan. This prevents duplicate concurrent scans caused by double-clicks or multiple tabs.

### Chart Components

| Component | Chart Type | Library | Data Source |
|-----------|-----------|---------|-------------|
| `FormatDonutChart` | Donut/Pie chart | recharts `PieChart` | `FormatBreakdown.categories` |
| `LabelBarChart` | Horizontal bar chart | recharts `BarChart` (horizontal) | `LabelDistribution.labels` (top 15) |
| `DecadeBarChart` | Vertical bar chart | recharts `BarChart` | `DecadeHistogram.decades` |
| `YearHistogram` | Vertical bar chart | recharts `BarChart` | `DecadeHistogram.years` (toggle) |
| `GrowthAreaChart` | Area chart | recharts `AreaChart` | `GrowthTimeline.dataPoints` |
| `ValueByDecadeChart` | Bar chart | recharts `BarChart` | `CollectionValueEstimation.valueByDecade` |
| `ValueByFormatChart` | Horizontal bar chart | recharts `BarChart` | `CollectionValueEstimation.valueByFormat` |
| `ValueItemList` | List with cover art | Custom (no chart lib) | `CollectionValueEstimation.mostValuableItems` |

### Component Hierarchy (Consolidated)

Per review feedback, the component hierarchy is consolidated from 17 separate files down to 6. Individual chart components (FormatDonutChart, LabelBarChart, etc.) are inline in their section components since they are simple recharts wrappers, not reusable components.

Existing UI components to reuse: `Badge`, `EmptyState`, `Skeleton` (for loading states), `ProgressBar` (for value scan progress).

```
CollectionAnalyticsPage.tsx          -- Main page with tab navigation
├── AnalyticsOverviewSection.tsx     -- Combines format donut, label bar, decade bar, growth area charts in one component
├── ValueEstimationSection.tsx       -- Combines value cards, scan progress (using useJobPoller pattern), most valuable list, value-by-decade/format charts
├── FormatDetailSection.tsx          -- Detailed format breakdown (donut + list)
├── LabelDetailSection.tsx           -- Detailed label list
└── TimelineDetailSection.tsx        -- Growth area + decade bar + year histogram detailed views
```

**Note:** Tab navigation is handled inline in `CollectionAnalyticsPage.tsx` (no separate tabs component needed). Each section component renders its own charts inline rather than importing separate chart files.

---

## Implementation Phases

### Phase 1: Core Analytics Service & Types (No API Calls)

**Goal:** Compute format breakdown, label distribution, decade histogram, growth timeline, and summary from existing cached collection data.

**Done Criteria:** All five `/api/v1/collection-analytics/` non-value endpoints return correct data for a test collection; format normalization handles edge cases; label normalization groups variants.

**Files to create:**
- `src/backend/services/collectionAnalyticsService.ts`
- `src/backend/routes/collectionAnalytics.ts`

**Files to modify:**
- `src/shared/types.ts` -- Add all Collection Analytics types
- `src/server.ts` -- Register new route and service
- `src/backend/services/migrationService.ts` -- Register new data files

**Work:**
1. Define all types in `shared/types.ts`
2. Implement `CollectionAnalyticsService` with format breakdown, label distribution, decade histogram, growth timeline, and summary methods
3. Create route file with `/overview`, `/formats`, `/labels`, `/decades`, `/growth` endpoints
4. Mount route at `/api/v1/collection-analytics` in `server.ts`
5. Add frontend API client methods to `src/renderer/services/statsApi.ts` (consistent with existing convention: all stats/analytics-related calls go in `statsApi.ts`, not `api.ts`)

### Phase 2: Collection Value Estimation

**Goal:** Progressive marketplace stats fetching with scan progress UI.

**Done Criteria:** Value scan runs progressively with correct progress reporting; scan is resumable after interruption; concurrent scan requests are rejected (idempotent); cached values aggregate correctly into totals.

**Files to create:**
- `Data files: collection-analytics/value-cache.json`, `collection-analytics/scan-status.json`

**Files to modify:**
- `src/backend/services/collectionAnalyticsService.ts` -- Add value scan methods
- `src/backend/routes/collectionAnalytics.ts` -- Add `/value`, `/value/scan`, `/value/scan/status` endpoints
- `src/backend/services/migrationService.ts` -- Register value cache and scan status files

**Work:**
1. Implement `startValueScan()` with batch processing and rate limiting
2. Implement `getValueEstimation()` to aggregate cached per-item values
3. Implement `getValueScanStatus()` for progress tracking
4. Add scan progress endpoint for frontend polling
5. Reuse `WishlistService.getMarketplaceStats()` for actual API calls

### Phase 3: Frontend - Overview & Page Shell

**Goal:** Display format breakdown, label distribution, decade histogram, growth timeline using recharts. All charts rendered inline (not separate component files).

**Done Criteria:** Collection Analytics page renders with tab navigation; Overview section shows summary cards, format donut, label bars, decade bars, and growth area chart; empty collection shows `EmptyState` component; loading shows `Skeleton` components.

**Files to create:**
- `src/renderer/pages/CollectionAnalyticsPage.tsx` -- Main page with tab navigation
- `src/renderer/components/collection-analytics/AnalyticsOverviewSection.tsx` -- Overview charts (inline recharts)

**Files to modify:**
- `src/renderer/styles.css` -- Add CSS classes for analytics components
- `src/renderer/App.tsx` -- Add route for `#collection-analytics`
- Sidebar navigation -- Add "Collection Analytics" under Library group

### Phase 4: Frontend - Value Estimation Section

**Goal:** Display value estimation with scan trigger/progress and most valuable items list. Reuse `useJobPoller` pattern for scan progress polling and existing `ProgressBar` component.

**Done Criteria:** Value section shows "Start Scan" when no data; progress bar with time estimate during scan; value cards and most valuable list when scan complete; scan button disabled while scan is in progress (idempotency).

**Files to create:**
- `src/renderer/components/collection-analytics/ValueEstimationSection.tsx` -- All value UI in one component (value cards, scan progress, most valuable list, value-by-decade/format charts inline)

### Phase 5: Frontend - Detail Sections (Formats, Labels, Timeline)

**Goal:** Detailed breakdowns with full lists and secondary charts. Charts rendered inline in section components.

**Done Criteria:** Formats tab shows detailed format list with examples; Labels tab shows full label list with variant counts; Timeline tab shows growth and decade detail with year-level histogram toggle.

**Files to create:**
- `src/renderer/components/collection-analytics/FormatDetailSection.tsx` -- Detailed format breakdown
- `src/renderer/components/collection-analytics/LabelDetailSection.tsx` -- Detailed label list
- `src/renderer/components/collection-analytics/TimelineDetailSection.tsx` -- Growth + decade + year histogram

---

## Rate Limiting / Performance Considerations

### Value Scan Rate Limiting

- **Discogs rate limit:** 60 requests/minute (shared across all Discogs operations)
- **Two API calls per release:** `/marketplace/stats/{id}` + `/marketplace/price_suggestions/{id}`
- **Effective throughput:** ~30 releases/minute (accounting for 2 calls each)
- **500-item collection:** ~17 minutes full scan
- **Mitigation strategies:**
  1. Progressive batching: Process 20 items per batch, save after each batch
  2. Resumable: Store `lastScannedIndex` so scans survive app restarts
  3. Cache-aware: Skip items with fresh cache (<7 days old)
  4. Background operation: Scan runs asynchronously, frontend polls for progress
  5. Reuse existing Axios interceptor rate limiting from `getDiscogsAxios()`

### Non-Value Analytics Performance

- Format, label, decade, and growth calculations are **purely in-memory** from cached collection data
- A 1000-item collection processes in <100ms (simple array iteration)
- These results can be cached for 1 hour (collection data changes rarely)
- No API calls required for these analytics

### Frontend Performance

- Use `React.memo` for chart components to prevent unnecessary re-renders
- Lazy-load the Value tab (defer marketplace data fetch until user clicks the tab)
- Poll scan progress every 3 seconds during active scan
- Use `useMemo` for chart data transformations

---

## File Changes Summary

### New Files (Consolidated -- 8 files instead of 17)

| File | Purpose |
|------|---------|
| `src/backend/services/collectionAnalyticsService.ts` | Core analytics computation service |
| `src/backend/routes/collectionAnalytics.ts` | API route handlers |
| `src/renderer/pages/CollectionAnalyticsPage.tsx` | Main page component with tab navigation |
| `src/renderer/components/collection-analytics/AnalyticsOverviewSection.tsx` | Overview: format donut, label bar, decade bar, growth area charts (inline) |
| `src/renderer/components/collection-analytics/ValueEstimationSection.tsx` | Value: value cards, scan progress (reuses `useJobPoller` pattern), most valuable list, value charts (inline) |
| `src/renderer/components/collection-analytics/FormatDetailSection.tsx` | Detailed format breakdown with donut chart and list |
| `src/renderer/components/collection-analytics/LabelDetailSection.tsx` | Detailed label list with bar chart |
| `src/renderer/components/collection-analytics/TimelineDetailSection.tsx` | Growth area, decade bar, year histogram detailed views |

**Note:** Individual chart components (FormatDonutChart, LabelBarChart, etc.) are rendered inline within their section components rather than as separate files. They are simple recharts wrappers that don't warrant standalone files. Existing UI components reused: `Badge`, `EmptyState`, `Skeleton`, `ProgressBar`.

### Modified Files

| File | Changes |
|------|---------|
| `src/shared/types.ts` | Add ~15 new interfaces for collection analytics |
| `src/server.ts` | Import and mount `collectionAnalytics` route, instantiate service |
| `src/backend/services/migrationService.ts` | Register 2 new data files |
| `src/renderer/services/statsApi.ts` | Add collection analytics API methods (all stats-related calls go in `statsApi.ts`, not `api.ts`) |
| `src/renderer/styles.css` | Add CSS classes for analytics components |
| `src/renderer/App.tsx` | Add `#collection-analytics` route |
| Sidebar component | Add "Collection Analytics" nav item |

### Data Files Created

| File | Purpose | Backup? |
|------|---------|---------|
| `collection-analytics/value-cache.json` | Per-release marketplace price cache | No (cache, regenerable) |
| `collection-analytics/scan-status.json` | Value scan progress tracking | No (ephemeral state) |

---

## Decisions Table

| # | Decision | Alternatives Considered | Rationale |
|---|----------|------------------------|-----------|
| 1 | Reuse `WishlistService.getMarketplaceStats()` for value estimation | Create dedicated marketplace service | DRY; existing method already handles OAuth, rate limiting, and error recovery |
| 2 | 7-day cache TTL for marketplace prices | 24h (like wishlist prices), 30d | Balance between freshness and API load; collection items change value slowly |
| 3 | Progressive batch scan (20 items/batch) | Full collection scan at once | Rate limiting makes full scan take 15+ minutes; batching with progress is better UX |
| 4 | Store format as category string, not parsed object | Full format decomposition | Simpler; users care about "LP" vs "7\"" not detailed format metadata |
| 5 | Label normalization strips common suffixes | Exact string matching | "Warp Records Ltd." and "Warp Records" are the same label to users |
| 6 | New page under Library group (not tab on Collection) | Tab on CollectionPage | Collection page is already complex with filters, grid, single-view; analytics deserves its own space |
| 7 | Non-value analytics computed on-the-fly (not cached) | Cache all analytics | Computation is <100ms from in-memory collection data; caching adds complexity for no gain |
| 8 | Value scan is user-triggered (not automatic) | Auto-scan on startup | Value scan is expensive (API calls); user should control when to spend API quota |
| 9 | Use VG+ price as "estimated value" | Use median, lowest, or NM | VG+ is the most common condition for used vinyl; represents realistic collection value |
| 10 | Display all currencies as-is from Discogs | Convert to single currency | Currency conversion adds complexity and requires exchange rate API; Discogs already normalizes to seller's preferred currency |

---

## Test Checklist

### Backend Unit Tests

- [ ] `CollectionAnalyticsService.getFormatBreakdown()` correctly categorizes format arrays
- [ ] `CollectionAnalyticsService.getFormatBreakdown()` handles empty/null format arrays
- [ ] `CollectionAnalyticsService.getLabelDistribution()` normalizes label variants
- [ ] `CollectionAnalyticsService.getLabelDistribution()` handles empty/null label arrays
- [ ] `CollectionAnalyticsService.getDecadeHistogram()` groups by decade correctly
- [ ] `CollectionAnalyticsService.getDecadeHistogram()` handles null/0/undefined years
- [ ] `CollectionAnalyticsService.getGrowthTimeline()` calculates monthly cumulative correctly
- [ ] `CollectionAnalyticsService.getGrowthTimeline()` calculates yearly cumulative correctly
- [ ] `CollectionAnalyticsService.getCollectionSummary()` returns correct totals
- [ ] `CollectionAnalyticsService.getValueEstimation()` aggregates cached values correctly
- [ ] `CollectionAnalyticsService.startValueScan()` processes batches with progress tracking
- [ ] `CollectionAnalyticsService.startValueScan()` skips items with fresh cache
- [ ] `CollectionAnalyticsService.startValueScan()` handles marketplace stats returning null
- [ ] Format normalization handles edge cases: "Vinyl" only, empty array, unknown formats
- [ ] Label normalization handles edge cases: "Not On Label", empty array, very long names

### Backend Route Tests

- [ ] `GET /api/v1/collection-analytics/overview` returns 200 with all sections
- [ ] `GET /api/v1/collection-analytics/overview` returns 401 when not authenticated
- [ ] `GET /api/v1/collection-analytics/value` returns cached value or null
- [ ] `POST /api/v1/collection-analytics/value/scan` triggers scan and returns 202
- [ ] `GET /api/v1/collection-analytics/value/scan/status` returns progress
- [ ] `GET /api/v1/collection-analytics/formats` returns format breakdown
- [ ] `GET /api/v1/collection-analytics/labels` returns label distribution
- [ ] `GET /api/v1/collection-analytics/decades` returns decade histogram
- [ ] `GET /api/v1/collection-analytics/growth?granularity=month` returns monthly growth
- [ ] `GET /api/v1/collection-analytics/growth?granularity=year` returns yearly growth

### Frontend Component Tests

- [ ] `CollectionAnalyticsPage` renders tab navigation
- [ ] `OverviewTab` renders summary cards and all charts
- [ ] `ValueTab` shows "Start Scan" when no data available
- [ ] `ValueTab` shows progress bar during active scan
- [ ] `ValueTab` shows value cards and most valuable list when data available
- [ ] `FormatDonutChart` renders correct segments from data
- [ ] `LabelBarChart` renders correct bars from data
- [ ] `DecadeBarChart` renders correct bars from data
- [ ] `GrowthAreaChart` renders area chart with cumulative line

---

## Edge Cases Table

| # | Edge Case | Handling |
|---|-----------|----------|
| 1 | Collection is empty (0 items) | Show EmptyState component: "Add records to your Discogs collection to see analytics" |
| 2 | All items have format `["Vinyl"]` with no specific format | Group under "Vinyl (Other)" category |
| 3 | Item has no year data (year is 0 or undefined) | Exclude from decade/year histogram; count in "Unknown Year" bucket |
| 4 | Item has no labels (empty array) | Exclude from label distribution; don't count as "No Label" |
| 5 | Label is "Not On Label" (self-released) | Treat as a distinct label; common in Discogs data |
| 6 | Marketplace returns no pricing for a release | Mark as "No pricing available"; exclude from value totals |
| 7 | Marketplace returns pricing in different currencies | Store per-item currency; show mixed currency warning if >1 currency present |
| 8 | Value scan interrupted (app closed mid-scan) | Scan is resumable; progress is saved after each batch; resume from `lastScannedIndex` |
| 9 | Collection has >2000 items | Value scan shows realistic time estimate; non-value analytics still fast (<100ms) |
| 10 | Two releases on same label but different name variants | Label normalization groups them; display canonical name with variant count tooltip |
| 11 | User has no Discogs authentication | Show auth prompt (consistent with other Discogs-dependent pages) |
| 12 | Collection cache is expired or missing | Show "Loading collection..." state; trigger cache refresh |
| 13 | Duplicate releases (same album, different pressings) | Count each copy separately in all analytics (matches Discogs collection behavior) |
| 14 | `date_added` has invalid format | Parse safely with `new Date()`; exclude from growth timeline if invalid |
| 15 | Release format array includes both "Vinyl" and "CD" (multi-format release) | Categorize by primary physical format (first non-"Vinyl" entry); if ambiguous, count under most specific format found |
| 16 | Concurrent value scan requests (double-click, multiple tabs) | Reject with current scan status; `POST /value/scan` returns 409 with `scanStatus` if a scan is already running; frontend disables scan button while `status === 'scanning'` |
