# Smart Crates Plan

**Status:** Implemented 2026-10-18 on branch `feat/smart-crates` (committed locally, not pushed): Phases 1, 2, 2b and 3. Decisions taken with the user: own Library > Crates page plus a What to Play tab (17.1), Dusty Corners kept as is (17.3). Deviations from this text: the template "Recently added, no scrobbles since" is named "Recently added to Discogs, no scrobbles since"; include/exclude/reset expand to every current copy of the album; `CrateCoverage.runtimeKnownAlbums`/`genreKnownAlbums` are null when release details weren't loaded; `CrateEvaluation.unknownOnlyAlbums` counts each "might match" album once. Known limitations: section 14 (mixed collection snapshot) and a backup restore can be overwritten by a crate or suggestion save already in progress (same as other services).

## Summary

A **Smart Crate** is a saved, named group of **albums you own**. Rules over collection data and listening history decide which albums are in it, and it updates itself when the collection, the scrobble history or the album mappings change. The user can also include or exclude specific records by hand. Every album in a crate shows **why it is there**.

Example crates:

- "Most-scrobbled albums with no scrobbles recorded this year"
- "Added to Discogs recently, no scrobbles recorded since"
- "Jazz records that fit into 40 minutes" (where Discogs lists track durations)

A crate answers "what should I pull off the shelf?" for a mood or situation the user defines once and reuses. Dusty Corners already does this for one fixed rule. Crates let the user write the rule.

**MVP in one paragraph:** A new **Library > Crates** page lists crates and opens a crate detail view. Crates have AND-combined rules from a fixed catalogue (format, pressing year, date added, genre/style, rating, runtime, discard pile, scrobble count, scrobbles in a period, last recorded scrobble, scrobbles since added), plus manual include/exclude. They are evaluated on read against the cached collection and history index, and each album gets a "why" line per rule. Copy-level rules must all be satisfied by **one** owned copy (the witness copy, section 4.3). Three starter templates match the examples above. What to Play gets a **Crates** tab that shows pinned crates, with a "Pick one" button. The Crates page also **suggests crates** mined from the user's own data by six recipes that map exactly onto the rule catalogue (section 10). Each suggestion has an **Add** button that creates the same crate (rules and sort) in one click. Suggestions rotate deterministically, least recently shown first, so consecutive days and "Show different suggestions" give different ones whenever enough candidates qualify; "Not interested" and Add are remembered as permanent tombstones in their own store. OR groups, more rule types, seasonal/anniversary suggestions, context tags and crate-scoped album suggestions come later.

---

## 1. Current State (verified 2026-10-11)

### 1.1 What exists and will be reused

