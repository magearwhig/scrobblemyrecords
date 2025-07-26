import crypto from 'crypto';

import axios from 'axios';

import { AuthService } from '../../src/backend/services/authService';
import { LastFmService } from '../../src/backend/services/lastfmService';
import { FileStorage } from '../../src/backend/utils/fileStorage';
import { ScrobbleTrack } from '../../src/shared/types';

// Mock dependencies
jest.mock('axios');
jest.mock('crypto');
jest.mock('../../src/backend/utils/fileStorage');
jest.mock('../../src/backend/services/authService');

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedCrypto = crypto as jest.Mocked<typeof crypto>;

describe('LastFmService', () => {
  let lastfmService: LastFmService;
  let mockFileStorage: jest.Mocked<FileStorage>;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockAxiosInstance: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    jest.resetModules();

    // Mock FileStorage
    mockFileStorage = new FileStorage('test') as jest.Mocked<FileStorage>;

    // Mock AuthService
    mockAuthService = new AuthService(
      mockFileStorage
    ) as jest.Mocked<AuthService>;

    // Mock axios instance
    mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      interceptors: {
        request: {
          use: jest.fn(),
        },
      },
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance);

    // Mock crypto
    const mockHash = {
      update: jest.fn().mockReturnThis(),
      digest: jest.fn().mockReturnValue('mockedhash'),
    };
    mockedCrypto.createHash.mockReturnValue(mockHash as any);

    // Create service instance
    lastfmService = new LastFmService(mockFileStorage, mockAuthService);
  });

  describe('constructor', () => {
    it('should create axios instance with correct configuration', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'https://ws.audioscrobbler.com/2.0/',
        timeout: 10000,
      });
    });

    it('should set up rate limiting interceptor', () => {
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });
  });

  describe('generateApiSig', () => {
    it('should generate correct API signature', () => {
      const params = {
        method: 'track.scrobble',
        api_key: 'testkey',
        artist: 'Test Artist',
        track: 'Test Track',
        format: 'json',
      };
      const secret = 'testsecret';

      const result = (lastfmService as any).generateApiSig(params, secret);

      expect(mockedCrypto.createHash).toHaveBeenCalledWith('md5');
      expect(result).toBe('mockedhash');
    });

    it('should exclude format from signature calculation', () => {
      const params = {
        method: 'track.scrobble',
        api_key: 'testkey',
        format: 'json',
      };
      const secret = 'testsecret';

      (lastfmService as any).generateApiSig(params, secret);

      const mockHash = mockedCrypto.createHash('md5');
      expect(mockHash.update).toHaveBeenCalledWith(
        expect.not.stringContaining('format')
      );
    });
  });

  describe('getAuthUrl', () => {
    it('should return correct auth URL with API key', async () => {
      mockAuthService.getLastFmCredentials.mockResolvedValue({
        apiKey: 'testkey',
      });

      const result = await lastfmService.getAuthUrl();

      expect(result).toContain('http://www.last.fm/api/auth/');
      expect(result).toContain('api_key=testkey');
      expect(result).toContain('cb=');
    });

    it('should throw error when API key is not configured', async () => {
      mockAuthService.getLastFmCredentials.mockResolvedValue({});

      await expect(lastfmService.getAuthUrl()).rejects.toThrow(
        'Last.fm API key not configured'
      );
    });

    it('should use custom callback URL from environment', async () => {
      const originalEnv = process.env.LASTFM_CALLBACK_URL;
      process.env.LASTFM_CALLBACK_URL = 'https://custom.callback.url';

      mockAuthService.getLastFmCredentials.mockResolvedValue({
        apiKey: 'testkey',
      });

      const result = await lastfmService.getAuthUrl();

      expect(result).toContain(
        encodeURIComponent('https://custom.callback.url')
      );

      // Restore original environment
      process.env.LASTFM_CALLBACK_URL = originalEnv;
    });
  });

  describe('getSession', () => {
    it('should exchange token for session key', async () => {
      const mockResponse = {
        data: {
          session: {
            name: 'testuser',
            key: 'sessionkey',
          },
        },
      };

      mockAuthService.getLastFmCredentials.mockResolvedValue({
        apiKey: 'testkey',
      });

      // Mock environment variable
      const originalSecret = process.env.LASTFM_SECRET;
      process.env.LASTFM_SECRET = 'testsecret';

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await lastfmService.getSession('testtoken');

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('', null, {
        params: expect.objectContaining({
          method: 'auth.getSession',
          api_key: 'testkey',
          token: 'testtoken',
          format: 'json',
        }),
      });

      expect(result).toEqual({
        sessionKey: 'sessionkey',
        username: 'testuser',
      });

      // Restore environment
      process.env.LASTFM_SECRET = originalSecret;
    });

    it('should throw error when credentials are not available', async () => {
      mockAuthService.getLastFmCredentials.mockResolvedValue({});

      await expect(lastfmService.getSession('testtoken')).rejects.toThrow(
        'Last.fm API key not configured'
      );
    });

    it('should handle Last.fm API errors', async () => {
      mockAuthService.getLastFmCredentials.mockResolvedValue({
        apiKey: 'testkey',
      });

      const originalSecret = process.env.LASTFM_SECRET;
      process.env.LASTFM_SECRET = 'testsecret';

      const errorResponse = {
        data: {
          error: 4,
          message: 'Invalid API key',
        },
      };

      mockAxiosInstance.post.mockResolvedValue(errorResponse);

      await expect(lastfmService.getSession('testtoken')).rejects.toThrow(
        'Last.fm API error 4: Invalid API key'
      );

      process.env.LASTFM_SECRET = originalSecret;
    });
  });

  describe('scrobbleTrack', () => {
    const mockTrack = {
      artist: 'Test Artist',
      track: 'Test Track',
      album: 'Test Album',
      timestamp: 1234567890,
      duration: 180,
    };

    beforeEach(() => {
      const originalSecret = process.env.LASTFM_SECRET;
      process.env.LASTFM_SECRET = 'testsecret';
    });

    afterEach(() => {
      delete process.env.LASTFM_SECRET;
    });

    it('should scrobble a track successfully', async () => {
      mockAuthService.getLastFmCredentials.mockResolvedValue({
        apiKey: 'testkey',
        sessionKey: 'testsession',
      });

      const mockResponse = {
        data: {
          scrobbles: {
            '@attr': {
              accepted: 1,
              ignored: 0,
            },
          },
        },
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await lastfmService.scrobbleTrack(mockTrack);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('', null, {
        params: expect.objectContaining({
          method: 'track.scrobble',
          api_key: 'testkey',
          sk: 'testsession',
          'artist[0]': 'Test Artist',
          'track[0]': 'Test Track',
          'album[0]': 'Test Album',
          'timestamp[0]': '1234567890',
          'duration[0]': '180',
          format: 'json',
        }),
      });

      expect(result).toEqual({
        success: true,
        accepted: 1,
        ignored: 0,
        message: 'Successfully scrobbled Test Artist - Test Track',
      });
    });

    it('should handle missing credentials', async () => {
      mockAuthService.getLastFmCredentials.mockResolvedValue({});

      await expect(lastfmService.scrobbleTrack(mockTrack)).rejects.toThrow(
        'Last.fm credentials not configured'
      );
    });

    it('should handle missing secret', async () => {
      delete process.env.LASTFM_SECRET;

      mockAuthService.getLastFmCredentials.mockResolvedValue({
        apiKey: 'testkey',
        sessionKey: 'testsession',
      });

      await expect(lastfmService.scrobbleTrack(mockTrack)).rejects.toThrow(
        'Last.fm API secret not configured'
      );
    });

    it('should handle empty artist or track', async () => {
      mockAuthService.getLastFmCredentials.mockResolvedValue({
        apiKey: 'testkey',
        sessionKey: 'testsession',
      });

      const invalidTrack = { ...mockTrack, artist: '', track: 'Test Track' };

      await expect(lastfmService.scrobbleTrack(invalidTrack)).rejects.toThrow(
        'Artist and track names are required'
      );
    });

    it('should handle ignored scrobbles', async () => {
      mockAuthService.getLastFmCredentials.mockResolvedValue({
        apiKey: 'testkey',
        sessionKey: 'testsession',
      });

      const mockResponse = {
        data: {
          scrobbles: {
            '@attr': {
              accepted: 0,
              ignored: 1,
            },
          },
        },
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await lastfmService.scrobbleTrack(mockTrack);

      expect(result).toEqual({
        success: false,
        accepted: 0,
        ignored: 1,
        message:
          'Scrobble ignored: Test Artist - Test Track (may be duplicate or invalid)',
      });
    });

    it('should handle API errors', async () => {
      mockAuthService.getLastFmCredentials.mockResolvedValue({
        apiKey: 'testkey',
        sessionKey: 'testsession',
      });

      const errorResponse = {
        data: {
          error: 9,
          message: 'Invalid session key',
        },
      };

      mockAxiosInstance.post.mockResolvedValue(errorResponse);

      await expect(lastfmService.scrobbleTrack(mockTrack)).rejects.toThrow(
        'Invalid session key'
      );
    });

    it('should handle tracks without album or duration', async () => {
      mockAuthService.getLastFmCredentials.mockResolvedValue({
        apiKey: 'testkey',
        sessionKey: 'testsession',
      });

      const minimalTrack = {
        artist: 'Test Artist',
        track: 'Test Track',
      };

      const mockResponse = {
        data: {
          scrobbles: {
            '@attr': {
              accepted: 1,
              ignored: 0,
            },
          },
        },
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await lastfmService.scrobbleTrack(minimalTrack);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('', null, {
        params: expect.objectContaining({
          method: 'track.scrobble',
          'artist[0]': 'Test Artist',
          'track[0]': 'Test Track',
        }),
      });

      expect(result.success).toBe(true);
    });
  });

  describe('scrobbleBatch', () => {
    const mockTracks = [
      { artist: 'Artist 1', track: 'Track 1', timestamp: 1234567890 },
      { artist: 'Artist 2', track: 'Track 2', timestamp: 1234567891 },
    ];

    beforeEach(() => {
      process.env.LASTFM_SECRET = 'testsecret';
      mockFileStorage.writeJSON.mockResolvedValue();
      mockAuthService.generateNonce.mockReturnValue('session-123');
    });

    afterEach(() => {
      delete process.env.LASTFM_SECRET;
    });

    it('should scrobble multiple tracks successfully', async () => {
      mockAuthService.getLastFmCredentials.mockResolvedValue({
        apiKey: 'testkey',
        sessionKey: 'testsession',
      });

      const mockResponse = {
        data: {
          scrobbles: {
            '@attr': {
              accepted: 1,
              ignored: 0,
            },
          },
        },
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await lastfmService.scrobbleBatch(mockTracks);

      expect(result).toEqual({
        success: 2,
        failed: 0,
        ignored: 0,
        errors: [],
        sessionId: 'session-123',
      });

      expect(mockFileStorage.writeJSON).toHaveBeenCalledWith(
        'scrobbles/session-session-123.json',
        expect.objectContaining({
          id: 'session-123',
          tracks: mockTracks,
          status: 'completed',
        })
      );
    });

    it('should handle partial failures in batch', async () => {
      mockAuthService.getLastFmCredentials.mockResolvedValue({
        apiKey: 'testkey',
        sessionKey: 'testsession',
      });

      // First track succeeds, second fails
      mockAxiosInstance.post
        .mockResolvedValueOnce({
          data: {
            scrobbles: {
              '@attr': { accepted: 1, ignored: 0 },
            },
          },
        })
        .mockRejectedValueOnce(new Error('Network error'));

      const result = await lastfmService.scrobbleBatch(mockTracks);

      expect(result).toEqual({
        success: 1,
        failed: 1,
        ignored: 0,
        errors: ['Artist 2 - Track 2: Network error'],
        sessionId: 'session-123',
      });
    });

    it('should handle empty batch', async () => {
      const result = await lastfmService.scrobbleBatch([]);

      expect(result).toEqual({
        success: 0,
        failed: 0,
        ignored: 0,
        errors: [],
        sessionId: 'session-123',
      });
    });
  });

  // Note: clearAuth method doesn't exist in current implementation
  // This functionality is handled by AuthService.clearTokens()

  describe('rate limiting', () => {
    it('should apply rate limiting to requests', async () => {
      jest.useFakeTimers();

      const interceptor =
        mockAxiosInstance.interceptors.request.use.mock.calls[0][0];
      const mockConfig = { url: '/test' };

      const promise = interceptor(mockConfig);

      // Fast-forward time
      jest.advanceTimersByTime(1000);

      const result = await promise;

      expect(result).toBe(mockConfig);

      jest.useRealTimers();
    });
  });

  describe('testConnection', () => {
    it('should test connection successfully', async () => {
      mockAuthService.getLastFmCredentials.mockResolvedValue({
        apiKey: 'testkey',
        sessionKey: 'testsession',
      });

      // Set environment variable for test
      const originalSecret = process.env.LASTFM_SECRET;
      process.env.LASTFM_SECRET = 'testsecret';

      const mockResponse = {
        data: {
          user: {
            name: 'testuser',
            playcount: '1000',
          },
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await lastfmService.testConnection();

      expect(result.success).toBe(true);
      expect(result.userInfo).toBeDefined();

      // Restore environment
      process.env.LASTFM_SECRET = originalSecret;
    });

    it('should handle connection test failure', async () => {
      mockAuthService.getLastFmCredentials.mockResolvedValue({
        apiKey: 'testkey',
        sessionKey: 'testsession',
      });

      // Set environment variable for test
      const originalSecret = process.env.LASTFM_SECRET;
      process.env.LASTFM_SECRET = 'testsecret';

      mockAxiosInstance.get.mockRejectedValue(new Error('Network error'));

      const result = await lastfmService.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toContain('Network error');

      // Restore environment
      process.env.LASTFM_SECRET = originalSecret;
    });

    it('should handle missing credentials', async () => {
      mockAuthService.getLastFmCredentials.mockResolvedValue({});

      const result = await lastfmService.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toContain('Last.fm credentials not configured');
    });
  });

  describe('scrobbleTrack edge cases', () => {
    it('should handle tracks with special characters', async () => {
      mockAuthService.getLastFmCredentials.mockResolvedValue({
        apiKey: 'testkey',
        sessionKey: 'testsession',
      });

      // Set environment variable for test
      const originalSecret = process.env.LASTFM_SECRET;
      process.env.LASTFM_SECRET = 'testsecret';

      const specialTrack = {
        artist: 'Artist & Band',
        track: 'Track (Remix)',
        album: 'Album: Special Edition',
      };

      const mockResponse = {
        data: {
          scrobbles: {
            '@attr': { accepted: 1, ignored: 0 },
          },
        },
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await lastfmService.scrobbleTrack(specialTrack);

      expect(result.success).toBe(true);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('', null, {
        params: expect.objectContaining({
          'artist[0]': 'Artist & Band',
          'track[0]': 'Track (Remix)',
          'album[0]': 'Album: Special Edition',
        }),
      });

      // Restore environment
      process.env.LASTFM_SECRET = originalSecret;
    });

    it('should handle very long track names', async () => {
      mockAuthService.getLastFmCredentials.mockResolvedValue({
        apiKey: 'testkey',
        sessionKey: 'testsession',
      });

      // Set environment variable for test
      const originalSecret = process.env.LASTFM_SECRET;
      process.env.LASTFM_SECRET = 'testsecret';

      const longTrack = {
        artist: 'A'.repeat(100),
        track: 'T'.repeat(200),
        album: 'L'.repeat(150),
      };

      const mockResponse = {
        data: {
          scrobbles: {
            '@attr': { accepted: 1, ignored: 0 },
          },
        },
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await lastfmService.scrobbleTrack(longTrack);

      expect(result.success).toBe(true);

      // Restore environment
      process.env.LASTFM_SECRET = originalSecret;
    });

    it('should handle network timeouts', async () => {
      mockAuthService.getLastFmCredentials.mockResolvedValue({
        apiKey: 'testkey',
        sessionKey: 'testsession',
      });

      // Set environment variable for test
      const originalSecret = process.env.LASTFM_SECRET;
      process.env.LASTFM_SECRET = 'testsecret';

      mockAxiosInstance.post.mockRejectedValue(
        new Error('timeout of 10000ms exceeded')
      );

      await expect(
        lastfmService.scrobbleTrack({
          artist: 'Test Artist',
          track: 'Test Track',
        })
      ).rejects.toThrow('timeout of 10000ms exceeded');

      // Restore environment
      process.env.LASTFM_SECRET = originalSecret;
    });

    it('should handle malformed API responses', async () => {
      mockAuthService.getLastFmCredentials.mockResolvedValue({
        apiKey: 'testkey',
        sessionKey: 'testsession',
      });

      // Set environment variable for test
      const originalSecret = process.env.LASTFM_SECRET;
      process.env.LASTFM_SECRET = 'testsecret';

      const malformedResponse = {
        data: {
          scrobbles: null,
        },
      };

      mockAxiosInstance.post.mockResolvedValue(malformedResponse);

      const result = await lastfmService.scrobbleTrack({
        artist: 'Test Artist',
        track: 'Test Track',
      });

      expect(result.success).toBe(false);
      expect(result.accepted).toBe(0);
      expect(result.ignored).toBe(0);

      // Restore environment
      process.env.LASTFM_SECRET = originalSecret;
    });
  });

  describe('scrobbleBatch edge cases', () => {
    it('should handle large batches', async () => {
      mockAuthService.getLastFmCredentials.mockResolvedValue({
        apiKey: 'testkey',
        sessionKey: 'testsession',
      });

      const largeBatch = Array.from({ length: 100 }, (_, i) => ({
        artist: `Artist ${i}`,
        track: `Track ${i}`,
        timestamp: 1234567890 + i,
      }));

      const mockResponse = {
        data: {
          scrobbles: {
            '@attr': { accepted: 1, ignored: 0 },
          },
        },
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await lastfmService.scrobbleBatch(largeBatch);

      expect(result.success).toBe(100);
      expect(result.failed).toBe(0);
    });

    it('should handle batch with all failures', async () => {
      mockAuthService.getLastFmCredentials.mockResolvedValue({
        apiKey: 'testkey',
        sessionKey: 'testsession',
      });

      // Set environment variable for test
      const originalSecret = process.env.LASTFM_SECRET;
      process.env.LASTFM_SECRET = 'testsecret';

      mockAxiosInstance.post.mockRejectedValue(new Error('Network error'));

      const result = await lastfmService.scrobbleBatch([
        { artist: 'Artist 1', track: 'Track 1', timestamp: 1234567890 },
        { artist: 'Artist 2', track: 'Track 2', timestamp: 1234567891 },
      ]);

      expect(result.success).toBe(0);
      expect(result.failed).toBe(2);
      expect(result.errors).toHaveLength(2);

      // Restore environment
      process.env.LASTFM_SECRET = originalSecret;
    });

    it('should handle batch with mixed ignored tracks', async () => {
      mockAuthService.getLastFmCredentials.mockResolvedValue({
        apiKey: 'testkey',
        sessionKey: 'testsession',
      });

      // Set environment variable for test
      const originalSecret = process.env.LASTFM_SECRET;
      process.env.LASTFM_SECRET = 'testsecret';

      mockAxiosInstance.post
        .mockResolvedValueOnce({
          data: {
            scrobbles: { '@attr': { accepted: 1, ignored: 0 } },
          },
        })
        .mockResolvedValueOnce({
          data: {
            scrobbles: { '@attr': { accepted: 0, ignored: 1 } },
          },
        });

      const result = await lastfmService.scrobbleBatch([
        { artist: 'Artist 1', track: 'Track 1', timestamp: 1234567890 },
        { artist: 'Artist 2', track: 'Track 2', timestamp: 1234567891 },
      ]);

      expect(result.success).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.ignored).toBe(1);

      // Restore environment
      process.env.LASTFM_SECRET = originalSecret;
    });
  });

  describe('generateApiSig edge cases', () => {
    it('should handle empty parameters', () => {
      const params = {};
      const secret = 'testsecret';

      const result = (lastfmService as any).generateApiSig(params, secret);

      expect(result).toBe('mockedhash');
      expect(mockedCrypto.createHash).toHaveBeenCalledWith('md5');
    });

    it('should handle parameters with null values', () => {
      const params = {
        method: 'track.scrobble',
        api_key: 'testkey',
        artist: null,
        track: undefined,
        format: 'json',
      };
      const secret = 'testsecret';

      const result = (lastfmService as any).generateApiSig(params, secret);

      expect(result).toBe('mockedhash');
    });

    it('should handle special characters in parameters', () => {
      const params = {
        method: 'track.scrobble',
        api_key: 'test&key',
        artist: 'Artist & Band',
        track: 'Track (Remix)',
        format: 'json',
      };
      const secret = 'test&secret';

      const result = (lastfmService as any).generateApiSig(params, secret);

      expect(result).toBe('mockedhash');
    });
  });

  describe('error handling', () => {
    it('should handle axios errors with response', async () => {
      mockAuthService.getLastFmCredentials.mockResolvedValue({
        apiKey: 'testkey',
        sessionKey: 'testsession',
      });

      // Set environment variable for test
      const originalSecret = process.env.LASTFM_SECRET;
      process.env.LASTFM_SECRET = 'testsecret';

      const axiosError = new Error('Request failed') as any;
      axiosError.response = {
        status: 429,
        data: { error: 'Rate limit exceeded' },
      };

      mockAxiosInstance.post.mockRejectedValue(axiosError);

      await expect(
        lastfmService.scrobbleTrack({
          artist: 'Test Artist',
          track: 'Test Track',
        })
      ).rejects.toThrow('Request failed');

      // Restore environment
      process.env.LASTFM_SECRET = originalSecret;
    });

    it('should handle axios errors without response', async () => {
      mockAuthService.getLastFmCredentials.mockResolvedValue({
        apiKey: 'testkey',
        sessionKey: 'testsession',
      });

      // Set environment variable for test
      const originalSecret = process.env.LASTFM_SECRET;
      process.env.LASTFM_SECRET = 'testsecret';

      const axiosError = new Error('Network error');
      mockAxiosInstance.post.mockRejectedValue(axiosError);

      await expect(
        lastfmService.scrobbleTrack({
          artist: 'Test Artist',
          track: 'Test Track',
        })
      ).rejects.toThrow('Network error');

      // Restore environment
      process.env.LASTFM_SECRET = originalSecret;
    });
  });
});
