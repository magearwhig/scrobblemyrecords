# One play identity: consistent grouping and ownership everywhere

Status: PRs 1-2 merged 2026-11-24 (#33). PRs 3-4 implemented 2026-11-24 on
branch `feat/play-identity-ownership` as one PR. What's left is the
record-to-plays direction ("PR 5" below).

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

## Not yet moved ("PR 5": record to plays)

These start from an owned record or a named album and look up its plays,
the reverse of what the resolver answers. They need a resolved-play read
model indexed by album key (as the original design proposed):

- `statsService`: album page history (`getAlbumDetail` via
  `lookupCollectionHistory`), label page, collection ROI, collection coverage
  (`matchCollectionToHistory`), album listening arc
- `routes/suggestions.ts`: Release Details history, mapping suggestions
- `crateAlbumTable`, `albumPlayCountService`, `suggestionService`,
  `analyticsService` (missing albums/artists), `wrappedService` (collection
  part), `imageService`, `albumMergeSuggestions` (works on raw names on
  purpose; may stay)

## Found along the way

- The cached collection pages hold 1,711 items for 1,193 distinct records
  (page 1 reports 35 pages / 1,711 items). The resolver de-duplicates, but
  other users of `getAllCachedCollectionItems` may count repeats. Not
  investigated.
