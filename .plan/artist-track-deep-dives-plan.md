# Feature 15: Artist & Track Deep Dives - Implementation Plan

## Overview

Artist and Track Deep Dive pages provide dedicated detail views for individual artists and tracks. Users can drill down from top lists, history, collection, or any place artist/track names appear to see comprehensive profiles with listening history, play trends, collection connections, and external links.

### Value Proposition
- **Context**: Top lists and history show names and counts, but users want the full story -- "When did I discover this artist? What's my most-played track by them? Do I own any of their records?"
- **Navigation**: Currently, artist and track names are dead text. Making them clickable transforms the app from a dashboard into an interconnected knowledge base
- **Cross-feature insights**: Bridges listening data (Last.fm) with collection data (Discogs) on a single page per entity
- **Engagement**: Encourages exploration and rediscovery of listening habits

---

## User Flow Diagrams

### How Users Reach Artist Detail Page

```
Stats Page (Top Artists list)
  └─ Click artist name ──────────────┐
                                      │
Stats Page (Top Albums/Tracks list)   │
  └─ Click artist name ──────────────┤
                                      │
History Page (Last.fm History tab)    │
  └─ Click artist name ──────────────┤
                                      ├──▶ Artist Detail Page (#artist?name=...)
Collection Page (Album Card)          │
  └─ Click artist name ──────────────┤
                                      │
Release Details Page                  │
  └─ Click artist name ──────────────┤
                                      │
Dashboard (Monthly Highlights)        │
  └─ Click artist name ──────────────┤
                                      │
Track Detail Page                     │
  └─ Click artist name ──────────────┘
```

### How Users Reach Track Detail Page

```
Stats Page (Top Tracks list)
  └─ Click track name ───────────────┐
                                      │
History Page (Last.fm History tab)    │
  └─ Click track name ───────────────┤
                                      ├──▶ Track Detail Page (#track?artist=...&track=...&album=...)
Discovery (Forgotten Favorites tab)   │
  └─ Click track name ───────────────┤
                                      │
Artist Detail Page (Top Tracks list)  │
  └─ Click track name ───────────────┘
```

### Navigation Back

```
Artist/Track Detail Page
  ├─ Browser back button (hash history)
  ├─ Breadcrumb: Stats > Artist Name
  └─ Click any other sidebar nav item
```

---

## Page Layout Mockups

### Artist Detail Page

