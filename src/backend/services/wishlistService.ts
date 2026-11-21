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
  DiscogsPressingsSummary,
  StoredWishlistItem,
  WishlistStore,
  WishlistSyncStatus,
  DiscogsRawTrack,
} from '../../shared/types';
import { albumMatchName, isPlaceholderLabel } from '../../shared/utils/labels';
import {
  fromDiscogsTracklist,
  tracklistMatchTitles,
} from '../../shared/utils/tracklist';
import { getDiscogsAxios } from '../utils/discogsAxios';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

import { AuthService } from './authService';
import {
  DiscogsPressingsService,
  MASTER_COMPLETE_FRESH_MS,
} from './discogsPressingsService';

// Cache expiration times
const WISHLIST_CACHE_HOURS = 24;
const VERSIONS_CACHE_DAYS = 7;
// const PRICE_CACHE_HOURS = 24; // Reserved for future use

// Rate limiting
const VINYL_CHECK_BATCH_SIZE = 50; // Check up to 50 items per sync (with rate limiting)

export class WishlistService {
  private fileStorage: FileStorage;
  private authService: AuthService;
  private axios: AxiosInstance;
  private oauth: OAuth;
  private baseUrl = 'https://api.discogs.com';
  private logger = createLogger('WishlistService');

  // Cache file paths
  private readonly WISHLIST_CACHE = 'wishlist/wishlist-items.json';
  private readonly SETTINGS_FILE = 'wishlist/settings.json';
  private readonly SYNC_STATUS_FILE = 'wishlist/sync-status.json';
  private readonly LOCAL_WANT_LIST_FILE = 'wishlist/local-want-list.json';
  // Feature 5.5: New release tracking
  private readonly NEW_RELEASES_FILE = 'wishlist/new-releases.json';
  private readonly NEW_RELEASE_SYNC_STATUS_FILE =
    'wishlist/new-release-sync-status.json';
  // A master whose newest pressings were fetched within this window is not
  // fetched again by the new-pressing check or getMasterVersions
  private readonly PRESSINGS_FRESH_MS =
    VERSIONS_CACHE_DAYS * 24 * 60 * 60 * 1000;

  // New release checking constants
  private readonly MASTERS_PER_BATCH = 20;
  // Set before any await, so two checks started together can't both run
  private newReleaseCheckRunning = false;

  // Track sync state
  private syncInProgress = false;

  /** The Discogs pressings catalogue; shared with seller monitoring */
  readonly pressings: DiscogsPressingsService;

