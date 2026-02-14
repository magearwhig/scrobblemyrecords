# Traded In & Local Archive Plan

## Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Backup Fix + Core "Traded In" | **Complete** | Types, service, routes, backup, API client, UI, tests |
| Phase 2: Bulk Operations + Multi-Select | **Complete** | Bulk service/route, selection UI, shift-click, floating action bar, confirmation modal |
| Phase 3: Component Decomposition | **Complete** | DiscardItemCard, DiscardStatsBar, DiscardFilterBar, DiscardTradedInModal, useDiscardPileSelection hook |

**CI Results (all phases):** 0 TypeScript errors, 0 ESLint errors, 102/102 discard pile tests passing.

**Post-implementation refinements:**
- Default tab renamed from "All" to "Active" — excludes terminal-status items (sold, gifted, removed, traded_in)
- Est. Value and Actual Sales stats now reflect the currently filtered view, not global totals
- Fixed bug where history count in stats bar was missing `removed` status

---

## Overview
Extend the Discard Pile feature (Feature 7) with a "Traded In" action and local archive capability. When a user trades records at a store, they can mark items as traded in, preserving all metadata locally before deleting from Discogs. This ensures the app does not break when the Discogs cache refreshes, and the user retains a permanent history of records they used to own.

This plan also fixes an existing bug: the discard pile is not included in the backup system (Feature 10).

---

## Open Questions (Resolved)

