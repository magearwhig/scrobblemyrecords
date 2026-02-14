import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import '@testing-library/jest-dom';
import AlbumCard from '../../../src/renderer/components/AlbumCard';
import { CollectionItem, DiscogsRelease } from '../../../src/shared/types';

// Mock dateUtils so we can test "Last played" text without time-dependent flakiness
jest.mock('../../../src/renderer/utils/dateUtils', () => ({
  formatRelativeTime: jest.fn((timestamp: number) => '3 days ago'),
}));

const mockRelease: DiscogsRelease = {
  id: 123,
  title: 'Test Album',
  artist: 'Test Artist',
  year: 2021,
  format: ['Vinyl', 'LP'],
  label: ['Test Label'],
  cover_image: 'https://example.com/cover.jpg',
  resource_url: 'https://api.discogs.com/releases/123',
};

const mockItem: CollectionItem = {
  id: 456,
  release: mockRelease,
  folder_id: 1,
  date_added: '2023-01-01T00:00:00Z',
};

const defaultProps = {
  item: mockItem,
  selected: false,
  onSelect: jest.fn(),
  onViewDetails: jest.fn(),
};

describe('AlbumCard', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    jest.clearAllMocks();
    user = userEvent.setup();
  });

  it('renders album information correctly', () => {
    render(<AlbumCard {...defaultProps} />);

    expect(screen.getByText('Test Album')).toBeInTheDocument();
    expect(screen.getByText('Test Artist')).toBeInTheDocument();
    expect(screen.getByText('2021')).toBeInTheDocument();
    expect(screen.getByText('Vinyl, LP')).toBeInTheDocument();
    expect(screen.getByText('Test Label')).toBeInTheDocument();
  });

  it('renders unknown year when year is not provided', () => {
    const itemWithoutYear = {
      ...mockItem,
      release: { ...mockRelease, year: undefined },
    };

    render(<AlbumCard {...defaultProps} item={itemWithoutYear} />);

    expect(screen.getByText('Unknown Year')).toBeInTheDocument();
  });

  it('renders unknown format when format is not provided', () => {
    const itemWithoutFormat = {
      ...mockItem,
      release: { ...mockRelease, format: [] },
    };

    render(<AlbumCard {...defaultProps} item={itemWithoutFormat} />);

    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('does not render label section when label is not provided', () => {
    const itemWithoutLabel = {
      ...mockItem,
      release: { ...mockRelease, label: [] },
    };

    render(<AlbumCard {...defaultProps} item={itemWithoutLabel} />);

    expect(screen.queryByText('Test Label')).not.toBeInTheDocument();
  });

  it('displays music note emoji when no cover image is provided', () => {
    const itemWithoutCover = {
      ...mockItem,
      release: { ...mockRelease, cover_image: undefined },
    };

    render(<AlbumCard {...defaultProps} item={itemWithoutCover} />);

    expect(screen.getByText('🎵')).toBeInTheDocument();
  });

  it('shows selected state correctly', () => {
    render(<AlbumCard {...defaultProps} selected={true} />);

    expect(screen.getByText('✓ Selected')).toBeInTheDocument();

    const card = screen.getByText('Test Album').closest('.album-card');
    expect(card).toHaveClass('selected');
  });

  it('shows unselected state correctly', () => {
    render(<AlbumCard {...defaultProps} selected={false} />);

    expect(screen.getByText('Select')).toBeInTheDocument();

    const card = screen.getByText('Test Album').closest('.album-card');
    expect(card).not.toHaveClass('selected');
  });

  it('calls onSelect when select button is clicked', async () => {
    const onSelect = jest.fn();
    render(<AlbumCard {...defaultProps} onSelect={onSelect} />);

    await user.click(screen.getByText('Select'));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('calls onViewDetails when view details button is clicked', async () => {
    const onViewDetails = jest.fn();
    render(<AlbumCard {...defaultProps} onViewDetails={onViewDetails} />);

    await user.click(screen.getByText('View Details'));

    expect(onViewDetails).toHaveBeenCalledTimes(1);
    expect(onViewDetails).toHaveBeenCalledWith(mockRelease);
  });

  it('prevents event propagation when buttons are clicked', () => {
    const onSelect = jest.fn();
    const onViewDetails = jest.fn();

    render(
      <AlbumCard
        {...defaultProps}
        onSelect={onSelect}
        onViewDetails={onViewDetails}
      />
    );

    const selectButton = screen.getByText('Select');
    const viewDetailsButton = screen.getByText('View Details');

    const selectEvent = new MouseEvent('click', { bubbles: true });
    const viewDetailsEvent = new MouseEvent('click', { bubbles: true });

    const stopPropagationSpy = jest.spyOn(selectEvent, 'stopPropagation');
    const stopPropagationSpy2 = jest.spyOn(viewDetailsEvent, 'stopPropagation');

    fireEvent(selectButton, selectEvent);
    fireEvent(viewDetailsButton, viewDetailsEvent);

    expect(stopPropagationSpy).toHaveBeenCalled();
    expect(stopPropagationSpy2).toHaveBeenCalled();
  });

  it('handles empty arrays correctly', () => {
    const itemWithEmptyArrays = {
      ...mockItem,
      release: {
        ...mockRelease,
        format: [],
        label: [],
      },
    };

    render(<AlbumCard {...defaultProps} item={itemWithEmptyArrays} />);

    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.queryByText('Test Label')).not.toBeInTheDocument();
  });

  it('formats multiple values correctly', () => {
    const itemWithMultipleValues = {
      ...mockItem,
      release: {
        ...mockRelease,
        format: ['CD', 'Digital', 'Vinyl'],
        label: ['Label 1', 'Label 2'],
      },
    };

    render(<AlbumCard {...defaultProps} item={itemWithMultipleValues} />);

    expect(screen.getByText('CD, Digital, Vinyl')).toBeInTheDocument();
    expect(screen.getByText('Label 1, Label 2')).toBeInTheDocument();
  });

  it('applies correct styling for selected state', () => {
    const { rerender } = render(
      <AlbumCard {...defaultProps} selected={false} />
    );

    let card = screen.getByText('Test Album').closest('.album-card');
    expect(card).toHaveClass('album-card');
    expect(card).not.toHaveClass('selected');

    rerender(<AlbumCard {...defaultProps} selected={true} />);

    card = screen.getByText('Test Album').closest('.album-card');
    expect(card).toHaveClass('album-card');
    expect(card).toHaveClass('selected');
  });

  describe('Play count badge', () => {
    it('renders play count badge when playCount > 0', () => {
      // Act
      render(<AlbumCard {...defaultProps} playCount={47} />);

      // Assert
      const badge = screen.getByLabelText('47 plays');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('album-play-count-badge');
      expect(badge).toHaveTextContent('47 plays');
    });

    it('renders singular "play" for playCount of 1', () => {
      // Act
      render(<AlbumCard {...defaultProps} playCount={1} />);

      // Assert
      const badge = screen.getByLabelText('1 play');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('1 play');
    });

    it('hides badge when playCount is 0', () => {
      // Act
      render(<AlbumCard {...defaultProps} playCount={0} />);

      // Assert
      expect(screen.queryByLabelText(/plays/)).not.toBeInTheDocument();
    });

    it('hides badge when playCount is undefined', () => {
      // Act
      render(<AlbumCard {...defaultProps} />);

      // Assert
      expect(screen.queryByLabelText(/plays/)).not.toBeInTheDocument();
    });

    it('hides badge when playCount is null', () => {
      // Act
      render(
        <AlbumCard {...defaultProps} playCount={null as unknown as undefined} />
      );

      // Assert
      expect(screen.queryByLabelText(/plays/)).not.toBeInTheDocument();
    });
  });

  describe('Last played text', () => {
    it('renders "Last played X ago" when lastPlayed is provided', () => {
      // Act
      render(<AlbumCard {...defaultProps} lastPlayed={1704067200} />);

      // Assert
      expect(screen.getByText('Last played 3 days ago')).toBeInTheDocument();
    });

    it('hides last played when lastPlayed is null', () => {
      // Act
      render(<AlbumCard {...defaultProps} lastPlayed={null} />);

      // Assert
      expect(screen.queryByText(/Last played/)).not.toBeInTheDocument();
    });

    it('hides last played when lastPlayed is undefined', () => {
      // Act
      render(<AlbumCard {...defaultProps} />);

      // Assert
      expect(screen.queryByText(/Last played/)).not.toBeInTheDocument();
    });

    it('hides last played when lastPlayed is 0', () => {
      // Act
      render(<AlbumCard {...defaultProps} lastPlayed={0} />);

      // Assert
      expect(screen.queryByText(/Last played/)).not.toBeInTheDocument();
    });

    it('renders both play count badge and last played together', () => {
      // Act
      render(
        <AlbumCard {...defaultProps} playCount={47} lastPlayed={1704067200} />
      );

      // Assert
      expect(screen.getByLabelText('47 plays')).toBeInTheDocument();
      expect(screen.getByText('Last played 3 days ago')).toBeInTheDocument();
    });
  });
});
