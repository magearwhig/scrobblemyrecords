# Consolidation Compliance Review

## Scope

This review covers the pages being consolidated based on the current sidebar navigation:

**Marketplace Hub Consolidation** (Library/Explore areas):
- `WishlistPage.tsx` -- Library > Wishlist
- `DiscardPilePage.tsx` -- Library > Discard Pile
- `SellersPage.tsx` -- Explore > Local Sellers
- `SellerMatchesPage.tsx` -- (sub-page of Sellers)
- `NewReleasesPage.tsx` -- Explore > New Releases

**"What to Play" Consolidation** (Listening area):
- `SuggestionsPage.tsx` -- Listening > Play Suggestions
- `DiscoveryPage.tsx` -- Explore > Discovery
- `ScrobblePage.tsx` -- (reachable from Collection)

---

## Existing Violations

### Rule: No Inline Styles (dev_prompt.md line 52-53, CLAUDE.md line 10)

**Severity: Medium**

| File | Line | Inline Style | Dynamic? |
|------|------|-------------|----------|
| `SellersPage.tsx` | 477-488 | `style={{ width: \`\${...}%\` }}` | Yes -- progress bar width (acceptable exception) |
| `WishlistPage.tsx` | 603 | `style={{ width: \`\${syncStatus.progress}%\` }}` | Yes -- progress bar width (acceptable exception) |
| `WishlistPage.tsx` | 614 | `style={{ width: '20px', height: '20px' }}` | **NO -- static values, should be a CSS class** |
| `NewReleasesPage.tsx` | 529 | `style={{ width: \`\${syncStatus.progress}%\` }}` | Yes -- progress bar width (acceptable exception) |
| `ScrobblePage.tsx` | 433, 469 | `style={{ width: ... }}` | Yes -- progress bar width (acceptable exception) |
| `SuggestionCard.tsx` | 98 | `style={{ backgroundImage: ... }}` | Yes -- dynamic cover image URL (acceptable exception) |
| `NewReleasesTab.tsx` | 293 | `style={{ width: \`\${overallProgress}%\` }}` | Yes -- progress bar width (acceptable exception) |
| `CollectionPage.tsx` | 1071 | `style={{ marginLeft: '1rem' }}` | **NO -- static value, should be a CSS class** |
| `CollectionPage.tsx` | 1130, 1144 | `style={{ ... }}` | Needs verification |
| `ReleaseDetailsPage.tsx` | 920, 939, 945, 951, 1044, 1068, 1285 | Multiple inline styles | **Multiple static styles -- violation** |

**Consolidation Risk:** Progress bars using inline `width` for dynamic values are the acceptable exception. But `WishlistPage.tsx:614` spinner sizing should be extracted to CSS. During consolidation, the existing `ProgressBar` UI component should be used instead of custom inline progress bars.

### Rule: All Interactive Elements Need aria-label (dev_prompt.md line 110)

**Severity: High**

**ZERO `aria-label` attributes found** in any of the 6 pages being consolidated:
- `SellersPage.tsx` -- 0 aria-labels
- `WishlistPage.tsx` -- 0 aria-labels
- `DiscardPilePage.tsx` -- 0 aria-labels
- `SellerMatchesPage.tsx` -- 0 aria-labels
- `NewReleasesPage.tsx` -- 0 aria-labels
- `SuggestionsPage.tsx` -- 0 aria-labels

Every button, select, input, and checkbox across all these pages lacks `aria-label`. The Sidebar itself only has 1 `aria-label` (on the collapse toggle button). This is a pervasive violation.

**Specific items needing aria-labels:**
- All "Add Seller", "Scan", "Sync", "Refresh" action buttons
- Filter dropdowns (sort by, filter by seller)
- Tab navigation buttons (All, Vinyl, CD Only, Affordable, etc.)
- Search inputs
- Checkbox toggles (Show Sold, Include Monitored)
- Modal close/cancel/save buttons
- Icon-only buttons (sort order toggle in NewReleasesPage)

### Rule: Check If UI Components Already Exist (dev_prompt.md line 59-66)

**Severity: Medium**

Several pages use custom empty states and loading states instead of the existing `EmptyState` and `Skeleton` UI components:

