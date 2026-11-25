import { AlbumIdentifier, AlbumPlayCountResult } from '../../shared/types';

import type { PlayIdentityService } from './playIdentity/service';

/**
 * Play counts for albums named as Discogs names them (wishlist, collection,
 * seller matches), by play identity: the merged album, then a
 * spelling-tolerant match, under the credited artist and its Last.fm name.
 * See ListeningReadModel.discogsAlbumPlays.
 */
export async function getAlbumPlayCounts(
  albums: AlbumIdentifier[],
  deps: { playIdentity: Pick<PlayIdentityService, 'readModel'> }
): Promise<AlbumPlayCountResult[]> {
  const model = await deps.playIdentity.readModel();
  return albums.map(album => ({
    artist: album.artist,
    title: album.title,
    ...model.discogsAlbumPlays(album.artist, album.title),
  }));
}
