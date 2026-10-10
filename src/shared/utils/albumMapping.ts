import { AlbumMapping } from '../types';

export interface AlbumName {
  artist: string;
  album: string;
}

/**
 * Whether an album mapping is linked to a collection item (records ownership).
 * Unlinked mappings (collectionId 0) only merge one history album name into
 * another.
 */
export function isCollectionLinked(
  mapping: Pick<AlbumMapping, 'collectionId'>
): boolean {
  return mapping.collectionId > 0;
}

/** Case/whitespace-insensitive artist|album key (matches MappingService keys). */
export function albumNameKey(artist: string, album: string): string {
  return `${artist.toLowerCase().trim()}|${album.toLowerCase().trim()}`;
}

/**
 * Build a resolver from a scrobble history album to the album it is merged
 * into. Mappings are one hop deep, so the mapping target is the canonical
 * album; unmapped albums resolve to themselves. `key` identifies the merged
 * album, so history albums with the same key are versions of one album.
 */
export function createAlbumCanonicalizer(
  mappings: AlbumMapping[] | null | undefined
): (
  artist: string,
  album: string
) => AlbumName & { key: string; mapping?: AlbumMapping } {
  const byHistoryKey = new Map<string, AlbumMapping>();
  for (const mapping of mappings ?? []) {
    byHistoryKey.set(
      albumNameKey(mapping.historyArtist, mapping.historyAlbum),
      mapping
    );
  }

  return (artist, album) => {
    const mapping = byHistoryKey.get(albumNameKey(artist, album));
    if (!mapping) {
      return { artist, album, key: albumNameKey(artist, album) };
    }
    return {
      artist: mapping.collectionArtist,
      album: mapping.collectionAlbum,
      key: albumNameKey(mapping.collectionArtist, mapping.collectionAlbum),
      mapping,
    };
  };
}

/**
 * Build a resolver from a collection item's artist/title to every name its
 * plays may be recorded under: the collection's own name first, then each
 * history album linked to it by an album mapping.
 */
export function createCollectionNameResolver(
  mappings: AlbumMapping[] | null | undefined
): (collectionArtist: string, collectionAlbum: string) => AlbumName[] {
  const linkedByCollectionKey = new Map<string, AlbumName[]>();
  for (const mapping of mappings ?? []) {
    if (!isCollectionLinked(mapping)) continue;
    const key = albumNameKey(mapping.collectionArtist, mapping.collectionAlbum);
    const names = linkedByCollectionKey.get(key) ?? [];
    names.push({ artist: mapping.historyArtist, album: mapping.historyAlbum });
    linkedByCollectionKey.set(key, names);
  }

  return (collectionArtist, collectionAlbum) => {
    const ownKey = albumNameKey(collectionArtist, collectionAlbum);
    const names: AlbumName[] = [
      { artist: collectionArtist, album: collectionAlbum },
    ];
    const seen = new Set([ownKey]);
    for (const name of linkedByCollectionKey.get(ownKey) ?? []) {
      const key = albumNameKey(name.artist, name.album);
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
    return names;
  };
}
