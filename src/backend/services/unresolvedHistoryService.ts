import { randomUUID } from 'crypto';

import {
  ExcludedHistoryArtist,
  ExclusionSuggestion,
  ScrobbleHistoryIndex,
  UnresolvedHistoryGroup,
  UnresolvedHistoryPage,
  UnresolvedHistoryStore,
  UnresolvedHistorySummary,
  UnresolvedTrackResolution,
} from '../../shared/types';
import { FileStorage } from '../utils/fileStorage';
import {
  albumFromAlbumKey,
  artistFromAlbumKey,
  countListeningPlays,
  countUnresolvedPlays,
  findExclusionCandidates,
  forEachListeningPlay,
  normalizeHistoryName,
  UnresolvedResolutionRule,
} from '../utils/historyPlays';
import { createLogger } from '../utils/logger';

export const UNRESOLVED_HISTORY_FILE =
  'mappings/unresolved-track-resolutions.json';

/** "artist|track" key used to hide and resolve an unresolved track */
export function unresolvedTrackKey(artist: string, track: string): string {
  return `${normalizeHistoryName(artist)}|${normalizeHistoryName(track)}`;
}

/** Minimal Last.fm dependency (track.getInfo) for album suggestions */
export interface TrackInfoLookup {
  getTrackInfo(
    artist: string,
    track: string
  ): Promise<{ album?: string } | null>;
}

export type UnresolvedSort = 'plays' | 'artist' | 'recent';

/**
 * Albumless ("unresolved") plays: the rules that attribute them to albums,
 * the hidden list, and the grouped view the Unresolved tab shows.
 *
 * Rules are applied by ScrobbleHistoryStorage when the index is read; this
 * service never writes the history index.
 */
