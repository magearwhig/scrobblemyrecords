# Context Tags Plan (Backlog #18)

Backlog Effort F from `.plan/backlog-shark-tank-2026-03-08.md`.

## Summary

Add optional listening context tags ("late night", "cooking", "focused listen", "party") to scrobble sessions. Tags are selected inline on ReleaseDetailsPage via tappable chips. Users can create custom tags on the fly. A "Context Breakdown" chart on StatsPage shows listening habits by context.

---

## 1. Data Model

### 1a. Add `context` to `ScrobbleSession`

In `src/shared/types.ts`, extend `ScrobbleSession`:

```typescript
export interface ScrobbleSession {
  // ... existing fields ...
  context?: string[];  // user-defined listening context tags
}
```

### 1b. Tag Storage

New file: `data/settings/context-tags.json`

```typescript
export interface ContextTag {
  id: string;          // UUID
  label: string;       // display name, e.g. "late night"
  color?: string;      // optional accent color token name
  createdAt: number;   // milliseconds
  usageCount: number;  // incremented each time tag is applied
}

export interface ContextTagsStore extends VersionedStore {
  schemaVersion: 1;
  tags: ContextTag[];
}
```

### 1c. Analytics Response Type

```typescript
export interface ContextBreakdownItem {
  tag: string;
  count: number;         // scrobble sessions with this tag
  trackCount: number;    // total tracks across those sessions
  percentage: number;    // share of all tagged sessions
  lastUsed: number;      // milliseconds timestamp
}
```

---

## 2. Backend Changes

### 2a. New Service: `contextTagService.ts`

Location: `src/backend/services/contextTagService.ts`

Stores to `settings/context-tags.json` via `FileStorage`. Uses `writeJSONWithBackup()`.

Methods:
- `getAllTags(): Promise<ContextTag[]>` — sorted by `usageCount` descending
- `createTag(label: string): Promise<ContextTag>` — validates uniqueness (case-insensitive), generates UUID
- `deleteTag(id: string): Promise<void>` — removes definition; does NOT strip from historical sessions
- `renameTag(id: string, newLabel: string): Promise<void>` — renames and updates all historical sessions referencing old label
- `incrementUsage(labels: string[]): Promise<void>` — bumps `usageCount` for each label

Register in `migrationService.ts`:
```typescript
this.registerDataFile({
  path: 'settings/context-tags.json',
  currentVersion: 1,
  migrations: [],
  optional: true,
});
```

### 2b. New Route: `contextTags.ts`

Location: `src/backend/routes/contextTags.ts`

```
GET    /api/v1/context-tags        — all tags (ordered by usage count)
POST   /api/v1/context-tags        — create tag ({ label: string })
DELETE /api/v1/context-tags/:id     — delete tag
PATCH  /api/v1/context-tags/:id     — rename tag ({ label: string })
```

Mount in `server.ts`:
```typescript
app.use('/api/v1/context-tags', createContextTagsRouter(contextTagService));
```

### 2c. Modify Scrobble Route

In `src/backend/routes/scrobble.ts`:

- `POST /batch` — accept `contextTags?: string[]` in request body
- Pass to `lastfmService.scrobbleBatch()`
- Set `session.context = contextTags` when creating the `ScrobbleSession` object

In `src/backend/services/lastfmService.ts`:

- `scrobbleBatch()` — add `contextTags?: string[]` parameter, persist on session object
- After successful scrobble, call `contextTagService.incrementUsage(contextTags)`

Extend `createScrobbleRouter` factory signature to accept `ContextTagService`.

### 2d. Add Retroactive Tagging Endpoint

In scrobble route:

```
PATCH /api/v1/scrobble/session/:sessionId/context — body: { contextTags: string[] }
```

- Reads session file, updates `session.context`, writes back
- Only allowed on completed sessions
- Increments usage for new tags, decrements for removed tags

### 2e. Add Stats Query

In `src/backend/services/statsService.ts`:

```typescript
async getContextBreakdown(): Promise<ContextBreakdownItem[]>
```

