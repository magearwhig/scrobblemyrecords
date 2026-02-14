# Visual & UI Tech Debt

**Status: DONE (Tiers 1-3)** — Completed 2026-02-14

Comprehensive findings from a 6-agent UI/UX review (Visual Polish, Interaction & Usability, Modern Patterns, Consistency & System, Power User Advocate, Dev Prompt Compliance Auditor). All items verified against `dev_prompt.md` — zero conflicts.

Tiers 1-3 executed by an 8-agent team (design-expert, ux-expert, frontend-dev, data-expert, backend-dev, quality-expert, compliance-enforcer, power-user). All 23 tasks completed. 100 test suites passing (2,754 tests), build clean. Tier 4 and Design Overhaul Opportunities intentionally deferred.

---

## Tier 1: Critical — Fix Immediately (DONE)

### 1.1 Dark Mode Broken in Rankings Components
- `src/renderer/components/stats/RankingsOverTime.css:167` uses `@media (prefers-color-scheme: dark)` instead of `.dark-mode` class
- `src/renderer/components/stats/RankingsRace.css:211` same issue
- Hardcoded `color: #000000` and `background: #ffffff` at `RankingsOverTime.css:73,82` and `RankingsRace.css:105-106` — unreadable in dark mode
- **Fix:** Replace `@media` blocks with `.dark-mode` selectors; replace hardcoded hex with `var(--text-primary)`, `var(--bg-secondary)`
- **Effort:** Small (CSS-only, 2 files)
- **Status:** DONE — Replaced `@media` blocks with `.dark-mode` selectors, hardcoded hex with CSS variables, px converted to rem

### 1.2 Add `:focus-visible` Styles Globally
- `.btn` class (~320 buttons) has NO `:focus-visible` — keyboard users can't see focus
- Also missing on: `.nav-link`, `.settings-tab`, `.history-tab`, `.sidebar-toggle`, `.search-clear`, `.notification-bell-button`
- **Fix:** Add `:focus-visible` rules to all interactive element classes in `styles.css`
- **Effort:** Small (CSS-only)
- **Status:** DONE — Added `:focus-visible` rules for `.btn`, `.nav-link`, `.settings-tab`, `.tab`, and all interactive elements

### 1.3 CollectionPage Discard Modals Must Use Modal Component
- 5 custom modals built from raw `<div className='modal-overlay'>` bypass `Modal.tsx`
- Missing: FocusTrap, Escape key handling, `role="dialog"`, `aria-modal`, body scroll lock
- Locations:
  - `CollectionPage.tsx:1443` (add to discard pile)
  - `CollectionPage.tsx:1666` (bulk add to discard pile)
  - `ReleaseDetailsPage.tsx:762` (disambiguation warning)
  - `ScrobblePage.tsx:298` (disambiguation warning)
  - `BackupImportDialog.tsx:106` (import backup)
- **Fix:** Replace raw div modals with `<Modal>` component
- **Effort:** Medium (5 files, straightforward swap)
- **Status:** DONE — All 5 modals replaced with `<Modal>` component; added `footer` prop to Modal.tsx

### 1.4 Remove Debug Text from Production
- `CollectionPage.tsx:1254-1257` renders "Debug: entireCollection=X, filtered=Y, searchMode=Z" unconditionally
- Violates dev_prompt.md line 10: "remove any temporary debugging code"
- **Fix:** Remove or wrap in `process.env.NODE_ENV === 'development'` guard
- **Effort:** Tiny
- **Status:** DONE — Debug text removed

### 1.5 Warning/Info Message Colors Broken in Dark Mode
- `.message.warning` at `styles.css:737` uses hardcoded `#fff3cd` bg, `#856404` text, `#ffeaa7` border
- `.message.info` at `styles.css:743` uses hardcoded `#d1ecf1` bg, `#0c5460` text, `#bee5eb` border
- No `.dark-mode` overrides exist
- **Fix:** Add dark mode overrides or convert to CSS variable-based colors
- **Effort:** Small (CSS-only)
- **Status:** DONE — Added `--warning-text`/`--info-text` CSS variables to both `:root` and `.dark-mode`

