# Cross-Feature Data Enrichment - Implementation Plan

## Overview

Surface play count data, collection ownership badges, and cross-references throughout the app so that every page benefits from the rich data layer already built. Currently, play counts and collection status are siloed -- you can see play counts on the Stats page and collection items on the Collection page, but they never appear together. This feature bridges that gap by adding contextual play data to Collection, Wishlist, Seller Matches, and Discovery, and adding "In Collection" badges to Stats top lists.

---

## Value Proposition

**For the collector:** See at a glance which records in your collection get the most play, which wishlist items you already listen to heavily, and which forgotten favorites you actually own on vinyl.

**For the listener:** Top artist/album lists gain context -- "I own 3 of my top 10 albums on vinyl" -- turning stats from passive viewing into actionable insight (play that dusty record!).

**For the buyer:** Seller match cards and wishlist cards showing play counts help prioritize purchases -- buy the album you already love, not the one you've never heard.

---

## Data Source Analysis

### What Exists Today

| Data | Source | Access Method |
|------|--------|---------------|
| Album play counts (fuzzy) | `ScrobbleHistoryStorage` | `getAlbumHistoryFuzzy(artist, album)` |
| Batch play counts | `POST /api/v1/stats/album-play-counts` | Fuzzy matching, returns `{playCount, lastPlayed, matchType}` per album |
| Collection items | Discogs cache files | `collections/{username}-page-{n}.json` loaded by stats routes |
| Top artists/albums/tracks | `StatsService` | `getTopArtists()`, `getTopAlbums()`, `getTopTracks()` |
| Wishlist items | `WishlistService` | `getWishlistItems()` returns `EnrichedWishlistItem[]` |
| Seller matches | `SellerMonitoringService` | `getAllMatches()` returns `SellerMatch[]` |
| Forgotten favorites | `StatsService` | `getForgottenFavorites()` returns `ForgottenTrack[]` |
| Album tracklist | `DiscogsRelease.tracklist` | `Track[]` with position, title, duration |
| Scrobble history index | `ScrobbleHistoryStorage` | `getIndex()` returns full `ScrobbleHistoryIndex` with per-album `plays[]` including track names |

### What's Missing (Gaps to Fill)

| Gap | Description | Solution |
|-----|-------------|----------|
| Play counts on AlbumCard | Collection view shows no play data | Use existing batch endpoint `POST /api/v1/stats/album-play-counts` (already used by Collection for "Scrobbles" sort) |
| Last-played on AlbumCard | No recency indicator | Already returned by batch endpoint (`lastPlayed` field) |
| "In Collection" on top lists | Stats top lists don't indicate ownership | Cross-reference top list results against loaded collection on the frontend |
| Play counts on wishlist cards | Already partially implemented (Feature 8 sort) but not displayed prominently | Play count data already fetched when "Scrobbles" sort selected; show it always |
| Play counts on seller match cards | MatchCard has no play data | Fetch batch play counts for visible matches |
| "You own this" on forgotten favorites | ForgottenFavoritesTab has no collection awareness | Cross-reference forgotten tracks against collection using fuzzy matching |
| Album completeness | "8/12 tracks played" per album | Compare scrobbled track names against `DiscogsRelease.tracklist` |
| History -> collection link | Scrobble history doesn't link back to collection | Match history album/artist against collection items |

### Mapping Considerations

Per `dev_prompt.md`, the app has several mapping layers:
- **Artist mappings** (`artistMappingService.ts`): Discogs artist <-> Last.fm artist
- **Album mappings** (`mappingService.ts`): History album <-> Collection item
- **Track normalization** (`trackNormalization.ts`): Fuzzy matching across naming differences

All enrichment must use `getAlbumHistoryFuzzy()` (which handles Discogs disambiguation numbers, edition suffixes, etc.) rather than exact matching. The existing batch endpoint already does this.

---

## Detailed UI Mockups

### 1. AlbumCard with Play Count + Last Played (Collection View)

Current AlbumCard:
```
┌─────────────────────┐
│     [cover art]      │
│                      │
│  Album Title         │
│  Artist Name         │
│  2023                │
│  Vinyl, LP, Album    │
│  Label Name          │
│                      │
│  [Select] [Details]  │
└─────────────────────┘
```

