import { ROUTES } from '../../../src/renderer/routes';
import {
  CollectionViewSnapshot,
  clearCollectionViewSnapshot,
  readCollectionViewSnapshotForReturn,
  recordRouteVisit,
  resetRouteTrackingForTests,
  saveCollectionViewSnapshot,
} from '../../../src/renderer/utils/collectionViewSnapshot';

const snapshot: CollectionViewSnapshot = {
  searchQuery: 'radiohead',
  searchPage: 2,
  sortBy: 'year',
  sortOrder: 'desc',
  viewMode: 'grid',
  filterFormat: 'Vinyl',
  filterYearFrom: '1990',
  filterYearTo: '',
  filterDateAdded: '',
  currentRecordIndex: 0,
  pageScrollTop: 120,
  gridScrollTop: 800,
};

describe('collectionViewSnapshot', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetRouteTrackingForTests();
  });

  it('returns the snapshot when returning from album details', () => {
    recordRouteVisit(ROUTES.COLLECTION);
    saveCollectionViewSnapshot(snapshot);
    recordRouteVisit(ROUTES.RELEASE_DETAILS);

    // Collection page reads before App records the collection route...
    expect(readCollectionViewSnapshotForReturn()).toEqual(snapshot);

    // ...or after (e.g. when the lazy chunk resolves late)
    recordRouteVisit(ROUTES.COLLECTION);
    expect(readCollectionViewSnapshotForReturn()).toEqual(snapshot);
  });

  it('returns null when arriving from another page', () => {
    recordRouteVisit(ROUTES.RELEASE_DETAILS);
    saveCollectionViewSnapshot(snapshot);
    recordRouteVisit(ROUTES.HOME);

    expect(readCollectionViewSnapshotForReturn()).toBeNull();
  });

  it('discards the snapshot when leaving the album page for another page', () => {
    recordRouteVisit(ROUTES.COLLECTION);
    saveCollectionViewSnapshot(snapshot);
    recordRouteVisit(ROUTES.RELEASE_DETAILS);
    recordRouteVisit(ROUTES.ARTIST_DETAIL);
    recordRouteVisit(ROUTES.RELEASE_DETAILS);

    expect(readCollectionViewSnapshotForReturn()).toBeNull();
  });

  it('returns null once cleared', () => {
    recordRouteVisit(ROUTES.COLLECTION);
    saveCollectionViewSnapshot(snapshot);
    recordRouteVisit(ROUTES.RELEASE_DETAILS);
    clearCollectionViewSnapshot();

    expect(readCollectionViewSnapshotForReturn()).toBeNull();
  });

  it('ignores malformed stored data', () => {
    recordRouteVisit(ROUTES.RELEASE_DETAILS);
    sessionStorage.setItem(
      'collection-view-snapshot',
      JSON.stringify({ ...snapshot, sortBy: 'bogus' })
    );

    expect(readCollectionViewSnapshotForReturn()).toBeNull();
  });
});
