# Backend API Review: Feature Consolidation

## Overview

This document analyzes the backend API impact of two frontend consolidation efforts:
1. **Marketplace Hub**: Merging Wishlist + New Releases + Local Sellers + Seller Matches + Missing Albums into one tabbed page
2. **What to Play**: Merging Play Suggestions + Forgotten Favorites + Dusty Corners into one tabbed page

**TL;DR: This is a frontend-only refactor. No backend route changes are required.** All existing API endpoints remain as-is. The frontend simply calls the same endpoints from reorganized pages/components.

---

## 1. API Endpoint Inventory

### Marketplace Hub - Endpoints Used

#### Wishlist (`/api/v1/wishlist`) - 18 endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/wishlist` | Get all wishlist items |
| GET | `/wishlist/sync` | Get wishlist sync status |
| POST | `/wishlist/sync` | Trigger wishlist sync from Discogs |
| GET | `/wishlist/settings` | Get wishlist settings |
| POST | `/wishlist/settings` | Save wishlist settings |
| GET | `/wishlist/search` | Search Discogs for releases |
| POST | `/wishlist/add` | Add release to Discogs wantlist |
| DELETE | `/wishlist/remove/:releaseId` | Remove from Discogs wantlist |
| GET | `/wishlist/local` | Get local want list |
| POST | `/wishlist/local` | Add to local want list |
| DELETE | `/wishlist/local/:id` | Remove from local want list |
| POST | `/wishlist/local/check` | Check local want list for vinyl |
| GET | `/wishlist/new-releases` | Get detected new releases |
| GET | `/wishlist/new-releases/status` | Get new release check sync status |
| POST | `/wishlist/new-releases/check` | Trigger new release check |
| PATCH | `/wishlist/new-releases/:id/dismiss` | Dismiss a new release |
| POST | `/wishlist/new-releases/dismiss-bulk` | Bulk dismiss new releases |
| POST | `/wishlist/new-releases/dismiss-all` | Dismiss all new releases |
| POST | `/wishlist/new-releases/cleanup` | Clean up old dismissed releases |
| GET | `/wishlist/:masterId/versions` | Get master release versions |
| GET | `/wishlist/:releaseId/marketplace` | Get marketplace stats for release |

#### Sellers (`/api/v1/sellers`) - 12 endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/sellers` | List monitored sellers |
| POST | `/sellers` | Add a seller |
| DELETE | `/sellers/:username` | Remove a seller |
| GET | `/sellers/matches` | Get all seller matches |
| GET | `/sellers/:username/matches` | Get matches for specific seller |
| POST | `/sellers/scan` | Trigger seller inventory scan |
| GET | `/sellers/scan/status` | Get scan progress |
| POST | `/sellers/matches/:matchId/seen` | Mark match as seen |
| POST | `/sellers/matches/:matchId/notified` | Mark match as notified |
| POST | `/sellers/matches/:matchId/verify` | Verify listing still active |
| GET | `/sellers/settings` | Get seller monitoring settings |
| POST | `/sellers/settings` | Save seller monitoring settings |
| GET | `/sellers/cache/stats` | Get release cache statistics |
| POST | `/sellers/cache/refresh` | Refresh release cache |

#### New Releases / Release Tracking (`/api/v1/releases`) - 17 endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/releases` | Get tracked releases (filtered) |
| GET | `/releases/sync` | Get release tracking sync status |
| POST | `/releases/sync` | Trigger release sync |
| GET | `/releases/settings` | Get release tracking settings |
| POST | `/releases/settings` | Save release tracking settings |
| GET | `/releases/disambiguations` | Get pending disambiguations |
| POST | `/releases/disambiguations/:id/resolve` | Resolve disambiguation |
| POST | `/releases/disambiguations/:id/skip` | Skip disambiguation |
| GET | `/releases/mappings` | Get artist MBID mappings |
| POST | `/releases/mappings` | Add/update artist mapping |
| DELETE | `/releases/mappings/:artistName` | Remove artist mapping |
| GET | `/releases/search/artist` | Search MusicBrainz for artist |
| POST | `/releases/check-vinyl` | Check vinyl availability (all) |
| POST | `/releases/check-vinyl/:mbid` | Check vinyl for single release |
| POST | `/releases/fetch-covers` | Fetch missing cover art |
| POST | `/releases/:mbid/wishlist` | Add tracked release to wishlist |
| GET | `/releases/collection-artists` | Get collection artists |
| GET | `/releases/hidden` | Get hidden releases |
| POST | `/releases/hidden` | Hide a release |
| DELETE | `/releases/hidden/:mbid` | Unhide a release |
| GET | `/releases/excluded-artists` | Get excluded artists |
| POST | `/releases/excluded-artists` | Exclude an artist |
| DELETE | `/releases/excluded-artists/:artistName` | Include artist back |
| GET | `/releases/filters/counts` | Get filter counts |

#### Missing Albums / Discovery (`/api/v1/suggestions/discovery`) - 2 endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/suggestions/discovery/missing-albums` | Albums listened to but not in collection |
| GET | `/suggestions/discovery/missing-artists` | Artists listened to but not in collection |

