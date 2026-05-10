# Plan: Album Detail Page (`#album`)

## Overview

Add a dedicated album detail page at `#album`, paralleling the existing `#artist` and `#track` detail pages. The page shows listening history, track-level stats, a listening arc chart, collection status with a link to `#release-details`, and any relevant mappings (album mappings, album aliases, compound artist attribution).

## Current State

- **`#artist` page** shows albums as non-clickable list items with play count, cover art, collection badge, Spotify link, and expandable listening arc.
- **`#track` page** shows an "Appears On" albums section — also non-clickable.
- **`#release-details`** is collection-focused (Discogs data, tracklist, scrobble button). Requires a collection item. Already shows artist mapping badge and play counts per track.
- **No `#album` route exists.** No `AlbumLink` component. No `getAlbumDetail()` backend endpoint.
- Backend already has all the raw data: `getAlbumHistoryFuzzy()`, `getAlbumTracksPlayed()`, `getAlbumListeningArc()`, album mappings via `MappingService`, and collection matching.

## Part 1: Backend — `getAlbumDetail()` endpoint

### New route

**File: `src/backend/routes/stats.ts`**

```
GET /api/v1/stats/album-detail?artist=X&album=Y
```

Parameters:
- `artist` (string, required) — artist name as displayed
- `album` (string, required) — album title as displayed

### New service method

**File: `src/backend/services/statsService.ts`**

```typescript
async getAlbumDetail(
  artistName: string,
  albumName: string,
  collection?: DiscogsCollectionItem[]
): Promise<AlbumDetailResponse>
```

Assembles data from existing methods:

1. **Play history** — call `historyStorage.getAlbumHistoryFuzzy(artist, album)` to get all plays with track names, play count, last played, match type. Also check via artist name resolver (if "Danny Brown" is queried, also check "danny brown (2)" keys).

2. **Track breakdown** — parse the plays array to build per-track stats:
   ```typescript
   tracks: Array<{
     track: string;
     playCount: number;
     lastPlayed: number;
   }>
   ```
   Normalize track names for dedup (reuse `normalizeForMatching()` pattern from ReleaseDetailsPage).

3. **Listening arc** — call `getAlbumListeningArc(artist, album)` to get monthly buckets.

4. **Collection match** — search the user's collection for a matching release:
   - Check `mappingService.getAlbumMapping(artist, album)` for an explicit mapping → get `collectionId`
   - If no mapping, fuzzy-match against collection items by artist+album
   - Return `collectionReleaseId`, `collectionArtist`, `collectionAlbum`, `coverUrl` if found

5. **Mappings** — gather all relevant mappings for display:
   - **Album mapping**: if an album mapping exists (`historyArtist|historyAlbum` → `collectionArtist|collectionAlbum`), include it
   - **Artist mapping**: if the artist has a name mapping (e.g. Discogs disambiguation → Last.fm name), include it
   - **Compound artist**: if the artist is a compound name, include the decomposition info
   - **Album aliases**: (future, from album-name-aliasing-plan) if aliases exist, include them

6. **First played** — `Math.min()` across all play timestamps.

7. **Artist canonical name** — resolve through `artistNameResolver` for consistent display and for linking to `#artist`.

### Response type

**File: `src/shared/types.ts`**

```typescript
export interface AlbumDetailResponse {
  artist: string;              // Display name (resolved)
  album: string;               // Album title as queried
  playCount: number;
  firstPlayed: number | null;  // Unix timestamp (seconds)
  lastPlayed: number | null;
  tracks: Array<{
    track: string;
    playCount: number;
    lastPlayed: number;
  }>;
  arc: AlbumArcBucket[];       // Monthly listening pattern
  // Collection info
  inCollection: boolean;
  collectionReleaseId?: number;
  collectionArtist?: string;   // Discogs name (may differ from display)
  collectionAlbum?: string;
  coverUrl?: string;
  // Mappings
  mappings: {
    albumMapping?: {
      historyArtist: string;
      historyAlbum: string;
      collectionArtist: string;
      collectionAlbum: string;
    };
    artistMapping?: {
      discogsName: string;
      lastfmName: string;
    };
    compoundArtist?: {
      compoundName: string;
      components: string[];
    };
  };
}
```

