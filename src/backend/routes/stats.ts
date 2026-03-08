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
import { artistMappingService } from '../services/artistMappingService';
import { AuthService } from '../services/authService';
import { GenreAnalysisService } from '../services/genreAnalysisService';
import { HistoryIndexMergeService } from '../services/historyIndexMergeService';
import { ImageService } from '../services/imageService';
import { MappingService } from '../services/mappingService';
import { RankingsService } from '../services/rankingsService';
import { ScrobbleHistoryStorage } from '../services/scrobbleHistoryStorage';
import { SellerMonitoringService } from '../services/sellerMonitoringService';
import { StatsService } from '../services/statsService';
import { WishlistService } from '../services/wishlistService';
import { getAllCachedCollectionItems } from '../utils/collectionCache';
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
  analyticsService?: AnalyticsService,
  rankingsService?: RankingsService,
  mappingService?: MappingService,
  historyIndexMergeService?: HistoryIndexMergeService,
  imageService?: ImageService,
  genreAnalysisService?: GenreAnalysisService
) {
  const router = express.Router();
  const logger = createLogger('StatsRoutes');

  /**
   * Helper to load user's collection from cache
   */
  async function loadCollection(username: string) {
    return getAllCachedCollectionItems(username, fileStorage);
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

          // Check which albums are in collection using fuzzy matching
          const collection = username ? await loadCollection(username) : [];
          const collectionByFuzzyKey = new Map<string, CollectionItem>();
          for (const item of collection) {
            let searchArtist = item.release.artist;
            let searchAlbum = item.release.title;

            if (mappingService) {
              const albumMapping =
                await mappingService.getAlbumMappingForCollection(
                  item.release.artist,
                  item.release.title
                );
              if (albumMapping) {
                searchArtist = albumMapping.historyArtist;
                searchAlbum = albumMapping.historyAlbum;
              }
            }

            const fuzzyKey = historyStorage!.fuzzyNormalizeKey(
              searchArtist,
              searchAlbum
            );
            collectionByFuzzyKey.set(fuzzyKey, item);
          }

          return recentAlbums.map(album => {
            const fuzzyKey = historyStorage!.fuzzyNormalizeKey(
              album.artist,
              album.album
            );
            const collectionItem = collectionByFuzzyKey.get(fuzzyKey);

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
          // Load collection for enrichment (cover images + inCollection)
          const collection = username ? await loadCollection(username) : [];

          const [topArtists, topAlbums] = await Promise.all([
            statsService.getTopArtists('month', 5),
            statsService.getTopAlbums(
              'month',
              5,
              undefined,
              undefined,
              collection.length > 0 ? collection : undefined
            ),
          ]);

          return {
            artists: topArtists.map(a => ({
              name: a.artist,
              playCount: a.playCount,
              imageUrl: null, // Artist images would require Last.fm API call
            })),
            albums: topAlbums.map(a => ({
              artist: a.artist,
              album: a.album,
              playCount: a.playCount,
              coverUrl: a.coverUrl || null,
            })),
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

      // Load collection for inCollection enrichment (optional, non-blocking)
      let collection: CollectionItem[] | undefined;
      try {
        const settings = await authService.getUserSettings();
        const username = settings.discogs.username;
        if (username) {
          collection = await loadCollection(username);
        }
      } catch {
        // Collection loading is optional — skip enrichment if it fails
      }

      const topAlbums = await statsService.getTopAlbums(
        period,
        limit,
        startDate,
        endDate,
        collection
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
   * GET /api/v1/stats/new-artists/details
   * Get detailed list of new artists discovered this month
   */
  router.get('/new-artists/details', async (_req: Request, res: Response) => {
    try {
      const artists = await statsService.getNewArtistsDetails();

      res.json({
        success: true,
        data: artists,
      });
    } catch (error) {
      logger.error('Error getting new artists details', error);
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
  // Album Tracks Played
  // ============================================

  /**
   * GET /api/v1/stats/album-tracks-played
   * Get which tracks from an album have been scrobbled.
   * Uses fuzzy matching to handle naming differences.
   *
   * Query params:
   *   artist: string (required)
   *   album: string (required)
   */
  router.get('/album-tracks-played', async (req: Request, res: Response) => {
    try {
      const artist = req.query.artist as string;
      const album = req.query.album as string;

      if (!artist || !album) {
        return res.status(400).json({
          success: false,
          error: 'Both artist and album query parameters are required',
        });
      }

      const tracksPlayed = await statsService.getAlbumTracksPlayed(
        artist,
        album
      );

      res.json({
        success: true,
        data: {
          artist,
          album,
          tracksPlayed,
          totalScrobbledTracks: tracksPlayed.length,
        },
      });
    } catch (error) {
      logger.error('Error getting album tracks played', error);
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

      // Process albums in chunks to avoid OOM from parallel fuzzy matching
      const CHUNK_SIZE = 50;
      const countsOnly = { countsOnly: true };
      const results: AlbumPlayCountResult[] = [];

      for (let i = 0; i < body.albums.length; i += CHUNK_SIZE) {
        const chunk = body.albums.slice(i, i + CHUNK_SIZE);
        const chunkResults = await Promise.all(
          chunk.map(async album => {
            // Try album mappings first (handles Discogs→Last.fm name differences)
            if (mappingService) {
              const albumMappings =
                await mappingService.getAllAlbumMappingsForCollection(
                  album.artist,
                  album.title
                );

              if (albumMappings.length > 0) {
                let totalPlayCount = 0;
                let latestPlayed: number | null = null;
                let bestMatchType: 'exact' | 'fuzzy' | 'none' = 'none';

                for (const mapping of albumMappings) {
                  let result = await historyStorage.getAlbumHistoryFuzzy(
                    mapping.historyArtist,
                    mapping.historyAlbum,
                    countsOnly
                  );

                  // If not found, try artist name mapping as fallback
                  if (result.matchType === 'none') {
                    const mappedArtist = artistMappingService.getLastfmName(
                      mapping.historyArtist
                    );
                    if (mappedArtist !== mapping.historyArtist) {
                      result = await historyStorage.getAlbumHistoryFuzzy(
                        mappedArtist,
                        mapping.historyAlbum,
                        countsOnly
                      );
                    }
                  }

                  if (result.entry && result.matchType !== 'none') {
                    totalPlayCount += result.entry.playCount;
                    if (
                      result.entry.lastPlayed &&
                      (!latestPlayed || result.entry.lastPlayed > latestPlayed)
                    ) {
                      latestPlayed = result.entry.lastPlayed;
                    }
                    if (result.matchType === 'exact') {
                      bestMatchType = 'exact';
                    } else if (
                      result.matchType === 'fuzzy' &&
                      bestMatchType !== 'exact'
                    ) {
                      bestMatchType = 'fuzzy';
                    }
                  }
                }

                if (bestMatchType !== 'none') {
                  return {
                    artist: album.artist,
                    title: album.title,
                    playCount: totalPlayCount,
                    lastPlayed: latestPlayed,
                    matchType: bestMatchType,
                  };
                }
              }
            }

            // No mappings found — try direct fuzzy match with raw Discogs names
            let historyResult = await historyStorage.getAlbumHistoryFuzzy(
              album.artist,
              album.title,
              countsOnly
            );

            // If still not found, try artist name mapping as last resort
            if (historyResult.matchType === 'none') {
              const mappedArtist = artistMappingService.getLastfmName(
                album.artist
              );
              if (mappedArtist !== album.artist) {
                historyResult = await historyStorage.getAlbumHistoryFuzzy(
                  mappedArtist,
                  album.title,
                  countsOnly
                );
              }
            }

            return {
              artist: album.artist,
              title: album.title,
              playCount: historyResult.entry?.playCount || 0,
              lastPlayed: historyResult.entry?.lastPlayed || null,
              matchType: historyResult.matchType,
            };
          })
        );
        results.push(...chunkResults);
      }

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

  // ============================================
  // Artist & Track Deep Dives
  // ============================================

  /**
   * GET /api/v1/stats/artist/:artistName
   * Get detailed stats for a specific artist
   * Query params:
   *   trendPeriod: 'month' | 'week' (default: 'month')
   */
  router.get('/artist/:artistName', async (req: Request, res: Response) => {
    try {
      const artistName = decodeURIComponent(req.params.artistName);
      const trendPeriod =
        (req.query.trendPeriod as 'month' | 'week') || 'month';

      const settings = await authService.getUserSettings();
      const username = settings.discogs.username;
      const collection = username ? await loadCollection(username) : [];

      const data = await statsService.getArtistDetail(
        artistName,
        trendPeriod,
        collection
      );

      res.json({ success: true, data });
    } catch (error) {
      logger.error('Error getting artist detail', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/v1/stats/track
   * Get detailed stats for a specific track
   * Query params:
   *   artist: string (required)
   *   track: string (required)
   *   album: string (optional - filter to specific album)
   *   trendPeriod: 'month' | 'week' (default: 'month')
   */
  router.get('/track', async (req: Request, res: Response) => {
    try {
      const artist = req.query.artist as string;
      const track = req.query.track as string;
      const album = req.query.album as string | undefined;
      const trendPeriod =
        (req.query.trendPeriod as 'month' | 'week') || 'month';

      if (!artist || !track) {
        return res.status(400).json({
          success: false,
          error: 'Both artist and track query parameters are required',
        });
      }

      const settings = await authService.getUserSettings();
      const username = settings.discogs.username;
      const collection = username ? await loadCollection(username) : [];

      const data = await statsService.getTrackDetail(
        artist,
        track,
        album,
        trendPeriod,
        collection
      );

      res.json({ success: true, data });
    } catch (error) {
      logger.error('Error getting track detail', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================
  // Listening Patterns (Hourly & Day-of-Week)
  // ============================================

  /**
   * GET /api/v1/stats/hourly-distribution
   * Get scrobble distribution by hour of day (0-23)
   */
  router.get('/hourly-distribution', async (_req: Request, res: Response) => {
    try {
      const data = await statsService.getHourlyDistribution();

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('Error getting hourly distribution', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/v1/stats/day-of-week-distribution
   * Get scrobble distribution by day of week (0=Sunday through 6=Saturday)
   */
  router.get(
    '/day-of-week-distribution',
    async (_req: Request, res: Response) => {
      try {
        const data = await statsService.getDayOfWeekDistribution();

        res.json({
          success: true,
          data,
        });
      } catch (error) {
        logger.error('Error getting day-of-week distribution', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // ============================================
  // Rankings Over Time
  // ============================================

  /**
   * GET /rankings-over-time
   * Get rankings (tracks/artists/albums) over time for animated visualization
   */
  router.get('/rankings-over-time', async (req: Request, res: Response) => {
    try {
      if (!rankingsService) {
        return res.status(501).json({
          success: false,
          error: 'Rankings service not available',
        });
      }

      // Extract query parameters
      const type = (req.query.type as string) || 'artists';
      const topN = parseInt(req.query.topN as string, 10) || 10;
      const startDate = req.query.startDate
        ? parseInt(req.query.startDate as string, 10)
        : undefined;
      const endDate = req.query.endDate
        ? parseInt(req.query.endDate as string, 10)
        : undefined;

      // Validate type
      if (!['tracks', 'artists', 'albums'].includes(type)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid type. Must be tracks, artists, or albums',
        });
      }

      // Validate topN
      if (isNaN(topN) || topN < 1 || topN > 50) {
        return res.status(400).json({
          success: false,
          error: 'Invalid topN. Must be between 1 and 50',
        });
      }

      const response = await rankingsService.getRankingsOverTime(
        type as 'tracks' | 'artists' | 'albums',
        topN,
        startDate,
        endDate
      );

      res.json({
        success: true,
        data: response,
      });
    } catch (error) {
      logger.error('Error getting rankings over time', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================
  // Heatmap Date Detail
  // ============================================

  /**
   * GET /api/v1/stats/heatmap/:date
   * Get albums played on a specific date (heatmap drill-down).
   * Date must be in YYYY-MM-DD format.
   */
  router.get('/heatmap/:date', async (req: Request, res: Response) => {
    try {
      const dateStr = req.params.date;

      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid date format. Expected YYYY-MM-DD',
        });
      }

      const result = await statsService.getAlbumsForDate(dateStr);

      // Enrich with images if ImageService is available
      if (imageService) {
        await Promise.all(
          result.albums.map(async album => {
            const coverUrl = await imageService.getAlbumCover(
              album.artist,
              album.album
            );
            if (coverUrl) {
              album.coverUrl = coverUrl;
            }
          })
        );
      }

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Error getting albums for date', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================
  // On This Day
  // ============================================

  /**
   * GET /api/v1/stats/on-this-day
   * Get what was listened to on this month/day across all years.
   * Optional query params: month (1-12), day (1-31). Defaults to today.
   */
  router.get('/on-this-day', async (req: Request, res: Response) => {
    try {
      const now = new Date();
      const month = req.query.month
        ? parseInt(req.query.month as string)
        : now.getMonth() + 1;
      const day = req.query.day
        ? parseInt(req.query.day as string)
        : now.getDate();

      // Validate ranges
      if (isNaN(month) || month < 1 || month > 12) {
        return res.status(400).json({
          success: false,
          error: 'Invalid month. Must be between 1 and 12',
        });
      }

      if (isNaN(day) || day < 1 || day > 31) {
        return res.status(400).json({
          success: false,
          error: 'Invalid day. Must be between 1 and 31',
        });
      }

      const result = await statsService.getOnThisDay(month, day);

      // Enrich with images if ImageService is available
      if (imageService) {
        for (const yearEntry of result.years) {
          await Promise.all(
            yearEntry.albums.map(async album => {
              const coverUrl = await imageService.getAlbumCover(
                album.artist,
                album.album
              );
              if (coverUrl) {
                album.coverUrl = coverUrl;
              }
            })
          );
        }
      }

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Error getting on-this-day data', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================
  // Genre Analysis
  // ============================================

  /**
   * GET /api/v1/stats/genres
   * Get genre distribution based on Last.fm artist tags.
   * Query params:
   *   limit: number (default: 50) - Top N artists to analyze
   *   maxTags: number (default: 10) - Max genres to return
   */
  router.get('/genres', async (_req: Request, res: Response) => {
    try {
      if (!genreAnalysisService) {
        return res.status(501).json({
          success: false,
          error: 'Genre analysis service not available',
        });
      }

      const limit = parseInt(_req.query.limit as string) || 50;
      const maxTags = parseInt(_req.query.maxTags as string) || 10;

      const data = await genreAnalysisService.getGenreDistribution(
        limit,
        maxTags
      );

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('Error getting genre distribution', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================
  // Analytics Trio
  // ============================================

  /**
   * GET /api/v1/stats/collection-roi?limit=10
   * Get plays-per-dollar ROI leaderboard for collection albums.
   */
  router.get('/collection-roi', async (req: Request, res: Response) => {
    try {
      const limitParam = req.query.limit as string | undefined;
      const limit = limitParam ? parseInt(limitParam, 10) : undefined;

      if (limit !== undefined && (isNaN(limit) || limit < 1)) {
        return res.status(400).json({
          success: false,
          error: 'limit must be a positive integer',
        });
      }

      const data = await statsService.getCollectionROI(limit);
      res.json({ success: true, data });
    } catch (error) {
      logger.error('Error getting collection ROI', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/v1/stats/album-arc?artist=X&album=Y
   * Get monthly listening arc for a specific album.
   */
  router.get('/album-arc', async (req: Request, res: Response) => {
    try {
      const artist = req.query.artist as string | undefined;
      const album = req.query.album as string | undefined;

      if (!artist || !album) {
        return res.status(400).json({
          success: false,
          error: 'artist and album query parameters are required',
        });
      }

      const data = await statsService.getAlbumListeningArc(artist, album);
      res.json({ success: true, data });
    } catch (error) {
      logger.error('Error getting album arc', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/v1/stats/taste-drift?months=24
   * Get rolling genre share per quarter for the last N months.
   */
  router.get('/taste-drift', async (req: Request, res: Response) => {
    try {
      if (!genreAnalysisService) {
        return res.status(503).json({
          success: false,
          error: 'Genre analysis service not available',
        });
      }

      const monthsParam = req.query.months as string | undefined;
      const months = monthsParam ? parseInt(monthsParam, 10) : 24;

      if (isNaN(months) || months < 1) {
        return res.status(400).json({
          success: false,
          error: 'months must be a positive integer',
        });
      }

      const data = await genreAnalysisService.getTasteDrift(months);
      res.json({ success: true, data });
    } catch (error) {
      logger.error('Error getting taste drift', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================
  // History Index Merge (Split Entry Consolidation)
  // ============================================

  /**
   * GET /api/v1/stats/split-entries
   * Dry-run scan: find history index entries that should be merged
   */
  router.get('/split-entries', async (_req: Request, res: Response) => {
    try {
      if (!historyIndexMergeService) {
        return res.status(503).json({ error: 'Merge service not available' });
      }
      const proposals = await historyIndexMergeService.findSplitEntries();
      res.json({ proposals, count: proposals.length });
    } catch (error) {
      logger.error('Failed to find split entries', error);
      res.status(500).json({ error: 'Failed to find split entries' });
    }
  });

  /**
   * POST /api/v1/stats/merge-split-entries
   * Execute merge of split history index entries
   */
  router.post('/merge-split-entries', async (_req: Request, res: Response) => {
    try {
      if (!historyIndexMergeService) {
        return res.status(503).json({ error: 'Merge service not available' });
      }
      const proposals = await historyIndexMergeService.findSplitEntries();
      if (proposals.length === 0) {
        return res.json({ message: 'No split entries found', mergedCount: 0 });
      }
      const report = await historyIndexMergeService.executeMerge(proposals);
      res.json(report);
    } catch (error) {
      logger.error('Failed to merge split entries', error);
      res.status(500).json({ error: 'Failed to merge split entries' });
    }
  });

  return router;
}
