import { AlbumMapping } from '../../../src/shared/types';
import {
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
        key: 'the go-betweens|tallulah',
        mapping: mapping({}),
      });
    });

    it('resolves an unmapped album to itself with the same key as its versions', () => {
      const canonicalize = createAlbumCanonicalizer([mapping({})]);

      const own = canonicalize('the go-betweens', 'tallulah');
      expect(own).toEqual({
        artist: 'the go-betweens',
        album: 'tallulah',
        key: 'the go-betweens|tallulah',
      });
      expect(own.key).toBe(
        canonicalize('the go-betweens', 'tallulah (remastered)').key
      );
    });

    it('tolerates missing mappings', () => {
      expect(createAlbumCanonicalizer(undefined)('a', 'b').key).toBe('a|b');
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
