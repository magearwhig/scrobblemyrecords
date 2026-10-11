# Plan: Pocket List Export (offline wishlist / collection PDF)

## Status

Backlog -- not started. Depends on the shared export rows in
[data-export-plan.md](data-export-plan.md) (`exportDataService.ts`). No code,
data, or tests have changed for this plan.

## Overview

Generate a compact, searchable PDF of the wishlist, the collection, or both,
sorted alphabetically by artist and then album. The user downloads it on the
laptop, moves it to their phone (AirDrop, email to self, iCloud/Google Drive,
USB, whatever they like), and reads it offline in a record shop instead of
opening Discogs over and over.

This plan covers **readable collation, grouping, and the PDF layout**. It
**does not** define the data rows. Those belong to
[data-export-plan.md](data-export-plan.md):

| | Pocket List (this plan) | Data Export (data-export-plan.md) |
|---|---|---|
| Purpose | Readable offline reference for shopping | Complete, machine-readable data you can take elsewhere |
| Output | One PDF, phone-sized, A–Z sections | CSV / JSON |
| Fidelity | Picks and condenses fields for reading; groups versions | Every row, every field, nothing grouped away |
| Owns | Sort keys, section letters, de-duplication for display, match wording, layout, fonts, renderer | `exportDataService.ts`, `ExportCollectionRow`, `ExportWishlistRow`, field normalization, match status calculation |

If a field name below differs from what data-export-plan.md finally uses,
data-export-plan.md wins and this plan adapts.

---

## User Value & Workflows