Implementation follows `getSourceBreakdown()` pattern (line ~1345):
1. Scan all `scrobbles/session-*.json` files
2. For each completed session with non-empty `context` array, accumulate counts per tag
3. Calculate percentages relative to total tagged sessions
4. Sort by count descending, return top 20

Also add:
```typescript
async getScrobblesByContext(tag: string): Promise<ScrobbleSession[]>
```

In `src/backend/routes/stats.ts`:

```
GET /api/v1/stats/context-breakdown — returns ContextBreakdownItem[]
```

---

## 3. Frontend Changes

### 3a. New Component: `ContextTagSelector`

Location: `src/renderer/components/ContextTagSelector.tsx`
CSS: `src/renderer/components/ContextTagSelector.css`

```typescript
interface ContextTagSelectorProps {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  disabled?: boolean;
}
```

**Visual design:**
- Horizontal flex-wrap row of pill-shaped chips
- Unselected: outline style. Selected: filled `accent-primary`
- "+" chip at end opens inline text input to create new tag
- Selected chips show checkmark icon (`Check` from lucide-react, 14px)
- Pill shape: `var(--radius-full)`, font: `var(--text-sm)`, gap: `var(--space-1)`
- Tags ordered by usage count (most-used first)

**Behavior:**
- On mount, fetch tags from `GET /api/v1/context-tags`
- Tap chip to toggle selection
- "+" chip reveals inline `<input>` with placeholder "Add tag..."
- Enter or blur creates tag via `POST /api/v1/context-tags` and auto-selects it
- Duplicate labels rejected (case-insensitive)
- Multiple tags can be selected simultaneously

**Accessibility:**
- Each chip is a `<button>` with `aria-pressed={isSelected}`
- `aria-label="Select tag: {label}"` on each chip
- Create input has `aria-label="Create new context tag"`

### 3b. Integrate into ReleaseDetailsPage

In `src/renderer/pages/ReleaseDetailsPage.tsx`:

Add state:
```typescript
const [contextTags, setContextTags] = useState<string[]>([]);
```

Place `<ContextTagSelector>` between the timing section and tracklist, visible when tracks are selected:

```tsx
{selectedTracks.size > 0 && (
  <div className="release-details-context-tags">
    <h5 className="release-details-context-heading">Listening Context</h5>
    <p className="release-details-context-description">
      Tag this session with your listening mood or activity (optional)
    </p>
    <ContextTagSelector
      selectedTags={contextTags}
      onTagsChange={setContextTags}
      disabled={scrobbling}
    />
  </div>
)}
```

Modify `handleScrobbleInternal()` to pass `contextTags` to `api.scrobbleBatch()`.

CSS in `src/renderer/pages/ReleaseDetailsPage.page.css` — match existing timing section heading/description styles.

### 3c. Context Breakdown Chart on StatsPage

New component: `src/renderer/components/stats/ContextBreakdownChart.tsx`
CSS: `src/renderer/components/stats/ContextBreakdownChart.css`

- Donut chart using `recharts` (already a dependency), follows `SourcePieChart` pattern
- Title: "Listening Context"
- Legend: tag name, session count, percentage
- Empty state: "No context tags used yet. Add tags when scrobbling from album details."
- Lazy-loaded via `IntersectionObserver` (same pattern as genre treemap in StatsPage)

In `src/renderer/pages/StatsPage.tsx`:
- Add state, ref, observer for context breakdown
- Place alongside or after Scrobble Sources chart

### 3d. Show Tags on ScrobbleSessionCard

In `src/renderer/components/ScrobbleSessionCard.tsx`:
- If `session.context` exists and has items, render a row of `<Badge pill>` chips showing each tag
- Gives visibility to tagged sessions in history view

### 3e. API Service Extensions

In `src/renderer/services/api.ts`:
```typescript
async getContextTags(): Promise<ContextTag[]>
async createContextTag(label: string): Promise<ContextTag>
async deleteContextTag(id: string): Promise<void>
async renameContextTag(id: string, label: string): Promise<void>
async updateSessionContext(sessionId: string, contextTags: string[]): Promise<void>
```

Extend `scrobbleBatch()` to accept and pass `contextTags?: string[]`.

