import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import '@testing-library/jest-dom';
import { CalendarHeatmap } from '../../../../src/renderer/components/stats/CalendarHeatmap';
import { CalendarHeatmapData } from '../../../../src/shared/types';

describe('CalendarHeatmap', () => {
  const mockOnYearChange = jest.fn();
  const currentYear = new Date().getFullYear();

  const mockData: CalendarHeatmapData[] = [
    { date: `${currentYear}-01-01`, count: 5 },
    { date: `${currentYear}-01-15`, count: 15 },
    { date: `${currentYear}-02-20`, count: 25 },
    { date: `${currentYear}-03-10`, count: 10 },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render the heatmap title', () => {
    render(
      <CalendarHeatmap
        data={mockData}
        year={currentYear}
        onYearChange={mockOnYearChange}
      />
    );

    expect(screen.getByText(/listening activity/i)).toBeInTheDocument();
  });

  it('should display the year in the dropdown', () => {
    render(
      <CalendarHeatmap
        data={mockData}
        year={currentYear}
        onYearChange={mockOnYearChange}
      />
    );

    const select = screen.getByRole('combobox');
    expect(select).toHaveValue(String(currentYear));
  });

  it('should render year selection dropdown', () => {
    render(
      <CalendarHeatmap
        data={mockData}
        year={currentYear}
        onYearChange={mockOnYearChange}
      />
    );

    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();

    // Should have options for current year and previous 2 years
    const options = screen.getAllByRole('option');
    expect(options.length).toBe(3);
  });

  it('should call onYearChange when a different year is selected', () => {
    render(
      <CalendarHeatmap
        data={mockData}
        year={currentYear}
        onYearChange={mockOnYearChange}
      />
    );

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: String(currentYear - 1) } });

    expect(mockOnYearChange).toHaveBeenCalledWith(currentYear - 1);
  });

  it('should render month labels', () => {
    render(
      <CalendarHeatmap
        data={mockData}
        year={currentYear}
        onYearChange={mockOnYearChange}
      />
    );

    // Should show some month labels
    expect(screen.getByText('Jan')).toBeInTheDocument();
  });

  it('should render legend', () => {
    render(
      <CalendarHeatmap
        data={mockData}
        year={currentYear}
        onYearChange={mockOnYearChange}
      />
    );

    // The legend has "Less" and "More" labels
    const lessLabels = screen.getAllByText(/less/i);
    const moreLabels = screen.getAllByText(/more/i);
    expect(lessLabels.length).toBeGreaterThan(0);
    expect(moreLabels.length).toBeGreaterThan(0);
  });

  it('should handle empty data', () => {
    render(
      <CalendarHeatmap
        data={[]}
        year={currentYear}
        onYearChange={mockOnYearChange}
      />
    );

    const select = screen.getByRole('combobox');
    expect(select).toHaveValue(String(currentYear));
  });

  it('should not render year select when onYearChange is not provided', () => {
    render(<CalendarHeatmap data={mockData} year={currentYear} />);

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('should render day labels', () => {
    render(
      <CalendarHeatmap
        data={mockData}
        year={currentYear}
        onYearChange={mockOnYearChange}
      />
    );

    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Wed')).toBeInTheDocument();
    expect(screen.getByText('Fri')).toBeInTheDocument();
  });

  it('should have correct year options available', () => {
    render(
      <CalendarHeatmap
        data={mockData}
        year={currentYear}
        onYearChange={mockOnYearChange}
      />
    );

    // Available years should be currentYear - 2, currentYear - 1, currentYear
    expect(
      screen.getByRole('option', { name: String(currentYear) })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: String(currentYear - 1) })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: String(currentYear - 2) })
    ).toBeInTheDocument();
  });
});
