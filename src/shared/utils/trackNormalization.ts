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
      // Strip Discogs disambiguation numbers: "(2)", "(3)", etc. at end of string
      // These are numeric suffixes Discogs uses to distinguish different artists with the same name
      .replace(/\s*\(\d+\)\s*$/g, '')
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

/**
 * Normalize an artist name for cross-source matching.
 *
 * Stricter than `normalizeForMatching` — also strips a leading "The " and
 * all non-alphanumeric characters. Required when matching artists across
 * sources that disagree on the article ("The Von Bondies" / "Von Bondies")
 * or punctuation ("Tyler, The Creator" / "Tyler the Creator").
 */
export function normalizeArtistName(name: string): string {
  if (!name) return '';
  return (
    name
      .toLowerCase()
      // Strip Discogs disambiguation suffix "(2)", "(3)", …
      .replace(/\s*\(\d+\)\s*$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      // Strip leading "the "
      .replace(/^the\s+/i, '')
      // Strip non-alphanumeric (keep spaces) — drops commas, ampersands, etc.
      .replace(/[^\w\s]/g, '')
      .trim()
  );
}

/**
 * Create a normalized "artist|album" key suitable for cross-source matching
 * (e.g. wishlist albums vs. extracted website items). Uses the strict
 * `normalizeArtistName` for the artist side and `normalizeForMatching` for
 * the album side (album names rarely benefit from "The" stripping but
 * commonly carry edition/remaster suffixes).
 */
export function createArtistAlbumKey(artist: string, album: string): string {
  return `${normalizeArtistName(artist)}|${normalizeForMatching(album)}`;
}
