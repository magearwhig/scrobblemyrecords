import { AlertTriangle, Lightbulb } from 'lucide-react';
import React from 'react';

import { Button } from './Button';
import './EmptyState.css';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

export interface EmptyStateProps {
  /**
   * Large icon or React node to display.
   */
  icon?: React.ReactNode;
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
          <span className='empty-state-suggestion-icon'>
            <Lightbulb size={14} aria-hidden='true' />
          </span>
          {suggestion}
        </p>
      )}
      {actions && actions.length > 0 && (
        <div className='empty-state-actions'>
          {actions.map((action, index) => (
            <Button
              key={index}
              variant={action.variant === 'secondary' ? 'secondary' : 'primary'}
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
};

export interface ErrorStateProps {
  description?: string;
  actions?: EmptyStateAction[];
  size?: 'small' | 'medium' | 'large';
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  description,
  actions,
  size = 'medium',
}) => (
  <EmptyState
    icon={<AlertTriangle size={40} aria-hidden='true' />}
    title='Something went wrong'
    description={description}
    actions={actions}
    size={size}
  />
);

export default EmptyState;
