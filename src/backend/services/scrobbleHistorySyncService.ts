import { EventEmitter } from 'events';

import axios, { AxiosInstance } from 'axios';

import {
  SyncStatus,
  SyncSettings,
  ScrobbleHistoryIndex,
  AlbumHistoryEntry,
} from '../../shared/types';
import { FileStorage } from '../utils/fileStorage';
import {
  buildIdentitySets,
  countListeningPlays,
  normalizeHistoryName,
  playIdentity,
  refreshEntryStats,
} from '../utils/historyPlays';
import { createLogger } from '../utils/logger';

import { AuthService } from './authService';
import { ScrobbleHistoryStorage } from './scrobbleHistoryStorage';

/**
 * Minimal interface for stats cache warming, used to avoid a circular import
 * between ScrobbleHistorySyncService and StatsService.
 */
export interface StatsCacheWarmer {
  warmCache(): Promise<void>;
  invalidateStatsCache(): Promise<void>;
}

// Last.fm API track response type
interface LastFmTrack {
  artist: { '#text': string } | string;
  album: { '#text': string } | string;
  name: string;
  date?: { uts: string };
  '@attr'?: { nowplaying: string };
}

const HISTORY_INDEX_FILE = 'history/scrobble-history-index.json';
const SYNC_SETTINGS_FILE = 'history/sync-settings.json';
const SCROBBLES_PER_PAGE = 200; // Last.fm max per page
/**
 * Incremental sync re-reads this many seconds before the watermark, so plays
 * sharing the watermark timestamp aren't missed; identity dedup absorbs the
 * overlap.
 */
const INCREMENTAL_OVERLAP_SECONDS = 300;

/** Where processScrobbles looks up identities it has already indexed */
interface IdentitySets {
  withAlbum: Set<string>;
  unresolved: Set<string>;
}

/** Result of processing one batch of scrobbles */
interface ProcessResult {
  /** New listening events added (album or unresolved) */
  processed: number;
  /** Of those, how many have no album */
  unresolved: number;
  /** Events already in the index, skipped */
  duplicatesSkipped: number;
  newestTimestamp: number;
}

export class ScrobbleHistorySyncService extends EventEmitter {
  private axios: AxiosInstance;
  private fileStorage: FileStorage;
  private authService: AuthService;
  private historyStorage: ScrobbleHistoryStorage | null = null;
  private statsWarmer: StatsCacheWarmer | null = null;
  private baseUrl = 'https://ws.audioscrobbler.com/2.0/';
  private logger = createLogger('ScrobbleHistorySyncService');

  private syncStatus: SyncStatus = {
    status: 'idle',
    progress: 0,
    currentPage: 0,
    totalPages: 0,
    scrobblesFetched: 0,
    totalScrobbles: 0,
  };

  private syncSettings: SyncSettings = {
    autoSyncOnStartup: true,
    syncPace: 'normal',
  };

  private isSyncing = false;
  private isPaused = false;
  private syncAbortController: AbortController | null = null;

