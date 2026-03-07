/**
 * Service for logging and querying recommendation history.
 *
 * Used by the diversity scorer to avoid repeatedly recommending the same
 * records. Persists to embeddings/recommendation-log.json.
 * Uses regular writeJSON (not backup) — this is non-critical operational data.
 */

import {
  RecommendationLogEntry,
  RecommendationLogStore,
} from '../../shared/types';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

const log = createLogger('RecommendationLogService');

const DATA_FILE = 'embeddings/recommendation-log.json';
const SCHEMA_VERSION = 1;

const DEFAULT_STORE: RecommendationLogStore = {
  schemaVersion: SCHEMA_VERSION,
  entries: [],
};

export class RecommendationLogService {
  private storage: FileStorage;

  constructor(storage: FileStorage) {
    this.storage = storage;
  }

  private async getStore(): Promise<RecommendationLogStore> {
    const data = await this.storage.readJSON<RecommendationLogStore>(DATA_FILE);
    if (!data) {
      return { ...DEFAULT_STORE, entries: [] };
    }
    return data;
  }

  async logRecommendation(entry: RecommendationLogEntry): Promise<void> {
    const store = await this.getStore();
    store.entries.push(entry);
    await this.storage.writeJSON(DATA_FILE, store);
    log.debug(`Logged recommendation for release ${entry.discogsReleaseId}`);
  }

  async logBatch(entries: RecommendationLogEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const store = await this.getStore();
    store.entries.push(...entries);
    await this.storage.writeJSON(DATA_FILE, store);
    log.info(`Logged batch of ${entries.length} recommendations`);
  }

  async getRecentRecommendations(
    windowDays: number
  ): Promise<RecommendationLogEntry[]> {
    const store = await this.getStore();
    const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    return store.entries.filter(e => e.recommendedAt >= cutoff);
  }

  async markAsSelected(releaseId: number): Promise<void> {
    const store = await this.getStore();
    let updated = false;

    for (const entry of store.entries) {
      if (entry.discogsReleaseId === releaseId && !entry.wasSelected) {
        entry.wasSelected = true;
        updated = true;
      }
    }

    if (updated) {
      await this.storage.writeJSON(DATA_FILE, store);
      log.debug(
        `Marked release ${releaseId} as selected in recommendation log`
      );
    }
  }
}
