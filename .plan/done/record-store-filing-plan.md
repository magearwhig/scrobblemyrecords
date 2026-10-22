# Record-Store Filing for the Pocket List

Status: Complete -- 2026-10-22 (branch feat/pocket-list, committed locally), follows done/pocket-list-export-plan.md

**Built as planned, plus:**
- **Name key folding:** `filingNameKey` also turns Unicode hyphens and dashes into ASCII and reads " & " as " and". MusicBrainz writes Run‐DMC with U+2010 and has "Belle and Sebastian".
- **Collaboration fallback:** a not-found collaboration files under its first artist's own name when that artist has no filing.
- **Peer reviewer fixes:**
  - The job waits for both queues to settle before releasing its lock.
  - Override saves run one at a time.
  - The status counts a due lookup as missing.
  - MusicBrainz retries take a rate-limit slot.
  - The status component keeps polling after a start.

**Phase 4 (real-data check on a scratch copy):**
- **Coverage:** 590 artists and 1,318 masters. The first run took about 25 minutes, with 25 transient 429/503 failures that the next run picked up.
- **Matches:** 548 artists found on MusicBrainz and 42 filed by name: 30 not found, 9 ambiguous, and 4 "none of these" from release tracking.
- **Movement:** 107 artists changed bins, almost all people moving to their surname (Bob Dylan → D, Elliott Smith → S, Neil Young → Y), plus 22-20s → T, $uicideboy$ → S and A Tribe Called Quest → T.
- **Sections:** # is now empty. Soundtracks holds the two Various soundtracks; Purple Rain stays under Prince.
- **PDF:** 140 pages, 2.2 MB.

## Goal

Sort the Pocket List the way a record store files its bins.

## Decisions (from the user, 2026-10-22)

| Question | Answer |
|----------|--------|
| People vs bands | People by surname, bands by first word, using MusicBrainz sort names (option A) with a manual "file under" override (option D). No name-guessing heuristic. |
| Heading text | Print the natural name ("Elliott Smith"); only the filing moves (under S) |
| Albums within an artist | Oldest to newest, by original release year |
| Various Artists / soundtracks | Their own sections at the end |
| Numbers | Spelled out ("10,000 Maniacs" files under T) |

## Filing rules

1. **Artist sort name**, first match wins:
   1. The user's override, keyed by artist name (see "Keys").
   2. The MusicBrainz `sort-name` from the filing cache.
   3. Today's rule: the display name.
2. **Articles:** a leading "The", "A" or "An" is dropped, and so is a trailing ", The" / ", A" / ", An" (the MusicBrainz style, as in "Wedding Present, The").
3. **Numbers:** a leading number in the sort name is spelled out in English, so "10,000 Maniacs" becomes "Ten Thousand Maniacs" and "2Pac" becomes "Two Pac".
   - A four-digit number from 1100 to 1999 or 2010 to 2099 is read as a year: "The 1975" becomes "Nineteen Seventy-Five".
   - 2000 to 2009 read as "Two Thousand (N)".
   - Anything odd is the override's job.
4. **Comparison is a tuple, in this order:**
   - Section rank first.
   - Then the *head*: the sort name up to its first comma, after numbers are spelled out and articles removed.
   - Then the *tail*: the text after that comma.
   - Then a collaboration rank: 0 for solo, 1 for a collaboration.
   - Then the rest of a collaboration's credit.
   - Then the existing identity tie-breaks.

   So "Smith, Elliott" and "Smith, Patti" (head "Smith") come before "Smiths", which comes before "Smith Westerns".
5. **Collaborations:**
   - **How credits are joined:** Discogs joins multiple artists with ", ". A "&" or "and" is always inside one artist's name (Simon & Garfunkel, Prince And The Revolution), so it is never split.
   - **Whole credit first:** override, then MusicBrainz.
   - **Splitting:** only when the whole credit's MusicBrainz result is `not-found` (never when it is missing, ambiguous or failed) and it has ", " parts. The credit then files under the first part, ranked as a collaboration after that artist's solo records.
   - **Refresh:** a not-found multi-part credit also queues its first part.
6. **Sections:**
   - `#` now holds names made of punctuation, such as "!!!", and numerals that aren't ASCII digits.
   - A–Z, then Other.
   - **Various Artists:** a Discogs "Various" credit, or "Various Artists" from Last.fm, without a soundtrack style.
   - **Soundtracks:** a Various credit whose release has style Soundtrack, Score or Video Game Music. Single-artist soundtracks stay in the artist's bin (Purple Rain under Prince).
   - **Placement is decided per album group, after grouping:**
     - A group goes to these sections when its block's heading is Various.
     - It goes to Soundtracks if any of its collection rows has a soundtrack style.
     - Wishlist rows carry no styles, so a Various want with no owned copy goes to Various Artists.
   - Both new sections sort by album title, with a leading article dropped, then year.
   - `sectionFor` finds Other by id, no longer by assuming it is the last bucket.
