import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import React from 'react';

import ToastContainer from '../../../src/renderer/components/ToastContainer';
import { AlbumSuggestionsCache } from '../../../src/renderer/components/unresolved/albumSuggestionsCache';
import {
  BulkResolveModal,
  RESOLUTIONS_CHUNK_SIZE,
} from '../../../src/renderer/components/unresolved/BulkResolveModal';
import { ToastProvider } from '../../../src/renderer/context/ToastContext';
import * as apiService from '../../../src/renderer/services/api';
import {
  UnresolvedArtistAlbumSuggestions,
  UnresolvedHistoryGroup,
  UnresolvedTrackAlbumSuggestion,
} from '../../../src/shared/types';

jest.mock('../../../src/renderer/services/api');
const mockApiService = apiService as jest.Mocked<typeof apiService>;

const T0 = 1700000000;

const group: UnresolvedHistoryGroup = {
  artist: 'guided by voices',
  artistName: 'Guided By Voices',
  playCount: 20,
  lastPlayed: T0,
  tracks: [],
  knownAlbums: ['Bee Thousand', 'Alien Lanes'],
};

const track = (
  name: string,
  playCount: number,
  suggestion: UnresolvedTrackAlbumSuggestion['suggestion'],
  alternatives: UnresolvedTrackAlbumSuggestion['alternatives'] = []
): UnresolvedTrackAlbumSuggestion => ({
  key: `guided by voices|${name.toLowerCase()}`,
  track: name,
  playCount,
  hidden: false,
  suggestion,
  alternatives,
});

const suggestions: UnresolvedArtistAlbumSuggestions = {
  artist: 'guided by voices',
  artistName: 'Guided By Voices',
  tracks: [
    track(
      'Game of Pricks',
      9,
      { album: 'Alien Lanes', source: 'history', trackPlays: 7 },
      [
        {
          album: 'Human Amusements at Hourly Rates',
          source: 'history',
          trackPlays: 2,
        },
      ]
    ),
    track('Echos Myron', 5, {
      album: 'Bee Thousand',
      source: 'collection',
      trackPlays: 0,
    }),
    track('Motor Away', 4, null),
    track('Tractor Rape Chain', 2, null),
  ],
};

let mockApi: {
  getUnresolvedAlbumSuggestions: jest.Mock;
  lookupUnresolvedAlbum: jest.Mock;
  saveUnresolvedResolutions: jest.Mock;
};
let onClose: jest.Mock;
let onSaved: jest.Mock;

const renderModal = (data: UnresolvedArtistAlbumSuggestions = suggestions) => {
  mockApi.getUnresolvedAlbumSuggestions.mockResolvedValue(data);
  const cache = new AlbumSuggestionsCache(
    mockApi.getUnresolvedAlbumSuggestions
  );
  return render(
    <ToastProvider>
      <BulkResolveModal
        group={group}
        includeHidden={false}
        suggestionsCache={cache}
        onClose={onClose}
        onSaved={onSaved}
      />
      <ToastContainer />
    </ToastProvider>
  );
};

const waitForRows = () => screen.findByLabelText('Album for Game of Pricks');

/** A promise plus its resolver, to control async timing. */
const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
};

