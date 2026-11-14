# Stats page review — 2026-11-13

Product/layout review of the current working tree, including the newly added Top Labels list. Base revision: `97d403c`; the existing uncommitted label and other app changes were included in the review and left untouched.

**Status:** review complete; proposals below are **open**, with no implementation authorized by this document. Status key: **open** · **done** · **skip**. Effort: **S** = a small, contained change; **M** = a new aggregate or coordinated component/API change; **L** = substantial matching or inference work. Estimates include meaningful tests, not just drawing a chart.

The strongest change is to make this a compact answer to “what am I listening to, and how am I using my collection?” Move Albums and Labels near the top, shorten historical material, and keep five-row previews. The page currently gives background information the same prominence as the owner's current listening.

## Review method and evidence

- Read `StatsPage.tsx` top to bottom before inspecting its components, CSS, stats service and routes. Also checked genre/rankings services, Wrapped, Collection Analytics, the detail-page contracts, filing/master-year data, and both earlier site reviews.
- Used the real browser at `http://localhost:8099/#stats`, with viewports **1728×1080**, **1280×900**, and **390×844**, in **light and dark** mode. These are responsive browser checks, not a physical-phone test.
- Ran against a temporary copy of `data/` outside the repository, excluding `images/`, `backups/`, and `.server.lock`. Used the requested backend environment and production webpack build, served on 8099. No scrobbles, syncs, price scans, or mapping edits were initiated. Normal app reads/background cache work were confined to the copy. My review servers were stopped and temporary copies/builds deleted afterward.
- **Concurrent-session note:** the initial observations and timings came from my isolated run. During screenshot preservation, another review session occupied ports 3099/8099; the final screenshot pass captured that preview. Its backend was verified to use its own temporary data copy outside the repository. Its servers and additional screenshots were left untouched. The 19 viewport captures linked below and the overview montage are this review's evidence.
- Screenshots are viewport captures in [stats-page-review-2026-11-13/](stats-page-review-2026-11-13/); the [six-view overview](stats-page-review-2026-11-13/viewports.jpg) compares widths and themes. Some adjacent sections appear in the same capture because the app scrolls its content area. A panel still awaiting its lazy request is not evidence of missing data.
- Snapshot: 66,023 scrobbles, 1,197 coverage-denominator collection entries, 358 plays this month, 8 new artists, and 720 albumless plays. This is one owner's current data, not a benchmark dataset.

| Width | Light overview | Dark overview | Additional evidence |
|-------|----------------|---------------|---------------------|
| 1728 | [Overview](stats-page-review-2026-11-13/1728-light-top.jpg) | [Overview](stats-page-review-2026-11-13/1728-dark-top.jpg) | [On This Day](stats-page-review-2026-11-13/1728-light-onthisday.jpg), [taste](stats-page-review-2026-11-13/1728-light-taste.jpg), [rankings](stats-page-review-2026-11-13/1728-light-rankings.jpg), [labels](stats-page-review-2026-11-13/1728-dark-labels.jpg), [footer](stats-page-review-2026-11-13/1728-light-footer.jpg), [race](stats-page-review-2026-11-13/1728-light-race.jpg) |
| 1280 | [Overview](stats-page-review-2026-11-13/1280-light-top.jpg) | [Overview](stats-page-review-2026-11-13/1280-dark-top.jpg) | [Light lists](stats-page-review-2026-11-13/1280-light-labels.jpg), [dark lists](stats-page-review-2026-11-13/1280-dark-labels.jpg) |
| 390 | [Overview](stats-page-review-2026-11-13/390-light-top.jpg) | [Overview](stats-page-review-2026-11-13/390-dark-top.jpg) | [Activity](stats-page-review-2026-11-13/390-light-activity.jpg), [albums](stats-page-review-2026-11-13/390-dark-albums.jpg), [labels](stats-page-review-2026-11-13/390-light-labels.jpg), [genres](stats-page-review-2026-11-13/390-dark-genres.jpg), [Dusty Corners](stats-page-review-2026-11-13/390-dark-dusty.jpg) |

### What is already here — do not build it again

The actual source order is **six summary cards → Sources + Timeline → Activity heatmap → Listening Patterns → On This Day → Music DNA → Taste Drift → ROI → Artists/Albums + Tracks/Labels → Milestones → Dusty Corners → Rankings Over Time**. Listening Patterns is earlier than the ordering in the request's summary.