## Part 2: Frontend — `AlbumLink` component

**New file: `src/renderer/components/AlbumLink.tsx`**

Follows `ArtistLink` / `TrackLink` pattern:

```typescript
interface AlbumLinkProps {
  artist: string;
  album: string;
  className?: string;
  children?: React.ReactNode;
}
```

On click:
1. Store `{ artist, album }` as JSON in `localStorage.setItem('selectedAlbum', ...)`
2. Navigate to `ROUTES.ALBUM_DETAIL` with `{ from: currentPage }`

Use this component to make albums clickable on:
- `#artist` page — album list
- `#track` page — "Appears On" albums
- `#history` page — album entries in the history table
- Top albums lists on `#stats` / `#home`

## Part 3: Frontend — `AlbumDetailPage.tsx`

**New file: `src/renderer/pages/AlbumDetailPage.tsx`**
**New file: `src/renderer/pages/AlbumDetailPage.page.css`**

### Layout

Following the existing artist/track detail page patterns:

```
┌─────────────────────────────────────────────────┐
│ ← Back to [from page]                          │
├─────────────────────────────────────────────────┤
│ [Cover]  Album Title                            │
│  80x80   Artist Name (→ ArtistLink)             │
│          123 scrobbles · First: Jan 2020        │
│          Last played: 2 days ago                │
│                                                 │
│          [♫ Spotify]  [↗ Last.fm]               │
│          [📀 View in Collection]  (if in coll.) │
├─────────────────────────────────────────────────┤
│ Listening Arc                                   │
│ ┌─────────────────────────────────────────────┐ │
│ │  ▄▄  █▄  ▄█▄   (monthly area chart)        │ │
│ └─────────────────────────────────────────────┘ │
├──────────────────────┬──────────────────────────┤
│ Tracks               │ Mappings & Info          │
│                      │                          │
│ 1. Track A    42x    │ Album Mapping:           │
│ 2. Track B    38x    │  "old" (Last.fm) →       │
│ 3. Track C    21x    │  "Old" (Discogs)         │
│ ...                  │                          │
│                      │ Artist:                  │
│ (each track is a     │  "Danny Brown (2)" →     │
│  TrackLink)          │  "Danny Brown"           │
│                      │                          │
│                      │ In Collection:           │
│                      │  → View Release Details  │
└──────────────────────┴──────────────────────────┘
```

### Sections

**Header:**
- Cover image (from collection match or placeholder)
- Album title (h1)
- Artist name as `ArtistLink` (clickable, navigates to `#artist`)
- Total scrobble count, first played date, last played date
- External links: Spotify search, Last.fm search
- "View in Collection" button → navigates to `#release-details` if `collectionReleaseId` exists

**Listening Arc:**
- Reuse existing `AlbumListeningArc` component (already built, used on artist page)
- Show full-width instead of the collapsed inline version

**Tracks (left column):**
- Sorted by play count descending
- Each track rendered as `TrackLink` (clickable → `#track` page)
- Show play count and last played per track

**Mappings & Info (right column):**
- **Album mapping** card: if a mapping exists, show `historyArtist|historyAlbum → collectionArtist|collectionAlbum` with an explanation like "This Last.fm album is mapped to a different name in your Discogs collection"
- **Artist mapping** card: if the artist has a name mapping, show the Discogs → Last.fm relationship
- **Compound artist** card: if the queried artist is a compound, show the decomposition (e.g. "Danny Brown (2), Jane Remover → Danny Brown + Jane Remover") with links to each component artist
- **Collection link** card: if in collection, show cover + "View Release Details" link to `#release-details`. If not, show "Not in your collection"
- **Album aliases** card (future): if aliases exist from album-name-aliasing, show them

