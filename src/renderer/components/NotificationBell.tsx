import React, { useCallback, useEffect, useRef, useState } from 'react';

import { AppNotification } from '../../shared/types';

interface NotificationBellProps {
  notifications: AppNotification[];
  unreadCount: number;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onRemove: (id: string) => void;
  onClearAll: () => void;
}

/**
 * Notification bell icon with dropdown panel
 */
export const NotificationBell: React.FC<NotificationBellProps> = ({
  notifications,
  unreadCount,
  onMarkAsRead,
  onMarkAllAsRead,
  onRemove,
  onClearAll,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: Event) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as HTMLElement)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleNotificationClick = useCallback(
    (notification: AppNotification) => {
      if (!notification.read) {
        onMarkAsRead(notification.id);
      }

      if (notification.action) {
        if (notification.action.externalUrl) {
          window.open(notification.action.externalUrl, '_blank');
        } else if (notification.action.route) {
          window.location.hash = notification.action.route.replace('#', '');
          setIsOpen(false);
        }
      }
    },
    [onMarkAsRead]
  );

  const formatTimeAgo = (timestamp: number): string => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  const getTypeIcon = (type: AppNotification['type']): string => {
    switch (type) {
      case 'success':
        return '✓';
      case 'warning':
        return '⚠';
      case 'alert':
        return '!';
      case 'info':
      default:
        return 'ℹ';
    }
  };

  return (
    <div className='notification-bell-container' ref={containerRef}>
      <button
        className='notification-bell-button'
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
      >
        <svg
          className='notification-bell-icon'
          viewBox='0 0 24 24'
          width='20'
          height='20'
          fill='currentColor'
        >
          <path d='M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z' />
        </svg>
        {unreadCount > 0 && (
          <span className='notification-bell-badge'>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className='notification-panel'>
          <div className='notification-panel-header'>
            <h3>Notifications</h3>
            {notifications.length > 0 && (
              <div className='notification-panel-actions'>
                {unreadCount > 0 && (
                  <button
                    className='notification-action-link'
                    onClick={onMarkAllAsRead}
                  >
                    Mark all read
                  </button>
                )}
                <button
                  className='notification-action-link'
                  onClick={onClearAll}
                >
                  Clear all
                </button>
              </div>
            )}
          </div>

          <div className='notification-panel-content'>
            {notifications.length === 0 ? (
              <div className='notification-empty'>
                <span className='notification-empty-icon'>🔔</span>
                <p>No notifications</p>
              </div>
            ) : (
              <ul className='notification-list'>
                {notifications.map(notification => (
                  <li
                    key={notification.id}
                    className={`notification-item notification-item-${notification.type} ${!notification.read ? 'notification-item-unread' : ''}`}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className='notification-item-icon'>
                      <span
                        className={`notification-type-icon notification-type-${notification.type}`}
                      >
                        {getTypeIcon(notification.type)}
                      </span>
                    </div>
                    <div className='notification-item-content'>
                      <div className='notification-item-title'>
                        {notification.title}
                      </div>
                      <div className='notification-item-message'>
                        {notification.message}
                      </div>
                      <div className='notification-item-time'>
                        {formatTimeAgo(notification.timestamp)}
                      </div>
                    </div>
                    <button
                      className='notification-item-dismiss'
                      onClick={e => {
                        e.stopPropagation();
                        onRemove(notification.id);
                      }}
                      aria-label='Dismiss notification'
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
