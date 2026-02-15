import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import request from 'supertest';

import createCollectionAnalyticsRouter from '../../../src/backend/routes/collectionAnalytics';
import { AuthService } from '../../../src/backend/services/authService';
import { CollectionAnalyticsService } from '../../../src/backend/services/collectionAnalyticsService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';

// Mock dependencies
jest.mock('../../../src/backend/services/authService');
jest.mock('../../../src/backend/services/collectionAnalyticsService');
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
const MockedCollectionAnalyticsService =
  CollectionAnalyticsService as jest.MockedClass<
    typeof CollectionAnalyticsService
  >;
const MockedFileStorage = FileStorage as jest.MockedClass<typeof FileStorage>;

describe('Collection Analytics Routes', () => {
  let app: express.Application;
  let mockFileStorage: jest.Mocked<FileStorage>;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockCollectionAnalyticsService: jest.Mocked<CollectionAnalyticsService>;

  // ============================================
  // Factory functions for response data
  // ============================================

  function createMockOverview() {
    return {
      summary: {
        totalItems: 150,
        totalArtists: 80,
        totalLabels: 45,
        oldestRelease: { year: 1965, artist: 'The Beatles', title: 'Help!' },
        newestRelease: { year: 2024, artist: 'Radiohead', title: 'New Album' },
        oldestAddition: {
          date: '2020-01-01T00:00:00Z',
          artist: 'Pink Floyd',
          title: 'The Wall',
        },
        newestAddition: {
          date: '2024-06-15T12:00:00Z',
          artist: 'Radiohead',
          title: 'New Album',
        },
        averageReleaseYear: 1995,
        ratedCount: 50,
        averageRating: 4.2,
      },
      formats: {
        categories: [
          {
            name: 'LP (12")',
            count: 100,
            percentage: 66.7,
            examples: [{ artist: 'Radiohead', title: 'OK Computer' }],
          },
          {
            name: 'CD',
            count: 30,
            percentage: 20,
            examples: [{ artist: 'Pink Floyd', title: 'The Wall' }],
          },
        ],
        totalItems: 150,
      },
      labels: {
        labels: [
          {
            name: 'Sub Pop',
            count: 10,
            percentage: 6.7,
            variants: ['Sub Pop'],
          },
          {
            name: 'Warp Records',
            count: 8,
            percentage: 5.3,
            variants: ['Warp Records', 'Warp'],
          },
        ],
        totalLabels: 45,
        totalItems: 150,
      },
      decades: {
        decades: [
          { decade: '1970s', startYear: 1970, count: 20, percentage: 13.3 },
          { decade: '1990s', startYear: 1990, count: 50, percentage: 33.3 },
        ],
        years: [
          { year: 1975, count: 5 },
          { year: 1990, count: 10 },
        ],
        unknownYearCount: 3,
      },
      growth: {
        dataPoints: [
          { period: '2024-01', added: 5, cumulative: 145 },
          { period: '2024-02', added: 3, cumulative: 148 },
          { period: '2024-03', added: 2, cumulative: 150 },
        ],
        granularity: 'month' as const,
        totalAdded: 150,
      },
    };
  }

  function createMockValueResult() {
    return {
      estimation: {
        totalEstimatedValue: 2500.5,
        totalLowestValue: 1800.0,
        totalHighestValue: 3200.0,
        currency: 'USD',
        itemsWithPricing: 120,
        itemsWithoutPricing: 30,
        totalItems: 150,
        averageItemValue: 20.84,
        mostValuableItems: [],
        leastValuableItems: [],
        valueByDecade: [],
        valueByFormat: [],
        mixedCurrencies: false,
      },
      scanStatus: {
        status: 'completed' as const,
        itemsScanned: 150,
        totalItems: 150,
        progress: 100,
      },
      lastScanTimestamp: Date.now() - 3600000,
      cacheAge: 3600000,
    };
  }

  function createMockGrowthTimeline(granularity: 'month' | 'year' = 'month') {
    if (granularity === 'year') {
      return {
        dataPoints: [
          { period: '2022', added: 30, cumulative: 30 },
          { period: '2023', added: 50, cumulative: 80 },
          { period: '2024', added: 70, cumulative: 150 },
        ],
        granularity: 'year' as const,
        totalAdded: 150,
      };
    }
    return {
      dataPoints: [
        { period: '2024-01', added: 5, cumulative: 145 },
        { period: '2024-02', added: 3, cumulative: 148 },
        { period: '2024-03', added: 2, cumulative: 150 },
      ],
      granularity: 'month' as const,
      totalAdded: 150,
    };
  }

  function createMockScanStatus(
    status: 'idle' | 'scanning' | 'completed' | 'error' = 'idle'
  ) {
    return {
      status,
      itemsScanned:
        status === 'scanning' ? 50 : status === 'completed' ? 150 : 0,
      totalItems: status === 'idle' ? 0 : 150,
      progress: status === 'scanning' ? 33 : status === 'completed' ? 100 : 0,
      ...(status === 'scanning' && {
        currentItem: 'Radiohead - OK Computer',
        estimatedTimeRemaining: 60000,
      }),
      ...(status === 'error' && { error: 'API rate limit exceeded' }),
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock instances
    mockFileStorage = new MockedFileStorage('test') as jest.Mocked<FileStorage>;
    mockAuthService = new MockedAuthService(
      mockFileStorage
    ) as jest.Mocked<AuthService>;
    mockCollectionAnalyticsService = new MockedCollectionAnalyticsService(
      mockFileStorage,
      mockAuthService,
      {} as any
    ) as jest.Mocked<CollectionAnalyticsService>;

    // Setup default mocks
    mockCollectionAnalyticsService.getCollectionOverview = jest
      .fn()
      .mockResolvedValue(createMockOverview());
    mockCollectionAnalyticsService.getCollectionValue = jest
      .fn()
      .mockResolvedValue(createMockValueResult());
    mockCollectionAnalyticsService.startValueScan = jest
      .fn()
      .mockResolvedValue(undefined);
    mockCollectionAnalyticsService.getValueScanStatus = jest
      .fn()
      .mockResolvedValue(createMockScanStatus('idle'));
    mockCollectionAnalyticsService.getGrowthTimeline = jest
      .fn()
      .mockResolvedValue(createMockGrowthTimeline());

    // Create Express app
    app = express();
    app.use(helmet());
    app.use(cors());
    app.use(express.json());

    // Mount collection analytics routes
    app.use(
      '/api/v1/collection-analytics',
      createCollectionAnalyticsRouter(
        mockFileStorage,
        mockAuthService,
        mockCollectionAnalyticsService
      )
    );
  });

  // ============================================
  // GET /overview
  // ============================================
  describe('GET /api/v1/collection-analytics/overview', () => {
    it('should return 200 with complete overview data', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/collection-analytics/overview'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('summary');
      expect(response.body.data).toHaveProperty('formats');
      expect(response.body.data).toHaveProperty('labels');
      expect(response.body.data).toHaveProperty('decades');
      expect(response.body.data).toHaveProperty('growth');
      expect(
        mockCollectionAnalyticsService.getCollectionOverview
      ).toHaveBeenCalled();
    });

    it('should return summary with correct values', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/collection-analytics/overview'
      );

      // Assert
      const summary = response.body.data.summary;
      expect(summary.totalItems).toBe(150);
      expect(summary.totalArtists).toBe(80);
      expect(summary.totalLabels).toBe(45);
      expect(summary.averageReleaseYear).toBe(1995);
    });

    it('should return format breakdown data', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/collection-analytics/overview'
      );

      // Assert
      const formats = response.body.data.formats;
      expect(formats.totalItems).toBe(150);
      expect(formats.categories).toHaveLength(2);
      expect(formats.categories[0].name).toBe('LP (12")');
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockCollectionAnalyticsService.getCollectionOverview.mockRejectedValue(
        new Error('Database error')
      );

      // Act
      const response = await request(app).get(
        '/api/v1/collection-analytics/overview'
      );

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain(
        'Failed to get collection analytics overview'
      );
    });
  });

  // ============================================
  // GET /value
  // ============================================
  describe('GET /api/v1/collection-analytics/value', () => {
    it('should return 200 with value estimation data', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/collection-analytics/value'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('estimation');
      expect(response.body.data).toHaveProperty('scanStatus');
      expect(response.body.data).toHaveProperty('lastScanTimestamp');
      expect(response.body.data).toHaveProperty('cacheAge');
      expect(
        mockCollectionAnalyticsService.getCollectionValue
      ).toHaveBeenCalled();
    });

    it('should return estimation with correct values', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/collection-analytics/value'
      );

      // Assert
      const estimation = response.body.data.estimation;
      expect(estimation.totalEstimatedValue).toBe(2500.5);
      expect(estimation.currency).toBe('USD');
      expect(estimation.itemsWithPricing).toBe(120);
      expect(estimation.itemsWithoutPricing).toBe(30);
    });

    it('should handle null estimation (no scan data)', async () => {
      // Arrange
      mockCollectionAnalyticsService.getCollectionValue.mockResolvedValue({
        estimation: null,
        scanStatus: {
          status: 'idle',
          itemsScanned: 0,
          totalItems: 0,
          progress: 0,
        },
        lastScanTimestamp: null,
        cacheAge: 0,
      });

      // Act
      const response = await request(app).get(
        '/api/v1/collection-analytics/value'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.estimation).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockCollectionAnalyticsService.getCollectionValue.mockRejectedValue(
        new Error('Value fetch error')
      );

      // Act
      const response = await request(app).get(
        '/api/v1/collection-analytics/value'
      );

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Failed to get collection value');
    });
  });

  // ============================================
  // POST /value/scan
  // ============================================
  describe('POST /api/v1/collection-analytics/value/scan', () => {
    it('should return 202 when scan starts successfully', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/collection-analytics/value/scan')
        .send({});

      // Assert
      expect(response.status).toBe(202);
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Value scan started');
      expect(
        mockCollectionAnalyticsService.startValueScan
      ).toHaveBeenCalledWith(undefined, undefined);
    });

    it('should pass batchSize and force parameters', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/collection-analytics/value/scan')
        .send({ batchSize: 10, force: true });

      // Assert
      expect(response.status).toBe(202);
      expect(
        mockCollectionAnalyticsService.startValueScan
      ).toHaveBeenCalledWith(10, true);
    });

    it('should return 409 when scan status is already scanning', async () => {
      // Arrange - getValueScanStatus returns scanning, so 409 is returned before startValueScan
      mockCollectionAnalyticsService.getValueScanStatus.mockResolvedValue(
        createMockScanStatus('scanning')
      );

      // Act
      const response = await request(app)
        .post('/api/v1/collection-analytics/value/scan')
        .send({});

      // Assert
      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('already in progress');
      // Should also return current scan status
      expect(response.body.data).toBeDefined();
      expect(response.body.data.status).toBe('scanning');
      // startValueScan should not have been called
      expect(
        mockCollectionAnalyticsService.startValueScan
      ).not.toHaveBeenCalled();
    });

    it('should return 500 when getValueScanStatus throws', async () => {
      // Arrange - the only way to get 500 is if getValueScanStatus itself throws
      mockCollectionAnalyticsService.getValueScanStatus.mockRejectedValue(
        new Error('Status check failed')
      );

      // Act
      const response = await request(app)
        .post('/api/v1/collection-analytics/value/scan')
        .send({});

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Failed to start value scan');
    });

    it('should handle request with no body', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/collection-analytics/value/scan')
        .send();

      // Assert
      expect(response.status).toBe(202);
      expect(
        mockCollectionAnalyticsService.startValueScan
      ).toHaveBeenCalledWith(undefined, undefined);
    });
  });

  // ============================================
  // GET /value/scan/status
  // ============================================
  describe('GET /api/v1/collection-analytics/value/scan/status', () => {
    it('should return 200 with idle status', async () => {
      // Arrange
      mockCollectionAnalyticsService.getValueScanStatus.mockResolvedValue(
        createMockScanStatus('idle')
      );

      // Act
      const response = await request(app).get(
        '/api/v1/collection-analytics/value/scan/status'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('idle');
      expect(response.body.data.progress).toBe(0);
    });

    it('should return scanning status with progress', async () => {
      // Arrange
      mockCollectionAnalyticsService.getValueScanStatus.mockResolvedValue(
        createMockScanStatus('scanning')
      );

      // Act
      const response = await request(app).get(
        '/api/v1/collection-analytics/value/scan/status'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('scanning');
      expect(response.body.data.itemsScanned).toBe(50);
      expect(response.body.data.totalItems).toBe(150);
      expect(response.body.data.progress).toBe(33);
      expect(response.body.data.currentItem).toBe('Radiohead - OK Computer');
    });

    it('should return completed status', async () => {
      // Arrange
      mockCollectionAnalyticsService.getValueScanStatus.mockResolvedValue(
        createMockScanStatus('completed')
      );

      // Act
      const response = await request(app).get(
        '/api/v1/collection-analytics/value/scan/status'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('completed');
      expect(response.body.data.progress).toBe(100);
    });

    it('should return error status', async () => {
      // Arrange
      mockCollectionAnalyticsService.getValueScanStatus.mockResolvedValue(
        createMockScanStatus('error')
      );

      // Act
      const response = await request(app).get(
        '/api/v1/collection-analytics/value/scan/status'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('error');
      expect(response.body.data.error).toBe('API rate limit exceeded');
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockCollectionAnalyticsService.getValueScanStatus.mockRejectedValue(
        new Error('Status fetch error')
      );

      // Act
      const response = await request(app).get(
        '/api/v1/collection-analytics/value/scan/status'
      );

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Failed to get value scan status');
    });
  });

  // ============================================
  // GET /formats
  // ============================================
  describe('GET /api/v1/collection-analytics/formats', () => {
    it('should return 200 with format breakdown data', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/collection-analytics/formats'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('categories');
      expect(response.body.data).toHaveProperty('totalItems');
      expect(response.body.data.categories).toHaveLength(2);
    });

    it('should return categories with correct fields', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/collection-analytics/formats'
      );

      // Assert
      const firstCategory = response.body.data.categories[0];
      expect(firstCategory).toHaveProperty('name');
      expect(firstCategory).toHaveProperty('count');
      expect(firstCategory).toHaveProperty('percentage');
      expect(firstCategory).toHaveProperty('examples');
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockCollectionAnalyticsService.getCollectionOverview.mockRejectedValue(
        new Error('Format error')
      );

      // Act
      const response = await request(app).get(
        '/api/v1/collection-analytics/formats'
      );

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Failed to get format breakdown');
    });
  });

  // ============================================
  // GET /labels
  // ============================================
  describe('GET /api/v1/collection-analytics/labels', () => {
    it('should return 200 with label distribution data', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/collection-analytics/labels'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('labels');
      expect(response.body.data).toHaveProperty('totalLabels');
      expect(response.body.data).toHaveProperty('totalItems');
    });

    it('should return label data with variants', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/collection-analytics/labels'
      );

      // Assert
      const warpLabel = response.body.data.labels.find(
        (l: any) => l.name === 'Warp Records'
      );
      expect(warpLabel).toBeDefined();
      expect(warpLabel.variants).toContain('Warp Records');
      expect(warpLabel.variants).toContain('Warp');
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockCollectionAnalyticsService.getCollectionOverview.mockRejectedValue(
        new Error('Label error')
      );

      // Act
      const response = await request(app).get(
        '/api/v1/collection-analytics/labels'
      );

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Failed to get label distribution');
    });
  });

  // ============================================
  // GET /decades
  // ============================================
  describe('GET /api/v1/collection-analytics/decades', () => {
    it('should return 200 with decade histogram data', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/collection-analytics/decades'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('decades');
      expect(response.body.data).toHaveProperty('years');
      expect(response.body.data).toHaveProperty('unknownYearCount');
    });

    it('should return decade buckets with correct fields', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/collection-analytics/decades'
      );

      // Assert
      const firstDecade = response.body.data.decades[0];
      expect(firstDecade).toHaveProperty('decade');
      expect(firstDecade).toHaveProperty('startYear');
      expect(firstDecade).toHaveProperty('count');
      expect(firstDecade).toHaveProperty('percentage');
      expect(firstDecade.decade).toBe('1970s');
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockCollectionAnalyticsService.getCollectionOverview.mockRejectedValue(
        new Error('Decade error')
      );

      // Act
      const response = await request(app).get(
        '/api/v1/collection-analytics/decades'
      );

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Failed to get decade histogram');
    });
  });

  // ============================================
  // GET /growth
  // ============================================
  describe('GET /api/v1/collection-analytics/growth', () => {
    it('should return 200 with monthly growth data by default', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/collection-analytics/growth'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('dataPoints');
      expect(response.body.data).toHaveProperty('granularity');
      expect(response.body.data).toHaveProperty('totalAdded');
      expect(
        mockCollectionAnalyticsService.getGrowthTimeline
      ).toHaveBeenCalledWith('month');
    });

    it('should accept granularity=year query parameter', async () => {
      // Arrange
      mockCollectionAnalyticsService.getGrowthTimeline.mockResolvedValue(
        createMockGrowthTimeline('year')
      );

      // Act
      const response = await request(app).get(
        '/api/v1/collection-analytics/growth?granularity=year'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.granularity).toBe('year');
      expect(
        mockCollectionAnalyticsService.getGrowthTimeline
      ).toHaveBeenCalledWith('year');
    });

    it('should default to month for invalid granularity', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/collection-analytics/growth?granularity=invalid'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(
        mockCollectionAnalyticsService.getGrowthTimeline
      ).toHaveBeenCalledWith('month');
    });

    it('should return growth data points with correct fields', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/collection-analytics/growth'
      );

      // Assert
      const firstPoint = response.body.data.dataPoints[0];
      expect(firstPoint).toHaveProperty('period');
      expect(firstPoint).toHaveProperty('added');
      expect(firstPoint).toHaveProperty('cumulative');
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockCollectionAnalyticsService.getGrowthTimeline.mockRejectedValue(
        new Error('Growth error')
      );

      // Act
      const response = await request(app).get(
        '/api/v1/collection-analytics/growth'
      );

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Failed to get growth timeline');
    });
  });
});
