import { render, screen } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';

import AnalyticsOverviewSection from '../../../../src/renderer/components/collection-analytics/AnalyticsOverviewSection';
import { CollectionAnalyticsOverview } from '../../../../src/shared/types';

// Mock recharts (does not render in jsdom)
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='responsive-container'>{children}</div>
  ),
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='pie-chart'>{children}</div>
  ),
  Pie: () => null,
  Cell: () => null,
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='bar-chart'>{children}</div>
  ),
  Bar: () => null,
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='area-chart'>{children}</div>
  ),
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

function createMockOverview(
  overrides: Partial<CollectionAnalyticsOverview> = {}
): CollectionAnalyticsOverview {
  return {
    summary: {
      totalItems: 100,
      totalArtists: 50,
      totalLabels: 30,
      oldestRelease: { year: 1960, artist: 'Beatles', title: 'Abbey Road' },
      newestRelease: {
        year: 2024,
        artist: 'Modern Artist',
        title: 'New Album',
      },
      oldestAddition: {
        date: '2020-01-01',
        artist: 'First Add',
        title: 'First',
      },
      newestAddition: {
        date: '2024-12-01',
        artist: 'Last Add',
        title: 'Latest',
      },
      averageReleaseYear: 1990,
      ratedCount: 25,
      averageRating: 4.2,
    },
    formats: {
      categories: [
        { name: 'LP (12")', count: 60, percentage: 60, examples: [] },
        { name: 'CD', count: 30, percentage: 30, examples: [] },
        { name: '7" Single', count: 10, percentage: 10, examples: [] },
      ],
      totalItems: 100,
    },
    labels: {
      labels: [
        {
          name: 'Blue Note',
          count: 15,
          percentage: 15,
          variants: ['Blue Note', 'Blue Note Records'],
        },
        { name: 'Warp', count: 10, percentage: 10, variants: ['Warp Records'] },
      ],
      totalLabels: 30,
      totalItems: 100,
    },
    decades: {
      decades: [
        { decade: '1960s', startYear: 1960, count: 10, percentage: 10 },
        { decade: '1990s', startYear: 1990, count: 40, percentage: 40 },
        { decade: '2000s', startYear: 2000, count: 30, percentage: 30 },
      ],
      years: [
        { year: 1965, count: 5 },
        { year: 1995, count: 20 },
      ],
      unknownYearCount: 5,
    },
    growth: {
      dataPoints: [
        { period: '2020-01', added: 10, cumulative: 10 },
        { period: '2020-06', added: 20, cumulative: 30 },
      ],
      granularity: 'month',
      totalAdded: 100,
    },
    ...overrides,
  };
}

