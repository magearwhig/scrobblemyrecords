# Technical Debt & Improvements

Consolidated from multiple audits (January–February 2026). Items completed in earlier cycles are archived at the bottom for historical reference.

---

## Priority Legend

| Priority | Meaning |
|----------|---------|
| **Critical** | Violates stated project policy or causes data loss risk -- fix immediately |
| **High** | Causes runtime failures, security gaps, or major maintenance burden |
| **Medium** | Degrades quality, performance, or developer experience |
| **Low** | Cleanup, polish, or minor inconsistency |

---

## CRITICAL

### C1. Test coverage thresholds (48–60%) vs stated 90% baseline

**Severity**: Critical | **Effort**: Deeper (ongoing) | **Quick Win**: No (documenting the gap is)

README and `dev_prompt.md` specify 90% coverage target but Jest config enforces only 48–60%. This is a known gap being addressed incrementally.

**Current State:**
- `jest.config.js` thresholds: branches 48%, functions 55%, lines/statements 60%
- Target: 90%
- `hiddenItemService.ts` and `trackMappingService.ts` have no dedicated test files

**Improvement Plan:**
1. Current baseline prevents regression
2. Raise thresholds in 5–10% increments as tests are added
3. Do NOT change `jest.config.js` until tests exist to support higher thresholds

**Action:**
- [ ] Write tests for services with low coverage: `wishlistService`, `imageService`, `hiddenItemService`, `trackMappingService`
- [ ] Prioritize coverage for critical paths: `authService`, `lastfmService`, `discogsService`, scrobble routes
- [ ] After coverage improves, raise `jest.config.js` thresholds incrementally
- [ ] Add coverage report to CI output for visibility
- [ ] Consider separate thresholds for backend vs frontend

**Files:** `jest.config.js`, `README.md`, `dev_prompt.md`

---

## HIGH

### ~~H1. No React Error Boundary~~ DONE

**Completed:** February 2026. Created `ErrorBoundary` class component in `src/renderer/components/ErrorBoundary.tsx` wrapping `<MainContent>` in `App.tsx`. Shows "Something went wrong" UI with "Try Again" and "Reload Page" buttons. Logs errors via secure logger.

---

### ~~H2. Empty-string fallbacks for API secrets~~ DONE

**Completed:** February 2026. Added centralized `validateRequiredEnvVars()` in `src/server.ts` that runs before any service initialization. Validates ENCRYPTION_KEY, DISCOGS_CLIENT_ID, DISCOGS_CLIENT_SECRET, LASTFM_API_KEY, and LASTFM_SECRET. Throws with actionable message referencing `.env.example`.

---

### ~~H3. Lock file TOCTOU race condition~~ DONE

**Completed:** February 2026. Replaced `existsSync` + `writeFileSync` with `writeFileSync({ flag: 'wx' })` for atomic lock file creation. Stale lock cleanup retained as fallback.

---

### H4. Massive inline styling + monolithic stylesheet

**Severity**: High | **Effort**: Deeper (phased)

The repo's `CLAUDE.md` and `.cursor/rules` explicitly forbid inline styles, yet every major page uses them. Combined with a single `styles.css`, CSS maintenance is fragile.

Worst offenders by inline `style=` count:
- `ReleaseDetailsPage.tsx` -- 100+
- `CollectionPage.tsx` -- 80+
- `ScrobblePage.tsx` -- 40+
- `HistoryPage.tsx` -- 28+
- `SearchBar.tsx`, `AlbumCard.tsx` -- 15+

**Action:**
- [ ] Phase 1: Extract static inline styles to CSS classes (start with `AlbumCard`, `SearchBar`)
- [ ] Phase 2: Split `styles.css` into CSS modules per component/page
- [ ] Or adopt CSS modules globally
- [ ] Document exceptions (dynamic values only)

**Files:** `src/renderer/styles.css`, all page/component files listed above

---

### H5. Background operations fail silently

**Severity**: High | **Effort**: Deeper

Routes kick off background sync/scrobble operations with `.catch()` that only logs. Users never learn if their operation failed.

```ts
scrobbleHistorySyncService
  .startIncrementalSync()
  .catch(err => console.error('Failed to auto-sync after scrobble:', err));
```

