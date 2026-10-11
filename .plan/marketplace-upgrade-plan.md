# Marketplace Upgrade Plan: Price History, Price Alerts, Auto-Scan and Persistent Notifications (#19 + #20)

Backlog Effort C from `.plan/backlog-shark-tank-2026-03-08.md`.

> **Status (audited 2026-10-11): NOT STARTED, plan rewritten.**
> Seller monitoring, wishlist marketplace stats and a client-side
> notification bell already exist (section 1). None of this plan's features
> are in the code: no price history, no alert rules, no scheduled scans, and
> no server-side notifications. An attempt in March 2026 was not committed,
> but it left data files behind (section 1c). This rewrite fixes the three
> problems with the old plan: the misplaced global "region filter", price
> data that was never wired to a specific pressing, condition or currency,
> and claims that did not match the code. Every code reference below was
> checked against the current tree (branch `feat/album-version-merging`,
> 2026-10-11). Symbol names are used instead of line numbers.

---

## 0. Summary

Two linked features:

1. **#19 Price tracking and alerts.** Record the asking prices observed for
   wishlist-matched listings at monitored sellers. Let the user set alert
   rules per master (any pressing) or per specific release (one pressing).
   Rules can set limits on media and sleeve condition and use one currency.
   An alert fires when a listing's price meets a rule, and fires again only
   on a real further price drop.
2. **#20 Auto-scan.** Run the existing seller scan on a server-side schedule.
   Price history, alert checks and notifications are produced on the server
   when *any* scan finishes, so they work with no marketplace page open.

A prerequisite runs through both features: **notifications move to the
server.** They are stored in a file, deduplicated, carry read/unread state,
and are shown app-wide by a single shared provider.

---

## 1. Audit: what exists today

### 1a. Implemented (verified)

| Area | What exists | Where |
|------|-------------|-------|
| Monitored sellers | Add, validate, remove and list sellers. Stored in `sellers/monitored-sellers.json` | `SellerMonitoringService.addSeller` / `validateSellerExists` / `removeSeller` / `getSellers`; `src/backend/routes/sellers.ts`; `src/renderer/pages/SellersPage.tsx` |
| Inventory scan | Full and quick (page 1) scans, a 6h inventory cache, resume after partial progress, and a reverse-sort workaround for Discogs' 100-page inventory limit | `fetchSellerInventory`, `fetchReversePages`, `scanSeller`, `runScanInBackground`, constants `INVENTORY_CACHE_HOURS`, `FULL_SCAN_INTERVAL_DAYS`, `QUICK_CHECK_INTERVAL_HOURS` |
| Wishlist matching | Matching is **by master only**. The inventory API gives no `master_id`, so release→master is resolved through `sellers/release-master-cache.json` and `/releases/{id}`. A match covers any pressing of a wishlisted master, from both the Discogs wantlist and the local want list | `matchInventoryToWishlist`, `getWishlistMasterIds`, `lookupMasterId`, `loadReleaseCache` |
| Match lifecycle | Statuses `active`/`seen`/`sold`. Before marking a listing sold, up to 5 per scan are checked with `GET /marketplace/listings/{id}`. Sold matches are pruned after 30 days | `verifyListingStatus`, `verifyAndUpdateMatch`, `removeStaleMatches`, `CleanupService.cleanupSoldMatches` |
| Scan control | One scan at a time (`scanInProgress`), cancellation, scan of a single seller, a lock against concurrent release-cache refreshes, and scan status saved to `sellers/scan-status.json` | `startScan`, `startSingleSellerScan`, `cancelScan`, `getScanStatus`, `startReleaseCacheRefresh` |
| Seller settings | `scanFrequencyDays`, `quickCheckFrequencyHours`, `notifyOnNewMatch`, `vinylFormatsOnly`, set in Settings > Wishlist > "Local Sellers" | `SellerMonitoringSettings` (`src/shared/types.ts`); `SettingsWishlistSection.tsx` |
| Matches UI | Marketplace hub tabs `wishlist`, `new-releases`, `sellers`, `matches`, `missing-albums`, `labels`, `websites`; the matches list can be filtered by seller | `MarketplacePage.tsx` (`VALID_TABS`), `SellerMatchesPage.tsx` |
| Wishlist marketplace stats | Per release: `GET /marketplace/stats/{id}` and `GET /marketplace/price_suggestions/{id}`. Results are cached in `wishlist/versions-cache.json` and `EnrichedWishlistItem.lowestVinylPrice` | `WishlistService.getMarketplaceStats`, `getPriceSuggestions`, `getMasterVersions`; route `GET /api/v1/wishlist/:releaseId/marketplace` |
| "Affordable" filter | A single global `WishlistSettings.priceThreshold`, compared with `lowestVinylPrice` | `WishlistPage.tsx` (`case 'affordable'`) |
| Notifications (client only) | `AppNotification` / `NotificationStore` types. The `useNotifications` hook saves to `localStorage` under `recordscrobbles.notifications` and keeps at most 50 | `src/renderer/hooks/useNotifications.ts`, `NotificationBell.tsx`, `Header.tsx` |
| New-match notifications | Created by **SellersPage**, from its scan-status polling effect, after a scan completes. After that it calls `POST /api/v1/sellers/matches/:matchId/notified` | `SellersPage.tsx` polling `useEffect`; `markMatchAsNotified` |
| Background jobs | `jobStatusService` is an in-memory job list, pruned 5 minutes after a job completes; only the release-cache refresh uses it. The **only** server-side scheduler is the backup check in `startServer` (`setInterval` → `backupService.checkAndRunAutoBackup`, every 6h) | `src/backend/services/jobStatusService.ts`, `src/server.ts` |
| Migrations / backup | `MigrationService.register(key, meta)` registers `sellers/monitored-sellers.json`, `sellers/matches.json` and `sellers/settings.json` at v1. Backup `FILE_PATHS` covers `sellers/settings.json` and `sellers/monitored-sellers.json`, but not matches or caches | `migrationService.ts` `registerAllFiles`; `backupService.ts` `FILE_PATHS` |

### 1b. Gaps relevant to this plan (verified)

Found by reading the code; they have not been reproduced at runtime.

- **G1. Notifications only fire if SellersPage is open when a scan
  finishes.** New-match notifications come from the SellersPage polling
  effect, and that effect only runs while `scanStatus` is
  `scanning`/`matching`. If the user leaves the page, the matches keep
  `notified: false`. They surface only after a later scan completes while
  the page is open *and* reports `newMatches > 0`.
- **G2. `useNotifications` state is not shared.** Each call to the hook has
  its own `useState`, loaded from `localStorage` once on mount. The bell
  (`Header`) never sees notifications added by other pages until it is
  remounted. Its next write (mark read, remove, clear) saves its stale list
  and can wipe notifications that pages added. No React context and no
  `storage` event listener exists.
- **G3. No listing location or shipping data is kept.** `fetchSellerInventory`
  builds `SellerInventoryItem` without `ships_from` or any shipping field.
