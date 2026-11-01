import {
  BuyingShortlist,
  BuyingShortlistPick,
  BuyingShortlistReason,
  BuyingShortlistSkip,
  EnrichedWishlistItem,
  ExportWishlistRow,
  WishlistLowestListing,
  WishlistPriorityRecord,
  WishlistPrioritySnapshot,
  WishlistSettings,
  AlbumPlayCountResult,
} from '../../shared/types';
import { stripDiscogsSuffixes } from '../../shared/utils/albumMapping';

import { formatMoney } from './wishlistPriceService';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Prices older than this are flagged on the pick */
export const STALE_PRICE_MS = DAY_MS;
export const DEFAULT_SHORTLIST_COUNT = 5;
export const MIN_SHORTLIST_COUNT = 3;
export const MAX_SHORTLIST_COUNT = 5;
/** Picks by one artist, counting ranked picks (which are never limited) */
const MAX_PICKS_PER_ARTIST = 2;
/** Top scorers tried in combination: at most about 174,000 sets of 5 */
const MAX_COMBINATION_CANDIDATES = 30;

const WEIGHT_PLAYS = 45;
const WEIGHT_RECENT = 15;
const WEIGHT_ALERT = 25;
const WEIGHT_AGE = 15;
const RECENT_FULL_DAYS = 90;
const RECENT_NONE_DAYS = 730;
const AGE_FULL_YEARS = 3;

/** What the shortlist reads, all from caches */
export interface BuyingShortlistSource {
  /** Discogs wants with their cached prices and alerts */
  getPricedWants(): Promise<EnrichedWishlistItem[]>;
  getSettings(): Promise<Pick<WishlistSettings, 'currency'>>;
  getPriorities(): Promise<WishlistPrioritySnapshot>;
  getWishlistRows(): Promise<ExportWishlistRow[]>;
  getPlayCounts(
    albums: Array<{ artist: string; title: string }>
  ): Promise<AlbumPlayCountResult[]>;
}

type Ownership = 'owned' | 'possibly' | 'not-owned';

/** A record that could be bought, with what its reason lines need */
interface Priced {
  record: WishlistPriorityRecord;
  want: EnrichedWishlistItem;
  listing: WishlistLowestListing;
  possiblyOwned: boolean;
  plays: AlbumPlayCountResult | undefined;
}

interface Scored extends Priced {
  score: number;
  cents: number;
  artistKey: string;
}

const toCents = (amount: number) => Math.round(amount * 100);

const artistKeyOf = (artist: string) =>
  stripDiscogsSuffixes(artist).toLowerCase().trim();

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function ago(timestampMs: number, now: number): string {
  const days = Math.max(0, Math.floor((now - timestampMs) / DAY_MS));
  if (days === 0) return 'today';
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 730) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

/** How wants in a record stand against the collection; any firm match counts */
function ownershipOf(
  record: WishlistPriorityRecord,
  rowsByWant: Map<number, ExportWishlistRow>
): Ownership {
  let result: Ownership = 'not-owned';
  for (const id of record.wantIds) {
    const row = rowsByWant.get(id);
    if (!row || row.ownedMatch === 'not-owned' || row.ownedMatch === 'unknown')
      continue;
    if (row.ownedMatchConfidence === 'likely') {
      result = 'possibly';
    } else {
      return 'owned';
    }
  }
  return result;
}

/** The cheapest listing in `currency` among a record's wants */
function listingOf(
  wants: EnrichedWishlistItem[],
  currency: string
): {
  want?: EnrichedWishlistItem;
  listing?: WishlistLowestListing;
  checked: boolean;
} {
  let want: EnrichedWishlistItem | undefined;
  let listing: WishlistLowestListing | undefined;
  let checked = false;
  for (const candidate of wants) {
    const current = candidate.lowestListing;
    if (
      current === undefined ||
      (current !== null && current.currency !== currency)
    ) {
      continue;
    }
    checked = true;
    if (current && (!listing || current.price < listing.price)) {
      want = candidate;
      listing = current;
    }
  }
  return { want, listing, checked };
}

function alertPart(listing: WishlistLowestListing, want: EnrichedWishlistItem) {
  const alert = want.priceAlert;
  if (!alert || alert.currency !== listing.currency) return 0;
  if (listing.price <= alert.maxPrice) return 1;
  return clamp01(1 - (listing.price - alert.maxPrice) / (alert.maxPrice * 0.5));
}

