import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import request from 'supertest';

import createLabelsRouter from '../../../src/backend/routes/labels';
import { LabelMonitoringService } from '../../../src/backend/services/labelMonitoringService';
import {
  LabelMonitoringSettings,
  LabelRelease,
  LabelScanStatus,
  MonitoredLabel,
} from '../../../src/shared/types';

jest.mock('../../../src/backend/services/labelMonitoringService');

const MockedLabelMonitoringService = LabelMonitoringService as jest.MockedClass<
  typeof LabelMonitoringService
>;

function createLabel(partial: Partial<MonitoredLabel> = {}): MonitoredLabel {
  return {
    id: 'local-uuid-1',
    discogsLabelId: 12345,
    name: 'Anticon',
    addedAt: Date.now() - 86400000,
    lookbackMonths: 6,
    ...partial,
  };
}

function createRelease(partial: Partial<LabelRelease> = {}): LabelRelease {
  return {
    id: 'rel-uuid-1',
    labelId: 'local-uuid-1',
    discogsReleaseId: 999,
    title: 'Album Title',
    artist: 'Artist Name',
    year: 2026,
    format: ['Vinyl', 'LP'],
    addedAt: Date.now(),
    isInCollection: false,
    isInWishlist: false,
    status: 'new',
    ...partial,
  };
}

