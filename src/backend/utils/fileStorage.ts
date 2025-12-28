import * as fs from 'fs/promises';
import * as path from 'path';

export class FileStorage {
  private dataDir: string;
  // Strict allowlist pattern for file/directory names
  private readonly SAFE_PATH_PATTERN = /^[a-zA-Z0-9_-]+$/;
  private readonly SAFE_FILENAME_PATTERN =
    /^[a-zA-Z0-9_-]+\.(json|txt|md|bak)$/;
  // Maximum number of backup files to keep per original file
  private readonly MAX_BACKUPS = 3;

  constructor(dataDir: string = './data') {
    this.dataDir = path.resolve(dataDir);
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
      console.error('Error creating data directories:', error);
      throw error;
    }
  }

  async readJSON<T>(filePath: string): Promise<T | null> {
    try {
      const fullPath = this.validateAndResolvePath(filePath);
      const data = await fs.readFile(fullPath, 'utf-8');
      return JSON.parse(data) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async writeJSON<T>(filePath: string, data: T): Promise<void> {
    try {
      const fullPath = this.validateAndResolvePath(filePath);
      // Ensure parent directory exists
      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(fullPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error('Error writing JSON file:', error);
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
      return await fs.readdir(fullPath);
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
      const backupName = `${baseName}-backup-${timestamp}${ext}.bak`;
      const backupPath = path.join(dir, backupName);

      // Copy the file to backup
      await fs.copyFile(fullPath, backupPath);

      // Clean up old backups (keep only MAX_BACKUPS most recent)
      await this.cleanupOldBackups(dir, baseName, ext);

      return backupPath;
    } catch (error) {
      console.error('Error creating backup:', error);
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
