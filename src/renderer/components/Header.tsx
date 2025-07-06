import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const Header: React.FC = () => {
  const { authStatus } = useAuth();
  const { isDarkMode, toggleDarkMode } = useTheme();
  const appVersion = '1.0.0'; // Static version for web app

  const getConnectionStatus = () => {
    const discogsConnected = authStatus.discogs.authenticated;
    const lastfmConnected = authStatus.lastfm.authenticated;
    
    if (discogsConnected && lastfmConnected) {
      return { status: 'connected', text: 'All services connected' };
    } else if (discogsConnected || lastfmConnected) {
      return { status: 'partial', text: 'Partially connected' };
    } else {
      return { status: 'disconnected', text: 'Not connected' };
    }
  };

  const connectionStatus = getConnectionStatus();

  return (
    <header className="header">
      <div>
        <h1>Discogs to Last.fm Scrobbler</h1>
        {appVersion && <small style={{ opacity: 0.8 }}>v{appVersion}</small>}
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button
          onClick={() => {
            console.log('Dark mode button clicked, current state:', isDarkMode);
            toggleDarkMode();
          }}
          className="btn btn-small btn-secondary"
          style={{ 
            minWidth: 'auto', 
            padding: '0.5rem', 
            fontSize: '1.2rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isDarkMode ? '#333' : '#666'
          }}
          title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDarkMode ? '☀️' : '🌙'}
        </button>
        
        <div className={`status ${connectionStatus.status === 'connected' ? 'connected' : 'disconnected'}`}>
          <span className="status-dot"></span>
          {connectionStatus.text}
        </div>
        
        {authStatus.discogs.username && (
          <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>
            <strong>Discogs:</strong> {authStatus.discogs.username}
          </div>
        )}
        
        {authStatus.lastfm.username && (
          <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>
            <strong>Last.fm:</strong> {authStatus.lastfm.username}
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;