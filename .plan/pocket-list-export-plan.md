# Plan: Pocket List Export (offline wishlist / collection PDF)

## Status

Backlog -- not started. Depends only on data-export-plan.md **Phase 1**
(`exportDataService.ts` rows, snapshot meta, and the `routes/export.ts`
skeleton with `GET /meta`). No code, data, or tests have changed for this plan.

Revised 2026-10-11 after a peer review: local-want id handling, match
confidence, suffix-preserving identity, conservative album grouping, explicit
section buckets, cache completeness, PDF page box, offline verification, phone
sizes, timeouts, CI, and MVP dependencies.

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

No network, server, login, or app is needed at read time. Any viewer that
renders embedded fonts and internal links should work; the ones we test are iOS
Files/Quick Look, Apple Books, the Google Drive viewer, and Files by Google.
Outline (bookmark) support and accent-insensitive search vary by viewer, so the
in-document A–Z index is the navigation that must always work.

---

## Current State (verified)

### Data sources (read-only, cached; export makes no Discogs calls)

| Source | Where | Loaded by |
|---|---|---|
| Discogs collection | `data/collections/{username}-page-N.json` | Via `exportDataService`, which uses the new `readCollectionCacheSnapshot()` (data-export-plan.md, "Cache completeness"). `getAllCachedCollectionItems()` in `src/backend/utils/collectionCache.ts` stops silently at the first missing page and returns no timestamps, so it can't report a partial cache |
| Discogs wants | `data/wishlist/wishlist-items.json` (`WishlistStore`) | `WishlistService.getWishlistItems()` |
| Local (monitored) wants | `data/wishlist/local-want-list.json` (`LocalWantStore`) | `WishlistService.getLocalWantList()` |
| Album mappings | `data/mappings/album-mappings.json` | `MappingService.getAllAlbumMappings()` |

### Existing matching building blocks

- **Master ID.** `DiscogsRelease.master_id` (collection) and
  `WishlistItem.masterId` (wants). `LabelMonitoringService.loadUserReferenceSets()`
  and `WishlistService.getTrackedMasterIds()` already key on these.
- **Name keys** in `src/shared/utils/albumMapping.ts`: `stripDiscogsSuffix()`,
  `albumGroupKey()` (case, accent, punctuation, and "(2)" insensitive),
  `albumNameKey()`, `isCollectionLinked()`. `albumGroupKey()` was fixed on
  2026-10-11 to keep Unicode combining marks: after stripping Latin accents
  (U+0300–U+036F) it keeps `[\p{L}\p{N}\p{M}]`, so Devanagari "क", "का", "कि",
  "कु" no longer collide. Because it also drops "(N)" suffixes, it is a
  candidate/grouping key, not an artist identity (see Collation).
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
- `@playwright/test@^1.54.2` is a **devDependency**, resolving to
  `playwright-core` 1.57.0. Its `Page.pdf()` typings include
  `outline?: boolean`, `tagged?: boolean` and `preferCSSPageSize?: boolean`.
  Chromium builds are present in the local Playwright cache.
- CI (`.github/workflows/ci.yml`) already has an E2E job that runs
  `npx playwright install --with-deps chromium`.
- The renderer's axios client has a **30 s** default timeout
  (`src/renderer/services/api.ts`, `timeout: 30000`). Slow calls override it
  per request (60 s for data aggregation, 90 s for AI).

---

## Data Quality (aggregate inspection of local data, 2026-10-11)

| Field | Collection (1,189 items) | Discogs wants (206) | Local wants (13) |
|---|---|---|---|
| artist / title | 100% | 100% | 100% |
| master ID | 1,162 (97.7%) | 201 (97.6%) | 11. **Taken from the first Discogs *master* search hit (`searchForRelease`), not confirmed by the user.** Their stored `releaseId` is that same master id (11/11), not a release id |
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
- 1 local want shares a master with a Discogs want (a `likely` link, because
  the local master is a search guess), and 0 overlap by name.
- 1 collection artist name appears under two different Discogs suffixes
  (two different artists); they stay separate.

Match counts against the collection:

- 3 wants share a master with a collection item.
- `albumGroupKey` finds 4 name matches, 1 of them with a different master.
  The suffix-preserving identity rule gives the same result.
- 0 wants are the exact same release.
- No collection album (same identity name key) is split between a
  master-backed and a masterless row, and none spans two masters, so the
  conservative grouping below loses nothing on today's data.

What this means for the plan:

- The core fields are reliably populated: artist, album, and year. Format needs care.
- The PDF must look complete without catalog numbers or notes, so both are
  optional extras.
- Fixing the catno mapping is a data-export-plan / `discogsService` concern,
  noted here as a dependency. It does **not** block this plan.

Data freshness: the wishlist store `lastUpdated` is 2026-10-04. All 24
collection cache pages (24 expected, 1,189 items) were written today, so the
cache is complete. The export prints both dates and warns when the collection
cache is partial.

---

## Scope

### MVP

1. **List choice.** Wishlist, collection, or both in one document. "Both" is
   always one **merged** A–Z (settled default; no two-part layout option in
   the MVP).
2. **Wishlist sources.** Discogs wants and local (monitored) wants, both on by default.
3. **Sorting.** A–Z by artist, then album, with clear letter sections (rules
   below). Only a leading "The" is ignored (settled default; no article
   option in the MVP).
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
- Hiding discarded items. Deferred until data-export Phase 4 captures
  `instance_id` (see Open Decisions 3).
