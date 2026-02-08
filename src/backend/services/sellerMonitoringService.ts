import crypto from 'crypto';

import axios, { AxiosInstance } from 'axios';
import OAuth from 'oauth-1.0a';

import {
  MonitoredSeller,
  MonitoredSellersStore,
  SellerInventoryCache,
  SellerInventoryItem,
  SellerMatch,
  SellerMatchesStore,
  SellerMonitoringSettings,
  SellerScanStatus,
} from '../../shared/types';
import { safeJsonParse } from '../../shared/utils/safeJsonParse';
import { getDiscogsAxios } from '../utils/discogsAxios';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

import { AuthService } from './authService';
import { WishlistService } from './wishlistService';

// Scan timing constants
const FULL_SCAN_INTERVAL_DAYS = 7;
const QUICK_CHECK_INTERVAL_HOURS = 24;
const INVENTORY_CACHE_HOURS = 6; // Reduced from 24h for fresher data
const STALE_MATCH_PRUNE_DAYS = 30;

// Retry constants for rate limiting
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 5000; // 5 seconds
const MAX_RETRY_DELAY_MS = 60000; // 60 seconds

// Rate limit delay between API calls (in addition to existing 1s interceptor)
const API_CALL_DELAY_MS = 200;

// How old a master's cached releases can be before we refresh them (in days)
// This catches new pressings/reissues for albums already in the cache
const MASTER_RELEASE_REFRESH_DAYS = 30;

// Release cache for mapping release_id -> master_id
interface ReleaseMasterCache {
  // Maps release_id -> master_id
  releaseToMaster: Record<number, number>;
  // Maps master_id -> { releases: number[], fetchedAt: timestamp }
  masterToReleases: Record<number, { releases: number[]; fetchedAt: number }>;
  // When this cache was last updated
  lastUpdated: number;
  // Schema version for cache migration
  schemaVersion?: number;
}

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

export class SellerMonitoringService {
  private fileStorage: FileStorage;
  private authService: AuthService;
  private wishlistService: WishlistService;
  private axios: AxiosInstance;
  private oauth: OAuth;
  private baseUrl = 'https://api.discogs.com';
  private logger = createLogger('SellerMonitoringService');

  // File paths
  private readonly SELLERS_FILE = 'sellers/monitored-sellers.json';
  private readonly MATCHES_FILE = 'sellers/matches.json';
  private readonly SCAN_STATUS_FILE = 'sellers/scan-status.json';
  private readonly SETTINGS_FILE = 'sellers/settings.json';
  private readonly INVENTORY_CACHE_DIR = 'sellers/inventory-cache';
  private readonly RELEASE_CACHE_FILE = 'sellers/release-master-cache.json';

  // In-memory release cache (loaded from file on first use)
  private releaseCache: ReleaseMasterCache | null = null;

  // Track scan state
  private scanInProgress = false;
  private initialized = false;

  constructor(
    fileStorage: FileStorage,
    authService: AuthService,
    wishlistService: WishlistService
  ) {
    this.fileStorage = fileStorage;
    this.authService = authService;
    this.wishlistService = wishlistService;

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

    this.axios = getDiscogsAxios();

    // Initialize on construction (reset stale scan status)
    this.initialize();
  }

  /**
   * Initialize the service - reset scan status if it was left in a bad state
   * This handles the case where the server was stopped during a scan
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const status = await this.fileStorage.readJSON<SellerScanStatus>(
        this.SCAN_STATUS_FILE
      );

      // If status shows scanning/matching but no scan is actually running,
      // reset to idle (this happens when server restarts during a scan)
      if (
        status &&
        (status.status === 'scanning' || status.status === 'matching')
      ) {
        this.logger.info(
          `Resetting stale scan status from '${status.status}' to 'idle' (server restart detected)`
        );
        await this.updateScanStatus({
          status: 'idle',
          progress: 0,
          sellersScanned: 0,
          totalSellers: 0,
          newMatches: 0,
          error: undefined,
          currentSeller: undefined,
          currentPage: undefined,
          totalPages: undefined,
          matchingProgress: undefined,
        });
      }
    } catch {
      // No status file exists, nothing to reset
    }
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

    const parsed = safeJsonParse<{ key: string; secret: string }>(token);
    if (!parsed.success) {
      throw new Error(`Corrupted Discogs OAuth token: ${parsed.error.message}`);
    }
    const oauthHeader = this.oauth.toHeader(
      this.oauth.authorize(requestData, parsed.data)
    );
    return oauthHeader as unknown as Record<string, string>;
  }

  /**
   * Sanitize username for safe file storage
   * Replaces problematic characters with underscores
   */
  private getCacheKey(username: string): string {
    return username.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  }

  /**
   * Execute a request with retry logic for rate-limit errors (403/429)
   * Uses exponential backoff between retries
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    let lastError: Error | undefined;
    let delay = INITIAL_RETRY_DELAY_MS;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check for Discogs API pagination limit (returns 403 but not a rate limit)
        const isPaginationLimit =
          axios.isAxiosError(error) &&
          error.response?.status === 403 &&
          error.response?.data?.message?.includes(
            'Pagination above 100 disabled'
          );

        if (isPaginationLimit) {
          // This is a hard API limit, not a rate limit - don't retry
          throw error;
        }

        // Check if this is a rate-limit error (403 or 429)
        const isRateLimitError =
          axios.isAxiosError(error) &&
          (error.response?.status === 403 || error.response?.status === 429);

        if (!isRateLimitError || attempt === MAX_RETRIES) {
          // Non-rate-limit error or last attempt - throw immediately
          throw error;
        }

        this.logger.warn(
          `Rate limit hit for ${context} (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay / 1000}s...`
        );

        // Wait before retrying with exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, MAX_RETRY_DELAY_MS);
      }
    }

    // Should never reach here, but TypeScript needs this
    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Check if a format indicates vinyl
   */
  private isVinylFormat(formats: string[]): boolean {
    const formatStr = formats.join(' ').toLowerCase();
    return VINYL_FORMATS.some(f => formatStr.includes(f));
  }

  // ============================================
  // Settings Management
  // ============================================

