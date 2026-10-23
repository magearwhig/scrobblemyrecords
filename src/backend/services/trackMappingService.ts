import { createHash } from 'crypto';

import {
  AlbumMapping,
  TrackMapping,
  TrackMappingsStore,
} from '../../shared/types';
import { createAlbumCanonicalizer } from '../../shared/utils/albumMapping';
import { trackMatchKey } from '../../shared/utils/trackNormalization';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

const TRACK_MAPPINGS_FILE = 'mappings/track-mappings.json';

/** Finds the mapping for one scrobbled track, or null */
export type TrackMappingLookup = (
  artist: string,
  album: string,
  track: string
) => TrackMapping | null;

/**
 * Key for one album in track mappings: artist and album through
 * `trackMatchKey`, so case, punctuation, "(Deluxe Edition)" and Discogs "(2)"
 * suffixes don't matter, and a merge saved from an album page opened by a
 * slightly different name is found under the history album's own name.
 */
export function trackMappingAlbumKey(artist: string, album: string): string {
  return `${trackMatchKey(artist)}|${trackMatchKey(album)}`;
}

/** Where one scrobbled track is counted, and the mapping that put it there */
export type TrackMapper = (
  artist: string,
  album: string | null,
  track: string
) => {
  artist: string;
  album: string | null;
  track: string;
  mapping: TrackMapping | null;
};

/**
 * Track mappings for a loop over plays. Looks a scrobble up under its own
 * album, then under the album an album mapping merges it into. A mapping
 * within one album (an album page merge) only renames the track, so the play
 * stays on its own album with that album's other plays; a mapping to another
 * album (from Forgotten Favorites) moves it there. Unresolved plays (album
 * null) and a missing service map nothing.
 */
export async function createTrackMapper(
  service: Pick<TrackMappingService, 'createLookup'> | null | undefined,
  albumMappings: AlbumMapping[]
): Promise<TrackMapper> {
  const lookup = await service?.createLookup?.();
  if (!lookup) {
    return (artist, album, track) => ({ artist, album, track, mapping: null });
  }
  const canonicalize = createAlbumCanonicalizer(albumMappings);
  return (artist, album, track) => {
    if (album === null) return { artist, album, track, mapping: null };
    let mapping = lookup(artist, album, track);
    if (!mapping) {
      const canonical = canonicalize(artist, album);
      if (canonical.mapping) {
        mapping = lookup(canonical.artist, canonical.album, track);
      }
    }
    if (!mapping) return { artist, album, track, mapping: null };
    const sameAlbum =
      trackMappingAlbumKey(mapping.historyArtist, mapping.historyAlbum) ===
      trackMappingAlbumKey(mapping.cacheArtist, mapping.cacheAlbum);
    return sameAlbum
      ? { artist, album, track: mapping.cacheTrack, mapping }
      : {
          artist: mapping.cacheArtist,
          album: mapping.cacheAlbum,
          track: mapping.cacheTrack,
          mapping,
        };
  };
}

/**
 * Service for managing manual track mappings: a scrobbled track (history
 * artist/album/track) is counted as another (the cache side). Used when
 * automatic track matching (`trackMatchKey`) can't tell two names are one
 * song. Created from Forgotten Favorites, or by merging tracks on the album
 * page, and applied wherever tracks are counted.
 *
 * Example use case:
 * - Last.fm: "Request Denied" by "El-p" on "Cancer 4 Cure"
 * - Local cache: "Request Denied [Explicit]" by "El-P" on "Cancer 4 Cure [Explicit]"
 */
export class TrackMappingService {
  private fileStorage: FileStorage;
  private logger = createLogger('TrackMappingService');

  // Cached mappings for fast lookup
  private trackMappings: Map<string, TrackMapping> = new Map();
  private loaded = false;

  constructor(fileStorage: FileStorage) {
    this.fileStorage = fileStorage;
  }

  private albumKey(artist: string, album: string): string {
    return trackMappingAlbumKey(artist, album);
  }