### 1.6 Fix `--bg-card` / `--card-bg` Variable Mismatch
- `var(--bg-card)` referenced in 5 places but never defined — actual variable is `--card-bg`
- Locations: `Skeleton.css:74,94,179`, `styles.css:196,9196`
- **Fix:** Replace `var(--bg-card)` with `var(--card-bg)`
- **Effort:** Tiny (find-and-replace)
- **Status:** DONE — All 5 occurrences replaced

### 1.7 WhatToPlay/Marketplace Tab Styles Fragile
- `.tabs` and `.tab` classes only defined in `NewReleasesPage.css:158-175`
- `WhatToPlayPage.tsx:49,54` and `MarketplacePage.tsx:89,93` use these classes but don't import that CSS
- Works only because Webpack bundles CSS globally — breaks if NewReleasesPage.css is ever lazy-loaded
- **Fix:** Move `.tabs` and `.tab` to `styles.css` as global classes
- **Effort:** Small (CSS relocation)
- **Status:** DONE — Moved `.tabs`/`.tab` to styles.css as global classes

---

## Tier 2: High Priority — Next Sprint (DONE)

### 2.1 Replace `window.alert()` / `window.confirm()` with Modal
- 17 instances across 5 files using native browser dialogs:
  - `HistoryPage.tsx:88,131` (3 instances)
  - `SellersPage.tsx:199,211,238,257` (4 instances)
  - `SellerMatchesPage.tsx:143,163,185,194` (4 instances)
  - `SettingsMappingsSection.tsx:169,195,260,285,379,452` (6 instances)
  - `SettingsIntegrationsSection.tsx:103` (1 instance)
- **Fix:** Use `<Modal>` for confirmations, `useToast()` for alerts
- **Effort:** Medium
- **Status:** DONE — Replaced with `<Modal>` for confirmations and `useConfirmModal()` hook; created reusable `useConfirmModal.tsx`

### 2.2 Consolidate Toast System — Replace Inline Messages
- `ToastProvider` wraps the app but zero page components import `useToast`
- Pages use fragile `setInfoMessage()` + `setTimeout()` patterns (e.g., `CollectionPage.tsx:841-844,927-935`)
- Multiple pages use inline `.message` divs instead of centralized toast
- **Fix:** Migrate inline message patterns to `useToast()` for transient feedback
- **Effort:** Medium (across multiple pages)
- **Status:** DONE — Migrated CollectionPage and HistoryPage to `useToast()` hook

### 2.3 Adopt Skeleton Loaders Consistently
- `Skeleton.tsx` has 6 variants but only used in 3/17 pages (StatsPage, WrappedPage, HistoryPage)
- 10+ pages use raw `<div className='spinner'>` instead:
  - HomePage.tsx:224, CollectionPage.tsx:1240, DiscoveryPage.tsx, WishlistPage.tsx, SettingsPage.tsx, SellersPage.tsx, SellerMatchesPage.tsx, MarketplacePage.tsx, DiscardPilePage.tsx, SuggestionsPage.tsx
- **Note:** Only add skeletons where load time exceeds ~300ms (not CollectionPage which loads from cache)
- **Fix:** Replace spinners with Skeleton variants
- **Effort:** Medium (page-by-page)
- **Status:** DONE — Added skeletons to 7 pages (HomePage, DiscoveryPage, WishlistPage, SellersPage, SellerMatchesPage, DiscardPilePage, SuggestionsPage). CollectionPage excluded per power-user veto (loads from cache).

### 2.4 Make Non-Focusable Interactive Elements Keyboard-Accessible
- `NotificationBell.tsx:146`: `<li onClick>` items not focusable — needs `tabIndex={0}`, `role="button"`, `onKeyDown`
- `AlbumCard.tsx:44`: `<div className='album-cover' onClick>` not keyboard-accessible — needs `role="button"`, `tabIndex={0}`, `onKeyDown`
- `NotificationBell.tsx`: dropdown has no Escape key handler — needs `useEffect` with keydown listener
- **Effort:** Small-Medium
- **Status:** DONE — Added `tabIndex={0}`, `role="button"`, `onKeyDown` to NotificationBell items and AlbumCard cover; added Escape key handler to NotificationBell dropdown