| Existing capability | Where it already lives / computes |
|---------------------|----------------------------------|
| Counts, streaks, estimated hours, new artists and their details | `StatsService.getScrobbleCounts`, `calculateStreaks`, `getListeningHours`, `getNewArtistsThisMonth`, `getNewArtistsDetails` |
| Ranked artists, albums, tracks **and labels**, with calendar/rolling/custom ranges | `getTopArtists`, `getTopAlbums`, `getTopTracks`, `getTopLabels`; Top Labels already links to Label Detail |
| Current-collection coverage across six ranges; neglected, heavy-rotation and forgotten records | `getCollectionCoverage`, `getDustyCorners`, `getHeavyRotation`, `getForgottenFavorites`; What to Play owns the fuller rediscovery workflow |
| Sources, timeline, daily calendar and day drill-down | `getSourceBreakdown`, `getListeningTimeline`, `getCalendarHeatmap`, `getAlbumsForDate` |
| Hour/day patterns, milestones, same-date history | `getHourlyDistribution`, `getDayOfWeekDistribution`, `getMilestones`, `getOnThisDay` |
| Tag-weighted genres, quarterly taste drift, animated ranking history | `GenreAnalysisService.getGenreDistribution/getTasteDrift`, `RankingsService.getRankingsOverTime` |
| Plays per market-value dollar | `getCollectionROI`; already present, despite returning no rows in this snapshot |
| Artist/album/track/label deep dives | Existing detail pages: counts, first/last dates, trends and ranked children; Album Detail already has a monthly listening arc and played tracks; Label Detail already has owned/looked-up splits, unplayed copies and an include-unowned control |
| Collection composition/value/growth | Collection Analytics already has formats, labels, decades/years, additions, marketplace value and value breakdowns |
| Period recap and discoveries | Wrapped already computes unique artists/albums, new-artist lists, peaks, streaks, additions, most-played new addition, coverage and submission-source split |

Earlier-review exclusions:

- **Already in R8**, [round 2](site-review-2026-10-24.md): LAN/phone API origin, shipped 2026-11-09. The phone findings here concern layout; do not reopen that deployment work. The phone navigation drawer is also already shipped as round-1 **B1**.
- **Already in round 1, Improvements:** per-section Stats errors instead of the shared `Promise.all` failure, Dusty Corners “no recorded history” versus “previously played” plus a distinct error state, and URL-based detail identity. Retain those references rather than treating them as new backlog items.
- **Already in round 1 N7:** label deep dive; present in this working tree and documented in [label-detail-page-plan.md](label-detail-page-plan.md). A new label page or another set of label top artists/albums/tracks is not proposed here. Original-label mode for owned records is already noted there as unbuilt.
- **Already in round 1 N8/N9:** added-month acquisition cohorts and owned-versus-unowned listening. Neither is counted among the new ideas below. Artist-discovery retention (I13) uses first recorded artist exposure, not collection-addition cohorts.
- Companion records, side balance, interrupted sessions, aging-want retirement, post-trade reconsideration, edition tracklist diffs, relevance of new releases, play explanations, suspicious days and history-gap investigation are already round-1 **N1–N6/N10–N13**. Buying shortlist and Check a Record are already shipped.
- Shelf census, a fits-in-40-minutes picker, and compilation/box-set overlap are already round-2 ideas. They belong to their existing plans, not this Stats proposal.

## Layout findings

All findings below are **open**. Screenshot links establish the observed layout; source-only limitations are explicitly marked.

### L1 — Current listening is buried (M)

**Evidence:** [1728 overview](stats-page-review-2026-11-13/1728-light-top.jpg), [rankings](stats-page-review-2026-11-13/1728-light-rankings.jpg).

**Problem:** Sources gets the first major chart slot, while the four top lists follow patterns, years of memories, two genre views and ROI. Once loaded, On This Day alone is about **1,865px** tall on desktop. On phone the first top-list section starts around **6,200px** down the content. There is no quick way to choose a subject.

**Fix:** After a compact overview, put **Albums + Labels** in the first ranked row, **Artists + Tracks** in the second. Default each to five entries with “Show 10.” Put optional ranking history inside this group behind “Explore over time.” Add section jumps for Rankings, Shelf, Activity and Taste. Move submission sources to a small footer summary; keep the timeline/heatmap as supporting activity views after the rankings and shelf summary.