**Action:**
- [ ] Implement lightweight job-status mechanism (in-memory map of `jobId -> {status, error}`)
- [ ] Let the frontend poll for completion
- [ ] Pairs well with M10 (toast system)

**Files:** `src/backend/routes/scrobble.ts`, `src/backend/routes/suggestions.ts`

---

### H6. Missing request size limits and rate limiting on API

**Severity**: High | **Effort**: Quick win (size limit) / Medium (rate limiting)

No server-side rate limiting.

**Action:**
- [x] ~~Add `express.json({ limit: '1mb' })`~~ DONE February 2026
- [ ] Add `express-rate-limit` middleware for API routes
- [ ] Longer-term: validate request schemas with Zod or Joi

**Files:** `src/server.ts`

---

## MEDIUM

### ~~M1. Direct `console.*` bypasses secure logger (24 files)~~ DONE

**Completed:** February 2026. Migrated all 20 frontend files (11 pages, 7 components, 1 hook, 1 tab) plus 2 backend files to use `createLogger()`. Added ESLint `no-console: error` rule for backend with exception for logger utility files. Zero `console.*` calls remain outside of `logger.ts` files.

---

### M2. CryptoJS (deprecated) used for encryption

**Severity**: Medium | **Effort**: Deeper

CryptoJS is unmaintained. `authService.ts` already imports Node.js native `crypto` but uses CryptoJS for AES.

**Action:**
- [ ] Migrate to `crypto.createCipheriv`/`createDecipheriv` with AES-256-GCM
- [ ] Migration path: decrypt existing tokens with CryptoJS, re-encrypt with native

**Files:** `src/backend/services/authService.ts`

---

### ~~M3. Startup migrations not awaited before accepting requests~~ DONE

**Completed:** February 2026. Changed `startServer()` to `await` migrations before `app.listen()`. Cleanup and backup remain fire-and-forget.

---

### ~~M4. Unguarded `JSON.parse` calls~~ DONE

**Completed:** February 2026. Created `src/shared/utils/safeJsonParse.ts` with typed `JsonParseResult<T>` union type. Applied to OAuth token parsing in `discogsService.ts` and `sellerMonitoringService.ts`.

---

### M5. Standardize API error responses

**Severity**: Medium | **Effort**: Low

Some endpoints return `{success: false, error}`, others throw. This creates frontend edge cases.

**Action:**
- [ ] Audit all API endpoints for response shape consistency
- [ ] Create standard error response helper
- [ ] Update frontend error handling to match

**Files:** `src/backend/routes/*.ts`

---

### M6. `fireEvent` vs `userEvent` test inconsistency

**Severity**: Medium | **Effort**: Medium (mechanical, 20 files)

`TEST_STYLE_GUIDE.md` mandates `userEvent.setup()`, but 20 test files still use `fireEvent` (~194 instances) while only 8 use `userEvent` (~76 instances).

**Worst offenders:** `ReleaseDetailsPage.test.tsx` (39), `DiscoveryPage.test.tsx` (26), `SettingsConnectionsSection.test.tsx` (18), `DateRangePicker.test.tsx` (16), `SuggestionCard.test.tsx` (13), and 15 more.

**Action:**
- [ ] Migrate remaining `fireEvent` calls to `userEvent.setup()` per the style guide

---

### M7. Accessibility gaps on form controls and buttons

**Severity**: Medium | **Effort**: Quick win per component

Icon-only buttons lack `aria-label`; inputs lack explicit labels. Screen readers can't identify them.

**Action:**
- [ ] Add `aria-label` to all icon-only buttons and form inputs without visible labels
- [ ] Ensure keyboard focus states

**Files:** `SearchBar.tsx`, `Header.tsx`, various action buttons

---

### M8. E2E tests not run in CI

**Severity**: Medium | **Effort**: Medium

Four Playwright specs exist but CI only runs Jest. Integration regressions ship uncaught.

**Action:**
- [ ] Add Playwright CI job with `npx playwright install --with-deps` and `npm run test:e2e`

**Files:** `.github/workflows/ci.yml`

---

### M9. No virtualization for large lists

