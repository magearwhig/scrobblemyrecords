import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import React from 'react';

import { AuthProvider } from '../../../src/renderer/context/AuthContext';
import CollectionPage from '../../../src/renderer/pages/CollectionPage';
import * as apiService from '../../../src/renderer/services/api';
import { AuthStatus, CollectionItem } from '../../../src/shared/types';

// Mock the API service
jest.mock('../../../src/renderer/services/api');
const mockApiService = apiService as jest.Mocked<typeof apiService>;

// Mock components
jest.mock('../../../src/renderer/components/AlbumCard', () => {
  return function MockAlbumCard({
    item,
    selected,
    onSelect,
    onViewDetails,
  }: any) {
    return (
      <div data-testid={`album-card-${item.id}`}>
        <div>
          {item.release.artist} - {item.release.title}
        </div>
        <button onClick={() => onSelect(item.release.id)}>
          {selected ? 'Deselect' : 'Select'}
        </button>
        <button onClick={() => onViewDetails(item.release)}>
          View Details
        </button>
      </div>
    );
  };
});

jest.mock('../../../src/renderer/components/SearchBar', () => {
  return function MockSearchBar({ onSearch, placeholder, disabled }: any) {
    const [query, setQuery] = React.useState('');

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      onSearch(query);
    };

    return (
      <form onSubmit={handleSubmit}>
        <input
          data-testid='search-input'
          type='text'
          placeholder={placeholder}
          disabled={disabled}
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <button type='submit'>Search</button>
      </form>
    );
  };
});

// Mock AppContext
const mockUseApp = {
  state: { serverUrl: 'http://localhost:3001' },
  dispatch: jest.fn(),
};

jest.mock('../../../src/renderer/context/AppContext', () => ({
  useApp: () => mockUseApp,
}));

// Mock window.location.hash
if (!window.location) {
  Object.defineProperty(window, 'location', {
    value: {
      hash: '',
      href: 'http://localhost:3000',
      pathname: '/',
      search: '',
    },
    writable: true,
  });
} else {
  // Update existing location object
  Object.assign(window.location, {
    hash: '',
    href: 'http://localhost:3000',
    pathname: '/',
    search: '',
  });
}

const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

const createMockAuthContext = (authStatus: AuthStatus) => ({
  authStatus,
  setAuthStatus: jest.fn(),
});

const createMockApiInstance = () => ({
  getAuthStatus: jest.fn(),
  getEntireCollection: jest.fn(),
  preloadCollection: jest.fn(),
  searchCollectionPaginated: jest.fn(),
  getCacheProgress: jest.fn(),
  clearCollectionCache: jest.fn(),
  checkForNewItems: jest.fn(),
  updateCacheWithNewItems: jest.fn(),
});

const createMockCollectionItem = (
  id: number,
  artist: string,
  title: string
): CollectionItem => ({
  id,
  release: {
    id,
    artist,
    title,
    year: 2020,
    format: [],
    label: [],
    resource_url: '',
  },
  date_added: '2023-01-01T00:00:00Z',
  folder_id: 1,
});

const renderCollectionPageWithProviders = (
  authStatus: AuthStatus,
  serverUrl: string = 'http://localhost:3001'
) => {
  mockUseApp.state = { serverUrl };
  const authContextValue = createMockAuthContext(authStatus);

  return {
    ...render(
      <AuthProvider value={authContextValue}>
        <CollectionPage />
      </AuthProvider>
    ),
    authContextValue,
  };
};

