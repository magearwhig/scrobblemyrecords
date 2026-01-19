import { DiscardPileService } from '../../src/backend/services/discardPileService';
import { FileStorage } from '../../src/backend/utils/fileStorage';
import {
  AddDiscardPileItemRequest,
  DiscardPileStore,
} from '../../src/shared/types';

// Mock FileStorage
jest.mock('../../src/backend/utils/fileStorage');

describe('DiscardPileService', () => {
  let service: DiscardPileService;
  let mockFileStorage: jest.Mocked<FileStorage>;

  const createMockRequest = (
    overrides: Partial<AddDiscardPileItemRequest> = {}
  ): AddDiscardPileItemRequest => ({
    collectionItemId: 12345,
    releaseId: 67890,
    artist: 'Test Artist',
    title: 'Test Album',
    reason: 'selling',
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockFileStorage = {
      readJSON: jest.fn().mockResolvedValue(null),
      writeJSON: jest.fn().mockResolvedValue(undefined),
      writeJSONWithBackup: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<FileStorage>;

    service = new DiscardPileService(mockFileStorage);
  });

  describe('addToDiscardPile', () => {
    it('should add item with generated ID from collectionItemId', async () => {
      const request = createMockRequest();

      const item = await service.addToDiscardPile(request);

      expect(item.id).toBeDefined();
      expect(item.id.length).toBe(12); // MD5 hash truncated to 12 chars
      expect(item.collectionItemId).toBe(request.collectionItemId);
      expect(item.releaseId).toBe(request.releaseId);
      expect(item.artist).toBe(request.artist);
      expect(item.title).toBe(request.title);
      expect(item.reason).toBe(request.reason);
      expect(item.status).toBe('marked');
      expect(item.orphaned).toBe(false);
    });

    it('should reject duplicate collectionItemId', async () => {
      const request = createMockRequest();

      await service.addToDiscardPile(request);

      await expect(service.addToDiscardPile(request)).rejects.toThrow(
        'Collection item 12345 is already in the discard pile'
      );
    });

    it('should default currency to USD', async () => {
      const request = createMockRequest({ currency: undefined });

      const item = await service.addToDiscardPile(request);

      expect(item.currency).toBe('USD');
    });

    it('should use provided currency', async () => {
      const request = createMockRequest({ currency: 'EUR' });

      const item = await service.addToDiscardPile(request);

      expect(item.currency).toBe('EUR');
    });

    it('should set statusChangedAt equal to addedAt on creation', async () => {
      const request = createMockRequest();

      const item = await service.addToDiscardPile(request);

      expect(item.statusChangedAt).toBe(item.addedAt);
    });

    it('should include optional fields when provided', async () => {
      const request = createMockRequest({
        masterId: 11111,
        coverImage: 'https://example.com/cover.jpg',
        format: ['Vinyl', 'LP', 'Album'],
        year: 2024,
        reasonNote: 'Test note',
        rating: 4,
        estimatedValue: 25.0,
        notes: 'General notes',
      });

      const item = await service.addToDiscardPile(request);

      expect(item.masterId).toBe(11111);
      expect(item.coverImage).toBe('https://example.com/cover.jpg');
      expect(item.format).toEqual(['Vinyl', 'LP', 'Album']);
      expect(item.year).toBe(2024);
      expect(item.reasonNote).toBe('Test note');
      expect(item.rating).toBe(4);
      expect(item.estimatedValue).toBe(25.0);
      expect(item.notes).toBe('General notes');
    });

    it('should save store after adding item', async () => {
      const request = createMockRequest();

      await service.addToDiscardPile(request);

      expect(mockFileStorage.writeJSONWithBackup).toHaveBeenCalled();
    });
  });

  describe('updateDiscardPileItem', () => {
    it('should update statusChangedAt when status changes', async () => {
      const request = createMockRequest();
      const item = await service.addToDiscardPile(request);
      const originalStatusChangedAt = item.statusChangedAt;

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      const updated = await service.updateDiscardPileItem(item.id, {
        status: 'listed',
      });

      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('listed');
      expect(updated!.statusChangedAt).toBeGreaterThan(originalStatusChangedAt);
    });

    it('should NOT update statusChangedAt when other fields change', async () => {
      const request = createMockRequest();
      const item = await service.addToDiscardPile(request);
      const originalStatusChangedAt = item.statusChangedAt;

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      const updated = await service.updateDiscardPileItem(item.id, {
        notes: 'Updated notes',
        estimatedValue: 50.0,
      });

      expect(updated).not.toBeNull();
      expect(updated!.notes).toBe('Updated notes');
      expect(updated!.estimatedValue).toBe(50.0);
      expect(updated!.statusChangedAt).toBe(originalStatusChangedAt);
    });

    it('should return null for non-existent ID', async () => {
      const result = await service.updateDiscardPileItem('nonexistent', {
        notes: 'test',
      });

      expect(result).toBeNull();
    });

    it('should update multiple fields at once', async () => {
      const request = createMockRequest();
      const item = await service.addToDiscardPile(request);

      const updated = await service.updateDiscardPileItem(item.id, {
        reason: 'duplicate',
        reasonNote: 'Have another copy',
        estimatedValue: 30.0,
        marketplaceUrl: 'https://discogs.com/sell/item/123',
        notes: 'Listed on Discogs',
      });

      expect(updated).not.toBeNull();
      expect(updated!.reason).toBe('duplicate');
      expect(updated!.reasonNote).toBe('Have another copy');
      expect(updated!.estimatedValue).toBe(30.0);
      expect(updated!.marketplaceUrl).toBe('https://discogs.com/sell/item/123');
      expect(updated!.notes).toBe('Listed on Discogs');
    });
  });

  describe('removeFromDiscardPile', () => {
    it('should remove an existing item', async () => {
      const request = createMockRequest();
      const item = await service.addToDiscardPile(request);

      const removed = await service.removeFromDiscardPile(item.id);

      expect(removed).toBe(true);

      const items = await service.getDiscardPile();
      expect(items).toHaveLength(0);
    });

    it('should return false for non-existent item', async () => {
      const removed = await service.removeFromDiscardPile('nonexistent');

      expect(removed).toBe(false);
    });
  });

  describe('duplicate handling', () => {
    it('should allow same releaseId with different collectionItemId', async () => {
      const request1 = createMockRequest({
        collectionItemId: 111,
        releaseId: 999,
      });
      const request2 = createMockRequest({
        collectionItemId: 222,
        releaseId: 999,
      });

      const item1 = await service.addToDiscardPile(request1);
      const item2 = await service.addToDiscardPile(request2);

      expect(item1.id).not.toBe(item2.id);
      expect(item1.releaseId).toBe(item2.releaseId);
      expect(item1.collectionItemId).not.toBe(item2.collectionItemId);
    });

    it('should track each copy independently', async () => {
      const request1 = createMockRequest({
        collectionItemId: 111,
        releaseId: 999,
        reason: 'selling',
      });
      const request2 = createMockRequest({
        collectionItemId: 222,
        releaseId: 999,
        reason: 'duplicate',
      });

      await service.addToDiscardPile(request1);
      await service.addToDiscardPile(request2);

      const items = await service.getDiscardPile();
      expect(items).toHaveLength(2);
      expect(items[0].reason).toBe('selling');
      expect(items[1].reason).toBe('duplicate');
    });
  });

  describe('bulkAddToDiscardPile', () => {
    it('should add multiple items', async () => {
      const requests = [
        createMockRequest({ collectionItemId: 1, artist: 'Artist 1' }),
        createMockRequest({ collectionItemId: 2, artist: 'Artist 2' }),
        createMockRequest({ collectionItemId: 3, artist: 'Artist 3' }),
      ];

      const added = await service.bulkAddToDiscardPile(requests);

      expect(added).toHaveLength(3);
      expect(added[0].artist).toBe('Artist 1');
      expect(added[1].artist).toBe('Artist 2');
      expect(added[2].artist).toBe('Artist 3');
    });

    it('should skip duplicates in bulk add', async () => {
      // First add one item
      await service.addToDiscardPile(
        createMockRequest({ collectionItemId: 1, artist: 'Existing' })
      );

      const requests = [
        createMockRequest({ collectionItemId: 1, artist: 'Duplicate' }),
        createMockRequest({ collectionItemId: 2, artist: 'New' }),
      ];

      const added = await service.bulkAddToDiscardPile(requests);

      expect(added).toHaveLength(1);
      expect(added[0].artist).toBe('New');

      const allItems = await service.getDiscardPile();
      expect(allItems).toHaveLength(2);
    });
  });

  describe('bulkRemoveFromDiscardPile', () => {
    it('should remove multiple items', async () => {
      const item1 = await service.addToDiscardPile(
        createMockRequest({ collectionItemId: 1 })
      );
      const item2 = await service.addToDiscardPile(
        createMockRequest({ collectionItemId: 2 })
      );
      await service.addToDiscardPile(
        createMockRequest({ collectionItemId: 3 })
      );

      const removed = await service.bulkRemoveFromDiscardPile([
        item1.id,
        item2.id,
      ]);

      expect(removed).toBe(2);

      const remaining = await service.getDiscardPile();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].collectionItemId).toBe(3);
    });

    it('should return 0 when no items match', async () => {
      const removed = await service.bulkRemoveFromDiscardPile([
        'nonexistent1',
        'nonexistent2',
      ]);

      expect(removed).toBe(0);
    });
  });

  describe('stats aggregation', () => {
    it('should calculate totals correctly', async () => {
      await service.addToDiscardPile(
        createMockRequest({
          collectionItemId: 1,
          reason: 'selling',
          estimatedValue: 25.0,
        })
      );
      await service.addToDiscardPile(
        createMockRequest({
          collectionItemId: 2,
          reason: 'duplicate',
          estimatedValue: 15.0,
        })
      );
      await service.addToDiscardPile(
        createMockRequest({
          collectionItemId: 3,
          reason: 'selling',
          estimatedValue: 30.0,
        })
      );

      const stats = await service.getDiscardPileStats();

      expect(stats.totalItems).toBe(3);
      expect(stats.totalEstimatedValue).toBe(70.0);
    });

    it('should group by status and reason', async () => {
      await service.addToDiscardPile(
        createMockRequest({ collectionItemId: 1, reason: 'selling' })
      );
      await service.addToDiscardPile(
        createMockRequest({ collectionItemId: 2, reason: 'selling' })
      );
      await service.addToDiscardPile(
        createMockRequest({ collectionItemId: 3, reason: 'duplicate' })
      );
      await service.addToDiscardPile(
        createMockRequest({ collectionItemId: 4, reason: 'damaged' })
      );

      const stats = await service.getDiscardPileStats();

      expect(stats.byReason.selling).toBe(2);
      expect(stats.byReason.duplicate).toBe(1);
      expect(stats.byReason.damaged).toBe(1);
      expect(stats.byReason.upgrade).toBe(0);
      expect(stats.byStatus.marked).toBe(4);
      expect(stats.byStatus.listed).toBe(0);
    });

    it('should return empty stats for empty store', async () => {
      const stats = await service.getDiscardPileStats();

      expect(stats.totalItems).toBe(0);
      expect(stats.totalEstimatedValue).toBe(0);
      expect(stats.totalActualSales).toBe(0);
    });

    it('should calculate actual sales total', async () => {
      const item1 = await service.addToDiscardPile(
        createMockRequest({ collectionItemId: 1 })
      );
      const item2 = await service.addToDiscardPile(
        createMockRequest({ collectionItemId: 2 })
      );

      await service.markAsSold(item1.id, 30.0);
      await service.markAsSold(item2.id, 20.0);

      const stats = await service.getDiscardPileStats();

      expect(stats.totalActualSales).toBe(50.0);
      expect(stats.byStatus.sold).toBe(2);
    });
  });

  describe('isInDiscardPile', () => {
    it('should return true for items in discard pile', async () => {
      await service.addToDiscardPile(
        createMockRequest({ collectionItemId: 12345 })
      );

      expect(await service.isInDiscardPile(12345)).toBe(true);
    });

    it('should return false for items not in discard pile', async () => {
      expect(await service.isInDiscardPile(99999)).toBe(false);
    });
  });

  describe('getDiscardPileCollectionIds', () => {
    it('should return set of all collection IDs', async () => {
      await service.addToDiscardPile(
        createMockRequest({ collectionItemId: 111 })
      );
      await service.addToDiscardPile(
        createMockRequest({ collectionItemId: 222 })
      );
      await service.addToDiscardPile(
        createMockRequest({ collectionItemId: 333 })
      );

      const ids = await service.getDiscardPileCollectionIds();

      expect(ids.size).toBe(3);
      expect(ids.has(111)).toBe(true);
      expect(ids.has(222)).toBe(true);
      expect(ids.has(333)).toBe(true);
      expect(ids.has(444)).toBe(false);
    });
  });

  describe('markAsSold', () => {
    it('should update status and sale price', async () => {
      const item = await service.addToDiscardPile(createMockRequest());

      const updated = await service.markAsSold(item.id, 35.0);

      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('sold');
      expect(updated!.actualSalePrice).toBe(35.0);
    });

    it('should return null for non-existent item', async () => {
      const result = await service.markAsSold('nonexistent', 100.0);

      expect(result).toBeNull();
    });

    it('should work without sale price', async () => {
      const item = await service.addToDiscardPile(createMockRequest());

      const updated = await service.markAsSold(item.id);

      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('sold');
      expect(updated!.actualSalePrice).toBeUndefined();
    });
  });

  describe('markAsListed', () => {
    it('should update status and marketplace URL', async () => {
      const item = await service.addToDiscardPile(createMockRequest());
      const url = 'https://discogs.com/sell/item/123';

      const updated = await service.markAsListed(item.id, url);

      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('listed');
      expect(updated!.marketplaceUrl).toBe(url);
    });

    it('should return null for non-existent item', async () => {
      const result = await service.markAsListed(
        'nonexistent',
        'https://example.com'
      );

      expect(result).toBeNull();
    });
  });

  describe('orphan management', () => {
    it('should mark items as orphaned', async () => {
      await service.addToDiscardPile(
        createMockRequest({ collectionItemId: 111 })
      );
      await service.addToDiscardPile(
        createMockRequest({ collectionItemId: 222 })
      );
      await service.addToDiscardPile(
        createMockRequest({ collectionItemId: 333 })
      );

      const orphanedCount = await service.markAsOrphaned([111, 333]);

      expect(orphanedCount).toBe(2);

      const items = await service.getDiscardPile();
      expect(items.find(i => i.collectionItemId === 111)!.orphaned).toBe(true);
      expect(items.find(i => i.collectionItemId === 222)!.orphaned).toBe(false);
      expect(items.find(i => i.collectionItemId === 333)!.orphaned).toBe(true);
    });

    it('should not delete orphaned items', async () => {
      await service.addToDiscardPile(
        createMockRequest({ collectionItemId: 111 })
      );

      await service.markAsOrphaned([111]);

      const items = await service.getDiscardPile();
      expect(items).toHaveLength(1);
      expect(items[0].orphaned).toBe(true);
    });

    it('should not re-mark already orphaned items', async () => {
      await service.addToDiscardPile(
        createMockRequest({ collectionItemId: 111 })
      );

      // Mark orphaned twice
      const count1 = await service.markAsOrphaned([111]);
      const count2 = await service.markAsOrphaned([111]);

      expect(count1).toBe(1);
      expect(count2).toBe(0);
    });
  });

  describe('getItem', () => {
    it('should return item by ID', async () => {
      const added = await service.addToDiscardPile(createMockRequest());

      const item = await service.getItem(added.id);

      expect(item).not.toBeNull();
      expect(item!.id).toBe(added.id);
    });

    it('should return null for non-existent ID', async () => {
      const item = await service.getItem('nonexistent');

      expect(item).toBeNull();
    });
  });

  describe('data persistence', () => {
    it('should load data from storage on first access', async () => {
      const existingStore: DiscardPileStore = {
        schemaVersion: 1,
        items: [
          {
            id: 'existing-id',
            collectionItemId: 999,
            releaseId: 888,
            artist: 'Stored Artist',
            title: 'Stored Album',
            reason: 'selling',
            addedAt: Date.now(),
            status: 'marked',
            statusChangedAt: Date.now(),
            currency: 'USD',
            orphaned: false,
          },
        ],
        lastUpdated: Date.now(),
      };

      mockFileStorage.readJSON.mockResolvedValueOnce(existingStore);

      // Create a new service instance to trigger fresh load
      const freshService = new DiscardPileService(mockFileStorage);
      const items = await freshService.getDiscardPile();

      expect(items).toHaveLength(1);
      expect(items[0].artist).toBe('Stored Artist');
    });

    it('should save data to storage after changes', async () => {
      await service.addToDiscardPile(createMockRequest());

      expect(mockFileStorage.writeJSONWithBackup).toHaveBeenCalled();
      const callArg = mockFileStorage.writeJSONWithBackup.mock.calls[0][1] as {
        schemaVersion: number;
        items: unknown[];
      };
      expect(callArg.schemaVersion).toBe(1);
      expect(callArg.items).toHaveLength(1);
    });

    it('should use writeJSONWithBackup for critical data', async () => {
      await service.addToDiscardPile(createMockRequest());

      expect(mockFileStorage.writeJSONWithBackup).toHaveBeenCalledWith(
        'collections/discard-pile.json',
        expect.any(Object)
      );
    });
  });

  describe('clearCache', () => {
    it('should clear in-memory cache', async () => {
      await service.addToDiscardPile(createMockRequest());

      service.clearCache();

      // After clearing, next access should reload from storage
      mockFileStorage.readJSON.mockResolvedValueOnce({
        schemaVersion: 1,
        items: [],
        lastUpdated: Date.now(),
      });

      const items = await service.getDiscardPile();
      expect(items).toHaveLength(0);
    });
  });
});
