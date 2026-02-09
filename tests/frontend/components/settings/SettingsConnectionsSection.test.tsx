import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import React from 'react';

import SettingsConnectionsSection from '../../../../src/renderer/components/settings/SettingsConnectionsSection';
import { AuthProvider } from '../../../../src/renderer/context/AuthContext';
import ApiService from '../../../../src/renderer/services/api';

jest.mock('../../../../src/renderer/services/api');

const mockApi = {
  getDiscogsAuthUrl: jest.fn(),
  getLastfmAuthUrl: jest.fn(),
  saveDiscogsToken: jest.fn(),
  handleLastfmCallback: jest.fn(),
  getAuthStatus: jest.fn(),
  clearAuth: jest.fn(),
} as unknown as ApiService;

const createMockAuthContext = (
  authenticated: { discogs: boolean; lastfm: boolean } = {
    discogs: false,
    lastfm: false,
  }
) => ({
  authStatus: {
    discogs: {
      authenticated: authenticated.discogs,
      username: authenticated.discogs ? 'discogs_user' : undefined,
    },
    lastfm: {
      authenticated: authenticated.lastfm,
      username: authenticated.lastfm ? 'lastfm_user' : undefined,
    },
  },
  setAuthStatus: jest.fn(),
});

const renderWithProviders = (
  authenticated: { discogs: boolean; lastfm: boolean } = {
    discogs: false,
    lastfm: false,
  }
) => {
  const mockAuthValue = createMockAuthContext(authenticated);
  return render(
    <AuthProvider value={mockAuthValue}>
      <SettingsConnectionsSection api={mockApi} />
    </AuthProvider>
  );
};

