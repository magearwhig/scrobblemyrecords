import React, { useEffect } from 'react';

import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../routes';

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
  disabledReason?: string;
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

  const discogsReason = !authStatus.discogs.authenticated
    ? 'Connect Discogs first'
    : undefined;
  const lastfmReason = !authStatus.lastfm.authenticated
    ? 'Connect Last.fm first'
    : undefined;
  const bothReason =
    !authStatus.discogs.authenticated && !authStatus.lastfm.authenticated
      ? 'Connect Discogs and Last.fm first'
      : discogsReason || lastfmReason;

  const navCategories: NavCategory[] = [
    {
      label: 'Dashboard',
      items: [
        {
          id: ROUTES.HOME,
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
          id: ROUTES.COLLECTION,
          label: 'Browse Collection',
          icon: '💿',
          enabled: authStatus.discogs.authenticated,
          disabledReason: discogsReason,
        },
        {
          id: ROUTES.WISHLIST,
          label: 'Wishlist',
          icon: '❤️',
          enabled: authStatus.discogs.authenticated,
          disabledReason: discogsReason,
        },
        {
          id: ROUTES.DISCARD_PILE,
          label: 'Discard Pile',
          icon: '📦',
          enabled: authStatus.discogs.authenticated,
          disabledReason: discogsReason,
        },
      ],
    },
    {
      label: 'Listening',
      items: [
        {
          id: ROUTES.SUGGESTIONS,
          label: 'Play Suggestions',
          icon: '🎲',
          enabled:
            authStatus.discogs.authenticated && authStatus.lastfm.authenticated,
          disabledReason: bothReason,
        },
        {
          id: ROUTES.HISTORY,
          label: 'Scrobble History',
          icon: '📝',
          enabled: authStatus.lastfm.authenticated,
          disabledReason: lastfmReason,
        },
        {
          id: ROUTES.STATS,
          label: 'Stats Dashboard',
          icon: '📊',
          enabled: authStatus.lastfm.authenticated,
          disabledReason: lastfmReason,
        },
      ],
    },
    {
      label: 'Explore',
      items: [
        {
          id: ROUTES.DISCOVERY,
          label: 'Discovery',
          icon: '🔍',
          enabled: authStatus.lastfm.authenticated,
          disabledReason: lastfmReason,
        },
        {
          id: ROUTES.RELEASES,
          label: 'New Releases',
          icon: '📢',
          enabled: authStatus.discogs.authenticated,
          disabledReason: discogsReason,
        },
        {
          id: ROUTES.SELLERS,
          label: 'Local Sellers',
          icon: '🏪',
          enabled: authStatus.discogs.authenticated,
          disabledReason: discogsReason,
        },
      ],
    },
    {
      label: 'System',
      items: [
        {
          id: ROUTES.SETTINGS,
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
                  title={
                    !item.enabled && item.disabledReason
                      ? item.disabledReason
                      : collapsed
                        ? item.label
                        : undefined
                  }
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
