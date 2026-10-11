# Listenography Backlog — Shark Tank Session (2026-03-08)

Generated via a 7-agent brainstorming session. The session summary recorded 25 accepted items from 39 pitches, but only 24 numbered items (#1–#24) were written down.

**Status (re-verified against code 2026-10-11): 24 tracked items, 19 done, 5 remaining.**
The remaining items are grouped into 3 open efforts (C, D, F). Efforts A, B and E are done.

### Count reconciliation

Earlier revisions of this file contradicted each other. The header said "16 completed, 9 remaining", the footer said "16 done, 9 remaining" and later "20 done, 5 remaining", and the README says "25 accepted items, 20 done, 5 remaining". None of these matched the item lists:

- The "Completed Items" list had 15 entries (it never included #1, #6, #10 or #16, which were marked done only in the effort sections).
- Efforts A, B and E add #1, #6, #10 and #16, for 19 done in total.
- Efforts C, D and F hold 5 open items (#5, #9, #18, #19, #20).
- 19 + 5 = 24. **#25 is not recorded in any version of this file** (checked through git history back to `151c3eb`), so it can't be verified or scheduled. Nobody remembers what it was (confirmed with the user 2026-10-11), so it is **dropped**: the backlog is 24 items, and no count in this file or the README includes #25.
- The per-agent table in Session Stats adds up to 23 accepted and 13 declined (36 pitches), not the 25/14/39 in the summary. It is kept as recorded.

---

## Completed Items (19)

The evidence column lists the symbol or file that proves each item exists in the current code.

| # | Item | Effort | Evidence in code |
|---|------|--------|------------------|
| 1 | Collection ROI Score | B | `CollectionROIChart` rendered on `StatsPage` |
| 2 | Setup Progress Banner | — | `SetupProgress` component, rendered on `HomePage` |
| 3 | Collection Cache Reader Utility | — | `getAllCachedCollectionItems()` in `src/backend/utils/collectionCache.ts` |
| 4 | Empty/Error State Consistency | — | `ErrorState` in `src/renderer/components/ui/EmptyState.tsx` (only `HomePage` uses it so far) |
| 6 | Webpack Bundle Splitting | E | `optimization.splitChunks` in `webpack.config.js`; `React.lazy` pages in `MainContent.tsx` |
| 7 | Global Keyboard Shortcuts | — | `useKeyboardShortcuts` hook plus `KeyboardShortcutsHelp` overlay, wired in `App.tsx` |
| 8 | Alert → Toast Migration | — | No `alert(` calls remain in `src/` (done before this session) |
| 10 | Album Listening Arc | B | `getAlbumListeningArc` (stats route plus `statsApi`); `AlbumListeningArc` on `AlbumDetailPage` and `ArtistDetailPage` |
| 11 | Navigate Wrapper Function | — | `navigate()` exported from `src/renderer/routes.ts` |
| 12 | On This Day Widget on Dashboard | — | `OnThisDay` rendered on `HomePage` |
| 13 | Detail Page Breadcrumbs | — | Built as `from`-aware back links (`backLabel` on the detail pages), not as a breadcrumb component |
| 14 | Missing Page CSS Files | — | `ArtistDetailPage`, `TrackDetailPage`, `WhatToPlayPage` and `NewReleasesPage` each have a `.page.css` |
| 15 | Batch Collection Lookup | A | `ScrobbleHistoryStorage.batchLookup()` |
| 16 | Taste Drift Dashboard | B | `TasteDriftChart` on `StatsPage`; taste-drift method in `genreAnalysisService` |
| 17 | Stats Cache Warming | A | `ScrobbleHistorySyncService.setStatsWarmer()` calls `warmCache()` after each sync |
| 21 | useAsync Hook | — | `src/renderer/hooks/useAsync.ts` exists, but **nothing calls it yet** |
| 22 | Saved Filter Presets | — | `CollectionFilterPreset` save/load on `CollectionPage` |
| 23 | History Tab Default | — | `historyDefaultTab` preference in `SettingsPreferencesSection`, read by `HistoryPage` |
| 24 | Global Sync Status Bar | — | `<SyncStatusBar globalBar />` in `App.tsx` |

Follow-ups found during verification. These are not reopened items:
- #4: `ErrorState` is used only on `HomePage`. Other pages still render their own error markup.
- #21: `useAsync` has no callers. Adopt it in a page or delete it. Candidate for `tech-debt.md`.

---

## Remaining Work (5 items, 3 efforts)

| # | Item | Effort | Plan | Status |
|---|------|--------|------|--------|
| 5 | Personal journal / listening notes | D | [listening-notes-plan.md](listening-notes-plan.md) | Planned, not started |
| 9 | CSV/JSON data export | D | [data-export-plan.md](data-export-plan.md) | Planned, not started |
| 18 | Context tags | F | [context-tags-plan.md](context-tags-plan.md) | Planned, not started |
| 19 | Marketplace price trend tracking | C | [marketplace-upgrade-plan.md](marketplace-upgrade-plan.md) | Re-planned 2026-10-11 against current code; not started (Phase 0 API check first) |
| 20 | Seller match auto-scan | C | [marketplace-upgrade-plan.md](marketplace-upgrade-plan.md) | Re-planned 2026-10-11 against current code; not started (Phase 0 API check first) |

Verified 2026-10-11 that none of these has started. There is no notes service or `data/notes/`, no `/api/v1/export` route, no `context` field on `ScrobbleSession`, and no `price-history.json` or scheduled seller scan. The only `setInterval` in `src/server.ts` is the 6-hourly auto-backup check.

### ~~Effort A: Stats Performance~~ — DONE

~~#15 Batch Collection Lookup~~, ~~#17 Stats Cache Warming~~ (commit `151c3eb`)

### ~~Effort B: Analytics Trio~~ — DONE

~~#1 Collection ROI Score~~, ~~#10 Album Listening Arc~~, ~~#16 Taste Drift Dashboard~~ (commit `60c0d5a`)

### Effort C: Marketplace Upgrade (#19 + #20) — see [marketplace-upgrade-plan.md](marketplace-upgrade-plan.md)

Both items extend seller monitoring: #19 adds per-listing price history and alert rules, and #20 adds scheduled background scans with persistent notifications. The full spec lives in the plan. An earlier attempt put the region filter in the wrong place and never wired up version pricing. The plan was re-audited against the code on 2026-10-11 and now separates seller location from shipping, and asking prices from sale prices.

### Effort D: Small Independent Features (#5, #9)

**#5 Personal journal / listening notes** — see [listening-notes-plan.md](listening-notes-plan.md).
The original pitch was a per-album textarea on ReleaseDetailsPage. The plan separates three kinds of note: notes about the album, notes about a specific copy, and notes about a listening session. It recommends album-level notes as the MVP. Those notes are stored locally, backed up, and shown on both the Album Detail and Release Details pages.

**#9 CSV/JSON data export** — see [data-export-plan.md](data-export-plan.md).
The plan defines machine-readable exports of the collection, wishlist (Discogs wants plus local wants), plays and mappings, with a documented, stable schema. It also defines the shared `exportDataService` row layer that the [Pocket List Export](pocket-list-export-plan.md) PDF reuses.

### ~~Effort E: Build Infrastructure~~ — DONE

~~#6 Webpack Bundle Splitting~~ (commit `826bde0`)

### Effort F: Context Tags (#18) — see [context-tags-plan.md](context-tags-plan.md)

Inline context chips ("late night", "cooking") on the ReleaseDetailsPage scrobble flow. They are stored on `ScrobbleSession` and feed a Context Breakdown chart on StatsPage. If session-level notes are added later, coordinate with [listening-notes-plan.md](listening-notes-plan.md): both plans extend `ScrobbleSession`.

---

## Items With a Dedicated Plan

| Item(s) | Why a separate plan | Plan file |
|---------|---------------------|-----------|
| #5 Listening notes | Choosing the note level, a stable album identity across mappings, new data file plus backup | [listening-notes-plan.md](listening-notes-plan.md) |
| #9 Data export | Dataset schemas, original vs corrected metadata, the shared row layer used by the Pocket List PDF | [data-export-plan.md](data-export-plan.md) |
| #18 Context Tags | New data model, tag CRUD, inline UI, analytics queries, new chart | [context-tags-plan.md](context-tags-plan.md) |
| #19 + #20 Marketplace Upgrade | Per-listing price history (asking prices only; no sales data in the API), alert rules, seller location vs shipping, server-side scheduler, persistent deduplicated notifications | [marketplace-upgrade-plan.md](marketplace-upgrade-plan.md) |

---

## Session Stats (as recorded)

| Agent | Accepted | Declined |
|-------|----------|----------|
| Tech Debt Auditor | 5 | 0 |
| UX & Design Critic | 5 | 1 |
| Data & Analytics Visionary | 3 | 2 |
| Power User Advocate | 3 | 1 |
| Performance Engineer | 3 | 2 |
| Feature Scout | 2 | 3 |
| Integration Explorer | 2 | 4 |

**Recorded total: 25 accepted / 14 declined from 39 pitches. The rows above add up to 23 / 13.** The tracked items are #1–#24: 19 done, 5 remaining.
