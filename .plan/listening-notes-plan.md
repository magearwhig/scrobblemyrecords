# Listening Notes Plan (Backlog #5)

Backlog Effort D from [backlog-shark-tank-2026-03-08.md](backlog-shark-tank-2026-03-08.md). Related: [context-tags-plan.md](context-tags-plan.md) (also extends `ScrobbleSession`), [data-export-plan.md](data-export-plan.md) (notes become an export dataset later).

## Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Album notes backend (types, service, routes, migration, backup) | Not started | |
| Phase 2: Album notes UI (AlbumDetailPage + ReleaseDetailsPage) | Not started | |
| Phase 3: Read-only Discogs copy fields on ReleaseDetailsPage | Not started | Optional, small |

---

## Overview

The original pitch: "per-album free-form notes on ReleaseDetailsPage, timestamped entries, keyed on Discogs release ID". The goal is a personal listening diary, so the app records what you thought of a record as well as how often you played it.

"Notes" covers three different things. They have different owners, identities and storage:

| Level | What it captures | Natural identity | Source of truth |
|-------|------------------|------------------|-----------------|
| **Album** | Thoughts about the music ("side B is the real album", "grew on me after the tour") | The album as the app groups it (history plus collection, merged by album mappings) | This app (new local file) |
| **Pressing / copy** | Condition, where bought, price paid, quirks of *this copy* | One Discogs collection *instance* | Discogs collection fields (partly already read) |
| **Session** | A journal entry for one sitting ("rainy Sunday, whole thing front to back") | One `ScrobbleSession` | This app (session files) |

This plan **ships album-level notes as the MVP**. It adds a read-only display of the copy-level Discogs fields the app already caches, and leaves session notes for later.

---

## Verified current state (2026-10-11)

### Album level: nothing exists
- There is no notes service, route, type or `data/notes/` directory.
- Albums are shown on two pages with **different identities**:
  - `AlbumDetailPage` reads `{ artist, album }` from `localStorage('selectedAlbum')` and calls `GET /api/v1/stats/album-detail?artist=&album=` (`statsService.getAlbumDetail`). It works for any album in the Last.fm history, owned or not. `AlbumDetailResponse` includes `inCollection`, `collectionReleaseId`, `collectionArtist` and `collectionAlbum`.
  - `ReleaseDetailsPage` reads a Discogs release from `localStorage('selectedRelease')` (plus `selectedCollectionItemId`). It only works for Discogs releases.
- Albums are merged by album mappings. `createAlbumCanonicalizer(mappings, resolveArtist)` in `src/shared/utils/albumMapping.ts` maps a history name to its target and returns a grouping `key` (`albumGroupKey`, which ignores case, accents, punctuation and Discogs `(N)` suffixes). Top Albums in `statsService` passes the artist alias resolver (`name => this.resolveArtistName(name)`). A key computed this way **changes** whenever the user adds or removes an album or artist mapping.

### Pressing / copy level: Discogs data is cached but never shown or written
- `CollectionNote { field_id: number; value: string }` and `CollectionItem.notes?: CollectionNote[]` are in `src/shared/types.ts`.
- `discogsService` copies `item.notes` from the Discogs folder-releases response into the collection cache (full fetch and incremental update paths).
- In the current cache, 272 of 1,189 items have notes, and **only `field_id` 1 and 2** appear. Their values are grading strings such as "Mint (M)" and "Near Mint (NM or M-)", i.e. Discogs' default Media Condition and Sleeve Condition fields. No free-text Notes field (Discogs default id 3) or custom fields hold values.
- No renderer code displays `CollectionItem.notes`. The only `notes` UI is for discard pile items (`DiscardPileItem.notes`) and Discogs wants (`WishlistItem.notes`, which 0 of 206 cached wants use).
- **Writing** a Discogs collection field requires the collection `instance_id` and `folder_id`. Neither is captured: `DiscogsRawCollectionItem` has no `instance_id`, and `folder_id` is never set in the cache. `CollectionItem.id` is the **release id**, so two copies of one release share an id (10 such duplicates in the current cache). The app also never fetches the field definitions (`/users/{u}/collection/fields`), so labels for custom fields are unknown.

