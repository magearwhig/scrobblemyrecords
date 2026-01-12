import React, { useState, useEffect, useRef, useCallback } from 'react';

import { DateRange } from '../../../shared/types';

interface DateRangePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (dateRange: DateRange) => void;
  initialDateRange?: DateRange;
}

const MONTH_NAMES = [
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

const MONTH_FULL_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Get the start and end timestamps for a given month
 */
function getMonthRange(year: number, month: number): DateRange {
  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 0, 23, 59, 59);
  return {
    startDate: Math.floor(startDate.getTime() / 1000),
    endDate: Math.floor(endDate.getTime() / 1000),
  };
}

/**
 * Get the year and month from a timestamp
 */
function getYearMonthFromTimestamp(timestamp: number): {
  year: number;
  month: number;
} {
  const date = new Date(timestamp * 1000);
  return { year: date.getFullYear(), month: date.getMonth() };
}

/**
 * Format a date range for display
 */
function formatDateRange(dateRange: DateRange): string {
  const start = new Date(dateRange.startDate * 1000);
  const end = new Date(dateRange.endDate * 1000);

  const startMonth = start.getMonth();
  const startYear = start.getFullYear();
  const endMonth = end.getMonth();
  const endYear = end.getFullYear();

  if (startYear === endYear && startMonth === endMonth) {
    return `${MONTH_FULL_NAMES[startMonth]} ${startYear}`;
  }

  if (startYear === endYear) {
    return `${MONTH_NAMES[startMonth]} - ${MONTH_NAMES[endMonth]} ${startYear}`;
  }

  return `${MONTH_NAMES[startMonth]} ${startYear} - ${MONTH_NAMES[endMonth]} ${endYear}`;
}

/**
 * DateRangePicker component - inline dropdown for selecting date ranges
 */
