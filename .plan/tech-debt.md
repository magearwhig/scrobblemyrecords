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

### ~~H4. Massive inline styling + monolithic stylesheet~~ DONE

**Completed:** February 2026. Extracted 236 static inline styles to CSS classes across 12 files in 3 batches:
- Batch 1: AlbumCard (8), SearchBar (6) — 14 extracted
- Batch 2: SettingsConnectionsSection (8), AlbumScrobbleHistory (5), Header (3), RankingsRace (1), HistoryPage (26) — 41 extracted (+ 2 components had no extractable styles)
- Batch 3: ScrobblePage (34), CollectionPage (64), ReleaseDetailsPage (82) — 181 extracted

Total reduction: 275 → 39 inline styles (86%). All 39 remaining are dynamic (computed widths, conditional colors, backgroundImage URLs) that must stay inline. Hardcoded colors replaced with CSS variables. All new CSS classes appended to `styles.css` with component-specific prefixes. Phase 2 (CSS module splitting) deferred as separate work.

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

### ~~H6. Missing request size limits and rate limiting on API~~ DONE

**Completed:** February 2026. Added `express.json({ limit: '1mb' })` for body size limits and `express-rate-limit` middleware (300 req/15min per IP) on all `/api/` routes. Schema validation (Zod/Joi) deferred to future work.

---

## MEDIUM

### ~~M1. Direct `console.*` bypasses secure logger (24 files)~~ DONE

**Completed:** February 2026. Migrated all 20 frontend files (11 pages, 7 components, 1 hook, 1 tab) plus 2 backend files to use `createLogger()`. Added ESLint `no-console: error` rule for backend with exception for logger utility files. Zero `console.*` calls remain outside of `logger.ts` files.

---

### ~~M2. CryptoJS (deprecated) used for encryption~~ DONE

**Completed:** February 2026. Replaced CryptoJS with native Node.js `crypto` module. New encryption uses AES-256-GCM with scrypt key derivation. Legacy CryptoJS format (EVP_BytesToKey + AES-256-CBC) auto-detected and decrypted for backward compatibility. Removed `crypto-js` and `@types/crypto-js` dependencies.

---

### ~~M3. Startup migrations not awaited before accepting requests~~ DONE

**Completed:** February 2026. Changed `startServer()` to `await` migrations before `app.listen()`. Cleanup and backup remain fire-and-forget.

---

### ~~M4. Unguarded `JSON.parse` calls~~ DONE

**Completed:** February 2026. Created `src/shared/utils/safeJsonParse.ts` with typed `JsonParseResult<T>` union type. Applied to OAuth token parsing in `discogsService.ts` and `sellerMonitoringService.ts`.

---

### ~~M5. Standardize API error responses~~ DONE

**Completed:** February 2026. Audited all 12 route files -- found 98% consistency already using `{ success: false, error }` pattern. Created `sendError()` and `sendSuccess()` helpers in `src/backend/utils/apiResponse.ts`. Applied to global error handler, 404, and JSON parse error handlers in `server.ts`. Existing routes are consistent; helpers prevent future drift.

---

### ~~M6. `fireEvent` vs `userEvent` test inconsistency~~ DONE