**Severity**: Medium | **Effort**: Deeper (UI refactor)

Collection pages render all items in the DOM. Users with 1000+ records experience sluggish scrolling and high memory usage.

**Action:**
- [ ] Implement `react-window` or `@tanstack/virtual` for collection grid
- [ ] Only render visible items
- [ ] Maintain scroll position on navigation

**Files:** `src/renderer/pages/CollectionPage.tsx`

---

### M10. No toast notification system

**Severity**: Medium | **Effort**: Deeper (high UX payoff)

Users miss action outcomes. Errors and confirmations are only in console or require modal dialogs.

**Action:**
- [ ] Implement toast notification component (e.g., `react-hot-toast` or custom)
- [ ] Add auto-dismiss with configurable duration
- [ ] Support action buttons ("Undo", "View Details")
- [ ] Position in corner, non-blocking

---

### ~~M11. No `React.memo` on any list-item component~~ DONE

**Completed:** February 2026. Wrapped `AlbumCard`, `SuggestionCard`, `AISuggestionCard`, and `NewReleaseCard` with `React.memo`.

---

### ~~M12. Seller monitoring service lacks rate limiting~~ DONE

**Completed:** February 2026. Extracted shared singleton Axios instance with global 1 req/sec rate limiting into `src/backend/utils/discogsAxios.ts`. All three Discogs-calling services now use `getDiscogsAxios()` instead of creating separate instances.

---

### M13. Fixed 10s timeout + unconditional 1s delay on all API requests

**Severity**: Medium | **Effort**: Medium

Collection sync of 500 records takes minimum 500 seconds due to mandatory 1-second sleep on every request. Batch operations can also exceed the 10-second timeout.

**Action:**
- [ ] Implement token-bucket rate limiter that only sleeps when requests are too frequent
- [ ] Use configurable timeouts (10s for lookups, 30–60s for batch ops)

**Files:** `src/backend/services/discogsService.ts` (lines 47, 54–57)

---

### ~~M14. `decrypt()` returns empty string on failure~~ DONE

**Completed:** February 2026. Created `DecryptionError` class in `authService.ts`. `decrypt()` now throws `DecryptionError` instead of returning empty string, with validation in `getUserSettings()` to detect and block credential loss from key changes.

---

### ~~M15. `data/` directory not auto-created for new users~~ DONE

**Completed:** February 2026. Added synchronous `fs.mkdirSync('data', { recursive: true })` early in `src/server.ts` before any service initialization or lock file access.

---

### ~~M16. README architecture section is out of date~~ DONE

**Completed:** February 2026. Regenerated full directory tree from actual filesystem. Removed SetupPage.tsx reference, added all missing pages, services, and component subdirectories.

---

### M17. No contributor development guide

**Severity**: Medium | **Effort**: Medium

Contributing section is 6 lines. No architecture decisions, no "how to add a route," no test patterns documented.

**Action:**
- [ ] Create `CONTRIBUTING.md` with architecture overview, coding patterns, and testing guide
- [ ] Reference existing `TEST_STYLE_GUIDE.md`

---

### M18. Documentation gaps: security docs and internal guides gitignored

**Severity**: Medium | **Effort**: Quick win

GitHub users don't see security guidance or testing guides. Several docs are gitignored.

**Action:**
- [ ] Create public, sanitized versions of security notes and testing guide
- [ ] Keep sensitive/internal analysis private

**Files:** `.gitignore` (lines 146–153)

---

### M19. Component extraction -- Level 3 & 4

**Severity**: Medium | **Effort**: Medium

Large inline JSX blocks in page files that should be their own components. Level 1 (Button, Badge, ProgressBar) and Level 2 (Modal) are complete.

**Level 3 -- Feature-specific cards:**
- [ ] `DiscoveryItemCard` from `DiscoveryPage.tsx` (~100+ lines per card type)
- [ ] `WishlistItemCard` from `WishlistPage.tsx` (~130 lines)
- [ ] `ReleaseCard` from `NewReleasesPage.tsx` (~115 lines)
- [ ] `SellerCard` & `MatchCard` from `SellersPage.tsx` / `SellerMatchesPage.tsx`
- [ ] `ScrobbleSessionCard` from `HistoryPage.tsx` (~230 lines)

