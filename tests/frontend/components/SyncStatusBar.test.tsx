import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';

// Mock the api service
const mockGetHistorySyncStatus = jest.fn();
const mockStartHistorySync = jest.fn();
const mockPauseHistorySync = jest.fn();
const mockResumeHistorySync = jest.fn();

jest.mock('../../../src/renderer/services/api', () => ({
  getApiService: () => ({
    getHistorySyncStatus: mockGetHistorySyncStatus,
    startHistorySync: mockStartHistorySync,
    pauseHistorySync: mockPauseHistorySync,
    resumeHistorySync: mockResumeHistorySync,
  }),
}));

import SyncStatusBar from '../../../src/renderer/components/SyncStatusBar';

describe('SyncStatusBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createSyncResponse = (
    status: 'idle' | 'syncing' | 'paused' | 'completed' | 'error',
    options: {
      progress?: number;
      scrobblesFetched?: number;
      totalScrobbles?: number;
      estimatedTimeRemaining?: number;
      error?: string;
      storageTotalAlbums?: number;
      storageTotalScrobbles?: number;
      lastSync?: string | null;
    } = {}
  ) => ({
    sync: {
      status,
      progress: options.progress ?? 0,
      scrobblesFetched: options.scrobblesFetched ?? 0,
      totalScrobbles: options.totalScrobbles ?? 0,
      estimatedTimeRemaining: options.estimatedTimeRemaining,
      error: options.error,
    },
    storage: {
      totalAlbums: options.storageTotalAlbums ?? 0,
      totalScrobbles: options.storageTotalScrobbles ?? 0,
      lastSync: options.lastSync ?? null,
    },
  });

  describe('loading state', () => {
    it('should show loading message initially', () => {
      mockGetHistorySyncStatus.mockImplementation(() => new Promise(() => {})); // Never resolves
      render(<SyncStatusBar />);
      expect(screen.getByText('Loading sync status...')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('should show error message when fetch fails', async () => {
      mockGetHistorySyncStatus.mockRejectedValue(new Error('Network error'));

      render(<SyncStatusBar />);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('should show fallback error message for non-Error exceptions', async () => {
      mockGetHistorySyncStatus.mockRejectedValue('Unknown error');

      render(<SyncStatusBar />);

      await waitFor(() => {
        expect(
          screen.getByText('Failed to fetch sync status')
        ).toBeInTheDocument();
      });
    });

    it('should retry fetching status when Retry button is clicked', async () => {
      mockGetHistorySyncStatus.mockRejectedValue(new Error('Network error'));

      render(<SyncStatusBar />);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });

      const callsBefore = mockGetHistorySyncStatus.mock.calls.length;

      // Click Retry - this should call fetchStatus again
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

      // Should call getHistorySyncStatus again after clicking
      await waitFor(() => {
        expect(mockGetHistorySyncStatus.mock.calls.length).toBeGreaterThan(
          callsBefore
        );
      });
    });
  });

  describe('null syncStatus', () => {
    it('should return null when syncStatus is null after loading', async () => {
      mockGetHistorySyncStatus.mockResolvedValue({ sync: null, storage: {} });

      const { container } = render(<SyncStatusBar />);

      await waitFor(() => {
        expect(
          container.querySelector('.sync-status-loading')
        ).not.toBeInTheDocument();
      });
    });
  });

  describe('idle status', () => {
    it('should show no history synced message when no scrobbles', async () => {
      mockGetHistorySyncStatus.mockResolvedValue(createSyncResponse('idle'));

      render(<SyncStatusBar />);

      await waitFor(() => {
        expect(screen.getByText('No history synced yet')).toBeInTheDocument();
      });
      expect(
        screen.getByRole('button', { name: 'Start Full Sync' })
      ).toBeInTheDocument();
    });

    it('should show history indexed when scrobbles exist', async () => {
      mockGetHistorySyncStatus.mockResolvedValue(
        createSyncResponse('idle', { storageTotalScrobbles: 5000 })
      );

      render(<SyncStatusBar />);

      await waitFor(() => {
        expect(screen.getByText('History indexed:')).toBeInTheDocument();
        expect(screen.getByText('5,000 scrobbles')).toBeInTheDocument();
      });
      expect(
        screen.getByRole('button', { name: 'Sync New' })
      ).toBeInTheDocument();
    });

    it('should start full sync when Start Full Sync is clicked', async () => {
      mockGetHistorySyncStatus.mockResolvedValue(createSyncResponse('idle'));
      mockStartHistorySync.mockResolvedValue({});

      render(<SyncStatusBar />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: 'Start Full Sync' })
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Start Full Sync' }));

      await waitFor(() => {
        expect(mockStartHistorySync).toHaveBeenCalledWith(false);
      });
    });

    it('should start incremental sync when Sync New is clicked', async () => {
      mockGetHistorySyncStatus.mockResolvedValue(
        createSyncResponse('idle', { storageTotalScrobbles: 5000 })
      );
      mockStartHistorySync.mockResolvedValue({});

      render(<SyncStatusBar />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: 'Sync New' })
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Sync New' }));

      await waitFor(() => {
        expect(mockStartHistorySync).toHaveBeenCalledWith(true);
      });
    });
  });

  describe('syncing status', () => {
    it('should show progress bar and percentage', async () => {
      mockGetHistorySyncStatus.mockResolvedValue(
        createSyncResponse('syncing', {
          progress: 45,
          scrobblesFetched: 4500,
          totalScrobbles: 10000,
        })
      );

      render(<SyncStatusBar />);

      await waitFor(() => {
        expect(screen.getByText('45%')).toBeInTheDocument();
        expect(screen.getByText('(4,500 / 10,000)')).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    });

    it('should show ETA when estimatedTimeRemaining is provided (minutes)', async () => {
      mockGetHistorySyncStatus.mockResolvedValue(
        createSyncResponse('syncing', {
          progress: 50,
          scrobblesFetched: 5000,
          totalScrobbles: 10000,
          estimatedTimeRemaining: 120,
        })
      );

      render(<SyncStatusBar />);

      await waitFor(() => {
        expect(screen.getByText(/~2m remaining/)).toBeInTheDocument();
      });
    });

    it('should format seconds correctly', async () => {
      mockGetHistorySyncStatus.mockResolvedValue(
        createSyncResponse('syncing', {
          progress: 90,
          scrobblesFetched: 9000,
          totalScrobbles: 10000,
          estimatedTimeRemaining: 45,
        })
      );

      render(<SyncStatusBar />);

      await waitFor(() => {
        expect(screen.getByText(/~45s remaining/)).toBeInTheDocument();
      });
    });

    it('should format hours correctly', async () => {
      mockGetHistorySyncStatus.mockResolvedValue(
        createSyncResponse('syncing', {
          progress: 10,
          scrobblesFetched: 1000,
          totalScrobbles: 10000,
          estimatedTimeRemaining: 7380, // 2h 3m
        })
      );

      render(<SyncStatusBar />);

      await waitFor(() => {
        expect(screen.getByText(/~2h 3m remaining/)).toBeInTheDocument();
      });
    });

    it('should pause sync when Pause is clicked', async () => {
      mockGetHistorySyncStatus.mockResolvedValue(
        createSyncResponse('syncing', {
          progress: 50,
          scrobblesFetched: 5000,
          totalScrobbles: 10000,
        })
      );
      mockPauseHistorySync.mockResolvedValue({});

      render(<SyncStatusBar />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: 'Pause' })
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

      await waitFor(() => {
        expect(mockPauseHistorySync).toHaveBeenCalled();
      });
    });
  });

  describe('paused status', () => {
    it('should show paused state with resume button', async () => {
      mockGetHistorySyncStatus.mockResolvedValue(
        createSyncResponse('paused', {
          progress: 65,
          scrobblesFetched: 6500,
          totalScrobbles: 10000,
        })
      );

      render(<SyncStatusBar />);

      await waitFor(() => {
        expect(screen.getByText('Sync paused:')).toBeInTheDocument();
        expect(
          screen.getByText('65% complete (6,500 scrobbles)')
        ).toBeInTheDocument();
      });
      expect(
        screen.getByRole('button', { name: 'Resume' })
      ).toBeInTheDocument();
    });

    it('should resume sync when Resume is clicked', async () => {
      mockGetHistorySyncStatus.mockResolvedValue(
        createSyncResponse('paused', {
          progress: 65,
          scrobblesFetched: 6500,
          totalScrobbles: 10000,
        })
      );
      mockResumeHistorySync.mockResolvedValue({});

      render(<SyncStatusBar />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: 'Resume' })
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Resume' }));

      await waitFor(() => {
        expect(mockResumeHistorySync).toHaveBeenCalled();
      });
    });
  });

  describe('completed status', () => {
    it('should show completed state with stats', async () => {
      mockGetHistorySyncStatus.mockResolvedValue(
        createSyncResponse('completed', {
          storageTotalScrobbles: 10000,
          storageTotalAlbums: 500,
          lastSync: new Date().toISOString(),
        })
      );

      render(<SyncStatusBar />);

      await waitFor(() => {
        expect(screen.getByText('History indexed:')).toBeInTheDocument();
        expect(
          screen.getByText('10,000 scrobbles, 500 albums')
        ).toBeInTheDocument();
        expect(screen.getByText(/Last synced:/)).toBeInTheDocument();
      });
      expect(
        screen.getByRole('button', { name: 'Refresh' })
      ).toBeInTheDocument();
    });

    it('should start incremental sync when Refresh is clicked', async () => {
      mockGetHistorySyncStatus.mockResolvedValue(
        createSyncResponse('completed', {
          storageTotalScrobbles: 10000,
          storageTotalAlbums: 500,
        })
      );
      mockStartHistorySync.mockResolvedValue({});

      render(<SyncStatusBar />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: 'Refresh' })
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

      await waitFor(() => {
        expect(mockStartHistorySync).toHaveBeenCalledWith(true);
      });
    });
  });

  describe('error status', () => {
    it('should show error state with retry button', async () => {
      mockGetHistorySyncStatus.mockResolvedValue(
        createSyncResponse('error', { error: 'API rate limited' })
      );

      render(<SyncStatusBar />);

      await waitFor(() => {
        expect(screen.getByText('API rate limited')).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('should show default error message when error is not provided', async () => {
      mockGetHistorySyncStatus.mockResolvedValue(createSyncResponse('error'));

      render(<SyncStatusBar />);

      await waitFor(() => {
        expect(screen.getByText('Sync failed')).toBeInTheDocument();
      });
    });

    it('should start full sync when Retry is clicked on error', async () => {
      mockGetHistorySyncStatus.mockResolvedValue(
        createSyncResponse('error', { error: 'API error' })
      );
      mockStartHistorySync.mockResolvedValue({});

      render(<SyncStatusBar />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: 'Retry' })
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

      await waitFor(() => {
        expect(mockStartHistorySync).toHaveBeenCalledWith(false);
      });
    });
  });

  describe('compact mode', () => {
    it('should show compact syncing view', async () => {
      mockGetHistorySyncStatus.mockResolvedValue(
        createSyncResponse('syncing', {
          progress: 75,
          scrobblesFetched: 7500,
          totalScrobbles: 10000,
        })
      );

      render(<SyncStatusBar compact />);

      await waitFor(() => {
        expect(screen.getByText('Syncing: 75%')).toBeInTheDocument();
      });
    });

    it('should show compact idle view with scrobbles', async () => {
      mockGetHistorySyncStatus.mockResolvedValue(
        createSyncResponse('idle', { storageTotalScrobbles: 5000 })
      );

      render(<SyncStatusBar compact />);

      await waitFor(() => {
        expect(screen.getByText('5,000 scrobbles indexed')).toBeInTheDocument();
      });
    });

    it('should show compact empty view', async () => {
      mockGetHistorySyncStatus.mockResolvedValue(createSyncResponse('idle'));

      render(<SyncStatusBar compact />);

      await waitFor(() => {
        expect(
          screen.getByText('Sync history to enable suggestions')
        ).toBeInTheDocument();
      });
    });

    it('should show compact view for completed status with scrobbles', async () => {
      mockGetHistorySyncStatus.mockResolvedValue(
        createSyncResponse('completed', {
          storageTotalScrobbles: 8000,
          storageTotalAlbums: 400,
        })
      );

      render(<SyncStatusBar compact />);

      await waitFor(() => {
        expect(screen.getByText('8,000 scrobbles indexed')).toBeInTheDocument();
      });
    });

    it('should start sync when compact empty button is clicked', async () => {
      mockGetHistorySyncStatus.mockResolvedValue(createSyncResponse('idle'));
      mockStartHistorySync.mockResolvedValue({});

      render(<SyncStatusBar compact />);

      await waitFor(() => {
        expect(
          screen.getByText('Sync history to enable suggestions')
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Sync history to enable suggestions'));

      await waitFor(() => {
        expect(mockStartHistorySync).toHaveBeenCalledWith(false);
      });
    });
  });

  describe('formatLastSync', () => {
    it('should format "Never" when no last sync', async () => {
      mockGetHistorySyncStatus.mockResolvedValue(
        createSyncResponse('idle', {
          storageTotalScrobbles: 5000,
          lastSync: null,
        })
      );

      render(<SyncStatusBar />);

      await waitFor(() => {
        expect(screen.getByText(/Last synced: Never/)).toBeInTheDocument();
      });
    });

    it('should format "Just now" for recent sync', async () => {
      mockGetHistorySyncStatus.mockResolvedValue(
        createSyncResponse('idle', {
          storageTotalScrobbles: 5000,
          lastSync: new Date().toISOString(),
        })
      );

      render(<SyncStatusBar />);

      await waitFor(() => {
        expect(screen.getByText(/Last synced: Just now/)).toBeInTheDocument();
      });
    });

    it('should format hours ago (plural)', async () => {
      const twoHoursAgo = new Date(
        Date.now() - 2 * 60 * 60 * 1000
      ).toISOString();
      mockGetHistorySyncStatus.mockResolvedValue(
        createSyncResponse('idle', {
          storageTotalScrobbles: 5000,
          lastSync: twoHoursAgo,
        })
      );

      render(<SyncStatusBar />);

      await waitFor(() => {
        expect(
          screen.getByText(/Last synced: 2 hours ago/)
        ).toBeInTheDocument();
      });
    });

    it('should format 1 hour ago (singular)', async () => {
      const oneHourAgo = new Date(
        Date.now() - 1 * 60 * 60 * 1000
      ).toISOString();
      mockGetHistorySyncStatus.mockResolvedValue(
        createSyncResponse('idle', {
          storageTotalScrobbles: 5000,
          lastSync: oneHourAgo,
        })
      );

      render(<SyncStatusBar />);

      await waitFor(() => {
        expect(screen.getByText(/Last synced: 1 hour ago/)).toBeInTheDocument();
      });
    });

    it('should format days ago (plural)', async () => {
      const threeDaysAgo = new Date(
        Date.now() - 3 * 24 * 60 * 60 * 1000
      ).toISOString();
      mockGetHistorySyncStatus.mockResolvedValue(
        createSyncResponse('idle', {
          storageTotalScrobbles: 5000,
          lastSync: threeDaysAgo,
        })
      );

      render(<SyncStatusBar />);

      await waitFor(() => {
        expect(screen.getByText(/Last synced: 3 days ago/)).toBeInTheDocument();
      });
    });

    it('should format 1 day ago (singular)', async () => {
      const oneDayAgo = new Date(
        Date.now() - 1 * 24 * 60 * 60 * 1000
      ).toISOString();
      mockGetHistorySyncStatus.mockResolvedValue(
        createSyncResponse('idle', {
          storageTotalScrobbles: 5000,
          lastSync: oneDayAgo,
        })
      );

      render(<SyncStatusBar />);

      await waitFor(() => {
        expect(screen.getByText(/Last synced: 1 day ago/)).toBeInTheDocument();
      });
    });
  });

  describe('error handling in actions', () => {
    it('should show error when pauseHistorySync fails with Error', async () => {
      mockGetHistorySyncStatus.mockResolvedValue(
        createSyncResponse('syncing', {
          progress: 50,
          scrobblesFetched: 5000,
          totalScrobbles: 10000,
        })
      );
      mockPauseHistorySync.mockRejectedValue(new Error('Failed to pause'));

      render(<SyncStatusBar />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: 'Pause' })
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

      await waitFor(() => {
        expect(screen.getByText('Failed to pause')).toBeInTheDocument();
      });
    });

    it('should show fallback error when pauseHistorySync fails with non-Error', async () => {
      mockGetHistorySyncStatus.mockResolvedValue(
        createSyncResponse('syncing', {
          progress: 50,
          scrobblesFetched: 5000,
          totalScrobbles: 10000,
        })
      );
      mockPauseHistorySync.mockRejectedValue('Unknown');

      render(<SyncStatusBar />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: 'Pause' })
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

      await waitFor(() => {
        expect(screen.getByText('Failed to pause sync')).toBeInTheDocument();
      });
    });

    it('should show error when resumeHistorySync fails with Error', async () => {
      mockGetHistorySyncStatus.mockResolvedValue(
        createSyncResponse('paused', {
          progress: 50,
          scrobblesFetched: 5000,
          totalScrobbles: 10000,
        })
      );
      mockResumeHistorySync.mockRejectedValue(new Error('Failed to resume'));

      render(<SyncStatusBar />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: 'Resume' })
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Resume' }));

      await waitFor(() => {
        expect(screen.getByText('Failed to resume')).toBeInTheDocument();
      });
    });

    it('should show fallback error when resumeHistorySync fails with non-Error', async () => {
      mockGetHistorySyncStatus.mockResolvedValue(
        createSyncResponse('paused', {
          progress: 50,
          scrobblesFetched: 5000,
          totalScrobbles: 10000,
        })
      );
      mockResumeHistorySync.mockRejectedValue('Unknown');

      render(<SyncStatusBar />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: 'Resume' })
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Resume' }));

      await waitFor(() => {
        expect(screen.getByText('Failed to resume sync')).toBeInTheDocument();
      });
    });
  });
});
