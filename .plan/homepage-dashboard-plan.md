# Homepage Dashboard Improvements - Implementation Plan

## Overview

Transform the homepage from a basic onboarding/authentication page into an **engaging dashboard** that surfaces key metrics and insights from across the entire app. The goal is to give users immediate value when they open the app and encourage deeper exploration of features.

---

## Current State Analysis

### What the Homepage Currently Shows
| Section | Content | Value |
|---------|---------|-------|
| Welcome card | App description, server status | Low - onboarding only |
| Auth status | Discogs/Last.fm connection status | Medium - useful for setup |
| Recent scrobbles | Last 10 tracks from Last.fm | Medium - recent activity |
| Top Tracks/Artists | Period-selectable charts | Medium - but duplicates Stats page |
| Next Steps | Onboarding guidance | Low - only useful during setup |
| How It Works | App overview | Low - static, rarely needed |

### Problems with Current Homepage
1. **Onboarding-focused** - Most content irrelevant after initial setup
2. **No app-specific insights** - Only shows Last.fm data, ignores rich local data
3. **Duplicates Stats page** - Top tracks/artists better served on dedicated page
4. **No actionable items** - Doesn't highlight what user should do next
5. **Extensive inline styles** - Per CLAUDE.md, should use CSS classes
6. **Doesn't leverage the app** - Missing stats, collection, discovery, wishlist, seller data

---

## Available Data Sources

### From Stats API (statsService)
| Data | API Call | Dashboard Value |
|------|----------|-----------------|
| Current/longest streak | `getStreaks()` | High - engaging metric |
| Scrobble counts | `getCounts()` | High - quick snapshot |
| Listening hours | `getListeningHours()` | Medium - time investment |
| New artists this month | `getNewArtists()` | High - discovery rate |
| Collection coverage | `getCollectionCoverage()` | High - engagement metric |
| Top artists/albums | `getTopArtists/Albums()` | Medium - already on Stats |
| Calendar heatmap | `getHeatmap()` | Medium - visual engagement |
| Milestones | `getMilestones()` | Medium - progress tracking |
| Dusty corners count | `getDustyCorners()` | Medium - actionable |

### From Discovery API
| Data | Endpoint | Dashboard Value |
|------|----------|-----------------|
| Missing albums count | `GET /suggestions/discovery/missing-albums` | High - actionable |
| Top missing albums (by play count) | Same endpoint, limited | High - purchase suggestions |

**Note:** Missing albums count requires calling the existing endpoint. For dashboard efficiency, add a lightweight count-only endpoint or include count in dashboard aggregation.

### From Wishlist API
| Data | Dashboard Value |
|------|-----------------|
| Wishlist item count | Medium - tracking |
| Local want list count | Medium - tracking |
| Items with vinyl available | Medium - actionable |

### From Sellers API
| Data | Dashboard Value |
|------|-----------------|
| New matches count | High - urgent/actionable |
| Total matches | Medium - tracking |
| Monitored sellers count | Low - informational |

### From Collection API
| Data | Dashboard Value |
|------|-----------------|
| Collection size | Low - rarely changes |
| Recent additions | Medium - engagement |

---

## Proposed Dashboard Layout

### Section 1: Quick Stats Row (Always Visible)
```
┌────────────────────────────────────────────────────────────────────────────┐
│ QUICK STATS                                                                │
├─────────────┬─────────────┬─────────────┬─────────────┬─────────────┬─────┤
│ 🔥 23 days  │ 📊 847      │ 🎵 12       │ 📀 67%      │ ⏱ 42h      │ ... │
│ Streak      │ This Month  │ New Artists │ Collection  │ This Month  │     │
│ Best: 45    │ +23% vs avg │ This Month  │ Coverage    │ Listening   │     │
└─────────────┴─────────────┴─────────────┴─────────────┴─────────────┴─────┘
```

**Stats to include (6 cards):**
1. **Current Streak** - Current days + best streak
2. **Scrobbles This Month** - Count + comparison to average
3. **New Artists** - Artists discovered this month
4. **Collection Coverage** - % of collection played this month
5. **Listening Hours** - Hours listened this month
6. **All-Time Scrobbles** - Total + milestone progress

### Section 2: Quick Actions & Alerts
```
┌────────────────────────────────────────────────────────────────────────────┐
│ QUICK ACTIONS                                                              │
├─────────────────────────────────┬──────────────────────────────────────────┤
│ 🎯 3 new seller matches!        │ 📦 87 albums you've played but don't own │
│ [View Matches]                  │ [Explore Discovery]                      │
├─────────────────────────────────┼──────────────────────────────────────────┤
│ 💿 12 items in your want list   │ 🕸️ 5 albums need some attention         │
│ [View Wishlist]                 │ [View Dusty Corners]                     │
└─────────────────────────────────┴──────────────────────────────────────────┘
```

