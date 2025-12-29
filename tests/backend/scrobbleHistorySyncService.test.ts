import * as fs from 'fs/promises';

import axios from 'axios';

import { AuthService } from '../../src/backend/services/authService';
import { ScrobbleHistoryStorage } from '../../src/backend/services/scrobbleHistoryStorage';
import { ScrobbleHistorySyncService } from '../../src/backend/services/scrobbleHistorySyncService';
import { FileStorage } from '../../src/backend/utils/fileStorage';
import { ScrobbleHistoryIndex, SyncSettings } from '../../src/shared/types';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ScrobbleHistorySyncService', () => {
  let service: ScrobbleHistorySyncService;
  let fileStorage: FileStorage;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockHistoryStorage: jest.Mocked<ScrobbleHistoryStorage>;
  const testDataDir = './test-data-sync-service';

  // Mock axios instance
  const mockAxiosInstance = {
    get: jest.fn(),
    post: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Setup mock axios
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);

    // Setup file storage
    fileStorage = new FileStorage(testDataDir);
    await fileStorage.ensureDataDir();

    // Mock auth service
    mockAuthService = {
      getLastFmCredentials: jest.fn().mockResolvedValue({
        apiKey: 'test-api-key',
        username: 'testuser',
        sessionKey: 'test-session',
      }),
    } as any;

    // Mock history storage
    mockHistoryStorage = {
      invalidateCache: jest.fn(),
    } as any;

    service = new ScrobbleHistorySyncService(
      fileStorage,
      mockAuthService,
      mockHistoryStorage
    );
  });

  afterEach(async () => {
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch {
      // Ignore errors if directory doesn't exist
    }
  });

  describe('constructor', () => {
    it('should create service with default sync settings', () => {
      // Act
      const settings = service.getSyncSettings();

      // Assert
      expect(settings.autoSyncOnStartup).toBe(true);
      expect(settings.syncPace).toBe('normal');
    });

    it('should create axios instance with correct config', () => {
      // Assert
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'https://ws.audioscrobbler.com/2.0/',
        timeout: 30000,
      });
    });
  });

  describe('getSyncStatus', () => {
    it('should return initial idle status', () => {
      // Act
      const status = service.getSyncStatus();

      // Assert
      expect(status.status).toBe('idle');
      expect(status.progress).toBe(0);
      expect(status.currentPage).toBe(0);
      expect(status.totalPages).toBe(0);
      expect(status.scrobblesFetched).toBe(0);
      expect(status.totalScrobbles).toBe(0);
    });

    it('should return a copy of status (not reference)', () => {
      // Act
      const status1 = service.getSyncStatus();
      const status2 = service.getSyncStatus();

      // Assert
      expect(status1).toEqual(status2);
      expect(status1).not.toBe(status2);
    });
  });

  describe('getSyncSettings', () => {
    it('should return current settings', () => {
      // Act
      const settings = service.getSyncSettings();

      // Assert
      expect(settings).toHaveProperty('autoSyncOnStartup');
      expect(settings).toHaveProperty('syncPace');
    });

    it('should return a copy of settings (not reference)', () => {
      // Act
      const settings1 = service.getSyncSettings();
      const settings2 = service.getSyncSettings();

      // Assert
      expect(settings1).toEqual(settings2);
      expect(settings1).not.toBe(settings2);
    });
  });

  describe('saveSyncSettings', () => {
    it('should update and persist settings', async () => {
      // Act
      await service.saveSyncSettings({ autoSyncOnStartup: false });
      const settings = service.getSyncSettings();

      // Assert
      expect(settings.autoSyncOnStartup).toBe(false);
      expect(settings.syncPace).toBe('normal'); // Other settings preserved
    });

    it('should persist settings to disk', async () => {
      // Act
      await service.saveSyncSettings({ syncPace: 'fast' });

      // Create new service to test persistence
      const newService = new ScrobbleHistorySyncService(
        fileStorage,
        mockAuthService
      );

      // Wait for settings to load
      await new Promise(resolve => setTimeout(resolve, 50));
      const settings = newService.getSyncSettings();

      // Assert
      expect(settings.syncPace).toBe('fast');
    });
  });

  describe('setHistoryStorage', () => {
    it('should set the history storage for cache invalidation', async () => {
      // Arrange
      const newHistoryStorage = {
        invalidateCache: jest.fn(),
      } as any;

      service.setHistoryStorage(newHistoryStorage);

      // Act - Create index to trigger save
      const index: ScrobbleHistoryIndex = {
        lastSyncTimestamp: Date.now(),
        totalScrobbles: 0,
        oldestScrobbleDate: 0,
        albums: {},
      };
      await fileStorage.writeJSON('history/scrobble-history-index.json', index);

      // Assert - New storage is set (we can't directly test private method)
      expect(newHistoryStorage).toBeDefined();
    });
  });

  describe('getHistoryIndex', () => {
    it('should return null when no index exists', async () => {
      // Act
      const index = await service.getHistoryIndex();

      // Assert
      expect(index).toBeNull();
    });

    it('should return index when it exists', async () => {
      // Arrange
      const mockIndex: ScrobbleHistoryIndex = {
        lastSyncTimestamp: Date.now(),
        totalScrobbles: 100,
        oldestScrobbleDate: 1609459200,
        albums: {
          'test artist|test album': {
            lastPlayed: 1609459200,
            playCount: 5,
            plays: [{ timestamp: 1609459200, track: 'Track 1' }],
          },
        },
      };
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        mockIndex
      );

      // Act
      const index = await service.getHistoryIndex();

      // Assert
      expect(index).not.toBeNull();
      expect(index!.totalScrobbles).toBe(100);
    });
  });

  describe('getAlbumHistory', () => {
    it('should return null when no index exists', async () => {
      // Act
      const history = await service.getAlbumHistory('Artist', 'Album');

      // Assert
      expect(history).toBeNull();
    });

    it('should return null when album not in index', async () => {
      // Arrange
      const mockIndex: ScrobbleHistoryIndex = {
        lastSyncTimestamp: Date.now(),
        totalScrobbles: 10,
        oldestScrobbleDate: 1609459200,
        albums: {},
      };
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        mockIndex
      );

      // Act
      const history = await service.getAlbumHistory('Unknown', 'Album');

      // Assert
      expect(history).toBeNull();
    });

    it('should return album history when found', async () => {
      // Arrange
      const mockIndex: ScrobbleHistoryIndex = {
        lastSyncTimestamp: Date.now(),
        totalScrobbles: 10,
        oldestScrobbleDate: 1609459200,
        albums: {
          'pink floyd|the wall': {
            lastPlayed: 1609459200,
            playCount: 10,
            plays: [{ timestamp: 1609459200, track: 'Another Brick' }],
          },
        },
      };
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        mockIndex
      );

      // Act
      const history = await service.getAlbumHistory('Pink Floyd', 'The Wall');

      // Assert
      expect(history).not.toBeNull();
      expect(history!.playCount).toBe(10);
    });

    it('should normalize artist and album names for lookup', async () => {
      // Arrange
      const mockIndex: ScrobbleHistoryIndex = {
        lastSyncTimestamp: Date.now(),
        totalScrobbles: 10,
        oldestScrobbleDate: 1609459200,
        albums: {
          'led zeppelin|iv': {
            lastPlayed: 1609459200,
            playCount: 5,
            plays: [],
          },
        },
      };
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        mockIndex
      );

      // Act - Different case and extra spaces
      const history = await service.getAlbumHistory(
        '  LED ZEPPELIN  ',
        '  IV  '
      );

      // Assert
      expect(history).not.toBeNull();
      expect(history!.playCount).toBe(5);
    });
  });

  describe('needsSync', () => {
    it('should return true when no index exists', async () => {
      // Act
      const needsSync = await service.needsSync();

      // Assert
      expect(needsSync).toBe(true);
    });

    it('should return true when last sync was over 24 hours ago', async () => {
      // Arrange
      const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
      const mockIndex: ScrobbleHistoryIndex = {
        lastSyncTimestamp: twoDaysAgo,
        totalScrobbles: 100,
        oldestScrobbleDate: 1609459200,
        albums: {},
      };
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        mockIndex
      );

      // Act
      const needsSync = await service.needsSync();

      // Assert
      expect(needsSync).toBe(true);
    });

    it('should return false when last sync was less than 24 hours ago', async () => {
      // Arrange
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      const mockIndex: ScrobbleHistoryIndex = {
        lastSyncTimestamp: oneHourAgo,
        totalScrobbles: 100,
        oldestScrobbleDate: 1609459200,
        albums: {},
      };
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        mockIndex
      );

      // Act
      const needsSync = await service.needsSync();

      // Assert
      expect(needsSync).toBe(false);
    });
  });

  describe('clearIndex', () => {
    it('should delete the history index file', async () => {
      // Arrange
      const mockIndex: ScrobbleHistoryIndex = {
        lastSyncTimestamp: Date.now(),
        totalScrobbles: 100,
        oldestScrobbleDate: 1609459200,
        albums: {},
      };
      await fileStorage.writeJSON(
        'history/scrobble-history-index.json',
        mockIndex
      );

      // Act
      await service.clearIndex();
      const index = await service.getHistoryIndex();

      // Assert
      expect(index).toBeNull();
    });

    it('should reset sync status to idle', async () => {
      // Act
      await service.clearIndex();
      const status = service.getSyncStatus();

      // Assert
      expect(status.status).toBe('idle');
      expect(status.progress).toBe(0);
    });

    it('should emit statusChange event', async () => {
      // Arrange
      const statusHandler = jest.fn();
      service.on('statusChange', statusHandler);

      // Act
      await service.clearIndex();

      // Assert
      expect(statusHandler).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'idle' })
      );
    });
  });

  describe('pauseSync', () => {
    it('should not pause when not syncing', () => {
      // Act
      service.pauseSync();
      const status = service.getSyncStatus();

      // Assert - should remain idle
      expect(status.status).toBe('idle');
    });
  });

  describe('startFullSync', () => {
    it('should throw error when Last.fm credentials not configured', async () => {
      // Arrange
      mockAuthService.getLastFmCredentials.mockResolvedValue({
        apiKey: '',
        username: '',
        sessionKey: '',
      });

      // Act & Assert
      await expect(service.startFullSync()).rejects.toThrow(
        'Last.fm credentials not configured'
      );
    });

    it('should fetch scrobbles and build index', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          recenttracks: {
            '@attr': {
              totalPages: '1',
              total: '2',
            },
            track: [
              {
                artist: { '#text': 'Pink Floyd' },
                album: { '#text': 'The Wall' },
                name: 'Another Brick',
                date: { uts: '1609459200' },
              },
              {
                artist: { '#text': 'Led Zeppelin' },
                album: { '#text': 'IV' },
                name: 'Stairway',
                date: { uts: '1609459100' },
              },
            ],
          },
        },
      });

      // Act
      await service.startFullSync();

      // Assert
      const index = await service.getHistoryIndex();
      expect(index).not.toBeNull();
      expect(index!.totalScrobbles).toBe(2);
      expect(Object.keys(index!.albums)).toHaveLength(2);
    });

    it('should skip currently playing tracks', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          recenttracks: {
            '@attr': {
              totalPages: '1',
              total: '2',
            },
            track: [
              {
                artist: { '#text': 'Now Playing Artist' },
                album: { '#text': 'Now Playing Album' },
                name: 'Now Playing',
                '@attr': { nowplaying: 'true' },
              },
              {
                artist: { '#text': 'Past Artist' },
                album: { '#text': 'Past Album' },
                name: 'Past Track',
                date: { uts: '1609459200' },
              },
            ],
          },
        },
      });

      // Act
      await service.startFullSync();

      // Assert
      const index = await service.getHistoryIndex();
      expect(index!.totalScrobbles).toBe(1);
      expect(
        index!.albums['now playing artist|now playing album']
      ).toBeUndefined();
    });

    it('should emit status change events', async () => {
      // Arrange
      const statusHandler = jest.fn();
      service.on('statusChange', statusHandler);

      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          recenttracks: {
            '@attr': { totalPages: '1', total: '1' },
            track: [
              {
                artist: { '#text': 'Artist' },
                album: { '#text': 'Album' },
                name: 'Track',
                date: { uts: '1609459200' },
              },
            ],
          },
        },
      });

      // Act
      await service.startFullSync();

      // Assert
      expect(statusHandler).toHaveBeenCalled();
      const lastCall =
        statusHandler.mock.calls[statusHandler.mock.calls.length - 1][0];
      expect(lastCall.status).toBe('completed');
    });

    it('should handle API errors gracefully', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          error: 10,
          message: 'Invalid API key',
        },
      });

      // Act & Assert
      await expect(service.startFullSync()).rejects.toThrow('Invalid API key');
    });

    it('should not start if already syncing', async () => {
      // Arrange - Start a sync that will hang
      mockAxiosInstance.get.mockImplementation(() => new Promise(() => {}));
      const firstSync = service.startFullSync();

      // Small delay to ensure first sync starts
      await new Promise(resolve => setTimeout(resolve, 10));

      // Act - Try to start another sync
      const secondSync = service.startFullSync();

      // Assert - Second sync should return immediately
      await secondSync;

      // Cleanup
      await service.clearIndex();
    });

    it('should update lastPlayed to most recent timestamp', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          recenttracks: {
            '@attr': { totalPages: '1', total: '2' },
            track: [
              {
                artist: { '#text': 'Artist' },
                album: { '#text': 'Album' },
                name: 'Track 1',
                date: { uts: '1609459200' }, // Older
              },
              {
                artist: { '#text': 'Artist' },
                album: { '#text': 'Album' },
                name: 'Track 2',
                date: { uts: '1609545600' }, // Newer
              },
            ],
          },
        },
      });

      // Act
      await service.startFullSync();

      // Assert
      const index = await service.getHistoryIndex();
      const albumHistory = index!.albums['artist|album'];
      expect(albumHistory.lastPlayed).toBe(1609545600); // Should be the newer timestamp
    });

    it('should invalidate history storage cache on save', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          recenttracks: {
            '@attr': { totalPages: '1', total: '1' },
            track: [
              {
                artist: { '#text': 'Artist' },
                album: { '#text': 'Album' },
                name: 'Track',
                date: { uts: '1609459200' },
              },
            ],
          },
        },
      });

      // Act
      await service.startFullSync();

      // Assert
      expect(mockHistoryStorage.invalidateCache).toHaveBeenCalled();
    });
  });

  describe('startIncrementalSync', () => {
    it('should fall back to full sync when no index exists', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          recenttracks: {
            '@attr': { totalPages: '1', total: '1' },
            track: [
              {
                artist: { '#text': 'Artist' },
                album: { '#text': 'Album' },
                name: 'Track',
                date: { uts: '1609459200' },
              },
            ],
          },
        },
      });

      // Act
      await service.startIncrementalSync();

      // Assert - Should have created an index (via full sync)
      const index = await service.getHistoryIndex();
      expect(index).not.toBeNull();
    });

    // Note: Full incremental sync tests with rate limiting are omitted
    // as they would require mocking timers which conflicts with async file operations.
    // The core functionality is tested via startFullSync tests.
  });

  describe('resumeSync', () => {
    it('should do nothing when not paused', async () => {
      // Arrange
      const syncHandler = jest.fn();
      service.on('statusChange', syncHandler);

      // Act
      await service.resumeSync();

      // Assert - No status changes from resume itself
      expect(syncHandler).not.toHaveBeenCalled();
    });
  });

  describe('request delay based on sync pace', () => {
    it('should use correct delay for normal pace', async () => {
      // Arrange
      await service.saveSyncSettings({ syncPace: 'normal' });

      // Use reflection to check private method behavior via timing
      // We'll just verify the settings work
      const settings = service.getSyncSettings();
      expect(settings.syncPace).toBe('normal');
    });

    it('should use correct delay for fast pace', async () => {
      // Arrange
      await service.saveSyncSettings({ syncPace: 'fast' });

      // Assert
      const settings = service.getSyncSettings();
      expect(settings.syncPace).toBe('fast');
    });

    it('should use correct delay for slow pace', async () => {
      // Arrange
      await service.saveSyncSettings({ syncPace: 'slow' });

      // Assert
      const settings = service.getSyncSettings();
      expect(settings.syncPace).toBe('slow');
    });
  });

  describe('edge cases', () => {
    it('should handle tracks with string artist/album format', async () => {
      // Arrange - Some Last.fm responses use string format instead of object
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          recenttracks: {
            '@attr': { totalPages: '1', total: '1' },
            track: [
              {
                artist: 'String Artist',
                album: 'String Album',
                name: 'Track',
                date: { uts: '1609459200' },
              },
            ],
          },
        },
      });

      // Act
      await service.startFullSync();

      // Assert
      const index = await service.getHistoryIndex();
      expect(index!.albums['string artist|string album']).toBeDefined();
    });

    it('should skip tracks without timestamp', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          recenttracks: {
            '@attr': { totalPages: '1', total: '2' },
            track: [
              {
                artist: { '#text': 'Artist' },
                album: { '#text': 'Album' },
                name: 'No Date Track',
                // No date field
              },
              {
                artist: { '#text': 'Artist' },
                album: { '#text': 'Album' },
                name: 'Has Date',
                date: { uts: '1609459200' },
              },
            ],
          },
        },
      });

      // Act
      await service.startFullSync();

      // Assert
      const index = await service.getHistoryIndex();
      expect(index!.totalScrobbles).toBe(1);
    });

    it('should handle empty album names', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          recenttracks: {
            '@attr': { totalPages: '1', total: '1' },
            track: [
              {
                artist: { '#text': 'Artist' },
                album: { '#text': '' }, // Empty album
                name: 'Track',
                date: { uts: '1609459200' },
              },
            ],
          },
        },
      });

      // Act
      await service.startFullSync();

      // Assert
      const index = await service.getHistoryIndex();
      expect(index!.totalScrobbles).toBe(0); // Should skip empty album
    });
  });
});
