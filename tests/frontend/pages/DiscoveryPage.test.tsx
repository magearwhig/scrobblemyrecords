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
  ForgottenTrack,
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
const mockGetForgottenFavorites = jest.fn();

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
    getForgottenFavorites: mockGetForgottenFavorites,
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

  it('shows Monitor button for albums not being monitored', async () => {
    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    // Find all Monitor buttons - should have 3 (one for each album)
    const monitorButtons = screen.getAllByText('Monitor');
    expect(monitorButtons.length).toBe(3);
  });

  it('shows Monitoring button for albums already being monitored', async () => {
    // Mock local want list with Clem Snide album
    mockGetLocalWantList.mockResolvedValue(mockLocalWantList);

    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Clem Snide')).toBeInTheDocument();
    });

    // Should have 2 Monitor buttons and 1 Monitoring button
    const monitorButtons = screen.getAllByText('Monitor');
    expect(monitorButtons.length).toBe(2);

    // Should show Monitoring button (disabled state)
    const monitoringButtons = screen.getAllByRole('button', {
      name: /Monitoring/i,
    });
    expect(monitoringButtons.length).toBe(1);
  });

  it('shows Monitoring badge for albums being monitored', async () => {
    // Mock local want list with Clem Snide album
    mockGetLocalWantList.mockResolvedValue(mockLocalWantList);

    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Clem Snide')).toBeInTheDocument();
    });

    // Should show "Monitoring" badge for items in local want list
    const monitoringBadge = screen.getByTitle(
      'Monitoring for vinyl availability'
    );
    expect(monitoringBadge).toBeInTheDocument();
    expect(monitoringBadge).toHaveTextContent('Monitoring');
    expect(monitoringBadge).toHaveClass('discovery-badge-monitoring');
  });

  it('adds album to monitoring when clicking Monitor button', async () => {
    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    // Find the Monitor button for the first album (Radiohead)
    const monitorButtons = screen.getAllByText('Monitor');
    fireEvent.click(monitorButtons[0]);

    await waitFor(() => {
      expect(mockAddToLocalWantList).toHaveBeenCalledWith({
        artist: 'Radiohead',
        album: 'OK Computer',
        playCount: 150,
        lastPlayed: 1704067200,
      });
    });
  });

  it('disables Monitor button after clicking and shows Monitoring', async () => {
    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    const monitorButtons = screen.getAllByRole('button', { name: 'Monitor' });
    fireEvent.click(monitorButtons[0]);

    await waitFor(() => {
      // After clicking, button should show "Monitoring" and be disabled
      const monitoringButton = screen.getAllByRole('button', {
        name: 'Monitoring',
      })[0];
      expect(monitoringButton).toBeInTheDocument();
      expect(monitoringButton).toBeDisabled();
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

  it('shows "In Wishlist" badge for albums in Discogs wishlist', async () => {
    // Mock Discogs wishlist with Radiohead - OK Computer
    mockGetWishlist.mockResolvedValue(mockDiscogsWishlist);

    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    // Should show "In Wishlist" badge for OK Computer
    expect(screen.getByText('In Wishlist')).toBeInTheDocument();
  });

  it('does not show "In Wishlist" badge for albums not in Discogs wishlist', async () => {
    // Empty wishlist
    mockGetWishlist.mockResolvedValue([]);

    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    // Should not show any "In Wishlist" badges
    expect(screen.queryByText('In Wishlist')).not.toBeInTheDocument();
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
    expect(screen.getByText('In Wishlist')).toBeInTheDocument();
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
    expect(screen.getByText('In Wishlist')).toBeInTheDocument();
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
    expect(screen.getByText('In Wishlist')).toBeInTheDocument();
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
    expect(screen.getByText('In Wishlist')).toBeInTheDocument();
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
    expect(screen.getByText('In Wishlist')).toBeInTheDocument();
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
    expect(screen.queryByText('In Wishlist')).not.toBeInTheDocument();
  });

  it('shows Hide wishlisted & monitored toggle checkbox', async () => {
    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    expect(
      screen.getByLabelText('Hide wishlisted & monitored')
    ).toBeInTheDocument();
  });

  it('hides albums in local want list when Hide wishlisted & monitored is checked', async () => {
    // Setup local want list with Clem Snide album
    mockGetLocalWantList.mockResolvedValue(mockLocalWantList);

    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    // Clem Snide is in local want list (mockLocalWantList)
    expect(screen.getByText('Clem Snide')).toBeInTheDocument();
    expect(screen.getByText('End of Love')).toBeInTheDocument();

    // Check the Hide wishlisted & monitored toggle
    const toggle = screen.getByLabelText('Hide wishlisted & monitored');
    fireEvent.click(toggle);

    // Clem Snide should now be hidden
    expect(screen.queryByText('Clem Snide')).not.toBeInTheDocument();
    expect(screen.queryByText('End of Love')).not.toBeInTheDocument();

    // Other albums should still be visible
    expect(screen.getByText('Radiohead')).toBeInTheDocument();
    expect(screen.getByText('The Beatles')).toBeInTheDocument();
  });

  it('hides albums in Discogs wishlist when Hide wishlisted & monitored is checked', async () => {
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

    // Should show In Wishlist badge
    expect(screen.getByText('In Wishlist')).toBeInTheDocument();

    // Check the Hide wishlisted & monitored toggle
    const toggle = screen.getByLabelText('Hide wishlisted & monitored');
    fireEvent.click(toggle);

    // Radiohead should now be hidden
    expect(screen.queryByText('Radiohead')).not.toBeInTheDocument();
    expect(screen.queryByText('OK Computer')).not.toBeInTheDocument();

    // Other albums should still be visible
    expect(screen.getByText('The Beatles')).toBeInTheDocument();
  });

  it('updates tab count when Hide wishlisted & monitored is checked', async () => {
    // Setup local want list with Clem Snide album
    mockGetLocalWantList.mockResolvedValue(mockLocalWantList);

    renderDiscoveryPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    // Should show "3" albums initially
    expect(screen.getByText(/Missing Albums.*3.*/)).toBeInTheDocument();

    // Check the Hide wishlisted & monitored toggle
    const toggle = screen.getByLabelText('Hide wishlisted & monitored');
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

    // Check the Hide wishlisted & monitored toggle
    const toggle = screen.getByLabelText('Hide wishlisted & monitored');
    fireEvent.click(toggle);

    // Should show special message about all albums being in wishlist or monitored
    expect(
      screen.getByText(/All albums are in your wishlist or being monitored/)
    ).toBeInTheDocument();
  });
});

// Forgotten Favorites test data
const mockForgottenTracks: ForgottenTrack[] = [
  {
    artist: 'Radiohead',
    album: 'OK Computer',
    track: 'Paranoid Android',
    allTimePlayCount: 50,
    lastPlayed: 1577836800, // Jan 1, 2020
    daysSincePlay: 1847,
    firstPlayed: 1500000000,
  },
  {
    artist: 'Pink Floyd',
    album: 'The Wall',
    track: 'Comfortably Numb',
    allTimePlayCount: 35,
    lastPlayed: 1590969600, // June 1, 2020
    daysSincePlay: 1693,
    firstPlayed: 1500000000,
  },
  {
    artist: 'Unknown Artist',
    album: '', // Single - no album
    track: 'Single Track',
    allTimePlayCount: 20,
    lastPlayed: 1590969600,
    daysSincePlay: 1693,
    firstPlayed: 1500000000,
  },
];

describe('DiscoveryPage - Forgotten Favorites', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMissingAlbums.mockResolvedValue([]);
    mockGetMissingArtists.mockResolvedValue([]);
    mockGetLocalWantList.mockResolvedValue([]);
    mockGetWishlist.mockResolvedValue([]);
    mockGetForgottenFavorites.mockResolvedValue({
      tracks: mockForgottenTracks,
      meta: {
        dormantDays: 90,
        minPlays: 10,
        limit: 100,
        returned: 3,
        totalMatching: 25,
      },
    });
  });

  it('renders Forgotten Favorites tab', async () => {
    render(
      <AppProvider>
        <AuthProvider
          value={createMockAuthContext({
            discogs: { authenticated: true, username: 'testuser' },
            lastfm: { authenticated: true, username: 'testuser' },
          })}
        >
          <DiscoveryPage />
        </AuthProvider>
      </AppProvider>
    );

    await waitFor(() => {
      expect(
        screen.queryByText('Analyzing your listening history...')
      ).not.toBeInTheDocument();
    });

    // Tab should be visible
    expect(screen.getByText(/Forgotten Favorites/)).toBeInTheDocument();
  });

  it('loads forgotten favorites when tab is clicked', async () => {
    render(
      <AppProvider>
        <AuthProvider
          value={createMockAuthContext({
            discogs: { authenticated: true, username: 'testuser' },
            lastfm: { authenticated: true, username: 'testuser' },
          })}
        >
          <DiscoveryPage />
        </AuthProvider>
      </AppProvider>
    );

    await waitFor(() => {
      expect(
        screen.queryByText('Analyzing your listening history...')
      ).not.toBeInTheDocument();
    });

    // Click on Forgotten Favorites tab
    const forgottenTab = screen.getByText(/Forgotten Favorites/);
    fireEvent.click(forgottenTab);

    // Should show loading state then content
    await waitFor(() => {
      expect(mockGetForgottenFavorites).toHaveBeenCalled();
    });

    // Should display tracks
    await waitFor(() => {
      expect(screen.getByText('Paranoid Android')).toBeInTheDocument();
      expect(screen.getByText('Comfortably Numb')).toBeInTheDocument();
    });
  });

  it('displays (Single) for tracks without album', async () => {
    render(
      <AppProvider>
        <AuthProvider
          value={createMockAuthContext({
            discogs: { authenticated: true, username: 'testuser' },
            lastfm: { authenticated: true, username: 'testuser' },
          })}
        >
          <DiscoveryPage />
        </AuthProvider>
      </AppProvider>
    );

    await waitFor(() => {
      expect(
        screen.queryByText('Analyzing your listening history...')
      ).not.toBeInTheDocument();
    });

    // Click on Forgotten Favorites tab
    const forgottenTab = screen.getByText(/Forgotten Favorites/);
    fireEvent.click(forgottenTab);

    await waitFor(() => {
      expect(screen.getByText('Single Track')).toBeInTheDocument();
    });

    // Should show (Single) instead of empty album
    expect(screen.getByText(/\(Single\)/)).toBeInTheDocument();
  });

  it('displays showing X of Y summary', async () => {
    render(
      <AppProvider>
        <AuthProvider
          value={createMockAuthContext({
            discogs: { authenticated: true, username: 'testuser' },
            lastfm: { authenticated: true, username: 'testuser' },
          })}
        >
          <DiscoveryPage />
        </AuthProvider>
      </AppProvider>
    );

    await waitFor(() => {
      expect(
        screen.queryByText('Analyzing your listening history...')
      ).not.toBeInTheDocument();
    });

    // Click on Forgotten Favorites tab
    const forgottenTab = screen.getByText(/Forgotten Favorites/);
    fireEvent.click(forgottenTab);

    await waitFor(() => {
      expect(screen.getByText(/Showing 3 of 25 tracks/)).toBeInTheDocument();
    });
  });

  it('shows empty state when no forgotten favorites found', async () => {
    mockGetForgottenFavorites.mockResolvedValue({
      tracks: [],
      meta: {
        dormantDays: 90,
        minPlays: 10,
        limit: 100,
        returned: 0,
        totalMatching: 0,
      },
    });

    render(
      <AppProvider>
        <AuthProvider
          value={createMockAuthContext({
            discogs: { authenticated: true, username: 'testuser' },
            lastfm: { authenticated: true, username: 'testuser' },
          })}
        >
          <DiscoveryPage />
        </AuthProvider>
      </AppProvider>
    );

    await waitFor(() => {
      expect(
        screen.queryByText('Analyzing your listening history...')
      ).not.toBeInTheDocument();
    });

    // Click on Forgotten Favorites tab
    const forgottenTab = screen.getByText(/Forgotten Favorites/);
    fireEvent.click(forgottenTab);

    await waitFor(() => {
      expect(
        screen.getByText(/No forgotten favorites found/)
      ).toBeInTheDocument();
    });
  });

  it('shows error state on API failure', async () => {
    mockGetForgottenFavorites.mockRejectedValue(new Error('API Error'));

    render(
      <AppProvider>
        <AuthProvider
          value={createMockAuthContext({
            discogs: { authenticated: true, username: 'testuser' },
            lastfm: { authenticated: true, username: 'testuser' },
          })}
        >
          <DiscoveryPage />
        </AuthProvider>
      </AppProvider>
    );

    await waitFor(() => {
      expect(
        screen.queryByText('Analyzing your listening history...')
      ).not.toBeInTheDocument();
    });

    // Click on Forgotten Favorites tab
    const forgottenTab = screen.getByText(/Forgotten Favorites/);
    fireEvent.click(forgottenTab);

    await waitFor(() => {
      expect(screen.getByText(/API Error/)).toBeInTheDocument();
    });

    // Should show retry button
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('changes dormant period filter and reloads data', async () => {
    render(
      <AppProvider>
        <AuthProvider
          value={createMockAuthContext({
            discogs: { authenticated: true, username: 'testuser' },
            lastfm: { authenticated: true, username: 'testuser' },
          })}
        >
          <DiscoveryPage />
        </AuthProvider>
      </AppProvider>
    );

    await waitFor(() => {
      expect(
        screen.queryByText('Analyzing your listening history...')
      ).not.toBeInTheDocument();
    });

    // Click on Forgotten Favorites tab
    const forgottenTab = screen.getByText(/Forgotten Favorites/);
    fireEvent.click(forgottenTab);

    // Wait for initial data to load
    await waitFor(() => {
      expect(screen.getByText('Paranoid Android')).toBeInTheDocument();
    });

    const initialCallCount = mockGetForgottenFavorites.mock.calls.length;

    // Change dormant period to 6 months (180 days)
    const dormantSelect = screen.getByLabelText('Dormant for:');
    fireEvent.change(dormantSelect, { target: { value: '180' } });

    // Should reload with new parameter
    await waitFor(() => {
      expect(mockGetForgottenFavorites.mock.calls.length).toBeGreaterThan(
        initialCallCount
      );
    });
  });

  it('displays play count and dormancy for each track', async () => {
    render(
      <AppProvider>
        <AuthProvider
          value={createMockAuthContext({
            discogs: { authenticated: true, username: 'testuser' },
            lastfm: { authenticated: true, username: 'testuser' },
          })}
        >
          <DiscoveryPage />
        </AuthProvider>
      </AppProvider>
    );

    await waitFor(() => {
      expect(
        screen.queryByText('Analyzing your listening history...')
      ).not.toBeInTheDocument();
    });

    // Click on Forgotten Favorites tab
    const forgottenTab = screen.getByText(/Forgotten Favorites/);
    fireEvent.click(forgottenTab);

    await waitFor(() => {
      expect(screen.getByText('50 plays')).toBeInTheDocument();
      expect(screen.getByText('35 plays')).toBeInTheDocument();
    });

    // Check dormancy display (years ago)
    expect(screen.getAllByText(/years? ago/).length).toBeGreaterThan(0);
  });

  it('has Copy All and Export CSV buttons', async () => {
    render(
      <AppProvider>
        <AuthProvider
          value={createMockAuthContext({
            discogs: { authenticated: true, username: 'testuser' },
            lastfm: { authenticated: true, username: 'testuser' },
          })}
        >
          <DiscoveryPage />
        </AuthProvider>
      </AppProvider>
    );

    await waitFor(() => {
      expect(
        screen.queryByText('Analyzing your listening history...')
      ).not.toBeInTheDocument();
    });

    // Click on Forgotten Favorites tab
    const forgottenTab = screen.getByText(/Forgotten Favorites/);
    fireEvent.click(forgottenTab);

    await waitFor(() => {
      expect(screen.getByText('Copy All')).toBeInTheDocument();
      expect(screen.getByText('Export CSV')).toBeInTheDocument();
    });
  });

  it('shows loading state while fetching forgotten favorites', async () => {
    // Make the API call hang
    mockGetForgottenFavorites.mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    render(
      <AppProvider>
        <AuthProvider
          value={createMockAuthContext({
            discogs: { authenticated: true, username: 'testuser' },
            lastfm: { authenticated: true, username: 'testuser' },
          })}
        >
          <DiscoveryPage />
        </AuthProvider>
      </AppProvider>
    );

    await waitFor(() => {
      expect(
        screen.queryByText('Analyzing your listening history...')
      ).not.toBeInTheDocument();
    });

    // Click on Forgotten Favorites tab
    const forgottenTab = screen.getByText(/Forgotten Favorites/);
    fireEvent.click(forgottenTab);

    // Should show loading message
    expect(
      screen.getByText('Finding your forgotten favorites...')
    ).toBeInTheDocument();
  });
});
