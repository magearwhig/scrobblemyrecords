import {
  AlbumMapping,
  CollectionItem,
  TrackMapping,
} from '../../../shared/types';
import {
  albumNameKey,
  createAlbumCanonicalizer,
  createCollectionNameResolver,
  isCollectionLinked,
  stripDiscogsSuffix,
} from '../../../shared/utils/albumMapping';
import { trackMatchKey } from '../../../shared/utils/trackNormalization';
import { loadAlbumMappings } from '../mergedAlbumHistory';
import type { ScrobbleHistoryStorage } from '../scrobbleHistoryStorage';
import {
  createTrackMapper,
  TrackMapper,
  TrackMappingService,
} from '../trackMappingService';

/**
 * What one scrobble counts as, everywhere in the app: which artist, album and
 * track it belongs to, and which record in the collection (if any) it is.
 *
 * Every list that groups plays (Top Tracks, Forgotten Favorites, the artist
 * and track pages, rankings, History) must group by these keys and take
 * ownership from here, so the same play never counts differently on two
 * pages. See .plan/play-identity-plan.md.
 */
export interface PlayIdentity {
  /** Artist to show: as scrobbled, or as a track mapping moved it */
  artist: string;
  /** Album to show; null for a play with no album (unresolved) */
  album: string | null;
  /** Track to show, after track mappings */
  track: string;
  /** Groups artist aliases ("The Afghan Whigs" = "Afghan Whigs") */
  artistKey: string;
  /** Groups album spellings and versions joined by album mappings; null when unresolved */
  albumKey: string | null;
  /** Groups spellings of one track on one album by one artist */
  trackKey: string;
  /** The owned record this play is, if any */
  collectionItem?: CollectionItem;
}

/** What an album (no track) counts as; see PlayIdentity */
export type AlbumIdentity = Pick<
  PlayIdentity,
  'artist' | 'artistKey' | 'collectionItem'
> & {
  album: string;
  albumKey: string;
};

export interface PlayIdentityInputs {
  albumMappings: AlbumMapping[];
  /** Track mappings (createTrackMapper) */
  mapTrack: TrackMapper;
  /** The track mappings themselves, for movesPlaysTo */
  trackMappings?: TrackMapping[];
  /** Artist alias key (ArtistNameResolver.resolveArtist) */
  resolveArtist: (artist: string) => string;
  collection: CollectionItem[];
  /** Spelling-tolerant artist|album key (ScrobbleHistoryStorage.fuzzyNormalizeKey) */
  fuzzyKey: (artist: string, album: string) => string;
}

export interface PlayIdentityResolver {
  /** What a scrobble counts as. Pass album null for a play with no album. */
  play(artist: string, album: string | null, track: string): PlayIdentity;
  /** What an album counts as, e.g. to find the plays of an album page */
  album(artist: string, album: string): AlbumIdentity;
  /**
   * For pages that skip other artists' albums: whether a track mapping could
   * move plays of this album to an artist `isTarget` accepts. Matches names
   * the way track mappings are looked up (createTrackMapper).
   */
  movesPlaysTo(
    isTarget: (artist: string) => boolean
  ): (artist: string, album: string | null) => boolean;
  /**
   * Records owned by an artist: credited to them (through aliases, ignoring
   * Discogs "(2)" suffixes), then ones an album mapping links to their plays
   * (e.g. "Aesop Rock, Blockhead" for Aesop Rock's Garbology)
   */
  ownedByArtist(artist: string): CollectionItem[];
}

/** Prefix for keys of unresolved plays, so none equals a real album's */
const UNRESOLVED_PREFIX = '\u0000unresolved|';

/**
 * Build the resolver for one request from the current mappings and
 * collection. Applies, in order: track mappings, album mappings (on the album
 * a track mapping moved the play to), artist aliases, then ownership.
 * Unresolved-play rules are already applied by the history index.
 *
 * Ownership: an album mapping linked to a collection item wins; otherwise the
 * scrobbled name, then the merged album's name, matched spelling-tolerantly
 * against each record's own name and every history name linked to it.
 * Results are memoised per distinct input, so a pass over all plays costs one
 * resolution per distinct (artist, album, track).
 */
