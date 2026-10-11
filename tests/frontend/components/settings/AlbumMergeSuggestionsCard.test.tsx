import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';

import AlbumMergeSuggestionsCard from '../../../../src/renderer/components/settings/AlbumMergeSuggestionsCard';
import ApiService from '../../../../src/renderer/services/api';
import { AlbumMergeSuggestion } from '../../../../src/shared/types';

const mockAddNotification = jest.fn();
jest.mock('../../../../src/renderer/hooks/useNotifications', () => ({
  useNotifications: () => ({ addNotification: mockAddNotification }),
}));

const suggestion = (
  overrides: Partial<AlbumMergeSuggestion> = {}
): AlbumMergeSuggestion => ({
  id: 'chromatics|killforlove',
  totalPlays: 64,
  target: { artist: 'chromatics', album: 'kill for love', collectionId: 0 },
  versions: [
    {
      artist: 'chromatics',
      album: 'kill for love',
      playCount: 53,
      linked: false,
      isTarget: true,
    },
    {
      artist: 'chromatics',
      album: 'kill for love (deluxe)',
      playCount: 11,
      linked: false,
      isTarget: false,
    },
  ],
  mappings: [
    {
      historyArtist: 'chromatics',
      historyAlbum: 'kill for love (deluxe)',
      collectionId: 0,
      collectionArtist: 'chromatics',
      collectionAlbum: 'kill for love',
    },
  ],
  ...overrides,
});

const createApi = (suggestions: AlbumMergeSuggestion[]) =>
  ({
    getAlbumMergeSuggestions: jest.fn().mockResolvedValue(suggestions),
    createAlbumMappingsBatch: jest.fn().mockResolvedValue({ added: 1 }),
    dismissAlbumMergeSuggestion: jest.fn().mockResolvedValue(undefined),
  }) as unknown as jest.Mocked<ApiService>;

describe('AlbumMergeSuggestionsCard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists each suggestion with its versions and play counts', async () => {
    render(<AlbumMergeSuggestionsCard api={createApi([suggestion()])} />);

    expect(
      await screen.findByText('chromatics — kill for love (deluxe)')
    ).toBeInTheDocument();
    expect(screen.getByText('11 plays')).toBeInTheDocument();
    expect(screen.getByText('Merge target')).toBeInTheDocument();
    expect(screen.getByText('64 plays in total')).toBeInTheDocument();
  });

  it('marks albums that merge into a collection copy', async () => {
    render(
      <AlbumMergeSuggestionsCard
        api={createApi([
          suggestion({
            target: {
              artist: 'Killer Mike',
              album: 'R.A.P. Music',
              collectionId: 5,
            },
          }),
        ])}
      />
    );

    expect(await screen.findByText('In collection')).toBeInTheDocument();
  });

  it('creates the mappings and removes the suggestion on Merge', async () => {
    const api = createApi([suggestion()]);
    const onMerged = jest.fn();
    render(<AlbumMergeSuggestionsCard api={api} onMerged={onMerged} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Merge' }));

    await waitFor(() =>
      expect(api.createAlbumMappingsBatch).toHaveBeenCalledWith(
        suggestion().mappings
      )
    );
    expect(
      await screen.findByText('No unmerged album versions found.')
    ).toBeInTheDocument();
    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' })
    );
    expect(onMerged).toHaveBeenCalled();
  });

  it('dismisses a suggestion', async () => {
    const api = createApi([suggestion()]);
    render(<AlbumMergeSuggestionsCard api={api} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));

    await waitFor(() =>
      expect(api.dismissAlbumMergeSuggestion).toHaveBeenCalledWith(
        'chromatics|killforlove'
      )
    );
    expect(api.createAlbumMappingsBatch).not.toHaveBeenCalled();
    expect(
      await screen.findByText('No unmerged album versions found.')
    ).toBeInTheDocument();
  });

  it('keeps the suggestion and reports an error when merging fails', async () => {
    const api = createApi([suggestion()]);
    api.createAlbumMappingsBatch.mockRejectedValue(new Error('boom'));
    render(<AlbumMergeSuggestionsCard api={api} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Merge' }));

    await waitFor(() =>
      expect(mockAddNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'alert', message: 'boom' })
      )
    );
    expect(screen.getByText('64 plays in total')).toBeInTheDocument();
  });

  it('shows more suggestions on request', async () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      suggestion({ id: `id-${i}`, totalPlays: 100 - i })
    );
    render(<AlbumMergeSuggestionsCard api={createApi(many)} />);

    expect(
      await screen.findAllByRole('button', { name: 'Merge' })
    ).toHaveLength(20);
    fireEvent.click(
      screen.getByRole('button', { name: 'Show more (5 remaining)' })
    );
    expect(screen.getAllByRole('button', { name: 'Merge' })).toHaveLength(25);
  });
});
