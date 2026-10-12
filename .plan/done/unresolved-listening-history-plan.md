# Unresolved Listening History - Implementation Plan

> Renamed from `missing-albums-page-plan.md` ("Missing Albums Page") on 2026-10-11. The new name keeps this feature apart from the Marketplace **Missing Albums** tab, which lists albums you have listened to but don't own (see [Naming](#naming)).

## Summary

Last.fm sync drops every scrobble that has an artist, track, and timestamp but no album. That undercounts every listening statistic, not only album statistics. This plan:

1. **Keeps** albumless scrobbles in the history index as *unresolved* plays.
2. **Counts** them in listening-level stats (totals, streaks, artists, tracks, patterns) and keeps them **out of** album-level stats unless they are resolved.
3. **Recovers** the plays that earlier syncs dropped, using a backfill mode that only adds missing plays.
4. Adds an **Unresolved Listening History** tab where you can resolve artist + track to an album (by your own choice or a Last.fm lookup suggestion) or hide entries. Resolution **adds album information to plays already in the index** and never creates a second copy of a play.

---

## Naming

Marketplace already uses "Missing Albums" for a different feature (albums in your listening history that are not in your collection). New code must not reuse those names:

| Existing (Marketplace / Discovery) | Where |
|---|---|
| `AnalyticsService.getMissingAlbums()` | `src/backend/services/analyticsService.ts` |
| `GET /api/v1/suggestions/discovery/missing-albums` | `src/backend/routes/suggestions.ts` |
| `missingAlbumsCount` (dashboard quick actions) | `src/backend/routes/stats.ts` (`/dashboard`), `src/renderer/components/dashboard/QuickActionsGrid.tsx` |
| `MissingAlbum` type | `src/shared/types.ts` |
| `MissingAlbumsTab`, `MissingAlbumsContainer` | `src/renderer/components/discovery/`, `src/renderer/components/marketplace/` |
| Marketplace tab id `missing-albums` | `src/renderer/pages/MarketplacePage.tsx` |

This feature uses **"unresolved"** everywhere: `UnresolvedPlay*` types, `index.unresolved`, `/unresolved-history` routes, `UnresolvedHistoryTab`. The UI label is **"Unresolved Listening History"** (short label "Unresolved").

---

## Current State (verified in code, 2026-10-11)

### How albumless scrobbles are handled today

- **Dropped at sync, never stored or counted.** `ScrobbleHistorySyncService.processScrobbles()` reads `track.album['#text']` (or `''`) and runs `if (!artist || !album || !timestamp) continue;`. The play goes nowhere: no other store keeps it, nothing logs it, and nothing counts it. `processed` excludes it, so `index.totalScrobbles` (set to `processedCount` in `startFullSync()`; `+= newScrobbles` in `startIncrementalSync()`) excludes it too.
- **The index can only hold album-keyed plays.** `ScrobbleHistoryIndex` (`src/shared/types.ts`) is `{ lastSyncTimestamp, totalScrobbles, oldestScrobbleDate, albums: Record<"artist|album", AlbumHistoryEntry> }`, and `AlbumHistoryEntry.plays` is `ScrobbleHistoryEntry[]` (`{ timestamp, track? }`). The file on disk also has `schemaVersion: 1`, and `MigrationService` registers `scrobble-history-index` at `currentVersion: 1` with no migrations.
- **Every stat iterates `index.albums`.** `StatsService` (`calculateStreaks`, `getScrobbleCounts`, `getTopArtists`, `getTopTracks`, `getCalendarHeatmap`, `getMilestones`, `getListeningTimeline`, `getArtistDetail`, `getTrackDetail`, `getSourceBreakdown`, `getAlbumsForDate`, `getOnThisDay`, …), `ScrobbleHistoryStorage.buildDistributionCaches()` (hourly / day-of-week), `WrappedService`, `RankingsService`, `GenreAnalysisService`, and `AnalyticsService` all walk `index.albums`. Plays that are not in `index.albums` are invisible to all of them.

### Historical example vs. today

