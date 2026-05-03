- ALWAYS USE REAL DATA, DO NOT MAKE UP DATA UNLESS APPROVAL GIVEN
- keep unit test coverage at 90% target (current enforced: 60%, see .plan/tech-debt.md for improvement plan)
- use milliseconds (Date.now()) for all timestamps; normalize Last.fm API seconds on storage
- use nodejs for the back end
- review .plan/ directory and roadmap.md before implementing new features
- keep readme.md up to date with anything needed to know to run the application, including directions how to sign up for any api access needed and directions on how to setup environment and start the application
- always make sure there are no whitespace issues in `git diff` results
- make sure code is safe to commit to public repo, no secrets or api keys
- make sure code compiles successfully
- make sure you remove any temporary debugging code
- reference TEST_STYLE_GUIDE.md when writing tests
- NEVER USE AMEND ON A COMMIT UNLESS EXPLICITLY TOLD TO DO SO
- BEFORE COMITTING YOU MUST MAKE SURE TESTS PASS AND MEET COVERAGE THRESHOLDS WHEN RUN THE SAME WAY AS THE CI PIPELINE
- RUN ALL CHECKS THAT ARE RUN IN THE CI PIPELINE BEFORE COMMITTING
- all data files must include `schemaVersion: 1` as a top-level field
- register new data files in `migrationService.ts` with path, currentVersion, and optional flag
- files that store raw arrays must use `arrayWrapperKey` in registration to wrap as `{schemaVersion: 1, [key]: [...]}` (e.g., `items` or `mappings`)
- use `writeJSONWithBackup()` for critical data files (creates `.bak` before overwriting)
- add new store types to `src/shared/types.ts` extending `VersionedStore` interface
- cache files should have defined retention periods and be added to `cleanupService.ts` if they need automated cleanup
- ALWAYS CHECK IF UI COMPONENTS ALREADY EXIST BEFORE MAKING NEW ONES, (LIKE MODAL AND BUTTONS)
- make sure to check all mappings in the codebase to see if they should be used in current feature working on

## Definition of Done

`tsc` and `jest` passing is **not** done. Those catch syntax + unit logic; they don't catch the things that have repeatedly broken in this codebase: contract drift between backend and frontend, file-write races, mutations that don't persist on refresh, duplicated utils, settings UIs that aren't wired up, relative URLs that resolve to `localhost`. Before claiming a task done, you must run through this list. Skipping it because "it should work" is what produces the bugs we keep hitting.

### 1. Use the feature

Run it. Click the button. Hit the endpoint with curl. Look at the actual response shape, not the declared TypeScript type — type assertions in API clients lie. If the task added or modified a UI flow and you didn't render it in a browser, the task is not done. If the task added an endpoint and you didn't curl it and inspect the JSON, the task is not done.

### 2. Use the sandbox for any mutation

ANY task that writes to disk, mutates persisted state, or could leave the data dir in a bad state must be verified against the **sandbox**, not the real `./data` directory:

```
npm run sandbox          # snapshot ./data into a temp dir, start backend on :3091
npm run sandbox:fresh    # start with empty data dir
```

Real `./data` is read-only relative to the sandbox — it's snapshotted with `cp -a` and the sandbox dir is `rm -rf`'d on Ctrl-C. Trigger the feature against the sandbox URL, refresh, trigger again, abuse it. Never run mutation verification against the production `./data`.

### 3. Run the abuse checklist

Happy path is the easy 10%. Before declaring done, ask each of these and either confirm or test:

- **Refresh test.** Trigger the mutation, then reload — does the state survive? (Catches read-modify-write races, optimistic-update-only bugs.)
- **Concurrency test.** Trigger N times in parallel. Does every mutation persist, or do some vanish? (For any service method that touches a shared file, write a parallel-call jest test as a regression.)
- **Empty + scale.** Zero items, one item, 500 items. Each should render and behave.
- **Backend offline / Ollama offline / API error.** Does the UI degrade gracefully or crash?
- **Cross-stack contract.** Trace one real response from backend → API client → render. Field-name drift (e.g. backend returns `title`, frontend reads `name`) is invisible to TypeScript and must be verified by inspection or by a render-time test.

