import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { getApiService } from '../services/api';

const SetupPage: React.FC = () => {
  const { authStatus, setAuthStatus } = useAuth();
  const { state, dispatch } = useApp();
  const [loading, setLoading] = useState<string>('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Manual entry states
  const [discogsToken, setDiscogsToken] = useState('');
  const [discogsUsername, setDiscogsUsername] = useState('');
  const [lastfmToken, setLastfmToken] = useState('');

  const api = getApiService(state.serverUrl);

  const handleDiscogsAuth = async () => {
    setLoading('discogs');
    setMessage(null);

    try {
      // Get OAuth URL and open it in a new window
      const authUrl = await api.getDiscogsAuthUrl();
      console.log('Discogs auth URL:', authUrl);
      
      // Open auth URL in a new window
      const authWindow = window.open(authUrl, 'discogs-auth', 'width=600,height=600');
      console.log('Auth window opened:', authWindow);
      
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
                console.log(`Checking auth status (attempt ${retryCount + 1})...`);
                const newStatus = await api.getAuthStatus();
                console.log('Auth status:', newStatus);
                
                if (newStatus.discogs.authenticated) {
                  setAuthStatus(newStatus);
                  setMessage({ type: 'success', text: `Successfully connected to Discogs as ${newStatus.discogs.username}` });
                  setLoading('');
                } else if (retryCount < maxRetries - 1) {
                  retryCount++;
                  setTimeout(checkStatus, 2000); // Wait 2 seconds before retry
                } else {
                  setMessage({ type: 'error', text: 'Authentication was cancelled or failed' });
                  setLoading('');
                }
              } catch (error) {
                if (retryCount < maxRetries - 1) {
                  retryCount++;
                  setTimeout(checkStatus, 2000);
                } else {
                  console.error('Failed to check auth status:', error);
                  setMessage({ type: 'error', text: 'Failed to check authentication status' });
                  setLoading('');
                }
              }
            };
            
            setTimeout(checkStatus, 1000);
          }
        } catch (error) {
          clearInterval(checkAuth);
          setMessage({ type: 'error', text: 'Failed to check authentication status' });
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
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to start Discogs authentication' });
      setLoading('');
    }
  };

  const handleLastfmAuth = async () => {
    setLoading('lastfm');
    setMessage(null);

    try {
      // Get auth URL (using environment variable)
      const authUrl = await api.getLastfmAuthUrl();
      console.log('Last.fm auth URL:', authUrl);
      
      // Open auth URL in a new window
      const authWindow = window.open(authUrl, 'lastfm-auth', 'width=600,height=600');
      console.log('Last.fm auth window opened:', authWindow);
      
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
                console.log(`Checking Last.fm auth status (attempt ${retryCount + 1})...`);
                const newStatus = await api.getAuthStatus();
                console.log('Last.fm auth status:', newStatus);
                
                if (newStatus.lastfm.authenticated) {
                  setAuthStatus(newStatus);
                  setMessage({ type: 'success', text: `Successfully connected to Last.fm as ${newStatus.lastfm.username}` });
                  setLoading('');
                } else if (retryCount < maxRetries - 1) {
                  retryCount++;
                  setTimeout(checkStatus, 2000); // Wait 2 seconds before retry
                } else {
                  setMessage({ type: 'error', text: 'Last.fm authentication was cancelled or failed' });
                  setLoading('');
                }
              } catch (error) {
                if (retryCount < maxRetries - 1) {
                  retryCount++;
                  setTimeout(checkStatus, 2000);
                } else {
                  console.error('Failed to check Last.fm auth status:', error);
                  setMessage({ type: 'error', text: 'Failed to check Last.fm authentication status' });
                  setLoading('');
                }
              }
            };
            
            setTimeout(checkStatus, 1000);
          }
        } catch (error) {
          clearInterval(checkAuth);
          setMessage({ type: 'error', text: 'Failed to check Last.fm authentication status' });
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
          setMessage({ type: 'error', text: 'Last.fm authentication timed out' });
          setLoading('');
        }
      }, 300000);
      
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to start Last.fm authentication' });
      setLoading('');
    }
  };

  const handleLastfmCallback = async (token: string) => {
    setLoading('lastfm-callback');
    setMessage(null);

    try {
      const result = await api.handleLastfmCallback(token);
      
      // Update auth status
      const newStatus = await api.getAuthStatus();
      setAuthStatus(newStatus);
      
      setMessage({ type: 'success', text: `Successfully connected to Last.fm as ${result.username}` });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to complete Last.fm authentication' });
    } finally {
      setLoading('');
    }
  };

  const handleDiscogsManualAuth = async () => {
    if (!discogsToken) {
      setMessage({ type: 'error', text: 'Please enter the URL from after authorization' });
      return;
    }

    setLoading('discogs-manual');
    setMessage(null);

    try {
      // Parse the URL to extract parameters
      let oauthToken = '';
      let oauthVerifier = '';
      
      try {
        const url = new URL(discogsToken);
        oauthToken = url.searchParams.get('oauth_token') || '';
        oauthVerifier = url.searchParams.get('oauth_verifier') || '';
        
        // If no verifier, maybe it's still in the authorization page
        if (!oauthVerifier) {
          // Try to extract token from authorization URL format
          const tokenMatch = discogsToken.match(/oauth_token=([^&]+)/);
          if (tokenMatch) {
            oauthToken = tokenMatch[1];
            setMessage({ type: 'error', text: 'This appears to be the authorization URL. Please authorize the app first and then paste the resulting URL.' });
            setLoading('');
            return;
          }
        }
      } catch (urlError) {
        // If URL parsing fails, try to extract from query string format
        const tokenMatch = discogsToken.match(/oauth_token=([^&]+)/);
        const verifierMatch = discogsToken.match(/oauth_verifier=([^&]+)/);
        
        if (tokenMatch) oauthToken = tokenMatch[1];
        if (verifierMatch) oauthVerifier = verifierMatch[1];
      }

      if (!oauthToken) {
        setMessage({ type: 'error', text: 'Could not find oauth_token in the URL. Please make sure you pasted the complete URL.' });
        setLoading('');
        return;
      }

      if (!oauthVerifier) {
        setMessage({ type: 'error', text: 'Could not find oauth_verifier in the URL. Please make sure you authorized the app and pasted the resulting URL.' });
        setLoading('');
        return;
      }

      console.log('Extracted tokens:', { oauthToken, oauthVerifier });

      // Use the callback API directly with extracted tokens
      const response = await fetch(`${state.serverUrl}/api/v1/auth/discogs/callback?oauth_token=${encodeURIComponent(oauthToken)}&oauth_verifier=${encodeURIComponent(oauthVerifier)}`);
      
      if (response.ok) {
        // Check auth status
        const newStatus = await api.getAuthStatus();
        setAuthStatus(newStatus);
        
        if (newStatus.discogs.authenticated) {
          setMessage({ type: 'success', text: `Successfully connected to Discogs as ${newStatus.discogs.username}` });
          setDiscogsToken('');
        } else {
          setMessage({ type: 'error', text: 'Authentication failed' });
        }
      } else {
        const errorText = await response.text();
        console.error('Discogs auth response:', errorText);
        setMessage({ type: 'error', text: 'Failed to authenticate with Discogs' });
      }
    } catch (error) {
      console.error('Discogs manual auth error:', error);
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to authenticate with Discogs' });
    } finally {
      setLoading('');
    }
  };

  const handleDiscogsPersonalTokenAuth = async () => {
    console.log('Starting Discogs personal token auth...');
    
    if (!discogsToken) {
      console.log('No token provided');
      setMessage({ type: 'error', text: 'Please enter your Personal Access Token' });
      return;
    }

    console.log('Token provided:', discogsToken);
    setLoading('discogs-personal');
    setMessage(null);

    try {
      // Add the "Discogs token=" prefix if not already present
      const formattedToken = discogsToken.startsWith('Discogs token=') 
        ? discogsToken 
        : `Discogs token=${discogsToken}`;
      
      console.log('Saving Discogs token with format:', formattedToken);
      await api.saveDiscogsToken(formattedToken, discogsUsername);
      console.log('Token saved successfully');
      
      console.log('Getting auth status...');
      const newStatus = await api.getAuthStatus();
      console.log('New auth status:', newStatus);
      setAuthStatus(newStatus);
      
      setMessage({ type: 'success', text: `Successfully connected to Discogs as ${discogsUsername || 'user'}` });
      setDiscogsToken('');
      setDiscogsUsername('');
    } catch (error) {
      console.error('Discogs personal token auth error:', error);
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to connect to Discogs' });
    } finally {
      console.log('Setting loading to false');
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
      
      setMessage({ type: 'success', text: `Successfully connected to Last.fm as ${result.username}` });
      setLastfmToken('');
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to complete Last.fm authentication' });
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
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to clear authentication' });
    } finally {
      setLoading('');
    }
  };

  return (
    <div>
      <div className="card">
        <h2>Setup & Authentication</h2>
        <p>
          To use this application, you need to set up API access for both Discogs and Last.fm.
          Follow the instructions below to get your API credentials.
        </p>
        
        {message && (
          <div className={message.type === 'success' ? 'success-message' : 'error-message'}>
            {message.text}
          </div>
        )}
      </div>

      {/* Discogs Setup */}
      <div className="card">
        <h3>1. Discogs Setup</h3>
        <div style={{ marginBottom: '1rem' }}>
          <div className={`status ${authStatus.discogs.authenticated ? 'connected' : 'disconnected'}`}>
            <span className="status-dot"></span>
            {authStatus.discogs.authenticated 
              ? `Connected as ${authStatus.discogs.username}` 
              : 'Not connected'
            }
          </div>
        </div>

        <p>
          Connect to your Discogs account using OAuth. Your API credentials are already configured.
        </p>
        <p><strong>Instructions:</strong></p>
        <ol>
          <li>Click "Connect to Discogs" to get the authorization URL (or it will open in a popup)</li>
          <li>Visit the URL and authorize the application</li>
          <li>If automatic flow doesn't work, copy the tokens from the URL and use manual entry below</li>
        </ol>

        <button 
          className="btn"
          onClick={handleDiscogsAuth}
          disabled={loading === 'discogs' || authStatus.discogs.authenticated}
        >
          {loading === 'discogs' ? 'Connecting...' : 'Connect to Discogs'}
        </button>

        {/* Manual Token Entry */}
        <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <h4>Alternative: Personal Access Token</h4>
          <p>If OAuth isn't working, you can use a Personal Access Token instead:</p>
          
          <div style={{ marginBottom: '1rem', padding: '0.5rem', backgroundColor: 'var(--bg-secondary)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
            <strong>How to get a Personal Access Token:</strong>
            <ol style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
              <li>Go to <a href="https://discogs.com/settings/developers" target="_blank" rel="noopener noreferrer">Discogs Developer Settings</a></li>
              <li>Click "Generate new token"</li>
              <li>Copy just the token value (the part after "Discogs token=")</li>
            </ol>
          </div>
          
          <div className="form-group">
            <label className="form-label">Personal Access Token:</label>
            <input
              type="text"
              className="form-input"
              value={discogsToken}
              onChange={(e) => setDiscogsToken(e.target.value)}
              placeholder="your_token_here"
            />
            <small style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Just paste the token value (without the "Discogs token=" prefix)
            </small>
          </div>

          <div className="form-group">
            <label className="form-label">Your Discogs Username:</label>
            <input
              type="text"
              className="form-input"
              value={discogsUsername}
              onChange={(e) => setDiscogsUsername(e.target.value)}
              placeholder="your_discogs_username"
            />
            <small style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Your Discogs username (needed to access your collection)
            </small>
          </div>

          <button 
            className="btn"
            onClick={() => {
              console.log('Button clicked!');
              handleDiscogsPersonalTokenAuth();
            }}
            disabled={loading === 'discogs-personal' || authStatus.discogs.authenticated || !discogsToken || !discogsUsername}
          >
            {loading === 'discogs-personal' ? 'Authenticating...' : 'Submit Personal Token'}
          </button>
        </div>
      </div>

      {/* Last.fm Setup */}
      <div className="card">
        <h3>2. Last.fm Setup</h3>
        <div style={{ marginBottom: '1rem' }}>
          <div className={`status ${authStatus.lastfm.authenticated ? 'connected' : 'disconnected'}`}>
            <span className="status-dot"></span>
            {authStatus.lastfm.authenticated 
              ? `Connected as ${authStatus.lastfm.username}` 
              : 'Not connected'
            }
          </div>
        </div>

        <p>
          Connect to your Last.fm account. Your API credentials are already configured.
        </p>
        <p><strong>Instructions:</strong></p>
        <ol>
          <li>Click "Connect to Last.fm" to get the authorization URL (or it will open in a popup)</li>
          <li>Visit the URL and authorize the application</li>
          <li>If automatic flow doesn't work, copy the token from the URL and use manual entry below</li>
        </ol>

        <button 
          className="btn"
          onClick={handleLastfmAuth}
          disabled={loading === 'lastfm' || authStatus.lastfm.authenticated}
        >
          {loading === 'lastfm' ? 'Connecting...' : 'Connect to Last.fm'}
        </button>

        {/* Manual Token Entry */}
        <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <h4>Manual Token Entry:</h4>
          <p>If the automatic flow doesn't work, get the authorization URL above, visit it, and paste the token from the URL here:</p>
          
          <div className="form-group">
            <label className="form-label">Token (from URL after authorization):</label>
            <input
              type="text"
              className="form-input"
              value={lastfmToken}
              onChange={(e) => setLastfmToken(e.target.value)}
              placeholder="token value from URL"
            />
          </div>

          <button 
            className="btn"
            onClick={handleLastfmManualAuth}
            disabled={loading === 'lastfm-manual' || authStatus.lastfm.authenticated || !lastfmToken}
          >
            {loading === 'lastfm-manual' ? 'Authenticating...' : 'Submit Last.fm Token'}
          </button>
        </div>
      </div>

      {/* Clear Authentication */}
      <div className="card">
        <h3>Clear Authentication</h3>
        <p>Remove all stored authentication data and start over.</p>
        <button 
          className="btn btn-danger"
          onClick={handleClearAuth}
          disabled={loading === 'clear'}
        >
          {loading === 'clear' ? 'Clearing...' : 'Clear All Authentication'}
        </button>
      </div>
    </div>
  );
};

export default SetupPage;