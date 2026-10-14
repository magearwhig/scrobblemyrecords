import {
  EnrichedWishlistItem,
  PressingPriceEntry,
  PressingPriceStore,
  ReleaseVersion,
  WishlistLowestListing,
  WishlistPriceAlert,
  WishlistPriceAlertStore,
  WishlistPriceRefreshStatus,
  WishlistSettings,
} from '../../shared/types';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

import { jobStatusService } from './jobStatusService';

export const PRESSING_PRICES_FILE = 'wishlist/pressing-prices.json';
export const PRICE_ALERTS_FILE = 'wishlist/price-alerts.json';

const HOUR_MS = 60 * 60 * 1000;
/** Price checks of records with an alert are refreshed after this long */
export const ALERTED_REFRESH_MS = 6 * HOUR_MS;
/** Price checks of other records are refreshed after this long */
export const DEFAULT_REFRESH_MS = 24 * HOUR_MS;
/** A release whose price check failed is skipped for this long */
export const FAILURE_BACKOFF_MS = HOUR_MS;
/** Pressings checked per background tick (~1 request/s shared limit) */
export const MAX_PRESSINGS_PER_TICK = 15;
/** Upper bound for the immediate refresh after setting an alert */
const MAX_PRESSINGS_PER_ALERT_REFRESH = 60;
/** Consecutive failures that end a run early (e.g. not authenticated) */
const MAX_CONSECUTIVE_FAILURES = 3;
/** Cached prices of pressings no longer on the wishlist are dropped after */
const ORPHAN_ENTRY_MAX_AGE_MS = 7 * 24 * HOUR_MS;

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_INITIAL_DELAY_MS = 60 * 1000;

/** The parts of WishlistService the price service uses */
export interface WishlistPriceSource {
  getWishlistItems(): Promise<EnrichedWishlistItem[]>;
  getSettings(): Promise<WishlistSettings>;
  getLowestAskingPrice(
    releaseId: number,
    currency: string
  ): Promise<{
    lowestPrice: number | null;
    currency: string;
    numForSale: number;
  }>;
  isSyncInProgress(): boolean;
}

export interface WishlistPriceServiceOptions {
  /** Background refresh interval (ms) */
  intervalMs?: number;
  /** Delay before the first background tick (ms) */
  initialDelayMs?: number;
  /** Shows a price alert to the user (defaults to a job-status toast) */
  notify?: (message: string) => void;
  now?: () => number;
}

/** Thrown for bad alert input; `code` maps to the HTTP status */
export class WishlistPriceAlertError extends Error {
  constructor(
    message: string,
    public readonly code: 'invalid' | 'not_found'
  ) {
    super(message);
    this.name = 'WishlistPriceAlertError';
  }
}

export interface PriceTickResult {
  /** Why the run was skipped, if it was */
  skipped?: 'in-flight' | 'syncing';
  fetched: number;
  failed: number;
}

interface Candidate {
  releaseId: number;
  masterId: number;
  alerted: boolean;
  entry?: PressingPriceEntry;
}

/** Vinyl pressings of an item, one per release ID */
function vinylPressings(item: EnrichedWishlistItem): ReleaseVersion[] {
  const seen = new Set<number>();
  const result: ReleaseVersion[] = [];
  for (const version of item.vinylVersions ?? []) {
    if (!version.hasVinyl || seen.has(version.releaseId)) continue;
    seen.add(version.releaseId);
    result.push(version);
  }
  return result;
}

/** "$28.50" in the alert's currency */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/**
 * Lowest current vinyl asking prices for wishlist records, refreshed a few
 * pressings at a time in the background, and per-record price alerts that
 * notify (as a toast) when a pressing is listed at or below the alert price.
 *
 * Prices are cached per pressing in pressing-prices.json (regenerable);
 * alerts live in price-alerts.json (user data, backed up).
 */
