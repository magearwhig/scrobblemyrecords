/**
 * Contract: one set of scrobbles counts the same on every page that lists
 * plays. If this fails, a page is grouping plays its own way instead of by
 * play identity (services/playIdentity). See .plan/play-identity-plan.md.
 */
import { MappingService } from '../../src/backend/services/mappingService';
import { RankingsService } from '../../src/backend/services/rankingsService';
import { ScrobbleHistoryStorage } from '../../src/backend/services/scrobbleHistoryStorage';
import { StatsService } from '../../src/backend/services/statsService';
import { TrackMappingService } from '../../src/backend/services/trackMappingService';
import { FileStorage } from '../../src/backend/utils/fileStorage';
import { ScrobbleHistoryIndex } from '../../src/shared/types';

const DAY = 24 * 60 * 60;
const now = Math.floor(Date.now() / 1000);
const longAgo = now - 1000 * DAY;

const plays = (timestamps: number[], track: string) =>
  timestamps.map(timestamp => ({ timestamp, track }));

// The Format's "Time Bomb", scrobbled six times as Dog Problems:
// - 3 old plays on Dog Problems
// - 1 recent play on the bonus-track version (joined by an album mapping)
// - 1 recent demo on a b-sides album (moved by a track mapping)
// - 1 recent play under a misspelled artist (moved by a track mapping)
// and two ways that are not: a live album, and a play with no album.
const index: ScrobbleHistoryIndex = {
  albums: {
    'the format|dog problems': {
      lastPlayed: longAgo,
      playCount: 3,
      plays: plays([longAgo, longAgo - 1, longAgo - 2], 'Time Bomb'),
    },
    'the format|dog problems (bonus track version)': {
      lastPlayed: now - DAY,
      playCount: 1,
      plays: plays([now - DAY], 'Time Bomb'),
    },
    'the format|b-sides': {
      lastPlayed: now - 2 * DAY,
      playCount: 1,
      plays: plays([now - 2 * DAY], 'Time Bomb (Demo)'),
    },
    // A misspelled artist, moved to The Format by a track mapping
    'teh format|singles': {
      lastPlayed: now - 3 * DAY,
      playCount: 1,
      plays: plays([now - 3 * DAY], 'Time Bomb'),
    },
    'the format|live': {
      lastPlayed: longAgo,
      playCount: 1,
      plays: plays([longAgo], 'Time Bomb'),
    },
  },
  unresolved: {
    'the format': {
      lastPlayed: longAgo,
      playCount: 1,
      plays: plays([longAgo], 'Time Bomb'),
    },
  },
  totalScrobbles: 8,
  lastSyncTimestamp: now,
  oldestScrobbleDate: longAgo,
} as ScrobbleHistoryIndex;

const historyStorage = {
  getIndex: jest.fn().mockResolvedValue(index),
  getAlbumHistoryFuzzy: jest
    .fn()
    .mockResolvedValue({ entry: null, matchType: 'none' }),
  fuzzyNormalizeKey: (artist: string, album: string) =>
    `${artist.toLowerCase()}|${album.toLowerCase()}`,
} as unknown as ScrobbleHistoryStorage;

const mappingService = {
  getAllAlbumMappings: jest.fn().mockResolvedValue([
    {
      historyArtist: 'the format',
      historyAlbum: 'dog problems (bonus track version)',
      collectionArtist: 'The Format (2)',
      collectionAlbum: 'Dog Problems',
      collectionId: 5403896,
      createdAt: 1,
    },
  ]),
  getAlbumMapping: jest.fn().mockResolvedValue(null),
} as unknown as MappingService;

const trackMappingService = new TrackMappingService({
  readJSON: jest.fn().mockResolvedValue({
    schemaVersion: 1,
    mappings: [
      {
        historyArtist: 'the format',
        historyAlbum: 'b-sides',
        historyTrack: 'Time Bomb (Demo)',
        cacheArtist: 'the format',
        cacheAlbum: 'dog problems',
        cacheTrack: 'Time Bomb',
        createdAt: 1,
      },
      {
        historyArtist: 'teh format',
        historyAlbum: 'singles',
        historyTrack: 'Time Bomb',
        cacheArtist: 'the format',
        cacheAlbum: 'dog problems',
        cacheTrack: 'Time Bomb',
        createdAt: 1,
      },
    ],
  }),
  writeJSONWithBackup: jest.fn(),
} as unknown as FileStorage);

