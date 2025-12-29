import * as fs from 'fs';
import * as path from 'path';

import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import request from 'supertest';

// Set up test data directory before importing the route
const testDataDir = './test-data-artist-mapping-routes';
process.env.DATA_DIR = testDataDir;

// Clean up before importing
if (fs.existsSync(testDataDir)) {
  fs.rmSync(testDataDir, { recursive: true, force: true });
}
fs.mkdirSync(testDataDir, { recursive: true });

// Import after setting DATA_DIR
import artistMappingRouter from '../../../src/backend/routes/artistMapping';

describe('Artist Mapping Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    // Reset the module cache to get fresh service state
    jest.resetModules();

    // Clean up and recreate test directory
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDataDir, { recursive: true });

    // Reimport for fresh state - but routes are already loaded
    // For these tests we'll work with whatever state exists

    // Create Express app
    app = express();
    app.use(helmet());
    app.use(cors());
    app.use(express.json());

    // Mount artist mapping routes
    app.use('/api/v1/artist-mapping', artistMappingRouter);
  });

  afterEach(() => {
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
  });

  afterAll(() => {
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
    delete process.env.DATA_DIR;
  });

  describe('GET /api/v1/artist-mapping', () => {
    it('should return all artist mappings', async () => {
      // Act
      const response = await request(app).get('/api/v1/artist-mapping');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('mappings');
      expect(response.body.data).toHaveProperty('stats');
    });
  });

  describe('POST /api/v1/artist-mapping', () => {
    it('should add a new artist mapping', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/artist-mapping')
        .send({ discogsName: 'Test Artist (2)', lastfmName: 'Test Artist' });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.discogsName).toBe('Test Artist (2)');
      expect(response.body.data.lastfmName).toBe('Test Artist');
    });

    it('should return 400 when discogsName is missing', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/artist-mapping')
        .send({ lastfmName: 'Test Artist' });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('required');
    });

    it('should return 400 when lastfmName is missing', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/artist-mapping')
        .send({ discogsName: 'Test Artist' });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('required');
    });

    it('should return 400 when names are not strings', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/artist-mapping')
        .send({ discogsName: 123, lastfmName: 456 });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('string');
    });
  });

  describe('PUT /api/v1/artist-mapping/:discogsName', () => {
    it('should update an existing artist mapping', async () => {
      // Arrange - First add a mapping
      await request(app)
        .post('/api/v1/artist-mapping')
        .send({ discogsName: 'Update Test', lastfmName: 'Original' });

      // Act
      const response = await request(app)
        .put('/api/v1/artist-mapping/Update%20Test')
        .send({ lastfmName: 'Updated' });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.lastfmName).toBe('Updated');
    });

    it('should return 400 when lastfmName is missing', async () => {
      // Act
      const response = await request(app)
        .put('/api/v1/artist-mapping/Test')
        .send({});

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('required');
    });

    it('should return 400 when lastfmName is not a string', async () => {
      // Act
      const response = await request(app)
        .put('/api/v1/artist-mapping/Test')
        .send({ lastfmName: 123 });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('string');
    });

    it('should return 404 when mapping does not exist', async () => {
      // Act
      const response = await request(app)
        .put('/api/v1/artist-mapping/NonExistent')
        .send({ lastfmName: 'Test' });

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });
  });

  describe('DELETE /api/v1/artist-mapping/:discogsName', () => {
    it('should delete an existing artist mapping', async () => {
      // Arrange - First add a mapping
      await request(app)
        .post('/api/v1/artist-mapping')
        .send({ discogsName: 'ToDelete', lastfmName: 'Test' });

      // Act
      const response = await request(app).delete(
        '/api/v1/artist-mapping/ToDelete'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return 404 when mapping does not exist', async () => {
      // Act
      const response = await request(app).delete(
        '/api/v1/artist-mapping/NonExistent'
      );

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });
  });

  describe('GET /api/v1/artist-mapping/lookup/:discogsName', () => {
    it('should return mapped name when mapping exists', async () => {
      // Arrange
      await request(app)
        .post('/api/v1/artist-mapping')
        .send({ discogsName: 'Lookup Test', lastfmName: 'Mapped Name' });

      // Act
      const response = await request(app).get(
        '/api/v1/artist-mapping/lookup/Lookup%20Test'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.lastfmName).toBe('Mapped Name');
      expect(response.body.data.hasMapping).toBe(true);
    });

    it('should return original name when no mapping exists', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/artist-mapping/lookup/Unmapped%20Artist'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.lastfmName).toBe('Unmapped Artist');
      expect(response.body.data.hasMapping).toBe(false);
      expect(response.body.data.isOriginal).toBe(true);
    });
  });

  describe('POST /api/v1/artist-mapping/import', () => {
    it('should import valid mappings', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/artist-mapping/import')
        .send({
          mappings: [
            {
              discogsName: 'Import1',
              lastfmName: 'Mapped1',
              dateAdded: Date.now(),
            },
            {
              discogsName: 'Import2',
              lastfmName: 'Mapped2',
              dateAdded: Date.now(),
            },
          ],
        });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.imported).toBe(2);
    });

    it('should return 400 when mappings is not an array', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/artist-mapping/import')
        .send({ mappings: 'not an array' });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('array');
    });
  });

  describe('GET /api/v1/artist-mapping/export', () => {
    it('should export mappings as JSON', async () => {
      // Act
      const response = await request(app).get('/api/v1/artist-mapping/export');

      // Assert
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.body).toHaveProperty('mappings');
      expect(response.body).toHaveProperty('version');
    });
  });

  describe('DELETE /api/v1/artist-mapping', () => {
    it('should clear all artist mappings', async () => {
      // Arrange - Add some mappings first
      await request(app)
        .post('/api/v1/artist-mapping')
        .send({ discogsName: 'ToClear1', lastfmName: 'Test1' });
      await request(app)
        .post('/api/v1/artist-mapping')
        .send({ discogsName: 'ToClear2', lastfmName: 'Test2' });

      // Act
      const response = await request(app).delete('/api/v1/artist-mapping');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify mappings are cleared
      const getResponse = await request(app).get('/api/v1/artist-mapping');
      expect(getResponse.body.data.mappings).toHaveLength(0);
    });
  });

  describe('GET /api/v1/artist-mapping/stats', () => {
    it('should return artist mapping statistics', async () => {
      // Act
      const response = await request(app).get('/api/v1/artist-mapping/stats');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalMappings');
      expect(response.body.data).toHaveProperty('filePath');
    });
  });

  describe('GET /api/v1/artist-mapping/suggestions', () => {
    it('should return 400 when username is missing', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/artist-mapping/suggestions'
      );

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Username');
    });

    it('should return suggestions for a valid username', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/artist-mapping/suggestions?username=testuser'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('suggestions');
      expect(response.body.data).toHaveProperty('total');
    });
  });
});
