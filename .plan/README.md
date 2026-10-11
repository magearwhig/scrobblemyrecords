# Plans

Active plans and feature specs. Completed plans are in `done/`. Cancelled plans are in `cancelled/`.

| Plan | Status |
|------|--------|
| done/collection-analytics-plan.md | Complete -- Feature 13, all 5 phases implemented |
| done/listening-pattern-visualizations-plan.md | Complete -- Feature 14, all 6 capabilities implemented |
| done/button-system-consolidation.md | Complete -- all 4 phases, 54 files migrated, legacy .btn CSS removed |
| done/mapping-resolution-plan.md | Complete -- Feature 16, all 6 phases implemented |
| done/ui-audit-report.md | Complete -- All 3 phases (design tokens, visual polish, cleanup) implemented March 2026 |
| tech-debt.md | Active -- 24 open (4 P1 quick wins, 7 P2, 13 P3), 42 completed; re-verified 2026-10-11 |
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
| unresolved-listening-history-plan.md | Backlog -- revised 2026-10-11 (renamed from missing-albums-page-plan.md); count album-less scrobbles in listening stats and resolve albums without duplicating plays; not started |
| context-tags-plan.md | Backlog -- Effort F (#18); revised 2026-10-11, nothing implemented; stable tag IDs, multiple tags per session |
| marketplace-upgrade-plan.md | Backlog -- Effort C (#19 + #20); re-planned 2026-10-11 against the code; not started (Phase 0 API check first) |
| reissue-label-discovery-plan.md | Mostly shipped (`6be3c73`) -- remaining: reissue dedupe and settings-defaults merge, label/website auto-scan, new-item notifications |
| backlog-shark-tank-2026-03-08.md | Reference -- 24 tracked items, 19 done, 5 remaining (#5, #9, #18, #19, #20), each linked to a plan |
| smart-crates-plan.md | Backlog -- new 2026-10-11; rule-based, auto-updating album crates with manual include/exclude, match explanations, and rotating suggested crates with one-click Add; not started |
| pocket-list-export-plan.md | Backlog -- new 2026-10-11; offline phone-readable PDF of wishlist/collection; depends on data-export-plan Phase 1 |
| data-export-plan.md | Backlog -- #9; CSV/JSON data portability plus the shared export row layer used by Pocket List Export; not started |
| listening-notes-plan.md | Backlog -- #5; album-level notes MVP; not started |
| done/embedding-rec-system-plan.md | Complete -- embedding recommendation system implemented |
| done/backlog_ideas.md | Reference -- consolidation proposals implemented |

## Conventions

**Detail page link convention.** ArtistLink, TrackLink, AlbumLink share a pattern: default-exported components that write `selectedXyz` to localStorage as JSON (or a string for the artist-only case), then call `navigate(ROUTES.XYZ_DETAIL, { from })` so the destination page can render a correct back link. Future detail-page links (e.g. LabelLink) should follow the same pattern.
