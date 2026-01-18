import React from 'react';

interface DashboardStatCardProps {
  icon: string;
  value: string | number;
  label: string;
  subValue?: string;
  onClick?: () => void;
}

/**
 * A stat card for the dashboard quick stats row.
 * Displays a single metric with icon, value, label, and optional sub-value.
 */
export const DashboardStatCard: React.FC<DashboardStatCardProps> = ({
  icon,
  value,
  label,
  subValue,
  onClick,
}) => {
  return (
    <div
      className={`dashboard-stat-card ${onClick ? 'dashboard-stat-card-clickable' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? e => e.key === 'Enter' && onClick() : undefined}
    >
      <div className='dashboard-stat-icon'>{icon}</div>
      <div className='dashboard-stat-content'>
        <div className='dashboard-stat-value'>{value}</div>
        <div className='dashboard-stat-label'>{label}</div>
        {subValue && <div className='dashboard-stat-subvalue'>{subValue}</div>}
      </div>
    </div>
  );
};

export default DashboardStatCard;