- Mapping-based or edition-insensitive owned-match tiers (see Matching).
- Any HTML-export-specific work beyond keeping the HTML template reusable.

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
   "Les", "Die"), plus per-artist "file under" overrides. The collation
   module takes the article list as a parameter from day one, so this is a UI
   and option change only.
4. **"Both" as two parts.** Wanted first, then Owned, as a dialog option.
5. **More filters.** Vinyl-only for the collection, or per-folder and per-genre lists.
6. **Paper sizes.** Letter or A4 two-column printable output for paper lists.
7. **More detail.** Catalog numbers and condition notes, once data-export-plan
   normalizes them (catno mapping fix, named collection note fields).
8. **Discard filtering.** Hide sold/traded copies once rows carry
   `instanceId`.
9. **Owned-match widening.** The mapping and edition-insensitive tiers in
   Matching.

---

## Matching: "you already own a version"

Owned-version status is **computed in `exportDataService`** and arrives as
`ExportWishlistRow.ownedMatch: OwnedMatchStatus`, with `ownedMatchConfidence`,
`ownedCollectionRowIds` and `ownedCollectionLinks` (basis + confidence per
collection row). See data-export-plan.md, "Owned-match rules", "Identity and
name keys" and "Local-want ids". In short:

1. same **confirmed** `releaseId` → `certain` (Discogs wants only; a local
   want's `releaseId` is always `null`, because the stored value is really a
   master id from a master search)
2. same `masterId > 0` → `confident` when both masters come from Discogs
   release data, `likely` when the want's master is a search guess (local
   wants)
3. name match → `likely`. Discogs want vs collection needs equal
   `artistIdentityKey` (suffixes kept, so "Artist (2)" never matches
   "Artist (3)") and equal `albumNameKey`; a local want needs only
   `albumNameKey`
4. otherwise `not-owned`; `unknown` when the collection cache is missing, and
   also in place of `not-owned` when the cache is partial

They use the Unicode-safe `albumGroupKey()`, not `fuzzyNormalizeKey()`. This
plan owns only the **wording**, driven by `ownedMatchConfidence`, not by
`source`:

| `ownedMatch` | `ownedMatchConfidence` | PDF wording |
|---|---|---|
| `owned-same-release` | `certain` | "OWNED: this pressing" |
| `owned-other-version` | `confident` | "OWNED: another version" |
| `owned-other-version` | `likely` | "Possibly owned: same album on Discogs" |
| `owned-name-match` | `likely` | "Possibly owned: similar title" |
| `not-owned` | – | (no marker) |
| `unknown` | – | (no marker); the cover says "Collection not cached: owned flags unavailable", or, for a partial cache, "Collection cache incomplete (N of M pages): unflagged wants may still be owned" |

- "This pressing" is printed **only** for `certain`. A local want can never
  produce it, because it has no confirmed release id.
- Where a match exists, the version sub-line names the owned copy from
  `ownedCollectionLinks`, e.g. "OWNED: another version (1994 · Vinyl)". When
  several collection rows match, the strongest link is named and the rest are
  counted ("+1 more").
- Nothing below `confident` is ever worded as "OWNED".
- The "Flag wanted albums I already own" option off hides all markers except
  `owned-same-release`. That one stays, because buying the identical pressing
  again is the costly mistake.
- If the local-want id bug is fixed later and a local want gains a
  user-confirmed release, the shared layer will report `certain` and this
  table needs no change.

Optional widening, proposed to data-export-plan.md and **not** required for
this MVP:

- **(a) Mapping tier.** A want whose `albumNameKey(artist, title)` equals the
  history name of a collection-linked album mapping (`isCollectionLinked()`).
  This is user-asserted and would be confident.
- **(b) Edition-insensitive name tier.** Use `editionlessAlbumKey()` from
  `albumMergeSuggestions.ts`, so "Album (Deluxe Edition)" matches "Album".
  This tier would be likely.

Either would need a new `MatchBasis` value (additive within schema v1).
The PDF would show (a) as "OWNED: another version (your mapping)" and (b) as
"Possibly owned". Both are **deferred** past the MVP.

Against today's data the shared rules give:

- 0 same-release matches.
- 3 other-version matches, all from Discogs wants (`confident`).
- 1 name-only match (`likely`).

That's out of 206 Discogs wants; none of the 13 local wants match. Errors are
cheap at this volume, and the wording tells the user to check the "possibly"
ones.

---

## Collation & Grouping Rules (owned by this plan)

All rules live in one pure module so they are unit-testable and can be reused
by the later HTML export.

### Identity vs display vs sort

Three different strings, never mixed up:

| Purpose | Field | "(N)" suffix |
|---|---|---|
| **Identity** (which rows are the same artist) | `artistIdentityKey` from the rows (local wants: none) | **Kept**. "Artist (2)" and "Artist (3)" are different artists on Discogs and are never merged |
| **Display** | `artistDisplay` | Stripped |
| **Sort / section** | artist sort key, derived from `artistDisplay` | Stripped |

- Names are shown as written: "The Beatles", not "Beatles, The". Viewer
  search for "The Beatles" or "Beatles" both succeed, and it matches Discogs
  and the sleeve.
- When two artist blocks with different identities have the same display
  name (1 case in today's collection), they are adjacent (ordered by suffix
  number, unsuffixed first), and each heading after the first gets a dimmed
  tag "(another artist named …)" followed by the Discogs number, e.g.
  "Discogs #2". This is the only place a suffix number is shown.

