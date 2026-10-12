import { randomUUID } from 'crypto';

import {
  ExcludedHistoryArtist,
  ExclusionSuggestion,
  ScrobbleHistoryIndex,
  AlbumTrackMatchQuality,
  AlbumTracklistMatch,
  UnresolvedAlbumLookup,
  UnresolvedAlbumOption,
  UnresolvedAlbumVerification,
  UnresolvedArtistAlbumSuggestions,
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
  /** Last.fm album.getInfo response (album object), used to verify */
  getAlbumInfo?(artist: string, album: string): Promise<unknown>;
}

/** How long a looked-up album tracklist is reused (ms) */
const ALBUM_INFO_TTL = 60 * 60 * 1000;
/** A failed lookup is retried after this long, not an hour later */
const ALBUM_INFO_FAILURE_TTL = 2 * 60 * 1000;
const ALBUM_INFO_CACHE_LIMIT = 200;

interface AlbumTracklist {
  /** Track titles in order; null if Last.fm gave no tracklist */
  tracks: string[] | null;
  imageUrl?: string;
  albumUrl?: string;
}

/** Pull tracklist, cover and URL out of a Last.fm album.getInfo album */
function parseLastfmAlbum(album: unknown): AlbumTracklist | null {
  if (!album || typeof album !== 'object') return null;
  const data = album as {
    tracks?: { track?: unknown };
    image?: Array<{ size?: string; '#text'?: string }>;
    url?: string;
  };
  const raw = data.tracks?.track;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const tracks = list
    .map(t => (t && typeof t === 'object' ? (t as { name?: string }).name : ''))
    .filter((name): name is string => Boolean(name));
  const images = data.image ?? [];
  const imageUrl =
    ['extralarge', 'large', 'medium']
      .map(size => images.find(i => i.size === size)?.['#text'])
      .find(url => Boolean(url)) || undefined;
  return {
    tracks: tracks.length > 0 ? tracks : null,
    imageUrl,
    albumUrl: data.url || undefined,
  };
}

export type UnresolvedSort = 'plays' | 'artist' | 'recent';

/** An owned release's title and track titles (from the Discogs cache) */
export interface OwnedReleaseTracks {
  title: string;
  tracks: string[];
}

/** Words that tag a version of a song rather than a different song */
const VERSION_WORDS =
  '(?:live|demo|acoustic|remix|mix|edit|version|session|take|instrumental|unplugged|alternate|alt|rehearsal|bootleg|early|rough)';
/** "(live)", "[Demo Version]", "(Live at the Casbah)" */
const VERSION_TAG_IN_BRACKETS = new RegExp(
  `\\s*[([][^)\\]]*\\b${VERSION_WORDS}\\b[^)\\]]*[)\\]]`,
  'gi'
);
/** " - Live", " - Demo Version" at the end */
const VERSION_TAG_AFTER_DASH = new RegExp(
  `\\s+-\\s+[^-]*\\b${VERSION_WORDS}\\b[^-]*$`,
  'i'
);

/**
 * Title key with version tags removed: "Angela (live)" -> "angela", but
 * "Song (Part 2)" keeps its part number.
 */
function untaggedMatchKey(track: string): string {
  return trackMatchKey(
    track
      .replace(VERSION_TAG_IN_BRACKETS, ' ')
      .replace(VERSION_TAG_AFTER_DASH, '')
  );
}

/**
 * Looser key for near matches: words normalized first, then a plural "s"
 * dropped from longer words ("Landscapes!" -> "landscape", not "Gas" -> "Ga").
 */
function nearMatchKey(track: string): string {
  const words = titleWords(
    stripReleaseTags(
      track
        .replace(VERSION_TAG_IN_BRACKETS, ' ')
        .replace(VERSION_TAG_AFTER_DASH, '')
    )
  ).map(word =>
    word.length > 3 && word.endsWith('s') && !word.endsWith('ss')
      ? word.slice(0, -1)
      : word
  );
  return words.join('') || track.toLowerCase().trim();
}

