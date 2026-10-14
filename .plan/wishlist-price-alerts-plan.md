# Wishlist Price Alerts Plan (#19, narrowed)

Backlog item #19 from `.plan/backlog-shark-tank-2026-03-08.md`. Replaces the
#19 part of [cancelled/marketplace-upgrade-plan.md](cancelled/marketplace-upgrade-plan.md).

> **Status: Implemented (2026-10-14) on branch `feat/wishlist-price-alerts`, not yet merged.**
> Backend: `WishlistPriceService` (price cache, rolling refresh, alerts,
> notifications via the job toast), routes under `/wishlist/price-alerts`,
> backup of alerts. Frontend: lowest listing and alert control on each
> wantlist card (`components/wishlist/WishlistPriceAlert.tsx`), a Price
> alerts tab, a background progress line and quiet re-reads of prices while
> the page is open.
>
> **Verified on a copy of real data with real Discogs calls:** setting an
> alert on Spirit Of Eden at $40 checked its 26 vinyl pressings right away
> and fired ("from $11.83", a 1988 UK Parlophone LP, 23 for sale). One tick
> checked 15 pressings in 36s with no failures. The wishlist has 746
> distinct vinyl pressings, so the first full pass takes about 4 hours.
>
> **Deviations / decisions made while building:** an alert keeps the
> currency it was set in; after a currency change it shows a note and isn't
> compared until saved again. The card's old "From:" price is shown only on
> cards without the new price section. Fixed on the way: the Wishlist
> page's play-count loader re-requested albums with no result in an endless
> loop (23 requests in 100ms in a test); each album is now requested once.

---

## 0. Summary

Tell the user when any vinyl pressing of a wishlisted record is for sale at
or below a price they set, and show the current lowest listing on each
wishlist card next to the field where they set that price.

- Per vinyl pressing, the app keeps the lowest current asking price from
  Discogs marketplace stats, refreshed in the background.
- The user sets an alert price per record (per master) right on the
  wishlist card.
- When a pressing is listed at or below that price, the app shows a toast,
  highlights the record ("Below your price") and lists it first on a new
  "Price alerts" tab.

This also fixes the wishlist's existing "Affordable" tab and price sort,
which never had any price data to work with (section 2).

---

## 1. Scope (user decisions, 2026-10-14)

User's words:

- "i only care about price alerts, i want to know when any version of a
  record is available from the united states for under a certain price"
- "i dont want the seller monitoring, thats different"
- "you also need to show lowest listing on wishlist page next to where can
  set alert level. so i can set alert level right on wishlist page"

In scope:

- Lowest current vinyl listing per wishlist record, shown on the wishlist page.
- One alert price per record (master), set and cleared on the wishlist card.
- Background refresh of pressing prices; toast when an alert fires.

Out of scope (dropped by the user):

- Seller-monitoring price history, per-listing alert rules, grade
  (condition) filters, shipping / delivered-cost fidelity, price charts.
- Scheduled seller scans (#20).
- The server-side notification system and fixing the notification bell.

Not covered in v1: albums on the **local** want list (no Discogs master;
see open question Q1).

---

## 2. Verified facts and the chosen approach

### 2a. "Any US seller" cannot be checked exactly

**Verified:** the Discogs API has no endpoint that lists all marketplace
listings for a release. Listings are only reachable per seller
(`/users/{username}/inventory`) or per listing ID. So "is any US seller
selling a pressing of this record under $X" can't be answered exactly.

**Chosen approach:** for each vinyl pressing, call
`GET /marketplace/stats/{release_id}?curr_abbr=<wishlist currency>`. It
returns `lowest_price` (lowest current asking price) and `num_for_sale`,
with no seller or country. An alert fires when any vinyl pressing of the
record's master has `lowest_price <= maxPrice`.

Consequences (state these in the UI help text):

- It never misses a qualifying US listing: if a US seller lists at or
  below the price, the pressing's lowest price is at or below it too.
- It can fire for a listing from outside the US. The alert links to the
  pressing's marketplace page (`https://www.discogs.com/sell/release/{id}`),
  where the user filters by ships-from country.
- Prices are asking prices **before shipping**, vinyl pressings only, in
  the wishlist currency.

### 2b. Master-level stats can't be used

**Verified (one read-only call, 2026-10-14):** `/masters/{id}` returns
`lowest_price` and `num_for_sale`, but across all formats. For Spirit Of
Eden it gave $6.58 across 620 listings, CDs included. Per-pressing stats
for vinyl pressings of the same master gave, for example, `null` (0 for
sale) and $39.28 (3 for sale). So prices must be fetched per vinyl
pressing.

### 2c. The wishlist never had price data

**Verified on the live data and code:**

- 0 of 206 wishlist items had `lowestVinylPrice`, and no cached version had
  `marketplaceStats`.
- `WishlistService.getMasterVersions` does not fetch prices.
- `WishlistService.getMarketplaceStats` makes 2 calls per release (stats +
  price suggestions); it is only used on demand for one release.

So the existing "Affordable" tab (`WishlistSettings.priceThreshold`) and the
price sort never worked. This feature fills `lowestVinylPrice` /
`priceCurrency` from the new price cache, which makes both work.

### 2d. Scale and rate limit

**Verified:** 843 vinyl pressings across 206 records, at most 46 for one
master. At Discogs' ~1 request/second (shared `discogsAxios` throttle,
60/min bucket), a full pass is ≈ 14 minutes of calls. That rules out
fetching prices when the wishlist page loads; prices come from a cache
filled in the background (section 3b).

