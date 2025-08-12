import request from 'supertest';

import app from '../../src/server';

describe('API Integration Tests', () => {
  describe('API Health and Status', () => {
    it('should return API health status', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('version');
    });

    it('should return API v1 root endpoint', async () => {
      const response = await request(app).get('/api/v1').expect(200);

      expect(response.body).toHaveProperty(
        'message',
        'Discogs to Last.fm Scrobbler API'
      );
      expect(response.body).toHaveProperty('version', '1.0.0');
    });

    it('should handle 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/api/v1/unknown-endpoint')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'Route not found');
    });

    it('should handle malformed JSON requests', async () => {
      const response = await request(app)
        .post('/api/v1/scrobble/track')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('Authentication Flow Integration', () => {
    it('should handle complete authentication flow', async () => {
      // Step 1: Check initial auth status
      const statusResponse = await request(app)
        .get('/api/v1/auth/status')
        .expect(200);

      expect(statusResponse.body).toHaveProperty('success', true);
      expect(statusResponse.body.data).toHaveProperty('discogs');
      expect(statusResponse.body.data).toHaveProperty('lastfm');

      // Step 2: Get Discogs auth URL
      const authUrlResponse = await request(app)
        .get('/api/v1/auth/discogs/auth-url')
        .expect(200);

      expect(authUrlResponse.body).toHaveProperty('success', true);
      expect(authUrlResponse.body.data).toHaveProperty('authUrl');
      expect(authUrlResponse.body.data.authUrl).toContain('discogs.com');

      // Step 3: Test Discogs connection (should fail without proper credentials)
      const testResponse = await request(app)
        .get('/api/v1/auth/discogs/test')
        .expect(500);

      expect(testResponse.body).toHaveProperty('success', false);
    });

    it('should handle Last.fm authentication flow', async () => {
      // Step 1: Get Last.fm auth URL
      const authUrlResponse = await request(app)
        .get('/api/v1/auth/lastfm/auth-url')
        .expect(200);

      expect(authUrlResponse.body).toHaveProperty('success', true);
      expect(authUrlResponse.body.data).toHaveProperty('authUrl');
      expect(authUrlResponse.body.data.authUrl).toContain('last.fm');

      // Step 2: Test Last.fm connection (should fail without proper credentials)
      const testResponse = await request(app)
        .get('/api/v1/auth/lastfm/test')
        .expect(500);

      expect(testResponse.body).toHaveProperty('success', false);
    });

    it('should handle authentication clearing', async () => {
      const response = await request(app)
        .post('/api/v1/auth/clear')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('Collection Management Integration', () => {
    it('should handle collection operations with invalid username', async () => {
      const invalidUsername = 'invalid..username';

      // Test collection retrieval with invalid username
      const collectionResponse = await request(app)
        .get(`/api/v1/collection/${invalidUsername}`)
        .expect(400);

      expect(collectionResponse.body).toHaveProperty('success', false);
      expect(collectionResponse.body).toHaveProperty(
        'error',
        'Invalid username format'
      );

      // Test collection search with invalid username
      const searchResponse = await request(app)
        .get(`/api/v1/collection/${invalidUsername}/search`)
        .expect(400);

      expect(searchResponse.body).toHaveProperty('success', false);
      expect(searchResponse.body).toHaveProperty(
        'error',
        'Invalid username format'
      );

      // Test cache operations with invalid username
      const cacheResponse = await request(app)
        .get(`/api/v1/collection/${invalidUsername}/check-new`)
        .expect(400);

      expect(cacheResponse.body).toHaveProperty('success', false);
      expect(cacheResponse.body).toHaveProperty(
        'error',
        'Invalid username format'
      );
    });

    it('should handle collection operations with valid username', async () => {
      const validUsername = 'testuser';

      // Test collection retrieval (should fail without authentication)
      const collectionResponse = await request(app)
        .get(`/api/v1/collection/${validUsername}`)
        .expect(500);

      expect(collectionResponse.body).toHaveProperty('success', false);

      // Test collection search (should fail without authentication)
      const searchResponse = await request(app)
        .get(`/api/v1/collection/${validUsername}/search?q=test`)
        .expect(500);

      expect(searchResponse.body).toHaveProperty('success', false);

      // Test cache operations (should fail without authentication)
      const cacheResponse = await request(app)
        .get(`/api/v1/collection/${validUsername}/check-new`)
        .expect(500);

      expect(cacheResponse.body).toHaveProperty('success', false);
    });

    it('should handle cache management operations', async () => {
      // Test cache clearing
      const clearResponse = await request(app)
        .delete('/api/v1/collection/cache')
        .expect(200);

      expect(clearResponse.body).toHaveProperty('success', true);
    });

    it('should handle release details retrieval', async () => {
      const releaseId = '12345';

      // Test release details retrieval (should fail without authentication)
      const response = await request(app)
        .get(`/api/v1/collection/release/${releaseId}`)
        .expect(500);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('Scrobbling Integration', () => {
    it('should handle single track scrobbling', async () => {
      const track = {
        artist: 'Test Artist',
        track: 'Test Track',
        album: 'Test Album',
        timestamp: Math.floor(Date.now() / 1000),
      };

      // Test single track scrobbling (should fail without authentication)
      const response = await request(app)
        .post('/api/v1/scrobble/track')
        .send(track)
        .expect(500);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should handle batch scrobbling', async () => {
      const tracks = [
        {
          artist: 'Test Artist 1',
          track: 'Test Track 1',
          album: 'Test Album 1',
          timestamp: Math.floor(Date.now() / 1000),
        },
        {
          artist: 'Test Artist 2',
          track: 'Test Track 2',
          album: 'Test Album 2',
          timestamp: Math.floor(Date.now() / 1000) + 180,
        },
      ];

      // Test batch scrobbling (should fail without authentication)
      const response = await request(app)
        .post('/api/v1/scrobble/batch')
        .send({ tracks })
        .expect(500);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should handle track preparation from release', async () => {
      const release = {
        title: 'Test Album',
        artist: 'Test Artist',
        year: 2020,
        tracklist: [
          { position: 'A1', title: 'Track 1', duration: '3:30' },
          { position: 'A2', title: 'Track 2', duration: '4:15' },
        ],
      };

      const response = await request(app)
        .post('/api/v1/scrobble/prepare-from-release')
        .send({ release })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('tracks');
      expect(response.body.data).toHaveProperty('release');
      expect(response.body.data).toHaveProperty('startTime');
      expect(response.body.data).toHaveProperty('totalDuration');
      expect(response.body.data.tracks).toHaveLength(2);
    });

    it('should handle scrobble history retrieval', async () => {
      // Test scrobble history retrieval (should fail without authentication)
      const response = await request(app)
        .get('/api/v1/scrobble/history')
        .expect(500);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should handle scrobble session retrieval', async () => {
      const sessionId = 'test-session-123';

      // Test session retrieval (should return 404 for non-existent session)
      const response = await request(app)
        .get(`/api/v1/scrobble/session/${sessionId}`)
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'Session not found');
    });

    it('should handle invalid session ID format', async () => {
      const invalidSessionId = 'invalid..session..id';

      const response = await request(app)
        .get(`/api/v1/scrobble/session/${invalidSessionId}`)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty(
        'error',
        'Invalid session ID format'
      );
    });

    it('should handle scrobble progress retrieval', async () => {
      const sessionId = 'test-session-123';

      // Test progress retrieval (should return 404 for non-existent session)
      const response = await request(app)
        .get(`/api/v1/scrobble/progress/${sessionId}`)
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error', 'Session not found');
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle missing required fields in requests', async () => {
      // Test missing artist and track in scrobble request
      const response = await request(app)
        .post('/api/v1/scrobble/track')
        .send({ artist: 'Test Artist' })
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty(
        'error',
        'Artist and track are required'
      );
    });

    it('should handle empty batch scrobble requests', async () => {
      const response = await request(app)
        .post('/api/v1/scrobble/batch')
        .send({ tracks: [] })
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty(
        'error',
        'Tracks array is required and must not be empty'
      );
    });

    it('should handle invalid release data in track preparation', async () => {
      const response = await request(app)
        .post('/api/v1/scrobble/prepare-from-release')
        .send({ release: { title: 'Test Album' } })
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty(
        'error',
        'Release with tracklist is required'
      );
    });

    it('should handle malformed request bodies', async () => {
      const response = await request(app)
        .post('/api/v1/scrobble/track')
        .set('Content-Type', 'application/json')
        .send('{"artist": "Test Artist", "track":}')
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('Rate Limiting and Performance', () => {
    it('should handle multiple concurrent requests', async () => {
      const requests = Array.from({ length: 5 }, () =>
        request(app).get('/api/v1/auth/status')
      );

      const responses = await Promise.all(requests);

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
      });
    });

    it('should handle large request bodies', async () => {
      const largeTracks = Array.from({ length: 100 }, (_, i) => ({
        artist: `Artist ${i}`,
        track: `Track ${i}`,
        album: `Album ${i}`,
        timestamp: Math.floor(Date.now() / 1000) + i * 180,
      }));

      const response = await request(app)
        .post('/api/v1/scrobble/batch')
        .send({ tracks: largeTracks })
        .expect(500); // Should fail without authentication

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('CORS and Headers', () => {
    it('should include proper CORS headers', async () => {
      const response = await request(app)
        .get('/api/v1/auth/status')
        .set('Origin', 'http://localhost:3000')
        .expect(200);

      expect(response.headers).toHaveProperty('access-control-allow-origin');
      expect(response.headers).toHaveProperty(
        'access-control-allow-credentials'
      );
    });

    it('should handle preflight requests', async () => {
      const response = await request(app)
        .options('/api/v1/scrobble/track')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type')
        .expect(200);

      expect(response.headers).toHaveProperty('access-control-allow-origin');
      expect(response.headers).toHaveProperty('access-control-allow-methods');
      expect(response.headers).toHaveProperty('access-control-allow-headers');
    });
  });
});