### What to Play - Endpoints Used

#### Play Suggestions (`/api/v1/suggestions`) - 6 core endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/suggestions` | Get weighted album suggestions |
| POST | `/suggestions/dismiss` | Dismiss a suggestion |
| POST | `/suggestions/refresh` | Clear suggestion memory |
| GET | `/suggestions/settings` | Get suggestion weight settings |
| POST | `/suggestions/settings` | Save suggestion weight settings |
| GET | `/suggestions/settings/defaults` | Get default weights |
| GET | `/suggestions/analytics` | Get analytics summary |

#### AI Suggestions (`/api/v1/suggestions/ai`) - 6 endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/suggestions/ai/status` | Check Ollama connection |
| GET | `/suggestions/ai/models` | Get available models |
| GET | `/suggestions/ai/settings` | Get AI settings |
| POST | `/suggestions/ai/settings` | Save AI settings |
| POST | `/suggestions/ai/test` | Test Ollama connection |
| GET | `/suggestions/ai/suggestion` | Get AI-powered suggestion |

#### Forgotten Favorites (`/api/v1/stats`) - 1 endpoint
| Method | Path | Description |
|--------|------|-------------|
| GET | `/stats/forgotten-favorites` | Tracks with high plays but dormant recently |

#### Dusty Corners (`/api/v1/stats`) - 1 endpoint
| Method | Path | Description |
|--------|------|-------------|
| GET | `/stats/dusty-corners` | Collection albums not played in 6+ months |

---

## 2. Backend Changes Required

**None.** The consolidation is purely a frontend reorganization. All existing backend endpoints continue to serve the same data with the same contracts. The frontend will simply import and call these APIs from different page components.

Specifically:
- No new routes needed
- No route path changes
- No request/response format changes
- No new services or service modifications
- No database/storage schema changes

---

## 3. Batch Loading Endpoint Analysis

### What to Play: Batch endpoint would be beneficial (OPTIONAL)

A new `GET /api/v1/stats/what-to-play/init` endpoint could aggregate the initial data for all three tabs in a single round-trip:

```typescript
// Hypothetical response shape
{
  suggestions: SuggestionResult[],       // from suggestionService
  forgottenFavorites: ForgottenTrack[],  // from statsService
  dustyCorners: DustyCornerAlbum[],      // from statsService
}
```

**Pros:**
- Reduces 3 HTTP requests to 1 on page load
- The existing `/api/v1/stats/dashboard` endpoint already demonstrates this pattern (aggregates quickStats, quickActions, recentAlbums, monthlyTop in parallel with `Promise.allSettled`)
- All three data sources share the same backend services (`statsService`, `historyStorage`, `fileStorage`)

**Cons:**
- Each tab already loads independently and quickly
- Users typically view one tab at a time (lazy loading per-tab is fine)
- Adds a new endpoint to maintain
- The suggestions endpoint requires loading the full collection into memory, which is expensive if the user only wants dusty corners

**Recommendation:** Skip the batch endpoint for now. Use per-tab lazy loading instead. Each tab fetches its own data when activated. This is simpler, avoids unnecessary data fetching, and is already how the existing pages work. Revisit if users report slow tab switching.

### Marketplace Hub: Batch endpoint NOT recommended

The Marketplace Hub features have independent sync cycles (wishlist sync, seller scan, release sync) and very different data shapes. A batch endpoint would be complex and wasteful since:
- Users won't need all 5 sub-features' data simultaneously
- Sync operations are long-running (seller scans can take minutes)
- Each feature has its own settings and state management

**Recommendation:** Use per-tab lazy loading. Fetch each tab's data only when the user navigates to it.

---

## 4. Rate Limiting Considerations

### Current Configuration
- **Rate limit:** 300 requests per 15-minute window per IP (`src/server.ts:236-245`)
- **Applied to:** All `/api/` routes

### Marketplace Hub Impact
In the worst case, a user navigating the Marketplace Hub might trigger:
- Wishlist tab: 1 GET (wishlist items) + 1 GET (sync status) = 2 requests
- Sellers tab: 1 GET (sellers) + 1 GET (matches) + 1 GET (scan status) = 3 requests
- New Releases tab: 1 GET (releases) + 1 GET (sync status) = 2 requests
- Missing Albums tab: 1 GET (missing albums) = 1 request
- Plus settings loads: ~2-3 requests

**Total on full page exploration: ~10-12 requests** -- well within the 300/15min limit.

### Sync Storm Scenario
If a user triggers all syncs from the Marketplace Hub simultaneously:
- POST `/wishlist/sync` (can take minutes due to Discogs rate limiting)
- POST `/sellers/scan` (runs in background, returns immediately)
- POST `/releases/sync` (can take minutes)
- POST `/wishlist/new-releases/check` (runs in background, returns immediately)

These are 4 POST requests. The actual external API calls (Discogs, MusicBrainz) are rate-limited internally by their respective services, not by the Express rate limiter. **No concerns here.**

### What to Play Impact
- Suggestions: 1 GET
- Forgotten Favorites: 1 GET
- Dusty Corners: 1 GET
- Settings: 1 GET

