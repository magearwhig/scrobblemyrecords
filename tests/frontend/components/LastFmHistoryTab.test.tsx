import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import React from 'react';

import LastFmHistoryTab from '../../../src/renderer/components/LastFmHistoryTab';
import * as apiService from '../../../src/renderer/services/api';

// Mock the API service
jest.mock('../../../src/renderer/services/api');
const mockApiService = apiService as jest.Mocked<typeof apiService>;

// Mock AppContext
const mockUseApp = {
  state: { serverUrl: 'http://localhost:3001' },
  dispatch: jest.fn(),
};

jest.mock('../../../src/renderer/context/AppContext', () => ({
  useApp: () => mockUseApp,
}));

// Mock useCollectionLookup hook (used by Phase 6 cross-feature enrichment)
const mockLookupInCollection = jest.fn();
const mockCollectionLookup = {
  collectionMap: new Map(),
  collectionArtistCounts: new Map(),
  collectionArtistCovers: new Map<string, string>(),
  loading: false,
  collection: [],
};
jest.mock('../../../src/renderer/hooks/useCollectionLookup', () => ({
  useCollectionLookup: () => mockCollectionLookup,
  lookupInCollection: (...args: unknown[]) => mockLookupInCollection(...args),
}));

// Cover art for albums not in the collection
const mockBatchGetAlbumCovers = jest.fn();
jest.mock('../../../src/renderer/services/statsApi', () => ({
  imagesApi: {
    batchGetAlbumCovers: (...args: unknown[]) =>
      mockBatchGetAlbumCovers(...args),
  },
}));

const createMockApiInstance = () => ({
  getAlbumHistoryPaginated: jest.fn(),
  getTrackHistoryPaginated: jest.fn(),
  getArtistHistoryPaginated: jest.fn(),
  getHistorySyncStatus: jest.fn(),
  startHistorySync: jest.fn(),
  pauseHistorySync: jest.fn(),
  resumeHistorySync: jest.fn(),
  getUnresolvedHistorySummary: jest
    .fn()
    .mockResolvedValue({ unresolvedCount: 0 }),
});