In `src/renderer/services/statsApi.ts`:
```typescript
async getContextBreakdown(): Promise<ApiResponse<ContextBreakdownItem[]>>
```

---

## 4. Phased Implementation

### Phase 1: Data Model & Tag CRUD
**Size: Small** | No dependencies

1. Add `ContextTag`, `ContextTagsStore`, `ContextBreakdownItem` types to `src/shared/types.ts`
2. Add `context?: string[]` to `ScrobbleSession` interface
3. Create `contextTagService.ts` with CRUD operations
4. Register in `migrationService.ts`
5. Create `contextTags.ts` route (GET/POST/DELETE/PATCH)
6. Wire up in `server.ts`
7. Add API methods to `api.ts`
8. Tests for service and route

### Phase 2: Tag Selector UI Component
**Size: Small** | Depends on Phase 1

1. Create `ContextTagSelector.tsx` and CSS
2. Implement chip rendering, toggle, inline create
3. Component tests

### Phase 3: ReleaseDetailsPage Integration
**Size: Medium** | Depends on Phase 2

1. Add `contextTags` state and `ContextTagSelector` to ReleaseDetailsPage
2. Modify `handleScrobbleInternal()` to pass tags
3. Modify scrobble route `POST /batch` to accept `contextTags`
4. Modify `lastfmService.scrobbleBatch()` to persist tags on session
5. Add CSS to `ReleaseDetailsPage.page.css`
6. Integration tests

### Phase 4: Retroactive Tagging & Session Display
**Size: Small** | Depends on Phase 3

1. Add `PATCH /scrobble/session/:id/context` endpoint
2. Add `updateSessionContext()` to frontend API
3. Show context tags on `ScrobbleSessionCard`
4. Add edit button on session card to modify tags on existing sessions

### Phase 5: Analytics
**Size: Small-Medium** | Depends on Phase 3

1. Add `getContextBreakdown()` to `statsService.ts`
2. Add `GET /stats/context-breakdown` to stats route
3. Add `getContextBreakdown()` to `statsApi.ts`
4. Create `ContextBreakdownChart.tsx` and CSS
5. Integrate into `StatsPage.tsx` with lazy loading
6. Tests

---

## 5. UX Flow

1. User navigates to ReleaseDetailsPage from collection
2. Selects tracks and optionally sets timing
3. Below timing section, "Listening Context" appears with a row of tag chips
4. Common tags (sorted by usage) shown as outline pills — tap to select (fills with accent color)
5. "+" pill at end allows creating a new tag inline — text input, Enter to create and auto-select
6. Multiple tags can be selected simultaneously
7. User clicks "Scrobble N Tracks" — tags sent with batch request
8. Tags are entirely optional — no tags = same behavior as today

**Tag management:**
- Tags are global per user, not per album
- Stored as lowercase trimmed strings
- No hierarchy or categories (keep it simple)
- Deleted tags stay in historical sessions but disappear from the picker
- Renamed tags update all historical sessions (bulk rewrite)

---

## 6. Edge Cases

| Concern | Handling |
|---------|----------|
| **No tags selected** | `context` field omitted from session (undefined, not empty array). Stats ignores untagged sessions. |
| **Tag deletion** | Removes from picker only. Historical sessions retain the label. May still appear in breakdown chart from old data. |
| **Tag rename** | Updates `context-tags.json` + iterates all `scrobbles/session-*.json` to replace old label. Potentially slow — show progress. Use `writeJSONWithBackup()` per file. |
| **Retroactive tagging** | `PATCH` endpoint on completed sessions. Usage counts adjusted for added/removed tags. |
| **Tag validation** | Max 50 chars. Trimmed, lowercased. No duplicates (case-insensitive). Reject empty strings. Allow spaces, hyphens, apostrophes. |
| **Performance** | Tag CRUD is lightweight (single small JSON). Breakdown scan reads session files (same cost as `getSourceBreakdown()`, proven acceptable). Cache warming (#17) would precompute this if needed later. |
| **Migration** | No migration needed — existing sessions lack `context` and are treated as untagged. `context-tags.json` created on first tag creation (optional file). |
