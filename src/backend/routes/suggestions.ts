import express, { Request, Response } from 'express';

import {
  CollectionItem,
  SuggestionSettings,
  SyncSettings,
} from '../../shared/types';
import { AIPromptBuilder, AIPromptContext } from '../services/aiPromptBuilder';
import { AnalyticsService } from '../services/analyticsService';
import { artistMappingService } from '../services/artistMappingService';
import { AuthService } from '../services/authService';
import { DiscogsService } from '../services/discogsService';
import { MappingService } from '../services/mappingService';
import {
  DEFAULT_OLLAMA_SETTINGS,
  OllamaService,
  OllamaSettings,
} from '../services/ollamaService';
import { ScrobbleHistoryStorage } from '../services/scrobbleHistoryStorage';
import { ScrobbleHistorySyncService } from '../services/scrobbleHistorySyncService';
import {
  DEFAULT_WEIGHTS,
  SuggestionService,
} from '../services/suggestionService';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

const SUGGESTION_SETTINGS_FILE = 'settings/suggestion-settings.json';
const AI_SETTINGS_FILE = 'settings/ai-settings.json';

/**
 * Create suggestion routes with dependency injection
 */
export default function createSuggestionsRouter(
  fileStorage: FileStorage,
  authService: AuthService,
  discogsService: DiscogsService,
  historyStorage: ScrobbleHistoryStorage,
  syncService: ScrobbleHistorySyncService,
  analyticsService: AnalyticsService,
  suggestionService: SuggestionService,
  mappingService: MappingService
) {
  const router = express.Router();
  const logger = createLogger('SuggestionsRoutes');

  // ============================================
  // Suggestion Endpoints
  // ============================================

  /**
   * GET /api/v1/suggestions
   * Get album suggestions based on weighted factors
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const settings = await authService.getUserSettings();
      const username = settings.discogs.username;
      if (!username) {
        return res.status(401).json({
          success: false,
          error: 'Discogs authentication required',
        });
      }

      const count = parseInt(req.query.count as string) || 5;

      // Load user settings
      const userSettings = await fileStorage.readJSON<SuggestionSettings>(
        SUGGESTION_SETTINGS_FILE
      );

      // Get collection
      const allItems: CollectionItem[] = [];
      let pageNumber = 1;
      while (true) {
        const cacheKey = `collections/${username}-page-${pageNumber}.json`;
        const cached = await fileStorage.readJSON<{
          data: CollectionItem[];
          timestamp: number;
        }>(cacheKey);
        if (!cached || !cached.data) break;
        allItems.push(...cached.data);
        pageNumber++;
      }

      if (allItems.length === 0) {
        return res.json({
          success: true,
          data: [],
          message:
            'No collection items found. Please load your collection first.',
        });
      }

      const suggestions = await suggestionService.getSuggestions(
        allItems,
        count,
        userSettings || undefined
      );

      res.json({
        success: true,
        data: suggestions,
        total: suggestions.length,
      });
    } catch (error) {
      logger.error('Error getting suggestions', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/suggestions/dismiss
   * Dismiss a suggestion to avoid seeing it again soon
   */
  router.post('/dismiss', async (req: Request, res: Response) => {
    try {
      const { albumId } = req.body;

      if (!albumId || typeof albumId !== 'number') {
        return res.status(400).json({
          success: false,
          error: 'Album ID is required',
        });
      }

      suggestionService.dismissSuggestion(albumId);

      res.json({
        success: true,
        data: { message: 'Suggestion dismissed' },
      });
    } catch (error) {
      logger.error('Error dismissing suggestion', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/suggestions/refresh
   * Clear suggestion memory and get fresh suggestions
   */
  router.post('/refresh', async (req: Request, res: Response) => {
    try {
      suggestionService.clearSuggestionMemory();

      res.json({
        success: true,
        data: { message: 'Suggestion memory cleared' },
      });
    } catch (error) {
      logger.error('Error refreshing suggestions', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================
  // Settings Endpoints
  // ============================================

  /**
   * GET /api/v1/suggestions/settings
   * Get user's suggestion weight settings
   */
  router.get('/settings', async (req: Request, res: Response) => {
    try {
      const settings = await fileStorage.readJSON<SuggestionSettings>(
        SUGGESTION_SETTINGS_FILE
      );

      res.json({
        success: true,
        data: settings || {
          weights: DEFAULT_WEIGHTS,
          excludeRecentlyPlayed: false,
          preferNeverPlayed: false,
        },
      });
    } catch (error) {
      logger.error('Error getting suggestion settings', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/suggestions/settings
   * Save user's suggestion weight settings
   */
  router.post('/settings', async (req: Request, res: Response) => {
    try {
      const { weights, excludeRecentlyPlayed, preferNeverPlayed } = req.body;

      const settings: SuggestionSettings = {
        weights: weights || DEFAULT_WEIGHTS,
        excludeRecentlyPlayed: excludeRecentlyPlayed ?? false,
        preferNeverPlayed: preferNeverPlayed ?? false,
      };

      await fileStorage.writeJSON(SUGGESTION_SETTINGS_FILE, settings);

      res.json({
        success: true,
        data: settings,
      });
    } catch (error) {
      logger.error('Error saving suggestion settings', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/v1/suggestions/settings/defaults
   * Get default suggestion weights
   */
  router.get('/settings/defaults', (req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        weights: DEFAULT_WEIGHTS,
        excludeRecentlyPlayed: false,
        preferNeverPlayed: false,
      },
    });
  });

  // ============================================
  // Analytics Endpoints
  // ============================================

  /**
   * GET /api/v1/suggestions/analytics
   * Get analytics summary for suggestions
   */
  router.get('/analytics', async (req: Request, res: Response) => {
    try {
      const summary = await analyticsService.getAnalyticsSummary();

      res.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      logger.error('Error getting analytics', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================
  // History Sync Endpoints
  // ============================================

  /**
   * GET /api/v1/suggestions/history/status
   * Get scrobble history sync status
   */
  router.get('/history/status', async (req: Request, res: Response) => {
    try {
      const syncStatus = syncService.getSyncStatus();
      const storageStats = await historyStorage.getStorageStats();

      res.json({
        success: true,
        data: {
          sync: syncStatus,
          storage: storageStats,
        },
      });
    } catch (error) {
      logger.error('Error getting history status', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/suggestions/history/sync/start
   * Start a full scrobble history sync
   */
  router.post('/history/sync/start', async (req: Request, res: Response) => {
    try {
      const { incremental } = req.body;

      // Start sync in background
      if (incremental) {
        syncService.startIncrementalSync().catch(error => {
          logger.error('Background incremental sync failed', error);
        });
      } else {
        syncService.startFullSync().catch(error => {
          logger.error('Background full sync failed', error);
        });
      }

      res.json({
        success: true,
        data: {
          message: incremental
            ? 'Incremental sync started'
            : 'Full sync started',
          status: syncService.getSyncStatus(),
        },
      });
    } catch (error) {
      logger.error('Error starting sync', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/suggestions/history/sync/pause
   * Pause an ongoing sync
   */
  router.post('/history/sync/pause', (req: Request, res: Response) => {
    try {
      syncService.pauseSync();

      res.json({
        success: true,
        data: {
          message: 'Sync paused',
          status: syncService.getSyncStatus(),
        },
      });
    } catch (error) {
      logger.error('Error pausing sync', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/suggestions/history/sync/resume
   * Resume a paused sync
   */
  router.post('/history/sync/resume', async (req: Request, res: Response) => {
    try {
      syncService.resumeSync().catch(error => {
        logger.error('Background resume failed', error);
      });

      res.json({
        success: true,
        data: {
          message: 'Sync resumed',
          status: syncService.getSyncStatus(),
        },
      });
    } catch (error) {
      logger.error('Error resuming sync', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * DELETE /api/v1/suggestions/history/index
   * Clear the scrobble history index
   */
  router.delete('/history/index', async (req: Request, res: Response) => {
    try {
      await syncService.clearIndex();
      historyStorage.invalidateCache();

      res.json({
        success: true,
        data: { message: 'History index cleared' },
      });
    } catch (error) {
      logger.error('Error clearing history index', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/v1/suggestions/history/sync/settings
   * Get sync settings
   */
  router.get('/history/sync/settings', (req: Request, res: Response) => {
    try {
      const settings = syncService.getSyncSettings();

      res.json({
        success: true,
        data: settings,
      });
    } catch (error) {
      logger.error('Error getting sync settings', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/suggestions/history/sync/settings
   * Save sync settings
   */
  router.post('/history/sync/settings', async (req: Request, res: Response) => {
    try {
      const settings: Partial<SyncSettings> = req.body;
      await syncService.saveSyncSettings(settings);

      res.json({
        success: true,
        data: syncService.getSyncSettings(),
      });
    } catch (error) {
      logger.error('Error saving sync settings', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================
  // Album History Endpoints
  // ============================================

  /**
   * GET /api/v1/suggestions/history/albums
   * Get paginated album history with sorting and search
   */
  router.get('/history/albums', async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const perPage = Math.min(
        parseInt(req.query.per_page as string) || 50,
        100
      );
      const sortBy = (req.query.sort_by as string) || 'playCount';
      const sortOrder = (req.query.sort_order as string) || 'desc';
      const search = req.query.search as string | undefined;

      // Validate sortBy
      const validSortBy = ['playCount', 'lastPlayed', 'artist', 'album'];
      if (!validSortBy.includes(sortBy)) {
        return res.status(400).json({
          success: false,
          error: `Invalid sort_by. Must be one of: ${validSortBy.join(', ')}`,
        });
      }

      // Validate sortOrder
      if (sortOrder !== 'asc' && sortOrder !== 'desc') {
        return res.status(400).json({
          success: false,
          error: 'Invalid sort_order. Must be "asc" or "desc"',
        });
      }

      const result = await historyStorage.getAlbumsPaginated(
        page,
        perPage,
        sortBy as 'playCount' | 'lastPlayed' | 'artist' | 'album',
        sortOrder as 'asc' | 'desc',
        search
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Error getting paginated album history', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================
  // Album History Endpoint (for Release Details page)
  // ============================================

  /**
   * GET /api/v1/suggestions/album-history/:artist/:album
   * Get scrobble history for a specific album
   * Uses fuzzy matching and checks artist name mappings
   */
  router.get(
    '/album-history/:artist/:album',
    async (req: Request, res: Response) => {
      try {
        const { artist, album } = req.params;

        if (!artist || !album) {
          return res.status(400).json({
            success: false,
            error: 'Artist and album are required',
          });
        }

        const decodedArtist = decodeURIComponent(artist);
        const decodedAlbum = decodeURIComponent(album);

        // First try with fuzzy matching on the original artist name
        let result = await historyStorage.getAlbumHistoryFuzzy(
          decodedArtist,
          decodedAlbum
        );

        // If not found, check if artist has a scrobble mapping and try that
        if (result.matchType === 'none') {
          const mappedArtist =
            artistMappingService.getLastfmName(decodedArtist);
          if (mappedArtist !== decodedArtist) {
            logger.debug(
              `Album history: trying mapped artist "${mappedArtist}" for "${decodedArtist}"`
            );
            result = await historyStorage.getAlbumHistoryFuzzy(
              mappedArtist,
              decodedAlbum
            );
          }
        }

        if (result.matchType === 'none' || !result.entry) {
          return res.json({
            success: true,
            data: {
              found: false,
              artist: decodedArtist,
              album: decodedAlbum,
              lastPlayed: null,
              playCount: 0,
              plays: [],
            },
          });
        }

        res.json({
          success: true,
          data: {
            found: true,
            artist: decodedArtist,
            album: decodedAlbum,
            lastPlayed: result.entry.lastPlayed,
            playCount: result.entry.playCount,
            plays: result.entry.plays.slice(-50), // Last 50 plays
            matchType: result.matchType,
            matchedKeys: result.matchedKeys,
          },
        });
      } catch (error) {
        logger.error('Error getting album history', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // ============================================
  // Discovery Endpoints (Missing from Collection)
  // ============================================

  /**
   * GET /api/v1/suggestions/discovery/missing-albums
   * Get albums listened to but not in collection
   */
  router.get(
    '/discovery/missing-albums',
    async (req: Request, res: Response) => {
      try {
        const userSettings = await authService.getUserSettings();
        const username = userSettings.discogs.username;
        if (!username) {
          return res.status(401).json({
            success: false,
            error: 'Discogs authentication required',
          });
        }

        const limit = parseInt(req.query.limit as string) || 20;

        // Get collection
        const allItems: CollectionItem[] = [];
        let pageNumber = 1;
        while (true) {
          const cacheKey = `collections/${username}-page-${pageNumber}.json`;
          const cached = await fileStorage.readJSON<{
            data: CollectionItem[];
            timestamp: number;
          }>(cacheKey);
          if (!cached || !cached.data) break;
          allItems.push(...cached.data);
          pageNumber++;
        }

        const missingAlbums = await analyticsService.getMissingAlbums(
          allItems,
          limit
        );

        res.json({
          success: true,
          data: missingAlbums,
          total: missingAlbums.length,
        });
      } catch (error) {
        logger.error('Error getting missing albums', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /api/v1/suggestions/discovery/missing-artists
   * Get artists listened to but not in collection
   */
  router.get(
    '/discovery/missing-artists',
    async (req: Request, res: Response) => {
      try {
        const userSettings = await authService.getUserSettings();
        const username = userSettings.discogs.username;
        if (!username) {
          return res.status(401).json({
            success: false,
            error: 'Discogs authentication required',
          });
        }

        const limit = parseInt(req.query.limit as string) || 20;

        // Get collection
        const allItems: CollectionItem[] = [];
        let pageNumber = 1;
        while (true) {
          const cacheKey = `collections/${username}-page-${pageNumber}.json`;
          const cached = await fileStorage.readJSON<{
            data: CollectionItem[];
            timestamp: number;
          }>(cacheKey);
          if (!cached || !cached.data) break;
          allItems.push(...cached.data);
          pageNumber++;
        }

        const missingArtists = await analyticsService.getMissingArtists(
          allItems,
          limit
        );

        res.json({
          success: true,
          data: missingArtists,
          total: missingArtists.length,
        });
      } catch (error) {
        logger.error('Error getting missing artists', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // ============================================
  // AI Suggestion Endpoints (Ollama)
  // ============================================

  // Create Ollama service instance
  let ollamaService: OllamaService | null = null;

  // Track recent AI suggestions to avoid repeats (expires after 1 hour)
  const recentAISuggestions: Array<{
    artist: string;
    album: string;
    timestamp: number;
  }> = [];
  const AI_SUGGESTION_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

  const getRecentAISuggestions = (): Array<{
    artist: string;
    album: string;
  }> => {
    const now = Date.now();
    // Filter out expired suggestions and clean up the array
    const validSuggestions = recentAISuggestions.filter(
      s => now - s.timestamp < AI_SUGGESTION_EXPIRY_MS
    );
    // Update the array in place
    recentAISuggestions.length = 0;
    recentAISuggestions.push(...validSuggestions);
    return validSuggestions.map(s => ({ artist: s.artist, album: s.album }));
  };

  const trackAISuggestion = (artist: string, album: string): void => {
    recentAISuggestions.push({ artist, album, timestamp: Date.now() });
    logger.debug(`Tracked AI suggestion: ${artist} - ${album}`);
  };

  const getOllamaService = async (): Promise<OllamaService> => {
    if (!ollamaService) {
      const savedSettings =
        await fileStorage.readJSON<OllamaSettings>(AI_SETTINGS_FILE);
      ollamaService = new OllamaService(savedSettings || undefined);
    }
    return ollamaService;
  };

  /**
   * GET /api/v1/suggestions/ai/status
   * Check Ollama connection status
   */
  router.get('/ai/status', async (req: Request, res: Response) => {
    try {
      const ollama = await getOllamaService();
      const connectionResult = await ollama.checkConnection();
      const settings = ollama.getSettings();

      res.json({
        success: true,
        data: {
          enabled: settings.enabled,
          connected: connectionResult.connected,
          error: connectionResult.error,
          model: settings.model,
          baseUrl: settings.baseUrl,
        },
      });
    } catch (error) {
      logger.error('Error checking AI status', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/v1/suggestions/ai/models
   * Get available Ollama models
   */
  router.get('/ai/models', async (req: Request, res: Response) => {
    try {
      const ollama = await getOllamaService();
      const models = await ollama.getAvailableModels();

      res.json({
        success: true,
        data: models.map(m => ({
          name: m.name,
          size: m.size,
          sizeFormatted: OllamaService.formatModelSize(m.size),
          modifiedAt: m.modifiedAt,
        })),
      });
    } catch (error) {
      logger.error('Error getting AI models', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/v1/suggestions/ai/settings
   * Get AI settings
   */
  router.get('/ai/settings', async (req: Request, res: Response) => {
    try {
      const savedSettings =
        await fileStorage.readJSON<OllamaSettings>(AI_SETTINGS_FILE);
      const settings = savedSettings || DEFAULT_OLLAMA_SETTINGS;

      res.json({
        success: true,
        data: settings,
      });
    } catch (error) {
      logger.error('Error getting AI settings', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/suggestions/ai/settings
   * Save AI settings
   */
  router.post('/ai/settings', async (req: Request, res: Response) => {
    try {
      const settings: Partial<OllamaSettings> = req.body;
      const current =
        (await fileStorage.readJSON<OllamaSettings>(AI_SETTINGS_FILE)) ||
        DEFAULT_OLLAMA_SETTINGS;
      const updated = { ...current, ...settings };

      await fileStorage.writeJSON(AI_SETTINGS_FILE, updated);

      // Update the service instance
      const ollama = await getOllamaService();
      ollama.updateSettings(updated);

      res.json({
        success: true,
        data: updated,
      });
    } catch (error) {
      logger.error('Error saving AI settings', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/suggestions/ai/test
   * Test Ollama connection
   */
  router.post('/ai/test', async (req: Request, res: Response) => {
    try {
      const { baseUrl, model } = req.body;
      const testService = new OllamaService({
        baseUrl: baseUrl || DEFAULT_OLLAMA_SETTINGS.baseUrl,
        model: model || DEFAULT_OLLAMA_SETTINGS.model,
      });

      const connectionResult = await testService.checkConnection();

      if (!connectionResult.connected) {
        return res.json({
          success: true,
          data: {
            connected: false,
            error: connectionResult.error,
          },
        });
      }

      // Check if model is available
      const models = await testService.getAvailableModels();
      const modelAvailable = models.some(
        m => m.name === model || m.name.startsWith(`${model}:`)
      );

      res.json({
        success: true,
        data: {
          connected: true,
          modelAvailable,
          availableModels: models.map(m => m.name),
        },
      });
    } catch (error) {
      logger.error('Error testing AI connection', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/v1/suggestions/ai/suggestion
   * Get an AI-powered suggestion
   */
  router.get('/ai/suggestion', async (req: Request, res: Response) => {
    try {
      const ollama = await getOllamaService();
      const settings = ollama.getSettings();

      if (!settings.enabled) {
        return res.status(400).json({
          success: false,
          error: 'AI suggestions are not enabled',
        });
      }

      const connectionResult = await ollama.checkConnection();
      if (!connectionResult.connected) {
        return res.status(503).json({
          success: false,
          error: connectionResult.error || 'Ollama is not available',
        });
      }

      const userSettings = await authService.getUserSettings();
      const username = userSettings.discogs.username;
      if (!username) {
        return res.status(401).json({
          success: false,
          error: 'Discogs authentication required',
        });
      }

      // Get collection
      const allItems: CollectionItem[] = [];
      let pageNumber = 1;
      while (true) {
        const cacheKey = `collections/${username}-page-${pageNumber}.json`;
        const cached = await fileStorage.readJSON<{
          data: CollectionItem[];
          timestamp: number;
        }>(cacheKey);
        if (!cached || !cached.data) break;
        allItems.push(...cached.data);
        pageNumber++;
      }

      if (allItems.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No collection found. Please load your collection first.',
        });
      }

      // Build context
      const now = new Date();
      const topArtistsMap = await analyticsService.getTopArtistsMap(20);
      const topArtists = Array.from(topArtistsMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([artist, playCount]) => ({ artist, playCount }));

      // Get recently played from history (truly recent, sorted by lastPlayed)
      const recentlyPlayed: AIPromptContext['recentlyPlayed'] = [];
      const recentAlbums = await historyStorage.getRecentlyPlayedAlbums(10);
      for (const album of recentAlbums.slice(0, 5)) {
        recentlyPlayed.push({
          artist: album.artist,
          album: album.album,
          playCount: album.playCount,
          lastPlayed: new Date(album.lastPlayed * 1000),
        });
      }

      // Calculate format breakdown
      const formatBreakdown: Record<string, number> = {};
      for (const item of allItems) {
        for (const format of item.release.format || []) {
          formatBreakdown[format] = (formatBreakdown[format] || 0) + 1;
        }
      }

      // Calculate decade breakdown
      const decadeBreakdown: Record<string, number> = {};
      for (const item of allItems) {
        if (item.release.year) {
          const decade = Math.floor(item.release.year / 10) * 10;
          decadeBreakdown[String(decade)] =
            (decadeBreakdown[String(decade)] || 0) + 1;
        }
      }

      // Get recent AI suggestions to avoid repeating within the hour
      const recentAISuggestionsList = getRecentAISuggestions();

      // Get algorithm-based suggestions for comparison/grounding
      const algorithmPicks = await suggestionService.getSuggestions(
        allItems,
        10
      );

      const context: AIPromptContext = {
        currentTime: now,
        dayOfWeek: AIPromptBuilder.getDayOfWeek(now),
        timeOfDay: AIPromptBuilder.getTimeOfDay(now),
        recentlyPlayed,
        topArtists,
        collection: allItems, // Pass the actual collection!
        collectionSize: allItems.length,
        formatBreakdown,
        decadeBreakdown,
        algorithmPicks, // Include algorithm suggestions for AI comparison
        recentAISuggestions: recentAISuggestionsList,
        userRequest: req.query.mood as string | undefined,
      };

      // Build prompt and get suggestion
      const systemPrompt = AIPromptBuilder.buildSystemPrompt();
      const userPrompt = AIPromptBuilder.buildUserPrompt(context);

      // Build candidate ID set for validation
      const candidates = AIPromptBuilder.buildCandidates(context);
      const candidateIds = new Set(candidates.map(c => c.id));

      // Build avoid ID set (recently played + recent AI suggestions)
      const avoidIds = new Set<number>();
      for (const recent of recentlyPlayed) {
        const match = allItems.find(
          item =>
            item.release.artist.toLowerCase() === recent.artist.toLowerCase() &&
            item.release.title.toLowerCase() === recent.album.toLowerCase()
        );
        if (match) avoidIds.add(match.id);
      }
      for (const aiSugg of recentAISuggestionsList) {
        const match = allItems.find(
          item =>
            item.release.artist.toLowerCase() === aiSugg.artist.toLowerCase() &&
            item.release.title.toLowerCase() === aiSugg.album.toLowerCase()
        );
        if (match) avoidIds.add(match.id);
      }

      // Retry logic for robust AI response handling
      const MAX_RETRIES = 2;
      let response = '';
      let suggestions: ReturnType<typeof AIPromptBuilder.parseAIResponse> = [];
      let lastError = '';

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const messages: Array<{
          role: 'system' | 'user' | 'assistant';
          content: string;
        }> = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ];

        // If retrying, add the previous response and error as context
        if (attempt > 0 && lastError) {
          messages.push({ role: 'assistant', content: response });
          messages.push({
            role: 'user',
            content: `Your response was invalid: ${lastError}\n\nPlease try again. Return ONLY valid JSON with IDs from the CANDIDATES list.`,
          });
        }

        // Use JSON mode for guaranteed valid JSON output
        response = await ollama.chat(messages, { jsonMode: true });

        // Parse and validate
        suggestions = AIPromptBuilder.parseAIResponse(response, allItems);
        const matchedSuggestions = suggestions.filter(s => s.matchedAlbum);

        if (matchedSuggestions.length > 0) {
          // Success! We have valid suggestions
          break;
        }

        // Try to parse for validation errors
        try {
          const jsonMatch = response.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const errors = AIPromptBuilder.validateResponse(
              parsed,
              candidateIds,
              avoidIds
            );
            if (errors.length > 0) {
              lastError = errors.join('; ');
              logger.warn(
                `AI suggestion attempt ${attempt + 1} failed validation: ${lastError}`
              );
            } else {
              lastError = 'No matching albums found in collection';
            }
          } else {
            lastError = 'No valid JSON in response';
          }
        } catch {
          lastError = 'Failed to parse JSON response';
        }

        if (attempt === MAX_RETRIES) {
          logger.warn(
            `AI suggestion exhausted ${MAX_RETRIES + 1} attempts, returning best effort`
          );
        }
      }

      // Track the suggestions so we don't repeat them
      const matchedSuggestions = suggestions.filter(s => s.matchedAlbum);
      for (const suggestion of matchedSuggestions) {
        trackAISuggestion(suggestion.artist, suggestion.album);
      }

      res.json({
        success: true,
        data: {
          suggestions: matchedSuggestions.map(s => ({
            album: s.matchedAlbum,
            reasoning: s.reasoning,
            confidence: s.confidence,
          })),
          rawResponse: response,
          context: {
            timeOfDay: context.timeOfDay,
            dayOfWeek: context.dayOfWeek,
            collectionSize: context.collectionSize,
            candidateCount: candidates.length,
          },
        },
      });
    } catch (error) {
      logger.error('Error getting AI suggestion', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================
  // Manual Mapping Endpoints
  // ============================================

  /**
   * GET /api/v1/suggestions/mappings/albums
   * Get all album mappings
   */
  router.get('/mappings/albums', async (req: Request, res: Response) => {
    try {
      const mappings = await mappingService.getAllAlbumMappings();
      res.json({
        success: true,
        data: mappings,
        total: mappings.length,
      });
    } catch (error) {
      logger.error('Error getting album mappings', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/suggestions/mappings/albums
   * Create a new album mapping
   */
  router.post('/mappings/albums', async (req: Request, res: Response) => {
    try {
      const {
        historyArtist,
        historyAlbum,
        collectionId,
        collectionArtist,
        collectionAlbum,
      } = req.body;

      if (
        !historyArtist ||
        !historyAlbum ||
        !collectionId ||
        !collectionArtist ||
        !collectionAlbum
      ) {
        return res.status(400).json({
          success: false,
          error:
            'Missing required fields: historyArtist, historyAlbum, collectionId, collectionArtist, collectionAlbum',
        });
      }

      await mappingService.addAlbumMapping({
        historyArtist,
        historyAlbum,
        collectionId,
        collectionArtist,
        collectionAlbum,
      });

      res.json({
        success: true,
        message: 'Album mapping created',
      });
    } catch (error) {
      logger.error('Error creating album mapping', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * DELETE /api/v1/suggestions/mappings/albums
   * Remove an album mapping
   */
  router.delete('/mappings/albums', async (req: Request, res: Response) => {
    try {
      const { historyArtist, historyAlbum } = req.body;

      if (!historyArtist || !historyAlbum) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: historyArtist, historyAlbum',
        });
      }

      const removed = await mappingService.removeAlbumMapping(
        historyArtist,
        historyAlbum
      );

      res.json({
        success: true,
        removed,
      });
    } catch (error) {
      logger.error('Error removing album mapping', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/v1/suggestions/mappings/artists
   * Get all artist mappings
   */
  router.get('/mappings/artists', async (req: Request, res: Response) => {
    try {
      const mappings = await mappingService.getAllArtistMappings();
      res.json({
        success: true,
        data: mappings,
        total: mappings.length,
      });
    } catch (error) {
      logger.error('Error getting artist mappings', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/suggestions/mappings/artists
   * Create a new artist mapping
   */
  router.post('/mappings/artists', async (req: Request, res: Response) => {
    try {
      const { historyArtist, collectionArtist } = req.body;

      if (!historyArtist || !collectionArtist) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: historyArtist, collectionArtist',
        });
      }

      await mappingService.addArtistMapping({
        historyArtist,
        collectionArtist,
      });

      res.json({
        success: true,
        message: 'Artist mapping created',
      });
    } catch (error) {
      logger.error('Error creating artist mapping', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * DELETE /api/v1/suggestions/mappings/artists
   * Remove an artist mapping
   */
  router.delete('/mappings/artists', async (req: Request, res: Response) => {
    try {
      const { historyArtist } = req.body;

      if (!historyArtist) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: historyArtist',
        });
      }

      const removed = await mappingService.removeArtistMapping(historyArtist);

      res.json({
        success: true,
        removed,
      });
    } catch (error) {
      logger.error('Error removing artist mapping', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
