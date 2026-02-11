import express, { Request, Response } from 'express';

import { DiscardPileService } from '../services/discardPileService';
import { jobStatusService } from '../services/jobStatusService';
import { WishlistService } from '../services/wishlistService';
import { createLogger } from '../utils/logger';
import { validateIdentifier, validateNumericId } from '../utils/validation';

/**
 * Create discard pile routes with dependency injection
 *
 * IMPORTANT: Route ordering matters in Express!
 * Static routes must be defined BEFORE parameterized routes.
 */
export default function createDiscardPileRouter(
  discardPileService: DiscardPileService,
  wishlistService: WishlistService
) {
  const router = express.Router();
  const logger = createLogger('DiscardPileRoutes');

  // ============================================
  // Static Routes (must come before parameterized routes)
  // ============================================

  /**
   * GET /api/v1/discard-pile
   * Get all discard pile items
   */
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const items = await discardPileService.getDiscardPile();

      res.json({
        success: true,
        data: items,
        total: items.length,
      });
    } catch (error) {
      logger.error('Error getting discard pile items', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/discard-pile
   * Add item to discard pile
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const {
        collectionItemId,
        releaseId,
        masterId,
        artist,
        title,
        coverImage,
        format,
        year,
        reason,
        reasonNote,
        rating,
        estimatedValue,
        currency,
        notes,
      } = req.body;

      // Validate required fields
      if (!validateNumericId(collectionItemId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid or missing collectionItemId',
        });
      }

      if (!validateNumericId(releaseId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid or missing releaseId',
        });
      }

      if (!artist || typeof artist !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Invalid or missing artist',
        });
      }

      if (!title || typeof title !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Invalid or missing title',
        });
      }

      const validReasons = [
        'selling',
        'duplicate',
        'damaged',
        'upgrade',
        'not_listening',
        'gift',
        'other',
      ];
      if (!reason || !validReasons.includes(reason)) {
        return res.status(400).json({
          success: false,
          error: `Invalid or missing reason. Must be one of: ${validReasons.join(', ')}`,
        });
      }

      const item = await discardPileService.addToDiscardPile({
        collectionItemId,
        releaseId,
        masterId,
        artist,
        title,
        coverImage,
        format,
        year,
        reason,
        reasonNote,
        rating,
        estimatedValue,
        currency,
        notes,
      });

      res.status(201).json({
        success: true,
        data: item,
      });
    } catch (error) {
      logger.error('Error adding to discard pile', error);

      // Check for duplicate error
      if (
        error instanceof Error &&
        error.message.includes('already in the discard pile')
      ) {
        return res.status(409).json({
          success: false,
          error: error.message,
        });
      }

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/v1/discard-pile/stats
   * Get aggregated statistics
   */
  router.get('/stats', async (_req: Request, res: Response) => {
    try {
      const stats = await discardPileService.getDiscardPileStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Error getting discard pile stats', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/v1/discard-pile/ids
   * Get just collection IDs (for badges in collection view)
   */
  router.get('/ids', async (_req: Request, res: Response) => {
    try {
      const ids = await discardPileService.getDiscardPileCollectionIds();

      res.json({
        success: true,
        data: Array.from(ids),
      });
    } catch (error) {
      logger.error('Error getting discard pile IDs', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/discard-pile/bulk
   * Bulk add multiple items
   */
  router.post('/bulk', async (req: Request, res: Response) => {
    try {
      const { items } = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'items must be a non-empty array',
        });
      }

      // Validate each item
      const validReasons = [
        'selling',
        'duplicate',
        'damaged',
        'upgrade',
        'not_listening',
        'gift',
        'other',
      ];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        if (!validateNumericId(item.collectionItemId)) {
          return res.status(400).json({
            success: false,
            error: `Invalid collectionItemId at index ${i}`,
          });
        }

        if (!validateNumericId(item.releaseId)) {
          return res.status(400).json({
            success: false,
            error: `Invalid releaseId at index ${i}`,
          });
        }

        if (!item.artist || typeof item.artist !== 'string') {
          return res.status(400).json({
            success: false,
            error: `Invalid or missing artist at index ${i}`,
          });
        }

        if (!item.title || typeof item.title !== 'string') {
          return res.status(400).json({
            success: false,
            error: `Invalid or missing title at index ${i}`,
          });
        }

        if (!item.reason || !validReasons.includes(item.reason)) {
          return res.status(400).json({
            success: false,
            error: `Invalid reason at index ${i}`,
          });
        }
      }

      const added = await discardPileService.bulkAddToDiscardPile(items);

      res.status(201).json({
        success: true,
        data: added,
        total: added.length,
        skipped: items.length - added.length,
      });
    } catch (error) {
      logger.error('Error bulk adding to discard pile', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * DELETE /api/v1/discard-pile/bulk
   * Bulk remove multiple items
   */
  router.delete('/bulk', async (req: Request, res: Response) => {
    try {
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'ids must be a non-empty array',
        });
      }

      // Validate IDs
      for (let i = 0; i < ids.length; i++) {
        if (!validateIdentifier(ids[i])) {
          return res.status(400).json({
            success: false,
            error: `Invalid id format at index ${i}`,
          });
        }
      }

      const removed = await discardPileService.bulkRemoveFromDiscardPile(ids);

      res.json({
        success: true,
        removed,
      });
    } catch (error) {
      logger.error('Error bulk removing from discard pile', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/discard-pile/refresh-values
   * Bulk refresh estimated values from Discogs marketplace data
   */
  router.post('/refresh-values', async (_req: Request, res: Response) => {
    try {
      const items = await discardPileService.getDiscardPile();
      const eligible = items.filter(item => !item.actualSalePrice);

      if (eligible.length === 0) {
        return res.json({
          success: true,
          message: 'No items to refresh',
          updated: 0,
        });
      }

      const jobId = jobStatusService.startJob(
        'refresh-values',
        `Refreshing marketplace values for ${eligible.length} items...`
      );

      res.json({ success: true, jobId });

      // Process in background sequentially (respects Discogs rate limits)
      let updated = 0;
      for (const item of eligible) {
        try {
          const stats = await wishlistService.getMarketplaceStats(
            item.releaseId
          );
          if (stats) {
            const autoValue =
              stats.priceSuggestions?.veryGoodPlus?.value ??
              stats.medianPrice ??
              stats.lowestPrice;
            if (autoValue != null) {
              await discardPileService.updateDiscardPileItem(item.id, {
                estimatedValue: parseFloat(autoValue.toFixed(2)),
              });
              updated++;
            }
          }
        } catch (err) {
          logger.warn(
            `Failed to refresh value for ${item.artist} - ${item.title}`,
            err
          );
        }
      }

      jobStatusService.completeJob(
        jobId,
        `Updated marketplace values for ${updated} of ${eligible.length} items`
      );
    } catch (error) {
      logger.error('Error refreshing marketplace values', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================
  // Parameterized routes AFTER static routes
  // ============================================

  /**
   * GET /api/v1/discard-pile/:id
   * Get single item
   */
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      if (!validateIdentifier(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid id format',
        });
      }

      const item = await discardPileService.getItem(id);

      if (!item) {
        return res.status(404).json({
          success: false,
          error: 'Item not found',
        });
      }

      res.json({
        success: true,
        data: item,
      });
    } catch (error) {
      logger.error('Error getting discard pile item', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * PUT /api/v1/discard-pile/:id
   * Update item
   */
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      if (!validateIdentifier(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid id format',
        });
      }

      const {
        reason,
        reasonNote,
        status,
        estimatedValue,
        actualSalePrice,
        currency,
        marketplaceUrl,
        notes,
      } = req.body;

      // Validate reason if provided
      const validReasons = [
        'selling',
        'duplicate',
        'damaged',
        'upgrade',
        'not_listening',
        'gift',
        'other',
      ];
      if (reason && !validReasons.includes(reason)) {
        return res.status(400).json({
          success: false,
          error: `Invalid reason. Must be one of: ${validReasons.join(', ')}`,
        });
      }

      // Validate status if provided
      const validStatuses = ['marked', 'listed', 'sold', 'gifted', 'removed'];
      if (status && !validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        });
      }

      const updated = await discardPileService.updateDiscardPileItem(id, {
        reason,
        reasonNote,
        status,
        estimatedValue,
        actualSalePrice,
        currency,
        marketplaceUrl,
        notes,
      });

      if (!updated) {
        return res.status(404).json({
          success: false,
          error: 'Item not found',
        });
      }

      res.json({
        success: true,
        data: updated,
      });
    } catch (error) {
      logger.error('Error updating discard pile item', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * DELETE /api/v1/discard-pile/:id
   * Remove item from discard pile
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      if (!validateIdentifier(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid id format',
        });
      }

      // Return success even if item didn't exist (idempotent)
      await discardPileService.removeFromDiscardPile(id);

      res.json({
        success: true,
        message: 'Item removed from discard pile',
      });
    } catch (error) {
      logger.error('Error removing from discard pile', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/discard-pile/:id/sold
   * Quick action: mark as sold
   */
  router.post('/:id/sold', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      if (!validateIdentifier(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid id format',
        });
      }

      const { salePrice } = req.body;

      const updated = await discardPileService.markAsSold(id, salePrice);

      if (!updated) {
        return res.status(404).json({
          success: false,
          error: 'Item not found',
        });
      }

      res.json({
        success: true,
        data: updated,
      });
    } catch (error) {
      logger.error('Error marking as sold', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/discard-pile/:id/listed
   * Quick action: mark as listed
   */
  router.post('/:id/listed', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      if (!validateIdentifier(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid id format',
        });
      }

      const { marketplaceUrl } = req.body;

      if (!marketplaceUrl || typeof marketplaceUrl !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'marketplaceUrl is required',
        });
      }

      const updated = await discardPileService.markAsListed(id, marketplaceUrl);

      if (!updated) {
        return res.status(404).json({
          success: false,
          error: 'Item not found',
        });
      }

      res.json({
        success: true,
        data: updated,
      });
    } catch (error) {
      logger.error('Error marking as listed', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
