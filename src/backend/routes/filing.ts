import express, { Request, Response } from 'express';

import {
  FilingOverrideError,
  RecordStoreFilingService,
} from '../services/filing/recordStoreFilingService';
import { createLogger } from '../utils/logger';

/**
 * Record-store filing routes (see .plan/done/record-store-filing-plan.md, "API"):
 * cache status, the background refresh, the artist list and overrides.
 */
export default function createFilingRouter(
  filingService: Pick<
    RecordStoreFilingService,
    | 'getStatus'
    | 'startRefresh'
    | 'cancel'
    | 'listArtists'
    | 'setOverride'
    | 'isRunning'
  >
) {
  const router = express.Router();
  const logger = createLogger('FilingRoutes');

  const fail = (res: Response, error: unknown, what: string) => {
    logger.error(`Error ${what}`, error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  };

  /**
   * GET /api/v1/filing/status
   * Cache coverage and refresh job progress
   */
  router.get('/status', async (_req: Request, res: Response) => {
    try {
      res.json({ success: true, data: await filingService.getStatus() });
    } catch (error) {
      fail(res, error, 'reading filing status');
    }
  });

  /**
   * POST /api/v1/filing/refresh
   * Start filling the caches in the background. Body: { full?: boolean }
   */
  router.post('/refresh', (req: Request, res: Response) => {
    const full = req.body?.full === true;
    if (filingService.isRunning()) {
      res
        .status(409)
        .json({ success: false, error: 'Filing refresh already running' });
      return;
    }
    try {
      res.json({ success: true, data: filingService.startRefresh({ full }) });
    } catch (error) {
      fail(res, error, 'starting filing refresh');
    }
  });

  /**
   * POST /api/v1/filing/cancel
   * Stop a running refresh after its current lookup
   */
  router.post('/cancel', (_req: Request, res: Response) => {
    res.json({ success: true, data: { cancelled: filingService.cancel() } });
  });

  /**
   * GET /api/v1/filing/artists
   * Every artist in the collection and wishlist, in filing order
   */
  router.get('/artists', async (_req: Request, res: Response) => {
    try {
      res.json({ success: true, data: await filingService.listArtists() });
    } catch (error) {
      fail(res, error, 'listing filing artists');
    }
  });

  /**
   * PUT /api/v1/filing/overrides
   * Body: { artist: string, fileUnder: string }; an empty fileUnder removes it
   */
  router.put('/overrides', async (req: Request, res: Response) => {
    const { artist, fileUnder } = req.body ?? {};
    if (typeof artist !== 'string' || typeof fileUnder !== 'string') {
      res.status(400).json({
        success: false,
        error: 'artist and fileUnder must be strings',
      });
      return;
    }
    try {
      const data = await filingService.setOverride(artist, fileUnder);
      res.json({ success: true, data });
    } catch (error) {
      if (error instanceof FilingOverrideError) {
        res.status(400).json({ success: false, error: error.message });
        return;
      }
      fail(res, error, 'saving filing override');
    }
  });

  return router;
}
