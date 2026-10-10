import {
  loadAlbumMappings,
  lookupMergedHistory,
} from '../../src/backend/services/mergedAlbumHistory';

type Result = {
  entry: {
    playCount: number;
    lastPlayed: number;
    plays: Array<{ timestamp: number }>;
  } | null;
  matchType: 'exact' | 'fuzzy' | 'none';
  matchedKeys?: string[];
};

const normalizeKey = (artist: string, album: string) =>
  `${artist.toLowerCase().trim()}|${album.toLowerCase().trim()}`;

const historyStorage = (
  results: Record<string, Result>,
  albums: Record<string, NonNullable<Result['entry']>> = {}
) => ({
  normalizeKey: jest.fn(normalizeKey),
  getIndex: jest.fn().mockResolvedValue({ albums }),
  batchLookup: jest.fn(
    async (keys: Array<{ artist: string; album: string }>) => {
      const map = new Map<string, Result>();
      for (const k of keys) {
        const key = normalizeKey(k.artist, k.album);
        map.set(key, results[key] ?? { entry: null, matchType: 'none' });
      }
      return map;
    }
  ),
});

const found = (
  matchType: 'exact' | 'fuzzy',
  playCount: number,
  lastPlayed: number,
  matchedKeys: string[]
): Result => ({
  entry: {
    playCount,
    lastPlayed,
    plays: Array.from({ length: playCount }, () => ({ timestamp: lastPlayed })),
  },
  matchType,
  matchedKeys,
});

describe('mergedAlbumHistory', () => {
  it('loadAlbumMappings tolerates a missing service or empty result', async () => {
    expect(await loadAlbumMappings(null)).toEqual([]);
    expect(
      await loadAlbumMappings({
        getAllAlbumMappings: jest.fn().mockResolvedValue(undefined),
      })
    ).toEqual([]);
  });

  it('combines every name of an album in one batch lookup', async () => {
    const storage = historyStorage({
      'a|album': found('fuzzy', 2, 100, ['a|album (deluxe)']),
      'a|album (live)': found('exact', 3, 200, ['a|album (live)']),
    });

    const [result] = await lookupMergedHistory(storage as never, [
      [
        { artist: 'A', album: 'Album' },
        { artist: 'a', album: 'album (live)' },
      ],
    ]);

    expect(storage.batchLookup).toHaveBeenCalledTimes(1);
    expect(result.entry?.playCount).toBe(5);
    expect(result.entry?.lastPlayed).toBe(200);
    expect(result.entry?.plays).toHaveLength(5);
    expect(result.matchType).toBe('exact');
  });

  it('counts a history entry once when several names match it', async () => {
    const storage = historyStorage({
      'a|album': found('fuzzy', 4, 100, ['a|album (deluxe)']),
      'a|album [explicit]': found('fuzzy', 4, 100, ['a|album (deluxe)']),
    });

    const [result] = await lookupMergedHistory(storage as never, [
      [
        { artist: 'a', album: 'album' },
        { artist: 'a', album: 'album [explicit]' },
      ],
    ]);

    expect(result.entry?.playCount).toBe(4);
  });

  it('adds only uncounted entries when matches partially overlap', async () => {
    // "A|Album" exact-matches itself; a mapped "[Explicit]" name fuzzy-matches
    // both the album and its deluxe edition
    const album = found('exact', 2, 100, ['a|album']);
    const deluxe = found('exact', 3, 300, ['a|album (deluxe)']);
    const storage = historyStorage(
      {
        'a|album': album,
        'a|album [explicit]': found('fuzzy', 5, 300, [
          'a|album',
          'a|album (deluxe)',
        ]),
      },
      { 'a|album': album.entry!, 'a|album (deluxe)': deluxe.entry! }
    );

    const [result] = await lookupMergedHistory(storage as never, [
      [
        { artist: 'a', album: 'album' },
        { artist: 'a', album: 'album [explicit]' },
      ],
    ]);

    expect(result.entry?.playCount).toBe(5);
    expect(result.entry?.lastPlayed).toBe(300);
    expect(storage.getIndex).toHaveBeenCalledTimes(1);
  });

  it('returns a null entry when no name matches', async () => {
    const [result] = await lookupMergedHistory(historyStorage({}) as never, [
      [{ artist: 'a', album: 'b' }],
    ]);

    expect(result).toEqual({ entry: null, matchType: 'none', matchedKeys: [] });
  });
});
