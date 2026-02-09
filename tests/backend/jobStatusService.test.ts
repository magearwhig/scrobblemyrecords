import { jobStatusService } from '../../src/backend/services/jobStatusService';

// Access the private jobs map for test cleanup
function clearJobs() {
  (jobStatusService as any).jobs.clear();
}

describe('JobStatusService', () => {
  beforeEach(() => {
    clearJobs();
  });

  describe('startJob', () => {
    it('should create a running job and return an id', () => {
      const id = jobStatusService.startJob('sync', 'Syncing...');
      expect(id).toMatch(/^job-\d+$/);

      const jobs = jobStatusService.getRecentJobs();
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({
        id,
        type: 'sync',
        status: 'running',
        message: 'Syncing...',
      });
      expect(jobs[0].startedAt).toBeGreaterThan(0);
      expect(jobs[0].completedAt).toBeUndefined();
    });
  });

  describe('completeJob', () => {
    it('should mark job as completed', () => {
      const id = jobStatusService.startJob('sync', 'Syncing...');
      jobStatusService.completeJob(id, 'Done!');

      const jobs = jobStatusService.getRecentJobs();
      expect(jobs[0]).toMatchObject({
        id,
        status: 'completed',
        message: 'Done!',
      });
      expect(jobs[0].completedAt).toBeGreaterThan(0);
    });

    it('should keep original message if no new message provided', () => {
      const id = jobStatusService.startJob('sync', 'Syncing...');
      jobStatusService.completeJob(id);

      const jobs = jobStatusService.getRecentJobs();
      expect(jobs[0].message).toBe('Syncing...');
    });

    it('should ignore unknown job ids', () => {
      jobStatusService.completeJob('nonexistent');
      expect(jobStatusService.getRecentJobs()).toHaveLength(0);
    });
  });

  describe('failJob', () => {
    it('should mark job as failed with error', () => {
      const id = jobStatusService.startJob('sync', 'Syncing...');
      jobStatusService.failJob(id, 'Network error');

      const jobs = jobStatusService.getRecentJobs();
      expect(jobs[0]).toMatchObject({
        id,
        status: 'failed',
        error: 'Network error',
      });
      expect(jobs[0].completedAt).toBeGreaterThan(0);
    });

    it('should ignore unknown job ids', () => {
      jobStatusService.failJob('nonexistent', 'error');
      expect(jobStatusService.getRecentJobs()).toHaveLength(0);
    });
  });

  describe('getRecentJobs', () => {
    it('should return jobs sorted by startedAt descending', () => {
      const id1 = jobStatusService.startJob('a', 'First');
      // Manually adjust startedAt to ensure different timestamps
      const job1 = (jobStatusService as any).jobs.get(id1);
      job1.startedAt = Date.now() - 5000;

      const id2 = jobStatusService.startJob('b', 'Second');

      const jobs = jobStatusService.getRecentJobs();
      // Most recent first (id2 started after id1)
      expect(jobs[0].id).toBe(id2);
      expect(jobs[1].id).toBe(id1);
    });

    it('should prune jobs older than 5 minutes', () => {
      const id = jobStatusService.startJob('sync', 'Old job');
      jobStatusService.completeJob(id);

      // Manually set completedAt to 6 minutes ago
      const job = (jobStatusService as any).jobs.get(id);
      job.completedAt = Date.now() - 6 * 60 * 1000;

      const jobs = jobStatusService.getRecentJobs();
      expect(jobs).toHaveLength(0);
    });

    it('should not prune running jobs', () => {
      const id = jobStatusService.startJob('sync', 'Long running');

      // Manually set startedAt to 10 minutes ago (running, no completedAt)
      const job = (jobStatusService as any).jobs.get(id);
      job.startedAt = Date.now() - 10 * 60 * 1000;

      const jobs = jobStatusService.getRecentJobs();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].id).toBe(id);
    });
  });
});