1. **"Do I already have this?"** Standing at a bin, the user opens the PDF,
   taps the letter in the A–Z index (or uses the viewer's search), and sees
   whether the album is owned, wanted, or both.
2. **"What was I looking for?"** Before or during a shop visit, they skim the
   wanted list for the current bin's letter. Wanted albums that already have a
   version in the collection are marked, so they skip a duplicate or knowingly
   go for the better pressing.
3. **Refresh before a trip.** Optionally sync the wishlist or collection in
   the app first, then export again. The PDF states when the data was last
   synced so an old file is easy to spot.

No network, server, login, or app is needed at read time. Any PDF viewer will
do: iOS Files/Quick Look, Apple Books, Google Drive, or Files by Google.

---

## Current State (verified)

### Data sources (read-only, cached; export makes no Discogs calls)

| Source | Where | Loaded by |
|---|---|---|
| Discogs collection | `data/collections/{username}-page-N.json` | `getAllCachedCollectionItems()` in `src/backend/utils/collectionCache.ts` (already used by `CollectionAnalyticsService.loadCollection()`) |
| Discogs wants | `data/wishlist/wishlist-items.json` (`WishlistStore`) | `WishlistService.getWishlistItems()` |
| Local (monitored) wants | `data/wishlist/local-want-list.json` (`LocalWantStore`) | `WishlistService.getLocalWantList()` |
| Album mappings | `data/mappings/album-mappings.json` | `MappingService.getAllAlbumMappings()` |

### Existing matching building blocks

- **Master ID.** `DiscogsRelease.master_id` (collection) and
  `WishlistItem.masterId` (wants). `LabelMonitoringService.loadUserReferenceSets()`
  and `WishlistService.getTrackedMasterIds()` already key on these.
- **Name keys** in `src/shared/utils/albumMapping.ts`: `stripDiscogsSuffix()`,
  `albumGroupKey()` (case, accent, punctuation, and "(2)" insensitive, and
  **Unicode-safe** via `\p{L}\p{N}`), `albumNameKey()`, `isCollectionLinked()`.
- **Edition-insensitive album key**: `editionlessAlbumKey()` exported from
  `src/backend/services/albumMergeSuggestions.ts`. It drops "(Deluxe Edition)",
  "[Remastered]" and similar tags but keeps "(Live)" and "(Demos)".
- **`ScrobbleHistoryStorage.fuzzyNormalizeKey()`.** Do **not** use it here. It
  ends with `.replace(/[^a-z0-9]/g, '')`, so a non-Latin title (Devanagari,
  CJK, and so on) collapses to an empty string and would falsely match other
  such titles by the same artist. `normalizeForMatching()` /
  `createArtistAlbumKey()` in `src/shared/utils/trackNormalization.ts` and
  `useCollectionLookup` (frontend) are fine for Latin text, but none of them
  folds accents the way `albumGroupKey()` does.
- **Wishlist page today** doesn't show "in collection" at all. It merges local
  wants into the Discogs list only by `artist.toLowerCase().trim()|title…`
  (`WishlistPage` → `normalizeForComparison`). The owned-version flag is
  therefore new behavior built from the pieces above, not a copy of an existing
  UI flag.

### Download plumbing

- Binary download over the API: `BackupRoutes` `POST /api/v1/backup/export`
  sets `Content-Disposition: attachment`. `ApiService.exportBackup()` uses
  `responseType: 'blob'`, and `SettingsBackupSection` saves it with
  `URL.createObjectURL`.
- When the API token is enabled (`requireApiToken` in `src/server.ts`), a plain
  `<a href>` link would not send the `Authorization` header. So the download
  has to go through `ApiService` (blob), like backup export does.

### Dependencies

- No PDF library is in `package.json`.
- `playwright@^1.57` is a **devDependency** (`playwright-core` 1.57.0 is
  installed). Its `Page.pdf()` typings include `outline?: boolean` and
  `tagged?: boolean`. Chromium builds are present in the local Playwright
  cache.

---

## Data Quality (aggregate inspection of local data, 2026-10-11)

| Field | Collection (1,189 items) | Discogs wants (206) | Local wants (13) |
|---|---|---|---|
| artist / title | 100% | 100% | 100% |
| master ID | 1,162 (97.7%) | 201 (97.6%) | 11. **Taken from the first Discogs search hit (`searchForRelease`), not confirmed by the user** |
| year | 1,168 (98%) | 204 (99%) | none (any version) |
| format | 100%, but only top-level names (`Vinyl` 1,243 entries, `All Media` 40, `CD` 18, `DVD` 3, cassette/flexi/box 1 each). **No LP/7"/2xLP descriptions** | not on the item. 192/206 (93%) can be found by matching `releaseId` in `vinylVersions`, which gives descriptions such as `["LP","Album","Reissue"]` | none |
| label | 100% | via `vinylVersions` (same 93%) | none |
| catalog number | **0%**. `DiscogsService.getUserCollection()` maps `basic_information.catalog_number`, which the API doesn't send (catno is under `labels[].catno`). The `checkForNewItems()` mapping drops it entirely | not stored | none |
| notes | 272 items, but only custom fields 1 and 2 (default Discogs Media/Sleeve Condition). **No free text** | 0 (`notes` is empty everywhere) | none |
| want rating | – | 0 for all items | – |

Name characteristics that matter for sorting:

- 205 collection artists start with "The ".
- 7 start with "A " or "An ".
- 75 have a Discogs "(N)" suffix (11 among wants).
- 47 are comma-joined multi-artist credits.
- 6 start with punctuation ("$", ".", "+").
- 1 starts with a digit.
- 2 are "Various".
- 24 distinct non-ASCII characters appear (Latin accents, "…", "–", "★", "°"), and one title is Devanagari.
- "Artist + title" length: median 29 characters, p95 55, max 128.

Duplicates:

- 26 collection masters have more than one copy, and 10 release IDs appear twice (two instances of the same pressing).
- 18 wanted masters have more than one wanted release.
- 1 local want shares a master with a Discogs want, and 0 overlap by name.

Match counts against the collection:

- 3 wants share a master with a collection item.
- `albumGroupKey` finds 4 name matches, 1 of them with a different master.
- 0 wants are the exact same release.

What this means for the plan:

- The core fields are reliably populated: artist, album, and year. Format needs care.
- The PDF must look complete without catalog numbers or notes, so both are
  optional extras.
- Fixing the catno mapping is a data-export-plan / `discogsService` concern,
  noted here as a dependency. It does **not** block this plan.

Data freshness: the wishlist store `lastUpdated` is 2026-10-04, and the
collection cache page timestamps were today. The export prints both.

---

## Scope

### MVP

1. **List choice.** Wishlist, collection, or both in one document.
2. **Wishlist sources.** Discogs wants and local (monitored) wants, both on by default.
3. **Sorting.** A–Z by artist, then album, with clear letter sections (rules below).
4. **Entry content.** Artist and album are prominent. Optional extras:
   - Format
   - Pressing details (year and label; country once the rows carry it)
   - Brief notes (wishlist free-text only)
5. **Owned vs wanted.** Text markers, not color alone, so they survive grayscale, search, and screen readers.
6. **Owned-version flag on wanted albums**, with honest confidence (see Matching).
7. **Cover block.** Title, list types, export timestamp, item counts, data-freshness dates, and a legend.
8. **Phone layout.**
   - Narrow page, single column, legible type.
   - No horizontal scrolling at fit-to-width.
   - Real (selectable, searchable) text, never rasterized.
9. **Navigation.**
   - A tappable A–Z index on page 1.
   - A "back to index" link at each letter heading.
   - A PDF outline with one bookmark per letter.
10. **Self-contained.** Fonts are embedded. No external assets, links, scripts, or server needed to read it.

### Non-goals (MVP)

- Barcode scanning, live sync, a hosted or mobile app, or serving the list to the phone over the LAN.
- Comprehensive copy tracking: condition per copy, storage location, or a per-copy inventory. Multiple copies are only counted.
- Filing solo artists by surname ("Dylan, Bob"). Discogs gives "Bob Dylan", and detecting personal names reliably isn't possible. See Later.
- Prices or marketplace data. These go stale quickly and aren't needed offline.
- Cover images. They would bloat the file and hurt scanning speed.
- Editing data or triggering syncs from the export flow.

### Later enhancements

1. **Interactive self-contained HTML export.** One `.html` file with inline
   CSS, JS, and fonts, plus live filter, search, and owned/wanted toggles. The
   HTML template from this plan becomes its base. **Validate first:**
   - Does iOS Files → Quick Look render local HTML with JS (it often shows
     static text only)?
   - Can Safari open it from Files, and does "Open in" work?
   - Do Android Chrome `content://` URIs from Files/Drive load inline JS?
   - Does each of these behave offline?
   Ship it only if at least one zero-install path works on both platforms.
2. **Surname filing override.** A small user list such as
   `Bob Dylan → Dylan, Bob`, applied to sort keys only.
3. **More article rules.** A configurable article list ("A", "An", "Los",
   "Les", "Die"), plus per-artist "file under" overrides.
4. **More filters.** Vinyl-only for the collection, or per-folder and per-genre lists.
5. **Paper sizes.** Letter or A4 two-column printable output for paper lists.
6. **More detail.** Catalog numbers and condition notes, once data-export-plan
   normalizes them (catno mapping fix, named collection note fields).

---

## Matching: "you already own a version"

Owned-version status is **computed in `exportDataService`** and arrives as
`ExportWishlistRow.ownedMatch: OwnedMatchStatus`, along with
`ownedCollectionRowIds` (see data-export-plan.md, "Owned-match rules"). That
plan's rules are:

1. same `releaseId`
2. same `masterId > 0`
3. equal `albumGroupKey(stripDiscogsSuffixes(artist), title)`
4. otherwise `not-owned`; `unknown` when the collection cache is empty

They are built on the existing helpers listed above, and they use the
Unicode-safe `albumGroupKey()`, not `fuzzyNormalizeKey()`. This plan owns
only the **wording and the confidence shown**:

| `ownedMatch` | Source | PDF wording | Shown confidence |
|---|---|---|---|
| `owned-same-release` | any | "OWNED: this pressing" | Certain |
| `owned-other-version` | `discogs-want` | "OWNED: another version" | Confident |
| `owned-other-version` | `local-want` | "Possibly owned: same album on Discogs" | **Likely**: a local want's `masterId` is the first `searchForRelease()` hit, never confirmed by the user, so it is downgraded |
| `owned-name-match` | any | "Possibly owned: similar title" | Likely |
| `not-owned` | any | (no marker) | – |
| `unknown` | any | (no marker); the cover says "Collection not cached: owned flags unavailable" | – |

- Where a match exists, the version sub-line names the owned copy from
  `ownedCollectionRowIds`, e.g. "OWNED: another version (1994 · Vinyl)".
- Name matches are never shown as confident.
- The "Flag wanted albums I already own" option off hides all markers except
  `owned-same-release`. That one stays, because buying the identical pressing
  again is the costly mistake.

Optional widening, proposed to data-export-plan.md and **not** required for
this MVP:

- **(a) Mapping tier.** A want whose `albumNameKey(artist, title)` equals the
  history name of a collection-linked album mapping (`isCollectionLinked()`).
  This is user-asserted and would be confident.
- **(b) Edition-insensitive name tier.** Use `editionlessAlbumKey()` from
  `albumMergeSuggestions.ts`, so "Album (Deluxe Edition)" matches "Album".
  This tier would be likely.

Either would need a new `OwnedMatchStatus` value (additive within schema v1).
The PDF would show (a) as "OWNED: another version (your mapping)" and (b) as
"Possibly owned".

Against today's data the shared rules give:

- 0 same-release matches.
- 3 other-version matches, all from Discogs wants.
- 1 name-only match.

That's out of 206 Discogs wants; none of the 13 local wants match. Errors are
cheap at this volume, and the wording tells the user to check the "possibly"
ones.

---

## Collation & Grouping Rules (owned by this plan)

All rules live in one pure module so they are unit-testable and can be reused
by the later HTML export.

### Display name vs sort key

- **Display** uses the row's display artist (`artistDisplay`: Discogs "(N)"
  suffixes already stripped from every joined artist by `exportDataService`,
  via its new `stripDiscogsSuffixes()`). Names are
  shown as written: "The Beatles", not "Beatles, The". Reasons:
  - Viewer search for "The Beatles" or "Beatles" both succeed.
  - It matches what the user sees on Discogs and on the sleeve.
