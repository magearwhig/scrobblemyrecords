import { render, screen } from '@testing-library/react';
import React from 'react';

import '@testing-library/jest-dom';
import { StatCard } from '../../../../src/renderer/components/stats/StatCard';

describe('StatCard', () => {
  it('should render icon, value, and label', () => {
    render(<StatCard icon='🎵' value={1234} label='Total Scrobbles' />);

    expect(screen.getByText('🎵')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
    expect(screen.getByText('Total Scrobbles')).toBeInTheDocument();
  });

  it('should format large numbers with locale string', () => {
    render(<StatCard icon='📊' value={1234567} label='Big Number' />);

    expect(screen.getByText('1,234,567')).toBeInTheDocument();
  });

  it('should render subValue when provided', () => {
    render(
      <StatCard
        icon='📊'
        value={500}
        label='This Month'
        subValue='250 this week'
      />
    );

    expect(screen.getByText('250 this week')).toBeInTheDocument();
  });

  it('should handle string value', () => {
    render(<StatCard icon='📀' value='67%' label='Coverage' />);

    expect(screen.getByText('67%')).toBeInTheDocument();
  });

  it('should not render subValue when not provided', () => {
    render(<StatCard icon='🎵' value={100} label='Test' />);

    const card = document.querySelector('.stat-card');
    expect(card).toBeInTheDocument();
    // Should not have a subvalue element
    const subValue = document.querySelector('.stat-card-subvalue');
    expect(subValue).toBeNull();
  });
});
