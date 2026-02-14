# Feature 14: Listening Pattern Visualizations - Implementation Plan

## Overview

Feature 14 adds deeper listening pattern analysis and visualization capabilities to RecordScrobbles. It surfaces temporal patterns (when you listen), genre patterns (what kinds of music you gravitate toward), historical comparisons ("On This Day"), interactive heatmap drill-down, and makes Wrapped accessible to Last.fm-only users (no Discogs required).

### Value Proposition

The Stats Dashboard (Feature 1) answers "what" and "how much" -- top artists, scrobble counts, streaks. Feature 14 answers "when" and "what kind" -- surfacing the rhythms and textures of a user's listening life that raw counts miss. A polar clock showing you're a nocturnal listener, a genre cloud revealing your drift toward ambient music, or seeing that you were listening to the same album exactly two years ago today -- these create moments of self-recognition that keep users engaged.

---

## Data Source Analysis

### Already Available (No New Backend Work)

| Data | Source | Method |
|------|--------|--------|
| Hourly distribution (scrobbles per hour 0-23) | `ScrobbleHistoryStorage` | `getHourlyDistribution()` |
| Day-of-week distribution (scrobbles per day 0-6) | `ScrobbleHistoryStorage` | `getDayOfWeekDistribution()` |
| Time-of-day preference score | `AnalyticsService` | `getTimeOfDayPreference()` |
| Calendar heatmap data | `StatsService` | `getCalendarHeatmap(year)` |
| Full scrobble index with timestamps | `ScrobbleHistoryStorage` | `getIndex()` |
| All albums with play history | `ScrobbleHistoryStorage` | `getAllAlbums()` |
| Top artists/albums/tracks (any period) | `StatsService` | `getTopArtists/Albums/Tracks()` |
| Listening timeline (day/week/month) | `StatsService` | `getListeningTimeline()` |
| Collection items with `date_added` | Discogs collection cache | `loadCollection()` |
| Album/artist images | `ImageService` | `batchGetAlbumCovers()` / `batchGetArtistImages()` |

### Needs New Backend Work

| Data | Source | New Work Required |
|------|--------|-------------------|
| Genre/tag distribution | Last.fm `artist.getTopTags` API | New `getArtistTopTags()` method in `LastFmService`, new `GenreAnalysisService` |
| "On This Day" history | `ScrobbleHistoryStorage` index | New `getOnThisDay()` method in `StatsService` |
| Heatmap day detail (albums played) | `ScrobbleHistoryStorage` index | New `getAlbumsForDate()` method in `StatsService` |
| Wrapped without Discogs | `WrappedService` | Conditional logic to skip collection/cross-source slides |

---

## Chart Type Recommendations

### 1. Hourly Distribution: Polar/Radar Chart

**Recommendation: Polar Area Chart (recharts `RadarChart`)**

```
Rationale:
- Hours of the day are inherently circular (midnight wraps to 1am)
- A bar chart forces a linear reading that obscures the day/night cycle
- Polar charts naturally show clusters (e.g., "evening listener" as a visible bulge)
- recharts RadarChart is already available (recharts is installed)
```

**ASCII Mockup:**
```
         12am
      11     1
   10    .---.   2
         /  *  \
  9   | * * * |   3
       |  * *  |
  8    \ * * /    4
       '-*-'
    7     *   5
          6
  * = listening activity intensity
```

The polar chart encodes 24 hours around a clock face. Each "spoke" represents an hour, and the radius encodes scrobble count. This makes "I'm an evening listener" or "I listen during my commute" immediately visible as shapes, not just numbers.

**Fallback:** If polar rendering proves problematic with recharts, a horizontal bar chart grouped by time-of-day blocks (Morning 6-12, Afternoon 12-18, Evening 18-24, Night 0-6) provides a simpler but less elegant alternative.

### 2. Day-of-Week Distribution: Horizontal Bar Chart

**Recommendation: Horizontal Bar Chart (recharts `BarChart` with `layout="vertical"`)**

```
Rationale:
- 7 items is perfect for a bar chart -- not too many, not too few
- Horizontal bars let day names serve as readable labels
- Easy to spot "weekend warrior" vs "weekday commuter" patterns
- Consistent with the chart vocabulary already in the app
```

**ASCII Mockup:**
```
Day-of-Week Listening

Mon  ████████████        312
Tue  ██████████           280
Wed  █████████████        340
Thu  ██████████           290
Fri  ██████████████████   487
Sat  ████████████████████ 520
Sun  ███████████████████  498
```

### 3. Genre/Tag Cloud: Treemap or Bubble Chart

**Recommendation: Treemap (recharts `Treemap`)**

```
Rationale:
- Genres have a natural "proportion of whole" relationship
- Treemaps excel at showing relative sizes within a fixed space
- More information-dense than a bubble chart
- Labels can be rendered inside each rectangle
- No axis needed -- pure proportional display
```

**ASCII Mockup:**
```
Your Top Genres

┌─────────────────────┬────────────┐
│                     │            │
│    Alternative      │   Indie    │
│      Rock           │   Rock     │
│     (32%)           │   (18%)    │
│                     │            │
├────────────┬────────┼────────────┤
│            │ Post   │ Electronic │
│  Shoegaze  │ Punk   │   (8%)     │
│   (12%)    │ (10%)  │            │
├────────────┴────────┼────┬───────┤
│   Ambient (7%)      │Jazz│ Folk  │
│                     │(5%)│ (4%)  │
└─────────────────────┴────┴───────┘
```

**Alternative:** A horizontal bar chart of top 10 genres is simpler and equally effective if the treemap proves visually noisy. The treemap is recommended for its higher information density and novelty compared to the bar charts elsewhere in the app.

