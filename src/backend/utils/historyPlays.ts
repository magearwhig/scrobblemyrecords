import {
  AlbumHistoryEntry,
  ScrobbleHistoryEntry,
  ScrobbleHistoryIndex,
} from '../../shared/types';

/** Album label shown for unresolved (albumless) plays in listening stats */
export const UNKNOWN_ALBUM_LABEL = 'Unknown album';

/** Lowercase + trim, the normalisation used by history index keys. */
export function normalizeHistoryName(name: string): string {
  return name.toLowerCase().trim();
}

/**
 * Identity of one listening event: timestamp + track (raw scrobbled name,
 * normalized). Each identity appears at most once across `index.albums` and
 * `index.unresolved` together.
 *
 * The track is included because consecutive tracks can share a scrobble
 * timestamp. The artist is deliberately left out: HistoryIndexMergeService
 * moves plays between artist spellings, so a play's artist key can differ
 * from the name Last.fm returns; the same key is used by that merge.
 * Encoded as JSON so names containing "|" can't collide.
 */
export function playIdentity(
  timestamp: number,
  track: string | undefined
): string {
  return JSON.stringify([timestamp, normalizeHistoryName(track ?? '')]);
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
  for (const entry of Object.values(index.albums)) {
    for (const play of entry.plays) {
      withAlbum.add(playIdentity(play.timestamp, play.track));
    }
  }
  for (const entry of Object.values(index.unresolved ?? {})) {
    for (const play of entry.plays) {
      unresolved.add(playIdentity(play.timestamp, play.track));
    }
  }
  return { withAlbum, unresolved };
}

/**
 * One-time cleanup: keep each identity once. A play with an album wins over
 * an unresolved copy; within a store the first copy wins. Entries that lose
 * plays get playCount/lastPlayed recomputed (and are removed if emptied), and
 * totalScrobbles is reset to the real count. Mutates and returns the index,
 * plus how many plays it removed.
 */
export function dedupeHistoryIndex<T extends ScrobbleHistoryIndex>(
  index: T
): { index: T; removed: number } {
  let removed = 0;
  const seen = new Set<string>();

  for (const [key, entry] of Object.entries(index.albums)) {
    const before = entry.plays.length;
    entry.plays = entry.plays.filter(play => {
      const id = playIdentity(play.timestamp, play.track);
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
      const id = playIdentity(play.timestamp, play.track);
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

/** A saved rule attributing an unresolved artist + track to an album. */
export interface UnresolvedResolutionRule {
  /** Normalized scrobbled artist */
  artist: string;
  /** Normalized scrobbled track */
  track: string;
  /** Album to attribute (display name) */
  album: string;
}

/**
 * Derived view of the index with resolution rules applied: unresolved plays
 * matching a rule move to `albums[artist|album]` (skipping identities already
 * there), the rest stay unresolved. Returns a new index; the input is not
 * modified, so the raw file is never rewritten with resolved plays and
 * deleting a rule simply restores the previous view.
 */
export function applyUnresolvedResolutions<T extends ScrobbleHistoryIndex>(
  index: T,
  rules: UnresolvedResolutionRule[]
): { index: T; resolvedPlays: number } {
  const unresolved = index.unresolved ?? {};
  if (rules.length === 0 || Object.keys(unresolved).length === 0) {
    return { index, resolvedPlays: 0 };
  }

  const albumByArtistTrack = new Map<string, string>();
  for (const rule of rules) {
    albumByArtistTrack.set(
      JSON.stringify([
        normalizeHistoryName(rule.artist),
        normalizeHistoryName(rule.track),
      ]),
      rule.album
    );
  }

  // Copy only what changes: albums map, touched album entries, unresolved
  const albums: Record<string, AlbumHistoryEntry> = { ...index.albums };
  const copiedAlbumKeys = new Set<string>();
  const nextUnresolved: Record<string, AlbumHistoryEntry> = {};
  const albumIdentities = new Map<string, Set<string>>();
  let resolvedPlays = 0;

  for (const [artist, entry] of Object.entries(unresolved)) {
    const keep: ScrobbleHistoryEntry[] = [];
    for (const play of entry.plays) {
      const album = albumByArtistTrack.get(
        JSON.stringify([artist, normalizeHistoryName(play.track ?? '')])
      );
      if (!album) {
        keep.push(play);
        continue;
      }
      const key = `${artist}|${normalizeHistoryName(album)}`;
      if (!copiedAlbumKeys.has(key)) {
        const existing = albums[key];
        albums[key] = existing
          ? { ...existing, plays: [...existing.plays] }
          : { lastPlayed: 0, playCount: 0, plays: [] };
        copiedAlbumKeys.add(key);
        albumIdentities.set(
          key,
          new Set(
            albums[key].plays.map(p => playIdentity(p.timestamp, p.track))
          )
        );
      }
      const identities = albumIdentities.get(key)!;
      const id = playIdentity(play.timestamp, play.track);
      resolvedPlays++;
      if (identities.has(id)) continue;
      identities.add(id);
      albums[key].plays.push(play);
    }
    if (keep.length === entry.plays.length) {
      nextUnresolved[artist] = entry;
    } else if (keep.length > 0) {
      const remaining = { ...entry, plays: keep };
      refreshEntryStats(remaining);
      nextUnresolved[artist] = remaining;
    }
  }
  for (const key of copiedAlbumKeys) {
    refreshEntryStats(albums[key]);
  }

  return {
    index: { ...index, albums, unresolved: nextUnresolved },
    resolvedPlays,
  };
}