7. **Album order within an artist:**
   1. Original year: the lower of the cached Discogs master year (only for a group's *confirmed* master, never a local want's search guess) and the group's earliest row year.
   2. Then title, then rowId.
   - Unknown years go last.
   - The album line shows the original year; version lines keep their pressing year.

## Keys

- **`filingNameKey(name)`:**
  - The steps: NFC, Discogs "(N)" suffixes stripped, curly apostrophes and Unicode hyphens made ASCII, " & " read as " and", trimmed, whitespace collapsed, lowercased. "The" is kept, so "The The" stays distinct.
  - Two Discogs artists with the same name share one key, and so one filing. That's acceptable, because a store files them together too.
- **Overrides and MusicBrainz cache entries:** both use this key.

## Data

| File | Contents | Writer |
|------|----------|--------|
| `data/cache/artist-filing.json` | per name key: `{ name, status: 'found', sortName, type, mbid, via: 'mbid-map' \| 'search', fetchedAt }` or `{ name, status: 'not-found' \| 'ambiguous' \| 'none', fetchedAt }` | filing refresh job |
| `data/cache/master-years.json` | per Discogs master id: `{ year, fetchedAt }` (year null when Discogs has none) | filing refresh job |
| `data/mappings/artist-filing-overrides.json` | `{ schemaVersion, overrides: [{ key, artist, fileUnder, updatedAt }] }` | Settings UI; in backups |

**MusicBrainz lookup for one name:**
1. **Tracker mapping:** a release tracker mapping in `releases/artist-mbid-map.json` counts only when its `discogsArtistName` has the same filing key. The tracker's own `normalizeArtistName` strips "The" and punctuation, which is too loose for this.
   - **User chose "none of these"** (null mbid): recorded as `none`, with no search.
   - **Has an mbid:** `GET /artist/{mbid}`. It is used if the user confirmed it, or if MusicBrainz's canonical name equals ours. Otherwise the lookup falls through to search.
2. **Search** (`artist:"…"` with `\` and `"` escaped, limit 25):
   - **Exact candidates** are those whose canonical `name` equals ours (NFC, case and whitespace folded, curly apostrophes made straight). Alias-only hits don't count.
   - **None:** recorded as `not-found`.
   - **All agree** on sort-name and type: `found`. The entry stores that filing value, plus an mbid only when there is a single exact candidate.
   - **They disagree, or the result was cut off** while still exact: recorded as `ambiguous`.
3. **Errors:** network errors are not cached.
4. **Retries:**
   - `not-found` and `ambiguous` are retried after 30 days.
   - A `mbid-map` entry is refetched when the tracker's mbid for that name changes.
   - `refresh({ full: true })` refetches everything.
5. **Rate limit:** shared with release tracking through the one `MusicBrainzService`, whose limiter now reserves slots so concurrent callers can't both go at once.

**Master years:** `GET /masters/{id}`, using the shared Discogs token bucket. Failed fetches aren't cached.

## Refresh job

- **Where it runs:** `RecordStoreFilingService.refresh()` runs in the background, one at a time, and can be cancelled.
- **What it fetches:** every artist name and master id in the current collection and wishlist rows that the cache lacks.
- **Two queues:** MusicBrainz (1 request/s) and Discogs run in parallel.
- **Cost:** a first run is about 600 artists (around 10 min) and about 1,150 masters (around 20 min). Later runs fetch only new items.
- **Saving:** the cache is saved every 25 items, so a stop loses little.
- **Started by:**
  - the "Update filing data" button in the Pocket List dialog;
  - the same button on the Settings card.
- **Never automatic:** the export never fetches, and it uses whatever is cached.

## API (`/api/v1/filing`)

| Endpoint | Purpose |
|----------|---------|
| `GET /status` | counts (artists cached / missing / not found, masters cached / missing), job progress |
| `POST /refresh` | start the job (409 if running) |
| `POST /cancel` | stop the job |
| `GET /artists` | every artist in the lists with the resolved file-under and its source (`override`, `musicbrainz`, `default`) |
| `PUT /overrides` | `{ artist, fileUnder }` (an empty fileUnder deletes it) |

## UI

- **Pocket List dialog:**
  - A one-line status: "Record-store filing: 540 of 612 artists, 1,100 of 1,139 original years", with an Update button and progress.
  - The export still works without the data, falling back to today's rules.
- **Settings > Mappings, new "Record-store filing" card:**
  - The artist list with "Files under", its source, and an edit field.
  - A "Needs review" filter for `default` sources.
  - The Update button.
- **PDF:**
  - The legend note is rewritten.
  - The index gains wide "Various" and "Soundtracks" cells.

## Phases

1. Collation: sort names, articles, numbers, word-aware comparison, the new sections, and album order by original year. Pure and unit-tested; the model takes a `FilingLookup`.
2. Filing service, caches, job and routes; the export reads the snapshot.
3. Dialog status and Settings card.
4. Real-data check on a scratch copy: a diff of which artists move, and a PDF look.

## Out of scope

- Collection page and crate sorting.
- Per-release overrides.
- Non-English number words.
