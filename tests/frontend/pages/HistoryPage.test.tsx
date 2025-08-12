import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import React from 'react';

import { AuthProvider } from '../../../src/renderer/context/AuthContext';
import HistoryPage from '../../../src/renderer/pages/HistoryPage';
import * as apiService from '../../../src/renderer/services/api';
import * as dateUtils from '../../../src/renderer/utils/dateUtils';
import { AuthStatus, ScrobbleSession } from '../../../src/shared/types';

// Mock the API service
jest.mock('../../../src/renderer/services/api');
const mockApiService = apiService as jest.Mocked<typeof apiService>;

// Mock date utils
jest.mock('../../../src/renderer/utils/dateUtils', () => ({
  formatLocalTimeClean: jest.fn(timestamp =>
    new Date(timestamp).toLocaleString()
  ),
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
  getAuthStatus: jest.fn(),
  getScrobbleHistory: jest.fn(),
});

const createMockScrobbleSession = (
  id: string,
  status: 'completed' | 'failed' | 'pending',
  trackCount: number = 3
): ScrobbleSession => ({
  id,
  timestamp: Date.now(),
  status,
  tracks: Array.from({ length: trackCount }, (_, i) => ({
    artist: `Artist ${i + 1}`,
    album: `Album ${i + 1}`,
    track: `Track ${i + 1}`,
    timestamp: Math.floor(Date.now() / 1000) + i,
  })),
  error: status === 'failed' ? 'Network error occurred' : undefined,
});

const renderHistoryPageWithProviders = (
  authStatus: AuthStatus,
  serverUrl: string = 'http://localhost:3001'
) => {
  mockUseApp.state = { serverUrl };
  const authContextValue = createMockAuthContext(authStatus);

  return {
    ...render(
      <AuthProvider value={authContextValue}>
        <HistoryPage />
      </AuthProvider>
    ),
    authContextValue,
  };
};

describe('HistoryPage', () => {
  let mockApi: ReturnType<typeof createMockApiInstance>;

  beforeEach(() => {
    mockApi = createMockApiInstance();
    mockApiService.getApiService.mockReturnValue(mockApi as any);
    jest.clearAllMocks();
  });

  describe('Authentication', () => {
    it('shows authentication required message when Last.fm is not authenticated', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: false, username: undefined },
      };

      renderHistoryPageWithProviders(authStatus);

      expect(screen.getByText('Scrobble History')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Please authenticate with Last.fm first to view your scrobbling history.'
        )
      ).toBeInTheDocument();
      expect(screen.getByText('Go to Setup')).toBeInTheDocument();
    });

    it('loads history when Last.fm is authenticated', async () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      const mockSessions = [
        createMockScrobbleSession('session1', 'completed'),
        createMockScrobbleSession('session2', 'failed'),
      ];

      mockApi.getScrobbleHistory.mockResolvedValue(mockSessions);

      renderHistoryPageWithProviders(authStatus);

      await waitFor(() => {
        expect(mockApi.getScrobbleHistory).toHaveBeenCalled();
      });

      expect(screen.getByText('completed')).toBeInTheDocument();
      expect(screen.getByText('failed')).toBeInTheDocument();
    });

    it('checks auth status if not authenticated', async () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: false, username: undefined },
      };

      const newAuthStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      mockApi.getAuthStatus.mockResolvedValue(newAuthStatus);
      mockApi.getScrobbleHistory.mockResolvedValue([]);

      const { authContextValue } = renderHistoryPageWithProviders(authStatus);

      await waitFor(() => {
        expect(authContextValue.setAuthStatus).toHaveBeenCalledWith(
          newAuthStatus
        );
      });
    });
  });

  describe('Loading States', () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: true, username: 'discogs_user' },
      lastfm: { authenticated: true, username: 'lastfm_user' },
    };

    it('shows loading state while fetching history', async () => {
      mockApi.getScrobbleHistory.mockImplementation(
        () => new Promise(() => {})
      ); // Never resolves

      renderHistoryPageWithProviders(authStatus);

      await waitFor(() => {
        expect(
          screen.getByText('Loading scrobble history...')
        ).toBeInTheDocument();
      });
    });

    it('shows empty state when no sessions exist', async () => {
      mockApi.getScrobbleHistory.mockResolvedValue([]);

      renderHistoryPageWithProviders(authStatus);

      await waitFor(() => {
        expect(
          screen.getByText(
            'No scrobbling sessions found. Start scrobbling some tracks to see them here!'
          )
        ).toBeInTheDocument();
        expect(screen.getByText('Browse Collection')).toBeInTheDocument();
      });
    });

    it('displays error message when loading fails', async () => {
      mockApi.getScrobbleHistory.mockRejectedValue(
        new Error('Failed to load history')
      );

      renderHistoryPageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Failed to load history')).toBeInTheDocument();
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });
    });
  });

  describe('Session Display', () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: true, username: 'discogs_user' },
      lastfm: { authenticated: true, username: 'lastfm_user' },
    };

    beforeEach(() => {
      const mockSessions = [
        createMockScrobbleSession('session1', 'completed', 5),
        createMockScrobbleSession('session2', 'failed', 3),
        createMockScrobbleSession('session3', 'pending', 2),
      ];

      mockApi.getScrobbleHistory.mockResolvedValue(mockSessions);
    });

    it('displays session information', async () => {
      renderHistoryPageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('✅')).toBeInTheDocument(); // completed icon
        expect(screen.getByText('❌')).toBeInTheDocument(); // failed icon
        expect(screen.getByText('⏳')).toBeInTheDocument(); // pending icon

        expect(screen.getByText('completed')).toBeInTheDocument();
        expect(screen.getByText('failed')).toBeInTheDocument();
        expect(screen.getByText('pending')).toBeInTheDocument();

        // Check for track counts in a more flexible way
        expect(screen.getByText('5')).toBeInTheDocument();
        expect(screen.getByText('3')).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument();
        expect(screen.getAllByText('tracks').length).toBe(3);
      });
    });

    it('shows success message for completed sessions', async () => {
      renderHistoryPageWithProviders(authStatus);

      await waitFor(() => {
        expect(
          screen.getByText('• Successfully scrobbled')
        ).toBeInTheDocument();
      });
    });

    it('shows error message for failed sessions', async () => {
      renderHistoryPageWithProviders(authStatus);

      await waitFor(() => {
        expect(
          screen.getByText('• Network error occurred')
        ).toBeInTheDocument();
      });
    });

    it('shows timezone information', async () => {
      renderHistoryPageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Times shown in UTC-5')).toBeInTheDocument();
      });
    });
  });

  describe('Session Details', () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: true, username: 'discogs_user' },
      lastfm: { authenticated: true, username: 'lastfm_user' },
    };

    beforeEach(() => {
      const mockSessions = [
        createMockScrobbleSession('session1', 'completed', 2),
      ];

      mockApi.getScrobbleHistory.mockResolvedValue(mockSessions);
    });

    it('allows viewing session details', async () => {
      const user = userEvent.setup();

      renderHistoryPageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('View Details')).toBeInTheDocument();
      });

      const viewDetailsButton = screen.getByText('View Details');
      await user.click(viewDetailsButton);

      expect(screen.getByText('Session Details')).toBeInTheDocument();
      expect(screen.getByText('Session ID:')).toBeInTheDocument();
      expect(screen.getByText('session1')).toBeInTheDocument();
      expect(screen.getByText(/Tracks \(/)).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('shows track information in session details', async () => {
      const user = userEvent.setup();

      renderHistoryPageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('View Details')).toBeInTheDocument();
      });

      const viewDetailsButton = screen.getByText('View Details');
      await user.click(viewDetailsButton);

      expect(screen.getByText('Track 1')).toBeInTheDocument();
      expect(screen.getByText('Artist 1 • Album 1')).toBeInTheDocument();
      expect(screen.getByText('Track 2')).toBeInTheDocument();
      expect(screen.getByText('Artist 2 • Album 2')).toBeInTheDocument();
    });

    it('can hide session details', async () => {
      const user = userEvent.setup();

      renderHistoryPageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('View Details')).toBeInTheDocument();
      });

      // Show details
      const viewDetailsButton = screen.getByText('View Details');
      await user.click(viewDetailsButton);

      expect(screen.getByText('Session Details')).toBeInTheDocument();

      // Hide details
      const hideDetailsButton = screen.getByText('Hide Details');
      await user.click(hideDetailsButton);

      expect(screen.queryByText('Session Details')).not.toBeInTheDocument();
    });

    it('shows scrobble timestamps in track details', async () => {
      const user = userEvent.setup();

      renderHistoryPageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('View Details')).toBeInTheDocument();
      });

      const viewDetailsButton = screen.getByText('View Details');
      await user.click(viewDetailsButton);

      expect(screen.getAllByText(/Scrobbled:/).length).toBeGreaterThan(0);
    });
  });

  describe('Refresh Functionality', () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: true, username: 'discogs_user' },
      lastfm: { authenticated: true, username: 'lastfm_user' },
    };

    it('allows refreshing the history', async () => {
      const user = userEvent.setup();

      const mockSessions = [createMockScrobbleSession('session1', 'completed')];
      mockApi.getScrobbleHistory.mockResolvedValue(mockSessions);

      renderHistoryPageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Refresh')).toBeInTheDocument();
      });

      const refreshButton = screen.getByText('Refresh');
      await user.click(refreshButton);

      expect(mockApi.getScrobbleHistory).toHaveBeenCalledTimes(2);
    });

    it('shows refreshing state when refresh is in progress', async () => {
      const user = userEvent.setup();

      // First call resolves normally, second call hangs
      mockApi.getScrobbleHistory.mockResolvedValueOnce([
        createMockScrobbleSession('session1', 'completed'),
      ]);
      mockApi.getScrobbleHistory.mockImplementationOnce(
        () => new Promise(() => {})
      ); // Second call never resolves

      renderHistoryPageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Refresh')).toBeInTheDocument();
      });

      const refreshButton = screen.getByText('Refresh');
      await user.click(refreshButton);

      expect(screen.getByText('Refreshing...')).toBeInTheDocument();
    });

    it('allows retrying when loading fails', async () => {
      const user = userEvent.setup();

      mockApi.getScrobbleHistory.mockRejectedValueOnce(
        new Error('Network error')
      );
      mockApi.getScrobbleHistory.mockResolvedValue([
        createMockScrobbleSession('session1', 'completed'),
      ]);

      renderHistoryPageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });

      const retryButton = screen.getByText('Retry');
      await user.click(retryButton);

      await waitFor(() => {
        expect(screen.getByText('completed')).toBeInTheDocument();
      });

      expect(mockApi.getScrobbleHistory).toHaveBeenCalledTimes(2);
    });
  });

  describe('Large Session Count', () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: true, username: 'discogs_user' },
      lastfm: { authenticated: true, username: 'lastfm_user' },
    };

    it('shows cleanup notice for large session counts', async () => {
      // Create more than 10 sessions
      const mockSessions = Array.from({ length: 15 }, (_, i) =>
        createMockScrobbleSession(`session${i + 1}`, 'completed')
      );

      mockApi.getScrobbleHistory.mockResolvedValue(mockSessions);

      renderHistoryPageWithProviders(authStatus);

      await waitFor(() => {
        expect(
          screen.getByText(
            'Showing recent sessions. Older sessions may be automatically cleaned up.'
          )
        ).toBeInTheDocument();
      });
    });

    it('does not show cleanup notice for small session counts', async () => {
      const mockSessions = Array.from({ length: 5 }, (_, i) =>
        createMockScrobbleSession(`session${i + 1}`, 'completed')
      );

      mockApi.getScrobbleHistory.mockResolvedValue(mockSessions);

      renderHistoryPageWithProviders(authStatus);

      await waitFor(() => {
        expect(
          screen.queryByText(
            'Showing recent sessions. Older sessions may be automatically cleaned up.'
          )
        ).not.toBeInTheDocument();
      });
    });
  });

  describe('Status Colors and Icons', () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: true, username: 'discogs_user' },
      lastfm: { authenticated: true, username: 'lastfm_user' },
    };

    it('displays correct status colors', async () => {
      const mockSessions = [
        createMockScrobbleSession('session1', 'completed'),
        createMockScrobbleSession('session2', 'failed'),
        createMockScrobbleSession('session3', 'pending'),
      ];

      mockApi.getScrobbleHistory.mockResolvedValue(mockSessions);

      renderHistoryPageWithProviders(authStatus);

      await waitFor(() => {
        const completedStatus = screen.getByText('completed');
        const failedStatus = screen.getByText('failed');
        const pendingStatus = screen.getByText('pending');

        expect(completedStatus).toHaveStyle('color: #28a745'); // Green
        expect(failedStatus).toHaveStyle('color: #dc3545'); // Red
        expect(pendingStatus).toHaveStyle('color: #ffc107'); // Yellow
      });
    });
  });

  describe('Date Formatting', () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: true, username: 'discogs_user' },
      lastfm: { authenticated: true, username: 'lastfm_user' },
    };

    it('formats dates using date utilities', async () => {
      const mockFormatLocalTimeClean =
        dateUtils.formatLocalTimeClean as jest.MockedFunction<
          typeof dateUtils.formatLocalTimeClean
        >;
      const mockGetTimezoneOffset =
        dateUtils.getTimezoneOffset as jest.MockedFunction<
          typeof dateUtils.getTimezoneOffset
        >;

      mockFormatLocalTimeClean.mockReturnValue('Jan 1, 2023 10:00 AM');
      mockGetTimezoneOffset.mockReturnValue('EST');

      const mockSessions = [createMockScrobbleSession('session1', 'completed')];
      mockApi.getScrobbleHistory.mockResolvedValue(mockSessions);

      renderHistoryPageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Jan 1, 2023 10:00 AM')).toBeInTheDocument();
        expect(screen.getByText('Times shown in EST')).toBeInTheDocument();
      });

      expect(mockFormatLocalTimeClean).toHaveBeenCalled();
      expect(mockGetTimezoneOffset).toHaveBeenCalled();
    });
  });
});
