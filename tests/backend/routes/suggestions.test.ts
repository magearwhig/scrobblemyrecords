import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import request from 'supertest';

import createSuggestionsRouter from '../../../src/backend/routes/suggestions';
import { AnalyticsService } from '../../../src/backend/services/analyticsService';
import { AuthService } from '../../../src/backend/services/authService';
import { DiscogsService } from '../../../src/backend/services/discogsService';
import { HiddenItemService } from '../../../src/backend/services/hiddenItemService';
import { MappingService } from '../../../src/backend/services/mappingService';
import { OllamaService } from '../../../src/backend/services/ollamaService';
import { ScrobbleHistoryStorage } from '../../../src/backend/services/scrobbleHistoryStorage';
import { ScrobbleHistorySyncService } from '../../../src/backend/services/scrobbleHistorySyncService';
import { StatsService } from '../../../src/backend/services/statsService';
import {
  SuggestionService,
  DEFAULT_WEIGHTS,
} from '../../../src/backend/services/suggestionService';
import { TrackMappingService } from '../../../src/backend/services/trackMappingService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';

// Mock dependencies
jest.mock('../../../src/backend/services/authService');
jest.mock('../../../src/backend/services/discogsService');
jest.mock('../../../src/backend/services/scrobbleHistoryStorage');
jest.mock('../../../src/backend/services/scrobbleHistorySyncService');
jest.mock('../../../src/backend/services/analyticsService');
jest.mock('../../../src/backend/services/suggestionService');
jest.mock('../../../src/backend/services/mappingService');
jest.mock('../../../src/backend/services/trackMappingService');
jest.mock('../../../src/backend/services/hiddenItemService');
jest.mock('../../../src/backend/services/statsService');
jest.mock('../../../src/backend/utils/fileStorage');
jest.mock('../../../src/backend/services/ollamaService');

const MockedAuthService = AuthService as jest.MockedClass<typeof AuthService>;
const MockedDiscogsService = DiscogsService as jest.MockedClass<
  typeof DiscogsService
>;
const MockedFileStorage = FileStorage as jest.MockedClass<typeof FileStorage>;
const MockedHistoryStorage = ScrobbleHistoryStorage as jest.MockedClass<
  typeof ScrobbleHistoryStorage
>;
const MockedSyncService = ScrobbleHistorySyncService as jest.MockedClass<
  typeof ScrobbleHistorySyncService
>;
const MockedAnalyticsService = AnalyticsService as jest.MockedClass<
  typeof AnalyticsService
>;
const MockedSuggestionService = SuggestionService as jest.MockedClass<
  typeof SuggestionService
>;
const MockedMappingService = MappingService as jest.MockedClass<
  typeof MappingService
>;
const MockedTrackMappingService = TrackMappingService as jest.MockedClass<
  typeof TrackMappingService
>;
const MockedHiddenItemService = HiddenItemService as jest.MockedClass<
  typeof HiddenItemService
>;
const MockedStatsService = StatsService as jest.MockedClass<
  typeof StatsService
>;
const MockedOllamaService = OllamaService as jest.MockedClass<
  typeof OllamaService
>;

