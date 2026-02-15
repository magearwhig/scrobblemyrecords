# Mapping Resolution Plan

Consolidate three disconnected mapping services into a unified artist name resolution system. Fixes split history entries, wrong stats, and stale "Last played" caused by artist name variants across Discogs and Last.fm.

## Problem

The app has three separate mapping services that don't cross-reference each other:

1. **`artistMappingService`** -- Discogs name -> Last.fm name (e.g., "Tool (2)" -> "Tool")
2. **`mappingService` album mappings** -- history `artist|album` -> collection `artist|album`
3. **`mappingService` artist mappings** -- history artist -> collection artist

When an album mapping says `billy woods|hiding places` maps to `Billy Woods, Kenny Segal|Hiding Places`, no corresponding scrobble-time artist mapping is created. This causes:

- **Split history entries**: Index has both `billy woods|hiding places` (45 plays, Jan 16) and `billy woods, kenny segal|hiding places` (6 plays, today)
- **Wrong stats**: `getArtistDetail("Billy Woods")` does exact match on artist name, misses the compound-name entries
- **Stale "Last played"**: Shows 4 days ago instead of minutes ago

## Approach: Layered Resolution (No File Consolidation)

Create a new `ArtistNameResolver` that reads from all existing mapping sources and builds an in-memory alias graph. No data files are merged or deleted. The resolver is injected into services that need artist aggregation.

---

## Phase 1: ArtistNameResolver Service

**New file**: `src/backend/services/artistNameResolver.ts`

Read-only aggregator that builds a bidirectional alias graph on startup from all existing mapping data.

**Sources read** (no writes to these files):
- `artistMappingService.getAllMappings()` -- `discogsName <-> lastfmName`
- `mappingService.getAllAlbumMappings()` -- `historyArtist <-> collectionArtist` (where they differ)
- `mappingService.getAllArtistMappings()` -- `historyArtist <-> collectionArtist`

**In-memory data structure** (no new data file):
```
aliasToCanonical: Map<string, string>       // any lowercased name -> canonical lowercased name
canonicalToAliases: Map<string, Set<string>> // canonical -> all known lowercased aliases
displayNames: Map<string, string>           // canonical lowercased -> preferred display casing
```

**Canonical name selection**: Prefer the Last.fm/history name since that's what's in the scrobble index.

**Union-find for transitive aliases**: If `A -> B` and `B -> C`, A/B/C are all the same group.

**Key methods**:
- `resolveArtist(name): string` -- canonical lowercase name
- `getAliases(name): string[]` -- all known lowercase variants
- `getDisplayName(name): string` -- preferred display casing
- `areSameArtist(a, b): boolean` -- alias check (two Map lookups)
- `async rebuild(): Promise<void>` -- rebuild graph from mapping sources
- `async detectMissingScrobbleMappings(): Promise<{discogsName, lastfmName}[]>` -- find album mappings that imply artist name differences but have no corresponding artistMappingService entry

**Existing data preserved**: This service creates NO new data files. It reads from existing `artist-mappings.json`, `album-mappings.json`, and `history-artist-mappings.json` without modification.

---

## Phase 2: Apply Resolver at Query Time (Primary Bug Fix)

Inject resolver via the existing setter pattern (matches `setMappingService()` at `statsService.ts:85`).

**`src/backend/services/statsService.ts`**:

Add setter:
```typescript
private artistNameResolver: ArtistNameResolver | null = null;

setArtistNameResolver(resolver: ArtistNameResolver): void {
  this.artistNameResolver = resolver;
}
```

Modify 4 methods (all with fallback to current `toLowerCase()` if resolver is null):

| Method | Line | Current | Change |
|--------|------|---------|--------|
| `getArtistDetail()` | ~1509 | `artist.toLowerCase() !== normalizedArtistName` | `!resolver.areSameArtist(artist, artistName)` |
| `getTopArtists()` | ~402 | `artist.toLowerCase()` for grouping | `resolver.resolveArtist(artist)` |
| `getTrackDetail()` | ~1692 | `entryArtist.toLowerCase() !== normalizedArtist` | `!resolver.areSameArtist(entryArtist, artist)` |
| `getNewArtistsThisMonth()` | ~999 | `artist.toLowerCase()` for grouping | `resolver.resolveArtist(artist)` |

**`src/backend/services/scrobbleHistoryStorage.ts`**:

Add setter + modify 2 methods:

| Method | Line | Change |
|--------|------|--------|
| `getUniqueArtists()` | ~465 | Group by `resolver.resolveArtist(artist)` instead of `artist.toLowerCase()` |
| `getArtistsPaginated()` | ~677 | Group by `resolver.resolveArtist(artist)` instead of `artist.toLowerCase()` |

**`src/backend/services/wrappedService.ts`**:

Apply resolver to artist grouping in `computeListeningStats()`.

---

## Phase 3: Auto-Detect & Create Missing Artist Mappings

**Goal**: When album mappings imply artist name differences (like `billy woods` != `Billy Woods, Kenny Segal`), auto-create the corresponding `artistMappingService` entry so future scrobbles use the correct Last.fm name.

**`src/server.ts`** -- add startup logic after service initialization:

