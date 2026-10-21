# Context Tags Plan (Backlog #18)

Backlog Effort F from `.plan/backlog-shark-tank-2026-03-08.md`.

**Status:** Backlog -- not started. Revised 2026-10-11 against the current code (branch `feat/album-version-merging`). Nothing in this plan exists yet; section 0 lists what it builds on.

## Summary

Let users label in-app scrobble sessions with listening contexts ("working", "late night", "cooking", "focused listen", "party"). Tags have stable IDs, so renaming one changes only its label. A session can carry several tags. Tags are picked inline on ReleaseDetailsPage as chips, can be added or changed later from History > Sessions, and feed a per-tag breakdown. Context tags can later become an *optional* rule input for Smart Crates (section 6), but Smart Crates must not depend on them.

Changes from the original draft:

- **Stable tag IDs everywhere.** Sessions refer to tag IDs, never to label strings. Renaming rewrites nothing.
- **Assignments live with the tag definitions in one store**, not inside `scrobbles/session-*.json`. The reasons are verified concurrency and backup gaps (section 0.3).
- **Delete is explicit.** References are removed, the user can merge into another tag, and no tag ID is left orphaned.
- **The donut is replaced by a per-tag bar chart.** Sessions can have several tags, so shares can add up to more than 100%.
- **No stored `usageCount`.** Usage is derived from assignments, so it cannot drift.
- **Smart Crates hook** described as a later, optional integration.

---

## 0. Current State (verified 2026-10-11)

### 0.1 What exists

| Area | What exists | Reference |
|------|-------------|-----------|
| Scrobble session type | `ScrobbleSession { id, tracks, timestamp, status, error?, progress? }`. It has no tag, label or context field. `timestamp` is in ms. `ScrobbleTrack.timestamp` is in unix seconds. `ScrobbleTrack.duration?` and `scrobbleStatus?` are optional. | `src/shared/types.ts` (`ScrobbleSession`, `ScrobbleTrack`) |
| Session persistence | One file per session at `scrobbles/session-<id>.json`. `LastFmService.scrobbleBatch()` creates the session (ID from `authService.generateNonce()`) and rewrites it after every track with plain `writeJSON`. | `src/backend/services/lastfmService.ts` (`scrobbleBatch`) |
| Session creators | Only `POST /api/v1/scrobble/batch` creates a session. `POST /scrobble/track` and `POST /scrobble/recognized` call `lastfmService.scrobbleTrack()` directly and create **no** session file. | `src/backend/routes/scrobble.ts` |
| Batch callers (frontend) | `api.scrobbleBatch(tracks, baseTimestamp?, collectionRelease?)` is called from `ReleaseDetailsPage` (`handleScrobbleInternal`), `MemoryScrobblePage` and `ScrobblePage`. | `src/renderer/services/api.ts`, the three pages |
| Session read/edit routes | `GET /scrobble/history` (`lastfmService.getScrobbleHistory()` reads every session file), `GET /scrobble/session/:sessionId`, `DELETE /scrobble/session/:sessionId` (pending/failed only), `POST /scrobble/session/:sessionId/resubmit`, `POST /scrobble/session/:sessionId/resubmit-track/:trackIndex`. Session IDs are checked with `validateSessionId()`. | `src/backend/routes/scrobble.ts`, `src/backend/utils/validation.ts` |
| Session UI | HistoryPage has a "sessions" tab (`HistoryTab = 'sessions' \| 'lastfm'`) that renders `ScrobbleSessionCard` for each session (status, date, track count, album covers, resubmit/delete). | `src/renderer/pages/HistoryPage.tsx`, `src/renderer/components/ScrobbleSessionCard.tsx` |
| Session-scan analytics precedent | `StatsService.getSourceBreakdown()` reads every completed session file and matches track timestamps against the history index (±5 s). `SourcePieChart` renders it on StatsPage. | `src/backend/services/statsService.ts`, `src/renderer/components/stats/SourcePieChart.tsx` |
| Hours approximation | `getListeningHours()` uses `AVG_TRACK_DURATION_SECONDS = 210`. | `src/backend/services/statsService.ts` |
| Chip/pill primitive | `Badge` with a `pill` prop. | `src/renderer/components/ui/Badge.tsx` |
| Horizontal bar precedent | `DayOfWeekChart` uses recharts `BarChart layout='vertical'`. | `src/renderer/components/stats/DayOfWeekChart.tsx` |
| Lazy-load precedent | `IntersectionObserver` in StatsPage, `TasteDriftChart` and `CollectionROIChart`. | `src/renderer/pages/StatsPage.tsx` etc. |
| Data file registration | `MigrationService.registerAllFiles()` calls `this.register('<key>', { path, currentVersion, migrations, optional })`. The original draft's `registerDataFile` does not exist. | `src/backend/services/migrationService.ts` |
| Backup | `BackupService` `FILE_PATHS` + `BackupData` + `mergeAndSave()`. Newer sections are optional fields for backward compatibility, e.g. `monitoredLabels?`. | `src/backend/services/backupService.ts`, `BackupData` in `src/shared/types.ts` |

