import { createPlayIdentityResolver } from '../../src/backend/services/playIdentity';
import { TrackMapper } from '../../src/backend/services/trackMappingService';
import {
  AlbumMapping,
  CollectionItem,
  TrackMapping,
} from '../../src/shared/types';

const item = (id: number, artist: string, title: string): CollectionItem => ({
  id,
  release: {
    id,
    title,
    artist,
    format: ['Vinyl'],
    label: [],
    resource_url: '',
  },
  date_added: '2024-01-01T00:00:00Z',
});

const albumMapping = (
  historyArtist: string,
  historyAlbum: string,
  collectionArtist: string,
  collectionAlbum: string,
  collectionId: number
): AlbumMapping => ({
  historyArtist,
  historyAlbum,
  collectionArtist,
  collectionAlbum,
  collectionId,
  createdAt: 1,
});

/** A track mapper from a list of mappings, matched case-insensitively */
const trackMapperFrom =
  (mappings: TrackMapping[]): TrackMapper =>
  (artist, album, track) => {
    if (album === null) return { artist, album, track, mapping: null };
    const m = mappings.find(
      x =>
        x.historyArtist.toLowerCase() === artist.toLowerCase() &&
        x.historyAlbum.toLowerCase() === album.toLowerCase() &&
        x.historyTrack.toLowerCase() === track.toLowerCase()
    );
    if (!m) return { artist, album, track, mapping: null };
    const sameAlbum =
      m.historyAlbum.toLowerCase() === m.cacheAlbum.toLowerCase();
    return sameAlbum
      ? { artist, album, track: m.cacheTrack, mapping: m }
      : {
          artist: m.cacheArtist,
          album: m.cacheAlbum,
          track: m.cacheTrack,
          mapping: m,
        };
  };

const dogProblems = item(5403896, 'The Format (2)', 'Dog Problems');
const lice = item(24813326, 'Aesop Rock, Homeboy Sandman', 'Lice');

const resolverWith = (
  overrides: Partial<Parameters<typeof createPlayIdentityResolver>[0]> = {}
) =>
  createPlayIdentityResolver({
    albumMappings: [
      albumMapping(
        'the format',
        'dog problems (bonus track version)',
        'The Format (2)',
        'Dog Problems',
        5403896
      ),
      albumMapping(
        'lice',
        'lice',
        'Aesop Rock, Homeboy Sandman',
        'Lice',
        24813326
      ),
    ],
    mapTrack: trackMapperFrom([]),
    resolveArtist: name => name.toLowerCase(),
    collection: [dogProblems, lice],
    fuzzyKey: (artist, album) =>
      `${artist.toLowerCase().replace(/\s*\(\d+\)$/, '')}|${album.toLowerCase()}`,
    ...overrides,
  });

