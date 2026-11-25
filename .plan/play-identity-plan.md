# One play identity: consistent grouping and ownership everywhere

Status: PRs 1 and 2 implemented 2026-11-24 on branch `feat/play-identity`
(uncommitted to main). PRs 3 and 4 not started. The interim
`createTrackRowMapper` fix was replaced by the resolver in PR 2.

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
