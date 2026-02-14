# RecordScrobbles Roadmap

## Feature 0: Foundations

Cross-cutting concerns to address before or alongside feature development.

### Status: COMPLETE ✅

**Completed:**
- 0A: Security Baseline (already in place before this work)
- 0B: API Conventions - `stats.ts`, `images.ts`, and `wishlist.ts` routes created following `/api/v1/` pattern
- 0D: In-App Notification System - `NotificationBell` component with dropdown, `useNotifications` hook, localStorage persistence
- 0E: Extended Analytics Infrastructure - `StatsService` created with comprehensive stats methods
- Image caching service (`imageService.ts`) with Last.fm and Discogs integration
- All stats-related types defined in `shared/types.ts`
- Full test coverage for new routes and services

**Completed (continued):**
- 0C: Data Evolution & Storage - All 4 phases complete ✅ - See `.plan/data-evolution-plan.md`

**Note on Dependencies:**
- 0C (Data Evolution) is a prerequisite for Feature 9 (Backup & Restore)
- Streak milestone notifications (Feature 1) require integration with 0D (complete)

### 0A: Security Baseline

**Server Binding:**
- Ensure backend binds to `127.0.0.1` only (not `0.0.0.0`)
- Document opt-in for LAN exposure if ever needed

**Path Traversal Protection:**
- Audit all file-based endpoints for path traversal vulnerabilities
- Validate usernames and file paths before constructing paths
- Use allowlist approach for file operations

**Token/Secret Hygiene:**
- Audit logging to ensure tokens, signatures, and API keys are never logged
- Review `ENCRYPTION_KEY` requirements - require strong key, no weak defaults

### 0B: API Conventions

All new endpoints must follow existing `/api/v1/` prefix pattern:
- Stats: `/api/v1/stats/...`
- Wishlist: `/api/v1/wishlist/...`
- Images: `/api/v1/images/...`
- Sellers: `/api/v1/sellers/...`
- Patterns: `/api/v1/patterns/...` *(planned - Feature 3)*
- Releases: `/api/v1/releases/...` *(planned - Feature 5)*
- Backup: `/api/v1/backup/...` *(planned - Feature 10)*

Route modules:

**Implemented:**
- `src/backend/routes/stats.ts` ✅
- `src/backend/routes/wishlist.ts` ✅
- `src/backend/routes/images.ts` ✅
- `src/backend/routes/sellers.ts` ✅
- `src/backend/routes/releases.ts` ✅

**Planned (not yet created):**
- `src/backend/routes/patterns.ts` *(Feature 3: Smart Scrobble Scheduling)*

**Recently Implemented:**
- `src/backend/routes/backup.ts` ✅ *(Feature 10: Backup & Restore)*

### 0C: Data Evolution & Storage

> **Status: COMPLETE ✅** (January 2026)

**All phases complete:**
- [x] Phase 1: Schema Infrastructure - `MigrationService`, `timestamps.ts`, types, server integration
- [x] Phase 2: Version Stamping - Array wrapping for legacy files, client-side localStorage stamping
- [x] Phase 3: Cleanup Routines - `cleanupService.ts` with image/seller/versions cache cleanup
- [x] Phase 4: Documentation - Timestamp conventions documented in code

**Key Implementations:**
- Server lock file to prevent multiple instances (prevents credential corruption)
- Credential protection: blocks saving empty tokens over existing tokens
- Array-based files wrapped in versioned objects during migration
- Cache cleanup runs after migrations on startup (non-blocking)

### 0D: In-App Notification System

**UI Component: Notification Panel**

Add a notification area to the app UI (e.g., bell icon in header with dropdown):
- Shows recent alerts/notifications
- Badge count for unread items
- Persisted to localStorage

```typescript
interface AppNotification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'alert';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  action?: {
    label: string;
    route: string;           // Navigate to this page (primary action)
    externalUrl?: string;    // Open in browser (secondary action)
  };
}
```

**Notification Panel Behavior:**
- Click notification → navigate to `route` (in-app page)
- If `externalUrl` present, show secondary "Open in Discogs/MusicBrainz" link
- Both options clearly visible so user can choose

**Use Cases:**
- "New vinyl pressing available for [Album]" (Feature 2)
- "Wishlist item at local seller!" (Feature 4)
- "Artist [X] has a new release" (Feature 5)
- "You hit a 30-day listening streak!" (Feature 1)
- Sync errors or warnings

**Implementation:**
- `src/renderer/components/NotificationPanel.tsx`
- `src/renderer/hooks/useNotifications.ts`
- Store in localStorage key: `recordscrobbles.notifications`
- Max 50 notifications, auto-prune oldest

### 0E: Extend Existing Analytics Infrastructure

**Existing Services:**

`ScrobbleHistoryStorage` (`src/backend/services/scrobbleHistoryStorage.ts`) provides:
- `getHourlyDistribution()` - Scrobbles by hour of day
- `getDayOfWeekDistribution()` - Scrobbles by day of week
- `getAlbumHistory()` - Play history for specific album
- `getUniqueArtists()` - All artists with play counts
- `getAllAlbums()` - All albums with play history

`AnalyticsService` (`src/backend/services/analyticsService.ts`) wraps the above and adds:
- `getTopArtistsMap()` - Top artists with weighted play counts
- `getAnalyticsSummary()` - Total scrobbles, unique albums/artists, peak hours
- `getAlbumCompleteness()` - Album completion detection
- `getTimeOfDayPreference()` - Current listening likelihood

**Strategy for Stats Dashboard:**
- Create `StatsService` that uses `AnalyticsService` + `ScrobbleHistoryStorage`
- Add new methods for streaks, source breakdown, collection coverage
- Avoid duplicating existing logic - call through to existing services

---

## Feature 1: Listening Streaks & Stats Dashboard

### Status: COMPLETE ✅

**Completed:**
- Stats Dashboard page with all core components
- Streak calculation (daily listening streaks with consecutive day tracking)
- Scrobble counts (today, week, month, year, all-time)
- Listening hours tracking (today, week, month)
- New artists count (this month)
- Collection coverage stats (multiple time periods)
- Top Artists, Top Albums, and Top Tracks lists with period selectors
- Custom date range picker for Top Artists, Top Albums, Top Tracks, and Timeline
- Calendar heatmap showing daily scrobble activity with year selector
- Dusty Corners section (neglected albums with album covers)
- Milestone progress tracking with history
- Source breakdown pie chart (with limitations - see below)
- Listening timeline area chart with period and granularity selectors
- recharts library integration for charts
- Image service for album/artist thumbnails (`imageService.ts`, `/api/v1/images/*` routes)
- Album cover and artist image batch fetching for Top Lists
- Full test coverage for stats components, StatsPage, and statsApi
- 1661 tests passing with 60%+ coverage

**Not Yet Implemented:**
- Streak milestone notifications (notification system 0D exists, integration pending)

### Overview
Comprehensive statistics dashboard showing listening patterns, streaks, source breakdown (this app vs Spotify vs others), and collection engagement metrics.

### Feasibility & Design Decisions

**Source Breakdown - IMPORTANT LIMITATION:**

After investigation, Last.fm's public API does **NOT** expose scrobble source/player information:
- The `track.scrobble` API accepts a `context` parameter for source, but this data is "not public, only enabled for certain API keys" per Last.fm documentation
- There is no way to retrieve which app/player submitted a scrobble via the public API
- Last.fm Pro subscription does not provide additional API access for source data
- This is an API limitation, not a RecordScrobbles limitation

**Current Implementation (Workaround):**
- RecordScrobbles identifies its own scrobbles by matching timestamps from saved session files
- When scrobbles are submitted, session data (including timestamps) is saved locally
- Source breakdown compares history timestamps against session file timestamps (5-second tolerance)
- Scrobbles matching session timestamps are marked "RecordScrobbles", others are "Other"

**Limitation of Current Approach:**
- If session files in `data/scrobbles/sessions/` are deleted, source attribution is lost
- All scrobbles would then appear as "Other" since there's no way to recover source from Last.fm
- This is a fragile solution but the best available given Last.fm API constraints

**Original Plan (Not Feasible):**
- ~~Last.fm scrobble data may not reliably include source for all scrobbles~~
- ~~Need to investigate what Last.fm API actually returns in scrobble metadata~~
- ~~Fallback: categorize as "This App" (scrobbles made through recordscrobbles) vs "Other"~~
- ~~This app's scrobbles can be identified by checking if timestamp matches a known scrobble we submitted~~

**Listening Hours Calculation:**
- Track duration source: Use Last.fm `track.getInfo` for duration, or estimate ~3.5 min/track if unavailable
- Gap handling: If gap between consecutive scrobbles > 30 min, assume new session
- Don't count gap time as listening time

**Streak Day Boundary:**
- Use user's local timezone for day boundaries
- A "day" runs from local midnight to local midnight
- Store streak data with UTC timestamps but calculate boundaries in local time

