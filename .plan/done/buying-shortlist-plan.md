# Buying Shortlist Plan

Feature 3 from the first site review ([site-review-2026-10-23.md](../site-review-2026-10-23.md)):
"3–5 albums within a budget, explained by plays, alert threshold, price freshness" (M).
Builds on [wishlist-price-alerts-plan.md](wishlist-price-alerts-plan.md) (the price
cache and alerts) and on the Check a Record owned matching (`exportDataService` wishlist rows).

> **Built on [wishlist-priorities-plan.md](wishlist-priorities-plan.md):** your ranking decides first,
> and the score only fills the slots it leaves.

## Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Shared play-count helper, shortlist service, route | Done 2026-11-01 | |
| Phase 2: Shortlist panel on the Wishlist Priority tab | Done 2026-11-01 | Verified on a data copy with the owner's real ranking |
| Phase 3: Recheck prices for the picks, skip a pick | Not started | Optional, not built |

---

## 0. Summary

The user enters a budget (for example $100). The app goes down their ranking, taking each record
that fits what's left, then fills any spare slots with the best-scoring unranked records. It
returns 3–5 picks and says why each one was picked:

> **Spirit Of Eden** – Talk Talk · $38.50 (1988 UK LP, 4 for sale)
> Your #3 priority · 212 plays, last played 3 weeks ago · $1.50 under your alert price

Ranked records it had to pass over are listed with the reason, so a missing #1 is never a
mystery. It only uses cached data: opening it makes no Discogs or Last.fm calls.

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
- A budget the user enters, 3–5 picks, a reason line for each, price age, a link to the cheapest
  pressing's Discogs marketplace page.
- Records already owned are left out (`owned-same-release`, or `owned-other-version` with
  `confident` or `certain`). A `likely` match stays in, labelled "You may own another version".
- A list of ranked records passed over, with the reason.

Out of scope:
- Shipping, condition and seller-country filters (Discogs stats don't give them; same decision as
  the price alerts plan, Q3).
- Buying anything or adding to a Discogs cart.
- Saving shortlists over time.

---

## 3. Picking the records

### 3.1 Your ranking comes first
Walk ranked records from #1 down until the slots are full:
- **Fits what's left:** it's a pick. Rank is an order, not a number mixed into a score, so #1 is
  never dropped to fit more records or score higher.
- **Doesn't fit:** it's passed over and listed ("$120 is more than the $30 left"), and the walk
  carries on.
- **Owned, nothing for sale, no price (including monitored wants):** passed over and listed. It
  stays ranked.

Consequence: a #1 that takes most of the budget leaves room for little else. That's intended, and
fewer than 3 picks is allowed.

### 3.2 Spare slots: the best unranked records
A record is a candidate when it's unranked, has a listing in the settings currency, isn't owned,
and costs no more than what's left. Score, from 0 to 100:

| Part | Weight | Value | Reason line |
|------|--------|-------|-------------|
| Plays | 45 | `log1p(plays) / log1p(maxPlays)` across candidates | "212 plays, last played 3 weeks ago" / "Not played yet" |
| Recent listening | 15 | 1 if played in the last 90 days, falling to 0 at 2 years | (in the plays line) |
| Alert price | 25 | 1 at or below the alert price, falling to 0 at 50% above it; 0 without an alert | "$1.50 under your alert price" / "$6.00 over your alert price" |
| Time on wishlist | 15 | 0 when added today, 1 at 3 years or more | "On your wishlist since 2023" |

Then choose the combination that fits, not just the top scorers in order:
- Take the 30 highest scorers and try combinations of up to the spare slots (at most 174,000).
- Reaching 3 picks in total beats not reaching it; after that, the highest total score wins, then
  the lower total price.
- At most 2 picks per artist, counting ranked picks. Ranked picks themselves are never limited,
  since the owner chose them.

This replaces the budget knapsack first planned: it's simpler and makes the artist limit exact.
A name match on the artist (Discogs suffixes removed) stands in for the alias resolver.

### 3.3 Price age
Price age doesn't affect picks. Each pick shows it, and prices over 24 hours old are flagged
("Price checked 3 days ago, it may have changed").

---

## 4. Backend

### 4.1 Shared play-count helper
Move the loop from `routes/stats.ts` into `services/albumPlayCountService.ts`:
`getAlbumPlayCounts(albums, { historyStorage, mappingService })`. The route keeps its validation.
No behaviour change; the existing route tests must pass unchanged.

