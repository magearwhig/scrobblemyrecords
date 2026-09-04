import * as path from 'path';

import { resolveDataDir } from '../../../src/backend/utils/dataDir';

/**
 * These tests guard the guard. resolveDataDir() is the single thing standing
 * between the test suite and the developer's real data/ directory — importing
 * src/server.ts kicks off migrations, cleanup and auto-backup at module load,
 * so a regression here silently mutates real files.
 */
describe('resolveDataDir', () => {
  const savedDataDir = process.env.DATA_DIR;
  const savedNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.DATA_DIR = savedDataDir;
    process.env.NODE_ENV = savedNodeEnv;
  });

  describe('in the test environment', () => {
    it('resolves the temp directory provided by tests/setupEnv.ts', () => {
      expect(resolveDataDir()).toBe(path.resolve(savedDataDir as string));
    });

    it('returns an absolute path outside the repository', () => {
      const resolved = resolveDataDir();
      expect(path.isAbsolute(resolved)).toBe(true);
      expect(resolved.startsWith(process.cwd() + path.sep)).toBe(false);
    });

    it('throws when DATA_DIR is unset rather than falling back to ./data', () => {
      delete process.env.DATA_DIR;
      expect(() => resolveDataDir()).toThrow(/DATA_DIR is not set/);
    });

    it('throws when DATA_DIR points at the real data directory', () => {
      process.env.DATA_DIR = path.join(process.cwd(), 'data');
      expect(() => resolveDataDir()).toThrow(/real data directory/);
    });

    it('throws for a relative ./data as well as an absolute one', () => {
      process.env.DATA_DIR = './data';
      expect(() => resolveDataDir()).toThrow(/real data directory/);
    });

    it('allows other relative directories', () => {
      process.env.DATA_DIR = './test-data-something';
      expect(resolveDataDir()).toBe(
        path.resolve(process.cwd(), 'test-data-something')
      );
    });
  });

  describe('outside the test environment', () => {
    it('defaults to ./data when DATA_DIR is unset', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.DATA_DIR;
      expect(resolveDataDir()).toBe(path.resolve(process.cwd(), 'data'));
    });

    it('honours DATA_DIR without applying the test guard', () => {
      process.env.NODE_ENV = 'production';
      process.env.DATA_DIR = '/var/lib/listenography';
      expect(resolveDataDir()).toBe(path.resolve('/var/lib/listenography'));
    });
  });
});
