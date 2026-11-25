import { PlayIdentityService } from '../../src/backend/services/playIdentity/service';
import { ScrobbleHistoryStorage } from '../../src/backend/services/scrobbleHistoryStorage';
import { TrackMappingService } from '../../src/backend/services/trackMappingService';
import { FileStorage } from '../../src/backend/utils/fileStorage';
import {
  AlbumMapping,
  CollectionItem,
  ScrobbleHistoryIndex,
} from '../../src/shared/types';

const item = (id: number, artist: string, title: string): CollectionItem => ({
  id,
  release: {
    id,
    title,
    artist,
    format: ['Vinyl'],
    label: [],
    resource_url: '',
    cover_image: `https://example.com/${id}.jpg`,
  },
  date_added: '2024-01-01T00:00:00Z',
});

const dogProblems = item(5403896, 'The Format (2)', 'Dog Problems');
const lice = item(24813326, 'Aesop Rock, Homeboy Sandman', 'Lice');
const collection = [dogProblems, lice];

const mappings: AlbumMapping[] = [
  {
    historyArtist: 'the format',
    historyAlbum: 'dog problems (bonus track version)',
    collectionArtist: 'The Format (2)',
    collectionAlbum: 'Dog Problems',
    collectionId: 5403896,
    createdAt: 1,
  },
  {
    historyArtist: 'lice',
    historyAlbum: 'lice',
    collectionArtist: 'Aesop Rock, Homeboy Sandman',
    collectionAlbum: 'Lice',
    collectionId: 24813326,
    createdAt: 1,
  },
];

const index = {
  albums: {
    'the format|dog problems': {
      lastPlayed: 300,
      playCount: 2,
      plays: [
        { timestamp: 300, track: 'Time Bomb' },
        { timestamp: 200, track: 'Pick Me Up' },
      ],
    },
    'the format|dog problems (bonus track version)': {
      lastPlayed: 900,
      playCount: 1,
      plays: [{ timestamp: 900, track: 'Time Bomb' }],
    },
    // A demo a track mapping moves onto Dog Problems
    'the format|b-sides': {
      lastPlayed: 500,
      playCount: 1,
      plays: [{ timestamp: 500, track: 'Time Bomb (Demo)' }],
    },
    'lice|lice': {
      lastPlayed: 100,
      playCount: 1,
      plays: [{ timestamp: 100, track: 'Katz' }],
    },
    'the format|live': {
      lastPlayed: 50,
      playCount: 1,
      plays: [{ timestamp: 50, track: 'Time Bomb' }],
    },
  },
  unresolved: {
    'the format': {
      lastPlayed: 10,
      playCount: 1,
      plays: [{ timestamp: 10, track: 'Time Bomb' }],
    },
  },
  totalScrobbles: 7,
  lastSyncTimestamp: 900,
  oldestScrobbleDate: 10,
} as ScrobbleHistoryIndex;

const build = () => {
  const service = new PlayIdentityService({
    getIndex: jest.fn().mockResolvedValue(index),
    fuzzyNormalizeKey: (artist: string, album: string) =>
      `${artist.toLowerCase().replace(/\s*\(\d+\)$/, '')}|${album.toLowerCase()}`,
  } as unknown as ScrobbleHistoryStorage);
  service.setMappingService({
    getAllAlbumMappings: jest.fn().mockResolvedValue(mappings),
  });
  service.setTrackMappingService(
    new TrackMappingService({
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
        ],
      }),
      writeJSONWithBackup: jest.fn(),
    } as unknown as FileStorage)
  );
  return service;
};

describe('PlayIdentityService read model', () => {
  it("a record's plays are every play that resolves to it", async () => {
    const model = await build().readModel(collection);

    const plays = model.recordPlays(dogProblems);

    // Plain version 2, bonus version 1, the moved demo 1
    expect(plays.entry?.playCount).toBe(4);
    expect(plays.entry?.lastPlayed).toBe(900);
    expect(plays.entry?.plays.map(p => p.track).sort()).toEqual([
      'Pick Me Up',
      'Time Bomb',
      'Time Bomb',
      'Time Bomb',
    ]);
    // The history albums the plays were scrobbled on
    expect(plays.matchedKeys.sort()).toEqual([
      'the format|b-sides',
      'the format|dog problems',
      'the format|dog problems (bonus track version)',
    ]);
    expect(plays.matchType).toBe('exact');
  });

  it('a record reached only through a mapping still finds its plays', async () => {
    const model = await build().readModel(collection);

    expect(model.recordPlays(lice).entry?.playCount).toBe(1);
  });

  it('a record never played has no entry', async () => {
    const model = await build().readModel([
      ...collection,
      item(7, 'Someone', 'Unplayed'),
    ]);

    const plays = model.recordPlays(item(7, 'Someone', 'Unplayed'));
    expect(plays.entry).toBeNull();
    expect(plays.matchType).toBe('none');
  });

  it("an album's plays match the record's when owned, and include unowned albums", async () => {
    const model = await build().readModel(collection);

    expect(
      model.albumPlays('The Format', 'Dog Problems (Bonus Track Version)')
        ?.playCount
    ).toBe(4);
    const live = model.albumPlays('The Format', 'Live');
    expect(live?.playCount).toBe(1);
    expect(live?.collectionItem).toBeUndefined();
    // The b-sides album lost its only play to Dog Problems
    expect(model.albumPlays('The Format', 'B-Sides')).toBeUndefined();
  });

  it("an owned album's plays include versions that resolve to the record by name", async () => {
    const shame = item(9, 'Band', 'Shame Shame');
    const service = new PlayIdentityService({
      getIndex: jest.fn().mockResolvedValue({
        ...index,
        albums: {
          'band|shame shame (deluxe edition)': {
            lastPlayed: 5,
            playCount: 1,
            plays: [{ timestamp: 5, track: 'Song' }],
          },
        },
        unresolved: {},
      }),
      // Spelling-tolerant: edition words don't count
      fuzzyNormalizeKey: (artist: string, album: string) =>
        `${artist.toLowerCase()}|${album.toLowerCase().replace(/\s*\(deluxe edition\)$/, '')}`,
    } as unknown as ScrobbleHistoryStorage);
    const model = await service.readModel([shame]);

    expect(model.albumPlays('Band', 'Shame Shame')?.playCount).toBe(1);
    expect(model.recordPlays(shame).matchType).toBe('fuzzy');
  });

  it('lists every album once, with its owner', async () => {
    const model = await build().readModel(collection);

    expect(
      model
        .albums()
        .map(a => [a.album.toLowerCase(), a.playCount, a.collectionItem?.id])
        .sort()
    ).toEqual([
      ['dog problems', 4, 5403896],
      ['lice', 1, 24813326],
      ['live', 1, undefined],
    ]);
  });

  it('reuses the model until the rules or collection change', async () => {
    const service = build();

    const first = await service.readModel(collection);
    expect(await service.readModel(collection)).toBe(first);
    expect(await service.readModel([dogProblems])).not.toBe(first);
  });
});

