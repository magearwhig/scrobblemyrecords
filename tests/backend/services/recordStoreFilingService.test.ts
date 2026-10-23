import {
  ARTIST_FILING_CACHE_FILE,
  ARTIST_FILING_OVERRIDES_FILE,
  FilingOverrideError,
  MASTER_YEAR_CACHE_FILE,
  RecordStoreFilingService,
} from '../../../src/backend/services/filing/recordStoreFilingService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';
import {
  ArtistFilingCacheStore,
  ArtistMbidMapping,
  ExportCollectionRow,
  ExportWishlistRow,
  MasterYearCacheStore,
  MusicBrainzArtistMatch,
} from '../../../src/shared/types';

const NOW = 1_800_000_000_000;

let seq = 0;
function coll(
  artistDisplay: string,
  o: Partial<ExportCollectionRow> = {}
): ExportCollectionRow {
  const id = ++seq;
  return {
    rowId: `discogs-collection:${id}:1`,
    source: 'discogs-collection',
    releaseId: id,
    masterId: null,
    masterIdSource: null,
    copyIndex: 1,
    copyCount: 1,
    artistRaw: artistDisplay,
    artistDisplay,
    artistIdentityKey: artistDisplay.toLowerCase(),
    albumNameKey: `${artistDisplay}|${id}`,
    title: `Album ${id}`,
    year: null,
    formats: ['Vinyl'],
    labels: [],
    catalogNumbers: [],
    genres: null,
    styles: null,
    rating: null,
    mediaCondition: null,
    sleeveCondition: null,
    notes: null,
    customFields: [],
    dateAdded: null,
    dateAddedUnix: null,
    dateAddedRaw: '',
    coverImageUrl: null,
    ...o,
  };
}

function localWant(
  artistDisplay: string,
  o: Partial<ExportWishlistRow> = {}
): ExportWishlistRow {
  const id = ++seq;
  return {
    rowId: `local-want:${id}`,
    source: 'local-want',
    releaseId: null,
    masterId: null,
    masterIdSource: null,
    artistRaw: artistDisplay,
    artistDisplay,
    artistIdentityKey: null,
    albumNameKey: `${artistDisplay}|${id}`,
    title: `Want ${id}`,
    year: null,
    formats: [],
    labels: [],
    catalogNumbers: [],
    notes: null,
    priority: null,
    dateAdded: null,
    dateAddedUnix: null,
    dateAddedRaw: 0,
    vinylStatus: 'unknown',
    lowestVinylPrice: null,
    priceCurrency: null,
    playCount: 1,
    ownedMatch: 'not-owned',
    ownedMatchConfidence: null,
    ownedCollectionRowIds: [],
    ownedCollectionLinks: [],
    relatedWishlistLinks: [],
    searchMasterIdCandidate: null,
    coverImageUrl: null,
    ...o,
  };
}

const mb = (
  name: string,
  sortName: string,
  o: Partial<MusicBrainzArtistMatch> = {}
): MusicBrainzArtistMatch => ({
  mbid: `mbid:${name}:${sortName}`,
  name,
  sortName,
  type: 'Person',
  score: 100,
  ...o,
});

const mapping = (
  discogsArtistName: string,
  mbid: string | null,
  confirmedBy: 'auto' | 'user' = 'auto'
): ArtistMbidMapping => ({
  discogsArtistName,
  normalizedName: discogsArtistName.toLowerCase(),
  mbid,
  confirmedAt: 0,
  confirmedBy,
});