export function createPlayIdentityResolver(
  inputs: PlayIdentityInputs
): PlayIdentityResolver {
  const { albumMappings, mapTrack, resolveArtist, fuzzyKey } = inputs;
  // Each record once: the cached collection can repeat items
  const seenIds = new Set<number>();
  const collection = inputs.collection.filter(item => {
    if (seenIds.has(item.id)) return false;
    seenIds.add(item.id);
    return true;
  });
  const canonicalize = createAlbumCanonicalizer(albumMappings, resolveArtist);

  const itemsById = new Map<number, CollectionItem>();
  for (const item of collection) itemsById.set(item.id, item);

  // Each record under its own name first, so a history name linked to one
  // record never displaces another record's own name. Exact names are
  // checked before spelling-tolerant ones, so "Dog Problems" finds the
  // standard edition even when the deluxe one simplifies to the same key.
  const byExactKey = new Map<string, CollectionItem>();
  const byFuzzyKey = new Map<string, CollectionItem>();
  const index = (artist: string, album: string, item: CollectionItem) => {
    const exact = albumNameKey(artist, album);
    if (!byExactKey.has(exact)) byExactKey.set(exact, item);
    const fuzzy = fuzzyKey(artist, album);
    if (!byFuzzyKey.has(fuzzy)) byFuzzyKey.set(fuzzy, item);
  };
  for (const item of collection) {
    index(item.release.artist, item.release.title, item);
  }
  const namesFor = createCollectionNameResolver(albumMappings);
  for (const item of collection) {
    const [, ...linked] = namesFor(item.release.artist, item.release.title);
    for (const name of linked) index(name.artist, name.album, item);
  }

  // History names linked to a record by an album mapping, and the merged
  // album each link belongs to: a link on any version of an album decides
  // its owner, ahead of any name match (two copies can share a title)
  const linkedBySource = new Map<string, CollectionItem>();
  const linkedByAlbumKey = new Map<string, CollectionItem>();
  for (const m of albumMappings) {
    const item = isCollectionLinked(m)
      ? itemsById.get(m.collectionId)
      : undefined;
    if (!item) continue;
    linkedBySource.set(albumNameKey(m.historyArtist, m.historyAlbum), item);
    const { key } = canonicalize(m.historyArtist, m.historyAlbum);
    if (!linkedByAlbumKey.has(key)) linkedByAlbumKey.set(key, item);
  }

  // Owned records by merged album, so every version of an album (and every
  // spelling, including Discogs "(2)" suffixes) shares one owner
  const byAlbumKey = new Map<string, CollectionItem>();
  for (const item of collection) {
    const { key } = canonicalize(item.release.artist, item.release.title);
    if (!byAlbumKey.has(key)) byAlbumKey.set(key, item);
  }

  const ownedRecord = (
    artist: string,
    album: string,
    mergedArtist: string,
    mergedAlbum: string,
    albumKey: string
  ): CollectionItem | undefined => {
    return (
      linkedBySource.get(albumNameKey(artist, album)) ??
      linkedByAlbumKey.get(albumKey) ??
      byExactKey.get(albumNameKey(artist, album)) ??
      byExactKey.get(albumNameKey(mergedArtist, mergedAlbum)) ??
      byAlbumKey.get(albumKey) ??
      byFuzzyKey.get(fuzzyKey(artist, album)) ??
      byFuzzyKey.get(fuzzyKey(mergedArtist, mergedAlbum))
    );
  };

  // A merged album is shown by the name its mappings point to, whichever
  // version a play was scrobbled on
  const nameByAlbumKey = new Map<string, string>();
  for (const m of albumMappings) {
    const { key } = canonicalize(m.historyArtist, m.historyAlbum);
    if (!nameByAlbumKey.has(key)) nameByAlbumKey.set(key, m.collectionAlbum);
  }

  const albumCache = new Map<string, AlbumIdentity>();
  const album = (artist: string, albumName: string): AlbumIdentity => {
    const cacheKey = `${artist}\u0000${albumName}`;
    const cached = albumCache.get(cacheKey);
    if (cached) return cached;
    const canonical = canonicalize(artist, albumName);
    const identity: AlbumIdentity = {
      artist,
      artistKey: resolveArtist(artist).toLowerCase(),
      album: nameByAlbumKey.get(canonical.key) ?? albumName,
      albumKey: canonical.key,
      collectionItem: ownedRecord(
        artist,
        albumName,
        canonical.artist,
        canonical.album,
        canonical.key
      ),
    };
    albumCache.set(cacheKey, identity);
    return identity;
  };

  const playCache = new Map<string, PlayIdentity>();
  const play = (
    artist: string,
    albumName: string | null,
    track: string
  ): PlayIdentity => {
    const cacheKey = `${artist}\u0000${albumName ?? '\u0000'}\u0000${track}`;
    const cached = playCache.get(cacheKey);
    if (cached) return cached;

    const target = mapTrack(artist, albumName, track);
    const artistKey = resolveArtist(target.artist).toLowerCase();
    let identity: PlayIdentity;
    if (target.album === null) {
      identity = {
        artist: target.artist,
        album: null,
        track: target.track,
        artistKey,
        albumKey: null,
        trackKey: `${UNRESOLVED_PREFIX}${artistKey}|${trackMatchKey(target.track)}`,
      };
    } else {
      const merged = album(target.artist, target.album);
      identity = {
        artist: target.artist,
        album: merged.album,
        track: target.track,
        artistKey,
        albumKey: merged.albumKey,
        trackKey: `${artistKey}|${merged.albumKey}|${trackMatchKey(target.track)}`,
        collectionItem: merged.collectionItem,
      };
    }
    playCache.set(cacheKey, identity);
    return identity;
  };

  // Records by artist key: credited first, then linked by a mapping
  const artistKeyOf = (artist: string) => {
    const resolved = resolveArtist(artist).toLowerCase();
    const plain = stripDiscogsSuffix(artist);
    return plain !== artist && resolved === artist.toLowerCase()
      ? resolveArtist(plain).toLowerCase()
      : resolved;
  };
  const ownedByKey = new Map<string, CollectionItem[]>();
  const addOwned = (artist: string, item: CollectionItem) => {
    const key = artistKeyOf(artist);
    const items = ownedByKey.get(key) ?? [];
    if (!items.includes(item)) items.push(item);
    ownedByKey.set(key, items);
  };
  for (const item of collection) addOwned(item.release.artist, item);
  for (const m of albumMappings) {
    const item = isCollectionLinked(m)
      ? itemsById.get(m.collectionId)
      : undefined;
    if (item) addOwned(m.historyArtist, item);
  }
  const ownedByArtist = (artist: string) =>
    ownedByKey.get(artistKeyOf(artist)) ?? [];

  // Track mappings are looked up by trackMatchKey'd names, under the
  // scrobbled album and then the album an album mapping merges it into
  const plainCanonicalize = createAlbumCanonicalizer(albumMappings);
  const movesPlaysTo = (isTarget: (artist: string) => boolean) => {
    const sources = new Set(
      (inputs.trackMappings ?? [])
        .filter(m => isTarget(m.cacheArtist) && !isTarget(m.historyArtist))
        .map(m => trackMatchKey(m.historyArtist))
    );
    return (artist: string, albumName: string | null) =>
      albumName !== null &&
      sources.size > 0 &&
      (sources.has(trackMatchKey(artist)) ||
        sources.has(
          trackMatchKey(plainCanonicalize(artist, albumName).artist)
        ));
  };

  return { play, album, movesPlaysTo, ownedByArtist };
}

