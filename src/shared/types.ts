export interface DiscogsRelease {
  id: number;
  master_id?: number;
  title: string;
  artist: string;
  year?: number;
  format: string[];
  label: string[];
  catalog_number?: string;
  cover_image?: string;
  resource_url: string;
  tracklist?: Track[];
}

export interface Track {
  position: string;
  title: string;
  duration?: string;
  artist?: string;
}

/**
 * Custom note field from Discogs collection.
 * Users can define custom fields in their collection settings.
 */
export interface CollectionNote {
  field_id: number;
  value: string;
}

export interface CollectionItem {
  id: number;
  release: DiscogsRelease;
  folder_id?: number;
  date_added: string;
  rating?: number;
  notes?: CollectionNote[];
  selected?: boolean;
}

export interface ScrobbleTrack {
  artist: string;
  track: string;
  album?: string;
  timestamp?: number;
  duration?: number;
  albumCover?: string;
}

export interface ScrobbleSession {
  id: string;
  tracks: ScrobbleTrack[];
  timestamp: number;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  error?: string;
  progress?: {
    current: number;
    total: number;
    success: number;
    failed: number;
    ignored: number;
  };
}

export interface UserSettings {
  discogs: {
    token?: string;
    username?: string;
  };
  lastfm: {
    apiKey?: string;
    sessionKey?: string;
    username?: string;
  };
  preferences: {
    defaultTimestamp: 'now' | 'custom';
    batchSize: number;
    autoScrobble: boolean;
  };
  temp?: {
    oauthTokenSecret?: string;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  pagination?: {
    page: number;
    pages: number;
    per_page: number;
    items: number;
  };
  timestamp?: number;
}

export interface AuthStatus {
  discogs: {
    authenticated: boolean;
    username?: string;
  };
  lastfm: {
    authenticated: boolean;
    username?: string;
  };
}

export interface AppState {
  loading: boolean;
  error: string | null;
  serverUrl: string;
}

export interface ScrobbleProgress {
  current: number;
  total: number;
  track?: string;
  status: 'preparing' | 'scrobbling' | 'completed' | 'error';
}

// Cache and progress tracking interfaces
export interface CollectionCacheProgress {
  username: string;
  totalPages?: number;
  currentPage?: number;
  completedPages?: number[];
  startTime?: number;
  endTime?: number;
  status: 'loading' | 'completed' | 'failed';
  error?: string;
}

export interface CachedCollectionData {
  data: CollectionItem[];
  timestamp: number;
}

export type LastFmPeriodType =
  | '7day'
  | '1month'
  | '3month'
  | '6month'
  | '12month';

// ============================================
// Play Suggestion Types
// ============================================

export interface SuggestionFactors {
  recencyGap: number; // Days since last play (uses full Last.fm history)
  neverPlayed: boolean; // Never scrobbled from any source
  recentAddition: number; // Days since added to collection
  artistAffinity: number; // 0-1 score based on top artists
  eraPreference: number; // 0-1 score based on decade preference
  userRating: number; // 0-5 rating from Discogs
  timeOfDay: number; // 0-1 score based on time patterns
  diversityPenalty: number; // Penalty for recent suggestion repetition
  albumCompleteness: number; // 0-1 ratio of tracks typically played
}

export interface SuggestionWeights {
  recencyGap: number;
  neverPlayed: number;
  recentAddition: number;
  artistAffinity: number;
  eraPreference: number;
  userRating: number;
  timeOfDay: number;
  diversityPenalty: number;
  albumCompleteness: number;
}

export interface SuggestionResult {
  album: CollectionItem;
  score: number;
  factors: SuggestionFactors;
  reason: string; // Human-readable explanation
}

export interface SuggestionSettings {
  weights: SuggestionWeights;
  excludeRecentlyPlayed: boolean;
  preferNeverPlayed: boolean;
}

// ============================================
// Scrobble History Index Types
// ============================================

export interface ScrobbleHistoryEntry {
  timestamp: number;
  track?: string;
}

export interface AlbumHistoryEntry {
  lastPlayed: number;
  playCount: number;
  plays: ScrobbleHistoryEntry[];
}

export interface ScrobbleHistoryIndex {
  lastSyncTimestamp: number;
  totalScrobbles: number;
  oldestScrobbleDate: number;
  albums: Record<string, AlbumHistoryEntry>; // key: normalized "artist|album"
}

export interface SyncStatus {
  status: 'idle' | 'syncing' | 'paused' | 'completed' | 'error';
  progress: number; // 0-100
  currentPage: number;
  totalPages: number;
  scrobblesFetched: number;
  totalScrobbles: number;
  estimatedTimeRemaining?: number; // seconds
  error?: string;
  lastSyncTimestamp?: number;
}

export interface SyncSettings {
  autoSyncOnStartup: boolean;
  syncPace: 'fast' | 'normal' | 'slow'; // requests per second
}

// ============================================
// Discovery Types (Missing from Collection)
// ============================================

export interface MissingAlbum {
  artist: string;
  album: string;
  playCount: number;
  lastPlayed: number;
}

export interface MissingArtist {
  artist: string;
  playCount: number;
  albumCount: number; // number of different albums scrobbled
  lastPlayed: number;
}

/**
 * A track that was frequently played but hasn't been listened to recently.
 * Used by the Forgotten Favorites feature to resurface dormant favorites.
 */
export interface ForgottenTrack {
  artist: string;
  album: string; // Empty string means single/unknown
  track: string;
  allTimePlayCount: number; // Total plays ever
  lastPlayed: number; // Unix timestamp (seconds)
  daysSincePlay: number; // Calculated for display
  firstPlayed?: number; // When first scrobbled (optional)
}

/**
 * Manual mapping from Last.fm album/artist names to Discogs collection items.
 * Used when automatic matching fails (e.g., different naming conventions).
 */
export interface AlbumMapping {
  // The Last.fm naming (from scrobble history)
  historyArtist: string;
  historyAlbum: string;
  // The Discogs collection item to map to
  collectionId: number; // CollectionItem.id
  collectionArtist: string;
  collectionAlbum: string;
  // Metadata
  createdAt: number;
}

export interface ArtistMapping {
  // The Last.fm artist name (from scrobble history)
  historyArtist: string;
  // The Discogs artist name (from collection)
  collectionArtist: string;
  // Metadata
  createdAt: number;
}

/**
 * Versioned store for album mappings (History->Collection)
 */
export interface AlbumMappingsStore {
  schemaVersion: 1;
  mappings: AlbumMapping[];
}

/**
 * Versioned store for artist mappings (History->Collection)
 */
export interface HistoryArtistMappingsStore {
  schemaVersion: 1;
  mappings: ArtistMapping[];
}

/**
 * Manual mapping for individual tracks in Forgotten Favorites.
 * Maps a track from Last.fm history (with different naming) to a track in the local cache.
 * Used when automatic normalization fails to match tracks.
 */
export interface TrackMapping {
  // The Last.fm naming (from scrobble history / Forgotten Favorites)
  historyArtist: string;
  historyAlbum: string;
  historyTrack: string;
  // The target track in local scrobble cache
  cacheArtist: string;
  cacheAlbum: string;
  cacheTrack: string;
  // Metadata
  createdAt: number;
}

/**
 * Versioned store for track mappings
 */
export interface TrackMappingsStore {
  schemaVersion: 1;
  mappings: TrackMapping[];
}

// ============================================
// Scrobble Artist Mappings (Discogs -> Last.fm)
// ============================================

/**
 * Artist mapping for scrobbling (Discogs name -> Last.fm name)
 * Used when Discogs artist names need to be corrected for Last.fm
 */
export interface ScrobbleArtistMapping {
  discogsName: string;
  lastfmName: string;
  dateAdded: number;
  lastUsed?: number;
}

/**
 * Statistics for scrobble artist mappings
 */
export interface ScrobbleArtistMappingStats {
  totalMappings: number;
  filePath: string;
  lastUpdated?: number;
}

/**
 * Suggestion for artist mapping (disambiguation artists)
 */
export interface ScrobbleArtistMappingSuggestion {
  artist: string;
  localScrobbles: number;
  suggestedMapping: string;
}

// ============================================
// Hidden Discovery Items
// ============================================

/**
 * Album hidden from Discovery page (e.g., podcasts, compilations)
 */
export interface HiddenAlbum {
  artist: string;
  album: string;
  hiddenAt: number; // Timestamp when hidden
}

/**
 * Artist hidden from Discovery page (e.g., podcast hosts)
 */
export interface HiddenArtist {
  artist: string;
  hiddenAt: number; // Timestamp when hidden
}

/**
 * Versioned store for hidden albums
 */
export interface HiddenAlbumsStore {
  schemaVersion: 1;
  items: HiddenAlbum[];
}

/**
 * Versioned store for hidden artists
 */
export interface HiddenArtistsStore {
  schemaVersion: 1;
  items: HiddenArtist[];
}

// ============================================
// AI Suggestion Types (Ollama)
// ============================================

export interface AISuggestionResult {
  album: CollectionItem | null;
  reasoning: string; // AI's explanation for the pick
  mood?: string; // Detected or suggested mood
  confidence: 'high' | 'medium' | 'low'; // Confidence level
}

// Alias for consistency
export type AISuggestion = AISuggestionResult;

export interface AISettings {
  enabled: boolean;
  ollamaUrl: string;
  model: string;
  connectionStatus: 'connected' | 'disconnected' | 'unknown';
}

export interface OllamaModel {
  name: string;
  size: number;
  modifiedAt: string;
}

// ============================================
// Stats Dashboard Types
// ============================================

export interface ArtistPlayCount {
  artist: string;
  playCount: number;
  imageUrl?: string;
}

export interface AlbumPlayCount {
  artist: string;
  album: string;
  playCount: number;
  lastPlayed: number;
  coverUrl?: string;
}

export interface TrackPlayCount {
  artist: string;
  album: string;
  track: string;
  playCount: number;
  lastPlayed: number;
}

export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  currentStreakStart?: number; // Unix timestamp
  longestStreakStart?: number;
  longestStreakEnd?: number;
}

