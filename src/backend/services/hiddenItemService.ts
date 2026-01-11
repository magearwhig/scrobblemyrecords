import { HiddenAlbum, HiddenArtist } from '../../shared/types';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

const HIDDEN_ALBUMS_FILE = 'discovery/hidden-albums.json';
const HIDDEN_ARTISTS_FILE = 'discovery/hidden-artists.json';

/**
 * Service for managing hidden items in Discovery page.
 * Items can be hidden (e.g., podcasts, compilations) to declutter discovery.
 */
export class HiddenItemService {
  private fileStorage: FileStorage;
  private logger = createLogger('HiddenItemService');

  // Cached hidden items for fast lookup
  private hiddenAlbums: Map<string, HiddenAlbum> = new Map();
  private hiddenArtists: Map<string, HiddenArtist> = new Map();
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
   * Load hidden items from disk
   */
  async loadHiddenItems(): Promise<void> {
    if (this.loaded) return;

    try {
      const albumData =
        await this.fileStorage.readJSON<HiddenAlbum[]>(HIDDEN_ALBUMS_FILE);
      if (albumData) {
        for (const item of albumData) {
          const key = this.albumKey(item.artist, item.album);
          this.hiddenAlbums.set(key, item);
        }
        this.logger.info(`Loaded ${albumData.length} hidden albums`);
      }
    } catch {
      this.logger.debug('No hidden albums file found');
    }

    try {
      const artistData =
        await this.fileStorage.readJSON<HiddenArtist[]>(HIDDEN_ARTISTS_FILE);
      if (artistData) {
        for (const item of artistData) {
          const key = this.artistKey(item.artist);
          this.hiddenArtists.set(key, item);
        }
        this.logger.info(`Loaded ${artistData.length} hidden artists`);
      }
    } catch {
      this.logger.debug('No hidden artists file found');
    }

    this.loaded = true;
  }

  /**
   * Save hidden items to disk
   */
  private async saveHiddenItems(): Promise<void> {
    await this.fileStorage.writeJSON(
      HIDDEN_ALBUMS_FILE,
      Array.from(this.hiddenAlbums.values())
    );
    await this.fileStorage.writeJSON(
      HIDDEN_ARTISTS_FILE,
      Array.from(this.hiddenArtists.values())
    );
  }

  /**
   * Hide an album from Discovery
   */
  async hideAlbum(artist: string, album: string): Promise<void> {
    await this.loadHiddenItems();

    const key = this.albumKey(artist, album);
    const hiddenItem: HiddenAlbum = {
      artist,
      album,
      hiddenAt: Date.now(),
    };

    this.hiddenAlbums.set(key, hiddenItem);
    await this.saveHiddenItems();

    this.logger.info(`Hidden album: "${artist}" - "${album}"`);
  }

  /**
   * Hide an artist from Discovery
   */
  async hideArtist(artist: string): Promise<void> {
    await this.loadHiddenItems();

    const key = this.artistKey(artist);
    const hiddenItem: HiddenArtist = {
      artist,
      hiddenAt: Date.now(),
    };

    this.hiddenArtists.set(key, hiddenItem);
    await this.saveHiddenItems();

    this.logger.info(`Hidden artist: "${artist}"`);
  }

  /**
   * Unhide an album
   */
  async unhideAlbum(artist: string, album: string): Promise<boolean> {
    await this.loadHiddenItems();

    const key = this.albumKey(artist, album);
    const removed = this.hiddenAlbums.delete(key);

    if (removed) {
      await this.saveHiddenItems();
      this.logger.info(`Unhidden album: "${artist}" - "${album}"`);
    }

    return removed;
  }

  /**
   * Unhide an artist
   */
  async unhideArtist(artist: string): Promise<boolean> {
    await this.loadHiddenItems();

    const key = this.artistKey(artist);
    const removed = this.hiddenArtists.delete(key);

    if (removed) {
      await this.saveHiddenItems();
      this.logger.info(`Unhidden artist: "${artist}"`);
    }

    return removed;
  }

  /**
   * Check if an album is hidden
   */
  async isAlbumHidden(artist: string, album: string): Promise<boolean> {
    await this.loadHiddenItems();
    const key = this.albumKey(artist, album);
    return this.hiddenAlbums.has(key);
  }

  /**
   * Check if an artist is hidden
   */
  async isArtistHidden(artist: string): Promise<boolean> {
    await this.loadHiddenItems();
    const key = this.artistKey(artist);
    return this.hiddenArtists.has(key);
  }

  /**
   * Get all hidden albums
   */
  async getAllHiddenAlbums(): Promise<HiddenAlbum[]> {
    await this.loadHiddenItems();
    return Array.from(this.hiddenAlbums.values());
  }

  /**
   * Get all hidden artists
   */
  async getAllHiddenArtists(): Promise<HiddenArtist[]> {
    await this.loadHiddenItems();
    return Array.from(this.hiddenArtists.values());
  }

  /**
   * Clear all hidden albums
   */
  async clearHiddenAlbums(): Promise<void> {
    await this.loadHiddenItems();
    this.hiddenAlbums.clear();
    await this.saveHiddenItems();
    this.logger.info('Cleared all hidden albums');
  }

  /**
   * Clear all hidden artists
   */
  async clearHiddenArtists(): Promise<void> {
    await this.loadHiddenItems();
    this.hiddenArtists.clear();
    await this.saveHiddenItems();
    this.logger.info('Cleared all hidden artists');
  }

  /**
   * Get counts of hidden items
   */
  async getHiddenCounts(): Promise<{ albums: number; artists: number }> {
    await this.loadHiddenItems();
    return {
      albums: this.hiddenAlbums.size,
      artists: this.hiddenArtists.size,
    };
  }
}