  constructor(
    fileStorage: FileStorage,
    authService: AuthService,
    historyStorage?: ScrobbleHistoryStorage
  ) {
    super();
    this.fileStorage = fileStorage;
    this.authService = authService;
    this.historyStorage = historyStorage || null;

    this.axios = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
    });

    // Load sync settings on init
    this.loadSyncSettings();
  }

  /**
   * Tear down the service, removing all listeners and aborting any in-flight sync.
   */
  destroy(): void {
    this.removeAllListeners();
    if (this.syncAbortController) {
      this.syncAbortController.abort();
    }
  }

  /**
   * Set the history storage instance for cache invalidation
   */
  setHistoryStorage(historyStorage: ScrobbleHistoryStorage): void {
    this.historyStorage = historyStorage;
  }

  /**
   * Set the stats cache warmer (StatsService).
   * Called from server.ts after both services are constructed to avoid circular imports.
   * After each successful sync, warmCache() is triggered asynchronously.
   */
  setStatsWarmer(warmer: StatsCacheWarmer): void {
    this.statsWarmer = warmer;
  }

  /**
   * Trigger async cache warm after sync — fire-and-forget, errors are swallowed
   * by warmCache() itself so they don't affect the sync result.
   */
  private triggerCacheWarm(): void {
    if (!this.statsWarmer) {
      return;
    }
    // Run async without blocking — warmCache() already logs its own errors
    this.statsWarmer.warmCache().catch(err => {
      this.logger.error('Failed to trigger stats cache warm after sync', err);
    });
  }

  /**
   * Save index and invalidate storage cache so stats are fresh.
   * totalScrobbles is recomputed from the stored plays so it can't drift.
   */
  private async saveIndex(index: ScrobbleHistoryIndex): Promise<void> {
    index.unresolved ??= {};
    index.totalScrobbles = countListeningPlays(index);
    await this.fileStorage.writeJSON(HISTORY_INDEX_FILE, index);
    // Invalidate the storage cache so getStorageStats returns fresh data
    if (this.historyStorage) {
      this.historyStorage.invalidateCache();
    }
  }

  private async loadSyncSettings(): Promise<void> {
    try {
      const settings =
        await this.fileStorage.readJSON<SyncSettings>(SYNC_SETTINGS_FILE);
      if (settings) {
        this.syncSettings = settings;
      }
    } catch {
      this.logger.debug('No sync settings found, using defaults');
    }
  }

  async saveSyncSettings(settings: Partial<SyncSettings>): Promise<void> {
    this.syncSettings = { ...this.syncSettings, ...settings };
    await this.fileStorage.writeJSONWithBackup(
      SYNC_SETTINGS_FILE,
      this.syncSettings
    );
  }

  getSyncSettings(): SyncSettings {
    return { ...this.syncSettings };
  }

  getSyncStatus(): SyncStatus {
    return { ...this.syncStatus };
  }

  /**
   * Normalize artist|album key for consistent matching
   */
  private normalizeKey(artist: string, album: string): string {
    return `${artist.toLowerCase().trim()}|${album.toLowerCase().trim()}`;
  }

  /**
   * Get delay between requests based on sync pace
   */
  private getRequestDelay(): number {
    switch (this.syncSettings.syncPace) {
      case 'fast':
        return 334; // ~3 requests/second
      case 'slow':
        return 2000; // 0.5 requests/second
      case 'normal':
      default:
        return 1000; // 1 request/second
    }
  }

  /**
   * Fetch a single page of scrobbles from Last.fm
   */
  private async fetchScrobblePage(page: number): Promise<{
    tracks: LastFmTrack[];
    totalPages: number;
    totalScrobbles: number;
  }> {
    const credentials = await this.authService.getLastFmCredentials();
    if (!credentials.apiKey || !credentials.username) {
      throw new Error('Last.fm credentials not configured');
    }

    const response = await this.axios.get('', {
      params: {
        method: 'user.getRecentTracks',
        api_key: credentials.apiKey,
        user: credentials.username,
        limit: SCROBBLES_PER_PAGE,
        page,
        format: 'json',
        extended: 0,
      },
    });

    if (response.data.error) {
      throw new Error(
        response.data.message || `Failed to fetch scrobbles page ${page}`
      );
    }

    const recentTracks = response.data.recenttracks;
    const attr = recentTracks['@attr'] || {};

    return {
      tracks: recentTracks.track || [],
      totalPages: parseInt(attr.totalPages || '1', 10),
      totalScrobbles: parseInt(attr.total || '0', 10),
    };
  }

  /**
   * Add a batch of scrobbles to the index.
   *
   * A valid event has an artist, a track and a timestamp; the album is
   * optional. Events without an album go to `index.unresolved`. Each event's
   * identity (timestamp + artist + track) is added once across both stores:
   * events already indexed are skipped (so re-reading a window, e.g. after a
   * backdated scrobble lowers the watermark, adds nothing), and an event that
   * now has an album replaces its unresolved copy.
   */
  private processScrobbles(
    tracks: LastFmTrack[],
    index: ScrobbleHistoryIndex,
    identities: IdentitySets
  ): ProcessResult {
    const result: ProcessResult = {
      processed: 0,
      unresolved: 0,
      duplicatesSkipped: 0,
      newestTimestamp: 0,
    };
    index.unresolved ??= {};

    for (const track of tracks) {
      // Skip currently playing tracks (they don't have a date)
      if (track['@attr']?.nowplaying === 'true') {
        continue;
      }

      const artist =
        typeof track.artist === 'object' ? track.artist['#text'] : track.artist;
      const album = (
        typeof track.album === 'object'
          ? track.album['#text']
          : track.album || ''
      ).trim();
      const trackName = track.name;
      const timestamp = parseInt(track.date?.uts || '0', 10);

      if (!artist?.trim() || !trackName?.trim() || !timestamp) {
        continue;
      }

      // Track newest timestamp seen for accurate lastSyncTimestamp
      if (timestamp > result.newestTimestamp) {
        result.newestTimestamp = timestamp;
      }

      const id = playIdentity(timestamp, artist, trackName);
      if (identities.withAlbum.has(id)) {
        result.duplicatesSkipped++;
        continue;
      }

      if (!album) {
        if (identities.unresolved.has(id)) {
          result.duplicatesSkipped++;
          continue;
        }
        const artistKey = normalizeHistoryName(artist);
        const entry = (index.unresolved[artistKey] ??= {
          lastPlayed: timestamp,
          playCount: 0,
          plays: [],
        });
        entry.plays.push({ timestamp, track: trackName });
        entry.playCount++;
        if (timestamp > entry.lastPlayed) entry.lastPlayed = timestamp;
        identities.unresolved.add(id);
        result.unresolved++;
      } else {
        // An album copy wins over an unresolved copy of the same event
        const replacesUnresolved = identities.unresolved.has(id);
        if (replacesUnresolved) {
          this.removeUnresolvedPlay(index, artist, timestamp, trackName);
          identities.unresolved.delete(id);
        }

        const key = this.normalizeKey(artist, album);
        const entry = (index.albums[key] ??= {
          lastPlayed: timestamp,
          playCount: 0,
          plays: [],
        });
        entry.playCount++;
        entry.plays.push({ timestamp, track: trackName });
        if (timestamp > entry.lastPlayed) entry.lastPlayed = timestamp;
        identities.withAlbum.add(id);

        // Moving an event between stores doesn't add a listening event
        if (replacesUnresolved) {
          result.duplicatesSkipped++;
          continue;
        }
      }

      // Track oldest scrobble
      if (
        timestamp < index.oldestScrobbleDate ||
        index.oldestScrobbleDate === 0
      ) {
        index.oldestScrobbleDate = timestamp;
      }

      result.processed++;
    }

    return result;
  }

  /** Remove one unresolved play (by identity), e.g. when it gains an album. */
  private removeUnresolvedPlay(
    index: ScrobbleHistoryIndex,
    artist: string,
    timestamp: number,
    trackName: string
  ): void {
    const artistKey = normalizeHistoryName(artist);
    const entry = index.unresolved?.[artistKey];
    if (!entry) return;
    const id = playIdentity(timestamp, artist, trackName);
    entry.plays = entry.plays.filter(
      play => playIdentity(play.timestamp, artistKey, play.track) !== id
    );
    if (entry.plays.length === 0) {
      delete index.unresolved![artistKey];
    } else {
      refreshEntryStats(entry);
    }
  }

  /** Record the scrobble total Last.fm reported for this account. */
  private recordLastfmTotal(index: ScrobbleHistoryIndex, total: number): void {
    if (total > 0) {
      index.lastfmTotal = total;
      index.lastfmTotalCheckedAt = Date.now();
    }
  }

  /**
   * Start a full sync of all scrobble history
   */
  async startFullSync(): Promise<void> {
    if (this.isSyncing) {
      this.logger.warn('Sync already in progress');
      return;
    }

    this.logger.info('Starting full scrobble history sync');
    this.isSyncing = true;
    this.isPaused = false;
    this.syncAbortController = new AbortController();

    // Invalidate stale overview cache at sync start so reads fall back to live computation
    if (this.statsWarmer) {
      this.statsWarmer.invalidateStatsCache().catch(err => {
        this.logger.error(
          'Failed to invalidate stats cache before full sync',
          err
        );
      });
    }

    const index: ScrobbleHistoryIndex = {
      lastSyncTimestamp: Date.now(),
      totalScrobbles: 0,
      oldestScrobbleDate: 0,
      albums: {},
      unresolved: {},
      schemaVersion: 2,
    };
    const identities: IdentitySets = {
      withAlbum: new Set(),
      unresolved: new Set(),
    };

    try {
      // First fetch to get total pages
      const firstPage = await this.fetchScrobblePage(1);
      const totalPages = firstPage.totalPages;
      const totalScrobbles = firstPage.totalScrobbles;
      this.recordLastfmTotal(index, totalScrobbles);

      this.syncStatus = {
        status: 'syncing',
        progress: 0,
        currentPage: 1,
        totalPages,
        scrobblesFetched: 0,
        totalScrobbles,
      };
      this.emit('statusChange', this.syncStatus);

      // Track the newest scrobble timestamp found (for accurate lastSyncTimestamp)
      let newestScrobbleTimestamp = 0;

      // Process first page
      const firstResult = this.processScrobbles(
        firstPage.tracks,
        index,
        identities
      );
      let processedCount = firstResult.processed;
      let unresolvedCount = firstResult.unresolved;
      if (firstResult.newestTimestamp > newestScrobbleTimestamp) {
        newestScrobbleTimestamp = firstResult.newestTimestamp;
      }
      index.totalScrobbles = processedCount;

      this.syncStatus.scrobblesFetched = processedCount;
      this.syncStatus.progress = Math.round((1 / totalPages) * 100);
      this.emit('statusChange', this.syncStatus);

      // Save after first page so suggestions can work with recent data
      // Use the newest scrobble timestamp (in ms) for accurate sync tracking
      index.lastSyncTimestamp = newestScrobbleTimestamp * 1000;
      await this.saveIndex(index);

      // Fetch remaining pages
      for (let page = 2; page <= totalPages; page++) {
        // Check for pause or abort
        if (this.isPaused) {
          this.syncStatus.status = 'paused';
          this.emit('statusChange', this.syncStatus);
          return;
        }

        if (this.syncAbortController?.signal.aborted) {
          this.logger.info('Sync aborted');
          return;
        }

        // Rate limiting
        await new Promise(resolve =>
          setTimeout(resolve, this.getRequestDelay())
        );

        try {
          const pageData = await this.fetchScrobblePage(page);
          const pageResult = this.processScrobbles(
            pageData.tracks,
            index,
            identities
          );
          processedCount += pageResult.processed;
          unresolvedCount += pageResult.unresolved;
          if (pageResult.newestTimestamp > newestScrobbleTimestamp) {
            newestScrobbleTimestamp = pageResult.newestTimestamp;
          }
          index.totalScrobbles = processedCount;

          this.syncStatus.currentPage = page;
          this.syncStatus.scrobblesFetched = processedCount;
          this.syncStatus.progress = Math.round((page / totalPages) * 100);
          this.syncStatus.estimatedTimeRemaining = Math.round(
            ((totalPages - page) * this.getRequestDelay()) / 1000
          );
          this.emit('statusChange', this.syncStatus);

          // Save progress periodically (every 10 pages)
          if (page % 10 === 0) {
            index.lastSyncTimestamp = newestScrobbleTimestamp * 1000;
            await this.saveIndex(index);
            this.logger.debug(`Saved progress at page ${page}/${totalPages}`);
          }
        } catch (error) {
          this.logger.error(`Error fetching page ${page}`, error);
          // Continue with next page on error
        }
      }

      // Final save - use the newest scrobble timestamp (in ms) for accurate sync tracking
      index.lastSyncTimestamp = newestScrobbleTimestamp * 1000;
      index.lastSyncCompletedAt = Date.now();
      await this.saveIndex(index);

      this.syncStatus.status = 'completed';
      this.syncStatus.progress = 100;
      this.syncStatus.lastSyncTimestamp = index.lastSyncTimestamp;
      this.emit('statusChange', this.syncStatus);

      this.logger.info(
        `Full sync completed: ${processedCount} scrobbles indexed (${unresolvedCount} without album info), ${Object.keys(index.albums).length} albums`
      );

      // Warm stats cache asynchronously — does not block sync completion
      this.triggerCacheWarm();
    } catch (error) {
      this.logger.error('Error during full sync', error);
      this.syncStatus.status = 'error';
      this.syncStatus.error =
        error instanceof Error ? error.message : 'Unknown error';
      this.emit('statusChange', this.syncStatus);
      throw error;
    } finally {
      this.isSyncing = false;
      this.syncAbortController = null;
    }
  }

  /**
   * Start an incremental sync (only fetch new scrobbles since last sync)
   */
  async startIncrementalSync(): Promise<void> {
    if (this.isSyncing) {
      this.logger.warn('Sync already in progress');
      return;
    }

    const existingIndex = await this.getHistoryIndex();
    if (!existingIndex) {
      this.logger.info('No existing index, starting full sync');
      return this.startFullSync();
    }

    this.logger.info('Starting incremental scrobble sync');
    this.isSyncing = true;
    this.isPaused = false;

    // Invalidate stale overview cache at sync start
    if (this.statsWarmer) {
      this.statsWarmer.invalidateStatsCache().catch(err => {
        this.logger.error(
          'Failed to invalidate stats cache before incremental sync',
          err
        );
      });
    }

    try {
      let page = 1;
      let hasMore = true;
      let newScrobbles = 0;
      let newUnresolved = 0;
      let duplicatesSkipped = 0;
      let newestScrobbleTimestamp = existingIndex.lastSyncTimestamp / 1000; // Start with existing (Unix timestamp)
      // Re-read a little before the watermark; identity dedup skips plays
      // already indexed (including after a backdated scrobble lowered it)
      const lastSyncTime =
        existingIndex.lastSyncTimestamp / 1000 - INCREMENTAL_OVERLAP_SECONDS;
      existingIndex.unresolved ??= {};
      const identities = buildIdentitySets(existingIndex);

      this.syncStatus = {
        status: 'syncing',
        progress: 0,
        currentPage: 0,
        totalPages: 0,
        scrobblesFetched: 0,
        totalScrobbles: existingIndex.totalScrobbles,
      };
      this.emit('statusChange', this.syncStatus);

      while (hasMore) {
        await new Promise(resolve =>
          setTimeout(resolve, this.getRequestDelay())
        );

        const pageData = await this.fetchScrobblePage(page);
        if (page === 1) {
          this.recordLastfmTotal(existingIndex, pageData.totalScrobbles);
        }

        // Check if we've reached scrobbles older than our last sync
        const oldestInPage = pageData.tracks.reduce(
          (min: number, track: LastFmTrack) => {
            const ts = parseInt(track.date?.uts || '0', 10);
            return ts > 0 && ts < min ? ts : min;
          },
          Infinity
        );

        if (oldestInPage <= lastSyncTime) {
          // Filter to only new scrobbles
          const newTracks = pageData.tracks.filter((track: LastFmTrack) => {
            const ts = parseInt(track.date?.uts || '0', 10);
            return ts > lastSyncTime;
          });
          const result = this.processScrobbles(
            newTracks,
            existingIndex,
            identities
          );
          newScrobbles += result.processed;
          newUnresolved += result.unresolved;
          duplicatesSkipped += result.duplicatesSkipped;
          if (result.newestTimestamp > newestScrobbleTimestamp) {
            newestScrobbleTimestamp = result.newestTimestamp;
          }
          hasMore = false;
        } else {
          const result = this.processScrobbles(
            pageData.tracks,
            existingIndex,
            identities
          );
          newScrobbles += result.processed;
          newUnresolved += result.unresolved;
          duplicatesSkipped += result.duplicatesSkipped;
          if (result.newestTimestamp > newestScrobbleTimestamp) {
            newestScrobbleTimestamp = result.newestTimestamp;
          }
          page++;
          // Safety limit
          if (page > 50) {
            this.logger.warn('Incremental sync page limit reached');
            hasMore = false;
          }
        }

        this.syncStatus.currentPage = page;
        this.syncStatus.scrobblesFetched = newScrobbles;
        this.emit('statusChange', this.syncStatus);
      }

      // Use the newest scrobble timestamp (in ms) for accurate sync tracking
      // This ensures we don't skip scrobbles made after sync started but with timestamps before Date.now()
      // Never move the watermark backwards (the overlap window can see only
      // plays older than it)
      existingIndex.lastSyncTimestamp = Math.max(
        existingIndex.lastSyncTimestamp,
        newestScrobbleTimestamp * 1000
      );
      existingIndex.lastSyncCompletedAt = Date.now();
      await this.saveIndex(existingIndex);

      this.syncStatus.status = 'completed';
      this.syncStatus.lastSyncTimestamp = existingIndex.lastSyncTimestamp;
      this.emit('statusChange', this.syncStatus);

      this.logger.info(
        `Incremental sync completed: ${newScrobbles} new scrobbles (${newUnresolved} without album info, ${duplicatesSkipped} already indexed)`
      );

      // Warm stats cache asynchronously — does not block sync completion
      this.triggerCacheWarm();
    } catch (error) {
      this.logger.error('Error during incremental sync', error);
      this.syncStatus.status = 'error';
      this.syncStatus.error =
        error instanceof Error ? error.message : 'Unknown error';
      this.emit('statusChange', this.syncStatus);
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Pause an ongoing sync
   */
  pauseSync(): void {
    if (this.isSyncing && !this.isPaused) {
      this.isPaused = true;
      this.logger.info('Sync paused');
    }
  }

  /**
   * Resume a paused sync
   */
  async resumeSync(): Promise<void> {
    if (this.isPaused) {
      this.isPaused = false;
      this.logger.info('Sync resumed');
      // Continue from where we left off - this would require storing state
      // For simplicity, we'll do an incremental sync
      await this.startIncrementalSync();
    }
  }

  /**
   * Clear the history index and reset sync state
   */
  async clearIndex(): Promise<void> {
    if (this.isSyncing) {
      this.syncAbortController?.abort();
      this.isSyncing = false;
    }

    await this.fileStorage.delete(HISTORY_INDEX_FILE);

    this.syncStatus = {
      status: 'idle',
      progress: 0,
      currentPage: 0,
      totalPages: 0,
      scrobblesFetched: 0,
      totalScrobbles: 0,
    };
    this.emit('statusChange', this.syncStatus);

    this.logger.info('History index cleared');
  }

  /**
   * Get the current history index
   */
  async getHistoryIndex(): Promise<ScrobbleHistoryIndex | null> {
    try {
      return await this.fileStorage.readJSON<ScrobbleHistoryIndex>(
        HISTORY_INDEX_FILE
      );
    } catch {
      return null;
    }
  }

  /**
   * Get album history from the index
   */
  async getAlbumHistory(
    artist: string,
    album: string
  ): Promise<AlbumHistoryEntry | null> {
    const index = await this.getHistoryIndex();
    if (!index) {
      return null;
    }

    const key = this.normalizeKey(artist, album);
    return index.albums[key] || null;
  }

  /**
   * Lower the lastSyncTimestamp so the next incremental sync picks up
   * backdated scrobbles (e.g., memory scrobbles with past timestamps).
   * Only lowers — never raises the timestamp.
   */
  async adjustSyncTimestampForBackdatedScrobbles(
    earliestTimestampSeconds: number
  ): Promise<void> {
    const index = await this.getHistoryIndex();
    if (!index) return;

    const earliestMs = earliestTimestampSeconds * 1000;
    // Subtract a small buffer (60s) to ensure the sync window covers the track
    const adjustedMs = earliestMs - 60000;

    if (adjustedMs < index.lastSyncTimestamp) {
      this.logger.info(
        `Adjusting sync timestamp for backdated scrobbles: ${new Date(index.lastSyncTimestamp).toISOString()} → ${new Date(adjustedMs).toISOString()}`
      );
      index.lastSyncTimestamp = adjustedMs;
      await this.saveIndex(index);
    }
  }

  /**
   * Check if the index needs a sync (hasn't been synced in 24 hours)
   */
  async needsSync(): Promise<boolean> {
    const index = await this.getHistoryIndex();
    if (!index) {
      return true;
    }

    const dayInMs = 24 * 60 * 60 * 1000;
    return Date.now() - index.lastSyncTimestamp > dayInMs;
  }
}
