import axios, { AxiosInstance } from 'axios';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';
import { FileStorage } from '../utils/fileStorage';
import { AuthService } from './authService';
import { CollectionItem, DiscogsRelease, ApiResponse } from '../../shared/types';

export class DiscogsService {
  private axios: AxiosInstance;
  private fileStorage: FileStorage;
  private authService: AuthService;
  private oauth: OAuth;
  private baseUrl = 'https://api.discogs.com';

  constructor(fileStorage: FileStorage, authService: AuthService) {
    this.fileStorage = fileStorage;
    this.authService = authService;
    
    this.oauth = new OAuth({
      consumer: {
        key: process.env.DISCOGS_CLIENT_ID || '',
        secret: process.env.DISCOGS_CLIENT_SECRET || ''
      },
      signature_method: 'HMAC-SHA1',
      hash_function(base_string, key) {
        return crypto.createHmac('sha1', key).update(base_string).digest('base64');
      }
    });

    this.axios = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'User-Agent': 'DiscogLastfmScrobbler/1.0'
      }
    });

    // Rate limiting interceptor
    this.axios.interceptors.request.use(async (config) => {
      // Simple rate limiting: wait 1 second between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
      return config;
    });
  }

  async getAuthUrl(): Promise<string> {
    console.log('Starting Discogs OAuth flow...');
    
    // Check credentials
    const clientId = process.env.DISCOGS_CLIENT_ID;
    const clientSecret = process.env.DISCOGS_CLIENT_SECRET;
    console.log('Discogs credentials:', { 
      clientId: clientId ? 'present' : 'missing', 
      clientSecret: clientSecret ? 'present' : 'missing' 
    });
    
    // Step 1: Get request token
    const requestData = {
      url: `${this.baseUrl}/oauth/request_token`,
      method: 'GET'
    };
    
    console.log('Request data for OAuth:', requestData);
    const authHeader = this.oauth.toHeader(this.oauth.authorize(requestData));
    console.log('OAuth authorization header:', authHeader);
    
    try {
      const response = await this.axios.get('/oauth/request_token', {
        headers: authHeader as any
      });
      
      console.log('Discogs request token response:', response.data);
      
      // Parse the response (should be in format: oauth_token=...&oauth_token_secret=...)
      const params = new URLSearchParams(response.data);
      const oauthToken = params.get('oauth_token');
      const oauthTokenSecret = params.get('oauth_token_secret');
      
      console.log('Parsed tokens:', { oauthToken, oauthTokenSecret: oauthTokenSecret ? 'present' : 'missing' });
      
      if (!oauthToken || !oauthTokenSecret) {
        throw new Error('Failed to get OAuth request token');
      }
      
      // Store the token secret temporarily (needed for the callback)
      await this.authService.storeOAuthTokenSecret(oauthTokenSecret);
      console.log('Stored token secret for callback');
      
      // Return the authorization URL
      const callbackUrl = process.env.DISCOGS_CALLBACK_URL || 'http://localhost:3001/api/v1/auth/discogs/callback';
      
      // Include the callback URL in the authorization URL
      const authUrl = `https://discogs.com/oauth/authorize?oauth_token=${oauthToken}&oauth_callback=${encodeURIComponent(callbackUrl)}`;
      console.log('Generated auth URL with callback:', authUrl);
      console.log('Callback URL:', callbackUrl);
      
      return authUrl;
      
    } catch (error: any) {
      console.error('Discogs OAuth error:', error);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      throw new Error('Failed to initiate Discogs OAuth flow');
    }
  }

  async handleCallback(oauthToken: string, oauthVerifier: string): Promise<{ username: string }> {
    try {
      // Get the stored token secret
      const tokenSecret = await this.authService.getOAuthTokenSecret();
      if (!tokenSecret) {
        throw new Error('OAuth token secret not found. Please restart the authentication flow.');
      }
      
      // Step 2: Exchange for access token
      const requestData = {
        url: `${this.baseUrl}/oauth/access_token`,
        method: 'POST'
      };
      
      const token = {
        key: oauthToken,
        secret: tokenSecret
      };
      
      const authHeader = this.oauth.toHeader(this.oauth.authorize(requestData, token));
      
      const response = await this.axios.post('/oauth/access_token', null, {
        headers: authHeader as any,
        params: {
          oauth_verifier: oauthVerifier
        }
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
        secret: accessTokenSecret
      });
      
      // Get user profile to get username
      const userProfile = await this.getUserProfileWithToken({
        key: accessToken,
        secret: accessTokenSecret
      });
      
      // Save the token and username
      await this.authService.setDiscogsToken(tokenData, userProfile.username);
      
      // Clean up temporary token secret
      await this.authService.clearOAuthTokenSecret();
      
      return { username: userProfile.username };
      
    } catch (error) {
      console.error('Discogs OAuth callback error:', error);
      throw new Error('Failed to complete Discogs OAuth flow');
    }
  }

  private async getUserProfileWithToken(token: { key: string; secret: string }): Promise<any> {
    const requestData = {
      url: `${this.baseUrl}/oauth/identity`,
      method: 'GET'
    };
    
    const authHeader = this.oauth.toHeader(this.oauth.authorize(requestData, token));
    
    const response = await this.axios.get('/oauth/identity', {
      headers: authHeader as any
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
        'Authorization': token
      };
    }

    // For OAuth token
    const requestData = {
      url: this.baseUrl,
      method: 'GET'
    };

    const tokenObj = JSON.parse(token);
    return this.oauth.toHeader(this.oauth.authorize(requestData, tokenObj));
  }

  async getUserProfile(): Promise<any> {
    try {
      const token = await this.authService.getDiscogsToken();
      
      if (!token) {
        throw new Error('No Discogs token available. Please authenticate first.');
      }

      // For Personal Access Token, we need to make a simple API call to get user info
      if (token.startsWith('Discogs token=')) {
        const headers = {
          'Authorization': token,
          'User-Agent': 'DiscogLastfmScrobbler/1.0'
        };
        
        // For personal tokens, we can use the /users/{username} endpoint
        // But first we need to get our own user info
        // Let's try a simple API call first to test the token
        const response = await this.axios.get('/database/search?q=test&type=release&per_page=1', { 
          headers 
        });
        
        // If that works, the token is valid, but we still need username
        // For now, return a placeholder - in a real app you'd need to get username another way
        return {
          username: 'user', // Placeholder - we'd need to get this from somewhere else
          id: 'unknown'
        };
      }

      // For OAuth token, use the identity endpoint
      const headers = await this.getAuthHeaders();
      const response = await this.axios.get('/oauth/identity', { headers });
      return response.data;
    } catch (error: any) {
      console.error('Error fetching user profile:', error);
      if (error.response) {
        console.error('Discogs API error:', error.response.status, error.response.data);
      }
      throw error;
    }
  }

  async getUserCollection(username: string, page: number = 1, perPage: number = 50, forceReload: boolean = false): Promise<ApiResponse<CollectionItem[]>> {
    try {
      const cacheKey = `collections/${username}-page-${page}.json`;
      
      // Try cache first (unless force reload is requested)
      if (!forceReload) {
        console.log(`🔍 Checking cache for ${cacheKey}`);
        const cached = await this.fileStorage.readJSON<ApiResponse<CollectionItem[]>>(cacheKey);
        if (cached && this.isCacheValid(cached)) {
          console.log(`✅ Returning cached collection page ${page} for ${username} (cache age: ${Math.round((Date.now() - (cached.timestamp || 0)) / 1000 / 60)} minutes)`);
          return cached;
        } else if (cached) {
          console.log(`⏰ Cache expired for page ${page} (cache age: ${Math.round((Date.now() - (cached.timestamp || 0)) / 1000 / 60)} minutes)`);
        } else {
          console.log(`📁 No cache found for page ${page}`);
        }
      } else {
        console.log(`🔄 Force reload requested for page ${page}`);
      }

      console.log(`🌐 Fetching collection page ${page} for ${username} from API`);
      
      const headers = await this.getAuthHeaders();
      const response = await this.axios.get(`/users/${username}/collection/folders/0/releases`, {
        headers,
        params: {
          page,
          per_page: perPage
        }
      });

      // Transform the response
      const transformedReleases: CollectionItem[] = response.data.releases.map((item: any) => ({
        id: item.id,
        date_added: item.date_added,
        rating: item.rating,
        notes: item.notes,
        release: {
          id: item.basic_information.id,
          master_id: item.basic_information.master_id,
          title: item.basic_information.title,
          artist: item.basic_information.artists?.map((a: any) => a.name).join(', ') || 'Unknown Artist',
          year: item.basic_information.year,
          format: item.basic_information.formats?.map((f: any) => f.name) || [],
          label: item.basic_information.labels?.map((l: any) => l.name) || [],
          catalog_number: item.basic_information.catalog_number,
          cover_image: item.basic_information.cover_image,
          resource_url: item.basic_information.resource_url
        }
      }));

      const result: ApiResponse<CollectionItem[]> = {
        success: true,
        data: transformedReleases,
        pagination: response.data.pagination,
        timestamp: Date.now()
      };

      // Cache the result
      await this.fileStorage.writeJSON(cacheKey, result);
      
      return result;
    } catch (error) {
      console.error('Error fetching user collection:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
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
      const response = await this.axios.get(`/releases/${releaseId}`, { headers });
      
      const release: DiscogsRelease = {
        id: response.data.id,
        master_id: response.data.master_id,
        title: response.data.title,
        artist: response.data.artists?.map((a: any) => a.name).join(', ') || 'Unknown Artist',
        year: response.data.year,
        format: response.data.formats?.map((f: any) => f.name) || [],
        label: response.data.labels?.map((l: any) => l.name) || [],
        catalog_number: response.data.catalog_number,
        cover_image: response.data.images?.[0]?.uri,
        resource_url: response.data.resource_url,
        tracklist: response.data.tracklist?.map((track: any) => ({
          position: track.position,
          title: track.title,
          duration: track.duration,
          artist: track.artists?.map((a: any) => a.name).join(', ')
        })) || []
      };

      // Cache the release
      await this.fileStorage.writeJSON(cacheKey, release);
      
      return release;
    } catch (error) {
      console.error('Error fetching release details:', error);
      return null;
    }
  }

  async preloadAllCollectionPages(username: string): Promise<void> {
    const progressKey = `collections/${username}-progress.json`;
    
    try {
      console.log(`Starting progressive collection loading for: ${username}`);
      
      // Check if we already have a recent cache
      const existingProgress = await this.fileStorage.readJSON<any>(progressKey);
      
      if (existingProgress && existingProgress.status === 'completed') {
        // Check if the cache is still recent (less than 12 hours old)
        const cacheAge = Date.now() - (existingProgress.endTime || 0);
        if (cacheAge < 43200000) { // 12 hours
          console.log(`Cache is recent (${Math.round(cacheAge / 1000 / 60)} minutes old), skipping preload`);
          return;
        }
      }
      
      // Get first page to determine total pages
      const firstPage = await this.getUserCollection(username, 1, 50);
      if (!firstPage.success || !firstPage.pagination) {
        console.log('Failed to get first page for preloading');
        // Mark as failed
        await this.fileStorage.writeJSON(progressKey, {
          username,
          status: 'failed',
          error: firstPage.error || 'Failed to get first page'
        });
        return;
      }

      const totalPages = firstPage.pagination.pages;
      console.log(`Collection has ${totalPages} pages, starting background loading...`);

      // Store progress information
      await this.fileStorage.writeJSON(progressKey, {
        username,
        totalPages,
        currentPage: 1,
        completedPages: [1],
        startTime: Date.now(),
        status: 'loading'
      });

      // Load remaining pages in background with rate limiting
      for (let page = 2; page <= totalPages; page++) {
        try {
          // Add delay to respect rate limits (1 request per second)
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const result = await this.getUserCollection(username, page, 50);
          if (result.success) {
            console.log(`Cached page ${page}/${totalPages}`);
            
            // Update progress
            const progress = await this.fileStorage.readJSON<any>(progressKey) || {};
            progress.currentPage = page;
            progress.completedPages = progress.completedPages || [];
            progress.completedPages.push(page);
            await this.fileStorage.writeJSON(progressKey, progress);
          } else {
            console.log(`Failed to cache page ${page}`);
          }
        } catch (error) {
          console.error(`Error loading page ${page}:`, error);
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
        endTime: Date.now()
      });

      console.log(`Finished preloading ${totalPages} pages for ${username}`);
    } catch (error) {
      console.error('Error in preloadAllCollectionPages:', error);
      
      // Mark as failed
      const progress = await this.fileStorage.readJSON<any>(progressKey) || {};
      progress.status = 'failed';
      progress.error = error instanceof Error ? error.message : 'Unknown error';
      await this.fileStorage.writeJSON(progressKey, progress);
    }
  }

  async searchCollectionFromCache(username: string, query: string, page: number = 1, perPage: number = 50): Promise<{ items: CollectionItem[], total: number, totalPages: number }> {
    try {
      console.log(`Searching cached collection for: ${query} (page ${page})`);
      
      // Get all cached pages
      const allItems: CollectionItem[] = [];
      let pageNumber = 1;
      
      while (true) {
        const cacheKey = `collections/${username}-page-${pageNumber}.json`;
        const cached = await this.fileStorage.readJSON<ApiResponse<CollectionItem[]>>(cacheKey);
        
        if (!cached || !this.isCacheValid(cached) || !cached.data) {
          break;
        }
        
        allItems.push(...cached.data);
        pageNumber++;
      }

      console.log(`Loaded ${allItems.length} items from cache`);

      // Filter results
      const lowerQuery = query.toLowerCase();
      const filteredItems = allItems.filter(item => 
        item.release.title.toLowerCase().includes(lowerQuery) ||
        item.release.artist.toLowerCase().includes(lowerQuery)
      );
      
      // Apply pagination to filtered results
      const total = filteredItems.length;
      const totalPages = Math.ceil(total / perPage);
      const startIndex = (page - 1) * perPage;
      const endIndex = startIndex + perPage;
      const paginatedItems = filteredItems.slice(startIndex, endIndex);
      
      console.log(`Found ${total} results for "${query}", returning page ${page}/${totalPages} (${paginatedItems.length} items)`);
      
      return {
        items: paginatedItems,
        total,
        totalPages
      };
    } catch (error) {
      console.error('Error searching collection from cache:', error);
      return { items: [], total: 0, totalPages: 0 };
    }
  }

  async searchCollection(username: string, query: string): Promise<CollectionItem[]> {
    try {
      console.log(`Searching collection for: ${query}`);
      
      // Try to search from cache first
      const cacheResult = await this.searchCollectionFromCache(username, query, 1, 100);
      if (cacheResult.items.length > 0 || cacheResult.total > 0) {
        return cacheResult.items;
      }
      
      // Fall back to original search if no cache available
      console.log('No cache available, falling back to API search');
      const response = await this.getUserCollection(username, 1, 100);
      
      if (!response.success || !response.data) {
        console.log('Failed to get collection for search');
        return [];
      }

      console.log(`Loaded ${response.data.length} items from API`);

      // Filter results
      const lowerQuery = query.toLowerCase();
      const results = response.data.filter(item => 
        item.release.title.toLowerCase().includes(lowerQuery) ||
        item.release.artist.toLowerCase().includes(lowerQuery)
      );
      
      console.log(`Found ${results.length} results for "${query}"`);
      return results;
    } catch (error) {
      console.error('Error searching collection:', error);
      return [];
    }
  }

  public isCacheValid(cached: any): boolean {
    // Cache is valid for 24 hours
    const cacheAge = Date.now() - (cached.timestamp || 0);
    const isValid = cacheAge < 86400000; // 24 hours in milliseconds
    console.log(`🔍 Cache validation: age=${Math.round(cacheAge / 1000 / 60)} minutes, valid=${isValid}`);
    return isValid;
  }

  private isCacheOlderThan24Hours(cached: any): boolean {
    const cacheAge = Date.now() - (cached.timestamp || 0);
    return cacheAge >= 86400000; // 24 hours in milliseconds
  }

  async getCacheProgress(username: string): Promise<any> {
    try {
      const progressFilePath = `collections/${username}-progress.json`;
      const progress = await this.fileStorage.readJSON(progressFilePath);
      return progress || null;
    } catch (error) {
      console.error('Error getting cache progress:', error);
      return null;
    }
  }

  async clearCache(): Promise<void> {
    const files = await this.fileStorage.listFiles('collections');
    for (const file of files) {
      await this.fileStorage.delete(`collections/${file}`);
    }
  }
}