```
┌─────────────────────────────────────────────────────────────────┐
│ ← Back to Stats                                                  │
│                                                                   │
│  [Artist Image]   Radiohead                                      │
│  (circular,       ─────────                                      │
│   80px)           1,247 total scrobbles · First played: Mar 2019 │
│                   [▶ Play on Spotify] [↗ Last.fm] [↗ Discogs]    │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─ Play Count Over Time ────────────────────────────────────┐  │
│  │                                                            │  │
│  │    ▄▄                                                      │  │
│  │   ▄██  ▄▄      ▄▄                          ▄▄▄            │  │
│  │  ▄███▄▄██▄    ▄██▄    ▄▄      ▄▄          ▄████▄          │  │
│  │  ██████████▄▄▄████▄▄▄▄██▄▄▄▄▄██▄▄▄▄▄▄▄▄▄██████▄▄        │  │
│  │  ───────────────────────────────────────────────────       │  │
│  │  2019    2020    2021    2022    2023    2024    2025       │  │
│  │                                                            │  │
│  │  Period: [Month ▼]                                         │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─ Top Tracks ─────────────┐  ┌─ Albums ──────────────────────┐│
│  │                           │  │                                ││
│  │ 1. Everything In Its     │  │ [cover] OK Computer            ││
│  │    Right Place     87 ▶  │  │         47 plays · In Collection││
│  │ 2. Idioteque       63 ▶  │  │                                ││
│  │ 3. 15 Step         55 ▶  │  │ [cover] In Rainbows            ││
│  │ 4. Reckoner        48 ▶  │  │         38 plays · In Collection││
│  │ 5. How to          44 ▶  │  │                                ││
│  │    Disappear              │  │ [cover] Kid A                  ││
│  │ 6. Pyramid Song    41 ▶  │  │         35 plays               ││
│  │ 7. There, There    39 ▶  │  │                                ││
│  │ 8. Lucky           35 ▶  │  │ [cover] Amnesiac               ││
│  │ 9. Jigsaw Falling  33 ▶  │  │         22 plays               ││
│  │ 10. No Surprises   31 ▶  │  │                                ││
│  │                           │  │ [cover] The Bends              ││
│  └───────────────────────────┘  │         18 plays · In Collection││
│                                  │                                ││
│                                  └────────────────────────────────┘│
│                                                                   │
│  ┌─ Listening Stats ────────────────────────────────────────────┐│
│  │                                                               ││
│  │  This Week: 12    This Month: 47    This Year: 312           ││
│  │  All Time: 1,247                                              ││
│  │                                                               ││
│  └───────────────────────────────────────────────────────────────┘│
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Track Detail Page

```
┌─────────────────────────────────────────────────────────────────┐
│ ← Back to Stats                                                  │
│                                                                   │
│  Everything In Its Right Place                                   │
│  ──────────────────────────────                                  │
│  by Radiohead (click to view artist)                             │
│  87 total plays · First played: Apr 2019 · Last played: Today   │
│  [▶ Play on Spotify] [↗ Last.fm]                                 │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─ Play History ─────────────────────────────────────────────┐ │
│  │                                                             │ │
│  │    ▄                                                        │ │
│  │   ▄█  ▄      ▄                               ▄▄            │ │
│  │  ▄██▄▄█▄    ▄█▄    ▄      ▄          ▄      ▄██▄           │ │
│  │  ████████▄▄▄███▄▄▄▄█▄▄▄▄▄█▄▄▄▄▄▄▄▄▄█▄▄▄▄▄▄████▄          │ │
│  │  ──────────────────────────────────────────────────          │ │
│  │  2019    2020    2021    2022    2023    2024    2025        │ │
│  │                                                             │ │
│  │  Period: [Month ▼]                                          │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─ Appears On ─────────────────────────────────────────────────┐│
│  │                                                               ││
│  │  [cover] Kid A                    47 plays of this track     ││
│  │          Radiohead · 2000         In Collection              ││
│  │                                                               ││
│  │  [cover] Kid A (Deluxe Edition)   40 plays of this track     ││
│  │          Radiohead · 2009                                     ││
│  │                                                               ││
│  └───────────────────────────────────────────────────────────────┘│
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Requirements

### Artist Detail Data

| Data Point | Source | Method |
|------------|--------|--------|
| Total play count | ScrobbleHistoryStorage | `getUniqueArtists()` or iterate albums |
| All albums by artist | ScrobbleHistoryStorage | `getAllAlbums()` filtered by artist |
| Top tracks by artist | ScrobbleHistoryStorage | `getTracksPaginated()` filtered by artist |
| Play count over time | ScrobbleHistoryStorage | Aggregate plays by month from album entries |
| First scrobble date | ScrobbleHistoryStorage | Min timestamp across all plays |
| Period play counts | StatsService | Reuse period cutoff logic |
| In collection albums | Collection cache | Cross-reference artist against collection |
| Artist image | ImageService | `getArtistImage()` |
| Album covers | ImageService | `getAlbumCover()` |

### Track Detail Data

| Data Point | Source | Method |
|------------|--------|--------|
| Total play count | ScrobbleHistoryStorage | Track-level plays from album entries |
| Play history over time | ScrobbleHistoryStorage | Aggregate track plays by month |
| First/last played | ScrobbleHistoryStorage | Min/max timestamp for track |
| Albums containing track | ScrobbleHistoryStorage | Find all album entries with matching track |
| In collection status | Collection cache | Check if album is in collection |

---

## API Endpoint Design

### Artist Endpoints

#### `GET /api/v1/stats/artist/:artistName`

Returns comprehensive artist profile data.

**Query Parameters:**
- `trendPeriod` (optional): `'month' | 'week'` -- granularity for trend chart (default: `'month'`)

