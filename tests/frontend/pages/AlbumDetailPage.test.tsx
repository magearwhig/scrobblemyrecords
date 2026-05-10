import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import '@testing-library/jest-dom';
import AlbumDetailPage from '../../../src/renderer/pages/AlbumDetailPage';
import { statsApi } from '../../../src/renderer/services/statsApi';
import { AlbumDetailResponse } from '../../../src/shared/types';

// Mock recharts to avoid rendering issues in jsdom (used by AlbumListeningArc)
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='responsive-container'>{children}</div>
  ),
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='area-chart'>{children}</div>
  ),
  Area: () => <div data-testid='area' />,
  XAxis: () => <div data-testid='x-axis' />,
  YAxis: () => <div data-testid='y-axis' />,
  CartesianGrid: () => <div data-testid='cartesian-grid' />,
  Tooltip: () => <div data-testid='tooltip' />,
}));

// Mock statsApi (both methods that the page transitively uses)
jest.mock('../../../src/renderer/services/statsApi', () => ({
  statsApi: {
    getAlbumDetail: jest.fn(),
    getAlbumListeningArc: jest.fn(),
  },
  imagesApi: {},
}));

// Mock spotifyUtils so the Play button doesn't try to open URIs in jsdom
jest.mock('../../../src/renderer/utils/spotifyUtils', () => ({
  playAlbumOnSpotify: jest.fn(),
  playTrackOnSpotify: jest.fn(),
}));

const mockStatsApi = statsApi as jest.Mocked<typeof statsApi>;

const baseAlbumData: AlbumDetailResponse = {
  artist: 'Radiohead',
  album: 'Kid A',
  playCount: 312,
  firstPlayed: 1553040000,
  lastPlayed: 1706745600,
  tracks: [
    {
      track: 'Everything In Its Right Place',
      playCount: 87,
      lastPlayed: 1706745600,
    },
    { track: 'Kid A', playCount: 64, lastPlayed: 1706659200 },
    { track: 'Idioteque', playCount: 52, lastPlayed: 1706572800 },
  ],
  arc: [
    { period: '2024-01', playCount: 35, trackCount: 4 },
    { period: '2024-02', playCount: 42, trackCount: 5 },
  ],
  inCollection: false,
  mappings: {},
};

const setSelectedAlbum = (
  value: { artist: string; album: string } | string | null
) => {
  (localStorage.getItem as jest.Mock).mockImplementation((key: string) => {
    if (key !== 'selectedAlbum') return null;
    if (value === null) return null;
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  });
};

