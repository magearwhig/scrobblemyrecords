import express from 'express';
import request from 'supertest';

import { requireApiToken } from '../../../src/backend/middleware/requireApiToken';

describe('requireApiToken', () => {
  const token = 'x'.repeat(64);
  let app: express.Express;
  let warnings: unknown[][];

  beforeEach(() => {
    warnings = [];
    app = express();
    app.use(requireApiToken(token));
    app.get('/health', (_req, res) => res.json({ status: 'ok' }));
    app.get('/api/v1/collection', (_req, res) => res.json({ secret: true }));
    app.post('/api/v1/settings', (_req, res) => res.json({ saved: true }));
    app.get('/api/v1/auth/discogs/callback', (_req, res) =>
      res.send('discogs callback')
    );
    app.get('/api/v1/auth/lastfm/callback', (_req, res) =>
      res.send('lastfm callback')
    );
    app.post('/api/v1/auth/lastfm/callback', (_req, res) =>
      res.send('legacy callback')
    );
    void warnings;
  });

  describe('rejects', () => {
    it('a request with no Authorization header', async () => {
      const res = await request(app).get('/api/v1/collection').expect(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('a wrong token', async () => {
      await request(app)
        .get('/api/v1/collection')
        .set('Authorization', `Bearer ${'y'.repeat(64)}`)
        .expect(401);
    });

    it('a token that is a prefix of the real one', async () => {
      await request(app)
        .get('/api/v1/collection')
        .set('Authorization', `Bearer ${'x'.repeat(63)}`)
        .expect(401);
    });

    it('a token with trailing junk', async () => {
      await request(app)
        .get('/api/v1/collection')
        .set('Authorization', `Bearer ${token}extra`)
        .expect(401);
    });

    it.each([
      ['no scheme', token],
      ['wrong scheme', `Basic ${token}`],
      ['empty bearer', 'Bearer '],
      ['scheme only', 'Bearer'],
    ])('a malformed header (%s)', async (_label, header) => {
      await request(app)
        .get('/api/v1/collection')
        .set('Authorization', header)
        .expect(401);
    });

    it('an oversized header without hashing it', async () => {
      await request(app)
        .get('/api/v1/collection')
        .set('Authorization', `Bearer ${'z'.repeat(9000)}`)
        .expect(401);
    });

    it('writes to a protected route', async () => {
      await request(app).post('/api/v1/settings').expect(401);
    });

    it('the legacy POST callback, which our own frontend calls', async () => {
      await request(app).post('/api/v1/auth/lastfm/callback').expect(401);
    });
  });

  describe('accepts', () => {
    it('a correct token', async () => {
      const res = await request(app)
        .get('/api/v1/collection')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body.secret).toBe(true);
    });

    it('a lowercase bearer scheme', async () => {
      await request(app)
        .get('/api/v1/collection')
        .set('Authorization', `bearer ${token}`)
        .expect(200);
    });
  });

  describe('exemptions', () => {
    it('allows /health without a token', async () => {
      await request(app).get('/health').expect(200);
    });

    it('allows a genuine CORS preflight without a token', async () => {
      app.options('/api/v1/collection', (_req, res) => res.sendStatus(204));
      await request(app)
        .options('/api/v1/collection')
        .set('Access-Control-Request-Method', 'GET')
        .expect(204);
    });

    it('does not exempt an OPTIONS request that is not a preflight', async () => {
      // Otherwise adding any state-changing OPTIONS handler later would create
      // a bypass.
      app.options('/api/v1/collection', (_req, res) => res.sendStatus(204));
      await request(app).options('/api/v1/collection').expect(401);
    });

    it('does not exempt a non-GET request to /health', async () => {
      app.post('/health', (_req, res) => res.json({ mutated: true }));
      await request(app).post('/health').expect(401);
    });

    it.each(['/api/v1/auth/discogs/callback', '/api/v1/auth/lastfm/callback'])(
      'allows the GET OAuth callback %s',
      async path => {
        // Exempt because the browser arrives by redirect and cannot send a
        // header. Safety comes from the one-use transaction binding, which is
        // tested against the real routes in the auth route tests.
        await request(app).get(path).expect(200);
      }
    );

    it('does not exempt a path merely containing a callback path', async () => {
      app.get('/api/v1/auth/discogs/callback/extra', (_req, res) =>
        res.send('nested')
      );
      await request(app).get('/api/v1/auth/discogs/callback/extra').expect(401);
    });
  });

  describe('secrecy', () => {
    it('never echoes the expected token in a rejection', async () => {
      const res = await request(app)
        .get('/api/v1/collection')
        .set('Authorization', 'Bearer wrong')
        .expect(401);

      expect(JSON.stringify(res.body)).not.toContain(token);
      expect(res.text).not.toContain(token);
    });
  });
});
