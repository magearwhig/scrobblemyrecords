import { CollectionItem } from '../../shared/types';

import { FileStorage } from './fileStorage';

/**
 * Reads all cached collection pages for a given Discogs username and returns
 * a flat array of CollectionItem objects.
 *
 * Collection pages are stored as individual JSON files:
 *   collections/{username}-page-1.json
 *   collections/{username}-page-2.json
 *   ...
 *
 * Iteration stops at the first missing or empty page.
 * Returns an empty array if no cache exists.
 */
export async function getAllCachedCollectionItems(
  username: string,
  fileStorage: FileStorage
): Promise<CollectionItem[]> {
  const allItems: CollectionItem[] = [];
  let pageNumber = 1;

  while (true) {
    const cacheKey = `collections/${username}-page-${pageNumber}.json`;
    const cached = await fileStorage.readJSON<{
      data: CollectionItem[];
      timestamp: number;
    }>(cacheKey);

    if (!cached || !cached.data || cached.data.length === 0) break;
    allItems.push(...cached.data);
    pageNumber++;
  }

  return allItems;
}
