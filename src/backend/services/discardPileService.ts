/**
 * Discard Pile Service - manages records marked for removal from the collection.
 *
 * This service allows users to track records they want to get rid of during
 * collection cleanup (selling, gifting, damaged, etc.).
 */

import crypto from 'crypto';

import {
  AddDiscardPileItemRequest,
  DiscardPileItem,
  DiscardPileStats,
  DiscardPileStore,
  DiscardReason,
  DiscardStatus,
  UpdateDiscardPileItemRequest,
} from '../../shared/types';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

export class DiscardPileService {
  private fileStorage: FileStorage;
  private logger = createLogger('DiscardPileService');

  // Cache file path - using 'collections' directory per plan
  private readonly DISCARD_PILE_FILE = 'collections/discard-pile.json';
  private readonly DEFAULT_CURRENCY = 'USD';

  // In-memory cache for performance
  private store: DiscardPileStore | null = null;

  constructor(fileStorage: FileStorage) {
    this.fileStorage = fileStorage;
  }

  /**
   * Generate deterministic ID from collectionItemId
   */
  private generateId(collectionItemId: number): string {
    return crypto
      .createHash('md5')
      .update(collectionItemId.toString())
      .digest('hex')
      .slice(0, 12);
  }

  /**
   * Load store from file, return empty store if not exists
   */
  private async loadStore(): Promise<DiscardPileStore> {
    if (this.store) {
      return this.store;
    }

    try {
      const data = await this.fileStorage.readJSON<DiscardPileStore>(
        this.DISCARD_PILE_FILE
      );
      if (data && data.schemaVersion === 1) {
        this.store = data;
        return data;
      }
    } catch {
      this.logger.debug('No discard pile file found, creating new store');
    }

    const emptyStore: DiscardPileStore = {
      schemaVersion: 1,
      items: [],
      lastUpdated: Date.now(),
    };
    this.store = emptyStore;
    return emptyStore;
  }

  /**
   * Save store to file with backup
   */
  private async saveStore(store: DiscardPileStore): Promise<void> {
    store.lastUpdated = Date.now();
    this.store = store;
    await this.fileStorage.writeJSONWithBackup(this.DISCARD_PILE_FILE, store);
  }

  /**
   * Get all discard pile items
   */
  async getDiscardPile(): Promise<DiscardPileItem[]> {
    const store = await this.loadStore();
    return store.items;
  }

  /**
   * Get a single item by ID
   */
  async getItem(id: string): Promise<DiscardPileItem | null> {
    const store = await this.loadStore();
    return store.items.find(item => item.id === id) || null;
  }

  /**
   * Add an item to the discard pile
   */
  async addToDiscardPile(
    request: AddDiscardPileItemRequest
  ): Promise<DiscardPileItem> {
    const store = await this.loadStore();

    // Check for duplicate collectionItemId
    const existingIndex = store.items.findIndex(
      item => item.collectionItemId === request.collectionItemId
    );

    if (existingIndex !== -1) {
      throw new Error(
        `Collection item ${request.collectionItemId} is already in the discard pile`
      );
    }

    const now = Date.now();
    const item: DiscardPileItem = {
      id: this.generateId(request.collectionItemId),
      collectionItemId: request.collectionItemId,
      releaseId: request.releaseId,
      masterId: request.masterId,
      artist: request.artist,
      title: request.title,
      coverImage: request.coverImage,
      format: request.format,
      year: request.year,
      reason: request.reason,
      reasonNote: request.reasonNote,
      rating: request.rating,
      addedAt: now,
      status: 'marked',
      statusChangedAt: now,
      estimatedValue: request.estimatedValue,
      currency: request.currency || this.DEFAULT_CURRENCY,
      notes: request.notes,
      orphaned: false,
    };

    store.items.push(item);
    await this.saveStore(store);

    this.logger.info(
      `Added to discard pile: ${item.artist} - ${item.title} (reason: ${item.reason})`
    );

    return item;
  }

