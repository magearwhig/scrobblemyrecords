import React, { useCallback } from 'react';

import { DashboardQuickActions } from '../../../shared/types';

interface QuickActionsGridProps {
  actions: DashboardQuickActions;
}

interface ActionCard {
  key: keyof DashboardQuickActions;
  icon: string;
  label: string;
  route: string;
  urgency: 'high' | 'medium' | 'low';
  formatCount: (count: number) => string;
}

const ACTION_CARDS: ActionCard[] = [
  {
    key: 'newSellerMatches',
    icon: '🎯',
    label: 'seller matches',
    route: '/sellers',
    urgency: 'high',
    formatCount: count => `${count} new`,
  },
  {
    key: 'missingAlbumsCount',
    icon: '📦',
    label: "albums you've played but don't own",
    route: '/discovery',
    urgency: 'medium',
    formatCount: count => `${count}`,
  },
  {
    key: 'wantListCount',
    icon: '💿',
    label: 'items in your want list',
    route: '/wishlist',
    urgency: 'medium',
    formatCount: count => `${count}`,
  },
  {
    key: 'dustyCornersCount',
    icon: '🕸️',
    label: 'albums need some attention',
    route: '/stats',
    urgency: 'low',
    formatCount: count => `${count}`,
  },
];

/**
 * Quick actions grid showing actionable items with counts and navigation links.
 * Actions are sorted by urgency and only shown if count > 0.
 */
export const QuickActionsGrid: React.FC<QuickActionsGridProps> = ({
  actions,
}) => {
  // Navigation helper using hash-based routing
  const navigate = useCallback((path: string) => {
    window.location.hash = path.startsWith('/') ? path.slice(1) : path;
  }, []);

  // Filter to only show actions with count > 0
  const activeActions = ACTION_CARDS.filter(card => actions[card.key] > 0);

  if (activeActions.length === 0) {
    return null; // Don't render section if no actions
  }

  return (
    <div className='dashboard-section'>
      <h3 className='dashboard-section-header'>Quick Actions</h3>
      <div className='dashboard-actions-grid'>
        {activeActions.map(card => (
          <button
            key={card.key}
            className={`dashboard-action-card dashboard-action-card-${card.urgency}`}
            onClick={() => navigate(card.route)}
            type='button'
          >
            <span className='dashboard-action-icon'>{card.icon}</span>
            <span className='dashboard-action-count'>
              {card.formatCount(actions[card.key])}
            </span>
            <span className='dashboard-action-label'>{card.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default QuickActionsGrid;
