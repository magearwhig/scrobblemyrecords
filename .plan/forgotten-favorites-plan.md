# Forgotten Favorites - Implementation Plan

## Overview

A new Discovery feature that surfaces **tracks you loved but haven't listened to recently**. Unlike "Dusty Corners" (which shows albums from your collection), this feature finds your **most-played tracks that have gone dormant** - helping you rediscover favorites from any source.

---

## Feature Concept

### What It Does
- Finds tracks with **high all-time play counts** that haven't been played in a **configurable time period**
- Allows export to **Spotify playlists** for easy listening (Phase 2, behind settings toggle)
- Helps answer: "What songs did I used to love that I've forgotten about?"

### Why It's Valuable
- Nostalgia: Resurface songs you may have loved years ago
- Re-discovery: Find great tracks buried in your listening history
- Playlist creation: Generate "throwback" or "forgotten gems" playlists automatically

---

## User Interface

### Location
Add as a **new tab in Discovery page** (alongside "Missing Albums" / "Missing Artists")

### UI Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Discovery                                                                │
├─────────────────────────────────────────────────────────────────────────┤
│ [Missing Albums] [Missing Artists] [Forgotten Favorites]  ← NEW TAB     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ Forgotten Favorites                                                      │
│ Tracks you used to play frequently but haven't heard in a while.         │
│                                                                          │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Not played in: [3 months ▼]  Min plays: [10 ▼]                      │ │
│ │                                                                       │ │
│ │ [Copy List]  [Export CSV]  [Create Spotify Playlist ♫]              │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│ Showing 100 of 156 tracks (sorted by play count)                        │
│                                                                          │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Track                          Artist      Album       Plays  Last   │ │
│ ├─────────────────────────────────────────────────────────────────────┤ │
│ │ ♫ Fake Plastic Trees           Radiohead   The Bends   87    Jan 15 │ │
│ │ ♫ Such Great Heights           Postal S.   Give Up     64    Dec 3  │ │
│ │ ♫ Maps                         Yeah Yeah   Fever to... 52    Nov 8  │ │
│ │ ♫ Float On                     Modest M.   Good News   48    Oct 22 │ │
│ │ ...                                                                   │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Time Period Options (Dormant Window)
Meaning: "Not played since X days ago"
- 3 months (90 days) - default
- 6 months (180 days)
- 1 year (365 days)
- 2 years (730 days)
- 3 years (1095 days)

### Minimum Plays Filter
- 5 plays
- 10 plays (default)
- 20 plays
- 50 plays
- 100 plays

### Pagination/Limits
- API returns max 100 results per request
- UI shows "Showing X of Y tracks" when more exist
- Results sorted by all-time play count (highest first)

---

## Data Source Analysis

### How Scrobble History Works

The `ScrobbleHistoryIndex` stores data keyed by `artist|album`:

```typescript
interface ScrobbleHistoryIndex {
  albums: Record<string, {      // key: "artist|album" (normalized)
    lastPlayed: number;
    playCount: number;
    plays: Array<{
      timestamp: number;
      track?: string;           // Track name when available
    }>;
  }>;
}
```

