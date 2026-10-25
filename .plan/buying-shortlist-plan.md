# Buying Shortlist Plan

Feature 3 from the first site review ([site-review-2026-10-23.md](site-review-2026-10-23.md)):
"3–5 albums within a budget, explained by plays, alert threshold, price freshness" (M).
Builds on [done/wishlist-price-alerts-plan.md](done/wishlist-price-alerts-plan.md) (the price
cache and alerts) and on the Check a Record owned matching (`exportDataService` wishlist rows).

## Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Shortlist service, shared play-count helper, route | Not started | |
| Phase 2: Shortlist panel on the Wishlist page | Not started | |
| Phase 3: Recheck prices for the picks, skip/snooze a pick | Not started | Optional |

---

## 0. Summary

The user enters a budget (for example $100). The app picks 3–5 wishlist records whose current
cheapest vinyl listings add up to no more than that, and says why each one was picked:

> **Spirit Of Eden** – Talk Talk · $38.50 (1988 UK LP, 4 for sale)
> 212 plays, last played 3 weeks ago · $1.50 under your alert price · price checked 4 hours ago

It only uses cached data: the wishlist, the pressing price cache, price alerts and the
listening history. Opening it makes no Discogs or Last.fm calls (Phase 3 adds an optional
recheck button).

---

## 1. Verified current state (2026-10-25, on a copy of real data)