export interface ScrobbleCounts {
  today: number;
  thisWeek: number;
  thisMonth: number;
  thisYear: number;
  allTime: number;
}

export interface ListeningHours {
  today: number;
  thisWeek: number;
  thisMonth: number;
}

export interface CollectionCoverage {
  thisMonth: number; // Percentage 0-100
  thisYear: number;
  allTime: number;
  days30: number; // Rolling 30 days
  days90: number; // Rolling 90 days
  days365: number; // Rolling 365 days
  albumsPlayedThisMonth: number;
  albumsPlayedThisYear: number;
  albumsPlayedAllTime: number;
  albumsPlayedDays30: number;
  albumsPlayedDays90: number;
  albumsPlayedDays365: number;
  totalAlbums: number;
}

export interface MilestoneInfo {
  total: number;
  nextMilestone: number;
  scrobblesToNext: number;
  progressPercent: number;
  history: { milestone: number; reachedAt: number }[];
}

export interface CalendarHeatmapData {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface StatsOverview {
  streaks: StreakInfo;
  counts: ScrobbleCounts;
  listeningHours: ListeningHours;
  newArtistsThisMonth: number;
  collectionCoverage: CollectionCoverage;
  milestones: MilestoneInfo;
}

export interface SourceBreakdownItem {
  source: string; // 'RecordScrobbles', 'Other'
  count: number;
  percentage: number;
}

export interface TimelineDataPoint {
  date: string; // YYYY-MM-DD or YYYY-MM or YYYY-Www depending on granularity
  count: number;
}

export interface DustyCornerAlbum {
  artist: string;
  album: string;
  coverUrl?: string;
  lastPlayed: number;
  daysSincePlay: number;
  collectionId: number;
}

// ============================================
// Notification System Types
// ============================================

export interface AppNotification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'alert';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  action?: {
    label: string;
    route: string;
    externalUrl?: string;
  };
}

