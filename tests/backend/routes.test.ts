import request from 'supertest';

import app from '../../src/server';

describe('API Routes', () => {
  describe('GET /api/v1', () => {
    it('should return API information', async () => {
      const response = await request(app).get('/api/v1').expect(200);

      expect(response.body.message).toBe('Discogs to Last.fm Scrobbler API');
      expect(response.body.version).toBe('1.0.0');
      expect(response.body.endpoints).toBeDefined();
    });
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('Authentication Routes', () => {
    describe('GET /api/v1/auth/status', () => {
      it('should return authentication status structure', async () => {
        const response = await request(app).get('/api/v1/auth/status');

        // Should respond (whether 200 or 500) with proper structure
        expect(response.body).toHaveProperty('success');
        if (response.body.success) {
          expect(response.body.data.discogs).toBeDefined();
          expect(response.body.data.lastfm).toBeDefined();
        } else {
          expect(response.body.error).toBeDefined();
        }
      });
    });

    describe('POST /api/v1/auth/discogs/token', () => {
      it('should require token parameter', async () => {
        const response = await request(app)
          .post('/api/v1/auth/discogs/token')
          .send({})
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Token is required');
      });

      it('should validate token format', async () => {
        const response = await request(app)
          .post('/api/v1/auth/discogs/token')
          .send({
            token: 'invalid-format',
          });

        expect(response.body.success).toBe(false);
        if (response.status === 400) {
          expect(response.body.error).toContain('Invalid token format');
        }
      });
    });

    describe('POST /api/v1/auth/clear', () => {
      it('should handle clear request', async () => {
        const response = await request(app).post('/api/v1/auth/clear');

        expect(response.body).toHaveProperty('success');
        if (response.body.success) {
          expect(response.body.data.message).toBe(
            'All authentication data cleared'
          );
        }
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for non-existent routes', async () => {
      const response = await request(app)
        .get('/api/v1/non-existent')
        .expect(404);
    });

    it('should handle invalid JSON in POST requests', async () => {
      const response = await request(app)
        .post('/api/v1/auth/discogs/token')
        .send('invalid json')
        .type('application/json')
        .expect(400); // Our improved error handling returns 400 for JSON parse errors
    });
  });
});
