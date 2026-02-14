# Feature Consolidation Technical Plan

## Overview

Two consolidation efforts to reduce sidebar clutter and group related features:

1. **"Marketplace" Hub** - Acquiring new records (Wishlist, New Releases, Local Sellers, Seller Matches, Missing Albums)
2. **"What to Play" Page** - Deciding what to spin next (Play Suggestions, Forgotten Favorites, Dusty Corners)

---

## Part 1: Route Changes

### New Routes
```typescript
export const ROUTES = {
  // ... existing unchanged routes ...
  MARKETPLACE: 'marketplace',     // NEW - replaces WISHLIST, RELEASES, SELLERS, SELLER_MATCHES
  WHAT_TO_PLAY: 'what-to-play',   // NEW - replaces SUGGESTIONS
  // ... keep all other routes unchanged ...
} as const;
```

### Routes to Remove
- `WISHLIST: 'wishlist'`
- `RELEASES: 'releases'`
- `SELLERS: 'sellers'`
- `SELLER_MATCHES: 'seller-matches'`
- `SUGGESTIONS: 'suggestions'`

### Routes to Keep As-Is
- `HOME`, `COLLECTION`, `SCROBBLE`, `HISTORY`, `SETTINGS`, `RELEASE_DETAILS`, `DISCOVERY`, `STATS`, `DISCARD_PILE`, `WRAPPED`

### Tab Selection via Hash Params
Following the existing pattern from `SettingsPage` and `HistoryPage`:
- `#marketplace?tab=wishlist` (default tab)
- `#marketplace?tab=new-releases`
- `#marketplace?tab=sellers`
- `#marketplace?tab=matches`
- `#marketplace?tab=missing-albums`
- `#marketplace?tab=matches&seller=someuser` (deep-link to filtered matches)
- `#what-to-play?tab=suggestions` (default tab)
- `#what-to-play?tab=forgotten`
- `#what-to-play?tab=dusty`

### Backward Compatibility Redirects
Add hash redirect handling in `App.tsx` to map old routes to new ones:
```typescript
const ROUTE_REDIRECTS: Record<string, string> = {
  'wishlist': 'marketplace?tab=wishlist',
  'releases': 'marketplace?tab=new-releases',
  'sellers': 'marketplace?tab=sellers',
  'seller-matches': 'marketplace?tab=matches',
  'suggestions': 'what-to-play?tab=suggestions',
};
```
Apply in `handleHashChange` before setting `currentPage`. This ensures any hardcoded `window.location.hash = 'sellers'` calls throughout the codebase still work during transition.

---

## Part 2: Sidebar Changes

### Current Structure
```
Dashboard: Home
Library: Browse Collection, Wishlist, Discard Pile
Listening: Play Suggestions, Scrobble History, Stats Dashboard, Wrapped
Explore: Discovery, New Releases, Local Sellers
System: Settings
```

### New Structure
```
Dashboard: Home
Library: Browse Collection, Discard Pile
Listening: What to Play, Scrobble History, Stats Dashboard, Wrapped
Explore: Marketplace, Discovery
System: Settings
```

### Sidebar Changes Detail
- **Library**: Remove `Wishlist` item
- **Listening**: Replace `Play Suggestions` (ROUTES.SUGGESTIONS) with `What to Play` (ROUTES.WHAT_TO_PLAY)
- **Explore**: Replace `New Releases` and `Local Sellers` with single `Marketplace` (ROUTES.MARKETPLACE). Keep `Discovery` (which loses its "Forgotten Favorites" tab but retains "Missing Albums" and "Missing Artists")
- **Auth requirements**:
  - `Marketplace`: `authStatus.discogs.authenticated` (primary requirement; some tabs also need Last.fm)
  - `What to Play`: `authStatus.discogs.authenticated && authStatus.lastfm.authenticated` (same as current Suggestions)

---

## Part 3: Component Architecture

### 3A. Shared Tab Navigation Pattern

The app already has 4+ different tab implementations (`.tabs/.tab`, `.discovery-tabs/.discovery-tab`, `.history-tabs/.history-tab`, `.settings-tabs`). The new pages will use the existing `.tabs/.tab` pattern from `NewReleasesPage.css` (underline style), which is the cleanest and most widely used. No new shared component needed - just reuse the existing CSS classes directly.

### 3B. MarketplacePage Component

**New file**: `src/renderer/pages/MarketplacePage.tsx`