- **G4. Media and sleeve condition are stored as one string.**
  `condition: \`${listing.condition || '?'}/${listing.sleeve_condition || '?'}\``
  can't be filtered by grade.
- **G5. Price changes overwrite the old price.** For listings already
  matched, `matchInventoryToWishlist` and the quick-scan branch of
  `scanSeller` replace `price`/`currency`/`condition` in place. No earlier
  value is kept.
- **G6. Currency handling.** Nothing converts currencies, and the codebase
  never sends `curr_abbr`. `WishlistService.getMarketplaceStats` takes
  `currency` from `lowest_price.currency`, or from the VG suggestion's
  currency when there is no lowest price. Those can be two different
  currencies (buyer currency vs selling currency, see section 2). The
  "affordable" filter compares `lowestVinylPrice` with `priceThreshold`
  and ignores currency.
- **G7. "Median" and "highest" are not market statistics.**
  `getMarketplaceStats` sets `medianPrice` to the VG+ (or VG) *price
  suggestion* and `highestPrice` to the largest suggestion. Collection
  analytics (`collectionAnalyticsService`, `statsService` ROI) consume these
  as "median" values, and `ValueEstimationSection.tsx` calls them "median
  sale prices". This is outside this plan, but section 4h fixes the
  naming for any new UI. The collection-analytics wording should be logged
  in `tech-debt.md` separately.
- **G8. Seller matching ignores the wishlisted pressing.**
  `getWishlistMasterIds` collects master IDs only. A want for one specific
  pressing matches every pressing of its master. That is fine for
  discovery, but alerts must be able to target one release ID.
- **G9. No scheduler for seller scans, label scans or wishlist auto-sync.**
  `WishlistSettings.autoSyncInterval` and
  `LabelMonitoringSettings.autoScanIntervalHours` are saved but nothing
  reads them. `.plan/reissue-label-discovery-plan.md` ("Remaining work"
  items 3–5) needs the same scheduler and notification plumbing. Build
  them once (sections 4d and 4e).
- **G10. Settings reads require exactly `schemaVersion === 1`.**
  `SellerMonitoringService.getSettings` falls back to *defaults* when the
  file has any other version, and `saveSettings` spreads those defaults.
  This matters right now, see 1c.
- **G11. No write serialization.** `FileStorage` has no lock or queue. A
  background scan and HTTP handlers that read-modify-write the same JSON
  file can lose updates. That is safe today only because writers rarely
  overlap.

### 1c. Leftovers from the March 2026 attempt (verified, data untouched)

| File | Current content | Effect today | Planned handling |
|------|-----------------|--------------|------------------|
| `data/sellers/settings.json` | `schemaVersion: 2`, plus `autoScanEnabled`, `autoScanIntervalHours`, `autoScanLastRun`, `autoScanNextRun` | `getSettings` ignores the file (G10) and returns defaults. `MigrationService` skips it at startup (newer than v1). The user's values happen to equal the defaults, so nothing visible is wrong yet. The first save overwrites the file as v1 and drops the auto-scan keys | Phase 0: `getSettings` accepts v1 **or** v2, merges defaults and maps `autoScanEnabled` (section 3f). It writes v1 on the next save |
| `data/sellers/price-history.json` (+3 `.bak`) | v1, 4 masters, keyed by master, one snapshot each with `shipsFrom: "United States"` | Unused | Not read by the new code. The new history lives at a different path (section 3b). Archiving or deleting it is an open decision (D7) |
| `data/wishlist/settings.json` | Includes `priceAlertEnabled: false` | Ignored. The `POST /wishlist/settings` route whitelists its fields | Leave as is. No field of that name is reintroduced in `WishlistSettings` |

The leftover snapshot is useful evidence: the inventory payload does contain
`ships_from` with a country name.

### 1d. Problems in the previous version of this plan

| Old plan said | Reality / fix |
|---------------|---------------|
| A global `WishlistSettings.regionFilter` on WishlistPage scopes alerts, history, the versions modal and matches to "listings that ship from the user's region" | This confused the seller's location (`ships_from`) with shipping availability. One wishlist dropdown cannot express either. **Removed.** Seller location is shown and can optionally filter a single alert rule (section 2d). Delivered cost is modeled separately and is `null`/"unknown" when the API does not give it |
| `PriceSnapshot` keyed by master, one `condition` string, `price` compared to `priceAlertThreshold` in "user's currency" | Pressing, media vs sleeve grade and currency were never wired through. Replaced by per-listing observations that store `releaseId` + `masterId`, separate media/sleeve grades, and amounts tied to a currency (section 3b) |
| Alert threshold on `WishlistItem` | `wishlist/wishlist-items.json` is rebuilt on every Discogs sync, so a threshold stored there would be lost. Rules move to their own file (section 3c) |
| Deliver alerts through `pendingAlerts` on scan-status polling + `useNotifications` | Has the same weakness as G1 and G2. Replaced by a server notification store (section 3e) |
| `migrationService.registerDataFile(...)` | The method is `register(key, meta)` |
| Migrate seller settings v1 → v2 | That would break `getSettings` (G10). New fields are optional and additive, and the file stays at v1 |
| `setInterval` "matches existing pattern in `server.ts` line ~716" | The pattern exists, inside `startServer` after `app.listen`, but not at that line. Use symbols |
| `autoScanIntervalHours` 6/12/24/48 | Below `quickCheckFrequencyHours` (default 24), a scan skips every seller that is not due (`runScanInBackground` skip check). Auto-scan uses the existing due rules instead (section 4e) |
| "Median" price from Discogs | Comes from price suggestions, not sales (G7, section 2) |

---

## 2. Discogs API: what we can and cannot get

