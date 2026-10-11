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

/** Remove a Discogs artist disambiguation suffix, e.g. "Girls (5)" -> "Girls". */
export function stripDiscogsSuffix(artist: string): string {
  return artist.replace(/\s*\(\d+\)\s*$/, '');
}

/**
 * Key for grouping album names that differ only in spelling. Ignores case,
 * accents, punctuation, spacing and Discogs artist disambiguation suffixes
 * like "(2)", so "The Format (2)|Dog Problems" groups with
 * "the format|dog problems". Edition words (Deluxe, Remastered) still count:
 * those versions are merged only by album mappings.
 */
export function albumGroupKey(artist: string, album: string): string {
  const simplify = (s: string) => {
    const lower = s.toLowerCase().trim();
    const simplified = lower
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}]/gu, '');
    // Names made only of punctuation keep their own spelling rather than
    // all simplifying to ""
    return simplified || lower;
  };
  return `${simplify(stripDiscogsSuffix(artist))}|${simplify(album)}`;
}

/**
 * Build a resolver from a scrobble history album to the album it is merged
 * into. Mappings are one hop deep, so the mapping target is the canonical
 * album; unmapped albums resolve to themselves. `key` identifies the merged
 * album (see albumGroupKey), so history albums with the same key are versions
 * of one album. Pass `resolveArtist` (the artist alias resolver) so spellings
 * the app already treats as one artist, e.g. "afghan whigs" and "The Afghan
 * Whigs", group together the way the artist page does.
 */
export function createAlbumCanonicalizer(
  mappings: AlbumMapping[] | null | undefined,
  resolveArtist: (artist: string) => string = artist => artist
): (
  artist: string,
  album: string
) => AlbumName & { key: string; mapping?: AlbumMapping } {
  // Discogs-numbered names ("Afghan Whigs (2)") the resolver doesn't know
  // fall back to the plain name, so they group with its aliases
  const groupArtist = (artist: string) => {
    const resolved = resolveArtist(artist);
    const plain = stripDiscogsSuffix(artist);
    return plain !== artist && resolved.toLowerCase() === artist.toLowerCase()
      ? resolveArtist(plain)
      : resolved;
  };

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
      return { artist, album, key: albumGroupKey(groupArtist(artist), album) };
    }
    return {
      artist: mapping.collectionArtist,
      album: mapping.collectionAlbum,
      key: albumGroupKey(
        groupArtist(mapping.collectionArtist),
        mapping.collectionAlbum
      ),
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
