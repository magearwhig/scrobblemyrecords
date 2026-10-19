import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import '@testing-library/jest-dom';

import AddToCrateMenu from '../../../../src/renderer/components/crates/AddToCrateMenu';
import { AppProvider } from '../../../../src/renderer/context/AppContext';

import {
  makeAlbum,
  makeCrate,
  makeEvaluation,
  makeSummary,
} from './crateFixtures';

const mockApi = {
  getCrates: jest.fn(),
  getCratesForRelease: jest.fn(),
  getCrate: jest.fn(),
  setCrateOverride: jest.fn(),
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

function renderMenu(releaseIds: number[] = [101]) {
  return render(
    <AppProvider>
      <AddToCrateMenu releaseIds={releaseIds} albumTitle='Kind of Blue' />
      <button type='button'>Outside</button>
    </AppProvider>
  );
}

const trigger = () =>
  screen.getByRole('button', { name: 'Add Kind of Blue to a crate' });

describe('AddToCrateMenu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.getCrates.mockResolvedValue([
      makeSummary({ id: 'jazz', name: 'Jazz in 40 minutes' }),
      makeSummary({ id: 'quiet', name: 'Quiet lately' }),
    ]);
    mockApi.getCratesForRelease.mockResolvedValue([
      { id: 'jazz', name: 'Jazz in 40 minutes' },
    ]);
    mockApi.setCrateOverride.mockResolvedValue({});
    // The album is not in the crate's view: include just the given releases
    mockApi.getCrate.mockResolvedValue({
      crate: makeCrate(),
      evaluation: makeEvaluation({ albums: [], excluded: [] }),
    });
  });

  it('shows In crates chips linking to each crate', async () => {
    renderMenu();
    const chips = await screen.findByRole('list', { name: 'In crates' });
    expect(
      within(chips).getByRole('link', { name: 'Jazz in 40 minutes' })
    ).toHaveAttribute('href', '#crates?id=jazz');
    expect(mockApi.getCratesForRelease).toHaveBeenCalledWith(101);
  });

  it('renders nothing without a release id', () => {
    const { container } = render(
      <AppProvider>
        <AddToCrateMenu releaseIds={[]} albumTitle='Kind of Blue' />
      </AppProvider>
    );
    expect(container).toBeEmptyDOMElement();
    expect(mockApi.getCratesForRelease).not.toHaveBeenCalled();
  });

  it('opens a menu of crates with current ones marked', async () => {
    const user = userEvent.setup();
    renderMenu();
    await screen.findByRole('list', { name: 'In crates' });

    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger());
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');

    const menu = await screen.findByRole('menu', { name: 'Crates' });
    const jazz = await within(menu).findByRole('menuitem', {
      name: /Jazz in 40 minutes/,
    });
    expect(jazz).toHaveAttribute('aria-disabled', 'true');
    expect(jazz).toHaveTextContent('In crate');
    const quiet = within(menu).getByRole('menuitem', { name: /Quiet lately/ });
    expect(quiet).toBeEnabled();
    // First enabled item gets focus
    await waitFor(() => expect(quiet).toHaveFocus());
  });

  it('includes the release in the chosen crate and refreshes the chips', async () => {
    const user = userEvent.setup();
    renderMenu([101, 102]);
    await screen.findByRole('list', { name: 'In crates' });
    await user.click(trigger());
    const quiet = await screen.findByRole('menuitem', { name: /Quiet lately/ });

    mockApi.getCratesForRelease.mockResolvedValue([
      { id: 'jazz', name: 'Jazz in 40 minutes' },
      { id: 'quiet', name: 'Quiet lately' },
    ]);
    await user.click(quiet);

    expect(mockApi.setCrateOverride).toHaveBeenCalledWith(
      'quiet',
      [101, 102],
      'include'
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Added to Quiet lately'
    );
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(
      await screen.findByRole('link', { name: 'Quiet lately' })
    ).toHaveAttribute('href', '#crates?id=quiet');
    expect(trigger()).toHaveFocus();
  });

  it('does nothing when a crate the album is already in is chosen', async () => {
    const user = userEvent.setup();
    renderMenu();
    await screen.findByRole('list', { name: 'In crates' });
    await user.click(trigger());
    await user.click(
      await screen.findByRole('menuitem', { name: /Jazz in 40 minutes/ })
    );
    expect(mockApi.setCrateOverride).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('includes every copy so an earlier exclude of another copy is replaced', async () => {
    mockApi.getCrate.mockResolvedValue({
      crate: makeCrate({ id: 'quiet' }),
      evaluation: makeEvaluation({
        albums: [],
        excluded: [
          makeAlbum({
            membership: 'excluded',
            copies: [
              { ...makeAlbum().copies[0], releaseId: 101 },
              { ...makeAlbum().copies[0], releaseId: 102 },
            ],
          }),
        ],
      }),
    });
    const user = userEvent.setup();
    renderMenu([101]);
    await user.click(trigger());
    await user.click(
      await screen.findByRole('menuitem', { name: /Quiet lately/ })
    );
    expect(mockApi.getCrate).toHaveBeenCalledWith('quiet');
    expect(mockApi.setCrateOverride).toHaveBeenCalledWith(
      'quiet',
      [101, 102],
      'include'
    );
  });

  it('ignores an older membership response that arrives after a refresh', async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    mockApi.getCratesForRelease
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValue([{ id: 'quiet', name: 'Quiet lately' }]);
    const user = userEvent.setup();
    renderMenu();
    await user.click(trigger());
    await user.click(
      await screen.findByRole('menuitem', { name: /Quiet lately/ })
    );
    expect(
      await screen.findByRole('link', { name: 'Quiet lately' })
    ).toBeInTheDocument();

    resolveFirst([]);
    await waitFor(() =>
      expect(mockApi.getCratesForRelease).toHaveBeenCalledTimes(2)
    );
    expect(
      screen.getByRole('link', { name: 'Quiet lately' })
    ).toBeInTheDocument();
  });

  it('shows an error when including fails and keeps the menu open', async () => {
    mockApi.setCrateOverride.mockRejectedValue(new Error('Crate not found'));
    const user = userEvent.setup();
    renderMenu();
    await user.click(trigger());
    await user.click(
      await screen.findByRole('menuitem', { name: /Quiet lately/ })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Crate not found'
    );
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('is keyboard operable: arrows move, Escape closes and restores focus', async () => {
    mockApi.getCratesForRelease.mockResolvedValue([]);
    const user = userEvent.setup();
    renderMenu();

    trigger().focus();
    await user.keyboard('{Enter}');
    const jazz = await screen.findByRole('menuitem', {
      name: /Jazz in 40 minutes/,
    });
    await waitFor(() => expect(jazz).toHaveFocus());

    await user.keyboard('{ArrowDown}');
    expect(
      screen.getByRole('menuitem', { name: /Quiet lately/ })
    ).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: /New crate/ })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(jazz).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: /New crate/ })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on an outside click', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(trigger());
    await screen.findByRole('menu');
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('offers New crate when there are no crates', async () => {
    mockApi.getCrates.mockResolvedValue([]);
    mockApi.getCratesForRelease.mockResolvedValue([]);
    const user = userEvent.setup();
    renderMenu();
    await user.click(trigger());
    expect(await screen.findByText('No crates yet.')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /New crate/ })).toHaveAttribute(
      'href',
      '#crates?new=1'
    );
  });
});
