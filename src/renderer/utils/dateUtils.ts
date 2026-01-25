/**
 * Utility functions for date and time formatting with proper timezone handling
 */

/**
 * Format a timestamp to local timezone with explicit timezone information
 * @param timestamp - Unix timestamp in milliseconds or Date object
 * @param options - Intl.DateTimeFormatOptions for customization
 * @returns Formatted date string in local timezone
 */
export const formatLocalTime = (
  timestamp: number | Date,
  options: Intl.DateTimeFormatOptions = {}
): string => {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;

  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
    ...options,
  };

  return date.toLocaleString(undefined, defaultOptions);
};

/**
 * Format a timestamp to local timezone without timezone name (for cleaner display)
 * @param timestamp - Unix timestamp in milliseconds or Date object
 * @param options - Intl.DateTimeFormatOptions for customization
 * @returns Formatted date string in local timezone
 */
export const formatLocalTimeClean = (
  timestamp: number | Date,
  options: Intl.DateTimeFormatOptions = {}
): string => {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;

  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  };

  return date.toLocaleString(undefined, defaultOptions);
};

/**
 * Format a timestamp to show only the time in local timezone
 * @param timestamp - Unix timestamp in milliseconds or Date object
 * @returns Formatted time string in local timezone
 */
export const formatLocalTimeOnly = (timestamp: number | Date): string => {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;

  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
};

/**
 * Format a timestamp to show only the date in local timezone
 * @param timestamp - Unix timestamp in milliseconds or Date object
 * @returns Formatted date string in local timezone
 */
export const formatLocalDateOnly = (timestamp: number | Date): string => {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

/**
 * Convert a UTC timestamp to local timezone and format it
 * @param utcTimestamp - UTC timestamp in milliseconds
 * @param options - Intl.DateTimeFormatOptions for customization
 * @returns Formatted date string in local timezone
 */
export const formatUTCToLocal = (
  utcTimestamp: number,
  options: Intl.DateTimeFormatOptions = {}
): string => {
  // Create a new Date object from the UTC timestamp
  const date = new Date(utcTimestamp);

  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
    ...options,
  };

  return date.toLocaleString(undefined, defaultOptions);
};

/**
 * Get the current timezone offset as a string
 * @returns Timezone offset string (e.g., "UTC-5", "UTC+1")
 */
export const getTimezoneOffset = (): string => {
  const offset = new Date().getTimezoneOffset();
  const hours = Math.abs(Math.floor(offset / 60));
  const minutes = Math.abs(offset % 60);
  const sign = offset <= 0 ? '+' : '-';

  if (minutes === 0) {
    return `UTC${sign}${hours}`;
  }
  return `UTC${sign}${hours}:${minutes.toString().padStart(2, '0')}`;
};

/**
 * Format a timestamp as relative time (e.g., "2 days ago", "3 months ago")
 * @param timestamp - Unix timestamp in seconds
 * @returns Formatted relative time string
 */
export const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp * 1000;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
};
