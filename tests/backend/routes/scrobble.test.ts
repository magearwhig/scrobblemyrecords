import request from 'supertest';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import createScrobbleRouter from '../../../src/backend/routes/scrobble';
import { LastFmService } from '../../../src/backend/services/lastfmService';
import { AuthService } from '../../../src/backend/services/authService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';

// Mock dependencies
jest.mock('../../../src/backend/services/lastfmService');
jest.mock('../../../src/backend/services/authService');
jest.mock('../../../src/backend/utils/fileStorage');

const MockedLastFmService = LastFmService as jest.MockedClass<typeof LastFmService>;
const MockedAuthService = AuthService as jest.MockedClass<typeof AuthService>;
const MockedFileStorage = FileStorage as jest.MockedClass<typeof FileStorage>;

describe('Scrobble Routes', () => {
  let app: express.Application;
  let mockLastFmService: jest.Mocked<LastFmService>;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockFileStorage: jest.Mocked<FileStorage>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock instances
    mockFileStorage = new MockedFileStorage('test') as jest.Mocked<FileStorage>;
    mockAuthService = new MockedAuthService(mockFileStorage) as jest.Mocked<AuthService>;
    mockLastFmService = new MockedLastFmService(mockFileStorage, mockAuthService) as jest.Mocked<LastFmService>;
    
    // Setup mock methods
    mockLastFmService.getScrobbleHistory = jest.fn();

    // Create Express app with mocked services
    app = express();
    app.use(helmet());
    app.use(cors());
    app.use(express.json());

    // Add the mocked services to app.locals
    app.locals.lastfmService = mockLastFmService;
    app.locals.authService = mockAuthService;

    // Mount scrobble routes
    app.use('/api/v1/scrobble', createScrobbleRouter(mockFileStorage, mockAuthService, mockLastFmService));
  });

  describe('POST /track', () => {
    const mockTrack = {
      artist: 'Test Artist',
      track: 'Test Track',
      album: 'Test Album',
      timestamp: 1234567890
    };

    it('should scrobble a single track successfully', async () => {
      const mockResult = {
        success: true,
        accepted: 1,
        ignored: 0,
        message: 'Successfully scrobbled Test Artist - Test Track'
      };

      mockLastFmService.scrobbleTrack.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/v1/scrobble/track')
        .send(mockTrack)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Track scrobbled successfully');
      expect(mockLastFmService.scrobbleTrack).toHaveBeenCalledWith(mockTrack);
    });

    it('should require artist and track fields', async () => {
      const response = await request(app)
        .post('/api/v1/scrobble/track')
        .send({ artist: 'Test Artist' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Artist and track are required');
    });

    it('should handle scrobbling errors', async () => {
      mockLastFmService.scrobbleTrack.mockRejectedValue(new Error('Scrobble failed'));

      const response = await request(app)
        .post('/api/v1/scrobble/track')
        .send(mockTrack)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Scrobble failed');
    });

    it('should use current timestamp if not provided', async () => {
      const trackWithoutTimestamp = {
        artist: 'Test Artist',
        track: 'Test Track'
      };

      const mockResult = {
        success: true,
        accepted: 1,
        ignored: 0,
        message: 'Successfully scrobbled'
      };

      mockLastFmService.scrobbleTrack.mockResolvedValue(mockResult);

      await request(app)
        .post('/api/v1/scrobble/track')
        .send(trackWithoutTimestamp)
        .expect(200);

      expect(mockLastFmService.scrobbleTrack).toHaveBeenCalledWith(
        expect.objectContaining({
          artist: 'Test Artist',
          track: 'Test Track',
          timestamp: expect.any(Number)
        })
      );
    });
  });

  describe('POST /batch', () => {
    const mockTracks = [
      { artist: 'Artist 1', track: 'Track 1', timestamp: 1234567890 },
      { artist: 'Artist 2', track: 'Track 2', timestamp: 1234567891 }
    ];

    it('should scrobble batch of tracks successfully', async () => {
      const mockResult = {
        success: 2,
        failed: 0,
        ignored: 0,
        errors: [],
        sessionId: 'session-123'
      };

      mockLastFmService.scrobbleBatch.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/v1/scrobble/batch')
        .send({ tracks: mockTracks, baseTimestamp: 1234567890 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.results).toEqual(mockResult);
      expect(mockLastFmService.scrobbleBatch).toHaveBeenCalledWith(mockTracks);
    });

    it('should require tracks array', async () => {
      const response = await request(app)
        .post('/api/v1/scrobble/batch')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Tracks array is required and must not be empty');
    });

    it('should require non-empty tracks array', async () => {
      const response = await request(app)
        .post('/api/v1/scrobble/batch')
        .send({ tracks: [] })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Tracks array is required and must not be empty');
    });

    it('should generate timestamps if not provided', async () => {
      const tracksWithoutTimestamp = [
        { artist: 'Artist 1', track: 'Track 1' },
        { artist: 'Artist 2', track: 'Track 2' }
      ];

      const mockResult = {
        success: 2,
        failed: 0,
        ignored: 0,
        errors: [],
        sessionId: 'session-123'
      };

      mockLastFmService.scrobbleBatch.mockResolvedValue(mockResult);

      await request(app)
        .post('/api/v1/scrobble/batch')
        .send({ tracks: tracksWithoutTimestamp, baseTimestamp: 1234567890 })
        .expect(200);

      expect(mockLastFmService.scrobbleBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            artist: 'Artist 1',
            track: 'Track 1',
            timestamp: expect.any(Number)
          }),
          expect.objectContaining({
            artist: 'Artist 2',
            track: 'Track 2',
            timestamp: expect.any(Number)
          })
        ])
      );
    });

    it('should handle batch scrobbling errors', async () => {
      mockLastFmService.scrobbleBatch.mockRejectedValue(new Error('Batch failed'));

      const response = await request(app)
        .post('/api/v1/scrobble/batch')
        .send({ tracks: mockTracks })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Batch failed');
    });
  });

  describe('GET /progress/:sessionId', () => {
    it('should get scrobble progress', async () => {
      const mockProgress = {
        sessionId: 'session-123',
        status: 'in-progress',
        progress: {
          current: 5,
          total: 10,
          success: 4,
          failed: 1,
          ignored: 0
        }
      };

      mockFileStorage.readJSON.mockResolvedValue(mockProgress);

      const response = await request(app)
        .get('/api/v1/scrobble/progress/session-123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockProgress);
      expect(mockFileStorage.readJSON).toHaveBeenCalledWith('scrobbles/session-session-123.json');
    });

    it('should handle session not found', async () => {
      mockFileStorage.readJSON.mockRejectedValue(new Error('File not found'));

      const response = await request(app)
        .get('/api/v1/scrobble/progress/session-999')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Session not found');
    });

    it('should validate session ID format', async () => {
      const response = await request(app)
        .get('/api/v1/scrobble/progress/')
        .expect(404);
    });
  });

  describe('POST /prepare-from-release', () => {
    const mockRelease = {
      id: 123,
      title: 'Test Album',
      artist: 'Test Artist',
      tracklist: [
        { position: '1', title: 'Track 1', duration: '3:30' },
        { position: '2', title: 'Track 2', duration: '4:00' }
      ],
      format: ['Vinyl'],
      label: ['Test Label'],
      resource_url: 'test-url'
    };

    it('should prepare tracks from release', async () => {
      const expectedResult = {
        tracks: [
          {
            artist: 'Test Artist',
            track: 'Track 1',
            album: 'Test Album',
            timestamp: 1234567890,
            duration: 210
          },
          {
            artist: 'Test Artist',
            track: 'Track 2',
            album: 'Test Album',
            timestamp: 1234568100,
            duration: 240
          }
        ],
        release: mockRelease,
        startTime: 1234567890,
        totalDuration: 450
      };

      const response = await request(app)
        .post('/api/v1/scrobble/prepare-from-release')
        .send({
          release: mockRelease,
          selectedTracks: [0, 1],
          startTime: 1234567890
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.tracks).toHaveLength(2);
      expect(response.body.data.tracks[0]).toMatchObject({
        artist: 'Test Artist',
        track: 'Track 1',
        album: 'Test Album'
      });
    });

    it('should require release data', async () => {
      const response = await request(app)
        .post('/api/v1/scrobble/prepare-from-release')
        .send({ selectedTracks: [0] })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Release with tracklist is required');
    });

    it('should work without selected tracks (uses all tracks)', async () => {
      const response = await request(app)
        .post('/api/v1/scrobble/prepare-from-release')
        .send({ release: mockRelease })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.tracks).toHaveLength(2);
    });

    it('should handle release without tracklist', async () => {
      const releaseWithoutTracks = {
        ...mockRelease,
        tracklist: undefined
      };

      const response = await request(app)
        .post('/api/v1/scrobble/prepare-from-release')
        .send({
          release: releaseWithoutTracks,
          selectedTracks: [0]
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Release with tracklist is required');
    });

    it('should filter out invalid track indices', async () => {
      const response = await request(app)
        .post('/api/v1/scrobble/prepare-from-release')
        .send({
          release: mockRelease,
          selectedTracks: [0, 5] // Index 5 doesn't exist
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.tracks).toHaveLength(1); // Only valid index 0
    });

    it('should use current time if startTime not provided', async () => {
      const response = await request(app)
        .post('/api/v1/scrobble/prepare-from-release')
        .send({
          release: mockRelease,
          selectedTracks: [0]
        })
        .expect(200);

      expect(response.body.data.startTime).toBeGreaterThan(0);
      expect(response.body.data.tracks[0].timestamp).toBeGreaterThan(0);
    });
  });

  describe('GET /history', () => {
    it('should get scrobble history', async () => {
      const mockHistory = [
        {
          id: 'session-1',
          tracks: [{ artist: 'Artist 1', track: 'Track 1' }],
          timestamp: 1234567890,
          status: 'completed' as const
        },
        {
          id: 'session-2',
          tracks: [{ artist: 'Artist 2', track: 'Track 2' }],
          timestamp: 1234567891,
          status: 'failed' as const
        }
      ];

      mockLastFmService.getScrobbleHistory.mockResolvedValue(mockHistory);

      const response = await request(app)
        .get('/api/v1/scrobble/history')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data).toEqual(mockHistory);
    });

    it('should handle empty history', async () => {
      mockLastFmService.getScrobbleHistory.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/v1/scrobble/history')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
    });

    it('should handle file read errors gracefully', async () => {
      mockLastFmService.getScrobbleHistory.mockRejectedValue(new Error('Read error'));

      const response = await request(app)
        .get('/api/v1/scrobble/history')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Read error');
    });
  });
});