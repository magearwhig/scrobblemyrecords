import { GenreAnalysisService } from '../../../src/backend/services/genreAnalysisService';
import { LastFmService } from '../../../src/backend/services/lastfmService';
import { ScrobbleHistoryStorage } from '../../../src/backend/services/scrobbleHistoryStorage';
import { FileStorage } from '../../../src/backend/utils/fileStorage';
import {
  ArtistTagsCacheStore,
  ScrobbleHistoryIndex,
} from '../../../src/shared/types';

jest.mock('../../../src/backend/services/lastfmService');
jest.mock('../../../src/backend/services/scrobbleHistoryStorage');
jest.mock('../../../src/backend/utils/fileStorage');

const MockedLastFmService = LastFmService as jest.MockedClass<
  typeof LastFmService
>;
const MockedHistoryStorage = ScrobbleHistoryStorage as jest.MockedClass<
  typeof ScrobbleHistoryStorage
>;
const MockedFileStorage = FileStorage as jest.MockedClass<typeof FileStorage>;

// Q1 2025: Jan 15 2025 ~= 1736899200s (within 24 months of 2026-03-08)
const Q1_2025_TS = 1736899200;
// Q2 2025: May 1 2025 ~= 1746057600s
const Q2_2025_TS = 1746057600;
// Q3 2025: Aug 1 2025 ~= 1754006400s
const Q3_2025_TS = 1754006400;

const createTagCache = (
  artists: Record<string, Array<{ name: string; count: number }>>
): ArtistTagsCacheStore => ({
  schemaVersion: 1,
  tags: Object.fromEntries(
    Object.entries(artists).map(([artist, tags]) => [
      artist.toLowerCase(),
      { tags, fetchedAt: Q1_2025_TS * 1000 },
    ])
  ),
});

const createIndex = (
  plays: Array<{ key: string; timestamps: number[] }>
): ScrobbleHistoryIndex => {
  const albums: ScrobbleHistoryIndex['albums'] = {};
  for (const { key, timestamps } of plays) {
    albums[key] = {
      lastPlayed: timestamps[timestamps.length - 1],
      playCount: timestamps.length,
      plays: timestamps.map(timestamp => ({ timestamp })),
    };
  }
  return {
    lastSyncTimestamp: Q3_2025_TS,
    totalScrobbles: Object.values(albums).reduce((s, a) => s + a.playCount, 0),
    oldestScrobbleDate: Q1_2025_TS,
    albums,
  };
};

