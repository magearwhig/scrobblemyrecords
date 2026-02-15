import { render, screen } from '@testing-library/react';
import React from 'react';

import '@testing-library/jest-dom';
import { GenreTreemap } from '../../../../src/renderer/components/stats/GenreTreemap';
import { GenreData } from '../../../../src/shared/types';

// Mock recharts to avoid rendering issues in jsdom
jest.mock('recharts', () => ({
  ResponsiveContainer: ({
    children,
  }: {
    children: React.ReactNode;
    width?: string | number;
    height?: number;
  }) => <div data-testid='responsive-container'>{children}</div>,
  Treemap: ({
    children,
    data,
  }: {
    children?: React.ReactNode;
    data?: unknown[];
  }) => (
    <div data-testid='treemap'>
      {/* Render genre names for testing */}
      {(data as Array<{ name: string; percentage: number }>)?.map(d => (
        <span key={d.name} data-testid={`genre-${d.name}`}>
          {d.name} ({d.percentage}%)
        </span>
      ))}
      {children}
    </div>
  ),
  Tooltip: () => <div data-testid='tooltip' />,
}));

describe('GenreTreemap', () => {
  const mockData: GenreData[] = [
    { name: 'rock', weight: 0.35, artistCount: 15 },
    { name: 'electronic', weight: 0.25, artistCount: 10 },
    { name: 'indie', weight: 0.2, artistCount: 8 },
    { name: 'jazz', weight: 0.12, artistCount: 5 },
    { name: 'hip-hop', weight: 0.08, artistCount: 3 },
  ];

  const defaultProps = {
    data: mockData,
    totalArtists: 30,
    loading: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render with data and show chart container', () => {
    // Arrange & Act
    render(<GenreTreemap {...defaultProps} />);

    // Assert
    expect(
      screen.getByLabelText('Genre distribution treemap')
    ).toBeInTheDocument();
    expect(screen.getByText('Your Music DNA')).toBeInTheDocument();
    expect(screen.getByTestId('treemap')).toBeInTheDocument();
  });

  it('should display description with artist count', () => {
    // Arrange & Act
    render(<GenreTreemap {...defaultProps} />);

    // Assert
    expect(
      screen.getByText(/Genre distribution based on your top 30 artists/)
    ).toBeInTheDocument();
  });

  it('should render genre names in the treemap', () => {
    // Arrange & Act
    render(<GenreTreemap {...defaultProps} />);

    // Assert
    expect(screen.getByTestId('genre-rock')).toBeInTheDocument();
    expect(screen.getByTestId('genre-electronic')).toBeInTheDocument();
    expect(screen.getByTestId('genre-indie')).toBeInTheDocument();
  });

  it('should show percentages in treemap cells', () => {
    // Arrange & Act
    render(<GenreTreemap {...defaultProps} />);

    // Assert - check content of specific genre test ids
    expect(screen.getByTestId('genre-rock').textContent).toContain('35%');
    expect(screen.getByTestId('genre-electronic').textContent).toContain('25%');
  });

  it('should show loading state with Skeleton', () => {
    // Arrange & Act
    render(<GenreTreemap {...defaultProps} loading={true} />);

    // Assert
    expect(screen.getByText('Your Music DNA')).toBeInTheDocument();
    expect(
      screen.getByText("Analyzing your top artists' tags...")
    ).toBeInTheDocument();
    // Should not render the treemap
    expect(screen.queryByTestId('treemap')).not.toBeInTheDocument();
  });

  it('should handle empty data with EmptyState', () => {
    // Arrange & Act
    render(<GenreTreemap {...defaultProps} data={[]} />);

    // Assert
    expect(screen.getByText('Your Music DNA')).toBeInTheDocument();
    expect(screen.getByText('No genre data')).toBeInTheDocument();
    expect(
      screen.getByText('Scrobble some music to see your genre distribution.')
    ).toBeInTheDocument();
    // Should not render the treemap
    expect(screen.queryByTestId('treemap')).not.toBeInTheDocument();
  });

  it('should have screen reader text with top genres', () => {
    // Arrange & Act
    render(<GenreTreemap {...defaultProps} />);

    // Assert - the sr-only text includes top 5 genres with percentages
    const srText = screen.getByLabelText(/Your top genres/);
    expect(srText).toBeInTheDocument();
  });

  it('should render chart with aria-label describing top genres', () => {
    // Arrange & Act
    render(<GenreTreemap {...defaultProps} />);

    // Assert
    const chartArea = screen.getByRole('img', {
      name: /Your top genres/,
    });
    expect(chartArea).toBeInTheDocument();
  });
});