### 4. Grep before writing

Before writing any helper, normalizer, status-classifier, formatter, or response shape, grep for existing ones:

```
grep -rn "normaliz" src/shared/utils
grep -rn "formatRel" src/renderer
grep -rn "<concept>" src/
```

Half of the bugs in this codebase came from rolling a new version of something already there. The first question on any new function is "is there one already?" If you didn't grep, you didn't try.

### 5. PATCH endpoints filter undefined

Any route that does partial updates (`{ ...current, ...partial }`) must filter undefined values out of `partial` first. JS spread overwrites with `undefined` rather than skipping, so destructuring optional fields from `req.body` and forwarding them silently wipes whatever the client didn't send. (See `releaseTrackingService.saveSettings` for the canonical pattern.)

### 6. Bulk operations get bulk endpoints

If the UI needs to update N items in response to one click, the backend gets a single bulk endpoint that does one read-mutate-write. **Never** loop `Promise.allSettled(items.map(api.update))` against single-item endpoints that touch a shared file — they race and silently lose mutations. (See `markItemsAsSeen` / `markReleasesAsSeen` for the canonical pattern.)

## UI Navigation Guidelines
Before adding any new page or navigation item:
1. Ask: "Which area does this belong to?" (Dashboard, Library, Listen, Discover, Marketplace, Settings)
2. Ask: "Can this be a tab/section inside an existing area?"
3. Only add a new top-level area if it represents a genuinely new mental model for users

## Architecture

- **Stack**: Express backend + React 19 frontend, single TypeScript repo, Webpack bundled
- **Data layer**: File-based JSON storage via `FileStorage` class (`src/backend/utils/fileStorage.ts`) -- NOT a database
- **All data** lives under the `data/` directory (gitignored, auto-created by FileStorage)
- **API routes** are mounted at `/api/v1/*` in `src/server.ts`
- **Service injection**: Services are instantiated in `server.ts` and passed into route factories (e.g., `createScrobbleRouter(fileStorage, authService, ...)`)
- **Frontend routing**: Hash-based (`window.location.hash`), no React Router -- page switching is in `App.tsx`
- **Shared types**: All interfaces live in `src/shared/types.ts` -- both frontend and backend import from here
- **Frontend API client**: All backend calls go through the singleton `ApiService` in `src/renderer/services/api.ts` -- never call `fetch`/`axios` directly from components

## Logging

- **NEVER use `console.log`, `console.error`, `console.warn`, or `console.debug` directly**
- **ALWAYS use `createLogger()`** which auto-redacts sensitive data (tokens, API keys, secrets)
- Backend: `import { createLogger } from '../utils/logger';`
- Frontend: `import { createLogger } from '../utils/logger';`
- Create a named logger per file: `const log = createLogger('ServiceName');`
- Use appropriate levels: `log.debug()` for dev noise, `log.info()` for state changes, `log.warn()` for recoverable issues, `log.error()` for failures

## Styling

This project uses a 3-tier CSS architecture:

1. **Global** (`src/renderer/styles.css`) -- design tokens (`:root` / `.dark-mode`), utilities (`.sr-only`, `.card`), and styles for widely-shared components
2. **Page** (`PageName.page.css`) -- styles ONLY for that page's own markup. Never put shared component styles here. Import as `import './PageName.page.css'`
3. **Component** (`ComponentName.css`) -- styles for a reusable component, co-located and imported by the component itself: `import './ComponentName.css'`

### Decision Flowchart

- Is it a design token or utility? --> `styles.css`
- Is it only used by one page's own JSX (not an imported component)? --> `PageName.page.css`
- Is it for a shared/reusable component? --> `ComponentName.css` next to the `.tsx`

### Rules