describe('createPlayIdentityResolver', () => {
  it('counts album versions joined by a mapping as one album', () => {
    const resolve = resolverWith();

    const plain = resolve.play('The Format', 'Dog Problems', 'Time Bomb');
    const bonus = resolve.play(
      'The Format',
      'Dog Problems (Bonus Track Version)',
      'Time Bomb'
    );

    expect(bonus.albumKey).toBe(plain.albumKey);
    expect(bonus.trackKey).toBe(plain.trackKey);
    expect(bonus.album).toBe('Dog Problems');
    // The scrobbled artist is kept, never the collection's "The Format (2)"
    expect(bonus.artist).toBe('The Format');
  });

  it('names every version of a merged album by the name its mapping points to', () => {
    const resolve = resolverWith();

    expect(resolve.play('The Format', 'dog problems', 'Pick Me Up').album).toBe(
      'Dog Problems'
    );
  });

  it('finds the owned record through a mapping and by name', () => {
    const resolve = resolverWith();

    expect(resolve.play('Lice', 'Lice', 'Katz').collectionItem).toBe(lice);
    expect(
      resolve.play('The Format', 'Dog Problems', 'Time Bomb').collectionItem
    ).toBe(dogProblems);
    expect(
      resolve.play(
        'The Format',
        'Interventions + Lullabies',
        'The First Single'
      ).collectionItem
    ).toBeUndefined();
  });

  it('every version of a merged album shares its owner', () => {
    // Exact-only name matching: only the merged album can tie the plain
    // "dog problems" to the record "The Format (2) / Dog Problems"
    const resolve = resolverWith({ fuzzyKey: (a, b) => `${a}|${b}` });

    expect(
      resolve.play('the format', 'dog problems', 'Time Bomb').collectionItem
    ).toBe(dogProblems);
  });

  it('ignores an unlinked mapping for ownership but still merges versions', () => {
    const resolve = resolverWith({
      albumMappings: [
        albumMapping('prof', 'old album', 'prof', 'new album', 0),
      ],
      collection: [],
    });

    const old = resolve.play('Prof', 'Old Album', 'Kia Boy');
    expect(old.albumKey).toBe(resolve.play('Prof', 'New Album', 'X').albumKey);
    expect(old.collectionItem).toBeUndefined();
  });

  it('moves a play with a track mapping to another album, then merges that album', () => {
    const resolve = resolverWith({
      mapTrack: trackMapperFrom([
        {
          historyArtist: 'the format',
          historyAlbum: 'b-sides',
          historyTrack: 'time bomb (demo)',
          cacheArtist: 'The Format',
          cacheAlbum: 'Dog Problems (Bonus Track Version)',
          cacheTrack: 'Time Bomb',
          createdAt: 1,
        },
      ]),
    });

    const moved = resolve.play('The Format', 'B-Sides', 'Time Bomb (Demo)');
    const plain = resolve.play('The Format', 'Dog Problems', 'Time Bomb');

    expect(moved.trackKey).toBe(plain.trackKey);
    expect(moved.album).toBe('Dog Problems');
    expect(moved.track).toBe('Time Bomb');
    expect(moved.collectionItem).toBe(dogProblems);
  });

  it('keeps a same-album rename on its album', () => {
    const resolve = resolverWith({
      mapTrack: trackMapperFrom([
        {
          historyArtist: 'prof',
          historyAlbum: 'old album',
          historyTrack: 'dirt work',
          cacheArtist: 'prof',
          cacheAlbum: 'old album',
          cacheTrack: 'Dirty Work',
          createdAt: 1,
        },
      ]),
    });

    const renamed = resolve.play('Prof', 'Old Album', 'Dirt Work');

    expect(renamed.track).toBe('Dirty Work');
    expect(renamed.trackKey).toBe(
      resolve.play('Prof', 'Old Album', 'Dirty Work').trackKey
    );
  });

  it('groups artist aliases together', () => {
    const resolve = resolverWith({
      resolveArtist: name =>
        name.toLowerCase() === 'the afghan whigs'
          ? 'afghan whigs'
          : name.toLowerCase(),
    });

    expect(
      resolve.play('The Afghan Whigs', 'Gentlemen', 'Debonair').trackKey
    ).toBe(resolve.play('Afghan Whigs', 'Gentlemen', 'Debonair').trackKey);
  });

  it('treats spellings of one track as one track', () => {
    const resolve = resolverWith();

    expect(resolve.play('Lice', 'Lice', 'Katz (feat. X)').trackKey).toBe(
      resolve.play('Lice', 'Lice', 'Katz').trackKey
    );
  });

  it('keeps unresolved plays apart from a real album called "Unknown album"', () => {
    const resolve = resolverWith();

    const unresolved = resolve.play('The Format', null, 'Time Bomb');
    const literal = resolve.play('The Format', 'Unknown album', 'Time Bomb');

    expect(unresolved.album).toBeNull();
    expect(unresolved.albumKey).toBeNull();
    expect(unresolved.collectionItem).toBeUndefined();
    expect(unresolved.trackKey).not.toBe(literal.trackKey);
  });

  it('keeps the same title on different albums apart', () => {
    const resolve = resolverWith();

    expect(
      resolve.play('The Format', 'Dog Problems', 'Time Bomb').trackKey
    ).not.toBe(resolve.play('The Format', 'Live', 'Time Bomb').trackKey);
  });

  it('resolves an album without a track', () => {
    const resolve = resolverWith();

    const album = resolve.album(
      'The Format',
      'Dog Problems (Bonus Track Version)'
    );

    expect(album.album).toBe('Dog Problems');
    expect(album.albumKey).toBe(
      resolve.play('The Format', 'Dog Problems', 'Time Bomb').albumKey
    );
    expect(album.collectionItem).toBe(dogProblems);
  });
});

