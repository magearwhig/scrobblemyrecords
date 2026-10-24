import { Menu, Moon, ScanSearch, Sun, X } from 'lucide-react';
import React from 'react';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useNotifications } from '../hooks/useNotifications';
import { navigate, ROUTES } from '../routes';

import { CheckRecordSearch } from './checkRecord/CheckRecordSearch';
import { NotificationBell } from './NotificationBell';

interface HeaderProps {
  /** Phone layout: show the button that opens the navigation drawer */
  showMenuButton?: boolean;
  menuOpen?: boolean;
  onMenuToggle?: () => void;
  /** Hides the Check a Record search on that page, which has its own */
  currentPage?: string;
}

const Header: React.FC<HeaderProps> = ({
  showMenuButton = false,
  menuOpen = false,
  onMenuToggle,
  currentPage,
}) => {
  const { isDarkMode, toggleDarkMode } = useTheme();
  const { authStatus } = useAuth();
  const showCheckRecord =
    authStatus.discogs.authenticated && currentPage !== ROUTES.CHECK_RECORD;
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAll,
  } = useNotifications();

  return (
    <header className='header'>
      <div className='header-brand'>
        {showMenuButton && (
          <button
            type='button'
            onClick={onMenuToggle}
            className='header-menu-toggle'
            aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={menuOpen}
            aria-controls='app-sidebar'
          >
            {menuOpen ? (
              <X size={20} aria-hidden='true' />
            ) : (
              <Menu size={20} aria-hidden='true' />
            )}
          </button>
        )}
        <h1 className='header-title'>Listenography</h1>
      </div>

      <div className='header-controls'>
        {showCheckRecord &&
          (showMenuButton ? (
            // Phones: no room for a box, so a button that opens the page
            <button
              type='button'
              onClick={() => navigate(ROUTES.CHECK_RECORD)}
              className='header-theme-toggle'
              title='Check a record'
              aria-label='Check a record'
            >
              <ScanSearch size={18} aria-hidden='true' />
            </button>
          ) : (
            <CheckRecordSearch variant='header' />
          ))}
        <NotificationBell
          notifications={notifications}
          unreadCount={unreadCount}
          onMarkAsRead={markAsRead}
          onMarkAllAsRead={markAllAsRead}
          onRemove={removeNotification}
          onClearAll={clearAll}
        />

        <button
          onClick={toggleDarkMode}
          className='header-theme-toggle'
          title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={
            isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'
          }
        >
          {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  );
};

export default Header;
