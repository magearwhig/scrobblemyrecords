import React, { useState } from 'react';

import { DateRange } from '../../../shared/types';

import DateRangePicker from './DateRangePicker';

export type Period =
  | 'week'
  | 'month'
  | 'year'
  | 'all'
  | 'days30'
  | 'days90'
  | 'days365'
  | 'custom';

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
  { value: 'days30', label: '30 Days' },
  { value: 'days90', label: '90 Days' },
  { value: 'days365', label: '365 Days' },
  { value: 'all', label: 'All Time' },
];

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** A custom range as a short button label: "Mar 2026", "Jan - Mar 2026" */
export function formatDateRangeLabel(dateRange: DateRange): string {
  const start = new Date(dateRange.startDate * 1000);
  const end = new Date(dateRange.endDate * 1000);
  const startMonth = start.getMonth();
  const startYear = start.getFullYear();
  const endMonth = end.getMonth();
  const endYear = end.getFullYear();

  if (startYear === endYear && startMonth === endMonth) {
    return `${MONTHS[startMonth]} ${startYear}`;
  }
  if (startYear === endYear) {
    return `${MONTHS[startMonth]} - ${MONTHS[endMonth]} ${startYear}`;
  }
  return `${MONTHS[startMonth]} '${String(startYear).slice(-2)} - ${MONTHS[endMonth]} '${String(endYear).slice(-2)}`;
}

interface PeriodSelectorProps {
  currentPeriod: Period;
  onPeriodChange: (period: Period, dateRange?: DateRange) => void;
  customDateRange?: DateRange;
  /** Names the button group for screen readers */
  label?: string;
}

/**
 * Period buttons (Week ... All Time, Custom) with the custom date picker.
 * Used by each top list, and once for all of them in the Stats rankings.
 */
export const PeriodSelector: React.FC<PeriodSelectorProps> = ({
  currentPeriod,
  onPeriodChange,
  customDateRange,
  label,
}) => {
  const [showDatePicker, setShowDatePicker] = useState(false);

  const handlePeriodClick = (period: Period) => {
    if (period === 'custom') {
      setShowDatePicker(true);
    } else {
      setShowDatePicker(false);
      onPeriodChange(period);
    }
  };

  const customLabel =
    currentPeriod === 'custom' && customDateRange
      ? formatDateRangeLabel(customDateRange)
      : 'Custom';

  return (
    <div className='top-list-period-selector-wrapper'>
      <div
        className='top-list-period-selector'
        role={label ? 'group' : undefined}
        aria-label={label}
      >
        {PERIODS.map(period => (
          <button
            key={period.value}
            type='button'
            className={`top-list-period-btn ${currentPeriod === period.value ? 'active' : ''}`}
            aria-pressed={currentPeriod === period.value}
            onClick={() => handlePeriodClick(period.value)}
          >
            {period.label}
          </button>
        ))}
        <button
          type='button'
          className={`top-list-period-btn ${currentPeriod === 'custom' ? 'active' : ''}`}
          aria-pressed={currentPeriod === 'custom'}
          onClick={() => handlePeriodClick('custom')}
        >
          {customLabel}
        </button>
      </div>
      <DateRangePicker
        isOpen={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        onApply={dateRange => {
          onPeriodChange('custom', dateRange);
          setShowDatePicker(false);
        }}
        initialDateRange={customDateRange}
      />
    </div>
  );
};

export default PeriodSelector;
