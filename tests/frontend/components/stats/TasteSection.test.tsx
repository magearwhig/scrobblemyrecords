import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import '@testing-library/jest-dom';
import { TasteSection } from '../../../../src/renderer/components/stats/TasteSection';
import { statsApi } from '../../../../src/renderer/services/statsApi';

jest.mock('../../../../src/renderer/services/statsApi', () => ({
  statsApi: { getGenreDistribution: jest.fn() },
}));
jest.mock('../../../../src/renderer/components/stats/GenreTreemap', () => ({
  GenreTreemap: ({ totalArtists }: { totalArtists: number }) => (
    <div>Genre treemap of {totalArtists}</div>
  ),
}));
jest.mock('../../../../src/renderer/components/stats/TasteDriftChart', () => ({
  TasteDriftChart: () => <div>Taste drift chart</div>,
}));

const mockStatsApi = statsApi as jest.Mocked<typeof statsApi>;

describe('TasteSection', () => {
  let intersect: () => void;

  beforeEach(() => {
    jest.clearAllMocks();
    global.IntersectionObserver = jest.fn(
      (
        cb: (
          entries: IntersectionObserverEntry[],
          observer: IntersectionObserver
        ) => void
      ) => {
        intersect = () =>
          cb(
            [{ isIntersecting: true } as IntersectionObserverEntry],
            {} as IntersectionObserver
          );
        return {
          observe: jest.fn(),
          disconnect: jest.fn(),
          unobserve: jest.fn(),
        } as unknown as IntersectionObserver;
      }
    ) as unknown as typeof IntersectionObserver;
    mockStatsApi.getGenreDistribution.mockResolvedValue({
      success: true,
      data: { genres: [], totalArtistsAnalyzed: 20, lastUpdated: 1 },
    } as never);
  });

  it('loads genres when scrolled into view and shows them first', async () => {
    render(<TasteSection />);
    expect(mockStatsApi.getGenreDistribution).not.toHaveBeenCalled();

    intersect();

    expect(await screen.findByText('Genre treemap of 20')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Genres' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.queryByText('Taste drift chart')).not.toBeInTheDocument();
  });

  it('switches to how taste changed over time', async () => {
    const user = userEvent.setup();
    render(<TasteSection />);

    await user.click(screen.getByRole('tab', { name: 'Change over time' }));

    expect(screen.getByText('Taste drift chart')).toBeInTheDocument();
    expect(screen.queryByText(/Genre treemap/)).not.toBeInTheDocument();
  });
});
