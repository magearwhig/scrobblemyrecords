/**
 * Utilities for serializing/deserializing embedding vectors to/from base64.
 *
 * Ollama returns embeddings as Float64 arrays. We downcast to Float32 for
 * storage efficiency (768 dims × 4 bytes = 3 KB vs 6 KB per record).
 * Float32 precision is sufficient for cosine similarity computations.
 */

/**
 * Converts a number[] vector (Float64 from Ollama) to a base64-encoded
 * Float32Array string suitable for JSON storage.
 */
export function vectorToBase64(vector: number[]): string {
  if (!vector || vector.length === 0) {
    throw new Error('Cannot serialize an empty vector');
  }
  const float32 = new Float32Array(vector);
  const buffer = Buffer.from(float32.buffer);
  return buffer.toString('base64');
}

/**
 * Decodes a base64 string back to a number[] vector.
 * The base64 string must have been produced by vectorToBase64.
 */
export function base64ToVector(base64: string): number[] {
  const buffer = Buffer.from(base64, 'base64');
  const float32 = new Float32Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength / Float32Array.BYTES_PER_ELEMENT
  );
  return Array.from(float32);
}

/**
 * Validates that a base64 string is a well-formed embedding.
 *
 * @param base64 - base64 string to validate
 * @param expectedDimensions - if provided, checks that the decoded vector has
 *   this many dimensions (e.g. 768 for nomic-embed-text)
 */
export function isValidEmbedding(
  base64: string,
  expectedDimensions?: number
): boolean {
  if (!base64 || typeof base64 !== 'string') return false;

  try {
    const buffer = Buffer.from(base64, 'base64');

    // Must be divisible by 4 (Float32 = 4 bytes per element)
    if (
      buffer.byteLength === 0 ||
      buffer.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0
    ) {
      return false;
    }

    const dimensions = buffer.byteLength / Float32Array.BYTES_PER_ELEMENT;

    if (expectedDimensions !== undefined && dimensions !== expectedDimensions) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
