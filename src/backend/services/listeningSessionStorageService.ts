/**
 * Storage service for listening session snapshots.
 *
 * Each session snapshot contains the text profile and embedding for a window
 * of recent scrobble activity. Used by the recommendation engine to build the
 * "current taste" vector.
 *
 * Persists to embeddings/listening-sessions.json.
 * Uses writeJSONWithBackup() since session data informs recommendation quality.
 */

import {
  ListeningSessionEntry,
  ListeningSessionStore,
} from '../../shared/types';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

const log = createLogger('ListeningSessionStorageService');

const DATA_FILE = 'embeddings/listening-sessions.json';
const SCHEMA_VERSION = 1;

const DEFAULT_STORE: ListeningSessionStore = {
  schemaVersion: SCHEMA_VERSION,
  sessions: [],
};

export class ListeningSessionStorageService {
  private storage: FileStorage;

  constructor(storage: FileStorage) {
    this.storage = storage;
  }

  private async getStore(): Promise<ListeningSessionStore> {
    const data = await this.storage.readJSON<ListeningSessionStore>(DATA_FILE);
    if (!data) {
      return { ...DEFAULT_STORE, sessions: [] };
    }
    return data;
  }

  async saveSession(entry: ListeningSessionEntry): Promise<void> {
    const store = await this.getStore();
    store.sessions.push(entry);
    await this.storage.writeJSONWithBackup(DATA_FILE, store);
    log.info(
      `Saved listening session (window: ${entry.scrobbleWindowHours}h, created: ${new Date(entry.createdAt).toISOString()})`
    );
  }

  async getLatestSession(): Promise<ListeningSessionEntry | null> {
    const store = await this.getStore();
    if (store.sessions.length === 0) return null;

    return store.sessions.reduce((latest, session) =>
      session.createdAt > latest.createdAt ? session : latest
    );
  }

  async getSessions(limit: number): Promise<ListeningSessionEntry[]> {
    const store = await this.getStore();
    return [...store.sessions]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }
}