  /**
   * Update a discard pile item
   */
  async updateDiscardPileItem(
    id: string,
    updates: UpdateDiscardPileItemRequest
  ): Promise<DiscardPileItem | null> {
    const store = await this.loadStore();
    const index = store.items.findIndex(item => item.id === id);

    if (index === -1) {
      return null;
    }

    const existingItem = store.items[index];
    const now = Date.now();

    // Check if status is changing
    const statusChanged =
      updates.status !== undefined && updates.status !== existingItem.status;

    const updatedItem: DiscardPileItem = {
      ...existingItem,
      reason: updates.reason ?? existingItem.reason,
      reasonNote: updates.reasonNote ?? existingItem.reasonNote,
      status: updates.status ?? existingItem.status,
      estimatedValue: updates.estimatedValue ?? existingItem.estimatedValue,
      actualSalePrice: updates.actualSalePrice ?? existingItem.actualSalePrice,
      currency: updates.currency ?? existingItem.currency,
      marketplaceUrl: updates.marketplaceUrl ?? existingItem.marketplaceUrl,
      notes: updates.notes ?? existingItem.notes,
      // Only update statusChangedAt if status actually changed
      statusChangedAt: statusChanged ? now : existingItem.statusChangedAt,
    };

    store.items[index] = updatedItem;
    await this.saveStore(store);

    this.logger.info(`Updated discard pile item: ${id}`);

    return updatedItem;
  }

  /**
   * Remove an item from the discard pile
   */
  async removeFromDiscardPile(id: string): Promise<boolean> {
    const store = await this.loadStore();
    const initialLength = store.items.length;
    store.items = store.items.filter(item => item.id !== id);

    if (store.items.length < initialLength) {
      await this.saveStore(store);
      this.logger.info(`Removed from discard pile: ${id}`);
      return true;
    }

    return false;
  }

  /**
   * Bulk add multiple items to discard pile
   * Returns successfully added items (skips duplicates)
   */
  async bulkAddToDiscardPile(
    requests: AddDiscardPileItemRequest[]
  ): Promise<DiscardPileItem[]> {
    const store = await this.loadStore();
    const existingCollectionIds = new Set(
      store.items.map(item => item.collectionItemId)
    );
    const now = Date.now();
    const addedItems: DiscardPileItem[] = [];

    for (const request of requests) {
      // Skip duplicates
      if (existingCollectionIds.has(request.collectionItemId)) {
        this.logger.debug(
          `Skipping duplicate collectionItemId: ${request.collectionItemId}`
        );
        continue;
      }

      const item: DiscardPileItem = {
        id: this.generateId(request.collectionItemId),
        collectionItemId: request.collectionItemId,
        releaseId: request.releaseId,
        masterId: request.masterId,
        artist: request.artist,
        title: request.title,
        coverImage: request.coverImage,
        format: request.format,
        year: request.year,
        reason: request.reason,
        reasonNote: request.reasonNote,
        rating: request.rating,
        addedAt: now,
        status: 'marked',
        statusChangedAt: now,
        estimatedValue: request.estimatedValue,
        currency: request.currency || this.DEFAULT_CURRENCY,
        notes: request.notes,
        orphaned: false,
      };

      store.items.push(item);
      existingCollectionIds.add(request.collectionItemId);
      addedItems.push(item);
    }

    if (addedItems.length > 0) {
      await this.saveStore(store);
      this.logger.info(`Bulk added ${addedItems.length} items to discard pile`);
    }

    return addedItems;
  }

  /**
   * Bulk remove multiple items from discard pile
   * Returns the count of removed items
   */
  async bulkRemoveFromDiscardPile(ids: string[]): Promise<number> {
    const store = await this.loadStore();
    const idsToRemove = new Set(ids);
    const initialLength = store.items.length;

    store.items = store.items.filter(item => !idsToRemove.has(item.id));
    const removedCount = initialLength - store.items.length;

    if (removedCount > 0) {
      await this.saveStore(store);
      this.logger.info(`Bulk removed ${removedCount} items from discard pile`);
    }

    return removedCount;
  }