---

## 3. Design

### 3a. Data

| File | Content | Keyed by | Backed up |
|------|---------|----------|-----------|
| `data/wishlist/pressing-prices.json` | `PressingPriceStore`: per pressing `lowestPrice` (null = none for sale), `currency`, `numForSale`, `fetchedAt` | release ID | No (re-derivable cache) |
| `data/wishlist/price-alerts.json` | `WishlistPriceAlertStore`: per master `maxPrice`, `currency`, `createdAt`, `updatedAt`, `lastNotifiedPrice?`, `lastNotifiedAt?` | master ID | Yes, as `BackupData.wishlistPriceAlerts` (optional field, older backups import fine) |

Both files are `schemaVersion: 1` and should be registered with
`MigrationService` like the other wishlist files.
Types live in `src/shared/types.ts`: `PressingPriceEntry`,
`PressingPriceStore`, `WishlistPriceAlert`, `WishlistPriceAlertStore`,
`WishlistPriceAlertView`, `WishlistLowestListing`,
`WishlistPriceRefreshStatus`.

The pressing list per master comes from the existing versions cache
(`wishlist/versions-cache.json`, vinyl versions only). The price cache does
not duplicate it.

### 3b. Background refresh

A rolling refresh on the server, independent of any open page:

- Runs every **5 minutes**; each tick fetches at most **15 pressings**
  (one stats call each, `curr_abbr` = wishlist currency).
- A pressing is due when its entry is older than **6h** (record has an
  alert) or **24h** (no alert).
- Order: pressings of records with an alert first, then never-checked
  pressings, then oldest `fetchedAt`.
- Setting or changing an alert refreshes that record's pressings right
  away (outside the tick budget, still through the shared throttle).
- A release whose fetch fails is skipped for about **1 hour** (in-memory
  backoff), then retried.
- One tick at a time; a tick that is still running when the next is due is
  skipped.
- After each tick, alerts for the records touched are evaluated (3c).

Budget check: 15 pressings / 5 min = 180/h ≈ 4,300/day, against ≈ 1,000/day
needed for 843 pressings at 24h plus alerted ones at 6h. The first full
pass takes ≈ 4.7h of ticks; the progress line (3e) shows it.

### 3c. Alerts

- One alert per master: `maxPrice` in the wishlist currency, before
  shipping, vinyl only.
- Lowest listing for a record = minimum `lowestPrice` over its checked
  vinyl pressings (ignoring nulls and entries in another currency).
- **Triggered** while the lowest listing is `<= maxPrice`.
- **Notify** when triggered and either no notification has been sent, or
  the price is below `lastNotifiedPrice`. Store the new
  `lastNotifiedPrice` / `lastNotifiedAt`.
- **Reset** (`lastNotifiedPrice` cleared) when the lowest listing goes back
  above `maxPrice`, so a later drop notifies again.
- Changing `maxPrice` clears the notify state.

### 3d. API

- `GET /api/v1/wishlist`: each item carries `lowestListing`
  (`undefined` = no pressing checked yet, `null` = checked and none for
  sale, otherwise a `WishlistLowestListing`) and `priceAlert`
  (`WishlistPriceAlertView` with `triggered`). Also fills
  `lowestVinylPrice` / `priceCurrency`.
- `PUT /api/v1/wishlist/price-alerts/:masterId` with `{ maxPrice }`:
  create or update; validates a positive number; uses the wishlist
  currency; triggers an immediate refresh of that record's pressings.