### Artist sort key

Applied in this order:

1. NFC-normalize and trim.
2. Strip leading characters that are neither letters nor numbers
   (`^[^\p{L}\p{N}]+`). This includes quotes, brackets, "¡", "¿", "…" and
   "+". **Punctuation is stripped before articles**, so a quoted
   “The Beatles” becomes "The Beatles”" and then files under B.
3. Strip a leading "The" (case-insensitive, followed by whitespace) only if
   something remains. "The The" sorts as "The". The article list is a
   parameter, fixed to `["The"]` in the MVP. "A"/"An" are not stripped, so
   "A Tribe Called Quest" files under A.
4. Strip leading non-letter/non-number characters again (for "The ...And").
5. If nothing remains (e.g. "!!!", "+/-"), use the original NFC string; it
   goes to "#".
6. Comma-joined multi-artist credits sort by the full string, which in
   effect means the first credited artist.
7. "Various" is not special-cased and lands under V. The cover legend says so.

**Album sort key**: NFC, trim, leading punctuation stripped. Articles are kept,
because album titles are rarely filed by article-less title.

### Section buckets

Buckets are an explicit, ordered list: **`#`, `A`…`Z`, `Other`** (28 in all).
Each has a fixed ASCII anchor id (`sec-num`, `sec-a`…`sec-z`, `sec-other`),
because `#` can't be used in a fragment.

The section comes from the first grapheme of the sort key, **not** from the
collator (at base strength the collator treats "Æ" as "AE", not "A"):

1. Decompose (NFKD) and drop combining marks **only if the base character is
   Latin**. "É" → E, "Ö" → O, "Ł" stays "Ł".
2. Apply a small explicit fold table for Latin letters that don't decompose:
   Æ→A, Œ→O, Ø→O, Ł→L, Đ/Ð→D, Þ→T, ß→S, Ħ→H, Ŧ→T, ı→I. Unit tests pin
   every entry.
3. If the result is an ASCII letter → that letter (uppercased).
4. If the first character is any Unicode number (`\p{N}`: ASCII, fullwidth
   "２", Devanagari "४", superscripts, Roman numeral "Ⅻ") → `#`. A
   punctuation-only name (rule 5 above) → `#`.
5. Anything else (non-Latin scripts, unmapped Latin letters) → `Other`. There
   is one such bucket, labelled "Other" on the page and in the index, placed
   after Z. There is no separate "Other scripts" bucket.

Only buckets with entries get a section. The index shows empty buckets greyed
out and not linked.

### Comparison

- One shared `Intl.Collator('en', { sensitivity: 'base', numeric: true, ignorePunctuation: true })`.
  Node ships full ICU (the repo requires Node ≥ 22). Accented letters
  collate with their base letter, and `numeric: true` compares any Unicode
  decimal digits numerically ("9" < "10").
- Order of comparison (the **section rank comes first**, so the collator can
  never reorder an entry out of its section):
  1. section rank (`#` = 0, A–Z = 1–26, Other = 27)
  2. artist sort key (collator)
  3. artist sort key, exact code-point order (breaks collator ties such as
     "AC/DC" vs "ACDC", or "Æther" vs "AEther")
  4. artist identity: suffix number ascending, unsuffixed first, then
     `artistIdentityKey` code-point order (local wants with no identity sort
     after Discogs identities with the same name)
  5. album sort key (collator), then exact code-point order
  6. year ascending (missing last)
  7. owned before wanted
  8. format (code-point order)
  9. `rowId` (code-point order; unique)

  The final comparison is total, so output is deterministic and testable.
  Code-point tie-breaks use plain `<`, never `localeCompare`.