Enhanced AlbumCard:
```
┌─────────────────────┐
│     [cover art]      │
│           ┌────────┐ │
│           │47 plays│ │  <-- play count badge (top-right of cover)
│           └────────┘ │
│  Album Title         │
│  Artist Name         │
│  2023                │
│  Vinyl, LP, Album    │
│  Label Name          │
│  Last played 3d ago  │  <-- relative time since last play
│  8/12 tracks played  │  <-- track completeness (if tracklist available)
│                      │
│  [Select] [Details]  │
└─────────────────────┘
```

**Notes:**
- Play count badge uses CSS class `.album-play-count-badge` (positioned absolute over cover)
- "Last played" uses relative time formatting (e.g., "3d ago", "2 months ago", "Never")
- Track completeness only shown when album has tracklist data and at least 1 play
- Albums with 0 plays show no badge (keeps UI clean)
- Badge styling: small pill, semi-transparent dark background for readability over cover art

### 2. Stats Top Lists with "In Collection" Badge

Current top album list item:
```
┌─────────────────────────────────────────────────────┐
│ 1. [cover] Radiohead - OK Computer        47 plays  │
│ 2. [cover] Pink Floyd - DSOTM             32 plays  │
│ 3. [cover] Boards of Canada - MHTRTC      28 plays  │
└─────────────────────────────────────────────────────┘
```

Enhanced:
```
┌─────────────────────────────────────────────────────┐
│ 1. [cover] Radiohead - OK Computer  [OWNED] 47 plays│
│ 2. [cover] Pink Floyd - DSOTM              32 plays │
│ 3. [cover] Boards of Canada - MHTRTC [OWNED]28 plays│
└─────────────────────────────────────────────────────┘
```

For top artists:
```
┌─────────────────────────────────────────────────────┐
│ 1. (img) Radiohead           [3 owned]   142 plays  │
│ 2. (img) Pink Floyd          [5 owned]    87 plays  │
│ 3. (img) Boards of Canada                 65 plays  │
└─────────────────────────────────────────────────────┘
```

**Notes:**
- Album badge: `[OWNED]` pill badge (reuse existing `Badge` component with `success` variant)
- Artist badge: `[N owned]` showing count of albums by that artist in collection
- Badges only shown when collection is loaded; graceful degradation if no Discogs auth

### 3. Wishlist Cards with Prominent Play Counts

Current WishlistItemCard:
```
┌─────────────────────┐
│  [cover image]       │
│  [VINYL AVAILABLE]   │
│                      │
│  Album Title         │
│  Artist Name         │
│  2023                │
│  Added: Jan 15, 2025 │
│  From: $28.00        │
│  47 plays            │  <-- only shown when "Scrobbles" sort selected
│                      │
│  [Versions] [Market] │
└─────────────────────┘
```

Enhanced (always show play data):
```
┌─────────────────────┐
│  [cover image]       │
│  [VINYL AVAILABLE]   │
│           ┌────────┐ │
│           │47 plays│ │  <-- always visible play count badge
│           └────────┘ │
│  Album Title         │
│  Artist Name         │
│  2023                │
│  Added: Jan 15, 2025 │
│  From: $28.00        │
│  Last played 3d ago  │  <-- when available
│                      │
│  [Versions] [Market] │
└─────────────────────┘
```

**Notes:**
- Play count badge always visible (not just when sorting by scrobbles)
- Play counts fetched eagerly on page load (not lazy like current implementation)
- Zero-play albums show nothing (no "0 plays" clutter)
- Last played shown as secondary line when data available

### 4. Seller Match Cards with Play Counts

Current MatchCard:
```
┌─────────────────────────────────────────────┐
│ [cover] Radiohead - OK Computer              │
│         LP, VG+ · $28.00                     │
│         Amoeba Music · Found 2 days ago      │
│         [View on Discogs]    [Mark as Seen]  │
└─────────────────────────────────────────────┘
```

Enhanced:
```
┌─────────────────────────────────────────────┐
│ [cover] Radiohead - OK Computer   [47 plays] │
│         LP, VG+ · $28.00                     │
│         Amoeba Music · Found 2 days ago      │
│         Last listened: 3 days ago            │
│         [View on Discogs]    [Mark as Seen]  │
└─────────────────────────────────────────────┘
```

**Notes:**
- Play count badge inline with title
- "Last listened" line helps prioritize: "I listen to this all the time, I should buy the vinyl"
- Zero-play items show "Never listened" to help identify blind purchases from wishlist

