import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import '@testing-library/jest-dom';
import ForgottenFavoritesContainer from '../../../../src/renderer/components/whattoplay/ForgottenFavoritesContainer';
import { ForgottenTrack } from '../../../../src/shared/types';

const mockGetForgottenFavorites = jest.fn();

jest.mock('../../../../src/renderer/services/api', () => ({
  getApiService: () => ({
    getForgottenFavorites: mockGetForgottenFavorites,
  }),
}));

jest.mock('../../../../src/renderer/context/AppContext', () => ({
  useApp: () => ({
    state: { serverUrl: 'http://localhost:3000' },
  }),
}));

jest.mock('../../../../src/renderer/hooks/useCollectionLookup', () => ({
  useCollectionLookup: () => ({
    collectionMap: new Map(),
    collectionArtistCounts: new Map(),
    loading: false,
    collection: [],
  }),
}));

// Mock the ForgottenFavoritesTab child component
jest.mock(
  '../../../../src/renderer/components/discovery/ForgottenFavoritesTab',
  () => {
    return function MockForgottenFavoritesTab(props: {
      forgottenTracks: ForgottenTrack[];
      forgottenLoading: boolean;
      forgottenError: string | null;
      forgottenTotalMatching: number;
      dormantDays: number;
      minPlays: number;
    }) {
      return (
        <div data-testid='forgotten-favorites-tab'>
          {props.forgottenLoading && <span>Loading...</span>}
          {props.forgottenError && <span>Error: {props.forgottenError}</span>}
          {!props.forgottenLoading && !props.forgottenError && (
            <>
              <span>{props.forgottenTracks.length} tracks</span>
              <span>Total: {props.forgottenTotalMatching}</span>
              <span>Dormant: {props.dormantDays}</span>
              <span>Min plays: {props.minPlays}</span>
            </>
          )}
        </div>
      );
    };
  }
);

const mockTracks: ForgottenTrack[] = [
  {
    artist: 'Test Artist',
    album: 'Test Album',
    track: 'Test Track',
    allTimePlayCount: 50,
    lastPlayed: 1700000000,
    daysSincePlay: 200,
  },
  {
    artist: 'Another Artist',
    album: 'Another Album',
    track: 'Another Track',
    allTimePlayCount: 30,
    lastPlayed: 1690000000,
    daysSincePlay: 300,
  },
];

describe('ForgottenFavoritesContainer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading state initially', () => {
    mockGetForgottenFavorites.mockReturnValue(new Promise(() => {}));

    render(<ForgottenFavoritesContainer />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders tracks when data loads successfully', async () => {
    mockGetForgottenFavorites.mockResolvedValue({
      tracks: mockTracks,
      meta: { totalMatching: 50 },
    });

    render(<ForgottenFavoritesContainer />);

    await waitFor(() => {
      expect(screen.getByText('2 tracks')).toBeInTheDocument();
      expect(screen.getByText('Total: 50')).toBeInTheDocument();
    });
  });

  it('passes default dormant days of 90', async () => {
    mockGetForgottenFavorites.mockResolvedValue({
      tracks: [],
      meta: { totalMatching: 0 },
    });

    render(<ForgottenFavoritesContainer />);

    await waitFor(() => {
      expect(screen.getByText('Dormant: 90')).toBeInTheDocument();
    });
  });

  it('passes default min plays of 10', async () => {
    mockGetForgottenFavorites.mockResolvedValue({
      tracks: [],
      meta: { totalMatching: 0 },
    });

    render(<ForgottenFavoritesContainer />);

    await waitFor(() => {
      expect(screen.getByText('Min plays: 10')).toBeInTheDocument();
    });
  });

  it('handles API error gracefully', async () => {
    mockGetForgottenFavorites.mockRejectedValue(
      new Error('Server unavailable')
    );

    render(<ForgottenFavoritesContainer />);

    await waitFor(() => {
      expect(screen.getByText('Error: Server unavailable')).toBeInTheDocument();
    });
  });

  it('calls getForgottenFavorites with default params', async () => {
    mockGetForgottenFavorites.mockResolvedValue({
      tracks: [],
      meta: { totalMatching: 0 },
    });

    render(<ForgottenFavoritesContainer />);

    await waitFor(() => {
      expect(mockGetForgottenFavorites).toHaveBeenCalledWith(90, 10, 100);
    });
  });
});
