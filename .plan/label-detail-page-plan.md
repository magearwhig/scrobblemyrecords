# Label Detail Page Plan

From the first site review's "label deep dive" idea (N7 in
[site-review-2026-10-23.md](site-review-2026-10-23.md)), shaped by the owner on 2026-11-13: a
label stats page much like the artist page, with top played albums and tracks, plus **top
artists on the label**.

## Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 0: Measure coverage on a copy of real data | Done 2026-11-13 | 36,784 of 59,767 album plays (61.5%) are on owned albums and credited to a label; 436 labels after grouping spellings, 10 placeholder names; top: Rhymesayers 2,672, Matador 1,615, Merge 1,587 |
| Phase 1: Label attribution + `GET /api/v1/stats/label/:labelName` | Done 2026-11-13 | `StatsService.getLabelDetail`; `shared/utils/labels.ts` (`labelKey` moved from Collection Analytics, `isPlaceholderLabel`); route takes the name and keys it server-side; computed per request, no cache (fast enough on real data) |
| Phase 2: LabelDetailPage + LabelLink | Done 2026-11-13 | `#label`; links on Release Details, AlbumCard, Collection Analytics label list; not yet on the Labels (monitoring) page |
| Phase 3: Albums you don't own (MusicBrainz, Discogs lookups) | Done 2026-11-13 | `AlbumLabelService` (cache `data/cache/album-labels.json`, owner overrides `data/mappings/album-label-overrides.json`, backed up), `MusicBrainzService.findAlbumLabels`, `WishlistService.findAlbumLabels`, `/api/v1/album-labels`, label page switch + source badges, album page Label line. 1,719 unowned albums with 3+ plays; scan runs 20 a minute from 2 minutes after startup. Wantlist source dropped (the wantlist cache has no labels). Original-label mode for owned albums not built |
| Top Labels on the Stats page | Done 2026-11-13 | `StatsService.getTopLabels` (same attribution as the label page; checked on real data: Sub Pop 2,052 all-time on both), `GET /api/v1/stats/top/labels/:period`, `TopList` type `labels`. Top lists row now two per row on a laptop (min 460px) so names fit beside Owned badges. `labelKey`/`labelDisplayName` drop Discogs' " (n)" |

---

## 1. The core problem: plays have no label

Plays come from Last.fm (`artist | album | track`). Nothing in the history says which label
an album is on. Labels exist only on Discogs collection items (`CollectionItem.release.label`,
names only; the release cache adds nothing more today). So a label can only be credited
with plays of albums the owner owns.

**Decision (v1): credit plays to the label(s) of the copy you own.** Agreed with the peer
reviewer on 2026-11-13:
- The page says so: "Listening on albums you own on this label".
- A play before the record was bought still counts. It measures listening to the album,
  not to that pressing.
- **Reissues count to the label on your copy.** A Run Out Groove reissue of a Warner album
  counts to Run Out Groove, and to Warner only if Warner is also listed on that copy. An
  "original label" view is a later mode (Phase 3), not mixed into v1.
- Albums you don't own are added in Phase 3 by looking up their label (section 5).

---

## 2. Phase 0: measure coverage (before building)

On a copy of real data, using the real resolvers (`ArtistNameResolver`, album mappings,
`buildFuzzyCollectionMap`), not approximations:
- Share of all plays on albums matched to a collection copy, and so creditable to a label.
- Share of matched copies with no label, or only "Not On Label" / "Self-released".
- Number of distinct labels after grouping, and the top 20 by credited plays.
- Albums whose matches point at **different copies with different labels**.

Phase 0 also sizes Phase 3: how many plays are on albums you don't own.

---

## 3. Phase 1: attribution and API

### 3.1 Album → copy → labels
- Prefer an explicit album mapping with `collectionId > 0`. `collectionId: 0` only merges
  history names and says nothing about ownership.
- Otherwise use the fuzzy collection match. **Fix first:** `buildFuzzyCollectionMap`
  (`statsService.ts`) keeps one `CollectionItem` per key, so a second copy silently
  replaces the first. Keep every matching copy as a candidate.
