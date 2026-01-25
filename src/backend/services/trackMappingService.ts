import { TrackMapping, TrackMappingsStore } from '../../shared/types';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

const TRACK_MAPPINGS_FILE = 'mappings/track-mappings.json';

/**
 * Service for managing manual track mappings.
 * Used when automatic track normalization fails to match tracks in Forgotten Favorites.
 *
 * Example use case:
 * - Last.fm: "Request Denied" by "El-p" on "Cancer 4 Cure"
 * - Local cache: "Request Denied [Explicit]" by "El-P" on "Cancer 4 Cure [Explicit]"
 *
 * When the standard normalization doesn't match these, users can create a manual mapping.
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

  /**
   * Create a normalized key for track lookup.
   * Key format: "artist|album|track" all lowercase and trimmed.
   */
  private trackKey(artist: string, album: string, track: string): string {
    return `${artist.toLowerCase().trim()}|${album.toLowerCase().trim()}|${track.toLowerCase().trim()}`;
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

    await this.fileStorage.writeJSON(TRACK_MAPPINGS_FILE, store);
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
   * Clear the in-memory cache to force reload on next access.
   * Useful for testing or when mappings may have changed externally.
   */
  clearCache(): void {
    this.trackMappings.clear();
    this.loaded = false;
    this.logger.debug('Track mappings cache cleared');
  }
}
