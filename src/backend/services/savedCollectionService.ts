/**
 * Saved Collection Service - manages named track collections for offline listening.
 *
 * Collections store tracks (e.g., for an OpenSwim Pro playlist) with optional
 * CSV import and Last.fm history validation.
 */

import crypto from 'crypto';

import {
  SavedCollection,
  SavedCollectionTrack,
  SavedCollectionsStore,
} from '../../shared/types';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

import { ScrobbleHistoryStorage } from './scrobbleHistoryStorage';

/**
 * Parse a track duration string into seconds.
 * Supports "MM:SS" format and raw seconds (string or number).
 * Returns 0 for unparseable values.
 */
export function parseTrackDuration(duration: string | number): number {
  if (typeof duration === 'number') return duration;
  if (typeof duration === 'string') {
    const parts = duration.split(':');
    if (parts.length === 2) {
      return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }
    const parsed = parseInt(duration);
    if (!isNaN(parsed)) return parsed;
  }
  return 0;
}

export class SavedCollectionService {
  private fileStorage: FileStorage;
  private logger = createLogger('SavedCollectionService');

  private readonly SAVED_COLLECTIONS_FILE =
    'collections/saved-collections.json';

  // In-memory cache for performance
  private store: SavedCollectionsStore | null = null;

  constructor(fileStorage: FileStorage) {
    this.fileStorage = fileStorage;
  }

  /**
   * Load store from file, return empty store if not exists
   */
  private async loadStore(): Promise<SavedCollectionsStore> {
    if (this.store) {
      return this.store;
    }

    try {
      const data = await this.fileStorage.readJSON<SavedCollectionsStore>(
        this.SAVED_COLLECTIONS_FILE
      );
      if (data && data.schemaVersion === 1) {
        this.store = data;
        return data;
      }
    } catch {
      this.logger.debug('No saved collections file found, creating new store');
    }

    const emptyStore: SavedCollectionsStore = {
      schemaVersion: 1,
      collections: [],
    };
    this.store = emptyStore;
    return emptyStore;
  }

  /**
   * Save store to file with backup
   */
  private async saveStore(store: SavedCollectionsStore): Promise<void> {
    this.store = store;
    await this.fileStorage.writeJSONWithBackup(
      this.SAVED_COLLECTIONS_FILE,
      store
    );
  }

  /**
   * Get all saved collections
   */
  async getCollections(): Promise<SavedCollection[]> {
    const store = await this.loadStore();
    return store.collections;
  }

  /**
   * Get a single collection by ID
   */
  async getCollection(id: string): Promise<SavedCollection | null> {
    const store = await this.loadStore();
    return store.collections.find(c => c.id === id) || null;
  }

  /**
   * Create a new collection
   */
  async createCollection(
    name: string,
    description?: string
  ): Promise<SavedCollection> {
    const store = await this.loadStore();
    const now = Date.now();

    const collection: SavedCollection = {
      id: crypto.randomUUID(),
      name,
      description,
      tracks: [],
      createdAt: now,
      updatedAt: now,
    };

    store.collections.push(collection);
    await this.saveStore(store);

    this.logger.info(`Created collection: ${name}`);
    return collection;
  }

  /**
   * Update collection metadata (name, description)
   */
  async updateCollection(
    id: string,
    name?: string,
    description?: string
  ): Promise<SavedCollection | null> {
    const store = await this.loadStore();
    const index = store.collections.findIndex(c => c.id === id);

    if (index === -1) {
      return null;
    }

    const existing = store.collections[index];
    store.collections[index] = {
      ...existing,
      name: name ?? existing.name,
      description: description ?? existing.description,
      updatedAt: Date.now(),
    };

    await this.saveStore(store);
    this.logger.info(`Updated collection: ${id}`);
    return store.collections[index];
  }

  /**
   * Delete a collection
   */
  async deleteCollection(id: string): Promise<boolean> {
    const store = await this.loadStore();
    const initialLength = store.collections.length;
    store.collections = store.collections.filter(c => c.id !== id);

    if (store.collections.length < initialLength) {
      await this.saveStore(store);
      this.logger.info(`Deleted collection: ${id}`);
      return true;
    }

    return false;
  }

  /**
   * Add a track to a collection, auto-setting position
   */
  async addTrack(
    collectionId: string,
    track: {
      artist: string;
      track: string;
      album?: string;
      duration?: number;
      lastfmMatch?: boolean;
    }
  ): Promise<SavedCollectionTrack | null> {
    const store = await this.loadStore();
    const collection = store.collections.find(c => c.id === collectionId);

    if (!collection) {
      return null;
    }

    const maxPosition =
      collection.tracks.length > 0
        ? Math.max(...collection.tracks.map(t => t.position))
        : 0;

    const newTrack: SavedCollectionTrack = {
      artist: track.artist,
      track: track.track,
      album: track.album,
      duration: track.duration ?? 0,
      position: maxPosition + 1,
      lastfmMatch: track.lastfmMatch ?? false,
    };

    collection.tracks.push(newTrack);
    collection.updatedAt = Date.now();
    await this.saveStore(store);

    this.logger.info(
      `Added track to collection ${collectionId}: ${track.artist} - ${track.track}`
    );
    return newTrack;
  }

