import { useEffect, useRef } from 'react';

import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { getApiService } from '../services/api';
import { createLogger } from '../utils/logger';

const logger = createLogger('useJobPoller');

const POLL_INTERVAL = 3000;

interface JobStatus {
  id: string;
  type: string;
  status: string;
  message: string;
  error?: string;
  startedAt: number;
  completedAt?: number;
}

export function useJobPoller(): void {
  const { showToast } = useToast();
  const { state } = useApp();
  const seenJobIds = useRef<Set<string>>(new Set());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const api = getApiService(state.serverUrl);

    const poll = async () => {
      try {
        const jobs: JobStatus[] = await api.getJobStatuses();

        for (const job of jobs) {
          if (seenJobIds.current.has(job.id)) continue;

          if (job.status === 'completed') {
            seenJobIds.current.add(job.id);
            showToast('success', job.message);
            logger.info(`Job completed: ${job.id} - ${job.message}`);
          } else if (job.status === 'failed') {
            seenJobIds.current.add(job.id);
            showToast('error', job.error || job.message);
            logger.error(`Job failed: ${job.id} - ${job.error || job.message}`);
          }
          // Running jobs are not added to seen - we'll check them again
        }
      } catch {
        // Silently ignore poll failures (server may be restarting)
      }
    };

    intervalRef.current = setInterval(poll, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [showToast, state.serverUrl]);
}
