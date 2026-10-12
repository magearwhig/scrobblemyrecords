import express, { Request, Response } from 'express';

import { ScrobbleHistoryStorage } from '../services/scrobbleHistoryStorage';
import {
  OwnedReleaseTracks,
  UnresolvedHistoryService,
  UnresolvedSort,
} from '../services/unresolvedHistoryService';
import { createLogger } from '../utils/logger';

/** Stats refresh hooks; resolving plays changes album stats */
export interface UnresolvedHistoryStatsHooks {
  invalidateStatsCache(): Promise<void>;
  warmCache(): Promise<void>;
  clearForgottenFavoritesCache?(): void;
}

const SORTS: UnresolvedSort[] = ['plays', 'artist', 'recent'];

/**
 * Master or release id from a Discogs link: discogs.com/master/123-Slug,
 * discogs.com/release/456, discogs.com/<lang>/release/456 (or "m123" /
 * "r456" as shorthand).
 */
export function parseDiscogsAlbumUrl(
  input: string
): { kind: 'master' | 'release'; id: number } | null {
  const text = input.trim();
  const toResult = (kind: string, digits: string) => {
    const id = Number(digits);
    return Number.isSafeInteger(id) && id > 0
      ? { kind: kind.toLowerCase() as 'master' | 'release', id }
      : null;
  };

  const short = /^([mr])(\d+)$/i.exec(text);
  if (short)
    return toResult(
      short[1] === 'm' || short[1] === 'M' ? 'master' : 'release',
      short[2]
    );

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host !== 'discogs.com' && !host.endsWith('.discogs.com')) return null;
  // /master/123-Slug, /release/456, /fr/release/456-Slug
  const match =
    /^\/(?:[a-z]{2}\/)?(master|release)\/(\d+)(?:-[^/]*)?\/?$/i.exec(
      url.pathname
    );
  return match ? toResult(match[1], match[2]) : null;
}

/**
 * Routes for Unresolved Listening History (scrobbles without album info),
 * mounted at /api/v1/stats/unresolved-history.
 */
