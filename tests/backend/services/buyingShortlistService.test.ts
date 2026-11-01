import {
  bestCombination,
  BuyingShortlistService,
  BuyingShortlistSource,
} from '../../../src/backend/services/buyingShortlistService';
import { WishlistPriorityError } from '../../../src/backend/services/wishlistPriorityService';
import {
  AlbumPlayCountResult,
  EnrichedWishlistItem,
  ExportWishlistRow,
  WishlistLowestListing,
  WishlistPriorityRecord,
} from '../../../src/shared/types';

const NOW = Date.UTC(2026, 10, 1);
const DAY = 24 * 60 * 60 * 1000;

const listing = (
  price: number,
  o: Partial<WishlistLowestListing> = {}
): WishlistLowestListing => ({
  price,
  currency: 'USD',
  releaseId: 1,
  numForSale: 2,
  totalForSale: 2,
  checkedAt: NOW - 60 * 60 * 1000,
  pressingsChecked: 1,
  pressingsTotal: 1,
  ...o,
});

const want = (
  id: number,
  price: number | null | undefined,
  o: Partial<EnrichedWishlistItem> = {}
): EnrichedWishlistItem => ({
  id,
  masterId: id,
  releaseId: id * 10,
  artist: `Artist ${id}`,
  title: `Album ${id}`,
  dateAdded: '2026-10-01T00:00:00Z',
  vinylStatus: 'has_vinyl',
  vinylVersions: [],
  lowestListing:
    price === undefined ? undefined : price === null ? null : listing(price),
  ...o,
});

const record = (
  w: EnrichedWishlistItem,
  rank: number | null,
  o: Partial<WishlistPriorityRecord> = {}
): WishlistPriorityRecord => ({
  key: `master:${w.masterId}`,
  rank,
  monitored: false,
  artist: w.artist,
  title: w.title,
  masterId: w.masterId,
  wantIds: [w.id],
  localIds: [],
  ...o,
});

const row = (
  wantId: number,
  ownedMatch: ExportWishlistRow['ownedMatch'],
  ownedMatchConfidence: ExportWishlistRow['ownedMatchConfidence'] = null
) =>
  ({
    rowId: `discogs-want:${wantId}`,
    ownedMatch,
    ownedMatchConfidence,
  }) as ExportWishlistRow;

