import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import '@testing-library/jest-dom';
import { PeriodStatCard } from '../../../../src/renderer/components/stats/PeriodStatCard';

describe('PeriodStatCard', () => {
  const mockOnPeriodChange = jest.fn();

  const mockValues = {
    month: { value: '67%', subValue: '100 of 150 albums this month' },
    year: { value: '85%', subValue: '127 of 150 albums this year' },
    days30: { value: '70%', subValue: '105 of 150 albums in 30 days' },
    days90: { value: '80%', subValue: '120 of 150 albums in 90 days' },
    days365: { value: '90%', subValue: '135 of 150 albums in 365 days' },
    allTime: { value: '95%', subValue: '142 of 150 albums ever played' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render icon, value, and label', () => {
    render(
      <PeriodStatCard
        icon='📀'
        values={mockValues}
        label='Collection Coverage'
        currentPeriod='month'
        onPeriodChange={mockOnPeriodChange}
      />
    );

    expect(screen.getByText('📀')).toBeInTheDocument();
    expect(screen.getByText('67%')).toBeInTheDocument();
    expect(screen.getByText('Collection Coverage')).toBeInTheDocument();
  });

  it('should show subValue for current period', () => {
    render(
      <PeriodStatCard
        icon='📀'
        values={mockValues}
        label='Coverage'
        currentPeriod='month'
        onPeriodChange={mockOnPeriodChange}
      />
    );

    expect(
      screen.getByText('100 of 150 albums this month')
    ).toBeInTheDocument();
  });

  it('should render period selector dropdown', () => {
    render(
      <PeriodStatCard
        icon='📀'
        values={mockValues}
        label='Coverage'
        currentPeriod='month'
        onPeriodChange={mockOnPeriodChange}
      />
    );

    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('should call onPeriodChange when dropdown selection changes', () => {
    render(
      <PeriodStatCard
        icon='📀'
        values={mockValues}
        label='Coverage'
        currentPeriod='month'
        onPeriodChange={mockOnPeriodChange}
      />
    );

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'year' } });

    expect(mockOnPeriodChange).toHaveBeenCalledWith('year');
  });

  it('should display year values when year is selected', () => {
    render(
      <PeriodStatCard
        icon='📀'
        values={mockValues}
        label='Coverage'
        currentPeriod='year'
        onPeriodChange={mockOnPeriodChange}
      />
    );

    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText('127 of 150 albums this year')).toBeInTheDocument();
  });

  it('should display allTime values when allTime is selected', () => {
    render(
      <PeriodStatCard
        icon='📀'
        values={mockValues}
        label='Coverage'
        currentPeriod='allTime'
        onPeriodChange={mockOnPeriodChange}
      />
    );

    expect(screen.getByText('95%')).toBeInTheDocument();
    expect(
      screen.getByText('142 of 150 albums ever played')
    ).toBeInTheDocument();
  });

  it('should have all period options in dropdown', () => {
    render(
      <PeriodStatCard
        icon='📀'
        values={mockValues}
        label='Coverage'
        currentPeriod='month'
        onPeriodChange={mockOnPeriodChange}
      />
    );

    const select = screen.getByRole('combobox');
    const options = select.querySelectorAll('option');

    expect(options).toHaveLength(6); // month, year, days30, days90, days365, allTime
  });
});
