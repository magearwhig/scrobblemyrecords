import {
  editionlessAlbumKey,
  findAlbumMergeSuggestions,
} from '../../src/backend/services/albumMergeSuggestions';
import { AlbumMapping, CollectionItem } from '../../src/shared/types';

const ownedItem = (
  id: number,
  artist: string,
  title: string,
  dateAdded = '2020-01-01T00:00:00-08:00'
): CollectionItem =>
  ({
    id,
    date_added: dateAdded,
    release: { id, artist, title },
  }) as unknown as CollectionItem;

const mapping = (overrides: Partial<AlbumMapping>): AlbumMapping => ({
  historyArtist: 'artist',
  historyAlbum: 'album',
  collectionId: 0,
  collectionArtist: 'artist',
  collectionAlbum: 'album',
  createdAt: 0,
  ...overrides,
});

describe('editionlessAlbumKey', () => {
  it('drops edition tags but keeps other parentheses', () => {
    expect(editionlessAlbumKey('Old [Explicit] [+Digital Booklet]')).toBe(
      editionlessAlbumKey('Old')
    );
    expect(editionlessAlbumKey('Gentlemen (Deluxe Edition)')).toBe(
      editionlessAlbumKey('gentlemen')
    );
    expect(
      editionlessAlbumKey('Turn On The Bright Lights - 2012 Remaster')
    ).toBe(editionlessAlbumKey('Turn On The Bright Lights'));
    expect(editionlessAlbumKey('Tallulah (Live)')).not.toBe(
      editionlessAlbumKey('Tallulah')
    );
    expect(editionlessAlbumKey('Album [Live]')).not.toBe(
      editionlessAlbumKey('Album')
    );
    expect(editionlessAlbumKey('Album (Live Version)')).not.toBe(
      editionlessAlbumKey('Album')
    );
    expect(editionlessAlbumKey('Album (Demos Edition)')).not.toBe(
      editionlessAlbumKey('Album')
    );
  });
});

