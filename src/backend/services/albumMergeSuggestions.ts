import {
  AlbumMapping,
  AlbumMergeMapping,
  AlbumMergeSuggestion,
  CollectionItem,
} from '../../shared/types';
import {
  albumGroupKey,
  albumNameKey,
  createAlbumCanonicalizer,
  isCollectionLinked,
} from '../../shared/utils/albumMapping';

/**
 * Words that mark an edition of an album rather than a different album. Tags
 * containing one, e.g. "(Deluxe Edition)" or "[+Digital Booklet]", are ignored
 * when looking for versions of the same album.
 */
const EDITION_WORDS =
  /(remaster|deluxe|edition|anniversary|expanded|version|bonus|reissue|explicit|clean|special|collector|legacy|vinyl|digital booklet|ltd\.?|limited|extended)/i;

/**
 * Words that mark a different recording, e.g. "(Live Version)" or "[Demos]".
 * Tags containing one are kept even if they also contain an edition word.
 */
const RECORDING_WORDS =
  /\b(live|demos?|acoustic|instrumentals?|remix(es)?|mixes|dub|karaoke|sessions?|unplugged|stripped|rarities)\b/i;

const isEditionTag = (tag: string) =>
  EDITION_WORDS.test(tag) && !RECORDING_WORDS.test(tag);

/** Album title with edition tags removed, simplified like albumGroupKey. */
export function editionlessAlbumKey(album: string): string {
  let title = album.toLowerCase();
  title = title.replace(/\s*\[([^\]]*)\]/g, (match, inner: string) =>
    isEditionTag(inner) ? '' : match
  );
  title = title.replace(/\s*\(([^)]*)\)/g, (match, inner: string) =>
    isEditionTag(inner) ? '' : match
  );
  title = title.replace(/\s+[-–:]\s+[^-–:]*$/, match =>
    isEditionTag(match) ? '' : match
  );
  return albumGroupKey('', title.trim()).slice(1);
}

/** Artist key that also ignores a leading "The" and "&" vs "and". */
function looseArtistKey(resolvedArtist: string): string {
  const name = resolvedArtist
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/&/g, 'and');
  return albumGroupKey(name, '').slice(0, -1);
}

interface Row {
  artist: string;
  album: string;
  playCount: number;
  historyNames: Array<{ artist: string; album: string; mapped: boolean }>;
  linkedMapping?: AlbumMapping;
}

/**
 * Find albums whose versions are still counted separately: history albums
 * that would show as separate Top Albums rows but differ only in edition tags
 * (Deluxe, Remastered, [Explicit]) or in how the artist name is written.
 *
 * Rows are grouped exactly like Top Albums (album mappings plus the artist
 * resolver), so anything already merged there is not suggested again.
 */
