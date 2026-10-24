import express, { Request, Response } from 'express';

import { RecordLookupService } from '../services/recordLookupService';
import { createLogger } from '../utils/logger';

/**
 * Check a Record routes: one lookup across the collection, wants and the
 * discard pile, from cached data (see RecordLookupService)
 */
export default function createLookupRouter(
  recordLookupService: Pick<RecordLookupService, 'check'>
) {
  const router = express.Router();
  const logger = createLogger('LookupRoutes');

  /**
   * GET /api/v1/lookup/check?q=<artist and/or title | Discogs release URL or id>
   */
  router.get('/check', async (req: Request, res: Response) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Enter an artist, title or Discogs release',
      });
    }
    try {
      const data = await recordLookupService.check(q);
      res.json({ success: true, data });
    } catch (error) {
      logger.error('Error checking a record', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
