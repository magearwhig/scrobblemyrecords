# Smart Crates Plan

**Status:** Backlog -- not started. Written 2026-10-11 against the current code (branch `feat/album-version-merging`). Nothing in this plan exists yet. Section 1 lists what it builds on.

## Summary

A **Smart Crate** is a saved, named group of **albums you own**. Rules over collection data and listening history decide which albums are in it, and it updates itself when the collection, the scrobble history or the album mappings change. The user can also include or exclude specific records by hand. Every album in a crate shows **why it is there**.

Example crates:

- "Albums I love but haven't played this year"
- "Recent purchases awaiting a first listen"
- "Jazz records that fit into 40 minutes"

A crate answers "what should I pull off the shelf?" for a mood or situation the user defines once and reuses. Dusty Corners already does this for one fixed rule. Crates let the user write the rule.

**MVP in one paragraph:** A new **Library > Crates** page lists crates and opens a crate detail view. Crates have AND-combined rules from a fixed catalogue (format, pressing year, date added, genre/style, rating, runtime, discard pile, scrobble count, scrobbles in a period, last recorded scrobble, scrobbles since added), plus manual include/exclude. They are evaluated on read against the cached collection and history index, and each album gets a "why" line per rule. Three starter templates match the examples above. What to Play gets a **Crates** tab that shows pinned crates, with a "Pick one" button. The Crates page also **suggests crates** built from the user's own data (section 10). Each suggestion has an **Add** button that creates the crate in one click. Suggestions rotate, so the same ones don't come back every visit. OR groups, more rule types, context tags and crate-scoped album suggestions come later.

---

## 1. Current State (verified 2026-10-11)

### 1.1 What exists and will be reused

| Area | What exists | Reference |
|------|-------------|-----------|
| Collection cache | `getAllCachedCollectionItems(username, fileStorage)` reads `collections/{username}-page-N.json` until the first missing page. It does **not** dedupe. The stats routes use it through a local `loadCollection()`. | `src/backend/utils/collectionCache.ts`, `src/backend/routes/stats.ts` |
| Collection item | `CollectionItem { id, release, folder_id?, date_added, rating?, notes?, selected? }`. `release` is a `DiscogsRelease` built from `basic_information`: `id, master_id?, title, artist, year?, format[], label[], cover_image?`. Cache pages carry **no** `genres`, `styles` or `tracklist`. | `src/shared/types.ts`, `DiscogsService.getUserCollection` mapping (`src/backend/services/discogsService.ts`) |
| Release details cache | `collections/release-{id}.json` holds the full `DiscogsRelease` with `genres`, `styles` and `tracklist[{position,title,duration?}]`. `DiscogsService.getReleaseDetails()` reads it, and on a cache miss it **calls Discogs with a 1 s delay**. `DiscogsGenreEnricherService.enrichReleases()` fills it in bulk. | `src/backend/services/discogsService.ts`, `src/backend/services/discogsGenreEnricherService.ts` |
| History index | `ScrobbleHistoryIndex { lastSyncTimestamp, totalScrobbles, oldestScrobbleDate, albums: Record<"artist\|album", AlbumHistoryEntry> }`, where `AlbumHistoryEntry = { playCount, lastPlayed, plays[{timestamp, track?}] }`. `ScrobbleHistoryStorage.getIndex()` caches it for 1 min. `batchLookup(keys, {countsOnly?})` loads the index once and does exact then fuzzy matching. | `src/shared/types.ts`, `src/backend/services/scrobbleHistoryStorage.ts` |
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
| Dropped scrobbles | `ScrobbleHistorySyncService` skips any scrobble without `artist`, `album` or `timestamp` (`if (!artist \|\| !album \|\| !timestamp)`). | Some real plays never reach the index. See `unresolved-listening-history-plan.md`. |
| App sessions are not "vinyl plays" | `MemoryScrobblePage` also calls `api.scrobbleBatch`, so in-app `ScrobbleSession`s include from-memory listening (e.g. swimming headphones). Sessions store no release ID. | Neither Last.fm scrobbles nor in-app sessions prove that a physical record was played. |
| Album mappings | 157 mappings. 151 are collection-linked and 6 are unlinked (`collectionId: 0`). None of the 6 currently targets a collection name. | Plays should resolve through the same mapping logic as album detail (section 5.3). |

### 1.3 Gaps this feature must not paper over

1. **Collection sync invalidates nothing.** `POST /collection/:username/update-new` (`DiscogsService.updateCacheWithNewItems`) does not notify stats or any other cache. Crates must detect changes themselves (section 7).
2. **Removed items are not tracked.** No code records that a release left the collection (`markAsOrphaned` is unused). Crates must handle "no longer owned" when they read, not through an event.
3. **Collection-side lookups use only linked mappings.** `createCollectionNameResolver` skips unlinked merges, while `StatsService.collectMergedAlbumHistory` (album detail) includes them. Today no unlinked mapping targets a collection name, so the counts agree. Crates should still use the stricter union (section 5.3) so a crate's count always equals the album page's.

---

## 2. User Value & Workflows

### 2.1 Why

- A collection of over 1,000 records is hard to browse by mood. Collection filters cover format, year and date added; they ignore listening history and are forgotten when the page closes.
- Dusty Corners and Suggestions answer "what have I neglected?" in one fixed way. Users have their own definitions ("loved albums", "short jazz", "new arrivals") and want them saved and kept up to date.
- Crates make the app's data actionable at the shelf, not just analytical.

### 2.2 Workflows

