import React from 'react';

import './Badge.css';

export type BadgeVariant =
  | 'default'
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

export type BadgeSize = 'small' | 'medium' | 'large';

export interface BadgeProps {
  /**
   * The visual style variant of the badge.
   */
  variant?: BadgeVariant;
  /**
   * The size of the badge.
   */
  size?: BadgeSize;
  /**
   * Whether to display as a pill shape.
   */
  pill?: boolean;
  /**
   * Whether to display as an outline style.
   */
  outline?: boolean;
  /**
   * Icon to display before the label.
   */
  icon?: React.ReactNode;
  /**
   * Additional class names.
   */
  className?: string;
  /**
   * Badge content.
   */
  children: React.ReactNode;
}

/**
 * A badge component for displaying labels, counts, or status indicators.
 */
export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  size = 'medium',
  pill = false,
  outline = false,
  icon,
  className = '',
  children,
}) => {
  const classNames = [
    'badge',
    `badge--${variant}`,
    `badge--${size}`,
    pill && 'badge--pill',
    outline && 'badge--outline',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classNames}>
      {icon && <span className='badge-icon'>{icon}</span>}
      <span className='badge-content'>{children}</span>
    </span>
  );
};

/**
 * A count badge, typically used for notifications or item counts.
 */
export interface CountBadgeProps {
  /**
   * The count to display.
   */
  count: number;
  /**
   * Maximum count before showing overflow indicator (e.g., "99+").
   */
  max?: number;
  /**
   * The visual style variant.
   */
  variant?: BadgeVariant;
  /**
   * Whether to show when count is 0.
   */
  showZero?: boolean;
  /**
   * Additional class names.
   */
  className?: string;
}

export const CountBadge: React.FC<CountBadgeProps> = ({
  count,
  max = 99,
  variant = 'primary',
  showZero = false,
  className = '',
}) => {
  if (count === 0 && !showZero) {
    return null;
  }

  const displayCount = count > max ? `${max}+` : count;

  return (
    <Badge
      variant={variant}
      size='small'
      pill
      className={`badge--count ${className}`}
    >
      {displayCount}
    </Badge>
  );
};

/**
 * A status badge with a dot indicator.
 */
export interface StatusBadgeProps {
  /**
   * The status to display.
   */
  status: 'active' | 'inactive' | 'pending' | 'error' | 'success';
  /**
   * Label text to display.
   */
  label?: string;
  /**
   * Additional class names.
   */
  className?: string;
}

const statusVariantMap: Record<StatusBadgeProps['status'], BadgeVariant> = {
  active: 'success',
  inactive: 'secondary',
  pending: 'warning',
  error: 'danger',
  success: 'success',
};

const statusLabelMap: Record<StatusBadgeProps['status'], string> = {
  active: 'Active',
  inactive: 'Inactive',
  pending: 'Pending',
  error: 'Error',
  success: 'Success',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  className = '',
}) => {
  const displayLabel = label || statusLabelMap[status];

  return (
    <Badge
      variant={statusVariantMap[status]}
      size='small'
      className={`badge--status ${className}`}
    >
      <span className='badge-status-dot' />
      {displayLabel}
    </Badge>
  );
};

export default Badge;
