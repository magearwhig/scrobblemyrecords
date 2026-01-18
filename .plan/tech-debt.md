# Technical Debt & UI Improvements

This document consolidates feedback from multiple sources and outlines improvements for code quality, UI/UX, and architecture.

---

## Priority Legend

| Priority | Meaning |
|----------|---------|
| **P0** | Critical - Do immediately |
| **P1** | High - Do soon |
| **P2** | Medium - Plan for next cycle |
| **P3** | Low - Nice to have |

---

## 1. Settings Page Restructure

**Priority: P1** | **Effort: Medium** | **Impact: High (usability)** | **Status: ✅ COMPLETE**

> **Completed January 2026:** Settings page has been restructured into 4 tabs with modular section components.

### What Was Implemented
- 4 tabs: Integrations, Mappings, Filters, Wishlist
- Extracted section components: `SettingsIntegrationsSection.tsx`, `SettingsMappingsSection.tsx`, `SettingsFiltersSection.tsx`, `SettingsWishlistSection.tsx`
- Badge counts on tabs showing metrics
- Visual separation with card components and section headers

### Remaining Minor Items (Optional)
- [ ] Mobile viewport testing/optimization
- [ ] Some inline styles may still exist in section components

**Files:** `src/renderer/pages/SettingsPage.tsx`, `src/renderer/components/settings/*`

---

## 2. Code Quality Issues

### 2.1 Test Coverage Gap

**Priority: P0** | **Effort: Medium** | **Impact: High (reliability)**

README and dev_prompt.md specify 90% coverage target but Jest config enforces only 55-60% thresholds. This is a known gap that will be addressed incrementally.

**Current State:**
- `jest.config.js` thresholds: branches 55%, functions/lines/statements 60%
- README target: 90%
- Current actual coverage: ~60%+

**Improvement Plan:**
The 90% target is aspirational. Thresholds will be raised incrementally as tests are added:
1. Current baseline (55-60%) prevents regression
2. As coverage improves, thresholds will be raised in 5-10% increments
3. Do NOT change jest.config.js until tests are written to support higher thresholds

**Action:**
- [ ] Write tests for services with low coverage: `wishlistService.ts`, `imageService.ts`
- [ ] After coverage improves, raise jest.config.js thresholds incrementally
- [ ] Add coverage report to CI output for visibility
- [ ] Consider separate thresholds for backend vs frontend

**Files:** `jest.config.js`, `README.md`, `dev_prompt.md`

---

### 2.2 Centralized Error Logging

**Priority: P1** | **Effort: Low** | **Impact: Medium (debugging)** | **Status: ✅ COMPLETE**

> **Completed January 2026:** Created frontend logger utility, removed token exposure, standardized logging across frontend and backend.

**What Was Implemented:**
- Created `src/renderer/utils/logger.ts` matching backend pattern with sensitive data redaction
- Removed all token/auth URL logging from `SetupPage.tsx` (security fix)
- Replaced `console.log/error` with secure logger in `api.ts`
- Removed debug logging from `MainContent.tsx` and `ThemeContext.tsx`
- Updated `server.ts` to use backend logger instead of console
- Updated `fileStorage.ts` to use backend logger instead of console
- Environment-based log level filtering (DEBUG in dev, WARN in production)

**Action:**
- [x] Create frontend logger utility matching backend pattern
- [x] Remove/gate debug logging that may expose tokens
- [x] Use redacting logger consistently in backend
- [x] Add environment-based log level filtering

**Files:** `src/renderer/utils/logger.ts`, `src/renderer/services/api.ts`, `src/renderer/components/MainContent.tsx`, `src/renderer/context/ThemeContext.tsx`, `src/renderer/pages/SetupPage.tsx`, `src/server.ts`, `src/backend/utils/fileStorage.ts`

---

### 2.3 Remove `any` Types

**Priority: P1** | **Effort: Low** | **Impact: Medium (type safety)**

~~Types like `notes?: any[]` in CollectionItem and `payload?: any` in AppAction bypass TypeScript safety.~~

**Action:**
- [x] Audit codebase for `any` types - Replaced `notes?: any[]` with `notes?: CollectionNote[]`
- [x] Define proper interfaces for each usage - Added `CollectionNote` interface
- [ ] Enable stricter TypeScript checks