### Session level: storage exists but has no stable album link
- `ScrobbleSession` (`id`, `tracks[]`, `timestamp` in ms, `status`, `progress`) is stored one file per session at `data/scrobbles/session-{id}.json`, written by `routes/scrobble.ts` and `lastfmService`. There are about 532 sessions. These files are **not** registered in `migrationService` and **not** included in backups.
- Sessions exist only for scrobbles made *through this app*, not for listening imported from Last.fm. Tracks carry `artist`/`album`/`track` strings but no Discogs release id.
- `ListeningSessionEntry` / `embeddings/listening-sessions.json` is an embedding snapshot for recommendations. It is not a user-facing session, and notes don't belong there.

---

## MVP decision: album-level notes

| Option | For | Against |
|--------|-----|---------|
| **Album (chosen)** | Matches the "diary" pitch. Works for owned *and* unowned albums. Purely local, so no Discogs write path. Shows on the two pages users already visit | Needs an album identity that survives mapping changes (solved below) |
| Pressing / copy | Data partly exists already | Writing back needs `instance_id`/`folder_id` plumbing and duplicate-copy handling. Field labels are unknown. Overlaps Discogs' own UI. "Price paid" and "where bought" would need user-created custom Discogs fields |
| Session | Natural journal unit | Covers only app-made scrobbles. No release id. Session files aren't backed up or migration-registered. Overlaps the context tags plan's `ScrobbleSession` change |

The read-only part of copy-level notes is cheap (the data is already cached), so Phase 3 shows it without building a write path.

### Album identity: stable note id, album resolved at read time

A note must not be stored under a derived canonical key. If the user later maps album A into album B, a note keyed by A's key would vanish from B's page, and rekeying risks collisions.

- Each note stores its **original identity** as captured: `artist` and `album` exactly as the page showed them, plus optional `releaseId` and `masterId` when written from a Discogs context.
- On read, the service canonicalizes both the requested album and every stored note's identity with the *current* mappings, using `createAlbumCanonicalizer(mappings, resolveArtist)` with the same artist alias resolver Top Albums uses, and compares the returned `.key` values. The key is a derived index that is never persisted. It can be memoized and invalidated on `ArtistNameResolver.getFingerprint()` changes and on mapping writes.
- Effects:
  - When albums are merged, the page shows the notes of every merged version, each labelled with the name it was written under if that differs.
  - When a mapping is removed, notes go back to their original album.
  - Notes are never overwritten or concatenated.
- `releaseId` and `masterId` are *association metadata*. They let a ReleaseDetailsPage note show up on ReleaseDetailsPage for a different pressing of the same master. They never override user mappings.

---

## Data model (add to `src/shared/types.ts`)

```typescript
/** One free-form note about an album (Backlog #5). */
export interface AlbumNote {
  id: string;              // UUID, immutable
  artist: string;          // as captured (history or Discogs name, incl. "(2)" suffix)
  album: string;           // as captured
  releaseId?: number;      // Discogs release, when written from a release context
  masterId?: number;       // Discogs master (> 0 only), association metadata
  text: string;            // plain text, max 5,000 chars, trimmed, non-empty
  createdAt: number;       // ms
  updatedAt: number;       // ms
  source: 'album-detail' | 'release-details';
}

export interface AlbumNotesStore extends VersionedStore {
  schemaVersion: 1;
  notes: AlbumNote[];
}
```

The notes use plain text with line breaks. There's no Markdown and no rich text, so nothing needs sanitizing beyond normal React escaping.

## Storage

- New file `data/notes/album-notes.json`. `FileStorage.writeJSON` creates the `notes/` directory. Write with `writeJSONWithBackup` like other user data stores.
- **`migrationService.ts`**: `this.register('album-notes', { path: 'notes/album-notes.json', currentVersion: 1, migrations: [], optional: true, arrayWrapperKey: 'notes' })`, following the `album-mappings` / `dismissed-album-merges` entries.
- **`backupService.ts`**: notes are user-generated and can't be recovered from APIs, so they must be backed up (the discard pile was once missed; see `done/traded-in-archive-plan.md`).
  - `FILE_PATHS.albumNotes = 'notes/album-notes.json'`.
  - Optional `albumNotes?: AlbumNote[]` on `BackupData`, so older backups still import (same pattern as `monitoredLabels?`).
  - Include it in `getBackupPreview` counts (`BackupPreview`), `exportBackup`, `previewImport` comparison and import.
  - On `mode: 'merge'`, merge by note `id` and keep the newer `updatedAt`. On `mode: 'replace'`, replace.
  - A backup that lacks the field leaves the existing notes untouched.

