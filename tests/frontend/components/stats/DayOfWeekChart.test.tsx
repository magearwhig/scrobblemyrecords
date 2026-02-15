import { render, screen } from '@testing-library/react';
import React from 'react';

import '@testing-library/jest-dom';
import { DayOfWeekChart } from '../../../../src/renderer/components/stats/DayOfWeekChart';
import { DayOfWeekDistributionData } from '../../../../src/shared/types';

// Mock recharts to avoid rendering issues in jsdom
jest.mock('recharts', () => ({
  ResponsiveContainer: ({
    children,
  }: {
    children: React.ReactNode;
    width?: string | number;
    height?: number;
  }) => <div data-testid='responsive-container'>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode; data?: unknown[] }) => (
    <div data-testid='bar-chart'>{children}</div>
  ),
  Bar: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid='bar'>{children}</div>
  ),
  Cell: ({ className }: { className?: string }) => (
    <div data-testid='cell' className={className} />
  ),
  XAxis: () => <div data-testid='x-axis' />,
  YAxis: () => <div data-testid='y-axis' />,
  Tooltip: () => <div data-testid='tooltip' />,
}));

describe('DayOfWeekChart', () => {
  const mockData: DayOfWeekDistributionData[] = [
    { day: 0, dayName: 'Sunday', count: 80 },
    { day: 1, dayName: 'Monday', count: 50 },
    { day: 2, dayName: 'Tuesday', count: 55 },
    { day: 3, dayName: 'Wednesday', count: 60 },
    { day: 4, dayName: 'Thursday', count: 45 },
    { day: 5, dayName: 'Friday', count: 70 },
    { day: 6, dayName: 'Saturday', count: 90 },
  ];

  const defaultProps = {
    data: mockData,
    peakDay: 6,
    weekdayAvg: 56,
    weekendAvg: 85,
    insight: 'weekend',
    loading: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render with data and show chart container', () => {
    // Arrange & Act
    render(<DayOfWeekChart {...defaultProps} />);

    // Assert
    expect(
      screen.getByLabelText('Listening distribution by day of week')
    ).toBeInTheDocument();
    expect(screen.getByText('Day of Week')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('should show insight text with weekend preference', () => {
    // Arrange & Act
    render(<DayOfWeekChart {...defaultProps} />);

    // Assert - the insight text contains "weekend", "weekends", and the percentage
    const insightText = screen.getByText(/listener.*more on/);
    expect(insightText).toBeInTheDocument();
    expect(insightText.textContent).toContain('weekend');
    expect(insightText.textContent).toContain('weekends');
    // weekendAvg (85) is ~52% more than weekdayAvg (56)
    expect(insightText.textContent).toContain('52%');
  });

  it('should show insight text with weekday preference', () => {
    // Arrange & Act
    render(
      <DayOfWeekChart
        {...defaultProps}
        insight='weekday'
        weekdayAvg={85}
        weekendAvg={56}
        peakDay={3}
      />
    );

    // Assert - the insight text contains "weekday" and "weekdays"
    const insightText = screen.getByText(/listener.*more on/);
    expect(insightText).toBeInTheDocument();
    expect(insightText.textContent).toContain('weekday');
    expect(insightText.textContent).toContain('weekdays');
  });

  it('should show loading state with Skeleton', () => {
    // Arrange & Act
    render(<DayOfWeekChart {...defaultProps} loading={true} />);

    // Assert
    expect(screen.getByText('Day of Week')).toBeInTheDocument();
    // Should not render the chart
    expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
    // Should not show insight text
    expect(screen.queryByText(/listener/)).not.toBeInTheDocument();
  });

  it('should handle empty data with EmptyState', () => {
    // Arrange & Act
    render(<DayOfWeekChart {...defaultProps} data={[]} />);

    // Assert
    expect(screen.getByText('Day of Week')).toBeInTheDocument();
    expect(screen.getByText('No day-of-week data')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Scrobble some music to see your weekly listening patterns.'
      )
    ).toBeInTheDocument();
    // Should not render the chart
    expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
  });

  it('should render chart with aria-label describing the peak day', () => {
    // Arrange & Act
    render(<DayOfWeekChart {...defaultProps} />);

    // Assert
    expect(
      screen.getByLabelText(
        /Bar chart showing scrobbles by day of week. Peak day is Saturday./
      )
    ).toBeInTheDocument();
  });

  it('should handle zero lower average without dividing by zero', () => {
    // Arrange & Act
    render(
      <DayOfWeekChart
        {...defaultProps}
        weekdayAvg={0}
        weekendAvg={85}
        insight='weekend'
      />
    );

    // Assert - should show 100% (all listening on one segment) instead of NaN or Infinity
    expect(screen.getByText(/100%/)).toBeInTheDocument();
  });

  it('should show even distribution text when difference is less than 5%', () => {
    // Arrange & Act
    render(
      <DayOfWeekChart
        {...defaultProps}
        weekdayAvg={100}
        weekendAvg={102}
        insight='weekend'
      />
    );

    // Assert - 2% difference is below 5% threshold, should show even text
    expect(screen.getByText(/fairly even/)).toBeInTheDocument();
    expect(screen.queryByText(/listener.*more on/)).not.toBeInTheDocument();
  });

  it('should show all-zero data as empty state', () => {
    // Arrange
    const zeroData: DayOfWeekDistributionData[] = [
      { day: 0, dayName: 'Sunday', count: 0 },
      { day: 1, dayName: 'Monday', count: 0 },
      { day: 2, dayName: 'Tuesday', count: 0 },
      { day: 3, dayName: 'Wednesday', count: 0 },
      { day: 4, dayName: 'Thursday', count: 0 },
      { day: 5, dayName: 'Friday', count: 0 },
      { day: 6, dayName: 'Saturday', count: 0 },
    ];

    // Act
    render(
      <DayOfWeekChart
        {...defaultProps}
        data={zeroData}
        weekdayAvg={0}
        weekendAvg={0}
      />
    );

    // Assert - should show empty state, not a chart with misleading insight
    expect(screen.getByText('No day-of-week data')).toBeInTheDocument();
    expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
  });
});
