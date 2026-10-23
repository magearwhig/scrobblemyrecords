import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import '@testing-library/jest-dom';

import RecordStoreFilingStatus from '../../../src/renderer/components/RecordStoreFilingStatus';
import { RecordStoreFilingStatus as FilingStatus } from '../../../src/shared/types';

const mockApi = {
  getFilingStatus: jest.fn(),
  startFilingRefresh: jest.fn(),
  cancelFilingRefresh: jest.fn(),
};

jest.mock('../../../src/renderer/services/api', () => ({
  getApiService: () => mockApi,
}));
jest.mock('../../../src/renderer/context/AppContext', () => ({
  useApp: () => ({ state: { serverUrl: 'http://localhost:3001' } }),
}));

function status(o: {
  missing?: number;
  mastersMissing?: number;
  running?: boolean;
  error?: string | null;
  failures?: number;
}): FilingStatus {
  const missing = o.missing ?? 0;
  const mastersMissing = o.mastersMissing ?? 0;
  return {
    artists: {
      total: 590,
      musicbrainz: 400 - missing,
      override: 3,
      unmatched: 187,
      missing,
    },
    masters: {
      total: 1318,
      cached: 1318 - mastersMissing,
      missing: mastersMissing,
    },
    job: {
      running: o.running ?? false,
      startedAt: null,
      finishedAt: null,
      artistsDone: 120,
      artistsTotal: 590,
      mastersDone: 300,
      mastersTotal: 1318,
      failures: o.failures ?? 0,
      cancelled: false,
      error: o.error ?? null,
    },
  };
}

describe('RecordStoreFilingStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.startFilingRefresh.mockResolvedValue({});
    mockApi.cancelFilingRefresh.mockResolvedValue(undefined);
  });

  it('says when the filing data is up to date', async () => {
    mockApi.getFilingStatus.mockResolvedValue(status({}));
    render(<RecordStoreFilingStatus />);
    expect(
      await screen.findByText(/Filing data is up to date/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/403 of 590 artists filed by sort name \(3 yours\)/)
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers to fetch missing data and starts the refresh', async () => {
    mockApi.getFilingStatus
      .mockResolvedValueOnce(status({ missing: 590, mastersMissing: 1318 }))
      .mockResolvedValue(status({ missing: 590, running: true }));
    render(<RecordStoreFilingStatus />);

    const button = await screen.findByRole('button', {
      name: /Fetch filing data \(about 24 min\)/,
    });
    expect(
      screen.getByText(/590 artists not looked up yet/)
    ).toBeInTheDocument();
    await userEvent.click(button);

    expect(mockApi.startFilingRefresh).toHaveBeenCalled();
    expect(
      await screen.findByText(/Fetching: artists 120 of 590/)
    ).toBeInTheDocument();
  });

  it('polls while running, stops on request, and reports when it finishes', async () => {
    jest.useFakeTimers();
    try {
      const onFinished = jest.fn();
      mockApi.getFilingStatus
        .mockResolvedValueOnce(status({ missing: 5, running: true }))
        .mockResolvedValueOnce(status({ missing: 5, running: true }))
        .mockResolvedValue(status({ failures: 2 }));
      render(<RecordStoreFilingStatus onRefreshFinished={onFinished} />);

      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByRole('button', { name: /Stop/ })).toBeInTheDocument();

      await act(async () => {
        await jest.advanceTimersByTimeAsync(4100);
      });
      expect(mockApi.getFilingStatus).toHaveBeenCalledTimes(3);
      expect(onFinished).toHaveBeenCalledTimes(1);
      expect(
        screen.getByText(/2 lookups failed and will be tried again/)
      ).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('reports a refresh that finishes before the next status read', async () => {
    const onFinished = jest.fn();
    mockApi.getFilingStatus
      .mockResolvedValueOnce(status({ missing: 2 }))
      .mockResolvedValue(status({}));
    mockApi.startFilingRefresh.mockResolvedValue(status({ running: true }).job);
    render(<RecordStoreFilingStatus onRefreshFinished={onFinished} />);
    await userEvent.click(
      await screen.findByRole('button', { name: /Fetch filing data/ })
    );
    await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText(/Filing data is up to date/)
    ).toBeInTheDocument();
  });

  it('keeps showing progress when a status read fails after starting', async () => {
    mockApi.getFilingStatus
      .mockResolvedValueOnce(status({ missing: 2 }))
      .mockRejectedValue(new Error('blip'));
    mockApi.startFilingRefresh.mockResolvedValue(status({ running: true }).job);
    render(<RecordStoreFilingStatus />);
    await userEvent.click(
      await screen.findByRole('button', { name: /Fetch filing data/ })
    );
    expect(
      await screen.findByRole('button', { name: /Stop/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Couldn't check the record-store filing data/)
    ).not.toBeInTheDocument();
  });

  it('shows the job error', async () => {
    mockApi.getFilingStatus.mockResolvedValue(
      status({ missing: 3, error: 'MusicBrainz is not responding' })
    );
    render(<RecordStoreFilingStatus />);
    expect(
      await screen.findByText('MusicBrainz is not responding')
    ).toBeInTheDocument();
  });

  it('cancels a running refresh', async () => {
    mockApi.getFilingStatus.mockResolvedValue(status({ running: true }));
    render(<RecordStoreFilingStatus />);
    await userEvent.click(await screen.findByRole('button', { name: /Stop/ }));
    await waitFor(() => expect(mockApi.cancelFilingRefresh).toHaveBeenCalled());
  });

  it('says so when the status cannot be read', async () => {
    mockApi.getFilingStatus.mockRejectedValue(new Error('down'));
    render(<RecordStoreFilingStatus />);
    expect(
      await screen.findByText(/Couldn't check the record-store filing data/)
    ).toBeInTheDocument();
  });
});
