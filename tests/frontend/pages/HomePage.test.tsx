import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import React from 'react';

import { AuthProvider } from '../../../src/renderer/context/AuthContext';
import HomePage from '../../../src/renderer/pages/HomePage';
import * as apiService from '../../../src/renderer/services/api';
import { AuthStatus, AppState } from '../../../src/shared/types';

// Mock the API service
jest.mock('../../../src/renderer/services/api');
const mockApiService = apiService as jest.Mocked<typeof apiService>;

// Mock date utils
jest.mock('../../../src/renderer/utils/dateUtils', () => ({
  formatLocalTimeClean: jest.fn(date => date.toLocaleString()),
  getTimezoneOffset: jest.fn(() => 'UTC-5'),
}));

// Mock AppContext
const mockUseApp = {
  state: { serverUrl: 'http://localhost:3001' },
  dispatch: jest.fn(),
};

jest.mock('../../../src/renderer/context/AppContext', () => ({
  useApp: () => mockUseApp,
}));

const createMockAuthContext = (authStatus: AuthStatus) => ({
  authStatus,
  setAuthStatus: jest.fn(),
});

const createMockApiInstance = () => ({
  healthCheck: jest.fn(),
  getAuthStatus: jest.fn(),
  getLastfmRecentScrobbles: jest.fn(),
  getLastfmTopTracks: jest.fn(),
  getLastfmTopArtists: jest.fn(),
});

const renderHomePageWithProviders = (
  authStatus: AuthStatus,
  serverUrl: string = 'http://localhost:3001'
) => {
  mockUseApp.state = { serverUrl };
  const authContextValue = createMockAuthContext(authStatus);

  return {
    ...render(
      <AuthProvider value={authContextValue}>
        <HomePage />
      </AuthProvider>
    ),
    authContextValue,
  };
};

