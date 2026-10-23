import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MockAdapter from 'axios-mock-adapter';
import React from 'react';
import '@testing-library/jest-dom';

import PocketListExportDialog, {
  POCKET_LIST_OPTIONS_KEY,
} from '../../../src/renderer/components/PocketListExportDialog';
import ApiService, { getApiService } from '../../../src/renderer/services/api';
import { downloadBlob } from '../../../src/renderer/utils/downloadBlob';
import {
  ExportSnapshotMeta,
  PocketListKind,
  PocketListOptions,
} from '../../../src/shared/types';

// A real ApiService on a mocked axios adapter, so error bodies go through the
// same blob-parsing path the browser uses.
const mockApiHolder: { api?: ApiService } = {};
jest.mock('../../../src/renderer/services/api', () => {
  const actual = jest.requireActual('../../../src/renderer/services/api');
  return {
    ...actual,
    getApiService: () => {
      mockApiHolder.api ??= new actual.default('http://localhost:3001');
      return mockApiHolder.api;
    },
  };
});

jest.mock('../../../src/renderer/context/AppContext', () => ({
  useApp: () => ({ state: { serverUrl: 'http://localhost:3001' } }),
}));

jest.mock('../../../src/renderer/utils/downloadBlob', () => ({
  ...jest.requireActual('../../../src/renderer/utils/downloadBlob'),
  downloadBlob: jest.fn(),
}));

const api = (): ApiService => getApiService();

const completeMeta: ExportSnapshotMeta = {
  schemaVersion: 1 as ExportSnapshotMeta['schemaVersion'],
  generatedAt: '2026-10-20T10:00:00.000Z',
  collectionCachedAt: '2026-10-18T10:00:00.000Z',
  collectionCache: {
    status: 'complete',
    pagesExpected: 10,
    pagesRead: 10,
    itemsExpected: 1000,
    itemsRead: 1000,
    oldestPageAt: '2026-10-18T10:00:00.000Z',
    newestPageAt: '2026-10-19T10:00:00.000Z',
  },
  wishlistUpdatedAt: '2026-10-19T10:00:00.000Z',
  historySyncedAt: null,
  discogsUsername: 'someone',
};

const jsonBlob = (body: unknown) =>
  new Blob([JSON.stringify(body)], { type: 'application/json' });

const pdfBlob = () => new Blob(['%PDF-1.7'], { type: 'application/pdf' });

let mock: MockAdapter;
let storage: Record<string, string>;

function renderDialog(initialList: PocketListKind = 'wishlist') {
  const onClose = jest.fn();
  render(
    <PocketListExportDialog
      isOpen
      onClose={onClose}
      initialList={initialList}
    />
  );
  return { onClose };
}

function lastExportParams(): Record<string, string> {
  const gets = mock.history.get.filter(r => r.url === '/export/pocket-list');
  return gets[gets.length - 1].params;
}

