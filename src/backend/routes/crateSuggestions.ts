import express, { Request, Response } from 'express';

import { CrateError } from '../services/crateService';
import { CrateSuggestionService } from '../services/crateSuggestionService';
import { createLogger } from '../utils/logger';

/** recipe:parameter, no slashes (the key is a path segment) */
const CANDIDATE_KEY_PATTERN = /^[a-z-]+:[^/]{1,120}$/;

/**
 * Suggested crates routes (plan section 10.6). Registered on the crates
 * router through createCratesRouter's extraRoutes hook, so they come before
 * the /:id routes.
 */
export function registerCrateSuggestionRoutes(
  router: express.Router,
  service: CrateSuggestionService
): void {
  const logger = createLogger('CrateSuggestionRoutes');

  const handleError = (res: Response, error: unknown, action: string) => {
    if (error instanceof CrateError) {
      return res
        .status(error.status)
        .json({ success: false, error: error.message });
    }
    logger.error(`Error ${action}`, error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  };

  /**
   * GET /api/v1/crates/suggestions?limit=3|1
   * Today's batch; limit=1 is its first card
   */
  router.get('/suggestions', async (req: Request, res: Response) => {
    const raw = req.query.limit;
    const limit = raw === undefined ? 3 : raw === '3' ? 3 : raw === '1' ? 1 : 0;
    if (limit === 0) {
      return res
        .status(400)
        .json({ success: false, error: 'limit must be 1 or 3' });
    }
    try {
      const data = await service.getSuggestions(limit);
      res.json({ success: true, data });
    } catch (error) {
      handleError(res, error, 'getting crate suggestions');
    }
  });

  /**
   * POST /api/v1/crates/suggestions/reroll
   * A batch sharing nothing with anything shown today
   */
  router.post('/suggestions/reroll', async (_req: Request, res: Response) => {
    try {
      const data = await service.reroll();
      res.json({ success: true, data });
    } catch (error) {
      handleError(res, error, 'rerolling crate suggestions');
    }
  });

  /**
   * POST /api/v1/crates/suggestions/:candidateKey/dismiss
   * "Not interested"; returns the backfilled batch
   */
  router.post(
    '/suggestions/:candidateKey/dismiss',
    async (req: Request, res: Response) => {
      // Express has already decoded the path segment
      const candidateKey = req.params.candidateKey;
      if (
        typeof candidateKey !== 'string' ||
        !CANDIDATE_KEY_PATTERN.test(candidateKey)
      ) {
        return res
          .status(400)
          .json({ success: false, error: 'Invalid suggestion key' });
      }
      try {
        const data = await service.dismiss(candidateKey);
        res.json({ success: true, data });
      } catch (error) {
        handleError(res, error, 'dismissing a crate suggestion');
      }
    }
  );

  /**
   * DELETE /api/v1/crates/suggestions/history
   * "Reset suggestion history"; returns a fresh batch
   */
  router.delete(
    '/suggestions/history',
    async (_req: Request, res: Response) => {
      try {
        const data = await service.resetHistory();
        res.json({ success: true, data });
      } catch (error) {
        handleError(res, error, 'resetting crate suggestion history');
      }
    }
  );
}