- **NEVER use `.module.css`** -- `css-loader@7.x` auto-hashes class names; use `.page.css` for pages and plain `.css` for components
- **NEVER use inline `style={}` attributes** -- extract to CSS classes (exception: truly dynamic values like `width: ${percent}%`)
- **USE design tokens** -- never hardcode `font-size`, `border-radius`, or color values
- Check `src/renderer/styles.css` for existing patterns before writing new CSS

## Icons

- **NEVER use emoji as icons** -- use `lucide-react` for all icons
- Import named icon components: `import { Home, Settings } from 'lucide-react'`
- Size conventions: 16px for inline/badges, 18px for nav items, 20px for headers/actions
- Icons inherit `currentColor` -- set color via parent CSS
- Add `aria-hidden="true"` to purely decorative icons
- Add `aria-label` to icon-only interactive elements (buttons with no text label)

## Design Token Reference

All values should use CSS custom properties from `src/renderer/styles.css`:
- **Typography**: `--text-xs` (12px) through `--text-3xl` (32px)
- **Border radius**: `--radius-sm` (4px), `--radius-md` (8px), `--radius-lg` (12px), `--radius-xl` (16px), `--radius-full` (9999px)
- **Spacing**: `--space-1` (4px) through `--space-12` (48px)
- **Colors**: `--surface-*`, `--accent-*`, `--text-*`, `--border-*`, `--shadow-*`, `--status-*`
- Never hardcode `font-size`, `border-radius`, or color values -- always use a token

## Reusable UI Components

Before creating any new UI element, check `src/renderer/components/ui/`:
- **Modal** (`Modal.tsx`) -- all dialogs and overlays
- **Button** (`Button.tsx`) -- all clickable actions
- **Badge** (`Badge.tsx`) -- status indicators and counts
- **ProgressBar** (`ProgressBar.tsx`) -- loading/progress indicators
- **Skeleton** (`Skeleton.tsx`) -- loading placeholders
- **EmptyState** (`EmptyState.tsx`) -- empty list/page states

Also check `src/renderer/hooks/`:
- **useInfiniteScroll** -- paginated list loading
- **useNotifications** -- notification state management

## Type Safety

- **NEVER use `any`** -- define proper interfaces in `src/shared/types.ts`
- API responses must use the `ApiResponse<T>` wrapper type
- New data store types must extend `VersionedStore`
- Use `useState<SpecificType>()` not `useState<any>()`
- When parsing JSON from external sources, type-assert the result or use a `safeJsonParse<T>()` pattern with error handling

## Error Handling

- Route handlers: wrap in try-catch, return structured `{ success: false, error: message }` responses
- **NEVER silently swallow errors** in `.catch()` blocks -- if an operation can fail, surface it to the user or log at `error` level with context
- `JSON.parse()`: always wrap in try-catch; corrupted data files should not crash the server
- Background operations (sync, cleanup): if they fail, the failure should be retrievable by the frontend, not just logged
- Decryption/auth failures: throw specific errors so callers can distinguish "not configured" from "key mismatch"

## Security & Input Validation

- Use validation utilities from `src/backend/utils/validation.ts` (validateUsername, validateSessionId, sanitizePathComponent)
- FileStorage handles path traversal protection -- never construct file paths manually outside of it
- All credentials are encrypted via AuthService -- never store plaintext tokens
- Required env vars must be validated at startup, not silently defaulted to empty strings
- Never log raw request bodies, tokens, or API keys -- the logger handles redaction automatically

## External APIs (Discogs, Last.fm, MusicBrainz)

- Rate limiting is enforced via Axios interceptors -- all external API calls must go through the service's Axios instance, not a standalone `axios.get()`
- Use `src/shared/utils/trackNormalization.ts` when comparing track/artist/album names across services (handles [Explicit], [Remastered], case differences, etc.)
- Discogs API: 1 req/sec rate limit, OAuth 1.0a signing
- Last.fm API: 1 req/sec rate limit, API signature authentication
- Always handle 429 (rate limit) responses gracefully with backoff

## Frontend Component Patterns

