import * as fs from 'fs/promises';
import * as path from 'path';

export class FileStorage {
  private dataDir: string;
  // Strict allowlist pattern for file/directory names
  private readonly SAFE_PATH_PATTERN = /^[a-zA-Z0-9_-]+$/;
  private readonly SAFE_FILENAME_PATTERN = /^[a-zA-Z0-9_-]+\.(json|txt|md)$/;

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
}
