import express, { Request, Response } from 'express';

import { CollectionItem } from '../../shared/types';
import { AuthService } from '../services/authService';
import { ImageService } from '../services/imageService';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

/**
 * Create image routes with dependency injection
 */
export default function createImagesRouter(
  fileStorage: FileStorage,
  authService: AuthService,
  imageService: ImageService
) {
  const router = express.Router();
  const logger = createLogger('ImagesRoutes');

  /**
   * Helper to load user's collection from cache
   */
  async function loadCollection(username: string): Promise<CollectionItem[]> {
    const allItems: CollectionItem[] = [];
    let pageNumber = 1;

    while (true) {
      const cacheKey = `collections/${username}-page-${pageNumber}.json`;
      const cached = await fileStorage.readJSON<{
        data: CollectionItem[];
        timestamp: number;
      }>(cacheKey);

      if (!cached || !cached.data) break;
      allItems.push(...cached.data);
      pageNumber++;
    }

    return allItems;
  }

  // ============================================
  // Album Covers
  // ============================================

  /**
   * GET /api/v1/images/album
   * Get album cover URL
   */
  router.get('/album', async (req: Request, res: Response) => {
    try {
      const artist = req.query.artist as string;
      const album = req.query.album as string;

      if (!artist || !album) {
        return res.status(400).json({
          success: false,
          error: 'Artist and album are required query parameters',
        });
      }

      // First try to get from collection
      const settings = await authService.getUserSettings();
      const username = settings.discogs.username;

      if (username) {
        const collection = await loadCollection(username);
        const collectionCover = imageService.getAlbumCoverFromCollection(
          collection,
          artist,
          album
        );

        if (collectionCover) {
          return res.json({
            success: true,
            data: {
              url: collectionCover,
              source: 'discogs',
            },
          });
        }
      }

      // Fall back to Last.fm
      const url = await imageService.getAlbumCover(artist, album);

      res.json({
        success: true,
        data: {
          url,
          source: url ? 'lastfm' : null,
        },
      });
    } catch (error) {
      logger.error('Error getting album cover', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================
  // Artist Images
  // ============================================

  /**
   * GET /api/v1/images/artist
   * Get artist image URL
   */
  router.get('/artist', async (req: Request, res: Response) => {
    try {
      const name = req.query.name as string;

      if (!name) {
        return res.status(400).json({
          success: false,
          error: 'Name is a required query parameter',
        });
      }

      const url = await imageService.getArtistImage(name);

      res.json({
        success: true,
        data: {
          url,
          source: url ? 'lastfm' : null,
        },
      });
    } catch (error) {
      logger.error('Error getting artist image', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================
  // Batch Operations
  // ============================================

  /**
   * POST /api/v1/images/batch/albums
   * Batch fetch album covers
   */
  router.post('/batch/albums', async (req: Request, res: Response) => {
    try {
      const { albums } = req.body;

      if (!albums || !Array.isArray(albums)) {
        return res.status(400).json({
          success: false,
          error: 'Albums array is required in request body',
        });
      }

      // Validate each album entry
      for (const album of albums) {
        if (!album.artist || !album.album) {
          return res.status(400).json({
            success: false,
            error: 'Each album must have artist and album properties',
          });
        }
      }

      const results = await imageService.batchGetAlbumCovers(albums);

      // Convert map to object for JSON response
      const data: Record<string, string | null> = {};
      for (const [key, url] of results.entries()) {
        data[key] = url;
      }

      res.json({
        success: true,
        data,
        total: albums.length,
      });
    } catch (error) {
      logger.error('Error batch fetching album covers', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/images/batch/artists
   * Batch fetch artist images
   */
  router.post('/batch/artists', async (req: Request, res: Response) => {
    try {
      const { artists } = req.body;

      if (!artists || !Array.isArray(artists)) {
        return res.status(400).json({
          success: false,
          error: 'Artists array is required in request body',
        });
      }

      const results = await imageService.batchGetArtistImages(artists);

      // Convert map to object for JSON response
      const data: Record<string, string | null> = {};
      for (const [key, url] of results.entries()) {
        data[key] = url;
      }

      res.json({
        success: true,
        data,
        total: artists.length,
      });
    } catch (error) {
      logger.error('Error batch fetching artist images', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ============================================
  // Cache Management
  // ============================================

  /**
   * POST /api/v1/images/cleanup
   * Clean up expired cache entries
   */
  router.post('/cleanup', async (_req: Request, res: Response) => {
    try {
      const result = await imageService.cleanupExpiredCache();

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Error cleaning up image cache', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