const createMockAlbumHistory = (count: number) => ({
  items: Array.from({ length: count }, (_, i) => ({
    artist: `Artist ${i + 1}`,
    album: `Album ${i + 1}`,
    playCount: 100 - i,
    lastPlayed: Math.floor(Date.now() / 1000) - i * 86400, // Days ago in seconds
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

beforeEach(() => {
  mockLookupInCollection.mockReturnValue(undefined);
  mockBatchGetAlbumCovers.mockResolvedValue({ success: true, data: {} });
});

describe('LastFmHistoryTab unresolved note', () => {
  it('points to plays without album info from the Albums view', async () => {
    const api = createMockApiInstance();
    api.getAlbumHistoryPaginated.mockResolvedValue(createMockAlbumHistory(1));
    api.getUnresolvedHistorySummary.mockResolvedValue({
      unresolvedCount: 6947,
    });
    mockApiService.getApiService.mockReturnValue(api as any);

    render(<LastFmHistoryTab />);

    expect(
      await screen.findByText(/6,947 plays without album info/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Review them' })
    ).toBeInTheDocument();
  });

  it('shows nothing when every play has album info', async () => {
    const api = createMockApiInstance();
    api.getAlbumHistoryPaginated.mockResolvedValue(createMockAlbumHistory(1));
    mockApiService.getApiService.mockReturnValue(api as any);

    render(<LastFmHistoryTab />);

    await waitFor(() =>
      expect(api.getUnresolvedHistorySummary).toHaveBeenCalled()
    );
    expect(screen.queryByText(/without album info/)).not.toBeInTheDocument();
  });
});

describe('LastFmHistoryTab list rows', () => {
  let api: ReturnType<typeof createMockApiInstance>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLookupInCollection.mockReturnValue(undefined);
    mockBatchGetAlbumCovers.mockResolvedValue({ success: true, data: {} });
    api = createMockApiInstance();
    mockApiService.getApiService.mockReturnValue(api as any);
  });

  const owned = (artist: string, title: string, cover: string) => ({
    id: 7,
    release: { id: 70, artist, title, cover_image: cover },
  });

  it('continues ranks on later pages and hides them while searching', async () => {
    api.getAlbumHistoryPaginated.mockImplementation(
      async (page: number, _per: number, _s: string, _o: string, q?: string) =>
        q
          ? { ...createMockAlbumHistory(2), totalPages: 1 }
          : { ...createMockAlbumHistory(50), total: 120, totalPages: 3, page }
    );
    render(<LastFmHistoryTab />);
    await screen.findByText('1–50 of 120 albums');

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('51–100 of 120 albums');
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent(/^51/);

    await userEvent.type(
      screen.getByPlaceholderText('Search artists or albums...'),
      'x'
    );
    await screen.findByText(/matching "x"/);
    expect(screen.getAllByRole('listitem')[0]).not.toHaveTextContent(/^\d/);
  });

  it('shows names with display casing, preferring the collection spelling', async () => {
    api.getAlbumHistoryPaginated.mockResolvedValue({
      items: [
        {
          artist: 'the go-betweens',
          artistName: 'the go-betweens',
          album: 'liberty belle and the black diamond express',
          playCount: 10,
          lastPlayed: 1,
        },
        {
          artist: 'lcd soundsystem',
          artistName: 'lcd soundsystem',
          album: 'sound of silver',
          playCount: 9,
          lastPlayed: 1,
        },
      ],
      total: 2,
      totalPages: 1,
      page: 1,
    });
    mockLookupInCollection.mockImplementation((_map, artist: string) =>
      artist === 'lcd soundsystem'
        ? owned('LCD Soundsystem', 'Sound Of Silver', 'lcd.jpg')
        : undefined
    );

    render(<LastFmHistoryTab />);

    expect(
      await screen.findByText('Liberty Belle and the Black Diamond Express')
    ).toBeInTheDocument();
    expect(screen.getByText('The Go-Betweens')).toBeInTheDocument();
    expect(screen.getByText('LCD Soundsystem')).toBeInTheDocument();
    expect(screen.getByText('Sound Of Silver')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Sound Of Silver cover' })
    ).toHaveAttribute('src', 'lcd.jpg');
    // Only the album not in the collection is looked up
    await waitFor(() =>
      expect(mockBatchGetAlbumCovers).toHaveBeenCalledWith([
        {
          artist: 'the go-betweens',
          album: 'liberty belle and the black diamond express',
        },
      ])
    );
  });

  it('shows looked-up covers and keeps them when coming back', async () => {
    api.getAlbumHistoryPaginated.mockResolvedValue(createMockAlbumHistory(1));
    api.getArtistHistoryPaginated.mockResolvedValue(createMockArtistHistory(1));
    mockBatchGetAlbumCovers.mockResolvedValue({
      success: true,
      data: { 'artist 1|album 1': 'cover-1.jpg' },
    });

    render(<LastFmHistoryTab />);

    expect(
      await screen.findByRole('img', { name: 'Album 1 cover' })
    ).toHaveAttribute('src', 'cover-1.jpg');

    await userEvent.click(screen.getByRole('button', { name: 'Artists' }));
    await screen.findByText('10 albums');
    await userEvent.click(screen.getByRole('button', { name: 'Albums' }));

    expect(
      await screen.findByRole('img', { name: 'Album 1 cover' })
    ).toBeInTheDocument();
    expect(mockBatchGetAlbumCovers).toHaveBeenCalledTimes(1);
  });

  it('marks tracks without album info and skips their cover lookup', async () => {
    api.getAlbumHistoryPaginated.mockResolvedValue(createMockAlbumHistory(1));
    api.getTrackHistoryPaginated.mockResolvedValue({
      items: [
        {
          artist: 'doug benson',
          artistName: 'doug benson',
          album: 'Unknown album',
          albumUnknown: true,
          track: 'Episode 12',
          playCount: 3,
          lastPlayed: 1,
        },
      ],
      total: 1,
      totalPages: 1,
      page: 1,
    });

    render(<LastFmHistoryTab />);
    await screen.findByText('Album 1');
    mockBatchGetAlbumCovers.mockClear();

    await userEvent.click(screen.getByRole('button', { name: 'Tracks' }));

    expect(await screen.findByText('No album info')).toBeInTheDocument();
    expect(screen.getByText('Doug Benson')).toBeInTheDocument();
    expect(screen.queryByText('Unknown album')).not.toBeInTheDocument();
    expect(mockBatchGetAlbumCovers).not.toHaveBeenCalled();
  });

  it('labels play counts and can sort tracks by album', async () => {
    api.getAlbumHistoryPaginated.mockResolvedValue(createMockAlbumHistory(1));
    api.getTrackHistoryPaginated.mockResolvedValue(createMockTrackHistory(1));

    render(<LastFmHistoryTab />);
    await screen.findByText('Album 1');
    expect(screen.getByTitle('100 plays')).toHaveTextContent('100 plays');

    await userEvent.click(screen.getByRole('button', { name: 'Tracks' }));
    await screen.findByText('Track 1');
    await userEvent.selectOptions(screen.getByRole('combobox'), 'album-asc');

    await waitFor(() =>
      expect(api.getTrackHistoryPaginated).toHaveBeenLastCalledWith(
        1,
        50,
        'album',
        'asc',
        undefined
      )
    );
  });

  it('draws play bars against the top result and shows first played', async () => {
    api.getAlbumHistoryPaginated.mockResolvedValue({
      items: [
        {
          artist: 'a',
          album: 'top',
          playCount: 200,
          firstPlayed: Date.UTC(2005, 1, 14) / 1000,
          lastPlayed: Math.floor(Date.now() / 1000),
        },
        {
          artist: 'a',
          album: 'half',
          playCount: 100,
          lastPlayed: Math.floor(Date.now() / 1000),
        },
      ],
      total: 2,
      totalPages: 1,
      page: 1,
      maxPlayCount: 400,
    });

    render(<LastFmHistoryTab />);
    await screen.findByText('Top');

    const fills = document.querySelectorAll<HTMLElement>(
      '.ranked-row-bar-fill'
    );
    expect(fills[0].style.getPropertyValue('--share')).toBe('50%');
    expect(fills[1].style.getPropertyValue('--share')).toBe('25%');
    expect(screen.getByTitle(/^First played/)).toHaveTextContent(/2005/);
    expect(screen.getByText('First played')).toBeInTheDocument();
  });

  it('uses a collection cover for an artist', async () => {
    api.getAlbumHistoryPaginated.mockResolvedValue(createMockAlbumHistory(1));
    api.getArtistHistoryPaginated.mockResolvedValue(createMockArtistHistory(1));
    mockCollectionLookup.collectionArtistCovers.set('artist 1', 'a1.jpg');

    render(<LastFmHistoryTab />);
    await screen.findByText('Album 1');
    await userEvent.click(screen.getByRole('button', { name: 'Artists' }));

    expect(
      await screen.findByRole('img', { name: 'Artist 1' })
    ).toHaveAttribute('src', 'a1.jpg');
    mockCollectionLookup.collectionArtistCovers.clear();
  });
});

describe('LastFmHistoryTab', () => {
  let mockApi: ReturnType<typeof createMockApiInstance>;
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    mockApi = createMockApiInstance();
    mockApiService.getApiService.mockReturnValue(mockApi as any);
    jest.clearAllMocks();
    mockLookupInCollection.mockReturnValue(undefined);
    mockBatchGetAlbumCovers.mockResolvedValue({ success: true, data: {} });
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

    it('ranks the all-time list and shows when each album was last played', async () => {
      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: 'All-time albums' })
        ).toBeInTheDocument();
      });
      const rows = screen.getAllByRole('listitem');
      expect(rows).toHaveLength(3);
      expect(rows[0]).toHaveTextContent(/^1/);
      expect(rows[2]).toHaveTextContent(/^3/);
      expect(rows[0]).toHaveTextContent('Today');
    });
    it('shows total count', async () => {
      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText('3 albums')).toBeInTheDocument();
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

    it('sorts by artist from the sort menu and drops the ranks', async () => {
      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText('Artist 1')).toBeInTheDocument();
      });

      await user.selectOptions(screen.getByRole('combobox'), 'artist-asc');

      await waitFor(() => {
        expect(mockApi.getAlbumHistoryPaginated).toHaveBeenCalledWith(
          1,
          50,
          'artist',
          'asc',
          undefined
        );
      });
      // Ranks only apply to the most-played order
      expect(screen.getAllByRole('listitem')[0]).not.toHaveTextContent(/^1/);
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

      await user.click(screen.getByRole('button', { name: /Next/ }));

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
        const prevButton = screen.getByRole('button', { name: /Previous/ });
        expect(prevButton).toBeDisabled();
        expect(screen.getByRole('button', { name: /First/ })).toBeDisabled();
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

    it('shows each track with its artist and album', async () => {
      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText('Artist 1')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Tracks' }));

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText('Track 1')).toBeInTheDocument();
      });
      const row = screen.getAllByRole('listitem')[0];
      expect(row).toHaveTextContent('Artist 1');
      expect(row).toHaveTextContent('Album 1');
    });
    it('shows correct stats text in tracks view', async () => {
      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText('3 albums')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Tracks' }));

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText('3 tracks')).toBeInTheDocument();
        expect(
          screen.getByRole('heading', { name: 'All-time tracks' })
        ).toBeInTheDocument();
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
        expect(screen.getByText('10 albums')).toBeInTheDocument();
      });
    });
    it('shows album counts and last played for artists', async () => {
      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText('Artist 1')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Artists' }));

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText('9 albums')).toBeInTheDocument();
      });
      const rows = screen.getAllByRole('listitem');
      expect(rows[1]).toHaveTextContent('Yesterday');
      expect(rows[2]).toHaveTextContent('2 days ago');
    });
    it('shows correct stats text in artists view', async () => {
      render(<LastFmHistoryTab />);

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText('3 albums')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Artists' }));

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText('3 artists')).toBeInTheDocument();
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

    it('sorts artists by least played from the sort menu', async () => {
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

      await user.selectOptions(screen.getByRole('combobox'), 'playCount-asc');

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
