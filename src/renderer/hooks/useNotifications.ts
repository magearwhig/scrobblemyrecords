import { useCallback, useEffect, useState } from 'react';

import { AppNotification, NotificationStore } from '../../shared/types';

const STORAGE_KEY = 'recordscrobbles.notifications';
const MAX_NOTIFICATIONS = 50;

/**
 * Hook for managing application notifications.
 * Notifications are stored in localStorage for persistence.
 */
export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load notifications from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data: NotificationStore = JSON.parse(stored);
        if (data.schemaVersion === 1 && Array.isArray(data.notifications)) {
          setNotifications(data.notifications);
        }
      }
    } catch (error) {
      console.error('Failed to load notifications:', error);
    }
    setIsLoaded(true);
  }, []);

  // Save notifications to localStorage whenever they change
  useEffect(() => {
    if (!isLoaded) return;

    try {
      const data: NotificationStore = {
        schemaVersion: 1,
        notifications,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save notifications:', error);
    }
  }, [notifications, isLoaded]);

  /**
   * Add a new notification
   */
  const addNotification = useCallback(
    (
      notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'>
    ): string => {
      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newNotification: AppNotification = {
        ...notification,
        id,
        timestamp: Date.now(),
        read: false,
      };

      setNotifications(prev => {
        // Add new notification at the beginning
        const updated = [newNotification, ...prev];
        // Keep only the most recent MAX_NOTIFICATIONS
        return updated.slice(0, MAX_NOTIFICATIONS);
      });

      return id;
    },
    []
  );

  /**
   * Mark a notification as read
   */
  const markAsRead = useCallback((id: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  /**
   * Mark all notifications as read
   */
  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  /**
   * Remove a notification
   */
  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  /**
   * Clear all notifications
   */
  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  /**
   * Get unread count
   */
  const unreadCount = notifications.filter(n => !n.read).length;

  return {
    notifications,
    unreadCount,
    addNotification,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAll,
    isLoaded,
  };
}

/**
 * Convenience functions for creating notifications
 */
export const createInfoNotification = (
  title: string,
  message: string,
  action?: AppNotification['action']
): Omit<AppNotification, 'id' | 'timestamp' | 'read'> => ({
  type: 'info',
  title,
  message,
  action,
});

export const createSuccessNotification = (
  title: string,
  message: string,
  action?: AppNotification['action']
): Omit<AppNotification, 'id' | 'timestamp' | 'read'> => ({
  type: 'success',
  title,
  message,
  action,
});

export const createWarningNotification = (
  title: string,
  message: string,
  action?: AppNotification['action']
): Omit<AppNotification, 'id' | 'timestamp' | 'read'> => ({
  type: 'warning',
  title,
  message,
  action,
});

export const createAlertNotification = (
  title: string,
  message: string,
  action?: AppNotification['action']
): Omit<AppNotification, 'id' | 'timestamp' | 'read'> => ({
  type: 'alert',
  title,
  message,
  action,
});