### 4. Calendar Heatmap Click-to-Expand: Modal with Album List

**Recommendation: Click handler on existing `CalendarHeatmap` cells that opens a detail panel**

```
Rationale:
- The CalendarHeatmap component already exists and renders well
- Adding click interactivity extends its value without replacing it
- A slide-out panel or modal avoids navigating away from the heatmap context
- Show album covers for that day to make it visually rich
```

**ASCII Mockup:**
```
Calendar Heatmap
[... existing heatmap grid ...]

User clicks on a cell:
┌────────────────────────────────────────────┐
│ January 15, 2026 - 23 scrobbles           │
│                                            │
│ [cover] Radiohead - OK Computer    8 plays │
│ [cover] Bjork - Homogenic          6 plays │
│ [cover] Portishead - Dummy         5 plays │
│ [cover] Air - Moon Safari          4 plays │
│                                            │
│                              [Close]       │
└────────────────────────────────────────────┘
```

### 5. "On This Day" Section: Card-Based Timeline

**Recommendation: Stacked cards showing listening on this date across years**

```
Rationale:
- Nostalgic, personal, and unique to this user's data
- Simple data structure (filter by month+day across years)
- Cards with album covers provide visual richness
- No chart needed -- this is a content feature, not a data visualization
```

**ASCII Mockup:**
```
On This Day

┌─ February 13, 2025 (1 year ago) ──────────┐
│ 18 scrobbles                                │
│ [cover] Boards of Canada - MHTRTC   7 plays│
│ [cover] Aphex Twin - SAW II         6 plays│
│ [cover] Autechre - Tri Repetae      5 plays│
└─────────────────────────────────────────────┘

┌─ February 13, 2024 (2 years ago) ──────────┐
│ 12 scrobbles                                │
│ [cover] My Bloody Valentine - Loveless  8   │
│ [cover] Slowdive - Souvlaki            4   │
└─────────────────────────────────────────────┘

┌─ February 13, 2023 (3 years ago) ──────────┐
│ No listening data for this date             │
└─────────────────────────────────────────────┘
```

---

## Color Palette & Visual Style

All visualizations use existing CSS custom properties to maintain consistency with both light and dark themes.

### Chart Colors

| Usage | Variable | Dark Mode Value | Light Mode Value |
|-------|----------|----------------|-----------------|
| Primary chart fill | `--accent-color` | `#1db954` (green) | `#1db954` |
| Chart gradient start | `--accent-color` at 30% opacity | `rgba(29,185,84,0.3)` | `rgba(29,185,84,0.3)` |
| Chart axis text | `--text-secondary` | `#b0b0b0` | `#666666` |
| Chart grid lines | `--border-color` | `#404040` | `#e0e0e0` |
| Tooltip background | `--card-bg` | `#252525` | `#ffffff` |
| Tooltip border | `--border-color` | `#404040` | `#e0e0e0` |

### Genre Treemap Palette

For the genre treemap, use a multi-color palette that works in both themes. Avoid relying on a single accent color for all segments.

```css
/* New CSS custom properties for chart multi-color palette */
--chart-color-1: #1db954;  /* green - primary accent */
--chart-color-2: #1e90ff;  /* blue */
--chart-color-3: #ff6b6b;  /* red/coral */
--chart-color-4: #ffd43b;  /* yellow */
--chart-color-5: #a855f7;  /* purple */
--chart-color-6: #14b8a6;  /* teal */
--chart-color-7: #f97316;  /* orange */
--chart-color-8: #ec4899;  /* pink */
--chart-color-9: #64748b;  /* slate */
--chart-color-10: #84cc16; /* lime */
```

These colors have been chosen to be distinguishable from each other on both dark (`#1a1a1a`) and light (`#f5f5f5`) backgrounds, and to remain readable when text is overlaid (white text on dark mode, dark text on light mode).

### Polar Chart Style

The polar chart uses a filled area with the accent gradient:
- Fill: `--accent-color` at 20% opacity
- Stroke: `--accent-color` at full opacity
- Grid rings: `--border-color`
- Hour labels: `--text-secondary`

### Day Detail Panel Style

When clicking a heatmap cell:
- Panel background: `--card-bg`
- Border: `1px solid var(--border-color)`
- Shadow: `var(--card-shadow)`
- Album covers: 50px with 4px border-radius (matching existing TopList style)

---

## Detailed UI Design

### Stats Page Integration

Feature 14 components are added to the existing `StatsPage.tsx` as new sections, placed after the existing Listening Timeline section and before the existing Top Lists section. This keeps all listening pattern visualizations grouped together.

**Updated Stats Page Layout:**
```
┌─────────────────────────────────────────────────────┐
│ Stats Dashboard                                      │
├─────────────────────────────────────────────────────┤
│ [Existing] Overview Cards (streak, counts, etc.)     │
│ [Existing] Calendar Heatmap  ← NOW CLICKABLE        │
│ [Existing] Listening Timeline                        │
│                                                      │
│ ── NEW: Listening Patterns ──────────────────────── │
│                                                      │
│ ┌──────────────────────┬─────────────────────────┐  │
│ │ When You Listen       │ Weekly Rhythm            │  │
│ │ [Polar Hour Chart]    │ [Day-of-Week Bars]       │  │
│ │                       │                          │  │
│ │ "You're an evening    │ "Fridays and weekends    │  │
│ │  listener. Peak at    │  are your biggest        │  │
│ │  9 PM."               │  listening days."        │  │
│ └──────────────────────┘─────────────────────────┘  │
│                                                      │
│ ┌───────────────────────────────────────────────────┐│
│ │ Your Music DNA                                    ││
│ │ [Genre Treemap]                                   ││
│ │                                                   ││
│ │ Based on your top 50 artists' tags on Last.fm     ││
│ └───────────────────────────────────────────────────┘│
│                                                      │
│ ┌───────────────────────────────────────────────────┐│
│ │ On This Day                                       ││
│ │ [Card stack for 1/2/3 years ago]                  ││
│ └───────────────────────────────────────────────────┘│
│                                                      │
│ [Existing] Top Artists / Top Albums / Top Tracks      │
│ [Existing] Source Breakdown                           │
│ [Existing] Collection Coverage                        │
│ [Existing] Dusty Corners                              │
│ [Existing] Milestones                                 │
└─────────────────────────────────────────────────────┘
```