### L2 — The six-card strip breaks awkwardly and repeats totals (S–M)

**Evidence:** [1280 light](stats-page-review-2026-11-13/1280-light-top.jpg), [390 light](stats-page-review-2026-11-13/390-light-top.jpg), [390 dark](stats-page-review-2026-11-13/390-dark-top.jpg).

**Problem:** At 1280, four cards occupy the first row and two leave half of the next row empty. At 390, six tall cards occupy about **903px**. Streak explanatory copy sets a large height, and the all-time number reappears in Sources and Milestones. “20.9h” looks precise, although `getListeningHours` multiplies plays by a fixed **210 seconds**.

**Fix:** Use four primary cards: **plays this month, collection coverage, new artists, current streak**. Use four columns on wide desktop and a deliberate 2×2 grid on phone; do not rely on auto-fit to choose an uneven row. Move all-time total, **estimated** listening hours and next milestone into a compact secondary line/disclosure. Put the streak's full best-date explanation behind an accessible info disclosure. Keep the coverage scope explicit when its independent range changes.

### L3 — Ranking controls consume the name space (M)

**Evidence:** [1280 lists](stats-page-review-2026-11-13/1280-light-labels.jpg), [390 albums](stats-page-review-2026-11-13/390-dark-albums.jpg), [390 labels](stats-page-review-2026-11-13/390-light-labels.jpg).

**Problem:** Four copies of eight period buttons create a wall of controls. At 1280 they wrap unevenly; on phone headings/descriptions compete with the selector. Owned badges, cover, rank, Spotify action and count can squeeze an album title out almost entirely. Dark mode makes row boundaries clearer, but does not recover text width.

**Fix:** Give the ranking group one shared period toolbar, explicitly scoped to **Rankings**, with an optional per-list override for comparisons. On phone use one native range selector and a subject switcher (Albums / Labels / Artists / Tracks), showing one five-row list at a time. Move ownership to the subtitle, allow two title lines, keep count beside the text, and move Spotify into a secondary action. Use smaller covers on phone. Preserve direct detail links and full-name access for touch and keyboard users, not only hover titles.

### L4 — Top Labels needs a definition, not just another rank column (S–M)

**Evidence:** [desktop labels](stats-page-review-2026-11-13/1728-dark-labels.jpg), [phone labels](stats-page-review-2026-11-13/390-light-labels.jpg).

**Problem:** “4 albums / 23 plays” does not say how many are owned, how labels were obtained, or why a reissue label wins. The service credits owned albums to labels of the copies currently owned, adds found/overridden labels for unowned albums, credits co-label releases to each label, and omits uncertain lookups/placeholders. Totals across labels therefore overlap. A cover is an example record, not a label logo.

**Fix:** Place Labels beside Albums. Add concise visible scope copy: **“Labels of owned editions + identified unowned albums; co-label credits overlap.”** Show “4 albums played · 18 plays from owned albums” using the existing `ownedPlayCount`, with a disclosure for attribution details. Offer an explicit owned-only scope as an endpoint/UI extension, rather than implying that the list already has that control. Keep label names as links to the existing detail page. Add I14's coverage line before treating a changing rank as a taste change. Do not add a sum-to-100% label pie.

### L5 — On This Day stretches sparse rows across the whole page (S–M)

**Evidence:** [1728 memories](stats-page-review-2026-11-13/1728-light-onthisday.jpg).

**Problem:** This is the clearest empty-middle problem: album names sit at the far left of a roughly 1,350px panel and counts at the far right. Every historical year gets a separate full-width card, even when it has one album. The eventual content also replaces a much shorter placeholder and pushes later sections down.

**Fix:** Show two year previews with up to three albums each; use two bounded-width cards on desktop, and compact stacked cards on phone. Keep play counts close to names in each card. Put the rest behind **“All years for this date.”** Pair the bounded preview with Activity where space allows. Render text as soon as available, then enrich only visible covers; don't withhold years while fetching images.

### L6 — The heatmap wastes width and has incorrect month labels (M)

**Evidence:** [1728 overview](stats-page-review-2026-11-13/1728-light-top.jpg), [390 activity](stats-page-review-2026-11-13/390-light-activity.jpg).

**Problem:** The small fixed-size grid occupies little more than half the desktop card; on phone it reveals only the early year unless horizontally scrolled. There is no clear touch affordance, and cells are only 12px. The first label visibly reads like **“DecJan”**, and later labels drift beyond their cells. Source confirms two causes: `new Date(day.date).getMonth()` interprets a date-only string as UTC in a local calendar, and label columns advance **16px** while week columns advance **14px**. The year selector also only offers the last three years despite history extending to 2006.

