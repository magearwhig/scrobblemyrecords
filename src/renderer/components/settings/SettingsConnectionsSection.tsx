import React, { useEffect, useRef, useState } from 'react';

import { useAuth } from '../../context/AuthContext';
import ApiService from '../../services/api';
import { createLogger } from '../../utils/logger';
import { Button } from '../ui/Button';

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

  // Timers of the sign-in in progress, so a new attempt, a timeout or leaving
  // the page stops them
  const authTimersRef = useRef<{
    interval?: ReturnType<typeof setInterval>;
    timeouts: ReturnType<typeof setTimeout>[];
  }>({ timeouts: [] });

  // Bumped whenever an attempt ends or is replaced; a reply that arrives for
  // an older attempt is ignored
  const authAttemptRef = useRef(0);

  const stopAuthTimers = () => {
    authAttemptRef.current++;
    const timers = authTimersRef.current;
    if (timers.interval) clearInterval(timers.interval);
    timers.timeouts.forEach(clearTimeout);
    authTimersRef.current = { timeouts: [] };
  };

  useEffect(() => stopAuthTimers, []);

  /** Sign in through a popup, then poll the backend until it sees the account */
  const startPopupAuth = async (service: 'discogs' | 'lastfm') => {
    const name = service === 'discogs' ? 'Discogs' : 'Last.fm';
    stopAuthTimers();
    const attempt = authAttemptRef.current;
    const isCurrent = () => attempt === authAttemptRef.current;
    setLoading(service);
    setMessage(null);

    const fail = (text: string) => {
      if (!isCurrent()) return;
      stopAuthTimers();
      setMessage({ type: 'error', text });
      setLoading('');
    };
    const later = (fn: () => void, ms: number) => {
      authTimersRef.current.timeouts.push(setTimeout(fn, ms));
    };

    try {
      const authUrl =
        service === 'discogs'
          ? await api.getDiscogsAuthUrl()
          : await api.getLastfmAuthUrl();
      log.debug(`${name} auth URL obtained`);
      if (!isCurrent()) return;

      const authWindow = window.open(
        authUrl,
        `${service}-auth`,
        'width=600,height=600'
      );
      log.debug(`${name} auth window opened`, { success: !!authWindow });
      if (!authWindow) {
        fail(
          `The ${name} sign-in window was blocked. Allow pop-ups for this site and try again.`
        );
        return;
      }

      // Once the popup closes, give the callback a moment, then check a few times
      const maxRetries = 5;
      let retryCount = 0;
      const checkStatus = async () => {
        try {
          log.debug(`Checking ${name} auth status (attempt ${retryCount + 1})`);
          const newStatus = await api.getAuthStatus();
          if (!isCurrent()) return;
          if (newStatus[service].authenticated) {
            stopAuthTimers();
            setAuthStatus(newStatus);
            setMessage({
              type: 'success',
              text: `Successfully connected to ${name} as ${newStatus[service].username}`,
            });
            setLoading('');
          } else if (retryCount < maxRetries - 1) {
            retryCount++;
            later(checkStatus, 2000);
          } else {
            fail(`${name} authentication was cancelled or failed`);
          }
        } catch {
          if (!isCurrent()) return;
          if (retryCount < maxRetries - 1) {
            retryCount++;
            later(checkStatus, 2000);
          } else {
            log.error(`Failed to check ${name} auth status after retries`);
            fail(`Failed to check ${name} authentication status`);
          }
        }
      };

      authTimersRef.current.interval = setInterval(() => {
        if (authWindow.closed) {
          clearInterval(authTimersRef.current.interval);
          authTimersRef.current.interval = undefined;
          later(checkStatus, 1000);
        }
      }, 1000);

      later(() => {
        if (!authWindow.closed) authWindow.close();
        fail(`${name} authentication timed out`);
      }, 300000);
    } catch (error) {
      fail(
        error instanceof Error
          ? error.message
          : `Failed to start ${name} authentication`
      );
    }
  };

  const handleDiscogsAuth = () => startPopupAuth('discogs');
  const handleLastfmAuth = () => startPopupAuth('lastfm');

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
        <div className='status-margin-bottom'>
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

        <Button
          onClick={handleDiscogsAuth}
          disabled={loading === 'discogs' || authStatus.discogs.authenticated}
        >
          {loading === 'discogs' ? 'Connecting...' : 'Connect to Discogs'}
        </Button>

        {/* Manual Token Entry */}
        <div className='alternative-method-section'>
          <h4>Alternative: Personal Access Token</h4>
          <p>
            If OAuth isn't working, you can use a Personal Access Token instead:
          </p>

          <div className='instructions-box'>
            <strong>How to get a Personal Access Token:</strong>
            <ol className='instructions-list'>
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
            <small className='form-helper-text'>
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
            <small className='form-helper-text'>
              Your Discogs username (needed to access your collection)
            </small>
          </div>

          <Button
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
          </Button>
        </div>
      </div>

      {/* Last.fm Setup */}
      <div className='card'>
        <h3>Last.fm</h3>
        <div className='status-margin-bottom'>
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

        <Button
          onClick={handleLastfmAuth}
          disabled={loading === 'lastfm' || authStatus.lastfm.authenticated}
        >
          {loading === 'lastfm' ? 'Connecting...' : 'Connect to Last.fm'}
        </Button>

        {/* Manual Token Entry */}
        <div className='alternative-method-section'>
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

          <Button
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
          </Button>
        </div>
      </div>

      {/* Clear Authentication */}
      <div className='card'>
        <h3>Clear Authentication</h3>
        <p>Remove all stored authentication data and start over.</p>
        <Button
          variant='danger'
          onClick={handleClearAuth}
          disabled={loading === 'clear'}
        >
          {loading === 'clear' ? 'Clearing...' : 'Clear All Authentication'}
        </Button>
      </div>
    </div>
  );
};

export default SettingsConnectionsSection;