describe('RecordStoreFilingService', () => {
  let files: Record<string, unknown>;
  let collection: ExportCollectionRow[];
  let wishlist: ExportWishlistRow[];
  let mappings: ArtistMbidMapping[];
  let search: Record<
    string,
    { artists: MusicBrainzArtistMatch[]; count?: number }
  >;
  let byId: Record<string, MusicBrainzArtistMatch>;
  let masterYears: Record<number, number | null>;
  let musicBrainz: {
    getArtistById: jest.Mock;
    searchArtistWithCount: jest.Mock;
  };
  let masters: { getMasterYear: jest.Mock };
  let fileStorage: {
    readJSON: jest.Mock;
    writeJSON: jest.Mock;
    writeJSONWithBackup: jest.Mock;
  };

  const createService = () =>
    new RecordStoreFilingService(
      fileStorage as unknown as FileStorage,
      {
        getCollectionRows: async () => collection,
        getWishlistRows: async () => wishlist,
      },
      musicBrainz,
      masters,
      { getArtistMappings: async () => mappings },
      { now: () => NOW }
    );

  const refresh = async (
    service: RecordStoreFilingService,
    options: { full?: boolean } = {}
  ) => {
    service.startRefresh(options);
    await service.waitForRefresh();
  };

  const artistCache = () =>
    (files[ARTIST_FILING_CACHE_FILE] as ArtistFilingCacheStore).entries;

  beforeEach(() => {
    files = {};
    collection = [];
    wishlist = [];
    mappings = [];
    search = {};
    byId = {};
    masterYears = {};
    const write = jest.fn(async (path: string, data: unknown) => {
      files[path] = JSON.parse(JSON.stringify(data));
    });
    fileStorage = {
      readJSON: jest.fn(async (path: string) =>
        files[path] === undefined
          ? null
          : JSON.parse(JSON.stringify(files[path]))
      ),
      writeJSON: write,
      writeJSONWithBackup: write,
    };
    musicBrainz = {
      getArtistById: jest.fn(async (id: string) => byId[id] ?? null),
      searchArtistWithCount: jest.fn(async (name: string) => {
        const key = Object.keys(search).find(
          k => k.toLowerCase() === name.toLowerCase()
        );
        const hit = (key && search[key]) || { artists: [] };
        return { artists: hit.artists, count: hit.count ?? hit.artists.length };
      }),
    };
    masters = {
      getMasterYear: jest.fn(async (id: number) => {
        if (!(id in masterYears)) throw new Error('network down');
        return masterYears[id];
      }),
    };
  });

  describe('lookupArtist', () => {
    it('respects a user\'s "none of these" without asking MusicBrainz', async () => {
      const entry = await createService().lookupArtist(
        'Girls',
        mapping('Girls', null, 'user')
      );
      expect(entry).toMatchObject({ status: 'none' });
      expect(musicBrainz.getArtistById).not.toHaveBeenCalled();
      expect(musicBrainz.searchArtistWithCount).not.toHaveBeenCalled();
    });

    it('uses a tracker mapping whose canonical name matches', async () => {
      byId['mbid-wp'] = mb('The Wedding Present', 'Wedding Present, The', {
        type: 'Group',
      });
      const entry = await createService().lookupArtist(
        'The Wedding Present',
        mapping('The Wedding Present', 'mbid-wp')
      );
      expect(entry).toMatchObject({
        status: 'found',
        sortName: 'Wedding Present, The',
        type: 'Group',
        mbid: 'mbid-wp',
        via: 'mbid-map',
      });
      expect(musicBrainz.searchArtistWithCount).not.toHaveBeenCalled();
    });

    it('distrusts an automatic mapping to a different name, but trusts the user', async () => {
      byId['mbid-x'] = mb('Somebody Else', 'Else, Somebody');
      search['Band'] = { artists: [mb('Band', 'Band', { type: 'Group' })] };

      const service = createService();
      await expect(
        service.lookupArtist('Band', mapping('Band', 'mbid-x'))
      ).resolves.toMatchObject({ sortName: 'Band', via: 'search' });
      await expect(
        service.lookupArtist('Band', mapping('Band', 'mbid-x', 'user'))
      ).resolves.toMatchObject({ sortName: 'Else, Somebody', via: 'mbid-map' });
    });

    it('accepts one exact search hit and records its mbid', async () => {
      search['Elliott Smith'] = {
        artists: [
          mb('Elliott Smith', 'Smith, Elliott'),
          mb('Elliott Smith Tribute', 'Elliott Smith Tribute'),
        ],
      };
      await expect(
        createService().lookupArtist('elliott smith', undefined)
      ).resolves.toMatchObject({
        status: 'found',
        sortName: 'Smith, Elliott',
        mbid: 'mbid:Elliott Smith:Smith, Elliott',
        via: 'search',
      });
    });

    it('accepts several exact hits that agree, without picking an mbid', async () => {
      search['Low'] = {
        artists: [
          mb('Low', 'Low', { mbid: 'a', type: 'Group' }),
          mb('Low', 'Low', { mbid: 'b', type: 'Group' }),
        ],
      };
      await expect(
        createService().lookupArtist('Low', undefined)
      ).resolves.toMatchObject({
        status: 'found',
        sortName: 'Low',
        mbid: null,
      });
    });

    it('calls disagreeing exact hits ambiguous', async () => {
      search['Girls'] = {
        artists: [
          mb('Girls', 'Girls', { type: 'Group' }),
          mb('Girls', 'Girls', { type: 'Person' }),
        ],
      };
      await expect(
        createService().lookupArtist('Girls', undefined)
      ).resolves.toMatchObject({ status: 'ambiguous' });
    });

    it('calls a cut-off list of exact hits ambiguous', async () => {
      search['Common'] = {
        artists: [mb('Common', 'Common')],
        count: 40,
      };
      await expect(
        createService().lookupArtist('Common', undefined)
      ).resolves.toMatchObject({ status: 'ambiguous' });
    });

    it('ignores alias-only hits', async () => {
      search['Bobby'] = { artists: [mb('Robert Smith', 'Smith, Robert')] };
      await expect(
        createService().lookupArtist('Bobby', undefined)
      ).resolves.toMatchObject({ status: 'not-found' });
    });
  });

  describe('refresh', () => {
    it('fills both caches, skips Various and never refetches what it has', async () => {
      collection = [
        coll('Elliott Smith', { masterId: 11, masterIdSource: 'release-data' }),
        coll('Various', { masterId: 12, masterIdSource: 'release-data' }),
        coll('Elliott Smith (2)'),
      ];
      wishlist = [
        localWant('Modest Mouse', {
          masterId: 99,
          masterIdSource: 'search-guess',
        }),
      ];
      search['Elliott Smith'] = {
        artists: [mb('Elliott Smith', 'Smith, Elliott')],
      };
      search['Modest Mouse'] = {
        artists: [mb('Modest Mouse', 'Modest Mouse', { type: 'Group' })],
      };
      masterYears = { 11: 1997, 12: null };

      const service = createService();
      await refresh(service);

      expect(Object.keys(artistCache()).sort()).toEqual([
        'elliott smith',
        'modest mouse',
      ]);
      // Confirmed masters only; a local want's search guess is never fetched
      expect(
        (files[MASTER_YEAR_CACHE_FILE] as MasterYearCacheStore).entries
      ).toEqual({
        '11': { year: 1997, fetchedAt: NOW },
        '12': { year: null, fetchedAt: NOW },
      });
      const status = await service.getStatus();
      expect(status.job).toMatchObject({
        running: false,
        artistsDone: 2,
        artistsTotal: 2,
        mastersDone: 2,
        mastersTotal: 2,
        failures: 0,
      });
      expect(status.artists).toEqual({
        total: 2,
        musicbrainz: 2,
        override: 0,
        unmatched: 0,
        missing: 0,
      });
      expect(status.masters).toEqual({ total: 2, cached: 2, missing: 0 });

      musicBrainz.searchArtistWithCount.mockClear();
      masters.getMasterYear.mockClear();
      await refresh(service);
      expect(musicBrainz.searchArtistWithCount).not.toHaveBeenCalled();
      expect(masters.getMasterYear).not.toHaveBeenCalled();

      await refresh(service, { full: true });
      expect(musicBrainz.searchArtistWithCount).toHaveBeenCalledTimes(2);
      expect(masters.getMasterYear).toHaveBeenCalledTimes(2);
    });

    it('looks up the first artist of a not-found collaboration', async () => {
      collection = [coll('Lou Reed, John Cale')];
      search['Lou Reed'] = { artists: [mb('Lou Reed', 'Reed, Lou')] };

      const service = createService();
      await refresh(service);

      expect(artistCache()['lou reed, john cale'].status).toBe('not-found');
      expect(artistCache()['lou reed']).toMatchObject({
        sortName: 'Reed, Lou',
      });
      const [row] = await service.listArtists();
      expect(row).toMatchObject({
        artist: 'Lou Reed, John Cale',
        fileUnder: 'Reed, Lou',
        filedAs: 'Lou Reed',
        section: 'R',
        source: 'musicbrainz',
        lookup: 'not-found',
      });
    });

    it('does not cache failures and stops a queue after five in a row', async () => {
      collection = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(name => coll(name));
      musicBrainz.searchArtistWithCount.mockRejectedValue(new Error('offline'));

      const service = createService();
      await refresh(service);

      const status = await service.getStatus();
      expect(status.job.failures).toBe(5);
      expect(status.job.error).toMatch(/MusicBrainz is not responding/);
      expect(files[ARTIST_FILING_CACHE_FILE]).toBeUndefined();
      expect(status.artists.missing).toBe(7);
    });

    it('saves what it has when cancelled', async () => {
      collection = ['A', 'B', 'C'].map(name => coll(name));
      for (const name of ['A', 'B', 'C']) {
        search[name] = { artists: [mb(name, name)] };
      }
      const service = createService();
      musicBrainz.searchArtistWithCount.mockImplementationOnce(async name => {
        service.cancel();
        return { artists: search[name].artists, count: 1 };
      });

      await refresh(service);

      expect(Object.keys(artistCache())).toEqual(['a']);
      expect((await service.getStatus()).job.cancelled).toBe(true);
    });

    it('holds the lock until both queues settle when a cache write fails', async () => {
      collection = [coll('A', { masterId: 1, masterIdSource: 'release-data' })];
      search['A'] = { artists: [mb('A', 'A')] };
      let releaseMaster: (year: number) => void = () => undefined;
      masters.getMasterYear.mockImplementation(
        () => new Promise<number>(resolve => (releaseMaster = resolve))
      );
      fileStorage.writeJSON.mockImplementation(async (path: string) => {
        if (path === ARTIST_FILING_CACHE_FILE) throw new Error('disk full');
      });

      const service = createService();
      service.startRefresh();
      // Let the artist queue fail while the master lookup is still pending
      for (let i = 0; i < 20; i++) await Promise.resolve();
      expect(service.isRunning()).toBe(true);
      expect(() => service.startRefresh()).toThrow(/already running/);

      releaseMaster(1990);
      await service.waitForRefresh();
      expect(service.isRunning()).toBe(false);
      expect((await service.getStatus()).job.error).toBe('disk full');
    });

    it('counts an artist whose tracker mapping changed as missing', async () => {
      collection = [coll('Band')];
      mappings = [mapping('Band', 'mbid-old')];
      byId['mbid-old'] = mb('Band', 'Band, The', { type: 'Group' });
      const service = createService();
      await refresh(service);
      expect((await service.getStatus()).artists.musicbrainz).toBe(1);

      mappings = [mapping('Band', 'mbid-new')];
      const status = await service.getStatus();
      expect(status.artists).toMatchObject({ musicbrainz: 0, missing: 1 });
      const [row] = await service.listArtists();
      expect(row.lookup).toBe('missing');
    });

    it('allows one refresh at a time', async () => {
      collection = [coll('A')];
      const service = createService();
      service.startRefresh();
      expect(service.isRunning()).toBe(true);
      expect(() => service.startRefresh()).toThrow(/already running/);
      await service.waitForRefresh();
      expect(service.isRunning()).toBe(false);
      expect(service.cancel()).toBe(false);
    });
  });

  describe('overrides and the artist list', () => {
    it('saves, applies and removes an override', async () => {
      collection = [coll('Alice Cooper'), coll('Abba')];
      const service = createService();

      const saved = await service.setOverride(
        'Alice Cooper (2)',
        ' Cooper, Alice '
      );
      expect(saved).toMatchObject({
        key: 'alice cooper',
        artist: 'Alice Cooper',
        fileUnder: 'Cooper, Alice',
        updatedAt: NOW,
      });
      expect(fileStorage.writeJSONWithBackup).toHaveBeenCalledWith(
        ARTIST_FILING_OVERRIDES_FILE,
        expect.objectContaining({ schemaVersion: 1 })
      );

      let rows = await service.listArtists();
      expect(rows.map(r => [r.artist, r.section, r.source])).toEqual([
        ['Abba', 'A', 'default'],
        ['Alice Cooper', 'C', 'override'],
      ]);
      expect(rows[1]).toMatchObject({
        override: 'Cooper, Alice',
        lookup: 'missing',
        count: 1,
      });
      expect((await service.getSnapshot()).overrides.size).toBe(1);

      await expect(service.setOverride('Alice Cooper', '')).resolves.toBeNull();
      rows = await service.listArtists();
      expect(rows.map(r => r.artist)).toEqual(['Abba', 'Alice Cooper']);
      expect((await service.getStatus()).artists.override).toBe(0);
    });

    it('keeps both of two overrides saved at the same time', async () => {
      const service = createService();
      await Promise.all([
        service.setOverride('Alice Cooper', 'Cooper, Alice'),
        service.setOverride('Bob Dylan', 'Dylan, Bob'),
      ]);
      expect([...(await service.getSnapshot()).overrides.keys()]).toEqual([
        'alice cooper',
        'bob dylan',
      ]);
    });

    it('rejects a missing artist or an overlong value', async () => {
      const service = createService();
      await expect(service.setOverride('  ', 'X')).rejects.toBeInstanceOf(
        FilingOverrideError
      );
      await expect(
        service.setOverride('Band', 'x'.repeat(201))
      ).rejects.toBeInstanceOf(FilingOverrideError);
    });

    it('lists artists in filing order with counts across both lists', async () => {
      collection = [coll('Elliott Smith'), coll('Elliott Smith'), coll('Beck')];
      wishlist = [localWant('Modest Mouse'), localWant('Various Artists')];
      search['Elliott Smith'] = {
        artists: [mb('Elliott Smith', 'Smith, Elliott')],
      };
      search['Girls'] = { artists: [] };
      const service = createService();
      await refresh(service);

      const rows = await service.listArtists();
      expect(
        rows.map(r => [r.artist, r.fileUnder, r.section, r.count])
      ).toEqual([
        ['Beck', 'Beck', 'B', 1],
        ['Modest Mouse', 'Modest Mouse', 'M', 1],
        ['Elliott Smith', 'Smith, Elliott', 'S', 2],
      ]);
      expect(rows[0]).toMatchObject({ lookup: 'not-found', type: null });
      expect(rows[2]).toMatchObject({ lookup: 'found', type: 'Person' });
      expect((await service.getStatus()).artists).toEqual({
        total: 3,
        musicbrainz: 1,
        override: 0,
        unmatched: 2,
        missing: 0,
      });
    });
  });
});
