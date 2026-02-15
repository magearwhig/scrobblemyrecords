import { render, screen } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';

import CollectionCoverageSlide from '../../../src/renderer/components/wrapped/CollectionCoverageSlide';
import HeatmapSlide from '../../../src/renderer/components/wrapped/HeatmapSlide';
import MostPlayedAdditionSlide from '../../../src/renderer/components/wrapped/MostPlayedAdditionSlide';
import NewArtistsSlide from '../../../src/renderer/components/wrapped/NewArtistsSlide';
import PeakDaySlide from '../../../src/renderer/components/wrapped/PeakDaySlide';
import PeakHourSlide from '../../../src/renderer/components/wrapped/PeakHourSlide';
import RecordsAddedSlide from '../../../src/renderer/components/wrapped/RecordsAddedSlide';
import StreakSlide from '../../../src/renderer/components/wrapped/StreakSlide';
import TopAlbumsSlide from '../../../src/renderer/components/wrapped/TopAlbumsSlide';
import TopArtistsSlide from '../../../src/renderer/components/wrapped/TopArtistsSlide';
import TopTracksSlide from '../../../src/renderer/components/wrapped/TopTracksSlide';
import TotalScrobblesSlide from '../../../src/renderer/components/wrapped/TotalScrobblesSlide';
import UniqueCountsSlide from '../../../src/renderer/components/wrapped/UniqueCountsSlide';
import VinylVsDigitalSlide from '../../../src/renderer/components/wrapped/VinylVsDigitalSlide';
import WrappedSlide from '../../../src/renderer/components/wrapped/WrappedSlide';
import {
  WrappedListeningStats,
  WrappedTopItem,
  WrappedCollectionStats,
  WrappedCrossSourceStats,
} from '../../../src/shared/types';

// Mock CalendarHeatmap to avoid complex SVG rendering in tests
jest.mock('../../../src/renderer/components/stats/CalendarHeatmap', () => {
  return function MockCalendarHeatmap(props: { year: number }) {
    return <div data-testid='calendar-heatmap'>Heatmap {props.year}</div>;
  };
});

// Mock ProgressBar
jest.mock('../../../src/renderer/components/ui/ProgressBar', () => ({
  ProgressBar: (props: { value: number; max: number; label: string }) => (
    <div
      data-testid='progress-bar'
      role='progressbar'
      aria-valuenow={props.value}
    >
      {props.label}: {props.value}/{props.max}
    </div>
  ),
}));

function createBaseStats(
  overrides: Partial<WrappedListeningStats> = {}
): WrappedListeningStats {
  return {
    totalScrobbles: 5000,
    estimatedListeningHours: 416,
    uniqueArtists: 200,
    uniqueAlbums: 350,
    topArtists: [{ name: 'Radiohead', artist: 'Radiohead', playCount: 300 }],
    topAlbums: [
      {
        name: 'OK Computer',
        artist: 'Radiohead',
        album: 'OK Computer',
        playCount: 80,
      },
    ],
    topTracks: [
      {
        name: 'Paranoid Android',
        artist: 'Radiohead',
        album: 'OK Computer',
        playCount: 30,
      },
    ],
    newArtistsDiscovered: 15,
    newArtistsList: [
      { name: 'New Artist', playCount: 10, firstPlayDate: Date.now() },
    ],
    peakListeningDay: { date: '2024-06-15', scrobbleCount: 45 },
    peakListeningHour: { hour: 21, scrobbleCount: 800 },
    longestStreak: { days: 30, startDate: '2024-03-01', endDate: '2024-03-30' },
    heatmapData: [
      { date: '2024-01-01', count: 10 },
      { date: '2024-01-02', count: 15 },
    ],
    ...overrides,
  };
}

describe('WrappedSlide', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders children within slide container', () => {
    render(
      <WrappedSlide>
        <span>Test Content</span>
      </WrappedSlide>
    );
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('applies additional className', () => {
    const { container } = render(
      <WrappedSlide className='custom-class'>
        <span>Content</span>
      </WrappedSlide>
    );
    const slide = container.querySelector('.wrapped-slide');
    expect(slide).toHaveClass('custom-class');
  });

  it('applies default empty className when none provided', () => {
    const { container } = render(
      <WrappedSlide>
        <span>Content</span>
      </WrappedSlide>
    );
    const slide = container.querySelector('.wrapped-slide');
    expect(slide).toBeInTheDocument();
  });
});

