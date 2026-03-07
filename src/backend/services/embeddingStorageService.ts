/**
 * Storage service for record embedding data.
 *
 * Persists vector embeddings as base64-encoded Float32Arrays inside a
 * versioned JSON store under embeddings/record-embeddings.json.
 * Uses writeJSONWithBackup() because embeddings are expensive to regenerate.
 */

import {
  EmbeddingStatus,
  RecordEmbeddingEntry,
  RecordEmbeddingStore,
} from '../../shared/types';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

const log = createLogger('EmbeddingStorageService');

const DATA_FILE = 'embeddings/record-embeddings.json';
const SCHEMA_VERSION = 1;

const DEFAULT_STORE: RecordEmbeddingStore = {
  schemaVersion: SCHEMA_VERSION,
  embeddings: {},
};

export class EmbeddingStorageService {
  private storage: FileStorage;

  constructor(storage: FileStorage) {
    this.storage = storage;
  }

  async getStore(): Promise<RecordEmbeddingStore> {
    const data = await this.storage.readJSON<RecordEmbeddingStore>(DATA_FILE);
    if (!data) {
      return { ...DEFAULT_STORE };
    }
    return data;
  }

  async getEmbedding(releaseId: number): Promise<RecordEmbeddingEntry | null> {
    const store = await this.getStore();
    return store.embeddings[String(releaseId)] ?? null;
  }

  async setEmbedding(entry: RecordEmbeddingEntry): Promise<void> {
    const store = await this.getStore();
    store.embeddings[String(entry.discogsReleaseId)] = entry;
    await this.storage.writeJSONWithBackup(DATA_FILE, store);
    log.debug(`Saved embedding for release ${entry.discogsReleaseId}`);
  }

  async bulkSetEmbeddings(entries: RecordEmbeddingEntry[]): Promise<void> {
    const store = await this.getStore();
    for (const entry of entries) {
      store.embeddings[String(entry.discogsReleaseId)] = entry;
    }
    await this.storage.writeJSONWithBackup(DATA_FILE, store);
    log.info(`Saved ${entries.length} embeddings in bulk`);
  }

  async deleteEmbedding(releaseId: number): Promise<void> {
    const store = await this.getStore();
    const key = String(releaseId);
    if (key in store.embeddings) {
      delete store.embeddings[key];
      await this.storage.writeJSONWithBackup(DATA_FILE, store);
      log.debug(`Deleted embedding for release ${releaseId}`);
    }
  }

  async getAllEmbeddings(): Promise<RecordEmbeddingEntry[]> {
    const store = await this.getStore();
    return Object.values(store.embeddings);
  }

  async getStats(): Promise<EmbeddingStatus> {
    const store = await this.getStore();
    const entries = Object.values(store.embeddings);
    const totalRecords = entries.length;
    const now = Date.now();
    const msPerDay = 24 * 60 * 60 * 1000;

    let lastRebuildAt: number | null = null;
    let totalAgeMs = 0;

    for (const entry of entries) {
      if (lastRebuildAt === null || entry.lastEnrichedAt > lastRebuildAt) {
        lastRebuildAt = entry.lastEnrichedAt;
      }
      totalAgeMs += now - entry.lastEnrichedAt;
    }

    const averageEmbeddingAge =
      totalRecords > 0 ? totalAgeMs / totalRecords / msPerDay : null;

    // Stale = older than 30 days by default
    const staleThresholdMs = 30 * msPerDay;
    const staleRecords = entries.filter(
      e => now - e.lastEnrichedAt > staleThresholdMs
    ).length;

    return {
      totalRecords,
      embeddedRecords: totalRecords,
      lastRebuildAt,
      averageEmbeddingAge,
      staleRecords,
      isRebuilding: false,
    };
  }
}