### 4.2 `buyingShortlistService.ts`
`getShortlist({ budget, count })`, count 3–5, default 5. Dependencies by constructor: wishlist
wants with prices (`WishlistPriceService.enrichItems`), settings, `WishlistPriorityService`, the
play-count helper and `exportDataService.getWishlistRows` for ownership. Damaged priorities are an
error rather than an unranked list, since the picks would silently ignore the ranking.

### 4.3 Types (`src/shared/types.ts`)
```typescript
export interface BuyingShortlistReason {
  kind: 'priority' | 'plays' | 'alert' | 'wishlist-age' | 'possibly-owned' | 'stale-price';
  text: string;
}

export interface BuyingShortlistPick {
  key: string;
  rank: number | null;
  artist: string;
  title: string;
  coverImage?: string;
  listing: WishlistLowestListing;
  reasons: BuyingShortlistReason[];
}

export interface BuyingShortlistSkip {
  key: string;
  rank: number;
  artist: string;
  title: string;
  reason: 'over-budget' | 'none-for-sale' | 'no-price' | 'owned';
  text: string;
}

export interface BuyingShortlist {
  budget: number;
  currency: string;
  picks: BuyingShortlistPick[];
  /** Ranked records passed over before the slots filled */
  skipped: BuyingShortlistSkip[];
  total: number;
  leftOver: number;
  /** The collection isn't fully loaded, so ownership may be incomplete */
  ownershipUnknown: boolean;
}
```

### 4.4 Route
`GET /api/v1/wishlist/shortlist?budget=100&count=5` in `routes/wishlist.ts`, before
`/:masterId/versions`. 400 for a missing, non-numeric, zero or negative budget or a count outside
3–5. 503 for a missing service or damaged priorities.

---

## 5. Frontend (Phase 2)

A panel at the top of the Wishlist's **Priority** tab, where the ranking is. (First planned for
Price alerts, before rankings existed.)

- One line: "Budget (USD)" field and a "Show picks" button. The last budget is remembered in
  `localStorage` (wrapped in try/catch).
- Each pick is a card: cover, title, artist, price and pressing, and reason lines. The title and
  price both link to the cheapest pressing's Discogs marketplace page. (Not the app's album page,
  which can't load a record with no plays.)
- Footer: "Total $88.60 · $11.40 left", plus "Lowest asking prices before shipping, any condition,
  any seller country."
- "Passed over from your ranking": each skipped record with its rank and reason.
- Picks refresh when the ranking changes while they're showing.
- Empty state: "No wishlist records are for sale at $X or less."
- Styles in `BuyingShortlistPanel.css`, design tokens only, lucide icons, no emoji.

---

## 6. Phase 3 (optional, not in this build)

- **Recheck these prices:** calls `refreshMaster` for each pick, then reloads the shortlist.
- **Not this time:** re-runs the shortlist without that record, for the page session only.

---

## 7. Tests

- Play-count helper: existing route tests pass unchanged.
- Service:
  - ranked walk: #1 first even when unranked records score higher; a record over what's left is
    passed over and the walk continues; fewer than 3 picks allowed;
  - ranked records that are owned, not for sale or unpriced stay out and are listed;
  - owned records left out; `likely` owned kept with the reason;
  - fill: best combination beats the greedy top scorers; reaching 3 picks beats a higher score;
    artist limit counts ranked picks; ties are deterministic;
  - reason text for under/over alert price, no plays, stale price;
  - damaged priorities are an error.
- Route: 400s, 503, not caught by `/:masterId/...`.
- Panel: budget kept, picks with reasons and total, passed-over list, empty state, refresh when the
  ranking changes, a slow reply can't replace a newer one.

---

## 8. Decisions made (2026-11-01)

- **Where:** Priority tab, not Price alerts, since the ranking drives the picks.
- **Ships from the US only:** can't be done; Discogs has no search over other sellers' listings. The
  panel says prices are from any seller country. Revisited after the panel picked a $63.46 copy
  shipping from Japan when the cheapest US copy was $107.49: typed-in US totals were rejected because
  they'd go stale, and the owner chose not to ask Discogs for an API change. Left as is, so picks can
  be copies the owner wouldn't order.
- **Records never played:** included, ranked lower by score.
- **Default budget:** empty until entered, then remembered; not `priceThreshold`, which is a
  per-record cap.