describe('TotalScrobblesSlide', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('displays total scrobbles formatted', () => {
    render(<TotalScrobblesSlide stats={createBaseStats()} />);

    expect(screen.getByText('5,000')).toBeInTheDocument();
    expect(screen.getByText('tracks')).toBeInTheDocument();
  });

  it('displays estimated listening hours', () => {
    render(<TotalScrobblesSlide stats={createBaseStats()} />);

    expect(screen.getByText(/416 hours/)).toBeInTheDocument();
  });

  it('formats large numbers with commas', () => {
    render(
      <TotalScrobblesSlide
        stats={createBaseStats({
          totalScrobbles: 1234567,
          estimatedListeningHours: 10000,
        })}
      />
    );

    expect(screen.getByText('1,234,567')).toBeInTheDocument();
    expect(screen.getByText(/10,000 hours/)).toBeInTheDocument();
  });
});

describe('TopArtistsSlide', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders artist names and play counts', () => {
    const artists: WrappedTopItem[] = [
      { name: 'Radiohead', artist: 'Radiohead', playCount: 300 },
      { name: 'The Beatles', artist: 'The Beatles', playCount: 250 },
    ];
    render(<TopArtistsSlide artists={artists} />);

    expect(screen.getByText('Your Top Artists')).toBeInTheDocument();
    expect(screen.getByText('Radiohead')).toBeInTheDocument();
    expect(screen.getByText('300 plays')).toBeInTheDocument();
    expect(screen.getByText('The Beatles')).toBeInTheDocument();
    expect(screen.getByText('250 plays')).toBeInTheDocument();
  });

  it('returns null for empty artists array', () => {
    const { container } = render(<TopArtistsSlide artists={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows placeholder when artist has no image', () => {
    const artists: WrappedTopItem[] = [
      { name: 'Radiohead', artist: 'Radiohead', playCount: 300 },
    ];
    render(<TopArtistsSlide artists={artists} />);

    const placeholder = document.querySelector('.wrapped-rank-placeholder');
    expect(placeholder).toBeInTheDocument();
  });

  it('shows image when artist has imageUrl', () => {
    const artists: WrappedTopItem[] = [
      {
        name: 'Radiohead',
        artist: 'Radiohead',
        playCount: 300,
        imageUrl: 'https://example.com/img.jpg',
      },
    ];
    render(<TopArtistsSlide artists={artists} />);

    const img = screen.getByAltText('Radiohead');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/img.jpg');
  });

  it('renders rank numbers starting at 1', () => {
    const artists: WrappedTopItem[] = [
      { name: 'A', artist: 'A', playCount: 100 },
      { name: 'B', artist: 'B', playCount: 50 },
    ];
    render(<TopArtistsSlide artists={artists} />);

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});

describe('TopAlbumsSlide', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders album names with artists', () => {
    const albums: WrappedTopItem[] = [
      {
        name: 'OK Computer',
        artist: 'Radiohead',
        album: 'OK Computer',
        playCount: 80,
      },
    ];
    render(<TopAlbumsSlide albums={albums} />);

    expect(screen.getByText('Your Top Albums')).toBeInTheDocument();
    expect(screen.getByText('Radiohead')).toBeInTheDocument();
    expect(screen.getByText('OK Computer')).toBeInTheDocument();
    expect(screen.getByText('80 plays')).toBeInTheDocument();
  });

  it('returns null for empty albums array', () => {
    const { container } = render(<TopAlbumsSlide albums={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows placeholder when album has no image', () => {
    const albums: WrappedTopItem[] = [
      {
        name: 'OK Computer',
        artist: 'Radiohead',
        album: 'OK Computer',
        playCount: 80,
      },
    ];
    render(<TopAlbumsSlide albums={albums} />);

    const placeholder = document.querySelector('.wrapped-rank-placeholder');
    expect(placeholder).toBeInTheDocument();
  });

  it('shows image when album has imageUrl', () => {
    const albums: WrappedTopItem[] = [
      {
        name: 'OK Computer',
        artist: 'Radiohead',
        album: 'OK Computer',
        playCount: 80,
        imageUrl: 'https://example.com/ok.jpg',
      },
    ];
    render(<TopAlbumsSlide albums={albums} />);

    const img = screen.getByAltText('OK Computer');
    expect(img).toHaveAttribute('src', 'https://example.com/ok.jpg');
  });
});

describe('TopTracksSlide', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders track names with artists', () => {
    const tracks: WrappedTopItem[] = [
      {
        name: 'Paranoid Android',
        artist: 'Radiohead',
        album: 'OK Computer',
        playCount: 30,
      },
    ];
    render(<TopTracksSlide tracks={tracks} />);

    expect(screen.getByText('Your Top Tracks')).toBeInTheDocument();
    expect(screen.getByText('Paranoid Android')).toBeInTheDocument();
    expect(screen.getByText('Radiohead')).toBeInTheDocument();
    expect(screen.getByText('30 plays')).toBeInTheDocument();
  });

  it('returns null for empty tracks array', () => {
    const { container } = render(<TopTracksSlide tracks={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders multiple tracks with rank numbers', () => {
    const tracks: WrappedTopItem[] = [
      { name: 'Track A', artist: 'Artist A', playCount: 50 },
      { name: 'Track B', artist: 'Artist B', playCount: 30 },
      { name: 'Track C', artist: 'Artist C', playCount: 10 },
    ];
    render(<TopTracksSlide tracks={tracks} />);

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});

describe('UniqueCountsSlide', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('displays unique artist and album counts', () => {
    render(<UniqueCountsSlide stats={createBaseStats()} />);

    expect(screen.getByText('Your Musical Breadth')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('350')).toBeInTheDocument();
    expect(screen.getByText('Different Artists')).toBeInTheDocument();
    expect(screen.getByText('Different Albums')).toBeInTheDocument();
  });

  it('formats large numbers with commas', () => {
    render(
      <UniqueCountsSlide
        stats={createBaseStats({ uniqueArtists: 1500, uniqueAlbums: 3000 })}
      />
    );

    expect(screen.getByText('1,500')).toBeInTheDocument();
    expect(screen.getByText('3,000')).toBeInTheDocument();
  });
});

describe('NewArtistsSlide', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('displays new artist discovery count', () => {
    render(<NewArtistsSlide stats={createBaseStats()} />);

    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('new artists')).toBeInTheDocument();
  });

  it('shows empty state when no new artists', () => {
    render(
      <NewArtistsSlide
        stats={createBaseStats({ newArtistsDiscovered: 0, newArtistsList: [] })}
      />
    );

    expect(screen.getByText('New Discoveries')).toBeInTheDocument();
    expect(screen.getByText(/stuck with your favorites/)).toBeInTheDocument();
  });

  it('renders list of new artists', () => {
    const stats = createBaseStats({
      newArtistsList: [
        { name: 'New Band', playCount: 20, firstPlayDate: Date.now() },
        { name: 'Another One', playCount: 5, firstPlayDate: Date.now() },
      ],
    });
    render(<NewArtistsSlide stats={stats} />);

    expect(screen.getByText('New Band')).toBeInTheDocument();
    expect(screen.getByText('20 plays')).toBeInTheDocument();
    expect(screen.getByText('Another One')).toBeInTheDocument();
  });

  it('limits displayed artists to 5', () => {
    const artists = Array.from({ length: 10 }, (_, i) => ({
      name: `Artist ${i}`,
      playCount: 10 - i,
      firstPlayDate: Date.now(),
    }));
    const stats = createBaseStats({
      newArtistsDiscovered: 10,
      newArtistsList: artists,
    });
    render(<NewArtistsSlide stats={stats} />);

    // Only first 5 should be shown
    expect(screen.getByText('Artist 0')).toBeInTheDocument();
    expect(screen.getByText('Artist 4')).toBeInTheDocument();
    expect(screen.queryByText('Artist 5')).not.toBeInTheDocument();
  });

  it('shows placeholder for artists without images', () => {
    render(<NewArtistsSlide stats={createBaseStats()} />);

    const placeholder = document.querySelector('.wrapped-rank-placeholder');
    expect(placeholder).toBeInTheDocument();
  });

  it('shows image for artist with imageUrl', () => {
    const stats = createBaseStats({
      newArtistsList: [
        {
          name: 'New Band',
          playCount: 10,
          firstPlayDate: Date.now(),
          imageUrl: 'https://example.com/new.jpg',
        },
      ],
    });
    render(<NewArtistsSlide stats={stats} />);

    const img = screen.getByAltText('New Band');
    expect(img).toHaveAttribute('src', 'https://example.com/new.jpg');
  });

  it('handles count > 0 but empty list gracefully', () => {
    const stats = createBaseStats({
      newArtistsDiscovered: 5,
      newArtistsList: [],
    });
    render(<NewArtistsSlide stats={stats} />);

    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('new artists')).toBeInTheDocument();
  });
});