- When this plan was first written (early 2026), the dashboard showed **~53,493** plays against Last.fm's **60,488**, a gap of about 7,000 plays (11.5%), mostly singles, radio, and plays scrobbled without album tags.
- Read-only check of `data/history/scrobble-history-index.json` today: **55,159** plays in **5,083** album keys. The oldest play is 2005-02-13, the last sync was 2026-10-11, and `totalScrobbles` equals the summed plays. No key has an empty album, no play lacks `track`, and no album key holds a duplicate `timestamp|track` pair.
- **The current gap can't be read locally.** The Last.fm total (`recenttracks['@attr'].total`) is fetched in `fetchScrobblePage()`, but only the in-memory `SyncStatus.totalScrobbles` keeps it during a full sync. It is never saved. Phase 1 starts saving it.

### Confirmed gaps (verified in code)

| # | Gap | Location |
|---|---|---|
| G1 | Albumless plays are dropped silently, with no store, count, or log line | `processScrobbles()` |
| G2 | The Last.fm total is never saved, so the UI can't show the gap | `fetchScrobblePage()`, `SyncStatus` |
| G3 | **Plays are appended with no identity check.** `adjustSyncTimestampForBackdatedScrobbles()` (called from `routes/scrobble.ts` after a backdated or memory scrobble) lowers `lastSyncTimestamp`. The next incremental sync then re-processes every play between the lowered and the previous watermark, and `entry.plays.push` adds them a second time while `totalScrobbles += newScrobbles` inflates the total. This has not shown up in today's data, but the code allows it. | `processScrobbles()`, `startIncrementalSync()` |
| G4 | Full sync rebuilds the index from an empty object and saves after page 1 and then every 10 pages. Pausing or aborting midway leaves a **truncated index on disk**. Page fetch errors are logged and skipped ("Continue with next page on error"), which leaves silent holes. That makes full sync risky as a backfill tool. | `startFullSync()` |
| G5 | The warm stats cache is still treated as valid when plays are added below the newest timestamp or when resolution rules change. `getValidWarmCache()` only checks `syncTimestamp === lastSyncTimestamp`, `version === WARM_CACHE_VERSION` (currently `2`), and `artistAliasFingerprint`. | `src/backend/services/statsService.ts` |
| G6 | `saveIndex()` uses `writeJSON` with no backup. The history index is **not** in `BackupService` exports, and the only `.bak` files on disk are from 2026-01-18 and 2026-03-21. | `scrobbleHistorySyncService.ts`, `backupService.ts` |
| G7 | Top tracks are keyed by `createNormalizedTrackKey(artist, album, track)` (`src/shared/utils/trackNormalization.ts`), so albumless plays of a track would show up as a separate row | `StatsService.getTopTracks()` |
| G8 | Incremental sync stops after 50 pages (10,000 scrobbles at `SCROBBLES_PER_PAGE = 200`) | `startIncrementalSync()` |

### Prior art to reuse

- **Deduplication by event identity.** Commit `f5434e2` fixed a bug where merging deduplicated plays by `timestamp` alone and dropped real plays, because consecutive tracks can share a scrobble timestamp. Both `HistoryIndexMergeService.deduplicatePlays()` and the `GET /api/v1/suggestions/album-history/:artist/:album` handler now key on `` `${timestamp}|${track ?? ''}` ``. That key leaves out the artist because both callers work inside one artist's album group. This feature works across stores and artists, so its key **adds the artist**.
- **Album mappings** (`src/shared/utils/albumMapping.ts` `createAlbumCanonicalizer`, `src/backend/services/mergedAlbumHistory.ts` `loadAlbumMappings` / `lookupMergedHistory`) merge versions of the same album at read time. They solve a different problem from albumless plays, but they set the pattern for overlays applied at read time. Resolution runs *before* canonicalization: a resolved play then merges with the album's other versions like any other play.
- **Stats refresh after a mapping change.** `refreshStatsAfterAlbumMappingChange()` in `routes/suggestions.ts` calls `statsService.invalidateStatsCache()` and then `warmCache()` in the background. Resolution changes reuse it.
- **Album lookup.** `LastFmService.getTrackInfo(artist, track)` (read-only `track.getInfo`, already used by `durationLookupService.ts`) returns an optional `album`.

---

## Design

### D1. Event identity and validity