**Fix:** Correct local-date parsing and use one shared grid-column pitch. At wide widths pair the roughly 760px year calendar with the compact On This Day preview; stack them when that pair cannot fit. On phone default to a month calendar with practical tap targets, previous/next month and a year overview option; retain day detail below it. Offer actual available history years. Give zero, future and absent-history dates distinct explanations where knowable. This is a presentation correction; a history-gap investigator is already round-1 N13.

### L7 — Genre distribution and drift compete, especially on phone (M)

**Evidence:** [1728 taste](stats-page-review-2026-11-13/1728-light-taste.jpg), [390 genres](stats-page-review-2026-11-13/390-dark-genres.jpg).

**Problem:** Two large consecutive panels cover related material. The treemap gives similarly named tags separate areas, clips small-cell labels and uses white text even on bright yellow/green cells in both themes. Drift has about ten colored lines and a tiny legend; similar colors make it slow to trace a series. These are top-artist tag weights, not exact percentages of all listening time.

**Fix:** Combine them under **Taste**, with Distribution / Change views. Use labeled horizontal bars as the phone default, retain the treemap as an optional desktop view, and explain the sample/weighting. For drift, show three selected genres plus an optional rest, with direct end labels and an accessible data table. Use tested foreground tokens for each fill. The round-2 contrast quick win is already shipped; this finding concerns remaining chart text and legends, not reopening the primary-button fix.

### L8 — ROI belongs with value analytics, and its extremes are misleading (M)

**Evidence:** [empty ROI above rankings](stats-page-review-2026-11-13/1728-light-rankings.jpg). **The populated-data issue below is source-verified, not reproduced visually**, because this snapshot returned no ROI rows.

**Problem:** A full-width empty value panel blocks the path to current listening. “Best/worst investments” and an `x` score overstate a ratio of track scrobbles to **current marketplace median**, not purchase price, return or complete album listens. The component requests `limit=20`; the service sorts highest ratio first and truncates; “Worst Value” then takes the bottom ten of those twenty. Records with zero plays are excluded entirely. It cannot represent the collection's actual low end.

**Fix:** Move the full chart to **Collection Analytics**, alongside cached-value coverage, currency and freshness; leave only a small link/optional summary on Stats. Rename it **“Recorded plays per unit of market value”** and explain the unit. Compute both extremes over the full eligible population, expose zero-play records, and handle missing/stale prices explicitly before presenting “lowest” rankings. Do not duplicate the existing ROI leaderboard as a new feature idea.

### L9 — Dusty Corners turns into an image feed (S–M)

**Evidence:** [desktop footer](stats-page-review-2026-11-13/1728-light-race.jpg), [390 Dusty Corners](stats-page-review-2026-11-13/390-dark-dusty.jpg).

**Problem:** Eight large covers become about **3,218px** of phone content. The app also renders two routes to the same destination: the component's “See all” and the page's “View all in What to Play.” “+12 more” is only the remainder of the fetched twenty, not the true total of neglected records.

**Fix:** Move a three-record compact teaser beside a shelf-engagement summary, using small cover/text rows on phone and one **“Open Dusty Corners”** link. Return a real total if a count is shown, or say “More in What to Play.” Keep the full browsing/action experience there. The distinction between “no recorded history” and “previously played,” and its error state, are **already in round 1 Improvements**.

### L10 — Milestones and the race repeat answers at large scale (S–M)

**Evidence:** [milestones](stats-page-review-2026-11-13/1728-light-footer.jpg), [rankings race](stats-page-review-2026-11-13/1728-light-race.jpg).

**Problem:** Milestones repeats the all-time total and consumes a full card for a thin progress line. The race adds over 1,000px after four top lists, with large labels/bars and a separate period model. It is interesting exploration, but poor default dashboard density.

**Fix:** Put “8,977 to 75K” beside the all-time secondary metric and disclose reached milestones on demand. Put the existing race behind **“Explore rankings over time”** within Rankings, with a static current snapshot before explicit playback. Lazy-load its data on expansion. Any new shareable retrospective built from it belongs in Wrapped; don't add another animated recap to Stats.

### L11 — Loading boundaries do not follow what the owner can see (M)

