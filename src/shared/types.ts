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

export interface CollectionItem {
  id: number;
  release: DiscogsRelease;
  folder_id?: number;
  date_added: string;
  rating?: number;
  notes?: any[];
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
}

/**
 * Item being watched for vinyl availability
 */
export interface VinylWatchItem {
  masterId: number;
  artist: string;
  title: string;
  coverImage?: string;
  addedAt: number; // Unix timestamp when added to watch list
  lastChecked?: number; // Unix timestamp of last availability check
  notified: boolean; // Whether user was notified of vinyl availability
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
 * Stored vinyl watch list
 */
export interface VinylWatchStore {
  schemaVersion: 1;
  items: VinylWatchItem[];
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
