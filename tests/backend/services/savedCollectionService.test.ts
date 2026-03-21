import {
  parseTrackDuration,
  SavedCollectionService,
} from '../../../src/backend/services/savedCollectionService';
import { ScrobbleHistoryStorage } from '../../../src/backend/services/scrobbleHistoryStorage';
import { FileStorage } from '../../../src/backend/utils/fileStorage';
import { SavedCollectionsStore } from '../../../src/shared/types';

jest.mock('../../../src/backend/utils/fileStorage');
jest.mock('../../../src/backend/services/scrobbleHistoryStorage');

const MockedFileStorage = FileStorage as jest.MockedClass<typeof FileStorage>;
const MockedHistoryStorage = ScrobbleHistoryStorage as jest.MockedClass<
  typeof ScrobbleHistoryStorage
>;

describe('SavedCollectionService', () => {
  let service: SavedCollectionService;
  let mockFileStorage: jest.Mocked<FileStorage>;
  let mockHistoryStorage: jest.Mocked<ScrobbleHistoryStorage>;

  const emptyStore: SavedCollectionsStore = {
    schemaVersion: 1,
    collections: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFileStorage = new MockedFileStorage('test') as jest.Mocked<FileStorage>;
    mockHistoryStorage = new MockedHistoryStorage(
      {} as any
    ) as jest.Mocked<ScrobbleHistoryStorage>;

    // Default: no existing store
    mockFileStorage.readJSON.mockResolvedValue(null);
    mockFileStorage.writeJSONWithBackup.mockResolvedValue(undefined);

    service = new SavedCollectionService(mockFileStorage);
  });

  describe('parseTrackDuration', () => {
    it('should parse MM:SS format', () => {
      expect(parseTrackDuration('3:45')).toBe(225);
    });

    it('should parse raw seconds as number', () => {
      expect(parseTrackDuration(180)).toBe(180);
    });

    it('should parse raw seconds as string', () => {
      expect(parseTrackDuration('180')).toBe(180);
    });

    it('should return 0 for unparseable strings', () => {
      expect(parseTrackDuration('invalid')).toBe(0);
    });
  });

  describe('getCollections', () => {
    it('should return empty array when no store exists', async () => {
      const collections = await service.getCollections();
      expect(collections).toEqual([]);
    });

    it('should return collections from existing store', async () => {
      const store: SavedCollectionsStore = {
        schemaVersion: 1,
        collections: [
          {
            id: 'col-1',
            name: 'Test',
            tracks: [],
            createdAt: 1700000000000,
            updatedAt: 1700000000000,
          },
        ],
      };
      mockFileStorage.readJSON.mockResolvedValue(store);

      const collections = await service.getCollections();
      expect(collections).toHaveLength(1);
      expect(collections[0].name).toBe('Test');
    });
  });

  describe('getCollection', () => {
    it('should return null when collection not found', async () => {
      const result = await service.getCollection('nonexistent');
      expect(result).toBeNull();
    });

    it('should return the matching collection', async () => {
      const store: SavedCollectionsStore = {
        schemaVersion: 1,
        collections: [
          {
            id: 'col-1',
            name: 'Test',
            tracks: [],
            createdAt: 1700000000000,
            updatedAt: 1700000000000,
          },
        ],
      };
      mockFileStorage.readJSON.mockResolvedValue(store);

      const result = await service.getCollection('col-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('col-1');
    });
  });

  describe('createCollection', () => {
    it('should create a new collection with generated id', async () => {
      const collection = await service.createCollection(
        'My Playlist',
        'Description'
      );

      expect(collection.name).toBe('My Playlist');
      expect(collection.description).toBe('Description');
      expect(collection.id).toBeDefined();
      expect(collection.tracks).toEqual([]);
      expect(collection.createdAt).toBeGreaterThan(0);
      expect(mockFileStorage.writeJSONWithBackup).toHaveBeenCalled();
    });
  });

  describe('updateCollection', () => {
    it('should update collection name and description', async () => {
      const store: SavedCollectionsStore = {
        schemaVersion: 1,
        collections: [
          {
            id: 'col-1',
            name: 'Old Name',
            description: 'Old Desc',
            tracks: [],
            createdAt: 1700000000000,
            updatedAt: 1700000000000,
          },
        ],
      };
      mockFileStorage.readJSON.mockResolvedValue(store);

      const result = await service.updateCollection(
        'col-1',
        'New Name',
        'New Desc'
      );

      expect(result).not.toBeNull();
      expect(result!.name).toBe('New Name');
      expect(result!.description).toBe('New Desc');
      expect(result!.updatedAt).toBeGreaterThan(1700000000000);
    });

    it('should return null for nonexistent collection', async () => {
      const result = await service.updateCollection('nonexistent', 'Name');
      expect(result).toBeNull();
    });
  });

  describe('deleteCollection', () => {
    it('should delete an existing collection', async () => {
      const store: SavedCollectionsStore = {
        schemaVersion: 1,
        collections: [
          {
            id: 'col-1',
            name: 'Test',
            tracks: [],
            createdAt: 1700000000000,
            updatedAt: 1700000000000,
          },
        ],
      };
      mockFileStorage.readJSON.mockResolvedValue(store);

      const result = await service.deleteCollection('col-1');
      expect(result).toBe(true);
      expect(mockFileStorage.writeJSONWithBackup).toHaveBeenCalled();
    });

    it('should return false for nonexistent collection', async () => {
      const result = await service.deleteCollection('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('addTrack', () => {
    it('should add a track with auto-incremented position', async () => {
      const store: SavedCollectionsStore = {
        schemaVersion: 1,
        collections: [
          {
            id: 'col-1',
            name: 'Test',
            tracks: [
              {
                artist: 'A',
                track: 'B',
                duration: 0,
                position: 1,
                lastfmMatch: false,
              },
            ],
            createdAt: 1700000000000,
            updatedAt: 1700000000000,
          },
        ],
      };
      mockFileStorage.readJSON.mockResolvedValue(store);

      const result = await service.addTrack('col-1', {
        artist: 'Radiohead',
        track: 'Creep',
        album: 'Pablo Honey',
        duration: 236,
      });

      expect(result).not.toBeNull();
      expect(result!.position).toBe(2);
      expect(result!.artist).toBe('Radiohead');
      expect(result!.duration).toBe(236);
    });

    it('should return null when collection not found', async () => {
      const result = await service.addTrack('nonexistent', {
        artist: 'A',
        track: 'B',
      });
      expect(result).toBeNull();
    });
  });

  describe('removeTrack', () => {
    it('should remove a track and reindex positions', async () => {
      const store: SavedCollectionsStore = {
        schemaVersion: 1,
        collections: [
          {
            id: 'col-1',
            name: 'Test',
            tracks: [
              {
                artist: 'A',
                track: 'T1',
                duration: 0,
                position: 1,
                lastfmMatch: false,
              },
              {
                artist: 'B',
                track: 'T2',
                duration: 0,
                position: 2,
                lastfmMatch: false,
              },
              {
                artist: 'C',
                track: 'T3',
                duration: 0,
                position: 3,
                lastfmMatch: false,
              },
            ],
            createdAt: 1700000000000,
            updatedAt: 1700000000000,
          },
        ],
      };
      mockFileStorage.readJSON.mockResolvedValue(store);

      const result = await service.removeTrack('col-1', 2);
      expect(result).toBe(true);

      // Verify reindexing happened
      const savedStore = mockFileStorage.writeJSONWithBackup.mock
        .calls[0][1] as SavedCollectionsStore;
      const tracks = savedStore.collections[0].tracks;
      expect(tracks).toHaveLength(2);
      expect(tracks[0].position).toBe(1);
      expect(tracks[1].position).toBe(2);
    });

    it('should return false for nonexistent collection', async () => {
      const result = await service.removeTrack('nonexistent', 1);
      expect(result).toBe(false);
    });

    it('should return false for nonexistent position', async () => {
      const store: SavedCollectionsStore = {
        schemaVersion: 1,
        collections: [
          {
            id: 'col-1',
            name: 'Test',
            tracks: [
              {
                artist: 'A',
                track: 'T1',
                duration: 0,
                position: 1,
                lastfmMatch: false,
              },
            ],
            createdAt: 1700000000000,
            updatedAt: 1700000000000,
          },
        ],
      };
      mockFileStorage.readJSON.mockResolvedValue(store);

      const result = await service.removeTrack('col-1', 99);
      expect(result).toBe(false);
    });
  });

  describe('importCsv', () => {
    it('should import valid CSV lines', async () => {
      const store: SavedCollectionsStore = {
        schemaVersion: 1,
        collections: [
          {
            id: 'col-1',
            name: 'Test',
            tracks: [],
            createdAt: 1700000000000,
            updatedAt: 1700000000000,
          },
        ],
      };
      mockFileStorage.readJSON.mockResolvedValue(store);
      mockHistoryStorage.getAlbumHistoryFuzzy.mockResolvedValue({
        entry: {
          artist: 'Radiohead',
          album: 'Kid A',
          plays: [],
          playCount: 5,
          lastPlayed: 0,
        },
        matchedKey: 'radiohead|kid a',
      } as any);

      const result = await service.importCsv(
        'col-1',
        'Radiohead,Everything In Its Right Place,Kid A,4:12',
        mockHistoryStorage
      );

      expect(result.imported).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should report errors for malformed lines', async () => {
      const store: SavedCollectionsStore = {
        schemaVersion: 1,
        collections: [
          {
            id: 'col-1',
            name: 'Test',
            tracks: [],
            createdAt: 1700000000000,
            updatedAt: 1700000000000,
          },
        ],
      };
      mockFileStorage.readJSON.mockResolvedValue(store);

      const result = await service.importCsv(
        'col-1',
        'OnlyOneColumn',
        mockHistoryStorage
      );

      expect(result.imported).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('insufficient columns');
    });

    it('should flag unmatched tracks', async () => {
      const store: SavedCollectionsStore = {
        schemaVersion: 1,
        collections: [
          {
            id: 'col-1',
            name: 'Test',
            tracks: [],
            createdAt: 1700000000000,
            updatedAt: 1700000000000,
          },
        ],
      };
      mockFileStorage.readJSON.mockResolvedValue(store);
      mockHistoryStorage.getAlbumHistoryFuzzy.mockResolvedValue({
        entry: null,
        matchedKey: null,
      } as any);

      const result = await service.importCsv(
        'col-1',
        'Unknown,Track',
        mockHistoryStorage
      );

      expect(result.imported).toBe(1);
      expect(result.unmatched).toHaveLength(1);
      expect(result.unmatched[0].lastfmMatch).toBe(false);
    });

    it('should return error for nonexistent collection', async () => {
      const result = await service.importCsv(
        'nonexistent',
        'Artist,Track',
        mockHistoryStorage
      );

      expect(result.imported).toBe(0);
      expect(result.errors).toContain('Collection not found');
    });

    it('should skip empty lines', async () => {
      const store: SavedCollectionsStore = {
        schemaVersion: 1,
        collections: [
          {
            id: 'col-1',
            name: 'Test',
            tracks: [],
            createdAt: 1700000000000,
            updatedAt: 1700000000000,
          },
        ],
      };
      mockFileStorage.readJSON.mockResolvedValue(store);
      mockHistoryStorage.getAlbumHistoryFuzzy.mockResolvedValue({
        entry: null,
        matchedKey: null,
      } as any);

      const result = await service.importCsv(
        'col-1',
        'Artist,Track\n\nArtist2,Track2',
        mockHistoryStorage
      );

      expect(result.imported).toBe(2);
    });
  });

  describe('clearCache', () => {
    it('should force reload from file on next operation', async () => {
      // First call loads from file
      await service.getCollections();
      expect(mockFileStorage.readJSON).toHaveBeenCalledTimes(1);

      // Second call uses cache
      await service.getCollections();
      expect(mockFileStorage.readJSON).toHaveBeenCalledTimes(1);

      // Clear cache and call again
      service.clearCache();
      await service.getCollections();
      expect(mockFileStorage.readJSON).toHaveBeenCalledTimes(2);
    });
  });
});
