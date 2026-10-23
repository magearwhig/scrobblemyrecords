import express, { Request, Response } from 'express';

import { ExportDataService } from '../services/exportDataService';
import { createLogger } from '../utils/logger';

/**
 * Create data export routes with dependency injection
 * (see .plan/data-export-plan.md, "API").
 *
 * IMPORTANT: Route ordering matters in Express!
 * Literal routes (/meta, /datasets, /all, /pocket-list) must be registered
 * BEFORE a future /:dataset route. `extraRoutes` (e.g. the Pocket List) is
 * called after the literal routes defined here.
 */
export default function createExportRouter(
  exportDataService: Pick<ExportDataService, 'getSnapshotMeta'>,
  extraRoutes?: (router: express.Router) => void
) {
  const router = express.Router();
  const logger = createLogger('ExportRoutes');

  /**
   * GET /api/v1/export/meta
   * Snapshot freshness and collection cache completeness
   */
  router.get('/meta', async (_req: Request, res: Response) => {
    try {
      const data = await exportDataService.getSnapshotMeta();
      res.json({ success: true, data });
    } catch (error) {
      logger.error('Error reading export meta', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  extraRoutes?.(router);

  // Parameterized routes (e.g. GET /:dataset) go below this line

  return router;
}
