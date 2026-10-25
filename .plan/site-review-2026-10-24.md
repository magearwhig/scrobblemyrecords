# Site review, round 2 (2026-10-24)

Second external review, after round 1 (`site-review-2026-10-23.md`) was merged as PR #20.
Every bug below was checked against the source before being listed.

**Status (2026-10-24, branch `fix/site-review-round2`):** R1–R7, all 3 quick wins and all 3
improvements done, plus a Runtime sort on Browse Collection (owner request). R8 skipped: the
owner doesn't use the app from other devices. The feature ideas are still open.

Notes on what shipped:
- R1: a full sync retries each page 3 times and then stops with an error. A complete index
  stays live until the rebuild has every page. A first sync still saves as it goes, but marked
  `fullSyncIncomplete`, so the next sync (or resume) runs the full sync again. A successful
  full-range backfill clears the mark.
- R2: the batch session status counts ignored tracks as unfinished. Each result says the
  reason Last.fm gave (ignoredMessage code), Batch and Memory Scrobble show the ignored count,
  and Memory Scrobble keeps ignored tracks in its list.
- R3: one shared popup sign-in. Timers are held in a ref and cleared on timeout, on a new
  attempt and on unmount; replies for an older attempt are ignored.
- Contrast: new `--text-on-fill` token (#1a1a1a in both themes), used for text on every
  amber, green or blue fill (27 rules), not just Button and Badge.
- R7: mapping results are buttons in Discovery and in both Album History mapping lists.
- Batch timestamps: `scheduleBackFrom` (shared/utils/tracklist.ts) times tracks back from the
  end time by length (3 min when unknown); the page previews each start time, marks guesses
  with "~", and sends the times it showed. The route uses the same helper for clients that
  send none. The last track now starts its own length before the end time (was: at it).
- Check a Record snapshot: `getCollectionRows({ releaseDetails: false })` skips the release
  files; wishlist owned-matching uses the same lean rows.
- History: sessions load only on their tab, 20 at a time (`GET /scrobble/history?limit&offset&q`),
  search runs on the server. The route no longer calls Last.fm first.
- Runtime sort: `GET /crates/release-runtimes` (same runtimes crates use: complete cached
  tracklists only, so about half the collection has none yet and sorts last).

## Bugs

- [x] **R1 (high): full history sync skips failed pages and reports success.**
  `scrobbleHistorySyncService.ts:556`. A page that throws is logged and skipped; the partial
  index is saved and the status is `completed`. Incremental syncs start from the newest play,
  so the hole is never filled. `fetchPageWithRetry` (line 872) already exists, but only the
  backfill uses it.
  Fix: use the retry helper. Build the full sync into a separate index and replace the live
  one only if every page succeeds; otherwise keep the old index and report an error.
- [x] **R2 (high): ignored scrobbles still mark the session "completed".**
  `lastfmService.ts:402` sets `completed` when `failed === 0`, even when tracks were ignored.
  The retry route rejects completed sessions (`routes/scrobble.ts:621`), but its own status
  logic (line 669) treats ignored as not complete. The Batch results card
  (`ScrobblePage.tsx:494`) never shows the ignored count.
  Fix: one status rule (ignored counts as incomplete), show ignored count and reason, allow
  retry.
- [x] **R3 (medium): blocked OAuth popup leaves "Connecting…" forever.**
  `SettingsConnectionsSection.tsx:39`. When `window.open()` returns null, polling never sees
  the window close. The 5-minute timeout tests a stale `loading` value from the closure
  (line 117), so it never resets either. The same happens for Last.fm (line 223).
  Fix: handle a null popup straight away, use a ref for the timeout, clear timers on unmount.
- [x] **R4 (medium): Check a Record shows the previous answer during a new search.**
  `CheckRecordPage.tsx:373`. The old result stays rendered while debouncing and loading, and
  the caption says "1 match" until the request starts.
  Fix: only render a result whose `query` matches the current input; show "Searching…" at
  once.
- [x] **R5 (medium): Check a Record never says how old the collection cache is.**
  `collectionCache.ts:102` marks a cache complete regardless of age, and
  `CheckRecordPage.tsx:341` warns only when the cache is incomplete. `oldestPageAt` is
  already returned but not shown.
  Fix: always show "Collection as of <date>"; qualify ownership when it's older than N days.
- [x] **R6 (medium): Discovery overflows at 390 px.** `DiscoveryPage.page.css` has no phone
  media query; `.discovery-controls` (line 31), `.missing-item` (97) and
  `.missing-item-actions` (282) stay in one row.
  Fix: stack and wrap at 768 px.
- [x] **R7 (medium): Discovery's Map results can't be chosen with the keyboard.**
  `DiscoveryPage.tsx:481`. Each result is a clickable `div` with no tab stop.
  Fix: use buttons, disabled while saving.
- [ ] **R8 (high if LAN/phone use is wanted): the frontend always calls `localhost`.**
  `AppContext.tsx:20`, `statsApi.ts:42`, CSP `connect-src 'self' http://localhost:*`
  (`public/index.html:6`). The README documents a headless backend with `HOST=0.0.0.0`, but
  the UI can't reach it from any other device, a phone included.
  Fix: one API origin, preferably same-origin `/api` (serve the web build from the backend or
  proxy it), with the CSP updated. This is a deployment change, so the owner decides.

## Quick wins

- [x] Lookup: "acdc back" finds nothing, because the compact fallback only covers the whole
  query (`recordLookupService.ts:404`). Match compact artist spellings inside multi-word
  queries.
- [x] Light-theme contrast: white text on the amber primary button (`Button.css:42`) is about
  2.3:1, and on the success badge (`Badge.css:68`) about 3.1:1. Add on-accent foreground
  tokens.
- [x] Batch scrobble: label the track checkboxes and the custom date/time input
  (`ScrobblePage.tsx:410`, `456`).

## Improvements

- [x] Batch timestamps: the route spaces tracks a fixed 180 s apart
  (`routes/scrobble.ts:230`) even though track durations are prepared. Use the durations,
  preview the schedule, and mark estimated times.
- [x] Lighter Check a Record snapshot: the rebuild goes through export enrichment and reads
  about 1,200 release cache files it doesn't need (`exportDataService.ts:252`, `174`).
- [x] History: fetch local sessions only on their tab, and return paged summaries
  (`HistoryPage.tsx:109`, `lastfmService.ts:493`).

## New feature ideas

1. "Fits in 40 minutes" picker: suggest records that fit a time slot, from cached durations
   and listening history (M). The reviewer's pick.
2. Shelf census: check which copies are actually on the shelf (M).
3. Warn when a compilation or box set mostly repeats tracks already owned (L).

Reviewer's order: R1 and R2 (history integrity), then R8, then R3–R5, then R6–R7 with the
contrast and labels, then the improvements.
