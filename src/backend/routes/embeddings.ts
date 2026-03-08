/**
 * Express routes for managing record embeddings.
 *
 * Handles:
 *   - Triggering a full collection rebuild
 *   - Refreshing a single record's embedding
 *   - Querying embedding index status
 *
 * Long-running rebuilds are started in the background. Status is queryable
 * via GET /status which reports rebuild progress.
 */

import express, { Request, Response } from 'express';

import { CollectionItem } from '../../shared/types';
import { AuthService } from '../services/authService';
import {
  CollectionIndexerService,
  IndexProgress,
} from '../services/collectionIndexerService';
import { DiscogsGenreEnricherService } from '../services/discogsGenreEnricherService';
import { DiscogsService } from '../services/discogsService';
import { EmbeddingStorageService } from '../services/embeddingStorageService';
import { MusicBrainzGenreEnricherService } from '../services/musicbrainzGenreEnricherService';
import { ProfileBuilderService } from '../services/profileBuilderService';
import { sendError, sendSuccess } from '../utils/apiResponse';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

const log = createLogger('EmbeddingsRoute');

/**
 * In-memory rebuild progress state.
 * Exposed to /status so the frontend can poll progress.
 */
let currentRebuildProgress: IndexProgress | null = null;

/**
 * Create the embeddings router with injected dependencies.
 */