```
MarketplacePage
+-- Tab bar (5 tabs: Wishlist, New Releases, Sellers, Matches, Missing Albums)
+-- Tab: Wishlist --> renders existing WishlistPage content (with embedded prop)
+-- Tab: New Releases --> renders existing NewReleasesPage content (with embedded prop)
+-- Tab: Sellers --> renders existing SellersPage content (with embedded prop)
+-- Tab: Matches --> renders existing SellerMatchesPage content (with embedded prop)
+-- Tab: Missing Albums --> renders MissingAlbumsContainer (new wrapper)
```

**Implementation approach**: MarketplacePage is a thin wrapper that conditionally renders the existing page components. Each existing page already renders its own content autonomously. The wrapper just adds the tab bar and conditionally mounts the active page.

Key considerations:
- WishlistPage already has internal tabs (`all`, `vinyl`, `cd_only`, `affordable`, `monitoring`, `new_releases`). These become sub-tabs within the Wishlist tab.
- NewReleasesPage has its own internal tabs (`all`, `upcoming`, `recent`, `vinyl`). These become sub-tabs.
- SellerMatchesPage reads `?seller=` from URL. This still works since the full hash is `marketplace?tab=matches&seller=foo`.
- Missing Albums needs extraction from DiscoveryPage. The `MissingAlbumsTab` component already exists as a standalone component in `src/renderer/components/discovery/MissingAlbumsTab.tsx` - it just needs a wrapper that provides the data-fetching logic currently in DiscoveryPage.

**Refactoring steps**:
1. Create `MarketplacePage.tsx` with tab bar and hash param reading
2. Convert each existing page to accept an optional `embedded?: boolean` prop that suppresses the page title/header when rendered as a tab (avoids duplicate headers)
3. For Missing Albums: extract the data-fetching logic from DiscoveryPage into a new `MissingAlbumsContainer.tsx` that wraps `MissingAlbumsTab`

### 3C. WhatToPlayPage Component

**New file**: `src/renderer/pages/WhatToPlayPage.tsx`

```
WhatToPlayPage
+-- Tab bar (3 tabs: Suggestions, Forgotten Favorites, Dusty Corners)
+-- Tab: Suggestions --> renders existing SuggestionsPage content (with embedded prop)
+-- Tab: Forgotten Favorites --> renders ForgottenFavoritesContainer (new wrapper)
+-- Tab: Dusty Corners --> renders DustyCornersContainer (new wrapper)
```

Key considerations:
- ForgottenFavoritesTab already exists as a standalone component but expects many props to be passed from DiscoveryPage's state management. Need a container wrapper with its own data fetching.
- DustyCornersSection is a display-only component. Need a container wrapper that calls `statsApi.getDustyCorners()`.
- SuggestionsPage works standalone, just needs `embedded` prop support.

**Refactoring steps**:
1. Create `WhatToPlayPage.tsx` with tab bar
2. Create `ForgottenFavoritesContainer.tsx` - wrapper with its own API calls and state
3. Create `DustyCornersContainer.tsx` - wrapper that calls `statsApi.getDustyCorners()` and renders the section

### 3D. Components to Reuse Without Changes
- `WishlistItemCard`
- `SuggestionCard`, `AISuggestionCard`, `SuggestionWeightControls`
- `ReleaseCard`
- `SellerCard`
- `MatchCard`
- `MissingAlbumsTab`, `MissingArtistsTab`, `ForgottenFavoritesTab`
- `DustyCornersSection`
- `SyncStatusBar`
- All UI primitives (`Modal`, `Badge`, `EmptyState`, etc.)

### 3E. Components to Modify
- **`DiscoveryPage.tsx`** - Remove "Forgotten Favorites" tab. Keep both Missing Albums and Missing Artists tabs. Discovery retains its cohesive UX for exploring "what you've listened to but don't own." Missing Albums appears in BOTH Discovery and Marketplace (the `MissingAlbumsTab` component is shared).
- **`StatsPage.tsx`** - Keep DustyCornersSection as a preview/teaser with a "See all in What to Play" link. The full standalone version lives in WhatToPlayPage.

---

## Part 4: State Management

### Tab State via URL Hash Params
Follow the established pattern from `SettingsPage`:

```typescript
// Helper function (reusable across both pages)
const getTabFromUrl = (validTabs: string[], defaultTab: string): string => {
  const hash = window.location.hash;
  const queryStart = hash.indexOf('?');
  if (queryStart === -1) return defaultTab;
  const params = new URLSearchParams(hash.substring(queryStart));
  const tab = params.get('tab');
  return tab && validTabs.includes(tab) ? tab : defaultTab;
};
```