**Evidence:** [loaded overview](stats-page-review-2026-11-13/1728-light-top.jpg) versus the delayed, expanded [On This Day](stats-page-review-2026-11-13/1728-light-onthisday.jpg). Timings below are server request durations from the first pass, not inferred from screenshots.

**Problem:** Thirteen initial requests share a page-level `Promise.all`; an offscreen collection join or source scan can delay the overview. Labels is correctly independent of that barrier, but still eager. Rankings Over Time also fetches immediately when the main content mounts, despite being at the bottom. Patterns, On This Day, genres, taste drift and ROI already use observers; proposing “add lazy loading” to all of them would ignore existing work.

**Fix:** Render overview and the first visible ranking independently. Defer Sources, Dusty Corners and the race until disclosure/near viewport; keep Labels independent and prefetch shortly before its newly prominent slot is visible. Use stable bounded previews so late memories do not reflow the whole page. Show ranking text before cover enrichment. A single ranking change should not blank Artists, Albums and Tracks together through `topListsLoading`; give each its own loading state and latest-request protection, as Labels already has. Per-section failure/retry is **already in round 1 Improvements** and should be carried forward under that item.

### Loading cost observed

| Request/work | First-pass observation | Consequence |
|--------------|------------------------|-------------|
| Core counts/streaks/new artists/hours/heatmap | Roughly 12–57ms each; timeline about 5ms | Cached totals can render promptly |
| Collection coverage / Top Albums / Top Labels / Dusty Corners | About 126 / 134 / 157 / 83ms | Joins are meaningful work, but Labels was not the slowest request in this run |
| Sources | About 474ms; reads completed session files and matches timestamps | Largest measured member of the initial barrier; secondary information should not gate the overview |
| Artist / album image batches | About 2.56 / 2.76 seconds, after text results | Already asynchronous after initial data; preserve text-first behavior and limit visible enrichment |
| On This Day | About **10.80 seconds** | Route awaits cover lookups in each year, processing years sequentially; return the history before enrichment |
| Hour/day patterns; genres; taste drift | About 21 / 29ms; 24ms; 16ms | Fast with copied caches; uncached genre/tag work can differ |
| ROI | About 0.5ms, **empty result** | No evidence here of populated ROI calculation performance |
| Rankings Over Time | About 25ms, eager after page render | Currently cheap server-side, but unnecessary payload/render work until expanded |

These are single-run observations with existing metadata/stat caches and no copied image directory. They are not p95, cold-start, or mobile-network measurements. All charts are statically imported by the page; fetching lazily does not by itself defer their chart code. Consider code splitting the optional race only after measuring bundle/render benefit.

## Proposed section order

Default ranking scope is this calendar month, shown as an explicit date range. A range control labeled **Rankings** updates its four lists; timeline, year calendar and all-time facts retain explicit local scopes. Do not imply that a single global filter affects endpoints that cannot yet honor it.

### Desktop

```text
Stats                         [Rankings] [Shelf] [Activity] [Taste]
[Month plays] [Month coverage] [New artists] [Current streak]
All-time total · estimated hours · next milestone [history disclosure]

RANKINGS  [This month / 30d / … / Custom]
[Top Albums: 5                | Top Labels: 5 + attribution/coverage]
[Top Artists: 5               | Top Tracks: 5                     ]
[Show 10 per list]  [Explore rankings over time — collapsed]

SHELF LISTENING
[Repeat depth (I5)            | Dusty Corners: 3 compact records   ]
[Optional label engagement comparison (I1); not every idea below]

ACTIVITY
[Listening timeline — useful plotting height, explicit range   ]
[Annual calendar, ~760px      | On This Day: 2 bounded previews    ]
  At 1280, stack the last pair when the calendar cannot fit.

TASTE  [Distribution | Change]
[One chart, readable labels, optional table                     ]
[Listening Patterns — collapsed: hour + weekday when expanded]
Submission sources: compact counts/bar · [Collection Analytics]
```

### Phone

```text
Stats + compact section-jump control
[Month plays  | Coverage    ]
[New artists  | Streak      ]
All-time / estimated hours / milestone: compact disclosure

Rankings [range select]
[Albums | Labels | Artists | Tracks]   (one list at a time)
5 readable two-line rows; Show 10; attribution below Labels
[Explore over time — collapsed]

Shelf: repeat-depth summary + 3 small Dusty rows, one destination
Activity: timeline, then month calendar + day drill-down
On This Day: 2 compact year previews; All years disclosure
Taste: labeled bars / change view, one chart at a time
Patterns disclosure; sources summary; Collection Analytics link
```

