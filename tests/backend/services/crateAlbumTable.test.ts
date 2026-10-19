import {
  buildAlbumTable,
  CrateAlbumTableBuilder,
  readCollectionSnapshot,
  releaseFactsFrom,
} from '../../../src/backend/services/crateAlbumTable';
import { evaluateCrate } from '../../../src/backend/services/crateEvaluator';
import { DiscogsService } from '../../../src/backend/services/discogsService';
import * as mergedAlbumHistory from '../../../src/backend/services/mergedAlbumHistory';
import { ScrobbleHistoryStorage } from '../../../src/backend/services/scrobbleHistoryStorage';
import { FileStorage } from '../../../src/backend/utils/fileStorage';
import {
  AlbumMapping,
  CollectionItem,
  ScrobbleHistoryIndex,
} from '../../../src/shared/types';

const USER = 'tester';
const INDEX_PATH = 'history/scrobble-history-index.json';

/**
 * In-memory FileStorage: never touches the real data/ directory. Records
 * every read and can delay release-details reads to observe concurrency.
 */
class MemoryFileStorage {
  files = new Map<string, { data: unknown; mtime: number }>();
  reads: string[] = [];
  clock = 1_000;
  releaseReadDelayMs = 0;
  inFlight = 0;
  maxInFlight = 0;
  afterRead: ((path: string) => void) | null = null;

  put(path: string, data: unknown): void {
    this.files.set(path, { data, mtime: ++this.clock });
  }

  touch(path: string): void {
    const file = this.files.get(path);
    if (file) file.mtime = ++this.clock;
  }

  remove(path: string): void {
    this.files.delete(path);
  }

  async readJSON<T>(path: string): Promise<T | null> {
    this.reads.push(path);
    const isRelease = path.startsWith('collections/release-');
    if (isRelease) {
      this.inFlight++;
      this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
      await new Promise(resolve =>
        setTimeout(resolve, this.releaseReadDelayMs)
      );
      this.inFlight--;
    }
    const file = this.files.get(path);
    const value = file ? (JSON.parse(JSON.stringify(file.data)) as T) : null;
    this.afterRead?.(path);
    return value;
  }

  async listFiles(directory: string): Promise<string[]> {
    const prefix = `${directory}/`;
    return [...this.files.keys()]
      .filter(
        p => p.startsWith(prefix) && !p.slice(prefix.length).includes('/')
      )
      .map(p => p.slice(prefix.length));
  }

  async getStats(
    path: string
  ): Promise<{ exists: boolean; mtime?: Date; size?: number }> {
    const file = this.files.get(path);
    return file
      ? { exists: true, mtime: new Date(file.mtime) }
      : { exists: false };
  }
}

function item(
  id: number,
  artist: string,
  title: string,
  extra: {
    year?: number;
    format?: string[];
    added?: string;
    rating?: number;
    masterId?: number;
    instanceId?: number;
  } = {}
): CollectionItem {
  return {
    id: extra.instanceId ?? id,
    date_added: extra.added ?? '2020-01-01T00:00:00Z',
    rating: extra.rating ?? 0,
    release: {
      id,
      master_id: extra.masterId,
      title,
      artist,
      year: extra.year ?? 2000,
      format: extra.format ?? ['Vinyl'],
      label: [],
      cover_image: `https://img/${id}.jpg`,
      resource_url: '',
    },
  };
}

function writePages(
  fs: MemoryFileStorage,
  items: CollectionItem[],
  options: { perPage?: number; legacy?: boolean } = {}
): void {
  const perPage = options.perPage ?? 50;
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  for (let page = 1; page <= pages; page++) {
    const data = items.slice((page - 1) * perPage, page * perPage);
    fs.put(`collections/${USER}-page-${page}.json`, {
      success: true,
      data,
      ...(options.legacy
        ? {}
        : {
            pagination: { page, pages, per_page: perPage, items: items.length },
          }),
      timestamp: 1,
    });
  }
}

const play = (timestamp: number) => ({ timestamp, track: 't' });

