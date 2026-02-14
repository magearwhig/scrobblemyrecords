# Consolidation Test Strategy

## Overview

This document outlines the testing strategy for two feature consolidations:
1. **Marketplace Hub**: Wishlist + New Releases + Local Sellers + Seller Matches + Missing Albums -> single tabbed page
2. **What to Play**: Play Suggestions + Forgotten Favorites + Dusty Corners -> single tabbed page

Current enforced coverage thresholds (from `jest.config.js`):
- Statements: 63%, Branches: 50%, Functions: 57%, Lines: 63%
- Aspirational target: 90%

---

## 1. Existing Test Inventory

### Frontend Page Tests (Directly Affected)

| Test File | Test Count | Feature Area | Impact |
|-----------|-----------|--------------|--------|
| `tests/frontend/pages/WishlistPage.test.tsx` | 18 tests | Wishlist tab filtering, sync, sorting, vinyl status | HIGH - Route rename, component restructure |
| `tests/frontend/pages/DiscoveryPage.test.tsx` | ~40 tests | Missing albums/artists, monitoring, Forgotten Favorites | HIGH - Split across two consolidated pages |
| `tests/frontend/pages/StatsPage.test.tsx` | Multiple | Stats including Dusty Corners section | MEDIUM - Dusty Corners moves to "What to Play" |
| `tests/frontend/pages/ScrobblePage.test.tsx` | Multiple | Play suggestions | HIGH - Merges into "What to Play" |

### Frontend Component Tests (Directly Affected)

| Test File | Test Count | Component | Impact |
|-----------|-----------|-----------|--------|
| `tests/frontend/components/SuggestionCard.test.tsx` | 17 tests | Play suggestion card | MEDIUM - Reused in "What to Play" tab |
| `tests/frontend/components/SuggestionWeightControls.test.tsx` | 12 tests | Weight sliders for suggestions | MEDIUM - Reused in "What to Play" tab |
| `tests/frontend/components/AISuggestionCard.test.tsx` | 23 tests | AI suggestion display | MEDIUM - Reused in "What to Play" tab |
| `tests/frontend/components/WishlistItemCard.test.tsx` | 15 tests | Wishlist item display | MEDIUM - Reused in Marketplace Hub tab |
| `tests/frontend/components/SyncStatusBar.test.tsx` | 25 tests | Sync status bar | LOW - Shared component, used in Discovery and potentially Marketplace Hub |

### Navigation and Routing Tests (Affected)

| Test File | Test Count | Impact |
|-----------|-----------|--------|
| `tests/frontend/components/Sidebar.test.tsx` | 18 tests | HIGH - Nav items rename (Discovery -> Marketplace Hub, Play Suggestions -> What to Play) |
| `tests/frontend/components/MainContent.test.tsx` | 12 tests | HIGH - Route mapping changes for new pages |
| `tests/frontend/pages/HomePage.test.tsx` | Multiple | MEDIUM - Quick action links may reference renamed pages |

### Backend Tests (Potentially Affected)

| Test File | Test Count | Impact |
|-----------|-----------|--------|
| `tests/backend/routes.test.ts` | Multiple | LOW - Backend APIs don't change, only frontend routing |
| `tests/backend/lastfmService.test.ts` | Multiple | LOW - Service layer unchanged |

### E2E Tests

| Test File | Test Count | Impact |
|-----------|-----------|--------|
| `tests/e2e/smoke.spec.ts` | 7 tests | MEDIUM - Sidebar nav labels change, page navigation test needs updating |

---

## 2. Tests That Need Updating

### 2.1 Route and Navigation Changes

**Sidebar.test.tsx** - Must update for renamed/removed nav items:
- Current: `'Play Suggestions'`, `'Discovery'`, `'New Releases'`, `'Local Sellers'`, `'Wishlist'`
- After: `'What to Play'`, `'Marketplace Hub'` (Wishlist, New Releases, Local Sellers, Seller Matches, Missing Albums all become tabs)
- Update: Category group assertions (the "Explore" and "Listening" groups will have different items)
- Update: Icon assertions (emoji changes for new consolidated items)
- Update: Auth-based enablement tests (combined auth requirements for consolidated pages)

