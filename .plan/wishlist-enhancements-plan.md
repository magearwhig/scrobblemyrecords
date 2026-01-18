# Wishlist Page Enhancements - Implementation Plan

## Overview

Three enhancements for the Wishlist page:
1. **Sort by scrobble count** - Order wishlist items by how many times you've listened to that album
2. **Include local wantlist toggle** - Show local want items alongside Discogs wishlist items  
3. **Better naming conventions** - Clarify the difference between Discogs wishlist and local wantlist

---

## Current State

### Two Data Sources
| Source | Type | Tab Location | Origin |
|--------|------|--------------|--------|
| **Discogs Wishlist** | `EnrichedWishlistItem[]` | All, Has Vinyl, CD Only, Affordable | Synced from Discogs |
| **Local Wantlist** | `LocalWantItem[]` | Wanted tab only | Added via Discovery page |

### Existing Utilities (Reuse These)
- `scrobbleHistoryStorage.getPlayCount(artist, album)` - Returns play count for an album
- `scrobbleHistoryStorage.getAlbumHistoryFuzzy(artist, album)` - Fuzzy matching with play history

### Current Terminology (Confusing)

| Location | Current Term | Refers To |
|----------|--------------|-----------|
| Wishlist page tab | "Wanted" | Local want list only |
| Wishlist page button | "Watch" | Add CD-only item to vinyl watch list |
| Discovery badge (purple) | "In Wantlist" | Discogs wishlist |
| Discovery badge (green) | "Wanted" | Local want list |
| Discovery button | "Want" | Adds to local want list |
| Discovery toggle | "Hide wanted" | Hides both sources |

### Key Files
- `src/renderer/pages/WishlistPage.tsx` - Main component
- `src/renderer/pages/DiscoveryPage.tsx` - Discovery page (shows badges, buttons)
- `src/backend/services/scrobbleHistoryStorage.ts` - Has getPlayCount(), getAlbumHistoryFuzzy()
- `src/shared/types.ts` - Type definitions

---

## Enhancement 1: Sort by Scrobble Count

### Challenge
Wishlist items come from Discogs and don't have scrobble data.

### Solution
Cross-reference wishlist items with Last.fm scrobble history using existing `getPlayCount()`.

### Backend Strategy
**Option A (Recommended):** Add batch endpoint that uses existing `getAlbumHistoryFuzzy()` internally.
- Avoids N+1 API calls from frontend
- Leverages existing fuzzy matching logic
- Single endpoint: `POST /api/v1/stats/album-play-counts`

### Implementation Steps

1. **Add to types.ts:**
   - `scrobbleCount?: number` to `EnrichedWishlistItem`
   - `lastScrobbled?: number` timestamp

2. **Add batch endpoint in stats.ts:**
   ```typescript
   // POST /api/v1/stats/album-play-counts
   // Uses historyStorage.getAlbumHistoryFuzzy() internally for each album
   ```

3. **Add API client method:**
   - `getAlbumPlayCounts(albums: Array<{artist, title}>)`

4. **Update WishlistPage.tsx:**
   - Fetch play counts after loading wishlist
   - Enrich items with scrobble data
   - Add "Scrobbles" to `SortOption` type
   - Add sort case for scrobbles (high to low)
   - Display play count on cards

### Design Decisions
- **Scrobble counts are all-time** (not configurable period for v1)
- **Show "0 plays" or hide?** Hide the label when count is 0 (cleaner UI)
- **Stable sort:** When counts are equal, secondary sort by date added

---

## Enhancement 2: Include Tracked Albums Toggle

### Current Behavior
- Discogs items show in main tabs
- Local wantlist only shows in "Wanted" tab
- No unified view

### Implementation Steps

1. **Add state:**
   - `const [includeTracked, setIncludeTracked] = useState(false)`

2. **Merge data in filteredItems:**
   - When toggled, convert `LocalWantItem` to wishlist-compatible format
   - Add `isTracked: true` flag to identify source

3. **Add toggle UI:**
   - Checkbox next to sort dropdown
   - Label: "Include tracked albums"
   - Hidden on "Tracking" tab (would be redundant)

