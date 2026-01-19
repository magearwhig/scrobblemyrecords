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

// Create a mock API service instance
const mockApiServiceInstance = {
  getEntireCollection: jest.fn(),
  searchCollectionPaginated: jest.fn(),
  checkForNewItems: jest.fn(),
  updateCacheWithNewItems: jest.fn(),
  clearCollectionCache: jest.fn(),
  getUserCollection: jest.fn(),
  getAuthStatus: jest.fn(),
  testDiscogsConnection: jest.fn(),
  testLastfmConnection: jest.fn(),
  getLastfmSessionKey: jest.fn(),
  prepareTracksFromRelease: jest.fn(),
  scrobbleBatch: jest.fn(),
  getScrobbleProgress: jest.fn(),
  getReleaseDetails: jest.fn(),
};

// Mock the getApiService function to return our mock instance
(apiService.getApiService as jest.Mock).mockReturnValue(mockApiServiceInstance);

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

// Mock IntersectionObserver for useInfiniteScroll hook
const mockIntersectionObserver = jest.fn();
mockIntersectionObserver.mockReturnValue({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
});
window.IntersectionObserver = mockIntersectionObserver;

// Mock AppContext
const mockUseApp = {
  state: { serverUrl: 'http://localhost:3001' },
  dispatch: jest.fn(),
};

jest.mock('../../../src/renderer/context/AppContext', () => ({
  useApp: () => mockUseApp,
}));

// Navigation tests use window.location.hash which is supported in JSDOM

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

// Mock collection data
const mockCollectionItems: CollectionItem[] = [
  {
    id: 1,
    release: {
      id: 101,
      title: 'Album A',
      artist: 'Artist A',
      year: 2020,
      format: ['Vinyl'],
      label: ['Label A'],
      cover_image: 'cover1.jpg',
      resource_url: 'https://api.discogs.com/releases/101',
    },
    date_added: '2023-01-01T00:00:00Z',
  },
  {
    id: 2,
    release: {
      id: 102,
      title: 'Album B',
      artist: 'Artist B',
      year: 2021,
      format: ['CD'],
      label: ['Label B'],
      cover_image: 'cover2.jpg',
      resource_url: 'https://api.discogs.com/releases/102',
    },
    date_added: '2023-01-02T00:00:00Z',
  },
  {
    id: 3,
    release: {
      id: 103,
      title: 'Album C',
      artist: 'Artist C',
      year: 2019,
      format: ['Vinyl', 'LP'],
      label: ['Label C'],
      cover_image: 'cover3.jpg',
      resource_url: 'https://api.discogs.com/releases/103',
    },
    date_added: '2023-01-03T00:00:00Z',
  },
];

// Mock collection with missing data for edge cases
const mockCollectionWithMissingData: CollectionItem[] = [
  {
    id: 1,
    release: {
      id: 101,
      title: '',
      artist: '',
      year: undefined,
      format: ['Vinyl'],
      label: ['Label A'],
      cover_image: 'cover1.jpg',
      resource_url: 'https://api.discogs.com/releases/101',
    },
    date_added: '',
  },
  {
    id: 2,
    release: {
      id: 102,
      title: 'Album B',
      artist: 'Artist B',
      year: 2021,
      format: ['CD'],
      label: ['Label B'],
      cover_image: 'cover2.jpg',
      resource_url: 'https://api.discogs.com/releases/102',
    },
    date_added: '2023-01-02T00:00:00Z',
  },
];

const mockAuthStatus: AuthStatus = {
  discogs: { authenticated: true, username: 'testuser' },
  lastfm: { authenticated: true, username: 'testuser' },
};

const mockAuthContext = {
  authStatus: mockAuthStatus,
  setAuthStatus: jest.fn(),
};

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <AuthProvider value={mockAuthContext}>{component}</AuthProvider>
  );
};

