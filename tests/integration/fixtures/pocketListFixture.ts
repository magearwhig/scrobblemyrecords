/**
 * Hand-built PocketListModel with tricky names, for the PDF integration test
 * and the HTML tests. Built directly (not via buildPocketListModel) so the
 * renderer is tested independently of collation.
 */
import {
  POCKET_SECTION_BUCKETS,
  PocketBadge,
  PocketListAlbumGroup,
  PocketListArtistBlock,
  PocketListModel,
  PocketListSection,
  PocketListVersionLine,
  PocketSectionId,
} from '../../../src/backend/services/pocketList/pocketListTypes';

const OWNED: PocketBadge = { text: 'OWNED', tone: 'owned' };
const WANTED: PocketBadge = { text: 'WANTED', tone: 'wanted' };

let rowSeq = 0;

function version(
  status: 'owned' | 'wanted',
  textValue: string,
  extra: Partial<PocketListVersionLine> = {}
): PocketListVersionLine {
  rowSeq += 1;
  return {
    rowId: `row-${rowSeq}`,
    status,
    text: textValue,
    badges: [status === 'owned' ? OWNED : WANTED],
    credited: null,
    note: null,
    notes: null,
    ...extra,
  };
}

function album(
  title: string,
  year: number | null,
  versions: PocketListVersionLine[]
): PocketListAlbumGroup {
  return {
    title,
    year,
    versions,
    ownedCount: versions.filter(v => v.status === 'owned').length,
    wantedCount: versions.filter(v => v.status === 'wanted').length,
    badges: [],
  };
}

function artist(
  displayArtist: string,
  albums: PocketListAlbumGroup[],
  disambiguation: string | null = null
): PocketListArtistBlock {
  return {
    identityKey: displayArtist.toLowerCase(),
    displayArtist,
    disambiguation,
    albums,
  };
}

function simple(
  name: string,
  title: string,
  year: number,
  status: 'owned' | 'wanted' = 'owned'
): PocketListArtistBlock {
  return artist(name, [
    album(title, year, [version(status, `${year} · Label · Vinyl`)]),
  ]);
}

/** Artist whose block is longer than one page */
export const LONG_ARTIST = 'Long Block Orchestra';
/** Album group with more than MAX_UNSPLIT_VERSIONS versions */
export const LONG_GROUP_TITLE = 'Many Pressings Of The Same Record';