### Heatmap Day Detail (Click-to-Expand)

The existing `CalendarHeatmap` component gains click interactivity. Clicking a cell with scrobbles > 0 opens a detail panel showing albums played that day.

**Implementation: Inline expansion below the heatmap** (not a modal -- keeps context visible)

```
Calendar Heatmap
[... grid with one cell highlighted ...]

▼ January 15, 2026

┌───────────────────────────────────────────────────┐
│ 23 scrobbles across 4 albums                      │
│                                                   │
│ [cover] Radiohead - OK Computer          8 plays  │
│ [cover] Bjork - Homogenic                6 plays  │
│ [cover] Portishead - Dummy               5 plays  │
│ [cover] Air - Moon Safari                4 plays  │
│                                                   │
│                                    [Close ×]      │
└───────────────────────────────────────────────────┘
```

Clicking another cell replaces the current detail. Clicking the same cell or "Close" hides the detail.

---

## API Design

### New Endpoints

#### 1. `GET /api/v1/stats/hourly-distribution`

Returns scrobbles aggregated by hour of day (0-23).

**Response:**
```json
{
  "success": true,
  "data": {
    "distribution": [
      { "hour": 0, "count": 145 },
      { "hour": 1, "count": 87 },
      ...
      { "hour": 23, "count": 203 }
    ],
    "peakHour": 21,
    "totalScrobbles": 15420,
    "insight": "evening"
  }
}
```

The `insight` field is one of `"morning"` (6-12 peak), `"afternoon"` (12-18), `"evening"` (18-24), or `"night"` (0-6), based on which block has the highest aggregate count.

#### 2. `GET /api/v1/stats/day-of-week-distribution`

Returns scrobbles aggregated by day of week (0=Sunday through 6=Saturday).

**Response:**
```json
{
  "success": true,
  "data": {
    "distribution": [
      { "day": 0, "dayName": "Sunday", "count": 2340 },
      { "day": 1, "dayName": "Monday", "count": 1890 },
      ...
      { "day": 6, "dayName": "Saturday", "count": 2510 }
    ],
    "peakDay": 6,
    "weekdayAvg": 2010,
    "weekendAvg": 2425,
    "insight": "weekend"
  }
}
```

The `insight` field is `"weekend"` if weekend average > weekday average, else `"weekday"`.

#### 3. `GET /api/v1/stats/genres`

Returns genre distribution based on Last.fm artist tags for the user's top artists.

**Query params:**
- `limit` (optional, default 50): Number of top artists to analyze
- `maxTags` (optional, default 10): Number of genre results to return

**Response:**
```json
{
  "success": true,
  "data": {
    "genres": [
      { "name": "alternative rock", "weight": 0.32, "artistCount": 18 },
      { "name": "indie rock", "weight": 0.18, "artistCount": 12 },
      { "name": "electronic", "weight": 0.08, "artistCount": 6 },
      ...
    ],
    "totalArtistsAnalyzed": 50,
    "lastUpdated": 1707849600000
  }
}
```

Genre weights are normalized (sum to 1.0). Each genre's weight is the sum of (artist play count * tag weight) across all artists having that tag, then normalized.

#### 4. `GET /api/v1/stats/on-this-day`

Returns listening history for today's date across previous years.

**Query params:**
- `month` (optional, default: current month, 1-12)
- `day` (optional, default: current day, 1-31)

**Response:**
```json
{
  "success": true,
  "data": {
    "date": { "month": 2, "day": 13 },
    "years": [
      {
        "year": 2025,
        "yearsAgo": 1,
        "totalScrobbles": 18,
        "albums": [
          { "artist": "Boards of Canada", "album": "MHTRTC", "playCount": 7, "coverUrl": null },
          { "artist": "Aphex Twin", "album": "SAW II", "playCount": 6, "coverUrl": null }
        ]
      },
      {
        "year": 2024,
        "yearsAgo": 2,
        "totalScrobbles": 12,
        "albums": [...]
      }
    ]
  }
}
```

Only includes years where data exists. Images enriched via `ImageService`.

#### 5. `GET /api/v1/stats/heatmap/:date`

Returns albums played on a specific date for heatmap drill-down.

**Path params:**
- `date`: `YYYY-MM-DD` format

**Response:**
```json
{
  "success": true,
  "data": {
    "date": "2026-01-15",
    "totalScrobbles": 23,
    "albums": [
      { "artist": "Radiohead", "album": "OK Computer", "playCount": 8, "coverUrl": "https://..." },
      { "artist": "Bjork", "album": "Homogenic", "playCount": 6, "coverUrl": null }
    ]
  }
}
```

---

## Backend Implementation

### Phase 1: New Methods in Existing Services

#### `LastFmService` -- Add `getArtistTopTags()`

**File:** `src/backend/services/lastfmService.ts`

```typescript
async getArtistTopTags(artist: string): Promise<Array<{ name: string; count: number }>> {
  // Calls Last.fm artist.getTopTags API
  // Returns array of { name, count } where count is tag weight (0-100)
  // Rate-limited by existing Axios interceptor
}
```

