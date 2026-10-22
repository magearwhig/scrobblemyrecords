import {
  FilingSnapshot,
  filingNameKey,
} from '../../../src/backend/services/filing/filingRules';
import {
  buildPocketListModel,
  ownedFlagFor,
  truncateNotes,
} from '../../../src/backend/services/pocketList/pocketListModel';
import {
  PocketListAlbumGroup,
  PocketListArtistBlock,
  PocketListModel,
} from '../../../src/backend/services/pocketList/pocketListTypes';
import {
  ExportCollectionCacheInfo,
  ExportCollectionRow,
  ExportRowLink,
  ExportSnapshotMeta,
  ExportWishlistRow,
  MatchConfidence,
  OwnedMatchStatus,
  PocketListOptions,
} from '../../../src/shared/types';
import { albumGroupKey } from '../../../src/shared/utils/albumMapping';

const NOW = new Date('2026-10-11T12:00:00Z');

const stripSuffix = (artist: string) =>
  artist
    .split(',')
    .map(a => a.trim().replace(/\s*\(\d+\)$/, ''))
    .join(', ');

/** Test stand-in for discogsArtistIdentityKey: simplified name + "#N" per artist */
const identityKey = (artistRaw: string) =>
  artistRaw
    .split(',')
    .map(part => {
      const suffix = /\((\d+)\)\s*$/.exec(part.trim())?.[1] ?? '';
      return `${albumGroupKey(stripSuffix(part), '').split('|')[0]}#${suffix}`;
    })
    .join(',');

let seq = 0;
const nextId = () => ++seq;

function coll(
  artistRaw: string,
  title: string,
  o: Partial<ExportCollectionRow> = {}
): ExportCollectionRow {
  const releaseId = o.releaseId ?? 10000 + nextId();
  const copyIndex = o.copyIndex ?? 1;
  const artistDisplay = o.artistDisplay ?? stripSuffix(artistRaw);
  const masterId = o.masterId === undefined ? null : o.masterId;
  return {
    rowId: `discogs-collection:${releaseId}:${copyIndex}`,
    source: 'discogs-collection',
    releaseId,
    masterId,
    masterIdSource: masterId !== null ? 'release-data' : null,
    copyIndex,
    copyCount: 1,
    artistRaw,
    artistDisplay,
    artistIdentityKey: identityKey(artistRaw),
    albumNameKey: albumGroupKey(artistDisplay, title),
    title,
    year: null,
    formats: ['Vinyl'],
    labels: [],
    catalogNumbers: [],
    genres: null,
    styles: null,
    rating: null,
    mediaCondition: null,
    sleeveCondition: null,
    notes: null,
    customFields: [],
    dateAdded: '2020-01-01T00:00:00Z',
    dateAddedUnix: 1577836800,
    dateAddedRaw: '2020-01-01T00:00:00-00:00',
    coverImageUrl: null,
    ...o,
  };
}

function want(
  artistRaw: string,
  title: string,
  o: Partial<ExportWishlistRow> = {}
): ExportWishlistRow {
  const id = nextId();
  const artistDisplay = o.artistDisplay ?? stripSuffix(artistRaw);
  const masterId = o.masterId === undefined ? null : o.masterId;
  return {
    rowId: `discogs-want:${String(id).padStart(5, '0')}`,
    source: 'discogs-want',
    releaseId: 50000 + id,
    masterId,
    masterIdSource: masterId !== null ? 'release-data' : null,
    artistRaw,
    artistDisplay,
    artistIdentityKey: identityKey(artistRaw),
    albumNameKey: albumGroupKey(artistDisplay, title),
    title,
    year: null,
    formats: ['Vinyl', 'LP'],
    labels: [],
    catalogNumbers: [],
    notes: null,
    priority: 0,
    dateAdded: '2021-01-01T00:00:00Z',
    dateAddedUnix: 1609459200,
    dateAddedRaw: '2021-01-01T00:00:00-00:00',
    vinylStatus: 'has_vinyl',
    lowestVinylPrice: null,
    priceCurrency: null,
    playCount: null,
    ownedMatch: 'not-owned',
    ownedMatchConfidence: null,
    ownedCollectionRowIds: [],
    ownedCollectionLinks: [],
    relatedWishlistLinks: [],
    searchMasterIdCandidate: null,
    coverImageUrl: null,
    ...o,
  };
}

function local(
  artist: string,
  album: string,
  o: Partial<ExportWishlistRow> = {}
): ExportWishlistRow {
  const masterId = o.masterId === undefined ? null : o.masterId;
  return want(artist, album, {
    rowId: `local-want:${String(nextId()).padStart(5, '0')}`,
    source: 'local-want',
    releaseId: null,
    masterId,
    masterIdSource: masterId !== null ? 'search-guess' : null,
    artistIdentityKey: null,
    formats: [],
    priority: null,
    vinylStatus: 'unknown',
    playCount: 12,
    ...o,
  });
}

const link = (
  rowId: string,
  confidence: MatchConfidence,
  basis: ExportRowLink['basis'] = 'master-id'
): ExportRowLink => ({ rowId, basis, confidence });

