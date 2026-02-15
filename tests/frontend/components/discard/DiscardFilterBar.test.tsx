import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import '@testing-library/jest-dom';
import DiscardFilterBar from '../../../../src/renderer/components/discard/DiscardFilterBar';
import { DiscardPileItem } from '../../../../src/shared/types';

jest.mock('../../../../src/renderer/hooks/useTabKeyNavigation', () => ({
  useTabKeyNavigation: () => jest.fn(),
}));

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

const defaultItems: DiscardPileItem[] = [
  makeItem({ id: '1', status: 'marked' }),
  makeItem({ id: '2', status: 'marked' }),
  makeItem({ id: '3', status: 'listed' }),
  makeItem({ id: '4', status: 'sold' }),
  makeItem({ id: '5', status: 'gifted' }),
  makeItem({ id: '6', orphaned: true, status: 'marked' }),
];

const defaultProps = {
  items: defaultItems,
  activeTab: 'all' as const,
  onTabChange: jest.fn(),
  sortBy: 'date' as const,
  onSortChange: jest.fn(),
  searchQuery: '',
  onSearchChange: jest.fn(),
};

describe('DiscardFilterBar', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    jest.clearAllMocks();
    user = userEvent.setup();
  });

  it('renders all tab buttons with correct labels and counts', () => {
    render(<DiscardFilterBar {...defaultProps} />);

    // Active tab: items NOT in history statuses: 4 items (marked x3 + listed x1)
    expect(
      screen.getByRole('tab', { name: /Active \(4\)/ })
    ).toBeInTheDocument();
    // Pending: marked items = 3
    expect(
      screen.getByRole('tab', { name: /Pending \(3\)/ })
    ).toBeInTheDocument();
    // Listed: 1
    expect(
      screen.getByRole('tab', { name: /Listed \(1\)/ })
    ).toBeInTheDocument();
    // History: sold + gifted = 2
    expect(
      screen.getByRole('tab', { name: /History \(2\)/ })
    ).toBeInTheDocument();
    // Orphaned: 1
    expect(
      screen.getByRole('tab', { name: /Orphaned \(1\)/ })
    ).toBeInTheDocument();
  });

  it('marks the active tab with aria-selected true', () => {
    render(<DiscardFilterBar {...defaultProps} activeTab='listed' />);

    expect(screen.getByRole('tab', { name: /Listed/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tab', { name: /Active/ })).toHaveAttribute(
      'aria-selected',
      'false'
    );
  });

  it('calls onTabChange when a tab is clicked', async () => {
    render(<DiscardFilterBar {...defaultProps} />);

    await user.click(screen.getByRole('tab', { name: /History/ }));

    expect(defaultProps.onTabChange).toHaveBeenCalledWith('history');
  });

  it('renders search input with correct value and calls onSearchChange', async () => {
    render(<DiscardFilterBar {...defaultProps} searchQuery='test query' />);

    const searchInput = screen.getByRole('textbox', {
      name: 'Search discard pile items',
    });
    expect(searchInput).toHaveValue('test query');

    await user.clear(searchInput);
    await user.type(searchInput, 'new search');

    expect(defaultProps.onSearchChange).toHaveBeenCalled();
  });

  it('renders sort select with correct value and calls onSortChange', async () => {
    render(<DiscardFilterBar {...defaultProps} sortBy='artist' />);

    const sortSelect = screen.getByRole('combobox', {
      name: 'Sort discard pile items',
    });
    expect(sortSelect).toHaveValue('artist');

    await user.selectOptions(sortSelect, 'title');

    expect(defaultProps.onSortChange).toHaveBeenCalledWith('title');
  });

  it('renders all sort options', () => {
    render(<DiscardFilterBar {...defaultProps} />);

    const sortSelect = screen.getByRole('combobox', {
      name: 'Sort discard pile items',
    });
    const options = sortSelect.querySelectorAll('option');
    expect(options).toHaveLength(5);
  });

  it('shows zero counts when items list is empty', () => {
    render(<DiscardFilterBar {...defaultProps} items={[]} />);

    expect(
      screen.getByRole('tab', { name: /Active \(0\)/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: /Pending \(0\)/ })
    ).toBeInTheDocument();
  });
});
