/**
 * Orchestrates the full embedding pipeline for the Discogs collection.
 *
 * Handles full rebuilds, single-record indexing, and incremental indexing
 * (skipping records whose text profiles haven't changed).
 *
 * Progress is reported via an optional callback — callers can use this to
 * drive SSE streams or polling status endpoints.
 */

import { DiscogsRelease, RecordEmbeddingEntry } from '../../shared/types';
import { createLogger } from '../utils/logger';
import { vectorToBase64 } from '../utils/vectorSerialization';

import { EmbeddingStorageService } from './embeddingStorageService';
import { OllamaEmbedderService } from './ollamaEmbedderService';

const log = createLogger('CollectionIndexerService');

const EMBED_MODEL = 'nomic-embed-text';
const DEFAULT_CONCURRENCY = 2;
const PROGRESS_INTERVAL_MS = 5000;
const BATCH_SAVE_SIZE = 100;

export interface IndexProgress {
  current: number;
  total: number;
  phase: string;
}

export interface IndexResult {
  embedded: number;
  skipped: number;
  failed: number;
}

export interface RecordInput {
  release: DiscogsRelease;
  textProfile: string;
}

export class CollectionIndexerService {
  private ollamaEmbedderService: OllamaEmbedderService;
  private embeddingStorageService: EmbeddingStorageService;

  private rebuilding = false;
  private cancelRequested = false;

  constructor(
    ollamaEmbedderService: OllamaEmbedderService,
    embeddingStorageService: EmbeddingStorageService
  ) {
    this.ollamaEmbedderService = ollamaEmbedderService;
    this.embeddingStorageService = embeddingStorageService;
  }

  isRebuilding(): boolean {
    return this.rebuilding;
  }

  cancelRebuild(): void {
    if (this.rebuilding) {
      log.info('Cancellation requested for collection rebuild');
      this.cancelRequested = true;
    }
  }

  /**
   * Full rebuild: embeds every record in the provided list, overwriting any
   * existing embeddings.
   *
   * Concurrent rebuild attempts are rejected with an error.
   * Cancellation is checked between batch items.
   * Individual failures are counted and logged but do not stop the run.
   */
  async rebuildAll(
    records: RecordInput[],
    onProgress?: (progress: IndexProgress) => void
  ): Promise<IndexResult> {
    if (this.rebuilding) {
      throw new Error(
        'A collection rebuild is already in progress. Call cancelRebuild() first.'
      );
    }

    this.rebuilding = true;
    this.cancelRequested = false;

    const result: IndexResult = { embedded: 0, skipped: 0, failed: 0 };
    const total = records.length;

    log.info(`Starting full collection rebuild: ${total} records`);

    let lastProgressReport = Date.now();

    const reportProgress = (current: number, phase: string): void => {
      const now = Date.now();
      if (
        onProgress &&
        (now - lastProgressReport >= PROGRESS_INTERVAL_MS || current === total)
      ) {
        onProgress({ current, total, phase });
        lastProgressReport = now;
      }
    };

    try {
      const concurrency = DEFAULT_CONCURRENCY;

      let processedIndex = 0;
      const pendingEntries: RecordEmbeddingEntry[] = [];
      let totalSaved = 0;
      let flushing = false;

      // Flush pending entries to disk in batches to preserve progress
      const flushBatch = async (): Promise<void> => {
        if (pendingEntries.length === 0 || flushing) return;
        flushing = true;
        try {
          const batch = pendingEntries.splice(0, pendingEntries.length);
          await this.embeddingStorageService.bulkSetEmbeddings(batch);
          totalSaved += batch.length;
          log.info(
            `Saved batch of ${batch.length} embeddings (${totalSaved}/${total} total saved)`
          );
        } finally {
          flushing = false;
        }
      };

      const worker = async (): Promise<void> => {
        while (processedIndex < total) {
          if (this.cancelRequested) {
            log.info('Rebuild cancelled by request');
            break;
          }

          const currentIndex = processedIndex;
          processedIndex++;

          const record = records[currentIndex];

          if (!record.textProfile || record.textProfile.trim().length === 0) {
            log.warn(
              `Skipping release ${record.release.id}: empty text profile`
            );
            result.skipped++;
            reportProgress(
              currentIndex + 1,
              `Skipping record ${currentIndex + 1}/${total}`
            );
            continue;
          }

          try {
            const vec = await this.ollamaEmbedderService.embed(
              record.textProfile
            );

            if (vec.every(v => v === 0)) {
              log.warn(
                `Skipping release ${record.release.id}: Ollama returned a zero vector`
              );
              result.skipped++;
              continue;
            }

            pendingEntries.push({
              discogsReleaseId: record.release.id,
              textProfile: record.textProfile,
              embedding: vectorToBase64(vec),
              embeddingModel: EMBED_MODEL,
              lastEnrichedAt: Date.now(),
            });
            result.embedded++;

            // Save in batches to preserve progress if interrupted
            if (pendingEntries.length >= BATCH_SAVE_SIZE) {
              await flushBatch();
            }

            log.debug(
              `Embedded release ${record.release.id} (${currentIndex + 1}/${total})`
            );
          } catch (error) {
            result.failed++;
            log.error(`Failed to embed release ${record.release.id}`, error);
          }

          reportProgress(
            currentIndex + 1,
            `Embedding record ${currentIndex + 1}/${total}`
          );
        }
      };

      const workerCount = Math.min(concurrency, total);
      const workers: Promise<void>[] = [];
      for (let i = 0; i < workerCount; i++) {
        workers.push(worker());
      }
      await Promise.all(workers);

      // Flush any remaining entries
      await flushBatch();

      // Final progress ping
      if (onProgress) {
        onProgress({
          current: total,
          total,
          phase: `Done: ${result.embedded} embedded, ${result.skipped} skipped, ${result.failed} failed`,
        });
      }

      log.info(
        `Rebuild complete: embedded=${result.embedded} skipped=${result.skipped} failed=${result.failed}`
      );
    } finally {
      this.rebuilding = false;
      this.cancelRequested = false;
    }

    return result;
  }