- **Artist sort key**:
  1. NFC-normalize and trim.
  2. Strip a leading article from the configured list, default `["The"]`,
     case-insensitive and followed by whitespace, only if something remains.
     "The The" sorts as "The". "A"/"An" are **not** stripped by default,
     because "A Tribe Called Quest" and "A Flock of Seagulls" are filed under
     A in many shops. This is an open decision.
  3. Strip leading characters that are neither letters nor digits (`^[^\p{L}\p{N}]+`). "...And You Will Know Us…" → A, "+/-" → section "#". If nothing remains, the raw string is collated in "#".
  4. Comma-joined multi-artist credits sort by the full string, which in effect means the first credited artist.
  5. "Various" is not special-cased and lands under V. The cover page legend says so.
- **Album sort key**: NFC, trim, leading punctuation stripped. Articles are
  kept, because album titles are rarely filed by article-less title. The user
  scans the albums within an artist anyway.

### Comparison

- One shared `Intl.Collator('en', { sensitivity: 'base', numeric: true, ignorePunctuation: true })`.
- Node ships full ICU, so accented letters collate with their base letter
  ("Björk" sorts as "Bjork"). Digits compare numerically ("9" < "10").
  Non-Latin scripts sort after Latin, following CLDR root order.
- Order of comparison:
  1. artist sort key
  2. album sort key
  3. year ascending (missing last)
  4. owned before wanted
  5. format
  6. stable id

  The final comparison must be total, so output is deterministic and testable.

### Section letters

