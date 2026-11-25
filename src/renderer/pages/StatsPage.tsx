import { BarChart3, Disc3, PlusCircle } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import './StatsPage.page.css';

import {
  CalendarHeatmapData,
  DateAlbumsResult,
  DateRange,
  DayOfWeekDistributionData,
  DustyCornerAlbum,
  HourlyDistributionData,
  ListeningHours,
  MilestoneInfo,
  OnThisDayResult,
  ScrobbleCounts,
  SourceBreakdownItem,
  StreakInfo,
  CollectionCoverage,
  TimelineDataPoint,
} from '../../shared/types';
import { CalendarHeatmap } from '../components/stats/CalendarHeatmap';
import { DayOfWeekChart } from '../components/stats/DayOfWeekChart';
import { DustyCornersSection } from '../components/stats/DustyCornersSection';
import { HeatmapDayDetail } from '../components/stats/HeatmapDayDetail';
import { HourlyPolarChart } from '../components/stats/HourlyPolarChart';
import { ListeningTimeline } from '../components/stats/ListeningTimeline';
import { OnThisDay } from '../components/stats/OnThisDay';
import { PeriodStatCard } from '../components/stats/PeriodStatCard';
import { StatCard } from '../components/stats/StatCard';
import { StatsRankings } from '../components/stats/StatsRankings';
import { StreakCard } from '../components/stats/StreakCard';
import { TasteSection } from '../components/stats/TasteSection';
import { Button } from '../components/ui/Button';
import { StatsPageSkeleton } from '../components/ui/Skeleton';
import { imagesApi, statsApi } from '../services/statsApi';
import { createLogger } from '../utils/logger';

const logger = createLogger('StatsPage');

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

/** Records in the Dusty Corners teaser */
const DUSTY_TEASER_COUNT = 4;

/** 75000 -> "75K", 1000000 -> "1M" */
function shortNumber(value: number): string {
  if (value >= 1_000_000 && value % 1_000_000 === 0) {
    return `${value / 1_000_000}M`;
  }
  if (value >= 1000 && value % 1000 === 0) return `${value / 1000}K`;
  return value.toLocaleString();
}

/** Listening time: minutes under an hour, else hours to one decimal */
function formatHours(hours: number): string {
  return hours < 1 ? `${Math.round(hours * 60)}m` : `${hours.toFixed(1)}h`;
}

/**
 * The numbers that used to be cards of their own, on one line: all-time and
 * yearly plays, the next milestone, estimated listening time and the share
 * scrobbled through this app.
 */