describe('PeakDaySlide', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('displays peak day with scrobble count', () => {
    render(<PeakDaySlide stats={createBaseStats()} />);

    expect(screen.getByText('45')).toBeInTheDocument();
    expect(screen.getByText('tracks played')).toBeInTheDocument();
  });

  it('shows empty state when no peak day data', () => {
    render(
      <PeakDaySlide
        stats={createBaseStats({ peakListeningDay: undefined as never })}
      />
    );

    expect(screen.getByText('Peak Listening Day')).toBeInTheDocument();
    expect(screen.getByText(/Not enough data/)).toBeInTheDocument();
  });
});

describe('PeakHourSlide', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('displays peak hour in 12-hour format for PM', () => {
    render(
      <PeakHourSlide
        stats={createBaseStats({
          peakListeningHour: { hour: 21, scrobbleCount: 800 },
        })}
      />
    );

    expect(screen.getByText('9 PM')).toBeInTheDocument();
    expect(screen.getByText(/800 total plays/)).toBeInTheDocument();
  });

  it('displays midnight as 12 AM', () => {
    render(
      <PeakHourSlide
        stats={createBaseStats({
          peakListeningHour: { hour: 0, scrobbleCount: 100 },
        })}
      />
    );

    expect(screen.getByText('12 AM')).toBeInTheDocument();
  });

  it('displays noon as 12 PM', () => {
    render(
      <PeakHourSlide
        stats={createBaseStats({
          peakListeningHour: { hour: 12, scrobbleCount: 100 },
        })}
      />
    );

    expect(screen.getByText('12 PM')).toBeInTheDocument();
  });

  it('displays morning hours with AM', () => {
    render(
      <PeakHourSlide
        stats={createBaseStats({
          peakListeningHour: { hour: 9, scrobbleCount: 100 },
        })}
      />
    );

    expect(screen.getByText('9 AM')).toBeInTheDocument();
  });

  it('shows morning listener label for morning hour', () => {
    render(
      <PeakHourSlide
        stats={createBaseStats({
          peakListeningHour: { hour: 8, scrobbleCount: 100 },
        })}
      />
    );

    expect(screen.getByText(/a morning listener/)).toBeInTheDocument();
  });

  it('shows afternoon listener label', () => {
    render(
      <PeakHourSlide
        stats={createBaseStats({
          peakListeningHour: { hour: 14, scrobbleCount: 100 },
        })}
      />
    );

    expect(screen.getByText(/an afternoon listener/)).toBeInTheDocument();
  });

  it('shows evening listener label', () => {
    render(
      <PeakHourSlide
        stats={createBaseStats({
          peakListeningHour: { hour: 19, scrobbleCount: 100 },
        })}
      />
    );

    expect(screen.getByText(/an evening listener/)).toBeInTheDocument();
  });

  it('shows late-night listener label', () => {
    render(
      <PeakHourSlide
        stats={createBaseStats({
          peakListeningHour: { hour: 2, scrobbleCount: 100 },
        })}
      />
    );

    expect(screen.getByText(/a late-night listener/)).toBeInTheDocument();
  });

  it('shows empty state when no peak hour data', () => {
    render(
      <PeakHourSlide
        stats={createBaseStats({ peakListeningHour: undefined as never })}
      />
    );

    expect(screen.getByText('Peak Listening Hour')).toBeInTheDocument();
    expect(screen.getByText(/Not enough data/)).toBeInTheDocument();
  });
});

