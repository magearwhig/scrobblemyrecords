import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import request from 'supertest';

import createImagesRouter from '../../../src/backend/routes/images';
import { AuthService } from '../../../src/backend/services/authService';
import { ImageService } from '../../../src/backend/services/imageService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';

// Mock dependencies
jest.mock('../../../src/backend/services/authService');
jest.mock('../../../src/backend/services/imageService');
jest.mock('../../../src/backend/utils/fileStorage');

const MockedAuthService = AuthService as jest.MockedClass<typeof AuthService>;
const MockedImageService = ImageService as jest.MockedClass<
  typeof ImageService
>;
const MockedFileStorage = FileStorage as jest.MockedClass<typeof FileStorage>;

describe('Images Routes', () => {
  let app: express.Application;
  let mockFileStorage: jest.Mocked<FileStorage>;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockImageService: jest.Mocked<ImageService>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock instances
    mockFileStorage = new MockedFileStorage('test') as jest.Mocked<FileStorage>;
    mockAuthService = new MockedAuthService(
      mockFileStorage
    ) as jest.Mocked<AuthService>;
    mockImageService = new MockedImageService(
      mockFileStorage,
      {} as any
    ) as jest.Mocked<ImageService>;

    // Setup default mocks
    mockAuthService.getUserSettings = jest.fn().mockResolvedValue({
      discogs: { username: 'testuser' },
      lastfm: {},
      preferences: {
        defaultTimestamp: 'now' as const,
        batchSize: 50,
        autoScrobble: false,
      },
    });

    mockFileStorage.readJSON = jest.fn().mockResolvedValue(null);

    // Image service mocks
    mockImageService.getAlbumCover = jest.fn().mockResolvedValue(null);
    mockImageService.getArtistImage = jest.fn().mockResolvedValue(null);
    mockImageService.getAlbumCoverFromCollection = jest
      .fn()
      .mockReturnValue(null);
    mockImageService.batchGetAlbumCovers = jest
      .fn()
      .mockResolvedValue(new Map());
    mockImageService.batchGetArtistImages = jest
      .fn()
      .mockResolvedValue(new Map());
    mockImageService.cleanupExpiredCache = jest.fn().mockResolvedValue({
      albumsRemoved: 5,
      artistsRemoved: 3,
    });

    // Create Express app
    app = express();
    app.use(helmet());
    app.use(cors());
    app.use(express.json());

    // Mount images routes
    app.use(
      '/api/v1/images',
      createImagesRouter(mockFileStorage, mockAuthService, mockImageService)
    );
  });

  describe('GET /api/v1/images/album', () => {
    it('should return 400 when artist is missing', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/images/album?album=Test'
      );

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Artist and album are required');
    });

    it('should return 400 when album is missing', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/images/album?artist=Test'
      );

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should return cover from collection when available', async () => {
      // Arrange
      mockFileStorage.readJSON
        .mockResolvedValueOnce({
          data: [
            {
              id: 1,
              release: {
                artist: 'Artist',
                title: 'Album',
                cover_image: 'https://discogs.jpg',
              },
            },
          ],
          timestamp: Date.now(),
        })
        .mockResolvedValueOnce(null);

      mockImageService.getAlbumCoverFromCollection.mockReturnValue(
        'https://discogs.jpg'
      );

      // Act
      const response = await request(app).get(
        '/api/v1/images/album?artist=Artist&album=Album'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.url).toBe('https://discogs.jpg');
      expect(response.body.data.source).toBe('discogs');
    });

    it('should fall back to Last.fm when not in collection', async () => {
      // Arrange
      mockFileStorage.readJSON.mockResolvedValue(null);
      mockImageService.getAlbumCover.mockResolvedValue('https://lastfm.jpg');

      // Act
      const response = await request(app).get(
        '/api/v1/images/album?artist=Artist&album=Album'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.url).toBe('https://lastfm.jpg');
      expect(response.body.data.source).toBe('lastfm');
    });

    it('should return null source when no image found', async () => {
      // Arrange
      mockFileStorage.readJSON.mockResolvedValue(null);
      mockImageService.getAlbumCover.mockResolvedValue(null);

      // Act
      const response = await request(app).get(
        '/api/v1/images/album?artist=Artist&album=Album'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.url).toBeNull();
      expect(response.body.data.source).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockImageService.getAlbumCover.mockRejectedValue(
        new Error('Image error')
      );

      // Act
      const response = await request(app).get(
        '/api/v1/images/album?artist=Artist&album=Album'
      );

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/images/artist', () => {
    it('should return 400 when name is missing', async () => {
      // Act
      const response = await request(app).get('/api/v1/images/artist');

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Name is a required');
    });

    it('should return artist image from Last.fm', async () => {
      // Arrange
      mockImageService.getArtistImage.mockResolvedValue('https://artist.jpg');

      // Act
      const response = await request(app).get(
        '/api/v1/images/artist?name=Artist'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.url).toBe('https://artist.jpg');
      expect(response.body.data.source).toBe('lastfm');
    });

    it('should return null when no image found', async () => {
      // Arrange
      mockImageService.getArtistImage.mockResolvedValue(null);

      // Act
      const response = await request(app).get(
        '/api/v1/images/artist?name=Artist'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.url).toBeNull();
      expect(response.body.data.source).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockImageService.getArtistImage.mockRejectedValue(
        new Error('Artist error')
      );

      // Act
      const response = await request(app).get(
        '/api/v1/images/artist?name=Artist'
      );

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/images/batch/albums', () => {
    it('should return 400 when albums is missing', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/images/batch/albums')
        .send({});

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Albums array is required');
    });

    it('should return 400 when albums is not an array', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/images/batch/albums')
        .send({ albums: 'not-an-array' });

      // Assert
      expect(response.status).toBe(400);
    });

    it('should return 400 when album entry is missing properties', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/images/batch/albums')
        .send({ albums: [{ artist: 'Test' }] }); // Missing album

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toContain(
        'Each album must have artist and album properties'
      );
    });

    it('should batch fetch album covers', async () => {
      // Arrange
      const resultMap = new Map([
        ['artist1|album1', 'https://album1.jpg'],
        ['artist2|album2', 'https://album2.jpg'],
      ]);
      mockImageService.batchGetAlbumCovers.mockResolvedValue(resultMap);

      // Act
      const response = await request(app)
        .post('/api/v1/images/batch/albums')
        .send({
          albums: [
            { artist: 'Artist1', album: 'Album1' },
            { artist: 'Artist2', album: 'Album2' },
          ],
        });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data['artist1|album1']).toBe('https://album1.jpg');
      expect(response.body.total).toBe(2);
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockImageService.batchGetAlbumCovers.mockRejectedValue(
        new Error('Batch error')
      );

      // Act
      const response = await request(app)
        .post('/api/v1/images/batch/albums')
        .send({ albums: [{ artist: 'A', album: 'B' }] });

      // Assert
      expect(response.status).toBe(500);
    });
  });

  describe('POST /api/v1/images/batch/artists', () => {
    it('should return 400 when artists is missing', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/images/batch/artists')
        .send({});

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Artists array is required');
    });

    it('should return 400 when artists is not an array', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/images/batch/artists')
        .send({ artists: 'not-an-array' });

      // Assert
      expect(response.status).toBe(400);
    });

    it('should batch fetch artist images', async () => {
      // Arrange
      const resultMap = new Map([
        ['artist1', 'https://artist1.jpg'],
        ['artist2', 'https://artist2.jpg'],
      ]);
      mockImageService.batchGetArtistImages.mockResolvedValue(resultMap);

      // Act
      const response = await request(app)
        .post('/api/v1/images/batch/artists')
        .send({ artists: ['Artist1', 'Artist2'] });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data['artist1']).toBe('https://artist1.jpg');
      expect(response.body.total).toBe(2);
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockImageService.batchGetArtistImages.mockRejectedValue(
        new Error('Batch error')
      );

      // Act
      const response = await request(app)
        .post('/api/v1/images/batch/artists')
        .send({ artists: ['A'] });

      // Assert
      expect(response.status).toBe(500);
    });
  });

  describe('POST /api/v1/images/cleanup', () => {
    it('should clean up expired cache entries', async () => {
      // Act
      const response = await request(app).post('/api/v1/images/cleanup');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.albumsRemoved).toBe(5);
      expect(response.body.data.artistsRemoved).toBe(3);
      expect(mockImageService.cleanupExpiredCache).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockImageService.cleanupExpiredCache.mockRejectedValue(
        new Error('Cleanup error')
      );

      // Act
      const response = await request(app).post('/api/v1/images/cleanup');

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Collection loading', () => {
    it('should check collection for cover before falling back to Last.fm', async () => {
      // Arrange
      const collection = [
        {
          id: 1,
          release: {
            artist: 'Test Artist',
            title: 'Test Album',
            cover_image: 'https://discogs.jpg',
          },
        },
      ];

      mockFileStorage.readJSON
        .mockResolvedValueOnce({ data: collection, timestamp: Date.now() })
        .mockResolvedValueOnce(null); // No more pages

      mockImageService.getAlbumCoverFromCollection.mockReturnValue(
        'https://discogs.jpg'
      );

      // Act
      const response = await request(app).get(
        '/api/v1/images/album?artist=Test%20Artist&album=Test%20Album'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.source).toBe('discogs');
      // Should not call getAlbumCover since found in collection
      expect(mockImageService.getAlbumCover).not.toHaveBeenCalled();
    });
  });
});
