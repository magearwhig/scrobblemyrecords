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
      expect(screen.getByText('Discover')).toBeInTheDocument();
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
      expect(screen.getByText('Discard Pile')).toBeInTheDocument();

      // Listening group
      expect(screen.getByText('What to Play')).toBeInTheDocument();
      expect(screen.getByText('Scrobble History')).toBeInTheDocument();
      expect(screen.getByText('Stats Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Wrapped')).toBeInTheDocument();

      // Discover group
      expect(screen.getByText('Recommendations')).toBeInTheDocument();
      expect(screen.getByText('Marketplace')).toBeInTheDocument();
      expect(screen.getByText('Discovery')).toBeInTheDocument();

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
      expect(screen.getByText('📦')).toBeInTheDocument(); // Discard Pile
      expect(screen.getByText('🎲')).toBeInTheDocument(); // What to Play
      expect(screen.getByText('📝')).toBeInTheDocument(); // History
      expect(screen.getByText('📊')).toBeInTheDocument(); // Stats
      expect(screen.getByText('🎁')).toBeInTheDocument(); // Wrapped
      expect(screen.getByText('🏪')).toBeInTheDocument(); // Marketplace
      expect(screen.getByText('🔍')).toBeInTheDocument(); // Discovery
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

    it('disables Collection and Marketplace when Discogs is not authenticated', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: false, username: undefined },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      renderSidebarWithAuth(authStatus);

      const collectionButton = screen
        .getByText('Browse Collection')
        .closest('button');
      const marketplaceButton = screen
        .getByText('Marketplace')
        .closest('button');

      expect(collectionButton).toBeDisabled();
      expect(collectionButton).toHaveClass('disabled');
      expect(marketplaceButton).toBeDisabled();
      expect(marketplaceButton).toHaveClass('disabled');
    });

    it('enables Collection and Marketplace when Discogs is authenticated', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: false, username: undefined },
      };

      renderSidebarWithAuth(authStatus);

      const collectionButton = screen
        .getByText('Browse Collection')
        .closest('button');
      const marketplaceButton = screen
        .getByText('Marketplace')
        .closest('button');

      expect(collectionButton).toBeEnabled();
      expect(collectionButton).not.toHaveClass('disabled');
      expect(marketplaceButton).toBeEnabled();
      expect(marketplaceButton).not.toHaveClass('disabled');
    });

    it('disables What to Play when either service is not authenticated', () => {
      const authStatusPartial: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: false, username: undefined },
      };

      renderSidebarWithAuth(authStatusPartial);

      const whatToPlayButton = screen
        .getByText('What to Play')
        .closest('button');
      expect(whatToPlayButton).toBeDisabled();
      expect(whatToPlayButton).toHaveClass('disabled');
    });

    it('enables What to Play when both services are authenticated', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      renderSidebarWithAuth(authStatus);

      const whatToPlayButton = screen
        .getByText('What to Play')
        .closest('button');
      expect(whatToPlayButton).toBeEnabled();
      expect(whatToPlayButton).not.toHaveClass('disabled');
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

    it('disables Marketplace when Discogs is not authenticated (Discover group)', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: false, username: undefined },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      renderSidebarWithAuth(authStatus);

      const marketplaceButton = screen
        .getByText('Marketplace')
        .closest('button');

      expect(marketplaceButton).toBeDisabled();
      expect(marketplaceButton).toHaveClass('disabled');
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