export class WishlistPriceService {
  private logger = createLogger('WishlistPriceService');
  private prices: Promise<PressingPriceStore> | null = null;
  private alerts: Promise<WishlistPriceAlertStore> | null = null;
  /** Serializes read-modify-write cycles on both store files */
  private writeQueue: Promise<unknown> = Promise.resolve();
  /** Serializes price-fetching runs (ticks and alert refreshes) */
  private workQueue: Promise<unknown> = Promise.resolve();
  private tickPending = false;
  /** releaseId -> time until which it is skipped after a failure */
  private backoff = new Map<number, number>();
  private lastRunAt?: number;
  private initialTimer: NodeJS.Timeout | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;
  private readonly intervalMs: number;
  private readonly initialDelayMs: number;
  private readonly notify: (message: string) => void;
  private readonly now: () => number;

  constructor(
    private fileStorage: FileStorage,
    private source: WishlistPriceSource,
    options: WishlistPriceServiceOptions = {}
  ) {
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.initialDelayMs = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
    this.now = options.now ?? Date.now;
    this.notify =
      options.notify ??
      ((message: string) => {
        const id = jobStatusService.startJob('wishlist-price-alert', message);
        jobStatusService.completeJob(id, message);
      });
  }

  // ============================================
  // Scheduler
  // ============================================

  /** Start the rolling background refresh (no-op if already started). */
  start(): void {
    if (this.initialTimer || this.intervalTimer) return;
    const run = () => {
      this.tick().catch(error =>
        this.logger.warn('Wishlist price refresh failed', error)
      );
    };
    this.initialTimer = setTimeout(() => {
      this.initialTimer = null;
      run();
      this.intervalTimer = setInterval(run, this.intervalMs);
      this.intervalTimer.unref?.();
    }, this.initialDelayMs);
    this.initialTimer.unref?.();
    this.logger.info(
      `Wishlist price refresh scheduled every ${Math.round(this.intervalMs / 1000)}s`
    );
  }

  stop(): void {
    if (this.initialTimer) clearTimeout(this.initialTimer);
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    this.initialTimer = null;
    this.intervalTimer = null;
  }

  /** Drop in-memory stores so they are re-read (e.g. after a backup import). */
  reload(): void {
    this.prices = null;
    this.alerts = null;
  }

  // ============================================
  // Stores
  // ============================================
  // The in-memory cache holds the load promise, so concurrent readers share
  // one read and a slow read can never replace a newer saved store.

  private async readPricesFile(): Promise<PressingPriceStore> {
    let store: PressingPriceStore | null = null;
    try {
      store =
        await this.fileStorage.readJSON<PressingPriceStore>(
          PRESSING_PRICES_FILE
        );
    } catch {
      this.logger.debug('No pressing price cache yet');
    }
    return {
      schemaVersion: 1,
      prices: store?.schemaVersion === 1 && store.prices ? store.prices : {},
    };
  }

  private async readAlertsFile(): Promise<WishlistPriceAlertStore> {
    let store: WishlistPriceAlertStore | null = null;
    try {
      store =
        await this.fileStorage.readJSON<WishlistPriceAlertStore>(
          PRICE_ALERTS_FILE
        );
    } catch {
      this.logger.debug('No price alerts yet');
    }
    return {
      schemaVersion: 1,
      alerts: store?.schemaVersion === 1 && store.alerts ? store.alerts : {},
    };
  }

  private loadPrices(): Promise<PressingPriceStore> {
    if (!this.prices) this.prices = this.readPricesFile();
    return this.prices;
  }

  private loadAlerts(): Promise<WishlistPriceAlertStore> {
    if (!this.alerts) this.alerts = this.readAlertsFile();
    return this.alerts;
  }

  /** All stored alerts, keyed by master ID */
  async getAlerts(): Promise<Record<string, WishlistPriceAlert>> {
    return { ...(await this.loadAlerts()).alerts };
  }

