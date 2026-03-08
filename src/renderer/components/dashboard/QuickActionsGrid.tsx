import { Disc3, Package, Sparkles, Target } from 'lucide-react';
import React from 'react';

import { DashboardQuickActions } from '../../../shared/types';
import { navigate } from '../../routes';

interface QuickActionsGridProps {
  actions: DashboardQuickActions;
}

interface ActionCard {
  key: keyof DashboardQuickActions;
  icon: React.ReactNode;
  label: string;
  route: string;
  urgency: 'high' | 'medium' | 'low';
  formatCount: (count: number) => string;
}

const ACTION_CARDS: ActionCard[] = [
  {
    key: 'newSellerMatches',
    icon: <Target size={20} aria-hidden='true' />,
    label: 'seller matches',
    route: '/sellers',
    urgency: 'high',
    formatCount: count => `${count} new`,
  },
  {
    key: 'missingAlbumsCount',
    icon: <Package size={20} aria-hidden='true' />,
    label: "albums you've played but don't own",
    route: '/discovery',
    urgency: 'medium',
    formatCount: count => `${count}`,
  },
  {
    key: 'wantListCount',
    icon: <Disc3 size={20} aria-hidden='true' />,
    label: 'items in your want list',
    route: '/wishlist',
    urgency: 'medium',
    formatCount: count => `${count}`,
  },
  {
    key: 'dustyCornersCount',
    icon: <Sparkles size={20} aria-hidden='true' />,
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
