# Marketplace Upgrade Plan: Price Trend Tracking (#19) + Auto-Scan (#20)

Backlog Effort C from `.plan/backlog-shark-tank-2026-03-08.md`.

## Summary

Two tightly coupled features enhancing the Marketplace section:
1. **#19 Price Trend Tracking** — persist price snapshots per release per scan, add alert thresholds to wishlist items, generate notifications when prices cross thresholds, render price history charts, filter by seller region/country.
2. **#20 Auto-Scan** — background scheduled scanning of all monitored sellers on a configurable interval, using existing `jobStatusService` and notification system.

---

## 1. Data Model

### 1a. Price History Schema

New file: `data/sellers/price-history.json`

```typescript
// In src/shared/types.ts

export interface PriceSnapshot {
  timestamp: number;        // Date.now() milliseconds
  releaseId: number;        // Discogs release ID
  masterId?: number;        // Master release ID (for grouping versions)
  sellerId: string;         // Seller username
  listingId: number;        // Discogs listing ID
  price: number;            // Numeric price
  currency: string;         // Currency code (USD, EUR, etc.)
  condition: string;        // Vinyl/sleeve condition
  shipsFrom?: string;       // Seller's country (e.g., "United States")
}

export interface PriceHistoryEntry {
  masterId: number;
  artist: string;
  title: string;
  snapshots: PriceSnapshot[];
}

export interface PriceHistoryStore extends VersionedStore {
  schemaVersion: 1;
  lastUpdated: number;
  entries: Record<number, PriceHistoryEntry>; // keyed by masterId
}
```

Keyed by `masterId` to group all versions of a release together (matches wishlist grouping).

### 1b. Price Alert Threshold on Wishlist Items

Extend `WishlistItem`:

```typescript
export interface WishlistItem {
  // ... existing fields ...
  priceAlertThreshold?: number;  // max price in user's currency
  priceAlertCurrency?: string;   // currency for threshold
}
```

Extend `WishlistSettings`:

```typescript
export interface WishlistSettings {
  // ... existing fields ...
  regionFilter?: string;         // e.g., "United States" — filter by ships_from
  priceAlertEnabled: boolean;    // global toggle for price alerts
}
```

### 1c. Auto-Scan Config

Extend `SellerMonitoringSettings`:

```typescript
export interface SellerMonitoringSettings {
  // ... existing fields ...
  autoScanEnabled: boolean;
  autoScanIntervalHours: number;   // 6, 12, 24, 48
  autoScanLastRun?: number;        // timestamp of last auto-scan
  autoScanNextRun?: number;        // calculated next scan time
}
```

### 1d. Region Data on Listings

Extend `SellerInventoryItem` and `SellerMatch`:

```typescript
export interface SellerInventoryItem {
  // ... existing fields ...
  shipsFrom?: string;    // seller country from Discogs API "ships_from"
}

export interface SellerMatch {
  // ... existing fields ...
  shipsFrom?: string;
}
```

### 1e. Price Alert Type

```typescript
export interface PriceAlert {
  id: string;
  masterId: number;
  releaseId: number;
  artist: string;
  title: string;
  observedPrice: number;
  alertThreshold: number;
  currency: string;
  listingUrl: string;
  sellerId: string;
  shipsFrom?: string;
  triggeredAt: number;
  acknowledged: boolean;
}

export interface PriceAlertsStore extends VersionedStore {
  schemaVersion: 1;
  alerts: PriceAlert[];
}
```

---

## 2. Backend Changes

### 2a. Extend `sellerMonitoringService.ts`

New file path constant:
```typescript
private readonly PRICE_HISTORY_FILE = 'sellers/price-history.json';
```

New methods:
- **`recordPriceSnapshots(matches, seller)`** — after `findMatches()`, append `PriceSnapshot` entries to price history store. Skip price <= 0.
- **`getPriceHistory(masterId, options?)`** — read/filter price history. Options: `regionFilter`, `dateRange`, `currency`.
- **`checkPriceAlerts(newMatches)`** — compare match prices against wishlist `priceAlertThreshold`. Generate alerts for prices at or below threshold.
- **`filterMatchesByRegion(matches, regionFilter)`** — filter `SellerMatch[]` by `shipsFrom`.
- **`getAvailableRegions()`** — distinct `shipsFrom` values from cached inventories/matches.

Modified methods:
- **`fetchSellerInventory()`** (~line 898) — capture `listing.ships_from` into `SellerInventoryItem.shipsFrom`
- **`scanSeller()`** — after match finding, call `recordPriceSnapshots()`
- **`runScanInBackground()`** — after all sellers scanned, call `checkPriceAlerts()`
- **`findMatches()`** — propagate `shipsFrom` into `SellerMatch`

### 2b. New `autoScanService.ts`