describe('Suggestions Routes', () => {
  let app: express.Application;
  let mockFileStorage: jest.Mocked<FileStorage>;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockDiscogsService: jest.Mocked<DiscogsService>;
  let mockHistoryStorage: jest.Mocked<ScrobbleHistoryStorage>;
  let mockSyncService: jest.Mocked<ScrobbleHistorySyncService>;
  let mockAnalyticsService: jest.Mocked<AnalyticsService>;
  let mockSuggestionService: jest.Mocked<SuggestionService>;
  let mockMappingService: jest.Mocked<MappingService>;
  let mockTrackMappingService: jest.Mocked<TrackMappingService>;
  let mockHiddenItemService: jest.Mocked<HiddenItemService>;
  let mockStatsService: jest.Mocked<StatsService>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock instances
    mockFileStorage = new MockedFileStorage('test') as jest.Mocked<FileStorage>;
    mockAuthService = new MockedAuthService(
      mockFileStorage
    ) as jest.Mocked<AuthService>;
    mockDiscogsService = new MockedDiscogsService(
      mockFileStorage,
      mockAuthService
    ) as jest.Mocked<DiscogsService>;
    mockHistoryStorage = new MockedHistoryStorage(
      mockFileStorage
    ) as jest.Mocked<ScrobbleHistoryStorage>;
    mockSyncService = new MockedSyncService(
      mockFileStorage,
      mockAuthService
    ) as jest.Mocked<ScrobbleHistorySyncService>;
    mockAnalyticsService = new MockedAnalyticsService(
      mockHistoryStorage,
      {} as any
    ) as jest.Mocked<AnalyticsService>;
    mockSuggestionService = new MockedSuggestionService(
      mockAnalyticsService,
      mockHistoryStorage
    ) as jest.Mocked<SuggestionService>;
    mockMappingService = new MockedMappingService(
      mockFileStorage
    ) as jest.Mocked<MappingService>;
    mockTrackMappingService = new MockedTrackMappingService(
      mockFileStorage
    ) as jest.Mocked<TrackMappingService>;
    mockHiddenItemService = new MockedHiddenItemService(
      mockFileStorage
    ) as jest.Mocked<HiddenItemService>;
    mockStatsService = new MockedStatsService(
      mockFileStorage,
      mockHistoryStorage
    ) as jest.Mocked<StatsService>;
    mockStatsService.clearForgottenFavoritesCache = jest.fn();

    // Setup default mocks
    mockAuthService.getUserSettings = jest.fn().mockResolvedValue({
      discogs: { username: 'testuser' },
      lastfm: {},
      preferences: {
        defaultTimestamp: 'now' as const,
        batchSize: 50,
        autoScrobble: false,
      },
    });

    mockFileStorage.readJSON = jest.fn().mockResolvedValue(null);
    mockFileStorage.writeJSON = jest.fn().mockResolvedValue(undefined);

    mockSuggestionService.getSuggestions = jest.fn().mockResolvedValue([]);
    mockSuggestionService.dismissSuggestion = jest.fn();
    mockSuggestionService.clearSuggestionMemory = jest.fn();

    mockAnalyticsService.getAnalyticsSummary = jest.fn().mockResolvedValue({
      hasHistory: false,
      totalScrobbles: 0,
      uniqueAlbums: 0,
      uniqueArtists: 0,
      topArtists: [],
      listeningPatterns: { peakHour: 20, peakDay: 'Saturday' },
    });

    mockAnalyticsService.getMissingAlbums = jest.fn().mockResolvedValue([]);
    mockAnalyticsService.getMissingArtists = jest.fn().mockResolvedValue([]);

    mockSyncService.getSyncStatus = jest.fn().mockReturnValue({
      status: 'idle',
      progress: 0,
      currentPage: 0,
      totalPages: 0,
      scrobblesFetched: 0,
      totalScrobbles: 0,
    });
    mockSyncService.getSyncSettings = jest.fn().mockReturnValue({
      autoSyncOnStartup: true,
      syncPace: 'normal',
    });
    mockSyncService.saveSyncSettings = jest.fn().mockResolvedValue(undefined);
    mockSyncService.startFullSync = jest.fn().mockResolvedValue(undefined);
    mockSyncService.startIncrementalSync = jest
      .fn()
      .mockResolvedValue(undefined);
    mockSyncService.pauseSync = jest.fn();
    mockSyncService.resumeSync = jest.fn().mockResolvedValue(undefined);
    mockSyncService.clearIndex = jest.fn().mockResolvedValue(undefined);
    mockSyncService.getHistoryIndex = jest.fn().mockResolvedValue(null);

    mockHistoryStorage.getStorageStats = jest.fn().mockResolvedValue({
      totalScrobbles: 0,
      totalAlbums: 0,
      oldestScrobble: null,
      newestScrobble: null,
      lastSync: null,
      estimatedSizeBytes: 0,
    });

    // Setup OllamaService mock - mocks the prototype methods
    MockedOllamaService.prototype.getAvailableModels = jest
      .fn()
      .mockResolvedValue([
        { name: 'mistral', size: 4100000000, modifiedAt: '2024-01-01' },
        { name: 'llama3', size: 4700000000, modifiedAt: '2024-01-01' },
      ]);
    MockedOllamaService.prototype.checkConnection = jest
      .fn()
      .mockResolvedValue({ connected: true });
    MockedOllamaService.prototype.getSettings = jest.fn().mockReturnValue({
      enabled: false,
      baseUrl: 'http://localhost:11434',
      model: 'mistral',
      timeout: 30000,
    });
    MockedOllamaService.prototype.updateSettings = jest.fn();
    MockedOllamaService.prototype.generate = jest.fn().mockResolvedValue({
      response: 'Mock AI response',
      context: [],
    });

    // Create Express app
    app = express();
    app.use(helmet());
    app.use(cors());
    app.use(express.json());

    // Mount suggestions routes
    app.use(
      '/api/v1/suggestions',
      createSuggestionsRouter(
        mockFileStorage,
        mockAuthService,
        mockDiscogsService,
        mockHistoryStorage,
        mockSyncService,
        mockAnalyticsService,
        mockSuggestionService,
        mockMappingService,
        mockTrackMappingService,
        mockHiddenItemService,
        mockStatsService
      )
    );
  });

  describe('GET /api/v1/suggestions', () => {
    it('should return 401 when not authenticated', async () => {
      // Arrange
      mockAuthService.getUserSettings.mockResolvedValue({
        discogs: { username: '' },
        lastfm: {},
        preferences: {
          defaultTimestamp: 'now' as const,
          batchSize: 50,
          autoScrobble: false,
        },
      });

      // Act
      const response = await request(app).get('/api/v1/suggestions');

      // Assert
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('authentication required');
    });

    it('should return empty array when no collection items', async () => {
      // Arrange
      mockFileStorage.readJSON.mockResolvedValue(null);

      // Act
      const response = await request(app).get('/api/v1/suggestions');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
    });

    it('should return suggestions when collection exists', async () => {
      // Arrange
      const mockCollection = {
        data: [
          { id: 1, release: { id: 1, title: 'Album 1', artist: 'Artist 1' } },
          { id: 2, release: { id: 2, title: 'Album 2', artist: 'Artist 2' } },
        ],
        timestamp: Date.now(),
      };

      mockFileStorage.readJSON
        .mockResolvedValueOnce(null) // settings file
        .mockResolvedValueOnce(mockCollection) // first page
        .mockResolvedValueOnce(null); // no more pages

      mockSuggestionService.getSuggestions.mockResolvedValue([
        {
          album: mockCollection.data[0] as any,
          score: 0.8,
          factors: {} as any,
          reason: 'Test reason',
        },
      ]);

      // Act
      const response = await request(app).get('/api/v1/suggestions?count=5');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(mockSuggestionService.getSuggestions).toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/suggestions/dismiss', () => {
    it('should dismiss a suggestion', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/suggestions/dismiss')
        .send({ albumId: 123 });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockSuggestionService.dismissSuggestion).toHaveBeenCalledWith(123);
    });

    it('should return 400 when albumId is missing', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/suggestions/dismiss')
        .send({});

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Album ID is required');
    });

    it('should return 400 when albumId is not a number', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/suggestions/dismiss')
        .send({ albumId: 'not-a-number' });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/suggestions/refresh', () => {
    it('should clear suggestion memory', async () => {
      // Act
      const response = await request(app).post('/api/v1/suggestions/refresh');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockSuggestionService.clearSuggestionMemory).toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/suggestions/settings', () => {
    it('should return default settings when none exist', async () => {
      // Arrange
      mockFileStorage.readJSON.mockResolvedValue(null);

      // Act
      const response = await request(app).get('/api/v1/suggestions/settings');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.weights).toEqual(DEFAULT_WEIGHTS);
    });

    it('should return saved settings', async () => {
      // Arrange
      const savedSettings = {
        weights: { ...DEFAULT_WEIGHTS, recencyGap: 2.0 },
        excludeRecentlyPlayed: true,
        preferNeverPlayed: true,
      };
      mockFileStorage.readJSON.mockResolvedValue(savedSettings);

      // Act
      const response = await request(app).get('/api/v1/suggestions/settings');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(savedSettings);
    });
  });

  describe('POST /api/v1/suggestions/settings', () => {
    it('should save settings', async () => {
      // Arrange
      const newSettings = {
        weights: { ...DEFAULT_WEIGHTS, neverPlayed: 2.0 },
        excludeRecentlyPlayed: true,
        preferNeverPlayed: false,
      };

      // Act
      const response = await request(app)
        .post('/api/v1/suggestions/settings')
        .send(newSettings);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockFileStorage.writeJSON).toHaveBeenCalled();
    });

    it('should use defaults when weights not provided', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/suggestions/settings')
        .send({});

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.weights).toEqual(DEFAULT_WEIGHTS);
    });
  });

  describe('GET /api/v1/suggestions/settings/defaults', () => {
    it('should return default settings', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/suggestions/settings/defaults'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.weights).toEqual(DEFAULT_WEIGHTS);
    });
  });

  describe('GET /api/v1/suggestions/analytics', () => {
    it('should return analytics summary', async () => {
      // Act
      const response = await request(app).get('/api/v1/suggestions/analytics');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockAnalyticsService.getAnalyticsSummary).toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/suggestions/history/status', () => {
    it('should return sync and storage status', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/suggestions/history/status'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.sync.status).toBe('idle');
      expect(response.body.data.storage).toBeDefined();
    });
  });

  describe('GET /api/v1/suggestions/history/sync/settings', () => {
    it('should return sync settings', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/suggestions/history/sync/settings'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.autoSyncOnStartup).toBe(true);
    });
  });

  describe('POST /api/v1/suggestions/history/sync/settings', () => {
    it('should update sync settings', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/suggestions/history/sync/settings')
        .send({ autoSyncOnStartup: false, syncPace: 'fast' });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockSyncService.saveSyncSettings).toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/suggestions/history/sync/start', () => {
    it('should start full sync when incremental is false', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/suggestions/history/sync/start')
        .send({ incremental: false });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockSyncService.startFullSync).toHaveBeenCalled();
    });

    it('should start incremental sync when incremental is true', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/suggestions/history/sync/start')
        .send({ incremental: true });

      // Assert
      expect(response.status).toBe(200);
      expect(mockSyncService.startIncrementalSync).toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/suggestions/history/sync/pause', () => {
    it('should pause sync', async () => {
      // Act
      const response = await request(app).post(
        '/api/v1/suggestions/history/sync/pause'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockSyncService.pauseSync).toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/suggestions/history/sync/resume', () => {
    it('should resume sync', async () => {
      // Act
      const response = await request(app).post(
        '/api/v1/suggestions/history/sync/resume'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockSyncService.resumeSync).toHaveBeenCalled();
    });
  });

  describe('DELETE /api/v1/suggestions/history/index', () => {
    it('should clear history index', async () => {
      // Act
      const response = await request(app).delete(
        '/api/v1/suggestions/history/index'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockSyncService.clearIndex).toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/suggestions/discovery/missing-albums', () => {
    it('should return 401 when not authenticated', async () => {
      // Arrange
      mockAuthService.getUserSettings.mockResolvedValue({
        discogs: { username: '' },
        lastfm: {},
        preferences: {
          defaultTimestamp: 'now' as const,
          batchSize: 50,
          autoScrobble: false,
        },
      });

      // Act
      const response = await request(app).get(
        '/api/v1/suggestions/discovery/missing-albums'
      );

      // Assert
      expect(response.status).toBe(401);
    });

    it('should return missing albums', async () => {
      // Arrange
      const mockCollection = {
        data: [{ id: 1, release: { id: 1, title: 'Album 1' } }],
        timestamp: Date.now(),
      };
      mockFileStorage.readJSON
        .mockResolvedValueOnce(mockCollection)
        .mockResolvedValueOnce(null);

      mockAnalyticsService.getMissingAlbums.mockResolvedValue([
        {
          artist: 'Artist',
          album: 'Missing Album',
          playCount: 10,
          lastPlayed: Date.now(),
        },
      ]);

      // Act
      const response = await request(app).get(
        '/api/v1/suggestions/discovery/missing-albums?limit=20'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockAnalyticsService.getMissingAlbums).toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/suggestions/discovery/missing-artists', () => {
    it('should return missing artists', async () => {
      // Arrange
      const mockCollection = {
        data: [{ id: 1, release: { id: 1, artist: 'Artist 1' } }],
        timestamp: Date.now(),
      };
      mockFileStorage.readJSON
        .mockResolvedValueOnce(mockCollection)
        .mockResolvedValueOnce(null);

      mockAnalyticsService.getMissingArtists.mockResolvedValue([
        {
          artist: 'Missing Artist',
          playCount: 50,
          albumCount: 3,
          lastPlayed: Date.now(),
        },
      ]);

      // Act
      const response = await request(app).get(
        '/api/v1/suggestions/discovery/missing-artists?limit=20'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // Error handling tests for better branch coverage
  describe('Error handling', () => {
    it('GET / should handle errors gracefully', async () => {
      // Arrange
      mockFileStorage.readJSON.mockRejectedValue(new Error('Storage error'));

      // Act
      const response = await request(app).get('/api/v1/suggestions');

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });

    it('POST /dismiss should handle errors gracefully', async () => {
      // Arrange
      mockSuggestionService.dismissSuggestion.mockImplementation(() => {
        throw new Error('Dismiss error');
      });

      // Act
      const response = await request(app)
        .post('/api/v1/suggestions/dismiss')
        .send({ albumId: 123 });

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });

    it('POST /refresh should handle errors gracefully', async () => {
      // Arrange
      mockSuggestionService.clearSuggestionMemory.mockImplementation(() => {
        throw new Error('Refresh error');
      });

      // Act
      const response = await request(app).post('/api/v1/suggestions/refresh');

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });

    it('GET /settings should handle errors gracefully', async () => {
      // Arrange
      mockFileStorage.readJSON.mockRejectedValue(new Error('Read error'));

      // Act
      const response = await request(app).get('/api/v1/suggestions/settings');

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });

    it('POST /settings should handle errors gracefully', async () => {
      // Arrange
      mockFileStorage.writeJSON.mockRejectedValue(new Error('Write error'));

      // Act
      const response = await request(app)
        .post('/api/v1/suggestions/settings')
        .send({ weights: DEFAULT_WEIGHTS });

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });

    it('GET /analytics should handle errors gracefully', async () => {
      // Arrange
      mockAnalyticsService.getAnalyticsSummary.mockRejectedValue(
        new Error('Analytics error')
      );

      // Act
      const response = await request(app).get('/api/v1/suggestions/analytics');

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });

    it('GET /history/status should handle errors gracefully', async () => {
      // Arrange
      mockHistoryStorage.getStorageStats.mockRejectedValue(
        new Error('Stats error')
      );

      // Act
      const response = await request(app).get(
        '/api/v1/suggestions/history/status'
      );

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });

    it('POST /history/sync/start should handle errors gracefully', async () => {
      // Arrange
      mockSyncService.startFullSync.mockRejectedValue(new Error('Sync error'));

      // Act
      const response = await request(app)
        .post('/api/v1/suggestions/history/sync/start')
        .send({ incremental: false });

      // Assert - The route catches this error in background
      expect(response.status).toBe(200);
    });

    it('POST /history/sync/resume runs sync in background and returns immediately', async () => {
      // The resumeSync route intentionally doesn't await the sync - it runs in background
      // So errors from resumeSync are just logged, and the route always returns 200
      // This test verifies that behavior

      // Arrange
      mockSyncService.resumeSync.mockRejectedValue(new Error('Resume error'));

      // Act
      const response = await request(app).post(
        '/api/v1/suggestions/history/sync/resume'
      );

      // Assert - Route returns 200 immediately even if resumeSync will fail
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockSyncService.resumeSync).toHaveBeenCalled();
    });

    it('POST /history/sync/resume should handle getSyncStatus errors', async () => {
      // Arrange - getSyncStatus is called after starting resume, so test that error path
      mockSyncService.getSyncStatus.mockImplementation(() => {
        throw new Error('Status error');
      });

      // Act
      const response = await request(app).post(
        '/api/v1/suggestions/history/sync/resume'
      );

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });

    it('DELETE /history/index should handle errors gracefully', async () => {
      // Arrange
      mockSyncService.clearIndex.mockRejectedValue(new Error('Clear error'));

      // Act
      const response = await request(app).delete(
        '/api/v1/suggestions/history/index'
      );

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });

    it('POST /history/sync/settings should handle errors gracefully', async () => {
      // Arrange
      mockSyncService.saveSyncSettings.mockRejectedValue(
        new Error('Settings error')
      );

      // Act
      const response = await request(app)
        .post('/api/v1/suggestions/history/sync/settings')
        .send({ autoSyncOnStartup: false });

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });

    it('GET /discovery/missing-albums should handle errors gracefully', async () => {
      // Arrange
      mockFileStorage.readJSON.mockRejectedValue(new Error('Storage error'));

      // Act
      const response = await request(app).get(
        '/api/v1/suggestions/discovery/missing-albums?limit=20'
      );

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });

    it('GET /discovery/missing-artists should handle errors gracefully', async () => {
      // Arrange
      mockFileStorage.readJSON.mockRejectedValue(new Error('Storage error'));

      // Act
      const response = await request(app).get(
        '/api/v1/suggestions/discovery/missing-artists?limit=20'
      );

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/suggestions/album-history/:artist/:album', () => {
    beforeEach(() => {
      mockHistoryStorage.getAlbumHistoryFuzzy = jest.fn().mockResolvedValue({
        entry: null,
        matchType: 'none',
      });
      mockHistoryStorage.invalidateCache = jest.fn();
    });

    it('should return not found when no history exists', async () => {
      // Arrange
      mockHistoryStorage.getAlbumHistoryFuzzy.mockResolvedValue({
        entry: null,
        matchType: 'none',
      });

      // Act
      const response = await request(app).get(
        '/api/v1/suggestions/album-history/Test%20Artist/Test%20Album'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.found).toBe(false);
      expect(response.body.data.playCount).toBe(0);
      expect(response.body.data.plays).toEqual([]);
    });

    it('should return history when exists', async () => {
      // Arrange
      mockHistoryStorage.getAlbumHistoryFuzzy.mockResolvedValue({
        entry: {
          lastPlayed: 1640000000000,
          playCount: 5,
          plays: [
            { timestamp: 1640000000, track: 'Track 1' },
            { timestamp: 1639000000, track: 'Track 2' },
          ],
        },
        matchType: 'exact',
        matchedKeys: ['test artist|test album'],
      });

      // Act
      const response = await request(app).get(
        '/api/v1/suggestions/album-history/Test%20Artist/Test%20Album'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.found).toBe(true);
      expect(response.body.data.playCount).toBe(5);
      expect(response.body.data.plays).toHaveLength(2);
      expect(response.body.data.matchType).toBe('exact');
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockHistoryStorage.getAlbumHistoryFuzzy.mockRejectedValue(
        new Error('History error')
      );

      // Act
      const response = await request(app).get(
        '/api/v1/suggestions/album-history/Test%20Artist/Test%20Album'
      );

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });

    it('should return fuzzy match results', async () => {
      // Arrange - simulates matching "Album (Deluxe Edition)" when looking for "Album"
      mockHistoryStorage.getAlbumHistoryFuzzy.mockResolvedValue({
        entry: {
          lastPlayed: 1640000000,
          playCount: 10,
          plays: [{ timestamp: 1640000000 }],
        },
        matchType: 'fuzzy',
        matchedKeys: ['test artist|album (deluxe edition)'],
      });

      // Act
      const response = await request(app).get(
        '/api/v1/suggestions/album-history/Test%20Artist/Album'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.found).toBe(true);
      expect(response.body.data.matchType).toBe('fuzzy');
      expect(response.body.data.matchedKeys).toContain(
        'test artist|album (deluxe edition)'
      );
    });
  });

  describe('AI Endpoints', () => {
    it('GET /ai/status should return status', async () => {
      // Act
      const response = await request(app).get('/api/v1/suggestions/ai/status');

      // Assert - The actual status depends on OllamaService mock behavior
      expect(response.status).toBe(200);
    });

    it('GET /ai/models should return models list', async () => {
      // Act
      const response = await request(app).get('/api/v1/suggestions/ai/models');

      // Assert
      expect(response.status).toBe(200);
    });

    it('GET /ai/settings should return settings', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/suggestions/ai/settings'
      );

      // Assert
      expect(response.status).toBe(200);
    });

    it('POST /ai/settings should update settings', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/suggestions/ai/settings')
        .send({ enabled: true, model: 'llama3' });

      // Assert
      expect(response.status).toBe(200);
    });

    it('GET /ai/suggestion should return 400 when AI not enabled', async () => {
      // Arrange - AI is not enabled by default
      mockFileStorage.readJSON.mockResolvedValue(null);

      // Act
      const response = await request(app).get(
        '/api/v1/suggestions/ai/suggestion'
      );

      // Assert - Returns 400 because AI is not enabled
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not enabled');
    });
  });

  describe('Discovery endpoints with collection data', () => {
    it('GET /discovery/missing-artists should return 401 when not authenticated', async () => {
      // Arrange
      mockAuthService.getUserSettings.mockResolvedValue({
        discogs: { username: '' },
        lastfm: {},
        preferences: {
          defaultTimestamp: 'now' as const,
          batchSize: 50,
          autoScrobble: false,
        },
      });

      // Act
      const response = await request(app).get(
        '/api/v1/suggestions/discovery/missing-artists?limit=20'
      );

      // Assert
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('GET /discovery/missing-albums should read collection pages', async () => {
      // Arrange
      const mockCollection = {
        data: [{ id: 1, release: { artist: 'Artist 1', title: 'Album 1' } }],
        timestamp: Date.now(),
      };

      mockFileStorage.readJSON
        .mockResolvedValueOnce(mockCollection) // first page
        .mockResolvedValueOnce(null); // no more pages

      mockAnalyticsService.getMissingAlbums.mockResolvedValue([
        {
          artist: 'Missing Artist',
          album: 'Missing Album',
          playCount: 10,
          lastPlayed: Date.now(),
        },
      ]);

      // Act
      const response = await request(app).get(
        '/api/v1/suggestions/discovery/missing-albums?limit=10'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('GET /discovery/missing-artists should read collection pages', async () => {
      // Arrange
      const mockCollection = {
        data: [{ id: 1, release: { artist: 'Artist 1', title: 'Album 1' } }],
        timestamp: Date.now(),
      };

      mockFileStorage.readJSON
        .mockResolvedValueOnce(mockCollection) // first page
        .mockResolvedValueOnce(null); // no more pages

      mockAnalyticsService.getMissingArtists.mockResolvedValue([
        {
          artist: 'Missing Artist',
          albumCount: 5,
          playCount: 50,
          lastPlayed: Date.now(),
        },
      ]);

      // Act
      const response = await request(app).get(
        '/api/v1/suggestions/discovery/missing-artists?limit=10'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});
