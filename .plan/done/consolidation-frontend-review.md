# Frontend Component Architecture Review: Feature Consolidation

## 1. Component Hierarchy

### Marketplace Hub (`MarketplaceHubPage.tsx`)

```
MarketplaceHubPage
  |-- page header (title + global actions like sync buttons)
  |-- TabBar (reusable)
  |   |-- Tab: "Wishlist"
  |   |-- Tab: "New Releases" (with badge count)
  |   |-- Tab: "Local Sellers"
  |   |-- Tab: "Seller Matches"
  |   |-- Tab: "Missing Albums"
  |-- TabPanel (conditionally rendered based on active tab)
      |-- WishlistTab (extracted from WishlistPage.tsx)
      |-- NewReleasesTab (ALREADY EXISTS at components/wishlist/NewReleasesTab.tsx)
      |-- LocalSellersTab (extracted from SellersPage.tsx)
      |-- SellerMatchesTab (extracted from SellerMatchesPage.tsx)
      |-- MissingAlbumsTab (ALREADY EXISTS at components/discovery/MissingAlbumsTab.tsx)
```

### What to Play (`WhatToPlayPage.tsx`)

```
WhatToPlayPage
  |-- page header (title + refresh/weight buttons)
  |-- SyncStatusBar (already exists as shared component)
  |-- TabBar (reusable)
  |   |-- Tab: "Suggestions"
  |   |-- Tab: "Forgotten Favorites"
  |   |-- Tab: "Dusty Corners"
  |-- TabPanel (conditionally rendered)
      |-- SuggestionsTab (extracted from SuggestionsPage.tsx)
      |-- ForgottenFavoritesTab (ALREADY EXISTS at components/discovery/ForgottenFavoritesTab.tsx)
      |-- DustyCornersTab (evolved from components/stats/DustyCornersSection.tsx)
```

---

## 2. Tab Component: Recommendation

### Current State
The codebase has **three different tab implementations**, all ad-hoc:

1. **WishlistPage** (lines 633-664): Maps over `TabType` array, renders `<button>` with `.tab` / `.active` classes
2. **DiscoveryPage** (lines 404-427): Same pattern but uses `.discovery-tab` / `.active` classes
3. **NewReleasesPage** (lines 573-599): Uses `.tab` / `.active` classes (same as WishlistPage)

### Recommendation: Create a Reusable `TabBar` + `TabPanel`

Since this pattern repeats 3+ times and will appear in 2 more consolidated pages, extract a shared component:

