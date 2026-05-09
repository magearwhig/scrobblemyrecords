import {
  AlbumMapping,
  CompoundArtistMapping,
  CompoundArtistMappingsStore,
} from '../../shared/types';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

const COMPOUND_MAPPINGS_FILE = 'mappings/compound-artist-mappings.json';

const COMPOUND_SEPARATORS = [', ', ' & ', ' and ', ' x ', ' X '];

const log = createLogger('CompoundArtistMappingService');

/**
 * Interface for dependency injection / testing.
 */
export interface CompoundArtistMappingServiceLike {
  getAllMappings(): Promise<CompoundArtistMapping[]>;
  getMapping(compoundName: string): Promise<CompoundArtistMapping | null>;
}

/**
 * Persists 1-to-N mappings from compound artist names to their individual
 * component artists. E.g. "Danny Brown (2), Jane Remover" → ["Danny Brown", "Jane Remover"].
 *
 * Follows the same lazy-load + writeJSONWithBackup pattern as MappingService.
 */
export class CompoundArtistMappingService
  implements CompoundArtistMappingServiceLike
{
  private fileStorage: FileStorage;
  private mappings: Map<string, CompoundArtistMapping> = new Map();
  private loaded = false;

  constructor(fileStorage: FileStorage) {
    this.fileStorage = fileStorage;
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  private key(compoundName: string): string {
    return compoundName.toLowerCase().trim();
  }

  async load(): Promise<void> {
    if (this.loaded) return;

    try {
      const raw = await this.fileStorage.readJSON<CompoundArtistMappingsStore>(
        COMPOUND_MAPPINGS_FILE
      );
      if (raw?.mappings) {
        for (const mapping of raw.mappings) {
          this.mappings.set(this.key(mapping.compoundName), mapping);
        }
        log.info(`Loaded ${raw.mappings.length} compound artist mappings`);
      }
    } catch {
      log.debug('No compound artist mappings file found');
    }

    this.loaded = true;
  }

  private async save(): Promise<void> {
    const store: CompoundArtistMappingsStore = {
      schemaVersion: 1,
      mappings: Array.from(this.mappings.values()),
    };
    await this.fileStorage.writeJSONWithBackup(COMPOUND_MAPPINGS_FILE, store);
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async getAllMappings(): Promise<CompoundArtistMapping[]> {
    await this.load();
    return Array.from(this.mappings.values());
  }

  async getMapping(
    compoundName: string
  ): Promise<CompoundArtistMapping | null> {
    await this.load();
    return this.mappings.get(this.key(compoundName)) ?? null;
  }

  async addMapping(
    compoundName: string,
    components: string[],
    autoDetected = false
  ): Promise<void> {
    await this.load();

    const mapping: CompoundArtistMapping = {
      compoundName,
      components,
      autoDetected,
      createdAt: Date.now(),
    };

    this.mappings.set(this.key(compoundName), mapping);
    await this.save();

    log.info(
      `Added compound mapping: "${compoundName}" → [${components.join(', ')}]`
    );
  }

  async removeMapping(compoundName: string): Promise<boolean> {
    await this.load();

    const removed = this.mappings.delete(this.key(compoundName));
    if (removed) {
      await this.save();
      log.info(`Removed compound mapping: "${compoundName}"`);
    }
    return removed;
  }

  // ---------------------------------------------------------------------------
  // Auto-detection
  // ---------------------------------------------------------------------------

  /**
   * Strips trailing Discogs disambiguation suffixes like " (2)" from a name.
   */
  private stripDisambiguation(name: string): string {
    return name.replace(/\s+\(\d+\)$/, '');
  }

  /**
   * Detect compound artist names from album mappings and persist any that
   * are not already stored. Only creates mappings marked `autoDetected: true`.
   *
   * Returns the number of newly detected mappings.
   */
  async autoDetectFromAlbumMappings(
    albumMappings: AlbumMapping[]
  ): Promise<number> {
    await this.load();

    let detected = 0;

    for (const mapping of albumMappings) {
      const name = mapping.historyArtist;
      if (!name) continue;

      // Check if name contains a compound separator
      const sep = COMPOUND_SEPARATORS.find(s => name.includes(s));
      if (!sep) continue;

      const k = this.key(name);
      if (this.mappings.has(k)) continue; // already known

      const parts = name
        .split(sep)
        .map(p => this.stripDisambiguation(p.trim()))
        .filter(p => p.length > 0);

      if (parts.length <= 1) continue;

      const newMapping: CompoundArtistMapping = {
        compoundName: name,
        components: parts,
        autoDetected: true,
        createdAt: Date.now(),
      };
      this.mappings.set(k, newMapping);
      detected++;
    }

    if (detected > 0) {
      await this.save();
      log.info(`Auto-detected ${detected} compound artist mappings`);
    }

    return detected;
  }
}

/**
 * Returns true if the given name looks like a compound artist.
 */
export function isCompoundArtistName(name: string): boolean {
  return COMPOUND_SEPARATORS.some(sep => name.includes(sep));
}
