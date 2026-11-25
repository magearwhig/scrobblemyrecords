import { createHash } from 'crypto';

import {
  AlbumHistoryEntry,
  AlbumMapping,
  CollectionItem,
} from '../../../shared/types';
import {
  albumNameKey,
  stripDiscogsSuffixes,
} from '../../../shared/utils/albumMapping';
import { listeningEntries } from '../../utils/historyPlays';
import type { ArtistNameResolver } from '../artistNameResolver';
import { loadAlbumMappings } from '../mergedAlbumHistory';
import type { ScrobbleHistoryStorage } from '../scrobbleHistoryStorage';
import type { TrackMappingService } from '../trackMappingService';

import { buildPlayIdentityResolver, PlayIdentityResolver } from './index';

/** One scrobble, resolved (see PlayIdentity) */
export interface ResolvedPlay {
  timestamp: number;
  /** Track as it counts, after track mappings */
  track?: string;
  /** Track as scrobbled */
  sourceTrack?: string;
  trackKey?: string;
  artist: string;
  /** null for a play with no album */
  album: string | null;
  albumKey: string | null;
  /** The history index entry it was scrobbled under ("artist|album") */
  sourceKey: string | null;
  collectionItem?: CollectionItem;
}

/** The plays of one merged album */
export interface AlbumPlays {
  albumKey: string;
  /** Most-played artist */
  artist: string;
  album: string;
  playCount: number;
  lastPlayed: number;
  plays: ResolvedPlay[];
  collectionItem?: CollectionItem;
}

/**
 * The plays of a record, in the shape the record-to-plays code already uses
 * (a record's merged history): plays with the track as it counts, the history
 * albums they were scrobbled under, and whether any was the record's own name
 */
export interface RecordPlays {
  entry: AlbumHistoryEntry | null;
  matchType: 'exact' | 'fuzzy' | 'none';
  matchedKeys: string[];
}

/** Every play resolved once, indexed by album and by owned record */
export interface ListeningReadModel {
  identity: PlayIdentityResolver;
  albums(): AlbumPlays[];
  /**
   * The plays of an album by any of its names: when it's an owned record,
   * every play of that record (including other scrobbled versions that
   * resolve to it). Undefined when never played.
   */
  albumPlays(artist: string, album: string): AlbumPlays | undefined;
  /** Every play that resolves to this record or another copy of it */
  recordPlays(item: CollectionItem): RecordPlays;
  /** The same plays as recordPlays, resolved (artist, album, track keys) */
  recordResolvedPlays(item: CollectionItem): ResolvedPlay[];
  /**
   * Plays of an album named the Discogs way (e.g. a wishlist record): by its
   * merged album, then spelling-tolerant, under its credited artist and its
   * Last.fm name (artist mappings) - the same tiers ownership uses
   */
  discogsAlbumPlays(
    artist: string,
    title: string
  ): {
    playCount: number;
    lastPlayed: number | null;
    matchType: 'exact' | 'fuzzy' | 'none';
  };
  /**
   * The plays behind discogsAlbumPlays: an owned record's plays when the
   * album is one, else the matched albums' plays
   */
  discogsAlbumPlayList(
    artist: string,
    title: string
  ): {
    plays: ResolvedPlay[];
    matchType: 'exact' | 'fuzzy' | 'none';
    collectionItem?: CollectionItem;
  };
}

type ArtistResolver = Pick<ArtistNameResolver, 'resolveArtist'> &
  Partial<Pick<ArtistNameResolver, 'getFingerprint'>>;

/**
 * The one place plays are resolved (see services/playIdentity and
 * AGENTS.md). Answers both directions: what a play counts as (resolver), and
 * which plays an album or owned record has (readModel). Both are reused
 * until a mapping, an alias, the collection or the history changes.
 */
