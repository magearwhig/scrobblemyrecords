import React from 'react';

interface StatCardProps {
  icon: string;
  value: string | number;
  label: string;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
}

/**
 * A card displaying a single statistic with icon and label
 */
export const StatCard: React.FC<StatCardProps> = ({
  icon,
  value,
  label,
  subValue,
  trend,
}) => {
  return (
    <div className='stat-card'>
      <div className='stat-card-icon'>{icon}</div>
      <div className='stat-card-content'>
        <div className='stat-card-value'>
          {typeof value === 'number' ? value.toLocaleString() : value}
          {trend && (
            <span className={`stat-card-trend stat-card-trend-${trend}`}>
              {trend === 'up' && '↑'}
              {trend === 'down' && '↓'}
            </span>
          )}
        </div>
        <div className='stat-card-label'>{label}</div>
        {subValue && <div className='stat-card-subvalue'>{subValue}</div>}
      </div>
    </div>
  );
};

export default StatCard;
