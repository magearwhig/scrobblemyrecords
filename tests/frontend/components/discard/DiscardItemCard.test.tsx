import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import '@testing-library/jest-dom';
import DiscardItemCard from '../../../../src/renderer/components/discard/DiscardItemCard';
import { DiscardPileItem } from '../../../../src/shared/types';

const mockFormatCurrency = (
  value: number | undefined,
  currency: string
): string => {
  if (value === undefined) return '';
  return `$${value.toFixed(2)}`;
};

const mockFormatDate = (timestamp: number): string => '2024-01-15';

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

const defaultProps = {
  item: makeItem(),
  selected: false,
  selectionMode: false,
  onEdit: jest.fn(),
  onSold: jest.fn(),
  onListed: jest.fn(),
  onTradedIn: jest.fn(),
  onRemove: jest.fn(),
  onToggleSelect: jest.fn(),
  formatCurrency: mockFormatCurrency,
  formatDate: mockFormatDate,
};

describe('DiscardItemCard', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    jest.clearAllMocks();
    user = userEvent.setup();
  });

  it('renders item title and artist', () => {
    render(<DiscardItemCard {...defaultProps} />);

    expect(screen.getByText('Test Album')).toBeInTheDocument();
    expect(screen.getByText('Test Artist')).toBeInTheDocument();
  });

  it('renders reason and status badges', () => {
    render(<DiscardItemCard {...defaultProps} />);

    expect(screen.getByText('For Sale')).toBeInTheDocument();
    expect(screen.getByText('Marked')).toBeInTheDocument();
  });

  it('renders cover image when provided', () => {
    const item = makeItem({ coverImage: 'https://example.com/cover.jpg' });
    render(<DiscardItemCard {...defaultProps} item={item} />);

    const img = screen.getByAltText('Test Album cover');
    expect(img).toHaveAttribute('src', 'https://example.com/cover.jpg');
  });

  it('renders placeholder when no cover image', () => {
    render(<DiscardItemCard {...defaultProps} />);

    expect(screen.getByText('No Image')).toBeInTheDocument();
  });

  it('renders orphaned badge when item is orphaned', () => {
    const item = makeItem({ orphaned: true });
    render(<DiscardItemCard {...defaultProps} item={item} />);

    expect(screen.getByText('Orphaned')).toBeInTheDocument();
  });

  it('does not render orphaned badge when item is not orphaned', () => {
    render(<DiscardItemCard {...defaultProps} />);

    expect(screen.queryByText('Orphaned')).not.toBeInTheDocument();
  });

  it('renders format when provided', () => {
    const item = makeItem({ format: ['Vinyl', 'LP', 'Album'] });
    render(<DiscardItemCard {...defaultProps} item={item} />);

    expect(screen.getByText('Vinyl, LP, Album')).toBeInTheDocument();
  });

  it('does not render format when not provided', () => {
    render(<DiscardItemCard {...defaultProps} />);

    expect(screen.queryByText(/Vinyl/)).not.toBeInTheDocument();
  });

  it('renders year when provided', () => {
    const item = makeItem({ year: 1985 });
    render(<DiscardItemCard {...defaultProps} item={item} />);

    expect(screen.getByText('1985')).toBeInTheDocument();
  });

  it('renders estimated value when provided', () => {
    const item = makeItem({ estimatedValue: 45.5 });
    render(<DiscardItemCard {...defaultProps} item={item} />);

    expect(screen.getByText('Est: $45.50')).toBeInTheDocument();
  });

  it('renders actual sale price when provided', () => {
    const item = makeItem({ actualSalePrice: 55 });
    render(<DiscardItemCard {...defaultProps} item={item} />);

    expect(screen.getByText('Sold: $55.00')).toBeInTheDocument();
  });

  it('renders marketplace link when provided', () => {
    const item = makeItem({
      marketplaceUrl: 'https://discogs.com/sell/item/123',
    });
    render(<DiscardItemCard {...defaultProps} item={item} />);

    const link = screen.getByText('View Listing');
    expect(link).toHaveAttribute('href', 'https://discogs.com/sell/item/123');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('does not render marketplace link when not provided', () => {
    render(<DiscardItemCard {...defaultProps} />);

    expect(screen.queryByText('View Listing')).not.toBeInTheDocument();
  });

  it('renders notes truncated to 50 chars', () => {
    const item = makeItem({
      notes:
        'This is a very long note that should be truncated after fifty characters to fit properly',
    });
    render(<DiscardItemCard {...defaultProps} item={item} />);

    expect(
      screen.getByText('This is a very long note that should be truncated ...')
    ).toBeInTheDocument();
  });

  it('renders short notes without truncation', () => {
    const item = makeItem({ notes: 'Short note' });
    render(<DiscardItemCard {...defaultProps} item={item} />);

    expect(screen.getByText('Short note')).toBeInTheDocument();
  });

  it('does not render notes when not provided', () => {
    render(<DiscardItemCard {...defaultProps} />);

    expect(screen.queryByText(/note/i)).not.toBeInTheDocument();
  });

  // Action buttons for marked status
  it('shows Listed, Sold, and Traded In buttons for marked items', () => {
    render(<DiscardItemCard {...defaultProps} />);

    expect(
      screen.getByRole('button', { name: /mark.*listed/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /mark.*sold/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /mark.*traded in/i })
    ).toBeInTheDocument();
  });

  it('shows Sold and Traded In buttons for listed items', () => {
    const item = makeItem({ status: 'listed' });
    render(<DiscardItemCard {...defaultProps} item={item} />);

    expect(
      screen.getByRole('button', { name: /mark.*sold/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /mark.*traded in/i })
    ).toBeInTheDocument();
    // Listed button should not appear for already-listed items
    expect(
      screen.queryByRole('button', { name: /mark.*listed/i })
    ).not.toBeInTheDocument();
  });

  it('hides Listed, Sold, and Traded In buttons for sold items', () => {
    const item = makeItem({ status: 'sold' });
    render(<DiscardItemCard {...defaultProps} item={item} />);

    expect(
      screen.queryByRole('button', { name: /mark.*listed/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /mark.*sold/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /mark.*traded in/i })
    ).not.toBeInTheDocument();
  });

  it('calls onEdit when Edit button is clicked', async () => {
    render(<DiscardItemCard {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: /edit test artist/i }));

    expect(defaultProps.onEdit).toHaveBeenCalledWith(defaultProps.item);
  });

  it('calls onSold when Sold button is clicked', async () => {
    render(<DiscardItemCard {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: /mark.*sold/i }));

    expect(defaultProps.onSold).toHaveBeenCalledWith(defaultProps.item);
  });

  it('calls onListed when Listed button is clicked', async () => {
    render(<DiscardItemCard {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: /mark.*listed/i }));

    expect(defaultProps.onListed).toHaveBeenCalledWith(defaultProps.item);
  });

  it('calls onTradedIn when Traded In button is clicked', async () => {
    render(<DiscardItemCard {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: /mark.*traded in/i }));

    expect(defaultProps.onTradedIn).toHaveBeenCalledWith(defaultProps.item);
  });

  it('calls onRemove when Remove button is clicked', async () => {
    render(<DiscardItemCard {...defaultProps} />);

    await user.click(
      screen.getByRole('button', { name: /remove test artist/i })
    );

    expect(defaultProps.onRemove).toHaveBeenCalledWith(defaultProps.item);
  });

  // Selection mode
  it('shows checkbox in selection mode for non-history items', () => {
    render(<DiscardItemCard {...defaultProps} selectionMode={true} />);

    expect(
      screen.getByRole('checkbox', { name: /select test artist/i })
    ).toBeInTheDocument();
  });

  it('does not show checkbox in selection mode for history items', () => {
    const item = makeItem({ status: 'sold' });
    render(
      <DiscardItemCard {...defaultProps} item={item} selectionMode={true} />
    );

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('does not show checkbox when not in selection mode', () => {
    render(<DiscardItemCard {...defaultProps} />);

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('shows checked checkbox when selected', () => {
    render(
      <DiscardItemCard {...defaultProps} selectionMode={true} selected={true} />
    );

    expect(
      screen.getByRole('checkbox', { name: /select test artist/i })
    ).toBeChecked();
  });

  it('applies selected class when selected', () => {
    const { container } = render(
      <DiscardItemCard {...defaultProps} selected={true} />
    );

    expect(container.querySelector('.discard-item-card')).toHaveClass(
      'selected'
    );
  });

  it('applies orphaned class when item is orphaned', () => {
    const item = makeItem({ orphaned: true });
    const { container } = render(
      <DiscardItemCard {...defaultProps} item={item} />
    );

    expect(container.querySelector('.discard-item-card')).toHaveClass(
      'orphaned'
    );
  });

  it('renders all reason labels correctly', () => {
    const reasons = [
      { reason: 'selling' as const, label: 'For Sale' },
      { reason: 'duplicate' as const, label: 'Duplicate' },
      { reason: 'damaged' as const, label: 'Damaged' },
      { reason: 'upgrade' as const, label: 'Upgrading' },
      { reason: 'not_listening' as const, label: 'Not Listening' },
      { reason: 'gift' as const, label: 'Giving Away' },
      { reason: 'other' as const, label: 'Other' },
    ];

    for (const { reason, label } of reasons) {
      const item = makeItem({ reason });
      const { unmount } = render(
        <DiscardItemCard {...defaultProps} item={item} />
      );
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it('renders all status labels correctly', () => {
    const statuses = [
      { status: 'marked' as const, label: 'Marked' },
      { status: 'listed' as const, label: 'Listed' },
      { status: 'sold' as const, label: 'Sold' },
      { status: 'gifted' as const, label: 'Gifted' },
      { status: 'removed' as const, label: 'Removed' },
      { status: 'traded_in' as const, label: 'Traded In' },
    ];

    for (const { status, label } of statuses) {
      const item = makeItem({ status });
      const { unmount } = render(
        <DiscardItemCard {...defaultProps} item={item} />
      );
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it('renders added date', () => {
    render(<DiscardItemCard {...defaultProps} />);

    expect(screen.getByText('Added: 2024-01-15')).toBeInTheDocument();
  });
});
