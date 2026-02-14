# Consolidation Data Review

## 1. Shared Data Dependencies

### Marketplace Hub (Wishlist + New Releases + Local Sellers + Seller Matches + Missing Albums)

| Data Entity | Used By Tabs | API Source |
|---|---|---|
| **Wishlist items** (`EnrichedWishlistItem[]`) | Wishlist, Local Sellers (dependency check), Missing Albums (Discogs wishlist badge), Seller Matches (matches are against wishlist) | `api.getWishlist()` |
| **Local want list** (`LocalWantItem[]`) | Wishlist (monitoring tab + merge toggle), Local Sellers (dependency check), Missing Albums (added-to-want-list state) | `api.getLocalWantList()` |
| **Play counts** (`AlbumPlayCountResult`) | Wishlist (scrobbles sort), Seller Matches (play count display) | `api.getAlbumPlayCounts()` |
| **Sellers** (`MonitoredSeller[]`) | Local Sellers (seller list), Seller Matches (seller display names, filter dropdown) | `api.getSellers()` |
| **Seller scan status** (`SellerScanStatus`) | Local Sellers (progress bar, polling) | `api.getSellerScanStatus()` |
| **Seller matches** (`SellerMatch[]`) | Seller Matches (main list), Local Sellers (match count badges on seller cards) | `api.getSellerMatches()`, `api.getSellerMatchesWithCacheInfo()` |
| **Missing albums** (`MissingAlbum[]`) | Missing Albums tab | `api.getMissingAlbums()` |
| **Collection items** | Missing Albums (mapping modal search) | `api.searchCollection()` |

**Key cross-tab dependencies:**
1. **Wishlist <-> Local Sellers**: SellersPage calls `api.getWishlist()` + `api.getLocalWantList()` to check if wishlist is empty (prerequisite for seller scanning). This is a **duplicated call** -- if both are on the same page, wishlist data can be shared.
2. **Wishlist <-> Missing Albums**: DiscoveryPage calls `api.getWishlist()` to show "Already on Wishlist" badges on missing albums. Another **duplicated call**.
3. **Wishlist <-> Seller Matches**: Seller matches are found by comparing seller inventory against wishlist items. The match `artist`/`title` fields correspond to wishlist items.
4. **Local Want List is central**: Used by Wishlist (monitoring tab), Local Sellers (dependency), Missing Albums (add-to-want-list), and New Releases tab (new release source filter).

### What to Play (Play Suggestions + Forgotten Favorites + Dusty Corners)

| Data Entity | Used By Tabs | API Source |
|---|---|---|
| **Suggestions** (`SuggestionResult[]`) | Play Suggestions | `api.getSuggestions()` |
| **Suggestion settings** (`SuggestionSettings`) | Play Suggestions (weights panel) | `api.getSuggestionSettings()`, `api.getSuggestionDefaults()` |
| **AI status** | Play Suggestions (AI pick section) | `api.getAIStatus()` |
| **AI suggestion** | Play Suggestions | `api.getAISuggestion()` |
| **Forgotten tracks** (`ForgottenTrack[]`) | Forgotten Favorites | `api.getForgottenFavorites()` |
| **Dusty corner albums** (`DustyCornerAlbum[]`) | Dusty Corners | `statsApi.getDustyCorners()` |
| **History sync status** | Play Suggestions (SyncStatusBar) | `api.getHistorySyncStatus()` |

**Key cross-tab dependencies:**
1. **All three features depend on scrobble history being synced**. The SyncStatusBar currently appears on both SuggestionsPage and DiscoveryPage independently.
2. **Forgotten Favorites vs Dusty Corners**: These are conceptually similar but operate on different data:
   - Forgotten Favorites: tracks from Last.fm history with high play counts that haven't been played recently (any artist/album, not limited to collection)
   - Dusty Corners: albums from your Discogs collection that haven't been played recently
   - **No shared API data** between them -- they use completely different endpoints (`/stats/forgotten-favorites` vs `/stats/dusty-corners`)