### 0.2 Things named "session" that are *not* relevant

- `ListeningSessionEntry` / `ListeningSessionStore` / `ListeningSessionStorageService` (`embeddings/listening-sessions.json`) and `SessionEmbedderService` hold **embedding snapshots** of recent listening for the recommendation engine. They have no user-facing identity and cannot carry tags.
- `AlbumScrobbleHistory` labels the number of distinct play *days* as "listening sessions". That is a display count, not a stored entity.
- The code has **no gap-based session detection** over Last.fm history. The only taggable unit is the in-app `ScrobbleSession`.

### 0.3 Confirmed gaps (verified)

1. Nothing tag-related exists: no `ContextTag` type, service, route, store file, UI component or API method (grep for `contextTag|context-tag|tagIds` in `src/` and `tests/` returns nothing).
2. **Session files are not registered** in `MigrationService` and **not included in backups** (`FILE_PATHS` / `BackupData` have no `scrobbles/` entry). If tags were stored on the session files, they would not be backed up.
3. **Concurrent-write risk on session files.** `scrobbleBatch()` and both resubmit routes keep the session in memory and write the whole object back with `writeJSON`. A tag edit written to the same file during a batch or resubmit would be overwritten. A late progress write could also bring back tags the user had removed.
4. **Coverage is limited.** The local data has 532 session files (510 completed, 22 failed) with 4,374 tracks, against 55,159 scrobbles in the history index (about 8%). Context analytics only describe listening that went through the app's batch scrobbler.
5. **Track status in legacy data.** 3,270 of the 4,374 session tracks have no `scrobbleStatus`: 2,229 in completed sessions and all 1,041 in failed sessions. 3,353 of 4,374 tracks have a `duration`. Play and hour counting needs a rule for both (section 5.2).
6. `mergeAndSave()` skips empty arrays (`if (!backupItems || backupItems.length === 0) return`). In merge mode it never deletes anything. A combined `{ tags, assignments }` store therefore needs its own import logic (section 7.2).

---

## 1. Data Model (design recommendation)

### 1a. One versioned store: definitions + assignments

New file `data/settings/context-tags.json`:

```typescript
// src/shared/types.ts
export interface ContextTag {
  id: string;          // stable, generated once (crypto.randomUUID()); never reused
  label: string;       // display text, trimmed, original casing preserved
  createdAt: number;   // ms
  updatedAt: number;   // ms; bumped on rename
}

export interface ContextTagsStore extends VersionedStore {
  schemaVersion: 1;
  tags: ContextTag[];
  /** sessionId -> tag IDs (deduped, order = order applied). Absent key = untagged. */
  assignments: Record<string, string[]>;
}
```

Why one store instead of a `tagIds` field on `ScrobbleSession`. This was a fork-in-the-road choice, and the peer reviewer independently preferred the same option.

