import fs from 'fs/promises';

import { DiscardPileService } from '../../../src/backend/services/discardPileService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';
import { DiscardPileItem, DiscardPileStore } from '../../../src/shared/types';

describe('DiscardPileService', () => {
  let service: DiscardPileService;
  let fileStorage: FileStorage;
  const testDataDir = './test-data-discard-pile-service';

  const createMockItem = (
    overrides: Partial<DiscardPileItem> = {}
  ): DiscardPileItem => ({
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
    ...overrides,
  });

  beforeEach(async () => {
    fileStorage = new FileStorage(testDataDir);
    await fileStorage.ensureDataDir();
    service = new DiscardPileService(fileStorage);
  });

  afterEach(async () => {
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  // Helper to seed the store with items
  const seedStore = async (items: DiscardPileItem[]) => {
    const store: DiscardPileStore = {
      schemaVersion: 1,
      items,
      lastUpdated: Date.now(),
    };
    await fileStorage.writeJSON('collections/discard-pile.json', store);
    service.clearCache();
  };

  describe('markAsTradedIn', () => {
    it('should update status to traded_in and set statusChangedAt', async () => {
      // Arrange
      const item = createMockItem({ status: 'marked' });
      await seedStore([item]);

      // Act
      const result = await service.markAsTradedIn(item.id);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.status).toBe('traded_in');
      expect(result!.statusChangedAt).toBeGreaterThanOrEqual(
        item.statusChangedAt
      );
    });

    it('should return null for non-existent item', async () => {
      await seedStore([]);

      const result = await service.markAsTradedIn('nonexistent');

      expect(result).toBeNull();
    });

    it('should reject items already in sold status', async () => {
      const item = createMockItem({ status: 'sold' });
      await seedStore([item]);

      await expect(service.markAsTradedIn(item.id)).rejects.toThrow(
        'terminal status'
      );
    });

    it('should reject items already in traded_in status', async () => {
      const item = createMockItem({ status: 'traded_in' });
      await seedStore([item]);

      await expect(service.markAsTradedIn(item.id)).rejects.toThrow(
        'terminal status'
      );
    });

    it('should reject items in gifted status', async () => {
      const item = createMockItem({ status: 'gifted' });
      await seedStore([item]);

      await expect(service.markAsTradedIn(item.id)).rejects.toThrow(
        'terminal status'
      );
    });

    it('should reject items in removed status', async () => {
      const item = createMockItem({ status: 'removed' });
      await seedStore([item]);

      await expect(service.markAsTradedIn(item.id)).rejects.toThrow(
        'terminal status'
      );
    });

    it('should accept items in marked status', async () => {
      const item = createMockItem({ status: 'marked' });
      await seedStore([item]);

      const result = await service.markAsTradedIn(item.id);

      expect(result).not.toBeNull();
      expect(result!.status).toBe('traded_in');
    });

    it('should accept items in listed status', async () => {
      const item = createMockItem({ id: 'listed12345', status: 'listed' });
      await seedStore([item]);

      const result = await service.markAsTradedIn(item.id);

      expect(result).not.toBeNull();
      expect(result!.status).toBe('traded_in');
    });
  });

  describe('bulkMarkAsTradedIn', () => {
    it('should mark multiple items as traded in with single file write', async () => {
      const item1 = createMockItem({
        id: 'item1aaaaaa',
        collectionItemId: 1,
        status: 'marked',
      });
      const item2 = createMockItem({
        id: 'item2aaaaaa',
        collectionItemId: 2,
        status: 'listed',
      });
      await seedStore([item1, item2]);

      const result = await service.bulkMarkAsTradedIn([
        'item1aaaaaa',
        'item2aaaaaa',
      ]);

      expect(result.succeeded).toEqual(['item1aaaaaa', 'item2aaaaaa']);
      expect(result.failed).toEqual([]);
    });

    it('should continue processing when individual items fail', async () => {
      const item1 = createMockItem({
        id: 'item1aaaaaa',
        collectionItemId: 1,
        status: 'marked',
      });
      const item2 = createMockItem({
        id: 'item2aaaaaa',
        collectionItemId: 2,
        status: 'sold',
      });
      await seedStore([item1, item2]);

      const result = await service.bulkMarkAsTradedIn([
        'item1aaaaaa',
        'item2aaaaaa',
      ]);

      expect(result.succeeded).toEqual(['item1aaaaaa']);
      expect(result.failed).toEqual(['item2aaaaaa']);
    });

    it('should return succeeded and failed arrays', async () => {
      const item = createMockItem({ id: 'item1aaaaaa', status: 'marked' });
      await seedStore([item]);

      const result = await service.bulkMarkAsTradedIn([
        'item1aaaaaa',
        'nonexistent1',
      ]);

      expect(result.succeeded).toEqual(['item1aaaaaa']);
      expect(result.failed).toEqual(['nonexistent1']);
    });

    it('should return all failed when no valid items', async () => {
      const item = createMockItem({ id: 'item1aaaaaa', status: 'sold' });
      await seedStore([item]);

      const result = await service.bulkMarkAsTradedIn([
        'item1aaaaaa',
        'nonexistent1',
      ]);

      expect(result.succeeded).toEqual([]);
      expect(result.failed).toEqual(['item1aaaaaa', 'nonexistent1']);
    });

    it('should handle empty ids array', async () => {
      await seedStore([]);

      const result = await service.bulkMarkAsTradedIn([]);

      expect(result.succeeded).toEqual([]);
      expect(result.failed).toEqual([]);
    });
  });

  describe('getDiscardPileStats - traded_in', () => {
    it('should include traded_in count in byStatus', async () => {
      const items = [
        createMockItem({
          id: 'item1aaaaaa',
          collectionItemId: 1,
          status: 'marked',
        }),
        createMockItem({
          id: 'item2aaaaaa',
          collectionItemId: 2,
          status: 'traded_in',
        }),
        createMockItem({
          id: 'item3aaaaaa',
          collectionItemId: 3,
          status: 'traded_in',
        }),
      ];
      await seedStore(items);

      const stats = await service.getDiscardPileStats();

      expect(stats.byStatus.traded_in).toBe(2);
      expect(stats.byStatus.marked).toBe(1);
      expect(stats.totalItems).toBe(3);
    });
  });
});
