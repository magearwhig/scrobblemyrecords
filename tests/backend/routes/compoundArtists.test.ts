import express from 'express';
import request from 'supertest';

import { createCompoundArtistRouter } from '../../../src/backend/routes/compoundArtists';
import { ArtistNameResolver } from '../../../src/backend/services/artistNameResolver';
import { CompoundArtistMappingService } from '../../../src/backend/services/compoundArtistMappingService';
import { MappingService } from '../../../src/backend/services/mappingService';

jest.mock('../../../src/backend/services/compoundArtistMappingService');
jest.mock('../../../src/backend/services/mappingService');
jest.mock('../../../src/backend/services/artistNameResolver');

describe('Compound Artist Routes', () => {
  let app: express.Application;
  let mockCompoundService: jest.Mocked<CompoundArtistMappingService>;
  let mockMappingService: jest.Mocked<MappingService>;
  let mockResolver: jest.Mocked<ArtistNameResolver>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockCompoundService = {
      getAllMappings: jest.fn().mockResolvedValue([]),
      addMapping: jest.fn().mockResolvedValue(undefined),
      removeMapping: jest.fn().mockResolvedValue(true),
      getMapping: jest.fn().mockResolvedValue(null),
      autoDetectFromAlbumMappings: jest.fn().mockResolvedValue(0),
      load: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<CompoundArtistMappingService>;

    mockMappingService = {
      getAllAlbumMappings: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<MappingService>;

    mockResolver = {
      rebuild: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ArtistNameResolver>;

    app = express();
    app.use(express.json());
    app.use(
      '/api/v1/compound-artist-mappings',
      createCompoundArtistRouter(
        mockCompoundService,
        mockMappingService,
        mockResolver
      )
    );
  });

  describe('GET /', () => {
    it('should return all compound mappings', async () => {
      mockCompoundService.getAllMappings.mockResolvedValue([
        {
          compoundName: 'A, B',
          components: ['A', 'B'],
          autoDetected: true,
          createdAt: 1000,
        },
      ]);

      const res = await request(app).get('/api/v1/compound-artist-mappings');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.mappings).toHaveLength(1);
      expect(res.body.data.total).toBe(1);
    });
  });

  describe('POST /', () => {
    it('should add a compound mapping', async () => {
      const res = await request(app)
        .post('/api/v1/compound-artist-mappings')
        .send({ compoundName: 'A, B', components: ['A', 'B'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockCompoundService.addMapping).toHaveBeenCalledWith(
        'A, B',
        ['A', 'B'],
        false
      );
      expect(mockResolver.rebuild).toHaveBeenCalled();
    });

    it('should reject missing fields', async () => {
      const res = await request(app)
        .post('/api/v1/compound-artist-mappings')
        .send({ compoundName: 'A, B' });

      expect(res.status).toBe(400);
    });

    it('should reject single-element components', async () => {
      const res = await request(app)
        .post('/api/v1/compound-artist-mappings')
        .send({ compoundName: 'A', components: ['A'] });

      expect(res.status).toBe(400);
    });

    it('should reject non-string compoundName', async () => {
      const res = await request(app)
        .post('/api/v1/compound-artist-mappings')
        .send({ compoundName: 123, components: ['A', 'B'] });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /:compoundName', () => {
    it('should delete a mapping', async () => {
      const res = await request(app).delete(
        `/api/v1/compound-artist-mappings/${encodeURIComponent('A, B')}`
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockCompoundService.removeMapping).toHaveBeenCalledWith('A, B');
      expect(mockResolver.rebuild).toHaveBeenCalled();
    });

    it('should return 404 for unknown mapping', async () => {
      mockCompoundService.removeMapping.mockResolvedValue(false);

      const res = await request(app).delete(
        `/api/v1/compound-artist-mappings/${encodeURIComponent('Unknown')}`
      );

      expect(res.status).toBe(404);
    });
  });

  describe('POST /auto-detect', () => {
    it('should trigger auto-detection and rebuild', async () => {
      mockCompoundService.autoDetectFromAlbumMappings.mockResolvedValue(3);

      const res = await request(app).post(
        '/api/v1/compound-artist-mappings/auto-detect'
      );

      expect(res.status).toBe(200);
      expect(res.body.data.detected).toBe(3);
      expect(mockResolver.rebuild).toHaveBeenCalled();
    });

    it('should not rebuild when nothing detected', async () => {
      mockCompoundService.autoDetectFromAlbumMappings.mockResolvedValue(0);

      const res = await request(app).post(
        '/api/v1/compound-artist-mappings/auto-detect'
      );

      expect(res.status).toBe(200);
      expect(res.body.data.detected).toBe(0);
      expect(mockResolver.rebuild).not.toHaveBeenCalled();
    });
  });
});