- **Ownership.** `LastFmService` owns session progress, and `ContextTagService` owns annotations. Neither writes the other's file, so gap 3 cannot happen.
- **Atomic lifecycle operations.** Rename touches only `tags[]`. Delete and merge become a single read-modify-write of one file, so a half-finished delete cannot leave dangling IDs behind. The alternative is rewriting up to every `session-*.json` file.
- **Backup.** Definitions and assignments are exported and restored together, so restored assignments always point at restored definitions (gap 2).
- **Session files stay unchanged.** No schema change to `ScrobbleSession`, no migration of 532 files, and no change to `getScrobbleHistory()` or `getSourceBreakdown()`.

Trade-off: a session's tags are no longer visible by opening its JSON file, and the History UI has to join two sources (section 3c). Both costs are small.

### 1b. Invariants

1. Every ID in `assignments[*]` exists in `tags[]`. The service enforces this on every write, and on load it removes unknown IDs with a log line as self-repair.
2. Labels are unique case-insensitively, compared after `trim()` + `normalize('NFKC')` + `toLowerCase()`. The displayed label keeps the user's casing.
3. An assignment array is never empty. Removing the last tag deletes the key.
4. Assignments for session IDs that have no file are **kept** (for example after restoring onto a machine without those session files) but are ignored by analytics and usage counts. The only exception is the explicit session-delete path, which removes them (section 2.4).

### 1c. Response types

```typescript
export interface ContextTagWithUsage extends ContextTag {
  sessionCount: number;    // derived: sessions that exist and carry this tag
  lastUsedAt?: number;     // derived: max ScrobbleSession.timestamp (ms)
}

export interface ContextBreakdownBucket {
  sessions: number;
  plays: number;           // counted tracks (rule in 5.2)
  hours: number;           // 1 decimal
}

export interface ContextBreakdownItem extends ContextBreakdownBucket {
  tagId: string;
  label: string;
  sessionShare: number;    // sessions / totals.sessions, 0-1; shares sum to > 1 when sessions have several tags
}

export interface ContextBreakdown {
  totals: ContextBreakdownBucket;           // all eligible sessions, tagged or not
  untagged: ContextBreakdownBucket;
  tags: ContextBreakdownItem[];             // sorted by sessions desc
  multiTaggedSessions: number;              // sessions with >= 2 tags
  coOccurrence?: Array<{ a: string; b: string; sessions: number }>; // phase 5b, tag-ID pairs
  coverage: { sessionPlays: number; historyScrobbles: number };     // keeps the scope caveat visible in the UI
}
```

---

## 2. Tag Lifecycle (design recommendation)

### 2.1 Create
`label` is trimmed, 1–40 chars, with internal whitespace collapsed. Any characters are allowed apart from control characters. A case-insensitive duplicate returns `409` with the existing tag in the body, so the chip input can select it instead of failing.

### 2.2 Rename
`PATCH /context-tags/:id { label }` changes `label` and `updatedAt` **only**. The ID and every assignment stay the same, and no session file is touched. If the new label collides with another tag, the API returns `409` and the response suggests a merge (2.3).

### 2.3 Delete (with optional merge)
`DELETE /context-tags/:id?mergeInto=<otherId>`
- **Without `mergeInto`:** in one write, remove the tag from `tags[]`, remove its ID from every assignment array, and delete any assignment key whose array becomes empty. Those sessions become untagged, or keep their other tags. The response returns `{ affectedSessions }`, which the confirm dialog shows beforehand from `sessionCount`.
- **With `mergeInto`:** in the same single write, replace the ID with `mergeInto` in each array, dedupe, then delete the source tag. The target must exist and differ from the source (`400` otherwise).
- No tombstones are kept. The deleted ID is never reissued because IDs are UUIDs.