**Action cards (show only if relevant, sorted by urgency):**
1. New seller matches (if > 0) - **highest priority, always first**
2. Missing albums count (link to Discovery)
3. Want list items (link to Wishlist)
4. Dusty corners count (link to Stats)

**Urgency Sorting:** Quick actions are displayed in fixed priority order (seller matches > missing albums > want list > dusty corners). This ensures the most time-sensitive items (seller matches that could sell) appear first.

### Section 3: Recent Activity (Compact)
```
┌────────────────────────────────────────────────────────────────────────────┐
│ RECENT ACTIVITY                                          Times in PST     │
├────────────────────────────────────────────────────────────────────────────┤
│ [cover] OK Computer - Radiohead                          Today, 7:23 PM   │
│ [cover] Homogenic - Bjork                                Today, 6:15 PM   │
│ [cover] Kid A - Radiohead                                Yesterday        │
│ [cover] In Rainbows - Radiohead                          Yesterday        │
│ [cover] Vespertine - Bjork                               Jan 15           │
└────────────────────────────────────────────────────────────────────────────┘
```

**Changes from current:**
- Show 5 albums (not 10 tracks) - more compact, album-focused
- Group by album, show most recent track time
- Album covers prominently displayed
- Click behavior: Navigate to Collection if album is in collection, otherwise show album details modal

**Album Derivation Logic:**
- Use `ScrobbleHistoryStorage.getRecentlyPlayedAlbums(5)` which already exists
- Returns albums sorted by `lastPlayed` (Unix seconds, descending)
- Each album includes: artist, album, playCount, lastPlayed
- Cross-reference with collection to determine if album is owned (for click behavior)

### Section 4: This Month's Highlights (2-column)
```
┌───────────────────────────────────┬────────────────────────────────────────┐
│ TOP ARTISTS THIS MONTH            │ TOP ALBUMS THIS MONTH                  │
├───────────────────────────────────┼────────────────────────────────────────┤
│ 1. (img) Radiohead      142 plays │ 1. [cover] OK Computer       47 plays  │
│ 2. (img) Bjork           87 plays │ 2. [cover] Homogenic         32 plays  │
│ 3. (img) Pink Floyd      65 plays │ 3. [cover] Kid A             28 plays  │
│ 4. (img) Boards of Canada 54 plays│ 4. [cover] In Rainbows       25 plays  │
│ 5. (img) Aphex Twin      48 plays │ 5. [cover] Vespertine        22 plays  │
└───────────────────────────────────┴────────────────────────────────────────┘
```

