import crypto from 'crypto';

import {
  ArtistDisambiguationStatus,
  ArtistMbidMapping,
  ArtistMbidMappingsStore,
  CollectionArtist,
  CollectionArtistsCacheStore,
  MusicBrainzArtistMatch,
  MusicBrainzRelease,
  PendingDisambiguationsStore,
  ReleaseTrackingSettings,
  ReleaseTrackingSyncStatus,
  ReleaseSyncStatusStore,
  TrackedRelease,
  TrackedReleasesStore,
} from '../../shared/types';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

import { artistMappingService } from './artistMappingService';
import { DiscogsService } from './discogsService';
import { HiddenReleasesService } from './hiddenReleasesService';
import { MusicBrainzService } from './musicbrainzService';
import { WishlistService } from './wishlistService';

// Cache and cleanup settings
const COLLECTION_ARTISTS_CACHE_HOURS = 24;
const TRACKED_RELEASES_CACHE_DAYS = 7;
const DISAMBIGUATION_CLEANUP_DAYS = 30;
const AUTO_MATCH_THRESHOLD = 95; // Score threshold for auto-matching artists

// File paths
const ARTIST_MAPPINGS_FILE = 'releases/artist-mbid-map.json';
const TRACKED_RELEASES_FILE = 'releases/tracked-releases.json';
const SYNC_STATUS_FILE = 'releases/sync-status.json';
const SETTINGS_FILE = 'releases/settings.json';
const PENDING_DISAMBIGUATIONS_FILE = 'releases/pending-disambiguations.json';
const COLLECTION_ARTISTS_CACHE_FILE = 'releases/collection-artists-cache.json';

export class ReleaseTrackingService {
  private fileStorage: FileStorage;
  private discogsService: DiscogsService;
  private musicBrainzService: MusicBrainzService;
  private wishlistService: WishlistService;
  private hiddenReleasesService?: HiddenReleasesService;
  private logger = createLogger('ReleaseTrackingService');

  // Sync state
  private syncInProgress = false;

  constructor(
    fileStorage: FileStorage,
    discogsService: DiscogsService,
    musicBrainzService: MusicBrainzService,
    wishlistService: WishlistService,
    hiddenReleasesService?: HiddenReleasesService
  ) {
    this.fileStorage = fileStorage;
    this.discogsService = discogsService;
    this.musicBrainzService = musicBrainzService;
    this.wishlistService = wishlistService;
    this.hiddenReleasesService = hiddenReleasesService;
  }

  // ============================================
  // Artist Name Normalization
  // ============================================

  /**
   * Normalize artist name for consistent comparison
   */
  normalizeArtistName(name: string): string {
    return (
      name
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
        // Remove common prefixes like "The"
        .replace(/^the\s+/i, '')
        // Remove special characters (but keep alphanumeric and spaces)
        .replace(/[^\w\s]/g, '')
        .trim()
    );
  }

  /**
   * Normalize title for comparison (doesn't strip "The" prefix)
   */
  private normalizeTitle(name: string): string {
    return (
      name
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
        // Remove special characters (but keep alphanumeric and spaces)
        .replace(/[^\w\s]/g, '')
        .trim()
    );
  }

  /**
   * Generate a unique ID for disambiguation requests
   */
  private generateDisambiguationId(artistName: string): string {
    return crypto
      .createHash('md5')
      .update(this.normalizeArtistName(artistName) + Date.now())
      .digest('hex')
      .substring(0, 12);
  }

  // ============================================
  // Settings Management
  // ============================================

  /**
   * Get release tracking settings with defaults
   */
  async getSettings(): Promise<ReleaseTrackingSettings> {
    try {
      const settings =
        await this.fileStorage.readJSON<ReleaseTrackingSettings>(SETTINGS_FILE);

      if (settings && settings.schemaVersion === 1) {
        return settings;
      }
    } catch {
      this.logger.debug('No settings file found, using defaults');
    }

    // Return defaults
    return {
      schemaVersion: 1,
      autoCheckOnStartup: false,
      checkFrequencyDays: 7,
      notifyOnNewRelease: true,
      includeEps: true,
      includeSingles: false,
      includeCompilations: false,
    };
  }

  /**
   * Save release tracking settings
   */
  async saveSettings(
    settings: Partial<ReleaseTrackingSettings>
  ): Promise<ReleaseTrackingSettings> {
    const current = await this.getSettings();
    const updated: ReleaseTrackingSettings = {
      ...current,
      ...settings,
      schemaVersion: 1,
    };

    await this.fileStorage.writeJSON(SETTINGS_FILE, updated);
    this.logger.info('Release tracking settings saved');
    return updated;
  }

  // ============================================
  // Sync Status Management
  // ============================================

  /**
   * Get current sync status
   */
  async getSyncStatus(): Promise<ReleaseTrackingSyncStatus> {
    try {
      const store =
        await this.fileStorage.readJSON<ReleaseSyncStatusStore>(
          SYNC_STATUS_FILE
        );

      if (store && store.schemaVersion === 1) {
        return store.status;
      }
    } catch {
      // No status file
    }

    return {
      status: 'idle',
      lastSync: null,
      artistsProcessed: 0,
      totalArtists: 0,
      releasesFound: 0,
      pendingDisambiguations: 0,
      progress: 0,
    };
  }