Backup implications:
- A merge-mode import of an older backup can **bring back** a deleted definition and the assignments that used it. The plan accepts this, because merge is documented as additive, the same way every other `mergeAndSave` section behaves. The import preview should show "N tags / M session assignments will be added", so the user can choose replace instead.
- Replace-mode import swaps the whole store, including an explicitly empty one. The `mergeAndSave` empty-array skip does not apply (section 7.2).
- The import step runs the invariant 1b-1 repair, so a hand-edited or partial backup cannot leave orphaned tag IDs.

### 2.4 Session-side changes
- `DELETE /scrobble/session/:sessionId` succeeds → also call `contextTagService.removeSession(sessionId)`. This is best-effort: a failure is logged and does not fail the delete.
- Resubmit keeps the same session ID, so tags carry over and nothing needs to happen.

### 2.5 Concurrency
All store mutations go through one in-process promise queue in `ContextTagService` (serialized read-modify-write). Atomic file replacement alone does not prevent lost updates, for example two quick chip toggles. Writes use `writeJSONWithBackup()` because this is user-authored data.

---

## 3. Backend / API (design recommendation)

### 3a. `ContextTagService` (new)
`src/backend/services/contextTagService.ts`. Constructed with `FileStorage`, instantiated in `src/server.ts`.

| Method | Notes |
|--------|-------|
| `listTags(): Promise<ContextTagWithUsage[]>` | Usage is derived. Sorted by `sessionCount` desc, then label. |
| `createTag(label)` | Rules from 2.1 |
| `renameTag(id, label)` | Rules from 2.2 |
| `deleteTag(id, mergeInto?)` | Rules from 2.3. Returns `{ affectedSessions }`. |
| `getAssignments(): Promise<Record<string, string[]>>` | For the History join |
| `setSessionTags(sessionId, tagIds)` | Replaces the whole set. Validates IDs (unknown → `400`) and `validateSessionId`. An empty array deletes the key. |
| `removeSession(sessionId)` | 2.4 |
| `getBreakdown(): Promise<ContextBreakdown>` | Section 5. Reads sessions via `lastfmService.getScrobbleHistory()` or the same `listFiles('scrobbles')` scan. |
| `getAlbumContextAffinity(tagId, opts)` | Phase 6 only (section 6) |

### 3b. Routes: `src/backend/routes/contextTags.ts` (new)
Mounted at `/api/v1/context-tags` next to the other `app.use('/api/v1/...')` calls in `src/server.ts`.

```
GET    /api/v1/context-tags                         -> ContextTagWithUsage[]
POST   /api/v1/context-tags            { label }    -> ContextTag            (409 on duplicate, body includes existing)
PATCH  /api/v1/context-tags/:id        { label }    -> ContextTag            (404 / 409)
DELETE /api/v1/context-tags/:id[?mergeInto=<id>]    -> { affectedSessions }  (404 / 400)
GET    /api/v1/context-tags/assignments             -> Record<sessionId, tagId[]>
PUT    /api/v1/context-tags/sessions/:sessionId  { tagIds: string[] } -> { tagIds }
GET    /api/v1/context-tags/breakdown               -> ContextBreakdown
```

The breakdown lives on this router rather than `/stats` on purpose. `createStatsRouter` already takes 12 positional dependencies, and the computation needs this service's store anyway.

Retroactive tagging is allowed on sessions of **any** status. A failed session can still contain plays that succeeded, and analytics count only plays (5.2). The route returns `404` when `scrobbles/session-<id>.json` does not exist.

### 3c. Scrobble route change (small)
`POST /api/v1/scrobble/batch` accepts an optional `contextTagIds?: string[]`.
- Unknown IDs are validated **before** scrobbling (`400`), so a bad tag never leaves a scrobble half done.
- After `lastfmService.scrobbleBatch()` returns `sessionId` and at least one track succeeded, call `contextTagService.setSessionTags(sessionId, contextTagIds)`. On failure, log and return `contextTagsSaved: false` in the response. The scrobble itself already succeeded, and the user can retag from History.
- `createScrobbleRouter` gets an optional 8th parameter, `contextTagService?: ContextTagService`, at the end like the other optional dependencies, so existing tests keep compiling.
- The route also calls `removeSession` on the `DELETE /session/:sessionId` path (2.4).
- Known limitation: if the server dies mid-batch, the tags are lost. The session file exists, so the user can retag from History. That is acceptable compared with threading a callback into `scrobbleBatch()`.

