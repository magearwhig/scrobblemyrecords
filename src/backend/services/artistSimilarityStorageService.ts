/**
 * Storage service for artist similarity data from Last.fm.
 *
 * Caches artist.getSimilar results under embeddings/artist-similarity.json.
 * Uses writeJSONWithBackup() since this data is expensive to re-fetch.
 */

import {
  ArtistSimilarityEntry,
  ArtistSimilarityStore,
} from '../../shared/types';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

const log = createLogger('ArtistSimilarityStorageService');

const DATA_FILE = 'embeddings/artist-similarity.json';
const SCHEMA_VERSION = 1;

const DEFAULT_STORE: ArtistSimilarityStore = {
  schemaVersion: SCHEMA_VERSION,
  similarities: {},
};

export class ArtistSimilarityStorageService {
  private storage: FileStorage;

  constructor(storage: FileStorage) {
    this.storage = storage;
  }

  private async getStore(): Promise<ArtistSimilarityStore> {
    const data = await this.storage.readJSON<ArtistSimilarityStore>(DATA_FILE);
    if (!data) {
      return { ...DEFAULT_STORE, similarities: {} };
    }
    return data;
  }

  async getSimilarArtists(
    artistName: string
  ): Promise<ArtistSimilarityEntry[]> {
    const store = await this.getStore();
    return store.similarities[artistName] ?? [];
  }

  /**
   * Returns the full similarity map in a single file read.
   * Use this when scoring many records to avoid repeated per-record I/O.
   */
  async getAllSimilarities(): Promise<Record<string, ArtistSimilarityEntry[]>> {
    const store = await this.getStore();
    return store.similarities;
  }

  async setSimilarArtists(
    artistName: string,
    entries: ArtistSimilarityEntry[]
  ): Promise<void> {
    const store = await this.getStore();
    store.similarities[artistName] = entries;
    await this.storage.writeJSONWithBackup(DATA_FILE, store);
    log.debug(`Saved ${entries.length} similar artists for "${artistName}"`);
  }

  /**
   * Returns true if the artist's similarity data is older than maxAgeDays.
   * Also returns true if no data exists at all.
   */
  async isStale(artistName: string, maxAgeDays: number): Promise<boolean> {
    const entries = await this.getSimilarArtists(artistName);
    if (entries.length === 0) return true;

    const mostRecent = Math.max(...entries.map(e => e.lastFetchedAt));
    if (!isFinite(mostRecent) || mostRecent <= 0) {
      // Corrupted timestamps — treat as stale
      return true;
    }
    const ageMs = Date.now() - mostRecent;
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    return ageMs > maxAgeMs;
  }
}