**Level 4 -- Complex logic blocks:**
- [ ] `CollectionFilterControls` from `CollectionPage.tsx` (~150 lines)
- [ ] `CacheStatusIndicator` from `CollectionPage.tsx` (~185 lines)

---

## LOW

### ~~L1. License metadata mismatch~~ DONE

**Completed:** February 2026. Updated `package.json` license from ISC to MIT.

---

### L2. Legacy endpoints likely unused

**Effort**: Quick win after validation

Legacy endpoints remain in `auth.ts`: `POST /discogs/token` and `POST /lastfm/callback`.

**Action:**
- [ ] Confirm whether frontend uses these; if not, deprecate and remove

**Files:** `src/backend/routes/auth.ts` (lines 121–129, 261–269)

---

### L3. Security audit doesn't fail CI

**Effort**: Quick win

`npm audit` logs vulnerabilities but doesn't fail the build.

**Action:**
- [ ] Make `npm audit --audit-level=moderate` fail on findings

**Files:** `.github/workflows/ci.yml` (line 110)

---

### L4. Remaining `useState<any>` -- 3 untyped state variables

**Effort**: Quick win

Reduced from 52→22 in January 2026, but 3 `useState<any>` remain.

**Action:**
- [ ] Define proper TypeScript interfaces for:
  - `ReleaseDetailsPage.tsx:45` (`connectionTest`)
  - `CollectionPage.tsx:37` (`cacheProgress`)
  - `ScrobblePage.tsx:23` (`results`)
- [ ] Enable stricter TypeScript checks

---

### ~~L5. No Node.js version enforcement~~ DONE

**Completed:** February 2026. Added `engines.node >= 18.0.0` to `package.json` and `.nvmrc` file.

---

### L6. Configuration drift: deprecated `PORT` + `HOST=0.0.0.0` risk

**Effort**: Quick win

`.env.example` documents `HOST=0.0.0.0` without security warnings. Deprecated `PORT` var still supported.

**Action:**
- [ ] Add explicit security warning in README about non-localhost binding
- [ ] Consider logging deprecation notice at startup for `PORT`

**Files:** `.env.example`, `src/server.ts` (lines 112–116)

---

### ~~L7. Unused dependency: `wait-on`~~ DONE

**Completed:** February 2026. Removed unused `wait-on` from devDependencies.

---

### L8. CI doesn't test Node 22 (current LTS)

**Effort**: Quick win

CI matrix tests Node 18.x and 20.x but not the current LTS.

**Action:**
- [ ] Add `22.x` to CI matrix

**Files:** `.github/workflows/ci.yml`

---

### L9. No request logging middleware / observability

**Effort**: Quick win (morgan) / Medium (structured logging)

No HTTP request/response logging. Debugging API issues requires manually adding log statements.

**Action:**
- [ ] Add `morgan` for dev-mode request logging
- [ ] Consider structured JSON logging with `pino` longer-term

**Files:** `src/server.ts`

---

### L10. No focus trap in modals + possibly dead state

**Effort**: Quick win

Tab key escapes modals. `connectionTest` state in `ReleaseDetailsPage.tsx` may be unused.

**Action:**
- [ ] Add `focus-trap-react` to `Modal.tsx`
- [ ] Verify and remove `connectionTest` state if unused

---

### L11. Centralize route identifiers

**Effort**: Low

String literals for routing in `App.tsx`, `MainContent.tsx`, and `Sidebar.tsx` can drift out of sync.

**Action:**
- [ ] Create `routes.ts` constants file
- [ ] Replace string literals with constants

**Files:** `src/renderer/App.tsx`, `MainContent.tsx`, `Sidebar.tsx`

---

### L12. Sidebar reorganization

**Effort**: Low

Current flat list of nav items lacks visual hierarchy.

**Action:**
- [ ] Group into sections: Library / Insights / Marketplace / Settings
- [ ] Add section headers or dividers
- [ ] Make disabled items explain why (tooltip: "Connect Discogs first")

**Files:** `src/renderer/components/Sidebar.tsx`

---

## FUTURE ENHANCEMENTS (P3 -- nice to have)