Official reference: <https://www.discogs.com/developers>. On 2026-10-11 the
page returned HTTP 403 to automated fetches. The quotes below come from the
official docstrings as mirrored by a client library
(<https://cljdoc.org/d/io.trosa/discogs/0.1.2/api/discogs.marketplace>),
from fields this codebase already parses, and from the leftover data in 1c.
Anything else is marked **Assumption**.

### 2a. Endpoints

| Endpoint | What it represents | Currency | Used today | Source / confidence |
|----------|--------------------|----------|------------|---------------------|
| `GET /users/{username}/inventory` | That seller's **current asking prices** for For Sale listings: `id`, `price {value, currency}`, `original_price {curr_abbr, value, formatted}`, `shipping_price`, `original_shipping_price`, `condition` (media), `sleeve_condition`, `posted`, `uri`, `release {id, title, artist, format, thumbnail}`, `ships_from`, `seller {username, shipping, payment, min_order_total, ...}` (field list **confirmed by API spike 2026-10-11**, see 2f) | `price` in the viewer's currency; `original_price` in the seller's listing currency | Yes (`fetchSellerInventory`) | Fields confirmed by the code and by 1c. Docs: "If you are not authenticated as the inventory owner, only items that have a status of For Sale will be visible." <https://www.discogs.com/developers/#page:marketplace,header:marketplace-inventory> |
| `GET /marketplace/listings/{listing_id}` | One listing, same fields as an inventory listing. 404 when it is gone | **Confirmed (2f):** accepts `curr_abbr` and converts `price` and `shipping_price`; `original_price` stays in the seller's currency | Yes, only as an existence check (`verifyListingStatus`) | <https://www.discogs.com/developers/#page:marketplace,header:marketplace-listing> |
| `GET /marketplace/stats/{release_id}` | **Current** market state for one release: `num_for_sale`, `lowest_price` (lowest current asking price), `blocked_from_sale`. "Releases that have no items for sale ... will return a body with null data in the lowest_price and num_for_sale keys" | "Authenticated users will by default have the lowest currency expressed in their own buyer currency ... in the absence of the curr_abbr query parameter" | Yes (`getMarketplaceStats`) | <https://www.discogs.com/developers/#page:marketplace,header:marketplace-release-statistics> |
| `GET /marketplace/price_suggestions/{release_id}` | Discogs' **suggested** price per media grade (Mint … Poor). "Authentication is required, and the user needs to have filled out their seller settings." "If no suggestions are available, an empty object will be returned." | "denominated in the user's selling currency" | Yes (`getPriceSuggestions`) | <https://www.discogs.com/developers/#page:marketplace,header:marketplace-price-suggestions> |
| `GET /releases/{release_id}` | Release data, incl. `master_id`. **Assumption:** also `lowest_price` / `num_for_sale` and a `curr_abbr` param | — | Yes, for `master_id` only (`lookupMasterId`) | <https://www.discogs.com/developers/#page:database,header:database-release> |

### 2b. Asking price vs sale price

- **Asking price:** what a listing costs now. It comes from the inventory
  and listing endpoints, and as an aggregate from `marketplace/stats` →
  `lowest_price`. Everything this plan records is an asking price.
- **Suggested price:** `price_suggestions` returns one value per media grade,
  in the user's *selling* currency, and only works if seller settings are
  filled in. Discogs does not document how it is calculated. **Never call
  it a sale price or a median.**
- **Completed sale price / sales history:** the Discogs website shows "Last
  sold" and low/median/high sale prices on release pages. **No documented
  API endpoint returns sales history or sold prices** (not in the official
  docstrings above). Scraping the website is out of scope. **Conclusion:**
  the app cannot show real sale prices. A listing that disappears from an
  inventory or returns 404 is "no longer listed". It may have been sold,
  edited away or delisted. Its last asking price must never be recorded as
  a sale price.

### 2c. Currency

- **Confirmed by the 2026-10-11 spike (2f):** a listing has two prices.
  `original_price` is the seller's own listing currency and amount.
  `price` (and `shipping_price`) are in the requesting user's currency, and
  `curr_abbr` converts them: the same USD 159.99 listing came back as
  EUR 142.39 and JPY 25,329.62, with `original_price` unchanged. Store
  `original_price` as the source of truth, and treat `price` as a
  Discogs-converted convenience value.
- `marketplace/stats` uses the buyer currency unless `curr_abbr` is sent,
  and `price_suggestions` uses the selling currency. The two can differ for
  the same user (G6).
- **Design:** v1 does no FX conversion. Every stored amount keeps its
  currency code. Alert rules have one currency and only compare listings in
  that currency. Listings in other currencies show "different currency —
  not compared". `curr_abbr` conversion is confirmed to work (see above),
  so converting into the user's currency is a viable alternative; it is
  open decision D3.

### 2d. Seller location vs shipping availability vs delivered cost

These are three different facts:

1. **Seller location (`ships_from`).** The country the item ships *from*,
   confirmed in the inventory payload (1c). It does **not** say whether
   the seller ships to the user.
2. **Shipping availability.** Whether the seller ships to the user's
   country at all. The API has no structured per-destination policy:
   `seller.shipping` is the seller's free-text terms (for example "WE DO
   NOT SHIP OVERSEAS"), which the app must not try to parse. Availability
   is inferred only from `shipping_price` (point 3).
3. **Delivered cost.** Item price plus shipping to the user. **Confirmed
   (2f):** on **authenticated** requests, inventory and listing responses
   include `shipping_price {value, currency}`, calculated for the
   authenticated user's address (two sellers returned 14 and 7 USD for
   their newest listings). The same listing fetched **without**
   authentication returns `shipping_price: {}`. So delivered cost
   = `price.value + shipping_price.value` when both are present, in the
   same currency. An empty `shipping_price` means unknown (not
   authenticated, or the seller may not ship to the user; the spike could
   not tell these apart), never 0. **Not yet confirmed:** what a seller who
   does not ship to the user's country returns. Capture one such listing
   when implementing Phase 1.

**Design rule:** an unknown shipping cost or delivered price is stored as
`null` with `shippingStatus: 'unknown'` and shown as "Shipping unknown" /
"Delivered: unknown". **It is never stored as 0.** The default alert basis
is the item price. A delivered-price rule fires only when shipping is known
(section 3c).

### 2e. Rate limits

`discogsAxios.ts` throttles to about 1 request/second, with a 60/min token
bucket and a 30s pause on 429 ("Discogs allows 60 req/min authenticated").
Background scans share this bucket with interactive requests. Auto-scan
does not add calls of its own. It runs the same scan, and the scan stays
quick-check-heavy (section 4e).

### 2f. Phase 0 API spike

**Done 2026-10-11 (partially).** Read-only GET requests were made through
the app's own `DiscogsService` auth headers, with the user's permission:
`/users/{seller}/inventory` (two monitored sellers),
`/marketplace/listings/{id}` with and without `curr_abbr` (USD, EUR, JPY),
the same listing without authentication,
`/marketplace/stats/{release_id}` with and without `curr_abbr`, and
`/marketplace/price_suggestions/{release_id}`. Results:

