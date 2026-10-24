import express from 'express';
import request from 'supertest';

import createLookupRouter from '../../../src/backend/routes/lookup';
import { RecordLookupService } from '../../../src/backend/services/recordLookupService';

describe('Lookup routes', () => {
  const check = jest.fn();
  const app = express();
  app.use(
    '/api/v1/lookup',
    createLookupRouter({ check } as unknown as RecordLookupService)
  );

  beforeEach(() => check.mockReset());

  it('checks the query', async () => {
    check.mockResolvedValue({ query: 'cake', groups: [] });

    const res = await request(app).get('/api/v1/lookup/check?q=%20cake%20');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { query: 'cake', groups: [] },
    });
    expect(check).toHaveBeenCalledWith('cake');
  });

  it('rejects an empty query', async () => {
    const res = await request(app).get('/api/v1/lookup/check?q=%20');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(check).not.toHaveBeenCalled();
  });

  it('reports a failure', async () => {
    check.mockRejectedValue(new Error('cache unreadable'));

    const res = await request(app).get('/api/v1/lookup/check?q=cake');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'cache unreadable' });
  });
});