describe('StreakSlide', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('displays streak days and date range', () => {
    render(<StreakSlide stats={createBaseStats()} />);

    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('consecutive days')).toBeInTheDocument();
  });

  it('shows empty state for no streak', () => {
    render(
      <StreakSlide
        stats={createBaseStats({ longestStreak: undefined as never })}
      />
    );

    expect(screen.getByText('Listening Streak')).toBeInTheDocument();
    expect(
      screen.getByText(/No multi-day listening streak/)
    ).toBeInTheDocument();
  });

  it('shows empty state for 1-day streak', () => {
    render(
      <StreakSlide
        stats={createBaseStats({
          longestStreak: {
            days: 1,
            startDate: '2024-03-01',
            endDate: '2024-03-01',
          },
        })}
      />
    );

    expect(
      screen.getByText(/No multi-day listening streak/)
    ).toBeInTheDocument();
  });
});

describe('HeatmapSlide', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders CalendarHeatmap with correct year', () => {
    render(
      <HeatmapSlide
        stats={createBaseStats()}
        startDate={new Date('2024-01-01').getTime()}
        endDate={new Date('2024-12-31').getTime()}
      />
    );

    expect(screen.getByText('Listening Activity')).toBeInTheDocument();
    expect(screen.getByTestId('calendar-heatmap')).toBeInTheDocument();
    expect(screen.getByText('Heatmap 2024')).toBeInTheDocument();
  });

  it('uses end year when range spans two years', () => {
    render(
      <HeatmapSlide
        stats={createBaseStats()}
        startDate={new Date('2023-06-01').getTime()}
        endDate={new Date('2024-05-31').getTime()}
      />
    );

    expect(screen.getByText('Heatmap 2024')).toBeInTheDocument();
  });

  it('shows empty state when no heatmap data', () => {
    render(
      <HeatmapSlide
        stats={createBaseStats({ heatmapData: [] })}
        startDate={new Date('2024-01-01').getTime()}
        endDate={new Date('2024-12-31').getTime()}
      />
    );

    expect(screen.getByText(/No listening activity data/)).toBeInTheDocument();
  });
});