export default function createUnresolvedHistoryRouter(
  service: UnresolvedHistoryService,
  historyStorage: ScrobbleHistoryStorage,
  stats: UnresolvedHistoryStatsHooks,
  getDisplayName: () => ((artist: string) => string) | undefined,
  extras: {
    /** Whether two index artist keys are the same artist (aliases) */
    getSameArtist?: () => ((a: string, b: string) => boolean) | undefined;
    /** Owned releases (title + tracklist) by an artist, for album matching */
    ownedReleases?: (
      isArtist: (name: string) => boolean
    ) => Promise<OwnedReleaseTracks[]>;
    /** Fetch a Discogs master or release (title, artist, tracklist) */
    fetchDiscogsAlbum?: (
      kind: 'master' | 'release',
      id: number
    ) => Promise<{
      title: string;
      artist: string;
      tracks: Array<{ position?: string; title: string }>;
      imageUrl?: string;
      url?: string;
    } | null>;
  } = {}
) {
  const router = express.Router();
  const logger = createLogger('UnresolvedHistoryRoutes');

  /** Rules or hidden keys changed: rebuild the derived index and stats */
  const refreshAfterChange = (): void => {
    historyStorage.invalidateCache();
    stats.clearForgottenFavoritesCache?.();
    void (async () => {
      try {
        await stats.invalidateStatsCache();
        await stats.warmCache();
      } catch (error) {
        logger.error('Failed to refresh stats after resolution change', error);
      }
    })();
  };

  const fail = (res: Response, error: unknown, message: string) => {
    logger.error(message, error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  };

  const isNonEmptyString = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0;

  /**
   * GET /
   * Unresolved plays grouped by artist. Query: search, sort
   * (plays|artist|recent), page, limit, includeHidden.
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const sort = req.query.sort as UnresolvedSort | undefined;
      if (sort !== undefined && !SORTS.includes(sort)) {
        return res.status(400).json({
          success: false,
          error: `sort must be one of ${SORTS.join(', ')}`,
        });
      }
      const page = await service.listGroups(await historyStorage.getIndex(), {
        search: typeof req.query.search === 'string' ? req.query.search : '',
        sort,
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 50,
        includeHidden: req.query.includeHidden === 'true',
        displayName: getDisplayName(),
      });
      res.json({ success: true, data: page });
    } catch (error) {
      fail(res, error, 'Error listing unresolved history');
    }
  });

  /** GET /summary — counts for the banner, including the Last.fm gap */
  router.get('/summary', async (_req: Request, res: Response) => {
    try {
      const summary = await service.getSummary(
        await historyStorage.getRawIndex(),
        await historyStorage.getExclusionView(),
        await historyStorage.getIndex()
      );
      res.json({ success: true, data: summary });
    } catch (error) {
      fail(res, error, 'Error getting unresolved history summary');
    }
  });

  /** POST /lookup { artist, track } — album suggestion from Last.fm */
  router.post('/lookup', async (req: Request, res: Response) => {
    try {
      const { artist, track } = req.body ?? {};
      if (!isNonEmptyString(artist) || !isNonEmptyString(track)) {
        return res.status(400).json({
          success: false,
          error: 'artist and track are required',
        });
      }
      // { album, verification }: the album and whether the song is on its
      // Last.fm tracklist
      const lookup = await service.lookupAlbum(artist, track);
      res.json({ success: true, data: lookup });
    } catch (error) {
      fail(res, error, 'Error looking up album');
    }
  });

  /**
   * GET /album-suggestions?artist=&includeHidden=
   * For each of an artist's unresolved tracks, the album it was played on
   * most in your history (or an owned release with that song).
   */
  router.get('/album-suggestions', async (req: Request, res: Response) => {
    try {
      const artist = req.query.artist;
      if (!isNonEmptyString(artist)) {
        return res.status(400).json({
          success: false,
          error: 'artist is required',
        });
      }
      const artistKey = artist.toLowerCase().trim();
      const sameArtist = extras.getSameArtist?.();
      const isArtist = (name: string) => {
        const key = name.toLowerCase().trim();
        return key === artistKey || Boolean(sameArtist?.(key, artistKey));
      };
      const suggestions = await service.suggestAlbums(
        await historyStorage.getIndex(),
        artistKey,
        {
          includeHidden: req.query.includeHidden === 'true',
          displayName: getDisplayName(),
          isSameArtist: sameArtist
            ? other => sameArtist(other, artistKey)
            : undefined,
          ownedReleases: extras.ownedReleases
            ? () => extras.ownedReleases!(isArtist)
            : undefined,
        }
      );
      res.json({ success: true, data: suggestions });
    } catch (error) {
      fail(res, error, 'Error suggesting albums');
    }
  });

  /**
   * POST /discogs-album-match { artist, url, includeHidden? }
   * Match an artist's unresolved tracks against a Discogs master or release
   * the user points at (e.g. a live album not in history or Last.fm).
   */
  router.post('/discogs-album-match', async (req: Request, res: Response) => {
    try {
      const { artist, url, includeHidden } = req.body ?? {};
      if (!isNonEmptyString(artist) || !isNonEmptyString(url)) {
        return res.status(400).json({
          success: false,
          error: 'artist and url are required',
        });
      }
      const parsed = parseDiscogsAlbumUrl(url);
      if (!parsed) {
        return res.status(400).json({
          success: false,
          error:
            'Paste a Discogs master or release link, e.g. https://www.discogs.com/master/123',
        });
      }
      if (!extras.fetchDiscogsAlbum) {
        return res.status(503).json({
          success: false,
          error: 'Discogs lookups are not available',
        });
      }
      let album;
      try {
        album = await extras.fetchDiscogsAlbum(parsed.kind, parsed.id);
      } catch (error) {
        const status = (error as { response?: { status?: number } })?.response
          ?.status;
        logger.warn('Discogs album lookup failed', error);
        return res.status(502).json({
          success: false,
          error:
            status === 401 || status === 403
              ? 'Discogs rejected the request; check your Discogs connection in Settings'
              : status === 429
                ? 'Discogs is rate limiting requests; try again in a minute'
                : 'Could not reach Discogs; try again',
        });
      }
      if (!album) {
        return res.status(404).json({
          success: false,
          error: 'Could not load that album from Discogs',
        });
      }
      const match = await service.matchAlbumTracklist(
        await historyStorage.getIndex(),
        artist,
        album,
        { includeHidden: includeHidden === true }
      );
      res.json({ success: true, data: match });
    } catch (error) {
      fail(res, error, 'Error matching a Discogs album');
    }
  });

  /** GET /resolutions — saved rules */
  router.get('/resolutions', async (_req: Request, res: Response) => {
    try {
      res.json({ success: true, data: (await service.getStore()).resolutions });
    } catch (error) {
      fail(res, error, 'Error listing resolutions');
    }
  });

  /**
   * POST /resolutions { resolutions: [{ artist, track, album, source? }] }
   * Attribute unresolved tracks to albums (one rule per artist + track).
   */
  router.post('/resolutions', async (req: Request, res: Response) => {
    try {
      const { resolutions } = req.body ?? {};
      const valid =
        Array.isArray(resolutions) &&
        resolutions.length > 0 &&
        resolutions.length <= 500 &&
        resolutions.every(
          (r: Record<string, unknown>) =>
            r !== null &&
            typeof r === 'object' &&
            isNonEmptyString(r.artist) &&
            isNonEmptyString(r.track) &&
            isNonEmptyString(r.album) &&
            (r.source === undefined ||
              r.source === 'user' ||
              r.source === 'lastfm-track-info')
        );
      if (!valid) {
        return res.status(400).json({
          success: false,
          error:
            'resolutions must be 1-500 items of { artist, track, album, source? }',
        });
      }
      const saved = await service.addResolutions(resolutions);
      refreshAfterChange();
      res.json({ success: true, data: { saved } });
    } catch (error) {
      fail(res, error, 'Error saving resolutions');
    }
  });

  /** DELETE /resolutions/:id — undo a rule */
  router.delete('/resolutions/:id', async (req: Request, res: Response) => {
    try {
      const removed = await service.removeResolution(req.params.id);
      if (removed) refreshAfterChange();
      res.json({ success: true, data: { removed } });
    } catch (error) {
      fail(res, error, 'Error removing resolution');
    }
  });

  const setHidden =
    (hidden: boolean) => async (req: Request, res: Response) => {
      try {
        const { keys } = req.body ?? {};
        if (
          !Array.isArray(keys) ||
          keys.length === 0 ||
          keys.length > 1000 ||
          !keys.every(isNonEmptyString)
        ) {
          return res.status(400).json({
            success: false,
            error: 'keys must be 1-1000 "artist|track" strings',
          });
        }
        const changed = await service.setHidden(keys, hidden);
        res.json({ success: true, data: { changed } });
      } catch (error) {
        fail(res, error, 'Error updating hidden tracks');
      }
    };

  /** POST /hide and /unhide { keys } — list visibility only; stats unchanged */
  router.post('/hide', setHidden(true));
  router.post('/unhide', setHidden(false));

  /** GET /excluded-artists — artists left out of listening stats */
  router.get('/excluded-artists', async (_req: Request, res: Response) => {
    try {
      const matcher = await historyStorage.getExclusionMatcher();
      const artists = await service.listExcluded(
        await historyStorage.getRawIndex(),
        getDisplayName(),
        matcher ?? undefined
      );
      res.json({ success: true, data: artists });
    } catch (error) {
      fail(res, error, 'Error listing excluded artists');
    }
  });

  const setExcluded =
    (excluded: boolean) => async (req: Request, res: Response) => {
      try {
        const { artists } = req.body ?? {};
        if (
          !Array.isArray(artists) ||
          artists.length === 0 ||
          artists.length > 500 ||
          !artists.every(isNonEmptyString)
        ) {
          return res.status(400).json({
            success: false,
            error: 'artists must be 1-500 artist names',
          });
        }
        const changed = await service.setExcluded(artists, excluded);
        if (changed > 0) refreshAfterChange();
        res.json({ success: true, data: { changed } });
      } catch (error) {
        fail(res, error, 'Error updating excluded artists');
      }
    };

  /**
   * POST /excluded-artists { artists } — stop counting these artists (e.g.
   * podcasts). Plays stay stored; POST /excluded-artists/remove undoes it.
   */
  router.post('/excluded-artists', setExcluded(true));
  router.post('/excluded-artists/remove', setExcluded(false));

  /** GET /exclusion-suggestions — artists whose plays look like podcasts */
  router.get('/exclusion-suggestions', async (_req: Request, res: Response) => {
    try {
      const suggestions = await service.suggestExclusions(
        await historyStorage.getIndex(),
        getDisplayName()
      );
      res.json({ success: true, data: suggestions });
    } catch (error) {
      fail(res, error, 'Error suggesting exclusions');
    }
  });

  return router;
}
