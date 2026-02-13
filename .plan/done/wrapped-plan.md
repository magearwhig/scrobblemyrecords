# Wrapped (Period In Review) - Implementation Plan

## Overview

A Spotify Wrapped-inspired feature that generates a flashy, slide-by-slide personal recap of your listening and vinyl collecting activity for any chosen date range. Combines Last.fm scrobble data with Discogs collection data into a visually rich, story-style presentation.

---

## Feature Concept

### What It Does
- **Date Range Selection**: Pick any date range (presets or custom) to generate a recap
- **Listening Stats**: Total scrobbles, listening hours, top artists/albums/tracks, new discoveries, streaks, peak days/hours
- **Collection Stats**: Records added to collection, most-played new addition
- **Cross-Source Insights**: Collection coverage, vinyl vs digital ratio
- **Slideshow Presentation**: Full-screen, story-style UI with animated transitions and bold visuals

### Why It's Valuable
- **Engagement**: Surfaces interesting patterns and milestones users wouldn't notice in raw stats
- **Flexibility**: Any date range, not just yearly -- "How was my listening last month?"
- **Cross-data insights**: Bridges listening and collecting in ways the Stats page doesn't
- **Visual appeal**: A polished, shareable-feeling experience that rewards engagement with the app

### Design Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| How many slides? | All ~15 (listening + collection + cross-source) | User wants comprehensive recap |
| Save generated wrappeds? | No -- generate fresh each time | Keeps feature stateless, no data files needed |
| Shareable export? | Not now -- future enhancement | Reduces scope; can add html2canvas later |
| Date range options? | Custom + presets | Presets for convenience, custom for power users |
| Visual style? | Flashy and professional | Story-style slides with animations, bold typography, large album art |
| Navigation placement? | Listening sidebar group, own page | Different UX from Stats dashboard (slideshow vs grid) |

---

## User Interface

### Date Range Selection (Landing State)

```
┌─────────────────────────────────────────────────────────────┐
│ Your Wrapped                                                 │
│                                                              │
│ Choose a time period to generate your personal recap.        │
│                                                              │
│ Quick Presets:                                               │
│ [This Year] [2025] [Last 6 Months] [Last 3 Months]          │
│ [This Month] [Last Month]                                    │
│                                                              │
│ Or pick a custom range:                                      │
│ From: [YYYY-MM-DD]  To: [YYYY-MM-DD]                        │
│                                                              │
│                              [Generate Your Wrapped]         │
└─────────────────────────────────────────────────────────────┘
```

### Slideshow Presentation (After Generation)

```
┌─────────────────────────────────────────────────────────────┐
│                                              [×] Exit        │
│                                                              │
│                                                              │
│                        You listened to                       │
│                                                              │
│                     2,847 tracks                             │
│                                                              │
│                  That's about 166 hours                      │
│                  of music this year.                         │
│                                                              │
│                                                              │
│                                                              │
│              ● ○ ○ ○ ○ ○ ○ ○ ○ ○ ○ ○ ○ ○ ○                │
│                                                              │
│  [← Back]                                    [Next →]        │
└─────────────────────────────────────────────────────────────┘
```

### Top Artists Slide Example

```
┌─────────────────────────────────────────────────────────────┐
│                                              [×] Exit        │
│                                                              │
│                   Your Top Artists                           │
│                                                              │
│   1.  [img]  Radiohead           ████████████  142 plays    │
│   2.  [img]  Pink Floyd          ████████      87 plays     │
│   3.  [img]  Boards of Canada    ██████        65 plays     │
│   4.  [img]  Bjork               █████         52 plays     │
│   5.  [img]  Portishead          ████          41 plays     │
│                                                              │
│                                                              │
│              ○ ○ ● ○ ○ ○ ○ ○ ○ ○ ○ ○ ○ ○ ○                │
│                                                              │
│  [← Back]                                    [Next →]        │
└─────────────────────────────────────────────────────────────┘
```