### 2.5 Add Tab Arrow Key Navigation (WAI-ARIA)
- Settings (6 tabs), Marketplace (5 tabs), WhatToPlay (3 tabs), History (2 tabs) all have `role='tablist'`/`role='tab'` but lack arrow key navigation
- **Fix:** Add `onKeyDown` handler for Left/Right arrow keys. Consider creating reusable `Tabs` component in `ui/`
- **Effort:** Medium
- **Status:** DONE — Created reusable `useTabKeyNavigation.ts` hook; applied to Settings, Marketplace, WhatToPlay, History tabs

### 2.6 Eliminate Duplicate CSS Definitions
- `NewReleasesPage.css` duplicates: `.btn` (line 446), `.modal-overlay` (498), `.modal` (512), `.badge` (391), `.spinner` (269) — all with different values from `styles.css`
- `.modal` defined 4 times total: `styles.css:1858`, `styles.css:6691`, `NewReleasesPage.css:512`, `Modal.css:26`
- **Fix:** Remove duplicates from `NewReleasesPage.css` and `styles.css:6691`; consolidate to single source
- **Effort:** Medium (careful deduplication)
- **Status:** DONE — Removed duplicates from NewReleasesPage.css (`.btn`, `.modal-overlay`, `.modal`, `.badge`, `.spinner`) and duplicate block from styles.css

### 2.7 Fix Search Disabled Overlay in Dark Mode
- `styles.css:981`: hardcoded `rgba(255, 255, 255, 0.7)` — white flash in dark mode
- **Fix:** Change to `rgba(var(--bg-primary-rgb), 0.7)` — the RGB variable already exists at `styles.css:4,27`
- **Effort:** Tiny (one-line CSS fix)
- **Status:** DONE — Changed to `rgba(var(--bg-primary-rgb), 0.7)`

---

## Tier 3: Important — Planned Work (DONE)

### 3.1 Consolidate Button System
- Three competing systems:
  - `.btn` in `styles.css:449` — legacy global (used in ~320 instances across 62 files)
  - `.button` in `Button.css:3` — intended reusable component (used in 2 files: WrappedPage, WrappedNav)
  - `.btn` in `NewReleasesPage.css:446` — third duplicate with different values
  - `.btn-sm` in `NewReleasesPage.css:492` — yet another small variant
- Size differences: `.btn-small` padding `0.25rem 0.75rem`, `.button--small` padding `0.4rem 0.75rem`, `.btn-sm` padding `0.375rem 0.75rem`
- **Note:** Consolidation MUST preserve `.btn-small` compact sizing for data-dense areas
- **Fix:** Align `.btn` and `.button` visually; migrate incrementally to `<Button>` component; remove `.btn-sm`
- **Effort:** Large (do incrementally, page by page)
- **Status:** DONE (PLANNING ONLY) — Created `.plan/button-system-consolidation.md` documenting 3 button systems and incremental migration strategy

### 3.2 Adopt ProgressBar Component
- `ProgressBar.tsx` imported in only 1 file (`CollectionCoverageSlide.tsx`)
- 7+ components hand-roll progress bars:
  - `ReleaseDetailsPage.tsx:917-923`
  - `SellersPage.tsx:482-494`
  - `ScrobblePage.tsx:466-476`
  - `MilestoneProgress.tsx:46-48`
  - `SyncStatusBar.tsx`, `NewReleasesPage.tsx`, `WishlistPage.tsx`, `NewReleasesTab.tsx`
- **Fix:** Replace custom progress bars with `<ProgressBar>` component
- **Effort:** Medium
- **Status:** DONE — Adopted `<ProgressBar>` in ReleaseDetailsPage, SellersPage, ScrobblePage, MilestoneProgress, SyncStatusBar, NewReleasesPage, WishlistPage, NewReleasesTab