**Key observations:**
1. Plays without `track` field exist (older scrobbles, some sources don't send track names)
2. Singles/non-album tracks may have empty album or album = track name
3. Same track on different albums (e.g., studio vs greatest hits) = separate entries

### Track Identity Strategy

**v1 Decision: Keep tracks separate by album**

Keying by `artist|album|track` means:
- "Creep" on *Pablo Honey* and "Creep" on *Best of Radiohead* are separate entries
- This is **acceptable for v1** because:
  - Preserves accurate play counts per release
  - Avoids complex deduplication logic
  - User sees which version they actually played

**v2 Enhancement (optional):**
- Add UI toggle: "Merge tracks across albums"
- Would key by `artist|track` only
- More complex: needs to aggregate play counts and pick most recent lastPlayed

### Handling Edge Cases

| Case | Behavior |
|------|----------|
| No `track` field on play | Skip this play (can't identify track) |
| Empty album name | Display as "(Single)" in UI |
| Album name = track name | Likely a single; display as "(Single)" |

---

## Data Model

### New Type Definitions

```typescript
// src/shared/types.ts

/**
 * A track that was frequently played but hasn't been listened to recently
 */
export interface ForgottenTrack {
  artist: string;
  album: string;                 // Empty string means single/unknown
  track: string;
  allTimePlayCount: number;      // Total plays ever
  lastPlayed: number;            // Unix timestamp (seconds)
  daysSincePlay: number;         // Calculated for display
  firstPlayed?: number;          // When first scrobbled (optional)
}

/**
 * Spotify playlist creation request
 */
export interface SpotifyPlaylistRequest {
  name: string;
  description?: string;
  tracks: Array<{
    artist: string;
    track: string;
    album?: string;
  }>;
  isPublic: boolean;
}

/**
 * Spotify auth tokens (encrypted at rest)
 */
export interface SpotifyAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;             // Unix timestamp
  scope: string;
}

/**
 * Spotify connection status for UI
 */
export interface SpotifyStatus {
  connected: boolean;
  username?: string;
  error?: string;
}
```

---

## Backend Implementation

### 1. Stats Service Extension

**File:** `src/backend/services/statsService.ts`

```typescript
// In-memory cache for forgotten favorites
private forgottenFavoritesCache: {
  data: ForgottenTrack[];
  params: string;  // JSON of {dormantDays, minPlays, limit}
  timestamp: number;
} | null = null;

private readonly FORGOTTEN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get tracks with high play counts that haven't been played recently.
 *
 * Performance: O(n) scan of all plays in history index.
 * Results are cached for 5 minutes to avoid repeated scans.
 *
 * @param dormantPeriodDays - Days since last play to consider "forgotten"
 * @param minPlayCount - Minimum all-time plays to qualify
 * @param limit - Max tracks to return (capped at 100)
 */
async getForgottenFavorites(
  dormantPeriodDays: number = 90,
  minPlayCount: number = 10,
  limit: number = 100
): Promise<{ tracks: ForgottenTrack[]; totalMatching: number }> {
  // Cap limit at 100
  const cappedLimit = Math.min(limit, 100);

  // Check cache
  const cacheKey = JSON.stringify({ dormantPeriodDays, minPlayCount });
  if (
    this.forgottenFavoritesCache &&
    this.forgottenFavoritesCache.params === cacheKey &&
    Date.now() - this.forgottenFavoritesCache.timestamp < this.FORGOTTEN_CACHE_TTL_MS
  ) {
    return {
      tracks: this.forgottenFavoritesCache.data.slice(0, cappedLimit),
      totalMatching: this.forgottenFavoritesCache.data.length,
    };
  }

  const index = await this.historyStorage.getIndex();
  if (!index) {
    return { tracks: [], totalMatching: 0 };
  }

  const now = Date.now() / 1000;
  const cutoffTimestamp = now - (dormantPeriodDays * 24 * 60 * 60);

  // Build track play counts from all albums
  // Key: "artist|album|track" (normalized)
  const trackStats = new Map<string, {
    artist: string;
    album: string;
    track: string;
    count: number;
    lastPlayed: number;
    firstPlayed: number;
  }>();

  for (const [key, albumHistory] of Object.entries(index.albums)) {
    const [artist, album] = key.split('|');

    for (const play of albumHistory.plays) {
      // Skip plays without track info
      if (!play.track) continue;

      const trackKey = `${artist}|${album}|${play.track.toLowerCase()}`;
      const existing = trackStats.get(trackKey);

      if (existing) {
        existing.count++;
        if (play.timestamp > existing.lastPlayed) {
          existing.lastPlayed = play.timestamp;
        }
        if (play.timestamp < existing.firstPlayed) {
          existing.firstPlayed = play.timestamp;
        }
      } else {
        trackStats.set(trackKey, {
          artist,
          album,
          track: play.track,
          count: 1,
          lastPlayed: play.timestamp,
          firstPlayed: play.timestamp,
        });
      }
    }
  }

  // Filter to forgotten tracks only
  const forgottenTracks: ForgottenTrack[] = [];

  for (const stats of trackStats.values()) {
    // Must have enough plays AND be dormant (not played since cutoff)
    if (stats.count >= minPlayCount && stats.lastPlayed < cutoffTimestamp) {
      forgottenTracks.push({
        artist: this.capitalizeArtist(stats.artist),
        album: stats.album ? this.capitalizeTitle(stats.album) : '',
        track: this.capitalizeTitle(stats.track),
        allTimePlayCount: stats.count,
        lastPlayed: stats.lastPlayed,
        daysSincePlay: Math.floor((now - stats.lastPlayed) / (24 * 60 * 60)),
        firstPlayed: stats.firstPlayed,
      });
    }
  }

  // Sort by play count (most played forgotten tracks first)
  forgottenTracks.sort((a, b) => b.allTimePlayCount - a.allTimePlayCount);

  // Update cache (store all results, not just limited)
  this.forgottenFavoritesCache = {
    data: forgottenTracks,
    params: cacheKey,
    timestamp: Date.now(),
  };

  return {
    tracks: forgottenTracks.slice(0, cappedLimit),
    totalMatching: forgottenTracks.length,
  };
}
```

### 2. API Route

**File:** `src/backend/routes/stats.ts`

```typescript
/**
 * GET /api/v1/stats/forgotten-favorites
 * Get tracks with high play counts that haven't been played recently.
 *
 * Query params:
 *   dormantDays: number (default: 90) - Days since last play
 *   minPlays: number (default: 10) - Minimum all-time play count
 *   limit: number (default: 100, max: 100) - Max results
 */
router.get('/forgotten-favorites', async (req: Request, res: Response) => {
  try {
    const dormantDays = Math.max(1, parseInt(req.query.dormantDays as string) || 90);
    const minPlays = Math.max(1, parseInt(req.query.minPlays as string) || 10);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 100));

    const result = await statsService.getForgottenFavorites(
      dormantDays,
      minPlays,
      limit
    );

    res.json({
      success: true,
      data: result.tracks,
      meta: {
        dormantDays,
        minPlays,
        limit,
        returned: result.tracks.length,
        totalMatching: result.totalMatching,
      },
    });
  } catch (error) {
    logger.error('Error getting forgotten favorites', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
```

### 3. API Client

**File:** `src/renderer/services/api.ts`

```typescript
async getForgottenFavorites(
  dormantDays: number = 90,
  minPlays: number = 10,
  limit: number = 100
): Promise<{ tracks: ForgottenTrack[]; totalMatching: number }> {
  const response = await this.api.get('/stats/forgotten-favorites', {
    params: { dormantDays, minPlays, limit },
  });
  return {
    tracks: response.data.data,
    totalMatching: response.data.meta.totalMatching,
  };
}
```

---

## Export Functionality (Phase 1)

### Copy to Clipboard
Format: `Artist - Track` (one per line)

```typescript
const handleCopyToClipboard = () => {
  const text = tracks.map(t => `${t.artist} - ${t.track}`).join('\n');
  navigator.clipboard.writeText(text);
  showToast('Copied to clipboard');
};
```

### Export CSV
Format: Standard CSV with headers

```typescript
const handleExportCSV = () => {
  const headers = ['Artist', 'Track', 'Album', 'Play Count', 'Last Played'];
  const rows = tracks.map(t => [
    t.artist,
    t.track,
    t.album || '(Single)',
    t.allTimePlayCount.toString(),
    new Date(t.lastPlayed * 1000).toISOString().split('T')[0],
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `forgotten-favorites-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};
```

---

## Spotify Integration (Phase 2)

### Feature Flag
Spotify integration is **opt-in** via Settings page:

```typescript
// Settings > Integrations section
[ ] Enable Spotify integration
    Connect your Spotify account to create playlists directly.
    [Connect to Spotify]  Status: Not connected
```

### UI States

| State | UI Display |
|-------|------------|
| Feature disabled | "Create Spotify Playlist" button hidden |
| Feature enabled, not connected | "Connect Spotify" button |
| Connected | "Create Spotify Playlist" button (green) |
| Creating playlist | "Creating..." with spinner |
| Partial match | Success modal showing "Added X of Y tracks. Z tracks not found on Spotify." |
| Auth error | "Spotify connection failed. Please reconnect." |

### Spotify Service (abbreviated)

**File:** `src/backend/services/spotifyService.ts`

Key methods:
- `getAuthUrl()` - Returns OAuth URL
- `handleCallback(code)` - Exchanges code for tokens
- `isAuthenticated()` - Checks if valid tokens exist
- `disconnect()` - Clears stored tokens
- `searchTrack(artist, track, album?)` - Returns Spotify URI or null
- `createPlaylist(name, description, trackUris, isPublic)` - Creates playlist

### Track Matching Strategy

```typescript
async searchTrack(artist: string, track: string, album?: string): Promise<string | null> {
  // Attempt 1: Full match with album
  if (album) {
    const uri = await this.search(`track:${track} artist:${artist} album:${album}`);
    if (uri) return uri;
  }

  // Attempt 2: Without album
  const uri = await this.search(`track:${track} artist:${artist}`);
  if (uri) return uri;

  // Attempt 3: Simplified names (remove parentheses, "feat.", etc.)
  const simplifiedTrack = track.replace(/\s*\(.*?\)\s*/g, '').replace(/\s*feat\..*$/i, '');
  const simplifiedArtist = artist.replace(/\s*&.*$/, ''); // "Artist & Other" -> "Artist"

  if (simplifiedTrack !== track || simplifiedArtist !== artist) {
    return await this.search(`track:${simplifiedTrack} artist:${simplifiedArtist}`);
  }

  return null;
}
```

---

## Implementation Phases

### Phase 1: Core Feature (No Spotify)

**Deliverables:**
1. `ForgottenTrack` type in `types.ts`
2. `getForgottenFavorites()` in `statsService.ts` with caching
3. `/forgotten-favorites` endpoint in stats routes
4. API client method
5. `ForgottenFavoritesTab.tsx` component
6. Tab in Discovery page
7. CSS styles in `styles.css`
8. Copy to clipboard functionality
9. CSV export functionality

**Test Coverage Targets:**
- `statsService.getForgottenFavorites()` - unit tests
  - Returns empty for no history
  - Filters by dormant period correctly
  - Filters by min play count correctly
  - Respects limit parameter
  - Cache hit/miss behavior
  - Handles missing track names gracefully
- Stats route - integration tests
  - Parameter validation (negative values, out of range)
  - Response structure
- UI component - render tests
  - Loading state
  - Empty state
  - List rendering
  - Filter changes trigger reload

### Phase 2: Spotify Integration

**Deliverables:**
1. Spotify settings toggle in Settings page
2. `SpotifyService` with OAuth flow
3. Spotify routes (`/auth`, `/callback`, `/status`, `/disconnect`)
4. "Connect Spotify" UI flow
5. "Create Spotify Playlist" button
6. Track matching with fallbacks
7. Success/partial success modal

**Test Coverage Targets:**
- `spotifyService` - unit tests (mocked HTTP)
  - Token refresh logic
  - Track search fallback chain
  - Playlist creation
- Spotify routes - integration tests
  - Auth URL generation
  - Status endpoint
- UI - render tests
  - Connection states
  - Error handling
  - Partial match display

---

## Decisions Made

| Question | Decision | Rationale |
|----------|----------|-----------|
| What counts as "recent"? | Any play resets dormant timer | Simple, intuitive; v2 could add "N plays in Y days" |
| Track identity (v1)? | Key by `artist\|album\|track` | Accurate per-release counts; merging is complex |
| Custom timeframes? | Preset dormant windows (days) | "Not played since X days ago" is clearer than date ranges |
| Spotify enabled by default? | No, opt-in via Settings | Reduces complexity for users who don't want it |
| Handle plays without track name? | Skip them | Can't identify track; common in older scrobbles |
| Singles/empty album? | Display as "(Single)" | Clear UX, doesn't break anything |

---

## File Changes Summary

### New Files
- `src/renderer/components/ForgottenFavoritesTab.tsx`
- `src/backend/services/spotifyService.ts` (Phase 2)
- `src/backend/routes/spotify.ts` (Phase 2)
- `tests/backend/statsService.forgottenFavorites.test.ts`
- `tests/backend/routes/stats.forgottenFavorites.test.ts`
- `tests/frontend/components/ForgottenFavoritesTab.test.tsx`

### Modified Files
- `src/shared/types.ts` - Add `ForgottenTrack`, `SpotifyAuthTokens`, `SpotifyStatus`
- `src/backend/services/statsService.ts` - Add `getForgottenFavorites()` with cache
- `src/backend/routes/stats.ts` - Add endpoint
- `src/renderer/services/api.ts` - Add API method
- `src/renderer/pages/DiscoveryPage.tsx` - Add new tab
- `src/renderer/styles.css` - Add component styles
- `src/server.ts` - Register Spotify routes (Phase 2)
- `src/renderer/pages/SettingsPage.tsx` - Add Spotify toggle (Phase 2)
- `.env.example` - Add `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` (Phase 2)

---

## Technical Considerations

### Performance

| Concern | Mitigation |
|---------|------------|
| O(n) scan of all plays | 5-minute in-memory cache |
| Large history (100k+ plays) | Cache makes repeated requests fast; initial load acceptable |
| Spotify rate limits (~180/min) | Batch track searches; show progress for large playlists |

### Cache Behavior

- Cache key: `{dormantDays, minPlays}` (limit not included - we store all results)
- TTL: 5 minutes
- Invalidation: None automatic; cache expires naturally
- Memory: Stores full result set; ~100KB for 1000 tracks

### Security

- Spotify tokens encrypted at rest (same pattern as Last.fm/Discogs)
- Refresh tokens before expiry
- Settings toggle to disconnect Spotify

---

## Test Checklist

Maintain 90%+ coverage baseline:

- [ ] **statsService.getForgottenFavorites()**
  - [ ] Returns empty array for empty/null index
  - [ ] Correctly filters by dormant period
  - [ ] Correctly filters by minimum plays
  - [ ] Respects limit parameter (capped at 100)
  - [ ] Skips plays without track field
  - [ ] Cache returns same data within TTL
  - [ ] Cache invalidates after TTL
  - [ ] Handles album key split correctly (no crash on malformed keys)

- [ ] **Stats route /forgotten-favorites**
  - [ ] Returns 200 with valid params
  - [ ] Defaults params when missing
  - [ ] Clamps negative/zero values to 1
  - [ ] Caps limit at 100
  - [ ] Response includes meta with totalMatching

- [ ] **ForgottenFavoritesTab component**
  - [ ] Renders loading state
  - [ ] Renders empty state with helpful message
  - [ ] Renders track list
  - [ ] Filter changes trigger API call
  - [ ] Copy to clipboard works
  - [ ] CSV export generates valid file
  - [ ] Displays "(Single)" for empty album

- [ ] **Spotify integration (Phase 2)**
  - [ ] Auth URL generated correctly
  - [ ] Token exchange works
  - [ ] Token refresh before expiry
  - [ ] Track search fallback chain
  - [ ] Partial match handling
  - [ ] Disconnect clears tokens

---

## Summary

This feature surfaces forgotten favorites from your scrobble history with configurable filters, caching for performance, and clear export options. Phase 1 delivers immediate value with the track list and CSV/clipboard export. Phase 2 adds opt-in Spotify integration for frictionless playlist creation.

Key improvements from review feedback:
- Added 5-minute caching layer
- Clarified track identity strategy (keep separate by album for v1)
- Added explicit test coverage targets
- Documented data source assumptions and edge cases
- Added CSV export format specification
- Clarified that Spotify is behind a settings toggle
- Added UI pagination messaging ("Showing X of Y")