- **Shipping:** `shipping_price` and `original_shipping_price` exist on
  inventory and listing responses. Populated only when authenticated
  (calculated to the user's address); `{}` when anonymous (2d).
- **Currency:** `curr_abbr` converts `price` and `shipping_price` on
  listings and `lowest_price` on stats. `original_price` keeps the
  seller's currency (2c).
- **Stats:** `{num_for_sale, lowest_price {value, currency},
  blocked_from_sale}`, converted by `curr_abbr`.
- **Price suggestions:** works for this account (seller settings filled
  in). Keys are the full grade names ("Very Good Plus (VG+)"), values in
  USD.

**Still open (capture during Phase 1, as redacted test fixtures):**
- a listing from a seller that does not ship to the user's country
- the full `ships_from` vocabulary and the sleeve grade strings
  (`Generic`, `Not Graded`, `No Cover`)

---

## 3. Data model

All new stores extend `VersionedStore` with `schemaVersion: 1`. Timestamps
are `Date.now()` milliseconds. Amounts are stored in **integer minor units**
together with a currency code. `toMinorUnits(value, currency)` and
`fromMinorUnits` get the exponent from
`Intl.NumberFormat(..., { style: 'currency', currency }).resolvedOptions().maximumFractionDigits`
(JPY = 0, USD = 2). Existing types keep their float `price` for
compatibility.

### 3a. Listing fidelity (extend existing types)

```typescript
// src/shared/types.ts
export type MediaGrade =
  | 'M' | 'NM' | 'VG+' | 'VG' | 'G+' | 'G' | 'F' | 'P';
export type SleeveGrade = MediaGrade | 'Generic' | 'Not Graded' | 'No Cover';

export type ShippingStatus = 'unknown' | 'known';

export interface ListingShipping {
  status: ShippingStatus;
  amount: number | null;      // null when unknown; never 0-as-unknown
  currency: string | null;
  destinationCountry?: string; // what `amount` was quoted for, if known
}

export interface SellerInventoryItem {
  // ...existing fields (condition stays for back-compat display)...
  mediaCondition?: MediaGrade | null;   // parsed from listing.condition
  sleeveCondition?: SleeveGrade | null; // parsed from listing.sleeve_condition
  shipsFrom?: string | null;            // raw listing.ships_from (seller location)
  shipping?: ListingShipping;           // default { status: 'unknown', amount: null, currency: null }
}

export interface SellerMatch {
  // ...existing fields...
  mediaCondition?: MediaGrade | null;
  sleeveCondition?: SleeveGrade | null;
  shipsFrom?: string | null;
  shipping?: ListingShipping;
  deliveredPrice?: number | null;       // price + shipping.amount when both known & same currency; else null
  firstPrice?: number;                  // price when first matched (for "dropped from" UI)
}
```

- `parseGrade()` maps Discogs' full strings (for example `"Near Mint (NM
  or M-)"`) to codes, and maps unknown strings to `null`. Old matches keep
  the combined `condition` string. They get the new fields the next time a
  scan sees them; there is no file migration, because the fields are
  optional.
- The previous `regionFilter` is gone. Seller location stays as the raw
  string. Comparisons trim and ignore case.

### 3b. Price history: `data/marketplace/price-history.json`

This store holds asking prices observed at monitored sellers, for
wishlist-matched listings only. It is per listing, and a new point is added
only when something changes.

```typescript
export interface PricePoint {
  at: number;                 // when this price was first observed
  amountMinor: number;
  currency: string;
}

export interface ListingPriceHistory {
  listingId: number;
  sellerId: string;
  releaseId: number;          // specific pressing
  masterId: number | null;    // grouping; null if unresolved
  mediaCondition: MediaGrade | null;
  sleeveCondition: SleeveGrade | null;
  shipsFrom: string | null;
  points: PricePoint[];       // append only when amount or currency changes; cap 100
  firstSeenAt: number;
  lastSeenAt: number;         // bumped on every observation, no new point
  endedAt?: number;           // when it stopped appearing
  endReason?: 'not_in_inventory' | 'verified_unavailable';  // NOT "sold"
}

export interface PriceHistoryStore extends VersionedStore {
  schemaVersion: 1;
  lastUpdated: number;
  listings: Record<string, ListingPriceHistory>; // key: String(listingId)
}
```

- The chart groups by `masterId`, can filter to one `releaseId`, and splits
  series by currency and media grade. It shows the "lowest active asking
  price per day" among monitored sellers. It is labeled as such and is
  never called "market price".
- When a listing changes condition, the stored grades are updated. Grades
  are not versioned, because grade edits are rare.

### 3c. Alert rules: `data/marketplace/alert-rules.json`

```typescript
export type AlertTarget =
  | { type: 'master'; masterId: number }                    // any pressing
  | { type: 'release'; releaseId: number; masterId: number | null }; // one pressing

export interface PriceAlertRule {
  id: string;                 // uuid
  revision: number;           // bumped on any edit; resets notify eligibility
  target: AlertTarget;
  label: string;              // "Artist - Title" (snapshot for display when off-wishlist)
  maxPriceMinor: number;
  currency: string;           // only listings in this currency are compared (v1, no FX)
  priceBasis: 'item' | 'delivered'; // default 'item'
  minMediaCondition?: MediaGrade;   // e.g. 'VG+' => VG+, NM, M
  minSleeveCondition?: MediaGrade;  // Generic/Not Graded/No Cover fail unless allowUngradedSleeve
  allowUngradedSleeve?: boolean;
  shipsFromAllowList?: string[];    // optional: seller location only, labeled "Ships from"
  enabled: boolean;
  status: 'active' | 'paused_off_wishlist'; // target no longer on any wishlist
  createdAt: number;
  updatedAt: number;
}

export interface PriceAlertRulesStore extends VersionedStore {
  schemaVersion: 1;
  rules: PriceAlertRule[];
}
```

- **Precedence:** for a given listing, a `release` rule for that listing's
  `releaseId` overrides `master` rules for its master. Within one target,
  each rule is checked separately, but at most one notification is sent per
  listing per scan. It names the rule with the lowest `maxPriceMinor`.
- **`priceBasis: 'delivered'`** fires only when
  `shipping.status === 'known'` and the shipping currency equals the rule
  currency. Otherwise the listing appears in the alert's UI as "Item price
  within limit — shipping unknown" and **no** notification is sent.
- When a target leaves the wishlist, wishlist sync sets
  `status: 'paused_off_wishlist'` instead of deleting the rule. Rules are
  joined onto `GET /api/v1/wishlist` responses (`alertRuleIds`); they are
  never stored in `wishlist-items.json`.
- The existing global `WishlistSettings.priceThreshold` ("affordable"
  filter) stays as a view filter. Phase 6 adds a currency check: items
  whose `priceCurrency` differs from `WishlistSettings.currency` are
  excluded and counted as "N in other currencies".

### 3d. Alert notify state: `data/marketplace/alert-state.json`

This state is kept separately from notifications, so that deleting a
notification can't reset eligibility.

```typescript
export interface AlertNotifyState {
  ruleId: string;
  ruleRevision: number;
  listingId: number;
  currency: string;
  lastNotifiedAmountMinor: number;
  lastNotifiedAt: number;
}
export interface AlertStateStore extends VersionedStore {
  schemaVersion: 1;
  entries: Record<string, AlertNotifyState>; // key: `${ruleId}:${listingId}`
}
```

### 3e. Notifications: `data/notifications/notifications.json`

```typescript
export type NotificationKind =
  | 'seller-match' | 'price-alert' | 'auto-scan-error' | 'client' | 'legacy-import';

export interface AppNotification {          // extend existing type (all new fields optional)
  id: string;
  type: 'info' | 'success' | 'warning' | 'alert';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  action?: { label: string; route: string; externalUrl?: string };
  kind?: NotificationKind;
  dedupeKey?: string;
  readAt?: number;
  data?: Record<string, string | number | null>; // e.g. listingId, ruleId, amountMinor, currency
}

export interface ServerNotificationStore extends VersionedStore {
  schemaVersion: 1;
  revision: number;                  // bumped on every mutation (add/read/delete)
  notifications: AppNotification[];  // newest first
  dedupeIndex: Record<string, number>; // dedupeKey -> createdAt, outlives deleted notifications for 30d
}
```