### Records Added Slide Example

```
┌─────────────────────────────────────────────────────────────┐
│                                              [×] Exit        │
│                                                              │
│               You added 23 records                          │
│                to your collection                           │
│                                                              │
│        [cover] [cover] [cover] [cover] [cover]              │
│        [cover] [cover] [cover] [cover] [cover]              │
│                    ... and 13 more                           │
│                                                              │
│           Your most-played new addition:                    │
│        [large cover]                                        │
│        Radiohead - In Rainbows                              │
│        Added Jan 15 · 47 plays since                        │
│                                                              │
│              ○ ○ ○ ○ ○ ○ ○ ○ ○ ○ ○ ● ○ ○ ○                │
│                                                              │
│  [← Back]                                    [Next →]        │
└─────────────────────────────────────────────────────────────┘
```

### Keyboard Navigation
- **Right Arrow / Space** -- Next slide
- **Left Arrow** -- Previous slide
- **Escape** -- Exit slideshow, return to date picker
- **Home** -- First slide
- **End** -- Last slide

---

## Data Source Analysis

### Existing Data Available (No Changes Needed)

From `StatsService` (already supports custom date ranges):
- `getTopArtists(period, limit, startDate, endDate)` -- Top artists with play counts
- `getTopAlbums(period, limit, startDate, endDate)` -- Top albums with play counts
- `getTopTracks(period, limit, startDate, endDate)` -- Top tracks with play counts
- `getListeningHours()` -- Listening hour calculation pattern (3.5min avg)
- `getCalendarHeatmap(year)` -- Daily scrobble counts
- `getSourceBreakdown()` -- RecordScrobbles vs Other sources
- `getCollectionCoverage(collection)` -- % of collection played

From `ScrobbleHistoryStorage`:
- `getIndex()` -- Full scrobble history in memory (~5MB)
- `getAllAlbums()` -- All albums with history
- `getUniqueArtists()` -- All artists with play counts
- `getHourlyDistribution()` -- Scrobbles by hour (0-23)
- `getDayOfWeekDistribution()` -- Scrobbles by day (0-6)

From Discogs collection cache:
- `CollectionItem.date_added` -- ISO date string for each item

### What Needs Range-Scoping (New Logic Needed)

1. **Total scrobbles in range** -- Filter all `plays[]` entries by timestamp
2. **Listening hours in range** -- Count filtered plays * 3.5min avg
3. **Unique artists/albums in range** -- Aggregate from filtered plays
4. **New artists discovered in range** -- Artists whose first-ever scrobble falls within range
5. **Peak listening day in range** -- Group filtered plays by date, find max
6. **Peak listening hour in range** -- Group filtered plays by hour, find max
7. **Longest streak in range** -- Calculate consecutive days with scrobbles within range
8. **Collection coverage in range** -- Cross-reference filtered plays against collection
9. **Records added in range** -- Filter collection items by `date_added` timestamp
10. **Most-played new addition** -- Join records added in range with scrobble counts
11. **Vinyl vs digital in range** -- Filter source breakdown by timestamp
12. **Heatmap for range** -- `getCalendarHeatmap` but bounded to range

### Cross-Service Data Joins

These computations require data from both Last.fm and Discogs:

| Computation | Last.fm Data | Discogs Data | Mapping Needed |
|-------------|-------------|--------------|----------------|
| Most-played new addition | Play counts per album | `date_added` per item | `trackNormalization.ts` for name matching |
| Collection coverage | Albums played in range | Full collection | `trackNormalization.ts` |
| Vinyl vs digital | Session timestamps | N/A | Match against scrobble session files |

---

## Data Model

### New Type Definitions

