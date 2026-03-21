import express, { Request, Response } from 'express';

import { ScrobbleTrack, TrackSearchResult } from '../../shared/types';
import { artistMappingService } from '../services/artistMappingService';
import { DurationLookupService } from '../services/durationLookupService';
import { SavedCollectionService } from '../services/savedCollectionService';
import { ScrobbleHistoryStorage } from '../services/scrobbleHistoryStorage';
import { createLogger } from '../utils/logger';

const logger = createLogger('MemoryScrobbleRouter');

export function createMemoryScrobbleRouter(
  savedCollectionService: SavedCollectionService,
  durationLookupService: DurationLookupService,
  historyStorage: ScrobbleHistoryStorage
) {
  const router = express.Router();

  // GET /collections — list all saved collections
  router.get('/collections', async (_req: Request, res: Response) => {
    try {
      const collections = await savedCollectionService.getCollections();
      res.json({ success: true, data: collections });
    } catch (error) {
      logger.error('Error getting collections', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to get collections',
      });
    }
  });

  // POST /collections — create a new collection
  router.post('/collections', async (req: Request, res: Response) => {
    try {
      const { name, description } = req.body;
      if (!name || typeof name !== 'string') {
        return res
          .status(400)
          .json({ success: false, error: 'Name is required' });
      }
      const collection = await savedCollectionService.createCollection(
        name,
        description
      );
      res.json({ success: true, data: collection });
    } catch (error) {
      logger.error('Error creating collection', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to create collection',
      });
    }
  });

  // GET /collections/:id — get a single collection
  router.get('/collections/:id', async (req: Request, res: Response) => {
    try {
      const collection = await savedCollectionService.getCollection(
        req.params.id
      );
      if (!collection) {
        return res
          .status(404)
          .json({ success: false, error: 'Collection not found' });
      }
      res.json({ success: true, data: collection });
    } catch (error) {
      logger.error('Error getting collection', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to get collection',
      });
    }
  });

  // PUT /collections/:id — update collection metadata
  router.put('/collections/:id', async (req: Request, res: Response) => {
    try {
      const { name, description } = req.body;
      const updated = await savedCollectionService.updateCollection(
        req.params.id,
        name,
        description
      );
      if (!updated) {
        return res
          .status(404)
          .json({ success: false, error: 'Collection not found' });
      }
      res.json({ success: true, data: updated });
    } catch (error) {
      logger.error('Error updating collection', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to update collection',
      });
    }
  });

  // DELETE /collections/:id — delete a collection
  router.delete('/collections/:id', async (req: Request, res: Response) => {
    try {
      const deleted = await savedCollectionService.deleteCollection(
        req.params.id
      );
      if (!deleted) {
        return res
          .status(404)
          .json({ success: false, error: 'Collection not found' });
      }
      res.json({ success: true, data: { message: 'Collection deleted' } });
    } catch (error) {
      logger.error('Error deleting collection', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to delete collection',
      });
    }
  });

  // POST /collections/:id/import — import CSV into a collection
  router.post(
    '/collections/:id/import',
    async (req: Request, res: Response) => {
      try {
        const { csvContent } = req.body;
        if (!csvContent || typeof csvContent !== 'string') {
          return res
            .status(400)
            .json({ success: false, error: 'csvContent is required' });
        }
        const result = await savedCollectionService.importCsv(
          req.params.id,
          csvContent,
          historyStorage
        );
        res.json({ success: true, data: result });
      } catch (error) {
        logger.error('Error importing CSV', error);
        res.status(500).json({
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to import CSV',
        });
      }
    }
  );

  // POST /collections/:id/tracks — add a track to a collection
  router.post(
    '/collections/:id/tracks',
    async (req: Request, res: Response) => {
      try {
        const { artist, track, album, duration, lastfmMatch } = req.body;
        if (!artist || !track) {
          return res.status(400).json({
            success: false,
            error: 'Artist and track are required',
          });
        }
        const newTrack = await savedCollectionService.addTrack(req.params.id, {
          artist,
          track,
          album,
          duration,
          lastfmMatch,
        });
        if (!newTrack) {
          return res
            .status(404)
            .json({ success: false, error: 'Collection not found' });
        }
        res.json({ success: true, data: newTrack });
      } catch (error) {
        logger.error('Error adding track', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to add track',
        });
      }
    }
  );

  // PUT /collections/:id/tracks/:position — replace a track at position (for remapping)
  router.put(
    '/collections/:id/tracks/:position',
    async (req: Request, res: Response) => {
      try {
        const position = parseInt(req.params.position);
        if (isNaN(position)) {
          return res
            .status(400)
            .json({ success: false, error: 'Invalid position' });
        }
        const { artist, track, album, duration, lastfmMatch } = req.body;
        if (!artist || !track) {
          return res.status(400).json({
            success: false,
            error: 'Artist and track are required',
          });
        }
        const updated = await savedCollectionService.replaceTrack(
          req.params.id,
          position,
          { artist, track, album, duration, lastfmMatch }
        );
        if (!updated) {
          return res.status(404).json({
            success: false,
            error: 'Collection or track not found',
          });
        }
        res.json({ success: true, data: updated });
      } catch (error) {
        logger.error('Error replacing track', error);
        res.status(500).json({
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to replace track',
        });
      }
    }
  );

  // DELETE /collections/:id/tracks/:position — remove a track by position
  router.delete(
    '/collections/:id/tracks/:position',
    async (req: Request, res: Response) => {
      try {
        const position = parseInt(req.params.position);
        if (isNaN(position)) {
          return res
            .status(400)
            .json({ success: false, error: 'Invalid position' });
        }
        const removed = await savedCollectionService.removeTrack(
          req.params.id,
          position
        );
        if (!removed) {
          return res.status(404).json({
            success: false,
            error: 'Collection or track not found',
          });
        }
        res.json({ success: true, data: { message: 'Track removed' } });
      } catch (error) {
        logger.error('Error removing track', error);
        res.status(500).json({
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to remove track',
        });
      }
    }
  );

  // GET /search?q=...&limit=20 — unified typeahead search
  router.get('/search', async (req: Request, res: Response) => {
    try {
      const q = (req.query.q as string) || '';
      const limit = parseInt((req.query.limit as string) || '20');

      if (!q.trim()) {
        return res.json({ success: true, data: [] });
      }

      const seen = new Map<string, TrackSearchResult>();

      // Search history
      const historyLimit = Math.ceil(limit / 2);
      const historyResults = await historyStorage.getTracksPaginated(
        1,
        historyLimit,
        'playCount',
        'desc',
        q
      );

      for (const item of historyResults.items) {
        const key = `${item.artist.toLowerCase()}|${item.track.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.set(key, {
            artist: item.artist,
            track: item.track,
            album: item.album,
            source: 'history',
            playCount: item.playCount,
          });
        }
      }

      // Search saved collections
      const collections = await savedCollectionService.getCollections();
      const lowerQ = q.toLowerCase();

      for (const collection of collections) {
        for (const track of collection.tracks) {
          const matchesArtist = track.artist.toLowerCase().includes(lowerQ);
          const matchesTrack = track.track.toLowerCase().includes(lowerQ);
          const matchesAlbum = track.album
            ? track.album.toLowerCase().includes(lowerQ)
            : false;

          if (matchesArtist || matchesTrack || matchesAlbum) {
            const key = `${track.artist.toLowerCase()}|${track.track.toLowerCase()}`;
            if (!seen.has(key)) {
              seen.set(key, {
                artist: track.artist,
                track: track.track,
                album: track.album,
                duration: track.duration || undefined,
                source: 'collection',
                sourceCollectionId: collection.id,
                sourceCollectionName: collection.name,
              });
            }
          }
        }
      }

      const results = Array.from(seen.values()).slice(0, limit);
      res.json({ success: true, data: results });
    } catch (error) {
      logger.error('Error in search', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Search failed',
      });
    }
  });

  // GET /duration?artist=...&track=...&album=... — look up track duration
  router.get('/duration', async (req: Request, res: Response) => {
    try {
      const artist = req.query.artist as string;
      const track = req.query.track as string;
      const album = req.query.album as string | undefined;

      if (!artist || !track) {
        return res.status(400).json({
          success: false,
          error: 'Artist and track are required',
        });
      }

      const result = await durationLookupService.lookupDuration(
        artist,
        track,
        album
      );
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Error looking up duration', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : 'Duration lookup failed',
      });
    }
  });

  // POST /prepare — prepare tracks for scrobble with timestamps
  router.post('/prepare', async (req: Request, res: Response) => {
    try {
      const { sessionStart, sessionEnd, tracks } = req.body;

      if (!sessionStart || !Array.isArray(tracks) || tracks.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'sessionStart and a non-empty tracks array are required',
        });
      }

      // Use Unix seconds — match existing scrobble route pattern
      const startSeconds =
        sessionStart > 9999999999
          ? Math.floor(sessionStart / 1000)
          : sessionStart;
      const endSeconds = sessionEnd
        ? sessionEnd > 9999999999
          ? Math.floor(sessionEnd / 1000)
          : sessionEnd
        : undefined;

      let currentTime = startSeconds;
      const scrobbleTracks: ScrobbleTrack[] = [];

      for (const t of tracks) {
        let duration = t.duration;

        // Look up missing durations
        if (!duration || duration <= 0) {
          try {
            const lookup = await durationLookupService.lookupDuration(
              t.artist,
              t.track,
              t.album
            );
            duration = lookup.duration ?? 180; // fallback 3 minutes
          } catch {
            duration = 180;
          }
        }

        // Apply artist mapping
        const mappedArtist = artistMappingService.getLastfmName(t.artist);

        scrobbleTracks.push({
          artist: mappedArtist,
          track: t.track,
          album: t.album,
          timestamp: currentTime,
          duration,
        });

        currentTime += duration + 1; // 1s gap between tracks
      }

      const overflows = endSeconds ? currentTime > endSeconds : false;

      res.json({
        success: true,
        data: {
          tracks: scrobbleTracks,
          overflows,
        },
      });
    } catch (error) {
      logger.error('Error preparing tracks', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to prepare tracks',
      });
    }
  });

  return router;
}
