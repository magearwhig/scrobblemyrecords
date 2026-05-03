import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import request from 'supertest';

import createWebsitesRouter from '../../../src/backend/routes/websites';
import { OllamaService } from '../../../src/backend/services/ollamaService';
import { WebsiteMonitoringService } from '../../../src/backend/services/websiteMonitoringService';
import {
  MonitoredWebsite,
  WebsiteItem,
  WebsiteMonitoringSettings,
  WebsiteScanStatus,
} from '../../../src/shared/types';

jest.mock('../../../src/backend/services/websiteMonitoringService');
jest.mock('../../../src/backend/services/ollamaService');

const MockedWebsiteService = WebsiteMonitoringService as jest.MockedClass<
  typeof WebsiteMonitoringService
>;
const MockedOllamaService = OllamaService as jest.MockedClass<
  typeof OllamaService
>;

function createWebsite(
  partial: Partial<MonitoredWebsite> = {}
): MonitoredWebsite {
  return {
    id: 'web-uuid-1',
    name: 'Indie Label Store',
    url: 'https://example.com/store',
    enabled: true,
    useOllama: true,
    addedAt: Date.now(),
    ...partial,
  };
}

function createItem(partial: Partial<WebsiteItem> = {}): WebsiteItem {
  return {
    id: 'item-uuid-1',
    websiteId: 'web-uuid-1',
    title: 'Album',
    artist: 'Artist',
    price: 30,
    extractedAt: Date.now(),
    confidence: 0.8,
    status: 'new',
    ...partial,
  };
}

