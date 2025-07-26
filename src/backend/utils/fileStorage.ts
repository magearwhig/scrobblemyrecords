import * as fs from 'fs/promises';
import * as path from 'path';

export class FileStorage {
  private dataDir: string;

  constructor(dataDir: string = './data') {
    this.dataDir = dataDir;
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
      const fullPath = path.join(this.dataDir, filePath);
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
      const fullPath = path.join(this.dataDir, filePath);
      await fs.writeFile(fullPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error('Error writing JSON file:', error);
      throw error;
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      const fullPath = path.join(this.dataDir, filePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async delete(filePath: string): Promise<void> {
    try {
      const fullPath = path.join(this.dataDir, filePath);
      await fs.unlink(fullPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async listFiles(directory: string): Promise<string[]> {
    try {
      const fullPath = path.join(this.dataDir, directory);
      return await fs.readdir(fullPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }
}