export class UnresolvedHistoryService {
  private logger = createLogger('UnresolvedHistoryService');
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private fileStorage: FileStorage,
    private trackInfo?: TrackInfoLookup
  ) {}

  async getStore(): Promise<UnresolvedHistoryStore> {
    try {
      const store = await this.fileStorage.readJSON<UnresolvedHistoryStore>(
        UNRESOLVED_HISTORY_FILE
      );
      if (store && store.schemaVersion === 1) {
        return {
          schemaVersion: 1,
          resolutions: store.resolutions ?? [],
          hidden: store.hidden ?? [],
          excludedArtists: store.excludedArtists ?? [],
        };
      }
    } catch {
      this.logger.debug('No unresolved history store yet');
    }
    return {
      schemaVersion: 1,
      resolutions: [],
      hidden: [],
      excludedArtists: [],
    };
  }

  /** Rules in the shape the storage layer applies */
  async getRules(): Promise<UnresolvedResolutionRule[]> {
    return (await this.getStore()).resolutions;
  }

  /**
   * Add or replace rules (one per artist + track). Returns the saved rules.
   */
  async addResolutions(
    inputs: Array<{
      artist: string;
      track: string;
      album: string;
      source?: UnresolvedTrackResolution['source'];
    }>
  ): Promise<UnresolvedTrackResolution[]> {
    return this.update(store => {
      const saved: UnresolvedTrackResolution[] = [];
      for (const input of inputs) {
        const artist = normalizeHistoryName(input.artist);
        const track = normalizeHistoryName(input.track);
        const album = input.album.trim();
        if (!artist || !track || !album) continue;
        const rule: UnresolvedTrackResolution = {
          id: randomUUID(),
          artist,
          track,
          album,
          source: input.source ?? 'user',
          createdAt: Date.now(),
        };
        store.resolutions = store.resolutions.filter(
          r => !(r.artist === artist && r.track === track)
        );
        store.resolutions.push(rule);
        saved.push(rule);
      }
      return saved;
    });
  }

  /** Remove a rule (undo). Returns whether it existed. */
  async removeResolution(id: string): Promise<boolean> {
    return this.update(store => {
      const before = store.resolutions.length;
      store.resolutions = store.resolutions.filter(r => r.id !== id);
      return store.resolutions.length !== before;
    });
  }

  /** Hide or show "artist|track" keys in the list (stats are unaffected). */
  async setHidden(keys: string[], hidden: boolean): Promise<number> {
    return this.update(store => {
      const set = new Set(store.hidden);
      let changed = 0;
      for (const key of keys) {
        const normalized = key.toLowerCase().trim();
        if (hidden && !set.has(normalized)) {
          set.add(normalized);
          changed++;
        } else if (!hidden && set.delete(normalized)) {
          changed++;
        }
      }
      store.hidden = [...set];
      return changed;
    });
  }

  /** Normalized artists left out of listening stats (e.g. podcasts) */
  async getExcludedArtists(): Promise<string[]> {
    return (await this.getStore()).excludedArtists ?? [];
  }

  /** Exclude artists from, or return them to, listening stats. */
  async setExcluded(artists: string[], excluded: boolean): Promise<number> {
    return this.update(store => {
      const set = new Set(store.excludedArtists ?? []);
      let changed = 0;
      for (const artist of artists) {
        const key = normalizeHistoryName(artist);
        if (!key) continue;
        if (excluded && !set.has(key)) {
          set.add(key);
          changed++;
        } else if (!excluded && set.delete(key)) {
          changed++;
        }
      }
      store.excludedArtists = [...set].sort();
      return changed;
    });
  }

  /** Excluded artists with how many stored plays each is leaving out. */
  async listExcluded(
    rawIndex: ScrobbleHistoryIndex | null,
    displayName: (artist: string) => string = name => name,
    /** Maps an index artist key to the excluded artist it belongs to */
    matcher: (artistKey: string) => string | null = key => key
  ): Promise<ExcludedHistoryArtist[]> {
    const excluded = await this.getExcludedArtists();
    const plays = new Map<string, number>(excluded.map(a => [a, 0]));
    if (rawIndex) {
      forEachListeningPlay(rawIndex, (_play, artist) => {
        const owner = matcher(artist);
        const count = owner === null ? undefined : plays.get(owner);
        if (owner !== null && count !== undefined) plays.set(owner, count + 1);
      });
    }
    return excluded.map(artist => ({
      artist,
      artistName: displayName(artist),
      plays: plays.get(artist) ?? 0,
    }));
  }

  /** Artists whose plays look like podcasts, not already excluded. */
  async suggestExclusions(
    index: ScrobbleHistoryIndex | null,
    displayName: (artist: string) => string = name => name
  ): Promise<ExclusionSuggestion[]> {
    if (!index) return [];
    const excluded = new Set(await this.getExcludedArtists());
    return findExclusionCandidates(index)
      .filter(candidate => !excluded.has(candidate.artist))
      .map(candidate => ({
        ...candidate,
        artistName: displayName(candidate.artist),
      }));
  }

  /** Album suggestion for an unresolved track from Last.fm track.getInfo. */
  async lookupAlbum(artist: string, track: string): Promise<string | null> {
    if (!this.trackInfo) return null;
    const info = await this.trackInfo.getTrackInfo(artist, track);
    const album = info?.album?.trim();
    return album ? album : null;
  }

  /**
   * Unresolved plays grouped by artist, from the index with rules applied
   * (so resolved tracks no longer appear).
   */
  async listGroups(
    index: ScrobbleHistoryIndex | null,
    options: {
      search?: string;
      sort?: UnresolvedSort;
      page?: number;
      limit?: number;
      includeHidden?: boolean;
      displayName?: (artist: string) => string;
    } = {}
  ): Promise<UnresolvedHistoryPage> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(200, Math.max(1, options.limit ?? 50));
    if (!index) return { groups: [], total: 0, page, limit };

    const store = await this.getStore();
    const hidden = new Set(store.hidden);
    const search = options.search?.toLowerCase().trim();
    const displayName = options.displayName ?? ((name: string) => name);

    const knownAlbums = new Map<string, Set<string>>();
    for (const key of Object.keys(index.albums)) {
      const artist = artistFromAlbumKey(key);
      const albums = knownAlbums.get(artist) ?? new Set<string>();
      albums.add(albumFromAlbumKey(key));
      knownAlbums.set(artist, albums);
    }

    const groups: UnresolvedHistoryGroup[] = [];
    for (const [artist, entry] of Object.entries(index.unresolved ?? {})) {
      const byTrack = new Map<
        string,
        { track: string; plays: number; first: number; last: number }
      >();
      for (const play of entry.plays) {
        const track = play.track ?? '';
        const key = unresolvedTrackKey(artist, track);
        const current = byTrack.get(key);
        if (current) {
          current.plays++;
          current.first = Math.min(current.first, play.timestamp);
          current.last = Math.max(current.last, play.timestamp);
        } else {
          byTrack.set(key, {
            track,
            plays: 1,
            first: play.timestamp,
            last: play.timestamp,
          });
        }
      }

      const artistName = displayName(artist);
      const artistMatches =
        !search ||
        artist.includes(search) ||
        artistName.toLowerCase().includes(search);
      const tracks = [...byTrack.entries()]
        .map(([key, t]) => ({
          key,
          track: t.track,
          playCount: t.plays,
          firstPlayed: t.first,
          lastPlayed: t.last,
          hidden: hidden.has(key),
        }))
        .filter(t => options.includeHidden || !t.hidden)
        .filter(
          t =>
            artistMatches || (search && t.track.toLowerCase().includes(search))
        )
        .sort(
          (a, b) => b.playCount - a.playCount || b.lastPlayed - a.lastPlayed
        );
      if (tracks.length === 0) continue;

      groups.push({
        artist,
        artistName,
        playCount: tracks.reduce((sum, t) => sum + t.playCount, 0),
        lastPlayed: Math.max(...tracks.map(t => t.lastPlayed)),
        tracks,
        knownAlbums: [...(knownAlbums.get(artist) ?? [])].sort(),
      });
    }

    const sort = options.sort ?? 'plays';
    groups.sort((a, b) => {
      if (sort === 'artist') return a.artistName.localeCompare(b.artistName);
      if (sort === 'recent') return b.lastPlayed - a.lastPlayed;
      return (
        b.playCount - a.playCount || a.artistName.localeCompare(b.artistName)
      );
    });

    return {
      groups: groups.slice((page - 1) * limit, page * limit),
      total: groups.length,
      page,
      limit,
    };
  }

  /**
   * Counts for the summary banner. `rawIndex` is the file as stored;
   * `exclusionView` leaves excluded artists out; `resolvedIndex` also has
   * resolution rules applied (what stats see).
   */
  async getSummary(
    rawIndex: ScrobbleHistoryIndex | null,
    exclusionView: ScrobbleHistoryIndex | null,
    resolvedIndex: ScrobbleHistoryIndex | null
  ): Promise<UnresolvedHistorySummary> {
    const store = await this.getStore();
    const indexedTotal = rawIndex ? countListeningPlays(rawIndex) : 0;
    const keptTotal = exclusionView ? countListeningPlays(exclusionView) : 0;
    const rawUnresolved = exclusionView
      ? countUnresolvedPlays(exclusionView)
      : 0;
    const unresolvedCount = resolvedIndex
      ? countUnresolvedPlays(resolvedIndex)
      : rawUnresolved;
    const hidden = new Set(store.hidden);
    let hiddenCount = 0;
    for (const [artist, entry] of Object.entries(
      resolvedIndex?.unresolved ?? {}
    )) {
      for (const play of entry.plays) {
        if (hidden.has(unresolvedTrackKey(artist, play.track ?? ''))) {
          hiddenCount++;
        }
      }
    }
    const lastfmTotal = rawIndex?.lastfmTotal ?? null;
    return {
      indexedTotal,
      unresolvedCount,
      resolvedByRuleCount: rawUnresolved - unresolvedCount,
      hiddenCount,
      resolutionCount: store.resolutions.length,
      excludedArtistCount: (store.excludedArtists ?? []).length,
      excludedPlayCount: rawIndex ? indexedTotal - keptTotal : 0,
      lastfmTotal,
      lastfmTotalCheckedAt: rawIndex?.lastfmTotalCheckedAt ?? null,
      gap: lastfmTotal !== null ? lastfmTotal - indexedTotal : null,
      lastFullBackfillAt: rawIndex?.lastFullBackfillAt ?? null,
    };
  }

  /** Serialize read-modify-write cycles on the store file. */
  private update<T>(change: (store: UnresolvedHistoryStore) => T): Promise<T> {
    const run = this.writeQueue.then(async () => {
      const store = await this.getStore();
      const result = change(store);
      await this.fileStorage.writeJSONWithBackup(
        UNRESOLVED_HISTORY_FILE,
        store
      );
      return result;
    });
    this.writeQueue = run.catch(() => undefined);
    return run;
  }
}