function cache(
  status: ExportCollectionCacheInfo['status'] = 'complete',
  pagesRead = 24,
  pagesExpected: number | null = 24
): ExportCollectionCacheInfo {
  return {
    status,
    pagesExpected,
    pagesRead,
    itemsExpected: null,
    itemsRead: 0,
    oldestPageAt: '2026-10-11T08:00:00Z',
    newestPageAt: '2026-10-11T08:05:00Z',
  };
}

function meta(collectionCache = cache()): ExportSnapshotMeta {
  return {
    schemaVersion: 1,
    generatedAt: '2026-10-11T12:00:00Z',
    collectionCachedAt: collectionCache.oldestPageAt,
    collectionCache,
    wishlistUpdatedAt: '2026-10-04T10:00:00Z',
    historySyncedAt: null,
    discogsUsername: 'someone',
  };
}

function options(o: Partial<PocketListOptions> = {}): PocketListOptions {
  return {
    lists: ['wishlist', 'collection'],
    wishlistSources: ['discogs-want', 'local-want'],
    details: { format: true, pressing: true, notes: false },
    flagOwnedVersions: true,
    ...o,
  };
}

function build(
  collection: ExportCollectionRow[],
  wishlist: ExportWishlistRow[],
  opts: Partial<PocketListOptions> = {},
  snapshot = meta()
): PocketListModel {
  return buildPocketListModel(
    collection,
    wishlist,
    options(opts),
    snapshot,
    NOW
  );
}

const blocks = (model: PocketListModel): PocketListArtistBlock[] =>
  model.sections.flatMap(s => s.artists);
const albums = (model: PocketListModel): PocketListAlbumGroup[] =>
  blocks(model).flatMap(b => b.albums);
const badgeTexts = (badges: Array<{ text: string }>) => badges.map(b => b.text);

