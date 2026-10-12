import express from 'express';
import request from 'supertest';

import createUnresolvedHistoryRouter, {
  parseDiscogsAlbumUrl,
} from '../../../src/backend/routes/unresolvedHistory';
import { ScrobbleHistoryStorage } from '../../../src/backend/services/scrobbleHistoryStorage';
import { UnresolvedHistoryService } from '../../../src/backend/services/unresolvedHistoryService';

describe('unresolved history routes', () => {
  const index = {
    lastSyncTimestamp: 0,
    totalScrobbles: 1,
    oldestScrobbleDate: 0,
    albums: {},
    unresolved: {
      a: { lastPlayed: 1, playCount: 1, plays: [{ timestamp: 1, track: 'x' }] },
    },
  };
  let service: jest.Mocked<UnresolvedHistoryService>;
  let historyStorage: jest.Mocked<ScrobbleHistoryStorage>;
  let stats: {
    invalidateStatsCache: jest.Mock;
    warmCache: jest.Mock;
    clearForgottenFavoritesCache: jest.Mock;
  };
  let app: express.Express;

  beforeEach(() => {
    service = {
      listGroups: jest.fn().mockResolvedValue({
        groups: [],
        total: 0,
        page: 1,
        limit: 50,
      }),
      getSummary: jest.fn().mockResolvedValue({ unresolvedCount: 1 }),
      lookupAlbum: jest.fn().mockResolvedValue({
        album: 'Album',
        verification: { onTracklist: true, position: 3 },
      }),
      getStore: jest
        .fn()
        .mockResolvedValue({ schemaVersion: 1, resolutions: [], hidden: [] }),
      addResolutions: jest.fn().mockResolvedValue([{ id: 'r1' }]),
      removeResolution: jest.fn().mockResolvedValue(true),
      setHidden: jest.fn().mockResolvedValue(1),
      listExcluded: jest
        .fn()
        .mockResolvedValue([{ artist: 'a', artistName: 'A', plays: 1 }]),
      setExcluded: jest.fn().mockResolvedValue(1),
      suggestExclusions: jest.fn().mockResolvedValue([]),
      matchAlbumTracklist: jest
        .fn()
        .mockResolvedValue({ album: 'Live', matches: [], unmatchedCount: 0 }),
      suggestAlbums: jest
        .fn()
        .mockResolvedValue({ artist: 'a', artistName: 'A', tracks: [] }),
    } as unknown as jest.Mocked<UnresolvedHistoryService>;
    historyStorage = {
      getIndex: jest.fn().mockResolvedValue(index),
      getRawIndex: jest.fn().mockResolvedValue(index),
      getExclusionView: jest.fn().mockResolvedValue(index),
      getExclusionMatcher: jest.fn().mockResolvedValue(null),
      invalidateCache: jest.fn(),
    } as unknown as jest.Mocked<ScrobbleHistoryStorage>;
    stats = {
      invalidateStatsCache: jest.fn().mockResolvedValue(undefined),
      warmCache: jest.fn().mockResolvedValue(undefined),
      clearForgottenFavoritesCache: jest.fn(),
    };
    app = express();
    app.use(express.json());
    app.use(
      '/api/v1/stats/unresolved-history',
      createUnresolvedHistoryRouter(
        service,
        historyStorage,
        stats,
        () => (artist: string) => artist.toUpperCase()
      )
    );
  });

  it('lists groups with query options and display names', async () => {
    const response = await request(app).get(
      '/api/v1/stats/unresolved-history?search=cure&sort=recent&page=2&limit=10&includeHidden=true'
    );

    expect(response.status).toBe(200);
    const [passedIndex, options] = service.listGroups.mock.calls[0];
    expect(passedIndex).toBe(index);
    expect(options).toMatchObject({
      search: 'cure',
      sort: 'recent',
      page: 2,
      limit: 10,
      includeHidden: true,
    });
    expect(options!.displayName!('a')).toBe('A');
  });

  it('rejects an unknown sort', async () => {
    const response = await request(app).get(
      '/api/v1/stats/unresolved-history?sort=random'
    );
    expect(response.status).toBe(400);
  });

  it('summarizes from the raw and resolved index', async () => {
    const response = await request(app).get(
      '/api/v1/stats/unresolved-history/summary'
    );
    expect(response.body.data).toEqual({ unresolvedCount: 1 });
    expect(service.getSummary).toHaveBeenCalledWith(index, index, index);
  });

  it('saves resolutions and refreshes the index and stats', async () => {
    const response = await request(app)
      .post('/api/v1/stats/unresolved-history/resolutions')
      .send({
        resolutions: [
          {
            artist: 'a',
            track: 'x',
            album: 'Album',
            source: 'lastfm-track-info',
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.data.saved).toEqual([{ id: 'r1' }]);
    expect(historyStorage.invalidateCache).toHaveBeenCalled();
    expect(stats.clearForgottenFavoritesCache).toHaveBeenCalled();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(stats.invalidateStatsCache).toHaveBeenCalled();
    expect(stats.warmCache).toHaveBeenCalled();
  });

  it.each([
    [{}],
    [{ resolutions: [] }],
    [{ resolutions: [{ artist: 'a', track: 'x' }] }],
    [
      {
        resolutions: [{ artist: 'a', track: 'x', album: 'A', source: 'guess' }],
      },
    ],
  ])('rejects invalid resolutions %j', async body => {
    const response = await request(app)
      .post('/api/v1/stats/unresolved-history/resolutions')
      .send(body);
    expect(response.status).toBe(400);
    expect(service.addResolutions).not.toHaveBeenCalled();
  });

  it('removes a resolution and refreshes', async () => {
    const response = await request(app).delete(
      '/api/v1/stats/unresolved-history/resolutions/r1'
    );
    expect(response.body.data).toEqual({ removed: true });
    expect(historyStorage.invalidateCache).toHaveBeenCalled();
  });

  it('hides and unhides keys without touching stats', async () => {
    await request(app)
      .post('/api/v1/stats/unresolved-history/hide')
      .send({ keys: ['a|x'] });
    await request(app)
      .post('/api/v1/stats/unresolved-history/unhide')
      .send({ keys: ['a|x'] });

    expect(service.setHidden).toHaveBeenCalledWith(['a|x'], true);
    expect(service.setHidden).toHaveBeenCalledWith(['a|x'], false);
    expect(historyStorage.invalidateCache).not.toHaveBeenCalled();
    const bad = await request(app)
      .post('/api/v1/stats/unresolved-history/hide')
      .send({ keys: [] });
    expect(bad.status).toBe(400);
  });

  it('looks up an album suggestion', async () => {
    const response = await request(app)
      .post('/api/v1/stats/unresolved-history/lookup')
      .send({ artist: 'a', track: 'x' });
    expect(response.body.data).toEqual({
      album: 'Album',
      verification: { onTracklist: true, position: 3 },
    });
    const bad = await request(app)
      .post('/api/v1/stats/unresolved-history/lookup')
      .send({ artist: 'a' });
    expect(bad.status).toBe(400);
  });

  it('excludes and restores artists and refreshes stats', async () => {
    const exclude = await request(app)
      .post('/api/v1/stats/unresolved-history/excluded-artists')
      .send({ artists: ['the onion'] });
    const restore = await request(app)
      .post('/api/v1/stats/unresolved-history/excluded-artists/remove')
      .send({ artists: ['the onion'] });

    expect(exclude.body.data).toEqual({ changed: 1 });
    expect(restore.status).toBe(200);
    expect(service.setExcluded).toHaveBeenCalledWith(['the onion'], true);
    expect(service.setExcluded).toHaveBeenCalledWith(['the onion'], false);
    expect(historyStorage.invalidateCache).toHaveBeenCalledTimes(2);

    const bad = await request(app)
      .post('/api/v1/stats/unresolved-history/excluded-artists')
      .send({ artists: [''] });
    expect(bad.status).toBe(400);
  });

  it('lists excluded artists from the raw index and suggestions from the view', async () => {
    const list = await request(app).get(
      '/api/v1/stats/unresolved-history/excluded-artists'
    );
    await request(app).get(
      '/api/v1/stats/unresolved-history/exclusion-suggestions'
    );

    expect(list.body.data).toEqual([
      { artist: 'a', artistName: 'A', plays: 1 },
    ]);
    expect(service.listExcluded.mock.calls[0][0]).toBe(index);
    expect(historyStorage.getRawIndex).toHaveBeenCalled();
    expect(service.suggestExclusions).toHaveBeenCalled();
  });

  it('suggests albums for an artist, passing alias and owned-release lookups', async () => {
    const ownedReleases = jest
      .fn()
      .mockResolvedValue([{ title: 'T', tracks: ['x'] }]);
    const appWithExtras = express();
    appWithExtras.use(express.json());
    appWithExtras.use(
      '/u',
      createUnresolvedHistoryRouter(
        service,
        historyStorage,
        stats,
        () => undefined,
        {
          getSameArtist: () => (a, b) =>
            a === 'gbv' && b === 'guided by voices',
          ownedReleases,
        }
      )
    );

    const response = await request(appWithExtras).get(
      '/u/album-suggestions?artist=Guided%20By%20Voices&includeHidden=true'
    );

    expect(response.status).toBe(200);
    const [passedIndex, artist, options] = service.suggestAlbums.mock.calls[0];
    expect(passedIndex).toBe(index);
    expect(artist).toBe('guided by voices');
    expect(options!.includeHidden).toBe(true);
    expect(options!.isSameArtist!('gbv')).toBe(true);
    await options!.ownedReleases!();
    const isArtist = ownedReleases.mock.calls[0][0];
    expect(isArtist('GBV')).toBe(true);
    expect(isArtist('Pavement')).toBe(false);

    const missing = await request(app).get(
      '/api/v1/stats/unresolved-history/album-suggestions'
    );
    expect(missing.status).toBe(400);
  });

  it.each([
    [
      'https://www.discogs.com/master/1750039-John-Vanderslice-Live-at-The-Casbah',
      { kind: 'master', id: 1750039 },
    ],
    [
      'https://www.discogs.com/release/15419351',
      { kind: 'release', id: 15419351 },
    ],
    [
      'https://www.discogs.com/fr/release/15419351-Some-Title',
      { kind: 'release', id: 15419351 },
    ],
    ['m1750039', { kind: 'master', id: 1750039 }],
    ['discogs.com/master/42', { kind: 'master', id: 42 }],
    ['https://www.discogs.com/artist/123', null],
    ['https://notdiscogs.com/master/123', null],
    ['https://example.com/?u=discogs.com/master/123', null],
    ['https://www.discogs.com/master/123abc', null],
    ['https://www.discogs.com/master/99999999999999999999', null],
    ['not a link', null],
  ])('parses Discogs album link %s', (input, expected) => {
    expect(parseDiscogsAlbumUrl(input)).toEqual(expected);
  });

  it('matches an artist against a Discogs album link', async () => {
    const album = { title: 'Live', artist: 'JV', tracks: [] };
    const fetchDiscogsAlbum = jest.fn().mockResolvedValue(album);
    const appWithDiscogs = express();
    appWithDiscogs.use(express.json());
    appWithDiscogs.use(
      '/u',
      createUnresolvedHistoryRouter(
        service,
        historyStorage,
        stats,
        () => undefined,
        {
          fetchDiscogsAlbum,
        }
      )
    );

    const ok = await request(appWithDiscogs)
      .post('/u/discogs-album-match')
      .send({
        artist: 'john vanderslice',
        url: 'https://www.discogs.com/master/1750039',
      });
    const badLink = await request(appWithDiscogs)
      .post('/u/discogs-album-match')
      .send({ artist: 'a', url: 'https://example.com' });
    fetchDiscogsAlbum.mockResolvedValueOnce(null);
    const missing = await request(appWithDiscogs)
      .post('/u/discogs-album-match')
      .send({ artist: 'a', url: 'r1' });
    const unavailable = await request(app)
      .post('/api/v1/stats/unresolved-history/discogs-album-match')
      .send({ artist: 'a', url: 'r1' });

    expect(ok.status).toBe(200);
    expect(fetchDiscogsAlbum).toHaveBeenCalledWith('master', 1750039);
    expect(service.matchAlbumTracklist).toHaveBeenCalledWith(
      index,
      'john vanderslice',
      album,
      { includeHidden: false }
    );
    expect(badLink.status).toBe(400);
    expect(missing.status).toBe(404);
    expect(unavailable.status).toBe(503);
  });

  it('reports why Discogs could not load an album', async () => {
    const fetchDiscogsAlbum = jest.fn();
    const appWithDiscogs = express();
    appWithDiscogs.use(express.json());
    appWithDiscogs.use(
      '/u',
      createUnresolvedHistoryRouter(
        service,
        historyStorage,
        stats,
        () => undefined,
        { fetchDiscogsAlbum }
      )
    );
    const send = () =>
      request(appWithDiscogs)
        .post('/u/discogs-album-match')
        .send({ artist: 'a', url: 'r1' });

    fetchDiscogsAlbum.mockRejectedValueOnce({ response: { status: 429 } });
    const limited = await send();
    fetchDiscogsAlbum.mockRejectedValueOnce({ response: { status: 401 } });
    const unauthorized = await send();
    fetchDiscogsAlbum.mockRejectedValueOnce(new Error('ECONNRESET'));
    const network = await send();

    expect(limited.status).toBe(502);
    expect(limited.body.error).toMatch(/rate limiting/);
    expect(unauthorized.body.error).toMatch(/Settings/);
    expect(network.status).toBe(502);
    expect(network.body.error).toMatch(/Could not reach Discogs/);
  });
});
