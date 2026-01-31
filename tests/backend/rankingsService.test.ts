import { RankingsService } from '../../src/backend/services/rankingsService';
import { ScrobbleHistoryStorage } from '../../src/backend/services/scrobbleHistoryStorage';

jest.mock('../../src/backend/services/scrobbleHistoryStorage');

const MockedScrobbleHistoryStorage = ScrobbleHistoryStorage as jest.MockedClass<
  typeof ScrobbleHistoryStorage
>;

describe('RankingsService', () => {
  let service: RankingsService;
  let mockHistoryStorage: jest.Mocked<ScrobbleHistoryStorage>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockHistoryStorage = new MockedScrobbleHistoryStorage(
      null as any
    ) as jest.Mocked<ScrobbleHistoryStorage>;
    service = new RankingsService(mockHistoryStorage);
  });

  describe('getRankingsOverTime', () => {
    it('should return empty snapshots when no index exists', async () => {
      mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(null);

      const result = await service.getRankingsOverTime('artists', 10);

      expect(result).toEqual({
        snapshots: [],
        type: 'artists',
        topN: 10,
      });
    });

    it('should generate monthly snapshots for artists', async () => {
      const mockIndex = {
        albums: {
          'Artist 1|Album 1': {
            playCount: 10,
            plays: [
              { timestamp: 1705320000, track: 'Track 1' }, // 2024-01-15 12:00 UTC
              { timestamp: 1705406400, track: 'Track 1' }, // 2024-01-16 12:00 UTC
            ],
          },
          'Artist 2|Album 1': {
            playCount: 5,
            plays: [{ timestamp: 1705320000, track: 'Track 1' }],
          },
        },
      };

      mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(mockIndex);

      const result = await service.getRankingsOverTime('artists', 10);

      expect(result.type).toBe('artists');
      expect(result.topN).toBe(10);
      expect(result.snapshots.length).toBeGreaterThan(0);
      expect(result.snapshots[0].rankings).toHaveLength(2);
      expect(result.snapshots[0].rankings[0].name).toBe('Artist 1');
      expect(result.snapshots[0].rankings[0].count).toBe(2);
      expect(result.snapshots[0].rankings[0].rank).toBe(1);
      expect(result.snapshots[0].rankings[1].name).toBe('Artist 2');
      expect(result.snapshots[0].rankings[1].count).toBe(1);
      expect(result.snapshots[0].rankings[1].rank).toBe(2);
    });

    it('should generate monthly snapshots for tracks', async () => {
      const mockIndex = {
        albums: {
          'Artist 1|Album 1': {
            playCount: 3,
            plays: [
              { timestamp: 1705320000, track: 'Track 1' },
              { timestamp: 1705406400, track: 'Track 1' },
              { timestamp: 1708012800, track: 'Track 2' }, // 2024-02-15
            ],
          },
        },
      };

      mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(mockIndex);

      const result = await service.getRankingsOverTime('tracks', 10);

      expect(result.type).toBe('tracks');
      expect(result.snapshots[0].rankings[0]).toMatchObject({
        artist: 'Artist 1',
        rank: 1,
      });
    });

    it('should generate monthly snapshots for albums', async () => {
      const mockIndex = {
        albums: {
          'Artist 1|Album 1': {
            playCount: 5,
            plays: [
              { timestamp: 1705320000, track: 'Track 1' },
              { timestamp: 1705406400, track: 'Track 1' },
            ],
          },
          'Artist 1|Album 2': {
            playCount: 3,
            plays: [{ timestamp: 1705320000, track: 'Track 1' }],
          },
        },
      };

      mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(mockIndex);

      const result = await service.getRankingsOverTime('albums', 10);

      expect(result.type).toBe('albums');
      expect(result.snapshots[0].rankings[0].name).toBe('Album 1');
      expect(result.snapshots[0].rankings[0].artist).toBe('Artist 1');
    });

    it('should filter by date range when provided', async () => {
      const mockIndex = {
        albums: {
          'Artist 1|Album 1': {
            playCount: 10,
            plays: [
              { timestamp: 1105790400, track: 'Track 1' }, // 2005-01-15 (old)
              { timestamp: 1705320000, track: 'Track 1' }, // 2024-01-15 (new)
            ],
          },
        },
      };

      mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(mockIndex);

      // Filter to only 2024
      const startDate = new Date('2024-01-01T00:00:00Z').getTime();
      const endDate = new Date('2024-12-31T23:59:59Z').getTime();

      const result = await service.getRankingsOverTime(
        'artists',
        10,
        startDate,
        endDate
      );

      expect(result.snapshots.length).toBe(1);
      expect(result.snapshots[0].period).toBe('2024-01');
      expect(result.snapshots[0].rankings[0].count).toBe(1);
    });

    it('should include all-time data when no dates provided', async () => {
      const mockIndex = {
        albums: {
          'Artist 1|Album 1': {
            playCount: 2,
            plays: [
              { timestamp: 1105790400, track: 'Track 1' }, // 2005-01-15
              { timestamp: 1705320000, track: 'Track 1' }, // 2024-01-15
            ],
          },
        },
      };

      mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(mockIndex);

      const result = await service.getRankingsOverTime('artists', 10);

      // Should have snapshots spanning from 2005 to 2024
      expect(result.snapshots.length).toBeGreaterThan(1);
      expect(result.snapshots[0].period).toBe('2005-01');
      const lastSnapshot = result.snapshots[result.snapshots.length - 1];
      expect(lastSnapshot.period).toBe('2024-01');
    });

    it('should limit results to topN', async () => {
      const mockIndex = {
        albums: {} as any,
      };

      // Create 20 artists
      for (let i = 1; i <= 20; i++) {
        mockIndex.albums[`Artist ${i}|Album 1`] = {
          playCount: 21 - i, // Decreasing play counts
          plays: [{ timestamp: 1705320000, track: 'Track 1' }],
        };
      }

      mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(mockIndex);

      const result = await service.getRankingsOverTime('artists', 5);

      expect(result.snapshots[0].rankings).toHaveLength(5);
      expect(result.snapshots[0].rankings[0].name).toBe('Artist 1');
      expect(result.snapshots[0].rankings[4].name).toBe('Artist 5');
    });

    it('should return empty snapshots when no scrobbles in date range', async () => {
      const mockIndex = {
        albums: {
          'Artist 1|Album 1': {
            playCount: 1,
            plays: [{ timestamp: 1105790400, track: 'Track 1' }], // 2005
          },
        },
      };

      mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(mockIndex);

      // Filter to 2024 only
      const startDate = new Date('2024-01-01T00:00:00Z').getTime();
      const endDate = new Date('2024-12-31T23:59:59Z').getTime();

      const result = await service.getRankingsOverTime(
        'artists',
        10,
        startDate,
        endDate
      );

      expect(result.snapshots).toEqual([]);
    });

    it('should handle tracks without track names', async () => {
      const mockIndex = {
        albums: {
          'Artist 1|Album 1': {
            playCount: 2,
            plays: [
              { timestamp: 1705320000 }, // No track field
              { timestamp: 1705406400, track: 'Track 1' },
            ],
          },
        },
      };

      mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(mockIndex);

      const result = await service.getRankingsOverTime('tracks', 10);

      // Should only count the play with a track name
      expect(result.snapshots.length).toBeGreaterThan(0);
      if (result.snapshots[0].rankings.length > 0) {
        expect(result.snapshots[0].rankings[0].count).toBe(1);
        expect(result.snapshots[0].rankings[0].name).toBe('Track 1');
      }
    });

    it('should sort rankings by count descending', async () => {
      const mockIndex = {
        albums: {
          'Artist 1|Album 1': {
            playCount: 5,
            plays: Array(5).fill({ timestamp: 1705320000, track: 'Track 1' }),
          },
          'Artist 2|Album 1': {
            playCount: 10,
            plays: Array(10).fill({ timestamp: 1705320000, track: 'Track 1' }),
          },
          'Artist 3|Album 1': {
            playCount: 3,
            plays: Array(3).fill({ timestamp: 1705320000, track: 'Track 1' }),
          },
        },
      };

      mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(mockIndex);

      const result = await service.getRankingsOverTime('artists', 10);

      expect(result.snapshots[0].rankings[0].name).toBe('Artist 2');
      expect(result.snapshots[0].rankings[0].count).toBe(10);
      expect(result.snapshots[0].rankings[0].rank).toBe(1);
      expect(result.snapshots[0].rankings[1].name).toBe('Artist 1');
      expect(result.snapshots[0].rankings[1].rank).toBe(2);
      expect(result.snapshots[0].rankings[2].name).toBe('Artist 3');
      expect(result.snapshots[0].rankings[2].rank).toBe(3);
    });

    it('should use cumulative counts across months', async () => {
      const mockIndex = {
        albums: {
          'Artist 1|Album 1': {
            playCount: 3,
            plays: [
              { timestamp: 1705320000, track: 'Track 1' }, // Jan 2024
              { timestamp: 1708012800, track: 'Track 1' }, // Feb 2024
              { timestamp: 1710432000, track: 'Track 1' }, // Mar 2024
            ],
          },
        },
      };

      mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(mockIndex);

      const result = await service.getRankingsOverTime('artists', 10);

      // First month should have 1 play
      expect(result.snapshots[0].rankings[0].count).toBe(1);
      // Second month should have 2 plays (cumulative)
      expect(result.snapshots[1].rankings[0].count).toBe(2);
      // Third month should have 3 plays (cumulative)
      expect(result.snapshots[2].rankings[0].count).toBe(3);
    });
  });
});