function historyIndex(
  albums: Record<string, number[]>,
  extra: Partial<ScrobbleHistoryIndex> = {}
): ScrobbleHistoryIndex {
  const entries: ScrobbleHistoryIndex['albums'] = {};
  for (const [key, timestamps] of Object.entries(albums)) {
    entries[key] = {
      playCount: timestamps.length,
      lastPlayed: Math.max(...timestamps),
      // Newest first, as the sync stores them
      plays: [...timestamps].sort((a, b) => b - a).map(play),
    };
  }
  return {
    lastSyncTimestamp: 1_790_000_000_000, // ms
    totalScrobbles: 0,
    oldestScrobbleDate: 1_107_000_000, // seconds (Feb 2005)
    albums: entries,
    lastSyncCompletedAt: 1_790_000_100_000,
    ...extra,
  };
}

function setup(
  options: {
    items?: CollectionItem[];
    index?: ScrobbleHistoryIndex | null;
    mappings?: AlbumMapping[];
    discard?: number[];
    progress?: unknown;
  } = {}
) {
  const fs = new MemoryFileStorage();
  writePages(fs, options.items ?? [item(1, 'Artist', 'Album')]);
  if (options.index !== null) {
    fs.put(INDEX_PATH, options.index ?? historyIndex({}));
  }
  if (options.progress)
    fs.put(`collections/${USER}-progress.json`, options.progress);
  fs.put('mappings/album-mappings.json', { mappings: options.mappings ?? [] });
  fs.put('collections/discard-pile.json', { items: [] });

  const fileStorage = fs as unknown as FileStorage;
  const history = new ScrobbleHistoryStorage(fileStorage);
  const mappingService = {
    getAllAlbumMappings: jest.fn(async () => options.mappings ?? []),
  };
  const discardService = {
    getDiscardPileCollectionIds: jest.fn(
      async () => new Set(options.discard ?? [])
    ),
  };
  const builder = new CrateAlbumTableBuilder(
    fileStorage,
    history,
    mappingService,
    discardService,
    { snapshotRetryDelayMs: 0 }
  );
  return { fs, history, mappingService, discardService, builder };
}

const mapping = (overrides: Partial<AlbumMapping>): AlbumMapping => ({
  historyArtist: 'artist',
  historyAlbum: 'album (deluxe)',
  collectionId: 1,
  collectionArtist: 'Artist',
  collectionAlbum: 'Album',
  createdAt: 0,
  ...overrides,
});

