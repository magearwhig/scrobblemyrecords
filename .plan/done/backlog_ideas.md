# UI Reorganization Backlog

Future consolidation opportunities identified during the January 2026 UI reorganization.

## Completed (January 2026)

- [x] Grouped sidebar with 5 category headers (Dashboard, Library, Listening, Explore, System)
- [x] Removed "Scrobble Tracks" from nav, added floating action bar to Collection page
- [x] Merged "Setup & Authentication" into Settings as "Connections" tab
- [x] URL deep-linking support (`#settings?tab=connections`)

---

## 1. Consolidate Marketplace Features -- DONE (February 2026)

Implemented as "Marketplace" hub page with 5 tabs: Wishlist, New Releases, Sellers, Matches, Missing Albums.
See `done/consolidation-plan.md` for full details.

---

## 2. Consolidate "What to Play" Features -- DONE (February 2026)

Implemented as "What to Play" page with 3 tabs: Suggestions, Forgotten Favorites, Dusty Corners.
See `done/consolidation-plan.md` for full details.

---

## Implementation Notes

Both consolidations completed. Additional fixes applied:
- OOM fix: batch play count endpoint now uses `countsOnly` mode and chunked processing
- CSP fix: webpack `output.environment.globalThis` eliminates `new Function` polyfill
- Backward-compat redirects for old route hashes
- StatsPage DustyCornersSection shows top 8 with "See all" link to What to Play
