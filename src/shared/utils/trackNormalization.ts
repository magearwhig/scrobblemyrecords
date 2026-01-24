/**
 * Track/Artist/Album name normalization utilities
 *
 * These functions help match the same track across different services
 * (Last.fm, Discogs, etc.) that may store names differently:
 * - "Request Denied" vs "Request Denied [Explicit]"
 * - "El-p" vs "El-P"
 * - "Cancer 4 Cure" vs "Cancer 4 Cure [Explicit]"
 */

/**
 * Normalize a string for fuzzy matching (track, artist, or album names)
 * Strips common suffixes like [Explicit], (Remastered), etc.
 */
export function normalizeForMatching(str: string): string {
  return (
    str
      .toLowerCase()
      // Remove [Explicit], [Clean], [Remastered], [Deluxe], etc.
      .replace(
        /\s*\[(explicit|clean|remaster(ed)?|deluxe|deluxe edition|special edition|expanded|expanded edition|anniversary|anniversary edition|bonus tracks?|vinyl|lp|cd|digital|limited|limited edition)\]\s*/gi,
        ''
      )
      // Remove (Explicit), (Remastered 2021), (Deluxe Edition), etc.
      .replace(
        /\s*\((explicit|clean|remaster(ed)?(\s+\d{4})?|deluxe(\s+edition)?|special edition|expanded(\s+edition)?|anniversary(\s+edition)?|\d+th anniversary|bonus tracks?|limited(\s+edition)?)\)\s*/gi,
        ''
      )
      // Remove "at XX" anniversary suffixes (e.g., "Gentlemen at 21")
      .replace(/\s+at\s+\d+\s*$/gi, '')
      // Remove feat./featuring variations at end or in brackets/parens
      .replace(/\s*(\(|\[)?feat\.?\s+[^)\]]+(\)|\])?\s*$/gi, '')
      // Normalize various quote styles to nothing
      .replace(/[""''"`]/g, '')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Create a normalized key for track matching
 * Used to identify the same track across different naming conventions
 */
export function createNormalizedTrackKey(
  artist: string,
  album: string,
  track: string
): string {
  return `${normalizeForMatching(artist)}|${normalizeForMatching(album)}|${normalizeForMatching(track)}`;
}
