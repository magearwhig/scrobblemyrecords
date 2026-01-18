import React, { useCallback, useEffect, useState } from 'react';

import { AuthStatus } from '../../../shared/types';

interface ConnectionStatusProps {
  authStatus: AuthStatus | null;
  serverConnected: boolean;
  isLoading: boolean;
}

interface StatusItem {
  key: string;
  label: string;
  connected: boolean;
  action?: {
    label: string;
    route: string;
  };
}

/**
 * Collapsible connection status section.
 * Shows status of server, Discogs, and Last.fm connections.
 * Collapsed by default when all connections are healthy.
 */
export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  authStatus,
  serverConnected,
  isLoading,
}) => {
  // Navigation helper using hash-based routing
  const navigate = useCallback((path: string) => {
    window.location.hash = path.startsWith('/') ? path.slice(1) : path;
  }, []);

  const statusItems: StatusItem[] = [
    {
      key: 'server',
      label: 'Local Server',
      connected: serverConnected,
    },
    {
      key: 'discogs',
      label: 'Discogs',
      connected: authStatus?.discogs.authenticated ?? false,
      action: !authStatus?.discogs.authenticated
        ? { label: 'Connect', route: '/settings' }
        : undefined,
    },
    {
      key: 'lastfm',
      label: 'Last.fm',
      connected: authStatus?.lastfm.authenticated ?? false,
      action: !authStatus?.lastfm.authenticated
        ? { label: 'Connect', route: '/settings' }
        : undefined,
    },
  ];

  const allConnected = statusItems.every(item => item.connected);
  const [isExpanded, setIsExpanded] = useState(!allConnected);

  // Auto-collapse when all connections become healthy
  useEffect(() => {
    if (allConnected) {
      setIsExpanded(false);
    }
  }, [allConnected]);

  // If loading, show a simple loading indicator
  if (isLoading) {
    return (
      <div className='dashboard-connection-status dashboard-connection-status-loading'>
        <span className='dashboard-connection-spinner' />
        <span>Checking connections...</span>
      </div>
    );
  }

  // If all connected and collapsed, show minimal indicator
  if (allConnected && !isExpanded) {
    return (
      <button
        type='button'
        className='dashboard-connection-status dashboard-connection-status-healthy'
        onClick={() => setIsExpanded(true)}
      >
        <span className='dashboard-connection-indicator dashboard-connection-indicator-healthy' />
        <span>All services connected</span>
        <span className='dashboard-connection-expand'>Show details</span>
      </button>
    );
  }

  return (
    <div
      className={`dashboard-connection-status ${allConnected ? '' : 'dashboard-connection-status-warning'}`}
    >
      <div className='dashboard-connection-header'>
        <span className='dashboard-connection-title'>
          {allConnected ? 'All services connected' : 'Connection issues'}
        </span>
        {allConnected && (
          <button
            type='button'
            className='dashboard-connection-collapse'
            onClick={() => setIsExpanded(false)}
          >
            Hide
          </button>
        )}
      </div>

      <div className='dashboard-connection-grid'>
        {statusItems.map(item => (
          <div
            key={item.key}
            className={`dashboard-connection-item ${item.connected ? 'dashboard-connection-item-ok' : 'dashboard-connection-item-error'}`}
          >
            <span
              className={`dashboard-connection-indicator ${item.connected ? 'dashboard-connection-indicator-healthy' : 'dashboard-connection-indicator-error'}`}
            />
            <span className='dashboard-connection-label'>{item.label}</span>
            <span className='dashboard-connection-state'>
              {item.connected ? 'Connected' : 'Not connected'}
            </span>
            {item.action && (
              <button
                type='button'
                className='dashboard-connection-action'
                onClick={() => navigate(item.action!.route)}
              >
                {item.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ConnectionStatus;
