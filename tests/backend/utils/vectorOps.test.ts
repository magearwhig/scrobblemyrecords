import {
  averageVectors,
  cosineSimilarity,
  normalizeVector,
  vectorMagnitude,
} from '../../../src/backend/utils/vectorOps';
import { createMockEmbedding } from '../../fixtures/embeddingFixtures';

describe('vectorOps', () => {
  describe('cosineSimilarity', () => {
    it('should return 1.0 for identical vectors', () => {
      // Arrange
      const vec = [1, 2, 3, 4, 5];

      // Act
      const result = cosineSimilarity(vec, vec);

      // Assert
      expect(result).toBeCloseTo(1.0, 10);
    });

    it('should return 0 for orthogonal vectors', () => {
      // Arrange
      const vecA = [1, 0, 0];
      const vecB = [0, 1, 0];

      // Act
      const result = cosineSimilarity(vecA, vecB);

      // Assert
      expect(result).toBeCloseTo(0, 10);
    });

    it('should return -1 for exactly opposite vectors', () => {
      // Arrange
      const vecA = [1, 2, 3];
      const vecB = [-1, -2, -3];

      // Act
      const result = cosineSimilarity(vecA, vecB);

      // Assert
      expect(result).toBeCloseTo(-1.0, 10);
    });

    it('should return 0 when first vector is all zeros', () => {
      // Arrange
      const zeroVec = [0, 0, 0];
      const normalVec = [1, 2, 3];

      // Act
      const result = cosineSimilarity(zeroVec, normalVec);

      // Assert
      expect(result).toBe(0);
      expect(isNaN(result)).toBe(false);
    });

    it('should return 0 when second vector is all zeros', () => {
      // Arrange
      const normalVec = [1, 2, 3];
      const zeroVec = [0, 0, 0];

      // Act
      const result = cosineSimilarity(normalVec, zeroVec);

      // Assert
      expect(result).toBe(0);
      expect(isNaN(result)).toBe(false);
    });

    it('should return 0 when both vectors are all zeros', () => {
      // Arrange
      const zeroVec = [0, 0, 0];

      // Act
      const result = cosineSimilarity(zeroVec, zeroVec);

      // Assert
      expect(result).toBe(0);
      expect(isNaN(result)).toBe(false);
    });

    it('should throw when vectors have different lengths', () => {
      // Arrange
      const vecA = [1, 2, 3];
      const vecB = [1, 2];

      // Act & Assert
      expect(() => cosineSimilarity(vecA, vecB)).toThrow(
        'Vector length mismatch: 3 vs 2'
      );
    });

    it('should return a value in the range [-1, 1] for random 768-dim vectors', () => {
      // Arrange
      const vecA = createMockEmbedding(768);
      const vecBFull = createMockEmbedding(768).map(
        (v, i) => v * 0.5 + vecA[i] * 0.1
      );

      // Act
      const result = cosineSimilarity(vecA, vecBFull);

      // Assert — allow small floating-point rounding error beyond ±1
      expect(result).toBeGreaterThanOrEqual(-1 - 1e-10);
      expect(result).toBeLessThanOrEqual(1 + 1e-10);
    });

    it('should handle two-element vectors', () => {
      // Arrange — 45-degree angle: expected cosine = cos(45°) ≈ 0.7071
      const vecA = [1, 0];
      const vecB = [1, 1];

      // Act
      const result = cosineSimilarity(vecA, vecB);

      // Assert
      expect(result).toBeCloseTo(1 / Math.sqrt(2), 10);
    });
  });

  describe('averageVectors', () => {
    it('should correctly average two vectors', () => {
      // Arrange
      const vecA = [1, 2, 3];
      const vecB = [3, 4, 5];

      // Act
      const result = averageVectors([vecA, vecB]);

      // Assert
      expect(result).toHaveLength(3);
      expect(result[0]).toBeCloseTo(2, 10);
      expect(result[1]).toBeCloseTo(3, 10);
      expect(result[2]).toBeCloseTo(4, 10);
    });

    it('should return the original vector when given a single vector', () => {
      // Arrange
      const vec = [1, 2, 3, 4];

      // Act
      const result = averageVectors([vec]);

      // Assert
      expect(result).toHaveLength(vec.length);
      for (let i = 0; i < vec.length; i++) {
        expect(result[i]).toBeCloseTo(vec[i], 10);
      }
    });

    it('should correctly average three vectors', () => {
      // Arrange
      const vecs = [
        [0, 0, 0],
        [3, 3, 3],
        [6, 6, 6],
      ];

      // Act
      const result = averageVectors(vecs);

      // Assert
      expect(result[0]).toBeCloseTo(3, 10);
      expect(result[1]).toBeCloseTo(3, 10);
      expect(result[2]).toBeCloseTo(3, 10);
    });

    it('should throw for an empty array', () => {
      expect(() => averageVectors([])).toThrow(
        'Cannot average an empty list of vectors'
      );
    });

    it('should throw when vectors have mismatched lengths', () => {
      // Arrange
      const vecs = [
        [1, 2, 3],
        [1, 2],
      ];

      // Act & Assert
      expect(() => averageVectors(vecs)).toThrow(
        'Vector length mismatch at index 1'
      );
    });
  });

  describe('normalizeVector', () => {
    it('should produce a unit vector (magnitude ~1.0)', () => {
      // Arrange
      const vec = [3, 4]; // magnitude = 5

      // Act
      const normalized = normalizeVector(vec);

      // Assert — magnitude of result should be ~1
      const mag = Math.sqrt(normalized.reduce((sum, v) => sum + v * v, 0));
      expect(mag).toBeCloseTo(1.0, 10);
    });

    it('should return [0, 0, 0] for a zero vector', () => {
      // Arrange
      const zeroVec = [0, 0, 0];

      // Act
      const result = normalizeVector(zeroVec);

      // Assert
      expect(result).toEqual([0, 0, 0]);
    });

    it('should preserve the direction of the vector', () => {
      // Arrange
      const vec = [1, 2, 3];

      // Act
      const normalized = normalizeVector(vec);
      const original = normalizeVector([1, 2, 3]);

      // Assert — normalized vectors should have same ratios
      expect(normalized[1] / normalized[0]).toBeCloseTo(vec[1] / vec[0], 10);
      expect(normalized[2] / normalized[0]).toBeCloseTo(vec[2] / vec[0], 10);
      // Silence unused variable warning from assertion perspective
      expect(original).toBeDefined();
    });

    it('should normalize a 768-dim vector to unit length', () => {
      // Arrange
      const vec = createMockEmbedding(768);

      // Act
      const normalized = normalizeVector(vec);

      // Assert
      const mag = Math.sqrt(normalized.reduce((sum, v) => sum + v * v, 0));
      expect(mag).toBeCloseTo(1.0, 5);
    });

    it('should handle a unit vector unchanged', () => {
      // Arrange — already a unit vector
      const vec = [1, 0, 0];

      // Act
      const result = normalizeVector(vec);

      // Assert
      expect(result[0]).toBeCloseTo(1, 10);
      expect(result[1]).toBeCloseTo(0, 10);
      expect(result[2]).toBeCloseTo(0, 10);
    });
  });

  describe('vectorMagnitude', () => {
    it('should compute the known magnitude of a 3-4-5 right triangle', () => {
      // Arrange
      const vec = [3, 4]; // magnitude = 5

      // Act
      const result = vectorMagnitude(vec);

      // Assert
      expect(result).toBeCloseTo(5, 10);
    });

    it('should return 0 for a zero vector', () => {
      // Arrange
      const vec = [0, 0, 0];

      // Act
      const result = vectorMagnitude(vec);

      // Assert
      expect(result).toBe(0);
    });

    it('should return 1 for a unit vector', () => {
      // Arrange
      const vec = [1, 0, 0];

      // Act
      const result = vectorMagnitude(vec);

      // Assert
      expect(result).toBeCloseTo(1.0, 10);
    });

    it('should compute the magnitude of a 3D vector correctly', () => {
      // Arrange — sqrt(1^2 + 2^2 + 2^2) = sqrt(9) = 3
      const vec = [1, 2, 2];

      // Act
      const result = vectorMagnitude(vec);

      // Assert
      expect(result).toBeCloseTo(3.0, 10);
    });

    it('should handle a large vector without overflow', () => {
      // Arrange
      const vec = createMockEmbedding(768);

      // Act
      const result = vectorMagnitude(vec);

      // Assert
      expect(result).toBeGreaterThan(0);
      expect(isNaN(result)).toBe(false);
      expect(isFinite(result)).toBe(true);
    });
  });
});
