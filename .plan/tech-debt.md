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

**Priority: P1** | **Effort: Low** | **Impact: Medium (debugging)**

20+ scattered `console.error` and `console.log` statements across frontend. Backend has `logger.ts` with redaction, but it's not used consistently.

**Issues Found:**
- `MainContent.tsx` - logs on every page change
- `ThemeContext.tsx` - logs on theme toggles
- `SetupPage.tsx` - logs auth URLs and tokens (security concern)
- `api.ts` - logs every request/response error
- `server.ts` - uses console directly instead of logger
- `fileStorage.ts` - uses console directly instead of logger

**Action:**
- [ ] Create frontend logger utility matching backend pattern
- [ ] Remove/gate debug logging that may expose tokens
- [ ] Use redacting logger consistently in backend
- [ ] Add environment-based log level filtering

**Files:** `src/renderer/services/api.ts`, `src/renderer/components/MainContent.tsx`, `src/renderer/context/ThemeContext.tsx`, `src/renderer/pages/SetupPage.tsx`, `src/server.ts`, `src/backend/utils/fileStorage.ts`

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

**Priority: P1** | **Effort: Low** | **Impact: Medium (consistency)**

- ~~`--text-tertiary` CSS variable is used but not defined (falls back inconsistently)~~ **RESOLVED**
- Duplicate `.sync-status-bar` class definitions cause style conflicts

**Action:**
- [x] Define `--text-tertiary` in `:root` and `.dark-mode` - Added in styles.css
- [ ] Resolve duplicate class definitions
- [ ] Audit for other missing variables

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
- [ ] Centralized logging (remove token exposure)
- [ ] Remove `any` types
- [ ] Fix missing/duplicate CSS
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

### P3 - Nice to Have
- [ ] Keyboard shortcuts
- [ ] Advanced filtering
- [ ] Command palette
- [ ] Theme variants
- [ ] Playlist system
- [ ] Export capabilities
- [ ] Onboarding wizard
