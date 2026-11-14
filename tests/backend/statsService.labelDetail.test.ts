import { AlbumLabelInfo } from '../../src/backend/services/albumLabelService';
import { ArtistNameResolver } from '../../src/backend/services/artistNameResolver';
import { MappingService } from '../../src/backend/services/mappingService';
import { ScrobbleHistoryStorage } from '../../src/backend/services/scrobbleHistoryStorage';
import { StatsService } from '../../src/backend/services/statsService';
import { FileStorage } from '../../src/backend/utils/fileStorage';
import {
  AlbumMapping,
  CollectionItem,
  ScrobbleHistoryIndex,
} from '../../src/shared/types';
import { albumGroupKey } from '../../src/shared/utils/albumMapping';

jest.mock('../../src/backend/services/scrobbleHistoryStorage');
jest.mock('../../src/backend/utils/fileStorage');

const DAY = 24 * 60 * 60;
const NOW = Math.floor(Date.now() / 1000);

function item(
  id: number,
  artist: string,
  title: string,
  labels: string[],
  masterId?: number
): CollectionItem {
  return {
    id,
    date_added: '2024-01-15T00:00:00Z',
    rating: 0,
    release: {
      id,
      master_id: masterId,
      title,
      artist,
      year: 2020,
      format: ['Vinyl'],
      label: labels,
      cover_image: `https://example.com/${id}.jpg`,
      resource_url: `https://api.discogs.com/releases/${id}`,
    },
  };
}

function plays(count: number, track: string, start = NOW) {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: start - i * 60,
    track,
  }));
}

function indexOf(
  albums: Record<string, Array<{ timestamp: number; track: string }>>
): ScrobbleHistoryIndex {
  return {
    albums: Object.fromEntries(
      Object.entries(albums).map(([key, list]) => [
        key,
        {
          plays: list,
          playCount: list.length,
          lastPlayed: Math.max(...list.map(p => p.timestamp)),
        },
      ])
    ),
    totalScrobbles: 0,
    lastSyncTimestamp: NOW,
    oldestScrobbleDate: 0,
  };
}

