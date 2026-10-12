import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import React from 'react';

import ToastContainer from '../../../src/renderer/components/ToastContainer';
import { BACKFILL_POLL_INTERVAL_MS } from '../../../src/renderer/components/unresolved/UnresolvedSummaryBanner';
import UnresolvedHistoryTab from '../../../src/renderer/components/UnresolvedHistoryTab';
import { ToastProvider } from '../../../src/renderer/context/ToastContext';
import * as apiService from '../../../src/renderer/services/api';
import {
  ExcludedHistoryArtist,
  ExclusionSuggestion,
  SyncStatus,
  UnresolvedArtistAlbumSuggestions,
  UnresolvedHistoryGroup,
  UnresolvedHistoryPage,
  UnresolvedHistorySummary,
  UnresolvedTrackResolution,
} from '../../../src/shared/types';

jest.mock('../../../src/renderer/services/api');
const mockApiService = apiService as jest.Mocked<typeof apiService>;

jest.mock('../../../src/renderer/context/AppContext', () => ({
  useApp: () => ({
    state: { serverUrl: 'http://localhost:3001' },
    dispatch: jest.fn(),
  }),
}));

const T0 = 1700000000; // Unix seconds

const groupOne: UnresolvedHistoryGroup = {
  artist: 'artist one',
  artistName: 'Artist One',
  playCount: 7,
  lastPlayed: T0 + 500,
  tracks: [
    {
      key: 'artist one|track a',
      track: 'Track A',
      playCount: 5,
      firstPlayed: T0,
      lastPlayed: T0 + 500,
      hidden: false,
    },
    {
      key: 'artist one|track b',
      track: 'Track B',
      playCount: 2,
      firstPlayed: T0,
      lastPlayed: T0 + 100,
      hidden: false,
    },
  ],
  knownAlbums: ['Known Album'],
};

const groupTwo: UnresolvedHistoryGroup = {
  artist: 'artist two',
  artistName: 'Artist Two',
  playCount: 3,
  lastPlayed: T0,
  tracks: [
    {
      key: 'artist two|solo',
      track: 'Solo',
      playCount: 3,
      firstPlayed: T0,
      lastPlayed: T0,
      hidden: false,
    },
  ],
  knownAlbums: [],
};

const page = (
  groups: UnresolvedHistoryGroup[] = [groupOne, groupTwo]
): UnresolvedHistoryPage => ({
  groups,
  total: groups.length,
  page: 1,
  limit: 25,
});

const baseSummary: UnresolvedHistorySummary = {
  indexedTotal: 1000,
  unresolvedCount: 10,
  resolvedByRuleCount: 4,
  hiddenCount: 0,
  resolutionCount: 2,
  excludedArtistCount: 0,
  excludedPlayCount: 0,
  lastfmTotal: 1200,
  lastfmTotalCheckedAt: Date.now(),
  gap: 200,
  lastFullBackfillAt: null,
};

const idleSync: SyncStatus = {
  status: 'idle',
  progress: 0,
  currentPage: 0,
  totalPages: 0,
  scrobblesFetched: 0,
  totalScrobbles: 0,
};

const rule: UnresolvedTrackResolution = {
  id: 'rule-1',
  artist: 'artist three',
  track: 'old song',
  album: 'Greatest Hits',
  source: 'user',
  createdAt: Date.now(),
};

const createMockApi = (summary: UnresolvedHistorySummary = baseSummary) => ({
  getUnresolvedHistory: jest.fn().mockResolvedValue(page()),
  getUnresolvedHistorySummary: jest.fn().mockResolvedValue(summary),
  lookupUnresolvedAlbum: jest.fn().mockResolvedValue({ album: 'Suggested LP' }),
  getUnresolvedResolutions: jest.fn().mockResolvedValue([rule]),
  saveUnresolvedResolutions: jest.fn().mockResolvedValue({ saved: [] }),
  deleteUnresolvedResolution: jest.fn().mockResolvedValue({ removed: true }),
  hideUnresolvedTracks: jest.fn().mockResolvedValue({ changed: 1 }),
  unhideUnresolvedTracks: jest.fn().mockResolvedValue({ changed: 1 }),
  startHistoryBackfill: jest.fn().mockResolvedValue({ message: 'started' }),
  getHistorySyncStatus: jest
    .fn()
    .mockResolvedValue({ sync: idleSync, storage: {} }),
  getExcludedHistoryArtists: jest
    .fn()
    .mockResolvedValue([] as ExcludedHistoryArtist[]),
  excludeHistoryArtists: jest.fn().mockResolvedValue({ changed: 1 }),
  includeHistoryArtists: jest.fn().mockResolvedValue({ changed: 1 }),
  getHistoryExclusionSuggestions: jest
    .fn()
    .mockResolvedValue([] as ExclusionSuggestion[]),
  getUnresolvedAlbumSuggestions: jest.fn().mockImplementation(
    async (artist: string): Promise<UnresolvedArtistAlbumSuggestions> => ({
      artist,
      artistName: artist,
      tracks: [],
    })
  ),
});