1. **Start from a template.** Crates > New crate > pick "Recent arrivals awaiting a first listen". The builder shows the rules (added within 90 days AND no scrobbles recorded since added), a live count ("14 albums") and the first few matches. Save.
2. **Build from scratch.** Add rule "Genre is any of Jazz" and rule "Runtime at most 40 min". The live preview shows "9 albums match · 31 more Jazz albums have no Discogs track durations". The user can check "Include albums with unknown runtime" on the runtime rule, or leave them out.
3. **Use a crate.** What to Play > Crates shows pinned crates with counts. "Pick one" chooses a random member and shows its cover, the "why" line and buttons to open Release Details (to scrobble) or Album Detail.
4. **Curate.** In the crate view, "Exclude" removes an album the rules caught but the user doesn't want (e.g. a box set in the 40-minute crate whose runtime is per disc). Excluded albums go to a collapsed "Excluded by you" section with "Restore". From Release Details, "Add to crate…" includes a record that no rule catches.
5. **Turn filters into a crate.** On Collection, with filters active, "Save as crate" turns the current format/year/date-added filters into crate rules (Phase 3). Presets stay for quick filtering.
6. **Trust the result.** A crate's header states its data coverage: "Listening history: Last.fm scrobbles since Feb 2005, last synced 2 h ago". If listening rules depend on stale or missing history, a banner says so.

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
- Crates **do not replace** Dusty Corners. A "Dusty shelf" template reproduces it as an editable crate. Retiring the tab is an open decision (section 16).
- A later "Export to saved collection" (Phase 4) turns a crate's albums into a `SavedCollection` track list for Memory Scrobble. That is the one place the two features meet.

---

## 4. Rules

### 4.1 Combination

- **MVP: all rules are ANDed.** Alternatives inside one field use multi-value operators ("Genre is any of Jazz, Soul"). Negation uses operators ("none of", "= 0 scrobbles"). This covers all three example crates and the Dusty Corners equivalent without a nested rule builder.
- **OR groups are deferred** to Phase 4. The shape is reserved in the data model (`rules` stays a flat list now; a later `ruleGroups?: CrateRule[][]` with OR between groups and AND inside each). Build it only when there is a concrete need that multi-value operators cannot express.
- A crate with **zero rules** is a purely manual crate: only manual includes are members. This is allowed and useful ("Records to lend Sam").

### 4.2 Three-valued evaluation

Every rule returns `match`, `noMatch` or `unknown` for an album. `unknown` means the data needed is missing (no runtime, no genre, unrated, no history index). Each rule that can be unknown has `ifUnknown: 'exclude' | 'include'`, which defaults to `'exclude'`. An album is a rule-member only if no rule returns `noMatch` and every `unknown` rule has `ifUnknown: 'include'`. Albums kept out *only* by `unknown` results are counted per rule and listed in a "Might match — data missing" panel, so the gap is visible and not silent.

### 4.3 Copy-level vs album-level fields

An album can have several owned copies (pressings). Rules on **copy facts** (format, pressing year, date added, genre/style, rating, runtime) use **any-copy** semantics: the rule matches if *some* owned copy matches, and the explanation names that copy. For `noneOf` operators, "some copy is not a CD" matches an album owned on both vinyl and CD. This is intentional ("I own a non-CD copy") and documented in the rule help text. **Listening** rules work on the album as a whole, because plays are attributed to the album, not to a copy (section 5).

### 4.4 Rule catalogue (MVP)

