import express, { Request, Response } from 'express';

import {
  AlbumLabelCandidate,
  AlbumLabelService,
} from '../services/albumLabelService';
import { createLogger } from '../utils/logger';

const logger = createLogger('AlbumLabelsRoutes');

const MAX_NAME_LENGTH = 500;
const MAX_LABEL_LENGTH = 200;
const MAX_LABELS = 10;

type Service = Pick<
  AlbumLabelService,
  'get' | 'getStatus' | 'setOverride' | 'clearOverride' | 'confirm' | 'reject'
>;

function albumFrom(
  source: Record<string, unknown>
): { artist: string; album: string } | null {
  const { artist, album } = source;
  if (
    typeof artist !== 'string' ||
    typeof album !== 'string' ||
    !artist.trim() ||
    !album.trim() ||
    artist.length > MAX_NAME_LENGTH ||
    album.length > MAX_NAME_LENGTH
  ) {
    return null;
  }
  return { artist, album };
}

function badRequest(res: Response, error: string) {
  return res.status(400).json({ success: false, error });
}

/**
 * Labels for albums you don't own: looked up in the background, and
 * corrected by you. Mounted at /api/v1/album-labels.
 */
export default function createAlbumLabelsRouter(
  service: Service,
  getCandidates: () => Promise<AlbumLabelCandidate[]>
) {
  const router = express.Router();

  const handle =
    (work: (req: Request, res: Response) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      try {
        await work(req, res);
      } catch (error) {
        logger.error('Album label request failed', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    };

  // Lookup progress over the albums due a label lookup
  router.get(
    '/status',
    handle(async (_req, res) => {
      const data = await service.getStatus(await getCandidates());
      res.json({ success: true, data });
    })
  );

  // One album's label (null when nothing is known yet)
  router.get(
    '/',
    handle(async (req, res) => {
      const album = albumFrom(req.query);
      if (!album) return badRequest(res, 'artist and album are required');
      const data = await service.get(album.artist, album.album);
      res.json({ success: true, data });
    })
  );

  // Set the labels yourself ([] = count it on no label)
  router.put(
    '/',
    handle(async (req, res) => {
      const album = albumFrom(req.body ?? {});
      if (!album) return badRequest(res, 'artist and album are required');
      const labels: unknown = req.body.labels;
      if (
        !Array.isArray(labels) ||
        labels.length > MAX_LABELS ||
        !labels.every(
          label => typeof label === 'string' && label.length <= MAX_LABEL_LENGTH
        )
      ) {
        return badRequest(res, 'labels must be a list of label names');
      }
      await service.setOverride(album.artist, album.album, labels);
      res.json({ success: true });
    })
  );

  // Go back to the looked-up label
  router.delete(
    '/',
    handle(async (req, res) => {
      const album = albumFrom(req.query);
      if (!album) return badRequest(res, 'artist and album are required');
      await service.clearOverride(album.artist, album.album);
      res.json({ success: true });
    })
  );

  for (const action of ['confirm', 'reject'] as const) {
    router.post(
      `/${action}`,
      handle(async (req, res) => {
        const album = albumFrom(req.body ?? {});
        if (!album) return badRequest(res, 'artist and album are required');
        await service[action](album.artist, album.album);
        res.json({ success: true });
      })
    );
  }

  return router;
}