Last.fm API: `artist.getTopTags` returns tags with a `count` field representing weight (0-100). This is a lightweight call (single GET, no pagination).

#### `StatsService` -- Add new query methods

**File:** `src/backend/services/statsService.ts`

```typescript
// Get hourly distribution with insight
async getHourlyDistributionWithInsight(): Promise<HourlyDistributionResult>

// Get day-of-week distribution with insight
async getDayOfWeekDistributionWithInsight(): Promise<DayOfWeekDistributionResult>

// Get albums played on a specific date
async getAlbumsForDate(dateStr: string): Promise<DateAlbumsResult>

// Get "On This Day" data across years
async getOnThisDay(month: number, day: number): Promise<OnThisDayResult>
```

### Phase 2: New `GenreAnalysisService`

**File:** `src/backend/services/genreAnalysisService.ts`

Computes genre distribution from Last.fm artist tags.

```typescript
export class GenreAnalysisService {
  constructor(
    private lastFmService: LastFmService,
    private historyStorage: ScrobbleHistoryStorage,
    private fileStorage: FileStorage
  ) {}

  // Main method: get genre distribution
  async getGenreDistribution(
    topArtistLimit: number = 50,
    maxGenres: number = 10
  ): Promise<GenreDistributionResult>

  // Internal: fetch and cache tags for an artist
  private async getTagsForArtist(artist: string): Promise<ArtistTag[]>
}
```

**Algorithm:**
1. Get top N artists by play count from `ScrobbleHistoryStorage`
2. For each artist, fetch top tags from Last.fm (cached in `cache/artist-tags.json`)
3. Weight each tag by `(artist play count / total plays) * (tag weight / 100)`
4. Aggregate across all artists, merge similar tags (lowercase, trim)
5. Normalize so weights sum to 1.0
6. Return top M genres

**Caching:**
- Cache file: `cache/artist-tags.json` (maps artist name to tag list)
- Cache duration: 30 days (genre tags rarely change)
- Register in `cleanupService.ts` with 30-day retention
- On first load, batch-fetch tags with 1 req/sec rate limiting (respect Last.fm limits)
- Show a loading/progress state on the frontend while tags are being fetched

**Tag Normalization:**
- Lowercase all tag names
- Merge common variants: "alt rock" -> "alternative rock", "post-rock" -> "post rock"
- Filter out non-genre tags (e.g., "seen live", "favorites", artist names)
- Maintain a small blocklist of non-genre tags

**Tag Quality Filtering:** Filter tags with `count < 20` (out of 100) as they are often noise (e.g., "seen live", "my favorites", "check out"). The existing blocklist should include at least 20 common non-genre tags such as: "seen live", "favorites", "my favorites", "check out", "under 2000 listeners", "beautiful", "awesome", "love", "classic", "albums i own", "vinyl", "spotify", "female vocalists", "male vocalists", "british", "american", "canadian", "australian", "90s", "80s".

### Phase 3: Wrapped Without Discogs

**File:** `src/backend/services/wrappedService.ts` (modify)

Currently, the Wrapped page requires both Last.fm AND Discogs authentication (see `Sidebar.tsx` line 126-131). The 14 slides break down as:

| Slide | Data Source | Works Without Discogs? |
|-------|-----------|----------------------|
| 1. Total Scrobbles | Last.fm | Yes |
| 2. Top Artists | Last.fm + ImageService | Yes |
| 3. Top Albums | Last.fm + ImageService | Yes |
| 4. Top Tracks | Last.fm | Yes |
| 5. Unique Counts | Last.fm | Yes |
| 6. New Artists | Last.fm | Yes |
| 7. Peak Day | Last.fm | Yes |
| 8. Peak Hour | Last.fm | Yes |
| 9. Streak | Last.fm | Yes |
| 10. Heatmap | Last.fm | Yes |
| 11. Records Added | Discogs | NO - skip |
| 12. Most-Played Addition | Discogs + Last.fm | NO - skip |
| 13. Collection Coverage | Discogs + Last.fm | NO - skip |
| 14. Vinyl vs Digital | Session files | NO - skip (needs session file matching) |

**10 of 14 slides** work with Last.fm only. The fix:

1. **Backend:** `WrappedService.generateWrapped()` already handles missing collection gracefully (returns `recordsAdded: 0`, `mostPlayedNewAddition: null`, `collectionCoverage: 0`). No backend changes needed.

2. **Frontend:** `WrappedSlideshow.tsx` -- filter out slides that have no meaningful data:
   ```typescript
   // Skip collection slides if no collection data
   if (data.collection.recordsAdded === 0 && data.collection.recordsList.length === 0) {
     // Omit RecordsAddedSlide, MostPlayedAdditionSlide
   }
   if (data.crossSource.totalCollectionSize === 0) {
     // Omit CollectionCoverageSlide, VinylVsDigitalSlide
   }
   ```

3. **Sidebar:** Change Wrapped from requiring `bothReason` to requiring only `lastfmReason`:
   ```typescript
   {
     id: ROUTES.WRAPPED,
     label: 'Wrapped',
     icon: '🎁',
     enabled: authStatus.lastfm.authenticated,  // Changed from both
     disabledReason: lastfmReason,               // Changed from bothReason
   }
   ```

---

## New Type Definitions

**File:** `src/shared/types.ts`

