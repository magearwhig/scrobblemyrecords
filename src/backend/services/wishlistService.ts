import crypto from 'crypto';

import axios, { AxiosInstance } from 'axios';
import OAuth from 'oauth-1.0a';

import {
  EnrichedWishlistItem,
  LocalWantItem,
  LocalWantStore,
  MarketplaceStats,
  ReleaseVersion,
  VersionsCache,
  VinylWatchItem,
  VinylWatchStore,
  WishlistItem,
  WishlistSettings,
  WishlistStore,
  WishlistSyncStatus,
} from '../../shared/types';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

import { AuthService } from './authService';

// Cache expiration times
const WISHLIST_CACHE_HOURS = 24;
const VERSIONS_CACHE_DAYS = 7;
// const PRICE_CACHE_HOURS = 24; // Reserved for future use

// Rate limiting
const MAX_VERSIONS_PER_MASTER = 50;
const VINYL_CHECK_BATCH_SIZE = 50; // Check up to 50 items per sync (with rate limiting)

// Vinyl format patterns
const VINYL_FORMATS = [
  'vinyl',
  'lp',
  '12"',
  '10"',
  '7"',
  "12''",
  "10''",
  "7''",
];

export class WishlistService {
  private fileStorage: FileStorage;
  private authService: AuthService;
  private axios: AxiosInstance;
  private oauth: OAuth;
  private baseUrl = 'https://api.discogs.com';
  private logger = createLogger('WishlistService');

  // Cache file paths
  private readonly WISHLIST_CACHE = 'wishlist/wishlist-items.json';
  private readonly VERSIONS_CACHE = 'wishlist/versions-cache.json';
  private readonly SETTINGS_FILE = 'wishlist/settings.json';
  private readonly SYNC_STATUS_FILE = 'wishlist/sync-status.json';
  private readonly WATCH_LIST_FILE = 'wishlist/vinyl-watch-list.json';
  private readonly LOCAL_WANT_LIST_FILE = 'wishlist/local-want-list.json';

  // Track sync state
  private syncInProgress = false;

