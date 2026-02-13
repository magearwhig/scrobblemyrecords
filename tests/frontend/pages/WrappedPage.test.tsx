import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import '@testing-library/jest-dom';

import WrappedPage from '../../../src/renderer/pages/WrappedPage';
import { WrappedData } from '../../../src/shared/types';

// Mock WrappedSlideshow to simplify page tests
jest.mock('../../../src/renderer/components/wrapped/WrappedSlideshow', () => {
  return function MockWrappedSlideshow(props: {
    data: { listening: { totalScrobbles: number } };
    onExit: () => void;
  }) {
    return (
      <div data-testid='wrapped-slideshow'>
        <button onClick={props.onExit}>Exit</button>
        <span>Total: {props.data.listening.totalScrobbles}</span>
      </div>
    );
  };
});

// Mock the API service
const mockGetWrapped = jest.fn();

jest.mock('../../../src/renderer/services/api', () => ({
  getApiService: () => ({
    getWrapped: mockGetWrapped,
  }),
}));

// Mock logger
jest.mock('../../../src/renderer/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

const createMockWrappedData = (
  overrides: Partial<WrappedData> = {}
): WrappedData => ({
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
    ],
    topAlbums: [
      {
        name: 'OK Computer',
        artist: 'Radiohead',
        album: 'OK Computer',
        playCount: 80,
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
  ...overrides,
});

describe('WrappedPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render the date picker view initially', () => {
    // Arrange & Act
    render(<WrappedPage />);

    // Assert
    expect(screen.getByText('Your Wrapped')).toBeInTheDocument();
    expect(screen.getByText(/choose a time period/i)).toBeInTheDocument();
    expect(screen.getByText('Quick Presets')).toBeInTheDocument();
  });

  it('should display all preset buttons', () => {
    // Arrange & Act
    render(<WrappedPage />);

    // Assert
    expect(screen.getByText('This Year')).toBeInTheDocument();
    expect(screen.getByText('Last 6 Months')).toBeInTheDocument();
    expect(screen.getByText('Last 3 Months')).toBeInTheDocument();
    expect(screen.getByText('This Month')).toBeInTheDocument();
    expect(screen.getByText('Last Month')).toBeInTheDocument();
  });

  it('should display custom date range inputs', () => {
    // Arrange & Act
    render(<WrappedPage />);

    // Assert
    expect(screen.getByLabelText('Start date')).toBeInTheDocument();
    expect(screen.getByLabelText('End date')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /generate your wrapped/i })
    ).toBeInTheDocument();
  });

  it('should call API and show slideshow when preset is clicked', async () => {
    // Arrange
    const user = userEvent.setup();
    const mockData = createMockWrappedData();
    mockGetWrapped.mockResolvedValue(mockData);
    render(<WrappedPage />);

    // Act
    await user.click(screen.getByText('This Year'));

    // Assert
    await waitFor(() => {
      expect(mockGetWrapped).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number)
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('wrapped-slideshow')).toBeInTheDocument();
    });
  });

  it('should show loading state while generating', async () => {
    // Arrange
    const user = userEvent.setup();
    let resolvePromise: (value: WrappedData) => void;
    const pendingPromise = new Promise<WrappedData>(resolve => {
      resolvePromise = resolve;
    });
    mockGetWrapped.mockReturnValue(pendingPromise);
    render(<WrappedPage />);

    // Act
    await user.click(screen.getByText('This Year'));

    // Assert
    expect(
      screen.getByText('Crunching your listening data...')
    ).toBeInTheDocument();

    // Cleanup: resolve the promise to avoid act warnings
    resolvePromise!(createMockWrappedData());
    await waitFor(() => {
      expect(screen.getByTestId('wrapped-slideshow')).toBeInTheDocument();
    });
  });

  it('should show error message when API fails', async () => {
    // Arrange
    const user = userEvent.setup();
    mockGetWrapped.mockRejectedValue(new Error('Network error'));
    render(<WrappedPage />);

    // Act
    await user.click(screen.getByText('This Year'));

    // Assert
    await waitFor(() => {
      expect(
        screen.getByText('Failed to generate your Wrapped. Please try again.')
      ).toBeInTheDocument();
    });
  });

  it('should show no data message when totalScrobbles is 0', async () => {
    // Arrange
    const user = userEvent.setup();
    const emptyData = createMockWrappedData({
      listening: {
        ...createMockWrappedData().listening,
        totalScrobbles: 0,
      },
    });
    mockGetWrapped.mockResolvedValue(emptyData);
    render(<WrappedPage />);

    // Act
    await user.click(screen.getByText('This Year'));

    // Assert
    await waitFor(() => {
      expect(
        screen.getByText('No listening data found for this period.')
      ).toBeInTheDocument();
    });
  });

  it('should disable generate button when dates are not selected', () => {
    // Arrange & Act
    render(<WrappedPage />);

    // Assert
    const generateButton = screen.getByRole('button', {
      name: /generate your wrapped/i,
    });
    expect(generateButton).toBeDisabled();
  });

  it('should return to date picker when exiting slideshow', async () => {
    // Arrange
    const user = userEvent.setup();
    mockGetWrapped.mockResolvedValue(createMockWrappedData());
    render(<WrappedPage />);

    // Act - enter slideshow
    await user.click(screen.getByText('This Year'));
    await waitFor(() => {
      expect(screen.getByTestId('wrapped-slideshow')).toBeInTheDocument();
    });

    // Act - exit slideshow
    await user.click(screen.getByText('Exit'));

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Your Wrapped')).toBeInTheDocument();
    });
  });

  it('should disable buttons while loading', async () => {
    // Arrange
    const user = userEvent.setup();
    let resolvePromise: (value: WrappedData) => void;
    const pendingPromise = new Promise<WrappedData>(resolve => {
      resolvePromise = resolve;
    });
    mockGetWrapped.mockReturnValue(pendingPromise);
    render(<WrappedPage />);

    // Act
    await user.click(screen.getByText('This Year'));

    // Assert
    const presetButtons = screen.getAllByRole('button');
    const disabledButtons = presetButtons.filter(btn =>
      btn.hasAttribute('disabled')
    );
    expect(disabledButtons.length).toBeGreaterThan(0);

    // Cleanup
    resolvePromise!(createMockWrappedData());
    await waitFor(() => {
      expect(screen.getByTestId('wrapped-slideshow')).toBeInTheDocument();
    });
  });
});