**Files:** `src/shared/types.ts`, various component files

---

### 2.4 Missing/Duplicate CSS

**Priority: P1** | **Effort: Low** | **Impact: Medium (consistency)** | **Status: ✅ COMPLETE**

> **Completed January 2026:** All CSS issues have been resolved.

- ~~`--text-tertiary` CSS variable is used but not defined (falls back inconsistently)~~ **RESOLVED**
- ~~Duplicate `.sync-status-bar` class definitions cause style conflicts~~ **RESOLVED**
- ~~Missing `--bg-primary-rgb` CSS variable~~ **RESOLVED**

**Action:**
- [x] Define `--text-tertiary` in `:root` and `.dark-mode` - Added in styles.css
- [x] Resolve duplicate class definitions - Removed duplicate at line 4293, kept complete definition at line 636
- [x] Audit for other missing variables - Added `--bg-primary-rgb` for rgba usage

**Files:** `src/renderer/styles.css`

---

### 2.5 Standardize API Error Responses

**Priority: P2** | **Effort: Low** | **Impact: Medium (consistency)**

Some endpoints return `{success: false, error}`, others throw. This creates frontend edge cases.

**Action:**
- [ ] Audit all API endpoints for response shape consistency
- [ ] Create standard error response helper
- [ ] Update frontend error handling to match

**Files:** `src/backend/routes/*.ts`

---

### 2.6 Centralize Route Identifiers

**Priority: P2** | **Effort: Low** | **Impact: Medium (maintainability)**

String literals for routing in App.tsx, MainContent.tsx, and Sidebar.tsx can drift out of sync.

**Action:**
- [ ] Create `routes.ts` constants file
- [ ] Replace string literals with constants
- [ ] Add TypeScript enum or const object

**Files:** `src/renderer/App.tsx`, `src/renderer/components/MainContent.tsx`, `src/renderer/components/Sidebar.tsx`

---

## 3. UI/UX Improvements

### 3.1 Loading Skeletons

**Priority: P1** | **Effort: Low** | **Impact: High (perceived performance)**

Current loading states show spinners which cause layout shifts. Skeleton loaders matching content shape create smoother experience.

**Action:**
- [ ] Create skeleton components for: album cards, stat cards, lists
- [ ] Replace spinners with skeletons in major views
- [ ] Ensure skeletons match final content dimensions

---

### 3.2 Collapsible Sidebar

**Priority: P1** | **Effort: Low** | **Impact: Medium (usability)**

Fixed 250px sidebar takes significant space on smaller screens.

**Action:**
- [ ] Add toggle to collapse to icons-only mode
- [ ] Persist preference in localStorage
- [ ] Add responsive breakpoint for auto-collapse on mobile

**Files:** `src/renderer/components/Sidebar.tsx`, `src/renderer/styles.css`

---

### 3.3 Better Empty States

**Priority: P1** | **Effort: Low** | **Impact: Medium (onboarding)**

Empty states show minimal text which feels like broken functionality.

**Action:**
- [ ] Add illustrations or icons to empty states
- [ ] Include helpful suggestions ("Try syncing your collection first")
- [ ] Add prominent call-to-action buttons

**Files:** Various page components

---

### 3.4 Toast Notifications System

**Priority: P2** | **Effort: Medium** | **Impact: High (UX feedback)**

Feedback for actions often requires modal dialogs or inline messages that can be missed.

**Action:**
- [ ] Implement toast notification component
- [ ] Add auto-dismiss with configurable duration
- [ ] Support action buttons ("Undo", "View Details")
- [ ] Position in corner, non-blocking

---

### 3.5 Virtual Scrolling for Large Lists

**Priority: P2** | **Effort: Medium** | **Impact: High (performance)**

Users with 1000+ albums experience performance degradation rendering all cards.

**Action:**
- [ ] Implement `react-window` or similar for collection grid
- [ ] Only render visible items
- [ ] Maintain scroll position on navigation

**Files:** `src/renderer/pages/CollectionPage.tsx`

---

### 3.6 Sidebar Reorganization

**Priority: P2** | **Effort: Low** | **Impact: Medium (scanability)**