| Page | Custom Implementation | Should Use |
|------|----------------------|------------|
| `SellersPage.tsx:286-294` | Custom loading spinner div | `Skeleton` component |
| `SellersPage.tsx:531-544` | Custom empty state div | `EmptyState` component |
| `WishlistPage.tsx:721-728` | Custom empty state div | `EmptyState` component |
| `DiscardPilePage.tsx:379-385` | Custom loading spinner | `Skeleton` component |
| `DiscardPilePage.tsx:505-514` | Custom empty state | `EmptyState` component |
| `SellerMatchesPage.tsx:270-278` | Custom loading spinner | `Skeleton` component |
| `SellerMatchesPage.tsx:372-389` | Custom empty state | `EmptyState` component |
| `NewReleasesPage.tsx:657-661` | Custom loading spinner | `Skeleton` component |
| `NewReleasesPage.tsx:665-678` | Custom empty state | `EmptyState` component |
| `SuggestionsPage.tsx:284` | **Correctly uses `EmptyState`** | N/A (good) |

**Note:** `SuggestionsPage` is the only page correctly using the `EmptyState` component. Progress bars should also use the existing `ProgressBar` component instead of custom implementations.

### Rule: Components Rendered in Loops Should Use React.memo (dev_prompt.md line 108)

**Severity: Low -- Already Compliant**

All card components rendered in loops are correctly wrapped with `React.memo`:
- `SellerCard` -- `React.memo(SellerCard)`
- `MatchCard` -- `React.memo(MatchCard)`
- `WishlistItemCard` -- `React.memo(WishlistItemCard)`
- `SuggestionCard` -- `React.memo(SuggestionCard)`
- `ReleaseCard` -- `React.memo(ReleaseCard)`

### Rule: Never Use `any` Type (dev_prompt.md line 73)

**Severity: Low -- No violations found** in the 6 pages being consolidated.

### Rule: Use createLogger() Not console.log (dev_prompt.md line 43-48)

**Severity: Low -- Compliant**

Pages that need logging correctly use `createLogger()`:
- `WishlistPage.tsx` -- `createLogger('WishlistPage')`
- `DiscardPilePage.tsx` -- `createLogger('DiscardPilePage')`
- `SellerMatchesPage.tsx` -- `createLogger('SellerMatchesPage')`
- `SuggestionsPage.tsx` -- `createLogger('SuggestionsPage')`
- `DiscoveryPage.tsx` -- `createLogger('DiscoveryPage')`
- `ScrobblePage.tsx` -- `createLogger('ScrobblePage')`
- `SellersPage.tsx` -- Does not import logger but doesn't use console.log either (acceptable)

### Rule: All API Calls Through ApiService Singleton (dev_prompt.md line 39)

**Severity: Low -- Compliant**

All pages use `getApiService(state.serverUrl)` consistently.

### Rule: All Components Functional Using React.FC<Props> (dev_prompt.md line 105)

**Severity: Low -- Compliant**

All pages use the `React.FC` pattern correctly.

### Rule: Duplicate/Redundant Code Across Pages

**Severity: Medium -- Opportunity for Improvement**

Several utility functions are duplicated across pages:

| Function | Found In | Notes |
|----------|----------|-------|
| `formatPrice()` | SellersPage, SellerMatchesPage, WishlistPage, DiscardPilePage | 4 different implementations |
| `formatRelativeTime()` | SellersPage, SellerMatchesPage | Identical implementations |
| `formatDate()` | WishlistPage, DiscardPilePage | Different signatures |
| `formatCurrency()` | DiscardPilePage | Unique but similar to formatPrice |

Consolidation should extract shared utilities.

---

## Consolidation Risk Areas

### 1. Tab Navigation -- Must Use Existing CSS Classes

**Risk Level: High**

The consolidation creates new tab-based navigation within hub pages. Current pages already use tab patterns (WishlistPage has 6 tabs, DiscardPilePage has 5 tabs, NewReleasesPage has 4 tabs). The consolidation MUST:
- Use existing `.tabs` and `.tab` CSS classes from `styles.css`
- NOT create new tab components if the existing pattern works
- NOT introduce inline styles for tab styling

### 2. Sidebar Navigation Changes -- Must Follow UI Navigation Guidelines

**Risk Level: High**

Rule #20 (UI Navigation Guidelines) requires asking three questions before adding/changing nav items:
1. "Which area does this belong to?"
2. "Can this be a tab/section inside an existing area?"
3. "Only add a new top-level area if it represents a genuinely new mental model"

Current sidebar has 5 areas: Dashboard, Library, Listening, Explore, System. The consolidation needs to:
- Decide which area each hub belongs to
- Remove old individual nav items
- Add new consolidated nav items
- Ensure no more than the justified number of top-level items

