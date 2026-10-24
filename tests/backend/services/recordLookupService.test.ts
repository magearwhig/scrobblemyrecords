import {
  parseReleaseQuery,
  RECORD_CHECK_LIMIT,
  RecordLookupService,
  RecordLookupSources,
  searchWords,
} from '../../../src/backend/services/recordLookupService';
import {
  DiscardPileItem,
  ExportCollectionCacheInfo,
  ExportCollectionRow,
  ExportWishlistRow,
} from '../../../src/shared/types';
import { albumGroupKey } from '../../../src/shared/utils/albumMapping';

const COMPLETE: ExportCollectionCacheInfo = {
  status: 'complete',
  pagesExpected: 1,
  pagesRead: 1,
  itemsExpected: 1,
  itemsRead: 1,
  oldestPageAt: '2026-10-20T00:00:00Z',
  newestPageAt: '2026-10-20T00:00:00Z',
};

const owned = (
  o: Partial<ExportCollectionRow> & { releaseId: number }
): ExportCollectionRow => {
  const artist = o.artistDisplay ?? 'Cake';
  const title = o.title ?? 'Comfort Eagle';
  return {
    rowId: `discogs-collection:${o.releaseId}:1`,
    source: 'discogs-collection',
    masterId: null,
    masterIdSource: null,
    copyIndex: 1,
    copyCount: 1,
    artistRaw: artist,
    artistDisplay: artist,
    artistIdentityKey: artist.toLowerCase(),
    albumNameKey: albumGroupKey(artist, title),
    title,
    year: 2001,
    formats: ['Vinyl', 'LP'],
    labels: ['Columbia'],
    catalogNumbers: [],
    genres: null,
    styles: null,
    rating: null,
    mediaCondition: null,
    sleeveCondition: null,
    notes: null,
    customFields: [],
    dateAdded: '2024-01-01T00:00:00Z',
    dateAddedUnix: 1704067200,
    dateAddedRaw: '2024-01-01T00:00:00-00:00',
    coverImageUrl: null,
    ...o,
  };
};

