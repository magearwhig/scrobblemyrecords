import express, { Request, Response } from 'express';

import { CollectionItem } from '../../shared/types';
import { AuthService } from '../services/authService';
import { StatsService } from '../services/statsService';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

/**
 * Create stats routes with dependency injection
 */
export default function createStatsRouter(
  fileStorage: FileStorage,
  authService: AuthService,
  statsService: StatsService
) {
  const router = express.Router();
  const logger = createLogger('StatsRoutes');

  /**
   * Helper to load user's collection from cache
   */
  async function loadCollection(username: string): Promise<CollectionItem[]> {
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

    return allItems;
  }

  // ============================================
  // Stats Overview
  // ============================================

  /**
   * GET /api/v1/stats/overview
   * Get main stats dashboard data
   */
  router.get('/overview', async (req: Request, res: Response) => {
    try {
      const settings = await authService.getUserSettings();
      const username = settings.discogs.username;

      if (!username) {
        return res.status(401).json({
          success: false,
          error: 'Discogs authentication required',
        });
      }

      const collection = await loadCollection(username);
      const overview = await statsService.getStatsOverview(collection);

      res.json({
        success: true,
        data: overview,
      });
    } catch (error) {
      logger.error('Error getting stats overview', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================
  // Streaks
  // ============================================

  /**
   * GET /api/v1/stats/streaks
   * Get streak information
   */
  router.get('/streaks', async (_req: Request, res: Response) => {
    try {
      const streaks = await statsService.calculateStreaks();

      res.json({
        success: true,
        data: streaks,
      });
    } catch (error) {
      logger.error('Error getting streaks', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================
  // Top Lists
  // ============================================

  /**
   * GET /api/v1/stats/top/artists/:period
   * Get top artists for a time period
   * Query params:
   *   limit: number (default: 10)
   *   startDate: number (Unix timestamp in seconds, for custom period)
   *   endDate: number (Unix timestamp in seconds, for custom period)
   */
  router.get('/top/artists/:period', async (req: Request, res: Response) => {
    try {
      const period = req.params.period as
        | 'week'
        | 'month'
        | 'year'
        | 'all'
        | 'days30'
        | 'days90'
        | 'days365'
        | 'custom';
      const limit = parseInt(req.query.limit as string) || 10;
      const startDate = req.query.startDate
        ? parseInt(req.query.startDate as string)
        : undefined;
      const endDate = req.query.endDate
        ? parseInt(req.query.endDate as string)
        : undefined;

      const validPeriods = [
        'week',
        'month',
        'year',
        'all',
        'days30',
        'days90',
        'days365',
        'custom',
      ];
      if (!validPeriods.includes(period)) {
        return res.status(400).json({
          success: false,
          error:
            'Invalid period. Must be week, month, year, all, days30, days90, days365, or custom',
        });
      }

      if (period === 'custom' && (!startDate || !endDate)) {
        return res.status(400).json({
          success: false,
          error:
            'Custom period requires startDate and endDate query parameters',
        });
      }

      const topArtists = await statsService.getTopArtists(
        period,
        limit,
        startDate,
        endDate
      );

      res.json({
        success: true,
        data: topArtists,
        period,
        ...(period === 'custom' && { startDate, endDate }),
      });
    } catch (error) {
      logger.error('Error getting top artists', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/v1/stats/top/albums/:period
   * Get top albums for a time period
   * Query params:
   *   limit: number (default: 10)
   *   startDate: number (Unix timestamp in seconds, for custom period)
   *   endDate: number (Unix timestamp in seconds, for custom period)
   */
  router.get('/top/albums/:period', async (req: Request, res: Response) => {
    try {
      const period = req.params.period as
        | 'week'
        | 'month'
        | 'year'
        | 'all'
        | 'days30'
        | 'days90'
        | 'days365'
        | 'custom';
      const limit = parseInt(req.query.limit as string) || 10;
      const startDate = req.query.startDate
        ? parseInt(req.query.startDate as string)
        : undefined;
      const endDate = req.query.endDate
        ? parseInt(req.query.endDate as string)
        : undefined;

      const validPeriods = [
        'week',
        'month',
        'year',
        'all',
        'days30',
        'days90',
        'days365',
        'custom',
      ];
      if (!validPeriods.includes(period)) {
        return res.status(400).json({
          success: false,
          error:
            'Invalid period. Must be week, month, year, all, days30, days90, days365, or custom',
        });
      }

      if (period === 'custom' && (!startDate || !endDate)) {
        return res.status(400).json({
          success: false,
          error:
            'Custom period requires startDate and endDate query parameters',
        });
      }

      const topAlbums = await statsService.getTopAlbums(
        period,
        limit,
        startDate,
        endDate
      );

      res.json({
        success: true,
        data: topAlbums,
        period,
        ...(period === 'custom' && { startDate, endDate }),
      });
    } catch (error) {
      logger.error('Error getting top albums', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/v1/stats/top/tracks/:period
   * Get top tracks for a time period
   * Query params:
   *   limit: number (default: 10)
   *   startDate: number (Unix timestamp in seconds, for custom period)
   *   endDate: number (Unix timestamp in seconds, for custom period)
   */
  router.get('/top/tracks/:period', async (req: Request, res: Response) => {
    try {
      const period = req.params.period as
        | 'week'
        | 'month'
        | 'year'
        | 'all'
        | 'days30'
        | 'days90'
        | 'days365'
        | 'custom';
      const limit = parseInt(req.query.limit as string) || 10;
      const startDate = req.query.startDate
        ? parseInt(req.query.startDate as string)
        : undefined;
      const endDate = req.query.endDate
        ? parseInt(req.query.endDate as string)
        : undefined;

      const validPeriods = [
        'week',
        'month',
        'year',
        'all',
        'days30',
        'days90',
        'days365',
        'custom',
      ];
      if (!validPeriods.includes(period)) {
        return res.status(400).json({
          success: false,
          error:
            'Invalid period. Must be week, month, year, all, days30, days90, days365, or custom',
        });
      }

      if (period === 'custom' && (!startDate || !endDate)) {
        return res.status(400).json({
          success: false,
          error:
            'Custom period requires startDate and endDate query parameters',
        });
      }

      const topTracks = await statsService.getTopTracks(
        period,
        limit,
        startDate,
        endDate
      );

      res.json({
        success: true,
        data: topTracks,
        period,
        ...(period === 'custom' && { startDate, endDate }),
      });
    } catch (error) {
      logger.error('Error getting top tracks', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================
  // Collection Stats
  // ============================================

  /**
   * GET /api/v1/stats/collection/coverage
   * Get collection coverage stats
   */
  router.get('/collection/coverage', async (req: Request, res: Response) => {
    try {
      const settings = await authService.getUserSettings();
      const username = settings.discogs.username;

      if (!username) {
        return res.status(401).json({
          success: false,
          error: 'Discogs authentication required',
        });
      }

      const collection = await loadCollection(username);
      const coverage = await statsService.getCollectionCoverage(collection);

      res.json({
        success: true,
        data: coverage,
      });
    } catch (error) {
      logger.error('Error getting collection coverage', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/v1/stats/dusty-corners
   * Get albums not played in 6+ months
   */
  router.get('/dusty-corners', async (req: Request, res: Response) => {
    try {
      const settings = await authService.getUserSettings();
      const username = settings.discogs.username;

      if (!username) {
        return res.status(401).json({
          success: false,
          error: 'Discogs authentication required',
        });
      }

      const limit = parseInt(req.query.limit as string) || 20;
      const collection = await loadCollection(username);
      const dustyCorners = await statsService.getDustyCorners(
        collection,
        limit
      );

      res.json({
        success: true,
        data: dustyCorners,
        total: dustyCorners.length,
      });
    } catch (error) {
      logger.error('Error getting dusty corners', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/v1/stats/heavy-rotation
   * Get most played albums from collection
   */
  router.get('/heavy-rotation', async (req: Request, res: Response) => {
    try {
      const settings = await authService.getUserSettings();
      const username = settings.discogs.username;

      if (!username) {
        return res.status(401).json({
          success: false,
          error: 'Discogs authentication required',
        });
      }

      const limit = parseInt(req.query.limit as string) || 10;
      const collection = await loadCollection(username);
      const heavyRotation = await statsService.getHeavyRotation(
        collection,
        limit
      );

      res.json({
        success: true,
        data: heavyRotation,
        total: heavyRotation.length,
      });
    } catch (error) {
      logger.error('Error getting heavy rotation', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/v1/stats/forgotten-favorites
   * Get tracks with high play counts that haven't been played recently.
   * Query params:
   *   dormantDays: number (default: 90) - Days since last play to consider "forgotten"
   *   minPlays: number (default: 10) - Minimum all-time play count
   *   limit: number (default: 100, max: 100) - Max results
   */
  router.get('/forgotten-favorites', async (req: Request, res: Response) => {
    try {
      // Parse and validate query params with sensible defaults and bounds
      const dormantDays = Math.max(
        1,
        parseInt(req.query.dormantDays as string) || 90
      );
      const minPlays = Math.max(
        1,
        parseInt(req.query.minPlays as string) || 10
      );
      const limit = Math.min(
        100,
        Math.max(1, parseInt(req.query.limit as string) || 100)
      );

      const result = await statsService.getForgottenFavorites(
        dormantDays,
        minPlays,
        limit
      );

      res.json({
        success: true,
        data: result.tracks,
        meta: {
          dormantDays,
          minPlays,
          limit,
          returned: result.tracks.length,
          totalMatching: result.totalMatching,
        },
      });
    } catch (error) {
      logger.error('Error getting forgotten favorites', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================
  // Heatmap
  // ============================================

  /**
   * GET /api/v1/stats/heatmap
   * Get calendar heatmap data
   */
  router.get('/heatmap', async (req: Request, res: Response) => {
    try {
      const year = req.query.year
        ? parseInt(req.query.year as string)
        : undefined;

      const heatmapData = await statsService.getCalendarHeatmap(year);

      res.json({
        success: true,
        data: heatmapData,
        year: year || new Date().getFullYear(),
      });
    } catch (error) {
      logger.error('Error getting heatmap data', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================
  // Milestones
  // ============================================

  /**
   * GET /api/v1/stats/milestones
   * Get milestone progress and history
   */
  router.get('/milestones', async (_req: Request, res: Response) => {
    try {
      const milestones = await statsService.getMilestones();

      res.json({
        success: true,
        data: milestones,
      });
    } catch (error) {
      logger.error('Error getting milestones', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================
  // Counts
  // ============================================

  /**
   * GET /api/v1/stats/counts
   * Get scrobble counts for various periods
   */
  router.get('/counts', async (_req: Request, res: Response) => {
    try {
      const counts = await statsService.getScrobbleCounts();

      res.json({
        success: true,
        data: counts,
      });
    } catch (error) {
      logger.error('Error getting scrobble counts', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/v1/stats/new-artists
   * Get count of new artists listened to this month
   */
  router.get('/new-artists', async (_req: Request, res: Response) => {
    try {
      const count = await statsService.getNewArtistsThisMonth();

      res.json({
        success: true,
        data: { count },
      });
    } catch (error) {
      logger.error('Error getting new artists count', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/v1/stats/listening-hours
   * Get listening hours for various periods
   */
  router.get('/listening-hours', async (_req: Request, res: Response) => {
    try {
      const hours = await statsService.getListeningHours();

      res.json({
        success: true,
        data: hours,
      });
    } catch (error) {
      logger.error('Error getting listening hours', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================
  // Source Breakdown
  // ============================================

  /**
   * GET /api/v1/stats/sources
   * Get breakdown of scrobble sources (RecordScrobbles vs Other)
   */
  router.get('/sources', async (_req: Request, res: Response) => {
    try {
      const sources = await statsService.getSourceBreakdown();

      res.json({
        success: true,
        data: sources,
      });
    } catch (error) {
      logger.error('Error getting source breakdown', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================
  // Timeline
  // ============================================

  /**
   * GET /api/v1/stats/timeline
   * Get listening timeline data for charts
   * Query params:
   *   period: 'week' | 'month' | 'year' | 'days30' | 'days90' | 'days365' | 'custom' (default: 'year')
   *   granularity: 'day' | 'week' | 'month' (default: 'week')
   *   startDate: number (Unix timestamp in seconds, for custom period)
   *   endDate: number (Unix timestamp in seconds, for custom period)
   */
  router.get('/timeline', async (req: Request, res: Response) => {
    try {
      const period =
        (req.query.period as
          | 'week'
          | 'month'
          | 'year'
          | 'days30'
          | 'days90'
          | 'days365'
          | 'custom') || 'year';
      const granularity =
        (req.query.granularity as 'day' | 'week' | 'month') || 'week';
      const startDate = req.query.startDate
        ? parseInt(req.query.startDate as string)
        : undefined;
      const endDate = req.query.endDate
        ? parseInt(req.query.endDate as string)
        : undefined;

      if (period === 'custom' && (!startDate || !endDate)) {
        return res.status(400).json({
          success: false,
          error:
            'Custom period requires startDate and endDate query parameters',
        });
      }

      const timeline = await statsService.getListeningTimeline(
        period,
        granularity,
        startDate,
        endDate
      );

      res.json({
        success: true,
        data: timeline,
        period,
        granularity,
        ...(period === 'custom' && { startDate, endDate }),
      });
    } catch (error) {
      logger.error('Error getting timeline data', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