```typescript
// src/backend/services/autoScanService.ts
export class AutoScanService {
  constructor(fileStorage, sellerMonitoringService) {}

  async initialize(): Promise<void>;        // called at server startup
  async startSchedule(): Promise<void>;     // start recurring timer
  stopSchedule(): void;                     // stop timer
  private async runAutoScan(): Promise<void>; // single scan cycle
  async updateSchedule(settings): Promise<void>; // recalculate on settings change
  getNextScanTime(): number | null;
}
```

Uses `setInterval()` (not `node-cron` — no new dependency needed, matches existing pattern in `server.ts` line ~716 for periodic backup checks).

Key behaviors:
- Reads `SellerMonitoringSettings` on init, starts timer if `autoScanEnabled`
- Calls `sellerMonitoringService.startScan(false)` (uses cached inventory when fresh)
- Records job via `jobStatusService.startJob('auto-scan', ...)`
- Respects `scanInProgress` guard — skips and reschedules if manual scan is running
- On settings change, calls `updateSchedule()` to restart timer

### 2c. New/Modified Routes

Extend `src/backend/routes/sellers.ts`:

```
GET  /api/v1/sellers/price-history/:masterId          — price history, optional ?region= filter
GET  /api/v1/sellers/price-history/:masterId/summary   — aggregated stats (min, max, median, trend)
GET  /api/v1/sellers/regions                           — available ship-from regions
GET  /api/v1/sellers/autoscan/status                   — next run, last run, enabled
```

Extend `src/backend/routes/wishlist.ts`:

```
PATCH /api/v1/wishlist/:itemId/alert                   — set/update price alert threshold
```

Modify existing `POST /api/v1/sellers/settings`:
- Call `autoScanService.updateSchedule(newSettings)` when settings are saved.

### 2d. Service Registration in `server.ts`

After `sellerMonitoringService` construction (~line 332):
```typescript
const autoScanService = new AutoScanService(fileStorage, sellerMonitoringService);
```

After migrations/cleanup (~line 490):
```typescript
await autoScanService.initialize();
```

Pass into sellers router factory:
```typescript
createSellersRouter(fileStorage, authService, sellerMonitoringService, autoScanService)
```

### 2e. Migration Registration

In `migrationService.ts`, register new data file:
```typescript
this.registerDataFile({
  path: 'sellers/price-history.json',
  currentVersion: 1,
  migrations: [],
  optional: true,
});
```

Add migration for `sellers/settings.json` (version 1 → 2) adding `autoScanEnabled: false` and `autoScanIntervalHours: 24` defaults.

---

## 3. Frontend Changes

### 3a. Price History Chart

New files:
- `src/renderer/components/marketplace/PriceHistoryChart.tsx`
- `src/renderer/components/marketplace/PriceHistoryChart.css`

Uses `recharts` `LineChart` (already a dependency). Shows lowest/median/highest observed prices over time. Region filter dropdown at top. Uses `Skeleton` for loading, `EmptyState` for empty.

```typescript
interface PriceHistoryChartProps {
  masterId: number;
  regionFilter?: string;
  loading?: boolean;
}
```

### 3b. Price Alert Configuration UI

On existing wishlist item cards, add:
- Bell icon button (lucide-react) to set price threshold
- Number input + currency display in a small modal
- Visual indicator when alert is active
- Highlight when current price <= threshold

### 3c. Auto-Scan Settings UI

In seller settings section:
- Toggle: "Enable automatic scanning"
- Dropdown: "Every 6 hours" / "Every 12 hours" / "Daily" / "Every 2 days"
- Display: next scheduled scan time, last auto-scan result

### 3d. Region Filter

Add region filter dropdown to:
- `SellerMatchesPage.tsx` — filter displayed matches
- `WishlistPage.tsx` — settings area, default region preference
- `PriceHistoryChart` — filter snapshots

Populated from `GET /api/v1/sellers/regions`.

### 3e. API Service Extensions

In `src/renderer/services/api.ts`:
```typescript
async getPriceHistory(masterId: number, region?: string): Promise<PriceHistoryEntry>;
async getPriceHistorySummary(masterId: number, region?: string): Promise<PriceSummary>;
async getAvailableRegions(): Promise<string[]>;
async setPriceAlert(itemId: number, threshold: number | null): Promise<void>;
async getAutoScanStatus(): Promise<AutoScanStatus>;
```

---

## 4. Phased Implementation

### Phase 1: Region Filtering Foundation
**Size: Small** | No dependencies

1. Extend `SellerInventoryItem` and `SellerMatch` types with `shipsFrom`
2. Capture `listing.ships_from` in `fetchSellerInventory()`
3. Propagate `shipsFrom` into `SellerMatch` during `findMatches()`
4. Add `regionFilter` to settings types
5. Add `GET /api/v1/sellers/regions` endpoint
6. Add region filter dropdown to `SellerMatchesPage.tsx`
7. Migration for settings schema version bump
8. Tests

