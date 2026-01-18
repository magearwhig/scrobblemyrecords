import * as fs from 'fs/promises';

import { MigrationService } from '../../src/backend/services/migrationService';
import { FileStorage } from '../../src/backend/utils/fileStorage';

describe('MigrationService', () => {
  const testDataDir = './test-data-migration';
  let fileStorage: FileStorage;
  let migrationService: MigrationService;

  beforeEach(async () => {
    // Create fresh instances for each test
    fileStorage = new FileStorage(testDataDir);
    await fileStorage.ensureDataDir();
    migrationService = new MigrationService(fileStorage);
  });

  afterEach(async () => {
    // Clean up test data directory
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch {
      // Ignore errors if directory doesn't exist
    }
  });

  describe('getCurrentVersion', () => {
    it('should return current version for known file key', () => {
      // Act
      const version = migrationService.getCurrentVersion('user-settings');

      // Assert
      expect(version).toBe(1);
    });

    it('should return 1 for unknown file key', () => {
      // Act
      const version = migrationService.getCurrentVersion('unknown-file');

      // Assert
      expect(version).toBe(1);
    });

    it('should return version for all registered files', () => {
      // Arrange
      const registeredFiles = migrationService.getRegisteredFiles();

      // Act & Assert
      registeredFiles.forEach(key => {
        const version = migrationService.getCurrentVersion(key);
        expect(version).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('getRegisteredFiles', () => {
    it('should return list of registered file keys', () => {
      // Act
      const files = migrationService.getRegisteredFiles();

      // Assert
      expect(files).toBeInstanceOf(Array);
      expect(files.length).toBeGreaterThan(0);
    });

    it('should include critical data files', () => {
      // Act
      const files = migrationService.getRegisteredFiles();

      // Assert
      expect(files).toContain('scrobble-history-index');
      expect(files).toContain('user-settings');
    });

    it('should include all expected categories', () => {
      // Act
      const files = migrationService.getRegisteredFiles();

      // Assert - Check for files from each category
      // Settings
      expect(files).toContain('user-settings');
      expect(files).toContain('ai-settings');

      // Mappings
      expect(files).toContain('artist-mappings');
      expect(files).toContain('album-mappings');

      // Discovery
      expect(files).toContain('hidden-albums');

      // Wishlist
      expect(files).toContain('wishlist-items');

      // Sellers
      expect(files).toContain('monitored-sellers');
    });
  });

  describe('checkFileStatus', () => {
    it('should return exists: false for non-existent file', async () => {
      // Act
      const status = await migrationService.checkFileStatus('user-settings');

      // Assert
      expect(status.exists).toBe(false);
      expect(status.currentVersion).toBeNull();
      expect(status.expectedVersion).toBe(1);
      expect(status.needsMigration).toBe(false);
    });

    it('should return correct status for file without schemaVersion', async () => {
      // Arrange - Create file without schemaVersion
      await fs.mkdir(`${testDataDir}/settings`, { recursive: true });
      await fs.writeFile(
        `${testDataDir}/settings/user-settings.json`,
        JSON.stringify({ discogs: {}, lastfm: {} })
      );

      // Act
      const status = await migrationService.checkFileStatus('user-settings');

      // Assert
      expect(status.exists).toBe(true);
      expect(status.currentVersion).toBe(0);
      expect(status.expectedVersion).toBe(1);
      expect(status.needsMigration).toBe(true);
    });

    it('should return correct status for file with schemaVersion', async () => {
      // Arrange - Create file with schemaVersion
      await fs.mkdir(`${testDataDir}/settings`, { recursive: true });
      await fs.writeFile(
        `${testDataDir}/settings/user-settings.json`,
        JSON.stringify({ schemaVersion: 1, discogs: {}, lastfm: {} })
      );

      // Act
      const status = await migrationService.checkFileStatus('user-settings');

      // Assert
      expect(status.exists).toBe(true);
      expect(status.currentVersion).toBe(1);
      expect(status.expectedVersion).toBe(1);
      expect(status.needsMigration).toBe(false);
    });

    it('should throw for unknown file key', async () => {
      // Act & Assert
      await expect(
        migrationService.checkFileStatus('unknown-key')
      ).rejects.toThrow('Unknown data file key: unknown-key');
    });
  });

  describe('loadWithMigration', () => {
    it('should return null for non-existent file', async () => {
      // Act
      const result = await migrationService.loadWithMigration('user-settings');

      // Assert
      expect(result).toBeNull();
    });

    it('should stamp file without schemaVersion with version 1', async () => {
      // Arrange - Create file without schemaVersion
      await fs.mkdir(`${testDataDir}/settings`, { recursive: true });
      const originalData = { discogs: { token: 'test' }, lastfm: {} };
      await fs.writeFile(
        `${testDataDir}/settings/user-settings.json`,
        JSON.stringify(originalData)
      );

      // Act
      const result = await migrationService.loadWithMigration('user-settings');

      // Assert
      expect(result).not.toBeNull();
      expect(result?.schemaVersion).toBe(1);

      // Verify file was updated
      const fileContent = await fs.readFile(
        `${testDataDir}/settings/user-settings.json`,
        'utf-8'
      );
      const parsedContent = JSON.parse(fileContent);
      expect(parsedContent.schemaVersion).toBe(1);
    });

    it('should preserve all existing data when stamping', async () => {
      // Arrange - Create file with existing data
      await fs.mkdir(`${testDataDir}/settings`, { recursive: true });
      const originalData = {
        discogs: { token: 'my-token', username: 'testuser' },
        lastfm: { sessionKey: 'session123' },
        preferences: { batchSize: 50 },
      };
      await fs.writeFile(
        `${testDataDir}/settings/user-settings.json`,
        JSON.stringify(originalData)
      );

      // Act
      const result = await migrationService.loadWithMigration('user-settings');

      // Assert - All original data preserved
      expect(result).toMatchObject(originalData);
      expect(result?.schemaVersion).toBe(1);
    });

    it('should return data as-is if already at current version', async () => {
      // Arrange - Create file with current version
      await fs.mkdir(`${testDataDir}/settings`, { recursive: true });
      const data = {
        schemaVersion: 1,
        discogs: { token: 'test' },
        lastfm: {},
      };
      await fs.writeFile(
        `${testDataDir}/settings/user-settings.json`,
        JSON.stringify(data)
      );

      // Act
      const result = await migrationService.loadWithMigration('user-settings');

      // Assert
      expect(result).toEqual(data);
    });

    it('should throw for unknown file key', async () => {
      // Act & Assert
      await expect(
        migrationService.loadWithMigration('unknown-key')
      ).rejects.toThrow('Unknown data file key: unknown-key');
    });

    it('should throw for future version', async () => {
      // Arrange - Create file with future version
      await fs.mkdir(`${testDataDir}/settings`, { recursive: true });
      const data = {
        schemaVersion: 99,
        discogs: {},
        lastfm: {},
      };
      await fs.writeFile(
        `${testDataDir}/settings/user-settings.json`,
        JSON.stringify(data)
      );

      // Act & Assert
      await expect(
        migrationService.loadWithMigration('user-settings')
      ).rejects.toThrow(/schemaVersion 99.*only supports up to v1/);
    });

    it('should create backup when migrating', async () => {
      // Arrange - Create file without schemaVersion
      await fs.mkdir(`${testDataDir}/settings`, { recursive: true });
      await fs.writeFile(
        `${testDataDir}/settings/user-settings.json`,
        JSON.stringify({ discogs: {} })
      );

      // Act
      await migrationService.loadWithMigration('user-settings');

      // Assert - Check for backup file
      const files = await fs.readdir(`${testDataDir}/settings`);
      const backupFiles = files.filter(
        f => f.includes('-backup-') && f.endsWith('.bak')
      );
      expect(backupFiles.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('migrateAllOnStartup', () => {
    it('should return report with correct structure', async () => {
      // Act
      const report = await migrationService.migrateAllOnStartup();

      // Assert
      expect(report).toHaveProperty('checked');
      expect(report).toHaveProperty('migrated');
      expect(report).toHaveProperty('stamped');
      expect(report).toHaveProperty('errors');
      expect(report).toHaveProperty('startTime');
      expect(report).toHaveProperty('endTime');
      expect(report.endTime).toBeGreaterThanOrEqual(report.startTime);
    });

    it('should handle empty data directory', async () => {
      // Act
      const report = await migrationService.migrateAllOnStartup();

      // Assert
      expect(report.checked).toBe(0);
      expect(report.migrated).toBe(0);
      expect(report.stamped).toBe(0);
      expect(report.errors).toEqual([]);
    });

    it('should stamp files without schemaVersion', async () => {
      // Arrange - Create file without schemaVersion
      await fs.mkdir(`${testDataDir}/settings`, { recursive: true });
      await fs.writeFile(
        `${testDataDir}/settings/user-settings.json`,
        JSON.stringify({ discogs: {} })
      );

      // Act
      const report = await migrationService.migrateAllOnStartup();

      // Assert
      expect(report.checked).toBe(1);
      expect(report.stamped).toBe(1);
      expect(report.migrated).toBe(0);

      // Verify file was stamped
      const content = JSON.parse(
        await fs.readFile(`${testDataDir}/settings/user-settings.json`, 'utf-8')
      );
      expect(content.schemaVersion).toBe(1);
    });

    it('should skip files that already have schemaVersion', async () => {
      // Arrange - Create file with schemaVersion
      await fs.mkdir(`${testDataDir}/settings`, { recursive: true });
      await fs.writeFile(
        `${testDataDir}/settings/user-settings.json`,
        JSON.stringify({ schemaVersion: 1, discogs: {} })
      );

      // Act
      const report = await migrationService.migrateAllOnStartup();

      // Assert
      expect(report.checked).toBe(1);
      expect(report.stamped).toBe(0);
      expect(report.migrated).toBe(0);
    });

    it('should call progress callback', async () => {
      // Arrange
      await fs.mkdir(`${testDataDir}/settings`, { recursive: true });
      await fs.writeFile(
        `${testDataDir}/settings/user-settings.json`,
        JSON.stringify({ discogs: {} })
      );

      const progressCalls: Array<{ file: string; status: string }> = [];
      const progressCallback = (file: string, status: string) => {
        progressCalls.push({ file, status });
      };

      // Act
      await migrationService.migrateAllOnStartup(progressCallback);

      // Assert
      expect(progressCalls.length).toBeGreaterThan(0);
      expect(progressCalls.some(c => c.file === 'user-settings')).toBe(true);
      expect(progressCalls.some(c => c.status === 'checking')).toBe(true);
    });

    it('should handle multiple files', async () => {
      // Arrange - Create multiple files
      await fs.mkdir(`${testDataDir}/settings`, { recursive: true });
      await fs.mkdir(`${testDataDir}/mappings`, { recursive: true });

      await fs.writeFile(
        `${testDataDir}/settings/user-settings.json`,
        JSON.stringify({ discogs: {} })
      );
      await fs.writeFile(
        `${testDataDir}/mappings/artist-mappings.json`,
        JSON.stringify({ mappings: [] })
      );

      // Act
      const report = await migrationService.migrateAllOnStartup();

      // Assert
      expect(report.checked).toBe(2);
      expect(report.stamped).toBe(2);
    });

    it('should continue on error and report it', async () => {
      // Arrange - Create invalid JSON file
      await fs.mkdir(`${testDataDir}/settings`, { recursive: true });
      await fs.writeFile(
        `${testDataDir}/settings/user-settings.json`,
        'not valid json'
      );

      // Also create a valid file
      await fs.mkdir(`${testDataDir}/mappings`, { recursive: true });
      await fs.writeFile(
        `${testDataDir}/mappings/artist-mappings.json`,
        JSON.stringify({ mappings: [] })
      );

      // Act
      const report = await migrationService.migrateAllOnStartup();

      // Assert
      expect(report.errors.length).toBe(1);
      expect(report.errors[0].file).toBe('user-settings');
      // Should still process other files
      expect(report.checked).toBeGreaterThanOrEqual(1);
    });
  });

  describe('data preservation', () => {
    it('should preserve complex nested data structures', async () => {
      // Arrange - Create file with complex nested data
      await fs.mkdir(`${testDataDir}/history`, { recursive: true });
      const complexData = {
        lastSyncTimestamp: 1768709524000,
        totalScrobbles: 52232,
        oldestScrobbleDate: 1108339019,
        albums: {
          'artist|album': {
            lastPlayed: 1768705983,
            playCount: 18,
            plays: [
              { timestamp: 1768362364, track: 'Track 1' },
              { timestamp: 1768362183, track: 'Track 2' },
            ],
          },
          'another|album': {
            lastPlayed: 1768600000,
            playCount: 5,
            plays: [],
          },
        },
      };
      await fs.writeFile(
        `${testDataDir}/history/scrobble-history-index.json`,
        JSON.stringify(complexData)
      );

      // Act
      const result = await migrationService.loadWithMigration(
        'scrobble-history-index'
      );

      // Assert - All nested data preserved
      expect(result?.schemaVersion).toBe(1);
      expect(result).toMatchObject(complexData);
    });

    it('should preserve array data', async () => {
      // Arrange
      await fs.mkdir(`${testDataDir}/sellers`, { recursive: true });
      const arrayData = {
        sellers: [
          {
            username: 'seller1',
            displayName: 'Seller One',
            addedAt: 1768682866907,
          },
          {
            username: 'seller2',
            displayName: 'Seller Two',
            addedAt: 1768682866908,
          },
        ],
      };
      await fs.writeFile(
        `${testDataDir}/sellers/monitored-sellers.json`,
        JSON.stringify(arrayData)
      );

      // Act
      const result =
        await migrationService.loadWithMigration('monitored-sellers');

      // Assert
      expect(result?.schemaVersion).toBe(1);
      expect(result).toMatchObject(arrayData);
    });
  });
});
