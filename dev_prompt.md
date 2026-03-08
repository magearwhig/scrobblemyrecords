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

- **NEVER use inline `style={}` attributes** -- extract to CSS classes
- Only exception: truly dynamic values computed at runtime (e.g., `width: ${percent}%`)
- Use existing global CSS classes (`.form-input`, `.card`, etc.) before creating new ones
- **Shared/global styles** live in `src/renderer/styles.css`
- **Page-specific styles** live in co-located CSS module files (e.g., `HomePage.module.css` next to `HomePage.tsx`)
- Import module CSS in the page component: `import './PageName.module.css'` (no CSS Modules object needed -- classes are global within the file)
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