describe('BuyingShortlistService', () => {
  let wants: EnrichedWishlistItem[];
  let ranked: WishlistPriorityRecord[];
  let unranked: WishlistPriorityRecord[];
  let rows: ExportWishlistRow[];
  let plays: Record<string, Partial<AlbumPlayCountResult>>;
  let getPriorities: BuyingShortlistSource['getPriorities'];

  const service = () =>
    new BuyingShortlistService(
      {
        getPricedWants: async () => wants,
        getSettings: async () => ({ currency: 'USD' }),
        getPriorities: () => getPriorities(),
        getWishlistRows: async () => rows,
        getPlayCounts: async albums =>
          albums.map(({ artist, title }) => ({
            artist,
            title,
            playCount: 0,
            lastPlayed: null,
            matchType: 'none' as const,
            ...plays[title],
          })),
      },
      () => NOW
    );

  /** Ranks the given wants in order; the rest of `wants` are unranked */
  const setUp = (rankedWants: EnrichedWishlistItem[], rest = []) => {
    wants = [...rankedWants, ...rest];
    ranked = rankedWants.map((w, i) => record(w, i + 1));
    unranked = (rest as EnrichedWishlistItem[]).map(w => record(w, null));
  };

  const titles = (r: { picks: Array<{ title: string }> }) =>
    r.picks.map(p => p.title);

  beforeEach(() => {
    wants = [];
    ranked = [];
    unranked = [];
    rows = [];
    plays = {};
    getPriorities = async () => ({ ranked, unranked });
  });

  describe('the ranking comes first', () => {
    it('picks ranked records in order, even when unranked ones score higher', async () => {
      const a = want(1, 40);
      const b = want(2, 40);
      const loved = want(3, 10);
      setUp([a, b]);
      wants.push(loved);
      unranked = [record(loved, null)];
      plays = { 'Album 3': { playCount: 500, lastPlayed: NOW / 1000 } };

      const result = await service().getShortlist({ budget: 80 });
      expect(titles(result)).toEqual(['Album 1', 'Album 2']);
      expect(result.total).toBe(80);
      expect(result.leftOver).toBe(0);
      expect(result.picks[0].reasons[0]).toEqual({
        kind: 'priority',
        text: 'Your #1 priority',
      });
    });

    it('keeps #1 even if it leaves room for little else', async () => {
      setUp([want(1, 90), want(2, 20), want(3, 20), want(4, 5)]);
      const result = await service().getShortlist({ budget: 100 });
      expect(titles(result)).toEqual(['Album 1', 'Album 4']);
      expect(result.skipped.map(s => [s.rank, s.reason, s.text])).toEqual([
        [2, 'over-budget', '$20.00 is more than the $10.00 left'],
        [3, 'over-budget', '$20.00 is more than the $10.00 left'],
      ]);
    });

    it('passes over a #1 above the whole budget and says so', async () => {
      setUp([want(1, 150), want(2, 20)]);
      const result = await service().getShortlist({ budget: 100 });
      expect(titles(result)).toEqual(['Album 2']);
      expect(result.skipped[0].text).toBe(
        '$150.00 is more than the $100.00 budget'
      );
    });

    it('stops at the count without listing lower ranks', async () => {
      setUp([want(1, 1), want(2, 1), want(3, 1), want(4, 1)]);
      const result = await service().getShortlist({ budget: 100, count: 3 });
      expect(titles(result)).toHaveLength(3);
      expect(result.skipped).toEqual([]);
    });

    it('lists ranked records it cannot buy, and why', async () => {
      const owned = want(1, 10);
      const notForSale = want(2, null);
      const noPrice = want(3, undefined);
      const monitored = want(4, 10);
      setUp([owned, notForSale, noPrice]);
      rows = [row(1, 'owned-same-release', 'certain')];
      wants.push(monitored);
      ranked.push(
        record(monitored, 4, {
          key: 'local:x',
          wantIds: [],
          localIds: ['x'],
          monitored: true,
        })
      );
      const result = await service().getShortlist({ budget: 100 });
      expect(result.picks).toEqual([]);
      expect(result.skipped.map(s => s.reason)).toEqual([
        'owned',
        'none-for-sale',
        'no-price',
        'no-price',
      ]);
    });

    it('does not limit ranked picks by artist', async () => {
      const same = { artist: 'Same' };
      setUp([want(1, 1, same), want(2, 1, same), want(3, 1, same)]);
      const result = await service().getShortlist({ budget: 100 });
      expect(result.picks).toHaveLength(3);
    });
  });

  describe('spare slots', () => {
    it('fills them from unranked records with what is left', async () => {
      const a = want(1, 60);
      const fits = want(2, 30);
      const tooMuch = want(3, 50);
      setUp([a]);
      wants.push(fits, tooMuch);
      unranked = [record(fits, null), record(tooMuch, null)];
      const result = await service().getShortlist({ budget: 100 });
      expect(titles(result)).toEqual(['Album 1', 'Album 2']);
      expect(result.picks[1].rank).toBeNull();
      expect(result.leftOver).toBe(10);
    });

    it('takes the best combination, not the top scorers in order', async () => {
      const top = want(1, 90);
      const second = want(2, 45);
      const third = want(3, 45);
      setUp([]);
      wants = [top, second, third];
      unranked = wants.map(w => record(w, null));
      plays = {
        'Album 1': { playCount: 100 },
        'Album 2': { playCount: 80 },
        'Album 3': { playCount: 80 },
      };
      const result = await service().getShortlist({ budget: 100 });
      expect(titles(result).sort()).toEqual(['Album 2', 'Album 3']);
    });

    it('limits an artist to 2 picks, counting ranked picks', async () => {
      const same = { artist: 'Same (2)' };
      const r = want(1, 1, same);
      const a = want(2, 1, { artist: 'Same' });
      const b = want(3, 1, same);
      const other = want(4, 1);
      setUp([r]);
      wants.push(a, b, other);
      unranked = [record(a, null), record(b, null), record(other, null)];
      const result = await service().getShortlist({ budget: 100 });
      const artists = result.picks.map(p => p.artist.replace(/ \(\d+\)$/, ''));
      expect(artists.filter(n => n === 'Same')).toHaveLength(2);
      expect(titles(result)).toContain('Album 4');
    });

    it('leaves out owned records and labels likely matches', async () => {
      const certain = want(1, 5);
      const confident = want(2, 5);
      const likely = want(3, 5);
      const none = want(4, 5);
      setUp([]);
      wants = [certain, confident, likely, none];
      unranked = wants.map(w => record(w, null));
      rows = [
        row(1, 'owned-same-release', 'certain'),
        row(2, 'owned-other-version', 'confident'),
        row(3, 'owned-name-match', 'likely'),
        row(4, 'not-owned'),
      ];
      const result = await service().getShortlist({ budget: 100 });
      expect(titles(result).sort()).toEqual(['Album 3', 'Album 4']);
      expect(
        result.picks.find(p => p.title === 'Album 3')?.reasons.map(r => r.kind)
      ).toContain('possibly-owned');
    });

    it('treats a master as owned when any of its wants is', async () => {
      const a = want(1, 5, { masterId: 9 });
      const b = want(2, 5, { masterId: 9 });
      setUp([]);
      wants = [a, b];
      unranked = [record(a, null, { key: 'master:9', wantIds: [1, 2] })];
      rows = [row(2, 'owned-same-release', 'certain')];
      expect((await service().getShortlist({ budget: 100 })).picks).toEqual([]);
    });

    it('uses the cheapest listing among pressings of a record', async () => {
      const a = want(1, 30, { masterId: 9 });
      const b = want(2, 12, { masterId: 9 });
      setUp([]);
      wants = [a, b];
      unranked = [record(a, null, { key: 'master:9', wantIds: [1, 2] })];
      const { picks } = await service().getShortlist({ budget: 100 });
      expect(picks[0].listing.price).toBe(12);
    });
  });

  describe('reasons', () => {
    const reasons = async (w: EnrichedWishlistItem) => {
      setUp([w]);
      const { picks } = await service().getShortlist({ budget: 1000 });
      return Object.fromEntries(picks[0].reasons.map(r => [r.kind, r.text]));
    };
    const alert = (maxPrice: number) => ({
      maxPrice,
      currency: 'USD',
      triggered: false,
    });

    it('explains plays', async () => {
      plays = {
        'Album 1': { playCount: 212, lastPlayed: (NOW - 21 * DAY) / 1000 },
      };
      expect((await reasons(want(1, 10))).plays).toBe(
        '212 plays, last played 3 weeks ago'
      );
      plays = {};
      expect((await reasons(want(1, 10))).plays).toBe('Not played yet');
    });

    it('explains the alert price', async () => {
      expect(
        (await reasons(want(1, 38.5, { priceAlert: alert(40) }))).alert
      ).toBe('$1.50 under your alert price');
      expect(
        (await reasons(want(1, 46, { priceAlert: alert(40) }))).alert
      ).toBe('$6.00 over your alert price');
      expect(
        (await reasons(want(1, 40, { priceAlert: alert(40) }))).alert
      ).toBe('At your alert price');
      expect((await reasons(want(1, 40))).alert).toBeUndefined();
    });

    it('says how long it has been wanted', async () => {
      expect(
        (await reasons(want(1, 10, { dateAdded: '2023-05-01T00:00:00Z' })))[
          'wishlist-age'
        ]
      ).toBe('On your wishlist since 2023');
    });

    it('flags a price over a day old only', async () => {
      const old = want(1, 10, {
        lowestListing: listing(10, { checkedAt: NOW - 3 * DAY }),
      });
      expect((await reasons(old))['stale-price']).toBe(
        'Price checked 3 days ago, it may have changed'
      );
      expect((await reasons(want(1, 10)))['stale-price']).toBeUndefined();
    });
  });

  it('prefers higher alert fit and play counts in the score', async () => {
    const plain = want(1, 5);
    const atAlert = want(2, 5, {
      priceAlert: { maxPrice: 10, currency: 'USD', triggered: true },
    });
    setUp([]);
    wants = [plain, atAlert];
    unranked = wants.map(w => record(w, null));
    const result = await service().getShortlist({ budget: 5 });
    expect(titles(result)).toEqual(['Album 2']);
  });

  it('never charges a listing in another currency against the budget', async () => {
    const euros = want(1, 80, {
      lowestListing: listing(80, { currency: 'EUR' }),
    });
    setUp([euros]);
    const result = await service().getShortlist({ budget: 100 });
    expect(result.picks).toEqual([]);
    expect(result.skipped[0].reason).toBe('no-price');
  });

  it('adds cents exactly', async () => {
    setUp([want(1, 0.1), want(2, 0.2)]);
    const result = await service().getShortlist({ budget: 0.3 });
    expect(result.picks).toHaveLength(2);
    expect(result.total).toBe(0.3);
    expect(result.leftOver).toBe(0);
  });

  it('flags when ownership is unknown', async () => {
    setUp([want(1, 5)]);
    rows = [row(1, 'unknown')];
    const result = await service().getShortlist({ budget: 10 });
    expect(result.ownershipUnknown).toBe(true);
    expect(result.picks).toHaveLength(1);
  });

  it('fails rather than ignoring a damaged ranking', async () => {
    getPriorities = async () => {
      throw new WishlistPriorityError('damaged', 'corrupt');
    };
    await expect(service().getShortlist({ budget: 10 })).rejects.toMatchObject({
      code: 'corrupt',
    });
  });
});