### 5. Forgotten Favorites "You Own This" Indicator

Current Forgotten Favorites item:
```
┌──────────────────────────────────────────────────┐
│  Artist - Track                                   │
│  Album Name                                       │
│  47 plays · Last played 8 months ago              │
│  [Copy] [Last.fm]                                 │
└──────────────────────────────────────────────────┘
```

Enhanced:
```
┌──────────────────────────────────────────────────┐
│  Artist - Track                      [IN COLLECTION]│
│  Album Name                                       │
│  47 plays · Last played 8 months ago              │
│  You own this on vinyl! Put it on the turntable.  │
│  [Copy] [Last.fm] [Go to Album]                   │
└──────────────────────────────────────────────────┘
```

**Notes:**
- `[IN COLLECTION]` badge when the track's album matches a collection item
- Motivational text: "You own this on vinyl! Put it on the turntable."
- `[Go to Album]` button navigates to collection item's release details page
- Collection matching uses `trackNormalization.ts` for fuzzy artist/album name comparison

### 6. Scrobble History Links to Collection

In the Last.fm History tab (`LastFmHistoryTab.tsx`), album entries could link to collection:
```
┌──────────────────────────────────────────────────┐
│  Radiohead - OK Computer        [IN COLLECTION]   │
│  Airbag · 3:44                                    │
│  Scrobbled: Jan 15, 2026 at 8:32 PM              │
│  [View in Collection]                             │
└──────────────────────────────────────────────────┘
```

**Notes:**
- `[IN COLLECTION]` badge appears when album matches a collection item
- `[View in Collection]` navigates to the release details page

### 7. Album Completeness Indicator

On the collection AlbumCard (when expanded/detailed view):
```
  Track Completeness: 8/12 played
  ████████░░░░  67%

  Unplayed tracks:
  · Track 5 - Subterranean Homesick Alien
  · Track 8 - Electioneering
  · Track 10 - No Surprises
  · Track 12 - The Tourist
```

**Notes:**
- Shown in release details view (not the grid card -- too much info)
- Compares `DiscogsRelease.tracklist[].title` against scrobbled track names from `AlbumHistoryEntry.plays[].track`
- Uses `trackNormalization.ts` for fuzzy track name matching
- Progress bar uses existing `.progress-bar` CSS class

---

## Data Model / Type Changes

### New Types

```typescript
// src/shared/types.ts

/**
 * Enriched play data for a single album, used for collection/wishlist/match enrichment
 */
export interface AlbumPlayData {
  playCount: number;
  lastPlayed: number | null;   // Unix timestamp (seconds) or null if never played
  matchType: 'exact' | 'fuzzy' | 'none';
  tracksPlayed?: number;       // Number of unique tracks scrobbled
  totalTracks?: number;        // Total tracks on album (from Discogs tracklist)
}

/**
 * Collection ownership info for cross-referencing
 */
export interface CollectionOwnership {
  inCollection: boolean;
  collectionItemId?: number;   // For navigation to release details
  releaseId?: number;
}
```

### Existing Types Already Sufficient

- `AlbumPlayCountResult` (from Feature 8) already has `playCount`, `lastPlayed`, `matchType` -- reuse for batch lookups
- `AlbumPlayCountRequest` / `AlbumPlayCountResponse` for the batch endpoint
- `CollectionItem` has all the data needed for ownership checks

No changes needed to existing types -- the new `AlbumPlayData` is an optional extension for the completeness indicator.

---

## Backend Changes

### No New Endpoints Needed

The existing `POST /api/v1/stats/album-play-counts` endpoint is the backbone for all enrichment. It already:
- Accepts a batch of `{artist, title}` pairs
- Returns `{playCount, lastPlayed, matchType}` per album
- Uses fuzzy matching via `getAlbumHistoryFuzzy()`
- Handles naming differences between Discogs and Last.fm

### New Endpoint: Track Completeness

**`GET /api/v1/stats/album-tracks-played?artist=X&album=Y`**

Returns which tracks from an album have been scrobbled:

```typescript
// Response
{
  success: true,
  data: {
    artist: string;
    album: string;
    tracksPlayed: string[];     // Track names that have been scrobbled
    totalScrobbledTracks: number;
    // Note: total track count comes from Discogs tracklist on the frontend
  }
}
```

