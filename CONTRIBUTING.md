# Contributing to RecordScrobbles

Thank you for your interest in contributing! This guide covers the architecture, coding patterns, and development workflow to help you get started.

## Prerequisites

- Node.js >= 18.0.0 (see `.nvmrc`)
- npm
- Discogs developer account (for API access)
- Last.fm API account (for scrobbling)

## Getting Started

1. Fork and clone the repository
2. Copy `.env.example` to `.env` and fill in your API credentials
3. Install dependencies: `npm install`
4. Start the dev server: `npm run dev`
5. Open `http://localhost:3000` in your browser

## Architecture Overview

**Stack**: Express backend + React 19 frontend, single TypeScript repo, Webpack bundled.

```
src/
  backend/
    routes/         # Express API routes (mounted at /api/v1/*)
    services/       # Business logic layer
    utils/          # Shared backend utilities (FileStorage, logger, validation)
  renderer/
    components/     # Reusable React components
      ui/           # Primitives: Modal, Button, Badge, ProgressBar, Skeleton, EmptyState
      settings/     # Settings page sections
      dashboard/    # Dashboard-specific components
      wishlist/     # Wishlist-specific components
    pages/          # Top-level page components
    context/        # React Context providers (Auth, Theme, App)
    hooks/          # Custom React hooks
    services/       # Frontend API client (api.ts)
    utils/          # Frontend utilities (logger, etc.)
  shared/
    types.ts        # Shared TypeScript interfaces (frontend + backend)
    utils/          # Shared utilities (trackNormalization, safeJsonParse)
```

### Key Architectural Decisions

- **Data layer**: File-based JSON storage via `FileStorage` class -- no database
- **All data** lives under `data/` (gitignored, auto-created at startup)
- **Frontend routing**: Hash-based (`window.location.hash`), no React Router
- **State management**: React Context API (no Redux)
- **Service injection**: Services instantiated in `server.ts` and passed into route factories

## Development Workflow

### Adding a New API Route

1. Create the route file in `src/backend/routes/`
2. Export a factory function: `export function createMyRouter(fileStorage, authService, ...) { ... }`
3. Mount in `src/server.ts`
4. Add types to `src/shared/types.ts`
5. Add frontend calls through `ApiService` in `src/renderer/services/api.ts`

### Adding a New Page

1. Create the page component in `src/renderer/pages/`
2. Add the route hash in `src/renderer/components/MainContent.tsx`
3. Add sidebar entry in `src/renderer/components/Sidebar.tsx`
4. Before adding a new top-level page, consider: can this be a tab in an existing page?

### Adding a New Component

1. Check `src/renderer/components/ui/` for existing primitives before creating new ones
2. Use `React.FC<Props>` with explicit interface types
3. List-item components rendered in loops should be wrapped in `React.memo`
4. Use `useCallback` for event handlers passed as props

## Coding Standards

### TypeScript

- **No `any` types** -- define proper interfaces in `src/shared/types.ts`
- API responses use the `ApiResponse<T>` wrapper type
- Data stores extend `VersionedStore`

### Logging

- **Never use `console.log/error/warn/debug` directly**
- Use `createLogger()` which auto-redacts sensitive data (tokens, API keys)
- Backend: `import { createLogger } from '../utils/logger';`
- Frontend: `import { createLogger } from '../utils/logger';`

### Styling

- **No inline `style={}` attributes** -- extract to CSS classes in `src/renderer/styles.css`
- Only exception: truly dynamic values computed at runtime
- Use existing global CSS classes (`.form-input`, `.btn`, `.card`) before creating new ones

### Accessibility

- All interactive elements need `aria-label`, especially icon-only buttons
- Form inputs need associated labels or `aria-label`

### Error Handling

- Route handlers: wrap in try-catch, return `{ success: false, error: message }`
- Never silently swallow errors in `.catch()` blocks
- Always wrap `JSON.parse()` in try-catch

### Security

- Use validation utilities from `src/backend/utils/validation.ts`
- FileStorage handles path traversal protection
- Never log raw tokens, API keys, or request bodies
- Required env vars are validated at startup

### External APIs

- All Discogs API calls go through the shared rate-limited Axios instance (`discogsAxios.ts`)
- Use `trackNormalization.ts` when comparing track/artist names across services
- Handle 429 responses gracefully with backoff

### Data Files

- Include `schemaVersion: 1` as a top-level field
- Register new data files in `migrationService.ts`
- Use `writeJSONWithBackup()` for critical data

## Testing

### Running Tests

```bash
npm test                   # Run all tests
npm run test:coverage      # Run with coverage report
npm run test:e2e           # Run Playwright E2E tests
npm run lint               # ESLint
npm run typecheck          # TypeScript checks
```

### Test Structure

```
tests/
  backend/        # Service and route unit tests
  frontend/       # Component and page tests
  integration/    # API integration tests
  e2e/            # Playwright browser tests
```

### Writing Tests

- Follow patterns in [TEST_STYLE_GUIDE.md](TEST_STYLE_GUIDE.md)
- Use `userEvent.setup()` (not `fireEvent`) for user interactions
- Use AAA pattern (Arrange, Act, Assert)
- Wrap components in required providers when testing

### Coverage

- Current enforced threshold: 60%
- Project target: 90%
- Coverage must not decrease with new code

## Pre-Commit Checks

The project uses husky + lint-staged. Before committing, these run automatically:

- ESLint with auto-fix
- Prettier formatting
- TypeScript type checking

### Before Submitting a PR

1. All tests pass: `npm test`
2. Coverage meets thresholds: `npm run test:coverage`
3. No lint errors: `npm run lint`
4. Types are clean: `npm run typecheck`
5. No whitespace issues in `git diff`
6. No secrets or API keys in committed code

## Mapping System

The app has several mapping layers between Discogs and Last.fm data:

- **Artist mappings**: Discogs artist name to Last.fm artist name
- **Track mappings**: Discogs track to Last.fm track (handles title differences)
- **Scrobble artist mappings**: User-corrected artist names for scrobbling
- **Hidden items**: User-excluded items from collection and releases

When implementing features that display or process tracks/artists, check if any of these mappings should be applied.

## Questions?

Open an issue on GitHub for questions about contributing.
