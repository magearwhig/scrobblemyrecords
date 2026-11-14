import { AuthService } from '../../src/backend/services/authService';
import { WishlistService } from '../../src/backend/services/wishlistService';
import { FileStorage } from '../../src/backend/utils/fileStorage';
import {
  DiscogsPressingsStore,
  EnrichedWishlistItem,
  LocalWantItem,
  WishlistNewReleasesStore,
  WishlistSettings,
} from '../../src/shared/types';

jest.mock('../../src/backend/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

const mockAxios = {
  get: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  interceptors: {
    request: { use: jest.fn() },
    response: { use: jest.fn() },
  },
};
jest.mock('../../src/backend/utils/discogsAxios', () => ({
  getDiscogsAxios: () => mockAxios,
}));

const CATALOGUE = 'discogs/pressings.json';
const NEW_RELEASES = 'wishlist/new-releases.json';
const DAY = 24 * 60 * 60 * 1000;
const THIS_YEAR = new Date().getFullYear();

const settings = (
  tracking: Partial<NonNullable<WishlistSettings['newReleaseTracking']>> = {}
): WishlistSettings => ({
  schemaVersion: 1,
  priceThreshold: 40,
  currency: 'USD',
  autoSyncInterval: 24,
  notifyOnVinylAvailable: true,
  newReleaseTracking: {
    enabled: true,
    checkFrequencyDays: 7,
    notifyOnNewRelease: true,
    autoCheck: false,
    trackLocalWantList: true,
    ...tracking,
  },
});

const wishlistItem = (masterId: number): EnrichedWishlistItem => ({
  id: masterId * 10,
  masterId,
  releaseId: masterId * 10,
  artist: 'TV On The Radio',
  title: 'Return To Cookie Mountain',
  coverImage: 'https://example.com/cover.jpg',
  dateAdded: '2026-01-01T00:00:00Z',
  vinylStatus: 'has_vinyl',
  vinylVersions: [],
});

const localWant = (masterId: number): LocalWantItem => ({
  id: `local-${masterId}`,
  artist: 'Lucero',
  album: 'Tennessee',
  playCount: 1,
  lastPlayed: 1,
  addedAt: 1,
  source: 'discovery',
  vinylStatus: 'unknown',
  notified: false,
  masterId,
});

/** A row of Discogs /masters/:id/versions */
const row = (id: number, released = `${THIS_YEAR}`, format = 'LP') => ({
  id,
  title: 'Return To Cookie Mountain',
  format,
  label: 'Interscope',
  country: 'UK',
  released,
});

const page = (rows: unknown[]) => ({
  data: { versions: rows, pagination: { pages: 1 } },
});

describe('WishlistService new pressings', () => {
  let files: Record<string, unknown>;
  let service: WishlistService;

  const alerts = () =>
    (files[NEW_RELEASES] as WishlistNewReleasesStore | undefined)?.releases ??
    [];
  /** Fetch a master's pressings now (as any feature would) */
  const fetchWith = async (
    masterId: number,
    rows: unknown[],
    alertOverride = false
  ) => {
    mockAxios.get.mockResolvedValueOnce(page(rows));
    return service.pressings.getPressings(masterId, {
      need: 'newest',
      maxAgeMs: 0,
      alertOverride,
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAxios.get.mockReset();
    files = {
      'wishlist/settings.json': settings(),
      'wishlist/wishlist-items.json': {
        schemaVersion: 1,
        lastUpdated: 1,
        items: [wishlistItem(100)],
      },
      'wishlist/local-want-list.json': {
        schemaVersion: 1,
        items: [localWant(200)],
      },
    };
    const write = jest.fn(async (path: string, data: unknown) => {
      files[path] = JSON.parse(JSON.stringify(data));
    });
    const storage = {
      readJSON: jest.fn(async (path: string) =>
        files[path] === undefined
          ? null
          : JSON.parse(JSON.stringify(files[path]))
      ),
      writeJSON: write,
      writeJSONWithBackup: write,
      exists: jest.fn(async (path: string) => files[path] !== undefined),
      delete: jest.fn(async (path: string) => {
        delete files[path];
      }),
    } as unknown as FileStorage;
    const auth = {
      getDiscogsToken: jest.fn().mockResolvedValue('Discogs token=t'),
      getUserSettings: jest.fn().mockResolvedValue({
        discogs: { username: 'me' },
        lastfm: {},
      }),
    } as unknown as AuthService;
    service = new WishlistService(storage, auth);
  });

  it('raises an alert for a new pressing of a wishlist record', async () => {
    await fetchWith(100, [row(1)]);

    const { alerts: found } = await fetchWith(100, [row(1), row(2)]);

    expect(found).toHaveLength(1);
    expect(alerts()).toEqual([
      expect.objectContaining({
        id: '100-2',
        masterId: 100,
        releaseId: 2,
        artist: 'TV On The Radio',
        country: 'UK',
        source: 'wishlist',
        sourceItemId: 1000,
        coverImage: 'https://example.com/cover.jpg',
        dismissed: false,
      }),
    ]);
  });

  it('raises nothing for records nobody tracks', async () => {
    await fetchWith(999, [row(1)]);
    await fetchWith(999, [row(1), row(2)], true);

    expect(alerts()).toEqual([]);
  });

  it('keeps learning pressings but raises no alerts while tracking is off', async () => {
    files['wishlist/settings.json'] = settings({ enabled: false });
    await fetchWith(100, [row(1)]);

    await fetchWith(100, [row(1), row(2)]);
    expect(alerts()).toEqual([]);

    // The pressing is known now, so it is not flagged later either
    files['wishlist/settings.json'] = settings();
    await fetchWith(100, [row(1), row(2)]);
    expect(alerts()).toEqual([]);
  });

  it('raises alerts for a manual check even while tracking is off', async () => {
    files['wishlist/settings.json'] = settings({ enabled: false });
    await fetchWith(100, [row(1)]);

    await fetchWith(100, [row(1), row(2)], true);

    expect(alerts().map(r => r.id)).toEqual(['100-2']);
  });

  it('raises no alerts for want-list records when that tracking is off', async () => {
    files['wishlist/settings.json'] = settings({ trackLocalWantList: false });
    await fetchWith(200, [row(1)]);

    await fetchWith(200, [row(1), row(2)], true);

    expect(alerts()).toEqual([]);
  });

  it('never raises a dismissed alert again', async () => {
    await fetchWith(100, [row(1)]);
    await fetchWith(100, [row(1), row(2)]);
    await service.dismissNewRelease('100-2');
    // The catalogue forgets the pressing (e.g. restored from an older copy)
    const store = files[CATALOGUE] as DiscogsPressingsStore;
    delete store.releases[2];
    const reloaded = new WishlistService(
      (service as unknown as { fileStorage: FileStorage }).fileStorage,
      (service as unknown as { authService: AuthService }).authService
    );
    service = reloaded;

    await fetchWith(100, [row(1), row(2)]);

    expect(alerts()).toHaveLength(1);
    expect(alerts()[0].dismissed).toBe(true);
  });

  it('keeps every alert and dismissal when they happen at once', async () => {
    await fetchWith(100, [row(1)]);
    await fetchWith(200, [row(21)]);
    await fetchWith(100, [row(1), row(2)]);

    await Promise.all([
      fetchWith(200, [row(21), row(3)]),
      service.dismissNewRelease('100-2'),
    ]);

    expect(alerts().map(r => [r.id, r.dismissed])).toEqual([
      ['100-2', true],
      ['200-3', false],
    ]);
  });

  describe('getMasterVersions', () => {
    it('reads the catalogue while the pressings are under a week old', async () => {
      mockAxios.get.mockResolvedValue(page([row(1), row(2, '2006')]));

      const first = await service.getMasterVersions(100);
      const second = await service.getMasterVersions(100);

      expect(mockAxios.get).toHaveBeenCalledTimes(1);
      expect(second).toEqual(first);
      expect(first.map(v => v.releaseId)).toEqual([1, 2]);
    });

    it('flags a new pressing seen by a wishlist sync fetch', async () => {
      await fetchWith(100, [row(1)]);
      const store = files[CATALOGUE] as DiscogsPressingsStore;
      store.masters[100].newestCheckedAt = Date.now() - 8 * DAY;
      store.masters[100].completeCheckedAt = Date.now() - 8 * DAY;
      service = new WishlistService(
        (service as unknown as { fileStorage: FileStorage }).fileStorage,
        (service as unknown as { authService: AuthService }).authService
      );
      mockAxios.get.mockResolvedValue(page([row(1), row(2)]));

      await service.getMasterVersions(100);

      expect(alerts().map(r => r.id)).toEqual(['100-2']);
    });
  });

  describe('vinyl older than the newest pressings', () => {
    /** Answers /masters/:id/versions by page: CD-only first page, vinyl on page 2 */
    const twoPages = () =>
      mockAxios.get.mockImplementation(
        async (_url: string, opts: { params: { page: number } }) =>
          opts.params.page === 1
            ? {
                data: {
                  versions: [row(1, '2020', 'CD')],
                  pagination: { pages: 2 },
                },
              }
            : {
                data: {
                  versions: [row(2, '1990', 'LP')],
                  pagination: { pages: 2 },
                },
              }
      );

    it('fetches every page when the newest pressings have no vinyl', async () => {
      twoPages();

      const versions = await service.getMasterVersions(100);

      expect(versions.some(v => v.hasVinyl)).toBe(true);
      // Then served from the catalogue
      mockAxios.get.mockClear();
      await service.getMasterVersions(100);
      expect(mockAxios.get).not.toHaveBeenCalled();
    });

    it('raises nothing for vinyl found by the full fetch of a first look', async () => {
      mockAxios.get.mockImplementation(
        async (_url: string, opts: { params: { page: number } }) => ({
          data: {
            versions:
              opts.params.page === 1
                ? [row(1, `${THIS_YEAR}`, 'CD')]
                : [row(2, `${THIS_YEAR}`, 'LP')],
            pagination: { pages: 2 },
          },
        })
      );

      await service.getMasterVersions(100);

      expect(alerts()).toEqual([]);
    });

    it('does not call a record CD-only when the page with its vinyl fails', async () => {
      mockAxios.get.mockImplementation(
        async (_url: string, opts: { params: { page: number } }) => {
          if (opts.params.page === 2) throw new Error('boom');
          return {
            data: {
              versions: [row(1, '2020', 'CD')],
              pagination: { pages: 2 },
            },
          };
        }
      );

      await expect(service.checkMasterVinyl(100)).rejects.toThrow();
      // The versions list still shows what is known
      expect(
        (await service.getMasterVersions(100)).map(v => v.releaseId)
      ).toEqual([1]);
    });

    it('keeps the saved status when a sync cannot tell', async () => {
      mockAxios.get.mockImplementation(
        async (url: string, opts: { params: { page: number } }) => {
          if (url.startsWith('/users/')) {
            return {
              data: {
                pagination: { pages: 1, items: 1 },
                wants: [
                  {
                    id: 1000,
                    basic_information: { id: 1000, master_id: 100 },
                  },
                ],
              },
            };
          }
          if (opts.params.page === 2) throw new Error('boom');
          return {
            data: {
              versions: [row(1, '2020', 'CD')],
              pagination: { pages: 2 },
            },
          };
        }
      );

      await service.syncWishlist('me', true);

      const [saved] = (
        files['wishlist/wishlist-items.json'] as {
          items: EnrichedWishlistItem[];
        }
      ).items;
      expect(saved.vinylStatus).toBe('has_vinyl');
    });

    it('stops at the newest pressings when they include vinyl', async () => {
      mockAxios.get.mockResolvedValue({
        data: { versions: [row(1)], pagination: { pages: 5 } },
      });

      await service.getMasterVersions(100);

      expect(mockAxios.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('wishlist items', () => {
    const savedItems = () =>
      (files['wishlist/wishlist-items.json'] as { items: unknown[] }).items;

    it('takes their pressings from the catalogue, not the saved file', async () => {
      await fetchWith(100, [row(1), row(2, '2006', 'CD')]);
      // A copy saved by an older version, after the catalogue was made
      (savedItems()[0] as EnrichedWishlistItem).vinylVersions = [
        {
          releaseId: 999,
          title: 'Stale',
          format: ['LP'],
          label: 'Old',
          country: 'US',
          year: 2006,
          hasVinyl: true,
        },
      ];

      const [item] = await service.getWishlistItems();

      expect(item.vinylVersions.map(v => v.releaseId)).toEqual([1, 2]);
    });

    it('shows vinyl once the catalogue knows a vinyl pressing', async () => {
      (savedItems()[0] as EnrichedWishlistItem).vinylStatus = 'cd_only';
      await fetchWith(100, [row(1)]);

      const [item] = await service.getWishlistItems();

      expect(item.vinylStatus).toBe('has_vinyl');
    });

    it('are still listed when the catalogue cannot be read', async () => {
      // Exists but unreadable
      files[CATALOGUE] = null;

      const items = await service.getWishlistItems();

      expect(items.map(i => [i.masterId, i.vinylStatus])).toEqual([
        [100, 'has_vinyl'],
      ]);
    });

    it('keeps the saved status when the catalogue knows no vinyl', async () => {
      await fetchWith(100, [row(1, '2020', 'CD')]);

      const [item] = await service.getWishlistItems();

      expect(item.vinylStatus).toBe('has_vinyl');
    });

    it('are saved by a sync without their pressings', async () => {
      mockAxios.get.mockImplementation(async (url: string) =>
        url.startsWith('/users/')
          ? {
              data: {
                pagination: { pages: 1, items: 1 },
                wants: [
                  {
                    id: 1000,
                    date_added: '2026-01-01T00:00:00Z',
                    basic_information: {
                      id: 1000,
                      master_id: 100,
                      title: 'Return To Cookie Mountain',
                      artists: [{ name: 'TV On The Radio' }],
                    },
                  },
                ],
              },
            }
          : // Each record its own pressing
            page([row(Number(url.split('/')[2]))])
      );

      await service.syncWishlist('me', true);

      const [saved] = savedItems() as EnrichedWishlistItem[];
      expect(saved.vinylStatus).toBe('has_vinyl');
      expect(saved).not.toHaveProperty('vinylVersions');
      const [item] = await service.getWishlistItems();
      expect(item.vinylVersions.map(v => v.releaseId)).toEqual([100]);
    });
  });

  describe('checkForNewReleases', () => {
    const pagedRows = () =>
      mockAxios.get.mockImplementation(
        async (url: string, opts: { params: { page: number } }) => ({
          data: {
            versions: [row(Number(url.split('/')[2]) + opts.params.page)],
            pagination: { pages: 2 },
          },
        })
      );

    it('fetches every page of a record not fetched in full for 30 days', async () => {
      pagedRows();

      await service.checkForNewReleases(true);

      // Two masters, two pages each
      expect(mockAxios.get).toHaveBeenCalledTimes(4);
    });

    it('fetches only the newest page once fetched in full this month', async () => {
      files[CATALOGUE] = {
        schemaVersion: 1,
        releases: {},
        masters: {
          100: {
            baselineSince: 1,
            newestCheckedAt: Date.now() - 8 * DAY,
            completeCheckedAt: Date.now() - 10 * DAY,
          },
          200: {
            baselineSince: 1,
            newestCheckedAt: Date.now() - 8 * DAY,
            completeCheckedAt: Date.now() - 10 * DAY,
          },
        },
      } satisfies DiscogsPressingsStore;
      pagedRows();

      await service.checkForNewReleases(true);

      expect(mockAxios.get).toHaveBeenCalledTimes(2);
    });

    it('skips records fetched in the last week and compares the rest', async () => {
      await fetchWith(100, [row(1)]);
      await fetchWith(200, [row(21)]);
      const store = files[CATALOGUE] as DiscogsPressingsStore;
      store.masters[200].newestCheckedAt = Date.now() - 8 * DAY;
      store.masters[200].completeCheckedAt = Date.now() - 8 * DAY;
      service = new WishlistService(
        (service as unknown as { fileStorage: FileStorage }).fileStorage,
        (service as unknown as { authService: AuthService }).authService
      );
      mockAxios.get.mockReset();
      mockAxios.get.mockResolvedValue(page([row(21), row(3)]));

      const found = await service.checkForNewReleases(true);

      expect(mockAxios.get).toHaveBeenCalledTimes(1);
      expect(mockAxios.get).toHaveBeenCalledWith(
        '/masters/200/versions',
        expect.anything()
      );
      expect(found.map(r => r.id)).toEqual(['200-3']);
      expect(
        (files[NEW_RELEASES] as WishlistNewReleasesStore).lastCheck
      ).toBeGreaterThan(0);
    });

    it('only learns the pressings of a record it has never fetched', async () => {
      mockAxios.get.mockResolvedValue(page([row(1, '2006'), row(2)]));

      const found = await service.checkForNewReleases(true);

      expect(found).toEqual([]);
      expect(alerts()).toEqual([]);
      const store = files[CATALOGUE] as DiscogsPressingsStore;
      expect(store.masters[100].baselineSince).toEqual(expect.any(Number));
      expect(store.masters[200].baselineSince).toEqual(expect.any(Number));
    });
  });
});
