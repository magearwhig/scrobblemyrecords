import express, { Request, Response } from 'express';

import { WrappedService } from '../services/wrappedService';
import { createLogger } from '../utils/logger';

/**
 * Create wrapped routes with dependency injection.
 * Follows the router factory pattern (see discardPile.ts).
 */
export default function createWrappedRouter(wrappedService: WrappedService) {
  const router = express.Router();
  const logger = createLogger('WrappedRoutes');

  /**
   * GET /api/v1/wrapped?startDate=<ms>&endDate=<ms>
   * Generate wrapped data for a date range.
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const { startDate, endDate } = req.query;

      // Validate required parameters
      if (!startDate || !endDate) {
        res.status(400).json({
          success: false,
          error: 'Both startDate and endDate query parameters are required',
        });
        return;
      }

      const startMs = Number(startDate);
      const endMs = Number(endDate);

      // Validate numeric and finite
      if (
        isNaN(startMs) ||
        isNaN(endMs) ||
        !isFinite(startMs) ||
        !isFinite(endMs)
      ) {
        res.status(400).json({
          success: false,
          error: 'startDate and endDate must be valid numbers (milliseconds)',
        });
        return;
      }

      // Validate range
      if (startMs >= endMs) {
        res.status(400).json({
          success: false,
          error: 'startDate must be before endDate',
        });
        return;
      }

      // Validate not in the future
      if (endMs > Date.now()) {
        res.status(400).json({
          success: false,
          error: 'endDate cannot be in the future',
        });
        return;
      }

      logger.info('Generating wrapped data', {
        startDate: new Date(startMs).toISOString(),
        endDate: new Date(endMs).toISOString(),
      });

      const data = await wrappedService.generateWrapped(startMs, endMs);

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('Failed to generate wrapped data', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate wrapped data',
      });
    }
  });

  return router;
}