**Album Completion Detection:**
- Reuse existing `AnalyticsService.getAlbumCompleteness()` logic
- "Complete" = played 80%+ of tracks within a 3-hour window

### Phase 1A: Stats Calculation Service

**Backend: `src/backend/services/statsService.ts`**

Calculate stats from synced scrobble history:

```typescript
interface ListeningStats {
  // Streaks
  currentDailyStreak: number;
  longestDailyStreak: number;
  currentCollectionStreak: number;  // Days listening to owned albums
  albumsCompletedThisMonth: number;
  newArtistsThisMonth: number;

  // Time-based
  scrobblesToday: number;
  scrobblesThisWeek: number;
  scrobblesThisMonth: number;
  scrobblesThisYear: number;
  scrobblesAllTime: number;

  listeningHoursToday: number;
  listeningHoursThisWeek: number;
  listeningHoursThisMonth: number;

  // Source breakdown
  sourceBreakdown: {
    source: string;  // 'recordscrobbles', 'Spotify', 'Apple Music', etc.
    count: number;
    percentage: number;
  }[];

  // Collection stats
  collectionCoverageThisMonth: number;  // % of owned albums played
  collectionCoverageThisYear: number;
  dustyCorners: AlbumInfo[];  // Owned albums not played in 6+ months
  heavyRotation: AlbumPlayCount[];  // Most played owned albums

  // Top lists
  topArtistsThisWeek: ArtistPlayCount[];
  topArtistsThisMonth: ArtistPlayCount[];
  topArtistsThisYear: ArtistPlayCount[];
  topArtistsAllTime: ArtistPlayCount[];

  topAlbumsThisWeek: AlbumPlayCount[];
  topAlbumsThisMonth: AlbumPlayCount[];
  topAlbumsThisYear: AlbumPlayCount[];
  topAlbumsAllTime: AlbumPlayCount[];

  // Milestones
  totalScrobbles: number;
  nextMilestone: number;  // 10K, 25K, 50K, 100K, etc.
  scrobblesToNextMilestone: number;
  milestoneHistory: { milestone: number; date: number }[];

  // Patterns
  peakListeningHours: { hour: number; dayOfWeek: number; count: number }[];
  weekdayVsWeekend: { weekday: number; weekend: number };
}
```

**API Endpoints:**
- `GET /api/v1/stats/overview` - Main stats summary
- `GET /api/v1/stats/streaks` - Streak data
- `GET /api/v1/stats/sources` - Source breakdown
- `GET /api/v1/stats/collection` - Collection engagement stats
- `GET /api/v1/stats/top/:period` - Top artists/albums (week/month/year/all)
- `GET /api/v1/stats/heatmap` - Calendar heatmap data
- `GET /api/v1/stats/dusty-corners` - Albums owned but not played recently

**Data Processing:**
- Parse scrobble history index for play data
- Cross-reference with collection for owned albums
- Extract source from scrobble metadata (if available in Last.fm data)
- Calculate streaks by checking consecutive days with scrobbles

### Phase 1B: Stats Dashboard Page

**New Page: `src/renderer/pages/StatsPage.tsx`**

Layout sections:

**1. Overview Cards (top row)**
```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ 🔥 23 days   │ │ 📊 847       │ │ 🎵 12        │ │ 📀 67%       │
│ Listening    │ │ Scrobbles    │ │ New Artists  │ │ Collection   │
│ Streak       │ │ This Month   │ │ This Month   │ │ Coverage     │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

**2. Source Breakdown (pie/donut chart)**
- Show % from each scrobbling source
- "Physical vs Digital" summary

**3. Calendar Heatmap**
- GitHub-style contribution grid
- Color intensity = scrobble count
- Clickable days to see what was played
- Day detail popup shows album covers of what was played

**4. Listening Timeline**
- Line graph showing scrobbles over time
- Toggle between week/month/year views
- Optional: overlay multiple years

**5. Top Lists**
- Tabs: Artists | Albums
- Period selector: Week | Month | Year | All Time
- Show play counts and trend indicators
- **Album list items**: Album cover thumbnail (50-60px), artist, album title, play count
- **Artist list items**: Artist image thumbnail (50-60px, circular), artist name, play count

```
Top Albums This Month:
┌────────────────────────────────────────────────┐
│ [cover] Radiohead - OK Computer     │ 47 plays │
│ [cover] Pink Floyd - DSOTM          │ 32 plays │
│ [cover] Boards of Canada - MHTRTC   │ 28 plays │
└────────────────────────────────────────────────┘

Top Artists This Month:
┌────────────────────────────────────────────────┐
│ (img) Radiohead                     │ 142 plays│
│ (img) Pink Floyd                    │  87 plays│
│ (img) Boards of Canada              │  65 plays│
└────────────────────────────────────────────────┘
```

**6. Collection Stats**
- "Dusty Corners" section - albums owned but neglected
  - Grid/list of album covers with artist/title overlay
  - "Last played X months ago" indicator
- "Heavy Rotation" - most played from collection
  - Album covers prominently displayed
- Collection coverage progress bar

**7. Milestones**
- Progress to next milestone
- History of milestone dates

**8. Recently Played Section** (optional)
- Scrollable row of recent album covers
- Quick visual of listening history

### Phase 1C: Stats Components

**New Components:**
- `src/renderer/components/stats/StreakCard.tsx`
- `src/renderer/components/stats/SourcePieChart.tsx`
- `src/renderer/components/stats/CalendarHeatmap.tsx`
- `src/renderer/components/stats/ListeningTimeline.tsx`
- `src/renderer/components/stats/TopList.tsx` - Handles both albums (with covers) and artists (with images)
- `src/renderer/components/stats/MilestoneProgress.tsx`
- `src/renderer/components/stats/DustyCornersSection.tsx`
- `src/renderer/components/stats/AlbumCard.tsx` - Reusable album display with cover
- `src/renderer/components/stats/ArtistCard.tsx` - Reusable artist display with image

**Charting Library:**
- Consider using lightweight library like `recharts` or `chart.js`
- Or build simple SVG-based components for basic charts

### Phase 1E: Image Sources & Caching

**Album Cover Sources (in priority order):**
1. **Discogs collection cache** - Already have cover URLs from collection sync
2. **Last.fm API** - `album.getInfo` returns album images
3. **Discogs API** - Fallback for non-collection albums

**Artist Image Sources:**
1. **Last.fm API** - `artist.getInfo` returns artist images (though Last.fm deprecated large images)
2. **Discogs API** - `GET /artists/{id}` includes images
3. **MusicBrainz + Cover Art Archive** - Alternative source
4. **Spotify API** - Has good artist images (would require additional auth)

**Image Handling:**
- Cache fetched images locally to avoid repeated API calls
- Use placeholder/fallback for missing images (generic vinyl icon for albums, silhouette for artists)
- Lazy load images as they scroll into view
- Store image URLs in stats cache alongside play data

**Backend: `src/backend/services/imageService.ts`**

```typescript
interface ImageService {
  getAlbumCover(artist: string, album: string): Promise<string | null>;
  getArtistImage(artist: string): Promise<string | null>;
  getCachedImages(items: { artist: string; album?: string }[]): Promise<ImageCache>;
}