Use container width to choose the two-column ranking layout, not viewport alone: the sidebar already consumes 240px. Keep DOM/keyboard order consistent with the visual order. Reserve a minimum text width before badges or optional actions; do not solve density by shrinking labels further.

## New stats and visualization ideas

These are **14 candidate additions/extensions**, not fourteen new default dashboard panels. Existing raw ingredients are called out so a new presentation is not mistaken for a new data source. “Owned” means **currently owned album matched to history**, not evidence that a physical copy was used for a play. No new external service is required for the first nine ideas, though joins and aggregates still need implementation.

### I1 — Label shelf engagement (M; Stats preview → Collection Analytics)

**Shows:** For each label, distinct owned album groups heard in the selected period / distinct owned album groups on that label, alongside the denominator. **Why care:** See which labels actually get explored instead of letting one heavily played album dominate the ranking.

**Data:** Current collection labels, canonical album groups and timestamps exist. New cross-label recent-coverage aggregate needed; existing Label Detail's unplayed-copy list and Top Labels' `albumCount` do not supply this denominator. Deduplicate editions within a label; co-label groups can appear in multiple rows, clearly marked. **Form:** Five horizontal bullet bars, e.g. “6 of 20 albums heard”; full sortable comparison on Collection Analytics. This extends existing label data, not round-1 N7's label-page proposal.

### I2 — Label dependence on one artist (M; Label Detail)

**Shows:** The top artist's fraction of a label's credited plays, plus an effective-artist count (`1 / sum(artist share²)`). **Why care:** Distinguish “I follow this label” from “I really love one of its artists.”

**Data:** Alias-resolved artist plays and label attribution exist; compute over the full label population, not the detail page's capped top-20 response. New concentration aggregate needed. **Form:** A dominant-artist stacked bar with a small diversity number and artist links. A label's existing top-artists list remains the drill-down, not a second copied list on Stats.

### I3 — Labels rising through breadth (M; Stats → Label Detail)

**Shows:** Change in distinct albums/artists heard for a label versus the preceding equal-length period, with play-count change as context. **Why care:** Find a developing label interest that is broader than a single repeat-heavy record.

**Data:** Timestamps and owned/looked-up label data exist; new comparison aggregate needed. Keep the label snapshot fixed across both periods, disclose lookup coverage, and suppress tiny-sample “trends.” **Form:** A ranked dumbbell chart of album breadth, with current/previous values. Existing label trends show volume; this adds breadth and an explicit comparator.

### I4 — Label-to-label listening handoffs (L; Label Detail, optional exploration)

**Shows:** Labels heard consecutively within inferred listening windows. **Why care:** Reveal relationships in actual listening habits between labels in the collection.

**Data:** Ordered plays and label associations exist; window inference and aggregation are new. Group album runs, cut at a stated gap such as 45 minutes, omit uncertain labels and fractionally weight co-label combinations. Timestamps do not establish recommendations or causal influence. **Form:** A small transition matrix for the selected label's strongest neighbors; avoid a large all-label network. This is a descriptive relationship view, not the already-open companion-record picker (round-1 N1).

### I5 — Repeat depth of the owned library (M; Stats)

**Shows:** Counts of distinct currently owned album groups heard on 0, 1, 2–4, or 5+ different local dates during the range. **Why care:** Tell whether collection coverage is a quick pass through many records or sustained return listening.

**Data:** Current holdings, mappings and timestamps exist; new grouped album-day histogram needed. One track and ten tracks on the same date each contribute one listening day, not a complete listen. Historical ranges refer to today's holdings unless ownership snapshots become available. **Form:** Four labeled bars with counts and coverage denominator; zero-day bar links to the existing What to Play workflow. Existing coverage/heavy rotation do not compute this distribution.

### I6 — Rotation turnover (M; Stats)

**Shows:** Which owned album groups enter, remain in, or leave the active listening set between adjacent equal periods; include overlap as a percentage of the union. **Why care:** Make the movement between familiar records and changing rotation visible.

**Data:** Canonical current holdings and timestamped album sets exist. New set comparisons needed. “Entering rotation” means absent from the previous period, not newly discovered or newly purchased. **Form:** Monthly incoming/continuing/outgoing bars plus a small overlap trend, with a few linked examples. This is not the acquisition-cohort idea already in round-1 N8 or the owned/unowned split in N9.