- **Valid event:** non-empty `artist`, non-empty `name` (track), and `date.uts > 0`, and not `nowplaying`. Album is optional.
- **Identity:** `timestamp | norm(artist) | norm(track)`, where `norm` = lowercase and trim. That matches how `normalizeKey()` already treats artist. The identity uses the **raw scrobbled names**, not names after alias resolution, because aliases and mappings change over time and identity must not.
- **Invariant:** each identity appears **once** across `albums` and `unresolved` together.
- **Precedence:** a play that has an album beats an unresolved copy of the same play. If a later sync returns the same identity with an album (for example after the user edits the scrobble on Last.fm), it moves out of `unresolved`.
- Two plays with the same artist, track, and timestamp are treated as one. This matches what the current dedup does within an album.

### D2. Storage: a separate `unresolved` field (recommended)

```typescript
// src/shared/types.ts
export interface ScrobbleHistoryIndex {
  lastSyncTimestamp: number;
  totalScrobbles: number;           // now = album plays + unresolved plays
  oldestScrobbleDate: number;
  albums: Record<string, AlbumHistoryEntry>;        // key: "artist|album" (unchanged)
  unresolved?: Record<string, AlbumHistoryEntry>;   // key: normalized artist; plays carry track
  lastfmTotal?: number;             // from recenttracks @attr.total
  lastfmTotalCheckedAt?: number;    // ms
  lastFullBackfillAt?: number;      // ms; set when a full-range backfill completes (D6)
  schemaVersion?: number;           // 2 after migration
}
```

**Why a separate field and not a sentinel `"artist|"` key in `albums`:** if a consumer is missed with a separate field, it undercounts listening, which is today's behavior. If a consumer is missed with a sentinel key, a blank album shows up in top albums, Marketplace Missing Albums (`getAllAlbums()` returns every key), collection coverage, suggestions, merge suggestions, and the fuzzy index. With ~30 consumers, failing toward undercounting is the safer default. The peer reviewer reached the same conclusion.

**Shared accessors** (in `ScrobbleHistoryStorage`, or a small `src/backend/utils/historyPlays.ts`):

- `forEachListeningPlay(index, cb: (play, artist, album: string | null) => void)` walks `albums` plus `unresolved`. Listening-level consumers switch to it.
- Album-level consumers keep iterating `index.albums`, which leaves unresolved plays out with no code change.

### D3. Which statistics count unresolved plays

| Stat / consumer | Counts unresolved? | Reason |
|---|---|---|
| `getScrobbleCounts` (today/week/month/year/allTime), `getListeningHours`, `getMilestones` | **Yes** | These count listening events, and album is irrelevant. This closes the gap with Last.fm. |
| `calculateStreaks`, `getCalendarHeatmap`, `getListeningTimeline`, hourly / day-of-week (`buildDistributionCaches`) | **Yes** | These measure when you listen. A day of singles is still a listening day. |
| `getTopArtists`, `getArtistDetail` (totals/trend), `getNewArtistsThisMonth` / `getNewArtistsDetails`, `buildArtistPlayCountMap`, `GenreAnalysisService` (artist weights), `RankingsService` type `artists` | **Yes** | The artist is known. |
| `getTopTracks`, `getTrackDetail`, `getForgottenFavorites`, `RankingsService` type `tracks` | **Yes**, bucketed | The track is known. The album shows as **"Unknown album"**: a separate row in top tracks (G7) and a separate `appearsOn` bucket in track detail. No album is guessed. |
| `getSourceBreakdown` | **Yes** | It compares all plays with plays scrobbled from this app. |
| `getAlbumsForDate`, `getOnThisDay` | **Yes**, bucketed | The day total includes them, plus one "Unknown album" group per artist |
| `WrappedService` | Totals, artists, days, hours: **yes**. Unique albums, top albums: **no** | The loop at `WrappedService` mixes play and album counting (`totalScrobbles++` next to `albumSet.add`). Split it so unresolved plays never add an album. |
| `getTopAlbums`, `getAlbumDetail`, `getAlbumListeningArc`, `getAlbumTracksPlayed`, `getCollectionCoverage`, `getDustyCorners`, `getHeavyRotation`, `getCollectionROI`, `RankingsService` type `albums` | **No** (unless resolved, D4) | These measure albums, and an unresolved play has none |
| `AnalyticsService.getMissingAlbums` (Marketplace), suggestions, `albumMergeSuggestions`, `HistoryIndexMergeService`, fuzzy index | **No** | These work on albums or index keys only |

