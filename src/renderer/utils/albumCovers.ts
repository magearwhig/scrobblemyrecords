import { imagesApi } from '../services/statsApi';

import { createLogger } from './logger';

const logger = createLogger('albumCovers');

/** Key the batch image endpoint uses for an album */
const coverKey = (artist: string, album: string): string =>
  `${artist.toLowerCase().trim()}|${album.toLowerCase().trim()}`;

/**
 * Covers for albums that have none (ones not in the collection), looked up
 * through the batch image endpoint (Last.fm, cached on the server). Returns
 * the found URLs keyed by album title; albums that already have a cover are
 * not looked up. Resolves to an empty map on failure, so the page keeps its
 * placeholders.
 */
export async function lookUpMissingCovers(
  artist: string,
  albums: Array<{ album: string; coverUrl?: string | null }>
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const missing = albums.filter(a => !a.coverUrl).map(a => a.album);
  if (!artist || missing.length === 0) return found;
  try {
    const res = await imagesApi.batchGetAlbumCovers(
      missing.map(album => ({ artist, album }))
    );
    if (res.success && res.data) {
      for (const album of missing) {
        const url = res.data[coverKey(artist, album)];
        if (url) found.set(album, url);
      }
    }
  } catch (err) {
    logger.error('Failed to look up album covers', err);
  }
  return found;
}