const fileStorage = {
  readJSON: jest.fn().mockResolvedValue(null),
  writeJSON: jest.fn().mockResolvedValue(undefined),
  writeJSONWithBackup: jest.fn().mockResolvedValue(undefined),
} as unknown as FileStorage;

// Owned: the collection's own spelling, linked by the album mapping
const dogProblems = {
  id: 5403896,
  date_added: '2024-01-01T00:00:00Z',
  release: {
    id: 5403896,
    title: 'Dog Problems',
    artist: 'The Format (2)',
    format: ['Vinyl'],
    label: [],
    resource_url: '',
  },
};
const collection = [dogProblems];

const query = {
  page: 1,
  perPage: 50,
  sortBy: 'playCount',
  sortOrder: 'desc',
} as const;

const isDogProblems = (album: string | undefined) =>
  album?.toLowerCase() === 'dog problems';

describe('play identity contract', () => {
  let stats: StatsService;
  let rankings: RankingsService;

  beforeEach(() => {
    stats = new StatsService(fileStorage, historyStorage);
    stats.setMappingService(mappingService);
    stats.setTrackMappingService(trackMappingService);
    rankings = new RankingsService(historyStorage);
    rankings.setMappingService(mappingService);
    rankings.setTrackMappingService(trackMappingService);
  });

  it('Top Tracks counts 6 plays of Time Bomb on Dog Problems', async () => {
    const top = await stats.getTopTracks('all', 50);
    const rows = top.filter(t => t.track === 'Time Bomb');

    expect(
      rows.filter(t => isDogProblems(t.album)).map(t => t.playCount)
    ).toEqual([6]);
    // The live album and the albumless play stay their own rows
    expect(rows).toHaveLength(3);
  });

  it('the artist page agrees', async () => {
    const detail = await stats.getArtistDetail('The Format', 'month', []);
    const rows = detail.topTracks.filter(t => t.track === 'Time Bomb');

    expect(
      rows.filter(t => isDogProblems(t.album)).map(t => t.playCount)
    ).toEqual([6]);
    expect(rows).toHaveLength(3);
  });

  it('the track page agrees, for the album and for the track as a whole', async () => {
    const onAlbum = await stats.getTrackDetail(
      'The Format',
      'Time Bomb',
      'Dog Problems'
    );
    const overall = await stats.getTrackDetail('The Format', 'Time Bomb');

    expect(onAlbum.totalPlayCount).toBe(6);
    expect(overall.totalPlayCount).toBe(8);
    expect(
      overall.appearsOn
        .filter(a => isDogProblems(a.album))
        .map(a => a.playCount)
    ).toEqual([6]);
  });

  it('the demo no longer counts on the album it was moved from', async () => {
    const detail = await stats.getTrackDetail(
      'The Format',
      'Time Bomb (Demo)',
      'B-Sides'
    );

    expect(detail.totalPlayCount).toBe(0);
  });

  it('Forgotten Favorites agrees: played this week, so not forgotten', async () => {
    const { tracks } = await stats.getForgottenFavorites(90, 1, 100);
    const rows = tracks.filter(t => t.track === 'Time Bomb');

    expect(rows.some(t => isDogProblems(t.album))).toBe(false);
    // The old live play and the old albumless play are forgotten
    expect(rows).toHaveLength(2);
  });

  it('Rankings agree', async () => {
    const result = await rankings.getRankingsOverTime('tracks', 10);
    const latest = result.snapshots[result.snapshots.length - 1].rankings;
    const counts = latest
      .filter(r => r.name === 'Time Bomb')
      .map(r => r.count)
      .sort((a, b) => b - a);

    expect(counts).toEqual([6, 1, 1]);
  });

  it("History's Tracks list agrees, and says it's owned", async () => {
    const { items } = await stats.getHistoryTracks(query, collection);
    const rows = items.filter(t => t.track === 'Time Bomb');

    const onDogProblems = rows.filter(t => isDogProblems(t.album));
    expect(onDogProblems.map(t => t.playCount)).toEqual([6]);
    expect(onDogProblems[0].collectionItem?.id).toBe(5403896);
    expect(rows).toHaveLength(3);
  });

  it("History's Albums list and Top Albums agree on Dog Problems", async () => {
    const history = await stats.getHistoryAlbums(query, collection);
    const top = await stats.getTopAlbums(
      'all',
      50,
      undefined,
      undefined,
      collection
    );

    const historyRow = history.items.find(a => isDogProblems(a.album));
    const topRow = top.find(a => isDogProblems(a.album));
    expect(historyRow?.playCount).toBe(6);
    expect(topRow?.playCount).toBe(6);
    expect(historyRow?.collectionItem?.id).toBe(5403896);
    expect(topRow?.inCollection).toBe(true);
    // The b-sides album lost its only play to Dog Problems
    expect(history.items.some(a => a.album.toLowerCase() === 'b-sides')).toBe(
      false
    );
    expect(top.some(a => a.album.toLowerCase() === 'b-sides')).toBe(false);
  });

  it('Forgotten Favorites and History agree on what is owned', async () => {
    const { tracks } = await stats.getForgottenFavorites(0, 1, 100, collection);

    expect(
      tracks.find(t => t.track === 'Time Bomb' && isDogProblems(t.album))
        ?.collectionItem?.id
    ).toBe(5403896);
  });

  it("History's Artists list and Top Artists agree on what The Format owns", async () => {
    const history = await stats.getHistoryArtists(query, collection);
    const top = await stats.withArtistOwnership(
      await stats.getTopArtists('all', 10),
      collection
    );

    expect(history.items[0].ownedCount).toBe(1);
    expect(
      top.find(a => a.artist.toLowerCase() === 'the format')?.ownedCount
    ).toBe(1);
  });

  it("the artist page's totals and albums agree with History", async () => {
    const detail = await stats.getArtistDetail(
      'The Format',
      'month',
      collection
    );
    const history = await stats.getHistoryArtists(query, collection);

    // Every play that counts as The Format, including the one a track
    // mapping moved from a misspelled artist
    expect(detail.totalPlayCount).toBe(8);
    expect(history.items[0].playCount).toBe(8);

    const albums = detail.albums.map(a => [a.album.toLowerCase(), a.playCount]);
    expect(albums).toEqual([
      ['dog problems', 6],
      ['live', 1],
    ]);
    expect(detail.albums[0].inCollection).toBe(true);
  });

  it('Top Artists, artist rankings and History count The Format the same', async () => {
    const top = await stats.getTopArtists('all', 10);
    const ranked = await rankings.getRankingsOverTime('artists', 10);
    const latest = ranked.snapshots[ranked.snapshots.length - 1].rankings;

    const isTheFormat = (name: string | undefined) =>
      name?.toLowerCase() === 'the format';
    expect(top.find(a => isTheFormat(a.artist))?.playCount).toBe(8);
    expect(latest.find(r => isTheFormat(r.name))?.count).toBe(8);
    // The misspelled artist's only play moved to The Format
    expect(top.some(a => a.artist.toLowerCase() === 'teh format')).toBe(false);
    expect(latest.some(r => r.name.toLowerCase() === 'teh format')).toBe(false);
  });

  it('album rankings agree with Top Albums', async () => {
    const ranked = await rankings.getRankingsOverTime('albums', 10);
    const latest = ranked.snapshots[ranked.snapshots.length - 1].rankings;

    expect(
      latest.find(r => r.name.toLowerCase() === 'dog problems')?.count
    ).toBe(6);
    expect(latest.some(r => r.name.toLowerCase() === 'b-sides')).toBe(false);
  });
});
