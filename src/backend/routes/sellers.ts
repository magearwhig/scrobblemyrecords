import express from 'express';

import { AuthService } from '../services/authService';
import { SellerMonitoringService } from '../services/sellerMonitoringService';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';
import { validateUsername } from '../utils/validation';

export default function createSellersRouter(
  _fileStorage: FileStorage,
  _authService: AuthService,
  sellerMonitoringService: SellerMonitoringService
) {
  const router = express.Router();
  const logger = createLogger('SellersRoutes');

  // ============================================
  // Static routes first!
  // ============================================

  // GET /api/v1/sellers - List monitored sellers
  router.get('/', async (_req, res) => {
    try {
      const sellers = await sellerMonitoringService.getSellers();
      res.json({ success: true, data: sellers, total: sellers.length });
    } catch (error) {
      logger.error('Error getting sellers', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // POST /api/v1/sellers - Add seller (validates username via Discogs API)
  router.post('/', async (req, res) => {
    try {
      const { username, displayName } = req.body;

      if (!username || typeof username !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Username is required',
        });
      }

      // Basic format validation
      if (!validateUsername(username)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid username format',
        });
      }

      // Validate seller exists on Discogs and add (inside addSeller)
      const seller = await sellerMonitoringService.addSeller(
        username,
        displayName
      );
      res.json({ success: true, data: seller });
    } catch (error) {
      logger.error('Error adding seller', error);
      const statusCode =
        error instanceof Error &&
        (error.message.includes('Already monitoring') ||
          error.message.includes('not found'))
          ? 400
          : 500;
      res.status(statusCode).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // GET /api/v1/sellers/matches - All matches with cache info
  router.get('/matches', async (req, res) => {
    try {
      const includeCacheInfo = req.query.includeCacheInfo === 'true';

      if (includeCacheInfo) {
        const result =
          await sellerMonitoringService.getAllMatchesWithCacheInfo();
        res.json({
          success: true,
          data: result.matches,
          total: result.matches.length,
          cacheInfo: result.cacheInfo,
        });
      } else {
        const matches = await sellerMonitoringService.getAllMatches();
        res.json({ success: true, data: matches, total: matches.length });
      }
    } catch (error) {
      logger.error('Error getting matches', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // POST /api/v1/sellers/scan - Trigger scan (starts in background)
  // Body: { forceFresh?: boolean } - If true, re-fetch inventory from API even if cached
  router.post('/scan', async (req, res) => {
    try {
      const { forceFresh } = req.body || {};
      const status = await sellerMonitoringService.startScan(
        forceFresh === true
      );
      res.json({ success: true, data: status });
    } catch (error) {
      logger.error('Error starting scan', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // GET /api/v1/sellers/scan/status - Scan progress
  router.get('/scan/status', async (_req, res) => {
    try {
      const status = await sellerMonitoringService.getScanStatus();
      res.json({ success: true, data: status });
    } catch (error) {
      logger.error('Error getting scan status', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // GET /api/v1/sellers/settings - Get settings
  router.get('/settings', async (_req, res) => {
    try {
      const settings = await sellerMonitoringService.getSettings();
      res.json({ success: true, data: settings });
    } catch (error) {
      logger.error('Error getting settings', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // POST /api/v1/sellers/settings - Save settings
  router.post('/settings', async (req, res) => {
    try {
      const settings = await sellerMonitoringService.saveSettings(req.body);
      res.json({ success: true, data: settings });
    } catch (error) {
      logger.error('Error saving settings', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // GET /api/v1/sellers/cache/stats - Get release cache statistics
  router.get('/cache/stats', async (_req, res) => {
    try {
      const stats = await sellerMonitoringService.getReleaseCacheStats();
      res.json({ success: true, data: stats });
    } catch (error) {
      logger.error('Error getting cache stats', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // POST /api/v1/sellers/cache/refresh - Pre-populate release cache from wishlist
  // This fetches all release versions for each wishlist master_id
  // to make future scans faster (no API calls needed for known releases)
  router.post('/cache/refresh', async (_req, res) => {
    try {
      logger.info('Starting release cache refresh...');
      const result = await sellerMonitoringService.refreshReleaseCache();
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Error refreshing cache', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================
  // Routes with specific path prefixes + params
  // ============================================

  // POST /api/v1/sellers/matches/:matchId/seen - Mark as seen
  router.post('/matches/:matchId/seen', async (req, res) => {
    try {
      const { matchId } = req.params;
      await sellerMonitoringService.markMatchAsSeen(matchId);
      res.json({ success: true, message: 'Match marked as seen' });
    } catch (error) {
      logger.error('Error marking match as seen', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // POST /api/v1/sellers/matches/:matchId/notified - Mark as notified
  // Called by frontend after creating notification to prevent duplicates
  router.post('/matches/:matchId/notified', async (req, res) => {
    try {
      const { matchId } = req.params;
      await sellerMonitoringService.markMatchAsNotified(matchId);
      res.json({ success: true, message: 'Match marked as notified' });
    } catch (error) {
      logger.error('Error marking match as notified', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // POST /api/v1/sellers/matches/:matchId/verify - Verify listing status on Discogs
  // Checks if listing is still available and updates status accordingly
  router.post('/matches/:matchId/verify', async (req, res) => {
    try {
      const { matchId } = req.params;
      const result =
        await sellerMonitoringService.verifyAndUpdateMatch(matchId);
      res.json({
        success: true,
        data: result,
        message: result.updated
          ? `Match status updated to ${result.status}`
          : `Match status unchanged (${result.status})`,
      });
    } catch (error) {
      logger.error('Error verifying match', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================
  // Generic parameterized routes (must be last!)
  // ============================================

  // DELETE /api/v1/sellers/:username - Remove seller
  router.delete('/:username', async (req, res) => {
    try {
      const { username } = req.params;

      if (!validateUsername(username)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid username format',
        });
      }

      const removed = await sellerMonitoringService.removeSeller(username);
      if (!removed) {
        return res.status(404).json({
          success: false,
          error: 'Seller not found',
        });
      }
      res.json({ success: true, message: 'Seller removed' });
    } catch (error) {
      logger.error('Error removing seller', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // GET /api/v1/sellers/:username/matches - Matches for specific seller
  router.get('/:username/matches', async (req, res) => {
    try {
      const { username } = req.params;

      if (!validateUsername(username)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid username format',
        });
      }

      const matches =
        await sellerMonitoringService.getMatchesBySeller(username);
      res.json({ success: true, data: matches, total: matches.length });
    } catch (error) {
      logger.error('Error getting seller matches', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