**Completed:** February 2026. Migrated ~220 `fireEvent` calls across 19 test files to `userEvent.setup()` pattern. Each file now uses `let user = userEvent.setup()` in `beforeEach`, with `await user.click()`, `await user.type()`, `await user.selectOptions()` replacing `fireEvent.click()`, `fireEvent.change()`. Intentional exceptions retained: `Modal.test.tsx` (keyDown on document -- no userEvent equivalent), `AlbumCard.test.tsx` (custom DOM event dispatch), and range/slider inputs (userEvent doesn't support `clear()` on non-editable elements). All 857 frontend tests pass.

---

### ~~M7. Accessibility gaps on form controls and buttons~~ DONE

**Completed:** February 2026. Added `aria-label` attributes to all icon-only buttons across 5 components: `Header.tsx` (theme toggle), `SearchBar.tsx` (clear button), `AISuggestionCard.tsx` (refresh button), `NewReleaseCard.tsx` (dismiss button), `DashboardStatCard.tsx` (clickable stat cards).

---

### ~~M8. E2E tests not run in CI~~ DONE

**Completed:** February 2026. Added `e2e` job to CI pipeline that runs after build, installs Chromium, and executes all 4 Playwright specs. Uploads HTML report as artifact.

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

### ~~M13. Fixed 10s timeout + unconditional 1s delay on all API requests~~ DONE

**Completed:** February 2026. Replaced unconditional 1-second delay with token-bucket algorithm in `discogsAxios.ts`. Allows bursting up to 5 rapid requests, refills at 1 req/sec to stay within Discogs' 60 req/min limit. Per-request timeout override already supported via Axios config.

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

### ~~M17. No contributor development guide~~ DONE

**Completed:** February 2026. Created comprehensive `CONTRIBUTING.md` with architecture overview, project structure, coding standards (TypeScript, logging, styling, accessibility, security), development workflow (adding routes, pages, components), testing guidance, and mapping system documentation. Updated README contributing section to link to new docs.

---

### ~~M18. Documentation gaps: security docs and internal guides gitignored~~ DONE

**Completed:** February 2026. Created sanitized public `SECURITY.md` with security policy, architecture controls, environment variable guidance, and self-hosting best practices. Un-ignored `TESTING_GUIDE.md` for public visibility. Internal security audit kept private. Updated `.gitignore` accordingly.

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

### ~~L2. Legacy endpoints likely unused~~ NOT APPLICABLE

**Investigated:** February 2026. Both endpoints (`POST /discogs/token` and `POST /lastfm/callback`) are actively used by the frontend in `src/renderer/services/api.ts` (lines 125, 142). They are not legacy and should not be removed.

---

### ~~L3. Security audit doesn't fail CI~~ ALREADY DONE

**Verified:** February 2026. The CI already has `npm audit --audit-level=moderate` as a job step without `continue-on-error`, which exits non-zero and fails the build when moderate+ vulnerabilities are found.

---

### ~~L4. Remaining `useState<any>` -- 3 untyped state variables~~ DONE

**Completed:** February 2026. Replaced all 3 `useState<any>` with proper inline types: `connectionTest` as `{ success: boolean; message: string } | null`, `results` as `{ success: number; failed: number; errors?: string[] } | null`, `cacheProgress` as `{ status: 'loading' | 'completed'; currentPage: number; totalPages: number } | null`. Zero `useState<any>` remaining.

---

### ~~L5. No Node.js version enforcement~~ DONE

**Completed:** February 2026. Added `engines.node >= 18.0.0` to `package.json` and `.nvmrc` file.

---

### ~~L6. Configuration drift: deprecated `PORT` + `HOST=0.0.0.0` risk~~ ALREADY ADDRESSED

**Verified:** February 2026. `.env.example` already uses `HOST=127.0.0.1` (not `0.0.0.0`). Server defaults to `127.0.0.1`, logs a warning when bound to non-localhost, and falls back from deprecated `PORT` to `BACKEND_PORT`. Security doc covers localhost binding best practice.

---

### ~~L7. Unused dependency: `wait-on`~~ DONE

**Completed:** February 2026. Removed unused `wait-on` from devDependencies.

---

### ~~L8. CI doesn't test Node 22 (current LTS)~~ DONE

**Completed:** February 2026. Added `22.x` to CI test matrix alongside 18.x and 20.x.

---

### ~~L9. No request logging middleware / observability~~ DONE

**Completed:** February 2026. Added `morgan` middleware to `src/server.ts`, piped through the existing `SecureLogger` via a custom stream. Uses `dev` format in development, `combined` in production. Skips `/health` endpoint noise. Disabled in test environment. Structured logging with `pino` deferred as separate future work.

**Files:** `src/server.ts`, `package.json`

---

### ~~L10. No focus trap in modals + possibly dead state~~ PARTIALLY DONE

**Completed:** February 2026. Added `focus-trap-react` to `Modal.tsx` wrapping the modal overlay. FocusTrap handles Escape key deactivation and focus containment. Uses `fallbackFocus` for modals without tabbable children and `tabbableOptions: { displayCheck: 'none' }` for jsdom compatibility. Removed manual keydown listener (FocusTrap handles Escape natively). All 26 Modal tests pass.

**Note:** `connectionTest` state in `ReleaseDetailsPage.tsx` was verified as actively used (set by `testLastfmConnection()`, displayed in the connection test message UI). Not dead state.

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
| H6 | ~~Missing request size limits and rate limiting~~ | ~~**High**~~ | ~~DONE~~ |
| M1 | ~~Direct console.* bypasses secure logger (24 files)~~ | ~~Medium~~ | ~~DONE~~ |
| M2 | ~~CryptoJS deprecated library~~ | ~~Medium~~ | ~~DONE~~ |
| M3 | ~~Startup migrations not awaited~~ | ~~Medium~~ | ~~DONE~~ |
| M4 | ~~Unguarded JSON.parse calls~~ | ~~Medium~~ | ~~DONE~~ |
| M5 | ~~Standardize API error responses~~ | ~~Medium~~ | ~~DONE~~ |
| M6 | fireEvent vs userEvent test inconsistency | Medium | Partial |
| M7 | ~~Accessibility gaps on form controls/buttons~~ | ~~Medium~~ | ~~DONE~~ |
| M8 | ~~E2E tests not in CI~~ | ~~Medium~~ | ~~DONE~~ |
| M9 | No virtualization for large lists | Medium | No |
| M10 | No toast notification system | Medium | No |
| M11 | ~~No React.memo on list components~~ | ~~Medium~~ | ~~DONE~~ |
| M12 | ~~Seller monitoring lacks rate limiting~~ | ~~Medium~~ | ~~DONE~~ |
| M13 | ~~Fixed 10s timeout + unconditional 1s delay~~ | ~~Medium~~ | ~~DONE~~ |
| M14 | ~~decrypt() returns empty string on failure~~ | ~~Medium~~ | ~~DONE~~ |
| M15 | data/ directory not auto-created | Medium | Yes |
| M16 | README architecture out of date | Medium | Yes |
| M17 | ~~No contributor development guide~~ | ~~Medium~~ | ~~DONE~~ |
| M18 | ~~Documentation gaps (gitignored docs)~~ | ~~Medium~~ | ~~DONE~~ |
| M19 | Component extraction Level 3 & 4 | Medium | No |
| L1 | License metadata mismatch (ISC vs MIT) | Low | Yes |
| L2 | Legacy auth endpoints likely unused | Low | Yes |
| L3 | Security audit doesn't fail CI | Low | Yes |
| L4 | Remaining useState\<any\> (3 left) | Low | Yes |
| L5 | No Node.js version enforcement | Low | Yes |
| L6 | Config drift: deprecated PORT + HOST risk | Low | Yes |
| L7 | Unused dependency: wait-on | Low | Yes |
| L8 | CI doesn't test Node 22 | Low | Yes |
| L9 | ~~No request logging / observability~~ | ~~Low~~ | ~~DONE~~ |
| L10 | ~~No focus trap in modals + dead state~~ | ~~Low~~ | ~~DONE~~ |
| L11 | Centralize route identifiers | Low | Yes |
| L12 | Sidebar reorganization | Low | No |

**Total open**: 12 items (1 critical, 2 high, 2 medium, 7 low) -- 26 completed (10 Phase 0 + 11 Phase 1 + 3 Phase 2 + 2 Phase 3, February 2026)

---

## Prioritized Action Plan

### Phase 0 -- Immediate Quick Wins -- COMPLETE (February 2026)

All 10 items completed: H1, H3, H2, H6 (size limit), M15, L1, L5, M1 (ESLint + backend migration), L7, M16.

### Phase 1 -- High-Impact Medium Work (1–2 weeks)

| # | Action | Findings |
|---|--------|----------|
| 1 | Replace all `console.*` with logger (24 files) | M1 |
| ~~2~~ | ~~Add `express-rate-limit` middleware~~ | ~~H6~~ DONE |
| ~~3~~ | ~~Add Playwright to CI workflow~~ | ~~M8~~ DONE |
| ~~4~~ | ~~Add `React.memo` to list-item components~~ | ~~M11~~ DONE |
| ~~5~~ | ~~Create `safeJsonParse<T>()` utility~~ | ~~M4~~ DONE |
| ~~6~~ | ~~Await migrations before `app.listen()`~~ | ~~M3~~ DONE |
| ~~7~~ | ~~Throw `DecryptionError` instead of returning `''`~~ | ~~M14~~ DONE |
| ~~8~~ | ~~Add `aria-label` to all icon-only buttons/inputs~~ | ~~M7~~ DONE |
| ~~9~~ | ~~Share rate-limited Axios instance with seller service~~ | ~~M12~~ DONE |
| ~~10~~ | ~~Publish sanitized security + testing guides~~ | ~~M17, M18~~ DONE |

### Phase 2 -- Systematic Refactors (2–4 weeks)

| # | Action | Findings |
|---|--------|----------|
| 1 | Inline styles to CSS modules (start with list components) | H4 |
| 2 | Split `styles.css` into per-component modules | H4 |
| 3 | Migrate `fireEvent` to `userEvent` in 20 test files | M6 |
| 4 | Add test coverage for untested services + raise thresholds | C1 |
| ~~5~~ | ~~Implement token-bucket rate limiter for Discogs~~ | ~~M13~~ DONE |
| ~~6~~ | ~~Migrate CryptoJS to native `crypto`~~ | ~~M2~~ DONE |
| ~~7~~ | ~~Standardize API error responses~~ | ~~M5~~ DONE |

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