### Tab Switching
When a tab is clicked, update `window.location.hash` to include the tab param. This:
- Enables deep-linking to specific tabs
- Preserves browser back/forward navigation
- Follows existing app patterns

### Data Loading Strategy
- **Lazy loading per tab**: Only fetch data when a tab is activated (not all tabs at mount)
- **Cache loaded data**: Once a tab's data is loaded, keep it in state so switching back is instant
- Each tab manages its own loading/error states independently

### Cross-Tab State
- **Marketplace**: SellerMatchesPage needs seller list from SellersPage for the filter dropdown. Since these are now sibling tabs, the shared `api.getSellers()` call can be lifted to the parent MarketplacePage and passed down as a prop.
- **What to Play**: No cross-tab state needed. Each tab is independent.

---

## Part 5: Migration Strategy

### Phase 1: Foundation (No Breaking Changes)
1. Add `MARKETPLACE` and `WHAT_TO_PLAY` to `ROUTES` (keep old routes too)
2. Add backward-compatibility redirects in `App.tsx`
3. Create the `getTabFromUrl` utility function

### Phase 2: Create Container Wrappers
4. Create `MissingAlbumsContainer.tsx` - extracts missing albums data fetching from DiscoveryPage
5. Create `ForgottenFavoritesContainer.tsx` - extracts forgotten favorites data fetching from DiscoveryPage
6. Create `DustyCornersContainer.tsx` - wraps DustyCornersSection with its own data fetching

### Phase 3: Add `embedded` Prop to Existing Pages
7. Add `embedded?: boolean` prop to `WishlistPage`, `NewReleasesPage`, `SellersPage`, `SellerMatchesPage`, `SuggestionsPage`
8. When `embedded={true}`, suppress the page-level `<h1>` and description text (the parent tab page provides the context)

### Phase 4: Build New Pages
9. Create `MarketplacePage.tsx` with tab bar, hash param reading, conditional rendering
10. Create `WhatToPlayPage.tsx` with tab bar, hash param reading, conditional rendering

### Phase 5: Wire Up Routing
11. Add new page imports and cases to `MainContent.tsx`
12. Update `Sidebar.tsx` with new nav structure
13. Update all `window.location.hash` references throughout codebase to use new routes

### Phase 6: Clean Up
14. Remove old route constants from `routes.ts`
15. Remove old cases from `MainContent.tsx` switch
16. Update DiscoveryPage to remove Forgotten Favorites tab
17. Add "View all" link in StatsPage DustyCornersSection pointing to `#what-to-play?tab=dusty`
18. Remove backward-compatibility redirects once all references are updated

### Implementation Order
Steps 1-3 can be done first as a safe, non-breaking foundation.
Steps 4-6 are independent of each other and can be parallelized.
Steps 7-8 are independent across pages and can be parallelized.
Steps 9-10 depend on 4-8 being complete.
Steps 11-12 wire everything together.
Steps 13-18 are cleanup.

---

## Part 6: CSS Strategy

### Reuse Existing Tab Styles
The `.tabs` / `.tab` pattern from `NewReleasesPage.css` is the best candidate:
- Clean underline style with `border-bottom` and `::after` pseudo-element
- Already supports `.tab.active::after` indicator
- Supports `.tab-badge` for count badges
- Used by WishlistPage and DiscardPilePage already

### New CSS Classes Needed

```css
/* MarketplacePage */
.marketplace-page { }
.marketplace-page .page-header { }
.marketplace-page .page-description { }
.marketplace-page .tabs { }  /* reuse existing */

/* WhatToPlayPage */
.what-to-play-page { }
.what-to-play-page .page-header { }
.what-to-play-page .page-description { }
.what-to-play-page .tabs { }  /* reuse existing */

/* Container wrappers - minimal styling needed */
.missing-albums-container { }
.forgotten-favorites-container { }
.dusty-corners-container { }
```

### CSS File Organization
- Add new styles to `src/renderer/styles.css` (the main stylesheet)
- No new CSS files needed
- Existing page-specific CSS files (like `NewReleasesPage.css`) remain unchanged since those pages still render their own content

### Existing CSS to Preserve
- All `.wishlist-*`, `.new-releases-*`, `.sellers-*`, `.seller-matches-*`, `.suggestions-*`, `.discovery-*`, `.dusty-corners-*` classes remain unchanged
- The embedded pages render exactly the same markup, just without their `<h1>` wrappers

---

## Part 7: Test Strategy