export function findAlbumMergeSuggestions(input: {
  /** History index albums keyed "artist|album" (lowercase) */
  albums: Record<string, { playCount: number }>;
  mappings: AlbumMapping[];
  resolveArtist?: (artist: string) => string;
  collection: CollectionItem[];
  dismissedIds?: Set<string>;
}): AlbumMergeSuggestion[] {
  const resolveArtist = input.resolveArtist ?? (artist => artist);
  const canonicalize = createAlbumCanonicalizer(input.mappings, resolveArtist);

  // Rows as Top Albums groups them
  const rows = new Map<string, Row>();
  for (const [key, entry] of Object.entries(input.albums)) {
    const separator = key.indexOf('|');
    const artist = key.slice(0, separator);
    const album = key.slice(separator + 1);
    const canonical = canonicalize(artist, album);
    const row = rows.get(canonical.key) ?? {
      artist: canonical.artist,
      album: canonical.album,
      playCount: 0,
      historyNames: [],
    };
    row.playCount += entry.playCount;
    row.historyNames.push({
      artist,
      album,
      mapped: Boolean(canonical.mapping),
    });
    if (canonical.mapping && isCollectionLinked(canonical.mapping)) {
      row.linkedMapping ??= canonical.mapping;
    }
    rows.set(canonical.key, row);
  }

  const looseKey = (artist: string, album: string) =>
    `${looseArtistKey(resolveArtist(artist))}|${editionlessAlbumKey(album)}`;

  // Earliest-added copy of each owned album
  const ownedByLooseKey = new Map<string, CollectionItem>();
  const byDateAdded = [...input.collection].sort((a, b) =>
    a.date_added.localeCompare(b.date_added)
  );
  for (const item of byDateAdded) {
    const key = looseKey(item.release.artist, item.release.title);
    if (!ownedByLooseKey.has(key)) ownedByLooseKey.set(key, item);
  }

  const groups = new Map<string, Row[]>();
  for (const row of rows.values()) {
    const key = looseKey(row.artist, row.album);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const suggestions: AlbumMergeSuggestion[] = [];
  for (const [looseGroupKey, group] of groups) {
    if (group.length < 2 || input.dismissedIds?.has(suggestionId(group))) {
      continue;
    }
    group.sort((a, b) => b.playCount - a.playCount);

    const target = pickTarget(group, ownedByLooseKey.get(looseGroupKey));
    const targetNameKey = albumNameKey(target.artist, target.album);
    const isTargetRow = (row: Row) =>
      row === target.row ||
      row.historyNames.some(
        name => albumNameKey(name.artist, name.album) === targetNameKey
      );

    const mappings: AlbumMergeMapping[] = [];
    for (const row of group) {
      // A history-album target stays as it is; the others merge into it
      if (row === target.row && target.collectionId === 0) continue;
      const alreadyLinked =
        target.collectionId > 0 &&
        row.linkedMapping?.collectionId === target.collectionId;
      if (alreadyLinked) continue;
      for (const name of row.historyNames) {
        // An unmapped name equal to the target already counts as it; one
        // mapped elsewhere needs re-pointing (a linked self-mapping is kept)
        if (
          albumNameKey(name.artist, name.album) === targetNameKey &&
          !name.mapped
        ) {
          continue;
        }
        mappings.push({
          historyArtist: name.artist,
          historyAlbum: name.album,
          collectionId: target.collectionId,
          collectionArtist: target.artist,
          collectionAlbum: target.album,
        });
      }
    }
    if (mappings.length === 0) continue;

    suggestions.push({
      id: suggestionId(group),
      totalPlays: group.reduce((sum, row) => sum + row.playCount, 0),
      target: {
        artist: target.artist,
        album: target.album,
        collectionId: target.collectionId,
      },
      versions: group.map(row => ({
        artist: row.artist,
        album: row.album,
        playCount: row.playCount,
        linked: Boolean(row.linkedMapping),
        isTarget: isTargetRow(row),
      })),
      mappings,
    });
  }

  return suggestions.sort((a, b) => b.totalPlays - a.totalPlays);
}

/**
 * Id for dismissing a suggestion: its history album names, so it doesn't
 * change when artist aliases do. A newly scrobbled version gives a new id, and
 * the suggestion comes back.
 */
function suggestionId(group: Row[]): string {
  return group
    .flatMap(row => row.historyNames)
    .map(name => albumNameKey(name.artist, name.album))
    .sort()
    .join(' + ');
}

/**
 * Choose what a group merges into: a collection item when one is already
 * linked or owned (earliest copy), otherwise the version with the plain title
 * (no edition tag), preferring the most played.
 */
function pickTarget(
  group: Row[],
  owned: CollectionItem | undefined
): { artist: string; album: string; collectionId: number; row?: Row } {
  const linkedRow = group.find(row => row.linkedMapping);
  if (linkedRow?.linkedMapping) {
    return {
      artist: linkedRow.linkedMapping.collectionArtist,
      album: linkedRow.linkedMapping.collectionAlbum,
      collectionId: linkedRow.linkedMapping.collectionId,
      row: linkedRow,
    };
  }
  if (owned) {
    return {
      artist: owned.release.artist,
      album: owned.release.title,
      collectionId: owned.id,
    };
  }
  const plain =
    group.find(
      row =>
        editionlessAlbumKey(row.album) === albumGroupKey('', row.album).slice(1)
    ) ?? group[0];
  return {
    artist: plain.artist,
    album: plain.album,
    collectionId: 0,
    row: plain,
  };
}
