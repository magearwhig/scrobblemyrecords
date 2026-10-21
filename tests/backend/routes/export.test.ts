import express from 'express';
import request from 'supertest';

import createExportRouter from '../../../src/backend/routes/export';
import { ExportDataService } from '../../../src/backend/services/exportDataService';
import { ExportSnapshotMeta } from '../../../src/shared/types';

const META: ExportSnapshotMeta = {
  schemaVersion: 1,
  generatedAt: '2026-10-20T12:00:00Z',
  collectionCachedAt: null,
  collectionCache: {
    status: 'missing',
    pagesExpected: null,
    pagesRead: 0,
    itemsExpected: null,
    itemsRead: 0,
    oldestPageAt: null,
    newestPageAt: null,
  },
  wishlistUpdatedAt: null,
  historySyncedAt: null,
  discogsUsername: 'collector',
};

describe('Export routes', () => {
  let service: jest.Mocked<Pick<ExportDataService, 'getSnapshotMeta'>>;

  const createApp = (extraRoutes?: (router: express.Router) => void) => {
    const app = express();
    app.use(
      '/api/v1/export',
      createExportRouter(service as unknown as ExportDataService, extraRoutes)
    );
    return app;
  };

  beforeEach(() => {
    service = { getSnapshotMeta: jest.fn().mockResolvedValue(META) };
  });

  it('returns the snapshot meta', async () => {
    const res = await request(createApp()).get('/api/v1/export/meta');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: META });
  });

  it('returns 500 when the meta cannot be built', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    service.getSnapshotMeta.mockRejectedValue(new Error('boom'));

    const res = await request(createApp()).get('/api/v1/export/meta');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'boom' });
    jest.restoreAllMocks();
  });

  it('registers extra routes on the same router', async () => {
    const app = createApp(router => {
      router.get('/pocket-list', (_req, res) => {
        res.json({ success: true, data: 'pocket' });
      });
    });

    const res = await request(app).get('/api/v1/export/pocket-list');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: 'pocket' });
  });
});
