import crypto from 'crypto';

import axios, { AxiosInstance } from 'axios';
import OAuth from 'oauth-1.0a';

import {
  CollectionItem,
  DiscogsRelease,
  ApiResponse,
} from '../../shared/types';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

import { AuthService } from './authService';

export class DiscogsService {
  private axios: AxiosInstance;
  private fileStorage: FileStorage;
  private authService: AuthService;
  private oauth: OAuth;
  private baseUrl = 'https://api.discogs.com';
  private logger = createLogger('DiscogsService');

  // Lock to prevent concurrent preloading
  private preloadingInProgress: Map<string, boolean> = new Map();

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
        'User-Agent': 'DiscogLastfmScrobbler/1.0',
      },
    });

    // Rate limiting interceptor
    this.axios.interceptors.request.use(async config => {
      // Simple rate limiting: wait 1 second between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
      return config;
    });
  }

  async getAuthUrl(): Promise<string> {
    this.logger.info('Starting Discogs OAuth flow');

    // Check credentials
    const clientId = process.env.DISCOGS_CLIENT_ID;
    const clientSecret = process.env.DISCOGS_CLIENT_SECRET;
    this.logger.debug('Discogs credentials check', {
      clientId: clientId ? 'present' : 'missing',
      clientSecret: clientSecret ? 'present' : 'missing',
    });

    // Step 1: Get request token
    const requestData = {
      url: `${this.baseUrl}/oauth/request_token`,
      method: 'GET',
    };

    this.logger.debug('Initiating OAuth request token flow');
    const authHeader = this.oauth.toHeader(this.oauth.authorize(requestData));
    // Note: authHeader contains sensitive OAuth data and is not logged

    try {
      const response = await this.axios.get('/oauth/request_token', {
        headers: authHeader as any,
      });

      // Parse the response (should be in format: oauth_token=...&oauth_token_secret=...)
      const params = new URLSearchParams(response.data);
      const oauthToken = params.get('oauth_token');
      const oauthTokenSecret = params.get('oauth_token_secret');

      this.logger.debug('OAuth tokens received', {
        oauthToken: oauthToken ? 'present' : 'missing',
        oauthTokenSecret: oauthTokenSecret ? 'present' : 'missing',
      });

      if (!oauthToken || !oauthTokenSecret) {
        throw new Error('Failed to get OAuth request token');
      }

      // Store the token secret temporarily (needed for the callback)
      await this.authService.storeOAuthTokenSecret(oauthTokenSecret);
      this.logger.debug('OAuth token secret stored for callback');

      // Return the authorization URL
      const backendPort =
        process.env.BACKEND_PORT || process.env.PORT || '3001';
      const callbackUrl =
        process.env.DISCOGS_CALLBACK_URL ||
        `http://localhost:${backendPort}/api/v1/auth/discogs/callback`;

      // Include the callback URL in the authorization URL
      const authUrl = `https://discogs.com/oauth/authorize?oauth_token=${oauthToken}&oauth_callback=${encodeURIComponent(callbackUrl)}`;
      this.logger.debug('OAuth authorization URL generated');
      this.logger.debug('Callback URL configured', { callbackUrl });

      return authUrl;
    } catch (error: any) {
      this.logger.error('Discogs OAuth error', error);
      if (error.response) {
        this.logger.error('OAuth request failed', {
          status: error.response.status,
          statusText: error.response.statusText,
        });
      }
      throw new Error('Failed to initiate Discogs OAuth flow');
    }
  }

  async handleCallback(
    oauthToken: string,
    oauthVerifier: string
  ): Promise<{ username: string }> {
    try {
      // Get the stored token secret
      const tokenSecret = await this.authService.getOAuthTokenSecret();
      if (!tokenSecret) {
        throw new Error(
          'OAuth token secret not found. Please restart the authentication flow.'
        );
      }

      // Step 2: Exchange for access token
      const requestData = {
        url: `${this.baseUrl}/oauth/access_token`,
        method: 'POST',
      };

      const token = {
        key: oauthToken,
        secret: tokenSecret,
      };

      const authHeader = this.oauth.toHeader(
        this.oauth.authorize(requestData, token)
      );

      const response = await this.axios.post('/oauth/access_token', null, {
        headers: authHeader as any,
        params: {
          oauth_verifier: oauthVerifier,
        },
      });

      // Parse access token response
      const params = new URLSearchParams(response.data);
      const accessToken = params.get('oauth_token');
      const accessTokenSecret = params.get('oauth_token_secret');

      if (!accessToken || !accessTokenSecret) {
        throw new Error('Failed to get OAuth access token');
      }

      // Store the access token
      const tokenData = JSON.stringify({
        key: accessToken,
        secret: accessTokenSecret,
      });

      // Get user profile to get username
      const userProfile = await this.getUserProfileWithToken({
        key: accessToken,
        secret: accessTokenSecret,
      });

      // Save the token and username
      await this.authService.setDiscogsToken(tokenData, userProfile.username);

      // Clean up temporary token secret
      await this.authService.clearOAuthTokenSecret();

      return { username: userProfile.username };
    } catch (error) {
      this.logger.error('Discogs OAuth callback error', error);
      throw new Error('Failed to complete Discogs OAuth flow');
    }
  }

  private async getUserProfileWithToken(token: {
    key: string;
    secret: string;
  }): Promise<any> {
    const requestData = {
      url: `${this.baseUrl}/oauth/identity`,
      method: 'GET',
    };

    const authHeader = this.oauth.toHeader(
      this.oauth.authorize(requestData, token)
    );

    const response = await this.axios.get('/oauth/identity', {
      headers: authHeader as any,
    });

    return response.data;
  }

  private async getAuthHeaders(): Promise<any> {
    const token = await this.authService.getDiscogsToken();

    if (!token) {
      throw new Error('No Discogs token available. Please authenticate first.');
    }

    // For Personal Access Token (simpler approach)
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
    return this.oauth.toHeader(this.oauth.authorize(requestData, tokenObj));
  }

  async getUserProfile(): Promise<any> {
    try {
      const token = await this.authService.getDiscogsToken();

      if (!token) {
        throw new Error(
          'No Discogs token available. Please authenticate first.'
        );
      }

      // For Personal Access Token, we need to make a simple API call to get user info
      if (token.startsWith('Discogs token=')) {
        const headers = {
          Authorization: token,
          'User-Agent': 'DiscogLastfmScrobbler/1.0',
        };

        // For personal tokens, we can use the /users/{username} endpoint
        // But first we need to get our own user info
        // Let's try a simple API call first to test the token
        await this.axios.get(
          '/database/search?q=test&type=release&per_page=1',
          {
            headers,
          }
        );

        // If that works, the token is valid, but we still need username
        // For now, return a placeholder - in a real app you'd need to get username another way
        return {
          username: 'user', // Placeholder - we'd need to get this from somewhere else
          id: 'unknown',
        };
      }

      // For OAuth token, use the identity endpoint
      const headers = await this.getAuthHeaders();
      const response = await this.axios.get('/oauth/identity', { headers });
      return response.data;
    } catch (error: any) {
      this.logger.error('Error fetching user profile', error);
      if (error.response) {
        this.logger.error('Discogs API error', {
          status: error.response.status,
          data: error.response.data,
        });
      }
      throw error;
    }
  }

  async getUserCollection(
    username: string,
    page: number = 1,
    perPage: number = 50,
    forceReload: boolean = false
  ): Promise<ApiResponse<CollectionItem[]>> {
    try {
      const cacheKey = `collections/${username}-page-${page}.json`;

      // Try cache first (unless force reload is requested)
      if (!forceReload) {
        this.logger.debug(`Checking cache for ${cacheKey}`);
        const cached =
          await this.fileStorage.readJSON<ApiResponse<CollectionItem[]>>(
            cacheKey
          );
        if (cached && this.isCacheValid(cached)) {
          const cacheAge = Math.round(
            (Date.now() - (cached.timestamp || 0)) / 1000 / 60
          );
          this.logger.info(
            `Returning cached collection page ${page} for ${username}`,
            {
              cacheAge: `${cacheAge} minutes`,
            }
          );
          return cached;
        } else if (cached) {
          const cacheAge = Math.round(
            (Date.now() - (cached.timestamp || 0)) / 1000 / 60
          );
          this.logger.debug(`Cache expired for page ${page}`, {
            cacheAge: `${cacheAge} minutes`,
          });
        } else {
          this.logger.debug(`No cache found for page ${page}`);
        }
      } else {
        this.logger.debug(`Force reload requested for page ${page}`);
      }

      this.logger.info(
        `Fetching collection page ${page} for ${username} from API`
      );

      // Capture timestamp BEFORE making API call
      // This ensures items added during/after the fetch are still detected as new
      const fetchStartTime = Date.now();

      const headers = await this.getAuthHeaders();
      const response = await this.axios.get(
        `/users/${username}/collection/folders/0/releases`,
        {
          headers,
          params: {
            page,
            per_page: perPage,
          },
        }
      );

      // Transform the response
      const transformedReleases: CollectionItem[] = response.data.releases.map(
        (item: any) => ({
          id: item.id,
          date_added: item.date_added,
          rating: item.rating,
          notes: item.notes,
          release: {
            id: item.basic_information.id,
            master_id: item.basic_information.master_id,
            title: item.basic_information.title,
            artist:
              item.basic_information.artists
                ?.map((a: any) => a.name)
                .join(', ') || 'Unknown Artist',
            year: item.basic_information.year,
            format:
              item.basic_information.formats?.map((f: any) => f.name) || [],
            label: item.basic_information.labels?.map((l: any) => l.name) || [],
            catalog_number: item.basic_information.catalog_number,
            cover_image: item.basic_information.cover_image,
            resource_url: item.basic_information.resource_url,
          },
        })
      );

      const result: ApiResponse<CollectionItem[]> = {
        success: true,
        data: transformedReleases,
        pagination: response.data.pagination,
        timestamp: fetchStartTime,
      };

      // Cache the result
      await this.fileStorage.writeJSON(cacheKey, result);

      return result;
    } catch (error) {
      this.logger.error('Error fetching user collection', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getReleaseDetails(releaseId: number): Promise<DiscogsRelease | null> {
    try {
      const cacheKey = `collections/release-${releaseId}.json`;

      // Try cache first
      const cached = await this.fileStorage.readJSON<DiscogsRelease>(cacheKey);
      if (cached) {
        return cached;
      }

      const headers = await this.getAuthHeaders();
      const response = await this.axios.get(`/releases/${releaseId}`, {
        headers,
      });

      const release: DiscogsRelease = {
        id: response.data.id,
        master_id: response.data.master_id,
        title: response.data.title,
        artist:
          response.data.artists?.map((a: any) => a.name).join(', ') ||
          'Unknown Artist',
        year: response.data.year,
        format: response.data.formats?.map((f: any) => f.name) || [],
        label: response.data.labels?.map((l: any) => l.name) || [],
        catalog_number: response.data.catalog_number,
        cover_image: response.data.images?.[0]?.uri,
        resource_url: response.data.resource_url,
        tracklist:
          response.data.tracklist?.map((track: any) => ({
            position: track.position,
            title: track.title,
            duration: track.duration,
            artist: track.artists?.map((a: any) => a.name).join(', '),
          })) || [],
      };

      // Cache the release
      await this.fileStorage.writeJSON(cacheKey, release);

      return release;
    } catch (error) {
      this.logger.error('Error fetching release details', error);
      return null;
    }
  }

  async preloadAllCollectionPages(username: string): Promise<void> {
    const progressKey = `collections/${username}-progress.json`;

    // Check if preloading is already in progress for this user
    if (this.preloadingInProgress.get(username)) {
      this.logger.info(
        `Preloading already in progress for ${username}, skipping duplicate request`
      );
      return;
    }

    // Set the lock
    this.preloadingInProgress.set(username, true);

    try {
      this.logger.info(
        `Starting progressive collection loading for: ${username}`
      );

      // Check if we already have a recent cache
      const existingProgress =
        await this.fileStorage.readJSON<any>(progressKey);

      if (existingProgress && existingProgress.status === 'completed') {
        // Check if the cache is still recent (less than 12 hours old)
        const cacheAge = Date.now() - (existingProgress.endTime || 0);
        if (cacheAge < 43200000) {
          // 12 hours
          const ageMinutes = Math.round(cacheAge / 1000 / 60);
          this.logger.info(
            `Cache is recent (${ageMinutes} minutes old), skipping preload`
          );
          return;
        }
      }

      // Get first page to determine total pages
      const firstPage = await this.getUserCollection(username, 1, 50);
      if (!firstPage.success || !firstPage.pagination) {
        this.logger.warn('Failed to get first page for preloading');
        // Mark as failed
        await this.fileStorage.writeJSON(progressKey, {
          username,
          status: 'failed',
          error: firstPage.error || 'Failed to get first page',
        });
        return;
      }

      const totalPages = firstPage.pagination.pages;
      this.logger.info(
        `Collection has ${totalPages} pages, starting background loading...`
      );

      // Store progress information
      await this.fileStorage.writeJSON(progressKey, {
        username,
        totalPages,
        currentPage: 1,
        completedPages: [1],
        startTime: Date.now(),
        status: 'loading',
      });

      // Load remaining pages in background with rate limiting
      for (let page = 2; page <= totalPages; page++) {
        try {
          // Add delay to respect rate limits (1 request per second)
          await new Promise(resolve => setTimeout(resolve, 1000));

          const result = await this.getUserCollection(username, page, 50);
          if (result.success) {
            this.logger.debug(`Cached page ${page}/${totalPages}`);

            // Update progress
            const progress =
              (await this.fileStorage.readJSON<any>(progressKey)) || {};
            progress.currentPage = page;
            progress.completedPages = progress.completedPages || [];
            progress.completedPages.push(page);
            await this.fileStorage.writeJSON(progressKey, progress);
          } else {
            this.logger.warn(`Failed to cache page ${page}`);
          }
        } catch (error) {
          this.logger.error(`Error loading page ${page}`, error);
          // Continue with next page even if one fails
        }
      }

      // Mark as completed
      await this.fileStorage.writeJSON(progressKey, {
        username,
        totalPages,
        currentPage: totalPages,
        completedPages: Array.from({ length: totalPages }, (_, i) => i + 1),
        startTime: Date.now(),
        status: 'completed',
        endTime: Date.now(),
      });

      this.logger.info(
        `Finished preloading ${totalPages} pages for ${username}`
      );
    } catch (error) {
      this.logger.error('Error in preloadAllCollectionPages', error);

      // Mark as failed
      const progress =
        (await this.fileStorage.readJSON<any>(progressKey)) || {};
      progress.status = 'failed';
      progress.error = error instanceof Error ? error.message : 'Unknown error';
      await this.fileStorage.writeJSON(progressKey, progress);
    } finally {
      // Always release the lock
      this.preloadingInProgress.delete(username);
    }
  }

  async searchCollectionFromCache(
    username: string,
    query: string,
    page: number = 1,
    perPage: number = 50
  ): Promise<{ items: CollectionItem[]; total: number; totalPages: number }> {
    try {
      this.logger.debug(
        `Searching cached collection for: ${query} (page ${page})`
      );

      // Get all cached pages (including expired ones)
      const allItems: CollectionItem[] = [];
      let pageNumber = 1;
      let hasExpiredCache = false;

      while (true) {
        const cacheKey = `collections/${username}-page-${pageNumber}.json`;
        const cached =
          await this.fileStorage.readJSON<ApiResponse<CollectionItem[]>>(
            cacheKey
          );

        if (!cached || !cached.data) {
          // No cache file found, stop reading
          break;
        }

        // Check if cache is expired but still use the data
        const isExpired = !this.isCacheValid(cached);
        if (isExpired) {
          const ageMinutes = cached.timestamp
            ? Math.round((Date.now() - cached.timestamp) / 1000 / 60)
            : 'unknown';
          this.logger.debug(`Cache expired for page ${pageNumber}`, {
            age: `${ageMinutes} minutes`,
          });
          hasExpiredCache = true;
          // Trigger background refresh on first expired page
          if (pageNumber === 1) {
            this.logger.info(
              `Search found expired cache, starting background refresh for ${username}`
            );
            // Start background preloading without waiting for it
            this.preloadAllCollectionPages(username).catch(error => {
              this.logger.error('Background refresh failed', error);
            });
          }
        }

        // Still include the data even if expired
        allItems.push(...cached.data);
        pageNumber++;
      }

      this.logger.debug(
        `Loaded ${allItems.length} items from cache${hasExpiredCache ? ' (some expired, refresh triggered)' : ''}`
      );

      // Deduplicate items by release ID (in case cache has duplicates)
      const uniqueItemsMap = new Map<number, CollectionItem>();
      for (const item of allItems) {
        if (!uniqueItemsMap.has(item.id)) {
          uniqueItemsMap.set(item.id, item);
        }
      }
      const deduplicatedItems = Array.from(uniqueItemsMap.values());

      if (deduplicatedItems.length !== allItems.length) {
        this.logger.warn(
          `Removed ${allItems.length - deduplicatedItems.length} duplicate items from cache`
        );
      }

      // Filter results
      const lowerQuery = query.toLowerCase();
      const filteredItems = deduplicatedItems.filter(
        item =>
          item.release.title.toLowerCase().includes(lowerQuery) ||
          item.release.artist.toLowerCase().includes(lowerQuery)
      );

      // Apply pagination to filtered results
      const total = filteredItems.length;
      const totalPages = Math.ceil(total / perPage);
      const startIndex = (page - 1) * perPage;
      const endIndex = startIndex + perPage;
      const paginatedItems = filteredItems.slice(startIndex, endIndex);

      this.logger.info(
        `Found ${total} results for "${query}", returning page ${page}/${totalPages} (${paginatedItems.length} items)`
      );

      return {
        items: paginatedItems,
        total,
        totalPages,
      };
    } catch (error) {
      this.logger.error('Error searching collection from cache', error);
      return { items: [], total: 0, totalPages: 0 };
    }
  }

  async searchCollection(
    username: string,
    query: string
  ): Promise<CollectionItem[]> {
    try {
      this.logger.info(`Searching collection for: ${query}`);

      // Try to search from cache first
      const cacheResult = await this.searchCollectionFromCache(
        username,
        query,
        1,
        100
      );
      if (cacheResult.items.length > 0 || cacheResult.total > 0) {
        return cacheResult.items;
      }

      // Fall back to original search if no cache available
      this.logger.info('No cache available, falling back to API search');
      const response = await this.getUserCollection(username, 1, 100);

      if (!response.success || !response.data) {
        this.logger.warn('Failed to get collection for search');
        return [];
      }

      this.logger.debug(`Loaded ${response.data.length} items from API`);

      // Filter results
      const lowerQuery = query.toLowerCase();
      const results = response.data.filter(
        item =>
          item.release.title.toLowerCase().includes(lowerQuery) ||
          item.release.artist.toLowerCase().includes(lowerQuery)
      );

      this.logger.info(`Found ${results.length} results for "${query}"`);
      return results;
    } catch (error) {
      this.logger.error('Error searching collection', error);
      return [];
    }
  }

  public isCacheValid(cached: any): boolean {
    // Cache is valid for 24 hours
    const cacheAge = Date.now() - (cached.timestamp || 0);
    const isValid = cacheAge < 86400000; // 24 hours in milliseconds
    const ageMinutes = Math.round(cacheAge / 1000 / 60);
    this.logger.debug(`Cache validation`, {
      age: `${ageMinutes} minutes`,
      valid: isValid,
    });
    return isValid;
  }

  async getCacheProgress(username: string): Promise<any> {
    try {
      const progressFilePath = `collections/${username}-progress.json`;
      const progress = await this.fileStorage.readJSON(progressFilePath);
      return progress || null;
    } catch (error) {
      this.logger.error('Error getting cache progress', error);
      return null;
    }
  }

  async clearCache(): Promise<void> {
    try {
      const files = await this.fileStorage.listFiles('collections');
      // Only delete collection page cache files (username-page-N.json)
      // Don't delete progress files, backup files, or other files in the directory
      const cacheFiles = files.filter(file =>
        file.match(/^[^-]+-page-\d+\.json$/)
      );

      this.logger.info(
        `Clearing ${cacheFiles.length} collection cache files (${files.length} total files in directory)`
      );

      for (const file of cacheFiles) {
        try {
          await this.fileStorage.delete(`collections/${file}`);
        } catch (error) {
          this.logger.warn(`Failed to delete cache file ${file}:`, error);
          // Continue with other files even if one fails
        }
      }

      this.logger.info('Collection cache cleared successfully');
    } catch (error) {
      this.logger.error('Error clearing collection cache:', error);
      throw new Error(
        `Failed to clear collection cache: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async checkForNewItems(username: string): Promise<{
    success: boolean;
    newItemsCount: number;
    latestCacheDate?: string;
    latestDiscogsDate?: string;
    error?: string;
  }> {
    try {
      this.logger.info(`Checking for new items in ${username}'s collection`);

      // Get cache timestamp (when cache was last refreshed) instead of scanning all items
      const cacheKey = `collections/${username}-page-1.json`;
      const cached = await this.fileStorage.readJSON<any>(cacheKey);

      if (!cached || !cached.timestamp) {
        this.logger.warn('No cached data found or no timestamp');
        return {
          success: false,
          newItemsCount: 0,
          error: 'No cached data found',
        };
      }

      // Cache timestamp tells us when data was last fetched from Discogs
      const cacheTimestamp = new Date(cached.timestamp);
      this.logger.debug(
        `Cache was last updated: ${cacheTimestamp.toISOString()}`
      );

      // Get the first page from Discogs sorted by date_added descending to get newest items first
      this.logger.info(
        'Fetching fresh collection data sorted by date_added from Discogs API'
      );
      let response;
      let headers;
      try {
        headers = await this.getAuthHeaders();
        response = await this.axios.get(
          `/users/${username}/collection/folders/0/releases`,
          {
            headers,
            params: {
              page: 1,
              per_page: 50,
              sort: 'added',
              sort_order: 'desc',
            },
          }
        );
      } catch (apiError) {
        this.logger.error('Authenticated API call failed', apiError);
        // Fallback to unauthenticated call for testing
        this.logger.info('Trying unauthenticated API call as fallback...');
        headers = { 'User-Agent': 'DiscogLastfmScrobbler/1.0' };
        response = await this.axios.get(
          `/users/${username}/collection/folders/0/releases`,
          {
            headers,
            params: {
              page: 1,
              per_page: 50,
              sort: 'added',
              sort_order: 'desc',
            },
          }
        );
      }

      this.logger.debug(`Discogs API Response Status: ${response.status}`);
      const first3Items =
        response.data.releases?.slice(0, 3).map((item: any) => ({
          date_added: item.date_added,
          title: item.basic_information.title,
          artist: item.basic_information.artists[0]?.name,
        })) || 'No releases found';
      this.logger.debug('First 3 items from Discogs', { items: first3Items });

      if (
        !response.data ||
        !response.data.releases ||
        response.data.releases.length === 0
      ) {
        this.logger.warn('Failed to get fresh collection data from Discogs');
        return {
          success: false,
          newItemsCount: 0,
          error: 'Failed to get fresh collection data',
        };
      }

      // Transform the response to match our format
      const freshItems: CollectionItem[] = response.data.releases.map(
        (item: any) => ({
          id: item.id,
          date_added: item.date_added,
          rating: item.rating,
          release: {
            id: item.basic_information.id,
            master_id: item.basic_information.master_id,
            title: item.basic_information.title,
            artist:
              item.basic_information.artists
                ?.map((a: any) => a.name)
                .join(', ') || 'Unknown Artist',
            year: item.basic_information.year,
            format:
              item.basic_information.formats?.map((f: any) => f.name) || [],
            label: item.basic_information.labels?.map((l: any) => l.name) || [],
            cover_image: item.basic_information.cover_image,
            resource_url: item.basic_information.resource_url,
          },
        })
      );

      // Get the most recent date_added from Discogs (first item since sorted by date desc)
      const latestDiscogsDate =
        freshItems.length > 0 && freshItems[0].date_added
          ? freshItems[0].date_added
          : null;

      if (!latestDiscogsDate) {
        this.logger.warn('No date_added found in Discogs data');
        return {
          success: false,
          newItemsCount: 0,
          error: 'No date information found',
        };
      }

      const latestDiscogsTimestamp = new Date(latestDiscogsDate);
      this.logger.debug('Date comparison', {
        latestDiscogsDate,
        latestDiscogsTimestamp: latestDiscogsTimestamp.toISOString(),
        cacheTimestamp: cacheTimestamp.toISOString(),
        isNewerThanCache: latestDiscogsTimestamp > cacheTimestamp,
      });

      // Compare the newest item's date with when cache was last updated
      if (latestDiscogsTimestamp > cacheTimestamp) {
        // Count items that are newer than cache timestamp
        let newItemsCount = 0;
        let checkPage = 1;
        const checkLimit = 10; // Limit to checking first 10 pages for performance

        while (checkPage <= checkLimit) {
          this.logger.debug(`Checking page ${checkPage} for new items...`);
          const pageResponse = await this.axios.get(
            `/users/${username}/collection/folders/0/releases`,
            {
              headers,
              params: {
                page: checkPage,
                per_page: 50,
                sort: 'added',
                sort_order: 'desc',
              },
            }
          );

          if (!pageResponse.data || !pageResponse.data.releases) {
            this.logger.warn(`Failed to get page ${checkPage}`);
            break;
          }

          let foundOlderItem = false;
          pageResponse.data.releases.forEach((item: any) => {
            const itemTimestamp = new Date(item.date_added);
            if (itemTimestamp > cacheTimestamp) {
              newItemsCount++;
              this.logger.debug('Found new item', {
                artist: item.basic_information.artists[0]?.name,
                title: item.basic_information.title,
                dateAdded: item.date_added,
              });
            } else {
              foundOlderItem = true;
            }
          });

          // If we found an older item, we can stop checking (since data is sorted by date desc)
          if (foundOlderItem) {
            this.logger.debug(
              `Found older items on page ${checkPage}, stopping search`
            );
            break;
          }

          checkPage++;

          // Add delay to respect rate limits
          if (checkPage <= checkLimit) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }

        this.logger.info(
          `Found ${newItemsCount} new items since cache was last updated`
        );
        return {
          success: true,
          newItemsCount,
          latestCacheDate: cacheTimestamp.toISOString(),
          latestDiscogsDate,
        };
      } else {
        this.logger.info('No new items found. Collection is up to date.');
        return {
          success: true,
          newItemsCount: 0,
          latestCacheDate: cacheTimestamp.toISOString(),
          latestDiscogsDate,
        };
      }
    } catch (error) {
      this.logger.error('Error checking for new items', error);
      return {
        success: false,
        newItemsCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async updateCacheWithNewItems(
    username: string
  ): Promise<{ success: boolean; newItemsAdded: number; error?: string }> {
    try {
      this.logger.info(`Starting incremental cache update for ${username}`);

      // Get cache timestamp to know what's already cached
      const cacheKey = `collections/${username}-page-1.json`;
      const cached = await this.fileStorage.readJSON<any>(cacheKey);

      if (!cached || !cached.timestamp) {
        this.logger.warn(
          'No existing cache found - use full cache refresh instead'
        );
        return {
          success: false,
          newItemsAdded: 0,
          error: 'No existing cache found',
        };
      }

      const cacheTimestamp = new Date(cached.timestamp);
      this.logger.debug(
        `Cache was last updated: ${cacheTimestamp.toISOString()}`
      );

      // Capture timestamp BEFORE fetching new items
      // This ensures items added during the update are still detected as new next time
      const updateStartTime = Date.now();

      // Fetch new items from Discogs (sorted by date_added descending)
      this.logger.info('Fetching new items from Discogs API');
      let headers;
      try {
        headers = await this.getAuthHeaders();
      } catch (apiError) {
        this.logger.error('Authentication failed', apiError);
        headers = { 'User-Agent': 'DiscogLastfmScrobbler/1.0' };
      }

      const newItems: CollectionItem[] = [];
      let checkPage = 1;
      const checkLimit = 10; // Limit pages to avoid infinite loops

      while (checkPage <= checkLimit) {
        this.logger.debug(`Fetching page ${checkPage} for new items...`);
        const response = await this.axios.get(
          `/users/${username}/collection/folders/0/releases`,
          {
            headers,
            params: {
              page: checkPage,
              per_page: 50,
              sort: 'added',
              sort_order: 'desc',
            },
          }
        );

        if (!response.data || !response.data.releases) {
          this.logger.warn(`Failed to get page ${checkPage}`);
          break;
        }

        let foundOlderItem = false;
        response.data.releases.forEach((item: any) => {
          const itemTimestamp = new Date(item.date_added);
          if (itemTimestamp > cacheTimestamp) {
            // Transform and add new item
            const transformedItem: CollectionItem = {
              id: item.id,
              date_added: item.date_added,
              rating: item.rating,
              notes: item.notes,
              release: {
                id: item.basic_information.id,
                master_id: item.basic_information.master_id,
                title: item.basic_information.title,
                artist:
                  item.basic_information.artists
                    ?.map((a: any) => a.name)
                    .join(', ') || 'Unknown Artist',
                year: item.basic_information.year,
                format:
                  item.basic_information.formats?.map((f: any) => f.name) || [],
                label:
                  item.basic_information.labels?.map((l: any) => l.name) || [],
                catalog_number: item.basic_information.catalog_number,
                cover_image: item.basic_information.cover_image,
                resource_url: item.basic_information.resource_url,
              },
            };
            newItems.push(transformedItem);
            this.logger.debug('Found new item', {
              artist: transformedItem.release.artist,
              title: transformedItem.release.title,
              dateAdded: transformedItem.date_added,
            });
          } else {
            foundOlderItem = true;
          }
        });

        // If we found an older item, stop checking (data is sorted by date desc)
        if (foundOlderItem) {
          this.logger.debug(
            `Found older items on page ${checkPage}, stopping search`
          );
          break;
        }

        checkPage++;

        // Add delay to respect rate limits
        if (checkPage <= checkLimit) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      if (newItems.length === 0) {
        this.logger.info('No new items to add to cache');
        return { success: true, newItemsAdded: 0 };
      }

      this.logger.info(`Adding ${newItems.length} new items to cache`);

      // Read all existing cache pages and merge with new items
      const allExistingItems: CollectionItem[] = [];
      let pageNumber = 1;

      while (true) {
        const pageKey = `collections/${username}-page-${pageNumber}.json`;
        const pageCache = await this.fileStorage.readJSON<any>(pageKey);

        if (!pageCache || !pageCache.data) {
          break;
        }

        allExistingItems.push(...pageCache.data);
        pageNumber++;
      }

      this.logger.debug(
        `Loaded ${allExistingItems.length} existing items from cache`
      );

      // Merge new items with existing items (new items first since they're newest)
      const mergedItems = [...newItems, ...allExistingItems];
      this.logger.debug(`Merged to ${mergedItems.length} total items`);

      // Re-paginate and save updated cache
      // Use the update start time (when we started fetching new items) not current time
      // This ensures items added during the update are still detected as new next time
      const itemsPerPage = 50;
      const totalPages = Math.ceil(mergedItems.length / itemsPerPage);

      for (let page = 1; page <= totalPages; page++) {
        const startIndex = (page - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const pageItems = mergedItems.slice(startIndex, endIndex);

        const pageData = {
          success: true,
          data: pageItems,
          pagination: {
            page,
            pages: totalPages,
            per_page: itemsPerPage,
            items: mergedItems.length,
          },
          timestamp: updateStartTime,
        };

        const pageKey = `collections/${username}-page-${page}.json`;
        await this.fileStorage.writeJSON(pageKey, pageData);
      }

      // Remove any old pages that are no longer needed
      let checkOldPages = totalPages + 1;
      while (checkOldPages <= totalPages + 5) {
        // Check a few extra pages
        const oldPageKey = `collections/${username}-page-${checkOldPages}.json`;
        try {
          await this.fileStorage.delete(oldPageKey);
          this.logger.debug(`Removed old cache page ${checkOldPages}`);
        } catch {
          // Page doesn't exist, which is fine
          break;
        }
        checkOldPages++;
      }

      this.logger.info(
        `Incremental cache update completed: added ${newItems.length} new items`
      );
      return { success: true, newItemsAdded: newItems.length };
    } catch (error) {
      this.logger.error('Error during incremental cache update', error);
      return {
        success: false,
        newItemsAdded: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