describe('HomePage', () => {
  let mockApi: ReturnType<typeof createMockApiInstance>;

  beforeEach(() => {
    mockApi = createMockApiInstance();
    mockApiService.getApiService.mockReturnValue(mockApi as any);
    jest.clearAllMocks();
  });

  it('renders the welcome message and description', () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: false, username: undefined },
      lastfm: { authenticated: false, username: undefined },
    };

    renderHomePageWithProviders(authStatus);

    expect(
      screen.getByText('Welcome to Discogs to Last.fm Scrobbler')
    ).toBeInTheDocument();
    expect(
      screen.getByText(/This application allows you to connect/)
    ).toBeInTheDocument();
  });

  describe('Server Status', () => {
    it('shows checking status initially', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: false, username: undefined },
        lastfm: { authenticated: false, username: undefined },
      };

      mockApi.healthCheck.mockImplementation(() => new Promise(() => {})); // Never resolves

      renderHomePageWithProviders(authStatus);

      expect(
        screen.getByText('Checking server connection...')
      ).toBeInTheDocument();
      expect(screen.getByText('Server Status')).toBeInTheDocument();
    });

    it('shows connected status when server is healthy', async () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: false, username: undefined },
        lastfm: { authenticated: false, username: undefined },
      };

      mockApi.healthCheck.mockResolvedValue(undefined);
      mockApi.getAuthStatus.mockResolvedValue(authStatus);

      renderHomePageWithProviders(authStatus);

      await waitFor(() => {
        expect(
          screen.getByText('✓ Successfully connected to backend server')
        ).toBeInTheDocument();
      });
    });

    it('shows error status when server connection fails', async () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: false, username: undefined },
        lastfm: { authenticated: false, username: undefined },
      };

      mockApi.healthCheck.mockRejectedValue(new Error('Connection failed'));

      renderHomePageWithProviders(authStatus);

      await waitFor(() => {
        expect(
          screen.getByText(/✗ Unable to connect to backend server/)
        ).toBeInTheDocument();
        expect(screen.getByText(/Connection failed/)).toBeInTheDocument();
      });
    });

    it('allows retry when server connection fails', async () => {
      const user = userEvent.setup();
      const authStatus: AuthStatus = {
        discogs: { authenticated: false, username: undefined },
        lastfm: { authenticated: false, username: undefined },
      };

      mockApi.healthCheck.mockRejectedValueOnce(new Error('Connection failed'));
      mockApi.healthCheck.mockResolvedValue(undefined);
      mockApi.getAuthStatus.mockResolvedValue(authStatus);

      renderHomePageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });

      const retryButton = screen.getByText('Retry');
      await user.click(retryButton);

      await waitFor(() => {
        expect(
          screen.getByText('✓ Successfully connected to backend server')
        ).toBeInTheDocument();
      });

      expect(mockApi.healthCheck).toHaveBeenCalledTimes(2);
    });
  });

  describe('Authentication Status', () => {
    it('displays authentication status when server is connected', async () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: false, username: undefined },
      };

      mockApi.healthCheck.mockResolvedValue(undefined);
      mockApi.getAuthStatus.mockResolvedValue(authStatus);

      renderHomePageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Authentication Status')).toBeInTheDocument();
      });

      expect(screen.getByText('Discogs')).toBeInTheDocument();
      expect(screen.getByText('Last.fm')).toBeInTheDocument();
      expect(screen.getByText('Connected')).toBeInTheDocument();
      expect(screen.getByText('Not connected')).toBeInTheDocument();
      expect(screen.getByText('User: discogs_user')).toBeInTheDocument();
    });

    it('does not display authentication status when server is not connected', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: false, username: undefined },
        lastfm: { authenticated: false, username: undefined },
      };

      mockApi.healthCheck.mockRejectedValue(new Error('Connection failed'));

      renderHomePageWithProviders(authStatus);

      expect(
        screen.queryByText('Authentication Status')
      ).not.toBeInTheDocument();
    });
  });

  describe('Last.fm Activity', () => {
    const createMockLastfmData = () => ({
      recentScrobbles: [
        {
          name: 'Test Track 1',
          artist: { '#text': 'Test Artist 1' },
          album: { '#text': 'Test Album 1' },
          date: { '#text': '2023-01-01T10:00:00Z' },
          image: [null, null, { '#text': 'http://example.com/image.jpg' }],
        },
        {
          name: 'Test Track 2',
          artist: { '#text': 'Test Artist 2' },
          album: { '#text': 'Test Album 2' },
          date: { '#text': '2023-01-01T09:00:00Z' },
        },
      ],
      topTracks: [
        {
          name: 'Popular Track 1',
          artist: { name: 'Popular Artist 1' },
          playcount: '100',
        },
        {
          name: 'Popular Track 2',
          artist: { name: 'Popular Artist 2' },
          playcount: '95',
        },
      ],
      topArtists: [
        {
          name: 'Top Artist 1',
          playcount: '200',
        },
        {
          name: 'Top Artist 2',
          playcount: '180',
        },
      ],
    });

    it('displays Last.fm activity when authenticated', async () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      const mockData = createMockLastfmData();
      mockApi.healthCheck.mockResolvedValue(undefined);
      mockApi.getAuthStatus.mockResolvedValue(authStatus);
      mockApi.getLastfmRecentScrobbles.mockResolvedValue(
        mockData.recentScrobbles
      );
      mockApi.getLastfmTopTracks.mockResolvedValue(mockData.topTracks);
      mockApi.getLastfmTopArtists.mockResolvedValue(mockData.topArtists);

      renderHomePageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Your Last.fm Activity')).toBeInTheDocument();
      });

      // Check recent scrobbles
      expect(screen.getByText('Recent Scrobbles')).toBeInTheDocument();
      expect(screen.getByText('Test Track 1')).toBeInTheDocument();
      expect(screen.getByText('Test Artist 1')).toBeInTheDocument();
      expect(screen.getByText('Test Album 1')).toBeInTheDocument();

      // Check top tracks
      expect(screen.getByText('Top Tracks')).toBeInTheDocument();
      expect(screen.getByText('Popular Track 1')).toBeInTheDocument();
      expect(screen.getByText('Popular Artist 1')).toBeInTheDocument();
      expect(screen.getByText('100 plays')).toBeInTheDocument();

      // Check top artists
      expect(screen.getByText('Top Artists')).toBeInTheDocument();
      expect(screen.getByText('Top Artist 1')).toBeInTheDocument();
      expect(screen.getByText('200 plays')).toBeInTheDocument();
    });

    it('shows loading state while fetching Last.fm data', async () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      mockApi.healthCheck.mockResolvedValue(undefined);
      mockApi.getAuthStatus.mockResolvedValue(authStatus);
      mockApi.getLastfmRecentScrobbles.mockImplementation(
        () => new Promise(() => {})
      ); // Never resolves

      renderHomePageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Your Last.fm Activity')).toBeInTheDocument();
      });

      expect(screen.getByText('Loading Last.fm data...')).toBeInTheDocument();
    });

    it('allows changing time period for charts', async () => {
      const user = userEvent.setup();
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      const mockData = createMockLastfmData();
      mockApi.healthCheck.mockResolvedValue(undefined);
      mockApi.getAuthStatus.mockResolvedValue(authStatus);
      mockApi.getLastfmRecentScrobbles.mockResolvedValue(
        mockData.recentScrobbles
      );
      mockApi.getLastfmTopTracks.mockResolvedValue(mockData.topTracks);
      mockApi.getLastfmTopArtists.mockResolvedValue(mockData.topArtists);

      renderHomePageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Time Period:')).toBeInTheDocument();
      });

      const periodSelect = screen.getByRole('combobox');
      await user.selectOptions(periodSelect, '1month');

      expect(mockApi.getLastfmTopTracks).toHaveBeenCalledWith('1month', 10);
      expect(mockApi.getLastfmTopArtists).toHaveBeenCalledWith('1month', 10);
    });

    it('does not display Last.fm activity when not authenticated', async () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: false, username: undefined },
      };

      mockApi.healthCheck.mockResolvedValue(undefined);
      mockApi.getAuthStatus.mockResolvedValue(authStatus);

      renderHomePageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Authentication Status')).toBeInTheDocument();
      });

      expect(
        screen.queryByText('Your Last.fm Activity')
      ).not.toBeInTheDocument();
    });
  });

  describe('Next Steps', () => {
    it('shows server setup steps when server is not connected', async () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: false, username: undefined },
        lastfm: { authenticated: false, username: undefined },
      };

      mockApi.healthCheck.mockRejectedValue(new Error('Connection failed'));

      renderHomePageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Next Steps')).toBeInTheDocument();
      });

      expect(
        screen.getByText('Ensure the backend server is running')
      ).toBeInTheDocument();
      expect(screen.getByText('Check your connection')).toBeInTheDocument();
    });

    it('shows authentication setup steps when no services are connected', async () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: false, username: undefined },
        lastfm: { authenticated: false, username: undefined },
      };

      mockApi.healthCheck.mockResolvedValue(undefined);
      mockApi.getAuthStatus.mockResolvedValue(authStatus);

      renderHomePageWithProviders(authStatus);

      await waitFor(() => {
        expect(
          screen.getByText('Set up your Discogs and Last.fm API credentials')
        ).toBeInTheDocument();
      });

      expect(
        screen.getByText('Go to Setup & Authentication to get started')
      ).toBeInTheDocument();
    });

    it('shows Discogs setup steps when only Last.fm is connected', async () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: false, username: undefined },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      mockApi.healthCheck.mockResolvedValue(undefined);
      mockApi.getAuthStatus.mockResolvedValue(authStatus);
      // Mock Last.fm data since user is authenticated
      mockApi.getLastfmRecentScrobbles.mockResolvedValue([]);
      mockApi.getLastfmTopTracks.mockResolvedValue([]);
      mockApi.getLastfmTopArtists.mockResolvedValue([]);

      renderHomePageWithProviders(authStatus);

      await waitFor(() => {
        expect(
          screen.getByText('Complete Discogs authentication')
        ).toBeInTheDocument();
      });

      expect(
        screen.getByText('Add your Discogs Personal Access Token')
      ).toBeInTheDocument();
    });

    it('shows Last.fm setup steps when only Discogs is connected', async () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: false, username: undefined },
      };

      mockApi.healthCheck.mockResolvedValue(undefined);
      mockApi.getAuthStatus.mockResolvedValue(authStatus);

      renderHomePageWithProviders(authStatus);

      await waitFor(() => {
        expect(
          screen.getByText('Complete Last.fm authentication')
        ).toBeInTheDocument();
      });

      expect(
        screen.getByText('Connect your Last.fm account')
      ).toBeInTheDocument();
    });

    it('shows usage steps when both services are connected', async () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      mockApi.healthCheck.mockResolvedValue(undefined);
      mockApi.getAuthStatus.mockResolvedValue(authStatus);
      mockApi.getLastfmRecentScrobbles.mockResolvedValue([]);
      mockApi.getLastfmTopTracks.mockResolvedValue([]);
      mockApi.getLastfmTopArtists.mockResolvedValue([]);

      renderHomePageWithProviders(authStatus);

      await waitFor(() => {
        expect(
          screen.getByText('Browse your Discogs collection')
        ).toBeInTheDocument();
      });

      expect(
        screen.getByText('Select albums to scrobble to Last.fm')
      ).toBeInTheDocument();
      expect(
        screen.getByText('View your scrobbling history')
      ).toBeInTheDocument();
    });
  });

  it('displays how it works section', () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: false, username: undefined },
      lastfm: { authenticated: false, username: undefined },
    };

    renderHomePageWithProviders(authStatus);

    expect(screen.getByText('How It Works')).toBeInTheDocument();
    expect(screen.getByText('1. Connect Your Accounts')).toBeInTheDocument();
    expect(screen.getByText('2. Browse Your Collection')).toBeInTheDocument();
    expect(screen.getByText('3. Select & Scrobble')).toBeInTheDocument();
  });

  it('updates auth status when server check succeeds', async () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: false, username: undefined },
      lastfm: { authenticated: false, username: undefined },
    };

    const newAuthStatus: AuthStatus = {
      discogs: { authenticated: true, username: 'test_user' },
      lastfm: { authenticated: false, username: undefined },
    };

    mockApi.healthCheck.mockResolvedValue(undefined);
    mockApi.getAuthStatus.mockResolvedValue(newAuthStatus);

    const { authContextValue } = renderHomePageWithProviders(authStatus);

    await waitFor(() => {
      expect(authContextValue.setAuthStatus).toHaveBeenCalledWith(
        newAuthStatus
      );
    });
  });
});