## Backend

New `src/backend/services/albumNotesService.ts`:
- `getNotesForAlbum(artist, album, opts?: { releaseId?, masterId? }): Promise<AlbumNote[]>` returns notes whose canonical key matches, plus notes whose `releaseId` or `masterId` matches the ones passed in. Results are de-duplicated by `id` and sorted newest first.
- `addNote(input)`, `updateNote(id, text)`, `deleteNote(id)`.
- `getAllNotes()` (for export and backup).
- `countByAlbumKey()` (later: "has notes" badges).
- Depends on `MappingService` (`getAllAlbumMappings`) and `ArtistNameResolver` via constructor injection, so tests can use fakes.

New `src/backend/routes/notes.ts`, mounted in `src/server.ts` as `/api/v1/notes`:

| Method | Path | Body / query | Returns |
|--------|------|--------------|---------|
| GET | `/albums?artist=&album=&releaseId=&masterId=` | query | `AlbumNote[]` |
| POST | `/albums` | `{ artist, album, text, releaseId?, masterId?, source }` | created note |
| PATCH | `/albums/:id` | `{ text }` | updated note |
| DELETE | `/albums/:id` | — | `{ success }` |

Validate input with the existing helpers in `src/backend/utils/validation.ts`. Requests go through the global `requireApiToken` middleware when auth is enabled.

## Frontend

- `src/renderer/services/api.ts`: `getAlbumNotes`, `addAlbumNote`, `updateAlbumNote`, `deleteAlbumNote`.
- New `src/renderer/components/notes/AlbumNotesPanel.tsx` plus co-located `AlbumNotesPanel.css`:
  - Textarea and Save button.
  - Newest-first list of entries showing a relative date with the absolute date on hover, plus edit and delete actions (delete asks for confirmation).
  - An "Written for: {artist} – {album}" caption when a note's original identity differs from the page's album.
  - Uses `EmptyState` and `ErrorState`, lucide icons (`NotebookPen`, `Pencil`, `Trash2` at 16px), toast on save, and design tokens only (no inline styles).
- Placement:
  - **AlbumDetailPage**: a "Notes" section below the listening arc, using `data.artist` / `data.album` from `AlbumDetailResponse` and `collectionReleaseId` when present.
  - **ReleaseDetailsPage**: the same panel below the release metadata, using `release.artist` / `release.title`, `releaseId` and `master_id` when > 0. Collection names are already mapping targets, so they resolve to the same album as AlbumDetailPage.
- Phase 3, **ReleaseDetailsPage "Your copy"**: read-only display of the selected collection item's `notes`. Show `field_id` 1 as "Media" and 2 as "Sleeve", and any other id as "Field {id}". Add an "Edit on Discogs" link. Show nothing when the item has no notes.

---

## Non-goals (MVP)

- Writing Discogs collection fields (condition, custom fields) from the app.
- Session or journal notes on `ScrobbleSession`.
- Track-level notes.
- Rich text, attachments, photos.
- Searching notes across the library (later).
- Sharing or publishing notes, or syncing them to Last.fm or Discogs.

## Later enhancements

1. **Notes index page / search** with full-text search across all notes, linking back to albums.
2. **"Has notes" indicator** on collection cards and Top Albums rows, via `countByAlbumKey()`.
3. **Notes in data export.** An `album-notes` dataset in [data-export-plan.md](data-export-plan.md), with both original and canonical names.
4. **Session notes.** An optional `note?: string` on `ScrobbleSession`, edited from the History "Sessions" tab. This first needs: (a) session files registered in `migrationService` and included in backups; (b) coordination with `context?: string[]` from [context-tags-plan.md](context-tags-plan.md), ideally one "annotate session" UI with both fields.
5. **Copy-level write path.**
   - Capture `instance_id` and `folder_id` in the collection cache, which changes `DiscogsRawCollectionItem` and the `discogsService` transforms.
   - Fetch the field definitions.
   - Edit condition and custom fields through the Discogs API, with rate limiting through the existing Discogs axios client.
   - Alternative: local-only copy notes keyed by `instance_id`, for "price paid" and "where bought" when the user doesn't want to set up Discogs custom fields.

