import {
  base64ToVector,
  isValidEmbedding,
  vectorToBase64,
} from '../../../src/backend/utils/vectorSerialization';
import { createMockEmbedding } from '../../fixtures/embeddingFixtures';

describe('vectorSerialization', () => {
  describe('vectorToBase64', () => {
    it('should throw when given an empty array', () => {
      expect(() => vectorToBase64([])).toThrow(
        'Cannot serialize an empty vector'
      );
    });

    it('should produce a non-empty base64 string for a valid vector', () => {
      // Arrange
      const vec = [0.1, 0.2, 0.3];

      // Act
      const result = vectorToBase64(vec);

      // Assert
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should encode a single-element vector', () => {
      // Arrange
      const vec = [1.0];

      // Act
      const result = vectorToBase64(vec);

      // Assert
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should encode a 768-dimension vector without error', () => {
      // Arrange
      const vec = createMockEmbedding(768);

      // Act & Assert
      expect(() => vectorToBase64(vec)).not.toThrow();
    });
  });

  describe('base64ToVector', () => {
    it('should decode a previously encoded vector', () => {
      // Arrange
      const original = [0.1, 0.2, 0.3];
      const encoded = vectorToBase64(original);

      // Act
      const decoded = base64ToVector(encoded);

      // Assert
      expect(decoded).toHaveLength(original.length);
    });

    it('should return an array of numbers', () => {
      // Arrange
      const encoded = vectorToBase64([1.0, 2.0, 3.0]);

      // Act
      const result = base64ToVector(encoded);

      // Assert
      expect(Array.isArray(result)).toBe(true);
      result.forEach(v => expect(typeof v).toBe('number'));
    });
  });

  describe('round-trip (vectorToBase64 → base64ToVector)', () => {
    it('should preserve values within Float32 precision for a small vector', () => {
      // Arrange
      const original = [0.1, 0.2, 0.3, -0.5, 1.0];

      // Act
      const decoded = base64ToVector(vectorToBase64(original));

      // Assert — Float32 precision is ~7 significant digits
      expect(decoded).toHaveLength(original.length);
      for (let i = 0; i < original.length; i++) {
        expect(decoded[i]).toBeCloseTo(original[i], 5);
      }
    });

    it('should preserve values within Float32 precision for a 768-dim vector', () => {
      // Arrange
      const original = createMockEmbedding(768);

      // Act
      const decoded = base64ToVector(vectorToBase64(original));

      // Assert
      expect(decoded).toHaveLength(768);
      for (let i = 0; i < decoded.length; i++) {
        expect(decoded[i]).toBeCloseTo(original[i], 5);
      }
    });

    it('should correctly round-trip zero and negative values', () => {
      // Arrange
      const original = [0.0, -1.0, 0.5, -0.5];

      // Act
      const decoded = base64ToVector(vectorToBase64(original));

      // Assert
      expect(decoded).toHaveLength(original.length);
      expect(decoded[0]).toBe(0);
      expect(decoded[1]).toBeCloseTo(-1.0, 5);
      expect(decoded[2]).toBeCloseTo(0.5, 5);
      expect(decoded[3]).toBeCloseTo(-0.5, 5);
    });
  });

  describe('isValidEmbedding', () => {
    it('should return true for a valid base64 embedding', () => {
      // Arrange
      const vec = createMockEmbedding(768);
      const base64 = vectorToBase64(vec);

      // Act & Assert
      expect(isValidEmbedding(base64)).toBe(true);
    });

    it('should return true when expectedDimensions matches', () => {
      // Arrange
      const vec = createMockEmbedding(768);
      const base64 = vectorToBase64(vec);

      // Act & Assert
      expect(isValidEmbedding(base64, 768)).toBe(true);
    });

    it('should return false when expectedDimensions does not match', () => {
      // Arrange
      const vec = createMockEmbedding(64);
      const base64 = vectorToBase64(vec);

      // Act & Assert
      expect(isValidEmbedding(base64, 768)).toBe(false);
    });

    it('should return false for an empty string', () => {
      expect(isValidEmbedding('')).toBe(false);
    });

    it('should return false for non-string input', () => {
      // Act & Assert
      expect(isValidEmbedding(null as unknown as string)).toBe(false);
      expect(isValidEmbedding(undefined as unknown as string)).toBe(false);
      expect(isValidEmbedding(42 as unknown as string)).toBe(false);
    });

    it('should return false for a base64 string with non-multiple-of-4 byte length', () => {
      // Arrange — 3 bytes encoded is not divisible by 4 (Float32Array.BYTES_PER_ELEMENT)
      const shortBuffer = Buffer.alloc(3);
      shortBuffer[0] = 1;
      shortBuffer[1] = 2;
      shortBuffer[2] = 3;
      const base64 = shortBuffer.toString('base64');

      // Act & Assert
      expect(isValidEmbedding(base64)).toBe(false);
    });

    it('should return false when no expectedDimensions and buffer is zero length', () => {
      // Arrange — empty buffer
      const base64 = Buffer.alloc(0).toString('base64');

      // Act & Assert
      expect(isValidEmbedding(base64)).toBe(false);
    });
  });
});