3. **Play Suggestions are fully independent** from the other two -- no shared data at all.

---

## 2. API Call Optimization

### Marketplace Hub - Initial Load

**Current state (4 separate pages):**
- WishlistPage: `getWishlist()` + `getWishlistSyncStatus()` + `getWishlistSettings()` + `getLocalWantList()` + `getAlbumPlayCounts()` = **5 calls**
- SellersPage: `getSellers()` + `getSellerScanStatus()` + `getReleaseCacheStats()` + `getWishlist()` + `getLocalWantList()` = **5 calls** (2 duplicated)
- SellerMatchesPage: `getSellerMatchesWithCacheInfo()` + `getSellers()` + `getAlbumPlayCounts()` = **3 calls**
- NewReleasesPage: `getTrackedReleases()` + `getPendingDisambiguations()` + `getReleaseTrackingSyncStatus()` + `getHiddenReleases()` = **4 calls**
- DiscoveryPage (Missing Albums tab): `getMissingAlbums()` + `getMissingArtists()` + `getLocalWantList()` + `getWishlist()` = **4 calls** (2 duplicated)

**Total across all pages: ~21 calls, with 4 duplicated calls.**

**Recommended consolidated approach:**
- **Eager load on page mount (shared):** `getWishlist()` + `getLocalWantList()` = 2 calls (shared across Wishlist, Sellers, Missing Albums tabs)
- **Lazy load per tab activation:**
  - Wishlist tab: `getWishlistSyncStatus()` + `getWishlistSettings()` + `getAlbumPlayCounts(wishlistAlbums)` = 3 calls
  - New Releases tab: `getTrackedReleases()` + `getPendingDisambiguations()` + `getReleaseTrackingSyncStatus()` + `getHiddenReleases()` = 4 calls
  - Local Sellers tab: `getSellers()` + `getSellerScanStatus()` + `getReleaseCacheStats()` = 3 calls
  - Seller Matches tab: `getSellerMatchesWithCacheInfo()` + `getSellers()` + `getAlbumPlayCounts(matchAlbums)` = 3 calls (sellers can be shared with Local Sellers if both visited)
  - Missing Albums tab: `getMissingAlbums()` = 1 call (wishlist/localWant already loaded)

**Net result: 2 eager + 3-4 lazy per active tab. Eliminates 4 duplicated API calls.**

### What to Play - Initial Load

**Current state (3 separate locations):**
- SuggestionsPage: `getSuggestions()` + `getSuggestionSettings()` + `getSuggestionDefaults()` + `getAIStatus()` + (conditionally) `getAISuggestion()` = **4-5 calls**
- DiscoveryPage (Forgotten tab): `getForgottenFavorites()` = **1 call** (but parent page also loads missing albums/artists = 4 total)
- StatsPage (Dusty Corners): `getDustyCorners()` = **1 call** (bundled into Stats page mega-load of ~10 calls)

**Recommended consolidated approach:**
- **Eager load on page mount:** `getHistorySyncStatus()` = 1 call (shared SyncStatusBar for all tabs)
- **Lazy load per tab activation:**
  - Play Suggestions tab: `getSuggestions()` + `getSuggestionSettings()` + `getSuggestionDefaults()` + `getAIStatus()` = 4 calls
  - Forgotten Favorites tab: `getForgottenFavorites()` = 1 call
  - Dusty Corners tab: `statsApi.getDustyCorners()` = 1 call

**Net result: 1 eager + 1-4 lazy per active tab. Clean separation.**

---

## 3. Data Flow Between Tabs

### Marketplace Hub - Cross-Tab Data Effects

