import express, { Request, Response } from 'express';

import { CachedCollectionData, CollectionItem } from '../../shared/types';
import { AuthService } from '../services/authService';
import { DiscogsService } from '../services/discogsService';
import { jobStatusService } from '../services/jobStatusService';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';
import { validateUsername } from '../utils/validation';

// Create router factory function for dependency injection
export default function createCollectionRouter(
  fileStorage: FileStorage,
  authService: AuthService,
  discogsService: DiscogsService
) {
  const router = express.Router();
  const logger = createLogger('CollectionRoutes');

  // Get user's collection (paginated)
  router.get('/:username', async (req: Request, res: Response) => {
    try {
      const { username } = req.params;

      // Validate username to prevent path traversal
      if (!validateUsername(username)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid username format',
        });
      }

      // Check authentication first
      const token = await authService.getDiscogsToken();
      if (!token) {
        return res.status(500).json({
          success: false,
          error: 'No Discogs token available. Please authenticate first.',
        });
      }

      const page = parseInt(req.query.page as string) || 1;
      const perPage = parseInt(req.query.per_page as string) || 50;
      const forceReload = req.query.force_reload === 'true';

      const result = await discogsService.getUserCollection(
        username,
        page,
        perPage,
        forceReload
      );

      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Get user's entire collection for sorting
  router.get('/:username/all', async (req: Request, res: Response) => {
    try {
      const { username } = req.params;

      // Validate username to prevent path traversal
      if (!validateUsername(username)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid username format',
        });
      }

      const forceReload = req.query.force_reload === 'true';

      logger.info(`Loading entire collection for ${username}`, { forceReload });

      // Get all cached pages
      const allItems: CollectionItem[] = [];
      let pageNumber = 1;
      let hasExpiredCache = false;
      let hasValidCache = false;

      while (true) {
        const cacheKey = `collections/${username}-page-${pageNumber}.json`;
        const cached =
          await fileStorage.readJSON<CachedCollectionData>(cacheKey);

        if (!cached || !cached.data) {
          // No cache file found
          break;
        }

        // Check if cache is expired (24 hours = 86400000 ms)
        const isExpired =
          !cached.timestamp || Date.now() - cached.timestamp >= 86400000;
        if (isExpired && !forceReload) {
          const ageMinutes = cached.timestamp
            ? Math.round((Date.now() - cached.timestamp) / 1000 / 60)
            : 'unknown';
          logger.debug(`Cache expired for page ${pageNumber}`, {
            age: `${ageMinutes} minutes`,
          });
          hasExpiredCache = true;
          // If this is the first page and it's expired, trigger automatic refresh
          if (pageNumber === 1) {
            logger.info(
              `First page expired, starting background refresh for ${username}`
            );
            // Start background preloading without waiting for it
            const jobId = jobStatusService.startJob(
              'collection-refresh',
              'Refreshing collection cache...'
            );
            discogsService
              .preloadAllCollectionPages(username)
              .then(() =>
                jobStatusService.completeJob(
                  jobId,
                  'Collection cache refreshed'
                )
              )
              .catch(error => {
                logger.error('Background refresh failed', error);
                jobStatusService.failJob(
                  jobId,
                  'Collection cache refresh failed'
                );
              });
          }
          // Still include expired cache data for now, but mark it as expired
          allItems.push(...cached.data);
          pageNumber++;
          continue;
        }
        if (!isExpired) {
          hasValidCache = true;
        }
        allItems.push(...cached.data);
        pageNumber++;
      }
      logger.info(
        `Loaded ${allItems.length} items from cache for ${username}`,
        {
          expired: hasExpiredCache,
          valid: hasValidCache,
        }
      );

      // Deduplicate items by ID (in case cache has duplicates)
      const uniqueItemsMap = new Map<number, CollectionItem>();
      for (const item of allItems) {
        if (!uniqueItemsMap.has(item.id)) {
          uniqueItemsMap.set(item.id, item);
        }
      }
      const deduplicatedItems = Array.from(uniqueItemsMap.values());

      if (deduplicatedItems.length !== allItems.length) {
        logger.warn(
          `Removed ${allItems.length - deduplicatedItems.length} duplicate items from cache`
        );
      }

      // If we have no items at all, trigger background refresh
      if (deduplicatedItems.length === 0) {
        logger.info(
          `No cache data found for ${username}, starting background refresh`
        );
        const jobId = jobStatusService.startJob(
          'collection-refresh',
          'Fetching collection from Discogs...'
        );
        discogsService
          .preloadAllCollectionPages(username)
          .then(() =>
            jobStatusService.completeJob(
              jobId,
              'Collection loaded from Discogs'
            )
          )
          .catch(error => {
            logger.error('Background refresh failed', error);
            jobStatusService.failJob(
              jobId,
              'Failed to fetch collection from Discogs'
            );
          });

        return res.json({
          success: true,
          data: [],
          total: 0,
          cacheStatus: hasExpiredCache ? 'expired' : 'empty',
          refreshing: true,
          message: hasExpiredCache
            ? 'Cache expired, refreshing in background...'
            : 'Cache empty, fetching from Discogs...',
          timestamp: Date.now(),
        });
      }

      res.json({
        success: true,
        data: deduplicatedItems,
        total: deduplicatedItems.length,
        cacheStatus: hasExpiredCache
          ? hasValidCache
            ? 'partially_expired'
            : 'expired'
          : 'valid',
        refreshing: hasExpiredCache,
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Error loading entire collection', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Search user's collection (using cache)
  router.get('/:username/search', async (req: Request, res: Response) => {
    try {
      const { username } = req.params;

      // Validate username to prevent path traversal
      if (!validateUsername(username)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid username format',
        });
      }

      // Check authentication first
      const token = await authService.getDiscogsToken();
      if (!token) {
        return res.status(500).json({
          success: false,
          error: 'No Discogs token available. Please authenticate first.',
        });
      }

      const { q: query } = req.query;

      if (!query) {
        return res.status(400).json({
          success: false,
          error: 'Search query is required',
        });
      }

      const result = await discogsService.searchCollection(
        username,
        query as string
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Search user's collection with pagination (using cache)
  router.get(
    '/:username/search-paginated',
    async (req: Request, res: Response) => {
      try {
        const { username } = req.params;

        // Validate username to prevent path traversal
        if (!validateUsername(username)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid username format',
          });
        }

        // Check authentication first
        const token = await authService.getDiscogsToken();
        if (!token) {
          return res.status(500).json({
            success: false,
            error: 'No Discogs token available. Please authenticate first.',
          });
        }

        const { q: query } = req.query;
        const page = parseInt(req.query.page as string) || 1;
        const perPage = parseInt(req.query.per_page as string) || 50;

        if (!query) {
          return res.status(400).json({
            success: false,
            error: 'Search query is required',
          });
        }

        const result = await discogsService.searchCollectionFromCache(
          username,
          query as string,
          page,
          perPage
        );

        res.json({
          success: true,
          data: result.items,
          pagination: {
            page,
            per_page: perPage,
            total: result.total,
            pages: result.totalPages,
          },
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // Start preloading all collection pages
  router.post('/:username/preload', async (req: Request, res: Response) => {
    try {
      const { username } = req.params;

      // Validate username to prevent path traversal
      if (!validateUsername(username)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid username format',
        });
      }

      // Start preloading in background (don't await)
      const jobId = jobStatusService.startJob(
        'collection-preload',
        'Preloading collection...'
      );
      discogsService
        .preloadAllCollectionPages(username)
        .then(() => jobStatusService.completeJob(jobId, 'Collection preloaded'))
        .catch(error => {
          logger.error('Background preload failed', error);
          jobStatusService.failJob(jobId, 'Collection preload failed');
        });

      res.json({
        success: true,
        data: { message: 'Collection preloading started in background' },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Get release details
  router.get('/release/:releaseId', async (req: Request, res: Response) => {
    try {
      // Check authentication first
      const token = await authService.getDiscogsToken();
      if (!token) {
        return res.status(500).json({
          success: false,
          error: 'No Discogs token available. Please authenticate first.',
        });
      }

      const releaseId = parseInt(req.params.releaseId);

      if (isNaN(releaseId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid release ID',
        });
      }

      const release = await discogsService.getReleaseDetails(releaseId);

      if (!release) {
        return res.status(404).json({
          success: false,
          error: 'Release not found',
        });
      }

      res.json({
        success: true,
        data: release,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Clear collection cache
  router.delete('/cache', async (req: Request, res: Response) => {
    try {
      await discogsService.clearCache();

      res.json({
        success: true,
        data: { message: 'Collection cache cleared' },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Get cache progress for user
  router.get('/:username/progress', async (req: Request, res: Response) => {
    try {
      const { username } = req.params;

      // Validate username to prevent path traversal
      if (!validateUsername(username)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid username format',
        });
      }

      const progress = await discogsService.getCacheProgress(username);

      res.json({
        success: true,
        data: progress,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Check for new items since last cache update
  router.get('/:username/check-new', async (req: Request, res: Response) => {
    try {
      const { username } = req.params;

      // Validate username to prevent path traversal
      if (!validateUsername(username)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid username format',
        });
      }

      // Check authentication first
      const token = await authService.getDiscogsToken();
      if (!token) {
        return res.status(500).json({
          success: false,
          error: 'No Discogs token available. Please authenticate first.',
        });
      }

      const result = await discogsService.checkForNewItems(username);

      res.json({
        success: result.success,
        data: {
          newItemsCount: result.newItemsCount,
          latestCacheDate: result.latestCacheDate,
          latestDiscogsDate: result.latestDiscogsDate,
        },
        error: result.error,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Update cache with only new items (incremental update)
  router.post('/:username/update-new', async (req: Request, res: Response) => {
    try {
      const { username } = req.params;

      // Validate username to prevent path traversal
      if (!validateUsername(username)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid username format',
        });
      }

      const result = await discogsService.updateCacheWithNewItems(username);

      res.json({
        success: result.success,
        data: {
          newItemsAdded: result.newItemsAdded,
        },
        error: result.error,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