```tsx
// src/renderer/components/ui/TabBar.tsx

interface Tab {
  id: string;
  label: string;
  count?: number;         // Optional count badge
  badge?: React.ReactNode; // Optional custom badge (e.g., "New" indicator)
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  variant?: 'default' | 'discovery'; // To maintain backward compat with CSS
  className?: string;
}

export const TabBar: React.FC<TabBarProps> = ({ tabs, activeTab, onTabChange, variant = 'default', className }) => {
  const tabClass = variant === 'discovery' ? 'discovery-tab' : 'tab';
  return (
    <div className={`tabs ${className || ''}`}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={`${tabClass} ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
          {tab.count !== undefined && ` (${tab.count})`}
          {tab.badge}
        </button>
      ))}
    </div>
  );
};
```

**Why a full-blown `TabPanel` render wrapper is overkill**: The existing pattern of conditional rendering (`{activeTab === 'x' && <Component />}`) is simple, avoids unnecessary abstraction, and lets each tab manage its own mounting lifecycle naturally. No need for a `TabPanel` wrapper -- just use the `TabBar` component and keep conditional rendering in the parent.

---

## 3. Extracting Tab Content Components

### Components That Can Be Extracted As-Is

| Current Source | Target Tab Component | Extraction Difficulty | Notes |
|---|---|---|---|
| `components/wishlist/NewReleasesTab.tsx` | **Ready** (already a tab) | None | Already extracted, lives under `components/wishlist/`. Just re-export or move. |
| `components/discovery/MissingAlbumsTab.tsx` | **Ready** (already a tab) | None | Already extracted. Receives all data via props. |
| `components/discovery/ForgottenFavoritesTab.tsx` | **Ready** (already a tab) | None | Already extracted. Receives all data/callbacks via props. |
| `components/stats/DustyCornersSection.tsx` | **Needs minor evolution** | Low | Small component (170 lines). Just needs its own data-fetching or to accept richer props (currently gets `albums[]` and `loading` from StatsPage). |

### Components That Need Extraction Work

| Current Source | Target Tab Component | Extraction Difficulty | Details |
|---|---|---|---|
| `WishlistPage.tsx` (900 lines) | `WishlistTab` | **Medium-High** | See section below |
| `SellersPage.tsx` (630 lines) | `LocalSellersTab` | **Medium** | Self-contained state, but has wishlist dependency check that should stay in parent |
| `SellerMatchesPage.tsx` (418 lines) | `SellerMatchesTab` | **Medium** | Self-contained, but has hash-based query parsing for seller filter |
| `NewReleasesPage.tsx` (793 lines) | `NewReleasesPageTab` | **Medium-High** | Complex with sync, disambiguation, filtering. The `NewReleasesTab` in wishlist is a *different* feature (vinyl release detection vs MusicBrainz new releases). |
| `SuggestionsPage.tsx` (329 lines) | `SuggestionsTab` | **Low** | Fairly self-contained, just needs SyncStatusBar handling |

### WishlistPage Internal Tabs: How to Handle

WishlistPage already has 6 internal tabs (`all | vinyl | cd_only | affordable | monitoring | new_releases`). When it becomes the "Wishlist" tab inside Marketplace Hub:

**Recommended approach**: Keep the internal tabs as sub-tabs within the WishlistTab component. The outer Marketplace Hub tabs provide **feature-level** navigation (Wishlist vs Sellers vs Matches), while the inner WishlistTab tabs provide **data-level** filtering (All vs Vinyl vs CD Only). This nested tab pattern is common and natural.

The `new_releases` internal sub-tab (which renders `NewReleasesTab` for vinyl release detection) should **stay** inside WishlistTab since it's specifically about wishlist item availability. The separate `NewReleasesPage` (MusicBrainz-based new album tracking) is a different feature and becomes its own top-level tab in Marketplace Hub.

---

## 4. Shared State: What Needs Lifting

### Marketplace Hub -- Cross-Tab State

| State | Current Owner | Shared By | Lift To |
|---|---|---|---|
| Wishlist items (for seller matching) | WishlistPage | SellersTab, SellerMatchesTab, MissingAlbumsTab | MarketplaceHubPage context or shared data fetch |
| Local want list | WishlistPage, DiscoveryPage | WishlistTab (monitoring sub-tab), SellersTab (dependency check), MissingAlbumsTab (want actions) | MarketplaceHubPage |
| Discogs wishlist (normalized) | DiscoveryPage | MissingAlbumsTab (hide-wanted toggle) | MarketplaceHubPage |
| Wishlist empty check | SellersPage | SellersTab (shows dependency warning) | MarketplaceHubPage (compute from wishlist items) |

**Key insight**: SellersPage currently fetches the wishlist just to check if it's empty (`wishlistEmpty` flag). If wishlist data is already loaded in the parent, this check becomes trivial -- just `items.length === 0 && localWantItems.length === 0`.

### What to Play -- Cross-Tab State

| State | Current Owner | Shared By | Lift To |
|---|---|---|---|
| Collection data (for "In Collection" badges) | DiscoveryPage via `useCollectionLookup` | ForgottenFavoritesTab, DustyCornersTab | WhatToPlayPage (call `useCollectionLookup` once) |
| SyncStatusBar state | SuggestionsPage, DiscoveryPage | SuggestionsTab | WhatToPlayPage (single SyncStatusBar above tabs) |

**Key insight**: The cross-tab data sharing is minimal here. Each tab is mostly independent. The main shared concern is `SyncStatusBar` (already a component) and `useCollectionLookup`.

---

## 5. Props Interface Design

### Key New Interfaces

```tsx
// WishlistTab -- stripped-down from WishlistPage (removes page chrome, keeps content)
interface WishlistTabProps {
  // No props needed initially -- WishlistTab manages its own state
  // Later: could accept wishlistItems/localWantItems from parent
  // to enable cross-tab data sharing
}

// LocalSellersTab -- extracted from SellersPage
interface LocalSellersTabProps {
  wishlistEmpty: boolean;  // Lifted from parent to avoid redundant fetch
}

// SellerMatchesTab -- extracted from SellerMatchesPage
interface SellerMatchesTabProps {
  initialSellerFilter?: string;  // Replace hash-based query param
}

// SuggestionsTab -- extracted from SuggestionsPage
interface SuggestionsTabProps {
  onSyncComplete?: () => void;  // Notify parent to refresh other tabs
}

// DustyCornersTab -- evolved from DustyCornersSection
interface DustyCornersTabProps {
  // Self-fetching variant (fetch its own data)
  // OR receive data from parent:
  albums?: DustyCornerAlbum[];
  loading?: boolean;
}