`LastFmService` and the `ScrobbleSession` type do **not** change.

---

## 4. Frontend (design recommendation)

### 4a. `ContextTagSelector` (new)
`src/renderer/components/ContextTagSelector.tsx` + `.css`. Props: `{ selectedTagIds: string[]; onChange(ids): void; disabled?: boolean }`.
- Fetches `GET /context-tags`, sorted by usage. Chips are `<button aria-pressed>` rendered as pills. Selected chips show the lucide `Check` icon (16px, `aria-hidden`).
- A "+ Add" chip shows an input (`aria-label="Create new context tag"`). On Enter, `POST`, then auto-select. On `409`, select the existing tag that comes back.
- Uses design tokens only (`--radius-full`, `--text-sm`, `--space-*`, `--accent-*`, `--surface-*`, `--text-*`) and explicit color + background. No inline styles. Plain `.css`, not `.module.css` (css-loader would hash the class names).

### 4b. ReleaseDetailsPage
Add `contextTagIds` state and render the selector between the "Scrobble Timing" block (`release-details-timing-container`) and the tracklist when tracks are selected. Pass the IDs through `handleScrobbleInternal()` → `api.scrobbleBatch(..., { contextTagIds })`. Styles go in `ReleaseDetailsPage.page.css` and follow the existing `release-details-timing-heading` / `-description` styles. Keep the selection after a scrobble so a listening block can be tagged across several albums. A "Clear" link resets it.

Other batch callers (`MemoryScrobblePage`, `ScrobblePage`) get the same optional argument in `api.ts`, but **no UI in v1**. MemoryScrobblePage is the most likely next adopter because offline listening blocks map naturally to contexts (open decision 3).

### 4c. History > Sessions
`HistoryPage` loads `api.getContextTagAssignments()` and the tag list next to `getScrobbleHistory()`. `ScrobbleSessionCard` gets new props `tags: ContextTag[]` and `onEditTags`. The card renders `Badge pill` chips plus an "Edit tags" icon button (lucide `Tag`, `aria-label`). The button opens the selector in a `Modal` and saves via `PUT /context-tags/sessions/:id`. An optional filter row ("Tag: any / untagged / <tag>") is filtered on the client.

### 4d. Tag management
Add a "Context Tags" panel to Settings. Recommended placement: the **Filters** tab, since the Mappings tab already holds merge suggestions (open decision 4). It lists each tag with its session count and lets the user rename inline, delete with a confirm dialog showing `affectedSessions`, and pick an optional "Merge into…" target.

### 4e. API client
In `src/renderer/services/api.ts`: `getContextTags`, `createContextTag`, `renameContextTag`, `deleteContextTag(id, mergeInto?)`, `getContextTagAssignments`, `setSessionContextTags`, `getContextBreakdown`. Extend `scrobbleBatch` with an optional fourth `options?: { contextTagIds?: string[] }` argument so the current positional callers don't change.

---

## 5. Analytics & Visualization

### 5.1 Why not a donut
A donut or pie implies that the categories exclude each other and add up to 100%. With multi-tag sessions, a session tagged "working" + "late night" would be counted twice, so the slices would overstate the total. Normalizing them to 100% would hide that. Untagged sessions would also be missing, or would get a slice that hides how small the tagged share is. `SourcePieChart` works for its data because "this app" and "other" do exclude each other. Context tags do not.