### 3. State Management Complexity

**Risk Level: Medium**

The individual pages each manage substantial state:
- `WishlistPage` -- 15+ state variables, complex filtering/sorting
- `DiscardPilePage` -- 10+ state variables, 3 modals
- `SellersPage` -- 10+ state variables, scan polling
- `NewReleasesPage` -- 10+ state variables, sync polling, disambiguation
- `SuggestionsPage` -- 10+ state variables, AI integration

Combining these into tab views within a single page risks:
- All state loading on initial mount (even for hidden tabs)
- Memory bloat from holding all page states simultaneously
- Complex re-rendering when switching tabs

**Mitigation:** Each tab should be its own component with its own state, lazily loaded when the tab is first activated.

### 4. Progress Bar Consolidation

**Risk Level: Medium**

Multiple pages implement their own progress bars:
- `SellersPage` -- custom progress bar for scan
- `WishlistPage` -- custom progress bar for sync
- `NewReleasesPage` -- custom progress bar for sync
- `DiscardPilePage` -- uses job polling

The `ProgressBar` UI component exists at `src/renderer/components/ui/ProgressBar.tsx` but is NOT used by any of these pages. The consolidation should migrate all custom progress bars to use this component.

### 5. Mapping System Integration

**Risk Level: Low**

Rule #22: "Check all mappings in codebase to see if they should be used." The marketplace pages interact with:
- Artist mappings (for matching seller inventory to wishlist)
- Track mappings (for scrobble-based sorting)
- Scrobble artist mappings (for play count enrichment)

The consolidation must ensure mapping pipelines are preserved when reorganizing data flow between combined pages.

---

## Pre-Implementation Checklist

- [ ] **Read all 6 page files** being consolidated (SellersPage, SellerMatchesPage, WishlistPage, DiscardPilePage, NewReleasesPage, SuggestionsPage + DiscoveryPage, ScrobblePage)
- [ ] **Read existing UI components** in `src/renderer/components/ui/` to know what is available (Modal, Button, Badge, ProgressBar, Skeleton, EmptyState)
- [ ] **Read `src/renderer/styles.css`** for existing tab, card, form, and layout CSS classes
- [ ] **Review `src/renderer/routes.ts`** for all route constants
- [ ] **Review `src/renderer/App.tsx`** or `MainContent.tsx` for routing logic
- [ ] **Check all existing component imports** across pages to identify shared dependencies
- [ ] **Identify shared hooks** (`useNotifications`, `useCollectionLookup`, etc.) used across pages
- [ ] **Map all API service methods** called by each page to ensure none are lost
- [ ] **Verify existing test files** for each page (`tests/frontend/pages/*.test.tsx`)
- [ ] **Review `.plan/` directory** for related plans that might conflict
- [ ] **Check for localStorage usage** across pages (selectedAlbums, etc.) that must be preserved

---

## During-Implementation Checklist

- [ ] **No new inline styles** except for truly dynamic computed values (width percentages for progress bars, dynamic background images)
- [ ] **Use `EmptyState` component** for all empty/no-data states instead of custom divs
- [ ] **Use `Skeleton` component** for all loading states instead of custom spinner divs
- [ ] **Use `ProgressBar` component** for all progress indicators instead of custom progress bars
- [ ] **Use `Modal` component** for all dialogs (already compliant in existing code)
- [ ] **Use `Badge` component** for status indicators where applicable
- [ ] **Use `Button` component** or existing `.btn` CSS classes (already compliant)
- [ ] **Add `aria-label`** to every interactive element:
  - All buttons (especially icon-only and action buttons)
  - All form inputs (or use associated `<label>` elements)
  - All select dropdowns
  - All tab navigation buttons
  - All checkboxes and toggles
  - Close buttons on modals/panels
- [ ] **Use `createLogger()`** for any new logging -- never `console.log`
- [ ] **All API calls through `getApiService()`** -- no direct fetch/axios
- [ ] **React.memo** on any new card/list-item components rendered in loops
- [ ] **useCallback** for event handlers passed as props
- [ ] **useMemo** for expensive computations (filtered/sorted lists)
- [ ] **No `any` types** -- define proper interfaces in `src/shared/types.ts`
- [ ] **Functional components with `React.FC<Props>`** pattern
- [ ] **Props typed with explicit interfaces** (not inline types)
- [ ] **Add CSS classes to `styles.css`** -- no inline styles for layout/colors/spacing
- [ ] **Lazy-load tab content** -- don't fetch all tab data on mount; only load when tab is activated
- [ ] **Preserve existing URL hash routing** for deep linking
- [ ] **Use existing format/price utilities** or extract to shared file -- don't duplicate
- [ ] **Check mapping services** (artistMappingService, trackMappingService, etc.) are still applied correctly after data flow changes
- [ ] **Use `writeJSONWithBackup()`** for any critical data file operations (backend)
- [ ] **Register any new data files** in `migrationService.ts` with `schemaVersion: 1`
- [ ] **Use milliseconds for timestamps** (Date.now()) -- not seconds

