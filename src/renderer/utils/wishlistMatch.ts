import { trackMatchKey } from '../../shared/utils/trackNormalization';

/** A Discogs wantlist entry keyed for matching against Last.fm names */
export interface WishlistMatchItem {
  artist: string;
  title: string;
}

/**
 * Keys a name the way `trackMatchKey` does: "&" reads as "and", and case,
 * punctuation and spacing are ignored, so Discogs' "Margot & The Nuclear So
 * And So's" matches Last.fm's "Margot and the Nuclear So and So's"
 */
export function wishlistMatchItem(artist: string, title: string) {
  return { artist: trackMatchKey(artist), title: trackMatchKey(title) };
}

/**
 * Whether an artist and album from Last.fm are on the wantlist. Also catches
 * Last.fm artists that carry the album title ("Andrew Bird & The Mysterious
 * Production Of Eggs" for Andrew Bird's "The Mysterious Production Of Eggs").
 */
export function isInWishlist(
  items: WishlistMatchItem[],
  artist: string,
  album: string
): boolean {
  const wanted = wishlistMatchItem(artist, album);
  const combined = wanted.artist + wanted.title;
  return items.some(
    item =>
      (wanted.artist === item.artist && wanted.title === item.title) ||
      // Short titles would match by accident
      (item.title.length >= 10 &&
        combined.includes(item.artist) &&
        combined.includes(item.title))
  );
}