function scoreOf(priced: Priced, maxPlays: number, now: number): number {
  const plays = priced.plays?.playCount ?? 0;
  const lastPlayed = priced.plays?.lastPlayed;
  const playsPart = maxPlays > 0 ? Math.log1p(plays) / Math.log1p(maxPlays) : 0;
  const recentPart = lastPlayed
    ? clamp01(
        1 -
          ((now - lastPlayed * 1000) / DAY_MS - RECENT_FULL_DAYS) /
            (RECENT_NONE_DAYS - RECENT_FULL_DAYS)
      )
    : 0;
  const added = new Date(priced.want.dateAdded).getTime();
  const agePart = Number.isFinite(added)
    ? clamp01((now - added) / (AGE_FULL_YEARS * 365 * DAY_MS))
    : 0;
  return (
    WEIGHT_PLAYS * playsPart +
    WEIGHT_RECENT * recentPart +
    WEIGHT_ALERT * alertPart(priced.listing, priced.want) +
    WEIGHT_AGE * agePart
  );
}

function reasonsFor(priced: Priced, now: number): BuyingShortlistReason[] {
  const { record, want, listing, plays, possiblyOwned } = priced;
  const reasons: BuyingShortlistReason[] = [];
  if (record.rank !== null) {
    reasons.push({ kind: 'priority', text: `Your #${record.rank} priority` });
  }

  const count = plays?.playCount ?? 0;
  reasons.push({
    kind: 'plays',
    text:
      count === 0
        ? 'Not played yet'
        : `${count} play${count === 1 ? '' : 's'}${
            plays?.lastPlayed
              ? `, last played ${ago(plays.lastPlayed * 1000, now)}`
              : ''
          }`,
  });

  const alert = want.priceAlert;
  if (alert && alert.currency === listing.currency) {
    const difference = toCents(listing.price) - toCents(alert.maxPrice);
    const amount = formatMoney(Math.abs(difference) / 100, listing.currency);
    reasons.push({
      kind: 'alert',
      text:
        difference === 0
          ? 'At your alert price'
          : `${amount} ${difference < 0 ? 'under' : 'over'} your alert price`,
    });
  }

  const added = new Date(want.dateAdded);
  if (Number.isFinite(added.getTime())) {
    reasons.push({
      kind: 'wishlist-age',
      text: `On your wishlist since ${added.getUTCFullYear()}`,
    });
  }
  if (possiblyOwned) {
    reasons.push({
      kind: 'possibly-owned',
      text: 'You may own another version',
    });
  }
  if (now - listing.checkedAt > STALE_PRICE_MS) {
    reasons.push({
      kind: 'stale-price',
      text: `Price checked ${ago(listing.checkedAt, now)}, it may have changed`,
    });
  }
  return reasons;
}

/**
 * The best set of up to `slots` candidates within `budgetCents`. Reaching
 * `minPicks` beats not reaching it; then the highest total score, then the
 * lowest total price. `candidates` must be sorted best first, so ties go to
 * the first set found.
 */
export function bestCombination<
  T extends { score: number; cents: number; artistKey: string },
>(
  candidates: T[],
  slots: number,
  budgetCents: number,
  minPicks: number,
  artistCounts: ReadonlyMap<string, number>,
  maxPerArtist: number
): T[] {
  let best: T[] = [];
  let bestScore = 0;
  let bestCents = 0;
  const chosen: T[] = [];
  const counts = new Map(artistCounts);

  const consider = (score: number, cents: number) => {
    const reaches = chosen.length >= minPicks;
    const bestReaches = best.length >= minPicks;
    const better =
      reaches !== bestReaches
        ? reaches
        : score > bestScore || (score === bestScore && cents < bestCents);
    if (better) {
      best = [...chosen];
      bestScore = score;
      bestCents = cents;
    }
  };

  const search = (from: number, score: number, cents: number) => {
    if (chosen.length > 0) consider(score, cents);
    if (chosen.length === slots) return;
    for (let i = from; i < candidates.length; i++) {
      const candidate = candidates[i];
      if (cents + candidate.cents > budgetCents) continue;
      const artistCount = counts.get(candidate.artistKey) ?? 0;
      if (artistCount >= maxPerArtist) continue;
      chosen.push(candidate);
      counts.set(candidate.artistKey, artistCount + 1);
      search(i + 1, score + candidate.score, cents + candidate.cents);
      chosen.pop();
      counts.set(candidate.artistKey, artistCount);
    }
  };
  search(0, 0, 0);
  return best;
}

/**
 * Suggests records to buy within a budget. The owner's ranking decides first:
 * it walks down from #1, taking what fits. Scores only choose among unranked
 * records for the slots left over.
 */
export class BuyingShortlistService {
  constructor(
    private readonly source: BuyingShortlistSource,
    private readonly now: () => number = Date.now
  ) {}