| Question | Decision | Rationale |
|----------|----------|-----------|
| Should "traded in" be a new `DiscardStatus` or a new `DiscardReason`? | **New `DiscardStatus`** | "Traded in" is an *outcome* (what happened), not a *reason* (why you're discarding). A user trades in a record *because* of `not_listening` (reason), and the *result* is `traded_in` (status). Fits alongside `sold`, `gifted`, `removed`. |
| Should the archive be a separate data file or part of the discard pile? | **Discard pile IS the archive** | `DiscardPileItem` already stores all needed metadata (artist, title, format, year, cover, rating, prices, dates, notes). Items persist across status changes. A separate archive would duplicate data, double backup work, and create sync issues. The "archive" is a filtered view of terminal-status items. |
| Should Discogs deletion be automated via API? | **Manual for Phase 1, API in Phase 2** | Archiving locally is safe and reversible. Discogs deletion is irreversible and rate-limited. Separating these operations avoids dangerous partial-failure scenarios. Phase 1 provides helpful links; Phase 2 adds background job deletion. |
| Should there be a new tab for traded-in items? | **No -- expand "Completed" tab, rename to "History"** | 6 tabs causes layout issues at narrow breakpoints. `traded_in` is a completion event like `sold` or `gifted`. Renaming "Completed" to "History" better communicates "records I used to own." |
| Does this need a new page? | **No** | Agent 8 (Principles Enforcer) vetoed a new page per UI Navigation Guidelines. This integrates into the existing Discard Pile page. |

---

## Data Model

### Type Changes (modify `src/shared/types.ts`)

```typescript
/**
 * Status of a discard pile item
 * CHANGED: Added 'traded_in' terminal status
 */
export type DiscardStatus =
  | 'marked'      // Just added to discard pile
  | 'listed'      // Listed for sale somewhere
  | 'sold'        // Successfully sold
  | 'gifted'      // Given away
  | 'removed'     // Actually removed from collection
  | 'traded_in';  // Traded in at a store

/**
 * Stats for discard pile
 * CHANGED: byStatus now includes traded_in count
 */
export interface DiscardPileStats {
  totalItems: number;
  byStatus: Record<DiscardStatus, number>;
  byReason: Record<DiscardReason, number>;
  totalEstimatedValue: number;
  totalActualSales: number;
  currency: string;
}

/**
 * Backup data structure
 * CHANGED: Added discardPileItems field (fixes existing backup gap)
 */
export interface BackupData {
  // ... existing fields ...

  // Discard Pile (NEW - fixes backup gap)
  discardPileItems: DiscardPileItem[];
}
```

No new data files, no new store types, no new migration registrations. The discard pile file (`collections/discard-pile.json`) is already registered in `migrationService.ts` and uses `schemaVersion: 1`. The `DiscardStatus` change is additive and requires no data migration.

---

## Backend Implementation

### 1. Service Layer (modify `src/backend/services/discardPileService.ts`)

```typescript
/**
 * Mark item as traded in. Sets status to 'traded_in' and updates statusChangedAt.
 * Follows existing markAsSold() pattern.
 */
async markAsTradedIn(id: string): Promise<DiscardPileItem | null>

/**
 * Bulk mark items as traded in. Single file write for atomicity.
 * Returns counts of succeeded/failed items.
 */
async bulkMarkAsTradedIn(ids: string[]): Promise<{
  succeeded: string[];
  failed: string[];
}>
```

**Key Implementation Details:**
- Follow the `markAsSold()` pattern at line 362 of `discardPileService.ts`
- Set `status: 'traded_in'`, update `statusChangedAt: Date.now()`
- Reject items already in terminal status (`sold`, `gifted`, `removed`, `traded_in`)
- Bulk operation: collect changes in memory, write store once (not per-item)
- Update `getDiscardPileStats()` to include `traded_in` in `byStatus` counter
- Update `getDiscardPileCollectionIds()` -- consider whether traded-in items should still show the "In Discard Pile" badge in collection view (recommendation: yes, to prevent re-adding)

### 2. Routes (modify `src/backend/routes/discardPile.ts`)

```typescript
// POST /api/v1/discard-pile/:id/traded-in - Quick action: mark as traded in
router.post('/:id/traded-in', async (req, res) => {
  // Validate id format
  // Call discardPileService.markAsTradedIn(id)
  // Return updated item or 404
});

// POST /api/v1/discard-pile/bulk/traded-in - Bulk mark as traded in
router.post('/bulk/traded-in', async (req, res) => {
  // Validate { ids: string[] } - non-empty array, valid id formats
  // Call discardPileService.bulkMarkAsTradedIn(ids)
  // Return { success: true, data: { succeeded: [...], failed: [...] } }
});
```

**Route ordering:** `/bulk/traded-in` must be registered BEFORE `/:id` routes (Express static-before-parameterized pattern, documented at line 236 of existing route file).

**Validation updates:**
- Add `'traded_in'` to `validStatuses` array (line 471) used by PUT `/:id` validation

**Updated Route Summary:**
```
GET    /api/v1/discard-pile                  - Get all discard pile items
GET    /api/v1/discard-pile/stats            - Get aggregated statistics
GET    /api/v1/discard-pile/ids              - Get just collection IDs (for badges)
POST   /api/v1/discard-pile                  - Add item to discard pile
POST   /api/v1/discard-pile/bulk             - Bulk add multiple items
POST   /api/v1/discard-pile/bulk/traded-in   - Bulk mark as traded in (NEW)
POST   /api/v1/discard-pile/refresh-values   - Auto-populate marketplace values
DELETE /api/v1/discard-pile/bulk             - Bulk remove multiple items
GET    /api/v1/discard-pile/:id              - Get single item by ID
PUT    /api/v1/discard-pile/:id              - Update item
DELETE /api/v1/discard-pile/:id              - Remove item from discard pile
POST   /api/v1/discard-pile/:id/sold         - Quick action: mark as sold
POST   /api/v1/discard-pile/:id/listed       - Quick action: mark as listed
POST   /api/v1/discard-pile/:id/traded-in    - Quick action: mark as traded in (NEW)
```

### 3. Backup Service (modify `src/backend/services/backupService.ts`)

This fixes an existing bug -- the discard pile is not in backups.

**FILE_PATHS addition:**
```typescript
const FILE_PATHS = {
  // ... existing entries ...
  discardPile: 'collections/discard-pile.json',  // NEW
} as const;
```

**New load method:**
```typescript
private async loadDiscardPile(): Promise<DiscardPileItem[]> {
  const store = await this.fileStorage.readJSON<DiscardPileStore>(
    FILE_PATHS.discardPile
  );
  return store?.items ?? [];
}
```

**Export:** Include `discardPileItems` in the `BackupData` object returned by `exportBackup()`.

**Import:** Add merge block in `importBackup()`:
- Merge key: `item.id` (deterministic hash of `collectionItemId`)
- Conflict resolution: prefer item with later `statusChangedAt`
- Array wrapper: items are inside `{ schemaVersion: 1, items: [...] }` store format

**Preview:** Add `discardPileItemsCount` to `BackupPreview` and comparison logic in `previewImport()`.

**Backwards compatibility:** Old backup files will have `undefined` for `discardPileItems`. The import handler should gracefully skip when the field is missing (existing pattern: `if (!backupItems || backupItems.length === 0) return`).

---

## Frontend Implementation

### 1. API Service Methods (modify `src/renderer/services/api.ts`)

```typescript
async markDiscardItemTradedIn(id: string): Promise<DiscardPileItem> {
  const response = await this.api.post(`/discard-pile/${id}/traded-in`);
  return response.data.data;
}

async bulkMarkDiscardItemsTradedIn(ids: string[]): Promise<{
  succeeded: string[];
  failed: string[];
}> {
  const response = await this.api.post('/discard-pile/bulk/traded-in', { ids });
  return response.data.data;
}
```

### 2. Discard Pile Page (modify `src/renderer/pages/DiscardPilePage.tsx`)

**Phase 1 changes (minimal -- single-item action):**
- Add `traded_in: 'Traded In'` to `STATUS_LABELS` map
- Add "Traded In" quick action button on cards with `marked` or `listed` status
- Update "Completed" tab filter to include `traded_in`: `item.status === 'sold' || item.status === 'gifted' || item.status === 'traded_in'`
- Rename "Completed" tab label to "History"
- Update stats bar to show traded-in count in the History stat card

**Phase 2 changes (multi-select + bulk):**
- Add selection mode toggle button in `.discard-pile-actions` bar
- Add checkbox to each item card (top-left of cover image)
- Add floating action bar when items are selected (reuse `floating-action-bar` CSS pattern from CollectionPage)
- Add bulk "Traded In" confirmation modal using existing `Modal` component
- Shift-click range selection

**Phase 3 changes (component decomposition):**
- Extract `DiscardItemCard` as `React.memo` component
- Extract modal components (Edit, Sold, Listed, TradedIn)
- Extract `DiscardStatsBar` and `DiscardFilterBar`
- Create `useDiscardPileSelection` custom hook
- Reduce parent page from ~1000 lines to ~250 lines

**Action button placement:**
```
For items with status 'marked' or 'listed':
[Edit] [Listed] [Sold] [Traded In] [Remove]
                                ^-- NEW (btn-outline-warning)
```

**Confirmation modal (bulk traded-in):**
```
┌──────────────────────────────────────────────────┐
│ Mark as Traded In                                │
│                                                  │
│ Archive 8 records as traded in?                  │
│ Their data will be preserved locally.            │
│                                                  │
│ ┌──────────────────────────────────────────────┐ │
│ │ [cover] Bon Iver - Bon Iver, Bon Iver       │ │
│ │ [cover] Radiohead - OK Computer              │ │
│ │ [cover] ...                                  │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ [Cancel]                    [Trade In 8 Records] │
└──────────────────────────────────────────────────┘
```

### 3. CSS Styling (modify `src/renderer/styles.css`)

```css
/* Traded In status badge -- orange to distinguish from sold (green) and marked (amber) */
.status-badge.status-traded_in {
  background: #ea580c;
  color: white;
}

/* Traded In button -- outline warning style */
/* Uses existing .btn-outline-warning class */

/* Multi-select checkbox on card (Phase 2) */
.discard-item-card .item-select-checkbox {
  position: absolute;
  top: 0.5rem;
  left: 0.5rem;
  z-index: 2;
  width: 1.25rem;
  height: 1.25rem;
  accent-color: var(--accent-primary);
  cursor: pointer;
}

/* Selected card highlight (Phase 2) */
.discard-item-card.selected {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px var(--accent-primary);
}

/* Selection bar (Phase 2) -- reuses floating-action-bar pattern */
.discard-selection-bar {
  /* follows .floating-action-bar pattern from CollectionPage */
}

/* Stats sub-label for traded-in count */
.discard-stats-summary .stat-sublabel {
  font-size: 0.7rem;
  color: var(--text-tertiary);
  margin-top: 0.125rem;
}
```

---

## Backup Gap Fix

This is a blocking prerequisite, independent of the "Traded In" feature itself.

**Problem:** The discard pile (`collections/discard-pile.json`) is not included in the backup system. Export, import, preview, and auto-backup all skip it. If a user restores from backup, all discard pile data is lost.

**Fix (in `backupService.ts`):**
1. Add `discardPile` to `FILE_PATHS`
2. Add `loadDiscardPile()` private method
3. Include in `exportBackup()` data gathering
4. Add merge block in `importBackup()` with `id` as merge key
5. Add to `previewImport()` comparison
6. Add to `emptySummary()` and `getBackupPreview()` counts

**Fix (in `types.ts`):**
1. Add `discardPileItems: DiscardPileItem[]` to `BackupData`
2. Add `discardPileItemsCount` to `BackupPreview`
3. Add `discardPileItems` entry to `BackupImportPreview['summary']`

---

## Edge Cases

| Case | Behavior |
|------|----------|
| User trades in item already in `sold` status | Reject -- item is already in a terminal status. Show error message. |
| User trades in item already in `traded_in` status | Reject -- idempotency check. Return error "already traded in". |
| Bulk operation with mix of valid/invalid items | Process valid items, skip invalid ones. Return `{ succeeded: [...], failed: [...] }`. |
| User re-acquires same record later | No conflict. Discogs assigns a new `collectionItemId`. Old discard pile entry remains as history. New copy is independent. |
| User deletes from Discogs, then cache refreshes | Item disappears from collection cache. Discard pile item survives (separate file). `orphaned` flag set to `true` if orphan detection runs. |
| User forgets to delete from Discogs | Nothing breaks. Item sits in History tab with `orphaned: false`. User can delete from Discogs at any time. |
| Archive file grows very large over years | 500 items over a decade = ~250KB. Well within JSON file storage limits. Can add server-side pagination later if needed. |
| Old backup file imported (no discardPileItems field) | Import handles gracefully -- `undefined` field skipped. No data loss. |

---

## File Changes Summary

### New Files
1. `tests/backend/services/discardPileService.traded-in.test.ts` - Tests for traded-in service methods (or extend existing test file)
2. `tests/backend/routes/discardPile.traded-in.test.ts` - Tests for traded-in routes (or extend existing test file)
3. `src/renderer/components/discard/DiscardItemCard.tsx` - Extracted card component (Phase 3)
4. `src/renderer/components/discard/DiscardTradedInModal.tsx` - Confirmation modal (Phase 2)
5. `src/renderer/hooks/useDiscardPileSelection.ts` - Selection state hook (Phase 2)

### Modified Files
1. `src/shared/types.ts` - Add `'traded_in'` to `DiscardStatus`, add `discardPileItems` to `BackupData`
2. `src/backend/services/discardPileService.ts` - Add `markAsTradedIn()`, `bulkMarkAsTradedIn()`, update stats
3. `src/backend/routes/discardPile.ts` - Add 2 new routes, update `validStatuses` array
4. `src/backend/services/backupService.ts` - Add discard pile to FILE_PATHS, load, export, import, preview
5. `src/renderer/services/api.ts` - Add `markDiscardItemTradedIn()`, `bulkMarkDiscardItemsTradedIn()`
6. `src/renderer/pages/DiscardPilePage.tsx` - Add button, update tab filter, rename tab, add selection (Phase 2)
7. `src/renderer/styles.css` - Add `.status-traded_in` badge, selection styles

### No New Data Files
The discard pile file (`data/collections/discard-pile.json`) already exists and is already registered in `migrationService.ts`. No new files to register.

---

## Testing Requirements (>=90% coverage)

### Service Tests

```typescript
describe('markAsTradedIn', () => {
  it('should update status to traded_in and set statusChangedAt');
  it('should return null for non-existent item');
  it('should reject items already in sold status');
  it('should reject items already in traded_in status');
  it('should reject items in gifted or removed status');
  it('should accept items in marked status');
  it('should accept items in listed status');
});

describe('bulkMarkAsTradedIn', () => {
  it('should mark multiple items as traded in with single file write');
  it('should continue processing when individual items fail');
  it('should return succeeded and failed arrays');
  it('should return all failed when no valid items');
  it('should handle empty ids array');
});

describe('getDiscardPileStats - traded_in', () => {
  it('should include traded_in count in byStatus');
  it('should include traded_in items in totalItems');
});
```

### Route Tests

```typescript
describe('POST /api/v1/discard-pile/:id/traded-in', () => {
  it('should mark item as traded in and return updated item');
  it('should reject invalid id format');
  it('should return 404 for non-existent item');
  it('should return 409 for already-traded item');
});

describe('POST /api/v1/discard-pile/bulk/traded-in', () => {
  it('should bulk mark items as traded in');
  it('should reject empty ids array');
  it('should validate id format in array');
  it('should return partial success when some items fail');
});
```

### Backup Integration Tests

```typescript
describe('backup with discard pile', () => {
  it('should export backup including discard pile items');
  it('should import backup with discard pile items in merge mode');
  it('should import backup with discard pile items in replace mode');
  it('should still import backups created before discard pile support');
  it('should include discardPileItemsCount in preview');
});
```

---

## Implementation Order

### Phase 1: Backup Fix + Core "Traded In" (~4 hours)
1. **Backup fix** - Add discard pile to `BackupData`, `BackupService` (export, import, preview)
2. **Types** - Add `'traded_in'` to `DiscardStatus` in `types.ts`
3. **Service** - Add `markAsTradedIn()` method to `DiscardPileService`
4. **Service tests** - Write tests for new method
5. **Route** - Add `POST /:id/traded-in` route, update `validStatuses`
6. **Route tests** - Write tests for new route
7. **API client** - Add `markDiscardItemTradedIn()` to `api.ts`
8. **UI** - Add "Traded In" button, update tab filter, rename tab, add badge CSS
9. **Verify** - Run full CI pipeline (lint, typecheck, tests, coverage)

### Phase 2: Bulk Operations + Multi-Select (~4 hours)
Dependencies: Phase 1

1. **Service** - Add `bulkMarkAsTradedIn()` method
2. **Route** - Add `POST /bulk/traded-in` route
3. **Route tests** - Bulk endpoint tests
4. **API client** - Add `bulkMarkDiscardItemsTradedIn()`
5. **UI** - Selection mode toggle, checkboxes, floating action bar, confirmation modal
6. **CSS** - Selection and floating bar styles
7. **Verify** - Run full CI pipeline

### Phase 3: Component Decomposition (~4 hours)
Dependencies: Phase 2

1. Extract `DiscardItemCard` with `React.memo`
2. Extract modal components
3. Extract stats bar and filter bar
4. Create `useDiscardPileSelection` custom hook
5. Add ARIA attributes (tabs, checkboxes, live regions)
6. Apply `useTabKeyNavigation` to tabs
7. **Verify** - Run full CI pipeline

---

## Future Enhancements (Out of Scope)

- Discogs API deletion via background job (`DELETE /users/{username}/collection/folders/0/releases/{releaseId}/instances/{instanceId}`)
- "Remove from Discogs" links on traded-in items (clickable URLs to Discogs release pages)
- Trade-in grouping by transaction (items traded in the same trip, store name, total credit)
- CSV export / packing list for store trips
- Collection cross-reference ("You previously owned this" indicator using `masterId` matching)
- Keyboard shortcuts for selection (Ctrl+A, Shift+click, Escape)
- Orphan detection wired to cache refresh (currently `markAsOrphaned()` exists but is never called automatically)
- Smart orphan labeling for terminal statuses (show "Removed from Discogs" instead of "Orphaned" for `traded_in`/`sold` items)