describe('buildPocketListModel', () => {
  describe('album grouping', () => {
    it('groups rows by confirmed master and keeps two same-titled masters apart', () => {
      const model = build(
        [
          coll('Band', 'Live', { masterId: 1, year: 1994 }),
          coll('Band', 'Live', { masterId: 1, year: 2010 }),
          coll('Band', 'Live', { masterId: 2, year: 1979 }),
        ],
        []
      );
      const groups = albums(model);
      expect(groups).toHaveLength(2);
      expect(groups.map(g => [g.title, g.year, g.ownedCount])).toEqual([
        ['Live', 1979, 1],
        ['Live', 1994, 2],
      ]);
    });

    it('joins a masterless row to the single confirmed-master group with its name', () => {
      const model = build(
        [
          coll('Band', 'Album', { masterId: 1, year: 1990 }),
          coll('Band', 'ALBUM!', { masterId: null, year: 2001 }),
        ],
        []
      );
      expect(albums(model)).toHaveLength(1);
      expect(albums(model)[0].ownedCount).toBe(2);
    });

    it('keeps a masterless row separate when two confirmed groups share its name', () => {
      const model = build(
        [
          coll('Band', 'Album', { masterId: 1, year: 1990 }),
          coll('Band', 'Album', { masterId: 2, year: 1995 }),
          coll('Band', 'Album', { masterId: null, year: 2001 }),
        ],
        []
      );
      const groups = albums(model);
      expect(groups).toHaveLength(3);
      const lone = groups.find(g => g.year === 2001) as PocketListAlbumGroup;
      expect(lone.versions[0].note).toBe('possibly another version');
    });

    it('joins a search-guess local want only when master and name agree', () => {
      const owned = coll('Band', 'Album', { masterId: 1, year: 1990 });
      const sameBoth = local('Band', 'Album', { masterId: 1 });
      const wrongMaster = local('Band', 'Album', { masterId: 99 });
      const wrongName = local('Band', 'Other Album', { masterId: 1 });
      const model = build([owned], [sameBoth, wrongMaster, wrongName]);
      const groups = albums(model);
      const joined = groups.find(
        g => g.ownedCount === 1
      ) as PocketListAlbumGroup;
      expect(joined.versions.map(v => v.rowId)).toEqual([
        owned.rowId,
        sameBoth.rowId,
      ]);
      expect(groups).toHaveLength(3);
      // All local wants joined the one Discogs identity named "Band"
      expect(blocks(model)).toHaveLength(1);
    });

    it('puts differing credits of one master in one block with "credited:" lines', () => {
      const a = coll('Artist', 'Symphony', { masterId: 7, year: 1980 });
      const b = coll('Artist', 'Symphony', { masterId: 7, year: 1985 });
      const c = coll('Artist, Orchestra', 'Symphony', {
        masterId: 7,
        year: 1975,
      });
      const model = build([a, b, c], []);
      expect(blocks(model)).toHaveLength(1);
      const block = blocks(model)[0];
      expect(block.displayArtist).toBe('Artist');
      const versions = block.albums[0].versions;
      expect(versions.map(v => v.credited)).toEqual([
        'credited: Artist, Orchestra',
        null,
        null,
      ]);
    });

    it('breaks a credit tie by the earliest year', () => {
      const model = build(
        [
          coll('Artist', 'Symphony', { masterId: 7, year: 1985 }),
          coll('Artist, Orchestra', 'Symphony', { masterId: 7, year: 1975 }),
        ],
        []
      );
      expect(blocks(model)).toHaveLength(1);
      expect(blocks(model)[0].displayArtist).toBe('Artist, Orchestra');
      expect(blocks(model)[0].albums[0].versions[1].credited).toBe(
        'credited: Artist'
      );
    });

    it('moves a reconciled masterless row along with its differently credited master', () => {
      const model = build(
        [
          coll('Artist', 'Symphony', { masterId: 7, year: 1980 }),
          coll('Artist', 'Symphony', { masterId: 7, year: 1985 }),
          coll('Artist, Orchestra', 'Symphony', { masterId: 7, year: 1975 }),
          coll('Artist, Orchestra', 'Symphony', { masterId: null, year: 1990 }),
        ],
        []
      );
      expect(blocks(model)).toHaveLength(1);
      expect(albums(model)).toHaveLength(1);
      expect(albums(model)[0].ownedCount).toBe(4);
    });

    it('keeps an ambiguous row ambiguous after one of its masters moves away', () => {
      const model = build(
        [
          coll('Artist', 'Symphony', { masterId: 7 }),
          coll('Artist', 'Symphony', { masterId: 7 }),
          coll('Artist, Orchestra', 'Symphony', { masterId: 7 }),
          coll('Artist, Orchestra', 'Symphony', { masterId: 8 }),
        ],
        [want('Artist, Orchestra', 'Symphony', { masterId: null })]
      );
      const lone = albums(model).find(
        g => g.wantedCount === 1
      ) as PocketListAlbumGroup;
      expect(lone.ownedCount).toBe(0);
      expect(lone.versions[0].note).toBe('possibly another version');
      // Grouping doubt is not an ownership claim
      expect(badgeTexts(lone.badges)).toEqual([]);
      expect(model.meta.counts.ownedFlags.possibly).toBe(0);
    });

    it('counts joined local wants when choosing the heading spelling', () => {
      const model = build(
        [coll('Band', 'A', { artistDisplay: 'BAND' })],
        [local('Band', 'B'), local('Band', 'C')]
      );
      expect(blocks(model)).toHaveLength(1);
      expect(blocks(model)[0].displayArtist).toBe('Band');
    });

    it('chooses the album title by owned majority, then the earliest year', () => {
      const model = build(
        [
          coll('Band', 'Album (Remaster)', { masterId: 1, year: 2010 }),
          coll('Band', 'Album', { masterId: 1, year: 2005 }),
          coll('Band', 'Album', { masterId: 1, year: 2012 }),
        ],
        [want('Band', 'Album [Wanted Title]', { masterId: 1, year: 1970 })]
      );
      expect(albums(model)[0].title).toBe('Album');
      expect(albums(model)[0].year).toBe(1970);

      const tie = build(
        [
          coll('Band', 'Zeta', { masterId: 1, year: 2010 }),
          coll('Band', 'Alpha', { masterId: 1, year: 2005 }),
        ],
        []
      );
      expect(albums(tie)[0].title).toBe('Alpha');

      const wantedOnly = build(
        [],
        [
          want('Band', 'Wanted A', { masterId: 3, year: 2001 }),
          want('Band', 'Wanted B', { masterId: 3, year: 1999 }),
        ]
      );
      expect(albums(wantedOnly)[0].title).toBe('Wanted B');
      expect(albums(wantedOnly)[0].year).toBe(1999);
    });

    it('shares one group between owned and wanted versions in "both" mode', () => {
      const owned = coll('Band', 'Album', { masterId: 1, year: 1994 });
      const wanted = want('Band', 'Album', {
        masterId: 1,
        year: 2020,
        labels: ['Reissue Co'],
        ownedMatch: 'owned-other-version',
        ownedMatchConfidence: 'confident',
        ownedCollectionRowIds: [owned.rowId],
        ownedCollectionLinks: [link(owned.rowId, 'confident')],
      });
      const model = build([owned], [wanted]);
      const [group] = albums(model);
      expect(group.ownedCount).toBe(1);
      expect(group.wantedCount).toBe(1);
      expect(group.versions.map(v => v.status)).toEqual(['owned', 'wanted']);
      expect(group.versions[1].text).toBe('2020 · Reissue Co · Vinyl, LP');
      expect(group.versions[1].note).toBe(
        'OWNED: another version (1994 · Vinyl)'
      );
      // The owned line already shows ownership
      expect(badgeTexts(group.badges)).toEqual([]);
    });
  });

  describe('copies', () => {
    it('counts copies by rows, not by summing copyCount', () => {
      const model = build(
        [
          coll('Band', 'Album', {
            releaseId: 5,
            copyIndex: 1,
            copyCount: 2,
            masterId: 1,
          }),
          coll('Band', 'Album', {
            releaseId: 5,
            copyIndex: 2,
            copyCount: 2,
            masterId: 1,
          }),
        ],
        []
      );
      const [group] = albums(model);
      expect(group.ownedCount).toBe(2);
      expect(group.versions).toHaveLength(1);
      expect(badgeTexts(group.versions[0].badges)).toEqual(['OWNED ×2']);
      expect(model.meta.counts.owned).toBe(2);
    });

    it('uses the row count when copyCount disagrees', () => {
      const model = build(
        [
          coll('Band', 'Album', { releaseId: 5, copyIndex: 1, copyCount: 3 }),
          coll('Band', 'Album', { releaseId: 5, copyIndex: 2, copyCount: 3 }),
        ],
        []
      );
      expect(badgeTexts(albums(model)[0].versions[0].badges)).toEqual([
        'OWNED ×2',
      ]);
    });
  });

  describe('details off', () => {
    it('drops version lines and puts counts on the album badges', () => {
      const model = build(
        [
          coll('Band', 'Album', {
            releaseId: 5,
            copyIndex: 1,
            copyCount: 2,
            masterId: 1,
          }),
          coll('Band', 'Album', {
            releaseId: 5,
            copyIndex: 2,
            copyCount: 2,
            masterId: 1,
          }),
        ],
        [
          want('Band', 'Album', { masterId: 1 }),
          want('Band', 'Album', { masterId: 1 }),
        ],
        { details: { format: false, pressing: false, notes: false } }
      );
      const [group] = albums(model);
      expect(group.versions).toEqual([]);
      expect(badgeTexts(group.badges)).toEqual([
        'OWNED ×2',
        'WANTED (2 pressings)',
      ]);
      expect(model.meta.counts.entries).toBe(1);
    });

    it('always shows non-vinyl formats', () => {
      const cd = coll('Band', 'Album', {
        masterId: 1,
        year: 1999,
        formats: ['CD'],
      });
      const box = coll('Band', 'Box', { masterId: 2, formats: ['All Media'] });
      const vinyl = coll('Band', 'Vinyl Only', { masterId: 3, year: 2000 });
      const formatOff = build([cd, box, vinyl], [], {
        details: { format: false, pressing: true, notes: false },
      });
      // Oldest first; the undated box set last
      const texts = albums(formatOff).map(g => g.versions[0].text);
      expect(texts).toEqual(['1999 · CD', '2000', 'Box/mixed']);

      const allOff = build([cd, vinyl], [], {
        details: { format: false, pressing: false, notes: false },
      });
      expect(badgeTexts(albums(allOff)[0].badges)).toEqual(['OWNED', 'CD']);
      expect(badgeTexts(albums(allOff)[1].badges)).toEqual(['OWNED']);
    });

    it('keeps version lines for a notes-only export so notes stay visible', () => {
      const noted = want('Band', 'Album', {
        masterId: 1,
        year: 1990,
        notes: 'Gatefold only',
      });
      const plain = want('Band', 'Album', {
        masterId: 1,
        year: 2000,
        formats: ['CD'],
      });
      const model = build([], [noted, plain], {
        lists: ['wishlist'],
        details: { format: false, pressing: false, notes: true },
      });
      const [group] = albums(model);
      expect(group.versions.map(v => [v.text, v.notes])).toEqual([
        ['', 'Gatefold only'],
        ['CD', null],
      ]);
      expect(badgeTexts(group.versions[0].badges)).toEqual(['WANTED']);
      // Counts stay on the version lines, not the album line
      expect(badgeTexts(group.badges)).toEqual([]);
      expect(model.meta.counts.entries).toBe(2);
    });

    it('lists aggregated non-vinyl formats in a stable order', () => {
      const cdRow = coll('Band', 'Album', { masterId: 1, formats: ['CD'] });
      const tape = coll('Band', 'Album', {
        masterId: 1,
        formats: ['Cassette'],
      });
      const off = { details: { format: false, pressing: false, notes: false } };
      const a = build([cdRow, tape], [], off);
      const b = build([tape, cdRow], [], off);
      expect(badgeTexts(albums(a)[0].badges)).toEqual(
        badgeTexts(albums(b)[0].badges)
      );
    });

    it('shows wishlist notes only when asked, cut at ~100 characters', () => {
      const long = 'word '.repeat(40).trim();
      const row = want('Band', 'Album', { notes: long });
      expect(albums(build([], [row]))[0].versions[0].notes).toBeNull();
      const notes = albums(
        build([], [row], {
          details: { format: true, pressing: true, notes: true },
        })
      )[0].versions[0].notes as string;
      expect(notes.endsWith('…')).toBe(true);
      expect(Array.from(notes).length).toBeLessThanOrEqual(100);
      expect(truncateNotes('short')).toBe('short');
      expect(truncateNotes('   ')).toBeNull();
      expect(truncateNotes('x'.repeat(150))).toBe(`${'x'.repeat(99)}…`);
    });
  });

  describe('owned-match wording', () => {
    const cases: Array<
      [OwnedMatchStatus, MatchConfidence | null, string | null]
    > = [
      ['owned-same-release', 'certain', 'OWNED: this pressing'],
      ['owned-other-version', 'confident', 'OWNED: another version'],
      [
        'owned-other-version',
        'likely',
        'Possibly owned: same album on Discogs',
      ],
      ['owned-name-match', 'likely', 'Possibly owned: similar title'],
      ['not-owned', null, null],
      ['unknown', null, null],
    ];

    it.each(cases)('%s + %s → %s', (ownedMatch, confidence, wording) => {
      const row = want('Band', 'Album', {
        ownedMatch,
        ownedMatchConfidence: confidence,
      });
      expect(ownedFlagFor(row)?.wording ?? null).toBe(wording);
      const [group] = albums(build([], [row], { lists: ['wishlist'] }));
      expect(group.versions[0].note).toBe(wording);
    });

    it('names the strongest owned copy and counts the rest', () => {
      const a = coll('Band', 'Album', { masterId: 1, year: 1994 });
      const b = coll('Band', 'Album', {
        masterId: 1,
        year: 2001,
        formats: ['CD'],
      });
      const row = want('Band', 'Album', {
        masterId: 1,
        ownedMatch: 'owned-other-version',
        ownedMatchConfidence: 'confident',
        ownedCollectionRowIds: [b.rowId, a.rowId],
        ownedCollectionLinks: [
          link(b.rowId, 'likely'),
          link(a.rowId, 'confident'),
        ],
      });
      const [group] = albums(build([a, b], [row], { lists: ['wishlist'] }));
      expect(group.versions[0].note).toBe(
        'OWNED: another version (1994 · Vinyl) +1 more'
      );
      expect(badgeTexts(group.badges)).toEqual(['OWNED: another version']);
    });

    it('never says "this pressing" for a local want', () => {
      const row = local('Band', 'Album', {
        masterId: 1,
        ownedMatch: 'owned-same-release',
        ownedMatchConfidence: 'certain',
      });
      const model = build([], [row], { lists: ['wishlist'] });
      const note = albums(model)[0].versions[0].note as string;
      expect(note).not.toContain('this pressing');
      expect(note).not.toContain('OWNED');
      expect(model.meta.counts.ownedFlags.thisPressing).toBe(0);
    });

    it('hides everything but "this pressing" when flagging is off', () => {
      const same = want('Band', 'A', {
        ownedMatch: 'owned-same-release',
        ownedMatchConfidence: 'certain',
      });
      const other = want('Band', 'B', {
        ownedMatch: 'owned-other-version',
        ownedMatchConfidence: 'confident',
      });
      const name = want('Band', 'C', {
        ownedMatch: 'owned-name-match',
        ownedMatchConfidence: 'likely',
      });
      const model = build([], [same, other, name], {
        lists: ['wishlist'],
        flagOwnedVersions: false,
      });
      expect(albums(model).map(g => g.versions[0].note)).toEqual([
        'OWNED: this pressing',
        null,
        null,
      ]);
      expect(model.meta.counts.ownedFlags).toEqual({
        thisPressing: 1,
        otherVersion: 0,
        possibly: 0,
      });
    });

    it('counts flags by tier', () => {
      const model = build(
        [],
        [
          want('Band', 'A', {
            ownedMatch: 'owned-other-version',
            ownedMatchConfidence: 'confident',
          }),
          want('Band', 'B', {
            ownedMatch: 'owned-other-version',
            ownedMatchConfidence: 'confident',
          }),
          want('Band', 'C', {
            ownedMatch: 'owned-name-match',
            ownedMatchConfidence: 'likely',
          }),
        ],
        { lists: ['wishlist'] }
      );
      expect(model.meta.counts.ownedFlags).toEqual({
        thisPressing: 0,
        otherVersion: 2,
        possibly: 1,
      });
    });

    it('gives no markers plus a cover warning for a missing or partial cache', () => {
      const row = want('Band', 'Album', { ownedMatch: 'unknown' });
      const missing = build(
        [],
        [row],
        { lists: ['wishlist'] },
        meta(cache('missing', 0, null))
      );
      expect(albums(missing)[0].versions[0].note).toBeNull();
      expect(missing.meta.warnings).toEqual([
        'Collection not cached: owned flags unavailable',
      ]);
      const partial = build(
        [],
        [row],
        { lists: ['wishlist'] },
        meta(cache('partial', 20, 24))
      );
      expect(partial.meta.warnings).toEqual([
        'Collection cache incomplete (20 of 24 pages): unflagged wants may still be owned',
      ]);
      expect(build([], [row], { lists: ['wishlist'] }).meta.warnings).toEqual(
        []
      );
    });
  });

  describe('wishlist overlaps', () => {
    it('collapses a confident link: the Discogs want wins and is "also monitored"', () => {
      const discogs = want('Band', 'Album', { masterId: 1 });
      const mon = local('Band', 'Album', {
        masterId: 1,
        relatedWishlistLinks: [link(discogs.rowId, 'confident')],
      });
      discogs.relatedWishlistLinks = [link(mon.rowId, 'confident')];
      const model = build([], [discogs, mon], { lists: ['wishlist'] });
      const [group] = albums(model);
      expect(group.versions).toHaveLength(1);
      expect(group.versions[0].rowId).toBe(discogs.rowId);
      expect(badgeTexts(group.versions[0].badges)).toEqual([
        'WANTED',
        'also monitored',
      ]);
      expect(model.meta.counts.overlapsCollapsed).toBe(1);
      expect(model.meta.wantsSummary).toBe(
        '1 want (1 Discogs + 1 monitored; 1 in both lists)'
      );
    });

    it('keeps both rows of a likely link and points at the other line', () => {
      const discogs = want('Band', 'Album', { masterId: 1, year: 1990 });
      const mon = local('Band', 'Album', {
        masterId: 1,
        relatedWishlistLinks: [
          link(discogs.rowId, 'likely', 'search-master-id'),
        ],
      });
      const model = build([], [discogs, mon], { lists: ['wishlist'] });
      const [group] = albums(model);
      expect(group.versions.map(v => v.rowId)).toEqual([
        discogs.rowId,
        mon.rowId,
      ]);
      expect(badgeTexts(group.versions[1].badges)).toEqual([
        'WANTED',
        'any version',
        'monitored',
      ]);
      expect(group.versions[1].note).toBe('may be the same as above');
      expect(model.meta.counts.overlapsShown).toBe(1);
      expect(model.meta.wantsSummary).toBe(
        '2 wants (1 Discogs + 1 monitored; 1 possible overlap shown)'
      );
    });

    it('does not collapse when the Discogs source is excluded', () => {
      const discogs = want('Band', 'Album', { masterId: 1 });
      const mon = local('Band', 'Album', {
        masterId: 1,
        relatedWishlistLinks: [link(discogs.rowId, 'confident')],
      });
      const model = build([], [discogs, mon], {
        lists: ['wishlist'],
        wishlistSources: ['local-want'],
      });
      expect(albums(model)[0].versions.map(v => v.rowId)).toEqual([mon.rowId]);
      expect(model.meta.wantsSummary).toBe('1 want (monitored)');
    });

    it('summarizes a today-shaped wishlist: 206 + 13 → 219 wants', () => {
      const discogs = Array.from({ length: 206 }, (_, i) =>
        want(`Artist ${i}`, `Album ${i}`, { masterId: 1000 + i })
      );
      const locals = Array.from({ length: 13 }, (_, i) =>
        local(`Local ${i}`, `Thing ${i}`, { masterId: 5000 + i })
      );
      locals[0] = local('Artist 0', 'Album 0', {
        masterId: 1000,
        relatedWishlistLinks: [
          link(discogs[0].rowId, 'likely', 'search-master-id'),
        ],
      });
      const model = build([], [...discogs, ...locals], { lists: ['wishlist'] });
      expect(model.meta.wantsSummary).toBe(
        '219 wants (206 Discogs + 13 monitored; 1 possible overlap shown)'
      );
      expect(model.meta.counts).toMatchObject({
        wanted: 219,
        discogsWants: 206,
        localWants: 13,
        overlapsCollapsed: 0,
        overlapsShown: 1,
      });

      const confident = {
        ...locals[0],
        relatedWishlistLinks: [link(discogs[0].rowId, 'confident')],
      };
      const collapsed = build([], [...discogs, confident, ...locals.slice(1)], {
        lists: ['wishlist'],
      });
      expect(collapsed.meta.wantsSummary).toBe(
        '218 wants (206 Discogs + 13 monitored; 1 in both lists)'
      );
    });
  });

  describe('artist blocks', () => {
    it('keeps suffixed identities apart, ordered and disambiguated', () => {
      const model = build(
        [
          coll('Girls (3)', 'Album'),
          coll('Girls', 'Album'),
          coll('Girls (2)', 'Album'),
        ],
        []
      );
      const list = blocks(model);
      expect(list.map(b => [b.displayArtist, b.disambiguation])).toEqual([
        ['Girls', null],
        ['Girls', 'another artist named Girls · Discogs #2'],
        ['Girls', 'another artist named Girls · Discogs #3'],
      ]);
    });

    it('gives a local want its own block when two identities share its name', () => {
      const model = build(
        [coll('Girls', 'A'), coll('Girls (2)', 'B')],
        [local('Girls', 'C')]
      );
      const list = blocks(model);
      expect(list).toHaveLength(3);
      expect(list[2].identityKey).toBeNull();
      expect(list[2].albums[0].title).toBe('C');
    });

    it('chooses the heading by the most common spelling', () => {
      const model = build(
        [
          coll('Band', 'A', { artistDisplay: 'BAND' }),
          coll('Band', 'B'),
          coll('Band', 'C'),
        ],
        []
      );
      expect(blocks(model)[0].displayArtist).toBe('Band');
    });

    it('orders sections #, A–Z, Other and keeps only non-empty ones', () => {
      const model = build(
        [
          coll('कबीर', 'X'),
          coll('The Beatles', 'Abbey Road'),
          coll('2Pac', 'Me Against the World'),
          coll('!!!', 'Myth Takes'),
          coll('Björk', 'Post'),
        ],
        []
      );
      // 2Pac is spelled "Two Pac"; only symbols stay under #
      expect(model.sections.map(s => [s.id, s.label])).toEqual([
        ['sec-num', '#'],
        ['sec-b', 'B'],
        ['sec-t', 'T'],
        ['sec-other', 'Other'],
      ]);
      expect(model.sections[1].artists.map(a => a.displayArtist)).toEqual([
        'The Beatles',
        'Björk',
      ]);
    });

    it('is identical for shuffled input', () => {
      const rows = [
        coll('The Beatles', 'Abbey Road', { masterId: 1, year: 1969 }),
        coll('Beatles', 'Help', { masterId: 2 }),
        coll('AC/DC', 'Back in Black', { masterId: 3 }),
        coll('ACDC', 'Tribute'),
        coll('Girls (2)', 'Album'),
        coll('Girls', 'Album'),
        coll('!!!', 'Thr!!!er'),
      ];
      const wants = [
        want('The Beatles', 'Abbey Road', { masterId: 1, year: 2019 }),
        local('ACDC', 'Tribute'),
      ];
      const reference = JSON.stringify(build(rows, wants));
      expect(
        JSON.stringify(build([...rows].reverse(), [...wants].reverse()))
      ).toBe(reference);
      expect(
        JSON.stringify(
          build(
            [rows[3], rows[0], rows[5], rows[1], rows[6], rows[2], rows[4]],
            wants
          )
        )
      ).toBe(reference);
    });
  });

  describe('negative name fixtures', () => {
    it.each([[['क', 'का', 'कि', 'कु']], [['春 1', '夏 1']], [['!!!', '...']]])(
      'keeps %j as separate albums',
      titles => {
        const model = build(
          [],
          titles.map(title => local('Artist', title)),
          { lists: ['wishlist'] }
        );
        expect(albums(model)).toHaveLength(titles.length);
      }
    );
  });

  describe('option filtering', () => {
    const owned = coll('Band', 'Owned');
    const discogs = want('Band', 'Wanted');
    const mon = local('Band', 'Monitored');

    it('lists only the chosen lists and sources', () => {
      const collectionOnly = build([owned], [discogs, mon], {
        lists: ['collection'],
      });
      expect(albums(collectionOnly).map(g => g.title)).toEqual(['Owned']);
      expect(collectionOnly.meta.wantsSummary).toBeNull();
      expect(collectionOnly.meta.lists).toEqual(['collection']);

      const discogsOnly = build([owned], [discogs, mon], {
        lists: ['wishlist'],
        wishlistSources: ['discogs-want'],
      });
      expect(albums(discogsOnly).map(g => g.title)).toEqual(['Wanted']);
      expect(discogsOnly.meta.wantsSummary).toBe('1 want (Discogs)');

      const both = build([owned], [discogs, mon], {
        lists: ['collection', 'wishlist'],
      });
      expect(both.meta.lists).toEqual(['wishlist', 'collection']);
      expect(albums(both)).toHaveLength(3);
    });

    it('returns empty sections for empty input', () => {
      const model = build([], []);
      expect(model.sections).toEqual([]);
      expect(model.meta.counts.albums).toBe(0);
      expect(model.meta.counts.entries).toBe(0);
      expect(model.meta.generatedAt).toBe('2026-10-11T12:00:00.000Z');
      expect(model.meta.wantsSummary).toBe('0 wants (0 Discogs + 0 monitored)');
    });

    it('carries freshness from the snapshot meta', () => {
      const model = build([owned], []);
      expect(model.meta.wishlistUpdatedAt).toBe('2026-10-04T10:00:00Z');
      expect(model.meta.collectionCachedAt).toBe('2026-10-11T08:00:00Z');
      expect(model.meta.collectionCache.status).toBe('complete');
    });
  });
});

