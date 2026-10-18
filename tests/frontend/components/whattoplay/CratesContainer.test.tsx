import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import '@testing-library/jest-dom';

import CratesContainer, {
  pickIndex,
} from '../../../../src/renderer/components/whattoplay/CratesContainer';
import { AppProvider } from '../../../../src/renderer/context/AppContext';
import { AuthProvider } from '../../../../src/renderer/context/AuthContext';
import { AuthStatus, CrateSuggestion } from '../../../../src/shared/types';
import {
  makeAlbum,
  makeCrate,
  makeEvaluation,
  makeSummary,
} from '../crates/crateFixtures';

const mockApi = {
  getCrates: jest.fn(),
  getCrate: jest.fn(),
  createCrate: jest.fn(),
  getCrateSuggestions: jest.fn(),
};

jest.mock('../../../../src/renderer/services/api', () => ({
  getApiService: () => mockApi,
}));

jest.mock('../../../../src/renderer/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

const connected: AuthStatus = {
  discogs: { authenticated: true, username: 'tester' },
  lastfm: { authenticated: true, username: 'tester' },
};

function renderContainer(authStatus: AuthStatus = connected) {
  return render(
    <AppProvider>
      <AuthProvider value={{ authStatus, setAuthStatus: jest.fn() }}>
        <CratesContainer />
      </AuthProvider>
    </AppProvider>
  );
}

const kindOfBlue = makeAlbum();
const somethinElse = makeAlbum({
  albumKey: 'cannonball adderley::somethin else',
  artist: 'Cannonball Adderley',
  album: "Somethin' Else",
  witnessReleaseId: 202,
  copies: [
    {
      releaseId: 201,
      title: "Somethin' Else",
      artist: 'Cannonball Adderley',
      year: 1958,
      format: ['Vinyl'],
      dateAdded: '2020-01-01T10:00:00-08:00',
      copyCount: 1,
    },
    {
      releaseId: 202,
      title: "Somethin' Else (Tone Poet)",
      artist: 'Cannonball Adderley',
      year: 2021,
      format: ['Vinyl', 'LP'],
      dateAdded: '2022-05-01T10:00:00-08:00',
      copyCount: 1,
    },
  ],
});

const suggestion: CrateSuggestion = {
  candidateKey: 'style-quiet:hard bop',
  recipe: 'style-quiet',
  name: 'Quiet Hard Bop',
  description: 'Hard Bop albums with no scrobbles recorded in the last year',
  reason: 'You own 12 Hard Bop albums',
  rules: [{ id: 'style', field: 'style', op: 'anyOf', values: ['Hard Bop'] }],
  sort: 'artist',
  count: 12,
  sampleCovers: [],
};

describe('CratesContainer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    window.location.hash = '#what-to-play?tab=crates';
    mockApi.getCrates.mockResolvedValue([
      makeSummary({ id: 'crate-1', pinnedToWhatToPlay: true, count: 2 }),
      makeSummary({
        id: 'crate-2',
        name: 'Not pinned',
        pinnedToWhatToPlay: false,
      }),
    ]);
    mockApi.getCrate.mockResolvedValue({
      crate: makeCrate({ id: 'crate-1', pinnedToWhatToPlay: true }),
      evaluation: makeEvaluation({ albums: [kindOfBlue, somethinElse] }),
    });
    mockApi.getCrateSuggestions.mockResolvedValue({
      suggestions: [suggestion],
      exhausted: false,
    });
  });

  it('lists only pinned crates with their counts', async () => {
    renderContainer();
    const list = await screen.findByRole('list', { name: 'Pinned crates' });
    expect(
      within(list).getByRole('heading', { name: 'Jazz in 40 minutes' })
    ).toBeInTheDocument();
    expect(within(list).getByText('2 albums')).toBeInTheDocument();
    expect(screen.queryByText('Not pinned')).not.toBeInTheDocument();
    expect(
      within(list).getByRole('link', { name: 'Open crate' })
    ).toHaveAttribute('href', '#crates?id=crate-1');
    expect(mockApi.getCrateSuggestions).not.toHaveBeenCalled();
  });

  it('picks a random album with its reasons', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const user = userEvent.setup();
    renderContainer();

    await user.click(
      await screen.findByRole('button', {
        name: 'Pick one from Jazz in 40 minutes',
      })
    );

    const picked = await screen.findByRole('article', {
      name: 'Picked album',
    });
    expect(mockApi.getCrate).toHaveBeenCalledWith('crate-1');
    expect(within(picked).getByText('Kind of Blue')).toBeInTheDocument();
    expect(within(picked).getByText('Miles Davis')).toBeInTheDocument();
    expect(
      within(picked).getByText('From Jazz in 40 minutes')
    ).toBeInTheDocument();
    // First two reasons (formatCrateReason), not all three
    expect(within(picked).getAllByRole('listitem')).toHaveLength(2);
  });

  it('Pick another chooses a different album without refetching', async () => {
    const random = jest.spyOn(Math, 'random').mockReturnValue(0);
    const user = userEvent.setup();
    renderContainer();
    await user.click(
      await screen.findByRole('button', {
        name: 'Pick one from Jazz in 40 minutes',
      })
    );
    expect(await screen.findByText('Kind of Blue')).toBeInTheDocument();

    random.mockReturnValue(0);
    await user.click(screen.getByRole('button', { name: /pick another/i }));
    expect(await screen.findByText("Somethin' Else")).toBeInTheDocument();
    expect(mockApi.getCrate).toHaveBeenCalledTimes(1);
  });

  it('Pick one re-evaluates the crate each time', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const user = userEvent.setup();
    renderContainer();
    const pickOne = await screen.findByRole('button', {
      name: 'Pick one from Jazz in 40 minutes',
    });
    await user.click(pickOne);
    await screen.findByRole('article', { name: 'Picked album' });
    await user.click(pickOne);
    await screen.findByRole('article', { name: 'Picked album' });
    expect(mockApi.getCrate).toHaveBeenCalledTimes(2);
  });

  it('Open release opens the witness copy', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.99);
    const user = userEvent.setup();
    renderContainer();
    await user.click(
      await screen.findByRole('button', {
        name: 'Pick one from Jazz in 40 minutes',
      })
    );
    await screen.findByText("Somethin' Else");

    await user.click(screen.getByRole('button', { name: /open release/i }));

    // localStorage is a jest mock (tests/setupReact.ts)
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'selectedRelease',
      JSON.stringify({
        id: 202,
        title: "Somethin' Else (Tone Poet)",
        artist: 'Cannonball Adderley',
      })
    );
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'selectedCollectionItemId',
      '202'
    );
    expect(window.location.hash).toBe('#release-details?from=what-to-play');
  });

  it('shows an error with retry when the crate fails to load', async () => {
    mockApi.getCrate.mockRejectedValueOnce(new Error('Boom'));
    const user = userEvent.setup();
    renderContainer();
    await user.click(
      await screen.findByRole('button', {
        name: 'Pick one from Jazz in 40 minutes',
      })
    );
    expect(await screen.findByText('Boom')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('article', { name: 'Picked album' })
    ).toBeInTheDocument();
  });

  describe('empty state', () => {
    beforeEach(() => {
      mockApi.getCrates.mockResolvedValue([
        makeSummary({ pinnedToWhatToPlay: false }),
      ]);
    });

    it('asks to pin a crate and links to Crates', async () => {
      const user = userEvent.setup();
      renderContainer();
      expect(
        await screen.findByText('Pin a crate to see it here')
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Go to Crates' }));
      expect(window.location.hash).toBe('#crates');
    });

    it('offers the first suggested crate and adds it pinned', async () => {
      mockApi.createCrate.mockResolvedValue(
        makeCrate({ id: 'new', pinnedToWhatToPlay: true })
      );
      const user = userEvent.setup();
      renderContainer();

      expect(await screen.findByText('Quiet Hard Bop')).toBeInTheDocument();
      expect(mockApi.getCrateSuggestions).toHaveBeenCalledWith(1);
      expect(
        screen.getByText('You own 12 Hard Bop albums')
      ).toBeInTheDocument();

      mockApi.getCrates.mockResolvedValue([
        makeSummary({
          id: 'new',
          name: 'Quiet Hard Bop',
          pinnedToWhatToPlay: true,
        }),
      ]);
      await user.click(
        screen.getByRole('button', { name: 'Add and pin crate Quiet Hard Bop' })
      );

      expect(mockApi.createCrate).toHaveBeenCalledWith({
        name: 'Quiet Hard Bop',
        description: suggestion.description,
        rules: suggestion.rules,
        sort: 'artist',
        pinnedToWhatToPlay: true,
        sourceSuggestionKey: 'style-quiet:hard bop',
      });
      expect(
        await screen.findByRole('button', {
          name: 'Pick one from Quiet Hard Bop',
        })
      ).toBeInTheDocument();
    });

    it('shows the empty state without a suggestion when none is available', async () => {
      mockApi.getCrateSuggestions.mockResolvedValue({
        suggestions: [],
        exhausted: true,
      });
      renderContainer();
      expect(
        await screen.findByText('Pin a crate to see it here')
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(mockApi.getCrateSuggestions).toHaveBeenCalled()
      );
      expect(
        screen.queryByRole('region', { name: 'Suggested crate' })
      ).not.toBeInTheDocument();
    });
  });

  it('shows a load error with retry', async () => {
    mockApi.getCrates.mockRejectedValueOnce(new Error('Network down'));
    renderContainer();
    expect(await screen.findByText('Network down')).toBeInTheDocument();
  });

  it('asks to connect Discogs when not connected', () => {
    renderContainer({
      discogs: { authenticated: false },
      lastfm: { authenticated: true, username: 'tester' },
    } as AuthStatus);
    expect(
      screen.getByText('Connect Discogs to use crates')
    ).toBeInTheDocument();
    expect(mockApi.getCrates).not.toHaveBeenCalled();
  });
});

describe('pickIndex', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses Math.random over the whole range', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(pickIndex(4)).toBe(2);
  });

  it('never repeats the avoided index when there is a choice', () => {
    const random = jest.spyOn(Math, 'random');
    for (const value of [0, 0.34, 0.67, 0.99]) {
      random.mockReturnValue(value);
      expect(pickIndex(4, 1)).not.toBe(1);
    }
    random.mockReturnValue(0.99);
    expect(pickIndex(1, 0)).toBe(0);
  });
});
