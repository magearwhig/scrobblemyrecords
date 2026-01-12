import { render, screen } from '@testing-library/react';
import React from 'react';

import '@testing-library/jest-dom';
import { ListeningHoursCard } from '../../../../src/renderer/components/stats/ListeningHoursCard';
import { ListeningHours } from '../../../../src/shared/types';

describe('ListeningHoursCard', () => {
  const mockHours: ListeningHours = {
    today: 2.5,
    thisWeek: 15.3,
    thisMonth: 62.8,
  };

  it('should render listening hours icon', () => {
    render(<ListeningHoursCard hours={mockHours} />);

    expect(screen.getByText('⏱️')).toBeInTheDocument();
  });

  it('should display this month hours as main value', () => {
    render(<ListeningHoursCard hours={mockHours} />);

    // Should format as hours with h suffix
    expect(screen.getByText('62.8h')).toBeInTheDocument();
  });

  it('should show label', () => {
    render(<ListeningHoursCard hours={mockHours} />);

    expect(screen.getByText(/Listening This Month/i)).toBeInTheDocument();
  });

  it('should show week and today hours in subvalue', () => {
    render(<ListeningHoursCard hours={mockHours} />);

    expect(screen.getByText(/15.3h/)).toBeInTheDocument();
    expect(screen.getByText(/2.5h/)).toBeInTheDocument();
  });

  it('should handle zero hours', () => {
    const zeroHours: ListeningHours = {
      today: 0,
      thisWeek: 0,
      thisMonth: 0,
    };

    render(<ListeningHoursCard hours={zeroHours} />);

    // 0 hours should show as 0m (minutes)
    expect(screen.getByText('0m')).toBeInTheDocument();
  });

  it('should show minutes for less than 1 hour', () => {
    const shortHours: ListeningHours = {
      today: 0.5,
      thisWeek: 0.5,
      thisMonth: 0.5,
    };

    render(<ListeningHoursCard hours={shortHours} />);

    expect(screen.getByText('30m')).toBeInTheDocument();
  });
});