function buildSections(): Record<string, PocketListArtistBlock[]> {
  rowSeq = 0;
  const longAlbums: PocketListAlbumGroup[] = [];
  for (let i = 1; i <= 34; i++) {
    longAlbums.push(
      album(`Album Number ${String(i).padStart(2, '0')}`, 1970 + i, [
        version('owned', `${1970 + i} · Long Label · Vinyl`),
        version('wanted', `${1990 + i} · Reissue Label · LP, Album`),
      ])
    );
  }
  const manyVersions: PocketListVersionLine[] = [];
  for (let i = 1; i <= 50; i++) {
    manyVersions.push(
      version(
        i % 3 === 0 ? 'owned' : 'wanted',
        `${1980 + i} · Pressing ${i} · Vinyl`
      )
    );
  }

  return {
    'sec-num': [
      simple('2Pac', 'All Eyez On Me', 1996),
      simple('10,000 Maniacs', 'In My Tribe', 1987, 'wanted'),
      simple('!!!', 'Myth Takes', 2007),
    ],
    'sec-a': [
      simple('A Tribe Called Quest', 'The Low End Theory', 1991),
      simple('AC/DC', 'Back In Black', 1980, 'wanted'),
      artist('Æther Realm', [
        album('Tarot', 2017, [
          version('wanted', '2017 · Napalm · CD', {
            badges: [WANTED, { text: 'any version', tone: 'neutral' }],
          }),
        ]),
      ]),
    ],
    'sec-b': [
      simple('Beach House', 'Teen Dream', 2010),
      simple('The Beatles', 'Abbey Road', 1969),
      simple('Björk', 'Homogenic', 1997, 'wanted'),
      artist('Bob Dylan & The Band', [
        album(
          'The Basement Tapes Complete: The Bootleg Series Vol. 11 (Deluxe Edition, Remastered, With An Extremely Long Subtitle That Must Wrap)',
          2014,
          [
            version('wanted', '2014 · Columbia · Vinyl, 6xLP, Box Set', {
              note: 'OWNED: another version (1975 · Vinyl) +1 more',
              badges: [
                WANTED,
                { text: 'OWNED: another version', tone: 'owned' },
              ],
            }),
          ]
        ),
      ]),
    ],
    'sec-e': [simple('Émilie Simon', 'Végétal', 2006)],
    'sec-g': [
      simple('Girls', 'Album', 2009),
      artist(
        'Girls',
        [
          album('Father, Son, Holy Ghost', 2011, [
            version('wanted', '2011 · True Panther · Vinyl'),
          ]),
        ],
        'another artist named Girls · Discogs #2'
      ),
    ],
    'sec-l': [
      artist(LONG_ARTIST, [
        ...longAlbums.slice(0, 10),
        album(LONG_GROUP_TITLE, 1981, manyVersions),
        ...longAlbums.slice(10),
      ]),
      simple('Łona i Webber', 'Cztery i pół', 2016, 'wanted'),
    ],
    'sec-m': [
      simple('Mötley Crüe', 'Dr. Feelgood', 1989),
      simple('Muse & <Friends> "Quoted"', "Rock & Roll's <Greatest>", 2001),
    ],
    'sec-o': [
      simple('Ólafur Arnalds', 're:member', 2018),
      simple('Øresund Space Collective', 'Ode To A Black Hole', 2010, 'wanted'),
    ],
    'sec-s': [
      simple('Sigur Rós', 'Ágætis byrjun', 1999),
      simple('Straße', 'Fünf', 2003),
      simple('Stars ★ Above', 'Constellation ★★★', 2012, 'wanted'),
      simple(
        'Supercalifragilisticexpialidociousandevenlongerunbrokentoken',
        'Word',
        2020
      ),
    ],
    'sec-t': [
      simple('The The', 'Soul Mining', 1983),
      simple('Þeyr', 'Mjötviður Mær', 1981, 'wanted'),
    ],
    'sec-v': [simple('Various', 'Nuggets', 1972)],
    'sec-y': [simple('Yōko Kanno', 'Cowboy Bebop', 1998)],
    'sec-other': [
      simple('अनुष्का शंकर', 'राइज़', 2005),
      simple('कि', 'का कु', 2010, 'wanted'),
      simple('坂本龍一', '音楽図鑑', 1984),
      simple('久石譲', '春 1', 2001, 'wanted'),
      simple('Кино', 'Группа крови', 1988),
      simple('Ελένη Καραΐνδρου', 'Ελεγεία', 1995),
    ],
  };
}

/** A model with the tricky-name fixture */
export function buildPocketListFixture(): PocketListModel {
  const bySection = buildSections();
  const sections: PocketListSection[] = POCKET_SECTION_BUCKETS.filter(
    b => bySection[b.id]
  ).map(b => ({
    id: b.id as PocketSectionId,
    label: b.label,
    artists: bySection[b.id],
  }));

  let albums = 0;
  let entries = 0;
  let owned = 0;
  let wanted = 0;
  for (const s of sections) {
    for (const a of s.artists) {
      for (const g of a.albums) {
        albums += 1;
        entries += g.versions.length;
        owned += g.ownedCount;
        wanted += g.wantedCount;
      }
    }
  }

  return {
    meta: {
      generatedAt: '2026-10-20T12:00:00.000Z',
      lists: ['wishlist', 'collection'],
      counts: {
        albums,
        entries,
        owned,
        wanted,
        discogsWants: wanted,
        localWants: 0,
        overlapsCollapsed: 0,
        overlapsShown: 0,
        ownedFlags: { thisPressing: 0, otherVersion: 1, possibly: 0 },
      },
      wantsSummary: `${wanted} wants (${wanted} Discogs + 0 monitored)`,
      wishlistUpdatedAt: '2026-10-04T10:00:00.000Z',
      collectionCachedAt: '2026-10-11T10:00:00.000Z',
      collectionCache: {
        status: 'complete',
        pagesExpected: 24,
        pagesRead: 24,
        itemsExpected: 1189,
        itemsRead: 1189,
        oldestPageAt: '2026-10-11T10:00:00.000Z',
        newestPageAt: '2026-10-11T10:00:00.000Z',
      },
      warnings: [],
    },
    sections,
  };
}

/** Every artist heading in document order */
export function fixtureArtistNames(model: PocketListModel): string[] {
  return model.sections.flatMap(s => s.artists.map(a => a.displayArtist));
}
