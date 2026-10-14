import * as fs from 'fs/promises';
import os from 'os';
import path from 'path';

import {
  ALERTED_REFRESH_MS,
  DEFAULT_REFRESH_MS,
  FAILURE_BACKOFF_MS,
  MAX_PRESSINGS_PER_TICK,
  PRESSING_PRICES_FILE,
  PRICE_ALERTS_FILE,
  WishlistPriceAlertError,
  WishlistPriceService,
  WishlistPriceSource,
} from '../../../src/backend/services/wishlistPriceService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';
import {
  EnrichedWishlistItem,
  PressingPriceEntry,
  ReleaseVersion,
  WishlistPriceAlertStore,
  WishlistSettings,
} from '../../../src/shared/types';

jest.mock('../../../src/backend/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

const HOUR = 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

const version = (
  releaseId: number,
  overrides: Partial<ReleaseVersion> = {}
): ReleaseVersion => ({
  releaseId,
  title: `Pressing ${releaseId}`,
  format: ['Vinyl', 'LP'],
  label: `Label ${releaseId}`,
  country: 'UK',
  year: 1988,
  hasVinyl: true,
  ...overrides,
});

const item = (
  masterId: number,
  versions: ReleaseVersion[],
  overrides: Partial<EnrichedWishlistItem> = {}
): EnrichedWishlistItem => ({
  id: masterId,
  masterId,
  releaseId: masterId * 10,
  artist: 'Talk Talk',
  title: 'Spirit Of Eden',
  dateAdded: '2024-01-01',
  vinylStatus: 'has_vinyl',
  vinylVersions: versions,
  ...overrides,
});

const entry = (
  lowestPrice: number | null,
  overrides: Partial<PressingPriceEntry> = {}
): PressingPriceEntry => ({
  lowestPrice,
  currency: 'USD',
  numForSale: lowestPrice === null ? 0 : 2,
  fetchedAt: NOW - HOUR,
  ...overrides,
});

describe('WishlistPriceService', () => {
  let dataDir: string;
  let fileStorage: FileStorage;
  let items: EnrichedWishlistItem[];
  let settings: WishlistSettings;
  let syncing: boolean;
  let now: number;
  let notify: jest.Mock;
  let getLowestAskingPrice: jest.Mock;
  let source: WishlistPriceSource;
  let service: WishlistPriceService;

  const writePrices = (prices: Record<string, PressingPriceEntry>) =>
    fileStorage.writeJSON(PRESSING_PRICES_FILE, { schemaVersion: 1, prices });

  const writeAlerts = (alerts: WishlistPriceAlertStore['alerts']) =>
    fileStorage.writeJSON(PRICE_ALERTS_FILE, { schemaVersion: 1, alerts });

  const makeService = () =>
    new WishlistPriceService(fileStorage, source, {
      notify,
      now: () => now,
      intervalMs: 1000,
      initialDelayMs: 1000,
    });

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wishlist-prices-'));
    fileStorage = new FileStorage(dataDir);
    await fileStorage.ensureDataDir();
    items = [];
    settings = {
      schemaVersion: 1,
      currency: 'USD',
      autoSyncInterval: 0,
      notifyOnVinylAvailable: false,
    };
    syncing = false;
    now = NOW;
    notify = jest.fn();
    getLowestAskingPrice = jest.fn(async (_id: number, currency: string) => ({
      lowestPrice: 10,
      currency,
      numForSale: 1,
    }));
    source = {
      getWishlistItems: async () => items,
      getSettings: async () => settings,
      getLowestAskingPrice,
      isSyncInProgress: () => syncing,
    };
    service = makeService();
  });

  afterEach(async () => {
    service.stop();
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  /** Let a background refresh started by setAlert finish */
  const settle = () => service.refreshMaster(-1);

  describe('enrichItems', () => {
    it('leaves lowestListing undefined when no vinyl pressing was checked', async () => {
      const [result] = await service.enrichItems([item(1, [version(11)])]);
      expect(result.lowestListing).toBeUndefined();
      expect(result.lowestVinylPrice).toBeUndefined();
      expect(result.priceAlert).toBeUndefined();
    });

    it('is null when checked pressings have nothing for sale', async () => {
      await writePrices({ '11': entry(null), '12': entry(null) });
      const [result] = await service.enrichItems([
        item(1, [version(11), version(12)]),
      ]);
      expect(result.lowestListing).toBeNull();
      expect(result.lowestVinylPrice).toBeUndefined();
      expect(result.priceCurrency).toBeUndefined();
    });

    it('picks the cheapest vinyl pressing and summarizes the others', async () => {
      await writePrices({
        '11': entry(40, { numForSale: 3, fetchedAt: NOW - 2 * HOUR }),
        '12': entry(28.5, { numForSale: 1, fetchedAt: NOW - HOUR }),
        '13': entry(null, { fetchedAt: NOW - 5 * HOUR }),
        // A CD pressing's price is ignored even if cached
        '15': entry(1),
      });
      const [result] = await service.enrichItems([
        item(1, [
          version(11),
          version(12, { country: 'US', year: 2012, label: 'Parlophone' }),
          version(13),
          version(14),
          version(15, { hasVinyl: false, format: ['CD'] }),
        ]),
      ]);
      expect(result.lowestListing).toEqual({
        price: 28.5,
        currency: 'USD',
        releaseId: 12,
        numForSale: 1,
        totalForSale: 4,
        country: 'US',
        year: 2012,
        format: ['Vinyl', 'LP'],
        label: 'Parlophone',
        checkedAt: NOW - 5 * HOUR,
        pressingsChecked: 3,
        pressingsTotal: 4,
      });
      expect(result.lowestVinylPrice).toBe(28.5);
      expect(result.priceCurrency).toBe('USD');
    });

    it('ignores cached prices in another currency', async () => {
      await writePrices({
        '11': entry(5, { currency: 'EUR' }),
        '12': entry(30),
      });
      const [one] = await service.enrichItems([item(1, [version(11)])]);
      expect(one.lowestListing).toBeUndefined();
      const [both] = await service.enrichItems([
        item(1, [version(11), version(12)]),
      ]);
      expect(both.lowestListing?.price).toBe(30);
      expect(both.lowestListing?.pressingsChecked).toBe(1);
    });

    it('adds the alert view with triggered state', async () => {
      await writePrices({ '11': entry(25) });
      await writeAlerts({
        '1': {
          masterId: 1,
          maxPrice: 30,
          currency: 'USD',
          createdAt: 1,
          updatedAt: 1,
          lastNotifiedAt: 7,
          lastNotifiedPrice: 25,
        },
        '2': {
          masterId: 2,
          maxPrice: 20,
          currency: 'USD',
          createdAt: 1,
          updatedAt: 1,
        },
        '3': {
          masterId: 3,
          maxPrice: 30,
          currency: 'EUR',
          createdAt: 1,
          updatedAt: 1,
        },
      });
      const [a, b, c] = await service.enrichItems([
        item(1, [version(11)]),
        item(2, [version(11)]),
        item(3, [version(11)]),
      ]);
      expect(a.priceAlert).toEqual({
        maxPrice: 30,
        currency: 'USD',
        triggered: true,
        lastNotifiedAt: 7,
      });
      expect(b.priceAlert?.triggered).toBe(false);
      // Alert in another currency than the listing never triggers
      expect(c.priceAlert?.triggered).toBe(false);
    });
  });

  describe('tick', () => {
    it('checks due pressings: alerted first, never-checked then oldest, at most 15', async () => {
      const plain = Array.from({ length: 20 }, (_, i) => version(100 + i));
      items = [
        item(1, plain),
        item(2, [version(201), version(202), version(203)]),
      ];
      await writeAlerts({
        '2': {
          masterId: 2,
          maxPrice: 1,
          currency: 'USD',
          createdAt: 1,
          updatedAt: 1,
        },
      });
      await writePrices({
        // alerted: 201 fresh (<6h), 202 stale (>6h), 203 never checked
        '201': entry(50, { fetchedAt: NOW - 2 * HOUR }),
        '202': entry(50, { fetchedAt: NOW - 7 * HOUR }),
        // plain: 100 fresh (<12h), 101 oldest stale, 102 stale, 103 other currency
        '100': entry(50, { fetchedAt: NOW - 10 * HOUR }),
        '101': entry(50, { fetchedAt: NOW - 30 * DEFAULT_REFRESH_MS }),
        '102': entry(50, { fetchedAt: NOW - 2 * DEFAULT_REFRESH_MS }),
        '103': entry(50, { currency: 'EUR', fetchedAt: NOW - HOUR }),
      });

      const result = await service.tick();

      const order = getLowestAskingPrice.mock.calls.map(c => c[0]);
      expect(result.fetched).toBe(MAX_PRESSINGS_PER_TICK);
      expect(order).toHaveLength(MAX_PRESSINGS_PER_TICK);
      expect(order.slice(0, 2)).toEqual([203, 202]);
      expect(order).not.toContain(201);
      expect(order).not.toContain(100);
      // never-checked plain pressings come before stale ones
      expect(order.slice(2, 2 + 13)).toEqual([
        104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116,
      ]);
      expect(getLowestAskingPrice).toHaveBeenCalledWith(203, 'USD');

      const stored = await fileStorage.readJSON<{
        prices: Record<string, PressingPriceEntry>;
      }>(PRESSING_PRICES_FILE);
      expect(stored!.prices['203']).toEqual({
        lowestPrice: 10,
        currency: 'USD',
        numForSale: 1,
        fetchedAt: NOW,
      });

      // Next tick continues with the rest: remaining never-checked, then oldest
      getLowestAskingPrice.mockClear();
      await service.tick();
      expect(getLowestAskingPrice.mock.calls.map(c => c[0])).toEqual([
        117, 118, 119, 101, 102, 103,
      ]);
      expect((await service.getStatus()).lastRunAt).toBe(NOW);
    });

    it('treats alerted records as due after 6 hours', async () => {
      items = [item(1, [version(11)])];
      await writePrices({
        '11': entry(50, { fetchedAt: NOW - ALERTED_REFRESH_MS + 1000 }),
      });
      await writeAlerts({
        '1': {
          masterId: 1,
          maxPrice: 1,
          currency: 'USD',
          createdAt: 1,
          updatedAt: 1,
        },
      });
      expect((await service.tick()).fetched).toBe(0);
      now += 1000;
      expect((await service.tick()).fetched).toBe(1);
    });

    it('backs off a failing release for an hour without overwriting its cache', async () => {
      items = [item(1, [version(11), version(12)])];
      const old = entry(42, { fetchedAt: NOW - 2 * DEFAULT_REFRESH_MS });
      await writePrices({ '11': old });
      getLowestAskingPrice.mockImplementation(async (id: number) => {
        if (id === 11) throw new Error('500');
        return { lowestPrice: 9, currency: 'USD', numForSale: 1 };
      });

      const first = await service.tick();
      expect(first).toEqual({ fetched: 1, failed: 1 });
      const stored = await fileStorage.readJSON<{
        prices: Record<string, PressingPriceEntry>;
      }>(PRESSING_PRICES_FILE);
      expect(stored!.prices['11']).toEqual(old);

      getLowestAskingPrice.mockClear();
      now += FAILURE_BACKOFF_MS - 1;
      await service.tick();
      expect(getLowestAskingPrice).not.toHaveBeenCalled();

      now += 1;
      await service.tick();
      expect(getLowestAskingPrice.mock.calls.map(c => c[0])).toEqual([11]);
    });

    it('stops a run after repeated failures (e.g. not signed in)', async () => {
      items = [
        item(
          1,
          Array.from({ length: 10 }, (_, i) => version(i + 1))
        ),
      ];
      getLowestAskingPrice.mockRejectedValue(new Error('No Discogs token'));
      const result = await service.tick();
      expect(result.failed).toBe(3);
      expect(getLowestAskingPrice).toHaveBeenCalledTimes(3);
    });

    it('does not overlap ticks', async () => {
      items = [item(1, [version(11)])];
      let release: () => void = () => undefined;
      getLowestAskingPrice.mockImplementation(
        () =>
          new Promise(resolve => {
            release = () =>
              resolve({ lowestPrice: 1, currency: 'USD', numForSale: 1 });
          })
      );
      const first = service.tick();
      const second = await service.tick();
      expect(second.skipped).toBe('in-flight');
      // wait until the fetch is underway, then release it
      while (getLowestAskingPrice.mock.calls.length === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      release();
      expect((await first).fetched).toBe(1);
      expect(getLowestAskingPrice).toHaveBeenCalledTimes(1);
    });

    it('skips while a wishlist sync is in progress', async () => {
      items = [item(1, [version(11)])];
      syncing = true;
      expect((await service.tick()).skipped).toBe('syncing');
      expect(getLowestAskingPrice).not.toHaveBeenCalled();
      expect((await service.getStatus()).lastRunAt).toBeUndefined();
    });

    it('ignores items without a master', async () => {
      items = [item(0, [version(11)])];
      await service.tick();
      expect(getLowestAskingPrice).not.toHaveBeenCalled();
    });
  });

  describe('alerts', () => {
    beforeEach(() => {
      items = [item(1, [version(11), version(12)])];
    });

    it('validates the price and that the record is on the wishlist', async () => {
      await expect(service.setAlert(1, 0)).rejects.toMatchObject({
        code: 'invalid',
      });
      await expect(service.setAlert(1, NaN)).rejects.toBeInstanceOf(
        WishlistPriceAlertError
      );
      await expect(service.setAlert(999, 10)).rejects.toMatchObject({
        code: 'not_found',
      });
    });

    it('sets an alert in the wishlist currency and returns the enriched item', async () => {
      settings.currency = 'GBP';
      await writePrices({ '11': entry(20, { currency: 'GBP' }) });
      const result = await service.setAlert(1, 25);
      expect(result.masterId).toBe(1);
      expect(result.priceAlert).toMatchObject({
        maxPrice: 25,
        currency: 'GBP',
        triggered: true,
      });
      expect(result.lowestListing?.price).toBe(20);
      const alerts = await service.getAlerts();
      expect(alerts['1']).toMatchObject({ maxPrice: 25, currency: 'GBP' });
      await settle();
    });

    it('refreshes the record in the background and notifies right away', async () => {
      getLowestAskingPrice.mockImplementation(async (id: number) => ({
        lowestPrice: id === 11 ? 28.5 : 35,
        currency: 'USD',
        numForSale: 1,
      }));
      await service.setAlert(1, 30);
      await settle();
      expect(getLowestAskingPrice.mock.calls.map(c => c[0]).sort()).toEqual([
        11, 12,
      ]);
      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify).toHaveBeenCalledWith(
        'Price alert: Talk Talk – Spirit Of Eden from $28.50 (your alert: $30.00)'
      );
      const alert = (await service.getAlerts())['1'];
      expect(alert.lastNotifiedPrice).toBe(28.5);
      expect(alert.lastNotifiedAt).toBe(NOW);
    });

    it('re-notifies only below the last notified price, and again after going above', async () => {
      await writePrices({ '11': entry(28), '12': entry(null) });
      await service.setAlert(1, 30);
      // Prices fresh: no fetch, evaluation notifies once
      await settle();
      expect(getLowestAskingPrice).not.toHaveBeenCalled();
      expect(notify).toHaveBeenCalledTimes(1);

      const evaluateWith = async (price: number | null) => {
        await writePrices({ '11': entry(price), '12': entry(null) });
        service.reload();
        await service.evaluateAlerts();
      };

      await evaluateWith(28); // same price: no repeat
      await evaluateWith(29); // higher but still under: no repeat
      expect(notify).toHaveBeenCalledTimes(1);

      await evaluateWith(27); // lower: notify
      expect(notify).toHaveBeenCalledTimes(2);
      expect((await service.getAlerts())['1'].lastNotifiedPrice).toBe(27);

      await evaluateWith(31); // above: reset
      expect(
        (await service.getAlerts())['1'].lastNotifiedPrice
      ).toBeUndefined();
      expect((await service.getAlerts())['1'].lastNotifiedAt).toBeUndefined();

      await evaluateWith(29); // dips again: notify even though > 27
      expect(notify).toHaveBeenCalledTimes(3);

      await evaluateWith(null); // nothing for sale: reset
      expect(
        (await service.getAlerts())['1'].lastNotifiedPrice
      ).toBeUndefined();
    });

    it('changing the alert price resets the notification state', async () => {
      await writePrices({ '11': entry(20), '12': entry(null) });
      await service.setAlert(1, 30);
      await settle();
      expect(notify).toHaveBeenCalledTimes(1);
      await service.setAlert(1, 30); // same price: kept
      await settle();
      expect(notify).toHaveBeenCalledTimes(1);
      await service.setAlert(1, 25); // changed: notifies again
      await settle();
      expect(notify).toHaveBeenCalledTimes(2);
    });

    it('does not notify for records no longer on the wishlist', async () => {
      await writePrices({ '11': entry(20) });
      await writeAlerts({
        '5': {
          masterId: 5,
          maxPrice: 30,
          currency: 'USD',
          createdAt: 1,
          updatedAt: 1,
        },
      });
      await service.evaluateAlerts();
      expect(notify).not.toHaveBeenCalled();
    });

    it('evaluates alerts of records whose prices a tick refreshed', async () => {
      await writeAlerts({
        '1': {
          masterId: 1,
          maxPrice: 30,
          currency: 'USD',
          createdAt: 1,
          updatedAt: 1,
        },
      });
      await service.tick();
      expect(notify).toHaveBeenCalledWith(
        expect.stringContaining('from $10.00')
      );
    });

    it('alert writes keep alerts written to the file behind its back (backup import)', async () => {
      await service.setAlert(1, 30);
      await settle();
      expect(Object.keys(await service.getAlerts())).toEqual(['1']);
      // An import rewrites the file before the service reloads
      await writeAlerts({
        '1': {
          masterId: 1,
          maxPrice: 30,
          currency: 'USD',
          createdAt: 1,
          updatedAt: 1,
        },
        '7': {
          masterId: 7,
          maxPrice: 15,
          currency: 'USD',
          createdAt: 1,
          updatedAt: 1,
        },
      });
      await service.removeAlert(1);
      expect(Object.keys(await service.getAlerts())).toEqual(['7']);
    });

    it('concurrent first reads share one load and do not undo a save', async () => {
      const reads = Promise.all([service.getAlerts(), service.getAlerts()]);
      await service.setAlert(1, 30);
      await reads;
      await settle();
      expect(Object.keys(await service.getAlerts())).toEqual(['1']);
    });

    it('removes an alert', async () => {
      await service.setAlert(1, 30);
      await settle();
      expect(await service.removeAlert(1)).toBe(true);
      expect(await service.removeAlert(1)).toBe(false);
      expect(await service.getAlerts()).toEqual({});
      const [result] = await service.enrichItems(items);
      expect(result.priceAlert).toBeUndefined();
    });
  });

  describe('getStatus', () => {
    it('counts fresh, unchecked and alert states for wishlist records only', async () => {
      items = [
        item(1, [version(11), version(12), version(13)]),
        item(2, [version(21), version(22, { hasVinyl: false })]),
      ];
      await writePrices({
        '11': entry(20, { fetchedAt: NOW - 7 * HOUR }), // stale for alerted
        '12': entry(50, { fetchedAt: NOW - HOUR }),
        '21': entry(null, { fetchedAt: NOW - HOUR }),
      });
      await writeAlerts({
        '1': {
          masterId: 1,
          maxPrice: 30,
          currency: 'USD',
          createdAt: 1,
          updatedAt: 1,
        },
        '2': {
          masterId: 2,
          maxPrice: 30,
          currency: 'USD',
          createdAt: 1,
          updatedAt: 1,
        },
        '9': {
          masterId: 9,
          maxPrice: 30,
          currency: 'USD',
          createdAt: 1,
          updatedAt: 1,
        },
      });
      expect(await service.getStatus()).toEqual({
        pressingsTotal: 4,
        pressingsFresh: 2,
        pressingsUnchecked: 1,
        lastRunAt: undefined,
        lastCheckedAt: NOW - HOUR,
        alertsTriggered: 1,
        alertsTotal: 2,
      });
    });
  });

  describe('scheduler', () => {
    it('runs the first tick after the initial delay, then on the interval', async () => {
      jest.useFakeTimers();
      try {
        const tick = jest
          .spyOn(service, 'tick')
          .mockResolvedValue({ fetched: 0, failed: 0 });
        service.start();
        service.start(); // idempotent
        jest.advanceTimersByTime(999);
        expect(tick).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(tick).toHaveBeenCalledTimes(1);
        jest.advanceTimersByTime(2000);
        expect(tick).toHaveBeenCalledTimes(3);
        service.stop();
        jest.advanceTimersByTime(5000);
        expect(tick).toHaveBeenCalledTimes(3);
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
