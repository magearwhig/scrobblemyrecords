# Plans

Active plans and feature specs. Completed plans are in `done/`. Cancelled plans are in `cancelled/`.

| Plan | Status |
|------|--------|
| done/collection-analytics-plan.md | Complete -- Feature 13, all 5 phases implemented |
| done/listening-pattern-visualizations-plan.md | Complete -- Feature 14, all 6 capabilities implemented |
| done/button-system-consolidation.md | Complete -- all 4 phases, 54 files migrated, legacy .btn CSS removed |
| done/mapping-resolution-plan.md | Complete -- Feature 16, all 6 phases implemented |
| done/ui-audit-report.md | Complete -- All 3 phases (design tokens, visual polish, cleanup) implemented March 2026 |
| tech-debt.md | Active -- 19 open (0 P1, 6 P2, 13 P3), 47 completed; P1 quick wins, M31 and backup mapping files fixed 2026-10-11 |
| done/wishlist-enhancements-plan.md | Complete -- all 4 enhancements implemented, tested, verified |
| cancelled/spotify-integration-plan.md | Cancelled -- Spotify genre enrichment for embeddings |
| cancelled/smart-scrobble-scheduling-plan.md | Cancelled -- superseded by memory-scrobble-plan |
| done/memory-scrobble-plan.md | Complete -- all 4 phases implemented: saved collections with CSV import, track remap, duration lookup, batch scrobble with retry |
| done/consolidation-plan.md | Complete -- Marketplace hub + What to Play page |
| done/cross-feature-data-enrichment-plan.md | Complete -- Feature 12, all 7 phases implemented |
| done/wrapped-plan.md | Complete -- all 6 phases implemented |
| done/discard-pile-plan.md | Complete -- Feature 7 |
| done/wishlist-new-release-tracking-plan.md | Complete -- Feature 5.5 |
| done/artist-track-deep-dives-plan.md | Complete -- Feature 15, all 4 phases implemented |
| done/album-detail-page-plan.md | Complete -- shipped 2026-05-09, Feature 17 backend endpoint, AlbumDetailPage, AlbumLink integrations across Stats/History/Collection |
| done/album-name-aliasing-plan.md | Complete -- via album mappings (merge into history album or collection item) plus Suggested Album Merges in Settings; history-index rewrite intentionally skipped |
| done/traded-in-archive-plan.md | Complete -- Feature 7 extension, all 3 phases implemented |
| done/unresolved-listening-history-plan.md | Complete -- 2026-10-11; albumless scrobbles kept and counted in listening stats, backfill (index now matches Last.fm), resolution rules, Unresolved tab, artist exclusion, bulk album fill with Last.fm and Discogs tracklist checks |
| context-tags-plan.md | Backlog -- Effort F (#18); revised 2026-10-11, nothing implemented; stable tag IDs, multiple tags per session |
| done/wishlist-price-alerts-plan.md | Complete -- merged 2026-10-14 (PR #13); lowest vinyl listing and price alert on each wishlist record, rolling background price checks, toast + Price alerts tab |
| cancelled/marketplace-upgrade-plan.md | Cancelled 2026-10-14 -- #19 superseded by wishlist-price-alerts-plan; seller-monitoring parts and #20 dropped by the user; verified Discogs API facts kept |
| reissue-label-discovery-plan.md | Mostly shipped (`6be3c73`); reissue dedupe and settings defaults fixed 2026-10-11 -- remaining: label/website auto-scan, new-item notifications (must build its own scheduler now that the marketplace plan is cancelled) |
| backlog-shark-tank-2026-03-08.md | Reference -- 24 tracked items, 20 done, 1 dropped (#20), 3 remaining (#5, #9, #18), each linked to a plan |
| done/smart-crates-plan.md | Complete -- merged 2026-10-19 (PR #15); all phases 1-3 incl. suggested crates; known limitation on mixed collection snapshots in section 14 |
| done/pocket-list-export-plan.md | Complete -- 2026-10-21 (branch feat/pocket-list); offline 4x8 in PDF of wishlist/collection from the Wishlist and Collection pages; phone checks left to the user |
| done/record-store-filing-plan.md | Complete -- 2026-10-22 (branch feat/pocket-list); Pocket List filed like a record store: MusicBrainz sort names, "file under" overrides in Settings, original-year album order, spelled numbers, Various Artists and Soundtracks sections; 107 of 590 artists change bins on real data |
| data-export-plan.md | In progress -- #9; Phase 1 (shared export row layer, `GET /api/v1/export/meta`) done 2026-10-21 with the Pocket List; Phases 2-4 (CSV/JSON files, Settings card, plays/mappings, cache fidelity) not started |
| listening-notes-plan.md | Backlog -- #5; album-level notes MVP; not started |
| done/embedding-rec-system-plan.md | Complete -- embedding recommendation system implemented |
| done/backlog_ideas.md | Reference -- consolidation proposals implemented |
| site-review-2026-10-23.md | In progress -- external product/usability review; all 10 bugs (B1-B10) + 9 quick wins fixed 2026-10-23 (branch fix/site-review-bugs); next: Check This Record; layout improvements and 17 feature ideas open |

## Conventions

**Detail page link convention.** ArtistLink, TrackLink, AlbumLink share a pattern: default-exported components that write `selectedXyz` to localStorage as JSON (or a string for the artist-only case), then call `navigate(ROUTES.XYZ_DETAIL, { from })` so the destination page can render a correct back link. Future detail-page links (e.g. LabelLink) should follow the same pattern.
