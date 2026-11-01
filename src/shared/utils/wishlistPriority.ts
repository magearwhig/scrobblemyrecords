import {
  EnrichedWishlistItem,
  LocalWantItem,
  WishlistPriorityChange,
  WishlistPriorityRecord,
  WishlistPrioritySnapshot,
} from '../types';

/**
 * Key of the record a Discogs want belongs to. Pressings of one master share
 * a record, so they share a rank.
 */
export function wishlistRecordKey(
  item: Pick<EnrichedWishlistItem, 'masterId' | 'releaseId'>
): string {
  return item.masterId > 0
    ? `master:${item.masterId}`
    : `release:${item.releaseId}`;
}

/** Same match the Wishlist page uses to hide a local want wanted on Discogs */
export function wishlistNameKey(artist: string, title: string): string {
  return `${artist.toLowerCase().trim()}|${title.toLowerCase().trim()}`;
}

export interface WishlistPriorityRecords {
  /** One per record, in no particular order */
  records: WishlistPriorityRecord[];
  /** Stored key to the record it counts as, for keys that aren't the record's own */
  aliases: Map<string, string>;
}

/**
 * Group wants into records. A local want with the same name as a Discogs want
 * joins that record; its guessed masterId is never used.
 */
export function buildWishlistRecords(
  wants: EnrichedWishlistItem[],
  localWants: LocalWantItem[]
): WishlistPriorityRecords {
  const byKey = new Map<string, WishlistPriorityRecord>();
  const byName = new Map<string, WishlistPriorityRecord>();
  const aliases = new Map<string, string>();

  for (const want of wants) {
    const key = wishlistRecordKey(want);
    let record = byKey.get(key);
    if (!record) {
      record = {
        key,
        rank: null,
        monitored: false,
        artist: want.artist,
        title: want.title,
        year: want.year,
        coverImage: want.coverImage,
        masterId: want.masterId > 0 ? want.masterId : undefined,
        wantIds: [],
        localIds: [],
      };
      byKey.set(key, record);
    }
    record.wantIds.push(want.id);
    // A want without a master that later gains one keeps its place
    const releaseKey = `release:${want.releaseId}`;
    if (releaseKey !== key) aliases.set(releaseKey, key);
    const nameKey = wishlistNameKey(want.artist, want.title);
    if (!byName.has(nameKey)) byName.set(nameKey, record);
  }

  for (const local of localWants) {
    const localKey = `local:${local.id}`;
    const match = byName.get(wishlistNameKey(local.artist, local.album));
    if (match) {
      match.monitored = true;
      match.localIds.push(local.id);
      aliases.set(localKey, match.key);
      continue;
    }
    byKey.set(localKey, {
      key: localKey,
      rank: null,
      monitored: true,
      artist: local.artist,
      title: local.album,
      coverImage: local.coverImage,
      wantIds: [],
      localIds: [local.id],
    });
  }

  return { records: [...byKey.values()], aliases };
}

/**
 * Stored keys rewritten to the keys of the records they count as, each once.
 * An alias only lasts while the want it came from does, so a rank mustn't
 * depend on it for longer than that.
 */
export function canonicalPriorityKeys(
  orderedKeys: string[],
  { aliases }: WishlistPriorityRecords
): string[] {
  return [...new Set(orderedKeys.map(key => aliases.get(key) ?? key))];
}

/** Unranked records list by artist, then title */
function compareUnranked(
  a: WishlistPriorityRecord,
  b: WishlistPriorityRecord
): number {
  return (
    a.artist.localeCompare(b.artist, undefined, { sensitivity: 'base' }) ||
    a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
  );
}

/**
 * Join stored keys with the records that exist now. Keys of absent records
 * are skipped, so ranks close up around them; two keys for one record count
 * once, at the higher place.
 */
export function buildPrioritySnapshot(
  orderedKeys: string[],
  { records, aliases }: WishlistPriorityRecords
): WishlistPrioritySnapshot {
  const byKey = new Map(records.map(record => [record.key, record]));
  const ranked: WishlistPriorityRecord[] = [];
  const seen = new Set<string>();
  for (const stored of orderedKeys) {
    const key = aliases.get(stored) ?? stored;
    const record = byKey.get(key);
    if (!record || seen.has(key)) continue;
    seen.add(key);
    ranked.push({ ...record, rank: ranked.length + 1 });
  }
  const unranked = records
    .filter(record => !seen.has(record.key))
    .map(record => ({ ...record, rank: null }))
    .sort(compareUnranked);
  return { ranked, unranked };
}

/**
 * Apply a change to the stored keys. Positions count records that exist now;
 * keys of absent records keep their place among the others. `key` must be a
 * record's own key.
 */
export function applyPriorityChange(
  orderedKeys: string[],
  change: WishlistPriorityChange,
  { records, aliases }: WishlistPriorityRecords
): string[] {
  const existing = new Set(records.map(record => record.key));
  const resolve = (stored: string) => aliases.get(stored) ?? stored;
  const remaining = orderedKeys.filter(
    stored => resolve(stored) !== change.key
  );
  if (change.action === 'unrank') return remaining;

  // Stored index of each record that exists now, first mention only
  const seen = new Set<string>();
  const visibleIndexes: number[] = [];
  remaining.forEach((stored, index) => {
    const key = resolve(stored);
    if (existing.has(key) && !seen.has(key)) {
      seen.add(key);
      visibleIndexes.push(index);
    }
  });

  const at =
    change.position <= visibleIndexes.length
      ? visibleIndexes[change.position - 1]
      : remaining.length;
  return [...remaining.slice(0, at), change.key, ...remaining.slice(at)];
}
