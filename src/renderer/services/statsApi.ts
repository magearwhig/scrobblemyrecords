import {
  AlbumPlayCount,
  AlbumTracksPlayedResponse,
  ApiResponse,
  ArtistDetailResponse,
  ArtistPlayCount,
  CalendarHeatmapData,
  CollectionCoverage,
  DateAlbumsResult,
  DateRange,
  DayOfWeekDistributionResult,
  DustyCornerAlbum,
  GenreDistributionResult,
  HourlyDistributionResult,
  ListeningHours,
  OnThisDayResult,
  MilestoneInfo,
  NewArtistDetail,
  RankingsOverTimeResponse,
  ScrobbleCounts,
  SourceBreakdownItem,
  StatsOverview,
  StreakInfo,
  TimelineDataPoint,
  TrackDetailResponse,
  TrackPlayCount,
} from '../../shared/types';

const API_BASE = `http://localhost:${process.env.REACT_APP_BACKEND_PORT || '3001'}/api/v1`;

/**
 * Stats API service for the frontend
 */
export const statsApi = {
  /**
   * Get full stats overview
   */
  async getOverview(): Promise<ApiResponse<StatsOverview>> {
    const response = await fetch(`${API_BASE}/stats/overview`);
    return response.json();
  },

  /**
   * Get streak information
   */
  async getStreaks(): Promise<ApiResponse<StreakInfo>> {
    const response = await fetch(`${API_BASE}/stats/streaks`);
    return response.json();
  },

  /**
   * Get scrobble counts
   */
  async getCounts(): Promise<ApiResponse<ScrobbleCounts>> {
    const response = await fetch(`${API_BASE}/stats/counts`);
    return response.json();
  },

  /**
   * Get listening hours
   */
  async getListeningHours(): Promise<ApiResponse<ListeningHours>> {
    const response = await fetch(`${API_BASE}/stats/listening-hours`);
    return response.json();
  },

  /**
   * Get new artists count this month
   */
  async getNewArtists(): Promise<ApiResponse<{ count: number }>> {
    const response = await fetch(`${API_BASE}/stats/new-artists`);
    return response.json();
  },

  /**
   * Get detailed list of new artists discovered this month
   */
  async getNewArtistsDetails(): Promise<ApiResponse<NewArtistDetail[]>> {
    const response = await fetch(`${API_BASE}/stats/new-artists/details`);
    return response.json();
  },

  /**
   * Get top artists for a period
   * @param period - Time period or 'custom' for custom range
   * @param limit - Maximum number of artists to return
   * @param dateRange - Custom date range (required when period is 'custom')
   */
  async getTopArtists(
    period:
      | 'week'
      | 'month'
      | 'year'
      | 'all'
      | 'days30'
      | 'days90'
      | 'days365'
      | 'custom',
    limit: number = 10,
    dateRange?: DateRange
  ): Promise<ApiResponse<ArtistPlayCount[]>> {
    let url = `${API_BASE}/stats/top/artists/${period}?limit=${limit}`;

    if (period === 'custom' && dateRange) {
      url += `&startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`;
    }

    const response = await fetch(url);
    return response.json();
  },

  /**
   * Get top albums for a period
   * @param period - Time period or 'custom' for custom range
   * @param limit - Maximum number of albums to return
   * @param dateRange - Custom date range (required when period is 'custom')
   */
  async getTopAlbums(
    period:
      | 'week'
      | 'month'
      | 'year'
      | 'all'
      | 'days30'
      | 'days90'
      | 'days365'
      | 'custom',
    limit: number = 10,
    dateRange?: DateRange
  ): Promise<ApiResponse<AlbumPlayCount[]>> {
    let url = `${API_BASE}/stats/top/albums/${period}?limit=${limit}`;

    if (period === 'custom' && dateRange) {
      url += `&startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`;
    }

    const response = await fetch(url);
    return response.json();
  },

  /**
   * Get top tracks for a period
   * @param period - Time period or 'custom' for custom range
   * @param limit - Maximum number of tracks to return
   * @param dateRange - Custom date range (required when period is 'custom')
   */
  async getTopTracks(
    period:
      | 'week'
      | 'month'
      | 'year'
      | 'all'
      | 'days30'
      | 'days90'
      | 'days365'
      | 'custom',
    limit: number = 10,
    dateRange?: DateRange
  ): Promise<ApiResponse<TrackPlayCount[]>> {
    let url = `${API_BASE}/stats/top/tracks/${period}?limit=${limit}`;

    if (period === 'custom' && dateRange) {
      url += `&startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`;
    }

    const response = await fetch(url);
    return response.json();
  },

  /**
   * Get collection coverage stats
   */
  async getCollectionCoverage(): Promise<ApiResponse<CollectionCoverage>> {
    const response = await fetch(`${API_BASE}/stats/collection/coverage`);
    return response.json();
  },

  /**
   * Get dusty corners (neglected albums)
   */
  async getDustyCorners(
    limit: number = 20
  ): Promise<ApiResponse<DustyCornerAlbum[]>> {
    const response = await fetch(
      `${API_BASE}/stats/dusty-corners?limit=${limit}`
    );
    return response.json();
  },

  /**
   * Get heavy rotation albums
   */
  async getHeavyRotation(
    limit: number = 10
  ): Promise<ApiResponse<AlbumPlayCount[]>> {
    const response = await fetch(
      `${API_BASE}/stats/heavy-rotation?limit=${limit}`
    );
    return response.json();
  },

  /**
   * Get calendar heatmap data
   */
  async getHeatmap(year?: number): Promise<ApiResponse<CalendarHeatmapData[]>> {
    const params = year ? `?year=${year}` : '';
    const response = await fetch(`${API_BASE}/stats/heatmap${params}`);
    return response.json();
  },

  /**
   * Get albums played on a specific date (heatmap drill-down)
   * @param date - Date string in YYYY-MM-DD format
   */
  async getHeatmapDate(date: string): Promise<ApiResponse<DateAlbumsResult>> {
    const response = await fetch(`${API_BASE}/stats/heatmap/${date}`);
    return response.json();
  },

  /**
   * Get milestone progress
   */
  async getMilestones(): Promise<ApiResponse<MilestoneInfo>> {
    const response = await fetch(`${API_BASE}/stats/milestones`);
    return response.json();
  },

  /**
   * Get source breakdown (RecordScrobbles vs Other)
   */
  async getSourceBreakdown(): Promise<ApiResponse<SourceBreakdownItem[]>> {
    const response = await fetch(`${API_BASE}/stats/sources`);
    return response.json();
  },

  /**
   * Get listening timeline data
   * @param period - Time period or 'custom' for custom range
   * @param granularity - Aggregation granularity
   * @param dateRange - Custom date range (required when period is 'custom')
   */
  async getTimeline(
    period:
      | 'week'
      | 'month'
      | 'year'
      | 'days30'
      | 'days90'
      | 'days365'
      | 'custom' = 'year',
    granularity: 'day' | 'week' | 'month' = 'week',
    dateRange?: DateRange
  ): Promise<ApiResponse<TimelineDataPoint[]>> {
    let url = `${API_BASE}/stats/timeline?period=${period}&granularity=${granularity}`;

    if (period === 'custom' && dateRange) {
      url += `&startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`;
    }

    const response = await fetch(url);
    return response.json();
  },

  /**
   * Get hourly distribution of scrobbles (0-23) with peak-hour insight
   */
  async getHourlyDistribution(): Promise<
    ApiResponse<HourlyDistributionResult>
  > {
    const response = await fetch(`${API_BASE}/stats/hourly-distribution`);
    return response.json();
  },

  /**
   * Get day-of-week distribution of scrobbles with weekday/weekend insight
   */
  async getDayOfWeekDistribution(): Promise<
    ApiResponse<DayOfWeekDistributionResult>
  > {
    const response = await fetch(`${API_BASE}/stats/day-of-week-distribution`);
    return response.json();
  },

  /**
   * Get rankings over time for animated visualization
   * @param type - Type of ranking (tracks, artists, or albums)
   * @param topN - Number of top items to show (1-50)
   * @param startDate - Optional start date (milliseconds)
   * @param endDate - Optional end date (milliseconds)
   */
  async getRankingsOverTime(
    type: 'tracks' | 'artists' | 'albums' = 'artists',
    topN: number = 10,
    startDate?: number,
    endDate?: number
  ): Promise<ApiResponse<RankingsOverTimeResponse>> {
    let url = `${API_BASE}/stats/rankings-over-time?type=${type}&topN=${topN}`;

    if (startDate) {
      url += `&startDate=${startDate}`;
    }
    if (endDate) {
      url += `&endDate=${endDate}`;
    }

    const response = await fetch(url);
    return response.json();
  },

  /**
   * Get which tracks from an album have been scrobbled.
   * Used for album track completeness indicator.
   */
  async getAlbumTracksPlayed(
    artist: string,
    album: string
  ): Promise<ApiResponse<AlbumTracksPlayedResponse>> {
    const params = new URLSearchParams({ artist, album });
    const response = await fetch(
      `${API_BASE}/stats/album-tracks-played?${params}`
    );
    return response.json();
  },

  /**
   * Get detailed stats for a specific artist
   * @param artistName - Artist name
   * @param trendPeriod - Granularity for play trend chart (default: 'month')
   */
  async getArtistDetail(
    artistName: string,
    trendPeriod: 'month' | 'week' = 'month'
  ): Promise<ApiResponse<ArtistDetailResponse>> {
    const params = new URLSearchParams({ trendPeriod });
    const response = await fetch(
      `${API_BASE}/stats/artist/${encodeURIComponent(artistName)}?${params}`
    );
    return response.json();
  },

  /**
   * Get detailed stats for a specific track
   * @param artist - Artist name
   * @param track - Track name
   * @param album - Optional album name to scope to specific album
   * @param trendPeriod - Granularity for play trend chart (default: 'month')
   */
  async getTrackDetail(
    artist: string,
    track: string,
    album?: string,
    trendPeriod: 'month' | 'week' = 'month'
  ): Promise<ApiResponse<TrackDetailResponse>> {
    const params = new URLSearchParams({ artist, track, trendPeriod });
    if (album) {
      params.set('album', album);
    }
    const response = await fetch(`${API_BASE}/stats/track?${params}`);
    return response.json();
  },

  /**
   * Get "On This Day" data — what was listened to on this month/day across years
   * @param month - Month (1-12), defaults to today
   * @param day - Day (1-31), defaults to today
   */
  async getOnThisDay(
    month?: number,
    day?: number
  ): Promise<ApiResponse<OnThisDayResult>> {
    const params = new URLSearchParams();
    if (month !== undefined) params.set('month', String(month));
    if (day !== undefined) params.set('day', String(day));
    const qs = params.toString();
    const response = await fetch(
      `${API_BASE}/stats/on-this-day${qs ? `?${qs}` : ''}`
    );
    return response.json();
  },

  /**
   * Get genre distribution based on Last.fm artist tags
   * @param limit - Number of top artists to analyze (default: 50)
   * @param maxTags - Maximum genres to return (default: 10)
   */
  async getGenreDistribution(
    limit: number = 50,
    maxTags: number = 10
  ): Promise<ApiResponse<GenreDistributionResult>> {
    const response = await fetch(
      `${API_BASE}/stats/genres?limit=${limit}&maxTags=${maxTags}`
    );
    return response.json();
  },
};

