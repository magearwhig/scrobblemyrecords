import express, { Request, Response } from 'express';

import {
  AlbumPlayCountRequest,
  AlbumPlayCountResponse,
  AlbumPlayCountResult,
  CollectionItem,
  DashboardData,
  DashboardQuickActions,
  DashboardQuickStats,
  DashboardRecentAlbum,
  DashboardTopAlbum,
  DashboardTopArtist,
} from '../../shared/types';
import { AnalyticsService } from '../services/analyticsService';
import { AuthService } from '../services/authService';
import { ScrobbleHistoryStorage } from '../services/scrobbleHistoryStorage';
import { SellerMonitoringService } from '../services/sellerMonitoringService';
import { StatsService } from '../services/statsService';
import { WishlistService } from '../services/wishlistService';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

/**
 * Create stats routes with dependency injection
 */
export default function createStatsRouter(
  fileStorage: FileStorage,
  authService: AuthService,
  statsService: StatsService,
  historyStorage?: ScrobbleHistoryStorage,
  wishlistService?: WishlistService,
  sellerMonitoringService?: SellerMonitoringService,
  analyticsService?: AnalyticsService
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
  // Dashboard (Homepage)
  // ============================================

  /**
   * GET /api/v1/stats/dashboard
   * Get aggregated dashboard data for the homepage.
   * Each section can fail independently - errors are isolated per section.
   */
  router.get('/dashboard', async (req: Request, res: Response) => {
    const result: DashboardData = {
      errors: {},
      quickStats: null,
      quickActions: null,
      recentAlbums: null,
      monthlyTopArtists: null,
      monthlyTopAlbums: null,
    };

    try {
      const settings = await authService.getUserSettings();
      const username = settings.discogs.username;

      // Fetch all sections in parallel with error isolation
      const [
        quickStatsResult,
        quickActionsResult,
        recentAlbumsResult,
        monthlyTopResult,
      ] = await Promise.allSettled([
        // Quick stats
        (async (): Promise<DashboardQuickStats> => {
          const [streaks, counts, hours, newArtists, milestones, coverage] =
            await Promise.all([
              statsService.calculateStreaks(),
              statsService.getScrobbleCounts(),
              statsService.getListeningHours(),
              statsService.getNewArtistsThisMonth(),
              statsService.getMilestones(),
              username
                ? statsService.getCollectionCoverage(
                    await loadCollection(username)
                  )
                : Promise.resolve({
                    thisMonth: 0,
                    thisYear: 0,
                    allTime: 0,
                    days30: 0,
                    days90: 0,
                    days365: 0,
                    albumsPlayedThisMonth: 0,
                    albumsPlayedThisYear: 0,
                    albumsPlayedAllTime: 0,
                    albumsPlayedDays30: 0,
                    albumsPlayedDays90: 0,
                    albumsPlayedDays365: 0,
                    totalAlbums: 0,
                  }),
            ]);

          // Calculate average monthly scrobbles from all-time / months since oldest
          let avgMonthly = 0;
          if (historyStorage) {
            const oldestDate = await historyStorage.getOldestScrobbleDate();
            if (oldestDate && counts.allTime > 0) {
              const monthsSince = Math.max(
                1,
                (Date.now() - oldestDate.getTime()) / (30 * 24 * 60 * 60 * 1000)
              );
              avgMonthly = Math.round(counts.allTime / monthsSince);
            }
          }

          return {
            currentStreak: streaks.currentStreak,
            longestStreak: streaks.longestStreak,
            scrobblesThisMonth: counts.thisMonth,
            averageMonthlyScrobbles: avgMonthly,
            newArtistsThisMonth: newArtists,
            collectionCoverageThisMonth: coverage.thisMonth,
            listeningHoursThisMonth: hours.thisMonth,
            totalScrobbles: counts.allTime,
            nextMilestone: milestones.nextMilestone,
          };
        })(),

        // Quick actions
        (async (): Promise<DashboardQuickActions> => {
          // Get seller matches count
          let newSellerMatches = 0;
          if (sellerMonitoringService) {
            const matches = await sellerMonitoringService.getAllMatches();
            newSellerMatches = matches.filter(
              m => m.status === 'active'
            ).length;
          }

          // Get missing albums count using analytics service
          let missingAlbumsCount = 0;
          if (analyticsService && username) {
            const collection = await loadCollection(username);
            // Get a count of missing albums (capped at 100 for performance)
            const missingAlbums = await analyticsService.getMissingAlbums(
              collection,
              100
            );
            missingAlbumsCount = missingAlbums.length;
          }

          // Get want list count (Discogs wantlist + local want list)
          let wantListCount = 0;
          if (wishlistService) {
            const [discogs, local] = await Promise.all([
              wishlistService.getWishlistItems(),
              wishlistService.getLocalWantList(),
            ]);
            wantListCount = discogs.length + local.length;
          }

          // Get dusty corners count
          let dustyCornersCount = 0;
          if (username) {
            const collection = await loadCollection(username);
            const dustyCorners = await statsService.getDustyCorners(
              collection,
              100
            );
            dustyCornersCount = dustyCorners.length;
          }

          return {
            newSellerMatches,
            missingAlbumsCount,
            wantListCount,
            dustyCornersCount,
          };
        })(),

        // Recent albums
        (async (): Promise<DashboardRecentAlbum[]> => {
          if (!historyStorage) {
            return [];
          }

          const recentAlbums = await historyStorage.getRecentlyPlayedAlbums(10);

          // Check which albums are in collection
          const collection = username ? await loadCollection(username) : [];
          const collectionMap = new Map<string, CollectionItem>();
          for (const item of collection) {
            const key = `${item.release.artist.toLowerCase()}|${item.release.title.toLowerCase()}`;
            collectionMap.set(key, item);
          }

          return recentAlbums.map(album => {
            const key = `${album.artist.toLowerCase()}|${album.album.toLowerCase()}`;
            const collectionItem = collectionMap.get(key);

            return {
              artist: album.artist,
              album: album.album,
              coverUrl: collectionItem?.release.cover_image || null,
              lastPlayed: album.lastPlayed,
              releaseId: collectionItem?.release.id,
              inCollection: !!collectionItem,
            };
          });
        })(),

        // Monthly top lists
        (async (): Promise<{
          artists: DashboardTopArtist[];
          albums: DashboardTopAlbum[];
        }> => {
          const [topArtists, topAlbums] = await Promise.all([
            statsService.getTopArtists('month', 5),
            statsService.getTopAlbums('month', 5),
          ]);

          // Get cover images for top albums from collection
          const collection = username ? await loadCollection(username) : [];
          const collectionMap = new Map<string, CollectionItem>();
          for (const item of collection) {
            const key = `${item.release.artist.toLowerCase()}|${item.release.title.toLowerCase()}`;
            collectionMap.set(key, item);
          }

          return {
            artists: topArtists.map(a => ({
              name: a.artist,
              playCount: a.playCount,
              imageUrl: null, // Artist images would require Last.fm API call
            })),
            albums: topAlbums.map(a => {
              const key = `${a.artist.toLowerCase()}|${a.album.toLowerCase()}`;
              const collectionItem = collectionMap.get(key);
              return {
                artist: a.artist,
                album: a.album,
                playCount: a.playCount,
                coverUrl: collectionItem?.release.cover_image || null,
              };
            }),
          };
        })(),
      ]);

      // Map results with error handling
      if (quickStatsResult.status === 'fulfilled') {
        result.quickStats = quickStatsResult.value;
      } else {
        result.errors.quickStats =
          quickStatsResult.reason?.message || 'Failed to load stats';
        logger.error('Dashboard quickStats error', quickStatsResult.reason);
      }

      if (quickActionsResult.status === 'fulfilled') {
        result.quickActions = quickActionsResult.value;
      } else {
        result.errors.quickActions =
          quickActionsResult.reason?.message || 'Failed to load actions';
        logger.error('Dashboard quickActions error', quickActionsResult.reason);
      }

      if (recentAlbumsResult.status === 'fulfilled') {
        result.recentAlbums = recentAlbumsResult.value;
      } else {
        result.errors.recentAlbums =
          recentAlbumsResult.reason?.message || 'Failed to load recent albums';
        logger.error('Dashboard recentAlbums error', recentAlbumsResult.reason);
      }

      if (monthlyTopResult.status === 'fulfilled') {
        result.monthlyTopArtists = monthlyTopResult.value.artists;
        result.monthlyTopAlbums = monthlyTopResult.value.albums;
      } else {
        result.errors.monthlyTop =
          monthlyTopResult.reason?.message ||
          'Failed to load monthly highlights';
        logger.error('Dashboard monthlyTop error', monthlyTopResult.reason);
      }

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Error getting dashboard data', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

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

  // ============================================
  // Album Play Counts (Batch)
  // ============================================

  /**
   * POST /api/v1/stats/album-play-counts
   * Get play counts for multiple albums in a single request.
   * Uses fuzzy matching to handle naming differences between Discogs and Last.fm.
   *
   * Request body:
   *   albums: Array<{ artist: string, title: string }>
   *
   * Response:
   *   results: Array<{ artist, title, playCount, lastPlayed, matchType }>
   */
  router.post('/album-play-counts', async (req: Request, res: Response) => {
    try {
      const body = req.body as AlbumPlayCountRequest;

      // Validate request body
      if (!body || !Array.isArray(body.albums)) {
        return res.status(400).json({
          success: false,
          error: 'Request body must contain an albums array',
        });
      }

      // Validate each album has artist and title
      for (const album of body.albums) {
        if (
          typeof album.artist !== 'string' ||
          typeof album.title !== 'string'
        ) {
          return res.status(400).json({
            success: false,
            error: 'Each album must have artist and title strings',
          });
        }
      }

      // Check if history storage is available
      if (!historyStorage) {
        return res.status(503).json({
          success: false,
          error:
            'Scrobble history not available. Please sync your history first.',
        });
      }

      // Process each album using fuzzy matching
      const results: AlbumPlayCountResult[] = await Promise.all(
        body.albums.map(async album => {
          const historyResult = await historyStorage.getAlbumHistoryFuzzy(
            album.artist,
            album.title
          );

          return {
            artist: album.artist,
            title: album.title,
            playCount: historyResult.entry?.playCount || 0,
            lastPlayed: historyResult.entry?.lastPlayed || null,
            matchType: historyResult.matchType,
          };
        })
      );

      const response: AlbumPlayCountResponse = { results };

      res.json({
        success: true,
        data: response,
      });
    } catch (error) {
      logger.error('Error getting album play counts', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
