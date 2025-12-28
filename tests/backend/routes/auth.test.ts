import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import request from 'supertest';

// Mock services before importing the router
const mockAuthService = {
  getUserSettings: jest.fn(),
  setDiscogsToken: jest.fn(),
  getUserProfile: jest.fn(),
  setLastFmCredentials: jest.fn(),
  clearTokens: jest.fn(),
  saveUserSettings: jest.fn(),
};

const mockDiscogsService = {
  getAuthUrl: jest.fn(),
  handleCallback: jest.fn(),
  getUserProfile: jest.fn(),
};

const mockLastFmService = {
  getAuthUrl: jest.fn(),
  getSession: jest.fn(),
  testConnection: jest.fn(),
  getRecentScrobbles: jest.fn(),
  getTopTracks: jest.fn(),
  getTopArtists: jest.fn(),
};

const mockFileStorage = {};

// Mock the modules
jest.mock('../../../src/backend/services/authService', () => ({
  AuthService: jest.fn(() => mockAuthService),
}));

jest.mock('../../../src/backend/services/discogsService', () => ({
  DiscogsService: jest.fn(() => mockDiscogsService),
}));

jest.mock('../../../src/backend/services/lastfmService', () => ({
  LastFmService: jest.fn(() => mockLastFmService),
}));

jest.mock('../../../src/backend/utils/fileStorage', () => ({
  FileStorage: jest.fn(() => mockFileStorage),
}));

// Import the router factory after mocking
import { createAuthRouter } from '../../../src/backend/routes/auth';
import { AuthService } from '../../../src/backend/services/authService';
import { DiscogsService } from '../../../src/backend/services/discogsService';
import { LastFmService } from '../../../src/backend/services/lastfmService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';