  /**
   * Key for track lookup: the album key plus `trackMatchKey(track)`, so a
   * mapping also covers the spellings automatic matching already treats as
   * the same track.
   */
  private trackKey(artist: string, album: string, track: string): string {
    return `${this.albumKey(artist, album)}|${trackMatchKey(track)}`;
  }

  /**
   * Load mappings from disk.
   * Handles both legacy (raw array) and versioned store formats.
   */
  async loadMappings(): Promise<void> {
    if (this.loaded) return;

    try {
      const rawData = await this.fileStorage.readJSON<
        TrackMappingsStore | TrackMapping[]
      >(TRACK_MAPPINGS_FILE);
      if (rawData) {
        // Handle both legacy array format and new versioned format
        const mappings = Array.isArray(rawData)
          ? rawData
          : (rawData as TrackMappingsStore).mappings || [];
        for (const mapping of mappings) {
          const key = this.trackKey(
            mapping.historyArtist,
            mapping.historyAlbum,
            mapping.historyTrack
          );
          this.trackMappings.set(key, mapping);
        }
        this.logger.info(`Loaded ${mappings.length} track mappings`);
      }
    } catch {
      this.logger.debug('No track mappings file found');
    }

    this.loaded = true;
  }

  /**
   * Save mappings to disk using versioned store format.
   */
  private async saveMappings(): Promise<void> {
    const store: TrackMappingsStore = {
      schemaVersion: 1,
      mappings: Array.from(this.trackMappings.values()),
    };

    await this.fileStorage.writeJSONWithBackup(TRACK_MAPPINGS_FILE, store);
  }

  /**
   * Add or update a track mapping.
   */
  async addTrackMapping(
    mapping: Omit<TrackMapping, 'createdAt'>
  ): Promise<void> {
    await this.loadMappings();

    const key = this.trackKey(
      mapping.historyArtist,
      mapping.historyAlbum,
      mapping.historyTrack
    );
    const fullMapping: TrackMapping = {
      ...mapping,
      createdAt: Date.now(),
    };

    this.trackMappings.set(key, fullMapping);
    await this.saveMappings();

    this.logger.info(
      `Added track mapping: "${mapping.historyArtist}|${mapping.historyAlbum}|${mapping.historyTrack}" -> "${mapping.cacheArtist}|${mapping.cacheAlbum}|${mapping.cacheTrack}"`
    );
  }

  /**
   * Remove a track mapping.
   */
  async removeTrackMapping(
    historyArtist: string,
    historyAlbum: string,
    historyTrack: string
  ): Promise<boolean> {
    await this.loadMappings();

    const key = this.trackKey(historyArtist, historyAlbum, historyTrack);
    const removed = this.trackMappings.delete(key);

    if (removed) {
      await this.saveMappings();
      this.logger.info(
        `Removed track mapping: "${historyArtist}|${historyAlbum}|${historyTrack}"`
      );
    }

    return removed;
  }

  /**
   * Get track mapping if it exists.
   */
  async getTrackMapping(
    historyArtist: string,
    historyAlbum: string,
    historyTrack: string
  ): Promise<TrackMapping | null> {
    await this.loadMappings();

    const key = this.trackKey(historyArtist, historyAlbum, historyTrack);
    return this.trackMappings.get(key) || null;
  }

  /**
   * Check if a track has a manual mapping.
   */
  async hasTrackMapping(
    historyArtist: string,
    historyAlbum: string,
    historyTrack: string
  ): Promise<boolean> {
    const mapping = await this.getTrackMapping(
      historyArtist,
      historyAlbum,
      historyTrack
    );
    return mapping !== null;
  }

  /**
   * Get all track mappings.
   */
  async getAllTrackMappings(): Promise<TrackMapping[]> {
    await this.loadMappings();
    return Array.from(this.trackMappings.values());
  }