| Field | Operators | Source | Unknown when | Notes |
|-------|-----------|--------|--------------|-------|
| `format` | `anyOf`, `noneOf` (values from the collection's distinct `release.format` names: Vinyl, CD, Cassette, Box Set, All Media, …) | Cache page `release.format` | never | Same values as the Collection filter dropdown. Discogs `basic_information` descriptions (LP, 7") are not cached. |
| `pressingYear` | `between {from?, to?}` | `release.year` | `year` missing or 0 | UI label: **"Pressing year"**. A 2019 reissue of a 1987 album has year 2019. The original year (master) is not cached (section 14). |
| `dateAdded` | `withinDays {days}`, `olderThanDays {days}`, `between {from?, to?}` (ISO dates) | `date_added` | never | UI label: **"Added to Discogs"**. Any-copy semantics. |
| `artist` | `anyOf` (names) | `release.artist`, compared with the artist resolver | never | Makes "my Wedding Present crate" possible. |
| `genre`, `style` | `anyOf`, `noneOf` | `collections/release-{id}.json` `genres` / `styles` | no details file, or `genres === undefined` | Read from the cache only. Evaluation **never** calls `getReleaseDetails()` (it would hit Discogs at 1 req/s). |
| `rating` | `atLeast {value 1-5}`, `isUnrated` | `CollectionItem.rating` | `rating` missing or 0, for `atLeast` | The builder shows how many owned albums are rated (e.g. "0 of 1,150 albums rated") so the user is not misled. |
| `runtime` | `atMost {minutes}`, `atLeast {minutes}`, `between` | Release-details tracklist (section 4.6) | durations incomplete *and* the known part cannot decide | Partial data can still decide a rule: if the known tracks of a partial tracklist already exceed `atMost`, the result is `noMatch`. |
| `discardPile` | `exclude`, `only` | `getDiscardPileCollectionIds()` | never | Templates add `exclude` by default. |
| `scrobbleCount` | `atLeast {n}`, `atMost {n}`, `topPercent {p}` | All-time merged scrobbles for the album | history index absent | `topPercent` ranks among **all owned albums**; ties are included and 0-scrobble albums are never "top". This is the "love" proxy while ratings are unused. |
| `scrobblesInPeriod` | `none`, `atLeast {n}`, `atMost {n}` over period `{kind:'calendarYear'} \| {kind:'lastDays', days} \| {kind:'since', date}` | Play timestamps | history index absent | `calendarYear` = since Jan 1 in server-local time, the same as `StatsService.getStartOfYear`. |
| `lastRecordedPlay` | `olderThanDays {days, includeNoRecordedPlays}`, `withinDays {days}` | Merged `lastPlayed` | history index absent | `includeNoRecordedPlays` defaults to `true`, which matches Dusty Corners. The explanation tells the two cases apart. |
| `playsSinceAdded` | `none`, `atLeast {n}` | Scrobbles after the **latest** copy's `date_added` | history index absent | The "awaiting a first listen" rule. It measures scrobbles since the record arrived, not ever. Plays from before purchase (e.g. streaming) do not disqualify, and the explanation mentions them. |

Deferred rule types (Phase 4+): album completeness (share of tracklist scrobbled), label, Discogs notes fields (media condition), original/master year, collection value (`collection-analytics/value-cache.json`), copies owned ≥ N, Last.fm artist tags (`cache/artist-tags.json`), embedding similarity to a seed album, and context tags (section 13). OR groups too.

### 4.5 Starter templates (`CRATE_TEMPLATES`, shared constant)

| Template | Rules |
|----------|-------|
| Loved, but not this year | `scrobbleCount topPercent 20` AND `scrobblesInPeriod calendarYear none` AND `discardPile exclude` |
| Recent arrivals awaiting a first listen | `dateAdded withinDays 90` AND `playsSinceAdded none` AND `discardPile exclude` |
| Jazz in 40 minutes | `genre anyOf [Jazz]` AND `runtime atMost 40 (ifUnknown: exclude)` AND `discardPile exclude` |
| Dusty shelf | `lastRecordedPlay olderThanDays 365 (includeNoRecordedPlays: true)` AND `discardPile exclude` |

A template's description says what it approximates. For example, "Loved = your top 20% of owned albums by scrobbles. Discogs ratings are used only if you add a rating rule."

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
| `firstAddedAt` / `latestAddedAt` | min / max over copies. `dateAdded` rules use any-copy semantics; `playsSinceAdded` uses `latestAddedAt` ("since the newest copy arrived"). |
| Format, pressing year, genre/style, rating, runtime | Per copy, any-copy semantics (section 4.3). The "why" text names the matching copy when there are several ("2023 pressing, 38:12"). |
| Scrobbles, last play, play timestamps | Per album (section 5.3). |

### 5.3 Play attribution

For each album group, build the name list:

- the union of `createCollectionNameResolver(mappings)(copy.artist, copy.title)` over all copies, **plus**
- the history names of every mapping (linked **or** unlinked) whose `createAlbumCanonicalizer(...)(historyArtist, historyAlbum).key` equals the group key.

Then make **one** `lookupMergedHistory(historyStorage, namesPerAlbum)` call for the whole collection. It already counts each matched history key once, so two copies with the same name do not double-count. Fuzzy matching comes from `batchLookup`. Full `plays` are needed for period rules (55k timestamps, small). Store per album: `scrobbleCount`, `lastPlayed`, a sorted `playTimestamps: number[]` (seconds), `matchType` and `matchedKeys`.

A small helper, `createAlbumGroupNameResolver(mappings, resolveArtist)` in `albumMapping.ts`, should build these name lists. It is the second bullet that closes gap 1.3.3. Adding it next to the existing resolvers keeps a single source of truth.

### 5.4 Manual overrides reference releases, not names

- Overrides store the **release IDs** of the copies in the album group at the moment of the action, plus an `{artist, title}` snapshot for display.
- On every evaluation, an override applies to every **current** album group that contains any of its release IDs.
- Renames (Discogs metadata changes the title) and mapping edits change the album key but not the release IDs, so overrides survive.
- **Merge** (a new mapping joins two groups that each had overrides): both apply, using the precedence in section 6.
- **Split** (a mapping is removed): the override applies to each resulting group that contains one of its IDs.
- Copies acquired *after* an include (a new pressing of an included album) join through the group. Nothing needs to change.
- Manual include can only target owned releases. Crates do not hold unowned albums in MVP (section 16).

### 5.5 Duplicate release IDs

Two physical copies of the same Discogs release cannot be told apart: `CollectionItem.id` is the release ID and `instance_id` is not stored. Crates therefore treat "owned ×2" as one release. Copy-level overrides (exclude one of two identical copies) are impossible and not needed for album crates. Storing `instance_id` is a separate collection-sync change, listed under section 14.

---

## 6. Manual Inclusions & Exclusions

**Precedence: manual exclude > manual include > rules.**

- **Exclude wins.** Exclusion is the user's strongest, most specific signal ("not this one, whatever the rules say"). Crates are used to choose what to play, so a wrongly *shown* album is worse than a wrongly *hidden* one, and hidden albums stay one click away in "Excluded by you".
- **Include beats rules.** Including an album means "always show this here", including when the rules say no (e.g. the album was played this year, but the user wants it in the crate anyway).
- **Deterministic under merges.** When a mapping merges two groups with conflicting overrides, "exclude wins" gives one answer with no timestamp logic. The alternative, "most recent action wins", depends on the order of past actions and is hard to explain in the UI. The peer reviewer agreed.
- **UI keeps it simple.** "Include" on an album clears any exclude for that group, and the reverse. "Reset to rules" deletes both. Each album row shows its membership source: `Matches rules`, `Included by you`, or `Included by you · also matches rules`.

---

## 7. Refresh, Caching & Performance

### 7.1 Decision: evaluate on read, memoise in memory

Crates are evaluated on every request, from an **album table** that is built once and memoised in `CrateService` until its inputs change. No crate membership is written to disk in MVP. The data set is small (about 1.2k items, 5k history albums, 55k scrobbles), and persisted membership would need invalidation hooks that do not exist (gap 1.3.1). Measure before adding a persisted cache.

The **album table fingerprint** combines:

| Input | Signal |
|-------|--------|
| Collection | Count and max `mtime` (via `FileStorage.getStats`) of `collections/{username}-page-*.json` (`listFiles('collections')`) |
| History | `mtime` of `history/scrobble-history-index.json` + `lastSyncTimestamp`. `lastSyncTimestamp` alone tracks only the newest scrobble, not merges or rewrites such as `/stats/merge-split-entries`. |
| Album mappings | `mtime` of `mappings/album-mappings.json` |
| Artist aliases | `artistNameResolver.getFingerprint()` |
| Discard pile | `mtime` of `collections/discard-pile.json` |
| Table version | `CRATE_TABLE_VERSION` constant (bump when derivation logic changes) |

Release details (`genres`, `styles`, runtime) load **lazily**, only when some crate uses a genre/style/runtime rule. They are read straight from `collections/release-{id}.json` with `fileStorage.readJSON` and memoised per release ID with a 10-minute TTL, because those files change rarely.

**Time-relative rules** (`withinDays`, `olderThanDays`, `calendarYear`, `lastDays`) are applied at evaluation time against `now`. They are never baked into the table, so no day-boundary invalidation is needed. Crate CRUD invalidates nothing in the table, because rules run on every read.

Fingerprinting costs about 30 `stat` calls per request. If that shows up in profiles, the fingerprint can be cached for 5 s.

### 7.2 Explicit invalidation hooks (cheap, optional)

`CrateService.invalidate()` is called by the same places that already invalidate history: `ScrobbleHistorySyncService` completion (next to `statsWarmer.invalidateStatsCache()`), mapping add/remove routes, and `POST /collection/:username/update-new`. This is belt-and-braces. Correctness does not depend on these hooks because the fingerprint covers them.

### 7.3 Performance targets

| Step | Target (1.2k items) | Scales to 10k items by |
|------|---------------------|------------------------|
| Album table, cold (one `batchLookup`, no release details) | < 300 ms | Linear. `batchLookup` is a single index pass. |
| + release details (about 1.2k small file reads) | < 1 s cold, ~0 warm | Up to 10k reads cold. If too slow, persist a compact `crates/release-facts.json` (genres, styles, runtime per release ID) keyed by file mtime. |
| Evaluate one crate against a warm table | < 20 ms | O(albums × rules). `topPercent` sorts once per table. |
| `GET /crates` (all crates with counts) | < 100 ms warm | One table, N filters |

Never call `lookupMergedHistory` or `batchLookup` per album or per crate; tests assert a single call per table build.

---

## 8. Missing Data, Honesty & "Why This Matches"

### 8.1 Listening history is "recorded scrobbles", not listening

- **Source-agnostic.** Scrobbles come from any Last.fm scrobbler (Spotify, phone, the app, Memory Scrobble). Crates **never** say or imply a physical record was played: no "spun", "on the turntable", "played on vinyl".
- **Absence is "none recorded", never "never listened".** Copy uses "No scrobbles recorded…" and "Last recorded scrobble…". The words "never played", "unplayed" and "haven't heard" are banned in crate copy, and a test enforces it (section 12).
- **Coverage window.** History covers `oldestScrobbleDate` (Feb 2005 here) to `lastSyncTimestamp`. Listening before Last.fm, and scrobbles dropped for missing album metadata (gap in section 1.2), are invisible. The crate header shows "Listening data: Last.fm scrobbles since {Mon YYYY} · synced {relative}".
- **Stale sync.** If `lastSyncTimestamp` (ms) is more than 3 days old and the crate has listening rules, show a banner: "Recent plays may be missing. Last sync {date}." with a link to the sync control.
- **No history index.** All listening rules return `unknown`, and the crate shows an empty state: "Sync your Last.fm history to use listening rules". Collection-only rules still work.
- **Window predates coverage.** If a period rule's window starts before `oldestScrobbleDate` (e.g. "none in the last 25 years"), the explanation appends "(history starts Feb 2005)".
- **Name-match transparency.** An album with `matchType: 'none'` shows "No scrobbles recorded under this title or its mapped names" with a link to Settings > Mappings. `fuzzy` matches show "matched as '{history name}'", taken from `matchedKeys`. This is not `unknown`: a missing name match is still "none recorded", explained.
- **Purchase vs Discogs date.** `dateAdded` copy says "Added to Discogs {date}", never "bought". The template description notes that bulk cataloguing days exist.
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

---

## 9. Album Leaves the Collection / Metadata Changes

| Event | Behaviour |
|-------|-----------|
| A rule-matched album's last copy leaves the collection | It simply stops matching on the next read (fingerprint change). Nothing is stored, nothing to clean up. |
| One of several copies leaves | The group shrinks. Copy-level rules re-evaluate on the remaining copies. Overrides still apply via the remaining release IDs. |
| An override's release IDs are all gone | The override is kept and returned as `staleOverrides` with its snapshot. Crate settings show "2 manual choices refer to records no longer in your collection" with Remove / Remove all. A stale include **never** puts an unowned album in the crate. If the same release ID returns (re-bought), the override applies again. |
| Item is in the discard pile | Still owned until removed from Discogs. `discardPile exclude` (on in every template) hides it. |
| Discogs renames a title or artist | Overrides follow release IDs. The display name updates from the cache. Rules re-evaluate. The play match may change (new name, new history lookup). The "why" line shows the current match. |
| Album mapping added/removed | The fingerprint changes and groups merge or split (section 5.4). Play counts change exactly as they do on Album Detail. |
| Release details refetched (new genres/durations) | Picked up after the release-details TTL (≤ 10 min) or on `invalidate()`. |
| A crate rule refers to a value that no longer exists (e.g. format "Cassette" after the only cassette is sold) | The rule stays valid and matches nothing. The builder shows the value as "(not in collection)". |

No write-on-read: evaluation never mutates `crates.json`. Snapshots refresh only when the user edits overrides.

---

## 10. Suggested Crates

The user should not have to invent crates. The Crates page shows a small row of **suggested crates**, each with a name, an explanation, a member count, a few covers, and **Add** / **Not interested** buttons. **Add** creates a normal crate with the suggested rules (it opens in the detail view and can be edited like any other). Suggestions change over time and never repeat the same set on every visit.

### 10.1 Where suggestions come from: recipes

A **recipe** is a parameterised crate generator that is mined from the user's data. Each recipe produces zero or more **candidates**: concrete rule sets plus a stable `candidateKey`. Candidates are evaluated with the same `crateEvaluator`, so a suggestion's count and members are exactly what the crate would contain once added.

| Recipe | Mined from | Example candidate | `candidateKey` |
|--------|-----------|-------------------|----------------|
| Neglected genre/style | Genres/styles with ≥ 8 owned albums | "Post-Punk you haven't played this year" (`style anyOf [Post-Punk]` AND `scrobblesInPeriod calendarYear none`) | `style-neglected:post-punk` |
| Deep shelf of one artist | Artists (resolved) with ≥ 4 owned albums | "All your Wedding Present" | `artist:<resolved name>` |
| Decade | Pressing-year decades with ≥ 10 albums | "Your 90s pressings, least played first" | `decade:1990` |
| Loved, gone quiet | `scrobbleCount topPercent` + no plays in N days | "Former favourites: nothing recorded for 2 years" | `loved-quiet:730` |
| New arrivals waiting | `dateAdded withinDays 90` + `playsSinceAdded none`, if ≥ 3 match | "Arrived recently, no scrobbles since" | `arrivals:90` |
| Seasonal | Albums whose recorded scrobbles cluster in the current month in past years (≥ 40% of their plays in this calendar month, ≥ 2 distinct years) | "Your October records" | `season:10` |
| Short sides | A top genre + `runtime atMost 40` with known runtime | "Jazz that fits in 40 minutes" | `short:jazz:40` |
| Anniversary | Albums added to Discogs in this month in earlier years | "Joined your collection this month in past years" | `added-month:10` |

Recipes only read cached data, like crate evaluation (no network calls). The starter templates (section 4.5) are the static fallback when recipes find nothing, for example with an empty history index.

### 10.2 Filtering: only useful candidates

A candidate is dropped when:
- it has fewer than 5 or more than 60 albums (too thin to be worth a crate, or too broad to mean anything)
- it is **too similar to an existing crate**: Jaccard overlap of member album keys ≥ 0.7, or the same `candidateKey` as a crate created from a suggestion
- it is too similar to a candidate already chosen in this batch (same overlap test)
- the user dismissed it ("Not interested"): suppressed for 180 days, then it may return once; a second dismissal suppresses it permanently
- it was already added (the crate exists, or was deleted less than 90 days ago)

### 10.3 Choosing what to show: relevance + novelty + diversity

Each surviving candidate gets a score:

- **Relevance (0–1):** how actionable it is right now. Size fit (peaks around 10–30 albums), the strength of the signal (for example the share of members with no scrobbles this year), and timeliness (seasonal and anniversary recipes score higher in their month).
- **Novelty penalty:** each time a candidate is shown without being acted on, its score is reduced, and the penalty fades over about 14 days. After it has been shown 3 times without action it rests for 30 days. This is what stops "the same thing every time".
- **Diversity:** selection is greedy. Each pick lowers the score of the remaining candidates from the same recipe, and of those that overlap heavily with what is already picked (maximal-marginal-relevance style). A batch never has two candidates from one recipe unless nothing else qualifies.
- **Controlled randomness:** a small random term, seeded per day, breaks ties. The same day gives the same suggestions (refreshing the page doesn't shuffle them), and a new day gives a new mix. A **Show different suggestions** button advances the seed and treats the current batch as shown, so the next batch avoids them.

Default batch size: 3 cards on the Crates page. The What to Play **Crates** tab shows 1 suggestion card in its empty state ("No pinned crates yet — try this one").

### 10.4 Explaining a suggestion

Every card says why it was suggested, in the same honest language as section 9: "You own 23 Jazz records. 15 have no recorded scrobbles this year." Counts come from the candidate's real evaluation. The card shows up to 4 covers and the total, and a "Preview" link opens the crate view read-only before adding.

### 10.5 State and storage

Suggestion history lives in the crates store (`collections/crates.json`), so it is backed up with the crates:

```typescript
interface CrateSuggestionState {
  candidateKey: string;
  timesShown: number;
  lastShownAt?: string;      // ISO
  restUntil?: string;        // ISO; set after 3 unanswered showings
  dismissedAt?: string;      // ISO
  dismissCount: number;
  addedCrateId?: string;     // set by Add
}
// CratesStore gains: suggestionState: CrateSuggestionState[]; suggestionSeed: number
// Crate gains: sourceSuggestionKey?: string
```

Entries are pruned when untouched for a year. Old stores without these fields load with empty defaults (no migration step needed beyond `schemaVersion: 1` defaults).

### 10.6 API and service

- `crateSuggestionService.ts` (pure recipe + scoring functions, plus a thin service that reads/writes `suggestionState`). Recipes and scoring are pure and take an injected clock and seed, so they are deterministic in tests.
- `GET /api/v1/crates/suggestions?limit=3` → `CrateSuggestion[]` (`candidateKey`, `name`, `description`, `reason`, `rules`, `count`, `sampleReleaseIds`). Marks the returned candidates as shown.
- `POST /api/v1/crates/suggestions/reroll` → advances the seed, returns a new batch.
- `POST /api/v1/crates/suggestions/:candidateKey/dismiss`.
- **Add** uses the existing `POST /api/v1/crates` with `{ ...rules, name, sourceSuggestionKey }`. The service records `addedCrateId`.

Showing is recorded when the batch is served, not when it renders, so a page reload in the same day doesn't count twice (the day-seeded batch is cached in memory per day).

### 10.7 Frontend

`CrateSuggestions.tsx` on the Crates list view, above the user's crates: up to 3 `CrateSuggestionCard`s (name, reason, count, covers, **Add** with lucide `Plus`, **Not interested** with `EyeOff`, **Preview**), and a **Show different suggestions** button (`Shuffle`). After **Add**, the new crate opens in the detail view with a toast ("Crate added — edit its rules any time"). The card disappears immediately and the row backfills from the remaining candidates.

### 10.8 What suggestions must not do

- Suggest a crate that would be empty or nearly identical to one the user has.
- Use the words "never played" or "unplayed" (the banned-phrase test covers suggestion copy too).
- Call Discogs or Last.fm.
- Re-suggest something the user dismissed twice.

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

export type CrateSort = 'artist' | 'lastPlayedAsc' | 'scrobblesDesc' | 'dateAddedDesc' | 'runtimeAsc';

export interface Crate {
  id: string;                                    // crypto.randomUUID()
  name: string;                                  // 1-80 chars, unique (case-insensitive)
  description?: string;
  rules: CrateRule[];                            // AND; max 20
  overrides: CrateOverride[];
  sort: CrateSort;
  pinnedToWhatToPlay: boolean;
  templateId?: string;
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
    historySyncedAt: number | null;              // ms (index.lastSyncTimestamp)
    runtimeKnownAlbums: number; genreKnownAlbums: number; ratedAlbums: number;
  };
}

export interface CrateSummary {
  id: string; name: string; description?: string; pinnedToWhatToPlay: boolean;
  count: number; unknownCount: number; staleOverrideCount: number; updatedAt: number;
}
```

### 11.2 Backend

**Storage:** `collections/crates.json` (next to `saved-collections.json` and `discard-pile.json`).

**`src/backend/services/crateAlbumTable.ts`** (pure plus thin I/O): `buildAlbumTable(inputs): AlbumTable`, which dedupes by release ID, groups (section 5), attributes plays (one `lookupMergedHistory`), and precomputes `topPercent` ranks. `loadReleaseFacts(releaseIds, fileStorage)` does the lazy genre/style/runtime load.

**`src/backend/services/crateEvaluator.ts`** (pure, no I/O): `evaluateRule(rule, album, ctx)`, `evaluateCrate(crate, table, now): CrateEvaluation`, `validateCrateRules(rules): string[]`. Every edge case is unit-testable with fixtures.

**`src/backend/services/crateService.ts`**, following the `SavedCollectionService` / `DiscardPileService` patterns:
- constructor `(fileStorage, historyStorage, mappingService, discardPileService, authService)`, plus `setArtistNameResolver(resolver)`, wired in `server.ts` next to `statsService.setArtistNameResolver` (the resolver is built asynchronously at startup).
- `loadStore()` / `saveStore()` with `writeJSONWithBackup('collections/crates.json', store)` and a `schemaVersion === 1` check.
- CRUD: `listCrates()`, `getCrate(id)`, `createCrate(input)`, `updateCrate(id, patch)`, `deleteCrate(id)`.
- Overrides: `setOverride(id, {releaseIds, action})`, which removes conflicting overrides that touch the same current group. `clearOverrides(id, releaseIds)` (Reset to rules), `removeStaleOverrides(id)`.
- Evaluation: `evaluate(id)`, `preview(rules, overrides?)`, `summaries()`, `cratesForRelease(releaseId)`, `invalidate()`.
- Gets the username from `authService.getUserSettings()`. No Discogs user → `401`, same as `/stats/dusty-corners`.

**Migration:** in `MigrationService.registerAllFiles()`:

```typescript
this.register('crates', {
  path: 'collections/crates.json',
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
| POST | `/preview` | Evaluate unsaved `{ rules, overrides? }` → `CrateEvaluation` (builder live count) |
| GET | `/:id` | `{ crate, evaluation }` |
| PUT | `/:id` | Update name/description/rules/sort/pinned |
| DELETE | `/:id` | Delete |
| POST | `/:id/overrides` | `{ releaseIds: number[], action: 'include' \| 'exclude' }` |
| DELETE | `/:id/overrides` | `{ releaseIds }`: reset these albums to rules |
| DELETE | `/:id/overrides/stale` | Remove stale overrides |
| GET | `/for-release/:releaseId` | Crates whose evaluation contains that release (Phase 3) |

Validation (with `validation.ts` helpers): `id` is a UUID; name length and uniqueness; at most 20 rules; known `field`/`op` combinations; numeric bounds (`days` 1-36500, `percent` 1-100, `minutes` 1-1000, `rating` 1-5); ISO dates; `releaseIds` are positive integers (at most 50 per call). Unknown fields → `400` with the list of errors from `validateCrateRules`.

### 11.3 Frontend

- **Route & nav:** `ROUTES.CRATES = 'crates'`. Sidebar "Library" group: a "Crates" item after "Browse Collection" (lucide `Boxes`, 18px, `aria-hidden`), enabled when Discogs is authenticated. Crate detail uses `navigate(ROUTES.CRATES, { id })`.
- **`src/renderer/pages/CratesPage.tsx` + `CratesPage.page.css`:** list view (cards: name, count, pinned toggle, stale/unknown badges) and detail view.
- **`src/renderer/components/crates/`:**
  - `CrateRuleBuilder.tsx` + `.css`: a row per rule (field select → operator select → value input). Multi-value chips use `Badge pill`. Each unknown-capable rule has an "Include albums with missing data" checkbox. A live preview (debounced `POST /crates/preview`) shows the count and the "might match — data missing" counts. Help text per rule includes the honesty notes (Pressing year, Added to Discogs, "scrobbles from any source").
  - `CrateAlbumList.tsx` / `CrateAlbumRow.tsx`: cover, `AlbumLink`, copies ("2 pressings", "owned ×2"), membership badge, two inline reasons, an expandable "Why?" (formatted by `formatCrateReason`), and Include/Exclude/Reset actions (icon buttons with `aria-label`).
  - `CrateCoverageNotice.tsx`: history window, sync staleness banner, runtime/genre/rating coverage.
  - `CrateExcludedSection.tsx`, `CrateStaleOverrides.tsx`.
  - `AddToCrateMenu.tsx` (Phase 3): used on ReleaseDetailsPage and AlbumDetailPage.
- **What to Play:** add a `'crates'` tab to `WhatToPlayPage` (`VALID_TABS`, `TAB_LABELS: 'Crates'`) rendering `components/whattoplay/CratesContainer.tsx`. It shows pinned crates (empty state: "Pin a crate to see it here" + link to Crates). Each card has "Pick one", a client-side random choice from `evaluation.albums`, shown with its reasons, "Open release" (writes `selectedRelease` and navigates to `release-details`, as the Collection page does) and "Pick another".
- **Collection:** Phase 3, a "Save as crate" button next to the preset save button when filters are active. Mapping: `format` → `format anyOf [x]`; `yearFrom/yearTo` → `pressingYear between`; `dateAdded` `week|month|3months|year` → `dateAdded withinDays 7|30|90|365`.
- **API client (`src/renderer/services/api.ts`):** `getCrates`, `getCrateTemplates`, `getCrate`, `createCrate`, `updateCrate`, `deleteCrate`, `previewCrate`, `setCrateOverride`, `clearCrateOverrides`, `removeStaleCrateOverrides`, `getCratesForRelease`. Pages use `useAsync`.
- **Styling:** design tokens only, co-located `.page.css` / component `.css`, no inline styles, no emoji, lucide icons (`Boxes`, `Shuffle`, `Info`, `EyeOff`, `RotateCcw`, `Plus`).

### 11.4 Backup

In `backupService.ts`:
- `FILE_PATHS.crates = 'collections/crates.json'`, a `loadCrates()` helper, `BackupData.crates?: Crate[]` (**optional**, so older backups validate and import unchanged), `BackupPreview.cratesCount?`, a compare entry (`c => c.id`), and import via `mergeAndSave(FILE_PATHS.crates, data.crates, c => c.id, 'crates', merge, (a, b) => a.updatedAt > b.updatedAt ? a : b)`, the same as `savedCollections`.
- Known limitation, inherited from `mergeAndSave`: merge mode never deletes, so a crate deleted after a backup comes back on merge-restore. That is acceptable and matches saved collections.
- Overrides reference release IDs. Restoring onto a different collection makes them stale, not broken (section 9).

---

## 12. Tests

**Backend unit: `tests/backend/services/crateEvaluator.test.ts`** (pure, fixture-driven)
- Every rule × operator: match / noMatch / unknown, including `ifUnknown: 'include'`.
- Runtime: complete; partial with the known part over `atMost` → `noMatch`; partial and undecidable → `unknown`; headings skipped; `H:MM:SS`.
- Any-copy semantics: vinyl + CD with `format noneOf [CD]` → match naming the vinyl copy.
- `topPercent`: ties included, zero-scrobble albums excluded, ranks computed over all owned albums and not the filtered set.
- `calendarYear` boundary with fake timers (Dec 31 23:59 vs Jan 1 00:01 local).
- `playsSinceAdded`: plays before `latestAddedAt` don't count; the evidence reports `playsBeforeAdded`.
- `lastRecordedPlay olderThanDays` with `includeNoRecordedPlays` true/false.
- Precedence: exclude > include > rules. A merge of two groups with include + exclude → excluded. A split carries the override to both halves.
- Stale overrides are reported and never add members. Re-acquired release IDs reapply.
- Zero-rule crate: only includes. No history index → listening rules unknown, collection rules still work.

**Backend unit: `tests/backend/services/crateAlbumTable.test.ts`**
- Duplicate release IDs collapse with `copyCount`.
- Same-title pressings group. Muse-style shared `master_id` with different titles does **not** group.
- Mapping-linked versions group, and their plays are counted once (two copies with the same name → no double count).
- An unlinked mapping into the collection name is included (gap 1.3.3).
- `lookupMergedHistory` / `batchLookup` called **once** per build (spy).
- Release details are read with `fileStorage.readJSON` only. `DiscogsService.getReleaseDetails` is never called.
- Fingerprint changes when a collection page / history index / album mappings / discard pile mtime changes, and does not change otherwise.

**Backend: `tests/backend/services/crateService.test.ts`:** CRUD, name uniqueness, rule validation errors, `writeJSONWithBackup` use, schema check, `setOverride` clearing the opposite action, `removeStaleOverrides`.

**Routes: `tests/backend/routes/crates.test.ts`:** each endpoint's happy path, `400` validation (bad field/op, out-of-range numbers, non-UUID id), `401` without a Discogs username, `404` unknown crate, `/preview` with no saved crate.

**Shared: `tests/backend/utils/crateReasons.test.ts` and `releaseRuntime.test.ts`:** reason copy per rule. A **banned-phrase test**: generated copy for every rule/outcome never contains "never played", "unplayed", "spun", "vinyl play" or "bought". The history-start suffix appears when the window predates coverage.

**Consistency (integration-style, `tests/backend/routes/crates.test.ts` or `tests/integration/`):** for a fixture album with a linked mapping, crate `scrobbleCount` equals `StatsService.getAlbumDetail(...).playCount`.

**Migration/backup:** extend `tests/backend/migrationService.test.ts` (crates file registered and optional) and `tests/backend/backupService.test.ts` (export includes crates; an old backup without `crates` validates and imports; merge conflict picks the newer `updatedAt`).

**Frontend (`tests/frontend/`):**
- `pages/CratesPage.test.tsx`: list, open detail, empty states, stale/unknown badges.
- `components/crates/CrateRuleBuilder.test.tsx`: add/remove rules, operator switching, unknown checkbox, debounced preview.
- `components/crates/CrateAlbumRow.test.tsx`: reasons, the "Why?" expand, Include/Exclude/Reset calls.
- `components/whattoplay/CratesContainer.test.tsx`: pinned crates and "Pick one" with mocked `Math.random`.
- Update the WhatToPlayPage tests for the new tab.

---

**Suggestions: `tests/backend/services/crateSuggestionService.test.ts`** (pure, injected clock and seed)
- Each recipe mines the expected candidates from a fixture collection and history, and none from an empty history (falls back to templates).
- Filters: size bounds, ≥ 0.7 overlap with an existing crate, overlap within a batch, dismissed (180 days, then permanent after a second dismissal), already added.
- Variety: simulate 7 days with no action. No candidate shows more than 3 times, consecutive days differ, the same day returns the same batch, and a reroll avoids the previous batch.
- Diversity: one candidate per recipe per batch when alternatives exist.
- The suggested count equals the crate count after creation with the same rules.
- Suggestion copy passes the banned-phrase test.

**Frontend: `CrateSuggestions.test.tsx`**: renders cards, Add calls `createCrate` with `sourceSuggestionKey` and opens the new crate, Not interested calls dismiss and backfills, Show different suggestions calls reroll.

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
| `date_added` ≠ purchase date; bulk cataloguing | "Recent arrivals" could include old records catalogued late | Copy "Added to Discogs" | A user-editable acquisition date (Discogs notes field) |
| Scrobbles from any source; history starts at the first Last.fm scrobble; missing-album scrobbles dropped | "No recorded scrobbles" ≠ not listened | Honest copy, coverage header, stale-sync banner | `unresolved-listening-history-plan.md` |
| Name mismatches between Discogs and Last.fm | False "none recorded" | Fuzzy matching, `matchType` shown, link to Mappings | Suggested Album Merges already helps |
| No `instance_id`; same release owned twice collapses | Cannot address individual copies | Show "owned ×N" | Persist `instance_id` during collection sync (separate change) |
| Collection sync emits no change events; removals untracked | — | Fingerprinting + stale overrides | Hook `markAsOrphaned` and crates into a collection-sync event |

Hard dependencies: none beyond existing services. Soft: an initialised `artistNameResolver` (before it is ready, crates fall back to the identity resolver, the same as `createAlbumCanonicalizer`'s default).

---

## 15. Phased Implementation

### Phase 1: Engine & API (backend), **M-L, about 2.5-3 days**
1. Types in `src/shared/types.ts`. `CRATE_TEMPLATES` in `src/shared/crateTemplates.ts`.
2. `src/shared/utils/releaseRuntime.ts` and `createAlbumGroupNameResolver` in `albumMapping.ts`, with tests.
3. `crateAlbumTable.ts` (grouping, single merged-history lookup, lazy release facts, fingerprint).
4. `crateEvaluator.ts` (all MVP rules, unknown policy, precedence, structured results).
5. `src/shared/utils/crateReasons.ts` (copy + banned-phrase test).
6. `crateService.ts` (store, CRUD, overrides, memo, `invalidate`). Register in `MigrationService`. Wire in `server.ts`, including `setArtistNameResolver` and optional `invalidate()` calls after history sync, mapping changes and `update-new`.
7. `routes/crates.ts` + validation + route tests.
8. Backup integration + tests.

### Phase 2: Crates page (frontend), **M, about 2-2.5 days**
1. `ROUTES.CRATES`, sidebar entry, `CratesPage` list + detail.
2. `CrateRuleBuilder` with live preview, templates picker.
3. `CrateAlbumList` / `CrateAlbumRow` with reasons and Include/Exclude/Reset. Excluded section, stale overrides, coverage notice.
4. API client methods + frontend tests.

### Phase 2b: Suggested crates, **M, about 1.5-2 days**
1. `crateSuggestionService.ts`: recipes, filters, scoring, day-seeded selection, suggestion state in the crates store.
2. Routes `GET /crates/suggestions`, `POST /crates/suggestions/reroll`, `POST /crates/suggestions/:candidateKey/dismiss`; `sourceSuggestionKey` on create.
3. `CrateSuggestions` / `CrateSuggestionCard` on the Crates page, with Add, Not interested, Preview and Show different suggestions.
4. Tests (section 12).

### Phase 3: Integrations, **S-M, about 1-1.5 days**
1. What to Play `crates` tab + `CratesContainer` with "Pick one".
2. `AddToCrateMenu` on ReleaseDetailsPage and AlbumDetailPage. "In crates" chips via `/for-release/:releaseId`.
3. Collection "Save as crate" from active filters.

### Phase 4: Later (separate decisions)
OR groups; deferred rule types (section 4.4); context-tag rule; "Export to saved collection" (Memory Scrobble); suggestions scoped to a crate (`SuggestionService` candidate filter); runtime/genre enrichment jobs; persisted release-facts cache if profiling calls for it; crates on the Home dashboard.

**Relative effort:** about 8-9 focused days for Phases 1-3, including suggested crates (Phase 2b). That is larger than Context Tags (4-6 days) and close to Discard Pile. Most of the risk is in Phase 1 (identity, attribution, missing data); Phases 2-3 follow existing UI patterns.

---

## 16. Acceptance Criteria

1. The three example crates can be created from templates and show sensible members on real data. "Jazz in 40 minutes" shows a "might match — runtime unknown" count.
2. A crate's member list changes after a collection update, a history sync or a mapping change **without** a restart or a manual refresh button (fingerprint).
3. Two pressings of one album (same title, or joined by a mapping) appear as **one** row listing both copies. Their scrobbles are not double-counted, and the count equals Album Detail's `playCount`.
4. Muse-style albums that share a master but differ in title stay separate unless a mapping joins them.
5. Manual exclude hides an album even when rules match it and a manual include exists. Include shows an album the rules reject. "Reset to rules" restores rule-only behaviour.
6. When a release leaves the collection, its overrides appear as stale with Remove, and the album is not shown.
7. Every listed album has at least one "why" reason per rule, plus its membership source. No crate copy says "never played", "unplayed" or similar. The header states the history window and sync age. A stale-sync banner appears after 3 days without a sync.
8. Albums with missing runtime/genre/rating/year are excluded by default, counted visibly, and can be included per rule.
9. No Discogs or Last.fm network calls happen during crate evaluation.
10. Evaluation of all crates on the local collection (about 1.2k items) completes within the targets in section 7.3 when warm, and the album table makes a single merged-history lookup.
11. Crates are registered with `MigrationService`, included in backups, and old backups without crates still import.
12. Crates works with no history index (collection rules only) and with no context-tags store.
13. Lint, type-check and the full Jest suite pass. No inline styles or emoji are added.
14. **Suggestions:** the Crates page shows up to 3 suggested crates mined from the user's data, each with a reason and a count that equals the crate's count after **Add**. **Add** creates an editable crate in one click.
15. **Variety:** across 7 consecutive simulated days with no user action, no candidate appears more than 3 times, and no two days show the identical set (when at least 6 candidates qualify). Reloading on the same day shows the same set. **Show different suggestions** returns a batch with no overlap with the previous one when enough candidates exist.
16. **Respecting choices:** a dismissed suggestion does not return for 180 days, and never after a second dismissal. A suggestion overlapping an existing crate by ≥ 70% is never shown.

---

## 17. Open Decisions

1. **Placement.** The recommendation is a dedicated **Library > Crates** page (CollectionPage is already about 2,000 lines and has no tabs) plus a What to Play tab. Alternative: a tab inside Collection. Needs the user's call.
2. **"Love" proxy.** `topPercent 20` by track scrobbles favours albums with many tracks. Should Phase 4 add a normalised "estimated full listens" (scrobbles ÷ track count)?
3. **Dusty Corners.** Keep the tab as is, or replace it with a built-in, non-deletable "Dusty shelf" crate once crates ship?
4. **Unowned albums.** Should crates ever include history-only or wishlist albums (e.g. "albums I stream a lot but don't own")? MVP says no, owned only.
5. **Grouping by master.** Offer an opt-in "group pressings by Discogs master" setting, or rely on mappings and Suggested Album Merges? The plan relies on mappings.
6. **Stale-sync threshold.** 3 days is proposed. It could follow the sync settings instead.
7. **Copy alignment elsewhere.** `SuggestionCard`'s "Never Played" label conflicts with this plan's honesty rules. Fix it separately (outside this plan's scope) or leave it?
8. **Runtime enrichment source.** MusicBrainz versus Last.fm for missing durations, and whether the enriched values go in a separate facts file (recommended) or the Discogs cache files.
9. **Suggestion cadence.** Day-seeded batches (recommended) or a new mix on every visit? The rest periods (14-day fade, 30-day rest, 180-day dismissal) are first guesses to tune with use.
10. **Suggestions elsewhere.** Should a suggested crate also appear on the Home dashboard, or only on the Crates page and the What to Play empty state?
