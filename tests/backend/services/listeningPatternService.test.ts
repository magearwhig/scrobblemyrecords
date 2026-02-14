import { ListeningPatternService } from '../../../src/backend/services/listeningPatternService';
import { ScrobbleHistoryStorage } from '../../../src/backend/services/scrobbleHistoryStorage';
import { FileStorage } from '../../../src/backend/utils/fileStorage';
import { ScrobbleHistoryIndex } from '../../../src/shared/types';

// Mock dependencies
jest.mock('../../../src/backend/services/scrobbleHistoryStorage');
jest.mock('../../../src/backend/utils/fileStorage');

const MockedHistoryStorage = ScrobbleHistoryStorage as jest.MockedClass<
  typeof ScrobbleHistoryStorage
>;
const MockedFileStorage = FileStorage as jest.MockedClass<typeof FileStorage>;

describe('ListeningPatternService', () => {
  let service: ListeningPatternService;
  let mockHistoryStorage: jest.Mocked<ScrobbleHistoryStorage>;

  // Helper: create a timestamp in seconds from a date string
  const ts = (dateStr: string): number =>
    Math.floor(new Date(dateStr).getTime() / 1000);

  // Sample index with sessions across different times
  const createSampleIndex = (): ScrobbleHistoryIndex => ({
    lastSyncTimestamp: Date.now() / 1000,
    totalScrobbles: 50,
    oldestScrobbleDate: ts('2025-07-01T00:00:00Z'),
    albums: {
      'radiohead|ok computer': {
        lastPlayed: ts('2025-12-15T21:00:00Z'),
        playCount: 20,
        plays: [
          // Session 1: Monday evening (Dec 15, 2025 ~8 PM)
          { timestamp: ts('2025-12-15T20:00:00Z'), track: 'Paranoid Android' },
          { timestamp: ts('2025-12-15T20:05:00Z'), track: 'Karma Police' },
          { timestamp: ts('2025-12-15T20:10:00Z'), track: 'Lucky' },
          { timestamp: ts('2025-12-15T21:00:00Z'), track: 'No Surprises' },
          // Session 2: Saturday afternoon (Dec 13, 2025 ~2 PM)
          { timestamp: ts('2025-12-13T14:00:00Z'), track: 'Airbag' },
          { timestamp: ts('2025-12-13T14:05:00Z'), track: 'Let Down' },
        ],
      },
      'pink floyd|dark side of the moon': {
        lastPlayed: ts('2025-12-10T19:30:00Z'),
        playCount: 15,
        plays: [
          // Session 3: Wednesday evening (Dec 10, 2025 ~7 PM)
          { timestamp: ts('2025-12-10T19:00:00Z'), track: 'Money' },
          { timestamp: ts('2025-12-10T19:10:00Z'), track: 'Time' },
          { timestamp: ts('2025-12-10T19:30:00Z'), track: 'Brain Damage' },
        ],
      },
      'boards of canada|music has the right to children': {
        lastPlayed: ts('2025-12-06T10:00:00Z'),
        playCount: 10,
        plays: [
          // Session 4: Saturday morning (Dec 6, 2025 ~10 AM)
          { timestamp: ts('2025-12-06T10:00:00Z'), track: 'Roygbiv' },
          { timestamp: ts('2025-12-06T10:20:00Z'), track: 'Aquarius' },
        ],
      },
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();

    const mockFileStorage = new MockedFileStorage(
      'test'
    ) as jest.Mocked<FileStorage>;
    mockHistoryStorage = new MockedHistoryStorage(
      mockFileStorage
    ) as jest.Mocked<ScrobbleHistoryStorage>;

    service = new ListeningPatternService(mockHistoryStorage);
  });

  describe('getPatterns', () => {
    it('should return null when no index exists', async () => {
      // Arrange
      mockHistoryStorage.getIndex.mockResolvedValue(null);

      // Act
      const result = await service.getPatterns();

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when index has no albums', async () => {
      // Arrange
      mockHistoryStorage.getIndex.mockResolvedValue({
        lastSyncTimestamp: Date.now() / 1000,
        totalScrobbles: 0,
        oldestScrobbleDate: 0,
        albums: {},
      });

      // Act
      const result = await service.getPatterns();

      // Assert
      expect(result).toBeNull();
    });

    it('should calculate patterns from scrobble history', async () => {
      // Arrange
      mockHistoryStorage.getIndex.mockResolvedValue(createSampleIndex());

      // Act
      const result = await service.getPatterns();

      // Assert
      expect(result).not.toBeNull();
      expect(result!.sessionCount).toBeGreaterThan(0);
      expect(result!.typicalStartTimes).toHaveLength(7);
      expect(result!.averageSessionLengthMinutes).toBeGreaterThan(0);
      expect(result!.averageAlbumsPerSession).toBeGreaterThan(0);
      expect(result!.lastCalculated).toBeGreaterThan(0);
    });

    it('should cache patterns and not recalculate within TTL', async () => {
      // Arrange
      mockHistoryStorage.getIndex.mockResolvedValue(createSampleIndex());

      // Act
      const result1 = await service.getPatterns();
      const result2 = await service.getPatterns();

      // Assert - getIndex called only once for initial calculation
      expect(result1).toEqual(result2);
      expect(mockHistoryStorage.getIndex).toHaveBeenCalledTimes(1);
    });
  });

  describe('calculatePatterns', () => {
    it('should return null when no plays exist within analysis window', async () => {
      // Arrange: all plays are very old (> 180 days ago)
      const oldIndex: ScrobbleHistoryIndex = {
        lastSyncTimestamp: Date.now() / 1000,
        totalScrobbles: 10,
        oldestScrobbleDate: ts('2020-01-01T00:00:00Z'),
        albums: {
          'old artist|old album': {
            lastPlayed: ts('2020-06-01T20:00:00Z'),
            playCount: 10,
            plays: [
              { timestamp: ts('2020-06-01T20:00:00Z'), track: 'Old Song' },
            ],
          },
        },
      };
      mockHistoryStorage.getIndex.mockResolvedValue(oldIndex);

      // Act
      const result = await service.calculatePatterns();

      // Assert
      expect(result).toBeNull();
    });

    it('should detect separate sessions based on 60-minute gap', async () => {
      // Arrange: two clusters of plays separated by > 60 min
      const index: ScrobbleHistoryIndex = {
        lastSyncTimestamp: Date.now() / 1000,
        totalScrobbles: 6,
        oldestScrobbleDate: ts('2025-12-01T00:00:00Z'),
        albums: {
          'artist|album1': {
            lastPlayed: ts('2025-12-15T22:00:00Z'),
            playCount: 3,
            plays: [
              // Session A: 8 PM
              { timestamp: ts('2025-12-15T20:00:00Z'), track: 'Track 1' },
              { timestamp: ts('2025-12-15T20:05:00Z'), track: 'Track 2' },
              { timestamp: ts('2025-12-15T20:10:00Z'), track: 'Track 3' },
            ],
          },
          'artist|album2': {
            lastPlayed: ts('2025-12-15T23:00:00Z'),
            playCount: 3,
            plays: [
              // Session B: 10 PM (> 60 min gap from 8:10 PM)
              { timestamp: ts('2025-12-15T22:00:00Z'), track: 'Track A' },
              { timestamp: ts('2025-12-15T22:05:00Z'), track: 'Track B' },
              { timestamp: ts('2025-12-15T23:00:00Z'), track: 'Track C' },
            ],
          },
        },
      };
      mockHistoryStorage.getIndex.mockResolvedValue(index);

      // Act
      const result = await service.calculatePatterns();

      // Assert
      expect(result).not.toBeNull();
      expect(result!.sessionCount).toBe(2);
    });

    it('should merge plays within 60 minutes into one session', async () => {
      // Arrange: plays within 60 min of each other
      const index: ScrobbleHistoryIndex = {
        lastSyncTimestamp: Date.now() / 1000,
        totalScrobbles: 4,
        oldestScrobbleDate: ts('2025-12-01T00:00:00Z'),
        albums: {
          'artist|album': {
            lastPlayed: ts('2025-12-15T20:45:00Z'),
            playCount: 4,
            plays: [
              { timestamp: ts('2025-12-15T20:00:00Z'), track: 'T1' },
              { timestamp: ts('2025-12-15T20:15:00Z'), track: 'T2' },
              { timestamp: ts('2025-12-15T20:30:00Z'), track: 'T3' },
              { timestamp: ts('2025-12-15T20:45:00Z'), track: 'T4' },
            ],
          },
        },
      };
      mockHistoryStorage.getIndex.mockResolvedValue(index);

      // Act
      const result = await service.calculatePatterns();

      // Assert
      expect(result).not.toBeNull();
      expect(result!.sessionCount).toBe(1);
    });

    it('should compute typical start times for different days of week', async () => {
      // Arrange
      mockHistoryStorage.getIndex.mockResolvedValue(createSampleIndex());

      // Act
      const result = await service.calculatePatterns();

      // Assert
      expect(result).not.toBeNull();
      expect(result!.typicalStartTimes).toHaveLength(7);
      // Each entry should have dayOfWeek 0-6
      for (let i = 0; i < 7; i++) {
        expect(result!.typicalStartTimes[i].dayOfWeek).toBe(i);
      }
    });

    it('should compute weekday vs weekend peak hours', async () => {
      // Arrange
      mockHistoryStorage.getIndex.mockResolvedValue(createSampleIndex());

      // Act
      const result = await service.calculatePatterns();

      // Assert
      expect(result).not.toBeNull();
      expect(result!.weekdayPattern).toBeDefined();
      expect(result!.weekendPattern).toBeDefined();
      expect(typeof result!.weekdayPattern.peakHour).toBe('number');
      expect(typeof result!.weekendPattern.peakHour).toBe('number');
    });
  });

  describe('checkConflicts', () => {
    it('should return no conflicts when index is null', async () => {
      // Arrange
      mockHistoryStorage.getIndex.mockResolvedValue(null);

      // Act
      const result = await service.checkConflicts(1000000, 2000000);

      // Assert
      expect(result.hasConflicts).toBe(false);
    });

    it('should detect conflicts within the time window', async () => {
      // Arrange
      const index = createSampleIndex();
      mockHistoryStorage.getIndex.mockResolvedValue(index);
      const start = ts('2025-12-15T19:00:00Z');
      const end = ts('2025-12-15T22:00:00Z');

      // Act
      const result = await service.checkConflicts(start, end);

      // Assert
      expect(result.hasConflicts).toBe(true);
      expect(result.existingCount).toBeGreaterThan(0);
      expect(result.message).toBeDefined();
    });

    it('should return no conflicts when window has no plays', async () => {
      // Arrange
      const index = createSampleIndex();
      mockHistoryStorage.getIndex.mockResolvedValue(index);
      // Use a time window with no plays
      const start = ts('2025-12-20T12:00:00Z');
      const end = ts('2025-12-20T14:00:00Z');

      // Act
      const result = await service.checkConflicts(start, end);

      // Assert
      expect(result.hasConflicts).toBe(false);
    });

    it('should skip albums with lastPlayed before the window (early pruning)', async () => {
      // Arrange: album lastPlayed is way before our check window
      const index: ScrobbleHistoryIndex = {
        lastSyncTimestamp: Date.now() / 1000,
        totalScrobbles: 2,
        oldestScrobbleDate: ts('2025-01-01T00:00:00Z'),
        albums: {
          'old|album': {
            lastPlayed: ts('2025-01-01T20:00:00Z'),
            playCount: 2,
            plays: [
              { timestamp: ts('2025-01-01T20:00:00Z'), track: 'Old Song' },
            ],
          },
        },
      };
      mockHistoryStorage.getIndex.mockResolvedValue(index);

      // Act - check a much later window
      const result = await service.checkConflicts(
        ts('2025-12-15T20:00:00Z'),
        ts('2025-12-15T22:00:00Z')
      );

      // Assert
      expect(result.hasConflicts).toBe(false);
    });
  });

  describe('suggestBackfillTimestamps', () => {
    const sampleAlbums = [
      {
        releaseId: 1,
        artist: 'Radiohead',
        album: 'OK Computer',
        durationSeconds: 3180, // 53 min
        trackCount: 12,
      },
      {
        releaseId: 2,
        artist: 'Pink Floyd',
        album: 'DSOTM',
        durationSeconds: 2520, // 42 min
        trackCount: 10,
      },
    ];

    it('should generate preset suggestions', async () => {
      // Arrange
      mockHistoryStorage.getIndex.mockResolvedValue(createSampleIndex());

      // Act
      const suggestions = await service.suggestBackfillTimestamps(sampleAlbums);

      // Assert
      expect(suggestions.length).toBeGreaterThan(0);
      for (const suggestion of suggestions) {
        expect(suggestion.presetLabel).toBeDefined();
        expect(suggestion.startTimestamp).toBeGreaterThan(0);
        expect(suggestion.calculatedTimestamps).toHaveLength(2);
        expect(typeof suggestion.hasConflicts).toBe('boolean');
        expect(typeof suggestion.isOutsideLastFmWindow).toBe('boolean');
      }
    });

    it('should calculate per-album timestamps correctly', async () => {
      // Arrange
      mockHistoryStorage.getIndex.mockResolvedValue(createSampleIndex());

      // Act
      const suggestions = await service.suggestBackfillTimestamps(sampleAlbums);

      // Assert
      const first = suggestions[0];
      expect(first.calculatedTimestamps[0].albumIndex).toBe(0);
      expect(first.calculatedTimestamps[1].albumIndex).toBe(1);
      // Second album should start after first album ends + gap
      expect(first.calculatedTimestamps[1].startTimestamp).toBeGreaterThan(
        first.calculatedTimestamps[0].endTimestamp
      );
    });

    it('should include "Yesterday evening" preset', async () => {
      // Arrange
      mockHistoryStorage.getIndex.mockResolvedValue(createSampleIndex());

      // Act
      const suggestions = await service.suggestBackfillTimestamps(sampleAlbums);

      // Assert
      const yesterdayEvening = suggestions.find(
        s => s.presetLabel === 'Yesterday evening'
      );
      expect(yesterdayEvening).toBeDefined();
    });

    it('should work with no history (use defaults)', async () => {
      // Arrange
      mockHistoryStorage.getIndex.mockResolvedValue(null);

      // Act
      const suggestions = await service.suggestBackfillTimestamps(sampleAlbums);

      // Assert
      expect(suggestions.length).toBeGreaterThan(0);
      // Default gap should be 15 minutes
      const first = suggestions[0];
      const gapSeconds =
        first.calculatedTimestamps[1].startTimestamp -
        first.calculatedTimestamps[0].endTimestamp;
      expect(gapSeconds).toBe(15 * 60); // 15 min gap in seconds
    });
  });
});