interface ImageCache {
  albums: { [key: string]: string };  // "artist|album" -> URL
  artists: { [key: string]: string }; // "artist" -> URL
}
```

**API Endpoints:**
- `GET /api/v1/images/album?artist=X&album=Y` - Get album cover URL
- `GET /api/v1/images/artist?name=X` - Get artist image URL
- `POST /api/v1/images/batch` - Batch fetch multiple images

**Data Storage:**
- `images/album-covers.json` - Cached album cover URLs
- `images/artist-images.json` - Cached artist image URLs

### Visual Design Considerations

**Consistent Album Display:**
- Standard cover sizes: 50px (list items), 100px (cards), 150px (featured)
- Rounded corners (4-8px) for album covers
- Subtle shadow/border for depth
- Fallback: Dark gray placeholder with vinyl icon

**Consistent Artist Display:**
- Circular crop for artist images
- Standard sizes: 50px (list), 80px (cards)
- Fallback: Dark gray circle with music note or silhouette icon

**Color Scheme:**
- Use existing app color palette
- Accent colors for charts that complement album art
- Dark backgrounds make album covers pop

**Typography:**
- Play counts in monospace or tabular numbers for alignment
- Artist names slightly bolder than album titles
- Truncate long names with ellipsis

**Responsive Layout:**
- Cards reflow on smaller screens
- Album grids adjust column count
- Charts resize gracefully

### Phase 1D: Streak Tracking

**Backend Enhancement:**

Track streaks in real-time:
- Update streak counts when new scrobbles are synced
- Store streak history for display
- Detect streak milestones (7 days, 30 days, 100 days, 365 days)

**Streak Types:**
1. **Daily Listening Streak** - Any scrobble counts
2. **Collection Streak** - Days playing owned albums (requires cross-referencing)
3. **Album Completion Streak** - Detect when most/all tracks of album played in sequence
4. **Discovery Streak** - Days with new artist listens

---

## Feature 2: Discogs Wishlist & Vinyl Availability Tracking

### Status: COMPLETE ✅

**Completed:**
- Wishlist sync service (`wishlistService.ts`) with Discogs integration
- Wishlist API routes (`/api/v1/wishlist/*`) for sync, versions, settings, and local want list
- `WishlistPage.tsx` with tabbed interface (All, Has Vinyl, CD Only, Affordable, Wanted)
- Vinyl version detection and marketplace price fetching
- Local Want List feature for Discovery integration (albums played frequently but not owned)
- Watch list for CD-only items with vinyl availability checking
- Notification integration for vinyl availability alerts
- Settings integration (price threshold, currency, auto-sync interval)
- Discovery page enhancements:
  - "In Wantlist" badge for albums in Discogs wantlist (purple)
  - "Wanted" badge for albums in local want list (green)
  - "Hide wanted" toggle to filter out items already on wantlist/wanted
  - Differentiated badge colors for visual distinction
- 42 backend integration tests + 19 frontend component tests + 43 Discovery tests
- All wishlist types defined in `shared/types.ts`

**Implementation Details:**
- Version cache: 7 days for vinyl availability data
- Price cache: 24 hours for marketplace stats
- Progressive scanning: 10-20 masters per sync session
- Vinyl detection: "Vinyl", "LP", "12\"", "10\"", "7\"" formats

### Overview
Track albums at the **master release level** (not specific pressings), monitor for vinyl availability, and integrate with Discovery to show which albums are vinyl-available vs CD-only. Focus is exclusively on vinyl - no interest in CD or other formats.

### Feasibility & Design Decisions

**Master vs Release Mapping:**
- Discogs wishlist stores specific releases, not master releases
- Each wishlist item has a `master_id` we can extract
- Strategy: Fetch wishlist, extract master_id from each release, group by master
- Display shows master-level info but stores original release_id for reference

**API Call Bounding for Version Scanning:**
- Scanning all versions of all wishlist items could be expensive (1 API call per master)
- Bound: Max 100 wishlist items scanned per sync
- Bound: Max 50 versions fetched per master (paginated endpoint)
- Cache version data for 7 days to avoid repeated lookups
- Progressive sync: scan 10-20 masters per day rather than all at once

**Vinyl Detection:**
- Check `format` field in version data for: "Vinyl", "LP", "12\"", "10\"", "7\""
- Exclude: "CD", "Cassette", "File", "DVD"
- Store list of vinyl version IDs for each master

**Price Data:**
- `GET /marketplace/stats/{release_id}` returns price statistics
- Only fetch for vinyl versions
- Cache for 24 hours (prices change)
- Note: Requires separate API call per release - expensive for large wishlists

### Phase 2A: Wishlist Sync Service

**Backend: `src/backend/services/wishlistService.ts`**

Create a new service to sync and manage Discogs wishlist data:

```typescript
interface WishlistItem {
  masterId: number;
  releaseId: number;           // The specific release in wishlist (for reference)
  artist: string;
  title: string;
  dateAdded: number;           // When added to Discogs wishlist
  hasVinyl: boolean;           // Does ANY vinyl pressing exist?
  vinylVersionCount: number;   // How many vinyl versions exist
  vinylPriceRange?: {
    min: number;
    max: number;
    median: number;
    currency: string;
  };
  lastChecked: number;         // When we last scanned versions
  isAffordable?: boolean;      // Below user's price threshold
}

interface WishlistSyncStatus {
  status: 'idle' | 'syncing' | 'completed' | 'error';
  lastSync: number | null;
  totalItems: number;
  itemsWithVinyl: number;
  itemsCdOnly: number;
}
```

**API Endpoints:**
- `GET /api/v1/wishlist` - Get all wishlist items with vinyl status
- `GET /api/v1/wishlist/sync` - Get sync status
- `POST /api/v1/wishlist/sync` - Trigger wishlist sync from Discogs
- `GET /api/v1/wishlist/:masterId/versions` - Get all versions of a master release
- `POST /api/v1/wishlist/settings` - Save settings (price threshold, etc.)

**Discogs API Calls:**
1. `GET /users/{username}/wants` - Fetch full wishlist
2. `GET /masters/{master_id}/versions` - Get all pressings for each item
3. `GET /marketplace/stats/{release_id}` - Get price data for vinyl versions

**Data Storage:**
- `wishlist/wishlist-items.json` - Cached wishlist with vinyl status
- `wishlist/wishlist-settings.json` - User settings (price threshold)
- `wishlist/sync-status.json` - Sync progress/status

**Rate Limiting Considerations:**
- Wishlist sync involves many API calls (1 per master release for versions)
- Implement progressive sync with delays (similar to collection preloader)
- Cache version/format data for 7 days (vinyl availability changes rarely)
- Cache price data for 24 hours (prices change frequently)

### Phase 2B: Wishlist Page (Frontend)

**New Page: `src/renderer/pages/WishlistPage.tsx`**

Features:
- Display all wishlist items grouped by vinyl availability
- Filters:
  - "All Items"
  - "Has Vinyl" (show only items with vinyl pressings)
  - "CD Only" (show items without vinyl - for watching)
  - "Affordable Vinyl" (under price threshold)
- Sort options:
  - Date added to wishlist
  - Price (lowest vinyl)
  - Artist name
  - Album title
- Each item shows:
  - Artist - Album
  - Vinyl status badge (green "Vinyl Available", gray "CD Only", yellow "Vinyl $$$")
  - Price range for vinyl versions (if available)
  - Link to Discogs marketplace
  - "Check Versions" button to view all pressings

**Sync Status Bar:**
- Reuse pattern from `SyncStatusBar.tsx`
- Show "Last synced: X hours ago"
- "Sync Now" button

### Phase 2C: Discovery Integration

**Modify: `src/backend/services/vinylAvailabilityService.ts`** (new)

Service to check vinyl availability for Discovery items:
- When Discovery loads missing albums, check each against Discogs for vinyl versions
- Cache results to avoid repeated API calls
- Background job to periodically update availability

**Modify: `src/renderer/pages/DiscoveryPage.tsx`**

Add to each Discovery album card:
- Vinyl status badge
- Price indicator (if vinyl available)
- "Add to Wishlist" button (adds master release to Discogs wishlist)
- "Watch for Vinyl" button (for CD-only items - local tracking)

**New Filters on Discovery:**
- "Show All"
- "Vinyl Available"
- "CD Only"
- "Affordable Vinyl (under $X)"

### Phase 2D: Watch for Vinyl Feature

**Backend: `src/backend/services/vinylWatchService.ts`**

For CD-only albums on Discovery that user wants to track:
- Store list of "watched" albums locally
- Periodically check if vinyl versions become available
- Generate notifications when vinyl is added

**Data Storage:**
- `discovery/vinyl-watch-list.json`

### Phase 2E: Settings

**Modify: `src/renderer/pages/SettingsPage.tsx`**

Add "Wishlist" tab with:
- Price threshold setting (default: $40)
- Auto-sync interval (daily, weekly, manual only)
- Currency preference

---

## Feature 3: Smart Scrobble Scheduling

### Status: PLANNED

### Implementation Plan
See `.plan/smart-scrobble-scheduling-plan.md` for full specification including:
- `ListeningPatternService` for pattern learning from scrobble history
- `/api/v1/patterns/*` routes for suggestions and conflict detection
- `QuickTimePresets.tsx` for enhanced timestamp selection
- `BackfillDialog.tsx` for batch album scrobbling
- `ListeningQueueWidget.tsx` for real-time session tracking (Phase 4)

### Overview
Make backfilling scrobbles easier with intelligent timestamp suggestions, batch operations, and a listening queue system.

### Feasibility & Design Decisions

**Last.fm Timestamp Constraints:**
- Last.fm accepts scrobbles with timestamps up to 2 weeks in the past
- Timestamps must be Unix epoch seconds
- Cannot scrobble to the future
- Duplicate detection: same track + timestamp = rejected

**Conflict Resolution UX:**
- Before scrobbling, check existing scrobbles for that time window
- Show warning: "You have scrobbles between 7pm-9pm on this date"
- Options: "Scrobble anyway" / "Adjust times" / "Cancel"
- Auto-adjust: Shift proposed timestamps to fill gaps around existing scrobbles

**Pattern Learning Approach:**
- Analyze last 6 months of scrobble history
- Extract: typical start times per day-of-week, session lengths, gaps between albums
- Store computed patterns, refresh weekly
- Use existing `ScrobbleHistoryStorage.getHourlyDistribution()` as foundation

### Phase 3A: Pattern Learning Service

**Backend: `src/backend/services/listeningPatternService.ts`**

Analyze scrobble history to learn user's listening patterns:

```typescript
interface ListeningPatterns {
  // Time-of-day patterns by day of week
  typicalStartTimes: {
    dayOfWeek: number;  // 0-6
    morning: number | null;    // Average start time if they listen in morning
    afternoon: number | null;
    evening: number | null;
  }[];

  // Session patterns
  averageSessionLength: number;  // minutes
  averageGapBetweenAlbums: number;  // minutes
  averageAlbumsPerSession: number;

  // Weekday vs weekend
  weekdayPattern: { start: number; end: number };
  weekendPattern: { start: number; end: number };
}
```

**API Endpoints:**
- `GET /api/v1/patterns` - Get learned listening patterns
- `POST /api/v1/patterns/suggest` - Suggest timestamps for albums (body: `{albums: BackfillAlbum[]}`)
- `POST /api/v1/patterns/check-conflicts` - Check for existing scrobbles in time window

### Phase 3B: Backfill Mode

**Frontend: Enhance scrobble dialog**

Add "Backfill Mode" option when scrobbling:

1. Select multiple albums (add to backfill queue)
2. Choose date/time range:
   - Preset: "Yesterday evening", "Last Saturday afternoon", etc.
   - Custom: Date picker with start/end time
3. Preview calculated timestamps based on:
   - Album durations
   - User's typical gaps between albums
   - Learned patterns for that time of day
4. Adjust if needed
5. Submit all scrobbles at once

**UI Flow:**
```
┌─────────────────────────────────────────────────┐
│ Backfill Listening Session                      │
│                                                 │
│ Albums to scrobble:                             │
│ ☑ Radiohead - OK Computer (53 min)        [×]  │
│ ☑ Pink Floyd - DSOTM (42 min)             [×]  │
│ ☑ Boards of Canada - MHTRTC (62 min)      [×]  │
│                                                 │
│ [+ Add Another Album]                           │
│                                                 │
│ When did you listen?                            │
│ ○ Yesterday evening (based on your patterns)   │
│ ○ Yesterday afternoon                          │
│ ○ Saturday evening                             │
│ ○ Custom: [Jan 10, 2026] [6:00 PM] to [11:00 PM]│
│                                                 │
│ Preview:                                        │
│ • OK Computer: Sat 6:15pm - 7:08pm              │
│ • DSOTM: Sat 7:30pm - 8:12pm                    │
│ • MHTRTC: Sat 8:45pm - 9:47pm                   │
│                                                 │
│ ⚠️ No conflicts with existing scrobbles        │
│                                                 │
│ [Cancel]                    [Scrobble All (3)]  │
└─────────────────────────────────────────────────┘
```

### Phase 3C: Quick Backdate Presets

**Modify: Scrobble dialog (`ScrobbleDialog.tsx` or similar)**

Add quick preset buttons:
- "Just now" (current time)
- "Earlier today" (picks typical afternoon time)
- "Yesterday evening" (picks typical evening time based on patterns)
- "Yesterday afternoon"
- "Custom..." (existing date/time picker)

These presets auto-populate based on learned patterns:
- "You usually listen at 8pm on weekday evenings"
- "Your Saturday afternoons typically start around 2pm"

### Phase 3D: Listening Queue

**New Feature: Real-time listening tracker**

For users who want to log as they listen:

1. "Start Listening Session" button
2. Add album to queue → records current time as start
3. "Finished" button → scrobbles with correct start time
4. Automatically calculates gaps and handles overlaps

**State Management:**
```typescript
interface ListeningQueue {
  sessionStarted: number;
  albums: {
    releaseId: number;
    artist: string;
    album: string;
    addedAt: number;      // When added to queue
    finishedAt?: number;  // When marked finished
    scrobbled: boolean;
  }[];
}
```

**Storage:**
- Store in localStorage for persistence across page refreshes
- Auto-save queue state

### Phase 3E: Conflict Detection

**Backend Enhancement:**

When suggesting timestamps:
- Check against existing scrobbles for that time period
- Warn if overlap detected
- Suggest alternative times if conflicts exist

---

## Feature 4: Local Seller Monitoring

### Status: COMPLETE ✅

**Completed:**
- Seller monitoring service (`sellerMonitoringService.ts`) with inventory scanning
- Seller routes (`/api/v1/sellers/*`) for managing monitored sellers and matches
- `SellersPage.tsx` with seller management UI
- Full inventory scanning with progressive pagination
- Page 100+ limit workaround using reverse sort order
- Quick-check for new listings (newest first, page 1 only)
- Match detection against Discogs wishlist (master_id matching)
- Match lifecycle tracking (active/sold/seen status)
- Stale listing cleanup and sold match detection
- Notification integration for new matches
- "View All Matches" page with filtering and sorting
- Match dismissal and "mark as seen" functionality
- Settings integration for scan frequency
- 8 monitored sellers with 10,000+ inventory items scanned

**Implementation Details:**
- Full scan: Weekly per seller (configurable)
- Quick check: Daily for newest listings
- Inventory cache: 24 hours to reduce API calls
- Match by master_id for consistency with wishlist
- Vinyl-only filtering (LP, 12", 10", 7")
- Progressive scan saves progress between sessions

### Overview
Track Discogs inventories of local record shops to find wishlist items available locally. Users maintain a list of seller usernames (typically under 20 local stores), and the app periodically scans their inventories for matches against the user's wishlist.

### Feasibility & Design Decisions

**Scope:**
- Only tracks items on the user's Discogs wishlist (synced via Feature 2)
- Vinyl-only focus (consistent with wishlist feature)
- No price threshold filtering - local availability is the priority
- Equal notification priority with other wishlist alerts

**API Constraints:**
- `GET /users/{username}/inventory` - Paginated seller inventory (up to 100 items/page)
- Rate limit: 60 requests/minute shared with all Discogs operations
- Seller inventories can be large (1000+ items for active shops)
- Strategy: Incremental scan with progress saved between sessions

**Scan Frequency:**
- Full inventory scan: Weekly per seller
- Quick check for new listings: Daily (fetch page 1 sorted by date added)
- Cache seller inventory for 24 hours to avoid redundant calls

**Matching Strategy:**
- Match by master_id when available (consistent with wishlist tracking)
- Fallback to artist/title fuzzy matching for releases without master_id
- Only match vinyl formats (LP, 12", 10", 7")

**Wishlist Dependency:**
- Seller scanning requires wishlist to be synced first
- If wishlist is empty or not synced: show empty state with "Sync Wishlist First" prompt
- Don't attempt seller scans until wishlist has items

**Stale Listing Cleanup:**
- On each scan, compare new matches against existing matches
- If a listing disappears (sold/removed): mark match as `status: 'sold'`
- Sold matches hidden from main view, accessible via "Show Sold" toggle
- Auto-prune sold matches older than 30 days

### Phase 4A: Seller Management Service

**Backend: `src/backend/services/sellerMonitoringService.ts`**

```typescript
interface MonitoredSeller {
  username: string;           // Discogs seller username
  displayName: string;        // User-friendly name (e.g., "Amoeba Music")
  addedAt: number;            // When user added this seller
  lastScanned: number;        // Last full inventory scan
  lastQuickCheck: number;     // Last new listings check
  inventorySize: number;      // Total items in inventory
  matchCount: number;         // Current wishlist matches
}

interface SellerMatch {
  sellerId: string;           // Seller username
  releaseId: number;          // Discogs release ID
  masterId: number;           // Master release ID
  artist: string;
  title: string;
  format: string;             // "LP", "12\"", etc.
  condition: string;          // "Mint", "VG+", etc.
  price: number;
  currency: string;
  listingUrl: string;         // Direct link to listing
  listingId: number;          // Discogs listing ID for tracking
  dateFound: number;          // When we first detected this match
  notified: boolean;          // Have we alerted the user?
  status: 'active' | 'sold' | 'seen';  // Lifecycle state
  statusChangedAt?: number;   // When status last changed
}

interface SellerInventoryCache {
  username: string;
  fetchedAt: number;
  items: {
    releaseId: number;
    masterId?: number;
    artist: string;
    title: string;
    format: string;
    condition: string;
    price: number;
    currency: string;
    listingId: number;
  }[];
}
```

**API Endpoints:**
- `GET /api/v1/sellers` - List all monitored sellers with stats
- `POST /api/v1/sellers` - Add a seller to monitor
- `DELETE /api/v1/sellers/:username` - Remove a seller
- `GET /api/v1/sellers/:username/matches` - Get wishlist matches for a seller
- `GET /api/v1/sellers/matches` - Get all matches across all sellers
- `POST /api/v1/sellers/scan` - Trigger manual scan of all sellers
- `GET /api/v1/sellers/scan/status` - Get scan progress

**Discogs API Calls:**
1. `GET /users/{username}/inventory?sort=listed&sort_order=desc` - Seller inventory (newest first)
2. For each listing, extract: release_id, master_id, format, condition, price

**Data Storage:**
- `sellers/monitored-sellers.json` - List of sellers to track
- `sellers/inventory-cache/{username}.json` - Cached inventory per seller
- `sellers/matches.json` - Current matches with notification status
- `sellers/scan-status.json` - Scan progress state

### Phase 4B: Inventory Scanning Logic

**Scan Algorithm:**

```typescript
async scanSeller(username: string, fullScan: boolean): Promise<SellerMatch[]> {
  const wishlist = await this.wishlistService.getWishlistItems();
  const wishlistMasterIds = new Set(wishlist.map(w => w.masterId));

  const matches: SellerMatch[] = [];
  let page = 1;

  while (true) {
    const inventory = await this.fetchInventoryPage(username, page);

    for (const item of inventory.listings) {
      // Only check vinyl formats
      if (!this.isVinylFormat(item.format)) continue;

      // Check if matches wishlist
      if (item.master_id && wishlistMasterIds.has(item.master_id)) {
        matches.push(this.createMatch(username, item));
      }
    }

    // For quick check, only scan first page (newest listings)
    if (!fullScan || !inventory.pagination.next) break;

    page++;
    await this.rateLimitDelay();
  }

  return matches;
}
```

**Progressive Scan:**
- On startup, check which sellers need scanning (stale > 7 days)
- Scan 2-3 sellers per session to spread API load
- Save progress after each seller to resume on restart

### Phase 4C: Seller Management UI

**New Page: `src/renderer/pages/SellersPage.tsx`**

Layout:
```
┌─────────────────────────────────────────────────────────────┐
│ Local Seller Monitoring                      [+ Add Seller] │
├─────────────────────────────────────────────────────────────┤
│ Monitoring 5 sellers · 12 wishlist matches found            │
│ Last scan: 2 hours ago                    [Scan Now]        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🏪 Amoeba Music                              [Remove]   │ │
│ │ @amoebamusic · 2,341 items · 3 matches                  │ │
│ │ Last scanned: Today                                     │ │
│ │ Matches: [Radiohead - OK Computer] [Bjork - Homogenic]  │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🏪 Vintage Vinyl                             [Remove]   │ │
│ │ @vintagevinylstl · 892 items · 0 matches                │ │
│ │ Last scanned: Yesterday                                 │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Add Seller Dialog:**
```
┌─────────────────────────────────────────────┐
│ Add Local Seller                            │
│                                             │
│ Discogs Username:                           │
│ [amoebamusic                          ]     │
│                                             │
│ Display Name (optional):                    │
│ [Amoeba Music                         ]     │
│                                             │
│ [Cancel]                    [Add & Scan]    │
└─────────────────────────────────────────────┘
```

**Seller Validation:**
- On add, verify username exists via `GET /users/{username}`
- Show seller info: avatar, location, feedback score
- Warn if inventory is very large (>5000 items)

### Phase 4D: Match Notifications

**Integration with Notification System (Feature 0D):**

When a new match is found:
```typescript
interface LocalSellerNotification {
  type: 'alert';
  title: 'Wishlist item at local seller!';
  message: '{Artist} - {Album} available at {SellerName} for {Price}';
  action: {
    label: 'View Listing';
    route: '/sellers/{username}/matches';
    externalUrl: 'https://discogs.com/sell/item/{listingId}';
  };
}
```

**Notification Behavior:**
- Equal priority with other wishlist notifications
- One notification per new match (not per scan)
- Mark match as "notified" after creating notification
- Don't re-notify for same listing

### Phase 4E: Matches Page

**New Page: `src/renderer/pages/SellerMatchesPage.tsx`**

Displays all wishlist items found at monitored sellers:

```
┌─────────────────────────────────────────────────────────────┐
│ Wishlist Items at Local Sellers                             │
├─────────────────────────────────────────────────────────────┤
│ 12 matches across 5 sellers                                 │
│                                                             │
│ Filter: [All Sellers ▼]  Sort: [Newest First ▼]             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ [cover] Radiohead - OK Computer                         │ │
│ │ LP, VG+ · $28.00                                        │ │
│ │ 📍 Amoeba Music · Found 2 days ago                      │ │
│ │ [View on Discogs]                       [Mark as Seen]  │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ [cover] Bjork - Homogenic                               │ │
│ │ 2xLP, NM · $45.00                                       │ │
│ │ 📍 Amoeba Music · Found today (NEW)                     │ │
│ │ [View on Discogs]                       [Mark as Seen]  │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Features:**
- Filter by seller
- Sort by: newest, price, artist
- "Mark as Seen" to dismiss without buying
- "View on Discogs" opens listing in browser
- Show album cover (from collection cache or Discogs)

### Phase 4F: Settings Integration

**Modify: `src/renderer/pages/SettingsPage.tsx`**

Add "Local Sellers" section:
- Quick-add seller form
- List of monitored sellers (manage)
- Scan frequency option (daily quick-check, weekly full)
- Enable/disable notifications for local matches

---

## Feature 5: New Release Tracking (MusicBrainz Integration)

### Status: COMPLETE ✅

**Completed:**
- `MusicBrainzService` for artist search and release fetching (rate-limited, exponential backoff)
- `ReleaseTrackingService` for sync, mapping, and disambiguation management
- `/api/v1/releases/*` routes for all operations (sync, settings, disambiguations, mappings, search, etc.)
- `NewReleasesPage.tsx` with release grid, tabs (All, Upcoming, Recent, Vinyl Available), and filters
- `DisambiguationDialog.tsx` for artist matching UI with candidate selection
- Vinyl availability integration via Discogs search
- Cover Art Archive integration for album artwork
- Auto-match logic for high-confidence artist results (score >= 95)
- Collection artists cache (24-hour retention)
- Data migration registration for 6 new data files
- 36 MusicBrainzService tests + 47 ReleaseTrackingService tests
- All Feature 5 types defined in `shared/types.ts`

**Implementation Details:**
- MusicBrainz rate limit: 1 req/sec with exponential backoff
- Cover Art Archive: 5 req/sec, 30-day caching
- Artist disambiguation: pending → resolved/skipped workflow
- Release types: album, EP, single, compilation, other
- Vinyl status: unknown, checking, available, cd-only, not-found

### Overview
Track new and upcoming releases from artists in your collection using MusicBrainz data, combined with Discogs for vinyl availability.

### Feasibility & Design Decisions

**Artist Matching Disambiguation:**
- MusicBrainz search can return multiple artists with same/similar names
- Strategy:
  1. Search by name: `GET /artist?query={name}`
  2. If single result with high score, auto-match
  3. If multiple results or low confidence, show disambiguation UI
  4. User selects correct artist, mapping is stored permanently

**Disambiguation UI:**
- Show on New Releases page when unmatched artists exist
- Display: Artist name, country, disambiguation text, release count
- "This is the right artist" / "None of these" buttons
- Store confirmed mappings in `releases/artist-mbid-map.json`

**Re-check Cadence:**
- New release check: Weekly when app starts (if stale > 7 days)
- Manual "Check Now" button always available
- Cache release data for 7 days (releases don't change frequently)
- Desktop app may not run continuously, so on-demand when page loads

**Handling Artist Name Variants:**
- Store normalized name (lowercase, no punctuation) as lookup key
- Store original Discogs name for display
- If Discogs has "The Beatles" and MusicBrainz has "Beatles, The", normalize both

### Phase 5A: MusicBrainz Service

**Backend: `src/backend/services/musicbrainzService.ts`**

```typescript
interface MusicBrainzRelease {
  mbid: string;
  title: string;
  artist: string;
  artistMbid: string;
  releaseDate: string | null;
  releaseType: 'album' | 'ep' | 'single' | 'compilation';
  status: 'official' | 'promotion' | 'bootleg';
}

interface ArtistReleases {
  artistName: string;
  artistMbid: string;
  releases: MusicBrainzRelease[];
  lastChecked: number;
}
```

**API Calls:**
- `GET /artist/{mbid}?inc=release-groups` - Get all releases by artist
- Rate limit: 1 request/second (same as Discogs)

**Matching Artists:**
- Use artist names from collection
- Search MusicBrainz for matching artist
- Store mapping: Discogs artist ID → MusicBrainz MBID

### Phase 5B: Release Tracking Service

**Backend: `src/backend/services/releaseTrackingService.ts`**

Track releases from artists in collection:
1. Get list of artists from collection
2. For each artist, fetch releases from MusicBrainz
3. Filter to recent/upcoming releases (past 3 months, future)
4. Store and compare against previous scan
5. Generate "new release" notifications

**Data Storage:**
- `releases/artist-mbid-map.json` - Discogs → MusicBrainz mapping
- `releases/tracked-releases.json` - Known releases per artist
- `releases/new-releases.json` - Newly detected releases

### Phase 5C: New Releases Page

**New Page: `src/renderer/pages/NewReleasesPage.tsx`**

Features:
- List of new/upcoming releases from artists in collection
- Filter by:
  - Release type (album, EP, single)
  - Time frame (last month, last 3 months, upcoming)
  - Artists (specific artist filter)
- Each release shows:
  - Artist - Album
  - Release date
  - Release type badge
  - "Check Vinyl Availability" button (queries Discogs)
  - "Add to Wishlist" button

### Phase 5D: Vinyl Availability for New Releases

**Integration with Feature 2:**

When viewing a new release:
- Query Discogs for matching release
- Show vinyl availability status
- Show price range if vinyl exists
- One-click add to Discogs wishlist

---

## Feature 5.5: Wishlist New Release Tracking

### Status: COMPLETE ✅

**Completed:**
- `WishlistNewRelease`, `WishlistNewReleasesStore`, `NewReleaseSyncStatus`, `WishlistNewReleaseSettings` types
- `getTrackedMasterIds()` method to collect masters from wishlist, local want list, and vinyl watch list
- `checkForNewReleases()` with batching, retry logic, and exponential backoff
- `fetchMasterVersionsWithRetry()` and `fetchMasterVersionsPaginated()` for paginated version fetching
- `getNewReleases()`, `dismissNewRelease()`, `dismissNewReleasesBulk()`, `dismissAllNewReleases()`, `cleanupDismissedReleases()` CRUD methods
- `getNewReleaseSyncStatus()` and `updateNewReleaseSyncStatus()` for progress tracking
- API routes: `GET /api/v1/wishlist/new-releases`, `GET/POST /api/v1/wishlist/new-releases/status|check`, `PATCH /:id/dismiss`, `POST /dismiss-bulk`, `POST /dismiss-all`, `POST /cleanup`
- Data files registered in migrationService.ts with schemaVersion: 1
- Frontend API client methods in api.ts
- `NewReleasesTab` component with filters (source, days, dismissed) and "Dismiss All" button
- `NewReleaseCard` component with dismiss workflow
- "New Releases" tab added to WishlistPage with badge count
- Full CSS styling for new release components
- 21 route tests (63 total for wishlist routes)
- All 2051 tests passing

**Implementation Details:**
- Batch processing: 20 masters per check cycle
- Rate limiting: 1.1 seconds between API calls
- Retry logic: 3 attempts with exponential backoff (2s → 4s → 60s max)
- Version pagination: Up to 100 versions per master, sorted newest first
- Vinyl filtering: LP, 12", 10", 7" formats only
- Source tracking: Discogs wishlist, local want list, vinyl watch list

### Implementation Plan
See `.plan/wishlist-new-release-tracking-plan.md` for full specification.

### Overview
Track new vinyl pressings for albums on your wishlist by monitoring the Discogs master ID to release ID cache. When a master release gets a new vinyl version, notify the user so they can consider purchasing it.

This feature complements Feature 5 (MusicBrainz new release tracking) by focusing on **new pressings of existing albums** rather than **new albums from artists**.

### Key Differences from Feature 5

| Aspect | Feature 5 (MusicBrainz) | Feature 5.5 (Wishlist) |
|--------|-------------------------|------------------------|
| **What it tracks** | New albums from artists | New pressings of existing albums |
| **Data source** | MusicBrainz release groups | Discogs versions cache |
| **Scope** | Artists in your collection | Albums on your wishlist |
| **Trigger** | Artist creates new album | Label releases new pressing |
| **Use case** | Discover new music | Don't miss limited vinyl runs |

### Data Sources
- **Discogs Wishlist** - `WishlistItem.masterId`
- **Local Want List** - `LocalWantItem.masterId`
- **Vinyl Watch List** - `VinylWatchItem.masterId`

### Detection Algorithm
1. Collect master IDs from wishlist, local want list, and vinyl watch list
2. For each master, compare current versions cache against fresh API fetch
3. New release ID detected = vinyl pressing we haven't seen before
4. Filter to vinyl formats only, create notification

### Key Features
- "New Releases" tab on existing Wishlist page
- Notification integration for new pressings
- Source filtering (Discogs wishlist vs local want list vs vinyl watch)
- Time-based filtering (past 7 days, 30 days, 90 days)
- Dismiss/acknowledge workflow
- Batch checking with rate limit respect and retry logic

### Phases
1. **Core Infrastructure** - Types, storage, detection logic, API routes ✅
2. **UI Implementation** - New tab, release cards, filters ✅
3. **Settings & Notifications** - Preferences, notification integration ✅
4. **Optimization** - Batch processing, cleanup routines ✅

---

## Implementation Notes

### Priority Order
0. **Foundations** - Security baseline, API conventions, notifications - do alongside Feature 1
1. **Stats Dashboard** - Engaging, uses existing data, high user value
2. **Wishlist & Vinyl Tracking** - Directly supports purchasing decisions
3. **Smart Scrobble Scheduling** - Quality of life improvement
4. **Local Seller Monitoring** - Track local record shops for wishlist items
5. **New Release Tracking** - Nice to have, requires additional API integration

### Feature Dependencies

```
Feature 0C (Data Evolution)
    └── Feature 10 (Backup & Restore) - BLOCKED until 0C complete

Feature 1 (Stats Dashboard) - COMPLETE ✅
    ├── Feature 9 (Homepage Dashboard) - uses stats components/APIs
    └── Feature 11 (Wrapped) - reuses StatsService + ScrobbleHistoryStorage

Feature 2 (Wishlist) - COMPLETE ✅
    ├── Feature 4 (Seller Monitoring) - COMPLETE ✅ - matches against wishlist
    ├── Feature 5.5 (Wishlist New Releases) - COMPLETE ✅ - tracks new pressings for wishlist items
    └── Feature 8 (Wishlist Enhancements) - extends wishlist UI

Feature 5 (New Releases) - COMPLETE ✅
    └── Uses MusicBrainz API + Cover Art Archive integration

Feature 12 (Cross-Feature Data Enrichment) - COMPLETE ✅
    └── Feature 15 (Artist & Track Deep Dives) - can reuse useCollectionLookup hook

All other features are independent and can be implemented in any order.
```

**Blockers:**
- Feature 10 (Backup) cannot be implemented until Feature 0C (Data Evolution) is complete
- Feature 0C provides schema versioning needed for backup import compatibility

### Technical Considerations

**Rate Limiting:**
- All features involve external API calls
- Implement request queues with delays
- Cache aggressively (24-hour minimum for version/pricing data)
- Background sync jobs rather than real-time queries

**Data Storage:**
- Continue using JSON file storage pattern
- Add `schemaVersion` to new data files for future migrations
- Consider indexing for large datasets (stats queries)

**Background Job Execution Model:**

Since this is a desktop app (not a server), background jobs run while the app is open:

| Job | Trigger | Frequency | Notes |
|-----|---------|-----------|-------|
| Collection preload | App startup | Once per session | Already implemented |
| Scrobble history sync | App startup + manual | On-demand | Already implemented |
| Wishlist sync | App startup + manual | Daily (if stale) | Check `lastSync` timestamp |
| Version/vinyl scan | After wishlist sync | Progressive (10-20/day) | Rate-limited background |
| Seller quick check | App startup + manual | Daily (if stale) | Page 1 of each seller, newest listings |
| Seller full scan | App startup + manual | Weekly (if stale) | 2-3 sellers per session, progressive |
| Seller match cleanup | After seller scan | Per scan | Mark sold listings, prune >30 days |
| New release check | App startup + manual | Weekly (if stale) | For mapped artists, on-demand on page load |
| Pattern recalculation | After history sync | Weekly | Lightweight, local only |
| Image cache cleanup | App startup | Monthly | Prune entries >30 days old |

**Implementation:**
- On startup, check timestamps in status files to determine what needs running
- Long-running jobs (wishlist scan, release check) run in background with progress indicators
- All jobs are interruptible - save progress to resume on next app launch
- Manual trigger buttons available in Settings for each sync type

**UI Patterns:**
- Reuse existing component patterns (cards, tabs, lists)
- Follow established CSS class conventions
- No inline styles (per CLAUDE.md guidelines)

### Testing Strategy

**Quality Gates per Feature:**

| Feature | Integration Tests | E2E Happy Path |
|---------|------------------|----------------|
| Stats Dashboard | 1 per route in `stats.ts` | Load stats page, verify data displays |
| Wishlist | 1 per route in `wishlist.ts` | Sync wishlist, view items, filter |
| Smart Scheduling | 1 per route in `patterns.ts` | Backfill 2 albums with auto-timestamps |
| Local Sellers | 1 per route in `sellers.ts` | Add seller, scan inventory, view matches |
| New Releases | 1 per route in `releases.ts` | View releases, disambiguate artist |
| Wrapped | 1 per route in `wrapped.ts` | Generate wrapped, navigate slides |

**Minimum Requirements:**
- At least 1 integration test per new route group (test actual HTTP request/response)
- At least 1 E2E test per new page (user journey from page load to key action)
- Unit tests for complex service logic (streak calculation, pattern learning)
- Maintain existing coverage baseline for modified files

### Migration Path

Features are independent and can be released incrementally:
1. Stats can be built independently using existing scrobble data
2. Ship wishlist sync without Discovery integration
3. Add Discovery integration after wishlist is stable
4. Smart scheduling can be added to existing scrobble flow incrementally

---

## Feature 6: Forgotten Favorites

### Status: COMPLETE ✅

**Completed:**
- `ForgottenTrack` type in `shared/types.ts`
- `statsService.getForgottenFavorites()` method with 5-minute in-memory caching
- `/api/v1/stats/forgotten-favorites` endpoint with query params (dormantDays, minPlays, limit)
- Forgotten Favorites tab in Discovery page
- Configurable dormant period (3 months to 3 years)
- Configurable minimum play count (5-100 plays)
- Copy to clipboard (single track and all tracks)
- CSV export functionality
- Sorting by play count, artist, track, or dormancy
- Last.fm link for each track
- 12 unit tests for statsService.getForgottenFavorites()
- 11 route tests for /forgotten-favorites endpoint

**Not Yet Implemented:**
- Spotify playlist export (Phase 2)

### Overview
A Discovery feature that surfaces **tracks you loved but haven't listened to recently**. Finds tracks with high all-time play counts that have gone dormant, helping answer: "What songs did I used to love that I've forgotten about?"

### Key Features
- Configurable dormant period (3 months to 3 years)
- Minimum play count filter (5-100 plays)
- Copy to clipboard / CSV export
- Phase 2: Spotify playlist export (opt-in)

### Data Source
- Scans `ScrobbleHistoryIndex` for tracks with high play counts and old `lastPlayed` timestamps
- Keys tracks by `artist|album|track` (keeps separate by album for accurate counts)
- 5-minute in-memory cache to avoid repeated O(n) scans

### Implementation Details
See `.plan/forgotten-favorites-plan.md` for full specification including:
- Backend `statsService.getForgottenFavorites()` method
- `/api/v1/stats/forgotten-favorites` endpoint
- `ForgottenFavoritesTab.tsx` component for Discovery page
- Spotify OAuth integration (Phase 2)

---

## Feature 7: Discard Pile

### Status: COMPLETE ✅

**Completed:**
- `DiscardPileService` (`src/backend/services/discardPileService.ts`) with CRUD, bulk, and orphan operations
- `/api/v1/discard-pile/*` routes (list, add, update, delete, bulk add/remove, stats, ids, mark sold/listed)
- `DiscardPilePage.tsx` with tabs (All, Pending, Listed, Completed, Orphaned), filters, and stats summary
- Edit modal with Discogs marketplace price suggestions (price range and condition-based suggestions)
- Mark as Sold and Mark as Listed quick actions with modals
- Collection view integration with "In Discard Pile" badge on `AlbumCard`
- Release details page "Add to Discard Pile" button
- Sidebar navigation and MainContent routing
- All discard pile types defined in `shared/types.ts`
- 79 tests (41 service tests, 38 route tests)
- Uses `writeJSONWithBackup()` for data safety

**Implementation Details:**
- Keys by `collectionItemId` (not releaseId) to track duplicate copies separately
- Status lifecycle: marked → listed → sold/gifted/removed
- Reason types: selling, duplicate, damaged, upgrade, not_listening, gift, other
- Stats: estimated value, actual sales, by-status/reason breakdown
- Orphan detection (items removed from Discogs collection externally)
- Marketplace price integration in edit modal via `/api/v1/releases/:releaseId/marketplace-stats`

### Overview
Track records from your Discogs collection that you want to get rid of during collection cleanup. Supports tracking duplicates, damaged records, and items to sell/gift.

### Key Features
- Add collection items to discard pile with reason (selling, duplicate, damaged, etc.)
- Track status lifecycle: marked → listed → sold/gifted/removed/traded_in
- Bulk operations from collection view
- Stats: estimated value, actual sales, by-status/reason breakdown
- Orphan detection (items removed from Discogs collection externally)

### Data Model
- Keys by `collectionItemId` (not releaseId) to track duplicate copies separately
- Stores estimated value and actual sale price with currency
- Optional marketplace URL for listed items

### Implementation Details
See `.plan/done/discard-pile-plan.md` for original specification and `.plan/traded-in-archive-plan.md` for the Traded In extension:
- `DiscardPileService` with CRUD and bulk operations
- `/api/v1/discard-pile/*` routes
- `DiscardPilePage.tsx` with filtering and stats
- Collection view integration with badges

### Feature 7.1: Traded In & Local Archive (COMPLETE)
- "Traded In" status for records traded at stores
- Local archive (discard pile items persist as history after Discogs deletion)
- Bulk multi-select for batch trade-in operations
- Backup system integration (fixes existing gap: discard pile not in backups)
- See `.plan/traded-in-archive-plan.md` for full specification

---

## Feature 8: Wishlist & Collection Enhancements

### Status: COMPLETE ✅

**Completed:**
- `POST /api/v1/stats/album-play-counts` batch endpoint with fuzzy matching via `getAlbumHistoryFuzzy()`
- `AlbumIdentifier`, `AlbumPlayCountRequest`, `AlbumPlayCountResult`, `AlbumPlayCountResponse` types
- WishlistPage: "Scrobbles (Most Played)" sort option with client-side caching
- CollectionPage: "Scrobbles (Most Played)" sort option with lazy-loaded play counts
- "Include monitored" toggle to merge local want items with Discogs wishlist
- Deduplication logic with "Monitored" badge for items in both sources
- Naming convention updates: "Wanted" → "Monitoring", "Want" → "Monitor", "In Wantlist" → "In Wishlist"
- 11 new tests for album-play-counts endpoint
- Updated WishlistPage and DiscoveryPage tests for naming changes

**Implementation Details:**
- Play counts fetched via batch endpoint, cached client-side for session
- Fuzzy matching handles naming differences between Discogs and Last.fm
- Zero play count labels hidden for cleaner UI
- Local items use negative IDs to avoid React key collisions with Discogs items

### Overview
Four enhancements across Wishlist and Collection pages:
1. **Sort Wishlist by scrobble count** - Order wishlist items by how often you've listened to that album
2. **Sort Collection by scrobble count** - Order collection items by play count (reuses same batch endpoint)
3. **Include monitored albums toggle** - Show local want items alongside Discogs wishlist
4. **Better naming conventions** - Clarify Discogs wishlist vs local monitoring

### Key Features
- Batch endpoint for album play count lookup using fuzzy matching (`POST /api/v1/stats/album-play-counts`)
- Add "Scrobbles" sort option to both WishlistPage and CollectionPage
- Merge/dedupe logic for items in both Discogs wishlist and local monitoring
- Consistent terminology: "Wishlist" (Discogs) vs "Monitoring" (local)

### Implementation Details
See `.plan/wishlist-enhancements-plan.md` for full specification including:
- `POST /api/v1/stats/album-play-counts` batch endpoint (shared by Wishlist and Collection)
- WishlistPage: Enrich items with play counts, add "Scrobbles" sort option
- CollectionPage: Lazy-load play counts when "Scrobbles" sort selected (single request)
- `includeTracked` toggle with deduplication
- UI naming changes: "Wanted" → "Monitoring", "Want" → "Monitor", etc.

---

## Feature 9: Homepage Dashboard

### Status: COMPLETE ✅

**Completed:**
- `GET /api/v1/stats/dashboard` aggregated endpoint with isolated error handling
- Dashboard components: `DashboardStatCard`, `QuickActionsGrid`, `RecentAlbums`, `MonthlyHighlights`, `ConnectionStatus`
- Reuses `CalendarHeatmap` and `MilestoneProgress` from Stats page
- All inline styles removed from HomePage.tsx - uses CSS classes
- Secondary data (heatmap, milestones) loads non-blocking after initial render
- Collapsible connection status (auto-collapses when all connected)
- Dashboard types in `shared/types.ts` (`DashboardData`, `DashboardQuickStats`, etc.)
- Tests updated for new dashboard functionality

**Implementation Details:**
- Quick Stats: streak, monthly scrobbles, new artists, collection coverage, listening hours
- Quick Actions: seller matches, missing albums, dusty corners with navigation
- Recent Albums: last 5 albums played (album-focused, not track-focused)
- Monthly Highlights: top 5 artists and albums for current month
- Fast initial render with progressive loading of secondary data

### Overview
Transform the homepage from a basic onboarding page into an **engaging dashboard** that surfaces key metrics and insights from across the entire app. Users should see immediate value when opening the app.

### Key Features
- **Quick Stats Row** - Current streak, monthly scrobbles, new artists, collection coverage, listening hours
- **Quick Actions** - Actionable alerts (seller matches, missing albums, want list items, dusty corners)
- **Recent Albums** - Last 5 albums played (compact, album-focused instead of track-focused)
- **Monthly Highlights** - Top 5 artists and albums for current month
- **Calendar Heatmap** - Visual listening activity (reused from Stats page)
- **Milestone Progress** - Progress toward next scrobble milestone
- **Collapsible Connection Status** - Server/auth status (collapsed when all connected)

---

## Feature 10: Backup & Restore

### Status: COMPLETE ✅

**Completed:**
- `BackupService` (`src/backend/services/backupService.ts`) with export/import/checksum logic
- `/api/v1/backup/*` routes (preview, export, import, settings, auto-backups)
- Settings page "Backup" tab with export preview, credential encryption, import dialog
- Auto-backup scheduler with retention (disabled by default)
- PBKDF2 key derivation + AES-256-GCM encryption for credentials
- Merge vs Replace import modes with dry-run preview
- SHA-256 checksum integrity verification
- Migration registration for backup-settings.json
- 60 tests passing (35 service tests, 25 route tests)
- All backup types defined in `shared/types.ts`

**Implementation Details:**
- JSON backup format (no ZIP needed for ~15-20KB of data)
- Credentials opt-in with password encryption
- Stable JSON serialization for deterministic checksums
- Conflict resolution in merge mode: keep newer timestamp
- Auto-backup: daily/weekly/monthly frequency options

### Overview
Backup **user-generated data** that cannot be recovered from external APIs. Protects mappings, hidden items, want lists, settings, and monitored sellers from data loss.

### Key Features
- Manual export/import via Settings page
- Optional auto-backups (disabled by default)
- Password-protected credential export (opt-in)
- Merge vs Replace import modes with dry-run preview
- Checksum integrity verification

### Critical Data (~15-20KB)
- API credentials (encrypted, opt-in)
- Album/artist mappings (album, artist, history-artist, MBID)
- Hidden items (albums, artists, releases)
- Local want list, vinyl watch list
- Monitored sellers
- All preference settings (user, suggestion, AI, wishlist, seller, release, sync)
- Excluded artists for new release tracking

### Data Files Backed Up
See `.plan/backup-system-plan.md` for full specification including file paths and merge strategies.

---

## Feature 11: Wrapped (Period In Review)

### Status: COMPLETE ✅

**Completed:**
- `WrappedService` (`src/backend/services/wrappedService.ts`) aggregating listening + collection data over custom date ranges
- `GET /api/v1/wrapped?startDate=<ms>&endDate=<ms>` endpoint with validation (numeric, finite, range, future-date checks)
- `WrappedPage.tsx` with date picker (presets + custom range) and full-screen slideshow presentation
- 14 slide components: TotalScrobbles, TopArtists, TopAlbums, TopTracks, UniqueCounts, NewArtists, PeakDay, PeakHour, Streak, Heatmap, RecordsAdded, MostPlayedAddition, CollectionCoverage, VinylVsDigital
- `WrappedSlideshow.tsx` container with keyboard navigation (arrows, space, escape, home, end)
- `WrappedNav.tsx` with forward/back buttons and progress dots
- Cross-source insights: collection coverage, vinyl vs digital ratio, most-played new addition with fuzzy matching
- Image enrichment for top artists and albums via ImageService
- CSS animations (fade-in, slide-up transitions), no inline styles (CSS custom properties via ref callbacks)
- Reuses existing `CalendarHeatmap` component for heatmap slide
- Route registration (`#wrapped`), sidebar nav under Listening group
- 55 wrapped-specific tests: 20 service, 8 route, 10 WrappedPage, 17 WrappedSlideshow
- All 2726 tests passing, lint/typecheck/build clean
- All types defined in `shared/types.ts` (`WrappedData`, `WrappedListeningStats`, `WrappedCollectionStats`, `WrappedCrossSourceStats`, etc.)

**Implementation Details:**
- Stateless: data generated fresh on each request, no data files or migrations
- Range-filtered scrobble aggregation from `ScrobbleHistoryStorage` index
- Delegates to `StatsService` for top artists/albums/tracks with date ranges
- Collection `date_added` filtering for records added in range
- Session-file timestamp matching for vinyl vs digital breakdown
- `trackNormalization.ts` fuzzy matching for most-played new addition and collection coverage

### Implementation Plan
See `.plan/done/wrapped-plan.md` for full specification.

### Overview
A Spotify Wrapped-inspired feature that generates a **flashy, slide-by-slide personal recap** of your listening and vinyl collecting activity for any chosen date range. Combines Last.fm scrobble data (listening stats) with Discogs collection data (records added) into a visually rich, story-style presentation.

Unlike Spotify Wrapped (yearly only), this supports **custom date ranges** plus presets (this year, last 6 months, etc.). Data is generated fresh on each request -- not saved to disk.

### Key Features

**Date Range Selection:**
- Presets: "This Year", "2025", "Last 6 Months", "Last 3 Months", "This Month", "Last Month"
- Custom: start date + end date pickers

**14 Slides:**
1. Total scrobbles + listening hours
2. Top 5 artists with images and play count bars
3. Top 5 albums with cover art and play count bars
4. Top 5 tracks with play counts
5. Unique artists + unique albums
6. New artists discovered
7. Peak listening day
8. Peak listening hour
9. Longest streak
10. Calendar heatmap
11. Records added to collection
12. Most-played new addition
13. Collection coverage
14. Vinyl vs digital ratio

**Presentation:**
- Full-screen slideshow with animated transitions
- Keyboard navigation (arrow keys, space, escape, home, end)
- Progress dots showing current slide position

---

## Feature 12: Cross-Feature Data Enrichment

### Status: COMPLETE ✅

**Completed:**
- Play count badges and last-played on AlbumCard (Collection view) -- eagerly fetched on load
- "In Collection" badges on Stats top album lists (`OWNED` badge) and top artist lists (`N owned` count)
- Prominent play counts on Wishlist cards (always visible, not just when sorting by scrobbles)
- Play counts on Seller Match cards with "Last listened" and "Never listened" indicators
- "You Own This" indicators on Forgotten Favorites with "Go to Album" navigation
- "In Collection" badges on Scrobble History entries with "View in Collection" links
- Album track completeness indicator ("8/12 tracks played") on release details with progress bar
- Reusable `useCollectionLookup` hook for fuzzy collection matching across features
- `GET /api/v1/stats/album-tracks-played` endpoint for track completeness data
- `POST /api/v1/stats/album-play-counts` enhanced with mapping pipeline (mappingService + artistMappingService) for accurate matching
- 27 files changed across 7 implementation phases
- All 2765 tests passing

**Implementation Details:**
- Batch play count endpoint uses `mappingService.getAllAlbumMappingsForCollection()` and `artistMappingService.getLastfmName()` for accurate Discogs→Last.fm name resolution
- `useCollectionLookup` hook builds normalized Map for O(1) fuzzy lookups, reusable by Features 13-15
- All data fetching uses AbortController cleanup to prevent stale state updates
- Zero-play albums show no badge (clean UI); graceful degradation when no auth/data

**Implementation Plan:** See `.plan/done/cross-feature-data-enrichment-plan.md`

**Dependencies:** None (builds on existing endpoints and data)

**Priority:** HIGH -- affects most-used pages, low complexity

---

## Feature 13: Collection Analytics

### Status: PLANNED

Discogs-only collection analytics: value estimation, format breakdown, label distribution, decade histogram, and collection growth timeline. No Last.fm dependency.

**Key Deliverables:**
- Collection value estimation via Discogs marketplace stats (progressive scan)
- Format breakdown (LP, 7", 12", Box Set, etc.)
- Label distribution (top labels with normalization)
- Decade/year histogram
- Collection growth timeline (monthly/yearly)
- New Collection Analytics page with tabs

**Implementation Plan:** See `.plan/collection-analytics-plan.md`

**Dependencies:** None (Discogs-only)

**Priority:** MEDIUM -- valuable for collectors, moderate complexity

---

## Feature 14: Listening Pattern Visualizations

### Status: PLANNED

Deeper listening pattern analysis on the Stats Dashboard: hourly polar chart, day-of-week bars, genre treemap, "On This Day" nostalgia feature, heatmap click-to-expand, and Wrapped without Discogs.

**Key Deliverables:**
- Hourly distribution polar chart
- Day-of-week bar chart
- Genre/tag treemap (from Last.fm artist.getTopTags)
- "On This Day" feature (1/2/3 years ago)
- Calendar heatmap click-to-expand (show albums played that day)
- Wrapped without Discogs (10 of 14 slides work with Last.fm only)

**Implementation Plan:** See `.plan/listening-pattern-visualizations-plan.md`

**Dependencies:** None

**Priority:** MEDIUM-HIGH -- high engagement value, builds on existing data

---

## Feature 15: Artist & Track Deep Dives

### Status: PLANNED

Dedicated detail pages for individual artists and tracks, reachable from anywhere artist/track names appear. Transforms static text into an interconnected navigation experience.

**Key Deliverables:**
- Artist detail page (play trend, top tracks, albums, collection cross-reference)
- Track detail page (play history, albums it appears on)
- ArtistLink / TrackLink navigation components
- PlayTrendChart reusable component
- Integration across Stats, History, Collection, Discovery pages

**Implementation Plan:** See `.plan/artist-track-deep-dives-plan.md`

**Dependencies:** Feature 12 (useCollectionLookup hook) recommended but not required

**Priority:** MEDIUM -- high engagement value, moderate complexity
