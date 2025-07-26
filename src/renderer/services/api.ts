import axios, { AxiosInstance } from 'axios';

import {
  ApiResponse,
  AuthStatus,
  CollectionItem,
  DiscogsRelease,
  ScrobbleTrack,
  ScrobbleSession,
} from '../../shared/types';

class ApiService {
  private api: AxiosInstance;
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:3001') {
    this.baseUrl = baseUrl;
    this.api = axios.create({
      baseURL: `${baseUrl}/api/v1`,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor for logging
    this.api.interceptors.request.use(
      config => {
        console.log(
          `API Request: ${config.method?.toUpperCase()} ${config.url}`
        );
        return config;
      },
      error => {
        console.error('API Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.api.interceptors.response.use(
      response => {
        return response;
      },
      error => {
        console.error('API Response Error:', error);
        if (error.code === 'ECONNREFUSED') {
          throw new Error(
            'Unable to connect to server. Please ensure the backend is running.'
          );
        }
        throw error;
      }
    );
  }

  // Health check
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    // Health endpoint is at root level, not under /api/v1
    const response = await axios.get(`${this.baseUrl}/health`);
    return response.data;
  }

  // Authentication methods
  async getAuthStatus(): Promise<AuthStatus> {
    const response = await this.api.get('/auth/status');
    return response.data.data;
  }

  async saveDiscogsToken(token: string, username?: string): Promise<void> {
    await this.api.post('/auth/discogs/token', { token, username });
  }

  async testDiscogsConnection(): Promise<any> {
    const response = await this.api.get('/auth/discogs/test');
    return response.data.data;
  }

  async getLastfmAuthUrl(apiKey?: string): Promise<string> {
    const params = apiKey ? { apiKey } : {};
    const response = await this.api.get('/auth/lastfm/auth-url', {
      params,
    });
    return response.data.data.authUrl;
  }

  async handleLastfmCallback(token: string): Promise<{ username: string }> {
    const response = await this.api.post('/auth/lastfm/callback', { token });
    return response.data.data;
  }

  async testLastfmConnection(): Promise<any> {
    const response = await this.api.get('/auth/lastfm/test');
    return response.data.data;
  }

  async getLastfmSessionKey(): Promise<any> {
    const response = await this.api.get('/auth/lastfm/session-key');
    return response.data.data;
  }

  async getLastfmRecentScrobbles(limit: number = 10): Promise<any[]> {
    const response = await this.api.get('/auth/lastfm/recent-scrobbles', {
      params: { limit },
    });
    return response.data.data;
  }

  async getLastfmTopTracks(
    period: string = '7day',
    limit: number = 10
  ): Promise<any[]> {
    const response = await this.api.get('/auth/lastfm/top-tracks', {
      params: { period, limit },
    });
    return response.data.data;
  }

  async getLastfmTopArtists(
    period: string = '7day',
    limit: number = 10
  ): Promise<any[]> {
    const response = await this.api.get('/auth/lastfm/top-artists', {
      params: { period, limit },
    });
    return response.data.data;
  }

  async clearAuth(): Promise<void> {
    await this.api.post('/auth/clear');
  }

  // OAuth methods
  async getDiscogsAuthUrl(): Promise<string> {
    const response = await this.api.get('/auth/discogs/auth-url');
    return response.data.data.authUrl;
  }

  // Collection methods
  async getUserCollection(
    username: string,
    page: number = 1,
    perPage: number = 50,
    forceReload: boolean = false
  ): Promise<ApiResponse<CollectionItem[]>> {
    const response = await this.api.get(`/collection/${username}`, {
      params: { page, per_page: perPage, force_reload: forceReload },
    });
    return response.data;
  }

  async getEntireCollection(
    username: string,
    forceReload: boolean = false
  ): Promise<{
    success: boolean;
    data: CollectionItem[];
    total: number;
    timestamp: number;
  }> {
    const response = await this.api.get(`/collection/${username}/all`, {
      params: { force_reload: forceReload },
    });
    return response.data;
  }

  async searchCollection(
    username: string,
    query: string
  ): Promise<CollectionItem[]> {
    const response = await this.api.get(`/collection/${username}/search`, {
      params: { q: query },
    });
    return response.data.data;
  }

  async searchCollectionPaginated(
    username: string,
    query: string,
    page: number = 1,
    perPage: number = 50
  ): Promise<{
    items: CollectionItem[];
    total: number;
    totalPages: number;
    page: number;
    perPage: number;
  }> {
    const response = await this.api.get(
      `/collection/${username}/search-paginated`,
      {
        params: { q: query, page, per_page: perPage },
      }
    );
    return {
      items: response.data.data,
      total: response.data.pagination.total,
      totalPages: response.data.pagination.pages,
      page: response.data.pagination.page,
      perPage: response.data.pagination.per_page,
    };
  }

  async preloadCollection(username: string): Promise<void> {
    await this.api.post(`/collection/${username}/preload`);
  }

  async getReleaseDetails(releaseId: number): Promise<DiscogsRelease> {
    const response = await this.api.get(`/collection/release/${releaseId}`);
    return response.data.data;
  }

  async getCacheProgress(username: string): Promise<any> {
    const response = await this.api.get(`/collection/${username}/progress`);
    return response.data.data;
  }

  async clearCollectionCache(): Promise<void> {
    await this.api.delete('/collection/cache');
  }

  async checkForNewItems(username: string): Promise<{
    success: boolean;
    data?: {
      newItemsCount: number;
      latestCacheDate?: string;
      latestDiscogsDate?: string;
    };
    error?: string;
  }> {
    const response = await this.api.get(`/collection/${username}/check-new`);
    return response.data;
  }

  async updateCacheWithNewItems(username: string): Promise<{
    success: boolean;
    data?: {
      newItemsAdded: number;
    };
    error?: string;
  }> {
    const response = await this.api.post(`/collection/${username}/update-new`);
    return response.data;
  }

  // Scrobbling methods
  async scrobbleTrack(track: ScrobbleTrack): Promise<void> {
    await this.api.post('/scrobble/track', track);
  }

  async scrobbleBatch(
    tracks: ScrobbleTrack[],
    baseTimestamp?: number
  ): Promise<{
    success: number;
    failed: number;
    ignored: number;
    errors: string[];
    sessionId: string;
  }> {
    const response = await this.api.post('/scrobble/batch', {
      tracks,
      baseTimestamp,
    });
    return response.data.data.results;
  }

  async getScrobbleProgress(sessionId: string): Promise<{
    sessionId: string;
    status: string;
    progress?: {
      current: number;
      total: number;
      success: number;
      failed: number;
      ignored: number;
    };
    error?: string;
  }> {
    const response = await this.api.get(`/scrobble/progress/${sessionId}`);
    return response.data.data;
  }

  async prepareTracksFromRelease(
    release: DiscogsRelease,
    selectedTracks?: number[],
    startTime?: number
  ): Promise<{
    tracks: ScrobbleTrack[];
    release: any;
    startTime: number;
    totalDuration: number;
  }> {
    const response = await this.api.post('/scrobble/prepare-from-release', {
      release,
      selectedTracks,
      startTime,
    });
    return response.data.data;
  }

  async getScrobbleHistory(): Promise<ScrobbleSession[]> {
    const response = await this.api.get('/scrobble/history');
    return response.data.data;
  }

  async getScrobbleSession(sessionId: string): Promise<ScrobbleSession> {
    const response = await this.api.get(`/scrobble/session/${sessionId}`);
    return response.data.data;
  }

  // Update base URL (for when server URL changes)
  updateBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl;
    this.api.defaults.baseURL = `${baseUrl}/api/v1`;
  }
}

// Create a singleton instance
let apiService: ApiService;

export const getApiService = (baseUrl?: string): ApiService => {
  if (!apiService) {
    apiService = new ApiService(baseUrl);
  } else if (baseUrl && apiService['baseUrl'] !== baseUrl) {
    apiService.updateBaseUrl(baseUrl);
  }
  return apiService;
};

export default ApiService;
