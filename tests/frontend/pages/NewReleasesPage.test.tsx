import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import '@testing-library/jest-dom';

import { AppProvider } from '../../../src/renderer/context/AppContext';
import { AuthProvider } from '../../../src/renderer/context/AuthContext';
import NewReleasesPage from '../../../src/renderer/pages/NewReleasesPage';
import {
  AuthStatus,
  TrackedRelease,
  ArtistDisambiguationStatus,
  ReleaseTrackingSyncStatus,
  HiddenRelease,
} from '../../../src/shared/types';

// Mock API service
const mockGetTrackedReleases = jest.fn();
const mockGetPendingDisambiguations = jest.fn();
const mockGetReleaseTrackingSyncStatus = jest.fn();
const mockGetHiddenReleases = jest.fn();
const mockStartReleaseTrackingSync = jest.fn();
const mockResolveDisambiguation = jest.fn();
const mockSkipDisambiguation = jest.fn();
const mockSearchMusicBrainzArtist = jest.fn();
const mockAddReleaseToWishlist = jest.fn();
const mockCheckSingleReleaseVinyl = jest.fn();
const mockFetchReleaseCoverArt = jest.fn();
const mockHideRelease = jest.fn();
const mockExcludeArtist = jest.fn();

jest.mock('../../../src/renderer/services/api', () => ({
  getApiService: () => ({
    getTrackedReleases: mockGetTrackedReleases,
    getPendingDisambiguations: mockGetPendingDisambiguations,
    getReleaseTrackingSyncStatus: mockGetReleaseTrackingSyncStatus,
    getHiddenReleases: mockGetHiddenReleases,
    startReleaseTrackingSync: mockStartReleaseTrackingSync,
    resolveDisambiguation: mockResolveDisambiguation,
    skipDisambiguation: mockSkipDisambiguation,
    searchMusicBrainzArtist: mockSearchMusicBrainzArtist,
    addReleaseToWishlist: mockAddReleaseToWishlist,
    checkSingleReleaseVinyl: mockCheckSingleReleaseVinyl,
    fetchReleaseCoverArt: mockFetchReleaseCoverArt,
    hideRelease: mockHideRelease,
    excludeArtist: mockExcludeArtist,
  }),
}));

// Mock ReleaseCard component
jest.mock('../../../src/renderer/components/ReleaseCard', () => {
  return function MockReleaseCard({
    release,
    onCheckVinyl,
    onAddToWishlist,
    onHide,
    onExcludeArtist,
  }: {
    release: TrackedRelease;
    formatReleaseDate: (d: string | null) => string;
    getVinylBadge: (s: string) => React.ReactElement;
    onCheckVinyl: (mbid: string, title: string) => void;
    onAddToWishlist: (mbid: string, title: string) => void;
    onHide: (release: TrackedRelease) => void;
    onExcludeArtist: (name: string, mbid: string) => void;
  }) {
    return (
      <div data-testid={`release-card-${release.mbid}`}>
        <span>{release.title}</span>
        <span>{release.artistName}</span>
        <button onClick={() => onCheckVinyl(release.mbid, release.title)}>
          Check Vinyl
        </button>
        <button onClick={() => onAddToWishlist(release.mbid, release.title)}>
          Add to Wishlist
        </button>
        <button onClick={() => onHide(release)}>Hide</button>
        <button
          onClick={() =>
            onExcludeArtist(release.artistName, release.artistMbid)
          }
        >
          Exclude Artist
        </button>
      </div>
    );
  };
});

// Mock useNotifications hook
const mockAddNotification = jest.fn();
jest.mock('../../../src/renderer/hooks/useNotifications', () => ({
  useNotifications: () => ({
    addNotification: mockAddNotification,
    notifications: [],
    unreadCount: 0,
  }),
  createSuccessNotification: jest.fn((title: string, message: string) => ({
    type: 'success',
    title,
    message,
  })),
  createAlertNotification: jest.fn((title: string, message: string) => ({
    type: 'alert',
    title,
    message,
  })),
}));

// Mock UI components
jest.mock('../../../src/renderer/components/ui', () => ({
  Modal: ({
    isOpen,
    children,
    title,
  }: {
    isOpen: boolean;
    children: React.ReactNode;
    title: string;
    onClose: () => void;
    size?: string;
    loading?: boolean;
  }) =>
    isOpen ? (
      <div data-testid='modal'>
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
  ModalFooter: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='modal-footer'>{children}</div>
  ),
}));