export class PlayIdentityService {
  private mappingService: {
    getAllAlbumMappings(): Promise<AlbumMapping[]>;
  } | null = null;
  private trackMappingService:
    | (Pick<TrackMappingService, 'createLookup'> &
        Partial<
          Pick<TrackMappingService, 'getAllTrackMappings' | 'getFingerprint'>
        >)
    | null = null;
  private artistNameResolver: ArtistResolver | null = null;
  private lastfmArtistOf: ((discogsArtist: string) => string) | null = null;
  private lastfmArtistFingerprint: () => string = () => '';
  private resolvers = new Map<string, Promise<PlayIdentityResolver>>();
  private models = new WeakMap<
    object,
    Map<string, Promise<ListeningReadModel>>
  >();

  constructor(
    private historyStorage: Pick<
      ScrobbleHistoryStorage,
      'getIndex' | 'fuzzyNormalizeKey'
    >
  ) {}

  setMappingService(
    service: { getAllAlbumMappings(): Promise<AlbumMapping[]> } | null
  ): void {
    this.mappingService = service;
  }

  setTrackMappingService(service: PlayIdentityService['trackMappingService']) {
    this.trackMappingService = service;
  }

  setArtistNameResolver(resolver: ArtistResolver | null): void {
    this.artistNameResolver = resolver;
  }

  /** Discogs-to-Last.fm artist names (artist mappings) and their fingerprint */
  setLastfmArtistOf(
    lastfmArtistOf: (discogsArtist: string) => string,
    fingerprint: () => string = () => ''
  ): void {
    this.lastfmArtistOf = lastfmArtistOf;
    this.lastfmArtistFingerprint = fingerprint;
  }

  /** Artist alias key, as StatsService.resolveArtistName */
  private resolveArtist(name: string): string {
    return this.artistNameResolver
      ? this.artistNameResolver.resolveArtist(name)
      : name.toLowerCase();
  }

  /** Identifies the rules and the collection a resolver is built from */
  async rulesKey(collection: CollectionItem[]): Promise<string> {
    const mappings = await loadAlbumMappings(this.mappingService);
    const albumMappings = mappings
      .map(m =>
        [
          albumNameKey(m.historyArtist, m.historyAlbum),
          m.collectionId,
          albumNameKey(m.collectionArtist, m.collectionAlbum),
        ].join('\t')
      )
      .sort()
      .join('\n');
    return createHash('sha1')
      .update(
        JSON.stringify([
          albumMappings,
          (await this.trackMappingService?.getFingerprint?.()) ?? '',
          this.artistNameResolver?.getFingerprint?.() ?? '',
          this.lastfmArtistFingerprint(),
          // Names and covers too: a refresh can change them
          collection.map(item => [
            item.id,
            item.release.artist,
            item.release.title,
            item.release.cover_image ?? '',
          ]),
        ])
      )
      .digest('hex');
  }

  /** What each play counts as; see PlayIdentityResolver */
  async resolver(
    collection: CollectionItem[] = []
  ): Promise<PlayIdentityResolver> {
    const key = await this.rulesKey(collection);
    const cached = this.resolvers.get(key);
    if (cached) return cached;
    const resolver = buildPlayIdentityResolver({
      mappingService: this.mappingService,
      trackMappingService: this.trackMappingService,
      resolveArtist: name => this.resolveArtist(name),
      historyStorage: this.historyStorage,
      collection,
      ...(this.lastfmArtistOf && { lastfmArtistOf: this.lastfmArtistOf }),
    });
    // One with and one without the collection are both in common use
    if (this.resolvers.size >= 4) this.resolvers.clear();
    this.resolvers.set(key, resolver);
    resolver.catch(() => this.resolvers.delete(key));
    return resolver;
  }

  /**
   * Every play resolved, by album and by owned record. Built once per
   * history index and rules; an empty model when there is no history.
   */
  async readModel(
    collection: CollectionItem[] = []
  ): Promise<ListeningReadModel> {
    const index = await this.historyStorage.getIndex();
    const rules = await this.rulesKey(collection);
    const key = index
      ? `${index.lastSyncTimestamp}|${index.totalScrobbles}|${rules}`
      : `none|${rules}`;
    const owner = index ?? this.models;
    let byKey = this.models.get(owner);
    if (!byKey) {
      byKey = new Map();
      this.models.set(owner, byKey);
    }
    const cached = byKey.get(key);
    if (cached) return cached;
    byKey.clear();
    const lastfmArtistOf = this.lastfmArtistOf ?? ((name: string) => name);
    const fuzzyKey = (artist: string, album: string) => {
      const k = this.historyStorage.fuzzyNormalizeKey?.(artist, album);
      return typeof k === 'string' ? k : albumNameKey(artist, album);
    };
    const model = this.resolver(collection).then(identity =>
      buildReadModel(identity, index ? listeningEntries(index) : [], {
        fuzzyKey,
        lastfmArtistOf,
      })
    );
    byKey.set(key, model);
    model.catch(() => byKey!.delete(key));
    return model;
  }
}