describe('discogsAlbumPlays (an album named the Discogs way)', () => {
  const service = (albums: ScrobbleHistoryIndex['albums']) => {
    const s = new PlayIdentityService({
      getIndex: jest
        .fn()
        .mockResolvedValue({ ...index, albums, unresolved: {} }),
      // Spelling-tolerant, like the real key: edition words don't count
      fuzzyNormalizeKey: (artist: string, album: string) =>
        `${artist.toLowerCase().replace(/\s*\(\d+\)$/, '')}|${album.toLowerCase().replace(/\s*\(deluxe edition\)$/, '')}`,
    } as unknown as ScrobbleHistoryStorage);
    s.setLastfmArtistOf(name =>
      name === 'Aesop Rock, Blockhead' ? 'aesop rock' : name
    );
    return s;
  };
  const played = (count: number, track = 'Song') => ({
    lastPlayed: count,
    playCount: count,
    plays: Array.from({ length: count }, (_, i) => ({
      timestamp: i + 1,
      track,
    })),
  });

  it('falls back to edition spellings only when the name itself was never played', async () => {
    const onlyDeluxe = await service({
      'band|album (deluxe edition)': played(2),
    }).readModel();
    const both = await service({
      'band|album (deluxe edition)': played(2),
      'band|album': played(1),
    }).readModel();

    expect(onlyDeluxe.discogsAlbumPlays('Band', 'Album')).toMatchObject({
      playCount: 2,
      matchType: 'fuzzy',
    });
    // Played under its own name: that album, as before
    expect(both.discogsAlbumPlays('Band', 'Album')).toMatchObject({
      playCount: 1,
      matchType: 'exact',
    });
  });

  it('follows Discogs-to-Last.fm artist mappings', async () => {
    const model = await service({
      'aesop rock|garbology': played(4),
    }).readModel();

    expect(
      model.discogsAlbumPlays('Aesop Rock, Blockhead', 'Garbology').playCount
    ).toBe(4);
  });

  it('is zero for an album never played', async () => {
    const model = await service({}).readModel();

    expect(model.discogsAlbumPlays('Band', 'Nope')).toEqual({
      playCount: 0,
      lastPlayed: null,
      matchType: 'none',
    });
  });
});

describe('a name whose plays all moved away', () => {
  it('finds no plays, not the plays of the album they moved to', async () => {
    const service = new PlayIdentityService({
      getIndex: jest.fn().mockResolvedValue({
        ...index,
        albums: {
          'band|source': {
            lastPlayed: 1,
            playCount: 1,
            plays: [{ timestamp: 1, track: 'Song' }],
          },
          'band|target': {
            lastPlayed: 3,
            playCount: 2,
            plays: [
              { timestamp: 2, track: 'Other' },
              { timestamp: 3, track: 'Other' },
            ],
          },
        },
        unresolved: {},
      }),
      fuzzyNormalizeKey: (artist: string, album: string) =>
        `${artist.toLowerCase()}|${album.toLowerCase()}`,
    } as unknown as ScrobbleHistoryStorage);
    service.setTrackMappingService(
      new TrackMappingService({
        readJSON: jest.fn().mockResolvedValue({
          schemaVersion: 1,
          mappings: [
            {
              historyArtist: 'band',
              historyAlbum: 'source',
              historyTrack: 'Song',
              cacheArtist: 'band',
              cacheAlbum: 'target',
              cacheTrack: 'Song',
              createdAt: 1,
            },
          ],
        }),
        writeJSONWithBackup: jest.fn(),
      } as unknown as FileStorage)
    );
    const model = await service.readModel();

    expect(model.discogsAlbumPlays('Band', 'Source').playCount).toBe(0);
    expect(model.discogsAlbumPlays('Band', 'Target').playCount).toBe(3);
  });
});
