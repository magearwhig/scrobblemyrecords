import MockAdapter from 'axios-mock-adapter';

import ApiService from '../../../src/renderer/services/api';

// Sentinel payload returned as `data` in the standard envelope
const DATA = { marker: 'payload' };
// Sentinel meaning "only assert the call resolves, not its value"
const RESOLVES = Symbol('resolves');

type Verb = 'get' | 'post' | 'put' | 'delete' | 'patch';

interface EndpointSpec {
  name: string;
  verb: Verb;
  url: string | RegExp;
  call: (api: ApiService) => Promise<unknown>;
  /** Response body; defaults to the standard { success, data: DATA } envelope */
  reply?: unknown;
  status?: number;
  /** Expected resolved value, or RESOLVES to skip the value assertion */
  expected: unknown;
}

const envelope = { success: true, data: DATA };

const specs: EndpointSpec[] = [
  // Scrobble sessions
  {
    name: 'getScrobbleSession',
    verb: 'get',
    url: '/scrobble/session/s1',
    call: api => api.getScrobbleSession('s1'),
    expected: DATA,
  },
  {
    name: 'deleteScrobbleSession',
    verb: 'delete',
    url: '/scrobble/session/s1',
    call: api => api.deleteScrobbleSession('s1'),
    expected: DATA,
  },
  {
    name: 'resubmitScrobbleSession',
    verb: 'post',
    url: '/scrobble/session/s1/resubmit',
    call: api => api.resubmitScrobbleSession('s1'),
    expected: DATA,
  },
  {
    name: 'resubmitSessionTrack',
    verb: 'post',
    url: '/scrobble/session/s1/resubmit-track/2',
    call: api => api.resubmitSessionTrack('s1', 2),
    expected: DATA,
  },
  {
    name: 'backfillAlbumCovers',
    verb: 'post',
    url: '/scrobble/backfill-covers',
    call: api => api.backfillAlbumCovers('user'),
    expected: DATA,
  },

  // Artist mappings
  {
    name: 'getArtistMappings',
    verb: 'get',
    url: '/artist-mappings',
    call: api => api.getArtistMappings(),
    expected: DATA,
  },
  {
    name: 'addArtistMapping',
    verb: 'post',
    url: '/artist-mappings',
    call: api => api.addArtistMapping('Discogs Name', 'Lastfm Name'),
    expected: DATA,
  },
  {
    name: 'updateArtistMapping',
    verb: 'put',
    url: '/artist-mappings/Some%20Artist',
    call: api => api.updateArtistMapping('Some Artist', 'Mapped'),
    expected: DATA,
  },
  {
    name: 'removeArtistMapping',
    verb: 'delete',
    url: '/artist-mappings/Some%20Artist',
    call: api => api.removeArtistMapping('Some Artist'),
    expected: DATA,
  },
  {
    name: 'lookupArtistMapping',
    verb: 'get',
    url: '/artist-mappings/lookup/Some%20Artist',
    call: api => api.lookupArtistMapping('Some Artist'),
    expected: DATA,
  },
  {
    name: 'importArtistMappings',
    verb: 'post',
    url: '/artist-mappings/import',
    call: api => api.importArtistMappings([]),
    expected: DATA,
  },
  {
    name: 'exportArtistMappings',
    verb: 'get',
    url: '/artist-mappings/export',
    reply: { mappings: [], version: '1.0', lastUpdated: 123 },
    call: api => api.exportArtistMappings(),
    expected: { mappings: [], version: '1.0', lastUpdated: 123 },
  },
  {
    name: 'clearArtistMappings',
    verb: 'delete',
    url: '/artist-mappings',
    call: api => api.clearArtistMappings(),
    expected: DATA,
  },
  {
    name: 'getArtistMappingStats',
    verb: 'get',
    url: '/artist-mappings/stats',
    call: api => api.getArtistMappingStats(),
    expected: DATA,
  },
  {
    name: 'getArtistMappingSuggestions',
    verb: 'get',
    url: '/artist-mappings/suggestions',
    call: api => api.getArtistMappingSuggestions('user'),
    expected: DATA,
  },

  // Compound artist mappings
  {
    name: 'getCompoundArtistMappings',
    verb: 'get',
    url: '/compound-artist-mappings',
    call: api => api.getCompoundArtistMappings(),
    expected: DATA,
  },
  {
    name: 'addCompoundArtistMapping',
    verb: 'post',
    url: '/compound-artist-mappings',
    call: api => api.addCompoundArtistMapping('A & B', ['A', 'B']),
    expected: DATA,
  },
  {
    name: 'deleteCompoundArtistMapping',
    verb: 'delete',
    url: '/compound-artist-mappings/A%20%26%20B',
    call: api => api.deleteCompoundArtistMapping('A & B'),
    expected: DATA,
  },
  {
    name: 'autoDetectCompoundArtists',
    verb: 'post',
    url: '/compound-artist-mappings/auto-detect',
    call: api => api.autoDetectCompoundArtists(),
    expected: DATA,
  },

  // Suggestions
  {
    name: 'getSuggestions',
    verb: 'get',
    url: '/suggestions',
    call: api => api.getSuggestions(3),
    expected: DATA,
  },
  {
    name: 'dismissSuggestion',
    verb: 'post',
    url: '/suggestions/dismiss',
    call: api => api.dismissSuggestion(42),
    expected: undefined,
  },
  {
    name: 'refreshSuggestions',
    verb: 'post',
    url: '/suggestions/refresh',
    call: api => api.refreshSuggestions(),
    expected: undefined,
  },
  {
    name: 'getSuggestionSettings',
    verb: 'get',
    url: '/suggestions/settings',
    call: api => api.getSuggestionSettings(),
    expected: DATA,
  },
  {
    name: 'saveSuggestionSettings',
    verb: 'post',
    url: '/suggestions/settings',
    call: api => api.saveSuggestionSettings({} as any),
    expected: undefined,
  },
  {
    name: 'getSuggestionDefaults',
    verb: 'get',
    url: '/suggestions/settings/defaults',
    call: api => api.getSuggestionDefaults(),
    expected: DATA,
  },
  {
    name: 'getSuggestionAnalytics',
    verb: 'get',
    url: '/suggestions/analytics',
    call: api => api.getSuggestionAnalytics(),
    expected: DATA,
  },

  // History sync
  {
    name: 'getHistorySyncStatus',
    verb: 'get',
    url: '/suggestions/history/status',
    call: api => api.getHistorySyncStatus(),
    expected: DATA,
  },
  {
    name: 'startHistorySync',
    verb: 'post',
    url: '/suggestions/history/sync/start',
    call: api => api.startHistorySync(true),
    expected: DATA,
  },
  {
    name: 'pauseHistorySync',
    verb: 'post',
    url: '/suggestions/history/sync/pause',
    call: api => api.pauseHistorySync(),
    expected: DATA,
  },
  {
    name: 'resumeHistorySync',
    verb: 'post',
    url: '/suggestions/history/sync/resume',
    call: api => api.resumeHistorySync(),
    expected: DATA,
  },
  {
    name: 'clearHistoryIndex',
    verb: 'delete',
    url: '/suggestions/history/index',
    call: api => api.clearHistoryIndex(),
    expected: undefined,
  },
  {
    name: 'getSyncSettings',
    verb: 'get',
    url: '/suggestions/history/sync/settings',
    call: api => api.getSyncSettings(),
    expected: DATA,
  },
  {
    name: 'saveSyncSettings',
    verb: 'post',
    url: '/suggestions/history/sync/settings',
    call: api => api.saveSyncSettings({}),
    expected: DATA,
  },

  // Paginated history
  {
    name: 'getAlbumHistoryPaginated',
    verb: 'get',
    url: '/suggestions/history/albums',
    call: api => api.getAlbumHistoryPaginated(2, 25, 'artist', 'asc', 'query'),
    expected: DATA,
  },
  {
    name: 'getTrackHistoryPaginated',
    verb: 'get',
    url: '/suggestions/history/tracks',
    call: api => api.getTrackHistoryPaginated(),
    expected: DATA,
  },
  {
    name: 'getArtistHistoryPaginated',
    verb: 'get',
    url: '/suggestions/history/artists',
    call: api => api.getArtistHistoryPaginated(1, 10, 'albumCount', 'desc'),
    expected: DATA,
  },
  {
    name: 'getAlbumHistory',
    verb: 'get',
    url: '/suggestions/album-history/The%20Artist/The%20Album',
    call: api => api.getAlbumHistory('The Artist', 'The Album'),
    expected: DATA,
  },

  // Discovery
  {
    name: 'getMissingAlbums',
    verb: 'get',
    url: '/suggestions/discovery/missing-albums',
    call: api => api.getMissingAlbums(5),
    expected: DATA,
  },
  {
    name: 'getMissingArtists',
    verb: 'get',
    url: '/suggestions/discovery/missing-artists',
    call: api => api.getMissingArtists(5),
    expected: DATA,
  },
  {
    name: 'getForgottenFavorites',
    verb: 'get',
    url: '/stats/forgotten-favorites',
    reply: { success: true, data: ['track'], meta: { returned: 1 } },
    call: api => api.getForgottenFavorites(30, 5, 10),
    expected: { tracks: ['track'], meta: { returned: 1 } },
  },
  {
    name: 'getDashboard',
    verb: 'get',
    url: '/stats/dashboard',
    call: api => api.getDashboard(),
    expected: DATA,
  },
  {
    name: 'getWrapped',
    verb: 'get',
    url: '/wrapped',
    call: api => api.getWrapped(0, 1000),
    expected: DATA,
  },

  // Discovery mappings
  {
    name: 'getDiscoveryAlbumMappings',
    verb: 'get',
    url: '/suggestions/mappings/albums',
    call: api => api.getDiscoveryAlbumMappings(),
    expected: DATA,
  },
  {
    name: 'createDiscoveryAlbumMapping',
    verb: 'post',
    url: '/suggestions/mappings/albums',
    call: api =>
      api.createDiscoveryAlbumMapping({
        historyArtist: 'a',
        historyAlbum: 'b',
        collectionId: 1,
        collectionArtist: 'c',
        collectionAlbum: 'd',
      }),
    expected: undefined,
  },
  {
    name: 'createAlbumMapping',
    verb: 'post',
    url: '/suggestions/mappings/albums',
    call: api =>
      api.createAlbumMapping({
        historyArtist: 'a',
        historyAlbum: 'b',
        collectionArtist: 'c',
        collectionAlbum: 'd',
      }),
    expected: undefined,
  },
  {
    name: 'removeDiscoveryAlbumMapping',
    verb: 'delete',
    url: '/suggestions/mappings/albums',
    call: api => api.removeDiscoveryAlbumMapping('a', 'b'),
    expected: undefined,
  },
  {
    name: 'getDiscoveryArtistMappings',
    verb: 'get',
    url: '/suggestions/mappings/artists',
    call: api => api.getDiscoveryArtistMappings(),
    expected: DATA,
  },
  {
    name: 'createDiscoveryArtistMapping',
    verb: 'post',
    url: '/suggestions/mappings/artists',
    call: api =>
      api.createDiscoveryArtistMapping({
        historyArtist: 'a',
        collectionArtist: 'b',
      }),
    expected: undefined,
  },
  {
    name: 'removeDiscoveryArtistMapping',
    verb: 'delete',
    url: '/suggestions/mappings/artists',
    call: api => api.removeDiscoveryArtistMapping('a'),
    expected: undefined,
  },
  {
    name: 'getTrackMappings',
    verb: 'get',
    url: '/suggestions/mappings/tracks',
    call: api => api.getTrackMappings(),
    expected: DATA,
  },
  {
    name: 'createTrackMapping',
    verb: 'post',
    url: '/suggestions/mappings/tracks',
    call: api =>
      api.createTrackMapping({
        historyArtist: 'a',
        historyAlbum: 'b',
        historyTrack: 'c',
        cacheArtist: 'd',
        cacheAlbum: 'e',
        cacheTrack: 'f',
      }),
    expected: undefined,
  },
  {
    name: 'removeTrackMapping',
    verb: 'delete',
    url: '/suggestions/mappings/tracks',
    call: api => api.removeTrackMapping('a', 'b', 'c'),
    expected: undefined,
  },
  {
    name: 'getTrackMappingCount',
    verb: 'get',
    url: '/suggestions/mappings/tracks/count',
    reply: { count: 7 },
    call: api => api.getTrackMappingCount(),
    expected: 7,
  },

  // AI suggestions
  {
    name: 'getAIStatus',
    verb: 'get',
    url: '/suggestions/ai/status',
    call: api => api.getAIStatus(),
    expected: DATA,
  },
  {
    name: 'getAIModels',
    verb: 'get',
    url: '/suggestions/ai/models',
    call: api => api.getAIModels(),
    expected: DATA,
  },
  {
    name: 'getAISettings',
    verb: 'get',
    url: '/suggestions/ai/settings',
    call: api => api.getAISettings(),
    expected: DATA,
  },
  {
    name: 'saveAISettings',
    verb: 'post',
    url: '/suggestions/ai/settings',
    call: api => api.saveAISettings({ enabled: true }),
    expected: DATA,
  },
  {
    name: 'testAIConnection',
    verb: 'post',
    url: '/suggestions/ai/test',
    call: api => api.testAIConnection('http://ollama', 'model'),
    expected: DATA,
  },
  {
    name: 'getAISuggestion',
    verb: 'get',
    url: '/suggestions/ai/suggestion',
    call: api => api.getAISuggestion('mellow'),
    expected: DATA,
  },

  // Hidden items
  {
    name: 'getHiddenAlbums',
    verb: 'get',
    url: '/suggestions/hidden/albums',
    reply: { albums: ['a1'] },
    call: api => api.getHiddenAlbums(),
    expected: ['a1'],
  },
  {
    name: 'hideAlbum',
    verb: 'post',
    url: '/suggestions/hidden/albums',
    call: api => api.hideAlbum('artist', 'album'),
    expected: undefined,
  },
  {
    name: 'unhideAlbum',
    verb: 'delete',
    url: '/suggestions/hidden/albums',
    reply: { removed: true },
    call: api => api.unhideAlbum('artist', 'album'),
    expected: true,
  },
  {
    name: 'getHiddenArtists',
    verb: 'get',
    url: '/suggestions/hidden/artists',
    reply: { artists: ['x'] },
    call: api => api.getHiddenArtists(),
    expected: ['x'],
  },
  {
    name: 'hideArtist',
    verb: 'post',
    url: '/suggestions/hidden/artists',
    call: api => api.hideArtist('artist'),
    expected: undefined,
  },
  {
    name: 'unhideArtist',
    verb: 'delete',
    url: '/suggestions/hidden/artists',
    reply: { removed: false },
    call: api => api.unhideArtist('artist'),
    expected: false,
  },
  {
    name: 'getHiddenCounts',
    verb: 'get',
    url: '/suggestions/hidden/counts',
    reply: { albums: 2, artists: 3 },
    call: api => api.getHiddenCounts(),
    expected: { albums: 2, artists: 3 },
  },

  // Wishlist
  {
    name: 'getWishlist',
    verb: 'get',
    url: '/wishlist',
    call: api => api.getWishlist(),
    expected: DATA,
  },
  {
    name: 'getWishlistSyncStatus',
    verb: 'get',
    url: '/wishlist/sync',
    call: api => api.getWishlistSyncStatus(),
    expected: DATA,
  },
  {
    name: 'startWishlistSync',
    verb: 'post',
    url: '/wishlist/sync',
    reply: { message: 'started', data: DATA },
    call: api => api.startWishlistSync(true),
    expected: { message: 'started', status: DATA },
  },
  {
    name: 'getMasterVersions',
    verb: 'get',
    url: '/wishlist/5/versions',
    reply: { data: ['v1'], vinylCount: 2 },
    call: api => api.getMasterVersions(5),
    expected: { versions: ['v1'], vinylCount: 2 },
  },
  {
    name: 'getMarketplaceStats',
    verb: 'get',
    url: '/wishlist/5/marketplace',
    call: api => api.getMarketplaceStats(5),
    expected: DATA,
  },
  {
    name: 'getMarketplaceStats returns null on error',
    verb: 'get',
    url: '/wishlist/5/marketplace',
    status: 500,
    reply: { success: false },
    call: api => api.getMarketplaceStats(5),
    expected: null,
  },
  {
    name: 'getWishlistSettings',
    verb: 'get',
    url: '/wishlist/settings',
    call: api => api.getWishlistSettings(),
    expected: DATA,
  },
  {
    name: 'saveWishlistSettings',
    verb: 'post',
    url: '/wishlist/settings',
    call: api => api.saveWishlistSettings({}),
    expected: DATA,
  },
  {
    name: 'searchDiscogsForWishlist',
    verb: 'get',
    url: '/wishlist/search',
    call: api => api.searchDiscogsForWishlist('artist', 'album'),
    expected: DATA,
  },
  {
    name: 'addToDiscogsWantlist',
    verb: 'post',
    url: '/wishlist/add',
    call: api => api.addToDiscogsWantlist(5, 'notes', 4),
    expected: undefined,
  },
  {
    name: 'removeFromDiscogsWantlist',
    verb: 'delete',
    url: '/wishlist/remove/5',
    call: api => api.removeFromDiscogsWantlist(5),
    expected: undefined,
  },
  {
    name: 'getLocalWantList',
    verb: 'get',
    url: '/wishlist/local',
    call: api => api.getLocalWantList(),
    expected: DATA,
  },
  {
    name: 'addToLocalWantList',
    verb: 'post',
    url: '/wishlist/local',
    call: api =>
      api.addToLocalWantList({
        artist: 'a',
        album: 'b',
        playCount: 1,
        lastPlayed: 2,
      }),
    expected: DATA,
  },
  {
    name: 'removeFromLocalWantList',
    verb: 'delete',
    url: '/wishlist/local/id1',
    call: api => api.removeFromLocalWantList('id1'),
    expected: undefined,
  },
  {
    name: 'checkLocalWantListForVinyl',
    verb: 'post',
    url: '/wishlist/local/check',
    call: api => api.checkLocalWantListForVinyl(),
    expected: DATA,
  },

  // New release tracking
  {
    name: 'getWishlistNewReleases',
    verb: 'get',
    url: /\/wishlist\/new-releases\?/,
    call: api =>
      api.getWishlistNewReleases({
        source: 'wishlist',
        days: 7,
        showDismissed: true,
      }),
    expected: DATA,
  },
  {
    name: 'getNewReleaseSyncStatus',
    verb: 'get',
    url: '/wishlist/new-releases/status',
    call: api => api.getNewReleaseSyncStatus(),
    expected: DATA,
  },
  {
    name: 'checkForNewReleases',
    verb: 'post',
    url: '/wishlist/new-releases/check',
    call: api => api.checkForNewReleases(),
    expected: undefined,
  },
  {
    name: 'dismissNewRelease',
    verb: 'patch',
    url: '/wishlist/new-releases/id1/dismiss',
    call: api => api.dismissNewRelease('id1'),
    expected: undefined,
  },
  {
    name: 'dismissNewReleasesBulk',
    verb: 'post',
    url: '/wishlist/new-releases/dismiss-bulk',
    reply: { data: { dismissed: 3 } },
    call: api => api.dismissNewReleasesBulk(['a', 'b', 'c']),
    expected: 3,
  },
  {
    name: 'dismissAllNewReleases',
    verb: 'post',
    url: '/wishlist/new-releases/dismiss-all',
    reply: { data: { dismissed: 5 } },
    call: api => api.dismissAllNewReleases(),
    expected: 5,
  },
  {
    name: 'cleanupDismissedReleases',
    verb: 'post',
    url: '/wishlist/new-releases/cleanup',
    reply: { data: { removed: 2 } },
    call: api => api.cleanupDismissedReleases(30),
    expected: 2,
  },

  // Seller monitoring
  {
    name: 'getSellers',
    verb: 'get',
    url: '/sellers',
    call: api => api.getSellers(),
    expected: DATA,
  },
  {
    name: 'addSeller',
    verb: 'post',
    url: '/sellers',
    call: api => api.addSeller('shop', 'The Shop'),
    expected: DATA,
  },
  {
    name: 'removeSeller',
    verb: 'delete',
    url: '/sellers/shop',
    call: api => api.removeSeller('shop'),
    expected: undefined,
  },
  {
    name: 'getSellerMatches (all)',
    verb: 'get',
    url: '/sellers/matches',
    call: api => api.getSellerMatches(),
    expected: DATA,
  },
  {
    name: 'getSellerMatches (single seller)',
    verb: 'get',
    url: '/sellers/shop/matches',
    call: api => api.getSellerMatches('shop'),
    expected: DATA,
  },
  {
    name: 'triggerSellerScan',
    verb: 'post',
    url: '/sellers/scan',
    call: api => api.triggerSellerScan(true),
    expected: DATA,
  },
  {
    name: 'triggerSingleSellerScan',
    verb: 'post',
    url: '/sellers/shop/scan',
    call: api => api.triggerSingleSellerScan('shop'),
    expected: DATA,
  },
  {
    name: 'getSellerScanStatus',
    verb: 'get',
    url: '/sellers/scan/status',
    call: api => api.getSellerScanStatus(),
    expected: DATA,
  },
  {
    name: 'cancelSellerScan',
    verb: 'post',
    url: '/sellers/scan/cancel',
    call: api => api.cancelSellerScan(),
    expected: DATA,
  },
  {
    name: 'getRateLimitState',
    verb: 'get',
    url: '/sellers/scan/ratelimit',
    call: api => api.getRateLimitState(),
    expected: DATA,
  },
  {
    name: 'markMatchAsSeen',
    verb: 'post',
    url: '/sellers/matches/m1/seen',
    call: api => api.markMatchAsSeen('m1'),
    expected: undefined,
  },
  {
    name: 'markMatchAsNotified',
    verb: 'post',
    url: '/sellers/matches/m1/notified',
    call: api => api.markMatchAsNotified('m1'),
    expected: undefined,
  },
  {
    name: 'verifyMatch',
    verb: 'post',
    url: '/sellers/matches/m1/verify',
    call: api => api.verifyMatch('m1'),
    expected: DATA,
  },
  {
    name: 'getSellerMatchesWithCacheInfo',
    verb: 'get',
    url: /\/sellers\/matches\?includeCacheInfo=true/,
    reply: { data: ['m'], cacheInfo: { cached: true } },
    call: api => api.getSellerMatchesWithCacheInfo(),
    expected: { matches: ['m'], cacheInfo: { cached: true } },
  },
  {
    name: 'getSellerSettings',
    verb: 'get',
    url: '/sellers/settings',
    call: api => api.getSellerSettings(),
    expected: DATA,
  },
  {
    name: 'saveSellerSettings',
    verb: 'post',
    url: '/sellers/settings',
    call: api => api.saveSellerSettings({}),
    expected: DATA,
  },
  {
    name: 'getReleaseCacheStats',
    verb: 'get',
    url: '/sellers/cache/stats',
    call: api => api.getReleaseCacheStats(),
    expected: DATA,
  },
  {
    name: 'refreshReleaseCache',
    verb: 'post',
    url: '/sellers/cache/refresh',
    call: api => api.refreshReleaseCache(),
    expected: DATA,
  },

  // Label monitoring
  {
    name: 'getLabels',
    verb: 'get',
    url: '/labels',
    call: api => api.getLabels(),
    expected: DATA,
  },
  {
    name: 'addLabel',
    verb: 'post',
    url: '/labels',
    call: api => api.addLabel(99, 'Label', 6),
    expected: DATA,
  },
  {
    name: 'removeLabel',
    verb: 'delete',
    url: '/labels/l1',
    call: api => api.removeLabel('l1'),
    expected: undefined,
  },
  {
    name: 'searchDiscogsLabels',
    verb: 'get',
    url: '/labels/search',
    call: api => api.searchDiscogsLabels('warp'),
    expected: DATA,
  },
  {
    name: 'getWishlistLabelOptions',
    verb: 'get',
    url: '/labels/wishlist-label-options',
    call: api => api.getWishlistLabelOptions(),
    expected: DATA,
  },
  {
    name: 'getWishlistArtistOptions',
    verb: 'get',
    url: '/labels/wishlist-artist-options',
    call: api => api.getWishlistArtistOptions(),
    expected: DATA,
  },
  {
    name: 'getArtistWebsiteUrls',
    verb: 'get',
    url: '/labels/artist-urls',
    call: api => api.getArtistWebsiteUrls('artist'),
    expected: DATA,
  },
  {
    name: 'getWebsiteSuggestions',
    verb: 'get',
    url: '/labels/website-suggestions',
    call: api => api.getWebsiteSuggestions(['http://x.com']),
    expected: DATA,
  },
  {
    name: 'scanLabels',
    verb: 'post',
    url: '/labels/scan',
    call: api => api.scanLabels(),
    expected: DATA,
  },
  {
    name: 'scanSingleLabel',
    verb: 'post',
    url: '/labels/l1/scan',
    call: api => api.scanSingleLabel('l1'),
    expected: DATA,
  },
  {
    name: 'cancelLabelScan',
    verb: 'post',
    url: '/labels/scan/cancel',
    call: api => api.cancelLabelScan(),
    expected: DATA,
  },
  {
    name: 'getLabelScanStatus',
    verb: 'get',
    url: '/labels/scan/status',
    call: api => api.getLabelScanStatus(),
    expected: DATA,
  },
  {
    name: 'getLabelReleases',
    verb: 'get',
    url: '/labels/releases',
    call: api => api.getLabelReleases('l1'),
    expected: DATA,
  },
  {
    name: 'bulkMarkLabelReleasesSeen',
    verb: 'post',
    url: '/labels/releases/bulk-seen',
    call: api => api.bulkMarkLabelReleasesSeen(['r1']),
    expected: DATA,
  },
  {
    name: 'bulkDismissLabelReleases',
    verb: 'post',
    url: '/labels/releases/bulk-dismiss',
    call: api => api.bulkDismissLabelReleases(['r1']),
    expected: DATA,
  },
  {
    name: 'markLabelReleaseSeen',
    verb: 'post',
    url: '/labels/releases/r1/seen',
    call: api => api.markLabelReleaseSeen('r1'),
    expected: undefined,
  },
  {
    name: 'dismissLabelRelease',
    verb: 'post',
    url: '/labels/releases/r1/dismiss',
    call: api => api.dismissLabelRelease('r1'),
    expected: undefined,
  },
  {
    name: 'getLabelSettings',
    verb: 'get',
    url: '/labels/settings',
    call: api => api.getLabelSettings(),
    expected: DATA,
  },
  {
    name: 'updateLabelSettings',
    verb: 'post',
    url: '/labels/settings',
    call: api => api.updateLabelSettings({}),
    expected: DATA,
  },

  // Website monitoring
  {
    name: 'getWebsites',
    verb: 'get',
    url: '/websites',
    call: api => api.getWebsites(),
    expected: DATA,
  },
  {
    name: 'addWebsite',
    verb: 'post',
    url: '/websites',
    call: api => api.addWebsite({ name: 'Site', url: 'http://s.com' }),
    expected: DATA,
  },
  {
    name: 'updateWebsite',
    verb: 'patch',
    url: '/websites/w1',
    call: api => api.updateWebsite('w1', { name: 'New' }),
    expected: DATA,
  },
  {
    name: 'removeWebsite',
    verb: 'delete',
    url: '/websites/w1',
    call: api => api.removeWebsite('w1'),
    expected: undefined,
  },
  {
    name: 'previewWebsite',
    verb: 'post',
    url: '/websites/preview',
    call: api => api.previewWebsite({ url: 'http://s.com' }),
    expected: DATA,
  },
  {
    name: 'scanWebsites',
    verb: 'post',
    url: '/websites/scan',
    call: api => api.scanWebsites(),
    expected: DATA,
  },
  {
    name: 'scanSingleWebsite',
    verb: 'post',
    url: '/websites/w1/scan',
    call: api => api.scanSingleWebsite('w1'),
    expected: DATA,
  },
  {
    name: 'cancelWebsiteScan',
    verb: 'post',
    url: '/websites/scan/cancel',
    call: api => api.cancelWebsiteScan(),
    expected: DATA,
  },
  {
    name: 'getWebsiteScanStatus',
    verb: 'get',
    url: '/websites/scan/status',
    call: api => api.getWebsiteScanStatus(),
    expected: DATA,
  },
  {
    name: 'getWebsiteItems',
    verb: 'get',
    url: '/websites/items',
    call: api => api.getWebsiteItems('w1'),
    expected: DATA,
  },
  {
    name: 'bulkMarkWebsiteItemsSeen',
    verb: 'post',
    url: '/websites/items/bulk-seen',
    call: api => api.bulkMarkWebsiteItemsSeen(['i1']),
    expected: DATA,
  },
  {
    name: 'bulkDismissWebsiteItems',
    verb: 'post',
    url: '/websites/items/bulk-dismiss',
    call: api => api.bulkDismissWebsiteItems(['i1']),
    expected: DATA,
  },
  {
    name: 'markWebsiteItemSeen',
    verb: 'post',
    url: '/websites/items/i1/seen',
    call: api => api.markWebsiteItemSeen('i1'),
    expected: undefined,
  },
  {
    name: 'dismissWebsiteItem',
    verb: 'post',
    url: '/websites/items/i1/dismiss',
    call: api => api.dismissWebsiteItem('i1'),
    expected: undefined,
  },
  {
    name: 'getWebsiteSettings',
    verb: 'get',
    url: '/websites/settings',
    call: api => api.getWebsiteSettings(),
    expected: DATA,
  },
  {
    name: 'updateWebsiteSettings',
    verb: 'post',
    url: '/websites/settings',
    call: api => api.updateWebsiteSettings({}),
    expected: DATA,
  },
  {
    name: 'getOllamaStatus',
    verb: 'get',
    url: '/websites/ollama/status',
    call: api => api.getOllamaStatus(),
    expected: DATA,
  },

  // Release tracking
  {
    name: 'getTrackedReleases',
    verb: 'get',
    url: '/releases',
    reply: { data: ['r'], total: 1 },
    call: api => api.getTrackedReleases({ vinylOnly: true }),
    expected: { releases: ['r'], total: 1 },
  },
  {
    name: 'getReleaseTrackingSyncStatus',
    verb: 'get',
    url: '/releases/sync',
    call: api => api.getReleaseTrackingSyncStatus(),
    expected: DATA,
  },
  {
    name: 'startReleaseTrackingSync',
    verb: 'post',
    url: '/releases/sync',
    reply: { message: 'started', data: DATA },
    call: api => api.startReleaseTrackingSync(),
    expected: { message: 'started', status: DATA },
  },
  {
    name: 'cancelReleaseTrackingSync',
    verb: 'post',
    url: '/releases/sync/cancel',
    call: api => api.cancelReleaseTrackingSync(),
    expected: DATA,
  },
  {
    name: 'getReleaseTrackingSettings',
    verb: 'get',
    url: '/releases/settings',
    call: api => api.getReleaseTrackingSettings(),
    expected: DATA,
  },
  {
    name: 'saveReleaseTrackingSettings',
    verb: 'post',
    url: '/releases/settings',
    call: api => api.saveReleaseTrackingSettings({ includeEps: true }),
    expected: DATA,
  },
  {
    name: 'getPendingDisambiguations',
    verb: 'get',
    url: '/releases/disambiguations',
    reply: { data: ['d'], total: 1 },
    call: api => api.getPendingDisambiguations(),
    expected: { disambiguations: ['d'], total: 1 },
  },
  {
    name: 'resolveDisambiguation',
    verb: 'post',
    url: '/releases/disambiguations/d1/resolve',
    call: api => api.resolveDisambiguation('d1', 'mbid1'),
    expected: DATA,
  },
  {
    name: 'skipDisambiguation',
    verb: 'post',
    url: '/releases/disambiguations/d1/skip',
    call: api => api.skipDisambiguation('d1'),
    expected: undefined,
  },
  {
    name: 'getArtistMbidMappings',
    verb: 'get',
    url: '/releases/mappings',
    reply: { data: ['m'], total: 1 },
    call: api => api.getArtistMbidMappings(),
    expected: { mappings: ['m'], total: 1 },
  },
  {
    name: 'setArtistMbidMapping',
    verb: 'post',
    url: '/releases/mappings',
    call: api => api.setArtistMbidMapping('artist', 'mbid1'),
    expected: DATA,
  },
  {
    name: 'removeArtistMbidMapping',
    verb: 'delete',
    url: '/releases/mappings/artist',
    call: api => api.removeArtistMbidMapping('artist'),
    expected: undefined,
  },
  {
    name: 'searchMusicBrainzArtist',
    verb: 'get',
    url: '/releases/search/artist',
    call: api => api.searchMusicBrainzArtist('artist'),
    expected: DATA,
  },
  {
    name: 'checkVinylAvailability',
    verb: 'post',
    url: '/releases/check-vinyl',
    call: api => api.checkVinylAvailability(),
    expected: DATA,
  },
  {
    name: 'checkSingleReleaseVinyl',
    verb: 'post',
    url: '/releases/check-vinyl/mb1',
    call: api => api.checkSingleReleaseVinyl('mb1'),
    expected: DATA,
  },
  {
    name: 'fetchReleaseCoverArt',
    verb: 'post',
    url: '/releases/fetch-covers',
    call: api => api.fetchReleaseCoverArt(),
    expected: DATA,
  },
  {
    name: 'addReleaseToWishlist',
    verb: 'post',
    url: '/releases/mb1/wishlist',
    call: api => api.addReleaseToWishlist('mb1'),
    expected: undefined,
  },
  {
    name: 'getCollectionArtistsForReleases',
    verb: 'get',
    url: '/releases/collection-artists',
    reply: { data: ['a'], total: 1 },
    call: api => api.getCollectionArtistsForReleases(),
    expected: { artists: ['a'], total: 1 },
  },
  {
    name: 'getHiddenReleases',
    verb: 'get',
    url: '/releases/hidden',
    call: api => api.getHiddenReleases(),
    expected: DATA,
  },
  {
    name: 'hideRelease',
    verb: 'post',
    url: '/releases/hidden',
    call: api => api.hideRelease('mb1', 'Title', 'Artist'),
    expected: undefined,
  },
  {
    name: 'unhideRelease',
    verb: 'delete',
    url: '/releases/hidden/mb1',
    call: api => api.unhideRelease('mb1'),
    expected: undefined,
  },
  {
    name: 'getExcludedArtists',
    verb: 'get',
    url: '/releases/excluded-artists',
    call: api => api.getExcludedArtists(),
    expected: DATA,
  },
  {
    name: 'excludeArtist',
    verb: 'post',
    url: '/releases/excluded-artists',
    call: api => api.excludeArtist('artist', 'mbid1'),
    expected: undefined,
  },
  {
    name: 'includeArtist',
    verb: 'delete',
    url: '/releases/excluded-artists/artist',
    call: api => api.includeArtist('artist'),
    expected: undefined,
  },
  {
    name: 'getReleaseFiltersCounts',
    verb: 'get',
    url: '/releases/filters/counts',
    call: api => api.getReleaseFiltersCounts(),
    expected: DATA,
  },

  // Backup & restore
  {
    name: 'getBackupPreview',
    verb: 'get',
    url: '/backup/preview',
    call: api => api.getBackupPreview(),
    expected: DATA,
  },
  {
    name: 'exportBackup',
    verb: 'post',
    url: '/backup/export',
    reply: 'backup-file-contents',
    call: api => api.exportBackup({} as any),
    expected: RESOLVES,
  },
  {
    name: 'previewBackupImport',
    verb: 'post',
    url: '/backup/import/preview',
    call: api => api.previewBackupImport('{}'),
    expected: DATA,
  },
  {
    name: 'importBackup',
    verb: 'post',
    url: '/backup/import',
    call: api => api.importBackup('{}', {} as any),
    expected: DATA,
  },
  {
    name: 'getBackupSettings',
    verb: 'get',
    url: '/backup/settings',
    call: api => api.getBackupSettings(),
    expected: DATA,
  },
  {
    name: 'updateBackupSettings',
    verb: 'put',
    url: '/backup/settings',
    call: api => api.updateBackupSettings({}),
    expected: DATA,
  },
  {
    name: 'listAutoBackups',
    verb: 'get',
    url: '/backup/auto-backups',
    call: api => api.listAutoBackups(),
    expected: DATA,
  },
  {
    name: 'deleteAutoBackup',
    verb: 'delete',
    url: '/backup/auto-backups/backup.json',
    call: api => api.deleteAutoBackup('backup.json'),
    expected: undefined,
  },
  {
    name: 'runAutoBackup',
    verb: 'post',
    url: '/backup/auto-backup/run',
    call: api => api.runAutoBackup(),
    expected: undefined,
  },

  // Discard pile
  {
    name: 'getDiscardPile',
    verb: 'get',
    url: '/discard-pile',
    call: api => api.getDiscardPile(),
    expected: DATA,
  },
  {
    name: 'getDiscardPileStats',
    verb: 'get',
    url: '/discard-pile/stats',
    call: api => api.getDiscardPileStats(),
    expected: DATA,
  },
  {
    name: 'getDiscardPileCollectionIds',
    verb: 'get',
    url: '/discard-pile/ids',
    call: api => api.getDiscardPileCollectionIds(),
    expected: DATA,
  },
  {
    name: 'addToDiscardPile',
    verb: 'post',
    url: '/discard-pile',
    call: api => api.addToDiscardPile({} as any),
    expected: DATA,
  },
  {
    name: 'bulkAddToDiscardPile',
    verb: 'post',
    url: '/discard-pile/bulk',
    reply: { data: ['i'], total: 1, skipped: 0 },
    call: api => api.bulkAddToDiscardPile([]),
    expected: { items: ['i'], total: 1, skipped: 0 },
  },
  {
    name: 'updateDiscardPileItem',
    verb: 'put',
    url: '/discard-pile/id1',
    call: api => api.updateDiscardPileItem('id1', {} as any),
    expected: DATA,
  },
  {
    name: 'removeFromDiscardPile',
    verb: 'delete',
    url: '/discard-pile/id1',
    call: api => api.removeFromDiscardPile('id1'),
    expected: undefined,
  },
  {
    name: 'bulkRemoveFromDiscardPile',
    verb: 'delete',
    url: '/discard-pile/bulk',
    reply: { removed: 2 },
    call: api => api.bulkRemoveFromDiscardPile(['a', 'b']),
    expected: 2,
  },
  {
    name: 'markDiscardItemSold',
    verb: 'post',
    url: '/discard-pile/id1/sold',
    call: api => api.markDiscardItemSold('id1', 9.99),
    expected: DATA,
  },
  {
    name: 'markDiscardItemListed',
    verb: 'post',
    url: '/discard-pile/id1/listed',
    call: api => api.markDiscardItemListed('id1', 'http://mp.com'),
    expected: DATA,
  },
  {
    name: 'markDiscardItemTradedIn',
    verb: 'post',
    url: '/discard-pile/id1/traded-in',
    call: api => api.markDiscardItemTradedIn('id1'),
    expected: DATA,
  },
  {
    name: 'bulkMarkDiscardItemsTradedIn',
    verb: 'post',
    url: '/discard-pile/bulk/traded-in',
    call: api => api.bulkMarkDiscardItemsTradedIn(['a']),
    expected: DATA,
  },
  {
    name: 'refreshDiscardPileValues',
    verb: 'post',
    url: '/discard-pile/refresh-values',
    reply: { jobId: 'j1' },
    call: api => api.refreshDiscardPileValues(),
    expected: { jobId: 'j1' },
  },
  {
    name: 'getJobStatuses',
    verb: 'get',
    url: '/jobs',
    call: api => api.getJobStatuses(),
    expected: DATA,
  },

  // Recommendations (return the whole response body)
  {
    name: 'getRecommendations',
    verb: 'get',
    url: '/recommendations',
    call: api => api.getRecommendations({ count: 3 }),
    expected: envelope,
  },
  {
    name: 'getRecommendationDebug',
    verb: 'get',
    url: '/recommendations/debug/5',
    call: api => api.getRecommendationDebug(5),
    expected: envelope,
  },
  {
    name: 'submitRecommendationFeedback',
    verb: 'post',
    url: '/recommendations/feedback',
    call: api => api.submitRecommendationFeedback(5, 'played'),
    expected: envelope,
  },
  {
    name: 'getRecommendationSettings',
    verb: 'get',
    url: '/recommendations/settings',
    call: api => api.getRecommendationSettings(),
    expected: envelope,
  },
  {
    name: 'updateRecommendationSettings',
    verb: 'put',
    url: '/recommendations/settings',
    call: api => api.updateRecommendationSettings({}),
    expected: envelope,
  },

  // Embeddings
  {
    name: 'getEmbeddingStatus',
    verb: 'get',
    url: '/embeddings/status',
    call: api => api.getEmbeddingStatus(),
    expected: envelope,
  },
  {
    name: 'rebuildEmbeddings',
    verb: 'post',
    url: '/embeddings/rebuild',
    call: api => api.rebuildEmbeddings(),
    expected: envelope,
  },
  {
    name: 'refreshEmbedding',
    verb: 'post',
    url: '/embeddings/refresh/5',
    call: api => api.refreshEmbedding(5),
    expected: envelope,
  },
  {
    name: 'cancelEmbeddingRebuild',
    verb: 'post',
    url: '/embeddings/cancel',
    call: api => api.cancelEmbeddingRebuild(),
    expected: envelope,
  },

  // Memory scrobble
  {
    name: 'getMemoryScrobbleCollections',
    verb: 'get',
    url: '/memory-scrobble/collections',
    call: api => api.getMemoryScrobbleCollections(),
    expected: envelope,
  },
  {
    name: 'createMemoryScrobbleCollection',
    verb: 'post',
    url: '/memory-scrobble/collections',
    call: api => api.createMemoryScrobbleCollection('Mix', 'desc'),
    expected: envelope,
  },
  {
    name: 'getMemoryScrobbleCollection',
    verb: 'get',
    url: '/memory-scrobble/collections/c1',
    call: api => api.getMemoryScrobbleCollection('c1'),
    expected: envelope,
  },
  {
    name: 'updateMemoryScrobbleCollection',
    verb: 'put',
    url: '/memory-scrobble/collections/c1',
    call: api => api.updateMemoryScrobbleCollection('c1', 'New Name'),
    expected: envelope,
  },
  {
    name: 'deleteMemoryScrobbleCollection',
    verb: 'delete',
    url: '/memory-scrobble/collections/c1',
    call: api => api.deleteMemoryScrobbleCollection('c1'),
    expected: envelope,
  },
  {
    name: 'importMemoryScrobbleCollectionCsv',
    verb: 'post',
    url: '/memory-scrobble/collections/c1/import',
    call: api => api.importMemoryScrobbleCollectionCsv('c1', 'a,b,c'),
    expected: envelope,
  },
  {
    name: 'addMemoryScrobbleCollectionTrack',
    verb: 'post',
    url: '/memory-scrobble/collections/c1/tracks',
    call: api =>
      api.addMemoryScrobbleCollectionTrack('c1', { artist: 'a', track: 't' }),
    expected: envelope,
  },
  {
    name: 'removeMemoryScrobbleCollectionTrack',
    verb: 'delete',
    url: '/memory-scrobble/collections/c1/tracks/0',
    call: api => api.removeMemoryScrobbleCollectionTrack('c1', 0),
    expected: envelope,
  },
  {
    name: 'replaceMemoryScrobbleCollectionTrack',
    verb: 'put',
    url: '/memory-scrobble/collections/c1/tracks/0',
    call: api =>
      api.replaceMemoryScrobbleCollectionTrack('c1', 0, {
        artist: 'a',
        track: 't',
      }),
    expected: envelope,
  },
  {
    name: 'searchMemoryScrobbleTracks',
    verb: 'get',
    url: '/memory-scrobble/search',
    call: api => api.searchMemoryScrobbleTracks('query', 5),
    expected: envelope,
  },
  {
    name: 'lookupMemoryScrobbleDuration',
    verb: 'get',
    url: '/memory-scrobble/duration',
    call: api => api.lookupMemoryScrobbleDuration('a', 't', 'al'),
    expected: envelope,
  },
  {
    name: 'prepareMemoryScrobble',
    verb: 'post',
    url: '/memory-scrobble/prepare',
    call: api =>
      api.prepareMemoryScrobble(0, 1000, [
        { artist: 'a', track: 't', source: 'memory' },
      ]),
    expected: envelope,
  },
];

