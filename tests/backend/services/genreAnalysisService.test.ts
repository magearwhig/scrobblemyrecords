import { GenreAnalysisService } from '../../../src/backend/services/genreAnalysisService';
import { LastFmService } from '../../../src/backend/services/lastfmService';
import { ScrobbleHistoryStorage } from '../../../src/backend/services/scrobbleHistoryStorage';
import { FileStorage } from '../../../src/backend/utils/fileStorage';

// Mock dependencies
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

describe('GenreAnalysisService', () => {
  let service: GenreAnalysisService;
  let mockLastFmService: jest.Mocked<LastFmService>;
  let mockHistoryStorage: jest.Mocked<ScrobbleHistoryStorage>;
  let mockFileStorage: jest.Mocked<FileStorage>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ advanceTimers: true });

    mockLastFmService = new MockedLastFmService(
      {} as any,
      {} as any
    ) as jest.Mocked<LastFmService>;
    mockHistoryStorage = new MockedHistoryStorage(
      {} as any
    ) as jest.Mocked<ScrobbleHistoryStorage>;
    mockFileStorage = new MockedFileStorage('test') as jest.Mocked<FileStorage>;

    // Default: no cache
    mockFileStorage.readJSON = jest.fn().mockResolvedValue(null);
    mockFileStorage.writeJSON = jest.fn().mockResolvedValue(undefined);

    service = new GenreAnalysisService(
      mockLastFmService,
      mockHistoryStorage,
      mockFileStorage
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const createMockIndex = (albums: Record<string, { playCount: number }>) => ({
    albums: Object.fromEntries(
      Object.entries(albums).map(([key, value]) => [
        key,
        {
          ...value,
          plays: Array.from({ length: value.playCount }, (_, i) => ({
            timestamp: 1700000000 + i,
            source: 'lastfm' as const,
          })),
        },
      ])
    ),
  });

  it('should return empty genres when no history index exists', async () => {
    // Arrange
    mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(null);

    // Act
    const result = await service.getGenreDistribution();

    // Assert
    expect(result.genres).toEqual([]);
    expect(result.totalArtistsAnalyzed).toBe(0);
  });

  it('should return empty genres when total plays is zero', async () => {
    // Arrange
    mockHistoryStorage.getIndex = jest.fn().mockResolvedValue({
      albums: {},
    });

    // Act
    const result = await service.getGenreDistribution();

    // Assert
    expect(result.genres).toEqual([]);
    expect(result.totalArtistsAnalyzed).toBe(0);
  });

  it('should fetch tags for top artists and calculate genre weights', async () => {
    // Arrange
    mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(
      createMockIndex({
        'radiohead|OK Computer': { playCount: 100 },
        'pink floyd|The Wall': { playCount: 50 },
      })
    );

    mockLastFmService.getArtistTopTags = jest
      .fn()
      .mockResolvedValueOnce([
        { name: 'alternative rock', count: 100 },
        { name: 'electronic', count: 50 },
      ])
      .mockResolvedValueOnce([
        { name: 'progressive rock', count: 100 },
        { name: 'classic rock', count: 80 },
      ]);

    // Act
    jest.setSystemTime(new Date('2024-01-15'));
    const result = await service.getGenreDistribution(10, 10);

    // Assert
    expect(result.genres.length).toBeGreaterThan(0);
    expect(result.totalArtistsAnalyzed).toBe(2);
    // Weights should sum to approximately 1.0
    const totalWeight = result.genres.reduce((s, g) => s + g.weight, 0);
    expect(totalWeight).toBeCloseTo(1.0, 1);
  });

  it('should normalize weights so they sum to 1.0', async () => {
    // Arrange
    mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(
      createMockIndex({
        'radiohead|OK Computer': { playCount: 100 },
      })
    );

    mockLastFmService.getArtistTopTags = jest.fn().mockResolvedValue([
      { name: 'rock', count: 100 },
      { name: 'alternative', count: 80 },
      { name: 'indie', count: 60 },
    ]);

    // Act
    const result = await service.getGenreDistribution(10, 10);

    // Assert
    const totalWeight = result.genres.reduce((s, g) => s + g.weight, 0);
    expect(totalWeight).toBeCloseTo(1.0, 1);
  });

  it('should use cached tags and not call Last.fm API', async () => {
    // Arrange
    mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(
      createMockIndex({
        'radiohead|OK Computer': { playCount: 100 },
      })
    );

    // Provide cached tags
    const now = Date.now();
    mockFileStorage.readJSON = jest.fn().mockResolvedValue({
      schemaVersion: 1,
      tags: {
        radiohead: {
          tags: [{ name: 'rock', count: 100 }],
          fetchedAt: now, // Fresh cache
        },
      },
    });

    // Act
    const result = await service.getGenreDistribution(10, 10);

    // Assert
    expect(result.genres.length).toBeGreaterThan(0);
    expect(mockLastFmService.getArtistTopTags).not.toHaveBeenCalled();
  });

  it('should handle Last.fm API errors gracefully by skipping failed artists', async () => {
    // Arrange
    mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(
      createMockIndex({
        'radiohead|OK Computer': { playCount: 100 },
        'unknown artist|Unknown Album': { playCount: 50 },
      })
    );

    mockLastFmService.getArtistTopTags = jest
      .fn()
      .mockResolvedValueOnce([{ name: 'rock', count: 100 }])
      .mockRejectedValueOnce(new Error('Artist not found'));

    // Act
    const result = await service.getGenreDistribution(10, 10);

    // Assert - should still return data from the successful artist
    expect(result.genres.length).toBeGreaterThan(0);
    expect(result.totalArtistsAnalyzed).toBe(1);
  });

  it('should return empty genres when all tag fetches fail', async () => {
    // Arrange
    mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(
      createMockIndex({
        'artist1|Album1': { playCount: 100 },
        'artist2|Album2': { playCount: 50 },
      })
    );

    mockLastFmService.getArtistTopTags = jest
      .fn()
      .mockRejectedValue(new Error('Service unavailable'));

    // Act
    const result = await service.getGenreDistribution(10, 10);

    // Assert
    expect(result.genres).toEqual([]);
    expect(result.totalArtistsAnalyzed).toBe(0);
  });

  it('should return empty genres when all artists return empty tags', async () => {
    // Arrange
    mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(
      createMockIndex({
        'artist1|Album1': { playCount: 100 },
      })
    );

    mockLastFmService.getArtistTopTags = jest.fn().mockResolvedValue([]);

    // Act
    const result = await service.getGenreDistribution(10, 10);

    // Assert
    expect(result.genres).toEqual([]);
    expect(result.totalArtistsAnalyzed).toBe(0);
  });

  it('should filter out non-genre tags from blocklist', async () => {
    // Arrange
    mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(
      createMockIndex({
        'radiohead|OK Computer': { playCount: 100 },
      })
    );

    mockLastFmService.getArtistTopTags = jest.fn().mockResolvedValue([
      { name: 'rock', count: 100 },
      { name: 'seen live', count: 90 }, // Blocked
      { name: 'favorites', count: 80 }, // Blocked
      { name: 'british', count: 70 }, // Blocked
    ]);

    // Act
    const result = await service.getGenreDistribution(10, 10);

    // Assert - only 'rock' should pass the blocklist
    expect(result.genres).toHaveLength(1);
    expect(result.genres[0].name).toBe('rock');
  });

  it('should merge variant tag names', async () => {
    // Arrange
    mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(
      createMockIndex({
        'artist1|Album1': { playCount: 100 },
        'artist2|Album2': { playCount: 100 },
      })
    );

    mockLastFmService.getArtistTopTags = jest
      .fn()
      .mockResolvedValueOnce([{ name: 'hip hop', count: 100 }])
      .mockResolvedValueOnce([{ name: 'hip hop/rap', count: 100 }]);

    // Act
    const result = await service.getGenreDistribution(10, 10);

    // Assert - both variants should merge into 'hip-hop'
    const hipHop = result.genres.find(g => g.name === 'hip-hop');
    expect(hipHop).toBeDefined();
    expect(hipHop!.artistCount).toBe(2);
  });

  it('should filter out tags with count below 20', async () => {
    // Arrange
    mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(
      createMockIndex({
        'radiohead|OK Computer': { playCount: 100 },
      })
    );

    mockLastFmService.getArtistTopTags = jest.fn().mockResolvedValue([
      { name: 'rock', count: 100 },
      { name: 'noise', count: 10 }, // Below threshold
      { name: 'ambient', count: 19 }, // Below threshold
    ]);

    // Act
    const result = await service.getGenreDistribution(10, 10);

    // Assert
    expect(result.genres).toHaveLength(1);
    expect(result.genres[0].name).toBe('rock');
  });

  it('should limit returned genres to maxGenres', async () => {
    // Arrange
    mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(
      createMockIndex({
        'radiohead|OK Computer': { playCount: 100 },
      })
    );

    mockLastFmService.getArtistTopTags = jest.fn().mockResolvedValue([
      { name: 'rock', count: 100 },
      { name: 'alternative', count: 90 },
      { name: 'indie', count: 80 },
      { name: 'electronic', count: 70 },
      { name: 'experimental', count: 60 },
      { name: 'shoegaze', count: 50 },
      { name: 'post-rock', count: 40 },
      { name: 'ambient', count: 30 },
      { name: 'dream pop', count: 25 },
      { name: 'art rock', count: 22 },
      { name: 'lo-fi', count: 21 },
    ]);

    // Act
    const result = await service.getGenreDistribution(10, 5);

    // Assert
    expect(result.genres.length).toBeLessThanOrEqual(5);
  });
});