### Wishlist and prices
- `GET /api/v1/wishlist` returns `EnrichedWishlistItem[]`; `WishlistPriceService.enrichItems`
  adds `lowestListing` (`WishlistLowestListing`: price, currency, releaseId, numForSale,
  totalForSale, country/year/format/label, `checkedAt` = **oldest** check among the
  record's pressings, `pressingsChecked`/`pressingsTotal`) and `priceAlert`
  (`WishlistPriceAlertView`: maxPrice, currency, triggered).
- Real data: 208 wants, 183 distinct masters, 182 with vinyl. All 182 have a price check;
  **165 have a copy for sale**, 17 have none. Every pressing has been checked
  (`pressingsChecked === pressingsTotal` for all). Prices are in USD.
- Freshness: the rolling refresh re-checks alerted records every 6 h and others every 12 h
  (`ALERTED_REFRESH_MS`, `DEFAULT_REFRESH_MS`). Median price age is 5 h, the oldest 12 h, but
  only while the server keeps running; after the server is off for a few days every price is
  that old.
- Prices are the lowest **asking** price for any condition, from any seller country, before
  shipping (Discogs marketplace stats have none of those details). The cheapest listings in
  the data are $1.99–$7.99 LPs, which are likely worn copies or far from the US. The
  shortlist has to say "from $X, before shipping, any condition", like the price alert UI.
- 28 price alerts are set, none triggered right now. Alerts are keyed by master
  (`price-alerts.json`).
- `WishlistSettings.priceThreshold` (300 in real data) feeds the existing "Affordable" tab.
  It is a per-record cap, not a budget.
- `WishlistItem.rating` (Discogs want priority) is 0 on every want, so it can't be used.
- Local wants (`local-want-list.json`): 13, only 1 with vinyl, and they have **no price
  data** (no versions, no pressing prices). Out of scope for v1.

### Plays
- Play counts come from `POST /api/v1/stats/album-play-counts`. Its matching logic is
  **inline in the route** (`routes/stats.ts:1085`): album mappings via
  `createCollectionNameResolver`, `historyStorage.getAlbumHistoryFuzzy(..., countsOnly)`,
  artist-mapping fallback, and de-duplication of matched history keys.
- Real data: 125 of 183 wishlist masters have plays (median 17; 58 have 20 or more). 58 have
  none, so plays alone can't rank everything.

### Ownership and discards
- `exportDataService.getWishlistRows()` (lean rows since round 2) gives `ownedMatch`
  (`owned-same-release` | `owned-other-version` | `owned-name-match` | `not-owned` |
  `unknown`) with `ownedMatchConfidence`. Check a Record already uses it.
- The Discard Pile (`discardPile.getDiscardPile()`) records traded-in and sold copies.

---

## 2. Scope

In scope (v1):
- Discogs wants with a vinyl copy for sale in the settings currency.
- A budget the user enters, 3–5 picks, a reason line for each pick, price age, a link to the
  cheapest pressing's Discogs marketplace page.
- Records already owned are left out (`owned-same-release`, or `owned-other-version` with
  `confident`). A `likely` match stays in but is labelled "You may own another version".

Out of scope:
- Shipping, condition and seller-country filters (Discogs stats don't give them; same
  decision as the price alerts plan, Q3).
- Local wants (no prices).
- Buying anything or adding to a Discogs cart.
- Saving shortlists over time.

---

## 3. Picking the records

### 3.1 Candidates
A wishlist master is a candidate when:
1. `vinylStatus === 'has_vinyl'` and `lowestListing` is non-null in the settings currency;
2. it isn't owned (section 2);
3. its price is at most the budget;
4. it isn't snoozed (Phase 3).

One candidate per master: when two wants share a master, the shortlist uses the item the
price service already merged (same rule as `evaluateAlerts`: first item per master).

### 3.2 Score
Each candidate gets a score from 0 to 100, from parts that each give a reason line:

| Part | Weight | Value | Reason line |
|------|--------|-------|-------------|
| Plays | 45 | `log1p(plays) / log1p(maxPlays)` across candidates | "212 plays, last played 3 weeks ago" / "Not played yet" |
| Recent listening | 15 | 1 if played in the last 90 days, falling to 0 at 2 years | (merged into the plays line) |
| Alert price | 25 | 1 when at or below the alert price; falls to 0 at 50% above it; 0 without an alert | "$1.50 under your alert price" / "$6 over your alert price" |
| Time on wishlist | 15 | 0 when added today, 1 at 3 years or more | "On your wishlist since 2023" |

A record with no alert and no plays can still be picked on wishlist age alone, but it
ranks low. The weights are constants in the service, not settings.

Price age doesn't change the score. It is shown on each pick and flagged when the price
is more than 24 h old ("Price checked 3 days ago, it may have changed").

### 3.3 Fitting the budget
Pick the set of 3–5 records with the **highest total score** whose prices add up to no
more than the budget. There are at most about 165 candidates, so a small knapsack is fine:
- Work in whole cents. Run a 0/1 knapsack over price with a count dimension (k ≤ 5), so
  budgets up to a few hundred dollars stay small (5 × 165 × budget in cents is about
  8M cells at $100). Above $500, round prices up to the dollar before solving.
- If no 3 records fit, return the best 1–2 that do, with the note "Only N records fit this
  budget".
- Ties: higher score first, then cheaper, then artist and title.

The result also says how much is left over ("$11.40 left").

### 3.4 Variety
- At most 2 picks by the same artist (artist alias resolver), so one artist doesn't take
  the whole list.

---

## 4. Backend

### 4.1 Shared play-count helper
Move the loop from `routes/stats.ts:1085` into
`src/backend/services/albumPlayCountService.ts` (or a function in `statsService`):
`getAlbumPlayCounts(albums: Array<{artist, title}>): Promise<AlbumPlayCountResult[]>`.
The route keeps its validation and calls the helper. No behaviour change; the existing
route tests must pass unchanged.

### 4.2 `buyingShortlistService.ts`
```typescript
getShortlist(opts: {
  budget: number;      // in the settings currency, > 0
  count?: number;      // 3–5, default 5
  excludeMasterIds?: number[];
}): Promise<BuyingShortlist>
```
Dependencies (constructor injection, fakes in tests): the wishlist service (items and
settings), `WishlistPriceService.enrichItems`, the play-count helper,
`exportDataService.getWishlistRows` for ownership, and the artist alias resolver for the
variety rule.

### 4.3 Types (`src/shared/types.ts`)
```typescript
export interface BuyingShortlistReason {
  kind: 'plays' | 'alert' | 'wishlist-age' | 'possibly-owned' | 'stale-price';
  text: string;
}

export interface BuyingShortlistPick {
  masterId: number;
  releaseId: number;        // the want's release, for the detail link
  artist: string;
  title: string;
  coverImage?: string;
  listing: WishlistLowestListing; // price, pressing, checkedAt
  playCount: number;
  lastPlayed: number | null; // seconds
  score: number;            // 0–100, rounded
  reasons: BuyingShortlistReason[];
}

export interface BuyingShortlist {
  budget: number;
  currency: string;
  picks: BuyingShortlistPick[];
  total: number;
  leftOver: number;
  candidates: number;       // records that could have been picked
  /** Why some wishlist records were left out, for one summary line */
  excluded: { owned: number; noneForSale: number; overBudget: number; noPrice: number };
  oldestPriceAt: number | null; // ms
  generatedAt: string;
}
```

### 4.4 Route
`GET /api/v1/wishlist/shortlist?budget=100&count=5&exclude=123,456` in `routes/wishlist.ts`,
registered with the other static routes, **before** `/:masterId/versions`.
- 400 for a missing, non-numeric, zero or negative budget, or a count outside 3–5.
- 503 when the price service isn't available (same helper as the price-alert routes).

---

## 5. Frontend (Phase 2)

A "Buying shortlist" panel at the top of the Wishlist page's **Price alerts** tab (it
belongs with the prices; a new tab would make the tab row longer). Collapsed by default to
one line: "Have a budget? Get 3–5 records to buy" and a budget field.