export function createEmbeddingsRouter(
  collectionIndexerService: CollectionIndexerService,
  embeddingStorageService: EmbeddingStorageService,
  profileBuilderService: ProfileBuilderService,
  discogsService: DiscogsService,
  authService: AuthService,
  fileStorage: FileStorage,
  discogsGenreEnricherService?: DiscogsGenreEnricherService,
  musicBrainzGenreEnricherService?: MusicBrainzGenreEnricherService
): express.Router {
  const router = express.Router();

  /**
   * POST /api/v1/embeddings/rebuild
   * Start a full collection embedding rebuild in the background.
   *
   * If a rebuild is already running, returns 'already_running'.
   * The rebuild fetches the collection from the local cache, builds text profiles
   * for each record, and stores the resulting embeddings.
   */
  router.post('/rebuild', async (req: Request, res: Response) => {
    try {
      if (collectionIndexerService.isRebuilding()) {
        return sendSuccess(res, { status: 'already_running' });
      }

      const settings = await authService.getUserSettings();
      const username = settings.discogs.username;
      if (!username) {
        return sendError(res, 401, 'Discogs authentication required');
      }

      // Load collection from local cache
      const allItems = await loadCollectionFromCache(username, fileStorage);
      if (allItems.length === 0) {
        return sendError(
          res,
          400,
          'No collection found. Please load your Discogs collection first.'
        );
      }

      const collectionArtists = [
        ...new Set(allItems.map(item => item.release.artist)),
      ];

      log.info(
        `Starting background rebuild for ${allItems.length} records (${collectionArtists.length} artists)`
      );

      // Respond immediately — rebuild runs in background
      sendSuccess(res, { status: 'started' });

      // Background rebuild
      (async () => {
        try {
          // Phase 1: Enrich releases with Discogs genres/styles
          if (discogsGenreEnricherService) {
            currentRebuildProgress = {
              current: 0,
              total: allItems.length,
              phase: 'Enriching Discogs genres',
            };
            const releases = allItems.map(item => item.release);
            await discogsGenreEnricherService.enrichBatch(
              releases,
              (current, total) => {
                currentRebuildProgress = {
                  current,
                  total,
                  phase: `Enriching Discogs genres ${current}/${total}`,
                };
              }
            );
          }

          // Phase 2: Pre-warm MusicBrainz genre cache for all artists
          if (musicBrainzGenreEnricherService) {
            currentRebuildProgress = {
              current: 0,
              total: collectionArtists.length,
              phase: 'Fetching MusicBrainz genres',
            };
            await musicBrainzGenreEnricherService.enrichBatch(
              collectionArtists,
              (current, total) => {
                currentRebuildProgress = {
                  current,
                  total,
                  phase: `Fetching MusicBrainz genres ${current}/${total}`,
                };
              }
            );
          }

          currentRebuildProgress = {
            current: 0,
            total: allItems.length,
            phase: 'Building profiles',
          };

          // Build text profiles for all records
          const records: Array<{
            release: (typeof allItems)[0]['release'];
            textProfile: string;
          }> = [];
          for (let i = 0; i < allItems.length; i++) {
            const item = allItems[i];
            currentRebuildProgress = {
              current: i,
              total: allItems.length,
              phase: `Building profile ${i + 1}/${allItems.length}: ${item.release.artist} - ${item.release.title}`,
            };
            try {
              const textProfile =
                await profileBuilderService.buildRecordProfile(
                  item.release,
                  collectionArtists
                );
              records.push({ release: item.release, textProfile });
            } catch (err) {
              log.warn('Failed to build profile for record', {
                releaseId: item.release.id,
                err,
              });
            }
          }

          // Embed all records
          await collectionIndexerService.rebuildAll(records, progress => {
            currentRebuildProgress = progress;
          });

          log.info('Background rebuild complete');
          currentRebuildProgress = null;
        } catch (err) {
          log.error('Background rebuild failed', err);
          currentRebuildProgress = null;
        }
      })();
    } catch (err) {
      log.error('Error starting rebuild', err);
      sendError(
        res,
        500,
        err instanceof Error ? err.message : 'Failed to start rebuild'
      );
    }
  });

  /**
   * POST /api/v1/embeddings/refresh/:releaseId
   * Re-embed a single record. Fetches updated profile and stores new embedding.
   */
  router.post('/refresh/:releaseId', async (req: Request, res: Response) => {
    try {
      const releaseId = parseInt(req.params.releaseId, 10);
      if (isNaN(releaseId)) {
        return sendError(res, 400, 'Invalid releaseId');
      }

      const settings = await authService.getUserSettings();
      const username = settings.discogs.username;
      if (!username) {
        return sendError(res, 401, 'Discogs authentication required');
      }

      // Find the release in the collection cache
      const allItems = await loadCollectionFromCache(username, fileStorage);
      const item = allItems.find(i => i.release.id === releaseId);

      if (!item) {
        return sendError(
          res,
          404,
          `Release ${releaseId} not found in collection cache. Load your collection first.`
        );
      }

      const collectionArtists = [
        ...new Set(allItems.map(i => i.release.artist)),
      ];

      const textProfile = await profileBuilderService.buildRecordProfile(
        item.release,
        collectionArtists
      );

      await collectionIndexerService.indexSingle(releaseId, textProfile);

      log.info('Refreshed embedding for release', { releaseId });
      sendSuccess(res, { success: true });
    } catch (err) {
      log.error('Error refreshing embedding', err);
      sendError(
        res,
        500,
        err instanceof Error ? err.message : 'Failed to refresh embedding'
      );
    }
  });

  /**
   * GET /api/v1/embeddings/status
   * Returns current embedding index stats plus rebuild progress if running.
   * totalRecords reflects the actual collection size (not just embedded count).
   */
  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const status = await embeddingStorageService.getStats();

      // Determine the real collection size so the UI can show how many
      // records exist vs how many are embedded.
      const settings = await authService.getUserSettings();
      const username = settings.discogs.username;
      if (username) {
        const collectionItems = await loadCollectionFromCache(
          username,
          fileStorage
        );
        status.totalRecords = collectionItems.length;
      }

      // Inject live rebuild progress if a rebuild is running
      const isRebuilding = collectionIndexerService.isRebuilding();
      status.isRebuilding = isRebuilding;
      if (isRebuilding && currentRebuildProgress) {
        status.rebuildProgress = currentRebuildProgress;
      }

      sendSuccess(res, status);
    } catch (err) {
      log.error('Error getting embedding status', err);
      sendError(
        res,
        500,
        err instanceof Error ? err.message : 'Failed to get embedding status'
      );
    }
  });

  /**
   * POST /api/v1/embeddings/cancel
   * Request cancellation of an in-progress rebuild.
   */
  router.post('/cancel', (_req: Request, res: Response) => {
    if (!collectionIndexerService.isRebuilding()) {
      return sendError(res, 400, 'No rebuild is currently running');
    }
    collectionIndexerService.cancelRebuild();
    sendSuccess(res, { status: 'cancellation_requested' });
  });

  return router;
}

/**
 * Load the full collection from the local file cache.
 * Reads paginated cache files produced by the collection sync.
 */
async function loadCollectionFromCache(
  username: string,
  fileStorage: FileStorage
): Promise<CollectionItem[]> {
  const allItems: CollectionItem[] = [];
  let pageNumber = 1;

  while (true) {
    const cacheKey = `collections/${username}-page-${pageNumber}.json`;
    const cached = await fileStorage.readJSON<{
      data: CollectionItem[];
      timestamp: number;
    }>(cacheKey);

    if (!cached || !cached.data || cached.data.length === 0) break;
    allItems.push(...cached.data);
    pageNumber++;
  }

  return allItems;
}
