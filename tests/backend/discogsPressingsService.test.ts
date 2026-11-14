import {
  DiscogsPressingsService,
  PressingsDetector,
} from '../../src/backend/services/discogsPressingsService';
import { FileStorage } from '../../src/backend/utils/fileStorage';
import { DiscogsPressingsStore } from '../../src/shared/types';

jest.mock('../../src/backend/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

const mockAxios = { get: jest.fn() };
jest.mock('../../src/backend/utils/discogsAxios', () => ({
  getDiscogsAxios: () => mockAxios,
}));

const CATALOGUE = 'discogs/pressings.json';
const DAY = 24 * 60 * 60 * 1000;
const THIS_YEAR = new Date().getFullYear();

/** A row from Discogs /masters/:id/versions */
const row = (id: number, released = `${THIS_YEAR}`, format = 'LP, Album') => ({
  id,
  title: 'Return To Cookie Mountain',
  format,
  label: 'Interscope',
  country: 'US',
  released,
});

/** One page of /masters/:id/versions */
const page = (rows: unknown[], pages = 1) => ({
  data: { versions: rows, pagination: { pages } },
});

describe('DiscogsPressingsService', () => {
  let files: Record<string, unknown>;
  let raw: Record<string, string>;
  let storage: FileStorage;
  let detector: jest.MockedFunction<PressingsDetector>;
  let service: DiscogsPressingsService;

  const catalogue = () => files[CATALOGUE] as DiscogsPressingsStore;
  const make = () => {
    service = new DiscogsPressingsService(
      storage,
      async () => ({ Authorization: 'Discogs token=t' }),
      { retryDelayMs: 0 }
    );
    service.setDetector(detector);
    return service;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAxios.get.mockReset();
    files = {};
    raw = {};
    const write = jest.fn(async (path: string, data: unknown) => {
      files[path] = JSON.parse(JSON.stringify(data));
    });
    storage = {
      readJSON: jest.fn(async (path: string) => {
        if (raw[path] !== undefined) return null; // unparseable file
        return files[path] === undefined
          ? null
          : JSON.parse(JSON.stringify(files[path]));
      }),
      writeJSON: write,
      writeJSONWithBackup: write,
      exists: jest.fn(
        async (path: string) =>
          files[path] !== undefined || raw[path] !== undefined
      ),
      delete: jest.fn(async (path: string) => {
        delete files[path];
      }),
    } as unknown as FileStorage;
    detector = jest.fn().mockResolvedValue([]);
    make();
  });

  describe('getPressings', () => {
    it('fetches the newest pressings and reuses them while fresh', async () => {
      mockAxios.get.mockResolvedValue(page([row(2), row(1, '2006')]));

      const first = await service.getPressings(100, {
        need: 'newest',
        maxAgeMs: 7 * DAY,
      });
      const second = await service.getPressings(100, {
        need: 'newest',
        maxAgeMs: 7 * DAY,
      });

      expect(mockAxios.get).toHaveBeenCalledTimes(1);
      expect(mockAxios.get).toHaveBeenCalledWith('/masters/100/versions', {
        headers: { Authorization: 'Discogs token=t' },
        params: {
          page: 1,
          per_page: 100,
          sort: 'released',
          sort_order: 'desc',
        },
      });
      expect(first.fetched).toBe(true);
      expect(second.fetched).toBe(false);
      expect(second.versions.map(v => v.releaseId).sort()).toEqual([1, 2]);
      expect(second.versions[0]).toEqual(
        expect.objectContaining({ format: ['LP', 'Album'], hasVinyl: true })
      );
    });

    it('records a single page as a complete list', async () => {
      mockAxios.get.mockResolvedValue(page([row(1)]));

      await service.getPressings(100, { need: 'newest', maxAgeMs: 7 * DAY });

      const master = catalogue().masters[100];
      expect(master.completeCheckedAt).toEqual(expect.any(Number));
      expect(master.newestCheckedAt).toEqual(expect.any(Number));
    });

    it('stops at the newest 100 when that is all it needs', async () => {
      mockAxios.get.mockResolvedValue(page([row(1)], 3));

      await service.getPressings(100, { need: 'newest', maxAgeMs: 7 * DAY });

      expect(mockAxios.get).toHaveBeenCalledTimes(1);
      const master = catalogue().masters[100];
      expect(master.newestCheckedAt).toEqual(expect.any(Number));
      expect(master.completeCheckedAt).toBeUndefined();
    });

    it('fetches every page when it needs the whole list', async () => {
      mockAxios.get
        .mockResolvedValueOnce(page([row(1)], 2))
        .mockResolvedValueOnce(page([row(2)], 2));
      await service.getPressings(100, { need: 'newest', maxAgeMs: 7 * DAY });

      mockAxios.get
        .mockResolvedValueOnce(page([row(1)], 2))
        .mockResolvedValueOnce(page([row(2)], 2));
      const result = await service.getPressings(100, {
        need: 'complete',
        maxAgeMs: 30 * DAY,
      });

      expect(mockAxios.get).toHaveBeenCalledTimes(3);
      expect(result.releaseIds.sort()).toEqual([1, 2]);
      expect(catalogue().masters[100].completeCheckedAt).toEqual(
        expect.any(Number)
      );
    });

    it('keeps what it got when a later page fails, without marking it checked', async () => {
      mockAxios.get
        .mockResolvedValueOnce(page([row(1)], 2))
        .mockRejectedValueOnce(new Error('boom'));

      const result = await service.getPressings(100, {
        need: 'complete',
        maxAgeMs: 30 * DAY,
      });

      expect(result.failed).toBe(true);
      expect(Object.keys(catalogue().releases)).toEqual(['1']);
      expect(catalogue().masters[100] ?? {}).toEqual({});
    });

    it('retries when Discogs is busy', async () => {
      const busy = Object.assign(new Error('429'), {
        isAxiosError: true,
        response: { status: 429 },
      });
      mockAxios.get
        .mockRejectedValueOnce(busy)
        .mockResolvedValueOnce(page([row(1)]));

      const result = await service.getPressings(100, {
        need: 'newest',
        maxAgeMs: 7 * DAY,
      });

      expect(result.failed).toBe(false);
      expect(mockAxios.get).toHaveBeenCalledTimes(2);
    });

    it('shares one fetch between callers asking at the same time', async () => {
      mockAxios.get.mockResolvedValue(page([row(1)]));

      await Promise.all([
        service.getPressings(100, { need: 'newest', maxAgeMs: 7 * DAY }),
        service.getPressings(100, { need: 'complete', maxAgeMs: 30 * DAY }),
      ]);

      expect(mockAxios.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('new pressing detection', () => {
    const fetchWith = async (rows: unknown[], pages = 1) => {
      mockAxios.get.mockResolvedValueOnce(page(rows, pages));
      return service.getPressings(100, {
        need: 'newest',
        maxAgeMs: 0,
        alertOverride: true,
      });
    };

    it('only learns pressings the first time it sees a master', async () => {
      await fetchWith([row(1, '2006'), row(2)]);

      expect(detector).not.toHaveBeenCalled();
      expect(catalogue().masters[100].baselineSince).toEqual(
        expect.any(Number)
      );
    });

    it('passes recent vinyl it has not seen before to the detector', async () => {
      detector.mockResolvedValue([{ id: '100-2' } as never]);
      await fetchWith([row(1)]);

      const result = await fetchWith([
        row(1),
        row(2),
        row(3, '2006'),
        row(4, `${THIS_YEAR}`, 'CD, Album'),
        row(5, `${THIS_YEAR - 1}-03-01`),
      ]);

      expect(detector).toHaveBeenCalledTimes(1);
      expect(detector).toHaveBeenCalledWith(
        100,
        [
          expect.objectContaining({ releaseId: 2 }),
          expect.objectContaining({ releaseId: 5 }),
        ],
        { alertOverride: true }
      );
      expect(result.alerts).toEqual([{ id: '100-2' }]);
    });

    it('flags an undated pressing only after it has seen every pressing', async () => {
      await fetchWith([row(1)], 3); // newest only
      await fetchWith([row(1), row(2, '')]);
      expect(detector).not.toHaveBeenCalled();

      await fetchWith([row(1), row(2, ''), row(3, '')]);
      expect(detector).toHaveBeenCalledWith(
        100,
        [expect.objectContaining({ releaseId: 3 })],
        expect.anything()
      );
    });

    it('does not start remembering from a list that failed part-way', async () => {
      mockAxios.get
        .mockResolvedValueOnce(page([row(1)], 2))
        .mockRejectedValueOnce(new Error('boom'));
      await service.getPressings(100, { need: 'complete', maxAgeMs: 0 });

      await fetchWith([row(1), row(2)]);

      expect(detector).not.toHaveBeenCalled();
    });

    it('treats pressings it only knows by ID as already seen', async () => {
      await service.noteReleaseMaster(2, 100);
      await fetchWith([row(1)]);

      await fetchWith([row(1), row(2)]);

      expect(detector).not.toHaveBeenCalled();
    });

    it('does not flag a pressing Discogs moved from another master', async () => {
      await service.noteReleaseMaster(5, 999);
      await fetchWith([row(1)]);

      await fetchWith([row(1), row(5)]);

      expect(detector).not.toHaveBeenCalled();
      expect(await service.masterOf(5)).toBe(100);
      expect((await service.masterStatus(999)).knownCount).toBe(0);
    });

    it('does not remember pressings whose alerts could not be saved', async () => {
      await fetchWith([row(1)]);
      detector.mockRejectedValueOnce(new Error('disk full'));

      await expect(fetchWith([row(1), row(2)])).rejects.toThrow('disk full');
      expect(catalogue().releases[2]).toBeUndefined();

      detector.mockResolvedValue([]);
      await fetchWith([row(1), row(2)]);
      expect(detector).toHaveBeenLastCalledWith(
        100,
        [expect.objectContaining({ releaseId: 2 })],
        expect.anything()
      );
    });
  });

  describe('release lookups', () => {
    it('remembers which master a release belongs to', async () => {
      await service.noteReleaseMaster(7, 100);
      await service.flush();

      const reloaded = make();
      expect(await reloaded.masterOf(7)).toBe(100);
      mockAxios.get.mockResolvedValue(page([]));
      expect(await reloaded.masterOf(8)).toBeUndefined();
      const { versions } = await reloaded.getPressings(100, {
        need: 'newest',
        maxAgeMs: Infinity,
      });
      expect(versions).toEqual([]);
    });
  });

  describe('storage', () => {
    it('refuses to replace a catalogue it cannot read', async () => {
      raw[CATALOGUE] = '{ not json';
      mockAxios.get.mockResolvedValue(page([row(1)]));

      await expect(
        service.getPressings(100, { need: 'newest', maxAgeMs: 0 })
      ).rejects.toThrow(/discogs\/pressings\.json/);
      expect(files[CATALOGUE]).toBeUndefined();
    });

    it('keeps changes in memory and saves them later when a save fails', async () => {
      await service.noteReleaseMaster(7, 100);
      const write = storage.writeJSON as jest.Mock;
      const realWrite = write.getMockImplementation()!;
      write.mockImplementationOnce(async () => {
        throw new Error('disk full');
      });

      await expect(service.flush()).rejects.toThrow('disk full');
      await service.noteReleaseMaster(8, 100);
      write.mockImplementation(realWrite);
      await service.flush();

      expect(catalogue().releases[7]).toEqual(
        expect.objectContaining({ masterId: 100 })
      );
      expect(catalogue().releases[8]).toBeDefined();
    });

    it('saves a lookup noted while an earlier save was being written', async () => {
      await service.noteReleaseMaster(7, 100);
      const write = storage.writeJSON as jest.Mock;
      const realWrite = write.getMockImplementation()!;
      let finishWrite: () => void = () => undefined;
      write.mockImplementationOnce(async (path: string, data: unknown) => {
        await realWrite(path, data);
        await new Promise<void>(resolve => {
          finishWrite = resolve;
        });
      });

      const saving = service.flush();
      await new Promise(r => setTimeout(r, 0));
      await service.noteReleaseMaster(8, 100);
      finishWrite();
      await saving;
      await service.flush();

      expect(catalogue().releases[8]).toBeDefined();
    });

    it('runs queued work one at a time', async () => {
      const order: string[] = [];
      let release: () => void = () => undefined;
      const first = service.exclusive(
        () =>
          new Promise<void>(resolve => {
            order.push('first start');
            release = () => {
              order.push('first end');
              resolve();
            };
          })
      );
      const second = service.exclusive(async () => {
        order.push('second');
      });
      await new Promise(r => setTimeout(r, 0));
      release();
      await Promise.all([first, second]);

      expect(order).toEqual(['first start', 'first end', 'second']);
    });

    it('presents its pressings as the old versions cache for export', async () => {
      mockAxios.get.mockResolvedValue(page([row(1)]));
      await service.getPressings(100, { need: 'newest', maxAgeMs: 0 });

      const view = await service.versionsCacheView();

      expect(view.entries[100].versions).toEqual([
        expect.objectContaining({ releaseId: 1, hasVinyl: true }),
      ]);
    });
  });

  describe('migration from the old caches', () => {
    beforeEach(() => {
      files['sellers/release-master-cache.json'] = {
        schemaVersion: 2,
        lastUpdated: 1,
        releaseToMaster: { 10: 100, 20: 200 },
        masterToReleases: {
          100: { releases: [10, 11], fetchedAt: Date.now() },
          200: { releases: [20], fetchedAt: Date.now() },
        },
      };
      files['wishlist/versions-cache.json'] = {
        schemaVersion: 1,
        entries: {
          100: {
            masterId: 100,
            fetchedAt: 1,
            versions: [
              {
                releaseId: 12,
                title: 'T',
                format: ['LP'],
                label: 'L',
                country: 'US',
                year: 2020,
                hasVinyl: true,
              },
            ],
          },
        },
      };
      files['wishlist/known-pressings.json'] = {
        schemaVersion: 1,
        masters: {
          300: {
            releaseIds: [30, 31],
            checkedAt: 5,
            complete: true,
            updatedAt: 5,
          },
        },
      };
      files['wishlist/new-releases.json'] = {
        schemaVersion: 1,
        lastCheck: 1,
        releases: [
          {
            id: '400-40',
            masterId: 400,
            releaseId: 40,
            title: 'A',
            artist: 'B',
            year: 2024,
            country: 'UK',
            format: ['LP'],
            label: 'X',
            source: 'wishlist',
            sourceItemId: 1,
            detectedAt: 1,
            notified: false,
            dismissed: true,
            discogsUrl: '',
          },
        ],
      };
      files['wishlist/wishlist-items.json'] = {
        schemaVersion: 1,
        lastUpdated: 1,
        items: [
          {
            masterId: 500,
            vinylVersions: [
              {
                releaseId: 50,
                title: 'C',
                format: ['LP'],
                label: 'Y',
                country: 'DE',
                year: 1999,
                hasVinyl: true,
              },
            ],
          },
        ],
      };
    });

    it('brings every known pressing into the catalogue without flagging any', async () => {
      await service.masterOf(1);

      const store = catalogue();
      expect(Object.keys(store.releases).map(Number).sort()).toEqual([
        10, 11, 12, 20, 30, 31, 40, 50,
      ]);
      expect(store.releases[12].version).toEqual(
        expect.objectContaining({ year: 2020, hasVinyl: true })
      );
      expect(store.releases[40]).toEqual(
        expect.objectContaining({ masterId: 400 })
      );
      expect(store.releases[10].version).toBeUndefined();
      expect(detector).not.toHaveBeenCalled();
    });

    it('keeps baselines only where one was recorded', async () => {
      await service.masterOf(1);

      const masters = catalogue().masters;
      expect(masters[300]).toEqual(
        expect.objectContaining({ baselineSince: 5, everComplete: true })
      );
      // Its pressing details weren't kept, so it still needs fetching
      expect(masters[300].newestCheckedAt).toBeUndefined();
      expect(masters[100]?.baselineSince).toBeUndefined();
    });

    it('fetches a migrated master whose pressing details were not kept', async () => {
      mockAxios.get.mockResolvedValue(page([row(30), row(31)]));

      const { versions, fetched } = await service.getPressings(300, {
        need: 'newest',
        maxAgeMs: Infinity,
      });

      expect(fetched).toBe(true);
      expect(versions.map(v => v.releaseId).sort()).toEqual([30, 31]);
    });

    it('moves the old cache files aside so they are not read again', async () => {
      await service.masterOf(1);

      for (const legacy of [
        'sellers/release-master-cache.json',
        'wishlist/versions-cache.json',
        'wishlist/known-pressings.json',
      ]) {
        expect(files[legacy]).toBeUndefined();
        expect(
          files[legacy.replace(/\.json$/, '-pre-catalogue.bak')]
        ).toBeDefined();
      }
      // Still in use elsewhere
      expect(files['wishlist/new-releases.json']).toBeDefined();
      expect(files['wishlist/wishlist-items.json']).toBeDefined();
    });

    it('finishes moving old files aside after an interrupted import', async () => {
      // The catalogue was written but the old files were not moved
      files[CATALOGUE] = { schemaVersion: 1, releases: {}, masters: {} };

      await service.masterOf(1);

      expect(files['sellers/release-master-cache.json']).toBeUndefined();
      expect(
        files['sellers/release-master-cache-pre-catalogue.bak']
      ).toBeDefined();
      // Already imported, so not imported again
      expect(catalogue().releases).toEqual({});
    });
  });
});
