import { AlbumHistoryEntry, AlbumMapping } from '../../shared/types';
import { AlbumName } from '../../shared/utils/albumMapping';

import { ScrobbleHistoryStorage } from './scrobbleHistoryStorage';

export type MergedHistoryResult = {
  entry: AlbumHistoryEntry | null;
  matchType: 'exact' | 'fuzzy' | 'none';
  matchedKeys: string[];
};

/**
 * Load all album mappings, tolerating a missing service (or a mocked one that
 * returns nothing).
 */
export async function loadAlbumMappings(
  mappingService: { getAllAlbumMappings(): Promise<AlbumMapping[]> } | null
): Promise<AlbumMapping[]> {
  if (!mappingService) return [];
  return (await mappingService.getAllAlbumMappings()) ?? [];
}

/**
 * Look up scrobble history for several albums, each known by one or more
 * names (e.g. a collection item's own title plus every history album mapped to
 * it). Uses a single batch lookup; each album's result combines all its names,
 * counting a history entry once even when several names match it.
 */
export async function lookupMergedHistory(
  historyStorage: Pick<
    ScrobbleHistoryStorage,
    'batchLookup' | 'normalizeKey' | 'getIndex'
  >,
  namesPerAlbum: AlbumName[][],
  options?: { countsOnly?: boolean }
): Promise<MergedHistoryResult[]> {
  const uniqueNames = new Map<string, AlbumName>();
  for (const names of namesPerAlbum) {
    for (const name of names) {
      uniqueNames.set(
        historyStorage.normalizeKey(name.artist, name.album),
        name
      );
    }
  }

  const batchResults = await historyStorage.batchLookup(
    Array.from(uniqueNames.values()),
    options
  );

  // Loaded only when two names' matches partially overlap
  let index: Awaited<ReturnType<typeof historyStorage.getIndex>> | undefined;

  const merged: MergedHistoryResult[] = [];
  for (const names of namesPerAlbum) {
    const seenKeys = new Set<string>();
    let matchType: MergedHistoryResult['matchType'] = 'none';
    let playCount = 0;
    let lastPlayed = 0;
    const plays: AlbumHistoryEntry['plays'] = [];
    const add = (entry: AlbumHistoryEntry) => {
      playCount += entry.playCount;
      lastPlayed = Math.max(lastPlayed, entry.lastPlayed);
      if (!options?.countsOnly) plays.push(...entry.plays);
    };

    for (const name of names) {
      const nameKey = historyStorage.normalizeKey(name.artist, name.album);
      const result = batchResults.get(nameKey);
      if (!result?.entry || result.matchType === 'none') continue;

      const keys = result.matchedKeys?.length ? result.matchedKeys : [nameKey];
      const newKeys = keys.filter(k => !seenKeys.has(k));
      if (newKeys.length === 0) continue;

      if (newKeys.length === keys.length) {
        add(result.entry);
      } else {
        // Partial overlap: add only the entries not already counted
        index ??= await historyStorage.getIndex();
        for (const key of newKeys) {
          const entry = index?.albums[key];
          if (entry) add(entry);
        }
      }
      newKeys.forEach(k => seenKeys.add(k));
      if (matchType !== 'exact') matchType = result.matchType;
    }

    merged.push({
      entry: matchType === 'none' ? null : { playCount, lastPlayed, plays },
      matchType,
      matchedKeys: Array.from(seenKeys),
    });
  }
  return merged;
}