- It runs at three levels so a block or group is never interleaved with
  another: artist blocks by rules 1–4 using the block's **heading** spelling;
  album groups within a block by rule 5 on the album line title (then the
  group's earliest year, then its lowest `rowId`); version lines within a
  group by rules 6–9.

### Grouping & duplicates

1. **Artist block.** Rows with the same artist identity form one block.
   Discogs rows: equal `artistIdentityKey`. Local wants have no identity:
   they join the block whose `albumGroupKey(artistDisplay, '')` matches when
   exactly **one** such Discogs identity exists, otherwise they get their own
   block (ordered after the Discogs ones, per comparator rule 4). Heading
   spelling: the most common `artistDisplay` in the block; ties go to a
   collection row's spelling, then code-point order.
2. **Album groups within a block**, built conservatively:
   1. **Confirmed-master groups.** Rows whose `masterIdSource` is
      `release-data` group by `masterId`. Two different confirmed masters
      are **never** merged, even with identical titles (e.g. a studio album
      and a same-titled live album or re-recording); they stay separate
      album lines, told apart by year.
   2. **Reconcile the rest.** Every other row (no master, or a search-guess
      master) has a candidate key `albumNameKey`. It joins a confirmed-master
      group only if exactly one confirmed-master group in the block has rows
      with the same `albumNameKey` **and** (for a search-guess master) that
      group's master equals the guess. A search-guess whose master differs
      from the name-matching group does not join it.
   3. **Name-only groups.** Rows still unassigned group by `albumNameKey`
      within the block. If the name matches two or more confirmed-master
      groups, the row stays in its own group with a "Possibly owned" /
      "possibly another version" note instead of being merged.
   4. Rows from a master that is credited differently (e.g. "Artist" vs
      "Artist, Orchestra") live in **one** block: the credit used by the
      most rows, ties broken by the earliest year, then the lowest `rowId`.
      Version lines with a different credit show it ("credited: Artist,
      Orchestra"), so viewer search still finds it.
   - **Album line title**: the most common title among the group's
     collection rows (or, with none, its wanted rows); ties go to the
     earliest-year row's title, then the lowest `rowId`.
   - **Album line year**: the earliest non-null year in the group. It is the
     earliest known pressing, not the master's original year, and is
     labelled only as a year.
   - Today's data: no album is split between a master-backed and a
     masterless row, and no name spans two masters, so these rules change
     nothing for the current collection; they exist for future syncs.
3. **Version lines.** One album line per group, then one compact sub-line per
   version, with year · label · format (· country, later) and an
   OWNED/WANTED marker.
   - **Copies are counted by rows.** `copyCount` is the number of copies of
     that *release* and is repeated on every copy's row, so two rows that
     each say `copyCount: 2` are 2 copies, not 4. Rows with the same
     `releaseId` collapse into one line "OWNED ×N", where N is the number of
     rows (and must equal their `copyCount`; a mismatch is logged and the
     row count wins).
   - With version details turned off, the album line shows just counts:
     "OWNED ×2 · WANTED (2 pressings)".
   - In "both" mode, owned and wanted versions of the same album share a
     group. This is the main in-shop payoff: one glance shows "have the 1994
     pressing, want the reissue".
4. **Wishlist cross-source overlaps (display only):**
   - `relatedWishlistLinks` carry a basis and confidence. Rows are collapsed
     only for `certain` or `confident` links (same confirmed release or
     master). The Discogs want then wins, and the local one is noted as
     "also monitored".
   - **`likely` overlaps are never hidden.** Both rows are shown as separate
     version lines; when they land in the same album group (via the
     reconciliation rule), the local line reads "WANTED · any version ·
     monitored (may be the same as above)". When they don't, nothing links
     them visually.
   - Today every local-want master is a search guess, so **no** overlap is
     collapsed; the 1 overlap is shown, not hidden.
   - Local-only wants show the tag "any version" because the user hasn't
     chosen a pressing.
   - The cover gives raw and collapsed totals. Today: "219 wants (206 Discogs
     + 13 monitored; 1 possible overlap shown)". A confident overlap would
     read "218 wants (206 Discogs + 13 monitored; 1 in both lists)".
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
- **Deadlines, cleanup and retry** (one end-to-end budget, not per-step
  timeouts that add up):
  - **Server deadline: 60 s** from request start to the last PDF byte. It
    covers loading rows, building the model and HTML, a cold browser launch,
    `setContent`, font loading and `page.pdf()`. Every Playwright call gets
    the *remaining* budget as its `timeout`.
  - On deadline: close the context; if that doesn't finish within 5 s,
    `browser.close()` and drop the singleton so the next export relaunches.
    Respond **504** JSON "PDF took too long. Try again, or export fewer
    lists".
  - On client disconnect (`req.on('close')` before the response is sent):
    abort the same way and skip the response.
  - On browser crash or launch failure (`browser.on('disconnected')`, launch
    error): drop the singleton and **retry once** automatically if at least
    15 s of the budget remain; otherwise respond 503 "PDF renderer crashed;
    try again". Timeouts are not retried server-side.
  - The single-flight lock is released in `finally` on every path. A test
    proves that after a timeout or crash the next export succeeds, rather
    than getting a stuck 409.
  - **Client timeout: 90 s** per request on `exportPocketList` (override of
    the 30 s axios default), longer than the server deadline, so the user
    sees the server's 504/503 message, not a generic axios timeout. The
    client does not retry automatically; the dialog offers "Try again".
- **Self-contained and safe output.**
  - Render with `page.setContent(html)` in a context with
    `javaScriptEnabled: false`.
  - Abort every request except `data:` URLs via `context.route('**/*', …)`.
    This guarantees no external assets and no file system reads.
  - HTML-escape all user data. Discogs names are untrusted text.
- **Fonts.** Add `@fontsource/noto-sans` (5.3.0, **OFL-1.1**). Its woff2
  subsets cover Latin, Latin-ext, Greek, Cyrillic, Vietnamese, and Devanagari.
  - Inline the needed weights (400, 700) as base64 `@font-face` data URLs.
    Wait for `document.fonts.ready` before `page.pdf()`. That only proves
    the fonts loaded, not that every glyph is covered, so the integration
    test also checks glyph coverage and embedding (see Tests).
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
- **Page box.** Call `page.pdf({ preferCSSPageSize: true, width: '4in',
  height: '8in', printBackground: true, outline: true, tagged: true,
  displayHeaderFooter: true, footerTemplate, headerTemplate: '<span></span>' })`.
  Without `preferCSSPageSize: true`, Playwright's `format`/`width`/`height`
  (default Letter) take precedence over CSS `@page { size }`
  ([Playwright `page.pdf`](https://playwright.dev/docs/api/class-page#page-pdf)).
  The explicit `width`/`height` match the CSS, so a CSS regression still
  yields the same box. The integration test asserts every page is
  288 × 576 pt.
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
  - Fit-to-width scales the 288 pt page to the viewport width: ≈1.35 at
    390 px (iPhone 12–16), 1.30 at 375 px (iPhone SE/mini), 1.25 at 360 px
    (common Android), 1.11 at 320 px (the narrowest we still check). Viewer
    margins shave a little more.
- **Type sizes** — minimums set for the **360 px** case (on-screen size in
  CSS px at 360 / 390):
  - Artist: 13 pt bold (≈16 / 17.6 px).
  - Album: 12 pt (≈15 / 16 px).
  - Version sub-lines and markers: 10.5 pt (≈13 / 14.2 px). The first draft's
    9.5 pt gave only ≈13 px even at 390 px and ≈12 px at 360 px.
  - Letter headings: 20 pt.
  - Line height 1.3. Expect roughly 26–30 lines per page.
  - At 320 px, sub-lines are ≈11.7 px: readable with a zoom, which we accept
    for the narrowest phones. If Phase 4 finds 360 px too small, switch to
    the 3.5 in page (Open Decisions 7) rather than shrinking type.
- **Single column. No data tables** (layout tables only for repeating headers, below). Long names wrap (`overflow-wrap: anywhere`
  only as a last resort for unbroken tokens). Nothing is truncated except
  notes, which are cut at ~100 characters with "…".
- **Page 1 (cover + index):**
  - Title "Listenography Pocket List".
  - List type, e.g. "Wishlist + Collection".
  - Generated date and time (local).
  - Counts: albums, entries, owned, wanted, and owned-version flags by tier.
  - Data freshness: "Wishlist synced 4 Oct 2026 · Collection cached 11 Oct 2026".
  - Legend.
  - Index grid of 28 cells (`#`, A–Z, Other), each **≥ 34 × 34 pt**
    (≈44 px at 375 px, ≈42 px at 360 px; the first draft's 28 pt was ≈38 px),
    7 per row, 4 rows, with 2 pt gaps (7 × 34 + 6 × 2 = 250 pt of the 252 pt
    content width). The whole cell is the link.
- **Letter section.** An `h2` letter heading (used for the outline) plus a
  small "Index ↑" link. `break-after: avoid-page`.
- **Artist block.** The artist heading is a styled `p`, **not** a heading
  element, so the outline isn't flooded with 1,000 entries. Each artist
  heading and its first album group sit together (`break-after: avoid-page`
  on the heading).
  - **Continuation headers.** A block that spans pages repeats its artist
    heading at the top of each continuation page. Implementation: the block
    is a one-column `<table role="presentation">` whose `<thead>` holds the
    heading, since Chromium repeats `thead` rows on every printed page a
    table spans. The repeated copy is identical (CSS can't add "cont." only
    on repeats). The Phase 2 spike confirms this in the pinned Chromium; if it
    doesn't hold, the fallback is that the first version line on a new page
    repeats "Artist — Album" in the sub-line style.
  - **No orphaned version lines.** An album line and its first version line
    never split (`break-after: avoid-page` on the album line); every line is
    `break-inside: avoid`; groups of ≤ 6 version lines are
    `break-inside: avoid-page` as a whole; larger groups may split, with
    `orphans: 2; widows: 2`, and the repeated artist heading plus the album
    title repeated in the continuation's first line (same mechanism, nested
    `thead`, or the fallback above).
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
    - `artistRaw`, `artistDisplay`, `artistIdentityKey`, `albumNameKey`,
      `title`, `year`, `formats`, `labels`
    - `masterId`, `masterIdSource`, `releaseId` (always `null` for local
      wants; never read from `LocalWantItem` here)
    - `copyCount` (collection; per release, repeated on each copy row),
      `notes` (wants only in the MVP)
    - `source`, `ownedMatch`, `ownedMatchConfidence`, `ownedCollectionLinks`,
      `relatedWishlistLinks`
    - meta `collectionCachedAt` (oldest page), `collectionCache` (status,
      pages read/expected), `wishlistUpdatedAt`
  - The article list is an internal constant `['The']` passed to the
    collation functions, not a user option in the MVP.
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
   - `sectionFor(sortKey)` (fold table + `\p{N}` rule; no collator)
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
   crash detection) and `renderPdf(html, { deadline, signal }): Promise<Buffer>`,
   which applies the remaining budget to each step and the `page.pdf()`
   options above. It has a narrow interface, so tests can swap in a fake.
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
| `flagOwned` | `true` / `false` | `true` |

Responses:

| Status | When | Body |
|---|---|---|
| 200 | Success | `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="listenography-pocket-list-{wishlist\|collection\|wishlist-collection}-{YYYY-MM-DD}.pdf"`, `Cache-Control: no-store`, PDF body |
| 400 | Unknown values | JSON error (`ApiResponse` shape) |
| 409 | Collection-only export requested but the collection cache is `missing` | Message: "Sync your collection first". For wishlist exports, a missing cache only disables owned flags (`unknown`). A `partial` cache is **not** an error: the PDF is produced with the cover warning |
| 409 | An export is already running | JSON error |
| 422 | Nothing to export (0 rows after filtering) | JSON error |
| 503 | Renderer unavailable (browser missing), or crashed twice | Install hint / "try again" |
| 504 | The 60 s end-to-end deadline passed | "PDF took too long" |

A GET without side effects fits, because it only reads caches. It is subject
to the global `/api/` rate limiter and the existing token auth
(`requireApiToken`); the route tests cover both the token-off and token-on
cases.

---

## Frontend

- **`src/renderer/services/api.ts`**: add
  `exportPocketList(options): Promise<Blob>`, modelled on `exportBackup()`
  (`responseType: 'blob'`) on the shared axios instance, so the token
  interceptor applies, with a per-request `timeout: 90000`. On error, read
  the blob as text and parse the JSON `error` so the 409/422/503/504 messages
  reach the user. Add `getExportMeta()` for `GET /api/v1/export/meta`.
- **New `src/renderer/components/PocketListExportDialog.tsx`** + `PocketListExportDialog.css`. It uses the `Modal` UI component and `Button`, with no inline styles and design tokens only. Controls:
  - List type: Wishlist / Collection / Both (radio). Preselected from the entry point.
  - Wishlist sources: "Discogs wantlist" and "Monitored (local) wants" checkboxes. Shown only when the wishlist is included.
  - Details: "Format", "Pressing (year, label)", "Notes" checkboxes.
  - "Flag wanted albums I already own a version of" (checkbox, on by default).
  - A data-freshness line from `GET /api/v1/export/meta` (created in
    data-export Phase 1), plus a hint: "Sync first for an up-to-date list".
    A partial collection cache shows "N of M collection pages cached". No
    auto-sync.
  - "Download PDF" button: shows progress, saves via `URL.createObjectURL`
    with the server's filename (via the shared `downloadBlob` helper, created
    here if data-export Phase 2 hasn't landed), then shows a short success
    note: "Move it to your phone with AirDrop, email, or a cloud drive."
    Errors show the server message and a "Try again" button.
- **Entry points:**
  - `WishlistPage`: a "Pocket List" `Button` with a lucide `FileDown` icon
    (16 px, `aria-hidden`), in both the standalone `page-header-actions` and
    the embedded `wishlist-actions` row. The Marketplace → Wishlist tab
    renders `<WishlistPage embedded />`.
  - `CollectionPage`: the same button in the `collection-header`, next to the
    title and stats.
  - Settings → Backup "Export your data" card (data-export-plan.md Phase 2):
    a "Pocket List (PDF)" row that opens the same dialog. **Not required for
    the MVP.** Whichever lands second adds the row: if the card exists when
    this plan ships, add it here (S); otherwise data-export Phase 2 adds it.
    Don't build a second UI.
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
| 0 | **Dependency:** data-export-plan.md **Phase 1 only**: `exportDataService` rows with match confidence, identity keys, cache completeness, plus the `routes/export.ts` skeleton with `GET /meta`. If it hasn't landed, implement it **inside that service following its spec**, never as a parallel loader. Not needed: data-export Phase 2 (`/datasets`, file downloads, Settings card). | (counted in data-export plan, ~1–1.5 days) |
| 1 | Collation (buckets, fold table, comparator) and model (identity blocks, conservative album reconciliation, copy counting, overlap handling) with full unit tests. Shared option types. | ~1.5 days |
| 2 | HTML template and print CSS (repeating headers, break rules), fonts dependency, Chromium renderer with deadline/cleanup/crash retry, `pocketListService`, `/pocket-list` route, error statuses, auth-on route tests. Move `playwright` to `dependencies`. Includes a half-day spike on `thead` repetition and the page box. | ~2 days |
| 2b | PDF integration test (PDF.js helper, CDP font check, link/outline/URI assertions) and the browser-enabled CI step. | ~1 day |
| 3 | `ApiService.exportPocketList` / `getExportMeta`, `downloadBlob` if missing, dialog, two page entry points, CSS. | ~0.5 day |
| 4 | Validation on real data and phones (strategy below). Tune the type scale and page size. Record the file sizes. | ~0.5–1 day |
| Later | Interactive HTML export (after the phone-open checks), surname/article overrides, two-part layout, owned-match widening tiers, discard filtering, more filters. | M–L |

Overall MVP is roughly **5.5–6 focused days after data-export Phase 1** (about
7 including that phase). The first estimate of 2–3 days left out the
deadline/crash handling, the PDF verification harness, CI wiring and the
grouping edge cases.

## Acceptance Criteria

1. From the Wishlist and Collection pages, the user can export wishlist,
   collection, or both (merged), and gets a `.pdf` named as specified. This
   works with the API token enabled.
2. Entries are grouped under artist headings inside sections ordered `#`,
   A–Z, Other, sorted artist then album, following the rules above. "The" is
   ignored for sorting but shown. "(N)" suffixes are not shown, except as the
   dimmed "Discogs #N" tag that tells apart two different artists with the
   same name; such artists are never merged.
3. Owned and wanted are distinguished by text markers. Wording follows
   `ownedMatchConfidence`: "OWNED: this pressing" only for `certain` (never
   for a local want), "OWNED: another version" only for `confident`, and
   everything `likely` reads "Possibly owned".
4. Multiple pressings and copies of one album sit in one group. Different
   confirmed masters are never merged. Copies are counted by rows (two rows
   with `copyCount: 2` show "OWNED ×2"). Discogs and local wants of the same
   album collapse only on a `certain`/`confident` link; `likely` overlaps
   stay visible.
5. The cover shows the generated timestamp, list type(s), raw and collapsed
   counts, data freshness dates, and a warning when the collection cache is
   missing or partial.
6. Every page is 288 × 576 pt. At fit-to-width on a 360 px-wide phone,
   version lines are ≥ 13 px and index cells ≥ 42 px; nothing needs
   horizontal scrolling. Artist headings repeat on continuation pages, and no
   page starts with a version line that has no heading above it.
7. Viewer search finds artist and album names typed with their exact
   spelling, including accented ones. Accent-insensitive search is
   best-effort and viewer-dependent (recorded in Phase 4). The index links,
   including `#` and Other, and the outline bookmarks land on the right
   pages.
8. The PDF opens and renders correctly with the laptop off and the phone in
   airplane mode. It contains no external actions or URIs, all fonts are
   embedded, and no glyph renders as tofu.
9. If Chromium is missing or crashes, the user sees an actionable error
   (503), not a crash. A render that exceeds 60 s returns 504 and the next
   export works. Concurrent exports are refused cleanly (409).
10. No data files are written, and no Discogs/Last.fm calls are made during
    an export.

---

## Tests (meaningful, not exhaustive)

**`tests/backend/pocketListCollation.test.ts`** (pure, fast)

- Leading "The" ignored ("The Beatles" between "Beach House" and "Beck").
  "The The" sorts as "The". "A Tribe Called Quest" stays under A, and moves
  to T when the (internal) article list includes "A".
- Punctuation before article: “The Beatles” (curly quotes) and
  "'The Beatles'" go to B; "...And You Will Know Us" → A; "!!!" and "+/-"
  → `#`.
- "(2)" suffix artists sort next to the plain name, ordered unsuffixed,
  (2), (3), and stay separate blocks.
- Buckets: "Björk", "Émilie Simon", "Ólafur Arnalds" → B, E, O. Every fold
  table entry pinned (Æ → A and sorts as "AE"; Ø → O; Ł → L; ß → S; Þ → T).
  Devanagari and CJK names → Other, after Z. An unmapped Latin letter →
  Other. No "Other scripts" bucket exists.
- Numbers: "2Pac" < "10,000 Maniacs" (numeric) under `#`, which comes first.
  Fullwidth "２", Devanagari "४" and "Ⅻ" first characters → `#`.
- Section rank dominates: no input orders an entry outside its section.
- Tie-breaks: "AC/DC" vs "ACDC" and "Æther" vs "AEther" order by code point;
  comparator is total; shuffled input gives identical output.

**`tests/backend/pocketListModel.test.ts`** (pure)

- Groups by confirmed master. Two confirmed masters with the same title
  stay two album lines.
- A masterless collection row joins the single confirmed-master group with
  the same `albumNameKey`; with two candidate groups it stays separate.
- A local want with a search-guess master joins a group only when both the
  master and the name agree.
- Differing credits for one master: one block, chosen by the stated
  tie-breaks, with "credited:" on the odd version lines.
- Title and year selection and their tie-breaks.
- Copy counting: two rows of one release, each `copyCount: 2` → "OWNED ×2".
- Owned and wanted versions of one album share a group in "both" mode.
- Overlaps: a `confident` related link collapses (Discogs want wins, count
  "1 in both lists"); a `likely` link keeps both rows and reports "1
  possible overlap shown". Today-shaped fixture: 206 + 13 → "219 wants".
- Every (`ownedMatch`, `ownedMatchConfidence`) pair maps to the specified
  wording. A local want can never produce "this pressing". `unknown` gives
  no markers plus the missing/partial cover warning.
- Negative name fixtures that must stay separate albums: Devanagari "क" /
  "का" / "कि" / "कु" by one artist (depends on the upstream `albumGroupKey`
  fix), "春 1" / "夏 1", "!!!" / "...".
- Non-vinyl format is shown even with format details off.
- Option filtering: sources excluded, details off, lists subset.
- Empty input gives a model the route turns into 422.

**`tests/backend/pocketListHtml.test.ts`** (pure)

- HTML-escapes `<`, `&`, and quotes in names.
- Contains no `<script>`, no `http(s):` URLs, and no `src=` other than `data:`.
- One `h2` per section; every index link (`sec-num`, `sec-a`…, `sec-other`)
  matches a section id; empty buckets are not links.
- Artist blocks use a `thead` for the heading; long groups carry the
  continuation markup.

**`tests/backend/routes/export.pocketList.test.ts`** (supertest, fake renderer)

- Headers: content type, disposition filename per list combination,
  `no-store`.
- 400 on bad query. 409 when there's no collection cache (collection-only).
  200 with a warning flag when the cache is partial. 422 on an empty
  result. 503 when the renderer reports a missing browser. 409 on concurrent
  export.
- Deadline: a fake renderer that never resolves → 504 within the budget, the
  lock is released, and the next request returns 200. A fake that crashes
  once → retried, 200; crashes twice → 503.
- Client disconnect aborts the render (fake observes the abort signal).
- **Auth:** with `requireApiToken` enabled, no token → 401, valid bearer
  token → 200 PDF.

**`tests/integration/pocketListPdf.test.ts`** (real Chromium)

Skipped locally, with a visible warning, when the Playwright browser isn't
installed. **Required in CI**: the existing E2E job in
`.github/workflows/ci.yml` (which already runs `npx playwright install
--with-deps chromium`) gets a step
`POCKET_LIST_PDF_REQUIRED=1 npx jest tests/integration/pocketListPdf.test.ts`;
with that variable set, a missing browser **fails** the test instead of
skipping it.

- Render a fixture with about 40 tricky names: accents, Devanagari, CJK,
  symbols ("★"), very long titles, an artist block longer than one page, a
  group straddling a page break, and entries in `#` and Other.
- Inspect with PDF.js (`pdfjs-dist` devDependency, run via a small ESM
  helper subprocess to avoid CJS/Jest ESM friction). Assert:
  - **Page box:** every page's MediaBox is 288 × 576 pt (± 0.5).
  - **Order and tokens:** names appear in the expected order; "OWNED" /
    "WANTED" are present; extracted text of each fixture name equals its
    NFC input (proves ToUnicode mapping).
  - **Fonts:** every font object is embedded (no font with a missing font
    file), and only Noto Sans plus the expected system fallbacks appear.
  - **Glyph coverage:** before `page.pdf()`, a CDP session
    (`CSS.getPlatformFontsForNode` on every entry node) lists the fonts that
    actually drew each node; fail if any node used a last-resort font (e.g.
    macOS "LastResort") or a font outside the allowed set. This catches tofu
    that `document.fonts.ready` cannot.
  - **Internal destinations:** every link annotation has an internal
    destination that resolves (`getDestination` → `getPageIndex`) to the page
    whose text starts with that section's heading, including `#` and Other.
    Every outline item resolves the same way, one per non-empty section.
  - **No external actions:** no annotation other than internal `Link`s; no
    `URI`, `Launch`, `GoToR`, `SubmitForm` or `JavaScript` actions; no open
    action, document JavaScript (`getJSActions()` empty) or attachments. A
    raw-byte scan for `/URI`, `/JS`, `/Launch` and `http` is a second check.
  - **Continuation:** on each page after the first page of a long block, the
    first text line is the repeated artist heading; no page begins with a
    version line.

Frontend: `tests/frontend/…/PocketListExportDialog.test.tsx` checks:

- The option payload passed to `exportPocketList`.
- Wishlist-source controls are hidden for collection-only exports.
- Error messages are shown from blob JSON errors (409/503/504), with
  "Try again".
- The partial-cache freshness line from `getExportMeta()`.

`tests/frontend/services/api.endpoints.test.ts` (extend; `apiToken.test.ts`
covers the token interceptor): `exportPocketList` uses the shared
axios instance (token header attached when set), `responseType: 'blob'` and
`timeout: 90000`.

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
   - a Discogs and local want of the same album, once with a `confident` and
     once with a `likely` link (collapsed vs both shown)
   - a same-name, different-master pair (must show "Possibly owned", not
     "OWNED", and stay two album lines)
   - a local want whose stored id equals a collection release id (must not
     show "this pressing")
   - "Artist (2)" and "Artist (3)" with the same album title (two blocks)
6. **PDF text search.** On each viewer below, search for:
   - an accented name with and without the accent ("Bjork" → "Björk").
     The exact spelling must work everywhere; accent-insensitive search is
     viewer-dependent, so record which viewers support it rather than
     failing on it
   - a multi-word album
   - "WANTED"

   Record any viewer that fails. Ligature or hyphen breaks count as bugs.
7. **Visual readability on a phone.** Transfer the real-sized export by
   AirDrop and by email. Test:
   - iOS Files/Quick Look, Apple Books, Android Google Drive viewer, and
     Files by Google
   - airplane mode
   - fit-to-width legibility at arm's length on at least one ~360 px Android
     and one 375 px (SE/mini-class) iPhone, plus a 390–430 px phone
   - tap targets on the index, including `#` and Other
   - a long artist block across pages (repeated heading, no orphaned
     version lines)
   - outline availability (note which viewers show it; the in-document index
     must suffice when they don't)
   - grayscale / smart-invert legibility
   - scroll performance on the large fixture

   Save screenshots alongside the PR, not in the repo.
8. **Regression guard.** Pure and snapshot tests run in `npm test`; the PDF
   integration test runs in `npm test` when a browser is present and is
   **required** in the CI E2E job. Repeat manual phone checks
   only when layout CSS or the renderer changes.

---

## Open Decisions

1. **Leading articles beyond "The".** *Settled for the MVP:* only "The" is
   ignored, with no option. "A"/"An" stripping and other articles are Later
   enhancement 3.
2. **"Both" layout.** *Settled for the MVP:* one merged A–Z, so the user
   sees owned and wanted together at the bin. A two-part option is Later
   enhancement 4.
3. **Discard pile.** *Deferred.* Hiding sold/traded copies still in the
   Discogs cache needs per-copy ids: `DiscardPileItem.collectionItemId` is
   really the release id, so with two copies of one release it can't tell
   which copy went, and hiding by release would hide the copy still owned.
   Upstream `owned-*` statuses would also still count discarded copies,
   making the list inconsistent. Revisit after data-export Phase 4 captures
   `instance_id`. Cost of waiting today: none (36 discards, all
   `traded_in`, none still in the collection cache).
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
  `getSnapshotMeta`) and `GET /api/v1/export/meta` land as specified in
  data-export-plan.md Phase 1, including `masterIdSource`, match
  confidences, identity keys and `collectionCache`. Its
  rows come in machine order, and all human collation happens here. If a
  field this plan needs is missing (e.g. `country`), it is added there
  additively, not loaded separately here.
- Export uses cached data only. Syncing remains a separate, explicit user
  action.
- The local-want `releaseId` bug (it stores a master id) is fixed separately
  as tech debt; this plan is correct before and after that fix because the
  shared layer never exports that value as a release id.
- Node's bundled full ICU is present (it is the default since Node 13; the
  repo requires Node ≥ 22).