  constructor(fileStorage: FileStorage, authService: AuthService) {
    this.fileStorage = fileStorage;
    this.authService = authService;
    this.pressings = new DiscogsPressingsService(fileStorage, () =>
      this.getAuthHeaders()
    );
    this.pressings.setDetector((masterId, candidates, context) =>
      this.raiseNewPressingAlerts(masterId, candidates, context)
    );

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

    await this.fileStorage.writeJSONWithBackup(this.SETTINGS_FILE, updated);
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
            vinylVersions = await this.checkMasterVinyl(item.masterId);
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
            // Couldn't tell: keep what the last sync knew
            if (existingItem) {
              vinylStatus = existingItem.vinylStatus;
              lowestVinylPrice = existingItem.lowestVinylPrice;
              priceCurrency = existingItem.priceCurrency;
              lastChecked = existingItem.lastChecked;
            }
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
      // Pressings stay in the catalogue; they are filled in when read
      const store: WishlistStore = {
        schemaVersion: 1,
        lastUpdated: Date.now(),
        items: enrichedItems.map(
          ({ vinylVersions: _versions, ...saved }) => saved
        ),
      };

      await this.fileStorage.writeJSON(this.WISHLIST_CACHE, store);

      // Also check local want list for vinyl availability
      // This is a lightweight operation that reuses cached version data
      const localWantItems = await this.getLocalWantList();
      let localVinylChecks = 0;
      for (const localItem of localWantItems) {
        if (localItem.masterId && localItem.vinylStatus === 'unknown') {
          try {
            const versions = await this.checkMasterVinyl(localItem.masterId);
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
        await this.fileStorage.writeJSONWithBackup(
          this.LOCAL_WANT_LIST_FILE,
          localStore
        );
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

        return await Promise.all(
          store.items.map(item => this.withPressings(item))
        );
      }
    } catch {
      this.logger.debug('No wishlist cache found');
    }

    return [];
  }

  /**
   * A saved item with its pressings from the catalogue. A vinyl pressing
   * learned since the last sync (by any feature) shows the record as having
   * vinyl; no vinyl known keeps the saved status, since the catalogue may
   * only hold a record's newest pressings.
   */
  private async withPressings(
    item: StoredWishlistItem
  ): Promise<EnrichedWishlistItem> {
    let vinylVersions: ReleaseVersion[] = [];
    if (item.masterId) {
      try {
        vinylVersions = await this.pressings.knownVersions(item.masterId);
      } catch (error) {
        // An unreadable catalogue hides pressings, not the wishlist
        this.logger.warn(
          `Could not read pressings of master ${item.masterId}`,
          error
        );
      }
    }
    const vinylStatus = vinylVersions.some(v => v.hasVinyl)
      ? 'has_vinyl'
      : item.vinylStatus;
    return { ...item, vinylVersions, vinylStatus };
  }

  // ============================================
  // Version/Vinyl Checking
  // ============================================

  /**
   * A master's pressings for deciding whether it has vinyl: from the
   * catalogue, fetched from Discogs (newest first) when not fetched in the
   * last week. When the newest pressings include no vinyl, every page is
   * fetched (at most monthly), so a record with only older vinyl is not taken
   * for CD-only. Throws when that can't be told (a fetch failed, or the
   * catalogue can't be read), so callers keep what they knew.
   */
  async checkMasterVinyl(masterId: number): Promise<ReleaseVersion[]> {
    const { versions, failed } = await this.lookUpPressings(masterId);
    if (failed && !versions.some(v => v.hasVinyl)) {
      throw new Error(
        `Could not fetch every pressing of master ${masterId} to rule out vinyl`
      );
    }
    return versions;
  }

  /**
   * A master's known pressings, as `checkMasterVinyl` fetches them, for
   * showing; what is known is returned even if a fetch failed
   */
  async getMasterVersions(masterId: number): Promise<ReleaseVersion[]> {
    try {
      return (await this.lookUpPressings(masterId)).versions;
    } catch (error) {
      this.logger.error(`Failed to get versions for master ${masterId}`, error);
      return [];
    }
  }

  private async lookUpPressings(
    masterId: number
  ): Promise<{ versions: ReleaseVersion[]; failed: boolean }> {
    const { baselineSince } = await this.pressings.masterStatus(masterId);
    const newest = await this.pressings.getPressings(masterId, {
      need: 'newest',
      maxAgeMs: this.PRESSINGS_FRESH_MS,
    });
    if (newest.versions.some(v => v.hasVinyl)) {
      return { versions: newest.versions, failed: false };
    }
    const complete = await this.pressings.getPressings(masterId, {
      need: 'complete',
      maxAgeMs: MASTER_COMPLETE_FRESH_MS,
      // Part of a first look: the newest fetch just started the baseline
      learnOnly: baselineSince === undefined,
    });
    return { versions: complete.versions, failed: complete.failed };
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
   * Lowest current asking price of one release, in `currency` (one call to
   * /marketplace/stats, no price suggestions). `lowestPrice` is null when
   * nothing is for sale. Throws on any error so callers can back off.
   */
  async getLowestAskingPrice(
    releaseId: number,
    currency: string
  ): Promise<{
    lowestPrice: number | null;
    currency: string;
    numForSale: number;
  }> {
    const headers = await this.getAuthHeaders();
    const response = await this.axios.get(`/marketplace/stats/${releaseId}`, {
      headers,
      params: { curr_abbr: currency },
    });
    const data = (response.data ?? {}) as {
      num_for_sale?: number;
      lowest_price?: { value?: number; currency?: string } | null;
    };
    const value = data.lowest_price?.value;
    return {
      lowestPrice:
        typeof value === 'number' && Number.isFinite(value) ? value : null,
      currency: data.lowest_price?.currency || currency,
      numForSale: data.num_for_sale ?? 0,
    };
  }

  /** True while a wantlist sync is running */
  isSyncInProgress(): boolean {
    return this.syncInProgress;
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
   * The label an album first came out on, from a Discogs release search: the
   * label of the earliest release (by year) of the best-matching master.
   * Placeholder labels ("Not On Label") don't count. Null when no result
   * matches the artist and title.
   */
  async findAlbumLabels(query: { artist: string; album: string }): Promise<{
    labels: string[];
    status: 'found';
    matchedArtist?: string;
    matchedTitle?: string;
    year?: number;
  } | null> {
    const headers = await this.getAuthHeaders();
    const response = await this.axios.get('/database/search', {
      headers,
      params: {
        artist: query.artist,
        release_title: query.album,
        type: 'release',
        per_page: 50,
      },
    });
    const results: Array<{
      title: string;
      year?: string;
      label?: string[];
      master_id?: number;
    }> = response.data?.results ?? [];

    const wantedArtist = albumMatchName(query.artist);
    const wantedTitle = albumMatchName(query.album);
    const matches = results
      .map(result => {
        const [artistPart, ...titleParts] = result.title.split(' - ');
        return {
          ...result,
          artist: artistPart
            .replace(/\*$/, '')
            .replace(/\s*\(\d+\)$/, '')
            .trim(),
          album: titleParts.join(' - ').trim(),
          labels: Array.from(
            new Set(
              (result.label ?? [])
                .map(label => label.trim())
                .filter(label => label && !isPlaceholderLabel(label))
            )
          ),
          yearNumber: result.year ? parseInt(result.year, 10) : NaN,
        };
      })
      .filter(
        m =>
          albumMatchName(m.artist) === wantedArtist &&
          albumMatchName(m.album) === wantedTitle &&
          m.labels.length > 0
      );
    if (matches.length === 0) return null;

    const masterId = matches[0].master_id;
    const sameAlbum = masterId
      ? matches.filter(m => m.master_id === masterId)
      : matches;
    const earliest = [...sameAlbum].sort(
      (a, b) =>
        (Number.isFinite(a.yearNumber) ? a.yearNumber : 9999) -
        (Number.isFinite(b.yearNumber) ? b.yearNumber : 9999)
    )[0];
    return {
      labels: earliest.labels,
      status: 'found',
      matchedArtist: earliest.artist,
      matchedTitle: earliest.album,
      year: Number.isFinite(earliest.yearNumber)
        ? earliest.yearNumber
        : undefined,
    };
  }

  /**
   * Search Discogs for an album by artist and title.
   * Returns matching masters. A master groups all pressings of an album; its
   * ID is not a release ID, so use getMasterMainReleaseId() to get a release
   * (e.g. to add to the Discogs wantlist).
   */
  async searchForRelease(
    artist: string,
    album: string
  ): Promise<
    {
      masterId: number;
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
            // type=master search results are masters: `id` is the master ID
            masterId: result.master_id || result.id,
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
   * Get the main release (the pressing Discogs shows for the master) of a
   * master. Returns null when the master has none or the lookup fails.
   */
  async getMasterMainReleaseId(masterId: number): Promise<number | null> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await this.axios.get(`/masters/${masterId}`, {
        headers,
      });
      const mainRelease = response.data?.main_release;
      return typeof mainRelease === 'number' && mainRelease > 0
        ? mainRelease
        : null;
    } catch (error) {
      this.logger.warn(
        `Failed to get main release for master ${masterId}`,
        error
      );
      return null;
    }
  }

  /**
   * Original release year of a Discogs master (record-store filing). null
   * when Discogs has no year or no such master; throws on other failures so
   * the caller can retry later instead of caching a wrong answer.
   */
  async getMasterYear(masterId: number): Promise<number | null> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await this.axios.get(`/masters/${masterId}`, {
        headers,
      });
      const year = response.data?.year;
      return typeof year === 'number' && year > 0 ? year : null;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Title, artist, tracklist and cover of a Discogs master or release, e.g.
   * to match unresolved plays against an album the user points at. Track
   * titles are in tracklist order; headings (no position) are skipped.
   * Returns null if Discogs has no such album; throws on other failures.
   */
  async getDiscogsAlbum(
    kind: 'master' | 'release',
    id: number
  ): Promise<{
    title: string;
    artist: string;
    tracks: Array<{ position: string; title: string }>;
    imageUrl?: string;
    url: string;
  } | null> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await this.axios.get(
        `/${kind === 'master' ? 'masters' : 'releases'}/${id}`,
        { headers }
      );
      const data = response.data as {
        title?: string;
        artists?: Array<{ name?: string }>;
        tracklist?: DiscogsRawTrack[];
        images?: Array<{ type?: string; uri?: string; uri150?: string }>;
        uri?: string;
      };
      if (!data?.title) return null;
      // Tracks and the parts of tracks that have them, headings skipped
      const tracks = tracklistMatchTitles(fromDiscogsTracklist(data.tracklist));
      const image =
        data.images?.find(i => i.type === 'primary') ?? data.images?.[0];
      return {
        title: data.title,
        artist: (data.artists ?? [])
          .map(a => a.name)
          .filter(Boolean)
          .join(', '),
        tracks,
        imageUrl: image?.uri150 || image?.uri || undefined,
        url: data.uri || `https://www.discogs.com/${kind}/${id}`,
      };
    } catch (error) {
      // Not found is a normal answer; anything else (auth, rate limit,
      // network) is reported so the caller can say what went wrong
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      if (status === 404) return null;
      this.logger.warn(`Failed to get Discogs ${kind} ${id}`, error);
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
        // Older versions saved the search's master ID as releaseId; it is
        // not a release ID, so drop it (the file is corrected on next save)
        return store.items.map(item =>
          item.releaseId !== undefined && item.releaseId === item.masterId
            ? { ...item, releaseId: undefined }
            : item
        );
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
    let coverImage: string | undefined;

    try {
      const searchResults = await this.searchForRelease(
        item.artist,
        item.album
      );
      if (searchResults.length > 0) {
        masterId = searchResults[0].masterId;
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
      coverImage,
      vinylStatus: 'unknown',
      notified: false,
    };

    wantList.push(wantItem);

    const store: LocalWantStore = {
      schemaVersion: 1,
      items: wantList,
    };

    await this.fileStorage.writeJSONWithBackup(
      this.LOCAL_WANT_LIST_FILE,
      store
    );
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

    await this.fileStorage.writeJSONWithBackup(
      this.LOCAL_WANT_LIST_FILE,
      store
    );
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
        const versions = await this.checkMasterVinyl(item.masterId);
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
    await this.fileStorage.writeJSONWithBackup(
      this.LOCAL_WANT_LIST_FILE,
      store
    );

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
      await this.fileStorage.writeJSONWithBackup(
        this.LOCAL_WANT_LIST_FILE,
        store
      );
    }
  }

  // ============================================
  // Feature 5.5: New Release Tracking
  // ============================================

  /**
   * Get all tracked master IDs from wishlist and local want list
   */
  async getTrackedMasterIds({ log = true }: { log?: boolean } = {}): Promise<
    Map<number, TrackedMasterInfo>
  > {
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

    // Count local want items that overlap with wishlist
    let localOnlyCount = 0;
    let localOverlapCount = 0;
    for (const item of localWant) {
      if (item.masterId) {
        if (masterMap.has(item.masterId)) {
          // Check if it was added by wishlist or local_want
          const existing = masterMap.get(item.masterId);
          if (existing?.source === 'wishlist') {
            localOverlapCount++;
          }
        } else {
          localOnlyCount++;
        }
      }
    }

    if (!log) return masterMap;

    this.logger.info(
      `Tracked masters: ${masterMap.size} total (${wishlist.length - itemsWithoutMasterId.length} from wishlist, ${localOnlyCount} from local want, ${localOverlapCount} overlap/deduped)`
    );

    if (itemsWithoutMasterId.length > 0) {
      this.logger.info(
        `${itemsWithoutMasterId.length} wishlist items have no master ID and won't be tracked for new releases`
      );
      this.logger.debug('Items without master ID:', itemsWithoutMasterId);
    }

    return masterMap;
  }

  /**
   * Detector for the pressings catalogue: raise an alert for each newly seen
   * pressing of a master someone tracks. Runs inside the catalogue's commit
   * queue (so it writes new-releases.json directly).
   *
   * Alerts need tracking enabled (or `alertOverride`, a manual check), and
   * want-list records also need want-list tracking. Pressings are remembered
   * by the catalogue either way, so turning tracking on later doesn't flood
   * the list.
   */
  private async raiseNewPressingAlerts(
    masterId: number,
    candidates: ReleaseVersion[],
    { alertOverride }: { alertOverride: boolean }
  ): Promise<WishlistNewRelease[]> {
    const tracked = await this.getTrackedMasterIds({ log: false });
    const sourceInfo = tracked.get(masterId);
    if (!sourceInfo) return [];

    const tracking = (await this.getSettings()).newReleaseTracking;
    const allowed =
      (alertOverride || !!tracking?.enabled) &&
      (sourceInfo.source !== 'local_want' || !!tracking?.trackLocalWantList);
    if (!allowed) return [];

    const store = await this.getNewReleases();
    const alertIds = new Set(store.releases.map(r => r.id));
    const now = Date.now();
    const created: WishlistNewRelease[] = [];
    for (const version of candidates) {
      const id = `${masterId}-${version.releaseId}`;
      if (alertIds.has(id)) continue;
      alertIds.add(id);
      created.push({
        id,
        masterId,
        releaseId: version.releaseId,
        title: version.title,
        artist: sourceInfo.artistAlbum.split(' - ')[0],
        year: version.year,
        country: version.country,
        format: version.format,
        label: version.label,
        catalogNumber: undefined,
        source: sourceInfo.source,
        sourceItemId: sourceInfo.itemId,
        detectedAt: now,
        notified: false,
        dismissed: false,
        discogsUrl: `https://www.discogs.com/release/${version.releaseId}`,
        coverImage: sourceInfo.coverImage,
      });
    }

    if (created.length > 0) {
      store.releases.push(...created);
      await this.fileStorage.writeJSONWithBackup(this.NEW_RELEASES_FILE, store);
      this.logger.info(
        `${created.length} new pressing(s) for ${sourceInfo.artistAlbum}`
      );
    }
    return created;
  }

  /**
   * Every master's pressings from the catalogue, in the old versions-cache
   * shape (data export)
   */
  async getVersionsCache(): Promise<VersionsCache> {
    return this.pressings.versionsCacheView();
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
   * Record when the last new-release check ran
   */
  private async touchNewReleasesLastCheck(): Promise<void> {
    await this.pressings.exclusive(async () => {
      const store = await this.getNewReleases();
      store.lastCheck = Date.now();
      await this.fileStorage.writeJSONWithBackup(this.NEW_RELEASES_FILE, store);
    });
  }

  /**
   * Dismiss a new release alert
   */
  async dismissNewRelease(releaseId: string): Promise<void> {
    return this.pressings.exclusive(async () => {
      const store = await this.getNewReleases();
      const release = store.releases.find(r => r.id === releaseId);
      if (release) {
        release.dismissed = true;
        await this.fileStorage.writeJSONWithBackup(
          this.NEW_RELEASES_FILE,
          store
        );
      }
    });
  }

  /**
   * Dismiss multiple new release alerts at once
   */
  async dismissNewReleasesBulk(releaseIds: string[]): Promise<number> {
    return this.pressings.exclusive(async () => {
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
        await this.fileStorage.writeJSONWithBackup(
          this.NEW_RELEASES_FILE,
          store
        );
      }

      return dismissedCount;
    });
  }

  /**
   * Dismiss all non-dismissed new releases
   */
  async dismissAllNewReleases(): Promise<number> {
    return this.pressings.exclusive(async () => {
      const store = await this.getNewReleases();
      let dismissedCount = 0;

      for (const release of store.releases) {
        if (!release.dismissed) {
          release.dismissed = true;
          dismissedCount++;
        }
      }

      if (dismissedCount > 0) {
        await this.fileStorage.writeJSONWithBackup(
          this.NEW_RELEASES_FILE,
          store
        );
      }

      return dismissedCount;
    });
  }

  /**
   * Remove old dismissed releases (cleanup)
   */
  async cleanupDismissedReleases(maxAgeDays = 90): Promise<number> {
    return this.pressings.exclusive(async () => {
      const store = await this.getNewReleases();
      const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
      const originalCount = store.releases.length;

      store.releases = store.releases.filter(
        r => !r.dismissed || r.detectedAt > cutoff
      );

      await this.fileStorage.writeJSONWithBackup(this.NEW_RELEASES_FILE, store);
      return originalCount - store.releases.length;
    });
  }

  /**
   * Check for new releases with batching, retry logic, and progress tracking
   */
  async checkForNewReleases(
    force = false,
    options: { everyRecord?: boolean } = {}
  ): Promise<WishlistNewRelease[]> {
    if (this.newReleaseCheckRunning) {
      this.logger.warn('New release check already in progress');
      return [];
    }
    this.newReleaseCheckRunning = true;
    try {
      return await this.runNewReleaseCheck(force, options);
    } finally {
      this.newReleaseCheckRunning = false;
    }
  }

  private async runNewReleaseCheck(
    force: boolean,
    { everyRecord = false }: { everyRecord?: boolean }
  ): Promise<WishlistNewRelease[]> {
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
      lastCheckedIndex: everyRecord ? 0 : syncStatus.lastCheckedIndex || 0,
      progress: 0,
      error: undefined,
    });