/**
 * Build the resolver from the services that hold the rules. Missing services
 * (tests, early startup) mean no mappings of that kind; a missing collection
 * means nothing is owned.
 */
export async function buildPlayIdentityResolver(deps: {
  mappingService: { getAllAlbumMappings(): Promise<AlbumMapping[]> } | null;
  trackMappingService:
    | (Partial<Pick<TrackMappingService, 'getAllTrackMappings'>> &
        Pick<TrackMappingService, 'createLookup'>)
    | null;
  resolveArtist: (artist: string) => string;
  historyStorage: Pick<ScrobbleHistoryStorage, 'fuzzyNormalizeKey'>;
  collection?: CollectionItem[];
}): Promise<PlayIdentityResolver> {
  const albumMappings = await loadAlbumMappings(deps.mappingService);
  return createPlayIdentityResolver({
    albumMappings,
    mapTrack: await createTrackMapper(deps.trackMappingService, albumMappings),
    trackMappings:
      (await deps.trackMappingService?.getAllTrackMappings?.()) ?? [],
    resolveArtist: deps.resolveArtist,
    collection: deps.collection ?? [],
    fuzzyKey: (artist, album) => {
      const key = deps.historyStorage.fuzzyNormalizeKey?.(artist, album);
      return typeof key === 'string' ? key : albumNameKey(artist, album);
    },
  });
}