  private enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
    const run = this.writeQueue.then(task);
    this.writeQueue = run.catch(() => undefined);
    return run;
  }

  private updatePrices<T>(
    change: (store: PressingPriceStore) => T
  ): Promise<T> {
    return this.enqueueWrite(async () => {
      const store = await this.loadPrices();
      const result = change(store);
      await this.fileStorage.writeJSON(PRESSING_PRICES_FILE, store);
      return result;
    });
  }

  /**
   * Alert writes re-read the file first: a backup import writes it
   * directly, and must not be overwritten from a stale cache.
   */
  private updateAlerts<T>(
    change: (store: WishlistPriceAlertStore) => T
  ): Promise<T> {
    return this.enqueueWrite(async () => {
      const store = await this.readAlertsFile();
      const result = change(store);
      await this.fileStorage.writeJSONWithBackup(PRICE_ALERTS_FILE, store);
      this.alerts = Promise.resolve(store);
      return result;
    });
  }

  // ============================================
  // Enrichment
  // ============================================

  /**
   * Cheapest current listing across an item's vinyl pressings, from cached
   * entries in `currency`. Undefined if none checked; null if none for sale.
   */
  private computeLowestListing(
    item: EnrichedWishlistItem,
    prices: PressingPriceStore['prices'],
    currency: string
  ): WishlistLowestListing | null | undefined {
    const pressings = vinylPressings(item);
    const checked = pressings
      .map(version => ({ version, entry: prices[String(version.releaseId)] }))
      .filter(
        (c): c is { version: ReleaseVersion; entry: PressingPriceEntry } =>
          !!c.entry && c.entry.currency === currency
      );
    if (checked.length === 0) return undefined;

    let best: { version: ReleaseVersion; entry: PressingPriceEntry } | null =
      null;
    for (const c of checked) {
      if (c.entry.lowestPrice === null || c.entry.numForSale <= 0) continue;
      if (!best || c.entry.lowestPrice < (best.entry.lowestPrice as number)) {
        best = c;
      }
    }
    if (!best) return null;

    return {
      price: best.entry.lowestPrice as number,
      currency,
      releaseId: best.version.releaseId,
      numForSale: best.entry.numForSale,
      totalForSale: checked.reduce((sum, c) => sum + c.entry.numForSale, 0),
      country: best.version.country || undefined,
      year: best.version.year || undefined,
      format: best.version.format,
      label: best.version.label || undefined,
      checkedAt: Math.min(...checked.map(c => c.entry.fetchedAt)),
      pressingsChecked: checked.length,
      pressingsTotal: pressings.length,
    };
  }

  private isTriggered(
    alert: WishlistPriceAlert,
    listing: WishlistLowestListing | null | undefined
  ): boolean {
    return (
      !!listing &&
      listing.currency === alert.currency &&
      listing.price <= alert.maxPrice
    );
  }

  /**
   * Add the cheapest current vinyl listing, `lowestVinylPrice`/`priceCurrency`
   * and the price alert (if any) to each item.
   */
  async enrichItems(
    items: EnrichedWishlistItem[]
  ): Promise<EnrichedWishlistItem[]> {
    const [prices, alerts, settings] = await Promise.all([
      this.loadPrices(),
      this.loadAlerts(),
      this.source.getSettings(),
    ]);
    return items.map(item => {
      const enriched: EnrichedWishlistItem = { ...item };
      const listing = this.computeLowestListing(
        item,
        prices.prices,
        settings.currency
      );
      if (listing !== undefined) {
        enriched.lowestListing = listing;
        enriched.lowestVinylPrice = listing?.price;
        enriched.priceCurrency = listing ? listing.currency : undefined;
      }
      const alert = item.masterId
        ? alerts.alerts[String(item.masterId)]
        : undefined;
      if (alert) {
        enriched.priceAlert = {
          maxPrice: alert.maxPrice,
          currency: alert.currency,
          triggered: this.isTriggered(alert, listing),
          lastNotifiedAt: alert.lastNotifiedAt,
        };
      } else {
        delete enriched.priceAlert;
      }
      return enriched;
    });
  }

  // ============================================
  // Refresh
  // ============================================

  private refreshIntervalFor(alerted: boolean): number {
    return alerted ? ALERTED_REFRESH_MS : DEFAULT_REFRESH_MS;
  }

  /** Vinyl pressings of wishlist records, one per release */
  private async getCandidates(
    items: EnrichedWishlistItem[]
  ): Promise<Candidate[]> {
    const [prices, alerts] = await Promise.all([
      this.loadPrices(),
      this.loadAlerts(),
    ]);
    const byRelease = new Map<number, Candidate>();
    for (const item of items) {
      if (!item.masterId || item.masterId <= 0) continue;
      const alerted = !!alerts.alerts[String(item.masterId)];
      for (const version of vinylPressings(item)) {
        const existing = byRelease.get(version.releaseId);
        if (existing) {
          existing.alerted = existing.alerted || alerted;
          continue;
        }
        byRelease.set(version.releaseId, {
          releaseId: version.releaseId,
          masterId: item.masterId,
          alerted,
          entry: prices.prices[String(version.releaseId)],
        });
      }
    }
    return [...byRelease.values()];
  }

  private isDue(candidate: Candidate, currency: string, now: number): boolean {
    const { entry } = candidate;
    if (!entry || entry.currency !== currency) return true;
    return now - entry.fetchedAt >= this.refreshIntervalFor(candidate.alerted);
  }

  /**
   * Due pressings in refresh order: records with an alert first; within
   * each group never-checked first, then the oldest check.
   */
  private dueCandidates(
    candidates: Candidate[],
    currency: string,
    now: number
  ): Candidate[] {
    return candidates
      .filter(c => this.isDue(c, currency, now))
      .filter(c => (this.backoff.get(c.releaseId) ?? 0) <= now)
      .sort((a, b) => {
        if (a.alerted !== b.alerted) return a.alerted ? -1 : 1;
        const aAt = a.entry ? a.entry.fetchedAt : -1;
        const bAt = b.entry ? b.entry.fetchedAt : -1;
        return aAt - bAt;
      });
  }

  /** Run price-fetching work one run at a time. */
  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.workQueue.then(task);
    this.workQueue = run.catch(() => undefined);
    return run;
  }

  /**
   * Fetch prices for the given pressings one at a time and save them.
   * Returns the masters whose pressings got a new price.
   */
  private async fetchAndStore(
    due: Candidate[],
    currency: string
  ): Promise<{ masters: Set<number>; fetched: number; failed: number }> {
    const fetched: Array<{ releaseId: number; entry: PressingPriceEntry }> = [];
    const masters = new Set<number>();
    let failed = 0;
    let consecutiveFailures = 0;
    for (const candidate of due) {
      if (this.source.isSyncInProgress()) break;
      try {
        const result = await this.source.getLowestAskingPrice(
          candidate.releaseId,
          currency
        );
        fetched.push({
          releaseId: candidate.releaseId,
          entry: {
            lowestPrice: result.lowestPrice,
            currency: result.currency || currency,
            numForSale: result.numForSale,
            fetchedAt: this.now(),
          },
        });
        this.backoff.delete(candidate.releaseId);
        masters.add(candidate.masterId);
        consecutiveFailures = 0;
      } catch (error) {
        failed++;
        consecutiveFailures++;
        this.backoff.set(candidate.releaseId, this.now() + FAILURE_BACKOFF_MS);
        this.logger.warn(
          `Price check failed for release ${candidate.releaseId}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          this.logger.warn('Stopping price refresh after repeated failures');
          break;
        }
      }
    }
    if (fetched.length > 0) {
      await this.updatePrices(store => {
        for (const { releaseId, entry } of fetched) {
          store.prices[String(releaseId)] = entry;
        }
      });
    }
    return { masters, fetched: fetched.length, failed };
  }

  /**
   * One background refresh: check up to 15 due pressings, then evaluate
   * the alerts of the records they belong to. Skipped while another run
   * is pending or a wishlist sync is in progress.
   */
  async tick(): Promise<PriceTickResult> {
    if (this.tickPending)
      return { skipped: 'in-flight', fetched: 0, failed: 0 };
    this.tickPending = true;
    try {
      return await this.exclusive(() => this.runTick());
    } finally {
      this.tickPending = false;
    }
  }

  private async runTick(): Promise<PriceTickResult> {
    if (this.source.isSyncInProgress()) {
      return { skipped: 'syncing', fetched: 0, failed: 0 };
    }
    const [items, settings] = await Promise.all([
      this.source.getWishlistItems(),
      this.source.getSettings(),
    ]);
    const now = this.now();
    const candidates = await this.getCandidates(items);
    const due = this.dueCandidates(candidates, settings.currency, now).slice(
      0,
      MAX_PRESSINGS_PER_TICK
    );
    const result = await this.fetchAndStore(due, settings.currency);
    await this.pruneOrphans(candidates);
    if (result.masters.size > 0) {
      await this.evaluateAlerts(result.masters, items);
    }
    this.lastRunAt = this.now();
    return { fetched: result.fetched, failed: result.failed };
  }

  /** Drop old cached prices of pressings that left the wishlist. */
  private async pruneOrphans(candidates: Candidate[]): Promise<void> {
    const keep = new Set(candidates.map(c => String(c.releaseId)));
    const prices = await this.loadPrices();
    const cutoff = this.now() - ORPHAN_ENTRY_MAX_AGE_MS;
    const orphans = Object.entries(prices.prices)
      .filter(([id, entry]) => !keep.has(id) && entry.fetchedAt < cutoff)
      .map(([id]) => id);
    if (orphans.length === 0) return;
    await this.updatePrices(store => {
      for (const id of orphans) delete store.prices[id];
    });
  }

  /**
   * Check a record's due pressings now (after its alert was set), then
   * evaluate its alert. Runs after any in-progress tick.
   */
  refreshMaster(masterId: number): Promise<PriceTickResult> {
    return this.exclusive(async () => {
      const [items, settings] = await Promise.all([
        this.source.getWishlistItems(),
        this.source.getSettings(),
      ]);
      const candidates = (await this.getCandidates(items)).filter(
        c => c.masterId === masterId
      );
      const due = this.dueCandidates(
        candidates,
        settings.currency,
        this.now()
      ).slice(0, MAX_PRESSINGS_PER_ALERT_REFRESH);
      const result = await this.fetchAndStore(due, settings.currency);
      await this.evaluateAlerts(new Set([masterId]), items);
      return { fetched: result.fetched, failed: result.failed };
    });
  }

  // ============================================
  // Alerts
  // ============================================

  /**
   * Notify for alerts of the given masters whose lowest listing is at or
   * below the alert price and below the last notified price; reset the
   * notification once the price goes back above the alert price.
   */
  async evaluateAlerts(
    masterIds?: Set<number>,
    wishlistItems?: EnrichedWishlistItem[]
  ): Promise<void> {
    const items = wishlistItems ?? (await this.source.getWishlistItems());
    const [prices, alerts, settings] = await Promise.all([
      this.loadPrices(),
      this.loadAlerts(),
      this.source.getSettings(),
    ]);
    const itemByMaster = new Map<number, EnrichedWishlistItem>();
    for (const item of items) {
      if (item.masterId > 0 && !itemByMaster.has(item.masterId)) {
        itemByMaster.set(item.masterId, item);
      }
    }

    type Change =
      | { kind: 'notify'; masterId: string; price: number; updatedAt: number }
      | { kind: 'reset'; masterId: string; updatedAt: number };
    const changes: Change[] = [];
    const messages: string[] = [];

    for (const [key, alert] of Object.entries(alerts.alerts)) {
      const masterId = Number(key);
      if (masterIds && !masterIds.has(masterId)) continue;
      const item = itemByMaster.get(masterId);
      if (!item) continue;
      const listing = this.computeLowestListing(
        item,
        prices.prices,
        settings.currency
      );
      if (listing && this.isTriggered(alert, listing)) {
        if (
          alert.lastNotifiedPrice === undefined ||
          listing.price < alert.lastNotifiedPrice
        ) {
          changes.push({
            kind: 'notify',
            masterId: key,
            price: listing.price,
            updatedAt: alert.updatedAt,
          });
          messages.push(
            `Price alert: ${item.artist} – ${item.title} from ${formatMoney(
              listing.price,
              alert.currency
            )} (your alert: ${formatMoney(alert.maxPrice, alert.currency)})`
          );
        }
      } else if (
        listing !== undefined &&
        (listing === null || listing.currency === alert.currency) &&
        (alert.lastNotifiedPrice !== undefined ||
          alert.lastNotifiedAt !== undefined)
      ) {
        changes.push({
          kind: 'reset',
          masterId: key,
          updatedAt: alert.updatedAt,
        });
      }
    }
    if (changes.length === 0) return;

    const applied = await this.updateAlerts(store => {
      const done: boolean[] = [];
      for (const change of changes) {
        const current = store.alerts[change.masterId];
        // Skip if the alert was removed or edited meanwhile
        if (!current || current.updatedAt !== change.updatedAt) {
          done.push(false);
          continue;
        }
        if (change.kind === 'notify') {
          current.lastNotifiedPrice = change.price;
          current.lastNotifiedAt = this.now();
        } else {
          delete current.lastNotifiedPrice;
          delete current.lastNotifiedAt;
        }
        done.push(true);
      }
      return done;
    });

    let messageIndex = 0;
    changes.forEach((change, i) => {
      if (change.kind !== 'notify') return;
      const message = messages[messageIndex++];
      if (applied[i]) {
        this.logger.info(message);
        this.notify(message);
      }
    });
  }

  /**
   * Set (or change) the price alert of a wishlist record. Returns the
   * enriched item; its pressings are re-checked in the background.
   */
  async setAlert(
    masterId: number,
    maxPrice: number
  ): Promise<EnrichedWishlistItem> {
    if (!Number.isInteger(masterId) || masterId <= 0) {
      throw new WishlistPriceAlertError('Invalid master ID', 'invalid');
    }
    if (
      typeof maxPrice !== 'number' ||
      !Number.isFinite(maxPrice) ||
      maxPrice <= 0
    ) {
      throw new WishlistPriceAlertError(
        'maxPrice must be a positive number',
        'invalid'
      );
    }
    const items = await this.source.getWishlistItems();
    const item = items.find(i => i.masterId === masterId);
    if (!item) {
      throw new WishlistPriceAlertError(
        `Master ${masterId} is not on the wishlist`,
        'not_found'
      );
    }
    const { currency } = await this.source.getSettings();
    const now = this.now();
    await this.updateAlerts(store => {
      const key = String(masterId);
      const existing = store.alerts[key];
      const unchanged =
        existing &&
        existing.maxPrice === maxPrice &&
        existing.currency === currency;
      store.alerts[key] = unchanged
        ? existing
        : {
            masterId,
            maxPrice,
            currency,
            createdAt: existing?.createdAt ?? now,
            // Strictly increasing so in-flight evaluations see the edit
            updatedAt: existing ? Math.max(now, existing.updatedAt + 1) : now,
          };
    });

    this.refreshMaster(masterId).catch(error =>
      this.logger.warn(`Price refresh for master ${masterId} failed`, error)
    );

    const [enriched] = await this.enrichItems([item]);
    return enriched;
  }

  /** Remove a record's price alert. Returns whether it existed. */
  async removeAlert(masterId: number): Promise<boolean> {
    return this.updateAlerts(store => {
      const key = String(masterId);
      if (!store.alerts[key]) return false;
      delete store.alerts[key];
      return true;
    });
  }

  // ============================================
  // Status
  // ============================================

  async getStatus(): Promise<WishlistPriceRefreshStatus> {
    const [items, settings] = await Promise.all([
      this.source.getWishlistItems(),
      this.source.getSettings(),
    ]);
    const now = this.now();
    const candidates = await this.getCandidates(items);
    let pressingsFresh = 0;
    let pressingsUnchecked = 0;
    for (const c of candidates) {
      if (!c.entry) pressingsUnchecked++;
      else if (!this.isDue(c, settings.currency, now)) pressingsFresh++;
    }

    const [prices, alerts] = await Promise.all([
      this.loadPrices(),
      this.loadAlerts(),
    ]);
    const itemByMaster = new Map<number, EnrichedWishlistItem>();
    for (const item of items) {
      if (item.masterId > 0 && !itemByMaster.has(item.masterId)) {
        itemByMaster.set(item.masterId, item);
      }
    }
    let alertsTotal = 0;
    let alertsTriggered = 0;
    for (const [key, alert] of Object.entries(alerts.alerts)) {
      const item = itemByMaster.get(Number(key));
      if (!item) continue;
      alertsTotal++;
      const listing = this.computeLowestListing(
        item,
        prices.prices,
        settings.currency
      );
      if (this.isTriggered(alert, listing)) alertsTriggered++;
    }

    return {
      pressingsTotal: candidates.length,
      pressingsFresh,
      pressingsUnchecked,
      lastRunAt: this.lastRunAt,
      alertsTriggered,
      alertsTotal,
    };
  }
}
