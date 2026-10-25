import { ExportDataService } from '../../../src/backend/services/exportDataService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';
import {
  CollectionItem,
  EnrichedWishlistItem,
  ExportWishlistRow,
  LocalWantItem,
  ScrobbleHistoryIndex,
  UserSettings,
  VersionsCache,
} from '../../../src/shared/types';

const USERNAME = 'collector';
const NOW = new Date('2026-10-20T12:00:00.500Z');
const PAGE_TIME = Date.parse('2026-10-01T10:00:00.250Z');

function item(
  releaseId: number,
  overrides: {
    artist?: string;
    title?: string;
    masterId?: number;
    year?: number;
    rating?: number;
    dateAdded?: string;
    notes?: CollectionItem['notes'];
  } = {}
): CollectionItem {
  return {
    id: releaseId,
    date_added: overrides.dateAdded ?? '2024-01-15T10:30:00-08:00',
    rating: overrides.rating ?? 3,
    notes: overrides.notes,
    release: {
      id: releaseId,
      master_id: overrides.masterId ?? releaseId * 10,
      title: overrides.title ?? `Album ${releaseId}`,
      artist: overrides.artist ?? 'Test Artist',
      year: overrides.year ?? 2020,
      format: ['Vinyl'],
      label: ['Test Records'],
      cover_image: `https://example.com/${releaseId}.jpg`,
      resource_url: `https://api.discogs.com/releases/${releaseId}`,
    },
  };
}

function want(
  id: number,
  overrides: Partial<EnrichedWishlistItem> = {}
): EnrichedWishlistItem {
  return {
    id,
    masterId: id * 10,
    releaseId: id,
    artist: 'Want Artist',
    title: `Want ${id}`,
    year: 2001,
    dateAdded: '2020-12-04T19:42:05-08:00',
    notes: '',
    rating: 0,
    vinylStatus: 'has_vinyl',
    vinylVersions: [],
    ...overrides,
  };
}

function localWant(
  id: string,
  overrides: Partial<LocalWantItem> = {}
): LocalWantItem {
  return {
    id,
    artist: 'local artist',
    album: `local album ${id}`,
    playCount: 42,
    lastPlayed: 1758471275, // seconds
    addedAt: 1768200682802, // ms
    source: 'discovery',
    vinylStatus: 'unknown',
    notified: false,
    ...overrides,
  };
}

const SETTINGS: UserSettings = {
  discogs: { token: 'DISCOGS_SECRET_TOKEN', username: USERNAME },
  lastfm: {
    apiKey: 'LASTFM_API_KEY_VALUE',
    sessionKey: 'LASTFM_SESSION_KEY_VALUE',
    username: 'lastfm-user',
  },
  preferences: { defaultTimestamp: 'now', batchSize: 50, autoScrobble: false },
  temp: { oauthTokenSecret: 'OAUTH_TOKEN_SECRET_VALUE' },
};

/** Collection cache pages; items are split into pages of `perPage` */
function pages(
  items: CollectionItem[],
  opts: {
    perPage?: number;
    pagesExpected?: number;
    itemsExpected?: number;
    timestamps?: number[];
  } = {}
): Record<string, unknown> {
  const perPage = opts.perPage ?? 50;
  const files: Record<string, unknown> = {};
  const count = Math.max(1, Math.ceil(items.length / perPage));
  for (let i = 0; i < count; i++) {
    files[`collections/${USERNAME}-page-${i + 1}.json`] = {
      success: true,
      data: items.slice(i * perPage, (i + 1) * perPage),
      pagination: {
        page: i + 1,
        pages: opts.pagesExpected ?? count,
        per_page: perPage,
        items: opts.itemsExpected ?? items.length,
      },
      timestamp: opts.timestamps?.[i] ?? PAGE_TIME,
    };
  }
  return files;
}