// NewReleasesPageTab -- extracted from NewReleasesPage (MusicBrainz releases)
// Note: this is DIFFERENT from the existing NewReleasesTab (vinyl detection)
interface NewReleasesPageTabProps {
  // Self-contained, no props needed
}
```

### Existing Interfaces That Work As-Is

- `ForgottenFavoritesTabProps` (already well-defined, 14 props)
- `MissingAlbumsTab` props (receives data + callbacks from parent)
- `NewReleasesTab` Props (`{ onCountChange: (count: number) => void }`)

---

## 6. Hook Opportunities

### New Hooks to Consider

1. **`useTabState(defaultTab, hashPrefix?)`** -- Manages active tab state synced with URL hash
   ```tsx
   const [activeTab, setActiveTab] = useTabState('wishlist', 'marketplace');
   // URL: #marketplace/wishlist, #marketplace/sellers, etc.
   ```
   This encapsulates the hash parsing + writing logic and avoids duplication.

2. **`useWishlistData()`** -- Shared data hook for Marketplace Hub
   ```tsx
   const { wishlistItems, localWantItems, loading, error, refresh } = useWishlistData();
   ```
   Consolidates the 4 parallel API calls that WishlistPage, DiscoveryPage, and SellersPage all make independently.

3. **`usePollingStatus(fetchFn, intervalMs, shouldPoll)`** -- Generic polling hook
   Currently, polling logic (fetch status every 2s, stop when complete) is duplicated across WishlistPage (line 186), SellersPage (line 88), NewReleasesPage (line 108), and NewReleasesTab (line 101). A shared hook would reduce ~40 lines of boilerplate per usage.

### Existing Hooks That Are Sufficient

- `useCollectionLookup` -- Already provides collection data for "In Collection" badges
- `useNotifications` -- Already shared, no changes needed
- `useJobPoller` -- Global job polling, unrelated to tab state

---

## 7. Performance Considerations

### React.memo Candidates

- **Tab content components** (WishlistTab, SuggestionsTab, etc.): Yes, wrap with `React.memo`. Since the parent re-renders when the active tab changes, non-active tabs that are rendered (if we keep them mounted) would re-render unnecessarily.
- **Card components** (WishlistItemCard, SellerCard, MatchCard, SuggestionCard): Already receive stable props. Memoizing is low-value unless lists are very large.

### Lazy Loading Tabs

**Recommendation: Conditional rendering, not lazy loading.**

The current pattern (`{activeTab === 'x' && <Component />}`) already provides natural lazy loading -- components mount when their tab is selected and unmount when switched away. This is the right behavior because:

1. Each tab fetches its own data on mount
2. Tabs are not large bundles -- they're regular components in the same chunk
3. `React.lazy()` would add unnecessary complexity for no measurable benefit
4. Keeping inactive tabs unmounted avoids stale data concerns

**Exception**: If we want to preserve tab state between switches (e.g., user filters in WishlistTab should persist when switching to SellersTab and back), we could render all tabs but hide non-active ones with CSS (`display: none`). However, this means all tabs fetch data on initial mount, which increases the initial load. The better approach is per-tab state preservation via the parent's state (e.g., keep `wishlistSort` in the parent so WishlistTab can restore it on re-mount).

### Avoiding Unnecessary Re-Renders

- **Memoize filtered/sorted lists** with `useMemo` (already done in WishlistPage and DiscoveryPage -- continue this pattern)
- **Memoize callback functions** with `useCallback` (already done consistently)
- **Avoid lifting rapidly-changing state** (like search query text) to the parent. Keep ephemeral UI state local to each tab.

---

## 8. URL State / Hash Encoding

### Current Routing System

The app uses simple hash-based routing: `window.location.hash = 'pageName'`. The `App.tsx` handler strips `#` and splits on `?` for query params. Routes are defined in `src/renderer/routes.ts` as flat string constants.

### Proposed Hash Structure

```
# Current routes (preserved for backward compat)
#wishlist    -> redirects to #marketplace/wishlist (or just renders MarketplaceHubPage)
#sellers     -> redirects to #marketplace/sellers
#seller-matches -> redirects to #marketplace/matches
#releases    -> redirects to #marketplace/releases
#suggestions -> redirects to #what-to-play/suggestions
#discovery   -> redirects to #what-to-play/forgotten-favorites (partial, see below)

# New consolidated routes
#marketplace                    -> MarketplaceHubPage (default tab: wishlist)
#marketplace/wishlist           -> Wishlist tab
#marketplace/releases           -> New Releases tab
#marketplace/sellers            -> Local Sellers tab
#marketplace/matches            -> Seller Matches tab
#marketplace/matches?seller=foo -> Seller Matches filtered by seller
#marketplace/missing            -> Missing Albums tab

#what-to-play                   -> WhatToPlayPage (default tab: suggestions)
#what-to-play/suggestions       -> Suggestions tab
#what-to-play/forgotten         -> Forgotten Favorites tab
#what-to-play/dusty-corners     -> Dusty Corners tab
```

