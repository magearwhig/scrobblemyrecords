import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import '@testing-library/jest-dom';
import WishlistItemCard from '../../../src/renderer/components/WishlistItemCard';
import {
  AlbumPlayCountResult,
  EnrichedWishlistItem,
} from '../../../src/shared/types';

// Mock dateUtils to avoid time-dependent flakiness
jest.mock('../../../src/renderer/utils/dateUtils', () => ({
  formatRelativeTime: jest.fn(() => '3 days ago'),
}));

const createMockItem = (
  overrides: Partial<EnrichedWishlistItem> = {}
): EnrichedWishlistItem => ({
  id: 123,
  masterId: 456,
  releaseId: 789,
  artist: 'Radiohead',
  title: 'OK Computer',
  coverImage: 'https://example.com/cover.jpg',
  dateAdded: '2025-01-15T00:00:00Z',
  vinylStatus: 'has_vinyl',
  vinylVersions: [],
  notes: '',
  rating: 0,
  ...overrides,
});

const createMockPlayCount = (
  overrides: Partial<AlbumPlayCountResult> = {}
): AlbumPlayCountResult => ({
  artist: 'Radiohead',
  title: 'OK Computer',
  playCount: 47,
  lastPlayed: 1704067200,
  matchType: 'exact',
  ...overrides,
});

const defaultProps = {
  item: createMockItem(),
  isMonitored: false,
  getStatusBadge: jest.fn(() => (
    <span className='wishlist-badge wishlist-badge-vinyl'>Vinyl</span>
  )),
  formatDate: jest.fn((d: string) => new Date(d).toLocaleDateString()),
  formatPrice: jest.fn((p: number | undefined, c: string | undefined) =>
    p !== undefined ? `$${p.toFixed(2)}` : 'N/A'
  ),
  playCount: undefined as AlbumPlayCountResult | undefined,
  onOpenVersions: jest.fn(),
  onOpenMarketplace: jest.fn(),
};

