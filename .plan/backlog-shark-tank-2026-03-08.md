# Listenography Backlog — Shark Tank Session (2026-03-08)

Generated via a 7-agent brainstorming session. 25 accepted items from 39 pitches.
16 completed, 9 remaining — grouped into 6 work efforts below.

---

## Completed Items

- ~~#2 Setup Progress Banner~~ — DONE
- ~~#3 Collection Cache Reader Utility~~ — DONE
- ~~#4 Empty/Error State Consistency~~ — DONE
- ~~#7 Global Keyboard Shortcuts~~ — DONE
- ~~#8 Alert → Toast Migration~~ — DONE (already completed prior)
- ~~#11 Navigate Wrapper Function~~ — DONE
- ~~#12 On This Day Widget on Dashboard~~ — DONE
- ~~#13 Detail Page Breadcrumbs~~ — DONE
- ~~#14 Missing Page CSS Files~~ — DONE
- ~~#15 Batch Collection Lookup~~ — DONE
- ~~#17 Stats Cache Warming~~ — DONE
- ~~#21 useAsync Hook~~ — DONE
- ~~#22 Saved Filter Presets~~ — DONE
- ~~#23 History Tab Default~~ — DONE
- ~~#24 Global Sync Status Bar~~ — DONE

---

## Remaining Work — Grouped by Effort

### ~~Effort A: Stats Performance~~ — DONE

~~#15. Batch Collection Lookup~~ — DONE
~~#17. Stats Cache Warming~~ — DONE

---

### ~~Effort B: Analytics Trio~~ — DONE

~~#1. Collection ROI Score~~ — DONE
~~#10. Album Listening Arc~~ — DONE
~~#16. Taste Drift Dashboard~~ — DONE

---

### Effort C: Marketplace Upgrade (needs its own plan — see `.plan/`)

Both touch `sellerMonitoringService` and enhance the marketplace workflow. Complex enough to warrant a dedicated plan file.

**#19. Discogs Marketplace Price Trend Tracking (region-filtered)**
- **Category:** Integration / Analytics | **Size:** Medium
- **Design note:** Must support region/country filters (e.g., "available in United States") so users aren't tracking irrelevant international listings.
- **Description:** Extend `sellerMonitoringService.ts` to persist price snapshots per release per scan in `price-history.json`. Add `priceAlertThreshold` field to wishlist items. Generate alerts when observed prices cross threshold. Price history chart on marketplace page.

**#20. Seller Match Auto-Scan with Notifications**
- **Category:** Feature | **Size:** Medium
- **Description:** Background cron job on server startup (node-cron or setInterval) calling existing `sellerMonitoringService.scanSeller()` for all monitored sellers on configurable schedule (daily, every 6 hours). Uses existing `jobStatusService` and notification system to surface new matches. Turns seller monitoring from manual to passive.

---

### Effort D: Small Independent Features (no dependencies, can pair or solo)

**#5. Per-Album Personal Journal/Notes**
- **Category:** Feature | **Size:** Small
- **Description:** Add per-album free-form notes on ReleaseDetailsPage — a textarea with timestamped entries. Store in `data/notes/album-notes.json` keyed on Discogs release ID. Expose `GET/POST /api/v1/notes/:releaseId` endpoints. Turns the app from a stats tracker into a personal vinyl diary.

**#9. CSV/JSON Collection Export**
- **Category:** Integration | **Size:** Small
- **Description:** Add `/api/v1/export` endpoints that serialize collection, scrobble history, and wishlist data to CSV or JSON with flattened fields and ISO date strings. Delivered as file download response. Add download buttons to Collection and Stats pages. Data portability / trust signal.

---

### ~~Effort E: Build Infrastructure~~ — DONE

~~#6. Webpack Bundle Splitting~~ — DONE

---

### Effort F: Context Tags (needs its own plan — see `.plan/`)

Full-stack feature touching data model, UI, and analytics. Complex enough to warrant a dedicated plan file.

**#18. Context Tags (inline on Release Details)**
- **Category:** Feature / Analytics | **Size:** Medium
- **Design note:** Tags live on ReleaseDetailsPage scrobble flow, not buried in ScrobblePage form. Inline tag chips tappable before/after scrobbling. Users can create custom tags on the fly ("late night", "cooking", "focused listen", "party").
- **Description:** Add `context?: string[]` field to `ScrobbleSession`. Tag selector on ReleaseDetailsPage. `getScrobblesByContext()` query in statsService. "Context Breakdown" chart on StatsPage.

---

## Items Needing a Dedicated Plan

| Item(s) | Why | Plan file |
|---------|-----|-----------|
| #18 Context Tags | Full-stack: new data model, tag CRUD, inline UI, analytics queries, new chart | `.plan/context-tags-plan.md` — CREATED |
| #19 + #20 Marketplace Upgrade | Price history schema, region filtering, alert thresholds, background cron, notifications | `.plan/marketplace-upgrade-plan.md` — CREATED |

---

## Session Stats

| Agent | Accepted | Declined |
|-------|----------|----------|
| Tech Debt Auditor | 5 | 0 |
| UX & Design Critic | 5 | 1 |
| Data & Analytics Visionary | 3 | 2 |
| Power User Advocate | 3 | 1 |
| Performance Engineer | 3 | 2 |
| Feature Scout | 2 | 3 |
| Integration Explorer | 2 | 4 |

**Total: 25 accepted / 14 declined from 39 pitches. 20 done, 5 remaining.**