```typescript
// src/shared/types.ts

/**
 * Complete wrapped data for a date range -- generated fresh, not persisted
 */
export interface WrappedData {
  // Range metadata
  startDate: number;         // milliseconds
  endDate: number;           // milliseconds
  generatedAt: number;       // milliseconds

  // Listening stats
  listening: WrappedListeningStats;

  // Collection stats
  collection: WrappedCollectionStats;

  // Cross-source insights
  crossSource: WrappedCrossSourceStats;
}

export interface WrappedListeningStats {
  totalScrobbles: number;
  estimatedListeningHours: number;
  uniqueArtists: number;
  uniqueAlbums: number;
  topArtists: WrappedTopItem[];
  topAlbums: WrappedTopItem[];
  topTracks: WrappedTopItem[];
  newArtistsDiscovered: number;
  newArtistsList: WrappedNewArtist[];
  peakListeningDay: {
    date: string;            // YYYY-MM-DD
    scrobbleCount: number;
  } | null;
  peakListeningHour: {
    hour: number;            // 0-23
    scrobbleCount: number;
  } | null;
  longestStreak: {
    days: number;
    startDate: string;       // YYYY-MM-DD
    endDate: string;         // YYYY-MM-DD
  } | null;
  heatmapData: { date: string; count: number }[];
}

export interface WrappedTopItem {
  name: string;              // Artist name or "Artist - Album" or track name
  artist: string;
  album?: string;
  playCount: number;
  imageUrl?: string;
}

export interface WrappedNewArtist {
  name: string;
  playCount: number;
  firstPlayDate: number;     // milliseconds
  imageUrl?: string;
}

export interface WrappedCollectionStats {
  recordsAdded: number;
  recordsList: WrappedCollectionItem[];
  mostPlayedNewAddition: {
    artist: string;
    title: string;
    coverUrl?: string;
    dateAdded: number;       // milliseconds
    playCount: number;
  } | null;
}

export interface WrappedCollectionItem {
  artist: string;
  title: string;
  coverUrl?: string;
  dateAdded: number;         // milliseconds
  year?: number;
}

export interface WrappedCrossSourceStats {
  collectionCoverage: number;  // 0-100 percentage
  totalCollectionSize: number;
  albumsPlayed: number;
  vinylScrobbles: number;      // From RecordScrobbles
  otherScrobbles: number;      // From other sources
  vinylPercentage: number;     // 0-100
}
```

---

## Backend Implementation

### Phase 1: WrappedService

**File:** `src/backend/services/wrappedService.ts`

**Dependencies (injected via constructor):**
- `StatsService` -- for top artists/albums/tracks with date ranges
- `ScrobbleHistoryStorage` -- for raw scrobble index
- `DiscogsService` -- for collection data
- `ImageService` -- for album/artist images

**Key Method:**
```typescript
async generateWrapped(startDate: number, endDate: number): Promise<WrappedData>
```

**Internal Logic:**

1. **Get scrobble index** -- `historyStorage.getIndex()`
2. **Filter plays by range** -- Iterate all `albums[].plays[]`, keep entries where `timestamp * 1000 >= startDate && timestamp * 1000 <= endDate` (normalize Last.fm seconds to milliseconds per dev_prompt)
3. **Compute listening stats** from filtered plays:
   - Total scrobbles = count of filtered plays
   - Listening hours = totalScrobbles * 3.5 / 60
   - Unique artists/albums = Set sizes from filtered play keys
   - Peak day = group by date key, find max count
   - Peak hour = group by hour, find max count
   - Streak = scan dates for longest consecutive run
4. **Get top lists** -- Delegate to `StatsService.getTopArtists/Albums/Tracks('custom', 5, startDateSec, endDateSec)`
5. **New artists discovered** -- For each artist in filtered plays, check if their earliest-ever play falls within the range
6. **Get collection items** -- Load collection, filter by `date_added` within range
7. **Most-played new addition** -- Cross-reference records added with scrobble counts, using `trackNormalization.ts` for name matching
8. **Collection coverage** -- Cross-reference filtered plays against full collection using existing mapping logic
9. **Source breakdown** -- Filter source identification to range timestamps
10. **Enrich with images** -- Batch fetch album covers and artist images via `ImageService`

