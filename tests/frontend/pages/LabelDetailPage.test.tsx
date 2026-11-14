import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import '@testing-library/jest-dom';
import LabelDetailPage from '../../../src/renderer/pages/LabelDetailPage';
import { statsApi } from '../../../src/renderer/services/statsApi';
import { LabelDetailResponse } from '../../../src/shared/types';

jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='responsive-container'>{children}</div>
  ),
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='area-chart'>{children}</div>
  ),
  Area: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
}));

jest.mock('../../../src/renderer/services/statsApi', () => ({
  statsApi: { getLabelDetail: jest.fn() },
}));

const mockGetAlbumLabelStatus = jest.fn();
jest.mock('../../../src/renderer/context/AppContext', () => ({
  useApp: () => ({ state: { serverUrl: 'http://localhost:3001' } }),
}));
jest.mock('../../../src/renderer/services/api', () => ({
  getApiService: () => ({ getAlbumLabelStatus: mockGetAlbumLabelStatus }),
}));

const mockStatsApi = statsApi as jest.Mocked<typeof statsApi>;

const detail: LabelDetailResponse = {
  labelKey: 'sub pop',
  label: 'Sub Pop',
  otherSpellings: ['Sub Pop Records'],
  totalPlayCount: 1507,
  ownedPlayCount: 1200,
  lookedUpPlayCount: 307,
  includeUnowned: true,
  firstPlayed: 1553040000,
  lastPlayed: 1706745600,
  periodCounts: { thisWeek: 2, thisMonth: 3, thisYear: 307, allTime: 1507 },
  playTrend: [{ period: '2024-01', count: 35 }],
  topArtists: [
    {
      artist: 'The Afghan Whigs',
      playCount: 626,
      albumCount: 6,
      lastPlayed: 1706745600,
    },
    { artist: 'Clipping.', playCount: 260, albumCount: 4, lastPlayed: 1 },
  ],
  topAlbums: [
    {
      artist: 'The Afghan Whigs',
      album: 'Gentlemen At 21',
      playCount: 224,
      lastPlayed: 1706745600,
      coverUrl: 'https://example.com/g.jpg',
      collectionReleaseIds: [6393818],
      owned: true,
      source: 'owned',
    },
    {
      artist: 'Mudhoney',
      album: 'Every Good Boy Deserves Fudge',
      playCount: 120,
      lastPlayed: 1,
      collectionReleaseIds: [],
      owned: false,
      source: 'musicbrainz',
    },
  ],
  topTracks: [
    {
      artist: 'Clipping.',
      track: 'Nothing is Safe',
      album: 'CLPPNG',
      playCount: 50,
      lastPlayed: 1,
    },
  ],
  ownedCopyCount: 29,
  unplayedCopies: [
    { artist: 'Grifters', album: "Ain't My Lookout", releaseId: 1357233 },
  ],
};

describe('LabelDetailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (localStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      key === 'selectedLabel' ? 'Sub Pop Records' : null
    );
    window.location.hash = '#label?from=release-details';
    mockStatsApi.getLabelDetail.mockResolvedValue({
      success: true,
      data: detail,
    });
    mockGetAlbumLabelStatus.mockResolvedValue({
      total: 2050,
      checked: 2050,
      pending: 0,
    });
  });

  it('loads the stored label and shows its name, spellings and coverage', async () => {
    render(<LabelDetailPage />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sub Pop' })
    ).toBeInTheDocument();
    expect(mockStatsApi.getLabelDetail).toHaveBeenCalledWith(
      'Sub Pop Records',
      'month',
      true
    );
    expect(screen.getByText(/also listed as: sub pop records/i)).toBeVisible();
    expect(screen.getByText(/1,507 plays/)).toBeVisible();
    expect(screen.getByText(/29 copies in your collection/i)).toBeVisible();
    expect(
      screen.getByText(
        /1,200 from albums you own · 307 from albums you don't own/i
      )
    ).toBeVisible();
  });

  it('lists top artists, albums and tracks with links', async () => {
    render(<LabelDetailPage />);
    await screen.findByRole('heading', { level: 1, name: 'Sub Pop' });

    const artists = screen.getByRole('region', { name: 'Top artists' });
    expect(artists).toHaveTextContent('The Afghan Whigs');
    expect(artists).toHaveTextContent('626');
    expect(artists).toHaveTextContent('6 albums');
    expect(
      within(artists).getByRole('link', {
        name: /view artist details for the afghan whigs/i,
      })
    ).toBeInTheDocument();

    const albums = screen.getByRole('region', { name: 'Top albums' });
    expect(albums).toHaveTextContent('Gentlemen At 21');
    expect(albums).toHaveTextContent('224');

    const tracks = screen.getByRole('region', { name: 'Top tracks' });
    expect(tracks).toHaveTextContent('Nothing is Safe');
    expect(tracks).toHaveTextContent('50');
  });

  it("marks where each album's label came from", async () => {
    render(<LabelDetailPage />);
    await screen.findByRole('heading', { level: 1, name: 'Sub Pop' });

    const albums = screen.getByRole('region', { name: 'Top albums' });
    const rows = within(albums).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Owned');
    expect(rows[1]).toHaveTextContent('MusicBrainz');
  });

  it("can leave out albums you don't own", async () => {
    const user = userEvent.setup();
    render(<LabelDetailPage />);
    await screen.findByRole('heading', { level: 1, name: 'Sub Pop' });

    const toggle = screen.getByRole('checkbox', {
      name: "Include albums you don't own",
    });
    expect(toggle).toBeChecked();
    await user.click(toggle);

    expect(mockStatsApi.getLabelDetail).toHaveBeenLastCalledWith(
      'Sub Pop Records',
      'month',
      false
    );
  });

  it('says when labels are still being looked up', async () => {
    mockGetAlbumLabelStatus.mockResolvedValue({
      total: 2050,
      checked: 412,
      pending: 1638,
    });

    render(<LabelDetailPage />);

    expect(
      await screen.findByText(
        /still looking up labels: 412 of 2,050 albums checked/i
      )
    ).toBeInTheDocument();
  });

  it('lists owned records on the label that were never played', async () => {
    render(<LabelDetailPage />);
    await screen.findByRole('heading', { level: 1, name: 'Sub Pop' });

    const unplayed = screen.getByRole('region', {
      name: 'On the shelf, never played',
    });
    expect(unplayed).toHaveTextContent("Ain't My Lookout");
    expect(unplayed).toHaveTextContent('Grifters');
  });

  it('goes back to the page it came from', async () => {
    const user = userEvent.setup();
    render(<LabelDetailPage />);
    await screen.findByRole('heading', { level: 1, name: 'Sub Pop' });

    await user.click(
      screen.getByRole('button', { name: 'Back to Release Details' })
    );

    expect(window.location.hash).toBe('#release-details');
  });

  it('explains when the label has no albums in the collection', async () => {
    mockStatsApi.getLabelDetail.mockResolvedValue({
      success: false,
      error: 'No albums on this label in your collection',
    });

    render(<LabelDetailPage />);

    expect(
      await screen.findByText('No albums on this label in your collection')
    ).toBeInTheDocument();
  });

  it('asks to pick a label when none is stored', async () => {
    (localStorage.getItem as jest.Mock).mockReturnValue(null);

    render(<LabelDetailPage />);

    expect(await screen.findByText(/no label selected/i)).toBeInTheDocument();
    expect(mockStatsApi.getLabelDetail).not.toHaveBeenCalled();
  });
});
