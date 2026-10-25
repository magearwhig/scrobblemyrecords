import { CrateAlbumTableBuilder } from '../../../src/backend/services/crateAlbumTable';
import {
  CrateError,
  CrateService,
  CRATES_FILE,
  subtractReleaseIds,
} from '../../../src/backend/services/crateService';
import {
  CrateAlbumTable,
  CrateTableAlbum,
  CrateTableCopy,
} from '../../../src/backend/services/crateTableTypes';
import { FileStorage } from '../../../src/backend/utils/fileStorage';
import {
  Crate,
  CrateOverride,
  CrateRule,
  CratesStore,
} from '../../../src/shared/types';

const NOW = new Date(2026, 9, 18, 12, 0);

function copy(
  releaseId: number,
  overrides: Partial<CrateTableCopy> = {}
): CrateTableCopy {
  const dateAdded = overrides.dateAdded ?? '2024-01-01T00:00:00Z';
  return {
    releaseId,
    artist: 'Artist',
    title: `Album ${releaseId}`,
    format: ['Vinyl'],
    dateAdded,
    dateAddedMs: Date.parse(dateAdded),
    copyCount: 1,
    inDiscardPile: false,
    resolvedArtist: 'Artist',
    ...overrides,
  };
}

function album(
  key: string,
  copies: CrateTableCopy[],
  scrobbleCount = 0
): CrateTableAlbum {
  return {
    albumKey: key,
    artist: copies[0].artist,
    album: copies[0].title,
    copies,
    firstAddedMs: Math.min(...copies.map(c => c.dateAddedMs)),
    latestAddedMs: Math.max(...copies.map(c => c.dateAddedMs)),
    listening: {
      scrobbleCount,
      lastPlayed: scrobbleCount > 0 ? NOW.getTime() / 1000 - 86400 : null,
      playTimestamps:
        scrobbleCount > 0
          ? Array(scrobbleCount).fill(NOW.getTime() / 1000 - 86400)
          : [],
      matchType: scrobbleCount > 0 ? 'exact' : 'none',
      matchedKeys: [],
    },
  };
}

function table(albums: CrateTableAlbum[], complete = true): CrateAlbumTable {
  return {
    albums,
    rankedAlbumCount: albums.filter(a => a.listening.scrobbleCount > 0).length,
    totalAlbums: albums.length,
    totalReleases: albums.reduce((n, a) => n + a.copies.length, 0),
    hasHistory: true,
    historyFrom: 1108339019,
    newestScrobbleAt: NOW.getTime(),
    lastSyncCompletedAt: NOW.getTime(),
    collection: { complete, pagesRead: 1, pagesExpected: complete ? 1 : 3 },
    fingerprint: 'fp',
    builtAt: NOW.getTime(),
  };
}

const vinylRule: CrateRule = {
  id: 'fmt',
  field: 'format',
  op: 'anyOf',
  values: ['Vinyl'],
};

describe('subtractReleaseIds', () => {
  const override = (
    id: string,
    action: CrateOverride['action'],
    releaseIds: number[]
  ): CrateOverride => ({
    id,
    action,
    releaseIds,
    snapshot: { artist: 'A', title: 'T' },
    createdAt: 1,
  });

  it('removes only the given IDs and drops overrides left empty', () => {
    const result = subtractReleaseIds(
      [override('a', 'include', [101, 102]), override('b', 'exclude', [103])],
      [101, 103]
    );
    expect(result).toEqual([override('a', 'include', [102])]);
  });
});

