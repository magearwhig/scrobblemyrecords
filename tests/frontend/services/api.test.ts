import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

import { getApiService } from '../../../src/renderer/services/api';
import { AlbumIdentifier } from '../../../src/shared/types';

describe('ApiService', () => {
  let apiService: ReturnType<typeof getApiService>;
  let mockAxios: MockAdapter;

  beforeEach(() => {
    // Create new service instance and mock its internal axios
    apiService = getApiService('http://localhost:3001');
    // Access the internal axios instance and mock it
    mockAxios = new MockAdapter((apiService as any).api);
  });

  afterEach(() => {
    mockAxios.reset();
    mockAxios.restore();
  });

  describe('getAuthStatus', () => {
    it('should return auth status', async () => {
      const mockAuthStatus = {
        discogs: { authenticated: true, username: 'testuser' },
        lastfm: { authenticated: false },
      };

      mockAxios.onGet('/auth/status').reply(200, {
        success: true,
        data: mockAuthStatus,
      });

      const result = await apiService.getAuthStatus();

      expect(result).toEqual(mockAuthStatus);
    });

    it('should handle error response', async () => {
      mockAxios.onGet('/auth/status').reply(500, {
        success: false,
        error: 'Server error',
      });

      await expect(apiService.getAuthStatus()).rejects.toThrow();
    });
  });

  describe('saveDiscogsToken', () => {
    it('should save token with username', async () => {
      mockAxios.onPost('/auth/discogs/token').reply(200, { success: true });

      await apiService.saveDiscogsToken('test-token', 'testuser');

      expect(mockAxios.history.post.length).toBe(1);
      expect(JSON.parse(mockAxios.history.post[0].data)).toEqual({
        token: 'test-token',
        username: 'testuser',
      });
    });

    it('should save token without username', async () => {
      mockAxios.onPost('/auth/discogs/token').reply(200, { success: true });

      await apiService.saveDiscogsToken('test-token');

      expect(mockAxios.history.post.length).toBe(1);
      const requestData = JSON.parse(mockAxios.history.post[0].data);
      expect(requestData.token).toBe('test-token');
    });
  });

  describe('getAlbumPlayCounts (Feature 8)', () => {
    it('should fetch play counts for multiple albums', async () => {
      const albums: AlbumIdentifier[] = [
        { artist: 'Artist 1', title: 'Album 1' },
        { artist: 'Artist 2', title: 'Album 2' },
      ];

      const mockResponse = {
        results: [
          {
            artist: 'Artist 1',
            title: 'Album 1',
            playCount: 50,
            lastPlayed: 1704067200000,
            matchType: 'exact' as const,
          },
          {
            artist: 'Artist 2',
            title: 'Album 2',
            playCount: 25,
            lastPlayed: 1704153600000,
            matchType: 'fuzzy' as const,
          },
        ],
      };

      mockAxios.onPost('/stats/album-play-counts').reply(200, {
        success: true,
        data: mockResponse,
      });

      const result = await apiService.getAlbumPlayCounts(albums);

      expect(result).toEqual(mockResponse);
      expect(JSON.parse(mockAxios.history.post[0].data)).toEqual({ albums });
    });

    it('should handle empty albums array', async () => {
      const albums: AlbumIdentifier[] = [];

      const mockResponse = { results: [] };

      mockAxios.onPost('/stats/album-play-counts').reply(200, {
        success: true,
        data: mockResponse,
      });

      const result = await apiService.getAlbumPlayCounts(albums);

      expect(result).toEqual(mockResponse);
    });

    it('should handle albums with no play history', async () => {
      const albums: AlbumIdentifier[] = [
        { artist: 'Unknown Artist', title: 'Unknown Album' },
      ];

      const mockResponse = {
        results: [
          {
            artist: 'Unknown Artist',
            title: 'Unknown Album',
            playCount: 0,
            lastPlayed: null,
            matchType: 'none' as const,
          },
        ],
      };

      mockAxios.onPost('/stats/album-play-counts').reply(200, {
        success: true,
        data: mockResponse,
      });

      const result = await apiService.getAlbumPlayCounts(albums);

      expect(result.results[0].playCount).toBe(0);
      expect(result.results[0].lastPlayed).toBeNull();
      expect(result.results[0].matchType).toBe('none');
    });

    it('should handle large album batches', async () => {
      const albums: AlbumIdentifier[] = Array.from({ length: 100 }, (_, i) => ({
        artist: `Artist ${i}`,
        title: `Album ${i}`,
      }));

      const mockResponse = {
        results: albums.map((album, i) => ({
          artist: album.artist,
          title: album.title,
          playCount: i * 10,
          lastPlayed: i > 0 ? Date.now() - i * 86400000 : null,
          matchType: i % 2 === 0 ? ('exact' as const) : ('fuzzy' as const),
        })),
      };

      mockAxios.onPost('/stats/album-play-counts').reply(200, {
        success: true,
        data: mockResponse,
      });

      const result = await apiService.getAlbumPlayCounts(albums);

      expect(result.results.length).toBe(100);
    });

    it('should handle server error', async () => {
      const albums: AlbumIdentifier[] = [{ artist: 'Test', title: 'Test' }];

      mockAxios.onPost('/stats/album-play-counts').reply(503, {
        success: false,
        error: 'Scrobble history not available',
      });

      await expect(apiService.getAlbumPlayCounts(albums)).rejects.toThrow();
    });
  });

  describe('getLastfmAuthUrl', () => {
    it('should get auth URL without API key', async () => {
      mockAxios.onGet('/auth/lastfm/auth-url').reply(200, {
        success: true,
        data: { authUrl: 'http://last.fm/auth' },
      });

      const result = await apiService.getLastfmAuthUrl();

      expect(result).toBe('http://last.fm/auth');
    });

    it('should get auth URL with API key', async () => {
      mockAxios.onGet('/auth/lastfm/auth-url').reply(200, {
        success: true,
        data: { authUrl: 'http://last.fm/auth?api_key=test' },
      });

      const result = await apiService.getLastfmAuthUrl('test-api-key');

      expect(result).toBe('http://last.fm/auth?api_key=test');
    });
  });

  describe('handleLastfmCallback', () => {
    it('should handle Last.fm callback and return username', async () => {
      mockAxios.onPost('/auth/lastfm/callback').reply(200, {
        success: true,
        data: { username: 'lastfmuser' },
      });

      const result = await apiService.handleLastfmCallback('callback-token');

      expect(result).toEqual({ username: 'lastfmuser' });
    });
  });

  describe('testDiscogsConnection', () => {
    it('should test Discogs connection successfully', async () => {
      const mockData = { username: 'testuser', id: 12345 };

      mockAxios.onGet('/auth/discogs/test').reply(200, {
        success: true,
        data: mockData,
      });

      const result = await apiService.testDiscogsConnection();

      expect(result).toEqual(mockData);
    });
  });

  describe('testLastfmConnection', () => {
    it('should test Last.fm connection successfully', async () => {
      const mockData = { username: 'lastfmuser', subscriber: false };

      mockAxios.onGet('/auth/lastfm/test').reply(200, {
        success: true,
        data: mockData,
      });

      const result = await apiService.testLastfmConnection();

      expect(result).toEqual(mockData);
    });
  });

  describe('getLastfmSessionKey', () => {
    it('should get Last.fm session key', async () => {
      const mockData = { sessionKey: 'abc123' };

      mockAxios.onGet('/auth/lastfm/session-key').reply(200, {
        success: true,
        data: mockData,
      });

      const result = await apiService.getLastfmSessionKey();

      expect(result).toEqual(mockData);
    });
  });

  describe('getLastfmRecentScrobbles', () => {
    it('should get recent scrobbles with default limit', async () => {
      const mockScrobbles = [
        { artist: 'Artist 1', track: 'Track 1', timestamp: 1704067200 },
        { artist: 'Artist 2', track: 'Track 2', timestamp: 1704067100 },
      ];

      mockAxios.onGet('/auth/lastfm/recent-scrobbles').reply(200, {
        success: true,
        data: mockScrobbles,
      });

      const result = await apiService.getLastfmRecentScrobbles();

      expect(result).toEqual(mockScrobbles);
    });

    it('should get recent scrobbles with custom limit', async () => {
      const mockScrobbles = [
        { artist: 'Artist 1', track: 'Track 1', timestamp: 1704067200 },
      ];

      mockAxios.onGet('/auth/lastfm/recent-scrobbles').reply(200, {
        success: true,
        data: mockScrobbles,
      });

      const result = await apiService.getLastfmRecentScrobbles(5);

      expect(result).toEqual(mockScrobbles);
      expect(mockAxios.history.get[0].params).toEqual({ limit: 5 });
    });
  });
});