**MainContent.test.tsx** - Must update route mappings:
- Remove individual route tests for: `'suggestions'`, `'discovery'`, `'new-releases'`, `'sellers'`, `'seller-matches'`, `'wishlist'`
- Add route tests for: `'marketplace-hub'`, `'what-to-play'`
- Add mock for new page components: `MarketplaceHubPage`, `WhatToPlayPage`

**smoke.spec.ts** (E2E) - Must update sidebar navigation assertions:
- Line 33-37: Update nav label assertions (e.g., `'Wishlist'` may move under Marketplace Hub)
- Navigation test: Update URL hash assertions

### 2.2 Page-Level Test Restructuring

**WishlistPage.test.tsx -> Becomes MarketplaceHub "Wishlist" tab tests:**
- Import path changes: `WishlistPage` -> `MarketplaceHubPage` (or tab component)
- Render wrapper may need tab selection step before testing wishlist-specific behavior
- Tab header assertions need updating (currently tests for `'All'`, `'Has Vinyl'`, `'CD Only'`, `'Affordable'`, `'Monitoring'`)
- All 18 tests need the parent page rendered first, then Wishlist tab selected

**DiscoveryPage.test.tsx -> Split between Marketplace Hub and What to Play:**
- **Missing Albums/Artists tests (lines 163-927)**: Move to Marketplace Hub "Missing Albums" tab tests
  - ~30 tests covering: missing albums listing, artist tab, monitoring, sorting, hiding, mapping, wishlist badges, filter toggle
  - Need tab-selection preamble before each test group
- **Forgotten Favorites tests (lines 930-1320)**: Move to What to Play "Forgotten Favorites" tab tests
  - ~10 tests covering: forgotten tracks display, dormant period filter, copy/export, loading/error states
  - Need tab-selection preamble

**StatsPage.test.tsx -> Dusty Corners section moves to What to Play:**
- Tests for `getDustyCorners` mock and Dusty Corners UI assertions need to move
- Stats page may still call `getDustyCorners` for overview, or the API may be dropped from stats entirely
- If Dusty Corners section is removed from StatsPage, the mock setup simplifies

### 2.3 Component Tests (Minimal Changes)

These component tests are largely self-contained and should work with minimal changes:

- **SuggestionCard.test.tsx**: No import path changes needed if component stays in same location. Navigation hash tests (line 234: `'#collection?highlight=123'`) remain valid.
- **SuggestionWeightControls.test.tsx**: No changes needed - pure component test.
- **AISuggestionCard.test.tsx**: No changes needed - pure component test.
- **WishlistItemCard.test.tsx**: No changes needed - pure component test.
- **SyncStatusBar.test.tsx**: No changes needed - independent component.

---

## 3. New Tests Needed

### 3.1 Marketplace Hub Page Tests

**File**: `tests/frontend/pages/MarketplaceHubPage.test.tsx`

```
describe('MarketplaceHubPage', () => {
  describe('Tab Navigation', () => {
    - renders all tabs: Wishlist, New Releases, Local Sellers, Seller Matches, Missing Albums
    - defaults to first tab (Wishlist or most relevant)
    - switches between tabs correctly
    - preserves tab state when switching back
    - shows correct tab counts/badges
    - handles auth requirements per tab
  })

  describe('Wishlist Tab', () => {
    // Migrate all 18 tests from WishlistPage.test.tsx
    // Add tab selection step in beforeEach
  })

  describe('New Releases Tab', () => {
    - renders new releases list
    - filters by format
    - shows release details
    - handles empty state
    - handles loading state
    - handles error state
  })

  describe('Local Sellers Tab', () => {
    - renders seller list
    - filters by location/distance
    - shows seller inventory
    - handles empty state
    - handles error state
  })

  describe('Seller Matches Tab', () => {
    - renders matched items between sellers and wishlist
    - shows match quality indicators
    - handles empty state
    - handles error state
  })

  describe('Missing Albums Tab', () => {
    // Migrate ~30 tests from DiscoveryPage.test.tsx (Missing Albums/Artists sections)
    // Add tab selection step in beforeEach
  })

  describe('Cross-Tab Interactions', () => {
    - adding to monitoring from Missing Albums updates Wishlist tab count
    - hiding an album from Missing Albums doesn't appear in Wishlist
    - seller match links correctly navigate to seller tab with filter
  })
})
```

