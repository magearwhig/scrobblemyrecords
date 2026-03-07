import { Sun, Moon } from 'lucide-react';
import React from 'react';

import { useTheme } from '../context/ThemeContext';
import { useNotifications } from '../hooks/useNotifications';

import { NotificationBell } from './NotificationBell';

const Header: React.FC = () => {
  const { isDarkMode, toggleDarkMode } = useTheme();
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
        <h1 className='header-title'>Listenography</h1>
      </div>

      <div className='header-controls'>
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