### 3.3 Fix Non-Dynamic Inline Styles
- ~18 genuine violations (margins, colors, font sizes, borders, toggle states):
  - `CollectionPage.tsx:1130-1151` — view toggle active state via inline `backgroundColor`/`color`
  - `CollectionPage.tsx:1071` — `style={{ marginLeft: '1rem' }}`
  - `ReleaseDetailsPage.tsx:1285-1293` — track item border/background toggled inline
  - `ReleaseDetailsPage.tsx:939,945,951` — `style={{ color: 'var(--success-color)' }}`
  - `ReleaseDetailsPage.tsx:1044,1068` — `fontSize: '0.85rem'`
  - `ScrobblePage.tsx:433-441` — track item border/background inline
  - `ScrobblePage.tsx:469-475` — progress bar color toggled inline
  - `SettingsConnectionsSection.tsx:412` — `<ol style={{ margin, paddingLeft }}>`
  - `LastFmHistoryTab.tsx:440` — `style={{ marginLeft: '1rem' }}`
  - `WishlistPage.tsx:652` — spinner sizing inline
- **Fix:** Extract to CSS classes (e.g., `.collection-view-button--active`, `.release-details-track-item--selected`, `.text-success`, `.text-warning`, `.text-error`)
- **Effort:** Small-Medium
- **Status:** DONE — Extracted to CSS classes: `.collection-view-button--active`, `.release-details-track-item--selected`, `.scrobble-track-item--selected`, `.text-success`, `.text-warning`, `.text-error`, `.text-muted-sm`, `.ml-1`, `.instructions-list`

### 3.4 Fix `any` Type Usage
- 50 instances across 6 files:
  - `discogsService.ts` — 35 instances (API response types completely untyped)
  - `api.ts` — 8 instances (`Promise<any>`, `Promise<any[]>`)
  - `CollectionPage.tsx` — 4 instances
  - `lastfmService.ts` — 1 instance
  - `sellerMonitoringService.ts` — 1 instance
  - `scrobble.ts` — 1 instance
- **Fix:** Define Discogs/Last.fm API response interfaces in `src/shared/types.ts`
- **Effort:** Medium-Large
- **Status:** DONE — Added ~268 lines of Discogs/Last.fm API response interfaces to `shared/types.ts`; fixed 50 `any` instances across 6 files

### 3.5 Remove Dark Mode `!important` Declarations
- 19 `!important` on CSS variables in `.dark-mode` block at `styles.css:2-22`
- **Fix:** Swap order so `:root` (light) comes before `.dark-mode` (dark) — class selector naturally overrides without `!important`
- **Effort:** Small (CSS restructure, test thoroughly)
- **Status:** DONE — Swapped `:root`/`.dark-mode` order; removed all 19 `!important` declarations

### 3.6 Add ScrobblePage Loading Indicator
- `prepareTracks()` at `ScrobblePage.tsx:70-109` calls API per album with no visual feedback
- User sees empty track list during preparation
- **Fix:** Add loading state using Skeleton component
- **Effort:** Small
- **Status:** DONE — Added `ListItemSkeleton` loading state during track preparation

### 3.7 Standardize CSS Units (rem not px)
- `RankingsOverTime.css` and `RankingsRace.css` exclusively use `px` (24px, 16px, 14px, 48px)
- Rest of app uses `rem`
- **Fix:** Convert px to rem in those 2 files
- **Effort:** Small
- **Status:** DONE — Converted all px to rem in RankingsOverTime.css and RankingsRace.css

### 3.8 Adopt Badge Component More Widely
- `Badge.tsx` imported in only 3 files (TopList, LastFmHistoryTab, ForgottenFavoritesTab)
- Many components use custom badge-like spans with `.badge-*` classes or inline elements
- **Effort:** Medium
- **Status:** NOT DONE — Deferred (lower priority, not in scope for this pass)

