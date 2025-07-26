import axios from 'axios';

import { getApiService } from '../../src/renderer/services/api';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('API Service', () => {
  let api: ReturnType<typeof getApiService>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock axios instance
    const mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      delete: jest.fn(),
      defaults: { baseURL: '' },
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);

    api = getApiService('http://localhost:3001');
  });

  describe('Health Check', () => {
    it('should check server health', async () => {
      const mockResponse = {
        data: { status: 'ok', timestamp: '2023-01-01T00:00:00Z' },
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await api.healthCheck();

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'http://localhost:3001/health'
      );
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle health check errors', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network error'));

      await expect(api.healthCheck()).rejects.toThrow('Network error');
    });
  });

  describe('Authentication', () => {
    it('should get auth status', async () => {
      const mockResponse = {
        data: {
          data: {
            discogs: { authenticated: true, username: 'testuser' },
            lastfm: { authenticated: false },
          },
        },
      };

      const mockGet = jest.fn().mockResolvedValue(mockResponse);
      (api as any).api = { get: mockGet };

      const result = await api.getAuthStatus();

      expect(mockGet).toHaveBeenCalledWith('/auth/status');
      expect(result).toEqual(mockResponse.data.data);
    });

    it('should save Discogs token', async () => {
      const mockResponse = { data: { success: true } };
      const mockPost = jest.fn().mockResolvedValue(mockResponse);
      (api as any).api = { post: mockPost };

      await api.saveDiscogsToken('test-token', 'testuser');

      expect(mockPost).toHaveBeenCalledWith('/auth/discogs/token', {
        token: 'test-token',
        username: 'testuser',
      });
    });

    it('should test Discogs connection', async () => {
      const mockResponse = {
        data: { data: { username: 'testuser', id: 123 } },
      };
      const mockGet = jest.fn().mockResolvedValue(mockResponse);
      (api as any).api = { get: mockGet };

      const result = await api.testDiscogsConnection();

      expect(mockGet).toHaveBeenCalledWith('/auth/discogs/test');
      expect(result).toEqual(mockResponse.data.data);
    });

    it('should get Last.fm auth URL', async () => {
      const mockResponse = {
        data: { data: { authUrl: 'https://last.fm/auth' } },
      };
      const mockGet = jest.fn().mockResolvedValue(mockResponse);
      (api as any).api = { get: mockGet };

      const result = await api.getLastfmAuthUrl('test-api-key');

      expect(mockGet).toHaveBeenCalledWith('/auth/lastfm/auth-url', {
        params: { apiKey: 'test-api-key' },
      });
      expect(result).toBe('https://last.fm/auth');
    });

    it('should handle Last.fm callback', async () => {
      const mockResponse = {
        data: { data: { username: 'lastfmuser' } },
      };
      const mockPost = jest.fn().mockResolvedValue(mockResponse);
      (api as any).api = { post: mockPost };

      const result = await api.handleLastfmCallback('test-token');

      expect(mockPost).toHaveBeenCalledWith('/auth/lastfm/callback', {
        token: 'test-token',
      });
      expect(result).toEqual(mockResponse.data.data);
    });

    it('should clear authentication', async () => {
      const mockPost = jest.fn().mockResolvedValue({ data: {} });
      (api as any).api = { post: mockPost };

      await api.clearAuth();

      expect(mockPost).toHaveBeenCalledWith('/auth/clear');
    });
  });

  describe('Collection Methods', () => {
    it('should get user collection', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: [{ id: 1, release: { title: 'Test Album' } }],
          pagination: { page: 1, pages: 10 },
        },
      };
      const mockGet = jest.fn().mockResolvedValue(mockResponse);
      (api as any).api = { get: mockGet };

      const result = await api.getUserCollection('testuser', 2, 25, true);

      expect(mockGet).toHaveBeenCalledWith('/collection/testuser', {
        params: { page: 2, per_page: 25, force_reload: true },
      });
      expect(result).toEqual(mockResponse.data);
    });

    it('should get entire collection', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: [{ id: 1, release: { title: 'Test Album' } }],
          total: 100,
          timestamp: 1234567890,
        },
      };
      const mockGet = jest.fn().mockResolvedValue(mockResponse);
      (api as any).api = { get: mockGet };

      const result = await api.getEntireCollection('testuser', false);

      expect(mockGet).toHaveBeenCalledWith('/collection/testuser/all', {
        params: { force_reload: false },
      });
      expect(result).toEqual(mockResponse.data);
    });

    it('should search collection', async () => {
      const mockResponse = {
        data: { data: [{ id: 1, release: { title: 'Search Result' } }] },
      };
      const mockGet = jest.fn().mockResolvedValue(mockResponse);
      (api as any).api = { get: mockGet };

      const result = await api.searchCollection('testuser', 'test query');

      expect(mockGet).toHaveBeenCalledWith('/collection/testuser/search', {
        params: { q: 'test query' },
      });
      expect(result).toEqual(mockResponse.data.data);
    });

    it('should search collection with pagination', async () => {
      const mockResponse = {
        data: {
          data: [{ id: 1, release: { title: 'Search Result' } }],
          pagination: { page: 1, pages: 5, total: 25, per_page: 5 },
        },
      };
      const mockGet = jest.fn().mockResolvedValue(mockResponse);
      (api as any).api = { get: mockGet };

      const result = await api.searchCollectionPaginated(
        'testuser',
        'test',
        2,
        10
      );

      expect(mockGet).toHaveBeenCalledWith(
        '/collection/testuser/search-paginated',
        {
          params: { q: 'test', page: 2, per_page: 10 },
        }
      );
      expect(result).toEqual({
        items: mockResponse.data.data,
        total: mockResponse.data.pagination.total,
        totalPages: mockResponse.data.pagination.pages,
        page: mockResponse.data.pagination.page,
        perPage: mockResponse.data.pagination.per_page,
      });
    });

    it('should preload collection', async () => {
      const mockPost = jest.fn().mockResolvedValue({ data: {} });
      (api as any).api = { post: mockPost };

      await api.preloadCollection('testuser');

      expect(mockPost).toHaveBeenCalledWith('/collection/testuser/preload');
    });

    it('should get release details', async () => {
      const mockResponse = {
        data: { data: { id: 123, title: 'Test Release' } },
      };
      const mockGet = jest.fn().mockResolvedValue(mockResponse);
      (api as any).api = { get: mockGet };

      const result = await api.getReleaseDetails(123);

      expect(mockGet).toHaveBeenCalledWith('/collection/release/123');
      expect(result).toEqual(mockResponse.data.data);
    });

    it('should get cache progress', async () => {
      const mockResponse = {
        data: { data: { status: 'completed', totalPages: 10 } },
      };
      const mockGet = jest.fn().mockResolvedValue(mockResponse);
      (api as any).api = { get: mockGet };

      const result = await api.getCacheProgress('testuser');

      expect(mockGet).toHaveBeenCalledWith('/collection/testuser/progress');
      expect(result).toEqual(mockResponse.data.data);
    });

    it('should clear collection cache', async () => {
      const mockDelete = jest.fn().mockResolvedValue({ data: {} });
      (api as any).api = { delete: mockDelete };

      await api.clearCollectionCache();

      expect(mockDelete).toHaveBeenCalledWith('/collection/cache');
    });
  });

  describe('Scrobbling Methods', () => {
    it('should scrobble a single track', async () => {
      const track = { artist: 'Test Artist', track: 'Test Track' };
      const mockPost = jest.fn().mockResolvedValue({ data: {} });
      (api as any).api = { post: mockPost };

      await api.scrobbleTrack(track);

      expect(mockPost).toHaveBeenCalledWith('/scrobble/track', track);
    });

    it('should scrobble batch tracks', async () => {
      const tracks = [
        { artist: 'Artist 1', track: 'Track 1' },
        { artist: 'Artist 2', track: 'Track 2' },
      ];
      const mockResponse = {
        data: {
          data: {
            results: {
              success: 2,
              failed: 0,
              ignored: 0,
              errors: [],
              sessionId: 'session-123',
            },
          },
        },
      };
      const mockPost = jest.fn().mockResolvedValue(mockResponse);
      (api as any).api = { post: mockPost };

      const result = await api.scrobbleBatch(tracks, 1234567890);

      expect(mockPost).toHaveBeenCalledWith('/scrobble/batch', {
        tracks,
        baseTimestamp: 1234567890,
      });
      expect(result).toEqual(mockResponse.data.data.results);
    });

    it('should get scrobble progress', async () => {
      const mockResponse = {
        data: {
          data: {
            sessionId: 'session-123',
            status: 'completed',
            progress: {
              current: 10,
              total: 10,
              success: 10,
              failed: 0,
              ignored: 0,
            },
          },
        },
      };
      const mockGet = jest.fn().mockResolvedValue(mockResponse);
      (api as any).api = { get: mockGet };

      const result = await api.getScrobbleProgress('session-123');

      expect(mockGet).toHaveBeenCalledWith('/scrobble/progress/session-123');
      expect(result).toEqual(mockResponse.data.data);
    });

    it('should prepare tracks from release', async () => {
      const release = {
        id: 123,
        title: 'Test Album',
        artist: 'Test Artist',
        format: ['Vinyl'],
        label: ['Test Label'],
        resource_url: 'https://api.discogs.com/releases/123',
        tracklist: [
          { position: '1', title: 'Track 1' },
          { position: '2', title: 'Track 2' },
        ],
      };
      const mockResponse = {
        data: {
          data: {
            tracks: [{ artist: 'Test Artist', track: 'Track 1' }],
            release,
            startTime: 1234567890,
            totalDuration: 300,
          },
        },
      };
      const mockPost = jest.fn().mockResolvedValue(mockResponse);
      (api as any).api = { post: mockPost };

      const result = await api.prepareTracksFromRelease(
        release,
        [0],
        1234567890
      );

      expect(mockPost).toHaveBeenCalledWith('/scrobble/prepare-from-release', {
        release,
        selectedTracks: [0],
        startTime: 1234567890,
      });
      expect(result).toEqual(mockResponse.data.data);
    });

    it('should get scrobble history', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              id: 'session-1',
              tracks: [],
              timestamp: 1234567890,
              status: 'completed',
            },
          ],
        },
      };
      const mockGet = jest.fn().mockResolvedValue(mockResponse);
      (api as any).api = { get: mockGet };

      const result = await api.getScrobbleHistory();

      expect(mockGet).toHaveBeenCalledWith('/scrobble/history');
      expect(result).toEqual(mockResponse.data.data);
    });
  });

  describe('Base URL Management', () => {
    it('should update base URL without errors', () => {
      const newBaseUrl = 'http://localhost:4000';

      // Ensure the API instance has proper defaults before updating
      const mockDefaults = { baseURL: 'http://localhost:3001/api/v1' };
      (api as any).api = {
        ...api,
        defaults: mockDefaults,
      };

      // The base URL should be updated without throwing
      expect(() => api.updateBaseUrl(newBaseUrl)).not.toThrow();

      // Verify the defaults were updated
      expect(mockDefaults.baseURL).toBe(`${newBaseUrl}/api/v1`);
    });
  });
});
