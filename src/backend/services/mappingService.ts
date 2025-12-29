import { AlbumMapping, ArtistMapping } from '../../shared/types';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

const ALBUM_MAPPINGS_FILE = 'mappings/album-mappings.json';
const ARTIST_MAPPINGS_FILE = 'mappings/artist-mappings.json';

/**
 * Service for managing manual mappings between Last.fm and Discogs naming.
 */
export class MappingService {
  private fileStorage: FileStorage;
  private logger = createLogger('MappingService');

  // Cached mappings for fast lookup
  private albumMappings: Map<string, AlbumMapping> = new Map();
  private artistMappings: Map<string, ArtistMapping> = new Map();
  private loaded = false;

  constructor(fileStorage: FileStorage) {
    this.fileStorage = fileStorage;
  }

  /**
   * Create a normalized key for album lookup
   */
  private albumKey(artist: string, album: string): string {
    return `${artist.toLowerCase().trim()}|${album.toLowerCase().trim()}`;
  }

  /**
   * Create a normalized key for artist lookup
   */
  private artistKey(artist: string): string {
    return artist.toLowerCase().trim();
  }

  /**
   * Load mappings from disk
   */
  async loadMappings(): Promise<void> {
    if (this.loaded) return;

    try {
      const albumData =
        await this.fileStorage.readJSON<AlbumMapping[]>(ALBUM_MAPPINGS_FILE);
      if (albumData) {
        for (const mapping of albumData) {
          const key = this.albumKey(
            mapping.historyArtist,
            mapping.historyAlbum
          );
          this.albumMappings.set(key, mapping);
        }
        this.logger.info(`Loaded ${albumData.length} album mappings`);
      }
    } catch {
      this.logger.debug('No album mappings file found');
    }

    try {
      const artistData =
        await this.fileStorage.readJSON<ArtistMapping[]>(ARTIST_MAPPINGS_FILE);
      if (artistData) {
        for (const mapping of artistData) {
          const key = this.artistKey(mapping.historyArtist);
          this.artistMappings.set(key, mapping);
        }
        this.logger.info(`Loaded ${artistData.length} artist mappings`);
      }
    } catch {
      this.logger.debug('No artist mappings file found');
    }

    this.loaded = true;
  }

  /**
   * Save mappings to disk
   */
  private async saveMappings(): Promise<void> {
    await this.fileStorage.writeJSON(
      ALBUM_MAPPINGS_FILE,
      Array.from(this.albumMappings.values())
    );
    await this.fileStorage.writeJSON(
      ARTIST_MAPPINGS_FILE,
      Array.from(this.artistMappings.values())
    );
  }

  /**
   * Add or update an album mapping
   */
  async addAlbumMapping(
    mapping: Omit<AlbumMapping, 'createdAt'>
  ): Promise<void> {
    await this.loadMappings();

    const key = this.albumKey(mapping.historyArtist, mapping.historyAlbum);
    const fullMapping: AlbumMapping = {
      ...mapping,
      createdAt: Date.now(),
    };

    this.albumMappings.set(key, fullMapping);
    await this.saveMappings();

    this.logger.info(
      `Added album mapping: "${mapping.historyArtist}|${mapping.historyAlbum}" -> "${mapping.collectionArtist}|${mapping.collectionAlbum}"`
    );
  }

  /**
   * Add or update an artist mapping
   */
  async addArtistMapping(
    mapping: Omit<ArtistMapping, 'createdAt'>
  ): Promise<void> {
    await this.loadMappings();

    const key = this.artistKey(mapping.historyArtist);
    const fullMapping: ArtistMapping = {
      ...mapping,
      createdAt: Date.now(),
    };

    this.artistMappings.set(key, fullMapping);
    await this.saveMappings();

    this.logger.info(
      `Added artist mapping: "${mapping.historyArtist}" -> "${mapping.collectionArtist}"`
    );
  }

  /**
   * Remove an album mapping
   */
  async removeAlbumMapping(
    historyArtist: string,
    historyAlbum: string
  ): Promise<boolean> {
    await this.loadMappings();

    const key = this.albumKey(historyArtist, historyAlbum);
    const removed = this.albumMappings.delete(key);

    if (removed) {
      await this.saveMappings();
      this.logger.info(
        `Removed album mapping: "${historyArtist}|${historyAlbum}"`
      );
    }

    return removed;
  }

  /**
   * Remove an artist mapping
   */
  async removeArtistMapping(historyArtist: string): Promise<boolean> {
    await this.loadMappings();

    const key = this.artistKey(historyArtist);
    const removed = this.artistMappings.delete(key);

    if (removed) {
      await this.saveMappings();
      this.logger.info(`Removed artist mapping: "${historyArtist}"`);
    }

    return removed;
  }

  /**
   * Get album mapping if it exists
   */
  async getAlbumMapping(
    historyArtist: string,
    historyAlbum: string
  ): Promise<AlbumMapping | null> {
    await this.loadMappings();

    const key = this.albumKey(historyArtist, historyAlbum);
    return this.albumMappings.get(key) || null;
  }

  /**
   * Get artist mapping if it exists
   */
  async getArtistMapping(historyArtist: string): Promise<ArtistMapping | null> {
    await this.loadMappings();

    const key = this.artistKey(historyArtist);
    return this.artistMappings.get(key) || null;
  }

  /**
   * Check if an album has a manual mapping
   */
  async hasAlbumMapping(
    historyArtist: string,
    historyAlbum: string
  ): Promise<boolean> {
    const mapping = await this.getAlbumMapping(historyArtist, historyAlbum);
    return mapping !== null;
  }

  /**
   * Check if an artist has a manual mapping
   */
  async hasArtistMapping(historyArtist: string): Promise<boolean> {
    const mapping = await this.getArtistMapping(historyArtist);
    return mapping !== null;
  }

  /**
   * Get all album mappings
   */
  async getAllAlbumMappings(): Promise<AlbumMapping[]> {
    await this.loadMappings();
    return Array.from(this.albumMappings.values());
  }

  /**
   * Get all artist mappings
   */
  async getAllArtistMappings(): Promise<ArtistMapping[]> {
    await this.loadMappings();
    return Array.from(this.artistMappings.values());
  }
}
