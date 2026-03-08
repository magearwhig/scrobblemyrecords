import { ScrobbleHistoryStorage } from '../../../src/backend/services/scrobbleHistoryStorage';
import { StatsService } from '../../../src/backend/services/statsService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';
import { ScrobbleHistoryIndex } from '../../../src/shared/types';

jest.mock('../../../src/backend/services/scrobbleHistoryStorage');
jest.mock('../../../src/backend/utils/fileStorage');

const MockedHistoryStorage = ScrobbleHistoryStorage as jest.MockedClass<
  typeof ScrobbleHistoryStorage
>;
const MockedFileStorage = FileStorage as jest.MockedClass<typeof FileStorage>;

// Fixed base timestamp: 2023-01-15T00:00:00Z = 1673740800 seconds
const JAN_2023 = 1673740800;
// 2023-06-15T00:00:00Z = 1686787200 seconds
const JUN_2023 = 1686787200;
// 2024-01-15T00:00:00Z = 1705276800 seconds
const JAN_2024 = 1705276800;

describe('StatsService.getAlbumListeningArc', () => {
  let service: StatsService;
  let mockHistoryStorage: jest.Mocked<ScrobbleHistoryStorage>;
  let mockFileStorage: jest.Mocked<FileStorage>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockHistoryStorage = new MockedHistoryStorage(
      {} as FileStorage
    ) as jest.Mocked<ScrobbleHistoryStorage>;
    mockFileStorage = new MockedFileStorage('test') as jest.Mocked<FileStorage>;

    // Approximate fuzzyNormalizeKey: strips disambiguation numbers, edition
    // suffixes, and all non-alphanumeric characters
    mockHistoryStorage.fuzzyNormalizeKey = jest.fn(
      (artist: string, album: string) => {
        const normalize = (s: string) =>
          s
            .replace(/\s*\(\d+\)\s*$/g, '')
            .replace(
              /\s*\((explicit|deluxe|deluxe edition|special edition|remastered|remaster|remastered \d{4}|bonus track.*?)\)\s*/gi,
              ''
            )
            .replace(/\s*\[.*?\]\s*/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');
        return `${normalize(artist)}|${normalize(album)}`;
      }
    );

    service = new StatsService(mockFileStorage, mockHistoryStorage);
  });

  describe('when history index is null', () => {
    it('should return empty array', async () => {
      // Arrange
      mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(null);

      // Act
      const result = await service.getAlbumListeningArc(
        'Radiohead',
        'OK Computer'
      );

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('when album is not found in index', () => {
    it('should return empty array without throwing', async () => {
      // Arrange
      const index: ScrobbleHistoryIndex = {
        lastSyncTimestamp: JAN_2023,
        totalScrobbles: 5,
        oldestScrobbleDate: JAN_2023,
        albums: {
          'pink floyd|the wall': {
            lastPlayed: JAN_2023,
            playCount: 5,
            plays: [{ timestamp: JAN_2023 }],
          },
        },
      };
      mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(index);

      // Act
      const result = await service.getAlbumListeningArc(
        'Radiohead',
        'OK Computer'
      );

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('with plays spread across multiple months', () => {
    it('should bucket plays by YYYY-MM and sort chronologically', async () => {
      // Arrange
      const index: ScrobbleHistoryIndex = {
        lastSyncTimestamp: JAN_2024,
        totalScrobbles: 4,
        oldestScrobbleDate: JAN_2023,
        albums: {
          'radiohead|ok computer': {
            lastPlayed: JAN_2024,
            playCount: 4,
            plays: [
              { timestamp: JAN_2023, track: 'Airbag' }, // 2023-01
              { timestamp: JAN_2023 + 3600, track: 'Paranoid Android' }, // 2023-01
              { timestamp: JUN_2023, track: 'No Surprises' }, // 2023-06
              { timestamp: JAN_2024, track: 'Karma Police' }, // 2024-01
            ],
          },
        },
      };
      mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(index);

      // Act
      const result = await service.getAlbumListeningArc(
        'Radiohead',
        'OK Computer'
      );

      // Assert
      expect(result).toHaveLength(3);
      expect(result[0].period).toBe('2023-01');
      expect(result[0].playCount).toBe(2);
      expect(result[1].period).toBe('2023-06');
      expect(result[1].playCount).toBe(1);
      expect(result[2].period).toBe('2024-01');
      expect(result[2].playCount).toBe(1);
    });

    it('should count unique tracks per bucket', async () => {
      // Arrange
      const index: ScrobbleHistoryIndex = {
        lastSyncTimestamp: JAN_2023,
        totalScrobbles: 4,
        oldestScrobbleDate: JAN_2023,
        albums: {
          'radiohead|ok computer': {
            lastPlayed: JAN_2023,
            playCount: 4,
            plays: [
              { timestamp: JAN_2023, track: 'Airbag' },
              { timestamp: JAN_2023 + 100, track: 'Airbag' }, // same track, same month
              { timestamp: JAN_2023 + 200, track: 'Paranoid Android' },
              { timestamp: JAN_2023 + 300, track: 'Let Down' },
            ],
          },
        },
      };
      mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(index);

      // Act
      const result = await service.getAlbumListeningArc(
        'radiohead',
        'ok computer'
      );

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].playCount).toBe(4);
      expect(result[0].trackCount).toBe(3); // Airbag counted once
    });

    it('should use fuzzy matching for artist/album names', async () => {
      // Arrange — index has lowercase key, query has proper case
      const index: ScrobbleHistoryIndex = {
        lastSyncTimestamp: JAN_2023,
        totalScrobbles: 2,
        oldestScrobbleDate: JAN_2023,
        albums: {
          'radiohead|ok computer': {
            lastPlayed: JAN_2023,
            playCount: 2,
            plays: [{ timestamp: JAN_2023 }, { timestamp: JAN_2023 + 100 }],
          },
        },
      };
      mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(index);

      // Act — query with proper casing; fuzzyNormalizeKey should handle it
      const result = await service.getAlbumListeningArc(
        'Radiohead',
        'OK Computer'
      );

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].playCount).toBe(2);
    });

    it('should handle plays with no track field', async () => {
      // Arrange
      const index: ScrobbleHistoryIndex = {
        lastSyncTimestamp: JAN_2023,
        totalScrobbles: 3,
        oldestScrobbleDate: JAN_2023,
        albums: {
          'radiohead|ok computer': {
            lastPlayed: JAN_2023,
            playCount: 3,
            plays: [
              { timestamp: JAN_2023 }, // no track
              { timestamp: JAN_2023 + 100 }, // no track
              { timestamp: JAN_2023 + 200, track: 'Airbag' },
            ],
          },
        },
      };
      mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(index);

      // Act
      const result = await service.getAlbumListeningArc(
        'Radiohead',
        'OK Computer'
      );

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].playCount).toBe(3);
      expect(result[0].trackCount).toBe(1); // Only the one with a track name
    });
  });

  describe('with multiple fuzzy-matching keys', () => {
    it('should aggregate plays from all matching keys', async () => {
      // Arrange — both exact and edition variant should match
      const index: ScrobbleHistoryIndex = {
        lastSyncTimestamp: JAN_2023,
        totalScrobbles: 3,
        oldestScrobbleDate: JAN_2023,
        albums: {
          'radiohead|ok computer': {
            lastPlayed: JAN_2023,
            playCount: 2,
            plays: [{ timestamp: JAN_2023 }, { timestamp: JAN_2023 + 100 }],
          },
          'radiohead|ok computer (remastered)': {
            lastPlayed: JAN_2023 + 200,
            playCount: 1,
            plays: [{ timestamp: JAN_2023 + 200 }],
          },
        },
      };
      mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(index);

      // Act
      const result = await service.getAlbumListeningArc(
        'Radiohead',
        'OK Computer'
      );

      // Assert — 3 total plays
      const totalPlays = result.reduce((s, b) => s + b.playCount, 0);
      expect(totalPlays).toBe(3);
    });
  });
});