**Logger:** `createLogger('WrappedService')`

**No data files created** -- purely computational, returns result directly.

### Phase 2: API Route

**File:** `src/backend/routes/wrapped.ts`

**Router factory pattern:**
```typescript
export default function createWrappedRouter(
  wrappedService: WrappedService
) {
  const router = express.Router();
  const log = createLogger('WrappedRoutes');

  // GET /api/v1/wrapped?startDate=<ms>&endDate=<ms>
  router.get('/', async (req, res) => { ... });

  return router;
}
```

**Endpoint:**
- `GET /api/v1/wrapped?startDate=<ms>&endDate=<ms>`
- Validates `startDate` and `endDate` are numbers and `startDate < endDate`
- Returns `ApiResponse<WrappedData>`
- No authentication beyond existing app auth (data is user's own)

**Registration in `server.ts`:**
```typescript
const wrappedService = new WrappedService(statsService, scrobbleHistoryStorage, discogsService, imageService);
app.use('/api/v1/wrapped', createWrappedRouter(wrappedService));
```

**Add to API info endpoint.**

---

## Frontend Implementation

### Phase 3: WrappedPage

**File:** `src/renderer/pages/WrappedPage.tsx`

**Two states:**
1. **Date picker state** -- User selects range, clicks "Generate"
2. **Slideshow state** -- Full-screen presentation of results

**Date picker:**
- Preset buttons: "This Year", "2025", "Last 6 Months", "Last 3 Months", "This Month", "Last Month"
- Custom date inputs (native `<input type="date">`)
- "Generate Your Wrapped" button (uses existing `Button` component, `primary` variant)
- Loading state with `Skeleton` components while generating
- `EmptyState` if no data exists for the selected range

**API call via `ApiService`:**
```typescript
// src/renderer/services/api.ts
async getWrapped(startDate: number, endDate: number): Promise<WrappedData> {
  const response = await this.api.get(`/wrapped?startDate=${startDate}&endDate=${endDate}`);
  return response.data.data;
}
```

**Route registration:**
- Add `WRAPPED: 'wrapped'` to `src/renderer/routes.ts`
- Add case to `MainContent.tsx` switch
- Add to Sidebar under "Listening" group (requires both Last.fm + Discogs)

### Phase 4: Slideshow Components

**New components in `src/renderer/components/wrapped/`:**

1. **`WrappedSlideshow.tsx`** -- Container managing slide state and transitions
   - Manages `currentSlide` index
   - Handles keyboard navigation (arrow keys, escape, home, end)
   - Renders progress dots
   - Transition animations between slides

2. **`WrappedSlide.tsx`** -- Base wrapper for each slide
   - Handles enter/exit animation classes
   - Common layout (centered content, navigation area, progress)

3. **`WrappedNav.tsx`** -- Forward/back buttons + progress indicator
   - Back/Next buttons (use existing `Button` component, `ghost` variant)
   - Dot indicators showing current position
   - Exit button (returns to date picker)
   - `aria-label` on all interactive elements per accessibility requirements

4. **Individual slide components** (one per stat type):
   - `TotalScrobblesSlide.tsx` -- Big number + listening hours
   - `TopArtistsSlide.tsx` -- Ranked list with images and play count bars
   - `TopAlbumsSlide.tsx` -- Ranked list with cover art and play count bars
   - `TopTracksSlide.tsx` -- Ranked list with play counts
   - `UniqueCountsSlide.tsx` -- Unique artists + unique albums
   - `NewArtistsSlide.tsx` -- New discoveries count + list
   - `PeakDaySlide.tsx` -- Biggest listening day
   - `PeakHourSlide.tsx` -- Most active hour of day
   - `StreakSlide.tsx` -- Longest streak in range
   - `HeatmapSlide.tsx` -- Calendar heatmap (reuse existing `CalendarHeatmap` component)
   - `RecordsAddedSlide.tsx` -- Collection additions with cover art grid
   - `MostPlayedAdditionSlide.tsx` -- Featured new addition with large cover
   - `CollectionCoverageSlide.tsx` -- Coverage percentage with progress visual
   - `VinylVsDigitalSlide.tsx` -- Source breakdown (reuse `SourcePieChart` or similar)

**Component patterns:**
- All functional components using `React.FC<Props>`
- Props typed with explicit interfaces
- List-item components in loops wrapped in `React.memo`
- `useCallback` for event handlers passed as props
- `useMemo` for expensive computations (slide ordering, data formatting)

### Phase 5: CSS & Animations

**All styles in `src/renderer/styles.css`** -- no inline styles.

**Key CSS classes:**

```css
/* Wrapped page layout */
.wrapped-page { }
.wrapped-date-picker { }
.wrapped-preset-buttons { }

/* Slideshow */
.wrapped-slideshow { }  /* Full viewport overlay */
.wrapped-slide { }      /* Individual slide */
.wrapped-slide-entering { }  /* Enter animation */
.wrapped-slide-exiting { }   /* Exit animation */

/* Navigation */
.wrapped-nav { }
.wrapped-progress-dots { }
.wrapped-dot { }
.wrapped-dot-active { }

/* Slide content */
.wrapped-big-number { }     /* Large stat value */
.wrapped-subtitle { }       /* Descriptive text under number */
.wrapped-ranked-list { }    /* Top 5 lists */
.wrapped-rank-bar { }       /* Horizontal play count bar */
.wrapped-cover-grid { }     /* Album cover mosaic */
.wrapped-featured-cover { } /* Large single cover */
```

**Animation keyframes:**
- `@keyframes wrappedFadeIn` -- Fade + slight scale up
- `@keyframes wrappedSlideUp` -- Slide content up from below
- `@keyframes wrappedCountUp` -- Number counting animation (CSS only, for the big stats)
- Transitions on slide change: ~400ms ease-out

**Visual design goals:**
- Dark background to make album art pop (use existing dark theme vars)
- Large, bold typography for key numbers
- Generous whitespace
- Album covers at 100-150px for grids, 200px+ for featured
- Circular artist images at 60-80px
- Horizontal bars for play count visualization (no charting library needed for simple bars)
- Smooth, professional transitions between slides

**Check existing global CSS classes before creating new ones:**
- `.card` for any card-like containers
- `.btn` variants for navigation buttons
- Existing animation keyframes (`slideUp`, `fadeInOut`)

---

## API Client Updates

**File:** `src/renderer/services/api.ts`

```typescript
// Wrapped endpoint
async getWrapped(startDate: number, endDate: number): Promise<WrappedData> {
  const response = await this.api.get('/wrapped', {
    params: { startDate, endDate },
  });
  return response.data.data;
}
```

No other API changes needed -- all underlying data is computed server-side.

---

## Implementation Phases

### Phase 1: Backend WrappedService (Medium)

**Deliverables:**
1. `WrappedData` and sub-types in `types.ts`
2. `WrappedService` with `generateWrapped()` method
3. Range-filtered scrobble aggregation logic
4. Collection `date_added` filtering
5. Cross-source computations (coverage, most-played addition, vinyl ratio)
6. Image enrichment for top lists
7. Unit tests for all computation methods

**Dependencies:** Existing `StatsService`, `ScrobbleHistoryStorage`, `DiscogsService`, `ImageService`

### Phase 2: Backend API Route (Low)

**Deliverables:**
1. `createWrappedRouter()` factory function
2. `GET /api/v1/wrapped` endpoint with validation
3. Registration in `server.ts`
4. Route integration tests

**Dependencies:** Phase 1

### Phase 3: Frontend WrappedPage (Medium)

**Deliverables:**
1. `WrappedPage.tsx` with date picker and slideshow states
2. Route registration (`routes.ts`, `MainContent.tsx`, `Sidebar.tsx`)
3. `ApiService.getWrapped()` method
4. Preset date range calculations
5. Loading and empty states
6. Page component tests

**Dependencies:** Phase 2

### Phase 4: Slideshow Components (Medium-High)

**Deliverables:**
1. `WrappedSlideshow.tsx` -- Container with keyboard nav
2. `WrappedSlide.tsx` -- Base slide wrapper
3. `WrappedNav.tsx` -- Navigation and progress
4. 15 individual slide components
5. Component tests for slideshow navigation and each slide type

**Dependencies:** Phase 3

### Phase 5: CSS & Animations (Medium)

**Deliverables:**
1. All wrapped CSS classes in `styles.css`
2. Animation keyframes for slide transitions
3. Responsive layout (slides resize gracefully)
4. Dark theme integration
5. Visual polish and testing across themes

**Dependencies:** Phase 4

### Phase 6: Testing (Medium)

**Deliverables:**
1. `tests/backend/services/wrappedService.test.ts` -- Unit tests for all computation logic
2. `tests/backend/routes/wrapped.test.ts` -- Route integration tests
3. `tests/frontend/pages/WrappedPage.test.tsx` -- Page component tests
4. `tests/frontend/components/WrappedSlideshow.test.tsx` -- Slideshow navigation tests
5. Individual slide component tests as needed
6. Meet coverage thresholds (60% enforced, 90% target)

**Dependencies:** Phases 1-5

---

## Edge Cases

| Case | Behavior |
|------|----------|
| No scrobble history for range | Show `EmptyState`: "No listening data found for this period" |
| No collection items added in range | Collection slides show "No records added" with count of 0 |
| Range in the future | Validate and reject: "End date cannot be in the future" |
| Start date > end date | Validate and reject: "Start date must be before end date" |
| Very short range (1 day) | Works fine -- just fewer meaningful stats |
| Very long range (10+ years) | Works fine -- scrobble index is in memory, aggregation is O(n) |
| No history sync yet | Show `EmptyState` prompting user to sync history first |
| History sync in progress | Show warning: "History sync is in progress, results may be incomplete" |
| No Discogs collection | Listening slides still work; collection/cross-source slides show empty states |
| Track name mismatches (Discogs vs Last.fm) | Use `trackNormalization.ts` for fuzzy matching |

---

## Performance Considerations

| Concern | Mitigation |
|---------|------------|
| Scrobble index scan is O(n) over all history | Index is already in memory (~5MB); single pass with filtering is fast |
| Image enrichment for top lists | Batch fetch via `ImageService`; images are cached |
| Large collection filtering | Collection pages are cached locally; filter in memory |
| Multiple StatsService calls | Run independent calls in parallel with `Promise.all()` |
| Slide rendering | Only current slide + adjacent slides rendered; others lazy |

---

## Test Checklist

### Backend Tests

- [ ] **WrappedService**
  - [ ] Generates correct total scrobble count for range
  - [ ] Calculates listening hours from scrobble count
  - [ ] Returns correct top 5 artists/albums/tracks for range
  - [ ] Identifies unique artists/albums in range
  - [ ] Detects new artists (first-ever play in range)
  - [ ] Finds peak listening day correctly
  - [ ] Finds peak listening hour correctly
  - [ ] Calculates longest streak within range
  - [ ] Filters collection by `date_added` range
  - [ ] Finds most-played new addition with fuzzy matching
  - [ ] Computes collection coverage for range
  - [ ] Computes vinyl vs digital breakdown for range
  - [ ] Handles empty scrobble history gracefully
  - [ ] Handles empty collection gracefully
  - [ ] Handles range with no data gracefully

- [ ] **Wrapped Routes**
  - [ ] GET /wrapped returns data for valid range
  - [ ] Rejects missing startDate/endDate
  - [ ] Rejects non-numeric parameters
  - [ ] Rejects startDate > endDate
  - [ ] Rejects future endDate
  - [ ] Returns structured error responses

### Frontend Tests

- [ ] **WrappedPage**
  - [ ] Renders date picker in initial state
  - [ ] Preset buttons calculate correct date ranges
  - [ ] Custom date inputs work
  - [ ] Generate button calls API with correct params
  - [ ] Shows loading state while generating
  - [ ] Shows empty state for no data
  - [ ] Transitions to slideshow on data load

- [ ] **WrappedSlideshow**
  - [ ] Renders first slide on mount
  - [ ] Next button advances slide
  - [ ] Back button goes to previous slide
  - [ ] Cannot go before first slide
  - [ ] Cannot go past last slide
  - [ ] Arrow key navigation works
  - [ ] Escape returns to date picker
  - [ ] Progress dots reflect current position

- [ ] **Individual Slides**
  - [ ] Each slide renders without errors given valid data
  - [ ] Each slide handles missing/null data gracefully

---

## File Changes Summary

### New Files

- `src/backend/services/wrappedService.ts` -- Wrapped generation logic
- `src/backend/routes/wrapped.ts` -- `/api/v1/wrapped` endpoint
- `src/renderer/pages/WrappedPage.tsx` -- Page with date picker + slideshow
- `src/renderer/components/wrapped/WrappedSlideshow.tsx` -- Slideshow container
- `src/renderer/components/wrapped/WrappedSlide.tsx` -- Base slide wrapper
- `src/renderer/components/wrapped/WrappedNav.tsx` -- Navigation + progress
- `src/renderer/components/wrapped/TotalScrobblesSlide.tsx`
- `src/renderer/components/wrapped/TopArtistsSlide.tsx`
- `src/renderer/components/wrapped/TopAlbumsSlide.tsx`
- `src/renderer/components/wrapped/TopTracksSlide.tsx`
- `src/renderer/components/wrapped/UniqueCountsSlide.tsx`
- `src/renderer/components/wrapped/NewArtistsSlide.tsx`
- `src/renderer/components/wrapped/PeakDaySlide.tsx`
- `src/renderer/components/wrapped/PeakHourSlide.tsx`
- `src/renderer/components/wrapped/StreakSlide.tsx`
- `src/renderer/components/wrapped/HeatmapSlide.tsx`
- `src/renderer/components/wrapped/RecordsAddedSlide.tsx`
- `src/renderer/components/wrapped/MostPlayedAdditionSlide.tsx`
- `src/renderer/components/wrapped/CollectionCoverageSlide.tsx`
- `src/renderer/components/wrapped/VinylVsDigitalSlide.tsx`
- `tests/backend/services/wrappedService.test.ts`
- `tests/backend/routes/wrapped.test.ts`
- `tests/frontend/pages/WrappedPage.test.tsx`
- `tests/frontend/components/WrappedSlideshow.test.tsx`

### Modified Files

- `src/shared/types.ts` -- Add `WrappedData`, `WrappedListeningStats`, `WrappedCollectionStats`, `WrappedCrossSourceStats`, and sub-types
- `src/server.ts` -- Instantiate `WrappedService`, mount `/api/v1/wrapped` route, add to API info
- `src/renderer/services/api.ts` -- Add `getWrapped()` method
- `src/renderer/routes.ts` -- Add `WRAPPED: 'wrapped'`
- `src/renderer/components/MainContent.tsx` -- Add `WrappedPage` case
- `src/renderer/components/Sidebar.tsx` -- Add "Wrapped" nav item under Listening
- `src/renderer/styles.css` -- Add wrapped CSS classes and animation keyframes

### No New Data Files

This feature is stateless -- no JSON files in `data/`, no migration registration, no cleanup needed.

---

## Summary

Wrapped leverages the app's existing rich data layer (scrobble history index + Discogs collection) to create a visually engaging, story-style recap for any date range. The backend is a straightforward aggregation service composing existing primitives. The frontend is the star -- a full-screen slideshow with bold visuals, smooth animations, and large album art that makes the data feel alive. The feature is stateless (no persistence) and lightweight (no new dependencies beyond what's already in the app).