- Take the first grapheme of the artist sort key. Match it against `A`–`Z`
  using the same collator at base sensitivity. That folds É → E, Æ → A, and
  Ø/Ł → O/L where CLDR root treats them as variants. Unit tests pin each of
  these; any that don't fold go to "Other".
- Digits, and punctuation-only names → **"#"** (digits and symbols), placed
  first, which is how most record shops put it.
- Letters from non-Latin scripts → **"Other scripts"**, placed last and
  collated within itself.
- Only letters that have entries get a section. The index shows empty letters
  greyed out and not linked.

### Grouping & duplicates

1. **Artist block.** All entries whose artist display name gives the same
   `albumGroupKey(artist, '')` are shown under one artist heading. The heading
   uses the most common display spelling.
2. **Album group within an artist.**
   - Key: `master:{masterId}` when the master ID is present, confirmed, and
     not from a local want. Otherwise `albumGroupKey(artist, title)`.
   - One album line per group, then one compact sub-line per version, with
     year · label · format (· country, later) and an OWNED/WANTED marker.
   - Identical collection instances (same release ID; `copyCount > 1`)
     collapse into "OWNED ×2".
   - With version details turned off, the album line shows just counts:
     "OWNED ×2 · WANTED (2 pressings)".
   - In "both" mode, owned and wanted versions of the same album share a
     group. This is the main in-shop payoff: one glance shows "have the 1994
     pressing, want the reissue".
3. **Wishlist cross-source de-duplication (display only):**
   - A Discogs want and a local want are the same when the row's
     `relatedWishlistRowIds` links them (same master or album, computed by
     `exportDataService`). This is more tolerant than `WishlistPage`'s
     lowercase/trim key.
   - The Discogs want wins, because it names a specific pressing. The local
     source is noted as "also monitored" only in the count line.
   - Local-only wants show the tag "any version" because the user hasn't
     chosen a pressing.
   - The cover counts give both the raw and the deduplicated totals:
     "219 wants (206 Discogs + 13 monitored, 1 overlap)".
   - Raw rows stay undeduplicated in data-export (portability).

### Formats

- Collection rows only have top-level names (`Vinyl`, `CD`, `All Media`).
  Wanted rows have descriptions (`LP`, `Album`, `Reissue`).
- Display uses the normalized format from `exportDataService`.
- **Non-vinyl formats are always shown**, even when the format option is off,
  because "this one is a CD" matters in a vinyl shop. `All Media` is shown as
  "Box/mixed".

---

## PDF Generation: options & decision

| | (a) `pdfkit` | (b) Headless Chromium (`playwright` `page.pdf`) | (c) `pdf-lib` |
|---|---|---|---|
| New runtime deps | `pdfkit` (pure JS, fontkit inside); ~10 MB unpacked | Move `playwright` from dev to runtime dependency; needs a Chromium binary (already cached locally; ~150 MB fresh) | `pdf-lib` + `@pdf-lib/fontkit` |
| Unicode / shaping | fontkit shaping; **no automatic font fallback**, so per-glyph font runs must be split by hand (risky for combining marks and Indic conjuncts) | HTML text shaping and per-glyph font fallback built in (bundled fonts first, then system fonts) | Glyph placement only; no fallback |
| Layout | Manual: wrapping is built in, but keep-with-next, widow control, and page-break logic are hand-written | CSS: block flow, `break-after: avoid-page`, `break-inside: avoid-page`, `@page { size }` | All manual (no text layout) |
| Outline / links | Yes (`outline`, named destinations) | `outline: true` (from h1–h6), `#fragment` links become internal links, `tagged: true` | Low-level only |
| Searchable text | Yes (ToUnicode maps) | Yes | Yes |
| Reuse for the later HTML export | None | **The same HTML template** | None |
| Maintenance | Active (0.20.x, Aug 2026; ESM-first with a CJS `require` entry) | Active; already in repo | Unmaintained since 2021 (1.17.1) |
| Test speed | Fast, in-process | Needs a browser for rendering tests (gate them); model and HTML tests stay fast | Fast |

**Decision (confirmed by the user, 2026-10-11): (b) Chromium via Playwright.** The app runs on one laptop that already has Playwright for the end-to-end tests, so the install cost is acceptable. The reasons:

- It handles shaping and font fallback, which is the riskiest part of
  rendering Unicode. pdfkit would need hand-split font runs, which break
  combining clusters.
- CSS pagination covers keep-with-next for letter and artist headings.
- One HTML template serves both this PDF and the later interactive HTML export.
- It's already in the repo and installed on the user's laptop.

Costs we accept, and how we limit them:

- **Runtime dependency.** Move `playwright` (or `playwright-core` pinned to the
  same version) to `dependencies`. If the browser executable is missing, the
  endpoint returns **503** with a fix-it message: "PDF renderer not installed:
  run `npx playwright install chromium`". It must not crash.
- **Resource use.**
  - Launch Chromium lazily on the first export and reuse one browser.
  - Close it after ~60 s idle.
  - Run one export at a time; a concurrent request gets 409 "export already
    running".
  - Use a fresh browser context per export and close it in `finally`.
  - Page timeout 60 s.
- **Self-contained and safe output.**
  - Render with `page.setContent(html)` in a context with
    `javaScriptEnabled: false`.
  - Abort every request except `data:` URLs via `context.route('**/*', …)`.
    This guarantees no external assets and no file system reads.
  - HTML-escape all user data. Discogs names are untrusted text.