function buildReadModel(
  identity: PlayIdentityResolver,
  entries: Iterable<{
    artist: string;
    album: string | null;
    entry: AlbumHistoryEntry;
  }>,
  names: {
    fuzzyKey: (artist: string, album: string) => string;
    lastfmArtistOf: (discogsArtist: string) => string;
  }
): ListeningReadModel {
  const albums = new Map<
    string,
    AlbumPlays & { artistPlays: Map<string, number> }
  >();
  const byRecord = new Map<string, ResolvedPlay[]>();

  for (const { artist, album, entry } of entries) {
    const sourceKey = album === null ? null : `${artist}|${album}`;
    for (const play of entry.plays) {
      const target = play.track
        ? identity.play(artist, album, play.track)
        : album === null
          ? null
          : identity.album(artist, album);
      const resolved: ResolvedPlay = {
        timestamp: play.timestamp,
        ...(target && 'trackKey' in target
          ? { track: target.track, trackKey: target.trackKey }
          : play.track
            ? { track: play.track }
            : {}),
        ...(play.track && { sourceTrack: play.track }),
        artist: target?.artist ?? artist,
        album: target?.album ?? null,
        albumKey: target?.albumKey ?? null,
        sourceKey,
        ...(target?.collectionItem && {
          collectionItem: target.collectionItem,
        }),
      };

      if (resolved.albumKey !== null && resolved.album !== null) {
        const row = albums.get(resolved.albumKey) ?? {
          albumKey: resolved.albumKey,
          artist: resolved.artist,
          album: resolved.album,
          playCount: 0,
          lastPlayed: 0,
          plays: [],
          artistPlays: new Map<string, number>(),
        };
        row.playCount++;
        row.lastPlayed = Math.max(row.lastPlayed, play.timestamp);
        row.plays.push(resolved);
        row.artistPlays.set(
          resolved.artist,
          (row.artistPlays.get(resolved.artist) ?? 0) + 1
        );
        row.collectionItem ??= resolved.collectionItem;
        albums.set(resolved.albumKey, row);
      }
      if (resolved.collectionItem) {
        const recordKey = identity.recordKey(resolved.collectionItem);
        const plays = byRecord.get(recordKey) ?? [];
        plays.push(resolved);
        byRecord.set(recordKey, plays);
      }
    }
  }

  // Each album under its most-played artist
  const albumList: AlbumPlays[] = Array.from(albums.values(), row => {
    let artist = row.artist;
    let most = 0;
    for (const [name, count] of row.artistPlays) {
      if (count > most) {
        artist = name;
        most = count;
      }
    }
    return {
      albumKey: row.albumKey,
      artist,
      album: row.album,
      playCount: row.playCount,
      lastPlayed: row.lastPlayed,
      plays: row.plays,
      ...(row.collectionItem && { collectionItem: row.collectionItem }),
    };
  });
  const albumByKey = new Map(albumList.map(a => [a.albumKey, a]));

  // Albums by the spelling-tolerant key of every name they were scrobbled
  // under, built on first use
  let byFuzzyKey: Map<string, Set<string>> | null = null;
  const albumsByFuzzyKey = () => {
    if (byFuzzyKey) return byFuzzyKey;
    byFuzzyKey = new Map();
    for (const album of albumList) {
      for (const play of album.plays) {
        if (!play.sourceKey) continue;
        const [artist, name] = splitSourceKey(play.sourceKey);
        // Only names the album's own plays were scrobbled under: a play a
        // track mapping moved here doesn't make its old album's name this one
        if (identity.album(artist, name).albumKey !== album.albumKey) continue;
        const key = names.fuzzyKey(artist, name);
        const keys = byFuzzyKey.get(key) ?? new Set<string>();
        keys.add(album.albumKey);
        byFuzzyKey.set(key, keys);
      }
    }
    return byFuzzyKey;
  };

  const discogsAlbumPlayList = (
    artist: string,
    title: string
  ): {
    plays: ResolvedPlay[];
    matchType: 'exact' | 'fuzzy' | 'none';
    collectionItem?: CollectionItem;
  } => {
    // An owned record: its plays (every version that resolves to it)
    const owned = identity.album(artist, title).collectionItem;
    if (owned) {
      const plays = byRecord.get(identity.recordKey(owned)) ?? [];
      if (plays.length > 0) {
        return { plays, matchType: 'exact', collectionItem: owned };
      }
    }
    const artists = new Set([
      artist,
      stripDiscogsSuffixes(artist),
      names.lastfmArtistOf(artist),
    ]);
    const matched = new Set<string>();
    for (const name of artists) {
      const { albumKey } = identity.album(name, title);
      if (albumByKey.has(albumKey)) matched.add(albumKey);
    }
    const exact = matched.size > 0;
    if (!exact) {
      for (const name of artists) {
        for (const key of albumsByFuzzyKey().get(names.fuzzyKey(name, title)) ??
          []) {
          matched.add(key);
        }
      }
    }
    const plays = Array.from(matched).flatMap(
      key => albumByKey.get(key)?.plays ?? []
    );
    return {
      plays,
      matchType: plays.length === 0 ? 'none' : exact ? 'exact' : 'fuzzy',
    };
  };

  return {
    identity,
    albums: () => albumList,
    discogsAlbumPlayList,
    discogsAlbumPlays: (artist, title) => {
      const { plays, matchType } = discogsAlbumPlayList(artist, title);
      if (plays.length === 0) {
        return { playCount: 0, lastPlayed: null, matchType: 'none' };
      }
      let lastPlayed = 0;
      for (const play of plays)
        lastPlayed = Math.max(lastPlayed, play.timestamp);
      return { playCount: plays.length, lastPlayed, matchType };
    },
    albumPlays: (artist, album) => {
      const { albumKey, collectionItem } = identity.album(artist, album);
      const own = albumByKey.get(albumKey);
      if (!collectionItem) return own;
      const plays = byRecord.get(identity.recordKey(collectionItem));
      if (!plays || plays.length === 0) return own;
      return {
        albumKey,
        artist: own?.artist ?? artist,
        album: own?.album ?? album,
        playCount: plays.length,
        lastPlayed: Math.max(...plays.map(p => p.timestamp)),
        plays,
        collectionItem,
      };
    },
    recordResolvedPlays: item => byRecord.get(identity.recordKey(item)) ?? [],
    recordPlays: item => {
      const plays = byRecord.get(identity.recordKey(item)) ?? [];
      if (plays.length === 0) {
        return { entry: null, matchType: 'none', matchedKeys: [] };
      }
      const ownKey = albumNameKey(item.release.artist, item.release.title);
      const matchedKeys = new Set<string>();
      let exact = false;
      let lastPlayed = 0;
      for (const play of plays) {
        if (play.sourceKey) {
          matchedKeys.add(play.sourceKey);
          const [artist, album] = splitSourceKey(play.sourceKey);
          if (identity.isOwnName(item, artist, album, ownKey)) exact = true;
        }
        lastPlayed = Math.max(lastPlayed, play.timestamp);
      }
      return {
        entry: {
          playCount: plays.length,
          lastPlayed,
          plays: plays.map(p => ({
            timestamp: p.timestamp,
            ...(p.track && { track: p.track }),
          })),
        },
        matchType: exact ? 'exact' : 'fuzzy',
        matchedKeys: Array.from(matchedKeys),
      };
    },
  };
}

function splitSourceKey(key: string): [string, string] {
  const separator = key.indexOf('|');
  return [key.slice(0, separator), key.slice(separator + 1)];
}
