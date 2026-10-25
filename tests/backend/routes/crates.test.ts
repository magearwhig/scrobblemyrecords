import express from 'express';
import request from 'supertest';

import createCratesRouter from '../../../src/backend/routes/crates';
import {
  CrateError,
  CrateService,
} from '../../../src/backend/services/crateService';
import { CRATE_TEMPLATES } from '../../../src/shared/crateTemplates';

const ID = '3f2b8c1e-7a4d-4c2b-9e1f-0a1b2c3d4e5f';

describe('Crates routes', () => {
  let app: express.Application;
  let service: jest.Mocked<
    Pick<
      CrateService,
      | 'summaries'
      | 'createCrate'
      | 'preview'
      | 'cratesForRelease'
      | 'releaseRuntimes'
      | 'evaluate'
      | 'updateCrate'
      | 'deleteCrate'
      | 'setOverride'
      | 'clearOverrides'
      | 'removeStaleOverrides'
    >
  >;

  beforeEach(() => {
    service = {
      summaries: jest.fn().mockResolvedValue([]),
      createCrate: jest.fn().mockResolvedValue({ id: ID, name: 'New' }),
      preview: jest.fn().mockResolvedValue({ crateId: null, albums: [] }),
      cratesForRelease: jest.fn().mockResolvedValue([]),
      releaseRuntimes: jest.fn().mockResolvedValue({ 7: 2400 }),
      evaluate: jest.fn().mockResolvedValue({ crate: { id: ID } }),
      updateCrate: jest.fn().mockResolvedValue({ id: ID }),
      deleteCrate: jest.fn().mockResolvedValue(undefined),
      setOverride: jest.fn().mockResolvedValue({ id: ID }),
      clearOverrides: jest.fn().mockResolvedValue({ id: ID }),
      removeStaleOverrides: jest.fn().mockResolvedValue({ id: ID }),
    };
    app = express();
    app.use(express.json());
    app.use(
      '/api/v1/crates',
      createCratesRouter(service as unknown as CrateService)
    );
  });

  it('lists crate summaries', async () => {
    service.summaries.mockResolvedValue([{ id: ID } as never]);
    const res = await request(app).get('/api/v1/crates');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [{ id: ID }] });
  });

  it('returns release runtimes', async () => {
    const res = await request(app).get('/api/v1/crates/release-runtimes');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { 7: 2400 } });
  });

  it('returns the templates', async () => {
    const res = await request(app).get('/api/v1/crates/templates');
    expect(res.body.data).toEqual(CRATE_TEMPLATES);
  });

  it('creates a crate with 201', async () => {
    const body = { name: 'New', rules: [], sort: 'artist' };
    const res = await request(app).post('/api/v1/crates').send(body);
    expect(res.status).toBe(201);
    expect(service.createCrate).toHaveBeenCalledWith(
      expect.objectContaining(body)
    );
  });

  it('passes validation errors through as 400 with details', async () => {
    service.createCrate.mockRejectedValue(
      new CrateError('Invalid rules', 400, ['rule 1: unknown field'])
    );
    const res = await request(app)
      .post('/api/v1/crates')
      .send({ name: 'x', rules: [{}] });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: 'Invalid rules',
      details: ['rule 1: unknown field'],
    });
  });

  it('rejects a non-string sourceSuggestionKey', async () => {
    const res = await request(app)
      .post('/api/v1/crates')
      .send({ name: 'x', rules: [], sourceSuggestionKey: 5 });
    expect(res.status).toBe(400);
    expect(service.createCrate).not.toHaveBeenCalled();
  });

  it('previews unsaved rules without needing a saved crate', async () => {
    const res = await request(app)
      .post('/api/v1/crates/preview')
      .send({ rules: [], sort: 'artist' });
    expect(res.status).toBe(200);
    expect(service.preview).toHaveBeenCalledWith({ rules: [], sort: 'artist' });
  });

  it('finds crates for a release and validates the id', async () => {
    expect(
      (await request(app).get('/api/v1/crates/for-release/42')).status
    ).toBe(200);
    expect(service.cratesForRelease).toHaveBeenCalledWith(42);
    expect(
      (await request(app).get('/api/v1/crates/for-release/abc')).status
    ).toBe(400);
  });

  it('answers 401 without a Discogs user', async () => {
    service.summaries.mockRejectedValue(
      new CrateError('Discogs authentication required', 401)
    );
    expect((await request(app).get('/api/v1/crates')).status).toBe(401);
  });

  it('rejects non-UUID ids', async () => {
    expect((await request(app).get('/api/v1/crates/not-a-uuid')).status).toBe(
      400
    );
    expect(service.evaluate).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown crate', async () => {
    service.evaluate.mockRejectedValue(new CrateError('Crate not found', 404));
    expect((await request(app).get(`/api/v1/crates/${ID}`)).status).toBe(404);
  });

  it('updates and deletes a crate', async () => {
    const put = await request(app)
      .put(`/api/v1/crates/${ID}`)
      .send({ name: 'Renamed', pinnedToWhatToPlay: true });
    expect(put.status).toBe(200);
    expect(service.updateCrate).toHaveBeenCalledWith(
      ID,
      expect.objectContaining({ name: 'Renamed', pinnedToWhatToPlay: true })
    );
    expect((await request(app).delete(`/api/v1/crates/${ID}`)).status).toBe(
      200
    );
    expect(service.deleteCrate).toHaveBeenCalledWith(ID);
  });

  it('sets and clears overrides', async () => {
    await request(app)
      .post(`/api/v1/crates/${ID}/overrides`)
      .send({ releaseIds: [1, 2], action: 'exclude' });
    expect(service.setOverride).toHaveBeenCalledWith(ID, [1, 2], 'exclude');

    await request(app)
      .delete(`/api/v1/crates/${ID}/overrides`)
      .send({ releaseIds: [1] });
    expect(service.clearOverrides).toHaveBeenCalledWith(ID, [1]);
  });

  it('removes stale overrides, or 409 while the collection loads', async () => {
    expect(
      (await request(app).delete(`/api/v1/crates/${ID}/overrides/stale`)).status
    ).toBe(200);
    service.removeStaleOverrides.mockRejectedValue(
      new CrateError('still loading', 409)
    );
    expect(
      (await request(app).delete(`/api/v1/crates/${ID}/overrides/stale`)).status
    ).toBe(409);
  });

  it('turns unexpected errors into 500', async () => {
    service.summaries.mockRejectedValue(new Error('boom'));
    const res = await request(app).get('/api/v1/crates');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('boom');
  });

  it('lets extra routes register before /:id', async () => {
    const withExtra = express();
    withExtra.use(
      '/api/v1/crates',
      createCratesRouter(service as unknown as CrateService, router => {
        router.get('/suggestions', (_req, res) => res.json({ ok: true }));
      })
    );
    const res = await request(withExtra).get('/api/v1/crates/suggestions');
    expect(res.body).toEqual({ ok: true });
  });
});
