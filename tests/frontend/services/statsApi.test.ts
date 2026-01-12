import { statsApi, imagesApi } from '../../../src/renderer/services/statsApi';

// Mock the fetch API
global.fetch = jest.fn();
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

describe('statsApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockJsonResponse = (data: unknown) => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(data),
    } as Response);
  };

  describe('getOverview', () => {
    it('should fetch stats overview', async () => {
      const mockData = { success: true, data: { totalScrobbles: 1000 } };
      mockJsonResponse(mockData);

      const result = await statsApi.getOverview();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/stats/overview')
      );
      expect(result).toEqual(mockData);
    });
  });

  describe('getStreaks', () => {
    it('should fetch streaks data', async () => {
      const mockData = {
        success: true,
        data: { currentStreak: 5, longestStreak: 10 },
      };
      mockJsonResponse(mockData);

      const result = await statsApi.getStreaks();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/stats/streaks')
      );
      expect(result).toEqual(mockData);
    });
  });

  describe('getCounts', () => {
    it('should fetch scrobble counts', async () => {
      const mockData = { success: true, data: { today: 10, thisWeek: 50 } };
      mockJsonResponse(mockData);

      const result = await statsApi.getCounts();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/stats/counts')
      );
      expect(result).toEqual(mockData);
    });
  });

  describe('getListeningHours', () => {
    it('should fetch listening hours', async () => {
      const mockData = { success: true, data: { today: 2.5, thisWeek: 15 } };
      mockJsonResponse(mockData);

      const result = await statsApi.getListeningHours();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/stats/listening-hours')
      );
      expect(result).toEqual(mockData);
    });
  });

  describe('getNewArtists', () => {
    it('should fetch new artists count', async () => {
      const mockData = { success: true, data: { count: 15 } };
      mockJsonResponse(mockData);

      const result = await statsApi.getNewArtists();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/stats/new-artists')
      );
      expect(result).toEqual(mockData);
    });
  });

  describe('getTopArtists', () => {
    it('should fetch top artists for a period', async () => {
      const mockData = {
        success: true,
        data: [{ artist: 'Radiohead', playCount: 100 }],
      };
      mockJsonResponse(mockData);

      const result = await statsApi.getTopArtists('month', 10);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/stats/top/artists/month?limit=10')
      );
      expect(result).toEqual(mockData);
    });

    it('should use default limit of 10', async () => {
      const mockData = { success: true, data: [] };
      mockJsonResponse(mockData);

      await statsApi.getTopArtists('week');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=10')
      );
    });

    it('should include date range for custom period', async () => {
      const mockData = { success: true, data: [] };
      mockJsonResponse(mockData);

      await statsApi.getTopArtists('custom', 10, {
        startDate: 1704067200,
        endDate: 1706745600,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/stats/top/artists/custom')
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('startDate=1704067200')
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('endDate=1706745600')
      );
    });

    it('should not include date range if period is not custom', async () => {
      const mockData = { success: true, data: [] };
      mockJsonResponse(mockData);

      await statsApi.getTopArtists('month', 10, {
        startDate: 1704067200,
        endDate: 1706745600,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/stats/top/artists/month')
      );
      expect(mockFetch).not.toHaveBeenCalledWith(
        expect.stringContaining('startDate=')
      );
    });
  });

  describe('getTopAlbums', () => {
    it('should fetch top albums for a period', async () => {
      const mockData = {
        success: true,
        data: [{ artist: 'Radiohead', album: 'OK Computer', playCount: 50 }],
      };
      mockJsonResponse(mockData);

      const result = await statsApi.getTopAlbums('year', 5);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/stats/top/albums/year?limit=5')
      );
      expect(result).toEqual(mockData);
    });

    it('should include date range for custom period', async () => {
      const mockData = { success: true, data: [] };
      mockJsonResponse(mockData);

      await statsApi.getTopAlbums('custom', 10, {
        startDate: 1704067200,
        endDate: 1706745600,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/stats/top/albums/custom')
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('startDate=1704067200')
      );
    });
  });

  describe('getCollectionCoverage', () => {
    it('should fetch collection coverage', async () => {
      const mockData = { success: true, data: { thisMonth: 15, thisYear: 45 } };
      mockJsonResponse(mockData);

      const result = await statsApi.getCollectionCoverage();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/stats/collection/coverage')
      );
      expect(result).toEqual(mockData);
    });
  });

  describe('getDustyCorners', () => {
    it('should fetch dusty corners with default limit', async () => {
      const mockData = { success: true, data: [] };
      mockJsonResponse(mockData);

      await statsApi.getDustyCorners();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/stats/dusty-corners?limit=20')
      );
    });

    it('should fetch dusty corners with custom limit', async () => {
      const mockData = { success: true, data: [] };
      mockJsonResponse(mockData);

      await statsApi.getDustyCorners(50);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/stats/dusty-corners?limit=50')
      );
    });
  });

  describe('getHeavyRotation', () => {
    it('should fetch heavy rotation albums', async () => {
      const mockData = { success: true, data: [] };
      mockJsonResponse(mockData);

      await statsApi.getHeavyRotation(15);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/stats/heavy-rotation?limit=15')
      );
    });
  });

  describe('getHeatmap', () => {
    it('should fetch heatmap without year param', async () => {
      const mockData = { success: true, data: [] };
      mockJsonResponse(mockData);

      await statsApi.getHeatmap();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/stats/heatmap')
      );
      expect(mockFetch).not.toHaveBeenCalledWith(
        expect.stringContaining('year=')
      );
    });

    it('should fetch heatmap with year param', async () => {
      const mockData = { success: true, data: [] };
      mockJsonResponse(mockData);

      await statsApi.getHeatmap(2024);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/stats/heatmap?year=2024')
      );
    });
  });

  describe('getMilestones', () => {
    it('should fetch milestones', async () => {
      const mockData = {
        success: true,
        data: { total: 10000, nextMilestone: 15000 },
      };
      mockJsonResponse(mockData);

      const result = await statsApi.getMilestones();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/stats/milestones')
      );
      expect(result).toEqual(mockData);
    });
  });

  describe('getSourceBreakdown', () => {
    it('should fetch source breakdown', async () => {
      const mockData = {
        success: true,
        data: [{ source: 'vinyl', count: 500 }],
      };
      mockJsonResponse(mockData);

      const result = await statsApi.getSourceBreakdown();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/stats/sources')
      );
      expect(result).toEqual(mockData);
    });
  });

  describe('getTimeline', () => {
    it('should fetch timeline with defaults', async () => {
      const mockData = { success: true, data: [] };
      mockJsonResponse(mockData);

      await statsApi.getTimeline();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/stats/timeline?period=year&granularity=week')
      );
    });

    it('should fetch timeline with custom period and granularity', async () => {
      const mockData = { success: true, data: [] };
      mockJsonResponse(mockData);

      await statsApi.getTimeline('month', 'day');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/stats/timeline?period=month&granularity=day')
      );
    });

    it('should include date range for custom period', async () => {
      const mockData = { success: true, data: [] };
      mockJsonResponse(mockData);

      await statsApi.getTimeline('custom', 'day', {
        startDate: 1704067200,
        endDate: 1706745600,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('period=custom')
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('startDate=1704067200')
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('endDate=1706745600')
      );
    });
  });
});