describe('RecordsAddedSlide', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseCollection: WrappedCollectionStats = {
    recordsAdded: 20,
    recordsList: [
      {
        artist: 'Radiohead',
        title: 'OK Computer',
        dateAdded: Date.now(),
        year: 1997,
      },
    ],
    mostPlayedNewAddition: null,
  };

  it('displays record count', () => {
    render(<RecordsAddedSlide collection={baseCollection} />);

    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('records to your collection')).toBeInTheDocument();
  });

  it('shows empty state when no records added', () => {
    render(
      <RecordsAddedSlide
        collection={{ ...baseCollection, recordsAdded: 0, recordsList: [] }}
      />
    );

    expect(screen.getByText('Collection Growth')).toBeInTheDocument();
    expect(screen.getByText(/No new records added/)).toBeInTheDocument();
  });

  it('shows cover placeholders when no cover URL', () => {
    render(<RecordsAddedSlide collection={baseCollection} />);

    const placeholder = document.querySelector('.wrapped-cover-placeholder');
    expect(placeholder).toBeInTheDocument();
  });

  it('shows cover image when available', () => {
    render(
      <RecordsAddedSlide
        collection={{
          ...baseCollection,
          recordsList: [
            {
              artist: 'Radiohead',
              title: 'OK Computer',
              dateAdded: Date.now(),
              year: 1997,
              coverUrl: 'https://example.com/cover.jpg',
            },
          ],
        }}
      />
    );

    const img = screen.getByAltText('Radiohead - OK Computer');
    expect(img).toHaveAttribute('src', 'https://example.com/cover.jpg');
  });

  it('shows "+N more" when more than 10 records', () => {
    const records = Array.from({ length: 11 }, (_, i) => ({
      artist: `Artist ${i}`,
      title: `Album ${i}`,
      dateAdded: Date.now(),
      year: 2024,
    }));
    render(
      <RecordsAddedSlide
        collection={{
          ...baseCollection,
          recordsAdded: 15,
          recordsList: records,
        }}
      />
    );

    expect(screen.getByText('+5 more')).toBeInTheDocument();
  });

  it('does not show "+N more" when exactly 10 records', () => {
    const records = Array.from({ length: 10 }, (_, i) => ({
      artist: `Artist ${i}`,
      title: `Album ${i}`,
      dateAdded: Date.now(),
      year: 2024,
    }));
    render(
      <RecordsAddedSlide
        collection={{
          ...baseCollection,
          recordsAdded: 10,
          recordsList: records,
        }}
      />
    );

    expect(screen.queryByText(/more/)).not.toBeInTheDocument();
  });
});