export interface NotificationStore {
  schemaVersion: 1;
  notifications: AppNotification[];
}

// ============================================
// Stats Cache Types
// ============================================

export interface StatsCache {
  schemaVersion: 1;
  lastUpdated: number; // Unix timestamp UTC
  streaks: StreakInfo;
  milestoneHistory: { milestone: number; reachedAt: number }[];
}

// ============================================
// Date Range Selection Types
// ============================================

/**
 * Custom date range for filtering stats.
 * Timestamps are in Unix seconds (not milliseconds).
 */
export interface DateRange {
  startDate: number; // Unix timestamp (seconds)
  endDate: number; // Unix timestamp (seconds)
}

// ============================================
// Wishlist & Vinyl Tracking Types
// ============================================

/**
 * Wishlist item from Discogs wants list
 */
export interface WishlistItem {
  id: number; // Discogs want list item ID
  masterId: number; // Master release ID for grouping versions
  releaseId: number; // Specific release ID in wishlist
  artist: string;
  title: string;
  year?: number;
  coverImage?: string;
  dateAdded: string; // ISO date when added to wishlist
  notes?: string; // User notes from Discogs
  rating?: number; // Want priority (0-5)
}

/**
 * Marketplace price statistics for a release
 */
export interface MarketplaceStats {
  lowestPrice?: number;
  medianPrice?: number;
  highestPrice?: number;
  numForSale: number;
  currency: string; // e.g., "USD"
  lastFetched: number; // Unix timestamp
  // Price suggestions by condition (from /marketplace/price_suggestions)
  priceSuggestions?: PriceSuggestions;
}

/**
 * Price suggestions by vinyl condition from Discogs
 * Returned by /marketplace/price_suggestions/{release_id}
 */
export interface PriceSuggestions {
  mint?: PriceSuggestion;
  nearMint?: PriceSuggestion;
  veryGoodPlus?: PriceSuggestion;
  veryGood?: PriceSuggestion;
  goodPlus?: PriceSuggestion;
  good?: PriceSuggestion;
  fair?: PriceSuggestion;
  poor?: PriceSuggestion;
}

export interface PriceSuggestion {
  value: number;
  currency: string;
}

/**
 * Version/pressing info from Master release
 */
export interface ReleaseVersion {
  releaseId: number;
  title: string;
  format: string[]; // e.g., ["Vinyl", "LP", "Album"]
  label: string;
  country: string;
  year: number;
  hasVinyl: boolean; // Derived from format
  marketplaceStats?: MarketplaceStats;
  lastFetched?: number; // Timestamp for cache invalidation
}

export type VinylStatus = 'has_vinyl' | 'cd_only' | 'unknown' | 'checking';

/**
 * Enriched wishlist item with vinyl availability info
 */
export interface EnrichedWishlistItem extends WishlistItem {
  vinylStatus: VinylStatus;
  vinylVersions: ReleaseVersion[];
  lowestVinylPrice?: number;
  priceCurrency?: string;
  lastChecked?: number; // Unix timestamp
}

/**
 * Sync status for wishlist operations
 */
export interface WishlistSyncStatus {
  status: 'idle' | 'syncing' | 'checking_vinyl' | 'completed' | 'error';
  progress: number; // 0-100
  currentItem?: string; // Artist - Title being processed
  itemsProcessed: number;
  totalItems: number;
  vinylChecked: number;
  lastSyncTimestamp?: number;
  error?: string;
}

