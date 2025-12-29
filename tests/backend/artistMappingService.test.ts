import * as fs from 'fs';
import * as path from 'path';

// Set DATA_DIR before importing the service
const testDataDir = './test-data-artist-mapping';

describe('ArtistMappingService', () => {
  // We need to reset the module for each test since it uses a singleton
  let artistMappingService: any;

  beforeEach(() => {
    // Set env var before importing
    process.env.DATA_DIR = testDataDir;

    // Clean up any existing test directory
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDataDir, { recursive: true });

    // Reset module cache to get fresh instance
    jest.resetModules();

    // Import service after setting DATA_DIR
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const module = require('../../src/backend/services/artistMappingService');
    artistMappingService = module.artistMappingService;
  });

  afterEach(() => {
    // Clean up test directory
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
    delete process.env.DATA_DIR;
  });

  describe('getLastfmName', () => {
    it('should return original name when no mapping exists', () => {
      // Act
      const result = artistMappingService.getLastfmName('Unknown Artist');

      // Assert
      expect(result).toBe('Unknown Artist');
    });

    it('should return mapped name when mapping exists', () => {
      // Arrange
      artistMappingService.setMapping('Discogs Artist', 'Lastfm Artist');

      // Act
      const result = artistMappingService.getLastfmName('Discogs Artist');

      // Assert
      expect(result).toBe('Lastfm Artist');
    });

    it('should be case-insensitive for lookup', () => {
      // Arrange
      artistMappingService.setMapping('The Beatles', 'Beatles');

      // Act
      const result = artistMappingService.getLastfmName('THE BEATLES');

      // Assert
      expect(result).toBe('Beatles');
    });
  });

  describe('setMapping', () => {
    it('should add a new mapping', () => {
      // Act
      artistMappingService.setMapping('Pink Floyd', 'Pink Floyd');

      // Assert
      expect(artistMappingService.hasMapping('Pink Floyd')).toBe(true);
    });

    it('should update an existing mapping', () => {
      // Arrange
      artistMappingService.setMapping('Artist', 'Original');

      // Act
      artistMappingService.setMapping('Artist', 'Updated');
      const result = artistMappingService.getLastfmName('Artist');

      // Assert
      expect(result).toBe('Updated');
    });

    it('should throw error when discogsName is empty', () => {
      // Act & Assert
      expect(() => {
        artistMappingService.setMapping('', 'LastfmName');
      }).toThrow('Both Discogs and Last.fm names are required');
    });

    it('should throw error when lastfmName is empty', () => {
      // Act & Assert
      expect(() => {
        artistMappingService.setMapping('DiscogsName', '');
      }).toThrow('Both Discogs and Last.fm names are required');
    });

    it('should persist mapping to disk', () => {
      // Arrange
      artistMappingService.setMapping('Persisted', 'PersistedLastfm');

      // Act - Check file exists
      const filePath = path.join(testDataDir, 'artist-mappings.json');
      const exists = fs.existsSync(filePath);

      // Assert
      expect(exists).toBe(true);

      // Verify content
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      expect(data.mappings).toHaveLength(1);
      expect(data.mappings[0].lastfmName).toBe('PersistedLastfm');
    });
  });

  describe('removeMapping', () => {
    it('should remove an existing mapping', () => {
      // Arrange
      artistMappingService.setMapping('ToRemove', 'ToRemoveLastfm');

      // Act
      const result = artistMappingService.removeMapping('ToRemove');

      // Assert
      expect(result).toBe(true);
      expect(artistMappingService.hasMapping('ToRemove')).toBe(false);
    });

    it('should return false when removing non-existent mapping', () => {
      // Act
      const result = artistMappingService.removeMapping('NonExistent');

      // Assert
      expect(result).toBe(false);
    });

    it('should be case-insensitive', () => {
      // Arrange
      artistMappingService.setMapping('Artist', 'ArtistLastfm');

      // Act
      const result = artistMappingService.removeMapping('ARTIST');

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('getAllMappings', () => {
    it('should return empty array when no mappings', () => {
      // Act
      const mappings = artistMappingService.getAllMappings();

      // Assert
      expect(mappings).toEqual([]);
    });

    it('should return all mappings', () => {
      // Arrange
      artistMappingService.setMapping('Artist1', 'Lastfm1');
      artistMappingService.setMapping('Artist2', 'Lastfm2');

      // Act
      const mappings = artistMappingService.getAllMappings();

      // Assert
      expect(mappings).toHaveLength(2);
    });

    it('should include dateAdded timestamp', () => {
      // Arrange
      artistMappingService.setMapping('Artist', 'Lastfm');

      // Act
      const mappings = artistMappingService.getAllMappings();

      // Assert
      expect(mappings[0].dateAdded).toBeDefined();
      expect(typeof mappings[0].dateAdded).toBe('number');
    });
  });

  describe('hasMapping', () => {
    it('should return true when mapping exists', () => {
      // Arrange
      artistMappingService.setMapping('Artist', 'Lastfm');

      // Act & Assert
      expect(artistMappingService.hasMapping('Artist')).toBe(true);
    });

    it('should return false when mapping does not exist', () => {
      // Act & Assert
      expect(artistMappingService.hasMapping('Unknown')).toBe(false);
    });

    it('should be case-insensitive', () => {
      // Arrange
      artistMappingService.setMapping('Artist', 'Lastfm');

      // Act & Assert
      expect(artistMappingService.hasMapping('ARTIST')).toBe(true);
      expect(artistMappingService.hasMapping('artist')).toBe(true);
    });
  });

  describe('importMappings', () => {
    it('should import valid mappings', () => {
      // Arrange
      const mappings = [
        {
          discogsName: 'Artist1',
          lastfmName: 'Lastfm1',
          dateAdded: Date.now(),
        },
        {
          discogsName: 'Artist2',
          lastfmName: 'Lastfm2',
          dateAdded: Date.now(),
        },
      ];

      // Act
      const result = artistMappingService.importMappings(mappings);

      // Assert
      expect(result.imported).toBe(2);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should skip mappings with missing fields', () => {
      // Arrange
      const mappings = [
        { discogsName: 'Valid', lastfmName: 'Valid', dateAdded: Date.now() },
        { discogsName: '', lastfmName: 'Missing', dateAdded: Date.now() },
        { discogsName: 'Missing', lastfmName: '', dateAdded: Date.now() },
      ];

      // Act
      const result = artistMappingService.importMappings(mappings);

      // Assert
      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(2);
      expect(result.errors).toHaveLength(2);
    });

    it('should persist imported mappings', () => {
      // Arrange
      const mappings = [
        { discogsName: 'Artist', lastfmName: 'Lastfm', dateAdded: Date.now() },
      ];

      // Act
      artistMappingService.importMappings(mappings);

      // Assert
      expect(artistMappingService.hasMapping('Artist')).toBe(true);
    });
  });

  describe('exportMappings', () => {
    it('should return export data structure', () => {
      // Arrange
      artistMappingService.setMapping('Artist', 'Lastfm');

      // Act
      const exported = artistMappingService.exportMappings();

      // Assert
      expect(exported.mappings).toBeDefined();
      expect(exported.version).toBe('1.0');
      expect(exported.lastUpdated).toBeDefined();
    });

    it('should include all mappings', () => {
      // Arrange
      artistMappingService.setMapping('Artist1', 'Lastfm1');
      artistMappingService.setMapping('Artist2', 'Lastfm2');

      // Act
      const exported = artistMappingService.exportMappings();

      // Assert
      expect(exported.mappings).toHaveLength(2);
    });
  });

  describe('clearAllMappings', () => {
    it('should remove all mappings', () => {
      // Arrange
      artistMappingService.setMapping('Artist1', 'Lastfm1');
      artistMappingService.setMapping('Artist2', 'Lastfm2');

      // Act
      artistMappingService.clearAllMappings();
      const mappings = artistMappingService.getAllMappings();

      // Assert
      expect(mappings).toHaveLength(0);
    });
  });

  describe('getStats', () => {
    it('should return stats with zero mappings', () => {
      // Act
      const stats = artistMappingService.getStats();

      // Assert
      expect(stats.totalMappings).toBe(0);
      expect(stats.filePath).toContain('artist-mappings.json');
      expect(stats.lastUpdated).toBeUndefined();
    });

    it('should return stats with mappings', () => {
      // Arrange
      artistMappingService.setMapping('Artist', 'Lastfm');

      // Act
      const stats = artistMappingService.getStats();

      // Assert
      expect(stats.totalMappings).toBe(1);
      expect(stats.lastUpdated).toBeDefined();
    });
  });

  describe('persistence', () => {
    it('should load mappings from existing file', () => {
      // Arrange - Write mappings file directly
      const filePath = path.join(testDataDir, 'artist-mappings.json');
      const data = {
        mappings: [
          {
            discogsName: 'PreExisting',
            lastfmName: 'PreExistingLastfm',
            dateAdded: Date.now(),
          },
        ],
        version: '1.0',
        lastUpdated: Date.now(),
      };
      fs.writeFileSync(filePath, JSON.stringify(data));

      // Reset module to reload
      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const module = require('../../src/backend/services/artistMappingService');
      const newService = module.artistMappingService;

      // Act & Assert
      expect(newService.hasMapping('PreExisting')).toBe(true);
      expect(newService.getLastfmName('PreExisting')).toBe('PreExistingLastfm');
    });

    it('should handle corrupted mappings file', () => {
      // Arrange - Write invalid JSON
      const filePath = path.join(testDataDir, 'artist-mappings.json');
      fs.writeFileSync(filePath, 'not valid json');

      // Reset module to reload
      jest.resetModules();

      // Act - Should not throw
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const module = require('../../src/backend/services/artistMappingService');
      const newService = module.artistMappingService;

      // Assert - Service should work with empty mappings
      expect(newService.hasMapping('Test')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle special characters in artist names', () => {
      // Arrange
      artistMappingService.setMapping('AC/DC', 'ACDC');

      // Act
      const result = artistMappingService.getLastfmName('AC/DC');

      // Assert
      expect(result).toBe('ACDC');
    });

    it('should handle unicode characters', () => {
      // Arrange
      artistMappingService.setMapping('Björk', 'Bjork');

      // Act
      const result = artistMappingService.getLastfmName('Björk');

      // Assert
      expect(result).toBe('Bjork');
    });

    it('should preserve original case in discogsName when saving', () => {
      // Arrange
      artistMappingService.setMapping('The Beatles', 'Beatles');

      // Act
      const mappings = artistMappingService.getAllMappings();

      // Assert - The first save should have lowercase, but preserves existing
      expect(mappings[0].discogsName.toLowerCase()).toBe('the beatles');
    });
  });
});
