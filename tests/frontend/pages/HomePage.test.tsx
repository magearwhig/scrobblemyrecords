import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import React from 'react';

import { AuthProvider } from '../../../src/renderer/context/AuthContext';
import HomePage from '../../../src/renderer/pages/HomePage';
import * as apiService from '../../../src/renderer/services/api';
import { AuthStatus, DashboardData } from '../../../src/shared/types';

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

const createMockApiInstance = () => {
  const apiGet = jest.fn();
  // Mock both heatmap and milestones endpoints to return empty/null data
  apiGet.mockImplementation((path: string) => {
    if (path === '/stats/heatmap') {
      return Promise.resolve({ data: { data: [] } });
    }
    if (path === '/stats/milestones') {
      return Promise.resolve({ data: { data: null } });
    }
    return Promise.resolve({ data: { data: null } });
  });

  return {
    healthCheck: jest.fn(),
    getAuthStatus: jest.fn(),
    getDashboard: jest.fn(),
    api: {
      get: apiGet,
    },
  };
};

const createMockDashboardData = (): DashboardData => ({
  errors: {},
  quickStats: {
    currentStreak: 5,
    longestStreak: 10,
    scrobblesThisMonth: 200,
    averageMonthlyScrobbles: 150,
    newArtistsThisMonth: 3,
    collectionCoverageThisMonth: 25,
    listeningHoursThisMonth: 12,
    totalScrobbles: 5000,
    nextMilestone: 10000,
  },
  quickActions: {
    newSellerMatches: 2,
    missingAlbumsCount: 5,
    wantListCount: 10,
    dustyCornersCount: 8,
  },
  recentAlbums: [
    {
      artist: 'Radiohead',
      album: 'Kid A',
      coverUrl: 'https://example.com/cover.jpg',
      lastPlayed: Date.now() / 1000 - 3600, // 1 hour ago
      releaseId: 123,
      inCollection: true,
    },
    {
      artist: 'Pink Floyd',
      album: 'The Dark Side of the Moon',
      coverUrl: null,
      lastPlayed: Date.now() / 1000 - 86400, // 1 day ago
      inCollection: false,
    },
  ],
  monthlyTopArtists: [
    { name: 'Radiohead', playCount: 100, imageUrl: null },
    { name: 'Pink Floyd', playCount: 80, imageUrl: null },
  ],
  monthlyTopAlbums: [
    {
      artist: 'Radiohead',
      album: 'Kid A',
      playCount: 50,
      coverUrl: 'https://example.com/cover.jpg',
    },
  ],
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

describe('HomePage Dashboard', () => {
  let mockApi: ReturnType<typeof createMockApiInstance>;

  beforeEach(() => {
    mockApi = createMockApiInstance();
    mockApiService.getApiService.mockReturnValue(mockApi as any);
    // Note: Don't call jest.clearAllMocks() here as it resets the mock implementation
  });

  describe('Loading State', () => {
    it('shows loading spinner while fetching dashboard data', async () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      mockApi.healthCheck.mockResolvedValue(undefined);
      mockApi.getAuthStatus.mockResolvedValue(authStatus);
      mockApi.getDashboard.mockImplementation(() => new Promise(() => {})); // Never resolves
      // Note: api.get mock is set in createMockApiInstance

      renderHomePageWithProviders(authStatus);

      await waitFor(() => {
        expect(
          screen.getByText('Loading your dashboard...')
        ).toBeInTheDocument();
      });
    });
  });

  describe('Onboarding State', () => {
    it('shows welcome message when not onboarded', async () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: false, username: undefined },
        lastfm: { authenticated: false, username: undefined },
      };

      mockApi.healthCheck.mockResolvedValue(undefined);
      mockApi.getAuthStatus.mockResolvedValue(authStatus);
      mockApi.getDashboard.mockResolvedValue(createMockDashboardData());

      renderHomePageWithProviders(authStatus);

      await waitFor(() => {
        expect(
          screen.getByText('Welcome to RecordScrobbles')
        ).toBeInTheDocument();
      });
    });

    it('shows connect accounts button when not onboarded', async () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: false, username: undefined },
        lastfm: { authenticated: false, username: undefined },
      };

      mockApi.healthCheck.mockResolvedValue(undefined);
      mockApi.getAuthStatus.mockResolvedValue(authStatus);
      mockApi.getDashboard.mockResolvedValue(createMockDashboardData());

      renderHomePageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Connect Accounts')).toBeInTheDocument();
      });
    });

    it('shows how it works section when not onboarded', async () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: false, username: undefined },
        lastfm: { authenticated: false, username: undefined },
      };

      mockApi.healthCheck.mockResolvedValue(undefined);
      mockApi.getAuthStatus.mockResolvedValue(authStatus);
      mockApi.getDashboard.mockResolvedValue(createMockDashboardData());

      renderHomePageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('How It Works')).toBeInTheDocument();
      });

      expect(screen.getByText('1. Connect')).toBeInTheDocument();
      expect(screen.getByText('2. Scrobble')).toBeInTheDocument();
      expect(screen.getByText('3. Discover')).toBeInTheDocument();
    });
  });

  describe('Dashboard View (Onboarded)', () => {
    it('shows quick stats when fully authenticated', async () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      mockApi.healthCheck.mockResolvedValue(undefined);
      mockApi.getAuthStatus.mockResolvedValue(authStatus);
      mockApi.getDashboard.mockResolvedValue(createMockDashboardData());

      renderHomePageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Day Streak')).toBeInTheDocument();
      });

      // "This Month" appears both as stat label and section header, so use getAllByText
      expect(screen.getAllByText('This Month').length).toBeGreaterThan(0);
      expect(screen.getByText('New Artists')).toBeInTheDocument();
      expect(screen.getByText('Collection Played')).toBeInTheDocument();
      expect(screen.getByText('Listening Time')).toBeInTheDocument();
    });

    it('shows recent albums section', async () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      mockApi.healthCheck.mockResolvedValue(undefined);
      mockApi.getAuthStatus.mockResolvedValue(authStatus);
      mockApi.getDashboard.mockResolvedValue(createMockDashboardData());

      renderHomePageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Recent Activity')).toBeInTheDocument();
      });

      // "Kid A" and "Radiohead" appear in multiple sections (recent albums and monthly highlights)
      expect(screen.getAllByText('Kid A').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Radiohead').length).toBeGreaterThan(0);
    });

    it('shows monthly highlights section', async () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      mockApi.healthCheck.mockResolvedValue(undefined);
      mockApi.getAuthStatus.mockResolvedValue(authStatus);
      mockApi.getDashboard.mockResolvedValue(createMockDashboardData());

      renderHomePageWithProviders(authStatus);

      await waitFor(() => {
        // "This Month" appears as both stat label and section header
        expect(screen.getAllByText('This Month').length).toBeGreaterThan(0);
      });

      expect(screen.getByText('Top Artists')).toBeInTheDocument();
      expect(screen.getByText('Top Albums')).toBeInTheDocument();
    });

    it('shows quick actions when there are actionable items', async () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      mockApi.healthCheck.mockResolvedValue(undefined);
      mockApi.getAuthStatus.mockResolvedValue(authStatus);
      mockApi.getDashboard.mockResolvedValue(createMockDashboardData());

      renderHomePageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Quick Actions')).toBeInTheDocument();
      });

      // Should show the action items
      expect(screen.getByText('2 new')).toBeInTheDocument(); // seller matches
      expect(screen.getByText('seller matches')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('shows error state when dashboard fails to load', async () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      mockApi.healthCheck.mockResolvedValue(undefined);
      mockApi.getAuthStatus.mockResolvedValue(authStatus);
      mockApi.getDashboard.mockRejectedValue(new Error('Network error'));

      renderHomePageWithProviders(authStatus);

      await waitFor(() => {
        expect(
          screen.getByText('Unable to load dashboard')
        ).toBeInTheDocument();
      });

      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });

    it('allows retry when dashboard fails', async () => {
      const user = userEvent.setup();
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      mockApi.healthCheck.mockResolvedValue(undefined);
      mockApi.getAuthStatus.mockResolvedValue(authStatus);
      mockApi.getDashboard
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue(createMockDashboardData());

      renderHomePageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Try Again')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Try Again'));

      await waitFor(() => {
        expect(screen.getByText('Day Streak')).toBeInTheDocument();
      });

      expect(mockApi.getDashboard).toHaveBeenCalledTimes(2);
    });
  });

  describe('Connection Status', () => {
    it('shows connection status section', async () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      mockApi.healthCheck.mockResolvedValue(undefined);
      mockApi.getAuthStatus.mockResolvedValue(authStatus);
      mockApi.getDashboard.mockResolvedValue(createMockDashboardData());

      renderHomePageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('All services connected')).toBeInTheDocument();
      });
    });
  });

  describe('Empty State', () => {
    it('shows empty state when no listening data', async () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      const emptyDashboard: DashboardData = {
        errors: {},
        quickStats: {
          currentStreak: 0,
          longestStreak: 0,
          scrobblesThisMonth: 0,
          averageMonthlyScrobbles: 0,
          newArtistsThisMonth: 0,
          collectionCoverageThisMonth: 0,
          listeningHoursThisMonth: 0,
          totalScrobbles: 0,
          nextMilestone: 100,
        },
        quickActions: {
          newSellerMatches: 0,
          missingAlbumsCount: 0,
          wantListCount: 0,
          dustyCornersCount: 0,
        },
        recentAlbums: [],
        monthlyTopArtists: [],
        monthlyTopAlbums: [],
      };

      mockApi.healthCheck.mockResolvedValue(undefined);
      mockApi.getAuthStatus.mockResolvedValue(authStatus);
      mockApi.getDashboard.mockResolvedValue(emptyDashboard);

      renderHomePageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('No listening data yet')).toBeInTheDocument();
      });

      expect(screen.getByText('Browse Collection')).toBeInTheDocument();
    });
  });

  describe('Auth Status Updates', () => {
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
      mockApi.getDashboard.mockResolvedValue(createMockDashboardData());

      const { authContextValue } = renderHomePageWithProviders(authStatus);

      await waitFor(() => {
        expect(authContextValue.setAuthStatus).toHaveBeenCalledWith(
          newAuthStatus
        );
      });
    });
  });
});
