import { render, screen } from '@testing-library/react';
import React from 'react';

import '@testing-library/jest-dom';
import DiscardStatsBar from '../../../../src/renderer/components/discard/DiscardStatsBar';
import {
  DiscardPileItem,
  DiscardPileStats,
} from '../../../../src/shared/types';

const mockFormatCurrency = (
  value: number | undefined,
  currency: string
): string => {
  if (value === undefined) return '';
  return `$${value.toFixed(2)}`;
};

const defaultStats: DiscardPileStats = {
  totalItems: 15,
  byStatus: {
    marked: 5,
    listed: 3,
    sold: 4,
    gifted: 1,
    removed: 1,
    traded_in: 1,
  },
  byReason: {
    selling: 5,
    duplicate: 3,
    damaged: 2,
    upgrade: 2,
    not_listening: 1,
    gift: 1,
    other: 1,
  },
  totalEstimatedValue: 250,
  totalActualSales: 120,
  currency: 'USD',
};

const makeItem = (
  overrides: Partial<DiscardPileItem> = {}
): DiscardPileItem => ({
  id: 'item-1',
  collectionItemId: 100,
  releaseId: 200,
  artist: 'Test Artist',
  title: 'Test Album',
  reason: 'selling',
  addedAt: 1700000000,
  status: 'marked',
  statusChangedAt: 1700000000,
  currency: 'USD',
  orphaned: false,
  ...overrides,
});

describe('DiscardStatsBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders all stat cards with correct values', () => {
    const filteredItems = [
      makeItem({ estimatedValue: 30, actualSalePrice: 25 }),
      makeItem({ id: 'item-2', estimatedValue: 20 }),
    ];

    render(
      <DiscardStatsBar
        stats={defaultStats}
        filteredItems={filteredItems}
        formatCurrency={mockFormatCurrency}
      />
    );

    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('Total Items')).toBeInTheDocument();

    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Listed')).toBeInTheDocument();
  });

  it('calculates history count from sold, gifted, removed, traded_in statuses', () => {
    const filteredItems: DiscardPileItem[] = [];

    render(
      <DiscardStatsBar
        stats={defaultStats}
        filteredItems={filteredItems}
        formatCurrency={mockFormatCurrency}
      />
    );

    // sold(4) + gifted(1) + removed(1) + traded_in(1) = 7
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('History')).toBeInTheDocument();
  });

  it('calculates filtered estimated value from filtered items', () => {
    const filteredItems = [
      makeItem({ estimatedValue: 50 }),
      makeItem({ id: 'item-2', estimatedValue: 75 }),
      makeItem({ id: 'item-3' }), // no estimatedValue
    ];

    render(
      <DiscardStatsBar
        stats={defaultStats}
        filteredItems={filteredItems}
        formatCurrency={mockFormatCurrency}
      />
    );

    expect(screen.getByText('$125.00')).toBeInTheDocument();
    expect(screen.getByText('Est. Value')).toBeInTheDocument();
  });

  it('calculates filtered actual sales from filtered items', () => {
    const filteredItems = [
      makeItem({ actualSalePrice: 40 }),
      makeItem({ id: 'item-2', actualSalePrice: 60 }),
    ];

    render(
      <DiscardStatsBar
        stats={defaultStats}
        filteredItems={filteredItems}
        formatCurrency={mockFormatCurrency}
      />
    );

    expect(screen.getByText('$100.00')).toBeInTheDocument();
    expect(screen.getByText('Actual Sales')).toBeInTheDocument();
  });

  it('handles empty filtered items with zero values', () => {
    render(
      <DiscardStatsBar
        stats={defaultStats}
        filteredItems={[]}
        formatCurrency={mockFormatCurrency}
      />
    );

    const zeroValues = screen.getAllByText('$0.00');
    expect(zeroValues).toHaveLength(2); // est value and actual sales
  });

  it('handles stats with zero byStatus values', () => {
    const zeroStats: DiscardPileStats = {
      ...defaultStats,
      totalItems: 0,
      byStatus: {
        marked: 0,
        listed: 0,
        sold: 0,
        gifted: 0,
        removed: 0,
        traded_in: 0,
      },
    };

    render(
      <DiscardStatsBar
        stats={zeroStats}
        filteredItems={[]}
        formatCurrency={mockFormatCurrency}
      />
    );

    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(4);
  });
});
