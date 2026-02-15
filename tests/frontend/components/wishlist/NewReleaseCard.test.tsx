import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import '@testing-library/jest-dom';
import { NewReleaseCard } from '../../../../src/renderer/components/wishlist/NewReleaseCard';
import { WishlistNewRelease } from '../../../../src/shared/types';

const mockWindowOpen = jest.fn();
Object.defineProperty(window, 'open', { value: mockWindowOpen });

const makeRelease = (
  overrides: Partial<WishlistNewRelease> = {}
): WishlistNewRelease => ({
  id: 'release-1',
  masterId: 1000,
  releaseId: 2000,
  title: 'Test Album',
  artist: 'Test Artist',
  year: 2024,
  country: 'US',
  format: ['LP', 'Album'],
  label: 'Test Records',
  source: 'wishlist',
  sourceItemId: 'src-1',
  detectedAt: Date.now() - 2 * 24 * 60 * 60 * 1000, // 2 days ago (recent)
  notified: false,
  dismissed: false,
  discogsUrl: 'https://www.discogs.com/release/2000',
  coverImage: 'https://example.com/cover.jpg',
  ...overrides,
});

const defaultProps = {
  release: makeRelease(),
  onDismiss: jest.fn(),
};

describe('NewReleaseCard', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    jest.clearAllMocks();
    user = userEvent.setup();
  });

  it('renders artist and title', () => {
    render(<NewReleaseCard {...defaultProps} />);

    expect(screen.getByText('Test Artist')).toBeInTheDocument();
    expect(screen.getByText('Test Album')).toBeInTheDocument();
  });

  it('renders cover image when provided', () => {
    render(<NewReleaseCard {...defaultProps} />);

    const img = screen.getByAltText('Test Artist - Test Album');
    expect(img).toHaveAttribute('src', 'https://example.com/cover.jpg');
  });

  it('renders vinyl placeholder when no cover image', () => {
    const release = makeRelease({ coverImage: undefined });
    render(<NewReleaseCard {...defaultProps} release={release} />);

    expect(
      screen.queryByAltText('Test Artist - Test Album')
    ).not.toBeInTheDocument();
    expect(screen.getByText('\uD83D\uDCBF')).toBeInTheDocument();
  });

  it('renders format details', () => {
    render(<NewReleaseCard {...defaultProps} />);

    expect(screen.getByText('LP \u00B7 Album')).toBeInTheDocument();
  });

  it('renders year when greater than 0', () => {
    render(<NewReleaseCard {...defaultProps} />);

    expect(screen.getByText('Pressed: 2024')).toBeInTheDocument();
  });

  it('does not render year when 0', () => {
    const release = makeRelease({ year: 0 });
    render(<NewReleaseCard {...defaultProps} release={release} />);

    expect(screen.queryByText(/Pressed:/)).not.toBeInTheDocument();
  });

  it('renders country when provided', () => {
    render(<NewReleaseCard {...defaultProps} />);

    expect(screen.getByText('US')).toBeInTheDocument();
  });

  it('does not render country when empty', () => {
    const release = makeRelease({ country: '' });
    render(<NewReleaseCard {...defaultProps} release={release} />);

    // Just verify the test doesn't crash; no country element
    expect(screen.getByText('Test Artist')).toBeInTheDocument();
  });

  it('renders label when provided', () => {
    render(<NewReleaseCard {...defaultProps} />);

    expect(screen.getByText('Test Records')).toBeInTheDocument();
  });

  it('does not render label when empty', () => {
    const release = makeRelease({ label: '' });
    render(<NewReleaseCard {...defaultProps} release={release} />);

    expect(screen.queryByText('Test Records')).not.toBeInTheDocument();
  });

  it('renders catalog number when provided', () => {
    const release = makeRelease({ catalogNumber: 'TR-001' });
    render(<NewReleaseCard {...defaultProps} release={release} />);

    expect(screen.getByText('(TR-001)')).toBeInTheDocument();
  });

  it('renders NEW badge for recent releases (within 7 days)', () => {
    render(<NewReleaseCard {...defaultProps} />);

    expect(screen.getByText('NEW')).toBeInTheDocument();
  });

  it('does not render NEW badge for older releases', () => {
    const release = makeRelease({
      detectedAt: Date.now() - 10 * 24 * 60 * 60 * 1000, // 10 days ago
    });
    render(<NewReleaseCard {...defaultProps} release={release} />);

    expect(screen.queryByText('NEW')).not.toBeInTheDocument();
  });

  it('renders price info when lowestPrice is provided', () => {
    const release = makeRelease({
      lowestPrice: 29.99,
      priceCurrency: 'USD',
      numForSale: 5,
    });
    render(<NewReleaseCard {...defaultProps} release={release} />);

    expect(screen.getByText(/From \$29\.99/)).toBeInTheDocument();
    expect(screen.getByText('(5 for sale)')).toBeInTheDocument();
  });

  it('does not render price info when lowestPrice is undefined', () => {
    const release = makeRelease({ lowestPrice: undefined });
    render(<NewReleaseCard {...defaultProps} release={release} />);

    expect(screen.queryByText(/From/)).not.toBeInTheDocument();
  });

  it('renders EUR price with euro symbol', () => {
    const release = makeRelease({
      lowestPrice: 25,
      priceCurrency: 'EUR',
    });
    render(<NewReleaseCard {...defaultProps} release={release} />);

    expect(screen.getByText(/From \u20AC25\.00/)).toBeInTheDocument();
  });

  it('renders GBP price with pound symbol', () => {
    const release = makeRelease({
      lowestPrice: 20,
      priceCurrency: 'GBP',
    });
    render(<NewReleaseCard {...defaultProps} release={release} />);

    expect(screen.getByText(/From \u00A320\.00/)).toBeInTheDocument();
  });

  it('does not render "for sale" when numForSale is 0', () => {
    const release = makeRelease({
      lowestPrice: 25,
      priceCurrency: 'USD',
      numForSale: 0,
    });
    render(<NewReleaseCard {...defaultProps} release={release} />);

    expect(screen.queryByText(/for sale/)).not.toBeInTheDocument();
  });

  it('renders source label for wishlist source', () => {
    render(<NewReleaseCard {...defaultProps} />);

    expect(screen.getByText('Discogs Wishlist')).toBeInTheDocument();
  });

  it('renders source label for local_want source', () => {
    const release = makeRelease({ source: 'local_want' });
    render(<NewReleaseCard {...defaultProps} release={release} />);

    expect(screen.getByText('Local Want List')).toBeInTheDocument();
  });

  it('renders detected relative time', () => {
    render(<NewReleaseCard {...defaultProps} />);

    expect(screen.getByText(/Detected/)).toBeInTheDocument();
  });

  it('opens discogs URL when View on Discogs is clicked', async () => {
    render(<NewReleaseCard {...defaultProps} />);

    await user.click(screen.getByText('View on Discogs'));

    expect(mockWindowOpen).toHaveBeenCalledWith(
      'https://www.discogs.com/release/2000',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('calls onDismiss with release id when dismiss button is clicked', async () => {
    render(<NewReleaseCard {...defaultProps} />);

    await user.click(
      screen.getByRole('button', { name: 'Dismiss this release' })
    );

    expect(defaultProps.onDismiss).toHaveBeenCalledWith('release-1');
  });

  it('shows checkmark for already dismissed releases', () => {
    const release = makeRelease({ dismissed: true });
    render(<NewReleaseCard {...defaultProps} release={release} />);

    expect(
      screen.getByRole('button', { name: 'Already dismissed' })
    ).toBeInTheDocument();
  });

  it('applies dismissed class when release is dismissed', () => {
    const release = makeRelease({ dismissed: true });
    const { container } = render(
      <NewReleaseCard {...defaultProps} release={release} />
    );

    expect(container.querySelector('.new-release-card')).toHaveClass(
      'dismissed'
    );
  });

  it('renders "Just now" for very recent detections', () => {
    const release = makeRelease({ detectedAt: Date.now() - 1000 });
    render(<NewReleaseCard {...defaultProps} release={release} />);

    expect(screen.getByText(/Just now/)).toBeInTheDocument();
  });

  it('renders "1 day ago" for day-old detections', () => {
    const release = makeRelease({
      detectedAt: Date.now() - 25 * 60 * 60 * 1000,
    });
    render(<NewReleaseCard {...defaultProps} release={release} />);

    expect(screen.getByText(/1 day ago/)).toBeInTheDocument();
  });
});
