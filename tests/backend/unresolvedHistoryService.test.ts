import {
  UNRESOLVED_HISTORY_FILE,
  UnresolvedHistoryService,
} from '../../src/backend/services/unresolvedHistoryService';
import { FileStorage } from '../../src/backend/utils/fileStorage';
import { ScrobbleHistoryIndex } from '../../src/shared/types';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const memoryStorage = () => {
  const files = new Map<string, unknown>();
  return {
    files,
    storage: {
      readJSON: jest.fn(async (path: string) =>
        files.has(path) ? clone(files.get(path)) : null
      ),
      writeJSONWithBackup: jest.fn(async (path: string, data: unknown) => {
        files.set(path, clone(data));
      }),
    } as unknown as FileStorage,
  };
};

const historyIndex = (): ScrobbleHistoryIndex => ({
  lastSyncTimestamp: 0,
  totalScrobbles: 5,
  oldestScrobbleDate: 0,
  albums: {
    'the cure|disintegration': {
      lastPlayed: 1,
      playCount: 1,
      plays: [{ timestamp: 1, track: 'Lullaby' }],
    },
  },
  unresolved: {
    'the cure': {
      lastPlayed: 30,
      playCount: 3,
      plays: [
        { timestamp: 10, track: 'Lovesong' },
        { timestamp: 20, track: 'Lovesong' },
        { timestamp: 30, track: 'Friday I’m In Love' },
      ],
    },
    radiohead: {
      lastPlayed: 40,
      playCount: 1,
      plays: [{ timestamp: 40, track: 'Creep' }],
    },
  },
  lastfmTotal: 7,
  lastfmTotalCheckedAt: 99,
});

describe('UnresolvedHistoryService', () => {
  it('adds, replaces and removes resolution rules', async () => {
    const { storage, files } = memoryStorage();
    const service = new UnresolvedHistoryService(storage);

    const [first] = await service.addResolutions([
      { artist: 'The Cure', track: 'Lovesong', album: 'Disintegration' },
    ]);
    const [second] = await service.addResolutions([
      { artist: 'the cure ', track: 'LOVESONG', album: 'Galore' },
    ]);

    let rules = await service.getRules();
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      artist: 'the cure',
      track: 'lovesong',
      album: 'Galore',
      source: 'user',
    });
    expect(await service.removeResolution(first.id)).toBe(false);
    expect(await service.removeResolution(second.id)).toBe(true);
    rules = await service.getRules();
    expect(rules).toEqual([]);
    expect(files.has(UNRESOLVED_HISTORY_FILE)).toBe(true);
  });

  it('serializes concurrent writes', async () => {
    const { storage } = memoryStorage();
    const service = new UnresolvedHistoryService(storage);

    await Promise.all([
      service.addResolutions([{ artist: 'a', track: 'x', album: 'X' }]),
      service.addResolutions([{ artist: 'a', track: 'y', album: 'Y' }]),
      service.setHidden(['a|z'], true),
    ]);

    const store = await service.getStore();
    expect(store.resolutions.map(r => r.track).sort()).toEqual(['x', 'y']);
    expect(store.hidden).toEqual(['a|z']);
  });

  it('lists unresolved tracks grouped by artist, with search, hiding and known albums', async () => {
    const { storage } = memoryStorage();
    const service = new UnresolvedHistoryService(storage);
    await service.setHidden(['radiohead|creep'], true);

    const page = await service.listGroups(historyIndex(), {
      displayName: artist => (artist === 'the cure' ? 'The Cure' : artist),
    });

    expect(page.total).toBe(1);
    expect(page.groups[0]).toMatchObject({
      artist: 'the cure',
      artistName: 'The Cure',
      playCount: 3,
      lastPlayed: 30,
      knownAlbums: ['disintegration'],
    });
    expect(page.groups[0].tracks[0]).toMatchObject({
      key: 'the cure|lovesong',
      track: 'Lovesong',
      playCount: 2,
      firstPlayed: 10,
      lastPlayed: 20,
      hidden: false,
    });

    const withHidden = await service.listGroups(historyIndex(), {
      includeHidden: true,
      search: 'creep',
    });
    expect(withHidden.groups.map(g => g.artist)).toEqual(['radiohead']);
    expect(withHidden.groups[0].tracks[0].hidden).toBe(true);
  });

  it('summarizes counts against the Last.fm total', async () => {
    const { storage } = memoryStorage();
    const service = new UnresolvedHistoryService(storage);
    await service.setHidden(['radiohead|creep'], true);
    const raw = historyIndex();
    const resolved = clone(raw);
    // Pretend a rule resolved the two Lovesong plays
    resolved.unresolved!['the cure'].plays = [
      { timestamp: 30, track: 'Friday I’m In Love' },
    ];

    const summary = await service.getSummary(raw, resolved);

    expect(summary).toEqual({
      indexedTotal: 5,
      unresolvedCount: 2,
      resolvedByRuleCount: 2,
      hiddenCount: 1,
      resolutionCount: 0,
      lastfmTotal: 7,
      lastfmTotalCheckedAt: 99,
      gap: 2,
      lastFullBackfillAt: null,
    });
  });

  it('suggests an album from Last.fm track info', async () => {
    const { storage } = memoryStorage();
    const lookup = {
      getTrackInfo: jest.fn().mockResolvedValue({ album: ' Disintegration ' }),
    };
    const service = new UnresolvedHistoryService(storage, lookup);

    await expect(service.lookupAlbum('The Cure', 'Lovesong')).resolves.toBe(
      'Disintegration'
    );
    lookup.getTrackInfo.mockResolvedValue(null);
    await expect(service.lookupAlbum('x', 'y')).resolves.toBeNull();
  });
});
