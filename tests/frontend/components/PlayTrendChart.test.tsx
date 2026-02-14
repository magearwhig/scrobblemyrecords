import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import '@testing-library/jest-dom';
import PlayTrendChart from '../../../src/renderer/components/PlayTrendChart';

// Mock recharts to avoid rendering issues in jsdom
jest.mock('recharts', () => ({
  ResponsiveContainer: ({
    children,
  }: {
    children: React.ReactNode;
    width?: string | number;
    height?: number;
  }) => <div data-testid='responsive-container'>{children}</div>,
  AreaChart: ({
    children,
  }: {
    children: React.ReactNode;
    data?: unknown[];
  }) => <div data-testid='area-chart'>{children}</div>,
  Area: () => <div data-testid='area' />,
  XAxis: () => <div data-testid='x-axis' />,
  YAxis: () => <div data-testid='y-axis' />,
  CartesianGrid: () => <div data-testid='cartesian-grid' />,
  Tooltip: () => <div data-testid='tooltip' />,
}));

describe('PlayTrendChart', () => {
  const mockData = [
    { period: '2024-01', count: 35 },
    { period: '2024-02', count: 42 },
    { period: '2024-03', count: 28 },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render chart title', () => {
    // Arrange & Act
    render(<PlayTrendChart data={mockData} />);

    // Assert
    expect(screen.getByText('Play Count Over Time')).toBeInTheDocument();
  });

  it('should render the chart area when data is provided', () => {
    // Arrange & Act
    render(<PlayTrendChart data={mockData} />);

    // Assert
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  it('should show empty message when data is empty', () => {
    // Arrange & Act
    render(<PlayTrendChart data={[]} />);

    // Assert
    expect(screen.getByText('No listening data available')).toBeInTheDocument();
  });

  it('should show empty message when data is null-ish', () => {
    // Arrange & Act
    render(
      <PlayTrendChart
        data={null as unknown as Array<{ period: string; count: number }>}
      />
    );

    // Assert
    expect(screen.getByText('No listening data available')).toBeInTheDocument();
  });

  it('should show loading skeleton when loading is true', () => {
    // Arrange & Act
    render(<PlayTrendChart data={mockData} loading={true} />);

    // Assert
    expect(screen.getByText('Play Count Over Time')).toBeInTheDocument();
    // Should NOT show the chart or empty message
    expect(
      screen.queryByTestId('responsive-container')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('No listening data available')
    ).not.toBeInTheDocument();
  });

  it('should render period selector when onPeriodChange is provided', () => {
    // Arrange
    const onPeriodChange = jest.fn();

    // Act
    render(
      <PlayTrendChart
        data={mockData}
        periodLabel='month'
        onPeriodChange={onPeriodChange}
      />
    );

    // Assert
    const select = screen.getByLabelText('Select trend period granularity');
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue('month');
  });

  it('should not render period selector when onPeriodChange is not provided', () => {
    // Arrange & Act
    render(<PlayTrendChart data={mockData} />);

    // Assert
    expect(
      screen.queryByLabelText('Select trend period granularity')
    ).not.toBeInTheDocument();
  });

  it('should call onPeriodChange when period selector is changed', async () => {
    // Arrange
    const user = userEvent.setup();
    const onPeriodChange = jest.fn();
    render(
      <PlayTrendChart
        data={mockData}
        periodLabel='month'
        onPeriodChange={onPeriodChange}
      />
    );

    // Act
    const select = screen.getByLabelText('Select trend period granularity');
    await user.selectOptions(select, 'week');

    // Assert
    expect(onPeriodChange).toHaveBeenCalledWith('week');
  });

  it('should show Monthly and Weekly options in the period selector', () => {
    // Arrange
    const onPeriodChange = jest.fn();

    // Act
    render(
      <PlayTrendChart
        data={mockData}
        periodLabel='month'
        onPeriodChange={onPeriodChange}
      />
    );

    // Assert
    expect(screen.getByText('Monthly')).toBeInTheDocument();
    expect(screen.getByText('Weekly')).toBeInTheDocument();
  });

  it('should display the selected period label in the selector', () => {
    // Arrange
    const onPeriodChange = jest.fn();

    // Act
    render(
      <PlayTrendChart
        data={mockData}
        periodLabel='week'
        onPeriodChange={onPeriodChange}
      />
    );

    // Assert
    const select = screen.getByLabelText(
      'Select trend period granularity'
    ) as unknown as { value: string };

    expect(select.value).toBe('week');
  });
});