### I7 — Album ranking by listening days (S–M; Stats ranking metric)

**Shows:** Album ranks by distinct dates heard, with track-scrobble ranks alongside. **Why care:** Reduce the advantage that long albums, double albums and box sets get from raw track counts.

**Data:** Timestamped album plays and mappings exist; distinct-date aggregate and an explicit ranking metric are new. This measures days with any recorded listening, not album completion or sessions. **Form:** A “Track plays / Listening days” metric selector with a paired-rank dot view on demand. Album Detail keeps the single-album arc; don't duplicate that arc here.

### I8 — Format representation versus attention (M; Collection Analytics)

**Shows:** Share of owned album groups associated with each format versus share of their recorded album-days. **Why care:** See whether the kinds of records being collected align with the albums being revisited.

**Data:** Formats, mappings and timestamps exist; new listening-weighted comparison needed. Use a mutually exclusive “multiple formats owned” group when necessary, or explicitly fractional allocation. Label it “listening to albums owned on…”; history cannot prove vinyl/CD playback. **Form:** Paired percentage bars. Format composition already exists on Collection Analytics; only the attention comparison is new.

### I9 — Era representation versus attention (M; Collection Analytics)

**Shows:** Collection share versus listening-day share by the album's original release decade where known. **Why care:** See which musical eras occupy shelf space versus listening attention, without mistaking modern reissues for new music.

**Data:** Listening history and collection years exist; confirmed master IDs and **cached master years already exist in the filing service**. Coverage is partial. Reuse those caches; unknown original years stay unknown, with pressing-year comparison offered separately and explicitly labeled. New joined aggregation needed. **Form:** Paired decade bars with an unknown-year bucket. Plain decade/year histograms are already shipped.

### I10 — Original-year to owned-edition-year distance (M; Collection Analytics)

**Shows:** Distribution of the gap between confirmed master year and owned edition year, with recent listening engagement by gap band. **Why care:** Understand whether the editions that get attention tend to be contemporary pressings or much later reissues.

**Data:** `master_id`, edition `year`, master-year filing cache and album-day data exist, with partial joins. Exclude impossible/unknown years from numeric gaps, show the excluded count, and never infer sound quality or which edition was played. **Form:** Gap-band histogram plus engagement markers. This does not implement original-label mode already noted in the label plan, nor round-1 N6's edition tracklist diff.

### I11 — Market value sitting outside recent rotation (M; Collection Analytics)

**Shows:** Cached market value grouped by albums heard recently, last heard long ago, and with no recorded history; include unpriced holdings separately. **Why care:** See how much of the collection's estimated value sits outside current listening habits.

**Data:** Current collection, release-value cache and last-listen history exist; price coverage/freshness may be incomplete. New joined buckets needed. Keep currencies separate unless a real conversion is available; show price scan age. For multiple editions, show their shared album engagement rather than assigning plays to one pressing. **Form:** Value-weighted stacked bars with counts; no “sell” inference. This adds a recency/value view, not another plays-per-dollar ROI list.

### I12 — One album, several editions: attribution map (M; Album Detail)

**Shows:** A single canonical album's recorded listening connected to all confirmed owned editions, showing each edition's label, year and format. **Why care:** Explain why an album's plays appear under multiple labels without pretending the app knows which pressing was used.

**Data:** Current collection master IDs, mappings, edition metadata and history exist. New grouping/presentation needed; only group confirmed matches, and keep ambiguous identities separate. The current Album Detail returns one collection match, so this needs a richer response. **Form:** Compact album → edition rows with a shared-play total shown once and an “edition used unknown” note. No side balance or tracklist-difference feature is included.

### I13 — Discoveries that last (M; Stats; optional recap on Wrapped)

**Shows:** Fraction of first-recorded artists revisited on a later date within 30/90 days of their debut, for sufficiently old discovery groups. **Why care:** Tell whether “8 new artists” represents enduring interest or brief encounters.

**Data:** Full timestamped, alias-resolved artist history exists; first-seen details are already computed, but later-date retention is new. Exclude discoveries whose observation window is unfinished and distinguish lack of recorded history from absence of real listening. **Form:** Small retention/cohort heatmap or a recent-cohort percentage with trend. Wrapped already has a discovery list; reuse this aggregate for a recap rather than building another list there. These are artist-exposure groups, not round-1 N8's collection-addition cohorts.