    const newReleases: WishlistNewRelease[] = [];

    // Every record: one pass over all of them, ignoring the weekly window
    const startIndex = everyRecord ? 0 : syncStatus.lastCheckedIndex || 0;
    const endIndex = everyRecord
      ? allMasterIds.length
      : Math.min(startIndex + this.MASTERS_PER_BATCH, allMasterIds.length);

    try {
      for (let i = startIndex; i < endIndex; i++) {
        const masterId = allMasterIds[i];
        const sourceInfo = trackedMasters.get(masterId);

        if (!sourceInfo) continue;

        // Skip if source settings disable this type. Checking every record
        // still fetches them, so their pressings stay current; the detector
        // raises no alerts for them.
        if (
          !everyRecord &&
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

        // From the catalogue when any feature fetched it in the last week;
        // otherwise from Discogs, which flags pressings not seen before.
        // Every page once a month, so undated pressings (missing from
        // newest-first lists) are learned too.
        const { completeCheckedAt } =
          await this.pressings.masterStatus(masterId);
        const completeDue =
          completeCheckedAt === undefined ||
          Date.now() - completeCheckedAt >= MASTER_COMPLETE_FRESH_MS;
        const result = await this.pressings.getPressings(
          masterId,
          completeDue
            ? {
                need: 'complete',
                maxAgeMs: MASTER_COMPLETE_FRESH_MS,
                alertOverride: force,
              }
            : {
                need: 'newest',
                maxAgeMs: everyRecord ? 0 : this.PRESSINGS_FRESH_MS,
                alertOverride: force,
              }
        );
        if (result.failed) {
          this.logger.warn(
            `Could not fetch every pressing of master ${masterId}; will retry next check`
          );
        }
        newReleases.push(...result.alerts);
      }

      // Determine if we completed a full cycle
      const completedFullCycle = endIndex >= allMasterIds.length;

      // Alerts were saved as they were found; record when this check ran
      await this.touchNewReleasesLastCheck();

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

  /** What the pressings catalogue holds for tracked records and sellers */
  async getPressingsSummary(): Promise<DiscogsPressingsSummary> {
    const trackedIds = Array.from(
      (await this.getTrackedMasterIds({ log: false })).keys()
    );
    const now = Date.now();
    const tracked: DiscogsPressingsSummary['tracked'] = {
      records: trackedIds.length,
      fetchedInFull: 0,
      fullFetchDue: 0,
      nextFullFetchAt: null,
      newestCheckedThisWeek: 0,
      releases: 0,
      releasesWithDetails: 0,
    };
    let trackedWithRows = 0;
    for (const masterId of trackedIds) {
      const status = await this.pressings.masterStatus(masterId);
      tracked.releases += status.knownCount;
      if (status.knownCount > 0) trackedWithRows++;
      tracked.releasesWithDetails += (
        await this.pressings.knownVersions(masterId)
      ).length;
      const { completeCheckedAt, newestCheckedAt } = status;
      if (
        completeCheckedAt !== undefined &&
        now - completeCheckedAt < MASTER_COMPLETE_FRESH_MS
      ) {
        tracked.fetchedInFull++;
        const dueAt = completeCheckedAt + MASTER_COMPLETE_FRESH_MS;
        tracked.nextFullFetchAt =
          tracked.nextFullFetchAt === null
            ? dueAt
            : Math.min(tracked.nextFullFetchAt, dueAt);
      } else {
        tracked.fullFetchDue++;
      }
      const lastNewest = Math.max(
        newestCheckedAt ?? -Infinity,
        completeCheckedAt ?? -Infinity
      );
      if (now - lastNewest < this.PRESSINGS_FRESH_MS) {
        tracked.newestCheckedThisWeek++;
      }
    }
    const { totalReleases, totalMasters } = await this.pressings.stats();
    return {
      tracked,
      sellerLookups: {
        albums: totalMasters - trackedWithRows,
        releases: totalReleases - tracked.releases,
      },
    };
  }

  /**
   * Mark new releases as notified
   */
  async markNewReleasesAsNotified(releaseIds: string[]): Promise<void> {
    return this.pressings.exclusive(async () => {
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
        await this.fileStorage.writeJSONWithBackup(
          this.NEW_RELEASES_FILE,
          store
        );
      }
    });
  }
}