  /**
   * Get the count of track mappings.
   */
  async getTrackMappingCount(): Promise<number> {
    await this.loadMappings();
    return this.trackMappings.size;
  }

  /**
   * Apply mapping to get the cache track info.
   * Returns the mapped values if a mapping exists, otherwise returns the input values.
   */
  async applyMapping(
    historyArtist: string,
    historyAlbum: string,
    historyTrack: string
  ): Promise<{ artist: string; album: string; track: string }> {
    const mapping = await this.getTrackMapping(
      historyArtist,
      historyAlbum,
      historyTrack
    );

    if (mapping) {
      return {
        artist: mapping.cacheArtist,
        album: mapping.cacheAlbum,
        track: mapping.cacheTrack,
      };
    }

    return {
      artist: historyArtist,
      album: historyAlbum,
      track: historyTrack,
    };
  }

  /**
   * A synchronous lookup over the loaded mappings, for loops over every play
   */
  async createLookup(): Promise<TrackMappingLookup> {
    await this.loadMappings();
    const mappings = this.trackMappings;
    return (artist, album, track) =>
      mappings.get(this.trackKey(artist, album, track)) ?? null;
  }

  /** Mappings of tracks scrobbled on one album */
  async getMappingsForAlbum(
    artist: string,
    album: string
  ): Promise<TrackMapping[]> {
    await this.loadMappings();
    const albumKey = this.albumKey(artist, album);
    return Array.from(this.trackMappings.values()).filter(
      m => this.albumKey(m.historyArtist, m.historyAlbum) === albumKey
    );
  }

  /**
   * Count several tracks of one album as one song, named `canonical`. Maps
   * every other spelling to it, repoints mappings (from any album) that led
   * to any of them on this album, and drops a mapping of `canonical` itself,
   * so mappings stay one hop and never loop. Returns the number of tracks
   * mapped.
   */
  async mergeTracks(
    artist: string,
    album: string,
    tracks: string[],
    canonical: string
  ): Promise<number> {
    await this.loadMappings();
    const albumKey = this.albumKey(artist, album);
    const canonicalKey = trackMatchKey(canonical);
    const mergedKeys = new Set(tracks.map(trackMatchKey));
    mergedKeys.add(canonicalKey);
    const now = Date.now();

    this.trackMappings.delete(this.trackKey(artist, album, canonical));
    for (const mapping of this.trackMappings.values()) {
      if (
        this.albumKey(mapping.cacheArtist, mapping.cacheAlbum) === albumKey &&
        mergedKeys.has(trackMatchKey(mapping.cacheTrack))
      ) {
        mapping.cacheTrack = canonical;
      }
    }

    let mapped = 0;
    for (const track of tracks) {
      if (trackMatchKey(track) === canonicalKey) continue;
      this.trackMappings.set(this.trackKey(artist, album, track), {
        historyArtist: artist,
        historyAlbum: album,
        historyTrack: track,
        cacheArtist: artist,
        cacheAlbum: album,
        cacheTrack: canonical,
        createdAt: now,
      });
      mapped++;
    }

    await this.saveMappings();
    this.logger.info(
      `Merged ${mapped} track names into "${artist}|${album}|${canonical}"`
    );
    return mapped;
  }

  /** Identifies the current mappings, for stats caches; '' when there are none */
  async getFingerprint(): Promise<string> {
    await this.loadMappings();
    if (this.trackMappings.size === 0) return '';
    const lines = Array.from(this.trackMappings.entries())
      .map(([key, m]) =>
        [key, m.cacheArtist, m.cacheAlbum, m.cacheTrack].join('\t')
      )
      .sort();
    return createHash('sha1').update(lines.join('\n')).digest('hex');
  }

  /**
   * Clear the in-memory cache to force reload on next access.
   * Useful for testing or when mappings may have changed externally.
   */
  clearCache(): void {
    this.trackMappings.clear();
    this.loaded = false;
    this.logger.debug('Track mappings cache cleared');
  }
}
