import React, { useCallback, useEffect, useState } from 'react';

import {
  AlbumPlayCount,
  ArtistPlayCount,
  CalendarHeatmapData,
  DateRange,
  DustyCornerAlbum,
  ListeningHours,
  MilestoneInfo,
  ScrobbleCounts,
  SourceBreakdownItem,
  StreakInfo,
  CollectionCoverage,
  TimelineDataPoint,
} from '../../shared/types';
import { CalendarHeatmap } from '../components/stats/CalendarHeatmap';
import { DustyCornersSection } from '../components/stats/DustyCornersSection';
import { ListeningHoursCard } from '../components/stats/ListeningHoursCard';
import { ListeningTimeline } from '../components/stats/ListeningTimeline';
import { MilestoneProgress } from '../components/stats/MilestoneProgress';
import { PeriodStatCard } from '../components/stats/PeriodStatCard';
import { SourcePieChart } from '../components/stats/SourcePieChart';
import { StatCard } from '../components/stats/StatCard';
import { StreakCard } from '../components/stats/StreakCard';
import { TopList } from '../components/stats/TopList';
import { imagesApi, statsApi } from '../services/statsApi';

type Period =
  | 'week'
  | 'month'
  | 'year'
  | 'all'
  | 'days30'
  | 'days90'
  | 'days365'
  | 'custom';
type TimelinePeriod =
  | 'week'
  | 'month'
  | 'year'
  | 'days30'
  | 'days90'
  | 'days365'
  | 'custom';
type CoveragePeriod =
  | 'month'
  | 'year'
  | 'allTime'
  | 'days30'
  | 'days90'
  | 'days365';

