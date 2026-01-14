import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';

import { AppProvider } from '../../../src/renderer/context/AppContext';
import { AuthProvider } from '../../../src/renderer/context/AuthContext';
import DiscoveryPage from '../../../src/renderer/pages/DiscoveryPage';
import {
  MissingAlbum,
  MissingArtist,
  CollectionItem,
  LocalWantItem,
  AuthStatus,
  EnrichedWishlistItem,
} from '../../../src/shared/types';

// Mock the API service
const mockGetMissingAlbums = jest.fn();
const mockGetMissingArtists = jest.fn();
const mockGetLocalWantList = jest.fn();
const mockGetWishlist = jest.fn();
const mockAddToLocalWantList = jest.fn();
const mockSearchCollection = jest.fn();
const mockCreateDiscoveryAlbumMapping = jest.fn();
const mockCreateDiscoveryArtistMapping = jest.fn();
const mockHideAlbum = jest.fn();
const mockHideArtist = jest.fn();

jest.mock('../../../src/renderer/services/api', () => ({
  getApiService: () => ({
    getMissingAlbums: mockGetMissingAlbums,
    getMissingArtists: mockGetMissingArtists,
    getLocalWantList: mockGetLocalWantList,
    getWishlist: mockGetWishlist,
    addToLocalWantList: mockAddToLocalWantList,
    searchCollection: mockSearchCollection,
    createDiscoveryAlbumMapping: mockCreateDiscoveryAlbumMapping,
    createDiscoveryArtistMapping: mockCreateDiscoveryArtistMapping,
    hideAlbum: mockHideAlbum,
    hideArtist: mockHideArtist,
  }),
}));

// Mock SyncStatusBar
jest.mock('../../../src/renderer/components/SyncStatusBar', () => {
  return function MockSyncStatusBar() {
    return <div data-testid='sync-status-bar'>Sync Status Bar</div>;
  };
});

const mockMissingAlbums: MissingAlbum[] = [
  {
    artist: 'Radiohead',
    album: 'OK Computer',
    playCount: 150,
    lastPlayed: 1704067200, // Jan 1, 2024
  },
  {
    artist: 'The Beatles',
    album: 'Abbey Road',
    playCount: 100,
    lastPlayed: 1703980800, // Dec 31, 2023
  },
  {
    artist: 'Clem Snide',
    album: 'End of Love',
    playCount: 50,
    lastPlayed: 1703894400, // Dec 30, 2023
  },
];

const mockMissingArtists: MissingArtist[] = [
  {
    artist: 'Pink Floyd',
    playCount: 500,
    albumCount: 5,
    lastPlayed: 1704067200,
  },
  {
    artist: 'Led Zeppelin',
    playCount: 300,
    albumCount: 3,
    lastPlayed: 1703980800,
  },
];

const mockLocalWantList: LocalWantItem[] = [
  {
    id: 'want-1',
    artist: 'Clem Snide',
    album: 'End of Love',
    playCount: 50,
    lastPlayed: 1703894400,
    addedAt: Date.now() - 86400000,
    source: 'discovery',
    vinylStatus: 'unknown',
    notified: false,
  },
];

const mockCollectionItems: CollectionItem[] = [
  {
    id: 12345,
    folder_id: 0,
    date_added: '2024-01-01',
    release: {
      id: 12345,
      title: 'OK Computer',
      artist: 'Radiohead',
      year: 1997,
      format: ['Vinyl', 'LP'],
      label: ['Parlophone'],
      cover_image: 'https://example.com/cover.jpg',
      resource_url: 'https://api.discogs.com/releases/12345',
    },
  },
];

// Mock Discogs wishlist with one album matching a missing album
const mockDiscogsWishlist: EnrichedWishlistItem[] = [
  {
    id: 1,
    masterId: 12345,
    releaseId: 67890,
    artist: 'Radiohead', // Matches missing album
    title: 'OK Computer', // Matches missing album
    year: 1997,
    coverImage: 'https://example.com/cover.jpg',
    dateAdded: '2024-01-01',
    vinylStatus: 'has_vinyl',
    vinylVersions: [],
    lowestVinylPrice: 25.99,
    priceCurrency: 'USD',
  },
];

const createMockAuthContext = (authStatus: AuthStatus) => ({
  authStatus,
  setAuthStatus: jest.fn(),
});

const defaultAuthStatus: AuthStatus = {
  discogs: { authenticated: true, username: 'testuser' },
  lastfm: { authenticated: true, username: 'testuser' },
};

const renderDiscoveryPage = (authStatus: AuthStatus = defaultAuthStatus) => {
  const authContextValue = createMockAuthContext(authStatus);

  return render(
    <AppProvider>
      <AuthProvider value={authContextValue}>
        <DiscoveryPage />
      </AuthProvider>
    </AppProvider>
  );
};