describe('WishlistItemCard', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    jest.clearAllMocks();
    user = userEvent.setup();
  });

  it('renders basic item information', () => {
    // Act
    render(<WishlistItemCard {...defaultProps} />);

    // Assert
    expect(screen.getByText('OK Computer')).toBeInTheDocument();
    expect(screen.getByText('Radiohead')).toBeInTheDocument();
  });

  it('renders cover image when available', () => {
    // Act
    render(<WishlistItemCard {...defaultProps} />);

    // Assert
    const img = screen.getByAltText('OK Computer');
    expect(img).toHaveAttribute('src', 'https://example.com/cover.jpg');
  });

  it('renders placeholder when no cover image', () => {
    // Arrange
    const item = createMockItem({ coverImage: undefined });

    // Act
    render(<WishlistItemCard {...defaultProps} item={item} />);

    // Assert
    expect(screen.getByText('No Image')).toBeInTheDocument();
  });

  it('calls onOpenVersions when Versions button is clicked', async () => {
    // Arrange
    const onOpenVersions = jest.fn();

    // Act
    render(
      <WishlistItemCard {...defaultProps} onOpenVersions={onOpenVersions} />
    );
    await user.click(screen.getByText('Versions'));

    // Assert
    expect(onOpenVersions).toHaveBeenCalledWith(defaultProps.item);
  });

  it('renders Shop button when vinyl is available', async () => {
    // Arrange
    const onOpenMarketplace = jest.fn();
    const item = createMockItem({ vinylStatus: 'has_vinyl' });

    // Act
    render(
      <WishlistItemCard
        {...defaultProps}
        item={item}
        onOpenMarketplace={onOpenMarketplace}
      />
    );
    await user.click(screen.getByText('Shop'));

    // Assert
    expect(onOpenMarketplace).toHaveBeenCalledWith(item);
  });

  it('hides Shop button when vinyl is not available', () => {
    // Arrange
    const item = createMockItem({ vinylStatus: 'cd_only' });

    // Act
    render(<WishlistItemCard {...defaultProps} item={item} />);

    // Assert
    expect(screen.queryByText('Shop')).not.toBeInTheDocument();
  });

  it('shows Monitored badge when item is monitored', () => {
    // Act
    render(<WishlistItemCard {...defaultProps} isMonitored={true} />);

    // Assert
    expect(screen.getByText('Monitored')).toBeInTheDocument();
  });

  describe('Play count badge', () => {
    it('always shows play count badge when playCount > 0', () => {
      // Arrange
      const playCount = createMockPlayCount({ playCount: 47 });

      // Act
      render(<WishlistItemCard {...defaultProps} playCount={playCount} />);

      // Assert
      const badge = screen.getByLabelText('47 plays');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('album-play-count-badge');
      expect(badge).toHaveTextContent('47 plays');
    });

    it('shows singular "play" for playCount of 1', () => {
      // Arrange
      const playCount = createMockPlayCount({ playCount: 1 });

      // Act
      render(<WishlistItemCard {...defaultProps} playCount={playCount} />);

      // Assert
      const badge = screen.getByLabelText('1 play');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('1 play');
    });

    it('hides badge when playCount is 0', () => {
      // Arrange
      const playCount = createMockPlayCount({ playCount: 0 });

      // Act
      render(<WishlistItemCard {...defaultProps} playCount={playCount} />);

      // Assert
      expect(screen.queryByLabelText(/plays/)).not.toBeInTheDocument();
    });

    it('hides badge when playCount is undefined', () => {
      // Act
      render(<WishlistItemCard {...defaultProps} playCount={undefined} />);

      // Assert
      expect(screen.queryByLabelText(/plays/)).not.toBeInTheDocument();
    });

    it('shows badge on cover image area (not in metadata)', () => {
      // Arrange
      const playCount = createMockPlayCount({ playCount: 25 });

      // Act
      render(<WishlistItemCard {...defaultProps} playCount={playCount} />);

      // Assert - Badge should be inside the image container
      const badge = screen.getByLabelText('25 plays');
      expect(badge).toBeInTheDocument();
      expect(badge.closest('.wishlist-card-image')).not.toBeNull();
    });
  });

  describe('Last played text', () => {
    it('renders "Last played X ago" when lastPlayed is available', () => {
      // Arrange
      const playCount = createMockPlayCount({
        playCount: 47,
        lastPlayed: 1704067200,
      });

      // Act
      render(<WishlistItemCard {...defaultProps} playCount={playCount} />);

      // Assert
      expect(screen.getByText('Last played 3 days ago')).toBeInTheDocument();
    });

    it('hides last played when lastPlayed is null', () => {
      // Arrange
      const playCount = createMockPlayCount({
        playCount: 10,
        lastPlayed: null,
      });

      // Act
      render(<WishlistItemCard {...defaultProps} playCount={playCount} />);

      // Assert
      expect(screen.queryByText(/Last played/)).not.toBeInTheDocument();
    });

    it('hides last played when lastPlayed is 0', () => {
      // Arrange
      const playCount = createMockPlayCount({
        playCount: 10,
        lastPlayed: 0 as unknown as number,
      });

      // Act
      render(<WishlistItemCard {...defaultProps} playCount={playCount} />);

      // Assert
      expect(screen.queryByText(/Last played/)).not.toBeInTheDocument();
    });

    it('hides last played when playCount is undefined', () => {
      // Act
      render(<WishlistItemCard {...defaultProps} playCount={undefined} />);

      // Assert
      expect(screen.queryByText(/Last played/)).not.toBeInTheDocument();
    });
  });

  describe('Price display', () => {
    it('renders price when available', () => {
      // Arrange
      const item = createMockItem({
        lowestVinylPrice: 28.0,
        priceCurrency: 'USD',
      });

      // Act
      render(<WishlistItemCard {...defaultProps} item={item} />);

      // Assert
      expect(defaultProps.formatPrice).toHaveBeenCalledWith(28.0, 'USD');
    });

    it('hides price when not available', () => {
      // Arrange
      const item = createMockItem({ lowestVinylPrice: undefined });

      // Act
      render(<WishlistItemCard {...defaultProps} item={item} />);

      // Assert
      expect(screen.queryByText(/From:/)).not.toBeInTheDocument();
    });
  });
});