```typescript
// Hourly distribution endpoint
export interface HourlyDistributionData {
  hour: number;       // 0-23
  count: number;
}

export interface HourlyDistributionResult {
  distribution: HourlyDistributionData[];
  peakHour: number;
  totalScrobbles: number;
  insight: 'morning' | 'afternoon' | 'evening' | 'night';
}

// Day of week distribution endpoint
export interface DayOfWeekDistributionData {
  day: number;        // 0=Sunday through 6=Saturday
  dayName: string;
  count: number;
}

export interface DayOfWeekDistributionResult {
  distribution: DayOfWeekDistributionData[];
  peakDay: number;
  weekdayAvg: number;
  weekendAvg: number;
  insight: 'weekend' | 'weekday';
}

// Genre distribution endpoint
export interface GenreData {
  name: string;
  weight: number;       // 0.0-1.0, normalized
  artistCount: number;  // How many of user's artists have this tag
}

export interface GenreDistributionResult {
  genres: GenreData[];
  totalArtistsAnalyzed: number;
  lastUpdated: number;  // milliseconds
}

// Genre tag cache store
export interface ArtistTagsCacheStore extends VersionedStore {
  tags: Record<string, { tags: Array<{ name: string; count: number }>; fetchedAt: number }>;
}

// On This Day endpoint
export interface OnThisDayYear {
  year: number;
  yearsAgo: number;
  totalScrobbles: number;
  albums: Array<{
    artist: string;
    album: string;
    playCount: number;
    coverUrl: string | null;
  }>;
}

export interface OnThisDayResult {
  date: { month: number; day: number };
  years: OnThisDayYear[];
}

// Heatmap date detail endpoint
export interface DateAlbumsResult {
  date: string;           // YYYY-MM-DD
  totalScrobbles: number;
  albums: Array<{
    artist: string;
    album: string;
    playCount: number;
    coverUrl: string | null;
  }>;
}
```

---

## Frontend Implementation

**Lazy-Loading:** New sections should be lazy-loaded using `React.lazy` or conditional rendering -- only fetch data when the section scrolls into view or when user navigates to that part of StatsPage. This avoids loading all new data on page mount, which would add 4-5 parallel API calls to an already data-heavy page. Use `IntersectionObserver` to trigger data fetching when sections become visible.

**Existing Component Reuse:** Use `Skeleton` for loading states in all new sections. Use `EmptyState` for no-data scenarios (e.g., no scrobble history for "On This Day").

### New Components

All in `src/renderer/components/stats/`:

#### 1. `HourlyPolarChart.tsx`

Renders a polar/radar chart showing scrobbles by hour of day.

```typescript
interface HourlyPolarChartProps {
  data: HourlyDistributionData[];
  peakHour: number;
  insight: string;
  loading?: boolean;
}
```

Uses recharts `RadarChart` with `PolarGrid`, `PolarAngleAxis`, `PolarRadiusAxis`, and `Radar` components. Hour labels formatted as "12am", "3am", "6am", etc. (every 3 hours shown to avoid crowding).

Includes an insight sentence below: "You're an evening listener. Your peak hour is 9 PM."

#### 2. `DayOfWeekChart.tsx`

Renders a horizontal bar chart showing scrobbles by day of week.

```typescript
interface DayOfWeekChartProps {
  data: DayOfWeekDistributionData[];
  peakDay: number;
  weekdayAvg: number;
  weekendAvg: number;
  insight: string;
  loading?: boolean;
}
```

Uses recharts `BarChart` with `layout="vertical"`. Bars colored with `--accent-color`. Peak day bar gets a slightly different shade or a subtle indicator.

Includes insight text: "You're a weekend warrior -- you listen 20% more on weekends."

#### 3. `GenreTreemap.tsx`

Renders a treemap of top genres.

```typescript
interface GenreTreemapProps {
  data: GenreData[];
  loading?: boolean;
  totalArtists: number;
}
```

Uses recharts `Treemap` component. Each cell is colored from the multi-color palette. Cell content shows genre name and percentage. Tooltip on hover shows artist count.

#### 4. `OnThisDay.tsx`

Renders cards showing listening history on today's date across years.

```typescript
interface OnThisDayProps {
  data: OnThisDayResult | null;
  loading?: boolean;
}
```

Renders a stack of year cards. Each card shows total scrobbles and top albums with covers (images fetched via existing `/api/v1/images/album` endpoint). Empty years show "No listening data."

#### 5. `HeatmapDayDetail.tsx`

Renders the expanded detail panel when a heatmap cell is clicked.

```typescript
interface HeatmapDayDetailProps {
  date: string;
  albums: DateAlbumsResult['albums'];
  totalScrobbles: number;
  onClose: () => void;
}
```

Shows album list with covers, play counts, and a close button. Animated slide-down entrance.

### Modified Components

#### `CalendarHeatmap.tsx` -- Add click handler

Add new prop:
```typescript
interface CalendarHeatmapProps {
  data: CalendarHeatmapData[];
  year: number;
  onYearChange?: (year: number) => void;
  onDayClick?: (date: string) => void;  // NEW
  selectedDate?: string;                 // NEW - highlights selected cell
}
```

Cell `div` gets `onClick` handler (only fires when `count > 0`), `cursor: pointer` class, and `role="button"` for accessibility.

#### `StatsPage.tsx` -- Add new sections

Add the new components between the Listening Timeline and Top Lists sections. Each section fetches its own data independently (consistent with existing pattern in StatsPage).

#### `WrappedSlideshow.tsx` -- Filter slides dynamically

The `slides` array filters out Discogs-dependent slides when collection data is empty:

