import axios from 'axios';

import { MusicBrainzService } from '../../src/backend/services/musicbrainzService';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock the rate limit delay to make tests faster
jest.mock('../../src/backend/services/musicbrainzService', () => {
  const original = jest.requireActual(
    '../../src/backend/services/musicbrainzService'
  );

  // Return the original module but we'll manipulate the service instance
  return original;
});

describe('MusicBrainzService', () => {
  let service: MusicBrainzService;
  let mockMusicBrainzAxios: jest.Mocked<ReturnType<typeof axios.create>>;
  let mockCoverArtAxios: jest.Mocked<ReturnType<typeof axios.create>>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock axios instances
    mockMusicBrainzAxios = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ReturnType<typeof axios.create>>;

    mockCoverArtAxios = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ReturnType<typeof axios.create>>;

    // Mock axios.create to return our mocked instances
    let createCallCount = 0;
    mockedAxios.create.mockImplementation(() => {
      createCallCount++;
      // First call is MusicBrainz, second is Cover Art Archive
      return createCallCount === 1 ? mockMusicBrainzAxios : mockCoverArtAxios;
    });

    mockedAxios.isAxiosError.mockImplementation(
      (error): error is import('axios').AxiosError => {
        return error && typeof error === 'object' && 'isAxiosError' in error;
      }
    );

    service = new MusicBrainzService();

    // Reset the internal timestamp to avoid rate limiting in tests
    // Access private field for testing purposes
    (service as unknown as { lastRequestTime: number }).lastRequestTime = 0;
    (
      service as unknown as { lastCoverArtRequestTime: number }
    ).lastCoverArtRequestTime = 0;
  });

  describe('searchArtist', () => {
    it('should search for artists and return mapped results', async () => {
      // Arrange
      mockMusicBrainzAxios.get.mockResolvedValue({
        data: {
          artists: [
            {
              id: 'mbid-1',
              name: 'Radiohead',
              disambiguation: 'UK rock band',
              country: 'GB',
              'life-span': {
                begin: '1985',
                end: undefined,
                ended: false,
              },
              score: 100,
            },
            {
              id: 'mbid-2',
              name: 'Radiohead Tribute',
              score: 75,
            },
          ],
        },
      });

      // Act
      const results = await service.searchArtist('Radiohead', 10);

      // Assert
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        mbid: 'mbid-1',
        name: 'Radiohead',
        disambiguation: 'UK rock band',
        country: 'GB',
        beginYear: 1985,
        endYear: undefined,
        score: 100,
      });
      expect(results[1]).toEqual({
        mbid: 'mbid-2',
        name: 'Radiohead Tribute',
        disambiguation: undefined,
        country: undefined,
        beginYear: undefined,
        endYear: undefined,
        score: 75,
      });
    });

    it('should handle empty search results', async () => {
      // Arrange
      mockMusicBrainzAxios.get.mockResolvedValue({
        data: { artists: [] },
      });

      // Act
      const results = await service.searchArtist('Unknown Artist');

      // Assert
      expect(results).toHaveLength(0);
    });

    it('should handle missing artists array', async () => {
      // Arrange
      mockMusicBrainzAxios.get.mockResolvedValue({
        data: {},
      });

      // Act
      const results = await service.searchArtist('Test');

      // Assert
      expect(results).toHaveLength(0);
    });

    it('should parse life-span years correctly', async () => {
      // Arrange
      mockMusicBrainzAxios.get.mockResolvedValue({
        data: {
          artists: [
            {
              id: 'mbid-beatles',
              name: 'The Beatles',
              'life-span': {
                begin: '1960-08-00',
                end: '1970-04-10',
                ended: true,
              },
              score: 100,
            },
          ],
        },
      });

      // Act
      const results = await service.searchArtist('The Beatles');

      // Assert
      expect(results[0].beginYear).toBe(1960);
      expect(results[0].endYear).toBe(1970);
    });

    it('should use correct API parameters', async () => {
      // Arrange
      mockMusicBrainzAxios.get.mockResolvedValue({
        data: { artists: [] },
      });

      // Act
      await service.searchArtist('Test Artist', 5);

      // Assert
      expect(mockMusicBrainzAxios.get).toHaveBeenCalledWith('/artist', {
        params: {
          query: 'artist:"Test Artist"',
          limit: 5,
          fmt: 'json',
        },
      });
    });

    it('should use default limit of 10', async () => {
      // Arrange
      mockMusicBrainzAxios.get.mockResolvedValue({
        data: { artists: [] },
      });

      // Act
      await service.searchArtist('Test Artist');

      // Assert
      expect(mockMusicBrainzAxios.get).toHaveBeenCalledWith('/artist', {
        params: expect.objectContaining({
          limit: 10,
        }),
      });
    });
  });

  describe('getArtistReleases', () => {
    it('should fetch release groups for an artist', async () => {
      // Arrange
      mockMusicBrainzAxios.get.mockResolvedValue({
        data: {
          'release-groups': [
            {
              id: 'rg-1',
              title: 'OK Computer',
              'primary-type': 'Album',
              'first-release-date': '1997-05-21',
              'artist-credit': [
                {
                  artist: {
                    id: 'artist-mbid',
                    name: 'Radiohead',
                  },
                },
              ],
            },
            {
              id: 'rg-2',
              title: 'Kid A',
              'primary-type': 'Album',
              'first-release-date': '2000-10-02',
            },
          ],
          count: 2,
        },
      });

      // Act
      const releases = await service.getArtistReleases('artist-mbid');

      // Assert
      expect(releases).toHaveLength(2);
      expect(releases[0]).toMatchObject({
        mbid: 'rg-1',
        title: 'OK Computer',
        artistName: 'Radiohead',
        releaseType: 'album',
        releaseDate: '1997-05-21',
      });
    });

    it('should handle type filtering', async () => {
      // Arrange
      mockMusicBrainzAxios.get.mockResolvedValue({
        data: {
          'release-groups': [],
          count: 0,
        },
      });

      // Act
      await service.getArtistReleases('artist-mbid', ['album', 'ep']);

      // Assert
      expect(mockMusicBrainzAxios.get).toHaveBeenCalledWith('/release-group', {
        params: expect.objectContaining({
          query: expect.stringContaining('type:album OR type:ep'),
        }),
      });
    });

    it('should map release types correctly', async () => {
      // Arrange
      mockMusicBrainzAxios.get.mockResolvedValue({
        data: {
          'release-groups': [
            { id: '1', title: 'Album', 'primary-type': 'Album' },
            { id: '2', title: 'EP', 'primary-type': 'EP' },
            { id: '3', title: 'Single', 'primary-type': 'Single' },
            {
              id: '4',
              title: 'Compilation',
              'primary-type': 'Album',
              'secondary-types': ['Compilation'],
            },
            { id: '5', title: 'Other', 'primary-type': 'Broadcast' },
          ],
          count: 5,
        },
      });

      // Act
      const releases = await service.getArtistReleases('artist-mbid');

      // Assert
      expect(releases[0].releaseType).toBe('album');
      expect(releases[1].releaseType).toBe('ep');
      expect(releases[2].releaseType).toBe('single');
      expect(releases[3].releaseType).toBe('compilation');
      expect(releases[4].releaseType).toBe('other');
    });

    it('should handle missing artist credit', async () => {
      // Arrange
      mockMusicBrainzAxios.get.mockResolvedValue({
        data: {
          'release-groups': [
            {
              id: 'rg-1',
              title: 'Mystery Album',
              'primary-type': 'Album',
            },
          ],
          count: 1,
        },
      });

      // Act
      const releases = await service.getArtistReleases('artist-mbid');

      // Assert
      expect(releases[0].artistName).toBe('Unknown Artist');
      expect(releases[0].artistMbid).toBe('artist-mbid');
    });

    it('should handle empty release groups', async () => {
      // Arrange
      mockMusicBrainzAxios.get.mockResolvedValue({
        data: {
          'release-groups': [],
          count: 0,
        },
      });

      // Act
      const releases = await service.getArtistReleases('artist-mbid');

      // Assert
      expect(releases).toHaveLength(0);
    });

    it('should handle missing release groups array', async () => {
      // Arrange
      mockMusicBrainzAxios.get.mockResolvedValue({
        data: {},
      });

      // Act
      const releases = await service.getArtistReleases('artist-mbid');

      // Assert
      expect(releases).toHaveLength(0);
    });

    it('should handle missing release date', async () => {
      // Arrange
      mockMusicBrainzAxios.get.mockResolvedValue({
        data: {
          'release-groups': [
            {
              id: 'rg-1',
              title: 'Untitled Album',
              'primary-type': 'Album',
            },
          ],
          count: 1,
        },
      });

      // Act
      const releases = await service.getArtistReleases('artist-mbid');

      // Assert
      expect(releases[0].releaseDate).toBeNull();
    });
  });

  describe('getRecentAndUpcomingReleases', () => {
    it('should fetch releases from the past N months', async () => {
      // Arrange
      mockMusicBrainzAxios.get.mockResolvedValue({
        data: {
          'release-groups': [
            {
              id: 'rg-new',
              title: 'New Album',
              'primary-type': 'Album',
              'first-release-date': '2024-01-15',
            },
          ],
        },
      });

      // Act
      const releases = await service.getRecentAndUpcomingReleases(
        'artist-mbid',
        6
      );

      // Assert
      expect(releases).toHaveLength(1);
      expect(mockMusicBrainzAxios.get).toHaveBeenCalledWith('/release-group', {
        params: expect.objectContaining({
          query: expect.stringMatching(/arid:artist-mbid AND firstreleasedate/),
          limit: 100,
          fmt: 'json',
        }),
      });
    });

    it('should use default of 3 months back', async () => {
      // Arrange
      mockMusicBrainzAxios.get.mockResolvedValue({
        data: { 'release-groups': [] },
      });

      // Act
      await service.getRecentAndUpcomingReleases('artist-mbid');

      // Assert
      expect(mockMusicBrainzAxios.get).toHaveBeenCalledWith('/release-group', {
        params: expect.objectContaining({
          query: expect.stringMatching(/firstreleasedate:\[.*TO \*\]/),
        }),
      });
    });
  });

  describe('getRecentReleases (reissue detection)', () => {
    it('should query /release endpoint with arid + date + status filters', async () => {
      mockMusicBrainzAxios.get.mockResolvedValue({
        data: { releases: [], count: 0 },
      });

      await service.getRecentReleases('artist-mbid', 12);

      expect(mockMusicBrainzAxios.get).toHaveBeenCalledWith('/release', {
        params: expect.objectContaining({
          query: expect.stringMatching(
            /^arid:artist-mbid AND date:\[\d{4}-\d{2} TO \*\] AND status:official$/
          ),
          limit: 100,
          offset: 0,
          fmt: 'json',
        }),
      });
    });

    it('should default to 12 months back', async () => {
      mockMusicBrainzAxios.get.mockResolvedValue({
        data: { releases: [], count: 0 },
      });

      await service.getRecentReleases('artist-mbid');

      const call = mockMusicBrainzAxios.get.mock.calls[0];
      const query = (call[1] as { params: { query: string } }).params.query;
      // 12 months back from "now" → year-1 should be in the query
      const expectedYear = new Date().getUTCFullYear() - 1;
      expect(query).toContain(`date:[${expectedYear}`);
    });

    it('should map release entries with release-group + artist credit + label info', async () => {
      mockMusicBrainzAxios.get.mockImplementation((url: string) => {
        if (url === '/release') {
          return Promise.resolve({
            data: {
              releases: [
                {
                  id: 'release-1',
                  title: 'Reissue Album',
                  date: '2026-01-15',
                  country: 'US',
                  status: 'Official',
                  'artist-credit': [
                    { artist: { id: 'artist-1', name: 'Artist Name' } },
                  ],
                  'release-group': {
                    id: 'rg-1',
                    title: 'Reissue Album',
                    'primary-type': 'Album',
                    'secondary-types': [],
                  },
                  'label-info': [
                    { label: { id: 'l1', name: 'Indie Label' } },
                    { label: { name: 'Distributor' } },
                  ],
                },
              ],
              count: 1,
            },
          });
        }
        if (url === '/release-group/rg-1') {
          return Promise.resolve({
            data: { id: 'rg-1', 'first-release-date': '2003-06-01' },
          });
        }
        return Promise.reject(new Error(`unmocked URL: ${url}`));
      });

      const releases = await service.getRecentReleases('artist-1', 12);

      expect(releases).toHaveLength(1);
      expect(releases[0]).toEqual({
        mbid: 'release-1',
        title: 'Reissue Album',
        date: '2026-01-15',
        country: 'US',
        status: 'Official',
        releaseGroupMbid: 'rg-1',
        releaseGroupTitle: 'Reissue Album',
        releaseGroupPrimaryType: 'Album',
        releaseGroupSecondaryTypes: [],
        releaseType: 'album',
        artistName: 'Artist Name',
        artistMbid: 'artist-1',
        labelName: 'Indie Label',
        originalReleaseDate: '2003-06-01',
      });
    });

    it('should skip releases missing a release-group reference', async () => {
      mockMusicBrainzAxios.get.mockResolvedValue({
        data: {
          releases: [
            {
              id: 'release-1',
              title: 'Orphan',
              date: '2026-01-15',
              'artist-credit': [{ artist: { id: 'artist-1', name: 'Artist' } }],
              // No release-group
            },
            {
              id: 'release-2',
              title: 'Good',
              'release-group': { id: 'rg-2' },
              'artist-credit': [{ artist: { id: 'artist-1', name: 'Artist' } }],
            },
          ],
          count: 2,
        },
      });

      const releases = await service.getRecentReleases('artist-1', 12);

      expect(releases).toHaveLength(1);
      expect(releases[0].mbid).toBe('release-2');
    });

    it('should fall back gracefully when label-info is empty or missing names', async () => {
      mockMusicBrainzAxios.get.mockResolvedValue({
        data: {
          releases: [
            {
              id: 'r1',
              title: 'No Label',
              'release-group': { id: 'rg-1' },
              'artist-credit': [{ artist: { id: 'a1', name: 'Artist' } }],
              'label-info': [{ label: {} }, { label: { name: '' } }],
            },
          ],
          count: 1,
        },
      });

      const releases = await service.getRecentReleases('a1', 12);

      expect(releases).toHaveLength(1);
      expect(releases[0].labelName).toBeUndefined();
    });

    it('should page through results up to a 500-release cap', async () => {
      // All releases share a single release-group so enrichment is a single
      // rate-limited lookup, not 500 — keeps the test bounded while still
      // exercising the 5-page search cap.
      const makeReleases = (start: number, n: number) =>
        Array.from({ length: n }, (_, i) => ({
          id: `r-${start + i}`,
          title: `Release ${start + i}`,
          'release-group': { id: 'rg-shared' },
          'artist-credit': [{ artist: { id: 'a1', name: 'Artist' } }],
        }));

      // Simulate 600 total — service should stop at 500
      mockMusicBrainzAxios.get.mockImplementation((url: string, config) => {
        if (url === '/release') {
          const offset =
            (config as { params?: { offset?: number } }).params?.offset || 0;
          return Promise.resolve({
            data: {
              releases: makeReleases(offset, 100),
              count: 600,
            },
          });
        }
        // Enrichment lookup — return nothing useful, just resolve
        return Promise.resolve({ data: { 'first-release-date': null } });
      });

      const releases = await service.getRecentReleases('a1', 12);

      // Cap at 500 — five pages of 100
      expect(releases).toHaveLength(500);
      const searchCalls = mockMusicBrainzAxios.get.mock.calls.filter(
        c => c[0] === '/release'
      );
      expect(searchCalls).toHaveLength(5);
      const offsets = searchCalls.map(
        c => (c[1] as { params: { offset: number } }).params.offset
      );
      expect(offsets).toEqual([0, 100, 200, 300, 400]);
    }, 10000);

    it('should stop paging when results exhausted (count satisfied)', async () => {
      let searchCallCount = 0;
      mockMusicBrainzAxios.get.mockImplementation((url: string) => {
        if (url === '/release') {
          searchCallCount++;
          return Promise.resolve({
            data: {
              releases:
                searchCallCount === 1
                  ? [
                      {
                        id: 'r1',
                        title: 'Only',
                        'release-group': { id: 'rg-1' },
                        'artist-credit': [
                          { artist: { id: 'a1', name: 'Artist' } },
                        ],
                      },
                    ]
                  : [],
              count: 1,
            },
          });
        }
        return Promise.resolve({
          data: { 'first-release-date': '1999-01-01' },
        });
      });

      const releases = await service.getRecentReleases('a1', 12);

      expect(releases).toHaveLength(1);
      // Only one search call needed since offset(100) > count(1)
      expect(searchCallCount).toBe(1);
    });

    it('should retry on rate limit errors via executeWithBackoff', async () => {
      jest.useFakeTimers();
      try {
        const rateLimitError = Object.assign(new Error('Rate limited'), {
          isAxiosError: true,
          response: { status: 429 },
        });
        mockMusicBrainzAxios.get
          .mockRejectedValueOnce(rateLimitError)
          .mockResolvedValueOnce({
            data: {
              releases: [
                {
                  id: 'r1',
                  title: 'After retry',
                  'release-group': { id: 'rg-1' },
                  'artist-credit': [{ artist: { id: 'a1', name: 'Artist' } }],
                },
              ],
              count: 1,
            },
          })
          // Enrichment lookup for rg-1
          .mockResolvedValueOnce({
            data: { 'first-release-date': '1985-04-12' },
          });

        const promise = service.getRecentReleases('a1', 12);
        // Drain backoff timer
        await jest.runAllTimersAsync();
        const releases = await promise;

        expect(releases).toHaveLength(1);
        // 1 failed search + 1 retried search + 1 enrichment lookup = 3
        expect(mockMusicBrainzAxios.get).toHaveBeenCalledTimes(3);
        expect(releases[0].originalReleaseDate).toBe('1985-04-12');
      } finally {
        jest.useRealTimers();
      }
    });

    it('should use status:official to exclude promo / bootleg pressings', async () => {
      mockMusicBrainzAxios.get.mockResolvedValue({
        data: { releases: [], count: 0 },
      });

      await service.getRecentReleases('a1', 6);

      const call = mockMusicBrainzAxios.get.mock.calls[0];
      const query = (call[1] as { params: { query: string } }).params.query;
      expect(query).toContain('status:official');
    });

    it('should propagate non-rate-limit errors', async () => {
      mockMusicBrainzAxios.get.mockRejectedValue(new Error('Bad gateway'));

      await expect(service.getRecentReleases('a1', 12)).rejects.toThrow(
        'Bad gateway'
      );
    });
  });

  describe('getCoverArtUrl', () => {
    it('should return front cover URL when available', async () => {
      // Arrange
      mockCoverArtAxios.get.mockResolvedValue({
        data: {
          images: [
            {
              front: true,
              image: 'https://coverartarchive.org/release-group/xyz/front.jpg',
              thumbnails: {
                small:
                  'https://coverartarchive.org/release-group/xyz/small.jpg',
                '250': 'https://coverartarchive.org/release-group/xyz/250.jpg',
              },
            },
          ],
        },
      });

      // Act
      const url = await service.getCoverArtUrl('release-group-mbid');

      // Assert
      expect(url).toBe(
        'https://coverartarchive.org/release-group/xyz/small.jpg'
      );
    });

    it('should prefer small thumbnail, then 250, then full image', async () => {
      // Arrange - no small thumbnail
      mockCoverArtAxios.get.mockResolvedValue({
        data: {
          images: [
            {
              front: true,
              image: 'https://coverartarchive.org/full.jpg',
              thumbnails: {
                '250': 'https://coverartarchive.org/250.jpg',
              },
            },
          ],
        },
      });

      // Act
      const url = await service.getCoverArtUrl('mbid');

      // Assert
      expect(url).toBe('https://coverartarchive.org/250.jpg');
    });

    it('should fall back to full image if no thumbnails', async () => {
      // Arrange
      mockCoverArtAxios.get.mockResolvedValue({
        data: {
          images: [
            {
              front: true,
              image: 'https://coverartarchive.org/full.jpg',
              thumbnails: {},
            },
          ],
        },
      });

      // Act
      const url = await service.getCoverArtUrl('mbid');

      // Assert
      expect(url).toBe('https://coverartarchive.org/full.jpg');
    });

    it('should return null when no cover art exists (404)', async () => {
      // Arrange
      const axiosError = {
        isAxiosError: true,
        response: { status: 404 },
      };
      mockCoverArtAxios.get.mockRejectedValue(axiosError);

      // Act
      const url = await service.getCoverArtUrl('no-cover-mbid');

      // Assert
      expect(url).toBeNull();
    });

    it('should return null on other errors', async () => {
      // Arrange
      const axiosError = {
        isAxiosError: true,
        response: { status: 500 },
      };
      mockCoverArtAxios.get.mockRejectedValue(axiosError);

      // Act
      const url = await service.getCoverArtUrl('error-mbid');

      // Assert
      expect(url).toBeNull();
    });

    it('should return null when no front cover in images', async () => {
      // Arrange
      mockCoverArtAxios.get.mockResolvedValue({
        data: {
          images: [
            {
              front: false,
              type: 'back',
              image: 'https://coverartarchive.org/back.jpg',
            },
          ],
        },
      });

      // Act
      const url = await service.getCoverArtUrl('mbid');

      // Assert
      expect(url).toBeNull();
    });

    it('should return null when images array is empty', async () => {
      // Arrange
      mockCoverArtAxios.get.mockResolvedValue({
        data: { images: [] },
      });

      // Act
      const url = await service.getCoverArtUrl('mbid');

      // Assert
      expect(url).toBeNull();
    });

    it('should call correct endpoint', async () => {
      // Arrange
      mockCoverArtAxios.get.mockResolvedValue({
        data: { images: [] },
      });

      // Act
      await service.getCoverArtUrl('test-mbid');

      // Assert
      expect(mockCoverArtAxios.get).toHaveBeenCalledWith(
        '/release-group/test-mbid'
      );
    });
  });

  describe('batchGetCoverArtUrls', () => {
    it('should fetch multiple cover art URLs', async () => {
      // Arrange
      mockCoverArtAxios.get
        .mockResolvedValueOnce({
          data: {
            images: [
              {
                front: true,
                thumbnails: { small: 'https://cover1.jpg' },
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          data: {
            images: [
              {
                front: true,
                thumbnails: { small: 'https://cover2.jpg' },
              },
            ],
          },
        });

      // Act
      const results = await service.batchGetCoverArtUrls(['mbid-1', 'mbid-2']);

      // Assert
      expect(results.size).toBe(2);
      expect(results.get('mbid-1')).toBe('https://cover1.jpg');
      expect(results.get('mbid-2')).toBe('https://cover2.jpg');
    });

    it('should handle mixed success and failure', async () => {
      // Arrange
      mockCoverArtAxios.get
        .mockResolvedValueOnce({
          data: {
            images: [
              { front: true, thumbnails: { small: 'https://cover1.jpg' } },
            ],
          },
        })
        .mockRejectedValueOnce({
          isAxiosError: true,
          response: { status: 404 },
        });

      // Act
      const results = await service.batchGetCoverArtUrls([
        'mbid-1',
        'mbid-missing',
      ]);

      // Assert
      expect(results.size).toBe(1);
      expect(results.has('mbid-1')).toBe(true);
      expect(results.has('mbid-missing')).toBe(false);
    });

    it('should handle empty input', async () => {
      // Act
      const results = await service.batchGetCoverArtUrls([]);

      // Assert
      expect(results.size).toBe(0);
    });
  });

  describe('getArtistById', () => {
    it('should fetch artist by MBID', async () => {
      // Arrange
      mockMusicBrainzAxios.get.mockResolvedValue({
        data: {
          id: 'artist-mbid',
          name: 'Radiohead',
          disambiguation: 'English rock band',
          country: 'GB',
          'life-span': {
            begin: '1985',
          },
        },
      });

      // Act
      const artist = await service.getArtistById('artist-mbid');

      // Assert
      expect(artist).toMatchObject({
        mbid: 'artist-mbid',
        name: 'Radiohead',
        disambiguation: 'English rock band',
        country: 'GB',
        beginYear: 1985,
        score: 100,
      });
    });

    it('should return null for non-existent artist', async () => {
      // Arrange
      const axiosError = {
        isAxiosError: true,
        response: { status: 404 },
      };
      mockMusicBrainzAxios.get.mockRejectedValue(axiosError);

      // Act
      const artist = await service.getArtistById('non-existent');

      // Assert
      expect(artist).toBeNull();
    });

    it('should use correct API endpoint', async () => {
      // Arrange
      mockMusicBrainzAxios.get.mockResolvedValue({
        data: { id: 'mbid', name: 'Artist' },
      });

      // Act
      await service.getArtistById('test-mbid');

      // Assert
      expect(mockMusicBrainzAxios.get).toHaveBeenCalledWith(
        '/artist/test-mbid',
        {
          params: { fmt: 'json' },
        }
      );
    });

    it('should parse full life-span data', async () => {
      // Arrange
      mockMusicBrainzAxios.get.mockResolvedValue({
        data: {
          id: 'artist-mbid',
          name: 'The Beatles',
          'life-span': {
            begin: '1960-08-00',
            end: '1970-04-10',
            ended: true,
          },
        },
      });

      // Act
      const artist = await service.getArtistById('artist-mbid');

      // Assert
      expect(artist?.beginYear).toBe(1960);
      expect(artist?.endYear).toBe(1970);
    });

    it('should rethrow non-404 errors', async () => {
      // Arrange
      const serverError = {
        isAxiosError: true,
        response: { status: 500 },
        message: 'Server Error',
      };
      mockMusicBrainzAxios.get.mockRejectedValue(serverError);

      // Act & Assert
      await expect(service.getArtistById('test-mbid')).rejects.toMatchObject({
        response: { status: 500 },
      });
    });
  });

  describe('axios configuration', () => {
    it('should create axios instances with correct configuration', () => {
      // Assert - MusicBrainz instance
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://musicbrainz.org/ws/2',
          timeout: 10000,
          headers: expect.objectContaining({
            'User-Agent': expect.stringContaining('RecordScrobbles'),
            Accept: 'application/json',
          }),
        })
      );

      // Assert - Cover Art Archive instance
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://coverartarchive.org',
          timeout: 5000,
          headers: expect.objectContaining({
            'User-Agent': expect.stringContaining('RecordScrobbles'),
            Accept: 'application/json',
          }),
        })
      );
    });
  });

  describe('edge cases', () => {
    it('should handle artist with no life-span data', async () => {
      // Arrange
      mockMusicBrainzAxios.get.mockResolvedValue({
        data: {
          artists: [
            {
              id: 'mbid',
              name: 'Unknown Band',
              score: 80,
            },
          ],
        },
      });

      // Act
      const results = await service.searchArtist('Unknown Band');

      // Assert
      expect(results[0].beginYear).toBeUndefined();
      expect(results[0].endYear).toBeUndefined();
    });

    it('should handle invalid year format', async () => {
      // Arrange
      mockMusicBrainzAxios.get.mockResolvedValue({
        data: {
          artists: [
            {
              id: 'mbid',
              name: 'Artist',
              'life-span': {
                begin: 'unknown',
                end: 'ongoing',
              },
              score: 100,
            },
          ],
        },
      });

      // Act
      const results = await service.searchArtist('Artist');

      // Assert
      // NaN from parseInt becomes undefined due to || undefined
      expect(results[0].beginYear).toBeUndefined();
      expect(results[0].endYear).toBeUndefined();
    });

    it('should preserve secondary types in release mapping', async () => {
      // Arrange
      mockMusicBrainzAxios.get.mockResolvedValue({
        data: {
          'release-groups': [
            {
              id: 'rg-1',
              title: 'Live Album',
              'primary-type': 'Album',
              'secondary-types': ['Live', 'Compilation'],
            },
          ],
          count: 1,
        },
      });

      // Act
      const releases = await service.getArtistReleases('artist-mbid');

      // Assert
      // Compilation takes precedence
      expect(releases[0].releaseType).toBe('compilation');
      expect(releases[0].secondaryTypes).toEqual(['Live', 'Compilation']);
    });

    it('should handle release type case insensitivity', async () => {
      // Arrange
      mockMusicBrainzAxios.get.mockResolvedValue({
        data: {
          'release-groups': [
            { id: '1', title: 'Album', 'primary-type': 'ALBUM' },
            { id: '2', title: 'EP', 'primary-type': 'ep' },
            { id: '3', title: 'Single', 'primary-type': 'SINGLE' },
          ],
          count: 3,
        },
      });

      // Act
      const releases = await service.getArtistReleases('artist-mbid');

      // Assert
      expect(releases[0].releaseType).toBe('album');
      expect(releases[1].releaseType).toBe('ep');
      expect(releases[2].releaseType).toBe('single');
    });
  });
});
