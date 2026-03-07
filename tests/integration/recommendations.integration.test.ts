/**
 * Integration tests for the recommendations API routes.
 *
 * Uses supertest against a real Express app. All external dependencies
 * (RecommendationService, LastFmService, AuthService) are mocked.
 */

import request from 'supertest';

import { createRecommendationsRouter } from '../../src/backend/routes/recommendations';
import { AuthService } from '../../src/backend/services/authService';
import { LastFmService } from '../../src/backend/services/lastfmService';
import { RecommendationService } from '../../src/backend/services/recommendationService';
import { FileStorage } from '../../src/backend/utils/fileStorage';
import {
  createMockRecommendationResult,
  createMockRecommendationSettings,
} from '../fixtures/embeddingFixtures';
import { createTestApp } from '../utils/testHelpers';

jest.mock('../../src/backend/services/recommendationService');
jest.mock('../../src/backend/services/lastfmService');
jest.mock('../../src/backend/services/authService');

const MockedRecommendationService = RecommendationService as jest.MockedClass<
  typeof RecommendationService
>;
const MockedLastFmService = LastFmService as jest.MockedClass<
  typeof LastFmService
>;
const MockedAuthService = AuthService as jest.MockedClass<typeof AuthService>;

describe('Recommendations Routes (Integration)', () => {
  let mockRecommendationService: jest.Mocked<RecommendationService>;
  let mockLastFmService: jest.Mocked<LastFmService>;
  let mockAuthService: jest.Mocked<AuthService>;

  const mockSettings = createMockRecommendationSettings();
  const mockResult = createMockRecommendationResult();

  // Helper to build a test app with current mocks
  function buildApp() {
    return createTestApp({
      mountPath: '/api/v1/recommendations',
      routerFactory: () =>
        createRecommendationsRouter(
          mockRecommendationService,
          mockLastFmService,
          mockAuthService,
          {
            readJSON: jest.fn().mockResolvedValue(null),
          } as unknown as FileStorage
        ),
      mocks: {},
    }).app;
  }

  beforeEach(() => {
    mockRecommendationService = new MockedRecommendationService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    ) as jest.Mocked<RecommendationService>;

    mockLastFmService = new MockedLastFmService(
      {} as never,
      {} as never
    ) as jest.Mocked<LastFmService>;

    mockAuthService = new MockedAuthService(
      {} as never
    ) as jest.Mocked<AuthService>;

    const defaultPreferences = {
      defaultTimestamp: 'now' as const,
      batchSize: 10,
      autoScrobble: false,
    };

    // Default: authenticated user
    mockAuthService.getUserSettings = jest.fn().mockResolvedValue({
      discogs: { username: 'testuser', token: 'test-token' },
      lastfm: { username: 'testuser', apiKey: 'key', sessionKey: 'sess' },
      preferences: defaultPreferences,
    });

    // Default: 5 recent scrobbles within the time window
    const windowFromMs = Date.now() - 168 * 60 * 60 * 1000;
    const recentTimestamp = Math.floor((windowFromMs + 1000) / 1000); // Just inside the window
    mockLastFmService.getRecentScrobbles = jest.fn().mockResolvedValue([
      {
        name: 'Karma Police',
        artist: { '#text': 'Radiohead' },
        album: { '#text': 'OK Computer' },
        date: { uts: String(recentTimestamp) },
      },
    ]);

    mockRecommendationService.getRecommendations = jest
      .fn()
      .mockResolvedValue([mockResult]);
    mockRecommendationService.getDebugBreakdown = jest.fn().mockResolvedValue({
      release: mockResult.release,
      breakdown: mockResult.breakdown,
      explanation: mockResult.explanation,
    });
    mockRecommendationService.submitFeedback = jest
      .fn()
      .mockResolvedValue(undefined);
    mockRecommendationService.getSettings = jest
      .fn()
      .mockResolvedValue(mockSettings);
    mockRecommendationService.updateSettings = jest
      .fn()
      .mockResolvedValue(undefined);
  });

  describe('GET /api/v1/recommendations', () => {
    it('should return 200 with scored results', async () => {
      // Arrange
      const app = buildApp();

      // Act
      const response = await request(app).get('/api/v1/recommendations');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should return 401 when Last.fm is not authenticated', async () => {
      // Arrange
      mockAuthService.getUserSettings.mockResolvedValue({
        discogs: { username: 'testuser', token: '' },
        lastfm: { username: '', apiKey: '', sessionKey: '' },
        preferences: {
          defaultTimestamp: 'now' as const,
          batchSize: 10,
          autoScrobble: false,
        },
      });
      const app = buildApp();

      // Act
      const response = await request(app).get('/api/v1/recommendations');

      // Assert
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should return 400 when count is out of range (< 1)', async () => {
      // Arrange — use -1 because 0 is coerced to the default by parseInt(...) || 10
      const app = buildApp();

      // Act
      const response = await request(app)
        .get('/api/v1/recommendations')
        .query({ count: -1 });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('count must be between 1 and 100');
    });

    it('should return 400 when count is out of range (> 100)', async () => {
      // Arrange
      const app = buildApp();

      // Act
      const response = await request(app)
        .get('/api/v1/recommendations')
        .query({ count: 101 });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('count must be between 1 and 100');
    });

    it('should return 400 when window is out of range', async () => {
      // Arrange — use -1 because 0 is coerced to the default by parseInt(...) || 168
      const app = buildApp();

      // Act
      const response = await request(app)
        .get('/api/v1/recommendations')
        .query({ window: -1 });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toContain(
        'window must be between 1 and 8760'
      );
    });

    it('should return 400 when minScore is out of range', async () => {
      // Arrange
      const app = buildApp();

      // Act
      const response = await request(app)
        .get('/api/v1/recommendations')
        .query({ minScore: 1.5 });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('minScore must be between 0 and 1');
    });

    it('should pass count and window parameters to recommendation service', async () => {
      // Arrange
      const app = buildApp();

      // Act
      await request(app)
        .get('/api/v1/recommendations')
        .query({ count: 20, window: 48 });

      // Assert
      expect(mockRecommendationService.getRecommendations).toHaveBeenCalledWith(
        expect.objectContaining({ count: 20, windowHours: 48 })
      );
    });

    it('should return 500 when recommendation service throws', async () => {
      // Arrange
      mockRecommendationService.getRecommendations.mockRejectedValue(
        new Error('Service unavailable')
      );
      const app = buildApp();

      // Act
      const response = await request(app).get('/api/v1/recommendations');

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/recommendations/debug/:releaseId', () => {
    it('should return 200 with breakdown for a valid release', async () => {
      // Arrange
      const app = buildApp();

      // Act
      const response = await request(app).get(
        '/api/v1/recommendations/debug/12345'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.breakdown).toBeDefined();
    });

    it('should return 400 for an invalid release ID', async () => {
      // Arrange
      const app = buildApp();

      // Act
      const response = await request(app).get(
        '/api/v1/recommendations/debug/not-a-number'
      );

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid releaseId');
    });

    it('should return 401 when Last.fm is not authenticated', async () => {
      // Arrange
      mockAuthService.getUserSettings.mockResolvedValue({
        discogs: { username: 'testuser', token: '' },
        lastfm: { username: '', apiKey: '', sessionKey: '' },
        preferences: {
          defaultTimestamp: 'now' as const,
          batchSize: 10,
          autoScrobble: false,
        },
      });
      const app = buildApp();

      // Act
      const response = await request(app).get(
        '/api/v1/recommendations/debug/12345'
      );

      // Assert
      expect(response.status).toBe(401);
    });

    it('should return 404 when no embedding exists for the release', async () => {
      // Arrange
      mockRecommendationService.getDebugBreakdown.mockResolvedValue(null);
      const app = buildApp();

      // Act
      const response = await request(app).get(
        '/api/v1/recommendations/debug/99999'
      );

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.error).toContain('No embedding found');
    });
  });

  describe('POST /api/v1/recommendations/feedback', () => {
    it('should return 200 for a valid played feedback', async () => {
      // Arrange
      const app = buildApp();

      // Act
      const response = await request(app)
        .post('/api/v1/recommendations/feedback')
        .send({ releaseId: 12345, action: 'played' });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockRecommendationService.submitFeedback).toHaveBeenCalledWith(
        12345,
        'played'
      );
    });

    it('should return 200 for skipped feedback', async () => {
      // Arrange
      const app = buildApp();

      // Act
      const response = await request(app)
        .post('/api/v1/recommendations/feedback')
        .send({ releaseId: 12345, action: 'skipped' });

      // Assert
      expect(response.status).toBe(200);
    });

    it('should return 200 for not_interested feedback', async () => {
      // Arrange
      const app = buildApp();

      // Act
      const response = await request(app)
        .post('/api/v1/recommendations/feedback')
        .send({ releaseId: 12345, action: 'not_interested' });

      // Assert
      expect(response.status).toBe(200);
    });

    it('should return 400 when releaseId is not an integer', async () => {
      // Arrange
      const app = buildApp();

      // Act
      const response = await request(app)
        .post('/api/v1/recommendations/feedback')
        .send({ releaseId: 'abc', action: 'played' });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('releaseId must be an integer');
    });

    it('should return 400 when action is invalid', async () => {
      // Arrange
      const app = buildApp();

      // Act
      const response = await request(app)
        .post('/api/v1/recommendations/feedback')
        .send({ releaseId: 12345, action: 'loved' });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('action must be one of');
    });
  });

  describe('GET /api/v1/recommendations/settings', () => {
    it('should return 200 with current settings', async () => {
      // Arrange
      const app = buildApp();

      // Act
      const response = await request(app).get(
        '/api/v1/recommendations/settings'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.defaultCount).toBeDefined();
      expect(response.body.data.weights).toBeDefined();
    });

    it('should return 500 when settings service throws', async () => {
      // Arrange
      mockRecommendationService.getSettings.mockRejectedValue(
        new Error('Storage error')
      );
      const app = buildApp();

      // Act
      const response = await request(app).get(
        '/api/v1/recommendations/settings'
      );

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/v1/recommendations/settings', () => {
    it('should return 200 with updated settings', async () => {
      // Arrange
      const updatedSettings = createMockRecommendationSettings({
        defaultCount: 20,
      });
      mockRecommendationService.getSettings.mockResolvedValue(updatedSettings);
      const app = buildApp();

      // Act
      const response = await request(app)
        .put('/api/v1/recommendations/settings')
        .send({ defaultCount: 20 });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockRecommendationService.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ defaultCount: 20 })
      );
    });

    it('should return 500 when update throws', async () => {
      // Arrange
      mockRecommendationService.updateSettings.mockRejectedValue(
        new Error('Write error')
      );
      const app = buildApp();

      // Act
      const response = await request(app)
        .put('/api/v1/recommendations/settings')
        .send({ defaultCount: 5 });

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });
});
