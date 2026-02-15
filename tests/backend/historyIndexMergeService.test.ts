import { ArtistNameResolver } from '../../src/backend/services/artistNameResolver';
import { HistoryIndexMergeService } from '../../src/backend/services/historyIndexMergeService';
import { FileStorage } from '../../src/backend/utils/fileStorage';
import { ScrobbleHistoryIndex, MergeProposal } from '../../src/shared/types';

// Factory for creating history index test data
const createHistoryIndex = (
  albums: ScrobbleHistoryIndex['albums'] = {}
): ScrobbleHistoryIndex => ({
  lastSyncTimestamp: Date.now(),
  totalScrobbles: 100,
  oldestScrobbleDate: 1600000000,
  albums,
});

describe('HistoryIndexMergeService', () => {
  let service: HistoryIndexMergeService;
  let mockResolver: {
    resolveArtist: jest.Mock;
  };
  let mockFileStorage: {
    readJSON: jest.Mock;
    writeJSON: jest.Mock;
    createBackup: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockResolver = {
      resolveArtist: jest.fn((name: string) => name.toLowerCase()),
    };

    mockFileStorage = {
      readJSON: jest.fn().mockResolvedValue(null),
      writeJSON: jest.fn().mockResolvedValue(undefined),
      createBackup: jest.fn().mockResolvedValue('/backup/path'),
    };

    service = new HistoryIndexMergeService(
      mockResolver as unknown as ArtistNameResolver,
      mockFileStorage as unknown as FileStorage
    );
  });

  describe('findSplitEntries', () => {
    it('should return empty array when no index exists', async () => {
      // Arrange
      mockFileStorage.readJSON.mockResolvedValue(null);

      // Act
      const proposals = await service.findSplitEntries();

      // Assert
      expect(proposals).toEqual([]);
    });

    it('should return empty array when no splits found', async () => {
      // Arrange
      const index = createHistoryIndex({
        'radiohead|ok computer': {
          lastPlayed: 1700000000,
          playCount: 5,
          plays: [{ timestamp: 1700000000 }, { timestamp: 1699000000 }],
        },
        'tool|lateralus': {
          lastPlayed: 1698000000,
          playCount: 3,
          plays: [{ timestamp: 1698000000 }],
        },
      });
      mockFileStorage.readJSON.mockResolvedValue(index);

      // Act
      const proposals = await service.findSplitEntries();

      // Assert
      expect(proposals).toEqual([]);
    });

    it('should find split entries where same album exists under different artist variants', async () => {
      // Arrange
      mockResolver.resolveArtist.mockImplementation((name: string) => {
        const lower = name.toLowerCase();
        if (lower === 'billy woods' || lower === 'billy woods, kenny segal') {
          return 'billy woods';
        }
        return lower;
      });

      const index = createHistoryIndex({
        'billy woods|hiding places': {
          lastPlayed: 1700000000,
          playCount: 3,
          plays: [
            { timestamp: 1700000000 },
            { timestamp: 1699000000 },
            { timestamp: 1698000000 },
          ],
        },
        'billy woods, kenny segal|hiding places': {
          lastPlayed: 1697000000,
          playCount: 2,
          plays: [{ timestamp: 1697000000 }, { timestamp: 1696000000 }],
        },
      });
      mockFileStorage.readJSON.mockResolvedValue(index);

      // Act
      const proposals = await service.findSplitEntries();

      // Assert
      expect(proposals).toHaveLength(1);
      expect(proposals[0].targetKey).toBe('billy woods|hiding places');
      expect(proposals[0].sourceKey).toBe(
        'billy woods, kenny segal|hiding places'
      );
      expect(proposals[0].mergedPlayCount).toBe(5);
    });

    it('should correctly pick canonical key', async () => {
      // Arrange - resolver returns 'radiohead' for both
      mockResolver.resolveArtist.mockImplementation((name: string) => {
        if (
          name.toLowerCase() === 'radiohead' ||
          name.toLowerCase() === 'radiohead (uk)'
        ) {
          return 'radiohead';
        }
        return name.toLowerCase();
      });

      const index = createHistoryIndex({
        'radiohead (uk)|ok computer': {
          lastPlayed: 1700000000,
          playCount: 2,
          plays: [{ timestamp: 1700000000 }, { timestamp: 1699000000 }],
        },
        'radiohead|ok computer': {
          lastPlayed: 1698000000,
          playCount: 1,
          plays: [{ timestamp: 1698000000 }],
        },
      });
      mockFileStorage.readJSON.mockResolvedValue(index);

      // Act
      const proposals = await service.findSplitEntries();

      // Assert
      expect(proposals).toHaveLength(1);
      // 'radiohead' matches resolved name so it should be canonical
      expect(proposals[0].targetKey).toBe('radiohead|ok computer');
      expect(proposals[0].sourceKey).toBe('radiohead (uk)|ok computer');
    });

    it('should handle multiple split groups', async () => {
      // Arrange
      mockResolver.resolveArtist.mockImplementation((name: string) => {
        const lower = name.toLowerCase();
        if (lower === 'mf doom' || lower === 'mf doom (metal face)')
          return 'mf doom';
        if (lower === 'tool' || lower === 'tool (band)') return 'tool';
        return lower;
      });

      const index = createHistoryIndex({
        'mf doom|mm..food': {
          lastPlayed: 1700000000,
          playCount: 3,
          plays: [{ timestamp: 1700000000 }],
        },
        'mf doom (metal face)|mm..food': {
          lastPlayed: 1699000000,
          playCount: 1,
          plays: [{ timestamp: 1699000000 }],
        },
        'tool|lateralus': {
          lastPlayed: 1698000000,
          playCount: 5,
          plays: [{ timestamp: 1698000000 }],
        },
        'tool (band)|lateralus': {
          lastPlayed: 1697000000,
          playCount: 2,
          plays: [{ timestamp: 1697000000 }],
        },
      });
      mockFileStorage.readJSON.mockResolvedValue(index);

      // Act
      const proposals = await service.findSplitEntries();

      // Assert
      expect(proposals).toHaveLength(2);
      const sourceKeys = proposals.map(p => p.sourceKey).sort();
      expect(sourceKeys).toContain('mf doom (metal face)|mm..food');
      expect(sourceKeys).toContain('tool (band)|lateralus');
    });
  });

  describe('executeMerge', () => {
    it('should merge plays arrays with dedup by timestamp', async () => {
      // Arrange
      const index = createHistoryIndex({
        'radiohead|ok computer': {
          lastPlayed: 1700000000,
          playCount: 2,
          plays: [{ timestamp: 1700000000 }, { timestamp: 1698000000 }],
        },
        'radiohead (uk)|ok computer': {
          lastPlayed: 1699000000,
          playCount: 2,
          plays: [
            { timestamp: 1699000000 },
            { timestamp: 1698000000 }, // duplicate timestamp
          ],
        },
      });
      mockFileStorage.readJSON.mockResolvedValue(index);

      const proposals: MergeProposal[] = [
        {
          sourceKey: 'radiohead (uk)|ok computer',
          targetKey: 'radiohead|ok computer',
          sourcePlayCount: 2,
          targetPlayCount: 2,
          mergedPlayCount: 3,
        },
      ];

      // Act
      const report = await service.executeMerge(proposals);

      // Assert
      expect(report.mergedCount).toBe(1);
      // Verify writeJSON was called with merged data
      const writtenIndex = mockFileStorage.writeJSON.mock
        .calls[0][1] as ScrobbleHistoryIndex;
      expect(writtenIndex.albums['radiohead|ok computer'].plays).toHaveLength(
        3
      );
    });

    it('should update playCount to merged count', async () => {
      // Arrange
      const index = createHistoryIndex({
        'artist|album': {
          lastPlayed: 1700000000,
          playCount: 2,
          plays: [{ timestamp: 1700000000 }, { timestamp: 1699000000 }],
        },
        'artist variant|album': {
          lastPlayed: 1698000000,
          playCount: 1,
          plays: [{ timestamp: 1698000000 }],
        },
      });
      mockFileStorage.readJSON.mockResolvedValue(index);

      const proposals: MergeProposal[] = [
        {
          sourceKey: 'artist variant|album',
          targetKey: 'artist|album',
          sourcePlayCount: 1,
          targetPlayCount: 2,
          mergedPlayCount: 3,
        },
      ];

      // Act
      await service.executeMerge(proposals);

      // Assert
      const writtenIndex = mockFileStorage.writeJSON.mock
        .calls[0][1] as ScrobbleHistoryIndex;
      expect(writtenIndex.albums['artist|album'].playCount).toBe(3);
    });

    it('should take max lastPlayed', async () => {
      // Arrange
      const index = createHistoryIndex({
        'artist|album': {
          lastPlayed: 1698000000,
          playCount: 1,
          plays: [{ timestamp: 1698000000 }],
        },
        'artist variant|album': {
          lastPlayed: 1700000000, // more recent
          playCount: 1,
          plays: [{ timestamp: 1700000000 }],
        },
      });
      mockFileStorage.readJSON.mockResolvedValue(index);

      const proposals: MergeProposal[] = [
        {
          sourceKey: 'artist variant|album',
          targetKey: 'artist|album',
          sourcePlayCount: 1,
          targetPlayCount: 1,
          mergedPlayCount: 2,
        },
      ];

      // Act
      await service.executeMerge(proposals);

      // Assert
      const writtenIndex = mockFileStorage.writeJSON.mock
        .calls[0][1] as ScrobbleHistoryIndex;
      expect(writtenIndex.albums['artist|album'].lastPlayed).toBe(1700000000);
    });

    it('should delete source entries from index', async () => {
      // Arrange
      const index = createHistoryIndex({
        'artist|album': {
          lastPlayed: 1700000000,
          playCount: 1,
          plays: [{ timestamp: 1700000000 }],
        },
        'artist variant|album': {
          lastPlayed: 1699000000,
          playCount: 1,
          plays: [{ timestamp: 1699000000 }],
        },
      });
      mockFileStorage.readJSON.mockResolvedValue(index);

      const proposals: MergeProposal[] = [
        {
          sourceKey: 'artist variant|album',
          targetKey: 'artist|album',
          sourcePlayCount: 1,
          targetPlayCount: 1,
          mergedPlayCount: 2,
        },
      ];

      // Act
      await service.executeMerge(proposals);

      // Assert
      const writtenIndex = mockFileStorage.writeJSON.mock
        .calls[0][1] as ScrobbleHistoryIndex;
      expect(writtenIndex.albums['artist variant|album']).toBeUndefined();
      expect(writtenIndex.albums['artist|album']).toBeDefined();
    });

    it('should create backup before merging', async () => {
      // Arrange
      const index = createHistoryIndex({
        'artist|album': {
          lastPlayed: 1700000000,
          playCount: 1,
          plays: [{ timestamp: 1700000000 }],
        },
        'artist variant|album': {
          lastPlayed: 1699000000,
          playCount: 1,
          plays: [{ timestamp: 1699000000 }],
        },
      });
      mockFileStorage.readJSON.mockResolvedValue(index);

      const proposals: MergeProposal[] = [
        {
          sourceKey: 'artist variant|album',
          targetKey: 'artist|album',
          sourcePlayCount: 1,
          targetPlayCount: 1,
          mergedPlayCount: 2,
        },
      ];

      // Act
      const report = await service.executeMerge(proposals);

      // Assert
      expect(mockFileStorage.createBackup).toHaveBeenCalledWith(
        'history/scrobble-history-index.json'
      );
      expect(mockFileStorage.createBackup).toHaveBeenCalledTimes(1);
      expect(report.backupPath).toBe('/backup/path');
    });

    it('should handle empty proposals array', async () => {
      // Act
      const report = await service.executeMerge([]);

      // Assert
      expect(report.mergedCount).toBe(0);
      expect(report.proposals).toEqual([]);
      expect(report.backupPath).toBe('');
      expect(mockFileStorage.readJSON).not.toHaveBeenCalled();
      expect(mockFileStorage.createBackup).not.toHaveBeenCalled();
    });

    it('should skip proposals where source or target entries no longer exist', async () => {
      // Arrange - index only has the target, source was already removed
      const index = createHistoryIndex({
        'artist|album': {
          lastPlayed: 1700000000,
          playCount: 3,
          plays: [{ timestamp: 1700000000 }],
        },
      });
      mockFileStorage.readJSON.mockResolvedValue(index);

      const proposals: MergeProposal[] = [
        {
          sourceKey: 'nonexistent|album',
          targetKey: 'artist|album',
          sourcePlayCount: 1,
          targetPlayCount: 3,
          mergedPlayCount: 4,
        },
      ];

      // Act
      const report = await service.executeMerge(proposals);

      // Assert
      expect(report.mergedCount).toBe(0);
      // writeJSON should still be called (after backup)
      const writtenIndex = mockFileStorage.writeJSON.mock
        .calls[0][1] as ScrobbleHistoryIndex;
      // Target should be unmodified
      expect(writtenIndex.albums['artist|album'].playCount).toBe(3);
    });

    it('should throw when history index not found during merge', async () => {
      // Arrange
      mockFileStorage.readJSON.mockResolvedValue(null);

      const proposals: MergeProposal[] = [
        {
          sourceKey: 'a|b',
          targetKey: 'c|d',
          sourcePlayCount: 1,
          targetPlayCount: 1,
          mergedPlayCount: 2,
        },
      ];

      // Act & Assert
      await expect(service.executeMerge(proposals)).rejects.toThrow(
        'History index not found, cannot execute merge'
      );
    });
  });
});