  /**
   * Update sync status
   */
  private async updateSyncStatus(
    update: Partial<ReleaseTrackingSyncStatus>
  ): Promise<void> {
    const current = await this.getSyncStatus();
    const updated = { ...current, ...update };

    const store: ReleaseSyncStatusStore = {
      schemaVersion: 1,
      status: updated,
    };

    await this.fileStorage.writeJSON(SYNC_STATUS_FILE, store);
  }

  // ============================================
  // Artist MBID Mappings
  // ============================================

  /**
   * Get all artist MBID mappings
   */
  async getArtistMappings(): Promise<ArtistMbidMapping[]> {
    try {
      const store =
        await this.fileStorage.readJSON<ArtistMbidMappingsStore>(
          ARTIST_MAPPINGS_FILE
        );

      if (store && store.schemaVersion === 1) {
        return store.mappings;
      }
    } catch {
      this.logger.debug('No artist mappings file found');
    }

    return [];
  }

  /**
   * Find a mapping for an artist by normalized name
   */
  async findArtistMapping(
    artistName: string
  ): Promise<ArtistMbidMapping | null> {
    const normalized = this.normalizeArtistName(artistName);
    const mappings = await this.getArtistMappings();
    return mappings.find(m => m.normalizedName === normalized) || null;
  }

  /**
   * Add or update an artist MBID mapping
   */
  async setArtistMapping(
    artistName: string,
    mbid: string | null,
    confirmedBy: 'auto' | 'user'
  ): Promise<ArtistMbidMapping> {
    const mappings = await this.getArtistMappings();
    const normalized = this.normalizeArtistName(artistName);

    // Find existing or create new
    let mapping = mappings.find(m => m.normalizedName === normalized);

    if (mapping) {
      // Update existing
      mapping.mbid = mbid;
      mapping.confirmedAt = Date.now();
      mapping.confirmedBy = confirmedBy;
    } else {
      // Create new
      mapping = {
        discogsArtistName: artistName,
        normalizedName: normalized,
        mbid,
        confirmedAt: Date.now(),
        confirmedBy,
      };
      mappings.push(mapping);
    }

    const store: ArtistMbidMappingsStore = {
      schemaVersion: 1,
      mappings,
    };

    await this.fileStorage.writeJSON(ARTIST_MAPPINGS_FILE, store);
    this.logger.info(`Artist mapping saved: ${artistName} -> ${mbid}`);

    return mapping;
  }

  /**
   * Remove an artist mapping
   */
  async removeArtistMapping(artistName: string): Promise<boolean> {
    const mappings = await this.getArtistMappings();
    const normalized = this.normalizeArtistName(artistName);
    const index = mappings.findIndex(m => m.normalizedName === normalized);

    if (index === -1) {
      return false;
    }

    mappings.splice(index, 1);

    const store: ArtistMbidMappingsStore = {
      schemaVersion: 1,
      mappings,
    };

    await this.fileStorage.writeJSON(ARTIST_MAPPINGS_FILE, store);
    this.logger.info(`Artist mapping removed: ${artistName}`);

    return true;
  }

  // ============================================
  // Pending Disambiguations
  // ============================================

  /**
   * Get all pending disambiguations
   */
  async getPendingDisambiguations(): Promise<ArtistDisambiguationStatus[]> {
    try {
      const store =
        await this.fileStorage.readJSON<PendingDisambiguationsStore>(
          PENDING_DISAMBIGUATIONS_FILE
        );

      if (store && store.schemaVersion === 1) {
        // Filter to only pending ones
        return store.pending.filter(d => d.status === 'pending');
      }
    } catch {
      this.logger.debug('No pending disambiguations file found');
    }

    return [];
  }

  /**
   * Get a specific disambiguation by ID
   */
  async getDisambiguation(
    id: string
  ): Promise<ArtistDisambiguationStatus | null> {
    try {
      const store =
        await this.fileStorage.readJSON<PendingDisambiguationsStore>(
          PENDING_DISAMBIGUATIONS_FILE
        );

      if (store && store.schemaVersion === 1) {
        return store.pending.find(d => d.id === id) || null;
      }
    } catch {
      this.logger.debug('No pending disambiguations file found');
    }

    return null;
  }