**Dedupe keys**

| Kind | Key |
|------|-----|
| New seller match | `seller-match:{listingId}` |
| Price alert | `price-alert:{ruleId}:r{ruleRevision}:{listingId}:{currency}:{amountMinor}` |
| Auto-scan failure | `auto-scan-error:{YYYY-MM-DD}` (at most one per day) |
| Client-raised | Optional key from the caller; otherwise not deduped |

**Price-alert re-notify rule.** A listing qualifies when it passes the
rule's currency, condition, ships-from and basis checks and
`amountMinor <= maxPriceMinor`. A qualifying listing is notified when one
of these holds:

- no `AlertNotifyState` exists for it;
- `state.ruleRevision !== rule.revision`, because the user edited the rule;
- `state.currency !== currency`;
- `amountMinor <= state.lastNotifiedAmountMinor - minDrop`, where
  `minDrop = max(1 major unit, ceil(5% of lastNotified))`.

After notifying, `lastNotifiedAmountMinor` is set to the notified amount.
Price rises never reset that baseline, so a price that swings up and back
down does not notify again. Moves of a few cents do not notify. A relisting
gets a new `listingId` and is treated as new.

**Read/unread:** `read` + `readAt`. Supported operations: mark one read,
mark all read, delete one, clear all read.

**Retention** (applied on every write, plus in `CleanupService.runCleanup`):

- delete read notifications older than 90 days;
- delete unread notifications older than 180 days;
- soft cap of 500: drop the oldest *read* notifications first, and never
  drop unread ones younger than 30 days, even when over the cap;
- prune `dedupeIndex` entries older than 30 days.

**New seller matches:** the server creates the notifications and sets
`SellerMatch.notified = true` itself. It keeps the current batching: at
most 5 individual notifications, plus one "+N more matches" summary with
key `seller-match-summary:{scanStartedAt}`. All of this is gated by
`notifyOnNewMatch`.

### 3f. Settings additions (additive, stay at `schemaVersion: 1`)

```typescript
export interface SellerMonitoringSettings {
  schemaVersion: 1;
  // ...existing...
  autoScanEnabled?: boolean;      // default false; uses existing scanFrequencyDays / quickCheckFrequencyHours as cadence
  priceAlertsEnabled?: boolean;   // default true; global kill-switch for alert evaluation
}
```

- `getSettings` returns `{ ...DEFAULTS, ...stored, schemaVersion: 1 }` for a
  stored v1 or v2 file. It maps the leftover v2 `autoScanEnabled` and
  ignores `autoScanIntervalHours`/`autoScanNextRun`/`autoScanLastRun`
  (see 1c).
- Runtime timestamps such as the last auto-scan time and error belong in
  `sellers/scan-status.json`, not in settings. Settings are backed up;
  runtime state should not be. Extend `SellerScanStatus` with
  `trigger?: 'manual' | 'auto'`, `lastAutoScanAt?`, `lastAutoScanError?`
  and `alertsTriggered?`.
- No buyer-country setting in v1. It becomes useful only if Phase 0 finds
  destination-specific shipping (D2).

### 3g. File summary

| File | Written by | Migration registry | In backup export | Retention |
|------|------------|--------------------|------------------|-----------|
| `marketplace/alert-rules.json` | User via API | `register('price-alert-rules', { currentVersion: 1, optional: true })` | **Yes**. User-authored, like `monitoredSellers` | Kept until the user deletes it |
| `marketplace/alert-state.json` | Alert evaluation | Register, optional | No (derived) | Drop entries for deleted rules, or for listings ended more than 30 days ago |
| `marketplace/price-history.json` | Scans | Register, optional | No by default (D5) | Drop listings ended more than 365 days ago; 100 points per listing; consider sharding by master if the file exceeds 10 MB |
| `notifications/notifications.json` | Scans, scheduler, API | Register, optional | No (D6) | See 3e |
| `sellers/settings.json` | Existing | Stays v1 | Yes (existing) | — |

Write method: use `writeJSON`, which is atomic, for the high-churn files
(notifications, alert state, price history). `writeJSONWithBackup` keeps
up to 10 `.bak` files per write and would create churn. Alert rules use
`writeJSONWithBackup`.

---

## 4. Backend

### 4a. `SellerMonitoringService` changes

- `fetchSellerInventory`: also capture `listing.ships_from` →
  `shipsFrom`, `parseGrade(listing.condition)` / `parseGrade(listing.sleeve_condition)`,
  and `shipping` (default unknown; fill only if the Phase 0 spike confirms a
  field). Keep `condition` unchanged.
- `matchInventoryToWishlist`: carry the new fields onto new and existing
  matches. On existing matches, keep `firstPrice` and update
  `deliveredPrice`.
- `scanSeller` quick-scan update branch: carry the same new fields.
- `runScanInBackground`: collect every match observed in this scan (new and
  updated) and the listing IDs that ended. At the end (`completed` or
  `cancelled` with partial data), call one hook
  `this.onScanCompleted?.(result)`. The hook is set through
  `setScanCompletionHandler()`, so the service needs no new constructor
  parameters. Manual, single-seller and auto scans all go through this path.
- Extract `isSellerDue(seller, settings, now)` from the skip check in
  `runScanInBackground`, so the scheduler can use the same logic.
- Make `getSettings` tolerant of v1/v2 and merge defaults (G10, 3f).

### 4b. `PriceHistoryService` (new, `src/backend/services/priceHistoryService.ts`)

- `recordObservations(matches: SellerMatch[], endedListingIds: number[], at: number)`:
  adds a point only when the amount or currency changes; otherwise it
  updates `lastSeenAt`. It sets `endedAt`/`endReason` for ended listings,
  and skips matches with `price <= 0`.
- `getHistory({ masterId?, releaseId?, currency?, mediaMin? })` returns the
  listing histories plus a daily lowest-active series per currency.
- `getSummary(...)` returns current lowest active, 30/90-day lowest
  observed, and listings observed. **No "median sale"**.
- `prune(now)`.

### 4c. `PriceAlertService` (new)

- CRUD on `alert-rules.json`. Bump `revision` on update. Validate the
  currency against the set Discogs supports, and `maxPriceMinor > 0`.
- `evaluate(matches: SellerMatch[]): Promise<TriggeredAlert[]>` applies the
  rule matching, precedence and re-notify rule from 3c–3e, then writes
  `alert-state.json`. It returns triggers; it does not notify.
- `syncRuleStatuses(wishlistMasterIds, wishlistReleaseIds)` is called after
  wishlist sync. It pauses or reactivates rules.

### 4d. `NotificationService` (new, shared; also used by labels and websites later)

- `add(input, { dedupeKey? })` returns `{ created: boolean, id }`. It is
  idempotent on `dedupeKey`, through `dedupeIndex`.
- `list()`, `summary()` → `{ unreadCount, revision }`, `markRead(id)`,
  `markAllRead()`, `remove(id)`, `clearRead()`, `importLegacy(items)`
  (uses key `legacy:{id}`, so it is idempotent).
