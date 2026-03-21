# Memory Scrobble Plan

Retroactively scrobble tracks from offline listening sessions — swimming with underwater headphones, driving, or any situation where live scrobbling isn't possible.

## Summary

Set a listening session time window (e.g., from Apple Watch workout data), then build a scrobble list from memory using a unified typeahead that searches last.fm cached history, saved collections (persistent named track lists), and freeform entry. Timestamps auto-generate sequentially from session start based on track durations. Submit via existing batch scrobble infrastructure.

**Related**: `cancelled/smart-scrobble-scheduling-plan.md` covered album-level backfilling with pattern learning. This plan supersedes it with a more practical approach — track-level recall from offline sessions.

---

## 1. Data Model

### 1a. Saved Collection Types

In `src/shared/types.ts`:

```typescript
interface SavedCollectionTrack {
  artist: string;
  track: string;
  album?: string;
  duration: number;           // seconds (0 = unknown, resolve lazily)
  position: number;           // order in collection
  lastfmMatch: boolean;       // validated against last.fm history on import
}

interface SavedCollection {
  id: string;
  name: string;               // e.g., "OpenSwim Pro"
  description?: string;
  tracks: SavedCollectionTrack[];
  createdAt: number;           // ms (Date.now())
  updatedAt: number;
}

interface SavedCollectionsStore extends VersionedStore {
  schemaVersion: 1;
  collections: SavedCollection[];
}
```

### 1b. Memory Scrobble Types

```typescript
interface MemoryScrobbleTrack extends ScrobbleTrack {
  source: 'history' | 'collection' | 'freeform';
  sourceCollectionId?: string;
  order: number;
}

interface TrackSearchResult {
  artist: string;
  track: string;
  album?: string;
  duration?: number;           // seconds, if known
  source: 'history' | 'collection';
  sourceCollectionId?: string;
  sourceCollectionName?: string;
  playCount?: number;          // history only
  lastPlayed?: number;         // history only
}

interface DurationLookupResult {
  artist: string;
  track: string;
  duration: number | null;     // seconds, null if not found
  source: 'discogs_collection' | 'lastfm' | 'discogs_search' | 'not_found';
}
```

### 1c. Backup Integration

Add `savedCollections: SavedCollection[]` to the existing `BackupData` type.

---

## 2. Backend Changes

### 2a. `LastFmService.getTrackInfo()` — new method

**Modify**: `src/backend/services/lastfmService.ts`

Add `track.getInfo` API call (read-only, API key only). Returns duration in ms from Last.fm; caller converts to seconds. Follow `getArtistInfo()` / `getAlbumInfo()` pattern: return null on error, log at debug level.

### 2b. `SavedCollectionService` — new service

**Create**: `src/backend/services/savedCollectionService.ts`

Follow `DiscardPileService` pattern (VersionedStore, loadStore/saveStore, FileStorage).

- Storage path: `collections/saved-collections.json` (dir already exists)
- CRUD for collections + track management
- CSV import: parse `artist,track,album,duration` format. Duration column optional (supports "MM:SS" or raw seconds). Reuse `parseTrackDuration()` from scrobble routes.
- **Import validation**: For each imported track, check against `ScrobbleHistoryStorage` using fuzzy matching (`fuzzyNormalizeKey`). Set `lastfmMatch: true/false` per track. Return unmatched tracks in the response so the UI can flag them.
- Register in `migrationService.ts` with `optional: true`

### 2c. `DurationLookupService` — new service

**Create**: `src/backend/services/durationLookupService.ts`

Lookup chain (short-circuits on first hit):
1. **Discogs collection** — scan cached `collections/release-*.json` tracklists for matching artist+track. Parse "MM:SS" duration. Local only.
2. **Last.fm `track.getInfo`** — call new `getTrackInfo()`. Convert ms → seconds.
3. **Discogs API search** — search Discogs database for the track. Rate-limited (1 req/sec).
4. Return `not_found` with `null` duration if all fail.

---

## 3. Backend Routes

**Create**: `src/backend/routes/memoryScrobble.ts`

