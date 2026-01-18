import * as fs from 'fs/promises';

import { MappingService } from '../../src/backend/services/mappingService';
import { FileStorage } from '../../src/backend/utils/fileStorage';
import { AlbumMapping, ArtistMapping } from '../../src/shared/types';

describe('MappingService', () => {
  let service: MappingService;
  let fileStorage: FileStorage;
  const testDataDir = './test-data-mapping-service';

  // Factory functions for test data
  const createAlbumMapping = (
    overrides: Partial<AlbumMapping> = {}
  ): AlbumMapping => ({
    historyArtist: 'Test Artist',
    historyAlbum: 'Test Album',
    collectionId: 123,
    collectionArtist: 'Test Artist (Discogs)',
    collectionAlbum: 'Test Album (Vinyl)',
    createdAt: Date.now(),
    ...overrides,
  });

  const createArtistMapping = (
    overrides: Partial<ArtistMapping> = {}
  ): ArtistMapping => ({
    historyArtist: 'Test Artist',
    collectionArtist: 'Test Artist (Discogs)',
    createdAt: Date.now(),
    ...overrides,
  });

  beforeEach(async () => {
    fileStorage = new FileStorage(testDataDir);
    await fileStorage.ensureDataDir();
    service = new MappingService(fileStorage);
  });

  afterEach(async () => {
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch {
      // Ignore errors if directory doesn't exist
    }
  });

  describe('loadMappings', () => {
    it('should load empty mappings when no files exist', async () => {
      // Act
      await service.loadMappings();
      const albumMappings = await service.getAllAlbumMappings();
      const artistMappings = await service.getAllArtistMappings();

      // Assert
      expect(albumMappings).toEqual([]);
      expect(artistMappings).toEqual([]);
    });

    it('should load album mappings from file', async () => {
      // Arrange
      const mappings: AlbumMapping[] = [
        createAlbumMapping({
          historyArtist: 'Artist1',
          historyAlbum: 'Album1',
        }),
        createAlbumMapping({
          historyArtist: 'Artist2',
          historyAlbum: 'Album2',
        }),
      ];
      await fileStorage.writeJSON('mappings/album-mappings.json', mappings);

      // Act
      await service.loadMappings();
      const result = await service.getAllAlbumMappings();

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].historyArtist).toBe('Artist1');
      expect(result[1].historyArtist).toBe('Artist2');
    });

    it('should load artist mappings from file', async () => {
      // Arrange
      const mappings: ArtistMapping[] = [
        createArtistMapping({ historyArtist: 'Artist1' }),
        createArtistMapping({ historyArtist: 'Artist2' }),
      ];
      await fileStorage.writeJSON(
        'mappings/history-artist-mappings.json',
        mappings
      );

      // Act
      await service.loadMappings();
      const result = await service.getAllArtistMappings();

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].historyArtist).toBe('Artist1');
      expect(result[1].historyArtist).toBe('Artist2');
    });

    it('should only load mappings once (caching)', async () => {
      // Arrange
      const mappings: AlbumMapping[] = [
        createAlbumMapping({ historyArtist: 'Original' }),
      ];
      await fileStorage.writeJSON('mappings/album-mappings.json', mappings);

      // Act - Load first time
      await service.loadMappings();

      // Write new data to file
      const newMappings: AlbumMapping[] = [
        createAlbumMapping({ historyArtist: 'New' }),
      ];
      await fileStorage.writeJSON('mappings/album-mappings.json', newMappings);

      // Load again - should use cached data
      await service.loadMappings();
      const result = await service.getAllAlbumMappings();

      // Assert - should still have old data
      expect(result[0].historyArtist).toBe('Original');
    });
  });

  describe('addAlbumMapping', () => {
    it('should add a new album mapping', async () => {
      // Arrange
      const mapping = {
        historyArtist: 'Pink Floyd',
        historyAlbum: 'Dark Side of the Moon',
        collectionId: 456,
        collectionArtist: 'Pink Floyd',
        collectionAlbum: 'The Dark Side Of The Moon',
      };

      // Act
      await service.addAlbumMapping(mapping);
      const result = await service.getAlbumMapping(
        mapping.historyArtist,
        mapping.historyAlbum
      );

      // Assert
      expect(result).not.toBeNull();
      expect(result!.collectionId).toBe(456);
      expect(result!.createdAt).toBeDefined();
    });

    it('should update existing album mapping', async () => {
      // Arrange
      const mapping = {
        historyArtist: 'Artist',
        historyAlbum: 'Album',
        collectionId: 100,
        collectionArtist: 'Artist',
        collectionAlbum: 'Album V1',
      };

      // Act
      await service.addAlbumMapping(mapping);
      await service.addAlbumMapping({ ...mapping, collectionId: 200 });
      const result = await service.getAlbumMapping('Artist', 'Album');

      // Assert - should have updated value
      expect(result!.collectionId).toBe(200);
    });

    it('should persist album mapping to disk', async () => {
      // Arrange
      const mapping = {
        historyArtist: 'Persisted Artist',
        historyAlbum: 'Persisted Album',
        collectionId: 789,
        collectionArtist: 'Persisted Artist',
        collectionAlbum: 'Persisted Album',
      };

      // Act
      await service.addAlbumMapping(mapping);

      // Create new service instance to test persistence
      const newService = new MappingService(fileStorage);
      const result = await newService.getAlbumMapping(
        mapping.historyArtist,
        mapping.historyAlbum
      );

      // Assert
      expect(result).not.toBeNull();
      expect(result!.collectionId).toBe(789);
    });
  });

  describe('addArtistMapping', () => {
    it('should add a new artist mapping', async () => {
      // Arrange
      const mapping = {
        historyArtist: 'Beatles',
        collectionArtist: 'The Beatles',
      };

      // Act
      await service.addArtistMapping(mapping);
      const result = await service.getArtistMapping(mapping.historyArtist);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.collectionArtist).toBe('The Beatles');
      expect(result!.createdAt).toBeDefined();
    });

    it('should update existing artist mapping', async () => {
      // Arrange
      const mapping = {
        historyArtist: 'Some Artist',
        collectionArtist: 'Original Name',
      };

      // Act
      await service.addArtistMapping(mapping);
      await service.addArtistMapping({
        ...mapping,
        collectionArtist: 'Updated Name',
      });
      const result = await service.getArtistMapping('Some Artist');

      // Assert
      expect(result!.collectionArtist).toBe('Updated Name');
    });

    it('should persist artist mapping to disk', async () => {
      // Arrange
      const mapping = {
        historyArtist: 'Persisted',
        collectionArtist: 'Persisted Collection',
      };

      // Act
      await service.addArtistMapping(mapping);

      // Create new service instance
      const newService = new MappingService(fileStorage);
      const result = await newService.getArtistMapping(mapping.historyArtist);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.collectionArtist).toBe('Persisted Collection');
    });
  });

  describe('removeAlbumMapping', () => {
    it('should remove existing album mapping', async () => {
      // Arrange
      await service.addAlbumMapping({
        historyArtist: 'ToRemove',
        historyAlbum: 'Album',
        collectionId: 1,
        collectionArtist: 'ToRemove',
        collectionAlbum: 'Album',
      });

      // Act
      const removed = await service.removeAlbumMapping('ToRemove', 'Album');
      const result = await service.getAlbumMapping('ToRemove', 'Album');

      // Assert
      expect(removed).toBe(true);
      expect(result).toBeNull();
    });

    it('should return false when removing non-existent mapping', async () => {
      // Act
      const removed = await service.removeAlbumMapping(
        'NonExistent',
        'NonExistent'
      );

      // Assert
      expect(removed).toBe(false);
    });

    it('should persist removal to disk', async () => {
      // Arrange
      await service.addAlbumMapping({
        historyArtist: 'ToRemove',
        historyAlbum: 'Album',
        collectionId: 1,
        collectionArtist: 'ToRemove',
        collectionAlbum: 'Album',
      });

      // Act
      await service.removeAlbumMapping('ToRemove', 'Album');

      // Create new service instance
      const newService = new MappingService(fileStorage);
      const result = await newService.getAlbumMapping('ToRemove', 'Album');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('removeArtistMapping', () => {
    it('should remove existing artist mapping', async () => {
      // Arrange
      await service.addArtistMapping({
        historyArtist: 'ToRemove',
        collectionArtist: 'ToRemove Collection',
      });

      // Act
      const removed = await service.removeArtistMapping('ToRemove');
      const result = await service.getArtistMapping('ToRemove');

      // Assert
      expect(removed).toBe(true);
      expect(result).toBeNull();
    });

    it('should return false when removing non-existent mapping', async () => {
      // Act
      const removed = await service.removeArtistMapping('NonExistent');

      // Assert
      expect(removed).toBe(false);
    });

    it('should persist removal to disk', async () => {
      // Arrange
      await service.addArtistMapping({
        historyArtist: 'ToRemove',
        collectionArtist: 'ToRemove Collection',
      });

      // Act
      await service.removeArtistMapping('ToRemove');

      // Create new service instance
      const newService = new MappingService(fileStorage);
      const result = await newService.getArtistMapping('ToRemove');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('getAlbumMapping', () => {
    it('should return null when no mapping exists', async () => {
      // Act
      const result = await service.getAlbumMapping('Unknown', 'Unknown');

      // Assert
      expect(result).toBeNull();
    });

    it('should find mapping with case-insensitive lookup', async () => {
      // Arrange
      await service.addAlbumMapping({
        historyArtist: 'Pink Floyd',
        historyAlbum: 'The Wall',
        collectionId: 123,
        collectionArtist: 'Pink Floyd',
        collectionAlbum: 'The Wall',
      });

      // Act
      const result = await service.getAlbumMapping('PINK FLOYD', 'THE WALL');

      // Assert
      expect(result).not.toBeNull();
      expect(result!.collectionId).toBe(123);
    });

    it('should find mapping with trimmed input', async () => {
      // Arrange
      await service.addAlbumMapping({
        historyArtist: 'Artist',
        historyAlbum: 'Album',
        collectionId: 456,
        collectionArtist: 'Artist',
        collectionAlbum: 'Album',
      });

      // Act
      const result = await service.getAlbumMapping('  Artist  ', '  Album  ');

      // Assert
      expect(result).not.toBeNull();
      expect(result!.collectionId).toBe(456);
    });
  });

  describe('getArtistMapping', () => {
    it('should return null when no mapping exists', async () => {
      // Act
      const result = await service.getArtistMapping('Unknown');

      // Assert
      expect(result).toBeNull();
    });

    it('should find mapping with case-insensitive lookup', async () => {
      // Arrange
      await service.addArtistMapping({
        historyArtist: 'The Beatles',
        collectionArtist: 'Beatles, The',
      });

      // Act
      const result = await service.getArtistMapping('THE BEATLES');

      // Assert
      expect(result).not.toBeNull();
      expect(result!.collectionArtist).toBe('Beatles, The');
    });

    it('should find mapping with trimmed input', async () => {
      // Arrange
      await service.addArtistMapping({
        historyArtist: 'Artist',
        collectionArtist: 'Artist Collection',
      });

      // Act
      const result = await service.getArtistMapping('  Artist  ');

      // Assert
      expect(result).not.toBeNull();
    });
  });

  describe('hasAlbumMapping', () => {
    it('should return true when mapping exists', async () => {
      // Arrange
      await service.addAlbumMapping({
        historyArtist: 'Artist',
        historyAlbum: 'Album',
        collectionId: 1,
        collectionArtist: 'Artist',
        collectionAlbum: 'Album',
      });

      // Act
      const result = await service.hasAlbumMapping('Artist', 'Album');

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when mapping does not exist', async () => {
      // Act
      const result = await service.hasAlbumMapping('Unknown', 'Unknown');

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('hasArtistMapping', () => {
    it('should return true when mapping exists', async () => {
      // Arrange
      await service.addArtistMapping({
        historyArtist: 'Artist',
        collectionArtist: 'Artist Collection',
      });

      // Act
      const result = await service.hasArtistMapping('Artist');

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when mapping does not exist', async () => {
      // Act
      const result = await service.hasArtistMapping('Unknown');

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('getAllAlbumMappings', () => {
    it('should return empty array when no mappings', async () => {
      // Act
      const result = await service.getAllAlbumMappings();

      // Assert
      expect(result).toEqual([]);
    });

    it('should return all album mappings', async () => {
      // Arrange
      await service.addAlbumMapping({
        historyArtist: 'Artist1',
        historyAlbum: 'Album1',
        collectionId: 1,
        collectionArtist: 'Artist1',
        collectionAlbum: 'Album1',
      });
      await service.addAlbumMapping({
        historyArtist: 'Artist2',
        historyAlbum: 'Album2',
        collectionId: 2,
        collectionArtist: 'Artist2',
        collectionAlbum: 'Album2',
      });

      // Act
      const result = await service.getAllAlbumMappings();

      // Assert
      expect(result).toHaveLength(2);
    });
  });

  describe('getAllArtistMappings', () => {
    it('should return empty array when no mappings', async () => {
      // Act
      const result = await service.getAllArtistMappings();

      // Assert
      expect(result).toEqual([]);
    });

    it('should return all artist mappings', async () => {
      // Arrange
      await service.addArtistMapping({
        historyArtist: 'Artist1',
        collectionArtist: 'Artist1 Collection',
      });
      await service.addArtistMapping({
        historyArtist: 'Artist2',
        collectionArtist: 'Artist2 Collection',
      });

      // Act
      const result = await service.getAllArtistMappings();

      // Assert
      expect(result).toHaveLength(2);
    });
  });

  describe('edge cases', () => {
    it('should handle special characters in artist/album names', async () => {
      // Arrange
      await service.addAlbumMapping({
        historyArtist: 'AC/DC',
        historyAlbum: "Rock 'n' Roll",
        collectionId: 999,
        collectionArtist: 'AC/DC',
        collectionAlbum: "Rock 'n' Roll",
      });

      // Act
      const result = await service.getAlbumMapping('AC/DC', "Rock 'n' Roll");

      // Assert
      expect(result).not.toBeNull();
      expect(result!.collectionId).toBe(999);
    });

    it('should handle unicode characters', async () => {
      // Arrange
      await service.addArtistMapping({
        historyArtist: 'Björk',
        collectionArtist: 'Björk',
      });

      // Act
      const result = await service.getArtistMapping('Björk');

      // Assert
      expect(result).not.toBeNull();
    });

    it('should handle empty string inputs gracefully', async () => {
      // Act
      const albumResult = await service.getAlbumMapping('', '');
      const artistResult = await service.getArtistMapping('');

      // Assert
      expect(albumResult).toBeNull();
      expect(artistResult).toBeNull();
    });
  });
});