describe('SettingsConnectionsSection', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    jest.clearAllMocks();
    user = userEvent.setup();
  });

  describe('Rendering', () => {
    it('renders the Account Connections heading', () => {
      renderWithProviders();

      expect(screen.getByText('Account Connections')).toBeInTheDocument();
    });

    it('renders Discogs section', () => {
      renderWithProviders();

      expect(screen.getByText('Discogs')).toBeInTheDocument();
      expect(screen.getByText('Connect to Discogs')).toBeInTheDocument();
    });

    it('renders Last.fm section', () => {
      renderWithProviders();

      expect(screen.getByText('Last.fm')).toBeInTheDocument();
      expect(screen.getByText('Connect to Last.fm')).toBeInTheDocument();
    });

    it('renders Clear Authentication section', () => {
      renderWithProviders();

      expect(screen.getByText('Clear Authentication')).toBeInTheDocument();
      expect(screen.getByText('Clear All Authentication')).toBeInTheDocument();
    });

    it('shows Not connected status when not authenticated', () => {
      renderWithProviders();

      const notConnectedElements = screen.getAllByText('Not connected');
      expect(notConnectedElements.length).toBeGreaterThan(0);
    });

    it('shows Connected status when authenticated', () => {
      renderWithProviders({ discogs: true, lastfm: true });

      expect(screen.getByText('Connected as discogs_user')).toBeInTheDocument();
      expect(screen.getByText('Connected as lastfm_user')).toBeInTheDocument();
    });
  });

  describe('Personal Access Token Section', () => {
    it('renders personal access token input for Discogs', () => {
      renderWithProviders();

      expect(
        screen.getByText('Alternative: Personal Access Token')
      ).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText('your_token_here')
      ).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText('your_discogs_username')
      ).toBeInTheDocument();
    });

    it('allows entering Discogs personal token', async () => {
      renderWithProviders();

      const tokenInput = screen.getByPlaceholderText('your_token_here');
      await user.clear(tokenInput);
      await user.type(tokenInput, 'test_token');

      expect(tokenInput).toHaveValue('test_token');
    });

    it('allows entering Discogs username', async () => {
      renderWithProviders();

      const usernameInput = screen.getByPlaceholderText(
        'your_discogs_username'
      );
      await user.clear(usernameInput);
      await user.type(usernameInput, 'test_user');

      expect(usernameInput).toHaveValue('test_user');
    });

    it('disables Submit Personal Token button when fields are empty', () => {
      renderWithProviders();

      const submitButton = screen.getByText('Submit Personal Token');
      expect(submitButton).toBeDisabled();
    });

    it('enables Submit Personal Token button when both fields are filled', async () => {
      renderWithProviders();

      const tokenInput = screen.getByPlaceholderText('your_token_here');
      const usernameInput = screen.getByPlaceholderText(
        'your_discogs_username'
      );

      await user.clear(tokenInput);
      await user.type(tokenInput, 'test_token');
      await user.clear(usernameInput);
      await user.type(usernameInput, 'test_user');

      const submitButton = screen.getByText('Submit Personal Token');
      expect(submitButton).not.toBeDisabled();
    });

    it('submits personal token successfully', async () => {
      (mockApi.saveDiscogsToken as jest.Mock).mockResolvedValue(undefined);
      (mockApi.getAuthStatus as jest.Mock).mockResolvedValue({
        discogs: { authenticated: true, username: 'test_user' },
        lastfm: { authenticated: false },
      });

      renderWithProviders();

      const tokenInput = screen.getByPlaceholderText('your_token_here');
      const usernameInput = screen.getByPlaceholderText(
        'your_discogs_username'
      );

      await user.clear(tokenInput);
      await user.type(tokenInput, 'test_token');
      await user.clear(usernameInput);
      await user.type(usernameInput, 'test_user');

      const submitButton = screen.getByText('Submit Personal Token');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockApi.saveDiscogsToken).toHaveBeenCalledWith(
          'Discogs token=test_token',
          'test_user'
        );
      });

      await waitFor(() => {
        expect(
          screen.getByText('Successfully connected to Discogs as test_user')
        ).toBeInTheDocument();
      });
    });

    it('shows error message when personal token submission fails', async () => {
      (mockApi.saveDiscogsToken as jest.Mock).mockRejectedValue(
        new Error('Invalid token')
      );

      renderWithProviders();

      const tokenInput = screen.getByPlaceholderText('your_token_here');
      const usernameInput = screen.getByPlaceholderText(
        'your_discogs_username'
      );

      await user.clear(tokenInput);
      await user.type(tokenInput, 'bad_token');
      await user.clear(usernameInput);
      await user.type(usernameInput, 'test_user');

      const submitButton = screen.getByText('Submit Personal Token');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Invalid token')).toBeInTheDocument();
      });
    });
  });

  describe('Last.fm Manual Token Section', () => {
    it('renders manual token entry for Last.fm', () => {
      renderWithProviders();

      expect(screen.getByText('Manual Token Entry:')).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText('token value from URL')
      ).toBeInTheDocument();
    });

    it('allows entering Last.fm token', async () => {
      renderWithProviders();

      const tokenInput = screen.getByPlaceholderText('token value from URL');
      await user.clear(tokenInput);
      await user.type(tokenInput, 'lastfm_token');

      expect(tokenInput).toHaveValue('lastfm_token');
    });

    it('disables Submit Last.fm Token button when field is empty', () => {
      renderWithProviders();

      const submitButton = screen.getByText('Submit Last.fm Token');
      expect(submitButton).toBeDisabled();
    });

    it('enables Submit Last.fm Token button when field is filled', async () => {
      renderWithProviders();

      const tokenInput = screen.getByPlaceholderText('token value from URL');
      await user.clear(tokenInput);
      await user.type(tokenInput, 'lastfm_token');

      const submitButton = screen.getByText('Submit Last.fm Token');
      expect(submitButton).not.toBeDisabled();
    });

    it('submits Last.fm token successfully', async () => {
      (mockApi.handleLastfmCallback as jest.Mock).mockResolvedValue({
        username: 'lastfm_user',
      });
      (mockApi.getAuthStatus as jest.Mock).mockResolvedValue({
        discogs: { authenticated: false },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      });

      renderWithProviders();

      const tokenInput = screen.getByPlaceholderText('token value from URL');
      await user.clear(tokenInput);
      await user.type(tokenInput, 'valid_token');

      const submitButton = screen.getByText('Submit Last.fm Token');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockApi.handleLastfmCallback).toHaveBeenCalledWith(
          'valid_token'
        );
      });

      await waitFor(() => {
        expect(
          screen.getByText('Successfully connected to Last.fm as lastfm_user')
        ).toBeInTheDocument();
      });
    });

    it('shows error message when Last.fm token submission fails', async () => {
      (mockApi.handleLastfmCallback as jest.Mock).mockRejectedValue(
        new Error('Token expired')
      );

      renderWithProviders();

      const tokenInput = screen.getByPlaceholderText('token value from URL');
      await user.clear(tokenInput);
      await user.type(tokenInput, 'expired_token');

      const submitButton = screen.getByText('Submit Last.fm Token');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Token expired')).toBeInTheDocument();
      });
    });
  });

  describe('Clear Authentication', () => {
    it('clears all authentication data', async () => {
      (mockApi.clearAuth as jest.Mock).mockResolvedValue(undefined);
      (mockApi.getAuthStatus as jest.Mock).mockResolvedValue({
        discogs: { authenticated: false },
        lastfm: { authenticated: false },
      });

      renderWithProviders({ discogs: true, lastfm: true });

      const clearButton = screen.getByText('Clear All Authentication');
      await user.click(clearButton);

      await waitFor(() => {
        expect(mockApi.clearAuth).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(
          screen.getByText('All authentication data cleared')
        ).toBeInTheDocument();
      });
    });

    it('shows error message when clearing authentication fails', async () => {
      (mockApi.clearAuth as jest.Mock).mockRejectedValue(
        new Error('Failed to clear')
      );

      renderWithProviders({ discogs: true, lastfm: true });

      const clearButton = screen.getByText('Clear All Authentication');
      await user.click(clearButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to clear')).toBeInTheDocument();
      });
    });
  });

  describe('Button States', () => {
    it('disables Connect to Discogs button when already authenticated', () => {
      renderWithProviders({ discogs: true, lastfm: false });

      const connectButton = screen.getByText('Connect to Discogs');
      expect(connectButton).toBeDisabled();
    });

    it('disables Connect to Last.fm button when already authenticated', () => {
      renderWithProviders({ discogs: false, lastfm: true });

      const connectButton = screen.getByText('Connect to Last.fm');
      expect(connectButton).toBeDisabled();
    });
  });
});