describe('Websites Routes', () => {
  let app: express.Application;
  let mockService: jest.Mocked<WebsiteMonitoringService>;
  let mockOllama: jest.Mocked<OllamaService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockService = new MockedWebsiteService(
      undefined as never,
      undefined as never,
      undefined as never
    ) as jest.Mocked<WebsiteMonitoringService>;
    mockOllama = new MockedOllamaService() as jest.Mocked<OllamaService>;

    mockService.getWebsites = jest.fn().mockResolvedValue([createWebsite()]);
    mockService.addWebsite = jest
      .fn()
      .mockImplementation(async input => createWebsite(input));
    mockService.updateWebsite = jest
      .fn()
      .mockImplementation(async (id, update) =>
        createWebsite({ id, ...update })
      );
    mockService.removeWebsite = jest.fn().mockResolvedValue(true);
    mockService.previewWebsite = jest.fn().mockResolvedValue({
      items: [createItem()],
      ollamaAvailable: true,
      rawTextPreview: 'Some preview text',
    });
    mockService.getItems = jest.fn().mockResolvedValue([createItem()]);
    mockService.markItemAsSeen = jest.fn().mockResolvedValue(true);
    mockService.dismissItem = jest.fn().mockResolvedValue(true);
    mockService.startScan = jest.fn().mockResolvedValue({
      status: 'scanning',
      totalWebsites: 1,
      processedWebsites: 0,
      itemsFound: 0,
      startedAt: Date.now(),
    } as WebsiteScanStatus);
    mockService.getScanStatus = jest.fn().mockResolvedValue({
      status: 'idle',
    } as WebsiteScanStatus);
    mockService.cancelScan = jest.fn().mockResolvedValue(true);
    mockService.getSettings = jest.fn().mockResolvedValue({
      schemaVersion: 1,
      ollamaModel: 'mistral',
      ollamaEnabled: true,
      fetchTimeoutMs: 15000,
      maxBytes: 500 * 1024,
    } as WebsiteMonitoringSettings);
    mockService.saveSettings = jest.fn().mockImplementation(async update => ({
      schemaVersion: 1,
      ollamaModel: update.ollamaModel ?? 'mistral',
      ollamaEnabled: update.ollamaEnabled ?? true,
      fetchTimeoutMs: update.fetchTimeoutMs ?? 15000,
      maxBytes: update.maxBytes ?? 500 * 1024,
    }));

    mockOllama.checkConnection = jest
      .fn()
      .mockResolvedValue({ connected: true });

    app = express();
    app.use(helmet());
    app.use(cors());
    app.use(express.json());
    app.use((_req, res, next) => {
      res.set('Connection', 'close');
      next();
    });
    app.use('/api/v1/websites', createWebsitesRouter(mockService, mockOllama));
  });

  describe('GET /api/v1/websites', () => {
    it('returns monitored websites', async () => {
      const res = await request(app).get('/api/v1/websites');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('handles errors', async () => {
      mockService.getWebsites.mockRejectedValue(new Error('boom'));
      const res = await request(app).get('/api/v1/websites');
      expect(res.status).toBe(500);
    });
  });

  describe('POST /api/v1/websites', () => {
    it('adds a website', async () => {
      const res = await request(app)
        .post('/api/v1/websites')
        .send({ name: 'Site', url: 'https://example.com' });
      expect(res.status).toBe(200);
      expect(mockService.addWebsite).toHaveBeenCalledWith({
        name: 'Site',
        url: 'https://example.com',
        cssSelector: undefined,
        useOllama: undefined,
        enabled: undefined,
      });
    });

    it('returns 400 for invalid URL', async () => {
      mockService.addWebsite.mockRejectedValue(new Error('Invalid URL'));
      const res = await request(app)
        .post('/api/v1/websites')
        .send({ name: 'X', url: 'not-a-url' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for non-http protocol', async () => {
      mockService.addWebsite.mockRejectedValue(
        new Error('URL must use http or https')
      );
      const res = await request(app)
        .post('/api/v1/websites')
        .send({ name: 'X', url: 'ftp://example.com' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when missing required field', async () => {
      mockService.addWebsite.mockRejectedValue(new Error('name is required'));
      const res = await request(app)
        .post('/api/v1/websites')
        .send({ url: 'https://example.com' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when already monitoring', async () => {
      mockService.addWebsite.mockRejectedValue(
        new Error('Already monitoring this URL')
      );
      const res = await request(app)
        .post('/api/v1/websites')
        .send({ name: 'X', url: 'https://example.com' });
      expect(res.status).toBe(400);
    });

    it('returns 500 on unknown error', async () => {
      mockService.addWebsite.mockRejectedValue(new Error('Random'));
      const res = await request(app)
        .post('/api/v1/websites')
        .send({ name: 'X', url: 'https://example.com' });
      expect(res.status).toBe(500);
    });
  });

  describe('POST /api/v1/websites/preview', () => {
    it('returns preview result', async () => {
      const res = await request(app)
        .post('/api/v1/websites/preview')
        .send({ url: 'https://example.com', cssSelector: '.products' });
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.ollamaAvailable).toBe(true);
      expect(mockService.previewWebsite).toHaveBeenCalledWith(
        'https://example.com',
        '.products'
      );
    });

    it('rejects when url missing', async () => {
      const res = await request(app).post('/api/v1/websites/preview').send({});
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid URL', async () => {
      mockService.previewWebsite.mockRejectedValue(new Error('Invalid URL'));
      const res = await request(app)
        .post('/api/v1/websites/preview')
        .send({ url: 'bad' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when fetch fails', async () => {
      mockService.previewWebsite.mockRejectedValue(
        new Error('Failed to fetch URL: timeout')
      );
      const res = await request(app)
        .post('/api/v1/websites/preview')
        .send({ url: 'https://example.com' });
      expect(res.status).toBe(400);
    });

    it('returns 500 on unknown error', async () => {
      mockService.previewWebsite.mockRejectedValue(new Error('Something else'));
      const res = await request(app)
        .post('/api/v1/websites/preview')
        .send({ url: 'https://example.com' });
      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/v1/websites/items', () => {
    it('returns all items', async () => {
      const res = await request(app).get('/api/v1/websites/items');
      expect(res.status).toBe(200);
      expect(mockService.getItems).toHaveBeenCalledWith(undefined);
    });

    it('filters by websiteId', async () => {
      await request(app).get('/api/v1/websites/items?websiteId=web-uuid-1');
      expect(mockService.getItems).toHaveBeenCalledWith('web-uuid-1');
    });
  });

  describe('Scan endpoints', () => {
    it('POST /scan starts scan with no body', async () => {
      const res = await request(app).post('/api/v1/websites/scan');
      expect(res.status).toBe(200);
      expect(mockService.startScan).toHaveBeenCalledWith(undefined);
    });

    it('POST /scan with websiteId targets one site', async () => {
      await request(app)
        .post('/api/v1/websites/scan')
        .send({ websiteId: 'web-uuid-1' });
      expect(mockService.startScan).toHaveBeenCalledWith('web-uuid-1');
    });

    it('POST /:id/scan targets one site via path', async () => {
      const res = await request(app).post('/api/v1/websites/web-uuid-1/scan');
      expect(res.status).toBe(200);
      expect(mockService.startScan).toHaveBeenCalledWith('web-uuid-1');
    });

    it('GET /scan/status returns status (not param-captured)', async () => {
      const res = await request(app).get('/api/v1/websites/scan/status');
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('idle');
      expect(mockService.removeWebsite).not.toHaveBeenCalled();
    });

    it('POST /scan/cancel returns cancellation result', async () => {
      const res = await request(app).post('/api/v1/websites/scan/cancel');
      expect(res.status).toBe(200);
      expect(res.body.data.cancelled).toBe(true);
    });
  });

  describe('Settings', () => {
    it('GET /settings returns settings', async () => {
      const res = await request(app).get('/api/v1/websites/settings');
      expect(res.status).toBe(200);
      expect(res.body.data.ollamaModel).toBe('mistral');
    });

    it('POST /settings saves settings', async () => {
      const res = await request(app)
        .post('/api/v1/websites/settings')
        .send({ ollamaModel: 'llama3' });
      expect(res.status).toBe(200);
      expect(mockService.saveSettings).toHaveBeenCalledWith({
        ollamaModel: 'llama3',
      });
    });
  });

  describe('Item seen / dismiss', () => {
    it('POST /items/:id/seen marks item seen', async () => {
      const res = await request(app).post(
        '/api/v1/websites/items/item-uuid-1/seen'
      );
      expect(res.status).toBe(200);
      expect(mockService.markItemAsSeen).toHaveBeenCalledWith('item-uuid-1');
    });

    it('returns 404 when item not found', async () => {
      mockService.markItemAsSeen.mockResolvedValue(false);
      const res = await request(app).post(
        '/api/v1/websites/items/missing/seen'
      );
      expect(res.status).toBe(404);
    });

    it('POST /items/:id/dismiss', async () => {
      const res = await request(app).post(
        '/api/v1/websites/items/item-uuid-1/dismiss'
      );
      expect(res.status).toBe(200);
      expect(mockService.dismissItem).toHaveBeenCalledWith('item-uuid-1');
    });

    it('dismiss 404 when item missing', async () => {
      mockService.dismissItem.mockResolvedValue(false);
      const res = await request(app).post(
        '/api/v1/websites/items/missing/dismiss'
      );
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/v1/websites/:id', () => {
    it('updates a website', async () => {
      const res = await request(app)
        .patch('/api/v1/websites/web-uuid-1')
        .send({ enabled: false });
      expect(res.status).toBe(200);
      expect(mockService.updateWebsite).toHaveBeenCalledWith('web-uuid-1', {
        enabled: false,
      });
    });

    it('returns 404 when not found', async () => {
      mockService.updateWebsite.mockResolvedValue(null);
      const res = await request(app).patch('/api/v1/websites/missing').send({});
      expect(res.status).toBe(404);
    });

    it('returns 400 for invalid URL update', async () => {
      mockService.updateWebsite.mockRejectedValue(new Error('Invalid URL'));
      const res = await request(app)
        .patch('/api/v1/websites/web-uuid-1')
        .send({ url: 'bad' });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/v1/websites/:id', () => {
    it('removes a website', async () => {
      const res = await request(app).delete('/api/v1/websites/web-uuid-1');
      expect(res.status).toBe(200);
      expect(mockService.removeWebsite).toHaveBeenCalledWith('web-uuid-1');
    });

    it('returns 404 when missing', async () => {
      mockService.removeWebsite.mockResolvedValue(false);
      const res = await request(app).delete('/api/v1/websites/missing');
      expect(res.status).toBe(404);
    });

    it('returns 500 on error', async () => {
      mockService.removeWebsite.mockRejectedValue(new Error('disk error'));
      const res = await request(app).delete('/api/v1/websites/web-uuid-1');
      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/v1/websites/ollama/status', () => {
    it('returns connected when ollama is up', async () => {
      const res = await request(app).get('/api/v1/websites/ollama/status');
      expect(res.status).toBe(200);
      expect(res.body.data.available).toBe(true);
      expect(res.body.data.model).toBe('mistral');
    });

    it('returns not available when checkConnection reports down', async () => {
      mockOllama.checkConnection.mockResolvedValue({
        connected: false,
        error: 'connection refused',
      });
      const res = await request(app).get('/api/v1/websites/ollama/status');
      expect(res.status).toBe(200);
      expect(res.body.data.available).toBe(false);
      expect(res.body.data.error).toBe('connection refused');
    });

    it('reports gracefully when no ollama service is provided', async () => {
      // Build a separate app without an ollamaService
      const noOllamaApp = express();
      noOllamaApp.use(express.json());
      noOllamaApp.use('/api/v1/websites', createWebsitesRouter(mockService));
      const res = await request(noOllamaApp).get(
        '/api/v1/websites/ollama/status'
      );
      expect(res.status).toBe(200);
      expect(res.body.data.available).toBe(false);
    });
  });

  describe('Route ordering', () => {
    it('GET /items hits getItems, not removeWebsite', async () => {
      await request(app).get('/api/v1/websites/items');
      expect(mockService.getItems).toHaveBeenCalled();
      expect(mockService.removeWebsite).not.toHaveBeenCalled();
    });

    it('GET /scan/status hits getScanStatus, not removeWebsite', async () => {
      await request(app).get('/api/v1/websites/scan/status');
      expect(mockService.getScanStatus).toHaveBeenCalled();
      expect(mockService.removeWebsite).not.toHaveBeenCalled();
    });

    it('GET /settings hits getSettings, not removeWebsite', async () => {
      await request(app).get('/api/v1/websites/settings');
      expect(mockService.getSettings).toHaveBeenCalled();
      expect(mockService.removeWebsite).not.toHaveBeenCalled();
    });

    it('GET /ollama/status hits ollama, not updateWebsite', async () => {
      await request(app).get('/api/v1/websites/ollama/status');
      expect(mockOllama.checkConnection).toHaveBeenCalled();
      expect(mockService.updateWebsite).not.toHaveBeenCalled();
    });
  });
});