**Response:**
```typescript
interface ArtistDetailResponse {
  artist: string;
  totalPlayCount: number;
  firstPlayed: number | null;        // Unix timestamp (seconds)
  lastPlayed: number | null;         // Unix timestamp (seconds)

  // Period breakdowns
  periodCounts: {
    thisWeek: number;
    thisMonth: number;
    thisYear: number;
    allTime: number;
  };

  // Play trend over time (monthly or weekly buckets)
  playTrend: Array<{
    period: string;                  // 'YYYY-MM' or 'YYYY-Www'
    count: number;
  }>;

  // Top tracks by this artist
  topTracks: Array<{
    track: string;
    album: string;
    playCount: number;
    lastPlayed: number;
  }>;

  // All albums by this artist (from scrobble history)
  albums: Array<{
    album: string;
    playCount: number;
    lastPlayed: number;
    coverUrl?: string;
    inCollection: boolean;
    collectionReleaseId?: number;    // For linking to release-details
  }>;

  // Artist image
  imageUrl?: string;
}
```

### Track Endpoints

#### `GET /api/v1/stats/track`

Returns comprehensive track profile data.

**Query Parameters (required):**
- `artist`: Artist name
- `track`: Track name

**Query Parameters (optional):**
- `album`: Album name (to scope to specific album, otherwise aggregates all)
- `trendPeriod`: `'month' | 'week'` (default: `'month'`)

**Response:**
```typescript
interface TrackDetailResponse {
  artist: string;
  track: string;
  totalPlayCount: number;
  firstPlayed: number | null;        // Unix timestamp (seconds)
  lastPlayed: number | null;         // Unix timestamp (seconds)

  // Play trend over time
  playTrend: Array<{
    period: string;                  // 'YYYY-MM' or 'YYYY-Www'
    count: number;
  }>;

  // Albums this track appears on (may appear on multiple due to compilations/editions)
  appearsOn: Array<{
    album: string;
    artist: string;
    playCount: number;               // Plays of this track on this album
    lastPlayed: number;
    coverUrl?: string;
    inCollection: boolean;
    collectionReleaseId?: number;
  }>;
}
```

---

## Component Architecture

### New Components

```
src/renderer/pages/
  ArtistDetailPage.tsx              -- Full artist detail page
  TrackDetailPage.tsx               -- Full track detail page

src/renderer/components/
  ArtistLink.tsx                    -- Clickable artist name (navigates to artist detail)
  TrackLink.tsx                     -- Clickable track name (navigates to track detail)
  PlayTrendChart.tsx                -- Reusable recharts-based play count over time chart
```

### `ArtistLink` Component

A simple inline component that renders an artist name as a clickable link navigating to the artist detail page. Used across the entire app to replace static artist name text.

```typescript
interface ArtistLinkProps {
  artist: string;
  className?: string;
}
```

**Navigation pattern:**
```typescript
// Store artist name in localStorage (matching existing release-details pattern)
localStorage.setItem('selectedArtist', artist);
window.location.hash = '#artist';
```

### `TrackLink` Component

```typescript
interface TrackLinkProps {
  artist: string;
  track: string;
  album?: string;
  className?: string;
}
```

**Navigation pattern:**
```typescript
localStorage.setItem('selectedTrack', JSON.stringify({ artist, track, album }));
window.location.hash = '#track';
```

### `PlayTrendChart` Component

Reusable chart shared by both Artist and Track detail pages. Uses `recharts` (already installed).

```typescript
interface PlayTrendChartProps {
  data: Array<{ period: string; count: number }>;
  periodLabel?: string;                // 'month' | 'week'
  onPeriodChange?: (period: string) => void;
}
```

---

## Navigation & Routing Changes

### New Routes

Add to `src/renderer/routes.ts`:
```typescript
ARTIST_DETAIL: 'artist',
TRACK_DETAIL: 'track',
```

### MainContent.tsx Changes

Add cases in the route switch:
```typescript
case ROUTES.ARTIST_DETAIL:
  return <ArtistDetailPage key={`artist-${Date.now()}`} />;
case ROUTES.TRACK_DETAIL:
  return <TrackDetailPage key={`track-${Date.now()}`} />;
```