### 5.2 Counting rules (eligible session = file exists)
- **Plays:** in a `completed` session, count every track except those whose `scrobbleStatus` is `'failed'` or `'ignored'`. In any other status, count only tracks with `scrobbleStatus === 'success'`. This handles the legacy undefined statuses (gap 5).
- **Hours:** sum of `track.duration` (seconds) over counted plays, with `AVG_TRACK_DURATION_SECONDS` (210) as the fallback when duration is missing. Rounded to 1 decimal. Reuse the constant: export it, or move it to a shared spot rather than copying it.
- A tag's totals include every session carrying it. `totals` counts each session once. `untagged` = eligible sessions with no assignment.

### 5.3 Chart: `ContextBreakdownChart` (new)
`src/renderer/components/stats/ContextBreakdownChart.tsx` + `.css`. A recharts horizontal `BarChart` (`layout='vertical'`, as in `DayOfWeekChart`):
- One bar per tag, plus a visually muted **"Untagged"** bar at the bottom.
- A metric toggle: Sessions / Plays / Hours. Default is Sessions.
- Bar labels show the value and its share of **all** sessions (e.g. "42 · 18%").
- Caption: "Sessions can have more than one tag, so percentages can add up to more than 100%."
- A footer note from `coverage`: "Covers N plays scrobbled through Listenography (X% of your history)."
- Empty state (no tags yet): an `EmptyState` pointing to album details.
- Lazy-loaded with `IntersectionObserver`, placed after the Scrobble Sources card on StatsPage.

### 5.4 Co-occurrence (phase 5b, optional)
Show a small "Often together" list of the top tag pairs by shared sessions, under the bar chart. A matrix is only worth it once there are about 6 tags in use. This answers "what does 'late night' usually go with" without a misleading part-of-whole chart.

---

## 6. Future: Context Tags as a Smart Crates input

Smart Crates is planned separately in [done/smart-crates-plan.md](done/smart-crates-plan.md). Context tags must **not** be a prerequisite: Smart Crates ships and works fully without this feature. The integration is one optional rule type that appears only when context tags exist.

**Example rule:** "Albums I usually play while *working*."

```typescript
// ContextTagService, added only in the integration phase
getAlbumContextAffinity(tagId: string, opts?: { minSessions?: number; minShare?: number }):
  Promise<Array<{ albumKey: string; artist: string; album: string;
                  taggedSessions: number; totalSessions: number; share: number }>>
```

- **Album identity:** group session tracks with `createAlbumCanonicalizer(albumMappings, resolveArtist)` / `albumGroupKey` from `src/shared/utils/albumMapping.ts`, so merged album versions and artist aliases count as one album, the same way Stats and the album pages count them.
- **"Usually":** `share = taggedSessions / totalSessions` for that album, counting only in-app sessions (`totalSessions` ≥ `minSessions`, default 3; `share` ≥ `minShare`, default 0.5). Using a share rather than a raw count keeps albums that are simply played a lot from dominating.
- **Rule shape for Smart Crates:** something like `{ type: 'contextTag', tagId, minShare?, minSessions? }`. It stores the **tag ID**, so renames don't break crates. When the tag is deleted, the rule should show "tag deleted" and match nothing (or follow the merge target if Smart Crates wants that), never throw.
- **Coverage caveat** (gap 4): this rule only sees albums scrobbled through the app's batch flow, and the crate editor should say so.
- **Dependency direction:** Smart Crates calls `ContextTagService` (or `GET /context-tags/...`). Context tags know nothing about crates.

---

## 7. Migration & Backup

### 7.1 Migration registration
In `MigrationService.registerAllFiles()`, under a new "Context Tags" comment block:

```typescript
this.register('context-tags', {
  path: 'settings/context-tags.json',
  currentVersion: 1,
  migrations: [],
  optional: true,
});
```

The file is created on the first tag creation. Existing session files need no migration. No session is tagged until the user tags it.

