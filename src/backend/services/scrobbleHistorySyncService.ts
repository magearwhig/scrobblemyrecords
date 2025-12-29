import { EventEmitter } from 'events';

import axios, { AxiosInstance } from 'axios';

import {
  SyncStatus,
  SyncSettings,
  ScrobbleHistoryIndex,
  AlbumHistoryEntry,
} from '../../shared/types';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

import { AuthService } from './authService';
import { ScrobbleHistoryStorage } from './scrobbleHistoryStorage';

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

export class ScrobbleHistorySyncService extends EventEmitter {
  private axios: AxiosInstance;
  private fileStorage: FileStorage;
  private authService: AuthService;
  private historyStorage: ScrobbleHistoryStorage | null = null;
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
   * Set the history storage instance for cache invalidation
   */
  setHistoryStorage(historyStorage: ScrobbleHistoryStorage): void {
    this.historyStorage = historyStorage;
  }

  /**
   * Save index and invalidate storage cache so stats are fresh
   */
  private async saveIndex(index: ScrobbleHistoryIndex): Promise<void> {
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
    await this.fileStorage.writeJSON(SYNC_SETTINGS_FILE, this.syncSettings);
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
   * Process a batch of scrobbles and update the index
   */
  private processScrobbles(
    tracks: LastFmTrack[],
    index: ScrobbleHistoryIndex
  ): number {
    let processed = 0;

    for (const track of tracks) {
      // Skip currently playing tracks (they don't have a date)
      if (track['@attr']?.nowplaying === 'true') {
        continue;
      }

      const artist =
        typeof track.artist === 'object' ? track.artist['#text'] : track.artist;
      const album =
        typeof track.album === 'object'
          ? track.album['#text']
          : track.album || '';
      const trackName = track.name;
      const timestamp = parseInt(track.date?.uts || '0', 10);

      if (!artist || !album || !timestamp) {
        continue;
      }

      const key = this.normalizeKey(artist, album);

      if (!index.albums[key]) {
        index.albums[key] = {
          lastPlayed: timestamp,
          playCount: 0,
          plays: [],
        };
      }

      const entry = index.albums[key];
      entry.playCount++;
      entry.plays.push({ timestamp, track: trackName });

      // Update lastPlayed if this is more recent
      if (timestamp > entry.lastPlayed) {
        entry.lastPlayed = timestamp;
      }

      // Track oldest scrobble
      if (
        timestamp < index.oldestScrobbleDate ||
        index.oldestScrobbleDate === 0
      ) {
        index.oldestScrobbleDate = timestamp;
      }

      processed++;
    }

    return processed;
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

    const index: ScrobbleHistoryIndex = {
      lastSyncTimestamp: Date.now(),
      totalScrobbles: 0,
      oldestScrobbleDate: 0,
      albums: {},
    };

    try {
      // First fetch to get total pages
      const firstPage = await this.fetchScrobblePage(1);
      const totalPages = firstPage.totalPages;
      const totalScrobbles = firstPage.totalScrobbles;

      this.syncStatus = {
        status: 'syncing',
        progress: 0,
        currentPage: 1,
        totalPages,
        scrobblesFetched: 0,
        totalScrobbles,
      };
      this.emit('statusChange', this.syncStatus);

      // Process first page
      let processedCount = this.processScrobbles(firstPage.tracks, index);
      index.totalScrobbles = processedCount;

      this.syncStatus.scrobblesFetched = processedCount;
      this.syncStatus.progress = Math.round((1 / totalPages) * 100);
      this.emit('statusChange', this.syncStatus);

      // Save after first page so suggestions can work with recent data
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
          const pageProcessed = this.processScrobbles(pageData.tracks, index);
          processedCount += pageProcessed;
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
            index.lastSyncTimestamp = Date.now();
            await this.saveIndex(index);
            this.logger.debug(`Saved progress at page ${page}/${totalPages}`);
          }
        } catch (error) {
          this.logger.error(`Error fetching page ${page}`, error);
          // Continue with next page on error
        }
      }

      // Final save
      index.lastSyncTimestamp = Date.now();
      await this.saveIndex(index);

      this.syncStatus.status = 'completed';
      this.syncStatus.progress = 100;
      this.syncStatus.lastSyncTimestamp = index.lastSyncTimestamp;
      this.emit('statusChange', this.syncStatus);

      this.logger.info(
        `Full sync completed: ${processedCount} scrobbles indexed, ${Object.keys(index.albums).length} albums`
      );
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

    try {
      let page = 1;
      let hasMore = true;
      let newScrobbles = 0;
      const lastSyncTime = existingIndex.lastSyncTimestamp / 1000; // Convert to Unix timestamp

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
          newScrobbles += this.processScrobbles(newTracks, existingIndex);
          hasMore = false;
        } else {
          newScrobbles += this.processScrobbles(pageData.tracks, existingIndex);
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

      existingIndex.lastSyncTimestamp = Date.now();
      existingIndex.totalScrobbles += newScrobbles;
      await this.saveIndex(existingIndex);

      this.syncStatus.status = 'completed';
      this.syncStatus.lastSyncTimestamp = existingIndex.lastSyncTimestamp;
      this.emit('statusChange', this.syncStatus);

      this.logger.info(
        `Incremental sync completed: ${newScrobbles} new scrobbles`
      );
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
