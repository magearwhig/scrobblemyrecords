import { act, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';

import AlbumScrobbleHistory from '../../../src/renderer/components/AlbumScrobbleHistory';
import { notifyHistorySynced } from '../../../src/renderer/hooks/useHistorySynced';

const mockGetAlbumHistory = jest.fn();
// One shared instance, like the real singleton ApiService
const mockApi = {
  getAlbumHistory: (...args: unknown[]) => mockGetAlbumHistory(...args),
};
jest.mock('../../../src/renderer/services/api', () => ({
  getApiService: () => mockApi,
}));

jest.mock('../../../src/renderer/context/AppContext', () => ({
  useApp: () => ({ state: { serverUrl: 'http://localhost:3001' } }),
}));

jest.mock('../../../src/renderer/hooks/useNotifications', () => ({
  useNotifications: () => ({ addNotification: jest.fn() }),
}));

const historyWith = (playCount: number) => ({
  found: true,
  artist: 'Pixies',
  album: 'Doolittle',
  lastPlayed: 1_700_000_000,
  playCount,
  plays: Array.from({ length: playCount }, (_, i) => ({
    timestamp: 1_700_000_000 - i * 60,
    track: `Track ${i + 1}`,
  })),
});

describe('AlbumScrobbleHistory', () => {
  beforeEach(() => {
    mockGetAlbumHistory.mockReset();
  });

  it('reloads quietly when a history sync finishes', async () => {
    mockGetAlbumHistory
      .mockResolvedValueOnce(historyWith(2))
      .mockResolvedValueOnce(historyWith(5));

    render(<AlbumScrobbleHistory artist='Pixies' album='Doolittle' />);
    expect(await screen.findByText('2')).toBeInTheDocument();

    act(() => notifyHistorySynced());

    expect(await screen.findByText('5')).toBeInTheDocument();
    // No loading state in between: the history stayed on screen
    expect(screen.queryByText('Loading history...')).not.toBeInTheDocument();
    expect(mockGetAlbumHistory).toHaveBeenCalledTimes(2);
    expect(mockGetAlbumHistory).toHaveBeenLastCalledWith('Pixies', 'Doolittle');
  });

  it('keeps showing the history if the quiet reload fails', async () => {
    mockGetAlbumHistory
      .mockResolvedValueOnce(historyWith(2))
      .mockRejectedValueOnce(new Error('Network error'));

    render(<AlbumScrobbleHistory artist='Pixies' album='Doolittle' />);
    expect(await screen.findByText('2')).toBeInTheDocument();

    act(() => notifyHistorySynced());

    await waitFor(() => expect(mockGetAlbumHistory).toHaveBeenCalledTimes(2));
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.queryByText('Network error')).not.toBeInTheDocument();
  });

  it('shows new scrobbles for an album that had none', async () => {
    mockGetAlbumHistory
      .mockRejectedValueOnce(new Error('Request failed with status code 404'))
      .mockResolvedValueOnce(historyWith(3));

    render(<AlbumScrobbleHistory artist='Pixies' album='Doolittle' />);
    expect(
      await screen.findByText('No scrobbles found for this album')
    ).toBeInTheDocument();

    act(() => notifyHistorySynced());

    expect(await screen.findByText('3')).toBeInTheDocument();
  });
});