### 7.2 Backup
- Add `contextTags: 'settings/context-tags.json'` to `FILE_PATHS`.
- Add `contextTags?: { tags: ContextTag[]; assignments: Record<string, string[]> } | null` to `BackupData`. It is optional so older backups still validate (same pattern as `monitoredLabels?`). Add `contextTagCount` / `contextTagAssignmentCount` to `BackupPreview` and the import preview.
- Export: read the store once, so definitions and assignments are a consistent snapshot.
- Import, **with dedicated logic rather than `mergeAndSave`**, because the store is not a single array and replace must honor an empty store:
  - *Replace:* write the backup's store as is, then run the 1b-1 repair.
  - *Merge:* union `tags` by `id`. On an ID collision keep the newer `updatedAt`. If a different ID has the same normalized label, keep the local tag and remap the incoming ID to it. Then union assignments per session (set union of IDs after remap) and run the repair.
  - Import runs through the service's write queue (2.5).
- Not in scope: session files themselves are still not backed up (existing gap 2). Restored assignments for sessions missing on the target machine are kept but ignored (1b-4). Listed as open decision 5.

---

## 8. Phases

| Phase | Scope | Size | Depends on |
|-------|-------|------|-----------|
| **1. Store + CRUD** | Types; `ContextTagService` (queue, invariants, create/rename/delete+merge, assignments); `contextTags.ts` router; mount in `server.ts`; `MigrationService.register`; API client methods | S–M | – |
| **2. Selector + scrobble-time tagging** | `ContextTagSelector`; ReleaseDetailsPage integration; `/scrobble/batch` `contextTagIds` + optional `contextTagService` router param; `scrobbleBatch` options arg | M | 1 |
| **3. History + management** | `ScrobbleSessionCard` chips + edit modal; History tag filter; Settings "Context Tags" panel (rename / delete / merge); session-delete cleanup | M | 1 (2 for shared selector) |
| **4. Backup** | `FILE_PATHS`, `BackupData`, preview counts, dedicated export/import (replace + merge with remap) | S | 1 |
| **5. Analytics** | `getBreakdown()` + route; `ContextBreakdownChart` with metric toggle + untagged + coverage note; StatsPage lazy section. **5b:** co-occurrence list | S–M (+S) | 1 (useful after 2) |
| **6. Smart Crates hook** | `getAlbumContextAffinity()` + endpoint, consumed by Smart Crates as an optional rule | S | 5 and Smart Crates rule engine |

Phases 3, 4 and 5 can run in parallel once phase 1 is done. They touch different files, apart from `api.ts`.

---

## 9. Acceptance Criteria

