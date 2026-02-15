import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import '@testing-library/jest-dom';

import WrappedSlideshow from '../../../src/renderer/components/wrapped/WrappedSlideshow';
import { WrappedData } from '../../../src/shared/types';

const createMockWrappedData = (): WrappedData => ({
  startDate: new Date('2024-01-01').getTime(),
  endDate: new Date('2024-12-31').getTime(),
  generatedAt: Date.now(),
  listening: {
    totalScrobbles: 5000,
    estimatedListeningHours: 416,
    uniqueArtists: 200,
    uniqueAlbums: 350,
    topArtists: [
      { name: 'Radiohead', artist: 'Radiohead', playCount: 300 },
      { name: 'The Beatles', artist: 'The Beatles', playCount: 250 },
      { name: 'Pink Floyd', artist: 'Pink Floyd', playCount: 200 },
      { name: 'Led Zeppelin', artist: 'Led Zeppelin', playCount: 180 },
      { name: 'The Smiths', artist: 'The Smiths', playCount: 160 },
    ],
    topAlbums: [
      {
        name: 'OK Computer',
        artist: 'Radiohead',
        album: 'OK Computer',
        playCount: 80,
      },
      {
        name: 'Abbey Road',
        artist: 'The Beatles',
        album: 'Abbey Road',
        playCount: 60,
      },
    ],
    topTracks: [
      {
        name: 'Paranoid Android',
        artist: 'Radiohead',
        album: 'OK Computer',
        playCount: 30,
      },
    ],
    newArtistsDiscovered: 15,
    newArtistsList: [
      {
        name: 'New Artist',
        playCount: 10,
        firstPlayDate: new Date('2024-03-15').getTime(),
      },
    ],
    peakListeningDay: { date: '2024-06-15', scrobbleCount: 45 },
    peakListeningHour: { hour: 21, scrobbleCount: 800 },
    longestStreak: {
      days: 30,
      startDate: '2024-03-01',
      endDate: '2024-03-30',
    },
    heatmapData: [
      { date: '2024-01-01', count: 10 },
      { date: '2024-01-02', count: 15 },
    ],
  },
  collection: {
    recordsAdded: 20,
    recordsList: [
      {
        artist: 'Radiohead',
        title: 'OK Computer',
        dateAdded: new Date('2024-02-01').getTime(),
        year: 1997,
      },
    ],
    mostPlayedNewAddition: {
      artist: 'Radiohead',
      title: 'OK Computer',
      dateAdded: new Date('2024-02-01').getTime(),
      playCount: 80,
    },
  },
  crossSource: {
    collectionCoverage: 65,
    totalCollectionSize: 200,
    albumsPlayed: 130,
    vinylScrobbles: 2000,
    otherScrobbles: 3000,
    vinylPercentage: 40,
  },
});

