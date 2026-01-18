import axios, { AxiosInstance } from 'axios';

import {
  AlbumMapping,
  ApiResponse,
  ArtistMapping,
  AuthStatus,
  CollectionItem,
  DiscogsRelease,
  EnrichedWishlistItem,
  HiddenAlbum,
  HiddenArtist,
  LocalWantItem,
  MarketplaceStats,
  MissingAlbum,
  MissingArtist,
  MonitoredSeller,
  ReleaseVersion,
  ScrobbleTrack,
  ScrobbleSession,
  SellerMatch,
  SellerMonitoringSettings,
  SellerScanStatus,
  SuggestionResult,
  SuggestionSettings,
  SyncSettings,
  SyncStatus,
  VinylWatchItem,
  WishlistSettings,
  WishlistSyncStatus,
} from '../../shared/types';

class ApiService {
  private api: AxiosInstance;
  private baseUrl: string;

  constructor(
    baseUrl: string = `http://localhost:${process.env.REACT_APP_BACKEND_PORT || '3001'}`
  ) {
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

  async deleteScrobbleSession(sessionId: string): Promise<{ message: string }> {
    const response = await this.api.delete(`/scrobble/session/${sessionId}`);
    return response.data.data;
  }

  async resubmitScrobbleSession(sessionId: string): Promise<{
    message: string;
    results: {
      success: number;
      failed: number;
      ignored: number;
      errors: string[];
    };
  }> {
    const response = await this.api.post(
      `/scrobble/session/${sessionId}/resubmit`
    );
    return response.data.data;
  }

  // Artist mapping methods
  async getArtistMappings(): Promise<{
    mappings: any[];
    stats: any;
  }> {
    const response = await this.api.get('/artist-mappings');
    return response.data.data;
  }

  async addArtistMapping(
    discogsName: string,
    lastfmName: string
  ): Promise<{
    message: string;
    discogsName: string;
    lastfmName: string;
  }> {
    const response = await this.api.post('/artist-mappings', {
      discogsName,
      lastfmName,
    });
    return response.data.data;
  }

  async updateArtistMapping(
    discogsName: string,
    lastfmName: string
  ): Promise<{
    message: string;
    discogsName: string;
    lastfmName: string;
  }> {
    const response = await this.api.put(
      `/artist-mappings/${encodeURIComponent(discogsName)}`,
      {
        lastfmName,
      }
    );
    return response.data.data;
  }

  async removeArtistMapping(discogsName: string): Promise<{
    message: string;
    discogsName: string;
  }> {
    const response = await this.api.delete(
      `/artist-mappings/${encodeURIComponent(discogsName)}`
    );
    return response.data.data;
  }

  async lookupArtistMapping(discogsName: string): Promise<{
    discogsName: string;
    lastfmName: string;
    hasMapping: boolean;
    isOriginal: boolean;
  }> {
    const response = await this.api.get(
      `/artist-mappings/lookup/${encodeURIComponent(discogsName)}`
    );
    return response.data.data;
  }

  async importArtistMappings(mappings: any[]): Promise<{
    message: string;
    imported: number;
    skipped: number;
    errors: string[];
  }> {
    const response = await this.api.post('/artist-mappings/import', {
      mappings,
    });
    return response.data.data;
  }

  async exportArtistMappings(): Promise<any> {
    const response = await this.api.get('/artist-mappings/export');
    return response.data;
  }

  async clearArtistMappings(): Promise<{
    message: string;
  }> {
    const response = await this.api.delete('/artist-mappings');
    return response.data.data;
  }

  async getArtistMappingStats(): Promise<any> {
    const response = await this.api.get('/artist-mappings/stats');
    return response.data.data;
  }

  async getArtistMappingSuggestions(username: string): Promise<{
    suggestions: Array<{
      artist: string;
      localScrobbles: number;
      suggestedMapping: string;
    }>;
    total: number;
  }> {
    const response = await this.api.get('/artist-mappings/suggestions', {
      params: { username },
    });
    return response.data.data;
  }

  async backfillAlbumCovers(username: string): Promise<{
    message: string;
    updatedSessions: number;
    updatedTracks: number;
    totalSessions: number;
  }> {
    const response = await this.api.post('/scrobble/backfill-covers', {
      username,
    });
    return response.data.data;
  }

  // ============================================
  // Suggestion methods
  // ============================================

  async getSuggestions(count: number = 5): Promise<SuggestionResult[]> {
    const response = await this.api.get('/suggestions', {
      params: { count },
    });
    return response.data.data;
  }

  async dismissSuggestion(albumId: number): Promise<void> {
    await this.api.post('/suggestions/dismiss', { albumId });
  }

  async refreshSuggestions(): Promise<void> {
    await this.api.post('/suggestions/refresh');
  }

  async getSuggestionSettings(): Promise<SuggestionSettings> {
    const response = await this.api.get('/suggestions/settings');
    return response.data.data;
  }

  async saveSuggestionSettings(settings: SuggestionSettings): Promise<void> {
    await this.api.post('/suggestions/settings', settings);
  }

  async getSuggestionDefaults(): Promise<SuggestionSettings> {
    const response = await this.api.get('/suggestions/settings/defaults');
    return response.data.data;
  }

  async getSuggestionAnalytics(): Promise<{
    hasHistory: boolean;
    totalScrobbles: number;
    uniqueAlbums: number;
    uniqueArtists: number;
    topArtists: Array<{ artist: string; playCount: number }>;
    listeningPatterns: {
      peakHour: number;
      peakDay: string;
    };
  }> {
    const response = await this.api.get('/suggestions/analytics');
    return response.data.data;
  }

  // ============================================
  // History sync methods
  // ============================================

  async getHistorySyncStatus(): Promise<{
    sync: SyncStatus;
    storage: {
      totalAlbums: number;
      totalScrobbles: number;
      oldestScrobble: Date | null;
      newestScrobble: Date | null;
      lastSync: Date | null;
      estimatedSizeBytes: number;
    };
  }> {
    const response = await this.api.get('/suggestions/history/status');
    return response.data.data;
  }

  async startHistorySync(incremental: boolean = false): Promise<{
    message: string;
    status: SyncStatus;
  }> {
    const response = await this.api.post('/suggestions/history/sync/start', {
      incremental,
    });
    return response.data.data;
  }

  async pauseHistorySync(): Promise<{
    message: string;
    status: SyncStatus;
  }> {
    const response = await this.api.post('/suggestions/history/sync/pause');
    return response.data.data;
  }

  async resumeHistorySync(): Promise<{
    message: string;
    status: SyncStatus;
  }> {
    const response = await this.api.post('/suggestions/history/sync/resume');
    return response.data.data;
  }

  async clearHistoryIndex(): Promise<void> {
    await this.api.delete('/suggestions/history/index');
  }

  async getSyncSettings(): Promise<SyncSettings> {
    const response = await this.api.get('/suggestions/history/sync/settings');
    return response.data.data;
  }

  async saveSyncSettings(
    settings: Partial<SyncSettings>
  ): Promise<SyncSettings> {
    const response = await this.api.post(
      '/suggestions/history/sync/settings',
      settings
    );
    return response.data.data;
  }

  // ============================================
  // Album history paginated (for History page)
  // ============================================

  async getAlbumHistoryPaginated(
    page: number = 1,
    perPage: number = 50,
    sortBy: 'playCount' | 'lastPlayed' | 'artist' | 'album' = 'playCount',
    sortOrder: 'asc' | 'desc' = 'desc',
    search?: string
  ): Promise<{
    items: Array<{
      artist: string;
      album: string;
      playCount: number;
      lastPlayed: number;
    }>;
    total: number;
    totalPages: number;
    page: number;
  }> {
    const params: Record<string, string | number> = {
      page,
      per_page: perPage,
      sort_by: sortBy,
      sort_order: sortOrder,
    };
    if (search) {
      params.search = search;
    }
    const response = await this.api.get('/suggestions/history/albums', {
      params,
    });
    return response.data.data;
  }

  // ============================================
  // Album history methods (for release details)
  // ============================================

  async getAlbumHistory(
    artist: string,
    album: string
  ): Promise<{
    found: boolean;
    artist: string;
    album: string;
    lastPlayed: number | null;
    playCount: number;
    plays: Array<{ timestamp: number; track?: string }>;
  }> {
    const response = await this.api.get(
      `/suggestions/album-history/${encodeURIComponent(artist)}/${encodeURIComponent(album)}`
    );
    return response.data.data;
  }

  // ============================================
  // Discovery methods (missing from collection)
  // ============================================

  async getMissingAlbums(limit: number = 20): Promise<MissingAlbum[]> {
    const response = await this.api.get(
      '/suggestions/discovery/missing-albums',
      {
        params: { limit },
      }
    );
    return response.data.data;
  }

  async getMissingArtists(limit: number = 20): Promise<MissingArtist[]> {
    const response = await this.api.get(
      '/suggestions/discovery/missing-artists',
      {
        params: { limit },
      }
    );
    return response.data.data;
  }

  // ============================================
  // Discovery Mapping methods (mark "missing" items as in collection)
  // ============================================

  async getDiscoveryAlbumMappings(): Promise<AlbumMapping[]> {
    const response = await this.api.get('/suggestions/mappings/albums');
    return response.data.data;
  }

  async createDiscoveryAlbumMapping(mapping: {
    historyArtist: string;
    historyAlbum: string;
    collectionId: number;
    collectionArtist: string;
    collectionAlbum: string;
  }): Promise<void> {
    await this.api.post('/suggestions/mappings/albums', mapping);
  }

  async removeDiscoveryAlbumMapping(
    historyArtist: string,
    historyAlbum: string
  ): Promise<void> {
    await this.api.delete('/suggestions/mappings/albums', {
      data: { historyArtist, historyAlbum },
    });
  }

  async getDiscoveryArtistMappings(): Promise<ArtistMapping[]> {
    const response = await this.api.get('/suggestions/mappings/artists');
    return response.data.data;
  }

  async createDiscoveryArtistMapping(mapping: {
    historyArtist: string;
    collectionArtist: string;
  }): Promise<void> {
    await this.api.post('/suggestions/mappings/artists', mapping);
  }

  async removeDiscoveryArtistMapping(historyArtist: string): Promise<void> {
    await this.api.delete('/suggestions/mappings/artists', {
      data: { historyArtist },
    });
  }

  // ============================================
  // AI Suggestion methods (Ollama)
  // ============================================

  async getAIStatus(): Promise<{
    enabled: boolean;
    connected: boolean;
    error?: string;
    model: string;
    baseUrl: string;
  }> {
    const response = await this.api.get('/suggestions/ai/status');
    return response.data.data;
  }

  async getAIModels(): Promise<
    Array<{
      name: string;
      size: number;
      sizeFormatted: string;
      modifiedAt: string;
    }>
  > {
    const response = await this.api.get('/suggestions/ai/models');
    return response.data.data;
  }

  async getAISettings(): Promise<{
    enabled: boolean;
    baseUrl: string;
    model: string;
    timeout: number;
  }> {
    const response = await this.api.get('/suggestions/ai/settings');
    return response.data.data;
  }

  async saveAISettings(settings: {
    enabled?: boolean;
    baseUrl?: string;
    model?: string;
    timeout?: number;
  }): Promise<{
    enabled: boolean;
    baseUrl: string;
    model: string;
    timeout: number;
  }> {
    const response = await this.api.post('/suggestions/ai/settings', settings);
    return response.data.data;
  }

  async testAIConnection(
    baseUrl?: string,
    model?: string
  ): Promise<{
    connected: boolean;
    error?: string;
    modelAvailable?: boolean;
    availableModels?: string[];
  }> {
    const response = await this.api.post('/suggestions/ai/test', {
      baseUrl,
      model,
    });
    return response.data.data;
  }

  async getAISuggestion(mood?: string): Promise<{
    suggestions: Array<{
      album: any; // CollectionItem
      reasoning: string;
      confidence: 'high' | 'medium' | 'low';
    }>;
    rawResponse: string;
    context: {
      timeOfDay: string;
      dayOfWeek: string;
      collectionSize: number;
    };
  }> {
    // AI requests can take longer, especially first call when model loads
    const response = await this.api.get('/suggestions/ai/suggestion', {
      params: mood ? { mood } : undefined,
      timeout: 90000, // 90 seconds for AI requests
    });
    return response.data.data;
  }

  // ============================================
  // Hidden Discovery Items methods
  // ============================================

  async getHiddenAlbums(): Promise<HiddenAlbum[]> {
    const response = await this.api.get('/suggestions/hidden/albums');
    return response.data.albums;
  }

  async hideAlbum(artist: string, album: string): Promise<void> {
    await this.api.post('/suggestions/hidden/albums', { artist, album });
  }

  async unhideAlbum(artist: string, album: string): Promise<boolean> {
    const response = await this.api.delete('/suggestions/hidden/albums', {
      data: { artist, album },
    });
    return response.data.removed;
  }

  async getHiddenArtists(): Promise<HiddenArtist[]> {
    const response = await this.api.get('/suggestions/hidden/artists');
    return response.data.artists;
  }

  async hideArtist(artist: string): Promise<void> {
    await this.api.post('/suggestions/hidden/artists', { artist });
  }

  async unhideArtist(artist: string): Promise<boolean> {
    const response = await this.api.delete('/suggestions/hidden/artists', {
      data: { artist },
    });
    return response.data.removed;
  }

  async getHiddenCounts(): Promise<{ albums: number; artists: number }> {
    const response = await this.api.get('/suggestions/hidden/counts');
    return { albums: response.data.albums, artists: response.data.artists };
  }

  // ============================================
  // Wishlist methods
  // ============================================

  async getWishlist(): Promise<EnrichedWishlistItem[]> {
    const response = await this.api.get('/wishlist');
    return response.data.data;
  }

  async getWishlistSyncStatus(): Promise<WishlistSyncStatus> {
    const response = await this.api.get('/wishlist/sync');
    return response.data.data;
  }

  async startWishlistSync(forceRefresh = false): Promise<{
    message: string;
    status: WishlistSyncStatus;
  }> {
    const response = await this.api.post('/wishlist/sync', { forceRefresh });
    return {
      message: response.data.message,
      status: response.data.data,
    };
  }

  async getMasterVersions(masterId: number): Promise<{
    versions: ReleaseVersion[];
    vinylCount: number;
  }> {
    const response = await this.api.get(`/wishlist/${masterId}/versions`);
    return {
      versions: response.data.data,
      vinylCount: response.data.vinylCount,
    };
  }

  async getMarketplaceStats(
    releaseId: number
  ): Promise<MarketplaceStats | null> {
    try {
      const response = await this.api.get(`/wishlist/${releaseId}/marketplace`);
      return response.data.data;
    } catch {
      return null;
    }
  }

  async getWishlistSettings(): Promise<WishlistSettings> {
    const response = await this.api.get('/wishlist/settings');
    return response.data.data;
  }

  async saveWishlistSettings(
    settings: Partial<WishlistSettings>
  ): Promise<WishlistSettings> {
    const response = await this.api.post('/wishlist/settings', settings);
    return response.data.data;
  }

  async getVinylWatchList(): Promise<VinylWatchItem[]> {
    const response = await this.api.get('/wishlist/watch');
    return response.data.data;
  }

  async addToVinylWatch(item: {
    masterId: number;
    artist: string;
    title: string;
    coverImage?: string;
  }): Promise<void> {
    await this.api.post('/wishlist/watch', item);
  }

  async removeFromVinylWatch(masterId: number): Promise<void> {
    await this.api.delete(`/wishlist/watch/${masterId}`);
  }

  async checkVinylWatch(): Promise<VinylWatchItem[]> {
    const response = await this.api.post('/wishlist/watch/check');
    return response.data.data;
  }

  // Search Discogs for releases to add to wantlist
  async searchDiscogsForWishlist(
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
    const response = await this.api.get('/wishlist/search', {
      params: { artist, album },
    });
    return response.data.data;
  }

  // Add a release to the user's Discogs wantlist
  async addToDiscogsWantlist(
    releaseId: number,
    notes?: string,
    rating?: number
  ): Promise<void> {
    await this.api.post('/wishlist/add', { releaseId, notes, rating });
  }

  // Remove a release from the user's Discogs wantlist
  async removeFromDiscogsWantlist(releaseId: number): Promise<void> {
    await this.api.delete(`/wishlist/remove/${releaseId}`);
  }

  // Local want list (albums from Discovery)
  async getLocalWantList(): Promise<LocalWantItem[]> {
    const response = await this.api.get('/wishlist/local');
    return response.data.data;
  }

  async addToLocalWantList(item: {
    artist: string;
    album: string;
    playCount: number;
    lastPlayed: number;
  }): Promise<LocalWantItem> {
    const response = await this.api.post('/wishlist/local', item);
    return response.data.data;
  }

  async removeFromLocalWantList(id: string): Promise<void> {
    await this.api.delete(`/wishlist/local/${id}`);
  }

  async checkLocalWantListForVinyl(): Promise<LocalWantItem[]> {
    const response = await this.api.post('/wishlist/local/check');
    return response.data.data;
  }

  // ============================================
  // Seller Monitoring methods
  // ============================================

  async getSellers(): Promise<MonitoredSeller[]> {
    const response = await this.api.get('/sellers');
    return response.data.data;
  }

  async addSeller(
    username: string,
    displayName?: string
  ): Promise<MonitoredSeller> {
    const response = await this.api.post('/sellers', { username, displayName });
    return response.data.data;
  }

  async removeSeller(username: string): Promise<void> {
    await this.api.delete(`/sellers/${encodeURIComponent(username)}`);
  }

  async getSellerMatches(username?: string): Promise<SellerMatch[]> {
    const url = username
      ? `/sellers/${encodeURIComponent(username)}/matches`
      : '/sellers/matches';
    const response = await this.api.get(url);
    return response.data.data;
  }

  async triggerSellerScan(forceFresh = false): Promise<SellerScanStatus> {
    const response = await this.api.post('/sellers/scan', { forceFresh });
    return response.data.data;
  }

  async getSellerScanStatus(): Promise<SellerScanStatus> {
    const response = await this.api.get('/sellers/scan/status');
    return response.data.data;
  }

  async markMatchAsSeen(matchId: string): Promise<void> {
    await this.api.post(`/sellers/matches/${matchId}/seen`);
  }

  async markMatchAsNotified(matchId: string): Promise<void> {
    await this.api.post(`/sellers/matches/${matchId}/notified`);
  }

  async getSellerSettings(): Promise<SellerMonitoringSettings> {
    const response = await this.api.get('/sellers/settings');
    return response.data.data;
  }

  async saveSellerSettings(
    settings: Partial<SellerMonitoringSettings>
  ): Promise<SellerMonitoringSettings> {
    const response = await this.api.post('/sellers/settings', settings);
    return response.data.data;
  }

  async getReleaseCacheStats(): Promise<{
    totalReleases: number;
    totalMasters: number;
    lastUpdated: number;
    staleMasters: number;
  }> {
    const response = await this.api.get('/sellers/cache/stats');
    return response.data.data;
  }

  async refreshReleaseCache(): Promise<{
    mastersProcessed: number;
    releasesAdded: number;
    staleRefreshed: number;
  }> {
    // This can take a long time - increase timeout
    const response = await this.api.post(
      '/sellers/cache/refresh',
      {},
      {
        timeout: 600000, // 10 minutes
      }
    );
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
