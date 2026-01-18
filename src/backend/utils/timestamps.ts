/**
 * Timestamp utilities for consistent time handling across the application.
 *
 * IMPORTANT: All timestamps in data files use milliseconds (13-digit Unix timestamps).
 * This matches existing conventions in the codebase (e.g., Date.now()).
 *
 * Exception: Last.fm API returns timestamps in seconds (10-digit).
 * These should be normalized to milliseconds when stored.
 */

/** Convert Date to Unix milliseconds */
export const toUnixMs = (date: Date): number => date.getTime();

/** Convert Unix milliseconds to Date */
export const fromUnixMs = (timestamp: number): Date => new Date(timestamp);

/** Get current time as Unix milliseconds */
export const nowUnixMs = (): number => Date.now();

/**
 * Check if a timestamp appears to be seconds (10 digits) vs milliseconds (13 digits).
 * Uses year 2286 as cutoff - timestamps before 2286 in seconds would be
 * before 1970 in milliseconds.
 */
export const isLikelySeconds = (timestamp: number): boolean => {
  return timestamp < 10000000000; // Before year 2286 in seconds
};

/**
 * Normalize a timestamp to milliseconds.
 * Handles both seconds (from Last.fm) and milliseconds input.
 */
export const normalizeToMs = (timestamp: number): number => {
  return isLikelySeconds(timestamp) ? timestamp * 1000 : timestamp;
};

/**
 * Get local date string (YYYY-MM-DD) from millisecond timestamp.
 * Used for streak calculations and day grouping.
 */
export function getLocalDateString(timestampMs: number): string {
  const date = new Date(timestampMs);
  return date.toLocaleDateString('en-CA'); // YYYY-MM-DD format
}

/**
 * Check if two timestamps are on the same local calendar day.
 */
export function areSameLocalDay(ts1Ms: number, ts2Ms: number): boolean {
  return getLocalDateString(ts1Ms) === getLocalDateString(ts2Ms);
}

/**
 * Check if two timestamps are on consecutive local calendar days.
 * Returns true if the dates differ by exactly 1 day.
 */
export function areConsecutiveLocalDays(ts1Ms: number, ts2Ms: number): boolean {
  const date1 = new Date(ts1Ms);
  const date2 = new Date(ts2Ms);
  date1.setHours(0, 0, 0, 0);
  date2.setHours(0, 0, 0, 0);
  const diffDays =
    Math.abs(date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24);
  return Math.round(diffDays) === 1;
}