  /**
   * Embeds and stores a single record.
   */
  async indexSingle(
    releaseId: number,
    textProfile: string,
    embeddingModel: string = EMBED_MODEL
  ): Promise<void> {
    if (!textProfile || textProfile.trim().length === 0) {
      throw new Error(
        `Cannot index release ${releaseId}: text profile is empty`
      );
    }

    log.debug(`Indexing single release ${releaseId}`);

    const vec = await this.ollamaEmbedderService.embed(textProfile);

    if (vec.every(v => v === 0)) {
      throw new Error(
        `Ollama returned a zero vector for release ${releaseId} — skipping`
      );
    }

    const entry: RecordEmbeddingEntry = {
      discogsReleaseId: releaseId,
      textProfile,
      embedding: vectorToBase64(vec),
      embeddingModel,
      lastEnrichedAt: Date.now(),
    };

    await this.embeddingStorageService.setEmbedding(entry);
    log.info(`Indexed release ${releaseId}`);
  }

  /**
   * Incremental indexing: only embeds records whose text profile differs from
   * the stored one (or records not yet embedded).
   */
  async indexIncremental(records: RecordInput[]): Promise<IndexResult> {
    const result: IndexResult = { embedded: 0, skipped: 0, failed: 0 };

    log.info(`Starting incremental indexing of ${records.length} records`);

    for (const record of records) {
      if (!record.textProfile || record.textProfile.trim().length === 0) {
        log.warn(`Skipping release ${record.release.id}: empty text profile`);
        result.skipped++;
        continue;
      }

      const existing = await this.embeddingStorageService.getEmbedding(
        record.release.id
      );

      if (existing && existing.textProfile === record.textProfile) {
        log.debug(`Skipping release ${record.release.id}: profile unchanged`);
        result.skipped++;
        continue;
      }

      try {
        await this.indexSingle(record.release.id, record.textProfile);
        result.embedded++;
      } catch (error) {
        result.failed++;
        log.error(
          `Failed to incrementally index release ${record.release.id}`,
          error
        );
      }
    }

    log.info(
      `Incremental indexing complete: embedded=${result.embedded} skipped=${result.skipped} failed=${result.failed}`
    );

    return result;
  }
}