**Implementation in `stats.ts` route:**
```typescript
router.get('/album-tracks-played', async (req, res) => {
  const artist = req.query.artist as string;
  const album = req.query.album as string;
  // Use historyStorage.getAlbumHistoryFuzzy() to get all plays
  // Extract unique track names from plays[]
  // Return deduplicated list
});
```

**StatsService method:**
```typescript
async getAlbumTracksPlayed(artist: string, album: string): Promise<string[]> {
  const result = await this.historyStorage.getAlbumHistoryFuzzy(artist, album);
  if (!result.entry) return [];
  const tracks = new Set<string>();
  for (const play of result.entry.plays) {
    if (play.track) tracks.add(play.track);
  }
  return Array.from(tracks);
}
```

This is the only new backend endpoint. Everything else is frontend cross-referencing.

**Note:** The frontend API client method for this endpoint should be added to `src/renderer/services/statsApi.ts` (not `api.ts`), consistent with how all stats-related API calls are organized in this codebase.

---

## Frontend Implementation Details

### Phase 1: Play Counts on AlbumCard (Collection View)

**Files Modified:**
- `src/renderer/components/AlbumCard.tsx`
- `src/renderer/pages/CollectionPage.tsx`
- `src/renderer/styles.css`

**Approach:**
- CollectionPage already fetches play counts when "Scrobbles" sort is selected (Feature 8)
- Change: fetch play counts eagerly on collection load (not just when sorting)
- Pass `playCount` and `lastPlayed` as optional props to `AlbumCard`
- AlbumCard renders badge overlay on cover when `playCount > 0`
- Add "Last played X ago" text below metadata

**AlbumCard props addition:**
```typescript
interface AlbumCardProps {
  // ... existing props
  playCount?: number;
  lastPlayed?: number | null;  // Unix seconds
}
```

**Collection page change:**
- Move play count fetching from "on sort change" to "on collection load"
- Already uses `POST /api/v1/stats/album-play-counts` batch endpoint
- Cache results in component state (already done for sorting)

### Phase 2: "In Collection" Badges on Stats Top Lists

**Files Modified:**
- `src/renderer/components/stats/TopList.tsx`
- `src/renderer/pages/StatsPage.tsx`
- `src/renderer/styles.css`

**Files Created:**
- `src/renderer/hooks/useCollectionLookup.ts` -- Reusable hook for fuzzy collection matching (also used by Phases 5, 6 and other features like Feature 13, 14, 15)

**Approach:**
- StatsPage loads collection (already done for some features -- reuse `loadCollection`)
- Extract fuzzy matching logic into a reusable `useCollectionLookup` hook that builds a `Map<normalizedKey, CollectionItem>` from collection items using `trackNormalization.ts`. This hook encapsulates the collection loading, normalization, and lookup so it can be shared across features.
- Pass collection map to `TopList` component
- TopList renders `[OWNED]` badge next to album names that match collection
- For artists, count albums owned by that artist and show `[N owned]`

**TopList props addition:**
```typescript
interface TopListProps {
  // ... existing props
  collectionMap?: Map<string, CollectionItem>;  // For "In Collection" badges
  collectionArtistCounts?: Map<string, number>; // For "N owned" on artist lists
}
```

**Fuzzy matching approach for collection lookup:**
```typescript
// Build map using same normalization as ScrobbleHistoryStorage
const collectionMap = new Map<string, CollectionItem>();
for (const item of collection) {
  const key = `${item.release.artist.toLowerCase().trim()}|${item.release.title.toLowerCase().trim()}`;
  collectionMap.set(key, item);
}
```

### Phase 3: Play Counts on Wishlist Cards

**Files Modified:**
- `src/renderer/components/WishlistItemCard.tsx`
- `src/renderer/pages/WishlistPage.tsx`
- `src/renderer/styles.css`

**Approach:**
- WishlistPage already fetches play counts for "Scrobbles" sort (Feature 8)
- Change: fetch play counts eagerly on wishlist load (not lazy)
- Always pass `playCount` to `WishlistItemCard` and render badge when > 0
- Add `lastPlayed` display line

**Current state:** `WishlistItemCard` already has a `showPlayCounts` prop and `playCount` prop. Change is:
1. Always set `showPlayCounts={true}` (remove conditional)
2. Show play count as a badge on the cover image instead of text below
3. Add "Last played X ago" line

### Phase 4: Play Counts on Seller Match Cards

