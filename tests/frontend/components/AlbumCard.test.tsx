import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import '@testing-library/jest-dom';
import AlbumCard from '../../../src/renderer/components/AlbumCard';
import { CollectionItem, DiscogsRelease } from '../../../src/shared/types';

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
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('calls onSelect when select button is clicked', () => {
    const onSelect = jest.fn();
    render(<AlbumCard {...defaultProps} onSelect={onSelect} />);

    fireEvent.click(screen.getByText('Select'));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('calls onViewDetails when view details button is clicked', () => {
    const onViewDetails = jest.fn();
    render(<AlbumCard {...defaultProps} onViewDetails={onViewDetails} />);

    fireEvent.click(screen.getByText('View Details'));

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
});