### Implementation Changes to Routing

1. Update `routes.ts`:
   ```tsx
   export const ROUTES = {
     // ... existing routes kept for backward compat ...
     MARKETPLACE: 'marketplace',
     WHAT_TO_PLAY: 'what-to-play',
   } as const;
   ```

2. Update `App.tsx` hash handler to support `/` in hashes:
   ```tsx
   const handleHashChange = () => {
     const fullHash = window.location.hash.replace('#', '') || DEFAULT_ROUTE;
     const [path, query] = fullHash.split('?');
     const segments = path.split('/');
     setCurrentPage(segments[0]); // Top-level page
     setSubPage(segments[1] || null); // Sub-page/tab (new state)
   };
   ```

3. Pass `subPage` to `MainContent`, which passes it to the appropriate hub page as `defaultTab`.

4. Add redirects for old routes: When `currentPage` is `wishlist`, redirect to `marketplace` with subpage `wishlist`. This preserves bookmarks and in-app links that haven't been updated yet.

### Sidebar Changes

Update `Sidebar.tsx` navigation:
- Remove individual entries for Wishlist, New Releases, Sellers, Seller Matches
- Add single "Marketplace" entry under "Library" or "Explore"
- Remove individual entries for Suggestions, Discovery
- Keep Discovery (it still has Missing Artists tab that doesn't move)
- Add single "What to Play" entry under "Listening"

---

## 9. Migration Path: Concrete Steps

### Phase 1: Create Shared Components (Non-Breaking)

1. **Create `TabBar` component** in `src/renderer/components/ui/TabBar.tsx`
2. **Export from `ui/index.ts`**
3. **Create `useTabState` hook** in `src/renderer/hooks/useTabState.ts`
4. No existing pages change. These are additive.

### Phase 2: Extract Tab Components (Non-Breaking)

5. **Create `WishlistTab.tsx`** in `src/renderer/components/marketplace/`:
   - Move all content from WishlistPage below the page header into this component
   - WishlistPage becomes a thin wrapper: `<div className="page"><WishlistTab /></div>`
   - Test: WishlistPage should look and behave identically

6. **Create `LocalSellersTab.tsx`** in `src/renderer/components/marketplace/`:
   - Extract from SellersPage, accept `wishlistEmpty` as prop
   - SellersPage becomes thin wrapper that fetches + passes `wishlistEmpty`

7. **Create `SellerMatchesTab.tsx`** in `src/renderer/components/marketplace/`:
   - Extract from SellerMatchesPage, accept `initialSellerFilter` as prop
   - SellerMatchesPage becomes thin wrapper

8. **Create `NewReleasesPageTab.tsx`** in `src/renderer/components/marketplace/`:
   - Extract from NewReleasesPage
   - NewReleasesPage becomes thin wrapper

9. **Create `SuggestionsTab.tsx`** in `src/renderer/components/whattoplay/`:
   - Extract from SuggestionsPage
   - SuggestionsPage becomes thin wrapper

10. **Create `DustyCornersTab.tsx`** in `src/renderer/components/whattoplay/`:
    - Evolve from DustyCornersSection to be self-fetching (add its own API call for dusty albums)
    - StatsPage continues using the existing DustyCornersSection (no change)

Test after each extraction: Old pages should work identically since they're now thin wrappers.

### Phase 3: Create Hub Pages (Non-Breaking)

11. **Create `MarketplaceHubPage.tsx`** in `src/renderer/pages/`:
    - Uses TabBar + conditional rendering of extracted tab components
    - Reads sub-tab from hash

12. **Create `WhatToPlayPage.tsx`** in `src/renderer/pages/`:
    - Uses TabBar + conditional rendering
    - Reads sub-tab from hash

13. **Add new routes** to `routes.ts` (`MARKETPLACE`, `WHAT_TO_PLAY`)

14. **Add new pages** to `MainContent.tsx` switch statement

15. **Add new sidebar entries** for the hub pages

Test: New hub pages should work at their new URLs. Old pages still work at old URLs.

### Phase 4: Redirect and Clean Up

16. **Add redirects** in App.tsx for old routes -> new hub routes:
    ```tsx
    // In handleHashChange:
    const REDIRECTS: Record<string, string> = {
      'wishlist': 'marketplace/wishlist',
      'sellers': 'marketplace/sellers',
      'seller-matches': 'marketplace/matches',
      'releases': 'marketplace/releases',
      'suggestions': 'what-to-play/suggestions',
    };
    ```

17. **Update all `window.location.hash` references** across the codebase:
    - `NotificationBell.tsx` routes
    - `SellerCard.tsx` match link
    - `SuggestionCard.tsx` collection link
    - `SellersPage.tsx` wishlist link
    - `DustyCornersSection.tsx` release-details link (stays the same)
    - `QuickActionsGrid.tsx` navigation links

18. **Update Sidebar** to remove old individual entries, replace with hub entries

19. **Remove old standalone pages** (WishlistPage, SellersPage, SellerMatchesPage, NewReleasesPage, SuggestionsPage) once all references are updated

20. **Remove old routes** from `routes.ts` and `MainContent.tsx`

### Phase 5: Cross-Tab Enhancements (Optional)

21. **Lift shared state** (wishlist data) to MarketplaceHubPage for cross-tab communication
22. **Add cross-tab refresh** (e.g., when seller scan completes, auto-refresh matches tab badge count)

---

## 10. File Organization

### Proposed Structure

```
src/renderer/
  pages/
    MarketplaceHubPage.tsx          # NEW - Hub page with TabBar
    WhatToPlayPage.tsx              # NEW - Hub page with TabBar
    # OLD pages remain during migration, then removed:
    # WishlistPage.tsx -> thin wrapper -> deleted
    # SellersPage.tsx -> thin wrapper -> deleted
    # SellerMatchesPage.tsx -> thin wrapper -> deleted
    # NewReleasesPage.tsx -> thin wrapper -> deleted
    # SuggestionsPage.tsx -> thin wrapper -> deleted

  components/
    ui/
      TabBar.tsx                    # NEW - Reusable tab navigation
      index.ts                     # Updated with TabBar export
      Modal.tsx                    # Existing
      Badge.tsx                    # Existing
      ...

    marketplace/                    # NEW directory
      index.ts                     # Barrel exports
      WishlistTab.tsx              # Extracted from WishlistPage
      LocalSellersTab.tsx          # Extracted from SellersPage
      SellerMatchesTab.tsx         # Extracted from SellerMatchesPage
      NewReleasesPageTab.tsx       # Extracted from NewReleasesPage
      # MissingAlbumsTab stays at components/discovery/ or moves here

    whattoplay/                     # NEW directory
      index.ts                     # Barrel exports
      SuggestionsTab.tsx           # Extracted from SuggestionsPage
      DustyCornersTab.tsx          # Evolved from DustyCornersSection
      # ForgottenFavoritesTab stays at components/discovery/ or moves here

    wishlist/                       # Existing
      NewReleasesTab.tsx           # Stays (vinyl release detection, used inside WishlistTab)
      NewReleaseCard.tsx           # Stays

    discovery/                      # Existing
      MissingAlbumsTab.tsx         # Consider moving to marketplace/
      MissingArtistsTab.tsx        # Stays (Discovery page retains "Missing Artists")
      ForgottenFavoritesTab.tsx    # Consider moving to whattoplay/

    stats/
      DustyCornersSection.tsx      # Stays (StatsPage continues using this)

  hooks/
    useTabState.ts                 # NEW - Tab state synced with URL hash
    useWishlistData.ts             # NEW (optional) - Shared wishlist data fetching
    usePollingStatus.ts            # NEW (optional) - Generic status polling
    useCollectionLookup.ts         # Existing
    useNotifications.ts            # Existing

  routes.ts                        # Updated with new route constants
```

### Naming Conventions

- **Hub pages**: `*HubPage.tsx` (MarketplaceHubPage, but `WhatToPlayPage` since "WhatToPlayHubPage" is awkward)
- **Tab components**: `*Tab.tsx` (consistent with existing `NewReleasesTab`, `ForgottenFavoritesTab`, `MissingAlbumsTab`)
- **Feature directories**: Lowercase, feature-name (`marketplace/`, `whattoplay/`)
- **Existing naming preserved** where components already exist to avoid unnecessary churn

### Discovery Page: What Stays

The existing `DiscoveryPage` retains:
- **Missing Artists tab** (not moving to Marketplace Hub -- it's about artist-level gaps, not buying/acquiring)
- Remove or redirect the "Missing Albums" tab (moves to Marketplace Hub)
- Remove or redirect the "Forgotten Favorites" tab (moves to What to Play)

If only "Missing Artists" remains, DiscoveryPage could be simplified to just render `MissingArtistsTab` directly (no tabs needed), or it could be folded into the Marketplace Hub as a 6th tab. Decision point for the team.
