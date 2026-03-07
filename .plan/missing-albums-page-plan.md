# Missing Albums Page - Implementation Plan

## Overview

Create a UI page that surfaces the ~7,000 scrobbles silently dropped during Last.fm sync due to missing album metadata, and lets users map them to albums so they count toward stats. Currently `scrobbleHistorySyncService.ts` line 217 skips any scrobble where `!album`, causing the dashboard to show ~53,493 vs Last.fm's 60,488.

---

## Problem

- Last.fm tracks don't always have album metadata (singles, radio plays, tracks scrobbled without album info)
- The sync service treats empty album as falsy and rejects the entire scrobble
- ~11.5% of scrobbles are silently lost
- All downstream stats (milestones, streaks, collection coverage) are understated
- Users notice the gap when comparing to Last.fm's official count

---

## Backend Changes

### 1. Store Orphaned Scrobbles During Sync

**File**: `src/backend/services/scrobbleHistorySyncService.ts`

Instead of `continue` when `!album`, persist to a separate orphaned scrobbles store:

```
data/history/orphaned-scrobbles.json
```

Each entry: `{ artist, track, timestamp, reason: 'missing_album' }`

Deduplicate on `artist + track + timestamp` to avoid ballooning on re-syncs.

### 2. New API Endpoints

**File**: `src/backend/routes/` (new `orphanedScrobbles.ts` or extend `stats.ts`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/scrobbles/orphaned` | List orphaned scrobbles, grouped by artist, with pagination and search |
| `GET` | `/scrobbles/orphaned/stats` | Summary: total orphaned count, Last.fm total, dashboard total |
| `POST` | `/scrobbles/orphaned/map` | Map artist+track combos to an album name, re-process into main index |
| `DELETE` | `/scrobbles/orphaned/dismiss` | Dismiss/hide specific orphaned scrobbles the user doesn't care about |

### 3. Mapping Logic

When user maps orphaned scrobbles to an album:
1. Create proper scrobble entries with the provided album name
2. Insert into the main scrobble history index
3. Remove from orphaned store
4. Increment `index.totalScrobbles`
5. Invalidate any cached stats

---

## Frontend Changes

### 4. MissingAlbumsPage.tsx

**Location**: `src/renderer/pages/MissingAlbumsPage.tsx`

Follow existing page patterns (NewReleasesPage layout, CSS modules not inline styles).

#### Summary Banner
```
7,012 scrobbles without album metadata
Last.fm reports 60,488 total — Dashboard shows 53,493
```

#### Grouped List View
- Group orphaned scrobbles by artist
- Each group shows: artist name, track names, total play count, date range (earliest → latest)
- Sortable by: artist name, play count, date range
- Searchable by artist or track name

#### Map to Album Action
- Per artist-group or per track: "Map to Album" button
- Opens a modal with:
  - Search existing albums already in the scrobble index
  - Freeform text input for a new album name
  - Preview of how many scrobbles will be mapped
- On confirm: POST to mapping endpoint, refresh stats

#### Dismiss Action
- "Dismiss" button to hide scrobbles the user doesn't want to map (podcasts, radio, etc.)
- Dismissed scrobbles still count in the gap summary but are hidden from the list

### 5. Navigation

Add "Missing Albums" as a link/badge in the sidebar or as a sub-section accessible from the Stats dashboard, showing a count badge when orphaned scrobbles exist.

---

## Data Model

```typescript
interface OrphanedScrobble {
  artist: string;
  track: string;
  timestamp: number;
  reason: 'missing_album' | 'missing_artist' | 'missing_timestamp';
  dismissed?: boolean;
}

interface OrphanedScrobbleGroup {
  artist: string;
  tracks: { track: string; playCount: number; firstSeen: number; lastSeen: number }[];
  totalPlays: number;
}

interface OrphanedScrobbleStats {
  totalOrphaned: number;
  totalDismissed: number;
  lastfmTotal: number;
  dashboardTotal: number;
  gap: number;
}
```

---

## Test Strategy

- Unit test orphaned scrobble storage during sync (verify skipped scrobbles are persisted, not lost)
- Unit test deduplication on re-sync
- Test mapping endpoint (verify mapped scrobbles appear in main index, stats update correctly)
- Test grouping and search logic
- Frontend tests: page rendering, search, mapping modal interaction, dismiss flow

---

## Status

**Backlog** — not started