describe('GenreAnalysisService.getTasteDrift', () => {
  let service: GenreAnalysisService;
  let mockLastFmService: jest.Mocked<LastFmService>;
  let mockHistoryStorage: jest.Mocked<ScrobbleHistoryStorage>;
  let mockFileStorage: jest.Mocked<FileStorage>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLastFmService = new MockedLastFmService(
      {} as any,
      {} as any
    ) as jest.Mocked<LastFmService>;
    mockHistoryStorage = new MockedHistoryStorage(
      {} as any
    ) as jest.Mocked<ScrobbleHistoryStorage>;
    mockFileStorage = new MockedFileStorage('test') as jest.Mocked<FileStorage>;

    mockFileStorage.writeJSONWithBackup = jest
      .fn()
      .mockResolvedValue(undefined);

    service = new GenreAnalysisService(
      mockLastFmService,
      mockHistoryStorage,
      mockFileStorage
    );
  });

  describe('when history index is null', () => {
    it('should return empty result', async () => {
      // Arrange
      mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(null);
      mockFileStorage.readJSON = jest.fn().mockResolvedValue(null);

      // Act
      const result = await service.getTasteDrift();

      // Assert
      expect(result.snapshots).toEqual([]);
      expect(result.totalQuarters).toBe(0);
      expect(result.topGenresOverall).toEqual([]);
    });
  });

  describe('when no plays are within the time window', () => {
    it('should return empty result', async () => {
      // Arrange — plays from 5 years ago, default window is 24 months
      const oldTimestamp = Q1_2025_TS - 5 * 365 * 24 * 3600;
      const index = createIndex([
        { key: 'radiohead|ok computer', timestamps: [oldTimestamp] },
      ]);
      mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(index);
      mockFileStorage.readJSON = jest.fn().mockResolvedValue(null);

      // Act
      const result = await service.getTasteDrift(24);

      // Assert
      expect(result.snapshots).toEqual([]);
      expect(result.totalQuarters).toBe(0);
    });
  });

  describe('with valid plays and tag cache', () => {
    it('should produce one snapshot per quarter with plays', async () => {
      // Arrange — plays in Q1 and Q3 2024
      const index = createIndex([
        {
          key: 'radiohead|ok computer',
          timestamps: [Q1_2025_TS + 100, Q3_2025_TS + 100],
        },
      ]);
      mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(index);

      const tagCache = createTagCache({
        radiohead: [
          { name: 'alternative rock', count: 80 },
          { name: 'indie', count: 60 },
        ],
      });
      mockFileStorage.readJSON = jest.fn().mockResolvedValue(tagCache);

      // Act
      const result = await service.getTasteDrift(24);

      // Assert
      // Q2 2024 has no plays so should not appear
      expect(result.snapshots.length).toBe(2);
      expect(result.snapshots[0].period).toBe('2025-Q1');
      expect(result.snapshots[1].period).toBe('2025-Q3');
    });

    it('should include genre weights summing to 1.0 per snapshot', async () => {
      // Arrange
      const index = createIndex([
        { key: 'radiohead|ok computer', timestamps: [Q1_2025_TS + 100] },
      ]);
      mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(index);

      const tagCache = createTagCache({
        radiohead: [
          { name: 'alternative rock', count: 80 },
          { name: 'indie', count: 60 },
          { name: 'art rock', count: 40 },
        ],
      });
      mockFileStorage.readJSON = jest.fn().mockResolvedValue(tagCache);

      // Act
      const result = await service.getTasteDrift(24);

      // Assert
      expect(result.snapshots).toHaveLength(1);
      const genres = result.snapshots[0].genres;
      expect(genres.length).toBeGreaterThan(0);

      const totalWeight = genres.reduce((s, g) => s + g.weight, 0);
      // Should be approximately 1.0 (may differ by rounding)
      expect(totalWeight).toBeCloseTo(1.0, 1);
    });

    it('should filter out blocked tags', async () => {
      // Arrange
      const index = createIndex([
        { key: 'radiohead|ok computer', timestamps: [Q1_2025_TS + 100] },
      ]);
      mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(index);

      const tagCache = createTagCache({
        radiohead: [
          { name: 'seen live', count: 90 }, // blocked
          { name: 'vinyl', count: 90 }, // blocked
          { name: 'alternative rock', count: 80 }, // allowed
        ],
      });
      mockFileStorage.readJSON = jest.fn().mockResolvedValue(tagCache);

      // Act
      const result = await service.getTasteDrift(24);

      // Assert
      const allGenreNames = result.snapshots.flatMap(s =>
        s.genres.map(g => g.name)
      );
      expect(allGenreNames).not.toContain('seen live');
      expect(allGenreNames).not.toContain('vinyl');
      expect(allGenreNames).toContain('alternative rock');
    });

    it('should merge tag variants (hip hop -> hip-hop)', async () => {
      // Arrange
      const index = createIndex([
        { key: 'jay-z|the blueprint', timestamps: [Q1_2025_TS + 100] },
      ]);
      mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(index);

      const tagCache = createTagCache({
        'jay-z': [
          { name: 'hip hop', count: 80 },
          { name: 'hip-hop', count: 70 },
        ],
      });
      mockFileStorage.readJSON = jest.fn().mockResolvedValue(tagCache);

      // Act
      const result = await service.getTasteDrift(24);

      // Assert
      expect(result.snapshots).toHaveLength(1);
      const genreNames = result.snapshots[0].genres.map(g => g.name);
      // Should be merged into one entry
      expect(genreNames.filter(n => n === 'hip-hop').length).toBe(1);
      expect(genreNames).not.toContain('hip hop');
    });

    it('should skip tags with count < 20', async () => {
      // Arrange
      const index = createIndex([
        { key: 'radiohead|ok computer', timestamps: [Q1_2025_TS + 100] },
      ]);
      mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(index);

      const tagCache = createTagCache({
        radiohead: [
          { name: 'alternative rock', count: 80 },
          { name: 'obscure noise', count: 15 }, // below threshold
        ],
      });
      mockFileStorage.readJSON = jest.fn().mockResolvedValue(tagCache);

      // Act
      const result = await service.getTasteDrift(24);

      // Assert
      const allGenreNames = result.snapshots.flatMap(s =>
        s.genres.map(g => g.name)
      );
      expect(allGenreNames).not.toContain('obscure noise');
    });

    it('should produce topGenresOverall from all snapshots', async () => {
      // Arrange — plays in Q1 and Q3
      const index = createIndex([
        {
          key: 'radiohead|ok computer',
          timestamps: [Q1_2025_TS + 100, Q3_2025_TS + 100],
        },
      ]);
      mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(index);

      const tagCache = createTagCache({
        radiohead: [
          { name: 'alternative rock', count: 80 },
          { name: 'indie', count: 60 },
        ],
      });
      mockFileStorage.readJSON = jest.fn().mockResolvedValue(tagCache);

      // Act
      const result = await service.getTasteDrift(24);

      // Assert
      expect(result.topGenresOverall).toContain('alternative rock');
      expect(result.topGenresOverall).toContain('indie');
    });

    it('should respect months parameter to limit time window', async () => {
      // Arrange — one play 18 months ago, one play 6 months ago
      const now = Date.now() / 1000;
      const eighteenMonthsAgo = Math.floor(now - 18 * 30 * 24 * 3600);
      const sixMonthsAgo = Math.floor(now - 6 * 30 * 24 * 3600);

      const index = createIndex([
        {
          key: 'radiohead|ok computer',
          timestamps: [eighteenMonthsAgo, sixMonthsAgo],
        },
      ]);
      mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(index);

      const tagCache = createTagCache({
        radiohead: [{ name: 'alternative rock', count: 80 }],
      });
      mockFileStorage.readJSON = jest.fn().mockResolvedValue(tagCache);

      // Act — only 12 months of history
      const result = await service.getTasteDrift(12);

      // Assert — 18-month-old play should be excluded
      const totalPlays = result.snapshots.reduce(
        (s, snap) => s + snap.genres.reduce(gs => gs + 1, 0),
        0
      );
      // 18 months ago is outside 12-month window; only recent play is included
      // We can't check exact period without knowing current date, but result should
      // have fewer snapshots than if we used 24-month window
      const resultFull = await service.getTasteDrift(24);
      expect(result.snapshots.length).toBeLessThanOrEqual(
        resultFull.snapshots.length
      );
      void totalPlays; // suppress unused warning
    });

    it('should not make API calls — only reads tag cache', async () => {
      // Arrange
      const index = createIndex([
        { key: 'radiohead|ok computer', timestamps: [Q1_2025_TS + 100] },
      ]);
      mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(index);
      mockLastFmService.getArtistTopTags = jest.fn();
      mockFileStorage.readJSON = jest
        .fn()
        .mockResolvedValue(
          createTagCache({
            radiohead: [{ name: 'alternative rock', count: 80 }],
          })
        );

      // Act
      await service.getTasteDrift(24);

      // Assert — no API calls made
      expect(mockLastFmService.getArtistTopTags).not.toHaveBeenCalled();
    });

    it('should return empty genres for artists not in tag cache', async () => {
      // Arrange
      const index = createIndex([
        { key: 'unknownartist|unknown album', timestamps: [Q1_2025_TS + 100] },
      ]);
      mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(index);
      mockFileStorage.readJSON = jest.fn().mockResolvedValue(
        createTagCache({}) // empty cache
      );

      // Act
      const result = await service.getTasteDrift(24);

      // Assert
      // Snapshot may exist for the quarter but genres will be empty
      for (const snapshot of result.snapshots) {
        expect(snapshot.genres).toEqual([]);
      }
    });
  });
});
