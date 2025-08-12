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

  describe('Security Validation', () => {
    describe('Path Traversal Prevention', () => {
      it('should reject path traversal with ../', async () => {
        await expect(
          fileStorage.writeJSON('../malicious.json', { data: 'hack' })
        ).rejects.toThrow('Invalid path component: ..');
      });

      it('should reject path traversal with ../../', async () => {
        await expect(fileStorage.readJSON('../../etc/passwd')).rejects.toThrow(
          'Invalid path component: ..'
        );
      });

      it('should reject absolute paths', async () => {
        await expect(
          fileStorage.writeJSON('/etc/malicious.json', { data: 'hack' })
        ).rejects.toThrow('Path traversal attempt detected');
      });

      it('should reject backslash path separators', async () => {
        await expect(
          fileStorage.writeJSON('..\\malicious.json', { data: 'hack' })
        ).rejects.toThrow('Invalid path component: ..\\malicious.json');
      });

      it('should reject forward slash in path components', async () => {
        await expect(
          fileStorage.writeJSON('settings/../../malicious.json', {
            data: 'hack',
          })
        ).rejects.toThrow('Invalid path component: ..');
      });

      it('should reject mixed path separators', async () => {
        await expect(
          fileStorage.writeJSON('settings\\..\\malicious.json', {
            data: 'hack',
          })
        ).rejects.toThrow(
          'Invalid path component: settings\\..\\malicious.json'
        );
      });
    });

    describe('Filename Validation', () => {
      it('should accept valid filenames', async () => {
        await expect(
          fileStorage.writeJSON('valid-file_123.json', { data: 'test' })
        ).resolves.toBeUndefined();
      });

      it('should accept valid directory names', async () => {
        await expect(
          fileStorage.writeJSON('valid-dir_123/file.json', { data: 'test' })
        ).resolves.toBeUndefined();
      });

      it('should accept multiple slashes (they get filtered out)', async () => {
        await expect(
          fileStorage.writeJSON('valid//empty.json', { data: 'test' })
        ).resolves.toBeUndefined();

        const result = await fileStorage.readJSON('valid/empty.json');
        expect(result).toEqual({ data: 'test' });
      });

      it('should reject filenames with special characters', async () => {
        await expect(
          fileStorage.writeJSON('file@name.json', { data: 'test' })
        ).rejects.toThrow('Invalid filename format: file@name.json');
      });

      it('should reject filenames with spaces', async () => {
        await expect(
          fileStorage.writeJSON('file name.json', { data: 'test' })
        ).rejects.toThrow('Invalid filename format: file name.json');
      });

      it('should reject unsupported file extensions', async () => {
        await expect(
          fileStorage.writeJSON('malicious.exe', { data: 'test' })
        ).rejects.toThrow('Invalid filename format: malicious.exe');
      });

      it('should reject directory names with special characters', async () => {
        await expect(
          fileStorage.writeJSON('dir@name/file.json', { data: 'test' })
        ).rejects.toThrow('Invalid path format: dir@name');
      });

      it('should reject directory names with spaces', async () => {
        await expect(
          fileStorage.writeJSON('dir name/file.json', { data: 'test' })
        ).rejects.toThrow('Invalid path format: dir name');
      });
    });
  });

  describe('Error Handling Edge Cases', () => {
    it('should handle JSON parsing errors gracefully', async () => {
      // Write invalid JSON directly to file system
      const filePath = path.join(testDataDir, 'invalid.json');
      await fs.writeFile(filePath, 'invalid json content', 'utf-8');

      await expect(fileStorage.readJSON('invalid.json')).rejects.toThrow();
    });

    it('should handle write permission errors', async () => {
      // This test would require setting up permission restrictions
      // For now, we'll test that the error propagates correctly
      const invalidStorage = new FileStorage(
        '/invalid-path/that-cannot-be-created'
      );

      await expect(
        invalidStorage.writeJSON('test.json', { data: 'test' })
      ).rejects.toThrow();
    });

    it('should handle directory creation for nested paths', async () => {
      await fileStorage.writeJSON('deep/nested/path/file.json', {
        data: 'test',
      });

      const result = await fileStorage.readJSON('deep/nested/path/file.json');
      expect(result).toEqual({ data: 'test' });
    });

    it('should handle concurrent writes to the same directory', async () => {
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          fileStorage.writeJSON(`concurrent/file${i}.json`, { id: i })
        );
      }

      await expect(Promise.all(promises)).resolves.toBeDefined();

      // Verify all files were created
      for (let i = 0; i < 5; i++) {
        const result = await fileStorage.readJSON(`concurrent/file${i}.json`);
        expect(result).toEqual({ id: i });
      }
    });

    it('should handle listFiles on file instead of directory', async () => {
      await fileStorage.writeJSON('single-file.json', { data: 'test' });

      await expect(fileStorage.listFiles('single-file.json')).rejects.toThrow();
    });

    it('should handle delete on directory path', async () => {
      await fileStorage.writeJSON('directory/file.json', { data: 'test' });

      // Attempting to delete a directory as if it were a file should fail
      await expect(fileStorage.delete('directory')).rejects.toThrow();
    });
  });

  describe('Data Integrity', () => {
    it('should preserve data types in JSON round trip', async () => {
      const testData = {
        string: 'test',
        number: 42,
        boolean: true,
        null: null,
        array: [1, 2, 3],
        nested: { key: 'value' },
      };

      await fileStorage.writeJSON('types.json', testData);
      const result = await fileStorage.readJSON('types.json');

      expect(result).toEqual(testData);
      expect(typeof (result as any).string).toBe('string');
      expect(typeof (result as any).number).toBe('number');
      expect(typeof (result as any).boolean).toBe('boolean');
      expect((result as any).null).toBeNull();
      expect(Array.isArray((result as any).array)).toBe(true);
    });

    it('should handle large JSON objects', async () => {
      const largeData = {
        items: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          data: Array.from({ length: 10 }, (_, j) => `data-${i}-${j}`),
        })),
      };

      await fileStorage.writeJSON('large.json', largeData);
      const result = await fileStorage.readJSON('large.json');

      expect(result).toEqual(largeData);
      expect((result as any).items).toHaveLength(1000);
    });

    it('should handle Unicode characters in JSON', async () => {
      const unicodeData = {
        emoji: '🎵🎶',
        chinese: '音乐',
        japanese: '音楽',
        korean: '음악',
        special: 'café naïve résumé',
      };

      await fileStorage.writeJSON('unicode.json', unicodeData);
      const result = await fileStorage.readJSON('unicode.json');

      expect(result).toEqual(unicodeData);
    });
  });
});