  /**
   * Create a new disambiguation request
   */
  async createDisambiguation(
    artistName: string,
    candidates: MusicBrainzArtistMatch[]
  ): Promise<ArtistDisambiguationStatus> {
    const store = (await this.fileStorage.readJSON<PendingDisambiguationsStore>(
      PENDING_DISAMBIGUATIONS_FILE
    )) || { schemaVersion: 1, pending: [] };

    const normalized = this.normalizeArtistName(artistName);

    // Check if already pending
    const existing = store.pending.find(
      d => d.normalizedName === normalized && d.status === 'pending'
    );

    if (existing) {
      // Update candidates
      existing.candidates = candidates;
      await this.fileStorage.writeJSON(PENDING_DISAMBIGUATIONS_FILE, store);
      return existing;
    }

    // Create new
    const disambiguation: ArtistDisambiguationStatus = {
      id: this.generateDisambiguationId(artistName),
      artistName,
      normalizedName: normalized,
      status: 'pending',
      candidates,
      createdAt: Date.now(),
    };

    store.pending.push(disambiguation);
    await this.fileStorage.writeJSON(PENDING_DISAMBIGUATIONS_FILE, store);

    this.logger.info(`Created disambiguation request for: ${artistName}`);
    return disambiguation;
  }

  /**
   * Resolve a disambiguation (user selected an artist or "none of these")
   */
  async resolveDisambiguation(
    id: string,
    selectedMbid: string | null
  ): Promise<ArtistDisambiguationStatus | null> {
    const store = await this.fileStorage.readJSON<PendingDisambiguationsStore>(
      PENDING_DISAMBIGUATIONS_FILE
    );

    if (!store) {
      return null;
    }

    const disambiguation = store.pending.find(d => d.id === id);
    if (!disambiguation) {
      return null;
    }

    disambiguation.status = 'resolved';
    disambiguation.selectedMbid = selectedMbid;
    disambiguation.resolvedAt = Date.now();

    await this.fileStorage.writeJSON(PENDING_DISAMBIGUATIONS_FILE, store);

    // Save the mapping
    await this.setArtistMapping(
      disambiguation.artistName,
      selectedMbid,
      'user'
    );

    this.logger.info(
      `Resolved disambiguation ${id}: ${disambiguation.artistName} -> ${selectedMbid}`
    );

    return disambiguation;
  }

  /**
   * Skip a disambiguation (user doesn't want to resolve it)
   * Persists a null mapping to prevent re-prompting on future syncs
   */
  async skipDisambiguation(id: string): Promise<boolean> {
    const store = await this.fileStorage.readJSON<PendingDisambiguationsStore>(
      PENDING_DISAMBIGUATIONS_FILE
    );

    if (!store) {
      return false;
    }

    const disambiguation = store.pending.find(d => d.id === id);
    if (!disambiguation) {
      return false;
    }

    disambiguation.status = 'skipped';
    disambiguation.resolvedAt = Date.now();

    await this.fileStorage.writeJSON(PENDING_DISAMBIGUATIONS_FILE, store);

    // Store a null mapping to prevent this artist from being prompted again
    await this.setArtistMapping(disambiguation.artistName, null, 'user');

    this.logger.info(`Skipped disambiguation: ${disambiguation.artistName}`);
    return true;
  }

  /**
   * Cleanup old resolved disambiguations (older than DISAMBIGUATION_CLEANUP_DAYS)
   */
  async cleanupOldDisambiguations(): Promise<number> {
    const store = await this.fileStorage.readJSON<PendingDisambiguationsStore>(
      PENDING_DISAMBIGUATIONS_FILE
    );

    if (!store) {
      return 0;
    }

    const cutoff =
      Date.now() - DISAMBIGUATION_CLEANUP_DAYS * 24 * 60 * 60 * 1000;
    const originalLength = store.pending.length;

    store.pending = store.pending.filter(d => {
      // Keep pending items and recently resolved items
      if (d.status === 'pending') return true;
      if (d.resolvedAt && d.resolvedAt > cutoff) return true;
      return false;
    });

    const removedCount = originalLength - store.pending.length;

    if (removedCount > 0) {
      await this.fileStorage.writeJSON(PENDING_DISAMBIGUATIONS_FILE, store);
      this.logger.info(`Cleaned up ${removedCount} old disambiguations`);
    }

    return removedCount;
  }

  // ============================================
  // Collection Artists Cache
  // ============================================

  /**
   * Get cached collection artists or fetch fresh
   */
  async getCollectionArtists(
    username: string,
    forceRefresh = false
  ): Promise<CollectionArtist[]> {
    if (!forceRefresh) {
      try {
        const cache =
          await this.fileStorage.readJSON<CollectionArtistsCacheStore>(
            COLLECTION_ARTISTS_CACHE_FILE
          );

        if (cache && cache.schemaVersion === 1) {
          const cacheAge = Date.now() - cache.fetchedAt;
          const maxAge = COLLECTION_ARTISTS_CACHE_HOURS * 60 * 60 * 1000;

          if (cacheAge < maxAge) {
            this.logger.debug(
              `Using cached collection artists (${cache.artists.length} artists)`
            );
            return cache.artists;
          }
        }
      } catch {
        this.logger.debug('No collection artists cache found');
      }
    }

    // Fetch fresh from collection
    return this.refreshCollectionArtistsCache(username);
  }

