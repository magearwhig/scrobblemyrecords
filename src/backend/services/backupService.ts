/**
 * Backup Service - handles backup export and import operations.
 *
 * Exports user-generated data that cannot be recovered from external APIs:
 * - Settings (user, suggestion, AI, wishlist, seller, release, sync)
 * - Mappings (album, artist, history-artist)
 * - Discovery (hidden albums/artists)
 * - Wishlist (local want list, vinyl watch list)
 * - Sellers (monitored sellers)
 * - Releases (MBID mappings, hidden releases, excluded artists)
 *
 * Credentials are only included if explicitly requested and encrypted with a
 * user-provided password using PBKDF2 key derivation and AES-256-GCM.
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import {
  AISettings,
  AlbumMapping,
  AlbumMappingsStore,
  ArtistMapping,
  ArtistMbidMapping,
  ArtistMbidMappingsStore,
  AutoBackupInfo,
  BackupData,
  BackupExportOptions,
  BackupFile,
  BackupImportOptions,
  BackupImportPreview,
  BackupImportResult,
  BackupPreview,
  BackupSettings,
  ExcludedArtist,
  ExcludedArtistsStore,
  HiddenAlbum,
  HiddenAlbumsStore,
  HiddenArtist,
  HiddenArtistsStore,
  HiddenRelease,
  HiddenReleasesStore,
  HistoryArtistMappingsStore,
  ImportCategorySummary,
  LocalWantItem,
  LocalWantStore,
  MonitoredSeller,
  MonitoredSellersStore,
  ReleaseTrackingSettings,
  SellerMonitoringSettings,
  SuggestionSettings,
  SyncSettings,
  UserSettings,
  VinylWatchItem,
  VinylWatchStore,
  WishlistSettings,
} from '../../shared/types';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

const logger = createLogger('BackupService');

// File paths for backup data
const FILE_PATHS = {
  userSettings: 'settings/user-settings.json',
  suggestionSettings: 'settings/suggestion-settings.json',
  aiSettings: 'settings/ai-settings.json',
  wishlistSettings: 'wishlist/settings.json',
  sellerSettings: 'sellers/settings.json',
  releaseSettings: 'releases/settings.json',
  syncSettings: 'history/sync-settings.json',
  albumMappings: 'mappings/album-mappings.json',
  artistMappings: 'mappings/artist-mappings.json',
  historyArtistMappings: 'mappings/history-artist-mappings.json',
  hiddenAlbums: 'discovery/hidden-albums.json',
  hiddenArtists: 'discovery/hidden-artists.json',
  localWantList: 'wishlist/local-want-list.json',
  vinylWatchList: 'wishlist/vinyl-watch-list.json',
  monitoredSellers: 'sellers/monitored-sellers.json',
  artistMbidMappings: 'releases/artist-mbid-map.json',
  hiddenReleases: 'releases/hidden-releases.json',
  excludedArtists: 'releases/excluded-artists.json',
  backupSettings: 'settings/backup-settings.json',
} as const;

const BACKUP_DIR = 'backups';

// Read version from package.json
// eslint-disable-next-line @typescript-eslint/no-var-requires
const packageJson = require('../../../package.json') as { version: string };
const APP_VERSION = packageJson.version;

// Encryption constants
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 32;
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const AUTH_TAG_LENGTH = 16;

// Default backup settings
const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
  schemaVersion: 1,
  enabled: false,
  frequency: 'weekly',
  retentionCount: 5,
};

export class BackupService {
  private fileStorage: FileStorage;
  private dataDir: string;

  constructor(fileStorage: FileStorage, dataDir: string = 'data') {
    this.fileStorage = fileStorage;
    this.dataDir = dataDir;
  }

  // ============================================
  // Checksum & Encryption Utilities
  // ============================================

  /**
   * Recursively sort all object keys for stable JSON serialization.
   * Arrays are kept in order but their object elements are sorted.
   */
  private sortObjectKeys(obj: unknown): unknown {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObjectKeys(item));
    }

    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    for (const key of keys) {
      sorted[key] = this.sortObjectKeys((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }

  /**
   * Compute a stable checksum for an object by recursively sorting all keys before hashing.
   * This ensures the same data always produces the same checksum regardless of key order.
   */
  private computeChecksum(data: object): string {
    const sortedData = this.sortObjectKeys(data);
    const stableJson = JSON.stringify(sortedData);
    return crypto.createHash('sha256').update(stableJson).digest('hex');
  }

  /**
   * Derive a key from a password using PBKDF2.
   */
  private deriveKey(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(
      password,
      salt,
      PBKDF2_ITERATIONS,
      KEY_LENGTH,
      'sha256'
    );
  }

  /**
   * Encrypt credentials using AES-256-GCM with PBKDF2 key derivation.
   * Returns a base64 string containing salt:iv:authTag:ciphertext.
   */
  private encryptCredentials(data: string, password: string): string {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = this.deriveKey(password, salt);
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();

    // Combine salt:iv:authTag:ciphertext
    const combined = Buffer.concat([
      salt,
      iv,
      authTag,
      Buffer.from(encrypted, 'base64'),
    ]);
    return combined.toString('base64');
  }

  /**
   * Decrypt credentials encrypted with encryptCredentials().
   */
  private decryptCredentials(encryptedData: string, password: string): string {
    try {
      const combined = Buffer.from(encryptedData, 'base64');

      // Extract salt, iv, authTag, and ciphertext
      const salt = combined.subarray(0, SALT_LENGTH);
      const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
      const authTag = combined.subarray(
        SALT_LENGTH + IV_LENGTH,
        SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
      );
      const ciphertext = combined.subarray(
        SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
      );

      const key = this.deriveKey(password, salt);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(ciphertext);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      return decrypted.toString('utf8');
    } catch (error) {
      logger.error('Decryption failed', error);
      throw new Error(
        'Failed to decrypt credentials. Please check your password.'
      );
    }
  }

  // ============================================
  // Data Loading Helpers
  // ============================================

  private async loadUserSettings(
    includeCredentials: boolean
  ): Promise<Omit<UserSettings, 'discogs' | 'lastfm'> | UserSettings | null> {
    const settings = await this.fileStorage.readJSON<UserSettings>(
      FILE_PATHS.userSettings
    );
    if (!settings) return null;

    if (!includeCredentials) {
      // Strip credentials, keep only preferences
      return {
        discogs: {},
        lastfm: {},
        preferences: settings.preferences,
      } as unknown as Omit<UserSettings, 'discogs' | 'lastfm'>;
    }
    return settings;
  }

  private async loadSuggestionSettings(): Promise<SuggestionSettings | null> {
    return this.fileStorage.readJSON<SuggestionSettings>(
      FILE_PATHS.suggestionSettings
    );
  }

  private async loadAiSettings(): Promise<AISettings | null> {
    return this.fileStorage.readJSON<AISettings>(FILE_PATHS.aiSettings);
  }

  private async loadWishlistSettings(): Promise<WishlistSettings | null> {
    return this.fileStorage.readJSON<WishlistSettings>(
      FILE_PATHS.wishlistSettings
    );
  }

  private async loadSellerSettings(): Promise<SellerMonitoringSettings | null> {
    return this.fileStorage.readJSON<SellerMonitoringSettings>(
      FILE_PATHS.sellerSettings
    );
  }

  private async loadReleaseSettings(): Promise<ReleaseTrackingSettings | null> {
    return this.fileStorage.readJSON<ReleaseTrackingSettings>(
      FILE_PATHS.releaseSettings
    );
  }

  private async loadSyncSettings(): Promise<SyncSettings | null> {
    return this.fileStorage.readJSON<SyncSettings>(FILE_PATHS.syncSettings);
  }

  private async loadAlbumMappings(): Promise<AlbumMapping[]> {
    const store = await this.fileStorage.readJSON<AlbumMappingsStore>(
      FILE_PATHS.albumMappings
    );
    return store?.mappings ?? [];
  }

  private async loadArtistMappings(): Promise<ArtistMapping[]> {
    const store = await this.fileStorage.readJSON<{
      mappings: ArtistMapping[];
    }>(FILE_PATHS.artistMappings);
    return store?.mappings ?? [];
  }

  private async loadHistoryArtistMappings(): Promise<ArtistMapping[]> {
    const store = await this.fileStorage.readJSON<HistoryArtistMappingsStore>(
      FILE_PATHS.historyArtistMappings
    );
    return store?.mappings ?? [];
  }

  private async loadHiddenAlbums(): Promise<HiddenAlbum[]> {
    const store = await this.fileStorage.readJSON<HiddenAlbumsStore>(
      FILE_PATHS.hiddenAlbums
    );
    return store?.items ?? [];
  }

  private async loadHiddenArtists(): Promise<HiddenArtist[]> {
    const store = await this.fileStorage.readJSON<HiddenArtistsStore>(
      FILE_PATHS.hiddenArtists
    );
    return store?.items ?? [];
  }

  private async loadLocalWantList(): Promise<LocalWantItem[]> {
    const store = await this.fileStorage.readJSON<LocalWantStore>(
      FILE_PATHS.localWantList
    );
    return store?.items ?? [];
  }

  private async loadVinylWatchList(): Promise<VinylWatchItem[]> {
    const store = await this.fileStorage.readJSON<VinylWatchStore>(
      FILE_PATHS.vinylWatchList
    );
    return store?.items ?? [];
  }

  private async loadMonitoredSellers(): Promise<MonitoredSeller[]> {
    const store = await this.fileStorage.readJSON<MonitoredSellersStore>(
      FILE_PATHS.monitoredSellers
    );
    return store?.sellers ?? [];
  }

  private async loadArtistMbidMappings(): Promise<ArtistMbidMapping[]> {
    const store = await this.fileStorage.readJSON<ArtistMbidMappingsStore>(
      FILE_PATHS.artistMbidMappings
    );
    return store?.mappings ?? [];
  }

  private async loadHiddenReleases(): Promise<HiddenRelease[]> {
    const store = await this.fileStorage.readJSON<HiddenReleasesStore>(
      FILE_PATHS.hiddenReleases
    );
    return store?.items ?? [];
  }

  private async loadExcludedArtists(): Promise<ExcludedArtist[]> {
    const store = await this.fileStorage.readJSON<ExcludedArtistsStore>(
      FILE_PATHS.excludedArtists
    );
    return store?.items ?? [];
  }

  // ============================================
  // Backup Preview
  // ============================================

  /**
   * Get a preview of what would be included in a backup.
   */
  async getBackupPreview(): Promise<BackupPreview> {
    const [
      userSettings,
      suggestionSettings,
      aiSettings,
      wishlistSettings,
      sellerSettings,
      releaseSettings,
      syncSettings,
      albumMappings,
      artistMappings,
      historyArtistMappings,
      hiddenAlbums,
      hiddenArtists,
      localWantList,
      vinylWatchList,
      monitoredSellers,
      artistMbidMappings,
      hiddenReleases,
      excludedArtists,
    ] = await Promise.all([
      this.loadUserSettings(false),
      this.loadSuggestionSettings(),
      this.loadAiSettings(),
      this.loadWishlistSettings(),
      this.loadSellerSettings(),
      this.loadReleaseSettings(),
      this.loadSyncSettings(),
      this.loadAlbumMappings(),
      this.loadArtistMappings(),
      this.loadHistoryArtistMappings(),
      this.loadHiddenAlbums(),
      this.loadHiddenArtists(),
      this.loadLocalWantList(),
      this.loadVinylWatchList(),
      this.loadMonitoredSellers(),
      this.loadArtistMbidMappings(),
      this.loadHiddenReleases(),
      this.loadExcludedArtists(),
    ]);

    return {
      hasUserSettings: userSettings !== null,
      hasSuggestionSettings: suggestionSettings !== null,
      hasAiSettings: aiSettings !== null,
      hasWishlistSettings: wishlistSettings !== null,
      hasSellerSettings: sellerSettings !== null,
      hasReleaseSettings: releaseSettings !== null,
      hasSyncSettings: syncSettings !== null,
      albumMappingsCount: albumMappings.length,
      artistMappingsCount: artistMappings.length,
      historyArtistMappingsCount: historyArtistMappings.length,
      hiddenAlbumsCount: hiddenAlbums.length,
      hiddenArtistsCount: hiddenArtists.length,
      localWantListCount: localWantList.length,
      vinylWatchListCount: vinylWatchList.length,
      monitoredSellersCount: monitoredSellers.length,
      artistMbidMappingsCount: artistMbidMappings.length,
      hiddenReleasesCount: hiddenReleases.length,
      excludedArtistsCount: excludedArtists.length,
    };
  }

  // ============================================
  // Export Backup
  // ============================================

  /**
   * Export all user data to a backup file.
   */
  async exportBackup(options: BackupExportOptions): Promise<string> {
    const { includeCredentials, password } = options;

    if (includeCredentials && !password) {
      throw new Error('Password is required when including credentials');
    }

    logger.info('Creating backup', { includeCredentials });

    // Load all data
    const [
      userSettings,
      suggestionSettings,
      aiSettings,
      wishlistSettings,
      sellerSettings,
      releaseSettings,
      syncSettings,
      albumMappings,
      artistMappings,
      historyArtistMappings,
      hiddenAlbums,
      hiddenArtists,
      localWantList,
      vinylWatchList,
      monitoredSellers,
      artistMbidMappings,
      hiddenReleases,
      excludedArtists,
    ] = await Promise.all([
      this.loadUserSettings(includeCredentials),
      this.loadSuggestionSettings(),
      this.loadAiSettings(),
      this.loadWishlistSettings(),
      this.loadSellerSettings(),
      this.loadReleaseSettings(),
      this.loadSyncSettings(),
      this.loadAlbumMappings(),
      this.loadArtistMappings(),
      this.loadHistoryArtistMappings(),
      this.loadHiddenAlbums(),
      this.loadHiddenArtists(),
      this.loadLocalWantList(),
      this.loadVinylWatchList(),
      this.loadMonitoredSellers(),
      this.loadArtistMbidMappings(),
      this.loadHiddenReleases(),
      this.loadExcludedArtists(),
    ]);

    // Build backup data
    let backupData: BackupData = {
      userSettings: userSettings as UserSettings,
      suggestionSettings,
      aiSettings,
      wishlistSettings,
      sellerMonitoringSettings: sellerSettings,
      releaseTrackingSettings: releaseSettings,
      syncSettings,
      albumMappings,
      artistMappings,
      historyArtistMappings,
      hiddenAlbums,
      hiddenArtists,
      localWantList,
      vinylWatchList,
      monitoredSellers,
      artistMbidMappings,
      hiddenReleases,
      excludedArtists,
    };

    // Encrypt credentials if included
    if (includeCredentials && password && userSettings) {
      const credentialsJson = JSON.stringify({
        discogs: (userSettings as UserSettings).discogs,
        lastfm: (userSettings as UserSettings).lastfm,
      });
      const encryptedCredentials = this.encryptCredentials(
        credentialsJson,
        password
      );
      backupData = {
        ...backupData,
        userSettings: {
          ...(userSettings as UserSettings),
          // Mark as encrypted
          discogs: {
            encrypted: encryptedCredentials,
          } as unknown as UserSettings['discogs'],
          lastfm: {} as unknown as UserSettings['lastfm'],
        } as UserSettings,
      };
    }

    // Compute checksum
    const checksum = this.computeChecksum(backupData);

    // Build backup file
    const backupFile: BackupFile = {
      version: 2,
      exportedAt: Date.now(),
      appVersion: APP_VERSION,
      includesCredentials: includeCredentials,
      checksum,
      data: backupData,
    };

    logger.info('Backup created successfully', {
      includesCredentials: includeCredentials,
      checksum: `${checksum.substring(0, 8)}...`,
    });

    return JSON.stringify(backupFile, null, 2);
  }

  // ============================================
  // Import Preview
  // ============================================

  /**
   * Preview what would happen if a backup was imported.
   */
  async previewImport(backupJson: string): Promise<BackupImportPreview> {
    let backup: BackupFile;
    try {
      backup = JSON.parse(backupJson);
    } catch {
      return {
        valid: false,
        error: 'Invalid JSON format',
        exportedAt: 0,
        appVersion: '',
        includesCredentials: false,
        checksumValid: false,
        summary: this.emptySummary(),
      };
    }

    // Validate structure
    if (!backup.version || !backup.data || !backup.checksum) {
      return {
        valid: false,
        error: 'Invalid backup file structure',
        exportedAt: 0,
        appVersion: '',
        includesCredentials: false,
        checksumValid: false,
        summary: this.emptySummary(),
      };
    }

    // Validate checksum
    const expectedChecksum = this.computeChecksum(backup.data);
    const checksumValid = expectedChecksum === backup.checksum;

    if (!checksumValid) {
      return {
        valid: false,
        error: 'Checksum mismatch - backup may be corrupted',
        exportedAt: backup.exportedAt,
        appVersion: backup.appVersion,
        includesCredentials: backup.includesCredentials,
        checksumValid: false,
        summary: this.emptySummary(),
      };
    }

    // Load current data for comparison
    const [
      currentAlbumMappings,
      currentArtistMappings,
      currentHistoryArtistMappings,
      currentHiddenAlbums,
      currentHiddenArtists,
      currentLocalWantList,
      currentVinylWatchList,
      currentMonitoredSellers,
      currentArtistMbidMappings,
      currentHiddenReleases,
      currentExcludedArtists,
    ] = await Promise.all([
      this.loadAlbumMappings(),
      this.loadArtistMappings(),
      this.loadHistoryArtistMappings(),
      this.loadHiddenAlbums(),
      this.loadHiddenArtists(),
      this.loadLocalWantList(),
      this.loadVinylWatchList(),
      this.loadMonitoredSellers(),
      this.loadArtistMbidMappings(),
      this.loadHiddenReleases(),
      this.loadExcludedArtists(),
    ]);

    // Calculate summary
    const summary = {
      albumMappings: this.compareMappings(
        backup.data.albumMappings,
        currentAlbumMappings,
        (m: AlbumMapping) => `${m.historyArtist}|${m.historyAlbum}`
      ),
      artistMappings: this.compareMappings(
        backup.data.artistMappings,
        currentArtistMappings,
        (m: ArtistMapping) => m.historyArtist
      ),
      historyArtistMappings: this.compareMappings(
        backup.data.historyArtistMappings,
        currentHistoryArtistMappings,
        (m: ArtistMapping) => m.historyArtist
      ),
      hiddenAlbums: this.compareMappings(
        backup.data.hiddenAlbums,
        currentHiddenAlbums,
        (h: HiddenAlbum) => `${h.artist}|${h.album}`
      ),
      hiddenArtists: this.compareMappings(
        backup.data.hiddenArtists,
        currentHiddenArtists,
        (h: HiddenArtist) => h.artist
      ),
      localWantList: this.compareMappings(
        backup.data.localWantList,
        currentLocalWantList,
        (w: LocalWantItem) => w.id
      ),
      vinylWatchList: this.compareMappings(
        backup.data.vinylWatchList,
        currentVinylWatchList,
        (w: VinylWatchItem) => String(w.masterId)
      ),
      monitoredSellers: this.compareMappings(
        backup.data.monitoredSellers,
        currentMonitoredSellers,
        (s: MonitoredSeller) => s.username
      ),
      artistMbidMappings: this.compareMappings(
        backup.data.artistMbidMappings,
        currentArtistMbidMappings,
        (m: ArtistMbidMapping) => m.normalizedName
      ),
      hiddenReleases: this.compareMappings(
        backup.data.hiddenReleases,
        currentHiddenReleases,
        (r: HiddenRelease) => r.mbid
      ),
      excludedArtists: this.compareMappings(
        backup.data.excludedArtists,
        currentExcludedArtists,
        (a: ExcludedArtist) => a.normalizedName
      ),
      settingsWillMerge: true,
    };

    return {
      valid: true,
      exportedAt: backup.exportedAt,
      appVersion: backup.appVersion,
      includesCredentials: backup.includesCredentials,
      checksumValid: true,
      summary,
    };
  }

  private emptySummary() {
    return {
      albumMappings: { new: 0, existing: 0 },
      artistMappings: { new: 0, existing: 0 },
      historyArtistMappings: { new: 0, existing: 0 },
      hiddenAlbums: { new: 0, existing: 0 },
      hiddenArtists: { new: 0, existing: 0 },
      localWantList: { new: 0, existing: 0 },
      vinylWatchList: { new: 0, existing: 0 },
      monitoredSellers: { new: 0, existing: 0 },
      artistMbidMappings: { new: 0, existing: 0 },
      hiddenReleases: { new: 0, existing: 0 },
      excludedArtists: { new: 0, existing: 0 },
      settingsWillMerge: false,
    };
  }

  private compareMappings<T>(
    backupItems: T[],
    currentItems: T[],
    getKey: (item: T) => string
  ): ImportCategorySummary {
    const currentKeys = new Set(currentItems.map(getKey));
    let newCount = 0;
    let existingCount = 0;

    for (const item of backupItems || []) {
      if (currentKeys.has(getKey(item))) {
        existingCount++;
      } else {
        newCount++;
      }
    }

    return { new: newCount, existing: existingCount };
  }

  // ============================================
  // Import Backup
  // ============================================

  /**
   * Import a backup file.
   */
  async importBackup(
    backupJson: string,
    options: BackupImportOptions
  ): Promise<BackupImportResult> {
    const { mode, password } = options;

    // Parse and validate
    let backup: BackupFile;
    try {
      backup = JSON.parse(backupJson);
    } catch {
      return {
        success: false,
        itemsAdded: 0,
        itemsUpdated: 0,
        settingsMerged: false,
        errors: ['Invalid JSON format'],
      };
    }

    // Validate checksum
    const expectedChecksum = this.computeChecksum(backup.data);
    if (expectedChecksum !== backup.checksum) {
      return {
        success: false,
        itemsAdded: 0,
        itemsUpdated: 0,
        settingsMerged: false,
        errors: ['Checksum mismatch - backup may be corrupted'],
      };
    }

    // Decrypt credentials if present
    if (backup.includesCredentials) {
      if (!password) {
        return {
          success: false,
          itemsAdded: 0,
          itemsUpdated: 0,
          settingsMerged: false,
          errors: ['Password required to import backup with credentials'],
        };
      }

      try {
        const encrypted = (
          backup.data.userSettings as unknown as {
            discogs: { encrypted: string };
          }
        )?.discogs?.encrypted;
        if (encrypted) {
          const decrypted = this.decryptCredentials(encrypted, password);
          const credentials = JSON.parse(decrypted);
          backup.data.userSettings = {
            ...backup.data.userSettings,
            discogs: credentials.discogs,
            lastfm: credentials.lastfm,
          } as UserSettings;
        }
      } catch {
        return {
          success: false,
          itemsAdded: 0,
          itemsUpdated: 0,
          settingsMerged: false,
          errors: ['Failed to decrypt credentials - incorrect password'],
        };
      }
    }

    logger.info('Importing backup', {
      mode,
      includesCredentials: backup.includesCredentials,
    });

    const errors: string[] = [];
    let itemsAdded = 0;
    let itemsUpdated = 0;
    let settingsMerged = false;

    try {
      // Import settings
      if (backup.data.userSettings) {
        await this.importUserSettings(backup.data.userSettings, mode);
        settingsMerged = true;
      }

      if (backup.data.suggestionSettings) {
        await this.fileStorage.writeJSONWithBackup(
          FILE_PATHS.suggestionSettings,
          backup.data.suggestionSettings
        );
        settingsMerged = true;
      }

      if (backup.data.aiSettings) {
        await this.fileStorage.writeJSONWithBackup(
          FILE_PATHS.aiSettings,
          backup.data.aiSettings
        );
        settingsMerged = true;
      }

      if (backup.data.wishlistSettings) {
        await this.fileStorage.writeJSONWithBackup(
          FILE_PATHS.wishlistSettings,
          backup.data.wishlistSettings
        );
        settingsMerged = true;
      }

      if (backup.data.sellerMonitoringSettings) {
        await this.fileStorage.writeJSONWithBackup(
          FILE_PATHS.sellerSettings,
          backup.data.sellerMonitoringSettings
        );
        settingsMerged = true;
      }

      if (backup.data.releaseTrackingSettings) {
        await this.fileStorage.writeJSONWithBackup(
          FILE_PATHS.releaseSettings,
          backup.data.releaseTrackingSettings
        );
        settingsMerged = true;
      }

      if (backup.data.syncSettings) {
        await this.fileStorage.writeJSONWithBackup(
          FILE_PATHS.syncSettings,
          backup.data.syncSettings
        );
        settingsMerged = true;
      }

      // Import array data
      const importArrayResult = await this.importArrayData(
        backup.data,
        mode === 'merge'
      );
      itemsAdded = importArrayResult.added;
      itemsUpdated = importArrayResult.updated;
      errors.push(...importArrayResult.errors);

      logger.info('Backup imported successfully', {
        itemsAdded,
        itemsUpdated,
        settingsMerged,
        errors: errors.length,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`Import failed: ${msg}`);
      logger.error('Backup import failed', error);
    }

    return {
      success: errors.length === 0,
      itemsAdded,
      itemsUpdated,
      settingsMerged,
      errors,
    };
  }

  private async importUserSettings(
    backupSettings: UserSettings | Omit<UserSettings, 'discogs' | 'lastfm'>,
    mode: 'merge' | 'replace'
  ): Promise<void> {
    if (mode === 'replace') {
      await this.fileStorage.writeJSONWithBackup(
        FILE_PATHS.userSettings,
        backupSettings
      );
      return;
    }

    // Merge mode
    const current = await this.fileStorage.readJSON<UserSettings>(
      FILE_PATHS.userSettings
    );
    if (!current) {
      await this.fileStorage.writeJSONWithBackup(
        FILE_PATHS.userSettings,
        backupSettings
      );
      return;
    }

    const merged: UserSettings = {
      discogs: {
        ...current.discogs,
        ...((backupSettings as UserSettings).discogs || {}),
      },
      lastfm: {
        ...current.lastfm,
        ...((backupSettings as UserSettings).lastfm || {}),
      },
      preferences: {
        ...current.preferences,
        ...(backupSettings as UserSettings).preferences,
      },
    };

    await this.fileStorage.writeJSONWithBackup(FILE_PATHS.userSettings, merged);
  }

  private async importArrayData(
    data: BackupData,
    merge: boolean
  ): Promise<{ added: number; updated: number; errors: string[] }> {
    let added = 0;
    let updated = 0;
    const errors: string[] = [];

    // Import album mappings
    try {
      const result = await this.mergeAndSave(
        FILE_PATHS.albumMappings,
        data.albumMappings,
        (m: AlbumMapping) => `${m.historyArtist}|${m.historyAlbum}`,
        'mappings',
        merge,
        (a, b) => (a.createdAt > b.createdAt ? a : b)
      );
      added += result.added;
      updated += result.updated;
    } catch (e) {
      errors.push(`Album mappings: ${e instanceof Error ? e.message : e}`);
    }

    // Import artist mappings
    try {
      const result = await this.mergeAndSave(
        FILE_PATHS.artistMappings,
        data.artistMappings,
        (m: ArtistMapping) => m.historyArtist,
        'mappings',
        merge,
        (a, b) => (a.createdAt > b.createdAt ? a : b)
      );
      added += result.added;
      updated += result.updated;
    } catch (e) {
      errors.push(`Artist mappings: ${e instanceof Error ? e.message : e}`);
    }

    // Import history artist mappings
    try {
      const result = await this.mergeAndSave(
        FILE_PATHS.historyArtistMappings,
        data.historyArtistMappings,
        (m: ArtistMapping) => m.historyArtist,
        'mappings',
        merge,
        (a, b) => (a.createdAt > b.createdAt ? a : b)
      );
      added += result.added;
      updated += result.updated;
    } catch (e) {
      errors.push(
        `History artist mappings: ${e instanceof Error ? e.message : e}`
      );
    }

    // Import hidden albums
    try {
      const result = await this.mergeAndSave(
        FILE_PATHS.hiddenAlbums,
        data.hiddenAlbums,
        (h: HiddenAlbum) => `${h.artist}|${h.album}`,
        'items',
        merge,
        (a, b) => (a.hiddenAt > b.hiddenAt ? a : b)
      );
      added += result.added;
      updated += result.updated;
    } catch (e) {
      errors.push(`Hidden albums: ${e instanceof Error ? e.message : e}`);
    }

    // Import hidden artists
    try {
      const result = await this.mergeAndSave(
        FILE_PATHS.hiddenArtists,
        data.hiddenArtists,
        (h: HiddenArtist) => h.artist,
        'items',
        merge,
        (a, b) => (a.hiddenAt > b.hiddenAt ? a : b)
      );
      added += result.added;
      updated += result.updated;
    } catch (e) {
      errors.push(`Hidden artists: ${e instanceof Error ? e.message : e}`);
    }

    // Import local want list
    try {
      const result = await this.mergeAndSave(
        FILE_PATHS.localWantList,
        data.localWantList,
        (w: LocalWantItem) => w.id,
        'items',
        merge,
        (a, b) => (a.addedAt > b.addedAt ? a : b)
      );
      added += result.added;
      updated += result.updated;
    } catch (e) {
      errors.push(`Local want list: ${e instanceof Error ? e.message : e}`);
    }

    // Import vinyl watch list
    try {
      const result = await this.mergeAndSave(
        FILE_PATHS.vinylWatchList,
        data.vinylWatchList,
        (w: VinylWatchItem) => String(w.masterId),
        'items',
        merge,
        (a, b) => (a.addedAt > b.addedAt ? a : b)
      );
      added += result.added;
      updated += result.updated;
    } catch (e) {
      errors.push(`Vinyl watch list: ${e instanceof Error ? e.message : e}`);
    }

    // Import monitored sellers
    try {
      const result = await this.mergeAndSave(
        FILE_PATHS.monitoredSellers,
        data.monitoredSellers,
        (s: MonitoredSeller) => s.username,
        'sellers',
        merge,
        (a, b) => (a.addedAt > b.addedAt ? a : b)
      );
      added += result.added;
      updated += result.updated;
    } catch (e) {
      errors.push(`Monitored sellers: ${e instanceof Error ? e.message : e}`);
    }

    // Import artist MBID mappings
    try {
      const result = await this.mergeAndSave(
        FILE_PATHS.artistMbidMappings,
        data.artistMbidMappings,
        (m: ArtistMbidMapping) => m.normalizedName,
        'mappings',
        merge,
        (a, b) => (a.confirmedAt > b.confirmedAt ? a : b)
      );
      added += result.added;
      updated += result.updated;
    } catch (e) {
      errors.push(
        `Artist MBID mappings: ${e instanceof Error ? e.message : e}`
      );
    }

    // Import hidden releases
    try {
      const result = await this.mergeAndSave(
        FILE_PATHS.hiddenReleases,
        data.hiddenReleases,
        (r: HiddenRelease) => r.mbid,
        'items',
        merge,
        (a, b) => (a.hiddenAt > b.hiddenAt ? a : b)
      );
      added += result.added;
      updated += result.updated;
    } catch (e) {
      errors.push(`Hidden releases: ${e instanceof Error ? e.message : e}`);
    }

    // Import excluded artists
    try {
      const result = await this.mergeAndSave(
        FILE_PATHS.excludedArtists,
        data.excludedArtists,
        (a: ExcludedArtist) => a.normalizedName,
        'items',
        merge,
        (a, b) => (a.excludedAt > b.excludedAt ? a : b)
      );
      added += result.added;
      updated += result.updated;
    } catch (e) {
      errors.push(`Excluded artists: ${e instanceof Error ? e.message : e}`);
    }

    return { added, updated, errors };
  }

  private async mergeAndSave<T>(
    filePath: string,
    backupItems: T[],
    getKey: (item: T) => string,
    arrayKey: string,
    merge: boolean,
    resolveConflict: (a: T, b: T) => T
  ): Promise<{ added: number; updated: number }> {
    if (!backupItems || backupItems.length === 0) {
      return { added: 0, updated: 0 };
    }

    if (!merge) {
      // Replace mode
      await this.fileStorage.writeJSONWithBackup(filePath, {
        schemaVersion: 1,
        [arrayKey]: backupItems,
      });
      return { added: backupItems.length, updated: 0 };
    }

    // Merge mode
    const current =
      await this.fileStorage.readJSON<Record<string, unknown>>(filePath);
    const currentArray = ((current?.[arrayKey] as T[]) || []) as T[];
    const currentMap = new Map(currentArray.map(item => [getKey(item), item]));

    let added = 0;
    let updated = 0;

    for (const backupItem of backupItems) {
      const key = getKey(backupItem);
      const existing = currentMap.get(key);

      if (existing) {
        const resolved = resolveConflict(backupItem, existing);
        if (resolved !== existing) {
          currentMap.set(key, resolved);
          updated++;
        }
      } else {
        currentMap.set(key, backupItem);
        added++;
      }
    }

    await this.fileStorage.writeJSONWithBackup(filePath, {
      schemaVersion: 1,
      [arrayKey]: Array.from(currentMap.values()),
    });

    return { added, updated };
  }

  // ============================================
  // Auto-Backup Settings & Management
  // ============================================

  /**
   * Get auto-backup settings.
   */
  async getSettings(): Promise<BackupSettings> {
    const stored = await this.fileStorage.readJSON<BackupSettings>(
      FILE_PATHS.backupSettings
    );
    return stored || DEFAULT_BACKUP_SETTINGS;
  }

  /**
   * Save auto-backup settings.
   */
  async saveSettings(
    settings: Partial<BackupSettings>
  ): Promise<BackupSettings> {
    const current = await this.getSettings();
    const updated: BackupSettings = {
      ...current,
      ...settings,
      schemaVersion: 1,
    };
    await this.fileStorage.writeJSON(FILE_PATHS.backupSettings, updated);
    return updated;
  }

  /**
   * List auto-backup files.
   */
  async listAutoBackups(): Promise<AutoBackupInfo[]> {
    const backupDir = path.join(this.dataDir, BACKUP_DIR);

    try {
      const files = await fs.readdir(backupDir);
      const backups: AutoBackupInfo[] = [];

      for (const filename of files) {
        if (
          !filename.startsWith('auto-backup-') ||
          !filename.endsWith('.json')
        ) {
          continue;
        }

        const filePath = path.join(backupDir, filename);
        const stats = await fs.stat(filePath);

        backups.push({
          filename,
          createdAt: stats.mtimeMs,
          size: stats.size,
        });
      }

      // Sort by creation time, newest first
      return backups.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      // Directory doesn't exist yet
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Delete an auto-backup file.
   */
  async deleteAutoBackup(filename: string): Promise<void> {
    // Validate filename to prevent path traversal
    if (
      !filename.startsWith('auto-backup-') ||
      filename.includes('..') ||
      filename.includes('/')
    ) {
      throw new Error('Invalid backup filename');
    }

    const filePath = path.join(this.dataDir, BACKUP_DIR, filename);
    await fs.unlink(filePath);
    logger.info('Auto-backup deleted', { filename });
  }

  /**
   * Run an auto-backup if due.
   */
  async runAutoBackup(): Promise<void> {
    const settings = await this.getSettings();

    if (!settings.enabled) {
      return;
    }

    // Check if backup is due
    const now = Date.now();
    const lastBackup = settings.lastBackup || 0;
    const intervalMs = this.getBackupIntervalMs(settings.frequency);

    if (now - lastBackup < intervalMs) {
      return;
    }

    logger.info('Running auto-backup');

    // Create backup - auto-backups never include credentials since they require
    // interactive password input. Users must use manual export for credential backup.
    const backupJson = await this.exportBackup({
      includeCredentials: false,
    });

    // Ensure backup directory exists
    const backupDir = path.join(this.dataDir, BACKUP_DIR);
    await fs.mkdir(backupDir, { recursive: true });

    // Save backup file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `auto-backup-${timestamp}.json`;
    const filePath = path.join(backupDir, filename);
    await fs.writeFile(filePath, backupJson, 'utf8');

    // Update last backup time
    await this.saveSettings({ lastBackup: now });

    // Clean up old backups
    await this.cleanupOldBackups(settings.retentionCount);

    logger.info('Auto-backup completed', { filename });
  }

  private getBackupIntervalMs(
    frequency: 'daily' | 'weekly' | 'monthly'
  ): number {
    const DAY = 24 * 60 * 60 * 1000;
    switch (frequency) {
      case 'daily':
        return DAY;
      case 'weekly':
        return 7 * DAY;
      case 'monthly':
        return 30 * DAY;
    }
  }

  private async cleanupOldBackups(retentionCount: number): Promise<void> {
    const backups = await this.listAutoBackups();

    if (backups.length <= retentionCount) {
      return;
    }

    // Delete oldest backups
    const toDelete = backups.slice(retentionCount);
    for (const backup of toDelete) {
      try {
        await this.deleteAutoBackup(backup.filename);
      } catch (error) {
        logger.warn('Failed to delete old backup', {
          filename: backup.filename,
          error,
        });
      }
    }
  }

  /**
   * Check if auto-backup is due and run if needed.
   * This should be called on server startup.
   */
  async checkAndRunAutoBackup(): Promise<void> {
    try {
      await this.runAutoBackup();
    } catch (error) {
      logger.error('Auto-backup check failed', error);
    }
  }
}