4. **Add visual indicator:**
   - "Tracked" badge for local items (same green as Discovery)

### Deduplication Rules
When toggle is ON and an album exists in BOTH Discogs wishlist AND local tracked:
- **Show Discogs item only** (it has richer data: price, versions, etc.)
- **Add "Tracked" badge** to indicate it's also being monitored locally
- Match using normalized artist + album comparison

### Filter Behavior for Tracked Items
| Filter | Tracked Items Behavior |
|--------|------------------------|
| All | Included |
| Has Vinyl | Included if `vinylStatus === 'has_vinyl'` |
| CD Only | Included if `vinylStatus === 'cd_only'` |
| Affordable | **Excluded** (no price data) |

### Edge Case: Empty Discogs + Toggle ON
- Show tracked items in main view
- Works naturally since merge adds to empty array

---

## Enhancement 3: Better Naming Conventions

### Current Confusion
- "Wishlist" vs "Wanted" vs "Local Want List" - unclear differences
- "Track" would conflict with existing "Watch" button for CD-only items

### Naming Conflict Analysis
Existing "Watch" button: Adds CD-only Discogs items to vinyl watch list
Proposed "Track": Would be confusing alongside "Watch"

### Proposed Naming Scheme (Avoiding "Track/Watch" Collision)

| Concept | New Name | Description |
|---------|----------|-------------|
| Discogs wishlist | **"Wishlist"** | Albums from your Discogs wantlist |
| Local want list | **"Monitored"** | Albums you're monitoring for vinyl |
| Tab name | **"Monitoring"** | Tab showing monitored albums |
| Action to add | **"Monitor"** | Start monitoring an album |

**Alternative considered:** "Tracked/Tracking" - rejected due to similarity with "Watch"

### All Changes Required

#### WishlistPage.tsx
| Current | New |
|---------|-----|
| "Wanted" tab | "Monitoring" |
| "Your wanted list is empty" | "No albums being monitored" |
| "Add albums from Discovery" | "Use Discovery to find albums to monitor" |
| Toggle label | "Include monitored albums" |

#### DiscoveryPage.tsx
| Current | New |
|---------|-----|
| "In Wantlist" badge (purple) | "In Wishlist" |
| "Wanted" badge (green) | "Monitoring" |
| "Want" button | "Monitor" |
| "Wanted" button state | "Monitoring" |
| "Hide wanted" toggle | "Hide wishlisted & monitored" |

#### Variable Renames (Optional but recommended)
| Current | New |
|---------|-----|
| `addedToWantList` | `monitoredAlbums` |
| `addingToWantList` | `addingToMonitored` |
| `handleAddToWantList` | `handleMonitorAlbum` |
| `isWantedItem` | `isWishlistedOrMonitored` |
| `localWantItems` | `monitoredItems` |

---

## Final UI Design

### Wishlist Page
```
┌──────────────────────────────────────────────────────────────┐
│ Wishlist                              [Sync Discogs] [Refresh]│
├──────────────────────────────────────────────────────────────┤
│ [All] [Has Vinyl] [CD Only] [Affordable] [Monitoring]        │
├──────────────────────────────────────────────────────────────┤
│ Sort by: [Scrobbles ▼]       ☑ Include monitored albums      │
├──────────────────────────────────────────────────────────────┤
│ ┌───────────┐ ┌───────────┐ ┌───────────┐                   │
│ │ Album     │ │ Album     │ │ Album     │                   │
│ │ Artist    │ │ Artist    │ │ Artist    │                   │
│ │ [Vinyl]   │ │ [CD Only] │ │[Monitored]│ ← source badge    │
│ │ 127 plays │ │ 89 plays  │ │ 76 plays  │ ← scrobble count  │
│ │ $24       │ │ [Watch]   │ │ [Shop]    │ ← actions         │
│ └───────────┘ └───────────┘ └───────────┘                   │
└──────────────────────────────────────────────────────────────┘
```