describe('imagesApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockJsonResponse = (data: unknown) => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(data),
    } as Response);
  };

  describe('getAlbumCover', () => {
    it('should fetch album cover', async () => {
      const mockData = {
        success: true,
        data: { url: 'https://example.com/cover.jpg', source: 'lastfm' },
      };
      mockJsonResponse(mockData);

      const result = await imagesApi.getAlbumCover('Radiohead', 'OK Computer');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/images/album?')
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('artist=Radiohead')
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('album=OK+Computer')
      );
      expect(result).toEqual(mockData);
    });
  });

  describe('getArtistImage', () => {
    it('should fetch artist image', async () => {
      const mockData = {
        success: true,
        data: { url: 'https://example.com/artist.jpg', source: 'lastfm' },
      };
      mockJsonResponse(mockData);

      const result = await imagesApi.getArtistImage('Radiohead');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/images/artist?')
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('name=Radiohead')
      );
      expect(result).toEqual(mockData);
    });
  });

  describe('batchGetAlbumCovers', () => {
    it('should batch fetch album covers', async () => {
      const mockData = {
        success: true,
        data: { 'radiohead|ok computer': 'https://example.com/cover.jpg' },
      };
      mockJsonResponse(mockData);

      const albums = [{ artist: 'Radiohead', album: 'OK Computer' }];
      const result = await imagesApi.batchGetAlbumCovers(albums);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/images/batch/albums'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ albums }),
        })
      );
      expect(result).toEqual(mockData);
    });
  });

  describe('batchGetArtistImages', () => {
    it('should batch fetch artist images', async () => {
      const mockData = {
        success: true,
        data: { radiohead: 'https://example.com/artist.jpg' },
      };
      mockJsonResponse(mockData);

      const artists = ['Radiohead', 'The Beatles'];
      const result = await imagesApi.batchGetArtistImages(artists);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/images/batch/artists'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ artists }),
        })
      );
      expect(result).toEqual(mockData);
    });
  });
});
