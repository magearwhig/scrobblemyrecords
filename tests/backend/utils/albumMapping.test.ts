import { AlbumMapping } from '../../../src/shared/types';
import {
  albumGroupKey,
  createAlbumCanonicalizer,
  createCollectionNameResolver,
  isCollectionLinked,
} from '../../../src/shared/utils/albumMapping';

const mapping = (overrides: Partial<AlbumMapping>): AlbumMapping => ({
  historyArtist: 'the go-betweens',
  historyAlbum: 'tallulah (remastered)',
  collectionId: 7,
  collectionArtist: 'The Go-Betweens',
  collectionAlbum: 'Tallulah',
  createdAt: 0,
  ...overrides,
});

describe('albumMapping utils', () => {
  it('isCollectionLinked treats collectionId 0 as unlinked', () => {
    expect(isCollectionLinked({ collectionId: 7 })).toBe(true);
    expect(isCollectionLinked({ collectionId: 0 })).toBe(false);
  });

  describe('createAlbumCanonicalizer', () => {
    it('resolves a mapped history album to its target, case-insensitively', () => {
      const canonicalize = createAlbumCanonicalizer([mapping({})]);

      expect(canonicalize('The Go-Betweens', 'Tallulah (Remastered)')).toEqual({
        artist: 'The Go-Betweens',
        album: 'Tallulah',
        key: 'thegobetweens|tallulah',
        mapping: mapping({}),
      });
    });

    it('resolves an unmapped album to itself with the same key as its versions', () => {
      const canonicalize = createAlbumCanonicalizer([mapping({})]);

      const own = canonicalize('the go-betweens', 'tallulah');
      expect(own).toEqual({
        artist: 'the go-betweens',
        album: 'tallulah',
        key: 'thegobetweens|tallulah',
      });
      expect(own.key).toBe(
        canonicalize('the go-betweens', 'tallulah (remastered)').key
      );
    });

    it('groups a mapped version with an unmapped spelling of its target', () => {
      // The bonus version maps to the Discogs name "The Format (2)"; the plain
      // history name has no mapping but is the same album
      const canonicalize = createAlbumCanonicalizer([
        mapping({
          historyArtist: 'the format',
          historyAlbum: 'dog problems (bonus track version)',
          collectionArtist: 'The Format (2)',
          collectionAlbum: 'Dog Problems',
        }),
      ]);

      expect(
        canonicalize('the format', 'dog problems (bonus track version)').key
      ).toBe(canonicalize('the format', 'dog problems').key);
    });

    it('groups artist spellings the resolver treats as one artist', () => {
      const canonicalize = createAlbumCanonicalizer([], artist =>
        artist === 'afghan whigs' ? 'the afghan whigs' : artist
      );

      expect(canonicalize('afghan whigs', '1965').key).toBe(
        canonicalize('the afghan whigs', '1965').key
      );
    });

    it('groups an unknown Discogs-numbered artist with the plain name', () => {
      const canonicalize = createAlbumCanonicalizer([], artist =>
        artist.toLowerCase() === 'afghan whigs' ? 'the afghan whigs' : artist
      );

      expect(canonicalize('Afghan Whigs (2)', '1965').key).toBe(
        canonicalize('the afghan whigs', '1965').key
      );
    });

    it('tolerates missing mappings', () => {
      expect(createAlbumCanonicalizer(undefined)('a', 'b').key).toBe('a|b');
    });
  });

  describe('albumGroupKey', () => {
    it('ignores case, punctuation, accents and Discogs suffixes', () => {
      const key = albumGroupKey('Desaparecidos', 'Read Music, Speak Spanish');
      expect(albumGroupKey('desaparecidos', 'read music/speak spanish')).toBe(
        key
      );
      expect(albumGroupKey('Rodríguez', 'Cold Fact')).toBe(
        albumGroupKey('rodriguez', 'cold fact')
      );
      expect(albumGroupKey('Girls (5)', 'Album')).toBe(
        albumGroupKey('girls', 'album')
      );
    });

    it('keeps edition words, so versions still need a mapping', () => {
      expect(albumGroupKey('wye oak', 'shriek (deluxe version)')).not.toBe(
        albumGroupKey('wye oak', 'shriek')
      );
    });

    it('keeps names in other scripts distinct', () => {
      expect(albumGroupKey('きのこ帝国', '渦になる')).not.toBe(
        albumGroupKey('きのこ帝国', 'フェイクワールドワンダーランド')
      );
      expect(albumGroupKey('artist', '春 1')).not.toBe(
        albumGroupKey('artist', '夏 1')
      );
      // Devanagari vowel signs are combining marks that change the word
      const devanagari = ['क', 'का', 'कि', 'कु'].map(t =>
        albumGroupKey('artist', t)
      );
      expect(new Set(devanagari).size).toBe(4);
    });

    it('keeps emoji-only names with variation selectors distinct', () => {
      expect(albumGroupKey('artist', '♥️')).not.toBe(
        albumGroupKey('artist', '☀️')
      );
    });

    it('keeps punctuation-only names distinct', () => {
      expect(albumGroupKey('artist', '...')).not.toBe(
        albumGroupKey('artist', '!!!')
      );
    });
  });

  describe('createCollectionNameResolver', () => {
    it('returns the own name first, then linked history names', () => {
      const namesFor = createCollectionNameResolver([
        mapping({}),
        mapping({ historyAlbum: 'tallulah (live)', collectionId: 0 }),
        mapping({ historyAlbum: 'tallulah', collectionArtist: 'Other' }),
      ]);

      expect(namesFor('The Go-Betweens', 'TALLULAH')).toEqual([
        { artist: 'The Go-Betweens', album: 'TALLULAH' },
        { artist: 'the go-betweens', album: 'tallulah (remastered)' },
      ]);
    });

    it('drops a linked name identical to the own name', () => {
      const namesFor = createCollectionNameResolver([
        mapping({ historyAlbum: 'tallulah' }),
      ]);

      expect(namesFor('The Go-Betweens', 'Tallulah')).toHaveLength(1);
    });
  });
});
