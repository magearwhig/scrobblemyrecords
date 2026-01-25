/**
 * Utility functions for Spotify integration.
 * Provides simple deep-linking to Spotify without requiring OAuth or API authentication.
 */

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
  // Construct search query
  const query = album
    ? `track:${track} artist:${artist} album:${album}`
    : `track:${track} artist:${artist}`;

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
    const webQuery = album
      ? `${artist} ${track} ${album}`
      : `${artist} ${track}`;
    const webUrl = `https://open.spotify.com/search/${encodeURIComponent(webQuery)}`;
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
  // Construct search query for album
  const query = `album:${album} artist:${artist}`;

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
    const webUrl = `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${album}`)}`;
    window.open(webUrl, '_blank');
  }, 500);
};