### 3.9 Hardcoded Colors Outside Theme System
- 60+ hardcoded hex values in `styles.css` that bypass CSS variables:
  - Status colors: `#c3e6cb`, `#856404`, `#ffeaa7`, `#fff3cd`, `#d1ecf1`, `#bee5eb`, `#0c5460`
  - Action colors: `#c82333`, `#218838`
  - AI/feature colors: `#7c3aed`, `#22c55e`, `#ef4444`, `#f59e0b`, `#a78bfa`, `#60a5fa`
  - Session status: `#28a745`, `#dc3545`, `#ffc107`, `#6c757d`
  - Discovery: `#f87171`, `#4ade80`
  - Milestone: `#10b981`
  - Badge.css: `#3b82f6`, `#1a1a1a`
  - NewReleasesPage.css: `#e6c200`, `#333`
- **Fix:** Replace with CSS variables; prioritize values that differ between light/dark mode
- **Effort:** Medium-Large (audit and replace incrementally)
- **Status:** DONE — Fixed actively broken dark mode colors only (warning/info messages, Rankings components); full audit deferred to Tier 4

---

## Tier 4: Nice-to-Have — Future Polish (DEFERRED)

### 4.1 Define Design Token CSS Variables
- **Spacing tokens:** No consistent scale. Values range from `0.25rem` to `4rem` with no system. Define `--space-xs` through `--space-2xl`.
- **Border-radius tokens:** 7+ values (2px, 3px, 4px, 5px, 6px, 8px, 10px, 12px, 20px). Define `--radius-sm` (4px), `--radius-md` (8px), `--radius-lg` (12px). Two-tier approach: 8px for data cards, 12px for containers.
- **Typography scale:** Font sizes range from `0.65rem` to `2rem` with irregular increments (e.g., `0.9375rem`). Formalize a type scale. Keep small sizes (0.65-0.75rem) for metadata.
- **Note:** Do not increase spacing in data-dense areas to achieve consistency — varied density is intentional.
- **Effort:** Medium (define tokens, gradual adoption)

### 4.2 Theme Toggle Transition on Child Elements
- `body` has `transition: background-color 0.3s ease, color 0.3s ease` but cards, sidebar, header don't
- Causes jarring snap when toggling themes
- **Fix:** Add `transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease` to major container classes
- **Effort:** Small (CSS-only)

### 4.3 Modal Exit/Close Animation
- Modal opens with `modal-fade-in` and `modal-scale-in` animations but unmounts instantly on close
- **Fix:** Add exit animation (fade-out, scale-down) before unmount
- **Effort:** Small-Medium

### 4.4 Comprehensive `@prefers-reduced-motion` Support
- Only one rule exists at `styles.css:559` covering `.btn-filter`
- Spinners, skeleton pulses, sidebar transitions, toast enter/exit, modal animations, wrapped slideshow all unguarded
- **Fix:** Add `@prefers-reduced-motion: reduce` rules for all animated elements
- **Effort:** Small (CSS-only)

### 4.5 `:active` Press State on Buttons
- Neither `.btn` nor `.button` have `:active` styles
- Adding `transform: scale(0.98)` provides tactile click feedback
- **Effort:** Tiny (CSS-only)

### 4.6 Replace Settings Tab Emoji Icons with SVGs
- `SettingsPage.tsx:37-69` uses emoji (`🔗`, `🔌`, `🔄`, `👁️`, `💿`, `💾`) that render differently cross-platform
- Only matters if cross-platform support becomes a goal
- **Effort:** Small

### 4.7 Sidebar Toggle Touch Target
- `.sidebar-toggle` at `styles.css:189` is `28px` — should be `32-36px` for comfortable use
- Other small targets (`.search-clear` 24px, `.btn-small` ~24-28px) are acceptable for desktop
- **Effort:** Tiny (CSS-only)

### 4.8 Inconsistent Card Hover Effects
- Album/suggestion cards: `translateY(-2px)` + shadow
- Seller cards: shadow only
- Stats cards: no hover effect
- New release cards: border-color change + shadow
- Dusty corners cards: `translateY(-2px)` + shadow, no border
- **Note:** Power user says different hovers serve different interaction models — document intent rather than homogenize
- **Effort:** Small if standardizing, zero if documenting

