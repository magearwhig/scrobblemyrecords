# Agent instructions

Rules for anyone (human or agent) changing this codebase. `CLAUDE.md` imports
this file.

## Counting plays and ownership: always use play identity

Any code that groups scrobbles, counts plays, or decides whether an album is
owned **must** use the play identity resolver in
`src/backend/services/playIdentity/`. Do not work it out again from names.

```ts
const identity = await buildPlayIdentityResolver({ ... }); // once per request
const p = identity.play(artist, album, track); // album null = unresolved play
// group by p.trackKey / p.albumKey / p.artistKey
// show p.artist / p.album / p.track
// ownership is p.collectionItem
```

In `StatsService` use `this.createPlayIdentity(collection)`.

Why: every page used to apply its own subset of track mappings, album
mappings, artist aliases and collection matching, so the same play counted
differently on different pages (an "Owned" badge missing on History, a track
"forgotten" on one album version while played on another, rankings that
disagreed with Top Tracks). The resolver applies them once, in a fixed order:
track mapping, album mapping on the album the play lands on, artist aliases,
then ownership (linked mapping, exact name, then spelling-tolerant name).

Rules:

- **Resolve each play before filtering** by artist or album. A track mapping
  can move a play to another album or artist; filtering on the scrobbled
  names first loses it. When a page skips other artists' albums for speed,
  use `identity.movesPlaysTo(isTarget)` to keep the ones a mapping moves in.
- **Don't build grouping keys by hand** (`artist|album|track`,
  `normalizeForMatching`, `fuzzyNormalizeKey`, `createAlbumCanonicalizer`,
  `createTrackMapper`) in a feature. If the resolver can't answer something,
  extend the resolver and its tests.
- **Ownership comes from the server.** The browser must not match collection
  names itself; API rows should carry the owned record.
- **Plays with no album** have `album: null` and their own keys. They never
  merge with a real album, not even one named "Unknown album".
- **Bump `WARM_CACHE_VERSION`** in `statsService.ts` when a change alters how
  cached stats group plays.
- **Add the page to the contract test**, `tests/backend/playIdentity.contract.test.ts`,
  when it lists or counts plays. It checks that every page counts the same
  fixture the same way.
- **Lint enforces it.** `eslint.config.js` rejects importing
  `createAlbumCanonicalizer`, `createCollectionNameResolver`,
  `createAlbumGroupNameResolver` or `createTrackMapper`, or calling
  `fuzzyNormalizeKey`, outside the resolver. Files not moved yet are listed in
  `PLAY_IDENTITY_NOT_YET_MOVED`; that list only shrinks. Never add a file to
  it: extend the resolver instead.
- **Collection items can repeat** in the cached collection; the resolver
  counts each record (by id) once. Don't count `collection.length` as records.

Not every consumer has moved yet: the files in `PLAY_IDENTITY_NOT_YET_MOVED`
start from an owned record or a named album and look up its plays, which the
resolver doesn't answer yet. `.plan/play-identity-plan.md` lists them. When
you touch one, move it onto the resolver rather than patching its own rules.