Current flat list of nav items lacks visual hierarchy.

**Action:**
- [ ] Group into sections: Setup / Library / Insights / Settings
- [ ] Add section headers or dividers
- [ ] Make disabled items explain why (tooltip: "Connect Discogs first")
- [ ] Consider moving auth status to header (persistent + visible)

**Files:** `src/renderer/components/Sidebar.tsx`

---

### 3.7 Keyboard Shortcuts

**Priority: P3** | **Effort: Low** | **Impact: Medium (power users)**

Power users appreciate keyboard navigation for efficiency.

**Action:**
- [ ] Add "/" for search focus
- [ ] Add "Esc" to close modals
- [ ] Add arrow keys for grid navigation
- [ ] Add keyboard shortcut help modal

---

### 3.8 Advanced Filtering

**Priority: P3** | **Effort: Medium** | **Impact: High (discoverability)**

Current search is text-based only. Collectors want to filter by year, format, genre, rating.

**Action:**
- [ ] Add filter panel with quick-toggle chips
- [ ] Support year range, format (LP vs 7"), genre
- [ ] Add saved filter presets

---

### 3.9 Command Palette

**Priority: P3** | **Effort: Medium** | **Impact: Low (power users)**

Global command palette (Cmd+K) for searching actions, pages, albums.

**Action:**
- [ ] Implement command palette component
- [ ] Index pages, actions, and searchable content
- [ ] Add fuzzy search

---

## 4. CSS/Styling Debt

### 4.1 Reduce Inline Styles

**Priority: P2** | **Effort: Medium** | **Impact: Medium (maintainability)**

Sidebar and SetupPage have many inline style blocks. Per CLAUDE.md guidelines, avoid inline styles.

**Action:**
- [ ] Audit components for inline styles
- [ ] Move to CSS classes using CSS variables
- [ ] Document exceptions (dynamic values only)

**Files:** `src/renderer/components/Sidebar.tsx`, `src/renderer/pages/SetupPage.tsx`, `src/renderer/pages/SettingsPage.tsx`

---

### 4.2 Split styles.css

**Priority: P2** | **Effort: Medium** | **Impact: Medium (maintainability)**

Single large `styles.css` file causes coupling and potential collisions.

**Action:**
- [ ] Split into: `global.css`, `components.css`, page-specific files
- [ ] Or adopt CSS modules per component
- [ ] Extract shared patterns into utility classes

**Files:** `src/renderer/styles.css`

---

### 4.3 Extract Shared UI Patterns

**Priority: P2** | **Effort: Low** | **Impact: Medium (consistency)**

Repeated patterns across pages: section headers, empty states, info boxes, action rows.

**Action:**
- [ ] Create reusable components: `SectionHeader`, `EmptyState`, `InfoBox`, `ActionRow`
- [ ] Document in component library or storybook

---

### 4.4 Component Extraction Roadmap

**Priority: P2** | **Effort: High** | **Impact: High (maintainability, consistency)**

> **Comprehensive analysis completed January 2026:** The frontend codebase relies heavily on CSS classes for consistency (good!) but duplicates JSX structure in many places (bad!). This section documents all extraction opportunities.

#### 4.4.1 Core UI Primitives

These foundational components should replace raw HTML elements and CSS classes everywhere.

##### `Button` Component

**Current State:** Repetitive `<button className="btn btn-primary ...">` elements. Loading states are manually handled with spinners inside buttons.

**Locations:** Every page file (`CollectionPage`, `DiscoveryPage`, `WishlistPage`, `SellersPage`, etc.)

**Requirements:**
| Feature | Options |
|---------|---------|
| Variants | `primary`, `secondary`, `danger`, `outline`, `link` |
| Sizes | `normal`, `small` |
| States | `isLoading` (replaces text with spinner), `disabled`, `active` |
| Props | `icon` (left/right), `fluid` (width: 100%) |

**Action:**
- [ ] Create `src/renderer/components/ui/Button.tsx`
- [ ] Define CSS classes `.btn-*` variants in styles or use CSS-in-JS
- [ ] Add unit tests for all states and variants

---

##### `Card` Component

**Current State:** Hundreds of `div.card` elements. Some have headers/actions defined ad-hoc.

**Locations:** `StatsPage.tsx`, `SellersPage.tsx`, `HistoryPage.tsx`

**Requirements:**
| Feature | Options |
|---------|---------|
| Props | `title` (optional header), `subtitle`, `actions` (header buttons), `padding` (default/none) |
| Slots | `children` (body), `footer` |

**Action:**
- [ ] Create `src/renderer/components/ui/Card.tsx`
- [ ] Support `Card.Header`, `Card.Body`, `Card.Footer` compound pattern

---

##### `Modal` Component

**Current State:** 4+ duplicate implementations of the Overlay → Container → Header/Body/Footer structure.

**Locations:**
- `DiscoveryPage.tsx` (`MappingModal`)
- `WishlistPage.tsx` (`VersionsModal`)
- `SellersPage.tsx` (`AddSellerModal`)
- `NewReleasesPage.tsx` (`DisambiguationModal`)

**Requirements:**
| Feature | Options |
|---------|---------|
| Props | `isOpen`, `onClose`, `title`, `size` (`sm`, `md`, `lg`), `isLoading` |
| Behavior | `stopPropagation` on click, close on overlay click, generic close button |

**Action:**
- [ ] Create `src/renderer/components/ui/Modal.tsx`
- [ ] Refactor all 4 page modals to use the shared component
- [ ] Add keyboard support (Esc to close)

---

##### `ProgressBar` Component

**Current State:** 3 different implementations with slightly different HTML structures.

**Locations:**
- `SyncStatusBar.tsx` (Sync progress)
- `MilestoneProgress.tsx` (Stats progress)
- `SellersPage.tsx` (Scan progress)

**Requirements:**
| Feature | Options |
|---------|---------|
| Props | `value` (0-100), `label` (optional text), `showPercentage` (boolean), `color` (optional override), `height` |

**Action:**
- [ ] Create `src/renderer/components/ui/ProgressBar.tsx`
- [ ] Unify all 3 implementations to use shared component
- [ ] Add animation support for value changes

---

##### `Badge` Component

**Current State:** `span` elements with various classes (`badge`, `discovery-badge`, `wishlist-badge`).

**Locations:** `DiscoveryPage`, `WishlistPage`, `NewReleasesPage`, `SellerMatchesPage`

**Requirements:**
| Feature | Options |
|---------|---------|
| Variants | `success`, `warning`, `error`, `info`, `neutral`, `purple` (Wishlist) |
| Props | `label`, `icon` (optional) |

**Action:**
- [ ] Create `src/renderer/components/ui/Badge.tsx`
- [ ] Consolidate all badge CSS classes

---

#### 4.4.2 Feature-Specific Lists & Cards

Complex items currently defined inline within large page files.

##### `DiscoveryItemCard`

**Source:** `DiscoveryPage.tsx` (inline, ~100+ lines per card type)

**Description:** Displays a missing album/artist with stats and action buttons (Last.fm, Discogs, Map, etc.)

**Impact:** `DiscoveryPage` is over 1000 lines; extracting these will reduce it by ~300 lines.

**Action:**
- [ ] Create `src/renderer/components/discovery/DiscoveryItemCard.tsx`
- [ ] Support both album and artist variants

---

##### `WishlistItemCard`

**Source:** `WishlistPage.tsx` (inline, ~130 lines)

**Description:** Displays a wishlist item or local want item with price data, cover art, and vinyl status.

**Variation:** Needs to handle both "Discogs Wishlist" items and "Local Want List" items (slightly different metadata).

**Action:**
- [ ] Create `src/renderer/components/wishlist/WishlistItemCard.tsx`
- [ ] Add prop to distinguish between Discogs and Local variants

---

##### `ReleaseCard`

**Source:** `NewReleasesPage.tsx` (inline, ~115 lines)

**Description:** Displays a new release with "Upcoming" badges, vinyl availability, and hide/exclude actions.

**Action:**
- [ ] Create `src/renderer/components/releases/ReleaseCard.tsx`

---

##### `SellerCard` & `MatchCard`

**Source:** `SellersPage.tsx` and `SellerMatchesPage.tsx`

**Description:** Seller info card and Match result card. Both share similar "cover + info + actions" layouts.

**Action:**
- [ ] Create `src/renderer/components/sellers/SellerCard.tsx`
- [ ] Create `src/renderer/components/sellers/MatchCard.tsx`

---

##### `ScrobbleSessionCard`

**Source:** `HistoryPage.tsx` (inline, ~230 lines)

**Description:** A complex expandable card showing session status, track list, and album thumbnails.

**Action:**
- [ ] Create `src/renderer/components/history/ScrobbleSessionCard.tsx`

---

#### 4.4.3 Complex Logic Blocks

Large chunks of logic/UI that should be their own files to reduce page complexity.

| Block | Source | Target Path |
|-------|--------|-------------|
| `ForgottenFavoritesTab` | `DiscoveryPage.tsx` (~150 lines) | `src/renderer/components/discovery/ForgottenFavoritesTab.tsx` |
| `CollectionFilterControls` | `CollectionPage.tsx` (~150 lines) | `src/renderer/components/collection/CollectionFilters.tsx` |
| `CacheStatusIndicator` | `CollectionPage.tsx` (~185 lines) | `src/renderer/components/collection/CacheStatus.tsx` |

**Action:**
- [ ] Extract `ForgottenFavoritesTab` to its own component
- [ ] Extract `CollectionFilterControls` to its own component
- [ ] Extract `CacheStatusIndicator` to its own component

---

#### 4.4.4 Implementation Priority

| Level | Components | Risk | Effort |
|-------|------------|------|--------|
| **Level 1** (Quick Wins) | `Button`, `Badge`, `ProgressBar` | Low | Low |
| **Level 2** (Cleanup) | `Modal` + refactor 4 page modals | Low | Medium |
| **Level 3** (Page Diet) | `DiscoveryItemCard`, `WishlistItemCard` | Medium | Medium |
| **Level 4** (Logic Separation) | `ForgottenFavoritesTab`, `CollectionFilterControls`, `CacheStatus` | Medium | Medium |

**Recommended Order:**
1. Start with Level 1 - these can be swapped in immediately with low risk
2. Level 2 significantly reduces code duplication across 4 files
3. Levels 3-4 reduce the largest page files (DiscoveryPage, CollectionPage)

---

## 5. Future Enhancements (P3)

These are nice-to-have features for later consideration:

| Feature | Effort | Notes |
|---------|--------|-------|
| Theme Variants | Low | Warm/vinyl-inspired, custom accent picker |
| Playlist/Queue System | High | Build listening queue, batch scrobble |
| Export Capabilities | Medium | CSV/JSON for collection, stats, history |
| Onboarding Wizard | High | Guided first-run setup flow |
| Quick Actions on Home | Low | Sync, Scrobble, Suggestions buttons |
| Setup Stepper | Medium | Discogs -> Last.fm -> Verify flow |

---

## Summary by Priority

### P0 - Do Immediately
- [ ] Align test coverage (README vs jest.config.js)

### P1 - Do Soon
- [x] Settings page restructure with visual separation ✅ COMPLETE
- [x] Centralized logging (remove token exposure) ✅ COMPLETE
- [ ] Remove `any` types
- [x] Fix missing/duplicate CSS ✅ COMPLETE
- [ ] Loading skeletons
- [ ] Collapsible sidebar
- [ ] Better empty states

### P2 - Next Cycle
- [ ] Standardize API error responses
- [ ] Centralize route identifiers
- [ ] Toast notifications
- [ ] Virtual scrolling
- [ ] Sidebar reorganization
- [ ] Reduce inline styles
- [ ] Split styles.css
- [ ] Extract shared UI patterns
- [ ] Component extraction (see 4.4 for full roadmap):
  - [ ] Level 1: `Button`, `Badge`, `ProgressBar` components
  - [ ] Level 2: `Modal` component + refactor 4 page modals
  - [ ] Level 3: `DiscoveryItemCard`, `WishlistItemCard` extraction
  - [ ] Level 4: `ForgottenFavoritesTab`, `CollectionFilters`, `CacheStatus` extraction

### P3 - Nice to Have
- [ ] Keyboard shortcuts
- [ ] Advanced filtering
- [ ] Command palette
- [ ] Theme variants
- [ ] Playlist system
- [ ] Export capabilities
- [ ] Onboarding wizard