### Discovery Page
```
┌──────────────────────────────────────────────────────────────┐
│ Missing Albums                                               │
│ ☑ Hide wishlisted & monitored                                │
├──────────────────────────────────────────────────────────────┤
│ ┌───────────┐ ┌───────────┐ ┌───────────┐                   │
│ │ Album     │ │ Album     │ │ Album     │                   │
│ │ Artist    │ │ Artist    │ │ Artist    │                   │
│ │ [In       │ │[Monitoring│ │ [Monitor] │ ← button/badge    │
│ │  Wishlist]│ │           │ │           │                   │
│ └───────────┘ └───────────┘ └───────────┘                   │
└──────────────────────────────────────────────────────────────┘
```

---

## Test Plan

### Backend Tests (`tests/backend/`)

#### stats.test.ts - Album Play Counts Endpoint
```typescript
describe('POST /api/v1/stats/album-play-counts', () => {
  it('returns play counts for matching albums');
  it('returns 0 for albums not in history');
  it('uses fuzzy matching for artist/album names');
  it('handles empty album list');
  it('handles albums with special characters');
});
```

### Frontend Tests (`tests/frontend/`)

#### WishlistPage.test.tsx
```typescript
describe('Sort by Scrobbles', () => {
  it('fetches play counts on load');
  it('sorts by scrobble count descending');
  it('shows play count on cards when > 0');
  it('hides play count label when 0');
  it('stable sorts by date when counts equal');
});

describe('Include Monitored Toggle', () => {
  it('shows toggle on non-Monitoring tabs');
  it('hides toggle on Monitoring tab');
  it('merges monitored items when toggled on');
  it('dedupes items in both Discogs and monitored');
  it('excludes monitored items from Affordable filter');
  it('includes monitored items in vinyl status filters');
});
```

#### DiscoveryPage.test.tsx
```typescript
describe('Naming Updates', () => {
  it('shows "In Wishlist" badge for Discogs items');
  it('shows "Monitoring" badge for monitored items');
  it('shows "Monitor" button for unmonitored items');
  it('toggle label says "Hide wishlisted & monitored"');
});
```

---

## Files to Modify

### Phase 1: Sort by Scrobbles
- `src/shared/types.ts` - Add scrobbleCount field
- `src/backend/routes/stats.ts` - Add batch endpoint
- `src/renderer/services/api.ts` - Add client method
- `src/renderer/pages/WishlistPage.tsx` - Enrich, sort, display
- `tests/backend/stats.test.ts` - Endpoint tests

### Phase 2: Include Toggle
- `src/renderer/pages/WishlistPage.tsx` - Toggle, merge, dedupe, filter logic
- `src/renderer/styles.css` - Toggle styling, badge colors
- `tests/frontend/pages/WishlistPage.test.tsx` - Toggle behavior tests

### Phase 3: Naming (ALL locations)
- `src/renderer/pages/WishlistPage.tsx` - Tab label, empty states, toggle label
- `src/renderer/pages/DiscoveryPage.tsx` - Badges, button, toggle text
- `src/renderer/styles.css` - CSS class names (optional)
- `tests/frontend/pages/DiscoveryPage.test.tsx` - Naming tests

---

## Open Questions Resolved

| Question | Decision |
|----------|----------|
| Scrobble counts: all-time or configurable? | **All-time** for v1 |
| Show 0 plays or hide? | **Hide** when 0 |
| Dedupe when in both sources? | **Show Discogs item with "Monitored" badge** |
| Monitored items in Affordable filter? | **Excluded** (no price data) |
| Naming collision with "Watch"? | **Use "Monitor/Monitoring"** instead of "Track" |

---

## Technical Notes

### Album Matching
Use existing `getAlbumHistoryFuzzy()` which handles:
- Case normalization
- Punctuation differences
- Common Last.fm vs Discogs naming quirks

### Performance  
- Batch endpoint: O(n) where n = wishlist items
- Each album lookup: O(1) from index (already loaded in memory)
- Total: Fast for typical wishlist sizes (<500 items)

### Deduplication Key
```typescript
const normalizeKey = (artist: string, album: string) => 
  `${artist.toLowerCase().trim()}|${album.toLowerCase().trim()}`;
```