jest.mock('../../../src/renderer/components/ui/ProgressBar', () => ({
  ProgressBar: ({
    value,
  }: {
    value: number;
    size?: string;
    animated?: boolean;
  }) => (
    <div data-testid='progress-bar' role='progressbar' aria-valuenow={value} />
  ),
}));

const mockReleases: TrackedRelease[] = [
  {
    mbid: 'release-1',
    title: 'New Album',
    artistName: 'Test Artist',
    artistMbid: 'artist-1',
    releaseDate: '2024-06-15',
    releaseType: 'album',
    vinylStatus: 'available',
    firstSeen: Date.now() - 86400000,
    isUpcoming: false,
    inWishlist: false,
  },
  {
    mbid: 'release-2',
    title: 'Upcoming EP',
    artistName: 'Another Artist',
    artistMbid: 'artist-2',
    releaseDate: '2025-12-01',
    releaseType: 'ep',
    vinylStatus: 'unknown',
    firstSeen: Date.now() - 172800000,
    isUpcoming: true,
    inWishlist: false,
  },
  {
    mbid: 'release-3',
    title: 'CD Only Album',
    artistName: 'Test Artist',
    artistMbid: 'artist-1',
    releaseDate: '2024-03-10',
    releaseType: 'album',
    vinylStatus: 'cd-only',
    firstSeen: Date.now() - 259200000,
    isUpcoming: false,
    inWishlist: true,
  },
];

const mockDisambiguations: ArtistDisambiguationStatus[] = [
  {
    id: 'disamb-1',
    artistName: 'Ambiguous Artist',
    normalizedName: 'ambiguous artist',
    status: 'pending',
    candidates: [
      {
        mbid: 'mb-1',
        name: 'Ambiguous Artist',
        disambiguation: 'UK rock band',
        country: 'GB',
        beginYear: 2010,
        score: 95,
      },
      {
        mbid: 'mb-2',
        name: 'Ambiguous Artist',
        disambiguation: 'US rapper',
        country: 'US',
        beginYear: 2015,
        score: 80,
      },
    ],
    createdAt: Date.now(),
  },
];

const mockSyncStatus: ReleaseTrackingSyncStatus = {
  status: 'idle',
  lastSync: Date.now() - 86400000,
  artistsProcessed: 0,
  totalArtists: 0,
  releasesFound: 0,
  pendingDisambiguations: 0,
  progress: 0,
};

const defaultAuthStatus: AuthStatus = {
  discogs: { authenticated: true, username: 'testuser' },
  lastfm: { authenticated: true, username: 'testuser' },
};

const unauthenticatedStatus: AuthStatus = {
  discogs: { authenticated: false },
  lastfm: { authenticated: false },
};

const renderNewReleasesPage = (authStatus: AuthStatus = defaultAuthStatus) => {
  return render(
    <AppProvider>
      <AuthProvider value={{ authStatus, setAuthStatus: jest.fn() }}>
        <NewReleasesPage />
      </AuthProvider>
    </AppProvider>
  );
};