describe('ExportDataService', () => {
  let files: Record<string, unknown>;
  let wants: EnrichedWishlistItem[];
  let localWants: LocalWantItem[];
  let versionsCache: VersionsCache;
  let settings: UserSettings;
  let historyIndex: ScrobbleHistoryIndex | null;
  let fileStorage: jest.Mocked<Pick<FileStorage, 'readJSON'>>;
  let wishlistService: {
    getWishlistItems: jest.Mock;
    getLocalWantList: jest.Mock;
    getVersionsCache: jest.Mock;
  };

  const createService = () =>
    new ExportDataService(
      fileStorage as unknown as FileStorage,
      wishlistService,
      { getIndex: async () => historyIndex },
      () => NOW
    );

  const wishlistRow = (rows: ExportWishlistRow[], rowId: string) => {
    const row = rows.find(r => r.rowId === rowId);
    if (!row) throw new Error(`No row ${rowId}`);
    return row;
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    files = {};
    wants = [];
    localWants = [];
    versionsCache = { schemaVersion: 1, entries: {} };
    settings = SETTINGS;
    historyIndex = null;
    fileStorage = {
      readJSON: jest.fn(
        async (path: string) =>
          (path === 'settings/user-settings.json'
            ? settings
            : (files[path] ?? null)) as never
      ) as never,
    };
    wishlistService = {
      getWishlistItems: jest.fn(async () => wants),
      getLocalWantList: jest.fn(async () => localWants),
      getVersionsCache: jest.fn(async () => versionsCache),
    };
  });

  describe('getCollectionRows', () => {
    it('gives each copy of a release its own stable rowId', async () => {
      // Arrange: the later copy comes first in cache order
      const later = item(100, { dateAdded: '2022-05-01T00:00:00Z' });
      const earlier = item(100, { dateAdded: '2021-05-01T00:00:00Z' });
      files = pages([later, item(5), earlier]);
      const service = createService();

      // Act
      const rows = await service.getCollectionRows();
      const again = await service.getCollectionRows();

      // Assert
      expect(rows).toHaveLength(3);
      expect(rows.map(r => r.rowId)).toEqual([
        'discogs-collection:100:1',
        'discogs-collection:100:2',
        'discogs-collection:5:1',
      ]);
      expect(rows[0].dateAddedRaw).toBe('2021-05-01T00:00:00Z');
      expect(rows[1].dateAddedRaw).toBe('2022-05-01T00:00:00Z');
      expect(again.map(r => r.rowId)).toEqual(rows.map(r => r.rowId));
    });

    it('repeats copyCount on every copy of a release', async () => {
      files = pages([item(100), item(100), item(5)]);

      const rows = await createService().getCollectionRows();

      expect(rows.map(r => [r.rowId, r.copyCount])).toEqual([
        ['discogs-collection:100:1', 2],
        ['discogs-collection:100:2', 2],
        ['discogs-collection:5:1', 1],
      ]);
    });

    it('keeps raw artists and strips suffixes for display only', async () => {
      files = pages([
        item(1, { artist: 'Turnstile (2), Someone (3)' }),
        item(2, { artist: 'Sunn O)))' }),
      ]);

      const [multi, sunn] = await createService().getCollectionRows();

      expect(multi.artistRaw).toBe('Turnstile (2), Someone (3)');
      expect(multi.artistDisplay).toBe('Turnstile, Someone');
      expect(multi.artistIdentityKey).toBe('turnstile#2,someone#3');
      expect(multi.albumNameKey).toBe('turnstilesomeone|album1');
      expect(sunn.artistDisplay).toBe('Sunn O)))');
    });

    it('turns Discogs zeros and blanks into null or []', async () => {
      const blank = item(1, { year: 0, rating: 0, masterId: 0 });
      blank.release.cover_image = '';
      blank.release.catalog_number = '';
      files = pages([blank]);

      const [row] = await createService().getCollectionRows();

      expect(row).toMatchObject({
        year: null,
        rating: null,
        masterId: null,
        masterIdSource: null,
        coverImageUrl: null,
        catalogNumbers: [],
        genres: null,
        styles: null,
        mediaCondition: null,
        sleeveCondition: null,
        notes: null,
        customFields: [],
      });
    });

    it('splits condition notes, free text and custom fields', async () => {
      files = pages([
        item(1, {
          notes: [
            { field_id: 4, value: 'Shelf A' },
            { field_id: 1, value: 'Near Mint (NM or M-)' },
            { field_id: 2, value: 'Very Good Plus (VG+)' },
            { field_id: 3, value: 'Signed' },
            { field_id: 5, value: '  ' },
          ],
        }),
      ]);

      const [row] = await createService().getCollectionRows();

      expect(row.mediaCondition).toBe('Near Mint (NM or M-)');
      expect(row.sleeveCondition).toBe('Very Good Plus (VG+)');
      expect(row.notes).toBe('Signed');
      expect(row.customFields).toEqual([{ fieldId: 4, value: 'Shelf A' }]);
    });

    it('converts Discogs offset dates to ISO UTC and Unix seconds', async () => {
      files = pages([item(1, { dateAdded: '2020-12-04T19:42:05-08:00' })]);

      const [row] = await createService().getCollectionRows();

      expect(row.dateAdded).toBe('2020-12-05T03:42:05Z');
      expect(row.dateAddedUnix).toBe(1607139725);
      expect(row.dateAddedRaw).toBe('2020-12-04T19:42:05-08:00');
    });

    it('uses null for a date that cannot be parsed and keeps the raw text', async () => {
      files = pages([item(1, { dateAdded: 'not a date' })]);
      wants = [want(9, { dateAdded: '' })];
      localWants = [localWant('lw', { addedAt: undefined as never })];
      const service = createService();

      const [row] = await service.getCollectionRows();
      const wishlist = await service.getWishlistRows();

      expect(row).toMatchObject({
        dateAdded: null,
        dateAddedUnix: null,
        dateAddedRaw: 'not a date',
      });
      expect(wishlistRow(wishlist, 'discogs-want:9')).toMatchObject({
        dateAdded: null,
        dateAddedUnix: null,
        dateAddedRaw: '',
      });
      expect(wishlistRow(wishlist, 'local-want:lw')).toMatchObject({
        dateAdded: null,
        dateAddedUnix: null,
      });
    });

    it('reads genres and styles from the release cache when present', async () => {
      files = {
        ...pages([item(1), item(2)]),
        'collections/release-1.json': {
          id: 1,
          genres: ['Rock'],
          styles: ['Shoegaze'],
        },
      };

      const [withDetails, without] = await createService().getCollectionRows();

      expect(withDetails.genres).toEqual(['Rock']);
      expect(withDetails.styles).toEqual(['Shoegaze']);
      expect(without.genres).toBeNull();
      expect(without.styles).toBeNull();
    });

    it('skips the release files when details are not wanted', async () => {
      files = {
        ...pages([item(1)]),
        'collections/release-1.json': { id: 1, genres: ['Rock'] },
      };
      const service = createService();

      const [row] = await service.getCollectionRows({ releaseDetails: false });
      await service.getWishlistRows();

      expect(row.genres).toBeNull();
      expect(
        fileStorage.readJSON.mock.calls.some(([path]) =>
          String(path).startsWith('collections/release-')
        )
      ).toBe(false);
    });

    it('sets masterIdSource to release-data when the master is known', async () => {
      files = pages([item(1, { masterId: 77 })]);

      const [row] = await createService().getCollectionRows();

      expect(row.masterId).toBe(77);
      expect(row.masterIdSource).toBe('release-data');
    });

    it('returns no rows when no Discogs username is set', async () => {
      settings = { ...SETTINGS, discogs: {} };
      files = pages([item(1)]);

      expect(await createService().getCollectionRows()).toEqual([]);
    });
  });

  describe('getWishlistRows', () => {
    it('builds Discogs want rows with null for absent values', async () => {
      files = pages([item(1)]);
      wants = [want(9, { masterId: 0, coverImage: undefined })];

      const [row] = await createService().getWishlistRows();

      expect(row).toMatchObject({
        rowId: 'discogs-want:9',
        source: 'discogs-want',
        releaseId: 9,
        masterId: null,
        masterIdSource: null,
        notes: null,
        priority: null,
        playCount: null,
        lowestVinylPrice: null,
        priceCurrency: null,
        coverImageUrl: null,
        searchMasterIdCandidate: null,
        dateAdded: '2020-12-05T03:42:05Z',
        dateAddedUnix: 1607139725,
        dateAddedRaw: '2020-12-04T19:42:05-08:00',
      });
    });

    it('looks up a want’s format and label in the versions cache', async () => {
      files = pages([item(1)]);
      wants = [
        want(9, { masterId: 500, releaseId: 999 }),
        // masterId 0: found through any cache entry
        want(8, { masterId: 0, releaseId: 888 }),
        want(7, { masterId: 700, releaseId: 777 }),
      ];
      versionsCache = {
        schemaVersion: 1,
        entries: {
          500: {
            masterId: 500,
            fetchedAt: 0,
            versions: [
              {
                releaseId: 999,
                title: 'Want 9',
                format: ['Vinyl', 'LP', 'Album'],
                label: 'Label X',
                country: 'UK',
                year: 2001,
                hasVinyl: true,
              },
            ],
          },
          600: {
            masterId: 600,
            fetchedAt: 0,
            versions: [
              {
                releaseId: 888,
                title: 'Want 8',
                format: ['CD'],
                label: '',
                country: 'US',
                year: 1999,
                hasVinyl: false,
              },
            ],
          },
        },
      };

      const rows = await createService().getWishlistRows();

      expect(wishlistRow(rows, 'discogs-want:9')).toMatchObject({
        formats: ['Vinyl', 'LP', 'Album'],
        labels: ['Label X'],
      });
      expect(wishlistRow(rows, 'discogs-want:8')).toMatchObject({
        formats: ['CD'],
        labels: [],
      });
      expect(wishlistRow(rows, 'discogs-want:7')).toMatchObject({
        formats: [],
        labels: [],
      });
    });

    it('reads local-want addedAt as ms, never as seconds', async () => {
      files = pages([item(1)]);
      localWants = [localWant('abc', { addedAt: 1768200682802 })];

      const [row] = await createService().getWishlistRows();

      expect(row).toMatchObject({
        rowId: 'local-want:abc',
        source: 'local-want',
        dateAdded: '2026-01-12T06:51:22Z',
        dateAddedUnix: 1768200682,
        dateAddedRaw: 1768200682802,
        playCount: 42,
        artistIdentityKey: null,
        title: 'local album abc',
        notes: null,
        priority: null,
        year: null,
      });
    });

    it('never exports a local want’s stored releaseId as a release', async () => {
      // Arrange: the stored "releaseId" is really a master id that happens
      // to equal an unrelated collection release id
      files = pages([item(300, { masterId: 3000 })]);
      localWants = [
        localWant('trap', { masterId: 777, releaseId: 300 }),
        localWant('same', { masterId: 555, releaseId: 555 }),
      ];

      // Act
      const rows = await createService().getWishlistRows();

      // Assert
      const trap = wishlistRow(rows, 'local-want:trap');
      expect(trap.releaseId).toBeNull();
      expect(trap.masterId).toBe(777);
      expect(trap.masterIdSource).toBe('search-guess');
      expect(trap.searchMasterIdCandidate).toBe(300);
      expect(trap.ownedMatch).toBe('not-owned');
      expect(trap.ownedCollectionRowIds).toEqual([]);
      const same = wishlistRow(rows, 'local-want:same');
      expect(same.releaseId).toBeNull();
      expect(same.searchMasterIdCandidate).toBeNull();
    });

    describe('owned matching', () => {
      beforeEach(() => {
        files = pages([
          item(100, { masterId: 1000, dateAdded: '2021-01-01T00:00:00Z' }),
          item(100, { masterId: 1000, dateAdded: '2022-01-01T00:00:00Z' }),
          item(200, { masterId: 500, artist: 'Other', title: 'Other' }),
          item(300, { masterId: 0, artist: 'Named (2)', title: 'By Name' }),
        ]);
      });

      it('matches the same release as certain and lists every copy', async () => {
        wants = [want(100, { masterId: 1000 })];

        const [row] = await createService().getWishlistRows();

        expect(row.ownedMatch).toBe('owned-same-release');
        expect(row.ownedMatchConfidence).toBe('certain');
        expect(row.ownedCollectionRowIds).toEqual([
          'discogs-collection:100:1',
          'discogs-collection:100:2',
        ]);
        expect(row.ownedCollectionLinks).toEqual([
          {
            rowId: 'discogs-collection:100:1',
            basis: 'release-id',
            confidence: 'certain',
          },
          {
            rowId: 'discogs-collection:100:2',
            basis: 'release-id',
            confidence: 'certain',
          },
        ]);
      });

      it('matches another version of a confirmed master as confident', async () => {
        wants = [want(999, { masterId: 500 })];

        const [row] = await createService().getWishlistRows();

        expect(row.ownedMatch).toBe('owned-other-version');
        expect(row.ownedMatchConfidence).toBe('confident');
        expect(row.ownedCollectionLinks).toEqual([
          {
            rowId: 'discogs-collection:200:1',
            basis: 'master-id',
            confidence: 'confident',
          },
        ]);
      });

      it('matches a search-guess master only as likely', async () => {
        // Same names too: a search guess is never upgraded
        localWants = [
          localWant('lw', { masterId: 500, artist: 'other', album: 'other' }),
        ];

        const [row] = await createService().getWishlistRows();

        expect(row.ownedMatch).toBe('owned-other-version');
        expect(row.ownedMatchConfidence).toBe('likely');
        expect(row.ownedCollectionLinks).toEqual([
          {
            rowId: 'discogs-collection:200:1',
            basis: 'search-master-id',
            confidence: 'likely',
          },
        ]);
      });

      it('matches names only as likely', async () => {
        wants = [
          want(42, { masterId: 0, artist: 'Named (2)', title: 'By Name' }),
        ];

        const [row] = await createService().getWishlistRows();

        expect(row.ownedMatch).toBe('owned-name-match');
        expect(row.ownedMatchConfidence).toBe('likely');
        expect(row.ownedCollectionLinks).toEqual([
          {
            rowId: 'discogs-collection:300:1',
            basis: 'name',
            confidence: 'likely',
          },
        ]);
      });

      it('reports not-owned with no confidence when nothing matches', async () => {
        wants = [want(42)];

        const [row] = await createService().getWishlistRows();

        expect(row.ownedMatch).toBe('not-owned');
        expect(row.ownedMatchConfidence).toBeNull();
        expect(row.ownedCollectionRowIds).toEqual([]);
        expect(row.ownedCollectionLinks).toEqual([]);
      });

      it('lists weaker matches after the strongest one', async () => {
        // Same master as release 100, and the same names as release 300
        wants = [
          want(42, { masterId: 1000, artist: 'Named (2)', title: 'By Name' }),
        ];

        const [row] = await createService().getWishlistRows();

        expect(row.ownedMatch).toBe('owned-other-version');
        expect(row.ownedMatchConfidence).toBe('confident');
        expect(row.ownedCollectionLinks.map(l => [l.rowId, l.basis])).toEqual([
          ['discogs-collection:100:1', 'master-id'],
          ['discogs-collection:100:2', 'master-id'],
          ['discogs-collection:300:1', 'name'],
        ]);
      });
    });

    describe('suffix identity', () => {
      beforeEach(() => {
        files = pages([item(1, { artist: 'Artist (2)', title: 'Same' })]);
      });

      it('never name-matches a different Discogs suffix', async () => {
        wants = [
          want(10, { artist: 'Artist (3)', title: 'Same' }),
          want(11, { artist: 'Artist', title: 'Same' }),
          want(12, { artist: 'Artist (2)', title: 'Same' }),
        ];

        const rows = await createService().getWishlistRows();

        expect(wishlistRow(rows, 'discogs-want:10').ownedMatch).toBe(
          'not-owned'
        );
        expect(wishlistRow(rows, 'discogs-want:11').ownedMatch).toBe(
          'not-owned'
        );
        expect(wishlistRow(rows, 'discogs-want:12').ownedMatch).toBe(
          'owned-name-match'
        );
        // Same display, different identity
        expect(wishlistRow(rows, 'discogs-want:10').artistDisplay).toBe(
          wishlistRow(rows, 'discogs-want:12').artistDisplay
        );
      });

      it('lets a local want name-match any suffix as likely', async () => {
        localWants = [localWant('lw', { artist: 'artist', album: 'same' })];

        const [row] = await createService().getWishlistRows();

        expect(row.ownedMatch).toBe('owned-name-match');
        expect(row.ownedMatchConfidence).toBe('likely');
        expect(row.ownedCollectionRowIds).toEqual(['discogs-collection:1:1']);
      });
    });

    it('links Discogs and local wants for the same album as likely', async () => {
      files = pages([item(1)]);
      wants = [
        want(10, { masterId: 500 }),
        want(11, { masterId: 0, artist: 'Band', title: 'Record' }),
        want(12, { masterId: 600 }),
      ];
      localWants = [
        localWant('master', { masterId: 500 }),
        localWant('name', { artist: 'band', album: 'record' }),
      ];

      const rows = await createService().getWishlistRows();

      expect(wishlistRow(rows, 'discogs-want:10').relatedWishlistLinks).toEqual(
        [
          {
            rowId: 'local-want:master',
            basis: 'search-master-id',
            confidence: 'likely',
          },
        ]
      );
      expect(wishlistRow(rows, 'local-want:name').relatedWishlistLinks).toEqual(
        [{ rowId: 'discogs-want:11', basis: 'name', confidence: 'likely' }]
      );
      expect(wishlistRow(rows, 'discogs-want:12').relatedWishlistLinks).toEqual(
        []
      );
    });

    it('sorts by source, then rowId, and filters by source', async () => {
      files = pages([item(1)]);
      wants = [want(20), want(10)];
      localWants = [localWant('b'), localWant('a')];
      const service = createService();

      const all = await service.getWishlistRows();
      const localOnly = await service.getWishlistRows({
        sources: ['local-want'],
      });

      expect(all.map(r => r.rowId)).toEqual([
        'discogs-want:10',
        'discogs-want:20',
        'local-want:a',
        'local-want:b',
      ]);
      expect(localOnly.map(r => r.rowId)).toEqual([
        'local-want:a',
        'local-want:b',
      ]);
    });
  });

  describe('cache completeness', () => {
    it('reports a complete cache and matches normally', async () => {
      files = pages([item(1), item(2), item(3)], { perPage: 1 });
      wants = [want(42)];
      const service = createService();

      const meta = await service.getSnapshotMeta();
      const [row] = await service.getWishlistRows();

      expect(meta.collectionCache).toMatchObject({
        status: 'complete',
        pagesExpected: 3,
        pagesRead: 3,
        itemsExpected: 3,
        itemsRead: 3,
      });
      expect(row.ownedMatch).toBe('not-owned');
    });

    it('reports partial when a middle page is missing and turns not-owned into unknown', async () => {
      // Arrange: 5 pages, page 3 missing, page 1 the oldest
      const items = [1, 2, 3, 4, 5].map(id => item(id));
      files = pages(items, {
        perPage: 1,
        timestamps: [PAGE_TIME - 5000, PAGE_TIME, PAGE_TIME, PAGE_TIME, 0],
      });
      delete files[`collections/${USERNAME}-page-3.json`];
      wants = [want(42), want(1)];
      const service = createService();

      // Act
      const meta = await service.getSnapshotMeta();
      const rows = await service.getCollectionRows();
      const wishlist = await service.getWishlistRows();

      // Assert
      expect(meta.collectionCache).toEqual({
        status: 'partial',
        pagesExpected: 5,
        pagesRead: 2,
        itemsExpected: 5,
        itemsRead: 2,
        oldestPageAt: '2026-10-01T09:59:55Z',
        newestPageAt: '2026-10-01T10:00:00Z',
      });
      expect(meta.collectionCachedAt).toBe('2026-10-01T09:59:55Z');
      expect(rows.map(r => r.releaseId)).toEqual([1, 2]);
      expect(wishlistRow(wishlist, 'discogs-want:42').ownedMatch).toBe(
        'unknown'
      );
      expect(
        wishlistRow(wishlist, 'discogs-want:42').ownedMatchConfidence
      ).toBeNull();
      // Positive matches stay
      expect(wishlistRow(wishlist, 'discogs-want:1').ownedMatch).toBe(
        'owned-same-release'
      );
    });

    it('reports partial when the item count does not match', async () => {
      files = pages([item(1), item(2), item(3)], { itemsExpected: 5 });
      wants = [want(42)];
      const service = createService();

      const meta = await service.getSnapshotMeta();
      const [row] = await service.getWishlistRows();

      expect(meta.collectionCache.status).toBe('partial');
      expect(meta.collectionCache.itemsExpected).toBe(5);
      expect(meta.collectionCache.itemsRead).toBe(3);
      expect(row.ownedMatch).toBe('unknown');
    });

    it('reports a missing cache and marks every want unknown', async () => {
      wants = [want(42)];
      localWants = [localWant('lw')];
      const service = createService();

      const meta = await service.getSnapshotMeta();
      const rows = await service.getWishlistRows();

      expect(await service.getCollectionRows()).toEqual([]);
      expect(meta.collectionCache.status).toBe('missing');
      expect(meta.collectionCachedAt).toBeNull();
      expect(rows.map(r => [r.ownedMatch, r.ownedMatchConfidence])).toEqual([
        ['unknown', null],
        ['unknown', null],
      ]);
    });

    it('treats an unreadable cache as missing', async () => {
      jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      fileStorage.readJSON.mockRejectedValue(new Error('EACCES'));

      const meta = await createService().getSnapshotMeta();

      expect(meta.collectionCache.status).toBe('missing');
    });
  });

  describe('getSnapshotMeta', () => {
    it('reports freshness in ISO UTC at second precision', async () => {
      files = {
        ...pages([item(1)]),
        'wishlist/wishlist-items.json': {
          schemaVersion: 1,
          lastUpdated: Date.parse('2026-10-18T08:00:00.900Z'),
          items: [],
        },
      };
      historyIndex = {
        lastSyncTimestamp: Date.parse('2026-10-19T07:30:15.123Z'),
        totalScrobbles: 0,
        oldestScrobbleDate: 0,
        albums: {},
      };

      const meta = await createService().getSnapshotMeta();

      expect(meta).toEqual({
        schemaVersion: 1,
        generatedAt: '2026-10-20T12:00:00Z',
        collectionCachedAt: '2026-10-01T10:00:00Z',
        collectionCache: {
          status: 'complete',
          pagesExpected: 1,
          pagesRead: 1,
          itemsExpected: 1,
          itemsRead: 1,
          oldestPageAt: '2026-10-01T10:00:00Z',
          newestPageAt: '2026-10-01T10:00:00Z',
        },
        wishlistUpdatedAt: '2026-10-18T08:00:00Z',
        historySyncedAt: '2026-10-19T07:30:15Z',
        discogsUsername: USERNAME,
      });
    });

    it('uses null when the wishlist and history were never synced', async () => {
      const meta = await createService().getSnapshotMeta();

      expect(meta.wishlistUpdatedAt).toBeNull();
      expect(meta.historySyncedAt).toBeNull();
    });
  });

  it('shares one collection read between overlapping calls', async () => {
    files = pages([item(1)]);
    wants = [want(1)];
    const service = createService();

    const [collection, wishlist] = await Promise.all([
      service.getCollectionRows(),
      service.getWishlistRows(),
    ]);

    const pageReads = fileStorage.readJSON.mock.calls.filter(([path]) =>
      String(path).includes('-page-1.json')
    );
    expect(pageReads).toHaveLength(1);
    expect(collection).toHaveLength(1);
    expect(wishlist[0].ownedMatch).toBe('owned-same-release');
  });

  it('reads the collection again for a later call', async () => {
    files = pages([item(1)]);
    const service = createService();
    expect(await service.getCollectionRows()).toHaveLength(1);

    files = pages([item(1), item(2)]);

    expect(await service.getCollectionRows()).toHaveLength(2);
  });

  it('treats missing settings as no username', async () => {
    settings = null as unknown as UserSettings;
    files = pages([item(1)]);

    const meta = await createService().getSnapshotMeta();

    expect(meta.discogsUsername).toBeNull();
    expect(meta.collectionCache.status).toBe('missing');
  });

  it('never includes secrets in rows or meta', async () => {
    // Arrange
    files = pages([item(1), item(2)]);
    wants = [want(1)];
    localWants = [localWant('lw')];
    const service = createService();

    // Act
    const output = JSON.stringify([
      await service.getSnapshotMeta(),
      await service.getCollectionRows(),
      await service.getWishlistRows(),
    ]);

    // Assert
    expect(output).toContain(USERNAME);
    for (const secret of [
      'DISCOGS_SECRET_TOKEN',
      'LASTFM_API_KEY_VALUE',
      'LASTFM_SESSION_KEY_VALUE',
      'OAUTH_TOKEN_SECRET_VALUE',
      'lastfm-user',
    ]) {
      expect(output).not.toContain(secret);
    }
  });

  it('makes no writes', async () => {
    const writes = { writeJSON: jest.fn(), delete: jest.fn() };
    Object.assign(fileStorage, writes);
    files = pages([item(1)]);
    wants = [want(1)];
    const service = createService();

    await service.getSnapshotMeta();
    await service.getCollectionRows();
    await service.getWishlistRows();

    expect(writes.writeJSON).not.toHaveBeenCalled();
    expect(writes.delete).not.toHaveBeenCalled();
  });
});
