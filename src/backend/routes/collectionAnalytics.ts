import express, { Request, Response } from 'express';

import { AuthService } from '../services/authService';
import { CollectionAnalyticsService } from '../services/collectionAnalyticsService';
import { sendError, sendSuccess } from '../utils/apiResponse';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

const logger = createLogger('CollectionAnalyticsRoutes');

/**
 * Create collection analytics routes with dependency injection
 */
export default function createCollectionAnalyticsRouter(
  fileStorage: FileStorage,
  authService: AuthService,
  collectionAnalyticsService: CollectionAnalyticsService
): express.Router {
  const router = express.Router();

  // ============================================
  // Collection Analytics Overview
  // ============================================

  /**
   * GET /api/v1/collection-analytics/overview
   * Returns full CollectionAnalyticsOverview (summary, formats, labels, decades, growth)
   */
  router.get('/overview', async (req: Request, res: Response) => {
    try {
      const overview = await collectionAnalyticsService.getCollectionOverview();
      sendSuccess(res, overview);
    } catch (error) {
      logger.error('Failed to get collection analytics overview', error);
      sendError(res, 500, 'Failed to get collection analytics overview');
    }
  });

  // ============================================
  // Collection Value Estimation
  // ============================================

  /**
   * GET /api/v1/collection-analytics/value
   * Returns value estimation and scan status
   */
  router.get('/value', async (req: Request, res: Response) => {
    try {
      const result = await collectionAnalyticsService.getCollectionValue();
      sendSuccess(res, result);
    } catch (error) {
      logger.error('Failed to get collection value', error);
      sendError(res, 500, 'Failed to get collection value');
    }
  });

  /**
   * POST /api/v1/collection-analytics/value/scan
   * Triggers a progressive value scan. Returns 409 if already scanning.
   */
  router.post('/value/scan', async (req: Request, res: Response) => {
    try {
      // Check if a scan is already running before starting
      const currentStatus =
        await collectionAnalyticsService.getValueScanStatus();
      if (currentStatus.status === 'scanning') {
        sendError(res, 409, 'Value scan already in progress', {
          data: currentStatus,
        });
        return;
      }

      const { batchSize, force } = req.body || {};
      // Fire-and-forget: start scan in background, return 202 immediately.
      // The scan runs asynchronously; clients poll GET /value/scan/status.
      collectionAnalyticsService.startValueScan(batchSize, force).catch(err => {
        logger.error('Background value scan failed', err);
      });
      sendSuccess(res, { message: 'Value scan started' }, 202);
    } catch (error) {
      logger.error('Failed to start value scan', error);
      sendError(res, 500, 'Failed to start value scan');
    }
  });

  /**
   * GET /api/v1/collection-analytics/value/scan/status
   * Returns ValueScanStatus
   */
  router.get('/value/scan/status', async (req: Request, res: Response) => {
    try {
      const status = await collectionAnalyticsService.getValueScanStatus();
      sendSuccess(res, status);
    } catch (error) {
      logger.error('Failed to get value scan status', error);
      sendError(res, 500, 'Failed to get value scan status');
    }
  });

  // ============================================
  // Individual Breakdowns
  // ============================================

  /**
   * GET /api/v1/collection-analytics/formats
   * Returns FormatBreakdown only
   */
  router.get('/formats', async (req: Request, res: Response) => {
    try {
      const overview = await collectionAnalyticsService.getCollectionOverview();
      sendSuccess(res, overview.formats);
    } catch (error) {
      logger.error('Failed to get format breakdown', error);
      sendError(res, 500, 'Failed to get format breakdown');
    }
  });

  /**
   * GET /api/v1/collection-analytics/labels
   * Returns LabelDistribution only
   */
  router.get('/labels', async (req: Request, res: Response) => {
    try {
      const overview = await collectionAnalyticsService.getCollectionOverview();
      sendSuccess(res, overview.labels);
    } catch (error) {
      logger.error('Failed to get label distribution', error);
      sendError(res, 500, 'Failed to get label distribution');
    }
  });

  /**
   * GET /api/v1/collection-analytics/decades
   * Returns DecadeHistogram only
   */
  router.get('/decades', async (req: Request, res: Response) => {
    try {
      const overview = await collectionAnalyticsService.getCollectionOverview();
      sendSuccess(res, overview.decades);
    } catch (error) {
      logger.error('Failed to get decade histogram', error);
      sendError(res, 500, 'Failed to get decade histogram');
    }
  });

  /**
   * GET /api/v1/collection-analytics/growth
   * Returns GrowthTimeline. Accepts query param granularity=month|year (default: month)
   */
  router.get('/growth', async (req: Request, res: Response) => {
    try {
      const granularity =
        (req.query.granularity as string) === 'year' ? 'year' : 'month';
      const growth =
        await collectionAnalyticsService.getGrowthTimeline(granularity);
      sendSuccess(res, growth);
    } catch (error) {
      logger.error('Failed to get growth timeline', error);
      sendError(res, 500, 'Failed to get growth timeline');
    }
  });

  return router;
}
