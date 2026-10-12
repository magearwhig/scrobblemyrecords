import MockAdapter from 'axios-mock-adapter';

import ApiService from '../../../src/renderer/services/api';

const DATA = { marker: 'payload' };
const envelope = { success: true, data: DATA };

describe('ApiService unresolved history methods', () => {
  let api: ApiService;
  let mock: MockAdapter;

  beforeEach(() => {
    api = new ApiService('http://localhost:3001');
    mock = new MockAdapter((api as any).api);
  });

  afterEach(() => {
    mock.restore();
  });

  const lastRequest = (verb: 'get' | 'post' | 'delete') => {
    const history = mock.history[verb];
    expect(history.length).toBe(1);
    return history[0];
  };

  it('getUnresolvedHistory GETs the list with query params', async () => {
    mock.onGet('/stats/unresolved-history').reply(200, envelope);

    const result = await api.getUnresolvedHistory({
      search: 'beat',
      sort: 'recent',
      page: 2,
      limit: 25,
      includeHidden: true,
    });

    expect(result).toEqual(DATA);
    expect(lastRequest('get').params).toEqual({
      search: 'beat',
      sort: 'recent',
      page: 2,
      limit: 25,
      includeHidden: true,
    });
  });

  it('getUnresolvedHistory omits unset params', async () => {
    mock.onGet('/stats/unresolved-history').reply(200, envelope);

    await api.getUnresolvedHistory();

    expect(lastRequest('get').params).toEqual({});
  });

  it('getUnresolvedHistorySummary GETs the summary', async () => {
    mock.onGet('/stats/unresolved-history/summary').reply(200, envelope);

    await expect(api.getUnresolvedHistorySummary()).resolves.toEqual(DATA);
  });

  it('lookupUnresolvedAlbum POSTs artist and track', async () => {
    mock.onPost('/stats/unresolved-history/lookup').reply(200, {
      success: true,
      data: { album: 'Abbey Road' },
    });

    const result = await api.lookupUnresolvedAlbum('The Beatles', 'Something');

    expect(result).toEqual({ album: 'Abbey Road' });
    expect(JSON.parse(lastRequest('post').data)).toEqual({
      artist: 'The Beatles',
      track: 'Something',
    });
  });

  it('lookupUnresolvedAlbum returns the tracklist verification', async () => {
    const lookup = {
      album: 'Suitcase 2',
      verification: {
        onTracklist: false,
        trackCount: 100,
        imageUrl: 'https://img.example/suitcase2.jpg',
        albumUrl: 'https://www.last.fm/music/Guided+By+Voices/Suitcase+2',
      },
    };
    mock
      .onPost('/stats/unresolved-history/lookup')
      .reply(200, { success: true, data: lookup });

    await expect(
      api.lookupUnresolvedAlbum('Guided By Voices', 'Motor Away')
    ).resolves.toEqual(lookup);
  });

  it('getUnresolvedAlbumSuggestions GETs suggestions for an artist', async () => {
    mock
      .onGet('/stats/unresolved-history/album-suggestions')
      .reply(200, envelope);

    const result = await api.getUnresolvedAlbumSuggestions('guided by voices', {
      includeHidden: true,
    });

    expect(result).toEqual(DATA);
    expect(lastRequest('get').params).toEqual({
      artist: 'guided by voices',
      includeHidden: true,
    });
  });

  it('getUnresolvedAlbumSuggestions omits includeHidden when unset', async () => {
    mock
      .onGet('/stats/unresolved-history/album-suggestions')
      .reply(200, envelope);

    await api.getUnresolvedAlbumSuggestions('guided by voices');

    expect(lastRequest('get').params).toEqual({ artist: 'guided by voices' });
  });

  it('matchUnresolvedFromDiscogsAlbum POSTs artist, url and includeHidden', async () => {
    mock
      .onPost('/stats/unresolved-history/discogs-album-match')
      .reply(200, envelope);

    const result = await api.matchUnresolvedFromDiscogsAlbum(
      'john vanderslice',
      'https://www.discogs.com/master/123',
      { includeHidden: true }
    );

    expect(result).toEqual(DATA);
    expect(JSON.parse(lastRequest('post').data)).toEqual({
      artist: 'john vanderslice',
      url: 'https://www.discogs.com/master/123',
      includeHidden: true,
    });
  });

  it('matchUnresolvedFromDiscogsAlbum omits includeHidden when unset and rejects on 400', async () => {
    mock
      .onPost('/stats/unresolved-history/discogs-album-match')
      .reply(400, { success: false, error: 'Paste a Discogs link' });

    await expect(
      api.matchUnresolvedFromDiscogsAlbum('john vanderslice', 'nope')
    ).rejects.toMatchObject({
      response: { status: 400, data: { error: 'Paste a Discogs link' } },
    });
    expect(JSON.parse(lastRequest('post').data)).toEqual({
      artist: 'john vanderslice',
      url: 'nope',
    });
  });

  it('getUnresolvedResolutions GETs the rules', async () => {
    mock.onGet('/stats/unresolved-history/resolutions').reply(200, envelope);

    await expect(api.getUnresolvedResolutions()).resolves.toEqual(DATA);
  });

  it('saveUnresolvedResolutions POSTs { resolutions }', async () => {
    mock.onPost('/stats/unresolved-history/resolutions').reply(200, envelope);
    const resolutions = [
      { artist: 'A', track: 'T', album: 'Al', source: 'user' as const },
    ];

    await api.saveUnresolvedResolutions(resolutions);

    expect(JSON.parse(lastRequest('post').data)).toEqual({ resolutions });
  });

  it('deleteUnresolvedResolution DELETEs by id', async () => {
    mock
      .onDelete('/stats/unresolved-history/resolutions/rule-1')
      .reply(200, { success: true, data: { removed: true } });

    await expect(api.deleteUnresolvedResolution('rule-1')).resolves.toEqual({
      removed: true,
    });
  });

  it('hideUnresolvedTracks POSTs keys to /hide', async () => {
    mock.onPost('/stats/unresolved-history/hide').reply(200, envelope);

    await api.hideUnresolvedTracks(['a|t']);

    expect(JSON.parse(lastRequest('post').data)).toEqual({ keys: ['a|t'] });
  });

  it('unhideUnresolvedTracks POSTs keys to /unhide', async () => {
    mock.onPost('/stats/unresolved-history/unhide').reply(200, envelope);

    await api.unhideUnresolvedTracks(['a|t']);

    expect(JSON.parse(lastRequest('post').data)).toEqual({ keys: ['a|t'] });
  });

  it('startHistoryBackfill POSTs the range (empty for a full run)', async () => {
    mock.onPost('/suggestions/history/sync/backfill').reply(200, envelope);

    await api.startHistoryBackfill();

    expect(JSON.parse(lastRequest('post').data)).toEqual({});
  });

  it('startHistoryBackfill passes from/to and rejects on 409', async () => {
    mock
      .onPost('/suggestions/history/sync/backfill')
      .reply(409, { success: false, error: 'A sync is already in progress' });

    await expect(
      api.startHistoryBackfill({ from: 100, to: 200 })
    ).rejects.toMatchObject({ response: { status: 409 } });
    expect(JSON.parse(lastRequest('post').data)).toEqual({
      from: 100,
      to: 200,
    });
  });

  it('getExcludedHistoryArtists GETs the excluded artists', async () => {
    mock
      .onGet('/stats/unresolved-history/excluded-artists')
      .reply(200, envelope);

    await expect(api.getExcludedHistoryArtists()).resolves.toEqual(DATA);
  });

  it('excludeHistoryArtists POSTs normalized artist keys', async () => {
    mock
      .onPost('/stats/unresolved-history/excluded-artists')
      .reply(200, { success: true, data: { changed: 2 } });

    const result = await api.excludeHistoryArtists(['the daily', 'radiolab']);

    expect(result).toEqual({ changed: 2 });
    expect(JSON.parse(lastRequest('post').data)).toEqual({
      artists: ['the daily', 'radiolab'],
    });
  });

  it('includeHistoryArtists POSTs to the remove endpoint', async () => {
    mock
      .onPost('/stats/unresolved-history/excluded-artists/remove')
      .reply(200, { success: true, data: { changed: 1 } });

    const result = await api.includeHistoryArtists(['the daily']);

    expect(result).toEqual({ changed: 1 });
    const request = lastRequest('post');
    expect(request.url).toBe(
      '/stats/unresolved-history/excluded-artists/remove'
    );
    expect(JSON.parse(request.data)).toEqual({ artists: ['the daily'] });
  });

  it('getHistoryExclusionSuggestions GETs the suggestions', async () => {
    mock
      .onGet('/stats/unresolved-history/exclusion-suggestions')
      .reply(200, envelope);

    await expect(api.getHistoryExclusionSuggestions()).resolves.toEqual(DATA);
  });
});
