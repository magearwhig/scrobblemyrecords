# One play identity: consistent grouping and ownership everywhere

Status: complete 2026-11-25. PRs 1-2 merged (#33), PRs 3-4 merged (#34),
PR 5 (record-to-plays) on branch `feat/play-identity-records`. The lint
allowlist holds only Suggested Album Merges, which reads names before they
merge on purpose.

## Problem

Every feature works out for itself which artist, album and track a scrobble
counts as, and whether that album is owned. Each applies a different subset of:

- album mappings (`createAlbumCanonicalizer`, `createCollectionNameResolver`)
- track mappings (`createTrackMapper`)
- artist aliases (`resolveArtistName` / `ArtistNameResolver`)
- unresolved-play rules (applied in `getIndex()`)
- collection matching: `buildFuzzyCollectionMap` + `fuzzyNormalizeKey` on the
  server, `useCollectionLookup` + `normalizeForMatching` in the browser

So a fix in one place leaves the others wrong. Bugs found this way, Nov 2026:

| Where | What went wrong |
|-------|-----------------|
| History, Stats rankings, Forgotten Favorites badges | Browser ignored album mappings (fixed PR #32) |
| Forgotten Favorites, Top Tracks | Album versions joined by a mapping counted separately ("Time Bomb") |
| Artist page top tracks, track page | A track mapping that moves a play to another album is dropped or filed under the old album |
| Rankings over time | Groups tracks by artist + track only, ignores album and artist mappings |
| Browser ownership | No punctuation / "&" / "- EP" handling that the server has |

Album-mapping use is spread over about 12 services, and ownership checks are
in about 23 places in `statsService` alone.

## Design

One backend resolver, built once per request, that every aggregation uses.

```ts
interface PlayIdentity {
  artistKey: string;
  albumKey: string | null;      // null = unresolved (never "Unknown album")
  trackKey: string | null;      // artist + album scoped
  display: { artist: string; album: string | null; track: string | null };
  inCollection: boolean;
  collectionItemIds: number[];  // all owned copies; first is primary
}

interface PlayIdentityContext {
  resolve(play: { artist: string; album: string | null; track?: string }): PlayIdentity;
  resolveAlbum(artist: string, album: string): AlbumIdentity;
}
```

Fixed order: unresolved rule, track mapping, album mapping on the destination,
artist aliases, keys and display names, ownership.

Ownership precedence: a linked mapping (`collectionId > 0`), then an exact
canonical match, then the server's fuzzy match. Collisions keep all candidates
rather than overwriting.

**Ownership moves to the server.** API rows carry `inCollection` and the
collection item IDs; the browser stops matching names and no longer downloads
the whole collection for badges.

**Rankings become album-scoped** like Top Tracks: one song on an album and on a
single are two rows unless mapped together.

Performance: indexes built once; resolution memoised per distinct
(artist, album, track); one pass over the ~100k plays. Read model cached by
history revision plus a fingerprint of every mapping file and the collection.

## PRs

1. **Resolver.** `src/backend/services/playIdentity/` with unit tests for the
   order above, including the move-to-another-album and same-album-rename cases.
2. **Read model + first migrations.** Resolved plays indexed by artist, album
   and track. Move Top Tracks, Forgotten Favorites, artist page top tracks,
   track page and rankings onto it (fixes the two open bugs). Resolve each play
   *before* filtering by artist or album.
3. **Server-side ownership.** History albums/tracks/artists and Forgotten
   Favorites return ownership; remove `useCollectionLookup` matching from
   `LastFmHistoryTab`, `ForgottenFavoritesTab` and Stats rankings.
4. **Everything else + guard.** Remaining `statsService` sites, suggestions,
   album play counts, analytics, Wrapped, crates. ESLint rule against importing
   mapping/normalisation helpers outside the identity module (shrinking
   allowlist).

## Contract test

`tests/backend/playIdentity.contract.test.ts`, real services on a fixture
store: alias spellings, two mapped album versions, a track mapping that moves
a play, an albumless play with a rule, an owned destination. Asserts the same
track, album, owned flag and play count through Top Tracks, Forgotten
Favorites, artist page, track page, rankings and History, and that a moved play
leaves its old album. Negative cases: same title on unrelated albums,
unresolved vs a real "Unknown album", deleted collection link.

## Progress

### PR 1 + 2 (2026-11-24)

- `src/backend/services/playIdentity/index.ts`: `createPlayIdentityResolver`
  (`play`, `album`, `movesPlaysTo`) and `buildPlayIdentityResolver`. Keys:
  album = `createAlbumCanonicalizer` key; track = artist alias key + album key
  + `trackMatchKey`; unresolved plays get their own prefix. Ownership:
  linked mapping, exact name, exact merged name, fuzzy name, fuzzy merged name.
- Migrated: `getTopTracks`, `getForgottenFavorites`, artist page top tracks,
  `getTrackDetail`, rankings over time (tracks). Rankings items now carry
  `key` and `album`; the race chart keys bars by `key`.
- The artist and track pages skip other artists' albums unless
  `movesPlaysTo` says a track mapping moves plays to this artist (matched the
  way track mappings are looked up, including via merged album names).
- `getTrackDetail`'s rename fallback only applies to a same-album rename, so
  a song moved onto an album never counts as another song there.
- Tests: `tests/backend/playIdentity.test.ts` (resolver),
  `tests/backend/playIdentity.contract.test.ts` (same plays through Top
  Tracks, artist page, track page, Forgotten Favorites, rankings; 5 of 6 fail
  on the old code).
- Real data (copy): total plays unchanged (66,309); 326 fewer Top Tracks rows
  from merged versions; Forgotten Favorites at 3 years / 10+ went 266 -> 250;
  track and artist pages 15-28 ms, as before.
- Left for PR 4: artist page totals and album list still count moved plays on
  the artist they were scrobbled under; artist and album rankings; album
  detail; analytics, Wrapped (already uses `getTopTracks`), crates,
  suggestions.

### PR 3 + 4 (2026-11-24, one PR)

- **History lists** (`/suggestions/history/albums|tracks|artists`) are built by
  `StatsService.getHistoryAlbums/Tracks/Artists` on the resolver, replacing
  `ScrobbleHistoryStorage.get*Paginated` (still used by Memory Scrobble's
  typeahead, which needs raw scrobbled names). Rows carry `collectionItem`;
  artist rows carry `ownedCount` and `ownedCoverUrl`.
- **Ownership on the server everywhere**: Forgotten Favorites (recorded while
  counting), Top Albums, Top Artists (`withArtistOwnership`), dashboard recent
  albums (`ownedRecordsOf`), artist page albums, track page "appears on",
  album page. `useCollectionLookup` (browser name matching) is deleted.
- **Migrated to per-play identity**: artist page totals and albums (plays a
  track mapping moves to or from the artist count where they land), Top
  Albums, Top Artists, rankings for artists and albums.
- **Resolver additions**: `ownedByArtist`; ownership order is linked mapping
  on the name, linked mapping on the merged album, exact name, exact merged
  name, merged-album key, fuzzy; a merged album is named by its mapping
  target; collection items de-duplicated by id.
- **Caching**: resolvers are reused per rules fingerprint (album mappings,
  track mappings, aliases, collection content); History rows per index object
  + last sync + total + rules. Real data: first request ~250 ms, then 6-30 ms.
- **Lint guard** in `eslint.config.js` with the `PLAY_IDENTITY_NOT_YET_MOVED`
  allowlist; rules written into `AGENTS.md` (imported by `CLAUDE.md`) and
  `CONTRIBUTING.md`.
- Peer review found 3 issues, fixed with tests: cache key ignored collection
  content, a name match could beat an explicit link, Forgotten Favorites lost
  ownership after a cross-artist merge.

### PR 5: record to plays (2026-11-25)

- `PlayIdentityService` (`playIdentity/service.ts`), shared by every service
  from `server.ts`: the resolver cache, plus a read model (every play
  resolved once, by album and by owned record) cached per history index and
  rules. `recordPlays`, `recordResolvedPlays`, `albumPlays`, `albums`,
  `discogsAlbumPlays` / `discogsAlbumPlayList`.
- Moved: album page (and its arc and tracks-played), Release Details history
  (track aliases from `trackMappingsFor`), label pages, Top Labels and label
  candidates (resolved plays, so a moved play counts on the right label),
  collection ROI, coverage, Dusty Corners, Heavy Rotation, album play counts
  (Collection, Wishlist, Seller Matches), play suggestions, Wrapped, crates
  (track mappings added to their fingerprint, table version 2), Missing
  Albums and album completeness, collection covers, AI suggestion matching.
  `lookupMergedHistory` and `buildFuzzyCollectionMap` are gone.
- Resolver: a track mapping saved under any version of an album applies to
  plays on every version (album page merges); a record's grouping key is its
  own name; collaboration credits ("A, B") own the same title under each
  artist; Discogs suffixes stripped on every collaborator; the artist's
  Last.fm name (artist mappings) is another spelling of a record.
- `fuzzyNormalizeKey` drops trailing edition notes, bracketed or after a dash
  ("(10th Anniversary Edition)", "(2011 - Remaster)", "- 20th Anniversary
  Edition", "- Disc 1"), so editions of an owned record count as it.
- Real data: play counts for all 1,193 records: 43 changed, 41 up (aliases,
  editions, collaborations), 2 down (double counts fixed); records with plays
  901 -> 909. Missing Albums 1,669 -> 1,677: 15 now owned, 23 newly listed,
  all different releases (remix albums, "Appendix", bonus discs, "Plus"
  editions) that the old prefix rule hid. First read model build ~0.5 s, then
  lookups 20-45 ms.
- Behaviour changes: an album you don't own and haven't mapped is no longer
  merged with its edition variants on the album page (consistent with Top
  Albums); an owned record still gets every version that resolves to it.
  Linked mappings only count as owned while the record is in the collection.
- Peer review found 4 more issues, all fixed with tests: the spelling-tolerant
  index could return plays moved away; labels split albums by history album,
  not by play; `movesPlaysTo` missed version-wide track mappings; warm cache
  version (now 8).

## Found along the way: collection cache repeats (fixed 2026-11-25)

The cache held 1,711 entries for 1,194 releases. Cause: a full collection
refresh never deleted pages past its new last page, and every reader read
"until a page is missing", so pages 26-35 from an older 35-page sync were read
after the current 25. The incremental update made it worse: it read those
stale pages back in and re-wrote them without de-duplicating, so repeats
compounded (likely how a sync reported 1,711). A forced refresh could also
reuse still-fresh cached pages from the previous sync.

Fixed: `getAllCachedCollectionItems`, `readCollectionCacheSnapshot`, the
`/collection/:user/all` route, collection search, the artist-mapping route and
the crate snapshot read only as many pages as page 1's pagination says; a full
refresh (now fetching every page when forced) and the incremental update
delete pages past their last one (`removeStaleCollectionPages`); the
incremental update de-duplicates by release id + date added (a second copy
has its own date, so it stays). Real cache: 1,206 entries, 1,194 releases, 12
genuine second copies. The stale files on disk go at the next full refresh.

Peer review: de-duplication now only drops a new item already in the cache,
counted per copy (two copies added in the same second both stay); page 1 is
never deleted (an empty collection is an empty page 1); a full refresh and an
incremental update share one lock, so an update can't save a half-refreshed
mix. Still open: a reader during a refresh (~30 s) can see new and old pages
together; a fix is to write a new generation of pages and switch over in one
step.