**Files Modified:**
- `src/renderer/components/MatchCard.tsx`
- `src/renderer/pages/SellerMatchesPage.tsx`
- `src/renderer/styles.css`

**Approach:**
- SellerMatchesPage fetches matches on load
- After matches load, batch-fetch play counts for all match albums via `POST /api/v1/stats/album-play-counts`
- Pass play count data to each `MatchCard`

**MatchCard props addition:**
```typescript
interface MatchCardProps {
  // ... existing props
  playCount?: number;
  lastPlayed?: number | null;
}
```

### Phase 5: Forgotten Favorites "You Own This"

**Files Modified:**
- `src/renderer/components/discovery/ForgottenFavoritesTab.tsx`
- `src/renderer/pages/DiscoveryPage.tsx`
- `src/renderer/styles.css`

**Approach:**
- DiscoveryPage already loads collection for Missing Albums tab
- Pass collection to `ForgottenFavoritesTab`
- ForgottenFavoritesTab uses the `useCollectionLookup` hook (extracted in Phase 2) for fuzzy collection matching
- For each forgotten track, check if its album is in collection
- Show "IN COLLECTION" badge and "Go to Album" button

**ForgottenFavoritesTab props addition:**
```typescript
interface ForgottenFavoritesTabProps {
  // ... existing props
  collection?: CollectionItem[];
}
```

### Phase 6: Scrobble History -> Collection Links

**Files Modified:**
- `src/renderer/components/LastFmHistoryTab.tsx`
- `src/renderer/styles.css`

**Approach:**
- LastFmHistoryTab already renders album/artist info for each scrobble entry
- Load collection once (from parent or own fetch)
- Use the `useCollectionLookup` hook (extracted in Phase 2) for fuzzy collection matching
- For each displayed album, check collection ownership
- Show `[IN COLLECTION]` badge and optional "View in Collection" link

### Phase 7: Album Track Completeness

**Files Modified:**
- `src/renderer/services/statsApi.ts` (add `getAlbumTracksPlayed()` API method -- all stats-related calls go in `statsApi.ts`, not `api.ts`)
- Release details view (wherever album details are shown)
- `src/renderer/styles.css`

**Approach:**
- Only shown in release details view (not grid cards)
- When viewing album details, fetch tracks played via new endpoint
- Compare against `DiscogsRelease.tracklist` to show "8/12 tracks played"
- Show progress bar and list of unplayed tracks

---

## Implementation Phases (Ordered by Impact)

### Phase 1: Play Counts on Collection AlbumCard (HIGH IMPACT)
- Affects the most-visited page in the app
- Data already available via existing batch endpoint
- Estimated complexity: Low
- **Done Criteria:** Play count badges visible on collection grid; zero-play albums show no badge; "Last played X ago" text renders below metadata

### Phase 2: "In Collection" Badges on Stats Top Lists (HIGH IMPACT)
- Adds actionable context to the stats dashboard
- Frontend-only change (cross-reference against collection)
- Estimated complexity: Low
- **Done Criteria:** "OWNED" badge on top album list items that match collection; "N owned" count on top artist list items; `useCollectionLookup` hook extracted and reusable

### Phase 3: Prominent Play Counts on Wishlist Cards (MEDIUM IMPACT)
- Helps prioritize purchases
- Mostly a UI change (data fetching already exists)
- Estimated complexity: Low
- **Done Criteria:** Play count badge always visible on wishlist cards (not just when sorting by scrobbles); "Last played X ago" shown when available

### Phase 4: Play Counts on Seller Match Cards (MEDIUM IMPACT)
- Helps prioritize local purchases
- New data fetching needed for matches page
- Estimated complexity: Low-Medium
- **Done Criteria:** Play count badge and "Last listened" line visible on match cards; zero-play items show "Never listened"

### Phase 5: Forgotten Favorites Collection Indicator (MEDIUM IMPACT)
- Bridges discovery and collection
- Requires collection fuzzy matching on frontend
- Estimated complexity: Medium
- **Done Criteria:** "IN COLLECTION" badge and "Go to Album" button visible on forgotten favorites that match collection items; uses shared `useCollectionLookup` hook

### Phase 6: Scrobble History Collection Links (LOW-MEDIUM IMPACT)
- Nice-to-have cross-reference
- Requires collection fuzzy matching
- Estimated complexity: Medium
- **Done Criteria:** "IN COLLECTION" badge and "View in Collection" link visible on history entries that match collection items; uses shared `useCollectionLookup` hook

