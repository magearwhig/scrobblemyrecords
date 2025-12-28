import { Router, Request, Response } from 'express';

import { artistMappingService } from '../services/artistMappingService';
import { FileStorage } from '../utils/fileStorage';
import { logger } from '../utils/logger';

const router = Router();

// Get all artist mappings
router.get('/', async (req: Request, res: Response) => {
  try {
    const mappings = artistMappingService.getAllMappings();
    const stats = artistMappingService.getStats();

    res.json({
      success: true,
      data: {
        mappings,
        stats,
      },
    });
  } catch (error) {
    logger.error('Error getting artist mappings:', error);
    res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to get artist mappings',
    });
  }
});

// Add or update an artist mapping
router.post('/', async (req: Request, res: Response) => {
  try {
    const { discogsName, lastfmName } = req.body;

    if (!discogsName || !lastfmName) {
      return res.status(400).json({
        success: false,
        error: 'Both discogsName and lastfmName are required',
      });
    }

    if (typeof discogsName !== 'string' || typeof lastfmName !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Artist names must be strings',
      });
    }

    artistMappingService.setMapping(discogsName.trim(), lastfmName.trim());

    res.json({
      success: true,
      data: {
        message: 'Artist mapping added successfully',
        discogsName: discogsName.trim(),
        lastfmName: lastfmName.trim(),
      },
    });
  } catch (error) {
    logger.error('Error adding artist mapping:', error);
    res.status(500).json({
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to add artist mapping',
    });
  }
});

// Update an existing artist mapping
router.put('/:discogsName', async (req: Request, res: Response) => {
  try {
    const { discogsName } = req.params;
    const { lastfmName } = req.body;

    if (!lastfmName) {
      return res.status(400).json({
        success: false,
        error: 'lastfmName is required',
      });
    }

    if (typeof lastfmName !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'lastfmName must be a string',
      });
    }

    const decodedDiscogsName = decodeURIComponent(discogsName);

    if (!artistMappingService.hasMapping(decodedDiscogsName)) {
      return res.status(404).json({
        success: false,
        error: 'Artist mapping not found',
      });
    }

    artistMappingService.setMapping(decodedDiscogsName, lastfmName.trim());

    res.json({
      success: true,
      data: {
        message: 'Artist mapping updated successfully',
        discogsName: decodedDiscogsName,
        lastfmName: lastfmName.trim(),
      },
    });
  } catch (error) {
    logger.error('Error updating artist mapping:', error);
    res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to update artist mapping',
    });
  }
});

// Delete an artist mapping
router.delete('/:discogsName', async (req: Request, res: Response) => {
  try {
    const { discogsName } = req.params;
    const decodedDiscogsName = decodeURIComponent(discogsName);

    const removed = artistMappingService.removeMapping(decodedDiscogsName);

    if (!removed) {
      return res.status(404).json({
        success: false,
        error: 'Artist mapping not found',
      });
    }

    res.json({
      success: true,
      data: {
        message: 'Artist mapping removed successfully',
        discogsName: decodedDiscogsName,
      },
    });
  } catch (error) {
    logger.error('Error removing artist mapping:', error);
    res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to remove artist mapping',
    });
  }
});

// Get Last.fm name for a specific Discogs artist
router.get('/lookup/:discogsName', async (req: Request, res: Response) => {
  try {
    const { discogsName } = req.params;
    const decodedDiscogsName = decodeURIComponent(discogsName);

    const lastfmName = artistMappingService.getLastfmName(decodedDiscogsName);
    const hasMapping = artistMappingService.hasMapping(decodedDiscogsName);

    res.json({
      success: true,
      data: {
        discogsName: decodedDiscogsName,
        lastfmName,
        hasMapping,
        isOriginal: !hasMapping,
      },
    });
  } catch (error) {
    logger.error('Error looking up artist mapping:', error);
    res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to lookup artist mapping',
    });
  }
});

