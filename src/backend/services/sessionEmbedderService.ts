/**
 * Embeds and caches listening session profiles.
 *
 * A session profile is a short text summary of recent scrobble activity.
 * This service avoids re-embedding the same session text repeatedly by
 * caching the result for a configurable window (default 30 minutes).
 */

import { ListeningSessionEntry } from '../../shared/types';
import { createLogger } from '../utils/logger';
import { vectorToBase64 } from '../utils/vectorSerialization';

import { ListeningSessionStorageService } from './listeningSessionStorageService';
import { OllamaEmbedderService } from './ollamaEmbedderService';

const log = createLogger('SessionEmbedderService');

const DEFAULT_MAX_AGE_MINUTES = 30;

export class SessionEmbedderService {
  private ollamaEmbedderService: OllamaEmbedderService;
  private listeningSessionStorageService: ListeningSessionStorageService;

  constructor(
    ollamaEmbedderService: OllamaEmbedderService,
    listeningSessionStorageService: ListeningSessionStorageService
  ) {
    this.ollamaEmbedderService = ollamaEmbedderService;
    this.listeningSessionStorageService = listeningSessionStorageService;
  }

  /**
   * Embeds the given session profile text and persists the result.
   *
   * Always creates a new session entry regardless of existing entries.
   * Throws if the profile text is empty or Ollama is unavailable.
   */
  async embedSession(
    sessionProfile: string,
    windowHours: number
  ): Promise<ListeningSessionEntry> {
    if (!sessionProfile || sessionProfile.trim().length === 0) {
      throw new Error('Cannot embed an empty session profile');
    }

    log.info(
      `Embedding session profile (window: ${windowHours}h, ${sessionProfile.length} chars)`
    );

    const vec = await this.ollamaEmbedderService.embed(sessionProfile);

    if (vec.every(v => v === 0)) {
      throw new Error('Ollama returned a zero vector for the session profile');
    }

    const entry: ListeningSessionEntry = {
      sessionTextProfile: sessionProfile,
      sessionEmbedding: vectorToBase64(vec),
      createdAt: Date.now(),
      scrobbleWindowHours: windowHours,
    };

    await this.listeningSessionStorageService.saveSession(entry);
    log.info(`Session embedding stored (createdAt: ${entry.createdAt})`);

    return entry;
  }

  /**
   * Returns a recent cached session embedding if one exists within
   * `maxAgeMinutes` and was created for the same window size, otherwise
   * generates and stores a new one.
   *
   * This avoids hitting Ollama on every recommendation request when the
   * listening history hasn't changed significantly.
   */
  async getOrCreateSessionEmbedding(
    sessionProfile: string,
    windowHours: number,
    maxAgeMinutes: number = DEFAULT_MAX_AGE_MINUTES
  ): Promise<ListeningSessionEntry> {
    if (!sessionProfile || sessionProfile.trim().length === 0) {
      throw new Error(
        'Cannot get or create session embedding: session profile is empty (no recent scrobbles?)'
      );
    }

    const maxAgeMs = maxAgeMinutes * 60 * 1000;
    const cutoff = Date.now() - maxAgeMs;

    const latest = await this.listeningSessionStorageService.getLatestSession();

    if (
      latest &&
      latest.createdAt >= cutoff &&
      latest.scrobbleWindowHours === windowHours &&
      latest.sessionTextProfile === sessionProfile
    ) {
      log.debug(
        `Returning cached session embedding (age: ${Math.round((Date.now() - latest.createdAt) / 1000)}s)`
      );
      return latest;
    }

    return this.embedSession(sessionProfile, windowHours);
  }

  /**
   * Returns the most recently stored session embedding, or null if none exists.
   */
  async getLatestSessionEmbedding(): Promise<ListeningSessionEntry | null> {
    return this.listeningSessionStorageService.getLatestSession();
  }
}
