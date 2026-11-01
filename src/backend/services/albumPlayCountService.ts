import { AlbumIdentifier, AlbumPlayCountResult } from '../../shared/types';
import { createCollectionNameResolver } from '../../shared/utils/albumMapping';

import { artistMappingService } from './artistMappingService';
import { MappingService } from './mappingService';
import { loadAlbumMappings } from './mergedAlbumHistory';
import { ScrobbleHistoryStorage } from './scrobbleHistoryStorage';

/**
 * Play counts for albums named as Discogs names them, with fuzzy matching to
 * handle naming differences with Last.fm.
 */
export async function getAlbumPlayCounts(
  albums: AlbumIdentifier[],
  deps: {
    historyStorage: ScrobbleHistoryStorage;
    mappingService?: MappingService | null;
  }
): Promise<AlbumPlayCountResult[]> {
  const { historyStorage, mappingService } = deps;
  // Process albums in chunks to avoid OOM from parallel fuzzy matching
  const CHUNK_SIZE = 50;
  const countsOnly = { countsOnly: true };
  const results: AlbumPlayCountResult[] = [];
  // Each album's own Discogs name plus every history album mapped to it
  // (handles Discogs→Last.fm name differences and merged versions)
  const namesFor = createCollectionNameResolver(
    await loadAlbumMappings(mappingService ?? null)
  );

  for (let i = 0; i < albums.length; i += CHUNK_SIZE) {
    const chunk = albums.slice(i, i + CHUNK_SIZE);
    const chunkResults = await Promise.all(
      chunk.map(async album => {
        let totalPlayCount = 0;
        let latestPlayed: number | null = null;
        let bestMatchType: 'exact' | 'fuzzy' | 'none' = 'none';
        const countedKeys = new Set<string>();

        for (const name of namesFor(album.artist, album.title)) {
          let result = await historyStorage.getAlbumHistoryFuzzy(
            name.artist,
            name.album,
            countsOnly
          );

          // If not found, try artist name mapping as fallback
          if (result.matchType === 'none') {
            const mappedArtist = artistMappingService.getLastfmName(
              name.artist
            );
            if (mappedArtist !== name.artist) {
              result = await historyStorage.getAlbumHistoryFuzzy(
                mappedArtist,
                name.album,
                countsOnly
              );
            }
          }

          if (!result.entry || result.matchType === 'none') continue;

          // Count each history entry once, even if several names match it
          const keys = result.matchedKeys ?? [];
          const newKeys = keys.filter(k => !countedKeys.has(k));
          if (keys.length > 0 && newKeys.length === 0) continue;
          newKeys.forEach(k => countedKeys.add(k));

          let counts: Array<{ playCount: number; lastPlayed: number }> = [
            result.entry,
          ];
          if (newKeys.length < keys.length) {
            // Partial overlap: count only the entries not already counted
            const index = await historyStorage.getIndex();
            counts = newKeys.flatMap(k =>
              index?.albums[k] ? [index.albums[k]] : []
            );
          }
          for (const entry of counts) {
            totalPlayCount += entry.playCount;
            if (
              entry.lastPlayed &&
              (!latestPlayed || entry.lastPlayed > latestPlayed)
            ) {
              latestPlayed = entry.lastPlayed;
            }
          }
          if (bestMatchType !== 'exact') {
            bestMatchType = result.matchType;
          }
        }

        return {
          artist: album.artist,
          title: album.title,
          playCount: totalPlayCount,
          lastPlayed: latestPlayed,
          matchType: bestMatchType,
        };
      })
    );
    results.push(...chunkResults);
  }
  return results;
}