- **Fonts.** Add `@fontsource/noto-sans` (5.3.0, **OFL-1.1**). Its woff2
  subsets cover Latin, Latin-ext, Greek, Cyrillic, Vietnamese, and Devanagari.
  - Inline the needed weights (400, 700) as base64 `@font-face` data URLs.
    Wait for `document.fonts.ready` before `page.pdf()`.
  - Chromium's PDF backend embeds **only the subset of glyphs used**, so files
    stay small. Expect well under 2 MB for ~1,400 entries, which Phase 4
    will measure.
  - Symbols outside Noto Sans (e.g. "★", CJK) fall back to system fonts.
    macOS ships CJK fonts, and Chromium embeds the subset it used. That's
    acceptable for a personal-use file.
  - Bundling Noto Sans JP/SC is **not** worth it (~84 MB unpacked for JP
    alone). It's listed under open decisions in case CJK data grows.
  - The OFL notice ships with the npm package. Add one line to
    `README.md`/`LICENSE` third-party notices when implementing.
- **Search quality.**
  - Set `font-variant-ligatures: none`, so "fi"/"fl" ligatures don't break
    search in some viewers.
  - Set `hyphens: manual`, so artist names aren't split mid-word.
  - Put markers ("OWNED", "WANTED") in real text nodes, not CSS `::before`.

**Fallback if (b) proves unworkable** (packaging, memory): pdfkit with the same
`PocketListModel`. Only the renderer module changes. Keeping the model separate
from the HTML preserves that option.

---

## Layout Specification

- **Page.** `@page { size: 4in 8in; margin: 0.3in 0.25in; }`, which is
  288 × 576 pt (a 1:2 portrait shape, close to a phone screen).
  - Fit-to-width on a ~390 pt-wide phone viewport scales the page by ≈1.35.
- **Type sizes** (with their on-screen size after that scaling):
  - Artist: 12.5 pt bold (≈17 px on screen).
  - Album: 11.5 pt (≈15.5 px).
  - Version sub-lines and markers: 9.5 pt (≈13 px).
  - Letter headings: 20 pt.
  - Line height 1.25. Expect roughly 30–35 lines per page.
- **Single column. No tables.** Long names wrap (`overflow-wrap: anywhere`
  only as a last resort for unbroken tokens). Nothing is truncated except
  notes, which are cut at ~100 characters with "…".
- **Page 1 (cover + index):**
  - Title "Listenography Pocket List".
  - List type, e.g. "Wishlist + Collection".
  - Generated date and time (local).
  - Counts: albums, entries, owned, wanted, and owned-version flags by tier.
  - Data freshness: "Wishlist synced 4 Oct 2026 · Collection cached 11 Oct 2026".
  - Legend.
  - A–Z grid of large tap targets (≥ 28 pt cells) linking to the letter
    sections.
- **Letter section.** An `h2` letter heading (used for the outline) plus a
  small "Index ↑" link. `break-after: avoid-page`.
- **Artist block.** The artist heading is a styled `p`, **not** a heading
  element, so the outline isn't flooded with 1,000 entries. Each artist
  heading and its first album sit in a `break-inside: avoid-page` wrapper.
- **Entry line.** Album title, then an optional dimmed " · 1994". Next come
  markers as bordered text badges: `OWNED`, `WANTED`, `OWNED: another
  version`, `Possibly owned`, `any version`. Version sub-lines are indented
  under the album.
- **Running footer** via Chromium `footerTemplate`: "p. X / Y". Footer links
  aren't reliable, so navigation uses in-body links.
- **Colors.** Black text on white with a single accent for the WANTED badge
  border. Meaning never depends on color, and the PDF reads the same in
  grayscale or "smart invert" modes.
- **Metadata.** Document title "Listenography Pocket List – {lists} –
  {date}", plus `tagged: true` for a logical reading order (better search
  and extraction, and better accessibility).

---

## Data Model

There is **no persisted data**. Everything is computed per request from
existing caches.

- **`src/shared/types.ts`** (shared by the API client and the route):
  - `PocketListKind = 'wishlist' | 'collection'`
  - `PocketListWishlistSource = 'discogs-want' | 'local-want'`, using the same
    literals as the data-export row `source`.
  - `PocketListOptions`:
    - `lists: PocketListKind[]`
    - `wishlistSources: PocketListWishlistSource[]`
    - `details: { format: boolean; pressing: boolean; notes: boolean }`
    - `ignoreArticles: string[]` (default `['The']`)
    - `flagOwnedVersions: boolean` (default `true`)
- **Backend-internal** (not exported to the renderer), in
  `src/backend/services/pocketList/`:
  - `PocketListModel`:
    - `meta`: generatedAt, lists, counts, freshness timestamps
    - `sections: PocketListSection[]`
    - `PocketListSection`: `{ id, label, artists: PocketListArtistBlock[] }`
    - `PocketListArtistBlock`: `{ displayArtist, albums: PocketListAlbumGroup[] }`
    - `PocketListAlbumGroup`: `{ title, year?, versions: PocketListVersionLine[], ownedCount, wantedCount, ownedVersionMatch? }`
  - Inputs are `ExportCollectionRow[]`, `ExportWishlistRow[]` and `ExportSnapshotMeta`, consumed as-is. Fields used:
    - `artistDisplay`, `title`, `year`, `formats`, `labels`, `masterId`, `releaseId`
    - `copyCount` (collection), `notes` (wants only in the MVP)
    - `source`, `ownedMatch`, `ownedCollectionRowIds`, `relatedWishlistRowIds`
    - meta `collectionCachedAt`, `wishlistUpdatedAt`
  - Country is not in the rows yet. Pressing lines show year · label until data-export-plan adds `country` (additive).

