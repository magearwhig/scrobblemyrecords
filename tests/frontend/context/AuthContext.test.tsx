import React from 'react';
import { render, screen } from '@testing-library/react';
import { AuthProvider, useAuth } from '../../../src/renderer/context/AuthContext';
import { AuthStatus } from '../../../src/shared/types';

const mockAuthStatus: AuthStatus = {
  discogs: {
    authenticated: true,
    username: 'testuser'
  },
  lastfm: {
    authenticated: false,
    username: undefined
  }
};

const TestComponent: React.FC = () => {
  const { authStatus, setAuthStatus } = useAuth();
  
  return (
    <div>
      <div data-testid="discogs-auth">{authStatus.discogs.authenticated.toString()}</div>
      <div data-testid="discogs-username">{authStatus.discogs.username || 'no-username'}</div>
      <div data-testid="lastfm-auth">{authStatus.lastfm.authenticated.toString()}</div>
      <button onClick={() => setAuthStatus({
        ...authStatus,
        lastfm: { authenticated: true, username: 'lastfmuser' }
      })}>
        Update LastFM
      </button>
    </div>
  );
};

describe('AuthContext', () => {
  it('provides auth status and setter function', () => {
    const setAuthStatus = jest.fn();
    const contextValue = {
      authStatus: mockAuthStatus,
      setAuthStatus
    };

    render(
      <AuthProvider value={contextValue}>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByTestId('discogs-auth')).toHaveTextContent('true');
    expect(screen.getByTestId('discogs-username')).toHaveTextContent('testuser');
    expect(screen.getByTestId('lastfm-auth')).toHaveTextContent('false');
  });

  it('calls setAuthStatus when state is updated', () => {
    const setAuthStatus = jest.fn();
    const contextValue = {
      authStatus: mockAuthStatus,
      setAuthStatus
    };

    render(
      <AuthProvider value={contextValue}>
        <TestComponent />
      </AuthProvider>
    );

    const updateButton = screen.getByText('Update LastFM');
    updateButton.click();

    expect(setAuthStatus).toHaveBeenCalledTimes(1);
    expect(setAuthStatus).toHaveBeenCalledWith({
      discogs: {
        authenticated: true,
        username: 'testuser'
      },
      lastfm: {
        authenticated: true,
        username: 'lastfmuser'
      }
    });
  });

  it('throws error when useAuth is used outside provider', () => {
    const TestComponentWithoutProvider = () => {
      useAuth();
      return <div>Test</div>;
    };

    // Suppress console.error for this test since we expect an error
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<TestComponentWithoutProvider />);
    }).toThrow('useAuth must be used within an AuthProvider');

    consoleSpy.mockRestore();
  });

  it('handles undefined username correctly', () => {
    const authStatusWithUndefinedUsername: AuthStatus = {
      discogs: {
        authenticated: false,
        username: undefined
      },
      lastfm: {
        authenticated: false,
        username: undefined
      }
    };

    const contextValue = {
      authStatus: authStatusWithUndefinedUsername,
      setAuthStatus: jest.fn()
    };

    render(
      <AuthProvider value={contextValue}>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByTestId('discogs-username')).toHaveTextContent('no-username');
  });

  it('renders children correctly', () => {
    const contextValue = {
      authStatus: mockAuthStatus,
      setAuthStatus: jest.fn()
    };

    render(
      <AuthProvider value={contextValue}>
        <div data-testid="child-element">Child Component</div>
      </AuthProvider>
    );

    expect(screen.getByTestId('child-element')).toHaveTextContent('Child Component');
  });
});