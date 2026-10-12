import {
  applyUnresolvedResolutions,
  excludeArtists,
  findExclusionCandidates,
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
  it('playIdentity is timestamp + normalized track, unambiguous with "|"', () => {
    expect(playIdentity(100, ' Lullaby ')).toBe(playIdentity(100, 'LULLABY'));
    expect(playIdentity(100, 'x')).not.toBe(playIdentity(100, 'y'));
    expect(playIdentity(100, 'x')).not.toBe(playIdentity(101, 'x'));
    expect(playIdentity(100, 'a|b')).not.toBe(playIdentity(1001, 'b'));
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
    expect(sets.withAlbum.has(playIdentity(1, 'x'))).toBe(true);
    expect(sets.unresolved.has(playIdentity(2, 'y'))).toBe(true);
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

  describe('applyUnresolvedResolutions', () => {
    const raw = (): ScrobbleHistoryIndex =>
      index({
        albums: {
          'a|album': {
            lastPlayed: 1,
            playCount: 1,
            plays: [{ timestamp: 1, track: 'Song' }],
          },
        },
        unresolved: {
          a: {
            lastPlayed: 5,
            playCount: 3,
            plays: [
              { timestamp: 1, track: 'Song' }, // same event as the album play
              { timestamp: 4, track: 'Song' },
              { timestamp: 5, track: 'Other' },
            ],
          },
        },
      });

    it('moves matching plays to the album without duplicating events', () => {
      const input = raw();
      const snapshot = JSON.stringify(input);

      const { index: view, resolvedPlays } = applyUnresolvedResolutions(input, [
        { artist: 'A', track: 'SONG', album: 'Album' },
      ]);

      expect(resolvedPlays).toBe(2);
      expect(view.albums['a|album'].plays).toEqual([
        { timestamp: 1, track: 'Song' },
        { timestamp: 4, track: 'Song' },
      ]);
      expect(view.albums['a|album'].playCount).toBe(2);
      expect(view.unresolved!.a.plays).toEqual([
        { timestamp: 5, track: 'Other' },
      ]);
      expect(countListeningPlays(view)).toBe(3);
      // The raw index is untouched
      expect(JSON.stringify(input)).toBe(snapshot);
    });

    it('creates the album entry when needed and drops emptied artists', () => {
      const { index: view } = applyUnresolvedResolutions(raw(), [
        { artist: 'a', track: 'song', album: 'Album' },
        { artist: 'a', track: 'other', album: 'Singles' },
      ]);

      expect(view.albums['a|singles'].plays).toEqual([
        { timestamp: 5, track: 'Other' },
      ]);
      expect(view.unresolved).toEqual({});
    });

    it('keeps artist and track apart in rule keys (names with "|")', () => {
      const { index: view } = applyUnresolvedResolutions(
        index({
          unresolved: {
            'a|b': {
              lastPlayed: 1,
              playCount: 1,
              plays: [{ timestamp: 1, track: 'c' }],
            },
            a: {
              lastPlayed: 2,
              playCount: 1,
              plays: [{ timestamp: 2, track: 'b|c' }],
            },
          },
        }),
        [{ artist: 'a', track: 'b|c', album: 'Right' }]
      );

      expect(view.albums['a|right'].plays).toEqual([
        { timestamp: 2, track: 'b|c' },
      ]);
      expect(view.unresolved!['a|b'].plays).toHaveLength(1);
    });

    it('returns the same index when there is nothing to apply', () => {
      const input = raw();
      expect(applyUnresolvedResolutions(input, []).index).toBe(input);
    });
  });

  describe('excludeArtists', () => {
    it('leaves the artist out of both stores and recomputes the total', () => {
      const input = index({
        totalScrobbles: 4,
        albums: {
          'the onion|the onion radio news': {
            lastPlayed: 1,
            playCount: 1,
            plays: [{ timestamp: 1, track: 'Ep 1' }],
          },
          'a|b': { lastPlayed: 2, playCount: 1, plays: [{ timestamp: 2 }] },
        },
        unresolved: {
          'the onion': {
            lastPlayed: 3,
            playCount: 2,
            plays: [{ timestamp: 3 }, { timestamp: 4 }],
          },
        },
      });
      const snapshot = JSON.stringify(input);

      const { index: view, excludedPlays } = excludeArtists(input, [
        'The Onion',
      ]);

      expect(excludedPlays).toBe(3);
      expect(Object.keys(view.albums)).toEqual(['a|b']);
      expect(view.unresolved).toEqual({});
      expect(view.totalScrobbles).toBe(1);
      expect(JSON.stringify(input)).toBe(snapshot);
      expect(excludeArtists(input, []).index).toBe(input);
    });
  });

  describe('findExclusionCandidates', () => {
    const plays = (count: number, title: (i: number) => string) =>
      Array.from({ length: count }, (_, i) => ({
        timestamp: i + 1,
        track: title(i),
      }));

    it('suggests podcast-like artists and not albums heard once', () => {
      const candidates = findExclusionCandidates(
        index({
          albums: {
            // An album heard once: one play per track, but real titles
            'band|record': {
              lastPlayed: 40,
              playCount: 40,
              plays: plays(
                40,
                i => `Song ${String.fromCharCode(65 + (i % 26))}${i}`
              ),
            },
            // Podcast scrobbled with the show as album: episode titles
            'doug benson|doug loves movies': {
              lastPlayed: 30,
              playCount: 30,
              plays: plays(30, i => `Guest ${i} and friends guest`),
            },
          },
          unresolved: {
            // Podcast with no album info
            'the onion': {
              lastPlayed: 50,
              playCount: 50,
              plays: plays(50, i => `Headline number ${i}`),
            },
            // Music without album info, but replayed
            singer: {
              lastPlayed: 90,
              playCount: 90,
              plays: plays(90, i => `Hit ${i % 30}`),
            },
          },
        })
      );

      expect(candidates.map(c => c.artist)).toEqual([
        'the onion',
        'doug benson',
      ]);
      expect(candidates[0].unresolvedShare).toBe(1);
      expect(candidates[1].episodeTitleShare).toBe(1);
    });
  });
});