export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  isOpen,
  onClose,
  onApply,
  initialDateRange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [displayYear, setDisplayYear] = useState(() =>
    new Date().getFullYear()
  );
  const [selectionStart, setSelectionStart] = useState<{
    year: number;
    month: number;
  } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{
    year: number;
    month: number;
  } | null>(null);
  const [hoverMonth, setHoverMonth] = useState<{
    year: number;
    month: number;
  } | null>(null);

  // Initialize from initial range
  useEffect(() => {
    if (initialDateRange && isOpen) {
      const start = getYearMonthFromTimestamp(initialDateRange.startDate);
      const end = getYearMonthFromTimestamp(initialDateRange.endDate);
      setSelectionStart(start);
      setSelectionEnd(end);
      setDisplayYear(start.year);
    }
  }, [initialDateRange, isOpen]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: Event) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as HTMLElement)
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // Handle month click for range selection
  const handleMonthClick = useCallback(
    (year: number, month: number) => {
      if (!selectionStart || (selectionStart && selectionEnd)) {
        // Start new selection
        setSelectionStart({ year, month });
        setSelectionEnd(null);
      } else {
        // Complete selection
        const startVal = selectionStart.year * 12 + selectionStart.month;
        const endVal = year * 12 + month;

        if (endVal < startVal) {
          // Swap if end is before start
          setSelectionEnd(selectionStart);
          setSelectionStart({ year, month });
        } else {
          setSelectionEnd({ year, month });
        }
      }
    },
    [selectionStart, selectionEnd]
  );

  // Check if a month is in the current selection range
  const isInRange = useCallback(
    (year: number, month: number): boolean => {
      if (!selectionStart) return false;

      const targetVal = year * 12 + month;
      const startVal = selectionStart.year * 12 + selectionStart.month;

      if (selectionEnd) {
        const endVal = selectionEnd.year * 12 + selectionEnd.month;
        return targetVal >= startVal && targetVal <= endVal;
      }

      // During selection, use hover to show potential range
      if (hoverMonth) {
        const hoverVal = hoverMonth.year * 12 + hoverMonth.month;
        const minVal = Math.min(startVal, hoverVal);
        const maxVal = Math.max(startVal, hoverVal);
        return targetVal >= minVal && targetVal <= maxVal;
      }

      return targetVal === startVal;
    },
    [selectionStart, selectionEnd, hoverMonth]
  );

  // Check if a month is the start or end of selection
  const isSelectionBoundary = useCallback(
    (year: number, month: number): 'start' | 'end' | 'both' | null => {
      if (!selectionStart) return null;

      const isStart =
        selectionStart.year === year && selectionStart.month === month;
      const isEnd =
        selectionEnd &&
        selectionEnd.year === year &&
        selectionEnd.month === month;

      if (isStart && isEnd) return 'both';
      if (isStart) return 'start';
      if (isEnd) return 'end';
      return null;
    },
    [selectionStart, selectionEnd]
  );

  // Quick select handlers
  const handleQuickSelect = useCallback((months: number) => {
    const now = new Date();
    const end = { year: now.getFullYear(), month: now.getMonth() };
    const startDate = new Date(now);
    startDate.setMonth(startDate.getMonth() - months + 1);
    const start = {
      year: startDate.getFullYear(),
      month: startDate.getMonth(),
    };

    setSelectionStart(start);
    setSelectionEnd(end);
    setDisplayYear(end.year);
  }, []);

  const handleThisYear = useCallback(() => {
    const year = new Date().getFullYear();
    setSelectionStart({ year, month: 0 });
    setSelectionEnd({ year, month: 11 });
    setDisplayYear(year);
  }, []);

  // Apply selection
  const handleApply = useCallback(() => {
    if (!selectionStart) return;

    const start = getMonthRange(selectionStart.year, selectionStart.month);
    const end = selectionEnd
      ? getMonthRange(selectionEnd.year, selectionEnd.month)
      : start;

    onApply({
      startDate: start.startDate,
      endDate: end.endDate,
    });
    onClose();
  }, [selectionStart, selectionEnd, onApply, onClose]);

  // Get current selection as DateRange for display
  const currentRange = (): DateRange | null => {
    if (!selectionStart) return null;
    const start = getMonthRange(selectionStart.year, selectionStart.month);
    const end = selectionEnd
      ? getMonthRange(selectionEnd.year, selectionEnd.month)
      : start;
    return { startDate: start.startDate, endDate: end.endDate };
  };

  if (!isOpen) return null;

  const range = currentRange();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  return (
    <div className='date-range-picker' ref={containerRef}>
      {/* Year Navigation */}
      <div className='date-range-picker-year-nav'>
        <button
          className='date-range-picker-year-btn'
          onClick={() => setDisplayYear(y => y - 1)}
          aria-label='Previous year'
        >
          &lt;
        </button>
        <span className='date-range-picker-year'>{displayYear}</span>
        <button
          className='date-range-picker-year-btn'
          onClick={() => setDisplayYear(y => y + 1)}
          disabled={displayYear >= currentYear}
          aria-label='Next year'
        >
          &gt;
        </button>
      </div>

      {/* Quick Select */}
      <div className='date-range-picker-quick-select'>
        <button
          className='date-range-picker-quick-btn'
          onClick={() => handleQuickSelect(3)}
        >
          Last 3 Mo
        </button>
        <button
          className='date-range-picker-quick-btn'
          onClick={() => handleQuickSelect(6)}
        >
          Last 6 Mo
        </button>
        <button
          className='date-range-picker-quick-btn'
          onClick={handleThisYear}
        >
          This Year
        </button>
      </div>

      {/* Month Grid */}
      <div className='date-range-picker-months'>
        {MONTH_NAMES.map((name, index) => {
          const isFuture = displayYear === currentYear && index > currentMonth;
          const inRange = isInRange(displayYear, index);
          const boundary = isSelectionBoundary(displayYear, index);

          return (
            <button
              key={index}
              className={`date-range-picker-month ${inRange ? 'in-range' : ''} ${boundary ? `boundary-${boundary}` : ''}`}
              onClick={() => handleMonthClick(displayYear, index)}
              onMouseEnter={() =>
                setHoverMonth({ year: displayYear, month: index })
              }
              onMouseLeave={() => setHoverMonth(null)}
              disabled={isFuture}
            >
              {name}
            </button>
          );
        })}
      </div>

      {/* Selection Summary */}
      <div className='date-range-picker-summary'>
        {range ? (
          <>Selected: {formatDateRange(range)}</>
        ) : (
          <>Click a month to start selection</>
        )}
      </div>

      {/* Action Buttons */}
      <div className='date-range-picker-actions'>
        <button className='date-range-picker-btn-cancel' onClick={onClose}>
          Cancel
        </button>
        <button
          className='date-range-picker-btn-apply'
          onClick={handleApply}
          disabled={!selectionStart}
        >
          Apply
        </button>
      </div>
    </div>
  );
};

export default DateRangePicker;
