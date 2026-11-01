# Wishlist Priorities Plan

Owner request (2026-10-31): set your own priority order on the wishlist, with a drag and drop
view and an easy way to move a record from near the bottom to the top. This comes **before**
[buying-shortlist-plan.md](buying-shortlist-plan.md), which should follow the order set here.

## Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Priority store, service, routes, backup | Done 2026-10-31 | Branch feat/wishlist-priorities |
| Phase 2: Priority tab (drag and drop, Move to top, position field, search) | Done 2026-10-31 | Verified in a browser on a data copy: mouse and keyboard drag, auto-scroll |
| Phase 3: Priority sort and rank badge on the other tabs | Done 2026-10-31 | |
| Phase 4: Revise the buying shortlist to follow priorities | Not started | Plan text only until the shortlist is built |

---

## 0. Summary

- A **Priority** tab on the Wishlist page: a compact list with your ranked records in order,
  and everything else below under **Not ranked yet**.
- Three ways to move a record:
  - **Drag** it by its handle (the list scrolls as you near the edge).
  - **Move to top** button on every row: one click, no dragging.
  - **Type a position** by clicking its number: type 3, press Enter.
- **Search** the list, then Move to top, for a record you don't want to scroll to.
- **Undo** after every move.
- **Sort by Priority** in the sort menu on the other Wishlist tabs, with a "#3" badge on
  ranked cards.

You don't have to rank all 201 records. Rank the ones that matter; the rest stay unranked,
which means "not decided yet", not "unwanted".

---

## 1. Verified current state (2026-10-31, on a copy of real data)

- `WishlistPage.tsx` is 1,263 lines. Tabs: `all, vinyl, cd_only, affordable, price_alerts,
  monitoring, new_releases`. `SortOption`: `date, price, artist, album, scrobbles`.
- Wants: 208 Discogs wants on 183 masters. 18 masters have 2–3 wants (different pressings);
  5 wants have no master id. So there are **201 records to rank**: 183 masters + 5 releases
  without a master + 13 local wants.
- Local (monitored) wants: 13. `LocalWantItem.id` is stable. Their `masterId` is a guess from
  the first Discogs search result, so it must not be used as identity. 11 have one; 1 matches a
  Discogs want's master.
- The page merges local wants into other tabs with **temporary negative ids** and hides a
  local want when a Discogs want has the same normalized artist and title
  (`WishlistPage.tsx:433`). Never store those ids.
- Discogs want `rating` (0–5) is 0 on every want and too coarse for this. It stays untouched.
- There is no drag and drop library or code in the app. `@tanstack/react-virtual` is already
  a dependency.
- `FileStorage.readJSON` returns null for both a missing file and a corrupt one
  (`fileStorage.ts:110`). The priority service must tell them apart with `exists()`, or a
  corrupt file would look like "no priorities" and the next save would erase them.
- Price alerts show the pattern for a wishlist store: `wishlist/price-alerts.json`, registered
  in `migrationService` and `backupService`.

---

## 2. Decisions

| Question | Decision | Why |
|----------|----------|-----|
| Full order, tiers, or both? | One strict order over a subset; no tiers | Tiers can't express "this one first", and tiers plus order adds rules about moving between them. Can be added later |
| Rank all 201? | No | Ranking 200 is a chore that goes stale; top 10–30 is what buying needs |
| Pressings | One row per master | Rank is about the record. Pressings of a master share a position, and the row shows "3 pressings wanted" |
| Long moves | Move to top, position field, search | Long drags are the hassle being avoided. Two-pane layouts add complexity without beating these |
| Storage | Ordered array in one small file | Each save rewrites a tiny file, so fractional keys buy nothing |

**Library: `@hello-pangea/dnd` 18.** Made for vertical lists, with auto-scroll, keyboard
dragging and screen reader announcements built in, and it declares React 19 support.

The peer reviewer preferred `@dnd-kit/react`, which also declares React 19 support. It is
still 0.5.x, so its API may change before 1.0, and this feature doesn't need its flexibility.
Fallback if it misbehaves under React 19: `@dnd-kit/core` 6 + `@dnd-kit/sortable` 10.

No virtualization to start: about 200 compact rows, memoized, with lazy-loaded covers.

---

## 3. Identity and sync rules

Record keys:

| Record | Key |
|--------|-----|
| Discogs want with a master | `master:<masterId>` |
| Discogs want without a master | `release:<releaseId>` |
| Local want | `local:<LocalWantItem.id>` |

