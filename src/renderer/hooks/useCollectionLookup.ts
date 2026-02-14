import { useState, useEffect, useMemo } from 'react';

import { CollectionItem } from '../../shared/types';
import { normalizeForMatching } from '../../shared/utils/trackNormalization';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { getApiService } from '../services/api';
import { createLogger } from '../utils/logger';

const logger = createLogger('useCollectionLookup');

interface CollectionLookupResult {
  /** Map from normalized "artist|album" key to CollectionItem */
  collectionMap: Map<string, CollectionItem>;
  /** Map from normalized artist name to count of albums in collection */
  collectionArtistCounts: Map<string, number>;
  /** Whether the collection is currently loading */
  loading: boolean;
  /** The raw collection items */
  collection: CollectionItem[];
}

/**
 * Build a normalized key for collection lookup.
 * Uses the same normalization as trackNormalization.ts for fuzzy matching.
 */
function buildCollectionKey(artist: string, album: string): string {
  return `${normalizeForMatching(artist)}|${normalizeForMatching(album)}`;
}

/**
 * Reusable hook for fuzzy collection matching across features.
 *
 * Loads the user's Discogs collection and builds lookup maps for:
 * - Album ownership: check if an artist+album is in the collection
 * - Artist album counts: how many albums by a given artist are owned
 *
 * Used by:
 * - Phase 2: Stats "In Collection" badges
 * - Phase 5: Forgotten Favorites "You Own This"
 * - Phase 6: Scrobble History collection links
 */
export function useCollectionLookup(): CollectionLookupResult {
  const { state } = useApp();
  const { authStatus } = useAuth();
  const [collection, setCollection] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(false);

  const username = authStatus.discogs.username;

  useEffect(() => {
    if (!username) return;

    const controller = new AbortController();
    const api = getApiService(state.serverUrl);

    const loadCollection = async () => {
      try {
        setLoading(true);
        const result = await api.getEntireCollection(username);
        if (!controller.signal.aborted && result.success && result.data) {
          setCollection(result.data);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          logger.warn('Failed to load collection for lookup', err);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    loadCollection();

    return () => {
      controller.abort();
    };
  }, [username, state.serverUrl]);

  const collectionMap = useMemo(() => {
    const map = new Map<string, CollectionItem>();
    for (const item of collection) {
      const key = buildCollectionKey(item.release.artist, item.release.title);
      map.set(key, item);
    }
    return map;
  }, [collection]);

  const collectionArtistCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of collection) {
      const normalizedArtist = normalizeForMatching(item.release.artist);
      counts.set(normalizedArtist, (counts.get(normalizedArtist) || 0) + 1);
    }
    return counts;
  }, [collection]);

  return { collectionMap, collectionArtistCounts, loading, collection };
}

/**
 * Look up whether an artist+album is in the collection.
 * Returns the matching CollectionItem or undefined.
 */
export function lookupInCollection(
  collectionMap: Map<string, CollectionItem>,
  artist: string,
  album: string
): CollectionItem | undefined {
  const key = buildCollectionKey(artist, album);
  return collectionMap.get(key);
}

/**
 * Check if an artist+album is in the collection (boolean convenience).
 */
export function isInCollection(
  collectionMap: Map<string, CollectionItem>,
  artist: string,
  album: string
): boolean {
  return lookupInCollection(collectionMap, artist, album) !== undefined;
}

/**
 * Get the number of albums by an artist in the collection.
 * Returns 0 if the artist is not found.
 */
export function getArtistAlbumCount(
  collectionArtistCounts: Map<string, number>,
  artist: string
): number {
  return collectionArtistCounts.get(normalizeForMatching(artist)) || 0;
}
