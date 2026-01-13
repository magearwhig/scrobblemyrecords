import express, { Request, Response } from 'express';

import { AuthService } from '../services/authService';
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
  fileStorage: FileStorage,
  authService: AuthService,
  wishlistService: WishlistService
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

      const status = await wishlistService.syncWishlist(
        username,
        forceRefresh === true
      );

      res.json({
        success: true,
        message: forceRefresh
          ? 'Full wishlist refresh completed'
          : 'Wishlist sync completed',
        data: status,
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
      } = req.body;

      const settings = await wishlistService.saveSettings({
        priceThreshold,
        currency,
        autoSyncInterval,
        notifyOnVinylAvailable,
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

  // ---- Watch List ----

  /**
   * GET /api/v1/wishlist/watch
   * Get vinyl watch list
   */
  router.get('/watch', async (_req: Request, res: Response) => {
    try {
      const items = await wishlistService.getWatchList();

      res.json({
        success: true,
        data: items,
        total: items.length,
      });
    } catch (error) {
      logger.error('Error getting watch list', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/wishlist/watch
   * Add item to vinyl watch list
   */
  router.post('/watch', async (req: Request, res: Response) => {
    try {
      const { masterId, artist, title, coverImage } = req.body;

      if (!masterId || !artist || !title) {
        return res.status(400).json({
          success: false,
          error: 'masterId, artist, and title are required',
        });
      }

      await wishlistService.addToWatchList({
        masterId,
        artist,
        title,
        coverImage,
      });

      res.json({
        success: true,
        message: 'Added to vinyl watch list',
      });
    } catch (error) {
      logger.error('Error adding to watch list', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/wishlist/watch/check
   * Check watch list for newly available vinyl
   */
  router.post('/watch/check', async (_req: Request, res: Response) => {
    try {
      const newlyAvailable = await wishlistService.checkWatchListForVinyl();

      res.json({
        success: true,
        data: newlyAvailable,
        newlyAvailableCount: newlyAvailable.length,
      });
    } catch (error) {
      logger.error('Error checking watch list', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

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
   * DELETE /api/v1/wishlist/watch/:masterId
   * Remove item from vinyl watch list
   */
  router.delete('/watch/:masterId', async (req: Request, res: Response) => {
    try {
      const masterId = parseInt(req.params.masterId, 10);

      if (isNaN(masterId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid master ID',
        });
      }

      const removed = await wishlistService.removeFromWatchList(masterId);

      if (!removed) {
        return res.status(404).json({
          success: false,
          error: 'Item not found in watch list',
        });
      }

      res.json({
        success: true,
        message: 'Removed from vinyl watch list',
      });
    } catch (error) {
      logger.error('Error removing from watch list', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

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