export const StatsPage: React.FC = () => {
  // Loading states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [streaks, setStreaks] = useState<StreakInfo | null>(null);
  const [counts, setCounts] = useState<ScrobbleCounts | null>(null);
  const [coverage, setCoverage] = useState<CollectionCoverage | null>(null);
  const [coveragePeriod, setCoveragePeriod] = useState<CoveragePeriod>('month');
  const [milestones, setMilestones] = useState<MilestoneInfo | null>(null);
  const [heatmapData, setHeatmapData] = useState<CalendarHeatmapData[]>([]);
  const [heatmapYear, setHeatmapYear] = useState(new Date().getFullYear());
  const [topArtists, setTopArtists] = useState<ArtistPlayCount[]>([]);
  const [topAlbums, setTopAlbums] = useState<AlbumPlayCount[]>([]);
  const [artistPeriod, setArtistPeriod] = useState<Period>('month');
  const [albumPeriod, setAlbumPeriod] = useState<Period>('month');
  const [dustyCorners, setDustyCorners] = useState<DustyCornerAlbum[]>([]);
  const [topListsLoading, setTopListsLoading] = useState(false);
  const [dustyLoading] = useState(false);
  const [sourceBreakdown, setSourceBreakdown] = useState<SourceBreakdownItem[]>(
    []
  );
  const [timeline, setTimeline] = useState<TimelineDataPoint[]>([]);
  const [timelinePeriod, setTimelinePeriod] = useState<TimelinePeriod>('year');
  const [timelineDateRange, setTimelineDateRange] = useState<
    DateRange | undefined
  >();
  const [artistDateRange, setArtistDateRange] = useState<
    DateRange | undefined
  >();
  const [albumDateRange, setAlbumDateRange] = useState<DateRange | undefined>();
  const [newArtistsCount, setNewArtistsCount] = useState<number>(0);
  const [listeningHours, setListeningHours] = useState<ListeningHours | null>(
    null
  );

  // Fetch and merge album cover images into album list
  const enrichAlbumsWithImages = useCallback(
    async (albums: AlbumPlayCount[]): Promise<AlbumPlayCount[]> => {
      if (albums.length === 0) return albums;
      try {
        const albumRequests = albums.map(a => ({
          artist: a.artist,
          album: a.album,
        }));
        const imagesRes = await imagesApi.batchGetAlbumCovers(albumRequests);
        if (imagesRes.success && imagesRes.data) {
          return albums.map(album => {
            // Key must be lowercase to match backend normalization
            const key = `${album.artist.toLowerCase().trim()}|${album.album.toLowerCase().trim()}`;
            const coverUrl = imagesRes.data![key];
            return coverUrl ? { ...album, coverUrl } : album;
          });
        }
      } catch (err) {
        console.error('Failed to fetch album images:', err);
      }
      return albums;
    },
    []
  );

  // Fetch and merge artist images into artist list
  const enrichArtistsWithImages = useCallback(
    async (artists: ArtistPlayCount[]): Promise<ArtistPlayCount[]> => {
      if (artists.length === 0) return artists;
      try {
        const artistNames = artists.map(a => a.artist);
        const imagesRes = await imagesApi.batchGetArtistImages(artistNames);
        if (imagesRes.success && imagesRes.data) {
          return artists.map(artist => {
            // Key must be lowercase to match backend normalization
            const imageUrl =
              imagesRes.data![artist.artist.toLowerCase().trim()];
            return imageUrl ? { ...artist, imageUrl } : artist;
          });
        }
      } catch (err) {
        console.error('Failed to fetch artist images:', err);
      }
      return artists;
    },
    []
  );

  // Initial data load
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Load all data in parallel
        const [
          streaksRes,
          countsRes,
          coverageRes,
          milestonesRes,
          heatmapRes,
          artistsRes,
          albumsRes,
          dustyRes,
          sourcesRes,
          timelineRes,
          newArtistsRes,
          listeningHoursRes,
        ] = await Promise.all([
          statsApi.getStreaks(),
          statsApi.getCounts(),
          statsApi.getCollectionCoverage(),
          statsApi.getMilestones(),
          statsApi.getHeatmap(heatmapYear),
          statsApi.getTopArtists(artistPeriod, 10),
          statsApi.getTopAlbums(albumPeriod, 10),
          statsApi.getDustyCorners(20),
          statsApi.getSourceBreakdown(),
          statsApi.getTimeline(
            timelinePeriod,
            timelinePeriod === 'week'
              ? 'day'
              : timelinePeriod === 'month'
                ? 'week'
                : 'month'
          ),
          statsApi.getNewArtists(),
          statsApi.getListeningHours(),
        ]);

        if (streaksRes.success) setStreaks(streaksRes.data!);
        if (countsRes.success) setCounts(countsRes.data!);
        if (coverageRes.success) setCoverage(coverageRes.data!);
        if (milestonesRes.success) setMilestones(milestonesRes.data!);
        if (heatmapRes.success) setHeatmapData(heatmapRes.data!);
        if (dustyRes.success) setDustyCorners(dustyRes.data!);
        if (sourcesRes.success) setSourceBreakdown(sourcesRes.data!);
        if (timelineRes.success) setTimeline(timelineRes.data!);
        if (newArtistsRes.success)
          setNewArtistsCount(newArtistsRes.data!.count);
        if (listeningHoursRes.success)
          setListeningHours(listeningHoursRes.data!);

        // Set initial data then enrich with images
        if (artistsRes.success && artistsRes.data) {
          setTopArtists(artistsRes.data);
          enrichArtistsWithImages(artistsRes.data).then(setTopArtists);
        }
        if (albumsRes.success && albumsRes.data) {
          setTopAlbums(albumsRes.data);
          enrichAlbumsWithImages(albumsRes.data).then(setTopAlbums);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load stats');
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, [enrichAlbumsWithImages, enrichArtistsWithImages]);

  // Handle artist period change
  const handleArtistPeriodChange = useCallback(
    async (period: Period, dateRange?: DateRange) => {
      setArtistPeriod(period);
      setArtistDateRange(dateRange);
      setTopListsLoading(true);
      try {
        const res = await statsApi.getTopArtists(period, 10, dateRange);
        if (res.success && res.data) {
          setTopArtists(res.data);
          enrichArtistsWithImages(res.data).then(setTopArtists);
        }
      } catch (err) {
        console.error('Failed to load top artists:', err);
      } finally {
        setTopListsLoading(false);
      }
    },
    [enrichArtistsWithImages]
  );

  // Handle album period change
  const handleAlbumPeriodChange = useCallback(
    async (period: Period, dateRange?: DateRange) => {
      setAlbumPeriod(period);
      setAlbumDateRange(dateRange);
      setTopListsLoading(true);
      try {
        const res = await statsApi.getTopAlbums(period, 10, dateRange);
        if (res.success && res.data) {
          setTopAlbums(res.data);
          enrichAlbumsWithImages(res.data).then(setTopAlbums);
        }
      } catch (err) {
        console.error('Failed to load top albums:', err);
      } finally {
        setTopListsLoading(false);
      }
    },
    [enrichAlbumsWithImages]
  );

  // Handle heatmap year change
  const handleYearChange = useCallback(async (year: number) => {
    setHeatmapYear(year);
    try {
      const res = await statsApi.getHeatmap(year);
      if (res.success) setHeatmapData(res.data!);
    } catch (err) {
      console.error('Failed to load heatmap:', err);
    }
  }, []);

  // Handle timeline period change
  const handleTimelinePeriodChange = useCallback(
    async (period: TimelinePeriod, dateRange?: DateRange) => {
      setTimelinePeriod(period);
      setTimelineDateRange(dateRange);
      try {
        // Use appropriate granularity for each period:
        // - week/days30/custom (short): daily data points
        // - days90: weekly data points
        // - year/days365: monthly data points
        let granularity: 'day' | 'week' | 'month' = 'month';
        if (period === 'week' || period === 'days30') {
          granularity = 'day';
        } else if (period === 'days90' || period === 'month') {
          granularity = 'week';
        } else if (period === 'custom' && dateRange) {
          // For custom ranges, use granularity based on range length
          const rangeDays =
            (dateRange.endDate - dateRange.startDate) / (24 * 60 * 60);
          if (rangeDays <= 31) {
            granularity = 'day';
          } else if (rangeDays <= 120) {
            granularity = 'week';
          } else {
            granularity = 'month';
          }
        }
        const res = await statsApi.getTimeline(period, granularity, dateRange);
        if (res.success) setTimeline(res.data!);
      } catch (err) {
        console.error('Failed to load timeline:', err);
      }
    },
    []
  );

  if (loading) {
    return (
      <div className='stats-page'>
        <div className='stats-loading'>
          <div className='stats-loading-spinner' />
          <p>Loading your stats...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='stats-page'>
        <div className='stats-error'>
          <h2>Error Loading Stats</h2>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className='stats-page'>
      <header className='stats-page-header'>
        <h1>Stats Dashboard</h1>
      </header>

      {/* Top stat cards row */}
      <section className='stats-cards-row'>
        {streaks && <StreakCard streaks={streaks} />}
        {counts && (
          <>
            <StatCard
              icon='📊'
              value={counts.thisMonth}
              label='This Month'
              subValue={`${counts.thisWeek} this week`}
            />
            <StatCard
              icon='🎵'
              value={counts.allTime.toLocaleString()}
              label='All Time'
              subValue={`${counts.thisYear.toLocaleString()} this year`}
            />
          </>
        )}
        <StatCard
          icon='🆕'
          value={newArtistsCount}
          label='New Artists'
          subValue='discovered this month'
        />
        {listeningHours && <ListeningHoursCard hours={listeningHours} />}
        {coverage && (
          <PeriodStatCard
            icon='📀'
            values={{
              month: {
                value: `${coverage.thisMonth}%`,
                subValue: `${coverage.albumsPlayedThisMonth} of ${coverage.totalAlbums} albums this month`,
              },
              year: {
                value: `${coverage.thisYear}%`,
                subValue: `${coverage.albumsPlayedThisYear} of ${coverage.totalAlbums} albums this year`,
              },
              days30: {
                value: `${coverage.days30}%`,
                subValue: `${coverage.albumsPlayedDays30} of ${coverage.totalAlbums} albums in 30 days`,
              },
              days90: {
                value: `${coverage.days90}%`,
                subValue: `${coverage.albumsPlayedDays90} of ${coverage.totalAlbums} albums in 90 days`,
              },
              days365: {
                value: `${coverage.days365}%`,
                subValue: `${coverage.albumsPlayedDays365} of ${coverage.totalAlbums} albums in 365 days`,
              },
              allTime: {
                value: `${coverage.allTime}%`,
                subValue: `${coverage.albumsPlayedAllTime} of ${coverage.totalAlbums} albums ever played`,
              },
            }}
            label='Collection Coverage'
            currentPeriod={coveragePeriod}
            onPeriodChange={setCoveragePeriod}
          />
        )}
      </section>

      {/* Source breakdown and timeline row */}
      <section className='stats-charts-row'>
        <SourcePieChart data={sourceBreakdown} />
        <ListeningTimeline
          data={timeline}
          currentPeriod={timelinePeriod}
          onPeriodChange={handleTimelinePeriodChange}
          customDateRange={timelineDateRange}
        />
      </section>

      {/* Calendar heatmap */}
      <section className='stats-section'>
        <CalendarHeatmap
          data={heatmapData}
          year={heatmapYear}
          onYearChange={handleYearChange}
        />
      </section>

      {/* Top lists side by side */}
      <section className='stats-top-lists-row'>
        <TopList
          title='Top Artists'
          type='artists'
          data={topArtists}
          currentPeriod={artistPeriod}
          onPeriodChange={handleArtistPeriodChange}
          loading={topListsLoading}
          customDateRange={artistDateRange}
        />
        <TopList
          title='Top Albums'
          type='albums'
          data={topAlbums}
          currentPeriod={albumPeriod}
          onPeriodChange={handleAlbumPeriodChange}
          loading={topListsLoading}
          customDateRange={albumDateRange}
        />
      </section>

      {/* Milestone progress */}
      {milestones && (
        <section className='stats-section'>
          <MilestoneProgress milestones={milestones} />
        </section>
      )}

      {/* Dusty corners */}
      <section className='stats-section'>
        <DustyCornersSection albums={dustyCorners} loading={dustyLoading} />
      </section>
    </div>
  );
};

export default StatsPage;
