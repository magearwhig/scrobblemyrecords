import express, { Request, Response } from 'express';

import { jobStatusService } from '../services/jobStatusService';

const router = express.Router();

/**
 * GET /api/v1/jobs
 * Returns all recent jobs (running + completed/failed in last 5 minutes)
 */
router.get('/', (_req: Request, res: Response) => {
  const jobs = jobStatusService.getRecentJobs();
  res.json({ success: true, data: jobs });
});

export default router;