| Action in Tab | Affects Tab | Mechanism |
|---|---|---|
| **Wishlist sync completes** (Wishlist) | Seller Matches (new matches may appear), Local Sellers (dependency satisfied) | After sync, wishlist items change. Seller scanning now finds different matches. Recommend: invalidate seller matches cache, show "re-scan recommended" indicator |
| **Add to Local Want List** (Missing Albums) | Wishlist (monitoring tab count changes), New Releases (new source items) | Immediate: update shared `localWantItems` state. New releases tab should also refresh if already loaded. |
| **Remove from Local Want List** (Wishlist monitoring) | Missing Albums (item no longer shows as "wanted") | Immediate: update shared `localWantItems` state, refresh missing albums `addedToWantList` set |
| **Seller scan completes** (Local Sellers) | Seller Matches (new matches found) | Already handled via polling. In consolidated page: can update match count badge on tab directly |
| **Mark match as seen** (Seller Matches) | Local Sellers (match count badge may change) | Update shared sellers state or match counts |
| **New release detected** (New Releases) | Wishlist (potential new items to add) | Minimal cross-tab impact; new releases are informational |
| **Wishlist item added from New Releases** | Wishlist (new item appears) | Would need to invalidate/reload wishlist data |

**Recommendation:** Use a shared data context at the Marketplace Hub page level with `useReducer` or lifted state. Key shared state:
- `wishlistItems: EnrichedWishlistItem[]`
- `localWantItems: LocalWantItem[]`
- `sellers: MonitoredSeller[]` (shared between Local Sellers + Seller Matches)
- Mutation functions that update both local state and call APIs

### What to Play - Cross-Tab Data Effects

| Action in Tab | Affects Tab | Mechanism |
|---|---|---|
| **History sync completes** | All tabs (data refreshes) | Shared SyncStatusBar triggers reload callbacks on all tabs |
| **Dismiss suggestion** (Play Suggestions) | None | Self-contained |
| **Change forgotten favorites params** | None | Self-contained |

**Recommendation:** Minimal cross-tab interaction. Each tab is largely independent. The only shared concern is the SyncStatusBar and its "sync complete" callback, which should trigger refreshes for whichever tab is currently active.

---

## 4. State Sharing Opportunities

### Marketplace Hub - Lift to Parent

```typescript
// State to lift to MarketplaceHubPage parent component
interface MarketplaceHubState {
  // Shared data (loaded eagerly)
  wishlistItems: EnrichedWishlistItem[];
  localWantItems: LocalWantItem[];

  // Shared loading/error
  sharedDataLoading: boolean;
  sharedDataError: string | null;

  // Shared derived data
  wishlistEmpty: boolean; // sellers dependency check

  // Tab-specific data stays in tab components
}
```

**What to share:**
- `wishlistItems` -- used by Wishlist tab, Missing Albums (badges), Local Sellers (dependency)
- `localWantItems` -- used by Wishlist (monitoring), Missing Albums (add state), Local Sellers (dependency)
- `sellers` -- used by Local Sellers tab and Seller Matches tab
- Mutation helpers: `addToLocalWantList()`, `removeFromLocalWantList()` that update shared state

**What to keep tab-local:**
- `syncStatus` (each tab has its own sync: wishlist sync, seller scan, release tracking sync)
- `settings` (each tab has its own settings)
- Tab-specific filters, sort options, modal state
- `playCounts` -- could be shared between Wishlist and Seller Matches tabs, but the album sets differ so sharing adds complexity for minimal gain

### What to Play - Lift to Parent

```typescript
// State to lift to WhatToPlayPage parent component
interface WhatToPlayState {
  historySyncStatus: HistorySyncStatus | null;
  syncStatusLoading: boolean;
}
```

**What to share:** Just the history sync status (for the shared SyncStatusBar).

**What to keep tab-local:** Everything else. The three tabs are highly independent.

---

## 5. Loading Strategy

### Marketplace Hub

| Tab | Load Strategy | Rationale |
|---|---|---|
| **Wishlist** | **Eager** (default tab) | Primary entry point; wishlist data is shared with other tabs |
| **New Releases** | **Lazy** (on tab click) | Independent data; 4 API calls; users may not always visit |
| **Local Sellers** | **Lazy** (on tab click) | Needs sellers + scan status; can reuse shared wishlist data for dependency check |
| **Seller Matches** | **Lazy** (on tab click) | Needs matches + sellers; can reuse sellers if Local Sellers was visited |
| **Missing Albums** | **Lazy** (on tab click) | Can reuse shared wishlist/localWant data; only needs `getMissingAlbums()` |