```
1. Build resolver: const resolver = new ArtistNameResolver(artistMappingService, mappingService)
2. Detect missing: const missing = await resolver.detectMissingScrobbleMappings()
3. Auto-create: for each missing, call artistMappingService.setMapping(discogsName, lastfmName)
4. Rebuild resolver if any created
5. Inject into services: statsService.setArtistNameResolver(resolver), etc.
```

For the Billy Woods case, this auto-creates: `"Billy Woods, Kenny Segal" -> "billy woods"` in `artist-mappings.json`. Future scrobbles from this Discogs release go to Last.fm under "billy woods", preventing new split entries.

**Migration of existing data**: `artist-mappings.json` gains new entries via the established `artistMappingService.setMapping()` path. No schema change, no file migration. The existing 22 entries are preserved. New entries are appended.

---

## Phase 4: Rebuild Resolver on Mapping Changes

When mappings are added/removed via the UI, the resolver must refresh.

**`src/backend/routes/artistMapping.ts`**: Convert from static router export to `createArtistMappingRouter(resolver)` factory (matching every other route file's pattern). After `setMapping()`, `removeMapping()`, `importMappings()`, `clearAllMappings()`, call `resolver.rebuild()`.

**`src/backend/routes/suggestions.ts`**: After `addAlbumMapping()`, `removeAlbumMapping()`, `addArtistMapping()`, `removeArtistMapping()`, call `resolver.rebuild()` + run auto-detect for missing scrobble mappings.

---

## Phase 5: History Index Merge Tool

**New file**: `src/backend/services/historyIndexMergeService.ts`

Provides opt-in merge of existing split entries in `scrobble-history-index.json`.

**Methods**:
- `findSplitEntries(): Promise<MergeProposal[]>` -- dry-run scan
- `executeMerge(proposals): Promise<MergeReport>` -- merge with `writeJSONWithBackup` safety

**Merge algorithm**:
1. Load full index
2. For each `artist|album` key, resolve artist via `resolver.resolveArtist(artist)`
3. Group entries where resolved artist + album match but original keys differ
4. Merge: combine `plays` arrays (dedup by timestamp), sum `playCount`, max `lastPlayed`
5. Write via `writeJSONWithBackup` (creates `.bak` before modification)

**API endpoints** in `src/backend/routes/stats.ts`:
- `GET /api/v1/stats/split-entries` -- dry-run
- `POST /api/v1/stats/merge-split-entries` -- execute

**Startup**: Run `findSplitEntries()` on boot and log a warning if any found.

---

## Phase 6: Types & Wiring

**`src/shared/types.ts`**: Add `MergeProposal` and `MergeReport` interfaces (if exposing to frontend).

**`src/server.ts`**: Full wiring (see Phase 3 for sequence).

---

## Migration & Existing Data

| Data File | What Happens |
|-----------|-------------|
| `artist-mappings.json` (22 entries) | Preserved. New entries auto-added by Phase 3 via existing `setMapping()`. |
| `album-mappings.json` | Preserved. Read-only by resolver. No modifications. |
| `history-artist-mappings.json` (2 entries) | Preserved. Read-only by resolver. No modifications. |
| `track-mappings.json` | Not involved. Preserved. |
| `scrobble-history-index.json` | Split entries merged by Phase 5 tool with `writeJSONWithBackup` safety. Merge is opt-in via API, not automatic. |
| New data files | None. Resolver is purely in-memory. |
| Backup/restore compatibility | No changes needed. Auto-detected mappings are regular entries in `artist-mappings.json`. |

---

## Files Summary

| File | Type | Phase |
|------|------|-------|
| `src/backend/services/artistNameResolver.ts` | **NEW** | 1 |
| `src/backend/services/statsService.ts` | Modify 4 methods + add setter | 2 |
| `src/backend/services/scrobbleHistoryStorage.ts` | Modify 2 methods + add setter | 2 |
| `src/backend/services/wrappedService.ts` | Modify artist grouping | 2 |
| `src/backend/services/historyIndexMergeService.ts` | **NEW** | 5 |
| `src/backend/routes/artistMapping.ts` | Convert to factory + add rebuild | 4 |
| `src/backend/routes/suggestions.ts` | Add rebuild calls | 4 |
| `src/backend/routes/stats.ts` | Add merge endpoints | 5 |
| `src/server.ts` | Wire resolver, auto-detect, inject | 6 |
| `src/shared/types.ts` | Add merge types | 5 |

---

## Rollout Order

**Ship Phases 1+2+3+6 together** (core fix):
- Resolver reads existing data, stats aggregate across aliases, missing mappings auto-created
- Immediate result: Billy Woods page shows all 51 scrobbles with correct "Last played"

**Ship Phase 4 next** (rebuild on UI changes):
- New mappings immediately reflected without restart

**Ship Phase 5 last** (index merge):
- Optional cleanup -- lower priority since Phase 2 already handles display correctly at query time

---

## Verification

1. **Before**: Visit Billy Woods artist page, confirm stale "Last played"
2. **After Phase 1-3**: Check server logs for auto-created mapping `"Billy Woods, Kenny Segal" -> "billy woods"`
3. **After Phase 2**: Billy Woods page shows all scrobbles including compound-name entries
4. **Scrobble test**: Play a track from compound-artist Discogs release, verify it lands under canonical name in index
5. **Run tests**: `npm test` -- coverage thresholds must pass
6. **Run CI checks**: `npm run lint && npm run typecheck && npm run build`
