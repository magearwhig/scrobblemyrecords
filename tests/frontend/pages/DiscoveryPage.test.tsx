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

    // Should show Wanted button (disabled state)
    const wantedButtons = screen.getAllByRole('button', { name: /Wanted/i });
    expect(wantedButtons.length).toBe(1);
  });

  it('shows Wanted badge for albums in local want list', async () => {
    // Mock local want list with Clem Snide album
    mockGetLocalWantList.mockResolvedValue(mockLocalWantList);

    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Clem Snide')).toBeInTheDocument();
    });

    // Should show "Wanted" badge for items in local want list
    const wantedBadge = screen.getByTitle('In your local want list');
    expect(wantedBadge).toBeInTheDocument();
    expect(wantedBadge).toHaveTextContent('Wanted');
    expect(wantedBadge).toHaveClass('discovery-badge-wanted');
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

    const wantButtons = screen.getAllByRole('button', { name: 'Want' });
    fireEvent.click(wantButtons[0]);

    await waitFor(() => {
      // After clicking, button should show "Wanted" and be disabled
      const wantedButton = screen.getAllByRole('button', { name: 'Wanted' })[0];
      expect(wantedButton).toBeInTheDocument();
      expect(wantedButton).toBeDisabled();
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

  it('matches Discogs wishlist with [Explicit] suffix', async () => {
    // Mock missing album with [Explicit] suffix (like Last.fm/Spotify data)
    mockGetMissingAlbums.mockResolvedValue([
      {
        artist: 'Big Boi',
        album: 'Vicious Lies and Dangerous Rumors [Explicit]',
        playCount: 30,
        lastPlayed: 1703894400,
      },
    ]);

    // Mock wishlist without suffix (like Discogs data)
    mockGetWishlist.mockResolvedValue([
      {
        id: 3,
        masterId: 12345,
        releaseId: 67890,
        artist: 'Big Boi',
        title: 'Vicious Lies And Dangerous Rumors',
        year: 2012,
        coverImage: 'https://example.com/cover.jpg',
        dateAdded: '2024-01-01',
        vinylStatus: 'has_vinyl',
        vinylVersions: [],
      },
    ]);

    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Big Boi')).toBeInTheDocument();
    });

    // Should match despite [Explicit] suffix
    expect(screen.getByText('In Wantlist')).toBeInTheDocument();
  });

  it('matches Discogs wishlist with (Deluxe) suffix', async () => {
    // Mock missing album with (Deluxe) suffix
    mockGetMissingAlbums.mockResolvedValue([
      {
        artist: 'Big Boi',
        album: 'Vicious Lies and Dangerous Rumors (Deluxe)',
        playCount: 30,
        lastPlayed: 1703894400,
      },
    ]);

    // Mock wishlist without suffix
    mockGetWishlist.mockResolvedValue([
      {
        id: 3,
        masterId: 12345,
        releaseId: 67890,
        artist: 'Big Boi',
        title: 'Vicious Lies And Dangerous Rumors',
        year: 2012,
        coverImage: 'https://example.com/cover.jpg',
        dateAdded: '2024-01-01',
        vinylStatus: 'has_vinyl',
        vinylVersions: [],
      },
    ]);

    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Big Boi')).toBeInTheDocument();
    });

    // Should match despite (Deluxe) suffix
    expect(screen.getByText('In Wantlist')).toBeInTheDocument();
  });

  it('matches Discogs wishlist when Last.fm includes album in artist name', async () => {
    // Mock missing album where Last.fm has album title merged into artist name
    // This happens with some albums like "Andrew Bird & The Mysterious Production Of Eggs"
    mockGetMissingAlbums.mockResolvedValue([
      {
        artist: 'Andrew Bird & The Mysterious Production Of Eggs',
        album: 'Andrew Bird & The Mysterious Production Of Eggs',
        playCount: 25,
        lastPlayed: 1703894400,
      },
    ]);

    // Mock wishlist with correct Discogs format (separate artist/title)
    mockGetWishlist.mockResolvedValue([
      {
        id: 4,
        masterId: 12345,
        releaseId: 67890,
        artist: 'Andrew Bird',
        title: 'The Mysterious Production Of Eggs',
        year: 2005,
        coverImage: 'https://example.com/cover.jpg',
        dateAdded: '2024-01-01',
        vinylStatus: 'has_vinyl',
        vinylVersions: [],
      },
    ]);

    renderDiscoveryPage();

    await waitFor(() => {
      // Text appears twice (title and artist), so use getAllByText
      expect(
        screen.getAllByText('Andrew Bird & The Mysterious Production Of Eggs')
      ).toHaveLength(2);
    });

    // Should match despite Last.fm's quirky formatting
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

  it('shows Hide wanted toggle checkbox', async () => {
    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Hide wanted')).toBeInTheDocument();
  });

  it('hides albums in local want list when Hide wanted is checked', async () => {
    // Setup local want list with Clem Snide album
    mockGetLocalWantList.mockResolvedValue(mockLocalWantList);

    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    // Clem Snide is in local want list (mockLocalWantList)
    expect(screen.getByText('Clem Snide')).toBeInTheDocument();
    expect(screen.getByText('End of Love')).toBeInTheDocument();

    // Check the Hide wanted toggle
    const toggle = screen.getByLabelText('Hide wanted');
    fireEvent.click(toggle);

    // Clem Snide should now be hidden
    expect(screen.queryByText('Clem Snide')).not.toBeInTheDocument();
    expect(screen.queryByText('End of Love')).not.toBeInTheDocument();

    // Other albums should still be visible
    expect(screen.getByText('Radiohead')).toBeInTheDocument();
    expect(screen.getByText('The Beatles')).toBeInTheDocument();
  });

  it('hides albums in Discogs wantlist when Hide wanted is checked', async () => {
    mockGetWishlist.mockResolvedValue([
      {
        id: 1,
        masterId: 12345,
        releaseId: 67890,
        artist: 'Radiohead',
        title: 'OK Computer',
        year: 1997,
        coverImage: 'https://example.com/cover.jpg',
        dateAdded: '2024-01-01',
        vinylStatus: 'has_vinyl',
        vinylVersions: [],
      },
    ]);

    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    // Should show In Wantlist badge
    expect(screen.getByText('In Wantlist')).toBeInTheDocument();

    // Check the Hide wanted toggle
    const toggle = screen.getByLabelText('Hide wanted');
    fireEvent.click(toggle);

    // Radiohead should now be hidden
    expect(screen.queryByText('Radiohead')).not.toBeInTheDocument();
    expect(screen.queryByText('OK Computer')).not.toBeInTheDocument();

    // Other albums should still be visible
    expect(screen.getByText('The Beatles')).toBeInTheDocument();
  });

  it('updates tab count when Hide wanted is checked', async () => {
    // Setup local want list with Clem Snide album
    mockGetLocalWantList.mockResolvedValue(mockLocalWantList);

    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    // Should show "3" albums initially
    expect(screen.getByText(/Missing Albums.*3.*/)).toBeInTheDocument();

    // Check the Hide wanted toggle
    const toggle = screen.getByLabelText('Hide wanted');
    fireEvent.click(toggle);

    // Should show "2/3" format (2 visible out of 3 total)
    expect(screen.getByText(/Missing Albums.*2\/3.*/)).toBeInTheDocument();
  });

  it('shows special empty state when all albums are hidden by filter', async () => {
    // Only one album and it's in local want list
    mockGetMissingAlbums.mockResolvedValue([
      {
        artist: 'Clem Snide',
        album: 'End of Love',
        playCount: 50,
        lastPlayed: 1703894400,
      },
    ]);
    // Setup local want list with that same album
    mockGetLocalWantList.mockResolvedValue(mockLocalWantList);

    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Clem Snide')).toBeInTheDocument();
    });

    // Check the Hide wanted toggle
    const toggle = screen.getByLabelText('Hide wanted');
    fireEvent.click(toggle);

    // Should show special message about all albums being in wantlist
    expect(
      screen.getByText(/All albums are in your wantlist/)
    ).toBeInTheDocument();
  });
});