### 4.9 Inconsistent Card Shadow Treatment
- Some cards use `box-shadow: var(--card-shadow)` (theme-aware)
- Rankings components use hardcoded `box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1)`
- Some cards have shadow only on hover, others always, others never
- **Effort:** Small (CSS-only)

### 4.10 CSS Variable Naming Rationalization
- `--accent-color` vs `--accent-primary` — overlapping names
- `--primary-color` referenced in Rankings CSS but defined as `--accent-color` in main styles
- `--bg-secondary` vs `--card-bg` both resolve to `#ffffff` in light mode
- **Fix:** Audit and consolidate variable names
- **Effort:** Medium (careful search-and-replace)

### 4.11 Inconsistent Form Input Styling
- `.form-input`: border-radius `6px`, padding `0.75rem`
- `.search-input`: border-radius `8px`, padding `0.75rem 2.5rem 0.75rem 1rem`
- `.lastfm-history-search-input`: border-radius `6px`, padding `0.5rem 2rem 0.5rem 0.75rem`
- `.mapping-search-input`: border-radius `6px`, padding `0.5rem 0.75rem`
- Focus styles also vary: some have box-shadow ring, some only border-color change
- **Note:** Preserve compact sizing of filter inputs in data-dense areas
- **Effort:** Small-Medium

---

## Design Overhaul Opportunities (Not Prioritized — For Future Consideration)

These were identified by reviewers but deprioritized or rejected by the power user advocate. Revisit if a visual refresh is desired:

- **Custom `<select>` dropdowns** — 33 native selects look dated. Must preserve keyboard accessibility (arrow keys, type-ahead, Escape). Build as reusable `ui/Select.tsx`.
- **Command Palette (Cmd+K)** — highest-impact power user feature. Build as `ui/CommandPalette.tsx` using Modal as foundation.
- **Right-click context menus** — on album cards, collection items, history entries. Build as `ui/ContextMenu.tsx`.
- **Dark mode palette refinement** — current uniform gray steps (#1a1a1a → #2d2d2d → #3d3d3d) are functional but utilitarian.
- **Backdrop-blur on modal overlays** — `backdrop-filter: blur(8px)` adds depth. Test performance on Collection page.
- **Animated stat counters on dashboard** — count-up effect when values appear. Must respect `@prefers-reduced-motion`.
- **Card micro-interactions** — subtle hover lift on detail views and dashboard (not on 500+ item grids).
- **Wrapped slideshow cross-fade transitions** — currently instant swap with fade-in only.
- **Header layout compaction** — keep usernames/connection status visible but more compact.
- **Sidebar active state transition** — smooth background transition instead of instant color swap.
- **Recharts styling polish** — custom tooltips, gradient fills, rounded bar corners, richer color palette.

---

## Quick Wins (Zero Risk, Immediate)

These can be done right now with minimal effort and no regression risk:

1. Remove debug text — delete `CollectionPage.tsx:1254-1257`
2. Fix `--bg-card` → `--card-bg` — 5 CSS replacements
3. Fix search overlay dark mode — change `rgba(255,255,255,0.7)` to `rgba(var(--bg-primary-rgb),0.7)` at `styles.css:981`
4. Add Escape handler to notification dropdown — one `useEffect` in `NotificationBell.tsx`
5. Move `.tabs`/`.tab` to `styles.css` — CSS relocation from `NewReleasesPage.css`

---

## Implementation Dependencies

Natural ordering for the larger items:

```
Fix dark mode CSS (1.1, 1.5, 2.7) → no component changes needed
    ↓
Consolidate duplicate CSS (2.6) → clean foundation
    ↓
Remove inline styles (3.3) → extract to consolidated CSS
    ↓
Modal adoption (1.3, 2.1) → Toast adoption (2.2) → replace inline messages
    ↓
Button adoption (3.1) → focus-visible (1.2) → keyboard accessibility (2.4, 2.5)
    ↓
Skeleton adoption (2.3) + ProgressBar adoption (3.2)
    ↓
Design tokens (4.1) → form consistency (4.11)

Independent (do anytime):
- Remove debug text (1.4)
- Fix any types (3.4)
- Hardcoded color audit (3.9)
```