/**
 * Images API service
 */
export const imagesApi = {
  /**
   * Get album cover URL
   */
  async getAlbumCover(
    artist: string,
    album: string
  ): Promise<ApiResponse<{ url: string | null; source: string | null }>> {
    const params = new URLSearchParams({ artist, album });
    const response = await fetch(`${API_BASE}/images/album?${params}`);
    return response.json();
  },

  /**
   * Get artist image URL
   */
  async getArtistImage(
    name: string
  ): Promise<ApiResponse<{ url: string | null; source: string | null }>> {
    const params = new URLSearchParams({ name });
    const response = await fetch(`${API_BASE}/images/artist?${params}`);
    return response.json();
  },

  /**
   * Batch fetch album covers
   */
  async batchGetAlbumCovers(
    albums: Array<{ artist: string; album: string }>
  ): Promise<ApiResponse<Record<string, string | null>>> {
    const response = await fetch(`${API_BASE}/images/batch/albums`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ albums }),
    });
    return response.json();
  },

  /**
   * Batch fetch artist images
   */
  async batchGetArtistImages(
    artists: string[]
  ): Promise<ApiResponse<Record<string, string | null>>> {
    const response = await fetch(`${API_BASE}/images/batch/artists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artists }),
    });
    return response.json();
  },
};

export default statsApi;