  /**
   * Remove a track by position, reindex remaining tracks
   */
  async removeTrack(collectionId: string, position: number): Promise<boolean> {
    const store = await this.loadStore();
    const collection = store.collections.find(c => c.id === collectionId);

    if (!collection) {
      return false;
    }

    const initialLength = collection.tracks.length;
    collection.tracks = collection.tracks.filter(t => t.position !== position);

    if (collection.tracks.length === initialLength) {
      return false;
    }

    // Reindex positions sequentially
    collection.tracks
      .sort((a, b) => a.position - b.position)
      .forEach((t, i) => {
        t.position = i + 1;
      });

    collection.updatedAt = Date.now();
    await this.saveStore(store);

    this.logger.info(
      `Removed track at position ${position} from collection ${collectionId}`
    );
    return true;
  }

  /**
   * Replace a track at a specific position with new data.
   * Keeps the same position — useful for remapping unmatched tracks.
   */
  async replaceTrack(
    collectionId: string,
    position: number,
    track: {
      artist: string;
      track: string;
      album?: string;
      duration?: number;
      lastfmMatch?: boolean;
    }
  ): Promise<SavedCollectionTrack | null> {
    const store = await this.loadStore();
    const collection = store.collections.find(c => c.id === collectionId);

    if (!collection) {
      return null;
    }

    const existingTrack = collection.tracks.find(t => t.position === position);
    if (!existingTrack) {
      return null;
    }

    existingTrack.artist = track.artist;
    existingTrack.track = track.track;
    existingTrack.album = track.album;
    existingTrack.duration = track.duration ?? existingTrack.duration;
    existingTrack.lastfmMatch = track.lastfmMatch ?? true;

    collection.updatedAt = Date.now();
    await this.saveStore(store);

    this.logger.info(
      `Replaced track at position ${position} in collection ${collectionId}: ${track.artist} - ${track.track}`
    );
    return existingTrack;
  }

  /**
   * Import tracks from CSV content into a collection.
   * Format: artist,track,album,duration (duration column optional).
   * Validates each track against scrobble history using fuzzy matching.
   */
  async importCsv(
    collectionId: string,
    csvContent: string,
    historyStorage: ScrobbleHistoryStorage
  ): Promise<{
    imported: number;
    errors: string[];
    unmatched: SavedCollectionTrack[];
  }> {
    const store = await this.loadStore();
    const collection = store.collections.find(c => c.id === collectionId);

    if (!collection) {
      return { imported: 0, errors: ['Collection not found'], unmatched: [] };
    }

    const lines = csvContent.split('\n');
    const errors: string[] = [];
    const unmatched: SavedCollectionTrack[] = [];
    let imported = 0;

    // Determine starting position
    const maxPosition =
      collection.tracks.length > 0
        ? Math.max(...collection.tracks.map(t => t.position))
        : 0;
    let nextPosition = maxPosition + 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip empty lines
      if (!line) continue;

      // Parse CSV line (handle quoted fields)
      const fields = this.parseCsvLine(line);

      if (fields.length < 2) {
        errors.push(`Line ${i + 1}: insufficient columns (need artist,track)`);
        continue;
      }

      const artist = fields[0].trim();
      const trackName = fields[1].trim();
      const album = fields.length > 2 ? fields[2].trim() : undefined;
      const durationRaw = fields.length > 3 ? fields[3].trim() : '';

      if (!artist || !trackName) {
        errors.push(`Line ${i + 1}: missing artist or track name`);
        continue;
      }

      const duration = durationRaw ? parseTrackDuration(durationRaw) : 0;

      // Validate against history using fuzzy matching
      let lastfmMatch = false;
      try {
        const lookupResult = await historyStorage.getAlbumHistoryFuzzy(
          artist,
          album || trackName
        );
        lastfmMatch = lookupResult.entry !== null;
      } catch {
        // If lookup fails, mark as unmatched
        lastfmMatch = false;
      }

      const newTrack: SavedCollectionTrack = {
        artist,
        track: trackName,
        album: album || undefined,
        duration,
        position: nextPosition,
        lastfmMatch,
      };

      collection.tracks.push(newTrack);
      nextPosition++;
      imported++;

      if (!lastfmMatch) {
        unmatched.push(newTrack);
      }
    }

    if (imported > 0) {
      collection.updatedAt = Date.now();
      await this.saveStore(store);
    }

    this.logger.info(
      `CSV import to collection ${collectionId}: ${imported} imported, ${errors.length} errors, ${unmatched.length} unmatched`
    );

    return { imported, errors, unmatched };
  }

  /**
   * Parse a CSV line handling quoted fields.
   * Supports fields wrapped in double quotes with escaped quotes ("").
   */
  private parseCsvLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
      const char = line[i];

      if (inQuotes) {
        if (char === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            // Escaped quote
            current += '"';
            i += 2;
          } else {
            // End of quoted field
            inQuotes = false;
            i++;
          }
        } else {
          current += char;
          i++;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
          i++;
        } else if (char === ',') {
          fields.push(current);
          current = '';
          i++;
        } else {
          current += char;
          i++;
        }
      }
    }

    fields.push(current);
    return fields;
  }

  /**
   * Clear the in-memory cache (useful for testing)
   */
  clearCache(): void {
    this.store = null;
  }
}
