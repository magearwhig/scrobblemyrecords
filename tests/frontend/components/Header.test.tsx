import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import React from 'react';

import Header from '../../../src/renderer/components/Header';
import { AuthProvider } from '../../../src/renderer/context/AuthContext';
import { AuthStatus } from '../../../src/shared/types';

// Mock console.log to avoid noise in tests
const mockConsoleLog = jest.fn();
jest.spyOn(console, 'log').mockImplementation(mockConsoleLog);

// Mock ThemeContext
const mockToggleDarkMode = jest.fn();
const mockUseTheme = {
  isDarkMode: false,
  toggleDarkMode: mockToggleDarkMode,
};

jest.mock('../../../src/renderer/context/ThemeContext', () => ({
  useTheme: () => mockUseTheme,
}));

const createMockAuthContext = (authStatus: AuthStatus) => ({
  authStatus,
  setAuthStatus: jest.fn(),
});

const renderHeaderWithProviders = (
  authStatus: AuthStatus,
  isDarkMode: boolean = false
) => {
  mockUseTheme.isDarkMode = isDarkMode;
  mockUseTheme.toggleDarkMode = mockToggleDarkMode;

  const authContextValue = createMockAuthContext(authStatus);

  return {
    ...render(
      <AuthProvider value={authContextValue}>
        <Header />
      </AuthProvider>
    ),
    authContextValue,
    themeContextValue: mockUseTheme,
  };
};

describe('Header', () => {
  afterEach(() => {
    mockConsoleLog.mockClear();
  });

  it('renders the application title and version', () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: false, username: undefined },
      lastfm: { authenticated: false, username: undefined },
    };

    renderHeaderWithProviders(authStatus);

    expect(
      screen.getByText('Discogs to Last.fm Scrobbler')
    ).toBeInTheDocument();
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
  });

  it('shows "All services connected" when both services are authenticated', () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: true, username: 'discogs_user' },
      lastfm: { authenticated: true, username: 'lastfm_user' },
    };

    renderHeaderWithProviders(authStatus);

    expect(screen.getByText('All services connected')).toBeInTheDocument();
    expect(screen.getByText('Discogs:')).toBeInTheDocument();
    expect(screen.getByText('discogs_user')).toBeInTheDocument();
    expect(screen.getByText('Last.fm:')).toBeInTheDocument();
    expect(screen.getByText('lastfm_user')).toBeInTheDocument();
  });

  it('shows "Partially connected" when only one service is authenticated', () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: true, username: 'discogs_user' },
      lastfm: { authenticated: false, username: undefined },
    };

    renderHeaderWithProviders(authStatus);

    expect(screen.getByText('Partially connected')).toBeInTheDocument();
    expect(screen.getByText('Discogs:')).toBeInTheDocument();
    expect(screen.getByText('discogs_user')).toBeInTheDocument();
    expect(screen.queryByText('Last.fm:')).not.toBeInTheDocument();
  });

  it('shows "Not connected" when no services are authenticated', () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: false, username: undefined },
      lastfm: { authenticated: false, username: undefined },
    };

    renderHeaderWithProviders(authStatus);

    expect(screen.getByText('Not connected')).toBeInTheDocument();
    expect(screen.queryByText('Discogs:')).not.toBeInTheDocument();
    expect(screen.queryByText('Last.fm:')).not.toBeInTheDocument();
  });

  it('toggles dark mode when the theme button is clicked', async () => {
    const user = userEvent.setup();
    const authStatus: AuthStatus = {
      discogs: { authenticated: false, username: undefined },
      lastfm: { authenticated: false, username: undefined },
    };

    const { themeContextValue } = renderHeaderWithProviders(authStatus, false);

    const themeButton = screen.getByTitle('Switch to dark mode');
    expect(themeButton).toHaveTextContent('🌙');

    await user.click(themeButton);

    expect(themeContextValue.toggleDarkMode).toHaveBeenCalledTimes(1);
  });

  it('shows sun emoji when in dark mode', () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: false, username: undefined },
      lastfm: { authenticated: false, username: undefined },
    };

    renderHeaderWithProviders(authStatus, true);

    const themeButton = screen.getByTitle('Switch to light mode');
    expect(themeButton).toHaveTextContent('☀️');
  });

  it('applies correct CSS classes for connection status', () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: true, username: 'test_user' },
      lastfm: { authenticated: true, username: 'test_user' },
    };

    renderHeaderWithProviders(authStatus);

    const statusElement = screen
      .getByText('All services connected')
      .closest('.status');
    expect(statusElement).toHaveClass('connected');
  });

  it('applies disconnected CSS class when services are not connected', () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: false, username: undefined },
      lastfm: { authenticated: false, username: undefined },
    };

    renderHeaderWithProviders(authStatus);

    const statusElement = screen.getByText('Not connected').closest('.status');
    expect(statusElement).toHaveClass('disconnected');
  });

  it('handles partial connection with Last.fm only', () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: false, username: undefined },
      lastfm: { authenticated: true, username: 'lastfm_user' },
    };

    renderHeaderWithProviders(authStatus);

    expect(screen.getByText('Partially connected')).toBeInTheDocument();
    expect(screen.queryByText('Discogs:')).not.toBeInTheDocument();
    expect(screen.getByText('Last.fm:')).toBeInTheDocument();
    expect(screen.getByText('lastfm_user')).toBeInTheDocument();
  });

  it('renders status dot element', () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: false, username: undefined },
      lastfm: { authenticated: false, username: undefined },
    };

    renderHeaderWithProviders(authStatus);

    const statusDot = document.querySelector('.status-dot');
    expect(statusDot).toBeInTheDocument();
  });

  it('applies correct CSS classes to theme button', () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: false, username: undefined },
      lastfm: { authenticated: false, username: undefined },
    };

    // Test light mode
    renderHeaderWithProviders(authStatus, false);
    let themeButton = screen.getByTitle('Switch to dark mode');
    expect(themeButton).toHaveClass(
      'btn',
      'btn-small',
      'btn-secondary',
      'header-theme-toggle'
    );

    // Test dark mode
    renderHeaderWithProviders(authStatus, true);
    themeButton = screen.getByTitle('Switch to light mode');
    expect(themeButton).toHaveClass(
      'btn',
      'btn-small',
      'btn-secondary',
      'header-theme-toggle'
    );
  });
});
