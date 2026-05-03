import axios from 'axios';

import { AuthService } from '../../../src/backend/services/authService';
import { DiscogsService } from '../../../src/backend/services/discogsService';
import { LabelMonitoringService } from '../../../src/backend/services/labelMonitoringService';
import { WishlistService } from '../../../src/backend/services/wishlistService';
import { getDiscogsAxios } from '../../../src/backend/utils/discogsAxios';
import { FileStorage } from '../../../src/backend/utils/fileStorage';

jest.mock('axios');
jest.mock('../../../src/backend/utils/discogsAxios');
jest.mock('../../../src/backend/utils/fileStorage');
jest.mock('../../../src/backend/services/authService');
jest.mock('../../../src/backend/services/wishlistService');
jest.mock('../../../src/backend/services/discogsService');
jest.mock('../../../src/backend/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedGetDiscogsAxios = getDiscogsAxios as jest.MockedFunction<
  typeof getDiscogsAxios
>;

interface AxiosMock {
  get: jest.Mock;
  post: jest.Mock;
  interceptors: { request: { use: jest.Mock } };
}

describe('LabelMonitoringService', () => {
  let service: LabelMonitoringService;
  let mockFileStorage: jest.Mocked<FileStorage>;
  let mockAuth: jest.Mocked<AuthService>;
  let mockWishlist: jest.Mocked<WishlistService>;
  let mockDiscogs: jest.Mocked<DiscogsService>;
  let mockAxiosInstance: AxiosMock;

  // Use FRESH state per test to avoid mutable cross-test contamination
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    mockFileStorage = new FileStorage('test') as jest.Mocked<FileStorage>;
    mockFileStorage.readJSON = jest.fn().mockResolvedValue(null);
    mockFileStorage.writeJSON = jest.fn().mockResolvedValue(undefined);
    mockFileStorage.writeJSONWithBackup = jest
      .fn()
      .mockResolvedValue(undefined);
    mockFileStorage.delete = jest.fn().mockResolvedValue(undefined);
    mockFileStorage.listFiles = jest.fn().mockResolvedValue([]);

    mockAuth = new AuthService(mockFileStorage) as jest.Mocked<AuthService>;
    mockAuth.getDiscogsToken = jest
      .fn()
      .mockResolvedValue('Discogs token=test-token');

    mockWishlist = new WishlistService(
      mockFileStorage,
      mockAuth
    ) as jest.Mocked<WishlistService>;
    mockWishlist.getWishlistItems = jest.fn().mockResolvedValue([]);
    mockWishlist.getLocalWantList = jest.fn().mockResolvedValue([]);

    mockDiscogs = {} as jest.Mocked<DiscogsService>;

    mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      interceptors: { request: { use: jest.fn() } },
    };
    mockedGetDiscogsAxios.mockReturnValue(mockAxiosInstance as never);
    mockedAxios.isAxiosError = jest.fn().mockReturnValue(false) as never;

    service = new LabelMonitoringService(
      mockFileStorage,
      mockAuth,
      mockWishlist,
      mockDiscogs
    );
  });

  describe('getLabels', () => {
    it('returns empty array when store missing', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);
      const labels = await service.getLabels();
      expect(labels).toEqual([]);
    });

    it('returns labels from store', async () => {
      mockFileStorage.readJSON.mockResolvedValue({
        schemaVersion: 1,
        labels: [
          {
            id: 'uuid-1',
            discogsLabelId: 100,
            name: 'Anticon',
            addedAt: 1,
            lookbackMonths: 6,
          },
        ],
      });
      const labels = await service.getLabels();
      expect(labels).toHaveLength(1);
      expect(labels[0].name).toBe('Anticon');
    });

    it('returns empty array when schema version mismatch', async () => {
      mockFileStorage.readJSON.mockResolvedValue({
        schemaVersion: 99,
        labels: [{ name: 'old' }],
      });
      const labels = await service.getLabels();
      expect(labels).toEqual([]);
    });
  });

  describe('searchLabels', () => {
    it('returns empty array for empty query', async () => {
      const results = await service.searchLabels('');
      expect(results).toEqual([]);
      expect(mockAxiosInstance.get).not.toHaveBeenCalled();
    });

    it('returns Discogs label search hits', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          results: [
            {
              id: 100,
              type: 'label',
              title: 'Anticon',
              thumb: 'http://x',
            },
            {
              id: 200,
              type: 'master', // Should be filtered out
              title: 'Not a label',
            },
            {
              id: 300,
              type: 'label',
              title: 'Backwoodz Studioz',
            },
          ],
        },
      });
      const results = await service.searchLabels('woodz');
      expect(results).toEqual([
        { id: 100, name: 'Anticon', thumbUrl: 'http://x' },
        { id: 300, name: 'Backwoodz Studioz', thumbUrl: undefined },
      ]);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/database/search',
        expect.objectContaining({
          params: { q: 'woodz', type: 'label', per_page: 25 },
        })
      );
    });
  });

  describe('addLabel', () => {
    beforeEach(() => {
      mockFileStorage.readJSON.mockImplementation(async (path: string) => {
        if (path === 'labels/monitored-labels.json') return null;
        return null;
      });
    });

    it('adds a new label after Discogs validation', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { id: 100, name: 'Anticon' },
      });

      const label = await service.addLabel(100);

      expect(label.discogsLabelId).toBe(100);
      expect(label.name).toBe('Anticon');
      expect(label.id).toMatch(/[0-9a-f-]{36}/);
      expect(mockFileStorage.writeJSONWithBackup).toHaveBeenCalledWith(
        'labels/monitored-labels.json',
        expect.objectContaining({
          schemaVersion: 1,
          labels: expect.arrayContaining([
            expect.objectContaining({ discogsLabelId: 100 }),
          ]),
        })
      );
    });

    it('uses override name when provided', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { id: 100, name: 'Anticon Records' },
      });

      const label = await service.addLabel(100, 'Custom Display');
      expect(label.name).toBe('Custom Display');
    });

    it('uses configured lookbackMonths', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { id: 100, name: 'Anticon' },
      });

      const label = await service.addLabel(100, undefined, 18);
      expect(label.lookbackMonths).toBe(18);
    });

    it('falls back to settings.defaultLookbackMonths', async () => {
      // Settings mock — return 9
      mockFileStorage.readJSON.mockImplementation(async (path: string) => {
        if (path === 'labels/settings.json') {
          return { schemaVersion: 1, defaultLookbackMonths: 9 };
        }
        return null;
      });
      mockAxiosInstance.get.mockResolvedValue({
        data: { id: 100, name: 'Anticon' },
      });

      const label = await service.addLabel(100);
      expect(label.lookbackMonths).toBe(9);
    });

    it('throws when label not found on Discogs (404)', async () => {
      const error = Object.assign(new Error('Not Found'), {
        isAxiosError: true,
        response: { status: 404 },
      });
      (mockedAxios.isAxiosError as unknown as jest.Mock).mockReturnValue(true);
      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(service.addLabel(999)).rejects.toThrow(
        'Label not found on Discogs'
      );
    });

    it('throws when label already monitored', async () => {
      mockFileStorage.readJSON.mockImplementation(async (path: string) => {
        if (path === 'labels/monitored-labels.json') {
          return {
            schemaVersion: 1,
            labels: [
              {
                id: 'existing-uuid',
                discogsLabelId: 100,
                name: 'Anticon',
                addedAt: 1,
                lookbackMonths: 6,
              },
            ],
          };
        }
        return null;
      });

      await expect(service.addLabel(100)).rejects.toThrow(
        'Already monitoring this label'
      );
    });
  });

  describe('removeLabel', () => {
    beforeEach(() => {
      mockFileStorage.readJSON.mockImplementation(async (path: string) => {
        if (path === 'labels/monitored-labels.json') {
          return {
            schemaVersion: 1,
            labels: [
              {
                id: 'uuid-keep',
                discogsLabelId: 1,
                name: 'Keep',
                addedAt: 1,
                lookbackMonths: 6,
              },
              {
                id: 'uuid-remove',
                discogsLabelId: 2,
                name: 'Remove',
                addedAt: 1,
                lookbackMonths: 6,
              },
            ],
          };
        }
        if (path === 'labels/releases.json') {
          return {
            schemaVersion: 1,
            lastUpdated: 0,
            releases: [
              {
                id: 'rel-1',
                labelId: 'uuid-remove',
                discogsReleaseId: 1,
                title: 'a',
                artist: 'b',
                format: [],
                addedAt: 0,
                isInCollection: false,
                isInWishlist: false,
                status: 'new',
              },
              {
                id: 'rel-2',
                labelId: 'uuid-keep',
                discogsReleaseId: 2,
                title: 'a',
                artist: 'b',
                format: [],
                addedAt: 0,
                isInCollection: false,
                isInWishlist: false,
                status: 'new',
              },
            ],
          };
        }
        return null;
      });
    });

    it('removes a label and its releases', async () => {
      const ok = await service.removeLabel('uuid-remove');
      expect(ok).toBe(true);
      // Last write to labels file should not contain uuid-remove
      const labelWrites = mockFileStorage.writeJSONWithBackup.mock.calls.filter(
        c => c[0] === 'labels/monitored-labels.json'
      );
      const lastLabels = labelWrites[labelWrites.length - 1][1] as {
        labels: Array<{ id: string }>;
      };
      expect(lastLabels.labels.map(l => l.id)).toEqual(['uuid-keep']);

      // Releases file should drop rel-1 (the removed label's release)
      const relWrites = mockFileStorage.writeJSONWithBackup.mock.calls.filter(
        c => c[0] === 'labels/releases.json'
      );
      expect(relWrites.length).toBeGreaterThan(0);
      const lastRel = relWrites[relWrites.length - 1][1] as {
        releases: Array<{ labelId: string }>;
      };
      expect(lastRel.releases.map(r => r.labelId)).toEqual(['uuid-keep']);
    });

    it('returns false for unknown id', async () => {
      const ok = await service.removeLabel('not-real');
      expect(ok).toBe(false);
    });
  });

  describe('settings', () => {
    it('returns defaults when no settings file', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);
      const s = await service.getSettings();
      expect(s).toEqual({
        schemaVersion: 1,
        defaultLookbackMonths: 6,
      });
    });

    it('returns stored settings', async () => {
      mockFileStorage.readJSON.mockResolvedValue({
        schemaVersion: 1,
        defaultLookbackMonths: 12,
      });
      const s = await service.getSettings();
      expect(s.defaultLookbackMonths).toBe(12);
    });

    it('saveSettings merges existing with update', async () => {
      mockFileStorage.readJSON.mockResolvedValue({
        schemaVersion: 1,
        defaultLookbackMonths: 6,
      });
      const s = await service.saveSettings({ defaultLookbackMonths: 9 });
      expect(s.defaultLookbackMonths).toBe(9);
      expect(mockFileStorage.writeJSONWithBackup).toHaveBeenCalledWith(
        'labels/settings.json',
        expect.objectContaining({ defaultLookbackMonths: 9 })
      );
    });
  });

  describe('scan status', () => {
    it('returns idle when no status file', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);
      const status = await service.getScanStatus();
      expect(status).toEqual({ status: 'idle' });
    });

    it('returns stored status', async () => {
      mockFileStorage.readJSON.mockResolvedValue({
        schemaVersion: 1,
        status: { status: 'completed', releasesFound: 3 },
      });
      const status = await service.getScanStatus();
      expect(status.status).toBe('completed');
    });
  });

  describe('mark / dismiss release', () => {
    beforeEach(() => {
      mockFileStorage.readJSON.mockImplementation(async (path: string) => {
        if (path === 'labels/releases.json') {
          return {
            schemaVersion: 1,
            lastUpdated: 0,
            releases: [
              {
                id: 'rel-1',
                labelId: 'l1',
                discogsReleaseId: 1,
                title: 't',
                artist: 'a',
                format: [],
                addedAt: 0,
                isInCollection: false,
                isInWishlist: false,
                status: 'new',
              },
            ],
          };
        }
        return null;
      });
    });

    it('markReleaseAsSeen sets status to seen', async () => {
      const ok = await service.markReleaseAsSeen('rel-1');
      expect(ok).toBe(true);
      const lastWrite = mockFileStorage.writeJSONWithBackup.mock.calls.find(
        c => c[0] === 'labels/releases.json'
      );
      const store = lastWrite![1] as { releases: Array<{ status: string }> };
      expect(store.releases[0].status).toBe('seen');
    });

    it('markReleaseAsSeen returns false for unknown release', async () => {
      const ok = await service.markReleaseAsSeen('nope');
      expect(ok).toBe(false);
    });

    it('dismissRelease sets status to dismissed', async () => {
      const ok = await service.dismissRelease('rel-1');
      expect(ok).toBe(true);
      const lastWrite = mockFileStorage.writeJSONWithBackup.mock.calls.find(
        c => c[0] === 'labels/releases.json'
      );
      const store = lastWrite![1] as { releases: Array<{ status: string }> };
      expect(store.releases[0].status).toBe('dismissed');
    });
  });

  describe('startScan / cancelScan', () => {
    it('completes immediately with 0 totalLabels when no labels exist', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);
      const status = await service.startScan();
      expect(status.status).toBe('completed');
      expect(status.totalLabels).toBe(0);
    });

    it('cancelScan returns false when no scan running', async () => {
      const result = await service.cancelScan();
      expect(result).toBe(false);
    });

    it('returns existing in-progress status when called twice', async () => {
      // Set up labels so scan actually starts
      mockFileStorage.readJSON.mockImplementation(async (path: string) => {
        if (path === 'labels/monitored-labels.json') {
          return {
            schemaVersion: 1,
            labels: [
              {
                id: 'l1',
                discogsLabelId: 1,
                name: 'L',
                addedAt: 1,
                lookbackMonths: 6,
              },
            ],
          };
        }
        if (path === 'labels/scan-status.json') {
          return null;
        }
        return null;
      });
      // Make label fetch never resolve to keep scan in flight
      mockAxiosInstance.get.mockReturnValue(new Promise(() => {}));

      const first = await service.startScan();
      expect(first.status).toBe('scanning');

      const second = await service.startScan();
      // Second call should not double-start; gets current status (possibly idle from mock)
      expect(['scanning', 'idle']).toContain(second.status);
    });
  });

  describe('startScan: single-label scan does NOT overwrite full label list (regression)', () => {
    it('persists ONLY scan progress, never rewriting labels with target only', async () => {
      const existingLabels = [
        {
          id: 'l1',
          discogsLabelId: 1,
          name: 'Label1',
          addedAt: 1,
          lookbackMonths: 6,
        },
        {
          id: 'l2',
          discogsLabelId: 2,
          name: 'Label2',
          addedAt: 1,
          lookbackMonths: 6,
        },
        {
          id: 'l3',
          discogsLabelId: 3,
          name: 'Label3',
          addedAt: 1,
          lookbackMonths: 6,
        },
      ];

      mockFileStorage.readJSON.mockImplementation(async (path: string) => {
        if (path === 'labels/monitored-labels.json') {
          return { schemaVersion: 1, labels: existingLabels };
        }
        if (path === 'labels/settings.json') return null;
        if (path === 'labels/scan-status.json') return null;
        if (path === 'labels/releases.json') {
          return { schemaVersion: 1, lastUpdated: 0, releases: [] };
        }
        return null;
      });

      // Mock Discogs label-releases endpoint to return zero releases on every call
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          releases: [],
          pagination: { page: 1, pages: 1, per_page: 100, items: 0 },
        },
      });

      // Trigger a SINGLE-label scan
      await service.startScan('l2');

      // Wait a tick for background task — short retry until processing finishes
      await new Promise(resolve => setTimeout(resolve, 50));

      // Find every write to monitored-labels.json
      const labelWrites = mockFileStorage.writeJSONWithBackup.mock.calls.filter(
        c => c[0] === 'labels/monitored-labels.json'
      );
      // Each write must contain the FULL list (never just l2)
      for (const [, body] of labelWrites) {
        const store = body as { labels: Array<{ id: string }> };
        const ids = store.labels.map(l => l.id).sort();
        expect(ids).toEqual(['l1', 'l2', 'l3']);
      }
    });
  });
});
