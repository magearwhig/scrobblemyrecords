import crypto from 'crypto';

import axios, { AxiosInstance } from 'axios';
import OAuth from 'oauth-1.0a';

import {
  EnrichedWishlistItem,
  LocalWantItem,
  LocalWantStore,
  MarketplaceStats,
  NewReleaseSyncStatus,
  PriceSuggestions,
  ReleaseVersion,
  TrackedMasterInfo,
  VersionsCache,
  WishlistItem,
  WishlistNewRelease,
  WishlistNewReleasesStore,
  WishlistNewReleaseSettings,
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
  private readonly LOCAL_WANT_LIST_FILE = 'wishlist/local-want-list.json';
  // Feature 5.5: New release tracking
  private readonly NEW_RELEASES_FILE = 'wishlist/new-releases.json';
  private readonly NEW_RELEASE_SYNC_STATUS_FILE =
    'wishlist/new-release-sync-status.json';

  // New release checking constants
  private readonly MASTERS_PER_BATCH = 20;
  private readonly NEW_RELEASE_MAX_VERSIONS = 100; // For new release checking
  private readonly CHECK_INTERVAL_MS = 1100; // 1.1 sec between API calls
  private readonly MAX_RETRIES = 3;
  private readonly INITIAL_BACKOFF_MS = 2000;
  private readonly MAX_BACKOFF_MS = 60000;

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
    const defaultNewReleaseTracking: WishlistNewReleaseSettings = {
      enabled: true,
      checkFrequencyDays: 7,
      notifyOnNewRelease: true,
      autoCheck: false,
      trackLocalWantList: true,
    };

    const defaults: WishlistSettings = {
      schemaVersion: 1,
      priceThreshold: 40,
      currency: 'USD',
      autoSyncInterval: 24, // Daily
      notifyOnVinylAvailable: true,
      newReleaseTracking: defaultNewReleaseTracking,
    };

    try {
      const settings = await this.fileStorage.readJSON<WishlistSettings>(
        this.SETTINGS_FILE
      );

      if (settings && settings.schemaVersion === 1) {
        // Merge with defaults to ensure newReleaseTracking has all fields
        const mergedNewReleaseTracking: WishlistNewReleaseSettings = {
          enabled:
            settings.newReleaseTracking?.enabled ??
            defaultNewReleaseTracking.enabled,
          checkFrequencyDays:
            settings.newReleaseTracking?.checkFrequencyDays ??
            defaultNewReleaseTracking.checkFrequencyDays,
          notifyOnNewRelease:
            settings.newReleaseTracking?.notifyOnNewRelease ??
            defaultNewReleaseTracking.notifyOnNewRelease,
          autoCheck:
            settings.newReleaseTracking?.autoCheck ??
            defaultNewReleaseTracking.autoCheck,
          trackLocalWantList:
            settings.newReleaseTracking?.trackLocalWantList ??
            defaultNewReleaseTracking.trackLocalWantList,
        };

        return {
          ...defaults,
          ...settings,
          newReleaseTracking: mergedNewReleaseTracking,
        };
      }
    } catch {
      this.logger.debug('No settings file found, using defaults');
    }

    return defaults;
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
   * Note: Discogs API only returns lowest_price in /marketplace/stats
   * We also fetch /marketplace/price_suggestions for price ranges by condition
   */
  async getMarketplaceStats(
    releaseId: number
  ): Promise<MarketplaceStats | null> {
    try {
      const headers = await this.getAuthHeaders();

      // Fetch both stats and price suggestions in parallel
      const [statsResponse, priceSuggestions] = await Promise.all([
        this.axios.get(`/marketplace/stats/${releaseId}`, { headers }),
        this.getPriceSuggestions(releaseId),
      ]);

      const data = statsResponse.data;

      // Calculate estimated price range from price suggestions
      let estimatedLow: number | undefined;
      let estimatedHigh: number | undefined;

      this.logger.debug(
        `Price suggestions received for release ${releaseId}:`,
        priceSuggestions ? 'yes' : 'no'
      );

      if (priceSuggestions) {
        const prices = [
          priceSuggestions.poor?.value,
          priceSuggestions.fair?.value,
          priceSuggestions.good?.value,
          priceSuggestions.goodPlus?.value,
          priceSuggestions.veryGood?.value,
          priceSuggestions.veryGoodPlus?.value,
          priceSuggestions.nearMint?.value,
          priceSuggestions.mint?.value,
        ].filter((p): p is number => p !== undefined && p > 0);

        this.logger.debug(`Filtered prices for release ${releaseId}:`, prices);

        if (prices.length > 0) {
          estimatedLow = Math.min(...prices);
          estimatedHigh = Math.max(...prices);
          this.logger.debug(
            `Price range for release ${releaseId}: ${estimatedLow} - ${estimatedHigh}`
          );
        }
      }

      return {
        lowestPrice: data.lowest_price?.value,
        // Use price suggestions to estimate median and high
        medianPrice:
          priceSuggestions?.veryGoodPlus?.value ||
          priceSuggestions?.veryGood?.value,
        highestPrice: estimatedHigh,
        numForSale: data.num_for_sale || 0,
        currency:
          data.lowest_price?.currency ||
          priceSuggestions?.veryGood?.currency ||
          'USD',
        lastFetched: Date.now(),
        priceSuggestions: priceSuggestions ?? undefined,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to get marketplace stats for release ${releaseId}`,
        error
      );
      return null;
    }
  }

  /**
   * Get price suggestions by condition for a release
   * Requires authentication
   */
  async getPriceSuggestions(
    releaseId: number
  ): Promise<PriceSuggestions | null> {
    try {
      const headers = await this.getAuthHeaders();

      const response = await this.axios.get(
        `/marketplace/price_suggestions/${releaseId}`,
        { headers }
      );

      const data = response.data;
      this.logger.debug(
        `Price suggestions for release ${releaseId}:`,
        JSON.stringify(data)
      );

      const result = {
        mint: data['Mint (M)'],
        nearMint: data['Near Mint (NM or M-)'],
        veryGoodPlus: data['Very Good Plus (VG+)'],
        veryGood: data['Very Good (VG)'],
        goodPlus: data['Good Plus (G+)'],
        good: data['Good (G)'],
        fair: data['Fair (F)'],
        poor: data['Poor (P)'],
      };

      this.logger.debug(`Parsed price suggestions:`, JSON.stringify(result));
      return result;
    } catch (error) {
      this.logger.warn(
        `Failed to get price suggestions for release ${releaseId}`,
        error
      );
      return null;
    }
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

  // ============================================
  // Feature 5.5: New Release Tracking
  // ============================================

  /**
   * Get all tracked master IDs from wishlist and local want list
   */
  async getTrackedMasterIds(): Promise<Map<number, TrackedMasterInfo>> {
    const masterMap = new Map<number, TrackedMasterInfo>();
    const itemsWithoutMasterId: string[] = [];

    // 1. Discogs wishlist items
    const wishlist = await this.getWishlistItems();
    for (const item of wishlist) {
      if (item.masterId) {
        masterMap.set(item.masterId, {
          source: 'wishlist',
          itemId: item.id,
          artistAlbum: `${item.artist} - ${item.title}`,
          coverImage: item.coverImage,
        });
      } else {
        itemsWithoutMasterId.push(
          `${item.artist} - ${item.title} (release ${item.releaseId})`
        );
      }
    }

    // 2. Local want list items (if they have master IDs)
    const localWant = await this.getLocalWantList();
    for (const item of localWant) {
      if (item.masterId && !masterMap.has(item.masterId)) {
        masterMap.set(item.masterId, {
          source: 'local_want',
          itemId: item.id,
          artistAlbum: `${item.artist} - ${item.album}`,
          coverImage: item.coverImage,
        });
      }
    }

    if (itemsWithoutMasterId.length > 0) {
      this.logger.info(
        `${itemsWithoutMasterId.length} wishlist items have no master ID and won't be tracked for new releases`
      );
      this.logger.debug('Items without master ID:', itemsWithoutMasterId);
    }

    return masterMap;
  }

  /**
   * Get the versions cache (for new release detection comparison)
   */
  async getVersionsCache(): Promise<VersionsCache> {
    try {
      const cache = await this.fileStorage.readJSON<VersionsCache>(
        this.VERSIONS_CACHE
      );
      if (cache && cache.schemaVersion === 1) {
        return cache;
      }
    } catch {
      // Cache doesn't exist
    }
    return { schemaVersion: 1, entries: {} };
  }

  /**
   * Update versions cache for a master
   */
  async updateVersionsCache(
    masterId: number,
    versions: ReleaseVersion[]
  ): Promise<void> {
    await this.cacheVersions(masterId, versions);
  }

  /**
   * Determine if an error is retryable (rate limits, service unavailable, network issues)
   */
  private isRetryableError(error: unknown): boolean {
    if (axios.isAxiosError(error)) {
      // HTTP errors that are retryable
      if (error.response?.status === 429 || error.response?.status === 503) {
        return true;
      }
      // Network errors (no response received)
      if (!error.response && error.code) {
        const retryableCodes = [
          'ETIMEDOUT',
          'ECONNRESET',
          'ECONNREFUSED',
          'ENOTFOUND',
          'EAI_AGAIN',
        ];
        return retryableCodes.includes(error.code);
      }
    }
    return false;
  }

  /**
   * Fetch master versions with exponential backoff retry
   */
  private async fetchMasterVersionsWithRetry(
    masterId: number
  ): Promise<ReleaseVersion[]> {
    let delay = this.INITIAL_BACKOFF_MS;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        return await this.fetchMasterVersionsPaginated(masterId);
      } catch (error) {
        const isRetryable = this.isRetryableError(error);

        if (!isRetryable || attempt === this.MAX_RETRIES) {
          throw error;
        }

        this.logger.warn(
          `Retryable error fetching master ${masterId}, retry ${attempt}/${this.MAX_RETRIES} in ${delay}ms`,
          error
        );
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, this.MAX_BACKOFF_MS);
      }
    }

    throw new Error('Max retries exceeded');
  }

  /**
   * Fetch master versions with pagination for new release checking
   * Sorted by newest first, limited to NEW_RELEASE_MAX_VERSIONS
   */
  private async fetchMasterVersionsPaginated(
    masterId: number
  ): Promise<ReleaseVersion[]> {
    const allVersions: ReleaseVersion[] = [];
    let page = 1;
    const perPage = 50; // Discogs max per page

    while (allVersions.length < this.NEW_RELEASE_MAX_VERSIONS) {
      const headers = await this.getAuthHeaders();
      const response = await this.axios.get(`/masters/${masterId}/versions`, {
        headers,
        params: {
          page,
          per_page: perPage,
          sort: 'released',
          sort_order: 'desc',
        },
      });

      const versions = response.data.versions || [];
      if (versions.length === 0) break;

      for (const v of versions) {
        const format = v.format?.split(', ') || [];
        allVersions.push({
          releaseId: v.id,
          title: v.title,
          format,
          label: v.label || '',
          country: v.country || '',
          year: v.released ? parseInt(v.released.substring(0, 4), 10) : 0,
          hasVinyl: this.isVinylFormat(format),
          lastFetched: Date.now(),
        });

        if (allVersions.length >= this.NEW_RELEASE_MAX_VERSIONS) break;
      }

      // Check if there are more pages
      const pagination = response.data.pagination;
      if (!pagination || page >= pagination.pages) break;

      page++;
      await new Promise(r => setTimeout(r, this.CHECK_INTERVAL_MS));
    }

    return allVersions;
  }

  /**
   * Get new release sync status
   */
  async getNewReleaseSyncStatus(): Promise<NewReleaseSyncStatus> {
    try {
      const status = await this.fileStorage.readJSON<NewReleaseSyncStatus>(
        this.NEW_RELEASE_SYNC_STATUS_FILE
      );

      if (status) {
        return status;
      }
    } catch {
      // Status file doesn't exist
    }

    return {
      status: 'idle',
      lastFullCheck: null,
      mastersProcessed: 0,
      totalMasters: 0,
      newReleasesFound: 0,
      lastCheckedIndex: 0,
      progress: 0,
    };
  }

  /**
   * Update new release sync status (partial update)
   */
  async updateNewReleaseSyncStatus(
    updates: Partial<NewReleaseSyncStatus>
  ): Promise<void> {
    const current = await this.getNewReleaseSyncStatus();
    const updated = { ...current, ...updates };
    await this.fileStorage.writeJSON(
      this.NEW_RELEASE_SYNC_STATUS_FILE,
      updated
    );
  }

  /**
   * Get stored new releases
   */
  async getNewReleases(): Promise<WishlistNewReleasesStore> {
    try {
      const store = await this.fileStorage.readJSON<WishlistNewReleasesStore>(
        this.NEW_RELEASES_FILE
      );

      if (store && store.schemaVersion === 1) {
        return store;
      }
    } catch {
      // File doesn't exist
    }

    return {
      schemaVersion: 1,
      lastCheck: 0,
      releases: [],
    };
  }

  /**
   * Save new releases to store and update lastCheck timestamp
   * Always updates lastCheck even if no new releases found
   */
  private async saveNewReleasesAndUpdateLastCheck(
    newReleases: WishlistNewRelease[]
  ): Promise<void> {
    const store = await this.getNewReleases();
    if (newReleases.length > 0) {
      store.releases.push(...newReleases);
    }
    store.lastCheck = Date.now();
    await this.fileStorage.writeJSON(this.NEW_RELEASES_FILE, store);
  }

  /**
   * Dismiss a new release alert
   */
  async dismissNewRelease(releaseId: string): Promise<void> {
    const store = await this.getNewReleases();
    const release = store.releases.find(r => r.id === releaseId);
    if (release) {
      release.dismissed = true;
      await this.fileStorage.writeJSON(this.NEW_RELEASES_FILE, store);
    }
  }

  /**
   * Dismiss multiple new release alerts at once
   */
  async dismissNewReleasesBulk(releaseIds: string[]): Promise<number> {
    const store = await this.getNewReleases();
    let dismissedCount = 0;

    for (const id of releaseIds) {
      const release = store.releases.find(r => r.id === id);
      if (release && !release.dismissed) {
        release.dismissed = true;
        dismissedCount++;
      }
    }

    if (dismissedCount > 0) {
      await this.fileStorage.writeJSON(this.NEW_RELEASES_FILE, store);
    }

    return dismissedCount;
  }

  /**
   * Dismiss all non-dismissed new releases
   */
  async dismissAllNewReleases(): Promise<number> {
    const store = await this.getNewReleases();
    let dismissedCount = 0;

    for (const release of store.releases) {
      if (!release.dismissed) {
        release.dismissed = true;
        dismissedCount++;
      }
    }

    if (dismissedCount > 0) {
      await this.fileStorage.writeJSON(this.NEW_RELEASES_FILE, store);
    }

    return dismissedCount;
  }

  /**
   * Remove old dismissed releases (cleanup)
   */
  async cleanupDismissedReleases(maxAgeDays = 90): Promise<number> {
    const store = await this.getNewReleases();
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    const originalCount = store.releases.length;

    store.releases = store.releases.filter(
      r => !r.dismissed || r.detectedAt > cutoff
    );

    await this.fileStorage.writeJSON(this.NEW_RELEASES_FILE, store);
    return originalCount - store.releases.length;
  }

  /**
   * Check for new releases with batching, retry logic, and progress tracking
   */
  async checkForNewReleases(force = false): Promise<WishlistNewRelease[]> {
    const settings = await this.getSettings();
    if (!settings.newReleaseTracking?.enabled && !force) {
      return [];
    }

    const syncStatus = await this.getNewReleaseSyncStatus();

    // Don't start new check if one is in progress
    if (syncStatus.status === 'syncing') {
      this.logger.warn('New release check already in progress');
      return [];
    }

    const trackedMasters = await this.getTrackedMasterIds();
    const allMasterIds = Array.from(trackedMasters.keys());

    if (allMasterIds.length === 0) {
      this.logger.info('No masters to check for new releases');
      return [];
    }

    // Initialize sync status
    await this.updateNewReleaseSyncStatus({
      status: 'syncing',
      totalMasters: allMasterIds.length,
      mastersProcessed: 0,
      newReleasesFound: 0,
      lastCheckedIndex: syncStatus.lastCheckedIndex || 0,
      progress: 0,
      error: undefined,
    });

    const newReleases: WishlistNewRelease[] = [];
    const versionsCache = await this.getVersionsCache();
    const existingNew = await this.getNewReleases();
    const existingNewIds = new Set(existingNew.releases.map(r => r.id));

    const startIndex = syncStatus.lastCheckedIndex || 0;
    const endIndex = Math.min(
      startIndex + this.MASTERS_PER_BATCH,
      allMasterIds.length
    );

    try {
      for (let i = startIndex; i < endIndex; i++) {
        const masterId = allMasterIds[i];
        const sourceInfo = trackedMasters.get(masterId);

        if (!sourceInfo) continue;

        // Skip if source settings disable this type
        if (
          sourceInfo.source === 'local_want' &&
          !settings.newReleaseTracking?.trackLocalWantList
        ) {
          continue;
        }

        // Update progress
        await this.updateNewReleaseSyncStatus({
          mastersProcessed: i - startIndex + 1,
          progress: Math.round(
            ((i - startIndex + 1) / (endIndex - startIndex)) * 100
          ),
          currentMaster: sourceInfo.artistAlbum,
        });

        // Fetch with retry logic
        let freshVersions: ReleaseVersion[];
        try {
          freshVersions = await this.fetchMasterVersionsWithRetry(masterId);
        } catch (error) {
          this.logger.warn(
            `Failed to fetch versions for master ${masterId}, skipping`,
            error
          );
          continue;
        }

        // Get cached versions (what we knew about before)
        const cachedEntry = versionsCache.entries[masterId];
        const cachedReleaseIds = new Set(
          cachedEntry?.versions.map(v => v.releaseId) || []
        );

        // Find new vinyl releases
        for (const version of freshVersions) {
          if (!cachedReleaseIds.has(version.releaseId) && version.hasVinyl) {
            const releaseId = `${masterId}-${version.releaseId}`;

            // Skip if already tracked
            if (existingNewIds.has(releaseId)) {
              continue;
            }

            const newRelease: WishlistNewRelease = {
              id: releaseId,
              masterId,
              releaseId: version.releaseId,
              title: version.title,
              artist: sourceInfo.artistAlbum.split(' - ')[0],
              year: version.year,
              country: version.country,
              format: version.format,
              label: version.label,
              catalogNumber: undefined,
              lowestPrice: version.marketplaceStats?.lowestPrice,
              priceCurrency: version.marketplaceStats?.currency,
              numForSale: version.marketplaceStats?.numForSale,
              source: sourceInfo.source,
              sourceItemId: sourceInfo.itemId,
              detectedAt: Date.now(),
              notified: false,
              dismissed: false,
              discogsUrl: `https://www.discogs.com/release/${version.releaseId}`,
              coverImage: sourceInfo.coverImage,
            };

            newReleases.push(newRelease);
            existingNewIds.add(releaseId);
          }
        }

        // Update versions cache with fresh data
        await this.updateVersionsCache(masterId, freshVersions);

        // Rate limiting between masters
        await new Promise(r => setTimeout(r, this.CHECK_INTERVAL_MS));
      }

      // Determine if we completed a full cycle
      const completedFullCycle = endIndex >= allMasterIds.length;

      // Save new releases and always update lastCheck timestamp
      await this.saveNewReleasesAndUpdateLastCheck(newReleases);

      // Update sync status
      await this.updateNewReleaseSyncStatus({
        status: 'completed',
        lastCheckedIndex: completedFullCycle ? 0 : endIndex,
        lastFullCheck: completedFullCycle
          ? Date.now()
          : syncStatus.lastFullCheck,
        newReleasesFound: newReleases.length,
        progress: 100,
        currentMaster: undefined,
      });

      this.logger.info(
        `New release check completed: ${newReleases.length} new releases found, ` +
          `${endIndex - startIndex} masters checked`
      );

      return newReleases;
    } catch (error) {
      this.logger.error('New release check failed', error);
      await this.updateNewReleaseSyncStatus({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        lastError: {
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now(),
          retryCount: (syncStatus.lastError?.retryCount || 0) + 1,
        },
      });
      throw error;
    }
  }

  /**
   * Mark new releases as notified
   */
  async markNewReleasesAsNotified(releaseIds: string[]): Promise<void> {
    const store = await this.getNewReleases();
    let modified = false;

    for (const id of releaseIds) {
      const release = store.releases.find(r => r.id === id);
      if (release && !release.notified) {
        release.notified = true;
        modified = true;
      }
    }

    if (modified) {
      await this.fileStorage.writeJSON(this.NEW_RELEASES_FILE, store);
    }
  }
}
