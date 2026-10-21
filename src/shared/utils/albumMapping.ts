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
 * Remove the Discogs disambiguation suffix from every artist in a joined
 * artist string, e.g. "Turnstile (2), Someone (3)" -> "Turnstile, Someone".
 * Only "(N)" before a comma or at the end counts, so names with their own
 * parentheses ("Sunn O)))") are left alone. For display and sorting only:
 * suffixes tell apart different artists (see discogsArtistIdentityKey).
 */
export function stripDiscogsSuffixes(artist: string): string {
  return artist.replace(/\s*\(\d+\)(?=\s*(?:,|$))/g, '');
}

/**
 * Key for grouping album names that differ only in spelling. Ignores case,
 * accents, punctuation, spacing and Discogs artist disambiguation suffixes
 * like "(2)", so "The Format (2)|Dog Problems" groups with
 * "the format|dog problems". Edition words (Deluxe, Remastered) still count:
 * those versions are merged only by album mappings.
 */
export function albumGroupKey(artist: string, album: string): string {
  return `${simplifyName(stripDiscogsSuffix(artist))}|${simplifyName(album)}`;
}

/** Case, accent, punctuation and spacing-insensitive form of one name */
function simplifyName(s: string): string {
  const lower = s.toLowerCase().trim();
  const simplified = lower
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    // Variation selectors only pick a glyph style (e.g. emoji); left
    // behind without their base symbol, they would make "♥️" equal "☀️"
    .replace(/[\u{FE00}-\u{FE0F}\u{E0100}-\u{E01EF}]/gu, '')
    // Keep combining marks: Latin accents are already gone, and in other
    // scripts (e.g. Devanagari vowel signs) marks distinguish words
    .replace(/[^\p{L}\p{N}\p{M}]/gu, '');
  // Names made only of punctuation keep their own spelling rather than
  // all simplifying to ""
  return simplified || lower;
}

/**
 * Identity key for a joined Discogs artist string. Each artist is simplified
 * like albumGroupKey but keeps its "(N)" suffix, because Discogs uses the
 * suffix to tell apart different artists with the same name:
 * "Turnstile (2), Someone (3)" -> "turnstile#2,someone#3", and "Artist",
 * "Artist (2)" and "Artist (3)" are three identities.
 */
export function discogsArtistIdentityKey(artistRaw: string): string {
  return artistRaw
    .split(',')
    .map(part => {
      const match = part.match(/^(.*?)\s*\((\d+)\)\s*$/);
      return match
        ? `${simplifyName(match[1])}#${match[2]}`
        : simplifyName(part);
    })
    .join(',');
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

/**
 * Build a resolver from an album group (owned copies sharing one
 * createAlbumCanonicalizer key) to every name its plays may be recorded under:
 * each copy's names from createCollectionNameResolver, plus both names (source
 * and target) of every mapping, linked or not, that canonicalizes to the
 * group's key. The second part catches unlinked mappings into a collection
 * name, which the collection resolver alone misses, and plays recorded under a
 * mapping's target when only its source title is owned. Names are deduped case-insensitively.
 */
export function createAlbumGroupNameResolver(
  mappings: AlbumMapping[] | null | undefined,
  resolveArtist?: (artist: string) => string
): (
  copies: Array<{ artist: string; title: string }>,
  groupKey: string
) => AlbumName[] {
  const collectionNames = createCollectionNameResolver(mappings);
  const canonicalize = createAlbumCanonicalizer(mappings, resolveArtist);

  const mappedByGroupKey = new Map<string, AlbumName[]>();
  for (const mapping of mappings ?? []) {
    const { key } = canonicalize(mapping.historyArtist, mapping.historyAlbum);
    const names = mappedByGroupKey.get(key) ?? [];
    // Both ends: plays can be recorded under the mapping's source or target
    names.push(
      { artist: mapping.historyArtist, album: mapping.historyAlbum },
      { artist: mapping.collectionArtist, album: mapping.collectionAlbum }
    );
    mappedByGroupKey.set(key, names);
  }

  return (copies, groupKey) => {
    const names: AlbumName[] = [];
    const seen = new Set<string>();
    const add = (name: AlbumName) => {
      const key = albumNameKey(name.artist, name.album);
      if (seen.has(key)) return;
      seen.add(key);
      names.push(name);
    };
    for (const copy of copies) {
      collectionNames(copy.artist, copy.title).forEach(add);
    }
    (mappedByGroupKey.get(groupKey) ?? []).forEach(add);
    return names;
  };
}
