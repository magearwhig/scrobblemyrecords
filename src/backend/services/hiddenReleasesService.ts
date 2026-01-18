import {
  HiddenRelease,
  HiddenReleasesStore,
  ExcludedArtist,
  ExcludedArtistsStore,
} from '../../shared/types';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

const HIDDEN_RELEASES_FILE = 'releases/hidden-releases.json';
const EXCLUDED_ARTISTS_FILE = 'releases/excluded-artists.json';

/**
 * Service for managing hidden releases and excluded artists in release tracking.
 * - Hidden releases: individual releases hidden from the New Releases page
 * - Excluded artists: artists excluded from release tracking sync entirely
 */
export class HiddenReleasesService {
  private fileStorage: FileStorage;
  private logger = createLogger('HiddenReleasesService');

  // Cached items for fast lookup
  private hiddenReleases: Map<string, HiddenRelease> = new Map();
  private excludedArtists: Map<string, ExcludedArtist> = new Map();
  private loaded = false;

  constructor(fileStorage: FileStorage) {
    this.fileStorage = fileStorage;
  }

  /**
   * Normalize artist name for consistent lookup.
   * IMPORTANT: Must match ReleaseTrackingService.normalizeArtistName exactly!
   */
  private normalizeArtistName(name: string): string {
    return (
      name
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
        // Remove common prefixes like "The"
        .replace(/^the\s+/i, '')
        // Remove special characters (but keep alphanumeric and spaces)
        .replace(/[^\w\s]/g, '')
        .trim()
    );
  }

  /**
   * Load hidden items from disk.
   */
  async loadItems(): Promise<void> {
    if (this.loaded) return;

    try {
      const rawData =
        await this.fileStorage.readJSON<HiddenReleasesStore>(
          HIDDEN_RELEASES_FILE
        );
      if (rawData && rawData.items) {
        for (const item of rawData.items) {
          this.hiddenReleases.set(item.mbid, item);
        }
        this.logger.info(`Loaded ${rawData.items.length} hidden releases`);
      }
    } catch {
      this.logger.debug('No hidden releases file found');
    }

    try {
      const rawData = await this.fileStorage.readJSON<ExcludedArtistsStore>(
        EXCLUDED_ARTISTS_FILE
      );
      if (rawData && rawData.items) {
        for (const item of rawData.items) {
          this.excludedArtists.set(item.normalizedName, item);
        }
        this.logger.info(`Loaded ${rawData.items.length} excluded artists`);
      }
    } catch {
      this.logger.debug('No excluded artists file found');
    }

    this.loaded = true;
  }

  /**
   * Save items to disk using versioned store format.
   */
  private async saveItems(): Promise<void> {
    const releasesStore: HiddenReleasesStore = {
      schemaVersion: 1,
      items: Array.from(this.hiddenReleases.values()),
    };
    const artistsStore: ExcludedArtistsStore = {
      schemaVersion: 1,
      items: Array.from(this.excludedArtists.values()),
    };

    await this.fileStorage.writeJSON(HIDDEN_RELEASES_FILE, releasesStore);
    await this.fileStorage.writeJSON(EXCLUDED_ARTISTS_FILE, artistsStore);
  }

  // ============================================
  // Hidden Releases Methods
  // ============================================

  /**
   * Hide a release from the New Releases page
   */
  async hideRelease(
    mbid: string,
    title: string,
    artistName: string
  ): Promise<void> {
    await this.loadItems();

    const hiddenItem: HiddenRelease = {
      mbid,
      title,
      artistName,
      hiddenAt: Date.now(),
    };

    this.hiddenReleases.set(mbid, hiddenItem);
    await this.saveItems();

    this.logger.info(`Hidden release: "${artistName}" - "${title}"`);
  }

  /**
   * Unhide a release
   */
  async unhideRelease(mbid: string): Promise<boolean> {
    await this.loadItems();

    const removed = this.hiddenReleases.delete(mbid);

    if (removed) {
      await this.saveItems();
      this.logger.info(`Unhidden release: ${mbid}`);
    }

    return removed;
  }

  /**
   * Check if a release is hidden
   */
  async isReleaseHidden(mbid: string): Promise<boolean> {
    await this.loadItems();
    return this.hiddenReleases.has(mbid);
  }

  /**
   * Get all hidden releases
   */
  async getAllHiddenReleases(): Promise<HiddenRelease[]> {
    await this.loadItems();
    return Array.from(this.hiddenReleases.values());
  }

  /**
   * Clear all hidden releases
   */
  async clearHiddenReleases(): Promise<void> {
    await this.loadItems();
    this.hiddenReleases.clear();
    await this.saveItems();
    this.logger.info('Cleared all hidden releases');
  }

  // ============================================
  // Excluded Artists Methods
  // ============================================

  /**
   * Exclude an artist from release tracking sync
   */
  async excludeArtist(artistName: string, artistMbid?: string): Promise<void> {
    await this.loadItems();

    const normalizedName = this.normalizeArtistName(artistName);
    const excludedItem: ExcludedArtist = {
      artistName,
      normalizedName,
      artistMbid,
      excludedAt: Date.now(),
    };

    this.excludedArtists.set(normalizedName, excludedItem);
    await this.saveItems();

    this.logger.info(`Excluded artist: "${artistName}"`);
  }

  /**
   * Include an artist back in release tracking sync
   */
  async includeArtist(artistName: string): Promise<boolean> {
    await this.loadItems();

    const normalizedName = this.normalizeArtistName(artistName);
    const removed = this.excludedArtists.delete(normalizedName);

    if (removed) {
      await this.saveItems();
      this.logger.info(`Included artist: "${artistName}"`);
    }

    return removed;
  }

  /**
   * Check if an artist is excluded
   */
  async isArtistExcluded(artistName: string): Promise<boolean> {
    await this.loadItems();
    const normalizedName = this.normalizeArtistName(artistName);
    return this.excludedArtists.has(normalizedName);
  }

  /**
   * Get all excluded artists
   */
  async getAllExcludedArtists(): Promise<ExcludedArtist[]> {
    await this.loadItems();
    return Array.from(this.excludedArtists.values());
  }

  /**
   * Clear all excluded artists
   */
  async clearExcludedArtists(): Promise<void> {
    await this.loadItems();
    this.excludedArtists.clear();
    await this.saveItems();
    this.logger.info('Cleared all excluded artists');
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Get counts of hidden/excluded items
   */
  async getCounts(): Promise<{ releases: number; artists: number }> {
    await this.loadItems();
    return {
      releases: this.hiddenReleases.size,
      artists: this.excludedArtists.size,
    };
  }
}
