import { render, screen } from '@testing-library/react';
import React from 'react';

import '@testing-library/jest-dom';
import LabelDetailSection from '../../../../src/renderer/components/collection-analytics/LabelDetailSection';

jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Bar: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  Cell: () => <div />,
}));

describe('LabelDetailSection', () => {
  it('links each real label to its page and leaves placeholders as text', () => {
    render(
      <LabelDetailSection
        labels={{
          labels: [
            {
              name: 'Sub Pop',
              count: 29,
              percentage: 2.4,
              variants: ['Sub Pop', 'Sub Pop Records'],
            },
            { name: 'Not On Label', count: 4, percentage: 0.3, variants: [] },
          ],
          totalLabels: 2,
          totalItems: 1197,
        }}
      />
    );

    expect(
      screen.getByRole('link', { name: 'View label details for Sub Pop' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /not on label/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText('Not On Label')).toBeInTheDocument();
  });
});