- Budget field: number input in the settings currency, labelled "Budget". The last budget
  used is kept in `localStorage` (per-viewer convenience, wrapped in try/catch).
- "Show picks" button calls the route.
- Each pick is a card in a responsive grid: cover, artist/title (AlbumLink), price and
  pressing, the reason lines as a short list, and a "View on Discogs" link to the cheapest
  pressing's marketplace page (same link the price section uses).
- Footer: "Total $88.60 · $11.40 left · prices are the lowest asking price before
  shipping, any condition". If any pick's price is older than 24 h, also "Some prices are
  from N days ago."
- Empty states: "No wishlist records are for sale under $X" / "No prices have been checked
  yet" (first run).
- Styles in `WishlistPage.page.css`, design tokens only, lucide icons (`ShoppingBag` for
  the panel, `Clock` for stale prices), no emoji.

---

## 6. Phase 3 (optional)

- **Recheck these prices:** a button that calls `refreshMaster` for each pick (it only
  re-fetches pressings that are due) and then reloads the shortlist. At most 5 masters, so
  at most `5 × MAX_PRESSINGS_PER_ALERT_REFRESH` Discogs calls; show progress.
- **Not this time:** a per-pick button that re-runs the shortlist with that master in
  `exclude` (kept for the page session only).

---

## 7. Tests

- `albumPlayCountService`: the moved logic, including mapping and de-duplication cases
  (move the existing route tests' cases here; route tests keep passing).
- `buyingShortlistService`:
  - owned records left out; `likely` owned kept with the reason;
  - none for sale / no price / other currency left out, and counted in `excluded`;
  - knapsack picks the best total score, not the greedy top scorers (a case where the top
    record would crowd out two better-together picks);
  - fewer than 3 fit → returns what fits with the note;
  - same-artist cap;
  - reason text for under/over alert price, no plays, stale price;
  - ties are deterministic.
- Route: 400s, 503, exclude list, and that `/shortlist` isn't caught by `/:masterId/...`.
- Wishlist page: panel collapsed by default, budget kept, picks rendered with reasons and
  total, empty states.

---

## 8. Questions for the owner (defaults used if unanswered)

- **Q1. Where does it live?** Default: top of the Price alerts tab. Alternative: Home
  ("Something to buy") or Check a Record.
- **Q2. Ships from the US only?** Discogs stats can't tell. Default: no filter, with the
  "any seller country" note. A US-only version would need marketplace listing searches,
  which the Discogs API doesn't offer for other people's inventories.
- **Q3. Include records never played?** Default: yes, ranked lower; they still have
  wishlist age and alerts.
- **Q4. Default budget?** Default: empty until the user enters one; not
  `priceThreshold`, which means something else.