| Feature | Effort | Notes |
|---------|--------|-------|
| Keyboard shortcuts (/, Esc, arrows) | Low | Power user productivity |
| Advanced filtering (year, format, genre, rating) | Medium | Filter chips and saved presets |
| Command palette (Cmd+K) | Medium | Fuzzy search across pages/actions/albums |
| Theme variants | Low | Warm/vinyl-inspired, custom accent picker |
| Playlist/Queue system | High | Build listening queue, batch scrobble |
| Export capabilities | Medium | CSV/JSON for collection, stats, history |
| Onboarding wizard | High | Guided first-run setup flow |
| Quick actions on home | Low | Sync, Scrobble, Suggestions buttons |

---

## Summary Table

| # | Finding | Severity | Quick Win? |
|---|---------|----------|------------|
| C1 | Coverage thresholds (48–60%) vs 90% target | **Critical** | No |
| H1 | No React Error Boundary | **High** | Yes |
| H2 | Empty-string fallbacks for API secrets | **High** | Yes |
| H3 | Lock file TOCTOU race condition | **High** | Yes |
| H4 | Massive inline styling + monolithic stylesheet | **High** | No |
| H5 | Background operations fail silently | **High** | No |
| H6 | Missing request size limits and rate limiting | **High** | Partial |
| M1 | ~~Direct console.* bypasses secure logger (24 files)~~ | ~~Medium~~ | ~~DONE~~ |
| M2 | CryptoJS deprecated library | Medium | No |
| M3 | ~~Startup migrations not awaited~~ | ~~Medium~~ | ~~DONE~~ |
| M4 | ~~Unguarded JSON.parse calls~~ | ~~Medium~~ | ~~DONE~~ |
| M5 | Standardize API error responses | Medium | Low |
| M6 | fireEvent vs userEvent test inconsistency | Medium | Partial |
| M7 | Accessibility gaps on form controls/buttons | Medium | Yes |
| M8 | E2E tests not in CI | Medium | Medium |
| M9 | No virtualization for large lists | Medium | No |
| M10 | No toast notification system | Medium | No |
| M11 | ~~No React.memo on list components~~ | ~~Medium~~ | ~~DONE~~ |
| M12 | ~~Seller monitoring lacks rate limiting~~ | ~~Medium~~ | ~~DONE~~ |
| M13 | Fixed 10s timeout + unconditional 1s delay | Medium | Medium |
| M14 | ~~decrypt() returns empty string on failure~~ | ~~Medium~~ | ~~DONE~~ |
| M15 | data/ directory not auto-created | Medium | Yes |
| M16 | README architecture out of date | Medium | Yes |
| M17 | No contributor development guide | Medium | Medium |
| M18 | Documentation gaps (gitignored docs) | Medium | Yes |
| M19 | Component extraction Level 3 & 4 | Medium | No |
| L1 | License metadata mismatch (ISC vs MIT) | Low | Yes |
| L2 | Legacy auth endpoints likely unused | Low | Yes |
| L3 | Security audit doesn't fail CI | Low | Yes |
| L4 | Remaining useState\<any\> (3 left) | Low | Yes |
| L5 | No Node.js version enforcement | Low | Yes |
| L6 | Config drift: deprecated PORT + HOST risk | Low | Yes |
| L7 | Unused dependency: wait-on | Low | Yes |
| L8 | CI doesn't test Node 22 | Low | Yes |
| L9 | No request logging / observability | Low | Quick+ |
| L10 | No focus trap in modals + dead state | Low | Yes |
| L11 | Centralize route identifiers | Low | Yes |
| L12 | Sidebar reorganization | Low | No |

**Total open**: 22 items (1 critical, 3 high, 9 medium, 9 low) -- 16 completed (10 Phase 0 + 6 Phase 1, February 2026)

---

## Prioritized Action Plan

### Phase 0 -- Immediate Quick Wins -- COMPLETE (February 2026)

All 10 items completed: H1, H3, H2, H6 (size limit), M15, L1, L5, M1 (ESLint + backend migration), L7, M16.

### Phase 1 -- High-Impact Medium Work (1–2 weeks)