  /**
   * Refresh the collection artists cache from Discogs
   */
  private async refreshCollectionArtistsCache(
    username: string
  ): Promise<CollectionArtist[]> {
    this.logger.info(`Refreshing collection artists cache for ${username}`);

    const artistMap = new Map<string, CollectionArtist>();
    let page = 1;
    let totalPages = 1;

    // Fetch all collection pages
    while (page <= totalPages) {
      const response = await this.discogsService.getUserCollection(
        username,
        page,
        100
      );

      if (!response.success || !response.data) {
        break;
      }

      totalPages = response.pagination?.pages || 1;

      // Extract artists from releases
      for (const item of response.data) {
        const artistString = item.release.artist;
        // Handle multiple artists (e.g., "Artist 1, Artist 2")
        const artistNames = artistString.split(
          /,\s*|&\s*|\s+featuring\s+|\s+feat\.?\s+/i
        );

        for (const name of artistNames) {
          const trimmed = name.trim();
          if (!trimmed || trimmed.toLowerCase() === 'various') continue;

          const normalized = this.normalizeArtistName(trimmed);
          if (!artistMap.has(normalized)) {
            artistMap.set(normalized, {
              name: trimmed,
              normalizedName: normalized,
            });
          }
        }
      }

      page++;
    }

    const artists = Array.from(artistMap.values());

    // Save to cache
    const cache: CollectionArtistsCacheStore = {
      schemaVersion: 1,
      fetchedAt: Date.now(),
      artists,
    };

    await this.fileStorage.writeJSON(COLLECTION_ARTISTS_CACHE_FILE, cache);
    this.logger.info(`Cached ${artists.length} unique collection artists`);

    return artists;
  }

  // ============================================
  // Tracked Releases
  // ============================================

  /**
   * Get tracked releases
   */
  async getTrackedReleases(): Promise<TrackedRelease[]> {
    try {
      const store = await this.fileStorage.readJSON<TrackedReleasesStore>(
        TRACKED_RELEASES_FILE
      );

      if (store && store.schemaVersion === 1) {
        return store.releases;
      }
    } catch {
      this.logger.debug('No tracked releases file found');
    }

    return [];
  }

  /**
   * Check if tracked releases cache is stale
   */
  async isTrackedReleasesCacheStale(): Promise<boolean> {
    try {
      const store = await this.fileStorage.readJSON<TrackedReleasesStore>(
        TRACKED_RELEASES_FILE
      );

      if (!store || store.schemaVersion !== 1) {
        return true;
      }

      const cacheAge = Date.now() - store.lastUpdated;
      const maxAge = TRACKED_RELEASES_CACHE_DAYS * 24 * 60 * 60 * 1000;
      return cacheAge > maxAge;
    } catch {
      return true;
    }
  }

  /**
   * Save tracked releases
   */
  private async saveTrackedReleases(releases: TrackedRelease[]): Promise<void> {
    const store: TrackedReleasesStore = {
      schemaVersion: 1,
      lastUpdated: Date.now(),
      releases,
    };

    await this.fileStorage.writeJSON(TRACKED_RELEASES_FILE, store);
  }

  /**
   * Convert MusicBrainz release to tracked release
   */
  private toTrackedRelease(
    mbRelease: MusicBrainzRelease,
    coverArtUrl?: string
  ): TrackedRelease {
    const now = new Date();
    let isUpcoming = false;

    if (mbRelease.releaseDate) {
      const releaseDate = new Date(mbRelease.releaseDate);
      isUpcoming = releaseDate > now;
    }

    return {
      mbid: mbRelease.mbid,
      title: mbRelease.title,
      artistName: mbRelease.artistName,
      artistMbid: mbRelease.artistMbid,
      releaseDate: mbRelease.releaseDate,
      releaseType: mbRelease.releaseType,
      coverArtUrl,
      vinylStatus: 'unknown',
      firstSeen: Date.now(),
      isUpcoming,
      inWishlist: false,
    };
  }

  // ============================================
  // Main Sync Flow
  // ============================================