const StatsSummary: React.FC<{
  counts: ScrobbleCounts | null;
  milestones: MilestoneInfo | null;
  listeningHours: ListeningHours | null;
  sources: SourceBreakdownItem[];
}> = ({ counts, milestones, listeningHours, sources }) => {
  const parts: string[] = [];
  if (counts) {
    parts.push(`${counts.allTime.toLocaleString()} plays all time`);
    parts.push(`${counts.thisYear.toLocaleString()} this year`);
  }
  if (milestones && milestones.scrobblesToNext > 0) {
    parts.push(
      `${milestones.scrobblesToNext.toLocaleString()} to ${shortNumber(milestones.nextMilestone)}`
    );
  }
  if (listeningHours) {
    // Plays times an average track length, not measured time
    parts.push(
      `${formatHours(listeningHours.thisMonth)} this month (estimated)`
    );
  }
  const app = sources.find(s => s.source === 'RecordScrobbles');
  if (app) {
    parts.push(`${Math.round(app.percentage)}% scrobbled through this app`);
  }
  if (parts.length === 0) return null;
  return (
    <p className='stats-summary' data-testid='stats-summary'>
      {parts.join(' · ')}
    </p>
  );
};

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
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedDateData, setSelectedDateData] =
    useState<DateAlbumsResult | null>(null);
  const [dustyCorners, setDustyCorners] = useState<DustyCornerAlbum[]>([]);
  const [sourceBreakdown, setSourceBreakdown] = useState<SourceBreakdownItem[]>(
    []
  );
  const [timeline, setTimeline] = useState<TimelineDataPoint[]>([]);
  const [timelinePeriod, setTimelinePeriod] = useState<TimelinePeriod>('year');
  const [timelineDateRange, setTimelineDateRange] = useState<
    DateRange | undefined
  >();
  const [newArtistsCount, setNewArtistsCount] = useState<number>(0);
  const [listeningHours, setListeningHours] = useState<ListeningHours | null>(
    null
  );

  // Listening patterns (lazy loaded)
  const [hourlyData, setHourlyData] = useState<HourlyDistributionData[]>([]);
  const [hourlyPeakHour, setHourlyPeakHour] = useState(0);
  const [hourlyInsight, setHourlyInsight] = useState('');
  const [hourlyLoading, setHourlyLoading] = useState(false);
  const [dayOfWeekData, setDayOfWeekData] = useState<
    DayOfWeekDistributionData[]
  >([]);
  const [dayOfWeekPeakDay, setDayOfWeekPeakDay] = useState(0);
  const [dayOfWeekWeekdayAvg, setDayOfWeekWeekdayAvg] = useState(0);
  const [dayOfWeekWeekendAvg, setDayOfWeekWeekendAvg] = useState(0);
  const [dayOfWeekInsight, setDayOfWeekInsight] = useState('');
  const [dayOfWeekLoading, setDayOfWeekLoading] = useState(false);
  const listeningPatternsRef = useRef<HTMLElement>(null);
  const listeningPatternsFetched = useRef(false);

  // On This Day (lazy loaded)
  const [onThisDayData, setOnThisDayData] = useState<OnThisDayResult | null>(
    null
  );
  const [onThisDayLoading, setOnThisDayLoading] = useState(false);
  const onThisDayRef = useRef<HTMLElement>(null);
  const onThisDayFetched = useRef(false);

  // Initial data load. The rankings, taste and lazy sections load their own.
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [
          streaksRes,
          countsRes,
          coverageRes,
          milestonesRes,
          heatmapRes,
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
          statsApi.getDustyCorners(DUSTY_TEASER_COUNT),
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
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load stats');
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
    // Loads once; later changes go through the handlers below
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Lazy load listening patterns when section scrolls into view
  useEffect(() => {
    const node = listeningPatternsRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && !listeningPatternsFetched.current) {
          listeningPatternsFetched.current = true;

          setHourlyLoading(true);
          statsApi
            .getHourlyDistribution()
            .then(res => {
              if (res.success && res.data) {
                setHourlyData(res.data.distribution);
                setHourlyPeakHour(res.data.peakHour);
                setHourlyInsight(res.data.insight);
              }
            })
            .catch(err => {
              logger.error('Failed to load hourly distribution', err);
            })
            .finally(() => {
              setHourlyLoading(false);
            });

          setDayOfWeekLoading(true);
          statsApi
            .getDayOfWeekDistribution()
            .then(res => {
              if (res.success && res.data) {
                setDayOfWeekData(res.data.distribution);
                setDayOfWeekPeakDay(res.data.peakDay);
                setDayOfWeekWeekdayAvg(res.data.weekdayAvg);
                setDayOfWeekWeekendAvg(res.data.weekendAvg);
                setDayOfWeekInsight(res.data.insight);
              }
            })
            .catch(err => {
              logger.error('Failed to load day-of-week distribution', err);
            })
            .finally(() => {
              setDayOfWeekLoading(false);
            });
        }
      },
      // Start loading once a tenth of the section is visible
      { threshold: 0.1 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [loading]);

  // Lazy load On This Day when section scrolls into view. The text shows
  // first; covers come from the batch image endpoint afterwards.
  useEffect(() => {
    const node = onThisDayRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && !onThisDayFetched.current) {
          onThisDayFetched.current = true;
          setOnThisDayLoading(true);
          statsApi
            .getOnThisDay()
            .then(res => {
              if (!res.success || !res.data) return;
              const result = res.data;
              setOnThisDayData(result);
              const albums = result.years.flatMap(y =>
                y.albums.map(a => ({ artist: a.artist, album: a.album }))
              );
              if (albums.length === 0) return;
              imagesApi
                .batchGetAlbumCovers(albums)
                .then(covers => {
                  if (!covers.success || !covers.data) return;
                  const coverFor = (artist: string, album: string) =>
                    covers.data![
                      `${artist.toLowerCase().trim()}|${album.toLowerCase().trim()}`
                    ] ?? null;
                  setOnThisDayData({
                    ...result,
                    years: result.years.map(y => ({
                      ...y,
                      albums: y.albums.map(a => ({
                        ...a,
                        coverUrl: a.coverUrl ?? coverFor(a.artist, a.album),
                      })),
                    })),
                  });
                })
                .catch(err => {
                  logger.error('Failed to load On This Day covers', err);
                });
            })
            .catch(err => {
              logger.error('Failed to load On This Day data', err);
            })
            .finally(() => {
              setOnThisDayLoading(false);
            });
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [loading]);

  // Handle heatmap year change
  const handleYearChange = useCallback(async (year: number) => {
    setHeatmapYear(year);
    setSelectedDate('');
    setSelectedDateData(null);
    try {
      const res = await statsApi.getHeatmap(year);
      if (res.success) setHeatmapData(res.data!);
    } catch (err) {
      logger.error('Failed to load heatmap', err);
    }
  }, []);

  // Handle heatmap day click (drill-down)
  const handleDayClick = useCallback(async (date: string) => {
    if (!date) {
      setSelectedDate('');
      setSelectedDateData(null);
      return;
    }
    setSelectedDate(date);
    try {
      const res = await statsApi.getHeatmapDate(date);
      if (res.success && res.data) {
        setSelectedDateData(res.data);
      }
    } catch (err) {
      logger.error('Failed to load heatmap date detail', err);
    }
  }, []);

  // Handle timeline period change
  const handleTimelinePeriodChange = useCallback(
    async (period: TimelinePeriod, dateRange?: DateRange) => {
      setTimelinePeriod(period);
      setTimelineDateRange(dateRange);
      try {
        // Daily points for short periods, weekly for about a quarter,
        // monthly for a year
        let granularity: 'day' | 'week' | 'month' = 'month';
        if (period === 'week' || period === 'days30') {
          granularity = 'day';
        } else if (period === 'days90' || period === 'month') {
          granularity = 'week';
        } else if (period === 'custom' && dateRange) {
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
        logger.error('Failed to load timeline', err);
      }
    },
    []
  );

  if (loading) {
    return <StatsPageSkeleton />;
  }

  if (error) {
    return (
      <div className='stats-page'>
        <div className='stats-error'>
          <h2>Error Loading Stats</h2>
          <p>{error}</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className='stats-page'>
      <header className='stats-page-header'>
        <h1>Stats Dashboard</h1>
      </header>

      {/* Overview: four cards and a summary line */}
      <section className='stats-cards-row'>
        {counts && (
          <StatCard
            icon={<BarChart3 size={20} aria-hidden='true' />}
            value={counts.thisMonth}
            label='This Month'
            subValue={`${counts.thisWeek} this week`}
          />
        )}
        {coverage && (
          <PeriodStatCard
            icon={<Disc3 size={20} aria-hidden='true' />}
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
        <StatCard
          icon={<PlusCircle size={20} aria-hidden='true' />}
          value={newArtistsCount}
          label='New Artists'
          subValue='discovered this month'
        />
        {streaks && <StreakCard streaks={streaks} />}
      </section>
      <StatsSummary
        counts={counts}
        milestones={milestones}
        listeningHours={listeningHours}
        sources={sourceBreakdown}
      />

      {/* Rankings: top albums, labels, artists and tracks */}
      <StatsRankings />

      {/* Activity: the timeline and the year's calendar, beside this day in
          past years */}
      <div className='stats-activity-row'>
        <section className='stats-activity-calendar'>
          <ListeningTimeline
            data={timeline}
            currentPeriod={timelinePeriod}
            onPeriodChange={handleTimelinePeriodChange}
            customDateRange={timelineDateRange}
          />
          <CalendarHeatmap
            data={heatmapData}
            year={heatmapYear}
            onYearChange={handleYearChange}
            onDayClick={handleDayClick}
            selectedDate={selectedDate}
          />
          {selectedDate && selectedDateData && (
            <HeatmapDayDetail
              date={selectedDateData.date}
              albums={selectedDateData.albums}
              totalScrobbles={selectedDateData.totalScrobbles}
              onClose={() => {
                const dateToFocus = selectedDate;
                setSelectedDate('');
                setSelectedDateData(null);
                // Return focus to the triggering heatmap cell
                requestAnimationFrame(() => {
                  const cell = document.querySelector<HTMLElement>(
                    `.calendar-heatmap-cell[data-date="${dateToFocus}"]`
                  );
                  cell?.focus();
                });
              }}
            />
          )}
        </section>
        <section className='stats-activity-on-this-day' ref={onThisDayRef}>
          <OnThisDay data={onThisDayData} loading={onThisDayLoading} />
        </section>
      </div>

      {/* Listening Patterns (lazy loaded on scroll) */}
      <section
        className='listening-patterns-section'
        ref={listeningPatternsRef}
      >
        <h2>Listening Patterns</h2>
        <div className='listening-patterns-grid'>
          <HourlyPolarChart
            data={hourlyData}
            peakHour={hourlyPeakHour}
            insight={hourlyInsight}
            loading={hourlyLoading}
          />
          <DayOfWeekChart
            data={dayOfWeekData}
            peakDay={dayOfWeekPeakDay}
            weekdayAvg={dayOfWeekWeekdayAvg}
            weekendAvg={dayOfWeekWeekendAvg}
            insight={dayOfWeekInsight}
            loading={dayOfWeekLoading}
          />
        </div>
      </section>

      {/* Taste: genres or their change over time */}
      <TasteSection />

      {/* Dusty corners teaser; the full list is in What to Play */}
      <section className='stats-section'>
        <DustyCornersSection albums={dustyCorners} compact />
      </section>
    </div>
  );
};

export default StatsPage;