---

## Post-Implementation Checklist

- [ ] **Code compiles** -- `npm run build` succeeds with zero errors
- [ ] **No inline styles** in any new/modified component (grep for `style={`)
- [ ] **All tests pass** -- run `npm test` the same way CI does
- [ ] **Coverage thresholds met** -- 60% statements, 55% branches, 60% functions, 60% lines
- [ ] **No whitespace issues** in `git diff`
- [ ] **No secrets or API keys** in committed code
- [ ] **No temporary debugging code** (console.log, debugger, TODO comments intended as temp)
- [ ] **README.md updated** if any setup/configuration changes
- [ ] **Sidebar navigation correct** -- old nav items removed, new hub items added
- [ ] **Deep links still work** -- hash-based routes preserved for bookmarking/history
- [ ] **All modals still functional** -- add seller, edit discard item, versions, disambiguation, sold, listed
- [ ] **All polling/sync operations preserved** -- seller scan, wishlist sync, release tracking sync, AI suggestion
- [ ] **Notifications still fire** -- match notifications, sync complete, etc.
- [ ] **Accessibility audit** (see Accessibility section below)
- [ ] **Both themes tested** -- dark and light mode render correctly
- [ ] **Text readability verified** -- color and background-color specified together

---

## UI Navigation Rule Application (Rule #20)

### Current Navigation Structure
```
Dashboard
  Home

Library
  Browse Collection
  Wishlist                    --> being consolidated
  Discard Pile                --> being consolidated

Listening
  Play Suggestions            --> being consolidated
  Scrobble History
  Stats Dashboard
  Wrapped

Explore
  Discovery                   --> being consolidated
  New Releases                --> being consolidated
  Local Sellers               --> being consolidated

System
  Settings
```

### Applying the Three Questions

**Marketplace Hub:**
1. "Which area does this belong to?" -- This crosses Library (Wishlist, Discard) and Explore (Sellers, New Releases). It is fundamentally about buying/selling/wanting records.
2. "Can this be a tab/section inside an existing area?" -- Yes. "Marketplace" can be a single entry point with internal tabs.
3. "Is it a new mental model?" -- No, it's a consolidation of existing concepts.

**Recommendation:** Single "Marketplace" (or "Want/Sell") entry in the Library or Explore area, with internal tabs for: Wishlist, Discard Pile, Local Sellers, Seller Matches, New Releases.

**"What to Play" Hub:**
1. "Which area does this belong to?" -- Listening. It's about deciding what to listen to next.
2. "Can this be a tab inside an existing area?" -- It could be tabs within a single "What to Play" page.
3. "Is it a new mental model?" -- No, it consolidates existing "suggestion" concepts.

**Recommendation:** Single "What to Play" entry in the Listening area, with internal tabs for: Suggestions, Discovery, Scrobble.

### Post-Consolidation Navigation Should Be:
```
Dashboard
  Home

Library
  Browse Collection
  Marketplace (NEW)           -- tabs: Wishlist, Discard Pile, Local Sellers, Matches, New Releases

Listening
  What to Play (NEW)          -- tabs: Suggestions, Discovery, Scrobble
  Scrobble History
  Stats Dashboard
  Wrapped

System
  Settings
```

This reduces sidebar items from 10 to 7 (excluding System/Dashboard), improving navigation clarity.

---

## Accessibility Concerns

### Critical: Missing aria-labels

The most urgent accessibility issue is the complete absence of `aria-label` on interactive elements across all pages being consolidated. During the consolidation, every interactive element MUST have an accessible label.

### Tab Navigation Accessibility

The new tab structures need:
- `role="tablist"` on the tab container
- `role="tab"` on each tab button
- `role="tabpanel"` on each tab content area
- `aria-selected="true"` on the active tab
- `aria-controls="panel-id"` linking tabs to panels
- `id` attributes on panels matching `aria-controls`
- Keyboard navigation: Arrow keys to move between tabs, Enter/Space to select
- Tab focus should move to the panel content after selection

