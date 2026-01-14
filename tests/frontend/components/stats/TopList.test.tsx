import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import '@testing-library/jest-dom';
import { TopList } from '../../../../src/renderer/components/stats/TopList';
import { ArtistPlayCount, AlbumPlayCount } from '../../../../src/shared/types';

describe('TopList', () => {
  const mockOnPeriodChange = jest.fn();

  const mockArtists: ArtistPlayCount[] = [
    {
      artist: 'Radiohead',
      playCount: 150,
      imageUrl: 'https://example.com/radiohead.jpg',
    },
    { artist: 'The Beatles', playCount: 120 },
    { artist: 'Pink Floyd', playCount: 95 },
  ];

  const mockAlbums: AlbumPlayCount[] = [
    {
      artist: 'Radiohead',
      album: 'OK Computer',
      playCount: 50,
      coverUrl: 'https://example.com/ok-computer.jpg',
      lastPlayed: Date.now() / 1000,
    },
    {
      artist: 'The Beatles',
      album: 'Abbey Road',
      playCount: 45,
      lastPlayed: Date.now() / 1000 - 86400,
    },
    {
      artist: 'Pink Floyd',
      album: 'The Wall',
      playCount: 40,
      lastPlayed: Date.now() / 1000 - 172800,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Artists list', () => {
    it('should render artist list with title', () => {
      render(
        <TopList
          title='Top Artists'
          type='artists'
          data={mockArtists}
          currentPeriod='month'
          onPeriodChange={mockOnPeriodChange}
        />
      );

      expect(screen.getByText('Top Artists')).toBeInTheDocument();
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
      expect(screen.getByText('The Beatles')).toBeInTheDocument();
      expect(screen.getByText('Pink Floyd')).toBeInTheDocument();
    });

    it('should display play counts', () => {
      render(
        <TopList
          title='Top Artists'
          type='artists'
          data={mockArtists}
          currentPeriod='month'
          onPeriodChange={mockOnPeriodChange}
        />
      );

      expect(screen.getByText('150')).toBeInTheDocument();
      expect(screen.getByText('120')).toBeInTheDocument();
      expect(screen.getByText('95')).toBeInTheDocument();
    });

    it('should show description for artists', () => {
      render(
        <TopList
          title='Top Artists'
          type='artists'
          data={mockArtists}
          currentPeriod='month'
          onPeriodChange={mockOnPeriodChange}
        />
      );

      expect(screen.getByText(/most played artists/i)).toBeInTheDocument();
    });

    it('should render artist image when available', () => {
      render(
        <TopList
          title='Top Artists'
          type='artists'
          data={mockArtists}
          currentPeriod='month'
          onPeriodChange={mockOnPeriodChange}
        />
      );

      const images = screen.getAllByRole('img');
      expect(images.length).toBeGreaterThan(0);
      expect(images[0]).toHaveAttribute(
        'src',
        'https://example.com/radiohead.jpg'
      );
    });

    it('should render placeholder when artist image not available', () => {
      render(
        <TopList
          title='Top Artists'
          type='artists'
          data={mockArtists}
          currentPeriod='month'
          onPeriodChange={mockOnPeriodChange}
        />
      );

      // Should have SVG placeholders for artists without images
      const placeholders = document.querySelectorAll('.top-list-placeholder');
      expect(placeholders.length).toBeGreaterThan(0);
    });
  });

  describe('Albums list', () => {
    it('should render album list with title', () => {
      render(
        <TopList
          title='Top Albums'
          type='albums'
          data={mockAlbums}
          currentPeriod='month'
          onPeriodChange={mockOnPeriodChange}
        />
      );

      expect(screen.getByText('Top Albums')).toBeInTheDocument();
      expect(screen.getByText('OK Computer')).toBeInTheDocument();
      expect(screen.getByText('Abbey Road')).toBeInTheDocument();
      expect(screen.getByText('The Wall')).toBeInTheDocument();
    });

    it('should display artist name for albums', () => {
      render(
        <TopList
          title='Top Albums'
          type='albums'
          data={mockAlbums}
          currentPeriod='month'
          onPeriodChange={mockOnPeriodChange}
        />
      );

      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    it('should show description for albums', () => {
      render(
        <TopList
          title='Top Albums'
          type='albums'
          data={mockAlbums}
          currentPeriod='month'
          onPeriodChange={mockOnPeriodChange}
        />
      );

      expect(screen.getByText(/most played albums/i)).toBeInTheDocument();
    });

    it('should render album cover when available', () => {
      render(
        <TopList
          title='Top Albums'
          type='albums'
          data={mockAlbums}
          currentPeriod='month'
          onPeriodChange={mockOnPeriodChange}
        />
      );

      const images = screen.getAllByRole('img');
      expect(images.length).toBeGreaterThan(0);
    });
  });

  describe('Period selector', () => {
    it('should render period buttons', () => {
      render(
        <TopList
          title='Top Artists'
          type='artists'
          data={mockArtists}
          currentPeriod='month'
          onPeriodChange={mockOnPeriodChange}
        />
      );

      expect(screen.getByText('Week')).toBeInTheDocument();
      expect(screen.getByText('Month')).toBeInTheDocument();
      expect(screen.getByText('Year')).toBeInTheDocument();
      expect(screen.getByText('All Time')).toBeInTheDocument();
    });

    it('should highlight active period', () => {
      render(
        <TopList
          title='Top Artists'
          type='artists'
          data={mockArtists}
          currentPeriod='month'
          onPeriodChange={mockOnPeriodChange}
        />
      );

      const monthButton = screen.getByText('Month');
      expect(monthButton).toHaveClass('active');
    });

    it('should call onPeriodChange when period is clicked', () => {
      render(
        <TopList
          title='Top Artists'
          type='artists'
          data={mockArtists}
          currentPeriod='month'
          onPeriodChange={mockOnPeriodChange}
        />
      );

      fireEvent.click(screen.getByText('Year'));

      expect(mockOnPeriodChange).toHaveBeenCalledWith('year');
    });

    it('should show Custom button', () => {
      render(
        <TopList
          title='Top Artists'
          type='artists'
          data={mockArtists}
          currentPeriod='month'
          onPeriodChange={mockOnPeriodChange}
        />
      );

      expect(screen.getByText('Custom')).toBeInTheDocument();
    });

    it('should show date range label when custom period is active', () => {
      const dateRange = {
        startDate: 1704067200, // around Jan 1, 2024
        endDate: 1709251199, // around Feb 29, 2024
      };

      render(
        <TopList
          title='Top Artists'
          type='artists'
          data={mockArtists}
          currentPeriod='custom'
          onPeriodChange={mockOnPeriodChange}
          customDateRange={dateRange}
        />
      );

      // Should show formatted date range instead of "Custom"
      // Format varies: "Jan - Feb 2024" (same year) or "Dec '23 - Feb '24" (different years)
      const customButton = screen.getByRole('button', {
        name: /[A-Z][a-z]{2}.*-.*[A-Z][a-z]{2}/,
      });
      expect(customButton).toHaveClass('active');
    });

    it('should open date picker when Custom is clicked', () => {
      render(
        <TopList
          title='Top Artists'
          type='artists'
          data={mockArtists}
          currentPeriod='month'
          onPeriodChange={mockOnPeriodChange}
        />
      );

      fireEvent.click(screen.getByText('Custom'));

      // DateRangePicker should appear
      expect(screen.getByText('Last 3 Mo')).toBeInTheDocument();
    });
  });

  describe('Loading state', () => {
    it('should show loading indicator when loading', () => {
      render(
        <TopList
          title='Top Artists'
          type='artists'
          data={[]}
          currentPeriod='month'
          onPeriodChange={mockOnPeriodChange}
          loading={true}
        />
      );

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('should show empty message when no data', () => {
      render(
        <TopList
          title='Top Artists'
          type='artists'
          data={[]}
          currentPeriod='month'
          onPeriodChange={mockOnPeriodChange}
        />
      );

      expect(
        screen.getByText(/no artists for this period/i)
      ).toBeInTheDocument();
    });

    it('should show empty message for albums', () => {
      render(
        <TopList
          title='Top Albums'
          type='albums'
          data={[]}
          currentPeriod='month'
          onPeriodChange={mockOnPeriodChange}
        />
      );

      expect(
        screen.getByText(/no albums for this period/i)
      ).toBeInTheDocument();
    });
  });

  describe('Ranking', () => {
    it('should display rank numbers', () => {
      render(
        <TopList
          title='Top Artists'
          type='artists'
          data={mockArtists}
          currentPeriod='month'
          onPeriodChange={mockOnPeriodChange}
        />
      );

      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });
});