**Special considerations:**
- **Tab badge counts**: The Wishlist tab currently shows counts for sub-tabs. Seller Matches should show an "unseen" badge count. New Releases shows a count badge. These could be loaded via lightweight count endpoints or calculated from already-loaded data. Currently, no count-only endpoints exist for seller matches.
- **Cache loaded data**: Once a tab's data is loaded, keep it in memory while the user navigates between tabs within the same page visit. Only invalidate on explicit actions (sync, scan, etc.).
- **Polling**: Wishlist sync polling, seller scan polling, and release tracking sync polling should only run when the relevant tab is active, or at minimum should be paused when the tab is not visible.

### What to Play

| Tab | Load Strategy | Rationale |
|---|---|---|
| **Play Suggestions** | **Eager** (default tab) | Primary entry point; relatively fast (5 suggestions) |
| **Forgotten Favorites** | **Lazy** (on tab click) | Can be slow (searches full history) |
| **Dusty Corners** | **Lazy** (on tab click) | Moderate speed; searches collection coverage |

---

## 6. Cache Considerations

### Already Cached (Backend)

| Data | Cache Location | TTL/Invalidation |
|---|---|---|
| Wishlist items | Backend file store | Invalidated on sync |
| Collection items | Backend file store | Invalidated on collection reload |
| Seller matches | Backend file store | Invalidated on new scan |
| Release cache (masters/releases) | Backend file store | Manual refresh, 30-day staleness |
| Scrobble history | Backend SQLite | Invalidated on history sync |
| Album play counts | Backend in-memory (mapping pipeline) | Recalculated per request, but the underlying data is cached |

### Frontend Caching Opportunities

| Data | Current Caching | Recommendation |
|---|---|---|
| `getWishlist()` | None (re-fetched per page visit) | **Cache in parent state** -- shared across Wishlist, Sellers, Missing Albums tabs. Invalidate only on wishlist sync complete. |
| `getLocalWantList()` | None | **Cache in parent state** -- shared across multiple tabs. Invalidate on add/remove. |
| `getSellers()` | None | **Cache in parent state** -- shared between Local Sellers + Seller Matches tabs. Invalidate on add/remove seller. |
| `getAlbumPlayCounts()` | Partial (WishlistPage caches in Map, SellerMatchesPage has separate Map) | **Consider unifying** into a single play count cache at the parent level. Adds complexity; may not be worth it if the backend response is fast. |
| `getDustyCorners()` | None | Keep as-is; loaded once per tab visit. |
| `getForgottenFavorites()` | None | Keep as-is; params can change (dormantDays, minPlays). |

### API Calls That Are NOT Cached (Always Fresh)

- Sync status endpoints (`getWishlistSyncStatus()`, `getSellerScanStatus()`, `getReleaseTrackingSyncStatus()`, `getNewReleaseSyncStatus()`) -- these MUST be fresh for polling to work correctly.
- `getAIStatus()`, `getAISuggestion()` -- real-time check against Ollama.

---

## 7. Backend Impact

### No Backend Changes Required

The consolidation is purely a frontend reorganization. All existing API endpoints remain the same, and no new endpoints are needed because:

1. **No new data aggregation needed**: Each tab's data is already served by existing endpoints.
2. **No batch endpoint needed**: The shared data (`getWishlist()` + `getLocalWantList()`) is already fast (file-based storage). Creating a combined "marketplace hub init" endpoint would add backend complexity for minimal gain.
3. **Sync/scan operations unchanged**: All sync/scan operations are triggered the same way and polled the same way.
4. **No URL routing changes needed on backend**: Frontend hash-based routing is independent.

### Optional Future Optimizations

