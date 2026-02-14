import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import request from 'supertest';

import createPatternsRouter from '../../../src/backend/routes/patterns';
import { ListeningPatternService } from '../../../src/backend/services/listeningPatternService';
import { ScrobbleHistoryStorage } from '../../../src/backend/services/scrobbleHistoryStorage';
import { FileStorage } from '../../../src/backend/utils/fileStorage';
import { ListeningPatterns } from '../../../src/shared/types';

// Mock dependencies
jest.mock('../../../src/backend/services/listeningPatternService');
jest.mock('../../../src/backend/services/scrobbleHistoryStorage');
jest.mock('../../../src/backend/utils/fileStorage');

const MockedPatternService = ListeningPatternService as jest.MockedClass<
  typeof ListeningPatternService
>;
const MockedHistoryStorage = ScrobbleHistoryStorage as jest.MockedClass<
  typeof ScrobbleHistoryStorage
>;
const MockedFileStorage = FileStorage as jest.MockedClass<typeof FileStorage>;

describe('Patterns Routes', () => {
  let app: express.Application;
  let mockPatternService: jest.Mocked<ListeningPatternService>;

  const mockPatterns: ListeningPatterns = {
    typicalStartTimes: Array.from({ length: 7 }, (_, i) => ({
      dayOfWeek: i,
      morning: i < 5 ? 9 : 10,
      afternoon: 14,
      evening: 20,
    })),
    averageSessionLengthMinutes: 90,
    averageGapBetweenAlbumsMinutes: 15,
    averageAlbumsPerSession: 2.5,
    weekdayPattern: { peakHour: 20, sessionCount: 15 },
    weekendPattern: { peakHour: 14, sessionCount: 8 },
    analyzedFromTimestamp: 1700000000,
    analyzedToTimestamp: 1734000000,
    sessionCount: 23,
    lastCalculated: Date.now(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    const mockFileStorage = new MockedFileStorage(
      'test'
    ) as jest.Mocked<FileStorage>;
    const mockHistoryStorage = new MockedHistoryStorage(
      mockFileStorage
    ) as jest.Mocked<ScrobbleHistoryStorage>;

    mockPatternService = new MockedPatternService(
      mockHistoryStorage
    ) as jest.Mocked<ListeningPatternService>;

    // Set up default mock implementations
    mockPatternService.getPatterns = jest.fn().mockResolvedValue(mockPatterns);
    mockPatternService.calculatePatterns = jest
      .fn()
      .mockResolvedValue(mockPatterns);
    mockPatternService.suggestBackfillTimestamps = jest.fn().mockResolvedValue([
      {
        presetLabel: 'Yesterday evening',
        presetDescription: '8:00 PM',
        startTimestamp: 1734300000,
        calculatedTimestamps: [
          {
            albumIndex: 0,
            startTimestamp: 1734300000,
            endTimestamp: 1734303180,
          },
        ],
        hasConflicts: false,
        isOutsideLastFmWindow: false,
      },
    ]);
    mockPatternService.checkConflicts = jest
      .fn()
      .mockResolvedValue({ hasConflicts: false });

    // Create Express app
    app = express();
    app.use(helmet());
    app.use(cors());
    app.use(express.json());
    app.use('/api/v1/patterns', createPatternsRouter(mockPatternService));
  });

  describe('GET /api/v1/patterns', () => {
    it('should return patterns when available', async () => {
      // Act
      const response = await request(app).get('/api/v1/patterns').expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.sessionCount).toBe(23);
      expect(response.body.data.typicalStartTimes).toHaveLength(7);
      expect(mockPatternService.getPatterns).toHaveBeenCalledTimes(1);
    });

    it('should return null data with message when no patterns available', async () => {
      // Arrange
      mockPatternService.getPatterns = jest.fn().mockResolvedValue(null);

      // Act
      const response = await request(app).get('/api/v1/patterns').expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeNull();
      expect(response.body.message).toContain('Insufficient');
    });

    it('should handle service errors gracefully', async () => {
      // Arrange
      mockPatternService.getPatterns = jest
        .fn()
        .mockRejectedValue(new Error('Storage read failed'));

      // Act
      const response = await request(app).get('/api/v1/patterns').expect(500);

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Storage read failed');
    });
  });

  describe('POST /api/v1/patterns/suggest', () => {
    const validBody = {
      albums: [
        {
          releaseId: 1,
          artist: 'Radiohead',
          album: 'OK Computer',
          durationSeconds: 3180,
          trackCount: 12,
        },
      ],
    };

    it('should return suggestions for valid albums', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/patterns/suggest')
        .send(validBody)
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].presetLabel).toBe('Yesterday evening');
      expect(mockPatternService.suggestBackfillTimestamps).toHaveBeenCalledWith(
        validBody.albums,
        expect.any(Object)
      );
    });

    it('should reject missing albums array', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/patterns/suggest')
        .send({})
        .expect(400);

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('albums array is required');
    });

    it('should reject empty albums array', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/patterns/suggest')
        .send({ albums: [] })
        .expect(400);

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('albums array is required');
    });

    it('should reject albums missing required fields', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/patterns/suggest')
        .send({ albums: [{ artist: 'Radiohead' }] })
        .expect(400);

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain(
        'artist, album, and durationSeconds'
      );
    });

    it('should reject albums with non-numeric durationSeconds', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/patterns/suggest')
        .send({
          albums: [
            {
              releaseId: 1,
              artist: 'Radiohead',
              album: 'OK Computer',
              durationSeconds: 'not-a-number',
              trackCount: 12,
            },
          ],
        })
        .expect(400);

      // Assert
      expect(response.body.success).toBe(false);
    });

    it('should handle service errors gracefully', async () => {
      // Arrange
      mockPatternService.suggestBackfillTimestamps = jest
        .fn()
        .mockRejectedValue(new Error('Suggestion failed'));

      // Act
      const response = await request(app)
        .post('/api/v1/patterns/suggest')
        .send(validBody)
        .expect(500);

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Suggestion failed');
    });
  });

  describe('POST /api/v1/patterns/check-conflicts', () => {
    it('should check conflicts for valid timestamps', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/patterns/check-conflicts')
        .send({ startTimestamp: 1734300000, endTimestamp: 1734310000 })
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data.hasConflicts).toBe(false);
      expect(mockPatternService.checkConflicts).toHaveBeenCalledWith(
        1734300000,
        1734310000
      );
    });

    it('should return conflict info when conflicts exist', async () => {
      // Arrange
      mockPatternService.checkConflicts = jest.fn().mockResolvedValue({
        hasConflicts: true,
        message: 'You have 5 existing scrobble(s)',
        existingCount: 5,
      });

      // Act
      const response = await request(app)
        .post('/api/v1/patterns/check-conflicts')
        .send({ startTimestamp: 1734300000, endTimestamp: 1734310000 })
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data.hasConflicts).toBe(true);
      expect(response.body.data.existingCount).toBe(5);
    });

    it('should reject missing timestamps', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/patterns/check-conflicts')
        .send({})
        .expect(400);

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('startTimestamp and endTimestamp');
    });

    it('should reject non-numeric timestamps', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/patterns/check-conflicts')
        .send({ startTimestamp: 'abc', endTimestamp: 'def' })
        .expect(400);

      // Assert
      expect(response.body.success).toBe(false);
    });

    it('should handle service errors gracefully', async () => {
      // Arrange
      mockPatternService.checkConflicts = jest
        .fn()
        .mockRejectedValue(new Error('Check failed'));

      // Act
      const response = await request(app)
        .post('/api/v1/patterns/check-conflicts')
        .send({ startTimestamp: 1734300000, endTimestamp: 1734310000 })
        .expect(500);

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Check failed');
    });
  });

  describe('POST /api/v1/patterns/recalculate', () => {
    it('should recalculate and return patterns', async () => {
      // Act
      const response = await request(app)
        .post('/api/v1/patterns/recalculate')
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.message).toBe('Patterns recalculated');
      expect(mockPatternService.calculatePatterns).toHaveBeenCalledTimes(1);
    });

    it('should handle insufficient data', async () => {
      // Arrange
      mockPatternService.calculatePatterns = jest.fn().mockResolvedValue(null);

      // Act
      const response = await request(app)
        .post('/api/v1/patterns/recalculate')
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeNull();
      expect(response.body.message).toBe('Insufficient data');
    });

    it('should handle service errors gracefully', async () => {
      // Arrange
      mockPatternService.calculatePatterns = jest
        .fn()
        .mockRejectedValue(new Error('Calculation failed'));

      // Act
      const response = await request(app)
        .post('/api/v1/patterns/recalculate')
        .expect(500);

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Calculation failed');
    });
  });
});
