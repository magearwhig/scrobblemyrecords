import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import '@testing-library/jest-dom';
import { HeatmapDayDetail } from '../../../../src/renderer/components/stats/HeatmapDayDetail';

describe('HeatmapDayDetail', () => {
  const mockOnClose = jest.fn();
  const mockAlbums = [
    {
      artist: 'Radiohead',
      album: 'OK Computer',
      playCount: 5,
      coverUrl: 'https://example.com/cover.jpg',
    },
    { artist: 'Pink Floyd', album: 'The Wall', playCount: 3, coverUrl: null },
  ];

  const defaultProps = {
    date: '2024-06-15',
    albums: mockAlbums,
    totalScrobbles: 12,
    onClose: mockOnClose,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render the formatted date heading', () => {
    // Arrange & Act
    render(<HeatmapDayDetail {...defaultProps} />);

    // Assert - should format as "Saturday, June 15, 2024"
    expect(screen.getByText(/June 15, 2024/)).toBeInTheDocument();
  });

  it('should display total scrobble count', () => {
    // Arrange & Act
    render(<HeatmapDayDetail {...defaultProps} />);

    // Assert
    expect(screen.getByText(/12 scrobbles/)).toBeInTheDocument();
  });

  it('should display singular "scrobble" for count of 1', () => {
    // Arrange & Act
    render(<HeatmapDayDetail {...defaultProps} totalScrobbles={1} />);

    // Assert
    expect(screen.getByText('1 scrobble')).toBeInTheDocument();
  });

  it('should render album list with artist and album names', () => {
    // Arrange & Act
    render(<HeatmapDayDetail {...defaultProps} />);

    // Assert
    expect(screen.getByText('OK Computer')).toBeInTheDocument();
    expect(screen.getByText('Radiohead')).toBeInTheDocument();
    expect(screen.getByText('The Wall')).toBeInTheDocument();
    expect(screen.getByText('Pink Floyd')).toBeInTheDocument();
  });

  it('should display play counts for each album', () => {
    // Arrange & Act
    render(<HeatmapDayDetail {...defaultProps} />);

    // Assert
    expect(screen.getByText('5 plays')).toBeInTheDocument();
    expect(screen.getByText('3 plays')).toBeInTheDocument();
  });

  it('should display singular "play" for count of 1', () => {
    // Arrange
    const singlePlayAlbums = [
      { artist: 'Radiohead', album: 'Kid A', playCount: 1, coverUrl: null },
    ];

    // Act
    render(
      <HeatmapDayDetail
        {...defaultProps}
        albums={singlePlayAlbums}
        totalScrobbles={1}
      />
    );

    // Assert
    expect(screen.getByText('1 play')).toBeInTheDocument();
  });

  it('should render cover image when coverUrl is provided', () => {
    // Arrange & Act
    render(<HeatmapDayDetail {...defaultProps} />);

    // Assert
    const img = screen.getByAltText('Radiohead - OK Computer');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/cover.jpg');
  });

  it('should render placeholder when coverUrl is null', () => {
    // Arrange & Act
    const { container } = render(<HeatmapDayDetail {...defaultProps} />);

    // Assert - Pink Floyd's The Wall has no cover
    const placeholders = container.querySelectorAll(
      '.heatmap-day-detail-cover-placeholder'
    );
    expect(placeholders.length).toBeGreaterThan(0);
  });

  it('should render close button with correct aria-label', () => {
    // Arrange & Act
    render(<HeatmapDayDetail {...defaultProps} />);

    // Assert
    const closeButton = screen.getByRole('button', {
      name: /close day detail/i,
    });
    expect(closeButton).toBeInTheDocument();
  });

  it('should call onClose when close button is clicked', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<HeatmapDayDetail {...defaultProps} />);

    // Act
    await user.click(screen.getByRole('button', { name: /close day detail/i }));

    // Assert
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should call onClose when Escape key is pressed', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<HeatmapDayDetail {...defaultProps} />);

    // Act - the panel should auto-focus, then Escape should close
    await user.keyboard('{Escape}');

    // Assert
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should show empty message when no albums', () => {
    // Arrange & Act
    render(
      <HeatmapDayDetail {...defaultProps} albums={[]} totalScrobbles={5} />
    );

    // Assert
    expect(screen.getByText('No album data for this day.')).toBeInTheDocument();
  });

  it('should have region role with accessible label', () => {
    // Arrange & Act
    render(<HeatmapDayDetail {...defaultProps} />);

    // Assert
    expect(
      screen.getByRole('region', { name: /Albums played on/i })
    ).toBeInTheDocument();
  });
});
