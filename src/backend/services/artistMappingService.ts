import * as fs from 'fs';
import * as path from 'path';

import { logger } from '../utils/logger';

export interface ArtistMapping {
  discogsName: string;
  lastfmName: string;
  dateAdded: number;
  lastUsed?: number;
}

export interface ArtistMappingData {
  mappings: ArtistMapping[];
  version: string;
  lastUpdated: number;
}

class ArtistMappingService {
  private mappingsFilePath: string;
  private mappingsCache: Map<string, string> = new Map();
  private isLoaded = false;

  constructor() {
    // Store mappings in a separate file from cache
    const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.mappingsFilePath = path.join(dataDir, 'artist-mappings.json');
    this.loadMappings();
  }

  private loadMappings(): void {
    try {
      if (fs.existsSync(this.mappingsFilePath)) {
        const data = fs.readFileSync(this.mappingsFilePath, 'utf8');
        const mappingData: ArtistMappingData = JSON.parse(data);

        this.mappingsCache.clear();
        mappingData.mappings.forEach(mapping => {
          this.mappingsCache.set(
            mapping.discogsName.toLowerCase(),
            mapping.lastfmName
          );
        });

        logger.info(`Loaded ${mappingData.mappings.length} artist mappings`);
      } else {
        logger.info(
          'No artist mappings file found, starting with empty mappings'
        );
      }
      this.isLoaded = true;
    } catch (error) {
      logger.error('Error loading artist mappings:', error);
      this.mappingsCache.clear();
      this.isLoaded = true;
    }
  }

  private saveMappings(): void {
    try {
      // Build mappings from cache, preserving existing metadata from file
      const mappings: ArtistMapping[] = [];
      const existingMappings = new Map<string, ArtistMapping>();

      // Read existing mappings to preserve metadata
      if (fs.existsSync(this.mappingsFilePath)) {
        try {
          const data = fs.readFileSync(this.mappingsFilePath, 'utf8');
          const mappingData: ArtistMappingData = JSON.parse(data);
          mappingData.mappings.forEach(m => {
            existingMappings.set(m.discogsName.toLowerCase(), m);
          });
        } catch (error) {
          logger.warn('Could not read existing mappings file:', error);
        }
      }

      // Build new mappings array from cache
      this.mappingsCache.forEach((lastfmName, discogsNameLower) => {
        const existing = existingMappings.get(discogsNameLower);
        mappings.push({
          discogsName: existing?.discogsName || discogsNameLower,
          lastfmName,
          dateAdded: existing?.dateAdded || Date.now(),
          lastUsed: existing?.lastUsed,
        });
      });

      const mappingData: ArtistMappingData = {
        mappings,
        version: '1.0',
        lastUpdated: Date.now(),
      };

      fs.writeFileSync(
        this.mappingsFilePath,
        JSON.stringify(mappingData, null, 2)
      );
      logger.info(`Saved ${mappings.length} artist mappings`);
    } catch (error) {
      logger.error('Error saving artist mappings:', error);
      throw new Error('Failed to save artist mappings');
    }
  }

  /**
   * Get the Last.fm name for a Discogs artist, or return the original name if no mapping exists
   */
  getLastfmName(discogsName: string): string {
    if (!this.isLoaded) {
      this.loadMappings();
    }

    const mappedName = this.mappingsCache.get(discogsName.toLowerCase());
    if (mappedName) {
      // Update last used timestamp
      this.updateLastUsed(discogsName);
      return mappedName;
    }

    return discogsName;
  }

  /**
   * Add or update an artist mapping
   */
  setMapping(discogsName: string, lastfmName: string): void {
    if (!discogsName || !lastfmName) {
      throw new Error('Both Discogs and Last.fm names are required');
    }

    this.mappingsCache.set(discogsName.toLowerCase(), lastfmName);
    this.saveMappings();
    logger.info(`Added/updated mapping: "${discogsName}" -> "${lastfmName}"`);
  }