**Note:** Using timestamp keys (matching the `ReleaseDetailsPage` pattern) forces remount when navigating between different artists/tracks.

### Sidebar: No New Nav Items

Artist and Track detail pages are **not** top-level navigation items. They are reached by clicking artist/track names within existing pages. This follows the same pattern as `ReleaseDetailsPage`, which is not in the sidebar but is reachable from Collection.

### Navigation Pattern: localStorage + Hash

This follows the established pattern used by `ReleaseDetailsPage`:
1. Store context data in `localStorage` (artist name, or track info)
2. Set `window.location.hash` to the route
3. Detail page reads from `localStorage` on mount
4. `MainContent` uses a key to force remount on navigation

This is preferred over URL query params because:
- The hash routing system extracts `currentPage` before `?` query params (see `App.tsx:44`)
- localStorage is already the established pattern for passing data to detail pages
- Keeps URL hashes simple and consistent

---

## Implementation Phases

### Phase 1: Backend API & Service Methods

**Done Criteria:** Both API endpoints return correct data shape with play trends, period counts, and collection cross-references; unknown artists/tracks return graceful empty responses; route tests pass.

**Files modified:**
- `src/backend/services/statsService.ts` -- Add `getArtistDetail()` and `getTrackDetail()` methods
- `src/backend/routes/stats.ts` -- Add `GET /api/v1/stats/artist/:artistName` and `GET /api/v1/stats/track` routes

**Implementation details:**

`getArtistDetail(artistName, trendPeriod)`:
1. Get all albums from `historyStorage.getAllAlbums()`
2. Filter to albums matching the artist (case-insensitive)
3. Aggregate total play count, find min/max timestamps
4. Compute period counts (reuse existing period cutoff logic)
5. Build play trend by grouping all plays into monthly/weekly buckets
6. Extract top tracks from album play entries
7. Cross-reference with collection for "In Collection" flag
8. Fetch artist image via `imageService`

`getTrackDetail(artist, track, album?, trendPeriod)`:
1. Get index from `historyStorage.getIndex()`
2. Scan all album entries for plays matching this track name
3. Aggregate play count, find min/max timestamps
4. Build play trend chart data
5. Identify which albums the track appears on
6. Cross-reference with collection

### Phase 2: Frontend Detail Pages

**Done Criteria:** Artist detail page renders with image, play trend chart, top tracks, album list with "In Collection" badges, and period stats; Track detail page renders with play history chart and "Appears On" album list; both pages show Skeleton loading states and handle empty data gracefully.

**Files created:**
- `src/renderer/pages/ArtistDetailPage.tsx`
- `src/renderer/pages/TrackDetailPage.tsx`
- `src/renderer/components/PlayTrendChart.tsx`

**Files modified:**
- `src/renderer/routes.ts` -- Add ARTIST_DETAIL and TRACK_DETAIL routes
- `src/renderer/components/MainContent.tsx` -- Add route cases
- `src/renderer/services/statsApi.ts` -- Add `getArtistDetail()` and `getTrackDetail()` API methods (all stats-related calls go in `statsApi.ts`, not `api.ts`)
- `src/renderer/styles.css` -- CSS classes for detail pages

**AbortController:** Both detail pages should use `AbortController` to cancel in-flight API requests on unmount or navigation to a different artist/track. This prevents stale state updates when users rapidly click between different artists or tracks.

**Existing Component Reuse:** Use `Skeleton` for loading states while data is fetching. Use `Badge` (with `success` variant) for "In Collection" badges on album lists. Use `EmptyState` for no-data scenarios (e.g., artist with zero scrobbles).

### Phase 3: Navigation Links (ArtistLink/TrackLink)

**Done Criteria:** Artist and track names are clickable throughout the app (Stats, History, Collection, Discovery); clicking navigates to the correct detail page; all integration points wired up.

**Files created:**
- `src/renderer/components/ArtistLink.tsx`
- `src/renderer/components/TrackLink.tsx`

