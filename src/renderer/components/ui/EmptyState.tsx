import React from 'react';

import './EmptyState.css';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

export interface EmptyStateProps {
  /**
   * Large icon or emoji to display.
   */
  icon?: string;
  /**
   * Main title for the empty state.
   */
  title: string;
  /**
   * Descriptive message explaining the empty state.
   */
  description?: string;
  /**
   * Helpful suggestion or tip.
   */
  suggestion?: string;
  /**
   * Primary and/or secondary action buttons.
   */
  actions?: EmptyStateAction[];
  /**
   * Size variant.
   */
  size?: 'small' | 'medium' | 'large';
}

/**
 * Reusable empty state component with consistent styling.
 * Use this instead of inline empty state messages for better UX.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  suggestion,
  actions,
  size = 'medium',
}) => {
  return (
    <div className={`empty-state-container empty-state-container--${size}`}>
      {icon && <div className='empty-state-icon'>{icon}</div>}
      <h3 className='empty-state-title'>{title}</h3>
      {description && <p className='empty-state-description'>{description}</p>}
      {suggestion && (
        <p className='empty-state-suggestion'>
          <span className='empty-state-suggestion-icon'>💡</span>
          {suggestion}
        </p>
      )}
      {actions && actions.length > 0 && (
        <div className='empty-state-actions'>
          {actions.map((action, index) => (
            <button
              key={index}
              className={`btn ${action.variant === 'secondary' ? 'btn-secondary' : ''}`}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default EmptyState;