/**
 * User settings for wishlist feature
 */
export interface WishlistSettings {
  schemaVersion: 1;
  priceThreshold?: number; // Max price for "affordable" filter (undefined = no limit)
  currency: string; // Preferred currency
  autoSyncInterval: number; // Days between auto-sync (0 = manual only)
  notifyOnVinylAvailable: boolean;
  newReleaseTracking?: WishlistNewReleaseSettings; // Feature 5.5: New release tracking
}

/**
 * Stored wishlist data file
 */
export interface WishlistStore {
  schemaVersion: 1;
  lastUpdated: number;
  items: EnrichedWishlistItem[];
}

/**
 * Local want list item - albums user wants but aren't on Discogs wantlist
 * These are tracked locally from the Discovery page
 */
export interface LocalWantItem {
  id: string; // Generated unique ID (artist-album hash)
  artist: string;
  album: string;
  playCount: number; // From Last.fm history
  lastPlayed: number; // Unix timestamp
  addedAt: number; // When added to local want list
  source: 'discovery'; // Where the item came from
  // Discogs search results (cached)
  masterId?: number; // If found on Discogs
  releaseId?: number;
  coverImage?: string;
  // Vinyl tracking
  vinylStatus: 'unknown' | 'checking' | 'has_vinyl' | 'cd_only';
  lastChecked?: number; // When vinyl status was last checked
  vinylAvailableSince?: number; // When vinyl first became available (for notifications)
  notified: boolean; // Whether user was notified of vinyl availability
}

/**
 * Stored local want list
 */
export interface LocalWantStore {
  schemaVersion: 1;
  items: LocalWantItem[];
}

/**
 * Stored version cache per master
 */
export interface VersionsCacheEntry {
  masterId: number;
  versions: ReleaseVersion[];
  fetchedAt: number;
}

export interface VersionsCache {
  schemaVersion: 1;
  entries: Record<number, VersionsCacheEntry>; // masterId -> cache entry
}

// ============================================
// Wishlist New Release Tracking Types (Feature 5.5)
// ============================================

/**
 * Settings for new release tracking
 */
export interface WishlistNewReleaseSettings {
  enabled: boolean; // Enable/disable tracking
  checkFrequencyDays: number; // How often to check (default: 7)
  notifyOnNewRelease: boolean; // Create notifications
  autoCheck: boolean; // Check on app startup
  trackLocalWantList: boolean; // Include local want list items
}

/**
 * A newly detected release for a tracked master
 */
export interface WishlistNewRelease {
  id: string; // Unique ID (masterId-releaseId)
  masterId: number; // Parent master release
  releaseId: number; // New release ID detected

  // Release info (from Discogs)
  title: string; // Release-specific title (may include edition info)
  artist: string;
  year: number; // Year pressed (from Discogs)
  country: string;
  format: string[]; // e.g., ["LP", "Album", "180g"]
  label: string;
  catalogNumber?: string;

  // Pricing (if available)
  lowestPrice?: number;
  priceCurrency?: string;
  numForSale?: number;

  // Tracking
  source: 'wishlist' | 'local_want'; // Where the master came from
  sourceItemId: string | number; // ID of the source item
  detectedAt: number; // When we first saw this release
  notified: boolean; // Have we notified the user?
  dismissed: boolean; // User dismissed this alert

  // Links
  discogsUrl: string; // Direct link to release page
  coverImage?: string; // Cover art URL
}

/**
 * Store for tracking new releases
 */
export interface WishlistNewReleasesStore {
  schemaVersion: 1;
  lastCheck: number; // Last time we completed a check
  releases: WishlistNewRelease[];
}

/**
 * Sync status for new release checking (parallels ReleaseTrackingSyncStatus)
 */
export interface NewReleaseSyncStatus {
  status: 'idle' | 'syncing' | 'completed' | 'error';
  lastFullCheck: number | null; // Last completed full cycle
  mastersProcessed: number; // Current progress
  totalMasters: number; // Total to process
  newReleasesFound: number; // Found in current/last run
  lastCheckedIndex: number; // For resumable batching
  progress: number; // 0-100 percentage
  currentMaster?: string; // Artist - Album being checked
  estimatedTimeRemaining?: number; // Seconds
  error?: string; // Error message if status is 'error'
  lastError?: {
    // Last error details for retry
    message: string;
    masterId?: number;
    timestamp: number;
    retryCount: number;
  };
}

/**
 * Info about a tracked master's source
 */
export interface TrackedMasterInfo {
  source: 'wishlist' | 'local_want';
  itemId: string | number;
  artistAlbum: string;
  coverImage?: string;
}

// ============================================
// Seller Monitoring Types
// ============================================

/**
 * A seller being monitored for inventory matches
 */
export interface MonitoredSeller {
  username: string; // Discogs seller username
  displayName: string; // Friendly name for UI
  addedAt: number; // Unix timestamp when added
  lastScanned?: number; // Last full inventory scan timestamp
  lastQuickCheck?: number; // Last page-1-only check timestamp
  inventorySize?: number; // Estimated total items
  matchCount?: number; // Current active matches
}

/**
 * Store for monitored sellers
 */
