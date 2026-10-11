# Plan: Album Name Aliasing & History Merge

> **Status: Complete (October 2026), implemented differently from this plan.**
>
> - Manual merges use album mappings rather than a separate alias service: a
>   mapping with `collectionId: 0` merges one history album into another
>   (artist page "Merge" action), and a linked mapping points versions at a
>   collection item. Stats, Top Albums, Rankings, Wrapped, album/track detail,
>   coverage and suggestions all count merged versions as one album.
> - Auto-detection (Part A) shipped as the "Suggested Album Merges" card in
>   Settings > Mappings (`albumMergeSuggestions.ts`), with one-click Merge and
>   Dismiss.
> - Not done, deliberately: physically rewriting the history index (`/merge`).
>   Mappings get the same result without modifying history, and can be undone.
>   Widening `fuzzyNormalizeKey()` bracket stripping was measured against real
>   data and found to gain 1 play, so it was skipped.

## Problem

The scrobble history index keys albums by `artist|album` (lowercased). When the same album appears under different names in Last.fm history (e.g. `"old"` vs `"old [explicit] [+digital booklet]"`), they end up as separate entries with independent play counts. There's no way to merge them unless one version happens to exist in the user's Discogs collection (the Discovery Missing Albums mapping flow).

## Current State

### What exists

1. **`fuzzyNormalizeKey()`** in `scrobbleHistoryStorage.ts:77-113` — strips known edition suffixes (`[Explicit]`, `[Deluxe]`, `(Remastered 2021)`, etc.) for cross-source matching. Used by `getAlbumHistoryFuzzy()` and `getAlbumListeningArc()`, but **not** by `getTopAlbums()` or `HistoryIndexMergeService`.

2. **`HistoryIndexMergeService`** — merges split history entries, but only detects splits where the **artist** name differs (via `ArtistNameResolver`). Album names must match exactly after lowercasing.

3. **Album mappings** (`MappingService`) — maps `historyArtist|historyAlbum` → `collectionArtist|collectionAlbum`. Requires a Discogs `collectionId` target, so can't be used for history-to-history aliasing.

### What's missing

- No album-level aliasing (equivalent of `ArtistNameResolver` for albums)
- `HistoryIndexMergeService` doesn't group by fuzzy album name
- `fuzzyNormalizeKey()` doesn't catch all variants (e.g. `[+digital booklet]` isn't in the allowlist)
- No manual "merge these two history albums" capability
- `getTopAlbums()` doesn't deduplicate fuzzy matches

## Proposed Solution

Two-part approach: (A) improve automatic detection via fuzzy matching, (B) add manual album alias mappings for cases fuzzy matching can't catch.

### Part A: Extend HistoryIndexMergeService with fuzzy album grouping

**File: `src/backend/services/historyIndexMergeService.ts`**

Update `findSplitEntries()` to also detect album-name splits:

