import {
  AlbumHistoryEntry,
  ScrobbleHistoryEntry,
  ScrobbleHistoryIndex,
} from '../../shared/types';

/** Lowercase + trim, the normalisation used by history index keys. */
export function normalizeHistoryName(name: string): string {
  return name.toLowerCase().trim();
}

/**
 * Identity of one listening event: timestamp + artist + track, using the
 * raw scrobbled names. Each identity appears at most once across
 * `index.albums` and `index.unresolved` together.
 *
 * Artist is included because consecutive tracks (and different artists) can
 * share a scrobble timestamp.
 */
export function playIdentity(
  timestamp: number,
  artist: string,
  track: string | undefined
): string {
  return `${timestamp}|${normalizeHistoryName(artist)}|${normalizeHistoryName(track ?? '')}`;
}

/** Artist part of an `index.albums` key ("artist|album"). */
export function artistFromAlbumKey(key: string): string {
  const separator = key.indexOf('|');
  return separator === -1 ? key : key.slice(0, separator);
}

/**
 * Album part of an `index.albums` key ("artist|album"); everything after the
 * first "|" (album titles may themselves contain "|").
 */
export function albumFromAlbumKey(key: string): string {
  const separator = key.indexOf('|');
  return separator === -1 ? '' : key.slice(separator + 1);
}

/**
 * Visit every listening event in the index: plays with an album and
 * unresolved (albumless) plays. `album` is null for unresolved plays.
 * Use this for listening-level stats (totals, streaks, artists, tracks,
 * patterns); album-level stats keep iterating `index.albums`.
 */
export function forEachListeningPlay(
  index: Pick<ScrobbleHistoryIndex, 'albums' | 'unresolved'>,
  callback: (
    play: ScrobbleHistoryEntry,
    artist: string,
    album: string | null
  ) => void
): void {
  for (const [key, entry] of Object.entries(index.albums)) {
    const artist = artistFromAlbumKey(key);
    const album = albumFromAlbumKey(key);
    for (const play of entry.plays) {
      callback(play, artist, album);
    }
  }
  for (const [artist, entry] of Object.entries(index.unresolved ?? {})) {
    for (const play of entry.plays) {
      callback(play, artist, null);
    }
  }
}

/** Number of listening events (album plays + unresolved plays). */
export function countListeningPlays(
  index: Pick<ScrobbleHistoryIndex, 'albums' | 'unresolved'>
): number {
  let total = 0;
  for (const entry of Object.values(index.albums)) {
    total += entry.plays.length;
  }
  for (const entry of Object.values(index.unresolved ?? {})) {
    total += entry.plays.length;
  }
  return total;
}

/** Number of unresolved (albumless) plays. */
export function countUnresolvedPlays(
  index: Pick<ScrobbleHistoryIndex, 'unresolved'>
): number {
  let total = 0;
  for (const entry of Object.values(index.unresolved ?? {})) {
    total += entry.plays.length;
  }
  return total;
}

/** Recompute playCount and lastPlayed from an entry's plays. */
export function refreshEntryStats(entry: AlbumHistoryEntry): void {
  entry.playCount = entry.plays.length;
  entry.lastPlayed = entry.plays.reduce(
    (latest, play) => Math.max(latest, play.timestamp),
    0
  );
}

/**
 * Identities currently in the index, split by where they live, so a sync can
 * skip plays it already has and let an album copy replace an unresolved one.
 */
export function buildIdentitySets(
  index: Pick<ScrobbleHistoryIndex, 'albums' | 'unresolved'>
): { withAlbum: Set<string>; unresolved: Set<string> } {
  const withAlbum = new Set<string>();
  const unresolved = new Set<string>();
  for (const [key, entry] of Object.entries(index.albums)) {
    const artist = artistFromAlbumKey(key);
    for (const play of entry.plays) {
      withAlbum.add(playIdentity(play.timestamp, artist, play.track));
    }
  }
  for (const [artist, entry] of Object.entries(index.unresolved ?? {})) {
    for (const play of entry.plays) {
      unresolved.add(playIdentity(play.timestamp, artist, play.track));
    }
  }
  return { withAlbum, unresolved };
}

/**
 * One-time cleanup: keep each identity once. A play with an album wins over
 * an unresolved copy; within a store the first copy wins. Entries that lose
 * plays get playCount/lastPlayed recomputed (and are removed if emptied), and
 * totalScrobbles is reset to the real count. Mutates and returns the index, plus how many plays it removed.
 */
export function dedupeHistoryIndex<T extends ScrobbleHistoryIndex>(
  index: T
): { index: T; removed: number } {
  let removed = 0;
  const seen = new Set<string>();

  for (const [key, entry] of Object.entries(index.albums)) {
    const artist = artistFromAlbumKey(key);
    const before = entry.plays.length;
    entry.plays = entry.plays.filter(play => {
      const id = playIdentity(play.timestamp, artist, play.track);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    if (before === entry.plays.length) continue;
    removed += before - entry.plays.length;
    // Only drop entries this cleanup emptied; leave pre-existing data alone
    if (entry.plays.length === 0) {
      delete index.albums[key];
    } else {
      refreshEntryStats(entry);
    }
  }

  const unresolved = index.unresolved ?? {};
  for (const [artist, entry] of Object.entries(unresolved)) {
    const before = entry.plays.length;
    entry.plays = entry.plays.filter(play => {
      const id = playIdentity(play.timestamp, artist, play.track);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    if (before === entry.plays.length) continue;
    removed += before - entry.plays.length;
    if (entry.plays.length === 0) {
      delete unresolved[artist];
    } else {
      refreshEntryStats(entry);
    }
  }
  index.unresolved = unresolved;
  index.totalScrobbles = countListeningPlays(index);
  return { index, removed };
}