- `DELETE /api/v1/wishlist/price-alerts/:masterId`.
- `GET /api/v1/wishlist/price-alerts/status`: `WishlistPriceRefreshStatus`
  (pressings total / fresh / unchecked, last run, alerts triggered / total).

Client methods are in `src/renderer/services/api.ts` (committed).

### 3e. Notification

- When an alert fires, the server records it and the existing
  background-job poller on the client shows a **toast** ("<Artist> –
  <Title> is listed at $X, below your $Y"), with a link to the pressing's
  marketplace page.
- The record stays highlighted ("Below your price") while triggered, and
  appears first on a new **"Price alerts"** wishlist tab.
- The notification bell is deliberately not used: it has its own
  shared-state bugs (G2 in the cancelled marketplace plan).
- **Assumption:** the toast only reaches the user while the app is open;
  the highlight and tab cover alerts that fired while it was closed.

### 3f. UI (wishlist page)

On each wishlist card, side by side:

- **Lowest listing:** price, pressing summary (country, year, format,
  label), copies for sale, and a link to
  `discogs.com/sell/release/{releaseId}`. "Not checked yet" while
  undefined; "None for sale" when null; "N of M pressings checked" while
  partial.
- **Alert price:** a number input with save/clear. Shows the currency.
  Triggered state: "Below your price" badge.

Page level: a progress line ("Checking prices: 312 of 843 pressings")
while pressings are unchecked, from the status endpoint. New "Price
alerts" tab listing records with an alert, triggered ones first.

Follow the project CSS rules: co-located `.page.css`, design tokens,
`lucide-react` icons, no inline styles.

---

## 4. Edge cases

- **Currency change** in wishlist settings: cached prices in the old
  currency are treated as stale and refetched; alerts keep their stored
  currency and are not compared until the user re-saves them in the new
  currency (show "alert in EUR, prices in USD").
- **Record removed from the wishlist:** its alert is kept (in case it comes
  back) but ignored by refresh and evaluation. Its pressing prices age out
  of the refresh order.
- **Pressing count changes** (new pressing added to the master, versions
  cache refreshed): new pressings are "never checked" and go to the front;
  `pressingsChecked / pressingsTotal` reflects the change. Prices for
  pressings no longer listed are ignored.
- **No vinyl pressings:** no lowest listing ("No vinyl pressings") and the
  alert field is disabled.
- **Discogs errors:** 404 or other failure → per-release ~1h backoff, keep
  the last cached value; 429 is handled by the shared throttle (30s pause).
  A null `lowest_price` with `num_for_sale` 0 is a valid "none for sale".
- **Blocked from sale** (`blocked_from_sale: true`): treat as none for sale.
- **Concurrent writes:** the refresh and the alert routes write different
  files. `FileStorage` has no locking (G11 in the cancelled plan), so each
  service should serialize its own read-modify-write cycles so a tick and a
  route handler can't lose updates.

---

## 5. Tests

- Service: due-pressing selection and ordering (alerted, never checked,
  oldest), per-tick limit, 6h/24h intervals, failure backoff.
- Service: lowest-listing computation (nulls, partial checks, mixed
  currencies, no vinyl pressings).
- Service: alert evaluation — first notify, no repeat at the same price,
  re-notify on a lower price, reset when the price rises above, reset on
  `maxPrice` change.
- Routes: PUT validation (missing, zero, negative, non-numeric), DELETE,
  status shape, `GET /wishlist` item fields.
- Backup: `wishlistPriceAlerts` exported and imported; older backup without
  it imports cleanly.
- UI: card shows each lowest-listing state; setting/clearing an alert calls
  the API; "Price alerts" tab ordering; progress line; toast on a fired
  alert.
- Manual: run the dist build, set an alert above a known lowest price,
  confirm toast, highlight and tab.

---

## 6. Open questions

- **Q1. Local want-list albums.** They have no Discogs master, so v1
  ignores them. Supporting them needs a master/release lookup first.
- **Q2. US-only listings.** Not possible through the API (section 2a). The
  only way would be scraping the marketplace website, which is out of
  scope. If false alerts from non-US sellers turn out to be common,
  revisit.
- **Q3. Shipping.** Prices are before shipping; the alert price has no
  shipping allowance. Add a note in the UI; no setting in v1.
- **Q4. Refresh cadence.** 6h/24h and 15 pressings per 5 min are first
  guesses; adjust after watching the progress line and rate-limit logs.
