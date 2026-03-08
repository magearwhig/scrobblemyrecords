import { ScrobbleHistoryStorage } from '../../../src/backend/services/scrobbleHistoryStorage';
import { StatsService } from '../../../src/backend/services/statsService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';
import {
  CollectionItem,
  ScrobbleHistoryIndex,
} from '../../../src/shared/types';

jest.mock('../../../src/backend/services/scrobbleHistoryStorage');
jest.mock('../../../src/backend/utils/fileStorage');

const MockedHistoryStorage = ScrobbleHistoryStorage as jest.MockedClass<
  typeof ScrobbleHistoryStorage
>;
const MockedFileStorage = FileStorage as jest.MockedClass<typeof FileStorage>;

describe('StatsService.getCollectionROI', () => {
  let service: StatsService;
  let mockHistoryStorage: jest.Mocked<ScrobbleHistoryStorage>;
  let mockFileStorage: jest.Mocked<FileStorage>;

  const baseTimestamp = 1700000000;

  const createMockIndex = (
    albums: Record<string, number>
  ): ScrobbleHistoryIndex => ({
    lastSyncTimestamp: baseTimestamp,
    totalScrobbles: Object.values(albums).reduce((s, c) => s + c, 0),
    oldestScrobbleDate: baseTimestamp,
    albums: Object.fromEntries(
      Object.entries(albums).map(([key, playCount]) => [
        key,
        {
          lastPlayed: baseTimestamp,
          playCount,
          plays: Array.from({ length: playCount }, (_, i) => ({
            timestamp: baseTimestamp + i,
          })),
        },
      ])
    ),
  });

  const createMockCollection = (
    items: Array<{
      id: number;
      artist: string;
      title: string;
      cover_image?: string;
    }>
  ): { items: CollectionItem[] } => ({
    items: items.map(item => ({
      id: item.id,
      release: {
        id: item.id,
        title: item.title,
        artist: item.artist,
        format: ['Vinyl', 'LP'],
        label: ['Test Label'],
        resource_url: `https://api.discogs.com/releases/${item.id}`,
        cover_image: item.cover_image,
      },
      date_added: '2023-01-01',
    })),
  });

  const createMockValueCache = (
    items: Record<number, { medianPrice: number; currency: string }>
  ) => ({
    schemaVersion: 1,
    lastUpdated: baseTimestamp,
    items: Object.fromEntries(
      Object.entries(items).map(([id, val]) => [
        parseInt(id, 10),
        {
          releaseId: parseInt(id, 10),
          medianPrice: val.medianPrice,
          currency: val.currency,
          numForSale: 5,
          fetchedAt: baseTimestamp,
        },
      ])
    ),
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockHistoryStorage = new MockedHistoryStorage(
      {} as FileStorage
    ) as jest.Mocked<ScrobbleHistoryStorage>;
    mockFileStorage = new MockedFileStorage('test') as jest.Mocked<FileStorage>;

    // Approximate fuzzyNormalizeKey: strips disambiguation numbers, edition suffixes,
    // and all non-alphanumeric characters
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
      const result = await service.getCollectionROI();

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('when collection is empty', () => {
    it('should return empty array', async () => {
      // Arrange
      mockHistoryStorage.getIndex = jest
        .fn()
        .mockResolvedValue(createMockIndex({ 'radiohead|ok computer': 20 }));
      mockFileStorage.readJSON = jest.fn().mockResolvedValue({ items: [] });

      // Act
      const result = await service.getCollectionROI();

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('when collection read fails', () => {
    it('should return empty array gracefully', async () => {
      // Arrange
      mockHistoryStorage.getIndex = jest
        .fn()
        .mockResolvedValue(createMockIndex({ 'radiohead|ok computer': 20 }));
      mockFileStorage.readJSON = jest
        .fn()
        .mockRejectedValue(new Error('File not found'));

      // Act
      const result = await service.getCollectionROI();

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('when value cache is not available', () => {
    it('should return empty array', async () => {
      // Arrange
      mockHistoryStorage.getIndex = jest
        .fn()
        .mockResolvedValue(createMockIndex({ 'radiohead|ok computer': 20 }));
      const collection = createMockCollection([
        { id: 1, artist: 'Radiohead', title: 'OK Computer' },
      ]);
      mockFileStorage.readJSON = jest
        .fn()
        .mockResolvedValueOnce(collection)
        .mockResolvedValue(null);

      // Act
      const result = await service.getCollectionROI();

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('with valid data', () => {
    it('should compute ROI scores and return sorted descending', async () => {
      // Arrange
      mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(
        createMockIndex({
          'radiohead|ok computer': 20,
          'pink floyd|the wall': 10,
        })
      );
      const collection = createMockCollection([
        { id: 1, artist: 'Radiohead', title: 'OK Computer' },
        { id: 2, artist: 'Pink Floyd', title: 'The Wall' },
      ]);
      const valueCache = createMockValueCache({
        1: { medianPrice: 10, currency: 'USD' }, // ROI = 2.0
        2: { medianPrice: 20, currency: 'USD' }, // ROI = 0.5
      });
      mockFileStorage.readJSON = jest
        .fn()
        .mockResolvedValueOnce(collection)
        .mockResolvedValueOnce(valueCache);

      // Act
      const result = await service.getCollectionROI();

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].roiScore).toBeGreaterThan(result[1].roiScore);
      expect(result[0].releaseId).toBe(1);
      expect(result[0].playCount).toBe(20);
      expect(result[0].medianPrice).toBe(10);
      expect(result[0].currency).toBe('USD');
      expect(result[1].releaseId).toBe(2);
    });

    it('should skip albums with null medianPrice', async () => {
      // Arrange
      mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(
        createMockIndex({
          'radiohead|ok computer': 20,
          'pink floyd|the wall': 10,
        })
      );
      const collection = createMockCollection([
        { id: 1, artist: 'Radiohead', title: 'OK Computer' },
        { id: 2, artist: 'Pink Floyd', title: 'The Wall' },
      ]);
      const valueCache = createMockValueCache({
        1: { medianPrice: 10, currency: 'USD' },
      });
      // Release 2 has no entry in value cache
      mockFileStorage.readJSON = jest
        .fn()
        .mockResolvedValueOnce(collection)
        .mockResolvedValueOnce(valueCache);

      // Act
      const result = await service.getCollectionROI();

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].releaseId).toBe(1);
    });

    it('should skip albums with zero medianPrice', async () => {
      // Arrange
      mockHistoryStorage.getIndex = jest
        .fn()
        .mockResolvedValue(createMockIndex({ 'radiohead|ok computer': 20 }));
      const collection = createMockCollection([
        { id: 1, artist: 'Radiohead', title: 'OK Computer' },
      ]);
      const valueCache = {
        schemaVersion: 1,
        lastUpdated: baseTimestamp,
        items: {
          1: {
            releaseId: 1,
            medianPrice: 0,
            currency: 'USD',
            numForSale: 5,
            fetchedAt: baseTimestamp,
          },
        },
      };
      mockFileStorage.readJSON = jest
        .fn()
        .mockResolvedValueOnce(collection)
        .mockResolvedValueOnce(valueCache);

      // Act
      const result = await service.getCollectionROI();

      // Assert
      expect(result).toHaveLength(0);
    });

    it('should skip albums with zero play count', async () => {
      // Arrange
      mockHistoryStorage.getIndex = jest
        .fn()
        .mockResolvedValue(createMockIndex({ 'radiohead|ok computer': 0 }));
      const collection = createMockCollection([
        { id: 1, artist: 'Radiohead', title: 'OK Computer' },
      ]);
      const valueCache = createMockValueCache({
        1: { medianPrice: 10, currency: 'USD' },
      });
      mockFileStorage.readJSON = jest
        .fn()
        .mockResolvedValueOnce(collection)
        .mockResolvedValueOnce(valueCache);

      // Act
      const result = await service.getCollectionROI();

      // Assert
      expect(result).toHaveLength(0);
    });

    it('should respect the limit parameter', async () => {
      // Arrange
      mockHistoryStorage.getIndex = jest.fn().mockResolvedValue(
        createMockIndex({
          'radiohead|ok computer': 30,
          'pink floyd|the wall': 20,
          'nirvana|nevermind': 10,
        })
      );
      const collection = createMockCollection([
        { id: 1, artist: 'Radiohead', title: 'OK Computer' },
        { id: 2, artist: 'Pink Floyd', title: 'The Wall' },
        { id: 3, artist: 'Nirvana', title: 'Nevermind' },
      ]);
      const valueCache = createMockValueCache({
        1: { medianPrice: 5, currency: 'USD' },
        2: { medianPrice: 10, currency: 'USD' },
        3: { medianPrice: 15, currency: 'USD' },
      });
      mockFileStorage.readJSON = jest
        .fn()
        .mockResolvedValueOnce(collection)
        .mockResolvedValueOnce(valueCache);

      // Act
      const result = await service.getCollectionROI(2);

      // Assert
      expect(result).toHaveLength(2);
    });

    it('should include coverUrl when available', async () => {
      // Arrange
      mockHistoryStorage.getIndex = jest
        .fn()
        .mockResolvedValue(createMockIndex({ 'radiohead|ok computer': 10 }));
      const collection = createMockCollection([
        {
          id: 1,
          artist: 'Radiohead',
          title: 'OK Computer',
          cover_image: 'https://example.com/cover.jpg',
        },
      ]);
      const valueCache = createMockValueCache({
        1: { medianPrice: 10, currency: 'USD' },
      });
      mockFileStorage.readJSON = jest
        .fn()
        .mockResolvedValueOnce(collection)
        .mockResolvedValueOnce(valueCache);

      // Act
      const result = await service.getCollectionROI();

      // Assert
      expect(result[0].coverUrl).toBe('https://example.com/cover.jpg');
    });
  });
});
