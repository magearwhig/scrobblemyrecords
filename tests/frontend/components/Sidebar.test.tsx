import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import React from 'react';

import Sidebar from '../../../src/renderer/components/Sidebar';
import { AuthProvider } from '../../../src/renderer/context/AuthContext';
import { AuthStatus } from '../../../src/shared/types';

const createMockAuthContext = (authStatus: AuthStatus) => ({
  authStatus,
  setAuthStatus: jest.fn(),
});

const renderSidebarWithAuth = (
  authStatus: AuthStatus,
  currentPage: string = 'home',
  onPageChange: jest.Mock = jest.fn()
) => {
  const authContextValue = createMockAuthContext(authStatus);

  return {
    ...render(
      <AuthProvider value={authContextValue}>
        <Sidebar currentPage={currentPage} onPageChange={onPageChange} />
      </AuthProvider>
    ),
    authContextValue,
    onPageChange,
  };
};

describe('Sidebar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Navigation Items', () => {
    it('renders all navigation items', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      renderSidebarWithAuth(authStatus);

      expect(screen.getByText('Home')).toBeInTheDocument();
      expect(screen.getByText('Setup & Authentication')).toBeInTheDocument();
      expect(screen.getByText('Browse Collection')).toBeInTheDocument();
      expect(screen.getByText('Scrobble Tracks')).toBeInTheDocument();
      expect(screen.getByText('Scrobble History')).toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    it('shows correct icons for each navigation item', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      renderSidebarWithAuth(authStatus);

      expect(screen.getByText('🏠')).toBeInTheDocument(); // Home
      expect(screen.getByText('🔑')).toBeInTheDocument(); // Setup
      expect(screen.getByText('💿')).toBeInTheDocument(); // Collection
      expect(screen.getByText('🎵')).toBeInTheDocument(); // Scrobble
      expect(screen.getByText('📝')).toBeInTheDocument(); // History
      expect(screen.getByText('⚙️')).toBeInTheDocument(); // Settings
    });

    it('marks the current page as active', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      renderSidebarWithAuth(authStatus, 'collection');

      const collectionButton = screen
        .getByText('Browse Collection')
        .closest('button');
      expect(collectionButton).toHaveClass('active');

      const homeButton = screen.getByText('Home').closest('button');
      expect(homeButton).not.toHaveClass('active');
    });
  });

  describe('Authentication-based Enablement', () => {
    it('enables Home and Setup regardless of authentication status', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: false, username: undefined },
        lastfm: { authenticated: false, username: undefined },
      };

      renderSidebarWithAuth(authStatus);

      const homeButton = screen.getByText('Home').closest('button');
      const setupButton = screen
        .getByText('Setup & Authentication')
        .closest('button');
      const settingsButton = screen.getByText('Settings').closest('button');

      expect(homeButton).toBeEnabled();
      expect(setupButton).toBeEnabled();
      expect(settingsButton).toBeEnabled();
    });

    it('disables Collection when Discogs is not authenticated', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: false, username: undefined },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      renderSidebarWithAuth(authStatus);

      const collectionButton = screen
        .getByText('Browse Collection')
        .closest('button');
      expect(collectionButton).toBeDisabled();
      expect(collectionButton).toHaveClass('disabled');
    });

    it('enables Collection when Discogs is authenticated', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: false, username: undefined },
      };

      renderSidebarWithAuth(authStatus);

      const collectionButton = screen
        .getByText('Browse Collection')
        .closest('button');
      expect(collectionButton).toBeEnabled();
      expect(collectionButton).not.toHaveClass('disabled');
    });

    it('disables Scrobble when either service is not authenticated', () => {
      const authStatusPartial: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: false, username: undefined },
      };

      renderSidebarWithAuth(authStatusPartial);

      const scrobbleButton = screen
        .getByText('Scrobble Tracks')
        .closest('button');
      expect(scrobbleButton).toBeDisabled();
      expect(scrobbleButton).toHaveClass('disabled');
    });

    it('enables Scrobble when both services are authenticated', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      renderSidebarWithAuth(authStatus);

      const scrobbleButton = screen
        .getByText('Scrobble Tracks')
        .closest('button');
      expect(scrobbleButton).toBeEnabled();
      expect(scrobbleButton).not.toHaveClass('disabled');
    });

    it('disables History when Last.fm is not authenticated', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: false, username: undefined },
      };

      renderSidebarWithAuth(authStatus);

      const historyButton = screen
        .getByText('Scrobble History')
        .closest('button');
      expect(historyButton).toBeDisabled();
      expect(historyButton).toHaveClass('disabled');
    });

    it('enables History when Last.fm is authenticated', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: false, username: undefined },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      renderSidebarWithAuth(authStatus);

      const historyButton = screen
        .getByText('Scrobble History')
        .closest('button');
      expect(historyButton).toBeEnabled();
      expect(historyButton).not.toHaveClass('disabled');
    });
  });

  describe('Navigation Functionality', () => {
    it('calls onPageChange when enabled button is clicked', async () => {
      const user = userEvent.setup();
      const onPageChange = jest.fn();
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      renderSidebarWithAuth(authStatus, 'home', onPageChange);

      const settingsButton = screen.getByText('Settings').closest('button');
      await user.click(settingsButton!);

      expect(onPageChange).toHaveBeenCalledWith('settings');
    });

    it('does not call onPageChange when disabled button is clicked', async () => {
      const user = userEvent.setup();
      const onPageChange = jest.fn();
      const authStatus: AuthStatus = {
        discogs: { authenticated: false, username: undefined },
        lastfm: { authenticated: false, username: undefined },
      };

      renderSidebarWithAuth(authStatus, 'home', onPageChange);

      const collectionButton = screen
        .getByText('Browse Collection')
        .closest('button');
      await user.click(collectionButton!);

      expect(onPageChange).not.toHaveBeenCalled();
    });
  });

  describe('Status Section', () => {
    it('displays authentication status section', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: false, username: undefined },
      };

      renderSidebarWithAuth(authStatus);

      expect(screen.getByText('Status:')).toBeInTheDocument();
    });

    it('shows connected status for authenticated services', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      renderSidebarWithAuth(authStatus);

      expect(screen.getByText('Discogs: ✓ Connected')).toBeInTheDocument();
      expect(screen.getByText('Last.fm: ✓ Connected')).toBeInTheDocument();
    });

    it('shows not connected status for unauthenticated services', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: false, username: undefined },
        lastfm: { authenticated: false, username: undefined },
      };

      renderSidebarWithAuth(authStatus);

      expect(screen.getByText('Discogs: ✗ Not connected')).toBeInTheDocument();
      expect(screen.getByText('Last.fm: ✗ Not connected')).toBeInTheDocument();
    });

    it('applies correct colors to status text', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: false, username: undefined },
      };

      renderSidebarWithAuth(authStatus);

      const discogsStatus = screen.getByText('Discogs: ✓ Connected');
      const lastfmStatus = screen.getByText('Last.fm: ✗ Not connected');

      expect(discogsStatus).toHaveStyle('color: #28a745'); // Green for connected
      expect(lastfmStatus).toHaveStyle('color: #dc3545'); // Red for not connected
    });
  });

  describe('Visual Styling', () => {
    it('applies correct cursor styles for enabled and disabled buttons', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: false, username: undefined },
        lastfm: { authenticated: false, username: undefined },
      };

      renderSidebarWithAuth(authStatus);

      const homeButton = screen.getByText('Home').closest('button');
      const collectionButton = screen
        .getByText('Browse Collection')
        .closest('button');

      expect(homeButton).toHaveStyle('cursor: pointer');
      expect(collectionButton).toHaveStyle('cursor: not-allowed');
    });

    it('applies correct opacity for enabled and disabled buttons', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: false, username: undefined },
        lastfm: { authenticated: false, username: undefined },
      };

      renderSidebarWithAuth(authStatus);

      const homeButton = screen.getByText('Home').closest('button');
      const collectionButton = screen
        .getByText('Browse Collection')
        .closest('button');

      expect(homeButton).toHaveStyle('opacity: 1');
      expect(collectionButton).toHaveStyle('opacity: 0.5');
    });
  });
});