export interface MonitoredSellersStore {
  schemaVersion: 1;
  sellers: MonitoredSeller[];
}

/**
 * A match found in a seller's inventory
 */
export interface SellerMatch {
  id: string; // Deterministic: `${listingId}` for stable identity
  sellerId: string; // Seller username
  releaseId: number; // Discogs release ID
  masterId?: number; // Master release ID (for grouping)
  artist: string;
  title: string;
  format: string[]; // Format array
  condition: string; // Vinyl/sleeve condition
  price: number; // Normalized numeric price
  currency: string; // Currency code (USD, EUR, etc.)
  listingUrl: string; // Direct URL to listing
  listingId: number; // Discogs listing ID (used as stable ID)
  dateFound: number; // When we found this match
  notified: boolean; // Whether notification was created (client-side)
  status: 'active' | 'sold' | 'seen'; // Match status
  statusChangedAt?: number; // When status last changed (for cleanup of sold matches)
  coverImage?: string; // Album cover URL
}

/**
 * Store for all matches
 */
export interface SellerMatchesStore {
  schemaVersion: 1;
  lastUpdated: number;
  matches: SellerMatch[];
}

/**
 * Cached inventory for a seller
 */
export interface SellerInventoryCache {
  username: string;
  fetchedAt: number; // Full scan timestamp
  quickCheckAt?: number; // Last page-1 check
  totalItems: number;
  items: SellerInventoryItem[];
}

/**
 * Single inventory item from a seller
 */
export interface SellerInventoryItem {
  listingId: number;
  releaseId: number;
  masterId?: number;
  artist: string;
  title: string;
  format: string[];
  condition: string;
  price: number; // Normalized from Discogs { currency, value }
  currency: string;
  listingUrl: string;
  coverImage?: string;
  listedAt?: string; // ISO date when listed
}

/**
 * Scan status tracking
 */
export interface SellerScanStatus {
  status: 'idle' | 'scanning' | 'matching' | 'completed' | 'error';
  currentSeller?: string;
  sellersScanned: number;
  totalSellers: number;
  currentPage?: number;
  totalPages?: number;
  progress: number; // 0-100
  newMatches: number; // Matches found in this scan
  lastScanTimestamp?: number;
  error?: string;
  // Matching phase progress
  matchingProgress?: {
    itemsProcessed: number;
    totalItems: number;
    cacheHits: number;
    apiCalls: number;
  };
}

/**
 * Settings for seller monitoring
 */
export interface SellerMonitoringSettings {
  schemaVersion: 1;
  scanFrequencyDays: number; // Full scan interval (default: 7)
  quickCheckFrequencyHours: number; // Page-1 check interval (default: 24)
  notifyOnNewMatch: boolean; // Enable notifications
  vinylFormatsOnly: boolean; // Only match vinyl formats (default: true)
}

// ============================================
// Schema Versioning & Migration Types
// ============================================

/**
 * Base interface for all versioned data stores.
 * All data files MUST extend this interface.
 */
export interface VersionedStore {
  schemaVersion: number;
}

/**
 * Migration function signature for schema upgrades.
 * Takes data at version N and returns data at version N+1.
 */
export type MigrationFn<TFrom, TTo> = (data: TFrom) => TTo;

/**
 * Metadata for a registered data file in the migration system.
 */
export interface DataFileMeta {
  /** Relative path from data directory (e.g., 'history/scrobble-history-index.json') */
  path: string;
  /** Current schema version expected by the application */
  currentVersion: number;
  /** Ordered list of migrations to apply when upgrading */
  migrations: MigrationDefinition[];
  /** If true, skip stamping (file doesn't exist yet or is optional) */
  optional?: boolean;
  /**
   * If set, the file stores a raw array that needs to be wrapped in a versioned object.
   * The array will be placed under this key (e.g., 'items' -> { schemaVersion: 1, items: [...] })
   */
  arrayWrapperKey?: string;
}

/**
 * A single migration step from one version to the next.
 */
export interface MigrationDefinition {
  fromVersion: number;
  toVersion: number;
  migrate: MigrationFn<unknown, unknown>;
  /** Human-readable description for logging */
  description?: string;
}

/**
 * Report generated after running migrations on startup.
 */
export interface MigrationReport {
  checked: number;
  migrated: number;
  stamped: number;
  errors: { file: string; error: string }[];
  startTime: number;
  endTime: number;
}

// ============================================
// New Release Tracking Types (Feature 5)
// ============================================

/**
 * MusicBrainz artist match result for disambiguation
 */
export interface MusicBrainzArtistMatch {
  mbid: string; // MusicBrainz artist ID
  name: string; // Artist name
  disambiguation?: string; // Disambiguation text (e.g., "UK rock band")
  country?: string; // Country of origin
  beginYear?: number; // Year artist started
  endYear?: number; // Year artist ended (if applicable)
  releaseCount?: number; // Number of releases
  score: number; // Match score (0-100)
}

/**
 * Stored artist mapping from Discogs to MusicBrainz
 */
