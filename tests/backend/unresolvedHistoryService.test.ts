import {
  trackMatchKey,
  UNRESOLVED_HISTORY_FILE,
  UnresolvedHistoryService,
} from '../../src/backend/services/unresolvedHistoryService';
import { FileStorage } from '../../src/backend/utils/fileStorage';
import { excludeArtists } from '../../src/backend/utils/historyPlays';
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

    const summary = await service.getSummary(raw, raw, resolved);

    expect(summary).toEqual({
      indexedTotal: 5,
      unresolvedCount: 2,
      resolvedByRuleCount: 2,
      hiddenCount: 1,
      resolutionCount: 0,
      excludedArtistCount: 0,
      excludedPlayCount: 0,
      lastfmTotal: 7,
      lastfmTotalCheckedAt: 99,
      gap: 2,
      lastFullBackfillAt: null,
    });
  });

  it('suggests an album from Last.fm and checks it against the tracklist', async () => {
    const { storage } = memoryStorage();
    const lookup = {
      getTrackInfo: jest.fn(async (_artist: string, track: string) =>
        track === 'Nowhere'
          ? null
          : { album: ' Suitcase 2: American Magnetic Wave Generator ' }
      ),
      getAlbumInfo: jest.fn().mockResolvedValue({
        name: 'Suitcase 2',
        url: 'https://www.last.fm/music/Guided+By+Voices/Suitcase+2',
        image: [
          { size: 'small', '#text': 'small.png' },
          { size: 'extralarge', '#text': 'xl.png' },
        ],
        tracks: {
          track: [
            { name: 'Bunco Men', '@attr': { rank: 1 } },
            { name: 'Mini Twister (Remastered)', '@attr': { rank: 2 } },
          ],
        },
      }),
    };
    const service = new UnresolvedHistoryService(storage, lookup);

    const onAlbum = await service.lookupAlbum(
      'Guided By Voices',
      'Mini Twister'
    );
    const notOnAlbum = await service.lookupAlbum(
      'Guided By Voices',
      'Elsewhere'
    );
    const none = await service.lookupAlbum('Guided By Voices', 'Nowhere');

    expect(onAlbum).toEqual({
      album: 'Suitcase 2: American Magnetic Wave Generator',
      verification: {
        onTracklist: true,
        position: 2,
        trackCount: 2,
        imageUrl: 'xl.png',
        albumUrl: 'https://www.last.fm/music/Guided+By+Voices/Suitcase+2',
      },
    });
    expect(notOnAlbum.verification).toMatchObject({
      onTracklist: false,
      trackCount: 2,
    });
    expect(none).toEqual({ album: null });
    // One album lookup serves every song suggested onto that album
    expect(lookup.getAlbumInfo).toHaveBeenCalledTimes(1);
  });

  it('reports an unverifiable suggestion when the tracklist is unavailable', async () => {
    const { storage } = memoryStorage();
    const service = new UnresolvedHistoryService(storage, {
      getTrackInfo: jest.fn().mockResolvedValue({ album: 'Album' }),
      getAlbumInfo: jest.fn().mockRejectedValue(new Error('Last.fm down')),
    });

    await expect(service.lookupAlbum('a', 'x')).resolves.toEqual({
      album: 'Album',
      verification: { onTracklist: null },
    });
    const noAlbumInfo = new UnresolvedHistoryService(storage, {
      getTrackInfo: jest.fn().mockResolvedValue({ album: 'Album' }),
    });
    await expect(noAlbumInfo.lookupAlbum('a', 'x')).resolves.toEqual({
      album: 'Album',
      verification: { onTracklist: null },
    });
  });

  it('excludes and restores artists, and reports their stored plays', async () => {
    const { storage } = memoryStorage();
    const service = new UnresolvedHistoryService(storage);

    expect(await service.setExcluded(['Radiohead', 'radiohead '], true)).toBe(
      1
    );
    expect(await service.getExcludedArtists()).toEqual(['radiohead']);
    expect(
      await service.listExcluded(historyIndex(), artist => `[${artist}]`)
    ).toEqual([{ artist: 'radiohead', artistName: '[radiohead]', plays: 1 }]);

    // The storage view leaves excluded artists out before rules apply
    const view = excludeArtists(historyIndex(), ['radiohead']).index;
    const summary = await service.getSummary(historyIndex(), view, view);
    expect(summary.excludedArtistCount).toBe(1);
    expect(summary.excludedPlayCount).toBe(1);
    // The excluded artist's unresolved play isn't counted as resolved
    expect(summary.resolvedByRuleCount).toBe(0);
    expect(summary.unresolvedCount).toBe(3);

    expect(await service.setExcluded(['radiohead'], false)).toBe(1);
    expect(await service.getExcludedArtists()).toEqual([]);
  });

  it('suggests podcast-like artists that are not already excluded', async () => {
    const { storage } = memoryStorage();
    const service = new UnresolvedHistoryService(storage);
    const index = historyIndex();
    index.unresolved!['the onion'] = {
      lastPlayed: 100,
      playCount: 30,
      plays: Array.from({ length: 30 }, (_, i) => ({
        timestamp: 100 + i,
        track: `Headline ${i}`,
      })),
    };

    expect((await service.suggestExclusions(index)).map(s => s.artist)).toEqual(
      ['the onion']
    );
    await service.setExcluded(['the onion'], true);
    expect(await service.suggestExclusions(index)).toEqual([]);
  });

  describe('suggestAlbums', () => {
    const gbvIndex = (): ScrobbleHistoryIndex => ({
      lastSyncTimestamp: 0,
      totalScrobbles: 0,
      oldestScrobbleDate: 0,
      albums: {
        'guided by voices|bee thousand': {
          lastPlayed: 5,
          playCount: 3,
          plays: [
            { timestamp: 1, track: 'Tractor Rape Chain' },
            { timestamp: 2, track: 'Tractor Rape Chain' },
            { timestamp: 3, track: 'Gold Star for Robot Boy' },
          ],
        },
        'guided by voices|human amusements at hourly rates': {
          lastPlayed: 6,
          playCount: 1,
          plays: [{ timestamp: 6, track: 'Tractor Rape Chain (Remastered)' }],
        },
        'gbv|alien lanes': {
          lastPlayed: 7,
          playCount: 1,
          plays: [{ timestamp: 7, track: 'Game of Pricks' }],
        },
      },
      unresolved: {
        'guided by voices': {
          lastPlayed: 30,
          playCount: 5,
          plays: [
            { timestamp: 10, track: 'Tractor Rape Chain' },
            { timestamp: 11, track: 'Game of Pricks' },
            { timestamp: 12, track: 'I Am A Scientist' },
            { timestamp: 13, track: 'Unknown Demo' },
            { timestamp: 14, track: 'Hidden Song' },
          ],
        },
      },
    });

    it('suggests the album each song was played on most, with alternatives and fallbacks', async () => {
      const { storage } = memoryStorage();
      const service = new UnresolvedHistoryService(storage);
      await service.setHidden(['guided by voices|hidden song'], true);

      const result = await service.suggestAlbums(
        gbvIndex(),
        'Guided By Voices',
        {
          displayName: () => 'Guided By Voices',
          isSameArtist: other => other === 'gbv',
          ownedReleases: async () => [
            { title: 'Bee Thousand', tracks: ['Tractor Rape Chain'] },
            {
              title: 'Bee Thousand (Director’s Cut)',
              tracks: ['I Am A Scientist'],
            },
          ],
        }
      );
      const byTrack = Object.fromEntries(result.tracks.map(t => [t.track, t]));

      // Most plays: Bee Thousand (2) over Human Amusements (1, remaster tag ignored)
      expect(byTrack['Tractor Rape Chain'].suggestion).toEqual({
        album: 'Bee Thousand',
        source: 'history',
        trackPlays: 2,
      });
      expect(byTrack['Tractor Rape Chain'].alternatives).toEqual([
        {
          album: 'Human Amusements At Hourly Rates',
          source: 'history',
          trackPlays: 1,
        },
      ]);
      // Found under an alias of the artist
      expect(byTrack['Game of Pricks'].suggestion?.album).toBe('Alien Lanes');
      // Only on an owned release
      expect(byTrack['I Am A Scientist'].suggestion).toEqual({
        album: 'Bee Thousand (Director’s Cut)',
        source: 'collection',
        trackPlays: 0,
      });
      expect(byTrack['Unknown Demo'].suggestion).toBeNull();
      expect(byTrack['Hidden Song']).toBeUndefined();
    });

    it('returns no tracks for an artist with nothing unresolved', async () => {
      const { storage } = memoryStorage();
      const service = new UnresolvedHistoryService(storage);
      const result = await service.suggestAlbums(gbvIndex(), 'nobody');
      expect(result.tracks).toEqual([]);
    });

    it('trackMatchKey ignores version tags, feat. credits and punctuation', () => {
      expect(trackMatchKey('Tractor Rape Chain - 2011 Remaster')).toBe(
        trackMatchKey('tractor rape chain')
      );
      expect(trackMatchKey('Song (feat. Someone)')).toBe(trackMatchKey('Song'));
      expect(trackMatchKey('Don’t Stop')).toBe(trackMatchKey("Don't Stop"));
      expect(trackMatchKey('Song (Live)')).not.toBe(trackMatchKey('Song'));
    });
  });
});