### No Existing Frontend Tests
The `src/renderer` directory has no `.test.tsx` files currently. No test updates needed.

### Manual Testing Checklist
1. **Route navigation**: Click each sidebar item, verify correct page loads
2. **Tab switching**: Each tab in Marketplace and What to Play renders correctly
3. **Deep linking**: Navigate directly to `#marketplace?tab=sellers`, verify correct tab active
4. **Back/forward**: Browser back/forward navigates between tabs correctly
5. **Backward compat**: Old URLs (`#wishlist`, `#sellers`, `#suggestions`) redirect correctly
6. **Cross-page links**: All `window.location.hash = 'sellers'` references still work via redirects
7. **SellerCard deep link**: Clicking "View Matches" on a seller card navigates to `#marketplace?tab=matches&seller=username`
8. **Auth gating**: Marketplace disabled when Discogs not connected; What to Play disabled when either service not connected
9. **State preservation**: Switch between tabs, verify data doesn't reload unnecessarily
10. **Responsive**: Test sidebar collapse behavior with new labels
11. **Sub-tabs**: WishlistPage internal tabs and NewReleasesPage internal tabs still work correctly within their parent tabs

---

## Part 8: Risk Assessment

### Low Risk
- **Tab CSS conflicts**: Using the established `.tabs/.tab` pattern minimizes risk. Each page still renders inside its own container with scoped class names.
- **No backend changes**: All API endpoints remain unchanged. This is purely a frontend reorganization.

### Medium Risk
- **Hardcoded hash references**: Multiple files reference old routes like `window.location.hash = 'sellers'` or `window.location.hash = 'wishlist'`. The redirect map handles these gracefully, but all should be updated in the cleanup phase.
  - Files with old route references to update:
    - `SellersPage.tsx` (links to `seller-matches`, `wishlist`)
    - `SellerCard.tsx` (links to `seller-matches?seller=...`)
    - `SellerMatchesPage.tsx` (links to `sellers`)
    - `SuggestionsPage.tsx` (links to `stats`)
- **MissingAlbumsTab data extraction**: The MissingAlbumsTab component receives many props from DiscoveryPage's state management. The new MissingAlbumsContainer must replicate this data fetching. Risk of missing a prop or behavior.

### Higher Risk
- **DiscoveryPage changes**: Removing Forgotten Favorites from Discovery changes user muscle memory. Mitigation: Keep Discovery in the sidebar, clearly focused on "Missing Albums" and "Missing Artists."
- **StatsPage DustyCornersSection duplication**: Dusty Corners appears both in StatsPage (as a summary) and WhatToPlayPage (as a full tab). Must ensure both are clearly differentiated - StatsPage shows top 8 with a "See all" link; WhatToPlayPage shows the full list with additional controls.
- **SellerMatchesPage URL params**: Currently uses `#seller-matches?seller=foo`. After consolidation: `#marketplace?tab=matches&seller=foo`. The redirect system must preserve query params during redirect.

### Backward Compatibility Plan
1. Old routes remain functional via redirect map for at least one release cycle
2. No data migration needed (all state is fetched from API, not stored locally by route)
3. Only `localStorage` key to check: `selectedRelease` (used by ReleaseDetailsPage, unaffected)

---

## File Change Summary

### New Files (5)
1. `src/renderer/pages/MarketplacePage.tsx`
2. `src/renderer/pages/WhatToPlayPage.tsx`
3. `src/renderer/components/marketplace/MissingAlbumsContainer.tsx`
4. `src/renderer/components/whattoplay/ForgottenFavoritesContainer.tsx`
5. `src/renderer/components/whattoplay/DustyCornersContainer.tsx`

### Modified Files (8+)
1. `src/renderer/routes.ts` - Add new routes, remove old ones
2. `src/renderer/components/Sidebar.tsx` - New nav structure
3. `src/renderer/components/MainContent.tsx` - New page cases, remove old ones
4. `src/renderer/App.tsx` - Add redirect map in hash handler
5. `src/renderer/pages/DiscoveryPage.tsx` - Remove Forgotten Favorites tab
6. `src/renderer/pages/StatsPage.tsx` - Add "See all" link to DustyCornersSection
7. `src/renderer/styles.css` - Add new page container styles
8. Various pages with `embedded` prop support (WishlistPage, NewReleasesPage, SellersPage, SellerMatchesPage, SuggestionsPage)

### Files to Eventually Delete (0)
No files deleted - the old page files become the tab content rendered by the new container pages. They continue to exist and can be independently navigated to during the transition period.
