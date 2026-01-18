import express, { Request, Response } from 'express';

import { AuthService } from '../services/authService';
import { HiddenReleasesService } from '../services/hiddenReleasesService';
import { ReleaseTrackingService } from '../services/releaseTrackingService';
import { createLogger } from '../utils/logger';

/**
 * Create release tracking routes with dependency injection
 *
 * IMPORTANT: Route ordering matters in Express!
 * Static routes must be defined BEFORE parameterized routes.
 */
export default function createReleasesRouter(
  authService: AuthService,
  releaseTrackingService: ReleaseTrackingService,
  hiddenReleasesService: HiddenReleasesService
) {
  const router = express.Router();
  const logger = createLogger('ReleasesRoutes');

  // ============================================
  // Static Routes (must come before parameterized routes)
  // ============================================

  // ---- Releases List ----

  /**
   * GET /api/v1/releases
   * Get tracked releases with optional filtering
   * Query params:
   *   - types: comma-separated list of release types (album,ep,single,compilation)
   *   - vinylOnly: boolean - only show releases with vinyl available
   *   - upcomingOnly: boolean - only show upcoming releases
   *   - artistMbid: string - filter by artist MusicBrainz ID
   *   - sortBy: releaseDate | artistName | title | firstSeen
   *   - sortOrder: asc | desc
   *   - limit: number
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const {
        types,
        vinylOnly,
        upcomingOnly,
        artistMbid,
        sortBy,
        sortOrder,
        limit,
      } = req.query;

      // Parse types
      const parsedTypes = types
        ? ((types as string)
            .split(',')
            .filter(t =>
              ['album', 'ep', 'single', 'compilation', 'other'].includes(t)
            ) as Array<'album' | 'ep' | 'single' | 'compilation' | 'other'>)
        : undefined;

      const releases = await releaseTrackingService.getFilteredReleases({
        types: parsedTypes,
        vinylOnly: vinylOnly === 'true',
        upcomingOnly: upcomingOnly === 'true',
        artistMbid: artistMbid as string,
        sortBy: sortBy as 'releaseDate' | 'artistName' | 'title' | 'firstSeen',
        sortOrder: sortOrder as 'asc' | 'desc',
        limit: limit ? parseInt(limit as string, 10) : undefined,
      });

      res.json({
        success: true,
        data: releases,
        total: releases.length,
      });
    } catch (error) {
      logger.error('Error getting releases', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ---- Sync Operations ----

  /**
   * GET /api/v1/releases/sync
   * Get sync status
   */
  router.get('/sync', async (_req: Request, res: Response) => {
    try {
      const status = await releaseTrackingService.getSyncStatus();

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      logger.error('Error getting sync status', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/releases/sync
   * Trigger release sync
   */
  router.post('/sync', async (_req: Request, res: Response) => {
    try {
      const settings = await authService.getUserSettings();
      const username = settings.discogs.username;

      if (!username) {
        return res.status(401).json({
          success: false,
          error: 'Discogs authentication required',
        });
      }

      // Start sync (this can take a while)
      const status = await releaseTrackingService.syncReleases(username);

      res.json({
        success: true,
        message: 'Release sync completed',
        data: status,
      });
    } catch (error) {
      logger.error('Error during release sync', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ---- Settings ----

  /**
   * GET /api/v1/releases/settings
   * Get release tracking settings
   */
  router.get('/settings', async (_req: Request, res: Response) => {
    try {
      const settings = await releaseTrackingService.getSettings();

      res.json({
        success: true,
        data: settings,
      });
    } catch (error) {
      logger.error('Error getting release settings', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/releases/settings
   * Save release tracking settings
   */
  router.post('/settings', async (req: Request, res: Response) => {
    try {
      const {
        autoCheckOnStartup,
        checkFrequencyDays,
        notifyOnNewRelease,
        includeEps,
        includeSingles,
        includeCompilations,
      } = req.body;

      const settings = await releaseTrackingService.saveSettings({
        autoCheckOnStartup,
        checkFrequencyDays,
        notifyOnNewRelease,
        includeEps,
        includeSingles,
        includeCompilations,
      });

      res.json({
        success: true,
        data: settings,
      });
    } catch (error) {
      logger.error('Error saving release settings', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ---- Disambiguations ----

  /**
   * GET /api/v1/releases/disambiguations
   * Get pending artist disambiguations
   */
  router.get('/disambiguations', async (_req: Request, res: Response) => {
    try {
      const pending = await releaseTrackingService.getPendingDisambiguations();

      res.json({
        success: true,
        data: pending,
        total: pending.length,
      });
    } catch (error) {
      logger.error('Error getting disambiguations', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/releases/disambiguations/:id/resolve
   * Resolve a disambiguation (select an artist)
   * Body: { mbid: string | null }
   */
  router.post(
    '/disambiguations/:id/resolve',
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { mbid } = req.body;

        if (mbid === undefined) {
          return res.status(400).json({
            success: false,
            error: 'mbid is required (can be null for "none of these")',
          });
        }

        const disambiguation =
          await releaseTrackingService.resolveDisambiguation(id, mbid);

        if (!disambiguation) {
          return res.status(404).json({
            success: false,
            error: 'Disambiguation not found',
          });
        }

        res.json({
          success: true,
          message: 'Disambiguation resolved',
          data: disambiguation,
        });
      } catch (error) {
        logger.error('Error resolving disambiguation', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * POST /api/v1/releases/disambiguations/:id/skip
   * Skip a disambiguation
   */
  router.post(
    '/disambiguations/:id/skip',
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;

        const skipped = await releaseTrackingService.skipDisambiguation(id);

        if (!skipped) {
          return res.status(404).json({
            success: false,
            error: 'Disambiguation not found',
          });
        }

        res.json({
          success: true,
          message: 'Disambiguation skipped',
        });
      } catch (error) {
        logger.error('Error skipping disambiguation', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // ---- Artist Mappings ----

  /**
   * GET /api/v1/releases/mappings
   * Get all artist MBID mappings
   */
  router.get('/mappings', async (_req: Request, res: Response) => {
    try {
      const mappings = await releaseTrackingService.getArtistMappings();

      res.json({
        success: true,
        data: mappings,
        total: mappings.length,
      });
    } catch (error) {
      logger.error('Error getting artist mappings', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/releases/mappings
   * Add or update an artist mapping
   * Body: { artistName: string, mbid: string | null }
   */
  router.post('/mappings', async (req: Request, res: Response) => {
    try {
      const { artistName, mbid } = req.body;

      if (!artistName) {
        return res.status(400).json({
          success: false,
          error: 'artistName is required',
        });
      }

      const mapping = await releaseTrackingService.setArtistMapping(
        artistName,
        mbid,
        'user'
      );

      res.json({
        success: true,
        message: 'Artist mapping saved',
        data: mapping,
      });
    } catch (error) {
      logger.error('Error saving artist mapping', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * DELETE /api/v1/releases/mappings/:artistName
   * Remove an artist mapping
   */
  router.delete(
    '/mappings/:artistName',
    async (req: Request, res: Response) => {
      try {
        const artistName = decodeURIComponent(req.params.artistName);

        const removed =
          await releaseTrackingService.removeArtistMapping(artistName);

        if (!removed) {
          return res.status(404).json({
            success: false,
            error: 'Mapping not found',
          });
        }

        res.json({
          success: true,
          message: 'Artist mapping removed',
        });
      } catch (error) {
        logger.error('Error removing artist mapping', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // ---- Artist Search ----

  /**
   * GET /api/v1/releases/search/artist
   * Search MusicBrainz for an artist
   * Query params:
   *   - name: string (required)
   */
  router.get('/search/artist', async (req: Request, res: Response) => {
    try {
      const { name } = req.query;

      if (!name) {
        return res.status(400).json({
          success: false,
          error: 'name query parameter is required',
        });
      }

      const results = await releaseTrackingService.searchArtist(name as string);

      res.json({
        success: true,
        data: results,
        total: results.length,
      });
    } catch (error) {
      logger.error('Error searching for artist', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ---- Vinyl Check ----

  /**
   * POST /api/v1/releases/check-vinyl
   * Check vinyl availability for all tracked releases
   */
  router.post('/check-vinyl', async (_req: Request, res: Response) => {
    try {
      const checked = await releaseTrackingService.checkVinylAvailability();

      res.json({
        success: true,
        message: `Checked vinyl availability for ${checked} releases`,
        data: { checked },
      });
    } catch (error) {
      logger.error('Error checking vinyl availability', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/releases/check-vinyl/:mbid
   * Check vinyl availability for a single release
   */
  router.post('/check-vinyl/:mbid', async (req: Request, res: Response) => {
    try {
      const { mbid } = req.params;

      const release =
        await releaseTrackingService.checkSingleReleaseVinyl(mbid);

      if (!release) {
        return res.status(404).json({
          success: false,
          error: 'Release not found',
        });
      }

      res.json({
        success: true,
        message: `Vinyl check complete: ${release.vinylStatus}`,
        data: release,
      });
    } catch (error) {
      logger.error('Error checking vinyl for release', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ---- Cover Art ----

  /**
   * POST /api/v1/releases/fetch-covers
   * Fetch missing cover art for tracked releases
   */
  router.post('/fetch-covers', async (_req: Request, res: Response) => {
    try {
      const updated = await releaseTrackingService.fetchMissingCoverArt();

      res.json({
        success: true,
        message: `Updated cover art for ${updated} releases`,
        data: { updated },
      });
    } catch (error) {
      logger.error('Error fetching cover art', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ---- Wishlist Integration ----

  /**
   * POST /api/v1/releases/:mbid/wishlist
   * Add a tracked release to the user's wishlist
   */
  router.post('/:mbid/wishlist', async (req: Request, res: Response) => {
    try {
      const { mbid } = req.params;

      const added = await releaseTrackingService.addToWishlist(mbid);

      if (!added) {
        return res.status(400).json({
          success: false,
          error:
            'Could not add to wishlist (release not found or no Discogs ID)',
        });
      }

      res.json({
        success: true,
        message: 'Added to wishlist',
      });
    } catch (error) {
      logger.error('Error adding to wishlist', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ---- Collection Artists ----

  /**
   * GET /api/v1/releases/collection-artists
   * Get unique artists from the user's collection
   */
  router.get('/collection-artists', async (_req: Request, res: Response) => {
    try {
      const settings = await authService.getUserSettings();
      const username = settings.discogs.username;

      if (!username) {
        return res.status(401).json({
          success: false,
          error: 'Discogs authentication required',
        });
      }

      const artists =
        await releaseTrackingService.getCollectionArtists(username);

      res.json({
        success: true,
        data: artists,
        total: artists.length,
      });
    } catch (error) {
      logger.error('Error getting collection artists', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ---- Hidden Releases ----

  /**
   * GET /api/v1/releases/hidden
   * Get all hidden releases
   */
  router.get('/hidden', async (_req: Request, res: Response) => {
    try {
      const hiddenReleases = await hiddenReleasesService.getAllHiddenReleases();

      res.json({
        success: true,
        data: hiddenReleases,
        total: hiddenReleases.length,
      });
    } catch (error) {
      logger.error('Error getting hidden releases', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/releases/hidden
   * Hide a release
   * Body: { mbid: string, title: string, artistName: string }
   */
  router.post('/hidden', async (req: Request, res: Response) => {
    try {
      const { mbid, title, artistName } = req.body;

      if (!mbid || !title || !artistName) {
        return res.status(400).json({
          success: false,
          error: 'mbid, title, and artistName are required',
        });
      }

      await hiddenReleasesService.hideRelease(mbid, title, artistName);

      res.json({
        success: true,
        message: 'Release hidden',
      });
    } catch (error) {
      logger.error('Error hiding release', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * DELETE /api/v1/releases/hidden/:mbid
   * Unhide a release
   */
  router.delete('/hidden/:mbid', async (req: Request, res: Response) => {
    try {
      const { mbid } = req.params;

      const removed = await hiddenReleasesService.unhideRelease(mbid);

      if (!removed) {
        return res.status(404).json({
          success: false,
          error: 'Hidden release not found',
        });
      }

      res.json({
        success: true,
        message: 'Release unhidden',
      });
    } catch (error) {
      logger.error('Error unhiding release', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ---- Excluded Artists ----

  /**
   * GET /api/v1/releases/excluded-artists
   * Get all excluded artists
   */
  router.get('/excluded-artists', async (_req: Request, res: Response) => {
    try {
      const excludedArtists =
        await hiddenReleasesService.getAllExcludedArtists();

      res.json({
        success: true,
        data: excludedArtists,
        total: excludedArtists.length,
      });
    } catch (error) {
      logger.error('Error getting excluded artists', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/releases/excluded-artists
   * Exclude an artist from release tracking
   * Body: { artistName: string, artistMbid?: string }
   */
  router.post('/excluded-artists', async (req: Request, res: Response) => {
    try {
      const { artistName, artistMbid } = req.body;

      if (!artistName) {
        return res.status(400).json({
          success: false,
          error: 'artistName is required',
        });
      }

      await hiddenReleasesService.excludeArtist(artistName, artistMbid);

      res.json({
        success: true,
        message: 'Artist excluded from release tracking',
      });
    } catch (error) {
      logger.error('Error excluding artist', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * DELETE /api/v1/releases/excluded-artists/:artistName
   * Include an artist back in release tracking
   */
  router.delete(
    '/excluded-artists/:artistName',
    async (req: Request, res: Response) => {
      try {
        const artistName = decodeURIComponent(req.params.artistName);

        const removed = await hiddenReleasesService.includeArtist(artistName);

        if (!removed) {
          return res.status(404).json({
            success: false,
            error: 'Excluded artist not found',
          });
        }

        res.json({
          success: true,
          message: 'Artist included in release tracking',
        });
      } catch (error) {
        logger.error('Error including artist', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /api/v1/releases/filters/counts
   * Get counts of hidden releases and excluded artists
   */
  router.get('/filters/counts', async (_req: Request, res: Response) => {
    try {
      const counts = await hiddenReleasesService.getCounts();

      res.json({
        success: true,
        data: counts,
      });
    } catch (error) {
      logger.error('Error getting filter counts', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