### Migration / backup implications

None:

- No new data files.
- No `migrationService` or `backupService` registration.
- No schema changes.

The export only reads caches, and the generated PDF is never stored on the
server.

---

## Backend

### Modules (new)

1. **`src/backend/services/pocketList/pocketListCollation.ts`** (pure):
   - `artistSortKey(name, articles)`
   - `albumSortKey(title)`
   - `sectionFor(sortKey, collator)`
   - `comparePocketEntries`
   - `createPocketCollator()`
2. **`src/backend/services/pocketList/pocketListModel.ts`** (pure):
   `buildPocketListModel(collectionRows, wishlistRows, options, meta)`. This
   function does:
   - source filtering
   - cross-source de-duplication
   - artist and album grouping
   - version lines
   - counts
   - ordered sections
3. **`src/backend/services/pocketList/pocketListHtml.ts`** (pure):
   `renderPocketListHtml(model, fonts)`. It returns a full HTML string with
   inline CSS and `data:` fonts, escapes all text, and has no `<script>`.
4. **`src/backend/services/pocketList/pocketListPdfRenderer.ts`**: Chromium
   lifecycle (lazy launch, idle close, single-flight lock, request blocking,
   timeouts) and `renderPdf(html): Promise<Buffer>`. It has a narrow interface,
   so tests can swap in a fake.
5. **`src/backend/services/pocketList/pocketListService.ts`**: puts it all together:
   - `exportDataService` rows
   - freshness, from `ExportDataService.getSnapshotMeta()` (`collectionCachedAt`, `wishlistUpdatedAt`)
   - model
   - HTML
   - PDF

   It takes `exportDataService` and the renderer as constructor dependencies,
   following the pattern used by `CollectionAnalyticsService`.

### Route

The endpoint shares the `/api/v1/export` prefix with data-export-plan.md.
data-export-plan.md creates `src/backend/routes/export.ts` (mounted at
`/api/v1/export` in `src/server.ts`); this plan adds one route to it.
**Register `/pocket-list` before that router's `/:dataset` route**, otherwise
it is captured as an unknown dataset (400).

`GET /api/v1/export/pocket-list`

| Query | Values | Default |
|---|---|---|
| `lists` | `wishlist`, `collection`, comma-separated | `wishlist` |
| `sources` | `discogs-want`, `local-want` | both |
| `details` | `format`, `pressing`, `notes` | `format,pressing` |
| `articles` | comma list, or empty for none | `The` |
| `flagOwned` | `true` / `false` | `true` |

Responses:

| Status | When | Body |
|---|---|---|
| 200 | Success | `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="listenography-pocket-list-{wishlist\|collection\|wishlist-collection}-{YYYY-MM-DD}.pdf"`, `Cache-Control: no-store`, PDF body |
| 400 | Unknown values | JSON error (`ApiResponse` shape) |
| 409 | Collection-only export requested but the collection cache is empty (`collectionCachedAt` null) | Message: "Sync your collection first". For wishlist exports, an empty cache only disables owned flags (`unknown`) |
| 409 | An export is already running | JSON error |
| 422 | Nothing to export (0 rows after filtering) | JSON error |
| 503 | Renderer unavailable (browser missing) | Install hint |

A GET without side effects fits, because it only reads caches. It is subject
to the global `/api/` rate limiter and the existing token auth.

---

## Frontend

- **`src/renderer/services/api.ts`**: add
  `exportPocketList(options): Promise<Blob>`, modelled on `exportBackup()`
  (`responseType: 'blob'`). On error, read the blob as text and parse the JSON
  `error` so the 409/422/503 messages reach the user.
- **New `src/renderer/components/PocketListExportDialog.tsx`** + `PocketListExportDialog.css`. It uses the `Modal` UI component and `Button`, with no inline styles and design tokens only. Controls:
  - List type: Wishlist / Collection / Both (radio). Preselected from the entry point.
  - Wishlist sources: "Discogs wantlist" and "Monitored (local) wants" checkboxes. Shown only when the wishlist is included.
  - Details: "Format", "Pressing (year, label)", "Notes" checkboxes.
  - "Flag wanted albums I already own a version of" (checkbox, on by default).
  - "Ignore leading 'The' when sorting" (checkbox, on by default).
  - A data-freshness line from `GET /api/v1/export/datasets` meta
    (data-export-plan.md), plus a hint: "Sync first for an up-to-date list".
    No auto-sync.
  - "Download PDF" button: shows progress, saves via `URL.createObjectURL`
    with the server's filename, then shows a short success note: "Move it to
    your phone with AirDrop, email, or a cloud drive."
