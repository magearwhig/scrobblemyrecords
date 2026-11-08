/**
 * Utility functions for Spotify integration.
 * Provides simple deep-linking to Spotify without requiring OAuth or API authentication.
 */

import { normalizeForMatching } from '../../shared/utils/trackNormalization';

/**
 * Plain keyword search for Spotify. Field filters ("track:You Do You
 * artist:Bear In Heaven") find nothing in the desktop app when a name has
 * more than one word, so names are joined as keywords, without Discogs
 * suffixes ("(2)") or edition tags ("[Explicit]", "(Remastered)").
 */
function searchQuery(...names: string[]): string {
  return names
    .map(name => normalizeForMatching(name))
    .filter(Boolean)
    .join(' ');
}

/**
 * Opens a track on Spotify (desktop app or web player).
 * Tries desktop app first via spotify: URI, falls back to web player.
 *
 * @param artist - Artist name
 * @param track - Track name
 * @param album - Optional album name for better search accuracy
 */
export const playTrackOnSpotify = (
  artist: string,
  track: string,
  album?: string
): void => {
  const query = album
    ? searchQuery(artist, track, album)
    : searchQuery(artist, track);

  // Try desktop app first
  const spotifyUri = `spotify:search:${encodeURIComponent(query)}`;

  // Create a temporary link to trigger the spotify: URI
  const desktopLink = document.createElement('a');
  desktopLink.href = spotifyUri;
  desktopLink.style.display = 'none';
  document.body.appendChild(desktopLink);
  desktopLink.click();
  document.body.removeChild(desktopLink);

  // Fallback to web player after a short delay (in case desktop app didn't open)
  setTimeout(() => {
    const webUrl = `https://open.spotify.com/search/${encodeURIComponent(query)}`;
    window.open(webUrl, '_blank');
  }, 500);
};

/**
 * Opens an album on Spotify (desktop app or web player).
 *
 * @param artist - Artist name
 * @param album - Album name
 */
export const playAlbumOnSpotify = (artist: string, album: string): void => {
  const query = searchQuery(artist, album);

  // Try desktop app first
  const spotifyUri = `spotify:search:${encodeURIComponent(query)}`;

  // Create a temporary link to trigger the spotify: URI
  const desktopLink = document.createElement('a');
  desktopLink.href = spotifyUri;
  desktopLink.style.display = 'none';
  document.body.appendChild(desktopLink);
  desktopLink.click();
  document.body.removeChild(desktopLink);

  // Fallback to web player after a short delay
  setTimeout(() => {
    const webUrl = `https://open.spotify.com/search/${encodeURIComponent(query)}`;
    window.open(webUrl, '_blank');
  }, 500);
};

/**
 * Opens an artist on Spotify (desktop app or web player).
 *
 * @param artist - Artist name
 */
export const playArtistOnSpotify = (artist: string): void => {
  const query = searchQuery(artist);
  const spotifyUri = `spotify:search:${encodeURIComponent(query)}`;

  // Create a temporary link to trigger the spotify: URI
  const desktopLink = document.createElement('a');
  desktopLink.href = spotifyUri;
  desktopLink.style.display = 'none';
  document.body.appendChild(desktopLink);
  desktopLink.click();
  document.body.removeChild(desktopLink);

  // Fallback to web player after a short delay
  setTimeout(() => {
    const webUrl = `https://open.spotify.com/search/${encodeURIComponent(query)}`;
    window.open(webUrl, '_blank');
  }, 500);
};
