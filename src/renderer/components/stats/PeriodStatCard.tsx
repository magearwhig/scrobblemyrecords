import React from 'react';

type CoveragePeriod =
  | 'month'
  | 'year'
  | 'allTime'
  | 'days30'
  | 'days90'
  | 'days365';

interface PeriodStatCardProps {
  icon: string;
  values: {
    month: { value: string | number; subValue: string };
    year: { value: string | number; subValue: string };
    allTime: { value: string | number; subValue: string };
    days30: { value: string | number; subValue: string };
    days90: { value: string | number; subValue: string };
    days365: { value: string | number; subValue: string };
  };
  label: string;
  currentPeriod: CoveragePeriod;
  onPeriodChange: (period: CoveragePeriod) => void;
}

const periodLabels: Record<CoveragePeriod, string> = {
  month: 'This Month',
  year: 'This Year',
  days30: '30 Days',
  days90: '90 Days',
  days365: '365 Days',
  allTime: 'All Time',
};

/**
 * A stat card with a period selector dropdown
 */
export const PeriodStatCard: React.FC<PeriodStatCardProps> = ({
  icon,
  values,
  label,
  currentPeriod,
  onPeriodChange,
}) => {
  const currentValue = values[currentPeriod];

  return (
    <div className='stat-card period-stat-card'>
      <div className='stat-card-icon'>{icon}</div>
      <div className='stat-card-content'>
        <div className='stat-card-value'>
          {typeof currentValue.value === 'number'
            ? currentValue.value.toLocaleString()
            : currentValue.value}
        </div>
        <div className='stat-card-label'>{label}</div>
        <div className='stat-card-subvalue'>{currentValue.subValue}</div>
      </div>
      <select
        className='period-stat-card-selector'
        value={currentPeriod}
        onChange={e => onPeriodChange(e.target.value as CoveragePeriod)}
      >
        {Object.entries(periodLabels).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default PeriodStatCard;
