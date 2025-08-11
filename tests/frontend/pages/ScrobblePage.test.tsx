import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import React from 'react';

import { AuthProvider } from '../../../src/renderer/context/AuthContext';
import ScrobblePage from '../../../src/renderer/pages/ScrobblePage';
import * as apiService from '../../../src/renderer/services/api';
import * as dateUtils from '../../../src/renderer/utils/dateUtils';
import {
  AuthStatus,
  CollectionItem,
  ScrobbleTrack,
} from '../../../src/shared/types';

// Mock the API service
jest.mock('../../../src/renderer/services/api');
const mockApiService = apiService as jest.Mocked<typeof apiService>;

// Mock date utils
jest.mock('../../../src/renderer/utils/dateUtils', () => ({
  formatLocalTimeClean: jest.fn(date => {
    if (date instanceof Date) {
      return date.toLocaleString();
    }
    return new Date(date).toLocaleString();
  }),
}));

// Mock AppContext
const mockUseApp = {
  state: { serverUrl: 'http://localhost:3001' },
  dispatch: jest.fn(),
};

jest.mock('../../../src/renderer/context/AppContext', () => ({
  useApp: () => mockUseApp,
}));

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

// Mock window.history.back
const mockHistoryBack = jest.fn();
Object.defineProperty(window, 'history', {
  value: { back: mockHistoryBack },
  writable: true,
});

const createMockAuthContext = (authStatus: AuthStatus) => ({
  authStatus,
  setAuthStatus: jest.fn(),
});

const createMockApiInstance = () => ({
  getAuthStatus: jest.fn(),
  getReleaseDetails: jest.fn(),
  scrobbleBatch: jest.fn(),
});

const createMockCollectionItem = (
  id: number,
  artist: string,
  title: string
): CollectionItem => ({
  id,
  release: {
    id,
    artist,
    title,
    year: 2020,
    format: [],
    label: [],
    resource_url: '',
  },
  date_added: '2023-01-01T00:00:00Z',
  folder_id: 1,
});

const createMockReleaseDetails = (
  artist: string,
  title: string,
  trackCount: number = 3
) => ({
  id: 1,
  artist,
  title,
  tracklist: Array.from({ length: trackCount }, (_, i) => ({
    title: `Track ${i + 1}`,
    artist,
    duration: '3:30',
  })),
});

const renderScrobblePageWithProviders = (
  authStatus: AuthStatus,
  serverUrl: string = 'http://localhost:3001'
) => {
  mockUseApp.state = { serverUrl };
  const authContextValue = createMockAuthContext(authStatus);

  return {
    ...render(
      <AuthProvider value={authContextValue}>
        <ScrobblePage />
      </AuthProvider>
    ),
    authContextValue,
  };
};