- Two copies with the same labels: credit once. Two copies with **different** labels:
  credit both, and keep the album in both labels' lists. The owner owns both, and the
  label totals are non-additive anyway (section 3.3).
- History names merged into one album (album mappings) count once per play, not once per
  source name.

### 3.2 Label identity
- Move `labelKey` out of `collectionAnalyticsService.ts` into `src/shared/utils/labels.ts`
  so Collection Analytics and the label page group spellings the same way ("Sub Pop" and
  "Sub Pop Records").
- Its suffix stripping is a heuristic and can merge two different labels. Keep the
  original spellings with each key and show them on the page ("Also listed as: Sub Pop
  Records"). Add an override list later if a wrong merge turns up; not in v1.
- The URL and links use the **stable key**, not whichever spelling is most common. Display
  uses the most common spelling.
- Skip placeholder labels: "Not On Label" (Discogs writes variants like "Not On Label
  (Why? Self-released)"), "none", empty. They get no page. The owner can still see those
  albums under the artist.

### 3.3 Counting rules
- A play of an album on two labels counts once on each label's page. Label totals don't
  add up to total plays, and the page doesn't claim they do.
- Totals, trend, top albums, top tracks and top artists all come from **the same set of
  credited plays**, so the numbers agree with each other.
- Albumless plays, unmatched plays and plays of excluded artists aren't credited. The page
  shows coverage: "Based on 4,210 plays of 38 albums you own on this label".

### 3.4 Artists on the label
- Group albums by canonical **artist + album**, not album alone. ArtistDetail can group by
  album because the artist is fixed; a label page can't.
- Credit artists through `ArtistNameResolver`, so aliases count as one artist and an
  owned collaboration credits each artist in an explicit compound mapping. A play counts
  once in the label total even when it credits several artists.
- **Various Artists compilations:** credit the scrobbled track artists only when the play
  is matched to the compilation by an explicit album mapping (or the history album name
  matches with the album artist "Various"). Never credit "Various" as an artist, and never
  match by title alone.

### 3.5 Response (`LabelDetailResponse` in `src/shared/types.ts`)
Same shape as `ArtistDetailResponse` where it can be:
```typescript
export interface LabelDetailResponse {
  labelKey: string;
  label: string;                 // display spelling
  otherSpellings: string[];
  totalPlayCount: number;
  firstPlayed: number | null;
  lastPlayed: number | null;
  periodCounts: { thisWeek: number; thisMonth: number; thisYear: number; allTime: number };
  playTrend: Array<{ period: string; count: number }>;
  topArtists: Array<{ artist: string; playCount: number; albumCount: number; lastPlayed: number }>;
  topAlbums: Array<{
    artist: string; album: string; playCount: number; lastPlayed: number;
    coverUrl?: string; collectionReleaseIds: number[]; catalogNumbers?: string[];
  }>;
  topTracks: Array<{ artist: string; track: string; album: string; playCount: number; lastPlayed: number }>;
  ownedCopyCount: number;        // copies on this label in the collection
  unplayedCopies: Array<{ artist: string; album: string; releaseId: number }>;
}
```
- Route: `GET /api/v1/stats/label/:labelKey?trendPeriod=month|week`, next to
  `/stats/artist/:artistName`. 404 for an unknown or placeholder key.
- Cache the album → labels attribution like other stats caches, and invalidate it when the
  collection, album mappings or the artist resolver fingerprint change.

---

## 4. Phase 2: page and links

- `LabelDetailPage.tsx` + `LabelDetailPage.page.css`, route `#label`. Follows
  ArtistDetailPage's layout: header (label name, other spellings, owned copy count,
  coverage line), period stats, play trend, then **Top artists**, **Top albums** (covers,
  "owned" copies) and **Top tracks**, plus "On the shelf but never played".
- Links use `ArtistLink`, `AlbumLink` and `TrackLink`.
- **`LabelLink`**: new, following the detail-page link convention in `.plan/README.md`
  (store `selectedLabel`, `navigate(ROUTES.LABEL_DETAIL, { from })`). Use it wherever a
  label name shows: Release Details' label line, `AlbumCard` metadata, Collection
  Analytics' label chart and list, and the Labels (monitoring) page.
- A link to Discogs' own label page and, when the label is monitored, to its Labels page
  entry.
- Phone layout from the start (the owner uses the app on an iPhone): stats as a 2-column
  grid, lists single-column, inputs at 16px.
- Lucide icons, design tokens, no inline styles, no emoji.

---

## 5. Phase 3: albums you don't own

Counts measured 2026-11-13: the history has 5,368 albums, 2,508 of them with 3 or more
plays. The history index doesn't keep Last.fm's album MBID (the raw Last.fm response has
it, `types.ts` `album.mbid`, but it's dropped), so a label has to be looked up per album.

**As built (2026-11-13):** the wantlist source was dropped, because the cached Discogs wantlist has no labels and fetching them costs the same Discogs requests as a search. Lookups are keyed by the album grouping key (`createAlbumCanonicalizer(...).key`), so artist aliases and album mappings share one lookup and the album page finds it from display names. The MusicBrainz search returns label info directly, so a title search is one request; a Last.fm release MBID costs two (release, then its release group's releases). Unsure matches are confirmed or rejected from the album page's Label line. Not built: the "count reissues under their original label" switch for owned albums.

**First live run (2026-11-13, copy of real data):** of the first 40 albums, 36 found (34 MusicBrainz, 2 Discogs), 1 unsure (Danger Mouse "Cheat Codes", credited to Danger Mouse & Black Thought), 3 not found. MusicBrainz answered 503 a few times at 1 request a second; the backoff retried each one. Merge Records gained 86 plays from an unowned album (The Rosebuds). Review fixes: whole release group read after a search (first pressing outside the 25 search hits), edition notes only stripped when they name an edition ("(Live)" stays), non-Latin titles kept, year-only (record-club) releases sort after fully dated ones, override loads shared so concurrent saves aren't lost, album page keys by the names it was opened with.

**Sources, best first (as planned):**
1. **Your own copy** (v1, section 1).
2. **Your Discogs wantlist**: wanted releases carry their label.
3. **MusicBrainz**: the app already has a rate-limited client (`musicbrainzService`) and
   artist MBIDs (`data/releases/artist-mbid-map.json`). Browse the artist's release
   groups once per artist (`getArtistReleases`), match the album title, then fetch that
   release group's releases with label info and take the **earliest official release's
   label**. About one request per artist plus one per album, at 1 per second.
4. **Discogs** as a fallback: search artist + album, take the master's main release
   label. Authenticated limit is 60 per minute.
5. Nothing found: the album stays unattributed and counts toward the coverage gap.

**Cost:** the 2,508 albums with 3 or more plays take roughly an hour once, in the
background, newest-played first, then only new albums as they're played. Results are cached
in `data/cache/album-labels.json` with source and date, and re-checked rarely (a year).
Owner corrections ("this album is on Merge") are stored as overrides and always win.

**On the page:**
- Owned and looked-up plays are kept apart. A switch "Include albums you don't own"
  (default on once lookups exist) adds them. Each album shows where its label came from
  (your copy, wantlist, MusicBrainz, Discogs).
- Looked-up albums credit the **original label**. Owned albums keep the label on your copy.
  The owner can switch owned albums to original label too ("Count reissues under their
  original label"), using the same lookup.
- Top artists and tracks then include artists you've only streamed, which is most of what
  makes a label page interesting.

**Matching risks:** title matching across MusicBrainz and Last.fm names uses the same
normalisation as album matching (`albumGroupKey`), and artists without an MBID are looked
up by name first (existing `searchArtist`). A match below a confidence threshold is stored
as "unsure" and not credited until the owner confirms it from the album page.

---

## 6. Tests

- Attribution: explicit `collectionId` beats the fuzzy match; `collectionId: 0` doesn't
  count as owning; two copies with the same and with different labels; multi-label
  release counted once per label; merged history names counted once per play.
- `labelKey` moved without changing Collection Analytics' output.
- Placeholder labels have no page.
- Artist credit: aliases grouped, a compound collaboration credits each artist and counts
  the play once; Various Artists never credited.
- Totals, trend and the three lists agree; coverage line correct.
- Route: 404 for unknown and placeholder keys, `trendPeriod` handling.
- Page: renders lists, links, empty state, phone width without overflow.