- All mutations run through a promise chain inside the process (G11).
  `server.ts`'s server lock already guarantees a single process.
- Scan-completion handler (wired in `server.ts`), in order:
  `priceHistory.recordObservations` → `alerts.evaluate` → notifications for
  triggered alerts (if `priceAlertsEnabled`) → new-match notifications (if
  `notifyOnNewMatch`) → `markMatchAsNotified` for the matches it notified →
  update scan status `alertsTriggered`.
- Price-alert notification:
  - title: "Price alert: {artist} – {title}"
  - message: "{price} {currency} ({media}/{sleeve}) at {seller}, ships from
    {shipsFrom ?? 'unknown'}. Shipping: {known amount | 'unknown'}"
  - action: `externalUrl` = the listing URL, plus a route to
    `marketplace?tab=matches`.

### 4e. Scheduler / auto-scan (new `src/backend/services/scheduledTaskService.ts`)

- A small registry: `register({ id, isDue(now), run() })`. A `tick()` runs
  every 15 minutes. The first tick runs 2 minutes after the server starts
  listening. Tasks run one at a time.
- Started in `startServer` next to the auto-backup `setInterval`, and only
  when `NODE_ENV !== 'test'`. The timers are cleared on SIGINT/SIGTERM.
- **Seller auto-scan task.** It is due when all of these hold:
  - `autoScanEnabled` is true;
  - at least one seller passes `isSellerDue`;
  - `!isScanInProgress()` and `!isReleaseCacheRefreshing()`;
  - a Discogs token exists.

  `run()` calls `startScan(false)` and records `trigger: 'auto'` and
  `lastAutoScanAt`, plus a `jobStatusService` job for visibility. Cadence
  comes from the existing `scanFrequencyDays` / `quickCheckFrequencyHours`;
  there is no separate interval knob (see 1d). Price changes on older
  listings are seen only on full scans (default every 7 days), because
  quick scans fetch only page 1 sorted by `listed desc`. The UI must say so.
- Failures set `lastAutoScanError` and create one `auto-scan-error`
  notification per day. Nothing is retried before the next tick. Auth
  missing → skip, no notification.
- Later, label and website auto-scan register here (reissue plan items 3–4).
  That work is out of scope for this plan's acceptance.

### 4f. Routes

New `src/backend/routes/notifications.ts`, mounted at `/api/v1/notifications`:

```
GET    /                 -> { revision, unreadCount, notifications }
GET    /summary          -> { revision, unreadCount }
POST   /                 -> add client notification { ..., dedupeKey? } (idempotent)
POST   /import           -> one-time legacy localStorage import
PATCH  /:id              -> { read: boolean }
POST   /read-all
DELETE /:id
DELETE /?read=true       -> clear read
```

Extend `src/backend/routes/sellers.ts`. The router already has the
parameterised routes `POST /:username/scan`, `DELETE /:username` and
`GET /:username/matches`. None of them collide with the paths below today.
Still, register the literal paths before the `/:username` block, so a
later `GET /:username` can't capture them:

```
GET    /api/v1/sellers/price-history?masterId=&releaseId=&currency=
GET    /api/v1/sellers/price-history/summary?masterId=&releaseId=&currency=
GET    /api/v1/sellers/alert-rules
POST   /api/v1/sellers/alert-rules
PATCH  /api/v1/sellers/alert-rules/:id
DELETE /api/v1/sellers/alert-rules/:id
GET    /api/v1/sellers/autoscan/status     -> { enabled, lastAutoScanAt, lastAutoScanError, nextDueSellers }
```

Keep `POST /sellers/matches/:matchId/notified`, but nothing new calls it.
Remove it after Phase 2 once no client uses it.

### 4g. `server.ts` wiring

After `sellerMonitoringService` is constructed:

1. Construct `NotificationService`, `PriceHistoryService` and
   `PriceAlertService`.
2. Call `sellerMonitoringService.setScanCompletionHandler(...)`.
3. Mount `createNotificationsRouter(notificationService)`.
4. Pass the new services into `createSellersRouter`.
5. Register the scheduler task.

### 4h. Marketplace stats naming (related to G7, limited scope)

For **new** UI in this plan, label price suggestions "Discogs suggested
price (VG+)" and `lowest_price` "Lowest asking now". The
`MarketplaceStats.medianPrice` field is not renamed here, because
collection analytics depend on it. Add a doc comment on the type saying
what it actually holds, and log the "median sale prices" wording in
`ValueEstimationSection.tsx` in `tech-debt.md`.

---

## 5. Frontend

### 5a. `NotificationsProvider` (fixes G2)

- New `src/renderer/context/NotificationsContext.tsx`, mounted in `App.tsx`
  above `Header` and `MainContent`. It polls `GET /notifications/summary`
  every 60s and when the window regains focus, and fetches the full list
  only when `revision` changes.
- `useNotifications()` keeps its current return signature
  (`notifications`, `unreadCount`, `addNotification`, `markAsRead`,
  `markAllAsRead`, `removeNotification`, `clearAll`, `isLoaded`) but reads
  from the context. Existing callers (Header, SellersPage, WishlistPage,
  DiscardPilePage, NewReleasesPage, AlbumDetailPage, ArtistDetailPage,
  AlbumScrobbleHistory, AlbumMergeSuggestionsCard) need no changes.
- `addNotification` updates the UI immediately and POSTs to the server; if
  the POST fails, the item is kept locally and retried on the next poll.
- **Legacy import:** on first load, if
  `localStorage['recordscrobbles.notifications']` exists, POST it to
  `/notifications/import`, then delete the key. The import is idempotent,
  so a crash mid-import is safe.
- `clearAll` keeps its name but maps to "clear read". Unread items need an
  explicit mark-all-read first, so background alerts aren't wiped by
  accident.

### 5b. NotificationBell

Group by `kind`. Price alerts show the price, currency, grades,
"Ships from X" and "Shipping unknown" when it is unknown. Use `lucide-react`
icons per kind at 16px with `aria-hidden`, following the CLAUDE.md icon
rules. Clicking the action marks the notification read. The bell's
`externalUrl` handling already exists.

### 5c. SellersPage

Remove the client-side notification creation and `markMatchAsNotified`
loop from the polling effect. Polling stays for progress display only. Show
"Auto-scan: on/off, last run, next sellers due" from
`/sellers/autoscan/status`.

### 5d. SellerMatchesPage

For each match card:

- show separate media and sleeve grade badges;
- show "Ships from {shipsFrom}" or "Ships from: unknown";
- show "Shipping: unknown" or the amount, and "Delivered: unknown" or the
  amount, **never "$0.00"**;
- show "↓ from {firstPrice}" when the price dropped.

Optional filters: media grade minimum, and currency.

### 5e. Alert rule UI