  async getShortlist(opts: {
    budget: number;
    count?: number;
  }): Promise<BuyingShortlist> {
    const count = opts.count ?? DEFAULT_SHORTLIST_COUNT;
    const [wants, settings, priorities, rows] = await Promise.all([
      this.source.getPricedWants(),
      this.source.getSettings(),
      this.source.getPriorities(),
      this.source.getWishlistRows(),
    ]);
    const now = this.now();
    const currency = settings.currency;
    const money = (cents: number) => formatMoney(cents / 100, currency);

    const wantById = new Map(wants.map(want => [want.id, want]));
    const rowsByWant = new Map<number, ExportWishlistRow>();
    for (const row of rows) {
      const match = /^discogs-want:(\d+)$/.exec(row.rowId);
      if (match) rowsByWant.set(Number(match[1]), row);
    }
    const wantsOf = (record: WishlistPriorityRecord) =>
      record.wantIds.flatMap(id => wantById.get(id) ?? []);

    const playable = [...priorities.ranked, ...priorities.unranked].filter(
      record => wantsOf(record).length > 0
    );
    const playCounts = await this.source.getPlayCounts(
      playable.map(({ artist, title }) => ({ artist, title }))
    );
    const playsByKey = new Map(
      playable.map((record, index) => [record.key, playCounts[index]])
    );

    /** A priced, unowned record, or why it can't be bought */
    const assess = (
      record: WishlistPriorityRecord
    ): Priced | { reason: BuyingShortlistSkip['reason']; text: string } => {
      const ownership = ownershipOf(record, rowsByWant);
      if (ownership === 'owned') {
        return { reason: 'owned', text: 'You already own this record' };
      }
      const { want, listing, checked } = listingOf(wantsOf(record), currency);
      if (want && listing) {
        return {
          record,
          want,
          listing,
          possiblyOwned: ownership === 'possibly',
          plays: playsByKey.get(record.key),
        };
      }
      return checked
        ? { reason: 'none-for-sale', text: 'Nothing for sale right now' }
        : { reason: 'no-price', text: 'No price checked for this record yet' };
    };

    const budgetCents = toCents(opts.budget);
    let spentCents = 0;
    const picked: Priced[] = [];
    const skipped: BuyingShortlistSkip[] = [];

    for (const record of priorities.ranked) {
      if (picked.length === count) break;
      const assessed = assess(record);
      const skip = (reason: BuyingShortlistSkip['reason'], text: string) =>
        skipped.push({
          key: record.key,
          rank: record.rank as number,
          artist: record.artist,
          title: record.title,
          reason,
          text,
        });
      if ('reason' in assessed) {
        skip(assessed.reason, assessed.text);
        continue;
      }
      const cents = toCents(assessed.listing.price);
      if (spentCents + cents > budgetCents) {
        const left = budgetCents - spentCents;
        skip(
          'over-budget',
          `${money(cents)} is more than the ${money(left)} ${
            picked.length > 0 ? 'left' : 'budget'
          }`
        );
        continue;
      }
      picked.push(assessed);
      spentCents += cents;
    }

    const slots = count - picked.length;
    if (slots > 0) {
      const available = priorities.unranked
        .map(assess)
        .filter((a): a is Priced => !('reason' in a))
        .filter(a => toCents(a.listing.price) <= budgetCents - spentCents);
      const maxPlays = Math.max(
        0,
        ...available.map(a => a.plays?.playCount ?? 0)
      );
      const scored: Scored[] = available
        .map(a => ({
          ...a,
          score: scoreOf(a, maxPlays, now),
          cents: toCents(a.listing.price),
          artistKey: artistKeyOf(a.record.artist),
        }))
        .sort(
          (a, b) =>
            b.score - a.score ||
            a.cents - b.cents ||
            a.record.artist.localeCompare(b.record.artist) ||
            a.record.title.localeCompare(b.record.title)
        )
        .slice(0, MAX_COMBINATION_CANDIDATES);

      const artistCounts = new Map<string, number>();
      for (const { record } of picked) {
        const key = artistKeyOf(record.artist);
        artistCounts.set(key, (artistCounts.get(key) ?? 0) + 1);
      }
      const filled = bestCombination(
        scored,
        slots,
        budgetCents - spentCents,
        MIN_SHORTLIST_COUNT - picked.length,
        artistCounts,
        MAX_PICKS_PER_ARTIST
      );
      for (const pick of filled) {
        picked.push(pick);
        spentCents += pick.cents;
      }
    }

    const picks: BuyingShortlistPick[] = picked.map(priced => ({
      key: priced.record.key,
      rank: priced.record.rank,
      artist: priced.record.artist,
      title: priced.record.title,
      coverImage: priced.record.coverImage,
      listing: priced.listing,
      reasons: reasonsFor(priced, now),
    }));

    return {
      budget: opts.budget,
      currency,
      picks,
      skipped,
      total: spentCents / 100,
      leftOver: (budgetCents - spentCents) / 100,
      ownershipUnknown: rows.some(row => row.ownedMatch === 'unknown'),
    };
  }
}