1. After the existing artist-based grouping pass, add a second pass that groups by `resolvedArtist + fuzzyNormalizedAlbum` (reusing `fuzzyNormalizeKey()` logic from `scrobbleHistoryStorage`).
2. For groups with 2+ entries where the album names differ, produce `MergeProposal` objects. Pick the canonical key as the entry with the highest play count (the user's expected behavior — "map the one with lower count to the other").
3. Keep both passes — artist-split detection and album-split detection — and return a combined list.

**File: `src/backend/services/scrobbleHistoryStorage.ts`**

Widen the `fuzzyNormalizeKey()` bracket-stripping regex to catch **all** bracket-enclosed suffixes, not just an allowlist:

```
Current:  \[(explicit|deluxe|...)\]
Proposed: \[[^\]]*\]
```

This catches `[+digital booklet]`, `[+bonus tracks]`, `[clean]`, and any other bracket annotation Last.fm might use. The existing granular list is overly conservative for history-to-history matching (it was designed for cross-source matching where false positives are more costly).

Add a `fuzzyNormalizeAlbum(album: string): string` as a **public static method** so `HistoryIndexMergeService` can reuse it without duplicating the normalization logic.

### Part B: Manual album alias mappings

#### Types

**File: `src/shared/types.ts`**

```typescript
export interface AlbumAliasMapping {
  /** The canonical album key (artist|album, lowercased) to merge into */
  canonicalArtist: string;
  canonicalAlbum: string;
  /** The alias album key that should be treated as the same album */
  aliasArtist: string;
  aliasAlbum: string;
  /** Whether this was auto-detected or manually created */
  autoDetected: boolean;
  createdAt: number;
}

export interface AlbumAliasMappingsStore extends VersionedStore {
  schemaVersion: 1;
  mappings: AlbumAliasMapping[];
}
```

#### Persistence service

**New file: `src/backend/services/albumAliasMappingService.ts`**

Follows `CompoundArtistMappingService` pattern:
- Storage: `mappings/album-alias-mappings.json` via `FileStorage.writeJSONWithBackup()`
- In-memory map keyed by `aliasArtist|aliasAlbum` (lowercased)
- CRUD: `getAllMappings()`, `addMapping()`, `removeMapping()`, `getMapping()`
- `getCanonicalAlbumKey(artist, album)`: returns the canonical `{artist, album}` if an alias exists, or null
- `autoDetectFromHistoryIndex(index)`: scans the history index using fuzzy normalization, proposes alias mappings for groups with 2+ entries (highest play count entry becomes canonical)

#### Integration with HistoryIndexMergeService

**File: `src/backend/services/historyIndexMergeService.ts`**

- Constructor gains optional `AlbumAliasMappingService` parameter
- `findSplitEntries()` checks manual album aliases in addition to fuzzy normalization
- When a manual alias exists, always use it (takes precedence over fuzzy detection)

#### API endpoints

**New file: `src/backend/routes/albumAliases.ts`**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | List all album alias mappings |
| POST | `/` | Add alias `{ aliasArtist, aliasAlbum, canonicalArtist, canonicalAlbum }` |
| DELETE | `/` | Remove alias by `{ aliasArtist, aliasAlbum }` |
| POST | `/auto-detect` | Scan history index, return detected alias candidates |
| POST | `/merge` | Execute merge: apply alias mappings to history index (combines plays, deletes alias entry) |

Mount at `/api/v1/album-aliases` in `server.ts`.

The `/merge` endpoint is the key action — it:
1. Looks up the alias and canonical entries in the history index
2. Combines plays (deduplicating by timestamp, same as existing merge service)
3. Deletes the alias entry from the index
4. Creates a backup before writing

#### Frontend API client

**File: `src/renderer/services/api.ts`**

Add methods:
- `getAlbumAliases()`
- `addAlbumAlias(aliasArtist, aliasAlbum, canonicalArtist, canonicalAlbum)`
- `deleteAlbumAlias(aliasArtist, aliasAlbum)`
- `autoDetectAlbumAliases()`
- `mergeAlbumAliases()`

#### Settings UI

**File: `src/renderer/components/settings/SettingsMappingsSection.tsx`**

New card in the mappings section:
- Header: "Album Aliases" with lucide `Disc3` icon + count badge
- Info text: "Merge duplicate albums in your scrobble history that have different names (e.g. editions, explicit tags)."
- Auto-detect button (scans history, shows candidates)
- Table: alias → canonical, with delete button
- "Merge Now" button that executes the actual history index merge
- Add form: artist input, alias album input, canonical album input

### Part C: Wire into stats aggregation

**File: `src/backend/services/statsService.ts`**

In `getTopAlbums()`: after loading the history index, resolve each album entry through `albumAliasMappingService.getCanonicalAlbumKey()`. If an alias exists, aggregate that entry's plays into the canonical entry's count. This makes stats reflect merges immediately even before the user runs a physical merge on the history index.

Same treatment for `getAlbumDetail()` — when querying for an album, also include plays from any known aliases.

## Startup sequence changes

```
1. Construct AlbumAliasMappingService(fileStorage)
2. Construct HistoryIndexMergeService(resolver, fileStorage, albumAliasMappingService)
3. Mount /api/v1/album-aliases route
```

No rebuild or auto-detection at startup — album alias detection is user-triggered since it modifies history data and should be reviewed before applying.

## Files modified

| File | Change |
|------|--------|
| `src/backend/services/scrobbleHistoryStorage.ts` | Widen fuzzy regex, extract public `fuzzyNormalizeAlbum()` |
| `src/backend/services/historyIndexMergeService.ts` | Add fuzzy album grouping pass, album alias integration |
| `src/backend/services/statsService.ts` | Resolve album aliases in `getTopAlbums()`, `getAlbumDetail()` |
| `src/shared/types.ts` | `AlbumAliasMapping`, `AlbumAliasMappingsStore` |
| `src/server.ts` | Construct service, mount route |
| `src/renderer/services/api.ts` | New API methods |
| `src/renderer/components/settings/SettingsMappingsSection.tsx` | New UI card |

## New files

| File | Purpose |
|------|---------|
| `src/backend/services/albumAliasMappingService.ts` | Persist/CRUD album alias mappings |
| `src/backend/routes/albumAliases.ts` | API endpoints |
| `tests/backend/services/albumAliasMappingService.test.ts` | Service tests |
| `tests/backend/routes/albumAliases.test.ts` | Route tests |

## Verification

1. `tsc --noEmit` — type-check passes
2. `npm test` — all existing + new tests pass
3. Manual test: with "Danny Brown|old" and "Danny Brown|old [explicit] [+digital booklet]" in history, auto-detect finds them as candidates, merge combines plays into single entry
4. Manual test: `getTopAlbums()` shows combined count even before physical merge
5. UI: Settings > Mappings shows album aliases card with auto-detect and merge controls