### I14 — How complete is the label picture? (M; Stats beside Top Labels)

**Shows:** A play-weighted split of known owned-edition labels, identified unowned-album labels, album-known/label-unknown plays, and albumless plays for the selected period. **Why care:** Know whether apparent label changes reflect listening or metadata becoming available.

**Data:** Label lookup status, provenance, albumless summary, mappings and timestamps exist. The existing lookup status counts albums globally; the new work is a period-specific play-weighted join. Count each listening event once in this quality view, even when it receives multiple label credits in rankings. **Form:** Thin stacked coverage bar with numbers and a details disclosure. Show pending/unsure as unknown, not zero interest. This is label coverage context, not the already-open per-play explanation or history-gap investigator.

### Data rules for every idea

- Resolve artist aliases and album/track mappings through the established services; do not invent another fuzzy join in a chart. Newer album MBIDs help confirmed matching, but the stored MBID is album-entry metadata from the newest qualifying play, not a complete per-event pressing history.
- Define the unit: track scrobble, distinct album, local listening date, owned edition, or label credit. Do not silently mix copies in the denominator with canonical albums in the numerator. Current coverage iterates collection entries, so a new distinct-album measure needs its own explicit contract.
- Current ownership and date added do not establish historical ownership or actual purchase date. A Discogs edition label/format does not identify the medium played. Master grouping does not prove two releases have identical tracklists.
- Missing labels, years, prices, durations and artist tags need visible coverage/unknown states. Record market value is not purchase spend or financial return. Nothing here requires a live marketplace lookup on opening Stats.
- Prefer comparable equal-length periods and show exact dates. Keep timezone/day boundaries consistent across the server and client. Use minimum sample sizes and avoid assigning meaning to sparse changes.

## Ranked top five to build first

Across layout and new capabilities, in this order:

1. **Compact overview + Rankings first (L1–L3, M).** Largest daily benefit on all three widths. Makes Albums and Labels reachable, fixes the phone's unreadable name rows, and removes repeated controls before adding more information. No new data source needed.
2. **Make Labels interpretable (L4 + I14, M).** The new list is valuable, but attribution and unknown coverage determine whether its ranks can be trusted. Existing `ownedPlayCount` supports an immediate contextual improvement; the play-weighted coverage join is the next increment. Reuse the existing detail page.
3. **Owned-library repeat depth + compact Dusty teaser (I5 + L9, M).** Adds a collection-specific insight that raw coverage misses, and turns the shelf section into a useful summary instead of a 3,200px phone image feed. Links to the existing rediscovery workflow.
4. **Label shelf engagement (I1, M).** Complements Top Labels with “how much of this label do I explore?” instead of another play-count list. Keep a five-label preview on Stats and the full comparison in Collection Analytics. Establish canonical-album denominators first.
5. **Rotation turnover (I6, M).** Offers a clear reason to return each month and uses existing timestamps without new enrichment. Pair entering/continuing records with repeat depth so breadth and change read together.

Before treating charts as authoritative, fix the local-date/grid-pitch defect in L6, label hours as estimated in L2, and correct ROI's population/extremes in L8 when touching that feature. These are correctness prerequisites, not extra new-feature pitches. Shortening On This Day and returning its text before covers (L5/L11) is the next layout/performance task after the ranked five; it can be done independently.

## Rules for later implementation — not implemented in this review

- **No inline styles.** Use design tokens; put page styles in `.page.css` files. Use `lucide-react` icons instead of emoji/text-glyph substitutes. Keep chart colors and readable foregrounds consistent in both themes.
- **Write tests first.** Cover real behavior: long names with ownership/actions at 390px; scoped period changes; local month boundaries; alias/mapping and multi-edition deduplication; co-label overlap; incomplete attribution; true ROI extrema/zero plays; and fetch-on-disclosure behavior. Test text-first loading without late results overwriting a newer range.
- **Keep the README and `.plan` current.** Update this document's item statuses, related existing review items, the plan index and user-facing README when features ship. Preserve earlier review IDs instead of relabeling old work as new.
- Recheck 1728, 1280 and 390px in light/dark with real copied data, keyboard navigation, readable labels and touch-sized controls. Compare measured request/render behavior before and after. No production data, scrobbling or live scans are needed for layout validation.
