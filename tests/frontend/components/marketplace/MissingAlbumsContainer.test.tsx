import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import '@testing-library/jest-dom';
import MissingAlbumsContainer from '../../../../src/renderer/components/marketplace/MissingAlbumsContainer';
import { MissingAlbum } from '../../../../src/shared/types';

const mockGetMissingAlbums = jest.fn();
const mockGetLocalWantList = jest.fn();
const mockGetWishlist = jest.fn();
const mockHideAlbum = jest.fn();
const mockAddToLocalWantList = jest.fn();
const mockSearchCollection = jest.fn();
const mockCreateDiscoveryAlbumMapping = jest.fn();

jest.mock('../../../../src/renderer/services/api', () => ({
  getApiService: () => ({
    getMissingAlbums: mockGetMissingAlbums,
    getLocalWantList: mockGetLocalWantList,
    getWishlist: mockGetWishlist,
    hideAlbum: mockHideAlbum,
    addToLocalWantList: mockAddToLocalWantList,
    searchCollection: mockSearchCollection,
    createDiscoveryAlbumMapping: mockCreateDiscoveryAlbumMapping,
  }),
}));

jest.mock('../../../../src/renderer/context/AppContext', () => ({
  useApp: () => ({
    state: { serverUrl: 'http://localhost:3000' },
  }),
}));

jest.mock('../../../../src/renderer/context/AuthContext', () => ({
  useAuth: () => ({
    authStatus: {
      discogs: { username: 'testuser', connected: true },
      lastfm: { username: '', connected: false },
    },
  }),
}));

// Mock the child MissingAlbumsTab component
jest.mock(
  '../../../../src/renderer/components/discovery/MissingAlbumsTab',
  () => {
    return function MockMissingAlbumsTab(props: {
      missingAlbums: MissingAlbum[];
      albumSort: string;
      openAlbumMapping: (album: MissingAlbum) => void;
      handleMonitorAlbum: (album: MissingAlbum) => void;
      handleHideAlbum: (album: MissingAlbum) => void;
    }) {
      return (
        <div data-testid='missing-albums-tab'>
          <span>{props.missingAlbums.length} missing albums</span>
          <span>Sort: {props.albumSort}</span>
          {props.missingAlbums.map(album => (
            <div
              key={`${album.artist}-${album.album}`}
              data-testid='album-item'
            >
              <span>
                {album.artist} - {album.album}
              </span>
              <button onClick={() => props.handleHideAlbum(album)}>Hide</button>
              <button onClick={() => props.handleMonitorAlbum(album)}>
                Monitor
              </button>
              <button onClick={() => props.openAlbumMapping(album)}>Map</button>
            </div>
          ))}
        </div>
      );
    };
  }
);

jest.mock('../../../../src/renderer/components/ui', () => ({
  EmptyState: ({
    title,
    description,
    actions,
  }: {
    title: string;
    description: string;
    actions: Array<{ label: string; onClick: () => void }>;
  }) => (
    <div data-testid='empty-state'>
      <h2>{title}</h2>
      <p>{description}</p>
      {actions.map(a => (
        <button key={a.label} onClick={a.onClick}>
          {a.label}
        </button>
      ))}
    </div>
  ),
  ListItemSkeleton: ({ count }: { count: number }) => (
    <div data-testid='skeleton'>{count} loading items</div>
  ),
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
  ModalFooter: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='modal-footer'>{children}</div>
  ),
}));

const mockAlbums: MissingAlbum[] = [
  {
    artist: 'Artist A',
    album: 'Album A',
    playCount: 100,
    lastPlayed: 1700000000,
  },
  {
    artist: 'Artist B',
    album: 'Album B',
    playCount: 50,
    lastPlayed: 1690000000,
  },
];

describe('MissingAlbumsContainer', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    jest.clearAllMocks();
    user = userEvent.setup();

    mockGetMissingAlbums.mockResolvedValue(mockAlbums);
    mockGetLocalWantList.mockResolvedValue([]);
    mockGetWishlist.mockResolvedValue([]);
  });

  it('shows loading skeleton initially', () => {
    mockGetMissingAlbums.mockReturnValue(new Promise(() => {}));

    render(<MissingAlbumsContainer />);

    expect(screen.getByTestId('skeleton')).toBeInTheDocument();
  });

  it('renders missing albums when data loads', async () => {
    render(<MissingAlbumsContainer />);

    await waitFor(() => {
      expect(screen.getByText('2 missing albums')).toBeInTheDocument();
    });
  });

  it('shows error state on fetch failure', async () => {
    mockGetMissingAlbums.mockRejectedValue(new Error('Network error'));

    render(<MissingAlbumsContainer />);

    await waitFor(() => {
      expect(
        screen.getByText('Failed to Load Missing Albums')
      ).toBeInTheDocument();
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('shows retry button on error and retries', async () => {
    mockGetMissingAlbums.mockRejectedValueOnce(new Error('Network error'));

    render(<MissingAlbumsContainer />);

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    mockGetMissingAlbums.mockResolvedValue(mockAlbums);
    await user.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('2 missing albums')).toBeInTheDocument();
    });
  });

  it('hides album when hide button is clicked', async () => {
    mockHideAlbum.mockResolvedValue(undefined);

    render(<MissingAlbumsContainer />);

    await waitFor(() => {
      expect(screen.getByText('2 missing albums')).toBeInTheDocument();
    });

    const hideButtons = screen.getAllByText('Hide');
    await user.click(hideButtons[0]);

    await waitFor(() => {
      expect(mockHideAlbum).toHaveBeenCalledWith('Artist A', 'Album A');
    });
  });

  it('monitors album when monitor button is clicked', async () => {
    mockAddToLocalWantList.mockResolvedValue(undefined);

    render(<MissingAlbumsContainer />);

    await waitFor(() => {
      expect(screen.getByText('2 missing albums')).toBeInTheDocument();
    });

    const monitorButtons = screen.getAllByText('Monitor');
    await user.click(monitorButtons[0]);

    await waitFor(() => {
      expect(mockAddToLocalWantList).toHaveBeenCalledWith({
        artist: 'Artist A',
        album: 'Album A',
        playCount: 100,
        lastPlayed: 1700000000,
      });
    });
  });

  it('opens mapping modal when Map is clicked', async () => {
    render(<MissingAlbumsContainer />);

    await waitFor(() => {
      expect(screen.getByText('2 missing albums')).toBeInTheDocument();
    });

    const mapButtons = screen.getAllByText('Map');
    await user.click(mapButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId('modal')).toBeInTheDocument();
      expect(screen.getByText('Map Album to Collection')).toBeInTheDocument();
    });
  });

  it('defaults to plays sort order', async () => {
    render(<MissingAlbumsContainer />);

    await waitFor(() => {
      expect(screen.getByText('Sort: plays')).toBeInTheDocument();
    });
  });

  it('handles wishlist fetch error gracefully', async () => {
    mockGetWishlist.mockRejectedValue(new Error('Wishlist error'));

    render(<MissingAlbumsContainer />);

    await waitFor(() => {
      expect(screen.getByText('2 missing albums')).toBeInTheDocument();
    });
  });
});
