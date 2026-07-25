import { randomUUID } from 'crypto';
import type { FileHandle } from 'fs/promises';
import * as fs from 'fs/promises';
import * as path from 'path';

import {
  atomicWriteFile,
  isTempFileName,
  syncDirectory,
  tempPathFor,
} from './atomicWrite';
import { resolveDataDir } from './dataDir';
import { createLogger } from './logger';

const log = createLogger('FileStorage');

export class FileStorage {
  private dataDir: string;
  // Strict allowlist pattern for file/directory names
  private readonly SAFE_PATH_PATTERN = /^[a-zA-Z0-9_-]+$/;
  private readonly SAFE_FILENAME_PATTERN =
    /^[a-zA-Z0-9_-]+\.(json|txt|md|bak)$/;
  // Maximum number of backup files to keep per original file
  private readonly MAX_BACKUPS = 10;

  constructor(dataDir: string = resolveDataDir()) {
    this.dataDir = path.resolve(dataDir);
  }

  /**
   * The absolute data directory this instance is bound to.
   *
   * For callers that need to walk the tree directly rather than address a
   * known path — they must operate on *this* instance's directory, not on
   * whatever the global DATA_DIR happens to be.
   */
  getDataDir(): string {
    return this.dataDir;
  }

  /**
   * Validates that a path component (directory or filename) is safe
   */
  private validatePathComponent(component: string): void {
    if (!component) {
      throw new Error('Path component cannot be empty');
    }

    // Check for path traversal attempts
    if (
      component.includes('..') ||
      component.includes('/') ||
      component.includes('\\')
    ) {
      throw new Error(`Invalid path component: ${component}`);
    }

    // For files with extensions, use filename pattern
    if (component.includes('.')) {
      if (!this.SAFE_FILENAME_PATTERN.test(component)) {
        throw new Error(`Invalid filename format: ${component}`);
      }
    } else {
      // For directories or files without extensions
      if (!this.SAFE_PATH_PATTERN.test(component)) {
        throw new Error(`Invalid path format: ${component}`);
      }
    }
  }

  /**
   * Validates and resolves a file path, ensuring it stays within dataDir
   */
  private validateAndResolvePath(filePath: string): string {
    // Split the path and validate each component
    const pathParts = filePath.split('/').filter(part => part.length > 0);

    // Validate each part of the path
    pathParts.forEach(part => this.validatePathComponent(part));

    // Resolve the full path
    const fullPath = path.resolve(this.dataDir, filePath);
    const resolvedDataDir = path.resolve(this.dataDir);

    // Ensure the resolved path is within dataDir
    if (
      !fullPath.startsWith(resolvedDataDir + path.sep) &&
      fullPath !== resolvedDataDir
    ) {
      throw new Error('Path traversal attempt detected');
    }

    return fullPath;
  }