describe('CrateService', () => {
  let files: Map<string, unknown>;
  let fileStorage: jest.Mocked<
    Pick<FileStorage, 'readJSON' | 'writeJSONWithBackup'>
  >;
  let currentTable: CrateAlbumTable;
  let builder: {
    getTable: jest.Mock;
    getFacts: jest.Mock;
    getResolveArtist: jest.Mock;
    invalidate: jest.Mock;
  };
  let username: string | undefined;
  let markAdded: jest.Mock;
  let service: CrateService;

  beforeEach(() => {
    files = new Map();
    fileStorage = {
      readJSON: jest.fn(async (path: string) =>
        files.has(path) ? JSON.parse(JSON.stringify(files.get(path))) : null
      ) as never,
      writeJSONWithBackup: jest.fn(async (path: string, data: unknown) => {
        files.set(path, JSON.parse(JSON.stringify(data)));
      }) as never,
    };
    currentTable = table([
      album('a|one', [copy(101, { title: 'One' })], 10),
      album('a|two', [copy(102, { title: 'Two', format: ['CD'] })], 3),
      album('a|three', [
        copy(103, { title: 'Three' }),
        copy(104, { title: 'Three', format: ['CD'] }),
      ]),
    ]);
    builder = {
      getTable: jest.fn(async () => currentTable),
      getFacts: jest.fn(async () => new Map()),
      getResolveArtist: jest.fn(() => (name: string) => name),
      invalidate: jest.fn(),
    };
    username = 'tester';
    markAdded = jest.fn().mockResolvedValue(undefined);
    service = new CrateService(
      fileStorage as unknown as FileStorage,
      builder as unknown as CrateAlbumTableBuilder,
      {
        getUserSettings: async () => ({ discogs: { username } }),
      },
      () => NOW
    );
    service.setSuggestionHook({ markAdded });
  });

  const stored = () => files.get(CRATES_FILE) as CratesStore;

  describe('CRUD', () => {
    it('creates a crate with defaults and saves it with a backup', async () => {
      const crate = await service.createCrate({
        name: '  Vinyl only ',
        rules: [vinylRule],
      });

      expect(crate).toMatchObject({
        name: 'Vinyl only',
        rules: [vinylRule],
        overrides: [],
        sort: 'artist',
        pinnedToWhatToPlay: false,
        createdAt: NOW.getTime(),
        updatedAt: NOW.getTime(),
      });
      expect(crate.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(fileStorage.writeJSONWithBackup).toHaveBeenCalledWith(
        CRATES_FILE,
        { schemaVersion: 1, crates: [crate] }
      );
    });

    it('rejects duplicate names regardless of case', async () => {
      await service.createCrate({ name: 'Jazz', rules: [] });
      await expect(
        service.createCrate({ name: 'jazz', rules: [] })
      ).rejects.toMatchObject({ status: 409 });
    });

    it('rejects invalid input with 400 and the rule errors', async () => {
      await expect(
        service.createCrate({ name: '', rules: [] })
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        service.createCrate({ name: 'x'.repeat(81), rules: [] })
      ).rejects.toMatchObject({ status: 400 });
      const error = await service
        .createCrate({
          name: 'Bad',
          rules: [{ id: 'r', field: 'nope', op: 'x' } as unknown as CrateRule],
        })
        .catch(e => e);
      expect(error).toBeInstanceOf(CrateError);
      expect(error.status).toBe(400);
      expect(error.details.length).toBeGreaterThan(0);
      await expect(
        service.createCrate({
          name: 'Sorted',
          rules: [],
          sort: 'nope' as never,
        })
      ).rejects.toMatchObject({ status: 400 });
    });

    it('updates fields, keeps the name unique and 404s unknown crates', async () => {
      const a = await service.createCrate({ name: 'A', rules: [] });
      await service.createCrate({ name: 'B', rules: [] });

      const updated = await service.updateCrate(a.id, {
        name: 'A2',
        pinnedToWhatToPlay: true,
        sort: 'scrobblesDesc',
      });
      expect(updated).toMatchObject({
        name: 'A2',
        pinnedToWhatToPlay: true,
        sort: 'scrobblesDesc',
      });
      await expect(
        service.updateCrate(a.id, { name: 'b' })
      ).rejects.toMatchObject({ status: 409 });
      // Renaming to its own name in another case is fine
      await expect(
        service.updateCrate(a.id, { name: 'a2' })
      ).resolves.toMatchObject({ name: 'a2' });
      await expect(
        service.updateCrate('00000000-0000-0000-0000-000000000000', {})
      ).rejects.toMatchObject({ status: 404 });
    });

    it('deletes crates', async () => {
      const a = await service.createCrate({ name: 'A', rules: [] });
      await service.deleteCrate(a.id);
      expect(stored().crates).toEqual([]);
      await expect(service.deleteCrate(a.id)).rejects.toMatchObject({
        status: 404,
      });
    });

    it('tells the suggestion service when a crate comes from a suggestion', async () => {
      const crate = await service.createCrate({
        name: 'Suggested',
        rules: [],
        sourceSuggestionKey: 'artist:artist',
      });
      expect(markAdded).toHaveBeenCalledWith('artist:artist', crate.id);
    });

    it('keeps the crate when recording the suggestion fails', async () => {
      markAdded.mockRejectedValue(new Error('disk full'));
      const crate = await service.createCrate({
        name: 'Suggested',
        rules: [],
        sourceSuggestionKey: 'artist:artist',
      });
      expect(stored().crates.map(c => c.id)).toEqual([crate.id]);
    });

    it('ignores a store with an unknown schema version', async () => {
      files.set(CRATES_FILE, { schemaVersion: 99, crates: [{ id: 'x' }] });
      expect(await service.listCrates()).toEqual([]);
    });

    it('re-reads the file after reload()', async () => {
      await service.listCrates();
      files.set(CRATES_FILE, {
        schemaVersion: 1,
        crates: [{ id: 'restored', name: 'R' } as Crate],
      });
      expect(await service.listCrates()).toEqual([]);
      await service.reload();
      expect((await service.listCrates()).map(c => c.id)).toEqual(['restored']);
    });

    it('a slow first read cannot replace a crate saved meanwhile', async () => {
      let releaseRead!: () => void;
      fileStorage.readJSON.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            releaseRead = () => resolve(null as never);
          })
      );
      const slowList = service.listCrates();
      const create = service.createCrate({ name: 'Saved', rules: [] });
      releaseRead();
      await Promise.all([slowList, create]);
      await service.createCrate({ name: 'Second', rules: [] });
      expect(stored().crates.map(c => c.name)).toEqual(['Saved', 'Second']);
    });

    it('reload waits for a queued write, then reads the restored file', async () => {
      await service.createCrate({ name: 'Before', rules: [] });
      const write = service.createCrate({ name: 'Queued', rules: [] });
      const reload = service.reload();
      await write;
      // A restore replaces the file before the reload runs
      files.set(CRATES_FILE, {
        schemaVersion: 1,
        crates: [{ id: 'restored', name: 'Restored' } as Crate],
      });
      await reload;
      expect((await service.listCrates()).map(c => c.name)).toEqual([
        'Restored',
      ]);
    });
  });

  describe('overrides', () => {
    it('includes an album the rules reject, snapshotting its name', async () => {
      const crate = await service.createCrate({
        name: 'Vinyl',
        rules: [vinylRule],
      });
      const updated = await service.setOverride(crate.id, [102], 'include');

      expect(updated.overrides).toEqual([
        expect.objectContaining({
          action: 'include',
          releaseIds: [102],
          snapshot: { artist: 'Artist', title: 'Two' },
        }),
      ]);
      const { evaluation } = await service.evaluate(crate.id);
      expect(evaluation.albums.find(a => a.album === 'Two')?.membership).toBe(
        'included'
      );
    });

    it('switching include to exclude replaces the earlier choice', async () => {
      const crate = await service.createCrate({ name: 'C', rules: [] });
      await service.setOverride(crate.id, [103, 104], 'include');
      const updated = await service.setOverride(
        crate.id,
        [103, 104],
        'exclude'
      );
      expect(updated.overrides.map(o => o.action)).toEqual(['exclude']);
    });

    it('after a split, changing one half keeps the other half', async () => {
      const crate = await service.createCrate({ name: 'C', rules: [] });
      await service.setOverride(crate.id, [103, 104], 'include');
      // A mapping is removed: the two copies become separate albums
      const [one, two, three] = currentTable.albums;
      currentTable = table([
        one,
        two,
        album('a|three', [three.copies[0]]),
        album('a|three alt', [three.copies[1]]),
      ]);
      const updated = await service.setOverride(crate.id, [103], 'exclude');
      expect(updated.overrides.map(o => [o.action, o.releaseIds])).toEqual([
        ['include', [104]],
        ['exclude', [103]],
      ]);
      const reset = await service.clearOverrides(crate.id, [104]);
      expect(reset.overrides.map(o => [o.action, o.releaseIds])).toEqual([
        ['exclude', [103]],
      ]);
    });

    it('an include on one copy replaces an exclude on another copy of the album', async () => {
      const crate = await service.createCrate({ name: 'C', rules: [] });
      await service.setOverride(crate.id, [104], 'exclude');
      const updated = await service.setOverride(crate.id, [103], 'include');
      expect(updated.overrides.map(o => [o.action, o.releaseIds])).toEqual([
        ['include', [103, 104]],
      ]);
      const { evaluation } = await service.evaluate(crate.id);
      expect(evaluation.albums.find(a => a.album === 'Three')?.membership).toBe(
        'included'
      );
    });

    it('reset on one copy clears the whole album', async () => {
      const crate = await service.createCrate({ name: 'C', rules: [] });
      await service.setOverride(crate.id, [103, 104], 'exclude');
      const reset = await service.clearOverrides(crate.id, [104]);
      expect(reset.overrides).toEqual([]);
    });

    it('rejects releases that are not owned and bad input', async () => {
      const crate = await service.createCrate({ name: 'C', rules: [] });
      await expect(
        service.setOverride(crate.id, [999], 'include')
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        service.setOverride(crate.id, [], 'include')
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        service.setOverride(crate.id, [101], 'maybe')
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        service.setOverride(crate.id, [1.5], 'include')
      ).rejects.toMatchObject({ status: 400 });
    });

    it('removes stale overrides only when the collection is fully loaded', async () => {
      const crate = await service.createCrate({ name: 'C', rules: [] });
      await service.setOverride(crate.id, [101], 'include');
      // The record leaves the collection
      currentTable = table(currentTable.albums.slice(1), false);
      await expect(
        service.removeStaleOverrides(crate.id)
      ).rejects.toMatchObject({ status: 409 });
      expect(stored().crates[0].overrides).toHaveLength(1);

      currentTable = table(currentTable.albums, true);
      const updated = await service.removeStaleOverrides(crate.id);
      expect(updated.overrides).toEqual([]);
    });
  });

  describe('evaluation', () => {
    it('answers 401 without a Discogs user', async () => {
      username = undefined;
      const crate = await service.createCrate({ name: 'C', rules: [] });
      await expect(service.evaluate(crate.id)).rejects.toMatchObject({
        status: 401,
      });
    });

    it('summarises every crate from one table, with counts and covers', async () => {
      currentTable.albums[0].coverUrl = 'one.jpg';
      await service.createCrate({ name: 'Vinyl', rules: [vinylRule] });
      await service.createCrate({ name: 'Empty', rules: [] });

      const summaries = await service.summaries();
      expect(summaries.map(s => [s.name, s.count])).toEqual([
        ['Vinyl', 2],
        ['Empty', 0],
      ]);
      expect(summaries[0].sampleCovers).toEqual(['one.jpg']);
      expect(builder.getTable).toHaveBeenCalledTimes(1);
      // No genre/style/runtime rule, so no release details are read
      expect(builder.getFacts).not.toHaveBeenCalled();
    });

    it('loads release facts only when a rule needs them', async () => {
      await service.preview({
        rules: [{ id: 'g', field: 'genre', op: 'anyOf', values: ['Jazz'] }],
      });
      expect(builder.getFacts).toHaveBeenCalledWith([101, 102, 103, 104]);
    });

    it('previews unsaved rules', async () => {
      const evaluation = await service.preview({
        rules: [vinylRule],
        sort: 'scrobblesDesc',
      });
      expect(evaluation.crateId).toBeNull();
      expect(evaluation.albums.map(a => a.album)).toEqual(['One', 'Three']);
    });

    it('finds the crates containing a release', async () => {
      const vinyl = await service.createCrate({
        name: 'Vinyl',
        rules: [vinylRule],
      });
      await service.createCrate({ name: 'Empty', rules: [] });
      expect(await service.cratesForRelease(104)).toEqual([
        { id: vinyl.id, name: 'Vinyl' },
      ]);
      expect(await service.cratesForRelease(102)).toEqual([]);
    });

    it('lists runtimes only for releases with every track length', async () => {
      const runtime = (knownSeconds: number, complete: boolean) => ({
        runtime: {
          knownSeconds,
          complete,
          trackCount: 2,
          tracksWithDuration: complete ? 2 : 1,
        },
      });
      builder.getFacts.mockResolvedValueOnce(
        new Map<number, { runtime?: ReturnType<typeof runtime>['runtime'] }>([
          [101, runtime(2400, true)],
          [102, runtime(600, false)],
          [103, {}],
        ])
      );
      expect(await service.releaseRuntimes()).toEqual({ 101: 2400 });
      expect(builder.getFacts).toHaveBeenCalledWith([101, 102, 103, 104]);
    });

    it('invalidate() forgets the album table', () => {
      service.invalidate();
      expect(builder.invalidate).toHaveBeenCalled();
    });
  });
});