describe('AlbumDetailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setSelectedAlbum({ artist: 'Radiohead', album: 'Kid A' });
    mockStatsApi.getAlbumDetail.mockResolvedValue({
      success: true,
      data: baseAlbumData,
    });
    // AlbumListeningArc fetches its own data — keep it from rejecting noisily.
    mockStatsApi.getAlbumListeningArc.mockResolvedValue({
      success: true,
      data: baseAlbumData.arc,
    });
    // Reset hash so each test starts clean.
    window.location.hash = '';
  });

  afterEach(() => {
    (localStorage.getItem as jest.Mock).mockReset();
    window.location.hash = '';
  });

  // -------------------------------------------------------------- loading

  it('renders skeleton/back-button while loading', () => {
    mockStatsApi.getAlbumDetail.mockReturnValue(new Promise(() => {}));
    render(<AlbumDetailPage />);
    expect(
      screen.getByRole('button', { name: /back to stats/i })
    ).toBeInTheDocument();
    // Album title not yet rendered
    expect(screen.queryByText('Kid A')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------- happy path

  it('renders album, artist, scrobble count, and tracks on success', async () => {
    render(<AlbumDetailPage />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Kid A' })
      ).toBeInTheDocument();
    });

    // ArtistLink renders with an aria-label 'View artist details for ...'
    expect(
      screen.getByRole('link', { name: /view artist details for radiohead/i })
    ).toBeInTheDocument();

    expect(screen.getByText(/312 scrobbles/)).toBeInTheDocument();

    // Tracks list — TrackLink wraps each title
    expect(
      screen.getByRole('link', {
        name: /view track details for everything in its right place/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /view track details for idioteque/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/87 plays/)).toBeInTheDocument();
    expect(screen.getByText(/52 plays/)).toBeInTheDocument();
  });

  it('pluralises "scrobble" correctly when playCount is 1', async () => {
    mockStatsApi.getAlbumDetail.mockResolvedValue({
      success: true,
      data: { ...baseAlbumData, playCount: 1 },
    });
    render(<AlbumDetailPage />);
    // Match "1 scrobble" *not* followed by an "s" — guards against the
    // "1 scrobbles" pluralization regression.
    await waitFor(() => {
      expect(screen.getByText(/^1 scrobble(\s|$|[^s])/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/1 scrobbles/)).not.toBeInTheDocument();
  });

  it('calls statsApi.getAlbumDetail with the correct artist + album', async () => {
    render(<AlbumDetailPage />);
    await waitFor(() => {
      expect(mockStatsApi.getAlbumDetail).toHaveBeenCalledWith(
        'Radiohead',
        'Kid A'
      );
    });
  });

  it('renders the listening arc section', async () => {
    render(<AlbumDetailPage />);
    await waitFor(() => {
      expect(
        screen.getByRole('region', { name: /listening arc over time/i })
      ).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------- empty / malformed

  it('renders empty state when selectedAlbum is missing', async () => {
    setSelectedAlbum(null);
    render(<AlbumDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('No album selected')).toBeInTheDocument();
    });
    expect(mockStatsApi.getAlbumDetail).not.toHaveBeenCalled();
  });

  it('renders empty state when selectedAlbum is malformed JSON', async () => {
    setSelectedAlbum('not-json');
    render(<AlbumDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('No album selected')).toBeInTheDocument();
    });
    expect(mockStatsApi.getAlbumDetail).not.toHaveBeenCalled();
  });

  it('renders empty state when selectedAlbum is missing required fields', async () => {
    // Object that parses fine but lacks .artist
    (localStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      key === 'selectedAlbum' ? JSON.stringify({ album: 'Kid A' }) : null
    );
    render(<AlbumDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('No album selected')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------- error path

  it('renders error state when API returns success: false', async () => {
    mockStatsApi.getAlbumDetail.mockResolvedValue({
      success: false,
      error: 'Server exploded',
    });
    render(<AlbumDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Could not load album')).toBeInTheDocument();
      expect(screen.getByText('Server exploded')).toBeInTheDocument();
    });
  });

  it('renders error state when API throws', async () => {
    mockStatsApi.getAlbumDetail.mockRejectedValue(new Error('Network down'));
    render(<AlbumDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Could not load album')).toBeInTheDocument();
      expect(screen.getByText('Network down')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------- collection / nav

  it('does not render "View in Collection" when inCollection is false', async () => {
    render(<AlbumDetailPage />);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Kid A' })
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: /view in collection/i })
    ).not.toBeInTheDocument();
  });

  it('prefers collectionArtist for visible casing when in collection', async () => {
    // Mirrors the resolver behaviour where data.artist is a lowercased
    // canonical key but data.collectionArtist is the proper-cased Discogs
    // name. The H1-area artist link should show the cased version.
    mockStatsApi.getAlbumDetail.mockResolvedValue({
      success: true,
      data: {
        ...baseAlbumData,
        artist: 'ted leo / pharmacists',
        album: 'Hearts of Oak',
        inCollection: true,
        collectionReleaseId: 4242,
        collectionArtist: 'Ted Leo / Pharmacists',
        collectionAlbum: 'Hearts of Oak',
      },
    });
    render(<AlbumDetailPage />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Hearts of Oak' })
      ).toBeInTheDocument();
    });

    // Visible H1-area artist link uses the cased name
    expect(
      screen.getByRole('link', {
        name: /view artist details for ted leo \/ pharmacists/i,
      })
    ).toBeInTheDocument();

    // Lowercased name should not appear as a visible artist link
    const lowercasedLink = screen.queryByRole('link', {
      name: 'View artist details for ted leo / pharmacists',
    });
    // The matcher is case-insensitive above; here we check the literal text
    // content of links, which should be the cased version, not the lowercased one.
    expect(lowercasedLink?.textContent).not.toBe('ted leo / pharmacists');
  });

  it('falls back to data.artist for display when not in collection', async () => {
    // Without a collectionArtist override, the canonical artist key is what
    // we have to display. (Resolver gives back whatever it has.)
    mockStatsApi.getAlbumDetail.mockResolvedValue({
      success: true,
      data: {
        ...baseAlbumData,
        artist: 'Some Artist',
        inCollection: false,
      },
    });
    render(<AlbumDetailPage />);
    await waitFor(() => {
      expect(
        screen.getByRole('link', {
          name: /view artist details for some artist/i,
        })
      ).toBeInTheDocument();
    });
  });

  it('renders "View in Collection" when inCollection is true with a release id', async () => {
    mockStatsApi.getAlbumDetail.mockResolvedValue({
      success: true,
      data: {
        ...baseAlbumData,
        inCollection: true,
        collectionReleaseId: 12345,
        collectionArtist: 'Radiohead',
        collectionAlbum: 'Kid A',
      },
    });
    render(<AlbumDetailPage />);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /^view in collection$/i })
      ).toBeInTheDocument();
    });
    // The mapping card also shows a "View Release Details" button
    expect(
      screen.getByRole('button', { name: /view release details/i })
    ).toBeInTheDocument();
  });

  it('back button navigates to the ?from= page', async () => {
    window.location.hash = '#album?from=history';
    const user = userEvent.setup();
    render(<AlbumDetailPage />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Kid A' })
      ).toBeInTheDocument();
    });

    const back = screen.getByRole('button', { name: /back to history/i });
    await user.click(back);
    expect(window.location.hash).toBe('#history');
  });

  it('back button defaults to #stats when no ?from= is present', async () => {
    const user = userEvent.setup();
    render(<AlbumDetailPage />);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Kid A' })
      ).toBeInTheDocument();
    });
    const back = screen.getByRole('button', { name: /back to stats/i });
    await user.click(back);
    expect(window.location.hash).toBe('#stats');
  });

  // -------------------------------------------------------------- mappings

  it('renders no mapping cards when mappings object is empty', async () => {
    render(<AlbumDetailPage />);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Kid A' })
      ).toBeInTheDocument();
    });
    expect(screen.queryByText('Album Mapping')).not.toBeInTheDocument();
    expect(screen.queryByText('Artist Mapping')).not.toBeInTheDocument();
    expect(screen.queryByText('Compound Artist')).not.toBeInTheDocument();
    expect(screen.queryByText('Album Aliases')).not.toBeInTheDocument();
    // With no mappings + not in collection, we render a friendly fallback card
    expect(
      screen.getByText(/no special mappings or collection link/i)
    ).toBeInTheDocument();
  });

  it('renders only the album mapping card when only that mapping exists', async () => {
    mockStatsApi.getAlbumDetail.mockResolvedValue({
      success: true,
      data: {
        ...baseAlbumData,
        mappings: {
          albumMapping: {
            historyArtist: 'Radiohead',
            historyAlbum: 'kid a',
            collectionArtist: 'Radiohead',
            collectionAlbum: 'Kid A',
          },
        },
      },
    });
    render(<AlbumDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Album Mapping')).toBeInTheDocument();
    });
    expect(screen.queryByText('Artist Mapping')).not.toBeInTheDocument();
    expect(screen.queryByText('Compound Artist')).not.toBeInTheDocument();
  });

  it('renders only the artist mapping card when only that mapping exists', async () => {
    mockStatsApi.getAlbumDetail.mockResolvedValue({
      success: true,
      data: {
        ...baseAlbumData,
        mappings: {
          artistMapping: {
            discogsName: 'Danny Brown (2)',
            lastfmName: 'Danny Brown',
          },
        },
      },
    });
    render(<AlbumDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Artist Mapping')).toBeInTheDocument();
    });
    expect(screen.getByText('Danny Brown (2)')).toBeInTheDocument();
    expect(screen.getByText('Danny Brown')).toBeInTheDocument();
    expect(screen.queryByText('Album Mapping')).not.toBeInTheDocument();
  });

  it('renders only the compound artist card when only that mapping exists', async () => {
    mockStatsApi.getAlbumDetail.mockResolvedValue({
      success: true,
      data: {
        ...baseAlbumData,
        mappings: {
          compoundArtist: {
            compoundName: 'Danny Brown & Jane Remover',
            components: ['Danny Brown', 'Jane Remover'],
          },
        },
      },
    });
    render(<AlbumDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Compound Artist')).toBeInTheDocument();
    });
    // Each component renders as a clickable ArtistLink
    expect(
      screen.getByRole('link', { name: /view artist details for danny brown/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: /view artist details for jane remover/i,
      })
    ).toBeInTheDocument();
  });

  it('renders all mapping cards when all are present', async () => {
    mockStatsApi.getAlbumDetail.mockResolvedValue({
      success: true,
      data: {
        ...baseAlbumData,
        inCollection: true,
        collectionReleaseId: 999,
        collectionArtist: 'Danny Brown',
        collectionAlbum: 'XXX',
        mappings: {
          albumMapping: {
            historyArtist: 'Danny Brown',
            historyAlbum: 'xxx',
            collectionArtist: 'Danny Brown',
            collectionAlbum: 'XXX',
          },
          artistMapping: {
            discogsName: 'Danny Brown (2)',
            lastfmName: 'Danny Brown',
          },
          compoundArtist: {
            compoundName: 'Danny Brown & Jane Remover',
            components: ['Danny Brown', 'Jane Remover'],
          },
        },
      },
    });
    render(<AlbumDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Album Mapping')).toBeInTheDocument();
    });
    expect(screen.getByText('Artist Mapping')).toBeInTheDocument();
    expect(screen.getByText('Compound Artist')).toBeInTheDocument();
    expect(screen.getByText('In Your Collection')).toBeInTheDocument();
  });

  // -------------------------------------------------------------- forward-compat

  it('renders no album-aliases card when albumAliases is undefined (forward-compat)', async () => {
    // baseAlbumData.mappings has no albumAliases key — guard against rendering
    render(<AlbumDetailPage />);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Kid A' })
      ).toBeInTheDocument();
    });
    expect(screen.queryByText('Album Aliases')).not.toBeInTheDocument();
  });

  it('renders an album-aliases card when albumAliases has entries', async () => {
    mockStatsApi.getAlbumDetail.mockResolvedValue({
      success: true,
      data: {
        ...baseAlbumData,
        mappings: {
          albumAliases: [
            {
              canonicalArtist: 'radiohead',
              canonicalAlbum: 'kid a',
              aliasArtist: 'Radiohead',
              aliasAlbum: 'Kid A (Deluxe)',
              autoDetected: false,
              createdAt: 0,
            },
          ],
        },
      },
    });
    render(<AlbumDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Album Aliases')).toBeInTheDocument();
    });
    expect(screen.getByText(/Kid A \(Deluxe\)/)).toBeInTheDocument();
  });

  // -------------------------------------------------------------- scale

  it('renders cleanly with a 100-track album', async () => {
    const longTracks = Array.from({ length: 100 }, (_, i) => ({
      track: `Track ${i + 1}`,
      playCount: 100 - i,
      lastPlayed: 1706745600 - i * 3600,
    }));
    mockStatsApi.getAlbumDetail.mockResolvedValue({
      success: true,
      data: { ...baseAlbumData, tracks: longTracks },
    });
    render(<AlbumDetailPage />);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Kid A' })
      ).toBeInTheDocument();
    });
    // First and last tracks both rendered — confirms layout doesn't truncate
    expect(
      screen.getByRole('link', { name: /view track details for track 1$/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /view track details for track 100$/i })
    ).toBeInTheDocument();
  });

  it('renders an empty arc gracefully', async () => {
    mockStatsApi.getAlbumDetail.mockResolvedValue({
      success: true,
      data: { ...baseAlbumData, arc: [] },
    });
    mockStatsApi.getAlbumListeningArc.mockResolvedValue({
      success: true,
      data: [],
    });
    render(<AlbumDetailPage />);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Kid A' })
      ).toBeInTheDocument();
    });
    // Page still renders — arc area shows its own empty state internally
    expect(
      screen.getByRole('region', { name: /listening arc over time/i })
    ).toBeInTheDocument();
  });
});
