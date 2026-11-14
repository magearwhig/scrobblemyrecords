import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import '@testing-library/jest-dom';
import { StatsRankings } from '../../../../src/renderer/components/stats/StatsRankings';
import { getApiService } from '../../../../src/renderer/services/api';
import {
  imagesApi,
  statsApi,
} from '../../../../src/renderer/services/statsApi';

jest.mock('../../../../src/renderer/services/statsApi', () => ({
  statsApi: {
    getTopArtists: jest.fn(),
    getTopAlbums: jest.fn(),
    getTopTracks: jest.fn(),
    getTopLabels: jest.fn(),
    getRankingsOverTime: jest.fn(),
  },
  imagesApi: {
    batchGetAlbumCovers: jest.fn(),
    batchGetArtistImages: jest.fn(),
  },
}));

jest.mock('../../../../src/renderer/services/api', () => ({
  getApiService: jest.fn(),
}));

const mockStatsApi = statsApi as jest.Mocked<typeof statsApi>;
const mockImagesApi = imagesApi as jest.Mocked<typeof imagesApi>;

const labelRow = (label: string) => ({
  label,
  labelKey: label.toLowerCase(),
  playCount: 1,
  ownedPlayCount: 1,
  albumCount: 1,
  lastPlayed: 1,
});

describe('StatsRankings', () => {
  let unresolvedCount: number;

  beforeEach(() => {
    jest.clearAllMocks();
    unresolvedCount = 0;
    (getApiService as jest.Mock).mockReturnValue({
      getUnresolvedHistorySummary: jest.fn(async () => ({ unresolvedCount })),
    });
    mockStatsApi.getTopArtists.mockResolvedValue({
      success: true,
      data: [{ artist: 'Radiohead', playCount: 9 }],
    });
    mockStatsApi.getTopAlbums.mockResolvedValue({
      success: true,
      data: [
        {
          artist: 'Spoon',
          album: 'Gimme Fiction',
          playCount: 8,
          lastPlayed: 1,
        },
      ],
    });
    mockStatsApi.getTopTracks.mockResolvedValue({
      success: true,
      data: [{ artist: 'Spoon', track: 'The Way We Get By', playCount: 7 }],
    } as never);
    mockStatsApi.getTopLabels.mockResolvedValue({
      success: true,
      data: [labelRow('Merge')],
    });
    mockStatsApi.getRankingsOverTime.mockResolvedValue({
      success: true,
      data: { type: 'artists', topN: 10, snapshots: [] },
    } as never);
    mockImagesApi.batchGetAlbumCovers.mockResolvedValue({
      success: true,
      data: {},
    });
    mockImagesApi.batchGetArtistImages.mockResolvedValue({
      success: true,
      data: {},
    });
  });

  it('loads all four lists for this month, albums and labels first', async () => {
    render(<StatsRankings />);

    expect(await screen.findByText('Gimme Fiction')).toBeInTheDocument();
    expect(
      screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)
    ).toEqual(['Top Albums', 'Top Labels', 'Top Artists', 'Top Tracks']);
    for (const call of [
      mockStatsApi.getTopAlbums,
      mockStatsApi.getTopLabels,
      mockStatsApi.getTopArtists,
      mockStatsApi.getTopTracks,
    ]) {
      expect(call).toHaveBeenCalledWith('month', 10, undefined);
    }
  });

  it('has one period control that reloads every list', async () => {
    const user = userEvent.setup();
    render(<StatsRankings />);
    await screen.findByText('Gimme Fiction');

    expect(screen.getAllByRole('button', { name: 'Year' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Year' }));

    await waitFor(() => {
      for (const call of [
        mockStatsApi.getTopAlbums,
        mockStatsApi.getTopLabels,
        mockStatsApi.getTopArtists,
        mockStatsApi.getTopTracks,
      ]) {
        expect(call).toHaveBeenLastCalledWith('year', 10, undefined);
      }
    });
    expect(screen.getByRole('button', { name: 'Year' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('keeps the newest period when an older request finishes later', async () => {
    const user = userEvent.setup();
    let finishYear: (value: unknown) => void = () => undefined;
    mockStatsApi.getTopLabels.mockImplementation(((period: string) =>
      period === 'year'
        ? new Promise(resolve => {
            finishYear = resolve;
          })
        : Promise.resolve({
            success: true,
            data: [labelRow(period === 'week' ? 'Week Label' : 'Merge')],
          })) as never);
    render(<StatsRankings />);
    await screen.findByText('Merge');

    await user.click(screen.getByRole('button', { name: 'Year' }));
    await user.click(screen.getByRole('button', { name: 'Week' }));
    await screen.findByText('Week Label');
    await act(async () => {
      finishYear({ success: true, data: [labelRow('Year Label')] });
    });

    expect(screen.getByText('Week Label')).toBeInTheDocument();
    expect(screen.queryByText('Year Label')).not.toBeInTheDocument();
  });

  it('picks which list shows on a narrow screen', async () => {
    const user = userEvent.setup();
    const { container } = render(<StatsRankings />);
    await screen.findByText('Gimme Fiction');

    const active = () =>
      Array.from(
        container.querySelectorAll('.stats-rankings-list--active h3')
      ).map(h => h.textContent);
    expect(active()).toEqual(['Top Albums']);

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'List to show' }),
      'labels'
    );
    expect(active()).toEqual(['Top Labels']);
  });

  it('loads rankings over time only when asked', async () => {
    const user = userEvent.setup();
    render(<StatsRankings />);
    await screen.findByText('Gimme Fiction');

    expect(mockStatsApi.getRankingsOverTime).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: 'Show rankings over time' })
    );

    expect(mockStatsApi.getRankingsOverTime).toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Hide rankings over time' })
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('notes plays without album info under the lists', async () => {
    unresolvedCount = 720;
    render(<StatsRankings />);

    const note = await screen.findByText(/720 plays without album info/);
    expect(
      within(note.closest('p')!).getByRole('button', { name: 'Review them' })
    ).toBeInTheDocument();
  });

  it('adds covers and artist photos once they arrive', async () => {
    mockImagesApi.batchGetAlbumCovers.mockResolvedValue({
      success: true,
      data: { 'spoon|gimme fiction': 'https://example.com/gf.jpg' },
    });
    render(<StatsRankings />);

    expect(await screen.findByAltText('Gimme Fiction cover')).toHaveAttribute(
      'src',
      'https://example.com/gf.jpg'
    );
    expect(mockImagesApi.batchGetArtistImages).toHaveBeenCalledWith([
      'Radiohead',
    ]);
  });
});