describe('DiscoveryPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMissingAlbums.mockResolvedValue(mockMissingAlbums);
    mockGetMissingArtists.mockResolvedValue(mockMissingArtists);
    mockGetLocalWantList.mockResolvedValue([]);
    mockGetWishlist.mockResolvedValue([]);
    mockAddToLocalWantList.mockResolvedValue({ id: 'new-want-1' });
    mockSearchCollection.mockResolvedValue(mockCollectionItems);
    mockHideAlbum.mockResolvedValue(true);
    mockHideArtist.mockResolvedValue(true);
  });

  it('renders loading state initially', async () => {
    renderDiscoveryPage();

    expect(
      screen.getByText('Analyzing your listening history...')
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.queryByText('Analyzing your listening history...')
      ).not.toBeInTheDocument();
    });
  });

  it('renders page title and description', async () => {
    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Discovery')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Find albums and artists you listen to frequently/)
    ).toBeInTheDocument();
  });

  it('renders missing albums after loading', async () => {
    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    expect(screen.getByText('OK Computer')).toBeInTheDocument();
    expect(screen.getByText('The Beatles')).toBeInTheDocument();
    expect(screen.getByText('Abbey Road')).toBeInTheDocument();
  });

  it('shows album tab with correct count', async () => {
    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Missing Albums (3)')).toBeInTheDocument();
    });
  });

  it('shows artist tab with correct count', async () => {
    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Missing Artists (2)')).toBeInTheDocument();
    });
  });

  it('switches to artists tab when clicked', async () => {
    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Missing Artists (2)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Missing Artists (2)'));

    await waitFor(() => {
      expect(screen.getByText('Pink Floyd')).toBeInTheDocument();
    });

    expect(screen.getByText('Led Zeppelin')).toBeInTheDocument();
  });

  it('displays play counts for albums', async () => {
    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('150 plays')).toBeInTheDocument();
    });
  });

  it('displays play counts for artists', async () => {
    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Missing Artists (2)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Missing Artists (2)'));

    await waitFor(() => {
      expect(screen.getByText('500 plays')).toBeInTheDocument();
    });
  });

  it('shows Want button for albums not in want list', async () => {
    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    // Find all Want buttons - should have 3 (one for each album)
    const wantButtons = screen.getAllByText('Want');
    expect(wantButtons.length).toBe(3);
  });

  it('shows Wanted button for albums already in want list', async () => {
    // Mock local want list with Clem Snide album
    mockGetLocalWantList.mockResolvedValue(mockLocalWantList);

    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Clem Snide')).toBeInTheDocument();
    });

    // Should have 2 Want buttons and 1 Wanted button
    const wantButtons = screen.getAllByText('Want');
    expect(wantButtons.length).toBe(2);

    expect(screen.getByText('Wanted')).toBeInTheDocument();
  });

  it('adds album to want list when clicking Want button', async () => {
    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    // Find the Want button for the first album (Radiohead)
    const wantButtons = screen.getAllByText('Want');
    fireEvent.click(wantButtons[0]);

    await waitFor(() => {
      expect(mockAddToLocalWantList).toHaveBeenCalledWith({
        artist: 'Radiohead',
        album: 'OK Computer',
        playCount: 150,
        lastPlayed: 1704067200,
      });
    });
  });

  it('disables Want button after clicking and shows Wanted', async () => {
    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    const wantButtons = screen.getAllByText('Want');
    fireEvent.click(wantButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Wanted')).toBeInTheDocument();
    });
  });

  it('has sort options for albums', async () => {
    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    const sortSelect = screen.getByLabelText('Sort by:');
    expect(sortSelect).toBeInTheDocument();
    expect(sortSelect).toHaveValue('plays');
  });

  it('changes sort order for albums', async () => {
    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    const sortSelect = screen.getByLabelText('Sort by:');
    fireEvent.change(sortSelect, { target: { value: 'artist' } });

    expect(sortSelect).toHaveValue('artist');
  });

  it('shows external link buttons for albums', async () => {
    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    // Should have Last.fm and Discogs buttons for each album
    const lastFmButtons = screen.getAllByText('Last.fm');
    const discogsButtons = screen.getAllByText('Discogs');

    expect(lastFmButtons.length).toBe(3);
    expect(discogsButtons.length).toBe(3);
  });

  it('shows Map button for albums', async () => {
    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    const mapButtons = screen.getAllByText('Map');
    expect(mapButtons.length).toBe(3);
  });

  it('shows Hide button for albums', async () => {
    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    const hideButtons = screen.getAllByText('Hide');
    expect(hideButtons.length).toBe(3);
  });

  it('hides album when clicking Hide button', async () => {
    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    const hideButtons = screen.getAllByText('Hide');
    fireEvent.click(hideButtons[0]);

    await waitFor(() => {
      expect(mockHideAlbum).toHaveBeenCalledWith('Radiohead', 'OK Computer');
    });

    // Album should be removed from list
    await waitFor(() => {
      expect(screen.queryByText('OK Computer')).not.toBeInTheDocument();
    });
  });

  it('opens mapping modal when clicking Map button', async () => {
    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    const mapButtons = screen.getAllByText('Map');
    fireEvent.click(mapButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Map Album to Collection')).toBeInTheDocument();
    });
  });

  it('shows empty state when no missing albums', async () => {
    mockGetMissingAlbums.mockResolvedValue([]);

    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText(/No missing albums found/)).toBeInTheDocument();
    });
  });

  it('shows empty state when no missing artists', async () => {
    mockGetMissingArtists.mockResolvedValue([]);

    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Missing Artists (0)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Missing Artists (0)'));

    await waitFor(() => {
      expect(screen.getByText(/No missing artists found/)).toBeInTheDocument();
    });
  });

  it('handles API error gracefully', async () => {
    mockGetMissingAlbums.mockRejectedValue(new Error('Failed to load'));

    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Failed to load')).toBeInTheDocument();
    });
  });

  it('shows Retry button on error', async () => {
    mockGetMissingAlbums.mockRejectedValue(new Error('Failed to load'));

    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });

  it('retries loading when clicking Retry button', async () => {
    mockGetMissingAlbums.mockRejectedValueOnce(new Error('Failed to load'));
    mockGetMissingAlbums.mockResolvedValueOnce(mockMissingAlbums);

    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });
  });

  it('renders SyncStatusBar component', async () => {
    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByTestId('sync-status-bar')).toBeInTheDocument();
    });
  });

  it('shows album count info for artists', async () => {
    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Missing Artists (2)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Missing Artists (2)'));

    await waitFor(() => {
      expect(screen.getByText('5 albums in history')).toBeInTheDocument();
    });
  });

  it('hides artist when clicking Hide button on artist tab', async () => {
    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Missing Artists (2)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Missing Artists (2)'));

    await waitFor(() => {
      expect(screen.getByText('Pink Floyd')).toBeInTheDocument();
    });

    const hideButtons = screen.getAllByText('Hide');
    fireEvent.click(hideButtons[0]);

    await waitFor(() => {
      expect(mockHideArtist).toHaveBeenCalledWith('Pink Floyd');
    });

    // Artist should be removed from list
    await waitFor(() => {
      expect(screen.queryByText('Pink Floyd')).not.toBeInTheDocument();
    });
  });

  it('fetches local want list on page load', async () => {
    renderDiscoveryPage();

    await waitFor(() => {
      expect(mockGetLocalWantList).toHaveBeenCalled();
    });
  });

  it('fetches Discogs wishlist on page load', async () => {
    renderDiscoveryPage();

    await waitFor(() => {
      expect(mockGetWishlist).toHaveBeenCalled();
    });
  });

  it('shows "In Wantlist" badge for albums in Discogs wishlist', async () => {
    // Mock Discogs wishlist with Radiohead - OK Computer
    mockGetWishlist.mockResolvedValue(mockDiscogsWishlist);

    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    // Should show "In Wantlist" badge for OK Computer
    expect(screen.getByText('In Wantlist')).toBeInTheDocument();
  });

  it('does not show "In Wantlist" badge for albums not in Discogs wishlist', async () => {
    // Empty wishlist
    mockGetWishlist.mockResolvedValue([]);

    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    // Should not show any "In Wantlist" badges
    expect(screen.queryByText('In Wantlist')).not.toBeInTheDocument();
  });

  it('matches Discogs wishlist case-insensitively', async () => {
    // Mock wishlist with different case
    mockGetWishlist.mockResolvedValue([
      {
        ...mockDiscogsWishlist[0],
        artist: 'RADIOHEAD', // Uppercase
        title: 'ok computer', // Lowercase
      },
    ]);

    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    // Should still match and show the badge
    expect(screen.getByText('In Wantlist')).toBeInTheDocument();
  });

  it('matches Discogs wishlist with quoted album names', async () => {
    // Mock missing album with quotes in the name (like Last.fm data)
    mockGetMissingAlbums.mockResolvedValue([
      {
        artist: 'How To Dress Well',
        album: '"What Is This Heart?"', // Last.fm style with quotes
        playCount: 50,
        lastPlayed: 1703894400,
      },
    ]);

    // Mock wishlist without quotes (like Discogs data)
    mockGetWishlist.mockResolvedValue([
      {
        id: 2,
        masterId: 700483,
        releaseId: 8283551,
        artist: 'How To Dress Well',
        title: 'What Is This Heart?', // Discogs style without quotes
        year: 2014,
        coverImage: 'https://example.com/cover.jpg',
        dateAdded: '2024-01-01',
        vinylStatus: 'has_vinyl',
        vinylVersions: [],
      },
    ]);

    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('How To Dress Well')).toBeInTheDocument();
    });

    // Should match despite quote differences
    expect(screen.getByText('In Wantlist')).toBeInTheDocument();
  });

  it('handles Discogs wishlist API failure gracefully', async () => {
    // Wishlist API fails but page should still load
    mockGetWishlist.mockRejectedValue(new Error('Wishlist unavailable'));

    renderDiscoveryPage();

    // Page should still load missing albums
    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    // No badges shown (failed to load wishlist)
    expect(screen.queryByText('In Wantlist')).not.toBeInTheDocument();
  });
});
