import React from 'react';

import { useAuth } from '../context/AuthContext';

interface SidebarProps {
  currentPage: string;
  onPageChange: (page: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentPage, onPageChange }) => {
  const { authStatus } = useAuth();

  const menuItems = [
    {
      id: 'home',
      label: 'Home',
      icon: '🏠',
      enabled: true,
    },
    {
      id: 'setup',
      label: 'Setup & Authentication',
      icon: '🔑',
      enabled: true,
    },
    {
      id: 'collection',
      label: 'Browse Collection',
      icon: '💿',
      enabled: authStatus.discogs.authenticated,
    },
    {
      id: 'suggestions',
      label: 'Play Suggestions',
      icon: '🎲',
      enabled:
        authStatus.discogs.authenticated && authStatus.lastfm.authenticated,
    },
    {
      id: 'scrobble',
      label: 'Scrobble Tracks',
      icon: '🎵',
      enabled:
        authStatus.discogs.authenticated && authStatus.lastfm.authenticated,
    },
    {
      id: 'history',
      label: 'Scrobble History',
      icon: '📝',
      enabled: authStatus.lastfm.authenticated,
    },
    {
      id: 'discovery',
      label: 'Discovery',
      icon: '🔍',
      enabled: authStatus.lastfm.authenticated,
    },
    {
      id: 'stats',
      label: 'Stats Dashboard',
      icon: '📊',
      enabled: authStatus.lastfm.authenticated,
    },
    {
      id: 'wishlist',
      label: 'Wishlist',
      icon: '❤️',
      enabled: authStatus.discogs.authenticated,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: '⚙️',
      enabled: true,
    },
  ];

  return (
    <nav className='sidebar'>
      <ul className='nav-menu'>
        {menuItems.map(item => (
          <li key={item.id} className='nav-item'>
            <button
              className={`nav-link ${currentPage === item.id ? 'active' : ''} ${!item.enabled ? 'disabled' : ''}`}
              onClick={() => {
                if (item.enabled) {
                  onPageChange(item.id);
                  window.location.hash = item.id;
                }
              }}
              disabled={!item.enabled}
              style={{
                width: '100%',
                textAlign: 'left',
                border: 'none',
                background: 'none',
                cursor: item.enabled ? 'pointer' : 'not-allowed',
                opacity: item.enabled ? 1 : 0.5,
              }}
            >
              <span style={{ marginRight: '0.75rem' }}>{item.icon}</span>
              {item.label}
            </button>
          </li>
        ))}
      </ul>

      <div
        style={{
          marginTop: '2rem',
          padding: '1rem 0',
          borderTop: '1px solid #e0e0e0',
        }}
      >
        <div
          style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem' }}
        >
          <strong>Status:</strong>
        </div>
        <div style={{ fontSize: '0.8rem', lineHeight: '1.4' }}>
          <div
            style={{
              color: authStatus.discogs.authenticated ? '#28a745' : '#dc3545',
            }}
          >
            Discogs:{' '}
            {authStatus.discogs.authenticated
              ? '✓ Connected'
              : '✗ Not connected'}
          </div>
          <div
            style={{
              color: authStatus.lastfm.authenticated ? '#28a745' : '#dc3545',
            }}
          >
            Last.fm:{' '}
            {authStatus.lastfm.authenticated
              ? '✓ Connected'
              : '✗ Not connected'}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Sidebar;
