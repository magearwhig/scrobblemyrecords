import {
  buildIdentitySets,
  countListeningPlays,
  dedupeHistoryIndex,
  forEachListeningPlay,
  playIdentity,
} from '../../../src/backend/utils/historyPlays';
import { ScrobbleHistoryIndex } from '../../../src/shared/types';

const index = (
  overrides: Partial<ScrobbleHistoryIndex> = {}
): ScrobbleHistoryIndex => ({
  lastSyncTimestamp: 0,
  totalScrobbles: 0,
  oldestScrobbleDate: 0,
  albums: {},
  ...overrides,
});

describe('historyPlays', () => {
  it('playIdentity normalizes artist and track and includes both', () => {
    expect(playIdentity(100, ' The Cure ', 'Lullaby')).toBe(
      playIdentity(100, 'the cure', 'LULLABY')
    );
    expect(playIdentity(100, 'a', 'x')).not.toBe(playIdentity(100, 'a', 'y'));
    expect(playIdentity(100, 'a', 'x')).not.toBe(playIdentity(100, 'b', 'x'));
  });

  it('forEachListeningPlay visits album and unresolved plays', () => {
    const seen: Array<[number, string, string | null]> = [];
    forEachListeningPlay(
      index({
        albums: {
          'artist|album | part 2': {
            lastPlayed: 2,
            playCount: 1,
            plays: [{ timestamp: 2, track: 't1' }],
          },
        },
        unresolved: {
          artist: {
            lastPlayed: 3,
            playCount: 1,
            plays: [{ timestamp: 3, track: 't2' }],
          },
        },
      }),
      (play, artist, album) => seen.push([play.timestamp, artist, album])
    );

    expect(seen).toEqual([
      [2, 'artist', 'album | part 2'],
      [3, 'artist', null],
    ]);
  });

  it('countListeningPlays counts both stores and tolerates a v1 index', () => {
    const v1 = index({
      albums: {
        'a|b': {
          lastPlayed: 1,
          playCount: 2,
          plays: [{ timestamp: 1 }, { timestamp: 2 }],
        },
      },
    });
    expect(countListeningPlays(v1)).toBe(2);
    expect(
      countListeningPlays({
        ...v1,
        unresolved: {
          a: { lastPlayed: 3, playCount: 1, plays: [{ timestamp: 3 }] },
        },
      })
    ).toBe(3);
  });

  it('buildIdentitySets splits identities by store', () => {
    const sets = buildIdentitySets(
      index({
        albums: {
          'a|b': {
            lastPlayed: 1,
            playCount: 1,
            plays: [{ timestamp: 1, track: 'x' }],
          },
        },
        unresolved: {
          a: {
            lastPlayed: 2,
            playCount: 1,
            plays: [{ timestamp: 2, track: 'y' }],
          },
        },
      })
    );
    expect(sets.withAlbum.has(playIdentity(1, 'a', 'x'))).toBe(true);
    expect(sets.unresolved.has(playIdentity(2, 'a', 'y'))).toBe(true);
  });

  describe('dedupeHistoryIndex', () => {
    it('keeps each identity once, preferring the album copy', () => {
      const { index: result, removed } = dedupeHistoryIndex(
        index({
          totalScrobbles: 999,
          albums: {
            'a|b': {
              lastPlayed: 5,
              playCount: 3,
              plays: [
                { timestamp: 1, track: 'x' },
                { timestamp: 1, track: 'x' }, // duplicate
                { timestamp: 1, track: 'y' }, // same second, different track
              ],
            },
          },
          unresolved: {
            a: {
              lastPlayed: 1,
              playCount: 2,
              plays: [
                { timestamp: 1, track: 'x' }, // also in the album
                { timestamp: 4, track: 'z' },
              ],
            },
          },
        })
      );

      expect(removed).toBe(2);
      expect(result.albums['a|b'].plays).toHaveLength(2);
      expect(result.albums['a|b'].playCount).toBe(2);
      expect(result.albums['a|b'].lastPlayed).toBe(1);
      expect(result.unresolved!.a.plays).toEqual([
        { timestamp: 4, track: 'z' },
      ]);
      expect(result.totalScrobbles).toBe(3);
    });

    it('leaves untouched entries (even empty ones) as they were', () => {
      const { index: result, removed } = dedupeHistoryIndex(
        index({
          albums: {
            'a|empty': { lastPlayed: 7, playCount: 5, plays: [] },
            'a|b': {
              lastPlayed: 9,
              playCount: 18,
              plays: [{ timestamp: 1, track: 'x' }],
            },
          },
        })
      );

      expect(removed).toBe(0);
      expect(result.albums['a|empty']).toEqual({
        lastPlayed: 7,
        playCount: 5,
        plays: [],
      });
      expect(result.albums['a|b'].playCount).toBe(18);
      expect(result.unresolved).toEqual({});
    });
  });
});
