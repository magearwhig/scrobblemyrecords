import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import '@testing-library/jest-dom';

import { AppProvider } from '../../../src/renderer/context/AppContext';
import { AuthProvider } from '../../../src/renderer/context/AuthContext';
import CratesPage from '../../../src/renderer/pages/CratesPage';
import { CRATE_TEMPLATES } from '../../../src/shared/crateTemplates';
import { AuthStatus } from '../../../src/shared/types';
import {
  makeAlbum,
  makeCrate,
  makeEvaluation,
  makeSummary,
} from '../components/crates/crateFixtures';

const mockApi = {
  getCrates: jest.fn(),
  getCrateTemplates: jest.fn(),
  getCrate: jest.fn(),
  createCrate: jest.fn(),
  updateCrate: jest.fn(),
  deleteCrate: jest.fn(),
  previewCrate: jest.fn(),
  setCrateOverride: jest.fn(),
  clearCrateOverrides: jest.fn(),
  removeStaleCrateOverrides: jest.fn(),
};

jest.mock('../../../src/renderer/services/api', () => ({
  getApiService: () => mockApi,
}));

const mockAddNotification = jest.fn();
jest.mock('../../../src/renderer/hooks/useNotifications', () => ({
  useNotifications: () => ({
    addNotification: mockAddNotification,
    notifications: [],
    unreadCount: 0,
  }),
  createSuccessNotification: jest.fn((title: string, message: string) => ({
    type: 'success',
    title,
    message,
  })),
  createAlertNotification: jest.fn((title: string, message: string) => ({
    type: 'alert',
    title,
    message,
  })),
}));

