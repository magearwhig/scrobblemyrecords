import React, { useState } from 'react';

import { useAuth } from '../../context/AuthContext';
import ApiService from '../../services/api';
import { createLogger } from '../../utils/logger';

const log = createLogger('SettingsConnectionsSection');

interface SettingsConnectionsSectionProps {
  api: ApiService;
}

const SettingsConnectionsSection: React.FC<SettingsConnectionsSectionProps> = ({
  api,
}) => {
  const { authStatus, setAuthStatus } = useAuth();
  const [loading, setLoading] = useState<string>('');
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Manual entry states
  const [discogsToken, setDiscogsToken] = useState('');
  const [discogsUsername, setDiscogsUsername] = useState('');
  const [lastfmToken, setLastfmToken] = useState('');

  const handleDiscogsAuth = async () => {
    setLoading('discogs');
    setMessage(null);

    try {
      // Get OAuth URL and open it in a new window
      const authUrl = await api.getDiscogsAuthUrl();
      log.debug('Discogs auth URL obtained');

      // Open auth URL in a new window
      const authWindow = window.open(
        authUrl,
        'discogs-auth',
        'width=600,height=600'
      );
      log.debug('Auth window opened', { success: !!authWindow });

      // Poll for authentication success
      const checkAuth = setInterval(async () => {
        try {
          if (authWindow?.closed) {
            clearInterval(checkAuth);
            // Wait a moment for the callback to complete, then retry multiple times
            let retryCount = 0;
            const maxRetries = 5;

            const checkStatus = async () => {
              try {
                log.debug(
                  `Checking Discogs auth status (attempt ${retryCount + 1})`
                );
                const newStatus = await api.getAuthStatus();
                log.debug('Discogs auth status checked', {
                  authenticated: newStatus.discogs.authenticated,
                });

                if (newStatus.discogs.authenticated) {
                  setAuthStatus(newStatus);
                  setMessage({
                    type: 'success',
                    text: `Successfully connected to Discogs as ${newStatus.discogs.username}`,
                  });
                  setLoading('');
                } else if (retryCount < maxRetries - 1) {
                  retryCount++;
                  setTimeout(checkStatus, 2000); // Wait 2 seconds before retry
                } else {
                  setMessage({
                    type: 'error',
                    text: 'Authentication was cancelled or failed',
                  });
                  setLoading('');
                }
              } catch {
                if (retryCount < maxRetries - 1) {
                  retryCount++;
                  setTimeout(checkStatus, 2000);
                } else {
                  log.error(
                    'Failed to check Discogs auth status after retries'
                  );
                  setMessage({
                    type: 'error',
                    text: 'Failed to check authentication status',
                  });
                  setLoading('');
                }
              }
            };

            setTimeout(checkStatus, 1000);
          }
        } catch {
          clearInterval(checkAuth);
          setMessage({
            type: 'error',
            text: 'Failed to check authentication status',
          });
          setLoading('');
        }
      }, 1000);

      // Timeout after 5 minutes
      setTimeout(() => {
        clearInterval(checkAuth);
        if (authWindow && !authWindow.closed) {
          authWindow.close();
        }
        if (loading === 'discogs') {
          setMessage({ type: 'error', text: 'Authentication timed out' });
          setLoading('');
        }
      }, 300000);
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Failed to start Discogs authentication',
      });
      setLoading('');
    }
  };

  const handleLastfmAuth = async () => {
    setLoading('lastfm');
    setMessage(null);

    try {
      // Get auth URL (using environment variable)
      const authUrl = await api.getLastfmAuthUrl();
      log.debug('Last.fm auth URL obtained');

      // Open auth URL in a new window
      const authWindow = window.open(
        authUrl,
        'lastfm-auth',
        'width=600,height=600'
      );
      log.debug('Last.fm auth window opened', { success: !!authWindow });

      // Poll for authentication success
      const checkAuth = setInterval(async () => {
        try {
          if (authWindow?.closed) {
            clearInterval(checkAuth);
            // Wait a moment for the callback to complete, then retry multiple times
            let retryCount = 0;
            const maxRetries = 5;

            const checkStatus = async () => {
              try {
                log.debug(
                  `Checking Last.fm auth status (attempt ${retryCount + 1})`
                );
                const newStatus = await api.getAuthStatus();
                log.debug('Last.fm auth status checked', {
                  authenticated: newStatus.lastfm.authenticated,
                });

                if (newStatus.lastfm.authenticated) {
                  setAuthStatus(newStatus);
                  setMessage({
                    type: 'success',
                    text: `Successfully connected to Last.fm as ${newStatus.lastfm.username}`,
                  });
                  setLoading('');
                } else if (retryCount < maxRetries - 1) {
                  retryCount++;
                  setTimeout(checkStatus, 2000); // Wait 2 seconds before retry
                } else {
                  setMessage({
                    type: 'error',
                    text: 'Last.fm authentication was cancelled or failed',
                  });
                  setLoading('');
                }
              } catch {
                if (retryCount < maxRetries - 1) {
                  retryCount++;
                  setTimeout(checkStatus, 2000);
                } else {
                  log.error(
                    'Failed to check Last.fm auth status after retries'
                  );
                  setMessage({
                    type: 'error',
                    text: 'Failed to check Last.fm authentication status',
                  });
                  setLoading('');
                }
              }
            };

            setTimeout(checkStatus, 1000);
          }
        } catch {
          clearInterval(checkAuth);
          log.error('Error during Last.fm auth polling');
          setMessage({
            type: 'error',
            text: 'Failed to check Last.fm authentication status',
          });
          setLoading('');
        }
      }, 1000);

      // Timeout after 5 minutes
      setTimeout(() => {
        clearInterval(checkAuth);
        if (authWindow && !authWindow.closed) {
          authWindow.close();
        }
        if (loading === 'lastfm') {
          setMessage({
            type: 'error',
            text: 'Last.fm authentication timed out',
          });
          setLoading('');
        }
      }, 300000);
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Failed to start Last.fm authentication',
      });
      setLoading('');
    }
  };

  const handleDiscogsPersonalTokenAuth = async () => {
    log.debug('Starting Discogs personal token auth');

    if (!discogsToken) {
      log.debug('No token provided');
      setMessage({
        type: 'error',
        text: 'Please enter your Personal Access Token',
      });
      return;
    }

    log.debug('Token provided, proceeding with auth');
    setLoading('discogs-personal');
    setMessage(null);

    try {
      // Add the "Discogs token=" prefix if not already present
      const formattedToken = discogsToken.startsWith('Discogs token=')
        ? discogsToken
        : `Discogs token=${discogsToken}`;

      log.debug('Saving Discogs token');
      await api.saveDiscogsToken(formattedToken, discogsUsername);
      log.debug('Token saved successfully');

      log.debug('Getting auth status');
      const newStatus = await api.getAuthStatus();
      log.debug('Auth status retrieved', {
        authenticated: newStatus.discogs.authenticated,
      });
      setAuthStatus(newStatus);

      setMessage({
        type: 'success',
        text: `Successfully connected to Discogs as ${discogsUsername || 'user'}`,
      });
      setDiscogsToken('');
      setDiscogsUsername('');
    } catch (error) {
      log.error('Discogs personal token auth error', error);
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Failed to connect to Discogs',
      });
    } finally {
      log.debug('Personal token auth flow complete');
      setLoading('');
    }
  };

  const handleLastfmManualAuth = async () => {
    if (!lastfmToken) {
      setMessage({ type: 'error', text: 'Please enter the Last.fm token' });
      return;
    }

    setLoading('lastfm-manual');
    setMessage(null);

    try {
      const result = await api.handleLastfmCallback(lastfmToken);

      // Update auth status
      const newStatus = await api.getAuthStatus();
      setAuthStatus(newStatus);

      setMessage({
        type: 'success',
        text: `Successfully connected to Last.fm as ${result.username}`,
      });
      setLastfmToken('');
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Failed to complete Last.fm authentication',
      });
    } finally {
      setLoading('');
    }
  };

  const handleClearAuth = async () => {
    setLoading('clear');
    setMessage(null);

    try {
      await api.clearAuth();

      // Update auth status
      const newStatus = await api.getAuthStatus();
      setAuthStatus(newStatus);

      setMessage({ type: 'success', text: 'All authentication data cleared' });
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Failed to clear authentication',
      });
    } finally {
      setLoading('');
    }
  };

  return (
    <div>
      {/* Introduction */}
      <div className='card'>
        <h3>Account Connections</h3>
        <p>
          Connect your Discogs and Last.fm accounts to enable scrobbling and
          collection management.
        </p>

        {message && (
          <div
            className={
              message.type === 'success' ? 'success-message' : 'error-message'
            }
          >
            {message.text}
          </div>
        )}
      </div>

      {/* Discogs Setup */}
      <div className='card'>
        <h3>Discogs</h3>
        <div style={{ marginBottom: '1rem' }}>
          <div
            className={`status ${authStatus.discogs.authenticated ? 'connected' : 'disconnected'}`}
          >
            <span className='status-dot'></span>
            {authStatus.discogs.authenticated
              ? `Connected as ${authStatus.discogs.username}`
              : 'Not connected'}
          </div>
        </div>

        <p>
          Connect to your Discogs account using OAuth. Your API credentials are
          already configured.
        </p>

        <button
          className='btn'
          onClick={handleDiscogsAuth}
          disabled={loading === 'discogs' || authStatus.discogs.authenticated}
        >
          {loading === 'discogs' ? 'Connecting...' : 'Connect to Discogs'}
        </button>

        {/* Manual Token Entry */}
        <div
          style={{
            marginTop: '1.5rem',
            padding: '1rem',
            backgroundColor: 'var(--bg-tertiary)',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
          }}
        >
          <h4>Alternative: Personal Access Token</h4>
          <p>
            If OAuth isn't working, you can use a Personal Access Token instead:
          </p>

          <div
            style={{
              marginBottom: '1rem',
              padding: '0.5rem',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '4px',
              border: '1px solid var(--border-color)',
            }}
          >
            <strong>How to get a Personal Access Token:</strong>
            <ol style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
              <li>
                Go to{' '}
                <a
                  href='https://discogs.com/settings/developers'
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  Discogs Developer Settings
                </a>
              </li>
              <li>Click "Generate new token"</li>
              <li>
                Copy just the token value (the part after "Discogs token=")
              </li>
            </ol>
          </div>

          <div className='form-group'>
            <label className='form-label'>Personal Access Token:</label>
            <input
              type='text'
              className='form-input'
              value={discogsToken}
              onChange={e => setDiscogsToken(e.target.value)}
              placeholder='your_token_here'
            />
            <small
              style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}
            >
              Just paste the token value (without the "Discogs token=" prefix)
            </small>
          </div>

          <div className='form-group'>
            <label className='form-label'>Your Discogs Username:</label>
            <input
              type='text'
              className='form-input'
              value={discogsUsername}
              onChange={e => setDiscogsUsername(e.target.value)}
              placeholder='your_discogs_username'
            />
            <small
              style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}
            >
              Your Discogs username (needed to access your collection)
            </small>
          </div>

          <button
            className='btn'
            onClick={() => {
              handleDiscogsPersonalTokenAuth();
            }}
            disabled={
              loading === 'discogs-personal' ||
              authStatus.discogs.authenticated ||
              !discogsToken ||
              !discogsUsername
            }
          >
            {loading === 'discogs-personal'
              ? 'Authenticating...'
              : 'Submit Personal Token'}
          </button>
        </div>
      </div>

      {/* Last.fm Setup */}
      <div className='card'>
        <h3>Last.fm</h3>
        <div style={{ marginBottom: '1rem' }}>
          <div
            className={`status ${authStatus.lastfm.authenticated ? 'connected' : 'disconnected'}`}
          >
            <span className='status-dot'></span>
            {authStatus.lastfm.authenticated
              ? `Connected as ${authStatus.lastfm.username}`
              : 'Not connected'}
          </div>
        </div>

        <p>
          Connect to your Last.fm account. Your API credentials are already
          configured.
        </p>

        <button
          className='btn'
          onClick={handleLastfmAuth}
          disabled={loading === 'lastfm' || authStatus.lastfm.authenticated}
        >
          {loading === 'lastfm' ? 'Connecting...' : 'Connect to Last.fm'}
        </button>

        {/* Manual Token Entry */}
        <div
          style={{
            marginTop: '1.5rem',
            padding: '1rem',
            backgroundColor: 'var(--bg-tertiary)',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
          }}
        >
          <h4>Manual Token Entry:</h4>
          <p>
            If the automatic flow doesn't work, get the authorization URL above,
            visit it, and paste the token from the URL here:
          </p>

          <div className='form-group'>
            <label className='form-label'>
              Token (from URL after authorization):
            </label>
            <input
              type='text'
              className='form-input'
              value={lastfmToken}
              onChange={e => setLastfmToken(e.target.value)}
              placeholder='token value from URL'
            />
          </div>

          <button
            className='btn'
            onClick={handleLastfmManualAuth}
            disabled={
              loading === 'lastfm-manual' ||
              authStatus.lastfm.authenticated ||
              !lastfmToken
            }
          >
            {loading === 'lastfm-manual'
              ? 'Authenticating...'
              : 'Submit Last.fm Token'}
          </button>
        </div>
      </div>

      {/* Clear Authentication */}
      <div className='card'>
        <h3>Clear Authentication</h3>
        <p>Remove all stored authentication data and start over.</p>
        <button
          className='btn btn-danger'
          onClick={handleClearAuth}
          disabled={loading === 'clear'}
        >
          {loading === 'clear' ? 'Clearing...' : 'Clear All Authentication'}
        </button>
      </div>
    </div>
  );
};

export default SettingsConnectionsSection;