### Phase 7: Album Track Completeness (LOW-MEDIUM IMPACT)
- Detailed feature for power users
- New backend endpoint needed
- Estimated complexity: Medium
- **Done Criteria:** "X/Y tracks played" with progress bar visible in release details view; unplayed tracks listed below; endpoint returns correct fuzzy-matched track data

---

## File Changes Summary

### New Files

- `src/renderer/hooks/useCollectionLookup.ts` -- Reusable hook for cross-feature fuzzy collection matching
- `tests/backend/routes/stats-album-tracks.test.ts` -- Tests for new track completeness endpoint

### Modified Files

| File | Change |
|------|--------|
| `src/shared/types.ts` | Add `AlbumPlayData`, `CollectionOwnership` types |
| `src/backend/services/statsService.ts` | Add `getAlbumTracksPlayed()` method |
| `src/backend/routes/stats.ts` | Add `GET /album-tracks-played` endpoint |
| `src/renderer/services/statsApi.ts` | Add `getAlbumTracksPlayed()` API method (all stats-related calls go in `statsApi.ts`) |
| `src/renderer/components/AlbumCard.tsx` | Add play count badge, last played, optional completeness |
| `src/renderer/pages/CollectionPage.tsx` | Eager play count fetching (move from lazy to eager) |
| `src/renderer/components/stats/TopList.tsx` | Add "In Collection" / "N owned" badges |
| `src/renderer/pages/StatsPage.tsx` | Load collection, pass to TopList |
| `src/renderer/components/WishlistItemCard.tsx` | Always show play count badge, add last played |
| `src/renderer/pages/WishlistPage.tsx` | Eager play count fetching |
| `src/renderer/components/MatchCard.tsx` | Add play count and last played display |
| `src/renderer/pages/SellerMatchesPage.tsx` | Fetch play counts for matches |
| `src/renderer/components/discovery/ForgottenFavoritesTab.tsx` | Add collection awareness, "You own this" badge |
| `src/renderer/pages/DiscoveryPage.tsx` | Pass collection to ForgottenFavoritesTab |
| `src/renderer/components/LastFmHistoryTab.tsx` | Add "In Collection" badges, "View in Collection" links |
| `src/renderer/styles.css` | New CSS classes for badges, play count overlays, completeness bar |

---

## Decisions Table

| Question | Decision | Rationale |
|----------|----------|-----------|
| Fetch play counts eagerly or lazily? | Eagerly on page load | The batch endpoint is fast (~50ms for 100 albums); avoids layout shift when data arrives late |
| Show "0 plays" on cards? | No -- hide badge for zero | Reduces visual noise; most users have many unplayed albums |
| Where to show track completeness? | Release details only | Too much data for grid cards; keep cards clean |
| How to handle no Discogs auth? | Graceful degradation -- no badges, no errors | Features should enhance, not block |
| How to match collection items to stats? | Frontend fuzzy matching using `toLowerCase().trim()` | Same normalization as `ScrobbleHistoryStorage.normalizeKey()`, fast enough for ~1000 items |
| New backend endpoint for completeness? | Yes -- `GET /album-tracks-played` | Keeps track-level logic server-side; reuses existing fuzzy matching |
| Badge component for "OWNED"? | Reuse existing `Badge` component from `src/renderer/components/ui/Badge.tsx` | Per dev_prompt.md: "check if UI components already exist" |
| Play count badge position? | Top-right of album cover, semi-transparent background | Consistent with discard pile badge positioning pattern |
| "In Collection" on artist top list? | Show "N owned" count | More useful than binary yes/no for artists |
| Link from forgotten favorites to collection? | Hash navigation: `#collection?release={releaseId}` | Follows existing hash-based routing pattern |

---

## Test Checklist

### Backend Tests

- [ ] `getAlbumTracksPlayed()` returns correct unique track list
- [ ] `getAlbumTracksPlayed()` handles album with no plays (empty array)
- [ ] `getAlbumTracksPlayed()` uses fuzzy matching (finds "Album (Deluxe)" for "Album")
- [ ] `GET /album-tracks-played` validates artist/album params
- [ ] `GET /album-tracks-played` returns 400 for missing params
- [ ] `GET /album-tracks-played` returns empty array for unknown album