- **Entry points:**
  - `WishlistPage`: a "Pocket List" `Button` with a lucide `FileDown` icon
    (16 px, `aria-hidden`), in both the standalone `page-header-actions` and
    the embedded `wishlist-actions` row. The Marketplace → Wishlist tab
    renders `<WishlistPage embedded />`.
  - `CollectionPage`: the same button in the `collection-header`, next to the
    title and stats.
  - Settings → Backup "Export your data" card (data-export-plan.md): add a
    "Pocket List (PDF)" row that opens the same dialog. Don't build a second
    UI.
  - Why page buttons when data-export deliberately avoids them: Pocket List
    is a shopping action taken while looking at the wishlist or collection.
    CSV/JSON export is an occasional data-management task. One button per
    page, and one dialog, keeps the controls from being duplicated.
- **Remembered options.** Persist the last-used options in `localStorage`
  (try/catch, like other view-state code). This is a convenience only.

---

## Implementation Phases (relative effort)

| Phase | Work | Effort |
|---|---|---|
| 0 | **Dependency:** `exportDataService` rows from data-export-plan.md, including owned-version status for wants. If that plan hasn't landed, implement the subset this plan needs **inside that service following its spec**, never as a parallel loader. | (counted in data-export plan) |
| 1 | Collation and model modules with full unit tests. Shared option types. | M |
| 2 | HTML template, fonts dependency, Chromium renderer, `pocketListService`, route, and 503/409/422 handling. Move `playwright` to `dependencies`. | M |
| 3 | `ApiService.exportPocketList`, dialog, two entry points, CSS. | S |
| 4 | Validation pass on real data and phones (strategy below). Tune the type scale and page size. Record the file sizes. | S |
| Later | Interactive HTML export (after the phone-open checks), surname/article overrides, more filters. | M–L |

Overall MVP is roughly **M** (about 2–3 focused days after the data-export rows exist).

---

## Acceptance Criteria

1. From the Wishlist and Collection pages, the user can export wishlist,
   collection, or both, and gets a `.pdf` named as specified.
2. Entries are grouped under artist headings inside letter sections, sorted
   artist then album, following the rules above. "The" is ignored for
   sorting but shown, and "(N)" suffixes are never shown.
3. Owned and wanted are distinguished by text markers. Wanted albums with an
   owned version show the right tier wording, and nothing above "Possibly
   owned" comes from name-only evidence.
4. Multiple pressings and copies of one album sit in one group, never as
   scattered duplicates. Discogs and local wants of the same album appear once.
5. The cover shows the generated timestamp, list type(s), counts, and data
   freshness dates.
6. On a ~6" phone at fit-to-width, body text is readable without zooming, and
   nothing needs horizontal scrolling.
7. Viewer search finds artist and album names, including accented ones. The
   A–Z index links and the outline bookmarks jump to the right sections.
8. The PDF opens and renders correctly with the laptop off and the phone in
   airplane mode. It contains no external references, and its fonts are
   embedded.
9. If Chromium is missing, the user sees an actionable error (503), not a
   crash. Concurrent exports are refused cleanly.
10. No data files are written, and no Discogs/Last.fm calls are made during
    an export.

---

## Tests (meaningful, not exhaustive)

**`tests/backend/pocketListCollation.test.ts`** (pure, fast)

- Leading "The" ignored ("The Beatles" between "Beach House" and "Beck").
  "The The" sorts as "The". "A Tribe Called Quest" stays under A by default,
  and moves to T when `articles` includes "A".
- "(2)" suffix artists sort with the plain name.
- Accents: "Björk", "Émilie Simon", and "Ólafur Arnalds" fall in B, E, and O.
  Æ/Ø/Ł bucket as pinned. A Devanagari name goes to "Other scripts", after Z.
- Numbers: "2Pac" < "10,000 Maniacs" (numeric) under "#", which comes first.
- Punctuation: "...And You Will Know Us" → A. "!!!" → "#".
- Comparator is total and deterministic: shuffled input gives identical output.

**`tests/backend/pocketListModel.test.ts`** (pure)

- Groups by master. When there's no master, it falls back to `albumGroupKey`.
  Identical release IDs collapse to "×2".
- Owned and wanted versions of one album share a group in "both" mode.
- Cross-source dedupe follows `relatedWishlistRowIds`. The Discogs want wins
  and the counts report the overlap.
- Every `OwnedMatchStatus` maps to the specified wording. A local-want
  `owned-other-version` is shown as "Possibly owned". `unknown` gives no
  markers plus the cover warning.
- Non-vinyl format is shown even with format details off.
- Option filtering: sources excluded, details off, lists subset.
- Empty input gives a model the route turns into 422.

**`tests/backend/pocketListHtml.test.ts`** (pure)

- HTML-escapes `<`, `&`, and quotes in names.
- Contains no `<script>`, no `http(s):` URLs, and no `src=` other than `data:`.
- One `h2` per section, and index links match section ids.

**`tests/backend/routes/export.pocketList.test.ts`** (supertest, fake renderer)

- Headers: content type, disposition filename per list combination,
  `no-store`.
- 400 on bad query. 409 when there's no collection cache. 422 on an empty
  result. 503 when the renderer reports a missing browser. 409 on concurrent
  export.