describe('AnalyticsOverviewSection', () => {
  it('renders all four summary cards with correct values', () => {
    // Arrange
    const overview = createMockOverview();

    // Act
    render(<AnalyticsOverviewSection overview={overview} />);

    // Assert
    expect(screen.getByText('Total Records')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();

    expect(screen.getByText('Total Artists')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();

    expect(screen.getByText('Total Labels')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();

    expect(screen.getByText('Avg Release Year')).toBeInTheDocument();
    expect(screen.getByText('1990')).toBeInTheDocument();
  });

  it('renders N/A for averageReleaseYear when null', () => {
    // Arrange
    const overview = createMockOverview({
      summary: {
        totalItems: 10,
        totalArtists: 5,
        totalLabels: 3,
        oldestRelease: null,
        newestRelease: null,
        oldestAddition: null,
        newestAddition: null,
        averageReleaseYear: null,
        ratedCount: 0,
        averageRating: null,
      },
    });

    // Act
    render(<AnalyticsOverviewSection overview={overview} />);

    // Assert
    expect(screen.getByText('Avg Release Year')).toBeInTheDocument();
    expect(screen.getByText('N/A')).toBeInTheDocument();
  });

  it('renders the Format Breakdown chart section', () => {
    // Arrange
    const overview = createMockOverview();

    // Act
    render(<AnalyticsOverviewSection overview={overview} />);

    // Assert
    expect(screen.getByText('Format Breakdown')).toBeInTheDocument();
    // Mocked PieChart should render
    expect(screen.getAllByTestId('pie-chart').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the Top Labels chart section', () => {
    // Arrange
    const overview = createMockOverview();

    // Act
    render(<AnalyticsOverviewSection overview={overview} />);

    // Assert
    expect(screen.getByText('Top Labels')).toBeInTheDocument();
    // Mocked BarChart should render
    expect(screen.getAllByTestId('bar-chart').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the Decade Distribution chart section', () => {
    // Arrange
    const overview = createMockOverview();

    // Act
    render(<AnalyticsOverviewSection overview={overview} />);

    // Assert
    expect(screen.getByText('Decade Distribution')).toBeInTheDocument();
  });

  it('renders the Collection Growth chart section', () => {
    // Arrange
    const overview = createMockOverview();

    // Act
    render(<AnalyticsOverviewSection overview={overview} />);

    // Assert
    expect(screen.getByText('Collection Growth')).toBeInTheDocument();
    // Mocked AreaChart should render
    expect(screen.getAllByTestId('area-chart').length).toBeGreaterThanOrEqual(
      1
    );
  });

  it('renders format legend items with counts and percentages', () => {
    // Arrange
    const overview = createMockOverview();

    // Act
    render(<AnalyticsOverviewSection overview={overview} />);

    // Assert: check legend entries
    expect(screen.getByText('LP (12")')).toBeInTheDocument();
    expect(screen.getByText('60 (60%)')).toBeInTheDocument();
    expect(screen.getByText('CD')).toBeInTheDocument();
    expect(screen.getByText('30 (30%)')).toBeInTheDocument();
    expect(screen.getByText('7" Single')).toBeInTheDocument();
    expect(screen.getByText('10 (10%)')).toBeInTheDocument();
  });

  it('handles zero values in summary without crashing', () => {
    // Arrange
    const overview = createMockOverview({
      summary: {
        totalItems: 0,
        totalArtists: 0,
        totalLabels: 0,
        oldestRelease: null,
        newestRelease: null,
        oldestAddition: null,
        newestAddition: null,
        averageReleaseYear: null,
        ratedCount: 0,
        averageRating: null,
      },
      formats: { categories: [], totalItems: 0 },
      labels: { labels: [], totalLabels: 0, totalItems: 0 },
      decades: { decades: [], years: [], unknownYearCount: 0 },
      growth: { dataPoints: [], granularity: 'month', totalAdded: 0 },
    });

    // Act
    render(<AnalyticsOverviewSection overview={overview} />);

    // Assert: summary cards render with 0
    expect(screen.getByText('Total Records')).toBeInTheDocument();
    const zeroValues = screen.getAllByText('0');
    expect(zeroValues.length).toBeGreaterThanOrEqual(3);
  });

  it('renders responsive containers for all chart sections', () => {
    // Arrange
    const overview = createMockOverview();

    // Act
    render(<AnalyticsOverviewSection overview={overview} />);

    // Assert: four responsive containers (format donut, top labels bar, decade bar, growth area)
    const containers = screen.getAllByTestId('responsive-container');
    expect(containers).toHaveLength(4);
  });

  it('renders screen-reader text for format chart', () => {
    // Arrange
    const overview = createMockOverview();

    // Act
    render(<AnalyticsOverviewSection overview={overview} />);

    // Assert: sr-only text about format distribution
    expect(
      screen.getByText(/Donut chart showing record format distribution/i)
    ).toBeInTheDocument();
  });

  it('renders screen-reader text mentioning unknown year count when > 0', () => {
    // Arrange
    const overview = createMockOverview();

    // Act
    render(<AnalyticsOverviewSection overview={overview} />);

    // Assert
    expect(
      screen.getByText(/5 records have no release year/i)
    ).toBeInTheDocument();
  });

  it('formats large numbers with locale separators', () => {
    // Arrange
    const overview = createMockOverview({
      summary: {
        totalItems: 12345,
        totalArtists: 6789,
        totalLabels: 1234,
        oldestRelease: null,
        newestRelease: null,
        oldestAddition: null,
        newestAddition: null,
        averageReleaseYear: 1995,
        ratedCount: 0,
        averageRating: null,
      },
    });

    // Act
    render(<AnalyticsOverviewSection overview={overview} />);

    // Assert: toLocaleString formats with commas
    expect(screen.getByText('12,345')).toBeInTheDocument();
    expect(screen.getByText('6,789')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });
});