| # | Action | Findings |
|---|--------|----------|
| 1 | Replace all `console.*` with logger (24 files) | M1 |
| 2 | Add `express-rate-limit` middleware | H6 |
| 3 | Add Playwright to CI workflow | M8 |
| ~~4~~ | ~~Add `React.memo` to list-item components~~ | ~~M11~~ DONE |
| ~~5~~ | ~~Create `safeJsonParse<T>()` utility~~ | ~~M4~~ DONE |
| ~~6~~ | ~~Await migrations before `app.listen()`~~ | ~~M3~~ DONE |
| ~~7~~ | ~~Throw `DecryptionError` instead of returning `''`~~ | ~~M14~~ DONE |
| 8 | Add `aria-label` to all icon-only buttons/inputs | M7 |
| ~~9~~ | ~~Share rate-limited Axios instance with seller service~~ | ~~M12~~ DONE |
| 10 | Publish sanitized security + testing guides | M17, M18 |

### Phase 2 -- Systematic Refactors (2–4 weeks)

| # | Action | Findings |
|---|--------|----------|
| 1 | Inline styles to CSS modules (start with list components) | H4 |
| 2 | Split `styles.css` into per-component modules | H4 |
| 3 | Migrate `fireEvent` to `userEvent` in 20 test files | M6 |
| 4 | Add test coverage for untested services + raise thresholds | C1 |
| 5 | Implement token-bucket rate limiter for Discogs | M13 |
| 6 | Migrate CryptoJS to native `crypto` | M2 |
| 7 | Standardize API error responses | M5 |

### Phase 3 -- Strategic Improvements (ongoing)

| # | Action | Findings |
|---|--------|----------|
| 1 | Add `react-window` virtualization to collection grid | M9 |
| 2 | Implement toast notification system | M10 |
| 3 | Add background job status tracking | H5 |
| 4 | Component extraction Level 3 & 4 | M19 |
| 5 | Remove legacy auth endpoints after verification | L2 |
| 6 | Add structured logging + request metrics | L9 |
| 7 | Continue raising coverage toward 90% | C1 |

---

## Completed Items Archive

Items completed in previous cycles, kept for historical reference.

### ✅ Settings Page Restructure (January 2026)

Restructured into 4 tabs with modular section components: Integrations, Mappings, Filters, Wishlist. Badge counts on tabs, visual separation with cards and section headers.

**Files:** `src/renderer/pages/SettingsPage.tsx`, `src/renderer/components/settings/*`

---

### ✅ Logger Utility Created (January 2026)

Created `src/renderer/utils/logger.ts` matching backend pattern with sensitive-data redaction. Removed token exposure from `SetupPage.tsx`. Replaced `console.*` in `api.ts`, `MainContent.tsx`, `ThemeContext.tsx`, `server.ts`, `fileStorage.ts`. Environment-based log level filtering.

**Note:** Logger exists but adoption is incomplete -- 24 files still use `console.*` (see M1).

---

### ✅ Missing/Duplicate CSS Fixed (January 2026)

Defined `--text-tertiary` in `:root` and `.dark-mode`. Removed duplicate `.sync-status-bar` class. Added `--bg-primary-rgb` for rgba usage.

---

### ✅ UI Primitives -- Level 1 & 2 (January 2026)

Created reusable components: `Button`, `Badge`, `ProgressBar`, `Skeleton`, `EmptyState`, `Modal`. Refactored 4 page modals to use shared Modal component.

**Files:** `src/renderer/components/ui/Button.tsx`, `Badge.tsx`, `ProgressBar.tsx`, `Skeleton.tsx`, `EmptyState.tsx`, `Modal.tsx`

---

### ✅ Loading Skeletons (January 2026)

Created Skeleton component with variants for album cards, stat cards, and lists.

---

### ✅ Collapsible Sidebar (January 2026)

Added toggle to collapse to icons-only mode with localStorage persistence.

---

### ✅ Better Empty States (January 2026)

Created EmptyState component with illustrations and call-to-action buttons.

---

### ✅ `any` Type Reduction (January 2026)

Reduced from 52 to 22 instances (~58%). Added `CollectionNote` interface. 3 `useState<any>` remain (see L4).