jest.mock('../../../src/renderer/utils/logger', () => ({
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

function renderPage(authStatus: AuthStatus = connected) {
  return render(
    <AppProvider>
      <AuthProvider value={{ authStatus, setAuthStatus: jest.fn() }}>
        <CratesPage />
      </AuthProvider>
    </AppProvider>
  );
}

function httpError(status: number, error = 'Request failed') {
  return Object.assign(new Error(error), {
    response: { status, data: { success: false, error } },
  });
}

describe('CratesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.location.hash = '#crates';
    mockApi.getCrates.mockResolvedValue([
      makeSummary(),
      makeSummary({
        id: 'crate-2',
        name: 'Dusty shelf',
        description: undefined,
        count: 120,
        unknownCount: 7,
        staleOverrideCount: 2,
        pinnedToWhatToPlay: true,
      }),
    ]);
    mockApi.getCrateTemplates.mockResolvedValue(CRATE_TEMPLATES);
    mockApi.getCrate.mockResolvedValue({
      crate: makeCrate(),
      evaluation: makeEvaluation({ crateId: 'crate-1' }),
    });
    mockApi.updateCrate.mockResolvedValue(makeCrate());
    mockApi.deleteCrate.mockResolvedValue(undefined);
    mockApi.previewCrate.mockResolvedValue(makeEvaluation());
    mockApi.setCrateOverride.mockResolvedValue(makeCrate());
    mockApi.clearCrateOverrides.mockResolvedValue(makeCrate());
    mockApi.removeStaleCrateOverrides.mockResolvedValue(makeCrate());
  });

  afterEach(() => {
    window.location.hash = '';
  });

  describe('list', () => {
    it('shows crate cards with counts and badges', async () => {
      renderPage();
      expect(await screen.findByText('Jazz in 40 minutes')).toBeInTheDocument();
      expect(screen.getByText('9 albums')).toBeInTheDocument();
      expect(screen.getByText('Short jazz records')).toBeInTheDocument();

      const dusty = screen
        .getByRole('heading', { name: 'Dusty shelf' })
        .closest('article') as HTMLElement;
      expect(within(dusty).getByText('120 albums')).toBeInTheDocument();
      expect(within(dusty).getByText('7 might match')).toBeInTheDocument();
      expect(
        within(dusty).getByText(/2 no longer\s+owned/)
      ).toBeInTheDocument();
      expect(
        within(dusty).getByRole('button', {
          name: 'Unpin Dusty shelf from What to Play',
        })
      ).toHaveAttribute('aria-pressed', 'true');
    });

    it('pins a crate to What to Play', async () => {
      const user = userEvent.setup();
      renderPage();
      const pin = await screen.findByRole('button', {
        name: 'Pin Jazz in 40 minutes to What to Play',
      });
      await user.click(pin);
      expect(mockApi.updateCrate).toHaveBeenCalledWith('crate-1', {
        pinnedToWhatToPlay: true,
      });
      expect(
        screen.getByRole('button', {
          name: 'Unpin Jazz in 40 minutes from What to Play',
        })
      ).toBeInTheDocument();
    });

    it('reverts the pin when saving fails', async () => {
      const user = userEvent.setup();
      mockApi.updateCrate.mockRejectedValue(new Error('nope'));
      renderPage();
      await user.click(
        await screen.findByRole('button', {
          name: 'Pin Jazz in 40 minutes to What to Play',
        })
      );
      await waitFor(() =>
        expect(mockAddNotification).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'alert' })
        )
      );
      expect(
        screen.getByRole('button', {
          name: 'Pin Jazz in 40 minutes to What to Play',
        })
      ).toBeInTheDocument();
    });

    it('opens a crate in the detail view', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(
        await screen.findByRole('button', {
          name: 'Open crate Jazz in 40 minutes',
        })
      );
      await waitFor(() =>
        expect(window.location.hash).toBe('#crates?id=crate-1')
      );
      expect(
        await screen.findByRole('heading', {
          level: 1,
          name: 'Jazz in 40 minutes',
        })
      ).toBeInTheDocument();
      expect(mockApi.getCrate).toHaveBeenCalledWith('crate-1');
      expect(screen.getByText('Kind of Blue')).toBeInTheDocument();
    });

    it('shows an empty state with templates when there are no crates', async () => {
      const user = userEvent.setup();
      mockApi.getCrates.mockResolvedValue([]);
      renderPage();
      expect(await screen.findByText('No crates yet')).toBeInTheDocument();
      for (const template of CRATE_TEMPLATES) {
        expect(screen.getByText(template.name)).toBeInTheDocument();
      }
      await user.click(
        screen.getByRole('button', { name: 'Use template Dusty shelf' })
      );
      await waitFor(() =>
        expect(window.location.hash).toBe('#crates?new=1&template=dusty-shelf')
      );
    });

    it('asks to connect Discogs when not connected', () => {
      renderPage({
        discogs: { authenticated: false },
        lastfm: { authenticated: true, username: 'tester' },
      });
      expect(
        screen.getByText('Connect Discogs to use crates')
      ).toBeInTheDocument();
      expect(mockApi.getCrates).not.toHaveBeenCalled();
    });

    it('treats a 401 from the API as not connected', async () => {
      mockApi.getCrates.mockRejectedValue(httpError(401, 'No Discogs user'));
      renderPage();
      expect(
        await screen.findByText('Connect Discogs to use crates')
      ).toBeInTheDocument();
    });
  });

  describe('detail', () => {
    beforeEach(() => {
      window.location.hash = '#crates?id=crate-1';
    });

    it('shows rules, coverage and might-match counts', async () => {
      mockApi.getCrate.mockResolvedValue({
        crate: makeCrate(),
        evaluation: makeEvaluation({
          unknownOnly: [{ ruleId: 'runtime', count: 31, sample: [] }],
        }),
      });
      renderPage();
      expect(await screen.findByText('Format is Vinyl')).toBeInTheDocument();
      expect(screen.getByText('Genre is Jazz')).toBeInTheDocument();
      expect(
        screen.getByText(/Listening data: Last\.fm scrobbles since/)
      ).toBeInTheDocument();
      expect(
        screen.getByText('31 more albums might match: runtime unknown')
      ).toBeInTheDocument();
    });

    it('shows the unique might-match total when several rules have gaps', async () => {
      mockApi.getCrate.mockResolvedValue({
        crate: makeCrate(),
        evaluation: makeEvaluation({
          unknownOnly: [
            { ruleId: 'genre', count: 20, sample: [] },
            { ruleId: 'runtime', count: 31, sample: [] },
          ],
          unknownOnlyAlbums: 40,
        }),
      });
      renderPage();
      expect(
        await screen.findByText(
          '40 more albums might match if their missing data were known'
        )
      ).toBeInTheDocument();
    });

    it('hides runtime/genre coverage when release details were not loaded', async () => {
      mockApi.getCrate.mockResolvedValue({
        crate: makeCrate(),
        evaluation: makeEvaluation({
          coverage: {
            ...makeEvaluation().coverage,
            runtimeKnownAlbums: null,
            genreKnownAlbums: null,
          },
        }),
      });
      renderPage();
      expect(await screen.findByText('Format is Vinyl')).toBeInTheDocument();
      expect(screen.queryByText(/^Runtime: /)).not.toBeInTheDocument();
      expect(screen.queryByText(/^Genre and style: /)).not.toBeInTheDocument();
    });

    it('excludes an album with all of its copies', async () => {
      const user = userEvent.setup();
      const album = makeAlbum({
        copies: [
          makeAlbum().copies[0],
          { ...makeAlbum().copies[0], releaseId: 202 },
        ],
      });
      mockApi.getCrate.mockResolvedValue({
        crate: makeCrate(),
        evaluation: makeEvaluation({ albums: [album] }),
      });
      renderPage();
      await user.click(
        await screen.findByRole('button', {
          name: 'Exclude Kind of Blue from this crate',
        })
      );
      expect(mockApi.setCrateOverride).toHaveBeenCalledWith(
        'crate-1',
        [101, 202],
        'exclude'
      );
      await waitFor(() => expect(mockApi.getCrate).toHaveBeenCalledTimes(2));
    });

    it('restores an excluded album', async () => {
      const user = userEvent.setup();
      mockApi.getCrate.mockResolvedValue({
        crate: makeCrate(),
        evaluation: makeEvaluation({
          albums: [],
          excluded: [makeAlbum({ membership: 'excluded' })],
        }),
      });
      renderPage();
      const toggle = await screen.findByRole('button', {
        name: /excluded by you/i,
      });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await user.click(toggle);
      await user.click(screen.getByRole('button', { name: /restore/i }));
      expect(mockApi.clearCrateOverrides).toHaveBeenCalledWith('crate-1', [
        101,
      ]);
    });

    it('removes stale overrides only when the collection is complete', async () => {
      const user = userEvent.setup();
      const stale = {
        id: 'o1',
        action: 'exclude' as const,
        releaseIds: [999],
        snapshot: { artist: 'Gone Band', title: 'Sold Record' },
        createdAt: 1,
      };
      mockApi.getCrate.mockResolvedValue({
        crate: makeCrate(),
        evaluation: makeEvaluation({ staleOverrides: [stale] }),
      });
      renderPage();
      expect(await screen.findByText('Sold Record')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /remove all/i }));

      // Confirm first, listing what will be removed
      const dialog = await screen.findByRole('dialog');
      const list = within(dialog).getByRole('list', {
        name: 'Records to remove',
      });
      expect(within(list).getByText('Sold Record')).toBeInTheDocument();
      expect(within(list).getByText('Gone Band')).toBeInTheDocument();
      expect(mockApi.removeStaleCrateOverrides).not.toHaveBeenCalled();

      await user.click(
        within(dialog).getByRole('button', { name: 'Remove 1' })
      );
      await waitFor(() =>
        expect(mockApi.removeStaleCrateOverrides).toHaveBeenCalledWith(
          'crate-1'
        )
      );
    });

    it('keeps stale overrides when the removal is cancelled', async () => {
      const user = userEvent.setup();
      mockApi.getCrate.mockResolvedValue({
        crate: makeCrate(),
        evaluation: makeEvaluation({
          staleOverrides: [
            {
              id: 'o1',
              action: 'exclude',
              releaseIds: [999],
              snapshot: { artist: 'Gone Band', title: 'Sold Record' },
              createdAt: 1,
            },
          ],
        }),
      });
      renderPage();
      await user.click(
        await screen.findByRole('button', { name: /remove all/i })
      );
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      );
      expect(mockApi.removeStaleCrateOverrides).not.toHaveBeenCalled();
    });

    it('disables removing stale overrides while the collection loads', async () => {
      mockApi.getCrate.mockResolvedValue({
        crate: makeCrate(),
        evaluation: makeEvaluation({
          staleOverrides: [
            {
              id: 'o1',
              action: 'include',
              releaseIds: [999],
              snapshot: { artist: 'Gone Band', title: 'Sold Record' },
              createdAt: 1,
            },
          ],
          coverage: {
            ...makeEvaluation().coverage,
            collection: { complete: false, pagesRead: 3, pagesExpected: 12 },
          },
        }),
      });
      renderPage();
      expect(
        await screen.findByRole('button', { name: /remove all/i })
      ).toBeDisabled();
      expect(
        screen.getByText(/Collection is still loading \(3 of 12 pages\)/)
      ).toBeInTheDocument();
    });

    it('opens the witness release', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(
        await screen.findByRole('button', { name: 'Open release Kind of Blue' })
      );
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'selectedRelease',
        JSON.stringify({
          id: 101,
          title: 'Kind of Blue',
          artist: 'Miles Davis',
        })
      );
      await waitFor(() =>
        expect(window.location.hash).toBe('#release-details?from=crates')
      );
    });

    it('deletes a crate after confirming in a modal', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(
        await screen.findByRole('button', { name: /^delete$/i })
      );
      const dialog = await screen.findByRole('dialog');
      expect(
        within(dialog).getByText(/Delete "Jazz in 40 minutes"\?/)
      ).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

      await waitFor(() =>
        expect(mockApi.deleteCrate).toHaveBeenCalledWith('crate-1')
      );
      await waitFor(() => expect(window.location.hash).toBe('#crates'));
    });

    it('keeps the crate when the delete is cancelled', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(
        await screen.findByRole('button', { name: /^delete$/i })
      );
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      );
      expect(mockApi.deleteCrate).not.toHaveBeenCalled();
    });

    it('shows not found for a missing crate', async () => {
      mockApi.getCrate.mockRejectedValue(httpError(404, 'Crate not found'));
      renderPage();
      expect(await screen.findByText('Crate not found')).toBeInTheDocument();
    });
  });

  describe('editor', () => {
    it('creates a crate from a template', async () => {
      const user = userEvent.setup();
      window.location.hash = '#crates?new=1&template=dusty-shelf';
      mockApi.createCrate.mockResolvedValue(
        makeCrate({ id: 'new-id', name: 'Dusty shelf' })
      );
      renderPage();

      const name = (await screen.findByLabelText('Name')) as HTMLInputElement;
      await waitFor(() => expect(name.value).toBe('Dusty shelf'));
      await user.click(screen.getByRole('button', { name: 'Create crate' }));

      expect(mockApi.createCrate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Dusty shelf',
          templateId: 'dusty-shelf',
          sort: 'lastPlayedAsc',
          rules: CRATE_TEMPLATES.find(t => t.id === 'dusty-shelf')!.rules,
        })
      );
      await waitFor(() =>
        expect(window.location.hash).toBe('#crates?id=new-id')
      );
    });

    it('shows API validation errors next to the rule', async () => {
      const user = userEvent.setup();
      window.location.hash = '#crates?id=crate-1&edit=1';
      mockApi.updateCrate.mockRejectedValue(
        Object.assign(new Error('Invalid'), {
          response: {
            status: 400,
            data: {
              success: false,
              error: 'Invalid rules',
              details: [
                'rules[1]: unknown operator for genre',
                'something else',
              ],
            },
          },
        })
      );
      renderPage();
      await user.click(
        await screen.findByRole('button', { name: 'Save changes' })
      );
      const rule2 = screen.getByRole('listitem', { name: 'Rule 2' });
      expect(
        await within(rule2).findByText('unknown operator for genre')
      ).toBeInTheDocument();
      expect(screen.getByText('something else')).toBeInTheDocument();
    });

    it('reloads the crate after saving an edit', async () => {
      const user = userEvent.setup();
      window.location.hash = '#crates?id=crate-1&edit=1';
      mockApi.updateCrate.mockResolvedValue(makeCrate({ name: 'Short jazz' }));
      renderPage();

      const name = (await screen.findByLabelText('Name')) as HTMLInputElement;
      await user.clear(name);
      await user.type(name, 'Short jazz');
      mockApi.getCrate.mockResolvedValue({
        crate: makeCrate({ name: 'Short jazz' }),
        evaluation: makeEvaluation({ crateId: 'crate-1' }),
      });
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      expect(mockApi.updateCrate).toHaveBeenCalledWith(
        'crate-1',
        expect.objectContaining({ name: 'Short jazz' })
      );
      expect(
        await screen.findByRole('heading', { level: 1, name: 'Short jazz' })
      ).toBeInTheDocument();
      expect(window.location.hash).toBe('#crates?id=crate-1');
    });

    it('does not save when adding or removing a rule', async () => {
      const user = userEvent.setup();
      window.location.hash = '#crates?id=crate-1&edit=1';
      renderPage();
      await user.click(
        await screen.findByRole('button', { name: 'Remove rule 1' })
      );
      await user.click(screen.getByRole('button', { name: /add rule/i }));
      expect(mockApi.updateCrate).not.toHaveBeenCalled();
      expect(window.location.hash).toBe('#crates?id=crate-1&edit=1');
    });

    it('requires a name', async () => {
      const user = userEvent.setup();
      window.location.hash = '#crates?new=1';
      renderPage();
      await user.click(
        await screen.findByRole('button', { name: 'Create crate' })
      );
      expect(
        screen.getByText('Enter a name for the crate.')
      ).toBeInTheDocument();
      expect(mockApi.createCrate).not.toHaveBeenCalled();
    });
  });
});
