import { CompoundArtistMappingService } from '../../../src/backend/services/compoundArtistMappingService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';
import { AlbumMapping } from '../../../src/shared/types';

jest.mock('../../../src/backend/utils/fileStorage');

const MockedFileStorage = FileStorage as jest.MockedClass<typeof FileStorage>;

describe('CompoundArtistMappingService', () => {
  let service: CompoundArtistMappingService;
  let mockFileStorage: jest.Mocked<FileStorage>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFileStorage = new MockedFileStorage('test') as jest.Mocked<FileStorage>;
    mockFileStorage.readJSON = jest.fn().mockResolvedValue(null);
    mockFileStorage.writeJSONWithBackup = jest
      .fn()
      .mockResolvedValue(undefined);
    service = new CompoundArtistMappingService(mockFileStorage);
  });

  describe('load', () => {
    it('should load from empty state', async () => {
      const mappings = await service.getAllMappings();
      expect(mappings).toEqual([]);
    });

    it('should load persisted mappings', async () => {
      mockFileStorage.readJSON = jest.fn().mockResolvedValue({
        schemaVersion: 1,
        mappings: [
          {
            compoundName: 'Danny Brown (2), Jane Remover',
            components: ['Danny Brown', 'Jane Remover'],
            autoDetected: true,
            createdAt: 1000,
          },
        ],
      });

      const freshService = new CompoundArtistMappingService(mockFileStorage);
      const mappings = await freshService.getAllMappings();
      expect(mappings).toHaveLength(1);
      expect(mappings[0].compoundName).toBe('Danny Brown (2), Jane Remover');
      expect(mappings[0].components).toEqual(['Danny Brown', 'Jane Remover']);
    });
  });

  describe('addMapping', () => {
    it('should add a mapping and persist', async () => {
      await service.addMapping('A, B', ['A', 'B']);

      const mappings = await service.getAllMappings();
      expect(mappings).toHaveLength(1);
      expect(mappings[0].compoundName).toBe('A, B');
      expect(mappings[0].components).toEqual(['A', 'B']);
      expect(mappings[0].autoDetected).toBe(false);
      expect(mockFileStorage.writeJSONWithBackup).toHaveBeenCalledTimes(1);
    });

    it('should overwrite existing mapping with same compound name', async () => {
      await service.addMapping('A, B', ['A', 'B']);
      await service.addMapping('A, B', ['A', 'C']);

      const mappings = await service.getAllMappings();
      expect(mappings).toHaveLength(1);
      expect(mappings[0].components).toEqual(['A', 'C']);
    });

    it('should be case-insensitive on lookup', async () => {
      await service.addMapping('Danny Brown (2), Jane Remover', [
        'Danny Brown',
        'Jane Remover',
      ]);

      const mapping = await service.getMapping('danny brown (2), jane remover');
      expect(mapping).not.toBeNull();
      expect(mapping!.compoundName).toBe('Danny Brown (2), Jane Remover');
    });
  });

  describe('removeMapping', () => {
    it('should remove an existing mapping', async () => {
      await service.addMapping('A, B', ['A', 'B']);
      const removed = await service.removeMapping('A, B');

      expect(removed).toBe(true);
      const mappings = await service.getAllMappings();
      expect(mappings).toHaveLength(0);
    });

    it('should return false for non-existent mapping', async () => {
      const removed = await service.removeMapping('nonexistent');
      expect(removed).toBe(false);
    });
  });

  describe('getMapping', () => {
    it('should return null for unknown mapping', async () => {
      const mapping = await service.getMapping('unknown');
      expect(mapping).toBeNull();
    });
  });

  describe('autoDetectFromAlbumMappings', () => {
    it('should detect compound artists from album mappings', async () => {
      const albumMappings: AlbumMapping[] = [
        {
          historyArtist: 'Danny Brown (2), Jane Remover',
          historyAlbum: 'Stardust',
          collectionArtist: 'Danny Brown (2)',
          collectionAlbum: 'Stardust',
          collectionId: 1,
          createdAt: 1000,
        },
      ];

      const detected = await service.autoDetectFromAlbumMappings(albumMappings);
      expect(detected).toBe(1);

      const mappings = await service.getAllMappings();
      expect(mappings).toHaveLength(1);
      expect(mappings[0].compoundName).toBe('Danny Brown (2), Jane Remover');
      expect(mappings[0].components).toEqual(['Danny Brown', 'Jane Remover']);
      expect(mappings[0].autoDetected).toBe(true);
    });

    it('should strip disambiguation suffixes from components', async () => {
      const albumMappings: AlbumMapping[] = [
        {
          historyArtist: 'Artist (3), Other (2)',
          historyAlbum: 'Album',
          collectionArtist: 'Artist (3)',
          collectionAlbum: 'Album',
          collectionId: 1,
          createdAt: 1000,
        },
      ];

      const detected = await service.autoDetectFromAlbumMappings(albumMappings);
      expect(detected).toBe(1);

      const mappings = await service.getAllMappings();
      expect(mappings[0].components).toEqual(['Artist', 'Other']);
    });

    it('should not duplicate already-known mappings', async () => {
      const albumMappings: AlbumMapping[] = [
        {
          historyArtist: 'A, B',
          historyAlbum: 'Album',
          collectionArtist: 'A',
          collectionAlbum: 'Album',
          collectionId: 1,
          createdAt: 1000,
        },
      ];

      await service.autoDetectFromAlbumMappings(albumMappings);
      // Should not count them again on second run
      const detected = await service.autoDetectFromAlbumMappings(albumMappings);
      expect(detected).toBe(0);
    });

    it('should skip non-compound artist names', async () => {
      const albumMappings: AlbumMapping[] = [
        {
          historyArtist: 'Simple Artist',
          historyAlbum: 'Album',
          collectionArtist: 'Simple Artist',
          collectionAlbum: 'Album',
          collectionId: 1,
          createdAt: 1000,
        },
      ];

      const detected = await service.autoDetectFromAlbumMappings(albumMappings);
      expect(detected).toBe(0);
    });

    it('should detect & separator', async () => {
      const albumMappings: AlbumMapping[] = [
        {
          historyArtist: 'Foo & Bar',
          historyAlbum: 'Album',
          collectionArtist: 'Foo',
          collectionAlbum: 'Album',
          collectionId: 1,
          createdAt: 1000,
        },
      ];

      const detected = await service.autoDetectFromAlbumMappings(albumMappings);
      expect(detected).toBe(1);
      const mappings = await service.getAllMappings();
      expect(mappings[0].components).toEqual(['Foo', 'Bar']);
    });
  });
});
