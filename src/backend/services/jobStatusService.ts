import { createLogger } from '../utils/logger';

const logger = createLogger('JobStatusService');

export type JobStatus = 'running' | 'completed' | 'failed';

export interface Job {
  id: string;
  type: string;
  status: JobStatus;
  message: string;
  error?: string;
  startedAt: number;
  completedAt?: number;
}

const PRUNE_AGE_MS = 5 * 60 * 1000; // 5 minutes
let nextJobId = 1;

class JobStatusService {
  private jobs: Map<string, Job> = new Map();

  startJob(type: string, message: string): string {
    this.prune();
    const id = `job-${nextJobId++}`;
    const job: Job = {
      id,
      type,
      status: 'running',
      message,
      startedAt: Date.now(),
    };
    this.jobs.set(id, job);
    logger.info(`Job started: ${id} (${type}) - ${message}`);
    return id;
  }

  completeJob(id: string, message?: string): void {
    const job = this.jobs.get(id);
    if (!job) return;
    job.status = 'completed';
    job.completedAt = Date.now();
    if (message) job.message = message;
    logger.info(`Job completed: ${id} (${job.type}) - ${job.message}`);
  }

  failJob(id: string, error: string): void {
    const job = this.jobs.get(id);
    if (!job) return;
    job.status = 'failed';
    job.completedAt = Date.now();
    job.error = error;
    logger.error(`Job failed: ${id} (${job.type}) - ${error}`);
  }

  getRecentJobs(): Job[] {
    this.prune();
    return Array.from(this.jobs.values()).sort(
      (a, b) => b.startedAt - a.startedAt
    );
  }

  private prune(): void {
    const cutoff = Date.now() - PRUNE_AGE_MS;
    for (const [id, job] of this.jobs) {
      if (job.completedAt && job.completedAt < cutoff) {
        this.jobs.delete(id);
      }
    }
  }
}

export const jobStatusService = new JobStatusService();
