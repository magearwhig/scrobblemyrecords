# Data Export Plan: CSV/JSON Data Portability (Backlog #9)

Backlog Effort D from [backlog-shark-tank-2026-03-08.md](backlog-shark-tank-2026-03-08.md).
Companion plan: [pocket-list-export-plan.md](pocket-list-export-plan.md), the offline PDF shopping reference. Both plans share one backend data-preparation layer, which **this plan defines** (see [Shared export data layer](#shared-export-data-layer-contract)).

## Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Shared export data layer (`exportDataService`) | Not started | Pocket List depends on this |
| Phase 2: Collection + wishlist file export (CSV/JSON) + Settings UI | Not started | |
| Phase 3: Plays + mappings datasets | Not started | |
| Phase 4: Collection/want cache fidelity (catno, instance id, formats) | Not started | Optional; improves row completeness |

---

## Overview

Let users take their data out of Listenography in documented, machine-readable files (CSV and JSON) for spreadsheets, scripts, other music apps or archives. The original pitch called this a "data portability / trust signal".

### Purpose, compared with the Pocket List and backups

| | **Data export (this plan)** | **Pocket List** ([plan](pocket-list-export-plan.md)) | **Backup** (`backupService.ts`) |
|---|---|---|---|
| Purpose | Data portability, for use in *other* tools | Readable offline shopping reference | Restore *this app's* own state |
| Audience | Machines and power users | A person in a record store | Listenography itself |
| Completeness | Complete: every row, every documented field | Curated: chosen fields, collated and sorted for reading | Complete for app-owned files only |
| Format | CSV + JSON, stable documented schema | PDF layout | Internal `BackupFile` JSON (`version: 2`) with checksum |
| Schema stability | Versioned, additive changes only within a version | Free to change | Follows internal types; import-validated |
| Secrets | **Never** | Never | Credentials optional and password-encrypted |
| Derived/API data (collection, wants, plays) | Included | Included (subset) | **Excluded**: backups hold only data that "cannot be recovered from external APIs" (`BackupData` doc comment) |

Exports are read-only. They have no import path, and they are never used to restore the app.

---

## Verified current state (2026-10-11)

### What exists
- **Only piecemeal exports exist**:
  - `GET /api/v1/artist-mappings/export` (`artistMappingService.exportMappings()`) returns the Discogs→Last.fm scrobble artist mappings as JSON with `Content-Disposition`.
  - `ForgottenFavoritesTab` builds a CSV client-side, quoting every cell and doubling `"`.
  - `POST /api/v1/backup/export` produces app backups.
  - There is no `/api/v1/export` route, no CSV utility and no zip or CSV dependency in `package.json`.
- **Collection**: `getAllCachedCollectionItems(username, fileStorage)` in `src/backend/utils/collectionCache.ts` returns the cached `CollectionItem[]` from `collections/{username}-page-N.json`. The current cache has 1,189 items.
- **Discogs wants**: `WishlistService.getWishlistItems()` returns `EnrichedWishlistItem[]` from `wishlist/wishlist-items.json` (206 items). Versions per master are cached in `wishlist/versions-cache.json` (`VersionsCache`, `ReleaseVersion` with `format[]`, `label`, `country`, `year`).
- **Local wants**: `WishlistService.getLocalWantList()` returns `LocalWantItem[]` from `wishlist/local-want-list.json` (13 items).
- **Plays**: `ScrobbleHistoryStorage.getIndex()` returns `ScrobbleHistoryIndex` (`history/scrobble-history-index.json`, 5,083 album keys, 55,159 plays, about 5.8 MB).
- **Mappings**:
  - `MappingService.getAllAlbumMappings()` / `getAllArtistMappings()` (history→collection).
  - `artistMappingService.getAllMappings()` (scrobble Discogs→Last.fm).
  - `trackMappingService`.
  - `compoundArtistMappingService`.
- **Canonicalization helpers** in `src/shared/utils/albumMapping.ts`: `stripDiscogsSuffix`, `albumGroupKey`, `createAlbumCanonicalizer`, `createCollectionNameResolver`. `lookupMergedHistory` is in `mergedAlbumHistory.ts`. The display name comes from `ArtistNameResolver.getDisplayName`.

### Data-quality gaps the export must handle (verified in code and in the current cache)
1. **No stable per-copy id.** `CollectionItem.id` is the Discogs *release* id. The transforms in `discogsService` copy `item.id` and never capture `instance_id` (it's absent from `DiscogsRawCollectionItem`). Two copies of one release share an id (10 duplicate ids in the current cache). `folder_id` is never populated.
2. **Catalog numbers are always empty.** The transform reads `basic_information.catalog_number`, which Discogs doesn't send. Catalog numbers live in `basic_information.labels[].catno` (`DiscogsRawLabel.catno`), and the transform maps labels to `name` only. 0 of 1,189 cached items have a `catalog_number`.
3. **Formats are names only** (`"Vinyl"`, `"CD"`). `DiscogsRawFormat.descriptions` (LP, Album, Reissue…) and `qty` are dropped. Genres and styles are absent from collection items, though they exist in the per-release cache `collections/release-{id}.json` (`DiscogsRelease.genres` / `styles`) when that release was fetched.
4. **Artist strings are joined** with `", "`, ignoring Discogs `join` values, and keep per-artist disambiguation suffixes ("Turnstile (2)"). 75 cached collection items contain a `(N)` suffix and 47 are multi-artist. `stripDiscogsSuffix` only strips a *trailing* suffix.
5. **Collection notes** (`CollectionItem.notes: CollectionNote[]`): 272 items, only `field_id` 1/2 (Media/Sleeve condition), with no free-text field values. Field labels aren't fetched. See [listening-notes-plan.md](listening-notes-plan.md).
6. **Discogs wants drop formats/labels.** `WishlistService.syncWishlist` keeps only artist, title, year, cover, `dateAdded`, notes and rating from `basic_information`. The want's own format and label are recoverable only from the versions cache entry whose `releaseId` matches. 5 wants have `masterId: 0`.
7. **Nothing matches wants against the collection.** Neither `wishlistService` nor `WishlistPage` cross-references the collection. "Already own a version" status is new logic.
8. **The plays index loses original casing and some scrobbles.**
   - Keys are `artist.toLowerCase().trim()|album.toLowerCase().trim()` (`ScrobbleHistorySyncService.normalizeKey`), so raw Last.fm casing is lost for artist and album. Track names keep their original casing.
   - Scrobbles **without an album** are skipped at index time (`if (!artist || !album || !timestamp) continue`), so they can't be exported.
   - `getAllAlbums()` splits keys on `'|'`, and 1 current key contains an extra `|`.
9. **Timestamp units are mixed.**

   | Field | Unit / format |
   |-------|---------------|
   | History `plays[].timestamp`, `lastPlayed`, `oldestScrobbleDate` | Unix **seconds** |
   | History `lastSyncTimestamp` | **ms** |
   | `LocalWantItem.addedAt` | **ms** |
   | `LocalWantItem.lastPlayed` | **seconds** |
   | Discogs `date_added` / `WishlistItem.dateAdded` | ISO strings with a local offset (e.g. `2020-12-04T19:42:05-08:00`) |
   | Mapping `createdAt` / `dateAdded` | **ms** |

   The `isLikelySeconds` / `normalizeToMs` helpers exist in `src/backend/utils/timestamps.ts`. Even so, the export uses an **explicit per-field unit** and never a heuristic.
10. **Local wants store a master id in `releaseId`.** `WishlistService.searchForRelease()` (`wishlistService.ts:821`) searches `/database/search` with `type: 'master'`, so each result's `id` *is* a master id, yet it is returned as `releaseId: result.id` (line 876) next to `masterId: result.master_id || result.id` (875). `addToLocalWantList()` (1025, 1044) and `checkLocalWantListForVinyl()` (1114) persist `searchResults[0].releaseId` into `LocalWantItem.releaseId` in `wishlist/local-want-list.json`. In the current data all 11 local wants that have one store `releaseId === masterId`. A master id and a release id are different number spaces, so treating it as a release id can collide with an unrelated collection release. The `masterId` is also only the **first search hit**, never confirmed by the user. Today's readers that trust it: `LabelMonitoringService.loadUserReferenceSets()` (`labelMonitoringService.ts:830`, adds it to `wishlistReleaseIds`) and `ReleaseTrackingService` (`releaseTrackingService.ts:1615`, passes `bestMatch.releaseId` from the same search to `addToDiscogsWantlist`, which PUTs `/users/{u}/wants/{id}`). The code fix is tracked as tech debt, not here. The export works around it (see [Local-want ids](#local-want-ids)).
11. **The collection cache can be partial and still look fresh.** Each page file `collections/{username}-page-N.json` is `{ success, data, pagination, timestamp }`, and `pagination` carries the expected `pages` and `items` (24 / 1,189 today). `getAllCachedCollectionItems()` stops silently at the first missing or empty page and returns only what it read, with no timestamps. `preloadAllCollectionPages()` logs and skips a failed page, then writes `status: 'completed'` with every page listed in `completedPages`, so `{username}-progress.json` can't prove completeness either.
12. **Discard-pile ids are release ids.** `DiscardPileItem.collectionItemId` is documented as the "instance ID (CollectionItem.id)", but `CollectionItem.id` is the release id (gap 1). A discard therefore can't tell two copies of one release apart. Today there are 36 discards, all `traded_in`, and none is still in the collection cache.
13. **Backup gaps (for context, out of scope here).** `backupService` FILE_PATHS do not include `mappings/track-mappings.json`, `mappings/compound-artist-mappings.json`, `mappings/dismissed-album-merges.json` or the `data/scrobbles/session-*.json` files. These belong in `tech-debt.md` or a backup follow-up, not here.

---

## Shared export data layer (contract)

**Owner: this plan.** The [Pocket List plan](pocket-list-export-plan.md) consumes these rows and owns readable collation, sorting, grouping, field selection and the PDF layout. Neither consumer re-reads raw caches for collection or wishlist data.

### Location
- `src/backend/services/exportDataService.ts` (new). It has no Express dependencies and is constructed with `FileStorage`, `AuthService` (for the Discogs username only), `WishlistService`, `MappingService` and `ArtistNameResolver`.
- Row types live in `src/shared/types.ts`, under an `// Export Types (Backlog #9)` section, so frontend previews can type them.

### Types

```typescript
export const EXPORT_SCHEMA_VERSION = 1;

export type ExportRowSource = 'discogs-collection' | 'discogs-want' | 'local-want';

/** Whether a wanted item is already in the collection. */
export type OwnedMatchStatus =
  | 'owned-same-release'   // a collection row has the same *confirmed* releaseId
  | 'owned-other-version'  // a collection row has the same masterId (> 0)
  | 'owned-name-match'     // no id match; the name keys match (see Identity and name keys)
  | 'not-owned'
  | 'unknown';             // collection cache missing, unreadable, or partial (see Cache completeness)

/**
 * Where a masterId came from.
 * - 'release-data': copied from Discogs data for this exact release
 *   (collection basic_information.master_id, want basic_information.master_id).
 *   This is a "confirmed master".
 * - 'search-guess': the first hit of a Discogs master search by artist/album
 *   (LocalWantItem.masterId via searchForRelease). Never confirmed by the user.
 */
export type MasterIdSource = 'release-data' | 'search-guess';

/** How sure a cross-row link is. Consumers decide what to show or merge. */
export type MatchConfidence =
  | 'certain'    // same confirmed releaseId
  | 'confident'  // same confirmed (release-data) masterId on both sides
  | 'likely';    // involves a search-guess masterId, or names only

export type MatchBasis = 'release-id' | 'master-id' | 'search-master-id' | 'name';

export interface ExportRowLink {
  rowId: string;
  basis: MatchBasis;
  confidence: MatchConfidence;
}

export interface ExportCollectionRow {
  rowId: string;               // stable: "discogs-collection:{releaseId}:{copyIndex}" (see Stable ids)
  source: 'discogs-collection';
  releaseId: number;
  masterId: number | null;     // null when absent or 0
  masterIdSource: MasterIdSource | null; // 'release-data' whenever masterId is set
  copyIndex: number;           // 1-based among copies of this release, ordered by dateAdded then cache order
  copyCount: number;           // copies of this release in the collection, repeated on every copy's row:
                               // two rows that each say copyCount: 2 are two copies in total, not four.
                               // Count copies by counting rows; never sum copyCount.
  artistRaw: string;           // exactly as cached from Discogs, e.g. "Turnstile (2), Someone (3)"
  artistDisplay: string;       // Discogs "(N)" suffixes stripped from every joined artist (display/sort only)
  artistIdentityKey: string;   // see Identity and name keys; keeps the "(N)" suffixes
  albumNameKey: string;        // see Identity and name keys; suffix-insensitive
  title: string;
  year: number | null;         // Discogs 0 → null
  formats: string[];           // e.g. ["Vinyl"]; descriptions added in Phase 4
  labels: string[];
  catalogNumbers: string[];    // [] until Phase 4 captures labels[].catno
  genres: string[] | null;     // from release details cache when present, else null
  styles: string[] | null;
  rating: number | null;       // Discogs 0 → null
  mediaCondition: string | null;   // CollectionNote field_id 1
  sleeveCondition: string | null;  // CollectionNote field_id 2
  notes: string | null;            // CollectionNote field_id 3 (free text)
  customFields: Array<{ fieldId: number; value: string }>; // any other field ids
  dateAdded: string;           // ISO 8601 UTC, second precision, e.g. "2020-12-05T03:42:05Z"
  dateAddedUnix: number;       // seconds
  dateAddedRaw: string;        // Discogs original string with offset
  coverImageUrl: string | null;
}

export interface ExportWishlistRow {
  rowId: string;               // "discogs-want:{wantId}" | "local-want:{localId}"
  source: 'discogs-want' | 'local-want';
  releaseId: number | null;    // discogs-want: WishlistItem.releaseId. local-want: ALWAYS null (see Local-want ids)
  masterId: number | null;     // null when absent or 0
  masterIdSource: MasterIdSource | null; // discogs-want: 'release-data'; local-want: 'search-guess'
  artistRaw: string;
  artistDisplay: string;
  artistIdentityKey: string | null; // null for local wants (Last.fm names carry no Discogs identity)
  albumNameKey: string;
  title: string;               // WishlistItem.title / LocalWantItem.album
  year: number | null;
  formats: string[];           // discogs-want: from VersionsCache entry matching releaseId, else []
  labels: string[];            // same source; [] for local wants
  catalogNumbers: string[];    // [] until Phase 4
  notes: string | null;        // WishlistItem.notes; null for local wants
  priority: number | null;     // WishlistItem.rating (0–5); null for local wants
  dateAdded: string;           // ISO 8601 UTC
  dateAddedUnix: number;       // seconds
  dateAddedRaw: string | number; // Discogs ISO string, or LocalWantItem.addedAt (ms)
  vinylStatus: 'has_vinyl' | 'cd_only' | 'unknown' | 'checking';
  lowestVinylPrice: number | null; // EnrichedWishlistItem.lowestVinylPrice
  priceCurrency: string | null;
  playCount: number | null;    // LocalWantItem.playCount; null for discogs wants
  ownedMatch: OwnedMatchStatus;
  ownedMatchConfidence: MatchConfidence | null; // null for not-owned / unknown
  ownedCollectionRowIds: string[];   // collection rowIds that produced the match (all of them, not just the first)
  ownedCollectionLinks: ExportRowLink[]; // same rows, with basis and confidence per row
  relatedWishlistLinks: ExportRowLink[]; // same release/master/album in the OTHER wishlist source, every
                                         // confidence included; consumers must not treat 'likely' as "same item"
  searchMasterIdCandidate: number | null; // local-want only: the stored LocalWantItem.releaseId when it
                                          // differs from masterId (provenance only; never used for matching)
  coverImageUrl: string | null;
}

export interface ExportCollectionCacheInfo {
  status: 'complete' | 'partial' | 'missing';
  pagesExpected: number | null;  // page-1 pagination.pages
  pagesRead: number;             // consecutive pages read from page 1
  itemsExpected: number | null;  // page-1 pagination.items
  itemsRead: number;
  oldestPageAt: string | null;   // ISO; the age of the stalest data
  newestPageAt: string | null;
}

export interface ExportSnapshotMeta {
  schemaVersion: typeof EXPORT_SCHEMA_VERSION;
  generatedAt: string;               // ISO 8601 UTC
  collectionCachedAt: string | null; // OLDEST page timestamp of the pages read (= collectionCache.oldestPageAt)
  collectionCache: ExportCollectionCacheInfo;
  wishlistUpdatedAt: string | null;  // WishlistStore.lastUpdated
  historySyncedAt: string | null;    // ScrobbleHistoryIndex.lastSyncTimestamp (ms → ISO)
  discogsUsername: string | null;    // identifies whose data it is; no tokens
}
```

### Service API

```typescript
class ExportDataService {
  getCollectionRows(): Promise<ExportCollectionRow[]>;
  getWishlistRows(opts?: { sources?: Array<'discogs-want' | 'local-want'> }): Promise<ExportWishlistRow[]>;
  getSnapshotMeta(): Promise<ExportSnapshotMeta>;
}
```

### Rules both consumers can rely on
- **Machine order only.** Rows come back sorted by `source`, then `rowId`. Any human-readable sort or collation (articles, diacritics, grouping by artist) belongs to the Pocket List plan.
- **Complete rows.** Every collection item and every want is included, with nothing filtered or hidden. Consumers curate. Absent values are `null` or `[]`, never `""`, `0` or `"Unknown"`.
- **Raw, display and identity all present.** `artistRaw` is never modified. Identity uses `artistIdentityKey` (suffixes kept); `artistDisplay` is for display and sorting only. `artistDisplay` comes from a new shared helper, `stripDiscogsSuffixes(artist)`, in `src/shared/utils/albumMapping.ts`. It removes `\s*\(\d+\)` before each `,` and at the end; the existing `stripDiscogsSuffix` stays as it is. Album-mapping and alias canonicalization is **not** applied to collection or wishlist rows, because Discogs names *are* the canonical targets. It appears only in the plays and mappings datasets.
- **Owned-match rules**, first hit wins; every matching collection row is listed, not just the first:
  1. Same confirmed `releaseId` → `owned-same-release`, `certain`. Only Discogs wants can reach this tier, because local-want `releaseId` is always `null`.
  2. Same `masterId` > 0 → `owned-other-version`. Confidence is `confident` when both sides are `release-data`, `likely` (basis `search-master-id`) when the want's master is a `search-guess`.
  3. Name match → `owned-name-match`, `likely`. Discogs want vs collection: equal `artistIdentityKey` **and** equal `albumNameKey`. Local want vs collection: equal `albumNameKey` only (Last.fm names have no suffix to compare; see below).
  4. Otherwise `not-owned`.
  5. `unknown` when the collection cache is `missing` or unreadable. When it is `partial`, positive matches stay, but what would be `not-owned` becomes `unknown`, because the missing pages may hold the album.

  Local wants match on `album` as the title. A search-guess master that matches is never upgraded to `confident`, even if the names also agree.
- **Related wishlist links** (`relatedWishlistLinks`) use the same bases and confidences between a Discogs want and a local want (same master, or `albumNameKey`). Every link is kept, including `likely` ones. With today's data the only overlap (1 local want sharing a master with a Discogs want) is `likely`, because every local-want master is a search guess.

### Identity and name keys

Display normalization is not identity. Discogs "(N)" suffixes tell apart **different artists** with the same name ("Artist (2)" and "Artist (3)" are two people), so they stay in the identity key and are stripped only for display and sort.

- `artistIdentityKey` (Discogs rows only): `albumGroupKey`-style simplification of `artistDisplay` per joined artist, followed by each artist's suffix (`""` when it has none), e.g. `"turnstile#2,someone#3"`. "Artist", "Artist (2)" and "Artist (3)" are three identities. New helper `discogsArtistIdentityKey(artistRaw)` in `src/shared/utils/albumMapping.ts`.
- `albumNameKey`: `albumGroupKey(artistDisplay, title)`. It ignores case, Latin accents, punctuation and suffixes. Since the 2026-10-11 fix, `albumGroupKey` keeps Unicode combining marks (`[^\p{L}\p{N}\p{M}]` after stripping U+0300–U+036F), so Devanagari "क", "का", "कि", "कु" stay distinct. It is a *grouping/candidate* key, never proof of identity on its own.
- Local wants are Last.fm-derived names, where a "(N)" suffix never exists, so they have no `artistIdentityKey` and can only reach `likely` matches.
- Today's data: suffix-preserving name matching gives the same counts as the suffix-insensitive key (1 name-only match), and 1 collection artist name exists under two different suffixes, which now stays split.

### Local-want ids

`LocalWantItem.releaseId` holds a **master** id from a master search (gap 10), so the shared layer never exports it as `releaseId`:

- `releaseId` is always `null` for local wants in schema v1.
- `masterId` comes from `LocalWantItem.masterId` with `masterIdSource: 'search-guess'`.
- If the stored `releaseId` differs from `masterId` (not the case in today's data), it is exported only as `searchMasterIdCandidate`, for provenance, and is never matched against anything.
- Once the tech-debt fix stores a real, user-confirmed release or master, the source value changes additively (e.g. a new `MasterIdSource` value `'user-confirmed'`), with no schema bump.

### Cache completeness

`getAllCachedCollectionItems()` stays as it is for its current callers. The shared layer uses a new sibling `readCollectionCacheSnapshot(username, fileStorage)` in `collectionCache.ts`, which returns `{ items, info: ExportCollectionCacheInfo }`:

- It reads consecutive pages from page 1, as today, and also collects each page's `timestamp` and page 1's `pagination.pages` / `pagination.items`.
- `complete`: `pagesRead === pagesExpected` and `itemsRead === itemsExpected`. `partial`: anything less (or `pagination` absent on a page that has data). `missing`: no page 1.
- `collectionCachedAt` reports the **oldest** page read, so a half-refreshed cache never looks newer than its stalest page.
- The `{username}-progress.json` file is not used: it says `completed` even when pages failed.

Discard-pile curation is **not** part of the contract. Rows stay complete, and ownership ignores discards. Release-level discard ids can't distinguish duplicate copies (gap 12), so any discard filtering waits until Phase 4 captures `instance_id`.
- **No side effects.** Read-only, and no API calls. Don't call `artistMappingService.getLastfmName()`, which writes `lastUsed`.
- **No secrets.** Settings are read only for `discogs.username`. Tokens, session keys, API tokens and AI keys never enter rows or meta.
- **Stability.** Within `EXPORT_SCHEMA_VERSION = 1`, fields may be *added* but not renamed, removed or re-typed. A breaking change bumps the version and is noted in this plan.

### Stable ids
- `discogs-want:{WishlistItem.id}` and `local-want:{LocalWantItem.id}` are already stable.
- Collection rows use `discogs-collection:{releaseId}:{copyIndex}` until Phase 4 captures `instance_id`. After that they use `discogs-collection:{instanceId}`, which bumps to schema version 2 *or* adds an `instanceId` field and keeps `rowId` the same. Decide in Phase 4 (see Open decisions). `copyIndex` is stable as long as copies of the same release aren't added or removed.

---

## Datasets (file export)

All datasets ship as CSV and JSON. Phases 2–3 build on the shared layer.

| Dataset | Rows | Source | Phase |
|---------|------|--------|-------|
| `collection` | `ExportCollectionRow` + `playCount`, `lastPlayedAt`, `lastPlayedAtUnix` | Shared layer + `createCollectionNameResolver` + `lookupMergedHistory` (plays across album-mapped names) | 2 |
| `wishlist` | `ExportWishlistRow` (both sources; `source` column distinguishes) | Shared layer | 2 |
| `plays` | One row per scrobble in the history index | `ScrobbleHistoryStorage.getIndex()` | 3 |
| `mappings` | One row per mapping, with a `mappingType` column | Mapping services | 3 |
| `album-notes` | `AlbumNote` rows | [listening-notes-plan.md](listening-notes-plan.md), after that ships | Later |
| `discard-pile` | `DiscardPileItem` rows | `discardPileService` | Later |

### `plays` fields: original and corrected metadata
| Field | Meaning |
|-------|---------|
| `playedAt` / `playedAtUnix` | ISO 8601 UTC / Unix seconds as stored |
| `artistAsScrobbled`, `albumAsScrobbled` | From the index key: **lowercased and trimmed** (original casing isn't stored; documented) |
| `track` | Original casing from Last.fm |
| `artistCorrected`, `albumCorrected` | After album mappings (`createAlbumCanonicalizer` with the same artist resolver Top Albums uses), with artist display casing from `ArtistNameResolver.getDisplayName` |
| `correctedBy` | `album-mapping` \| `artist-alias` \| `none` |
| `albumGroupKey` | The canonicalizer's `.key`, so consumers can regroup versions the way the app does |
| `collectionReleaseId` | Set when the album mapping links to a collection item (`collectionId > 0`), else empty |

Documented limitations: scrobbles without an album and now-playing entries aren't in the index. For keys with more than one `|`, the first `|` is the separator.

### `mappings` fields
`mappingType` (`album` \| `history-artist` \| `scrobble-artist` \| `track` \| `compound-artist`), `fromArtist`, `fromAlbum`, `fromTrack`, `toArtist`, `toAlbum`, `toTrack`, `collectionId`, `createdAt` / `createdAtUnix`. Columns that don't apply are empty. In JSON, each mapping type keeps its native shape under `mappings[type]`.

### Formats
- **JSON**:
  ```json
  { "format": "listenography-export", "schemaVersion": 1, "dataset": "collection",
    "meta": ExportSnapshotMeta, "rowCount": 1189, "rows": [ ... ] }
  ```
  The `all` download is one JSON object with `datasets: { collection, wishlist, plays, mappings }`. Arrays stay arrays.
- **CSV**:
  - RFC 4180, UTF-8, CRLF line endings, a header row of the exact field names above, and a comma delimiter.
  - A field is quoted when it contains `,`, `"`, CR, LF, or leading or trailing whitespace, and `"` is doubled.
  - `null` is written as an empty cell. Booleans are `true`/`false`. Numbers use plain notation with no thousands separators.
  - Arrays are joined with `"; "`. Array values aren't escaped beyond CSV quoting, so JSON is the lossless format.
  - `customFields` is serialized as `fieldId=value` pairs joined with `"; "`.
- **Formula injection**: cell values are **not** prefixed or altered, because real artist names start with `+`, `-` or `=`. Open decision: an opt-in "spreadsheet-safe" toggle.
- New `src/shared/utils/csv.ts` (`toCsv(headers, rows)`), unit-tested. `ForgottenFavoritesTab` can adopt it later.

### File naming
`listenography-{dataset}-{YYYY-MM-DD}.{csv|json}` in local date, e.g. `listenography-wishlist-2026-10-11.csv`. The bundle is `listenography-export-{YYYY-MM-DD}.json`. There's no zip in the MVP; a multi-CSV zip would need a new dependency.

---

## API

New `src/backend/routes/export.ts`, mounted at `/api/v1/export` in `src/server.ts`. It is covered by the global `requireApiToken` middleware and `apiLimiter` like every other route.

| Method | Path | Returns |
|--------|------|---------|
| GET | `/meta` | `ExportSnapshotMeta` only (Phase 1; used by the Pocket List dialog and the Settings card) |
| GET | `/datasets` | Available datasets with row counts and `ExportSnapshotMeta` (for the UI) |
| GET | `/:dataset?format=csv\|json` | File download (`Content-Disposition: attachment; filename=...`, `text/csv; charset=utf-8` or `application/json`) |
| GET | `/all?format=json` | Bundle download |

`:dataset` is an explicit allow-list (`collection`, `wishlist`, `plays`, `mappings`). The Pocket List's `GET /api/v1/export/pocket-list` lives on the same router. **Phase 1 creates `routes/export.ts`** with only `/meta` and mounts it, so the router exists before either consumer needs it. Every literal route (`/meta`, `/datasets`, `/all`, `/pocket-list`) is registered **before** `/:dataset`. Both use `ExportDataService.getSnapshotMeta()` for "as of" freshness instead of reading cache timestamps separately.

Unknown dataset or format returns 400. If no collection cache exists, the response is still 200 with zero rows, and `meta.collectionCache.status` is `missing` (`collectionCachedAt` `null`) so the UI can warn. A `partial` cache also returns 200 with the rows read; the UI warns "N of M pages cached".

`plays` (about 55k rows, roughly 5–7 MB CSV) is built in memory from the already-loaded index. This is acceptable at the current size. If the history grows past about 500k plays, stream it with `res.write` per chunk.

## Frontend

- **Placement: Settings → Backup section** (`SettingsBackupSection`), as a separate "Export your data" card *below* the backup controls. The card copy explains: "Backups restore Listenography. Exports are for other apps and never include your credentials."
  - **Alternative**: a new `'export'` Settings section. See Open decisions.
  - The original pitch put buttons on the Collection and Stats pages. Don't do that, to avoid duplicating controls. Optionally add a small "Export…" link on CollectionPage and WishlistPage that navigates to the Settings card.
- The card has:
  - One row per dataset showing the name, row count, "as of" date from meta, and **CSV** and **JSON** buttons.
  - An "Everything (JSON)" button.
  - A warning when the collection cache is missing, partial or old.
  - A "Pocket List (PDF)" row that opens the Pocket List dialog. Whichever plan lands second adds this row (see the Pocket List plan's dependencies).
- Downloads use axios with `responseType: 'blob'`, as `ApiService.exportBackup` does, because a plain `<a href>` wouldn't send the bearer token when auth is enabled. A small `downloadBlob(blob, filename)` helper (`src/renderer/utils/downloadBlob.ts`, created by whichever plan lands first; three components hand-roll this today) reads the filename from `Content-Disposition`.
- Icons: `Download`, `FileSpreadsheet` and `FileJson` from lucide. No inline styles. Use the existing button system and tokens.

---

## Implementation phases

### Phase 1: Shared layer + router skeleton (~1–1.5 days)
1. Add export types to `src/shared/types.ts`, including `MasterIdSource`, `MatchConfidence`, `ExportRowLink` and `ExportCollectionCacheInfo`.
2. Add `stripDiscogsSuffixes` and `discogsArtistIdentityKey` to `src/shared/utils/albumMapping.ts`.
3. Add `readCollectionCacheSnapshot` to `src/backend/utils/collectionCache.ts`.
4. Build `exportDataService.ts`:
   - Collection rows: copy indexing, note-field split, genres and styles from the release cache when present, timestamp normalization, identity and name keys.
   - Wishlist rows: versions-cache format and label lookup, local-want id handling, owned matching with confidence, related links.
   - Snapshot meta with cache completeness.
5. Create `routes/export.ts` with `GET /meta` only and mount it at `/api/v1/export`.
6. Write tests.

**This is the only prerequisite for the Pocket List MVP.** Phase 2's `/datasets`, file downloads and Settings card are *not* required by it.

### Phase 2: Collection + wishlist files + UI (~4–5 h)
1. Add `src/shared/utils/csv.ts`.
2. Add `datasets`, `collection`, `wishlist` and `all` to `routes/export.ts`.
3. Collection play enrichment.
4. API client methods.
5. Settings card.
6. Write tests.

### Phase 3: Plays + mappings (~3–4 h)
1. Plays rows with corrected metadata.
2. Mappings rows across five services.
3. Add both to `/datasets` and `/all`.
4. Write tests.

### Phase 4 (optional): Cache fidelity (~3–4 h, touches sync code)
1. Capture `instance_id`, `folder_id`, `labels[].catno` and format `descriptions`/`qty` in the `discogsService` collection transforms (both the full and incremental paths). Add them to `DiscogsRawCollectionItem` and `CollectionItem`.
2. Capture formats and labels in `WishlistService.syncWishlist`.
3. Values fill in on the next collection and wishlist sync. Rows already tolerate their absence.
4. Separate PR. Check consumers of `CollectionItem.id` aren't affected, since the id stays the release id.

**Total: about 2.5–3 days for Phases 1–3, plus about 0.5 day for Phase 4.** (Phase 1 grew from ~4–5 h after the 2026-10-11 review added match confidence, identity keys and cache completeness.)

## Acceptance criteria

- [ ] `getCollectionRows()` returns exactly one row per cached collection item (1,189 today). The 10 duplicate-release copies get distinct `rowId`s (`:1`, `:2`), and running it twice gives identical ids.
- [ ] `artistRaw` keeps `"(2)"` suffixes, and `artistDisplay` strips them from every joined artist.
- [ ] Condition fields map to `mediaCondition` and `sleeveCondition`, and unknown field ids go to `customFields`.
- [ ] Every timestamp appears as ISO 8601 UTC plus Unix seconds. Discogs offset strings convert correctly (e.g. `2020-12-04T19:42:05-08:00` → `2020-12-05T03:42:05Z`, `dateAddedUnix` 1607139725). `LocalWantItem.addedAt` (ms) and history play timestamps (s) are both handled correctly.
- [ ] Wishlist rows include both sources. `ownedMatch` is right for the same release, another version of the same master, a name-only match and not owned. `unknown` appears when the collection cache is missing, and replaces `not-owned` when it is partial.
- [ ] Local-want rows always have `releaseId: null` and `masterIdSource: 'search-guess'`. A local want whose stored `releaseId` equals a collection release id is **not** `owned-same-release`.
- [ ] `ownedMatchConfidence` and every `ExportRowLink` carry the basis and confidence from the rules. `likely` related links are present, not dropped.
- [ ] "Artist (2)" and "Artist (3)" with the same title get different `artistIdentityKey`s, so neither is a name match for the other. Both have the same `artistDisplay`.
- [ ] `meta.collectionCache` reports `partial` when a middle page file is missing, and `collectionCachedAt` is the oldest page read.
- [ ] CSV opens correctly in Numbers, Excel and LibreOffice with non-ASCII names (e.g. "Sigur Rós", "Björk"), embedded commas, quotes and newlines.
- [ ] JSON has `format`, `schemaVersion`, `meta`, `rowCount` and `rows`, and `rowCount === rows.length`.
- [ ] Exported files contain no string from `user-settings.json` other than the Discogs username (test asserts that tokens, secrets and session keys are absent).
- [ ] Plays export row count equals `ScrobbleHistoryIndex.totalScrobbles`. For a mapped album, `albumCorrected` differs from `albumAsScrobbled` and `correctedBy = album-mapping`.
- [ ] Downloads work with API auth enabled.
- [ ] The Settings card is visually distinct from backup controls. Works in light and dark mode. No inline styles.

## Tests

- `tests/backend/services/exportDataService.test.ts`:
  - Fixture collection with duplicate releases, suffixes, multi-artist names, year 0, rating 0 and condition notes.
  - Fixture wants with `masterId: 0`.
  - Local wants with ms and second timestamps.
  - Versions-cache lookup.
  - All five owned-match outcomes, each with its confidence; a search-guess master match is `likely`.
  - Local want whose stored `releaseId` (really a master id) equals an unrelated collection release id: not a same-release match, `releaseId` exported as `null`.
  - Suffix identity: "Artist (2)" vs "Artist (3)" vs "Artist" never name-match each other; a local want "Artist" name-matches any of them as `likely`.
  - Cache completeness: complete, missing page 3 of 5 (`partial`, rows from pages 1–2, `not-owned` → `unknown`), item-count mismatch, no cache.
  - `copyCount` is the same on every copy's row.
  - The no-secrets assertion.
- `tests/backend/utils/csv.test.ts` (shared utils are tested here, e.g. `albumMapping.test.ts`): quoting, CRLF, null, arrays, Unicode, leading `=`/`+` unchanged.
- `tests/backend/routes/export.test.ts`: content types, `Content-Disposition` filenames, 400s, empty cache, `/all` bundle shape.
- Plays and mappings: corrected vs original columns, `|`-in-key handling, row count parity.
- `tests/backend/utils/albumMapping.test.ts` (extend): `stripDiscogsSuffixes` cases ("A (2), B (3)", "Discovery (7)", names with internal parentheses like "Sunn O)))", which stays unchanged). `discogsArtistIdentityKey` keeps suffixes per joined artist. Negative `albumGroupKey` fixtures that must **not** collide: Devanagari "क"/"का"/"कि"/"कु" (already added with the fix), Bengali "ক"/"কা", Thai "กิ"/"กี", "春 1" vs "夏 1", punctuation-only "!!!" vs "...". Positive fixtures that must still collide: "Björk"/"Bjork", "Sigur Rós"/"Sigur Ros".
- Frontend: `SettingsBackupSection` export card renders counts, triggers blob download, shows the stale-cache warning.

## Open decisions

| Question | Recommendation |
|----------|----------------|
| Export UI: a card in Backup or a new "Export" section? | Card in Backup (fewer nav items; related concepts, explained side by side). Revisit if more export types arrive |
| Collection `rowId` after `instance_id` is captured | Keep `{releaseId}:{copyIndex}` as `rowId` and add `instanceId` as a new field (additive, no schema bump) |
| UTF-8 BOM in CSV? | No BOM by default (cleaner for scripts). Consider an "Excel-friendly" toggle if users report mojibake |
| Spreadsheet formula escaping | Off by default (fidelity). Optional toggle later |
| Include `plays` in the `all` bundle by default? | Yes. Size is fine today (about 6 MB JSON) |
| Should the shared layer apply album/artist canonicalization to collection or wishlist rows? | No. Discogs names are canonical targets. Corrections are exported only where they differ (plays, mappings) |
| Track-level plays without album | Out of scope. They need an index change in `ScrobbleHistorySyncService` and would affect stats; record in tech-debt if wanted |