Rules:
- **New wants** start unranked.
- **Removing one pressing** keeps the master's rank, as long as another want remains.
- **A want that leaves** (bought, removed on Discogs) keeps its key in storage but is hidden,
  and positions close up around it. If it returns, it resumes its place relative to the keys
  around it. Moves must never drop hidden keys.
- **Local want later wanted on Discogs:** the page already treats these as one record when the
  normalized artist and title match, so priorities use the same match. When reading, a local
  key with a matching Discogs want counts as that want's record. If both are ranked, the
  higher position wins. Never match on the guessed `masterId`.
- **A want without a master that gains one:** `release:` key moves to `master:`, by the same
  rule.
- **Old keys are rewritten:** a `local:` or `release:` key that now counts as another record is
  saved as that record's key on the next read, so the rank survives the original want leaving.
  Trade-off: if a merged record's Discogs want later leaves, its local want starts unranked.

---

## 4. Phase 1: backend

### 4.1 Types (`src/shared/types.ts`)
```typescript
export interface WishlistPriorityStore extends VersionedStore {
  schemaVersion: 1;
  /** Ranked record keys, first = top. May include keys of absent records. */
  orderedKeys: string[];
}

export interface WishlistPriorityRecord {
  key: string;
  /** 1-based among records that exist now; null = not ranked */
  rank: number | null;
  monitored: boolean;
  artist: string;
  title: string;
  year?: number;
  coverImage?: string;
  masterId?: number;
  /** Wants grouped under this record */
  wantIds: number[];
  localIds: string[];
}

export interface WishlistPrioritySnapshot {
  ranked: WishlistPriorityRecord[];
  unranked: WishlistPriorityRecord[];
}

export type WishlistPriorityChange =
  | { action: 'move'; key: string; position: number } // 1-based; also ranks an unranked record
  | { action: 'unrank'; key: string };
```

### 4.2 `wishlistPriorityService.ts`
- `getSnapshot()`: joins the store with cached Discogs and local wants. No API calls.
- `applyChange(change)`: validates, updates, saves, returns the new snapshot. Positions count
  visible records, so the service converts them to places in `orderedKeys`, keeping hidden keys
  in place. Positions above the list length are clamped to the end.
- Writes go through one queue (same as `WishlistPriceService.enqueueWrite`), saved with
  `writeJSONWithBackup`.
- Corrupt file: `exists()` true and read returns null → the read reports an error and saves are
  refused, so the file can be repaired or restored from its backup.

The peer reviewer also suggested a revision number with 409 on stale writes. Left out: there's
one user, each change names a record rather than replacing the list, and the queue already
orders writes.

### 4.3 Routes (`routes/wishlist.ts`, before `/:masterId/...`)
- `GET /api/v1/wishlist/priorities` → snapshot.
- `PATCH /api/v1/wishlist/priorities` → one change, returns the snapshot. 400 for a bad action
  or a non-integer position; 404 for a record not on the wishlist; 503 if the store is corrupt.

### 4.4 Migration and backup
- `migrationService.register('wishlist-priorities', { path: 'wishlist/priorities.json',
  currentVersion: 1, migrations: [], optional: true })`.
- `backupService`: priorities are user-made and can't be rebuilt from Discogs, so they must be
  backed up: `FILE_PATHS.wishlistPriorities`, optional `wishlistPriorities?` on `BackupData`,
  preview count, export, import. Replace restores the order; merge keeps the current order and
  appends imported keys it doesn't have. Older backups without the field leave it untouched.

---

## 5. Phase 2: Priority tab

New `components/wishlist/WishlistPriorityView.tsx` and `WishlistPriorityRow.tsx`, with a
`useWishlistPriorities` hook, so `WishlistPage.tsx` doesn't grow. Styles in
`WishlistPriorityView.css`, design tokens only.

```
[ Search your wishlist...                ]        12 ranked · 189 not ranked

RANKED
 ⠿  1   [cover]  Talk Talk – Spirit Of Eden       2 pressings    [Remove]
 ⠿  2   [cover]  Prof – Good Time Boy                            [↑ Top] [Remove]
 ⠿  3   [cover]  Local H – Pack Up The Cats       Monitored      [↑ Top] [Remove]

NOT RANKED YET (A–Z)
    –   [cover]  A House – I Want Too Much                       [↑ Top] [+ Add]
```