### 3.2 What to Play Page Tests

**File**: `tests/frontend/pages/WhatToPlayPage.test.tsx`

```
describe('WhatToPlayPage', () => {
  describe('Tab Navigation', () => {
    - renders all tabs: Play Suggestions, Forgotten Favorites, Dusty Corners
    - defaults to Play Suggestions tab
    - switches between tabs correctly
    - preserves tab state when switching back
    - shows correct tab badges/counts
    - requires both Discogs + Last.fm auth
  })

  describe('Play Suggestions Tab', () => {
    // Migrate tests from ScrobblePage suggestions section
    - renders suggestion cards
    - handles refresh/dismiss
    - shows weight controls
    - handles AI suggestions
    - handles empty collection
    - handles loading/error states
  })

  describe('Forgotten Favorites Tab', () => {
    // Migrate ~10 tests from DiscoveryPage "Forgotten Favorites" section
    // Add tab selection step
  })

  describe('Dusty Corners Tab', () => {
    // Migrate from StatsPage Dusty Corners section
    - renders dusty corners list (albums not played in a long time)
    - sorts by last played date
    - filters by time period
    - handles empty state
    - handles loading/error states
  })

  describe('Cross-Tab Interactions', () => {
    - suggestion from Play Suggestions can be found in Dusty Corners if unplayed
    - forgotten favorite can be dismissed across tabs
    - sync status bar is shared across tabs
  })
})
```

### 3.3 Updated Navigation Tests

**Updates to**: `tests/frontend/components/Sidebar.test.tsx`

```
// New assertions needed:
- 'What to Play' nav item exists (replaces 'Play Suggestions')
- 'Marketplace Hub' nav item exists (replaces 'Wishlist', 'Discovery', 'New Releases', 'Local Sellers')
- Old nav items no longer render: 'Play Suggestions', 'Discovery', 'New Releases', 'Local Sellers', 'Wishlist'
- Auth requirements: Marketplace Hub requires Discogs, What to Play requires both
- Active state works for new page names
```

**Updates to**: `tests/frontend/components/MainContent.test.tsx`

```
// New route assertions:
- renders MarketplaceHubPage when currentPage is 'marketplace-hub'
- renders WhatToPlayPage when currentPage is 'what-to-play'
- removed routes ('discovery', 'sellers', 'new-releases', 'seller-matches', 'wishlist', 'suggestions') fall through to default
```

### 3.4 Tab Component Tests (if extracting shared tab component)

If a shared `TabbedPage` or `TabContainer` component is created:

**File**: `tests/frontend/components/ui/TabContainer.test.tsx`

```
describe('TabContainer', () => {
  - renders all provided tabs
  - shows active tab content
  - calls onChange when tab clicked
  - supports disabled tabs
  - supports tab badges/counts
  - handles keyboard navigation (a11y)
  - renders correct ARIA attributes
})
```

---

## 4. Coverage Impact Analysis

### Current Coverage Snapshot

Based on `jest.config.js` thresholds:
- Statements: 63% (enforced), Branches: 50%, Functions: 57%, Lines: 63%

### Expected Impact During Consolidation