```typescript
const slides = useMemo(() => {
  const slideList: React.ReactNode[] = [
    // Slides 1-10 always included (Last.fm only)
    ...
  ];

  // Only add collection slides if Discogs data is available
  if (data.collection.recordsAdded > 0 || data.collection.recordsList.length > 0) {
    slideList.push(<RecordsAddedSlide ... />);
    if (data.collection.mostPlayedNewAddition) {
      slideList.push(<MostPlayedAdditionSlide ... />);
    }
  }
  if (data.crossSource.totalCollectionSize > 0) {
    slideList.push(<CollectionCoverageSlide ... />);
    slideList.push(<VinylVsDigitalSlide ... />);
  }

  return slideList;
}, [data]);
```

#### `Sidebar.tsx` -- Change Wrapped auth requirement

Change Wrapped from requiring both Discogs + Last.fm to only requiring Last.fm.

---

## Implementation Phases

### Phase 1: Hourly + Day-of-Week Visualizations (Low complexity)

**Done Criteria:** Polar chart renders 24-hour distribution on StatsPage; horizontal bar chart renders 7-day distribution; both show insight text; both lazy-load when scrolled into view.

**Backend:**
- Add `getHourlyDistributionWithInsight()` to `StatsService` (wraps existing `getHourlyDistribution()`)
- Add `getDayOfWeekDistributionWithInsight()` to `StatsService` (wraps existing `getDayOfWeekDistribution()`)
- Add `/api/v1/stats/hourly-distribution` and `/api/v1/stats/day-of-week-distribution` routes

**Frontend:**
- New `HourlyPolarChart.tsx` component
- New `DayOfWeekChart.tsx` component
- Add both to `StatsPage.tsx` in new "Listening Patterns" section
- CSS classes in `styles.css`

**Tests:**
- Route tests for both endpoints
- Component tests for both chart components

### Phase 2: Calendar Heatmap Click-to-Expand (Low complexity)

**Done Criteria:** Clicking a heatmap cell with data shows inline detail panel with album list and covers; clicking same cell or close button hides panel; cells with zero data are not clickable.

**Backend:**
- Add `getAlbumsForDate(dateStr)` to `StatsService`
- Add `/api/v1/stats/heatmap/:date` route
- Enrich albums with cover images via `ImageService`

**Frontend:**
- Modify `CalendarHeatmap.tsx` to accept `onDayClick` prop
- New `HeatmapDayDetail.tsx` component
- Wire up in `StatsPage.tsx`: click fetches date data, renders detail panel
- CSS for detail panel animation

**Tests:**
- Route test for date detail endpoint
- Component tests for click interaction and detail rendering

### Phase 3: "On This Day" Feature (Low-Medium complexity)

**Done Criteria:** "On This Day" section renders on StatsPage with cards for 1/2/3 years ago; cards show album covers and play counts; years with no data show "No listening data" message.

**Backend:**
- Add `getOnThisDay(month, day)` to `StatsService`
- Add `/api/v1/stats/on-this-day` route
- Enrich albums with cover images

**Frontend:**
- New `OnThisDay.tsx` component
- Add to `StatsPage.tsx` in Listening Patterns section
- CSS for year cards

**Tests:**
- Route test for On This Day endpoint
- Component test for rendering multiple years

### Phase 4: Genre/Tag Analysis (Medium complexity)

**Done Criteria:** Genre treemap renders on StatsPage showing top genres weighted by listening; tags with count < 20 are filtered out; non-genre tags blocked; tag fetching respects Last.fm rate limits with 200ms delay; failed artist lookups are skipped gracefully.

**Backend:**
- Add `getArtistTopTags(artist)` to `LastFmService`
- New `GenreAnalysisService` with caching and tag normalization
- Register cache file in `cleanupService.ts`
- Add `ArtistTagsCacheStore` type to `types.ts`
- Add `/api/v1/stats/genres` route
- **Rate limiting:** `getArtistTopTags` calls should be queued with 200ms delay between calls to respect Last.fm rate limits. If a tag fetch fails, skip that artist and continue with others. Do not let a single artist failure block the entire genre analysis.

**Frontend:**
- New `GenreTreemap.tsx` component
- Add to `StatsPage.tsx` as "Your Music DNA" section
- Loading state while tags are being fetched for the first time

**Tests:**
- Unit tests for `GenreAnalysisService` (tag aggregation, normalization, caching)
- Route test for genres endpoint
- Component test for treemap rendering

### Phase 5: Wrapped Without Discogs (Low complexity)

**Done Criteria:** Wrapped page accessible with Last.fm auth only (no Discogs required); 10 of 14 slides render correctly without collection data; collection-dependent slides are hidden when collection is empty.

**Backend:**
- No changes needed (already handles missing collection)

**Frontend:**
- Modify `WrappedSlideshow.tsx` to conditionally include slides
- Modify `Sidebar.tsx` to change Wrapped auth requirement to Last.fm only
- Update `WrappedPage.tsx` description text (remove reference to "vinyl collecting")

**Tests:**
- Update existing WrappedSlideshow tests for conditional slides
- Add test case for Last.fm-only mode (no collection slides)

---

## File Changes Summary

### New Files

| File | Purpose |
|------|---------|
| `src/backend/services/genreAnalysisService.ts` | Genre distribution computation and tag caching |
| `src/renderer/components/stats/HourlyPolarChart.tsx` | Polar chart for hourly listening distribution |
| `src/renderer/components/stats/DayOfWeekChart.tsx` | Horizontal bar chart for day-of-week distribution |
| `src/renderer/components/stats/GenreTreemap.tsx` | Treemap for genre distribution |
| `src/renderer/components/stats/OnThisDay.tsx` | "On This Day" year cards |
| `src/renderer/components/stats/HeatmapDayDetail.tsx` | Heatmap click-to-expand detail panel |
| `tests/backend/services/genreAnalysisService.test.ts` | Genre service unit tests |
| `tests/frontend/components/stats/HourlyPolarChart.test.tsx` | Polar chart tests |
| `tests/frontend/components/stats/DayOfWeekChart.test.tsx` | Day of week chart tests |
| `tests/frontend/components/stats/GenreTreemap.test.tsx` | Treemap tests |
| `tests/frontend/components/stats/OnThisDay.test.tsx` | On This Day tests |
| `tests/frontend/components/stats/HeatmapDayDetail.test.tsx` | Day detail tests |