describe('MostPlayedAdditionSlide', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseCollection: WrappedCollectionStats = {
    recordsAdded: 5,
    recordsList: [],
    mostPlayedNewAddition: {
      artist: 'Radiohead',
      title: 'OK Computer',
      dateAdded: new Date('2024-02-01').getTime(),
      playCount: 80,
    },
  };

  it('displays most played addition details', () => {
    render(<MostPlayedAdditionSlide collection={baseCollection} />);

    expect(screen.getByText('Radiohead')).toBeInTheDocument();
    expect(screen.getByText('OK Computer')).toBeInTheDocument();
    expect(screen.getByText(/80 plays since/)).toBeInTheDocument();
  });

  it('shows empty state when no most played addition', () => {
    render(
      <MostPlayedAdditionSlide
        collection={{ ...baseCollection, mostPlayedNewAddition: null }}
      />
    );

    expect(screen.getByText('Most-Played Addition')).toBeInTheDocument();
    expect(
      screen.getByText(/No new additions were played/)
    ).toBeInTheDocument();
  });

  it('shows placeholder when no cover image', () => {
    render(<MostPlayedAdditionSlide collection={baseCollection} />);

    const placeholder = document.querySelector('.wrapped-cover-placeholder');
    expect(placeholder).toBeInTheDocument();
  });

  it('shows cover image when available', () => {
    render(
      <MostPlayedAdditionSlide
        collection={{
          ...baseCollection,
          mostPlayedNewAddition: {
            ...baseCollection.mostPlayedNewAddition!,
            coverUrl: 'https://example.com/cover.jpg',
          },
        }}
      />
    );

    const img = screen.getByAltText('Radiohead - OK Computer');
    expect(img).toHaveAttribute('src', 'https://example.com/cover.jpg');
  });
});

describe('CollectionCoverageSlide', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseCrossSource: WrappedCrossSourceStats = {
    collectionCoverage: 65,
    totalCollectionSize: 200,
    albumsPlayed: 130,
    vinylScrobbles: 2000,
    otherScrobbles: 3000,
    vinylPercentage: 40,
  };

  it('displays collection coverage percentage', () => {
    render(<CollectionCoverageSlide crossSource={baseCrossSource} />);

    expect(screen.getByText('65%')).toBeInTheDocument();
    expect(screen.getByText(/130 of 200 albums played/)).toBeInTheDocument();
  });

  it('renders a progress bar', () => {
    render(<CollectionCoverageSlide crossSource={baseCrossSource} />);

    expect(screen.getByTestId('progress-bar')).toBeInTheDocument();
  });

  it('handles 0% coverage', () => {
    render(
      <CollectionCoverageSlide
        crossSource={{
          ...baseCrossSource,
          collectionCoverage: 0,
          albumsPlayed: 0,
        }}
      />
    );

    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('handles 100% coverage', () => {
    render(
      <CollectionCoverageSlide
        crossSource={{
          ...baseCrossSource,
          collectionCoverage: 100,
          albumsPlayed: 200,
        }}
      />
    );

    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});

describe('VinylVsDigitalSlide', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseCrossSource: WrappedCrossSourceStats = {
    collectionCoverage: 65,
    totalCollectionSize: 200,
    albumsPlayed: 130,
    vinylScrobbles: 2000,
    otherScrobbles: 3000,
    vinylPercentage: 40,
  };

  it('displays vinyl vs digital breakdown', () => {
    render(<VinylVsDigitalSlide crossSource={baseCrossSource} />);

    expect(screen.getByText('Vinyl vs Digital')).toBeInTheDocument();
    expect(screen.getByText(/2,000/)).toBeInTheDocument();
    expect(screen.getByText(/40%/)).toBeInTheDocument();
    expect(screen.getByText(/3,000/)).toBeInTheDocument();
    expect(screen.getByText(/60%/)).toBeInTheDocument();
  });

  it('shows empty state when total scrobbles is 0', () => {
    render(
      <VinylVsDigitalSlide
        crossSource={{
          ...baseCrossSource,
          vinylScrobbles: 0,
          otherScrobbles: 0,
          vinylPercentage: 0,
        }}
      />
    );

    expect(screen.getByText('Vinyl vs Digital')).toBeInTheDocument();
    expect(screen.getByText(/No source data available/)).toBeInTheDocument();
  });

  it('handles 100% vinyl', () => {
    render(
      <VinylVsDigitalSlide
        crossSource={{
          ...baseCrossSource,
          vinylScrobbles: 5000,
          otherScrobbles: 0,
          vinylPercentage: 100,
        }}
      />
    );

    expect(screen.getByText(/5,000/)).toBeInTheDocument();
    expect(screen.getByText(/100%/)).toBeInTheDocument();
  });
});