### Form Accessibility

- All `<input>` elements need associated `<label>` elements OR `aria-label`
- All `<select>` elements need associated `<label>` or `aria-label`
- All `<textarea>` elements need associated `<label>` or `aria-label`
- Checkbox/toggle labels should be explicitly associated with `htmlFor`
- Form error messages should use `aria-describedby` pointing to the input
- Required fields should use `aria-required="true"`

### Modal Accessibility

Existing Modal component already handles focus trapping and Escape key. Verify:
- Focus moves to modal on open
- Focus returns to trigger element on close
- Screen readers announce modal title

### Button Accessibility

Buttons with only icon content or ambiguous text need `aria-label`:
- Sort order toggle button (`NewReleasesPage`) showing only "up" or "down" arrow
- "+" buttons (Add Seller)
- Action buttons in cards (Edit, Remove, Listed, Sold)
- "View" buttons in versions table

### Progress/Status Announcements

- Scan progress should use `aria-live="polite"` for status updates
- Sync completion should be announced to screen readers
- Loading states should indicate to screen readers that content is loading

---

## Specific Rule Violations to Watch

### Most Likely Rules to Violate During Refactor

1. **Inline styles (Rule #52-53)** -- HIGHEST RISK. When moving/combining JSX from multiple pages, it's tempting to add quick inline styles for spacing/alignment adjustments. Extract ALL styles to CSS classes.

2. **Missing aria-labels (Rule #110)** -- HIGH RISK. Since the existing pages have ZERO aria-labels, there is no existing pattern to follow. The consolidation must establish the pattern from scratch.

3. **Not checking existing UI components (Rule #59-66)** -- HIGH RISK. When building new tab layouts and combined views, check `EmptyState`, `Skeleton`, `ProgressBar`, `Modal`, `Badge`, `Button` FIRST before writing custom UI.

4. **Not checking mappings (Rule #22)** -- MEDIUM RISK. The Marketplace Hub combines pages that use different mapping layers. Ensure artist/track mappings, scrobble artist mappings are still correctly applied when data crosses tab boundaries.

5. **Type safety / `any` usage (Rule #73)** -- MEDIUM RISK. When creating new combined state types or props interfaces for hub pages, avoid using `any`. Define explicit types for all new structures.

6. **CSS in wrong place** -- MEDIUM RISK. Check `styles.css` for existing classes before creating new ones. Don't create component-specific `.css` files unless justified (note: `NewReleasesPage.css` already exists as a precedent).

7. **registerDataFiles in migrationService (Rules #16-17)** -- LOW RISK. Only if new data files are created as part of consolidation (unlikely for a UI refactor, but possible if caching/state persistence is added).

8. **Tests not updated (Rules #13-14)** -- HIGH RISK. Existing tests in `tests/frontend/pages/` reference old page components. These MUST be updated or replaced with tests for the new hub pages. Must pass CI coverage thresholds.

9. **UI Navigation Guidelines (Rule #20)** -- MEDIUM RISK. The consolidation IS a navigation change. Must justify any new top-level items and prefer tabs/sections over new pages.

10. **writeJSONWithBackup for critical data (Rule #18)** -- LOW RISK. Only relevant if backend data file handling changes as part of consolidation.

---

## Summary

### Violation Severity Matrix

| Rule | Current Status | Consolidation Risk | Action Required |
|------|---------------|-------------------|-----------------|
| No inline styles | 2 violations (static) + acceptable dynamic ones | HIGH | Fix existing, prevent new |
| aria-labels | **0 across all pages** | **CRITICAL** | Must add to ALL interactive elements |
| Use existing UI components | 10+ instances of custom empty/loading states | HIGH | Migrate to EmptyState, Skeleton, ProgressBar |
| React.memo | Compliant | LOW | Maintain for new list-item components |
| No `any` type | Compliant | MEDIUM | Maintain for new types |
| createLogger | Compliant | LOW | Maintain pattern |
| ApiService | Compliant | LOW | Maintain pattern |
| React.FC<Props> | Compliant | LOW | Maintain pattern |
| Mapping checks | Unknown | MEDIUM | Verify after consolidation |
| Test coverage | Existing tests need updating | HIGH | Write/update tests for new pages |
| UI Navigation | Current structure valid | MEDIUM | Follow 3-question process |
| Duplicate utilities | 4x formatPrice, 2x formatRelativeTime | LOW | Extract to shared utils |