### Modified Files

| File | Changes |
|------|---------|
| `src/shared/types.ts` | Add `HourlyDistributionResult`, `DayOfWeekDistributionResult`, `GenreDistributionResult`, `GenreData`, `OnThisDayResult`, `DateAlbumsResult`, `ArtistTagsCacheStore` types |
| `src/backend/services/lastfmService.ts` | Add `getArtistTopTags()` method |
| `src/backend/services/statsService.ts` | Add `getHourlyDistributionWithInsight()`, `getDayOfWeekDistributionWithInsight()`, `getAlbumsForDate()`, `getOnThisDay()` methods |
| `src/backend/routes/stats.ts` | Add 5 new route handlers |
| `src/backend/services/cleanupService.ts` | Register `cache/artist-tags.json` for 30-day cleanup |
| `src/backend/services/migrationService.ts` | Register `cache/artist-tags.json` data file |
| `src/server.ts` | Instantiate `GenreAnalysisService`, pass to stats router |
| `src/renderer/services/statsApi.ts` | Add API client methods for new endpoints (all stats-related calls go in `statsApi.ts`, not `api.ts`) |
| `src/renderer/components/stats/CalendarHeatmap.tsx` | Add `onDayClick` and `selectedDate` props |
| `src/renderer/pages/StatsPage.tsx` | Add new sections with data fetching |
| `src/renderer/components/wrapped/WrappedSlideshow.tsx` | Conditionally filter slides based on data availability |
| `src/renderer/components/Sidebar.tsx` | Change Wrapped auth to Last.fm only |
| `src/renderer/styles.css` | Add CSS classes for new components |
| `tests/backend/routes/stats.test.ts` | Add route tests for 5 new endpoints |
| `tests/frontend/components/WrappedSlideshow.test.tsx` | Add conditional slide filtering tests |

### New Data Files

| File | Purpose | Cache Duration |
|------|---------|---------------|
| `cache/artist-tags.json` | Cached Last.fm artist tags | 30 days |

Register in `migrationService.ts` with `schemaVersion: 1`.

---

## Decisions Table

| Decision | Choice | Rationale | Alternatives Considered |
|----------|--------|-----------|------------------------|
| Hourly chart type | Polar/Radar | Hours are circular; polar charts reveal day/night patterns as shapes | Bar chart (linear, less intuitive for circular data) |
| Day-of-week chart type | Horizontal bars | 7 items is perfect for bars; readable day labels | Vertical bars (day labels get cramped), Radar (overkill for 7 points) |
| Genre data source | Last.fm `artist.getTopTags` | Free API, no auth beyond API key, rich tag data | Discogs genres (requires collection, less granular), Spotify (requires additional OAuth) |
| Genre visualization | Treemap | Shows proportions within fixed space; information-dense | Bar chart (boring), Word cloud (trendy but hard to read), Pie chart (too many slices) |
| Genre computation | Weighted by artist play count | Reflects actual listening habits, not just artist count | Equal weight per artist (ignores listening intensity) |
| "On This Day" depth | 3 years back | Meaningful without being overwhelming | All available years (could be noisy), 1 year (not enough nostalgia) |
| Heatmap drill-down UX | Inline expansion below heatmap | Keeps heatmap visible for context switching | Modal (loses context), Navigate to new page (too heavy) |
| Where to add new sections | Stats page (existing) | Stats page is the natural home for listening pattern data | New "Patterns" page (unnecessary fragmentation) |
| Wrapped without Discogs | Filter slides client-side | Backend already handles missing data; minimal change needed | Separate "lite" endpoint (over-engineered), Separate page (confusing) |
| Tag cache duration | 30 days | Artist genre tags change very rarely | 7 days (too frequent API calls), 90 days (stale data risk) |

---

## Test Checklist

### Backend Tests

- [ ] **StatsService.getHourlyDistributionWithInsight()**
  - [ ] Returns 24 data points (one per hour)
  - [ ] Correctly identifies peak hour
  - [ ] Insight is "evening" when peak is 18-23
  - [ ] Insight is "morning" when peak is 6-11
  - [ ] Returns empty data with no history

- [ ] **StatsService.getDayOfWeekDistributionWithInsight()**
  - [ ] Returns 7 data points (one per day)
  - [ ] Correctly identifies peak day
  - [ ] Calculates weekday/weekend averages correctly
  - [ ] Insight is "weekend" when weekend avg > weekday avg
  - [ ] Returns empty data with no history

- [ ] **StatsService.getAlbumsForDate()**
  - [ ] Returns albums for a date with data
  - [ ] Returns empty array for date with no data
  - [ ] Handles invalid date format gracefully
  - [ ] Enriches results with cover images

- [ ] **StatsService.getOnThisDay()**
  - [ ] Returns data across multiple years
  - [ ] Skips years with no data
  - [ ] Correctly calculates "years ago"
  - [ ] Enriches albums with cover images
  - [ ] Handles no data for any year gracefully

- [ ] **GenreAnalysisService.getGenreDistribution()**
  - [ ] Fetches tags for top N artists
  - [ ] Weights genres by artist play count
  - [ ] Normalizes weights to sum to 1.0
  - [ ] Caches tags and reuses cache
  - [ ] Handles Last.fm API errors gracefully
  - [ ] Filters out non-genre tags
  - [ ] Merges variant tag names

