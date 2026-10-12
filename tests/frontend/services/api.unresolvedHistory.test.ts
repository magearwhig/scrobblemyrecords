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
});
