import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { getApiService } from '../services/api';
import { formatLocalTimeClean, getTimezoneOffset } from '../utils/dateUtils';

const HomePage: React.FC = () => {
  const { authStatus, setAuthStatus } = useAuth();
  const { state } = useApp();
  const [serverStatus, setServerStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [serverError, setServerError] = useState<string>('');
  const [lastfmData, setLastfmData] = useState<{
    recentScrobbles: any[];
    topTracks: any[];
    topArtists: any[];
  }>({
    recentScrobbles: [],
    topTracks: [],
    topArtists: []
  });
  const [lastfmLoading, setLastfmLoading] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<'7day' | '1month' | '3month' | '6month' | '12month'>('7day');

  useEffect(() => {
    checkServerAndAuth();
  }, [state.serverUrl]);

  useEffect(() => {
    if (authStatus.lastfm.authenticated) {
      loadLastfmData();
    }
  }, [authStatus.lastfm.authenticated, selectedPeriod]);

  const checkServerAndAuth = async () => {
    try {
      setServerStatus('checking');
      const api = getApiService(state.serverUrl);
      
      // Check server health
      await api.healthCheck();
      setServerStatus('connected');
      
      // Get auth status
      const status = await api.getAuthStatus();
      setAuthStatus(status);
    } catch (error) {
      setServerStatus('error');
      setServerError(error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const loadLastfmData = async () => {
    if (!authStatus.lastfm.authenticated) return;
    
    try {
      setLastfmLoading(true);
      const api = getApiService(state.serverUrl);
      
      const [recentScrobbles, topTracks, topArtists] = await Promise.all([
        api.getLastfmRecentScrobbles(10),
        api.getLastfmTopTracks(selectedPeriod, 10),
        api.getLastfmTopArtists(selectedPeriod, 10)
      ]);
      
      setLastfmData({
        recentScrobbles,
        topTracks,
        topArtists
      });
    } catch (error) {
      console.error('Error loading Last.fm data:', error);
    } finally {
      setLastfmLoading(false);
    }
  };

  const getNextSteps = () => {
    if (serverStatus !== 'connected') {
      return ['Ensure the backend server is running', 'Check your connection'];
    }
    
    if (!authStatus.discogs.authenticated && !authStatus.lastfm.authenticated) {
      return [
        'Set up your Discogs and Last.fm API credentials',
        'Go to Setup & Authentication to get started'
      ];
    }
    
    if (!authStatus.discogs.authenticated) {
      return ['Complete Discogs authentication', 'Add your Discogs Personal Access Token'];
    }
    
    if (!authStatus.lastfm.authenticated) {
      return ['Complete Last.fm authentication', 'Connect your Last.fm account'];
    }
    
    return [
      'Browse your Discogs collection',
      'Select albums to scrobble to Last.fm',
      'View your scrobbling history'
    ];
  };

  const nextSteps = getNextSteps();

  return (
    <div>
      <div className="card">
        <h2>Welcome to Discogs to Last.fm Scrobbler</h2>
        <p>
          This application allows you to connect your Discogs collection with your Last.fm profile,
          enabling you to scrobble tracks from your physical music collection.
        </p>
        
        <div style={{ marginTop: '1.5rem' }}>
          <h3>Server Status</h3>
          {serverStatus === 'checking' && (
            <div className="loading">
              <div className="spinner"></div>
              Checking server connection...
            </div>
          )}
          
          {serverStatus === 'connected' && (
            <div className="success-message">
              ✓ Successfully connected to backend server
            </div>
          )}
          
          {serverStatus === 'error' && (
            <div className="error-message">
              ✗ Unable to connect to backend server: {serverError}
              <button 
                className="btn btn-small" 
                onClick={checkServerAndAuth}
                style={{ marginLeft: '1rem' }}
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </div>

      {serverStatus === 'connected' && (
        <div className="card">
          <h3>Authentication Status</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <h4>Discogs</h4>
              <div className={`status ${authStatus.discogs.authenticated ? 'connected' : 'disconnected'}`}>
                <span className="status-dot"></span>
                {authStatus.discogs.authenticated ? 'Connected' : 'Not connected'}
              </div>
              {authStatus.discogs.username && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                  User: {authStatus.discogs.username}
                </div>
              )}
            </div>
            
            <div>
              <h4>Last.fm</h4>
              <div className={`status ${authStatus.lastfm.authenticated ? 'connected' : 'disconnected'}`}>
                <span className="status-dot"></span>
                {authStatus.lastfm.authenticated ? 'Connected' : 'Not connected'}
              </div>
              {authStatus.lastfm.username && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                  User: {authStatus.lastfm.username}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {authStatus.lastfm.authenticated && (
        <div className="card">
          <h3>Your Last.fm Activity</h3>
          
          {lastfmLoading ? (
            <div className="loading">
              <div className="spinner"></div>
              Loading Last.fm data...
            </div>
          ) : (
            <>
              {/* Recent Scrobbles */}
              <div style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h4>Recent Scrobbles</h4>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Times shown in {getTimezoneOffset()}
                  </span>
                </div>
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {lastfmData.recentScrobbles.map((track, index) => (
                    <div 
                      key={index}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0.75rem',
                        borderBottom: index < lastfmData.recentScrobbles.length - 1 ? '1px solid var(--border-color)' : 'none',
                        backgroundColor: 'var(--bg-secondary)'
                      }}
                    >
                      {track.image?.[2]?.['#text'] && (
                        <img 
                          src={track.image[2]['#text']} 
                          alt={track.name}
                          style={{ 
                            width: '40px', 
                            height: '40px', 
                            marginRight: '1rem',
                            borderRadius: '4px'
                          }}
                        />
                      )}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '500', color: 'var(--text-primary)' }}>
                          {track.name}
                        </div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                          {track.artist['#text']}
                        </div>
                        {track.album && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {track.album['#text']}
                          </div>
                        )}
                      </div>
                      {track.date && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {formatLocalTimeClean(new Date(track.date['#text']))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Charts Period Selector */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ marginRight: '1rem', color: 'var(--text-secondary)' }}>Time Period:</label>
                <select 
                  value={selectedPeriod} 
                  onChange={(e) => setSelectedPeriod(e.target.value as any)}
                  style={{ 
                    padding: '0.5rem', 
                    borderRadius: '4px', 
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)'
                  }}
                >
                  <option value="7day">Last 7 Days</option>
                  <option value="1month">Last Month</option>
                  <option value="3month">Last 3 Months</option>
                  <option value="6month">Last 6 Months</option>
                  <option value="12month">Last Year</option>
                </select>
              </div>

              {/* Top Tracks and Artists */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                <div>
                  <h4>Top Tracks</h4>
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {lastfmData.topTracks.map((track, index) => (
                      <div 
                        key={index}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0.5rem',
                          borderBottom: index < lastfmData.topTracks.length - 1 ? '1px solid var(--border-color)' : 'none',
                          backgroundColor: 'var(--bg-secondary)'
                        }}
                      >
                        <div style={{ 
                          width: '24px', 
                          height: '24px', 
                          borderRadius: '50%', 
                          backgroundColor: 'var(--accent-color)',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.8rem',
                          fontWeight: 'bold',
                          marginRight: '0.75rem'
                        }}>
                          {index + 1}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '500', color: 'var(--text-primary)' }}>
                            {track.name}
                          </div>
                          <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                            {track.artist.name}
                          </div>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {track.playcount} plays
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4>Top Artists</h4>
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {lastfmData.topArtists.map((artist, index) => (
                      <div 
                        key={index}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0.5rem',
                          borderBottom: index < lastfmData.topArtists.length - 1 ? '1px solid var(--border-color)' : 'none',
                          backgroundColor: 'var(--bg-secondary)'
                        }}
                      >
                        <div style={{ 
                          width: '24px', 
                          height: '24px', 
                          borderRadius: '50%', 
                          backgroundColor: 'var(--accent-color)',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.8rem',
                          fontWeight: 'bold',
                          marginRight: '0.75rem'
                        }}>
                          {index + 1}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '500', color: 'var(--text-primary)' }}>
                            {artist.name}
                          </div>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {artist.playcount} plays
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <div className="card">
        <h3>Next Steps</h3>
        <ol style={{ paddingLeft: '1.5rem' }}>
          {nextSteps.map((step, index) => (
            <li key={index} style={{ marginBottom: '0.5rem' }}>
              {step}
            </li>
          ))}
        </ol>
      </div>

      <div className="card">
        <h3>How It Works</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
          <div>
            <h4>1. Connect Your Accounts</h4>
            <p>Link your Discogs and Last.fm accounts using API credentials.</p>
          </div>
          <div>
            <h4>2. Browse Your Collection</h4>
            <p>View and search through your Discogs collection.</p>
          </div>
          <div>
            <h4>3. Select & Scrobble</h4>
            <p>Choose albums or tracks to scrobble to your Last.fm profile.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;