describe('ownership precedence', () => {
  it('prefers an exact title over a spelling-tolerant one', () => {
    const deluxe = item(1, 'The Format', 'Dog Problems (Deluxe)');
    const standard = item(2, 'The Format', 'Dog Problems');
    const resolve = createPlayIdentityResolver({
      albumMappings: [],
      mapTrack: trackMapperFrom([]),
      resolveArtist: name => name.toLowerCase(),
      // Tolerant matching treats the deluxe edition as the same title
      collection: [deluxe, standard],
      fuzzyKey: (artist, album) =>
        `${artist.toLowerCase()}|${album.toLowerCase().replace(/\s*\(deluxe\)$/, '')}`,
    });

    expect(resolve.play('The Format', 'Dog Problems', 'X').collectionItem).toBe(
      standard
    );
    expect(
      resolve.play('The Format', 'Dog Problems (Deluxe)', 'X').collectionItem
    ).toBe(deluxe);
  });
});

describe('movesPlaysTo', () => {
  const toTheFormat = (artist: string) => artist.toLowerCase() === 'the format';
  const moving = (historyArtist: string, historyAlbum: string) =>
    createPlayIdentityResolver({
      albumMappings: [
        albumMapping('misc', 'odds', 'Teh Format', 'Odds And Ends', 9),
      ],
      mapTrack: trackMapperFrom([]),
      trackMappings: [
        {
          historyArtist,
          historyAlbum,
          historyTrack: 'time bomb',
          cacheArtist: 'The Format',
          cacheAlbum: 'Dog Problems',
          cacheTrack: 'Time Bomb',
          createdAt: 1,
        },
      ],
      resolveArtist: name => name.toLowerCase(),
      collection: [],
      fuzzyKey: (artist, album) => `${artist}|${album}`,
    }).movesPlaysTo(toTheFormat);

  it('matches the source artist the way track mappings do', () => {
    const could = moving('Teh Format!', 'singles');

    expect(could('teh format', 'singles')).toBe(true);
    expect(could('someone else', 'singles')).toBe(false);
    expect(could('teh format', null)).toBe(false);
  });

  it('matches a source named by the album a mapping merges into', () => {
    // Track mappings are also looked up under the merged album's name
    const could = moving('Teh Format', 'odds and ends');

    expect(could('misc', 'odds')).toBe(true);
  });
});

describe('ownedByArtist', () => {
  const blockhead = item(20948779, 'Aesop Rock, Blockhead', 'Garbology');
  const skelethon = item(4, 'Aesop Rock', 'Skelethon');
  const afghan = item(5, 'The Afghan Whigs (2)', 'Gentlemen');
  const resolve = createPlayIdentityResolver({
    albumMappings: [
      albumMapping(
        'aesop rock',
        'garbology',
        'Aesop Rock, Blockhead',
        'Garbology',
        20948779
      ),
      // Unlinked mappings never make anything owned
      albumMapping('aesop rock', 'none shall pass', 'x', 'y', 0),
    ],
    mapTrack: trackMapperFrom([]),
    resolveArtist: name =>
      name.toLowerCase() === 'the afghan whigs'
        ? 'afghan whigs'
        : name.toLowerCase(),
    collection: [blockhead, skelethon, afghan],
    fuzzyKey: (artist, album) =>
      `${artist.toLowerCase()}|${album.toLowerCase()}`,
  });

  it("counts the artist's own records and ones linked to them by a mapping", () => {
    expect(resolve.ownedByArtist('Aesop Rock')).toEqual([skelethon, blockhead]);
  });

  it('counts a record once even when the collection lists it twice', () => {
    const twice = createPlayIdentityResolver({
      albumMappings: [],
      mapTrack: trackMapperFrom([]),
      resolveArtist: name => name.toLowerCase(),
      // The cached collection can repeat items (stale page files)
      collection: [skelethon, { ...skelethon }],
      fuzzyKey: (artist, album) => `${artist}|${album}`,
    });

    expect(twice.ownedByArtist('Aesop Rock')).toHaveLength(1);
  });

  it('follows artist aliases and ignores Discogs number suffixes', () => {
    expect(resolve.ownedByArtist('Afghan Whigs')).toEqual([afghan]);
  });

  it('is empty for an artist with nothing owned', () => {
    expect(resolve.ownedByArtist('Lice')).toEqual([]);
  });
});

describe('linked ownership', () => {
  it('a link on any version of a merged album beats a name match', () => {
    const copy1 = item(1, 'The Format', 'Dog Problems');
    const copy2 = item(2, 'The Format', 'Dog Problems');
    const resolve = createPlayIdentityResolver({
      albumMappings: [
        albumMapping(
          'the format',
          'dog problems (bonus track version)',
          'The Format',
          'Dog Problems',
          2
        ),
      ],
      mapTrack: trackMapperFrom([]),
      resolveArtist: name => name.toLowerCase(),
      collection: [copy1, copy2],
      fuzzyKey: (artist, album) =>
        `${artist.toLowerCase()}|${album.toLowerCase()}`,
    });

    expect(resolve.album('The Format', 'Dog Problems').collectionItem).toBe(
      copy2
    );
  });
});

