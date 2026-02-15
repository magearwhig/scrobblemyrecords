import { render, screen } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';

import FormatDetailSection from '../../../../src/renderer/components/collection-analytics/FormatDetailSection';
import { FormatBreakdown } from '../../../../src/shared/types';

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
  Tooltip: () => null,
}));

function createMockFormats(
  overrides: Partial<FormatBreakdown> = {}
): FormatBreakdown {
  return {
    categories: [
      { name: 'LP (12")', count: 60, percentage: 60, examples: [] },
      { name: 'CD', count: 30, percentage: 30, examples: [] },
      {
        name: '7" Single',
        count: 10,
        percentage: 10,
        examples: [
          { artist: 'The Smiths', title: 'How Soon Is Now?' },
          { artist: 'Joy Division', title: 'Love Will Tear Us Apart' },
          { artist: 'New Order', title: 'Blue Monday' },
          { artist: 'Extra', title: 'Extra Item' },
        ],
      },
    ],
    totalItems: 100,
    ...overrides,
  };
}

describe('FormatDetailSection', () => {
  it('renders the Format Distribution heading', () => {
    // Arrange
    const formats = createMockFormats();

    // Act
    render(<FormatDetailSection formats={formats} />);

    // Assert
    expect(screen.getByText('Format Distribution')).toBeInTheDocument();
  });

  it('renders all format categories in the list', () => {
    // Arrange
    const formats = createMockFormats();

    // Act
    render(<FormatDetailSection formats={formats} />);

    // Assert
    expect(screen.getByText('LP (12")')).toBeInTheDocument();
    expect(screen.getByText('CD')).toBeInTheDocument();
    expect(screen.getByText('7" Single')).toBeInTheDocument();
  });

  it('renders counts and percentages for each format', () => {
    // Arrange
    const formats = createMockFormats();

    // Act
    render(<FormatDetailSection formats={formats} />);

    // Assert
    expect(screen.getByText('60 (60%)')).toBeInTheDocument();
    expect(screen.getByText('30 (30%)')).toBeInTheDocument();
    expect(screen.getByText('10 (10%)')).toBeInTheDocument();
  });

  it('renders the donut chart container', () => {
    // Arrange
    const formats = createMockFormats();

    // Act
    render(<FormatDetailSection formats={formats} />);

    // Assert
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
  });

  it('renders chart with correct aria-label', () => {
    // Arrange
    const formats = createMockFormats();

    // Act
    render(<FormatDetailSection formats={formats} />);

    // Assert
    const chartCard = screen.getByRole('img');
    expect(chartCard).toHaveAttribute(
      'aria-label',
      'Donut chart showing format distribution across your collection'
    );
  });

  it('renders screen-reader text with format distribution summary', () => {
    // Arrange
    const formats = createMockFormats();

    // Act
    render(<FormatDetailSection formats={formats} />);

    // Assert
    expect(
      screen.getByText(/Format distribution across 100 items/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/LP \(12"\): 60 records \(60%\)/)
    ).toBeInTheDocument();
  });

  it('renders example items for formats that have them (up to 3)', () => {
    // Arrange
    const formats = createMockFormats();

    // Act
    render(<FormatDetailSection formats={formats} />);

    // Assert: shows first 3 examples from 7" Single
    expect(
      screen.getByText(/The Smiths - How Soon Is Now\?/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Joy Division - Love Will Tear Us Apart/)
    ).toBeInTheDocument();
    expect(screen.getByText(/New Order - Blue Monday/)).toBeInTheDocument();
    // 4th example should NOT appear
    expect(screen.queryByText(/Extra - Extra Item/)).not.toBeInTheDocument();
  });

  it('does not render example section for formats with no examples', () => {
    // Arrange
    const formats: FormatBreakdown = {
      categories: [{ name: 'LP', count: 50, percentage: 100, examples: [] }],
      totalItems: 50,
    };

    // Act
    render(<FormatDetailSection formats={formats} />);

    // Assert
    expect(screen.getByText('LP')).toBeInTheDocument();
    expect(screen.getByText('50 (100%)')).toBeInTheDocument();
    // No variants/examples span should be in the DOM
    const detailItems = document.querySelectorAll('.analytics-detail-variants');
    expect(detailItems).toHaveLength(0);
  });

  it('handles a single format category', () => {
    // Arrange
    const formats: FormatBreakdown = {
      categories: [{ name: 'Vinyl', count: 42, percentage: 100, examples: [] }],
      totalItems: 42,
    };

    // Act
    render(<FormatDetailSection formats={formats} />);

    // Assert
    expect(screen.getByText('Vinyl')).toBeInTheDocument();
    expect(screen.getByText('42 (100%)')).toBeInTheDocument();
    expect(
      screen.getByText(/Format distribution across 42 items/)
    ).toBeInTheDocument();
  });

  it('handles empty categories array without crashing', () => {
    // Arrange
    const formats: FormatBreakdown = {
      categories: [],
      totalItems: 0,
    };

    // Act
    render(<FormatDetailSection formats={formats} />);

    // Assert
    expect(screen.getByText('Format Distribution')).toBeInTheDocument();
    expect(
      screen.getByText(/Format distribution across 0 items/)
    ).toBeInTheDocument();
    // No list items rendered
    const listItems = document.querySelectorAll('.analytics-detail-item');
    expect(listItems).toHaveLength(0);
  });

  it('formats large counts with locale separators', () => {
    // Arrange
    const formats: FormatBreakdown = {
      categories: [
        { name: 'LP', count: 12345, percentage: 80, examples: [] },
        { name: 'CD', count: 3086, percentage: 20, examples: [] },
      ],
      totalItems: 15431,
    };

    // Act
    render(<FormatDetailSection formats={formats} />);

    // Assert
    expect(screen.getByText('12,345 (80%)')).toBeInTheDocument();
    expect(screen.getByText('3,086 (20%)')).toBeInTheDocument();
  });

  it('renders list items as <li> elements', () => {
    // Arrange
    const formats = createMockFormats();

    // Act
    render(<FormatDetailSection formats={formats} />);

    // Assert
    const listItems = screen.getAllByRole('listitem');
    expect(listItems).toHaveLength(3);
  });
});
