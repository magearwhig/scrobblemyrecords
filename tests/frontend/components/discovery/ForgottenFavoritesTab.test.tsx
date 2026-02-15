import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import '@testing-library/jest-dom';
import ForgottenFavoritesTab from '../../../../src/renderer/components/discovery/ForgottenFavoritesTab';
import ApiService from '../../../../src/renderer/services/api';
import { ForgottenTrack } from '../../../../src/shared/types';

jest.mock('../../../../src/renderer/services/api');

jest.mock('../../../../src/renderer/utils/spotifyUtils', () => ({
  playTrackOnSpotify: jest.fn(),
}));

jest.mock('../../../../src/renderer/hooks/useCollectionLookup', () => ({
  lookupInCollection: jest.fn().mockReturnValue(undefined),
}));

jest.mock('../../../../src/renderer/components/ui/Modal', () => ({
  Modal: ({
    children,
    isOpen,
    title,
  }: {
    children: React.ReactNode;
    isOpen: boolean;
    title: string;
  }) =>
    isOpen ? (
      <div data-testid='modal'>
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
  ModalSection: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const makeTrack = (
  overrides: Partial<ForgottenTrack> = {}
): ForgottenTrack => ({
  artist: 'Test Artist',
  album: 'Test Album',
  track: 'Test Track',
  allTimePlayCount: 50,
  lastPlayed: Math.floor(Date.now() / 1000) - 200 * 86400,
  daysSincePlay: 200,
  ...overrides,
});

const createMockApi = (): jest.Mocked<ApiService> => {
  return {
    getTrackMappings: jest.fn().mockResolvedValue([]),
    getTrackHistoryPaginated: jest
      .fn()
      .mockResolvedValue({ items: [], total: 0, totalPages: 0, page: 1 }),
    createTrackMapping: jest.fn(),
  } as unknown as jest.Mocked<ApiService>;
};

describe('ForgottenFavoritesTab', () => {
  let user: ReturnType<typeof userEvent.setup>;
  let mockApi: jest.Mocked<ApiService>;
  const mockSetDormantDays = jest.fn();
  const mockSetMinPlays = jest.fn();
  const mockSetForgottenSort = jest.fn();
  const mockLoadForgottenFavorites = jest.fn();
  const mockFormatDate = jest.fn().mockReturnValue('2024-01-15');
  const mockOpenLink = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    user = userEvent.setup();
    mockApi = createMockApi();
  });

  const getDefaultProps = () => ({
    forgottenTracks: [] as ForgottenTrack[],
    forgottenLoading: false,
    forgottenError: null as string | null,
    forgottenTotalMatching: 0,
    dormantDays: 90,
    setDormantDays: mockSetDormantDays,
    minPlays: 10,
    setMinPlays: mockSetMinPlays,
    forgottenSort: 'plays' as const,
    setForgottenSort: mockSetForgottenSort,
    loadForgottenFavorites: mockLoadForgottenFavorites,
    formatDate: mockFormatDate,
    openLink: mockOpenLink,
    api: mockApi,
    collection: undefined,
  });

  it('renders the section header', () => {
    render(<ForgottenFavoritesTab {...getDefaultProps()} />);

    expect(screen.getByText('Forgotten Favorites')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(
      <ForgottenFavoritesTab {...getDefaultProps()} forgottenLoading={true} />
    );

    expect(
      screen.getByText('Finding your forgotten favorites...')
    ).toBeInTheDocument();
  });

  it('shows empty state when no tracks found', () => {
    render(<ForgottenFavoritesTab {...getDefaultProps()} />);

    expect(
      screen.getByText(/No forgotten favorites found/)
    ).toBeInTheDocument();
  });

  it('shows error message with retry button', async () => {
    render(
      <ForgottenFavoritesTab
        {...getDefaultProps()}
        forgottenError='Failed to load'
      />
    );

    expect(screen.getByText('Failed to load')).toBeInTheDocument();
    await user.click(screen.getByText('Retry'));
    expect(mockLoadForgottenFavorites).toHaveBeenCalled();
  });

  it('renders tracks when data is loaded', () => {
    const tracks = [
      makeTrack({ artist: 'Artist A', track: 'Song A', allTimePlayCount: 100 }),
      makeTrack({ artist: 'Artist B', track: 'Song B', allTimePlayCount: 50 }),
    ];

    render(
      <ForgottenFavoritesTab
        {...getDefaultProps()}
        forgottenTracks={tracks}
        forgottenTotalMatching={2}
      />
    );

    expect(screen.getByText('Song A')).toBeInTheDocument();
    expect(screen.getByText('Song B')).toBeInTheDocument();
    expect(screen.getByText('Artist A')).toBeInTheDocument();
    expect(screen.getByText('Artist B')).toBeInTheDocument();
  });

  it('shows track count summary', () => {
    const tracks = [makeTrack(), makeTrack({ track: 'Track 2' })];

    render(
      <ForgottenFavoritesTab
        {...getDefaultProps()}
        forgottenTracks={tracks}
        forgottenTotalMatching={10}
      />
    );

    expect(screen.getByText(/Showing 2 of 10/)).toBeInTheDocument();
  });

  it('shows play count for each track', () => {
    const tracks = [makeTrack({ allTimePlayCount: 75 })];

    render(
      <ForgottenFavoritesTab
        {...getDefaultProps()}
        forgottenTracks={tracks}
        forgottenTotalMatching={1}
      />
    );

    expect(screen.getByText('75 plays')).toBeInTheDocument();
  });

  it('formats dormancy as years for long periods', () => {
    const tracks = [makeTrack({ daysSincePlay: 730 })];

    render(
      <ForgottenFavoritesTab
        {...getDefaultProps()}
        forgottenTracks={tracks}
        forgottenTotalMatching={1}
      />
    );

    expect(screen.getByText('2 years ago')).toBeInTheDocument();
  });

  it('formats dormancy as months for medium periods', () => {
    const tracks = [makeTrack({ daysSincePlay: 90 })];

    render(
      <ForgottenFavoritesTab
        {...getDefaultProps()}
        forgottenTracks={tracks}
        forgottenTotalMatching={1}
      />
    );

    expect(screen.getByText('3 months ago')).toBeInTheDocument();
  });

  it('formats dormancy as days for short periods', () => {
    const tracks = [makeTrack({ daysSincePlay: 15 })];

    render(
      <ForgottenFavoritesTab
        {...getDefaultProps()}
        forgottenTracks={tracks}
        forgottenTotalMatching={1}
      />
    );

    expect(screen.getByText('15 days ago')).toBeInTheDocument();
  });

  it('shows album as (Single) when empty', () => {
    const tracks = [makeTrack({ album: '' })];

    render(
      <ForgottenFavoritesTab
        {...getDefaultProps()}
        forgottenTracks={tracks}
        forgottenTotalMatching={1}
      />
    );

    expect(screen.getByText(/\(Single\)/)).toBeInTheDocument();
  });

  it('renders dormant days filter with correct options', () => {
    render(<ForgottenFavoritesTab {...getDefaultProps()} />);

    const select = screen.getByLabelText('Dormant for:');
    expect(select).toHaveValue('90');
  });

  it('calls setDormantDays when dormant filter changes', async () => {
    render(<ForgottenFavoritesTab {...getDefaultProps()} />);

    await user.selectOptions(screen.getByLabelText('Dormant for:'), '365');

    expect(mockSetDormantDays).toHaveBeenCalledWith(365);
  });

  it('renders min plays filter with correct options', () => {
    render(<ForgottenFavoritesTab {...getDefaultProps()} />);

    const select = screen.getByLabelText('Min plays:');
    expect(select).toHaveValue('10');
  });

  it('calls setMinPlays when min plays filter changes', async () => {
    render(<ForgottenFavoritesTab {...getDefaultProps()} />);

    await user.selectOptions(screen.getByLabelText('Min plays:'), '50');

    expect(mockSetMinPlays).toHaveBeenCalledWith(50);
  });

  it('renders sort filter with correct options', () => {
    render(<ForgottenFavoritesTab {...getDefaultProps()} />);

    const select = screen.getByLabelText('Sort by:');
    expect(select).toHaveValue('plays');
  });

  it('calls setForgottenSort when sort changes', async () => {
    render(<ForgottenFavoritesTab {...getDefaultProps()} />);

    await user.selectOptions(screen.getByLabelText('Sort by:'), 'artist');

    expect(mockSetForgottenSort).toHaveBeenCalledWith('artist');
  });

  it('sorts tracks by plays descending', () => {
    const tracks = [
      makeTrack({ track: 'Low Plays', allTimePlayCount: 10 }),
      makeTrack({ track: 'High Plays', allTimePlayCount: 100 }),
    ];

    render(
      <ForgottenFavoritesTab
        {...getDefaultProps()}
        forgottenTracks={tracks}
        forgottenSort='plays'
        forgottenTotalMatching={2}
      />
    );

    const items = screen.getAllByText(/plays$/);
    expect(items[0]).toHaveTextContent('100 plays');
    expect(items[1]).toHaveTextContent('10 plays');
  });

  it('renders action buttons for each track', () => {
    const tracks = [makeTrack()];

    render(
      <ForgottenFavoritesTab
        {...getDefaultProps()}
        forgottenTracks={tracks}
        forgottenTotalMatching={1}
      />
    );

    expect(screen.getByText('Last.fm')).toBeInTheDocument();
    expect(screen.getByText('Copy')).toBeInTheDocument();
    expect(screen.getByText('Map')).toBeInTheDocument();
  });

  it('calls openLink when Last.fm button is clicked', async () => {
    const tracks = [makeTrack({ artist: 'My Artist', track: 'My Song' })];

    render(
      <ForgottenFavoritesTab
        {...getDefaultProps()}
        forgottenTracks={tracks}
        forgottenTotalMatching={1}
      />
    );

    await user.click(screen.getByText('Last.fm'));

    expect(mockOpenLink).toHaveBeenCalledWith(
      expect.stringContaining('last.fm/music/')
    );
  });

  it('renders Copy All and Export CSV buttons when tracks exist', () => {
    const tracks = [makeTrack()];

    render(
      <ForgottenFavoritesTab
        {...getDefaultProps()}
        forgottenTracks={tracks}
        forgottenTotalMatching={1}
      />
    );

    expect(screen.getByText('Copy All')).toBeInTheDocument();
    expect(screen.getByText('Export CSV')).toBeInTheDocument();
  });

  it('opens mapping modal when Map button is clicked', async () => {
    const tracks = [makeTrack({ track: 'Test Track' })];
    mockApi.getTrackHistoryPaginated.mockResolvedValue({
      items: [],
      total: 0,
      totalPages: 0,
      page: 1,
    });

    render(
      <ForgottenFavoritesTab
        {...getDefaultProps()}
        forgottenTracks={tracks}
        forgottenTotalMatching={1}
      />
    );

    await user.click(screen.getByText('Map'));

    await waitFor(() => {
      expect(screen.getByTestId('modal')).toBeInTheDocument();
      expect(screen.getByText('Map Track to Local Cache')).toBeInTheDocument();
    });
  });
});