describe('findAlbumMergeSuggestions', () => {
  it('suggests merging edition versions into the plain title when not owned', () => {
    const [suggestion, ...rest] = findAlbumMergeSuggestions({
      albums: {
        'danny brown|old': { playCount: 59 },
        'danny brown|old [explicit] [+digital booklet]': { playCount: 53 },
        'danny brown|xxx': { playCount: 10 },
      },
      mappings: [],
      collection: [],
    });

    expect(rest).toHaveLength(0);
    expect(suggestion.totalPlays).toBe(112);
    expect(suggestion.target).toEqual({
      artist: 'danny brown',
      album: 'old',
      collectionId: 0,
    });
    expect(suggestion.mappings).toEqual([
      {
        historyArtist: 'danny brown',
        historyAlbum: 'old [explicit] [+digital booklet]',
        collectionId: 0,
        collectionArtist: 'danny brown',
        collectionAlbum: 'old',
      },
    ]);
    expect(suggestion.versions.find(v => v.isTarget)?.album).toBe('old');
  });

  it('prefers the plain title over a more-played edition', () => {
    const [suggestion] = findAlbumMergeSuggestions({
      albums: {
        'glass animals|zaba (deluxe)': { playCount: 15 },
        'glass animals|zaba': { playCount: 11 },
      },
      mappings: [],
      collection: [],
    });

    expect(suggestion.target.album).toBe('zaba');
    expect(suggestion.mappings.map(m => m.historyAlbum)).toEqual([
      'zaba (deluxe)',
    ]);
  });

  it('links every version to the earliest owned copy', () => {
    const [suggestion] = findAlbumMergeSuggestions({
      albums: {
        'killer mike|r.a.p. music [explicit] [+digital booklet]': {
          playCount: 66,
        },
        'killer mike|r.a.p. music': { playCount: 20 },
      },
      mappings: [],
      collection: [
        ownedItem(2, 'Killer Mike', 'R.A.P. Music', '2022-01-01T00:00:00Z'),
        ownedItem(1, 'Killer Mike', 'R.A.P. Music', '2019-01-01T00:00:00Z'),
      ],
    });

    expect(suggestion.target).toEqual({
      artist: 'Killer Mike',
      album: 'R.A.P. Music',
      collectionId: 1,
    });
    // The plain history name matches the collection title, so only the
    // tagged version needs a mapping
    expect(suggestion.mappings).toEqual([
      {
        historyArtist: 'killer mike',
        historyAlbum: 'r.a.p. music [explicit] [+digital booklet]',
        collectionId: 1,
        collectionArtist: 'Killer Mike',
        collectionAlbum: 'R.A.P. Music',
      },
    ]);
  });

  it('merges into an existing collection link without remapping it', () => {
    const [suggestion] = findAlbumMergeSuggestions({
      albums: {
        'ted leo and the pharmacists|hearts of oak': { playCount: 44 },
        'ted leo & the pharmacists|hearts of oak': { playCount: 9 },
      },
      mappings: [
        mapping({
          historyArtist: 'ted leo and the pharmacists',
          historyAlbum: 'hearts of oak',
          collectionId: 7,
          collectionArtist: 'Ted Leo / Pharmacists',
          collectionAlbum: 'Hearts Of Oak',
        }),
      ],
      // The resolver links the artists of a collection-linked mapping
      resolveArtist: artist =>
        artist.toLowerCase() === 'ted leo / pharmacists'
          ? 'ted leo and the pharmacists'
          : artist,
      collection: [],
    });

    expect(suggestion.target.collectionId).toBe(7);
    expect(suggestion.mappings).toEqual([
      expect.objectContaining({
        historyArtist: 'ted leo & the pharmacists',
        collectionId: 7,
      }),
    ]);
  });

  it('does not suggest albums Top Albums already counts as one', () => {
    const suggestions = findAlbumMergeSuggestions({
      albums: {
        'the afghan whigs|1965': { playCount: 89 },
        'afghan whigs|1965': { playCount: 1 },
        'the go-betweens|tallulah': { playCount: 3 },
        'the go-betweens|tallulah (remastered)': { playCount: 4 },
      },
      mappings: [
        mapping({
          historyArtist: 'the go-betweens',
          historyAlbum: 'tallulah (remastered)',
          collectionArtist: 'the go-betweens',
          collectionAlbum: 'tallulah',
        }),
      ],
      resolveArtist: artist =>
        artist === 'afghan whigs' ? 'the afghan whigs' : artist,
      collection: [],
    });

    expect(suggestions).toEqual([]);
  });

  it('suggests artist spellings the resolver has not linked', () => {
    const [suggestion] = findAlbumMergeSuggestions({
      albums: {
        "peter bjorn & john|writer's block": { playCount: 55 },
        "peter bjorn and john|writer's block": { playCount: 17 },
      },
      mappings: [],
      collection: [],
    });

    expect(suggestion.target.artist).toBe('peter bjorn & john');
    expect(suggestion.mappings[0].historyArtist).toBe('peter bjorn and john');
  });

  it('leaves out dismissed suggestions', () => {
    const albums = {
      'chromatics|kill for love': { playCount: 53 },
      'chromatics|kill for love (deluxe)': { playCount: 11 },
    };
    const [suggestion] = findAlbumMergeSuggestions({
      albums,
      mappings: [],
      collection: [],
    });

    expect(
      findAlbumMergeSuggestions({
        albums,
        mappings: [],
        collection: [],
        dismissedIds: new Set([suggestion.id]),
      })
    ).toEqual([]);
  });

  it('re-points an owned title that is mapped to another version', () => {
    // "album" is merged into "album (deluxe)"; the owned copy is "Album"
    const [suggestion] = findAlbumMergeSuggestions({
      albums: {
        'artist|album': { playCount: 5 },
        'artist|album (deluxe)': { playCount: 3 },
        'artist|album [explicit]': { playCount: 2 },
      },
      mappings: [
        mapping({
          historyAlbum: 'album',
          collectionAlbum: 'album (deluxe)',
        }),
      ],
      collection: [ownedItem(9, 'Artist', 'Album')],
    });

    expect(suggestion.target.collectionId).toBe(9);
    expect(suggestion.mappings.map(m => m.historyAlbum).sort()).toEqual([
      'album',
      'album (deluxe)',
      'album [explicit]',
    ]);
    expect(suggestion.mappings.every(m => m.collectionId === 9)).toBe(true);
  });

  it('identifies a suggestion by its history album names, not artist aliases', () => {
    const [suggestion] = findAlbumMergeSuggestions({
      albums: {
        'the secret machines|now here is nowhere': { playCount: 4 },
        'secret machines|now here is nowhere': { playCount: 42 },
      },
      mappings: [],
      resolveArtist: artist => artist.toUpperCase(),
      collection: [],
    });

    expect(suggestion.id).toBe(
      'secret machines|now here is nowhere + the secret machines|now here is nowhere'
    );
  });

  it('sorts by total plays', () => {
    const suggestions = findAlbumMergeSuggestions({
      albums: {
        'a|small': { playCount: 1 },
        'a|small (deluxe)': { playCount: 1 },
        'b|big': { playCount: 50 },
        'b|big (remastered)': { playCount: 5 },
      },
      mappings: [],
      collection: [],
    });

    expect(suggestions.map(s => s.target.album)).toEqual(['big', 'small']);
  });
});
