/**
 * Express routes for the embedding-based recommendation system.
 *
 * All responses use the ApiResponse<T> wrapper via sendSuccess/sendError.
 * Factory pattern: createRecommendationsRouter(services...) returns an express.Router.
 */

import express, { Request, Response } from 'express';

import { AuthService } from '../services/authService';
import { LastFmService } from '../services/lastfmService';
import { RecentScrobble } from '../services/profileBuilderService';
import { RecommendationService } from '../services/recommendationService';
import { sendError, sendSuccess } from '../utils/apiResponse';
import { getAllCachedCollectionItems } from '../utils/collectionCache';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

const log = createLogger('RecommendationsRoute');

/**
 * Create the recommendations router with injected dependencies.
 */
export function createRecommendationsRouter(
  recommendationService: RecommendationService,
  lastfmService: LastFmService,
  authService: AuthService,
  fileStorage: FileStorage
): express.Router {
  const router = express.Router();

  /**
   * GET /api/v1/recommendations
   * Get top N recommendations based on recent Last.fm listening history.
   *
   * Query params:
   *   count      - number of results to return (default 10)
   *   window     - hours of listening history to consider (default 168)
   *   excludeRecent - exclude recently played records (default true)
   *   minScore   - minimum score threshold (default 0.3)
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const settings = await authService.getUserSettings();
      if (!settings.lastfm.username) {
        return sendError(res, 401, 'Last.fm authentication required');
      }

      const count = parseInt(req.query.count as string, 10) || 10;
      const windowHours = parseInt(req.query.window as string, 10) || 168;
      const excludeRecent = req.query.excludeRecent !== 'false';
      const minScore = parseFloat(req.query.minScore as string) || 0.3;

      if (count < 1 || count > 100) {
        return sendError(res, 400, 'count must be between 1 and 100');
      }
      if (windowHours < 1 || windowHours > 8760) {
        return sendError(res, 400, 'window must be between 1 and 8760 hours');
      }
      if (minScore < 0 || minScore > 1) {
        return sendError(res, 400, 'minScore must be between 0 and 1');
      }

      // Fetch recent scrobbles from Last.fm for the given time window
      // Last.fm API uses seconds for the `from` parameter
      const windowFromMs = Date.now() - windowHours * 60 * 60 * 1000;
      const recentScrobbles = await fetchScrobblesInWindow(
        lastfmService,
        windowFromMs
      );

      log.info('Fetched recent scrobbles for recommendations', {
        count: recentScrobbles.length,
        windowHours,
      });

      const results = await recommendationService.getRecommendations({
        count,
        windowHours,
        excludeRecent,
        minScore,
        recentScrobbles,
      });

      // Enrich results with cover images from collection cache
      const discogsUsername = settings.discogs.username;
      const coverMap = discogsUsername
        ? await buildCoverImageMap(discogsUsername, fileStorage)
        : new Map<number, string>();
      for (const result of results) {
        const cover = coverMap.get(result.release.id);
        if (cover) {
          result.release.cover_image = cover;
        }
      }

      sendSuccess(res, results);
    } catch (err) {
      log.error('Error getting recommendations', err);

      // Surface a user-friendly message when Last.fm API is down
      const isUpstreamError =
        err instanceof Error &&
        (err.message.includes('status code 5') ||
          err.message.includes('ECONNREFUSED'));
      const message = isUpstreamError
        ? 'Last.fm API is temporarily unavailable. Please try again in a few minutes.'
        : err instanceof Error
          ? err.message
          : 'Failed to get recommendations';

      sendError(res, isUpstreamError ? 502 : 500, message);
    }
  });

  /**
   * GET /api/v1/recommendations/debug/:releaseId
   * Full scoring breakdown for a single record.
   */
  router.get('/debug/:releaseId', async (req: Request, res: Response) => {
    try {
      const releaseId = parseInt(req.params.releaseId, 10);
      if (isNaN(releaseId)) {
        return sendError(res, 400, 'Invalid releaseId');
      }

      const settings = await authService.getUserSettings();
      if (!settings.lastfm.username) {
        return sendError(res, 401, 'Last.fm authentication required');
      }

      const recentScrobbles = await fetchScrobblesInWindow(
        lastfmService,
        Date.now() - 168 * 60 * 60 * 1000
      );

      const breakdown = await recommendationService.getDebugBreakdown(
        releaseId,
        recentScrobbles
      );

      if (!breakdown) {
        return sendError(
          res,
          404,
          `No embedding found for release ${releaseId}. Run an embedding rebuild first.`
        );
      }

      sendSuccess(res, breakdown);
    } catch (err) {
      log.error('Error getting debug breakdown', err);
      sendError(
        res,
        500,
        err instanceof Error ? err.message : 'Failed to get debug breakdown'
      );
    }
  });

  /**
   * POST /api/v1/recommendations/feedback
   * Log user feedback for a recommendation.
   *
   * Body: { releaseId: number, action: 'played' | 'skipped' | 'not_interested' }
   */
  router.post('/feedback', async (req: Request, res: Response) => {
    try {
      const { releaseId, action } = req.body as {
        releaseId: unknown;
        action: unknown;
      };

      if (typeof releaseId !== 'number' || !Number.isInteger(releaseId)) {
        return sendError(res, 400, 'releaseId must be an integer');
      }

      const validActions = ['played', 'skipped', 'not_interested'] as const;
      if (!validActions.includes(action as (typeof validActions)[number])) {
        return sendError(
          res,
          400,
          'action must be one of: played, skipped, not_interested'
        );
      }

      await recommendationService.submitFeedback(
        releaseId,
        action as 'played' | 'skipped' | 'not_interested'
      );

      sendSuccess(res, { success: true });
    } catch (err) {
      log.error('Error submitting feedback', err);
      sendError(
        res,
        500,
        err instanceof Error ? err.message : 'Failed to submit feedback'
      );
    }
  });

  /**
   * GET /api/v1/recommendations/settings
   * Get current recommendation settings.
   */
  router.get('/settings', async (_req: Request, res: Response) => {
    try {
      const settings = await recommendationService.getSettings();
      sendSuccess(res, settings);
    } catch (err) {
      log.error('Error getting recommendation settings', err);
      sendError(
        res,
        500,
        err instanceof Error ? err.message : 'Failed to get settings'
      );
    }
  });

  /**
   * PUT /api/v1/recommendations/settings
   * Update recommendation settings.
   *
   * Body: Partial<RecommendationSettings>
   */
  router.put('/settings', async (req: Request, res: Response) => {
    try {
      await recommendationService.updateSettings(req.body);
      const updated = await recommendationService.getSettings();
      sendSuccess(res, updated);
    } catch (err) {
      log.error('Error updating recommendation settings', err);
      sendError(
        res,
        500,
        err instanceof Error ? err.message : 'Failed to update settings'
      );
    }
  });

  return router;
}

