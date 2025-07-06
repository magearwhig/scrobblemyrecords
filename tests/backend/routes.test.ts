import request from 'supertest';
import app from '../../src/server';
import * as fs from 'fs/promises';
import path from 'path';

// Use a separate test data directory
const testDataDir = './test-data-routes';

describe('API Routes', () => {
  beforeAll(async () => {
    // Clean up test data directory
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors if directory doesn't exist
    }
    
    // Set test environment
    process.env.TEST_DATA_DIR = testDataDir;
  });

  afterAll(async () => {
    // Clean up test data directory
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors
    }
  });

  describe('GET /api/v1', () => {
    it('should return API information', async () => {
      const response = await request(app)
        .get('/api/v1')
        .expect(200);
      
      expect(response.body.message).toBe('Discogs to Last.fm Scrobbler API');
      expect(response.body.version).toBe('1.0.0');
      expect(response.body.endpoints).toBeDefined();
    });
  });

  describe('Authentication Routes', () => {
    describe('GET /api/v1/auth/status', () => {
      it('should return authentication status', async () => {
        const response = await request(app)
          .get('/api/v1/auth/status')
          .expect(200);
        
        expect(response.body.success).toBe(true);
        expect(response.body.data.discogs).toBeDefined();
        expect(response.body.data.lastfm).toBeDefined();
      });
    });

    describe('POST /api/v1/auth/discogs/token', () => {
      it('should save Discogs token', async () => {
        const response = await request(app)
          .post('/api/v1/auth/discogs/token')
          .send({
            token: 'Discogs token=test-token',
            username: 'testuser'
          })
          .expect(200);
        
        expect(response.body.success).toBe(true);
        expect(response.body.data.message).toBe('Discogs token saved successfully');
      });

      it('should reject invalid token format', async () => {
        const response = await request(app)
          .post('/api/v1/auth/discogs/token')
          .send({
            token: 'invalid-token-format'
          })
          .expect(400);
        
        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('Invalid token format');
      });

      it('should require token', async () => {
        const response = await request(app)
          .post('/api/v1/auth/discogs/token')
          .send({})
          .expect(400);
        
        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Token is required');
      });
    });

    describe('POST /api/v1/auth/clear', () => {
      it('should clear all authentication data', async () => {
        const response = await request(app)
          .post('/api/v1/auth/clear')
          .expect(200);
        
        expect(response.body.success).toBe(true);
        expect(response.body.data.message).toBe('All authentication data cleared');
      });
    });
  });

  describe('Scrobble Routes', () => {
    describe('POST /api/v1/scrobble/track', () => {
      it('should validate required track fields', async () => {
        const response = await request(app)
          .post('/api/v1/scrobble/track')
          .send({
            artist: 'Test Artist'
            // Missing track field
          })
          .expect(400);
        
        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Artist and track are required');
      });
    });

    describe('POST /api/v1/scrobble/batch', () => {
      it('should validate tracks array', async () => {
        const response = await request(app)
          .post('/api/v1/scrobble/batch')
          .send({
            tracks: []
          })
          .expect(400);
        
        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Tracks array is required and must not be empty');
      });

      it('should validate track fields in batch', async () => {
        const response = await request(app)
          .post('/api/v1/scrobble/batch')
          .send({
            tracks: [
              { artist: 'Test Artist' } // Missing track field
            ]
          })
          .expect(400);
        
        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('All tracks must have artist and track fields');
      });
    });

    describe('GET /api/v1/scrobble/history', () => {
      it('should return scrobble history', async () => {
        const response = await request(app)
          .get('/api/v1/scrobble/history')
          .expect(200);
        
        expect(response.body.success).toBe(true);
        expect(Array.isArray(response.body.data)).toBe(true);
      });
    });

    describe('POST /api/v1/scrobble/prepare-from-release', () => {
      it('should prepare tracks from release', async () => {
        const release = {
          title: 'Test Album',
          artist: 'Test Artist',
          tracklist: [
            { title: 'Track 1', duration: '3:30' },
            { title: 'Track 2', duration: '4:15' }
          ]
        };

        const response = await request(app)
          .post('/api/v1/scrobble/prepare-from-release')
          .send({ release })
          .expect(200);
        
        expect(response.body.success).toBe(true);
        expect(response.body.data.tracks).toHaveLength(2);
        expect(response.body.data.tracks[0].artist).toBe('Test Artist');
        expect(response.body.data.tracks[0].track).toBe('Track 1');
      });

      it('should require release with tracklist', async () => {
        const response = await request(app)
          .post('/api/v1/scrobble/prepare-from-release')
          .send({})
          .expect(400);
        
        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Release with tracklist is required');
      });
    });
  });

  describe('Collection Routes', () => {
    describe('GET /api/v1/collection/:username', () => {
      it('should handle collection requests', async () => {
        // This will return success but with an error due to no authentication
        const response = await request(app)
          .get('/api/v1/collection/testuser');
        
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toBeDefined();
      });

      it('should handle force reload parameter', async () => {
        const response = await request(app)
          .get('/api/v1/collection/testuser?force_reload=true');
        
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toBeDefined();
      });

      it('should handle pagination parameters', async () => {
        const response = await request(app)
          .get('/api/v1/collection/testuser?page=2&per_page=25');
        
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.body.success).toBe(false);
        expect(response.body.error).toBeDefined();
      });
    });

    describe('GET /api/v1/collection/release/:releaseId', () => {
      it('should validate release ID', async () => {
        const response = await request(app)
          .get('/api/v1/collection/release/invalid')
          .expect(400);
        
        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Invalid release ID');
      });
    });

    describe('DELETE /api/v1/collection/cache', () => {
      it('should clear collection cache', async () => {
        const response = await request(app)
          .delete('/api/v1/collection/cache')
          .expect(200);
        
        expect(response.body.success).toBe(true);
        expect(response.body.data.message).toBe('Collection cache cleared');
      });
    });
  });
});