The Stats page shows one line near Top Albums: "N plays without album info are excluded from album stats", linking to the Unresolved tab.

### D4. Resolution: persisted rules applied when the index is read

Resolving artist + track → album must **add album information to existing plays without creating new ones**. The recommended approach (the peer reviewer agreed):

- **Rules file** `data/mappings/unresolved-track-resolutions.json` (`VersionedStore`, registered in `MigrationService`, included in `BackupService`):
  ```typescript
  interface UnresolvedTrackResolution {
    id: string;
    artist: string;            // normalized scrobbled artist
    track: string;             // normalized scrobbled track
    album: string;             // display album name to attribute
    source: 'user' | 'lastfm-track-info';
    createdAt: number;
  }
  interface UnresolvedHistoryStore extends VersionedStore {
    resolutions: UnresolvedTrackResolution[];
    hidden: string[];          // "artist|track" keys hidden from the list (still counted)
  }
  ```
- **Applied in `ScrobbleHistoryStorage.getIndex()`, never written back.** On load, plays in `unresolved` that match a rule are folded into `albums[normalizeKey(artist, album)]`, skipping identities already present there, and removed from the derived `unresolved`. Most consumers read through `historyStorage.getIndex()`, so album stats pick up resolved plays with no per-consumer overlay. Writers (`ScrobbleHistorySyncService`, `HistoryIndexMergeService`) read the **raw** file through `FileStorage` and must never save the derived view. Add a test that guards this. `ScrobbleHistorySyncService.getAlbumHistory()` also reads the raw file: either route it through `historyStorage` or document that it ignores resolutions.
- **Why not move plays physically:** a full sync rebuilds the index from Last.fm, which still has no album, so moved plays would come back as unresolved. Undo would also need per-play markers. Rules keep the original data intact and make undo a matter of deleting a rule. A rebuild doesn't lose them.
- Rules apply **only** to unresolved plays and never relabel a play that already has an album. Lookup results (`source: 'lastfm-track-info'`) are offered as suggestions, and the user confirms each one before it becomes a rule (see open decision 2).
- Resolution runs before album mappings, so a resolved play then merges with the album's other versions through `createAlbumCanonicalizer` like any other play.

### D5. Sync changes

- `processScrobbles()`:
  - Valid events with no album go to `index.unresolved[norm(artist)]`.
  - Before adding any event, check its identity against an identity set built from both stores. For incremental sync, only plays with `timestamp >= lowest timestamp in the batch` need to be in the set, which keeps it cheap.
  - When an event with an album matches an unresolved identity, remove the unresolved copy (precedence, D1).
  - `processed` counts only new identities. This also fixes G3.
- Return `{ processed, unresolved, duplicatesSkipped, newestTimestamp }` and log the counts.
- Save `@attr.total` from the first page of every sync into `lastfmTotal` / `lastfmTotalCheckedAt`.
- `totalScrobbles` becomes **recomputed** (album plays plus unresolved plays) at save time instead of accumulated, so it can't drift.
- Optional: once identity dedup exists, give incremental sync a small overlap window (`timestamp >= lastSyncTime - 300`). That covers plays that share the watermark timestamp, and dedup absorbs the overlap.

### D6. Recovering previously dropped plays

The index can't recover dropped plays on its own; they have to be fetched from Last.fm again.

