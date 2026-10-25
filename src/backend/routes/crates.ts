import express, { Request, Response } from 'express';

import { CRATE_TEMPLATES } from '../../shared/crateTemplates';
import { CrateError, CrateService } from '../services/crateService';
import { createLogger } from '../utils/logger';
import { validateNumericId } from '../utils/validation';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Create Smart Crates routes with dependency injection
 *
 * IMPORTANT: Route ordering matters in Express!
 * Static routes (/templates, /preview, /for-release, /release-runtimes,
 * /suggestions) must be defined BEFORE /:id.
 */
export default function createCratesRouter(
  crateService: CrateService,
  extraRoutes?: (router: express.Router) => void
) {
  const router = express.Router();
  const logger = createLogger('CratesRoutes');

  /** Send a CrateError with its status, anything else as 500 */
  const handleError = (res: Response, error: unknown, action: string) => {
    if (error instanceof CrateError) {
      return res.status(error.status).json({
        success: false,
        error: error.message,
        ...(error.details ? { details: error.details } : {}),
      });
    }
    logger.error(`Error ${action}`, error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  };

  const validId = (req: Request, res: Response): string | null => {
    const id = req.params.id;
    if (!UUID_PATTERN.test(id)) {
      res.status(400).json({ success: false, error: 'Invalid crate id' });
      return null;
    }
    return id;
  };

  // ============================================
  // Static Routes (must come before parameterized routes)
  // ============================================

  /**
   * GET /api/v1/crates
   * All crates with member counts
   */
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const data = await crateService.summaries();
      res.json({ success: true, data });
    } catch (error) {
      handleError(res, error, 'listing crates');
    }
  });

  /**
   * GET /api/v1/crates/templates
   * Starter templates
   */
  router.get('/templates', (_req: Request, res: Response) => {
    res.json({ success: true, data: CRATE_TEMPLATES });
  });

  /**
   * POST /api/v1/crates
   * Create a crate
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const {
        name,
        description,
        rules,
        sort,
        pinnedToWhatToPlay,
        templateId,
        sourceSuggestionKey,
      } = req.body ?? {};
      if (templateId !== undefined && typeof templateId !== 'string') {
        return res
          .status(400)
          .json({ success: false, error: 'Invalid templateId' });
      }
      if (
        sourceSuggestionKey !== undefined &&
        typeof sourceSuggestionKey !== 'string'
      ) {
        return res
          .status(400)
          .json({ success: false, error: 'Invalid sourceSuggestionKey' });
      }
      const crate = await crateService.createCrate({
        name,
        description,
        rules,
        sort,
        pinnedToWhatToPlay,
        templateId,
        sourceSuggestionKey,
      });
      res.status(201).json({ success: true, data: crate });
    } catch (error) {
      handleError(res, error, 'creating crate');
    }
  });

  /**
   * POST /api/v1/crates/preview
   * Evaluate unsaved rules
   */
  router.post('/preview', async (req: Request, res: Response) => {
    try {
      const { rules, sort } = req.body ?? {};
      const data = await crateService.preview({ rules, sort });
      res.json({ success: true, data });
    } catch (error) {
      handleError(res, error, 'previewing crate');
    }
  });

  /**
   * GET /api/v1/crates/for-release/:releaseId
   * Crates that contain the album of this release
   */
  router.get('/for-release/:releaseId', async (req: Request, res: Response) => {
    try {
      const releaseId = Number(req.params.releaseId);
      if (!validateNumericId(releaseId)) {
        return res
          .status(400)
          .json({ success: false, error: 'Invalid release id' });
      }
      const data = await crateService.cratesForRelease(releaseId);
      res.json({ success: true, data });
    } catch (error) {
      handleError(res, error, 'finding crates for release');
    }
  });

  /**
   * GET /api/v1/crates/release-runtimes
   * { [releaseId]: seconds } for releases with a complete cached tracklist
   */
  router.get('/release-runtimes', async (_req: Request, res: Response) => {
    try {
      const data = await crateService.releaseRuntimes();
      res.json({ success: true, data });
    } catch (error) {
      handleError(res, error, 'reading release runtimes');
    }
  });

  // Suggested crates register their static routes here, before /:id
  extraRoutes?.(router);

  // ============================================
  // Parameterized Routes
  // ============================================

  /**
   * GET /api/v1/crates/:id
   * A crate and its evaluation
   */
  router.get('/:id', async (req: Request, res: Response) => {
    const id = validId(req, res);
    if (!id) return;
    try {
      const data = await crateService.evaluate(id);
      res.json({ success: true, data });
    } catch (error) {
      handleError(res, error, 'evaluating crate');
    }
  });

  /**
   * PUT /api/v1/crates/:id
   * Update name, description, rules, sort or pinned
   */
  router.put('/:id', async (req: Request, res: Response) => {
    const id = validId(req, res);
    if (!id) return;
    try {
      const { name, description, rules, sort, pinnedToWhatToPlay } =
        req.body ?? {};
      const data = await crateService.updateCrate(id, {
        name,
        description,
        rules,
        sort,
        pinnedToWhatToPlay,
      });
      res.json({ success: true, data });
    } catch (error) {
      handleError(res, error, 'updating crate');
    }
  });

  /**
   * DELETE /api/v1/crates/:id
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    const id = validId(req, res);
    if (!id) return;
    try {
      await crateService.deleteCrate(id);
      res.json({ success: true });
    } catch (error) {
      handleError(res, error, 'deleting crate');
    }
  });

  /**
   * DELETE /api/v1/crates/:id/overrides/stale
   * Remove manual choices for records no longer owned
   */
  router.delete('/:id/overrides/stale', async (req: Request, res: Response) => {
    const id = validId(req, res);
    if (!id) return;
    try {
      const data = await crateService.removeStaleOverrides(id);
      res.json({ success: true, data });
    } catch (error) {
      handleError(res, error, 'removing stale overrides');
    }
  });

  /**
   * POST /api/v1/crates/:id/overrides
   * Include or exclude an album: { releaseIds, action }
   */
  router.post('/:id/overrides', async (req: Request, res: Response) => {
    const id = validId(req, res);
    if (!id) return;
    try {
      const { releaseIds, action } = req.body ?? {};
      const data = await crateService.setOverride(id, releaseIds, action);
      res.json({ success: true, data });
    } catch (error) {
      handleError(res, error, 'setting override');
    }
  });

  /**
   * DELETE /api/v1/crates/:id/overrides
   * Reset albums to the rules: { releaseIds }
   */
  router.delete('/:id/overrides', async (req: Request, res: Response) => {
    const id = validId(req, res);
    if (!id) return;
    try {
      const { releaseIds } = req.body ?? {};
      const data = await crateService.clearOverrides(id, releaseIds);
      res.json({ success: true, data });
    } catch (error) {
      handleError(res, error, 'clearing overrides');
    }
  });

  return router;
}
