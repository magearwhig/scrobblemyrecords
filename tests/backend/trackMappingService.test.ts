import { TrackMappingService } from '../../src/backend/services/trackMappingService';
import { FileStorage } from '../../src/backend/utils/fileStorage';
import { TrackMapping, TrackMappingsStore } from '../../src/shared/types';

jest.mock('../../src/backend/utils/fileStorage');
jest.mock('../../src/backend/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

const createMockMapping = (
  overrides: Partial<Omit<TrackMapping, 'createdAt'>> = {}
): Omit<TrackMapping, 'createdAt'> => ({
  historyArtist: 'El-p',
  historyAlbum: 'Cancer 4 Cure',
  historyTrack: 'Request Denied',
  cacheArtist: 'El-P',
  cacheAlbum: 'Cancer 4 Cure [Explicit]',
  cacheTrack: 'Request Denied [Explicit]',
  ...overrides,
});

describe('TrackMappingService', () => {
  let service: TrackMappingService;
  let mockFileStorage: jest.Mocked<FileStorage>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockFileStorage = {
      readJSON: jest.fn().mockResolvedValue(null),
      writeJSON: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<FileStorage>;

    service = new TrackMappingService(mockFileStorage);
  });

  describe('loadMappings', () => {
    it('should load mappings from versioned store format', async () => {
      const store: TrackMappingsStore = {
        schemaVersion: 1,
        mappings: [{ ...createMockMapping(), createdAt: 1000 }],
      };
      mockFileStorage.readJSON.mockResolvedValueOnce(store);

      await service.loadMappings();

      const mappings = await service.getAllTrackMappings();
      expect(mappings).toHaveLength(1);
      expect(mappings[0].historyArtist).toBe('El-p');
    });

    it('should load mappings from legacy array format', async () => {
      const legacyArray: TrackMapping[] = [
        { ...createMockMapping(), createdAt: 1000 },
      ];
      mockFileStorage.readJSON.mockResolvedValueOnce(legacyArray);

      await service.loadMappings();

      const mappings = await service.getAllTrackMappings();
      expect(mappings).toHaveLength(1);
    });

    it('should handle missing file gracefully', async () => {
      mockFileStorage.readJSON.mockRejectedValueOnce(
        new Error('File not found')
      );

      await service.loadMappings();

      const mappings = await service.getAllTrackMappings();
      expect(mappings).toHaveLength(0);
    });

    it('should only load once (caching)', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);

      await service.loadMappings();
      await service.loadMappings();

      expect(mockFileStorage.readJSON).toHaveBeenCalledTimes(1);
    });

    it('should handle null data from readJSON', async () => {
      mockFileStorage.readJSON.mockResolvedValueOnce(null);

      await service.loadMappings();

      const mappings = await service.getAllTrackMappings();
      expect(mappings).toHaveLength(0);
    });

    it('should handle store with empty mappings array', async () => {
      const store: TrackMappingsStore = {
        schemaVersion: 1,
        mappings: [],
      };
      mockFileStorage.readJSON.mockResolvedValueOnce(store);

      await service.loadMappings();

      const mappings = await service.getAllTrackMappings();
      expect(mappings).toHaveLength(0);
    });
  });

  describe('addTrackMapping', () => {
    it('should add a mapping and persist to disk', async () => {
      const mapping = createMockMapping();

      await service.addTrackMapping(mapping);

      expect(mockFileStorage.writeJSON).toHaveBeenCalledWith(
        'mappings/track-mappings.json',
        expect.objectContaining({
          schemaVersion: 1,
          mappings: expect.arrayContaining([
            expect.objectContaining({
              historyArtist: 'El-p',
              cacheArtist: 'El-P',
              createdAt: expect.any(Number),
            }),
          ]),
        })
      );
    });

    it('should set createdAt timestamp', async () => {
      const before = Date.now();
      await service.addTrackMapping(createMockMapping());
      const after = Date.now();

      const mappings = await service.getAllTrackMappings();
      expect(mappings[0].createdAt).toBeGreaterThanOrEqual(before);
      expect(mappings[0].createdAt).toBeLessThanOrEqual(after);
    });

    it('should overwrite existing mapping for same track (case-insensitive)', async () => {
      await service.addTrackMapping(createMockMapping());
      await service.addTrackMapping(
        createMockMapping({
          historyArtist: 'EL-P',
          historyAlbum: 'CANCER 4 CURE',
          historyTrack: 'REQUEST DENIED',
          cacheTrack: 'Updated Track Name',
        })
      );

      const mappings = await service.getAllTrackMappings();
      expect(mappings).toHaveLength(1);
      expect(mappings[0].cacheTrack).toBe('Updated Track Name');
    });
  });

  describe('removeTrackMapping', () => {
    it('should remove an existing mapping and return true', async () => {
      await service.addTrackMapping(createMockMapping());

      const result = await service.removeTrackMapping(
        'El-p',
        'Cancer 4 Cure',
        'Request Denied'
      );

      expect(result).toBe(true);
      const mappings = await service.getAllTrackMappings();
      expect(mappings).toHaveLength(0);
    });

    it('should return false if mapping does not exist', async () => {
      const result = await service.removeTrackMapping(
        'Unknown',
        'Unknown',
        'Unknown'
      );

      expect(result).toBe(false);
    });

    it('should match case-insensitively', async () => {
      await service.addTrackMapping(createMockMapping());

      const result = await service.removeTrackMapping(
        'EL-P',
        'CANCER 4 CURE',
        'REQUEST DENIED'
      );

      expect(result).toBe(true);
    });

    it('should persist changes after removal', async () => {
      await service.addTrackMapping(createMockMapping());
      mockFileStorage.writeJSON.mockClear();

      await service.removeTrackMapping(
        'El-p',
        'Cancer 4 Cure',
        'Request Denied'
      );

      expect(mockFileStorage.writeJSON).toHaveBeenCalledWith(
        'mappings/track-mappings.json',
        expect.objectContaining({
          schemaVersion: 1,
          mappings: [],
        })
      );
    });
  });

  describe('getTrackMapping', () => {
    it('should return mapping when it exists', async () => {
      await service.addTrackMapping(createMockMapping());

      const mapping = await service.getTrackMapping(
        'El-p',
        'Cancer 4 Cure',
        'Request Denied'
      );

      expect(mapping).not.toBeNull();
      expect(mapping!.cacheArtist).toBe('El-P');
      expect(mapping!.cacheTrack).toBe('Request Denied [Explicit]');
    });

    it('should return null when mapping does not exist', async () => {
      const mapping = await service.getTrackMapping(
        'Unknown',
        'Unknown',
        'Unknown'
      );

      expect(mapping).toBeNull();
    });

    it('should match case-insensitively and trim whitespace', async () => {
      await service.addTrackMapping(createMockMapping());

      const mapping = await service.getTrackMapping(
        '  EL-P  ',
        '  cancer 4 cure  ',
        '  request denied  '
      );

      expect(mapping).not.toBeNull();
    });
  });

  describe('hasTrackMapping', () => {
    it('should return true when mapping exists', async () => {
      await service.addTrackMapping(createMockMapping());

      const result = await service.hasTrackMapping(
        'El-p',
        'Cancer 4 Cure',
        'Request Denied'
      );

      expect(result).toBe(true);
    });

    it('should return false when mapping does not exist', async () => {
      const result = await service.hasTrackMapping(
        'Unknown',
        'Unknown',
        'Unknown'
      );

      expect(result).toBe(false);
    });
  });

  describe('getAllTrackMappings', () => {
    it('should return all mappings', async () => {
      await service.addTrackMapping(createMockMapping());
      await service.addTrackMapping(
        createMockMapping({
          historyArtist: 'Other Artist',
          historyAlbum: 'Other Album',
          historyTrack: 'Other Track',
        })
      );

      const mappings = await service.getAllTrackMappings();

      expect(mappings).toHaveLength(2);
    });

    it('should return empty array when no mappings exist', async () => {
      const mappings = await service.getAllTrackMappings();

      expect(mappings).toHaveLength(0);
    });
  });

  describe('getTrackMappingCount', () => {
    it('should return correct count', async () => {
      await service.addTrackMapping(createMockMapping());
      await service.addTrackMapping(
        createMockMapping({
          historyArtist: 'Other Artist',
          historyAlbum: 'Other Album',
          historyTrack: 'Other Track',
        })
      );

      const count = await service.getTrackMappingCount();

      expect(count).toBe(2);
    });

    it('should return 0 when no mappings exist', async () => {
      const count = await service.getTrackMappingCount();

      expect(count).toBe(0);
    });
  });

  describe('applyMapping', () => {
    it('should return mapped values when mapping exists', async () => {
      await service.addTrackMapping(createMockMapping());

      const result = await service.applyMapping(
        'El-p',
        'Cancer 4 Cure',
        'Request Denied'
      );

      expect(result).toEqual({
        artist: 'El-P',
        album: 'Cancer 4 Cure [Explicit]',
        track: 'Request Denied [Explicit]',
      });
    });

    it('should return original values when no mapping exists', async () => {
      const result = await service.applyMapping(
        'Radiohead',
        'OK Computer',
        'Paranoid Android'
      );

      expect(result).toEqual({
        artist: 'Radiohead',
        album: 'OK Computer',
        track: 'Paranoid Android',
      });
    });
  });

  describe('clearCache', () => {
    it('should clear in-memory cache and allow reload', async () => {
      const store: TrackMappingsStore = {
        schemaVersion: 1,
        mappings: [{ ...createMockMapping(), createdAt: 1000 }],
      };
      mockFileStorage.readJSON.mockResolvedValue(store);

      await service.loadMappings();
      expect(mockFileStorage.readJSON).toHaveBeenCalledTimes(1);

      service.clearCache();

      // After clearing, loadMappings should read from disk again
      await service.loadMappings();
      expect(mockFileStorage.readJSON).toHaveBeenCalledTimes(2);
    });

    it('should result in empty mappings until reloaded', async () => {
      await service.addTrackMapping(createMockMapping());
      expect(await service.getTrackMappingCount()).toBe(1);

      service.clearCache();

      // After clear, fresh load returns what's on disk (mocked as null)
      mockFileStorage.readJSON.mockResolvedValueOnce(null);
      const count = await service.getTrackMappingCount();
      expect(count).toBe(0);
    });
  });
});
