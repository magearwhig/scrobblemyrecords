import express, { Request, Response } from 'express';

import { AuthService } from '../services/authService';
import { DiscogsService } from '../services/discogsService';
import { FileStorage } from '../utils/fileStorage';

// Create router factory function for dependency injection
export default function createCollectionRouter(
  fileStorage: FileStorage,
  authService: AuthService,
  discogsService: DiscogsService
) {
  const router = express.Router();

  // Get user's collection
  router.get('/:username', async (req: Request, res: Response) => {
    try {
      const { username } = req.params;
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
      const forceReload = req.query.force_reload === 'true';

      console.log(
        `📦 Loading entire collection for ${username} (forceReload: ${forceReload})`
      );

      // Get all cached pages
      const allItems: any[] = [];
      let pageNumber = 1;
      let hasExpiredCache = false;
      let hasValidCache = false;

      while (true) {
        const cacheKey = `collections/${username}-page-${pageNumber}.json`;
        const cached = await fileStorage.readJSON<any>(cacheKey);

        if (!cached || !cached.data) {
          // No cache file found
          break;
        }

        // Check if cache is expired (24 hours = 86400000 ms)
        const isExpired =
          !cached.timestamp || Date.now() - cached.timestamp >= 86400000;
        if (isExpired && !forceReload) {
          console.log(
            `⏰ Cache expired for page ${pageNumber} (age: ${cached.timestamp ? Math.round((Date.now() - cached.timestamp) / 1000 / 60) : 'unknown'} minutes)`
          );
          hasExpiredCache = true;
          // If this is the first page and it's expired, trigger automatic refresh
          if (pageNumber === 1) {
            console.log(
              `🔄 First page expired, starting background refresh for ${username}`
            );
            // Start background preloading without waiting for it
            discogsService.preloadAllCollectionPages(username).catch(error => {
              console.error('Background refresh failed:', error);
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
      console.log(
        `📦 Loaded ${allItems.length} items from cache for ${username} (expired: ${hasExpiredCache}, valid: ${hasValidCache})`
      );

      // If we have no items and expired cache was detected, return appropriate response
      if (allItems.length === 0 && hasExpiredCache) {
        return res.json({
          success: true,
          data: [],
          total: 0,
          cacheStatus: 'expired',
          refreshing: true,
          message: 'Cache expired, refreshing in background...',
          timestamp: Date.now(),
        });
      }

      res.json({
        success: true,
        data: allItems,
        total: allItems.length,
        cacheStatus: hasExpiredCache
          ? hasValidCache
            ? 'partially_expired'
            : 'expired'
          : 'valid',
        refreshing: hasExpiredCache,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Error loading entire collection:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Search user's collection
  router.get('/:username/search', async (req: Request, res: Response) => {
    try {
      const { username } = req.params;
      const { q: query } = req.query;

      if (!query) {
        return res.status(400).json({
          success: false,
          error: 'Search query is required',
        });
      }

      const results = await discogsService.searchCollection(
        username,
        query as string
      );

      res.json({
        success: true,
        data: results,
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
        const { q: query } = req.query;
        const page = parseInt(req.query.page as string) || 1;
        const perPage = parseInt(req.query.per_page as string) || 50;

        if (!query) {
          return res.status(400).json({
            success: false,
            error: 'Search query is required',
          });
        }

        const results = await discogsService.searchCollectionFromCache(
          username,
          query as string,
          page,
          perPage
        );

        res.json({
          success: true,
          data: results.items,
          pagination: {
            page,
            per_page: perPage,
            total: results.total,
            pages: results.totalPages,
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

      // Start preloading in background (don't await)
      discogsService.preloadAllCollectionPages(username).catch(error => {
        console.error('Background preload failed:', error);
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
