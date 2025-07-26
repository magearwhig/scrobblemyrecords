import { CollectionItem, DiscogsRelease } from '../../src/shared/types';

// Mock data for testing sorting
const mockCollectionItems: CollectionItem[] = [
  {
    id: 1,
    release: {
      id: 1,
      title: 'Zebra Album',
      artist: 'Zebra Band',
      year: 2020,
      format: ['Vinyl'],
      label: ['Test Label'],
      resource_url: 'https://api.discogs.com/releases/1',
    },
    folder_id: 1,
    date_added: '2023-01-01T00:00:00Z',
  },
  {
    id: 2,
    release: {
      id: 2,
      title: 'Alpha Album',
      artist: 'Alpha Artist',
      year: 2019,
      format: ['CD'],
      label: ['Another Label'],
      resource_url: 'https://api.discogs.com/releases/2',
    },
    folder_id: 1,
    date_added: '2023-01-02T00:00:00Z',
  },
  {
    id: 3,
    release: {
      id: 3,
      title: 'Beta Album',
      artist: 'Beta Band',
      year: 2021,
      format: ['Vinyl'],
      label: ['Test Label'],
      resource_url: 'https://api.discogs.com/releases/3',
    },
    folder_id: 1,
    date_added: '2023-01-03T00:00:00Z',
  },
];

// Sorting function (copied from CollectionPage)
const sortCollection = (
  items: CollectionItem[],
  sortBy: 'artist' | 'title' | 'year' | 'date_added' = 'artist',
  sortOrder: 'asc' | 'desc' = 'asc'
): CollectionItem[] => {
  return [...items].sort((a, b) => {
    let aValue: any;
    let bValue: any;

    switch (sortBy) {
      case 'artist':
        aValue = a.release.artist || '';
        bValue = b.release.artist || '';
        break;
      case 'title':
        aValue = a.release.title || '';
        bValue = b.release.title || '';
        break;
      case 'year':
        aValue = a.release.year || 0;
        bValue = b.release.year || 0;
        break;
      case 'date_added':
        aValue = new Date(a.date_added || '').getTime();
        bValue = new Date(b.date_added || '').getTime();
        break;
      default:
        aValue = a.release.artist || '';
        bValue = b.release.artist || '';
    }

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      aValue = aValue.toLowerCase();
      bValue = bValue.toLowerCase();
    }

    if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });
};

describe('Collection Sorting', () => {
  test('should sort by artist ascending by default', () => {
    const sorted = sortCollection(mockCollectionItems);
    expect(sorted[0].release.artist).toBe('Alpha Artist');
    expect(sorted[1].release.artist).toBe('Beta Band');
    expect(sorted[2].release.artist).toBe('Zebra Band');
  });

  test('should sort by artist descending', () => {
    const sorted = sortCollection(mockCollectionItems, 'artist', 'desc');
    expect(sorted[0].release.artist).toBe('Zebra Band');
    expect(sorted[1].release.artist).toBe('Beta Band');
    expect(sorted[2].release.artist).toBe('Alpha Artist');
  });

  test('should sort by title ascending', () => {
    const sorted = sortCollection(mockCollectionItems, 'title', 'asc');
    expect(sorted[0].release.title).toBe('Alpha Album');
    expect(sorted[1].release.title).toBe('Beta Album');
    expect(sorted[2].release.title).toBe('Zebra Album');
  });

  test('should sort by year ascending', () => {
    const sorted = sortCollection(mockCollectionItems, 'year', 'asc');
    expect(sorted[0].release.year).toBe(2019);
    expect(sorted[1].release.year).toBe(2020);
    expect(sorted[2].release.year).toBe(2021);
  });

  test('should sort by date added ascending', () => {
    const sorted = sortCollection(mockCollectionItems, 'date_added', 'asc');
    expect(sorted[0].date_added).toBe('2023-01-01T00:00:00Z');
    expect(sorted[1].date_added).toBe('2023-01-02T00:00:00Z');
    expect(sorted[2].date_added).toBe('2023-01-03T00:00:00Z');
  });

  test('should handle missing values gracefully', () => {
    const itemsWithMissingData: CollectionItem[] = [
      {
        id: 1,
        release: {
          id: 1,
          title: 'Album 1',
          artist: '',
          year: undefined,
          format: ['Vinyl'],
          label: ['Label'],
          resource_url: 'https://api.discogs.com/releases/1',
        },
        folder_id: 1,
        date_added: '',
      },
      {
        id: 2,
        release: {
          id: 2,
          title: 'Album 2',
          artist: 'Artist',
          year: 2020,
          format: ['CD'],
          label: ['Label'],
          resource_url: 'https://api.discogs.com/releases/2',
        },
        folder_id: 1,
        date_added: '2023-01-01T00:00:00Z',
      },
    ];

    const sorted = sortCollection(itemsWithMissingData, 'artist', 'asc');
    expect(sorted[0].release.artist).toBe(''); // Empty string should come first
    expect(sorted[1].release.artist).toBe('Artist');
  });
});
