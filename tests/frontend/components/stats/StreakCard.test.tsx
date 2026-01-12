import { render, screen } from '@testing-library/react';
import React from 'react';

import '@testing-library/jest-dom';
import { StreakCard } from '../../../../src/renderer/components/stats/StreakCard';
import { StreakInfo } from '../../../../src/shared/types';

describe('StreakCard', () => {
  const mockStreaks: StreakInfo = {
    currentStreak: 15,
    longestStreak: 45,
  };

  it('should render current streak', () => {
    render(<StreakCard streaks={mockStreaks} />);

    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('should show fire icon for active streak', () => {
    render(<StreakCard streaks={mockStreaks} />);

    expect(screen.getByText('🔥')).toBeInTheDocument();
  });

  it('should show streak label', () => {
    render(<StreakCard streaks={mockStreaks} />);

    expect(screen.getByText(/streak/i)).toBeInTheDocument();
  });

  it('should show best streak', () => {
    render(<StreakCard streaks={mockStreaks} />);

    expect(screen.getByText(/Best.*45/)).toBeInTheDocument();
  });

  it('should handle zero streak', () => {
    const zeroStreaks: StreakInfo = {
      currentStreak: 0,
      longestStreak: 30,
    };

    render(<StreakCard streaks={zeroStreaks} />);

    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('should display days label', () => {
    render(<StreakCard streaks={mockStreaks} />);

    // Should show "days streak" for the current streak
    expect(screen.getByText(/days streak/i)).toBeInTheDocument();
  });
});