### Frontend Tests

- [ ] AlbumCard renders play count badge when playCount > 0
- [ ] AlbumCard hides badge when playCount is 0 or undefined
- [ ] AlbumCard renders "Last played X ago" text
- [ ] TopList renders "OWNED" badge for albums in collection
- [ ] TopList renders "N owned" for artists with collection albums
- [ ] TopList renders without badges when no collection provided
- [ ] WishlistItemCard always shows play count badge
- [ ] MatchCard renders play count and last played
- [ ] ForgottenFavoritesTab shows "IN COLLECTION" badge for owned albums
- [ ] ForgottenFavoritesTab shows "Go to Album" button for owned items
- [ ] LastFmHistoryTab shows "IN COLLECTION" badge for owned albums
- [ ] Collection fuzzy matching handles common naming differences

---

## Edge Cases

| Case | Behavior |
|------|----------|
| No scrobble history synced | Play count features silently hidden (no badges, no errors) |
| No Discogs collection loaded | "In Collection" badges silently hidden |
| Album in collection but never played | No play count badge shown; track completeness shows "0/N played" |
| Duplicate albums in collection (different pressings) | Match any pressing; badge links to first match |
| Very large collection (1000+ items) | Batch endpoint handles up to ~500 per request; split into multiple batches if needed |
| Play count for a compilation album | Fuzzy matching may not find exact album; shows "none" matchType |
| Artist name mismatch (Discogs "The Beatles" vs Last.fm "Beatles") | fuzzyNormalizeKey strips common prefixes; existing mapping system covers edge cases |
| Tracklist missing from Discogs release | Skip completeness indicator entirely |
| Track names significantly different between Discogs and Last.fm | Use `trackNormalization.ts` for fuzzy track matching |
| User navigates away while play counts loading | React state update on unmounted component -- use AbortController/cleanup |
| Batch play count request partially fails | Show data for successful items; log warning for failures; don't block UI rendering for the items that succeeded |

---

## Performance Considerations

| Concern | Mitigation |
|---------|------------|
| Batch play count fetch on every page load | Endpoint is fast (~50ms for 100 albums); results cached in component state for session |
| Collection fuzzy matching for "In Collection" badges | Build Map once per page load; Map.get() is O(1) |
| Track completeness fetch per album detail view | Only fetched when user clicks into details; single album query is <10ms |
| Multiple pages all fetching play counts | Each page fetches only for its visible items; no global cache needed since pages don't share state |
| StatsPage loading collection for badges | Collection is already cached in files; loading ~1000 items from disk is <100ms |
| Memory pressure from collection data on multiple pages | Collection items are relatively small (~500 bytes each); 1000 items = ~500KB; acceptable |
| Stale state updates on unmounted components | All data-fetching hooks must use `AbortController` cleanup in their `useEffect` return. Cancel in-flight requests on unmount or navigation to prevent React state updates on unmounted components |

---

## Review Feedback Incorporated

The following changes were made based on review feedback:

1. **`useCollectionLookup` hook extracted** (frontend-dev): Cross-feature fuzzy collection matching logic extracted into `src/renderer/hooks/useCollectionLookup.ts` in Phase 2. Reused by Phases 5 and 6 (and available for Features 13-15).
2. **`statsApi.ts` for API methods** (frontend-dev): All new frontend API client methods go in `statsApi.ts`, not `api.ts`, consistent with existing codebase conventions.
3. **AbortController cleanup** (quality-expert): Added to Performance Considerations -- all data-fetching hooks must cancel in-flight requests on unmount.
4. **Done Criteria per phase** (quality-expert): Each phase now has explicit completion criteria.
5. **Batch partial failure handling** (quality-expert): Added edge case for partial batch play count failures -- show successful items, log warnings, don't block UI.
6. **Reuse existing UI components** (frontend-dev): Plan already references `Badge` component; collection matching uses `useCollectionLookup` hook pattern.

---

## Summary

Cross-Feature Data Enrichment bridges the data silos in RecordScrobbles by surfacing play count data and collection ownership throughout the app. The implementation is mostly frontend cross-referencing using existing backend endpoints, with only one small new endpoint for track completeness. The 7 phases are ordered by user impact, with the highest-value changes (collection play counts, stats ownership badges) requiring the least effort. All changes follow existing component patterns, use the established CSS class methodology, and degrade gracefully when data is unavailable.