- **Row:** drag handle (ranked only), position, small cover, artist and title (AlbumLink),
  pressing count or Monitored badge, actions. Lucide icons: `GripVertical`, `ArrowUpToLine`,
  `Plus`, `X`. About 48 px high.
- **Move to top:** ranks an unranked record at #1, or moves a ranked one to #1.
- **Add:** puts an unranked record at the end of the ranked list.
- **Position field:** click the number to edit. Enter commits, Escape cancels. Works for unranked
  rows too.
- **Remove:** back to Not ranked yet. The want itself isn't touched, and the label says
  "Remove priority" on hover.
- **Search:** filters both sections by artist and title, and positions stay the real ones.
  Dragging is off while searching, since a drop among filtered rows is ambiguous; a note says
  so. Move to top and the position field still work, and the search text stays, so several
  records can be sent up in a row.
- **Undo:** a toast after each move ("Moved to #1 · Undo"). It returns the record below the one it followed,
  not to an old position number, so undoing several moves in any order stays right.
- **Saving:** the list updates at once and saves one change per completed move. Requests run in
  order, and a failed save puts the list back with an error toast.
- **Keyboard:** the library's keyboard dragging (Space, arrows, Escape), with focus staying on
  the moved row. Every action is a real button with an `aria-label`.
- **Empty state:** "Nothing ranked yet. Click Top on the record you want most."

Tab order: `All`, **`Priority`**, then the rest. The sort menu is hidden on this tab.

---

## 6. Phase 3: sort by priority on the other tabs

- New `SortOption` `'priority'`, shown as "Priority" in the sort menu on All, Has Vinyl, CD
  Only, Affordable and Price alerts (Monitoring has no sort menu, so it only gets the badge).
  Default stays Date Added.
- Ranked records come first in rank order. Pressings of one master stay together, newest first.
  Unranked records follow, newest added first (same tiebreak as the current sort).
- Sorting by priority follows whatever the tab's filter leaves, and the badge shows the record's
  real rank. So Has Vinyl might show #1, #2, #4.
- Ranked cards show a small "#3" badge on every sort. The page reads ranks from
  `GET /wishlist/priorities`; local wants get theirs by `local:` key, not the temporary negative
  id.
- Rank changes on the Priority tab show up when returning to another tab, without a page reload.
- Sort is covered in the same place as the other sorts (`WishlistPage.tsx:496`).

---

## 7. Phase 4: buying shortlist follows priorities

Update [buying-shortlist-plan.md](buying-shortlist-plan.md) before building it:
- Walk eligible ranked records in order, and take each one that fits the remaining budget.
- Fill any remaining slots with scored unranked records (plays, alert price, wishlist age).
- Rank is an order, not a number added into the score, and #1 is never dropped to fit more
  records or score higher. Fewer than 3 picks is fine.
- Pick reasons say "Your #3 priority".
- Records that can't be bought (nothing for sale, local wants without prices) stay ranked, and
  the shortlist says why they were skipped.

---

## 8. Tests

- Service:
  - grouping (201 records from the fixture shape, pressings share a rank);
  - move, add, unrank, clamping, positions that skip hidden keys;
  - removal and return; last pressing removed vs one of several;
  - local want matching a Discogs want, both ranked (higher wins);
  - a guessed `masterId` never merges;
  - `release:` to `master:`;
  - missing vs corrupt file (corrupt refuses saves).
- Backup: export, replace, merge, old backup without the field.
- Routes: 400s, 503, not caught by `/:masterId/...`.
- Priority tab: sections, Move to top, Add, position field (Enter, Escape), Remove, Undo, search
  turns dragging off, failed save rolls back.
- Priority sort: ranked first, pressings together, filtered tabs keep real ranks, local wants
  ranked by their key, badge.
- Browser check on a scratch data copy: drag with auto-scroll, bottom to top with each method,
  keyboard drag and cancel, order survives a reload, under React StrictMode if used, in both
  themes.

---

## 9. Questions for the owner (defaults used if unanswered)

- **Q1. Should local (monitored) wants be rankable?** Default: yes, marked Monitored.
- **Q2. Ranked badge on cards?** Default: yes, small "#3".
- **Q3. Move-to-top on the regular wishlist cards too?** Default: no; ranking stays on the
  Priority tab, to keep the cards from getting more crowded.
- **Q4. Default sort?** Default: stays Date Added. Priority could become the default once you've
  ranked some records.
