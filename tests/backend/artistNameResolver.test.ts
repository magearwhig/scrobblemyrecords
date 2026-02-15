import {
  ArtistNameResolver,
  ArtistMappingServiceLike,
} from '../../src/backend/services/artistNameResolver';
import { MappingService } from '../../src/backend/services/mappingService';
import { AlbumMapping, ArtistMapping } from '../../src/shared/types';

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

describe('ArtistNameResolver', () => {
  let resolver: ArtistNameResolver;
  let mockArtistMappingService: ArtistMappingServiceLike;
  let mockMappingService: {
    getAllAlbumMappings: jest.Mock;
    getAllArtistMappings: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockArtistMappingService = {
      getAllMappings: jest.fn().mockReturnValue([]),
      hasMapping: jest.fn().mockReturnValue(false),
    };

    mockMappingService = {
      getAllAlbumMappings: jest.fn().mockResolvedValue([]),
      getAllArtistMappings: jest.fn().mockResolvedValue([]),
    };

    resolver = new ArtistNameResolver(
      mockArtistMappingService,
      mockMappingService as unknown as MappingService
    );
  });

  describe('Constructor and Build', () => {
    it('should build successfully with empty mapping sources', async () => {
      // Act
      await resolver.rebuild();

      // Assert
      expect(mockArtistMappingService.getAllMappings).toHaveBeenCalledTimes(1);
      expect(mockMappingService.getAllAlbumMappings).toHaveBeenCalledTimes(1);
      expect(mockMappingService.getAllArtistMappings).toHaveBeenCalledTimes(1);
    });

    it('should build from artistMappingService mappings (discogsName -> lastfmName)', async () => {
      // Arrange
      (mockArtistMappingService.getAllMappings as jest.Mock).mockReturnValue([
        {
          discogsName: 'Woods, Billy',
          lastfmName: 'billy woods',
          dateAdded: Date.now(),
        },
      ]);

      // Act
      await resolver.rebuild();

      // Assert
      expect(resolver.areSameArtist('Woods, Billy', 'billy woods')).toBe(true);
    });

    it('should build from album mappings where artists differ', async () => {
      // Arrange
      mockMappingService.getAllAlbumMappings.mockResolvedValue([
        createAlbumMapping({
          historyArtist: 'Radiohead',
          collectionArtist: 'Radiohead (UK)',
        }),
      ]);

      // Act
      await resolver.rebuild();

      // Assert
      expect(resolver.areSameArtist('Radiohead', 'Radiohead (UK)')).toBe(true);
    });

    it('should build from history artist mappings', async () => {
      // Arrange
      mockMappingService.getAllArtistMappings.mockResolvedValue([
        createArtistMapping({
          historyArtist: 'The Beatles',
          collectionArtist: 'Beatles, The',
        }),
      ]);

      // Act
      await resolver.rebuild();

      // Assert
      expect(resolver.areSameArtist('The Beatles', 'Beatles, The')).toBe(true);
    });

    it('should handle all three sources together', async () => {
      // Arrange
      (mockArtistMappingService.getAllMappings as jest.Mock).mockReturnValue([
        { discogsName: 'TOOL', lastfmName: 'Tool', dateAdded: Date.now() },
      ]);
      mockMappingService.getAllAlbumMappings.mockResolvedValue([
        createAlbumMapping({
          historyArtist: 'Pink Floyd',
          collectionArtist: 'Floyd, Pink',
        }),
      ]);
      mockMappingService.getAllArtistMappings.mockResolvedValue([
        createArtistMapping({
          historyArtist: 'The Beatles',
          collectionArtist: 'Beatles, The',
        }),
      ]);

      // Act
      await resolver.rebuild();

      // Assert
      expect(resolver.areSameArtist('TOOL', 'Tool')).toBe(true);
      expect(resolver.areSameArtist('Pink Floyd', 'Floyd, Pink')).toBe(true);
      expect(resolver.areSameArtist('The Beatles', 'Beatles, The')).toBe(true);
      // Different groups should NOT be same artist
      expect(resolver.areSameArtist('TOOL', 'Pink Floyd')).toBe(false);
    });
  });

  describe('Union-Find and Transitive Aliases', () => {
    it('should resolve A->B mapping so resolveArtist(A) === resolveArtist(B)', async () => {
      // Arrange
      (mockArtistMappingService.getAllMappings as jest.Mock).mockReturnValue([
        {
          discogsName: 'MF DOOM',
          lastfmName: 'MF Doom',
          dateAdded: Date.now(),
        },
      ]);

      // Act
      await resolver.rebuild();

      // Assert
      expect(resolver.resolveArtist('MF DOOM')).toBe(
        resolver.resolveArtist('MF Doom')
      );
    });

    it('should resolve transitive chains: if A->B and B->C, resolveArtist(A) === resolveArtist(C)', async () => {
      // Arrange - A->B via discogs mapping, B->C via album mapping
      (mockArtistMappingService.getAllMappings as jest.Mock).mockReturnValue([
        {
          discogsName: 'Variant A',
          lastfmName: 'Variant B',
          dateAdded: Date.now(),
        },
      ]);
      mockMappingService.getAllAlbumMappings.mockResolvedValue([
        createAlbumMapping({
          historyArtist: 'Variant B',
          collectionArtist: 'Variant C',
        }),
      ]);

      // Act
      await resolver.rebuild();

      // Assert
      expect(resolver.resolveArtist('Variant A')).toBe(
        resolver.resolveArtist('Variant C')
      );
      expect(resolver.areSameArtist('Variant A', 'Variant C')).toBe(true);
    });

    it('should handle self-referential mappings (A->A)', async () => {
      // Arrange
      (mockArtistMappingService.getAllMappings as jest.Mock).mockReturnValue([
        { discogsName: 'Tool', lastfmName: 'Tool', dateAdded: Date.now() },
      ]);

      // Act
      await resolver.rebuild();

      // Assert - should not throw and should resolve correctly
      expect(resolver.resolveArtist('Tool')).toBe('tool');
    });

    it('should be case insensitive: resolveArtist("TOOL") === resolveArtist("tool")', async () => {
      // Arrange
      (mockArtistMappingService.getAllMappings as jest.Mock).mockReturnValue([
        { discogsName: 'TOOL', lastfmName: 'Tool', dateAdded: Date.now() },
      ]);

      // Act
      await resolver.rebuild();

      // Assert
      expect(resolver.resolveArtist('TOOL')).toBe(
        resolver.resolveArtist('tool')
      );
      expect(resolver.resolveArtist('TOOL')).toBe(
        resolver.resolveArtist('Tool')
      );
    });
  });

  describe('resolveArtist', () => {
    it('should return canonical name for known alias', async () => {
      // Arrange
      (mockArtistMappingService.getAllMappings as jest.Mock).mockReturnValue([
        {
          discogsName: 'Woods, Billy',
          lastfmName: 'billy woods',
          dateAdded: Date.now(),
        },
      ]);
      await resolver.rebuild();

      // Act
      const result = resolver.resolveArtist('Woods, Billy');

      // Assert - canonical should be lastfmName lowercased
      expect(result).toBe('billy woods');
    });

    it('should return input lowercased for unknown name', () => {
      // Act
      const result = resolver.resolveArtist('Unknown Artist');

      // Assert
      expect(result).toBe('unknown artist');
    });

    it('should return empty string for empty input', () => {
      // Act
      const result = resolver.resolveArtist('');

      // Assert
      expect(result).toBe('');
    });

    it('should use the Last.fm/history name as canonical', async () => {
      // Arrange
      (mockArtistMappingService.getAllMappings as jest.Mock).mockReturnValue([
        {
          discogsName: 'Discogs Name',
          lastfmName: 'LastFM Name',
          dateAdded: Date.now(),
        },
      ]);
      await resolver.rebuild();

      // Act
      const fromDiscogs = resolver.resolveArtist('Discogs Name');
      const fromLastfm = resolver.resolveArtist('LastFM Name');

      // Assert - both should resolve to lastfm name lowercased
      expect(fromDiscogs).toBe('lastfm name');
      expect(fromLastfm).toBe('lastfm name');
    });
  });

  describe('getAliases', () => {
    it('should return all known variants for an artist', async () => {
      // Arrange
      (mockArtistMappingService.getAllMappings as jest.Mock).mockReturnValue([
        {
          discogsName: 'MF DOOM',
          lastfmName: 'mf doom',
          dateAdded: Date.now(),
        },
      ]);
      await resolver.rebuild();

      // Act
      const aliases = resolver.getAliases('MF DOOM');

      // Assert
      expect(aliases).toContain('mf doom');
      expect(aliases.length).toBeGreaterThanOrEqual(1);
    });

    it('should return array with the canonical name for unknown artist', () => {
      // Act
      const aliases = resolver.getAliases('Unknown Artist');

      // Assert
      expect(aliases).toEqual(['unknown artist']);
    });

    it('should return empty array for empty input', () => {
      // Act
      const aliases = resolver.getAliases('');

      // Assert
      expect(aliases).toEqual([]);
    });
  });

  describe('getDisplayName', () => {
    it('should return preferred display casing', async () => {
      // Arrange
      (mockArtistMappingService.getAllMappings as jest.Mock).mockReturnValue([
        {
          discogsName: 'woods, billy',
          lastfmName: 'Billy Woods',
          dateAdded: Date.now(),
        },
      ]);
      await resolver.rebuild();

      // Act
      const displayName = resolver.getDisplayName('woods, billy');

      // Assert
      expect(displayName).toBe('Billy Woods');
    });

    it('should fall back to input name for unknown artist', () => {
      // Act
      const displayName = resolver.getDisplayName('Unknown Artist');

      // Assert
      expect(displayName).toBe('Unknown Artist');
    });

    it('should return empty string for empty input', () => {
      // Act
      const displayName = resolver.getDisplayName('');

      // Assert
      expect(displayName).toBe('');
    });
  });

  describe('areSameArtist', () => {
    it('should return true for direct aliases', async () => {
      // Arrange
      (mockArtistMappingService.getAllMappings as jest.Mock).mockReturnValue([
        {
          discogsName: 'MF DOOM',
          lastfmName: 'MF Doom',
          dateAdded: Date.now(),
        },
      ]);
      await resolver.rebuild();

      // Act & Assert
      expect(resolver.areSameArtist('MF DOOM', 'MF Doom')).toBe(true);
    });

    it('should return true for transitive aliases', async () => {
      // Arrange
      (mockArtistMappingService.getAllMappings as jest.Mock).mockReturnValue([
        { discogsName: 'Name A', lastfmName: 'Name B', dateAdded: Date.now() },
      ]);
      mockMappingService.getAllAlbumMappings.mockResolvedValue([
        createAlbumMapping({
          historyArtist: 'Name B',
          collectionArtist: 'Name C',
        }),
      ]);
      await resolver.rebuild();

      // Act & Assert
      expect(resolver.areSameArtist('Name A', 'Name C')).toBe(true);
    });

    it('should return false for different artists', async () => {
      // Arrange
      (mockArtistMappingService.getAllMappings as jest.Mock).mockReturnValue([
        {
          discogsName: 'Artist A',
          lastfmName: 'Artist A2',
          dateAdded: Date.now(),
        },
        {
          discogsName: 'Artist B',
          lastfmName: 'Artist B2',
          dateAdded: Date.now(),
        },
      ]);
      await resolver.rebuild();

      // Act & Assert
      expect(resolver.areSameArtist('Artist A', 'Artist B')).toBe(false);
    });

    it('should return false for empty inputs', () => {
      // Act & Assert
      expect(resolver.areSameArtist('', 'Some Artist')).toBe(false);
      expect(resolver.areSameArtist('Some Artist', '')).toBe(false);
      expect(resolver.areSameArtist('', '')).toBe(false);
    });

    it('should be case insensitive', async () => {
      // Arrange
      (mockArtistMappingService.getAllMappings as jest.Mock).mockReturnValue([
        { discogsName: 'TOOL', lastfmName: 'Tool', dateAdded: Date.now() },
      ]);
      await resolver.rebuild();

      // Act & Assert
      expect(resolver.areSameArtist('tool', 'TOOL')).toBe(true);
      expect(resolver.areSameArtist('Tool', 'tOOL')).toBe(true);
    });
  });

  describe('detectMissingScrobbleMappings', () => {
    it('should detect when album mapping has different artists but no artist mapping exists', async () => {
      // Arrange
      mockMappingService.getAllAlbumMappings.mockResolvedValue([
        createAlbumMapping({
          historyArtist: 'Radiohead',
          collectionArtist: 'Radiohead (UK)',
        }),
      ]);
      (mockArtistMappingService.hasMapping as jest.Mock).mockReturnValue(false);
      await resolver.rebuild();

      // Act
      const missing = await resolver.detectMissingScrobbleMappings();

      // Assert
      expect(missing).toHaveLength(1);
      expect(missing[0].discogsName).toBe('Radiohead (UK)');
      expect(missing[0].lastfmName).toBe('Radiohead');
    });

    it('should return empty when all album mapping artists already have artist mappings', async () => {
      // Arrange
      mockMappingService.getAllAlbumMappings.mockResolvedValue([
        createAlbumMapping({
          historyArtist: 'Radiohead',
          collectionArtist: 'Radiohead (UK)',
        }),
      ]);
      (mockArtistMappingService.hasMapping as jest.Mock).mockReturnValue(true);
      await resolver.rebuild();

      // Act
      const missing = await resolver.detectMissingScrobbleMappings();

      // Assert
      expect(missing).toHaveLength(0);
    });

    it('should return empty when album mapping artists are the same (case insensitive)', async () => {
      // Arrange
      mockMappingService.getAllAlbumMappings.mockResolvedValue([
        createAlbumMapping({
          historyArtist: 'Radiohead',
          collectionArtist: 'radiohead',
        }),
      ]);
      await resolver.rebuild();

      // Act
      const missing = await resolver.detectMissingScrobbleMappings();

      // Assert
      expect(missing).toHaveLength(0);
    });

    it('should deduplicate results by discogsName (case-insensitive)', async () => {
      // Arrange
      mockMappingService.getAllAlbumMappings.mockResolvedValue([
        createAlbumMapping({
          historyArtist: 'Radiohead',
          historyAlbum: 'OK Computer',
          collectionArtist: 'Radiohead (UK)',
        }),
        createAlbumMapping({
          historyArtist: 'Radiohead',
          historyAlbum: 'Kid A',
          collectionArtist: 'radiohead (uk)',
        }),
      ]);
      (mockArtistMappingService.hasMapping as jest.Mock).mockReturnValue(false);
      await resolver.rebuild();

      // Act
      const missing = await resolver.detectMissingScrobbleMappings();

      // Assert
      expect(missing).toHaveLength(1);
    });

    it('should skip mappings with empty artist names', async () => {
      // Arrange
      mockMappingService.getAllAlbumMappings.mockResolvedValue([
        createAlbumMapping({
          historyArtist: '',
          collectionArtist: 'Some Artist',
        }),
        createAlbumMapping({
          historyArtist: 'Some Artist',
          collectionArtist: '',
        }),
      ]);
      await resolver.rebuild();

      // Act
      const missing = await resolver.detectMissingScrobbleMappings();

      // Assert
      expect(missing).toHaveLength(0);
    });
  });

  describe('rebuild', () => {
    it('should clear and rebuild from scratch', async () => {
      // Arrange - build with some mappings
      (mockArtistMappingService.getAllMappings as jest.Mock).mockReturnValue([
        {
          discogsName: 'Old Alias',
          lastfmName: 'Old Canonical',
          dateAdded: Date.now(),
        },
      ]);
      await resolver.rebuild();
      expect(resolver.areSameArtist('Old Alias', 'Old Canonical')).toBe(true);

      // Now rebuild with different mappings
      (mockArtistMappingService.getAllMappings as jest.Mock).mockReturnValue([
        {
          discogsName: 'New Alias',
          lastfmName: 'New Canonical',
          dateAdded: Date.now(),
        },
      ]);

      // Act
      await resolver.rebuild();

      // Assert - old mappings should be gone, new ones present
      expect(resolver.areSameArtist('Old Alias', 'Old Canonical')).toBe(false);
      expect(resolver.areSameArtist('New Alias', 'New Canonical')).toBe(true);
    });

    it('should handle newly added mappings after rebuild', async () => {
      // Arrange - first build with one mapping
      (mockArtistMappingService.getAllMappings as jest.Mock).mockReturnValue([
        { discogsName: 'A', lastfmName: 'B', dateAdded: Date.now() },
      ]);
      await resolver.rebuild();

      // Add a new mapping and rebuild
      (mockArtistMappingService.getAllMappings as jest.Mock).mockReturnValue([
        { discogsName: 'A', lastfmName: 'B', dateAdded: Date.now() },
        { discogsName: 'C', lastfmName: 'D', dateAdded: Date.now() },
      ]);

      // Act
      await resolver.rebuild();

      // Assert
      expect(resolver.areSameArtist('A', 'B')).toBe(true);
      expect(resolver.areSameArtist('C', 'D')).toBe(true);
      expect(resolver.areSameArtist('A', 'C')).toBe(false);
    });
  });
});