describe('Labels Routes', () => {
  let app: express.Application;
  let mockService: jest.Mocked<LabelMonitoringService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockService = new MockedLabelMonitoringService(
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never
    ) as jest.Mocked<LabelMonitoringService>;

    // Default mock setup — fresh per test, no shared mutable state
    mockService.getLabels = jest.fn().mockResolvedValue([createLabel()]);
    mockService.searchLabels = jest
      .fn()
      .mockResolvedValue([{ id: 12345, name: 'Anticon', thumbUrl: undefined }]);
    mockService.addLabel = jest
      .fn()
      .mockImplementation(async (id: number, name?: string) =>
        createLabel({ discogsLabelId: id, name: name || `Label ${id}` })
      );
    mockService.removeLabel = jest.fn().mockResolvedValue(true);
    mockService.getAllReleases = jest.fn().mockResolvedValue([createRelease()]);
    mockService.getReleasesForLabel = jest
      .fn()
      .mockResolvedValue([createRelease()]);
    mockService.markReleaseAsSeen = jest.fn().mockResolvedValue(true);
    mockService.dismissRelease = jest.fn().mockResolvedValue(true);
    mockService.startScan = jest.fn().mockResolvedValue({
      status: 'scanning',
      totalLabels: 1,
      processedLabels: 0,
      releasesFound: 0,
      startedAt: Date.now(),
    } as LabelScanStatus);
    mockService.getScanStatus = jest.fn().mockResolvedValue({
      status: 'idle',
    } as LabelScanStatus);
    mockService.cancelScan = jest.fn().mockResolvedValue(true);
    mockService.getSettings = jest.fn().mockResolvedValue({
      schemaVersion: 1,
      defaultLookbackMonths: 6,
    } as LabelMonitoringSettings);
    mockService.saveSettings = jest
      .fn()
      .mockImplementation(async (update: Partial<LabelMonitoringSettings>) => ({
        schemaVersion: 1,
        defaultLookbackMonths: update.defaultLookbackMonths ?? 6,
      }));

    app = express();
    app.use(helmet());
    app.use(cors());
    app.use(express.json());
    app.use((_req, res, next) => {
      res.set('Connection', 'close');
      next();
    });
    app.use('/api/v1/labels', createLabelsRouter(mockService));
  });

  describe('GET /api/v1/labels', () => {
    it('returns monitored labels', async () => {
      const res = await request(app).get('/api/v1/labels');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Anticon');
    });

    it('returns 500 on service error', async () => {
      mockService.getLabels.mockRejectedValue(new Error('Storage broken'));
      const res = await request(app).get('/api/v1/labels');
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Storage broken');
    });
  });

  describe('POST /api/v1/labels', () => {
    it('adds a label by discogsLabelId', async () => {
      const res = await request(app)
        .post('/api/v1/labels')
        .send({ discogsLabelId: 99 });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockService.addLabel).toHaveBeenCalledWith(
        99,
        undefined,
        undefined
      );
    });

    it('accepts displayName (frontend canonical key)', async () => {
      await request(app)
        .post('/api/v1/labels')
        .send({ discogsLabelId: 99, displayName: 'Custom Display' });
      expect(mockService.addLabel).toHaveBeenCalledWith(
        99,
        'Custom Display',
        undefined
      );
    });

    it('accepts legacy `name` parameter', async () => {
      await request(app)
        .post('/api/v1/labels')
        .send({ discogsLabelId: 99, name: 'Legacy Name' });
      expect(mockService.addLabel).toHaveBeenCalledWith(
        99,
        'Legacy Name',
        undefined
      );
    });

    it('passes lookbackMonths through', async () => {
      await request(app)
        .post('/api/v1/labels')
        .send({ discogsLabelId: 99, lookbackMonths: 3 });
      expect(mockService.addLabel).toHaveBeenCalledWith(99, undefined, 3);
    });

    it('rejects missing discogsLabelId', async () => {
      const res = await request(app).post('/api/v1/labels').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/discogsLabelId/);
    });

    it('rejects non-number discogsLabelId', async () => {
      const res = await request(app)
        .post('/api/v1/labels')
        .send({ discogsLabelId: 'not-a-number' });
      expect(res.status).toBe(400);
    });

    it('rejects non-number lookbackMonths', async () => {
      const res = await request(app)
        .post('/api/v1/labels')
        .send({ discogsLabelId: 1, lookbackMonths: 'six' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/lookbackMonths/);
    });

    it('returns 400 when service reports already monitored', async () => {
      mockService.addLabel.mockRejectedValue(
        new Error('Already monitoring this label')
      );
      const res = await request(app)
        .post('/api/v1/labels')
        .send({ discogsLabelId: 1 });
      expect(res.status).toBe(400);
    });

    it('returns 400 when service reports not found', async () => {
      mockService.addLabel.mockRejectedValue(
        new Error('Label not found on Discogs')
      );
      const res = await request(app)
        .post('/api/v1/labels')
        .send({ discogsLabelId: 1 });
      expect(res.status).toBe(400);
    });

    it('returns 500 on unknown error', async () => {
      mockService.addLabel.mockRejectedValue(new Error('Network down'));
      const res = await request(app)
        .post('/api/v1/labels')
        .send({ discogsLabelId: 1 });
      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/v1/labels/search', () => {
    it('returns label search results', async () => {
      const res = await request(app).get('/api/v1/labels/search?q=Anticon');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(mockService.searchLabels).toHaveBeenCalledWith('Anticon');
    });

    it('rejects empty query', async () => {
      const res = await request(app).get('/api/v1/labels/search?q=');
      expect(res.status).toBe(400);
    });

    it('rejects missing query', async () => {
      const res = await request(app).get('/api/v1/labels/search');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/labels/releases', () => {
    it('returns all releases when no labelId', async () => {
      const res = await request(app).get('/api/v1/labels/releases');
      expect(res.status).toBe(200);
      expect(mockService.getAllReleases).toHaveBeenCalled();
      expect(mockService.getReleasesForLabel).not.toHaveBeenCalled();
    });

    it('filters by labelId when provided', async () => {
      const res = await request(app).get(
        '/api/v1/labels/releases?labelId=local-uuid-1'
      );
      expect(res.status).toBe(200);
      expect(mockService.getReleasesForLabel).toHaveBeenCalledWith(
        'local-uuid-1'
      );
    });

    it('handles errors', async () => {
      mockService.getAllReleases.mockRejectedValue(new Error('boom'));
      const res = await request(app).get('/api/v1/labels/releases');
      expect(res.status).toBe(500);
    });
  });

  describe('Scan endpoints', () => {
    it('POST /scan starts a scan with no body', async () => {
      const res = await request(app).post('/api/v1/labels/scan');
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('scanning');
      expect(mockService.startScan).toHaveBeenCalledWith(undefined);
    });

    it('POST /scan with labelId starts a single-label scan', async () => {
      await request(app).post('/api/v1/labels/scan').send({
        labelId: 'local-uuid-1',
      });
      expect(mockService.startScan).toHaveBeenCalledWith('local-uuid-1');
    });

    it('POST /:labelId/scan starts a single-label scan via path', async () => {
      const res = await request(app).post('/api/v1/labels/local-uuid-1/scan');
      expect(res.status).toBe(200);
      expect(mockService.startScan).toHaveBeenCalledWith('local-uuid-1');
    });

    it('GET /scan/status returns current status (not param-captured)', async () => {
      const res = await request(app).get('/api/v1/labels/scan/status');
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('idle');
      // Critical: must NOT have called removeLabel via the :labelId param route
      expect(mockService.removeLabel).not.toHaveBeenCalled();
    });

    it('POST /scan/cancel returns cancellation result', async () => {
      const res = await request(app).post('/api/v1/labels/scan/cancel');
      expect(res.status).toBe(200);
      expect(res.body.data.cancelled).toBe(true);
    });

    it('POST /scan/cancel returns false when no scan running', async () => {
      mockService.cancelScan.mockResolvedValue(false);
      const res = await request(app).post('/api/v1/labels/scan/cancel');
      expect(res.status).toBe(200);
      expect(res.body.data.cancelled).toBe(false);
    });

    it('handles startScan errors', async () => {
      mockService.startScan.mockRejectedValue(new Error('scan failed'));
      const res = await request(app).post('/api/v1/labels/scan');
      expect(res.status).toBe(500);
    });
  });

  describe('Settings endpoints', () => {
    it('GET /settings returns current settings (not param-captured)', async () => {
      const res = await request(app).get('/api/v1/labels/settings');
      expect(res.status).toBe(200);
      expect(res.body.data.defaultLookbackMonths).toBe(6);
      expect(mockService.removeLabel).not.toHaveBeenCalled();
    });

    it('POST /settings saves settings', async () => {
      const res = await request(app)
        .post('/api/v1/labels/settings')
        .send({ defaultLookbackMonths: 12 });
      expect(res.status).toBe(200);
      expect(res.body.data.defaultLookbackMonths).toBe(12);
      expect(mockService.saveSettings).toHaveBeenCalledWith({
        defaultLookbackMonths: 12,
      });
    });

    it('handles save errors', async () => {
      mockService.saveSettings.mockRejectedValue(new Error('disk full'));
      const res = await request(app)
        .post('/api/v1/labels/settings')
        .send({ defaultLookbackMonths: 12 });
      expect(res.status).toBe(500);
    });
  });

  describe('Release seen / dismiss', () => {
    it('POST /releases/:id/seen marks release as seen', async () => {
      const res = await request(app).post(
        '/api/v1/labels/releases/rel-uuid-1/seen'
      );
      expect(res.status).toBe(200);
      expect(mockService.markReleaseAsSeen).toHaveBeenCalledWith('rel-uuid-1');
    });

    it('returns 404 when release not found', async () => {
      mockService.markReleaseAsSeen.mockResolvedValue(false);
      const res = await request(app).post(
        '/api/v1/labels/releases/missing/seen'
      );
      expect(res.status).toBe(404);
    });

    it('POST /releases/:id/dismiss marks as dismissed', async () => {
      const res = await request(app).post(
        '/api/v1/labels/releases/rel-uuid-1/dismiss'
      );
      expect(res.status).toBe(200);
      expect(mockService.dismissRelease).toHaveBeenCalledWith('rel-uuid-1');
    });

    it('dismiss returns 404 for unknown release', async () => {
      mockService.dismissRelease.mockResolvedValue(false);
      const res = await request(app).post(
        '/api/v1/labels/releases/missing/dismiss'
      );
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/labels/:labelId', () => {
    it('removes a label', async () => {
      const res = await request(app).delete('/api/v1/labels/local-uuid-1');
      expect(res.status).toBe(200);
      expect(res.body.data.removed).toBe(true);
      expect(mockService.removeLabel).toHaveBeenCalledWith('local-uuid-1');
    });

    it('returns 404 when not found', async () => {
      mockService.removeLabel.mockResolvedValue(false);
      const res = await request(app).delete('/api/v1/labels/missing');
      expect(res.status).toBe(404);
    });

    it('handles errors', async () => {
      mockService.removeLabel.mockRejectedValue(new Error('disk error'));
      const res = await request(app).delete('/api/v1/labels/foo');
      expect(res.status).toBe(500);
    });
  });

  describe('Route ordering — static routes win over /:labelId', () => {
    it('GET /search hits searchLabels, not removeLabel', async () => {
      await request(app).get('/api/v1/labels/search?q=test');
      expect(mockService.searchLabels).toHaveBeenCalled();
      expect(mockService.removeLabel).not.toHaveBeenCalled();
    });

    it('GET /releases hits getAllReleases, not removeLabel', async () => {
      await request(app).get('/api/v1/labels/releases');
      expect(mockService.getAllReleases).toHaveBeenCalled();
      expect(mockService.removeLabel).not.toHaveBeenCalled();
    });

    it('GET /settings hits getSettings, not removeLabel', async () => {
      await request(app).get('/api/v1/labels/settings');
      expect(mockService.getSettings).toHaveBeenCalled();
      expect(mockService.removeLabel).not.toHaveBeenCalled();
    });
  });
});