describe('Auth Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create Express app
    app = express();
    app.use(helmet());
    app.use(cors());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Create router with mocked services
    const fileStorage = new FileStorage();
    const authService = new AuthService(fileStorage);
    const discogsService = new DiscogsService(fileStorage, authService);
    const lastfmService = new LastFmService(fileStorage, authService);
    const authRouter = createAuthRouter(
      fileStorage,
      authService,
      discogsService,
      lastfmService
    );
    app.use('/api/v1/auth', authRouter);

    // Error handling middleware
    app.use(
      (
        err: Error,
        req: express.Request,
        res: express.Response,
        _next: express.NextFunction
      ) => {
        res.status(500).json({ success: false, error: err.message });
      }
    );
  });

  describe('GET /api/v1/auth/status', () => {
    it('should return authentication status successfully', async () => {
      // Mock successful response
      const mockSettings = {
        discogs: {
          token: 'discogs_token',
          username: 'test_user',
        },
        lastfm: {
          apiKey: 'lastfm_key',
          sessionKey: 'lastfm_session',
          username: 'lastfm_user',
        },
      };

      mockAuthService.getUserSettings = jest
        .fn()
        .mockResolvedValue(mockSettings);

      const response = await request(app)
        .get('/api/v1/auth/status')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          discogs: {
            authenticated: true,
            username: 'test_user',
          },
          lastfm: {
            authenticated: true,
            username: 'lastfm_user',
          },
        },
      });

      expect(mockAuthService.getUserSettings).toHaveBeenCalledTimes(1);
    });

    it('should return unauthenticated status when no tokens', async () => {
      // Mock settings with no tokens
      const mockSettings = {
        discogs: {
          token: null,
          username: null,
        },
        lastfm: {
          apiKey: null,
          sessionKey: null,
          username: null,
        },
      };

      mockAuthService.getUserSettings = jest
        .fn()
        .mockResolvedValue(mockSettings);

      const response = await request(app)
        .get('/api/v1/auth/status')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          discogs: {
            authenticated: false,
            username: null,
          },
          lastfm: {
            authenticated: false,
            username: null,
          },
        },
      });
    });

    it('should handle service errors', async () => {
      mockAuthService.getUserSettings = jest
        .fn()
        .mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/v1/auth/status')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Database error',
      });
    });
  });

  describe('GET /api/v1/auth/discogs/auth-url', () => {
    it('should return Discogs authentication URL', async () => {
      const mockAuthUrl = 'https://discogs.com/oauth/authorize?token=abc123';
      mockDiscogsService.getAuthUrl = jest.fn().mockResolvedValue(mockAuthUrl);

      const response = await request(app)
        .get('/api/v1/auth/discogs/auth-url')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: { authUrl: mockAuthUrl },
      });

      expect(mockDiscogsService.getAuthUrl).toHaveBeenCalledTimes(1);
    });

    it('should handle Discogs service errors', async () => {
      mockDiscogsService.getAuthUrl = jest
        .fn()
        .mockRejectedValue(new Error('Discogs API error'));

      const response = await request(app)
        .get('/api/v1/auth/discogs/auth-url')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Discogs API error',
      });
    });
  });

  describe('GET /api/v1/auth/discogs/callback', () => {
    it('should handle successful Discogs OAuth callback', async () => {
      const mockResult = {
        token: 'oauth_token_123',
        username: 'test_user',
      };

      mockDiscogsService.handleCallback = jest
        .fn()
        .mockResolvedValue(mockResult);

      const response = await request(app)
        .get('/api/v1/auth/discogs/callback')
        .query({ oauth_token: 'temp_token', oauth_verifier: 'verifier_123' })
        .expect(200);

      expect(response.text).toContain('Discogs Authentication Successful!');
      expect(response.text).toContain('discogs_auth_success');

      expect(mockDiscogsService.handleCallback).toHaveBeenCalledWith(
        'temp_token',
        'verifier_123'
      );
    });

    it('should handle missing OAuth parameters', async () => {
      const response = await request(app)
        .get('/api/v1/auth/discogs/callback')
        .expect(400);

      expect(response.text).toContain('Authentication Error');
      expect(response.text).toContain(
        'Missing required OAuth parameters for authentication'
      );
    });

    it('should handle Discogs callback errors', async () => {
      mockDiscogsService.handleCallback = jest
        .fn()
        .mockRejectedValue(new Error('Invalid OAuth token'));

      const response = await request(app)
        .get('/api/v1/auth/discogs/callback')
        .query({ oauth_token: 'invalid_token', oauth_verifier: 'verifier_123' })
        .expect(500);

      expect(response.text).toContain('Authentication Error');
      expect(response.text).toContain('Invalid OAuth token');
    });
  });

  describe('POST /api/v1/auth/discogs/token', () => {
    it('should save Discogs token successfully', async () => {
      mockAuthService.setDiscogsToken = jest.fn().mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/v1/auth/discogs/token')
        .send({ token: 'Discogs token=valid_token_123', username: 'test_user' })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: { message: 'Discogs token saved successfully' },
      });

      expect(mockAuthService.setDiscogsToken).toHaveBeenCalledWith(
        'Discogs token=valid_token_123',
        'test_user'
      );
    });

    it('should handle missing token in request', async () => {
      const response = await request(app)
        .post('/api/v1/auth/discogs/token')
        .send({})
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Token is required',
      });
    });

    it('should handle invalid token format', async () => {
      const response = await request(app)
        .post('/api/v1/auth/discogs/token')
        .send({ token: 'invalid_token_format' })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Invalid token format. Should start with "Discogs token="',
      });
    });

    it('should handle service errors', async () => {
      mockAuthService.setDiscogsToken = jest
        .fn()
        .mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .post('/api/v1/auth/discogs/token')
        .send({ token: 'Discogs token=valid_token_123' })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Service error',
      });
    });
  });

  describe('GET /api/v1/auth/discogs/test', () => {
    it('should test Discogs connection successfully', async () => {
      const mockProfile = {
        username: 'test_user',
        id: 12345,
        resource_url: 'https://api.discogs.com/users/test_user',
      };

      mockDiscogsService.getUserProfile = jest
        .fn()
        .mockResolvedValue(mockProfile);

      const response = await request(app)
        .get('/api/v1/auth/discogs/test')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          username: 'test_user',
          id: 12345,
          resource_url: 'https://api.discogs.com/users/test_user',
        },
      });

      expect(mockDiscogsService.getUserProfile).toHaveBeenCalledTimes(1);
    });

    it('should handle Discogs connection test failures', async () => {
      mockDiscogsService.getUserProfile = jest
        .fn()
        .mockRejectedValue(new Error('Connection failed'));

      const response = await request(app)
        .get('/api/v1/auth/discogs/test')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Connection failed',
      });
    });
  });

  describe('GET /api/v1/auth/lastfm/auth-url', () => {
    it('should return Last.fm authentication URL', async () => {
      const mockAuthUrl =
        'https://www.last.fm/api/auth/?api_key=abc123&token=def456';
      mockLastFmService.getAuthUrl = jest.fn().mockResolvedValue(mockAuthUrl);
      mockAuthService.getUserSettings = jest.fn().mockResolvedValue({
        lastfm: { apiKey: null },
      });
      mockAuthService.saveUserSettings = jest.fn().mockResolvedValue(undefined);

      const response = await request(app)
        .get('/api/v1/auth/lastfm/auth-url')
        .query({ apiKey: 'test_api_key' })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: { authUrl: mockAuthUrl },
      });

      expect(mockLastFmService.getAuthUrl).toHaveBeenCalledTimes(1);
    });

    it('should handle missing API key', async () => {
      // Temporarily clear the environment variable for this test
      const originalApiKey = process.env.LASTFM_API_KEY;
      delete process.env.LASTFM_API_KEY;

      try {
        const response = await request(app)
          .get('/api/v1/auth/lastfm/auth-url')
          .expect(400);

        expect(response.body).toEqual({
          success: false,
          error:
            'API key is required (either provide one or set LASTFM_API_KEY environment variable)',
        });
      } finally {
        // Restore the environment variable
        if (originalApiKey) {
          process.env.LASTFM_API_KEY = originalApiKey;
        }
      }
    });

    it('should handle Last.fm service errors', async () => {
      mockLastFmService.getAuthUrl = jest
        .fn()
        .mockRejectedValue(new Error('Last.fm API error'));
      mockAuthService.getUserSettings = jest.fn().mockResolvedValue({
        lastfm: { apiKey: null },
      });
      mockAuthService.saveUserSettings = jest.fn().mockResolvedValue(undefined);

      const response = await request(app)
        .get('/api/v1/auth/lastfm/auth-url')
        .query({ apiKey: 'test_api_key' })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Last.fm API error',
      });
    });
  });

  describe('GET /api/v1/auth/lastfm/callback', () => {
    it('should handle successful Last.fm callback', async () => {
      const mockSessionData = {
        sessionKey: 'session_abc123',
        username: 'lastfm_user',
      };

      mockLastFmService.getSession = jest
        .fn()
        .mockResolvedValue(mockSessionData);
      mockAuthService.getUserSettings = jest.fn().mockResolvedValue({
        lastfm: { apiKey: 'existing_api_key' },
      });
      mockAuthService.setLastFmCredentials = jest
        .fn()
        .mockResolvedValue(undefined);

      const response = await request(app)
        .get('/api/v1/auth/lastfm/callback')
        .query({ token: 'auth_token_123' })
        .expect(200);

      expect(response.text).toContain('Last.fm Authentication Successful!');

      expect(mockLastFmService.getSession).toHaveBeenCalledWith(
        'auth_token_123'
      );
      expect(mockAuthService.setLastFmCredentials).toHaveBeenCalledWith(
        'existing_api_key',
        'session_abc123',
        'lastfm_user'
      );
    });

    it('should handle missing token parameter', async () => {
      const response = await request(app)
        .get('/api/v1/auth/lastfm/callback')
        .expect(400);

      expect(response.text).toContain(
        'Missing required token parameter for authentication'
      );
    });

    it('should handle Last.fm callback errors', async () => {
      mockLastFmService.getSession = jest
        .fn()
        .mockRejectedValue(new Error('Invalid token'));

      const response = await request(app)
        .get('/api/v1/auth/lastfm/callback')
        .query({ token: 'invalid_token' })
        .expect(500);

      expect(response.text).toContain('Last.fm Authentication Error');
      expect(response.text).toContain('Invalid token');
    });
  });

  describe('POST /api/v1/auth/lastfm/callback', () => {
    it('should handle POST callback with token in body', async () => {
      const mockSessionData = {
        sessionKey: 'session_xyz789',
        username: 'post_user',
      };

      mockLastFmService.getSession = jest
        .fn()
        .mockResolvedValue(mockSessionData);
      mockAuthService.getUserSettings = jest.fn().mockResolvedValue({
        lastfm: { apiKey: 'existing_api_key' },
      });
      mockAuthService.setLastFmCredentials = jest
        .fn()
        .mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/v1/auth/lastfm/callback')
        .send({ token: 'body_token_456' })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          message: 'Last.fm authentication successful',
          username: 'post_user',
        },
      });

      expect(mockLastFmService.getSession).toHaveBeenCalledWith(
        'body_token_456'
      );
      expect(mockAuthService.setLastFmCredentials).toHaveBeenCalledWith(
        'existing_api_key',
        'session_xyz789',
        'post_user'
      );
    });

    it('should handle missing token in POST body', async () => {
      const response = await request(app)
        .post('/api/v1/auth/lastfm/callback')
        .send({})
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'Token is required',
      });
    });
  });

  describe('GET /api/v1/auth/lastfm/test', () => {
    it('should test Last.fm connection successfully', async () => {
      const mockUserInfo = {
        name: 'lastfm_user',
        realname: 'Real Name',
        playcount: '1234',
      };

      mockLastFmService.testConnection = jest.fn().mockResolvedValue({
        success: true,
        message: 'Connection successful',
        userInfo: mockUserInfo,
      });

      const response = await request(app)
        .get('/api/v1/auth/lastfm/test')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          message: 'Connection successful',
          userInfo: mockUserInfo,
        },
      });

      expect(mockLastFmService.testConnection).toHaveBeenCalledTimes(1);
    });

    it('should handle Last.fm connection test failures', async () => {
      mockLastFmService.testConnection = jest
        .fn()
        .mockRejectedValue(new Error('Authentication failed'));

      const response = await request(app)
        .get('/api/v1/auth/lastfm/test')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Authentication failed',
      });
    });
  });

  describe('GET /api/v1/auth/lastfm/recent-scrobbles', () => {
    it('should get recent scrobbles successfully', async () => {
      const mockScrobbles = [
        {
          name: 'Track 1',
          artist: { '#text': 'Artist 1' },
          album: { '#text': 'Album 1' },
          date: { uts: '1234567890' },
        },
        {
          name: 'Track 2',
          artist: { '#text': 'Artist 2' },
          album: { '#text': 'Album 2' },
          date: { uts: '1234567891' },
        },
      ];

      mockLastFmService.getRecentScrobbles = jest
        .fn()
        .mockResolvedValue(mockScrobbles);

      const response = await request(app)
        .get('/api/v1/auth/lastfm/recent-scrobbles')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: mockScrobbles,
      });

      expect(mockLastFmService.getRecentScrobbles).toHaveBeenCalledTimes(1);
    });

    it('should handle service errors when getting scrobbles', async () => {
      mockLastFmService.getRecentScrobbles = jest
        .fn()
        .mockRejectedValue(new Error('API error'));

      const response = await request(app)
        .get('/api/v1/auth/lastfm/recent-scrobbles')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'API error',
      });
    });
  });

  describe('GET /api/v1/auth/lastfm/top-tracks', () => {
    it('should get top tracks successfully', async () => {
      const mockTracks = [
        {
          name: 'Popular Track 1',
          artist: { name: 'Popular Artist 1' },
          playcount: '100',
        },
        {
          name: 'Popular Track 2',
          artist: { name: 'Popular Artist 2' },
          playcount: '95',
        },
      ];

      mockLastFmService.getTopTracks = jest.fn().mockResolvedValue(mockTracks);

      const response = await request(app)
        .get('/api/v1/auth/lastfm/top-tracks')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: mockTracks,
      });

      expect(mockLastFmService.getTopTracks).toHaveBeenCalledTimes(1);
    });

    it('should handle service errors when getting top tracks', async () => {
      mockLastFmService.getTopTracks = jest
        .fn()
        .mockRejectedValue(new Error('Service unavailable'));

      const response = await request(app)
        .get('/api/v1/auth/lastfm/top-tracks')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Service unavailable',
      });
    });
  });

  describe('GET /api/v1/auth/lastfm/top-artists', () => {
    it('should get top artists successfully', async () => {
      const mockArtists = [
        {
          name: 'Top Artist 1',
          playcount: '200',
          url: 'https://last.fm/artist/1',
        },
        {
          name: 'Top Artist 2',
          playcount: '180',
          url: 'https://last.fm/artist/2',
        },
      ];

      mockLastFmService.getTopArtists = jest
        .fn()
        .mockResolvedValue(mockArtists);

      const response = await request(app)
        .get('/api/v1/auth/lastfm/top-artists')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: mockArtists,
      });

      expect(mockLastFmService.getTopArtists).toHaveBeenCalledTimes(1);
    });

    it('should handle service errors when getting top artists', async () => {
      mockLastFmService.getTopArtists = jest
        .fn()
        .mockRejectedValue(new Error('Rate limit exceeded'));

      const response = await request(app)
        .get('/api/v1/auth/lastfm/top-artists')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Rate limit exceeded',
      });
    });
  });

  describe('POST /api/v1/auth/clear', () => {
    it('should clear authentication data successfully', async () => {
      mockAuthService.clearTokens = jest.fn().mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/v1/auth/clear')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: { message: 'All authentication data cleared' },
      });

      expect(mockAuthService.clearTokens).toHaveBeenCalledTimes(1);
    });

    it('should handle errors when clearing authentication', async () => {
      mockAuthService.clearTokens = jest
        .fn()
        .mockRejectedValue(new Error('Failed to clear data'));

      const response = await request(app)
        .post('/api/v1/auth/clear')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to clear data',
      });
    });
  });

  describe('Error handling', () => {
    it('should handle malformed JSON requests', async () => {
      const response = await request(app)
        .post('/api/v1/auth/discogs/token')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });

    it('should handle very large request bodies', async () => {
      const largePayload = { token: `Discogs token=${'a'.repeat(10000)}` };

      const response = await request(app)
        .post('/api/v1/auth/discogs/token')
        .send(largePayload);

      // Large payload might hit body size limits, so we accept various status codes
      expect([200, 400, 413, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toEqual({
          success: true,
          data: { message: 'Discogs token saved successfully' },
        });
      } else {
        expect(response.body.success).toBe(false);
      }
    });
  });
});
