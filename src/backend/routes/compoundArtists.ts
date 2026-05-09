import { Router, Request, Response } from 'express';

import { ArtistNameResolver } from '../services/artistNameResolver';
import { CompoundArtistMappingService } from '../services/compoundArtistMappingService';
import { MappingService } from '../services/mappingService';
import { logger } from '../utils/logger';

export function createCompoundArtistRouter(
  compoundMappingService: CompoundArtistMappingService,
  mappingService: MappingService,
  artistNameResolver?: ArtistNameResolver
) {
  const router = Router();

  // List all compound artist mappings
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const mappings = await compoundMappingService.getAllMappings();
      res.json({
        success: true,
        data: { mappings, total: mappings.length },
      });
    } catch (error) {
      logger.error('Error getting compound artist mappings:', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to get compound artist mappings',
      });
    }
  });

  // Add a compound artist mapping
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { compoundName, components } = req.body;

      if (!compoundName || !components) {
        return res.status(400).json({
          success: false,
          error: 'compoundName and components are required',
        });
      }

      if (typeof compoundName !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'compoundName must be a string',
        });
      }

      if (
        !Array.isArray(components) ||
        components.length < 2 ||
        !components.every((c: unknown) => typeof c === 'string' && c.trim())
      ) {
        return res.status(400).json({
          success: false,
          error: 'components must be an array of at least 2 non-empty strings',
        });
      }

      await compoundMappingService.addMapping(
        compoundName.trim(),
        components.map((c: string) => c.trim()),
        false
      );
      await artistNameResolver?.rebuild();

      res.json({
        success: true,
        data: {
          message: 'Compound artist mapping added successfully',
          compoundName: compoundName.trim(),
          components: components.map((c: string) => c.trim()),
        },
      });
    } catch (error) {
      logger.error('Error adding compound artist mapping:', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to add compound artist mapping',
      });
    }
  });

  // Delete a compound artist mapping
  router.delete('/:compoundName', async (req: Request, res: Response) => {
    try {
      const { compoundName } = req.params;
      const decoded = decodeURIComponent(compoundName);

      const removed = await compoundMappingService.removeMapping(decoded);
      if (!removed) {
        return res.status(404).json({
          success: false,
          error: 'Compound artist mapping not found',
        });
      }

      await artistNameResolver?.rebuild();

      res.json({
        success: true,
        data: {
          message: 'Compound artist mapping removed successfully',
          compoundName: decoded,
        },
      });
    } catch (error) {
      logger.error('Error removing compound artist mapping:', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to remove compound artist mapping',
      });
    }
  });

  // Trigger auto-detection from album mappings
  router.post('/auto-detect', async (_req: Request, res: Response) => {
    try {
      const albumMappings = await mappingService.getAllAlbumMappings();
      const detected =
        await compoundMappingService.autoDetectFromAlbumMappings(albumMappings);

      if (detected > 0) {
        await artistNameResolver?.rebuild();
      }

      res.json({
        success: true,
        data: { detected },
      });
    } catch (error) {
      logger.error('Error auto-detecting compound artists:', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to auto-detect compound artists',
      });
    }
  });

  return router;
}