describe('CollectionPage', () => {
  let mockApi: ReturnType<typeof createMockApiInstance>;

  beforeEach(() => {
    mockApi = createMockApiInstance();
    mockApiService.getApiService.mockReturnValue(mockApi as any);
    jest.clearAllMocks();

    // Re-setup localStorage mock after clearing
    mockLocalStorage.getItem.mockClear();
    mockLocalStorage.setItem.mockClear();
    mockLocalStorage.removeItem.mockClear();
    mockLocalStorage.clear.mockClear();
  });

  describe('Authentication', () => {
    it('shows authentication required message when not authenticated', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: false, username: undefined },
        lastfm: { authenticated: false, username: undefined },
      };

      renderCollectionPageWithProviders(authStatus);

      expect(screen.getByText('Browse Collection')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Please authenticate with Discogs first to browse your collection.'
        )
      ).toBeInTheDocument();
      expect(screen.getByText('Go to Setup')).toBeInTheDocument();
    });

    it('loads collection when authenticated', async () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'test_user' },
        lastfm: { authenticated: false, username: undefined },
      };

      const mockCollection = [
        createMockCollectionItem(1, 'Artist 1', 'Album 1'),
        createMockCollectionItem(2, 'Artist 2', 'Album 2'),
      ];

      mockApi.getEntireCollection.mockResolvedValue({
        success: true,
        data: mockCollection,
        cacheStatus: 'valid',
      });
      mockApi.getCacheProgress.mockResolvedValue({ status: 'completed' });

      renderCollectionPageWithProviders(authStatus);

      await waitFor(() => {
        expect(mockApi.getEntireCollection).toHaveBeenCalledWith(
          'test_user',
          false
        );
      });

      expect(screen.getByText('2 total items')).toBeInTheDocument();
    });
  });

  describe('Collection Loading', () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: true, username: 'test_user' },
      lastfm: { authenticated: false, username: undefined },
    };

    it('shows loading state while fetching collection', async () => {
      mockApi.getEntireCollection.mockImplementation(
        () => new Promise(() => {})
      ); // Never resolves

      renderCollectionPageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Loading collection...')).toBeInTheDocument();
      });
    });

    it('displays collection items when loaded', async () => {
      const mockCollection = [
        createMockCollectionItem(1, 'The Beatles', 'Abbey Road'),
        createMockCollectionItem(2, 'Pink Floyd', 'Dark Side of the Moon'),
      ];

      mockApi.getEntireCollection.mockResolvedValue({
        success: true,
        data: mockCollection,
        cacheStatus: 'valid',
      });
      mockApi.getCacheProgress.mockResolvedValue({ status: 'completed' });

      renderCollectionPageWithProviders(authStatus);

      await waitFor(() => {
        expect(
          screen.getByText('The Beatles - Abbey Road')
        ).toBeInTheDocument();
        expect(
          screen.getByText('Pink Floyd - Dark Side of the Moon')
        ).toBeInTheDocument();
      });
    });

    it('displays error message when loading fails', async () => {
      mockApi.getEntireCollection.mockRejectedValue(
        new Error('Failed to load')
      );

      renderCollectionPageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Failed to load')).toBeInTheDocument();
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });
    });

    it('allows retry when loading fails', async () => {
      const user = userEvent.setup();

      mockApi.getEntireCollection.mockRejectedValueOnce(
        new Error('Failed to load')
      );
      mockApi.getEntireCollection.mockResolvedValue({
        success: true,
        data: [createMockCollectionItem(1, 'Artist', 'Album')],
        cacheStatus: 'valid',
      });
      mockApi.getCacheProgress.mockResolvedValue({ status: 'completed' });

      renderCollectionPageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });

      const retryButton = screen.getByText('Retry');
      await user.click(retryButton);

      await waitFor(() => {
        expect(screen.getByText('Artist - Album')).toBeInTheDocument();
      });

      expect(mockApi.getEntireCollection).toHaveBeenCalledTimes(2);
    });
  });

  describe('Search Functionality', () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: true, username: 'test_user' },
      lastfm: { authenticated: false, username: undefined },
    };

    beforeEach(async () => {
      const mockCollection = [
        createMockCollectionItem(1, 'The Beatles', 'Abbey Road'),
        createMockCollectionItem(2, 'Pink Floyd', 'Dark Side of the Moon'),
      ];

      mockApi.getEntireCollection.mockResolvedValue({
        success: true,
        data: mockCollection,
        cacheStatus: 'valid',
      });
      mockApi.getCacheProgress.mockResolvedValue({ status: 'completed' });
    });

    it('allows searching the collection', async () => {
      const user = userEvent.setup();

      const searchResults = [
        createMockCollectionItem(1, 'The Beatles', 'Abbey Road'),
      ];
      mockApi.searchCollectionPaginated.mockResolvedValue({
        items: searchResults,
        totalPages: 1,
        total: 1,
      });

      renderCollectionPageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByTestId('search-input')).toBeInTheDocument();
      });

      const searchInput = screen.getByTestId('search-input');
      const searchButton = screen.getByText('Search');

      await user.type(searchInput, 'Beatles');
      await user.click(searchButton);

      await waitFor(() => {
        expect(mockApi.searchCollectionPaginated).toHaveBeenCalledWith(
          'test_user',
          'Beatles',
          1,
          50
        );
      });
    });

    it('clears search when query is empty', async () => {
      const user = userEvent.setup();

      renderCollectionPageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByTestId('search-input')).toBeInTheDocument();
      });

      // First search for something
      const searchInput = screen.getByTestId('search-input');
      const searchButton = screen.getByText('Search');

      await user.type(searchInput, 'Beatles');
      await user.click(searchButton);

      // Then clear the search
      await user.clear(searchInput);
      await user.click(searchButton);

      await waitFor(() => {
        expect(screen.getByText('2 total items')).toBeInTheDocument();
      });
    });
  });

  describe('Sorting', () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: true, username: 'test_user' },
      lastfm: { authenticated: false, username: undefined },
    };

    beforeEach(async () => {
      const mockCollection = [
        createMockCollectionItem(1, 'B Artist', 'Z Album'),
        createMockCollectionItem(2, 'A Artist', 'Y Album'),
      ];

      mockApi.getEntireCollection.mockResolvedValue({
        success: true,
        data: mockCollection,
        cacheStatus: 'valid',
      });
      mockApi.getCacheProgress.mockResolvedValue({ status: 'completed' });
    });

    it('allows changing sort criteria', async () => {
      const user = userEvent.setup();

      renderCollectionPageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Sort by:')).toBeInTheDocument();
      });

      const sortSelect = screen.getByDisplayValue('Artist');
      await user.selectOptions(sortSelect, 'title');

      expect(sortSelect).toHaveValue('title');
    });

    it('allows toggling sort order', async () => {
      const user = userEvent.setup();

      renderCollectionPageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByTitle('Sort ascending')).toBeInTheDocument();
      });

      const sortOrderButton = screen.getByTitle('Sort ascending');
      await user.click(sortOrderButton);

      expect(screen.getByTitle('Sort descending')).toBeInTheDocument();
    });
  });

  describe('Selection', () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: true, username: 'test_user' },
      lastfm: { authenticated: false, username: undefined },
    };

    beforeEach(async () => {
      // Clear localStorage mock
      mockLocalStorage.setItem.mockClear();
      mockLocalStorage.getItem.mockClear();

      const mockCollection = [
        createMockCollectionItem(1, 'Artist 1', 'Album 1'),
        createMockCollectionItem(2, 'Artist 2', 'Album 2'),
      ];

      mockApi.getEntireCollection.mockResolvedValue({
        success: true,
        data: mockCollection,
        cacheStatus: 'valid',
      });
      mockApi.getCacheProgress.mockResolvedValue({ status: 'completed' });
    });

    it('allows selecting individual albums', async () => {
      const user = userEvent.setup();

      renderCollectionPageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByTestId('album-card-1')).toBeInTheDocument();
      });

      const selectButton = screen.getAllByText('Select')[0];
      await user.click(selectButton);

      expect(screen.getByText('1 selected')).toBeInTheDocument();
      expect(screen.getByText('Deselect')).toBeInTheDocument();
    });

    it('allows selecting all albums', async () => {
      const user = userEvent.setup();

      renderCollectionPageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Select All')).toBeInTheDocument();
      });

      const selectAllButton = screen.getByText('Select All');
      await user.click(selectAllButton);

      expect(screen.getByText('2 selected')).toBeInTheDocument();
      expect(screen.getByText('Deselect All')).toBeInTheDocument();
    });

    it('shows scrobble button when albums are selected', async () => {
      const user = userEvent.setup();

      renderCollectionPageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByTestId('album-card-1')).toBeInTheDocument();
      });

      const selectButton = screen.getAllByText('Select')[0];
      await user.click(selectButton);

      expect(screen.getByText('Scrobble Selected (1)')).toBeInTheDocument();
    });

    it('navigates to scrobble page when scrobble button is clicked', async () => {
      const user = userEvent.setup();

      renderCollectionPageWithProviders(authStatus);

      // Wait for collection to load completely
      await waitFor(() => {
        expect(screen.getByTestId('album-card-1')).toBeInTheDocument();
        expect(screen.getByTestId('album-card-2')).toBeInTheDocument();
        expect(screen.getByText('2 total items')).toBeInTheDocument();
      });

      const selectButton = screen.getAllByText('Select')[0];
      await user.click(selectButton);

      // Wait for the scrobble button to appear after selection
      await waitFor(() => {
        expect(screen.getByText('Scrobble Selected (1)')).toBeInTheDocument();
      });

      const scrobbleButton = screen.getByText('Scrobble Selected (1)');
      await user.click(scrobbleButton);

      // Wait for localStorage.setItem to be called
      await waitFor(
        () => {
          expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
            'selectedAlbums',
            expect.stringContaining('Artist 1')
          );
        },
        { timeout: 10000 }
      );
    }, 15000);
  });

  describe('Cache Management', () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: true, username: 'test_user' },
      lastfm: { authenticated: false, username: undefined },
    };

    beforeEach(async () => {
      mockApi.getEntireCollection.mockResolvedValue({
        success: true,
        data: [createMockCollectionItem(1, 'Artist', 'Album')],
        cacheStatus: 'valid',
      });
      mockApi.getCacheProgress.mockResolvedValue({ status: 'completed' });
    });

    it('shows cache management buttons', async () => {
      renderCollectionPageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Check for New Items')).toBeInTheDocument();
        expect(screen.getByText('Force Reload')).toBeInTheDocument();
        expect(screen.getByText('Clear Cache')).toBeInTheDocument();
      });
    });

    it('allows checking for new items', async () => {
      const user = userEvent.setup();

      mockApi.checkForNewItems.mockResolvedValue({
        success: true,
        data: { newItemsCount: 5, latestCacheDate: '2023-01-01' },
      });

      renderCollectionPageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Check for New Items')).toBeInTheDocument();
      });

      const checkButton = screen.getByText('Check for New Items');
      await user.click(checkButton);

      await waitFor(() => {
        expect(mockApi.checkForNewItems).toHaveBeenCalledWith('test_user');
      });
    });

    it('shows update button when new items are found', async () => {
      const user = userEvent.setup();

      mockApi.checkForNewItems.mockResolvedValue({
        success: true,
        data: { newItemsCount: 5, latestCacheDate: '2023-01-01' },
      });

      renderCollectionPageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Check for New Items')).toBeInTheDocument();
      });

      const checkButton = screen.getByText('Check for New Items');
      await user.click(checkButton);

      await waitFor(() => {
        expect(
          screen.getByText('Update with New Items (5)')
        ).toBeInTheDocument();
      });
    });

    it('allows force reloading cache', async () => {
      const user = userEvent.setup();

      mockApi.getEntireCollection.mockResolvedValue({
        success: true,
        data: [createMockCollectionItem(1, 'Artist', 'Album')],
        cacheStatus: 'valid',
      });

      renderCollectionPageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Force Reload')).toBeInTheDocument();
      });

      const forceReloadButton = screen.getByText('Force Reload');
      await user.click(forceReloadButton);

      await waitFor(() => {
        expect(mockApi.getEntireCollection).toHaveBeenCalledWith(
          'test_user',
          true
        );
      });
    });

    it('allows clearing cache', async () => {
      const user = userEvent.setup();

      renderCollectionPageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Clear Cache')).toBeInTheDocument();
      });

      const clearCacheButton = screen.getByText('Clear Cache');
      await user.click(clearCacheButton);

      await waitFor(() => {
        expect(mockApi.clearCollectionCache).toHaveBeenCalled();
      });
    });
  });

  describe('Pagination', () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: true, username: 'test_user' },
      lastfm: { authenticated: false, username: undefined },
    };

    beforeEach(async () => {
      // Create a collection with enough items to require pagination (>50 items)
      const mockCollection = Array.from({ length: 75 }, (_, i) =>
        createMockCollectionItem(i + 1, `Artist ${i + 1}`, `Album ${i + 1}`)
      );

      mockApi.getEntireCollection.mockResolvedValue({
        success: true,
        data: mockCollection,
        cacheStatus: 'valid',
      });
      mockApi.getCacheProgress.mockResolvedValue({ status: 'completed' });
    });

    it('shows pagination controls for large collections', async () => {
      renderCollectionPageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
        expect(screen.getByText('Previous')).toBeInTheDocument();
        expect(screen.getByText('Next')).toBeInTheDocument();
      });
    });

    it('allows navigating to next page', async () => {
      const user = userEvent.setup();

      renderCollectionPageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Next')).toBeInTheDocument();
      });

      const nextButton = screen.getByText('Next');
      await user.click(nextButton);

      expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    });
  });

  describe('View Details', () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: true, username: 'test_user' },
      lastfm: { authenticated: false, username: undefined },
    };

    beforeEach(async () => {
      // Clear localStorage mock
      mockLocalStorage.setItem.mockClear();
      mockLocalStorage.getItem.mockClear();

      const mockCollection = [createMockCollectionItem(1, 'Artist', 'Album')];

      mockApi.getEntireCollection.mockResolvedValue({
        success: true,
        data: mockCollection,
        cacheStatus: 'valid',
      });
      mockApi.getCacheProgress.mockResolvedValue({ status: 'completed' });
    });

    it('allows viewing album details', async () => {
      const user = userEvent.setup();

      renderCollectionPageWithProviders(authStatus);

      // Wait for collection to load completely
      await waitFor(() => {
        expect(screen.getByText('View Details')).toBeInTheDocument();
        expect(screen.getByText('1 total items')).toBeInTheDocument();
      });

      const viewDetailsButton = screen.getByText('View Details');
      await user.click(viewDetailsButton);

      // Wait for localStorage.setItem to be called
      await waitFor(
        () => {
          expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
            'selectedRelease',
            expect.stringContaining('Artist')
          );
        },
        { timeout: 10000 }
      );
    });
  });

  describe('Cache Status Indicators', () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: true, username: 'test_user' },
      lastfm: { authenticated: false, username: undefined },
    };

    it('shows cache status when using cached data', async () => {
      mockApi.getEntireCollection.mockResolvedValue({
        success: true,
        data: [createMockCollectionItem(1, 'Artist', 'Album')],
        cacheStatus: 'valid',
      });
      mockApi.getCacheProgress.mockResolvedValue({ status: 'completed' });

      renderCollectionPageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('⚡ Using cached data')).toBeInTheDocument();
      });
    });

    it('shows refreshing status when cache is expired', async () => {
      mockApi.getEntireCollection.mockResolvedValue({
        success: true,
        data: [createMockCollectionItem(1, 'Artist', 'Album')],
        cacheStatus: 'expired',
        refreshing: true,
      });
      mockApi.getCacheProgress.mockResolvedValue({
        status: 'loading',
        currentPage: 1,
        totalPages: 10,
      });

      renderCollectionPageWithProviders(authStatus);

      await waitFor(() => {
        expect(
          screen.getByText(/⏰ Cache expired - Refreshing.../)
        ).toBeInTheDocument();
      });
    });
  });
});
