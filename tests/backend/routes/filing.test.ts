import express from 'express';
import request from 'supertest';

import createFilingRouter from '../../../src/backend/routes/filing';
import {
  FilingOverrideError,
  RecordStoreFilingService,
} from '../../../src/backend/services/filing/recordStoreFilingService';
import {
  ArtistFilingRow,
  RecordStoreFilingJobStatus,
  RecordStoreFilingStatus,
} from '../../../src/shared/types';

const JOB: RecordStoreFilingJobStatus = {
  running: true,
  startedAt: 1,
  finishedAt: null,
  artistsDone: 0,
  artistsTotal: 10,
  mastersDone: 0,
  mastersTotal: 20,
  failures: 0,
  cancelled: false,
  error: null,
};

const STATUS: RecordStoreFilingStatus = {
  artists: { total: 3, musicbrainz: 1, override: 1, unmatched: 0, missing: 1 },
  masters: { total: 2, cached: 1, missing: 1 },
  job: { ...JOB, running: false },
};

const ROW: ArtistFilingRow = {
  artist: 'Elliott Smith',
  key: 'elliott smith',
  fileUnder: 'Smith, Elliott',
  section: 'S',
  source: 'musicbrainz',
  filedAs: null,
  lookup: 'found',
  type: 'Person',
  override: null,
  count: 4,
};

describe('Filing routes', () => {
  let service: {
    getStatus: jest.Mock;
    startRefresh: jest.Mock;
    cancel: jest.Mock;
    listArtists: jest.Mock;
    setOverride: jest.Mock;
    isRunning: jest.Mock;
  };

  const createApp = () => {
    const app = express();
    app.use(express.json());
    app.use(
      '/api/v1/filing',
      createFilingRouter(service as unknown as RecordStoreFilingService)
    );
    return app;
  };

  beforeEach(() => {
    service = {
      getStatus: jest.fn().mockResolvedValue(STATUS),
      startRefresh: jest.fn().mockReturnValue(JOB),
      cancel: jest.fn().mockReturnValue(true),
      listArtists: jest.fn().mockResolvedValue([ROW]),
      setOverride: jest.fn().mockResolvedValue(null),
      isRunning: jest.fn().mockReturnValue(false),
    };
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns the status', async () => {
    const res = await request(createApp()).get('/api/v1/filing/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: STATUS });
  });

  it('returns 500 when the status cannot be read', async () => {
    service.getStatus.mockRejectedValue(new Error('disk'));
    const res = await request(createApp()).get('/api/v1/filing/status');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'disk' });
  });

  it('starts a refresh, passing full only when it is literally true', async () => {
    let res = await request(createApp())
      .post('/api/v1/filing/refresh')
      .send({ full: true });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(JOB);
    expect(service.startRefresh).toHaveBeenLastCalledWith({ full: true });

    res = await request(createApp())
      .post('/api/v1/filing/refresh')
      .send({ full: 'yes' });
    expect(service.startRefresh).toHaveBeenLastCalledWith({ full: false });

    res = await request(createApp()).post('/api/v1/filing/refresh');
    expect(res.status).toBe(200);
    expect(service.startRefresh).toHaveBeenLastCalledWith({ full: false });
  });

  it('returns 409 while a refresh is running', async () => {
    service.isRunning.mockReturnValue(true);
    const res = await request(createApp()).post('/api/v1/filing/refresh');
    expect(res.status).toBe(409);
    expect(service.startRefresh).not.toHaveBeenCalled();
  });

  it('cancels', async () => {
    const res = await request(createApp()).post('/api/v1/filing/cancel');
    expect(res.body).toEqual({ success: true, data: { cancelled: true } });
  });

  it('lists artists', async () => {
    const res = await request(createApp()).get('/api/v1/filing/artists');
    expect(res.body).toEqual({ success: true, data: [ROW] });
  });

  it('saves an override', async () => {
    const saved = {
      key: 'alice cooper',
      artist: 'Alice Cooper',
      fileUnder: 'Cooper, Alice',
      updatedAt: 5,
    };
    service.setOverride.mockResolvedValue(saved);
    const res = await request(createApp())
      .put('/api/v1/filing/overrides')
      .send({ artist: 'Alice Cooper', fileUnder: 'Cooper, Alice' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: saved });
    expect(service.setOverride).toHaveBeenCalledWith(
      'Alice Cooper',
      'Cooper, Alice'
    );
  });

  it('rejects a malformed override with 400', async () => {
    let res = await request(createApp())
      .put('/api/v1/filing/overrides')
      .send({ artist: 'Alice Cooper' });
    expect(res.status).toBe(400);
    expect(service.setOverride).not.toHaveBeenCalled();

    service.setOverride.mockRejectedValue(
      new FilingOverrideError('artist is required')
    );
    res = await request(createApp())
      .put('/api/v1/filing/overrides')
      .send({ artist: ' ', fileUnder: 'X' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('artist is required');
  });
});