| Option | Behavior | Cost | Verdict |
|---|---|---|---|
| A. Full sync (`POST /history/sync/start` without `incremental`) | Rebuilds the index from empty. With D5 in place, it captures unresolved plays. | ⌈Last.fm total / 200⌉ pages. ~300 requests ≈ **5 min** at `normal` (1 req/s), ~2 min `fast`, ~10 min `slow` | Works, but G4 applies: partial index on disk during the run, truncated on abort, holes on page errors |
| **B. Backfill mode (recommended)** | Pages through `user.getRecentTracks` and **merges** into a copy of the current index using D1 identity. It only adds plays and never deletes. It takes optional `from` / `to` (Unix seconds; Last.fm API parameters this code doesn't use yet) to limit the window. It backs up first, checkpoints to `history/backfill-checkpoint.json`, and writes the index once at the end. | Same request count for the whole history (one time). A limited window costs ⌈plays in window / 200⌉ pages, so a 90-day repair is usually a few pages. | Safe to re-run. It also repairs G4 holes and G3 duplicates (see Phase 1 cleanup). |

- Endpoint: `POST /api/v1/suggestions/history/sync/backfill` `{ from?: number, to?: number }`, next to the existing `/history/sync/start|pause|resume`. It runs as a `jobStatusService` job (`type: 'sync'`) and respects `isSyncing`, pause, and abort. An abort discards the working copy and leaves the index as it was.
- Run it once automatically after the schema migration, when the user starts it from the Unresolved tab's banner. Never run it on startup without asking.
- Rate limit: reuse `getRequestDelay()` (sync pace setting).

### D7. Deduplication rules

| Path | Guard |
|---|---|
| Incremental / backdated re-sync (G3) | Identity set check in `processScrobbles()` |
| Backfill and repeated backfills | Identity set over the whole index; adds only |
| A play later gains an album on Last.fm | Album copy wins; remove from `unresolved` |
| Resolution rule applied | Fold skips identities already in the target album entry. Rules never touch plays that already have an album. |
| Rule deleted | Derived view recomputed, raw data unchanged, so the count can't double |
| `HistoryIndexMergeService.executeMerge` | Unchanged (key `timestamp|track` within one artist group); it must keep `unresolved` intact when it rewrites the file |
| `album-history` route and `lookupMergedHistory` | Unchanged; they operate on the derived `albums` |
| Phase 1 one-time cleanup | Dedupe existing `albums[*].plays` by identity and recompute `playCount`, `lastPlayed`, `totalScrobbles`. Today's data shows none to remove, but G3 could create some before this ships. |

### D8. Cache invalidation

| Cache | Where | Action |
|---|---|---|
| Warm stats cache (`stats/stats-cache.json`) | `StatsService.warmCache` / `getValidWarmCache` | **Bump `WARM_CACHE_VERSION` to 3**, since the counts change. Add `historyFingerprint` = `totalScrobbles` + unresolved count + resolution-rules hash, and check it in `getValidWarmCache()` alongside `syncTimestamp`, `version`, and `artistAliasFingerprint` (fixes G5). After a backfill, a rule change, or a hide, call `invalidateStatsCache()` then `warmCache()` (same pattern as `refreshStatsAfterAlbumMappingChange`). |
| History index in-memory cache (60 s TTL) plus `fuzzyIndex`, `cachedHourlyDist`, `cachedDayOfWeekDist` | `ScrobbleHistoryStorage` | `invalidateCache()` after backfill and after any rule change. `buildDistributionCaches()` must walk `forEachListeningPlay`. The derived view is rebuilt on the next `getIndex()`. |
| Forgotten favorites (5 min) | `StatsService.forgottenFavoritesCache` | `clearForgottenFavoritesCache()` with the above |
| Top artists (5 min TTL) | `AnalyticsService.topArtistsCache` | Leave the TTL alone; add a `clearCache()` hook if tests show stale suggestion weights |
| Artist tags (`cache/artist-tags.json`) | `GenreAnalysisService` | No action. Entries are per artist, so new artists just miss the cache. |

### D9. Migration and backup

- `MigrationService`: `scrobble-history-index` `currentVersion: 2`, with migration 1→2 adding `unresolved: {}` and recomputing `totalScrobbles`. It runs through the existing non-destructive path, which backs up first.
- `fileStorage.createBackup('history/scrobble-history-index.json')` runs before the migration, before each backfill, and before the Phase 1 dedup cleanup. Keep the existing `.bak` files.
- Add `unresolved-track-resolutions.json` to `BackupService` exports (user-created data). The index stays out of exports because it can be rebuilt from Last.fm.
- **Rollback:** older code ignores `unresolved` and still reads `albums`. Its `totalScrobbles` would then include unresolved plays, which is harmless. Restore from the `.bak` file for a byte-exact rollback.

---

## API

Mounted on the stats router (`/api/v1/stats`), except backfill, which sits next to the sync routes in `suggestions.ts`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/stats/unresolved-history` | Unresolved plays grouped by artist → tracks (`playCount`, `firstPlayed`, `lastPlayed`). Supports `search`, `sort` (`plays` / `artist` / `recent`), `page`, `limit`, `includeHidden` |
| `GET` | `/stats/unresolved-history/summary` | `{ indexedTotal, unresolvedCount, resolvedByRuleCount, hiddenCount, lastfmTotal, lastfmTotalCheckedAt, gap }` |
| `POST` | `/stats/unresolved-history/lookup` | `{ artist, track }` → album suggestion via `LastFmService.getTrackInfo` (read-only) |
| `POST` | `/stats/unresolved-history/resolutions` | Create rule(s) `{ artist, track?, album, source }`. Leaving out `track` applies to every unresolved track of that artist. Shows a preview count first. |
| `DELETE` | `/stats/unresolved-history/resolutions/:id` | Remove a rule (undo) |
| `POST` | `/stats/unresolved-history/hide` / `unhide` | `{ keys: string[] }` hides entries from the list only. Hidden plays still count in listening stats. |
| `POST` | `/suggestions/history/sync/backfill` | `{ from?, to? }` starts a backfill job (D6) |

Types go in `src/shared/types.ts`: `UnresolvedHistoryGroup`, `UnresolvedHistorySummary`, `UnresolvedTrackResolution`, `UnresolvedHistoryStore`. Client methods go in `src/renderer/services/api.ts`.

---

## Frontend

- **Location:** a third tab on `HistoryPage` (`HistoryTab = 'sessions' | 'lastfm' | 'unresolved'`, `#history?tab=unresolved`), in `src/renderer/components/UnresolvedHistoryTab.tsx` with its own CSS file. There is no new route and no sidebar item.
- **Summary banner:** "1,234 plays without album info · counted in listening stats, excluded from album stats". It also shows "Last.fm reports X · indexed Y", with a **Run backfill** button that stays visible until a full-range backfill has finished (`lastFullBackfillAt` set).
- **Grouped list:** artist → tracks with play count and date range; search, sort, and paging.
- **Resolve modal:** shows the artist's albums already in the index, a Last.fm suggestion (lookup button), and free text. It previews how many plays will be attributed and offers a scope choice (this track or all of the artist's unresolved tracks).
- **Hide:** hides entries from the list and states that hidden plays still count in totals.
- **Entry points:** the Stats page "excluded from album stats" note (D3), and a link from the Last.fm history tab.
- **Conventions:** `lucide-react` icons (no emoji), `.page.css` / component CSS rather than inline styles or `.module.css`, design tokens, and `navigate(ROUTES.HISTORY, { tab: 'unresolved' })`.

