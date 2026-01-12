import { ImageService } from '../../src/backend/services/imageService';
import { LastFmService } from '../../src/backend/services/lastfmService';
import { FileStorage } from '../../src/backend/utils/fileStorage';
import { CollectionItem } from '../../src/shared/types';

// Mock dependencies
jest.mock('../../src/backend/services/lastfmService');
jest.mock('../../src/backend/utils/fileStorage');

describe('ImageService', () => {
  let imageService: ImageService;
  let mockFileStorage: jest.Mocked<FileStorage>;
  let mockLastFmService: jest.Mocked<LastFmService>;

  // Factory for creating mock collection items
  const createMockCollectionItem = (
    overrides: Partial<{
      id: number;
      artist: string;
      title: string;
      coverImage: string;
    }> = {}
  ): CollectionItem => ({
    id: overrides.id ?? 123,
    date_added: '2024-01-15T00:00:00Z',
    rating: 0,
    release: {
      id: overrides.id ?? 123,
      title: overrides.title ?? 'Test Album',
      artist: overrides.artist ?? 'Test Artist',
      year: 2021,
      format: ['Vinyl', 'LP'],
      label: ['Test Label'],
      cover_image: overrides.coverImage ?? 'https://example.com/cover.jpg',
      resource_url: 'https://api.discogs.com/releases/123',
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockFileStorage = {
      readJSON: jest.fn().mockResolvedValue(null),
      writeJSON: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<FileStorage>;

    mockLastFmService = {
      getAlbumInfo: jest.fn().mockResolvedValue(null),
      getArtistInfo: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<LastFmService>;

    imageService = new ImageService(mockFileStorage, mockLastFmService);
  });

  describe('getAlbumCover', () => {
    it('should return null when no cover found', async () => {
      // Arrange
      mockLastFmService.getAlbumInfo.mockResolvedValue(null);

      // Act
      const url = await imageService.getAlbumCover('Artist', 'Album');

      // Assert
      expect(url).toBeNull();
    });

    it('should fetch from Last.fm when not cached', async () => {
      // Arrange
      mockLastFmService.getAlbumInfo.mockResolvedValue({
        name: 'Album',
        artist: 'Artist',
        image: [
          { size: 'small', '#text': 'https://small.jpg' },
          { size: 'medium', '#text': 'https://medium.jpg' },
          { size: 'large', '#text': 'https://large.jpg' },
          { size: 'extralarge', '#text': 'https://extralarge.jpg' },
        ],
      });

      // Act
      const url = await imageService.getAlbumCover('Artist', 'Album');

      // Assert
      expect(url).toBe('https://extralarge.jpg');
      expect(mockLastFmService.getAlbumInfo).toHaveBeenCalledWith(
        'Artist',
        'Album'
      );
    });

    it('should use cached value when available', async () => {
      // Arrange - pre-populate cache by loading from file
      mockFileStorage.readJSON.mockResolvedValueOnce({
        schemaVersion: 1,
        entries: {
          'artist|album': {
            url: 'https://cached.jpg',
            fetchedAt: Date.now(), // Not expired
          },
        },
      });

      // Act - first call loads cache
      const url = await imageService.getAlbumCover('Artist', 'Album');

      // Assert
      expect(url).toBe('https://cached.jpg');
      expect(mockLastFmService.getAlbumInfo).not.toHaveBeenCalled();
    });

    it('should refetch when cache is expired', async () => {
      // Arrange - pre-populate cache with expired entry
      const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
      mockFileStorage.readJSON.mockResolvedValueOnce({
        schemaVersion: 1,
        entries: {
          'artist|album': {
            url: 'https://old.jpg',
            fetchedAt: thirtyOneDaysAgo,
          },
        },
      });

      mockLastFmService.getAlbumInfo.mockResolvedValue({
        name: 'Album',
        artist: 'Artist',
        image: [{ size: 'large', '#text': 'https://new.jpg' }],
      });

      // Act
      const url = await imageService.getAlbumCover('Artist', 'Album');

      // Assert
      expect(url).toBe('https://new.jpg');
      expect(mockLastFmService.getAlbumInfo).toHaveBeenCalled();
    });

    it('should handle Last.fm errors gracefully', async () => {
      // Arrange
      mockLastFmService.getAlbumInfo.mockRejectedValue(new Error('API Error'));

      // Act
      const url = await imageService.getAlbumCover('Artist', 'Album');

      // Assert
      expect(url).toBeNull();
    });

    it('should ignore empty image URLs from Last.fm', async () => {
      // Arrange
      mockLastFmService.getAlbumInfo.mockResolvedValue({
        name: 'Album',
        artist: 'Artist',
        image: [
          { size: 'large', '#text': '' }, // Empty placeholder
        ],
      });

      // Act
      const url = await imageService.getAlbumCover('Artist', 'Album');

      // Assert
      expect(url).toBeNull();
    });
  });

  describe('getArtistImage', () => {
    it('should return null when no image found', async () => {
      // Arrange
      mockLastFmService.getArtistInfo.mockResolvedValue(null);

      // Act
      const url = await imageService.getArtistImage('Artist');

      // Assert
      expect(url).toBeNull();
    });

    it('should fetch from Last.fm when not cached', async () => {
      // Arrange
      mockLastFmService.getArtistInfo.mockResolvedValue({
        name: 'Artist',
        image: [
          { size: 'medium', '#text': 'https://medium.jpg' },
          { size: 'extralarge', '#text': 'https://extralarge.jpg' },
        ],
      });

      // Act
      const url = await imageService.getArtistImage('Artist');

      // Assert
      expect(url).toBe('https://extralarge.jpg');
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockLastFmService.getArtistInfo.mockRejectedValue(new Error('API Error'));

      // Act
      const url = await imageService.getArtistImage('Artist');

      // Assert
      expect(url).toBeNull();
    });
  });

  describe('getAlbumCoverFromCollection', () => {
    it('should return cover from collection', () => {
      // Arrange
      const collection = [
        createMockCollectionItem({
          artist: 'Test Artist',
          title: 'Test Album',
          coverImage: 'https://collection.jpg',
        }),
      ];

      // Act
      const url = imageService.getAlbumCoverFromCollection(
        collection,
        'Test Artist',
        'Test Album'
      );

      // Assert
      expect(url).toBe('https://collection.jpg');
    });

    it('should be case insensitive', () => {
      // Arrange
      const collection = [
        createMockCollectionItem({
          artist: 'Test Artist',
          title: 'Test Album',
          coverImage: 'https://collection.jpg',
        }),
      ];

      // Act
      const url = imageService.getAlbumCoverFromCollection(
        collection,
        'TEST ARTIST',
        'TEST ALBUM'
      );

      // Assert
      expect(url).toBe('https://collection.jpg');
    });

    it('should return null when not in collection', () => {
      // Arrange
      const collection = [
        createMockCollectionItem({
          artist: 'Other Artist',
          title: 'Other Album',
        }),
      ];

      // Act
      const url = imageService.getAlbumCoverFromCollection(
        collection,
        'Test Artist',
        'Test Album'
      );

      // Assert
      expect(url).toBeNull();
    });

    it('should return null for empty collection', () => {
      // Act
      const url = imageService.getAlbumCoverFromCollection(
        [],
        'Artist',
        'Album'
      );

      // Assert
      expect(url).toBeNull();
    });
  });

  describe('batchGetAlbumCovers', () => {
    it('should fetch multiple album covers', async () => {
      // Arrange
      mockLastFmService.getAlbumInfo
        .mockResolvedValueOnce({
          name: 'Album1',
          artist: 'Artist1',
          image: [{ size: 'large', '#text': 'https://album1.jpg' }],
        })
        .mockResolvedValueOnce({
          name: 'Album2',
          artist: 'Artist2',
          image: [{ size: 'large', '#text': 'https://album2.jpg' }],
        });

      const requests = [
        { artist: 'Artist1', album: 'Album1' },
        { artist: 'Artist2', album: 'Album2' },
      ];

      // Act
      const results = await imageService.batchGetAlbumCovers(requests);

      // Assert
      expect(results.size).toBe(2);
      expect(results.get('artist1|album1')).toBe('https://album1.jpg');
      expect(results.get('artist2|album2')).toBe('https://album2.jpg');
    });

    it('should handle empty request array', async () => {
      // Act
      const results = await imageService.batchGetAlbumCovers([]);

      // Assert
      expect(results.size).toBe(0);
    });
  });

  describe('batchGetArtistImages', () => {
    it('should fetch multiple artist images', async () => {
      // Arrange
      mockLastFmService.getArtistInfo
        .mockResolvedValueOnce({
          name: 'Artist1',
          image: [{ size: 'large', '#text': 'https://artist1.jpg' }],
        })
        .mockResolvedValueOnce({
          name: 'Artist2',
          image: [{ size: 'large', '#text': 'https://artist2.jpg' }],
        });

      // Act
      const results = await imageService.batchGetArtistImages([
        'Artist1',
        'Artist2',
      ]);

      // Assert
      expect(results.size).toBe(2);
      expect(results.get('artist1')).toBe('https://artist1.jpg');
      expect(results.get('artist2')).toBe('https://artist2.jpg');
    });

    it('should handle empty request array', async () => {
      // Act
      const results = await imageService.batchGetArtistImages([]);

      // Assert
      expect(results.size).toBe(0);
    });
  });

  describe('cleanupExpiredCache', () => {
    it('should remove expired entries', async () => {
      // Arrange - pre-populate cache with mixed entries
      const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
      const fiveDaysAgo = Date.now() - 5 * 24 * 60 * 60 * 1000;

      mockFileStorage.readJSON
        .mockResolvedValueOnce({
          schemaVersion: 1,
          entries: {
            'artist1|album1': {
              url: 'https://old.jpg',
              fetchedAt: thirtyOneDaysAgo,
            },
            'artist2|album2': {
              url: 'https://new.jpg',
              fetchedAt: fiveDaysAgo,
            },
          },
        })
        .mockResolvedValueOnce({
          schemaVersion: 1,
          entries: {
            artist1: {
              url: 'https://oldartist.jpg',
              fetchedAt: thirtyOneDaysAgo,
            },
          },
        });

      // Act
      const result = await imageService.cleanupExpiredCache();

      // Assert
      expect(result.albumsRemoved).toBe(1);
      expect(result.artistsRemoved).toBe(1);
      expect(mockFileStorage.writeJSON).toHaveBeenCalled();
    });

    it('should handle empty cache', async () => {
      // Arrange
      mockFileStorage.readJSON.mockResolvedValue(null);

      // Act
      const result = await imageService.cleanupExpiredCache();

      // Assert
      expect(result.albumsRemoved).toBe(0);
      expect(result.artistsRemoved).toBe(0);
    });
  });

  describe('cache persistence', () => {
    it('should persist album cache after fetching', async () => {
      // Arrange
      mockLastFmService.getAlbumInfo.mockResolvedValue({
        name: 'Album',
        artist: 'Artist',
        image: [{ size: 'large', '#text': 'https://new.jpg' }],
      });

      // Act
      await imageService.getAlbumCover('Artist', 'Album');

      // Assert
      expect(mockFileStorage.writeJSON).toHaveBeenCalledWith(
        'images/album-covers.json',
        expect.objectContaining({
          schemaVersion: 1,
          entries: expect.objectContaining({
            'artist|album': expect.objectContaining({
              url: 'https://new.jpg',
            }),
          }),
        })
      );
    });

    it('should persist artist cache after fetching', async () => {
      // Arrange
      mockLastFmService.getArtistInfo.mockResolvedValue({
        name: 'Artist',
        image: [{ size: 'large', '#text': 'https://artist.jpg' }],
      });

      // Act
      await imageService.getArtistImage('Artist');

      // Assert
      expect(mockFileStorage.writeJSON).toHaveBeenCalledWith(
        'images/artist-images.json',
        expect.objectContaining({
          schemaVersion: 1,
          entries: expect.objectContaining({
            artist: expect.objectContaining({
              url: 'https://artist.jpg',
            }),
          }),
        })
      );
    });

    it('should handle write errors gracefully', async () => {
      // Arrange
      mockFileStorage.writeJSON.mockRejectedValue(new Error('Write error'));
      mockLastFmService.getAlbumInfo.mockResolvedValue({
        name: 'Album',
        artist: 'Artist',
        image: [{ size: 'large', '#text': 'https://new.jpg' }],
      });

      // Act - should not throw
      const url = await imageService.getAlbumCover('Artist', 'Album');

      // Assert
      expect(url).toBe('https://new.jpg');
    });

    it('should handle read errors gracefully', async () => {
      // Arrange
      mockFileStorage.readJSON.mockRejectedValue(new Error('Read error'));
      mockLastFmService.getAlbumInfo.mockResolvedValue({
        name: 'Album',
        artist: 'Artist',
        image: [{ size: 'large', '#text': 'https://new.jpg' }],
      });

      // Act - should still work (treat as empty cache)
      const url = await imageService.getAlbumCover('Artist', 'Album');

      // Assert
      expect(url).toBe('https://new.jpg');
    });
  });

  describe('image size fallbacks', () => {
    it('should use large if extralarge not available', async () => {
      // Arrange
      mockLastFmService.getAlbumInfo.mockResolvedValue({
        name: 'Album',
        artist: 'Artist',
        image: [
          { size: 'small', '#text': 'https://small.jpg' },
          { size: 'large', '#text': 'https://large.jpg' },
        ],
      });

      // Act
      const url = await imageService.getAlbumCover('Artist', 'Album');

      // Assert
      expect(url).toBe('https://large.jpg');
    });

    it('should use medium if large and extralarge not available', async () => {
      // Arrange
      mockLastFmService.getAlbumInfo.mockResolvedValue({
        name: 'Album',
        artist: 'Artist',
        image: [
          { size: 'small', '#text': 'https://small.jpg' },
          { size: 'medium', '#text': 'https://medium.jpg' },
        ],
      });

      // Act
      const url = await imageService.getAlbumCover('Artist', 'Album');

      // Assert
      expect(url).toBe('https://medium.jpg');
    });

    it('should use large if extralarge not available for artist', async () => {
      // Arrange
      mockLastFmService.getArtistInfo.mockResolvedValue({
        name: 'Artist',
        image: [
          { size: 'small', '#text': 'https://small.jpg' },
          { size: 'large', '#text': 'https://large.jpg' },
        ],
      });

      // Act
      const url = await imageService.getArtistImage('Artist');

      // Assert
      expect(url).toBe('https://large.jpg');
    });

    it('should use medium if large and extralarge not available for artist', async () => {
      // Arrange
      mockLastFmService.getArtistInfo.mockResolvedValue({
        name: 'Artist',
        image: [
          { size: 'small', '#text': 'https://small.jpg' },
          { size: 'medium', '#text': 'https://medium.jpg' },
        ],
      });

      // Act
      const url = await imageService.getArtistImage('Artist');

      // Assert
      expect(url).toBe('https://medium.jpg');
    });
  });

  describe('batch processing with delays', () => {
    it('should process albums in batches with delays', async () => {
      // Arrange
      const requests = Array.from({ length: 7 }, (_, i) => ({
        artist: `Artist${i}`,
        album: `Album${i}`,
      }));

      mockLastFmService.getAlbumInfo.mockResolvedValue({
        name: 'Album',
        artist: 'Artist',
        image: [{ size: 'large', '#text': 'https://cover.jpg' }],
      });

      // Act
      const results = await imageService.batchGetAlbumCovers(requests);

      // Assert
      expect(results.size).toBe(7);
      // Should have called getAlbumInfo 7 times
      expect(mockLastFmService.getAlbumInfo).toHaveBeenCalledTimes(7);
    });

    it('should process artists in batches with delays', async () => {
      // Arrange
      const artistNames = Array.from({ length: 7 }, (_, i) => `Artist${i}`);

      mockLastFmService.getArtistInfo.mockResolvedValue({
        name: 'Artist',
        image: [{ size: 'large', '#text': 'https://artist.jpg' }],
      });

      // Act
      const results = await imageService.batchGetArtistImages(artistNames);

      // Assert
      expect(results.size).toBe(7);
      expect(mockLastFmService.getArtistInfo).toHaveBeenCalledTimes(7);
    });
  });

  describe('cache with artist images', () => {
    it('should use cached artist image when available', async () => {
      // Arrange - pre-populate cache by loading from file
      mockFileStorage.readJSON
        .mockResolvedValueOnce(null) // album cache
        .mockResolvedValueOnce({
          schemaVersion: 1,
          entries: {
            artist: {
              url: 'https://cached-artist.jpg',
              fetchedAt: Date.now(),
            },
          },
        });

      // Act
      const url = await imageService.getArtistImage('Artist');

      // Assert
      expect(url).toBe('https://cached-artist.jpg');
      expect(mockLastFmService.getArtistInfo).not.toHaveBeenCalled();
    });

    it('should refetch artist image when cache is expired', async () => {
      // Arrange
      const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
      mockFileStorage.readJSON
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          schemaVersion: 1,
          entries: {
            artist: {
              url: 'https://old-artist.jpg',
              fetchedAt: thirtyOneDaysAgo,
            },
          },
        });

      mockLastFmService.getArtistInfo.mockResolvedValue({
        name: 'Artist',
        image: [{ size: 'large', '#text': 'https://new-artist.jpg' }],
      });

      // Act
      const url = await imageService.getArtistImage('Artist');

      // Assert
      expect(url).toBe('https://new-artist.jpg');
      expect(mockLastFmService.getArtistInfo).toHaveBeenCalled();
    });
  });

  describe('getAlbumCoverFromCollection edge cases', () => {
    it('should handle collection item with no cover image', () => {
      // Arrange
      const collection = [
        {
          id: 1,
          date_added: '2024-01-15T00:00:00Z',
          rating: 0,
          release: {
            id: 1,
            title: 'Test Album',
            artist: 'Test Artist',
            year: 2021,
            format: ['Vinyl'],
            label: ['Label'],
            cover_image: '', // Empty cover
            resource_url: 'https://api.discogs.com/releases/1',
          },
        },
      ];

      // Act
      const url = imageService.getAlbumCoverFromCollection(
        collection as CollectionItem[],
        'Test Artist',
        'Test Album'
      );

      // Assert - empty string is falsy so returns null
      expect(url).toBeNull();
    });
  });
});
