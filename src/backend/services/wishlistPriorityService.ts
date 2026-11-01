import {
  EnrichedWishlistItem,
  LocalWantItem,
  WishlistPriorityChange,
  WishlistPrioritySnapshot,
  WishlistPriorityStore,
} from '../../shared/types';
import {
  applyPriorityChange,
  buildPrioritySnapshot,
  buildWishlistRecords,
  canonicalPriorityKeys,
} from '../../shared/utils/wishlistPriority';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

export const WISHLIST_PRIORITIES_FILE = 'wishlist/priorities.json';

/** The parts of WishlistService the priority service uses */
export interface WishlistPrioritySource {
  getWishlistItems(): Promise<EnrichedWishlistItem[]>;
  getLocalWantList(): Promise<LocalWantItem[]>;
}

export class WishlistPriorityError extends Error {
  constructor(
    message: string,
    public readonly code: 'not_found' | 'corrupt'
  ) {
    super(message);
    this.name = 'WishlistPriorityError';
  }
}

/**
 * The owner's own order for wishlist records, kept in one small file. Only
 * ranked records are stored; keys of records that have left the wishlist stay,
 * so a record that comes back resumes its place.
 */
export class WishlistPriorityService {
  private writeQueue: Promise<unknown> = Promise.resolve();
  private readonly logger = createLogger('WishlistPriorityService');

  constructor(
    private readonly fileStorage: FileStorage,
    private readonly source: WishlistPrioritySource
  ) {}

  /**
   * readJSON returns null for a corrupt file as well as a missing one. Saving
   * over a corrupt file would erase the order, so it's an error here.
   */
  private async readOrderedKeys(): Promise<string[]> {
    if (!(await this.fileStorage.exists(WISHLIST_PRIORITIES_FILE))) return [];
    const store = await this.fileStorage.readJSON<WishlistPriorityStore>(
      WISHLIST_PRIORITIES_FILE
    );
    if (
      store?.schemaVersion !== 1 ||
      !Array.isArray(store.orderedKeys) ||
      !store.orderedKeys.every(key => typeof key === 'string')
    ) {
      throw new WishlistPriorityError(
        'The wishlist priorities file is damaged. Restore it from a backup.',
        'corrupt'
      );
    }
    return store.orderedKeys;
  }

  private async loadRecords() {
    const [wants, localWants] = await Promise.all([
      this.source.getWishlistItems(),
      this.source.getLocalWantList(),
    ]);
    return buildWishlistRecords(wants, localWants);
  }

  private async save(orderedKeys: string[]): Promise<void> {
    const store: WishlistPriorityStore = { schemaVersion: 1, orderedKeys };
    await this.fileStorage.writeJSONWithBackup(WISHLIST_PRIORITIES_FILE, store);
  }

  /** Reads and changes run one at a time, on top of the last saved order */
  private inQueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.writeQueue.then(task);
    this.writeQueue = run.catch(() => undefined);
    return run;
  }

  getSnapshot(): Promise<WishlistPrioritySnapshot> {
    return this.inQueue(async () => {
      const [orderedKeys, records] = await Promise.all([
        this.readOrderedKeys(),
        this.loadRecords(),
      ]);
      const canonical = canonicalPriorityKeys(orderedKeys, records);
      if (canonical.join() !== orderedKeys.join()) {
        try {
          await this.save(canonical);
        } catch (error) {
          this.logger.warn('Could not save updated priority keys', error);
        }
      }
      return buildPrioritySnapshot(canonical, records);
    });
  }

  applyChange(
    change: WishlistPriorityChange
  ): Promise<WishlistPrioritySnapshot> {
    return this.inQueue(async () => {
      const [orderedKeys, records] = await Promise.all([
        this.readOrderedKeys(),
        this.loadRecords(),
      ]);
      if (!records.records.some(record => record.key === change.key)) {
        throw new WishlistPriorityError(
          'That record is not on your wishlist',
          'not_found'
        );
      }
      const updated = applyPriorityChange(
        canonicalPriorityKeys(orderedKeys, records),
        change,
        records
      );
      await this.save(updated);
      return buildPrioritySnapshot(updated, records);
    });
  }
}