  /**
   * Sync releases for all artists in collection
   */
  async syncReleases(username: string): Promise<ReleaseTrackingSyncStatus> {
    if (this.syncInProgress) {
      this.logger.warn('Sync already in progress');
      return this.getSyncStatus();
    }

    this.syncInProgress = true;
    this.logger.info(`Starting release sync for ${username}`);

    // Timing for ETA calculation
    const syncStartTime = Date.now();

    try {
      // Initialize sync status
      await this.updateSyncStatus({
        status: 'syncing',
        artistsProcessed: 0,
        totalArtists: 0,
        releasesFound: 0,
        pendingDisambiguations: 0,
        progress: 0,
        currentArtist: undefined,
        estimatedTimeRemaining: undefined,
        error: undefined,
      });

      // Get settings
      const settings = await this.getSettings();

      // Build release type filter
      const releaseTypes: Array<'album' | 'ep' | 'single' | 'compilation'> = [
        'album',
      ];
      if (settings.includeEps) releaseTypes.push('ep');
      if (settings.includeSingles) releaseTypes.push('single');
      if (settings.includeCompilations) releaseTypes.push('compilation');

      // Get collection artists
      let artists = await this.getCollectionArtists(username);

      // Filter out excluded artists
      if (this.hiddenReleasesService) {
        const excludedArtists =
          await this.hiddenReleasesService.getAllExcludedArtists();
        const excludedNames = new Set(
          excludedArtists.map(a => a.normalizedName)
        );
        const beforeCount = artists.length;
        artists = artists.filter(a => !excludedNames.has(a.normalizedName));
        const excludedCount = beforeCount - artists.length;
        if (excludedCount > 0) {
          this.logger.info(`Skipping ${excludedCount} excluded artists`);
        }
      }

      const totalArtists = artists.length;

      await this.updateSyncStatus({ totalArtists });

      // Load existing tracked releases and mappings
      const existingReleases = await this.getTrackedReleases();
      const existingMbids = new Set(existingReleases.map(r => r.mbid));
      const mappings = await this.getArtistMappings();
      const mappingsByNormalized = new Map(
        mappings.map(m => [m.normalizedName, m])
      );

      const newReleases: TrackedRelease[] = [];
      let artistsProcessed = 0;
      let pendingDisambiguations = 0;

      // Helper to calculate progress and ETA
      const calculateProgress = (
        processed: number
      ): { progress: number; estimatedTimeRemaining?: number } => {
        const progress =
          totalArtists > 0 ? Math.round((processed / totalArtists) * 100) : 0;
        let estimatedTimeRemaining: number | undefined;

        if (processed > 0 && processed < totalArtists) {
          const elapsedMs = Date.now() - syncStartTime;
          const avgTimePerArtist = elapsedMs / processed;
          const remainingArtists = totalArtists - processed;
          estimatedTimeRemaining = Math.round(
            (remainingArtists * avgTimePerArtist) / 1000
          );
        }

        return { progress, estimatedTimeRemaining };
      };

      // Process each artist
      for (const artist of artists) {
        try {
          // Update current artist being processed
          await this.updateSyncStatus({
            currentArtist: artist.name,
            ...calculateProgress(artistsProcessed),
          });

          // Check for existing mapping
          let mapping = mappingsByNormalized.get(artist.normalizedName);

          if (!mapping) {
            // Use Last.fm name mapping if available (cleaner names without Discogs disambiguation)
            // e.g., "Tool (2)" -> "Tool", "Discovery (7)" -> "Discovery"
            const searchName = artistMappingService.getLastfmName(artist.name);
            if (searchName !== artist.name) {
              this.logger.debug(
                `Using Last.fm name for search: "${artist.name}" -> "${searchName}"`
              );
            }

            // Search MusicBrainz for this artist
            const candidates = await this.musicBrainzService.searchArtist(
              searchName,
              5
            );

            if (candidates.length === 0) {
              // No matches found - skip
              artistsProcessed++;
              await this.updateSyncStatus({
                artistsProcessed,
                ...calculateProgress(artistsProcessed),
              });
              continue;
            }

            // Check for auto-match (high confidence result with score >= 95)
            // Only auto-match if:
            // 1. Top result has score >= 95, AND
            // 2. Either it's the only result, or it's 10+ points ahead of second result
            if (
              candidates[0].score >= AUTO_MATCH_THRESHOLD &&
              (candidates.length === 1 ||
                candidates[0].score > (candidates[1]?.score || 0) + 10)
            ) {
              // Auto-match
              mapping = await this.setArtistMapping(
                artist.name,
                candidates[0].mbid,
                'auto'
              );
              this.logger.debug(
                `Auto-matched ${artist.name} -> ${candidates[0].mbid}`
              );
            } else {
              // Create disambiguation request
              await this.createDisambiguation(artist.name, candidates);
              pendingDisambiguations++;
              artistsProcessed++;
              await this.updateSyncStatus({
                artistsProcessed,
                pendingDisambiguations,
                ...calculateProgress(artistsProcessed),
              });
              continue;
            }
          }

          // If we have a mapping with null mbid, the user said "none of these"
          if (!mapping.mbid) {
            artistsProcessed++;
            await this.updateSyncStatus({
              artistsProcessed,
              ...calculateProgress(artistsProcessed),
            });
            continue;
          }

          // Fetch releases for this artist (3 months back per plan)
          const releases =
            await this.musicBrainzService.getRecentAndUpcomingReleases(
              mapping.mbid,
              3 // 3 months back
            );

          // Filter by type and find new ones
          for (const release of releases) {
            if (
              !(releaseTypes as ReadonlyArray<string>).includes(
                release.releaseType
              )
            ) {
              continue;
            }

            if (existingMbids.has(release.mbid)) {
              continue;
            }

            // It's new!
            const tracked = this.toTrackedRelease(release);
            newReleases.push(tracked);
            existingMbids.add(release.mbid);
          }

          artistsProcessed++;
          await this.updateSyncStatus({
            artistsProcessed,
            releasesFound: newReleases.length,
            ...calculateProgress(artistsProcessed),
          });
        } catch (error) {
          this.logger.warn(
            `Error processing artist ${artist.name}`,
            error instanceof Error ? error.message : 'Unknown error'
          );
          artistsProcessed++;
          await this.updateSyncStatus({
            artistsProcessed,
            ...calculateProgress(artistsProcessed),
          });
        }
      }

      // Merge and save releases
      const allReleases = [...existingReleases, ...newReleases];
      await this.saveTrackedReleases(allReleases);

      // Cleanup old disambiguations
      await this.cleanupOldDisambiguations();

      // Fetch cover art for new releases (async, don't wait)
      if (newReleases.length > 0) {
        this.logger.info(
          `Fetching cover art for ${newReleases.length} new releases`
        );
        // Run cover art fetch in background (don't await)
        this.fetchCoverArtForReleases(newReleases).catch(error => {
          this.logger.warn('Error fetching cover art:', error);
        });
      }

      // Final status
      await this.updateSyncStatus({
        status: 'completed',
        lastSync: Date.now(),
        artistsProcessed,
        releasesFound: newReleases.length,
        pendingDisambiguations,
        progress: 100,
        currentArtist: undefined,
        estimatedTimeRemaining: undefined,
      });

      this.logger.info(
        `Release sync completed: ${artistsProcessed} artists, ${newReleases.length} new releases, ${pendingDisambiguations} pending`
      );

      return this.getSyncStatus();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Release sync failed', error);

      await this.updateSyncStatus({
        status: 'error',
        error: errorMessage,
      });

      throw error;
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Fetch cover art for releases that are missing it
   */
  async fetchMissingCoverArt(): Promise<number> {
    const releases = await this.getTrackedReleases();
    const needsCoverArt = releases.filter(r => !r.coverArtUrl);

    if (needsCoverArt.length === 0) {
      return 0;
    }

    this.logger.info(`Fetching cover art for ${needsCoverArt.length} releases`);

    let updated = 0;
    for (const release of needsCoverArt) {
      const coverUrl = await this.musicBrainzService.getCoverArtUrl(
        release.mbid
      );
      if (coverUrl) {
        release.coverArtUrl = coverUrl;
        updated++;
      }
    }

    if (updated > 0) {
      await this.saveTrackedReleases(releases);
      this.logger.info(`Updated cover art for ${updated} releases`);
    }

    return updated;
  }

  /**
   * Fetch cover art for specific releases (used during sync)
   */
  private async fetchCoverArtForReleases(
    releases: TrackedRelease[]
  ): Promise<void> {
    const allReleases = await this.getTrackedReleases();
    const releaseMbids = new Set(releases.map(r => r.mbid));

    let updated = 0;
    for (const release of allReleases) {
      if (!releaseMbids.has(release.mbid) || release.coverArtUrl) {
        continue;
      }

      try {
        const coverUrl = await this.musicBrainzService.getCoverArtUrl(
          release.mbid
        );
        if (coverUrl) {
          release.coverArtUrl = coverUrl;
          updated++;
        }
      } catch (error) {
        // Skip cover art errors, not critical
        this.logger.debug(
          `Failed to fetch cover art for ${release.mbid}:`,
          error
        );
      }
    }

    if (updated > 0) {
      await this.saveTrackedReleases(allReleases);
      this.logger.info(`Fetched cover art for ${updated} new releases`);
    }
  }

  /**
   * Check vinyl availability for tracked releases via Discogs
   */
  async checkVinylAvailability(): Promise<number> {
    const releases = await this.getTrackedReleases();
    const needsCheck = releases.filter(
      r => r.vinylStatus === 'unknown' || r.vinylStatus === 'checking'
    );

    if (needsCheck.length === 0) {
      return 0;
    }

    this.logger.info(
      `Checking vinyl availability for ${needsCheck.length} releases`
    );

    let checkedCount = 0;

    for (const release of needsCheck) {
      try {
        release.vinylStatus = 'checking';

        // Search Discogs for this release
        const searchResults = await this.wishlistService.searchForRelease(
          release.artistName,
          release.title
        );

        if (searchResults.length === 0) {
          release.vinylStatus = 'not-found';
          checkedCount++;
          continue;
        }

        // Find best match by comparing artist name AND album title
        const normalizedArtist = this.normalizeArtistName(release.artistName);
        const normalizedTitle = this.normalizeTitle(release.title);
        let bestMatch: (typeof searchResults)[0] | null = null;
        let bestScore = 0;

        for (const result of searchResults) {
          const resultArtist = this.normalizeArtistName(result.artist);
          const resultTitle = this.normalizeTitle(result.title);

          let score = 0;
          if (resultArtist === normalizedArtist) score += 2;
          if (
            resultTitle === normalizedTitle ||
            resultTitle.includes(normalizedTitle) ||
            normalizedTitle.includes(resultTitle)
          )
            score += 1;

          if (score > bestScore && resultArtist === normalizedArtist) {
            bestScore = score;
            bestMatch = result;
          }
        }

        // If no good match found, mark as not-found
        if (!bestMatch) {
          release.vinylStatus = 'not-found';
          checkedCount++;
          continue;
        }

        // Check if any result has vinyl
        const masterId = bestMatch.masterId;
        const versions = await this.wishlistService.getMasterVersions(masterId);

        const hasVinyl = versions.some(v => v.hasVinyl);

        release.vinylStatus = hasVinyl ? 'available' : 'cd-only';
        release.discogsMasterId = masterId;
        release.discogsUrl = `https://www.discogs.com/master/${masterId}`;

        if (hasVinyl) {
          // Get price range
          const vinylVersions = versions.filter(
            v => v.hasVinyl && v.marketplaceStats
          );
          if (vinylVersions.length > 0) {
            const prices = vinylVersions
              .map(v => v.marketplaceStats?.lowestPrice)
              .filter((p): p is number => p !== undefined);

            if (prices.length > 0) {
              release.vinylPriceRange = {
                min: Math.min(...prices),
                max: Math.max(...prices),
                currency: vinylVersions[0].marketplaceStats?.currency || 'USD',
              };
            }
          }
        }

        checkedCount++;
      } catch (error) {
        this.logger.warn(
          `Error checking vinyl for ${release.artistName} - ${release.title}`,
          error instanceof Error ? error.message : 'Unknown error'
        );
        release.vinylStatus = 'unknown';
      }
    }

    await this.saveTrackedReleases(releases);
    this.logger.info(`Checked vinyl availability for ${checkedCount} releases`);

    return checkedCount;
  }

  /**
   * Check vinyl availability for a single release by MBID
   */
  async checkSingleReleaseVinyl(mbid: string): Promise<TrackedRelease | null> {
    const releases = await this.getTrackedReleases();
    const release = releases.find(r => r.mbid === mbid);

    if (!release) {
      this.logger.warn(`Release not found: ${mbid}`);
      return null;
    }

    this.logger.info(
      `Checking vinyl for: ${release.artistName} - ${release.title}`
    );

    try {
      release.vinylStatus = 'checking';

      // Search Discogs for this release using artist and title
      const searchResults = await this.wishlistService.searchForRelease(
        release.artistName,
        release.title
      );

      if (searchResults.length === 0) {
        release.vinylStatus = 'not-found';
        release.vinylCheckedAt = Date.now();
        await this.saveTrackedReleases(releases);
        return release;
      }

      // Find best match by comparing artist name AND album title
      const normalizedArtist = this.normalizeArtistName(release.artistName);
      const normalizedTitle = this.normalizeTitle(release.title);
      let bestMatch: (typeof searchResults)[0] | null = null;
      let bestScore = 0;

      for (const result of searchResults) {
        const resultArtist = this.normalizeArtistName(result.artist);
        const resultTitle = this.normalizeTitle(result.title);

        // Score: 2 points for artist match, 1 point for title match
        let score = 0;
        if (resultArtist === normalizedArtist) score += 2;
        if (
          resultTitle === normalizedTitle ||
          resultTitle.includes(normalizedTitle) ||
          normalizedTitle.includes(resultTitle)
        )
          score += 1;

        // Require at least artist match for consideration
        if (score > bestScore && resultArtist === normalizedArtist) {
          bestScore = score;
          bestMatch = result;
        }
      }

      // If no good match found, mark as not-found rather than using wrong result
      if (!bestMatch) {
        this.logger.warn(
          `No matching Discogs result for ${release.artistName} - ${release.title}`
        );
        release.vinylStatus = 'not-found';
        release.vinylCheckedAt = Date.now();
        await this.saveTrackedReleases(releases);
        return release;
      }

      // Check if any version has vinyl
      const masterId = bestMatch.masterId;
      const versions = await this.wishlistService.getMasterVersions(masterId);

      const hasVinyl = versions.some(v => v.hasVinyl);

      release.vinylStatus = hasVinyl ? 'available' : 'cd-only';
      release.discogsMasterId = masterId;
      release.discogsUrl = `https://www.discogs.com/master/${masterId}`;
      release.vinylCheckedAt = Date.now();

      if (hasVinyl) {
        // Get price range from vinyl versions
        const vinylVersions = versions.filter(
          v => v.hasVinyl && v.marketplaceStats
        );
        if (vinylVersions.length > 0) {
          const prices = vinylVersions
            .map(v => v.marketplaceStats?.lowestPrice)
            .filter((p): p is number => p !== undefined);

          if (prices.length > 0) {
            release.vinylPriceRange = {
              min: Math.min(...prices),
              max: Math.max(...prices),
              currency: vinylVersions[0].marketplaceStats?.currency || 'USD',
            };
          }
        }
      }

      await this.saveTrackedReleases(releases);
      this.logger.info(
        `Vinyl check complete for ${release.artistName} - ${release.title}: ${release.vinylStatus}`
      );

      return release;
    } catch (error) {
      this.logger.warn(
        `Error checking vinyl for ${release.artistName} - ${release.title}`,
        error instanceof Error ? error.message : 'Unknown error'
      );
      release.vinylStatus = 'unknown';
      await this.saveTrackedReleases(releases);
      return release;
    }
  }

  /**
   * Get releases filtered and sorted
   */
  async getFilteredReleases(options: {
    types?: Array<'album' | 'ep' | 'single' | 'compilation' | 'other'>;
    vinylOnly?: boolean;
    upcomingOnly?: boolean;
    artistMbid?: string;
    sortBy?: 'releaseDate' | 'artistName' | 'title' | 'firstSeen';
    sortOrder?: 'asc' | 'desc';
    limit?: number;
  }): Promise<TrackedRelease[]> {
    let releases = await this.getTrackedReleases();

    // Filter out releases from excluded artists
    if (this.hiddenReleasesService) {
      const excludedArtists =
        await this.hiddenReleasesService.getAllExcludedArtists();
      if (excludedArtists.length > 0) {
        const excludedNames = new Set(
          excludedArtists.map(a => a.normalizedName)
        );
        releases = releases.filter(r => {
          const normalizedName = this.normalizeArtistName(r.artistName);
          return !excludedNames.has(normalizedName);
        });
      }
    }

    // Filter by type
    if (options.types && options.types.length > 0) {
      releases = releases.filter(r => options.types!.includes(r.releaseType));
    }

    // Filter by vinyl availability
    if (options.vinylOnly) {
      releases = releases.filter(r => r.vinylStatus === 'available');
    }

    // Filter by upcoming
    if (options.upcomingOnly) {
      releases = releases.filter(r => r.isUpcoming);
    }

    // Filter by artist
    if (options.artistMbid) {
      releases = releases.filter(r => r.artistMbid === options.artistMbid);
    }

    // Sort
    const sortBy = options.sortBy || 'releaseDate';
    const sortOrder = options.sortOrder || 'desc';
    const multiplier = sortOrder === 'asc' ? 1 : -1;

    releases.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'releaseDate': {
          const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
          const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
          comparison = dateA - dateB;
          break;
        }
        case 'artistName':
          comparison = a.artistName.localeCompare(b.artistName);
          break;
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'firstSeen':
          comparison = a.firstSeen - b.firstSeen;
          break;
      }

      return comparison * multiplier;
    });