---

## Phased Implementation

### Phase 1: Capture, identity, migration (~1.5 days)
- Add types (D2), migration 1→2, backups (D9).
- Implement the D5 changes to `processScrobbles()`: unresolved routing, identity set, precedence, recomputed `totalScrobbles`, and saving `lastfmTotal`.
- Make `HistoryIndexMergeService.executeMerge` keep `unresolved` intact.
- Run the one-time identity dedup cleanup.

**Acceptance:** a synced page with N albumless valid scrobbles adds N plays to `unresolved` and none to `albums`. Running incremental sync twice over the same window (including after `adjustSyncTimestampForBackdatedScrobbles`) changes no counts. `totalScrobbles` equals summed plays from both stores.

### Phase 2: Stats consumers and caches (~1.5 days)
- Add `forEachListeningPlay` and switch the "Yes" consumers in D3, including `buildDistributionCaches` and the split `WrappedService` loop.
- Add the "Unknown album" buckets.
- Bump `WARM_CACHE_VERSION`, add `historyFingerprint`, and wire up invalidation (D8).

**Acceptance:** with fixture data (album plays plus unresolved plays), counts, streaks, heatmap, distributions, top artists, and top tracks include unresolved plays. Top albums, coverage, `getAllAlbums()`, and Marketplace `getMissingAlbums()` are byte-identical to the results without unresolved plays. A warm cache built before an unresolved change is rejected afterwards.

### Phase 3: Backfill (~1 day)
- Add backfill mode with `from` / `to`, checkpointing, abort safety, the job, and the route.

**Acceptance:** backfill over a fixture where the index lacks albumless plays adds exactly those plays. A second run adds 0. An abort leaves the index byte-identical. A page error is retried and reported, never skipped silently.

