# Marketplace Upgrade Plan (#19 + #20) — CANCELLED

> **Status: Cancelled (2026-10-14).**
> #19 (price alerts) is superseded by
> [../done/wishlist-price-alerts-plan.md](../done/wishlist-price-alerts-plan.md), which
> covers only wishlist price alerts. The seller-monitoring parts of this plan
> and #20 (seller match auto-scan) were dropped at the user's request on
> 2026-10-14 ("i dont want the seller monitoring, thats different"). The
> full 2026-10-11 version (~1,040 lines) is in git history before this
> change. Only the verified Discogs API facts are kept below.

## What was dropped

- Per-listing price history for monitored sellers' wishlist matches.
- Alert rules per master or release with media/sleeve grade limits and
  delivered-price (shipping) basis.
- Listing fidelity changes (`ships_from`, shipping, split condition grades).
- Server-side scheduler for seller scans (#20), and the shared
  `scheduledTaskService` meant for label/website scans too.
- Server-side persistent, deduplicated notifications (`NotificationService`,
  `NotificationsProvider`) and the notification-bell fix (G2).
- Price history chart and market-wide lowest-asking series.
- Settings v2 handling for the March 2026 leftover `data/sellers/settings.json`
  and the leftover `data/sellers/price-history.json` (both still untouched).

Gaps found by the 2026-10-11 audit that still exist in the code: G2
(`useNotifications` state is per hook instance, the bell can overwrite other
pages' notifications), G9 (no scheduler for seller scans, label scans or
wishlist auto-sync; `autoSyncInterval` and `autoScanIntervalHours` are saved
but unread), G10 (`SellerMonitoringService.getSettings` falls back to
defaults unless `schemaVersion === 1`), G11 (`FileStorage` has no write
serialization).

## Discogs API facts (verified 2026-10-11 spike unless noted)

Official docs (<https://www.discogs.com/developers>) returned 403 to
automated fetches; facts come from read-only calls through the app's own
`DiscogsService` auth and from the official docstrings.

**Endpoints**

| Endpoint | Returns |
|----------|---------|
| `GET /users/{username}/inventory` | One seller's current For Sale listings: `price` (viewer currency), `original_price` (seller currency), `shipping_price`, `condition`, `sleeve_condition`, `ships_from` (country name), `release {id, ...}`, `seller {...}`. No `master_id` |
| `GET /marketplace/listings/{id}` | One listing, same fields; 404 when gone |
| `GET /marketplace/stats/{release_id}` | `num_for_sale`, `lowest_price {value, currency}`, `blocked_from_sale`. Null `lowest_price`/`num_for_sale` when nothing is for sale. No seller or country |
| `GET /marketplace/price_suggestions/{release_id}` | Suggested price per media grade (keys like "Very Good Plus (VG+)"), in the user's selling currency; needs seller settings filled in. Not sale data |
| `GET /masters/{id}` | Includes `lowest_price` / `num_for_sale`, but across **all formats** (verified 2026-10-14) |

- **No endpoint lists all marketplace listings for a release** (verified
  2026-10-14), and **no endpoint returns sales history or sold prices**.
  A listing that disappears is "no longer listed", never "sold".
- **Currency:** `curr_abbr` converts `price` and `shipping_price` on
  listings and `lowest_price` on stats; `original_price` stays in the
  seller's currency. Without `curr_abbr`, stats use the buyer currency and
  price suggestions use the selling currency, which can differ.
- **Shipping:** `shipping_price` is filled only on authenticated requests
  (calculated to the user's address); `{}` when anonymous. Empty means
  unknown, never 0. Not captured: what a seller who doesn't ship to the
  user returns. `seller.shipping` is free text; don't parse it.
- **Rate limit:** `discogsAxios.ts` throttles to ~1 req/s with a 60/min
  token bucket and a 30s pause on 429; background and interactive calls
  share it.