| Phase | Coverage Risk | Reason |
|-------|--------------|--------|
| Remove old pages | DROP (5-8%) | Deleting `WishlistPage`, `DiscoveryPage`, etc. removes source code but their tests still reference them |
| Create new pages before tests | DROP (3-5%) | New page code has 0% coverage until tests are written |
| Migrate tests to new pages | RECOVERY | Tests re-cover the logic, but mock setup changes may cause failures |
| Write new tab navigation tests | INCREASE (2-3%) | New tab container logic gets covered |
| Write cross-tab integration tests | INCREASE (1-2%) | Interaction flows covered |

### Risk Mitigation

1. **Never delete tests and source simultaneously** - migrate tests first
2. **Use a coverage gate in PR**: ensure coverage doesn't drop below current thresholds
3. **Track per-file coverage** for new consolidated pages: target 80%+ for `MarketplaceHubPage.tsx` and `WhatToPlayPage.tsx`

### Files That Will Lose Coverage

| File | Current Coverage Source | Mitigation |
|------|----------------------|------------|
| `src/renderer/pages/WishlistPage.tsx` (deleted) | `WishlistPage.test.tsx` | Tests migrate to MarketplaceHub tests |
| `src/renderer/pages/DiscoveryPage.tsx` (deleted) | `DiscoveryPage.test.tsx` | Tests split between both new pages |
| `src/renderer/pages/SellersPage.tsx` (deleted) | N/A (no test file found) | New Marketplace Hub tab tests cover this |
| `src/renderer/pages/SellerMatchesPage.tsx` (deleted) | N/A (no test file found) | New Marketplace Hub tab tests cover this |
| `src/renderer/pages/NewReleasesPage.tsx` (deleted) | N/A (no test file found) | New Marketplace Hub tab tests cover this |
| `src/renderer/pages/SuggestionsPage.tsx` (deleted) | Via ScrobblePage tests | Tests migrate to WhatToPlay tests |

### Files Gaining New Coverage

| New File | Expected Tests |
|----------|---------------|
| `src/renderer/pages/MarketplaceHubPage.tsx` | 60+ tests (migrated + new) |
| `src/renderer/pages/WhatToPlayPage.tsx` | 40+ tests (migrated + new) |
| Shared tab component (if created) | 8-10 tests |

---

## 5. Integration Test Flows

### 5.1 Marketplace Hub Integration Flows

1. **Wishlist-to-Missing Albums Flow**:
   - User has album in wishlist -> Missing Albums tab should show "In Wishlist" badge
   - User adds album from Missing Albums to monitoring -> Wishlist tab shows updated Monitoring count

2. **Seller Matches Cross-Reference**:
   - User has items in wishlist -> Seller Matches shows matching inventory
   - User clicks match -> navigates to seller details

3. **New Releases to Wishlist**:
   - User sees new release -> adds to wishlist -> Wishlist tab updates count

4. **Sync Coordination**:
   - Wishlist sync completes -> Missing Albums recalculates
   - Seller inventory update -> Seller Matches refreshes

### 5.2 What to Play Integration Flows

1. **Suggestion-to-Dusty Corners Overlap**:
   - Album appears in both Dusty Corners and Play Suggestions
   - Playing/scrobbling from one tab updates state in other

2. **Forgotten Favorites Discovery**:
   - Forgotten track -> user clicks "Listen" -> scrobble flow starts

3. **Weight Controls Global Effect**:
   - Adjusting suggestion weights in Play Suggestions tab may affect ordering in other tabs

4. **Sync Dependency**:
   - History sync status bar is shared across all tabs
   - Empty state messaging when no history is synced

### 5.3 Cross-Page Integration

1. **Home Page Quick Actions**:
   - Quick action cards should navigate to correct tabs within consolidated pages
   - "View Suggestions" -> What to Play (Play Suggestions tab)
   - "Check Wishlist" -> Marketplace Hub (Wishlist tab)

2. **Deep Linking**:
   - Hash routes like `#marketplace-hub?tab=wishlist` should open correct tab
   - Existing bookmarks/links to old routes should redirect

