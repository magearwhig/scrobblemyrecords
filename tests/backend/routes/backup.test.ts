import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import request from 'supertest';

import createBackupRouter from '../../../src/backend/routes/backup';
import { BackupService } from '../../../src/backend/services/backupService';

// Mock dependencies
jest.mock('../../../src/backend/services/backupService');

const MockedBackupService = BackupService as jest.MockedClass<
  typeof BackupService
>;

describe('Backup Routes', () => {
  let app: express.Application;
  let mockBackupService: jest.Mocked<BackupService>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock instance
    mockBackupService = new MockedBackupService(
      {} as never,
      'test-data'
    ) as jest.Mocked<BackupService>;

    // Setup default mocks
    mockBackupService.getBackupPreview = jest.fn().mockResolvedValue({
      hasUserSettings: true,
      hasSuggestionSettings: true,
      hasAiSettings: false,
      hasWishlistSettings: true,
      hasSellerSettings: false,
      hasReleaseSettings: false,
      hasSyncSettings: false,
      albumMappingsCount: 10,
      artistMappingsCount: 5,
      historyArtistMappingsCount: 3,
      hiddenAlbumsCount: 2,
      hiddenArtistsCount: 1,
      localWantListCount: 4,
      vinylWatchListCount: 0,
      monitoredSellersCount: 2,
      artistMbidMappingsCount: 8,
      hiddenReleasesCount: 0,
      excludedArtistsCount: 1,
    });

    mockBackupService.getSettings = jest.fn().mockResolvedValue({
      schemaVersion: 1,
      enabled: false,
      frequency: 'weekly',
      retentionCount: 5,
    });

    mockBackupService.saveSettings = jest.fn().mockImplementation(settings => ({
      schemaVersion: 1,
      enabled: settings.enabled ?? false,
      frequency: settings.frequency ?? 'weekly',
      retentionCount: settings.retentionCount ?? 5,
      ...settings,
    }));

    mockBackupService.listAutoBackups = jest.fn().mockResolvedValue([
      {
        filename: 'auto-backup-2024-01-15T10-00-00.json',
        createdAt: Date.now() - 86400000,
        size: 15000,
      },
      {
        filename: 'auto-backup-2024-01-14T10-00-00.json',
        createdAt: Date.now() - 172800000,
        size: 14500,
      },
    ]);

    mockBackupService.exportBackup = jest.fn().mockResolvedValue(
      JSON.stringify({
        version: 2,
        exportedAt: Date.now(),
        appVersion: '1.0.0',
        includesCredentials: false,
        checksum: 'abc123',
        data: {},
      })
    );

    mockBackupService.previewImport = jest.fn().mockResolvedValue({
      valid: true,
      exportedAt: Date.now(),
      appVersion: '1.0.0',
      includesCredentials: false,
      checksumValid: true,
      summary: {
        albumMappings: { new: 5, existing: 3 },
        artistMappings: { new: 2, existing: 1 },
        historyArtistMappings: { new: 0, existing: 0 },
        hiddenAlbums: { new: 1, existing: 0 },
        hiddenArtists: { new: 0, existing: 0 },
        localWantList: { new: 3, existing: 2 },
        vinylWatchList: { new: 0, existing: 0 },
        monitoredSellers: { new: 1, existing: 1 },
        artistMbidMappings: { new: 4, existing: 2 },
        hiddenReleases: { new: 0, existing: 0 },
        excludedArtists: { new: 0, existing: 0 },
        settingsWillMerge: true,
      },
    });

    mockBackupService.importBackup = jest.fn().mockResolvedValue({
      success: true,
      itemsAdded: 15,
      itemsUpdated: 8,
      settingsMerged: true,
      errors: [],
    });

    mockBackupService.runAutoBackup = jest.fn().mockResolvedValue(undefined);
    mockBackupService.deleteAutoBackup = jest.fn().mockResolvedValue(undefined);

    // Create Express app
    app = express();
    app.use(helmet());
    app.use(cors());
    app.use(express.json());

    // Mount backup routes
    app.use('/api/v1/backup', createBackupRouter(mockBackupService));
  });

  describe('GET /api/v1/backup/preview', () => {
    it('should return backup preview', async () => {
      const response = await request(app).get('/api/v1/backup/preview');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.albumMappingsCount).toBe(10);
      expect(response.body.data.hasUserSettings).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      mockBackupService.getBackupPreview.mockRejectedValue(
        new Error('Preview error')
      );

      const response = await request(app).get('/api/v1/backup/preview');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Preview error');
    });
  });

  describe('GET /api/v1/backup/settings', () => {
    it('should return backup settings', async () => {
      const response = await request(app).get('/api/v1/backup/settings');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.enabled).toBe(false);
      expect(response.body.data.frequency).toBe('weekly');
    });

    it('should handle errors gracefully', async () => {
      mockBackupService.getSettings.mockRejectedValue(
        new Error('Settings error')
      );

      const response = await request(app).get('/api/v1/backup/settings');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/v1/backup/settings', () => {
    it('should update backup settings', async () => {
      const response = await request(app).put('/api/v1/backup/settings').send({
        enabled: true,
        frequency: 'daily',
        retentionCount: 10,
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockBackupService.saveSettings).toHaveBeenCalledWith({
        enabled: true,
        frequency: 'daily',
        retentionCount: 10,
      });
    });

    it('should handle partial updates', async () => {
      const response = await request(app)
        .put('/api/v1/backup/settings')
        .send({ enabled: true });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockBackupService.saveSettings).toHaveBeenCalledWith({
        enabled: true,
      });
    });

    it('should handle errors gracefully', async () => {
      mockBackupService.saveSettings.mockRejectedValue(new Error('Save error'));

      const response = await request(app)
        .put('/api/v1/backup/settings')
        .send({ enabled: true });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/backup/auto-backups', () => {
    it('should return list of auto-backups', async () => {
      const response = await request(app).get('/api/v1/backup/auto-backups');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].filename).toContain('auto-backup');
    });

    it('should handle errors gracefully', async () => {
      mockBackupService.listAutoBackups.mockRejectedValue(
        new Error('List error')
      );

      const response = await request(app).get('/api/v1/backup/auto-backups');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/backup/export', () => {
    it('should export backup without credentials', async () => {
      const response = await request(app)
        .post('/api/v1/backup/export')
        .send({ includeCredentials: false });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(mockBackupService.exportBackup).toHaveBeenCalledWith({
        includeCredentials: false,
        password: undefined,
      });
    });

    it('should require password when including credentials', async () => {
      const response = await request(app)
        .post('/api/v1/backup/export')
        .send({ includeCredentials: true });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe(
        'Password is required when including credentials'
      );
    });

    it('should export backup with credentials when password provided', async () => {
      mockBackupService.exportBackup.mockResolvedValue(
        JSON.stringify({
          version: 2,
          exportedAt: Date.now(),
          appVersion: '1.0.0',
          includesCredentials: true,
          checksum: 'abc123',
          data: {},
        })
      );

      const response = await request(app).post('/api/v1/backup/export').send({
        includeCredentials: true,
        password: 'my-secure-password',
      });

      expect(response.status).toBe(200);
      expect(mockBackupService.exportBackup).toHaveBeenCalledWith({
        includeCredentials: true,
        password: 'my-secure-password',
      });
    });

    it('should handle errors gracefully', async () => {
      mockBackupService.exportBackup.mockRejectedValue(
        new Error('Export error')
      );

      const response = await request(app)
        .post('/api/v1/backup/export')
        .send({ includeCredentials: false });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/backup/import/preview', () => {
    it('should preview backup import', async () => {
      const backup = JSON.stringify({
        version: 2,
        exportedAt: Date.now(),
        appVersion: '1.0.0',
        includesCredentials: false,
        checksum: 'abc123',
        data: {},
      });

      const response = await request(app)
        .post('/api/v1/backup/import/preview')
        .send({ backup });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.valid).toBe(true);
      expect(response.body.data.summary.albumMappings.new).toBe(5);
    });

    it('should return 400 when backup content is missing', async () => {
      const response = await request(app)
        .post('/api/v1/backup/import/preview')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Backup content is required');
    });

    it('should handle errors gracefully', async () => {
      mockBackupService.previewImport.mockRejectedValue(
        new Error('Preview error')
      );

      const response = await request(app)
        .post('/api/v1/backup/import/preview')
        .send({ backup: '{}' });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/backup/import', () => {
    it('should import backup in merge mode', async () => {
      const backup = JSON.stringify({
        version: 2,
        exportedAt: Date.now(),
        appVersion: '1.0.0',
        includesCredentials: false,
        checksum: 'abc123',
        data: {},
      });

      const response = await request(app)
        .post('/api/v1/backup/import')
        .send({ backup, mode: 'merge' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.itemsAdded).toBe(15);
      expect(response.body.data.itemsUpdated).toBe(8);
      expect(mockBackupService.importBackup).toHaveBeenCalledWith(backup, {
        mode: 'merge',
        password: undefined,
      });
    });

    it('should import backup in replace mode', async () => {
      const backup = JSON.stringify({ version: 2 });

      const response = await request(app)
        .post('/api/v1/backup/import')
        .send({ backup, mode: 'replace' });

      expect(response.status).toBe(200);
      expect(mockBackupService.importBackup).toHaveBeenCalledWith(backup, {
        mode: 'replace',
        password: undefined,
      });
    });

    it('should return 400 when backup content is missing', async () => {
      const response = await request(app)
        .post('/api/v1/backup/import')
        .send({ mode: 'merge' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Backup content is required');
    });

    it('should return 400 when mode is invalid', async () => {
      const response = await request(app)
        .post('/api/v1/backup/import')
        .send({ backup: '{}', mode: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Mode must be "merge" or "replace"');
    });

    it('should return 400 when mode is missing', async () => {
      const response = await request(app)
        .post('/api/v1/backup/import')
        .send({ backup: '{}' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Mode must be "merge" or "replace"');
    });

    it('should return 400 when import fails', async () => {
      mockBackupService.importBackup.mockResolvedValue({
        success: false,
        itemsAdded: 0,
        itemsUpdated: 0,
        settingsMerged: false,
        errors: ['Checksum mismatch', 'Invalid format'],
      });

      const response = await request(app)
        .post('/api/v1/backup/import')
        .send({ backup: '{}', mode: 'merge' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Checksum mismatch, Invalid format');
    });

    it('should pass password for encrypted backups', async () => {
      const backup = JSON.stringify({
        version: 2,
        includesCredentials: true,
      });

      const response = await request(app)
        .post('/api/v1/backup/import')
        .send({ backup, mode: 'merge', password: 'my-password' });

      expect(response.status).toBe(200);
      expect(mockBackupService.importBackup).toHaveBeenCalledWith(backup, {
        mode: 'merge',
        password: 'my-password',
      });
    });

    it('should handle errors gracefully', async () => {
      mockBackupService.importBackup.mockRejectedValue(
        new Error('Import error')
      );

      const response = await request(app)
        .post('/api/v1/backup/import')
        .send({ backup: '{}', mode: 'merge' });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/backup/auto-backup/run', () => {
    it('should trigger auto-backup', async () => {
      const response = await request(app).post(
        '/api/v1/backup/auto-backup/run'
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Auto-backup completed');
      expect(mockBackupService.runAutoBackup).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockBackupService.runAutoBackup.mockRejectedValue(
        new Error('Auto-backup error')
      );

      const response = await request(app).post(
        '/api/v1/backup/auto-backup/run'
      );

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/v1/backup/auto-backups/:filename', () => {
    it('should delete auto-backup file', async () => {
      const response = await request(app).delete(
        '/api/v1/backup/auto-backups/auto-backup-2024-01-15T10-00-00.json'
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Backup deleted');
      expect(mockBackupService.deleteAutoBackup).toHaveBeenCalledWith(
        'auto-backup-2024-01-15T10-00-00.json'
      );
    });

    it('should return 400 for invalid filename', async () => {
      mockBackupService.deleteAutoBackup.mockRejectedValue(
        new Error('Invalid backup filename')
      );

      const response = await request(app).delete(
        '/api/v1/backup/auto-backups/invalid-file.json'
      );

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should return 500 for other errors', async () => {
      mockBackupService.deleteAutoBackup.mockRejectedValue(
        new Error('File not found')
      );

      const response = await request(app).delete(
        '/api/v1/backup/auto-backups/auto-backup-2024-01-15.json'
      );

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });
});