describe('ApiService endpoint coverage', () => {
  let api: ApiService;
  let mock: MockAdapter;

  beforeEach(() => {
    api = new ApiService('http://localhost:3001');
    mock = new MockAdapter((api as any).api);
  });

  afterEach(() => {
    mock.restore();
  });

  const registerMock = (spec: EndpointSpec) => {
    const handler = {
      get: () => mock.onGet(spec.url),
      post: () => mock.onPost(spec.url),
      put: () => mock.onPut(spec.url),
      delete: () => mock.onDelete(spec.url),
      patch: () => mock.onPatch(spec.url),
    }[spec.verb]();
    handler.reply(spec.status ?? 200, spec.reply ?? envelope);
  };

  specs.forEach(spec => {
    it(`${spec.name} → ${spec.verb.toUpperCase()} ${spec.url}`, async () => {
      registerMock(spec);

      const result = await spec.call(api);

      if (spec.expected !== RESOLVES) {
        expect(result).toEqual(spec.expected);
      }
      // Every spec must have actually hit the mocked route
      const history = mock.history[spec.verb] as unknown[];
      expect(history.length).toBeGreaterThan(0);
    });
  });

  it('updateBaseUrl changes the axios base URL', () => {
    api.updateBaseUrl('http://elsewhere:4000');

    expect((api as any).api.defaults.baseURL).toBe(
      'http://elsewhere:4000/api/v1'
    );
  });

  it('rejects when the server returns an error status', async () => {
    mock.onGet('/sellers').reply(500, { success: false, error: 'boom' });

    await expect(api.getSellers()).rejects.toThrow();
  });
});
