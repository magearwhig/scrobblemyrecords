import { CollectionItem } from '../../shared/types';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

import { LastFmService } from './lastfmService';

const ALBUM_COVERS_CACHE = 'images/album-covers.json';
const ARTIST_IMAGES_CACHE = 'images/artist-images.json';

// Cache TTL: 30 days in milliseconds
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface ImageCacheEntry {
  url: string | null;
  fetchedAt: number;
}

interface ImageCache {
  schemaVersion: 1;
  entries: Record<string, ImageCacheEntry>;
}

/**
 * Service for fetching and caching album covers and artist images.
 *
 * Image sources (priority order):
 * 1. Discogs collection cache (already have cover URLs)
 * 2. Last.fm API (album.getInfo / artist.getInfo)
 * 3. Placeholder/fallback
 */
export class ImageService {
  private fileStorage: FileStorage;
  private lastfmService: LastFmService;
  private logger = createLogger('ImageService');

  // In-memory caches for performance
  private albumCoverCache: Map<string, ImageCacheEntry> = new Map();
  private artistImageCache: Map<string, ImageCacheEntry> = new Map();
  private cacheLoaded = false;

  constructor(fileStorage: FileStorage, lastfmService: LastFmService) {
    this.fileStorage = fileStorage;
    this.lastfmService = lastfmService;
  }

  /**
   * Get album cover URL
   * Returns null if no cover available
   */
  async getAlbumCover(artist: string, album: string): Promise<string | null> {
    await this.ensureCacheLoaded();

    const key = this.normalizeKey(artist, album);
    const cached = this.albumCoverCache.get(key);

    // Return cached value if not expired
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.url;
    }

