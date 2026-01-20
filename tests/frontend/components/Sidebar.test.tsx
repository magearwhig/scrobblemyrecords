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
  onPageChange: jest.Mock = jest.fn(),
  collapsed: boolean = false,
  onCollapsedChange: jest.Mock = jest.fn()
) => {
  const authContextValue = createMockAuthContext(authStatus);

  return {
    ...render(
      <AuthProvider value={authContextValue}>
        <Sidebar
          currentPage={currentPage}
          onPageChange={onPageChange}
          collapsed={collapsed}
          onCollapsedChange={onCollapsedChange}
        />
      </AuthProvider>
    ),
    authContextValue,
    onPageChange,
    onCollapsedChange,
  };
};

describe('Sidebar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Category Headers', () => {
    it('renders category headers for navigation groups', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      renderSidebarWithAuth(authStatus);

      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Library')).toBeInTheDocument();
      expect(screen.getByText('Listening')).toBeInTheDocument();
      expect(screen.getByText('Explore')).toBeInTheDocument();
      expect(screen.getByText('System')).toBeInTheDocument();
    });
  });

  describe('Navigation Items', () => {
    it('renders all navigation items in correct groups', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      renderSidebarWithAuth(authStatus);

      // Dashboard group
      expect(screen.getByText('Home')).toBeInTheDocument();

      // Library group
      expect(screen.getByText('Browse Collection')).toBeInTheDocument();
      expect(screen.getByText('Wishlist')).toBeInTheDocument();

      // Listening group
      expect(screen.getByText('Play Suggestions')).toBeInTheDocument();
      expect(screen.getByText('Scrobble History')).toBeInTheDocument();
      expect(screen.getByText('Stats Dashboard')).toBeInTheDocument();

      // Explore group
      expect(screen.getByText('Discovery')).toBeInTheDocument();
      expect(screen.getByText('New Releases')).toBeInTheDocument();
      expect(screen.getByText('Local Sellers')).toBeInTheDocument();

      // System group
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    it('does not render removed navigation items (Setup, Scrobble Tracks)', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      renderSidebarWithAuth(authStatus);

      expect(
        screen.queryByText('Setup & Authentication')
      ).not.toBeInTheDocument();
      expect(screen.queryByText('Scrobble Tracks')).not.toBeInTheDocument();
    });

    it('shows correct icons for each navigation item', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      renderSidebarWithAuth(authStatus);

      expect(screen.getByText('🏠')).toBeInTheDocument(); // Home
      expect(screen.getByText('💿')).toBeInTheDocument(); // Collection
      expect(screen.getByText('❤️')).toBeInTheDocument(); // Wishlist
      expect(screen.getByText('🎲')).toBeInTheDocument(); // Suggestions
      expect(screen.getByText('📝')).toBeInTheDocument(); // History
      expect(screen.getByText('📊')).toBeInTheDocument(); // Stats
      expect(screen.getByText('🔍')).toBeInTheDocument(); // Discovery
      expect(screen.getByText('📢')).toBeInTheDocument(); // New Releases
      expect(screen.getByText('🏪')).toBeInTheDocument(); // Local Sellers
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
    it('enables Home and Settings regardless of authentication status', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: false, username: undefined },
        lastfm: { authenticated: false, username: undefined },
      };

      renderSidebarWithAuth(authStatus);

      const homeButton = screen.getByText('Home').closest('button');
      const settingsButton = screen.getByText('Settings').closest('button');

      expect(homeButton).toBeEnabled();
      expect(settingsButton).toBeEnabled();
    });

    it('disables Collection and Wishlist when Discogs is not authenticated', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: false, username: undefined },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      renderSidebarWithAuth(authStatus);

      const collectionButton = screen
        .getByText('Browse Collection')
        .closest('button');
      const wishlistButton = screen.getByText('Wishlist').closest('button');

      expect(collectionButton).toBeDisabled();
      expect(collectionButton).toHaveClass('disabled');
      expect(wishlistButton).toBeDisabled();
      expect(wishlistButton).toHaveClass('disabled');
    });

    it('enables Collection and Wishlist when Discogs is authenticated', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: false, username: undefined },
      };

      renderSidebarWithAuth(authStatus);

      const collectionButton = screen
        .getByText('Browse Collection')
        .closest('button');
      const wishlistButton = screen.getByText('Wishlist').closest('button');

      expect(collectionButton).toBeEnabled();
      expect(collectionButton).not.toHaveClass('disabled');
      expect(wishlistButton).toBeEnabled();
      expect(wishlistButton).not.toHaveClass('disabled');
    });

    it('disables Play Suggestions when either service is not authenticated', () => {
      const authStatusPartial: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: false, username: undefined },
      };

      renderSidebarWithAuth(authStatusPartial);

      const suggestionsButton = screen
        .getByText('Play Suggestions')
        .closest('button');
      expect(suggestionsButton).toBeDisabled();
      expect(suggestionsButton).toHaveClass('disabled');
    });

    it('enables Play Suggestions when both services are authenticated', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      renderSidebarWithAuth(authStatus);

      const suggestionsButton = screen
        .getByText('Play Suggestions')
        .closest('button');
      expect(suggestionsButton).toBeEnabled();
      expect(suggestionsButton).not.toHaveClass('disabled');
    });

    it('disables History, Discovery, and Stats when Last.fm is not authenticated', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: false, username: undefined },
      };

      renderSidebarWithAuth(authStatus);

      const historyButton = screen
        .getByText('Scrobble History')
        .closest('button');
      const discoveryButton = screen.getByText('Discovery').closest('button');
      const statsButton = screen.getByText('Stats Dashboard').closest('button');

      expect(historyButton).toBeDisabled();
      expect(historyButton).toHaveClass('disabled');
      expect(discoveryButton).toBeDisabled();
      expect(discoveryButton).toHaveClass('disabled');
      expect(statsButton).toBeDisabled();
      expect(statsButton).toHaveClass('disabled');
    });

    it('enables History, Discovery, and Stats when Last.fm is authenticated', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: false, username: undefined },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      renderSidebarWithAuth(authStatus);

      const historyButton = screen
        .getByText('Scrobble History')
        .closest('button');
      const discoveryButton = screen.getByText('Discovery').closest('button');
      const statsButton = screen.getByText('Stats Dashboard').closest('button');

      expect(historyButton).toBeEnabled();
      expect(historyButton).not.toHaveClass('disabled');
      expect(discoveryButton).toBeEnabled();
      expect(discoveryButton).not.toHaveClass('disabled');
      expect(statsButton).toBeEnabled();
      expect(statsButton).not.toHaveClass('disabled');
    });

    it('disables New Releases and Local Sellers when Discogs is not authenticated', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: false, username: undefined },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      renderSidebarWithAuth(authStatus);

      const releasesButton = screen.getByText('New Releases').closest('button');
      const sellersButton = screen.getByText('Local Sellers').closest('button');

      expect(releasesButton).toBeDisabled();
      expect(releasesButton).toHaveClass('disabled');
      expect(sellersButton).toBeDisabled();
      expect(sellersButton).toHaveClass('disabled');
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

    it('applies correct CSS classes to status items', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: false, username: undefined },
      };

      renderSidebarWithAuth(authStatus);

      const discogsStatus = screen.getByText('Discogs: ✓ Connected');
      const lastfmStatus = screen.getByText('Last.fm: ✗ Not connected');

      expect(discogsStatus).toHaveClass('sidebar-status-connected');
      expect(lastfmStatus).toHaveClass('sidebar-status-disconnected');
    });
  });
});