- [ ] **LastFmService.getArtistTopTags()**
  - [ ] Returns tags for valid artist
  - [ ] Returns empty array for unknown artist
  - [ ] Handles API errors gracefully

- [ ] **Route Tests**
  - [ ] GET /hourly-distribution returns 200 with correct shape
  - [ ] GET /day-of-week-distribution returns 200 with correct shape
  - [ ] GET /genres returns 200 with genre data
  - [ ] GET /on-this-day returns 200 with year data
  - [ ] GET /on-this-day?month=X&day=Y works with custom date
  - [ ] GET /heatmap/:date returns 200 with album list
  - [ ] GET /heatmap/:date returns empty for no-data date
  - [ ] GET /heatmap/invalid-date returns 400

### Frontend Tests

- [ ] **HourlyPolarChart**
  - [ ] Renders polar chart with data
  - [ ] Shows insight text
  - [ ] Shows loading state
  - [ ] Handles empty data

- [ ] **DayOfWeekChart**
  - [ ] Renders horizontal bars for 7 days
  - [ ] Shows insight text
  - [ ] Shows loading state
  - [ ] Handles empty data

- [ ] **GenreTreemap**
  - [ ] Renders treemap cells with genre names
  - [ ] Shows loading state
  - [ ] Handles empty data
  - [ ] Tooltip shows artist count on hover

- [ ] **OnThisDay**
  - [ ] Renders cards for each year with data
  - [ ] Shows "no data" for empty years
  - [ ] Shows loading state
  - [ ] Handles no data for any year

- [ ] **CalendarHeatmap (updated)**
  - [ ] Click on cell with data fires `onDayClick`
  - [ ] Click on empty cell does nothing
  - [ ] Selected cell has visual highlight
  - [ ] Clicking same cell deselects

- [ ] **HeatmapDayDetail**
  - [ ] Renders album list with covers
  - [ ] Shows total scrobble count
  - [ ] Close button fires `onClose`
  - [ ] Shows formatted date

- [ ] **WrappedSlideshow (updated)**
  - [ ] Shows all 14 slides when collection data exists
  - [ ] Shows only 10 slides when collection is empty
  - [ ] Navigation works correctly with filtered slide count
  - [ ] Progress dots reflect actual slide count

---

## Accessibility Considerations

### Chart Accessibility

1. **Polar Chart (Hourly Distribution)**
   - Add `aria-label="Listening distribution by hour of day"` to chart container
   - Provide a text summary below: "Your peak listening hour is 9 PM. You listen most between 6 PM and midnight."
   - The insight text serves as a screen-reader-friendly alternative to the visual
   - Add `role="img"` to SVG element

2. **Bar Chart (Day of Week)**
   - Add `aria-label="Listening distribution by day of week"` to chart container
   - recharts `BarChart` supports ARIA attributes on the SVG
   - Insight text provides the key takeaway textually

3. **Treemap (Genres)**
   - Add `aria-label="Genre distribution treemap"` to container
   - Consider a fallback text list below the treemap for screen readers: "Your top genres: Alternative Rock (32%), Indie Rock (18%)..."
   - Each cell should not need individual ARIA labels (visual-only)

4. **Calendar Heatmap Click Targets**
   - Add `role="button"` and `aria-label="January 15, 2026: 23 scrobbles. Click for details."` to clickable cells
   - Add `tabindex="0"` to cells with data so they're keyboard-navigable
   - Support Enter/Space key to trigger click
   - Selected cell state communicated via `aria-pressed="true"`

5. **On This Day Cards**
   - Use semantic heading hierarchy: `<h3>` for each year
   - Album lists use `<ul>` with `<li>` items
   - Image `alt` text: "Album cover for [Artist] - [Album]" or empty alt for decorative fallback images

6. **Heatmap Day Detail Panel**
   - When panel opens, move focus to it (or announce via `aria-live`)
   - Close button has `aria-label="Close day detail"`
   - Use `aria-expanded` on the triggering cell to indicate state

### Color Contrast

- All chart colors tested against both `--bg-primary` values (dark: `#1a1a1a`, light: `#f5f5f5`)
- Text overlaid on colored chart elements uses white on dark backgrounds, dark gray on light backgrounds
- Treemap cells with dark colors get white text; cells with light colors get dark text
- The heatmap level colors already meet contrast requirements (existing implementation)

### Keyboard Navigation

- Polar chart and bar chart: no keyboard interaction needed (read-only visualizations)
- Treemap: no keyboard interaction needed (tooltip on hover only)
- Heatmap cells: Tab to navigate between cells with data, Enter/Space to expand
- Day detail panel: Tab through album list, Escape to close
- On This Day: standard scroll navigation

---

## Summary

Feature 14 adds five visualization capabilities to the Stats Dashboard:

1. **Polar hourly chart** -- reveals your daily listening rhythm at a glance
2. **Day-of-week bars** -- shows weekday vs. weekend patterns
3. **Genre treemap** -- surfaces your music taste profile from Last.fm tags
4. **On This Day** -- nostalgic look back at what you listened to on this date in prior years
5. **Heatmap click-to-expand** -- makes the existing heatmap interactive with album details

Plus a quality-of-life improvement: **Wrapped without Discogs** -- making 10 of 14 Wrapped slides work for Last.fm-only users by conditionally filtering collection-dependent slides.

The feature builds entirely on existing infrastructure (`ScrobbleHistoryStorage`, `StatsService`, recharts, CSS variables) with one new external API call (`artist.getTopTags` from Last.fm). No new pages are created -- all components integrate into the existing Stats Dashboard, which is the natural home for listening pattern data.