describe('PocketListExportDialog', () => {
  beforeEach(() => {
    mock = new MockAdapter((api() as any).api);
    mock
      .onGet('/export/meta')
      .reply(200, { success: true, data: completeMeta });
    mock.onGet('/export/pocket-list').reply(200, pdfBlob(), {
      'content-disposition':
        'attachment; filename="listenography-pocket-list-wishlist-2026-10-20.pdf"',
    });

    storage = {};
    (window.localStorage.getItem as jest.Mock).mockImplementation(
      (key: string) => storage[key] ?? null
    );
    (window.localStorage.setItem as jest.Mock).mockImplementation(
      (key: string, value: string) => {
        storage[key] = value;
      }
    );
    (downloadBlob as jest.Mock).mockClear();
  });

  afterEach(() => {
    mock.restore();
    jest.restoreAllMocks();
  });

  describe('option payload', () => {
    it('sends wishlist-only options with both sources by default', async () => {
      const spy = jest.spyOn(api(), 'exportPocketList');
      renderDialog('wishlist');

      expect(screen.getByLabelText('Wishlist')).toBeChecked();
      await userEvent.click(
        screen.getByRole('button', { name: /Download PDF/ })
      );

      await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
      expect(spy.mock.calls[0][0]).toEqual({
        lists: ['wishlist'],
        wishlistSources: ['discogs-want', 'local-want'],
        details: { format: true, pressing: true, notes: false },
        flagOwnedVersions: true,
      } satisfies PocketListOptions);
      expect(lastExportParams()).toEqual({
        lists: 'wishlist',
        sources: 'discogs-want,local-want',
        details: 'format,pressing',
        flagOwned: 'true',
      });
    });

    it('sends collection-only options without wishlist sources', async () => {
      const spy = jest.spyOn(api(), 'exportPocketList');
      renderDialog('collection');

      expect(screen.getByLabelText('Collection')).toBeChecked();
      await userEvent.click(
        screen.getByRole('button', { name: /Download PDF/ })
      );

      await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
      expect(spy.mock.calls[0][0]).toMatchObject({
        lists: ['collection'],
        wishlistSources: [],
      });
      expect(lastExportParams()).not.toHaveProperty('sources');
      expect(lastExportParams().lists).toBe('collection');
    });

    it('sends both lists with the chosen source and details', async () => {
      const spy = jest.spyOn(api(), 'exportPocketList');
      renderDialog('wishlist');

      await userEvent.click(screen.getByLabelText('Both'));
      await userEvent.click(screen.getByLabelText('Monitored (local) wants'));
      await userEvent.click(screen.getByLabelText('Notes'));
      await userEvent.click(screen.getByLabelText('Format'));
      await userEvent.click(
        screen.getByLabelText('Flag wanted albums I already own a version of')
      );
      await userEvent.click(
        screen.getByRole('button', { name: /Download PDF/ })
      );

      await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
      expect(spy.mock.calls[0][0]).toEqual({
        lists: ['wishlist', 'collection'],
        wishlistSources: ['discogs-want'],
        details: { format: false, pressing: true, notes: true },
        flagOwnedVersions: false,
      });
      expect(lastExportParams()).toEqual({
        lists: 'wishlist,collection',
        sources: 'discogs-want',
        details: 'pressing,notes',
        flagOwned: 'false',
      });
    });

    it('disables Download when the wishlist has no source selected', async () => {
      renderDialog('wishlist');

      await userEvent.click(screen.getByLabelText('Discogs wantlist'));
      await userEvent.click(screen.getByLabelText('Monitored (local) wants'));

      expect(
        screen.getByRole('button', { name: /Download PDF/ })
      ).toBeDisabled();
      expect(
        screen.getByText('Choose at least one wishlist source.')
      ).toBeInTheDocument();
    });
  });

  it('hides wishlist-source and owned-flag controls for collection-only', () => {
    renderDialog('collection');

    expect(screen.queryByText('Wishlist sources')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Discogs wantlist')).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Flag wanted albums I already own a version of')
    ).not.toBeInTheDocument();
  });

  it('saves the file with the server filename and shows the success note', async () => {
    renderDialog('wishlist');

    await userEvent.click(screen.getByRole('button', { name: /Download PDF/ }));

    expect(
      await screen.findByText(
        'Move it to your phone with AirDrop, email, or a cloud drive.'
      )
    ).toBeInTheDocument();
    expect(downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      'listenography-pocket-list-wishlist-2026-10-20.pdf'
    );
  });

  describe('errors from blob JSON', () => {
    it.each([
      [409, 'Sync your collection first'],
      [503, 'PDF renderer unavailable. Please try again.'],
      [504, 'PDF took too long'],
    ])(
      'shows the %i server message with Try again',
      async (status, message) => {
        // Handlers match in registration order; replace the default success
        mock.resetHandlers();
        mock
          .onGet('/export/meta')
          .reply(200, { success: true, data: completeMeta })
          .onGet('/export/pocket-list')
          .replyOnce(status, jsonBlob({ success: false, error: message }))
          .onGet('/export/pocket-list')
          .replyOnce(200, pdfBlob());
        renderDialog('collection');

        await userEvent.click(
          screen.getByRole('button', { name: /Download PDF/ })
        );

        const alert = await screen.findByRole('alert');
        expect(within(alert).getByText(message)).toBeInTheDocument();
        expect(downloadBlob).not.toHaveBeenCalled();

        await userEvent.click(
          within(alert).getByRole('button', { name: /Try again/ })
        );
        // Focus stays inside the dialog after the alert unmounts
        expect(screen.getByRole('dialog')).toContainElement(
          document.activeElement as HTMLElement
        );

        await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1));
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      }
    );
  });

  it('cancels a download in progress when the dialog closes', async () => {
    mock.resetHandlers();
    mock
      .onGet('/export/meta')
      .reply(200, { success: true, data: completeMeta });
    let release: () => void = () => {};
    mock.onGet('/export/pocket-list').reply(
      () =>
        new Promise(resolve => {
          release = () => resolve([200, pdfBlob()]);
        })
    );
    const spy = jest.spyOn(api(), 'exportPocketList');
    const onClose = jest.fn();
    const { rerender } = render(
      <PocketListExportDialog isOpen onClose={onClose} initialList='wishlist' />
    );

    await userEvent.click(screen.getByRole('button', { name: /Download PDF/ }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    const signal = spy.mock.calls[0][1] as AbortSignal;
    expect(signal.aborted).toBe(false);

    rerender(
      <PocketListExportDialog
        isOpen={false}
        onClose={onClose}
        initialList='wishlist'
      />
    );
    expect(signal.aborted).toBe(true);
    release();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  describe('data freshness', () => {
    it('shows "N of M collection pages cached" for a partial cache', async () => {
      mock.onGet('/export/meta').reply(200, {
        success: true,
        data: {
          ...completeMeta,
          collectionCache: {
            ...completeMeta.collectionCache,
            status: 'partial',
            pagesRead: 3,
            pagesExpected: 12,
          },
        },
      });
      renderDialog('collection');

      expect(
        await screen.findByText('3 of 12 collection pages cached')
      ).toBeInTheDocument();
      expect(
        screen.getByText('Sync first for an up-to-date list.')
      ).toBeInTheDocument();
    });

    it('shows the wishlist sync date and a missing-cache warning', async () => {
      mock.onGet('/export/meta').reply(200, {
        success: true,
        data: {
          ...completeMeta,
          collectionCachedAt: null,
          collectionCache: {
            ...completeMeta.collectionCache,
            status: 'missing',
            pagesRead: 0,
          },
        },
      });
      renderDialog('wishlist');

      expect(await screen.findByText(/^Wishlist synced /)).toBeInTheDocument();
      expect(
        screen.getByText(/owned versions can’t be flagged/)
      ).toBeInTheDocument();
    });
  });

  describe('remembered options', () => {
    it('restores the last-used options', () => {
      storage[POCKET_LIST_OPTIONS_KEY] = JSON.stringify({
        wishlistSources: ['local-want'],
        details: { format: false, pressing: false, notes: true },
        flagOwnedVersions: false,
      });
      renderDialog('wishlist');

      expect(screen.getByLabelText('Discogs wantlist')).not.toBeChecked();
      expect(screen.getByLabelText('Monitored (local) wants')).toBeChecked();
      expect(screen.getByLabelText('Format')).not.toBeChecked();
      expect(screen.getByLabelText('Notes')).toBeChecked();
      expect(
        screen.getByLabelText('Flag wanted albums I already own a version of')
      ).not.toBeChecked();
    });

    it('saves the options used for a download', async () => {
      renderDialog('wishlist');

      await userEvent.click(screen.getByLabelText('Notes'));
      await userEvent.click(
        screen.getByRole('button', { name: /Download PDF/ })
      );

      await waitFor(() =>
        expect(storage[POCKET_LIST_OPTIONS_KEY]).toBeDefined()
      );
      expect(JSON.parse(storage[POCKET_LIST_OPTIONS_KEY])).toEqual({
        wishlistSources: ['discogs-want', 'local-want'],
        details: { format: true, pressing: true, notes: true },
        flagOwnedVersions: true,
      });
    });

    it('falls back to defaults when storage throws', () => {
      (window.localStorage.getItem as jest.Mock).mockImplementation(() => {
        throw new Error('denied');
      });
      renderDialog('wishlist');

      expect(screen.getByLabelText('Discogs wantlist')).toBeChecked();
      expect(screen.getByLabelText('Format')).toBeChecked();
      expect(screen.getByLabelText('Notes')).not.toBeChecked();
    });
  });
});
