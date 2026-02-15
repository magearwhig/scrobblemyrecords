import { renderHook, waitFor } from '@testing-library/react';

import {
  useCollectionLookup,
  lookupInCollection,
  isInCollection,
  getArtistAlbumCount,
} from '../../../src/renderer/hooks/useCollectionLookup';
import { CollectionItem } from '../../../src/shared/types';

// Mock logger
jest.mock('../../../src/renderer/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

// Mock contexts
const mockUseApp = {
  state: { serverUrl: 'http://localhost:3000' },
  dispatch: jest.fn(),
};

const mockUsername = 'testuser';

jest.mock('../../../src/renderer/context/AppContext', () => ({
  useApp: () => mockUseApp,
}));

jest.mock('../../../src/renderer/context/AuthContext', () => ({
  useAuth: () => ({
    authStatus: {
      discogs: { username: mockUsername },
    },
  }),
}));

// Mock API
const mockGetEntireCollection = jest.fn();

jest.mock('../../../src/renderer/services/api', () => ({
  getApiService: () => ({
    getEntireCollection: mockGetEntireCollection,
  }),
}));

function createCollectionItem(
  id: number,
  artist: string,
  title: string
): CollectionItem {
  return {
    id,
    release: {
      id,
      title,
      artist,
      format: ['Vinyl'],
      label: ['Test Label'],
      resource_url: `https://api.discogs.com/releases/${id}`,
    },
    date_added: '2024-01-01T00:00:00Z',
  };
}

describe('useCollectionLookup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetEntireCollection.mockResolvedValue({
      success: true,
      data: [
        createCollectionItem(1, 'Radiohead', 'OK Computer'),
        createCollectionItem(2, 'Radiohead', 'Kid A'),
        createCollectionItem(3, 'The Beatles', 'Abbey Road'),
      ],
    });
  });

  describe('hook behavior', () => {
    it('loads collection on mount when username is set', async () => {
      const { result } = renderHook(() => useCollectionLookup());

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockGetEntireCollection).toHaveBeenCalledWith('testuser');
      expect(result.current.collection).toHaveLength(3);
    });

    it('builds collectionMap with normalized keys', async () => {
      const { result } = renderHook(() => useCollectionLookup());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.collectionMap.size).toBe(3);
    });

    it('builds collectionArtistCounts correctly', async () => {
      const { result } = renderHook(() => useCollectionLookup());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Radiohead has 2 albums, The Beatles has 1
      expect(result.current.collectionArtistCounts.get('radiohead')).toBe(2);
      expect(result.current.collectionArtistCounts.get('the beatles')).toBe(1);
    });

    it('handles API failure gracefully', async () => {
      mockGetEntireCollection.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useCollectionLookup());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.collection).toHaveLength(0);
      expect(result.current.collectionMap.size).toBe(0);
    });

    it('handles unsuccessful API response', async () => {
      mockGetEntireCollection.mockResolvedValue({
        success: false,
        data: null,
      });

      const { result } = renderHook(() => useCollectionLookup());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.collection).toHaveLength(0);
    });
  });
});

describe('lookupInCollection', () => {
  let collectionMap: Map<string, CollectionItem>;

  beforeEach(() => {
    jest.clearAllMocks();
    collectionMap = new Map();
    // Build normalized keys matching what buildCollectionKey would produce
    collectionMap.set(
      'radiohead|ok computer',
      createCollectionItem(1, 'Radiohead', 'OK Computer')
    );
    collectionMap.set(
      'the beatles|abbey road',
      createCollectionItem(2, 'The Beatles', 'Abbey Road')
    );
  });

  it('finds an album in the collection', () => {
    const result = lookupInCollection(
      collectionMap,
      'Radiohead',
      'OK Computer'
    );
    expect(result).toBeDefined();
    expect(result?.release.title).toBe('OK Computer');
  });

  it('returns undefined for album not in collection', () => {
    const result = lookupInCollection(collectionMap, 'Radiohead', 'Amnesiac');
    expect(result).toBeUndefined();
  });

  it('handles case-insensitive lookup', () => {
    const result = lookupInCollection(
      collectionMap,
      'radiohead',
      'ok computer'
    );
    expect(result).toBeDefined();
  });

  it('handles empty strings', () => {
    const result = lookupInCollection(collectionMap, '', '');
    expect(result).toBeUndefined();
  });

  it('handles empty map', () => {
    const result = lookupInCollection(new Map(), 'Radiohead', 'OK Computer');
    expect(result).toBeUndefined();
  });
});

describe('isInCollection', () => {
  let collectionMap: Map<string, CollectionItem>;

  beforeEach(() => {
    jest.clearAllMocks();
    collectionMap = new Map();
    collectionMap.set(
      'radiohead|ok computer',
      createCollectionItem(1, 'Radiohead', 'OK Computer')
    );
  });

  it('returns true for album in collection', () => {
    expect(isInCollection(collectionMap, 'Radiohead', 'OK Computer')).toBe(
      true
    );
  });

  it('returns false for album not in collection', () => {
    expect(isInCollection(collectionMap, 'Radiohead', 'Amnesiac')).toBe(false);
  });

  it('returns false for empty map', () => {
    expect(isInCollection(new Map(), 'Radiohead', 'OK Computer')).toBe(false);
  });
});

describe('getArtistAlbumCount', () => {
  let artistCounts: Map<string, number>;

  beforeEach(() => {
    jest.clearAllMocks();
    artistCounts = new Map();
    artistCounts.set('radiohead', 5);
    artistCounts.set('the beatles', 3);
  });

  it('returns count for known artist', () => {
    expect(getArtistAlbumCount(artistCounts, 'Radiohead')).toBe(5);
  });

  it('returns 0 for unknown artist', () => {
    expect(getArtistAlbumCount(artistCounts, 'Pink Floyd')).toBe(0);
  });

  it('handles case-insensitive artist names', () => {
    expect(getArtistAlbumCount(artistCounts, 'RADIOHEAD')).toBe(5);
  });

  it('returns 0 for empty string', () => {
    expect(getArtistAlbumCount(artistCounts, '')).toBe(0);
  });

  it('returns 0 for empty map', () => {
    expect(getArtistAlbumCount(new Map(), 'Radiohead')).toBe(0);
  });
});
