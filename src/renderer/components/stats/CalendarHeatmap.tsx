import React, { useMemo } from 'react';

import { CalendarHeatmapData } from '../../../shared/types';

interface CalendarHeatmapProps {
  data: CalendarHeatmapData[];
  year: number;
  onYearChange?: (year: number) => void;
}

/**
 * GitHub-style calendar heatmap for visualizing daily listening activity
 */
export const CalendarHeatmap: React.FC<CalendarHeatmapProps> = ({
  data,
  year,
  onYearChange,
}) => {
  // Create a map for quick lookup
  const dataMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of data) {
      map.set(item.date, item.count);
    }
    return map;
  }, [data]);

  // Calculate max value for color scaling
  const maxCount = useMemo(() => {
    if (data.length === 0) return 1;
    return Math.max(...data.map(d => d.count));
  }, [data]);

  // Generate all days for the year
  const weeks = useMemo(() => {
    // Format date as YYYY-MM-DD in local time (not UTC)
    const formatLocalDate = (date: Date): string => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    const result: Array<Array<{ date: string; count: number; day: number }>> =
      [];
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);

    // Adjust start to the first day of the first week (Sunday)
    const firstSunday = new Date(startDate);
    firstSunday.setDate(firstSunday.getDate() - firstSunday.getDay());

    const currentDate = new Date(firstSunday);
    let currentWeek: Array<{ date: string; count: number; day: number }> = [];

    while (currentDate <= endDate || currentWeek.length > 0) {
      // Use local date format to match backend data
      const dateStr = formatLocalDate(currentDate);
      const isInYear =
        currentDate.getFullYear() === year &&
        currentDate >= startDate &&
        currentDate <= endDate;

      if (isInYear) {
        currentWeek.push({
          date: dateStr,
          count: dataMap.get(dateStr) || 0,
          day: currentDate.getDay(),
        });
      } else if (currentDate < startDate) {
        // Empty placeholder for days before year starts
        currentWeek.push({ date: '', count: -1, day: currentDate.getDay() });
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);

      // If we've completed a week (Saturday) or reached end of year
      if (currentDate.getDay() === 0 || currentDate > endDate) {
        if (currentWeek.length > 0) {
          // Pad incomplete weeks
          while (currentWeek.length < 7 && currentDate > endDate) {
            currentWeek.push({ date: '', count: -1, day: currentWeek.length });
          }
          result.push(currentWeek);
          currentWeek = [];
        }
      }

      // Stop if we've passed the year
      if (currentDate > endDate && currentWeek.length === 0) {
        break;
      }
    }

    return result;
  }, [year, dataMap]);

  const getColorClass = (count: number): string => {
    if (count < 0) return 'heatmap-cell-empty';
    if (count === 0) return 'heatmap-cell-level-0';

    const level = Math.ceil((count / maxCount) * 4);
    return `heatmap-cell-level-${Math.min(level, 4)}`;
  };

  const monthLabels = [
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

  // Calculate month positions
  const monthPositions = useMemo(() => {
    const positions: Array<{ month: string; weekIndex: number }> = [];
    let lastMonth = -1;

    weeks.forEach((week, weekIndex) => {
      for (const day of week) {
        if (day.date) {
          const month = new Date(day.date).getMonth();
          if (month !== lastMonth) {
            positions.push({ month: monthLabels[month], weekIndex });
            lastMonth = month;
          }
          break;
        }
      }
    });

    return positions;
  }, [weeks]);

  const dayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

  const currentYear = new Date().getFullYear();
  const availableYears = [currentYear - 2, currentYear - 1, currentYear];

  return (
    <div className='calendar-heatmap'>
      <div className='calendar-heatmap-header'>
        <div>
          <h3>Listening Activity</h3>
          <p className='calendar-heatmap-description'>
            Your daily scrobble activity. Darker squares = more scrobbles that
            day.
          </p>
        </div>
        {onYearChange && (
          <select
            className='calendar-heatmap-year-select'
            value={year}
            onChange={e => onYearChange(parseInt(e.target.value))}
          >
            {availableYears.map(y => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className='calendar-heatmap-container'>
        <div className='calendar-heatmap-day-labels'>
          {dayLabels.map((label, i) => (
            <div key={i} className='calendar-heatmap-day-label'>
              {label}
            </div>
          ))}
        </div>

        <div className='calendar-heatmap-grid-container'>
          <div className='calendar-heatmap-month-labels'>
            {monthPositions.map(({ month, weekIndex }) => (
              <div
                key={`${month}-${weekIndex}`}
                className='calendar-heatmap-month-label'
                style={{ gridColumn: weekIndex + 1 }}
              >
                {month}
              </div>
            ))}
          </div>

          <div className='calendar-heatmap-grid'>
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className='calendar-heatmap-week'>
                {week.map((day, dayIndex) => (
                  <div
                    key={`${weekIndex}-${dayIndex}`}
                    className={`calendar-heatmap-cell ${getColorClass(day.count)}`}
                    title={
                      day.date
                        ? `${day.date}: ${day.count} scrobble${day.count !== 1 ? 's' : ''}`
                        : ''
                    }
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className='calendar-heatmap-legend'>
        <span className='calendar-heatmap-legend-label'>Less</span>
        <div className='calendar-heatmap-cell heatmap-cell-level-0' />
        <div className='calendar-heatmap-cell heatmap-cell-level-1' />
        <div className='calendar-heatmap-cell heatmap-cell-level-2' />
        <div className='calendar-heatmap-cell heatmap-cell-level-3' />
        <div className='calendar-heatmap-cell heatmap-cell-level-4' />
        <span className='calendar-heatmap-legend-label'>More</span>
      </div>
    </div>
  );
};

export default CalendarHeatmap;