**Total: ~4 requests.** No concerns.

### Recommendation
Current rate limiting is adequate. No changes needed.

---

## 5. Data Dependencies

### Shared Backend Services

The following services are shared between features being consolidated:

#### Marketplace Hub - Shared Dependencies
```
WishlistService
  --> used by: Wishlist tab, Seller Monitoring (for release cache updates after sync)
  --> used by: Release Tracking (addToWishlist integration)
  --> used by: Dashboard (wantListCount in quickActions)
  --> used by: Discard Pile (checking wishlist before discarding)

SellerMonitoringService
  --> used by: Sellers tab, Seller Matches tab
  --> used by: Dashboard (newSellerMatches in quickActions)
  --> depends on: WishlistService (for wishlist-based matching)

DiscogsService
  --> used by: Wishlist sync, Collection loading, Release tracking
  --> Discogs API rate limit is shared across all features

AuthService
  --> used by: All features (for Discogs username)
```

#### What to Play - Shared Dependencies
```
StatsService
  --> used by: Forgotten Favorites, Dusty Corners, Dashboard
  --> depends on: historyStorage, trackMappingService, mappingService

SuggestionService
  --> used by: Play Suggestions
  --> depends on: analyticsService, historyStorage

ScrobbleHistoryStorage
  --> used by: All three features (suggestions, forgotten favorites, dusty corners)
  --> This is the core data source for all "What to Play" features

AnalyticsService
  --> used by: Suggestions (analytics summary), Missing Albums/Artists
```

### Cross-Consolidation Dependencies
- `WishlistService` is used by both Marketplace Hub features AND the Dashboard
- `StatsService.getDustyCorners()` is used by both What to Play AND the Dashboard (`quickActions.dustyCornersCount`)
- `AnalyticsService.getMissingAlbums()` is used by both Marketplace Hub (Missing Albums tab) AND the Dashboard (`quickActions.missingAlbumsCount`)

**These cross-dependencies already exist and work correctly.** The consolidation does not change the dependency graph.

---

## 6. No-Op Changes (Backend aspects needing NO changes)

The following backend aspects are confirmed to need **zero changes**:

- **All route files** (`wishlist.ts`, `sellers.ts`, `releases.ts`, `suggestions.ts`, `stats.ts`) -- no modifications
- **All service files** -- no modifications
- **Server.ts route mounting** -- no changes to route prefixes or middleware
- **Rate limiting configuration** -- adequate for consolidated pages
- **CORS configuration** -- unchanged (same origin)
- **Request/response schemas** -- all types in `shared/types.ts` remain the same
- **File storage / data files** -- no schema changes
- **Authentication flow** -- unchanged
- **Error handling** -- unchanged
- **Logging** -- unchanged

---

## 7. Future Considerations

### Short-term (during consolidation)

1. **Frontend data caching strategy**: Since the consolidated pages will have multiple tabs sharing the same backend services, consider using React Query or SWR with shared cache keys. This prevents redundant fetches when switching between tabs (e.g., both Suggestions and Dusty Corners need the collection data).

2. **Loading state coordination**: When the Marketplace Hub page loads, avoid showing spinners on all tabs simultaneously. Only fetch data for the active tab, and lazy-load others on navigation.

### Medium-term (post-consolidation)

3. **Unified status polling**: The Marketplace Hub has 3 independent sync operations (wishlist, sellers, releases) each with their own status polling. Consider a unified sync status component that polls all three and shows a combined progress indicator.

4. **What to Play batch endpoint**: If user feedback shows that tab switching feels slow, implement a `GET /api/v1/what-to-play/init` batch endpoint similar to the existing dashboard endpoint pattern. This would fetch suggestions + forgotten favorites + dusty corners in parallel server-side.

5. **WebSocket for sync progress**: Currently sync status is polled via GET requests. For the consolidated pages where multiple syncs may run simultaneously, WebSocket push notifications would reduce polling overhead. This is a larger architectural change.

### Long-term

6. **API versioning**: All routes are under `/api/v1/`. If the consolidation eventually requires new response shapes (e.g., a unified marketplace response), consider adding `/api/v2/marketplace` rather than modifying v1 endpoints, preserving backward compatibility.

7. **GraphQL consideration**: The consolidated pages essentially need "give me data from 3-5 different sources for one page." This is the classic use case for GraphQL. However, given the app's scope and the fact that lazy-loading per tab works well, this is over-engineering for now.

---

## Summary

| Aspect | Marketplace Hub | What to Play |
|--------|----------------|--------------|
| Backend changes needed | None | None |
| Endpoints affected | 0 (49 endpoints used, 0 modified) | 0 (8 endpoints used, 0 modified) |
| New endpoints recommended | No | Optional batch init |
| Rate limiting changes | None needed | None needed |
| Service changes | None | None |
| Data schema changes | None | None |
| Risk level | Very Low (frontend-only) | Very Low (frontend-only) |

**Bottom line: The backend is ready for both consolidations as-is. No backend work is required. The frontend team can proceed with the UI refactor using existing endpoints.**