**Files modified (add clickable links):**
- `src/renderer/components/stats/TopList.tsx` -- Wrap artist/track names in ArtistLink/TrackLink
- `src/renderer/components/LastFmHistoryTab.tsx` -- Wrap artist/track/album names
- `src/renderer/pages/StatsPage.tsx` -- No direct changes (TopList handles it)
- `src/renderer/pages/HomePage.tsx` -- Wrap monthly highlights artist/album names
- `src/renderer/pages/ReleaseDetailsPage.tsx` -- Wrap artist name in header
- `src/renderer/pages/CollectionPage.tsx` -- Wrap artist names in AlbumCard (or AlbumCard itself)
- `src/renderer/components/AlbumCard.tsx` -- Wrap artist name

### Phase 4: External Links & Polish

**Done Criteria:** External links (Last.fm, Discogs, Spotify) open correctly in browser; back navigation works via breadcrumb and browser back; loading skeletons display during data fetch.

- Add Last.fm link: `https://www.last.fm/music/{encodedArtist}` for artists, `https://www.last.fm/music/{encodedArtist}/_/{encodedTrack}` for tracks
- Add Discogs search link: `https://www.discogs.com/search/?q={encodedArtist}&type=artist`
- Add Spotify play button (reuse existing `playAlbumOnSpotify`/`playTrackOnSpotify` from `spotifyUtils.ts`)
- Back navigation breadcrumb
- Loading skeletons

