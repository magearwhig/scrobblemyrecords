import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import request from 'supertest';

import createDiscardPileRouter from '../../../src/backend/routes/discardPile';
import { DiscardPileService } from '../../../src/backend/services/discardPileService';
import { WishlistService } from '../../../src/backend/services/wishlistService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';
import { DiscardPileItem } from '../../../src/shared/types';

// Mock dependencies
jest.mock('../../../src/backend/services/discardPileService');
jest.mock('../../../src/backend/services/wishlistService');
jest.mock('../../../src/backend/utils/fileStorage');

const MockedDiscardPileService = DiscardPileService as jest.MockedClass<
  typeof DiscardPileService
>;
const MockedWishlistService = WishlistService as jest.MockedClass<
  typeof WishlistService
>;
const MockedFileStorage = FileStorage as jest.MockedClass<typeof FileStorage>;

describe('Discard Pile Routes', () => {
  let app: express.Application;
  let mockFileStorage: jest.Mocked<FileStorage>;
  let mockDiscardPileService: jest.Mocked<DiscardPileService>;
  let mockWishlistService: jest.Mocked<WishlistService>;

  const mockItem: DiscardPileItem = {
    id: 'abc123def456',
    collectionItemId: 12345,
    releaseId: 67890,
    artist: 'Test Artist',
    title: 'Test Album',
    reason: 'selling',
    addedAt: Date.now(),
    status: 'marked',
    statusChangedAt: Date.now(),
    currency: 'USD',
    orphaned: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock instances
    mockFileStorage = new MockedFileStorage('test') as jest.Mocked<FileStorage>;
    mockDiscardPileService = new MockedDiscardPileService(
      mockFileStorage
    ) as jest.Mocked<DiscardPileService>;
    mockWishlistService = new MockedWishlistService(
      mockFileStorage,
      {} as any
    ) as jest.Mocked<WishlistService>;

    // Setup default mocks
    mockDiscardPileService.getDiscardPile = jest
      .fn()
      .mockResolvedValue([mockItem]);
    mockDiscardPileService.getItem = jest.fn().mockResolvedValue(mockItem);
    mockDiscardPileService.addToDiscardPile = jest
      .fn()
      .mockResolvedValue(mockItem);
    mockDiscardPileService.updateDiscardPileItem = jest
      .fn()
      .mockResolvedValue(mockItem);
    mockDiscardPileService.removeFromDiscardPile = jest
      .fn()
      .mockResolvedValue(true);
    mockDiscardPileService.bulkAddToDiscardPile = jest
      .fn()
      .mockResolvedValue([mockItem]);
    mockDiscardPileService.bulkRemoveFromDiscardPile = jest
      .fn()
      .mockResolvedValue(1);
    mockDiscardPileService.getDiscardPileStats = jest.fn().mockResolvedValue({
      totalItems: 1,
      byStatus: { marked: 1, listed: 0, sold: 0, gifted: 0, removed: 0 },
      byReason: {
        selling: 1,
        duplicate: 0,
        damaged: 0,
        upgrade: 0,
        not_listening: 0,
        gift: 0,
        other: 0,
      },
      totalEstimatedValue: 0,
      totalActualSales: 0,
      currency: 'USD',
    });
    mockDiscardPileService.getDiscardPileCollectionIds = jest
      .fn()
      .mockResolvedValue(new Set([12345]));
    mockDiscardPileService.markAsSold = jest.fn().mockResolvedValue({
      ...mockItem,
      status: 'sold',
    });
    mockDiscardPileService.markAsListed = jest.fn().mockResolvedValue({
      ...mockItem,
      status: 'listed',
      marketplaceUrl: 'https://discogs.com/sell/item/123',
    });

    // Create Express app with routes
    app = express();
    app.use(helmet());
    app.use(cors());
    app.use(express.json());
    app.use(
      '/api/v1/discard-pile',
      createDiscardPileRouter(mockDiscardPileService, mockWishlistService)
    );
  });

  describe('GET /api/v1/discard-pile', () => {
    it('should return all discard pile items', async () => {
      const response = await request(app).get('/api/v1/discard-pile');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.total).toBe(1);
    });

    it('should handle errors', async () => {
      mockDiscardPileService.getDiscardPile.mockRejectedValue(
        new Error('Database error')
      );

      const response = await request(app).get('/api/v1/discard-pile');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Database error');
    });
  });

  describe('POST /api/v1/discard-pile', () => {
    const validRequest = {
      collectionItemId: 12345,
      releaseId: 67890,
      artist: 'Test Artist',
      title: 'Test Album',
      reason: 'selling',
    };

    it('should reject invalid collectionItemId', async () => {
      const response = await request(app)
        .post('/api/v1/discard-pile')
        .send({ ...validRequest, collectionItemId: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('collectionItemId');
    });

    it('should reject invalid releaseId', async () => {
      const response = await request(app)
        .post('/api/v1/discard-pile')
        .send({ ...validRequest, releaseId: -1 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('releaseId');
    });

    it('should reject missing required fields', async () => {
      const response = await request(app).post('/api/v1/discard-pile').send({});

      expect(response.status).toBe(400);
    });

    it('should reject missing artist', async () => {
      const response = await request(app)
        .post('/api/v1/discard-pile')
        .send({ ...validRequest, artist: '' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('artist');
    });

    it('should reject missing title', async () => {
      const response = await request(app)
        .post('/api/v1/discard-pile')
        .send({ ...validRequest, title: undefined });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('title');
    });

    it('should reject invalid reason', async () => {
      const response = await request(app)
        .post('/api/v1/discard-pile')
        .send({ ...validRequest, reason: 'invalid_reason' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('reason');
    });

    it('should return 201 with created item', async () => {
      const response = await request(app)
        .post('/api/v1/discard-pile')
        .send(validRequest);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });

    it('should return 409 for duplicate item', async () => {
      mockDiscardPileService.addToDiscardPile.mockRejectedValue(
        new Error('Collection item 12345 is already in the discard pile')
      );

      const response = await request(app)
        .post('/api/v1/discard-pile')
        .send(validRequest);

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('already in the discard pile');
    });
  });

  describe('GET /api/v1/discard-pile/stats', () => {
    it('should return statistics', async () => {
      const response = await request(app).get('/api/v1/discard-pile/stats');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.totalItems).toBe(1);
    });
  });

  describe('GET /api/v1/discard-pile/ids', () => {
    it('should return collection IDs array', async () => {
      const response = await request(app).get('/api/v1/discard-pile/ids');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([12345]);
    });
  });

  describe('GET /api/v1/discard-pile/:id', () => {
    it('should reject invalid id format', async () => {
      // Test with an ID containing invalid characters (non-alphanumeric)
      const response = await request(app).get(
        '/api/v1/discard-pile/invalid@id!format'
      );

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('id format');
    });

    it('should return 404 for non-existent item', async () => {
      mockDiscardPileService.getItem.mockResolvedValue(null);

      const response = await request(app).get(
        '/api/v1/discard-pile/abc123def456'
      );

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Item not found');
    });

    it('should return item for valid id', async () => {
      const response = await request(app).get(
        '/api/v1/discard-pile/abc123def456'
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('abc123def456');
    });
  });

  describe('PUT /api/v1/discard-pile/:id', () => {
    it('should reject invalid id format', async () => {
      const response = await request(app)
        .put('/api/v1/discard-pile/invalid id!')
        .send({ notes: 'test' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('id format');
    });

    it('should return 404 for non-existent item', async () => {
      mockDiscardPileService.updateDiscardPileItem.mockResolvedValue(null);

      const response = await request(app)
        .put('/api/v1/discard-pile/abc123def456')
        .send({ notes: 'test' });

      expect(response.status).toBe(404);
    });

    it('should update and return item', async () => {
      mockDiscardPileService.updateDiscardPileItem.mockResolvedValue({
        ...mockItem,
        notes: 'Updated notes',
      });

      const response = await request(app)
        .put('/api/v1/discard-pile/abc123def456')
        .send({ notes: 'Updated notes' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.notes).toBe('Updated notes');
    });

    it('should reject invalid reason', async () => {
      const response = await request(app)
        .put('/api/v1/discard-pile/abc123def456')
        .send({ reason: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('reason');
    });

    it('should reject invalid status', async () => {
      const response = await request(app)
        .put('/api/v1/discard-pile/abc123def456')
        .send({ status: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('status');
    });
  });

  describe('DELETE /api/v1/discard-pile/:id', () => {
    it('should reject invalid id format', async () => {
      const response = await request(app).delete(
        '/api/v1/discard-pile/invalid id!'
      );

      expect(response.status).toBe(400);
    });

    it('should return success for non-existent item (idempotent)', async () => {
      mockDiscardPileService.removeFromDiscardPile.mockResolvedValue(false);

      const response = await request(app).delete(
        '/api/v1/discard-pile/nonexistent1'
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return success for existing item', async () => {
      const response = await request(app).delete(
        '/api/v1/discard-pile/abc123def456'
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('removed');
    });
  });

  describe('POST /api/v1/discard-pile/bulk', () => {
    const validItems = [
      {
        collectionItemId: 1,
        releaseId: 101,
        artist: 'Artist 1',
        title: 'Album 1',
        reason: 'selling',
      },
      {
        collectionItemId: 2,
        releaseId: 102,
        artist: 'Artist 2',
        title: 'Album 2',
        reason: 'duplicate',
      },
    ];

    it('should add multiple items', async () => {
      mockDiscardPileService.bulkAddToDiscardPile.mockResolvedValue([
        { ...mockItem, collectionItemId: 1 },
        { ...mockItem, collectionItemId: 2 },
      ]);

      const response = await request(app)
        .post('/api/v1/discard-pile/bulk')
        .send({ items: validItems });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.total).toBe(2);
    });

    it('should skip duplicates in bulk add', async () => {
      mockDiscardPileService.bulkAddToDiscardPile.mockResolvedValue([
        { ...mockItem, collectionItemId: 2 },
      ]);

      const response = await request(app)
        .post('/api/v1/discard-pile/bulk')
        .send({ items: validItems });

      expect(response.status).toBe(201);
      expect(response.body.total).toBe(1);
      expect(response.body.skipped).toBe(1);
    });

    it('should reject empty items array', async () => {
      const response = await request(app)
        .post('/api/v1/discard-pile/bulk')
        .send({ items: [] });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('non-empty array');
    });

    it('should validate each item', async () => {
      const invalidItems = [
        {
          collectionItemId: 'invalid',
          releaseId: 101,
          artist: 'Artist 1',
          title: 'Album 1',
          reason: 'selling',
        },
      ];

      const response = await request(app)
        .post('/api/v1/discard-pile/bulk')
        .send({ items: invalidItems });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('collectionItemId');
    });
  });

  describe('DELETE /api/v1/discard-pile/bulk', () => {
    it('should remove multiple items', async () => {
      mockDiscardPileService.bulkRemoveFromDiscardPile.mockResolvedValue(2);

      const response = await request(app)
        .delete('/api/v1/discard-pile/bulk')
        .send({ ids: ['abc123def456', 'def456abc123'] });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.removed).toBe(2);
    });

    it('should reject empty ids array', async () => {
      const response = await request(app)
        .delete('/api/v1/discard-pile/bulk')
        .send({ ids: [] });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('non-empty array');
    });

    it('should validate id format', async () => {
      const response = await request(app)
        .delete('/api/v1/discard-pile/bulk')
        .send({ ids: ['valid123', 'invalid id!'] });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('id format');
    });
  });

  describe('POST /api/v1/discard-pile/:id/sold', () => {
    it('should mark item as sold', async () => {
      const response = await request(app)
        .post('/api/v1/discard-pile/abc123def456/sold')
        .send({ salePrice: 30.0 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('sold');
    });

    it('should return 404 for non-existent item', async () => {
      mockDiscardPileService.markAsSold.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/v1/discard-pile/nonexistent1/sold')
        .send({});

      expect(response.status).toBe(404);
    });

    it('should work without sale price', async () => {
      const response = await request(app)
        .post('/api/v1/discard-pile/abc123def456/sold')
        .send({});

      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/v1/discard-pile/:id/listed', () => {
    it('should mark item as listed', async () => {
      const response = await request(app)
        .post('/api/v1/discard-pile/abc123def456/listed')
        .send({ marketplaceUrl: 'https://discogs.com/sell/item/123' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('listed');
    });

    it('should require marketplaceUrl', async () => {
      const response = await request(app)
        .post('/api/v1/discard-pile/abc123def456/listed')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('marketplaceUrl');
    });

    it('should return 404 for non-existent item', async () => {
      mockDiscardPileService.markAsListed.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/v1/discard-pile/nonexistent1/listed')
        .send({ marketplaceUrl: 'https://example.com' });

      expect(response.status).toBe(404);
    });
  });

  describe('Route ordering', () => {
    it('should match /stats before /:id', async () => {
      const response = await request(app).get('/api/v1/discard-pile/stats');

      expect(response.status).toBe(200);
      expect(mockDiscardPileService.getDiscardPileStats).toHaveBeenCalled();
      expect(mockDiscardPileService.getItem).not.toHaveBeenCalled();
    });

    it('should match /ids before /:id', async () => {
      const response = await request(app).get('/api/v1/discard-pile/ids');

      expect(response.status).toBe(200);
      expect(
        mockDiscardPileService.getDiscardPileCollectionIds
      ).toHaveBeenCalled();
      expect(mockDiscardPileService.getItem).not.toHaveBeenCalled();
    });

    it('should match /bulk before /:id', async () => {
      const response = await request(app)
        .post('/api/v1/discard-pile/bulk')
        .send({
          items: [
            {
              collectionItemId: 1,
              releaseId: 101,
              artist: 'Artist',
              title: 'Album',
              reason: 'selling',
            },
          ],
        });

      expect(response.status).toBe(201);
      expect(mockDiscardPileService.bulkAddToDiscardPile).toHaveBeenCalled();
    });
  });
});