const want = (
  o: Partial<ExportWishlistRow> & { rowId: string }
): ExportWishlistRow => {
  const artist = o.artistDisplay ?? 'Cake';
  const title = o.title ?? 'Comfort Eagle';
  return {
    source: 'discogs-want',
    releaseId: null,
    masterId: null,
    masterIdSource: null,
    artistRaw: artist,
    artistDisplay: artist,
    artistIdentityKey: artist.toLowerCase(),
    albumNameKey: albumGroupKey(artist, title),
    title,
    year: null,
    formats: [],
    labels: [],
    catalogNumbers: [],
    notes: null,
    priority: null,
    dateAdded: null,
    dateAddedUnix: null,
    dateAddedRaw: '',
    vinylStatus: 'unknown',
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
};

const discard = (
  o: Partial<DiscardPileItem> & { id: string; releaseId: number }
): DiscardPileItem => ({
  collectionItemId: o.releaseId,
  artist: 'Bon Iver',
  title: 'For Emma, Forever Ago',
  reason: 'not_listening',
  addedAt: 1_700_000_000_000,
  status: 'traded_in',
  statusChangedAt: 1_750_000_000_000,
  currency: 'USD',
  orphaned: true,
  ...o,
});

const makeService = (data: {
  owned?: ExportCollectionRow[];
  wants?: ExportWishlistRow[];
  discards?: DiscardPileItem[];
  cache?: ExportCollectionCacheInfo;
}) => {
  const sources = {
    exportData: {
      getCollectionRows: jest.fn().mockResolvedValue(data.owned ?? []),
      getWishlistRows: jest.fn().mockResolvedValue(data.wants ?? []),
      getSnapshotMeta: jest.fn().mockResolvedValue({
        collectionCache: data.cache ?? COMPLETE,
        generatedAt: '2026-10-23T12:00:00Z',
      }),
    },
    discardPile: {
      getDiscardPile: jest.fn().mockResolvedValue(data.discards ?? []),
    },
  } satisfies RecordLookupSources;
  let now = 1_000_000;
  const service = new RecordLookupService(sources, () => now);
  return {
    service,
    sources,
    advance: (ms: number) => {
      now += ms;
    },
  };
};

describe('searchWords', () => {
  it('ignores case, accents and punctuation, and joins apostrophes', () => {
    expect(searchWords("Björk – Don't Stop!")).toEqual([
      'bjork',
      'dont',
      'stop',
    ]);
    expect(searchWords('AC/DC')).toEqual(['ac', 'dc']);
  });

  it('keeps a symbol-only name as one word', () => {
    expect(searchWords('!!!')).toEqual(['!!!']);
    expect(searchWords('   ')).toEqual([]);
  });
});

describe('parseReleaseQuery', () => {
  it.each([
    [
      'https://www.discogs.com/release/507725-U2-The-Unforgettable-Fire',
      507725,
    ],
    ['discogs.com/sell/release/507725', 507725],
    ['507725', 507725],
    ['r507725', 507725],
    ['[r507725]', 507725],
  ])('reads %s', (q, id) => {
    expect(parseReleaseQuery(q)).toBe(id);
  });

  it('ignores text and master links', () => {
    expect(parseReleaseQuery('comfort eagle')).toBeNull();
    expect(
      parseReleaseQuery('https://www.discogs.com/master/12345')
    ).toBeNull();
  });
});

describe('RecordLookupService.check', () => {
  it('matches every query word against artist and title, by word prefix', async () => {
    const { service } = makeService({
      owned: [
        owned({ releaseId: 1, title: 'Comfort Eagle' }),
        owned({ releaseId: 2, title: 'Fashion Nugget' }),
      ],
    });

    const result = await service.check('cake comf');

    expect(result.groups.map(g => g.title)).toEqual(['Comfort Eagle']);
    expect(result.groups[0].owned[0].releaseId).toBe(1);
    expect(result.collectionCache.status).toBe('complete');
  });

  it('does not match inside a word', async () => {
    const { service } = makeService({
      owned: [owned({ releaseId: 1, title: 'Comfort Eagle' })],
    });
    expect((await service.check('eagl')).groups).toHaveLength(1);
    expect((await service.check('agle')).groups).toHaveLength(0);
  });

  it('matches compact spellings like "acdc"', async () => {
    const { service } = makeService({
      owned: [
        owned({ releaseId: 1, artistDisplay: 'AC/DC', title: 'Back In Black' }),
      ],
    });
    expect((await service.check('acdc')).groups).toHaveLength(1);
    expect((await service.check('acdc back')).groups).toHaveLength(1);
    expect((await service.check('back acdc')).groups).toHaveLength(1);
    expect((await service.check('acdc highway')).groups).toHaveLength(0);
  });

  it('groups pressings of one confirmed master into one card', async () => {
    const { service } = makeService({
      owned: [owned({ releaseId: 1, masterId: 50, year: 2001 })],
      wants: [
        want({
          rowId: 'discogs-want:9',
          releaseId: 2,
          masterId: 50,
          masterIdSource: 'release-data',
          ownedMatch: 'owned-other-version',
        }),
      ],
    });

    const result = await service.check('comfort eagle');

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].owned).toHaveLength(1);
    expect(result.groups[0].wants[0].ownedMatch).toBe('owned-other-version');
  });

  it('never merges a local want into a group through its guessed master', async () => {
    const { service } = makeService({
      owned: [owned({ releaseId: 1, masterId: 50 })],
      wants: [
        want({
          rowId: 'local-want:a',
          source: 'local-want',
          masterId: 50,
          masterIdSource: 'search-guess',
          ownedMatch: 'owned-other-version',
          ownedMatchConfidence: 'likely',
        }),
      ],
    });

    const result = await service.check('comfort eagle');

    expect(result.groups).toHaveLength(2);
    const local = result.groups.find(g => g.monitored.length > 0)!;
    expect(local.owned).toHaveLength(0);
    expect(local.monitored[0].ownedMatchConfidence).toBe('likely');
  });

  it('brings in what a matched want links to, as its own card', async () => {
    const ownedRow = owned({
      releaseId: 1,
      masterId: 60,
      title: 'Comfort Eagle (Deluxe)',
    });
    const { service } = makeService({
      owned: [ownedRow],
      wants: [
        want({
          rowId: 'local-want:b',
          source: 'local-want',
          title: 'Eagle Sessions',
          ownedMatch: 'owned-name-match',
          ownedCollectionRowIds: [ownedRow.rowId],
        }),
      ],
    });

    const result = await service.check('eagle sessions');

    expect(result.groups.map(g => [g.title, g.matchedBy])).toEqual([
      ['Eagle Sessions', 'text'],
      ['Comfort Eagle (Deluxe)', 'linked'],
    ]);
  });

  it('keeps one release in one card when only one source knows its master', async () => {
    const { service } = makeService({
      owned: [
        owned({
          releaseId: 7,
          masterId: 70,
          artistDisplay: 'Bon Iver',
          title: 'For Emma, Forever Ago',
          copyIndex: 2,
        }),
      ],
      discards: [discard({ id: 'd1', releaseId: 7 })],
    });

    const result = await service.check('for emma');

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].owned).toHaveLength(1);
    expect(result.groups[0].discards).toHaveLength(1);
  });

  it('shows traded and sold records from the discard pile', async () => {
    const { service } = makeService({
      discards: [discard({ id: 'd1', releaseId: 7 })],
    });

    const [group] = (await service.check('emma')).groups;

    expect(group.discards).toEqual([
      expect.objectContaining({ status: 'traded_in', releaseId: 7 }),
    ]);
  });

  it('finds a release by id, marks that pressing, and includes its other versions', async () => {
    const { service } = makeService({
      owned: [
        owned({ releaseId: 1, masterId: 50, year: 2001 }),
        owned({ releaseId: 2, masterId: 50, year: 2016 }),
      ],
    });

    const result = await service.check('https://www.discogs.com/release/2');

    expect(result.releaseId).toBe(2);
    expect(result.releaseRecognized).toBe(true);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].matchedBy).toBe('release-id');
    expect(
      result.groups[0].owned.map(c => [c.releaseId, c.isQueriedRelease])
    ).toEqual([
      [2, true],
      [1, false],
    ]);
  });

  it('says when a release is not in any cached source', async () => {
    const { service } = makeService({ owned: [owned({ releaseId: 1 })] });

    const result = await service.check('https://www.discogs.com/release/999');

    expect(result.releaseRecognized).toBe(false);
    expect(result.groups).toEqual([]);
  });

  it('also searches a bare number as a title', async () => {
    const { service } = makeService({
      owned: [
        owned({ releaseId: 5, artistDisplay: 'Taylor Swift', title: '1989' }),
      ],
    });

    const result = await service.check('1989');

    expect(result.releaseRecognized).toBe(false);
    expect(result.groups.map(g => g.title)).toEqual(['1989']);
  });

  it('searches known artist aliases', async () => {
    const { service } = makeService({
      owned: [
        owned({
          releaseId: 1,
          artistDisplay: 'The Afghan Whigs',
          title: 'Gentlemen',
        }),
      ],
    });
    service.setArtistNameResolver({
      getAliases: name =>
        name.toLowerCase().includes('afghan') ? ['afghan whigs', 'whigs'] : [],
      getFingerprint: () => 'v1',
    });

    expect((await service.check('whigs gentlemen')).groups).toHaveLength(1);
  });

  it('treats Various, Various Artists and VA as the same', async () => {
    const { service } = makeService({
      owned: [
        owned({
          releaseId: 1,
          artistDisplay: 'Various',
          title: 'Pulp Fiction',
        }),
      ],
    });
    expect((await service.check('va pulp')).groups).toHaveLength(1);
    expect((await service.check('various artists pulp')).groups).toHaveLength(
      1
    );
  });

  it('ranks a whole-title match first and caps the results', async () => {
    const rows = Array.from({ length: RECORD_CHECK_LIMIT + 5 }, (_, i) =>
      owned({
        releaseId: i + 10,
        artistDisplay: `Band ${i}`,
        title: `Blue Album ${i}`,
      })
    );
    rows.push(owned({ releaseId: 1, artistDisplay: 'Weezer', title: 'Blue' }));
    const { service } = makeService({ owned: rows });

    const result = await service.check('blue');

    expect(result.groups[0].title).toBe('Blue');
    expect(result.groups).toHaveLength(RECORD_CHECK_LIMIT);
    expect(result.hasMore).toBe(true);
  });

  it('reads the caches once for a burst of searches, then again after a minute', async () => {
    const { service, sources, advance } = makeService({
      owned: [owned({ releaseId: 1 })],
    });

    await Promise.all([
      service.check('c'),
      service.check('ca'),
      service.check('cak'),
    ]);
    expect(sources.exportData.getCollectionRows).toHaveBeenCalledTimes(1);

    advance(61_000);
    await service.check('cake');
    expect(sources.exportData.getCollectionRows).toHaveBeenCalledTimes(2);
  });
});
