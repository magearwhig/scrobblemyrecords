/**
 * Tests for dateUtils utility functions
 */

import {
  formatLocalTime,
  formatLocalTimeClean,
  formatLocalTimeOnly,
  formatLocalDateOnly,
  formatUTCToLocal,
  getTimezoneOffset,
} from '../../../src/renderer/utils/dateUtils';

describe('dateUtils', () => {
  // Fixed timestamp for consistent testing: 2023-06-15T10:30:45.000Z
  const testTimestamp = 1686828645000;
  const testDate = new Date(testTimestamp);

  describe('formatLocalTime', () => {
    it('should format timestamp with default options', () => {
      const result = formatLocalTime(testTimestamp);
      expect(result).toMatch(/Jun 15, 2023/);
      expect(result).toMatch(/\d{1,2}:\d{2}:\d{2}/); // Match time format regardless of timezone
    });

    it('should format Date object with default options', () => {
      const result = formatLocalTime(testDate);
      expect(result).toMatch(/Jun 15, 2023/);
      expect(result).toMatch(/\d{1,2}:\d{2}:\d{2}/); // Match time format regardless of timezone
    });

    it('should respect custom options', () => {
      const result = formatLocalTime(testTimestamp, {
        year: '2-digit',
        month: 'long',
        timeZoneName: 'long',
      });
      expect(result).toMatch(/June/);
      expect(result).toMatch(/23/);
    });

    it('should handle timezone names', () => {
      const result = formatLocalTime(testTimestamp);
      expect(result).toMatch(/(UTC|GMT|EST|PST|CST|MST|EDT|PDT|CDT|MDT)/);
    });
  });

  describe('formatLocalTimeClean', () => {
    it('should format timestamp without timezone name', () => {
      const result = formatLocalTimeClean(testTimestamp);
      expect(result).toMatch(/Jun 15, 2023/);
      expect(result).toMatch(/\d{1,2}:\d{2}/);
      expect(result).not.toMatch(/(UTC|GMT|EST|PST|CST|MST|EDT|PDT|CDT|MDT)/);
    });

    it('should format Date object without timezone name', () => {
      const result = formatLocalTimeClean(testDate);
      expect(result).toMatch(/Jun 15, 2023/);
      expect(result).toMatch(/\d{1,2}:\d{2}/);
      expect(result).not.toMatch(/(UTC|GMT|EST|PST|CST|MST|EDT|PDT|CDT|MDT)/);
    });

    it('should respect custom options', () => {
      const result = formatLocalTimeClean(testTimestamp, {
        month: 'numeric',
        day: 'numeric',
      });
      expect(result).toMatch(/6\/15\/2023/);
    });
  });

  describe('formatLocalTimeOnly', () => {
    it('should format only time with timezone', () => {
      const result = formatLocalTimeOnly(testTimestamp);
      expect(result).toMatch(/\d{1,2}:\d{2}:\d{2}/);
      expect(result).toMatch(/(UTC|GMT|EST|PST|CST|MST|EDT|PDT|CDT|MDT)/);
      expect(result).not.toMatch(/2023/);
      expect(result).not.toMatch(/Jun/);
    });

    it('should format Date object time only', () => {
      const result = formatLocalTimeOnly(testDate);
      expect(result).toMatch(/\d{1,2}:\d{2}:\d{2}/);
      expect(result).toMatch(/(UTC|GMT|EST|PST|CST|MST|EDT|PDT|CDT|MDT)/);
      expect(result).not.toMatch(/2023/);
      expect(result).not.toMatch(/Jun/);
    });
  });

  describe('formatLocalDateOnly', () => {
    it('should format only date without time', () => {
      const result = formatLocalDateOnly(testTimestamp);
      expect(result).toMatch(/Jun 15, 2023/);
      expect(result).not.toMatch(/10:30/);
      expect(result).not.toMatch(/(UTC|GMT|EST|PST|CST|MST|EDT|PDT|CDT|MDT)/);
    });

    it('should format Date object date only', () => {
      const result = formatLocalDateOnly(testDate);
      expect(result).toMatch(/Jun 15, 2023/);
      expect(result).not.toMatch(/10:30/);
      expect(result).not.toMatch(/(UTC|GMT|EST|PST|CST|MST|EDT|PDT|CDT|MDT)/);
    });
  });

  describe('formatUTCToLocal', () => {
    it('should format UTC timestamp to local time', () => {
      const result = formatUTCToLocal(testTimestamp);
      expect(result).toMatch(/Jun 15, 2023/);
      expect(result).toMatch(/\d{1,2}:\d{2}:\d{2}/);
      expect(result).toMatch(/(UTC|GMT|EST|PST|CST|MST|EDT|PDT|CDT|MDT)/);
    });

    it('should respect custom options', () => {
      const result = formatUTCToLocal(testTimestamp, {
        month: 'long',
        timeZoneName: 'long',
      });
      expect(result).toMatch(/June/);
    });
  });

  describe('getTimezoneOffset', () => {
    it('should return timezone offset string', () => {
      const result = getTimezoneOffset();
      expect(result).toMatch(/^UTC[+-]\d+(:?\d{2})?$/);
    });

    it('should handle positive and negative offsets', () => {
      const result = getTimezoneOffset();
      expect(result.startsWith('UTC')).toBe(true);
      expect(result.includes('+') || result.includes('-')).toBe(true);
    });

    it('should format hours without minutes when minutes are zero', () => {
      // Mock timezone offset to be exactly on the hour
      const originalGetTimezoneOffset = Date.prototype.getTimezoneOffset;
      Date.prototype.getTimezoneOffset = jest.fn().mockReturnValue(-300); // UTC+5

      const result = getTimezoneOffset();
      expect(result).toBe('UTC+5');

      Date.prototype.getTimezoneOffset = originalGetTimezoneOffset;
    });

    it('should format hours and minutes when minutes are not zero', () => {
      // Mock timezone offset to have minutes
      const originalGetTimezoneOffset = Date.prototype.getTimezoneOffset;
      Date.prototype.getTimezoneOffset = jest.fn().mockReturnValue(-270); // UTC+4:30 (4*60+30 = 270 minutes ahead)

      const result = getTimezoneOffset();
      expect(result).toBe('UTC+5:30');

      Date.prototype.getTimezoneOffset = originalGetTimezoneOffset;
    });

    it('should handle negative offset correctly', () => {
      // Mock timezone offset to be negative (behind UTC)
      const originalGetTimezoneOffset = Date.prototype.getTimezoneOffset;
      Date.prototype.getTimezoneOffset = jest.fn().mockReturnValue(240); // UTC-4

      const result = getTimezoneOffset();
      expect(result).toBe('UTC-4');

      Date.prototype.getTimezoneOffset = originalGetTimezoneOffset;
    });
  });

  describe('edge cases', () => {
    it('should handle invalid dates gracefully', () => {
      const invalidTimestamp = NaN;
      expect(() => formatLocalTime(invalidTimestamp)).not.toThrow();
      expect(() => formatLocalTimeClean(invalidTimestamp)).not.toThrow();
      expect(() => formatLocalTimeOnly(invalidTimestamp)).not.toThrow();
      expect(() => formatLocalDateOnly(invalidTimestamp)).not.toThrow();
      expect(() => formatUTCToLocal(invalidTimestamp)).not.toThrow();
    });

    it('should handle very old dates', () => {
      const oldDate = new Date('1970-01-01T00:00:00.000Z');
      const result = formatLocalTime(oldDate);
      expect(result).toMatch(/1970|1969/); // Could show Dec 31, 1969 in some timezones
    });

    it('should handle future dates', () => {
      const futureDate = new Date('2030-12-31T23:59:59.000Z');
      const result = formatLocalTime(futureDate);
      expect(result).toMatch(/2030/);
    });

    it('should handle leap year dates', () => {
      const leapYearDate = new Date('2024-02-29T12:00:00.000Z');
      const result = formatLocalDateOnly(leapYearDate);
      expect(result).toMatch(/Feb 29, 2024/);
    });
  });
});
