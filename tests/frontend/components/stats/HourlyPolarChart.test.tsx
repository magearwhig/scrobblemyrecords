import { render, screen } from '@testing-library/react';
import React from 'react';

import '@testing-library/jest-dom';
import { HourlyPolarChart } from '../../../../src/renderer/components/stats/HourlyPolarChart';
import { HourlyDistributionData } from '../../../../src/shared/types';

// Mock recharts to avoid rendering issues in jsdom
jest.mock('recharts', () => ({
  ResponsiveContainer: ({
    children,
  }: {
    children: React.ReactNode;
    width?: string | number;
    height?: number;
  }) => <div data-testid='responsive-container'>{children}</div>,
  RadarChart: ({
    children,
  }: {
    children: React.ReactNode;
    data?: unknown[];
  }) => <div data-testid='radar-chart'>{children}</div>,
  Radar: () => <div data-testid='radar' />,
  PolarGrid: () => <div data-testid='polar-grid' />,
  PolarAngleAxis: () => <div data-testid='polar-angle-axis' />,
  PolarRadiusAxis: () => <div data-testid='polar-radius-axis' />,
  Tooltip: () => <div data-testid='tooltip' />,
}));

describe('HourlyPolarChart', () => {
  const mockData: HourlyDistributionData[] = Array.from(
    { length: 24 },
    (_, hour) => ({
      hour,
      count: hour === 21 ? 150 : 10,
    })
  );

  const defaultProps = {
    data: mockData,
    peakHour: 21,
    insight: 'evening',
    loading: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render with data and show chart container', () => {
    // Arrange & Act
    render(<HourlyPolarChart {...defaultProps} />);

    // Assert
    expect(
      screen.getByLabelText('Listening distribution by hour of day')
    ).toBeInTheDocument();
    expect(screen.getByText('Hourly Distribution')).toBeInTheDocument();
    expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
  });

  it('should show insight text with peak hour', () => {
    // Arrange & Act
    render(<HourlyPolarChart {...defaultProps} />);

    // Assert
    expect(screen.getByText(/evening/)).toBeInTheDocument();
    expect(screen.getByText(/9pm/)).toBeInTheDocument();
  });

  it('should show different insight text for morning listener', () => {
    // Arrange & Act
    render(
      <HourlyPolarChart {...defaultProps} peakHour={8} insight='morning' />
    );

    // Assert
    expect(screen.getByText(/morning/)).toBeInTheDocument();
    expect(screen.getByText(/8am/)).toBeInTheDocument();
  });

  it('should show loading state with Skeleton', () => {
    // Arrange & Act
    render(<HourlyPolarChart {...defaultProps} loading={true} />);

    // Assert
    expect(screen.getByText('Hourly Distribution')).toBeInTheDocument();
    // Should not render the chart
    expect(screen.queryByTestId('radar-chart')).not.toBeInTheDocument();
    // Should not show insight text
    expect(screen.queryByText(/listener/)).not.toBeInTheDocument();
  });

  it('should handle empty data with EmptyState', () => {
    // Arrange & Act
    render(<HourlyPolarChart {...defaultProps} data={[]} />);

    // Assert
    expect(screen.getByText('Hourly Distribution')).toBeInTheDocument();
    expect(screen.getByText('No hourly data')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Scrobble some music to see your hourly listening patterns.'
      )
    ).toBeInTheDocument();
    // Should not render the chart
    expect(screen.queryByTestId('radar-chart')).not.toBeInTheDocument();
  });

  it('should format noon peak hour correctly', () => {
    // Arrange & Act
    render(
      <HourlyPolarChart {...defaultProps} peakHour={12} insight='afternoon' />
    );

    // Assert
    expect(screen.getByText(/12pm/)).toBeInTheDocument();
  });

  it('should format midnight peak hour correctly', () => {
    // Arrange & Act
    render(<HourlyPolarChart {...defaultProps} peakHour={0} insight='night' />);

    // Assert
    expect(screen.getByText(/12am/)).toBeInTheDocument();
  });

  it('should render chart with aria-label describing the peak hour', () => {
    // Arrange & Act
    render(<HourlyPolarChart {...defaultProps} />);

    // Assert
    expect(
      screen.getByLabelText(
        /Radar chart showing scrobbles by hour. Peak hour is 9pm./
      )
    ).toBeInTheDocument();
  });

  it('should show all-zero data as empty state', () => {
    // Arrange - 24 hours all with count 0
    const zeroData: HourlyDistributionData[] = Array.from(
      { length: 24 },
      (_, hour) => ({ hour, count: 0 })
    );

    // Act
    render(
      <HourlyPolarChart
        data={zeroData}
        peakHour={0}
        insight='morning'
        loading={false}
      />
    );

    // Assert - should show empty state, not misleading insight text
    expect(screen.getByText('No hourly data')).toBeInTheDocument();
    expect(screen.queryByTestId('radar-chart')).not.toBeInTheDocument();
    expect(screen.queryByText(/morning/)).not.toBeInTheDocument();
  });
});
