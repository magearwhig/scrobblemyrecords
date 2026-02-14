import express, { Request, Response } from 'express';

import { ListeningPatternService } from '../services/listeningPatternService';
import { createLogger } from '../utils/logger';

/**
 * Create patterns routes with dependency injection.
 * Follows the router factory pattern (see wrapped.ts, discardPile.ts).
 */
export default function createPatternsRouter(
  patternService: ListeningPatternService
) {
  const router = express.Router();
  const logger = createLogger('PatternsRoutes');

  /**
   * GET /api/v1/patterns
   * Get learned listening patterns.
   */
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const patterns = await patternService.getPatterns();

      if (!patterns) {
        res.json({
          success: true,
          data: null,
          message: 'Insufficient listening history to detect patterns',
        });
        return;
      }

      res.json({
        success: true,
        data: patterns,
      });
    } catch (error) {
      logger.error('Error getting patterns', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/patterns/suggest
   * Get timestamp suggestions for backfilling albums.
   *
   * Body: {
   *   albums: BackfillAlbum[],
   *   targetDate?: string (ISO date),
   *   timeOfDay?: 'morning' | 'afternoon' | 'evening',
   *   customStartTime?: number (Unix timestamp)
   * }
   */
  router.post('/suggest', async (req: Request, res: Response) => {
    try {
      const { albums, targetDate, timeOfDay, customStartTime } = req.body;

      if (!albums || !Array.isArray(albums) || albums.length === 0) {
        res.status(400).json({
          success: false,
          error: 'albums array is required',
        });
        return;
      }

      // Validate albums have required fields
      for (const album of albums) {
        if (
          !album.artist ||
          !album.album ||
          typeof album.durationSeconds !== 'number'
        ) {
          res.status(400).json({
            success: false,
            error: 'Each album must have artist, album, and durationSeconds',
          });
          return;
        }
      }

      const suggestions = await patternService.suggestBackfillTimestamps(
        albums,
        {
          targetDate: targetDate ? new Date(targetDate) : undefined,
          timeOfDay,
          customStartTime,
        }
      );

      res.json({
        success: true,
        data: suggestions,
      });
    } catch (error) {
      logger.error('Error generating suggestions', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/patterns/check-conflicts
   * Check if a time range has existing scrobbles.
   *
   * Body: { startTimestamp: number, endTimestamp: number }
   */
  router.post('/check-conflicts', async (req: Request, res: Response) => {
    try {
      const { startTimestamp, endTimestamp } = req.body;

      if (
        typeof startTimestamp !== 'number' ||
        typeof endTimestamp !== 'number'
      ) {
        res.status(400).json({
          success: false,
          error: 'startTimestamp and endTimestamp are required as numbers',
        });
        return;
      }

      const result = await patternService.checkConflicts(
        startTimestamp,
        endTimestamp
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Error checking conflicts', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/patterns/recalculate
   * Force recalculation of patterns.
   */
  router.post('/recalculate', async (_req: Request, res: Response) => {
    try {
      const patterns = await patternService.calculatePatterns();

      res.json({
        success: true,
        data: patterns,
        message: patterns ? 'Patterns recalculated' : 'Insufficient data',
      });
    } catch (error) {
      logger.error('Error recalculating patterns', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