const podcastSuggestion: ExclusionSuggestion = {
  artist: 'the daily',
  artistName: 'The Daily',
  plays: 200,
  distinctTracks: 180,
  unresolvedShare: 0.94,
  episodeTitleShare: 0.2,
};

const episodeSuggestion: ExclusionSuggestion = {
  artist: 'radiolab',
  artistName: 'Radiolab',
  plays: 50,
  distinctTracks: 48,
  unresolvedShare: 0.3,
  episodeTitleShare: 0.69,
};

let mockApi: ReturnType<typeof createMockApi>;

const renderTab = () =>
  render(
    <ToastProvider>
      <UnresolvedHistoryTab />
      <ToastContainer />
    </ToastProvider>
  );

const waitForList = () => screen.findByText('Artist One');

const openResolve = async (trackName: string, artistName: string) => {
  await userEvent.click(
    screen.getByRole('button', {
      name: `Add album for ${trackName} by ${artistName}`,
    })
  );
  return screen.findByRole('dialog');
};

describe('UnresolvedHistoryTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // The shared setup stubs localStorage; back it with a real store here
    const stored = new Map<string, string>();
    jest
      .mocked(localStorage.getItem)
      .mockImplementation(key => stored.get(key) ?? null);
    jest
      .mocked(localStorage.setItem)
      .mockImplementation((key, value) => void stored.set(key, value));
    mockApi = createMockApi();
    mockApiService.getApiService.mockReturnValue(mockApi as any);
  });

  it('folds an artist, keeps it folded next time, and unfolds it', async () => {
    const { unmount } = renderTab();
    await waitForList();

    const toggle = screen.getByRole('button', { name: 'Artist One' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Track A')).not.toBeInTheDocument();
    // Folding only collapses the list: counts and actions stay
    expect(screen.getByText(/^7 plays ·/)).toBeInTheDocument();
    expect(screen.getByText('Solo')).toBeInTheDocument();
    expect(mockApi.hideUnresolvedTracks).not.toHaveBeenCalled();

    unmount();
    renderTab();
    await waitForList();
    expect(screen.queryByText('Track A')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Artist One' }));
    expect(screen.getByText('Track A')).toBeInTheDocument();
    expect(localStorage.getItem('unresolvedHistory.foldedArtists')).toBe('[]');
  });

  it('shows a folded artist’s tracks while searching', async () => {
    localStorage.setItem(
      'unresolvedHistory.foldedArtists',
      JSON.stringify(['artist one'])
    );
    renderTab();
    await waitForList();
    expect(screen.queryByText('Track A')).not.toBeInTheDocument();

    await userEvent.type(
      screen.getByLabelText('Search plays without album info'),
      'track'
    );

    expect(await screen.findByText('Track A')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Artist One' })).toBeDisabled();
  });

  it('ignores unreadable folded-artist storage', async () => {
    localStorage.setItem('unresolvedHistory.foldedArtists', '{not json');
    renderTab();
    await waitForList();
    expect(screen.getByText('Track A')).toBeInTheDocument();
  });

  it('renders the summary banner and grouped tracks', async () => {
    renderTab();

    expect(await waitForList()).toBeInTheDocument();
    expect(screen.getByText('Artist Two')).toBeInTheDocument();
    expect(screen.getByText('Track A')).toBeInTheDocument();
    expect(screen.getByText(/^5 plays ·/)).toBeInTheDocument();
    expect(
      await screen.findByText('10 plays without album info')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Counted in listening stats, excluded from album stats.')
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Last\.fm reports 1,200 · indexed 1,000/)
    ).toBeInTheDocument();
    expect(mockApi.getUnresolvedHistory).toHaveBeenCalledWith({
      search: undefined,
      sort: 'plays',
      page: 1,
      limit: 25,
      includeHidden: false,
    });
  });

  it('shows an empty state when nothing is unresolved', async () => {
    mockApi.getUnresolvedHistory.mockResolvedValue(page([]));
    mockApi.getUnresolvedHistorySummary.mockResolvedValue({
      ...baseSummary,
      unresolvedCount: 0,
    });

    renderTab();

    expect(
      await screen.findByText('Every play has album info')
    ).toBeInTheDocument();
  });

  it('searches with a debounced query', async () => {
    renderTab();
    await waitForList();

    await userEvent.type(
      screen.getByLabelText('Search plays without album info'),
      'solo'
    );

    await waitFor(() =>
      expect(mockApi.getUnresolvedHistory).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'solo', page: 1 })
      )
    );
  });

  it('changes sort and the show-hidden filter', async () => {
    renderTab();
    await waitForList();

    await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'artist');
    await waitFor(() =>
      expect(mockApi.getUnresolvedHistory).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: 'artist' })
      )
    );

    await userEvent.click(screen.getByLabelText('Show hidden'));
    await waitFor(() =>
      expect(mockApi.getUnresolvedHistory).toHaveBeenLastCalledWith(
        expect.objectContaining({ includeHidden: true })
      )
    );
  });

  it('resolves a single track to a known album', async () => {
    renderTab();
    await waitForList();

    const dialog = await openResolve('Track A', 'Artist One');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Known Album' })
    );
    expect(
      within(dialog).getByText(/5 plays will be attributed to "Known Album"/)
    ).toBeInTheDocument();

    const summaryCalls = mockApi.getUnresolvedHistorySummary.mock.calls.length;
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Save album' })
    );

    await waitFor(() =>
      expect(mockApi.saveUnresolvedResolutions).toHaveBeenCalledWith([
        {
          artist: 'artist one',
          track: 'Track A',
          album: 'Known Album',
          source: 'user',
        },
      ])
    );
    await waitFor(() =>
      expect(mockApi.getUnresolvedHistorySummary.mock.calls.length).toBe(
        summaryCalls + 1
      )
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
  });

  it('resolves all of an artist’s tracks with free text', async () => {
    renderTab();
    await waitForList();

    const dialog = await openResolve('Track A', 'Artist One');
    await userEvent.type(within(dialog).getByLabelText('Album'), 'Typed LP');
    await userEvent.click(
      within(dialog).getByLabelText(/All 2 listed tracks by Artist One/)
    );
    expect(
      within(dialog).getByText(/7 plays will be attributed to "Typed LP"/)
    ).toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Save album' })
    );

    await waitFor(() =>
      expect(mockApi.saveUnresolvedResolutions).toHaveBeenCalledWith([
        {
          artist: 'artist one',
          track: 'Track A',
          album: 'Typed LP',
          source: 'user',
        },
        {
          artist: 'artist one',
          track: 'Track B',
          album: 'Typed LP',
          source: 'user',
        },
      ])
    );
  });

  it('fills a Last.fm suggestion only after the user confirms it', async () => {
    renderTab();
    await waitForList();

    const dialog = await openResolve('Solo', 'Artist Two');
    // Single-track artist: no scope choice
    expect(
      within(dialog).queryByLabelText(/listed tracks by/)
    ).not.toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Suggest from Last.fm' })
    );
    expect(mockApi.lookupUnresolvedAlbum).toHaveBeenCalledWith(
      'Artist Two',
      'Solo'
    );
    expect(await within(dialog).findByText('Suggested LP')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Album')).toHaveValue('');
    expect(
      within(dialog).getByRole('button', { name: 'Save album' })
    ).toBeDisabled();

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Use this album' })
    );
    expect(within(dialog).getByLabelText('Album')).toHaveValue('Suggested LP');

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Save album' })
    );
    await waitFor(() =>
      expect(mockApi.saveUnresolvedResolutions).toHaveBeenCalledWith([
        {
          artist: 'artist two',
          track: 'Solo',
          album: 'Suggested LP',
          source: 'lastfm-track-info',
        },
      ])
    );
  });

  it('reports when Last.fm has no album', async () => {
    mockApi.lookupUnresolvedAlbum.mockResolvedValue({ album: null });
    renderTab();
    await waitForList();

    const dialog = await openResolve('Solo', 'Artist Two');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Suggest from Last.fm' })
    );

    expect(
      await within(dialog).findByText('Last.fm has no album for this track.')
    ).toBeInTheDocument();
  });

  it('shows the tracklist check with a Last.fm suggestion', async () => {
    mockApi.lookupUnresolvedAlbum.mockResolvedValue({
      album: 'Suggested LP',
      verification: {
        onTracklist: true,
        position: 3,
        trackCount: 12,
        imageUrl: 'https://img.example/cover.jpg',
        albumUrl: 'https://www.last.fm/music/Artist+Two/Suggested+LP',
      },
    });
    renderTab();
    await waitForList();

    const dialog = await openResolve('Solo', 'Artist Two');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Suggest from Last.fm' })
    );

    expect(
      await within(dialog).findByText('Track 3 of 12 on Suggested LP')
    ).toBeInTheDocument();
    expect(dialog.querySelector('img')).toHaveAttribute(
      'src',
      'https://img.example/cover.jpg'
    );
    const link = within(dialog).getByRole('link', { name: 'View on Last.fm' });
    expect(link).toHaveAttribute(
      'href',
      'https://www.last.fm/music/Artist+Two/Suggested+LP'
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(
      within(dialog).getByRole('button', { name: 'Use this album' })
    ).toBeEnabled();
  });

  it('warns when the suggested album lacks the track', async () => {
    mockApi.lookupUnresolvedAlbum.mockResolvedValue({
      album: 'Suitcase 2',
      verification: { onTracklist: false },
    });
    renderTab();
    await waitForList();

    const dialog = await openResolve('Solo', 'Artist Two');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Suggest from Last.fm' })
    );

    expect(
      await within(dialog).findByText(
        "Not on Suitcase 2's tracklist on Last.fm — check before saving"
      )
    ).toBeInTheDocument();
    expect(dialog.querySelector('img')).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole('link', { name: 'View on Last.fm' })
    ).not.toBeInTheDocument();
  });

  describe('album suggestions', () => {
    const artistOneSuggestions: UnresolvedArtistAlbumSuggestions = {
      artist: 'artist one',
      artistName: 'Artist One',
      tracks: [
        {
          key: 'artist one|track a',
          track: 'Track A',
          playCount: 5,
          hidden: false,
          suggestion: { album: 'Best Album', source: 'history', trackPlays: 7 },
          alternatives: [
            { album: 'Compilation', source: 'collection', trackPlays: 0 },
          ],
        },
        {
          key: 'artist one|track b',
          track: 'Track B',
          playCount: 2,
          hidden: false,
          suggestion: null,
          alternatives: [],
        },
      ],
    };

    beforeEach(() => {
      mockApi.getUnresolvedAlbumSuggestions.mockResolvedValue(
        artistOneSuggestions
      );
    });

    it('pre-fills the single-track modal with the suggested album', async () => {
      renderTab();
      await waitForList();

      const dialog = await openResolve('Track A', 'Artist One');

      await waitFor(() =>
        expect(within(dialog).getByLabelText('Album')).toHaveValue('Best Album')
      );
      expect(mockApi.getUnresolvedAlbumSuggestions).toHaveBeenCalledWith(
        'artist one',
        { includeHidden: false }
      );
      expect(
        within(dialog).getByText(
          'Suggested from your history · played 7× on this album'
        )
      ).toBeInTheDocument();

      // Still editable, and saved as the user's choice
      const input = within(dialog).getByLabelText('Album');
      await userEvent.clear(input);
      await userEvent.type(input, 'Other LP');
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Save album' })
      );
      await waitFor(() =>
        expect(mockApi.saveUnresolvedResolutions).toHaveBeenCalledWith([
          {
            artist: 'artist one',
            track: 'Track A',
            album: 'Other LP',
            source: 'user',
          },
        ])
      );
    });

    it('leaves the album empty when the track has no suggestion', async () => {
      renderTab();
      await waitForList();

      const dialog = await openResolve('Track B', 'Artist One');

      await waitFor(() =>
        expect(mockApi.getUnresolvedAlbumSuggestions).toHaveBeenCalled()
      );
      expect(within(dialog).getByLabelText('Album')).toHaveValue('');
    });

    it('does not overwrite an album the user picked before suggestions load', async () => {
      let resolveSuggestions: (
        value: UnresolvedArtistAlbumSuggestions
      ) => void = () => {};
      mockApi.getUnresolvedAlbumSuggestions.mockReturnValue(
        new Promise(resolve => {
          resolveSuggestions = resolve;
        })
      );
      renderTab();
      await waitForList();

      const dialog = await openResolve('Track A', 'Artist One');
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Known Album' })
      );
      await act(async () => {
        resolveSuggestions(artistOneSuggestions);
      });

      expect(within(dialog).getByLabelText('Album')).toHaveValue('Known Album');
    });

    it('reuses cached suggestions across modals until rules change', async () => {
      renderTab();
      await waitForList();

      let dialog = await openResolve('Track A', 'Artist One');
      await waitFor(() =>
        expect(within(dialog).getByLabelText('Album')).toHaveValue('Best Album')
      );
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Cancel' })
      );

      await userEvent.click(
        screen.getByRole('button', {
          name: 'Add albums for all 2 tracks by Artist One',
        })
      );
      dialog = await screen.findByRole('dialog', {
        name: 'Add albums for Artist One',
      });
      expect(
        await within(dialog).findByLabelText('Album for Track A')
      ).toHaveValue('Best Album');
      expect(mockApi.getUnresolvedAlbumSuggestions).toHaveBeenCalledTimes(1);

      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Save 1 album' })
      );
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      );

      // Saving cleared the cache, so the next open fetches again
      await openResolve('Track A', 'Artist One');
      await waitFor(() =>
        expect(mockApi.getUnresolvedAlbumSuggestions).toHaveBeenCalledTimes(2)
      );
    });

    it('offers bulk resolution only for artists with several tracks', async () => {
      renderTab();
      await waitForList();

      expect(
        screen.getByRole('button', {
          name: 'Add albums for all 2 tracks by Artist One',
        })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', {
          name: /Add albums for all .* Artist Two/,
        })
      ).not.toBeInTheDocument();
    });

    it('saves bulk albums, toasts the plays, and refreshes', async () => {
      renderTab();
      await waitForList();
      const listCalls = mockApi.getUnresolvedHistory.mock.calls.length;

      await userEvent.click(
        screen.getByRole('button', {
          name: 'Add albums for all 2 tracks by Artist One',
        })
      );
      const dialog = await screen.findByRole('dialog');
      await userEvent.type(
        await within(dialog).findByLabelText('Album for Track B'),
        'Typed LP'
      );
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Save 2 albums' })
      );

      await waitFor(() =>
        expect(mockApi.saveUnresolvedResolutions).toHaveBeenCalledWith([
          {
            artist: 'artist one',
            track: 'Track A',
            album: 'Best Album',
            source: 'user',
          },
          {
            artist: 'artist one',
            track: 'Track B',
            album: 'Typed LP',
            source: 'user',
          },
        ])
      );
      expect(
        await screen.findByText('Attributed 7 plays from 2 tracks to albums')
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(mockApi.getUnresolvedHistory.mock.calls.length).toBe(
          listCalls + 1
        )
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('hides a track and says hidden plays still count', async () => {
    renderTab();
    await waitForList();

    await userEvent.click(
      screen.getByRole('button', { name: 'Hide Track A by Artist One' })
    );

    await waitFor(() =>
      expect(mockApi.hideUnresolvedTracks).toHaveBeenCalledWith([
        'artist one|track a',
      ])
    );
    expect(
      await screen.findByText(
        'Hid "Track A". Its plays still count in your listening totals.'
      )
    ).toBeInTheDocument();
  });

  it('shows hidden tracks with a Show action that unhides', async () => {
    mockApi.getUnresolvedHistory.mockResolvedValue(
      page([
        {
          ...groupTwo,
          tracks: [{ ...groupTwo.tracks[0], hidden: true }],
        },
      ])
    );
    renderTab();
    await screen.findByText('Artist Two');

    await userEvent.click(
      screen.getByRole('button', { name: 'Show Solo by Artist Two' })
    );

    await waitFor(() =>
      expect(mockApi.unhideUnresolvedTracks).toHaveBeenCalledWith([
        'artist two|solo',
      ])
    );
  });

  it('lists rules and undoes one', async () => {
    renderTab();
    await waitForList();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Manage rules' })
    );
    expect(await screen.findByText('Greatest Hits')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', {
        name: 'Undo rule for old song by artist three',
      })
    );

    await waitFor(() =>
      expect(mockApi.deleteUnresolvedResolution).toHaveBeenCalledWith('rule-1')
    );
    await waitFor(() =>
      expect(mockApi.getUnresolvedResolutions).toHaveBeenCalledTimes(2)
    );
  });

  it('starts a full backfill from the banner', async () => {
    renderTab();
    await waitForList();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Recover missing history' })
    );

    await waitFor(() =>
      expect(mockApi.startHistoryBackfill).toHaveBeenCalledWith()
    );
    expect(screen.queryByText('Run again')).not.toBeInTheDocument();
  });

  it('offers "Run again" instead once a full backfill has run', async () => {
    mockApi.getUnresolvedHistorySummary.mockResolvedValue({
      ...baseSummary,
      lastFullBackfillAt: Date.now(),
    });
    renderTab();
    await waitForList();

    const runAgain = await screen.findByRole('button', { name: 'Run again' });
    expect(
      screen.queryByRole('button', { name: 'Recover missing history' })
    ).not.toBeInTheDocument();

    await userEvent.click(runAgain);
    await waitFor(() =>
      expect(mockApi.startHistoryBackfill).toHaveBeenCalledTimes(1)
    );
  });

  it('disables backfill while a sync is running', async () => {
    mockApi.getHistorySyncStatus.mockResolvedValue({
      sync: { ...idleSync, status: 'syncing', progress: 40 },
      storage: {},
    });
    renderTab();
    await waitForList();

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Recover missing history' })
      ).toBeDisabled()
    );
    expect(screen.getByText('Syncing with Last.fm: 40%')).toBeInTheDocument();
  });

  it('warns when the server reports a sync is already running', async () => {
    mockApi.startHistoryBackfill.mockRejectedValue({
      response: { status: 409 },
    });
    renderTab();
    await waitForList();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Recover missing history' })
    );

    expect(
      await screen.findByText(/A history sync is already running/)
    ).toBeInTheDocument();
  });

  it('refreshes the list and summary when the backfill finishes', async () => {
    jest.useFakeTimers();
    try {
      mockApi.getHistorySyncStatus
        .mockResolvedValueOnce({
          sync: { ...idleSync, status: 'syncing', progress: 50 },
          storage: {},
        })
        .mockResolvedValue({
          sync: { ...idleSync, status: 'completed', progress: 100 },
          storage: {},
        });
      renderTab();
      await act(async () => {
        await Promise.resolve();
      });
      await screen.findByText('Syncing with Last.fm: 50%');

      const listCalls = mockApi.getUnresolvedHistory.mock.calls.length;
      const summaryCalls =
        mockApi.getUnresolvedHistorySummary.mock.calls.length;

      await act(async () => {
        jest.advanceTimersByTime(BACKFILL_POLL_INTERVAL_MS);
      });

      await waitFor(() =>
        expect(mockApi.getUnresolvedHistory.mock.calls.length).toBeGreaterThan(
          listCalls
        )
      );
      expect(
        mockApi.getUnresolvedHistorySummary.mock.calls.length
      ).toBeGreaterThan(summaryCalls);
      expect(
        screen.queryByText('Syncing with Last.fm: 50%')
      ).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps watching a started backfill until it reports syncing, then refreshes', async () => {
    jest.useFakeTimers();
    try {
      const status = (s: SyncStatus['status'], progress = 0) => ({
        sync: { ...idleSync, status: s, progress },
        storage: {},
      });
      // Initial load + right after start: still idle (first page not fetched)
      mockApi.getHistorySyncStatus
        .mockResolvedValueOnce(status('idle'))
        .mockResolvedValueOnce(status('idle'))
        .mockResolvedValueOnce(status('syncing', 30))
        .mockResolvedValue(status('completed', 100));
      renderTab();
      await act(async () => {
        await Promise.resolve();
      });
      const button = await screen.findByRole('button', {
        name: 'Recover missing history',
      });

      fireEvent.click(button);
      await waitFor(() =>
        expect(mockApi.startHistoryBackfill).toHaveBeenCalled()
      );
      expect(
        await screen.findByText('Starting recovery...')
      ).toBeInTheDocument();
      expect(button).toBeDisabled();

      const summaryCalls =
        mockApi.getUnresolvedHistorySummary.mock.calls.length;

      await act(async () => {
        jest.advanceTimersByTime(BACKFILL_POLL_INTERVAL_MS);
      });
      expect(
        await screen.findByText('Syncing with Last.fm: 30%')
      ).toBeInTheDocument();
      expect(mockApi.getUnresolvedHistorySummary.mock.calls.length).toBe(
        summaryCalls
      );

      await act(async () => {
        jest.advanceTimersByTime(BACKFILL_POLL_INTERVAL_MS);
      });
      await waitFor(() =>
        expect(
          mockApi.getUnresolvedHistorySummary.mock.calls.length
        ).toBeGreaterThan(summaryCalls)
      );
      expect(
        await screen.findByText('Missing listening history recovered')
      ).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('ignores a stale Last.fm lookup after switching tracks', async () => {
    let resolveLookup: (value: { album: string | null }) => void = () => {};
    mockApi.lookupUnresolvedAlbum.mockReturnValueOnce(
      new Promise(resolve => {
        resolveLookup = resolve;
      })
    );
    renderTab();
    await waitForList();

    let dialog = await openResolve('Track A', 'Artist One');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Suggest from Last.fm' })
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' })
    );

    dialog = await openResolve('Solo', 'Artist Two');
    await act(async () => {
      resolveLookup({ album: 'Wrong Album' });
    });

    expect(within(dialog).queryByText('Wrong Album')).not.toBeInTheDocument();
  });

  it('steps back a page when the current page empties', async () => {
    mockApi.getUnresolvedHistory.mockImplementation(
      async ({ page: requested }: { page: number }) =>
        requested === 1
          ? { groups: [groupOne], total: 26, page: 1, limit: 25 }
          : { groups: [], total: 25, page: requested, limit: 25 }
    );
    renderTab();
    await waitForList();

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    await waitFor(() =>
      expect(mockApi.getUnresolvedHistory).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1 })
      )
    );
    expect(await screen.findByText('Artist One')).toBeInTheDocument();
  });

  it('shows an error with retry when the list fails', async () => {
    mockApi.getUnresolvedHistory.mockRejectedValueOnce(new Error('boom'));
    renderTab();

    expect(await screen.findByText('boom')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await waitForList()).toBeInTheDocument();
  });

  describe('artist exclusion', () => {
    it('stops tracking an artist from its group, then undoes it', async () => {
      renderTab();
      await waitForList();

      await userEvent.click(
        screen.getByRole('button', {
          name: "Don't track this artist: Artist One",
        })
      );
      const dialog = await screen.findByRole('dialog');
      expect(
        within(dialog).getByText('Stop tracking Artist One?')
      ).toBeInTheDocument();
      expect(
        within(dialog).getByText(/left out of all listening stats/)
      ).toBeInTheDocument();
      expect(
        within(dialog).getByText(/including any plays with album info/)
      ).toBeInTheDocument();
      expect(mockApi.excludeHistoryArtists).not.toHaveBeenCalled();

      await userEvent.click(
        within(dialog).getByRole('button', { name: "Don't track" })
      );

      await waitFor(() =>
        expect(mockApi.excludeHistoryArtists).toHaveBeenCalledWith([
          'artist one',
        ])
      );
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      );
      expect(
        await screen.findByText(/Stopped tracking Artist One\./)
      ).toBeInTheDocument();
      // List, summary and suggestions are refreshed
      await waitFor(() =>
        expect(mockApi.getUnresolvedHistory).toHaveBeenCalledTimes(2)
      );
      expect(mockApi.getUnresolvedHistorySummary).toHaveBeenCalledTimes(2);
      expect(mockApi.getHistoryExclusionSuggestions).toHaveBeenCalledTimes(2);

      await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
      await waitFor(() =>
        expect(mockApi.includeHistoryArtists).toHaveBeenCalledWith([
          'artist one',
        ])
      );
      expect(
        await screen.findByText(/Artist One is tracked again/)
      ).toBeInTheDocument();
    });

    it('cancelling the confirm does not exclude', async () => {
      renderTab();
      await waitForList();

      await userEvent.click(
        screen.getByRole('button', {
          name: "Don't track this artist: Artist Two",
        })
      );
      const dialog = await screen.findByRole('dialog');
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Cancel' })
      );

      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      );
      expect(mockApi.excludeHistoryArtists).not.toHaveBeenCalled();
    });

    it('keeps the dialog open on Escape while excluding is in flight', async () => {
      let resolveExclude: (value: { changed: number }) => void = () => {};
      mockApi.excludeHistoryArtists.mockReturnValue(
        new Promise(resolve => {
          resolveExclude = resolve;
        })
      );
      renderTab();
      await waitForList();

      await userEvent.click(
        screen.getByRole('button', {
          name: "Don't track this artist: Artist One",
        })
      );
      const dialog = await screen.findByRole('dialog');
      await userEvent.click(
        within(dialog).getByRole('button', { name: "Don't track" })
      );
      await userEvent.keyboard('{Escape}');
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      await act(async () => {
        resolveExclude({ changed: 1 });
      });
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      );
    });

    it('shows an error and keeps the dialog when excluding fails', async () => {
      mockApi.excludeHistoryArtists.mockRejectedValue(new Error('Disk full'));
      renderTab();
      await waitForList();

      await userEvent.click(
        screen.getByRole('button', {
          name: "Don't track this artist: Artist One",
        })
      );
      const dialog = await screen.findByRole('dialog');
      await userEvent.click(
        within(dialog).getByRole('button', { name: "Don't track" })
      );

      expect(await screen.findByText('Disk full')).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('renders podcast suggestions with reasons and excludes one', async () => {
      mockApi.getHistoryExclusionSuggestions.mockResolvedValue([
        podcastSuggestion,
        episodeSuggestion,
      ]);
      renderTab();

      const panel = (
        await screen.findByRole('heading', { name: /Looks like a podcast/ })
      ).closest('section') as HTMLElement;
      expect(within(panel).getByText('The Daily')).toBeInTheDocument();
      expect(
        within(panel).getByText('200 plays · 180 tracks')
      ).toBeInTheDocument();
      expect(
        within(panel).getByText('94% without album info')
      ).toBeInTheDocument();
      expect(
        within(panel).getByText('69% episode-like titles')
      ).toBeInTheDocument();

      await userEvent.click(
        within(panel).getByRole('button', { name: 'Exclude The Daily' })
      );
      const dialog = await screen.findByRole('dialog');
      expect(
        within(dialog).getByText('Stop tracking The Daily?')
      ).toBeInTheDocument();
      // 200 plays, 94% without album info -> 12 with album info
      expect(
        within(dialog).getByText(/including 12 plays with album info/)
      ).toBeInTheDocument();

      await userEvent.click(
        within(dialog).getByRole('button', { name: "Don't track" })
      );
      await waitFor(() =>
        expect(mockApi.excludeHistoryArtists).toHaveBeenCalledWith([
          'the daily',
        ])
      );
    });

    it('excludes all suggestions after confirming the list', async () => {
      mockApi.getHistoryExclusionSuggestions.mockResolvedValue([
        podcastSuggestion,
        episodeSuggestion,
      ]);
      renderTab();

      await userEvent.click(
        await screen.findByRole('button', { name: 'Exclude all' })
      );
      const dialog = await screen.findByRole('dialog');
      expect(
        within(dialog).getByText('Stop tracking 2 artists?')
      ).toBeInTheDocument();
      const list = within(dialog).getByRole('list', {
        name: 'Artists to exclude',
      });
      expect(within(list).getByText('The Daily')).toBeInTheDocument();
      expect(within(list).getByText('Radiolab')).toBeInTheDocument();
      expect(within(list).getByText('200 plays')).toBeInTheDocument();

      await userEvent.click(
        within(dialog).getByRole('button', { name: "Don't track any of them" })
      );
      await waitFor(() =>
        expect(mockApi.excludeHistoryArtists).toHaveBeenCalledWith([
          'the daily',
          'radiolab',
        ])
      );
      expect(
        await screen.findByText(/Stopped tracking 2 artists\./)
      ).toBeInTheDocument();
    });

    it('collapses the suggestions panel', async () => {
      mockApi.getHistoryExclusionSuggestions.mockResolvedValue([
        podcastSuggestion,
      ]);
      renderTab();

      const toggle = await screen.findByRole('button', { name: 'Collapse' });
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await userEvent.click(toggle);

      expect(screen.queryByText('The Daily')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Expand' })).toHaveAttribute(
        'aria-expanded',
        'false'
      );
    });

    it('hides the suggestions panel when there are none', async () => {
      renderTab();
      await waitForList();

      expect(
        screen.queryByRole('heading', { name: /Looks like a podcast/ })
      ).not.toBeInTheDocument();
    });

    it('notes excluded plays in the banner and lists them to track again', async () => {
      mockApi.getUnresolvedHistorySummary.mockResolvedValue({
        ...baseSummary,
        excludedArtistCount: 2,
        excludedPlayCount: 340,
      });
      mockApi.getExcludedHistoryArtists.mockResolvedValue([
        { artist: 'the daily', artistName: 'The Daily', plays: 300 },
        { artist: 'radiolab', artistName: 'Radiolab', plays: 40 },
      ]);
      renderTab();

      expect(
        await screen.findByText(
          "340 plays from 2 excluded artists aren't counted in listening stats."
        )
      ).toBeInTheDocument();
      expect(
        screen.getByText('2 artists not tracked (340 plays)')
      ).toBeInTheDocument();
      expect(mockApi.getExcludedHistoryArtists).not.toHaveBeenCalled();

      const toggle = screen.getByRole('button', {
        name: 'Manage not tracked',
      });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await userEvent.click(toggle);
      expect(
        screen.getByRole('button', { name: 'Hide not tracked' })
      ).toHaveAttribute('aria-expanded', 'true');

      const panel = (
        await screen.findByRole('heading', { name: 'Not tracked' })
      ).closest('section') as HTMLElement;
      expect(await within(panel).findByText('The Daily')).toBeInTheDocument();
      expect(within(panel).getByText('300 plays')).toBeInTheDocument();

      await userEvent.click(
        within(panel).getByRole('button', { name: 'Track again: The Daily' })
      );
      await waitFor(() =>
        expect(mockApi.includeHistoryArtists).toHaveBeenCalledWith([
          'the daily',
        ])
      );
      expect(
        await screen.findByText(/The Daily is tracked again/)
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(mockApi.getExcludedHistoryArtists).toHaveBeenCalledTimes(2)
      );
      expect(mockApi.excludeHistoryArtists).not.toHaveBeenCalled();
    });

    it('keeps the Last.fm totals neutral when the only difference is exclusions', async () => {
      mockApi.getUnresolvedHistorySummary.mockResolvedValue({
        ...baseSummary,
        indexedTotal: 1200,
        gap: 0,
        excludedArtistCount: 1,
        excludedPlayCount: 1,
      });
      renderTab();

      expect(
        await screen.findByText(/Last\.fm reports 1,200 · indexed 1,200/)
      ).toBeInTheDocument();
      expect(screen.queryByText(/plays? missing\)/)).not.toBeInTheDocument();
      expect(
        screen.getByText(
          "1 play from 1 excluded artist isn't counted in listening stats."
        )
      ).toBeInTheDocument();
    });

    it('does not show the not-tracked row when nothing is excluded', async () => {
      renderTab();
      await screen.findByText('10 plays without album info');

      expect(
        screen.queryByRole('button', { name: 'Manage not tracked' })
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/excluded artist/)).not.toBeInTheDocument();
    });
  });
});