  /**
   * Get seller monitoring settings with defaults
   */
  async getSettings(): Promise<SellerMonitoringSettings> {
    try {
      const settings =
        await this.fileStorage.readJSON<SellerMonitoringSettings>(
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
      scanFrequencyDays: FULL_SCAN_INTERVAL_DAYS,
      quickCheckFrequencyHours: QUICK_CHECK_INTERVAL_HOURS,
      notifyOnNewMatch: true,
      vinylFormatsOnly: true,
    };
  }

  /**
   * Save seller monitoring settings
   */
  async saveSettings(
    settings: Partial<SellerMonitoringSettings>
  ): Promise<SellerMonitoringSettings> {
    const current = await this.getSettings();
    const updated: SellerMonitoringSettings = {
      ...current,
      ...settings,
      schemaVersion: 1,
    };

    await this.fileStorage.writeJSON(this.SETTINGS_FILE, updated);
    this.logger.info('Seller monitoring settings saved');
    return updated;
  }

  // ============================================
  // Scan Status Management
  // ============================================

  /**
   * Get current scan status
   */
  async getScanStatus(): Promise<SellerScanStatus> {
    try {
      const status = await this.fileStorage.readJSON<SellerScanStatus>(
        this.SCAN_STATUS_FILE
      );

      if (status) {
        return status;
      }
    } catch {
      // No status file exists
    }

    return {
      status: 'idle',
      sellersScanned: 0,
      totalSellers: 0,
      progress: 0,
      newMatches: 0,
    };
  }

  /**
   * Update scan status
   */
  private async updateScanStatus(
    update: Partial<SellerScanStatus>
  ): Promise<void> {
    const current = await this.getScanStatus();
    const updated = { ...current, ...update };
    await this.fileStorage.writeJSON(this.SCAN_STATUS_FILE, updated);
  }

  // ============================================
  // Seller Management
  // ============================================

  /**
   * Get all monitored sellers
   */
  async getSellers(): Promise<MonitoredSeller[]> {
    try {
      const store = await this.fileStorage.readJSON<MonitoredSellersStore>(
        this.SELLERS_FILE
      );

      if (store && store.schemaVersion === 1) {
        return store.sellers;
      }
    } catch {
      this.logger.debug('No sellers file found');
    }

    return [];
  }

  /**
   * Validate that a seller exists on Discogs
   */
  async validateSellerExists(username: string): Promise<{
    valid: boolean;
    error?: string;
    info?: { username: string; id: number; inventoryCount: number };
  }> {
    try {
      const headers = await this.getAuthHeaders();

      const response = await this.axios.get(`/users/${username}`, {
        headers,
      });

      return {
        valid: true,
        info: {
          username: response.data.username,
          id: response.data.id,
          inventoryCount: response.data.seller_num_for_sale || 0,
        },
      };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return { valid: false, error: 'User not found on Discogs' };
      }
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Add a seller to monitor
   */
  async addSeller(
    username: string,
    displayName?: string
  ): Promise<MonitoredSeller> {
    const sellers = await this.getSellers();

    // Check if already monitoring
    if (
      sellers.some(s => s.username.toLowerCase() === username.toLowerCase())
    ) {
      throw new Error('Already monitoring this seller');
    }

    // Validate seller exists
    const validation = await this.validateSellerExists(username);
    if (!validation.valid || !validation.info) {
      throw new Error(validation.error || 'Invalid seller');
    }

    const seller: MonitoredSeller = {
      username: validation.info.username, // Use canonical username from Discogs
      displayName: displayName || validation.info.username,
      addedAt: Date.now(),
      inventorySize: validation.info.inventoryCount,
      matchCount: 0,
    };

    sellers.push(seller);

    const store: MonitoredSellersStore = {
      schemaVersion: 1,
      sellers,
    };

    await this.fileStorage.writeJSON(this.SELLERS_FILE, store);
    this.logger.info(`Added seller: ${seller.username}`);

    return seller;
  }

  /**
   * Remove a seller from monitoring
   */
  async removeSeller(username: string): Promise<boolean> {
    const sellers = await this.getSellers();
    const index = sellers.findIndex(
      s => s.username.toLowerCase() === username.toLowerCase()
    );

    if (index === -1) {
      return false;
    }

    const removed = sellers.splice(index, 1)[0];

    const store: MonitoredSellersStore = {
      schemaVersion: 1,
      sellers,
    };

    await this.fileStorage.writeJSON(this.SELLERS_FILE, store);

    // Also remove cached inventory
    try {
      const cacheKey = this.getCacheKey(removed.username);
      await this.fileStorage.delete(
        `${this.INVENTORY_CACHE_DIR}/${cacheKey}.json`
      );
    } catch {
      // Ignore cache deletion errors
    }

    // Remove matches for this seller
    const matchesStore = await this.getMatchesStore();
    matchesStore.matches = matchesStore.matches.filter(
      m => m.sellerId.toLowerCase() !== username.toLowerCase()
    );
    await this.fileStorage.writeJSON(this.MATCHES_FILE, matchesStore);

    this.logger.info(`Removed seller: ${username}`);
    return true;
  }

  // ============================================
  // Matches Management
  // ============================================

  /**
   * Get the matches store
   */
  private async getMatchesStore(): Promise<SellerMatchesStore> {
    try {
      const store = await this.fileStorage.readJSON<SellerMatchesStore>(
        this.MATCHES_FILE
      );

      if (store && store.schemaVersion === 1) {
        return store;
      }
    } catch {
      // No matches file exists
    }

    return {
      schemaVersion: 1,
      lastUpdated: Date.now(),
      matches: [],
    };
  }

  /**
   * Get all matches
   */
  async getAllMatches(): Promise<SellerMatch[]> {
    const store = await this.getMatchesStore();
    return store.matches;
  }

  /**
   * Get matches for a specific seller
   */
  async getMatchesBySeller(username: string): Promise<SellerMatch[]> {
    const store = await this.getMatchesStore();
    return store.matches.filter(
      m => m.sellerId.toLowerCase() === username.toLowerCase()
    );
  }

  /**
   * Mark a match as seen
   */
  async markMatchAsSeen(matchId: string): Promise<void> {
    const store = await this.getMatchesStore();
    const match = store.matches.find(m => m.id === matchId);

    if (match) {
      match.status = 'seen';
      store.lastUpdated = Date.now();
      await this.fileStorage.writeJSON(this.MATCHES_FILE, store);
      this.logger.debug(`Marked match ${matchId} as seen`);
    }
  }

  /**
   * Mark a match as notified (called by frontend after creating notification)
   */
  async markMatchAsNotified(matchId: string): Promise<void> {
    const store = await this.getMatchesStore();
    const match = store.matches.find(m => m.id === matchId);

    if (match) {
      match.notified = true;
      store.lastUpdated = Date.now();
      await this.fileStorage.writeJSON(this.MATCHES_FILE, store);
      this.logger.debug(`Marked match ${matchId} as notified`);
    }
  }

  /**
   * Verify if a specific listing is still available on Discogs
   * Returns true if listing exists and is available, false if sold/unavailable
   */
  async verifyListingStatus(
    listingId: number
  ): Promise<{ available: boolean; error?: string }> {
    try {
      const headers = await this.getAuthHeaders();

      // Discogs marketplace listing endpoint
      const response = await this.executeWithRetry(
        () =>
          this.axios.get(`/marketplace/listings/${listingId}`, {
            headers,
          }),
        `verify listing ${listingId}`
      );

      // If we get a 200 response, listing exists and is available
      if (response.status === 200 && response.data) {
        return { available: true };
      }

      return { available: false };
    } catch (error) {
      // 404 means listing was sold or removed
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return { available: false };
      }

      // Other errors - we can't determine status
      this.logger.error(`Error verifying listing ${listingId}:`, error);
      return {
        available: false,
        error:
          error instanceof Error ? error.message : 'Failed to verify listing',
      };
    }
  }

  /**
   * Verify and update the status of a single match
   * Called by frontend when user clicks "Refresh" on a sold item
   */
  async verifyAndUpdateMatch(
    matchId: string
  ): Promise<{ updated: boolean; status: string; error?: string }> {
    this.logger.info(
      `[verifyAndUpdateMatch] Starting verification for match ${matchId}`
    );
    const store = await this.getMatchesStore();
    const match = store.matches.find(m => m.id === matchId);

    if (!match) {
      this.logger.warn(`[verifyAndUpdateMatch] Match ${matchId} not found`);
      return { updated: false, status: 'not_found', error: 'Match not found' };
    }

    this.logger.info(
      `[verifyAndUpdateMatch] Found match: ${match.artist} - ${match.title}, current status: ${match.status}`
    );
    const result = await this.verifyListingStatus(match.listingId);
    this.logger.info(
      `[verifyAndUpdateMatch] Listing verification result: available=${result.available}, error=${result.error}`
    );

    if (result.error) {
      // Couldn't verify - mark as unverified
      match.statusConfidence = 'unverified';
      match.lastVerifiedAt = Date.now();
      store.lastUpdated = Date.now();
      await this.fileStorage.writeJSON(this.MATCHES_FILE, store);
      return { updated: true, status: match.status, error: result.error };
    }

    const previousStatus = match.status;

    if (result.available) {
      // Listing is still available
      if (match.status === 'sold') {
        // Was marked as sold but is actually still available - reactivate
        match.status = 'active';
        match.statusChangedAt = Date.now();
        this.logger.info(
          `Match ${matchId} was marked as sold but is still available - reactivated`
        );
      }
      match.statusConfidence = 'verified';
    } else {
      // Listing is not available
      if (match.status !== 'sold') {
        match.status = 'sold';
        match.statusChangedAt = Date.now();
      }
      match.statusConfidence = 'verified';
    }

    match.lastVerifiedAt = Date.now();
    store.lastUpdated = Date.now();
    this.logger.info(
      `[verifyAndUpdateMatch] Saving match with new status: ${match.status} (was: ${previousStatus})`
    );
    await this.fileStorage.writeJSON(this.MATCHES_FILE, store);
    this.logger.info(`[verifyAndUpdateMatch] Saved successfully`);

    // Update seller's matchCount if status changed
    if (previousStatus !== match.status) {
      const sellers = await this.getSellers();
      const seller = sellers.find(
        s => s.username.toLowerCase() === match.sellerId.toLowerCase()
      );
      if (seller) {
        const activeMatches = store.matches.filter(
          m =>
            m.sellerId.toLowerCase() === seller.username.toLowerCase() &&
            m.status !== 'sold'
        );
        seller.matchCount = activeMatches.length;
        const sellersStore: MonitoredSellersStore = {
          schemaVersion: 1,
          sellers,
        };
        await this.fileStorage.writeJSON(this.SELLERS_FILE, sellersStore);
        this.logger.info(
          `[verifyAndUpdateMatch] Updated ${seller.displayName} matchCount to ${seller.matchCount}`
        );
      }
    }

    return {
      updated: previousStatus !== match.status,
      status: match.status,
    };
  }

  /**
   * Get all matches with cache information
   */
  async getAllMatchesWithCacheInfo(): Promise<{
    matches: SellerMatch[];
    cacheInfo: {
      lastUpdated: number;
      oldestScanAge: number;
      nextScanDue: number;
    };
  }> {
    const store = await this.getMatchesStore();
    this.logger.debug(
      `[getAllMatchesWithCacheInfo] Loaded ${store.matches.length} matches`
    );
    this.logger.debug(
      `[getAllMatchesWithCacheInfo] Match statuses: ${JSON.stringify(store.matches.map(m => ({ id: m.id, status: m.status })))}`
    );
    const sellers = await this.getSellers();

    // Calculate oldest scan age
    let oldestScanTime = Date.now();
    for (const seller of sellers) {
      const scanTime = seller.lastScanned || 0;
      if (scanTime > 0 && scanTime < oldestScanTime) {
        oldestScanTime = scanTime;
      }
    }

    const oldestScanAge = Date.now() - oldestScanTime;

    // Calculate when next scan is due based on cache TTL
    const cacheMaxAge = INVENTORY_CACHE_HOURS * 60 * 60 * 1000;
    const nextScanDue = Math.max(0, cacheMaxAge - oldestScanAge);

    return {
      matches: store.matches,
      cacheInfo: {
        lastUpdated: store.lastUpdated,
        oldestScanAge,
        nextScanDue,
      },
    };
  }

  /**
   * Remove stale matches (sold > 30 days)
   */
  async removeStaleMatches(): Promise<number> {
    const store = await this.getMatchesStore();
    const cutoff = Date.now() - STALE_MATCH_PRUNE_DAYS * 24 * 60 * 60 * 1000;

    const before = store.matches.length;
    store.matches = store.matches.filter(m => {
      // Keep active and seen matches
      if (m.status === 'active' || m.status === 'seen') return true;
      // Keep sold matches younger than cutoff
      return m.dateFound > cutoff;
    });

    const removed = before - store.matches.length;

    if (removed > 0) {
      store.lastUpdated = Date.now();
      await this.fileStorage.writeJSON(this.MATCHES_FILE, store);
      this.logger.info(`Pruned ${removed} stale matches`);
    }

    return removed;
  }

  // ============================================
  // Inventory Scanning
  // ============================================

  /**
   * Get cached inventory for a seller
   */
  private async getCachedInventory(
    username: string
  ): Promise<SellerInventoryCache | null> {
    try {
      const cacheKey = this.getCacheKey(username);
      const cache = await this.fileStorage.readJSON<SellerInventoryCache>(
        `${this.INVENTORY_CACHE_DIR}/${cacheKey}.json`
      );

      if (cache) {
        const cacheAge = Date.now() - cache.fetchedAt;
        const isValid = cacheAge < INVENTORY_CACHE_HOURS * 60 * 60 * 1000;

        if (isValid) {
          this.logger.debug(`Using cached inventory for ${username}`);
          return cache;
        }
      }
    } catch {
      // No cache exists
    }

    return null;
  }

  /**
   * Save inventory cache for a seller
   */
  private async cacheInventory(cache: SellerInventoryCache): Promise<void> {
    const cacheKey = this.getCacheKey(cache.username);
    await this.fileStorage.writeJSON(
      `${this.INVENTORY_CACHE_DIR}/${cacheKey}.json`,
      cache
    );
  }

  /**
   * Fetch seller inventory from Discogs with retry logic and incremental progress saving
   * @param username Seller username
   * @param pagesLimit Max pages to fetch (1 for quick check, undefined for full)
   */
  private async fetchSellerInventory(
    username: string,
    pagesLimit?: number
  ): Promise<{
    items: SellerInventoryItem[];
    totalItems: number;
    isComplete: boolean;
  }> {
    const headers = await this.getAuthHeaders();
    const items: SellerInventoryItem[] = [];
    let page = 1;
    let totalPages = 1;
    let totalItems = 0;

    // Check for partial progress from a previous failed scan
    const partialCache = await this.getPartialScanProgress(username);
    this.logger.debug(
      `fetchSellerInventory for ${username}: pagesLimit=${pagesLimit}, partialCache=${partialCache ? `${partialCache.items.length} items from page ${partialCache.lastCompletedPage}` : 'null'}`
    );
    if (partialCache && !pagesLimit) {
      // Resume from partial progress for full scans only
      items.push(...partialCache.items);
      page = partialCache.lastCompletedPage + 1;
      totalPages = partialCache.totalPages;
      totalItems = partialCache.totalItems;
      this.logger.info(
        `Resuming scan for ${username} from page ${page}/${totalPages} (${items.length} items already fetched)`
      );
    }

    while (page <= totalPages && (!pagesLimit || page <= pagesLimit)) {
      this.logger.debug(
        `Fetching inventory page ${page}/${totalPages} for ${username}`
      );

      await this.updateScanStatus({
        currentPage: page,
        totalPages,
      });

      try {
        const response = await this.executeWithRetry(
          () =>
            this.axios.get(`/users/${username}/inventory`, {
              headers,
              params: {
                page,
                per_page: 100,
                sort: 'listed',
                sort_order: 'desc',
              },
            }),
          `inventory page ${page} for ${username}`
        );

        const { pagination, listings } = response.data;
        totalPages = pagination?.pages || 1;
        totalItems = pagination?.items || 0;

        for (const listing of listings) {
          // Skip items without release info
          if (!listing.release?.id) {
            continue;
          }

          // Normalize price from Discogs format
          const priceValue =
            typeof listing.price?.value === 'number'
              ? listing.price.value
              : parseFloat(listing.price?.value) || 0;

          // Note: Discogs Marketplace Inventory API does NOT return master_id
          // The release object contains: id, artist, title, format, year, thumbnail, etc.
          // but NOT master_id. We match on releaseId instead.
          const item: SellerInventoryItem = {
            listingId: listing.id,
            releaseId: listing.release.id,
            masterId: undefined, // Not available from inventory API
            artist: listing.release.artist || 'Unknown Artist',
            title: listing.release.title || 'Unknown Title',
            // format comes as a string like "12\", EP" - split by comma
            format: listing.release.format
              ? listing.release.format.split(', ').map((f: string) => f.trim())
              : [],
            condition: `${listing.condition || '?'}/${listing.sleeve_condition || '?'}`,
            price: priceValue,
            currency: listing.price?.currency || 'USD',
            listingUrl:
              listing.uri || `https://www.discogs.com/sell/item/${listing.id}`,
            coverImage: listing.release.thumbnail,
            listedAt: listing.posted,
          };

          items.push(item);
        }

        // Save progress after each successful page (for full scans only)
        if (!pagesLimit && page < totalPages) {
          await this.savePartialScanProgress(username, {
            items,
            lastCompletedPage: page,
            totalPages,
            totalItems,
            savedAt: Date.now(),
          });
        }

        page++;
      } catch (error) {
        // Check for Discogs API 100-page limit for other users' inventories
        // API returns 403: {"message": "Pagination above 100 disabled for inventories besides your own"}
        const axiosError = axios.isAxiosError(error) ? error : null;
        const responseMessage = axiosError?.response?.data?.message || '';
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const isPageLimitError =
          responseMessage.includes('Pagination above 100 disabled') ||
          errorMessage.includes('Pagination above 100 disabled');

        if (isPageLimitError && items.length > 0) {
          // Discogs limits to 100 pages when viewing other users' inventories
          // But we can fetch the remaining items by using reverse sort order (oldest first)
          // Items beyond page 100 in desc order are the OLDEST items - they appear on page 1 in asc order
          const missingItems = totalItems - items.length;
          const missingPages = Math.ceil(missingItems / 100);

          if (missingPages > 0 && missingPages <= 100) {
            this.logger.info(
              `Discogs API 100-page limit reached for ${username}. Fetching ${missingItems} remaining items (${missingPages} pages) using reverse sort order...`
            );

            // Fetch the missing pages using ascending sort (oldest first)
            const reverseItems = await this.fetchReversePages(
              username,
              missingPages,
              headers
            );

            if (reverseItems.length > 0) {
              // Deduplicate by listingId (in case of overlap at page boundaries)
              const existingIds = new Set(items.map(i => i.listingId));
              const uniqueReverseItems = reverseItems.filter(
                i => !existingIds.has(i.listingId)
              );
              items.push(...uniqueReverseItems);
              this.logger.info(
                `Fetched ${reverseItems.length} items from reverse sort, ${uniqueReverseItems.length} unique. Total: ${items.length}/${totalItems}`
              );
            }
          } else if (missingPages > 100) {
            this.logger.warn(
              `Seller ${username} has ${totalItems} items (${totalPages} pages) - exceeds 200 page combined limit. Missing ${missingItems} items.`
            );
          }

          // Clear partial progress since we've fetched everything we can
          if (!pagesLimit) {
            await this.clearPartialScanProgress(username);
          }
          // Return as complete - we've fetched everything available via API
          return { items, totalItems, isComplete: true };
        }

        // If we have partial progress, keep it for resume on next scan
        // DON'T clear the partial - it will be resumed next time
        if (items.length > 0 && !pagesLimit) {
          this.logger.warn(
            `Partial scan for ${username}: got ${items.length} items from ${page - 1}/${totalPages} pages. Will resume from page ${page} next time.`
          );
          // Return partial results for matching (better than nothing)
          // Mark as incomplete so caller knows not to cache this as a "full" scan
          return { items, totalItems, isComplete: false };
        }
        // No items fetched at all - this is a real failure
        throw error;
      }
    }

    // Clear partial progress on successful completion
    if (!pagesLimit) {
      await this.clearPartialScanProgress(username);
    }

    this.logger.debug(
      `Fetched ${items.length} inventory items for ${username}`
    );
    return { items, totalItems, isComplete: true };
  }

  /**
   * Fetch pages from a seller's inventory using ascending sort order (oldest first).
   * Used to get items beyond the 100-page limit when sorted descending.
   * @param username Seller username
   * @param pagesToFetch Number of pages to fetch from the beginning (in asc order)
   * @param headers Auth headers
   */
  private async fetchReversePages(
    username: string,
    pagesToFetch: number,
    headers: Record<string, string>
  ): Promise<SellerInventoryItem[]> {
    const items: SellerInventoryItem[] = [];

    for (let page = 1; page <= pagesToFetch; page++) {
      this.logger.debug(
        `Fetching reverse inventory page ${page}/${pagesToFetch} for ${username}`
      );

      try {
        const response = await this.executeWithRetry(
          () =>
            this.axios.get(`/users/${username}/inventory`, {
              headers,
              params: {
                page,
                per_page: 100,
                sort: 'listed',
                sort_order: 'asc', // Ascending = oldest first
              },
            }),
          `reverse inventory page ${page} for ${username}`
        );

        const { listings } = response.data;

        for (const listing of listings) {
          if (!listing.release?.id) {
            continue;
          }

          const priceValue =
            typeof listing.price?.value === 'number'
              ? listing.price.value
              : parseFloat(listing.price?.value) || 0;

          const item: SellerInventoryItem = {
            listingId: listing.id,
            releaseId: listing.release.id,
            masterId: undefined,
            artist: listing.release.artist || 'Unknown Artist',
            title: listing.release.title || 'Unknown Title',
            format: listing.release.format
              ? listing.release.format.split(', ').map((f: string) => f.trim())
              : [],
            condition: `${listing.condition || '?'}/${listing.sleeve_condition || '?'}`,
            price: priceValue,
            currency: listing.price?.currency || 'USD',
            listingUrl:
              listing.uri || `https://www.discogs.com/sell/item/${listing.id}`,
            coverImage: listing.release.thumbnail,
            listedAt: listing.posted,
          };

          items.push(item);
        }
      } catch (error) {
        this.logger.error(
          `Error fetching reverse page ${page} for ${username}:`,
          error
        );
        // Return what we have so far
        break;
      }
    }

    return items;
  }

  /**
   * Get partial scan progress for a seller (if previous scan was interrupted)
   */
  private async getPartialScanProgress(username: string): Promise<{
    items: SellerInventoryItem[];
    lastCompletedPage: number;
    totalPages: number;
    totalItems: number;
    savedAt: number;
  } | null> {
    try {
      const cacheKey = this.getCacheKey(username);
      const progress = await this.fileStorage.readJSON<{
        items: SellerInventoryItem[];
        lastCompletedPage: number;
        totalPages: number;
        totalItems: number;
        savedAt: number;
      }>(`${this.INVENTORY_CACHE_DIR}/${cacheKey}-partial.json`);

      if (progress) {
        // Only use partial progress if it's less than 24 hours old
        const ageHours = (Date.now() - progress.savedAt) / (1000 * 60 * 60);
        if (ageHours < 24) {
          return progress;
        }
        // Stale partial progress - clear it
        this.logger.debug(`Clearing stale partial progress for ${username}`);
        await this.clearPartialScanProgress(username);
      }
    } catch (error) {
      // Log any error reading partial progress
      this.logger.debug(
        `Error reading partial progress for ${username}:`,
        error
      );
    }
    return null;
  }

  /**
   * Save partial scan progress for resumability
   */
  private async savePartialScanProgress(
    username: string,
    progress: {
      items: SellerInventoryItem[];
      lastCompletedPage: number;
      totalPages: number;
      totalItems: number;
      savedAt: number;
    }
  ): Promise<void> {
    const cacheKey = this.getCacheKey(username);
    await this.fileStorage.writeJSON(
      `${this.INVENTORY_CACHE_DIR}/${cacheKey}-partial.json`,
      progress
    );
  }

  /**
   * Clear partial scan progress after successful completion
   */
  private async clearPartialScanProgress(username: string): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(username);
      await this.fileStorage.delete(
        `${this.INVENTORY_CACHE_DIR}/${cacheKey}-partial.json`
      );
    } catch {
      // Ignore errors if file doesn't exist
    }
  }

  // =====================================================
  // Release-to-Master Cache Methods
  // =====================================================

  /**
   * Load the release-to-master cache from disk
   * Handles migration from old schema (arrays) to new schema (objects with timestamps)
   */
  private async loadReleaseCache(): Promise<ReleaseMasterCache> {
    if (this.releaseCache) {
      return this.releaseCache;
    }

    try {
      const cache = await this.fileStorage.readJSON<any>(
        this.RELEASE_CACHE_FILE
      );
      if (cache) {
        // Check if migration is needed (old schema used arrays, new uses objects)
        if (cache.schemaVersion !== 2 && cache.masterToReleases) {
          this.logger.info(
            'Migrating release cache to new schema with timestamps...'
          );
          const migratedMasterToReleases: Record<
            number,
            { releases: number[]; fetchedAt: number }
          > = {};

          for (const [masterId, releases] of Object.entries(
            cache.masterToReleases
          )) {
            // Old format: number[], new format: { releases: number[], fetchedAt: number }
            if (Array.isArray(releases)) {
              migratedMasterToReleases[Number(masterId)] = {
                releases: releases as number[],
                fetchedAt: cache.lastUpdated || Date.now(), // Use lastUpdated as approximate fetch time
              };
            } else {
              // Already in new format
              migratedMasterToReleases[Number(masterId)] = releases as {
                releases: number[];
                fetchedAt: number;
              };
            }
          }

          cache.masterToReleases = migratedMasterToReleases;
          cache.schemaVersion = 2;
          this.logger.info(
            `Migrated ${Object.keys(migratedMasterToReleases).length} masters to new schema`
          );
        }

        this.releaseCache = cache;
        this.logger.debug(
          `Loaded release cache: ${Object.keys(cache.releaseToMaster).length} releases, ${Object.keys(cache.masterToReleases).length} masters`
        );
        return cache;
      }
    } catch {
      // Cache doesn't exist yet
    }

    // Initialize empty cache with new schema
    this.releaseCache = {
      releaseToMaster: {},
      masterToReleases: {},
      lastUpdated: Date.now(),
      schemaVersion: 2,
    };
    return this.releaseCache;
  }

  /**
   * Save the release-to-master cache to disk
   */
  private async saveReleaseCache(): Promise<void> {
    if (!this.releaseCache) return;

    this.releaseCache.lastUpdated = Date.now();
    await this.fileStorage.writeJSON(
      this.RELEASE_CACHE_FILE,
      this.releaseCache
    );
    this.logger.debug(
      `Saved release cache: ${Object.keys(this.releaseCache.releaseToMaster).length} releases`
    );
  }

  /**
   * Add a release->master mapping to the cache
   * @param releaseId The release ID
   * @param masterId The master ID
   * @param updateTimestamp If true, update the fetchedAt timestamp for the master
   */
  private addToReleaseCache(
    releaseId: number,
    masterId: number,
    updateTimestamp = false
  ): void {
    if (!this.releaseCache) return;

    this.releaseCache.releaseToMaster[releaseId] = masterId;

    // Also update the reverse mapping
    if (!this.releaseCache.masterToReleases[masterId]) {
      this.releaseCache.masterToReleases[masterId] = {
        releases: [],
        fetchedAt: Date.now(),
      };
    }
    if (
      !this.releaseCache.masterToReleases[masterId].releases.includes(releaseId)
    ) {
      this.releaseCache.masterToReleases[masterId].releases.push(releaseId);
    }
    if (updateTimestamp) {
      this.releaseCache.masterToReleases[masterId].fetchedAt = Date.now();
    }
  }

  /**
   * Get cached master_id for a release, or undefined if not cached
   */
  private getCachedMasterId(releaseId: number): number | undefined {
    return this.releaseCache?.releaseToMaster[releaseId];
  }

  /**
   * Check if a release_id belongs to any of the wishlist master IDs
   * Uses local cache first, falls back to API lookup if needed
   */
  private async getMasterIdForRelease(
    releaseId: number,
    _wishlistMasterIds: Set<number>
  ): Promise<number | undefined> {
    // First check the cache
    const cachedMasterId = this.getCachedMasterId(releaseId);
    if (cachedMasterId !== undefined) {
      return cachedMasterId;
    }

    // Not in cache - need to call API
    // Add small delay before API call to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, API_CALL_DELAY_MS));

    const masterId = await this.lookupMasterId(releaseId);
    if (masterId !== undefined) {
      // Add to cache for future lookups
      this.addToReleaseCache(releaseId, masterId);
    }

    return masterId;
  }

  /**
   * Fetch all releases for a master_id from Discogs API
   * This pre-populates the cache so subsequent scans don't need API calls
   */
  private async fetchReleasesForMaster(masterId: number): Promise<number[]> {
    const releaseIds: number[] = [];

    try {
      const headers = await this.getAuthHeaders();
      let page = 1;
      let hasMore = true;
      let isFirstRelease = true;

      while (hasMore) {
        // Rate limit delay
        await new Promise(resolve => setTimeout(resolve, API_CALL_DELAY_MS));

        const response = await this.executeWithRetry(
          () =>
            this.axios.get(`/masters/${masterId}/versions`, {
              headers,
              params: {
                page,
                per_page: 100,
              },
            }),
          `fetch versions for master ${masterId} page ${page}`
        );

        const versions = response.data?.versions || [];
        for (const version of versions) {
          if (version.id) {
            releaseIds.push(version.id);
            // Update timestamp on first release to mark when we fetched this master
            this.addToReleaseCache(version.id, masterId, isFirstRelease);
            isFirstRelease = false;
          }
        }

        // Check if there are more pages
        const pagination = response.data?.pagination;
        hasMore = pagination && page < pagination.pages;
        page++;
      }

      this.logger.debug(
        `Fetched ${releaseIds.length} releases for master ${masterId}`
      );
    } catch (error) {
      this.logger.warn(
        `Failed to fetch releases for master ${masterId}`,
        error
      );
    }

    return releaseIds;
  }

  /**
   * Pre-populate the release cache with all releases for wishlist master IDs
   * This makes subsequent inventory scans much faster (no API calls needed)
   * Also refreshes stale masters (older than MASTER_RELEASE_REFRESH_DAYS) to catch new pressings
   */
  async refreshReleaseCache(): Promise<{
    mastersProcessed: number;
    releasesAdded: number;
    staleRefreshed: number;
  }> {
    await this.loadReleaseCache();
    const wishlistMasterIds = await this.getWishlistMasterIds();
    const now = Date.now();
    const staleThreshold =
      now - MASTER_RELEASE_REFRESH_DAYS * 24 * 60 * 60 * 1000;

    this.logger.info(
      `Refreshing release cache for ${wishlistMasterIds.size} wishlist masters...`
    );

    let mastersProcessed = 0;
    let staleRefreshed = 0;
    let releasesAdded = 0;
    const startReleaseCount = Object.keys(
      this.releaseCache!.releaseToMaster
    ).length;

    for (const masterId of wishlistMasterIds) {
      const existing = this.releaseCache!.masterToReleases[masterId];
      const existingReleases = existing?.releases?.length || 0;
      const fetchedAt = existing?.fetchedAt || 0;
      const isStale = fetchedAt < staleThreshold;

      // Skip if we have recent releases for this master (not stale)
      if (existingReleases > 0 && !isStale) {
        this.logger.debug(
          `Skipping master ${masterId} - have ${existingReleases} releases, fetched ${Math.round((now - fetchedAt) / (24 * 60 * 60 * 1000))} days ago`
        );
        continue;
      }

      if (isStale && existingReleases > 0) {
        this.logger.debug(
          `Refreshing stale master ${masterId} - ${existingReleases} releases, last fetched ${Math.round((now - fetchedAt) / (24 * 60 * 60 * 1000))} days ago`
        );
        staleRefreshed++;
      }

      await this.fetchReleasesForMaster(masterId);
      mastersProcessed++;

      // Save periodically in case of interruption
      if (mastersProcessed % 10 === 0) {
        await this.saveReleaseCache();
        this.logger.info(
          `Cache refresh progress: ${mastersProcessed} masters processed (${staleRefreshed} stale refreshed)`
        );
      }
    }

    await this.saveReleaseCache();

    releasesAdded =
      Object.keys(this.releaseCache!.releaseToMaster).length -
      startReleaseCount;
    this.logger.info(
      `Release cache refresh complete: ${mastersProcessed} masters processed, ${staleRefreshed} stale refreshed, ${releasesAdded} new releases added`
    );

    return { mastersProcessed, releasesAdded, staleRefreshed };
  }

  /**
   * Update the release cache for specific master IDs
   * Called after wishlist sync to fetch releases for any new masters
   * @param masterIds The master IDs to update
   * @returns Number of new releases added
   */
  async updateCacheForMasters(masterIds: number[]): Promise<{
    mastersProcessed: number;
    releasesAdded: number;
  }> {
    if (masterIds.length === 0) {
      return { mastersProcessed: 0, releasesAdded: 0 };
    }

    await this.loadReleaseCache();

    this.logger.info(
      `Updating release cache for ${masterIds.length} new masters from wishlist...`
    );

    let mastersProcessed = 0;
    const startReleaseCount = Object.keys(
      this.releaseCache!.releaseToMaster
    ).length;

    for (const masterId of masterIds) {
      // Skip if we already have releases for this master
      const existing = this.releaseCache!.masterToReleases[masterId];
      if (existing?.releases?.length > 0) {
        this.logger.debug(
          `Skipping master ${masterId} - already have ${existing.releases.length} releases cached`
        );
        continue;
      }

      await this.fetchReleasesForMaster(masterId);
      mastersProcessed++;

      // Save periodically
      if (mastersProcessed % 5 === 0) {
        await this.saveReleaseCache();
      }
    }

    if (mastersProcessed > 0) {
      await this.saveReleaseCache();
    }

    const releasesAdded =
      Object.keys(this.releaseCache!.releaseToMaster).length -
      startReleaseCount;

    this.logger.info(
      `Cache update for new wishlist masters complete: ${mastersProcessed} masters, ${releasesAdded} releases added`
    );

    return { mastersProcessed, releasesAdded };
  }

  /**
   * Get cache statistics for diagnostics
   */
  async getReleaseCacheStats(): Promise<{
    totalReleases: number;
    totalMasters: number;
    lastUpdated: number;
    staleMasters: number;
  }> {
    const cache = await this.loadReleaseCache();
    const now = Date.now();
    const staleThreshold =
      now - MASTER_RELEASE_REFRESH_DAYS * 24 * 60 * 60 * 1000;

    let staleMasters = 0;
    for (const data of Object.values(cache.masterToReleases)) {
      if (data.fetchedAt < staleThreshold) {
        staleMasters++;
      }
    }

    return {
      totalReleases: Object.keys(cache.releaseToMaster).length,
      totalMasters: Object.keys(cache.masterToReleases).length,
      lastUpdated: cache.lastUpdated,
      staleMasters,
    };
  }

  /**
   * Check if the release cache is "complete" for matching purposes.
   * Complete means: all wishlist masters have been fetched (no stale masters).
   * When complete, we can skip API calls for releases not in cache - they're not on wishlist.
   */
  private async isCacheCompleteForMatching(
    wishlistMasterIds: Set<number>
  ): Promise<boolean> {
    if (!this.releaseCache) return false;

    const now = Date.now();
    const staleThreshold =
      now - MASTER_RELEASE_REFRESH_DAYS * 24 * 60 * 60 * 1000;

    // Check if all wishlist masters are in cache and not stale
    for (const masterId of wishlistMasterIds) {
      const cached = this.releaseCache.masterToReleases[masterId];
      if (
        !cached ||
        cached.releases.length === 0 ||
        cached.fetchedAt < staleThreshold
      ) {
        return false;
      }
    }

    return true;
  }

  // =====================================================
  // End Release-to-Master Cache Methods
  // =====================================================

  /**
   * Get wishlist master IDs from both Discogs wishlist and local want list
   * Since Discogs Inventory API doesn't return master_id, we need to look it up
   * for each release. We use the wishlist's masterId for matching.
   */
  private async getWishlistMasterIds(): Promise<Set<number>> {
    const masterIds = new Set<number>();

    // Get Discogs wishlist items
    const wishlistItems = await this.wishlistService.getWishlistItems();
    for (const item of wishlistItems) {
      if (item.masterId) {
        masterIds.add(item.masterId);
      }
    }

    // Get local want list items
    const localWantItems = await this.wishlistService.getLocalWantList();
    for (const item of localWantItems) {
      if (item.masterId) {
        masterIds.add(item.masterId);
      }
    }

    return masterIds;
  }

  /**
   * Look up master_id for a release from Discogs API
   * Returns undefined if not found or on error
   */
  private async lookupMasterId(releaseId: number): Promise<number | undefined> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await this.axios.get(`/releases/${releaseId}`, {
        headers,
      });
      return response.data?.master_id;
    } catch (error) {
      this.logger.debug(
        `Failed to lookup master_id for release ${releaseId}`,
        error
      );
      return undefined;
    }
  }

  /**
   * Match inventory items against wishlist
   * Since Discogs inventory API doesn't provide master_id, we look it up for
   * vinyl items and match against the wishlist's masterId.
   * Uses persistent release cache to minimize API calls.
   */
  private async matchInventoryToWishlist(
    items: SellerInventoryItem[],
    sellerId: string,
    existingMatches: SellerMatch[]
  ): Promise<SellerMatch[]> {
    const settings = await this.getSettings();
    const wishlistMasterIds = await this.getWishlistMasterIds();
    const matches: SellerMatch[] = [];

    // Load the persistent release cache
    await this.loadReleaseCache();

    // Map existing matches by listing ID for lookup
    const existingByListingId = new Map<number, SellerMatch>();
    for (const match of existingMatches) {
      if (match.sellerId.toLowerCase() === sellerId.toLowerCase()) {
        existingByListingId.set(match.listingId, match);
      }
    }

    // Track cache stats for logging
    let cacheHits = 0;
    let apiCalls = 0;
    let skippedFormats = 0;
    let skippedExisting = 0;
    let skippedNotInCache = 0;
    let itemsProcessed = 0;
    const totalItems = items.length;

    // Check if cache is complete - if so, we can skip API calls for releases not in cache
    const cacheIsComplete =
      await this.isCacheCompleteForMatching(wishlistMasterIds);
    if (cacheIsComplete) {
      this.logger.info(
        'Release cache is complete - skipping API calls for releases not in cache'
      );
    }

    // Update status to matching phase
    await this.updateScanStatus({
      status: 'matching',
      matchingProgress: {
        itemsProcessed: 0,
        totalItems,
        cacheHits: 0,
        apiCalls: 0,
      },
    });

    // In-memory cache for this scan (for releases we look up via API)
    const sessionCache = new Map<number, number | undefined>();

    for (const item of items) {
      itemsProcessed++;

      // Check vinyl format filter first (before expensive lookups)
      if (settings.vinylFormatsOnly && !this.isVinylFormat(item.format)) {
        skippedFormats++;
        continue;
      }

      // Check if we already have this match (use existing master_id if available)
      const existing = existingByListingId.get(item.listingId);
      if (existing) {
        // Update existing match (keep existing status, notified flag, masterId, etc.)
        matches.push({
          ...existing,
          price: item.price,
          currency: item.currency,
          condition: item.condition,
          // Don't overwrite status - it might be 'seen'
        });
        skippedExisting++;
        continue;
      }

      // Look up master_id for this release
      // 1. Check persistent cache first
      // 2. If cache is complete and not found, skip (not on wishlist)
      // 3. Check session cache (releases looked up this scan)
      // 4. Fall back to API call
      let masterId = this.getCachedMasterId(item.releaseId);

      if (masterId !== undefined) {
        cacheHits++;
      } else if (cacheIsComplete) {
        // Cache is complete and release not found - it's not on wishlist, skip
        skippedNotInCache++;
        continue;
      } else if (sessionCache.has(item.releaseId)) {
        masterId = sessionCache.get(item.releaseId);
        // Already counted, no stats change needed
      } else {
        // Need to call API - add delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, API_CALL_DELAY_MS));
        masterId = await this.lookupMasterId(item.releaseId);
        sessionCache.set(item.releaseId, masterId);
        apiCalls++;

        // Add to persistent cache for future scans
        if (masterId !== undefined) {
          this.addToReleaseCache(item.releaseId, masterId);
        }

        // Log progress every 100 API calls
        if (apiCalls % 100 === 0) {
          this.logger.info(
            `Master ID lookup progress: ${apiCalls} API calls, ${cacheHits} cache hits`
          );
        }
      }

      // Update matching progress every 50 items
      if (itemsProcessed % 50 === 0) {
        await this.updateScanStatus({
          matchingProgress: {
            itemsProcessed,
            totalItems,
            cacheHits,
            apiCalls,
          },
        });
      }

      // Check if this release's master_id is in our wishlist
      if (!masterId || !wishlistMasterIds.has(masterId)) {
        continue;
      }

      // Create new match with deterministic ID
      const match: SellerMatch = {
        id: item.listingId.toString(),
        sellerId,
        releaseId: item.releaseId,
        masterId,
        artist: item.artist,
        title: item.title,
        format: item.format,
        condition: item.condition,
        price: item.price,
        currency: item.currency,
        listingUrl: item.listingUrl,
        listingId: item.listingId,
        dateFound: Date.now(),
        notified: false,
        status: 'active',
        coverImage: item.coverImage,
      };

      matches.push(match);
    }

    // Save the cache to disk (new lookups will be persisted for future scans)
    if (apiCalls > 0) {
      await this.saveReleaseCache();
    }

    // Final matching progress update
    await this.updateScanStatus({
      matchingProgress: {
        itemsProcessed: totalItems,
        totalItems,
        cacheHits,
        apiCalls,
      },
    });

    // Log matching statistics
    this.logger.info(
      `Matching complete for ${sellerId}: ${items.length} items processed, ` +
        `${skippedFormats} non-vinyl skipped, ${skippedExisting} existing matches, ` +
        `${cacheHits} cache hits, ${skippedNotInCache} skipped (not in cache), ` +
        `${apiCalls} API calls, ${matches.length} matches found`
    );

    return matches;
  }

  /**
   * Scan a single seller's inventory
   * @param fullScan If true, fetch all pages. If false, quick check (page 1 only)
   * @param matchesStore The matches store to update in place
   * @param forceFresh If true, always re-fetch from API even if cache is fresh
   */
  private async scanSeller(
    seller: MonitoredSeller,
    fullScan: boolean,
    matchesStore: SellerMatchesStore,
    forceFresh = false
  ): Promise<{ newMatches: SellerMatch[]; updatedMatches: SellerMatch[] }> {
    this.logger.info(
      `Scanning ${seller.username} (${fullScan ? 'full' : 'quick'}${forceFresh ? ', force fresh' : ''})`
    );

    await this.updateScanStatus({
      currentSeller: seller.displayName || seller.username,
    });

    let items: SellerInventoryItem[];
    let totalItems: number;
    let fetchWasComplete = true; // Track whether we got a complete inventory

    // Check for fresh cached inventory (unless forceFresh is set)
    const inventoryCache = !forceFresh
      ? await this.getCachedInventory(seller.username)
      : null;
    const hasFreshCache = inventoryCache && inventoryCache.items.length > 0;

    // Also check for partial scan progress as fallback cache
    const partialCache =
      !forceFresh && !hasFreshCache
        ? await this.getPartialScanProgress(seller.username)
        : null;
    const hasPartialCache = partialCache && partialCache.items.length > 0;

    this.logger.info(
      `Cache check for ${seller.username}: forceFresh=${forceFresh}, hasFreshCache=${hasFreshCache}, hasPartialCache=${hasPartialCache}, fullScan=${fullScan}, partialItems=${partialCache?.items?.length || 0}`
    );

    if (!fullScan) {
      // Quick scan - use cache if fresh, otherwise fetch page 1
      if (hasFreshCache) {
        this.logger.debug(
          `Using cached inventory for quick scan of ${seller.username}`
        );
        items = inventoryCache.items;
        totalItems = inventoryCache.totalItems;
      } else if (hasPartialCache) {
        this.logger.debug(
          `Using partial cache for quick scan of ${seller.username} (${partialCache.items.length} items)`
        );
        items = partialCache.items;
        totalItems = partialCache.totalItems;
        fetchWasComplete = false; // Partial is not complete
      } else {
        // No valid cache, fetch from API
        const result = await this.fetchSellerInventory(seller.username, 1);
        items = result.items;
        totalItems = result.totalItems;
        fetchWasComplete = result.isComplete;
      }
    } else if (hasFreshCache && !forceFresh) {
      // Full scan with COMPLETE cache - check for new items from page 1
      this.logger.info(
        `Checking for new items in ${seller.username} (have full cache with ${inventoryCache.items.length} items)`
      );

      const cachedListingIds = new Set(
        inventoryCache.items.map(i => i.listingId)
      );
      const newItems: SellerInventoryItem[] = [];
      let page = 1;
      let keepFetching = true;
      let latestTotalItems = inventoryCache.totalItems;

      while (keepFetching) {
        const pageResult = await this.fetchSellerInventory(
          seller.username,
          page
        );
        const pageItems = pageResult.items;
        latestTotalItems = pageResult.totalItems;

        if (pageItems.length === 0) {
          // No more pages
          keepFetching = false;
          break;
        }

        // Check how many items on this page are new (not in cache)
        const newOnThisPage = pageItems.filter(
          i => !cachedListingIds.has(i.listingId)
        );
        const existingOnThisPage = pageItems.length - newOnThisPage.length;

        if (existingOnThisPage > 0) {
          // Found some cached items - add only the new ones and stop
          newItems.push(...newOnThisPage);
          this.logger.info(
            `Page ${page}: ${newOnThisPage.length} new, ${existingOnThisPage} existing - stopping`
          );
          keepFetching = false;
        } else {
          // All items on this page are new - keep fetching
          newItems.push(...pageItems);
          this.logger.info(
            `Page ${page}: all ${pageItems.length} items are new, continuing...`
          );
          page++;
        }
      }

      // Merge new items with cache
      if (newItems.length > 0) {
        this.logger.info(
          `Found ${newItems.length} new items across ${page} page(s), merging with full cache`
        );
        // Merge: new items first, then cached items (excluding any that might be duplicates)
        const newListingIds = new Set(newItems.map(i => i.listingId));
        items = [
          ...newItems,
          ...inventoryCache.items.filter(i => !newListingIds.has(i.listingId)),
        ];
        totalItems = latestTotalItems;

        // Save updated cache
        await this.cacheInventory({
          username: seller.username,
          items,
          totalItems,
          fetchedAt: Date.now(),
        });
      } else {
        // No new items - use cache as-is
        this.logger.debug(
          `No new items found, using full cached inventory for ${seller.username}`
        );
        items = inventoryCache.items;
        totalItems = inventoryCache.totalItems;
      }
    } else {
      // Full scan without fresh cache (or forceFresh) - fetch all from API
      // This path handles PARTIAL cache via fetchSellerInventory's resume logic
      const result = await this.fetchSellerInventory(seller.username);
      items = result.items;
      totalItems = result.totalItems;
      fetchWasComplete = result.isComplete;
    }

    // Get existing matches for this seller from the store
    const existingMatches = matchesStore.matches;

    // Match against wishlist
    const matches = await this.matchInventoryToWishlist(
      items,
      seller.username,
      existingMatches
    );

    // Determine new vs updated
    const existingIds = new Set(existingMatches.map(m => m.id));
    const newMatches = matches.filter(m => !existingIds.has(m.id));
    const updatedMatches = matches.filter(m => existingIds.has(m.id));

    // Update seller stats
    seller.inventorySize = totalItems;

    if (fullScan) {
      seller.lastScanned = Date.now();

      // Mark matches as sold if they're no longer in full scan results
      // Only do this for full scans - quick checks can't detect sold items
      const currentListingIds = new Set(matches.map(m => m.listingId));
      const sellerExistingMatches = existingMatches.filter(
        m =>
          m.sellerId.toLowerCase() === seller.username.toLowerCase() &&
          m.status !== 'sold'
      );

      // Verify up to 5 items before marking as sold to reduce false positives
      const MAX_VERIFY_PER_SCAN = 5;
      let verifiedCount = 0;

      for (const existing of sellerExistingMatches) {
        if (!currentListingIds.has(existing.listingId)) {
          // Item not found in current inventory - verify before marking sold
          let shouldMarkSold = true;
          let confidence: 'verified' | 'unverified' = 'unverified';

          if (verifiedCount < MAX_VERIFY_PER_SCAN) {
            try {
              const verification = await this.verifyListingStatus(
                existing.listingId
              );
              verifiedCount++;

              if (verification.available) {
                // Listing is still available - don't mark as sold
                // This could happen due to pagination issues or API inconsistencies
                shouldMarkSold = false;
                this.logger.info(
                  `Listing ${existing.listingId} not found in inventory but still available on Discogs - keeping as active`
                );
              } else if (!verification.error) {
                // Confirmed sold
                confidence = 'verified';
              }
              // If there was an error, we'll mark as unverified
            } catch (error) {
              this.logger.warn(
                `Failed to verify listing ${existing.listingId}:`,
                error
              );
              // Mark as sold but unverified
            }
          }

          if (shouldMarkSold) {
            existing.status = 'sold';
            existing.statusChangedAt = Date.now();
            existing.statusConfidence = confidence;
            existing.lastVerifiedAt =
              confidence === 'verified' ? Date.now() : undefined;
            this.logger.debug(
              `Marked match ${existing.id} as sold (${confidence})`
            );
          }
        }
      }

      // For full scans: remove all non-sold matches for this seller, add current ones
      // Keep sold matches so they can be displayed with "Show Sold" toggle
      matchesStore.matches = matchesStore.matches.filter(
        m =>
          m.sellerId.toLowerCase() !== seller.username.toLowerCase() ||
          m.status === 'sold'
      );
      matchesStore.matches.push(...matches);

      // Remove duplicate sold matches if the same item was re-found in this scan
      // This handles the case where an item was incorrectly marked as sold but is still available
      const newListingIds = new Set(matches.map(m => m.listingId));
      matchesStore.matches = matchesStore.matches.filter(m => {
        // If this is a 'sold' match for this seller and we just added an active version, remove the sold one
        if (
          m.sellerId.toLowerCase() === seller.username.toLowerCase() &&
          m.status === 'sold' &&
          newListingIds.has(m.listingId)
        ) {
          this.logger.info(
            `Removing duplicate sold match ${m.id} - item was re-found as active`
          );
          return false;
        }
        return true;
      });
    } else {
      seller.lastQuickCheck = Date.now();

      // For quick scans: only ADD new matches, don't remove any existing ones
      // Quick scans can't detect sold items, so we preserve all existing matches
      for (const newMatch of newMatches) {
        matchesStore.matches.push(newMatch);
      }

      // Update existing matches with new price/condition info
      for (const updatedMatch of updatedMatches) {
        const existingIndex = matchesStore.matches.findIndex(
          m => m.id === updatedMatch.id
        );
        if (existingIndex !== -1) {
          // Preserve status and notified flag, update price/condition
          matchesStore.matches[existingIndex] = {
            ...matchesStore.matches[existingIndex],
            price: updatedMatch.price,
            currency: updatedMatch.currency,
            condition: updatedMatch.condition,
          };
        }
      }
    }

    // Update match count (exclude sold)
    seller.matchCount = matchesStore.matches.filter(
      m =>
        m.sellerId.toLowerCase() === seller.username.toLowerCase() &&
        m.status !== 'sold'
    ).length;

    // Only cache inventory if fetch was complete
    // Partial results should NOT overwrite the full cache - the partial file handles resume
    if (fetchWasComplete) {
      const cache: SellerInventoryCache = {
        username: seller.username,
        fetchedAt: fullScan ? Date.now() : seller.lastScanned || Date.now(),
        quickCheckAt: fullScan ? undefined : Date.now(),
        totalItems,
        items,
      };
      await this.cacheInventory(cache);
    } else {
      this.logger.info(
        `Skipping cache save for ${seller.username} - fetch was incomplete (${items.length} items). Partial progress preserved for resume.`
      );
    }

    this.logger.info(
      `Found ${newMatches.length} new, ${updatedMatches.length} existing matches for ${seller.username}`
    );

    return { newMatches, updatedMatches };
  }

  /**
   * Start a scan of all sellers (background)
   * @param forceFresh If true, always re-fetch inventory from API. If false, use cached inventory if fresh.
   */
  async startScan(forceFresh = false): Promise<SellerScanStatus> {
    if (this.scanInProgress) {
      this.logger.warn('Scan already in progress');
      return this.getScanStatus();
    }

    this.scanInProgress = true;

    // Update status to 'scanning' BEFORE returning so UI can start polling immediately
    const sellers = await this.getSellers();
    const initialStatus: SellerScanStatus = {
      status: 'scanning',
      progress: 0,
      sellersScanned: 0,
      totalSellers: sellers.length,
      newMatches: 0,
    };
    await this.updateScanStatus(initialStatus);

    // Start scan in background (don't await)
    this.runScanInBackground(sellers, forceFresh).catch(error => {
      this.logger.error('Background scan failed', error);
      this.updateScanStatus({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      this.scanInProgress = false;
    });

    // Return the 'scanning' status immediately
    return initialStatus;
  }

  /**
   * Run the scan in the background
   * @param sellers Pre-fetched list of sellers to scan
   * @param forceFresh If true, always re-fetch inventory from API
   */
  private async runScanInBackground(
    sellers: MonitoredSeller[],
    forceFresh = false
  ): Promise<void> {
    if (sellers.length === 0) {
      await this.updateScanStatus({
        status: 'completed',
        progress: 100,
        sellersScanned: 0,
        totalSellers: 0,
        newMatches: 0,
        lastScanTimestamp: Date.now(),
      });
      this.scanInProgress = false;
      return;
    }

    const settings = await this.getSettings();
    const matchesStore = await this.getMatchesStore();
    let totalNewMatches = 0;

    try {
      for (let i = 0; i < sellers.length; i++) {
        const seller = sellers[i];

        // Determine if full scan is needed based on timing
        const now = Date.now();
        const daysSinceFullScan = seller.lastScanned
          ? (now - seller.lastScanned) / (24 * 60 * 60 * 1000)
          : Infinity;
        const hoursSinceQuickCheck = seller.lastQuickCheck
          ? (now - seller.lastQuickCheck) / (60 * 60 * 1000)
          : Infinity;

        const needsFullScan = daysSinceFullScan >= settings.scanFrequencyDays;
        const needsQuickCheck =
          !needsFullScan &&
          hoursSinceQuickCheck >= settings.quickCheckFrequencyHours;

        // When forceFresh=false, we always scan but may use cached inventory
        // When forceFresh=true, we force full API fetch
        if (!forceFresh && !needsFullScan && !needsQuickCheck) {
          this.logger.debug(`Skipping ${seller.username} - recently scanned`);
          continue;
        }

        // Pass matchesStore to scanSeller - it updates it in place
        // If forceFresh, always do full scan with fresh data
        // Otherwise, use normal logic (full if needed, quick otherwise)
        const { newMatches } = await this.scanSeller(
          seller,
          forceFresh || needsFullScan,
          matchesStore,
          forceFresh
        );

        totalNewMatches += newMatches.length;

        await this.updateScanStatus({
          sellersScanned: i + 1,
          progress: Math.round(((i + 1) / sellers.length) * 100),
          newMatches: totalNewMatches,
        });
      }

      // Save updated sellers
      const sellersStore: MonitoredSellersStore = {
        schemaVersion: 1,
        sellers,
      };
      await this.fileStorage.writeJSON(this.SELLERS_FILE, sellersStore);

      // Save updated matches (includes sold matches that were marked during scanning)
      matchesStore.lastUpdated = Date.now();
      await this.fileStorage.writeJSON(this.MATCHES_FILE, matchesStore);

      // Prune stale matches (sold > 30 days)
      await this.removeStaleMatches();

      await this.updateScanStatus({
        status: 'completed',
        progress: 100,
        sellersScanned: sellers.length,
        newMatches: totalNewMatches,
        lastScanTimestamp: Date.now(),
      });

      this.logger.info(
        `Scan completed: ${sellers.length} sellers, ${totalNewMatches} new matches`
      );
    } finally {
      this.scanInProgress = false;
    }
  }
}