Factory function with dependency injection. Mount at `/api/v1/memory-scrobble` in `server.ts`.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/collections` | List all saved collections |
| POST | `/collections` | Create new collection |
| GET | `/collections/:id` | Get single collection with tracks |
| PUT | `/collections/:id` | Update name/description |
| DELETE | `/collections/:id` | Delete collection |
| POST | `/collections/:id/import` | CSV import (body: `{ csvContent }`) — returns `{ imported, errors, unmatched[] }` |
| POST | `/collections/:id/tracks` | Add single track |
| DELETE | `/collections/:id/tracks/:position` | Remove track |
| GET | `/search?q=...&limit=20` | Unified typeahead search |
| GET | `/duration?artist=...&track=...&album=...` | Duration lookup |
| POST | `/prepare` | Prepare tracks for scrobble submission |

### Search endpoint

- Queries `ScrobbleHistoryStorage.getTracksPaginated()` (limit 10) for history results
- Substring-matches all `SavedCollection` tracks in memory (limit 10)
- Merges, deduplicates by `artist|track` key, tags each result with source
- Target: <250ms response for typeahead feel

### Prepare endpoint

- Input: `{ sessionStart, sessionEnd, tracks: [{artist, track, album?, duration?, source}] }`
- For tracks missing duration: call `DurationLookupService`
- Apply artist mappings via `artistMappingService.getLastfmName()`
- Calculate sequential timestamps from `sessionStart` using each track's duration (+1s gap)
- Return `ScrobbleTrack[]` ready for existing `POST /api/v1/scrobble/batch`
- Include `overflows: boolean` if total duration exceeds session window

---

## 4. Frontend Changes

### 4a. API Service Layer

**Modify**: `src/renderer/services/api.ts`

Add methods for all new endpoints following existing patterns (ApiResponse wrapper, error handling).

### 4b. Route & Nav Registration

- `src/renderer/routes.ts`: Add `MEMORY_SCROBBLE: 'memory-scrobble'`
- `src/renderer/components/Sidebar.tsx`: Add to "Listening" category after "Scrobble History". Icon: `Brain` from lucide-react. Requires last.fm auth.
- `src/renderer/components/MainContent.tsx`: Add case for `MemoryScrobblePage`

### 4c. TrackTypeahead Component (new)

**Create**: `src/renderer/components/memory-scrobble/TrackTypeahead.tsx` + `.css`

No typeahead/autocomplete exists in the codebase — this is new.

- Debounced input (300ms) calls `api.searchTracks(query)`
- Dropdown shows results grouped: "From History" (with play count), "From Collections" (with collection name)
- Each result shows `Badge` for source type
- Bottom option: "Enter manually" opens inline artist/track/album fields for freeform entry
- Keyboard nav: arrow keys, Enter to select, Escape to close
- Props: `onSelect(result: TrackSearchResult)`, `onFreeformSubmit(artist, track, album?)`

### 4d. SessionTimelineBar Component (new)

**Create**: `src/renderer/components/memory-scrobble/SessionTimelineBar.tsx` + `.css`

- Horizontal bar: filled portion = total track duration / session duration
- Color: `--status-success` (normal), `--status-warning` (>90%), `--status-error` (overflow)
- Text label: "45:30 / 1:15:00" format

### 4e. SavedCollectionManager Component (new)

**Create**: `src/renderer/components/memory-scrobble/SavedCollectionManager.tsx` + `.css`

- Uses existing `Modal` component
- List collections with track counts
- Create/edit/delete collections
- CSV file import with preview: shows matched vs unmatched tracks (via `lastfmMatch` flag)
- Unmatched tracks flagged with option to fix individually via typeahead or freeform
- View tracks in each collection

### 4f. MemoryScrobblePage (new)

**Create**: `src/renderer/pages/MemoryScrobblePage.tsx` + `.page.css`

```
Header: "Memory Scrobble"                    [Manage Collections]
─────────────────────────────────────────────────────────────────
Session:  [Start datetime-local]    [End datetime-local]
─────────────────────────────────────────────────────────────────
[===========Timeline Bar: 45:30 / 1:15:00============]
─────────────────────────────────────────────────────────────────
[Typeahead: search tracks or enter manually...]
                                    [Load from collection v]
