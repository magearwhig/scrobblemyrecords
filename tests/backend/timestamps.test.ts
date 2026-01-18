import {
  toUnixMs,
  fromUnixMs,
  nowUnixMs,
  isLikelySeconds,
  normalizeToMs,
  getLocalDateString,
  areSameLocalDay,
  areConsecutiveLocalDays,
} from '../../src/backend/utils/timestamps';

describe('Timestamps Utility', () => {
  describe('toUnixMs', () => {
    it('should convert Date to Unix milliseconds', () => {
      // Arrange
      const date = new Date('2024-01-15T12:00:00Z');

      // Act
      const result = toUnixMs(date);

      // Assert
      expect(result).toBe(1705320000000);
    });

    it('should handle dates at epoch', () => {
      // Arrange
      const date = new Date(0);

      // Act
      const result = toUnixMs(date);

      // Assert
      expect(result).toBe(0);
    });
  });

  describe('fromUnixMs', () => {
    it('should convert Unix milliseconds to Date', () => {
      // Arrange
      const timestamp = 1705320000000;

      // Act
      const result = fromUnixMs(timestamp);

      // Assert
      expect(result.toISOString()).toBe('2024-01-15T12:00:00.000Z');
    });

    it('should handle zero timestamp', () => {
      // Arrange
      const timestamp = 0;

      // Act
      const result = fromUnixMs(timestamp);

      // Assert
      expect(result.toISOString()).toBe('1970-01-01T00:00:00.000Z');
    });
  });

  describe('nowUnixMs', () => {
    it('should return current time in milliseconds', () => {
      // Arrange
      const before = Date.now();

      // Act
      const result = nowUnixMs();
      const after = Date.now();

      // Assert
      expect(result).toBeGreaterThanOrEqual(before);
      expect(result).toBeLessThanOrEqual(after);
    });

    it('should return 13-digit timestamp', () => {
      // Act
      const result = nowUnixMs();

      // Assert
      expect(String(result).length).toBeGreaterThanOrEqual(13);
    });
  });

  describe('isLikelySeconds', () => {
    it('should return true for 10-digit timestamps (seconds)', () => {
      // Arrange - January 2024 in seconds
      const timestampSeconds = 1705320000;

      // Act
      const result = isLikelySeconds(timestampSeconds);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for 13-digit timestamps (milliseconds)', () => {
      // Arrange - January 2024 in milliseconds
      const timestampMs = 1705320000000;

      // Act
      const result = isLikelySeconds(timestampMs);

      // Assert
      expect(result).toBe(false);
    });

    it('should return true for very old timestamps in seconds', () => {
      // Arrange - Year 2000 in seconds
      const timestamp = 946684800;

      // Act
      const result = isLikelySeconds(timestamp);

      // Assert
      expect(result).toBe(true);
    });

    it('should handle boundary value (10 billion)', () => {
      // Arrange - The cutoff point
      const belowCutoff = 9999999999;
      const atCutoff = 10000000000;

      // Act & Assert
      expect(isLikelySeconds(belowCutoff)).toBe(true);
      expect(isLikelySeconds(atCutoff)).toBe(false);
    });
  });

  describe('normalizeToMs', () => {
    it('should convert seconds to milliseconds', () => {
      // Arrange
      const timestampSeconds = 1705320000;

      // Act
      const result = normalizeToMs(timestampSeconds);

      // Assert
      expect(result).toBe(1705320000000);
    });

    it('should keep milliseconds unchanged', () => {
      // Arrange
      const timestampMs = 1705320000000;

      // Act
      const result = normalizeToMs(timestampMs);

      // Assert
      expect(result).toBe(1705320000000);
    });

    it('should handle Last.fm API timestamps (seconds)', () => {
      // Arrange - Typical Last.fm timestamp
      const lastfmTimestamp = 1108339019;

      // Act
      const result = normalizeToMs(lastfmTimestamp);

      // Assert
      expect(result).toBe(1108339019000);
      expect(String(result).length).toBe(13);
    });
  });

  describe('getLocalDateString', () => {
    it('should return date in YYYY-MM-DD format', () => {
      // Arrange - Use a specific timestamp
      const timestamp = new Date('2024-01-15T12:00:00').getTime();

      // Act
      const result = getLocalDateString(timestamp);

      // Assert
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result).toBe('2024-01-15');
    });

    it('should handle midnight correctly', () => {
      // Arrange
      const timestamp = new Date('2024-01-15T00:00:00').getTime();

      // Act
      const result = getLocalDateString(timestamp);

      // Assert
      expect(result).toBe('2024-01-15');
    });

    it('should handle end of day correctly', () => {
      // Arrange
      const timestamp = new Date('2024-01-15T23:59:59').getTime();

      // Act
      const result = getLocalDateString(timestamp);

      // Assert
      expect(result).toBe('2024-01-15');
    });
  });

  describe('areSameLocalDay', () => {
    it('should return true for same day timestamps', () => {
      // Arrange
      const morning = new Date('2024-01-15T06:00:00').getTime();
      const evening = new Date('2024-01-15T18:00:00').getTime();

      // Act
      const result = areSameLocalDay(morning, evening);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for different day timestamps', () => {
      // Arrange
      const day1 = new Date('2024-01-15T12:00:00').getTime();
      const day2 = new Date('2024-01-16T12:00:00').getTime();

      // Act
      const result = areSameLocalDay(day1, day2);

      // Assert
      expect(result).toBe(false);
    });

    it('should handle edge case at midnight boundary', () => {
      // Arrange
      const beforeMidnight = new Date('2024-01-15T23:59:59').getTime();
      const afterMidnight = new Date('2024-01-16T00:00:01').getTime();

      // Act
      const result = areSameLocalDay(beforeMidnight, afterMidnight);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('areConsecutiveLocalDays', () => {
    it('should return true for consecutive days', () => {
      // Arrange
      const day1 = new Date('2024-01-15T12:00:00').getTime();
      const day2 = new Date('2024-01-16T12:00:00').getTime();

      // Act
      const result = areConsecutiveLocalDays(day1, day2);

      // Assert
      expect(result).toBe(true);
    });

    it('should return true regardless of order', () => {
      // Arrange
      const day1 = new Date('2024-01-16T12:00:00').getTime();
      const day2 = new Date('2024-01-15T12:00:00').getTime();

      // Act
      const result = areConsecutiveLocalDays(day1, day2);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for same day', () => {
      // Arrange
      const day1 = new Date('2024-01-15T06:00:00').getTime();
      const day2 = new Date('2024-01-15T18:00:00').getTime();

      // Act
      const result = areConsecutiveLocalDays(day1, day2);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for days 2 apart', () => {
      // Arrange
      const day1 = new Date('2024-01-15T12:00:00').getTime();
      const day2 = new Date('2024-01-17T12:00:00').getTime();

      // Act
      const result = areConsecutiveLocalDays(day1, day2);

      // Assert
      expect(result).toBe(false);
    });

    it('should handle month boundary correctly', () => {
      // Arrange
      const lastDayOfMonth = new Date('2024-01-31T12:00:00').getTime();
      const firstDayOfNextMonth = new Date('2024-02-01T12:00:00').getTime();

      // Act
      const result = areConsecutiveLocalDays(
        lastDayOfMonth,
        firstDayOfNextMonth
      );

      // Assert
      expect(result).toBe(true);
    });

    it('should handle year boundary correctly', () => {
      // Arrange
      const lastDayOfYear = new Date('2023-12-31T12:00:00').getTime();
      const firstDayOfNewYear = new Date('2024-01-01T12:00:00').getTime();

      // Act
      const result = areConsecutiveLocalDays(lastDayOfYear, firstDayOfNewYear);

      // Assert
      expect(result).toBe(true);
    });
  });
});
