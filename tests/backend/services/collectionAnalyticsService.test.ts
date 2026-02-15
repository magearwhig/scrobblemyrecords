import { AuthService } from '../../../src/backend/services/authService';
import { CollectionAnalyticsService } from '../../../src/backend/services/collectionAnalyticsService';
import { WishlistService } from '../../../src/backend/services/wishlistService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';
import { CollectionItem } from '../../../src/shared/types';

// Mock dependencies
jest.mock('../../../src/backend/services/authService');
jest.mock('../../../src/backend/services/wishlistService');
jest.mock('../../../src/backend/utils/fileStorage');
jest.mock('../../../src/backend/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

const MockedAuthService = AuthService as jest.MockedClass<typeof AuthService>;
const MockedWishlistService = WishlistService as jest.MockedClass<
  typeof WishlistService
>;
const MockedFileStorage = FileStorage as jest.MockedClass<typeof FileStorage>;

// ============================================
// Factory Functions
// ============================================

function createCollectionItem(
  overrides: Partial<{
    id: number;
    date_added: string;
    rating: number;
    release: Partial<CollectionItem['release']>;
  }> = {}
): CollectionItem {
  const defaults = {
    id: 1,
    date_added: '2024-01-15T10:30:00Z',
    rating: 0,
    release: {
      id: 100,
      title: 'Test Album',
      artist: 'Test Artist',
      year: 2020,
      format: ['LP'],
      label: ['Test Records'],
      cover_image: 'https://example.com/cover.jpg',
    },
  };

  return {
    ...defaults,
    ...overrides,
    release: {
      ...defaults.release,
      ...(overrides.release || {}),
    },
  } as CollectionItem;
}

function createCollectionPage(items: CollectionItem[]) {
  return {
    data: items,
    timestamp: Date.now(),
  };
}

describe('CollectionAnalyticsService', () => {
  let service: CollectionAnalyticsService;
  let mockFileStorage: jest.Mocked<FileStorage>;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockWishlistService: jest.Mocked<WishlistService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockFileStorage = new MockedFileStorage('test') as jest.Mocked<FileStorage>;
    mockAuthService = new MockedAuthService(
      mockFileStorage
    ) as jest.Mocked<AuthService>;
    mockWishlistService = new MockedWishlistService(
      {} as any,
      {} as any
    ) as jest.Mocked<WishlistService>;

    // Default mocks
    mockAuthService.getUserSettings = jest.fn().mockResolvedValue({
      discogs: { username: 'testuser' },
      lastfm: {},
      preferences: {
        defaultTimestamp: 'now' as const,
        batchSize: 50,
        autoScrobble: false,
      },
    });
    mockFileStorage.readJSON = jest.fn().mockResolvedValue(null);
    mockFileStorage.writeJSON = jest.fn().mockResolvedValue(undefined);
    mockFileStorage.writeJSONWithBackup = jest
      .fn()
      .mockResolvedValue(undefined);

    service = new CollectionAnalyticsService(
      mockFileStorage,
      mockAuthService,
      mockWishlistService
    );
  });

  // ============================================
  // Helper to set up collection pages in mock
  // ============================================
  function setupCollectionPages(items: CollectionItem[]) {
    // First call returns the page, second returns null to end pagination
    mockFileStorage.readJSON
      .mockResolvedValueOnce(createCollectionPage(items))
      .mockResolvedValueOnce(null);
  }

  function setupMultiPageCollection(pages: CollectionItem[][]) {
    for (const page of pages) {
      mockFileStorage.readJSON.mockResolvedValueOnce(
        createCollectionPage(page)
      );
    }
    mockFileStorage.readJSON.mockResolvedValueOnce(null); // End pagination
  }

  // ============================================
  // getCollectionOverview
  // ============================================
  describe('getCollectionOverview', () => {
    it('should return a complete overview with all sections', async () => {
      // Arrange
      const items = [
        createCollectionItem({ id: 1 }),
        createCollectionItem({
          id: 2,
          release: {
            id: 200,
            artist: 'Another Artist',
            title: 'Another Album',
            year: 1990,
          },
        }),
      ];
      setupCollectionPages(items);

      // Act
      const overview = await service.getCollectionOverview();

      // Assert
      expect(overview).toHaveProperty('summary');
      expect(overview).toHaveProperty('formats');
      expect(overview).toHaveProperty('labels');
      expect(overview).toHaveProperty('decades');
      expect(overview).toHaveProperty('growth');
      expect(overview.summary.totalItems).toBe(2);
    });

    it('should handle empty collection', async () => {
      // Arrange
      mockFileStorage.readJSON.mockResolvedValue(null);

      // Act
      const overview = await service.getCollectionOverview();

      // Assert
      expect(overview.summary.totalItems).toBe(0);
      expect(overview.formats.categories).toEqual([]);
      expect(overview.labels.labels).toEqual([]);
      expect(overview.decades.decades).toEqual([]);
      expect(overview.growth.dataPoints).toEqual([]);
    });

    it('should load collection pages from file storage with correct keys', async () => {
      // Arrange
      setupCollectionPages([createCollectionItem()]);

      // Act
      await service.getCollectionOverview();

      // Assert
      expect(mockFileStorage.readJSON).toHaveBeenCalledWith(
        'collections/testuser-page-1.json'
      );
      expect(mockFileStorage.readJSON).toHaveBeenCalledWith(
        'collections/testuser-page-2.json'
      );
    });

    it('should return empty collection when no username is configured', async () => {
      // Arrange
      mockAuthService.getUserSettings.mockResolvedValue({
        discogs: { username: '' },
        lastfm: {},
        preferences: {
          defaultTimestamp: 'now' as const,
          batchSize: 50,
          autoScrobble: false,
        },
      });

      // Act
      const overview = await service.getCollectionOverview();

      // Assert
      expect(overview.summary.totalItems).toBe(0);
    });
  });

  // ============================================
  // getFormatBreakdown
  // ============================================
  describe('getFormatBreakdown', () => {
    it('should categorize LP format correctly', async () => {
      // Arrange
      const items = [
        createCollectionItem({ release: { format: ['LP'] } }),
        createCollectionItem({
          id: 2,
          release: { id: 200, format: ['LP', 'Album'] },
        }),
      ];

      // Act
      const result = await service.getFormatBreakdown(items);

      // Assert
      expect(result.totalItems).toBe(2);
      const lpCategory = result.categories.find(c => c.name === 'LP (12")');
      expect(lpCategory).toBeDefined();
      expect(lpCategory!.count).toBe(2);
      expect(lpCategory!.percentage).toBe(100);
    });

    it('should categorize 7" singles', async () => {
      // Arrange
      const items = [
        createCollectionItem({ release: { format: ['7"', 'Single'] } }),
      ];

      // Act
      const result = await service.getFormatBreakdown(items);

      // Assert
      const category = result.categories.find(c => c.name === '7" Single');
      expect(category).toBeDefined();
      expect(category!.count).toBe(1);
    });

    it('should categorize CD format', async () => {
      // Arrange
      const items = [
        createCollectionItem({ release: { format: ['CD', 'Album'] } }),
      ];

      // Act
      const result = await service.getFormatBreakdown(items);

      // Assert
      const category = result.categories.find(c => c.name === 'CD');
      expect(category).toBeDefined();
      expect(category!.count).toBe(1);
    });

    it('should categorize Cassette format', async () => {
      // Arrange
      const items = [
        createCollectionItem({ release: { format: ['Cassette'] } }),
      ];

      // Act
      const result = await service.getFormatBreakdown(items);

      // Assert
      const category = result.categories.find(c => c.name === 'Cassette');
      expect(category).toBeDefined();
      expect(category!.count).toBe(1);
    });

    it('should put unrecognized formats in Other category', async () => {
      // Arrange
      const items = [
        createCollectionItem({
          release: { format: ['Lathe Cut'] },
        }),
      ];

      // Act
      const result = await service.getFormatBreakdown(items);

      // Assert
      const other = result.categories.find(c => c.name === 'Other');
      expect(other).toBeDefined();
      expect(other!.count).toBe(1);
    });

    it('should handle items with empty format arrays', async () => {
      // Arrange
      const items = [createCollectionItem({ release: { format: [] } })];

      // Act
      const result = await service.getFormatBreakdown(items);

      // Assert
      const other = result.categories.find(c => c.name === 'Other');
      expect(other).toBeDefined();
      expect(other!.count).toBe(1);
    });

    it('should sort categories by count descending', async () => {
      // Arrange
      const items = [
        createCollectionItem({ id: 1, release: { id: 100, format: ['LP'] } }),
        createCollectionItem({ id: 2, release: { id: 200, format: ['LP'] } }),
        createCollectionItem({ id: 3, release: { id: 300, format: ['LP'] } }),
        createCollectionItem({ id: 4, release: { id: 400, format: ['CD'] } }),
        createCollectionItem({
          id: 5,
          release: { id: 500, format: ['Cassette'] },
        }),
      ];

      // Act
      const result = await service.getFormatBreakdown(items);

      // Assert
      expect(result.categories[0].name).toBe('LP (12")');
      expect(result.categories[0].count).toBe(3);
    });

    it('should include up to 3 examples per category', async () => {
      // Arrange
      const items = Array.from({ length: 5 }, (_, i) =>
        createCollectionItem({
          id: i + 1,
          release: {
            id: i + 100,
            format: ['LP'],
            artist: `Artist ${i + 1}`,
            title: `Album ${i + 1}`,
          },
        })
      );

      // Act
      const result = await service.getFormatBreakdown(items);

      // Assert
      const lpCategory = result.categories.find(c => c.name === 'LP (12")');
      expect(lpCategory!.examples).toHaveLength(3);
    });

    it('should calculate percentages correctly', async () => {
      // Arrange
      const items = [
        createCollectionItem({ id: 1, release: { id: 100, format: ['LP'] } }),
        createCollectionItem({ id: 2, release: { id: 200, format: ['LP'] } }),
        createCollectionItem({ id: 3, release: { id: 300, format: ['CD'] } }),
        createCollectionItem({ id: 4, release: { id: 400, format: ['CD'] } }),
      ];

      // Act
      const result = await service.getFormatBreakdown(items);

      // Assert
      const lpCategory = result.categories.find(c => c.name === 'LP (12")');
      expect(lpCategory!.percentage).toBe(50);
    });

    it('should return empty categories for empty collection', async () => {
      // Act
      const result = await service.getFormatBreakdown([]);

      // Assert
      expect(result.categories).toEqual([]);
      expect(result.totalItems).toBe(0);
    });

    it('should match first matching format category and skip rest', async () => {
      // Arrange - LP should match before Vinyl
      const items = [
        createCollectionItem({ release: { format: ['LP', 'Vinyl'] } }),
      ];

      // Act
      const result = await service.getFormatBreakdown(items);

      // Assert
      const lpCategory = result.categories.find(c => c.name === 'LP (12")');
      expect(lpCategory).toBeDefined();
      expect(lpCategory!.count).toBe(1);
      // Should not also appear under Vinyl (Other)
      expect(result.categories).toHaveLength(1);
    });
  });

  // ============================================
  // getLabelDistribution
  // ============================================
  describe('getLabelDistribution', () => {
    it('should count labels correctly', async () => {
      // Arrange
      const items = [
        createCollectionItem({
          id: 1,
          release: { id: 100, label: ['Sub Pop'] },
        }),
        createCollectionItem({
          id: 2,
          release: { id: 200, label: ['Sub Pop'] },
        }),
        createCollectionItem({
          id: 3,
          release: { id: 300, label: ['Warp Records'] },
        }),
      ];

      // Act
      const result = await service.getLabelDistribution(items);

      // Assert
      expect(result.totalLabels).toBe(2);
      expect(result.totalItems).toBe(3);
      const subPop = result.labels.find(l => l.name === 'Sub Pop');
      expect(subPop!.count).toBe(2);
    });

    it('should normalize label suffixes (Records, Ltd, Inc)', async () => {
      // Arrange
      const items = [
        createCollectionItem({
          id: 1,
          release: { id: 100, label: ['Warp Records'] },
        }),
        createCollectionItem({ id: 2, release: { id: 200, label: ['Warp'] } }),
      ];

      // Act
      const result = await service.getLabelDistribution(items);

      // Assert
      // Both should normalize to the same key
      expect(result.totalLabels).toBe(1);
      const warp = result.labels[0];
      expect(warp.count).toBe(2);
      expect(warp.variants).toContain('Warp Records');
      expect(warp.variants).toContain('Warp');
    });

    it('should normalize label suffixes for Ltd', async () => {
      // Arrange
      const items = [
        createCollectionItem({
          id: 1,
          release: { id: 100, label: ['XL Recordings'] },
        }),
        createCollectionItem({ id: 2, release: { id: 200, label: ['XL'] } }),
      ];

      // Act
      const result = await service.getLabelDistribution(items);

      // Assert
      expect(result.totalLabels).toBe(1);
      expect(result.labels[0].count).toBe(2);
    });

    it('should pick most common variant as canonical name', async () => {
      // Arrange
      const items = [
        createCollectionItem({
          id: 1,
          release: { id: 100, label: ['Warp Records'] },
        }),
        createCollectionItem({
          id: 2,
          release: { id: 200, label: ['Warp Records'] },
        }),
        createCollectionItem({ id: 3, release: { id: 300, label: ['Warp'] } }),
      ];

      // Act
      const result = await service.getLabelDistribution(items);

      // Assert
      expect(result.labels[0].name).toBe('Warp Records');
    });

    it('should skip empty label strings', async () => {
      // Arrange
      const items = [
        createCollectionItem({
          id: 1,
          release: { id: 100, label: ['', '  ', 'Sub Pop'] },
        }),
      ];

      // Act
      const result = await service.getLabelDistribution(items);

      // Assert
      expect(result.totalLabels).toBe(1);
      expect(result.labels[0].name).toBe('Sub Pop');
    });

    it('should handle items with no label array', async () => {
      // Arrange
      const item = createCollectionItem();
      // Manually remove label to simulate missing field
      (item.release as any).label = undefined;
      const items = [item];

      // Act
      const result = await service.getLabelDistribution(items);

      // Assert
      expect(result.totalLabels).toBe(0);
      expect(result.labels).toEqual([]);
    });

    it('should sort labels by count descending', async () => {
      // Arrange
      const items = [
        createCollectionItem({ id: 1, release: { id: 100, label: ['Alpha'] } }),
        createCollectionItem({ id: 2, release: { id: 200, label: ['Beta'] } }),
        createCollectionItem({ id: 3, release: { id: 300, label: ['Beta'] } }),
        createCollectionItem({ id: 4, release: { id: 400, label: ['Beta'] } }),
        createCollectionItem({ id: 5, release: { id: 500, label: ['Alpha'] } }),
      ];

      // Act
      const result = await service.getLabelDistribution(items);

      // Assert
      expect(result.labels[0].name).toBe('Beta');
      expect(result.labels[0].count).toBe(3);
      expect(result.labels[1].name).toBe('Alpha');
      expect(result.labels[1].count).toBe(2);
    });

    it('should calculate percentage relative to total items', async () => {
      // Arrange
      const items = [
        createCollectionItem({
          id: 1,
          release: { id: 100, label: ['Sub Pop'] },
        }),
        createCollectionItem({
          id: 2,
          release: { id: 200, label: ['Sub Pop'] },
        }),
        createCollectionItem({ id: 3, release: { id: 300, label: ['Warp'] } }),
        createCollectionItem({ id: 4, release: { id: 400, label: ['Warp'] } }),
      ];

      // Act
      const result = await service.getLabelDistribution(items);

      // Assert
      expect(result.labels[0].percentage).toBe(50);
    });

    it('should return empty distribution for empty collection', async () => {
      // Act
      const result = await service.getLabelDistribution([]);

      // Assert
      expect(result.labels).toEqual([]);
      expect(result.totalLabels).toBe(0);
      expect(result.totalItems).toBe(0);
    });

    it('should handle multiple labels per item', async () => {
      // Arrange
      const items = [
        createCollectionItem({
          id: 1,
          release: { id: 100, label: ['Sub Pop', 'City Slang'] },
        }),
      ];

      // Act
      const result = await service.getLabelDistribution(items);

      // Assert
      expect(result.totalLabels).toBe(2);
      expect(result.labels).toHaveLength(2);
    });
  });

  // ============================================
  // getDecadeHistogram
  // ============================================
  describe('getDecadeHistogram', () => {
    it('should group items by decade', async () => {
      // Arrange
      const items = [
        createCollectionItem({ id: 1, release: { id: 100, year: 1975 } }),
        createCollectionItem({ id: 2, release: { id: 200, year: 1978 } }),
        createCollectionItem({ id: 3, release: { id: 300, year: 1985 } }),
        createCollectionItem({ id: 4, release: { id: 400, year: 2020 } }),
      ];

      // Act
      const result = await service.getDecadeHistogram(items);

      // Assert
      expect(result.decades).toHaveLength(3);
      const seventies = result.decades.find(d => d.decade === '1970s');
      expect(seventies).toBeDefined();
      expect(seventies!.count).toBe(2);
      expect(seventies!.startYear).toBe(1970);
    });

    it('should track items with unknown years (year=0)', async () => {
      // Arrange
      const items = [
        createCollectionItem({ id: 1, release: { id: 100, year: 0 } }),
        createCollectionItem({ id: 2, release: { id: 200, year: 2020 } }),
      ];

      // Act
      const result = await service.getDecadeHistogram(items);

      // Assert
      expect(result.unknownYearCount).toBe(1);
      expect(result.decades).toHaveLength(1);
    });

    it('should track items with undefined/null years as unknown', async () => {
      // Arrange
      const item = createCollectionItem({ id: 1 });
      (item.release as any).year = undefined;
      const items = [item];

      // Act
      const result = await service.getDecadeHistogram(items);

      // Assert
      expect(result.unknownYearCount).toBe(1);
    });

    it('should calculate percentages based on known-year items only', async () => {
      // Arrange
      const items = [
        createCollectionItem({ id: 1, release: { id: 100, year: 1990 } }),
        createCollectionItem({ id: 2, release: { id: 200, year: 1995 } }),
        createCollectionItem({ id: 3, release: { id: 300, year: 0 } }), // unknown
      ];

      // Act
      const result = await service.getDecadeHistogram(items);

      // Assert
      const nineties = result.decades.find(d => d.decade === '1990s');
      expect(nineties!.percentage).toBe(100); // 2 out of 2 known-year items
    });

    it('should sort decades chronologically', async () => {
      // Arrange
      const items = [
        createCollectionItem({ id: 1, release: { id: 100, year: 2010 } }),
        createCollectionItem({ id: 2, release: { id: 200, year: 1960 } }),
        createCollectionItem({ id: 3, release: { id: 300, year: 1990 } }),
      ];

      // Act
      const result = await service.getDecadeHistogram(items);

      // Assert
      expect(result.decades[0].decade).toBe('1960s');
      expect(result.decades[1].decade).toBe('1990s');
      expect(result.decades[2].decade).toBe('2010s');
    });

    it('should also include individual year buckets', async () => {
      // Arrange
      const items = [
        createCollectionItem({ id: 1, release: { id: 100, year: 1975 } }),
        createCollectionItem({ id: 2, release: { id: 200, year: 1975 } }),
        createCollectionItem({ id: 3, release: { id: 300, year: 1978 } }),
      ];

      // Act
      const result = await service.getDecadeHistogram(items);

      // Assert
      expect(result.years).toHaveLength(2);
      const y1975 = result.years.find(y => y.year === 1975);
      expect(y1975!.count).toBe(2);
      const y1978 = result.years.find(y => y.year === 1978);
      expect(y1978!.count).toBe(1);
    });

    it('should sort year buckets chronologically', async () => {
      // Arrange
      const items = [
        createCollectionItem({ id: 1, release: { id: 100, year: 2020 } }),
        createCollectionItem({ id: 2, release: { id: 200, year: 1990 } }),
      ];

      // Act
      const result = await service.getDecadeHistogram(items);

      // Assert
      expect(result.years[0].year).toBe(1990);
      expect(result.years[1].year).toBe(2020);
    });

    it('should return empty histogram for empty collection', async () => {
      // Act
      const result = await service.getDecadeHistogram([]);

      // Assert
      expect(result.decades).toEqual([]);
      expect(result.years).toEqual([]);
      expect(result.unknownYearCount).toBe(0);
    });

    it('should handle collection with all unknown years', async () => {
      // Arrange
      const items = [
        createCollectionItem({ id: 1, release: { id: 100, year: 0 } }),
        createCollectionItem({ id: 2, release: { id: 200, year: 0 } }),
      ];

      // Act
      const result = await service.getDecadeHistogram(items);

      // Assert
      expect(result.decades).toEqual([]);
      expect(result.unknownYearCount).toBe(2);
    });
  });

  // ============================================
  // getGrowthTimeline
  // ============================================
  describe('getGrowthTimeline', () => {
    it('should group additions by month (default granularity)', async () => {
      // Arrange
      const items = [
        createCollectionItem({ id: 1, date_added: '2024-01-15T10:00:00Z' }),
        createCollectionItem({ id: 2, date_added: '2024-01-20T10:00:00Z' }),
        createCollectionItem({ id: 3, date_added: '2024-02-10T10:00:00Z' }),
      ];

      // Act
      const result = await service.getGrowthTimeline(items);

      // Assert
      expect(result.granularity).toBe('month');
      expect(result.dataPoints).toHaveLength(2);
      expect(result.dataPoints[0].period).toBe('2024-01');
      expect(result.dataPoints[0].added).toBe(2);
      expect(result.dataPoints[1].period).toBe('2024-02');
      expect(result.dataPoints[1].added).toBe(1);
    });

    it('should calculate cumulative totals', async () => {
      // Arrange
      const items = [
        createCollectionItem({ id: 1, date_added: '2024-01-15T10:00:00Z' }),
        createCollectionItem({ id: 2, date_added: '2024-01-20T10:00:00Z' }),
        createCollectionItem({ id: 3, date_added: '2024-02-10T10:00:00Z' }),
      ];

      // Act
      const result = await service.getGrowthTimeline(items);

      // Assert
      expect(result.dataPoints[0].cumulative).toBe(2);
      expect(result.dataPoints[1].cumulative).toBe(3);
    });

    it('should support year granularity', async () => {
      // Arrange
      const items = [
        createCollectionItem({ id: 1, date_added: '2022-05-10T10:00:00Z' }),
        createCollectionItem({ id: 2, date_added: '2023-03-15T10:00:00Z' }),
        createCollectionItem({ id: 3, date_added: '2024-01-01T10:00:00Z' }),
      ];

      // Act
      const result = await service.getGrowthTimeline(items, 'year');

      // Assert
      expect(result.granularity).toBe('year');
      expect(result.dataPoints).toHaveLength(3);
      expect(result.dataPoints[0].period).toBe('2022');
      expect(result.dataPoints[1].period).toBe('2023');
      expect(result.dataPoints[2].period).toBe('2024');
    });

    it('should handle overloaded call with just granularity string', async () => {
      // Arrange
      setupCollectionPages([
        createCollectionItem({ id: 1, date_added: '2024-01-15T10:00:00Z' }),
      ]);

      // Act
      const result = await service.getGrowthTimeline('year');

      // Assert
      expect(result.granularity).toBe('year');
    });

    it('should load collection from storage when no collection passed', async () => {
      // Arrange
      setupCollectionPages([
        createCollectionItem({ id: 1, date_added: '2024-01-15T10:00:00Z' }),
      ]);

      // Act
      const result = await service.getGrowthTimeline('month');

      // Assert
      expect(mockFileStorage.readJSON).toHaveBeenCalled();
      expect(result.dataPoints).toHaveLength(1);
    });

    it('should skip items with no date_added', async () => {
      // Arrange
      const item = createCollectionItem({ id: 1 });
      (item as any).date_added = '';
      const items = [
        item,
        createCollectionItem({ id: 2, date_added: '2024-01-15T10:00:00Z' }),
      ];

      // Act
      const result = await service.getGrowthTimeline(items);

      // Assert
      expect(result.dataPoints).toHaveLength(1);
      expect(result.totalAdded).toBe(2); // totalAdded is collection.length
    });

    it('should skip items with invalid dates', async () => {
      // Arrange
      const items = [
        createCollectionItem({ id: 1, date_added: 'not-a-date' }),
        createCollectionItem({ id: 2, date_added: '2024-03-01T10:00:00Z' }),
      ];

      // Act
      const result = await service.getGrowthTimeline(items);

      // Assert
      expect(result.dataPoints).toHaveLength(1);
    });

    it('should sort data points chronologically', async () => {
      // Arrange
      const items = [
        createCollectionItem({ id: 1, date_added: '2024-06-01T10:00:00Z' }),
        createCollectionItem({ id: 2, date_added: '2024-01-01T10:00:00Z' }),
        createCollectionItem({ id: 3, date_added: '2024-03-01T10:00:00Z' }),
      ];

      // Act
      const result = await service.getGrowthTimeline(items);

      // Assert
      expect(result.dataPoints[0].period).toBe('2024-01');
      expect(result.dataPoints[1].period).toBe('2024-03');
      expect(result.dataPoints[2].period).toBe('2024-06');
    });

    it('should return empty dataPoints for empty collection', async () => {
      // Act
      const result = await service.getGrowthTimeline([]);

      // Assert
      expect(result.dataPoints).toEqual([]);
      expect(result.totalAdded).toBe(0);
    });
  });

  // ============================================
  // getCollectionSummary
  // ============================================
  describe('getCollectionSummary', () => {
    it('should calculate total items, artists, and labels', async () => {
      // Arrange
      const items = [
        createCollectionItem({
          id: 1,
          release: { id: 100, artist: 'Artist A', label: ['Label 1'] },
        }),
        createCollectionItem({
          id: 2,
          release: {
            id: 200,
            artist: 'Artist B',
            label: ['Label 1', 'Label 2'],
          },
        }),
        createCollectionItem({
          id: 3,
          release: { id: 300, artist: 'Artist A', label: ['Label 3'] },
        }),
      ];

      // Act
      const result = await service.getCollectionSummary(items);

      // Assert
      expect(result.totalItems).toBe(3);
      expect(result.totalArtists).toBe(2);
      expect(result.totalLabels).toBe(3);
    });

    it('should find oldest and newest releases', async () => {
      // Arrange
      const items = [
        createCollectionItem({
          id: 1,
          release: {
            id: 100,
            artist: 'Old Artist',
            title: 'Old Album',
            year: 1965,
          },
        }),
        createCollectionItem({
          id: 2,
          release: {
            id: 200,
            artist: 'Mid Artist',
            title: 'Mid Album',
            year: 1990,
          },
        }),
        createCollectionItem({
          id: 3,
          release: {
            id: 300,
            artist: 'New Artist',
            title: 'New Album',
            year: 2024,
          },
        }),
      ];

      // Act
      const result = await service.getCollectionSummary(items);

      // Assert
      expect(result.oldestRelease).toEqual({
        year: 1965,
        artist: 'Old Artist',
        title: 'Old Album',
      });
      expect(result.newestRelease).toEqual({
        year: 2024,
        artist: 'New Artist',
        title: 'New Album',
      });
    });

    it('should find oldest and newest additions by date_added', async () => {
      // Arrange
      const items = [
        createCollectionItem({
          id: 1,
          date_added: '2023-01-01T00:00:00Z',
          release: { id: 100, artist: 'First', title: 'First Album' },
        }),
        createCollectionItem({
          id: 2,
          date_added: '2024-06-15T12:00:00Z',
          release: { id: 200, artist: 'Last', title: 'Last Album' },
        }),
      ];

      // Act
      const result = await service.getCollectionSummary(items);

      // Assert
      expect(result.oldestAddition!.artist).toBe('First');
      expect(result.newestAddition!.artist).toBe('Last');
    });

    it('should calculate average release year', async () => {
      // Arrange
      const items = [
        createCollectionItem({ id: 1, release: { id: 100, year: 2000 } }),
        createCollectionItem({ id: 2, release: { id: 200, year: 2010 } }),
      ];

      // Act
      const result = await service.getCollectionSummary(items);

      // Assert
      expect(result.averageReleaseYear).toBe(2005);
    });

    it('should exclude year=0 from average calculation', async () => {
      // Arrange
      const items = [
        createCollectionItem({ id: 1, release: { id: 100, year: 2000 } }),
        createCollectionItem({ id: 2, release: { id: 200, year: 0 } }),
      ];

      // Act
      const result = await service.getCollectionSummary(items);

      // Assert
      expect(result.averageReleaseYear).toBe(2000);
    });

    it('should calculate average rating for rated items', async () => {
      // Arrange
      const items = [
        createCollectionItem({ id: 1, rating: 4 }),
        createCollectionItem({ id: 2, rating: 5 }),
        createCollectionItem({ id: 3, rating: 0 }), // unrated
      ];

      // Act
      const result = await service.getCollectionSummary(items);

      // Assert
      expect(result.ratedCount).toBe(2);
      expect(result.averageRating).toBe(4.5);
    });

    it('should return null for averageRating when no items are rated', async () => {
      // Arrange
      const items = [
        createCollectionItem({ id: 1, rating: 0 }),
        createCollectionItem({ id: 2, rating: 0 }),
      ];

      // Act
      const result = await service.getCollectionSummary(items);

      // Assert
      expect(result.ratedCount).toBe(0);
      expect(result.averageRating).toBeNull();
    });

    it('should return null for averageReleaseYear when no known years', async () => {
      // Arrange
      const items = [
        createCollectionItem({ id: 1, release: { id: 100, year: 0 } }),
      ];

      // Act
      const result = await service.getCollectionSummary(items);

      // Assert
      expect(result.averageReleaseYear).toBeNull();
    });

    it('should handle empty collection', async () => {
      // Act
      const result = await service.getCollectionSummary([]);

      // Assert
      expect(result.totalItems).toBe(0);
      expect(result.totalArtists).toBe(0);
      expect(result.totalLabels).toBe(0);
      expect(result.oldestRelease).toBeNull();
      expect(result.newestRelease).toBeNull();
      expect(result.oldestAddition).toBeNull();
      expect(result.newestAddition).toBeNull();
      expect(result.averageReleaseYear).toBeNull();
      expect(result.averageRating).toBeNull();
    });
  });

  // ============================================
  // getCollectionValue
  // ============================================
  describe('getCollectionValue', () => {
    it('should return estimation, scan status, and cache metadata', async () => {
      // Arrange
      const now = Date.now();
      // readJSON calls: value-cache.json (for getValueEstimation - returns null),
      // scan-status.json (for getValueScanStatus), value-cache.json (for getCollectionValue)
      mockFileStorage.readJSON
        .mockResolvedValueOnce(null) // getValueEstimation -> cache
        .mockResolvedValueOnce(null) // getValueScanStatus -> status
        .mockResolvedValueOnce(null); // getCollectionValue -> cache for lastUpdated

      // Act
      const result = await service.getCollectionValue();

      // Assert
      expect(result).toHaveProperty('estimation');
      expect(result).toHaveProperty('scanStatus');
      expect(result).toHaveProperty('lastScanTimestamp');
      expect(result).toHaveProperty('cacheAge');
      expect(result.estimation).toBeNull();
      expect(result.scanStatus.status).toBe('idle');
    });

    it('should calculate cacheAge from lastUpdated timestamp', async () => {
      // Arrange
      const lastUpdated = Date.now() - 3600000; // 1 hour ago
      mockFileStorage.readJSON
        .mockResolvedValueOnce(null) // getValueEstimation
        .mockResolvedValueOnce(null) // getValueScanStatus
        .mockResolvedValueOnce({ schemaVersion: 1, lastUpdated, items: {} }); // cache for getCollectionValue

      // Act
      const result = await service.getCollectionValue();

      // Assert
      expect(result.lastScanTimestamp).toBe(lastUpdated);
      expect(result.cacheAge).toBeGreaterThanOrEqual(3600000);
    });
  });

  // ============================================
  // getValueEstimation
  // ============================================
  describe('getValueEstimation', () => {
    it('should return null when no cache exists', async () => {
      // Arrange
      mockFileStorage.readJSON.mockResolvedValue(null);

      // Act
      const result = await service.getValueEstimation();

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when cache has no items', async () => {
      // Arrange
      mockFileStorage.readJSON.mockResolvedValueOnce({
        schemaVersion: 1,
        lastUpdated: Date.now(),
        items: {},
      });

      // Act
      const result = await service.getValueEstimation();

      // Assert
      expect(result).toBeNull();
    });

    it('should calculate value estimation from cache and collection', async () => {
      // Arrange
      const cacheStore = {
        schemaVersion: 1,
        lastUpdated: Date.now(),
        items: {
          100: {
            releaseId: 100,
            lowestPrice: 10,
            medianPrice: 20,
            highestPrice: 30,
            numForSale: 5,
            currency: 'USD',
            fetchedAt: Date.now(),
          },
          200: {
            releaseId: 200,
            lowestPrice: 5,
            medianPrice: 15,
            highestPrice: 25,
            numForSale: 3,
            currency: 'USD',
            fetchedAt: Date.now(),
          },
        },
      };

      const collection = [
        createCollectionItem({
          id: 1,
          release: { id: 100, year: 1990, format: ['LP'] },
        }),
        createCollectionItem({
          id: 2,
          release: { id: 200, year: 2020, format: ['CD'] },
        }),
        createCollectionItem({
          id: 3,
          release: { id: 300, year: 2015, format: ['LP'] },
        }),
      ];

      // First readJSON call: value cache; then collection pages
      mockFileStorage.readJSON
        .mockResolvedValueOnce(cacheStore) // value cache
        .mockResolvedValueOnce(createCollectionPage(collection)) // collection page 1
        .mockResolvedValueOnce(null); // end of pages

      // Act
      const result = await service.getValueEstimation();

      // Assert
      expect(result).not.toBeNull();
      expect(result!.totalEstimatedValue).toBe(35); // 20 + 15
      expect(result!.totalLowestValue).toBe(15); // 10 + 5
      expect(result!.totalHighestValue).toBe(55); // 30 + 25
      expect(result!.currency).toBe('USD');
      expect(result!.itemsWithPricing).toBe(2);
      expect(result!.itemsWithoutPricing).toBe(1); // release 300 not in cache
      expect(result!.totalItems).toBe(3);
      expect(result!.averageItemValue).toBe(17.5); // 35 / 2
      expect(result!.mixedCurrencies).toBe(false);
    });

    it('should set mixedCurrencies when multiple currencies present', async () => {
      // Arrange
      const cacheStore = {
        schemaVersion: 1,
        lastUpdated: Date.now(),
        items: {
          100: {
            releaseId: 100,
            medianPrice: 20,
            numForSale: 5,
            currency: 'USD',
            fetchedAt: Date.now(),
          },
          200: {
            releaseId: 200,
            medianPrice: 15,
            numForSale: 3,
            currency: 'EUR',
            fetchedAt: Date.now(),
          },
        },
      };

      const collection = [
        createCollectionItem({ id: 1, release: { id: 100, format: ['LP'] } }),
        createCollectionItem({ id: 2, release: { id: 200, format: ['LP'] } }),
      ];

      mockFileStorage.readJSON
        .mockResolvedValueOnce(cacheStore)
        .mockResolvedValueOnce(createCollectionPage(collection))
        .mockResolvedValueOnce(null);

      // Act
      const result = await service.getValueEstimation();

      // Assert
      expect(result!.mixedCurrencies).toBe(true);
      expect(result!.currency).toBe('USD'); // falls back to USD for mixed
    });

    it('should aggregate value by decade', async () => {
      // Arrange
      const cacheStore = {
        schemaVersion: 1,
        lastUpdated: Date.now(),
        items: {
          100: {
            releaseId: 100,
            medianPrice: 20,
            numForSale: 5,
            currency: 'USD',
            fetchedAt: Date.now(),
          },
          200: {
            releaseId: 200,
            medianPrice: 30,
            numForSale: 3,
            currency: 'USD',
            fetchedAt: Date.now(),
          },
        },
      };

      const collection = [
        createCollectionItem({
          id: 1,
          release: { id: 100, year: 1975, format: ['LP'] },
        }),
        createCollectionItem({
          id: 2,
          release: { id: 200, year: 1978, format: ['LP'] },
        }),
      ];

      mockFileStorage.readJSON
        .mockResolvedValueOnce(cacheStore)
        .mockResolvedValueOnce(createCollectionPage(collection))
        .mockResolvedValueOnce(null);

      // Act
      const result = await service.getValueEstimation();

      // Assert
      const seventies = result!.valueByDecade.find(d => d.decade === '1970s');
      expect(seventies).toBeDefined();
      expect(seventies!.value).toBe(50);
      expect(seventies!.count).toBe(2);
    });

    it('should aggregate value by format', async () => {
      // Arrange
      const cacheStore = {
        schemaVersion: 1,
        lastUpdated: Date.now(),
        items: {
          100: {
            releaseId: 100,
            medianPrice: 25,
            numForSale: 5,
            currency: 'USD',
            fetchedAt: Date.now(),
          },
          200: {
            releaseId: 200,
            medianPrice: 10,
            numForSale: 3,
            currency: 'USD',
            fetchedAt: Date.now(),
          },
        },
      };

      const collection = [
        createCollectionItem({ id: 1, release: { id: 100, format: ['LP'] } }),
        createCollectionItem({ id: 2, release: { id: 200, format: ['CD'] } }),
      ];

      mockFileStorage.readJSON
        .mockResolvedValueOnce(cacheStore)
        .mockResolvedValueOnce(createCollectionPage(collection))
        .mockResolvedValueOnce(null);

      // Act
      const result = await service.getValueEstimation();

      // Assert
      const lpValue = result!.valueByFormat.find(f => f.format === 'LP (12")');
      expect(lpValue).toBeDefined();
      expect(lpValue!.value).toBe(25);
      const cdValue = result!.valueByFormat.find(f => f.format === 'CD');
      expect(cdValue).toBeDefined();
      expect(cdValue!.value).toBe(10);
    });

    it('should return top 10 most valuable and bottom 10 least valuable', async () => {
      // Arrange
      const items: Record<number, any> = {};
      const collection: CollectionItem[] = [];
      for (let i = 1; i <= 15; i++) {
        items[i] = {
          releaseId: i,
          medianPrice: i * 10,
          numForSale: 1,
          currency: 'USD',
          fetchedAt: Date.now(),
        };
        collection.push(
          createCollectionItem({
            id: i,
            release: {
              id: i,
              format: ['LP'],
              artist: `Artist ${i}`,
              title: `Album ${i}`,
            },
          })
        );
      }

      const cacheStore = {
        schemaVersion: 1,
        lastUpdated: Date.now(),
        items,
      };

      mockFileStorage.readJSON
        .mockResolvedValueOnce(cacheStore)
        .mockResolvedValueOnce(createCollectionPage(collection))
        .mockResolvedValueOnce(null);

      // Act
      const result = await service.getValueEstimation();

      // Assert
      expect(result!.mostValuableItems).toHaveLength(10);
      expect(result!.mostValuableItems[0].estimatedValue).toBe(150); // highest
      expect(result!.leastValuableItems).toHaveLength(10);
    });
  });

  // ============================================
  // getValueScanStatus
  // ============================================
  describe('getValueScanStatus', () => {
    it('should return idle status when no status file exists', async () => {
      // Arrange
      mockFileStorage.readJSON.mockResolvedValue(null);

      // Act
      const result = await service.getValueScanStatus();

      // Assert
      expect(result.status).toBe('idle');
      expect(result.itemsScanned).toBe(0);
      expect(result.totalItems).toBe(0);
      expect(result.progress).toBe(0);
    });

    it('should return stored scan status', async () => {
      // Arrange
      const storedStatus = {
        schemaVersion: 1,
        status: {
          status: 'scanning' as const,
          itemsScanned: 5,
          totalItems: 20,
          progress: 25,
          currentItem: 'Radiohead - OK Computer',
        },
      };
      mockFileStorage.readJSON.mockResolvedValue(storedStatus);

      // Act
      const result = await service.getValueScanStatus();

      // Assert
      expect(result.status).toBe('scanning');
      expect(result.itemsScanned).toBe(5);
      expect(result.totalItems).toBe(20);
      expect(result.progress).toBe(25);
      expect(result.currentItem).toBe('Radiohead - OK Computer');
    });
  });

  // ============================================
  // startValueScan
  // ============================================
  describe('startValueScan', () => {
    it('should throw when a scan is already in progress', async () => {
      // Arrange
      setupCollectionPages([createCollectionItem()]);
      mockWishlistService.getMarketplaceStats = jest
        .fn()
        .mockImplementation(
          () => new Promise(resolve => setTimeout(() => resolve(null), 100))
        );

      // Start first scan (don't await)
      const firstScan = service.startValueScan();

      // Act & Assert - second scan should throw
      await expect(service.startValueScan()).rejects.toThrow(
        'Value scan already in progress'
      );

      // Clean up
      await firstScan;
    });

    it('should process collection items and save value cache', async () => {
      // Arrange
      const collection = [
        createCollectionItem({
          id: 1,
          release: { id: 100, artist: 'Artist 1', title: 'Album 1' },
        }),
      ];
      setupCollectionPages(collection);

      const marketplaceStats = {
        lowestPrice: 10,
        medianPrice: 20,
        highestPrice: 30,
        numForSale: 5,
        currency: 'USD',
        lastFetched: Date.now(),
      };
      mockWishlistService.getMarketplaceStats = jest
        .fn()
        .mockResolvedValue(marketplaceStats);

      // Act
      await service.startValueScan();

      // Assert
      expect(mockWishlistService.getMarketplaceStats).toHaveBeenCalledWith(100);
      expect(mockFileStorage.writeJSONWithBackup).toHaveBeenCalled();
      // Scan status should be updated to completed
      const statusCalls = mockFileStorage.writeJSON.mock.calls;
      const lastStatusCall = statusCalls[statusCalls.length - 1] as any[];
      expect(lastStatusCall[0]).toContain('scan-status');
      expect(lastStatusCall[1].status.status).toBe('completed');
    });

    it('should skip items that are fresh in cache when not forcing', async () => {
      // Arrange
      const collection = [
        createCollectionItem({ id: 1, release: { id: 100 } }),
      ];

      // Setup: first readJSON for collection pages, but we need to handle the
      // cache read that happens before collection pages
      const freshCache = {
        schemaVersion: 1,
        lastUpdated: Date.now(),
        items: {
          100: {
            releaseId: 100,
            medianPrice: 20,
            numForSale: 5,
            currency: 'USD',
            fetchedAt: Date.now(), // very fresh
          },
        },
      };

      // loadCollection needs authService, then page reads
      // startValueScan: loadCollection (page1, page2=null), readJSON(cache)
      mockFileStorage.readJSON
        .mockResolvedValueOnce(createCollectionPage(collection)) // page 1
        .mockResolvedValueOnce(null) // end pages
        .mockResolvedValueOnce(freshCache); // existing cache

      mockWishlistService.getMarketplaceStats = jest.fn();

      // Act
      await service.startValueScan();

      // Assert - should not fetch marketplace stats since item is fresh
      expect(mockWishlistService.getMarketplaceStats).not.toHaveBeenCalled();
    });

    it('should re-scan all items when force=true', async () => {
      // Arrange
      const collection = [
        createCollectionItem({ id: 1, release: { id: 100 } }),
      ];

      const freshCache = {
        schemaVersion: 1,
        lastUpdated: Date.now(),
        items: {
          100: {
            releaseId: 100,
            medianPrice: 20,
            numForSale: 5,
            currency: 'USD',
            fetchedAt: Date.now(), // very fresh
          },
        },
      };

      mockFileStorage.readJSON
        .mockResolvedValueOnce(createCollectionPage(collection))
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(freshCache);

      mockWishlistService.getMarketplaceStats = jest.fn().mockResolvedValue({
        lowestPrice: 10,
        medianPrice: 20,
        highestPrice: 30,
        numForSale: 5,
        currency: 'USD',
        lastFetched: Date.now(),
      });

      // Act
      await service.startValueScan(20, true);

      // Assert - should fetch even though cache is fresh
      expect(mockWishlistService.getMarketplaceStats).toHaveBeenCalledWith(100);
    });

    it('should handle empty collection gracefully', async () => {
      // Arrange
      mockFileStorage.readJSON.mockResolvedValue(null); // no collection pages
      mockWishlistService.getMarketplaceStats = jest.fn();

      // Act
      await service.startValueScan();

      // Assert
      expect(mockWishlistService.getMarketplaceStats).not.toHaveBeenCalled();
    });

    it('should continue scanning when individual item fetch fails', async () => {
      // Arrange
      const collection = [
        createCollectionItem({ id: 1, release: { id: 100 } }),
        createCollectionItem({ id: 2, release: { id: 200 } }),
      ];
      setupCollectionPages(collection);

      mockWishlistService.getMarketplaceStats = jest
        .fn()
        .mockRejectedValueOnce(new Error('API rate limit'))
        .mockResolvedValueOnce({
          lowestPrice: 5,
          medianPrice: 10,
          highestPrice: 15,
          numForSale: 2,
          currency: 'USD',
          lastFetched: Date.now(),
        });

      // Act
      await service.startValueScan();

      // Assert - should have attempted both items
      expect(mockWishlistService.getMarketplaceStats).toHaveBeenCalledTimes(2);
      // Scan should still complete
      const statusCalls = mockFileStorage.writeJSON.mock.calls;
      const lastStatusCall = statusCalls[statusCalls.length - 1] as any[];
      expect(lastStatusCall[1].status.status).toBe('completed');
    });

    it('should update scan status to error when loadCollection fails', async () => {
      // Arrange
      mockAuthService.getUserSettings.mockRejectedValue(
        new Error('Auth failed')
      );

      // Act & Assert
      await expect(service.startValueScan()).rejects.toThrow('Auth failed');

      // Verify error status was written
      const statusCalls = mockFileStorage.writeJSON.mock.calls;
      const errorStatusCall = statusCalls[statusCalls.length - 1] as any[];
      expect(errorStatusCall[1].status.status).toBe('error');
      expect(errorStatusCall[1].status.error).toBe('Auth failed');
    });

    it('should reset scanning flag after completion', async () => {
      // Arrange
      setupCollectionPages([createCollectionItem()]);
      mockWishlistService.getMarketplaceStats = jest.fn().mockResolvedValue({
        lowestPrice: 5,
        medianPrice: 10,
        highestPrice: 15,
        numForSale: 2,
        currency: 'USD',
        lastFetched: Date.now(),
      });

      // Act
      await service.startValueScan();

      // Should be able to start another scan without error
      setupCollectionPages([createCollectionItem()]);
      await expect(service.startValueScan()).resolves.toBeUndefined();
    });

    it('should reset scanning flag after error', async () => {
      // Arrange
      mockAuthService.getUserSettings.mockRejectedValue(
        new Error('Auth failed')
      );

      // Act
      try {
        await service.startValueScan();
      } catch {
        // expected
      }

      // Reset auth so the next scan can proceed
      mockAuthService.getUserSettings.mockResolvedValue({
        discogs: { username: 'testuser' },
        lastfm: {},
        preferences: {
          defaultTimestamp: 'now' as const,
          batchSize: 50,
          autoScrobble: false,
        },
      });
      // Should be able to start another scan without "already in progress" error
      setupCollectionPages([]);
      await expect(service.startValueScan()).resolves.toBeUndefined();
    });

    it('should process items in batches', async () => {
      // Arrange - create 5 items, batch size 2
      const collection = Array.from({ length: 5 }, (_, i) =>
        createCollectionItem({
          id: i + 1,
          release: { id: i + 100, artist: `Artist ${i}`, title: `Album ${i}` },
        })
      );
      setupCollectionPages(collection);

      mockWishlistService.getMarketplaceStats = jest.fn().mockResolvedValue({
        lowestPrice: 5,
        medianPrice: 10,
        highestPrice: 15,
        numForSale: 2,
        currency: 'USD',
        lastFetched: Date.now(),
      });

      // Act
      await service.startValueScan(2);

      // Assert - all 5 items should be processed
      expect(mockWishlistService.getMarketplaceStats).toHaveBeenCalledTimes(5);
      // Cache should be saved after each batch (3 batches: 2+2+1)
      expect(mockFileStorage.writeJSONWithBackup).toHaveBeenCalledTimes(3);
    });
  });

  // ============================================
  // Multi-page collection loading
  // ============================================
  describe('loadCollection (via getCollectionOverview)', () => {
    it('should load multiple pages of collection data', async () => {
      // Arrange
      const page1 = [
        createCollectionItem({ id: 1, release: { id: 100 } }),
        createCollectionItem({ id: 2, release: { id: 200 } }),
      ];
      const page2 = [createCollectionItem({ id: 3, release: { id: 300 } })];
      setupMultiPageCollection([page1, page2]);

      // Act
      const overview = await service.getCollectionOverview();

      // Assert
      expect(overview.summary.totalItems).toBe(3);
    });

    it('should read collection pages with correct username prefix', async () => {
      // Arrange
      mockAuthService.getUserSettings.mockResolvedValue({
        discogs: { username: 'djvinyl' },
        lastfm: {},
        preferences: {
          defaultTimestamp: 'now' as const,
          batchSize: 50,
          autoScrobble: false,
        },
      });
      mockFileStorage.readJSON.mockResolvedValue(null);

      // Act
      await service.getCollectionOverview();

      // Assert
      expect(mockFileStorage.readJSON).toHaveBeenCalledWith(
        'collections/djvinyl-page-1.json'
      );
    });
  });
});