describe('bestCombination', () => {
  const c = (
    score: number,
    cents: number,
    artistKey = `a${score}${cents}`
  ) => ({
    score,
    cents,
    artistKey,
  });

  it('prefers reaching the minimum over a higher score', () => {
    const best = bestCombination(
      [
        c(90, 50, 'a'),
        c(90, 50, 'b'),
        c(20, 30, 'c'),
        c(20, 30, 'd'),
        c(20, 30, 'e'),
      ],
      5,
      100,
      3,
      new Map(),
      2
    );
    expect(best).toHaveLength(3);
  });

  it('breaks a tied score on the lower price', () => {
    const best = bestCombination(
      [c(50, 80), c(50, 20)],
      1,
      100,
      0,
      new Map(),
      2
    );
    expect(best[0].cents).toBe(20);
  });

  it('respects artist counts already used', () => {
    const best = bestCombination(
      [c(90, 1, 'x'), c(10, 1, 'y')],
      2,
      100,
      0,
      new Map([['x', 2]]),
      2
    );
    expect(best.map(b => b.artistKey)).toEqual(['y']);
  });

  it('returns nothing when nothing fits', () => {
    expect(bestCombination([c(10, 200)], 3, 100, 3, new Map(), 2)).toEqual([]);
  });

  it('handles 30 candidates and 5 slots quickly', () => {
    const many = Array.from({ length: 30 }, (_, i) => c(100 - i, 100 + i));
    const started = Date.now();
    expect(bestCombination(many, 5, 100000, 3, new Map(), 2)).toHaveLength(5);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
