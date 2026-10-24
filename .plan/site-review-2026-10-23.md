# Site review — 2026-10-23 (rev 171604f)

External product/usability review of the running app (desktop 1280 px and phone 390 px, light + dark).
Every bug below was re-checked against source on 2026-10-23; all ten are real.
B1–B10 and all quick wins fixed 2026-10-23 on branch `fix/site-review-bugs`. B1: phone drawer from a header menu button, checked in a 390×844 frame on 14 pages (no sideways scroll; Release Details and Discard Pile filters reflowed). Extra fixes found along the way: the same zero-year bug in 5 more places, Wrapped custom start dates parsed as UTC, and release details now reloads when only `?id=` changes.

Status key: **open** · **done** · **skip**

## Bugs (all source-verified)

| # | Bug | Sev | Where | Status |
|---|-----|-----|-------|--------|
| B1 | Phone (≤768 px): sidebar goes full-width/auto-height, content gets ~48 px. Needs a drawer. | High | `styles.css` @media 768 (~1297), `Sidebar.tsx`, `App.tsx` | done |
| B2 | `#release-details?id=…` ignored — page only reads `localStorage.selectedRelease`, so Recommendations opens the previously viewed release (or nothing). | High | `RecommendationsPage.tsx:55`, `ReleaseDetailsPage.tsx:~299` | done |
| B3 | Home Recent Activity row → `collection?release=<id>`, which Collection ignores. | Med | `RecentAlbums.tsx:29` | done |
| B4 | Shared `.tabs`/`.tab` CSS lives in lazily loaded `SettingsPage.page.css`; tabs elsewhere are unstyled until Settings has been visited. | Med | `SettingsPage.page.css:878` | done |
| B5 | Websites "In collection" badge only means `artistInCollection`. | Med | `WebsitesPage.tsx:~1070` | done |
| B6 | "Today"/"Yesterday" uses elapsed 24 h blocks, not calendar days. | Med | `RecentAlbums.tsx:~37` | done |
| B7 | "Share of plays" bar is relative to the top item (`maxPlayCount`), not total plays. | Med | `RankedRow.tsx:168` | done |
| B8 | `{item.year && …}` renders a literal `0` for unknown years. | Low | `WishlistItemCard.tsx:71`, `discard/DiscardItemCard.tsx:102` | done |
| B9 | Artist/Track detail back label says "Back to Stats" when opened from Album Detail (missing from `PAGE_NAMES`). | Low | `ArtistDetailPage.tsx:28`, `TrackDetailPage.tsx:20` | done |
| B10 | Recommendation feedback shows a success toast without awaiting the request; failure is swallowed. | Med | `useRecommendations.ts:~63`, `RecommendationsPage.tsx:~66` | done |

## Quick wins (< 1 h each)

- [x] Suggestion card: "View in Collection" and "Details" do the same thing — keep one "Open release" (`SuggestionCard.tsx:75`)
- [x] Home quick actions: show `100+` when a list is capped; "7 active matches" not "new" (`routes/stats.ts:142`, `QuickActionsGrid.tsx`)
- [x] Discard history: "Original reason: …" and "Traded in on <statusChangedAt>" (`DiscardItemCard.tsx`)
- [x] Pressing announcements empty state names "Check Now"; real buttons are "Check Next Batch"/"Check All Remaining" (`wishlist/NewReleasesTab.tsx`)
- [x] Wrapped "Vinyl vs Digital" → "App submissions vs other listening"; show the date range on the first slide
- [x] On This Day: current-year card says "0 years ago" → "Today"
- [x] Album Detail: "Tracks" is ranked by plays but numbered like a tracklist → "Most played tracks"
- [x] Recommendations indexing copy: "1,135 stale · 60 not indexed"
- [x] Collection Analytics: 455 label spellings vs 445 grouped labels — use one number

## Improvements (layout/meaning, S–M)

- Collection: move cache maintenance buttons into a secondary menu; one results total
- Release Details: tracks first; marketplace/history collapsible; Last.fm troubleshooting behind a disclosure
- Crates: saved/pinned crates above suggestions
- Forgotten Favorites: sorts only the first 100 locally — sort server-side before the limit, add load-more
- Dusty Corners: split "No recorded history" vs "Previously played"; distinct error state
- Stats: per-section error states instead of one `Promise.all` failing the page
- Wishlist: collapse alert editing behind "Set price alert"; group confirmed shared masters; versions list vinyl-first and join the pressing-price cache
- Sellers / Labels / Websites: results first, management/cache panels collapsed
- Seller matches: one relative-date convention; found vs last-verified
- Missing albums: one matching implementation shared by Marketplace and Discovery
- Settings: collapse connection forms when connected; index/search in Mappings
- Batch scrobble: bounded parallel release fetches
- Detail pages: identity in the URL instead of localStorage (follows B2)

## Features (ranked by the reviewer)

1. **Check this record** — one lookup across owned / other version / wanted / monitored / traded, cached data only (M) — **done 2026-10-23**: Check a Record page (`#check`), `GET /api/v1/lookup/check`, `RecordLookupService`. Home shortcut and header search box added 2026-10-23; barcode scanning skipped (user's call: no cached barcodes, and live camera needs HTTPS)
2. **Identity-change impact preview** — before/after for artist aliases and compound mappings (L)
3. **Buying shortlist** — 3–5 albums within a budget, explained by plays, alert threshold, price freshness (M)
4. **Last listen before letting go** — audition review in the Discard Pile (M)
5. Others: companion record (N1), per-side listening balance (N2), resume interrupted session (N3), renew-or-retire old wants (N4), post-trade reconsideration (N5), edition tracklist diff (N6), label deep dive (N7), added-month cohorts (N8), owned vs unowned listening (N9), new-release relevance (N10), "why is this play here?" (N11), suspicious-day review (N12), history-gap investigator (N13)

Reviewer's suggested order: B1–B3 and the label fixes → Check This Record → mapping preview or buying shortlist → discard audition.