---

## Implementation phases

### Phase 1: Backend (~3–4 h)
1. Add types to `src/shared/types.ts`.
2. Add `albumNotesService.ts` with canonical-key matching.
3. Add `routes/notes.ts` and mount it in `server.ts`.
4. Register the file in `migrationService.ts`.
5. Add `backupService.ts` support (field, paths, preview, export, import merge/replace).
6. Write tests.

### Phase 2: UI (~3–4 h)
1. Add the API client methods.
2. Build `AlbumNotesPanel` and its CSS.
3. Add the panel to AlbumDetailPage and ReleaseDetailsPage.
4. Write frontend tests.

### Phase 3: Read-only copy fields (~1–2 h)
1. Add the "Your copy" block on ReleaseDetailsPage.
2. Write tests.

**Total: about 1–1.5 days.** The original "Small" sizing holds for the MVP. Copy-level writing and session notes are each separate, medium-sized pieces of work.

## Acceptance criteria

- [ ] A note added on AlbumDetailPage for an owned album also shows on that album's ReleaseDetailsPage, and the reverse.
- [ ] A note added for an unowned history album (no Discogs release) can be saved and reloads.
- [ ] After the user maps history album A into album B, A's notes show on B's page with a "Written for" caption. After the mapping is removed, they show only on A again.
- [ ] Two pressings of one master: a note written on pressing 1's ReleaseDetailsPage shows on pressing 2's.
- [ ] Edit updates `updatedAt`. Delete asks for confirmation and removes the note. Empty and whitespace-only text is rejected (400).
- [ ] Notes appear in the backup preview count, survive export → replace-import and merge-import, and older backups without `albumNotes` import without touching existing notes.
- [ ] `album-notes` is registered in `migrationService`, and a missing file loads as an empty store.
- [ ] Phase 3: a collection item with condition fields shows "Media: …" and "Sleeve: …". Items without notes show nothing.
- [ ] No inline styles. Text and background colors are set. Works in light and dark mode. Icons come from lucide.

## Tests

- `tests/backend/services/albumNotesService.test.ts`:
  - CRUD.
  - Canonical matching through album mappings (merge, unmerge).
  - Artist-alias matching.
  - Discogs `(N)` suffix matching.
  - `releaseId` / `masterId` association.
  - De-duplication and newest-first ordering.
  - Text validation.
- `tests/backend/routes/notes.test.ts`: status codes, validation errors, 404 on unknown id.
- `tests/backend/backupService.test.ts` (extend):
  - Preview count.
  - Export includes notes.
  - Merge by id keeping the newer `updatedAt`.
  - Replace.
  - Backup without the field.
- `tests/backend/migrationService.test.ts` (extend): registration and an optional missing file.
- `tests/frontend/...AlbumNotesPanel.test.tsx`:
  - Empty state.
  - Add, edit and delete flows.
  - The "Written for" caption.
  - Error state when the API fails.

## Open decisions

| Question | Recommendation |
|----------|----------------|
| Allow several entries per album (diary) or one editable note? | Several timestamped entries, which fits "diary" and avoids edit conflicts |
| Should a note written on one pressing show on *all* pressings of the master? | Yes, via `masterId`. Copy-specific remarks belong to the later copy-level notes |
| Where do notes live in navigation: an album page section only, or also a Notes page? | Section only for the MVP. Add a Notes page with search once there are enough notes |
| Should Phase 3 show grading fields on collection cards too? | No. Keep them on ReleaseDetailsPage to avoid card clutter |
| Should session-level notes reuse the context-tags UI? | Decide when context tags are built. Recommend one combined "annotate session" control |