| Area | What exists | Reference |
|------|-------------|-----------|
| Collection cache | `getAllCachedCollectionItems(username, fileStorage)` reads `collections/{username}-page-N.json` until the first missing or empty page. It does **not** dedupe and does not check that the pages form one snapshot. Each page stores `pagination {page, pages, items}` and a `timestamp`. A full preload writes pages one at a time (1 s apart) and tracks them in `collections/{username}-progress.json` (`status: 'loading' \| 'completed' \| 'failed'`). `updateCacheWithNewItems` prepends new items and rewrites every page in sequence with `writeJSON` (not atomic as a set). The stats routes use the reader through a local `loadCollection()`. | `src/backend/utils/collectionCache.ts`, `src/backend/routes/stats.ts` |
| Collection item | `CollectionItem { id, release, folder_id?, date_added, rating?, notes?, selected? }`. `release` is a `DiscogsRelease` built from `basic_information`: `id, master_id?, title, artist, year?, format[], label[], cover_image?`. Cache pages carry **no** `genres`, `styles` or `tracklist`. | `src/shared/types.ts`, `DiscogsService.getUserCollection` mapping (`src/backend/services/discogsService.ts`) |
| Release details cache | `collections/release-{id}.json` holds the full `DiscogsRelease` with `genres`, `styles` and `tracklist[{position,title,duration?}]`. `DiscogsService.getReleaseDetails()` reads it, and on a cache miss it **calls Discogs with a 1 s delay**. `DiscogsGenreEnricherService.enrichReleases()` fills it in bulk. | `src/backend/services/discogsService.ts`, `src/backend/services/discogsGenreEnricherService.ts` |
| History index | `ScrobbleHistoryIndex { lastSyncTimestamp, totalScrobbles, oldestScrobbleDate, albums: Record<"artist\|album", AlbumHistoryEntry> }`, where `AlbumHistoryEntry = { playCount, lastPlayed, plays[{timestamp, track?}] }`. `ScrobbleHistoryStorage.getIndex()` caches it for 1 min. `batchLookup(keys, {countsOnly?})` loads the index once and does exact then fuzzy matching. **`lastSyncTimestamp` is the newest scrobble's timestamp (ms)**, not the time a sync finished: `ScrobbleHistorySyncService` sets it to `newestScrobbleTimestamp * 1000` on every save, and `adjustSyncTimestampForBackdatedScrobbles` can lower it for backdated scrobbles. No field records sync completion. | `src/shared/types.ts`, `src/backend/services/scrobbleHistoryStorage.ts` |
| Album identity | `createAlbumCanonicalizer(mappings, resolveArtist)` returns `{artist, album, key, mapping?}`, where `key = albumGroupKey(...)`. The key ignores case, accents, punctuation and Discogs `(2)` suffixes, and follows album mappings and artist aliases. Stats, Top Albums, Rankings, Wrapped and Album Merge Suggestions use it. | `src/shared/utils/albumMapping.ts` |
| Collection name resolver | `createCollectionNameResolver(mappings)(artist, album)` returns the collection name plus every history name linked to it by a **collection-linked** mapping (`collectionId > 0`). | `src/shared/utils/albumMapping.ts` |
| Merged history lookup | `lookupMergedHistory(historyStorage, namesPerAlbum, {countsOnly?})` makes one `batchLookup` and combines all names of each album, counting each history entry once. | `src/backend/services/mergedAlbumHistory.ts` (+ `loadAlbumMappings`) |
| Per-item history precedent | `StatsService.lookupCollectionHistory()` (private) feeds `getCollectionCoverage`, `getDustyCorners`, `getHeavyRotation`. It works per **collection item**, not per album, so two pressings appear twice. | `src/backend/services/statsService.ts` |
| Dusty Corners | `getDustyCorners(collection, limit)` lists items with no plays or a last play over 180 days ago, with "never" sorted first. What to Play tab `dusty`. | `statsService.ts`, `src/renderer/components/whattoplay/DustyCornersContainer.tsx` |
| Forgotten Favorites | `getForgottenFavorites(dormantDays, minPlays)`: **track**-level, history-wide (owned or not). | `statsService.ts`, `ForgottenFavoritesContainer.tsx` |
| Play Suggestions | `SuggestionService.calculateFactors()` scores one collection item from `recencyGap`, `neverPlayed`, `recentAddition`, `userRating` and others. Its reason text is "You've never scrobbled this album" (honest). The card label is `neverPlayed: 'Never Played'` (`SuggestionCard.tsx`, less honest). | `src/backend/services/suggestionService.ts`, `src/renderer/components/SuggestionCard.tsx` |
| Embedding recommendations | `RecommendationResult { release, score, explanation, breakdown }`. Scored "next listen" picks, not saved sets. | `src/shared/types.ts`, `RecommendationsPage.tsx` |
| Collection filter presets (backlog #22) | `CollectionFilterPreset { id, name, filters: {format, yearFrom, yearTo, dateAdded}, createdAt }`, stored in `UserSettings.preferences.collectionPresets` and saved through `api.updateUserPreferences`. Filtering is client-side in `CollectionPage.applyFilters`; `dateAdded` is one of `week \| month \| 3months \| year`. | `src/shared/types.ts`, `src/renderer/pages/CollectionPage.tsx`, `src/backend/routes/auth.ts` |
| Saved track collections | `SavedCollection { id, name, description?, tracks: SavedCollectionTrack[], ... }` in `collections/saved-collections.json`. Ordered **track** lists for Memory Scrobble (e.g. an OpenSwim playlist), with CSV import. | `src/backend/services/savedCollectionService.ts`, `src/backend/routes/memoryScrobble.ts` |
| Discard pile | `DiscardPileService.getDiscardPileCollectionIds(): Set<number>`. `markAsOrphaned()` exists but **nothing calls it**. | `src/backend/services/discardPileService.ts` |
| Store + backup conventions | Services keep an in-memory `store` and write with `fileStorage.writeJSONWithBackup()`. Files are registered with `MigrationService` (`this.register('<key>', { path, currentVersion, migrations, optional })`) and backed up through `FILE_PATHS` + optional `BackupData` fields + `mergeAndSave()`. | `savedCollectionService.ts`, `migrationService.ts`, `backupService.ts` |
| Freshness fingerprint precedent | `StatsService.getValidWarmCache()` checks `syncTimestamp`, `WARM_CACHE_VERSION` and `artistNameResolver.getFingerprint()`. `FileStorage.getStats(path)` returns `mtime`. | `statsService.ts`, `src/backend/services/artistNameResolver.ts`, `src/backend/utils/fileStorage.ts` |
| Frontend primitives | `useAsync`, `Badge`, `Modal`, `EmptyState`, `Skeleton`, `AlbumLink` (writes `selectedAlbum`), `navigate(ROUTES.X, params)`, `getTabFromUrl`, `useTabKeyNavigation`. | `src/renderer/hooks`, `src/renderer/components/ui`, `src/renderer/routes.ts`, `src/renderer/utils/tabUtils.ts` |

### 1.2 Data-quality facts that shape the design (measured on local `data/`, read-only)

| Fact | Measurement | Consequence |
|------|-------------|-------------|
| Collection size | 1,189 cache entries. 27 have no `master_id`. 26 masters have more than one copy. 25 artist/title pairs appear more than once. | Grouping copies into albums matters, but it is a small minority. |
| **Same release owned twice** | 10 release IDs appear 2-3 times (e.g. "Earth Man Blues" ×3). `CollectionItem.id === release.id` for all 1,189. No `instance_id` is stored. `GET /collection/:username/all` and search dedupe by `id`. | `CollectionItem.id` is a **release** ID, not a copy ID. Crates cannot tell physical copies of one release apart (section 5). |
| Ratings | 0 of 1,189 items have a non-zero `rating`. | A rating rule is cheap to offer, but no template may depend on it. "Love" needs a listening-based proxy. |
| Genres/styles | 1,169 items have a release-details cache file. 1,176 of 1,188 cached files have genres and 1,058 have styles. | Genre works for about 98% of albums. New additions lack it until details are fetched. |
| **Track durations** | Of 1,188 cached releases: 575 have durations for every track, 24 are partial, 586 have none, 3 have no tracks. 81 contain heading rows (empty `position`). | Runtime is known for only **about 48%**. "Fits into 40 minutes" must handle unknown runtime honestly. |
| `date_added` | Bulk days: 26 items on 2013-02-10 and 24 on 2020-12-04. 497 items were added in 2021. | `date_added` is "added to Discogs", **not** a purchase date. |
| Notes | 272 items have custom notes (media/sleeve condition). | Could become a later rule. Not MVP. |
| History | 55,159 scrobbles across 5,083 history albums. `oldestScrobbleDate` = 1108339019 (Feb 2005, **seconds**). `lastSyncTimestamp` = 1791750068000 (**milliseconds**). Play timestamps are seconds. | Units differ. Coverage starts at the first Last.fm scrobble. |
| Albumless scrobbles | Since Unresolved Listening History (2026-10-11), scrobbles without an album are kept in `index.unresolved` and counted in listening stats, but not attributed to an album unless the user resolves them. | Album-level rules (crate membership, per-album scrobble counts) don't see unresolved plays. See `done/unresolved-listening-history-plan.md`. |
| App sessions are not "vinyl plays" | `MemoryScrobblePage` also calls `api.scrobbleBatch`, so in-app `ScrobbleSession`s include from-memory listening (e.g. swimming headphones). Sessions store no release ID. | Neither Last.fm scrobbles nor in-app sessions prove that a physical record was played. |
| Album mappings | 157 mappings. 151 are collection-linked and 6 are unlinked (`collectionId: 0`). None of the 6 currently targets a collection name. | Plays should resolve through the same mapping logic as album detail (section 5.3). |

### 1.3 Gaps this feature must not paper over

1. **Collection sync invalidates nothing.** `POST /collection/:username/update-new` (`DiscogsService.updateCacheWithNewItems`) does not notify stats or any other cache. Crates must detect changes themselves (section 7).
2. **Removed items are not tracked.** No code records that a release left the collection (`markAsOrphaned` is unused). Crates must handle "no longer owned" when they read, not through an event.
3. **Collection-side lookups use only linked mappings.** `createCollectionNameResolver` skips unlinked merges, while `StatsService.collectMergedAlbumHistory` (album detail) includes them. Today no unlinked mapping targets a collection name, so the counts agree. Crates use the wider union (section 5.3) so mapped plays are never missed.
4. **Album Detail and crates look plays up differently.** `getAlbumDetail` resolves one name through `resolveMergedAlbum`, then `collectMergedAlbumHistory` takes `getAlbumHistoryFuzzy` for that one name (an exact key hit **skips** the fuzzy siblings) plus mappings whose `collectionAlbum` string equals the name. Crates union the names of every copy in a canonicalised group. The two agree for most albums but not by construction (section 5.3 narrows the guarantee).
5. **History sync completion is not recorded.** `lastSyncTimestamp` is the newest scrobble, so "synced 2 h ago" cannot be derived for someone who has not scrobbled for a week (section 8.1).
6. **The cached collection is not an atomic snapshot.** A preload in progress, or a read during `update-new`'s page rewrite, can return a partial or mixed set of pages. Anything that infers "no longer owned" from the cache must check completeness first (section 9).

---

## 2. User Value & Workflows

### 2.1 Why

- A collection of over 1,000 records is hard to browse by mood. Collection filters cover format, year and date added; they ignore listening history and are forgotten when the page closes.
- Dusty Corners and Suggestions answer "what have I neglected?" in one fixed way. Users have their own definitions ("most-scrobbled albums", "short jazz", "recently added") and want them saved and kept up to date.
- Crates make the app's data actionable at the shelf, not just analytical.

### 2.2 Workflows

1. **Start from a template.** Crates > New crate > pick "Recently added to Discogs, no scrobbles since". The builder shows the rules (added to Discogs within 90 days AND no scrobbles recorded since added), a live count ("14 albums") and the first few matches. Save.
2. **Build from scratch.** Add rule "Genre is any of Jazz" and rule "Runtime at most 40 min". The live preview shows "9 albums match · 31 more Jazz albums have no Discogs track durations". The user can check "Include albums with unknown runtime" on the runtime rule, or leave them out.
3. **Use a crate.** What to Play > Crates shows pinned crates with counts. "Pick one" chooses a random member and shows its cover, the "why" line and buttons to open Release Details for the copy that matched (its witness copy, section 4.3, to scrobble) or Album Detail.
4. **Curate.** In the crate view, "Exclude" removes an album the rules caught but the user doesn't want (e.g. a box set in the 40-minute crate whose runtime is per disc). Excluded albums go to a collapsed "Excluded by you" section with "Restore". From Release Details, "Add to crate…" includes a record that no rule catches.
5. **Turn filters into a crate.** On Collection, with filters active, "Save as crate" turns the current format/year/date-added filters into crate rules (Phase 3). Presets stay for quick filtering.
6. **Trust the result.** A crate's header states its data coverage: "Listening data: Last.fm scrobbles since Feb 2005 · last sync finished 2 h ago" (or "newest scrobble Oct 9" when no completion time is recorded, section 8.1). If listening rules depend on stale or missing history, a banner says so.

---

## 3. How Crates Differ from Existing Features

| Feature | Unit | Membership | Inputs | Lives | Updates |
|---------|------|-----------|--------|-------|---------|
| **Collection filter presets** | Collection item (copy) | Filter only | format, year range, date-added bucket | Collection page view state, `UserSettings.preferences` | Re-applied client-side when the page loads |
| **Saved track collections** | Track (owned or not) | Manual, ordered | CSV/typeahead | Memory Scrobble | Never (static) |
| **Dusty Corners / Heavy Rotation** | Collection item | One fixed rule | Last play / play count | What to Play, Stats | On read |
| **Forgotten Favorites** | Track (history-wide) | One fixed rule | Dormancy + play count | What to Play | On read (cached 5 min) |
| **Play Suggestions / Recommendations** | Album | Ranked picks, not a set | Weighted factors / embeddings | What to Play / Recommendations | On request |
| **Smart Crates** | **Album** (groups owned copies) | **Rules + manual include/exclude** | Collection + release details + listening history + mappings | Library > Crates, What to Play > Crates | **On read, memoised** |

Decisions:

- Crates **do not replace** presets. Presets stay as lightweight view filters. "Save as crate" is a one-way bridge from preset to crate.
- Crates **do not replace** Dusty Corners. A "Dusty shelf" template reproduces it as an editable crate. Retiring the tab is an open decision (section 17).
- A later "Export to saved collection" (Phase 4) turns a crate's albums into a `SavedCollection` track list for Memory Scrobble. That is the one place the two features meet.

---

## 4. Rules

### 4.1 Combination

- **MVP: all rules are ANDed.** Alternatives inside one field use multi-value operators ("Genre is any of Jazz, Soul"). Negation uses operators ("none of", "= 0 scrobbles"). This covers all three example crates and the Dusty Corners equivalent without a nested rule builder.
- **OR groups are deferred** to Phase 4. The shape is reserved in the data model (`rules` stays a flat list now; a later `ruleGroups?: CrateRule[][]` with OR between groups and AND inside each). Build it only when there is a concrete need that multi-value operators cannot express.
- A crate with **zero rules** is a purely manual crate: only manual includes are members. This is allowed and useful ("Records to lend Sam").

### 4.2 Three-valued evaluation

Every rule returns `match`, `noMatch` or `unknown` for an album. `unknown` means the data needed is missing (no runtime, no genre, unrated, no history index). Each rule that can be unknown has `ifUnknown: 'exclude' | 'include'`, which defaults to `'exclude'`. An album is a rule-member only if no rule returns `noMatch` and every `unknown` rule has `ifUnknown: 'include'`. Copy-level rules apply this per copy and need one witness copy to pass (section 4.3). Albums kept out *only* by `unknown` results are counted per rule and listed in a "Might match — data missing" panel, so the gap is visible and not silent.

### 4.3 Copy-level vs album-level fields

An album can have several owned copies (pressings). Rules on **copy facts** (format, pressing year, date added, genre/style, rating, runtime) are evaluated **together on one copy**: the album passes the copy-level rules only if a single owned copy, the **witness copy**, satisfies all of them. Per-rule any-copy semantics would be wrong: an album owned as Vinyl (50 min) and CD (35 min) would satisfy `format anyOf [Vinyl]` AND `runtime atMost 40` through two different copies, though no 40-minute vinyl exists.

- **Copy outcome.** For each copy, AND its copy-level rule outcomes with the three-valued logic of section 4.2 (`noMatch` if any rule is `noMatch`; otherwise `unknown` if any rule is `unknown` with `ifUnknown: 'exclude'`; otherwise `match`).
- **Album outcome.** `match` if some copy matches; otherwise `unknown` if some copy is `unknown`; otherwise `noMatch`. A crate with no copy-level rules has every copy as a candidate witness.
- **Choosing the witness.** Among matching copies (or, for `unknown`, the copies that are `unknown`), the earliest `date_added`, then the lowest release ID. The result is deterministic.
- **Use of the witness.** Copy-level "why" lines describe the witness ("2023 pressing · Vinyl · 38:12"). "Open release" and "Pick one" open the witness copy. The album row still lists every copy.
- **Negation is per copy too.** `format noneOf [CD]` matches an album owned on vinyl and CD, through the vinyl copy. This is intentional ("I own a non-CD copy") and documented in the rule help text.

**Listening** rules work on the album as a whole, because plays are attributed to the album, not to a copy (section 5). They are ANDed with the album's copy-level outcome.

### 4.4 Rule catalogue (MVP)

| Field | Operators | Source | Unknown when | Notes |
|-------|-----------|--------|--------------|-------|
| `format` | `anyOf`, `noneOf` (values from the collection's distinct `release.format` names: Vinyl, CD, Cassette, Box Set, All Media, …) | Cache page `release.format` | never | Same values as the Collection filter dropdown. Discogs `basic_information` descriptions (LP, 7") are not cached. |
| `pressingYear` | `between {from?, to?}` | `release.year` | `year` missing or 0 | UI label: **"Pressing year"**. A 2019 reissue of a 1987 album has year 2019. The original year (master) is not cached (section 14). |
| `dateAdded` | `withinDays {days}`, `olderThanDays {days}`, `between {from?, to?}` (ISO dates) | `date_added` | never | UI label: **"Added to Discogs"**. Copy-level (witness copy, section 4.3). |
| `artist` | `anyOf` (names) | `release.artist`, compared with the artist resolver | never | Makes "my Wedding Present crate" possible. |
| `genre`, `style` | `anyOf`, `noneOf` | `collections/release-{id}.json` `genres` / `styles` | no details file, or `genres === undefined` | Read from the cache only. Evaluation **never** calls `getReleaseDetails()` (it would hit Discogs at 1 req/s). |
| `rating` | `atLeast {value 1-5}`, `isUnrated` | `CollectionItem.rating` | `rating` missing or 0, for `atLeast` | The builder shows how many owned albums are rated (e.g. "0 of 1,150 albums rated") so the user is not misled. |
| `runtime` | `atMost {minutes}`, `atLeast {minutes}`, `between` | Release-details tracklist (section 4.6) | durations incomplete *and* the known part cannot decide | Partial data can still decide a rule: if the known tracks of a partial tracklist already exceed `atMost`, the result is `noMatch`. |
| `discardPile` | `exclude`, `only` | `getDiscardPileCollectionIds()` | never | Templates add `exclude` by default. |
| `scrobbleCount` | `atLeast {n}`, `atMost {n}`, `topPercent {p}` | All-time merged scrobbles for the album | history index absent | `topPercent` ranks among **all owned albums**; ties are included and 0-scrobble albums are never "top". This is the "love" proxy while ratings are unused. |
| `scrobblesInPeriod` | `none`, `atLeast {n}`, `atMost {n}` over period `{kind:'calendarYear'} \| {kind:'lastDays', days} \| {kind:'since', date}` | Play timestamps | history index absent | `calendarYear` = since Jan 1 in server-local time, the same as `StatsService.getStartOfYear`. |
| `lastRecordedPlay` | `olderThanDays {days, includeNoRecordedPlays}`, `withinDays {days}` | Merged `lastPlayed` | history index absent | `includeNoRecordedPlays` defaults to `true`, which matches Dusty Corners. The explanation tells the two cases apart. |
| `playsSinceAdded` | `none`, `atLeast {n}` | Scrobbles after the **latest** copy's `date_added` | history index absent | Measures scrobbles recorded since the newest copy was **added to Discogs**, not ever. Scrobbles from before that date (e.g. streaming) do not disqualify, and the explanation mentions them. |

Deferred rule types (Phase 4+): album completeness (share of tracklist scrobbled), label, Discogs notes fields (media condition), original/master year, collection value (`collection-analytics/value-cache.json`), copies owned ≥ N, Last.fm artist tags (`cache/artist-tags.json`), embedding similarity to a seed album, and context tags (section 13). OR groups too.

### 4.5 Starter templates (`CRATE_TEMPLATES`, shared constant)

| Template | Rules |
|----------|-------|
| Template (`id`) | Rules | Sort |
|-----------------|-------|------|
| Most scrobbled, none this year (`top-quiet-year`) | `scrobbleCount topPercent 20` AND `scrobblesInPeriod calendarYear none` AND `discardPile exclude` | `scrobblesDesc` |
| Recently added to Discogs, no scrobbles since (`added-no-scrobbles`) | `dateAdded withinDays 90` AND `playsSinceAdded none` AND `discardPile exclude` | `dateAddedDesc` |
| Jazz in 40 minutes (`jazz-40`) | `genre anyOf [Jazz]` AND `runtime atMost 40 (ifUnknown: exclude)` AND `discardPile exclude` | `runtimeAsc` |
| Dusty shelf (`dusty-shelf`) | `lastRecordedPlay olderThanDays 365 (includeNoRecordedPlays: true)` AND `discardPile exclude` | `lastPlayedAsc` |

A template's description says what it approximates. For example, "Your top 20% of owned albums by recorded scrobbles, used as a stand-in for favourites. Discogs ratings are used only if you add a rating rule." The "Recently added" description says "Added to Discogs", not bought, and notes that bulk cataloguing days exist.

### 4.6 Runtime computation

New pure helper in `src/shared/utils/releaseRuntime.ts`:

```typescript
export interface ReleaseRuntime {
  knownSeconds: number;   // sum of parsed durations
  trackCount: number;     // tracks with a non-empty position (headings excluded)
  tracksWithDuration: number;
  complete: boolean;      // trackCount > 0 && tracksWithDuration === trackCount
}
export function computeReleaseRuntime(tracklist: Track[] | undefined): ReleaseRuntime;
```

It parses `M:SS` and `H:MM:SS`. Rows with an empty `position` (headings, 81 releases) are skipped. Today `parseTrackDuration` is duplicated in `savedCollectionService.ts`, `durationLookupService.ts`, `routes/scrobble.ts` and `ReleaseDetailsPage.tsx`; this plan adds the shared helper without refactoring those copies (a tech-debt note can follow). The duration-lookup chain (`DurationLookupService`, Last.fm `track.getInfo`) is **not** used during evaluation, because it makes network calls. Filling in missing runtimes is a separate enrichment job (section 14).

---

## 5. Album vs Owned-Copy Identity

### 5.1 Decision: crates hold albums, keyed the way Stats keys them

1. Load cache entries and **dedupe by release ID**, keeping `copyCount` (the number of cache entries with that ID) and the earliest/latest `date_added` among them. This matches the Collection page's dedupe and keeps "owned ×3" visible.
2. Group releases into albums with `createAlbumCanonicalizer(albumMappings, resolveArtist)(release.artist, release.title).key`, with `resolveArtist = name => artistNameResolver.resolveArtist(name)` (the same wiring `StatsService.getTopAlbums` uses). "Seamonsters" (2012) and "Seamonsters" (2021) become one album, and so do versions joined by album mappings.
3. **Do not union by Discogs `master_id`** in MVP. Local data shows Muse "Origin Of Symmetry" and "Origin Of Symmetry (XX Anniversary RemiXX)" share a master but are separate albums everywhere else in the app. Using the same key as Stats means a crate never disagrees with Top Albums or Album Detail about what "one album" is. Pressings with different titles are joined the usual way, with an album mapping (Settings > Mappings / Suggested Album Merges).

The peer reviewer independently preferred this option (canonicalizer key, no master unioning) for the same reason: a shared master is not enough evidence of album identity.

### 5.2 Album-level values derived from copies

| Value | Rule |
|-------|------|
| Display artist/title/cover | The copy with the earliest `date_added` (stable). Ties go to the lowest release ID. |
| `firstAddedAt` / `latestAddedAt` | min / max over copies. `dateAdded` rules are copy-level (witness); `playsSinceAdded` uses `latestAddedAt` ("since the newest copy was added to Discogs"). |
| Format, pressing year, date added, genre/style, rating, runtime | Per copy, evaluated together on one witness copy (section 4.3). The "why" text names the witness when there are several copies ("2023 pressing, 38:12"). |
| Scrobbles, last play, play timestamps | Per album (section 5.3). |

### 5.3 Play attribution

For each album group, build the name list:

- the union of `createCollectionNameResolver(mappings)(copy.artist, copy.title)` over all copies, **plus**
- the history names of every mapping (linked **or** unlinked) whose `createAlbumCanonicalizer(...)(historyArtist, historyAlbum).key` equals the group key.

Then make **one** `lookupMergedHistory(historyStorage, namesPerAlbum)` call for the whole collection. It already counts each matched history key once, so two copies with the same name do not double-count. Fuzzy matching comes from `batchLookup`. Full `plays` are needed for period rules (55k timestamps, small). Store per album: `scrobbleCount`, `lastPlayed`, a sorted `playTimestamps: number[]` (seconds), `matchType` and `matchedKeys`.

A small helper, `createAlbumGroupNameResolver(mappings, resolveArtist)` in `albumMapping.ts`, should build these name lists. It is the second bullet that closes gap 1.3.3. Adding it next to the existing resolvers keeps a single source of truth.

**Agreement with Album Detail (gap 1.3.4).** Album Detail does not use this union: it looks up one name, takes an exact index hit without its fuzzy siblings, and adds mappings by `collectionAlbum` string. So crates guarantee equality only where the two paths provably see the same history keys:

- **Guaranteed equal:** a single-copy album (or several copies with the same artist/title) whose collection name has an exact history hit or only fuzzy hits, opened on Album Detail by that collection name, with mappings that target that exact name. This covers the large majority of albums and is asserted by fixtures.
- **May differ, by design:** groups that join copies with **different** titles (spelling variants grouped by `albumGroupKey`, or copies joined only through a mapping), and names that have both an exact hit and fuzzy siblings ("Album" and "Album (Deluxe)" both in history). The crate counts the union of all names. Album Detail counts what its one name reaches, which can be fewer. The crate row shows `matchedKeys`, so the difference is explainable.
- MVP does **not** change Album Detail. Making Album Detail use `createAlbumGroupNameResolver` is open decision 17.11. If adopted, the guarantee widens to every album with no further crate changes.
- Fixtures in section 12 cover both the equal cases and the two known differing cases, so a change in either path is noticed.

### 5.4 Manual overrides reference releases, not names

- Overrides store the **release IDs** of the copies in the album group at the moment of the action, plus an `{artist, title}` snapshot for display.
- On every evaluation, an override applies to every **current** album group that contains any of its release IDs.
- Renames (Discogs metadata changes the title) and mapping edits change the album key but not the release IDs, so overrides survive.
- **Merge** (a new mapping joins two groups that each had overrides): both apply, using the precedence in section 6.
- **Split** (a mapping is removed): the override applies to each resulting group that contains one of its IDs.
- **Edits subtract release IDs; they never delete whole overrides.** Every override action (include, exclude, reset) carries the release IDs of the album group **as it is now**. Before adding the new override, the service removes those IDs from every existing override of the crate and deletes only overrides left with no IDs. Example: "include" was set on group {101, 102}; a mapping is removed, giving groups A = {101} and B = {102}; the user excludes A. The stored overrides become `include {102}` and `exclude {101}`, so B keeps the user's earlier choice. "Reset to rules" on B subtracts {102}, removing the include and leaving A's exclude. Without subtraction, "remove overrides that touch A" would also delete B's include.
- The snapshot of a reduced override is kept unchanged. Display names come from the cache, so it only matters for stale overrides.
- Copies acquired *after* an include (a new pressing of an included album) join through the group. Nothing needs to change.
- Manual include can only target owned releases. Crates do not hold unowned albums in MVP (section 17).

### 5.5 Duplicate release IDs

Two physical copies of the same Discogs release cannot be told apart: `CollectionItem.id` is the release ID and `instance_id` is not stored. Crates therefore treat "owned ×2" as one release. Copy-level overrides (exclude one of two identical copies) are impossible and not needed for album crates. Storing `instance_id` is a separate collection-sync change, listed under section 14.

---

## 6. Manual Inclusions & Exclusions

**Precedence: manual exclude > manual include > rules.**

- **Exclude wins.** Exclusion is the user's strongest, most specific signal ("not this one, whatever the rules say"). Crates are used to choose what to play, so a wrongly *shown* album is worse than a wrongly *hidden* one, and hidden albums stay one click away in "Excluded by you".
- **Include beats rules.** Including an album means "always show this here", including when the rules say no (e.g. the album was played this year, but the user wants it in the crate anyway).
- **Deterministic under merges.** When a mapping merges two groups with conflicting overrides, "exclude wins" gives one answer with no timestamp logic. The alternative, "most recent action wins", depends on the order of past actions and is hard to explain in the UI. The peer reviewer agreed.
- **UI keeps it simple.** "Include" on an album clears any exclude for that group's current copies, and the reverse. "Reset to rules" clears both. Both are done by subtracting release IDs (section 5.4), so other albums' choices are untouched after a split. Each album row shows its membership source: `Matches rules`, `Included by you`, or `Included by you · also matches rules`.

---

## 7. Refresh, Caching & Performance

### 7.1 Decision: evaluate on read, memoise in memory

Crates are evaluated on every request, from an **album table** that is built once and memoised in `CrateService` until its inputs change. No crate membership is written to disk in MVP. The data set is small (about 1.2k items, 5k history albums, 55k scrobbles), and persisted membership would need invalidation hooks that do not exist (gap 1.3.1). Measure before adding a persisted cache.

The **album table fingerprint** combines:

| Input | Signal |
|-------|--------|
| Collection | Count and max `mtime` (via `FileStorage.getStats`) of `collections/{username}-page-*.json` (`listFiles('collections')`), plus the `mtime` of `collections/{username}-progress.json` |
| History | `mtime` of `history/scrobble-history-index.json` + `lastSyncTimestamp`. `lastSyncTimestamp` alone tracks only the newest scrobble, not merges or rewrites such as `/stats/merge-split-entries`. |
| Album mappings | `mtime` of `mappings/album-mappings.json` |
| Artist aliases | `artistNameResolver.getFingerprint()` |
| Discard pile | `mtime` of `collections/discard-pile.json` |
| Table version | `CRATE_TABLE_VERSION` constant (bump when derivation logic changes) |

Release details (`genres`, `styles`, runtime) load **lazily**, only when some crate or suggestion recipe uses a genre/style/runtime rule. They are read straight from `collections/release-{id}.json` with `fileStorage.readJSON` and memoised per release ID with a 10-minute TTL, because those files change rarely. Reads run through a small pool with **at most 16 concurrent file reads**, so a cold load of about 1.2k files does not open them all at once.

**Single flight.** The album table build and the release-facts load each keep one in-flight promise. Concurrent requests (the Crates page asks for summaries and suggestions together; What to Play asks for pinned crates) await the same build instead of starting their own. A failed build clears the promise so the next request retries.

**Snapshot completeness.** The build also records whether the collection cache is a complete snapshot (section 9): every page 1..P exists, all pages report the same `pagination.pages = P` and `pagination.items = T`, their item counts add up to T, and the progress file is absent or not `'loading'`. Legacy pages without `pagination` count as complete only when the progress file says `'completed'`. If a read sees a mixed set of pages (an `update-new` rewrite in progress), the build retries once after 500 ms and otherwise marks the table incomplete.

**Time-relative rules** (`withinDays`, `olderThanDays`, `calendarYear`, `lastDays`) are applied at evaluation time against `now`. They are never baked into the table, so no day-boundary invalidation is needed. Crate CRUD invalidates nothing in the table, because rules run on every read.

Fingerprinting costs about 30 `stat` calls per request. If that shows up in profiles, the fingerprint can be cached for 5 s.

### 7.2 Explicit invalidation hooks (cheap, optional)

`CrateService.invalidate()` is called by the same places that already invalidate history: `ScrobbleHistorySyncService` completion (next to `statsWarmer.invalidateStatsCache()`, where `lastSyncCompletedAt` is also written, section 8.1), mapping add/remove routes, and `POST /collection/:username/update-new`. This is belt-and-braces. Correctness does not depend on these hooks because the fingerprint covers them.

### 7.3 Performance targets

| Step | Target (1.2k items) | Scales to 10k items by |
|------|---------------------|------------------------|
| Album table, cold (one `batchLookup`, no release details) | < 300 ms | Linear. `batchLookup` is a single index pass. |
| + release details (about 1.2k small file reads) | < 1 s cold, ~0 warm | Up to 10k reads cold. If too slow, persist a compact `crates/release-facts.json` (genres, styles, runtime per release ID) keyed by file mtime. |
| Evaluate one crate against a warm table | < 20 ms | O(albums × rules). `topPercent` sorts once per table. |
| `GET /crates` (all crates with counts) | < 100 ms warm | One table, N filters |
| `GET /crates/suggestions` (mine, filter, rank, persist batch) | < 300 ms warm; < 1.5 s cold including release facts | Candidate cap (section 10.1) keeps evaluation at ≤ 40 candidates × albums |

Never call `lookupMergedHistory` or `batchLookup` per album, per crate or per suggestion candidate; tests assert a single call per table build, also when several requests arrive at once. A benchmark test (section 12) checks the evaluation and suggestion targets on a synthetic 10k-album table.

---

## 8. Missing Data, Honesty & "Why This Matches"

### 8.1 Listening history is "recorded scrobbles", not listening

- **Source-agnostic.** Scrobbles come from any Last.fm scrobbler (Spotify, phone, the app, Memory Scrobble). Crates **never** say or imply a physical record was played: no "spun", "on the turntable", "played on vinyl".
- **Absence is "none recorded", never "never listened".** Copy uses "No scrobbles recorded…" and "Last recorded scrobble…". Copy never claims a listening state ("haven't played", "awaiting a first listen", "unplayed") or a purchase ("bought", "arrived"). All crate and suggestion copy comes from a reviewed set of phrase templates, and a test enforces it (section 8.4, section 12).
- **Coverage window.** History covers `oldestScrobbleDate` (Feb 2005 here) up to the newest indexed scrobble. Listening before Last.fm, and scrobbles dropped for missing album metadata (gap in section 1.2), are invisible.
- **Sync completion is tracked separately (gap 1.3.5).** Phase 1 adds an optional `lastSyncCompletedAt?: number` (ms, wall clock) to `ScrobbleHistoryIndex`. `ScrobbleHistorySyncService` sets it to `Date.now()` only in the final save of a full or incremental sync that finished (not in the partial saves every 10 pages, not on pause/abort). `lastSyncTimestamp` keeps its current meaning. The crate header shows "Listening data: Last.fm scrobbles since {Mon YYYY} · last sync finished {relative}". For an older index without the field it shows "· newest scrobble {date}" instead and makes no claim about sync age. The index file's `mtime` is not a substitute: partial saves and `/stats/merge-split-entries` also write it.
- **Stale sync.** If `lastSyncCompletedAt` is more than 3 days old and the crate has listening rules, show a banner: "Recent scrobbles may be missing. Last sync finished {date}." with a link to the sync control. With no `lastSyncCompletedAt`, the banner reads "Sync status unknown. Run a sync to make sure recent scrobbles are included." An inactive listener with a fresh sync sees no banner, however old their newest scrobble is.
- **No history index.** All listening rules return `unknown`, and the crate shows an empty state: "Sync your Last.fm history to use listening rules". Collection-only rules still work.
- **Window predates coverage.** If a period rule's window starts before `oldestScrobbleDate` (e.g. "none in the last 25 years"), the explanation appends "(history starts Feb 2005)".
- **Name-match transparency.** An album with `matchType: 'none'` shows "No scrobbles recorded under this title or its mapped names" with a link to Settings > Mappings. `fuzzy` matches show "matched as '{history name}'", taken from `matchedKeys`. This is not `unknown`: a missing name match is still "none recorded", explained.
- **Purchase vs Discogs date.** `dateAdded` copy says "Added to Discogs {date}", never "bought", "arrived" or "purchased". The template description notes that bulk cataloguing days exist.
- **Scrobbles are tracks.** Counts are track scrobbles, as everywhere else in the app ("412 scrobbles"), not album listens.

### 8.2 Per-rule unknown behaviour

| Rule | Unknown case | Default | Copy |
|------|--------------|---------|------|
| `runtime` | Durations missing; partial durations that can't decide | exclude | "Runtime unknown: Discogs lists durations for 6 of 9 tracks (24:10 known)" |
| `genre` / `style` | No release-details cache | exclude | "Genre unknown: details for this release haven't been fetched from Discogs" |
| `rating` `atLeast` | Unrated (0) | exclude | "Not rated on Discogs" |
| `pressingYear` | `year` 0/missing | exclude | "Pressing year not listed on Discogs" |
| Listening rules | No history index | exclude | crate-level empty state (above) |
| `dateAdded`, `format`, `artist`, `discardPile` | never unknown | — | — |

### 8.3 "Why this matches"

Evaluation returns structured results, and copy is generated by a shared, tested formatter (`src/shared/utils/crateReasons.ts`, `formatCrateReason(result, context)`), so backend tests and the UI agree.

```typescript
export interface CrateRuleResult {
  ruleId: string;
  outcome: 'match' | 'noMatch' | 'unknown';
  evidence: {
    releaseId?: number;          // copy that satisfied a copy-level rule
    value?: number | string | string[];
    knownSeconds?: number; tracksWithDuration?: number; trackCount?: number;
    scrobbles?: number; rank?: number; rankOf?: number;
    lastPlayed?: number | null;  // seconds
    playsBeforeAdded?: number;   // for playsSinceAdded
    historyFrom?: number;        // seconds; set when the window predates coverage
  };
}
```

Example lines:

- "Top 20% by scrobbles: 412 scrobbles, #37 of 1,150 owned albums" (illustrative numbers)
- "No scrobbles recorded since Jan 1, 2026 · last recorded Nov 3, 2025"
- "Added to Discogs Sep 14, 2026 · no scrobbles recorded since · 23 scrobbles before that (last Mar 2024)"
- "Runtime 38:12 (all 9 tracks timed, 2023 pressing)"
- "Genre: Jazz (Discogs)"
- "Included by you on Oct 2, 2026"

The UI shows the first two reasons inline and the full list in an expandable "Why?" row.

### 8.4 Reviewed copy: an allow-list, not only a blacklist

A list of banned words cannot catch new overclaims ("a record you've been meaning to hear"). So all user-facing crate copy, including reason lines, coverage text, template names/descriptions and suggestion names/reasons (section 10.4), comes from one module, `src/shared/utils/crateCopy.ts`, as a closed set of **phrase templates** with named slots (`{count}`, `{date}`, `{style}`, …). Code never concatenates free text into copy.

- **Allow-list snapshot.** A test renders every template with fixture values and compares the full list to a checked-in, human-reviewed snapshot (`tests/backend/utils/__snapshots__/crateCopy.test.ts.snap`). Adding or changing a phrase fails the test until the snapshot is reviewed and updated.
- **Semantic checks on each template.** A template about listening must contain "scrobble". A template about `date_added` must contain "Added to Discogs" (or "added to Discogs"). No template contains a listening or purchase verb outside the allow-list: "played", "heard", "listened", "spun", "first listen", "arrived", "bought", "purchased", "unplayed", "vinyl play".
- **User text is a slot.** Genre, style, artist and crate names fill slots and are excluded from the semantic checks, so a style called "Listening Music" doesn't fail the test.

---

## 9. Album Leaves the Collection / Metadata Changes

| Event | Behaviour |
|-------|-----------|
| A rule-matched album's last copy leaves the collection | It simply stops matching on the next read (fingerprint change). Nothing is stored, nothing to clean up. |
| One of several copies leaves | The group shrinks. Copy-level rules re-evaluate on the remaining copies. Overrides still apply via the remaining release IDs. |
| An override's release IDs are all gone **from a complete snapshot** | The override is kept and returned as `staleOverrides` with its snapshot. Crate settings show "2 manual choices refer to records no longer in your collection" with Remove / Remove all. A stale include **never** puts an unowned album in the crate. If the same release ID returns (re-bought), the override applies again. |
| The collection cache is **incomplete** (preload in progress or failed part-way, mixed pages during `update-new`; section 7.1) | Crates still evaluate on the items present, and the header says "Collection is still loading ({n} of {P} pages). Some albums may be missing." Overrides whose IDs are absent are **neither applied nor reported stale** (`staleOverrides` is empty), Remove / Remove all are disabled, and `removeStaleOverrides` returns `409`. Suggestions are not mined and no impressions are recorded (section 10.5). Nothing is ever deleted because of a partial cache. |
| Item is in the discard pile | Still owned until removed from Discogs. `discardPile exclude` (on in every template) hides it. |
| Discogs renames a title or artist | Overrides follow release IDs. The display name updates from the cache. Rules re-evaluate. The play match may change (new name, new history lookup). The "why" line shows the current match. |
| Album mapping added/removed | The fingerprint changes and groups merge or split (section 5.4). Play counts change exactly as they do on Album Detail. |
| Release details refetched (new genres/durations) | Picked up after the release-details TTL (≤ 10 min) or on `invalidate()`. |
| A crate rule refers to a value that no longer exists (e.g. format "Cassette" after the only cassette is sold) | The rule stays valid and matches nothing. The builder shows the value as "(not in collection)". |

No write-on-read: evaluation never mutates `crates.json`. Snapshots refresh only when the user edits overrides.

---

## 10. Suggested Crates

The user should not have to invent crates. The Crates page shows a small row of **suggested crates** mined from the user's own collection and scrobbles. Each card has a name, a reason, a member count, a few covers, and **Add** / **Not interested** / **Preview** buttons. **Add** creates a normal crate with exactly the suggested rules and sort. It opens in the detail view and can be edited like any other. Suggestions rotate **deterministically** (least recently shown first), so the row changes from day to day and on request without relying on randomness.

**MVP scope (revised after the second peer review):** six recipes that map exactly onto the rule catalogue, deterministic least-recently-shown rotation, a persisted daily batch, and permanent tombstones for "Not interested" and Add, stored in a file of their own. Seasonal and anniversary recipes, decay/rest periods and timed re-suggestion are deferred (section 10.9).

### 10.1 Where suggestions come from: recipes

A **recipe** is a parameterised crate generator mined from the user's data. It produces zero or more **candidates**: `{ candidateKey, recipe, name, description, rules, sort }`. **Every candidate uses only the operators of section 4.4 and the sorts in `CrateSort` (section 11.1)**, so Add creates an identical, editable crate. A candidate's count and members come from `crateEvaluator` on the same album table, with no overrides.

| Recipe (`recipe`) | Mined from (prefilter) | Rules (each also ANDs `discardPile exclude`) | Sort | Example name | `candidateKey` |
|-------------------|------------------------|-----------------------------------------------|------|--------------|----------------|
| Quiet style (`style-quiet`) | Styles with ≥ 8 owned albums (style known) | `style anyOf [S]` AND `scrobblesInPeriod lastDays 365 none` | `lastPlayedAsc` | "Post-Punk with no scrobbles in 12 months" | `style-quiet:post-punk` |
| Artist shelf (`artist`) | Resolved artists with ≥ 5 owned albums | `artist anyOf [A]` | `lastPlayedAsc` | "Your Wedding Present shelf" | `artist:the wedding present` |
| Quiet decade (`decade-quiet`) | Pressing-year decades with ≥ 5 owned albums | `pressingYear between {D, D+9}` AND `lastRecordedPlay olderThanDays 365 (includeNoRecordedPlays: true)` | `scrobblesAsc` (new, section 11.1) | "1990s pressings with no scrobbles in a year, fewest scrobbles first" | `decade-quiet:1990` |
| Top albums gone quiet (`top-quiet`) | Top-20% set has ≥ 5 albums; windows 365 and 730 days | `scrobbleCount topPercent 20` AND `lastRecordedPlay olderThanDays W (includeNoRecordedPlays: false)` | `scrobblesDesc` | "Most-scrobbled albums with nothing recorded for 2 years" | `top-quiet:730` |
| Added, no scrobbles since (`added-quiet`) | Windows 90 and 180 days | `dateAdded withinDays W` AND `playsSinceAdded none` | `dateAddedDesc` | "Added to Discogs in the last 90 days, no scrobbles recorded since" | `added-quiet:90` |
| Short records (`short`) | Genres with ≥ 5 owned albums of known runtime ≤ 40 min | `genre anyOf [G]` AND `runtime atMost 40 (ifUnknown: exclude)` | `runtimeAsc` | "Jazz that fits in 40 minutes" | `short:jazz:40` |

- **Prefilters are cheap counts** on the album table. They only decide which candidates get evaluated. The size filter (section 10.2) on the evaluated count decides. Every prefilter minimum is at least the size minimum (5), so no recipe mines candidates that the filter must always reject.
- **`style-quiet` uses `lastDays 365`, not `calendarYear`.** In January almost every album has no scrobbles "this year", which would make the recipe meaningless for weeks.
- **`candidateKey`** is `recipe:` plus the parameter, normalised with `normalizeForMatching`, so a suggestion keeps its key across days and data refreshes.
- **No history index:** recipes with a listening rule (`style-quiet`, `decade-quiet`, `top-quiet`, `added-quiet`) are skipped, because every album would be `unknown`. `artist` and `short` still run. Collection-only candidates are never rejected for lack of history.
- **Candidate cap:** each recipe yields at most 8 candidates (largest prefilter count first, then key), and at most 40 candidates are evaluated per mining pass. Mining is memoised per album-table fingerprint and local day.
- **Fallback templates:** when fewer than 3 mined candidates survive the filters, the starter templates (section 4.5) join the pool as candidates with keys `template:<id>` and their own rules and sort. They pass through the **same filters** (size, tombstones, an existing crate made from that template, overlap). If nothing survives, the suggestion row is hidden. It never shows an empty, dismissed or duplicate card.
- Recipes only read cached data, like crate evaluation (no network calls).

### 10.2 Filtering: only useful candidates

Applied in this order, to mined and fallback candidates alike:

1. **Size:** the evaluated rule-member count must be between 5 and 60 (`SUGGESTION_MIN_SIZE`, `SUGGESTION_MAX_SIZE`). The prefilters use the same constants.
2. **Tombstoned:** the candidate's record is `dismissed` or `added` (section 10.5).
3. **Already a crate:** an existing crate has `sourceSuggestionKey === candidateKey`, or `templateId` equal to a fallback candidate's template id.
4. **Too similar to an existing crate:** Jaccard overlap of member album keys with an existing crate's current members (its evaluation, overrides included) is ≥ 0.7.
5. **Near-duplicates in the pool:** when two candidates overlap ≥ 0.7, keep the one with higher relevance, then the lower key. For example `added-quiet:90` and `added-quiet:180` with the same members collapse to one.

What survives is the **eligible set** E.

### 10.3 Choosing what to show: deterministic rotation

There is no random term. Two inputs decide the order: how recently a candidate was shown, and its relevance.

**Relevance (0-1).** `relevance = 0.5 × sizeFit(n) + 0.5 × signal`, where n is the member count.

- `sizeFit(n)` is 1 for 10 ≤ n ≤ 30. It rises linearly from 0.5 at n = 5 to 1 at n = 10, and falls linearly from 1 at n = 30 to 0.5 at n = 60.
- `signal` is a share with a real denominator taken from the album table, so it is never true by construction. (The first draft's "share of members with no scrobbles this year" was always 100% for the quiet-style recipe, because the rule already requires it.)

| Recipe | `signal` |
|--------|----------|
| `style-quiet` | members ÷ owned albums with that style: how much of the style has gone quiet |
| `artist` | members with no scrobbles in the last 365 days ÷ members |
| `decade-quiet` | members ÷ owned albums pressed in that decade |
| `top-quiet` | members ÷ albums in the top 20% |
| `added-quiet` | members ÷ albums added to Discogs in the window |
| `short` | members ÷ owned albums of that genre with known runtime |
| `template:*` | 0.5 (fixed) |

Worked examples (illustrative numbers at the local collection's scale):

| Candidate | Inputs | n | sizeFit | signal | relevance |
|-----------|--------|---|---------|--------|-----------|
| `style-quiet:post-punk` | 23 owned Post-Punk albums, 15 with no scrobbles in 365 days | 15 | 1.00 | 15/23 = 0.65 | 0.83 |
| `artist:the wedding present` | 12 owned albums, 4 with no scrobbles in 365 days | 12 | 1.00 | 4/12 = 0.33 | 0.67 |
| `added-quiet:90` | 6 added in 90 days, 5 with no scrobbles since | 5 | 0.50 | 5/6 = 0.83 | 0.67 |
| `decade-quiet:1990` | 140 owned 1990s pressings, 52 quiet for a year | 52 | 1 − 0.5 × 22/30 = 0.63 | 52/140 = 0.37 | 0.50 |

Ties are broken by `candidateKey` (ascending).

**Batch selection** (batch size B = 3), given the eligible set E and an exclusion set X:

1. Remove X from E. For the daily batch, X is the previous day's last served batch (`previousKeys`). For a reroll, X is everything shown today (`shownToday`).
2. Group what remains into **tiers** by `lastShownDay`, oldest first, with never-shown candidates as the first tier.
3. Fill the batch tier by tier. Inside a tier, pick greedily by relevance, preferring a candidate whose recipe is not yet in the batch and whose overlap with every picked candidate is < 0.5. Fall back to plain relevance order only when no candidate in the tier qualifies. Diversity therefore works only inside a tier and never pulls a more recently shown candidate ahead of an older one.
4. Stop at B. If fewer than B remain, the batch **shrinks**. It is not refilled from X.
5. Daily batch only: if E minus X is empty but E is not (a user with 1-3 candidates), serve the still-eligible members of X, so a small collection still sees its suggestions. A reroll never does this.

What this guarantees, with no user action:

- The same local day always returns the same batch, also after a restart (persisted, section 10.5).
- If |E| ≥ 2B, consecutive days' batches share no candidate.
- Never-shown candidates always come before shown ones, and among shown ones the least recently shown come first. So no eligible candidate waits while another is shown twice, except when both land in the same batch. With 6 candidates and B = 3 the row alternates between two sets of three. With 21 candidates each one returns after 7 days.
- If B < |E| < 2B, full and shrunken batches alternate (for |E| = 4: three cards, then one, then three).

There is **no per-candidate showing cap**. The first draft's "at most 3 showings" could not hold together with "different every day": 6 candidates × 3 cards × 7 days need 21 slots, and the cap allowed only 18. Least-recently-shown ordering gives the fairness the cap was meant to give.

**Show different suggestions** selects a new batch with X = `shownToday` (the day's batch, earlier rerolls and backfills). The new batch replaces today's persisted batch and is recorded as shown. When nothing is left, the response is empty with `exhausted: true`. The UI then keeps the current cards and says "That's all the suggestions for today."

Default batch size: 3 cards on the Crates page. The What to Play **Crates** tab shows 1 suggestion in its empty state (section 10.6, `limit=1`).

### 10.4 Explaining a suggestion

Every card says why it was suggested, using the reviewed copy templates (section 8.4): "You own 23 Post-Punk albums. 15 have no scrobbles recorded in the last 12 months." Counts come from the candidate's live evaluation at request time. The card shows up to 4 covers and the total. **Preview** opens the crate view read-only (`POST /crates/preview` with the candidate's rules and sort) before adding.

### 10.5 State and storage

Suggestion state lives in **its own file**, `collections/crate-suggestions.json`, not in `crates.json`. `BackupService.mergeAndSave` writes back only `{ schemaVersion, [arrayKey] }`, so a sibling field next to `crates` would be erased by a restore. A separate file avoids that (section 11.4).

```typescript
export interface CrateSuggestionRecord {
  candidateKey: string;
  status: 'active' | 'dismissed' | 'added';
  lastShownDay?: string;     // local YYYY-MM-DD
  daysShown: number;         // distinct days shown (informational)
  dismissedAt?: number;      // ms
  addedAt?: number;          // ms
  addedCrateId?: string;
  updatedAt: number;         // ms; backup merge keeps the newer record
}

export interface CrateSuggestionBatch {
  day: string;               // local YYYY-MM-DD
  keys: string[];            // current batch, display order
  shownToday: string[];      // every key shown today: batch, rerolls, backfills
  previousKeys: string[];    // last batch served on the previous day it was built
}

export interface CrateSuggestionStore extends VersionedStore {
  schemaVersion: 1;
  records: CrateSuggestionRecord[];
  batch?: CrateSuggestionBatch;
}
// Crate gains: sourceSuggestionKey?: string
```

**Transitions (MVP):**

| From | Event | To |
|------|-------|----|
| (no record) | shown for the first time | `active`, `lastShownDay = today`, `daysShown = 1` |
| `active` | shown on a later day | `lastShownDay = today`, `daysShown + 1` |
| `active` | Not interested | `dismissed`, `dismissedAt`: a permanent tombstone |
| `active` or (no record) | Add (crate created with `sourceSuggestionKey`) | `added`, `addedAt`, `addedCrateId`: a permanent tombstone |
| `added` | the crate is deleted | stays `added`. The key is not suggested again. |
| any | "Reset suggestion history" (Crates page menu, with confirmation) | all records and the batch are deleted |

- **No timed return, decay or rest periods in MVP.** This removes the first draft's 180-day return, second-dismissal rule and 90-day post-delete window, and with them the need for a deletion timestamp. Tombstones are simply permanent until the user resets.
- **Pruning:** `active` records whose `lastShownDay` is more than 365 days old are pruned. That only makes a candidate look "never shown". Tombstones are never pruned.
- **Persisted daily batch.** The first request of a local day builds the batch and writes `batch` and all its impressions in one `writeJSONWithBackup`, then serves it. Later requests that day read it, so a restart, a reload or a second tab neither re-selects nor re-counts. On a new day, `previousKeys` takes the old `batch.keys`.
- **Impression dedupe:** a record changes only when its `lastShownDay` differs from today. Re-reading a batch changes nothing.
- **Revalidation on every read.** Each key in today's batch is looked up in the current mined pool (memoised per table fingerprint) and its count re-evaluated, so counts are always live. A key that is now tombstoned, already a crate, outside the size bounds or no longer mined is dropped and **backfilled** with the next candidate in selection order, excluding `shownToday` and `previousKeys`. Backfills are appended to `batch.keys` and `shownToday` and recorded as shown. If none is available, the row shrinks.
- **Incomplete collection snapshot (section 9):** the endpoint returns no suggestions with `reason: 'collectionLoading'` and writes nothing.
- **Concurrency:** all writes go through the service's in-memory store and one promise-chain write queue, so two concurrent requests on a new day build the batch once.

### 10.6 API and service

- `crateSuggestionService.ts`: pure functions `mineCandidates(table, now)`, `filterCandidates(candidates, crates, records)`, `scoreCandidate(candidate, table)` and `selectBatch(eligible, records, { batchSize, exclude })`, plus a thin service that loads and saves `collections/crate-suggestions.json`. The clock is injected. There is no seed.
- `GET /api/v1/crates/suggestions?limit=3` → `{ suggestions: CrateSuggestion[]; exhausted: boolean; reason?: 'collectionLoading' | 'noCandidates' }`, with `CrateSuggestion = { candidateKey, recipe, name, description, reason, rules, sort, count, sampleReleaseIds }`.
  - Only `limit=3` (default) and `limit=1` are accepted.
  - `limit=3` returns today's batch, building it if needed.
  - `limit=1` returns the first entry of today's batch, building the batch if needed. It never builds a separate batch and records no extra impressions, so What to Play and the Crates page agree.
- `POST /api/v1/crates/suggestions/reroll` → a new batch (section 10.3), same response shape.
- `POST /api/v1/crates/suggestions/:candidateKey/dismiss` → tombstones the key and returns the backfilled batch.
- `DELETE /api/v1/crates/suggestions/history` → "Reset suggestion history".
- **Add** uses the existing `POST /api/v1/crates` with `{ name, description, rules, sort, sourceSuggestionKey }`. After the crate is saved, `CrateService.createCrate` asks the suggestion service to tombstone the key (`added`). If that write fails, the crate still exists and filter 3 (section 10.2) still hides the suggestion.

### 10.7 Frontend

`CrateSuggestions.tsx` on the Crates list view, above the user's crates: up to 3 `CrateSuggestionCard`s (name, reason, count, covers, **Add** with lucide `Plus`, **Not interested** with `EyeOff`, **Preview**), and a **Show different suggestions** button (`Shuffle`), disabled with its message once the response says `exhausted`. After **Add**, the new crate opens in the detail view with a toast ("Crate added. Edit its rules any time."), and the row is refetched when the list view returns. After **Not interested**, the card is replaced by the backfilled batch from the response. A small menu offers "Reset suggestion history" (confirm dialog). While `reason` is `collectionLoading`, the row shows "Suggestions appear once your collection has finished loading."

### 10.8 What suggestions must not do

- Suggest a crate with fewer than 5 or more than 60 albums, or one overlapping an existing crate by ≥ 70%.
- Use a rule or sort that a saved crate cannot hold.
- Use copy outside the reviewed templates (section 8.4).
- Call Discogs or Last.fm.
- Re-suggest anything dismissed or added, until the user resets suggestion history.
- Record impressions when an existing batch is re-read, or while the collection cache is incomplete.

### 10.9 Deferred to Phase 4

- **Seasonal** ("Your October records": albums whose scrobbles cluster in the current calendar month in past years) needs a new rule, for example `scrobbleMonthShare { month, minShare, minYears }`, so Add can reproduce it.
- **Anniversary** ("Added to Discogs in October in earlier years") needs a `dateAdded inMonth { month, beforeYear? }` operator.
- Timed return of dismissed suggestions, novelty decay and rest periods, if deterministic rotation proves too rigid in use.
- A deferred recipe ships only together with its rule type, so the exact-mapping requirement keeps holding.

---

## 11. Data Model, Backend, Frontend

### 11.1 Types (`src/shared/types.ts`)

```typescript
export type CrateUnknownPolicy = 'exclude' | 'include';
export type CratePeriod =
  | { kind: 'calendarYear' }
  | { kind: 'lastDays'; days: number }
  | { kind: 'since'; date: string };            // ISO yyyy-mm-dd

interface CrateRuleBase { id: string }           // stable within the crate
export type CrateRule = CrateRuleBase & (
  | { field: 'format'; op: 'anyOf' | 'noneOf'; values: string[] }
  | { field: 'artist'; op: 'anyOf'; values: string[] }
  | { field: 'genre' | 'style'; op: 'anyOf' | 'noneOf'; values: string[]; ifUnknown?: CrateUnknownPolicy }
  | { field: 'pressingYear'; op: 'between'; from?: number; to?: number; ifUnknown?: CrateUnknownPolicy }
  | { field: 'dateAdded'; op: 'withinDays' | 'olderThanDays'; days: number }
  | { field: 'dateAdded'; op: 'between'; from?: string; to?: string }
  | { field: 'rating'; op: 'atLeast'; value: number; ifUnknown?: CrateUnknownPolicy }
  | { field: 'rating'; op: 'isUnrated' }
  | { field: 'runtime'; op: 'atMost' | 'atLeast'; minutes: number; ifUnknown?: CrateUnknownPolicy }
  | { field: 'runtime'; op: 'between'; minMinutes: number; maxMinutes: number; ifUnknown?: CrateUnknownPolicy }
  | { field: 'discardPile'; op: 'exclude' | 'only' }
  | { field: 'scrobbleCount'; op: 'atLeast' | 'atMost'; value: number }
  | { field: 'scrobbleCount'; op: 'topPercent'; percent: number }
  | { field: 'scrobblesInPeriod'; period: CratePeriod; op: 'none' }
  | { field: 'scrobblesInPeriod'; period: CratePeriod; op: 'atLeast' | 'atMost'; value: number }
  | { field: 'lastRecordedPlay'; op: 'olderThanDays'; days: number; includeNoRecordedPlays: boolean }
  | { field: 'lastRecordedPlay'; op: 'withinDays'; days: number }
  | { field: 'playsSinceAdded'; op: 'none' }
  | { field: 'playsSinceAdded'; op: 'atLeast'; value: number }
);

export interface CrateOverride {
  id: string;
  action: 'include' | 'exclude';
  releaseIds: number[];                          // copies in the group at action time
  snapshot: { artist: string; title: string; coverUrl?: string };
  createdAt: number;                             // ms
}

export type CrateSort =
  | 'artist' | 'lastPlayedAsc' | 'scrobblesDesc' | 'scrobblesAsc'   // scrobblesAsc: "fewest scrobbles first" (decade-quiet suggestions)
  | 'dateAddedDesc' | 'runtimeAsc';

export interface Crate {
  id: string;                                    // crypto.randomUUID()
  name: string;                                  // 1-80 chars, unique (case-insensitive)
  description?: string;
  rules: CrateRule[];                            // AND; max 20
  overrides: CrateOverride[];
  sort: CrateSort;
  pinnedToWhatToPlay: boolean;
  templateId?: string;
  sourceSuggestionKey?: string;                  // set when created from a suggestion (section 10.5)
  createdAt: number;                             // ms
  updatedAt: number;                             // ms
}

export interface CratesStore extends VersionedStore {
  schemaVersion: 1;
  crates: Crate[];
}

export interface CrateAlbumResult {
  albumKey: string;                              // albumGroupKey (display/debug only; not persisted)
  artist: string; album: string; coverUrl?: string;
  copies: Array<{ releaseId: number; title: string; year?: number; format: string[]; dateAdded: string; copyCount: number }>;
  witnessReleaseId: number;                      // copy satisfying all copy-level rules (section 4.3); the display copy for include-only members. "Open release" target
  membership: 'rules' | 'included' | 'includedAndRules';
  listening: { scrobbleCount: number; lastPlayed: number | null; matchType: 'exact' | 'fuzzy' | 'none'; matchedKeys: string[] };
  runtimeSeconds?: number;                       // when complete for some copy
  results: CrateRuleResult[];
}

export interface CrateEvaluation {
  crateId: string | null;                        // null for unsaved preview
  evaluatedAt: number;                           // ms
  albums: CrateAlbumResult[];                    // sorted per crate.sort
  excluded: CrateAlbumResult[];                  // manual excludes that are still owned
  unknownOnly: { ruleId: string; count: number; sample: CrateAlbumResult[] }[];
  staleOverrides: CrateOverride[];
  coverage: {
    totalAlbums: number; totalReleases: number;
    historyFrom: number | null;                  // seconds (index.oldestScrobbleDate)
    newestScrobbleAt: number | null;             // ms (index.lastSyncTimestamp: newest scrobble, not sync time)
    lastSyncCompletedAt: number | null;          // ms (index.lastSyncCompletedAt; null for older indexes)
    collection: { complete: boolean; pagesRead: number; pagesExpected: number | null };
    runtimeKnownAlbums: number; genreKnownAlbums: number; ratedAlbums: number;
  };
}

// ScrobbleHistoryIndex (existing) gains: lastSyncCompletedAt?: number  // ms, set when a sync finishes (section 8.1)
// Suggestion types: CrateSuggestionRecord, CrateSuggestionBatch, CrateSuggestionStore (section 10.5) and CrateSuggestion (section 10.6)

export interface CrateSummary {
  id: string; name: string; description?: string; pinnedToWhatToPlay: boolean;
  count: number; unknownCount: number; staleOverrideCount: number; updatedAt: number;
}
```

### 11.2 Backend

**Storage:** `collections/crates.json` (next to `saved-collections.json` and `discard-pile.json`) holds only `{ schemaVersion, crates }`. Suggestion state is a separate file, `collections/crate-suggestions.json` (section 10.5).

**`src/backend/services/crateAlbumTable.ts`** (pure plus thin I/O): `buildAlbumTable(inputs): AlbumTable`, which dedupes by release ID, groups (section 5), attributes plays (one `lookupMergedHistory`), precomputes `topPercent` ranks and records snapshot completeness (section 7.1). `loadReleaseFacts(releaseIds, fileStorage, { concurrency: 16 })` does the lazy genre/style/runtime load. Both are wrapped in single-flight promises.

**`src/backend/services/crateEvaluator.ts`** (pure, no I/O): `evaluateCopyRules(copyRules, album, ctx)` (witness-copy search, section 4.3), `evaluateRule(rule, album, ctx)`, `evaluateCrate(crate, table, now): CrateEvaluation`, `validateCrateRules(rules): string[]`. Every edge case is unit-testable with fixtures.

**`src/backend/services/crateService.ts`**, following the `SavedCollectionService` / `DiscardPileService` patterns:
- constructor `(fileStorage, historyStorage, mappingService, discardPileService, authService)`, plus `setArtistNameResolver(resolver)`, wired in `server.ts` next to `statsService.setArtistNameResolver` (the resolver is built asynchronously at startup).
- `loadStore()` / `saveStore()` with `writeJSONWithBackup('collections/crates.json', store)` and a `schemaVersion === 1` check.
- CRUD: `listCrates()`, `getCrate(id)`, `createCrate(input)`, `updateCrate(id, patch)`, `deleteCrate(id)`.
- Overrides: `setOverride(id, {releaseIds, action})` subtracts `releaseIds` from every existing override, drops overrides left empty, then appends the new one. `clearOverrides(id, releaseIds)` (Reset to rules) does the same subtraction without appending. `removeStaleOverrides(id)` (refused while the collection snapshot is incomplete, section 9).
- Evaluation: `evaluate(id)`, `preview(rules, overrides?)`, `summaries()`, `cratesForRelease(releaseId)`, `invalidate()`.
- Gets the username from `authService.getUserSettings()`. No Discogs user → `401`, same as `/stats/dusty-corners`.

**`src/backend/services/crateSuggestionService.ts`** (section 10.6): pure mining/filtering/scoring/selection functions plus a service that owns `collections/crate-suggestions.json`, with the same `loadStore()` / `saveStore()` pattern and a write queue. It reads the album table and crate evaluations through `CrateService` (no table of its own). `CrateService.createCrate` calls `markAdded(candidateKey, crateId)` when `sourceSuggestionKey` is set.

**Sync service change (small, Phase 1):** `ScrobbleHistorySyncService` writes `index.lastSyncCompletedAt = Date.now()` in the final save of a completed full or incremental sync (section 8.1), with a test that partial saves and pause/abort leave it unchanged.

**Migration:** in `MigrationService.registerAllFiles()`:

```typescript
this.register('crates', {
  path: 'collections/crates.json',
  currentVersion: 1,
  migrations: [],
  optional: true,
});
this.register('crate-suggestions', {
  path: 'collections/crate-suggestions.json',
  currentVersion: 1,
  migrations: [],
  optional: true,
});
```

**Routes:** `src/backend/routes/crates.ts`, `createCratesRouter(crateService)`, mounted at `/api/v1/crates` in `server.ts` and listed in the endpoint index object.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | `CrateSummary[]` (counts from the memoised table) |
| GET | `/templates` | `CRATE_TEMPLATES` |
| POST | `/` | Create `{ name, description?, rules, sort?, pinnedToWhatToPlay?, templateId? }` |
| POST | `/preview` | Evaluate unsaved `{ rules, sort?, overrides? }` → `CrateEvaluation` (builder live count, suggestion Preview) |
| GET | `/:id` | `{ crate, evaluation }` |
| PUT | `/:id` | Update name/description/rules/sort/pinned |
| DELETE | `/:id` | Delete |
| POST | `/:id/overrides` | `{ releaseIds: number[], action: 'include' \| 'exclude' }` |
| DELETE | `/:id/overrides` | `{ releaseIds }`: reset these albums to rules |
| DELETE | `/:id/overrides/stale` | Remove stale overrides |
| GET | `/for-release/:releaseId` | Crates whose evaluation contains that release (Phase 3) |
| GET | `/suggestions?limit=3\|1` | Today's suggestion batch (section 10.6) |
| POST | `/suggestions/reroll` | Show different suggestions |
| POST | `/suggestions/:candidateKey/dismiss` | Not interested |
| DELETE | `/suggestions/history` | Reset suggestion history |

Validation (with `validation.ts` helpers): `id` is a UUID; name length and uniqueness; at most 20 rules; known `field`/`op` combinations; numeric bounds (`days` 1-36500, `percent` 1-100, `minutes` 1-1000, `rating` 1-5); ISO dates; `releaseIds` are positive integers (at most 50 per call); `limit` is 1 or 3; `candidateKey` matches `^[a-z-]+:[^/]{1,120}$`. The `/suggestions*` routes are declared before `/:id` so they are not captured as crate IDs. Unknown fields → `400` with the list of errors from `validateCrateRules`.

### 11.3 Frontend

- **Route & nav:** `ROUTES.CRATES = 'crates'`. Sidebar "Library" group: a "Crates" item after "Browse Collection" (lucide `Boxes`, 18px, `aria-hidden`), enabled when Discogs is authenticated. Crate detail uses `navigate(ROUTES.CRATES, { id })`.
- **`src/renderer/pages/CratesPage.tsx` + `CratesPage.page.css`:** list view (cards: name, count, pinned toggle, stale/unknown badges) and detail view.
- **`src/renderer/components/crates/`:**
  - `CrateRuleBuilder.tsx` + `.css`: a row per rule (field select → operator select → value input). Multi-value chips use `Badge pill`. Each unknown-capable rule has an "Include albums with missing data" checkbox. A live preview (debounced `POST /crates/preview`) shows the count and the "might match — data missing" counts. Help text per rule includes the honesty notes (Pressing year, Added to Discogs, "scrobbles from any source").
  - `CrateAlbumList.tsx` / `CrateAlbumRow.tsx`: cover, `AlbumLink`, copies ("2 pressings", "owned ×2"), membership badge, two inline reasons, an expandable "Why?" (formatted by `formatCrateReason`), and Include/Exclude/Reset actions (icon buttons with `aria-label`).
  - `CrateCoverageNotice.tsx`: history window, last sync finished (or newest scrobble), sync staleness banner, "collection still loading" notice, runtime/genre/rating coverage.
  - `CrateSuggestions.tsx` / `CrateSuggestionCard.tsx` (Phase 2b, section 10.7).
  - `CrateExcludedSection.tsx`, `CrateStaleOverrides.tsx`.
  - `AddToCrateMenu.tsx` (Phase 3): used on ReleaseDetailsPage and AlbumDetailPage.
- **What to Play:** add a `'crates'` tab to `WhatToPlayPage` (`VALID_TABS`, `TAB_LABELS: 'Crates'`) rendering `components/whattoplay/CratesContainer.tsx`. It shows pinned crates (empty state: "Pin a crate to see it here" + link to Crates). Each card has "Pick one", a client-side random choice from `evaluation.albums`, shown with its reasons, "Open release" (writes the witness copy, `witnessReleaseId`, to `selectedRelease` and navigates to `release-details`, as the Collection page does) and "Pick another".
- **Collection:** Phase 3, a "Save as crate" button next to the preset save button when filters are active. Mapping: `format` → `format anyOf [x]`; `yearFrom/yearTo` → `pressingYear between`; `dateAdded` `week|month|3months|year` → `dateAdded withinDays 7|30|90|365`.
- **API client (`src/renderer/services/api.ts`):** `getCrates`, `getCrateTemplates`, `getCrate`, `createCrate`, `updateCrate`, `deleteCrate`, `previewCrate`, `setCrateOverride`, `clearCrateOverrides`, `removeStaleCrateOverrides`, `getCratesForRelease`, `getCrateSuggestions(limit)`, `rerollCrateSuggestions`, `dismissCrateSuggestion`, `resetCrateSuggestionHistory`. Pages use `useAsync`.
- **Styling:** design tokens only, co-located `.page.css` / component `.css`, no inline styles, no emoji, lucide icons (`Boxes`, `Shuffle`, `Info`, `EyeOff`, `RotateCcw`, `Plus`).

### 11.4 Backup

In `backupService.ts`:
- `FILE_PATHS.crates = 'collections/crates.json'`, a `loadCrates()` helper, `BackupData.crates?: Crate[]` (**optional**, so older backups validate and import unchanged), `BackupPreview.cratesCount?`, a compare entry (`c => c.id`), and import via `mergeAndSave(FILE_PATHS.crates, data.crates, c => c.id, 'crates', merge, (a, b) => a.updatedAt > b.updatedAt ? a : b)`, the same as `savedCollections`. This is safe only because `crates.json` holds nothing but `{ schemaVersion, crates }`: `mergeAndSave` writes back exactly `{ schemaVersion: 1, [arrayKey] }` in both modes, so any sibling field would be erased.
- **Suggestion state is a second file with its own entry:** `FILE_PATHS.crateSuggestions = 'collections/crate-suggestions.json'`, `BackupData.crateSuggestions?: CrateSuggestionRecord[]` (optional), a compare entry (`r => r.candidateKey`), and import via `mergeAndSave(FILE_PATHS.crateSuggestions, data.crateSuggestions, r => r.candidateKey, 'records', merge, (a, b) => a.updatedAt > b.updatedAt ? a : b)`. Only `records` is backed up. The `batch` field is deliberately dropped on restore, because it is a same-day cache: the next request builds a new batch from the restored records. Tombstones survive a restore; a merge keeps a local tombstone unless the backup's record is newer.
- Both services get a `reload()` that drops their cached in-memory store, and the backup import route calls it after a restore. `SavedCollectionService` caches its store for the life of the process, so today a restore is not seen until restart and the next write would overwrite it. Crates must not copy that gap.
- Known limitation, inherited from `mergeAndSave`: merge mode never deletes, so a crate deleted after a backup comes back on merge-restore. That is acceptable and matches saved collections.
- Overrides reference release IDs. Restoring onto a different collection makes them stale, not broken (section 9).

---

## 12. Tests

**Backend unit: `tests/backend/services/crateEvaluator.test.ts`** (pure, fixture-driven)
- Every rule × operator: match / noMatch / unknown, including `ifUnknown: 'include'`.
- Runtime: complete; partial with the known part over `atMost` → `noMatch`; partial and undecidable → `unknown`; headings skipped; `H:MM:SS`.
- Witness copy: vinyl + CD with `format noneOf [CD]` → match naming the vinyl copy. Vinyl (50 min) + CD (35 min) with `format anyOf [Vinyl]` AND `runtime atMost 40` → `noMatch` (no single copy satisfies both). Two matching copies → the earliest `date_added`, then the lowest ID, is the witness. One copy `unknown` and the other `noMatch` → album `unknown`, counted in "might match".
- `topPercent`: ties included, zero-scrobble albums excluded, ranks computed over all owned albums and not the filtered set.
- `calendarYear` boundary with fake timers (Dec 31 23:59 vs Jan 1 00:01 local).
- `playsSinceAdded`: plays before `latestAddedAt` don't count; the evidence reports `playsBeforeAdded`.
- `lastRecordedPlay olderThanDays` with `includeNoRecordedPlays` true/false.
- Precedence: exclude > include > rules. A merge of two groups with include + exclude → excluded. A split carries the override to both halves.
- Override subtraction (`crateService`): include on {101, 102}, split into {101} and {102}, exclude {101} → stored `include {102}` + `exclude {101}`, and group {102} is still included. Reset on {102} removes only the include. An override reduced to no IDs is deleted.
- Stale overrides are reported and never add members. Re-acquired release IDs reapply.
- Zero-rule crate: only includes. No history index → listening rules unknown, collection rules still work.

**Backend unit: `tests/backend/services/crateAlbumTable.test.ts`**
- Duplicate release IDs collapse with `copyCount`.
- Same-title pressings group. Muse-style shared `master_id` with different titles does **not** group.
- Mapping-linked versions group, and their plays are counted once (two copies with the same name → no double count).
- An unlinked mapping into the collection name is included (gap 1.3.3).
- `lookupMergedHistory` / `batchLookup` called **once** per build (spy).
- Release details are read with `fileStorage.readJSON` only. `DiscogsService.getReleaseDetails` is never called.
- Fingerprint changes when a collection page / progress file / history index / album mappings / discard pile mtime changes, and does not change otherwise.
- Snapshot completeness: all pages consistent → complete. Progress `'loading'`, a missing middle page, pages that disagree on `pagination.pages` / `items`, or item counts that don't add up → incomplete, and the stale-override list is empty. A release absent from an incomplete snapshot is not reported stale; the same absence in a complete snapshot is.
- Single flight: three concurrent `getTable()` calls → one build and one `lookupMergedHistory` call. Release facts: at most 16 reads in flight (instrumented fake `fileStorage`).

**Backend: `tests/backend/services/crateService.test.ts`:** CRUD, name uniqueness, rule validation errors, `writeJSONWithBackup` use, schema check, `setOverride` clearing the opposite action by subtraction, `removeStaleOverrides` (and its refusal while the snapshot is incomplete), `reload()`.

**Sync: extend `tests/backend/scrobbleHistorySyncService.test.ts`:** `lastSyncCompletedAt` is set on completed full and incremental syncs and unchanged after partial saves, pause and abort. `lastSyncTimestamp` behaviour is unchanged.

**Routes: `tests/backend/routes/crates.test.ts`:** each endpoint's happy path, `400` validation (bad field/op, out-of-range numbers, non-UUID id), `401` without a Discogs username, `404` unknown crate, `/preview` with no saved crate.

**Shared: `tests/backend/utils/crateReasons.test.ts`, `crateCopy.test.ts` and `releaseRuntime.test.ts`:** reason copy per rule and outcome. The **reviewed-copy test** (section 8.4): every phrase template is rendered and matched against the checked-in allow-list snapshot, every listening template contains "scrobble", every date-added template contains "Added to Discogs", and no template contains a listening/purchase verb ("played", "heard", "listened", "spun", "first listen", "arrived", "bought", "purchased", "unplayed", "vinyl play"). Slot values are excluded. The history-start suffix appears when the window predates coverage. Header copy: "last sync finished" with `lastSyncCompletedAt`, "newest scrobble" without it, and no stale banner for an inactive listener whose sync finished today.

**Consistency (integration-style, `tests/backend/routes/crates.test.ts` or `tests/integration/`), against `StatsService.getAlbumDetail(collectionArtist, collectionTitle).playCount`:**
- Equal: a single-copy album with an exact history hit; one with only fuzzy hits; one with a linked mapping targeting the collection name; two copies with the same title.
- Documented differences (section 5.3), asserted so a change in either path is noticed: two copies whose titles differ only in spelling (crate ≥ Album Detail), and a name with an exact hit plus a fuzzy sibling ("Album" and "Album (Deluxe)": the crate counts both).

**Migration/backup:** extend `tests/backend/migrationService.test.ts` (both crate files registered and optional) and `tests/backend/backupService.test.ts`: export includes crates and suggestion records; an old backup without either validates and imports; merge conflict picks the newer `updatedAt`; restoring crates (merge and replace) leaves `crate-suggestions.json` untouched and vice versa; a restore of suggestion records drops `batch` and keeps tombstones; services are reloaded after import.

**Frontend (`tests/frontend/`):**
- `pages/CratesPage.test.tsx`: list, open detail, empty states, stale/unknown badges.
- `components/crates/CrateRuleBuilder.test.tsx`: add/remove rules, operator switching, unknown checkbox, debounced preview.
- `components/crates/CrateAlbumRow.test.tsx`: reasons, the "Why?" expand, Include/Exclude/Reset calls.
- `components/whattoplay/CratesContainer.test.tsx`: pinned crates and "Pick one" with mocked `Math.random`.
- Update the WhatToPlayPage tests for the new tab.

---

**Suggestions: `tests/backend/services/crateSuggestionService.test.ts`** (pure functions with an injected clock; the service with a fake `fileStorage`)
- **Exact mapping:** for every recipe, every candidate's rules pass `validateCrateRules` and its sort is a `CrateSort`. Creating a crate from it and evaluating gives the same count and members as the suggestion.
- **Recipes:** each mines the expected candidates from a fixture collection and history. With no history index, `artist` and `short` candidates still appear and the listening recipes are skipped.
- **Thresholds:** a prefilter never yields a candidate below `SUGGESTION_MIN_SIZE`; an artist with 4 albums yields nothing; 5 → a candidate.
- **Fallback templates:** used only when fewer than 3 mined candidates survive; a template whose crate exists, which is tombstoned, which has fewer than 5 members or which overlaps ≥ 0.7 with a crate is not shown; with nothing eligible the response is empty with `reason: 'noCandidates'`.
- **Filters:** size bounds, ≥ 0.7 overlap with an existing crate, near-duplicates in the pool collapse to the higher-relevance candidate, `dismissed` and `added` tombstones, `sourceSuggestionKey` already used.
- **Scoring:** `sizeFit` at n = 5, 10, 30, 45, 60, and the worked examples of section 10.3 to two decimals. `signal` for `style-quiet` is below 1 when part of the style was scrobbled.
- **Rotation, 6 candidates, 7 simulated days, no action:** consecutive days share no candidate; the batches alternate between two sets; never-shown candidates come first. With 4 candidates: batches of 3, 1, 3. With 2 candidates: the same 2 every day (step 5). With 21: no repeat within 7 days.
- **Same day:** repeated `GET`s, a service restart (new instance on the same file) and `limit=1` return the same batch and leave `daysShown` and `lastShownDay` unchanged. `limit=1` returns the first card of the `limit=3` batch.
- **Reroll:** the new batch shares nothing with anything shown today; repeated rerolls shrink and then return `exhausted: true`; a reload after a reroll shows the rerolled batch.
- **Revalidation:** after a dismiss, an Add, a crate created by hand that overlaps ≥ 0.7, or a data change that shrinks a candidate below 5, the next read drops it and backfills from candidates not shown today; counts reflect the current table.
- **Lifecycle:** dismissed and added stay suppressed after 1,000 simulated days and after the crate is deleted; "Reset suggestion history" brings them back; active records unseen for over 365 days are pruned and tombstones are not.
- **Incomplete collection snapshot:** no suggestions, `reason: 'collectionLoading'`, no file write.
- **Concurrency:** two simultaneous first requests of a day build one batch and write once.
- Suggestion names, descriptions and reasons pass the reviewed-copy test (section 8.4).

**Benchmark: `tests/backend/services/crates.bench.test.ts`** (synthetic 10k-album table built in memory, no disk): `evaluateCrate` for a 6-rule crate, `mineCandidates` + `filterCandidates` + `selectBatch` with the 40-candidate cap. It asserts generous bounds (3× the section 7.3 targets scaled to 10k) so it catches order-of-magnitude regressions without flaking, and logs the measured times.

**Frontend: `CrateSuggestions.test.tsx`**: renders cards; Add calls `createCrate` with `rules`, `sort` and `sourceSuggestionKey` and opens the new crate; Not interested calls dismiss and renders the backfilled batch; Show different suggestions calls reroll and disables itself on `exhausted`; the `collectionLoading` message; Reset suggestion history asks for confirmation.

## 13. Context Tags (later input, not a prerequisite)

Smart Crates ships and works fully without context tags. When `.plan/context-tags-plan.md` lands, its section 6 defines `ContextTagService.getAlbumContextAffinity(tagId, {minSessions?, minShare?})`. It groups albums with `createAlbumCanonicalizer` / `albumGroupKey`, the **same album key** crates use (section 5.1), so the two features join on `albumKey` without new identity logic.

- Rule shape (Phase 4): `{ field: 'contextTag', tagId, minShare?, minSessions?, ifUnknown? }`. It stores the tag **ID**. A deleted tag shows "tag deleted" and matches nothing.
- Coverage caveat in the builder: this rule only sees in-app batch scrobble sessions (about 8% of scrobbles locally), which include Memory Scrobble sessions. It describes how the user *tagged sessions*, not how a record was played.
- Dependency direction: crates call the context-tag service. Context tags know nothing about crates. The rule appears in the builder only when the context-tags store exists.

---

## 14. Dependencies & Data-Quality Limitations

| Limitation | Effect on crates | Mitigation now | Possible later work |
|------------|------------------|----------------|---------------------|
| About 52% of releases lack complete track durations | Runtime rules leave many albums unknown | Three-valued logic, per-rule "include unknown", visible counts | Background job that fills durations from MusicBrainz recordings or Last.fm `album.getInfo` into a separate facts cache (not the Discogs cache files) |
| Genres/styles only in the release-details cache | New additions are unknown until fetched | Coverage notice + count | A "Fetch missing details" action reusing `DiscogsGenreEnricherService` as a job (`jobStatusService`) |
| `year` is the pressing year | Decade crates miss reissues of old albums | Label "Pressing year" | Cache master `year` (original) and add an `originalYear` rule |
| Ratings unused (0/1,189) | Rating rules empty for this user | Builder shows rated count; templates avoid ratings | — |
| `date_added` ≠ purchase date; bulk cataloguing | "Recently added" could include old records catalogued late | Copy "Added to Discogs" | A user-editable acquisition date (Discogs notes field) |
| Scrobbles from any source; history starts at the first Last.fm scrobble; albumless scrobbles count toward listening but not toward an album until resolved | "No recorded scrobbles" ≠ not listened | Honest copy, coverage header, stale-sync banner | `done/unresolved-listening-history-plan.md` |
| Name mismatches between Discogs and Last.fm | False "none recorded" | Fuzzy matching, `matchType` shown, link to Mappings | Suggested Album Merges already helps |
| No `instance_id`; same release owned twice collapses | Cannot address individual copies | Show "owned ×N" | Persist `instance_id` during collection sync (separate change) |
| Collection sync emits no change events; removals untracked | — | Fingerprinting + stale overrides | Hook `markAsOrphaned` and crates into a collection-sync event |
| Collection cache pages are written one at a time, not as a snapshot | A partial cache looks like "records left the collection" | Completeness check (section 7.1); no stale overrides or suggestions while incomplete | Write pages to a temp prefix and swap, or write a manifest last |
| No sync-completion time in the history index | Sync age can't be shown for inactive listeners | New `lastSyncCompletedAt` (section 8.1); older indexes say "newest scrobble" | — |
| A single collection page refetched after records were both added and removed can leave page totals that still add up (e.g. `[X,A]` + stale `[C,D]`), so the snapshot looks complete while a record is missing | That record's overrides can show as stale | Removing stale overrides is a user action that lists the records first; nothing is removed automatically | Write collection pages as one snapshot (temp prefix + swap, or a manifest written last). A stricter timestamp-order check was rejected: pages expire after 24 h and are refetched one at a time during normal browsing, so it would mark the cache incomplete most of the time |
| Album Detail looks plays up by one name | Crate and Album Detail counts can differ for multi-title groups | Narrowed guarantee + fixtures (section 5.3) | Album Detail adopts the group resolver (open decision 17.11) |

Hard dependencies: none beyond existing services. Soft: an initialised `artistNameResolver` (before it is ready, crates fall back to the identity resolver, the same as `createAlbumCanonicalizer`'s default).

---

## 15. Phased Implementation

### Phase 1: Engine & API (backend), **M-L, about 3-3.5 days**
1. Types in `src/shared/types.ts`. `CRATE_TEMPLATES` in `src/shared/crateTemplates.ts`.
2. `src/shared/utils/releaseRuntime.ts` and `createAlbumGroupNameResolver` in `albumMapping.ts`, with tests.
3. `crateAlbumTable.ts` (grouping, single merged-history lookup, lazy release facts with bounded concurrency, single flight, fingerprint, snapshot completeness).
4. `crateEvaluator.ts` (all MVP rules, witness-copy evaluation, unknown policy, precedence, structured results).
5. `src/shared/utils/crateCopy.ts` + `crateReasons.ts` (phrase templates, reviewed-copy snapshot test).
6. `crateService.ts` (store, CRUD, overrides by release-ID subtraction, memo, `invalidate`, `reload`). `lastSyncCompletedAt` in `ScrobbleHistorySyncService` + test. Register in `MigrationService`. Wire in `server.ts`, including `setArtistNameResolver` and optional `invalidate()` calls after history sync, mapping changes and `update-new`.
7. `routes/crates.ts` + validation + route tests.
8. Backup integration + tests.

### Phase 2: Crates page (frontend), **M, about 2-2.5 days**
1. `ROUTES.CRATES`, sidebar entry, `CratesPage` list + detail.
2. `CrateRuleBuilder` with live preview, templates picker.
3. `CrateAlbumList` / `CrateAlbumRow` with reasons and Include/Exclude/Reset. Excluded section, stale overrides, coverage notice.
4. API client methods + frontend tests.

### Phase 2b: Suggested crates, **M-L, about 3-4 days**
The first estimate (1.5-2 days) covered recipes and scoring but not the persistence, invalidation and lifecycle work the review showed is needed.
1. Pure functions: six recipes with prefilters and the candidate cap, filters, `sizeFit`/`signal` scoring, tiered least-recently-shown selection (about 1 day with tests).
2. `CrateSuggestionStore` in `collections/crate-suggestions.json`: migration registration, write queue, persisted daily batch, impression dedupe, revalidation and backfill, tombstones, pruning, reset, `reload()` (about 1 day).
3. Routes (`GET /suggestions`, `reroll`, `dismiss`, `DELETE /suggestions/history`), `sourceSuggestionKey` on create, the `added` tombstone, `collectionLoading` handling; backup entry for suggestion records with its tests (about 0.5-1 day).
4. `CrateSuggestions` / `CrateSuggestionCard` on the Crates page, with Add, Not interested, Preview, Show different suggestions, reset and empty/loading states; frontend tests (about 0.5-1 day).
5. Benchmark test and the section 7.3 suggestion budget.

### Phase 3: Integrations, **S-M, about 1-1.5 days**
1. What to Play `crates` tab + `CratesContainer` with "Pick one".
2. `AddToCrateMenu` on ReleaseDetailsPage and AlbumDetailPage. "In crates" chips via `/for-release/:releaseId`.
3. Collection "Save as crate" from active filters.

### Phase 4: Later (separate decisions)
OR groups; deferred rule types (section 4.4); seasonal and anniversary suggestions with their rule types (section 10.9); context-tag rule; "Export to saved collection" (Memory Scrobble); suggestions scoped to a crate (`SuggestionService` candidate filter); runtime/genre enrichment jobs; persisted release-facts cache if profiling calls for it; crates on the Home dashboard.

**Relative effort:** about 9-11.5 focused days for Phases 1-3, including suggested crates (Phase 2b), up from 8-9 before the second review (Phase 1 +0.5 day for witness copies, override subtraction, snapshot completeness and sync completion; Phase 2b +1.5-2 days for state and lifecycle). That is about twice Context Tags (4-6 days). Most of the risk is in Phase 1 (identity, attribution, missing data) and in Phase 2b's state handling; Phases 2-3 follow existing UI patterns. Phase 2b can ship after Phase 3 if crates are wanted sooner.

---

## 16. Acceptance Criteria

1. The three example crates can be created from templates and show sensible members on real data. "Jazz in 40 minutes" shows a "might match — runtime unknown" count. Copy-level rules are met by one witness copy: an album owned as a 50-minute vinyl and a 35-minute CD is not in "Vinyl, at most 40 minutes", and "Open release" opens the witness.
2. A crate's member list changes after a collection update, a history sync or a mapping change **without** a restart or a manual refresh button (fingerprint).
3. Two pressings of one album (same title, or joined by a mapping) appear as **one** row listing both copies. Their scrobbles are not double-counted. The count equals Album Detail's `playCount` for the cases section 5.3 guarantees, and the documented differing cases are covered by fixtures.
4. Muse-style albums that share a master but differ in title stay separate unless a mapping joins them.
5. Manual exclude hides an album even when rules match it and a manual include exists. Include shows an album the rules reject. "Reset to rules" restores rule-only behaviour. After a mapping split, changing or resetting one half leaves the other half's choice intact.
6. When a release leaves the collection, its overrides appear as stale with Remove, and the album is not shown. While the collection cache is incomplete (preload running, mixed pages), nothing is reported stale, nothing can be removed, and no suggestions are shown.
7. Every listed album has at least one "why" reason per rule, plus its membership source. All crate and suggestion copy comes from the reviewed phrase templates (section 8.4) and passes its tests. The header states the history window and when the last sync finished (or the newest scrobble, for an index without `lastSyncCompletedAt`). A stale-sync banner appears 3 days after the last **completed** sync, not 3 days after the newest scrobble.
8. Albums with missing runtime/genre/rating/year are excluded by default, counted visibly, and can be included per rule.
9. No Discogs or Last.fm network calls happen during crate evaluation.
10. Evaluation of all crates on the local collection (about 1.2k items) completes within the targets in section 7.3 when warm, and the album table makes a single merged-history lookup.
11. Crates are registered with `MigrationService`, included in backups, and old backups without crates still import.
12. Crates works with no history index (collection rules only) and with no context-tags store.
13. Lint, type-check and the full Jest suite pass. No inline styles or emoji are added.
14. **Suggestions:** the Crates page shows up to 3 suggested crates mined from the user's data by the six recipes of section 10.1, each with a reason and a live count. Every suggestion's rules and sort are valid crate rules and sorts, and **Add** creates, in one click, an editable crate whose count and members equal the suggestion's. Suggestions also work with no history index (collection-only recipes, then templates through the same filters), and the row is hidden rather than showing an empty or duplicate card.
15. **Variety (deterministic):** with no user action and at least 6 eligible candidates, consecutive days' batches share no candidate, and never-shown candidates are shown before any candidate repeats. Reloading or restarting the server on the same day shows the same batch and records no extra impressions; `limit=1` returns that batch's first card. **Show different suggestions** returns a batch sharing nothing with anything shown that day; when candidates run out the batch shrinks and then reports `exhausted`.
16. **Respecting choices:** a suggestion dismissed with "Not interested", or added as a crate, is never suggested again (also after the crate is deleted, after a restart and after a backup restore) until the user runs "Reset suggestion history". A suggestion with fewer than 5 or more than 60 albums, or overlapping an existing crate by ≥ 70%, is never shown. Suggestion state lives in `collections/crate-suggestions.json`; restoring crates never erases it and vice versa. `GET /crates/suggestions` meets the section 7.3 budget.

---

## 17. Open Decisions

1. **Placement.** The recommendation is a dedicated **Library > Crates** page (CollectionPage is already about 2,000 lines and has no tabs) plus a What to Play tab. Alternative: a tab inside Collection. Needs the user's call.
2. **"Love" proxy.** `topPercent 20` by track scrobbles favours albums with many tracks. Should Phase 4 add a normalised "estimated full listens" (scrobbles ÷ track count)?
3. **Dusty Corners.** Keep the tab as is, or replace it with a built-in, non-deletable "Dusty shelf" crate once crates ship?
4. **Unowned albums.** Should crates ever include history-only or wishlist albums (e.g. "albums I stream a lot but don't own")? MVP says no, owned only.
5. **Grouping by master.** Offer an opt-in "group pressings by Discogs master" setting, or rely on mappings and Suggested Album Merges? The plan relies on mappings.
6. **Stale-sync threshold.** 3 days after the last completed sync (`lastSyncCompletedAt`) is proposed. It could follow the sync settings instead.
7. **Copy alignment elsewhere.** `SuggestionCard`'s "Never Played" label conflicts with this plan's honesty rules. Fix it separately (outside this plan's scope) or leave it?
8. **Runtime enrichment source.** MusicBrainz versus Last.fm for missing durations, and whether the enriched values go in a separate facts file (recommended) or the Discogs cache files.
9. **Suggestion cadence and memory.** MVP uses one persisted batch per local day with deterministic least-recently-shown rotation, and permanent tombstones for dismissed and added suggestions (reset by the user). Is a daily cadence right, or should a batch last a week? Should dismissals expire on their own (the first draft's 180 days) once real use shows whether permanent feels too strict? Deferred to after MVP.
10. **Suggestions elsewhere.** Should a suggested crate also appear on the Home dashboard, or only on the Crates page and the What to Play empty state?
11. **Album Detail attribution.** Should Album Detail adopt `createAlbumGroupNameResolver`, so crate and Album Detail counts agree for every album (section 5.3)? It changes Album Detail totals for multi-title groups and for names with both exact and fuzzy history keys, so it needs its own plan and tests.
12. **Seasonal and anniversary suggestions.** Worth the two new rule types (section 10.9), or drop them?
