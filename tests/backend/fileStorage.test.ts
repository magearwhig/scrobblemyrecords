import * as fs from 'fs/promises';
import * as path from 'path';

import { FileStorage } from '../../src/backend/utils/fileStorage';

describe('FileStorage', () => {
  let fileStorage: FileStorage;
  const testDataDir = './test-data';

  beforeEach(async () => {
    fileStorage = new FileStorage(testDataDir);
    await fileStorage.ensureDataDir();
  });

  afterEach(async () => {
    // Clean up test data
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors if directory doesn't exist
    }
  });

  describe('ensureDataDir', () => {
    it('should create data directories', async () => {
      await fileStorage.ensureDataDir();

      const collectionsDir = path.join(testDataDir, 'collections');
      const settingsDir = path.join(testDataDir, 'settings');
      const scrobblesDir = path.join(testDataDir, 'scrobbles');

      await expect(fs.access(collectionsDir)).resolves.toBeUndefined();
      await expect(fs.access(settingsDir)).resolves.toBeUndefined();
      await expect(fs.access(scrobblesDir)).resolves.toBeUndefined();
    });
  });

  describe('writeJSON and readJSON', () => {
    it('should write and read JSON data', async () => {
      const testData = { test: 'value', number: 42 };
      const filePath = 'test.json';

      await fileStorage.writeJSON(filePath, testData);
      const result = await fileStorage.readJSON(filePath);

      expect(result).toEqual(testData);
    });

    it('should return null for non-existent files', async () => {
      const result = await fileStorage.readJSON('non-existent.json');
      expect(result).toBeNull();
    });

    it('should handle complex nested objects', async () => {
      const testData = {
        user: {
          name: 'Test User',
          settings: {
            theme: 'dark',
            notifications: true,
          },
        },
        items: [1, 2, 3],
      };

      await fileStorage.writeJSON('complex.json', testData);
      const result = await fileStorage.readJSON('complex.json');

      expect(result).toEqual(testData);
    });
  });

  describe('exists', () => {
    it('should return true for existing files', async () => {
      await fileStorage.writeJSON('exists.json', { data: 'test' });
      const exists = await fileStorage.exists('exists.json');
      expect(exists).toBe(true);
    });

    it('should return false for non-existent files', async () => {
      const exists = await fileStorage.exists('does-not-exist.json');
      expect(exists).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete existing files', async () => {
      await fileStorage.writeJSON('to-delete.json', { data: 'test' });

      let exists = await fileStorage.exists('to-delete.json');
      expect(exists).toBe(true);

      await fileStorage.delete('to-delete.json');

      exists = await fileStorage.exists('to-delete.json');
      expect(exists).toBe(false);
    });

    it('should not throw error when deleting non-existent files', async () => {
      await expect(
        fileStorage.delete('non-existent.json')
      ).resolves.toBeUndefined();
    });
  });

  describe('listFiles', () => {
    it('should list files in directory', async () => {
      await fileStorage.writeJSON('settings/file1.json', { data: 1 });
      await fileStorage.writeJSON('settings/file2.json', { data: 2 });

      const files = await fileStorage.listFiles('settings');
      expect(files).toHaveLength(2);
      expect(files).toContain('file1.json');
      expect(files).toContain('file2.json');
    });

    it('should return empty array for non-existent directory', async () => {
      const files = await fileStorage.listFiles('non-existent');
      expect(files).toEqual([]);
    });
  });
});
