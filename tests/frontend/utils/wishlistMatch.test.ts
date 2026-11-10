import {
  isInWishlist,
  wishlistMatchItem,
} from '../../../src/renderer/utils/wishlistMatch';

describe('isInWishlist', () => {
  const items = [
    wishlistMatchItem('The Oranges Band', 'The World & Everything In It'),
    wishlistMatchItem(
      "Margot & The Nuclear So And So's",
      'The Dust Of Retreat'
    ),
    wishlistMatchItem('Andrew Bird', 'The Mysterious Production Of Eggs'),
    wishlistMatchItem('Low (2)', 'Things We Lost In The Fire'),
  ];

  it('reads "&" as "and" in titles', () => {
    expect(
      isInWishlist(items, 'The Oranges Band', 'The World and Everything in It')
    ).toBe(true);
  });

  it('reads "&" as "and" in artist names and ignores apostrophes', () => {
    expect(
      isInWishlist(
        items,
        'Margot and the Nuclear So and Sos',
        'The Dust of Retreat'
      )
    ).toBe(true);
  });

  it('matches a Last.fm artist that carries the album title', () => {
    expect(
      isInWishlist(
        items,
        'Andrew Bird & The Mysterious Production Of Eggs',
        'The Mysterious Production Of Eggs'
      )
    ).toBe(true);
  });

  it('ignores Discogs disambiguation numbers', () => {
    expect(isInWishlist(items, 'Low', 'Things We Lost in the Fire')).toBe(true);
  });

  it('does not match a different album by the same artist', () => {
    expect(isInWishlist(items, 'The Oranges Band', 'All Around')).toBe(false);
  });
});
