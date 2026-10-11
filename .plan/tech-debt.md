# Technical Debt & Improvements

Consolidated from the January–February 2026 audits and the 2026-03-22 consistency audit. **Last re-verified against the code: 2026-10-11** (branch `feat/album-version-merging`, HEAD `0f43ff8`).

**Status: 24 open, 42 completed / resolved.**

- Open = C1 (coverage, ongoing) + 20 still-open items from the March 2026 audit + 3 new open items from the October 2026 reviews (M31–M33). M32 and M33 came out of the 2026-10-11 planning review (data-export and marketplace plans). H15, found in the same review, was fixed the same day.
- 2026-10-11 review closed M26 (not applicable) and M29 (resolved). It narrowed H14, M27, M28, M30, L15, L16 and L17 to what is still true.
- Product feature ideas are in [Product ideas (not tech debt)](#product-ideas-not-tech-debt) at the end. They are not counted here.

---

## Priority Legend

Open items are ranked by **what to do next**. The original audit severity is kept for reference in the summary table.

| Priority | Meaning |
|----------|---------|
| **P1** | Do next. Violates a stated project rule, or a small fix that removes a correctness/security risk. Mostly quick wins. |
| **P2** | Schedule soon. Real maintenance cost or user-visible inconsistency, moderate effort. |
| **P3** | Opportunistic. Cleanup, large refactors with low user value, or "nice to have" test breadth. Do it when you are already touching the area. |

---

## Open Items Summary

| # | Finding | Priority | Audit severity | Effort | Why this priority |
|---|---------|----------|----------------|--------|-------------------|
| H9 | Duplicate logger, and the two copies have drifted | **P1** | High | Low | Backend is missing the renderer's URL-token redaction pattern, so a security-relevant gap. |
| H11 | Toast icons use unicode, not lucide-react | **P1** | High | Low | Breaks CLAUDE.md icon rule. One-file fix. |
| H12 | `EmptyState.css` hardcoded `font-size: 4rem` | **P1** | High | Low | Breaks CLAUDE.md token rule. Needs a new token (see detail). |
| H13 | `--accent-warning` token undefined (10 usages rely on fallback) | **P1** | High | Low | Breaks the token rule. Dark mode gets no override. |
| M31 | Warm stats cache not invalidated by every album-mapping change | **P2** | Medium (new) | Low | Can serve stale top-album stats until the next sync. |
| M32 | Backups omit several user-created data files | **P2** | Medium (new) | Low–Medium | A restore silently loses track mappings, compound-artist mappings, dismissed album merges and scrobble sessions. |
| M33 | "Median sale price" label shows a Discogs price suggestion | **P2** | Medium (new) | Low | Misleading value estimates. Copy and field-name fix. |
| C1 | Coverage thresholds (60/65/73/72) vs 90% target | **P2** | Critical (policy) | Ongoing | Policy gap, but thresholds already stop regressions. Next step is to measure and ratchet. |
| M23 | Two notification systems (toast vs persistent) | **P2** | Medium | Low (doc) / High (merge) | Short-term guidance doc is cheap. `SellersPage` uses both. |
| M24 | Destructive actions use native `confirm()` | **P2** | Medium | Low | 3 call sites bypass `useConfirmModal`. |
| L17 | Icon-only buttons missing `aria-label` | **P2** | Low | Low | 2 concrete instances found. Quick a11y fix. |
| C1-a | `suggestions.ts` route coverage | **P2** | (part of C1) | Medium | Biggest route file (2,242 lines). Coverage last measured Feb 2026. |
| H14 | `MemoryScrobblePage` has no skeleton for saved collections | **P3** | High → narrowed | Low | Only 1 of the original 4 pages is still affected. |
| M21 | Z-index scale tokens | **P3** | Medium | Low | 16 raw values. No bugs reported. |
| M22 | Breakpoint scale documentation | **P3** | Medium | Low | Documentation only. |
| M25 | Route handlers not on `apiResponse` helpers | **P3** | Medium | Medium | 5 of 21 route files migrated. Response shape is already consistent. |
| M27 | `statsService.ts` file size (3,074 lines) | **P3** | Medium | High | Split when next doing major stats work. Error-swallowing concern re-checked and downgraded. |
| M28 | 2 pages without page tests | **P3** | Medium → narrowed | Low | 23 of 25 pages now have tests. |
| M30 | Arrow-key navigation on remaining tab UIs | **P3** | Medium → narrowed | Low–Medium | 6 tablists done. 2 tablists plus ~5 tab-style UIs left. |
| H10 | Singleton services bypass constructor DI | **P3** | High | Medium | 2 singletons. Tests already mock them. Low payoff. |
| H8 | Rename `src/renderer/` to `src/client/` | **P3** | High | Medium | Pure churn (~349 refs in 104 non-doc files). Do it in a quiet period, alone. |
| L13 | Large service files (seller, release tracking) | **P3** | Low | High | Opportunistic. |
| L14 | Large frontend component files | **P3** | Low | Medium | Opportunistic. |
| L15 | Hook/context tests | **P3** | Low → narrowed | Medium | 6 hooks and ThemeContext have no dedicated test. |
| L16 | E2E coverage (7 smoke tests) | **P3** | Low | High | Only a smoke suite. |

> C1-a is a sub-action of C1, shown separately for visibility. It is **not** counted separately: 24 open = C1, H8–H14 (7), M21–M25, M27, M28, M30–M33 (11), L13–L17 (5).

---

## Recent changes relevant to this list (October 2026)

- **Album version merging via album mappings** (`135badf`, 2026-10-09; follow-ups `a2ca79f`, `a05d8c2`, `0f43ff8` on 2026-10-11). Shared helpers are in `src/shared/utils/albumMapping.ts`: `isCollectionLinked`, `albumNameKey`, `stripDiscogsSuffix` and the spelling-insensitive grouping key. Multi-name history lookup is in `src/backend/services/mergedAlbumHistory.ts` (`loadAlbumMappings`, `lookupMergedHistory`). Merge suggestions are in `src/backend/services/albumMergeSuggestions.ts`, and the Settings > Mappings card is `AlbumMergeSuggestionsCard.tsx`. Effects on this list:
  - **M27**: new grouping logic sits in standalone modules, not inside `statsService.ts`. That is the pattern to follow when splitting it.
  - **L14**: `SettingsMappingsSection.tsx` grew to 1,324 lines.
  - **M31 (new)**: album-mapping changes refresh the warm cache only from some code paths.
- **Stats warm-cache versioning** (`statsService.ts`). `WARM_CACHE_VERSION` (currently `2`) plus `artistAliasFingerprint()` (from `ArtistNameResolver.getFingerprint()`) are checked in `getValidWarmCache()`. Artist-alias changes now invalidate the warm cache automatically. Album-mapping changes do not (see M31).
- **Play dedupe keyed on timestamp + track** (`f5434e2`, 2026-10-11). `HistoryIndexMergeService.deduplicatePlays()` now keys on `` `${timestamp}|${track}` ``, so different tracks that share a scrobble timestamp are no longer collapsed. This was a fix to completed item H7's merge tool. No open item is affected.

---

## Open Items — Detail

### P1 — do next

#### H9. Duplicate logger implementation, now drifted

**Audit severity**: High | **Effort**: Low | **Quick Win**: Yes

`src/renderer/utils/logger.ts` (226 lines) and `src/backend/utils/logger.ts` (209 lines) both implement `SecureLogger` with their own `SENSITIVE_PATTERNS`. **The copies have diverged.** The renderer has an extra pattern for URLs with embedded `token`/`api_key`/`oauth_token` query params and smarter `:`/`=` prefix handling in redaction. The backend has neither. Production log levels also differ (renderer `WARN`, backend `INFO`). The backend is where URLs with OAuth params are actually logged, so this is a redaction gap, not just duplication.

**Action:**
- [ ] Extract the shared patterns and redaction logic to `src/shared/utils/` (e.g. `logRedaction.ts`). Keep env-specific level defaults in each wrapper.
- [ ] Add a unit test that both loggers redact the same sample strings.

**Files:** `src/renderer/utils/logger.ts`, `src/backend/utils/logger.ts`

---

#### H11. Toast icons use unicode instead of lucide-react

**Audit severity**: High (violates CLAUDE.md) | **Effort**: Low | **Quick Win**: Yes

`ToastContainer.tsx` `TOAST_ICONS` maps types to `'✓'`, `'✗'`, `'⚠'`, `'ℹ'` (✓ ✗ ⚠ ℹ). The dismiss button uses `&times;`.

**Action:**
- [ ] Replace with lucide `Check`, `X`, `AlertTriangle`, `Info` (16px, `aria-hidden="true"`). Use `X` for the dismiss button too.

**Files:** `src/renderer/components/ToastContainer.tsx`

---

#### H12. `EmptyState.css` hardcoded font-size

**Audit severity**: High (violates CLAUDE.md) | **Effort**: Low | **Quick Win**: Yes

`.empty-state-container--large .empty-state-icon` (line 35) uses `font-size: 4rem`. Note: the originally suggested `var(--text-3xl)` is only `2rem` and would halve the icon.

**Action:**
- [ ] Add a display/icon size token (e.g. `--text-display: 4rem` or `--icon-size-xl`) in `:root` in `styles.css` and use it here.

**Files:** `src/renderer/components/ui/EmptyState.css`, `src/renderer/styles.css`

---

#### H13. Missing `--accent-warning` design token

**Audit severity**: High | **Effort**: Low | **Quick Win**: Yes

`--accent-warning` is never defined. There are 10 usages, all relying on the CSS fallback `#f59e0b`: `Button.css` (4), `MarketplacePage.page.css` (3), `styles.css:3297`, `WishlistPage.page.css`, `ReleaseDetailsPage.page.css`. The `.dark-mode` block therefore cannot adjust it. `--status-warning` exists (`#ffc107` / `#ffd43b`), but it is a different colour.

**Action:**
- [ ] Define `--accent-warning` in `:root` and `.dark-mode` in `styles.css` (or alias it to `--status-warning` after a visual check). Then drop the inline fallbacks.

**Files:** `src/renderer/styles.css`, plus the 4 files listed above

---

### P2 — schedule soon

#### M31. Warm stats cache not invalidated by every album-mapping change (new, 2026-10-11)

**Audit severity**: Medium | **Effort**: Low | **Quick Win**: Yes

Since album version merging (`135badf`), warm-cached stats such as `topAlbums` depend on album mappings. `getValidWarmCache()` checks the sync timestamp, `WARM_CACHE_VERSION` and the artist-alias fingerprint, but has **no album-mapping fingerprint**. Freshness instead relies on callers. `routes/suggestions.ts` calls `refreshStatsAfterAlbumMappingChange()` on add, bulk-add and remove. Two other paths do not:
- auto-created mappings in `routes/scrobble.ts` (`mappingService.addAlbumMapping`, ~line 317)
- backup import of `mappings/album-mappings.json` (`backupService.ts`)

Those changes only show up in warm-cached stats after the next history sync invalidates the cache.

**Action:**
- [ ] Add an album-mapping fingerprint to the warm block, mirroring `artistAliasFingerprint`. This is preferred because it removes the need for callers to remember.
- [ ] Or invoke the same refresh from the scrobble auto-mapping and backup-restore paths.

**Files:** `src/backend/services/statsService.ts`, `src/backend/routes/scrobble.ts`, `src/backend/services/backupService.ts`, `src/shared/types.ts` (`StatsCache['warm']`)

---

#### C1. Test coverage thresholds vs stated 90% baseline

**Audit severity**: Critical (policy) | **Effort**: Ongoing | **Quick Win**: No

`README.md` and `dev_prompt.md` state a 90% coverage target. `jest.config.js` enforces lower global thresholds: **branches 60, functions 65, lines 73, statements 72**. These are unchanged since February 2026, verified 2026-10-11.

**Historical measurement (2026-02-15, after commit `b50fdbe`; not current):** branches 62.76%, functions 67.36%, lines 75.17%, statements 74.81%. That run had 145 suites and 3,762 tests. Coverage has not been re-measured for this document. Much code and many tests have been added since (e.g. `api.endpoints.test.ts` in July 2026, album-mapping tests in October 2026), so treat these numbers as stale.

**History of the February 2026 coverage push** (`b50fdbe`, 2026-02-15): 553 new tests across 26 new and 4 enhanced files. These covered 7 pages, 11 components, 4 utilities/hooks, and service expansions for `lastfmService`, `statsService`, `discogsService` and `releaseTrackingService`. Thresholds were raised from 50/57/63/63 to 60/65/73/72.

**Action:**
- [x] Tests for `wishlistService`, `hiddenItemService`, `trackMappingService`
- [x] Fix `getDiscogsAxios` singleton mocks; fix flaky timeouts
- [x] Raise thresholds 48–60 → 50/57/63/63 → 60/65/73/72
- [x] Add coverage report to CI. Verified 2026-10-11: `.github/workflows/ci.yml` runs `npm run test:coverage` and uploads `coverage/lcov.info` to Codecov on pushes to `main`.
- [ ] **Next step:** run `npm run test:coverage` locally, record the date-stamped result here, then raise thresholds to (measured − 2%).
- [ ] **C1-a:** improve `src/backend/routes/suggestions.ts` coverage. It was ~46% in February 2026 (historical). `tests/backend/routes/suggestions.test.ts` exists. Re-measure before acting.
- [ ] Consider separate thresholds for backend and frontend (Jest `coverageThreshold` per-path globs).
- [ ] Continue ratcheting toward 90%.

**Files:** `jest.config.js`, `README.md`, `dev_prompt.md`

---

#### M23. Notification system consolidation

**Audit severity**: Medium | **Effort**: Low (doc) / High (merge) | **Quick Win**: Doc only

There are two systems:
- `ToastContext` / `useToast` (ephemeral). Used in `CollectionPage`, `HistoryPage`, `LabelsPage`, `SellerMatchesPage`, `SellersPage`, `WebsitesPage` and `useJobPoller`.
- `useNotifications` (persistent, localStorage). Used in `Header`, `AlbumScrobbleHistory`, `AlbumMergeSuggestionsCard`, `AlbumDetailPage`, `ArtistDetailPage`, `DiscardPilePage`, `NewReleasesPage`, `RecommendationsPage`, `SellersPage` and `WishlistPage`.

`SellersPage` uses both.

**Action:**
- [ ] Short term: add a "which to use" note to `CONTRIBUTING.md`: toast for action feedback, notifications for things the user should see later.
- [ ] Long term: one system with optional persistence.

**Files:** `src/renderer/context/ToastContext.tsx`, `src/renderer/hooks/useNotifications.ts`

---

#### M24. Destructive actions using native `confirm()` instead of `useConfirmModal`

**Audit severity**: Medium | **Effort**: Low | **Quick Win**: Yes

`useConfirmModal` is now used in 6 places: `HistoryPage`, `LabelsPage`, `SellersPage`, `WebsitesPage`, `SettingsIntegrationsSection` and `SettingsMappingsSection`. Three destructive actions still use the browser `confirm()`:
- `components/settings/SettingsBackupSection.tsx:202`: delete backup
- `components/wishlist/NewReleasesTab.tsx:213`
- `pages/DiscardPilePage.tsx:227`: remove from discard pile

**Action:**
- [ ] Replace these 3 with `useConfirmModal`.
- [ ] Spot-check other delete/clear actions for missing confirmation.

---

#### L17. Icon-only buttons missing `aria-label`

**Audit severity**: Low | **Effort**: Low | **Quick Win**: Yes

`IconButton` requires `aria-label` by type. A heuristic scan on 2026-10-11 looked for `<button>`/`<Button>` elements with no text content and no `aria-label`. It found two "Play on Spotify" buttons that render only a `<Play>` icon and rely on `title`:
- `src/renderer/components/discovery/ForgottenFavoritesTab.tsx:438`
- `src/renderer/pages/ReleaseDetailsPage.tsx:1463`

**Action:**
- [ ] Add `aria-label` to both, or switch them to `IconButton`.

---

#### M32. Backups omit several user-created data files (new, 2026-10-11)

**Audit severity**: Medium | **Effort**: Low–Medium | **Quick Win**: Partly

`FILE_PATHS` / `BackupData` in `src/backend/services/backupService.ts` include album, artist and history-artist mappings, but not:
- `mappings/track-mappings.json` (`TrackMappingService`)
- `mappings/compound-artist-mappings.json` (`CompoundArtistMappingService`)
- `mappings/dismissed-album-merges.json` (Suggested Album Merges, `0f43ff8`)
- `scrobbles/session-*.json` (`ScrobbleSession` files written by `LastFmService.scrobbleBatch`; also not registered in `migrationService.ts`)

A backup restore silently loses these. Found while writing [data-export-plan.md](data-export-plan.md) and [context-tags-plan.md](context-tags-plan.md).

**Action:**
- [ ] Add the three mapping files to `FILE_PATHS`, `BackupData` and the import/merge logic (with tests).
- [ ] Decide whether scrobble session files belong in backups (open decision in context-tags-plan.md). If yes, register them in `migrationService.ts` too.

#### M33. "Median sale price" label shows a Discogs price suggestion (new, 2026-10-11)

**Audit severity**: Medium | **Effort**: Low | **Quick Win**: Yes

`WishlistService` (the marketplace stats fetch) sets `MarketplaceStats.medianPrice` from `/marketplace/price_suggestions` (Very Good Plus, else Very Good), and sets `highestPrice` from an estimate. Neither is sales data, and the Discogs API exposes no sales history. `ValueEstimationSection.tsx` still describes the values as "median sale prices", and `collectionAnalyticsService.ts` uses `medianPrice` for value estimates. Found while re-planning [marketplace-upgrade-plan.md](marketplace-upgrade-plan.md).

**Action:**
- [ ] Change the UI copy to "suggested price (VG+)" or similar, and explain what it is.
- [ ] Optionally rename the field (`suggestedPrice`) with a cache migration, or document the misnomer at the type definition.

### P3 — opportunistic

#### H14. Skeleton loading UI (narrowed to `MemoryScrobblePage`)

**Audit severity**: High → narrowed | **Effort**: Low

Re-verified 2026-10-11. `TrackDetailPage` and `ArtistDetailPage` already render `Skeleton` while loading (added in `6130b40`, 2026-02-14). `SuggestionsPage` already uses `AlbumCardSkeleton` (`5f3b81e`, 2026-02-14). The March audit was inaccurate for these three. Only `MemoryScrobblePage` lacks one: the saved-collections list (`getMemoryScrobbleCollections`) has no placeholder. Most of that page is a form, so impact is small.

**Action:**
- [x] ~~`TrackDetailPage`, `ArtistDetailPage`, `SuggestionsPage`~~ already had skeletons
- [ ] Add a list skeleton for saved collections in `MemoryScrobblePage` / `SavedCollectionManager`

---

#### M21. Z-index scale tokens

**Audit severity**: Medium | **Effort**: Low | **Quick Win**: Yes

There are 16 raw `z-index` values across renderer CSS (`1000` ×6, `100` ×5, `2` ×2, `1` ×2, `9999` ×1) and no `--z-*` tokens.

**Action:**
- [ ] Add `--z-dropdown: 100`, `--z-sticky: 200`, `--z-modal: 1000`, `--z-toast: 9999` to `:root` and replace raw values (local `1`/`2` stacking can stay).

---

#### M22. Breakpoint scale documentation

**Audit severity**: Medium | **Effort**: Low | **Quick Win**: Yes

Width media queries in use: `max-width: 768px` ×13, `900px` ×3 (+1 `min-width: 900px`), `640px` ×2, `600px` ×2, `480px` ×1. CSS custom properties cannot be used in media queries.

**Action:**
- [ ] Document the scale (480 / 640 / 768 / 900) in a comment block at the top of `styles.css`. Fold `600px` into `640px` where visually safe.

---

#### M25. Standardize route handlers on `apiResponse` helpers

**Audit severity**: Medium | **Effort**: Medium

5 of 21 route files use `sendError`/`sendSuccess`: `collectionAnalytics`, `embeddings`, `labels`, `recommendations`, `websites`. The other 16 use inline `res.status().json()`, about 440 calls. The largest are `suggestions.ts` (~121), `stats.ts` (~100), `releases.ts` (~64) and `discardPile.ts` (~60). The response shape is already consistent (`{ success, data | error }`), so this is about consistency, not correctness.

**Action:**
- [ ] Migrate route files when they are next touched. Do not do a big-bang change.

**Files:** `src/backend/routes/*.ts`, `src/backend/utils/apiResponse.ts`

---

#### M27. `statsService.ts` file size

**Audit severity**: Medium | **Effort**: High

`statsService.ts` is now **3,074 lines** (2,675 at the March audit). The "silent error swallowing" half of this finding was re-checked on 2026-10-11. All 7 `catch` blocks are best-effort: warm/invalidate/save/load of the stats cache, an optional session read, and an optional collection/value-cache read for ROI. Swallowing is reasonable there. That half is downgraded; no action needed.

**Action:**
- [ ] Split into focused modules when next doing substantial stats work. Candidates are warm-cache management, streaks, distributions, top lists and ROI. Follow the October 2026 pattern of standalone helpers (`mergedAlbumHistory.ts`, `albumMergeSuggestions.ts`).

**Files:** `src/backend/services/statsService.ts`

---

#### M28. Page component tests (narrowed)

**Audit severity**: Medium → narrowed | **Effort**: Low

The March claim "no page-level component tests exist" is no longer accurate. `tests/frontend/pages/` has tests for **23 of 25** pages. Missing: `MemoryScrobblePage`, `RecommendationsPage`.

**Action:**
- [ ] Add smoke-render tests for those two pages.

---

#### M30. Keyboard navigation on tab UIs (narrowed)

**Audit severity**: Medium → narrowed | **Effort**: Low–Medium

`useTabKeyNavigation` provides WAI-ARIA Left/Right arrow handling within `[role="tablist"]`. It is now used in 6 places: `SettingsPage`, `HistoryPage`, `CollectionAnalyticsPage`, `MarketplacePage`, `WhatToPlayPage` and `DiscardFilterBar`.

Remaining:
- `role="tablist"` without arrow-key handling: `components/wrapped/WrappedNav.tsx`, `components/stats/CollectionROIChart.tsx`
- Tab-style UIs (`activeTab` state) with no tab roles at all. Verify each before changing: `DiscoveryPage`, `WishlistPage`, `NewReleasesPage`, `DiscardPilePage`, `components/stats/RankingsOverTime.tsx`

**Action:**
- [ ] Add `role="tab"`/`aria-selected` plus `useTabKeyNavigation` to the above.

---

#### H10. Singleton services bypass constructor DI

**Audit severity**: High | **Effort**: Medium

Still true on 2026-10-11:
- `artistMappingService.ts:304` exports `new ArtistMappingService()`. It is imported directly by `server.ts`, routes (`scrobble`, `artistMapping`, `memoryScrobble`, `stats`, `suggestions`) and services (`statsService`, `releaseTrackingService`, `profileBuilderService`).
- `jobStatusService.ts:78` exports `new JobStatusService()`. It is imported by routes (`scrobble`, `collection`, `discardPile`, `jobs`, `wishlist`, `suggestions`) and `sellerMonitoringService`.

All other backend services use constructor injection.

**Action:**
- [ ] Instantiate both in `src/server.ts` and pass them into route factories and service constructors.

---

#### H8. Rename `src/renderer/` to `src/client/`

**Audit severity**: High | **Effort**: Medium

This is Electron-era naming for a standard web app. On 2026-10-11, `git grep "src/renderer"` gives ~349 references in 104 non-Markdown files (`webpack.config.js`, `jest.config.js`, `package.json`, plus tests importing `../../src/renderer/...`). Counting docs, it is ~706 references in 135 files. Purely mechanical, so it should be its own PR with nothing else in flight, because it conflicts with every open branch.

**Action:**
- [ ] `git mv src/renderer src/client`. Update webpack, jest, tsconfig, ESLint globs, test imports and docs (README, CONTRIBUTING, CLAUDE.md).

---

#### L13. Large service files

**Audit severity**: Low | **Effort**: High

`sellerMonitoringService.ts` is 2,533 lines (2,346 in March) and `releaseTrackingService.ts` is 1,652 (1,547 in March). Other large backend files: `routes/suggestions.ts` 2,242, `routes/stats.ts` 1,739, `wishlistService.ts` 1,731, `backupService.ts` 1,548, `labelMonitoringService.ts` 1,353.

**Action:**
- [ ] Split when next doing substantial work in each.

---

#### L14. Large frontend component files

**Audit severity**: Low | **Effort**: Medium

Line counts as of 2026-10-11: `CollectionPage.tsx` 2,026, `ReleaseDetailsPage.tsx` 1,725, `WebsitesPage.tsx` 1,546, `SettingsMappingsSection.tsx` 1,324 (grew with the album-merge work), `memory-scrobble/SavedCollectionManager.tsx` 1,081. Also `src/renderer/services/api.ts` is 2,529.

**Action:**
- [ ] Extract sub-components opportunistically.

---

#### L15. Context/hook tests (narrowed)

**Audit severity**: Low → narrowed | **Effort**: Medium

These already have tests: `ToastContext` (since `21b91ed`, 2026-02-08, so the March audit was inaccurate), `AppContext`, `AuthContext`, `useAsync`, `useCollectionLookup`, `useDiscardPileSelection`, `useJobPoller` and `useKeyboardShortcuts`.

No dedicated test: `ThemeContext`, `useConfirmModal`, `useEmbeddingStatus`, `useInfiniteScroll`, `useNotifications`, `useRecommendations`, `useTabKeyNavigation`. These are only mocked or exercised indirectly through page tests.

**Action:**
- [ ] Add direct tests, starting with `useNotifications` (localStorage persistence) and `useConfirmModal`.

---

#### L16. E2E test coverage

**Audit severity**: Low | **Effort**: High

`tests/e2e/smoke.spec.ts` has **7** Playwright smoke tests: app load, sidebar, unauthenticated home, settings tab, settings buttons, navigation, health endpoint. The March audit said 17. CI runs them on Chromium (`e2e` job in `.github/workflows/ci.yml`).

**Action:**
- [ ] Add flows that do not need live Discogs/Last.fm, using fixtures or the dev sandbox: collection browse/filter, manual scrobble prepare, settings mappings.

---

## Completed / Resolved Items

41 items. Newest first within each group. The original write-ups are kept below the table for history.

### Resolved in the 2026-10-11 review

#### ~~H15. Wishlist search returned a master ID as `releaseId`~~ FIXED (2026-10-11)

`WishlistService.searchForRelease()` searches Discogs with `type: 'master'` but returned the master ID as `releaseId`. `ReleaseTrackingService.addToWishlist()` (New Releases "add to wishlist") sent that value to `PUT /users/{username}/wants/{id}`, which expects a release ID, so it could add an unrelated release. Fix: the search result no longer has `releaseId`. The new `WishlistService.getMasterMainReleaseId()` reads `/masters/{id}.main_release`, and `addToWishlist` adds that release (or adds nothing and returns `false`). Local wants no longer store a `releaseId` from the search, and `getLocalWantList()` drops a stored `releaseId` equal to `masterId` (the file is corrected on the next save). Tests in `wishlistService.test.ts` and `releaseTrackingService.test.ts`.

**Account check (2026-10-11, read-only):** none of the user's 207 live Discogs wants carries the "Added from New Releases tracking" note, no want's release ID equals a master ID known to the app, and no tracked release is marked `inWishlist`. No wrong items were found.

**Related, still open:** `LabelMonitoringService.loadUserReferenceSets()` collects wishlist master IDs that the matching code never consults, so label items aren't cross-referenced against local wants by master.

#### ~~M26. Backend pagination parameter naming~~ NOT APPLICABLE (2026-10-11)

Re-verified. No backend route reads a `perPage` query param. Real pagination consistently uses `page` + `per_page` (`routes/collection.ts`, `routes/suggestions.ts`), matching the Discogs API convention. `limit` is used only as a top-N result cap (`routes/stats.ts`, `routes/auth.ts`, `routes/memoryScrobble.ts`, `routes/suggestions.ts`). That is a different concept, not an inconsistent pagination name. The frontend `perPage` argument in `api.ts` is serialized as `per_page`.

#### ~~M29. Frontend service test coverage~~ DONE (2026-07)

All three frontend services now have test files: `api.ts` → `tests/frontend/services/api.test.ts` + `api.endpoints.test.ts` (endpoint sweep, `884741a`, 2026-07-03); `apiToken.ts` → `apiToken.test.ts` (`6fc7b29`, 2026-07-25); `statsApi.ts` → `statsApi.test.ts`.

### Completed summary (February–March 2026)

| # | Finding | Result |
|---|---------|--------|
| H1 | No React Error Boundary | DONE |
| H2 | Empty-string fallbacks for API secrets | DONE |
| H3 | Lock file TOCTOU race | DONE |
| H4 | Massive inline styling + monolithic stylesheet | DONE (CSS modularization finished March 2026) |
| H5 | Background operations fail silently | DONE |
| H6 | Missing request size limits / rate limiting | DONE |
| H7 | Disconnected mapping services split artist entries | DONE |
| M1 | `console.*` bypasses secure logger | DONE |
| M2 | CryptoJS deprecated | DONE |
| M3 | Startup migrations not awaited | DONE |
| M4 | Unguarded `JSON.parse` | DONE |
| M5 | Standardize API error responses (helpers created) | DONE (route migration tracked in M25) |
| M6 | `fireEvent` vs `userEvent` | DONE |
| M7 | Accessibility gaps on form controls/buttons | DONE (follow-up audit in L17) |
| M8 | E2E tests not in CI | DONE |
| M9 | No list virtualization | DONE |
| M10 | No toast system | DONE |
| M11 | No `React.memo` on list items | DONE |
| M12 | Seller monitoring lacks rate limiting | DONE |
| M13 | Fixed timeout + unconditional delay | DONE |
| M14 | `decrypt()` returns `''` on failure | DONE |
| M15 | `data/` not auto-created | DONE |
| M16 | README architecture out of date | DONE |
| M17 | No contributor guide | DONE |
| M18 | Security/testing docs gitignored | DONE |
| M19 | Component extraction Level 3 & 4 | DONE |
| M20 | Button system consolidation | DONE |
| L1 | License metadata mismatch | DONE |
| L2 | Legacy auth endpoints | N/A (in use) |
| L3 | Security audit doesn't fail CI | DONE (since revised, see below) |
| L4 | `useState<any>` | DONE |
| L5 | No Node version enforcement | DONE (since raised, see below) |
| L6 | Deprecated `PORT` / `HOST=0.0.0.0` | Already addressed |
| L7 | Unused `wait-on` | DONE |
| L8 | CI doesn't test Node 22 | DONE (since revised, see below) |
| L9 | No request logging | DONE |
| L10 | No focus trap in modals | DONE |
| L11 | Centralize route identifiers | DONE |
| L12 | Sidebar reorganization | DONE |

Plus M26 (N/A) and M29 (DONE) above, for a total of **41**.

**Phase history:** Phase 0 quick wins, Phase 1 high-impact items, Phase 2 systematic refactors and Phase 3 strategic improvements were all completed between February and March 2026. The only carry-over is C1 (coverage), which is ongoing.

### Completed item details (historical)

#### ~~H7. Three disconnected mapping services cause split artist entries~~ DONE (February 2026)

Created `ArtistNameResolver` (`src/backend/services/artistNameResolver.ts`), a union-find alias graph over all mapping sources. It is applied at query time in `statsService`, `scrobbleHistoryStorage` and `wrappedService`. It auto-creates missing artist mappings at startup and rebuilds on mapping changes. There is an opt-in merge tool, `HistoryIndexMergeService`, at `/api/v1/stats/split-entries` and `/api/v1/stats/merge-split-entries`. Plan: `.plan/mapping-resolution-plan.md`.
*Follow-ups:* the resolver's `getFingerprint()` now keys the stats warm cache. `deduplicatePlays()` was fixed to key on timestamp+track (`f5434e2`, 2026-10-11).

#### ~~H1. No React Error Boundary~~ DONE (February 2026)

`ErrorBoundary` in `src/renderer/components/ErrorBoundary.tsx` wraps `<MainContent>` in `App.tsx`. It offers "Try Again" and "Reload Page" and logs via the secure logger.

#### ~~H2. Empty-string fallbacks for API secrets~~ DONE (February 2026)

`validateRequiredEnvVars()` in `src/server.ts` runs before service initialization and validates `ENCRYPTION_KEY`, the Discogs and Last.fm credentials.

#### ~~H3. Lock file TOCTOU race condition~~ DONE (February 2026)

Atomic lock creation via `writeFileSync({ flag: 'wx' })`. Stale-lock cleanup is kept as a fallback.

#### ~~H4. Massive inline styling + monolithic stylesheet~~ DONE (February–March 2026)

236 static inline styles were extracted to classes across 12 files (275 → 39 inline, all remaining dynamic). In Phase 3 (March 2026), `styles.css` went from 12,424 to ~3,048 lines, with page-specific CSS split into co-located `*.page.css` files.

#### ~~H5. Background operations fail silently~~ DONE (February 2026)

In-memory job-status map (`jobStatusService`) with frontend polling (`useJobPoller`) and toasts.

#### ~~H6. Missing request size limits and rate limiting~~ DONE (February 2026)

`express.json({ limit: '1mb' })` plus `express-rate-limit` (300 req / 15 min per IP) on `/api/`. Schema validation (Zod/Joi) was deferred.

#### ~~M1. Direct `console.*` bypasses secure logger~~ DONE (February 2026)

20 frontend and 2 backend files migrated to `createLogger()`. ESLint `no-console: error` applies to the backend.

#### ~~M2. CryptoJS (deprecated)~~ DONE (February 2026)

Native `crypto` with AES-256-GCM and scrypt. The legacy CryptoJS format is auto-detected for decryption. `crypto-js` was removed.

#### ~~M3. Startup migrations not awaited~~ DONE (February 2026)

`startServer()` awaits migrations before `app.listen()`.

#### ~~M4. Unguarded `JSON.parse`~~ DONE (February 2026)

`src/shared/utils/safeJsonParse.ts` with `JsonParseResult<T>`. Applied to OAuth token parsing.

#### ~~M5. Standardize API error responses~~ DONE (February 2026)

`sendError()` and `sendSuccess()` added in `src/backend/utils/apiResponse.ts` and used by the global, 404 and JSON-parse handlers. Rollout to routes is tracked in M25.

#### ~~M6. `fireEvent` vs `userEvent`~~ DONE (February 2026)

~220 calls in 19 test files migrated to `userEvent.setup()`. The documented exceptions are Modal keyDown, a custom DOM event, and range inputs.

#### ~~M7. Accessibility gaps on form controls and buttons~~ DONE (February 2026)

`aria-label` added to icon-only buttons in `Header`, `SearchBar`, `AISuggestionCard`, `NewReleaseCard` and `DashboardStatCard`.

#### ~~M8. E2E tests not run in CI~~ DONE (February 2026)

`e2e` CI job installs Chromium, runs Playwright and uploads the HTML report.

#### ~~M9. No virtualization for large lists~~ DONE (February 2026)

`VirtualizedCollectionGrid.tsx` (`@tanstack/react-virtual`, ResizeObserver-based columns) is used for collection browse mode.

#### ~~M10. No toast notification system~~ DONE (February 2026)

`ToastContext.tsx` (`useToast`, 4 types, duration, action) plus `ToastContainer.tsx`, with 24 tests. Migrating `alert()` calls was deferred. Native `confirm()` leftovers are tracked in M24.

#### ~~M11. No `React.memo` on list items~~ DONE (February 2026)

`AlbumCard`, `SuggestionCard`, `AISuggestionCard`, `NewReleaseCard`.

#### ~~M12. Seller monitoring lacks rate limiting~~ DONE (February 2026)

Shared singleton Axios in `src/backend/utils/discogsAxios.ts` (`getDiscogsAxios()`).

#### ~~M13. Fixed timeout + unconditional 1s delay~~ DONE (February 2026)

Token bucket in `discogsAxios.ts`: bursts of 5, refilling at 1 req/s.

#### ~~M14. `decrypt()` returns empty string~~ DONE (February 2026)

Throws `DecryptionError`. `getUserSettings()` blocks credential loss on key change.

#### ~~M15. `data/` not auto-created~~ DONE (February 2026)

`fs.mkdirSync('data', { recursive: true })` early in `src/server.ts`.

#### ~~M16. README architecture out of date~~ DONE (February 2026)

Directory tree regenerated from the filesystem.

#### ~~M17. No contributor guide~~ DONE (February 2026)

`CONTRIBUTING.md` created.

#### ~~M18. Security/testing docs gitignored~~ DONE (February 2026)

Public `SECURITY.md` added. `TESTING_GUIDE.md` un-ignored.

#### ~~M19. Component extraction Level 3 & 4~~ DONE (February 2026)

Extracted `WishlistItemCard`, `ReleaseCard`, `SellerCard`, `MatchCard`, `ScrobbleSessionCard`, `CollectionFilterControls` and `CacheStatusIndicator` (all `React.memo`).

#### ~~M20. Button system consolidation~~ DONE (February 2026, `fb48744`)

~290 `.btn` usages across 54 files migrated to `Button` / `IconButton`. The `warning` variant was added and all `.btn*` CSS rules removed. `IconButton` requires `aria-label`.

#### ~~L1. License metadata mismatch~~ DONE (February 2026)

`package.json` license changed from ISC to MIT.

#### ~~L2. Legacy endpoints~~ NOT APPLICABLE (February 2026)

`POST /discogs/token` and `POST /lastfm/callback` are used by `src/renderer/services/api.ts`.

#### ~~L3. Security audit doesn't fail CI~~ DONE (February 2026)

*Since revised:* CI now gates on `npm audit --omit=dev --audit-level=high` for production deps. The full-tree audit is informational (`|| true`). Threshold change: `b84764e`, 2026-04-14.

#### ~~L4. `useState<any>`~~ DONE (February 2026)

The 3 remaining `useState<any>` were replaced with inline types.

#### ~~L5. No Node.js version enforcement~~ DONE (February 2026)

*Since raised:* `engines.node` is now `>=22.0.0` and `.nvmrc` is `22`.

#### ~~L6. Deprecated `PORT` / `HOST=0.0.0.0`~~ ALREADY ADDRESSED (February 2026)

`.env.example` uses `127.0.0.1`. The server warns on non-localhost binding and falls back from `PORT` to `BACKEND_PORT`.

#### ~~L7. Unused `wait-on`~~ DONE (February 2026)

#### ~~L8. CI doesn't test Node 22~~ DONE (February 2026)

*Since revised:* the CI test matrix is now `22.x` and `24.x` (Node 24 fixes in `2b9e65d`, 2026-04-14).

#### ~~L9. No request logging~~ DONE (February 2026)

`morgan` piped through `SecureLogger`, skipping `/health` and disabled in tests. Structured logging (`pino`) was deferred.

#### ~~L10. No focus trap in modals~~ DONE (February 2026)

`focus-trap-react` added in `Modal.tsx`. `connectionTest` state in `ReleaseDetailsPage` was confirmed to be in use, not dead.

#### ~~L11. Centralize route identifiers~~ DONE (February 2026)

`src/renderer/routes.ts` (`ROUTES`, `RouteId`, `DEFAULT_ROUTE`) used in `App.tsx`, `MainContent.tsx` and `Sidebar.tsx`.

#### ~~L12. Sidebar reorganization~~ DONE (February 2026)

Section grouping plus `disabledReason` tooltips on `NavItem`.

### Earlier archive (January 2026)

- **Settings page restructure.** Split into 4 tabs (Integrations, Mappings, Filters, Wishlist) with section components in `src/renderer/components/settings/`.
- **Logger utility created.** `src/renderer/utils/logger.ts` mirrors the backend logger. The 2026 audit later found the two copies duplicated and drifted (H9).
- **Missing/duplicate CSS fixed.** `--text-tertiary` and `--bg-primary-rgb` defined. Duplicate `.sync-status-bar` removed.
- **UI primitives, Level 1 & 2.** `Button`, `Badge`, `ProgressBar`, `Skeleton`, `EmptyState` and `Modal` in `src/renderer/components/ui/`.
- **Loading skeletons.** `Skeleton` variants for album cards, stat cards and lists.
- **Collapsible sidebar.** Icons-only mode with localStorage persistence.
- **Better empty states.** `EmptyState` with illustrations and CTAs.
- **`any` type reduction.** 52 → 22 instances. Remaining `useState<any>` cleared in L4.

---

## Product ideas (not tech debt)

These are feature ideas, previously listed here as "Future Enhancements (P3)". They are **not maintenance work**, are not counted in the totals above, and belong in a feature plan (e.g. `.plan/backlog-shark-tank-2026-03-08.md`) if pursued. Status checked against the code on 2026-10-11:

| Idea | Effort | Status |
|------|--------|--------|
| Keyboard shortcuts (`/`, `Esc`, etc.) | Low | **Shipped.** `useKeyboardShortcuts` + `KeyboardShortcutsHelp` (`/`, `S`, `N`, `?`, `Esc`), `0438f53`, 2026-03-08. |
| Quick actions on home | Low | **Shipped.** `QuickActionsGrid` on `HomePage` (Feature 9, `2fe3ceb`, 2026-01-18). |
| Onboarding / first-run guidance | High | **Partial.** `SetupProgress` component (`0438f53`). A full guided wizard is not built. |
| Advanced filtering (genre, rating, saved presets) | Medium | **Partial.** `CollectionFilterControls` covers format, year range and date added. Genre, rating and presets are not built. |
| Export (CSV/JSON for collection, stats, history) | Medium | **Partial.** Some CSV export exists (e.g. Forgotten Favorites). Backup export covers raw data. |
| Command palette (Cmd+K) | Medium | Not started |
| Theme variants / custom accent picker | Low | Not started |
| Playlist / listening queue with batch scrobble | High | Not started. Memory Scrobble saved collections cover part of this. |