// Import artist mappings
router.post('/import', async (req: Request, res: Response) => {
  try {
    const { mappings } = req.body;

    if (!Array.isArray(mappings)) {
      return res.status(400).json({
        success: false,
        error: 'Mappings must be an array',
      });
    }

    const result = artistMappingService.importMappings(mappings);

    res.json({
      success: true,
      data: {
        message: 'Import completed',
        imported: result.imported,
        skipped: result.skipped,
        errors: result.errors,
      },
    });
  } catch (error) {
    logger.error('Error importing artist mappings:', error);
    res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to import artist mappings',
    });
  }
});

// Export artist mappings
router.get('/export', async (req: Request, res: Response) => {
  try {
    const data = artistMappingService.exportMappings();

    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="artist-mappings-${new Date().toISOString().split('T')[0]}.json"`
    );

    res.json(data);
  } catch (error) {
    logger.error('Error exporting artist mappings:', error);
    res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to export artist mappings',
    });
  }
});

// Clear all artist mappings
router.delete('/', async (req: Request, res: Response) => {
  try {
    artistMappingService.clearAllMappings();

    res.json({
      success: true,
      data: {
        message: 'All artist mappings cleared successfully',
      },
    });
  } catch (error) {
    logger.error('Error clearing artist mappings:', error);
    res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to clear artist mappings',
    });
  }
});

// Get artist mapping statistics
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = artistMappingService.getStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Error getting artist mapping stats:', error);
    res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to get artist mapping stats',
    });
  }
});

// Get artists with disambiguation suffix that need mappings
router.get('/suggestions', async (req: Request, res: Response) => {
  try {
    const { username } = req.query;

    if (!username || typeof username !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Username is required',
      });
    }

    const fileStorage = new FileStorage();
    const DISAMBIGUATION_PATTERN = /\s*\(\d+\)\s*$/;

    // Get collection artists
    const collectionPath = `collections/${username}.json`;
    let collectionArtists: string[] = [];

    try {
      const collection = await fileStorage.readJSON<{
        items: Array<{ release: { artist: string } }>;
      }>(collectionPath);
      if (collection?.items) {
        const artistSet = new Set<string>();
        collection.items.forEach(item => {
          if (item.release?.artist) {
            artistSet.add(item.release.artist);
          }
        });
        collectionArtists = Array.from(artistSet);
      }
    } catch {
      // Collection not cached yet
      collectionArtists = [];
    }

    // Filter to only disambiguation artists without mappings
    const disambiguationArtists = collectionArtists
      .filter(artist => DISAMBIGUATION_PATTERN.test(artist))
      .filter(artist => !artistMappingService.hasMapping(artist));

    // Get local scrobble counts
    const scrobbleCounts: Record<string, number> = {};
    try {
      const scrobbleFiles = await fileStorage.listFiles('scrobbles');
      for (const file of scrobbleFiles) {
        if (file.startsWith('session-')) {
          try {
            const session = await fileStorage.readJSON<{
              tracks: Array<{ artist: string; status?: string }>;
            }>(`scrobbles/${file}`);
            if (session?.tracks) {
              session.tracks.forEach(track => {
                if (
                  track.artist &&
                  disambiguationArtists.includes(track.artist)
                ) {
                  scrobbleCounts[track.artist] =
                    (scrobbleCounts[track.artist] || 0) + 1;
                }
              });
            }
          } catch {
            // Skip invalid files
          }
        }
      }
    } catch {
      // Scrobbles directory may not exist
    }

    // Build response with artist details
    const suggestions = disambiguationArtists.map(artist => ({
      artist,
      localScrobbles: scrobbleCounts[artist] || 0,
      suggestedMapping: artist.replace(DISAMBIGUATION_PATTERN, '').trim(),
    }));

    // Sort by local scrobbles (most scrobbled first)
    suggestions.sort((a, b) => b.localScrobbles - a.localScrobbles);

    res.json({
      success: true,
      data: {
        suggestions,
        total: suggestions.length,
      },
    });
  } catch (error) {
    logger.error('Error getting artist mapping suggestions:', error);
    res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to get artist mapping suggestions',
    });
  }
});

export default router;