  async ensureDataDir(): Promise<void> {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      await fs.mkdir(path.join(this.dataDir, 'collections'), {
        recursive: true,
      });
      await fs.mkdir(path.join(this.dataDir, 'settings'), { recursive: true });
      await fs.mkdir(path.join(this.dataDir, 'scrobbles'), { recursive: true });
    } catch (error) {
      log.error('Error creating data directories', error);
      throw error;
    }
  }

  async readJSON<T>(filePath: string): Promise<T | null> {
    try {
      const fullPath = this.validateAndResolvePath(filePath);
      const data = await fs.readFile(fullPath, 'utf-8');
      try {
        return JSON.parse(data) as T;
      } catch (parseError) {
        log.error('JSON parse error — file may be corrupted, returning null', {
          filePath,
          error: parseError,
        });
        return null;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Caches that can be rebuilt from an external API or recomputed from data we
   * still hold. These skip fsync: the write stays atomic — never torn, never
   * truncated by a process crash — but a power loss may lose the most recent
   * entry, which just means refetching it.
   *
   * fsync costs ~10ms/write versus ~0.24ms without it. These are the paths
   * written in hot loops (ImageService rewrites its entire cover cache once per
   * image fetched), so the distinction is worth seconds on a large sync.
   *
   * Anything not listed here is treated as irreplaceable user data and written
   * durably. When in doubt, leave it off this list.
   */
  private readonly REGENERABLE_CACHES: readonly string[] = [
    'images/album-covers.json',
    'images/artist-images.json',
    'wishlist/versions-cache.json',
    'releases/collection-artists-cache.json',
    'cache/artist-tags.json',
    'collection-analytics/value-cache.json',
    'sellers/inventory-cache/', // trailing slash = directory prefix
  ];

  private isRegenerableCache(filePath: string): boolean {
    const normalized = filePath.replace(/^\.?\//, '');
    return this.REGENERABLE_CACHES.some(cache =>
      cache.endsWith('/') ? normalized.startsWith(cache) : normalized === cache
    );
  }

  async writeJSON<T>(
    filePath: string,
    data: T,
    options: { durable?: boolean } = {}
  ): Promise<void> {
    try {
      const fullPath = this.validateAndResolvePath(filePath);
      // Ensure parent directory exists. mkdir returns the topmost directory it
      // actually created, or undefined if everything already existed.
      const dir = path.dirname(fullPath);
      const createdRoot = await fs.mkdir(dir, { recursive: true });

      // Temp file + atomic rename: a crash mid-write must never leave a
      // truncated authoritative file behind. See utils/atomicWrite.ts.
      const durable = options.durable ?? !this.isRegenerableCache(filePath);
      await atomicWriteFile(fullPath, JSON.stringify(data, null, 2), {
        durable,
      });

      // atomicWriteFile syncs the file's own directory, but a directory created
      // just now has an entry in ITS parent that was never synced — power loss
      // could take the whole new directory, file included.
      if (durable && createdRoot) {
        await syncDirectory(path.dirname(createdRoot));
      }
    } catch (error) {
      log.error('Error writing JSON file', { filePath, error });
      throw error;
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      const fullPath = this.validateAndResolvePath(filePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async delete(filePath: string): Promise<void> {
    try {
      const fullPath = this.validateAndResolvePath(filePath);
      await fs.unlink(fullPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async listFiles(directory: string): Promise<string[]> {
    try {
      const fullPath = this.validateAndResolvePath(directory);
      const entries = await fs.readdir(fullPath);
      // Hide in-flight atomic writes. Callers scan these listings and read what
      // they find; a temp file is a partial write by definition.
      return entries.filter(name => !isTempFileName(name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Creates a backup of a file before modification.
   * Keeps up to MAX_BACKUPS rotated backups with timestamps.
   */
  async createBackup(filePath: string): Promise<string | null> {
    try {
      const fullPath = this.validateAndResolvePath(filePath);

      // Check if original file exists
      try {
        await fs.access(fullPath);
      } catch {
        // No file to backup
        return null;
      }

      const dir = path.dirname(fullPath);
      const ext = path.extname(fullPath);
      const baseName = path.basename(fullPath, ext);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      // A millisecond timestamp alone is not unique: two concurrent backups of
      // the same file collide on the destination and corrupt each other's copy.
      // The random suffix comes after the timestamp so the name sort in
      // cleanupOldBackups() still orders chronologically.
      const suffix = randomUUID().slice(0, 8);
      const backupName = `${baseName}-backup-${timestamp}-${suffix}${ext}.bak`;
      const backupPath = path.join(dir, backupName);

      // Copy to a temp file, fsync it, then rename — fs.copyFile offers no
      // atomicity guarantee, and a backup is exactly the thing that must not be
      // half-written or lost to a power cut. Backups are always durable; the
      // regenerable-cache exemption does not apply to them.
      const tempBackupPath = tempPathFor(backupPath);
      let backupHandle: FileHandle | undefined;
      try {
        await fs.copyFile(fullPath, tempBackupPath);
        backupHandle = await fs.open(tempBackupPath, 'r+');
        await backupHandle.sync();
        await backupHandle.close();
        backupHandle = undefined;
        await fs.rename(tempBackupPath, backupPath);
      } catch (error) {
        if (backupHandle) await backupHandle.close().catch(() => undefined);
        await fs.unlink(tempBackupPath).catch(() => undefined);
        throw error;
      }
      await syncDirectory(dir);

      // Clean up old backups (keep only MAX_BACKUPS most recent)
      await this.cleanupOldBackups(dir, baseName, ext);

      return backupPath;
    } catch (error) {
      log.error('Error creating backup', { filePath, error });
      // Don't throw - backup failure shouldn't prevent the operation
      return null;
    }
  }

  /**
   * Removes old backup files, keeping only the most recent ones.
   */
  private async cleanupOldBackups(
    dir: string,
    baseName: string,
    ext: string
  ): Promise<void> {
    try {
      const files = await fs.readdir(dir);
      const backupPattern = new RegExp(
        `^${baseName}-backup-.*${ext.replace('.', '\\.')}\\.bak$`
      );

      const backups = files
        .filter(f => backupPattern.test(f))
        .map(f => ({
          name: f,
          path: path.join(dir, f),
        }))
        .sort((a, b) => b.name.localeCompare(a.name)); // Newest first (timestamp in name)

      // Remove backups beyond MAX_BACKUPS
      for (let i = this.MAX_BACKUPS; i < backups.length; i++) {
        try {
          await fs.unlink(backups[i].path);
        } catch {
          // Ignore cleanup errors
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Writes JSON with automatic backup of existing file.
   * Use this for critical files like settings.
   */
  async writeJSONWithBackup<T>(filePath: string, data: T): Promise<void> {
    // Create backup before writing
    await this.createBackup(filePath);

    // Then write normally
    await this.writeJSON(filePath, data);
  }

  /**
   * Reads raw file content as string.
   */
  async readRaw(filePath: string): Promise<string | null> {
    try {
      const fullPath = this.validateAndResolvePath(filePath);
      return await fs.readFile(fullPath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Gets file stats (for checking if file exists and its modification time).
   */
  async getStats(
    filePath: string
  ): Promise<{ exists: boolean; mtime?: Date; size?: number }> {
    try {
      const fullPath = this.validateAndResolvePath(filePath);
      const stats = await fs.stat(fullPath);
      return {
        exists: true,
        mtime: stats.mtime,
        size: stats.size,
      };
    } catch {
      return { exists: false };
    }
  }
}
