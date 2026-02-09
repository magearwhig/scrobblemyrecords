import { renderHook, act } from '@testing-library/react';
import React, { ReactNode } from 'react';

import { AppProvider } from '../../../src/renderer/context/AppContext';
import {
  ToastProvider,
  useToast,
} from '../../../src/renderer/context/ToastContext';
import { useJobPoller } from '../../../src/renderer/hooks/useJobPoller';

// Mock the api service
const mockGetJobStatuses = jest.fn();
jest.mock('../../../src/renderer/services/api', () => ({
  getApiService: () => ({
    getJobStatuses: mockGetJobStatuses,
  }),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <AppProvider>
    <ToastProvider>{children}</ToastProvider>
  </AppProvider>
);

describe('useJobPoller', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockGetJobStatuses.mockReset();
    mockGetJobStatuses.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('polls for job statuses on interval', async () => {
    renderHook(() => useJobPoller(), { wrapper });

    // Advance timer by 3 seconds (poll interval)
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    expect(mockGetJobStatuses).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    expect(mockGetJobStatuses).toHaveBeenCalledTimes(2);
  });

  it('shows success toast when job completes', async () => {
    mockGetJobStatuses.mockResolvedValue([
      {
        id: 'job-1',
        type: 'sync',
        status: 'completed',
        message: 'Sync done',
        startedAt: Date.now(),
        completedAt: Date.now(),
      },
    ]);

    const { result } = renderHook(
      () => {
        useJobPoller();
        return useToast();
      },
      { wrapper }
    );

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].type).toBe('success');
    expect(result.current.toasts[0].message).toBe('Sync done');
  });

  it('shows error toast when job fails', async () => {
    mockGetJobStatuses.mockResolvedValue([
      {
        id: 'job-2',
        type: 'sync',
        status: 'failed',
        message: 'Syncing...',
        error: 'Network error',
        startedAt: Date.now(),
        completedAt: Date.now(),
      },
    ]);

    const { result } = renderHook(
      () => {
        useJobPoller();
        return useToast();
      },
      { wrapper }
    );

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].type).toBe('error');
    expect(result.current.toasts[0].message).toBe('Network error');
  });

  it('does not show duplicate toasts for the same job', async () => {
    const completedJob = {
      id: 'job-3',
      type: 'sync',
      status: 'completed',
      message: 'Done',
      startedAt: Date.now(),
      completedAt: Date.now(),
    };

    mockGetJobStatuses.mockResolvedValue([completedJob]);

    const { result } = renderHook(
      () => {
        useJobPoller();
        return useToast();
      },
      { wrapper }
    );

    // First poll
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    expect(result.current.toasts).toHaveLength(1);

    // Second poll - same job
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    // Should still be 1, not 2
    expect(result.current.toasts).toHaveLength(1);
  });

  it('cleans up interval on unmount', async () => {
    const { unmount } = renderHook(() => useJobPoller(), { wrapper });

    unmount();

    await act(async () => {
      jest.advanceTimersByTime(6000);
    });

    // Should not have polled after unmount
    expect(mockGetJobStatuses).toHaveBeenCalledTimes(0);
  });

  it('silently handles API errors', async () => {
    mockGetJobStatuses.mockRejectedValue(new Error('Server down'));

    renderHook(() => useJobPoller(), { wrapper });

    // Should not throw
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    expect(mockGetJobStatuses).toHaveBeenCalledTimes(1);
  });
});