### Phase 4: Resolution rules (~1.5 days)
- Add the rules store, the derived view in `getIndex()`, the lookup endpoint, and rule CRUD with stats refresh.

**Acceptance:** resolving a track moves its plays from the unresolved bucket to the album in top albums, and the total listening count is unchanged. Deleting the rule restores the previous numbers. A full sync followed by `getIndex()` reproduces the resolved view. The raw index file never contains the resolved plays.

### Phase 5: UI (~1.5 days)
- Build the Unresolved tab, the modal, hide, the banner with backfill, and the Stats page note.

**Acceptance:** the flows work end to end against a running server: backfill, resolve, undo, hide. No inline styles and no emoji.

**Total: ~7 days.** Phases 1-2 deliver the main stats fix and can ship on their own.

---

## Tests

| Area | File |
|---|---|
| Unresolved routing, identity dedup, precedence, backdated re-sync, `lastfmTotal`, recomputed total | `tests/backend/scrobbleHistorySyncService.test.ts` |
| Shared timestamp, different tracks: both kept (regression for `f5434e2`). Same identity across stores: kept once. | sync service + `tests/backend/historyIndexMergeService.test.ts` |
| Derived view, rule folding without duplicates, raw file untouched, cache invalidation, distributions include unresolved | `tests/backend/scrobbleHistoryStorage.test.ts` |
| D3 include/exclude matrix, warm-cache version/fingerprint rejection | `tests/backend/statsService.test.ts`, `tests/backend/rankingsService.test.ts`, Wrapped tests |
| Marketplace `getMissingAlbums()` unaffected | `tests/backend/analyticsService.test.ts` |
| Migration 1→2 plus backup | `tests/backend/migrationService.test.ts` |
| Backfill: only adds, safe to re-run, abort-safe, bounded window | new `describe` in the sync service test |
| Routes | `tests/backend/routes/` |
| Tab rendering, search, resolve modal, hide, banner | `tests/frontend/` |

Jest mocks CSS, so check the UI manually or with a Playwright smoke test (`tests/e2e/`).

---

## Files

**Modified:**
- `src/shared/types.ts`
- `src/backend/services/scrobbleHistorySyncService.ts`
- `src/backend/services/scrobbleHistoryStorage.ts`
- `src/backend/services/statsService.ts`
- `src/backend/services/wrappedService.ts`
- `src/backend/services/rankingsService.ts`
- `src/backend/services/genreAnalysisService.ts`
- `src/backend/services/historyIndexMergeService.ts`
- `src/backend/services/migrationService.ts`
- `src/backend/services/backupService.ts`
- `src/backend/routes/stats.ts`
- `src/backend/routes/suggestions.ts`
- `src/server.ts` (wiring)
- `src/renderer/pages/HistoryPage.tsx`
- `src/renderer/pages/StatsPage.tsx`
- `src/renderer/services/api.ts`

**New:**
- `src/backend/services/unresolvedHistoryService.ts` (rules store, grouping, lookup)
- `src/renderer/components/UnresolvedHistoryTab.tsx` and its CSS
- tests

---

## Open Decisions

1. **Unknown-album display for tracks.** The default is a separate "Unknown album" row in top tracks. The alternative is to key track counts on artist + track only, which changes `createNormalizedTrackKey` callers and the shape of the warm cache.
2. **Auto-applying lookups.** The default is that a Last.fm `track.getInfo` album is only a suggestion. Bulk "accept all suggestions" for an artist is possible but risks wrong attributions, since the same track can appear on a single and an album.
3. **Artist-wide rules** (no `track`). They are convenient for radio or single-heavy artists, but could attribute future unrelated tracks to the album. Option: limit them to tracks that are unresolved when the rule is created.
4. **Backfill trigger.** Run it from the banner (default) or offer it automatically after the migration.
5. **Incremental overlap window** (D5, optional). Adopt it now or defer.
6. **Hidden entries.** The default keeps them in listening stats. Should there be a separate "exclude from stats" option (for podcasts or audiobooks)? It would be a new concept that every listening consumer has to respect.

---

## Status

**Backlog**: plan revised 2026-10-11 against current code; not started.