describe('crateAlbumTable', () => {
  let lookupSpy: jest.SpyInstance;

  beforeEach(() => {
    lookupSpy = jest.spyOn(mergedAlbumHistory, 'lookupMergedHistory');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('grouping and dedupe', () => {
    it('collapses duplicate release IDs with copyCount', async () => {
      const { builder } = setup({
        items: [
          item(1, 'Artist', 'Album', {
            added: '2021-05-01T00:00:00Z',
            instanceId: 501,
          }),
          item(1, 'Artist', 'Album', {
            added: '2020-03-01T00:00:00Z',
            rating: 4,
            instanceId: 502,
          }),
        ],
        discard: [502],
      });
      const table = await builder.getTable(USER);
      expect(table.totalReleases).toBe(1);
      expect(table.totalAlbums).toBe(1);
      expect(table.albums[0].copies[0]).toMatchObject({
        releaseId: 1,
        copyCount: 2,
        dateAdded: '2020-03-01T00:00:00Z',
        rating: 4,
        inDiscardPile: true,
      });
    });

    it('groups same-title pressings, display copy is the earliest added', async () => {
      const { builder } = setup({
        items: [
          item(20, 'The Wedding Present', 'Seamonsters', {
            year: 2021,
            added: '2022-01-01T00:00:00Z',
          }),
          item(10, 'The Wedding Present', 'Seamonsters', {
            year: 2012,
            added: '2015-01-01T00:00:00Z',
          }),
        ],
      });
      const table = await builder.getTable(USER);
      expect(table.totalAlbums).toBe(1);
      const album = table.albums[0];
      expect(album.copies.map(c => c.releaseId)).toEqual([10, 20]);
      expect(album.coverUrl).toBe('https://img/10.jpg');
      expect(album.firstAddedMs).toBe(Date.parse('2015-01-01T00:00:00Z'));
      expect(album.latestAddedMs).toBe(Date.parse('2022-01-01T00:00:00Z'));
    });

    it('does not group different titles that share a master', async () => {
      const { builder } = setup({
        items: [
          item(1, 'Muse', 'Origin Of Symmetry', { masterId: 77 }),
          item(2, 'Muse', 'Origin Of Symmetry (XX Anniversary RemiXX)', {
            masterId: 77,
          }),
        ],
      });
      expect((await builder.getTable(USER)).totalAlbums).toBe(2);
    });

    it('groups mapping-linked versions and counts their plays', async () => {
      const { builder } = setup({
        items: [
          item(1, 'Artist', 'Album'),
          item(2, 'Artist', 'Album (Deluxe)'),
        ],
        mappings: [mapping({})],
        index: historyIndex({
          'artist|album': [100, 200, 300],
          'artist|album (deluxe)': [400, 500],
        }),
      });
      const table = await builder.getTable(USER);
      expect(table.totalAlbums).toBe(1);
      expect(table.albums[0].listening).toMatchObject({
        scrobbleCount: 5,
        lastPlayed: 500,
        playTimestamps: [100, 200, 300, 400, 500],
        matchType: 'exact',
      });
      expect(table.albums[0].listening.matchedKeys.sort()).toEqual([
        'artist|album',
        'artist|album (deluxe)',
      ]);
    });

    it('counts plays once when two copies share a name', async () => {
      const { builder } = setup({
        items: [item(1, 'Artist', 'Album'), item(2, 'Artist', 'Album')],
        index: historyIndex({ 'artist|album': [100, 200, 300] }),
      });
      const table = await builder.getTable(USER);
      expect(table.albums[0].copies).toHaveLength(2);
      expect(table.albums[0].listening.scrobbleCount).toBe(3);
      expect(table.albums[0].listening.playTimestamps).toEqual([100, 200, 300]);
    });

    it('includes plays of an unlinked mapping into the collection name', async () => {
      const { builder } = setup({
        items: [item(1, 'The Beatles', 'The Beatles')],
        mappings: [
          mapping({
            historyArtist: 'the beatles',
            historyAlbum: 'white album',
            collectionId: 0,
            collectionArtist: 'The Beatles',
            collectionAlbum: 'The Beatles',
          }),
        ],
        index: historyIndex({ 'the beatles|white album': [10, 20] }),
      });
      const table = await builder.getTable(USER);
      expect(table.albums[0].listening.scrobbleCount).toBe(2);
      expect(table.albums[0].listening.matchedKeys).toEqual([
        'the beatles|white album',
      ]);
    });

    it('groups through the artist resolver once it is set', async () => {
      const { builder } = setup({
        items: [
          item(1, 'Afghan Whigs', 'Gentlemen'),
          item(2, 'The Afghan Whigs', 'Gentlemen'),
        ],
      });
      expect(builder.getResolveArtist()('Afghan Whigs')).toBe('Afghan Whigs');
      expect((await builder.getTable(USER)).totalAlbums).toBe(2);

      builder.setArtistNameResolver({
        resolveArtist: name =>
          name.toLowerCase().replace(/^afghan whigs$/, 'the afghan whigs'),
        getFingerprint: () => 'aliases-1',
      });
      expect(builder.getResolveArtist()('Afghan Whigs')).toBe(
        'the afghan whigs'
      );
      const table = await builder.getTable(USER);
      expect(table.totalAlbums).toBe(1);
      expect(table.albums[0].copies[0].resolvedArtist).toBe('the afghan whigs');
    });
  });

  describe('listening', () => {
    it('ranks with ties sharing a rank and no rank for zero scrobbles', async () => {
      const { builder } = setup({
        items: [
          item(1, 'A', 'One'),
          item(2, 'B', 'Two'),
          item(3, 'C', 'Three'),
          item(4, 'D', 'Four'),
        ],
        index: historyIndex({
          'a|one': [1, 2, 3],
          'b|two': [1, 2],
          'c|three': [4, 5],
        }),
      });
      const table = await builder.getTable(USER);
      const rank = (artist: string) =>
        table.albums.find(a => a.artist === artist)?.scrobbleRank;
      expect([rank('A'), rank('B'), rank('C'), rank('D')]).toEqual([
        1,
        2,
        2,
        undefined,
      ]);
      expect(table.rankedAlbumCount).toBe(3);
      expect(table.totalAlbums).toBe(4);
    });

    it('carries history coverage in the right units', async () => {
      const { builder } = setup({
        index: historyIndex({ 'artist|album': [1_700_000_000] }),
      });
      const table = await builder.getTable(USER);
      expect(table.hasHistory).toBe(true);
      expect(table.historyFrom).toBe(1_107_000_000); // seconds
      expect(table.newestScrobbleAt).toBe(1_790_000_000_000); // ms
      expect(table.lastSyncCompletedAt).toBe(1_790_000_100_000); // ms
      expect(table.albums[0].listening.lastPlayed).toBe(1_700_000_000);
    });

    it('without a history index: hasHistory false, listening zeros, no lookup', async () => {
      const { builder } = setup({ index: null });
      const table = await builder.getTable(USER);
      expect(table.hasHistory).toBe(false);
      expect(table.historyFrom).toBeNull();
      expect(table.newestScrobbleAt).toBeNull();
      expect(table.lastSyncCompletedAt).toBeNull();
      expect(table.albums[0].listening).toEqual({
        scrobbleCount: 0,
        lastPlayed: null,
        playTimestamps: [],
        matchType: 'none',
        matchedKeys: [],
      });
      expect(table.albums[0].scrobbleRank).toBeUndefined();
      expect(lookupSpy).not.toHaveBeenCalled();
    });

    it('makes one lookupMergedHistory and one batchLookup call per build', async () => {
      const { builder, history } = setup({
        items: [
          item(1, 'A', 'One'),
          item(2, 'B', 'Two'),
          item(3, 'C', 'Three'),
        ],
        index: historyIndex({ 'a|one': [1] }),
      });
      const batchSpy = jest.spyOn(history, 'batchLookup');
      await builder.getTable(USER);
      expect(lookupSpy).toHaveBeenCalledTimes(1);
      expect(batchSpy).toHaveBeenCalledTimes(1);
      // Full plays, not counts only
      expect(lookupSpy.mock.calls[0][2]).toBeUndefined();
    });

    it('three concurrent getTable calls share one build', async () => {
      const { builder, mappingService } = setup({
        index: historyIndex({ 'artist|album': [1] }),
      });
      const tables = await Promise.all([
        builder.getTable(USER),
        builder.getTable(USER),
        builder.getTable(USER),
      ]);
      expect(tables[1]).toBe(tables[0]);
      expect(tables[2]).toBe(tables[0]);
      expect(lookupSpy).toHaveBeenCalledTimes(1);
      expect(mappingService.getAllAlbumMappings).toHaveBeenCalledTimes(1);
    });

    it('a failed build is not memoised and the next call retries', async () => {
      const { builder, mappingService } = setup();
      mappingService.getAllAlbumMappings.mockRejectedValueOnce(
        new Error('boom')
      );
      await expect(builder.getTable(USER)).rejects.toThrow('boom');
      await expect(builder.getTable(USER)).resolves.toMatchObject({
        totalAlbums: 1,
      });
    });
  });

  describe('fingerprint and memoisation', () => {
    it('reuses the table while nothing changes', async () => {
      const { builder } = setup();
      const first = await builder.getTable(USER);
      const second = await builder.getTable(USER);
      expect(second).toBe(first);
      expect(lookupSpy).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['a collection page', 'collections/tester-page-1.json'],
      ['the progress file', 'collections/tester-progress.json'],
      ['the history index', INDEX_PATH],
      ['the album mappings', 'mappings/album-mappings.json'],
      ['the discard pile', 'collections/discard-pile.json'],
    ])('rebuilds when %s changes', async (_label, path) => {
      const { fs, builder, history } = setup({
        progress: { username: USER, status: 'completed' },
      });
      const before = await builder.fingerprint(USER);
      const first = await builder.getTable(USER);
      fs.touch(path);
      // The history storage invalidates its own cache after a sync
      if (path === INDEX_PATH) history.invalidateCache();
      expect(await builder.fingerprint(USER)).not.toBe(before);
      expect(await builder.getTable(USER)).not.toBe(first);
    });

    it('changes when a page file is added or the alias graph changes', async () => {
      const { fs, builder } = setup();
      const base = await builder.fingerprint(USER);
      expect(await builder.fingerprint(USER)).toBe(base);

      fs.put(`collections/${USER}-page-2.json`, { data: [] });
      const withPage = await builder.fingerprint(USER);
      expect(withPage).not.toBe(base);

      builder.setArtistNameResolver({
        resolveArtist: n => n,
        getFingerprint: () => 'graph-2',
      });
      expect(await builder.fingerprint(USER)).not.toBe(withPage);
    });

    it('changes when lastSyncTimestamp changes', async () => {
      const { fs, builder, history } = setup();
      const base = await builder.fingerprint(USER);
      const file = fs.files.get(INDEX_PATH)!;
      (file.data as ScrobbleHistoryIndex).lastSyncTimestamp += 1;
      history.invalidateCache();
      expect(await builder.fingerprint(USER)).not.toBe(base);
    });

    it('ignores files of other users and unrelated files', async () => {
      const { fs, builder } = setup();
      const base = await builder.fingerprint(USER);
      fs.put('collections/someone-page-1.json', { data: [] });
      fs.put('collections/release-5.json', { genres: [] });
      fs.put('collections/crates.json', { crates: [] });
      expect(await builder.fingerprint(USER)).toBe(base);
    });

    it('invalidate() forces a rebuild', async () => {
      const { builder } = setup();
      const first = await builder.getTable(USER);
      builder.invalidate();
      expect(await builder.getTable(USER)).not.toBe(first);
      expect(lookupSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('snapshot completeness', () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      item(i + 1, `Artist ${i}`, `Album ${i}`)
    );
    const snapshot = (fs: MemoryFileStorage) =>
      readCollectionSnapshot(fs as unknown as FileStorage, USER);

    it('is complete when all pages are consistent', async () => {
      const fs = new MemoryFileStorage();
      writePages(fs, items, { perPage: 2 });
      fs.put(`collections/${USER}-progress.json`, { status: 'completed' });
      const result = await snapshot(fs);
      expect(result.items).toHaveLength(5);
      expect(result.collection).toEqual({
        complete: true,
        pagesRead: 3,
        pagesExpected: 3,
      });
    });

    it('is complete without a progress file', async () => {
      const fs = new MemoryFileStorage();
      writePages(fs, items, { perPage: 2 });
      expect((await snapshot(fs)).collection.complete).toBe(true);
    });

    it('is incomplete while the progress file says loading', async () => {
      const fs = new MemoryFileStorage();
      writePages(fs, items, { perPage: 2 });
      fs.put(`collections/${USER}-progress.json`, { status: 'loading' });
      const result = await snapshot(fs);
      expect(result.collection.complete).toBe(false);
      expect(result.loading).toBe(true);
    });

    it('is incomplete with a missing middle page, but keeps the items present', async () => {
      const fs = new MemoryFileStorage();
      writePages(fs, items, { perPage: 2 });
      fs.remove(`collections/${USER}-page-2.json`);
      const result = await snapshot(fs);
      expect(result.collection).toEqual({
        complete: false,
        pagesRead: 2,
        pagesExpected: 3,
      });
      expect(result.items).toHaveLength(3);
      expect(result.mixed).toBe(true);
    });

    it('is incomplete when pages disagree on pagination', async () => {
      const fs = new MemoryFileStorage();
      writePages(fs, items, { perPage: 2 });
      fs.put(`collections/${USER}-page-3.json`, {
        data: [items[4]],
        pagination: { page: 3, pages: 4, items: 7 },
      });
      const result = await snapshot(fs);
      expect(result.collection.complete).toBe(false);
      expect(result.collection.pagesExpected).toBe(null);
    });

    it("is incomplete when item counts don't add up", async () => {
      const fs = new MemoryFileStorage();
      writePages(fs, items, { perPage: 2 });
      fs.put(`collections/${USER}-page-3.json`, {
        data: [],
        pagination: { page: 3, pages: 3, items: 5 },
      });
      expect((await snapshot(fs)).collection.complete).toBe(false);
    });

    it('legacy pages without pagination are complete only after a completed preload', async () => {
      const fs = new MemoryFileStorage();
      writePages(fs, items, { perPage: 2, legacy: true });
      expect((await snapshot(fs)).collection.complete).toBe(false);
      fs.put(`collections/${USER}-progress.json`, { status: 'completed' });
      expect((await snapshot(fs)).collection).toEqual({
        complete: true,
        pagesRead: 3,
        pagesExpected: null,
      });
    });

    it('retries a mixed set of pages once', async () => {
      const { fs, builder } = setup({ items });
      // Page 1 of a rewrite in progress claims 2 more items than exist
      fs.put(`collections/${USER}-page-1.json`, {
        data: items,
        pagination: { page: 1, pages: 1, items: 7 },
      });
      let pageReads = 0;
      fs.afterRead = path => {
        if (path !== `collections/${USER}-page-1.json`) return;
        pageReads++;
        if (pageReads === 1) {
          // The writer finishes before the retry
          writePages(fs, items);
        }
      };
      const table = await builder.getTable(USER);
      expect(pageReads).toBe(2);
      expect(table.collection.complete).toBe(true);
    });

    it('gives up after one retry and marks the table incomplete', async () => {
      const { fs, builder } = setup({ items });
      fs.put(`collections/${USER}-page-1.json`, {
        data: items,
        pagination: { page: 1, pages: 1, items: 7 },
      });
      const table = await builder.getTable(USER);
      expect(
        fs.reads.filter(p => p === `collections/${USER}-page-1.json`)
      ).toHaveLength(2);
      expect(table.collection.complete).toBe(false);
      expect(table.totalReleases).toBe(5);
    });

    it('stale overrides: reported on a complete snapshot, not on an incomplete one', async () => {
      const staleOverride = {
        id: 'o',
        action: 'include' as const,
        releaseIds: [999],
        snapshot: { artist: 'Gone', title: 'Gone' },
        createdAt: 1,
      };
      const evaluate = async (builder: CrateAlbumTableBuilder) =>
        evaluateCrate(
          { id: 'c', rules: [], overrides: [staleOverride], sort: 'artist' },
          {
            table: await builder.getTable(USER),
            facts: new Map(),
            resolveArtist: builder.getResolveArtist(),
            now: new Date(),
          }
        );

      const complete = setup({ items });
      expect((await evaluate(complete.builder)).staleOverrides).toEqual([
        staleOverride,
      ]);

      const loading = setup({ items, progress: { status: 'loading' } });
      const evaluation = await evaluate(loading.builder);
      expect(evaluation.staleOverrides).toEqual([]);
      expect(evaluation.coverage.collection.complete).toBe(false);
    });
  });

  describe('release facts', () => {
    const release = (id: number, extra: Record<string, unknown> = {}) => ({
      id,
      title: 'T',
      artist: 'A',
      format: [],
      label: [],
      resource_url: '',
      genres: ['Jazz'],
      styles: ['Modal'],
      tracklist: [
        { position: '', title: 'Side A' },
        { position: 'A1', title: 'x', duration: '20:00' },
        { position: 'B1', title: 'y', duration: '18:12' },
      ],
      ...extra,
    });

    it('reads release-details files with readJSON only, never the Discogs API', async () => {
      const discogsSpy = jest.spyOn(
        DiscogsService.prototype,
        'getReleaseDetails'
      );
      const { fs, builder } = setup();
      fs.put('collections/release-1.json', release(1));
      fs.put('collections/release-2.json', release(2, { genres: undefined }));
      fs.reads = [];

      const facts = await builder.getFacts([1, 2, 3, 1]);
      expect(facts.get(1)).toEqual({
        genres: ['Jazz'],
        styles: ['Modal'],
        runtime: {
          knownSeconds: 38 * 60 + 12,
          trackCount: 2,
          tracksWithDuration: 2,
          complete: true,
        },
      });
      // Basic data without genres: genre and style unknown
      expect(facts.get(2)?.genres).toBeUndefined();
      expect(facts.get(2)?.styles).toBeUndefined();
      // No details file: everything unknown
      expect(facts.get(3)).toEqual({});
      expect([...fs.reads].sort()).toEqual([
        'collections/release-1.json',
        'collections/release-2.json',
        'collections/release-3.json',
      ]);
      expect(discogsSpy).not.toHaveBeenCalled();
    });

    it('memoises facts for 10 minutes', async () => {
      const { fs, builder } = setup();
      fs.put('collections/release-1.json', release(1));
      const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
      await builder.getFacts([1]);
      fs.reads = [];

      now.mockReturnValue(1_000_000 + 9 * 60 * 1000);
      await builder.getFacts([1]);
      expect(fs.reads).toEqual([]);

      now.mockReturnValue(1_000_000 + 11 * 60 * 1000);
      await builder.getFacts([1]);
      expect(fs.reads).toEqual(['collections/release-1.json']);
    });

    it('reads at most 16 files at once and shares in-flight reads', async () => {
      const { fs, builder } = setup();
      fs.releaseReadDelayMs = 5;
      const ids = Array.from({ length: 40 }, (_, i) => i + 1);
      ids.forEach(id => fs.put(`collections/release-${id}.json`, release(id)));
      fs.reads = [];

      const [a, b] = await Promise.all([
        builder.getFacts(ids),
        builder.getFacts(ids.slice(0, 20)),
      ]);
      expect(a.size).toBe(40);
      expect(b.size).toBe(20);
      expect(fs.maxInFlight).toBe(16);
      expect(fs.reads).toHaveLength(40);
    });

    it('releaseFactsFrom handles a missing file', () => {
      expect(releaseFactsFrom(null)).toEqual({});
    });
  });

  it('buildAlbumTable is usable directly with injected inputs', async () => {
    const fs = new MemoryFileStorage();
    fs.put(INDEX_PATH, historyIndex({ 'artist|album': [5] }));
    const history = new ScrobbleHistoryStorage(fs as unknown as FileStorage);
    const table = await buildAlbumTable(
      {
        items: [item(1, 'Artist', 'Album')],
        mappings: [],
        resolveArtist: n => n,
        discardIds: new Set([1]),
        collection: { complete: true, pagesRead: 1, pagesExpected: 1 },
        fingerprint: 'fp',
        now: 42,
      },
      history
    );
    expect(table).toMatchObject({
      totalAlbums: 1,
      fingerprint: 'fp',
      builtAt: 42,
      rankedAlbumCount: 1,
    });
    expect(table.albums[0].copies[0].inDiscardPile).toBe(true);
    expect(table.albums[0].scrobbleRank).toBe(1);
  });

  describe('regressions', () => {
    it('picks up a rewritten history index even when the history cache was not cleared', async () => {
      const { fs, builder } = setup({
        index: historyIndex({ 'artist|album': [100] }),
      });
      expect(
        (await builder.getTable(USER)).albums[0].listening.scrobbleCount
      ).toBe(1);

      // e.g. merge-split-entries: same lastSyncTimestamp, new contents
      fs.put(INDEX_PATH, historyIndex({ 'artist|album': [100, 200, 300] }));
      expect(
        (await builder.getTable(USER)).albums[0].listening.scrobbleCount
      ).toBe(3);
    });

    it('keeps the latest date added across duplicate entries of a release', async () => {
      const { builder } = setup({
        items: [
          item(1, 'Artist', 'Album', {
            added: '2020-01-01T00:00:00Z',
            instanceId: 11,
          }),
          item(1, 'Artist', 'Album', {
            added: '2026-10-01T00:00:00Z',
            instanceId: 12,
          }),
        ],
      });
      const album = (await builder.getTable(USER)).albums[0];
      expect(album.firstAddedMs).toBe(Date.parse('2020-01-01T00:00:00Z'));
      expect(album.latestAddedMs).toBe(Date.parse('2026-10-01T00:00:00Z'));
    });

    it('legacy pages missing trailing pages of a completed preload are incomplete', async () => {
      const fs = new MemoryFileStorage();
      writePages(fs, [item(1, 'A', 'B')], { legacy: true });
      fs.put(`collections/${USER}-progress.json`, {
        status: 'completed',
        totalPages: 3,
      });
      const result = await readCollectionSnapshot(
        fs as unknown as FileStorage,
        USER
      );
      expect(result.collection).toEqual({
        complete: false,
        pagesRead: 1,
        pagesExpected: 3,
      });
    });

    it('a facts read started before invalidate() is not memoised', async () => {
      const { fs, builder } = setup();
      fs.releaseReadDelayMs = 5;
      fs.put('collections/release-1.json', { genres: ['Rock'], styles: [] });
      const stale = builder.getFacts([1]);
      fs.put('collections/release-1.json', { genres: ['Jazz'], styles: [] });
      builder.invalidate();
      await stale;
      expect((await builder.getFacts([1])).get(1)?.genres).toEqual(['Jazz']);
    });
  });
});