---

## 6. Regression Risks

### HIGH Risk

| Risk | Description | Mitigation |
|------|------------|------------|
| **Route Breaking** | Old hash routes (`#discovery`, `#wishlist`, `#suggestions`, `#new-releases`, `#sellers`) stop working | Add redirect mapping for old routes; test all old routes redirect to new pages |
| **Context Loss** | Each old page had its own state management; consolidation may lose state on tab switch | Test that tab switching preserves state (loaded data, scroll position, filters) |
| **Mock Mismatch** | Tests mock different API methods per page; consolidated page needs all mocks | Create shared mock factory for consolidated page tests |
| **Auth Gate Changes** | Different pages had different auth requirements; consolidated page needs unified check | Test auth matrix: Discogs-only, Last.fm-only, both, neither |

### MEDIUM Risk

| Risk | Description | Mitigation |
|------|------------|------------|
| **Performance Regression** | Loading all tab data upfront vs lazy loading | Test that inactive tabs don't make API calls until selected |
| **CSS Conflicts** | Different page styles may conflict when combined | Visual regression testing; check class name collisions |
| **Event Handler Conflicts** | Multiple features sharing the same page may have conflicting keyboard shortcuts or scroll handlers | Test keyboard navigation within each tab |
| **Sidebar Active State** | Active highlighting needs to work for new page names | Test active class on Sidebar for new routes |

### LOW Risk

| Risk | Description | Mitigation |
|------|------------|------------|
| **Component Reuse** | `SuggestionCard`, `WishlistItemCard` etc. are standalone and should work anywhere | Existing component tests provide safety net |
| **API Compatibility** | Backend APIs unchanged | Backend tests remain as-is |
| **Type Safety** | TypeScript types for shared data structures | Typecheck pass in CI catches regressions |

---

## 7. Testing Order

### Phase 1: Foundation (Before Any Page Changes)
1. Run full test suite, record baseline coverage: `npm run test:coverage`
2. Note any currently failing tests
3. Create shared test utilities:
   - `tests/utils/renderWithTabSelection.tsx` - helper to render consolidated page with specific tab selected
   - `tests/utils/marketplaceHubMocks.ts` - combined API mocks for all Marketplace Hub tabs
   - `tests/utils/whatToPlayMocks.ts` - combined API mocks for all What to Play tabs

### Phase 2: Navigation Tests First
4. Update `Sidebar.test.tsx` with new nav items (tests will fail until implementation)
5. Update `MainContent.test.tsx` with new route mappings
6. Update `smoke.spec.ts` E2E sidebar assertions

### Phase 3: Marketplace Hub Tests
7. Create `MarketplaceHubPage.test.tsx` with tab navigation tests
8. Migrate Wishlist tests from `WishlistPage.test.tsx` (adapt for tab context)
9. Migrate Missing Albums/Artists tests from `DiscoveryPage.test.tsx`
10. Write new tests for New Releases, Local Sellers, Seller Matches tabs
11. Write cross-tab interaction tests
12. Delete `WishlistPage.test.tsx` once all tests pass in new location

### Phase 4: What to Play Tests
13. Create `WhatToPlayPage.test.tsx` with tab navigation tests
14. Migrate Suggestion tests from relevant source
15. Migrate Forgotten Favorites tests from `DiscoveryPage.test.tsx`
16. Migrate Dusty Corners tests from `StatsPage.test.tsx`
17. Write cross-tab interaction tests
18. Delete migrated test sections from old files

### Phase 5: Cleanup and Validation
19. Delete old page test files (only after confirming all tests pass in new locations)
20. Update `DiscoveryPage.test.tsx` - delete entirely once all tests migrated
21. Run full coverage report: `npm run test:coverage`
22. Verify coverage >= baseline from Phase 1
23. Run E2E tests: `npm run test:e2e`
24. Run linter: `npm run lint`
25. Run typecheck: `npm run typecheck`

