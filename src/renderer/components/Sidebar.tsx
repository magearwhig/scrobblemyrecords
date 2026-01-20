import React, { useEffect } from 'react';

import { useAuth } from '../context/AuthContext';

interface SidebarProps {
  currentPage: string;
  onPageChange: (page: string) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: string;
  enabled: boolean;
}

interface NavCategory {
  label: string;
  items: NavItem[];
}

const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onPageChange,
  collapsed,
  onCollapsedChange,
}) => {
  const { authStatus } = useAuth();

  const handleToggleCollapse = () => {
    onCollapsedChange(!collapsed);
  };

  // Auto-collapse on narrow viewports
  useEffect(() => {
    const checkViewport = () => {
      if (window.innerWidth < 768 && !collapsed) {
        onCollapsedChange(true);
      }
    };
    checkViewport();
    // Only run on initial mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navCategories: NavCategory[] = [
    {
      label: 'Dashboard',
      items: [
        {
          id: 'home',
          label: 'Home',
          icon: '🏠',
          enabled: true,
        },
      ],
    },
    {
      label: 'Library',
      items: [
        {
          id: 'collection',
          label: 'Browse Collection',
          icon: '💿',
          enabled: authStatus.discogs.authenticated,
        },
        {
          id: 'wishlist',
          label: 'Wishlist',
          icon: '❤️',
          enabled: authStatus.discogs.authenticated,
        },
        {
          id: 'discard-pile',
          label: 'Discard Pile',
          icon: '📦',
          enabled: authStatus.discogs.authenticated,
        },
      ],
    },
    {
      label: 'Listening',
      items: [
        {
          id: 'suggestions',
          label: 'Play Suggestions',
          icon: '🎲',
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
          id: 'stats',
          label: 'Stats Dashboard',
          icon: '📊',
          enabled: authStatus.lastfm.authenticated,
        },
      ],
    },
    {
      label: 'Explore',
      items: [
        {
          id: 'discovery',
          label: 'Discovery',
          icon: '🔍',
          enabled: authStatus.lastfm.authenticated,
        },
        {
          id: 'releases',
          label: 'New Releases',
          icon: '📢',
          enabled: authStatus.discogs.authenticated,
        },
        {
          id: 'sellers',
          label: 'Local Sellers',
          icon: '🏪',
          enabled: authStatus.discogs.authenticated,
        },
      ],
    },
    {
      label: 'System',
      items: [
        {
          id: 'settings',
          label: 'Settings',
          icon: '⚙️',
          enabled: true,
        },
      ],
    },
  ];

  return (
    <nav className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
      <button
        className='sidebar-toggle'
        onClick={handleToggleCollapse}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <span className='sidebar-toggle-icon'>{collapsed ? '→' : '←'}</span>
      </button>

      <ul className='nav-menu'>
        {navCategories.map(category => (
          <React.Fragment key={category.label}>
            {!collapsed && (
              <li className='nav-category-header'>{category.label}</li>
            )}
            {category.items.map(item => (
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
                  title={collapsed ? item.label : undefined}
                >
                  <span className='nav-link-icon'>{item.icon}</span>
                  {!collapsed && (
                    <span className='nav-link-label'>{item.label}</span>
                  )}
                </button>
              </li>
            ))}
          </React.Fragment>
        ))}
      </ul>

      <div className='sidebar-status'>
        {!collapsed && <div className='sidebar-status-label'>Status:</div>}
        <div
          className={`sidebar-status-item ${authStatus.discogs.authenticated ? 'sidebar-status-connected' : 'sidebar-status-disconnected'}`}
          title={
            collapsed
              ? `Discogs: ${authStatus.discogs.authenticated ? 'Connected' : 'Not connected'}`
              : undefined
          }
        >
          {collapsed ? (
            <span className='sidebar-status-icon'>
              {authStatus.discogs.authenticated ? '✓' : '✗'}
            </span>
          ) : (
            <>
              Discogs:{' '}
              {authStatus.discogs.authenticated
                ? '✓ Connected'
                : '✗ Not connected'}
            </>
          )}
        </div>
        <div
          className={`sidebar-status-item ${authStatus.lastfm.authenticated ? 'sidebar-status-connected' : 'sidebar-status-disconnected'}`}
          title={
            collapsed
              ? `Last.fm: ${authStatus.lastfm.authenticated ? 'Connected' : 'Not connected'}`
              : undefined
          }
        >
          {collapsed ? (
            <span className='sidebar-status-icon'>
              {authStatus.lastfm.authenticated ? '✓' : '✗'}
            </span>
          ) : (
            <>
              Last.fm:{' '}
              {authStatus.lastfm.authenticated
                ? '✓ Connected'
                : '✗ Not connected'}
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Sidebar;