- **Badge count endpoint**: A lightweight `GET /api/v1/marketplace/badge-counts` that returns unseen match count, new releases count, etc. in a single call. Useful for showing tab badges without loading full data.
- **Unified play counts**: The play count API (`POST /stats/album-play-counts`) could be called once with a combined list from both wishlist and matches, but this requires coordinating which tabs are loaded.

---

## 8. Type Dependencies

### Shared Types Used Across Marketplace Hub Tabs

```typescript
// From src/shared/types.ts -- used by multiple tabs

// Wishlist tab + Local Sellers tab + Missing Albums tab
EnrichedWishlistItem     // Wishlist items with vinyl status
LocalWantItem            // Locally monitored albums
WishlistSyncStatus       // Sync progress

// Wishlist tab + Seller Matches tab
AlbumIdentifier          // Input for play count API
AlbumPlayCountResult     // Play count results
AlbumPlayCountResponse   // Batch response wrapper

// Local Sellers tab + Seller Matches tab
MonitoredSeller          // Seller info
SellerMatch              // Match data
SellerMatchesResponse    // Matches with cache info
SellerScanStatus         // Scan progress

// New Releases tab (mostly self-contained)
TrackedRelease
ReleaseTrackingSyncStatus
ArtistDisambiguationStatus
HiddenRelease
MusicBrainzArtistMatch

// Missing Albums tab (from Discovery)
MissingAlbum
MissingArtist
CollectionItem           // For mapping modal search

// New Releases sub-tab (wishlist)
WishlistNewRelease
NewReleaseSyncStatus
WishlistSettings
ReleaseVersion
VinylStatus
```

### Shared Types Used Across What to Play Tabs

```typescript
// Play Suggestions tab
SuggestionResult
SuggestionSettings
SuggestionWeights
AISuggestion
CollectionItem           // Album in suggestion result

// Forgotten Favorites tab
ForgottenTrack

// Dusty Corners tab
DustyCornerAlbum

// Shared
SyncStatus               // History sync status (shared SyncStatusBar)
```

### Type Overlap Analysis

- **No conflicting types** between any tabs. All types are independently defined and used.
- **`CollectionItem`** is the most widely shared type (used in suggestions, missing albums mapping, and seller matching).
- **No new types needed** for consolidation. The parent page components would only need to compose existing types.

### Utility Function Duplication

Several utility functions are duplicated across pages and should be consolidated:

| Function | Duplicated In | Recommendation |
|---|---|---|
| `formatPrice()` | SellersPage, SellerMatchesPage, WishlistPage | Extract to `src/renderer/utils/formatters.ts` |
| `formatRelativeTime()` | SellersPage, SellerMatchesPage, NewReleasesTab | Extract to `src/renderer/utils/formatters.ts` |
| `formatDate()` | WishlistPage, DiscoveryPage | Extract to `src/renderer/utils/formatters.ts` |
| `getPlayCountKey()` | WishlistPage, SellerMatchesPage | Extract to shared utility or parent component |
| `normalizeForComparison()` / `normalizeForMatching()` | WishlistPage, DiscoveryPage | Extract and unify (slightly different implementations) |

---

## Summary of Key Recommendations

### Marketplace Hub
1. **Lift `wishlistItems` + `localWantItems` to parent** -- eliminates 4 duplicated API calls
2. **Lazy-load tab-specific data** -- only load New Releases, Sellers, Matches, Missing Albums data when tab is activated
3. **Cache tab data in memory** -- once loaded, keep until explicit invalidation
4. **Pause polling when tab not active** -- reduce unnecessary network traffic
5. **Share `sellers` data between Local Sellers and Seller Matches tabs**
6. **Extract duplicated utility functions** to shared module

### What to Play
1. **Share only SyncStatusBar state** at parent level -- tabs are highly independent
2. **Lazy-load all tabs** with Play Suggestions as default/eager
3. **No backend changes needed** for either consolidation
4. **Dusty Corners uses `statsApi`** (different service) while others use main `api` -- this is fine, no unification needed