describe('BulkResolveModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi = {
      getUnresolvedAlbumSuggestions: jest.fn(),
      lookupUnresolvedAlbum: jest.fn().mockResolvedValue({ album: null }),
      saveUnresolvedResolutions: jest.fn().mockResolvedValue({ saved: [] }),
    };
    mockApiService.getApiService.mockReturnValue(mockApi as any);
    onClose = jest.fn();
    onSaved = jest.fn();
  });

  it('loads suggestions and shows counts and sources', async () => {
    renderModal();

    expect(
      screen.getByText('Finding albums for each track…')
    ).toBeInTheDocument();
    await waitForRows();

    expect(mockApi.getUnresolvedAlbumSuggestions).toHaveBeenCalledWith(
      'guided by voices',
      { includeHidden: false }
    );
    expect(
      screen.getByText(/Suggested albums for 2 of 4 tracks — 2 without a match/)
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Album for Game of Pricks')).toHaveValue(
      'Alien Lanes'
    );
    expect(screen.getByLabelText('Album for Echos Myron')).toHaveValue(
      'Bee Thousand'
    );
    expect(screen.getByLabelText('Album for Motor Away')).toHaveValue('');
    expect(
      screen.getByText('from your history · played 7× on this album')
    ).toBeInTheDocument();
    expect(screen.getByText('from your collection')).toBeInTheDocument();
    expect(screen.getAllByText('no match')).toHaveLength(2);
    expect(screen.getByText('9 plays')).toBeInTheDocument();
  });

  it('checks a row by default only when it has a suggestion', async () => {
    renderModal();
    await waitForRows();

    expect(screen.getByLabelText('Include Game of Pricks')).toBeChecked();
    expect(screen.getByLabelText('Include Echos Myron')).toBeChecked();
    expect(screen.getByLabelText('Include Motor Away')).not.toBeChecked();
    expect(screen.getByLabelText('Include Motor Away')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save 2 albums' })).toBeEnabled();
  });

  it('offers alternatives and known albums in the row datalist', async () => {
    const { container } = renderModal();
    await waitForRows();

    const input = screen.getByLabelText('Album for Game of Pricks');
    const listId = input.getAttribute('list');
    expect(listId).toBeTruthy();
    const options = [
      ...container.ownerDocument
        .getElementById(listId as string)!
        .querySelectorAll('option'),
    ].map(o => o.getAttribute('value'));
    expect(options).toEqual([
      'Alien Lanes',
      'Human Amusements at Hourly Rates',
      'Bee Thousand',
    ]);
  });

  it('checks a row when an album is typed and unchecks it when cleared', async () => {
    renderModal();
    await waitForRows();

    const input = screen.getByLabelText('Album for Motor Away');
    await userEvent.type(input, 'Bee Thousand');
    expect(screen.getByLabelText('Include Motor Away')).toBeChecked();
    expect(screen.getByText('Save 3 albums')).toBeInTheDocument();

    await userEvent.clear(input);
    expect(screen.getByLabelText('Include Motor Away')).not.toBeChecked();
  });

  it('keeps a deliberately unchecked row unchecked while editing', async () => {
    renderModal();
    await waitForRows();

    await userEvent.click(screen.getByLabelText('Include Game of Pricks'));
    await userEvent.type(
      screen.getByLabelText('Album for Game of Pricks'),
      ' (Remaster)'
    );

    expect(screen.getByLabelText('Include Game of Pricks')).not.toBeChecked();
  });

  it('selects none and all with an album, and disables save when empty', async () => {
    renderModal();
    await waitForRows();

    await userEvent.click(screen.getByRole('button', { name: 'Select none' }));
    expect(screen.getByLabelText('Include Game of Pricks')).not.toBeChecked();
    expect(
      screen.getByRole('button', { name: 'Save 0 albums' })
    ).toBeDisabled();

    await userEvent.click(
      screen.getByRole('button', { name: 'Select all with an album' })
    );
    expect(screen.getByLabelText('Include Game of Pricks')).toBeChecked();
    expect(screen.getByLabelText('Include Echos Myron')).toBeChecked();
    expect(screen.getByLabelText('Include Motor Away')).not.toBeChecked();
  });

  it('filters to tracks without a match', async () => {
    renderModal();
    await waitForRows();

    await userEvent.click(
      screen.getByLabelText('Show only tracks without a match')
    );

    expect(
      screen.queryByLabelText('Album for Game of Pricks')
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Album for Motor Away')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Album for Tractor Rape Chain')
    ).toBeInTheDocument();
  });

  it('saves one resolution per checked row with edited values', async () => {
    renderModal();
    await waitForRows();

    const pricks = screen.getByLabelText('Album for Game of Pricks');
    await userEvent.clear(pricks);
    await userEvent.type(pricks, 'Human Amusements at Hourly Rates');
    await userEvent.click(screen.getByLabelText('Include Echos Myron'));
    await userEvent.type(
      screen.getByLabelText('Album for Motor Away'),
      '  Bee Thousand  '
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Save 2 albums' })
    );

    await waitFor(() =>
      expect(mockApi.saveUnresolvedResolutions).toHaveBeenCalledTimes(1)
    );
    expect(mockApi.saveUnresolvedResolutions).toHaveBeenCalledWith([
      {
        artist: 'guided by voices',
        track: 'Game of Pricks',
        album: 'Human Amusements at Hourly Rates',
        source: 'user',
      },
      {
        artist: 'guided by voices',
        track: 'Motor Away',
        album: 'Bee Thousand',
        source: 'user',
      },
    ]);
    expect(
      await screen.findByText('Attributed 13 plays from 2 tracks to albums')
    ).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('looks up unmatched rows on Last.fm one at a time', async () => {
    const first = deferred<{ album: string | null }>();
    const second = deferred<{ album: string | null }>();
    mockApi.lookupUnresolvedAlbum
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    renderModal();
    await waitForRows();

    await userEvent.click(
      screen.getByRole('button', { name: 'Look up missing on Last.fm' })
    );

    expect(screen.getByRole('status')).toHaveTextContent('Looking up 1 of 2…');
    expect(mockApi.lookupUnresolvedAlbum).toHaveBeenCalledTimes(1);
    expect(mockApi.lookupUnresolvedAlbum).toHaveBeenCalledWith(
      'Guided By Voices',
      'Motor Away'
    );

    await act(async () => {
      first.resolve({ album: 'Bee Thousand' });
    });
    expect(screen.getByRole('status')).toHaveTextContent('Looking up 2 of 2…');
    expect(mockApi.lookupUnresolvedAlbum).toHaveBeenCalledTimes(2);
    expect(mockApi.lookupUnresolvedAlbum).toHaveBeenLastCalledWith(
      'Guided By Voices',
      'Tractor Rape Chain'
    );
    expect(screen.getByLabelText('Album for Motor Away')).toHaveValue(
      'Bee Thousand'
    );
    expect(screen.getByLabelText('Include Motor Away')).toBeChecked();
    expect(screen.getByText('from Last.fm')).toBeInTheDocument();

    await act(async () => {
      second.resolve({ album: null });
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Last.fm found albums for 1 of 2 tracks.'
    );
    expect(screen.getByText('not on Last.fm')).toBeInTheDocument();
    expect(
      screen.getByText(/Suggested albums for 3 of 4 tracks — 1 without a match/)
    ).toBeInTheDocument();

    // Unedited Last.fm fills are saved as Last.fm rules
    await userEvent.click(
      screen.getByRole('button', { name: 'Save 3 albums' })
    );
    await waitFor(() =>
      expect(mockApi.saveUnresolvedResolutions).toHaveBeenCalledWith(
        expect.arrayContaining([
          {
            artist: 'guided by voices',
            track: 'Motor Away',
            album: 'Bee Thousand',
            source: 'lastfm-track-info',
          },
          {
            artist: 'guided by voices',
            track: 'Echos Myron',
            album: 'Bee Thousand',
            source: 'user',
          },
        ])
      )
    );
  });

  it('saves an edited Last.fm fill as the user’s choice', async () => {
    mockApi.lookupUnresolvedAlbum.mockResolvedValue({ album: 'Alien Lanes' });
    renderModal();
    await waitForRows();

    await userEvent.click(
      screen.getByRole('button', { name: 'Look up missing on Last.fm' })
    );
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Last.fm found albums for 2 of 2 tracks.'
      )
    );
    await userEvent.type(screen.getByLabelText('Album for Motor Away'), '!');
    expect(screen.getByText('your entry')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Save 4 albums' })
    );
    await waitFor(() =>
      expect(mockApi.saveUnresolvedResolutions).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            track: 'Motor Away',
            album: 'Alien Lanes!',
            source: 'user',
          }),
          expect.objectContaining({
            track: 'Tractor Rape Chain',
            album: 'Alien Lanes',
            source: 'lastfm-track-info',
          }),
        ])
      )
    );
  });

  it('can cancel a running Last.fm lookup', async () => {
    const first = deferred<{ album: string | null }>();
    mockApi.lookupUnresolvedAlbum.mockReturnValueOnce(first.promise);
    renderModal();
    await waitForRows();

    await userEvent.click(
      screen.getByRole('button', { name: 'Look up missing on Last.fm' })
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Stop looking up' })
    );
    await act(async () => {
      first.resolve({ album: 'Bee Thousand' });
    });

    expect(mockApi.lookupUnresolvedAlbum).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Album for Motor Away')).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Stopped after 0 of 2 lookups.'
    );
    expect(
      screen.getByRole('button', { name: 'Look up missing on Last.fm' })
    ).toBeEnabled();
  });

  it('finishes a cancelled lookup even if Stop is pressed twice', async () => {
    const first = deferred<{ album: string | null }>();
    mockApi.lookupUnresolvedAlbum.mockReturnValueOnce(first.promise);
    renderModal();
    await waitForRows();

    await userEvent.click(
      screen.getByRole('button', { name: 'Look up missing on Last.fm' })
    );
    const stop = screen.getByRole('button', { name: 'Stop looking up' });
    await userEvent.click(stop);
    await userEvent.click(stop);
    await act(async () => {
      first.resolve({ album: null });
    });

    expect(screen.getByRole('status')).toHaveTextContent(
      'Stopped after 0 of 2 lookups.'
    );
  });

  it('ignores a lookup from before the modal was reopened', async () => {
    const first = deferred<{ album: string | null }>();
    const second = deferred<{ album: string | null }>();
    mockApi.lookupUnresolvedAlbum
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    mockApi.getUnresolvedAlbumSuggestions.mockResolvedValue(suggestions);
    const cache = new AlbumSuggestionsCache(
      mockApi.getUnresolvedAlbumSuggestions
    );
    const ui = (open: boolean) => (
      <ToastProvider>
        <BulkResolveModal
          group={open ? group : null}
          includeHidden={false}
          suggestionsCache={cache}
          onClose={onClose}
          onSaved={onSaved}
        />
      </ToastProvider>
    );
    const { rerender } = render(ui(true));
    await waitForRows();
    await userEvent.click(
      screen.getByRole('button', { name: 'Look up missing on Last.fm' })
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Stop looking up' })
    );

    rerender(ui(false));
    rerender(ui(true));
    await waitForRows();
    await userEvent.click(
      screen.getByRole('button', { name: 'Look up missing on Last.fm' })
    );
    await act(async () => {
      first.resolve({ album: 'Stale Album' });
    });

    expect(screen.getByRole('status')).toHaveTextContent('Looking up 1 of 2…');
    expect(screen.getByLabelText('Album for Motor Away')).toHaveValue('');
    expect(
      screen.getByRole('button', { name: 'Stop looking up' })
    ).toBeInTheDocument();
    await act(async () => {
      second.resolve({ album: null });
    });
  });

  it('keeps an album typed while its lookup was running', async () => {
    const first = deferred<{ album: string | null }>();
    mockApi.lookupUnresolvedAlbum
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue({ album: null });
    renderModal();
    await waitForRows();

    await userEvent.click(
      screen.getByRole('button', { name: 'Look up missing on Last.fm' })
    );
    await userEvent.type(screen.getByLabelText('Album for Motor Away'), 'Mine');
    await act(async () => {
      first.resolve({ album: 'Bee Thousand' });
    });

    expect(screen.getByLabelText('Album for Motor Away')).toHaveValue('Mine');
  });

  describe('Last.fm tracklist verification', () => {
    const lookupByTrack = (results: Record<string, unknown>) =>
      mockApi.lookupUnresolvedAlbum.mockImplementation(
        async (_artist: string, trackName: string) =>
          results[trackName] ?? { album: null }
      );

    const runLookup = async () => {
      await userEvent.click(
        screen.getByRole('button', { name: 'Look up missing on Last.fm' })
      );
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(
          /Last\.fm found albums/
        )
      );
    };

    const rowFor = (name: string) =>
      screen.getByLabelText(`Album for ${name}`).closest('li') as HTMLElement;

    it('confirms a fill on the tracklist and keeps it selected', async () => {
      lookupByTrack({
        'Motor Away': {
          album: 'Alien Lanes',
          verification: {
            onTracklist: true,
            position: 11,
            trackCount: 28,
            imageUrl: 'https://img.example/alien-lanes.jpg',
            albumUrl: 'https://www.last.fm/music/GBV/Alien+Lanes',
          },
        },
      });
      renderModal();
      await waitForRows();
      await runLookup();

      const row = rowFor('Motor Away');
      expect(
        within(row).getByText('Track 11 of 28 on Alien Lanes')
      ).toBeInTheDocument();
      expect(within(row).getByLabelText('Include Motor Away')).toBeChecked();
      expect(row.querySelector('img')).toHaveAttribute(
        'src',
        'https://img.example/alien-lanes.jpg'
      );
      const link = within(row).getByRole('link', { name: 'View on Last.fm' });
      expect(link).toHaveAttribute(
        'href',
        'https://www.last.fm/music/GBV/Alien+Lanes'
      );
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('falls back to a generic confirmation without a position', async () => {
      lookupByTrack({
        'Motor Away': {
          album: 'Alien Lanes',
          verification: { onTracklist: true },
        },
      });
      renderModal();
      await waitForRows();
      await runLookup();

      expect(
        within(rowFor('Motor Away')).getByText("On Alien Lanes's tracklist")
      ).toBeInTheDocument();
    });

    it('warns about and leaves unselected a fill not on the tracklist', async () => {
      lookupByTrack({
        'Motor Away': {
          album: 'Suitcase 2',
          verification: { onTracklist: false, trackCount: 100 },
        },
      });
      renderModal();
      await waitForRows();
      await runLookup();

      const row = rowFor('Motor Away');
      expect(
        within(row).getByText(
          "Not on Suitcase 2's tracklist on Last.fm — check before saving"
        )
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Album for Motor Away')).toHaveValue(
        'Suitcase 2'
      );
      const checkbox = within(row).getByLabelText('Include Motor Away');
      expect(checkbox).not.toBeChecked();
      expect(row.querySelector('img')).not.toBeInTheDocument();

      // The user can still include it
      await userEvent.click(checkbox);
      expect(checkbox).toBeChecked();
    });

    it('notes when the tracklist could not be checked', async () => {
      lookupByTrack({
        'Motor Away': {
          album: 'Alien Lanes',
          verification: { onTracklist: null },
        },
      });
      renderModal();
      await waitForRows();
      await runLookup();

      const row = rowFor('Motor Away');
      expect(
        within(row).getByText("Couldn't check the tracklist")
      ).toBeInTheDocument();
      expect(within(row).getByLabelText('Include Motor Away')).toBeChecked();
    });

    it('hides the verification once the album is edited', async () => {
      lookupByTrack({
        'Motor Away': {
          album: 'Alien Lanes',
          verification: {
            onTracklist: true,
            position: 11,
            trackCount: 28,
            imageUrl: 'https://img.example/alien-lanes.jpg',
            albumUrl: 'https://www.last.fm/music/GBV/Alien+Lanes',
          },
        },
      });
      renderModal();
      await waitForRows();
      await runLookup();

      await userEvent.type(screen.getByLabelText('Album for Motor Away'), '!');

      const row = rowFor('Motor Away');
      expect(
        within(row).queryByText('Track 11 of 28 on Alien Lanes')
      ).not.toBeInTheDocument();
      expect(row.querySelector('img')).not.toBeInTheDocument();
      expect(
        within(row).queryByRole('link', { name: 'View on Last.fm' })
      ).not.toBeInTheDocument();
      expect(within(row).getByText('your entry')).toBeInTheDocument();
    });

    it('summarizes how many fills were confirmed', async () => {
      lookupByTrack({
        'Motor Away': {
          album: 'Alien Lanes',
          verification: { onTracklist: true, position: 11, trackCount: 28 },
        },
        'Tractor Rape Chain': {
          album: 'Suitcase 2',
          verification: { onTracklist: false },
        },
      });
      renderModal();
      await waitForRows();
      await runLookup();

      expect(screen.getByRole('status')).toHaveTextContent(
        'Last.fm found albums for 2 of 2 tracks — 1 confirmed on the tracklist, 1 not on the tracklist (left unselected).'
      );
    });
  });

  it(`chunks saves into requests of at most ${RESOLUTIONS_CHUNK_SIZE}`, async () => {
    const many: UnresolvedArtistAlbumSuggestions = {
      ...suggestions,
      tracks: Array.from({ length: 1201 }, (_, i) =>
        track(`Song ${i}`, 1, {
          album: 'Alien Lanes',
          source: 'history',
          trackPlays: 1,
        })
      ),
    };
    renderModal(many);
    await screen.findByLabelText('Album for Song 0');

    await userEvent.click(
      screen.getByRole('button', { name: 'Save 1,201 albums' })
    );

    await waitFor(() =>
      expect(mockApi.saveUnresolvedResolutions).toHaveBeenCalledTimes(3)
    );
    const sizes = mockApi.saveUnresolvedResolutions.mock.calls.map(
      ([batch]) => batch.length
    );
    expect(sizes).toEqual([500, 500, 201]);
    expect(
      await screen.findByText(
        'Attributed 1,201 plays from 1,201 tracks to albums'
      )
    ).toBeInTheDocument();
  }, 20000);

  it('keeps the dialog on a failed chunk and drops rows already saved', async () => {
    const many: UnresolvedArtistAlbumSuggestions = {
      ...suggestions,
      tracks: Array.from({ length: 501 }, (_, i) =>
        track(`Song ${i}`, 1, {
          album: 'Alien Lanes',
          source: 'history',
          trackPlays: 1,
        })
      ),
    };
    mockApi.saveUnresolvedResolutions
      .mockResolvedValueOnce({ saved: [] })
      .mockRejectedValueOnce(new Error('Server down'));
    renderModal(many);
    await screen.findByLabelText('Album for Song 0');

    await userEvent.click(
      screen.getByRole('button', { name: 'Save 501 albums' })
    );

    expect(
      await screen.findByText('Saved 500 of 501 albums, then: Server down')
    ).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Album for Song 500')).toBeInTheDocument();
    expect(screen.queryByLabelText('Album for Song 0')).not.toBeInTheDocument();
  }, 20000);

  it('ignores Escape while saving', async () => {
    const save = deferred<{ saved: [] }>();
    mockApi.saveUnresolvedResolutions.mockReturnValueOnce(save.promise);
    renderModal();
    await waitForRows();

    await userEvent.click(
      screen.getByRole('button', { name: 'Save 2 albums' })
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    await act(async () => {
      save.resolve({ saved: [] });
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows an error with retry when suggestions fail to load', async () => {
    mockApi.getUnresolvedAlbumSuggestions
      .mockRejectedValueOnce(new Error('Boom'))
      .mockResolvedValue(suggestions);
    const cache = new AlbumSuggestionsCache(
      mockApi.getUnresolvedAlbumSuggestions
    );
    render(
      <ToastProvider>
        <BulkResolveModal
          group={group}
          includeHidden
          suggestionsCache={cache}
          onClose={onClose}
          onSaved={onSaved}
        />
      </ToastProvider>
    );

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Boom')).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Retry' })
    );

    expect(await waitForRows()).toBeInTheDocument();
    expect(mockApi.getUnresolvedAlbumSuggestions).toHaveBeenLastCalledWith(
      'guided by voices',
      { includeHidden: true }
    );
  });
});