- All components are functional using `React.FC<Props>`
- State management: React Context API (`AppContext`, `AuthContext`, `ThemeContext`) -- no Redux
- Props must be typed with explicit interfaces, not inline types
- List-item components that render in loops should be wrapped in `React.memo`
- Use `useCallback` for event handlers passed as props, `useMemo` for expensive computations
- Accessibility: all interactive elements need `aria-label` (especially icon-only buttons); form inputs need labels or `aria-label`

## Mapping System

This app has several mapping layers that translate between Discogs and Last.fm data:
- **Album mappings** (`mappingService.ts`): `getAlbumMappingForCollection()` translates Discogs artist+album to Last.fm history artist+album
- **Artist mappings** (`artistMappingService.ts`): Discogs artist name ↔ Last.fm artist name
- **Artist name resolver** (`artistNameResolver.ts`): Bidirectional alias graph using union-find for transitive artist name resolution
- **Track mappings** (`trackMappingService.ts`): Discogs track ↔ Last.fm track (handles title differences)
- **Hidden items** (`hiddenItemService.ts`, `hiddenReleasesService.ts`): user-excluded items

### Canonical Pattern for Discogs↔Last.fm Collection Matching

**WARNING:** Never use naive `toLowerCase()` to compare Discogs collection data against Last.fm history data. Discogs and Last.fm frequently use different names for the same artist or album (e.g., "Aesop Rock, Blockhead" vs "Aesop Rock", "Tobacco (3)" vs "Tobacco", "Bestiary" vs "Bestiary (Bonus Track Version)").

**Required pattern** (see `buildFuzzyCollectionMap()` in `statsService.ts`):
1. For each collection item, call `mappingService.getAlbumMappingForCollection(artist, album)` to get the mapped Last.fm names
2. Build a fuzzy lookup key via `historyStorage.fuzzyNormalizeKey(searchArtist, searchAlbum)`
3. Match against history data using the fuzzy key

**Methods that correctly use this pattern:** `getCollectionCoverage()`, `getDustyCorners()`, `getHeavyRotation()`, `getTopAlbums()`, `getArtistDetail()`, `getTrackDetail()`, dashboard recent albums route, AI suggestion avoid-set (suggestions route), `ImageService.getAlbumCoverFromCollection()`.

When implementing features that display or process tracks/artists, check if any of these mappings should be applied. The `trackNormalization.ts` utilities help with fuzzy matching.

---

## Codebase Consistency Rules (Audit 2026-03-22)

### Service Initialization
- All services must use constructor-based dependency injection
- Do not use singleton module-level instances or lazy setter patterns

### Error Propagation
- Services should throw typed errors up to route handlers — do not silently swallow errors in service layers
- Route handlers catch and return structured `{ success, error }` responses

### API Response Helpers
- Use `sendError`/`sendSuccess` from `src/backend/utils/apiResponse.ts` in all route handlers

### Notifications
- Use `ToastContext` for all user-facing notifications
- Do not use `useNotifications` (persistent/localStorage) for new features

### Design Tokens: Z-index, Breakpoints, Warning Color
- All z-index values must use scale tokens: `--z-dropdown: 100`, `--z-sticky: 200`, `--z-modal: 1000`, `--z-toast: 9999`
- Use `--accent-warning` for warning-colored UI
- Use documented breakpoint scale: `768px` (tablet), `900px` (desktop)

### Loading States
- All pages that fetch data must show skeleton/placeholder UI during loading
- Use the `Skeleton` component from `src/renderer/components/ui/Skeleton.tsx`

### Keyboard Navigation
- All interactive lists and data tables must support keyboard navigation via `useTabKeyNavigation` or equivalent

### Destructive Actions
- All destructive actions (delete, remove, clear, reset) must show a confirmation dialog via `useConfirmModal` before executing

### Pagination
- Use `page` + `perPage` as the standard pagination parameter names across all APIs
- All data-heavy list pages (>100 items) should implement pagination

### Search & Filter
- Use the `SearchBar` component with debounce for all search/filter inputs
- Do not implement inline search with raw input handlers