─────────────────────────────────────────────────────────────────
 #  Time     Artist          Track              Duration
 1  2:30pm   Artist A        Track One          4:12      [x]
 2  2:34pm   Artist B        Track Two          3:45      [x]
 3  2:38pm   Artist C        Track Three        ...       [x]
─────────────────────────────────────────────────────────────────
[Clear All]                              [Review & Scrobble >>]
```

**Key behaviors:**
- **Default times**: start = now - 1hr, end = now
- **Adding a track**: typeahead select or freeform → append to list → if duration unknown, async resolve via `/duration` endpoint (show spinner, update when resolved)
- **Load from collection**: opens SavedCollectionManager in picker mode, loads all collection tracks at once
- **Timestamp recalculation**: any add/remove/reorder triggers recalc from session start
- **Review modal**: calls `/prepare` endpoint → shows final track list with applied artist mappings → confirm → calls existing `POST /scrobble/batch`
- **Overflow warning**: if total duration > session window, show amber warning (allow submit anyway)
- **Scrobble result**: success/fail counts, same pattern as ScrobblePage

All state is local `useState` — no context needed.

---

## 5. Integration with Existing Systems

- **Batch submission**: `/prepare` produces `ScrobbleTrack[]` compatible with existing `POST /scrobble/batch`. No changes to scrobble route.
- **History sync**: Existing batch endpoint auto-triggers incremental sync after 5s. Memory scrobbles appear in history automatically.
- **Session files**: Memory scrobbles create `session-*.json` files like regular scrobbles — visible in Scrobble History page.
- **Artist mappings**: Applied during `/prepare` via `artistMappingService.getLastfmName()`.
- **Track normalization**: CSV import uses `fuzzyNormalizeKey()` from `ScrobbleHistoryStorage` for matching.
- **Backup**: Add `savedCollections` to backup/restore in `backupService.ts`.

---

## 6. Phased Implementation

### Phase 1: Data Model & Tag CRUD
**Size: Small** | No dependencies

1. Add all new types to `src/shared/types.ts`
2. Create `SavedCollectionService` with CRUD + CSV import
3. Add `LastFmService.getTrackInfo()` method
4. Create `DurationLookupService`
5. Register in `migrationService.ts`
6. Tests for all three services

### Phase 2: Backend Routes
**Size: Medium** | Depends on Phase 1

1. Create `memoryScrobble.ts` route file with all endpoints
2. Wire up in `server.ts` (service instantiation + mount)
3. Route tests

### Phase 3: Frontend API & Components
**Size: Medium** | Depends on Phase 2

1. Add API methods to `api.ts`
2. Build `TrackTypeahead` component
3. Build `SessionTimelineBar` component
4. Build `SavedCollectionManager` component
5. Component tests

### Phase 4: Page Assembly & Integration
**Size: Medium** | Depends on Phase 3

1. Route registration (`routes.ts`, `Sidebar.tsx`, `MainContent.tsx`)
2. Build `MemoryScrobblePage` tying all components together
3. Add `savedCollections` to backup/restore
4. Integration tests, E2E verification

---

## 7. Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Nav placement? | "Listening" category, after Scrobble History | Per `dev_prompt.md` guidelines — fits the mental model |
| Icon? | `Brain` from lucide-react | Evokes "memory" without being too literal |
| Track source selection? | No source picker — unified typeahead searches all sources | Simpler UX, no mode switching needed |
| Saved collection naming? | "Saved Collections" not "Device Lists" or "Playlists" | Accurate — they're named sets of tracks, not playlists |
| Duration lookup chain? | Discogs collection → Last.fm API → Discogs API → manual | Cheapest/fastest first, API calls last |
| Duration storage unit? | Seconds (matching ScrobbleTrack.duration) | Consistent with existing model |
| Timestamp generation? | Sequential from session start, +1s gap between tracks | Same pattern as `prepare-from-release` endpoint |
| Session window terminology? | "Listening session" not "workout" | Generalized — swimming is one use case |
| Overflow handling? | Amber warning, allow submit anyway | User may have wrong end time |
| State management? | Local useState, no React Context | Page-scoped state, no cross-page needs |

---

## 8. Edge Cases

| Concern | Handling |
|---------|----------|
| **Track not in history or collections** | Freeform entry: user types artist + track + optional album |
| **Duration not found anywhere** | Show "unknown" in track list, prompt user to enter manually. Don't block scrobble — Last.fm doesn't require duration |
| **CSV with bad format** | Return per-row errors in import response. Skip bad rows, import good ones. |
| **CSV tracks not in last.fm history** | Flag with `lastfmMatch: false`. UI shows these with warning icon. User can fix via typeahead or accept as-is. |
| **Session window < total track duration** | Show overflow warning (amber). Allow submit — user may have bad end time. |
| **Session window = 0 or negative** | Validate: start must be before end. Show error. |
| **Duplicate tracks in list** | Allow — user may have heard a song twice |
| **Artist disambiguation** | Apply artist mappings during `/prepare`, same as regular scrobble flow |
| **No last.fm history synced** | Typeahead returns empty for history results. Saved collections and freeform still work. |

---

## 9. File Changes Summary

### New Files

| File | Purpose |
|------|---------|
| `src/backend/services/savedCollectionService.ts` | Saved collection CRUD + CSV import |
| `src/backend/services/durationLookupService.ts` | Duration lookup chain |
| `src/backend/routes/memoryScrobble.ts` | All memory scrobble endpoints |
| `src/renderer/components/memory-scrobble/TrackTypeahead.tsx` + `.css` | Typeahead search component |
| `src/renderer/components/memory-scrobble/SessionTimelineBar.tsx` + `.css` | Time progress bar |
| `src/renderer/components/memory-scrobble/SavedCollectionManager.tsx` + `.css` | Collection management modal |
| `src/renderer/pages/MemoryScrobblePage.tsx` + `.page.css` | Main page |

### Modified Files

| File | Change |
|------|--------|
| `src/shared/types.ts` | New types (section 1) |
| `src/backend/services/lastfmService.ts` | Add `getTrackInfo()` method |
| `src/backend/services/migrationService.ts` | Register saved-collections store |
| `src/server.ts` | Instantiate services, mount route |
| `src/renderer/services/api.ts` | Add API methods |
| `src/renderer/routes.ts` | Add `MEMORY_SCROBBLE` route |
| `src/renderer/components/Sidebar.tsx` | Add nav item to Listening category |
| `src/renderer/components/MainContent.tsx` | Add page render case |
| `src/backend/services/backupService.ts` | Include saved collections in backup |

### Reused Existing Infrastructure

- `POST /api/v1/scrobble/batch` — batch scrobble submission (no changes needed)
- `ScrobbleHistoryStorage.getTracksPaginated()` — track search
- `ScrobbleHistoryStorage.fuzzyNormalizeKey()` — CSV import validation
- `artistMappingService.getLastfmName()` — artist name resolution
- `parseTrackDuration()` — "MM:SS" → seconds conversion
- `FileStorage` — JSON persistence
- `Modal`, `Button`, `Badge`, `ProgressBar`, `EmptyState` — UI components
- `trackNormalization.ts` — fuzzy matching utilities

---

## 10. Verification

1. **Unit tests**: SavedCollectionService, DurationLookupService, LastFmService.getTrackInfo(), route handlers, frontend components
2. **Manual E2E**: Create saved collection → import CSV → verify match/unmatch flagging → open Memory Scrobble → set time window → search and add tracks from history + collection + freeform → verify timestamps auto-fill → verify duration resolution → review → scrobble → verify tracks appear in last.fm history and local history page
3. **Build check**: `npm run build` succeeds, no TypeScript errors
4. **CI pipeline**: All tests pass, coverage thresholds met