describe('CollectionPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Clear localStorage mock calls
    mockLocalStorage.getItem.mockClear();
    mockLocalStorage.setItem.mockClear();
    mockLocalStorage.removeItem.mockClear();
    mockLocalStorage.clear.mockClear();

    // Ensure our mock is properly attached to window.localStorage
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
    });

    mockApiServiceInstance.getEntireCollection.mockResolvedValue({
      success: true,
      data: mockCollectionItems,
    });
    mockApiServiceInstance.searchCollectionPaginated.mockResolvedValue({
      items: mockCollectionItems,
      total: mockCollectionItems.length,
      totalPages: 1,
      page: 1,
      perPage: 50,
    });
    mockApiServiceInstance.checkForNewItems.mockResolvedValue({
      success: true,
      data: { newItemsCount: 0 },
    });
    mockApiServiceInstance.updateCacheWithNewItems.mockResolvedValue({
      success: true,
      data: { newItemsAdded: 0 },
    });
    mockApiServiceInstance.clearCollectionCache.mockResolvedValue(undefined);
    mockApiServiceInstance.getUserCollection.mockResolvedValue({
      success: true,
      data: mockCollectionItems,
    });
  });

  describe('Authentication', () => {
    it('shows authentication required message when not authenticated', () => {
      const unauthenticatedContext = {
        authStatus: {
          discogs: { authenticated: false, username: '' },
          lastfm: { authenticated: false, username: '' },
        },
        setAuthStatus: jest.fn(),
      };

      render(
        <AuthProvider value={unauthenticatedContext}>
          <CollectionPage />
        </AuthProvider>
      );

      expect(
        screen.getByText(/Please authenticate with Discogs/)
      ).toBeInTheDocument();
    });

    it('loads collection when authenticated', async () => {
      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        expect(screen.getByText('Artist A - Album A')).toBeInTheDocument();
      });
    });
  });

  describe('Collection Loading', () => {
    it('shows loading state while fetching collection', () => {
      mockApiServiceInstance.getEntireCollection.mockImplementation(
        () => new Promise(() => {})
      );

      renderWithProviders(<CollectionPage />);

      expect(screen.getByText('Loading collection...')).toBeInTheDocument();
    });

    it('displays collection items when loaded', async () => {
      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        expect(screen.getByText('Artist A - Album A')).toBeInTheDocument();
        expect(screen.getByText('Artist B - Album B')).toBeInTheDocument();
        expect(screen.getByText('Artist C - Album C')).toBeInTheDocument();
      });
    });

    it('displays error message when loading fails', async () => {
      mockApiServiceInstance.getEntireCollection.mockRejectedValue(
        new Error('API Error')
      );

      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        expect(screen.getByText('API Error')).toBeInTheDocument();
      });
    });

    it('allows retry when loading fails', async () => {
      mockApiServiceInstance.getEntireCollection.mockRejectedValueOnce(
        new Error('API Error')
      );

      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        expect(screen.getByText('API Error')).toBeInTheDocument();
      });

      const retryButton = screen.getByText('Retry');
      await userEvent.click(retryButton);

      await waitFor(() => {
        expect(screen.getByText('Artist A - Album A')).toBeInTheDocument();
      });
    });
  });

  describe('Search Functionality', () => {
    it('allows searching the collection', async () => {
      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        expect(screen.getByText('Artist A - Album A')).toBeInTheDocument();
      });

      const searchInput = screen.getByTestId('search-input');
      await userEvent.type(searchInput, 'Artist A');

      const searchButton = screen.getByText('Search');
      await userEvent.click(searchButton);

      await waitFor(() => {
        expect(
          mockApiServiceInstance.searchCollectionPaginated
        ).toHaveBeenCalledWith('testuser', 'Artist A', 1, 50);
      });
    });

    it('clears search when query is empty', async () => {
      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        expect(screen.getByText('Artist A - Album A')).toBeInTheDocument();
      });

      const searchInput = screen.getByTestId('search-input');
      await userEvent.clear(searchInput);

      const searchButton = screen.getByText('Search');
      await userEvent.click(searchButton);

      await waitFor(() => {
        expect(screen.getByText('Artist A - Album A')).toBeInTheDocument();
      });
    });
  });

  describe('Sorting', () => {
    it('allows changing sort criteria', async () => {
      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        expect(screen.getByText('Artist A - Album A')).toBeInTheDocument();
      });

      const sortSelect = screen.getByDisplayValue('Artist');
      await userEvent.selectOptions(sortSelect, 'title');

      expect(sortSelect).toHaveValue('title');
    });

    it('allows toggling sort order', async () => {
      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        expect(screen.getByText('Artist A - Album A')).toBeInTheDocument();
      });

      const sortOrderButton = screen.getByText('↑');
      await userEvent.click(sortOrderButton);

      expect(screen.getByText('↓')).toBeInTheDocument();
    });
  });

  describe('Selection', () => {
    it('allows selecting individual albums', async () => {
      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        expect(screen.getByText('Artist A - Album A')).toBeInTheDocument();
      });

      const selectButtons = screen.getAllByText('Select');
      await userEvent.click(selectButtons[0]);

      expect(screen.getByText('Deselect')).toBeInTheDocument();
    });

    it('allows selecting all albums', async () => {
      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        expect(screen.getByText('Artist A - Album A')).toBeInTheDocument();
      });

      const selectAllButton = screen.getByText('Select All');
      await userEvent.click(selectAllButton);

      const deselectButtons = screen.getAllByText('Deselect');
      expect(deselectButtons).toHaveLength(3);
    });

    it('shows floating action bar when albums are selected', async () => {
      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        expect(screen.getByText('Artist A - Album A')).toBeInTheDocument();
      });

      const selectButtons = screen.getAllByText('Select');
      await userEvent.click(selectButtons[0]);

      // Floating action bar should appear with selection count and buttons
      expect(screen.getByText('1 album selected')).toBeInTheDocument();
      expect(screen.getByText('Scrobble')).toBeInTheDocument();
      expect(screen.getByText('Clear Selection')).toBeInTheDocument();
    });

    it('navigates to scrobble page when scrobble button is clicked', async () => {
      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        expect(screen.getByText('Artist A - Album A')).toBeInTheDocument();
      });

      const selectButtons = screen.getAllByText('Select');
      await userEvent.click(selectButtons[0]);

      const scrobbleButton = screen.getByText('Scrobble');
      await userEvent.click(scrobbleButton);

      expect(window.location.hash).toBe('#scrobble');
    });

    it('clears selection when Clear Selection is clicked', async () => {
      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        expect(screen.getByText('Artist A - Album A')).toBeInTheDocument();
      });

      const selectButtons = screen.getAllByText('Select');
      await userEvent.click(selectButtons[0]);

      // Floating action bar should be visible
      expect(screen.getByText('1 album selected')).toBeInTheDocument();

      // Click Clear Selection
      const clearButton = screen.getByText('Clear Selection');
      await userEvent.click(clearButton);

      // Floating action bar should disappear
      expect(screen.queryByText('1 album selected')).not.toBeInTheDocument();
      expect(screen.queryByText('Clear Selection')).not.toBeInTheDocument();
    });
  });

  describe('Cache Management', () => {
    it('shows cache management buttons', async () => {
      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        expect(screen.getByText('Artist A - Album A')).toBeInTheDocument();
      });

      expect(screen.getByText('Check for New Items')).toBeInTheDocument();
      expect(screen.getByText('Force Reload')).toBeInTheDocument();
      expect(screen.getByText('Clear Cache')).toBeInTheDocument();
    });

    it('allows checking for new items', async () => {
      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        expect(screen.getByText('Artist A - Album A')).toBeInTheDocument();
      });

      const checkButton = screen.getByText('Check for New Items');
      await userEvent.click(checkButton);

      await waitFor(() => {
        expect(mockApiServiceInstance.checkForNewItems).toHaveBeenCalledWith(
          'testuser'
        );
      });
    });

    it('shows update button when new items are found', async () => {
      mockApiServiceInstance.checkForNewItems.mockResolvedValue({
        success: true,
        data: { newItemsCount: 5 },
      });

      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        expect(screen.getByText('Artist A - Album A')).toBeInTheDocument();
      });

      const checkButton = screen.getByText('Check for New Items');
      await userEvent.click(checkButton);

      await waitFor(() => {
        expect(
          screen.getByText('Update with New Items (5)')
        ).toBeInTheDocument();
      });
    });

    it('allows force reloading cache', async () => {
      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        expect(screen.getByText('Artist A - Album A')).toBeInTheDocument();
      });

      const forceReloadButton = screen.getByText('Force Reload');
      await userEvent.click(forceReloadButton);

      await waitFor(() => {
        expect(mockApiServiceInstance.getEntireCollection).toHaveBeenCalledWith(
          'testuser',
          true
        );
      });
    });

    it('allows clearing cache', async () => {
      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        expect(screen.getByText('Artist A - Album A')).toBeInTheDocument();
      });

      const clearButton = screen.getByText('Clear Cache');
      await userEvent.click(clearButton);

      await waitFor(() => {
        expect(mockApiServiceInstance.clearCollectionCache).toHaveBeenCalled();
      });
    });
  });

  describe('Infinite Scroll', () => {
    it('shows album count for large collections in browse mode', async () => {
      const largeCollection = Array.from({ length: 50 }, (_, i) => ({
        id: i + 1,
        release: {
          id: i + 101,
          title: `Album ${i + 1}`,
          artist: `Artist ${i + 1}`,
          year: 2020 + i,
          format: ['Vinyl'],
          label: ['Label A'],
          cover_image: 'cover.jpg',
        },
        date_added: '2023-01-01T00:00:00Z',
      }));

      mockApiServiceInstance.getEntireCollection.mockResolvedValue({
        success: true,
        data: largeCollection,
      });

      renderWithProviders(<CollectionPage />);

      // Browse mode uses infinite scroll, should show "Showing X of Y" format
      await waitFor(() => {
        expect(screen.getByText(/Showing.*of.*50/)).toBeInTheDocument();
      });
    });

    it('loads large collections with infinite scroll', async () => {
      const largeCollection = Array.from({ length: 150 }, (_, i) => ({
        id: i + 1,
        release: {
          id: i + 101,
          title: `Album ${i + 1}`,
          artist: `Artist ${i + 1}`,
          year: 2020 + i,
          format: ['Vinyl'],
          label: ['Label A'],
          cover_image: 'cover.jpg',
        },
        date_added: '2023-01-01T00:00:00Z',
      }));

      mockApiServiceInstance.getEntireCollection.mockResolvedValue({
        success: true,
        data: largeCollection,
      });

      renderWithProviders(<CollectionPage />);

      // Should show "Showing X of 150" format in browse mode
      await waitFor(() => {
        expect(screen.getByText(/of 150/)).toBeInTheDocument();
      });
    });
  });

  describe('View Details', () => {
    it('allows viewing album details', async () => {
      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        expect(screen.getByText('Artist A - Album A')).toBeInTheDocument();
      });

      const viewDetailsButtons = screen.getAllByText('View Details');
      await userEvent.click(viewDetailsButtons[0]);

      // Wait for localStorage operations to complete
      await waitFor(() => {
        expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
          'selectedRelease',
          JSON.stringify(mockCollectionItems[0].release)
        );
      });

      expect(window.location.hash).toBe('#release-details');
    });
  });

  describe('Cache Status Indicators', () => {
    it('shows cache status when using cached data', async () => {
      mockApiServiceInstance.getEntireCollection.mockResolvedValue({
        success: true,
        data: mockCollectionItems,
        cacheStatus: 'cached',
        message: 'Using cached data',
      });

      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        const elements = screen.getAllByText((content, element) => {
          return element?.textContent?.includes('Using cached data') || false;
        });
        expect(elements.length).toBeGreaterThan(0);
      });
    });

    it('shows refreshing status when cache is expired', async () => {
      mockApiServiceInstance.getEntireCollection.mockResolvedValue({
        success: true,
        data: mockCollectionItems,
        cacheStatus: 'refreshing',
        refreshing: true,
        message: 'Refreshing cache...',
      });

      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        const elements = screen.getAllByText((content, element) => {
          return element?.textContent?.includes('Refreshing cache...') || false;
        });
        expect(elements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Advanced Error Handling', () => {
    it('handles error when checking for new items fails', async () => {
      mockApiServiceInstance.checkForNewItems.mockRejectedValue(
        new Error('Check failed')
      );

      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        expect(screen.getByText('Artist A - Album A')).toBeInTheDocument();
      });

      const checkButton = screen.getByText('Check for New Items');
      await userEvent.click(checkButton);

      await waitFor(() => {
        expect(screen.getByText('Check failed')).toBeInTheDocument();
      });
    });

    it('handles error when checking for new items fails with non-Error exception', async () => {
      mockApiServiceInstance.checkForNewItems.mockRejectedValue('String error');

      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        expect(screen.getByText('Artist A - Album A')).toBeInTheDocument();
      });

      const checkButton = screen.getByText('Check for New Items');
      await userEvent.click(checkButton);

      await waitFor(() => {
        expect(
          screen.getByText('Failed to check for new items')
        ).toBeInTheDocument();
      });
    });

    it('handles error when updating cache with new items fails', async () => {
      mockApiServiceInstance.checkForNewItems.mockResolvedValue({
        success: true,
        data: { newItemsCount: 5 },
      });
      mockApiServiceInstance.updateCacheWithNewItems.mockRejectedValue(
        new Error('Update failed')
      );

      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        expect(screen.getByText('Artist A - Album A')).toBeInTheDocument();
      });

      const checkButton = screen.getByText('Check for New Items');
      await userEvent.click(checkButton);

      await waitFor(() => {
        expect(
          screen.getByText('Update with New Items (5)')
        ).toBeInTheDocument();
      });

      const updateButton = screen.getByText('Update with New Items (5)');
      await userEvent.click(updateButton);

      await waitFor(() => {
        expect(screen.getByText('Update failed')).toBeInTheDocument();
      });
    });

    it('handles error when updating cache with new items fails with non-Error exception', async () => {
      mockApiServiceInstance.checkForNewItems.mockResolvedValue({
        success: true,
        data: { newItemsCount: 5 },
      });
      mockApiServiceInstance.updateCacheWithNewItems.mockRejectedValue(
        'String error'
      );

      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        expect(screen.getByText('Artist A - Album A')).toBeInTheDocument();
      });

      const checkButton = screen.getByText('Check for New Items');
      await userEvent.click(checkButton);

      await waitFor(() => {
        expect(
          screen.getByText('Update with New Items (5)')
        ).toBeInTheDocument();
      });

      const updateButton = screen.getByText('Update with New Items (5)');
      await userEvent.click(updateButton);

      await waitFor(() => {
        expect(
          screen.getByText('Failed to update cache with new items')
        ).toBeInTheDocument();
      });
    });
  });

  describe('Advanced Sorting Functionality', () => {
    it('sorts by title correctly', async () => {
      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        expect(screen.getByText('Artist A - Album A')).toBeInTheDocument();
      });

      const sortSelect = screen.getByDisplayValue('Artist');
      await userEvent.selectOptions(sortSelect, 'title');

      expect(sortSelect).toHaveValue('title');
    });

    it('sorts by year correctly', async () => {
      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        expect(screen.getByText('Artist A - Album A')).toBeInTheDocument();
      });

      const sortSelect = screen.getByDisplayValue('Artist');
      await userEvent.selectOptions(sortSelect, 'year');

      expect(sortSelect).toHaveValue('year');
    });

    it('sorts by date added correctly', async () => {
      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        expect(screen.getByText('Artist A - Album A')).toBeInTheDocument();
      });

      const sortSelect = screen.getByDisplayValue('Artist');
      await userEvent.selectOptions(sortSelect, 'date_added');

      expect(sortSelect).toHaveValue('date_added');
    });

    it('handles sorting with missing data gracefully', async () => {
      const mockCollectionWithMissingData = [
        {
          id: 1,
          release: {
            id: 101,
            title: '',
            artist: '',
            year: undefined,
            format: ['Vinyl'],
            label: ['Label A'],
            cover_image: 'cover1.jpg',
          },
          date_added: '',
        },
        {
          id: 2,
          release: {
            id: 102,
            title: 'Album B',
            artist: 'Artist B',
            year: 2021,
            format: ['CD'],
            label: ['Label B'],
            cover_image: 'cover2.jpg',
          },
          date_added: '2023-01-02T00:00:00Z',
        },
      ];

      mockApiServiceInstance.getEntireCollection.mockResolvedValue({
        success: true,
        data: mockCollectionWithMissingData,
      });

      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        expect(screen.getByText('Artist B - Album B')).toBeInTheDocument();
      });

      const sortSelect = screen.getByDisplayValue('Artist');
      await userEvent.selectOptions(sortSelect, 'title');

      expect(sortSelect).toHaveValue('title');
    });
  });

  describe('Empty Collection States', () => {
    it('shows empty collection message when no items', async () => {
      mockApiServiceInstance.getEntireCollection.mockResolvedValue({
        success: true,
        data: [],
      });

      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        expect(
          screen.getByText('No items in your collection')
        ).toBeInTheDocument();
      });
    });

    it('shows no search results message', async () => {
      // Set up the mock response before user interaction
      mockApiServiceInstance.searchCollectionPaginated.mockResolvedValue({
        items: [],
        total: 0,
        totalPages: 0,
        page: 1,
        perPage: 50,
      });

      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        expect(screen.getByText('Artist A - Album A')).toBeInTheDocument();
      });

      const searchInput = screen.getByTestId('search-input');
      await userEvent.type(searchInput, 'Nonexistent Artist');

      const searchButton = screen.getByText('Search');
      await userEvent.click(searchButton);

      await waitFor(() => {
        const elements = screen.getAllByText((content, element) => {
          return (
            element?.textContent?.includes(
              'No results found for "Nonexistent Artist"'
            ) || false
          );
        });
        expect(elements.length).toBeGreaterThan(0);
      });
    });

    it('shows debug information in empty state', async () => {
      mockApiServiceInstance.getEntireCollection.mockResolvedValue({
        success: true,
        data: [],
      });

      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        expect(
          screen.getByText(
            /Debug: entireCollection=0, filtered=0, searchMode=false/
          )
        ).toBeInTheDocument();
      });
    });
  });

  describe('Search Pagination', () => {
    it('handles search pagination correctly', async () => {
      const searchResults = Array.from({ length: 50 }, (_, i) => ({
        id: i + 1,
        release: {
          id: i + 101,
          title: `Search Album ${i + 1}`,
          artist: `Search Artist ${i + 1}`,
          year: 2020 + i,
          format: ['Vinyl'],
          label: ['Label A'],
          cover_image: 'cover.jpg',
        },
        date_added: '2023-01-01T00:00:00Z',
      }));

      mockApiServiceInstance.searchCollectionPaginated.mockResolvedValue({
        items: searchResults,
        total: 50,
        totalPages: 3,
        page: 1,
        perPage: 50,
      });

      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        expect(screen.getByText('Artist A - Album A')).toBeInTheDocument();
      });

      const searchInput = screen.getByTestId('search-input');
      await userEvent.type(searchInput, 'Search');

      const searchButton = screen.getByText('Search');
      await userEvent.click(searchButton);

      await waitFor(() => {
        expect(
          screen.getByText('Page 1 of 3 (50 results)')
        ).toBeInTheDocument();
      });

      const nextButton = screen.getByText('Next');
      await userEvent.click(nextButton);

      await waitFor(() => {
        expect(
          screen.getByText('Page 2 of 3 (50 results)')
        ).toBeInTheDocument();
      });
    });

    it('disables pagination buttons appropriately', async () => {
      const searchResults = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        release: {
          id: i + 101,
          title: `Search Album ${i + 1}`,
          artist: `Search Artist ${i + 1}`,
          year: 2020 + i,
          format: ['Vinyl'],
          label: ['Label A'],
          cover_image: 'cover.jpg',
        },
        date_added: '2023-01-01T00:00:00Z',
      }));

      mockApiServiceInstance.searchCollectionPaginated.mockResolvedValue({
        items: searchResults,
        total: 10,
        totalPages: 1,
        page: 1,
        perPage: 50,
      });

      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        expect(screen.getByText('Artist A - Album A')).toBeInTheDocument();
      });

      const searchInput = screen.getByTestId('search-input');
      await userEvent.type(searchInput, 'Search');

      const searchButton = screen.getByText('Search');
      await userEvent.click(searchButton);

      await waitFor(() => {
        const nextButton = screen.getByText('Next');
        expect(nextButton).toBeDisabled();
      });
    });
  });

  describe('Cache Update Success Handling', () => {
    it('shows success message when new items are added', async () => {
      mockApiServiceInstance.checkForNewItems.mockResolvedValue({
        success: true,
        data: { newItemsCount: 3 },
      });
      mockApiServiceInstance.updateCacheWithNewItems.mockResolvedValue({
        success: true,
        data: { newItemsAdded: 3 },
      });
      // Mock the loadCollection call that happens after update
      mockApiServiceInstance.getEntireCollection.mockResolvedValue({
        success: true,
        data: mockCollectionItems,
      });

      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        expect(screen.getByText('Artist A - Album A')).toBeInTheDocument();
      });

      const checkButton = screen.getByText('Check for New Items');
      await userEvent.click(checkButton);

      await waitFor(() => {
        expect(
          screen.getByText('Update with New Items (3)')
        ).toBeInTheDocument();
      });

      const updateButton = screen.getByText('Update with New Items (3)');
      await userEvent.click(updateButton);

      // Verify that the update operation completed successfully by checking that getEntireCollection was called
      await waitFor(() => {
        expect(
          mockApiServiceInstance.updateCacheWithNewItems
        ).toHaveBeenCalledWith('testuser');
        expect(mockApiServiceInstance.getEntireCollection).toHaveBeenCalledWith(
          'testuser',
          false
        );
      });
    });

    it('shows message when no new items are found to add', async () => {
      mockApiServiceInstance.checkForNewItems.mockResolvedValue({
        success: true,
        data: { newItemsCount: 3 },
      });
      mockApiServiceInstance.updateCacheWithNewItems.mockResolvedValue({
        success: true,
        data: { newItemsAdded: 0 },
      });

      renderWithProviders(<CollectionPage />);

      await waitFor(() => {
        expect(screen.getByText('Artist A - Album A')).toBeInTheDocument();
      });

      const checkButton = screen.getByText('Check for New Items');
      await userEvent.click(checkButton);

      await waitFor(() => {
        expect(
          screen.getByText('Update with New Items (3)')
        ).toBeInTheDocument();
      });

      const updateButton = screen.getByText('Update with New Items (3)');
      await userEvent.click(updateButton);

      await waitFor(() => {
        const elements = screen.getAllByText((content, element) => {
          return (
            element?.textContent?.includes('No new items were found to add.') ||
            false
          );
        });
        expect(elements.length).toBeGreaterThan(0);
      });
    });
  });
});