describe('ScrobblePage', () => {
  let mockApi: ReturnType<typeof createMockApiInstance>;

  beforeEach(() => {
    mockApi = createMockApiInstance();
    mockApiService.getApiService.mockReturnValue(mockApi as any);
    jest.clearAllMocks();

    // Re-setup localStorage mock after clearing
    mockLocalStorage.getItem.mockClear();
    mockLocalStorage.setItem.mockClear();
    mockLocalStorage.removeItem.mockClear();
    mockLocalStorage.clear.mockClear();

    // Set default return value for getItem to null
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  describe('Authentication', () => {
    it('shows authentication required when not fully authenticated', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: false, username: undefined },
      };

      renderScrobblePageWithProviders(authStatus);

      expect(screen.getByText('Scrobble Tracks')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Please authenticate with both Discogs and Last.fm to scrobble tracks.'
        )
      ).toBeInTheDocument();
      expect(screen.getByText('Go to Setup')).toBeInTheDocument();
    });

    it('shows authentication required when Discogs is not authenticated', () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: false, username: undefined },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      renderScrobblePageWithProviders(authStatus);

      expect(
        screen.getByText(
          'Please authenticate with both Discogs and Last.fm to scrobble tracks.'
        )
      ).toBeInTheDocument();
    });

    it('checks auth status when not fully authenticated', async () => {
      const authStatus: AuthStatus = {
        discogs: { authenticated: false, username: undefined },
        lastfm: { authenticated: false, username: undefined },
      };

      const newAuthStatus: AuthStatus = {
        discogs: { authenticated: true, username: 'discogs_user' },
        lastfm: { authenticated: true, username: 'lastfm_user' },
      };

      mockApi.getAuthStatus.mockResolvedValue(newAuthStatus);

      const { authContextValue } = renderScrobblePageWithProviders(authStatus);

      await waitFor(() => {
        expect(authContextValue.setAuthStatus).toHaveBeenCalledWith(
          newAuthStatus
        );
      });
    });
  });

  describe('Album Selection', () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: true, username: 'discogs_user' },
      lastfm: { authenticated: true, username: 'lastfm_user' },
    };

    beforeEach(() => {
      // Clear localStorage mock
      mockLocalStorage.getItem.mockClear();
      mockLocalStorage.setItem.mockClear();

      // Set default return value to null (no albums selected)
      mockLocalStorage.getItem.mockReturnValue(null);
    });

    it('shows no albums message when none are selected', () => {
      mockLocalStorage.getItem.mockReturnValue(null);

      renderScrobblePageWithProviders(authStatus);

      expect(
        screen.getByText(
          'No albums selected for scrobbling. Please go to the collection page and select some albums first.'
        )
      ).toBeInTheDocument();
      expect(screen.getByText('Browse Collection')).toBeInTheDocument();
    });

    it('loads albums from localStorage', async () => {
      const mockAlbums = [
        createMockCollectionItem(1, 'The Beatles', 'Abbey Road'),
        createMockCollectionItem(2, 'Pink Floyd', 'Dark Side of the Moon'),
      ];

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(mockAlbums));

      const releaseDetails1 = createMockReleaseDetails(
        'The Beatles',
        'Abbey Road',
        2
      );
      const releaseDetails2 = createMockReleaseDetails(
        'Pink Floyd',
        'Dark Side of the Moon',
        3
      );

      mockApi.getReleaseDetails.mockImplementation(id => {
        if (id === 1) return Promise.resolve(releaseDetails1);
        if (id === 2) return Promise.resolve(releaseDetails2);
        return Promise.reject(new Error('Release not found'));
      });

      renderScrobblePageWithProviders(authStatus);

      // Wait for localStorage to be read and albums to load
      await waitFor(
        () => {
          expect(screen.getByText('Selected Albums (2)')).toBeInTheDocument();
        },
        { timeout: 5000 }
      );

      await waitFor(() => {
        expect(
          screen.getByText('The Beatles - Abbey Road')
        ).toBeInTheDocument();
        expect(
          screen.getByText('Pink Floyd - Dark Side of the Moon')
        ).toBeInTheDocument();
      });
    });

    it('handles localStorage parsing errors', () => {
      mockLocalStorage.getItem.mockReturnValue('invalid json');

      renderScrobblePageWithProviders(authStatus);

      // When localStorage parsing fails, selectedAlbums remains empty,
      // so the component shows the "no albums selected" message
      expect(
        screen.getByText(
          'No albums selected for scrobbling. Please go to the collection page and select some albums first.'
        )
      ).toBeInTheDocument();
    });
  });

  describe('Track Preparation', () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: true, username: 'discogs_user' },
      lastfm: { authenticated: true, username: 'lastfm_user' },
    };

    beforeEach(() => {
      // Clear localStorage mock
      mockLocalStorage.getItem.mockClear();
      mockLocalStorage.setItem.mockClear();

      const mockAlbums = [
        createMockCollectionItem(1, 'The Beatles', 'Abbey Road'),
      ];
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(mockAlbums));
    });

    it('prepares tracks from selected albums', async () => {
      const releaseDetails = createMockReleaseDetails(
        'The Beatles',
        'Abbey Road',
        3
      );
      mockApi.getReleaseDetails.mockResolvedValue(releaseDetails);

      renderScrobblePageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Tracks (3)')).toBeInTheDocument();
        expect(screen.getByText('Track 1')).toBeInTheDocument();
        expect(screen.getByText('Track 2')).toBeInTheDocument();
        expect(screen.getByText('Track 3')).toBeInTheDocument();
      });
    });

    it('selects all tracks by default', async () => {
      const releaseDetails = createMockReleaseDetails(
        'The Beatles',
        'Abbey Road',
        2
      );
      mockApi.getReleaseDetails.mockResolvedValue(releaseDetails);

      renderScrobblePageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('2 selected')).toBeInTheDocument();
      });
    });

    it('handles track preparation errors', async () => {
      mockApi.getReleaseDetails.mockRejectedValue(
        new Error('Failed to fetch release details')
      );

      renderScrobblePageWithProviders(authStatus);

      await waitFor(() => {
        expect(
          screen.getByText('Failed to fetch release details')
        ).toBeInTheDocument();
      });
    });
  });

  describe('Track Selection', () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: true, username: 'discogs_user' },
      lastfm: { authenticated: true, username: 'lastfm_user' },
    };

    beforeEach(async () => {
      const mockAlbums = [
        createMockCollectionItem(1, 'The Beatles', 'Abbey Road'),
      ];
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(mockAlbums));

      const releaseDetails = createMockReleaseDetails(
        'The Beatles',
        'Abbey Road',
        3
      );
      mockApi.getReleaseDetails.mockResolvedValue(releaseDetails);
    });

    it('allows selecting and deselecting individual tracks', async () => {
      const user = userEvent.setup();

      renderScrobblePageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('3 selected')).toBeInTheDocument();
      });

      // Deselect first track
      const firstTrackCheckbox = screen.getAllByRole('checkbox')[0];
      await user.click(firstTrackCheckbox);

      expect(screen.getByText('2 selected')).toBeInTheDocument();

      // Select it back
      await user.click(firstTrackCheckbox);

      expect(screen.getByText('3 selected')).toBeInTheDocument();
    });

    it('allows selecting/deselecting all tracks', async () => {
      const user = userEvent.setup();

      renderScrobblePageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Deselect All')).toBeInTheDocument();
      });

      // Deselect all
      const selectAllButton = screen.getByText('Deselect All');
      await user.click(selectAllButton);

      expect(screen.getByText('0 selected')).toBeInTheDocument();
      expect(screen.getByText('Select All')).toBeInTheDocument();

      // Select all again
      const selectAllButtonNew = screen.getByText('Select All');
      await user.click(selectAllButtonNew);

      expect(screen.getByText('3 selected')).toBeInTheDocument();
    });
  });

  describe('Timestamp Settings', () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: true, username: 'discogs_user' },
      lastfm: { authenticated: true, username: 'lastfm_user' },
    };

    beforeEach(async () => {
      const mockAlbums = [
        createMockCollectionItem(1, 'The Beatles', 'Abbey Road'),
      ];
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(mockAlbums));

      const releaseDetails = createMockReleaseDetails(
        'The Beatles',
        'Abbey Road',
        1
      );
      mockApi.getReleaseDetails.mockResolvedValue(releaseDetails);

      const mockFormatLocalTimeClean =
        dateUtils.formatLocalTimeClean as jest.MockedFunction<
          typeof dateUtils.formatLocalTimeClean
        >;
      mockFormatLocalTimeClean.mockReturnValue('Jan 1, 2023 10:00 AM');
    });

    it('uses current time by default', async () => {
      renderScrobblePageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Use current time')).toBeInTheDocument();
        expect(screen.getByLabelText('Use current time')).toBeChecked();
      });
    });

    it('allows switching to custom time', async () => {
      const user = userEvent.setup();

      renderScrobblePageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Use custom time')).toBeInTheDocument();
      });

      const customTimeRadio = screen.getByLabelText('Use custom time');
      await user.click(customTimeRadio);

      expect(screen.getByDisplayValue('')).toBeInTheDocument(); // Custom time input should appear
    });

    it('shows formatted timestamp', async () => {
      renderScrobblePageWithProviders(authStatus);

      await waitFor(() => {
        expect(
          screen.getByText(/Scrobble time: Jan 1, 2023 10:00 AM/)
        ).toBeInTheDocument();
      });
    });

    it('allows setting custom timestamp', async () => {
      const user = userEvent.setup();

      renderScrobblePageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Use custom time')).toBeInTheDocument();
      });

      const customTimeRadio = screen.getByLabelText('Use custom time');
      await user.click(customTimeRadio);

      const customTimeInput = screen.getByDisplayValue('');
      await user.type(customTimeInput, '2023-01-01T12:00');

      expect(customTimeInput).toHaveValue('2023-01-01T12:00');
    });
  });

  describe('Scrobbling', () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: true, username: 'discogs_user' },
      lastfm: { authenticated: true, username: 'lastfm_user' },
    };

    beforeEach(async () => {
      const mockAlbums = [
        createMockCollectionItem(1, 'The Beatles', 'Abbey Road'),
      ];
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(mockAlbums));

      const releaseDetails = createMockReleaseDetails(
        'The Beatles',
        'Abbey Road',
        2
      );
      mockApi.getReleaseDetails.mockResolvedValue(releaseDetails);
    });

    it('prevents scrobbling when no tracks are selected', async () => {
      const user = userEvent.setup();

      renderScrobblePageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Deselect All')).toBeInTheDocument();
      });

      // Deselect all tracks
      const deselectAllButton = screen.getByText('Deselect All');
      await user.click(deselectAllButton);

      const scrobbleButton = screen.getByText('Scrobble 0 Tracks');
      expect(scrobbleButton).toBeDisabled();
    });

    it('allows scrobbling selected tracks', async () => {
      const user = userEvent.setup();

      const mockResult = { success: 2, failed: 0 };
      mockApi.scrobbleBatch.mockResolvedValue(mockResult);

      renderScrobblePageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Scrobble 2 Tracks')).toBeInTheDocument();
      });

      const scrobbleButton = screen.getByText('Scrobble 2 Tracks');
      await user.click(scrobbleButton);

      await waitFor(() => {
        expect(
          screen.getByText(/Successfully scrobbled: 2 tracks/)
        ).toBeInTheDocument();
      });

      expect(mockApi.scrobbleBatch).toHaveBeenCalled();
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(
        'selectedAlbums'
      );
    });

    it('shows scrobbling progress', async () => {
      const user = userEvent.setup();

      // Make scrobbleBatch take some time
      mockApi.scrobbleBatch.mockImplementation(
        () =>
          new Promise(resolve => {
            setTimeout(() => resolve({ success: 2, failed: 0 }), 100);
          })
      );

      renderScrobblePageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Scrobble 2 Tracks')).toBeInTheDocument();
      });

      const scrobbleButton = screen.getByText('Scrobble 2 Tracks');
      await user.click(scrobbleButton);

      expect(screen.getByText('Scrobbling...')).toBeInTheDocument();

      await waitFor(() => {
        expect(
          screen.getByText(/Successfully scrobbled: 2 tracks/)
        ).toBeInTheDocument();
      });
    });

    it('handles scrobbling errors', async () => {
      const user = userEvent.setup();

      mockApi.scrobbleBatch.mockRejectedValue(new Error('Network error'));

      renderScrobblePageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Scrobble 2 Tracks')).toBeInTheDocument();
      });

      const scrobbleButton = screen.getByText('Scrobble 2 Tracks');
      await user.click(scrobbleButton);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('shows detailed error results', async () => {
      const user = userEvent.setup();

      const mockResult = {
        success: 1,
        failed: 1,
        errors: ['Track not found: Track 2'],
      };
      mockApi.scrobbleBatch.mockResolvedValue(mockResult);

      renderScrobblePageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Scrobble 2 Tracks')).toBeInTheDocument();
      });

      const scrobbleButton = screen.getByText('Scrobble 2 Tracks');
      await user.click(scrobbleButton);

      await waitFor(() => {
        expect(
          screen.getByText(/Successfully scrobbled: 1 tracks/)
        ).toBeInTheDocument();
        expect(
          screen.getByText(/Failed to scrobble: 1 tracks/)
        ).toBeInTheDocument();
        expect(screen.getByText('View Errors')).toBeInTheDocument();
      });

      // Expand error details
      const viewErrorsButton = screen.getByText('View Errors');
      await user.click(viewErrorsButton);

      expect(screen.getByText('Track not found: Track 2')).toBeInTheDocument();
    });

    it('requires at least one track selection for scrobbling', async () => {
      const user = userEvent.setup();

      renderScrobblePageWithProviders(authStatus);

      await waitFor(() => {
        expect(screen.getByText('Deselect All')).toBeInTheDocument();
      });

      // Deselect all tracks
      const deselectAllButton = screen.getByText('Deselect All');
      await user.click(deselectAllButton);

      // Check that the scrobble button is disabled when no tracks are selected
      const scrobbleButton = screen.getByText('Scrobble 0 Tracks');
      expect(scrobbleButton).toBeDisabled();

      // Verify scrobbleBatch isn't called since button is disabled
      expect(mockApi.scrobbleBatch).not.toHaveBeenCalled();
    });
  });

  describe('Navigation', () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: true, username: 'discogs_user' },
      lastfm: { authenticated: true, username: 'lastfm_user' },
    };

    beforeEach(async () => {
      const mockAlbums = [
        createMockCollectionItem(1, 'The Beatles', 'Abbey Road'),
      ];
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(mockAlbums));

      const releaseDetails = createMockReleaseDetails(
        'The Beatles',
        'Abbey Road',
        1
      );
      mockApi.getReleaseDetails.mockResolvedValue(releaseDetails);
    });

    it('allows going back to collection', async () => {
      const user = userEvent.setup();

      renderScrobblePageWithProviders(authStatus);

      // Wait for localStorage to load and page to render with album data
      await waitFor(
        () => {
          expect(screen.getByText('Back to Collection')).toBeInTheDocument();
          expect(
            screen.getByText('The Beatles - Abbey Road')
          ).toBeInTheDocument();
        },
        { timeout: 10000 }
      );

      const backButton = screen.getByText('Back to Collection');
      await user.click(backButton);

      expect(mockHistoryBack).toHaveBeenCalled();
    });

    it('disables back button during scrobbling', async () => {
      const user = userEvent.setup();

      // Make scrobbleBatch take some time
      mockApi.scrobbleBatch.mockImplementation(() => new Promise(() => {})); // Never resolves

      renderScrobblePageWithProviders(authStatus);

      // Wait for localStorage to load and page to render completely
      await waitFor(
        () => {
          expect(screen.getByText('Scrobble 1 Tracks')).toBeInTheDocument();
          expect(
            screen.getByText('The Beatles - Abbey Road')
          ).toBeInTheDocument();
        },
        { timeout: 10000 }
      );

      const scrobbleButton = screen.getByText('Scrobble 1 Tracks');
      await user.click(scrobbleButton);

      const backButton = screen.getByText('Back to Collection');
      expect(backButton).toBeDisabled();
    });
  });

  describe('Progress Tracking', () => {
    const authStatus: AuthStatus = {
      discogs: { authenticated: true, username: 'discogs_user' },
      lastfm: { authenticated: true, username: 'lastfm_user' },
    };

    beforeEach(async () => {
      const mockAlbums = [
        createMockCollectionItem(1, 'The Beatles', 'Abbey Road'),
      ];
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(mockAlbums));

      const releaseDetails = createMockReleaseDetails(
        'The Beatles',
        'Abbey Road',
        3
      );
      mockApi.getReleaseDetails.mockResolvedValue(releaseDetails);
    });

    it('shows progress bar during scrobbling', async () => {
      const user = userEvent.setup();

      // Make scrobbleBatch take some time
      mockApi.scrobbleBatch.mockImplementation(
        () =>
          new Promise(resolve => {
            setTimeout(() => resolve({ success: 3, failed: 0 }), 100);
          })
      );

      renderScrobblePageWithProviders(authStatus);

      // Wait for localStorage to be read and tracks to be prepared
      await waitFor(
        () => {
          expect(screen.getByText('Scrobble 3 Tracks')).toBeInTheDocument();
          expect(
            screen.getByText('The Beatles - Abbey Road')
          ).toBeInTheDocument();
        },
        { timeout: 15000 }
      );

      const scrobbleButton = screen.getByText('Scrobble 3 Tracks');
      await user.click(scrobbleButton);

      expect(screen.getByText('Scrobbling Progress')).toBeInTheDocument();

      await waitFor(
        () => {
          expect(
            screen.getByText(/Successfully scrobbled: 3 tracks/)
          ).toBeInTheDocument();
        },
        { timeout: 10000 }
      );
    }, 20000);
  });
});