describe('record keys and collaboration suffixes', () => {
  const base = {
    mapTrack: trackMapperFrom([]),
    resolveArtist: (name: string) => name.toLowerCase(),
    fuzzyKey: (artist: string, album: string) =>
      `${artist.toLowerCase()}|${album.toLowerCase()}`,
  };

  it("keeps two records apart when one's name is mapped to the other", () => {
    const record = item(1, 'Band', 'Record');
    const box = item(2, 'Band', 'Record Deluxe Box');
    const resolve = createPlayIdentityResolver({
      ...base,
      albumMappings: [
        albumMapping('band', 'record', 'Band', 'Record Deluxe Box', 2),
      ],
      collection: [record, box],
    });

    expect(resolve.recordKey(record)).not.toBe(resolve.recordKey(box));
    expect(resolve.play('band', 'record', 'Song').collectionItem).toBe(box);
  });

  it('matches a collaboration whose Discogs names all carry number suffixes', () => {
    const split = item(1, 'A (2), B (3)', 'Split');
    const resolve = createPlayIdentityResolver({
      ...base,
      albumMappings: [],
      collection: [split],
    });

    expect(resolve.play('a, b', 'split', 'Song').collectionItem).toBe(split);
  });
});

describe('track mappings across album versions', () => {
  it('a merge saved under one version applies to plays on every version', () => {
    const merge = {
      historyArtist: 'the format',
      historyAlbum: 'dog problems',
      historyTrack: 'time bomb (live)',
      cacheArtist: 'the format',
      cacheAlbum: 'dog problems',
      cacheTrack: 'Time Bomb',
      createdAt: 1,
    };
    const resolve = resolverWith({
      mapTrack: trackMapperFrom([merge]),
      trackMappings: [merge],
    });

    // Scrobbled on the bonus-track version; the merge was saved on the plain one
    const played = resolve.play(
      'The Format',
      'Dog Problems (Bonus Track Version)',
      'Time Bomb (Live)'
    );

    expect(played.track).toBe('Time Bomb');
    expect(played.trackKey).toBe(
      resolve.play('The Format', 'Dog Problems', 'Time Bomb').trackKey
    );
  });
});

describe('collaboration credits', () => {
  it('a record credited to several artists owns the same album under one of them', () => {
    const garbology = item(1, 'Aesop Rock, Blockhead', 'Garbology');
    const resolve = createPlayIdentityResolver({
      albumMappings: [],
      mapTrack: trackMapperFrom([]),
      resolveArtist: name => name.toLowerCase(),
      collection: [garbology],
      fuzzyKey: (artist, album) =>
        `${artist.toLowerCase()}|${album.toLowerCase()}`,
    });

    expect(resolve.play('Aesop Rock', 'Garbology', 'X').collectionItem).toBe(
      garbology
    );
    expect(resolve.play('Blockhead', 'Garbology', 'X').collectionItem).toBe(
      garbology
    );
    // Another title by one of them is not this record
    expect(
      resolve.play('Aesop Rock', 'Skelethon', 'X').collectionItem
    ).toBeUndefined();
  });
});

describe('movesPlaysTo with merges saved on another version', () => {
  it('sees a play another version of the album sends to the target', () => {
    // A/Version merged into B/Base; a track mapping saved on A/Version moves
    // the song to C. B/Base's play of the song therefore counts as C.
    const move = {
      historyArtist: 'a',
      historyAlbum: 'version',
      historyTrack: 'song',
      cacheArtist: 'c',
      cacheAlbum: 'elsewhere',
      cacheTrack: 'Song',
      createdAt: 1,
    };
    const resolve = createPlayIdentityResolver({
      albumMappings: [albumMapping('a', 'version', 'b', 'base', 0)],
      mapTrack: trackMapperFrom([move]),
      trackMappings: [move],
      resolveArtist: name => name.toLowerCase(),
      collection: [],
      fuzzyKey: (artist, album) => `${artist}|${album}`,
    });

    expect(resolve.play('b', 'base', 'song').artist).toBe('c');
    expect(resolve.movesPlaysTo(name => name === 'c')('b', 'base')).toBe(true);
  });
});
