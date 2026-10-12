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
  SyncStatus,
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
});

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
    mockApi = createMockApi();
    mockApiService.getApiService.mockReturnValue(mockApi as any);
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
});