  /**
   * Get aggregated statistics for the discard pile
   */
  async getDiscardPileStats(): Promise<DiscardPileStats> {
    const store = await this.loadStore();

    // Initialize counters
    const byStatus: Record<DiscardStatus, number> = {
      marked: 0,
      listed: 0,
      sold: 0,
      gifted: 0,
      removed: 0,
    };

    const byReason: Record<DiscardReason, number> = {
      selling: 0,
      duplicate: 0,
      damaged: 0,
      upgrade: 0,
      not_listening: 0,
      gift: 0,
      other: 0,
    };

    let totalEstimatedValue = 0;
    let totalActualSales = 0;

    for (const item of store.items) {
      byStatus[item.status]++;
      byReason[item.reason]++;

      // Sum values (assuming same currency for simplicity)
      if (item.estimatedValue) {
        totalEstimatedValue += item.estimatedValue;
      }
      if (item.actualSalePrice) {
        totalActualSales += item.actualSalePrice;
      }
    }

    return {
      totalItems: store.items.length,
      byStatus,
      byReason,
      totalEstimatedValue,
      totalActualSales,
      currency: this.DEFAULT_CURRENCY,
    };
  }

  /**
   * Check if a collection item is in the discard pile
   */
  async isInDiscardPile(collectionItemId: number): Promise<boolean> {
    const store = await this.loadStore();
    return store.items.some(item => item.collectionItemId === collectionItemId);
  }

  /**
   * Get all collection IDs in the discard pile (for efficient lookup in collection view)
   */
  async getDiscardPileCollectionIds(): Promise<Set<number>> {
    const store = await this.loadStore();
    return new Set(store.items.map(item => item.collectionItemId));
  }

  /**
   * Quick action: mark an item as sold
   */
  async markAsSold(
    id: string,
    salePrice?: number
  ): Promise<DiscardPileItem | null> {
    const store = await this.loadStore();
    const index = store.items.findIndex(item => item.id === id);

    if (index === -1) {
      return null;
    }

    const now = Date.now();
    const item = store.items[index];

    store.items[index] = {
      ...item,
      status: 'sold',
      statusChangedAt: now,
      actualSalePrice: salePrice ?? item.actualSalePrice,
    };

    await this.saveStore(store);
    this.logger.info(
      `Marked as sold: ${item.artist} - ${item.title}${salePrice ? ` for ${salePrice}` : ''}`
    );

    return store.items[index];
  }

  /**
   * Quick action: mark an item as listed for sale
   */
  async markAsListed(
    id: string,
    marketplaceUrl: string
  ): Promise<DiscardPileItem | null> {
    const store = await this.loadStore();
    const index = store.items.findIndex(item => item.id === id);

    if (index === -1) {
      return null;
    }

    const now = Date.now();
    const item = store.items[index];

    store.items[index] = {
      ...item,
      status: 'listed',
      statusChangedAt: now,
      marketplaceUrl,
    };

    await this.saveStore(store);
    this.logger.info(`Marked as listed: ${item.artist} - ${item.title}`);

    return store.items[index];
  }

  /**
   * Mark items as orphaned (called after collection resync when items are no longer present)
   * Returns the count of items marked as orphaned
   */
  async markAsOrphaned(collectionItemIds: number[]): Promise<number> {
    const store = await this.loadStore();
    const idsToOrphan = new Set(collectionItemIds);
    let orphanedCount = 0;

    for (let i = 0; i < store.items.length; i++) {
      if (
        idsToOrphan.has(store.items[i].collectionItemId) &&
        !store.items[i].orphaned
      ) {
        store.items[i] = { ...store.items[i], orphaned: true };
        orphanedCount++;
      }
    }

    if (orphanedCount > 0) {
      await this.saveStore(store);
      this.logger.info(`Marked ${orphanedCount} items as orphaned`);
    }

    return orphanedCount;
  }

  /**
   * Clear the in-memory cache (useful for testing)
   */
  clearCache(): void {
    this.store = null;
  }
}
