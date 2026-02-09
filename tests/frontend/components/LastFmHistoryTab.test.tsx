import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import React from 'react';

import LastFmHistoryTab from '../../../src/renderer/components/LastFmHistoryTab';
import * as apiService from '../../../src/renderer/services/api';

// Mock the API service
jest.mock('../../../src/renderer/services/api');
const mockApiService = apiService as jest.Mocked<typeof apiService>;

// Mock SyncStatusBar to simplify tests
jest.mock('../../../src/renderer/components/SyncStatusBar', () => {
  return function MockSyncStatusBar({
    onSyncComplete,
  }: {
    onSyncComplete?: () => void;
  }) {
    return (
      <div data-testid='sync-status-bar'>
        <button onClick={onSyncComplete}>Trigger Sync Complete</button>
      </div>
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

const createMockApiInstance = () => ({
  getAlbumHistoryPaginated: jest.fn(),
  getTrackHistoryPaginated: jest.fn(),
  getArtistHistoryPaginated: jest.fn(),
  getHistorySyncStatus: jest.fn(),
  startHistorySync: jest.fn(),
  pauseHistorySync: jest.fn(),
  resumeHistorySync: jest.fn(),
});

const createMockAlbumHistory = (count: number) => ({
  items: Array.from({ length: count }, (_, i) => ({
    artist: `Artist ${i + 1}`,
    album: `Album ${i + 1}`,
    playCount: 100 - i,
    lastPlayed: Date.now() - i * 86400000, // Days ago
  })),
  total: count,
  totalPages: Math.ceil(count / 50),
  page: 1,
});

const createMockTrackHistory = (count: number) => ({
  items: Array.from({ length: count }, (_, i) => ({
    artist: `Artist ${i + 1}`,
    album: `Album ${i + 1}`,
    track: `Track ${i + 1}`,
    playCount: 100 - i,
    lastPlayed: Math.floor(Date.now() / 1000) - i * 86400, // Days ago in seconds
  })),
  total: count,
  totalPages: Math.ceil(count / 50),
  page: 1,
});

const createMockArtistHistory = (count: number) => ({
  items: Array.from({ length: count }, (_, i) => ({
    artist: `Artist ${i + 1}`,
    playCount: 500 - i * 50,
    albumCount: 10 - i,
    lastPlayed: Math.floor(Date.now() / 1000) - i * 86400,
  })),
  total: count,
  totalPages: Math.ceil(count / 50),
  page: 1,
});

describe('LastFmHistoryTab', () => {
  let mockApi: ReturnType<typeof createMockApiInstance>;
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    mockApi = createMockApiInstance();
    mockApiService.getApiService.mockReturnValue(mockApi as any);
    jest.clearAllMocks();
    jest.useFakeTimers();
    user = userEvent.setup({ delay: null });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Loading States', () => {
    it('shows loading state while fetching albums', async () => {
      mockApi.getAlbumHistoryPaginated.mockImplementation(
        () => new Promise(() => {})
      );

      render(<LastFmHistoryTab />);

      // Fast-forward timers to trigger the debounced search
      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(
          screen.getByText('Loading albums history...')
        ).toBeInTheDocument();
      });
    });

    it('shows empty state when no albums exist', async () => {
      mockApi.getAlbumHistoryPaginated.mockResolvedValue({
        items: [],
        total: 0,
        totalPages: 0,
        page: 1,
      });

      render(<LastFmHistoryTab />);

      // Fast-forward timers
      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(
          screen.getByText('No listening history synced yet.')
        ).toBeInTheDocument();
        expect(
          screen.getByText(
            'Use the sync controls above to import your Last.fm history. This includes plays from all sources (Spotify, Apple Music, etc.)'
          )
        ).toBeInTheDocument();
      });
    });

    it('shows error message when loading fails', async () => {
      mockApi.getAlbumHistoryPaginated.mockRejectedValue(
        new Error('Failed to load')
      );

      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText('Failed to load')).toBeInTheDocument();
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });
    });
  });

  describe('Album Display', () => {
    beforeEach(() => {
      mockApi.getAlbumHistoryPaginated.mockResolvedValue(
        createMockAlbumHistory(3)
      );
    });

    it('displays album list with correct information', async () => {
      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText('Artist 1')).toBeInTheDocument();
        expect(screen.getByText('Album 1')).toBeInTheDocument();
        expect(screen.getByText('100')).toBeInTheDocument(); // Play count
      });
    });

    it('displays column headers', async () => {
      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText('Artist')).toBeInTheDocument();
        expect(screen.getByText('Album')).toBeInTheDocument();
        // Plays has a sort indicator, so use regex
        expect(screen.getByText(/^Plays/)).toBeInTheDocument();
        expect(screen.getByText('Last Played')).toBeInTheDocument();
      });
    });

    it('shows total count', async () => {
      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText(/Showing 3 of 3 albums/)).toBeInTheDocument();
      });
    });

    it('renders SyncStatusBar', async () => {
      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByTestId('sync-status-bar')).toBeInTheDocument();
      });
    });
  });

  describe('Search Functionality', () => {
    beforeEach(() => {
      mockApi.getAlbumHistoryPaginated.mockResolvedValue(
        createMockAlbumHistory(5)
      );
    });

    it('has a search input', async () => {
      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText('Search artists or albums...')
        ).toBeInTheDocument();
      });
    });

    it('debounces search input', async () => {
      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(mockApi.getAlbumHistoryPaginated).toHaveBeenCalledTimes(1);
      });

      const searchInput = screen.getByPlaceholderText(
        'Search artists or albums...'
      );
      await user.clear(searchInput);
      await user.type(searchInput, 'test');

      // Should not call immediately
      expect(mockApi.getAlbumHistoryPaginated).toHaveBeenCalledTimes(1);

      // Fast-forward past debounce
      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(mockApi.getAlbumHistoryPaginated).toHaveBeenCalledTimes(2);
        expect(mockApi.getAlbumHistoryPaginated).toHaveBeenLastCalledWith(
          1,
          50,
          'playCount',
          'desc',
          'test'
        );
      });
    });

    it('shows clear button when search has value', async () => {
      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText('Search artists or albums...')
        ).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(
        'Search artists or albums...'
      );
      await user.clear(searchInput);
      await user.type(searchInput, 'test');

      expect(screen.getByLabelText('Clear search')).toBeInTheDocument();
    });

    it('shows empty state for no search results', async () => {
      mockApi.getAlbumHistoryPaginated.mockResolvedValue({
        items: [],
        total: 0,
        totalPages: 0,
        page: 1,
      });

      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText('Search artists or albums...')
        ).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(
        'Search artists or albums...'
      );
      await user.clear(searchInput);
      await user.type(searchInput, 'nonexistent');

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(
          screen.getByText('No albums found matching "nonexistent"')
        ).toBeInTheDocument();
        expect(screen.getByText('Clear Search')).toBeInTheDocument();
      });
    });
  });

  describe('Sort Functionality', () => {
    beforeEach(() => {
      mockApi.getAlbumHistoryPaginated.mockResolvedValue(
        createMockAlbumHistory(5)
      );
    });

    it('has a sort dropdown', async () => {
      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText('Sort by:')).toBeInTheDocument();
        const sortSelect = screen.getByRole('combobox');
        expect(sortSelect).toBeInTheDocument();
      });
    });

    it('changes sort when dropdown selection changes', async () => {
      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(mockApi.getAlbumHistoryPaginated).toHaveBeenCalledTimes(1);
      });

      const sortSelect = screen.getByRole('combobox');
      await user.selectOptions(sortSelect, 'lastPlayed-desc');

      await waitFor(() => {
        expect(mockApi.getAlbumHistoryPaginated).toHaveBeenCalledWith(
          1,
          50,
          'lastPlayed',
          'desc',
          undefined
        );
      });
    });

    it('toggles sort order when clicking column header', async () => {
      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText('Artist')).toBeInTheDocument();
      });

      // Click Artist header to sort by artist
      await user.click(screen.getByText('Artist'));

      await waitFor(() => {
        expect(mockApi.getAlbumHistoryPaginated).toHaveBeenCalledWith(
          1,
          50,
          'artist',
          'desc',
          undefined
        );
      });
    });
  });

  describe('Pagination', () => {
    it('shows pagination controls when multiple pages exist', async () => {
      mockApi.getAlbumHistoryPaginated.mockResolvedValue({
        items: createMockAlbumHistory(50).items,
        total: 150,
        totalPages: 3,
        page: 1,
      });

      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
        expect(screen.getByText('First')).toBeInTheDocument();
        expect(screen.getByText('Previous')).toBeInTheDocument();
        expect(screen.getByText('Next')).toBeInTheDocument();
        expect(screen.getByText('Last')).toBeInTheDocument();
      });
    });

    it('does not show pagination for single page', async () => {
      mockApi.getAlbumHistoryPaginated.mockResolvedValue(
        createMockAlbumHistory(10)
      );

      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText('Artist 1')).toBeInTheDocument();
      });

      expect(screen.queryByText('Page 1 of 1')).not.toBeInTheDocument();
    });

    it('navigates to next page', async () => {
      mockApi.getAlbumHistoryPaginated.mockResolvedValue({
        items: createMockAlbumHistory(50).items,
        total: 150,
        totalPages: 3,
        page: 1,
      });

      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText('Next')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Next'));

      await waitFor(() => {
        expect(mockApi.getAlbumHistoryPaginated).toHaveBeenCalledWith(
          2,
          50,
          'playCount',
          'desc',
          undefined
        );
      });
    });

    it('disables Previous on first page', async () => {
      mockApi.getAlbumHistoryPaginated.mockResolvedValue({
        items: createMockAlbumHistory(50).items,
        total: 150,
        totalPages: 3,
        page: 1,
      });

      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        const prevButton = screen.getByText('Previous');
        expect(prevButton).toBeDisabled();
        expect(screen.getByText('First')).toBeDisabled();
      });
    });
  });

  describe('Sync Integration', () => {
    it('reloads albums when sync completes', async () => {
      mockApi.getAlbumHistoryPaginated.mockResolvedValue(
        createMockAlbumHistory(5)
      );

      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(mockApi.getAlbumHistoryPaginated).toHaveBeenCalledTimes(1);
      });

      // Trigger sync complete via mock SyncStatusBar
      await user.click(screen.getByText('Trigger Sync Complete'));

      await waitFor(() => {
        expect(mockApi.getAlbumHistoryPaginated).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Date Formatting', () => {
    it('formats last played dates correctly', async () => {
      // lastPlayed is in Unix seconds, not milliseconds
      const nowSeconds = Math.floor(Date.now() / 1000);
      mockApi.getAlbumHistoryPaginated.mockResolvedValue({
        items: [
          {
            artist: 'Artist Today',
            album: 'Album Today',
            playCount: 10,
            lastPlayed: nowSeconds,
          },
          {
            artist: 'Artist Yesterday',
            album: 'Album Yesterday',
            playCount: 5,
            lastPlayed: nowSeconds - 86400, // 1 day ago (in seconds)
          },
        ],
        total: 2,
        totalPages: 1,
        page: 1,
      });

      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText('Today')).toBeInTheDocument();
        expect(screen.getByText('Yesterday')).toBeInTheDocument();
      });
    });
  });

  describe('View Mode Toggle', () => {
    beforeEach(() => {
      mockApi.getAlbumHistoryPaginated.mockResolvedValue(
        createMockAlbumHistory(3)
      );
      mockApi.getTrackHistoryPaginated.mockResolvedValue(
        createMockTrackHistory(3)
      );
    });

    it('shows view toggle buttons', async () => {
      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: 'Albums' })
        ).toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: 'Tracks' })
        ).toBeInTheDocument();
      });
    });

    it('starts in albums view by default', async () => {
      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        const albumsBtn = screen.getByRole('button', { name: 'Albums' });
        expect(albumsBtn).toHaveClass('active');
      });
    });

    it('switches to tracks view when clicking Tracks button', async () => {
      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText('Artist 1')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Tracks' }));

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(mockApi.getTrackHistoryPaginated).toHaveBeenCalled();
        expect(screen.getByText('Track 1')).toBeInTheDocument();
      });
    });

    it('shows track column headers in tracks view', async () => {
      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText('Artist 1')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Tracks' }));

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText('Track')).toBeInTheDocument();
        expect(screen.getByText('Artist')).toBeInTheDocument();
        expect(screen.getByText('Album')).toBeInTheDocument();
      });
    });

    it('shows correct stats text in tracks view', async () => {
      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText(/Showing 3 of 3 albums/)).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Tracks' }));

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText(/Showing 3 of 3 tracks/)).toBeInTheDocument();
      });
    });

    it('updates search placeholder in tracks view', async () => {
      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText('Search artists or albums...')
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Tracks' }));

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText('Search artists, albums, or tracks...')
        ).toBeInTheDocument();
      });
    });
  });

  describe('Artists View', () => {
    beforeEach(() => {
      mockApi.getAlbumHistoryPaginated.mockResolvedValue(
        createMockAlbumHistory(3)
      );
      mockApi.getArtistHistoryPaginated.mockResolvedValue(
        createMockArtistHistory(3)
      );
    });

    it('shows Artists toggle button', async () => {
      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: 'Artists' })
        ).toBeInTheDocument();
      });
    });

    it('switches to artists view when clicking Artists button', async () => {
      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText('Artist 1')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Artists' }));

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(mockApi.getArtistHistoryPaginated).toHaveBeenCalled();
        expect(screen.getByText('500')).toBeInTheDocument(); // Play count
        expect(screen.getByText('10')).toBeInTheDocument(); // Album count
      });
    });

    it('shows artist column headers in artists view', async () => {
      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText('Artist 1')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Artists' }));

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        // "Artist" header button (distinct from "Artists" toggle button)
        const artistHeaders = screen.getAllByText('Artist');
        expect(artistHeaders.length).toBeGreaterThanOrEqual(1);
        // "Albums" appears as both view toggle and column header
        const albumsElements = screen.getAllByText('Albums');
        expect(albumsElements.length).toBe(2); // toggle btn + column header
        expect(screen.getByText(/^Plays/)).toBeInTheDocument();
        expect(screen.getByText('Last Played')).toBeInTheDocument();
      });
    });

    it('shows correct stats text in artists view', async () => {
      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText(/Showing 3 of 3 albums/)).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Artists' }));

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText(/Showing 3 of 3 artists/)).toBeInTheDocument();
      });
    });

    it('updates search placeholder in artists view', async () => {
      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText('Search artists or albums...')
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Artists' }));

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText('Search artists...')
        ).toBeInTheDocument();
      });
    });

    it('sorts by album count when dropdown changed', async () => {
      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText('Artist 1')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Artists' }));

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(mockApi.getArtistHistoryPaginated).toHaveBeenCalled();
      });

      const sortSelect = screen.getByRole('combobox');
      await user.selectOptions(sortSelect, 'albumCount-desc');

      await waitFor(() => {
        expect(mockApi.getArtistHistoryPaginated).toHaveBeenCalledWith(
          1,
          50,
          'albumCount',
          'desc',
          undefined
        );
      });
    });

    it('toggles sort order when clicking artist column header', async () => {
      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText('Artist 1')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Artists' }));

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText(/^Plays/)).toBeInTheDocument();
      });

      // Click Plays header to toggle sort order (already sorted by playCount desc)
      await user.click(screen.getByText(/^Plays/));

      await waitFor(() => {
        expect(mockApi.getArtistHistoryPaginated).toHaveBeenCalledWith(
          1,
          50,
          'playCount',
          'asc',
          undefined
        );
      });
    });

    it('reloads artists when sync completes in artists view', async () => {
      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText('Artist 1')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Artists' }));

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(mockApi.getArtistHistoryPaginated).toHaveBeenCalledTimes(1);
      });

      await user.click(screen.getByText('Trigger Sync Complete'));

      await waitFor(() => {
        expect(mockApi.getArtistHistoryPaginated).toHaveBeenCalledTimes(2);
      });
    });

    it('shows pagination in artists view', async () => {
      mockApi.getArtistHistoryPaginated.mockResolvedValue({
        items: createMockArtistHistory(50).items,
        total: 150,
        totalPages: 3,
        page: 1,
      });

      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText('Artist 1')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Artists' }));

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
      });
    });
  });

  describe('Deep Linking', () => {
    beforeEach(() => {
      mockApi.getAlbumHistoryPaginated.mockResolvedValue(
        createMockAlbumHistory(3)
      );
      mockApi.getArtistHistoryPaginated.mockResolvedValue(
        createMockArtistHistory(3)
      );
    });

    it('opens in artists view when URL has ?view=artists', async () => {
      window.location.hash = '#history?view=artists';

      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(mockApi.getArtistHistoryPaginated).toHaveBeenCalled();
        const artistsBtn = screen.getByRole('button', { name: 'Artists' });
        expect(artistsBtn).toHaveClass('active');
      });

      // Clean up
      window.location.hash = '';
    });

    it('opens in albums view by default when no URL param', async () => {
      window.location.hash = '#history';

      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(mockApi.getAlbumHistoryPaginated).toHaveBeenCalled();
        const albumsBtn = screen.getByRole('button', { name: 'Albums' });
        expect(albumsBtn).toHaveClass('active');
      });

      // Clean up
      window.location.hash = '';
    });
  });
});