- On `WishlistItemCard`: a bell button (`aria-label="Set price alert"`)
  opens `PriceAlertModal`. The target defaults to **master**, with a toggle
  "Only this pressing (release {releaseId})". Fields:
  - max price;
  - currency (defaults to `WishlistSettings.currency`);
  - price basis (item, or delivered with an "only fires when shipping is
    known" hint);
  - min media and sleeve grade;
  - optional "Ships from" allow-list, labeled as seller location and not
    destination.
- Wishlist versions modal: each version row gets "Alert on this pressing".
- An active-rule indicator on the card. A paused rule shows "Not on
  wishlist — paused".
- Settings > Wishlist > "Local Sellers" (`SettingsWishlistSection.tsx`)
  gets toggles for `autoScanEnabled` and `priceAlertsEnabled`, with help
  text on cadence and full-scan latency, plus a short list of all rules
  linking to their items.

### 5f. `PriceHistoryChart`

New `src/renderer/components/marketplace/PriceHistoryChart.tsx` + `.css`,
using `recharts`, which is already a dependency. It is shown in the
versions modal and in a match details popover.

- Series: lowest active asking price per day, one line per currency, with
  an optional media-grade filter.
- Y-axis label: "Asking price (monitored sellers)". Price suggestions, if
  shown, appear as a dashed reference line labeled "Discogs suggested
  (VG+)".
- `EmptyState` when there are fewer than 2 points; `Skeleton` while
  loading. Use design tokens only, with no inline styles.

### 5g. API service (`src/renderer/services/api.ts`)

`getNotifications`, `getNotificationSummary`, `addNotification`,
`importLegacyNotifications`, `markNotificationRead`, `markAllNotificationsRead`,
`deleteNotification`, `clearReadNotifications`, `getPriceHistory`,
`getPriceHistorySummary`, `getAlertRules`, `createAlertRule`,
`updateAlertRule`, `deleteAlertRule`, `getAutoScanStatus`.

---

## 6. Migration, backup, retention

- **Registry:** register the four new files as v1 with `optional: true`
  through `MigrationService.register`. `sellers/settings.json` stays v1;
  the v2 leftover is handled by `getSettings`, not by a migration.
- **Backup:**
  - Add `alertRules: 'marketplace/alert-rules.json'` to `FILE_PATHS`.
  - Add it to the `BackupData` type, `getBackupPreview`
    (`alertRulesCount`), export, compare and import. Merge on import by
    rule `id`, following the `monitoredSellers` pattern.
  - The new `SellerMonitoringSettings` fields are covered automatically,
    because the whole settings object is backed up.
  - Notifications, alert state and price history are excluded by default
    (D5, D6).
- **Cleanup:**
  - add `cleanupNotifications`, `cleanupAlertState` and
    `cleanupPriceHistory` to `CleanupService.runCleanup`;
  - leave `cleanupSoldMatches` as is;
  - `data/sellers/price-history.json` stays where it is unless D7 says
    otherwise.
- **Downgrade safety:** all new fields on existing types are optional, so
  older builds ignore them.

---

## 7. Phases

### Phase 0: Spike and settings hygiene. **Size: XS** | No dependencies
1. ~~Run the API spike (2f)~~ — done 2026-10-11; sections 2a, 2c, 2d
   updated. Remaining fixture captures are listed in 2f.
2. Make `SellerMonitoringService.getSettings` accept v1/v2 and merge
   defaults; add tests.
3. Add a doc comment on `MarketplaceStats.medianPrice`/`highestPrice`
   (G7).

### Phase 1: Listing fidelity. **Size: S** | Depends on 0
1. Add `parseGrade` and `toMinorUnits` helpers in `src/shared/utils/` with
   tests.
2. Add `mediaCondition`, `sleeveCondition`, `shipsFrom`, `shipping`,
   `firstPrice` and `deliveredPrice` to the types. Capture them in
   `fetchSellerInventory` and carry them through matching and quick-scan
   updates.
3. SellerMatchesPage: grade badges, ships-from, and shipping/delivered
   shown as unknown.

### Phase 2: Persistent notifications. **Size: M** | Depends on 0
1. `NotificationService`, the notifications router, registration in the
   migration registry, and cleanup.
2. `NotificationsProvider`; `useNotifications` reads from the context;
   legacy import.
3. Scan-completion handler (4d) with new-match notifications only. Remove
   the client-side creation from SellersPage.

### Phase 3: Auto-scan. **Size: S–M** | Depends on 2
1. Extract `isSellerDue`; add `scheduledTaskService`; wire it in
   `startServer`.
2. Add the `autoScanEnabled` setting, scan-status fields and the
   `/sellers/autoscan/status` route.
3. UI toggle, status display, failure notification.

### Phase 4: Price history. **Size: M** | Depends on 1 and 2 (uses the completion handler)
1. `PriceHistoryService`, file registration, cleanup.
2. Record observations and ended listings from the scan-completion handler.
3. Price-history and summary routes.

### Phase 5: Alert rules and evaluation. **Size: M** | Depends on 4
1. `PriceAlertService`: CRUD, evaluate, alert state, rule status sync after
   wishlist sync.
2. Price-alert notifications from the completion handler.
3. Backup export, compare and import for rules.
4. Alert modal on wishlist cards and version rows, and the rules list in
   Settings.

### Phase 6: Chart and polish. **Size: S–M** | Depends on 4 (chart), 5 (reference lines optional)
1. `PriceHistoryChart` in the versions modal and match details.
2. Currency check on the "affordable" filter (3c).
3. New-UI labels per 4h.

### Phase 7 (optional): Market-wide lowest asking history. **Size: S** | Depends on 4
During wishlist sync, store the `marketplace/stats` `lowest_price` and
`num_for_sale` per vinyl release as a separate series ("lowest asking on
Discogs"). Request it with `curr_abbr` set to `WishlistSettings.currency`
(confirmed to work in 2f). It adds no extra API calls, because the
data is already fetched in `getMasterVersions`.

Phases 1 and 2 can run in parallel. Run them sequentially if both touch
`types.ts` heavily (project memory: avoid parallel agents editing the same
files).

---

## 8. Acceptance criteria

- **AC1 (no page open).** A scan started by the scheduler or by any page
  ends in a server-created notification for each new match (≤5 + summary).
  The notification appears in the bell within 60s with **no** marketplace
  page mounted. `SellerMatch.notified` is set by the server.
- **AC2 (shared state).** A notification added on any page appears in the
  bell without a reload. Marking one read in the bell does not remove
  notifications added elsewhere. Unread and read state survive a server
  restart and a browser change.
- **AC3 (dedupe).** Re-running a scan with unchanged inventory creates no
  new notifications. A price drop of less than `max(1 unit, 5%)` creates
  none. A bigger drop creates exactly one. A rise followed by a fall back
  to the last notified price creates none. Editing the rule allows
  re-notification.
- **AC4 (pressing vs master).** A `release` rule fires only for listings
  of that `releaseId`. A `master` rule fires for any pressing. When both
  apply, the release rule wins and one notification is sent.
- **AC5 (condition).** A listing with media `VG` does not fire a rule with
  `minMediaCondition: 'VG+'`. `Generic` sleeve fails a sleeve minimum
  unless `allowUngradedSleeve` is set.
- **AC6 (currency).** A EUR listing never fires a USD rule and shows as
  "different currency". No amount is converted.
- **AC7 (shipping).** When shipping is unknown, stored values are `null`
  with status `unknown`, the UI shows "unknown" and never "0". A
  `delivered`-basis rule does not notify on such a listing.
- **AC8 (location).** `shipsFrom` is shown as seller location. An
  allow-list rule excludes other locations. No global region filter exists.
- **AC9 (history semantics).** Ended listings get `endReason`, and no UI or
  API field calls them sold at a price. Charts are labeled as asking
  prices.
- **AC10 (auto-scan).** With `autoScanEnabled`, due sellers are scanned
  without user action. No scan starts while a manual scan or a cache
  refresh is running. Auto-scan never runs in `NODE_ENV=test`. Disabling
  it stops further runs.
- **AC11 (data safety).** The v2 leftover `sellers/settings.json` loads
  correctly. Alert rules round-trip through backup export and import. All
  new files are in the migration registry.

---

## 9. Tests

Follow the existing suites. All of these run in `tests/`.

- `tests/backend/sellerMonitoringService.test.ts`:
  - grade parsing into match fields;
  - `shipsFrom` captured, `shipping` defaults to unknown;
  - `firstPrice` preserved, `deliveredPrice` null when unknown;
  - `isSellerDue`;
  - the completion handler is called for manual, single-seller and
    cancelled-with-partial scans;
  - `getSettings` handles v1/v2/missing.
- New `tests/backend/notificationService.test.ts`:
  - idempotent dedupe;
  - `dedupeIndex` outlives deletion;
  - retention and soft cap (unread under 30d kept);
  - serialized concurrent mutations (no lost update);
  - legacy import is idempotent.
- New `tests/backend/priceAlertService.test.ts`:
  - target precedence;
  - grade minimums;
  - currency mismatch;
  - delivered basis with unknown shipping;
  - re-notify matrix (first, small drop, big drop, rise-then-fall,
    revision bump, currency change);
  - pause and reactivate on wishlist sync.
- New `tests/backend/priceHistoryService.test.ts`:
  - a point is added only on change;
  - `lastSeenAt` is bumped;
  - ended-listing reasons;
  - prune by age and cap;
  - daily lowest series per currency.
- New `tests/backend/scheduledTaskService.test.ts` (fake timers):
  - skips while a scan or refresh is running, or with no token;
  - runs due tasks one at a time;
  - error → one notification per day.
- `tests/backend/routes/sellers.test.ts`: new routes, including that
  `DELETE /alert-rules/:id` does not reach the `DELETE /:username`
  handler.
- New `tests/backend/routes/notifications.test.ts`: all endpoints.
- `tests/backend/migrationService.test.ts`, `backupService.test.ts`: new
  registrations; rules export, preview and import.
- Frontend:
  - `Header.test.tsx`: the provider shares state;
  - `SellersPage.test.tsx`: no client notification creation remains;
  - `SellerMatchesPage.test.tsx`: unknown shipping renders "unknown", not
    "$0.00";
  - `WishlistItemCard.test.tsx` and the new `PriceAlertModal.test.tsx`:
    form validation, master/release toggle;
  - the new `PriceHistoryChart.test.tsx`: empty and loading states.
- Jest mocks CSS (project memory), so check styling by running the app
  manually after Phases 1, 5 and 6.

---

## 10. Edge cases

| Concern | Handling |
|---------|----------|
| Unresolved master for a listing | Only `release` rules can match it, and history stores `masterId: null` |
| Same release listed twice by one seller | Separate `listingId`s, so separate history and alerts |
| Seller changes the price, then reverts it | Points are appended each time; the notify baseline does not reset |
| Listing edited to a lower grade | Grades updated on the next observation; a rule may stop qualifying, and nothing is "un-notified" |
| `price_suggestions` empty (seller settings incomplete) | Hide the reference line; never treat it as 0 |
| `marketplace/stats` nulls (none for sale or blocked) | Show "None for sale", not 0 |
| Server down at scheduled time | Next tick after startup runs due sellers (due logic is time-based) |
| Clock skew / timezone | All stored values in ms UTC; the chart buckets days in local time for display only |
| Very large inventories | Same API cost as manual scans; auto-scan adds none beyond scheduling. The release-cache-refresh lock is respected |
| Notifications file corruption | `readJSON` failure → start empty and log; alert state is separate, so no notification storm follows |

---

## 11. Effort

| Phase | Size | Rough estimate |
|-------|------|----------------|
| 0 Spike + settings | XS | 0.5 day (plus the user's manual spike) |
| 1 Listing fidelity | S | 1 day |
| 2 Persistent notifications | M | 2–3 days |
| 3 Auto-scan | S–M | 1–1.5 days |
| 4 Price history | M | 1.5–2 days |
| 5 Alert rules | M | 2–3 days |
| 6 Chart + polish | S–M | 1–1.5 days |
| 7 Market-wide series (optional) | S | 0.5–1 day |
| **Total (0–6)** | | **~9–12.5 days** |

---

## 12. Open decisions

- **D1. Notification delivery outside the app.** Notifications reach the
  bell whenever the app is open; scans need the backend to be running. Do
  we also want OS notifications (Web Notifications API) or email? Not in
  scope for v1.
- **D2. Delivered-cost support.** The spike confirmed authenticated
  responses carry `shipping_price` to the user's address, so the
  `delivered` price basis can ship in v1. Remaining question: how to label
  listings whose `shipping_price` is empty ("Shipping unknown" vs "May not
  ship to you"). Recommendation: "Shipping unknown" until a non-shipping
  seller's response has been captured.
- **D3. Currency conversion.** The spike confirmed `curr_abbr` converts
  listing and stats prices. Options: stay single-currency per rule, or
  request listings with `curr_abbr` = the user's currency and compare the
  converted `price` (keeping `original_price` for display). No separate FX
  source is needed either way. Recommendation: convert with `curr_abbr`,
  store both values, and label converted prices as approximate.
- **D4. Re-notify threshold.** `max(1 major unit, 5%)` is the proposal.
  Should it be configurable per rule?
- **D5. Back up price history?** It cannot be rebuilt once lost, but it
  grows. Recommendation: no in v1; revisit when it exceeds 1 MB.
- **D6. Back up notifications?** Recommendation: no, they are transient.
- **D7. Leftover `data/sellers/price-history.json`.** Delete it, archive it
  under `data/archive/`, or import its 4 snapshots into the new store?
  Recommendation: archive it and do not import, because its shape and
  semantics differ.
- **D8. Auto-scan cadence knob.** Is reusing `scanFrequencyDays` /
  `quickCheckFrequencyHours` enough, or does the user want a separate
  "check for price drops" cadence that forces full scans more often? More
  full scans cost more API calls.
- **D9. Shared scheduler ownership.** Should `scheduledTaskService` land
  with this plan (recommended), with the reissue plan's label and website
  auto-scan items adopting it later?
