# Stats page review (2026-11-13)

Review of `#stats` (`src/renderer/pages/StatsPage.tsx`) as it stands on `feat/label-detail-page`,
with the new Top Labels list. Checked in Chrome against a copy of the real data (66,726 plays
since 2005-02-13, 5,368 albums in history, 1,197 collection items) at 1728 px (the owner's
window), 1280 px and 390 px, light and dark. Screenshots are in
`stats-page-review-2026-11-13/` (numbered files `01-` to `27-`; the 1280 and 390 views are
framed side by side in `15-` to `25-`). Every finding was checked against the source.

Earlier reviews: [site-review-2026-10-23.md](site-review-2026-10-23.md) (round 1) and
[site-review-2026-10-24.md](site-review-2026-10-24.md) (round 2). Ideas already listed there are
cited as "already N9" etc. and not re-proposed.

Status key: **open** · **done** · **skip**

## Rules for any implementation

- No inline styles. Page styles go in `StatsPage.page.css` (or the component's `.css`); colours,
  sizes and radii come from the design tokens in `styles.css`; icons are `lucide-react`, never
  emoji. Chart colours use `--chart-color-n`, not literals.
- Write the failing test first (`tests/frontend/pages/StatsPage.test.tsx`,
  `tests/backend/statsService.test.ts`), see it red, then implement.
- Keep this file, `.plan/README.md` and the root README current in the same PR.
- Run the Stats page against a data copy (never `data/`) and look at it at 1728, 1280 and
  390 px before calling a layout change done.

## 1. Layout findings

The page today, top to bottom: stat cards · Scrobble Sources + Listening Timeline · Listening
Activity heatmap · Listening Patterns (hourly radar, day of week) · On This Day · Your Music
DNA · Taste Drift · Collection ROI · Top Artists / Albums / Tracks / Labels · Milestone
Progress · Dusty Corners · Rankings Over Time. Twelve sections, 5,584 px tall at 1728 px.

| # | Finding | Sev | Screens | Status |
|---|---------|-----|---------|--------|
| L1 | **The top lists are the eighth section.** The thing the owner opens the page for (what have I been playing, which labels) starts ~2,900 px down, after four lazy charts and an always-empty ROI card. Scanning order is cards → sources pie → timeline → heatmap → patterns → on this day → genres → drift → ROI → **top lists**. | High | 06, 07 | open |
| L2 | **Phone: artist and album names vanish from the top lists.** At 390 px `.ranked-row-name-text` measures 0 px: `RankedRow.css` gives the OWNED badge `flex-shrink: 0` and the name `min-width: 0`, so the badge wins and the name is clipped to nothing. Top Albums shows "OWNED / Ben Har…" with no album title. | High | 27, 21, 22 | open |
| L3 | **Collection ROI is always empty.** `getCollectionROI` (`statsService.ts:3701`) reads `collection/releases.json`, a file nothing writes; the collection lives in `collections/<user>-page-N.json` and every other stat loads it through `getAllCachedCollectionItems`. It also needs the value cache, which only exists after a scan. The card still takes 190 px and a tab control. | High | 06, 20 | open |
| L4 | **Scrobble Sources is a two-slice pie (95 % / 5 %) in a 405 px card.** One number ("5 % scrobbled through this app") in a third of the width. The endpoint also re-reads all 562 session files on every call (0.27–0.38 s). | Med | 02, 16 | open |
| L5 | **Heatmap uses about 55 % of its card.** Cells are fixed at 14 px (`CalendarHeatmap.css:82`), leaving ~500 px empty on the right at 1400 px content width; the first two month labels overprint as "Dedan". On a phone it opens on January and needs a sideways scroll to reach today. | Med | 02, 03, 17 | open |
| L6 | **On This Day is the stretched-row pattern.** Each year is a full-width card with the album on the left and "12 plays" 1,000 px away on the right; six years stack to ~1,100 px. | Med | 04, 18 | open |
| L7 | **Listening Patterns: a 220 px radar in a 660 px card.** The spiky hourly radar is hard to read at any size; half the card is margin. Day of Week is fine but says little the heatmap doesn't. | Med | 03, 17 | open |
| L8 | **Genres: two cards, one message.** Music DNA uses a hard-coded saturated palette (`GenreTreemap`, not `--chart-color-n`; it clashes with the amber theme in both modes) and is built from 20 artists while the copy says 50. Taste Drift draws ten rainbow lines where one genre sits at 30–45 % and nine are noise under 15 %. On a phone the treemap labels overflow their tiles and the drift legend wraps to four lines. | Med | 05, 12, 19 | open |
| L9 | **Rankings Over Time loads eagerly.** `RankingsOverTime` fetches on mount (136 KB, 0.75 s) even though it's the last section; every other heavy section uses an `IntersectionObserver`. Names arrive lowercase ("aesop rock", "the wombats") because the race doesn't go through `toDisplayName`. | Med | 10, 25 | open |
| L10 | **Milestone Progress is a thin full-width bar and a date row.** 150 px for "66,023 of 75K" and six dates. | Low | 09, 23 | open |
| L11 | **Dusty Corners has two exits and a ragged grid.** "See all →" inside the card and a bare "View all in What to Play" button outside it, unstyled against the page background; at 1280 px the `auto-fill` grid wraps 5 + 3 with the right half empty. What to Play already owns this list. The split into "never played" vs "previously played" is already an open improvement in site review 1. | Low | 09, 24 | open |
| L12 | **Stat cards at 1280 px wrap 4 + 2.** `auto-fit, minmax(200px, 1fr)` leaves a half-empty second row; on a phone six full-height cards (~1,000 px) come before any chart. | Low | 15, 26 | open |
| L13 | **Three views of the same twelve months.** Timeline defaults to "12 Months", the heatmap to this year, Rankings Over Time to "Last year". Nothing on the page shows the 21-year span by default. | Low | 02, 10 | open |
| L14 | **Mixed heading levels.** Listening Patterns and Rankings Over Time are bare `h2`s with their own cards inside; every other section is an `h3` card. Top list period selectors wrap to three lines beside a four-line description on a phone (`21`). | Low | 03, 10, 21 | open |

### Fixes

- **L1 (order).** Move `stats-top-lists-row` (and the unresolved note) directly under the stat
  cards. Everything below it becomes the "explore" half of the page and can load lazily. The
  proposed order is in section 2.
- **L2 (phone names).** In `RankedRow.css`, below a container width of ~480 px move the badge
  out of `.ranked-row-name` onto the subtitle line (or under the name), and give
  `.ranked-row-name-text` `flex: 1 1 auto; min-width: 6ch`. Shorten the badge to the count
  plus a `Disc3` icon on narrow containers. Add a test that renders a `TopList` at 390 px and
  asserts the name text is non-empty and visible. Same place: on narrow containers put the
  period selector under the title as a single `<select>` instead of eight wrapped buttons.
- **L3 (ROI).** Load the collection with the same helper as the rest (`getAllCachedCollectionItems`
  via `loadCollection` in `routes/stats.ts`, or inject it into `StatsService`). When there is
  no value cache, render a one-line call to action ("Run a value scan in Collection Analytics to
  see plays per dollar") instead of a tabbed 190 px card, or hide the section. Test with a
  fixture collection in the paged layout.
- **L4 (sources).** Drop the pie. Put "5 % of plays scrobbled through this app" as the
  sub-line of the All Time card, or as a thin two-segment bar in the Listening Timeline header.
  Cache the source breakdown in the warm cache keyed on the session list fingerprint.
- **L5 (heatmap).** Size cells from the container: `grid-auto-columns: minmax(10px, 1fr)` with
  the 53-column grid filling the card, or compute `cell = (cardWidth − 40) / 53` and cap at
  18 px. Skip a month label when the previous label is fewer than three cells away. On a phone
  scroll the container to the current month on mount.
- **L6 (On This Day).** `grid-template-columns: repeat(auto-fill, minmax(300px, 1fr))` of year
  cards; inside each, compact rows (cover 32 px, title/artist, count right beside them), show
  three albums and "+n more". At 1400 px that is four years per row, ~300 px tall.
- **L7 (patterns).** Replace the radar + bars with one 7 × 24 punch card (idea 6) in a card that
  sits beside the timeline. Keep the two insight sentences under it.
- **L8 (genres).** One "Genres" card with a treemap / drift toggle. Treemap colours from
  `--chart-color-1..10` (the amber-led chart ramp already used by Taste Drift's CSS
  variables). Drift as a stacked area of the top five genres plus "other", so the shares sum
  to 100 % and the eye reads composition, not ten crossing lines. Fix the copy to the real
  artist count.
- **L9 (rankings).** Wrap the fetch in the same `IntersectionObserver` pattern as Genre /
  Taste Drift / ROI; run names through `toDisplayName`.
- **L10 (milestones).** Fold into the All Time card: "66,023 · 8,977 to 75K" with a 2 px
  progress line under the number. Milestone dates move to a tooltip or to Wrapped.
- **L11 (dusty).** One row of covers (`grid-auto-flow: column; overflow: hidden` or slice to
  the column count), one link, inside the card. Or drop the section from Stats and keep the
  single number "N records untouched for 6+ months" as a stat card linking to What to Play.
- **L12 (cards).** Six compact cards in `repeat(auto-fit, minmax(180px, 1fr))` with
  `max-width` so that 1280 px gets 6 × 1 or 3 × 2, never 4 + 2; at ≤ 600 px a 2-column grid
  with the number and label only (details on tap).
- **L13 (time span).** Default the timeline to "All time, by month" (it's one request, 467 B,
  and the only all-years picture on the page); leave the heatmap on this year.
- **L14 (headings).** Either make every section an `h3` card, or introduce three `h2` groups:
  "Now" (cards, top lists), "Patterns" (heatmap, timeline, punch card, genres), "Collection"
  (coverage, ROI, labels, dusty).

### Loading cost (data copy, backend on port 3099, warm process)

| Call | Cold | Warm | Size | Loads |
|------|------|------|------|-------|
| `streaks` | 0.19 s | 0.02 s | 158 B | eager |
| `counts`, `listening-hours`, `new-artists`, `milestones`, `coverage` | ≤ 0.04 s | ≤ 0.03 s | < 400 B | eager |
| `heatmap?year` | 0.03 s | 0.03 s | 10 KB | eager |
| `top/artists`, `albums`, `tracks` (month) | 0.03–0.05 s | 0.01–0.03 s | 0.4–3.5 KB | eager |
| `top/labels` (month / all) | 0.15 s | 0.11–0.15 s | 3.2 KB | eager, separately |
| `dusty-corners` | 0.05 s | 0.04 s | 6 KB | eager |
| `sources` | 0.27 s | **0.38 s** | 131 B | eager |
| `timeline` | 0.02 s | 0.01 s | 467 B | eager |
| `images/batch/artists`, `images/batch/albums` | **2.6 s each** | — | 0.2–1.3 KB | after first paint |
| `hourly-distribution`, `day-of-week-distribution` | 0.01 s | 0.01 s | < 700 B | lazy |
| `on-this-day` | **10.0 s** | 0.02 s | 7 KB | lazy |
| `genres`, `taste-drift` | 0.015 s | 0.01 s | 0.2–4.6 KB | lazy |
| `collection-roi` | 0.001 s | 0.001 s | 26 B (empty) | lazy |
| `rankings-over-time` | **0.77 s** | 0.74 s | **136 KB** | **eager** |

The first paint waits on one `Promise.all` of 13 calls; on this data that is ~0.3 s, so the
skeleton is short. The slow parts are off the critical path but visible: avatars and covers
pop in 2.6 s later, and On This Day's cold 10 s is the route fetching a cover per album from
Last.fm/Discogs (`routes/stats.ts:1509`, `imageService.getAlbumCover` in a `Promise.all`).
Return the data first and let the client fetch covers through the batch image endpoint, as the
top lists do. Per-section error states instead of one `Promise.all` failing the page is still
open from site review 1.

Lazy already: patterns, On This Day, genres, drift, ROI. Should be lazy: Rankings Over Time
(L9), Dusty Corners (if it stays), Top Labels (it already loads separately; keep that).

## 2. Proposed section order

Desktop (≥ 1100 px; content capped at 1400 px as today):

```
┌ Stats ───────────────────────────────────────────────────────────────┐
│ [streak] [this month] [all time + milestone] [new artists] [hours]   │
│ [coverage ▾]                                   6 compact cards, 1 row │
├──────────────────────────────┬───────────────────────────────────────┤
│ Top Artists        period ▾  │ Top Albums                  period ▾  │
│ 1 …  ▮▮▮▮▮▮  25             │ 1 …  ▮▮▮▮▮  25                        │
├──────────────────────────────┼───────────────────────────────────────┤
│ Top Tracks                   │ Top Labels   owned ▮▮▮ unowned ▯▯     │
│ 720 plays without album info are excluded · Review them              │
├──────────────────────────────────────────────────────────────────────┤
│ Listening Activity 2026 ▾   (cells fill the card; today in view)     │
├────────────────────────────────────────┬─────────────────────────────┤
│ Listening Timeline (all time, monthly) │ When you listen (7×24)      │
│ 5 % scrobbled through this app ▮▯▯▯▯   │ afternoon · weekday +22 %   │
├────────────────────────────────────────┴─────────────────────────────┤
│ Collection vs listening: [owned vs unowned plays] [value played vs   │
│ sitting] [after the purchase curve]                   (ideas 1–3)    │
├──────────────────────────────────────────────────────────────────────┤
│ Genres   [treemap | drift]                                           │
├──────────────────────────────────────────────────────────────────────┤
│ On This Day — Nov 13   [2026][2025][2023][2015]  year cards, 4-up    │
├──────────────────────────────────────────────────────────────────────┤
│ Rankings Over Time (lazy)                                            │
└──────────────────────────────────────────────────────────────────────┘
  Dusty Corners → one number in the coverage card, linking to What to Play.
```

Phone (≤ 600 px):

```
Stats
[streak | this month]
[all time | hours]
[new artists | coverage]          2-up, number + label only
Top ▸ Artists · Albums · Tracks · Labels   (segmented control, one list at a time)
  1 cover  Name                25
           5 owned · last Tue
Listening Activity (scrolled to this month)
Listening Timeline
When you listen (punch card, scrolls sideways)
Collection vs listening (stacked tiles)
▸ Genres             (collapsed)
▸ On This Day        (collapsed, first two years when open)
▸ Rankings Over Time (collapsed)
```

## 3. New stats and visualization ideas

Grounded in what the data holds today: plays with timestamps and track names (no album MBIDs
yet in the copy; they arrive from 2026-11 on), 1,197 collection items (all vinyl but one, 1,176
with a year, 1,171 with a master id, every one with labels, `date_added` from 2013 with a 497-item
import batch in 2021, no ratings or genres in the cache), the wishlist with pressing prices,
label lookups for unowned albums (`cache/album-labels.json`, filling in the background), artist
tags for genres, and the value cache when a scan has run. Things the stats service already
computes are named rather than re-proposed.

| # | Idea | Why the owner cares | Data | Form | Effort | Page |
|---|------|---------------------|------|------|--------|------|
| 1 | **Owned vs unowned listening, over time.** Share of plays each month that land on a record you own, with the labels list split the same way (`LabelPlayCount.ownedPlayCount` already exists). | Is the collection what I actually play, and is the share rising since I started buying again in 2025? | History + collection match (`matchCollectionToHistory`, exists). | Stacked area by month (owned / unowned / no album), and a two-tone bar on each Top Labels row. | M | Stats. Already **N9** in site review 1 (open); this is the chart form. |
| 2 | **Value played vs value sitting.** Of the collection's estimated value, how much was played in the last 12 months, and the ten most valuable records untouched this year. | Money on the shelf doing nothing; a better framing than per-album ROI. | Value cache (median prices, exists after a scan) + last-played per item (`lookupCollectionHistory`). | Two stat tiles with a split bar, then a short ranked list. | S after the L3 fix | Stats; the long list belongs in Collection Analytics › Value. |
| 3 | **After the purchase.** Average plays per month in the 12 months after `date_added`, by cohort of year added, and the median days to first play. Exclude the 2021 import batch (497 items in one month) or show it as its own line. | Do records I buy now get played, or do they go straight to the shelf? | `date_added` + plays (exists). | Small-multiples line: months since added → plays, one line per cohort. | M | Stats. Related to **N8** (added-month cohorts, open). |
| 4 | **Heard before you bought it.** Share of records with plays before `date_added` ("auditioned") vs none ("bought blind"), and plays per year after purchase for each group. | Tells the owner whether blind buys pay off, with their own numbers. | Same as 3. | Two tiles plus a paired bar. | S on top of 3 | Stats |
| 5 | **Plays by decade vs records by decade.** Plays share by the album's original year against collection count by decade (Collection Analytics has the count half). | "I own 527 records from the 2020s but a third of my plays are 2000s albums." | Collection `year` / `master-years` for owned albums; unowned albums only where a lookup knows the year. | Butterfly bars per decade: owned count left, play share right. | M | Stats (the overlay); the count-only histogram stays in Collection Analytics. |
| 6 | **When you listen (7 × 24 punch card).** Replaces the hourly radar and day-of-week bars with one grid. | Denser and legible: "Friday 5–7 pm" at a glance. | `getHourlyDistribution` / `getDayOfWeekDistribution` already compute the axes; needs one joint pass. | Heatmap grid, `--chart-color` ramp, insight sentences kept. | S | Stats (layout fix L7). |
| 7 | **Album completion.** For owned records, the share of the tracklist ever played; a histogram and the "only ever heard side A" list. | Vinyl is bought whole; this shows which records have never been flipped. | Cached tracklists (`releases/` cache, `album-tracks-played`) + history track names. Tracklists are cached for about half the collection today. | Histogram of completion % plus a list. | M | Stats (aggregate); per-album detail already on the Album page. Side-level balance is **N2** (open). |
| 8 | **Sittings.** Group plays into sessions (gap > 30 min): sessions per week, median length, share that are a whole album vs loose tracks, longest sitting. | Separates "put a record on" from background streaming. | Play timestamps (exists); durations from tracklists where cached. | Three tiles and a histogram of session length. | M | Stats. |
| 9 | **New-to-you share.** Each month, plays of albums first heard that month vs repeat plays. | Puts the "8 new artists" number in context; shows discovery vs comfort phases. | History (first-play dates per album, exists in `getNewArtistsDetails` logic). | Stacked area, 24 months. | S | Stats. |
| 10 | **Still sealed.** Records added more than 90 days ago with no play, with their count, summed value and age. | The actionable number behind Dusty Corners. | `date_added` + plays; value cache optional. | One stat card linking to What to Play › Dusty. | S | Stats (number); the list is What to Play's. |
| 11 | **Record of the year, every year.** Most-played album per calendar year from 2005 to now. | A 22-cover strip that reads as a listening autobiography; Wrapped only covers one period. | `getTopAlbums('custom')` per year (exists); cache the result. | Horizontal cover strip with year labels, sideways scroll on a phone. | S | Stats. |
| 12 | **App-scrobbled share over time.** Replaces the 95/5 pie: by month, plays submitted through this app vs elsewhere. | Shows whether vinyl listening is replacing streaming, which the pie can't. | `getSourceBreakdown` logic per month (session timestamps, exists). | Thin stacked bar per month under the timeline. | S | Stats (fix L4). Wrapped shows the per-period split; the trend is new. |
| 13 | **Concentration.** "N records make up half your plays" and the share of the collection played in each window as one curve, instead of six numbers behind a dropdown. | One line says how deep the collection is in daily use. | Play counts per album (exists); coverage windows (exists). | Lorenz-style curve with a marker at 50 %, plus the coverage curve by window. | S | Stats (coverage card detail). |
| 14 | **Labels you play but don't own.** From the album-label lookups: labels with the most unowned plays, next to how many of their records are on the wishlist. | The buying angle on Top Labels: where the collection has gaps. | `cache/album-labels.json` (filling in the background; sparse until the scan finishes) + wishlist. | Ranked list with two counts; links to the Label page. | S | Label page (new tab) or a toggle on Top Labels. |
| 15 | **Rediscoveries.** Albums with a gap of two years or more between plays that came back this year. | Realized returns, as opposed to Forgotten Favorites' candidates. | Play timestamps (exists). | Short list with the gap length and a sparkline. | S | Stats. Forgotten Favorites (What to Play) covers the prospective side. |
| 16 | **Wishlist plays.** Plays of wanted records (Discogs + local wishlist) on streaming. | Already used by the buying shortlist's "explained by plays"; a ranked view would add little. | Exists. | List. | S | **Wishlist page**, not Stats. Mention only. |

Not proposed: format split (1,196 of 1,197 are vinyl), ratings (none set), reissue vs
original label (needs the original-label mode the label plan left unbuilt), per-artist depth
(the Artist page has it).

## 4. Ranked top five

1. **Layout pass: order, phone names, ROI path, lazy rankings (L1, L2, L3, L9).** The page's
   purpose is the top lists; today they are the eighth section, unreadable on a phone, and
   preceded by a card that can never show data. Half a day, mostly CSS and one path fix, and
   it changes how every visit feels.
2. **Owned vs unowned listening (idea 1, already N9).** The question only this app can
   answer, the matching code already exists, and it gives Top Labels its missing second
   dimension. Build the monthly stacked area and the two-tone label bars together.
3. **After the purchase + heard before you bought it (ideas 3 and 4).** One card from
   `date_added` and timestamps, nothing to fetch. It tells the owner whether buying habits
   work, which no Last.fm chart does.
4. **Value played vs value sitting (idea 2).** Depends on the L3 fix and a value scan; after
   that it is a day's work and turns the dead ROI card into the one money number worth
   reading.
5. **Punch card + app-scrobbled share (ideas 6 and 12, fixing L4 and L7).** Two small
   replacements that remove the two weakest charts and free a full row above the fold.

Then: sittings (8), record of the year (11), concentration (13).
