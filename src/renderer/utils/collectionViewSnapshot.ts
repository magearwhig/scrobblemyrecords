import { CollectionSortBy } from '../../shared/types';
import { ROUTES } from '../routes';

import { createLogger } from './logger';

const logger = createLogger('collectionViewSnapshot');

const STORAGE_KEY = 'collection-view-snapshot';

/**
 * Browse Collection view state captured when the user opens an album, so that
 * coming straight back to the collection shows the same search/filters/scroll.
 */
export interface CollectionViewSnapshot {
  searchQuery: string;
  searchPage: number;
  sortBy: CollectionSortBy;
  sortOrder: 'asc' | 'desc';
  viewMode: 'grid' | 'single';
  filterFormat: string;
  filterYearFrom: string;
  filterYearTo: string;
  filterDateAdded: string;
  currentRecordIndex: number;
  /** scrollTop of the page's scroll container (`.content`) */
  pageScrollTop: number;
  /** scrollTop of the virtualized browse grid */
  gridScrollTop: number;
}

const SORT_BY_VALUES: readonly CollectionSortBy[] = [
  'artist',
  'title',
  'year',
  'date_added',
  'scrobbles',
];

// Route tracking. Updated from App whenever the rendered page changes.
let currentRoute: string | null = null;
let previousRoute: string | null = null;

/**
 * Record that the app is now rendering `route`. Leaving the collection/album
 * flow for any other page discards the snapshot, so a later visit starts fresh.
 */
export function recordRouteVisit(route: string): void {
  if (route === currentRoute) return;
  previousRoute = currentRoute;
  currentRoute = route;

  if (route !== ROUTES.COLLECTION && route !== ROUTES.RELEASE_DETAILS) {
    clearCollectionViewSnapshot();
  }
}

/**
 * The route shown before the collection page. Handles being called either
 * before or after App has recorded the collection route as current.
 */
function getRouteBeforeCollection(): string | null {
  return currentRoute === ROUTES.COLLECTION ? previousRoute : currentRoute;
}

export function saveCollectionViewSnapshot(
  snapshot: CollectionViewSnapshot
): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    logger.warn('Failed to save collection view snapshot', error);
  }
}

export function clearCollectionViewSnapshot(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable - nothing to clear
  }
}

function parseSnapshot(raw: string): CollectionViewSnapshot | null {
  const data = JSON.parse(raw) as Partial<CollectionViewSnapshot>;
  const isString = (v: unknown): v is string => typeof v === 'string';
  const isNumber = (v: unknown): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0;

  if (
    !isString(data.searchQuery) ||
    !isNumber(data.searchPage) ||
    !SORT_BY_VALUES.includes(data.sortBy as CollectionSortBy) ||
    (data.sortOrder !== 'asc' && data.sortOrder !== 'desc') ||
    (data.viewMode !== 'grid' && data.viewMode !== 'single') ||
    !isString(data.filterFormat) ||
    !isString(data.filterYearFrom) ||
    !isString(data.filterYearTo) ||
    !isString(data.filterDateAdded) ||
    !isNumber(data.currentRecordIndex) ||
    !isNumber(data.pageScrollTop) ||
    !isNumber(data.gridScrollTop)
  ) {
    return null;
  }
  return data as CollectionViewSnapshot;
}

/**
 * Returns the saved snapshot only if the user is returning directly from the
 * album details page. Does not clear it - call `clearCollectionViewSnapshot`
 * once the page has consumed it (reads must stay side-effect free in render).
 */
export function readCollectionViewSnapshotForReturn(): CollectionViewSnapshot | null {
  if (getRouteBeforeCollection() !== ROUTES.RELEASE_DETAILS) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? parseSnapshot(raw) : null;
  } catch (error) {
    logger.warn('Failed to read collection view snapshot', error);
    return null;
  }
}

/** Test-only: reset module-level route tracking. */
export function resetRouteTrackingForTests(): void {
  currentRoute = null;
  previousRoute = null;
}