1. A tag can be created inline on ReleaseDetailsPage, selected along with other tags, and saved with the batch scrobble. After reload the session shows those chips in History > Sessions.
2. Renaming a tag updates its label everywhere (selector, History cards, Settings, chart) without touching any `scrobbles/session-*.json` file. Their mtimes do not change.
3. Deleting a tag removes its ID from every assignment in one write. Sessions that had only that tag show as untagged. `GET /context-tags/assignments` never contains an ID that is missing from `GET /context-tags`.
4. Delete with "Merge into X" moves every reference to X with no duplicates, and the session counts add up.
5. Tags can be added to or removed from any existing session, including failed ones. Removing the last tag removes the session key.
6. Toggling tags while a batch scrobble or resubmit is running never loses the edit or brings back a removed tag.
7. The breakdown shows one bar per tag plus "Untagged", with a Sessions/Plays/Hours toggle. Percentages are relative to all sessions, and the multi-tag caption and coverage note are visible. There is no pie or donut.
8. A backup export contains tags and assignments. Replace-import restores them exactly (including an empty store). Merge-import unions them and leaves no orphan IDs. Older backups without `contextTags` still import.
9. Scrobbling with no tags behaves exactly as today, and no store file is created.
10. Smart Crates works with no context-tags store present (verified in its own plan's tests).

---

## 10. Tests

| File | Coverage |
|------|----------|
| `tests/backend/services/contextTagService.test.ts` (new) | create/dup (case and Unicode)/validation; rename keeps ID and assignments; delete strips references and removes empty keys; merge dedupes; unknown-ID repair on load; `setSessionTags` validation; serialized concurrent writes (two overlapping `setSessionTags` both land); derived `sessionCount` ignores missing sessions; breakdown play/hour rules incl. legacy undefined `scrobbleStatus` and missing `duration`; untagged bucket; shares > 1 in total with multi-tag |
| `tests/backend/routes/contextTags.test.ts` (new) | All endpoints, status codes (400/404/409), `mergeInto` validation, `validateSessionId` rejection |
| `tests/backend/routes/scrobble.test.ts` (extend) | `/batch` with `contextTagIds`: unknown ID → 400 before any Last.fm call; success → `setSessionTags` called with returned `sessionId`; tag-save failure → 200 with `contextTagsSaved: false`; DELETE session calls `removeSession`; router still works without the optional service |
| `tests/backend/migrationService.test.ts` (extend) | `settings/context-tags.json` registered as optional v1 |
| `tests/backend/backupService.test.ts` (extend) | export snapshot; replace incl. empty store; merge union + label-collision remap + orphan repair; backup without `contextTags` |
| `tests/frontend/components/ContextTagSelector.test.tsx` (new) | render sorted chips, toggle `aria-pressed`, inline create, 409 selects existing, disabled state |
| `tests/frontend/components/stats/ContextBreakdownChart.test.tsx` (new) | metric toggle, untagged bar, caption, empty state |
| `tests/frontend/pages/…` / `ScrobbleSessionCard` (extend) | chips render from assignments; edit modal saves |
| `tests/frontend/api.test.ts` (extend) | new client methods; `scrobbleBatch` options arg |

Jest mocks CSS, so check visually that the new `.css` / `.page.css` imports load in both themes.

---

## 11. Effort

About **4–6 focused days** total: phase 1 ≈ 1 d, 2 ≈ 1 d, 3 ≈ 1–1.5 d, 4 ≈ 0.5 d, 5 ≈ 1 d (+0.5 d for 5b), 6 ≈ 0.5 d once the Smart Crates rule engine exists. The original "Medium" sizing still holds. The extra work is the delete/merge path and the dedicated backup import.

---

## 12. Edge Cases

| Concern | Handling |
|---------|----------|
| No tags selected | No API call. No store file is created. The session counts as "Untagged". |
| Tag rename collides with an existing label | `409`. The UI offers "Merge into existing". |
| Delete a tag used by many sessions | A single store write. The confirm dialog shows the count first. |
| Tag edit during a batch or resubmit | Separate files plus the service write queue mean no clobbering (gap 3 avoided). |
| Session file deleted outside the app | The assignment stays but is ignored by counts and analytics. |
| Restore onto a machine without session files | Same as above. Tags are restored, analytics show only sessions that exist. |
| Hand-edited store with an unknown ID | Removed on load, with a warning log. |
| Breakdown cost | One scan of about 530 small files, the same cost as `getSourceBreakdown()`. Add it to the stats warm cache only if it is measurably slow. |

---

## 13. Open Decisions

1. **Label normalization:** preserve the user's casing (recommended) or force lowercase as the original draft said?
2. **Default chart metric:** Sessions (recommended; most honest given the 3-minute timestamp spacing in `/batch`) or Hours?
3. **MemoryScrobblePage UI in v1?** The plumbing is in place either way. Recommended for v1.1.
4. **Settings placement** of the management panel: Filters tab (recommended), Mappings, or a new "Tags" tab.
5. **Back up session files?** Without them, restored assignments can't be analyzed on a fresh machine. This is a separate backup-scope decision that affects the whole app, not just tags. Recommended: track it in `tech-debt.md`.
6. **Tagging Last.fm-history plays** (time-range tags such as "Saturday 8–11pm = party") is out of scope here. It would raise coverage from about 8% but needs a different data model (time intervals, not session IDs).
7. **Optional tag color:** dropped from v1. If added, it should be an accent-token *name*, not a hex value.
