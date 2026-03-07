/**
 * Pure vector math utilities for embedding similarity computations.
 *
 * Performance note: these functions are called in hot paths (scoring 2000+
 * records at a time). Use simple for-loops — avoid map/reduce allocations.
 */

/**
 * Computes the L2 norm (magnitude) of a vector.
 */
export function vectorMagnitude(vec: number[]): number {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) {
    sum += vec[i] * vec[i];
  }
  return Math.sqrt(sum);
}

/**
 * Returns the L2-normalized (unit) version of a vector.
 * Returns a zero vector if the input has zero magnitude.
 */
export function normalizeVector(vec: number[]): number[] {
  const mag = vectorMagnitude(vec);
  if (mag === 0) {
    return new Array(vec.length).fill(0);
  }
  const out = new Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    out[i] = vec[i] / mag;
  }
  return out;
}

/**
 * Computes cosine similarity between two vectors.
 *
 * Returns 0 if either vector is a zero vector.
 * Throws if vectors have different lengths.
 *
 * Result is in the range [-1, 1] (1 = identical direction, -1 = opposite).
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error(`Vector length mismatch: ${vecA.length} vs ${vecB.length}`);
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) {
    return 0;
  }

  return dot / denom;
}

/**
 * Computes the element-wise average of multiple vectors.
 * All vectors must have the same length.
 *
 * Throws if no vectors are provided or lengths differ.
 */
export function averageVectors(vectors: number[][]): number[] {
  if (vectors.length === 0) {
    throw new Error('Cannot average an empty list of vectors');
  }

  const dim = vectors[0].length;

  for (let v = 1; v < vectors.length; v++) {
    if (vectors[v].length !== dim) {
      throw new Error(
        `Vector length mismatch at index ${v}: expected ${dim}, got ${vectors[v].length}`
      );
    }
  }

  const out = new Array(dim).fill(0);
  for (let v = 0; v < vectors.length; v++) {
    for (let i = 0; i < dim; i++) {
      out[i] += vectors[v][i];
    }
  }

  const n = vectors.length;
  for (let i = 0; i < dim; i++) {
    out[i] /= n;
  }

  return out;
}