    // Limit
    if (options.limit && options.limit > 0) {
      releases = releases.slice(0, options.limit);
    }

    return releases;
  }

  /**
   * Add a release to the user's wishlist
   */
  async addToWishlist(mbid: string): Promise<boolean> {
    const releases = await this.getTrackedReleases();
    const release = releases.find(r => r.mbid === mbid);

    if (!release) {
      this.logger.warn(`Cannot add to wishlist: release ${mbid} not found`);
      return false;
    }

    try {
      // Search for the release on Discogs to get a release ID
      const searchResults = await this.wishlistService.searchForRelease(
        release.artistName,
        release.title
      );

      if (searchResults.length === 0) {
        this.logger.warn(
          `Cannot add to wishlist: no Discogs match for ${release.artistName} - ${release.title}`
        );
        return false;
      }

      // Find best match using same logic as vinyl check
      const normalizedArtist = this.normalizeArtistName(release.artistName);
      const normalizedTitle = this.normalizeTitle(release.title);
      let bestMatch = searchResults[0];

      for (const result of searchResults) {
        const resultArtist = this.normalizeArtistName(result.artist);
        const resultTitle = this.normalizeTitle(result.title);

        // Prefer exact artist match
        if (resultArtist === normalizedArtist) {
          // Check title match too
          if (
            resultTitle === normalizedTitle ||
            resultTitle.includes(normalizedTitle) ||
            normalizedTitle.includes(resultTitle)
          ) {
            bestMatch = result;
            break;
          }
          // Artist matches, use this if we haven't found a better one
          if (this.normalizeArtistName(bestMatch.artist) !== normalizedArtist) {
            bestMatch = result;
          }
        }
      }

      // Add to Discogs wantlist
      await this.wishlistService.addToDiscogsWantlist(
        bestMatch.releaseId,
        `Added from New Releases tracking`
      );

      // Mark as in wishlist and store Discogs ID if not already set
      release.inWishlist = true;
      if (!release.discogsMasterId) {
        release.discogsMasterId = bestMatch.masterId;
        release.discogsUrl = `https://www.discogs.com/master/${bestMatch.masterId}`;
      }
      await this.saveTrackedReleases(releases);

      this.logger.info(
        `Added ${release.artistName} - ${release.title} to wishlist`
      );
      return true;
    } catch (error) {
      this.logger.error('Error adding to wishlist', error);
      return false;
    }
  }

  /**
   * Search for an artist's MusicBrainz matches
   * Uses Last.fm name mapping if available for better search results
   */
  async searchArtist(name: string): Promise<MusicBrainzArtistMatch[]> {
    // Use Last.fm name mapping if available (cleaner names without Discogs disambiguation)
    const searchName = artistMappingService.getLastfmName(name);
    if (searchName !== name) {
      this.logger.debug(
        `Using Last.fm name for search: "${name}" -> "${searchName}"`
      );
    }
    return this.musicBrainzService.searchArtist(searchName);
  }
}
