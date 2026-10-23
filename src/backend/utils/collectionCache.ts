import { CollectionItem, ExportCollectionCacheInfo } from '../../shared/types';

import { FileStorage } from './fileStorage';
import { toIsoSeconds } from './timestamps';

/** One cached collection page file, as written by the collection sync */
interface CollectionCachePage {
  data?: CollectionItem[];
  pagination?: { pages?: number; items?: number };
  /** ms */
  timestamp?: number;
}

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

/**
 * Read the cached collection pages like getAllCachedCollectionItems, and also
 * report whether the cache is complete. Page 1's pagination says how many
 * pages and items Discogs had; a missing or empty page stops the read, so a
 * gap in the middle shows up as 'partial' instead of silently returning fewer
 * items. The {username}-progress.json file is not used: it says 'completed'
 * even when pages failed.
 */
export async function readCollectionCacheSnapshot(
  username: string,
  fileStorage: FileStorage
): Promise<{ items: CollectionItem[]; info: ExportCollectionCacheInfo }> {
  const items: CollectionItem[] = [];
  const timestamps: number[] = [];
  let pagesExpected: number | null = null;
  let itemsExpected: number | null = null;
  let paginationMissing = false;
  let pagesRead = 0;

  const firstPage = await readPage(username, 1, fileStorage);
  if (!firstPage || !Array.isArray(firstPage.data)) {
    return {
      items,
      info: {
        status: 'missing',
        pagesExpected,
        pagesRead,
        itemsExpected,
        itemsRead: 0,
        oldestPageAt: null,
        newestPageAt: null,
      },
    };
  }
  pagesExpected = firstPage.pagination?.pages ?? null;
  itemsExpected = firstPage.pagination?.items ?? null;

  const readOne = (page: CollectionCachePage) => {
    items.push(...(page.data ?? []));
    pagesRead++;
    if (!page.pagination) paginationMissing = true;
    if (typeof page.timestamp === 'number') timestamps.push(page.timestamp);
  };

  // An empty collection is cached as page 1 with no items, so page 1 always
  // counts; later pages stop the read when missing or empty
  readOne(firstPage);
  let page =
    firstPage.data.length > 0 ? await readPage(username, 2, fileStorage) : null;
  while (page && page.data && page.data.length > 0) {
    readOne(page);
    page = await readPage(username, pagesRead + 1, fileStorage);
  }

  const complete =
    !paginationMissing &&
    items.length === itemsExpected &&
    // Discogs may report 0 pages for an empty collection
    (pagesRead === pagesExpected || itemsExpected === 0);

  return {
    items,
    info: {
      status: complete ? 'complete' : 'partial',
      pagesExpected,
      pagesRead,
      itemsExpected,
      itemsRead: items.length,
      oldestPageAt:
        timestamps.length > 0 ? toIsoSeconds(Math.min(...timestamps)) : null,
      newestPageAt:
        timestamps.length > 0 ? toIsoSeconds(Math.max(...timestamps)) : null,
    },
  };
}

async function readPage(
  username: string,
  pageNumber: number,
  fileStorage: FileStorage
): Promise<CollectionCachePage | null> {
  return fileStorage.readJSON<CollectionCachePage>(
    `collections/${username}-page-${pageNumber}.json`
  );
}
