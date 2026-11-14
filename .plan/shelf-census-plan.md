# Shelf Census Plan

Feature idea 2 from the second site review ([site-review-2026-10-24.md](site-review-2026-10-24.md)):
"Shelf census: check which copies are actually on the shelf" (M). The reviewer listed the
data it would use: collection copies, formats, filing information, discard history.
Builds on [done/record-store-filing-plan.md](done/record-store-filing-plan.md) (shelf order) and
[done/discard-pile-plan.md](done/discard-pile-plan.md).

## Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 0: Stable copy identity (Discogs `instance_id`) in the collection cache | Not started | Needed so a copy's census result survives changes to the collection |
| Phase 0b: Pressing details (cat#, country, format descriptions, barcode, runout) in the release cache | Not started | Needed for the right-pressing check (section 3b) |
| Phase 1: Census store, service, routes, backup | Not started | |
| Phase 2: Census page (walk the shelf in filing order) | Not started | |
| Phase 3: Results report and "last seen" | Not started | |

---

## 0. Summary

Walk the shelves with the app open on a laptop and confirm, copy by copy, that what Discogs
says you own is really there. The page lists your copies **in the order they sit on the
shelf** (the record-store filing used by the Pocket List). Each copy gets one of:

- **Here**
- **Missing**: not on the shelf
- **Misfiled**: found, but in the wrong place (optional note: "found under T")
- **Wrong pressing**: on the shelf, but the copy in hand isn't the release Discogs has
  marked (a different reissue, colour, country or label). Each row shows the details that
  tell pressings apart, so this is checked as you go (section 3b)

You can also note records on the shelf that aren't in your Discogs collection.

A census can cover the whole collection or one section ("A", "B–C", "Various",
"Soundtracks"), and it can be paused and resumed. At the end, the report lists missing
copies, misfiled ones, copies marked as the wrong pressing in Discogs, records not in Discogs, and copies the Discard Pile says are gone but
Discogs still lists. Every copy keeps a "last seen on the shelf" date.

The app works from a phone on the home network since 2026-11-09 (PR #28), so the page is
built for both: a phone in hand at the shelf (large tap targets, swipe-free, one tap per
answer, the pressing line readable at phone width) and a laptop with one key per answer.

---

## 1. Verified current state (2026-10-25, on a copy of real data)

### Collection copies
- The collection cache is `data/collections/{user}-page-N.json` (24 pages, 1,195 copies),
  written by `discogsService` from `GET /users/{u}/collection/folders/0/releases`.
- `CollectionItem.id` is the **release id**, not the copy. Ten releases have two copies.
- Discogs returns an `instance_id` (one per copy) and a `folder_id` for each item, but the
  app **drops both**: `DiscogsRawCollectionItem` has no `instance_id`, and the mapping in
  `discogsService.ts:381` and `:921` doesn't copy them. `folder_id` is never set in the cache
  (0 of 1,195).
- The export rows (`exportDataService.collectionRow`) name a copy
  `discogs-collection:{releaseId}:{copyIndex}`, where `copyIndex` is its position among
  copies of that release **sorted by date added**. If the older copy is removed, the newer
  one's id changes from `:2` to `:1`. That is fine for an export, but not as a key for
  results that are stored for months.
- Formats: 1,176 vinyl, 18 CD, 1 cassette. A census would normally be one format at a
  time, since they sit on different shelves.

### Shelf order
- `buildPocketListModel` (`services/pocketList/pocketListModel.ts:846`) sorts collection
  rows into record-store order: sections (`sectionFor`, A–Z plus Various and Soundtracks),
  artists by MusicBrainz sort name and "file under" overrides (`RecordStoreFilingService`
  snapshot), albums by original year (`master-years.json`), spelled-out leading numbers.
- That order is computed inside the Pocket List model while building pages; there is no
  function that returns a flat ordered list of collection copies.

### Discard Pile
- `data/collections/discard-pile.json`, 36 items, all `traded_in`. Statuses:
  `marked | listed | sold | gifted | removed | traded_in`.
- `DiscardPileItem.collectionItemId` is documented as an "instance ID" but holds
  `CollectionItem.id`, i.e. the release id. So with two copies of a release, the app can't
  tell which one was traded.
- None of the 36 traded-in records is still in the Discogs collection right now, so the
  "gone but still listed" check would find nothing today. It is still worth having, since
  forgetting to remove a traded copy from Discogs is the likely way the two drift apart.

### Writing to Discogs
- The app never edits the Discogs collection (no remove-instance calls). The census won't
  either; it links to the release on Discogs so the owner can remove a copy there.

---

## 2. Scope

In scope:
- Census of collection copies by section and format, in filing order.
- Here / Missing / Misfiled per copy, an optional short note, records not in Discogs as free
  text (artist, title, note).
- Pause and resume; one census open at a time.
- Report, "last seen" dates, and a cross-check against the Discard Pile.

Out of scope:
- Barcode scanning (no cached barcodes; camera needs HTTPS; same call as Check a Record).
- Editing Discogs (removing copies, moving folders).
- Condition grading during the census (Discogs condition fields are shown read-only if
  cached, nothing more).
- Tracking physical shelf positions or crate locations.

---

## 3. Phase 0: stable copy identity

1. Add `instance_id: number` and `folder_id: number` to `DiscogsRawCollectionItem`, and
   `instanceId?: number` to `CollectionItem` (keep the existing optional `folder_id`).
2. Copy both in the two mappings in `discogsService.ts` (full fetch and incremental update).
3. Add `instanceId: number | null` to `ExportCollectionRow`. Leave `rowId` as it is, so
   exports and the Pocket List don't change.
4. Existing caches have no `instanceId` until the next full collection reload. The census
   page says "Reload your collection first" (link to Browse Collection) when any copy in the
   chosen section lacks one, rather than guessing.
5. Optional, separate change: fill `DiscardPileItem.instanceId` when a copy is added to the
   Discard Pile, so two copies of one release can be told apart there too.

Tests: mapping copies `instance_id`/`folder_id`; rows carry `instanceId`; old cache items
without it give `null`.

---

## 3b. Right pressing: is the Discogs release the copy in hand?

The owner wants the census to confirm not just that a record is there, but that Discogs
has **the right release** marked: the pressing actually on the shelf, not another
reissue, colour, country or label of the same album.

### What's cached today (checked 2026-11-13 on real data)
- Collection cache items carry only `id`, `master_id`, `title`, `artist`, `year`,
  `format` (names only, e.g. `["Vinyl"]`), `label` (names only) and `cover_image`.
- The release cache (`data/collections/release-{id}.json`, 1,215 files) adds `genres`,
  `styles` and `tracklist`. It drops the label `catno`, `country`, format `descriptions`
  and `text` (e.g. "LP, Album, Reissue", "Dapple Glow"), `identifiers` (barcode,
  matrix/runout) and `notes`.
- So today the app can't show anything that tells two pressings apart.

### Phase 0b: keep the pressing details
1. In `getReleaseDetails` (`discogsService.ts`), also keep `country`, `released`,
   `labels: { name, catno }[]`, `formats: { name, qty, descriptions, text }[]`,
   `identifiers: { type, value, description }[]` (Barcode, Matrix / Runout only, to keep
   files small) and the release `uri` (the discogs.com link).
2. Cached files without these fields are re-fetched lazily, the same way
   `needsTracklistRefetch` works today, one per second. A census section loads its
   pressing details up front, with progress ("Loading pressing details, 40 of 84"), and
   later sections are fetched in the background while the owner walks the current one.
3. Discogs basic_information in the collection response already includes `labels[].catno`
   and `formats[].descriptions`/`text`. Keep those in the collection cache too (Phase 0
   mapping change), so the walk list can show cat# and colour even before the full
   release is fetched.

### On the walk screen
- Each row shows the **pressing line**: label and cat#, country, year, format descriptions
  and free text (colour, edition), e.g. "Waterlines WL007 · US · 2026 · LP, Album,
  Limited Edition · Dapple Glow". An expander shows barcode and runout(s) for when the
  quick details aren't enough.
- Keys: **H** here (pressing matches), **W** here but **wrong pressing**, **?** here but
  pressing **not checked** (for when the owner only wants presence this time).
- The start screen has a "Check pressings" toggle (default on). Off means **H** records
  presence only, for a quick pass.
- **W** opens a small form: an optional Discogs release link or id for the copy actually
  in hand, and a note ("blue vinyl, not black"). If the owner pastes a link, the app
  fetches that release and shows its pressing line next to the marked one, so the
  difference is visible. A "Find it on Discogs" link opens the master's versions page
  (`/master/{master_id}`), filtered to the format, to pick the right one.

### Types (additions to section 4.2)
```typescript
export type CensusAnswer = 'here' | 'missing' | 'misfiled' | 'wrong-pressing';

// On CensusEntry:
pressing?: 'confirmed' | 'wrong' | 'unchecked';
/** Release the copy in hand actually is, when the owner gave one */
actualReleaseId?: number;

// On ShelfCensusStore:
/** Last time each copy's pressing was confirmed to match Discogs */
pressingConfirmed: Record<string, number>; // instanceId -> ms
```
Misfiled copies can also carry `pressing`, since a misfiled copy can be the wrong pressing
too.

### Report (additions to section 6)
- **Wrong pressing in Discogs**: each copy with the marked release's pressing line, the
  actual one (if given) and steps: add the right release to the Discogs collection, then
  remove the wrong copy. Links to both releases. The app still doesn't edit Discogs.
- **Pressing never confirmed**: count per section, so a later census can do only those
  ("Start a pressing check for these 31").

### Moving app data to the corrected release
Several stores key a collection copy by release id, so swapping the Discogs release
leaves them pointing at the old id: album mappings (`collectionId`), crates, the Discard
Pile, track splits remembered per release, hidden releases, filing overrides and
embeddings (verify the full list against `grep -rn "collectionId\|releaseId"
src/backend/services` before building).
- After the next collection reload, the census service notices a wrong-pressing copy whose
  old release has left the collection and whose `actualReleaseId` (or a new copy of the
  same master) has arrived. It offers **"Move your mappings and crates to the new
  pressing"** with a list of what will move. Nothing moves without the owner's OK.
- The move goes through each owning service (no direct file edits), with a backup first.
- Tests: detection with and without `actualReleaseId`, with two copies of one master,
  and that declining leaves everything as it was.

---

## 4. Phase 1: data and backend

### 4.1 Shared shelf order
Extract the ordering used by the Pocket List into
`services/pocketList/shelfOrder.ts`:

```typescript
shelfOrder(
  rows: ExportCollectionRow[],
  filing: FilingSnapshot,
  collator?: Intl.Collator
): Array<{ row: ExportCollectionRow; section: PocketSectionBucket; fileUnder: string }>
```

`buildPocketListModel` keeps its output byte-for-byte (the Pocket List tests must pass
unchanged); if sharing its internals turns out to be awkward, the census can call the same
comparators (`compareArtistFields`, `compareAlbumFields`, `sectionFor`) directly instead of
moving code. Copies of the same release stay together, oldest first.

### 4.2 Types (`src/shared/types.ts`)
```typescript
export type CensusAnswer = 'here' | 'missing' | 'misfiled';

export interface CensusEntry {
  instanceId: number;
  releaseId: number;     // for display if the copy later leaves the collection
  artist: string;
  title: string;
  answer: CensusAnswer;
  note?: string;         // max 200 chars
  answeredAt: number;    // ms
}

export interface CensusExtra {
  id: string;            // UUID
  artist: string;
  title: string;
  note?: string;
  addedAt: number;
}

export interface ShelfCensus {
  id: string;            // UUID
  startedAt: number;
  finishedAt?: number;
  /** Section ids from the Pocket List (e.g. "sec-a", "sec-various"); empty = all */
  sections: string[];
  format: 'vinyl' | 'cd' | 'cassette' | 'all';
  /** instanceIds in scope when the census started, in shelf order */
  scope: number[];
  entries: Record<string, CensusEntry>; // keyed by instanceId
  extras: CensusExtra[];
}

export interface ShelfCensusStore extends VersionedStore {
  schemaVersion: 1;
  censuses: ShelfCensus[];          // newest first, at most 20 kept
  /** Last time each copy was confirmed on the shelf (here or misfiled) */
  lastSeen: Record<string, number>; // instanceId -> ms
}
```

`scope` is frozen at the start, so a collection reload mid-census doesn't reshuffle the
list. Copies added to Discogs after the start appear in the report as "added since this
census started", not in the walk.

### 4.3 Storage
- `data/census/shelf-census.json`, written with `writeJSONWithBackup`.
- `migrationService.register('shelf-census', { path: 'census/shelf-census.json',
  currentVersion: 1, migrations: [], optional: true })`.
- `backupService`: census results are user-entered and can't be rebuilt, so add
  `FILE_PATHS.shelfCensus`, an optional `shelfCensus?` on `BackupData`, preview counts,
  export and import. Merge mode merges censuses by id and keeps the later `lastSeen` per copy.

### 4.4 `shelfCensusService.ts`
- `getOpen()`: the unfinished census with its walk list (rows in shelf order, joined with
  entries), or null.
- `start({ sections, format })`: 409 if one is open; 422 if any copy in scope has no
  `instanceId` (Phase 0 note).
- `answer(censusId, instanceId, answer, note?)`, `clearAnswer(...)`.
- `addExtra(...)`, `removeExtra(...)`.
- `finish(censusId)`: sets `finishedAt` and updates `lastSeen` for here/misfiled copies.
  Unanswered copies stay unanswered (not counted as missing).
- `abandon(censusId)`: deletes an open census.
- `report(censusId)`: section 6.
- `list()`: past censuses with counts.

Writes go through one queue (same pattern as `WishlistPriceService.enqueueWrite`), since
answers arrive quickly from the keyboard.

### 4.5 Routes (`routes/census.ts`, mounted at `/api/v1/census`)
| Method | Path | |
|--------|------|-|
| GET | `/` | past censuses |
| GET | `/open` | open census with walk list |
| POST | `/` | start |
| PUT | `/:id/entries/:instanceId` | answer (body: answer, note) |
| DELETE | `/:id/entries/:instanceId` | clear answer |
| POST | `/:id/extras` / DELETE `/:id/extras/:extraId` | records not in Discogs |
| POST | `/:id/finish` | finish |
| DELETE | `/:id` | abandon open census |
| GET | `/:id/report` | report |

Static paths (`/open`) before `/:id`. 400 for bad answers and over-long notes.

---

## 5. Phase 2: census page

New route `#census` (`ShelfCensusPage.tsx` + `ShelfCensusPage.page.css`), linked from
Browse Collection ("Shelf census") and the Pocket List card.

### Start screen
- Format (Vinyl default) and sections as checkboxes in shelf order, each with its copy
  count ("A · 84"), "All sections", and "Last census: 3 months ago" per section if any.
- "Start census" button. If one is open: "Resume census (B–C, 41 of 120 done)" and
  "Abandon".

### Walk screen
- One list in shelf order with section headings and "file under" headings ("Smith,
  Elliott"), like the Pocket List. Each row: cover thumbnail, artist, title, year, format and
  label line (enough to tell pressings apart), copy number when there are two ("copy 2 of
  2, added 2024"), and three buttons: Here, Missing, Misfiled.
- Phone: each row's answer buttons are full-width tap targets (at least 44px), and the
  current row scrolls into view after each answer.
- Keyboard: the current row is highlighted; **H** here, **M** missing, **F** misfiled
  (opens the note field), **↑/↓** move, **U** undo the last answer, **N** add a record not
  in Discogs. Answering moves to the next row. Keys are listed in a small help line.
- "Mark the rest of this section as here" button, for the common case where most of a
  section is fine and the owner only flags exceptions. It asks for confirmation.
- Progress bar and counts at the top ("72 of 120 · 3 missing · 1 misfiled"), sticky.
- Each answer is saved straight away (optimistic update, undo on error with a toast), so
  closing the tab loses nothing.
- Lucide icons (`Check`, `CircleHelp`/`SearchX` for missing, `MoveRight` for misfiled,
  `Plus`), design tokens, no emoji; rows are buttons with `aria-pressed` for the chosen
  answer.

---

## 6. Phase 3: report and "last seen"

Report for a finished census (also available as a preview while open):
- **Missing** copies, each with a link to the release on Discogs (to remove it there) and
  "Add to Discard Pile" (prefilled reason "other", note "Missing in shelf census
  YYYY-MM-DD"; the owner chooses).
- **Misfiled** copies with notes and where they should go ("file under Smith, Elliott,
  section S").
- **Not in Discogs**: the extras, each with a Discogs search link.
- **Discard Pile says gone, Discogs still lists it**: copies in scope whose release (or
  instance, once the Discard Pile stores it) is in the Discard Pile as sold, gifted,
  removed or traded in.
- **Unanswered** copies (count, with a "Resume" link if the census is still open).
- **Added since this census started**.

"Last seen" shows on Release Details ("Last seen on the shelf: March 2026") and as a
sort/filter on Browse Collection later (not in this plan).

---

## 7. Tests

- Phase 0 mapping and row tests (section 3).
- `shelfOrder`: same order as the Pocket List for a fixture with articles, overrides,
  Various, Soundtracks, two copies of one release.
- Service: start (409 open, 422 missing instanceId), answer/clear/undo, extras, finish
  updates `lastSeen` only for here/misfiled, frozen scope, report sections including
  "added since" and the Discard Pile cross-check, 20-census cap.
- Backup: export/import/merge of censuses and `lastSeen`; old backups without the field.
- Routes: validation, `/open` vs `/:id`.
- Page: start screen counts, resume, keyboard answers advance, undo, "mark the rest",
  saved answers survive a reload, report rendering.

---

## 8. Questions for the owner (defaults used if unanswered)

- **Q1. How do you want to walk it?** Default: phone in hand at the shelf, with keyboard
  keys also working on a laptop. Checking the pressing means reading cat# and runout off
  the record, which is easier with the phone next to it.
- **Q2. Misfiled: worth a separate answer?** Default: yes, since the filing rules are the
  app's own and a misfiled copy may mean the rule is wrong (fix it in Settings → filing
  overrides).
- **Q3. Unanswered copies at finish:** Default: left as unanswered, not counted missing.
- **Q4. CDs and the cassette:** Default: their own census by format, since they're shelved
  apart from the vinyl.
- **Q5. Pressing check every census, or once per copy?** Default: on for copies never
  confirmed, off for copies already confirmed (they keep their date). The owner can turn it
  on for everything from the start screen.