export interface ArtistMbidMapping {
  discogsArtistId?: number; // Discogs artist ID (if available)
  discogsArtistName: string; // Original name from Discogs (canonical)
  normalizedName: string; // Lowercase, normalized for lookup
  mbid: string | null; // MusicBrainz ID (null if "none of these" selected)
  confirmedAt: number; // When user confirmed this mapping
  confirmedBy: 'auto' | 'user'; // How it was confirmed
}

/**
 * A release from MusicBrainz
 */
export interface MusicBrainzRelease {
  mbid: string; // Release group MBID
  title: string;
  artistName: string;
  artistMbid: string;
  releaseDate: string | null; // ISO date string (YYYY-MM-DD or YYYY-MM or YYYY)
  releaseType: 'album' | 'ep' | 'single' | 'compilation' | 'other';
  primaryType?: string; // MusicBrainz primary type
  secondaryTypes?: string[]; // MusicBrainz secondary types
  coverArtUrl?: string; // Cover art URL from Cover Art Archive
}

/**
 * A tracked release with vinyl availability info
 */
export interface TrackedRelease {
  mbid: string;
  title: string;
  artistName: string;
  artistMbid: string;
  releaseDate: string | null;
  releaseType: MusicBrainzRelease['releaseType'];
  coverArtUrl?: string;

  // Vinyl availability (from Discogs lookup)
  vinylStatus: 'unknown' | 'checking' | 'available' | 'cd-only' | 'not-found';
  vinylPriceRange?: {
    min: number;
    max: number;
    currency: string;
  };
  discogsUrl?: string; // Link to Discogs release/master
  discogsMasterId?: number; // For wishlist integration

  // Tracking
  firstSeen: number; // When we first detected this release
  isUpcoming: boolean; // Release date is in the future
  inWishlist: boolean; // Already in user's wishlist
  vinylCheckedAt?: number; // When vinyl availability was last checked
}

/**
 * Artist disambiguation status
 */
export interface ArtistDisambiguationStatus {
  id: string; // Unique ID for this disambiguation request
  artistName: string;
  normalizedName: string;
  status: 'pending' | 'resolved' | 'skipped';
  candidates?: MusicBrainzArtistMatch[];
  selectedMbid?: string | null;
  createdAt: number; // When this was added to pending list
  resolvedAt?: number; // When user resolved (for cleanup)
}

/**
 * Release tracking sync status
 */
export interface ReleaseTrackingSyncStatus {
  status: 'idle' | 'syncing' | 'completed' | 'error';
  lastSync: number | null;
  artistsProcessed: number;
  totalArtists: number;
  releasesFound: number;
  pendingDisambiguations: number;
  error?: string;
  // Progress details (for live UI updates)
  progress: number; // 0-100 percentage
  currentArtist?: string; // Artist currently being processed
  estimatedTimeRemaining?: number; // Seconds remaining
}

/**
 * Release tracking settings
 */
export interface ReleaseTrackingSettings extends VersionedStore {
  schemaVersion: 1;
  autoCheckOnStartup: boolean; // Check for new releases on app startup
  checkFrequencyDays: number; // How often to re-check (default: 7)
  notifyOnNewRelease: boolean; // Create notification for new releases
  includeEps: boolean; // Include EPs in results
  includeSingles: boolean; // Include singles in results
  includeCompilations: boolean; // Include compilations in results
}

/**
 * Collection artist entry (for caching)
 */
export interface CollectionArtist {
  name: string;
  id?: number; // Discogs artist ID if available
  normalizedName: string;
}

/**
 * Stored artist MBID mappings
 */
export interface ArtistMbidMappingsStore extends VersionedStore {
  schemaVersion: 1;
  mappings: ArtistMbidMapping[];
}

/**
 * Stored tracked releases
 */
export interface TrackedReleasesStore extends VersionedStore {
  schemaVersion: 1;
  lastUpdated: number;
  releases: TrackedRelease[];
}

/**
 * Hidden release from New Releases page
 */
export interface HiddenRelease {
  mbid: string;
  title: string;
  artistName: string;
  hiddenAt: number;
}

/**
 * Excluded artist from release tracking sync
 */
export interface ExcludedArtist {
  artistName: string;
  normalizedName: string;
  artistMbid?: string;
  excludedAt: number;
}

/**
 * Versioned store for hidden releases
 */
export interface HiddenReleasesStore extends VersionedStore {
  schemaVersion: 1;
  items: HiddenRelease[];
}

/**
 * Versioned store for excluded artists (release tracking)
 */
export interface ExcludedArtistsStore extends VersionedStore {
  schemaVersion: 1;
  items: ExcludedArtist[];
}

/**
 * Stored pending disambiguations
 */
export interface PendingDisambiguationsStore extends VersionedStore {
  schemaVersion: 1;
  pending: ArtistDisambiguationStatus[];
}

/**
 * Stored collection artists cache
 */
export interface CollectionArtistsCacheStore extends VersionedStore {
  schemaVersion: 1;
  fetchedAt: number;
  artists: CollectionArtist[];
}

/**
 * Release tracking sync status store
 */
export interface ReleaseSyncStatusStore extends VersionedStore {
  schemaVersion: 1;
  status: ReleaseTrackingSyncStatus;
}

// ============================================
// Backup & Restore Types (Feature 10)
// ============================================

