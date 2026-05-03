import express from 'express';

import { LabelMonitoringService } from '../services/labelMonitoringService';
import { sendError, sendSuccess } from '../utils/apiResponse';
import { createLogger } from '../utils/logger';

export default function createLabelsRouter(
  labelMonitoringService: LabelMonitoringService
) {
  const router = express.Router();
  const logger = createLogger('LabelsRoutes');

  // ============================================
  // Static routes first
  // ============================================

  // GET /api/v1/labels — list monitored labels
  router.get('/', async (_req, res) => {
    try {
      const labels = await labelMonitoringService.getLabels();
      sendSuccess(res, labels);
    } catch (error) {
      logger.error('Error getting labels', error);
      sendError(
        res,
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // POST /api/v1/labels — add a label to monitor
  router.post('/', async (req, res) => {
    const { discogsLabelId, displayName, name, lookbackMonths } =
      req.body || {};
    try {
      if (typeof discogsLabelId !== 'number' || discogsLabelId <= 0) {
        return sendError(res, 400, 'discogsLabelId (positive number) required');
      }
      if (lookbackMonths !== undefined && typeof lookbackMonths !== 'number') {
        return sendError(res, 400, 'lookbackMonths must be a number');
      }
      // Accept both `displayName` (current frontend) and `name` (legacy)
      const overrideName =
        typeof displayName === 'string' && displayName.trim()
          ? displayName
          : typeof name === 'string'
            ? name
            : undefined;
      const label = await labelMonitoringService.addLabel(
        discogsLabelId,
        overrideName,
        typeof lookbackMonths === 'number' ? lookbackMonths : undefined
      );
      sendSuccess(res, label);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const status =
        message.includes('Already monitoring') || message.includes('not found')
          ? 400
          : 500;
      logger.error(
        `Error adding label (discogsLabelId=${String(discogsLabelId)})`,
        error
      );
      sendError(res, status, message);
    }
  });

  // GET /api/v1/labels/search?q=...
  router.get('/search', async (req, res) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      if (!q.trim()) {
        return sendError(res, 400, 'Query parameter q is required');
      }
      const results = await labelMonitoringService.searchLabels(q);
      sendSuccess(res, results);
    } catch (error) {
      logger.error('Error searching labels', error);
      sendError(
        res,
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // GET /api/v1/labels/wishlist-label-options — every wishlist label paired with
  // the artist(s) on the wishlist that reference it. Powers the Add Label dropdown.
  router.get('/wishlist-label-options', async (_req, res) => {
    try {
      const options = await labelMonitoringService.getWishlistLabelOptions();
      sendSuccess(res, options);
    } catch (error) {
      logger.error('Error getting wishlist label options', error);
      sendError(
        res,
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // GET /api/v1/labels/wishlist-artist-options — every unique artist on the user's
  // Discogs wishlist + local want list. Powers the Add Website dropdown.
  router.get('/wishlist-artist-options', async (_req, res) => {
    try {
      const options = await labelMonitoringService.getWishlistArtistOptions();
      sendSuccess(res, options);
    } catch (error) {
      logger.error('Error getting wishlist artist options', error);
      sendError(
        res,
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // GET /api/v1/labels/artist-urls?artistName=... — resolve an artist name to
  // a Discogs ID and return their profile URLs (bandcamp, soundcloud, homepage).
  router.get('/artist-urls', async (req, res) => {
    try {
      const artistName =
        typeof req.query.artistName === 'string' ? req.query.artistName : '';
      if (!artistName.trim()) {
        return sendError(res, 400, 'artistName query parameter required');
      }
      const urls =
        await labelMonitoringService.getArtistWebsiteUrls(artistName);
      sendSuccess(res, urls);
    } catch (error) {
      logger.error('Error getting artist URLs', error);
      sendError(
        res,
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // GET /api/v1/labels/website-suggestions?exclude=https://a.com,https://b.com
  // Suggested website URLs harvested from monitored labels' Discogs profiles
  router.get('/website-suggestions', async (req, res) => {
    try {
      const excludeRaw = req.query.exclude;
      const excludeUrls =
        typeof excludeRaw === 'string' && excludeRaw.length > 0
          ? excludeRaw
              .split(',')
              .map(u => u.trim())
              .filter(Boolean)
          : [];
      const suggestions =
        await labelMonitoringService.getWebsiteSuggestions(excludeUrls);
      sendSuccess(res, suggestions);
    } catch (error) {
      logger.error('Error getting website suggestions', error);
      sendError(
        res,
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // GET /api/v1/labels/releases?labelId=...
  router.get('/releases', async (req, res) => {
    try {
      const labelId =
        typeof req.query.labelId === 'string' ? req.query.labelId : undefined;
      const releases = labelId
        ? await labelMonitoringService.getReleasesForLabel(labelId)
        : await labelMonitoringService.getAllReleases();
      sendSuccess(res, releases);
    } catch (error) {
      logger.error('Error getting label releases', error);
      sendError(
        res,
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // POST /api/v1/labels/scan — start a scan (optional body { labelId })
  router.post('/scan', async (req, res) => {
    try {
      const { labelId } = req.body || {};
      const status = await labelMonitoringService.startScan(
        typeof labelId === 'string' ? labelId : undefined
      );
      sendSuccess(res, status);
    } catch (error) {
      logger.error('Error starting label scan', error);
      sendError(
        res,
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // GET /api/v1/labels/scan/status
  router.get('/scan/status', async (_req, res) => {
    try {
      const status = await labelMonitoringService.getScanStatus();
      sendSuccess(res, status);
    } catch (error) {
      logger.error('Error getting label scan status', error);
      sendError(
        res,
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // POST /api/v1/labels/scan/cancel
  router.post('/scan/cancel', async (_req, res) => {
    try {
      const cancelled = await labelMonitoringService.cancelScan();
      sendSuccess(res, { cancelled });
    } catch (error) {
      logger.error('Error cancelling label scan', error);
      sendError(
        res,
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // GET /api/v1/labels/settings
  router.get('/settings', async (_req, res) => {
    try {
      const settings = await labelMonitoringService.getSettings();
      sendSuccess(res, settings);
    } catch (error) {
      logger.error('Error getting label settings', error);
      sendError(
        res,
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // POST /api/v1/labels/settings
  router.post('/settings', async (req, res) => {
    try {
      const settings = await labelMonitoringService.saveSettings(
        req.body || {}
      );
      sendSuccess(res, settings);
    } catch (error) {
      logger.error('Error saving label settings', error);
      sendError(
        res,
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // ============================================
  // Specific path-prefixed routes
  // ============================================

  // POST /api/v1/labels/releases/bulk-seen — body: { releaseIds: string[] }
  router.post('/releases/bulk-seen', async (req, res) => {
    try {
      const releaseIds = Array.isArray(req.body?.releaseIds)
        ? (req.body.releaseIds as unknown[]).filter(
            (id): id is string => typeof id === 'string'
          )
        : null;
      if (!releaseIds) {
        return sendError(res, 400, 'releaseIds (array of strings) required');
      }
      const result =
        await labelMonitoringService.markReleasesAsSeen(releaseIds);
      sendSuccess(res, result);
    } catch (error) {
      logger.error('Error bulk-marking label releases as seen', error);
      sendError(
        res,
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // POST /api/v1/labels/releases/bulk-dismiss — body: { releaseIds: string[] }
  router.post('/releases/bulk-dismiss', async (req, res) => {
    try {
      const releaseIds = Array.isArray(req.body?.releaseIds)
        ? (req.body.releaseIds as unknown[]).filter(
            (id): id is string => typeof id === 'string'
          )
        : null;
      if (!releaseIds) {
        return sendError(res, 400, 'releaseIds (array of strings) required');
      }
      const result = await labelMonitoringService.dismissReleases(releaseIds);
      sendSuccess(res, result);
    } catch (error) {
      logger.error('Error bulk-dismissing label releases', error);
      sendError(
        res,
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // POST /api/v1/labels/releases/:releaseId/seen
  router.post('/releases/:releaseId/seen', async (req, res) => {
    try {
      const { releaseId } = req.params;
      const ok = await labelMonitoringService.markReleaseAsSeen(releaseId);
      if (!ok) return sendError(res, 404, 'Release not found');
      sendSuccess(res, { updated: true });
    } catch (error) {
      logger.error('Error marking release as seen', error);
      sendError(
        res,
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // POST /api/v1/labels/releases/:releaseId/dismiss
  router.post('/releases/:releaseId/dismiss', async (req, res) => {
    try {
      const { releaseId } = req.params;
      const ok = await labelMonitoringService.dismissRelease(releaseId);
      if (!ok) return sendError(res, 404, 'Release not found');
      sendSuccess(res, { updated: true });
    } catch (error) {
      logger.error('Error dismissing release', error);
      sendError(
        res,
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // ============================================
  // Generic parameterized routes (last)
  // ============================================

  // POST /api/v1/labels/:labelId/scan — start a scan targeting a single label
  router.post('/:labelId/scan', async (req, res) => {
    try {
      const { labelId } = req.params;
      const status = await labelMonitoringService.startScan(labelId);
      sendSuccess(res, status);
    } catch (error) {
      logger.error('Error starting single-label scan', error);
      sendError(
        res,
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // DELETE /api/v1/labels/:labelId
  router.delete('/:labelId', async (req, res) => {
    try {
      const { labelId } = req.params;
      const removed = await labelMonitoringService.removeLabel(labelId);
      if (!removed) return sendError(res, 404, 'Label not found');
      sendSuccess(res, { removed: true });
    } catch (error) {
      logger.error('Error removing label', error);
      sendError(
        res,
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  return router;
}