const LIVE = /\blive\b/i;

/** "bee thousand" -> "Bee Thousand" (history album keys are lowercase) */
function titleCase(name: string): string {
  return name.replace(
    /(^|[\s([{"'/-])(\p{L})/gu,
    (_match, before, letter) => `${before}${letter.toUpperCase()}`
  );
}

/**
 * Key for matching a song across albums: ignores case, version tags
 * ("(Remastered)", " - 2011 Remaster", "[Explicit]"), "feat." credits,
 * quotes and punctuation.
 */
export function trackMatchKey(track: string): string {
  return (
    titleWords(stripReleaseTags(track)).join('') || track.toLowerCase().trim()
  );
}

/**
 * Remove tags that describe a release rather than a recording: remasters,
 * mono/stereo, explicit/clean, "feat." credits. Recording identifiers (live,
 * demo, remix, acoustic, part numbers) are kept, so they stay distinct.
 */
function stripReleaseTags(track: string): string {
  return track
    .replace(
      /\s*[([](?:\d{4}\s+)?(?:remaster(?:ed)?|explicit|clean|mono|stereo|bonus track)(?:\s+(?:version|\d{4}))?[)\]]/gi,
      ' '
    )
    .replace(
      /\s+-\s+(?:\d{4}\s+)?(?:remaster(?:ed)?(?:\s+\d{4})?|(?:\d{4}\s+)?remaster|mono|stereo)(?:\s+(?:version|mix))?\s*$/i,
      ''
    )
    .replace(/\s*[([]?\b(?:feat\.?|ft\.?|featuring)\s+[^)\]]*[)\]]?\s*$/i, '');
}

/** Lowercased words of a title, accents and punctuation removed */
function titleWords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[’‘'`"“”]/g, '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^\p{L}\p{N}\p{M}]+/u)
    .filter(Boolean);
}

/**
 * Albumless ("unresolved") plays: the rules that attribute them to albums,
 * the hidden list, and the grouped view the Unresolved tab shows.
 *
 * Rules are applied by ScrobbleHistoryStorage when the index is read; this
 * service never writes the history index.
 */
export class UnresolvedHistoryService {
  private logger = createLogger('UnresolvedHistoryService');
  private albumInfoCache = new Map<
    string,
    { value: AlbumTracklist | null; at: number }
  >();
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

  /**
   * Suggest an album for each of an artist's unresolved tracks, from albums
   * that already have that song: first your listening history (the album the
   * song was played on most), then releases you own (Discogs tracklists).
   * Suggestions only; nothing is saved.
   */
  async suggestAlbums(
    index: ScrobbleHistoryIndex | null,
    artist: string,
    options: {
      includeHidden?: boolean;
      displayName?: (artist: string) => string;
      /** Whether another index artist key is the same artist (aliases) */
      isSameArtist?: (otherArtistKey: string) => boolean;
      ownedReleases?: () => Promise<OwnedReleaseTracks[]>;
    } = {}
  ): Promise<UnresolvedArtistAlbumSuggestions> {
    const artistKey = normalizeHistoryName(artist);
    const displayName = options.displayName ?? ((name: string) => name);
    const result: UnresolvedArtistAlbumSuggestions = {
      artist: artistKey,
      artistName: displayName(artistKey),
      tracks: [],
    };
    const entry = index?.unresolved?.[artistKey];
    if (!index || !entry) return result;

    // Proper casing for album titles you own
    const owned = options.ownedReleases ? await options.ownedReleases() : [];
    const ownedTitle = new Map(
      owned.map(release => [normalizeHistoryName(release.title), release.title])
    );

    // song -> album -> plays of that song on that album
    const historyAlbums = new Map<string, Map<string, number>>();
    for (const [key, album] of Object.entries(index.albums)) {
      const keyArtist = artistFromAlbumKey(key);
      if (keyArtist !== artistKey && !options.isSameArtist?.(keyArtist)) {
        continue;
      }
      const albumName = albumFromAlbumKey(key);
      const title = ownedTitle.get(albumName) ?? titleCase(albumName);
      for (const play of album.plays) {
        const song = trackMatchKey(play.track ?? '');
        const albums = historyAlbums.get(song) ?? new Map<string, number>();
        albums.set(title, (albums.get(title) ?? 0) + 1);
        historyAlbums.set(song, albums);
      }
    }
    // song -> owned release titles with that song
    const ownedAlbums = new Map<string, Set<string>>();
    for (const release of owned) {
      for (const track of release.tracks) {
        const song = trackMatchKey(track);
        const titles = ownedAlbums.get(song) ?? new Set<string>();
        titles.add(release.title);
        ownedAlbums.set(song, titles);
      }
    }

    const store = await this.getStore();
    const hidden = new Set(store.hidden);
    const byKey = new Map<string, { track: string; plays: number }>();
    for (const play of entry.plays) {
      const track = play.track ?? '';
      const key = unresolvedTrackKey(artistKey, track);
      const current = byKey.get(key);
      if (current) current.plays++;
      else byKey.set(key, { track, plays: 1 });
    }

    for (const [key, { track, plays }] of byKey) {
      const isHidden = hidden.has(key);
      if (isHidden && !options.includeHidden) continue;
      const song = trackMatchKey(track);
      const fromHistory: UnresolvedAlbumOption[] = [
        ...(historyAlbums.get(song) ?? new Map<string, number>()),
      ]
        .map(([album, trackPlays]) => ({
          album,
          source: 'history' as const,
          trackPlays,
        }))
        .sort(
          (a, b) =>
            b.trackPlays - a.trackPlays || a.album.localeCompare(b.album)
        );
      const seen = new Set(fromHistory.map(o => normalizeHistoryName(o.album)));
      const fromCollection: UnresolvedAlbumOption[] = [
        ...(ownedAlbums.get(song) ?? new Set<string>()),
      ]
        .filter(album => !seen.has(normalizeHistoryName(album)))
        .sort((a, b) => a.localeCompare(b))
        .map(album => ({
          album,
          source: 'collection' as const,
          trackPlays: 0,
        }));
      const [suggestion = null, ...alternatives] = [
        ...fromHistory,
        ...fromCollection,
      ];
      result.tracks.push({
        key,
        track,
        playCount: plays,
        hidden: isHidden,
        suggestion,
        alternatives,
      });
    }

    result.tracks.sort(
      (a, b) => b.playCount - a.playCount || a.track.localeCompare(b.track)
    );
    return result;
  }

  /**
   * Match an artist's unresolved tracks against one album's tracklist (e.g. a
   * Discogs album the user points at). Exact titles first, then titles with
   * bracketed tags like "(live)" ignored, then near matches (plurals).
   * `liveMismatch` flags a match where only one side says "live", which may
   * be a different version of the song.
   */
  async matchAlbumTracklist(
    index: ScrobbleHistoryIndex | null,
    artist: string,
    album: {
      title: string;
      artist: string;
      tracks: Array<{ position?: string; title: string }>;
      imageUrl?: string;
      url?: string;
    },
    options: { includeHidden?: boolean } = {}
  ): Promise<AlbumTracklistMatch> {
    const artistKey = normalizeHistoryName(artist);
    const result: AlbumTracklistMatch = {
      album: album.title,
      albumArtist: album.artist,
      trackCount: album.tracks.length,
      imageUrl: album.imageUrl,
      albumUrl: album.url,
      matches: [],
      unmatchedCount: 0,
    };
    const entry = index?.unresolved?.[artistKey];
    if (!entry) return result;

    const byKey = (keyOf: (title: string) => string) => {
      const map = new Map<string, number>();
      album.tracks.forEach((t, i) => {
        const key = keyOf(t.title);
        if (key && !map.has(key)) map.set(key, i);
      });
      return map;
    };
    const exact = byKey(trackMatchKey);
    const untagged = byKey(untaggedMatchKey);
    const near = byKey(nearMatchKey);
    const albumIsLive = LIVE.test(album.title);

    const hidden = new Set((await this.getStore()).hidden);
    const tracks = new Map<string, { track: string; plays: number }>();
    for (const play of entry.plays) {
      const track = play.track ?? '';
      const key = unresolvedTrackKey(artistKey, track);
      const current = tracks.get(key);
      if (current) current.plays++;
      else tracks.set(key, { track, plays: 1 });
    }

    for (const [key, { track, plays }] of tracks) {
      if (hidden.has(key) && !options.includeHidden) continue;
      let quality: AlbumTrackMatchQuality = 'exact';
      let index = exact.get(trackMatchKey(track));
      if (index === undefined) {
        quality = 'tags';
        index = untagged.get(untaggedMatchKey(track));
      }
      if (index === undefined) {
        quality = 'near';
        index = near.get(nearMatchKey(track));
      }
      if (index === undefined) {
        result.unmatchedCount++;
        continue;
      }
      const albumTrack = album.tracks[index];
      const trackIsLive = LIVE.test(track) && !LIVE.test(albumTrack.title);
      const albumOnlyLive =
        (albumIsLive || LIVE.test(albumTrack.title)) && !LIVE.test(track);
      result.matches.push({
        key,
        track,
        playCount: plays,
        albumTrack: albumTrack.title,
        position: index + 1,
        positionLabel: albumTrack.position || undefined,
        quality,
        liveMismatch: albumIsLive
          ? albumOnlyLive
          : trackIsLive || albumOnlyLive,
      });
    }
    result.matches.sort((a, b) => a.position - b.position);
    return result;
  }

  /** Album suggestion for an unresolved track from Last.fm track.getInfo. */
  async lookupAlbum(
    artist: string,
    track: string
  ): Promise<UnresolvedAlbumLookup> {
    if (!this.trackInfo) return { album: null };
    const info = await this.trackInfo.getTrackInfo(artist, track);
    const album = info?.album?.trim();
    if (!album) return { album: null };
    return {
      album,
      verification: await this.verifyOnAlbum(artist, album, track),
    };
  }

  /**
   * Check a suggested album's tracklist (Last.fm album.getInfo) for the
   * song, so the user can see the suggestion is right before saving.
   */
  private async verifyOnAlbum(
    artist: string,
    album: string,
    track: string
  ): Promise<UnresolvedAlbumVerification> {
    const info = await this.getAlbumTracklist(artist, album);
    if (!info) return { onTracklist: null };
    const base = {
      trackCount: info.tracks?.length,
      imageUrl: info.imageUrl,
      albumUrl: info.albumUrl,
    };
    if (!info.tracks) return { onTracklist: null, ...base };
    const song = trackMatchKey(track);
    const index = info.tracks.findIndex(title => trackMatchKey(title) === song);
    return index === -1
      ? { onTracklist: false, ...base }
      : { onTracklist: true, position: index + 1, ...base };
  }

  /** album.getInfo, cached per album (many songs often share one album) */
  private async getAlbumTracklist(
    artist: string,
    album: string
  ): Promise<AlbumTracklist | null> {
    if (!this.trackInfo?.getAlbumInfo) return null;
    const key = JSON.stringify([
      normalizeHistoryName(artist),
      normalizeHistoryName(album),
    ]);
    const cached = this.albumInfoCache.get(key);
    const ttl = cached?.value ? ALBUM_INFO_TTL : ALBUM_INFO_FAILURE_TTL;
    if (cached && Date.now() - cached.at < ttl) return cached.value;
    let value: AlbumTracklist | null;
    try {
      value = parseLastfmAlbum(
        await this.trackInfo.getAlbumInfo(artist, album)
      );
    } catch {
      value = null;
    }
    if (this.albumInfoCache.size >= ALBUM_INFO_CACHE_LIMIT) {
      const oldest = this.albumInfoCache.keys().next().value;
      if (oldest !== undefined) this.albumInfoCache.delete(oldest);
    }
    this.albumInfoCache.set(key, { value, at: Date.now() });
    return value;
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