**`tests/integration/pocketListPdf.test.ts`** (real Chromium; **skipped** when
the Playwright browser isn't installed)

- Render a fixture with about 40 tricky names: accents, Devanagari, symbols,
  very long titles, multi-version groups.
- Extract text with PDF.js (`pdfjs-dist` devDependency, run via a small ESM
  helper subprocess to avoid CJS/Jest ESM friction). Assert:
  - names appear in the expected order
  - the "OWNED"/"WANTED" tokens are present
  - the outline has one entry per section
  - internal link annotations exist
  - fonts are embedded
  - no URI actions to external hosts

Frontend: `tests/frontend/…/PocketListExportDialog.test.tsx` checks:

- The option payload passed to `exportPocketList`.
- Wishlist-source controls are hidden for collection-only exports.
- Error messages are shown from blob JSON errors.

---

## Future Validation Strategy (Phase 4 and regressions)

1. **Fixture sets** (synthetic, committed under `tests/fixtures/`, no personal
   data):
   - **Small:** 5 items. Checks the cover, the index with mostly greyed
     letters, and a single page.
   - **Real-sized:** ~1,400 items (shape matched to the counts above).
   - **Large:** 10,000 synthetic items. Measure generation time (target under
     20 s on the laptop), peak RSS, and PDF size (target under 5 MB). Check
     that the outline and index stay usable.
2. **Long names.** A 128-character credit, a 200-character synthetic title,
   and an unbroken 60-character token. These must wrap inside the page and
   never be clipped or widen the page.
3. **Accented and non-Latin text.**
   - Latin accents, Greek, Cyrillic, Devanagari (conjunct shaping visually
     checked), Japanese/Chinese (system-fallback glyphs present, not tofu),
     "★", "…", "–".
   - Check embedded fonts with `pdffonts`, if poppler is available, or with
     PDF.js font info.
4. **Alphabetical ordering.** Golden-order snapshot of the tricky-name
   fixture, reviewed by a human once and then asserted, covering:
   - articles
   - "(N)" suffixes
   - digits
   - punctuation
   - accents
   - "Various"
   - multi-artist credits
5. **Duplicate handling.** Fixture with:
   - 3 pressings of one master (2 owned, 1 wanted)
   - 2 instances of one release
   - a Discogs and local want of the same album
   - a same-name, different-master pair (must show "Possibly owned", not
     "OWNED")
6. **PDF text search.** On each viewer below, search for:
   - an accented name with and without the accent ("Bjork" → "Björk";
     accent-insensitive search is viewer-dependent)
   - a multi-word album
   - "WANTED"

   Record any viewer that fails. Ligature or hyphen breaks count as bugs.
7. **Visual readability on a phone.** Transfer the real-sized export by
   AirDrop and by email. Test:
   - iOS Files/Quick Look, Apple Books, Android Google Drive viewer, and
     Files by Google
   - airplane mode
   - fit-to-width legibility at arm's length
   - tap targets on the index
   - outline availability (note which viewers show it; the in-document index
     must suffice when they don't)
   - grayscale / smart-invert legibility
   - scroll performance on the large fixture

   Save screenshots alongside the PR, not in the repo.
8. **Regression guard.** The integration test (skipped without a browser)
   plus pure snapshot tests run in `npm test`. Repeat manual phone checks
   only when layout CSS or the renderer changes.

---

## Open Decisions

1. **Leading articles beyond "The".** Strip "A"/"An" by default? The
   recommendation is no (shop filing conventions vary), with it available as
   an option.
2. **"Both" layout.** Merged single A–Z (recommended, so the user sees
   owned and wanted together at the bin) or two parts (Wanted, then Owned)?
   This could become a dialog option if the user wants both.
3. **Discard pile.** Collection items whose `DiscardPileItem.status` is
   `sold`/`traded_in`/`gifted`/`removed` but which are still in the Discogs
   cache: hide them from the pocket list? data-export rows are deliberately
   complete ("consumers curate"), so this would be Pocket List curation. It
   would read `DiscardPileService` items by `collectionItemId`, because the
   rows carry no instance id until data-export Phase 4. The recommendation is
   to hide them, with a count on the cover. Note that `owned-*` match statuses
   computed upstream would still count them.
4. **Collection notes.** The only notes are Media/Sleeve condition custom
   fields. Show condition in the pocket list? The recommendation is no for
   the MVP (noise while shopping).
5. **CJK coverage.** System font fallback is enough for one laptop. Bundle a
   CJK font only if exports are ever made on a machine without system CJK
   fonts.
6. **Renderer packaging.** Move `playwright` to `dependencies`, or only
   `playwright-core` plus a documented browser install step? Either way, a
   503 hint covers a missing browser.
7. **Page size.** 4 × 8 in is the starting point. Phase 4 may settle on a
   narrower 3.5 in width if fit-to-width text still feels small.

## Assumptions

- `ExportDataService` (`getCollectionRows`, `getWishlistRows({ sources })`,
  `getSnapshotMeta`) lands as specified in data-export-plan.md Phase 1. Its
  rows come in machine order, and all human collation happens here. If a
  field this plan needs is missing (e.g. `country`), it is added there
  additively, not loaded separately here.
- Export uses cached data only. Syncing remains a separate, explicit user
  action.
- Node's bundled full ICU is present (it is the default since Node 13; the
  repo requires Node ≥ 22).
