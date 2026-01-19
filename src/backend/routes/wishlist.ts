import express, { Request, Response } from 'express';

import { AuthService } from '../services/authService';
import { SellerMonitoringService } from '../services/sellerMonitoringService';
import { WishlistService } from '../services/wishlistService';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

/**
 * Create wishlist routes with dependency injection
 *
 * IMPORTANT: Route ordering matters in Express!
 * Static routes must be defined BEFORE parameterized routes.
 * Otherwise, requests like GET /settings would match /:masterId/versions
 */
export default function createWishlistRouter(
  _fileStorage: FileStorage,
  authService: AuthService,
  wishlistService: WishlistService,
  sellerMonitoringService?: SellerMonitoringService
) {
  const router = express.Router();
  const logger = createLogger('WishlistRoutes');

  // ============================================
  // Static Routes (must come before parameterized routes)
  // ============================================

  // ---- Wishlist Items ----

  /**
   * GET /api/v1/wishlist
   * Get all wishlist items
   */
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const items = await wishlistService.getWishlistItems();

      res.json({
        success: true,
        data: items,
        total: items.length,
      });
    } catch (error) {
      logger.error('Error getting wishlist items', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ---- Sync Operations ----

  /**
   * GET /api/v1/wishlist/sync
   * Get sync status
   */
  router.get('/sync', async (_req: Request, res: Response) => {
    try {
      const status = await wishlistService.getSyncStatus();

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      logger.error('Error getting sync status', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/wishlist/sync
   * Trigger wishlist sync
   * Body: { forceRefresh?: boolean } - If true, re-check vinyl status for all items
   *
   * Note: The sync operation runs synchronously and returns after completion.
   * For large wishlists, this may take several minutes due to rate limiting.
   * After sync, updates the seller monitoring release cache for any new masters.
   */
  router.post('/sync', async (req: Request, res: Response) => {
    try {
      const settings = await authService.getUserSettings();
      const username = settings.discogs.username;
      const { forceRefresh } = req.body;

      if (!username) {
        return res.status(401).json({
          success: false,
          error: 'Discogs authentication required',
        });
      }

      // Capture existing master IDs before sync
      const existingItems = await wishlistService.getWishlistItems();
      const existingMasterIds = new Set(
        existingItems
          .map(item => item.masterId)
          .filter((id): id is number => !!id)
      );

      // Run the sync
      const status = await wishlistService.syncWishlist(
        username,
        forceRefresh === true
      );

      // After sync, check for new master IDs and update the release cache
      let cacheUpdateResult:
        | { mastersProcessed: number; releasesAdded: number }
        | undefined;
      if (sellerMonitoringService) {
        const updatedItems = await wishlistService.getWishlistItems();
        const newMasterIds = updatedItems
          .map(item => item.masterId)
          .filter((id): id is number => !!id && !existingMasterIds.has(id));

        if (newMasterIds.length > 0) {
          logger.info(
            `Found ${newMasterIds.length} new master IDs after wishlist sync, updating release cache...`
          );
          cacheUpdateResult =
            await sellerMonitoringService.updateCacheForMasters(newMasterIds);
        }
      }

      res.json({
        success: true,
        message: forceRefresh
          ? 'Full wishlist refresh completed'
          : 'Wishlist sync completed',
        data: status,
        cacheUpdate: cacheUpdateResult,
      });
    } catch (error) {
      logger.error('Error during wishlist sync', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ---- Settings ----

  /**
   * GET /api/v1/wishlist/settings
   * Get wishlist settings
   */
  router.get('/settings', async (_req: Request, res: Response) => {
    try {
      const settings = await wishlistService.getSettings();

      res.json({
        success: true,
        data: settings,
      });
    } catch (error) {
      logger.error('Error getting wishlist settings', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/wishlist/settings
   * Save wishlist settings
   */
  router.post('/settings', async (req: Request, res: Response) => {
    try {
      const {
        priceThreshold,
        currency,
        autoSyncInterval,
        notifyOnVinylAvailable,
        newReleaseTracking,
      } = req.body;

      const settings = await wishlistService.saveSettings({
        priceThreshold,
        currency,
        autoSyncInterval,
        notifyOnVinylAvailable,
        newReleaseTracking,
      });

      res.json({
        success: true,
        data: settings,
      });
    } catch (error) {
      logger.error('Error saving wishlist settings', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ---- Local Want List Vinyl Check ----

  /**
   * POST /api/v1/wishlist/local-want/check-vinyl
   * Check local want list for newly available vinyl
   */
  router.post(
    '/local-want/check-vinyl',
    async (_req: Request, res: Response) => {
      try {
        const newlyAvailable =
          await wishlistService.checkLocalWantListForVinyl();

        res.json({
          success: true,
          data: newlyAvailable,
          newlyAvailableCount: newlyAvailable.length,
        });
      } catch (error) {
        logger.error('Error checking local want list for vinyl', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // ---- Discogs Wantlist Management ----

  /**
   * GET /api/v1/wishlist/search
   * Search Discogs for releases to add to wantlist
   */
  router.get('/search', async (req: Request, res: Response) => {
    try {
      const { artist, album } = req.query;

      if (!artist || !album) {
        return res.status(400).json({
          success: false,
          error: 'artist and album query parameters are required',
        });
      }

      const results = await wishlistService.searchForRelease(
        artist as string,
        album as string
      );

      res.json({
        success: true,
        data: results,
        total: results.length,
      });
    } catch (error) {
      logger.error('Error searching Discogs', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/wishlist/add
   * Add a release to the user's Discogs wantlist
   */
  router.post('/add', async (req: Request, res: Response) => {
    try {
      const { releaseId, notes, rating } = req.body;

      if (!releaseId) {
        return res.status(400).json({
          success: false,
          error: 'releaseId is required',
        });
      }

      await wishlistService.addToDiscogsWantlist(releaseId, notes, rating);

      res.json({
        success: true,
        message: 'Added to Discogs wantlist',
      });
    } catch (error) {
      logger.error('Error adding to wantlist', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ---- Local Want List (Discovery tracking) ----

  /**
   * GET /api/v1/wishlist/local
   * Get the local want list (albums from Discovery page)
   */
  router.get('/local', async (_req: Request, res: Response) => {
    try {
      const items = await wishlistService.getLocalWantList();

      res.json({
        success: true,
        data: items,
        total: items.length,
      });
    } catch (error) {
      logger.error('Error getting local want list', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/wishlist/local
   * Add an album to the local want list
   */
  router.post('/local', async (req: Request, res: Response) => {
    try {
      const { artist, album, playCount, lastPlayed } = req.body;

      if (!artist || !album) {
        return res.status(400).json({
          success: false,
          error: 'artist and album are required',
        });
      }

      const item = await wishlistService.addToLocalWantList({
        artist,
        album,
        playCount: playCount || 0,
        lastPlayed: lastPlayed || Date.now(),
      });

      res.json({
        success: true,
        message: 'Added to local want list',
        data: item,
      });
    } catch (error) {
      logger.error('Error adding to local want list', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/wishlist/local/check
   * Check local want list items for vinyl availability
   */
  router.post('/local/check', async (_req: Request, res: Response) => {
    try {
      const newlyAvailable = await wishlistService.checkLocalWantListForVinyl();

      res.json({
        success: true,
        data: newlyAvailable,
        newlyAvailableCount: newlyAvailable.length,
      });
    } catch (error) {
      logger.error('Error checking local want list', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================
  // Routes with Specific Path Prefixes + Params
  // (Must come before generic parameterized routes)
  // ============================================

  /**
   * DELETE /api/v1/wishlist/remove/:releaseId
   * Remove a release from the user's Discogs wantlist
   */
  router.delete('/remove/:releaseId', async (req: Request, res: Response) => {
    try {
      const releaseId = parseInt(req.params.releaseId, 10);

      if (isNaN(releaseId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid release ID',
        });
      }

      await wishlistService.removeFromDiscogsWantlist(releaseId);

      res.json({
        success: true,
        message: 'Removed from Discogs wantlist',
      });
    } catch (error) {
      logger.error('Error removing from wantlist', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * DELETE /api/v1/wishlist/local/:id
   * Remove an album from the local want list
   */
  router.delete('/local/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const removed = await wishlistService.removeFromLocalWantList(id);

      if (!removed) {
        return res.status(404).json({
          success: false,
          error: 'Item not found in local want list',
        });
      }

      res.json({
        success: true,
        message: 'Removed from local want list',
      });
    } catch (error) {
      logger.error('Error removing from local want list', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================
  // Feature 5.5: New Release Tracking Routes
  // ============================================

  /**
   * GET /api/v1/wishlist/new-releases
   * Get detected new releases
   * Query params:
   *   - source: 'wishlist' | 'local_want' (optional)
   *   - days: number (filter by detectedAt, e.g., 7, 30, 90)
   *   - showDismissed: 'true' to include dismissed items
   */
  router.get('/new-releases', async (req: Request, res: Response) => {
    try {
      const store = await wishlistService.getNewReleases();
      const { source, days, showDismissed } = req.query;

      let releases = store.releases;

      // Filter out dismissed unless explicitly requested
      if (showDismissed !== 'true') {
        releases = releases.filter(r => !r.dismissed);
      }

      // Filter by source
      if (source && typeof source === 'string') {
        releases = releases.filter(r => r.source === source);
      }

      // Filter by time (detectedAt)
      if (days && typeof days === 'string') {
        const cutoff = Date.now() - parseInt(days, 10) * 24 * 60 * 60 * 1000;
        releases = releases.filter(r => r.detectedAt >= cutoff);
      }

      // Sort by detectedAt descending (newest first)
      releases.sort((a, b) => b.detectedAt - a.detectedAt);

      res.json({
        success: true,
        data: {
          lastCheck: store.lastCheck,
          releases,
          count: releases.length,
        },
      });
    } catch (error) {
      logger.error('Error getting new releases', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/v1/wishlist/new-releases/status
   * Get new release check sync status
   */
  router.get('/new-releases/status', async (_req: Request, res: Response) => {
    try {
      const status = await wishlistService.getNewReleaseSyncStatus();
      res.json({ success: true, data: status });
    } catch (error) {
      logger.error('Error getting new release sync status', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/wishlist/new-releases/check
   * Trigger check for new releases
   * Returns immediately, check runs in background
   */
  router.post('/new-releases/check', async (_req: Request, res: Response) => {
    try {
      // Return immediately
      res.json({ success: true, data: { message: 'Check started' } });

      // Run check asynchronously
      wishlistService.checkForNewReleases(true).catch(error => {
        logger.error('Background new release check failed', error);
      });
    } catch (error) {
      logger.error('Error starting new release check', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * PATCH /api/v1/wishlist/new-releases/:id/dismiss
   * Dismiss a new release alert
   */
  router.patch(
    '/new-releases/:id/dismiss',
    async (req: Request, res: Response) => {
      try {
        await wishlistService.dismissNewRelease(req.params.id);
        res.json({ success: true });
      } catch (error) {
        logger.error('Error dismissing new release', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * POST /api/v1/wishlist/new-releases/dismiss-bulk
   * Dismiss multiple new release alerts at once
   * Body: { ids: string[] } - Array of release IDs to dismiss
   */
  router.post(
    '/new-releases/dismiss-bulk',
    async (req: Request, res: Response) => {
      try {
        const { ids } = req.body || {};

        if (!ids || !Array.isArray(ids)) {
          return res.status(400).json({
            success: false,
            error: 'ids array is required',
          });
        }

        const dismissed = await wishlistService.dismissNewReleasesBulk(ids);
        res.json({ success: true, data: { dismissed } });
      } catch (error) {
        logger.error('Error bulk dismissing new releases', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * POST /api/v1/wishlist/new-releases/dismiss-all
   * Dismiss all non-dismissed new releases
   */
  router.post(
    '/new-releases/dismiss-all',
    async (req: Request, res: Response) => {
      try {
        const dismissed = await wishlistService.dismissAllNewReleases();
        res.json({ success: true, data: { dismissed } });
      } catch (error) {
        logger.error('Error dismissing all new releases', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * POST /api/v1/wishlist/new-releases/cleanup
   * Clean up old dismissed items
   * Body: { maxAgeDays?: number } - Default 90
   */
  router.post('/new-releases/cleanup', async (req: Request, res: Response) => {
    try {
      const { maxAgeDays = 90 } = req.body || {};
      const removed =
        await wishlistService.cleanupDismissedReleases(maxAgeDays);
      res.json({ success: true, data: { removed } });
    } catch (error) {
      logger.error('Error cleaning up dismissed releases', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================
  // Generic Parameterized Routes (must be last!)
  // These would otherwise match static paths like /settings
  // ============================================

  /**
   * GET /api/v1/wishlist/:masterId/versions
   * Get all versions for a master release
   */
  router.get('/:masterId/versions', async (req: Request, res: Response) => {
    try {
      const masterId = parseInt(req.params.masterId, 10);

      if (isNaN(masterId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid master ID',
        });
      }

      const versions = await wishlistService.getMasterVersions(masterId);

      res.json({
        success: true,
        data: versions,
        total: versions.length,
        vinylCount: versions.filter(v => v.hasVinyl).length,
      });
    } catch (error) {
      logger.error('Error getting master versions', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/v1/wishlist/:releaseId/marketplace
   * Get marketplace stats for a release
   */
  router.get('/:releaseId/marketplace', async (req: Request, res: Response) => {
    try {
      const releaseId = parseInt(req.params.releaseId, 10);

      if (isNaN(releaseId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid release ID',
        });
      }

      const stats = await wishlistService.getMarketplaceStats(releaseId);

      if (!stats) {
        return res.status(404).json({
          success: false,
          error: 'Marketplace stats not available',
        });
      }

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Error getting marketplace stats', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
