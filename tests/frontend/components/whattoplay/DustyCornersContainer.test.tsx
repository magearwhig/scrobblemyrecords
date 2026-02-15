import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import '@testing-library/jest-dom';
// eslint-disable-next-line import/order
import { DustyCornerAlbum } from '../../../../src/shared/types';

const mockGetDustyCorners = jest.fn();

jest.mock('../../../../src/renderer/services/statsApi', () => ({
  statsApi: {
    getDustyCorners: mockGetDustyCorners,
  },
}));

jest.mock(
  '../../../../src/renderer/components/stats/DustyCornersSection',
  () => ({
    DustyCornersSection: ({
      albums,
      loading,
      showAll,
    }: {
      albums: DustyCornerAlbum[];
      loading: boolean;
      showAll: boolean;
    }) => (
      <div data-testid='dusty-corners-section'>
        {loading && <span>Loading...</span>}
        {!loading && <span>{albums.length} albums</span>}
        {showAll && <span>Show All</span>}
      </div>
    ),
  })
);

// eslint-disable-next-line import/order
import DustyCornersContainer from '../../../../src/renderer/components/whattoplay/DustyCornersContainer';

const mockAlbums: DustyCornerAlbum[] = [
  {
    artist: 'Artist A',
    album: 'Album A',
    coverUrl: 'https://example.com/a.jpg',
    lastPlayed: 1700000000,
    daysSincePlay: 120,
    collectionId: 1,
  },
  {
    artist: 'Artist B',
    album: 'Album B',
    lastPlayed: 1690000000,
    daysSincePlay: 200,
    collectionId: 2,
  },
];

describe('DustyCornersContainer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading state initially', () => {
    mockGetDustyCorners.mockReturnValue(new Promise(() => {}));

    render(<DustyCornersContainer />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders albums when data loads successfully', async () => {
    mockGetDustyCorners.mockResolvedValue({
      success: true,
      data: mockAlbums,
    });

    render(<DustyCornersContainer />);

    await waitFor(() => {
      expect(screen.getByText('2 albums')).toBeInTheDocument();
    });
  });

  it('passes showAll prop as true', async () => {
    mockGetDustyCorners.mockResolvedValue({
      success: true,
      data: mockAlbums,
    });

    render(<DustyCornersContainer />);

    await waitFor(() => {
      expect(screen.getByText('Show All')).toBeInTheDocument();
    });
  });

  it('handles API error gracefully', async () => {
    mockGetDustyCorners.mockRejectedValue(new Error('API error'));

    render(<DustyCornersContainer />);

    await waitFor(() => {
      expect(screen.getByText('0 albums')).toBeInTheDocument();
    });
  });

  it('handles unsuccessful response', async () => {
    mockGetDustyCorners.mockResolvedValue({
      success: false,
      data: null,
    });

    render(<DustyCornersContainer />);

    await waitFor(() => {
      expect(screen.getByText('0 albums')).toBeInTheDocument();
    });
  });

  it('calls getDustyCorners with limit of 50', async () => {
    mockGetDustyCorners.mockResolvedValue({
      success: true,
      data: [],
    });

    render(<DustyCornersContainer />);

    await waitFor(() => {
      expect(mockGetDustyCorners).toHaveBeenCalledWith(50);
    });
  });
});