/**
 * Data included in a backup file.
 * Contains all user-generated data that cannot be recovered from external APIs.
 */
export interface BackupData {
  // Settings (credentials only if opt-in)
  userSettings: Omit<UserSettings, 'discogs' | 'lastfm'> | UserSettings;
  suggestionSettings: SuggestionSettings | null;
  aiSettings: AISettings | null;
  wishlistSettings: WishlistSettings | null;
  sellerMonitoringSettings: SellerMonitoringSettings | null;
  releaseTrackingSettings: ReleaseTrackingSettings | null;
  syncSettings: SyncSettings | null;

  // Mappings
  albumMappings: AlbumMapping[];
  artistMappings: ArtistMapping[];
  historyArtistMappings: ArtistMapping[];

  // Discovery
  hiddenAlbums: HiddenAlbum[];
  hiddenArtists: HiddenArtist[];

  // Wishlist
  localWantList: LocalWantItem[];

  // Sellers
  monitoredSellers: MonitoredSeller[];

  // Release tracking
  artistMbidMappings: ArtistMbidMapping[];
  hiddenReleases: HiddenRelease[];
  excludedArtists: ExcludedArtist[];
}

/**
 * Full backup file structure with metadata and checksum.
 */
export interface BackupFile {
  version: 2; // Backup format version
  exportedAt: number; // Unix timestamp
  appVersion: string;
  includesCredentials: boolean;
  checksum: string; // SHA-256 of stable JSON serialization of data
  data: BackupData;
}

/**
 * Preview of what would be included in a backup export.
 */
export interface BackupPreview {
  // Settings
  hasUserSettings: boolean;
  hasSuggestionSettings: boolean;
  hasAiSettings: boolean;
  hasWishlistSettings: boolean;
  hasSellerSettings: boolean;
  hasReleaseSettings: boolean;
  hasSyncSettings: boolean;

  // Counts
  albumMappingsCount: number;
  artistMappingsCount: number;
  historyArtistMappingsCount: number;
  hiddenAlbumsCount: number;
  hiddenArtistsCount: number;
  localWantListCount: number;
  monitoredSellersCount: number;
  artistMbidMappingsCount: number;
  hiddenReleasesCount: number;
  excludedArtistsCount: number;
}

/**
 * Summary of import changes for a specific data category.
 */
export interface ImportCategorySummary {
  new: number;
  existing: number;
}

/**
 * Preview of what would happen during a backup import.
 */
export interface BackupImportPreview {
  valid: boolean;
  error?: string;
  exportedAt: number;
  appVersion: string;
  includesCredentials: boolean;
  checksumValid: boolean;
  summary: {
    albumMappings: ImportCategorySummary;
    artistMappings: ImportCategorySummary;
    historyArtistMappings: ImportCategorySummary;
    hiddenAlbums: ImportCategorySummary;
    hiddenArtists: ImportCategorySummary;
    localWantList: ImportCategorySummary;
    monitoredSellers: ImportCategorySummary;
    artistMbidMappings: ImportCategorySummary;
    hiddenReleases: ImportCategorySummary;
    excludedArtists: ImportCategorySummary;
    settingsWillMerge: boolean;
  };
}

/**
 * Result of a backup import operation.
 */
export interface BackupImportResult {
  success: boolean;
  itemsAdded: number;
  itemsUpdated: number;
  settingsMerged: boolean;
  errors: string[];
}

/**
 * Options for exporting a backup.
 */
export interface BackupExportOptions {
  includeCredentials: boolean;
  password?: string; // Required if includeCredentials is true
}

/**
 * Options for importing a backup.
 */
export interface BackupImportOptions {
  mode: 'merge' | 'replace';
  password?: string; // Required if backup includes encrypted credentials
}

// ============================================
// Dashboard Types (Feature 9)
// ============================================

/**
 * Quick stats for the dashboard header row
 */
export interface DashboardQuickStats {
  currentStreak: number;
  longestStreak: number;
  scrobblesThisMonth: number;
  averageMonthlyScrobbles: number;
  newArtistsThisMonth: number;
  collectionCoverageThisMonth: number;
  listeningHoursThisMonth: number;
  totalScrobbles: number;
  nextMilestone: number;
}

/**
 * Quick action counts for actionable items
 */
export interface DashboardQuickActions {
  newSellerMatches: number;
  missingAlbumsCount: number;
  wantListCount: number;
  dustyCornersCount: number;
}

/**
 * Recent album for dashboard display
 */
export interface DashboardRecentAlbum {
  artist: string;
  album: string;
  coverUrl: string | null;
  lastPlayed: number; // Unix timestamp (seconds)
  releaseId?: number; // Present if album is in collection
  inCollection: boolean;
}

/**
 * Artist entry for monthly highlights
 */
export interface DashboardTopArtist {
  name: string;
  playCount: number;
  imageUrl: string | null;
}

/**
 * Album entry for monthly highlights
 */
export interface DashboardTopAlbum {
  artist: string;
  album: string;
  playCount: number;
  coverUrl: string | null;
}

/**
 * Aggregated dashboard data returned by /api/v1/stats/dashboard
 * Each section can fail independently - null means the section failed to load
 */
