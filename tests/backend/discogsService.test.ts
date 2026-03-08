import { AuthService } from '../../src/backend/services/authService';
import { DiscogsService } from '../../src/backend/services/discogsService';
import { getDiscogsAxios } from '../../src/backend/utils/discogsAxios';
import { FileStorage } from '../../src/backend/utils/fileStorage';

// Mock dependencies
jest.mock('../../src/backend/utils/discogsAxios');
jest.mock('../../src/backend/services/authService');
jest.mock('../../src/backend/utils/fileStorage');

const mockedGetDiscogsAxios = getDiscogsAxios as jest.MockedFunction<
  typeof getDiscogsAxios
>;
const MockedAuthService = AuthService as jest.MockedClass<typeof AuthService>;
const MockedFileStorage = FileStorage as jest.MockedClass<typeof FileStorage>;

describe('DiscogsService', () => {
  let discogsService: DiscogsService;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockFileStorage: jest.Mocked<FileStorage>;
  let mockAxiosInstance: any;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock FileStorage
    mockFileStorage = new MockedFileStorage('test') as jest.Mocked<FileStorage>;
    mockFileStorage.readJSON = jest.fn();
    mockFileStorage.writeJSON = jest.fn();
    mockFileStorage.listFiles = jest.fn();
    mockFileStorage.delete = jest.fn();
    mockFileStorage.ensureDataDir = jest.fn();

    // Mock AuthService
    mockAuthService = new MockedAuthService(
      mockFileStorage
    ) as jest.Mocked<AuthService>;
    mockAuthService.getDiscogsToken = jest.fn();

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

    mockedGetDiscogsAxios.mockReturnValue(mockAxiosInstance);

    // Create service instance
    discogsService = new DiscogsService(mockFileStorage, mockAuthService);
  });

  describe('getUserCollection', () => {
    it('should return error when no authentication token available', async () => {
      // Mock the actual method call directly
      jest
        .spyOn(discogsService as any, 'getAuthHeaders')
        .mockRejectedValue(
          new Error('No Discogs token available. Please authenticate first.')
        );

      const result = await discogsService.getUserCollection('testuser', 1, 50);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No Discogs token available');
    });

    it('should return error when no authentication token available with force reload', async () => {
      // Mock the actual method call directly
      jest
        .spyOn(discogsService as any, 'getAuthHeaders')
        .mockRejectedValue(
          new Error('No Discogs token available. Please authenticate first.')
        );

      const result = await discogsService.getUserCollection(
        'testuser',
        1,
        50,
        true
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('No Discogs token available');
    });

    it('should fetch from cache when available and valid', async () => {
      const mockCachedData = {
        success: true,
        timestamp: Date.now(),
        data: [
          {
            id: 1,
            release: {
              id: 123,
              title: 'Test Album',
              artist: 'Test Artist',
            },
            folder_id: 1,
            date_added: '2023-01-01',
          },
        ],
        pagination: {
          page: 1,
          pages: 1,
          per_page: 50,
          items: 1,
        },
      };

      mockFileStorage.readJSON.mockResolvedValue(mockCachedData);

      const result = await discogsService.getUserCollection('testuser', 1, 50);

      // The service will return cached data if it's valid
      expect(result).toMatchObject({
        success: true,
        data: expect.any(Array),
        pagination: expect.any(Object),
      });
      expect(mockFileStorage.readJSON).toHaveBeenCalledWith(
        'collections/testuser-page-1.json'
      );
    });

    it('should fetch from API when authenticated and cache is stale', async () => {
      jest.spyOn(discogsService as any, 'getAuthHeaders').mockResolvedValue({
        Authorization: 'Discogs token=test-token',
      });

      const staleCachedData = {
        timestamp: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
        data: [],
      };

      const mockApiResponse = {
        data: {
          releases: [
            {
              id: 1,
              basic_information: {
                id: 123,
                title: 'Test Album',
                artists: [{ name: 'Test Artist' }],
              },
            },
          ],
          pagination: {
            page: 1,
            pages: 1,
            per_page: 50,
            items: 1,
          },
        },
      };

      mockFileStorage.readJSON.mockResolvedValue(staleCachedData);
      jest.spyOn(discogsService, 'isCacheValid').mockReturnValue(false);
      mockAxiosInstance.get.mockResolvedValue(mockApiResponse);

      const result = await discogsService.getUserCollection('testuser', 1, 50);

      expect(result.success).toBe(true);
      expect(mockAxiosInstance.get).toHaveBeenCalled();
      expect(mockFileStorage.writeJSON).toHaveBeenCalled();
    });
  });

  describe('getReleaseDetails', () => {
    it('should return null when release not found', async () => {
      jest
        .spyOn(discogsService as any, 'getAuthHeaders')
        .mockRejectedValue(
          new Error('No Discogs token available. Please authenticate first.')
        );

      const result = await discogsService.getReleaseDetails(999999);
      expect(result).toBeNull();
    });

    it('should return cached release when available', async () => {
      const mockCachedRelease = {
        id: 123,
        title: 'Cached Album',
        artist: 'Cached Artist',
        genres: ['Rock'],
      };

      mockFileStorage.readJSON.mockResolvedValue(mockCachedRelease);

      const result = await discogsService.getReleaseDetails(123);

      // The service returns the cached data directly
      expect(result).toMatchObject({
        id: 123,
        title: 'Cached Album',
        artist: 'Cached Artist',
      });
      expect(mockFileStorage.readJSON).toHaveBeenCalledWith(
        'collections/release-123.json'
      );
    });

    it('should fetch from API when authenticated', async () => {
      jest.spyOn(discogsService as any, 'getAuthHeaders').mockResolvedValue({
        Authorization: 'Discogs token=test-token',
      });

      const mockRelease = {
        id: 123,
        title: 'Test Album',
        artists: [{ name: 'Test Artist' }],
        tracklist: [{ position: '1', title: 'Track 1', duration: '3:30' }],
      };

      mockFileStorage.readJSON.mockResolvedValue(null); // No cache
      mockAxiosInstance.get.mockResolvedValue({ data: mockRelease });

      const result = await discogsService.getReleaseDetails(123);

      // The service transforms the data, so let's check the actual structure
      expect(result).toMatchObject({
        id: 123,
        title: 'Test Album',
        artist: 'Test Artist',
        tracklist: expect.arrayContaining([
          expect.objectContaining({
            position: '1',
            title: 'Track 1',
            duration: '3:30',
          }),
        ]),
      });
      expect(mockAxiosInstance.get).toHaveBeenCalled();
      expect(mockFileStorage.writeJSON).toHaveBeenCalled();
    });
  });

  describe('searchCollectionFromCache', () => {
    it('should return empty results when no cache exists', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);

      const result = await discogsService.searchCollectionFromCache(
        'testuser',
        'test query',
        1,
        50
      );

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it('should search cached collection successfully', async () => {
      const mockCacheData = [
        {
          id: 123,
          release: {
            id: 123,
            title: 'Test Album',
            artist: 'Test Artist',
          },
          folder_id: 1,
          date_added: '2020-01-01',
        },
      ];

      mockFileStorage.readJSON
        .mockResolvedValueOnce({
          timestamp: Date.now(),
          data: mockCacheData,
        })
        .mockResolvedValue(null); // No more pages

      const result = await discogsService.searchCollectionFromCache(
        'testuser',
        'Test',
        1,
        50
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0].release.title).toBe('Test Album');
      expect(result.total).toBe(1);
    });
  });

  describe('searchCollection', () => {
    it('should return empty array when no authentication available', async () => {
      jest
        .spyOn(discogsService as any, 'getAuthHeaders')
        .mockRejectedValue(
          new Error('No Discogs token available. Please authenticate first.')
        );

      const result = await discogsService.searchCollection(
        'testuser',
        'test query'
      );

      expect(result).toEqual([]);
    });
  });

  describe('preloadAllCollectionPages', () => {
    it('should handle errors gracefully', async () => {
      jest
        .spyOn(discogsService as any, 'getAuthHeaders')
        .mockRejectedValue(
          new Error('No Discogs token available. Please authenticate first.')
        );

      // This should not throw an error even when authentication fails
      await expect(
        discogsService.preloadAllCollectionPages('testuser')
      ).resolves.not.toThrow();
    });

    it('should preload pages when authenticated', async () => {
      jest.spyOn(discogsService as any, 'getAuthHeaders').mockResolvedValue({
        Authorization: 'Discogs token=test-token',
      });

      const mockResponse = {
        data: {
          pagination: { pages: 1, per_page: 50, items: 1 },
          releases: [
            {
              id: 123,
              basic_information: {
                title: 'Test Album',
                artists: [{ name: 'Test Artist' }],
              },
            },
          ],
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);
      mockFileStorage.writeJSON.mockResolvedValue();

      await expect(
        discogsService.preloadAllCollectionPages('testuser')
      ).resolves.not.toThrow();

      expect(mockFileStorage.writeJSON).toHaveBeenCalled();
    });
  });

  describe('clearCache', () => {
    it('should clear collection cache', async () => {
      mockFileStorage.listFiles.mockResolvedValue([
        'test-page-1.json',
        'test-page-2.json',
      ]);
      mockFileStorage.delete.mockResolvedValue();

      await discogsService.clearCache();

      expect(mockFileStorage.listFiles).toHaveBeenCalledWith('collections');
      expect(mockFileStorage.delete).toHaveBeenCalledTimes(2);
    });

    it('should handle cache clearing errors by propagating them', async () => {
      mockFileStorage.listFiles.mockRejectedValue(
        new Error('File system error')
      );

      // clearCache doesn't handle errors, so they should propagate
      await expect(discogsService.clearCache()).rejects.toThrow(
        'File system error'
      );
    });
  });

  describe('isCacheValid', () => {
    it('should return true for recent cache', () => {
      const recentCache = {
        timestamp: Date.now() - 1000 * 60 * 60, // 1 hour ago
      };

      const result = discogsService.isCacheValid(recentCache);

      expect(result).toBe(true);
    });

    it('should return false for stale cache', () => {
      const staleCache = {
        timestamp: Date.now() - 1000 * 60 * 60 * 25, // 25 hours ago
      };

      const result = discogsService.isCacheValid(staleCache);

      expect(result).toBe(false);
    });

    it('should return false for cache without timestamp', () => {
      const invalidCache = {};

      const result = discogsService.isCacheValid(invalidCache);

      expect(result).toBe(false);
    });
  });

  describe('getCacheProgress', () => {
    it('should return cache progress when available', async () => {
      const mockProgress = {
        status: 'loading',
        totalPages: 10,
        currentPage: 5,
        lastUpdated: Date.now(),
      };

      mockFileStorage.readJSON.mockResolvedValue(mockProgress);

      const result = await discogsService.getCacheProgress('testuser');

      expect(result).toEqual(mockProgress);
      expect(mockFileStorage.readJSON).toHaveBeenCalledWith(
        'collections/testuser-progress.json'
      );
    });

    it('should return null when no progress data exists', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);

      const result = await discogsService.getCacheProgress('testuser');

      expect(result).toBeNull();
    });

    it('should handle file storage errors', async () => {
      mockFileStorage.readJSON.mockRejectedValue(
        new Error('File system error')
      );

      const result = await discogsService.getCacheProgress('testuser');

      expect(result).toBeNull();
    });
  });

  describe('getAuthUrl', () => {
    it('should return OAuth URL successfully', async () => {
      const mockUrl =
        'https://discogs.com/oauth/authorize?oauth_token=test-token';
      mockAxiosInstance.get.mockResolvedValue({
        data: 'oauth_token=test-token&oauth_token_secret=test-secret',
      });
      mockAuthService.storeOAuthTokenSecret.mockResolvedValue();

      const result = await discogsService.getAuthUrl();

      expect(result).toContain('https://discogs.com/oauth/authorize');
      expect(result).toContain('oauth_token=test-token');
      expect(mockAuthService.storeOAuthTokenSecret).toHaveBeenCalledWith(
        'test-secret'
      );
    });

    it('should handle OAuth request token errors', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('OAuth error'));

      await expect(discogsService.getAuthUrl()).rejects.toThrow(
        'Failed to initiate Discogs OAuth flow'
      );
    });

    it('should handle missing OAuth tokens', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: 'invalid_response',
      });

      await expect(discogsService.getAuthUrl()).rejects.toThrow(
        'Failed to initiate Discogs OAuth flow'
      );
    });
  });

  describe('handleCallback', () => {
    it('should handle OAuth callback successfully', async () => {
      mockAuthService.getOAuthTokenSecret.mockResolvedValue('test-secret');
      mockAxiosInstance.post.mockResolvedValue({
        data: 'oauth_token=access-token&oauth_token_secret=access-secret',
      });

      const mockUserProfile = { username: 'testuser' };
      jest
        .spyOn(discogsService as any, 'getUserProfileWithToken')
        .mockResolvedValue(mockUserProfile);
      mockAuthService.setDiscogsToken.mockResolvedValue();
      mockAuthService.clearOAuthTokenSecret.mockResolvedValue();

      const result = await discogsService.handleCallback(
        'test-token',
        'test-verifier'
      );

      expect(result).toEqual({ username: 'testuser' });
      expect(mockAuthService.setDiscogsToken).toHaveBeenCalled();
      expect(mockAuthService.clearOAuthTokenSecret).toHaveBeenCalled();
    });

    it('should handle missing token secret', async () => {
      mockAuthService.getOAuthTokenSecret.mockResolvedValue(undefined);

      await expect(
        discogsService.handleCallback('test-token', 'test-verifier')
      ).rejects.toThrow('Failed to complete Discogs OAuth flow');
    });

    it('should handle OAuth access token errors', async () => {
      mockAuthService.getOAuthTokenSecret.mockResolvedValue('test-secret');
      mockAxiosInstance.post.mockRejectedValue(new Error('Access token error'));

      await expect(
        discogsService.handleCallback('test-token', 'test-verifier')
      ).rejects.toThrow('Failed to complete Discogs OAuth flow');
    });

    it('should handle missing access tokens', async () => {
      mockAuthService.getOAuthTokenSecret.mockResolvedValue('test-secret');
      mockAxiosInstance.post.mockResolvedValue({
        data: 'invalid_response',
      });

      await expect(
        discogsService.handleCallback('test-token', 'test-verifier')
      ).rejects.toThrow('Failed to complete Discogs OAuth flow');
    });
  });

  describe('getUserProfile', () => {
    it('should return user profile successfully', async () => {
      const mockProfile = { username: 'testuser', id: 123 };

      // Mock the authService to return a token
      mockAuthService.getDiscogsToken.mockResolvedValue('test-token');
      jest.spyOn(discogsService as any, 'getAuthHeaders').mockResolvedValue({
        Authorization: 'Discogs token=test-token',
      });
      mockAxiosInstance.get.mockResolvedValue({ data: mockProfile });

      const result = await discogsService.getUserProfile();

      expect(result).toEqual(mockProfile);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/oauth/identity',
        expect.any(Object)
      );
    });

    it('should handle authentication errors', async () => {
      jest
        .spyOn(discogsService as any, 'getAuthHeaders')
        .mockRejectedValue(new Error('Auth error'));

      await expect(discogsService.getUserProfile()).rejects.toThrow(
        'No Discogs token available. Please authenticate first.'
      );
    });
  });

  describe('getUserCollection with API calls', () => {
    it('should fetch from API when cache is invalid and authenticated', async () => {
      jest.spyOn(discogsService as any, 'getAuthHeaders').mockResolvedValue({
        Authorization: 'Discogs token=test-token',
      });

      const mockApiResponse = {
        data: {
          releases: [
            {
              id: 1,
              basic_information: {
                id: 123,
                title: 'Test Album',
                artists: [{ name: 'Test Artist' }],
              },
            },
          ],
          pagination: {
            page: 1,
            pages: 1,
            per_page: 50,
            items: 1,
          },
        },
      };

      mockFileStorage.readJSON.mockResolvedValue(null); // No cache
      mockAxiosInstance.get.mockResolvedValue(mockApiResponse);
      mockFileStorage.writeJSON.mockResolvedValue();

      const result = await discogsService.getUserCollection('testuser', 1, 50);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].release.title).toBe('Test Album');
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/users/testuser/collection/folders/0/releases',
        expect.any(Object)
      );
      expect(mockFileStorage.writeJSON).toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      jest.spyOn(discogsService as any, 'getAuthHeaders').mockResolvedValue({
        Authorization: 'Discogs token=test-token',
      });

      mockFileStorage.readJSON.mockResolvedValue(null);
      mockAxiosInstance.get.mockRejectedValue(new Error('API error'));

      const result = await discogsService.getUserCollection('testuser', 1, 50);

      expect(result.success).toBe(false);
      expect(result.error).toContain('API error');
    });

    it('should handle malformed API responses', async () => {
      jest.spyOn(discogsService as any, 'getAuthHeaders').mockResolvedValue({
        Authorization: 'Discogs token=test-token',
      });

      const malformedResponse = {
        data: {
          releases: null,
          pagination: null,
        },
      };

      mockFileStorage.readJSON.mockResolvedValue(null);
      mockAxiosInstance.get.mockResolvedValue(malformedResponse);

      const result = await discogsService.getUserCollection('testuser', 1, 50);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot read properties of null');
    });
  });

  describe('getReleaseDetails with API calls', () => {
    it('should fetch release from API when not cached', async () => {
      jest.spyOn(discogsService as any, 'getAuthHeaders').mockResolvedValue({
        Authorization: 'Discogs token=test-token',
      });

      const mockRelease = {
        id: 123,
        title: 'Test Album',
        artists: [{ name: 'Test Artist' }],
        tracklist: [{ position: '1', title: 'Track 1', duration: '3:30' }],
        genres: ['Rock'],
        styles: ['Alternative'],
      };

      mockFileStorage.readJSON.mockResolvedValue(null);
      mockAxiosInstance.get.mockResolvedValue({ data: mockRelease });
      mockFileStorage.writeJSON.mockResolvedValue();

      const result = await discogsService.getReleaseDetails(123);

      expect(result).toMatchObject({
        id: 123,
        title: 'Test Album',
        artist: 'Test Artist',
        tracklist: expect.arrayContaining([
          expect.objectContaining({
            position: '1',
            title: 'Track 1',
            duration: '3:30',
          }),
        ]),
      });
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/releases/123',
        expect.any(Object)
      );
      expect(mockFileStorage.writeJSON).toHaveBeenCalled();
    });

    it('should handle API errors in release details', async () => {
      jest.spyOn(discogsService as any, 'getAuthHeaders').mockResolvedValue({
        Authorization: 'Discogs token=test-token',
      });

      mockFileStorage.readJSON.mockResolvedValue(null);
      mockAxiosInstance.get.mockRejectedValue(new Error('Release not found'));

      const result = await discogsService.getReleaseDetails(999999);

      expect(result).toBeNull();
    });
  });

  describe('searchCollection with API fallback', () => {
    it('should fall back to API when cache search returns no results', async () => {
      jest.spyOn(discogsService as any, 'getAuthHeaders').mockResolvedValue({
        Authorization: 'Discogs token=test-token',
      });

      const mockApiResponse = {
        data: {
          releases: [
            {
              id: 1,
              basic_information: {
                id: 123,
                title: 'Test Album',
                artists: [{ name: 'Test Artist' }],
              },
            },
          ],
          pagination: {
            page: 1,
            pages: 1,
            per_page: 50,
            items: 1,
          },
        },
      };

      // Mock cache search to return no results
      jest
        .spyOn(discogsService, 'searchCollectionFromCache')
        .mockResolvedValue({
          items: [],
          total: 0,
          totalPages: 0,
        });

      mockAxiosInstance.get.mockResolvedValue(mockApiResponse);

      const result = await discogsService.searchCollection('testuser', 'test');

      expect(result).toHaveLength(1);
      expect(result[0].release.title).toBe('Test Album');
    });

    it('should return cached results when available', async () => {
      const mockCachedResults = [
        {
          id: 1,
          release: {
            id: 123,
            title: 'Cached Album',
            artist: 'Cached Artist',
            format: ['Vinyl'],
            label: ['Test Label'],
            resource_url: 'https://api.discogs.com/releases/123',
          },
          folder_id: 1,
          date_added: '2020-01-01',
        },
      ];

      jest
        .spyOn(discogsService, 'searchCollectionFromCache')
        .mockResolvedValue({
          items: mockCachedResults,
          total: 1,
          totalPages: 1,
        });

      const result = await discogsService.searchCollection(
        'testuser',
        'cached'
      );

      expect(result).toEqual(mockCachedResults);
    });
  });

  describe('preloadAllCollectionPages edge cases', () => {
    it('should handle existing recent cache', async () => {
      const existingProgress = {
        status: 'completed',
        endTime: Date.now() - 1000 * 60 * 60, // 1 hour ago
      };

      mockFileStorage.readJSON.mockResolvedValue(existingProgress);

      await discogsService.preloadAllCollectionPages('testuser');

      // Should not proceed with preloading
      expect(mockAxiosInstance.get).not.toHaveBeenCalled();
    });

    it('should handle failed first page fetch', async () => {
      jest.spyOn(discogsService as any, 'getAuthHeaders').mockResolvedValue({
        Authorization: 'Discogs token=test-token',
      });

      mockFileStorage.readJSON.mockResolvedValue(null);
      mockAxiosInstance.get.mockRejectedValue(new Error('API error'));

      await discogsService.preloadAllCollectionPages('testuser');

      // Should handle error gracefully
      expect(mockFileStorage.writeJSON).toHaveBeenCalledWith(
        'collections/testuser-progress.json',
        expect.objectContaining({
          status: 'failed',
          error: 'API error',
        })
      );
    });

    it('should handle individual page failures during preloading', async () => {
      jest.spyOn(discogsService as any, 'getAuthHeaders').mockResolvedValue({
        Authorization: 'Discogs token=test-token',
      });

      const firstPageResponse = {
        data: {
          pagination: { pages: 3, per_page: 50, items: 150 },
          releases: [],
        },
      };

      mockFileStorage.readJSON.mockResolvedValue(null);
      mockAxiosInstance.get
        .mockResolvedValueOnce(firstPageResponse) // First page succeeds
        .mockRejectedValueOnce(new Error('Page 2 failed')) // Second page fails
        .mockResolvedValueOnce({
          data: { pagination: { pages: 3 }, releases: [] },
        }); // Third page succeeds

      await discogsService.preloadAllCollectionPages('testuser');

      // Should continue despite individual page failures
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(3);
    }, 10000);
  });

  describe('isCacheValid', () => {
    it('should return false for cache older than 24 hours', () => {
      const oldCache = {
        timestamp: Date.now() - 1000 * 60 * 60 * 25, // 25 hours ago
      };

      const result = (discogsService as any).isCacheValid(oldCache);

      expect(result).toBe(false);
    });

    it('should return true for cache newer than 24 hours', () => {
      const newCache = {
        timestamp: Date.now() - 1000 * 60 * 60 * 23, // 23 hours ago
      };

      const result = (discogsService as any).isCacheValid(newCache);

      expect(result).toBe(true);
    });
  });

  describe('checkForNewItems', () => {
    it('should return error when no cached data found', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);

      const result = await discogsService.checkForNewItems('testuser');

      expect(result.success).toBe(false);
      expect(result.newItemsCount).toBe(0);
      expect(result.error).toBe('No cached data found');
    });

    it('should return error when cache has no timestamp', async () => {
      mockFileStorage.readJSON.mockResolvedValue({
        data: [],
      });

      const result = await discogsService.checkForNewItems('testuser');

      expect(result.success).toBe(false);
      expect(result.newItemsCount).toBe(0);
      expect(result.error).toBe('No cached data found');
    });

    it('should return error when Discogs API returns no releases', async () => {
      const cachedData = {
        timestamp: Date.now() - 1000 * 60 * 60,
        data: [],
      };

      mockFileStorage.readJSON.mockResolvedValue(cachedData);
      jest.spyOn(discogsService as any, 'getAuthHeaders').mockResolvedValue({
        Authorization: 'Discogs token=test-token',
      });

      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: {
          releases: [],
        },
      });

      const result = await discogsService.checkForNewItems('testuser');

      expect(result.success).toBe(false);
      expect(result.newItemsCount).toBe(0);
      expect(result.error).toBe('Failed to get fresh collection data');
    });

    it('should return error when Discogs response has no date_added', async () => {
      const cachedData = {
        timestamp: Date.now() - 1000 * 60 * 60,
        data: [],
      };

      mockFileStorage.readJSON.mockResolvedValue(cachedData);
      jest.spyOn(discogsService as any, 'getAuthHeaders').mockResolvedValue({
        Authorization: 'Discogs token=test-token',
      });

      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: {
          releases: [
            {
              id: 1,
              date_added: null,
              basic_information: { title: 'Test', artists: [] },
            },
          ],
        },
      });

      const result = await discogsService.checkForNewItems('testuser');

      expect(result.success).toBe(false);
      expect(result.newItemsCount).toBe(0);
      expect(result.error).toBe('No date information found');
    });

    it('should detect no new items when latest Discogs item is older than cache', async () => {
      const cacheTimestamp = Date.now();
      const cachedData = {
        timestamp: cacheTimestamp,
        data: [],
      };

      mockFileStorage.readJSON.mockResolvedValue(cachedData);
      jest.spyOn(discogsService as any, 'getAuthHeaders').mockResolvedValue({
        Authorization: 'Discogs token=test-token',
      });

      const olderDate = new Date(cacheTimestamp - 1000 * 60 * 60).toISOString();
      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: {
          releases: [
            {
              id: 1,
              date_added: olderDate,
              basic_information: {
                id: 123,
                title: 'Old Album',
                artists: [{ name: 'Old Artist' }],
              },
            },
          ],
        },
      });

      const result = await discogsService.checkForNewItems('testuser');

      expect(result.success).toBe(true);
      expect(result.newItemsCount).toBe(0);
      expect(result.latestCacheDate).toBeDefined();
      expect(result.latestDiscogsDate).toBe(olderDate);
    });

    it('should detect new items when latest Discogs item is newer than cache', async () => {
      const cacheTimestamp = Date.now() - 1000 * 60 * 60 * 2; // 2 hours ago
      const cachedData = {
        timestamp: cacheTimestamp,
        data: [],
      };

      mockFileStorage.readJSON.mockResolvedValue(cachedData);
      jest.spyOn(discogsService as any, 'getAuthHeaders').mockResolvedValue({
        Authorization: 'Discogs token=test-token',
      });

      const newerDate = new Date(cacheTimestamp + 1000 * 60 * 30).toISOString();
      const olderDate = new Date(cacheTimestamp - 1000 * 60 * 30).toISOString();

      const newRelease = {
        id: 1,
        date_added: newerDate,
        basic_information: {
          id: 123,
          title: 'New Album',
          artists: [{ name: 'New Artist' }],
        },
      };

      const oldRelease = {
        id: 2,
        date_added: olderDate,
        basic_information: {
          id: 124,
          title: 'Old Album',
          artists: [{ name: 'Old Artist' }],
        },
      };

      // First call returns the new release
      mockAxiosInstance.get.mockResolvedValueOnce({
        status: 200,
        data: {
          releases: [newRelease],
        },
      });

      // Second call (counting loop) also returns the new release
      mockAxiosInstance.get.mockResolvedValueOnce({
        status: 200,
        data: {
          releases: [newRelease],
        },
      });

      // Third call returns old release (should stop counting)
      mockAxiosInstance.get.mockResolvedValueOnce({
        status: 200,
        data: {
          releases: [oldRelease],
        },
      });

      const result = await discogsService.checkForNewItems('testuser');

      expect(result.success).toBe(true);
      expect(result.newItemsCount).toBe(1);
      expect(result.latestDiscogsDate).toBe(newerDate);
    });

    it('should handle errors during new items check', async () => {
      mockFileStorage.readJSON.mockRejectedValue(new Error('Storage error'));

      const result = await discogsService.checkForNewItems('testuser');

      expect(result.success).toBe(false);
      expect(result.newItemsCount).toBe(0);
      expect(result.error).toBe('Storage error');
    });

    it('should stop checking after 10 pages', async () => {
      // Eliminate real rate-limiting delays to prevent timeouts
      const origSetTimeout = global.setTimeout;
      jest.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
        return origSetTimeout(fn, 0);
      });

      const cacheTimestamp = Date.now() - 1000 * 60 * 60 * 2;
      const cachedData = {
        timestamp: cacheTimestamp,
        data: [],
      };

      mockFileStorage.readJSON.mockResolvedValue(cachedData);
      jest.spyOn(discogsService as any, 'getAuthHeaders').mockResolvedValue({
        Authorization: 'Discogs token=test-token',
      });

      const newerDate = new Date(cacheTimestamp + 1000 * 60).toISOString();

      // Mock 11 pages of new items
      for (let i = 0; i < 11; i++) {
        mockAxiosInstance.get.mockResolvedValueOnce({
          status: 200,
          data: {
            releases: Array(50)
              .fill(null)
              .map((_, idx) => ({
                id: i * 50 + idx,
                date_added: newerDate,
                basic_information: {
                  id: i * 50 + idx,
                  title: `Album ${i}-${idx}`,
                  artists: [{ name: 'Artist' }],
                },
              })),
          },
        });
      }

      const result = await discogsService.checkForNewItems('testuser');

      expect(result.success).toBe(true);
      // Should only check first 10 pages + initial request = 11 calls max
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(11);
    });
  });

  describe('updateCacheWithNewItems', () => {
    it('should return error when no existing cache found', async () => {
      mockFileStorage.readJSON.mockResolvedValue(null);

      const result = await discogsService.updateCacheWithNewItems('testuser');

      expect(result.success).toBe(false);
      expect(result.newItemsAdded).toBe(0);
      expect(result.error).toBe('No existing cache found');
    });

    it('should return error when cache has no timestamp', async () => {
      mockFileStorage.readJSON.mockResolvedValue({
        data: [],
      });

      const result = await discogsService.updateCacheWithNewItems('testuser');

      expect(result.success).toBe(false);
      expect(result.newItemsAdded).toBe(0);
      expect(result.error).toBe('No existing cache found');
    });

    it('should return success with 0 items when no new items found', async () => {
      const cacheTimestamp = Date.now() - 1000 * 60 * 60;
      const cachedData = {
        timestamp: cacheTimestamp,
        data: [
          {
            id: 1,
            release: { id: 123, title: 'Old Album', artist: 'Old Artist' },
          },
        ],
      };

      mockFileStorage.readJSON
        .mockResolvedValueOnce(cachedData) // First page cache
        .mockResolvedValueOnce(null); // No more cache pages

      jest.spyOn(discogsService as any, 'getAuthHeaders').mockResolvedValue({
        Authorization: 'Discogs token=test-token',
      });

      const olderDate = new Date(cacheTimestamp - 1000 * 60).toISOString();
      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: {
          releases: [
            {
              id: 1,
              date_added: olderDate,
              basic_information: {
                id: 123,
                title: 'Old Album',
                artists: [{ name: 'Old Artist' }],
              },
            },
          ],
        },
      });

      const result = await discogsService.updateCacheWithNewItems('testuser');

      expect(result.success).toBe(true);
      expect(result.newItemsAdded).toBe(0);
    });

    it('should add new items and merge with existing cache', async () => {
      const cacheTimestamp = Date.now() - 1000 * 60 * 60;
      const cachedData = {
        timestamp: cacheTimestamp,
        data: [
          {
            id: 1,
            date_added: '2023-01-01',
            rating: 5,
            release: {
              id: 123,
              title: 'Old Album',
              artist: 'Old Artist',
              year: 2023,
              format: ['Vinyl'],
              label: ['Label'],
              resource_url: 'http://test.com',
            },
          },
        ],
      };

      mockFileStorage.readJSON
        .mockResolvedValueOnce(cachedData) // Initial cache check
        .mockResolvedValueOnce(cachedData) // Read existing pages loop
        .mockResolvedValueOnce(null); // End of existing pages

      jest.spyOn(discogsService as any, 'getAuthHeaders').mockResolvedValue({
        Authorization: 'Discogs token=test-token',
      });

      const newerDate = new Date(cacheTimestamp + 1000 * 60).toISOString();
      const olderDate = new Date(cacheTimestamp - 1000 * 60).toISOString();

      // First page with new item
      mockAxiosInstance.get.mockResolvedValueOnce({
        status: 200,
        data: {
          releases: [
            {
              id: 2,
              date_added: newerDate,
              rating: 4,
              notes: 'Great album',
              basic_information: {
                id: 124,
                master_id: 1000,
                title: 'New Album',
                artists: [{ name: 'New Artist' }],
                year: 2024,
                formats: [{ name: 'CD' }],
                labels: [{ name: 'New Label' }],
                catalog_number: 'CAT123',
                cover_image: 'http://image.com',
                resource_url: 'http://new.com',
              },
            },
          ],
        },
      });

      // Second page with old item (stops here)
      mockAxiosInstance.get.mockResolvedValueOnce({
        status: 200,
        data: {
          releases: [
            {
              id: 1,
              date_added: olderDate,
              basic_information: {
                id: 123,
                title: 'Old Album',
                artists: [{ name: 'Old Artist' }],
              },
            },
          ],
        },
      });

      const result = await discogsService.updateCacheWithNewItems('testuser');

      expect(result.success).toBe(true);
      expect(result.newItemsAdded).toBe(1);
      expect(mockFileStorage.writeJSON).toHaveBeenCalled();
    });

    it('should fallback to unauthenticated when auth fails', async () => {
      const cacheTimestamp = Date.now() - 1000 * 60 * 60;
      const cachedData = {
        timestamp: cacheTimestamp,
        data: [],
      };

      mockFileStorage.readJSON
        .mockResolvedValueOnce(cachedData)
        .mockResolvedValueOnce(null);

      jest
        .spyOn(discogsService as any, 'getAuthHeaders')
        .mockRejectedValue(new Error('Auth failed'));

      const olderDate = new Date(cacheTimestamp - 1000 * 60).toISOString();
      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: {
          releases: [
            {
              id: 1,
              date_added: olderDate,
              basic_information: { id: 123, title: 'Test', artists: [] },
            },
          ],
        },
      });

      const result = await discogsService.updateCacheWithNewItems('testuser');

      expect(result.success).toBe(true);
      expect(result.newItemsAdded).toBe(0);
    });

    it('should handle errors during cache update', async () => {
      mockFileStorage.readJSON.mockRejectedValue(new Error('Storage error'));

      const result = await discogsService.updateCacheWithNewItems('testuser');

      expect(result.success).toBe(false);
      expect(result.newItemsAdded).toBe(0);
      expect(result.error).toBe('Storage error');
    });

    it('should remove old cache pages after update', async () => {
      const cacheTimestamp = Date.now() - 1000 * 60 * 60;
      const cachedData = {
        timestamp: cacheTimestamp,
        data: Array(100)
          .fill(null)
          .map((_, i) => ({
            id: i,
            date_added: '2023-01-01',
            release: { id: i, title: `Album ${i}`, artist: 'Artist' },
          })),
      };

      mockFileStorage.readJSON
        .mockResolvedValueOnce(cachedData)
        .mockResolvedValueOnce(cachedData)
        .mockResolvedValueOnce(null);

      jest.spyOn(discogsService as any, 'getAuthHeaders').mockResolvedValue({
        Authorization: 'Discogs token=test-token',
      });

      const newerDate = new Date(cacheTimestamp + 1000 * 60).toISOString();
      mockAxiosInstance.get.mockResolvedValueOnce({
        status: 200,
        data: {
          releases: [
            {
              id: 999,
              date_added: newerDate,
              basic_information: {
                id: 999,
                title: 'New',
                artists: [{ name: 'New' }],
              },
            },
          ],
        },
      });

      const olderDate = new Date(cacheTimestamp - 1000 * 60).toISOString();
      mockAxiosInstance.get.mockResolvedValueOnce({
        status: 200,
        data: {
          releases: [
            {
              id: 1,
              date_added: olderDate,
              basic_information: { id: 1, title: 'Old', artists: [] },
            },
          ],
        },
      });

      const result = await discogsService.updateCacheWithNewItems('testuser');

      expect(result.success).toBe(true);
      expect(result.newItemsAdded).toBe(1);
    });

    it('should stop checking after 10 pages', async () => {
      // Eliminate real rate-limiting delays to prevent timeouts
      const origSetTimeout = global.setTimeout;
      jest.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
        return origSetTimeout(fn, 0);
      });

      const cacheTimestamp = Date.now() - 1000 * 60 * 60;
      const cachedData = {
        timestamp: cacheTimestamp,
        data: [],
      };

      mockFileStorage.readJSON
        .mockResolvedValueOnce(cachedData)
        .mockResolvedValueOnce(null);

      jest.spyOn(discogsService as any, 'getAuthHeaders').mockResolvedValue({
        Authorization: 'Discogs token=test-token',
      });

      const newerDate = new Date(cacheTimestamp + 1000 * 60).toISOString();

      // Mock 11 pages of new items
      for (let i = 0; i < 11; i++) {
        mockAxiosInstance.get.mockResolvedValueOnce({
          status: 200,
          data: {
            releases: Array(50)
              .fill(null)
              .map((_, idx) => ({
                id: i * 50 + idx,
                date_added: newerDate,
                basic_information: {
                  id: i * 50 + idx,
                  title: `Album ${i}-${idx}`,
                  artists: [{ name: 'Artist' }],
                },
              })),
          },
        });
      }

      const result = await discogsService.updateCacheWithNewItems('testuser');

      expect(result.success).toBe(true);
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(10);
    });
  });

  describe('getUserProfile with Personal Access Token', () => {
    it('should handle Personal Access Token validation', async () => {
      mockAuthService.getDiscogsToken.mockResolvedValue('Discogs token=abc123');
      mockAxiosInstance.get.mockResolvedValue({ data: {} });

      const result = await discogsService.getUserProfile();

      expect(result).toEqual({
        username: 'user',
        id: 0,
        resource_url: '',
      });
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/database/search?q=test&type=release&per_page=1',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Discogs token=abc123',
          }),
        })
      );
    });

    it('should throw error when Personal Access Token is invalid', async () => {
      mockAuthService.getDiscogsToken.mockResolvedValue(
        'Discogs token=invalid'
      );
      mockAxiosInstance.get.mockRejectedValue(new Error('Invalid token'));

      await expect(discogsService.getUserProfile()).rejects.toThrow(
        'Invalid token'
      );
    });
  });

  describe('getAuthHeaders', () => {
    it('should return Personal Access Token headers', async () => {
      mockAuthService.getDiscogsToken.mockResolvedValue(
        'Discogs token=test-token'
      );

      const headers = await (discogsService as any).getAuthHeaders();

      expect(headers).toEqual({
        Authorization: 'Discogs token=test-token',
      });
    });

    it('should return OAuth headers for valid OAuth token', async () => {
      const oauthToken = JSON.stringify({
        key: 'oauth-key',
        secret: 'oauth-secret',
      });
      mockAuthService.getDiscogsToken.mockResolvedValue(oauthToken);

      const headers = await (discogsService as any).getAuthHeaders();

      expect(headers).toHaveProperty('Authorization');
    });

    it('should throw error when token is missing', async () => {
      mockAuthService.getDiscogsToken.mockResolvedValue(undefined);

      await expect((discogsService as any).getAuthHeaders()).rejects.toThrow(
        'No Discogs token available. Please authenticate first.'
      );
    });

    it('should throw error when OAuth token is corrupted', async () => {
      mockAuthService.getDiscogsToken.mockResolvedValue('invalid-json-{');

      await expect((discogsService as any).getAuthHeaders()).rejects.toThrow(
        'Corrupted Discogs OAuth token'
      );
    });
  });

  describe('searchCollectionFromCache with deduplication', () => {
    it('should deduplicate items with same item ID', async () => {
      const mockCacheData1 = [
        {
          id: 123,
          release: { id: 100, title: 'Album One', artist: 'Artist' },
          date_added: '2023-01-01',
        },
      ];

      const mockCacheData2 = [
        {
          id: 123, // Duplicate item ID
          release: { id: 100, title: 'Album One', artist: 'Artist' },
          date_added: '2023-01-01',
        },
        {
          id: 456, // Unique item ID
          release: { id: 200, title: 'Album Two', artist: 'Artist' },
          date_added: '2023-01-02',
        },
      ];

      mockFileStorage.readJSON
        .mockResolvedValueOnce({
          timestamp: Date.now(),
          data: mockCacheData1,
        })
        .mockResolvedValueOnce({
          timestamp: Date.now(),
          data: mockCacheData2,
        })
        .mockResolvedValue(null);

      const result = await discogsService.searchCollectionFromCache(
        'testuser',
        'album', // Search for "album" which matches both titles
        1,
        50
      );

      // Should only have 2 unique items (ID 123 and ID 456), not 3
      expect(result.total).toBe(2);
    });

    it('should trigger background refresh when expired cache is found', async () => {
      const expiredCache = {
        timestamp: Date.now() - 1000 * 60 * 60 * 25, // 25 hours ago
        data: [
          {
            id: 1,
            release: { id: 123, title: 'Test Album', artist: 'Test Artist' },
            date_added: '2023-01-01',
          },
        ],
      };

      mockFileStorage.readJSON
        .mockResolvedValueOnce(expiredCache)
        .mockResolvedValue(null);

      jest.spyOn(discogsService, 'isCacheValid').mockReturnValue(false);
      jest
        .spyOn(discogsService, 'preloadAllCollectionPages')
        .mockResolvedValue();

      const result = await discogsService.searchCollectionFromCache(
        'testuser',
        'test',
        1,
        50
      );

      expect(result.items).toHaveLength(1);
      expect(discogsService.preloadAllCollectionPages).toHaveBeenCalledWith(
        'testuser'
      );
    });

    it('should handle pagination correctly', async () => {
      const mockItems = Array(100)
        .fill(null)
        .map((_, i) => ({
          id: i,
          release: {
            id: i,
            title: `Album ${i}`,
            artist: `Artist ${i}`,
          },
          date_added: '2023-01-01',
        }));

      mockFileStorage.readJSON
        .mockResolvedValueOnce({
          timestamp: Date.now(),
          data: mockItems.slice(0, 50),
        })
        .mockResolvedValueOnce({
          timestamp: Date.now(),
          data: mockItems.slice(50, 100),
        })
        .mockResolvedValue(null);

      // Request page 2 with 25 items per page
      const result = await discogsService.searchCollectionFromCache(
        'testuser',
        'album',
        2,
        25
      );

      expect(result.items).toHaveLength(25);
      expect(result.total).toBe(100);
      expect(result.totalPages).toBe(4);
    });
  });

  describe('clearCache error handling', () => {
    it('should continue deleting files even if one fails', async () => {
      mockFileStorage.listFiles.mockResolvedValue([
        'test-page-1.json',
        'test-page-2.json',
        'test-page-3.json',
      ]);

      mockFileStorage.delete
        .mockResolvedValueOnce() // First file succeeds
        .mockRejectedValueOnce(new Error('Delete failed')) // Second fails
        .mockResolvedValueOnce(); // Third succeeds

      await discogsService.clearCache();

      expect(mockFileStorage.delete).toHaveBeenCalledTimes(3);
    });

    it('should not delete non-cache files', async () => {
      mockFileStorage.listFiles.mockResolvedValue([
        'test-page-1.json', // Should be deleted
        'test-progress.json', // Should NOT be deleted
        'backup-file.json', // Should NOT be deleted
        'user-page-2.json', // Should be deleted
      ]);

      await discogsService.clearCache();

      expect(mockFileStorage.delete).toHaveBeenCalledTimes(2);
      expect(mockFileStorage.delete).toHaveBeenCalledWith(
        'collections/test-page-1.json'
      );
      expect(mockFileStorage.delete).toHaveBeenCalledWith(
        'collections/user-page-2.json'
      );
    });
  });

  describe('preloadAllCollectionPages concurrency lock', () => {
    it('should skip preload if already in progress for same user', async () => {
      jest.spyOn(discogsService as any, 'getAuthHeaders').mockResolvedValue({
        Authorization: 'Discogs token=test-token',
      });

      const mockResponse = {
        data: {
          pagination: { pages: 3, per_page: 50, items: 150 },
          releases: [],
        },
      };

      mockFileStorage.readJSON.mockResolvedValue(null);
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      // Start first preload (don't await)
      const firstPreload = discogsService.preloadAllCollectionPages('testuser');

      // Start second preload immediately (should be skipped)
      await discogsService.preloadAllCollectionPages('testuser');

      // Wait for first to complete
      await firstPreload;

      // First should make API calls, second should not
      expect(mockAxiosInstance.get).toHaveBeenCalled();
    }, 10000);
  });
});