**Changes from current:**
- Fixed to "this month" - no period selector (that's for Stats page)
- More compact - 5 items instead of 10
- "See full stats" link to Stats page

### Section 5: Calendar Heatmap (Full Width)
```
┌────────────────────────────────────────────────────────────────────────────┐
│ LISTENING ACTIVITY                                                [2026]   │
├────────────────────────────────────────────────────────────────────────────┤
│ [January calendar heatmap showing daily scrobble activity]                 │
│                                                                            │
│ Jan  Feb  Mar  Apr  May  Jun  Jul  Aug  Sep  Oct  Nov  Dec                │
│ ░░█░ ░░░░ ░░░░ ░░░░ ░░░░ ░░░░ ░░░░ ░░░░ ░░░░ ░░░░ ░░░░ ░░░░              │
└────────────────────────────────────────────────────────────────────────────┘
```

**Decision: Separate API call**
- Heatmap data is large (365 data points) and rarely changes within a session
- Keep as separate call: `GET /api/v1/stats/heatmap?year={year}`
- Load after main dashboard data (non-blocking)
- Cache aggressively on frontend (5-minute cache)

### Section 6: Milestone Progress (Optional)
```
┌────────────────────────────────────────────────────────────────────────────┐
│ MILESTONE PROGRESS                                                         │
├────────────────────────────────────────────────────────────────────────────┤
│ 47,523 scrobbles                                                           │
│ [████████████████████████████░░░░░░░░░░░░░░░░░░░░] 95% to 50,000          │
│ 2,477 scrobbles to go!                                                     │
└────────────────────────────────────────────────────────────────────────────┘
```

**Reuse existing component:**
- `MilestoneProgress` from Stats page

### Section 7: Server/Auth Status (Collapsed by Default)
```
┌────────────────────────────────────────────────────────────────────────────┐
│ CONNECTION STATUS                                            [▼ Collapse]  │
├────────────────────────────────────────────────────────────────────────────┤
│ Server: ✓ Connected  │  Discogs: ✓ @username  │  Last.fm: ✓ @username     │
└────────────────────────────────────────────────────────────────────────────┘
```

**Changes from current:**
- Collapsed to single line when all connected
- Expandable for troubleshooting
- Only prominent when there's an issue

---

## Conditional Display Logic

### Show/Hide Rules
| Section | Show When | Hide When |
|---------|-----------|-----------|
| Quick Stats | After auth complete | Before auth complete |
| Quick Actions | Has actionable items | All counts are 0 |
| Recent Activity | Has scrobble history | No history synced |
| Monthly Highlights | Has this month data | No data this month |
| Calendar Heatmap | Has any history | No history |
| Milestone Progress | Has >1000 scrobbles | Too few scrobbles |
| Server/Auth Status | Always | Never |

### Loading States
- Show skeleton loaders for each section
- Load sections in parallel (not blocking)
- Show sections as they load (progressive rendering)

### Error States
- If API fails, show inline error with retry button per section
- Don't break entire page for one section failure
- **Error isolation:** Each section in the aggregated response includes its own error field

---

## Implementation Plan

### Phase 1: Create Dashboard Components

#### 1.1 New Components to Create
```
src/renderer/components/dashboard/
├── DashboardStatCard.tsx      # Reusable stat card for quick stats
├── QuickActionsGrid.tsx       # Action cards with counts/links
├── RecentAlbums.tsx           # Compact recent album list
├── MonthlyHighlights.tsx      # Top artists/albums for month
├── ConnectionStatus.tsx       # Collapsible server/auth status
└── index.ts                   # Barrel export
```

#### 1.2 Reuse Existing Components
- `CalendarHeatmap` - Import from `stats/`
- `MilestoneProgress` - Import from `stats/`
- `TopList` - Import from `stats/` (for monthly highlights)

### Phase 2: Add Dashboard API Endpoint

#### 2.1 Route Location Decision
**Decision:** Add dashboard endpoint to existing `src/backend/routes/stats.ts`

Rationale:
- Dashboard data is primarily stats-related
- Follows existing pattern where stats routes are in `stats.ts`
- Avoids creating a new route file for a single endpoint
- Endpoint path: `GET /api/v1/stats/dashboard`

#### 2.2 Create Aggregated Dashboard Endpoint
```typescript
// GET /api/v1/stats/dashboard
// Add DashboardData type to src/shared/types.ts

interface DashboardData {
  // Per-section error isolation
  errors: {
    quickStats?: string;
    quickActions?: string;
    recentAlbums?: string;
    monthlyTop?: string;
  };

  quickStats: {
    currentStreak: number;
    longestStreak: number;
    scrobblesThisMonth: number;
    averageMonthlyScrobbles: number;
    newArtistsThisMonth: number;
    collectionCoverageThisMonth: number;
    listeningHoursThisMonth: number;
    totalScrobbles: number;
    nextMilestone: number;
  } | null;

  quickActions: {
    newSellerMatches: number;
    missingAlbumsCount: number;
    wantListCount: number;
    dustyCornersCount: number;
  } | null;

  recentAlbums: Array<{
    artist: string;
    album: string;
    coverUrl: string | null;
    lastPlayed: number;        // Unix seconds (per 0C convention)
    releaseId?: number;        // Present if album is in collection
    inCollection: boolean;     // For click navigation behavior
  }> | null;

  monthlyTopArtists: Array<{
    name: string;
    playCount: number;
    imageUrl: string | null;
  }> | null;

  monthlyTopAlbums: Array<{
    artist: string;
    album: string;
    playCount: number;
    coverUrl: string | null;
  }> | null;
}
```

**Timestamp Convention:** All timestamps in the response use **milliseconds** (13-digit Unix timestamps from `Date.now()`) to match the existing codebase convention per Feature 0C. The exception is data received directly from Last.fm API, which returns seconds.

**Error Isolation:** Each section can fail independently. If `statsService.getStreaks()` throws, `quickStats` will be `null` and `errors.quickStats` will contain the error message. Frontend renders available sections and shows error UI for failed sections.

#### 2.3 Backend Implementation
```typescript
// In src/backend/routes/stats.ts

router.get('/dashboard', async (req, res) => {
  const result: DashboardData = {
    errors: {},
    quickStats: null,
    quickActions: null,
    recentAlbums: null,
    monthlyTopArtists: null,
    monthlyTopAlbums: null,
  };

  // Fetch all data in parallel with error isolation
  const [
    quickStatsResult,
    quickActionsResult,
    recentAlbumsResult,
    monthlyTopResult,
  ] = await Promise.allSettled([
    fetchQuickStats(statsService),
    fetchQuickActions(statsService, wishlistService, sellerService, analyticsService),
    fetchRecentAlbums(historyStorage, collectionService, imageService),
    fetchMonthlyTop(statsService, imageService),
  ]);

  // Map results with error handling
  if (quickStatsResult.status === 'fulfilled') {
    result.quickStats = quickStatsResult.value;
  } else {
    result.errors.quickStats = quickStatsResult.reason?.message || 'Failed to load stats';
  }
  // ... similar for other sections

  res.json(result);
});
```

#### 2.4 Separate Calls for Heavy Data
- **Calendar heatmap:** Keep separate (`GET /api/v1/stats/heatmap?year={year}`)
  - Data is large (~365 entries)
  - Rarely changes within a session
  - Can be cached on frontend
  - Non-blocking load after main dashboard

### Phase 3: Refactor HomePage.tsx

#### 3.1 Remove/Replace
- Remove "Welcome to..." intro card
- Remove "How It Works" section
- Remove "Next Steps" section (or move to Settings)
- Remove inline styles (move to CSS)
- Remove duplicate Top Tracks/Artists (use compact monthly version)

#### 3.2 Add New Sections
- Add Quick Stats row
- Add Quick Actions grid
- Refactor Recent Activity to show albums
- Add Monthly Highlights
- Add Calendar Heatmap
- Add Milestone Progress
- Refactor Connection Status to be collapsible

### Phase 4: Add CSS Classes

#### 4.1 New CSS Classes (in styles.css)
```css
/* Dashboard Layout */
.dashboard-page { }
.dashboard-section { }
.dashboard-section-header { }

/* Quick Stats Row */
.dashboard-stats-row { }
.dashboard-stat-card { }
.dashboard-stat-value { }
.dashboard-stat-label { }
.dashboard-stat-subvalue { }

/* Quick Actions */
.dashboard-actions-grid { }
.dashboard-action-card { }
.dashboard-action-card-urgent { }
.dashboard-action-count { }
.dashboard-action-link { }

/* Recent Albums */
.dashboard-recent-albums { }
.dashboard-album-item { }
.dashboard-album-cover { }
.dashboard-album-info { }

/* Monthly Highlights */
.dashboard-highlights-grid { }
.dashboard-top-list { }
.dashboard-top-item { }

/* Connection Status */
.dashboard-connection-bar { }
.dashboard-connection-collapsed { }
.dashboard-connection-expanded { }
```

---

## Files to Modify/Create

### New Files
| File | Purpose |
|------|---------|
| `src/renderer/components/dashboard/DashboardStatCard.tsx` | Stat card component |
| `src/renderer/components/dashboard/QuickActionsGrid.tsx` | Action cards grid |
| `src/renderer/components/dashboard/RecentAlbums.tsx` | Recent album list |
| `src/renderer/components/dashboard/MonthlyHighlights.tsx` | Top lists for month |
| `src/renderer/components/dashboard/ConnectionStatus.tsx` | Collapsible status |
| `src/renderer/components/dashboard/index.ts` | Barrel export |

### Modified Files
| File | Changes |
|------|---------|
| `src/renderer/pages/HomePage.tsx` | Complete refactor to dashboard |
| `src/renderer/styles.css` | Add dashboard CSS classes |
| `src/server.ts` | No changes needed - stats routes already registered |
| `src/backend/routes/stats.ts` | Add `/dashboard` endpoint |
| `src/renderer/services/api.ts` | Add `getDashboard()` method |
| `src/shared/types.ts` | Add `DashboardData` type |

---

## API Response Example

```json
{
  "errors": {},
  "quickStats": {
    "currentStreak": 23,
    "longestStreak": 45,
    "scrobblesThisMonth": 847,
    "averageMonthlyScrobbles": 688,
    "newArtistsThisMonth": 12,
    "collectionCoverageThisMonth": 67,
    "listeningHoursThisMonth": 42.5,
    "totalScrobbles": 47523,
    "nextMilestone": 50000
  },
  "quickActions": {
    "newSellerMatches": 3,
    "missingAlbumsCount": 87,
    "wantListCount": 12,
    "dustyCornersCount": 5
  },
  "recentAlbums": [
    {
      "artist": "Radiohead",
      "album": "OK Computer",
      "coverUrl": "https://...",
      "lastPlayed": 1705528800,
      "releaseId": 12345,
      "inCollection": true
    },
    {
      "artist": "Bjork",
      "album": "Homogenic",
      "coverUrl": "https://...",
      "lastPlayed": 1705525200,
      "inCollection": false
    }
  ],
  "monthlyTopArtists": [
    { "name": "Radiohead", "playCount": 142, "imageUrl": "https://..." }
  ],
  "monthlyTopAlbums": [
    { "artist": "Radiohead", "album": "OK Computer", "playCount": 47, "coverUrl": "https://..." }
  ]
}
```

**Note:** `lastPlayed` uses milliseconds (e.g., `1705528800000` = Jan 17, 2024 7:00 PM UTC), consistent with the codebase convention. The example values above are simplified for readability but actual values will be 13-digit millisecond timestamps.

---

## Test Plan

### Backend Tests
```typescript
describe('GET /api/v1/stats/dashboard', () => {
  it('returns aggregated dashboard data');
  it('handles missing scrobble history gracefully');
  it('returns empty arrays for missing data sources');
  it('calculates streak correctly');
  it('limits recent albums to 5');
  it('limits monthly top lists to 5');
  it('returns timestamps in Unix seconds');
  it('includes inCollection flag for recent albums');

  // Error isolation tests
  it('returns partial data when quickStats fails');
  it('returns partial data when quickActions fails');
  it('populates errors object for failed sections');
  it('returns all nulls with errors before auth');
});
```

### Frontend Tests
```typescript
describe('HomePage Dashboard', () => {
  // Data states
  it('renders quick stats row when data available');
  it('shows skeleton loaders while loading');
  it('hides quick actions section when all counts are 0');
  it('shows seller matches alert when matches > 0');
  it('navigates to Discovery when clicking missing albums');
  it('renders calendar heatmap');
  it('collapses connection status when all connected');
  it('expands connection status when clicked');

  // Auth states
  it('hides quick stats before auth complete');
  it('shows connection status when not authenticated');
  it('shows full dashboard after auth complete');

  // Error handling
  it('shows error UI for failed sections');
  it('renders available sections when others fail');
  it('allows retry on failed sections');

  // Navigation
  it('navigates to Collection when clicking owned recent album');
  it('shows album details when clicking non-owned recent album');
});
```

---

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Aggregated vs separate API | Aggregated with error isolation | Faster initial render, single request, but graceful degradation |
| Route location | `src/backend/routes/stats.ts` | Follows existing pattern, dashboard is stats-focused |
| Period for highlights | Fixed to "this month" | Keeps dashboard simple, Stats page has full controls |
| Recent items | Albums, not tracks | More meaningful, less noisy |
| Connection status | Collapsed by default | After setup, users rarely need this |
| Heatmap | Separate API call | Large data, non-blocking, cacheable |
| Inline styles | Remove all | Per CLAUDE.md guidelines |
| Timestamps | Milliseconds | Per Feature 0C codebase convention |
| Quick actions order | Fixed priority | Seller matches most urgent (time-sensitive) |

---

## Resolved Questions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Should we show "Welcome back, {username}"? | No | Uses space, username visible in collapsed status bar |
| Should heatmap show current month or full year? | Full year | Standard pattern, matches Stats page |
| Should we add a "suggested album" card? | Defer to v2 | Keep v1 simple, evaluate after launch |
| Should quick actions be collapsible? | No | Always valuable, only shown when relevant |
| Quick actions sort order? | Fixed by urgency | Seller matches first (time-sensitive) |
| Recent albums click behavior? | Collection if owned, details if not | Respects navigation context |

---

## Dependencies

- Stats API endpoints (already exist)
- Discovery API (already exists - `GET /suggestions/discovery/missing-albums`)
- Sellers API (already exists)
- Wishlist API (already exists)
- Image service (already exists)
- Existing stat components (CalendarHeatmap, MilestoneProgress, TopList)
- `ScrobbleHistoryStorage.getRecentlyPlayedAlbums()` (already exists)

---

## Missing Albums Count Implementation

The Quick Actions section needs a count of missing albums. Options:

**Option A (Recommended): Use existing endpoint with limit=1**
- Call `GET /suggestions/discovery/missing-albums?limit=1`
- Response includes total count in metadata
- Minimal overhead since limit=1

**Option B: Add dedicated count endpoint**
- `GET /suggestions/discovery/missing-albums/count`
- Returns just the count
- More efficient but adds new endpoint

**Decision:** Use Option A for v1. The existing endpoint already calculates the full list; adding `limit=1` returns minimal data while still providing total count. If performance becomes an issue, add dedicated endpoint in v2.
