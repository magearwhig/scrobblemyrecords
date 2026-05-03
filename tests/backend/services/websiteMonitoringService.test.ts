import { OllamaService } from '../../../src/backend/services/ollamaService';
import { WebsiteMonitoringService } from '../../../src/backend/services/websiteMonitoringService';
import { WishlistService } from '../../../src/backend/services/wishlistService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';

jest.mock('../../../src/backend/utils/fileStorage');
jest.mock('../../../src/backend/services/ollamaService');
jest.mock('../../../src/backend/services/wishlistService');
jest.mock('../../../src/backend/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe('WebsiteMonitoringService', () => {
  let service: WebsiteMonitoringService;
  let mockFileStorage: jest.Mocked<FileStorage>;
  let mockOllama: jest.Mocked<OllamaService>;
  let mockWishlist: jest.Mocked<WishlistService>;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    jest.clearAllMocks();

    mockFileStorage = new FileStorage('test') as jest.Mocked<FileStorage>;
    mockFileStorage.readJSON = jest.fn().mockResolvedValue(null);
    mockFileStorage.writeJSON = jest.fn().mockResolvedValue(undefined);
    mockFileStorage.writeJSONWithBackup = jest
      .fn()
      .mockResolvedValue(undefined);
    mockFileStorage.listFiles = jest.fn().mockResolvedValue([]);

    mockOllama = new OllamaService() as jest.Mocked<OllamaService>;
    mockOllama.chat = jest.fn();
    mockOllama.checkConnection = jest
      .fn()
      .mockResolvedValue({ connected: false });
    mockOllama.updateSettings = jest.fn();

    mockWishlist = {
      getWishlistItems: jest.fn().mockResolvedValue([]),
      getLocalWantList: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<WishlistService>;

    originalFetch = globalThis.fetch;

    service = new WebsiteMonitoringService(
      mockFileStorage,
      mockOllama,
      mockWishlist
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('CRUD: getWebsites', () => {
    it('returns empty array on missing file', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);
      const websites = await service.getWebsites();
      expect(websites).toEqual([]);
    });

    it('returns websites from store', async () => {
      mockFileStorage.readJSON.mockResolvedValue({
        schemaVersion: 1,
        websites: [
          {
            id: 'w1',
            name: 'Site',
            url: 'https://example.com',
            useOllama: true,
            enabled: true,
            addedAt: 1,
          },
        ],
      });
      const websites = await service.getWebsites();
      expect(websites).toHaveLength(1);
    });
  });

  describe('addWebsite', () => {
    beforeEach(() => {
      mockFileStorage.readJSON.mockResolvedValue(null);
    });

    it('adds a website', async () => {
      const w = await service.addWebsite({
        name: 'Indie Store',
        url: 'https://indie.example.com',
      });
      expect(w.name).toBe('Indie Store');
      expect(w.id).toMatch(/[0-9a-f-]{36}/);
      expect(w.useOllama).toBe(true);
      expect(w.enabled).toBe(true);
    });

    it('rejects when name missing', async () => {
      await expect(
        service.addWebsite({ name: '', url: 'https://x.com' })
      ).rejects.toThrow('name is required');
    });

    it('rejects when url missing', async () => {
      await expect(service.addWebsite({ name: 'X', url: '' })).rejects.toThrow(
        'url is required'
      );
    });

    it('rejects malformed URL', async () => {
      await expect(
        service.addWebsite({ name: 'X', url: 'not-a-url' })
      ).rejects.toThrow('Invalid URL');
    });

    it('rejects ftp:// URLs', async () => {
      await expect(
        service.addWebsite({ name: 'X', url: 'ftp://example.com/' })
      ).rejects.toThrow('http or https');
    });

    it('rejects when URL already exists', async () => {
      mockFileStorage.readJSON.mockResolvedValue({
        schemaVersion: 1,
        websites: [
          {
            id: 'w1',
            name: 'X',
            url: 'https://example.com',
            useOllama: true,
            enabled: true,
            addedAt: 1,
          },
        ],
      });
      await expect(
        service.addWebsite({ name: 'Y', url: 'https://example.com' })
      ).rejects.toThrow('Already monitoring this URL');
    });
  });

  describe('updateWebsite / removeWebsite', () => {
    beforeEach(() => {
      mockFileStorage.readJSON.mockImplementation(async (path: string) => {
        if (path === 'websites/monitored-websites.json') {
          return {
            schemaVersion: 1,
            websites: [
              {
                id: 'w1',
                name: 'Old',
                url: 'https://old.example.com',
                useOllama: true,
                enabled: true,
                addedAt: 1,
              },
            ],
          };
        }
        if (path === 'websites/items.json') {
          return {
            schemaVersion: 1,
            lastUpdated: 0,
            items: [
              {
                id: 'i1',
                websiteId: 'w1',
                title: 't',
                extractedAt: 0,
                confidence: 0.5,
                status: 'new',
              },
            ],
          };
        }
        return null;
      });
    });

    it('updateWebsite merges fields and preserves id/addedAt', async () => {
      const updated = await service.updateWebsite('w1', {
        name: 'New Name',
        enabled: false,
      });
      expect(updated?.id).toBe('w1');
      expect(updated?.name).toBe('New Name');
      expect(updated?.enabled).toBe(false);
      expect(updated?.addedAt).toBe(1);
    });

    it('updateWebsite rejects invalid URL', async () => {
      await expect(
        service.updateWebsite('w1', { url: 'not-a-url' })
      ).rejects.toThrow('Invalid URL');
    });

    it('updateWebsite returns null for unknown id', async () => {
      const result = await service.updateWebsite('not-real', {});
      expect(result).toBeNull();
    });

    it('removeWebsite drops website + cascades items', async () => {
      const ok = await service.removeWebsite('w1');
      expect(ok).toBe(true);
      const itemWrites = mockFileStorage.writeJSONWithBackup.mock.calls.filter(
        c => c[0] === 'websites/items.json'
      );
      expect(itemWrites.length).toBeGreaterThan(0);
      const lastItems = itemWrites[itemWrites.length - 1][1] as {
        items: unknown[];
      };
      expect(lastItems.items).toHaveLength(0);
    });

    it('removeWebsite returns false when not found', async () => {
      const ok = await service.removeWebsite('missing');
      expect(ok).toBe(false);
    });
  });

  describe('Items: mark + dismiss', () => {
    beforeEach(() => {
      mockFileStorage.readJSON.mockImplementation(async (path: string) => {
        if (path === 'websites/items.json') {
          return {
            schemaVersion: 1,
            lastUpdated: 0,
            items: [
              {
                id: 'i1',
                websiteId: 'w1',
                title: 't',
                extractedAt: 0,
                confidence: 0.5,
                status: 'new',
              },
            ],
          };
        }
        return null;
      });
    });

    it('markItemAsSeen sets status', async () => {
      const ok = await service.markItemAsSeen('i1');
      expect(ok).toBe(true);
      const lastWrite = mockFileStorage.writeJSONWithBackup.mock.calls.find(
        c => c[0] === 'websites/items.json'
      );
      const store = lastWrite![1] as { items: Array<{ status: string }> };
      expect(store.items[0].status).toBe('seen');
    });

    it('markItemAsSeen returns false when not found', async () => {
      const ok = await service.markItemAsSeen('nope');
      expect(ok).toBe(false);
    });

    it('dismissItem sets status to dismissed', async () => {
      const ok = await service.dismissItem('i1');
      expect(ok).toBe(true);
      const lastWrite = mockFileStorage.writeJSONWithBackup.mock.calls.find(
        c => c[0] === 'websites/items.json'
      );
      const store = lastWrite![1] as { items: Array<{ status: string }> };
      expect(store.items[0].status).toBe('dismissed');
    });
  });

  describe('previewWebsite', () => {
    beforeEach(() => {
      mockFileStorage.readJSON.mockImplementation(async (path: string) => {
        if (path === 'websites/settings.json') {
          return {
            schemaVersion: 1,
            ollamaModel: 'mistral',
            ollamaEnabled: true,
            fetchTimeoutMs: 5000,
            maxBytes: 500 * 1024,
          };
        }
        return null;
      });
    });

    it('rejects invalid URL up front', async () => {
      await expect(service.previewWebsite('not-a-url')).rejects.toThrow(
        'Invalid URL'
      );
    });

    it('extracts items via Ollama (success path)', async () => {
      const html = `
        <html><body>
        <div class="product">
          <h2>Album One</h2><span>by Artist A</span><span>$25</span>
        </div>
        </body></html>
      `;
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'text/html']]) as never,
        text: async () => html,
        body: null,
      }) as never;

      mockOllama.checkConnection.mockResolvedValue({ connected: true });
      mockOllama.chat.mockResolvedValue(
        JSON.stringify({
          items: [
            {
              title: 'Album One',
              artist: 'Artist A',
              price: 25,
              format: 'LP',
              releaseDate: '2026-01-01',
              url: 'https://example.com/p/1',
              confidence: 0.9,
            },
          ],
        })
      );

      const result = await service.previewWebsite('https://example.com');
      expect(result.ollamaAvailable).toBe(true);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe('Album One');
      expect(result.items[0].artist).toBe('Artist A');
      expect(result.items[0].price).toBe(25);
      expect(result.items[0].confidence).toBe(0.9);
      expect(result.warning).toBeUndefined();
    });

    it('falls back to regex when Ollama returns non-JSON', async () => {
      const html = `
        <html><body>
        <div>Artist A - Album One $25</div>
        <div>Artist B - Album Two £15</div>
        </body></html>
      `;
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'text/html']]) as never,
        text: async () => html,
        body: null,
      }) as never;

      mockOllama.checkConnection.mockResolvedValue({ connected: true });
      mockOllama.chat.mockResolvedValue('this is not JSON at all!!!');

      const result = await service.previewWebsite('https://example.com');
      expect(result.ollamaAvailable).toBe(true);
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      expect(result.warning).toMatch(/Ollama returned unusable/);
      // Regex fallback yields confidence: 0.2
      expect(result.items[0].confidence).toBe(0.2);
    });

    it('uses fallback when Ollama unavailable', async () => {
      const html = `<html><body>Artist X - Title Y $20</body></html>`;
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'text/html']]) as never,
        text: async () => html,
        body: null,
      }) as never;

      mockOllama.checkConnection.mockResolvedValue({
        connected: false,
        error: 'down',
      });

      const result = await service.previewWebsite('https://example.com');
      expect(result.ollamaAvailable).toBe(false);
      expect(result.warning).toMatch(/Ollama unavailable/);
      // Should not have called chat at all
      expect(mockOllama.chat).not.toHaveBeenCalled();
    });

    it('handles fetch failure', async () => {
      globalThis.fetch = jest
        .fn()
        .mockRejectedValue(new Error('socket reset')) as never;

      await expect(
        service.previewWebsite('https://example.com')
      ).rejects.toThrow('Failed to fetch URL');
    });

    it('rejects non-HTML content-type', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/pdf']]) as never,
        text: async () => 'binary',
        body: null,
      }) as never;

      await expect(
        service.previewWebsite('https://example.com')
      ).rejects.toThrow(/content-type/);
    });

    it('rejects HTTP error response', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Map([['content-type', 'text/html']]) as never,
        text: async () => '',
        body: null,
      }) as never;

      await expect(
        service.previewWebsite('https://example.com')
      ).rejects.toThrow(/HTTP 500/);
    });

    it('uses CSS selector to scope extraction', async () => {
      const html = `
        <html><body>
        <div class="other">Should not appear - Hidden Title $99</div>
        <div class="products">Visible - Real Album $25</div>
        </body></html>
      `;
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'text/html']]) as never,
        text: async () => html,
        body: null,
      }) as never;

      mockOllama.checkConnection.mockResolvedValue({ connected: false });

      const result = await service.previewWebsite(
        'https://example.com',
        '.products'
      );
      // The selector text should not include "Hidden Title"
      expect(result.rawTextPreview).toContain('Real Album');
      expect(result.rawTextPreview).not.toContain('Hidden Title');
    });

    it('truncates extraction to maxBytes', async () => {
      // 600KB body — should be truncated to 500KB cap
      const huge = 'a'.repeat(600 * 1024);
      const html = `<html><body>${huge}</body></html>`;
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'text/html']]) as never,
        text: async () => html,
        body: null,
      }) as never;

      mockOllama.checkConnection.mockResolvedValue({ connected: false });

      const result = await service.previewWebsite('https://example.com');
      // rawTextPreview is sliced to 1000 chars after extraction
      expect(result.rawTextPreview!.length).toBeLessThanOrEqual(1000);
      expect(result.ollamaAvailable).toBe(false);
    });
  });

  describe('settings', () => {
    it('returns defaults when missing', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);
      const s = await service.getSettings();
      expect(s.ollamaModel).toBe('mistral');
      expect(s.ollamaEnabled).toBe(true);
      expect(s.fetchTimeoutMs).toBe(15000);
      expect(s.maxBytes).toBe(500 * 1024);
    });

    it('merges saveSettings with existing', async () => {
      mockFileStorage.readJSON.mockResolvedValue({
        schemaVersion: 1,
        ollamaModel: 'mistral',
        ollamaEnabled: true,
        fetchTimeoutMs: 15000,
        maxBytes: 500 * 1024,
      });
      const s = await service.saveSettings({ ollamaModel: 'llama3' });
      expect(s.ollamaModel).toBe('llama3');
      expect(s.ollamaEnabled).toBe(true);
    });
  });

  describe('startScan / cancelScan', () => {
    it('returns completed status when no enabled websites', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);
      const status = await service.startScan();
      expect(status.status).toBe('completed');
      expect(status.totalWebsites).toBe(0);
    });

    it('cancelScan returns false when not scanning', async () => {
      const ok = await service.cancelScan();
      expect(ok).toBe(false);
    });
  });

  describe('startScan: single-website target does NOT overwrite full website list (regression)', () => {
    it('preserves full website list across writes during single-site scan', async () => {
      const websitesList = [
        {
          id: 'w1',
          name: 'A',
          url: 'https://a.example.com',
          useOllama: false,
          enabled: true,
          addedAt: 1,
        },
        {
          id: 'w2',
          name: 'B',
          url: 'https://b.example.com',
          useOllama: false,
          enabled: true,
          addedAt: 1,
        },
        {
          id: 'w3',
          name: 'C',
          url: 'https://c.example.com',
          useOllama: false,
          enabled: true,
          addedAt: 1,
        },
      ];

      mockFileStorage.readJSON.mockImplementation(async (path: string) => {
        if (path === 'websites/monitored-websites.json') {
          return { schemaVersion: 1, websites: websitesList };
        }
        if (path === 'websites/settings.json') {
          return {
            schemaVersion: 1,
            ollamaModel: 'mistral',
            ollamaEnabled: false,
            fetchTimeoutMs: 5000,
            maxBytes: 1024,
          };
        }
        return null;
      });

      // Stub fetch to return empty body (no items)
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'text/html']]) as never,
        text: async () => '<html></html>',
        body: null,
      }) as never;

      mockOllama.checkConnection.mockResolvedValue({ connected: false });

      await service.startScan('w2');

      // Wait for background scan to flush
      await new Promise(r => setTimeout(r, 100));

      const websiteWrites =
        mockFileStorage.writeJSONWithBackup.mock.calls.filter(
          c => c[0] === 'websites/monitored-websites.json'
        );
      for (const [, body] of websiteWrites) {
        const store = body as { websites: Array<{ id: string }> };
        const ids = store.websites.map(w => w.id).sort();
        // Must contain ALL three sites in every write
        expect(ids).toEqual(['w1', 'w2', 'w3']);
      }
    });
  });
});