---

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/shared/types.ts` | Modify | Add `ArtistDetailResponse`, `TrackDetailResponse` interfaces |
| `src/backend/services/statsService.ts` | Modify | Add `getArtistDetail()`, `getTrackDetail()` methods |
| `src/backend/routes/stats.ts` | Modify | Add 2 new endpoints |
| `src/renderer/routes.ts` | Modify | Add ARTIST_DETAIL, TRACK_DETAIL constants |
| `src/renderer/components/MainContent.tsx` | Modify | Add 2 route cases + imports |
| `src/renderer/services/statsApi.ts` | Modify | Add `getArtistDetail()` and `getTrackDetail()` API client methods (all stats-related calls go in `statsApi.ts`, not `api.ts`) |
| `src/renderer/pages/ArtistDetailPage.tsx` | Create | Artist detail page component |
| `src/renderer/pages/TrackDetailPage.tsx` | Create | Track detail page component |
| `src/renderer/components/ArtistLink.tsx` | Create | Reusable clickable artist name |
| `src/renderer/components/TrackLink.tsx` | Create | Reusable clickable track name |
| `src/renderer/components/PlayTrendChart.tsx` | Create | Reusable play trend chart |
| `src/renderer/styles.css` | Modify | CSS for detail pages, link styles |
| `src/renderer/components/stats/TopList.tsx` | Modify | Wrap names in ArtistLink/TrackLink |
| `src/renderer/components/LastFmHistoryTab.tsx` | Modify | Wrap names in ArtistLink/TrackLink |
| `src/renderer/pages/HomePage.tsx` | Modify | Wrap monthly highlights in links |
| `src/renderer/pages/ReleaseDetailsPage.tsx` | Modify | Wrap artist name in ArtistLink |
| `src/renderer/components/AlbumCard.tsx` | Modify | Wrap artist name in ArtistLink |
| `tests/backend/routes/stats.test.ts` | Modify | Add tests for new endpoints |
| `tests/frontend/pages/ArtistDetailPage.test.tsx` | Create | Page component tests |
| `tests/frontend/pages/TrackDetailPage.test.tsx` | Create | Page component tests |
| `tests/frontend/components/ArtistLink.test.tsx` | Create | Link component tests |
| `tests/frontend/components/TrackLink.test.tsx` | Create | Link component tests |

---

## Decisions Table

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Full pages vs modals | Full pages (hash routes) | Consistent with ReleaseDetailsPage pattern; modals can't hold this much content; pages support browser back |
| Navigation mechanism | localStorage + hash change | Established pattern from ReleaseDetailsPage; simple and reliable |
| Sidebar entry | No new sidebar items | These are drill-down pages, not primary navigation; matches ReleaseDetailsPage precedent |
| Chart library | recharts (already installed) | Consistency with existing ListeningTimeline and other charts |
| Play trend granularity | Month default, week option | Monthly shows long-term trends well; weekly for recent detail |
| Artist name matching | Case-insensitive lowercase | Matches existing ScrobbleHistoryStorage normalization |
| Track matching across albums | Aggregate by default, filter by album param | Shows total engagement with a song across all album versions |
| Collection cross-reference | Compare against cached collection pages | Reuse the `loadCollection` helper pattern from existing stats routes |
| Image fetching | Reuse existing ImageService | Already handles caching, Last.fm and Discogs sources |
| External links | Last.fm profile + Discogs search | Most useful external context; both are free and don't require auth |
| Back navigation | Link to previous page (stored in localStorage) | Simple and reliable; `window.history.back()` as fallback |

---

## Test Checklist

### Backend Tests
- [ ] `GET /api/v1/stats/artist/:artistName` returns correct data shape
- [ ] Artist endpoint returns 404-like empty data for unknown artists
- [ ] Artist endpoint includes correct period counts
- [ ] Artist endpoint play trend has correct monthly buckets
- [ ] Artist endpoint cross-references collection correctly
- [ ] `GET /api/v1/stats/track` returns correct data shape
- [ ] Track endpoint requires artist and track query params (400 if missing)
- [ ] Track endpoint aggregates plays across multiple albums
- [ ] Track endpoint scopes to specific album when `album` param provided
- [ ] Track endpoint returns empty for unknown tracks

### Frontend Tests
- [ ] ArtistDetailPage renders artist name, total plays, image
- [ ] ArtistDetailPage shows play trend chart
- [ ] ArtistDetailPage lists top tracks
- [ ] ArtistDetailPage lists albums with "In Collection" badges
- [ ] ArtistDetailPage shows loading skeleton while fetching
- [ ] ArtistDetailPage handles missing/empty data gracefully
- [ ] TrackDetailPage renders track name, artist, total plays
- [ ] TrackDetailPage shows play history chart
- [ ] TrackDetailPage lists albums the track appears on
- [ ] TrackDetailPage handles missing data gracefully
- [ ] ArtistLink navigates to artist detail page on click
- [ ] ArtistLink stores artist name in localStorage
- [ ] TrackLink navigates to track detail page on click
- [ ] TrackLink stores track info in localStorage
- [ ] PlayTrendChart renders with data
- [ ] PlayTrendChart handles empty data

### Integration Tests
- [ ] Navigate from Stats TopList artist to ArtistDetailPage
- [ ] Navigate from ArtistDetailPage track to TrackDetailPage
- [ ] Navigate from TrackDetailPage artist link to ArtistDetailPage
- [ ] Navigate from History tab artist to ArtistDetailPage
- [ ] Back button returns to previous page

---

## Edge Cases

| Edge Case | Handling |
|-----------|----------|
| Artist with no scrobbles (navigated via collection) | Show "No listening data" state with collection albums only |
| Track name appears on 10+ album editions | Aggregate all plays; list each album in "Appears On" with per-album count |
| Artist name with special characters (e.g., "AC/DC", "Sunn O)))") | URL-encode for Last.fm links; localStorage handles any string |
| Artist name with Discogs disambiguation suffix (e.g., "Nirvana (2)") | Strip `(N)` suffix for display and Last.fm lookup using existing fuzzy normalization |
| Very prolific artist (100+ albums in history) | Paginate or limit albums shown; show "View All" link to History filtered by artist |
| Track with no album info (orphaned scrobbles) | Show as "Unknown Album" in appears-on list |
| Multiple artists with similar names (case variants) | Normalize to lowercase for matching; display first-seen casing |
| Rapid navigation between artists/tracks | Key-based remount in MainContent ensures fresh state each time |
| No internet connection (can't fetch images) | Graceful fallback placeholders (existing pattern from TopList) |
| Artist in collection but never scrobbled | Show collection albums with 0 plays; hide trend chart if no data |