describe('WrappedSlideshow', () => {
  const mockOnExit = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render the slideshow container', () => {
    // Arrange & Act
    render(
      <WrappedSlideshow data={createMockWrappedData()} onExit={mockOnExit} />
    );

    // Assert
    expect(
      screen.getByRole('region', { name: /wrapped slideshow/i })
    ).toBeInTheDocument();
  });

  it('should render navigation controls', () => {
    // Arrange & Act
    render(
      <WrappedSlideshow data={createMockWrappedData()} onExit={mockOnExit} />
    );

    // Assert
    expect(
      screen.getByRole('button', { name: /previous slide/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /next slide/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /exit slideshow/i })
    ).toBeInTheDocument();
  });

  it('should render progress dots', () => {
    // Arrange & Act
    render(
      <WrappedSlideshow data={createMockWrappedData()} onExit={mockOnExit} />
    );

    // Assert
    const dots = screen.getAllByRole('tab');
    expect(dots.length).toBe(14); // 14 slides total
    expect(dots[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('should start on the first slide with back button disabled', () => {
    // Arrange & Act
    render(
      <WrappedSlideshow data={createMockWrappedData()} onExit={mockOnExit} />
    );

    // Assert
    const backButton = screen.getByRole('button', { name: /previous slide/i });
    expect(backButton).toBeDisabled();
  });

  it('should navigate to next slide when next button is clicked', async () => {
    // Arrange
    const user = userEvent.setup();
    render(
      <WrappedSlideshow data={createMockWrappedData()} onExit={mockOnExit} />
    );

    // Act
    await user.click(screen.getByRole('button', { name: /next slide/i }));

    // Assert
    const dots = screen.getAllByRole('tab');
    expect(dots[1]).toHaveAttribute('aria-selected', 'true');
    expect(dots[0]).toHaveAttribute('aria-selected', 'false');
  });

  it('should navigate back when back button is clicked', async () => {
    // Arrange
    const user = userEvent.setup();
    render(
      <WrappedSlideshow data={createMockWrappedData()} onExit={mockOnExit} />
    );

    // Act - go forward then back
    await user.click(screen.getByRole('button', { name: /next slide/i }));
    await user.click(screen.getByRole('button', { name: /previous slide/i }));

    // Assert
    const dots = screen.getAllByRole('tab');
    expect(dots[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('should call onExit when exit button is clicked', async () => {
    // Arrange
    const user = userEvent.setup();
    render(
      <WrappedSlideshow data={createMockWrappedData()} onExit={mockOnExit} />
    );

    // Act
    await user.click(screen.getByRole('button', { name: /exit slideshow/i }));

    // Assert
    expect(mockOnExit).toHaveBeenCalledTimes(1);
  });

  it('should navigate forward with ArrowRight key', async () => {
    // Arrange
    const user = userEvent.setup();
    render(
      <WrappedSlideshow data={createMockWrappedData()} onExit={mockOnExit} />
    );

    // Act
    await user.keyboard('{ArrowRight}');

    // Assert
    const dots = screen.getAllByRole('tab');
    expect(dots[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('should navigate forward with Space key', async () => {
    // Arrange
    const user = userEvent.setup();
    render(
      <WrappedSlideshow data={createMockWrappedData()} onExit={mockOnExit} />
    );

    // Act
    await user.keyboard('{ }');

    // Assert
    const dots = screen.getAllByRole('tab');
    expect(dots[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('should navigate back with ArrowLeft key', async () => {
    // Arrange
    const user = userEvent.setup();
    render(
      <WrappedSlideshow data={createMockWrappedData()} onExit={mockOnExit} />
    );

    // Act - go forward first, then back
    await user.keyboard('{ArrowRight}');
    await user.keyboard('{ArrowLeft}');

    // Assert
    const dots = screen.getAllByRole('tab');
    expect(dots[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('should exit with Escape key', async () => {
    // Arrange
    const user = userEvent.setup();
    render(
      <WrappedSlideshow data={createMockWrappedData()} onExit={mockOnExit} />
    );

    // Act
    await user.keyboard('{Escape}');

    // Assert
    expect(mockOnExit).toHaveBeenCalledTimes(1);
  });

  it('should go to first slide with Home key', async () => {
    // Arrange
    const user = userEvent.setup();
    render(
      <WrappedSlideshow data={createMockWrappedData()} onExit={mockOnExit} />
    );

    // Act - navigate forward a few times, then Home
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    await user.keyboard('{Home}');

    // Assert
    const dots = screen.getAllByRole('tab');
    expect(dots[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('should go to last slide with End key', async () => {
    // Arrange
    const user = userEvent.setup();
    render(
      <WrappedSlideshow data={createMockWrappedData()} onExit={mockOnExit} />
    );

    // Act
    await user.keyboard('{End}');

    // Assert
    const dots = screen.getAllByRole('tab');
    expect(dots[13]).toHaveAttribute('aria-selected', 'true');
  });

  it('should not go past the last slide', async () => {
    // Arrange
    const user = userEvent.setup();
    render(
      <WrappedSlideshow data={createMockWrappedData()} onExit={mockOnExit} />
    );

    // Act - go to end, then try to go further
    await user.keyboard('{End}');
    await user.keyboard('{ArrowRight}');

    // Assert - still on last slide
    const dots = screen.getAllByRole('tab');
    expect(dots[13]).toHaveAttribute('aria-selected', 'true');
  });

  it('should not go before the first slide', async () => {
    // Arrange
    const user = userEvent.setup();
    render(
      <WrappedSlideshow data={createMockWrappedData()} onExit={mockOnExit} />
    );

    // Act
    await user.keyboard('{ArrowLeft}');

    // Assert - still on first slide
    const dots = screen.getAllByRole('tab');
    expect(dots[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('should disable next button on last slide', async () => {
    // Arrange
    const user = userEvent.setup();
    render(
      <WrappedSlideshow data={createMockWrappedData()} onExit={mockOnExit} />
    );

    // Act
    await user.keyboard('{End}');

    // Assert
    const nextButton = screen.getByRole('button', { name: /next slide/i });
    expect(nextButton).toBeDisabled();
  });

  it('should display the first slide content (total scrobbles)', () => {
    // Arrange & Act
    render(
      <WrappedSlideshow data={createMockWrappedData()} onExit={mockOnExit} />
    );

    // Assert - first slide is TotalScrobblesSlide
    expect(screen.getByText('5,000')).toBeInTheDocument();
  });

  describe('with collection data (Discogs connected)', () => {
    it('should show all 14 slides when collection data exists', () => {
      // Arrange & Act
      render(
        <WrappedSlideshow data={createMockWrappedData()} onExit={mockOnExit} />
      );

      // Assert - 10 base + 4 collection slides = 14
      const dots = screen.getAllByRole('tab');
      expect(dots.length).toBe(14);
    });
  });

  describe('without collection data (Last.fm only)', () => {
    const createLastFmOnlyData = (): WrappedData => {
      const data = createMockWrappedData();
      return {
        ...data,
        collection: {
          recordsAdded: 0,
          recordsList: [],
          mostPlayedNewAddition: null,
        },
        crossSource: {
          collectionCoverage: 0,
          totalCollectionSize: 0,
          albumsPlayed: 0,
          vinylScrobbles: 0,
          otherScrobbles: 0,
          vinylPercentage: 0,
        },
      };
    };

    it('should show only 10 slides when collection is empty', () => {
      // Arrange & Act
      render(
        <WrappedSlideshow data={createLastFmOnlyData()} onExit={mockOnExit} />
      );

      // Assert - only the 10 Last.fm-only slides
      const dots = screen.getAllByRole('tab');
      expect(dots.length).toBe(10);
    });

    it('should navigate correctly with reduced slide count', async () => {
      // Arrange
      const user = userEvent.setup();
      render(
        <WrappedSlideshow data={createLastFmOnlyData()} onExit={mockOnExit} />
      );

      // Act - go to end
      await user.keyboard('{End}');

      // Assert - last slide is index 9 (10th slide)
      const dots = screen.getAllByRole('tab');
      expect(dots[9]).toHaveAttribute('aria-selected', 'true');
    });

    it('should disable next button on last slide (slide 10)', async () => {
      // Arrange
      const user = userEvent.setup();
      render(
        <WrappedSlideshow data={createLastFmOnlyData()} onExit={mockOnExit} />
      );

      // Act
      await user.keyboard('{End}');

      // Assert
      const nextButton = screen.getByRole('button', { name: /next slide/i });
      expect(nextButton).toBeDisabled();
    });

    it('should not go past the last slide with reduced count', async () => {
      // Arrange
      const user = userEvent.setup();
      render(
        <WrappedSlideshow data={createLastFmOnlyData()} onExit={mockOnExit} />
      );

      // Act - go to end, then try to go further
      await user.keyboard('{End}');
      await user.keyboard('{ArrowRight}');

      // Assert - still on last slide
      const dots = screen.getAllByRole('tab');
      expect(dots[9]).toHaveAttribute('aria-selected', 'true');
    });

    it('should still display the first slide content', () => {
      // Arrange & Act
      render(
        <WrappedSlideshow data={createLastFmOnlyData()} onExit={mockOnExit} />
      );

      // Assert - first slide is still TotalScrobblesSlide
      expect(screen.getByText('5,000')).toBeInTheDocument();
    });
  });
});