/**
 * Fetch recent scrobbles from Last.fm from a given timestamp.
 *
 * Last.fm's user.getRecentTracks accepts a `from` param (Unix seconds).
 * We request up to 200 tracks per call (API maximum per page).
 * For large windows, we accept the 200-track limit as a reasonable sample.
 */
async function fetchScrobblesInWindow(
  lastfmService: LastFmService,
  fromMs: number
): Promise<RecentScrobble[]> {
  const tracks = await lastfmService.getRecentScrobbles(200);

  const fromSeconds = Math.floor(fromMs / 1000);

  const filtered = tracks
    .filter(track => {
      // Skip currently-playing track (no date)
      if (!track.date) return false;
      const ts = parseInt(track.date.uts, 10);
      return !isNaN(ts) && ts >= fromSeconds;
    })
    .map(track => ({
      artist: track.artist['#text'],
      track: track.name,
      album: track.album?.['#text'],
      timestamp: track.date ? parseInt(track.date.uts, 10) * 1000 : undefined,
    }));

  return filtered;
}

/**
 * Build a releaseId → cover_image lookup from the collection cache.
 * Returns an empty map if the cache can't be loaded.
 */
async function buildCoverImageMap(
  username: string,
  fileStorage: FileStorage
): Promise<Map<number, string>> {
  const allItems = await getAllCachedCollectionItems(username, fileStorage);
  const map = new Map<number, string>();

  for (const item of allItems) {
    if (item.release.cover_image) {
      map.set(item.release.id, item.release.cover_image);
    }
  }

  return map;
}