export interface DashboardData {
  errors: {
    quickStats?: string;
    quickActions?: string;
    recentAlbums?: string;
    monthlyTop?: string;
  };
  quickStats: DashboardQuickStats | null;
  quickActions: DashboardQuickActions | null;
  recentAlbums: DashboardRecentAlbum[] | null;
  monthlyTopArtists: DashboardTopArtist[] | null;
  monthlyTopAlbums: DashboardTopAlbum[] | null;
}

/**
 * Auto-backup settings.
 * Note: Auto-backups never include credentials since they require interactive
 * password input. Users must use manual export for credential backup.
 */
export interface BackupSettings extends VersionedStore {
  schemaVersion: 1;
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  retentionCount: number; // Keep last N backups (default: 5)
  lastBackup?: number; // Unix timestamp of last auto-backup
}

/**
 * Information about an auto-backup file.
 */
export interface AutoBackupInfo {
  filename: string;
  createdAt: number;
  size: number;
}

/**
 * Versioned store for backup settings.
 */
export interface BackupSettingsStore extends VersionedStore {
  schemaVersion: 1;
  settings: BackupSettings;
}

// ============================================
// Discard Pile Types (Feature 7)
// ============================================

/**
 * Reasons for discarding a record
 */
export type DiscardReason =
  | 'selling' // Planning to sell
  | 'duplicate' // Have multiple copies
  | 'damaged' // Physical damage
  | 'upgrade' // Replacing with better pressing
  | 'not_listening' // No longer interested
  | 'gift' // Giving away
  | 'other'; // Custom reason

/**
 * Status of a discard pile item
 */
export type DiscardStatus =
  | 'marked' // Just added to discard pile
  | 'listed' // Listed for sale somewhere
  | 'sold' // Successfully sold
  | 'gifted' // Given away
  | 'removed'; // Actually removed from collection

/**
 * Item marked for discard/sale tracking
 */
export interface DiscardPileItem {
  id: string; // Generated hash of collectionItemId
  collectionItemId: number; // Discogs collection instance ID (CollectionItem.id)
  releaseId: number; // Discogs release ID (for lookups)
  masterId?: number; // Discogs master ID (for grouping pressings)
  artist: string;
  title: string;
  coverImage?: string;
  format?: string[]; // ["Vinyl", "LP", "Album"]
  year?: number;
  reason: DiscardReason;
  reasonNote?: string; // Custom note for 'other' reason
  rating?: number; // Original rating from collection
  addedAt: number; // When added to discard pile (timestamp)
  status: DiscardStatus;
  statusChangedAt: number; // When status last changed (initialize to addedAt)
  estimatedValue?: number; // User's estimate
  actualSalePrice?: number; // What it actually sold for
  currency: string; // ISO currency code (e.g., 'USD', 'EUR', 'GBP')
  marketplaceUrl?: string; // Link if listed for sale (Discogs, eBay, etc.)
  notes?: string; // General notes
  orphaned: boolean; // True if no longer in collection (sold/removed externally)
}

/**
 * Versioned store for discard pile items
 */
export interface DiscardPileStore extends VersionedStore {
  schemaVersion: 1;
  items: DiscardPileItem[];
  lastUpdated: number;
}

/**
 * Aggregated statistics for discard pile
 */
export interface DiscardPileStats {
  totalItems: number;
  byStatus: Record<DiscardStatus, number>;
  byReason: Record<DiscardReason, number>;
  totalEstimatedValue: number;
  totalActualSales: number;
  currency: string; // Primary currency for totals
}

/**
 * Request DTO for adding item to discard pile
 */
export interface AddDiscardPileItemRequest {
  collectionItemId: number; // Required: Discogs collection instance ID
  releaseId: number; // Required: Discogs release ID
  masterId?: number;
  artist: string;
  title: string;
  coverImage?: string;
  format?: string[];
  year?: number;
  reason: DiscardReason;
  reasonNote?: string;
  rating?: number;
  estimatedValue?: number;
  currency?: string; // Defaults to 'USD' if not provided
  notes?: string;
}

/**
 * Request DTO for updating discard pile item
 */
export interface UpdateDiscardPileItemRequest {
  reason?: DiscardReason;
  reasonNote?: string;
  status?: DiscardStatus;
  estimatedValue?: number;
  actualSalePrice?: number;
  currency?: string;
  marketplaceUrl?: string;
  notes?: string;
}

// ============================================
// Album Play Count Batch Types (Feature 8)
// ============================================

/**
 * Single album identifier for batch play count lookup
 */
export interface AlbumIdentifier {
  artist: string;
  title: string;
}

/**
 * Request body for batch album play count endpoint
 */
export interface AlbumPlayCountRequest {
  albums: AlbumIdentifier[];
}

/**
 * Play count result for a single album
 */
export interface AlbumPlayCountResult {
  artist: string;
  title: string;
  playCount: number;
  lastPlayed: number | null; // Unix timestamp (seconds) or null if never played
  matchType: 'exact' | 'fuzzy' | 'none';
}

/**
 * Response from batch album play count endpoint
 */
export interface AlbumPlayCountResponse {
  results: AlbumPlayCountResult[];
}