  /**
   * Remove an artist mapping
   */
  removeMapping(discogsName: string): boolean {
    const existed = this.mappingsCache.delete(discogsName.toLowerCase());
    if (existed) {
      this.saveMappings();
      logger.info(`Removed mapping for: "${discogsName}"`);
    }
    return existed;
  }

  /**
   * Get all artist mappings
   */
  getAllMappings(): ArtistMapping[] {
    if (!this.isLoaded) {
      this.loadMappings();
    }

    const mappings: ArtistMapping[] = [];

    // Read from file to get full data including timestamps
    try {
      if (fs.existsSync(this.mappingsFilePath)) {
        const data = fs.readFileSync(this.mappingsFilePath, 'utf8');
        const mappingData: ArtistMappingData = JSON.parse(data);
        return mappingData.mappings;
      }
    } catch (error) {
      logger.error('Error reading mappings file:', error);
    }

    // Fallback: create from cache
    this.mappingsCache.forEach((lastfmName, discogsName) => {
      mappings.push({
        discogsName,
        lastfmName,
        dateAdded: Date.now(),
      });
    });

    return mappings;
  }

  /**
   * Update the last used timestamp for a mapping
   */
  private updateLastUsed(discogsName: string): void {
    try {
      if (fs.existsSync(this.mappingsFilePath)) {
        const data = fs.readFileSync(this.mappingsFilePath, 'utf8');
        const mappingData: ArtistMappingData = JSON.parse(data);

        const mapping = mappingData.mappings.find(
          m => m.discogsName.toLowerCase() === discogsName.toLowerCase()
        );

        if (mapping) {
          mapping.lastUsed = Date.now();
          fs.writeFileSync(
            this.mappingsFilePath,
            JSON.stringify(mappingData, null, 2)
          );
        }
      }
    } catch (error) {
      // Don't throw on this non-critical operation
      logger.warn('Error updating last used timestamp:', error);
    }
  }

  /**
   * Import mappings from JSON data
   */
  importMappings(mappings: ArtistMapping[]): {
    imported: number;
    skipped: number;
    errors: string[];
  } {
    const result = { imported: 0, skipped: 0, errors: [] as string[] };

    mappings.forEach((mapping, index) => {
      try {
        if (!mapping.discogsName || !mapping.lastfmName) {
          result.errors.push(`Mapping ${index + 1}: Missing required fields`);
          result.skipped++;
          return;
        }

        this.mappingsCache.set(
          mapping.discogsName.toLowerCase(),
          mapping.lastfmName
        );
        result.imported++;
      } catch (error) {
        result.errors.push(
          `Mapping ${index + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        result.skipped++;
      }
    });

    if (result.imported > 0) {
      this.saveMappings();
    }

    return result;
  }

  /**
   * Export mappings as JSON
   */
  exportMappings(): ArtistMappingData {
    return {
      mappings: this.getAllMappings(),
      version: '1.0',
      lastUpdated: Date.now(),
    };
  }

  /**
   * Clear all mappings
   */
  clearAllMappings(): void {
    this.mappingsCache.clear();
    this.saveMappings();
    logger.info('Cleared all artist mappings');
  }

  /**
   * Check if a mapping exists for the given Discogs name
   */
  hasMapping(discogsName: string): boolean {
    if (!this.isLoaded) {
      this.loadMappings();
    }
    return this.mappingsCache.has(discogsName.toLowerCase());
  }

  /**
   * Get mapping statistics
   */
  getStats(): {
    totalMappings: number;
    filePath: string;
    lastUpdated?: number;
  } {
    const mappings = this.getAllMappings();
    return {
      totalMappings: mappings.length,
      filePath: this.mappingsFilePath,
      lastUpdated:
        mappings.length > 0
          ? Math.max(...mappings.map(m => m.dateAdded))
          : undefined,
    };
  }
}

export const artistMappingService = new ArtistMappingService();