### Phase 6: Route Redirect Tests
26. Add tests for old route -> new route redirects
27. Test deep links with tab parameters (`#marketplace-hub?tab=missing-albums`)
28. Test browser back/forward with tab navigation

---

## 8. CI Pipeline Impact

### Current CI Pipeline (`.github/workflows/ci.yml`)

```
test -> build -> e2e -> security
```

Three-node matrix: Node 18.x, 20.x, 22.x

### Expected Impact

| CI Step | Impact | Action Required |
|---------|--------|----------------|
| `npm run lint` | LOW | New files auto-linted; no config changes needed |
| `npm run typecheck` | LOW | TypeScript catches type errors in new pages |
| `npm run test:coverage` | HIGH | Coverage may temporarily drop during migration; **DO NOT lower thresholds** |
| `npm run test:e2e` | MEDIUM | Smoke tests need updated nav assertions |
| `npm audit` | NONE | No new dependencies expected |

### Recommended CI Additions

1. **Temporary Coverage Floor**: If coverage drops during migration, consider adding a per-PR comment with coverage diff rather than failing the build. But DO NOT lower `coverageThreshold` in `jest.config.js`.

2. **E2E Tab Navigation Tests**: Add to `tests/e2e/smoke.spec.ts`:
   ```
   test('marketplace hub page loads with tabs', async ({ page }) => {
     await page.goto('/#marketplace-hub');
     // Verify tab headers are visible
   });

   test('what to play page loads with tabs', async ({ page }) => {
     await page.goto('/#what-to-play');
     // Verify tab headers are visible
   });
   ```

3. **Route Redirect E2E Tests**: Ensure old URLs still work:
   ```
   test('old routes redirect to consolidated pages', async ({ page }) => {
     await page.goto('/#wishlist');
     await expect(page).toHaveURL(/#marketplace-hub/);

     await page.goto('/#discovery');
     await expect(page).toHaveURL(/#marketplace-hub/);

     await page.goto('/#suggestions');
     await expect(page).toHaveURL(/#what-to-play/);
   });
   ```

### PR Checklist for Each Consolidation PR

- [ ] All migrated tests pass (`npm test`)
- [ ] Coverage >= baseline (`npm run test:coverage`)
- [ ] No new lint errors (`npm run lint`)
- [ ] TypeScript compiles (`npm run typecheck`)
- [ ] E2E smoke tests pass (`npm run test:e2e`)
- [ ] Old routes redirect correctly
- [ ] Tab navigation works with keyboard
- [ ] No inline styles added (per CLAUDE.md)
- [ ] Text readability verified (color + background-color specified)

---

## Summary

### Test Counts

| Category | Existing Tests | Tests to Migrate | New Tests Needed | Total After |
|----------|---------------|-----------------|-----------------|-------------|
| Marketplace Hub Page | 0 | ~48 (18 wishlist + 30 discovery) | ~25 (tabs, new tabs, cross-tab) | ~73 |
| What to Play Page | 0 | ~20 (suggestions + forgotten + dusty) | ~15 (tabs, cross-tab) | ~35 |
| Sidebar | 18 | 0 (update in place) | ~4 (new nav items) | ~22 |
| MainContent | 12 | 0 (update in place) | ~3 (new routes) | ~15 |
| E2E Smoke | 7 | 0 (update in place) | ~4 (new pages + redirects) | ~11 |
| **Total** | **37 affected** | **~68** | **~51** | **~156** |

### Key Principles

1. **Migrate before delete**: Always have tests passing in new location before removing old ones
2. **Tab-first testing**: Every consolidated page test should begin with tab selection
3. **Mock consolidation**: Create shared mock factories to avoid massive mock setup in each test
4. **Coverage preservation**: Never allow coverage to drop below current enforced thresholds
5. **Follow TEST_STYLE_GUIDE.md**: AAA pattern, `userEvent` over `fireEvent`, explicit assertions over snapshots
