import { render, screen } from '@testing-library/react';
import React from 'react';

import '@testing-library/jest-dom';
import { OnThisDay } from '../../../../src/renderer/components/stats/OnThisDay';
import { OnThisDayResult } from '../../../../src/shared/types';

describe('OnThisDay', () => {
  const mockData: OnThisDayResult = {
    date: { month: 6, day: 15 },
    years: [
      {
        year: 2023,
        yearsAgo: 1,
        totalScrobbles: 12,
        albums: [
          {
            artist: 'Radiohead',
            album: 'OK Computer',
            playCount: 5,
            coverUrl: 'https://example.com/ok-computer.jpg',
          },
          {
            artist: 'Pink Floyd',
            album: 'The Wall',
            playCount: 3,
            coverUrl: null,
          },
        ],
      },
      {
        year: 2022,
        yearsAgo: 2,
        totalScrobbles: 8,
        albums: [
          {
            artist: 'The Beatles',
            album: 'Abbey Road',
            playCount: 8,
            coverUrl: null,
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render the heading with date', () => {
    // Arrange & Act
    render(<OnThisDay data={mockData} />);

    // Assert
    expect(screen.getByText(/On This Day/)).toBeInTheDocument();
    expect(screen.getByText(/June 15/)).toBeInTheDocument();
  });

  it('should render year cards for each year with data', () => {
    // Arrange & Act
    render(<OnThisDay data={mockData} />);

    // Assert
    expect(screen.getByText('2023')).toBeInTheDocument();
    expect(screen.getByText('2022')).toBeInTheDocument();
    expect(screen.getByText('1 year ago')).toBeInTheDocument();
    expect(screen.getByText('2 years ago')).toBeInTheDocument();
  });

  it('should display scrobble counts per year', () => {
    // Arrange & Act
    render(<OnThisDay data={mockData} />);

    // Assert
    expect(screen.getByText('12 scrobbles')).toBeInTheDocument();
    expect(screen.getByText('8 scrobbles')).toBeInTheDocument();
  });

  it('should render album details within year cards', () => {
    // Arrange & Act
    render(<OnThisDay data={mockData} />);

    // Assert
    expect(screen.getByText('OK Computer')).toBeInTheDocument();
    expect(screen.getByText('Radiohead')).toBeInTheDocument();
    expect(screen.getByText('The Wall')).toBeInTheDocument();
    expect(screen.getByText('Abbey Road')).toBeInTheDocument();
  });

  it('should show play counts for albums', () => {
    // Arrange & Act
    render(<OnThisDay data={mockData} />);

    // Assert
    expect(screen.getByText('5 plays')).toBeInTheDocument();
    expect(screen.getByText('3 plays')).toBeInTheDocument();
    expect(screen.getByText('8 plays')).toBeInTheDocument();
  });

  it('should render cover image when available', () => {
    // Arrange & Act
    render(<OnThisDay data={mockData} />);

    // Assert
    const img = screen.getByAltText('Radiohead - OK Computer');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/ok-computer.jpg');
  });

  it('should show loading state with Skeleton', () => {
    // Arrange & Act
    render(<OnThisDay data={null} loading={true} />);

    // Assert
    expect(screen.getByText('On This Day')).toBeInTheDocument();
    // Should not show year cards
    expect(screen.queryByText('2023')).not.toBeInTheDocument();
  });

  it('should show EmptyState when data is null', () => {
    // Arrange & Act
    render(<OnThisDay data={null} />);

    // Assert
    expect(screen.getByText('No history for this day')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Come back once you have scrobble data from previous years.'
      )
    ).toBeInTheDocument();
  });

  it('should show EmptyState when years array is empty', () => {
    // Arrange
    const emptyData: OnThisDayResult = {
      date: { month: 6, day: 15 },
      years: [],
    };

    // Act
    render(<OnThisDay data={emptyData} />);

    // Assert
    expect(screen.getByText('No history for this day')).toBeInTheDocument();
  });

  it('should show EmptyState when all years have zero scrobbles', () => {
    // Arrange
    const zeroData: OnThisDayResult = {
      date: { month: 6, day: 15 },
      years: [
        {
          year: 2023,
          yearsAgo: 1,
          totalScrobbles: 0,
          albums: [],
        },
      ],
    };

    // Act
    render(<OnThisDay data={zeroData} />);

    // Assert
    expect(screen.getByText('No history for this day')).toBeInTheDocument();
  });

  it('should have year card groups with accessible labels', () => {
    // Arrange & Act
    render(<OnThisDay data={mockData} />);

    // Assert
    expect(
      screen.getByRole('group', {
        name: /1 year ago.*12 scrobbles/,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', {
        name: /2 years ago.*8 scrobbles/,
      })
    ).toBeInTheDocument();
  });

  it('should have container with accessible label', () => {
    // Arrange & Act
    render(<OnThisDay data={mockData} />);

    // Assert
    expect(
      screen.getByLabelText('On This Day in your listening history')
    ).toBeInTheDocument();
  });
});
