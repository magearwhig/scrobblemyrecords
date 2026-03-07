/**
 * Wraps the Ollama /api/embed endpoint to generate text embeddings.
 *
 * Uses the existing OllamaService for connection checking and base URL —
 * this service adds embedding-specific logic on top of that foundation.
 */

import { createLogger } from '../utils/logger';

import { OllamaService } from './ollamaService';

const log = createLogger('OllamaEmbedderService');

const EMBED_MODEL = 'nomic-embed-text';
const EMBED_DIMENSIONS = 768;
const DEFAULT_EMBED_TIMEOUT_MS = 30000;
const DEFAULT_BATCH_CONCURRENCY = 2;

interface OllamaEmbedResponse {
  embeddings: number[][];
}

export class OllamaEmbedderService {
  private ollamaService: OllamaService;

  constructor(ollamaService: OllamaService) {
    this.ollamaService = ollamaService;
  }

  /**
   * Generates an embedding vector for a single piece of text.
   *
   * Throws if Ollama is unreachable or the model is unavailable.
   * Never silently returns a bad/empty vector.
   */
  async embed(text: string): Promise<number[]> {
    const baseUrl = this.ollamaService.getSettings().baseUrl;
    const url = `${baseUrl}/api/embed`;

    let response: globalThis.Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: EMBED_MODEL, input: text }),
        signal: AbortSignal.timeout(DEFAULT_EMBED_TIMEOUT_MS),
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Ollama embedding request failed (is Ollama running?): ${msg}`
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Ollama /api/embed returned ${response.status}: ${body}`);
    }

    const data = (await response.json()) as OllamaEmbedResponse;

    if (
      !data.embeddings ||
      !Array.isArray(data.embeddings) ||
      data.embeddings.length === 0
    ) {
      throw new Error(
        `Ollama returned an empty embeddings array for model ${EMBED_MODEL}`
      );
    }

    const vec = data.embeddings[0];
    if (!Array.isArray(vec) || vec.length === 0) {
      throw new Error(`Ollama returned an invalid embedding vector`);
    }

    log.debug(
      `Embedded ${vec.length}-dim vector for text (${text.length} chars)`
    );
    return vec;
  }

  /**
   * Embeds multiple texts with bounded concurrency.
   *
   * Processes texts in parallel up to `concurrency` at a time.
   * Throws on the first failure — callers should handle per-item failures
   * at a higher level if partial results are acceptable.
   */
  async embedBatch(
    texts: string[],
    concurrency: number = DEFAULT_BATCH_CONCURRENCY
  ): Promise<number[][]> {
    if (texts.length === 0) return [];

    const results: number[][] = new Array(texts.length);

    // Simple semaphore: process in windows of `concurrency`
    let index = 0;

    const worker = async (): Promise<void> => {
      while (index < texts.length) {
        const current = index;
        index++;
        results[current] = await this.embed(texts[current]);
      }
    };

    const workers: Promise<void>[] = [];
    const workerCount = Math.min(concurrency, texts.length);
    for (let i = 0; i < workerCount; i++) {
      workers.push(worker());
    }

    await Promise.all(workers);
    return results;
  }

  /**
   * Returns true only if Ollama is running AND nomic-embed-text is available.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const conn = await this.ollamaService.checkConnection();
      if (!conn.connected) return false;
      return await this.ollamaService.isModelAvailable(EMBED_MODEL);
    } catch {
      return false;
    }
  }

  /**
   * Returns the number of dimensions produced by nomic-embed-text.
   */
  getEmbeddingDimensions(): number {
    return EMBED_DIMENSIONS;
  }
}