### State management

```typescript
const [data, setData] = useState<AlbumDetailResponse | null>(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
```

On mount:
1. Read `localStorage.getItem('selectedAlbum')` → parse `{ artist, album }`
2. Read `from` query param for back navigation
3. Fetch `api.getAlbumDetail(artist, album)`
4. Render

### CSS

**File: `src/renderer/pages/AlbumDetailPage.page.css`**

Reuse existing detail page class patterns (`.detail-page-header`, `.detail-page-content-grid`, etc.) from `ArtistDetailPage.page.css`. Add album-specific classes:
- `.album-detail-mapping-card` — card styling for each mapping display
- `.album-detail-tracks` — track list with play counts
- `.album-detail-collection-link` — styled link to release details

## Part 4: Route registration

**File: `src/renderer/routes.ts`**

Add `ALBUM_DETAIL: 'album'` to `ROUTES`.

**File: `src/renderer/App.tsx`**

Add case for `ROUTES.ALBUM_DETAIL` → render `<AlbumDetailPage />`.

## Part 5: Wire `AlbumLink` into existing pages

**File: `src/renderer/pages/ArtistDetailPage.tsx`** (lines 374-448)

Wrap album names in `<AlbumLink artist={data.artist} album={album.album}>`. The album entries already have `collectionReleaseId` available but the album page will handle that link itself.

**File: `src/renderer/pages/TrackDetailPage.tsx`** (lines 273-313)

Wrap album names in the "Appears On" section with `<AlbumLink>`.

**Other pages (lower priority, can be done incrementally):**
- `src/renderer/components/LastFmHistoryTab.tsx` — album column in history table
- `src/renderer/pages/StatsPage.tsx` — top albums list
- `src/renderer/pages/HomePage.tsx` — recent/top album cards

## Part 6: Frontend API method

**File: `src/renderer/services/api.ts`**

```typescript
async getAlbumDetail(
  artist: string,
  album: string
): Promise<AlbumDetailResponse> {
  const params = new URLSearchParams({ artist, album });
  const response = await this.fetchApi(`/stats/album-detail?${params}`);
  return response.data;
}
```

## Files modified

| File | Change |
|------|--------|
| `src/shared/types.ts` | Add `AlbumDetailResponse` type |
| `src/backend/services/statsService.ts` | Add `getAlbumDetail()` method |
| `src/backend/routes/stats.ts` | Add `GET /album-detail` endpoint |
| `src/renderer/routes.ts` | Add `ALBUM_DETAIL` route |
| `src/renderer/App.tsx` | Add album detail page case |
| `src/renderer/services/api.ts` | Add `getAlbumDetail()` method |
| `src/renderer/pages/ArtistDetailPage.tsx` | Wrap albums in `AlbumLink` |
| `src/renderer/pages/TrackDetailPage.tsx` | Wrap albums in `AlbumLink` |

## New files

| File | Purpose |
|------|---------|
| `src/renderer/pages/AlbumDetailPage.tsx` | Album detail page component |
| `src/renderer/pages/AlbumDetailPage.page.css` | Page-specific styles |
| `src/renderer/components/AlbumLink.tsx` | Clickable album name component |
| `tests/backend/routes/albumDetail.test.ts` | Backend route tests |
| `tests/frontend/pages/AlbumDetailPage.test.tsx` | Frontend component tests |

## Verification

1. `tsc --noEmit` — type-check passes
2. `npm test` — all existing + new tests pass
3. Navigate to `#artist?` page, click an album → goes to `#album` page with correct data
4. On `#album` page: listening arc renders, tracks are clickable TrackLinks, artist is clickable ArtistLink
5. If album is in collection: "View in Collection" link navigates to `#release-details`
6. Mappings section shows relevant album/artist/compound mappings
7. Back button returns to originating page