describe('StatsService.getLabelDetail', () => {
  let service: StatsService;
  let historyStorage: jest.Mocked<ScrobbleHistoryStorage>;
  let albumMappings: AlbumMapping[];

  beforeEach(() => {
    albumMappings = [];
    const fileStorage = {
      readJSON: jest.fn().mockResolvedValue(null),
      writeJSON: jest.fn().mockResolvedValue(undefined),
      writeJSONWithBackup: jest.fn().mockResolvedValue(undefined),
    } as unknown as FileStorage;
    historyStorage = {
      getIndex: jest.fn().mockResolvedValue(null),
      fuzzyNormalizeKey: jest.fn((artist: string, album: string) => {
        const norm = (s: string) =>
          s
            .replace(/\s*\(\d+\)\s*$/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');
        return `${norm(artist)}|${norm(album)}`;
      }),
      normalizeKey: jest.fn(
        (artist: string, album: string) =>
          `${artist.toLowerCase().trim()}|${album.toLowerCase().trim()}`
      ),
    } as unknown as jest.Mocked<ScrobbleHistoryStorage>;
    service = new StatsService(fileStorage, historyStorage);
    service.setMappingService({
      getAllAlbumMappings: jest.fn(async () => albumMappings),
      getAllTrackMappings: jest.fn(async () => []),
    } as unknown as MappingService);
  });

  it('returns null for a placeholder label or one not in the collection', async () => {
    historyStorage.getIndex.mockResolvedValue(indexOf({}));
    const collection = [item(1, 'A', 'X', ['Not On Label'])];

    expect(
      await service.getLabelDetail('Not On Label', 'month', collection)
    ).toBeNull();
    expect(
      await service.getLabelDetail('Sub Pop', 'month', collection)
    ).toBeNull();
  });

  it('credits plays of owned albums on the label, grouping label spellings', async () => {
    historyStorage.getIndex.mockResolvedValue(
      indexOf({
        'nirvana|bleach': plays(5, 'About a Girl'),
        'mudhoney|superfuzz bigmuff': plays(3, 'Touch Me'),
        'radiohead|kid a': plays(7, 'Idioteque'),
      })
    );
    const collection = [
      item(1, 'Nirvana', 'Bleach', ['Sub Pop']),
      item(2, 'Mudhoney', 'Superfuzz Bigmuff', ['Sub Pop Records']),
      item(3, 'Radiohead', 'Kid A', ['Parlophone']),
    ];

    const result = await service.getLabelDetail(
      'Sub Pop Records',
      'month',
      collection
    );

    expect(result).not.toBeNull();
    expect(result!.labelKey).toBe('sub pop');
    expect(result!.label).toBe('Sub Pop');
    expect(result!.otherSpellings).toEqual(['Sub Pop Records']);
    expect(result!.totalPlayCount).toBe(8);
    expect(result!.periodCounts.allTime).toBe(8);
    expect(result!.ownedCopyCount).toBe(2);
    expect(result!.topAlbums.map(a => [a.album, a.playCount])).toEqual([
      ['Bleach', 5],
      ['Superfuzz Bigmuff', 3],
    ]);
    expect(result!.topArtists.map(a => [a.artist, a.playCount])).toEqual([
      ['Nirvana', 5],
      ['Mudhoney', 3],
    ]);
    expect(result!.topTracks[0]).toMatchObject({
      track: 'About a Girl',
      album: 'Bleach',
      playCount: 5,
    });
    expect(result!.playTrend.reduce((sum, p) => sum + p.count, 0)).toBe(8);
  });

  it('counts a release on two labels on each label', async () => {
    historyStorage.getIndex.mockResolvedValue(
      indexOf({ 'band|split lp': plays(4, 'Song') })
    );
    const collection = [item(1, 'Band', 'Split LP', ['Merge', 'Sub Pop'])];

    const merge = await service.getLabelDetail('Merge', 'month', collection);
    const subPop = await service.getLabelDetail('Sub Pop', 'month', collection);

    expect(merge!.totalPlayCount).toBe(4);
    expect(subPop!.totalPlayCount).toBe(4);
  });

  it('shows two copies of one album once, counting plays once', async () => {
    historyStorage.getIndex.mockResolvedValue(
      indexOf({ 'band|record': plays(6, 'Song') })
    );
    const collection = [
      item(1, 'Band', 'Record', ['Merge'], 99),
      item(2, 'Band', 'Record', ['Merge'], 99),
    ];

    const result = await service.getLabelDetail('Merge', 'month', collection);

    expect(result!.totalPlayCount).toBe(6);
    expect(result!.topAlbums).toHaveLength(1);
    expect(result!.topAlbums[0].collectionReleaseIds).toEqual([1, 2]);
    expect(result!.ownedCopyCount).toBe(2);
  });

  it('follows album mappings linked to the owned copy', async () => {
    historyStorage.getIndex.mockResolvedValue(
      indexOf({ 'afghan whigs|gentlemen': plays(9, 'Debonair') })
    );
    albumMappings = [
      {
        historyArtist: 'afghan whigs',
        historyAlbum: 'gentlemen',
        collectionId: 1,
        collectionArtist: 'The Afghan Whigs',
        collectionAlbum: 'Gentlemen At 21',
        createdAt: 0,
      },
    ];
    const collection = [
      item(1, 'The Afghan Whigs', 'Gentlemen At 21', ['Sub Pop']),
    ];

    const result = await service.getLabelDetail('Sub Pop', 'month', collection);

    expect(result!.totalPlayCount).toBe(9);
    expect(result!.topAlbums[0].album).toBe('Gentlemen At 21');
  });

  it('lists owned copies that have never been played', async () => {
    historyStorage.getIndex.mockResolvedValue(
      indexOf({ 'band|played': plays(2, 'Song') })
    );
    const collection = [
      item(1, 'Band', 'Played', ['Merge']),
      item(2, 'Band', 'Shelf Only', ['Merge']),
    ];

    const result = await service.getLabelDetail('Merge', 'month', collection);

    expect(result!.unplayedCopies).toEqual([
      { artist: 'Band', album: 'Shelf Only', releaseId: 2 },
    ]);
  });

  it('credits each artist of a collaboration but counts the play once', async () => {
    service.setArtistNameResolver({
      resolveArtist: (name: string) => name.toLowerCase(),
      resolveArtistMulti: (name: string) =>
        name.toLowerCase() === 'a, b' ? ['a', 'b'] : [name.toLowerCase()],
      getDisplayName: (name: string) => name.toUpperCase(),
    } as unknown as ArtistNameResolver);
    historyStorage.getIndex.mockResolvedValue(
      indexOf({ 'a, b|collab': plays(3, 'Song') })
    );
    const collection = [item(1, 'A, B', 'Collab', ['Merge'])];

    const result = await service.getLabelDetail('Merge', 'month', collection);

    expect(result!.totalPlayCount).toBe(3);
    expect(result!.topArtists.map(a => [a.artist, a.playCount])).toEqual([
      ['A', 3],
      ['B', 3],
    ]);
  });

  it('title-cases artist names the resolver has no display spelling for', async () => {
    service.setArtistNameResolver({
      resolveArtist: (name: string) => name.toLowerCase(),
      resolveArtistMulti: (name: string) => [name.toLowerCase()],
      // No preferred spelling recorded: the lowercase key comes back
      getDisplayName: (name: string) => name,
    } as unknown as ArtistNameResolver);
    historyStorage.getIndex.mockResolvedValue(
      indexOf({ 'the afghan whigs|gentlemen': plays(2, 'debonair') })
    );
    const collection = [item(1, 'The Afghan Whigs', 'Gentlemen', ['Sub Pop'])];

    const result = await service.getLabelDetail('Sub Pop', 'month', collection);

    expect(result!.topArtists[0].artist).toBe('The Afghan Whigs');
    expect(result!.topTracks[0].artist).toBe('The Afghan Whigs');
  });

  it('gives explicitly mapped plays to the mapped copy, whatever the collection order', async () => {
    historyStorage.getIndex.mockResolvedValue(
      indexOf({ 'band|record': plays(5, 'Song') })
    );
    albumMappings = [
      {
        historyArtist: 'band',
        historyAlbum: 'record',
        collectionId: 2,
        collectionArtist: 'Band',
        collectionAlbum: 'Record Deluxe Box',
        createdAt: 0,
      },
    ];
    const collection = [
      item(1, 'Band', 'Record', ['Merge'], 10),
      item(2, 'Band', 'Record Deluxe Box', ['Merge'], 11),
    ];

    const result = await service.getLabelDetail('Merge', 'month', collection);

    expect(result!.topAlbums.map(a => [a.album, a.playCount])).toEqual([
      ['Record Deluxe Box', 5],
    ]);
    expect(result!.unplayedCopies.map(c => c.releaseId)).toEqual([1]);
  });

  it('keeps copies together when only one has a master id', async () => {
    historyStorage.getIndex.mockResolvedValue(
      indexOf({ 'band|record': plays(3, 'Song') })
    );
    const collection = [
      item(1, 'Band', 'Record', ['Merge'], 99),
      item(2, 'Band', 'Record', ['Merge']),
    ];

    const result = await service.getLabelDetail('Merge', 'month', collection);

    expect(result!.topAlbums).toHaveLength(1);
    expect(result!.topAlbums[0].collectionReleaseIds).toEqual([1, 2]);
    expect(result!.unplayedCopies).toEqual([]);
  });

  it('matches a collaboration whose Discogs names carry number suffixes', async () => {
    historyStorage.getIndex.mockResolvedValue(
      indexOf({ 'a, b|split': plays(4, 'Song') })
    );
    const collection = [item(1, 'A (2), B (3)', 'Split', ['Merge'])];

    const result = await service.getLabelDetail('Merge', 'month', collection);

    expect(result!.totalPlayCount).toBe(4);
  });

  it("doesn't merge two artists' plays that share a time and track name", async () => {
    historyStorage.getIndex.mockResolvedValue(
      indexOf({
        'x|first': [{ timestamp: NOW, track: 'Intro' }],
        'y|second': [{ timestamp: NOW, track: 'Intro' }],
      })
    );
    const collection = [
      item(1, 'X', 'First', ['Merge']),
      item(2, 'Y', 'Second', ['Merge']),
    ];

    const result = await service.getLabelDetail('Merge', 'month', collection);

    expect(result!.totalPlayCount).toBe(2);
  });

  it('follows an album-name merge that is not linked to a copy', async () => {
    historyStorage.getIndex.mockResolvedValue(
      indexOf({ 'band|record (live)': plays(4, 'Song') })
    );
    albumMappings = [
      {
        historyArtist: 'band',
        historyAlbum: 'record (live)',
        collectionId: 0,
        collectionArtist: 'band',
        collectionAlbum: 'record',
        createdAt: 0,
      },
    ];
    const collection = [item(1, 'Band', 'Record', ['Merge'])];

    const result = await service.getLabelDetail('Merge', 'month', collection);

    expect(result!.totalPlayCount).toBe(4);
  });

  describe('albums you do not own', () => {
    let lookups: Map<string, AlbumLabelInfo>;

    beforeEach(() => {
      lookups = new Map();
      service.setAlbumLabelService({ getAll: async () => lookups });
    });

    it('counts looked-up albums on the label and says where the label came from', async () => {
      historyStorage.getIndex.mockResolvedValue(
        indexOf({
          'nirvana|bleach': plays(5, 'About a Girl'),
          'mudhoney|every good boy deserves fudge': plays(4, 'Good Enough'),
        })
      );
      lookups.set(albumGroupKey('mudhoney', 'every good boy deserves fudge'), {
        labels: ['Sub Pop'],
        source: 'musicbrainz',
        status: 'found',
      });
      const collection = [item(1, 'Nirvana', 'Bleach', ['Sub Pop'])];

      const result = await service.getLabelDetail(
        'Sub Pop',
        'month',
        collection
      );

      expect(result!.totalPlayCount).toBe(9);
      expect(result!.ownedPlayCount).toBe(5);
      expect(result!.lookedUpPlayCount).toBe(4);
      expect(result!.topAlbums).toEqual([
        expect.objectContaining({
          album: 'Bleach',
          owned: true,
          source: 'owned',
        }),
        expect.objectContaining({
          artist: 'Mudhoney',
          album: 'Every Good Boy Deserves Fudge',
          owned: false,
          source: 'musicbrainz',
          collectionReleaseIds: [],
        }),
      ]);
      expect(result!.topArtists.map(a => a.artist)).toEqual([
        'Nirvana',
        'Mudhoney',
      ]);
    });

    it('leaves them out when asked to', async () => {
      historyStorage.getIndex.mockResolvedValue(
        indexOf({
          'nirvana|bleach': plays(5, 'Song'),
          'mudhoney|fudge': plays(4, 'Song'),
        })
      );
      lookups.set(albumGroupKey('mudhoney', 'fudge'), {
        labels: ['Sub Pop'],
        source: 'musicbrainz',
        status: 'found',
      });

      const result = await service.getLabelDetail(
        'Sub Pop',
        'month',
        [item(1, 'Nirvana', 'Bleach', ['Sub Pop'])],
        { includeUnowned: false }
      );

      expect(result!.totalPlayCount).toBe(5);
      expect(result!.lookedUpPlayCount).toBe(0);
    });

    it('never credits an album you own on another label by its lookup', async () => {
      historyStorage.getIndex.mockResolvedValue(
        indexOf({
          'nirvana|bleach': plays(5, 'Song'),
          'nirvana|nevermind': plays(8, 'Song'),
        })
      );
      lookups.set(albumGroupKey('nirvana', 'nevermind'), {
        labels: ['Sub Pop'],
        source: 'musicbrainz',
        status: 'found',
      });
      const collection = [
        item(1, 'Nirvana', 'Bleach', ['Sub Pop']),
        item(2, 'Nirvana', 'Nevermind', ['DGC']),
      ];

      const result = await service.getLabelDetail(
        'Sub Pop',
        'month',
        collection
      );

      expect(result!.totalPlayCount).toBe(5);
    });

    it('counts confirmed and owner-set labels, not unsure or rejected ones', async () => {
      historyStorage.getIndex.mockResolvedValue(
        indexOf({
          'a|unsure': plays(2, 'Song'),
          'b|set': plays(3, 'Song'),
          'c|rejected': plays(4, 'Song'),
        })
      );
      lookups.set(albumGroupKey('a', 'unsure'), {
        labels: ['Merge'],
        source: 'musicbrainz',
        status: 'unsure',
      });
      lookups.set(albumGroupKey('b', 'set'), {
        labels: ['Merge Records'],
        source: 'override',
        status: 'override',
      });
      lookups.set(albumGroupKey('c', 'rejected'), {
        labels: [],
        source: 'override',
        status: 'override',
      });

      const result = await service.getLabelDetail('Merge', 'month', []);

      expect(result!.totalPlayCount).toBe(3);
      expect(result!.topAlbums[0]).toMatchObject({
        album: 'Set',
        source: 'override',
      });
    });

    it('shows a label you own nothing on when looked-up albums are on it', async () => {
      historyStorage.getIndex.mockResolvedValue(
        indexOf({ 'spoon|gimme fiction': plays(6, 'Song') })
      );
      lookups.set(albumGroupKey('spoon', 'gimme fiction'), {
        labels: ['Merge Records'],
        source: 'discogs',
        status: 'found',
      });

      const result = await service.getLabelDetail('Merge', 'month', []);

      expect(result).toMatchObject({
        label: 'Merge Records',
        ownedCopyCount: 0,
        totalPlayCount: 6,
      });
    });

    it('treats artist spellings the resolver groups as one unowned album', async () => {
      service.setArtistNameResolver({
        resolveArtist: (name: string) =>
          name.toLowerCase() === 'the afghan whigs'
            ? 'afghan whigs'
            : name.toLowerCase(),
        resolveArtistMulti: (name: string) => [
          name.toLowerCase() === 'the afghan whigs'
            ? 'afghan whigs'
            : name.toLowerCase(),
        ],
        getDisplayName: (name: string) => name,
      } as unknown as ArtistNameResolver);
      historyStorage.getIndex.mockResolvedValue(
        indexOf({
          'afghan whigs|up in it': plays(3, 'Retarded'),
          'the afghan whigs|up in it': plays(2, 'Hey Cuz'),
        })
      );
      lookups.set(albumGroupKey('afghan whigs', 'up in it'), {
        labels: ['Sub Pop'],
        source: 'musicbrainz',
        status: 'found',
      });

      const result = await service.getLabelDetail('Sub Pop', 'month', []);
      const candidates = await service.getAlbumLabelCandidates([], 3);

      expect(result!.topAlbums).toHaveLength(1);
      expect(result!.topAlbums[0].playCount).toBe(5);
      expect(candidates).toHaveLength(1);
      expect(candidates[0].playCount).toBe(5);
    });

    it('merges mapped spellings of an unowned album into one entry', async () => {
      historyStorage.getIndex.mockResolvedValue(
        indexOf({
          'spoon|gimme fiction': plays(6, 'Song'),
          'spoon|gimme fiction (deluxe)': plays(2, 'Other'),
        })
      );
      albumMappings = [
        {
          historyArtist: 'spoon',
          historyAlbum: 'gimme fiction (deluxe)',
          collectionId: 0,
          collectionArtist: 'spoon',
          collectionAlbum: 'gimme fiction',
          createdAt: 0,
        },
      ];
      lookups.set(albumGroupKey('spoon', 'gimme fiction'), {
        labels: ['Merge'],
        source: 'musicbrainz',
        status: 'found',
      });

      const result = await service.getLabelDetail('Merge', 'month', []);

      expect(result!.topAlbums).toHaveLength(1);
      expect(result!.topAlbums[0].playCount).toBe(8);
    });
  });

  describe('getAlbumLabelCandidates', () => {
    it('lists unowned albums with enough plays, keyed the way lookups are', async () => {
      const mbid = 'aaaaaaaa-1111-2222-3333-444444444444';
      const index = indexOf({
        'nirvana|bleach': plays(5, 'Song'),
        'spoon|gimme fiction': plays(6, 'Song'),
        'spoon|rare thing': plays(2, 'Song'),
      });
      index.albums['spoon|gimme fiction'].mbid = mbid;
      historyStorage.getIndex.mockResolvedValue(index);

      const candidates = await service.getAlbumLabelCandidates(
        [item(1, 'Nirvana', 'Bleach', ['Sub Pop'])],
        3
      );

      expect(candidates).toEqual([
        {
          key: albumGroupKey('spoon', 'gimme fiction'),
          artist: 'spoon',
          album: 'gimme fiction',
          mbid,
          playCount: 6,
          lastPlayed: NOW,
        },
      ]);
    });
  });

  it('counts this week, month and year from play dates', async () => {
    historyStorage.getIndex.mockResolvedValue(
      indexOf({
        'band|record': [
          { timestamp: NOW, track: 'New' },
          { timestamp: NOW - 400 * DAY, track: 'Old' },
        ],
      })
    );
    const collection = [item(1, 'Band', 'Record', ['Merge'])];

    const result = await service.getLabelDetail('Merge', 'month', collection);

    expect(result!.periodCounts.allTime).toBe(2);
    expect(result!.periodCounts.thisYear).toBe(1);
    expect(result!.firstPlayed).toBe(NOW - 400 * DAY);
    expect(result!.lastPlayed).toBe(NOW);
  });

  describe('getTopLabels', () => {
    let lookups: Map<string, AlbumLabelInfo>;

    beforeEach(() => {
      lookups = new Map();
      service.setAlbumLabelService({ getAll: async () => lookups });
    });

    it('ranks labels by plays, grouping spellings under the commonest one', async () => {
      historyStorage.getIndex.mockResolvedValue(
        indexOf({
          'nirvana|bleach': plays(5, 'About a Girl'),
          'mudhoney|superfuzz bigmuff': plays(3, 'Touch Me'),
          "tad|god's balls": plays(1, 'Behemoth'),
          'radiohead|kid a': plays(7, 'Idioteque'),
        })
      );
      const collection = [
        item(1, 'Nirvana', 'Bleach', ['Sub Pop']),
        item(2, 'Mudhoney', 'Superfuzz Bigmuff', ['Sub Pop Records']),
        item(3, 'Tad', "God's Balls", ['Sub Pop']),
        item(4, 'Radiohead', 'Kid A', ['Parlophone']),
      ];

      const result = await service.getTopLabels('all', 10, collection);

      expect(result).toEqual([
        {
          label: 'Sub Pop',
          labelKey: 'sub pop',
          playCount: 9,
          ownedPlayCount: 9,
          albumCount: 3,
          lastPlayed: NOW,
          coverUrl: 'https://example.com/1.jpg',
        },
        {
          label: 'Parlophone',
          labelKey: 'parlophone',
          playCount: 7,
          ownedPlayCount: 7,
          albumCount: 1,
          lastPlayed: NOW,
          coverUrl: 'https://example.com/4.jpg',
        },
      ]);
    });

    it('counts a release on two labels on each, and skips placeholder labels', async () => {
      historyStorage.getIndex.mockResolvedValue(
        indexOf({
          'band|split': plays(4, 'Song'),
          'self|released': plays(9, 'Song'),
        })
      );
      const collection = [
        item(1, 'Band', 'Split', ['Merge', 'Domino']),
        item(2, 'Self', 'Released', ['Not On Label (Self-released)']),
      ];

      const result = await service.getTopLabels('all', 10, collection);

      expect(result.map(l => [l.label, l.playCount])).toEqual([
        ['Domino', 4],
        ['Merge', 4],
      ]);
    });

    it('only counts plays in the period, and leaves out labels with none', async () => {
      historyStorage.getIndex.mockResolvedValue(
        indexOf({
          'band|new': plays(2, 'Song'),
          'band|old': plays(6, 'Song', NOW - 400 * DAY),
        })
      );
      const collection = [
        item(1, 'Band', 'New', ['Merge']),
        item(2, 'Band', 'Old', ['Domino']),
      ];

      const year = await service.getTopLabels('days365', 10, collection);
      expect(year.map(l => [l.label, l.playCount])).toEqual([['Merge', 2]]);

      const custom = await service.getTopLabels('custom', 10, collection, {
        startDate: NOW - 500 * DAY,
        endDate: NOW - 300 * DAY,
      });
      expect(custom.map(l => [l.label, l.playCount])).toEqual([['Domino', 6]]);
    });

    it("counts albums you don't own by their found or owner-set label, unless asked not to", async () => {
      historyStorage.getIndex.mockResolvedValue(
        indexOf({
          'nirvana|bleach': plays(5, 'Song'),
          'mudhoney|fudge': plays(4, 'Song'),
          'tad|salt lick': plays(3, 'Song'),
          'spoon|kill the moonlight': plays(8, 'Song'),
        })
      );
      lookups.set(albumGroupKey('mudhoney', 'fudge'), {
        labels: ['Sub Pop'],
        source: 'musicbrainz',
        status: 'found',
      });
      lookups.set(albumGroupKey('tad', 'salt lick'), {
        labels: ['Sub Pop'],
        source: 'musicbrainz',
        status: 'unsure',
      });
      lookups.set(albumGroupKey('spoon', 'kill the moonlight'), {
        labels: ['Merge'],
        source: 'override',
        status: 'override',
      });
      const collection = [item(1, 'Nirvana', 'Bleach', ['Sub Pop'])];

      const withUnowned = await service.getTopLabels('all', 10, collection);
      expect(
        withUnowned.map(l => [l.label, l.playCount, l.ownedPlayCount])
      ).toEqual([
        ['Sub Pop', 9, 5],
        ['Merge', 8, 0],
      ]);
      expect(withUnowned[1].coverUrl).toBeUndefined();

      const ownedOnly = await service.getTopLabels('all', 10, collection, {
        includeUnowned: false,
      });
      expect(ownedOnly.map(l => [l.label, l.playCount])).toEqual([
        ['Sub Pop', 5],
      ]);
    });

    it('agrees with the label page, counting two copies of one album once', async () => {
      historyStorage.getIndex.mockResolvedValue(
        indexOf({ 'band|record': plays(6, 'Song') })
      );
      const collection = [
        item(1, 'Band', 'Record', ['Merge'], 77),
        item(2, 'Band', 'Record (Reissue)', ['Merge'], 77),
      ];

      const [top] = await service.getTopLabels('all', 10, collection);
      const detail = await service.getLabelDetail('Merge', 'month', collection);

      expect(top.playCount).toBe(6);
      expect(top.albumCount).toBe(1);
      expect(top.playCount).toBe(detail!.totalPlayCount);
    });

    it("shows labels without Discogs' disambiguation number", async () => {
      historyStorage.getIndex.mockResolvedValue(
        indexOf({ 'band|record': plays(2, 'Song') })
      );
      const collection = [item(1, 'Band', 'Record', ['Dirty Looks (4)'])];

      const [top] = await service.getTopLabels('all', 10, collection);
      const detail = await service.getLabelDetail(
        'Dirty Looks (4)',
        'month',
        collection
      );

      expect(top.label).toBe('Dirty Looks');
      expect(detail!.label).toBe('Dirty Looks');
    });

    it('returns at most the limit', async () => {
      historyStorage.getIndex.mockResolvedValue(
        indexOf({
          'a|one': plays(3, 'Song'),
          'b|two': plays(2, 'Song'),
          'c|three': plays(1, 'Song'),
        })
      );
      const collection = [
        item(1, 'A', 'One', ['L1']),
        item(2, 'B', 'Two', ['L2']),
        item(3, 'C', 'Three', ['L3']),
      ];

      const result = await service.getTopLabels('all', 2, collection);

      expect(result.map(l => l.label)).toEqual(['L1', 'L2']);
    });
  });
});