describe('NewReleasesPage', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    jest.clearAllMocks();
    user = userEvent.setup();

    mockGetTrackedReleases.mockResolvedValue({ releases: mockReleases });
    mockGetPendingDisambiguations.mockResolvedValue({ disambiguations: [] });
    mockGetReleaseTrackingSyncStatus.mockResolvedValue(mockSyncStatus);
    mockGetHiddenReleases.mockResolvedValue([]);
  });

  it('renders page title', async () => {
    renderNewReleasesPage();

    expect(screen.getByText('New Releases')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockGetTrackedReleases).toHaveBeenCalled();
    });
  });

  it('renders loading state initially', async () => {
    renderNewReleasesPage();

    expect(screen.getByText('Loading releases...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText('Loading releases...')).not.toBeInTheDocument();
    });
  });

  it('renders releases after loading', async () => {
    renderNewReleasesPage();

    await waitFor(() => {
      expect(screen.getByText('New Album')).toBeInTheDocument();
    });

    expect(screen.getByText('Upcoming EP')).toBeInTheDocument();
    expect(screen.getByText('CD Only Album')).toBeInTheDocument();
  });

  it('shows unauthenticated state when not logged in', () => {
    renderNewReleasesPage(unauthenticatedStatus);

    expect(
      screen.getByText(/Connect your Discogs account/)
    ).toBeInTheDocument();
  });

  it('shows error state when API fails', async () => {
    mockGetTrackedReleases.mockRejectedValue(new Error('Network error'));

    renderNewReleasesPage();

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('shows Retry button on error and retries', async () => {
    mockGetTrackedReleases.mockRejectedValueOnce(new Error('Network error'));
    mockGetTrackedReleases.mockResolvedValueOnce({ releases: mockReleases });

    renderNewReleasesPage();

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('New Album')).toBeInTheDocument();
    });
  });

  it('shows empty state when no releases', async () => {
    mockGetTrackedReleases.mockResolvedValue({ releases: [] });

    renderNewReleasesPage();

    await waitFor(() => {
      expect(screen.getByText('No releases tracked yet.')).toBeInTheDocument();
    });
  });

  it('renders tab buttons with correct counts', async () => {
    renderNewReleasesPage();

    await waitFor(() => {
      expect(screen.getByText('New Album')).toBeInTheDocument();
    });

    expect(screen.getByText(/All \(3\)/)).toBeInTheDocument();
    expect(screen.getByText(/Upcoming \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Recent \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/Vinyl Available/)).toBeInTheDocument();
  });

  it('filters releases by Upcoming tab', async () => {
    renderNewReleasesPage();

    await waitFor(() => {
      expect(screen.getByText('New Album')).toBeInTheDocument();
    });

    const upcomingTab = screen.getByRole('button', { name: /Upcoming/ });
    await user.click(upcomingTab);

    // Only the upcoming release should be visible via ReleaseCard
    expect(screen.getByTestId('release-card-release-2')).toBeInTheDocument();
    expect(
      screen.queryByTestId('release-card-release-1')
    ).not.toBeInTheDocument();
  });

  it('filters releases by Recent tab', async () => {
    renderNewReleasesPage();

    await waitFor(() => {
      expect(screen.getByText('New Album')).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Recent/));

    expect(screen.getByTestId('release-card-release-1')).toBeInTheDocument();
    expect(screen.getByTestId('release-card-release-3')).toBeInTheDocument();
    expect(
      screen.queryByTestId('release-card-release-2')
    ).not.toBeInTheDocument();
  });

  it('shows Sync Releases button and triggers sync', async () => {
    mockStartReleaseTrackingSync.mockResolvedValue({
      status: { ...mockSyncStatus, status: 'syncing', progress: 0 },
    });

    renderNewReleasesPage();

    await waitFor(() => {
      expect(screen.getByText('Sync Releases')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Sync Releases'));

    expect(mockStartReleaseTrackingSync).toHaveBeenCalled();
  });

  it('shows sync progress when syncing', async () => {
    const syncingStatus: ReleaseTrackingSyncStatus = {
      status: 'syncing',
      lastSync: null,
      artistsProcessed: 5,
      totalArtists: 20,
      releasesFound: 3,
      pendingDisambiguations: 1,
      progress: 25,
      currentArtist: 'Radiohead',
    };
    mockGetReleaseTrackingSyncStatus.mockResolvedValue(syncingStatus);

    renderNewReleasesPage();

    await waitFor(() => {
      expect(screen.getByText('Cancel Sync')).toBeInTheDocument();
    });

    expect(screen.getByText(/Syncing releases:/)).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText(/5\/20 artists/)).toBeInTheDocument();
    expect(screen.getByText(/Processing: Radiohead/)).toBeInTheDocument();
    expect(screen.getByTestId('progress-bar')).toBeInTheDocument();
  });

  it('shows disambiguation alert when there are pending disambiguations', async () => {
    mockGetPendingDisambiguations.mockResolvedValue({
      disambiguations: mockDisambiguations,
    });

    renderNewReleasesPage();

    await waitFor(() => {
      expect(
        screen.getByText(/1 artist needs? disambiguation/)
      ).toBeInTheDocument();
    });

    expect(screen.getByText('Ambiguous Artist')).toBeInTheDocument();
  });

  it('opens disambiguation modal when clicking an artist', async () => {
    mockGetPendingDisambiguations.mockResolvedValue({
      disambiguations: mockDisambiguations,
    });

    renderNewReleasesPage();

    await waitFor(() => {
      expect(screen.getByText('Ambiguous Artist')).toBeInTheDocument();
    });

    // Click the disambiguation artist button
    const disambButton = screen.getByText('Ambiguous Artist');
    await user.click(disambButton);

    await waitFor(() => {
      expect(screen.getByTestId('modal')).toBeInTheDocument();
    });

    expect(screen.getByText(/Select Artist:/)).toBeInTheDocument();
  });

  it('hides hidden releases from the list', async () => {
    const hiddenReleases: HiddenRelease[] = [
      {
        mbid: 'release-1',
        title: 'New Album',
        artistName: 'Test Artist',
        hiddenAt: Date.now(),
      },
    ];
    mockGetHiddenReleases.mockResolvedValue(hiddenReleases);

    renderNewReleasesPage();

    await waitFor(() => {
      expect(screen.getByText('Upcoming EP')).toBeInTheDocument();
    });

    // Hidden release should not be rendered
    expect(
      screen.queryByTestId('release-card-release-1')
    ).not.toBeInTheDocument();
  });

  it('hides a release when clicking hide', async () => {
    mockHideRelease.mockResolvedValue(undefined);

    renderNewReleasesPage();

    await waitFor(() => {
      expect(screen.getByText('New Album')).toBeInTheDocument();
    });

    const hideButtons = screen.getAllByText('Hide');
    await user.click(hideButtons[0]);

    expect(mockHideRelease).toHaveBeenCalled();
  });

  it('adds release to wishlist when clicking Add to Wishlist', async () => {
    mockAddReleaseToWishlist.mockResolvedValue(undefined);

    renderNewReleasesPage();

    await waitFor(() => {
      expect(screen.getByText('New Album')).toBeInTheDocument();
    });

    // Click the Add to Wishlist button on the first rendered release card
    const releaseCard1 = screen.getByTestId('release-card-release-1');
    const wishlistButton = releaseCard1.querySelector('button');
    // Find the specific "Add to Wishlist" button within this card
    const addBtn = Array.from(releaseCard1.querySelectorAll('button')).find(
      b => b.textContent === 'Add to Wishlist'
    );
    await user.click(addBtn!);

    expect(mockAddReleaseToWishlist).toHaveBeenCalledWith('release-1');
  });

  it('shows last sync date', async () => {
    renderNewReleasesPage();

    await waitFor(() => {
      expect(screen.getByText(/Last sync:/)).toBeInTheDocument();
    });
  });

  it('shows Never synced when no sync has occurred', async () => {
    mockGetReleaseTrackingSyncStatus.mockResolvedValue({
      ...mockSyncStatus,
      lastSync: null,
    });

    renderNewReleasesPage();

    await waitFor(() => {
      expect(screen.getByText('Never synced')).toBeInTheDocument();
    });
  });

  it('shows sort options', async () => {
    renderNewReleasesPage();

    await waitFor(() => {
      expect(screen.getByText('New Album')).toBeInTheDocument();
    });

    const sortSelect = screen.getByDisplayValue('Release Date');
    expect(sortSelect).toBeInTheDocument();
  });

  it('shows type filter checkboxes', async () => {
    renderNewReleasesPage();

    await waitFor(() => {
      expect(screen.getByText('New Album')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Album')).toBeInTheDocument();
    expect(screen.getByLabelText('Ep')).toBeInTheDocument();
    expect(screen.getByLabelText('Single')).toBeInTheDocument();
    expect(screen.getByLabelText('Compilation')).toBeInTheDocument();
  });

  it('shows Fetch Covers button', async () => {
    renderNewReleasesPage();

    await waitFor(() => {
      expect(screen.getByText('Fetch Covers')).toBeInTheDocument();
    });
  });

  it('fetches cover art when clicking Fetch Covers', async () => {
    mockFetchReleaseCoverArt.mockResolvedValue({ updated: 3 });
    mockGetTrackedReleases.mockResolvedValue({ releases: mockReleases });

    renderNewReleasesPage();

    await waitFor(() => {
      expect(screen.getByText('Fetch Covers')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Fetch Covers'));

    expect(mockFetchReleaseCoverArt).toHaveBeenCalled();
  });

  it('shows empty filter state when all releases are filtered out', async () => {
    // Only have an upcoming release, then filter by vinyl tab
    mockGetTrackedReleases.mockResolvedValue({
      releases: [mockReleases[1]], // Only the upcoming EP with unknown vinyl
    });

    renderNewReleasesPage();

    await waitFor(() => {
      expect(screen.getByText('Upcoming EP')).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Vinyl Available/));

    expect(
      screen.getByText('No releases match the current filters.')
    ).toBeInTheDocument();
  });
});