describe('buildPocketListModel record-store filing', () => {
  function filing(o: {
    found?: Record<string, string>;
    notFound?: string[];
    overrides?: Record<string, string>;
    masterYears?: Record<number, number | null>;
  }): FilingSnapshot {
    const artists: FilingSnapshot['artists'] = {};
    for (const [name, sortName] of Object.entries(o.found ?? {})) {
      artists[filingNameKey(name)] = {
        name,
        status: 'found',
        sortName,
        type: 'Person',
        mbid: null,
        via: 'search',
        fetchedAt: 0,
      };
    }
    for (const name of o.notFound ?? []) {
      artists[filingNameKey(name)] = {
        name,
        status: 'not-found',
        fetchedAt: 0,
      };
    }
    return {
      artists,
      overrides: new Map(
        Object.entries(o.overrides ?? {}).map(([artist, fileUnder]) => [
          filingNameKey(artist),
          { key: filingNameKey(artist), artist, fileUnder, updatedAt: 0 },
        ])
      ),
      masterYears: Object.fromEntries(
        Object.entries(o.masterYears ?? {}).map(([id, year]) => [id, { year }])
      ),
    };
  }

  const buildFiled = (
    collection: ExportCollectionRow[],
    wishlist: ExportWishlistRow[],
    snapshot: FilingSnapshot
  ) =>
    buildPocketListModel(
      collection,
      wishlist,
      options(),
      meta(),
      NOW,
      snapshot
    );

  const layout = (model: PocketListModel) =>
    model.sections.map(s => [s.label, s.artists.map(a => a.displayArtist)]);

  it('files people by MusicBrainz surname and keeps the natural heading', () => {
    const model = buildFiled(
      [
        coll('Elliott Smith', 'XO'),
        coll('Modest Mouse', 'Moon & Antarctica'),
        coll('The Smiths', 'The Queen Is Dead'),
        coll('Sleater-Kinney', 'Dig Me Out'),
      ],
      [],
      filing({
        found: {
          'Elliott Smith': 'Smith, Elliott',
          'Modest Mouse': 'Modest Mouse',
          'The Smiths': 'Smiths, The',
        },
      })
    );
    expect(layout(model)).toEqual([
      ['M', ['Modest Mouse']],
      ['S', ['Sleater-Kinney', 'Elliott Smith', 'The Smiths']],
    ]);
  });

  it('lets an override beat MusicBrainz, and matches it ignoring Discogs suffixes', () => {
    const model = buildFiled(
      [coll('Alice Cooper (2)', 'Killer'), coll('Bob Dylan', 'Desire')],
      [],
      filing({
        found: { 'Alice Cooper': 'Alice Cooper', 'Bob Dylan': 'Dylan, Bob' },
        overrides: { 'alice cooper': 'Cooper, Alice' },
      })
    );
    expect(layout(model)).toEqual([
      ['C', ['Alice Cooper']],
      ['D', ['Bob Dylan']],
    ]);
  });

  it('files a not-found collaboration under its first artist, after the solo records', () => {
    const model = buildFiled(
      [
        coll('Lou Reed, John Cale', 'Songs for Drella'),
        coll('Lou Reed', 'Transformer'),
        coll('Rancid', 'And Out Come the Wolves'),
      ],
      [],
      filing({
        found: { 'Lou Reed': 'Reed, Lou' },
        notFound: ['Lou Reed, John Cale'],
      })
    );
    expect(layout(model)).toEqual([
      ['R', ['Rancid', 'Lou Reed', 'Lou Reed, John Cale']],
    ]);
  });

  it('keeps a credit whole when its lookup has not run', () => {
    const model = buildFiled(
      [coll('Lou Reed, John Cale', 'Songs for Drella')],
      [],
      filing({ found: { 'Lou Reed': 'Reed, Lou' } })
    );
    expect(layout(model)).toEqual([['L', ['Lou Reed, John Cale']]]);
  });

  it('orders albums by original year and prints it on the album line', () => {
    const model = buildFiled(
      [
        coll('The Wedding Present', 'George Best', { masterId: 1, year: 2019 }),
        coll('The Wedding Present', 'Seamonsters', { masterId: 2, year: 1991 }),
        coll('The Wedding Present', 'Bizarro', { masterId: 3, year: 1989 }),
        coll('The Wedding Present', 'Demo', { year: null }),
      ],
      [],
      filing({ masterYears: { 1: 1987, 2: null } })
    );
    expect(albums(model).map(a => [a.title, a.year])).toEqual([
      ['George Best', 1987],
      ['Bizarro', 1989],
      ['Seamonsters', 1991],
      ['Demo', null],
    ]);
    // Version lines keep the pressing year
    expect(albums(model)[0].versions[0].text).toMatch(/^2019/);
  });

  it("never uses a local want's search-guess master for the original year", () => {
    const model = buildFiled(
      [],
      [local('Band', 'Guess', { masterId: 9, year: 2015 })],
      filing({ masterYears: { 9: 1970 } })
    );
    expect(albums(model).map(a => a.year)).toEqual([2015]);
  });

  it('moves Various releases to Various Artists and Soundtracks, by title', () => {
    const model = buildFiled(
      [
        coll('Various', 'Nuggets', { masterId: 1, year: 1972 }),
        coll('Various', 'Murder Was The Case', {
          masterId: 2,
          styles: ['Soundtrack', 'Gangsta'],
        }),
        coll('Various', 'The Big Lebowski', {
          masterId: 3,
          styles: ['Soundtrack'],
        }),
        coll('Prince And The Revolution', 'Purple Rain', {
          styles: ['Soundtrack', 'Funk'],
        }),
        coll('Various', 'A Christmas Gift For You', { masterId: 4 }),
      ],
      [local('Various Artists', 'Pebbles')],
      filing({})
    );
    expect(model.sections.map(s => s.id)).toEqual([
      'sec-p',
      'sec-various',
      'sec-soundtracks',
    ]);
    const titles = (id: string) =>
      model.sections
        .find(s => s.id === id)
        ?.artists.flatMap(a => a.albums.map(g => g.title));
    expect(titles('sec-various')).toEqual([
      'A Christmas Gift For You',
      'Nuggets',
      'Pebbles',
    ]);
    expect(titles('sec-soundtracks')).toEqual([
      'The Big Lebowski',
      'Murder Was The Case',
    ]);
    const various = model.sections[1].artists;
    expect(various).toHaveLength(1);
    expect(various[0].displayArtist).toBe('Various');
    expect(various[0].disambiguation).toBeNull();
    expect(model.sections[2].artists[0].disambiguation).toBeNull();
    // "Various Artists" is not a different credit from "Various"
    const pebbles = various[0].albums.find(a => a.title === 'Pebbles');
    expect(pebbles?.versions[0].credited).toBeNull();
  });
});
