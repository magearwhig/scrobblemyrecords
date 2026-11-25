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
 * Reads as many pages as page 1's pagination says the sync wrote, so pages
 * left over from an earlier, longer sync are never read (they repeat
 * records, or hold ones since sold). Without pagination (old caches), stops
 * at the first missing or empty page. Returns an empty array if no cache
 * exists.
 */
export async function getAllCachedCollectionItems(
  username: string,
  fileStorage: FileStorage
): Promise<CollectionItem[]> {
  const allItems: CollectionItem[] = [];
  let lastPage = Infinity;
  for (let pageNumber = 1; pageNumber <= lastPage; pageNumber++) {
    const cached = await readPage(username, pageNumber, fileStorage);
    if (!cached || !cached.data || cached.data.length === 0) break;
    if (pageNumber === 1) lastPage = pagesWritten(cached);
    allItems.push(...cached.data);
  }
  return allItems;
}

/** How many pages the sync that wrote this page 1 wrote (Infinity if unknown) */
export function pagesWritten(firstPage: CollectionCachePage): number {
  const pages = firstPage.pagination?.pages;
  return typeof pages === 'number' && pages > 0 ? pages : Infinity;
}

/**
 * Delete cached collection pages past `lastPage`: left over from an earlier
 * sync that had more pages. Returns how many were deleted.
 */
export async function removeStaleCollectionPages(
  username: string,
  lastPage: number,
  fileStorage: Pick<FileStorage, 'listFiles' | 'delete'>
): Promise<number> {
  const pattern = new RegExp(
    `^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-page-(\\d+)\\.json$`
  );
  let removed = 0;
  for (const file of await fileStorage.listFiles('collections')) {
    const match = file.match(pattern);
    if (!match || Number(match[1]) <= lastPage) continue;
    await fileStorage.delete(`collections/${file}`);
    removed++;
  }
  return removed;
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
  // Pages past the count page 1 gives are left over from an earlier sync
  const lastPage = pagesWritten(firstPage);
  let page =
    firstPage.data.length > 0 && lastPage >= 2
      ? await readPage(username, 2, fileStorage)
      : null;
  while (page && page.data && page.data.length > 0) {
    readOne(page);
    page =
      pagesRead < lastPage
        ? await readPage(username, pagesRead + 1, fileStorage)
        : null;
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
