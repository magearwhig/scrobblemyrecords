import express from 'express';

import { OllamaService } from '../services/ollamaService';
import { WebsiteMonitoringService } from '../services/websiteMonitoringService';
import { sendError, sendSuccess } from '../utils/apiResponse';
import { createLogger } from '../utils/logger';

export default function createWebsitesRouter(
  websiteMonitoringService: WebsiteMonitoringService,
  ollamaService?: OllamaService
) {
  const router = express.Router();
  const logger = createLogger('WebsitesRoutes');

  // ============================================
  // Static routes first
  // ============================================

  // GET /api/v1/websites
  router.get('/', async (_req, res) => {
    try {
      const websites = await websiteMonitoringService.getWebsites();
      sendSuccess(res, websites);
    } catch (error) {
      logger.error('Error getting websites', error);
      sendError(
        res,
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // POST /api/v1/websites
  router.post('/', async (req, res) => {
    try {
      const { name, url, cssSelector, useOllama, enabled } = req.body || {};
      const website = await websiteMonitoringService.addWebsite({
        name,
        url,
        cssSelector,
        useOllama,
        enabled,
      });
      sendSuccess(res, website);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const status =
        message.includes('Already monitoring') ||
        message.includes('required') ||
        message.includes('Invalid URL') ||
        message.includes('http or https')
          ? 400
          : 500;
      logger.error('Error adding website', error);
      sendError(res, status, message);
    }
  });

  // POST /api/v1/websites/preview
  router.post('/preview', async (req, res) => {
    const { url, cssSelector } = req.body || {};
    try {
      if (!url || typeof url !== 'string') {
        return sendError(res, 400, 'url is required');
      }
      const result = await websiteMonitoringService.previewWebsite(
        url,
        typeof cssSelector === 'string' ? cssSelector : undefined
      );
      sendSuccess(res, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const status =
        message.includes('Invalid URL') ||
        message.includes('http or https') ||
        message.includes('Failed to fetch')
          ? 400
          : 500;
      logger.error(`Error previewing website (url=${String(url)})`, error);
      sendError(res, status, message);
    }
  });

  // GET /api/v1/websites/items?websiteId=...
  router.get('/items', async (req, res) => {
    try {
      const websiteId =
        typeof req.query.websiteId === 'string'
          ? req.query.websiteId
          : undefined;
      const items = await websiteMonitoringService.getItems(websiteId);
      sendSuccess(res, items);
    } catch (error) {
      logger.error('Error getting website items', error);
      sendError(
        res,
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // POST /api/v1/websites/scan
  router.post('/scan', async (req, res) => {
    try {
      const { websiteId } = req.body || {};
      const status = await websiteMonitoringService.startScan(
        typeof websiteId === 'string' ? websiteId : undefined
      );
      sendSuccess(res, status);
    } catch (error) {
      logger.error('Error starting website scan', error);
      sendError(
        res,
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // GET /api/v1/websites/scan/status
  router.get('/scan/status', async (_req, res) => {
    try {
      const status = await websiteMonitoringService.getScanStatus();
      sendSuccess(res, status);
    } catch (error) {
      logger.error('Error getting website scan status', error);
      sendError(
        res,
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // POST /api/v1/websites/scan/cancel
  router.post('/scan/cancel', async (_req, res) => {
    try {
      const cancelled = await websiteMonitoringService.cancelScan();
      sendSuccess(res, { cancelled });
    } catch (error) {
      logger.error('Error cancelling website scan', error);
      sendError(
        res,
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // GET /api/v1/websites/settings
  router.get('/settings', async (_req, res) => {
    try {
      const settings = await websiteMonitoringService.getSettings();
      sendSuccess(res, settings);
    } catch (error) {
      logger.error('Error getting website settings', error);
      sendError(
        res,
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // POST /api/v1/websites/settings
  router.post('/settings', async (req, res) => {
    try {
      const settings = await websiteMonitoringService.saveSettings(
        req.body || {}
      );
      sendSuccess(res, settings);
    } catch (error) {
      logger.error('Error saving website settings', error);
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

  // POST /api/v1/websites/items/bulk-seen — body: { itemIds: string[] }
  // Bulk-mark many items as seen in a single read-modify-write cycle. Required
  // to avoid the file-write race when the UI fires many parallel single-item
  // updates and only the last writer's mutation survives.
  router.post('/items/bulk-seen', async (req, res) => {
    try {
      const itemIds = Array.isArray(req.body?.itemIds)
        ? (req.body.itemIds as unknown[]).filter(
            (id): id is string => typeof id === 'string'
          )
        : null;
      if (!itemIds) {
        return sendError(res, 400, 'itemIds (array of strings) required');
      }
      const result = await websiteMonitoringService.markItemsAsSeen(itemIds);
      sendSuccess(res, result);
    } catch (error) {
      logger.error('Error bulk-marking website items as seen', error);
      sendError(
        res,
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // POST /api/v1/websites/items/bulk-dismiss — body: { itemIds: string[] }
  router.post('/items/bulk-dismiss', async (req, res) => {
    try {
      const itemIds = Array.isArray(req.body?.itemIds)
        ? (req.body.itemIds as unknown[]).filter(
            (id): id is string => typeof id === 'string'
          )
        : null;
      if (!itemIds) {
        return sendError(res, 400, 'itemIds (array of strings) required');
      }
      const result = await websiteMonitoringService.dismissItems(itemIds);
      sendSuccess(res, result);
    } catch (error) {
      logger.error('Error bulk-dismissing website items', error);
      sendError(
        res,
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // POST /api/v1/websites/items/:itemId/seen
  router.post('/items/:itemId/seen', async (req, res) => {
    try {
      const { itemId } = req.params;
      const ok = await websiteMonitoringService.markItemAsSeen(itemId);
      if (!ok) return sendError(res, 404, 'Item not found');
      sendSuccess(res, { updated: true });
    } catch (error) {
      logger.error('Error marking website item as seen', error);
      sendError(
        res,
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // POST /api/v1/websites/items/:itemId/dismiss
  router.post('/items/:itemId/dismiss', async (req, res) => {
    try {
      const { itemId } = req.params;
      const ok = await websiteMonitoringService.dismissItem(itemId);
      if (!ok) return sendError(res, 404, 'Item not found');
      sendSuccess(res, { updated: true });
    } catch (error) {
      logger.error('Error dismissing website item', error);
      sendError(
        res,
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // GET /api/v1/websites/ollama/status — Ollama availability check
  router.get('/ollama/status', async (_req, res) => {
    try {
      if (!ollamaService) {
        return sendSuccess(res, {
          available: false,
          error: 'Ollama service not configured',
        });
      }
      const conn = await ollamaService.checkConnection();
      const settings = await websiteMonitoringService.getSettings();
      sendSuccess(res, {
        available: conn.connected,
        model: settings.ollamaModel,
        error: conn.error,
      });
    } catch (error) {
      logger.error('Error getting ollama status', error);
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

  // POST /api/v1/websites/:id/scan — start a scan targeting a single website
  router.post('/:id/scan', async (req, res) => {
    try {
      const { id } = req.params;
      const status = await websiteMonitoringService.startScan(id);
      sendSuccess(res, status);
    } catch (error) {
      logger.error('Error starting single-website scan', error);
      sendError(
        res,
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  // PATCH /api/v1/websites/:id
  router.patch('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updated = await websiteMonitoringService.updateWebsite(
        id,
        req.body || {}
      );
      if (!updated) return sendError(res, 404, 'Website not found');
      sendSuccess(res, updated);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const status =
        message.includes('Invalid URL') || message.includes('http or https')
          ? 400
          : 500;
      logger.error('Error updating website', error);
      sendError(res, status, message);
    }
  });

  // DELETE /api/v1/websites/:id
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const removed = await websiteMonitoringService.removeWebsite(id);
      if (!removed) return sendError(res, 404, 'Website not found');
      sendSuccess(res, { removed: true });
    } catch (error) {
      logger.error('Error removing website', error);
      sendError(
        res,
        500,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  });

  return router;
}