  constructor(fileStorage: FileStorage, authService: AuthService) {
    this.fileStorage = fileStorage;
    this.authService = authService;

    this.oauth = new OAuth({
      consumer: {
        key: process.env.DISCOGS_CLIENT_ID || '',
        secret: process.env.DISCOGS_CLIENT_SECRET || '',
      },
      signature_method: 'HMAC-SHA1',
      hash_function(base_string, key) {
        return crypto
          .createHmac('sha1', key)
          .update(base_string)
          .digest('base64');
      },
    });

    this.axios = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'User-Agent': 'RecordScrobbles/1.0',
      },
    });

    // Rate limiting interceptor - 1 second between requests
    this.axios.interceptors.request.use(async config => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return config;
    });
  }

  /**
   * Get OAuth headers for authenticated requests
   */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.authService.getDiscogsToken();

    if (!token) {
      throw new Error('No Discogs token available. Please authenticate first.');
    }

    // For Personal Access Token
    if (token.startsWith('Discogs token=')) {
      return {
        Authorization: token,
      };
    }

    // For OAuth token
    const requestData = {
      url: this.baseUrl,
      method: 'GET',
    };

    const tokenObj = JSON.parse(token);
    const oauthHeader = this.oauth.toHeader(
      this.oauth.authorize(requestData, tokenObj)
    );
    return oauthHeader as unknown as Record<string, string>;
  }

  /**
   * Check if a format indicates vinyl
   */
  private isVinylFormat(formats: string[]): boolean {
    const formatStr = formats.join(' ').toLowerCase();

    // Check for vinyl indicators - if ANY vinyl format is present, it's vinyl
    // The presence of vinyl formats should take priority since we're checking
    // individual releases, not combined results
    const hasVinylIndicator = VINYL_FORMATS.some(f => formatStr.includes(f));

    if (hasVinylIndicator) {
      return true;
    }

    // No vinyl indicators found
    return false;
  }

  // ============================================
  // Settings Management
  // ============================================

  /**
   * Get wishlist settings with defaults
   */
  async getSettings(): Promise<WishlistSettings> {
    try {
      const settings = await this.fileStorage.readJSON<WishlistSettings>(
        this.SETTINGS_FILE
      );

      if (settings && settings.schemaVersion === 1) {
        return settings;
      }
    } catch {
      this.logger.debug('No settings file found, using defaults');
    }

    // Return defaults
    return {
      schemaVersion: 1,
      priceThreshold: 40,
      currency: 'USD',
      autoSyncInterval: 24, // Daily
      notifyOnVinylAvailable: true,
    };
  }

  /**
   * Save wishlist settings
   */
  async saveSettings(
    settings: Partial<WishlistSettings>
  ): Promise<WishlistSettings> {
    const current = await this.getSettings();
    const updated: WishlistSettings = {
      ...current,
      ...settings,
      schemaVersion: 1,
    };

    await this.fileStorage.writeJSON(this.SETTINGS_FILE, updated);
    this.logger.info('Wishlist settings saved');
    return updated;
  }

  // ============================================
  // Sync Status Management
  // ============================================

  /**
   * Get current sync status
   */
  async getSyncStatus(): Promise<WishlistSyncStatus> {
    try {
      const status = await this.fileStorage.readJSON<WishlistSyncStatus>(
        this.SYNC_STATUS_FILE
      );

      if (status) {
        return status;
      }
    } catch {
      // No status file exists
    }

    return {
      status: 'idle',
      progress: 0,
      itemsProcessed: 0,
      totalItems: 0,
      vinylChecked: 0,
    };
  }

  /**
   * Update sync status
   */
  private async updateSyncStatus(
    update: Partial<WishlistSyncStatus>
  ): Promise<void> {
    const current = await this.getSyncStatus();
    const updated = { ...current, ...update };
    await this.fileStorage.writeJSON(this.SYNC_STATUS_FILE, updated);
  }

  // ============================================
  // Wishlist Sync
  // ============================================

  /**
   * Sync wishlist from Discogs
   * @param username - Discogs username
   * @param forceRefresh - If true, re-check vinyl status for ALL items (ignores cache)
   */
  async syncWishlist(
    username: string,
    forceRefresh = false
  ): Promise<WishlistSyncStatus> {
    if (this.syncInProgress) {
      this.logger.warn('Sync already in progress');
      return this.getSyncStatus();
    }

    this.syncInProgress = true;
    this.logger.info(
      `Starting wishlist sync for ${username}${forceRefresh ? ' (force refresh)' : ''}`
    );

    try {
      await this.updateSyncStatus({
        status: 'syncing',
        progress: 0,
        itemsProcessed: 0,
        totalItems: 0,
        vinylChecked: 0,
        error: undefined,
      });

      const headers = await this.getAuthHeaders();
      const items: WishlistItem[] = [];
      let page = 1;
      let totalPages = 1;

      // Fetch all wishlist pages
      while (page <= totalPages) {
        this.logger.debug(`Fetching wishlist page ${page} of ${totalPages}`);

        const response = await this.axios.get(`/users/${username}/wants`, {
          headers,
          params: {
            page,
            per_page: 50,
          },
        });

        const { pagination, wants } = response.data;
        totalPages = pagination?.pages || 1;

        for (const want of wants) {
          const item: WishlistItem = {
            id: want.id,
            masterId: want.basic_information?.master_id || 0,
            releaseId: want.basic_information?.id || want.id,
            artist:
              want.basic_information?.artists
                ?.map((a: { name: string }) => a.name)
                .join(', ') || 'Unknown Artist',
            title: want.basic_information?.title || 'Unknown Title',
            year: want.basic_information?.year,
            coverImage: want.basic_information?.cover_image,
            dateAdded: want.date_added,
            notes: want.notes,
            rating: want.rating,
          };

          items.push(item);
        }

        await this.updateSyncStatus({
          progress: Math.min(50, (page / totalPages) * 50),
          itemsProcessed: items.length,
          totalItems: pagination?.items || items.length,
          currentItem:
            items.length > 0
              ? `${items[items.length - 1].artist} - ${items[items.length - 1].title}`
              : undefined,
        });

        page++;
      }

      this.logger.info(`Fetched ${items.length} wishlist items`);

      // Now check vinyl availability for items
      await this.updateSyncStatus({
        status: 'checking_vinyl',
        progress: 50,
      });

      // Load existing cached items to preserve previously checked vinyl status
      const existingItems = await this.getWishlistItems();
      const existingItemsMap = new Map<number, EnrichedWishlistItem>();
      for (const existing of existingItems) {
        if (existing.masterId) {
          existingItemsMap.set(existing.masterId, existing);
        }
      }

      const enrichedItems: EnrichedWishlistItem[] = [];
      let vinylChecked = 0;
      let newVinylChecks = 0; // Count of fresh API calls this session

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        let vinylVersions: ReleaseVersion[] = [];
        let vinylStatus: EnrichedWishlistItem['vinylStatus'] = 'unknown';
        let lowestVinylPrice: number | undefined;
        let priceCurrency: string | undefined;
        let lastChecked: number | undefined;

        // Check if we have existing vinyl data for this item
        // Only trust existing data if the status is not 'unknown' AND we actually have versions data
        const existingItem = item.masterId
          ? existingItemsMap.get(item.masterId)
          : undefined;
        const hasExistingVinylData =
          existingItem &&
          existingItem.vinylStatus !== 'unknown' &&
          existingItem.vinylVersions &&
          existingItem.vinylVersions.length > 0;

        // Use cached data if available and not forcing refresh
        // With forceRefresh, we still respect the batch size to avoid API rate limits
        if (hasExistingVinylData && !forceRefresh) {
          // Preserve existing vinyl data
          vinylVersions = existingItem.vinylVersions;
          vinylStatus = existingItem.vinylStatus;
          lowestVinylPrice = existingItem.lowestVinylPrice;
          priceCurrency = existingItem.priceCurrency;
          lastChecked = existingItem.lastChecked;
          vinylChecked++; // Count as checked (from previous sync)
        } else if (
          item.masterId &&
          (forceRefresh || newVinylChecks < VINYL_CHECK_BATCH_SIZE)
        ) {
          // Need to fetch vinyl data - only if within progressive limit
          try {
            vinylVersions = await this.getMasterVersions(item.masterId);
            newVinylChecks++;
            vinylChecked++;

            const hasVinyl = vinylVersions.some(v => v.hasVinyl);
            vinylStatus = hasVinyl ? 'has_vinyl' : 'cd_only';

            // Get lowest vinyl price
            const vinylWithPrices = vinylVersions.filter(
              v => v.hasVinyl && v.marketplaceStats?.lowestPrice
            );
            if (vinylWithPrices.length > 0) {
              const lowest = vinylWithPrices.reduce((min, v) => {
                const price = v.marketplaceStats?.lowestPrice || Infinity;
                return price < (min.marketplaceStats?.lowestPrice || Infinity)
                  ? v
                  : min;
              });
              lowestVinylPrice = lowest.marketplaceStats?.lowestPrice;
              priceCurrency = lowest.marketplaceStats?.currency;
            }
            lastChecked = Date.now();
          } catch (error) {
            this.logger.warn(
              `Failed to fetch versions for master ${item.masterId}`,
              error
            );
          }
        }

        const enrichedItem: EnrichedWishlistItem = {
          ...item,
          vinylStatus,
          vinylVersions,
          lowestVinylPrice,
          priceCurrency,
          lastChecked,
        };

        enrichedItems.push(enrichedItem);

        await this.updateSyncStatus({
          progress: 50 + (i / items.length) * 50,
          currentItem: `${item.artist} - ${item.title}`,
          vinylChecked,
        });
      }

      this.logger.info(
        `Vinyl check complete: ${vinylChecked} total checked, ${newVinylChecks} new API calls this session`
      );

      // Save to cache
      const store: WishlistStore = {
        schemaVersion: 1,
        lastUpdated: Date.now(),
        items: enrichedItems,
      };

      await this.fileStorage.writeJSON(this.WISHLIST_CACHE, store);

      // Also check local want list for vinyl availability
      // This is a lightweight operation that reuses cached version data
      const localWantItems = await this.getLocalWantList();
      let localVinylChecks = 0;
      for (const localItem of localWantItems) {
        if (localItem.masterId && localItem.vinylStatus === 'unknown') {
          try {
            const versions = await this.getMasterVersions(localItem.masterId);
            const hasVinyl = versions.some(v => v.hasVinyl);
            localItem.vinylStatus = hasVinyl ? 'has_vinyl' : 'cd_only';
            localItem.lastChecked = Date.now();
            localVinylChecks++;
          } catch {
            // Ignore errors for local items
          }
        }
      }

      if (localVinylChecks > 0) {
        const localStore: LocalWantStore = {
          schemaVersion: 1,
          items: localWantItems,
        };
        await this.fileStorage.writeJSON(this.LOCAL_WANT_LIST_FILE, localStore);
        this.logger.info(
          `Also checked ${localVinylChecks} local want items for vinyl`
        );
      }

      await this.updateSyncStatus({
        status: 'completed',
        progress: 100,
        itemsProcessed: enrichedItems.length,
        totalItems: enrichedItems.length,
        vinylChecked,
        lastSyncTimestamp: Date.now(),
      });

      this.logger.info(
        `Wishlist sync completed: ${enrichedItems.length} items, ${vinylChecked} vinyl checks`
      );

      return this.getSyncStatus();
    } catch (error) {
      this.logger.error('Wishlist sync failed', error);

      await this.updateSyncStatus({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Get cached wishlist items
   */
  async getWishlistItems(): Promise<EnrichedWishlistItem[]> {
    try {
      const store = await this.fileStorage.readJSON<WishlistStore>(
        this.WISHLIST_CACHE
      );

      if (store && store.schemaVersion === 1) {
        // Check if cache is stale
        const cacheAge = Date.now() - store.lastUpdated;
        const isStale = cacheAge > WISHLIST_CACHE_HOURS * 60 * 60 * 1000;

        if (isStale) {
          this.logger.debug('Wishlist cache is stale');
        }

        return store.items;
      }
    } catch {
      this.logger.debug('No wishlist cache found');
    }

    return [];
  }

  // ============================================
  // Version/Vinyl Checking
  // ============================================

  /**
   * Get all versions of a master release
   */
  async getMasterVersions(masterId: number): Promise<ReleaseVersion[]> {
    // Check cache first
    const cachedVersions = await this.getCachedVersions(masterId);
    if (cachedVersions) {
      return cachedVersions;
    }

    this.logger.debug(`Fetching versions for master ${masterId}`);

    try {
      const headers = await this.getAuthHeaders();
      const versions: ReleaseVersion[] = [];
      let page = 1;
      let totalPages = 1;

      while (page <= totalPages && versions.length < MAX_VERSIONS_PER_MASTER) {
        const response = await this.axios.get(`/masters/${masterId}/versions`, {
          headers,
          params: {
            page,
            per_page: 50,
          },
        });

        const { pagination, versions: versionData } = response.data;
        totalPages = pagination?.pages || 1;

        for (const v of versionData) {
          if (versions.length >= MAX_VERSIONS_PER_MASTER) break;

          const format = v.format?.split(', ') || [];
          const hasVinyl = this.isVinylFormat(format);

          const version: ReleaseVersion = {
            releaseId: v.id,
            title: v.title,
            format,
            label: v.label,
            country: v.country,
            year: v.released ? parseInt(v.released.split('-')[0], 10) : 0,
            hasVinyl,
            lastFetched: Date.now(),
          };

          versions.push(version);
        }

        page++;
      }

      // Cache the versions
      await this.cacheVersions(masterId, versions);

      this.logger.debug(
        `Found ${versions.length} versions for master ${masterId}`
      );
      return versions;
    } catch (error) {
      this.logger.error(
        `Failed to fetch versions for master ${masterId}`,
        error
      );
      return [];
    }
  }

  /**
   * Get cached versions for a master
   */
  private async getCachedVersions(
    masterId: number
  ): Promise<ReleaseVersion[] | null> {
    try {
      const cache = await this.fileStorage.readJSON<VersionsCache>(
        this.VERSIONS_CACHE
      );

      if (cache && cache.schemaVersion === 1 && cache.entries[masterId]) {
        const entry = cache.entries[masterId];
        const cacheAge = Date.now() - entry.fetchedAt;
        const isValid = cacheAge < VERSIONS_CACHE_DAYS * 24 * 60 * 60 * 1000;

        if (isValid) {
          this.logger.debug(`Using cached versions for master ${masterId}`);
          return entry.versions;
        }
      }
    } catch {
      // Cache doesn't exist or is invalid
    }

    return null;
  }

  /**
   * Cache versions for a master
   */
  private async cacheVersions(
    masterId: number,
    versions: ReleaseVersion[]
  ): Promise<void> {
    let cache: VersionsCache;

    try {
      const existing = await this.fileStorage.readJSON<VersionsCache>(
        this.VERSIONS_CACHE
      );

      if (existing && existing.schemaVersion === 1) {
        cache = existing;
      } else {
        cache = { schemaVersion: 1, entries: {} };
      }
    } catch {
      cache = { schemaVersion: 1, entries: {} };
    }

    cache.entries[masterId] = {
      masterId,
      versions,
      fetchedAt: Date.now(),
    };

    await this.fileStorage.writeJSON(this.VERSIONS_CACHE, cache);
  }

  /**
   * Get marketplace stats for a release
   */
  async getMarketplaceStats(
    releaseId: number
  ): Promise<MarketplaceStats | null> {
    try {
      const headers = await this.getAuthHeaders();

      const response = await this.axios.get(`/marketplace/stats/${releaseId}`, {
        headers,
      });

      const data = response.data;

      return {
        lowestPrice: data.lowest_price?.value,
        medianPrice: data.median_price?.value,
        highestPrice: data.highest_price?.value,
        numForSale: data.num_for_sale || 0,
        currency: data.lowest_price?.currency || 'USD',
        lastFetched: Date.now(),
      };
    } catch (error) {
      this.logger.warn(
        `Failed to get marketplace stats for release ${releaseId}`,
        error
      );
      return null;
    }
  }

  // ============================================
  // Watch List Management
  // ============================================

  /**
   * Get vinyl watch list
   */
  async getWatchList(): Promise<VinylWatchItem[]> {
    try {
      const store = await this.fileStorage.readJSON<VinylWatchStore>(
        this.WATCH_LIST_FILE
      );

      if (store && store.schemaVersion === 1) {
        return store.items;
      }
    } catch {
      // No watch list exists
    }

    return [];
  }

  /**
   * Add item to vinyl watch list
   */
  async addToWatchList(
    item: Omit<VinylWatchItem, 'addedAt' | 'notified'>
  ): Promise<void> {
    const watchList = await this.getWatchList();

    // Check if already watching
    if (watchList.some(w => w.masterId === item.masterId)) {
      this.logger.debug(`Already watching master ${item.masterId}`);
      return;
    }

    const watchItem: VinylWatchItem = {
      ...item,
      addedAt: Date.now(),
      notified: false,
    };

    watchList.push(watchItem);

    const store: VinylWatchStore = {
      schemaVersion: 1,
      items: watchList,
    };

    await this.fileStorage.writeJSON(this.WATCH_LIST_FILE, store);
    this.logger.info(
      `Added ${item.artist} - ${item.title} to vinyl watch list`
    );
  }

  /**
   * Remove item from vinyl watch list
   */
  async removeFromWatchList(masterId: number): Promise<boolean> {
    const watchList = await this.getWatchList();
    const index = watchList.findIndex(w => w.masterId === masterId);

    if (index === -1) {
      return false;
    }

    watchList.splice(index, 1);

    const store: VinylWatchStore = {
      schemaVersion: 1,
      items: watchList,
    };

    await this.fileStorage.writeJSON(this.WATCH_LIST_FILE, store);
    this.logger.info(`Removed master ${masterId} from vinyl watch list`);
    return true;
  }

  /**
   * Check watch list for newly available vinyl
   * Returns items that now have vinyl available
   */
  async checkWatchListForVinyl(): Promise<VinylWatchItem[]> {
    const watchList = await this.getWatchList();
    const newlyAvailable: VinylWatchItem[] = [];

    for (const item of watchList) {
      if (item.notified) continue; // Already notified

      try {
        const versions = await this.getMasterVersions(item.masterId);
        const hasVinyl = versions.some(v => v.hasVinyl);

        if (hasVinyl) {
          newlyAvailable.push(item);

          // Mark as notified
          item.notified = true;
          item.lastChecked = Date.now();
        }
      } catch {
        this.logger.warn(
          `Failed to check vinyl for watch item ${item.masterId}`
        );
      }
    }

    // Save updated watch list
    if (newlyAvailable.length > 0) {
      const store: VinylWatchStore = {
        schemaVersion: 1,
        items: watchList,
      };
      await this.fileStorage.writeJSON(this.WATCH_LIST_FILE, store);
    }

    return newlyAvailable;
  }

  // ============================================
  // Discogs Wantlist API (Add/Remove)
  // ============================================

  /**
   * Search Discogs for a release by artist and album
   * Returns master releases that match the search
   */
  async searchForRelease(
    artist: string,
    album: string
  ): Promise<
    {
      masterId: number;
      releaseId: number;
      title: string;
      artist: string;
      year?: number;
      coverImage?: string;
      formats: string[];
    }[]
  > {
    try {
      const headers = await this.getAuthHeaders();

      // Use separate artist and release_title params for more precise matching
      // instead of a generic 'q' query which can match unrelated results
      const response = await this.axios.get('/database/search', {
        headers,
        params: {
          artist,
          release_title: album,
          type: 'master',
          per_page: 10,
        },
      });

      const results = response.data.results || [];

      return results.map(
        (result: {
          master_id?: number;
          id: number;
          title: string;
          year?: string;
          cover_image?: string;
          format?: string[];
        }) => {
          // Discogs returns title in format "Artist - Album Title" or "Artist* - Album Title (...)"
          // Parse out the actual artist and album from the combined title
          let resultArtist = artist; // fallback to search artist
          let resultTitle = result.title;

          const titleParts = result.title.split(' - ');
          if (titleParts.length >= 2) {
            // First part is artist (may have trailing * for various artists)
            resultArtist = titleParts[0].replace(/\*$/, '').trim();
            // Rest is album title (may have extra info in parentheses)
            resultTitle = titleParts.slice(1).join(' - ').trim();
          }

          return {
            masterId: result.master_id || result.id,
            releaseId: result.id,
            title: resultTitle,
            artist: resultArtist,
            year: result.year ? parseInt(result.year, 10) : undefined,
            coverImage: result.cover_image,
            formats: result.format || [],
          };
        }
      );
    } catch (error) {
      this.logger.error('Error searching Discogs', error);
      throw error;
    }
  }

  /**
   * Add a release to the user's Discogs wantlist
   */
  async addToDiscogsWantlist(
    releaseId: number,
    notes?: string,
    rating?: number
  ): Promise<boolean> {
    try {
      const userSettings = await this.authService.getUserSettings();
      const username = userSettings.discogs.username;

      if (!username) {
        throw new Error('Discogs username not found');
      }

      const headers = await this.getAuthHeaders();

      const body: { notes?: string; rating?: number } = {};
      if (notes) body.notes = notes;
      if (rating !== undefined) body.rating = rating;

      await this.axios.put(`/users/${username}/wants/${releaseId}`, body, {
        headers,
      });

      this.logger.info(`Added release ${releaseId} to Discogs wantlist`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to add release ${releaseId} to wantlist`,
        error
      );
      throw error;
    }
  }

  /**
   * Remove a release from the user's Discogs wantlist
   */
  async removeFromDiscogsWantlist(releaseId: number): Promise<boolean> {
    try {
      const userSettings = await this.authService.getUserSettings();
      const username = userSettings.discogs.username;

      if (!username) {
        throw new Error('Discogs username not found');
      }

      const headers = await this.getAuthHeaders();

      await this.axios.delete(`/users/${username}/wants/${releaseId}`, {
        headers,
      });

      this.logger.info(`Removed release ${releaseId} from Discogs wantlist`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to remove release ${releaseId} from wantlist`,
        error
      );
      throw error;
    }
  }

  // ============================================
  // Local Want List Management
  // ============================================

  /**
   * Generate a unique ID for a local want item
   */
  private generateLocalWantId(artist: string, album: string): string {
    const hash = crypto
      .createHash('md5')
      .update(`${artist.toLowerCase()}:${album.toLowerCase()}`)
      .digest('hex')
      .substring(0, 12);
    return hash;
  }

  /**
   * Get the local want list
   */
  async getLocalWantList(): Promise<LocalWantItem[]> {
    try {
      const store = await this.fileStorage.readJSON<LocalWantStore>(
        this.LOCAL_WANT_LIST_FILE
      );

      if (store && store.schemaVersion === 1) {
        return store.items;
      }
    } catch {
      // No local want list exists
    }

    return [];
  }

  /**
   * Add an album to the local want list (from Discovery page)
   */
  async addToLocalWantList(item: {
    artist: string;
    album: string;
    playCount: number;
    lastPlayed: number;
  }): Promise<LocalWantItem> {
    const wantList = await this.getLocalWantList();
    const id = this.generateLocalWantId(item.artist, item.album);

    // Check if already in list
    const existing = wantList.find(w => w.id === id);
    if (existing) {
      this.logger.debug(
        `Already in local want list: ${item.artist} - ${item.album}`
      );
      return existing;
    }

    // Search Discogs to get masterId and cover image
    let masterId: number | undefined;
    let releaseId: number | undefined;
    let coverImage: string | undefined;

    try {
      const searchResults = await this.searchForRelease(
        item.artist,
        item.album
      );
      if (searchResults.length > 0) {
        masterId = searchResults[0].masterId;
        releaseId = searchResults[0].releaseId;
        coverImage = searchResults[0].coverImage;
      }
    } catch (error) {
      this.logger.warn(
        `Failed to search Discogs for ${item.artist} - ${item.album}`,
        error
      );
    }

    const wantItem: LocalWantItem = {
      id,
      artist: item.artist,
      album: item.album,
      playCount: item.playCount,
      lastPlayed: item.lastPlayed,
      addedAt: Date.now(),
      source: 'discovery',
      masterId,
      releaseId,
      coverImage,
      vinylStatus: 'unknown',
      notified: false,
    };

    wantList.push(wantItem);

    const store: LocalWantStore = {
      schemaVersion: 1,
      items: wantList,
    };

    await this.fileStorage.writeJSON(this.LOCAL_WANT_LIST_FILE, store);
    this.logger.info(
      `Added to local want list: ${item.artist} - ${item.album}`
    );

    return wantItem;
  }

  /**
   * Remove an album from the local want list
   */
  async removeFromLocalWantList(id: string): Promise<boolean> {
    const wantList = await this.getLocalWantList();
    const index = wantList.findIndex(w => w.id === id);

    if (index === -1) {
      return false;
    }

    wantList.splice(index, 1);

    const store: LocalWantStore = {
      schemaVersion: 1,
      items: wantList,
    };

    await this.fileStorage.writeJSON(this.LOCAL_WANT_LIST_FILE, store);
    this.logger.info(`Removed from local want list: ${id}`);

    return true;
  }

  /**
   * Check local want list items for vinyl availability
   * Returns items that newly have vinyl available
   */
  async checkLocalWantListForVinyl(): Promise<LocalWantItem[]> {
    const wantList = await this.getLocalWantList();
    const newlyAvailable: LocalWantItem[] = [];

    for (const item of wantList) {
      // Skip if no masterId (couldn't find on Discogs)
      if (!item.masterId) {
        // Try to search again
        try {
          const searchResults = await this.searchForRelease(
            item.artist,
            item.album
          );
          if (searchResults.length > 0) {
            item.masterId = searchResults[0].masterId;
            item.releaseId = searchResults[0].releaseId;
            item.coverImage = searchResults[0].coverImage;
          }
        } catch {
          continue;
        }
      }

      if (!item.masterId) continue;

      // Check vinyl availability
      const previousStatus = item.vinylStatus;

      try {
        const versions = await this.getMasterVersions(item.masterId);
        const hasVinyl = versions.some(v => v.hasVinyl);

        item.vinylStatus = hasVinyl ? 'has_vinyl' : 'cd_only';
        item.lastChecked = Date.now();

        // If vinyl just became available, track it
        if (hasVinyl && previousStatus !== 'has_vinyl') {
          item.vinylAvailableSince = Date.now();
          if (!item.notified) {
            newlyAvailable.push(item);
          }
        }
      } catch (error) {
        this.logger.warn(
          `Failed to check vinyl for local want item ${item.id}`,
          error
        );
      }
    }

    // Save updated list
    const store: LocalWantStore = {
      schemaVersion: 1,
      items: wantList,
    };
    await this.fileStorage.writeJSON(this.LOCAL_WANT_LIST_FILE, store);

    return newlyAvailable;
  }

  /**
   * Mark a local want item as notified
   */
  async markLocalWantAsNotified(id: string): Promise<void> {
    const wantList = await this.getLocalWantList();
    const item = wantList.find(w => w.id === id);

    if (item) {
      item.notified = true;

      const store: LocalWantStore = {
        schemaVersion: 1,
        items: wantList,
      };
      await this.fileStorage.writeJSON(this.LOCAL_WANT_LIST_FILE, store);
    }
  }
}