### Phase 2: Price History Persistence
**Size: Medium** | Depends on Phase 1

1. Define `PriceSnapshot`, `PriceHistoryEntry`, `PriceHistoryStore` types
2. Implement `recordPriceSnapshots()` in `sellerMonitoringService`
3. Hook into `scanSeller()` to call `recordPriceSnapshots()`
4. Implement `getPriceHistory()` with region/date filtering
5. Add `GET /api/v1/sellers/price-history/:masterId` endpoint
6. Register `price-history.json` in `migrationService.ts`
7. Tests

### Phase 3: Price History Chart
**Size: Small-Medium** | Depends on Phase 2

1. Build `PriceHistoryChart` component with `recharts`
2. Add API methods to `api.ts`
3. Integrate chart into marketplace pages
4. Add price history summary endpoint
5. Component tests

### Phase 4: Price Alert Thresholds
**Size: Small** | Depends on Phase 2

1. Add `priceAlertThreshold` to `WishlistItem` type
2. Add `PATCH /api/v1/wishlist/:itemId/alert` endpoint
3. Implement `checkPriceAlerts()` in `sellerMonitoringService`
4. Hook into `runScanInBackground()` completion
5. Generate notifications for triggered alerts
6. Add alert UI to wishlist item cards
7. Tests

### Phase 5: Auto-Scan Service
**Size: Medium** | Depends on Phase 1 (can parallel with Phases 3-4)

1. Create `AutoScanService` class
2. Wire into `server.ts` startup
3. Extend settings with auto-scan fields
4. Update settings route to call `autoScanService.updateSchedule()`
5. Add `GET /api/v1/sellers/autoscan/status`
6. Integrate with `jobStatusService`
7. Generate notifications on new matches
8. Add auto-scan settings UI
9. Tests

---

## 5. Region Filtering Details

### Discogs API `ships_from` Field

The Discogs inventory API returns a `ships_from` string on each listing (e.g., "United States", "Germany", "UK"). This is **free-form text set by sellers**, not a standardized country code.

**Capture:** Add `shipsFrom: listing.ships_from` to `SellerInventoryItem` construction in `fetchSellerInventory()`.

**Filter:** Build distinct `shipsFrom` values from cached inventories, present as dropdown. Case-insensitive comparison.

**Edge cases:**
- `ships_from` may be undefined/empty — treat as "Unknown"
- Sellers can change between scans — each snapshot records value at scan time
- Free-form text means "US", "USA", "United States" are all different — note this in the UI

---

## 6. Notification Integration

### Price Alert Notifications

When `checkPriceAlerts()` finds a match price at/below threshold, store a `PriceAlert` in `data/sellers/alerts.json`.

**Delivery:** Add `pendingAlerts` to scan status response. Frontend polls `GET /api/v1/sellers/scan/status` — when status is `completed`, it receives `pendingAlerts: PriceAlert[]` and creates notifications via `useNotifications`. Calls `POST /api/v1/sellers/alerts/:alertId/acknowledged` to prevent duplicates.

### Auto-Scan Match Notifications

When auto-scan finds new matches, include count in scan status response. Frontend creates info notification: "Auto-scan found N new matches from your monitored sellers."

---

## 7. Edge Cases

| Concern | Handling |
|---------|----------|
| **Rate limiting** | Discogs 1 req/sec enforced by existing `discogsAxios.ts` interceptor. Auto-scan uses same path. |
| **Concurrent scans** | `scanInProgress` guard prevents overlap. Auto-scan skips and reschedules if manual scan is running. |
| **Scan failures** | Log via `jobStatusService.failJob()`, retry at next interval. No immediate retry. Partial data preserved. |
| **Empty price data** | Skip listings with price <= 0. Charts show `EmptyState` when no data. Alert comparison skips no-price items. |
| **Large price history** | Retention: keep max 365 days of snapshots. Add cleanup in `cleanupService.ts`. Start with single file, consider sharding if >10MB. |
| **Currency mixing** | Store raw currency per snapshot. Chart can filter by currency. Alert thresholds compare matching currency only. |
| **Server restart** | `autoScanService.initialize()` recalculates next scan from `lastRun + interval`. If past due, runs after 60s startup delay. |
| **Stale timer** | On settings change, `updateSchedule()` clears old timer and starts new one. |
| **Timestamps** | All `Date.now()` milliseconds per dev_prompt convention. Chart X-axis converts to local time for display. |
| **File safety** | `writeJSONWithBackup()` for `price-history.json`. `schemaVersion: 1` on all new stores. |