    // Fetch from Last.fm
    try {
      const url = await this.fetchAlbumCoverFromLastFm(artist, album);
      await this.cacheAlbumCover(artist, album, url);
      return url;
    } catch (error) {
      this.logger.error('Error fetching album cover', { artist, album, error });
      // Cache the failure to avoid repeated requests
      await this.cacheAlbumCover(artist, album, null);
      return null;
    }
  }

  /**
   * Get artist image URL
   * Returns null if no image available
   */
  async getArtistImage(artistName: string): Promise<string | null> {
    await this.ensureCacheLoaded();

    const key = this.normalizeArtistKey(artistName);
    const cached = this.artistImageCache.get(key);

    // Return cached value if not expired
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.url;
    }

    // Fetch from Last.fm
    try {
      const url = await this.fetchArtistImageFromLastFm(artistName);
      await this.cacheArtistImage(artistName, url);
      return url;
    } catch (error) {
      this.logger.error('Error fetching artist image', {
        artist: artistName,
        error,
      });
      // Cache the failure to avoid repeated requests
      await this.cacheArtistImage(artistName, null);
      return null;
    }
  }

  /**
   * Get album cover from collection (if available)
   */
  getAlbumCoverFromCollection(
    collection: CollectionItem[],
    artist: string,
    album: string
  ): string | null {
    const normalizedArtist = artist.toLowerCase().trim();
    const normalizedAlbum = album.toLowerCase().trim();

    for (const item of collection) {
      if (
        item.release.artist.toLowerCase().trim() === normalizedArtist &&
        item.release.title.toLowerCase().trim() === normalizedAlbum
      ) {
        return item.release.cover_image || null;
      }
    }

    return null;
  }

  /**
   * Batch fetch images for multiple albums
   */
  async batchGetAlbumCovers(
    requests: Array<{ artist: string; album: string }>
  ): Promise<Map<string, string | null>> {
    const results = new Map<string, string | null>();

    // Process in batches to avoid rate limiting
    const batchSize = 5;
    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      const promises = batch.map(async ({ artist, album }) => {
        const url = await this.getAlbumCover(artist, album);
        results.set(this.normalizeKey(artist, album), url);
      });

      await Promise.all(promises);

      // Small delay between batches
      if (i + batchSize < requests.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  /**
   * Batch fetch images for multiple artists
   */
  async batchGetArtistImages(
    artistNames: string[]
  ): Promise<Map<string, string | null>> {
    const results = new Map<string, string | null>();

    // Process in batches to avoid rate limiting
    const batchSize = 5;
    for (let i = 0; i < artistNames.length; i += batchSize) {
      const batch = artistNames.slice(i, i + batchSize);
      const promises = batch.map(async artistName => {
        const url = await this.getArtistImage(artistName);
        results.set(this.normalizeArtistKey(artistName), url);
      });

      await Promise.all(promises);

      // Small delay between batches
      if (i + batchSize < artistNames.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  /**
   * Clean up expired cache entries
   */
  async cleanupExpiredCache(): Promise<{
    albumsRemoved: number;
    artistsRemoved: number;
  }> {
    await this.ensureCacheLoaded();
    const now = Date.now();

    let albumsRemoved = 0;
    let artistsRemoved = 0;

    // Clean album covers
    for (const [key, entry] of this.albumCoverCache.entries()) {
      if (now - entry.fetchedAt > CACHE_TTL_MS) {
        this.albumCoverCache.delete(key);
        albumsRemoved++;
      }
    }

    // Clean artist images
    for (const [key, entry] of this.artistImageCache.entries()) {
      if (now - entry.fetchedAt > CACHE_TTL_MS) {
        this.artistImageCache.delete(key);
        artistsRemoved++;
      }
    }

    // Persist cleaned caches
    await this.persistCaches();

    this.logger.info(
      `Cleaned up ${albumsRemoved} album and ${artistsRemoved} artist cache entries`
    );

    return { albumsRemoved, artistsRemoved };
  }

  // ============================================
  // Private Methods
  // ============================================

  private normalizeKey(artist: string, album: string): string {
    return `${artist.toLowerCase().trim()}|${album.toLowerCase().trim()}`;
  }

  private normalizeArtistKey(artist: string): string {
    return artist.toLowerCase().trim();
  }

  private async ensureCacheLoaded(): Promise<void> {
    if (this.cacheLoaded) return;

    try {
      const albumCache =
        await this.fileStorage.readJSON<ImageCache>(ALBUM_COVERS_CACHE);
      if (albumCache?.entries) {
        for (const [key, entry] of Object.entries(albumCache.entries)) {
          this.albumCoverCache.set(key, entry);
        }
      }

      const artistCache =
        await this.fileStorage.readJSON<ImageCache>(ARTIST_IMAGES_CACHE);
      if (artistCache?.entries) {
        for (const [key, entry] of Object.entries(artistCache.entries)) {
          this.artistImageCache.set(key, entry);
        }
      }
    } catch (error) {
      this.logger.warn('Error loading image cache', error);
    }

    this.cacheLoaded = true;
  }

  private async cacheAlbumCover(
    artist: string,
    album: string,
    url: string | null
  ): Promise<void> {
    const key = this.normalizeKey(artist, album);
    this.albumCoverCache.set(key, {
      url,
      fetchedAt: Date.now(),
    });

    // Persist to disk (debounced in production, immediate here)
    await this.persistAlbumCache();
  }

  private async cacheArtistImage(
    artistName: string,
    url: string | null
  ): Promise<void> {
    const key = this.normalizeArtistKey(artistName);
    this.artistImageCache.set(key, {
      url,
      fetchedAt: Date.now(),
    });

    // Persist to disk
    await this.persistArtistCache();
  }

  private async persistAlbumCache(): Promise<void> {
    try {
      const entries: Record<string, ImageCacheEntry> = {};
      for (const [key, entry] of this.albumCoverCache.entries()) {
        entries[key] = entry;
      }

      await this.fileStorage.writeJSON<ImageCache>(ALBUM_COVERS_CACHE, {
        schemaVersion: 1,
        entries,
      });
    } catch (error) {
      this.logger.error('Error persisting album cache', error);
    }
  }

  private async persistArtistCache(): Promise<void> {
    try {
      const entries: Record<string, ImageCacheEntry> = {};
      for (const [key, entry] of this.artistImageCache.entries()) {
        entries[key] = entry;
      }

      await this.fileStorage.writeJSON<ImageCache>(ARTIST_IMAGES_CACHE, {
        schemaVersion: 1,
        entries,
      });
    } catch (error) {
      this.logger.error('Error persisting artist cache', error);
    }
  }

  private async persistCaches(): Promise<void> {
    await Promise.all([this.persistAlbumCache(), this.persistArtistCache()]);
  }

  private async fetchAlbumCoverFromLastFm(
    artist: string,
    album: string
  ): Promise<string | null> {
    try {
      const albumInfo = await this.lastfmService.getAlbumInfo(artist, album);

      if (albumInfo?.image) {
        // Get the largest available image
        const images = albumInfo.image;
        // Last.fm returns array of images by size
        const extralarge = images.find(
          (img: { size: string; '#text': string }) => img.size === 'extralarge'
        );
        const large = images.find(
          (img: { size: string; '#text': string }) => img.size === 'large'
        );
        const medium = images.find(
          (img: { size: string; '#text': string }) => img.size === 'medium'
        );

        const imageUrl =
          extralarge?.['#text'] || large?.['#text'] || medium?.['#text'];

        // Last.fm returns empty string for placeholder images
        if (imageUrl && imageUrl !== '') {
          return imageUrl;
        }
      }

      return null;
    } catch {
      this.logger.debug('Failed to fetch album info from Last.fm', {
        artist,
        album,
      });
      return null;
    }
  }

  private async fetchArtistImageFromLastFm(
    artistName: string
  ): Promise<string | null> {
    try {
      const artistInfo = await this.lastfmService.getArtistInfo(artistName);

      if (artistInfo?.image) {
        // Get the largest available image
        const images = artistInfo.image;
        const extralarge = images.find(
          (img: { size: string; '#text': string }) => img.size === 'extralarge'
        );
        const large = images.find(
          (img: { size: string; '#text': string }) => img.size === 'large'
        );
        const medium = images.find(
          (img: { size: string; '#text': string }) => img.size === 'medium'
        );

        const imageUrl =
          extralarge?.['#text'] || large?.['#text'] || medium?.['#text'];

        // Last.fm returns empty string for placeholder images
        if (imageUrl && imageUrl !== '') {
          return imageUrl;
        }
      }

      return null;
    } catch {
      this.logger.debug('Failed to fetch artist info from Last.fm', {
        artist: artistName,
      });
      return null;
    }
  }
}
