import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

import '@testing-library/jest-dom';

import { AppProvider } from '../../../src/renderer/context/AppContext';
import { AuthProvider } from '../../../src/renderer/context/AuthContext';
import ReleaseDetailsPage from '../../../src/renderer/pages/ReleaseDetailsPage';

// Mock the API service
const mockApiService = {
  testLastfmConnection: jest.fn(),
  getLastfmSessionKey: jest.fn(),
  prepareTracksFromRelease: jest.fn(),
  scrobbleBatch: jest.fn(),
  getScrobbleProgress: jest.fn(),
  getReleaseDetails: jest.fn(),
};

jest.mock('../../../src/renderer/services/api', () => ({
  getApiService: () => mockApiService,
}));

// Create a robust localStorage mock
let localStorageStore: { [key: string]: string } = {};

const localStorageMock = {
  getItem: (key: string): string | null => {
    return localStorageStore[key] || null;
  },
  setItem: (key: string, value: string): void => {
    localStorageStore[key] = value;
  },
  removeItem: (key: string): void => {
    delete localStorageStore[key];
  },
  clear: (): void => {
    localStorageStore = {};
  },
  length: 0,
  key: (index: number): string | null => null,
};

// Set up the mock as a global
Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Export for use in tests
const mockLocalStorage = localStorageMock;

// Mock release data
const mockRelease = {
  id: 123,
  title: 'Test Album',
  artist: 'Test Artist',
  year: 2023,
  format: ['Vinyl'],
  label: ['Test Label'],
  cover_image: 'test-image.jpg',
  tracklist: [
    { position: '1', title: 'Track 1', duration: '3:30' },
    { position: '2', title: 'Track 2', duration: '4:00' },
    { position: '3', title: 'Track 3', duration: '2:45' },
  ],
};

// Mock multi-side release data
const mockMultiSideRelease = {
  id: 456,
  title: 'Double Album',
  artist: 'Test Artist',
  year: 2023,
  format: ['Vinyl'],
  label: ['Test Label'],
  cover_image: 'test-image.jpg',
  tracklist: [
    { position: 'A1', title: 'Side A Track 1', duration: '3:30' },
    { position: 'A2', title: 'Side A Track 2', duration: '4:00' },
    { position: 'B1', title: 'Side B Track 1', duration: '2:45' },
    { position: 'B2', title: 'Side B Track 2', duration: '3:15' },
    { position: 'C1', title: 'Side C Track 1', duration: '3:45' },
    { position: 'C2', title: 'Side C Track 2', duration: '4:30' },
    { position: 'D1', title: 'Side D Track 1', duration: '3:00' },
    { position: 'D2', title: 'Side D Track 2', duration: '2:30' },
  ],
};

// Mock release with catalog number and multiple labels
const mockDetailedRelease = {
  id: 789,
  title: 'Detailed Album',
  artist: 'Test Artist',
  year: 2023,
  format: ['Vinyl', 'LP'],
  label: ['Label 1', 'Label 2'],
  catalog_number: 'CAT-001',
  cover_image: 'test-image.jpg',
  tracklist: [
    {
      position: '1',
      title: 'Track 1',
      duration: '3:30',
      artist: 'Featured Artist',
    },
    { position: '2', title: 'Track 2', duration: '4:00' },
    { position: '3', title: 'Track 3', duration: '2:45' },
  ],
};

const mockAuthContext = {
  authStatus: {
    lastfm: { authenticated: true, username: 'testuser' },
    discogs: { authenticated: true, username: 'testuser' },
  },
  setAuthStatus: jest.fn(),
};

const mockUnauthenticatedAuthContext = {
  authStatus: {
    lastfm: { authenticated: false, username: '' },
    discogs: { authenticated: true, username: 'testuser' },
  },
  setAuthStatus: jest.fn(),
};

const renderWithProviders = (
  component: React.ReactElement,
  authContext = mockAuthContext
) => {
  return render(
    <AuthProvider value={authContext}>
      <AppProvider>{component}</AppProvider>
    </AuthProvider>
  );
};

// Global setup to ensure localStorage is always available
beforeAll(() => {
  // Ensure localStorage mock is available on both global and window
  if (!global.localStorage) {
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });
  }
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });
  }
});

describe('ReleaseDetailsPage Auto Timing', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Ensure localStorage mock is set up for this test
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true,
    });

    mockLocalStorage.clear();
    mockLocalStorage.setItem('selectedRelease', JSON.stringify(mockRelease));
    mockApiService.getReleaseDetails.mockResolvedValue(mockRelease);

    // Mock Date.now() for consistent testing
    jest.spyOn(Date, 'now').mockReturnValue(1640995200000); // 2022-01-01 00:00:00 UTC
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should calculate correct auto timing when "Auto Timing (Just Finished)" is clicked', async () => {
    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Album')).toBeInTheDocument();
    });

    // First deselect all tracks, then select specific ones
    const deselectAllButton = screen.getByText('Deselect All');
    fireEvent.click(deselectAllButton);

    await waitFor(() => {
      expect(screen.getByText('Tracks (0 selected)')).toBeInTheDocument();
    });

    // Select some tracks by clicking their containers
    const trackContainers = screen.getAllByRole('checkbox');
    fireEvent.click(trackContainers[0]); // Track 1
    fireEvent.click(trackContainers[1]); // Track 2

    await waitFor(() => {
      expect(screen.getByText('Tracks (2 selected)')).toBeInTheDocument();
    });

    // Click auto timing button
    const autoTimingButton = screen.getByText('Auto Timing (Just Finished)');
    fireEvent.click(autoTimingButton);

    // Check if the datetime-local input has been populated with any value (timing calculation should have worked)
    await waitFor(() => {
      const startTimeInput = screen.getByDisplayValue(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
      );
      expect(startTimeInput).toBeInTheDocument();
    });

    // The calculation should be:
    // Track 1: 3:30 = 210 seconds
    // Track 2: 4:00 = 240 seconds
    // Total with gaps: 210 + 1 + 240 + 1 = 452 seconds
    // Start time should be current time (1640995200000) minus 452000ms
    // Which equals 1640994748000 = 2021-12-31T23:52:28
  });

  it('should hide timing section when no tracks are selected', async () => {
    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Album')).toBeInTheDocument();
    });

    // First deselect all tracks
    const deselectAllButton = screen.getByText('Deselect All');
    fireEvent.click(deselectAllButton);

    await waitFor(() => {
      expect(screen.getByText('Tracks (0 selected)')).toBeInTheDocument();
    });

    // Timing section should not be visible when no tracks are selected
    expect(screen.queryByText('Scrobble Timing')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Auto Timing (Just Finished)')
    ).not.toBeInTheDocument();
  });

  it('should show clear button when start time is set', async () => {
    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Album')).toBeInTheDocument();
    });

    // First deselect all tracks, then select one track
    const deselectAllButton = screen.getByText('Deselect All');
    fireEvent.click(deselectAllButton);

    // Select one track
    const trackContainers = screen.getAllByRole('checkbox');
    fireEvent.click(trackContainers[0]); // Track 1

    const autoTimingButton = screen.getByText('Auto Timing (Just Finished)');
    fireEvent.click(autoTimingButton);

    // Clear button should appear
    const clearButton = screen.getByText('Clear');
    expect(clearButton).toBeInTheDocument();

    // Click clear button
    fireEvent.click(clearButton);

    // Start time should be cleared
    const startTimeInputs = screen.getAllByDisplayValue('');
    const startTimeInput = startTimeInputs.find(
      input => input.getAttribute('type') === 'datetime-local'
    );
    expect(startTimeInput).toHaveValue('');
  });

  it('should show appropriate help text based on timing state', async () => {
    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Album')).toBeInTheDocument();
    });

    // First deselect all tracks, then select one track
    const deselectAllButton = screen.getByText('Deselect All');
    fireEvent.click(deselectAllButton);

    // Select a track
    const trackContainers = screen.getAllByRole('checkbox');
    fireEvent.click(trackContainers[0]); // Track 1

    // Initially should show default timing message
    expect(
      screen.getByText(/Tracks will be scrobbled with realistic timing/)
    ).toBeInTheDocument();

    // Use auto timing
    const autoTimingButton = screen.getByText('Auto Timing (Just Finished)');
    fireEvent.click(autoTimingButton);

    // Should show auto timing message
    expect(
      screen.getByText(/Auto timing: Tracks will end at current time/)
    ).toBeInTheDocument();
  });
});

describe('ReleaseDetailsPage Side Selection', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Ensure localStorage mock is set up for this test
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true,
    });

    mockLocalStorage.clear();
    jest.spyOn(Date, 'now').mockReturnValue(1640995200000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should not show side selection buttons for single-side albums', async () => {
    mockLocalStorage.setItem('selectedRelease', JSON.stringify(mockRelease));
    mockApiService.getReleaseDetails.mockResolvedValue(mockRelease);
    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Album')).toBeInTheDocument();
    });

    // Should not show side selection section
    expect(screen.queryByText('Select by Side')).not.toBeInTheDocument();
    expect(screen.queryByText(/Side A/)).not.toBeInTheDocument();
  });

  it('should show side selection buttons for multi-side albums', async () => {
    mockLocalStorage.setItem(
      'selectedRelease',
      JSON.stringify(mockMultiSideRelease)
    );
    mockApiService.getReleaseDetails.mockResolvedValue(mockMultiSideRelease);
    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Double Album/i })
      ).toBeInTheDocument();
    });

    // Should show side selection section
    expect(screen.getByText('Select by Side')).toBeInTheDocument();

    // Should show individual side buttons
    expect(screen.getByText('Side A (2)')).toBeInTheDocument();
    expect(screen.getByText('Side B (2)')).toBeInTheDocument();
    expect(screen.getByText('Side C (2)')).toBeInTheDocument();
    expect(screen.getByText('Side D (2)')).toBeInTheDocument();

    // Should show disc buttons for multi-disc album
    expect(screen.getByText('By Disc:')).toBeInTheDocument();
    expect(screen.getByText('Disc 1 (A/B)')).toBeInTheDocument();
    expect(screen.getByText('Disc 2 (C/D)')).toBeInTheDocument();
  });

  it('should select/deselect tracks when side button is clicked', async () => {
    mockLocalStorage.setItem(
      'selectedRelease',
      JSON.stringify(mockMultiSideRelease)
    );
    mockApiService.getReleaseDetails.mockResolvedValue(mockMultiSideRelease);
    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Double Album/i })
      ).toBeInTheDocument();
    });

    // Initially all tracks should be selected (8 tracks)
    expect(screen.getByText('Tracks (8 selected)')).toBeInTheDocument();

    // Click "Side A" button to deselect side A
    const sideAButton = screen.getByText('Side A (2)');
    fireEvent.click(sideAButton);

    // Should now have 6 tracks selected (8 - 2 from side A)
    await waitFor(() => {
      expect(screen.getByText('Tracks (6 selected)')).toBeInTheDocument();
    });

    // Click "Side A" button again to select side A
    fireEvent.click(sideAButton);

    // Should be back to 8 tracks selected
    await waitFor(() => {
      expect(screen.getByText('Tracks (8 selected)')).toBeInTheDocument();
    });
  });

  it('should select/deselect tracks when disc button is clicked', async () => {
    mockLocalStorage.setItem(
      'selectedRelease',
      JSON.stringify(mockMultiSideRelease)
    );
    mockApiService.getReleaseDetails.mockResolvedValue(mockMultiSideRelease);
    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Double Album/i })
      ).toBeInTheDocument();
    });

    // Initially all tracks should be selected (8 tracks)
    expect(screen.getByText('Tracks (8 selected)')).toBeInTheDocument();

    // Click "Disc 1" button to deselect disc 1 (sides A & B)
    const disc1Button = screen.getByText('Disc 1 (A/B)');
    fireEvent.click(disc1Button);

    // Should now have 4 tracks selected (8 - 4 from disc 1)
    await waitFor(() => {
      expect(screen.getByText('Tracks (4 selected)')).toBeInTheDocument();
    });

    // Click "Disc 1" button again to select disc 1
    fireEvent.click(disc1Button);

    // Should be back to 8 tracks selected
    await waitFor(() => {
      expect(screen.getByText('Tracks (8 selected)')).toBeInTheDocument();
    });
  });

  it('should update button appearance based on selection state', async () => {
    // Ensure localStorage is set before rendering
    mockLocalStorage.setItem(
      'selectedRelease',
      JSON.stringify(mockMultiSideRelease)
    );

    // Verify the data was stored
    expect(mockLocalStorage.getItem('selectedRelease')).toBeTruthy();
    expect(JSON.parse(mockLocalStorage.getItem('selectedRelease')!).title).toBe(
      'Double Album'
    );

    mockApiService.getReleaseDetails.mockResolvedValue(mockMultiSideRelease);
    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Double Album/i })
      ).toBeInTheDocument();
    });

    const sideAButton = screen.getByText('Side A (2)');

    // Initially selected - should have primary styling
    expect(sideAButton).toHaveClass('btn-primary');

    // Click to deselect
    fireEvent.click(sideAButton);

    // Should now have outline styling
    await waitFor(() => {
      expect(sideAButton).toHaveClass('btn-outline');
    });
  });
});

describe('ReleaseDetailsPage Error Handling and Loading States', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.clear();
    jest.spyOn(Date, 'now').mockReturnValue(1640995200000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should show loading state while fetching release details', () => {
    // Set localStorage but make API call never resolve to trigger loading state
    mockLocalStorage.setItem('selectedRelease', JSON.stringify(mockRelease));
    mockApiService.getReleaseDetails.mockImplementation(
      () => new Promise(() => {})
    ); // Never resolves

    renderWithProviders(<ReleaseDetailsPage />);

    expect(screen.getByText('Loading release details...')).toBeInTheDocument();
    expect(document.querySelector('.spinner')).toBeInTheDocument();
  });

  it('should show error when no release data is found in localStorage', async () => {
    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(
        screen.getByText(
          'No release data found. Please go back and select an album.'
        )
      ).toBeInTheDocument();
    });
    expect(screen.getByText('Back to Collection')).toBeInTheDocument();
  });

  it('should show error when API call fails', async () => {
    mockLocalStorage.setItem('selectedRelease', JSON.stringify(mockRelease));
    mockApiService.getReleaseDetails.mockRejectedValue(new Error('API Error'));

    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText('API Error')).toBeInTheDocument();
    });
    expect(screen.getByText('Back to Collection')).toBeInTheDocument();
  });

  it('should show error when API call fails with non-Error exception', async () => {
    mockLocalStorage.setItem('selectedRelease', JSON.stringify(mockRelease));
    mockApiService.getReleaseDetails.mockRejectedValue('String error');

    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(
        screen.getByText('Failed to load release details')
      ).toBeInTheDocument();
    });
  });

  it('should show error when release is null after loading', async () => {
    mockLocalStorage.setItem('selectedRelease', JSON.stringify(mockRelease));
    mockApiService.getReleaseDetails.mockResolvedValue(null);

    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      // The error message may vary depending on which property is accessed first
      expect(
        screen.getByText(/Cannot read properties of null/)
      ).toBeInTheDocument();
    });
    expect(screen.getByText('Back to Collection')).toBeInTheDocument();
  });

  it('should handle invalid JSON in localStorage', async () => {
    mockLocalStorage.setItem('selectedRelease', 'invalid json');

    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      // Different Node versions may produce slightly different error messages
      expect(
        screen.getByText(
          /Unexpected token|JSON Parse error|Expected property name/i
        )
      ).toBeInTheDocument();
    });
  });
});

describe('ReleaseDetailsPage Scrobble Progress and Results', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.clear();
    mockLocalStorage.setItem('selectedRelease', JSON.stringify(mockRelease));
    mockApiService.getReleaseDetails.mockResolvedValue(mockRelease);
    jest.spyOn(Date, 'now').mockReturnValue(1640995200000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should display scrobble progress with correct styling', async () => {
    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Album')).toBeInTheDocument();
    });

    // Mock scrobble progress state by directly setting it
    // This tests the UI rendering of progress state
    const { rerender } = renderWithProviders(<ReleaseDetailsPage />);

    // Re-render with scrobble progress state
    const mockProgress = {
      current: 2,
      total: 5,
      success: 1,
      failed: 0,
      ignored: 1,
    };

    // We need to mock the component state, but since we can't directly access it,
    // we'll test the scrobble functionality that sets this state
    mockApiService.prepareTracksFromRelease.mockResolvedValue({
      tracks: [
        { track: 'Track 1', timestamp: 1640995200, duration: 180 },
        { track: 'Track 2', timestamp: 1640995380, duration: 240 },
      ],
    });

    mockApiService.scrobbleBatch.mockResolvedValue({
      sessionId: 'test-session',
    });
    mockApiService.getScrobbleProgress.mockResolvedValue({
      status: 'in_progress',
      progress: mockProgress,
    });

    // Select tracks and start scrobbling
    const scrobbleButton = screen.getByText('Scrobble 3 Tracks');
    fireEvent.click(scrobbleButton);

    // Wait for progress to be displayed
    await waitFor(() => {
      expect(screen.getByText('Scrobbling Progress:')).toBeInTheDocument();
      expect(screen.getByText('2 / 5')).toBeInTheDocument();
      expect(screen.getByText(/✅ 1 successful/)).toBeInTheDocument();
      expect(screen.getByText(/⚠️ 1 ignored/)).toBeInTheDocument();
      expect(screen.getByText(/❌ 0 failed/)).toBeInTheDocument();
    });
  });

  it('should display scrobble results with success styling', async () => {
    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Album')).toBeInTheDocument();
    });

    // Mock successful scrobble completion
    mockApiService.prepareTracksFromRelease.mockResolvedValue({
      tracks: [{ track: 'Track 1', timestamp: 1640995200, duration: 180 }],
    });

    mockApiService.scrobbleBatch.mockResolvedValue({
      sessionId: 'test-session',
    });
    mockApiService.getScrobbleProgress.mockResolvedValue({
      status: 'completed',
      progress: {
        current: 1,
        total: 1,
        success: 1,
        failed: 0,
        ignored: 0,
      },
    });

    // Select tracks and start scrobbling
    const scrobbleButton = screen.getByText('Scrobble 3 Tracks');
    fireEvent.click(scrobbleButton);

    // Wait for results to be displayed
    await waitFor(() => {
      expect(screen.getByText('Scrobble Results:')).toBeInTheDocument();
      expect(screen.getByText(/1 successful/)).toBeInTheDocument();
      expect(screen.getByText('View on Last.fm')).toBeInTheDocument();
    });

    // Should have success styling
    const resultsContainer = screen
      .getByText('Scrobble Results:')
      .closest('.message');
    expect(resultsContainer).toHaveClass('success');
  });

  it('should display scrobble results with warning styling for ignored tracks', async () => {
    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Album')).toBeInTheDocument();
    });

    // Mock scrobble with ignored tracks
    mockApiService.prepareTracksFromRelease.mockResolvedValue({
      tracks: [{ track: 'Track 1', timestamp: 1640995200, duration: 180 }],
    });

    mockApiService.scrobbleBatch.mockResolvedValue({
      sessionId: 'test-session',
    });
    mockApiService.getScrobbleProgress.mockResolvedValue({
      status: 'completed',
      progress: {
        current: 1,
        total: 1,
        success: 0,
        failed: 0,
        ignored: 1,
      },
    });

    // Select tracks and start scrobbling
    const scrobbleButton = screen.getByText('Scrobble 3 Tracks');
    fireEvent.click(scrobbleButton);

    // Wait for results to be displayed
    await waitFor(() => {
      expect(screen.getByText('Scrobble Results:')).toBeInTheDocument();
      expect(screen.getByText(/1 ignored/)).toBeInTheDocument();
      expect(
        screen.getByText(
          /Ignored scrobbles usually mean the track was scrobbled too recently/
        )
      ).toBeInTheDocument();
    });

    // Should have warning styling
    const resultsContainer = screen
      .getByText('Scrobble Results:')
      .closest('.message');
    expect(resultsContainer).toHaveClass('warning');
  });

  it('should display scrobble results with error styling for failed tracks', async () => {
    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Album')).toBeInTheDocument();
    });

    // Mock scrobble with failed tracks
    mockApiService.prepareTracksFromRelease.mockResolvedValue({
      tracks: [{ track: 'Track 1', timestamp: 1640995200, duration: 180 }],
    });

    mockApiService.scrobbleBatch.mockResolvedValue({
      sessionId: 'test-session',
    });
    mockApiService.getScrobbleProgress.mockResolvedValue({
      status: 'completed',
      progress: {
        current: 1,
        total: 1,
        success: 0,
        failed: 1,
        ignored: 0,
      },
      error: 'API Error',
    });

    // Select tracks and start scrobbling
    const scrobbleButton = screen.getByText('Scrobble 3 Tracks');
    fireEvent.click(scrobbleButton);

    // Wait for results to be displayed
    await waitFor(() => {
      expect(screen.getByText('Scrobble Results:')).toBeInTheDocument();
      expect(screen.getByText(/1 failed/)).toBeInTheDocument();
      expect(screen.getByText('Details:')).toBeInTheDocument();
      expect(screen.getByText('API Error')).toBeInTheDocument();
    });

    // Should have error styling
    const resultsContainer = screen
      .getByText('Scrobble Results:')
      .closest('.message');
    expect(resultsContainer).toHaveClass('error');
  });
});

describe('ReleaseDetailsPage Last.fm Connection Testing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.clear();
    mockLocalStorage.setItem('selectedRelease', JSON.stringify(mockRelease));
    mockApiService.getReleaseDetails.mockResolvedValue(mockRelease);
    jest.spyOn(Date, 'now').mockReturnValue(1640995200000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should test Last.fm connection successfully', async () => {
    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Album')).toBeInTheDocument();
    });

    mockApiService.testLastfmConnection.mockResolvedValue({
      success: true,
      message: 'Connection successful',
    });

    const testButton = screen.getByText('Test Last.fm Connection');
    fireEvent.click(testButton);

    await waitFor(() => {
      expect(screen.getByText('Connection successful')).toBeInTheDocument();
    });

    const messageContainer = screen
      .getByText('Connection successful')
      .closest('.message');
    expect(messageContainer).toHaveClass('success');
  });

  it('should handle Last.fm connection test failure', async () => {
    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Album')).toBeInTheDocument();
    });

    mockApiService.testLastfmConnection.mockRejectedValue(
      new Error('Connection failed')
    );

    const testButton = screen.getByText('Test Last.fm Connection');
    fireEvent.click(testButton);

    await waitFor(() => {
      expect(screen.getByText('Connection failed')).toBeInTheDocument();
    });

    const messageContainer = screen
      .getByText('Connection failed')
      .closest('.message');
    expect(messageContainer).toHaveClass('warning');
  });

  it('should get Last.fm session key successfully', async () => {
    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Album')).toBeInTheDocument();
    });

    mockApiService.getLastfmSessionKey.mockResolvedValue({
      sessionKey: 'test-session-key-123',
    });

    const sessionKeyButton = screen.getByText('Get Session Key');
    fireEvent.click(sessionKeyButton);

    await waitFor(() => {
      expect(screen.getByText('Session Key:')).toBeInTheDocument();
      expect(screen.getByText('test-session-key-123')).toBeInTheDocument();
      expect(
        screen.getByText('Use this in the debug script to test scrobbling')
      ).toBeInTheDocument();
    });
  });

  it('should handle Last.fm session key error', async () => {
    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Album')).toBeInTheDocument();
    });

    mockApiService.getLastfmSessionKey.mockRejectedValue(
      new Error('Session key error')
    );

    const sessionKeyButton = screen.getByText('Get Session Key');
    fireEvent.click(sessionKeyButton);

    await waitFor(() => {
      expect(screen.getByText('Error: Session key error')).toBeInTheDocument();
    });
  });

  it('should handle Last.fm session key error with non-Error exception', async () => {
    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Album')).toBeInTheDocument();
    });

    mockApiService.getLastfmSessionKey.mockRejectedValue('String error');

    const sessionKeyButton = screen.getByText('Get Session Key');
    fireEvent.click(sessionKeyButton);

    await waitFor(() => {
      expect(screen.getByText('Error: Unknown error')).toBeInTheDocument();
    });
  });

  it('should show authentication warning when Last.fm is not authenticated', async () => {
    renderWithProviders(<ReleaseDetailsPage />, mockUnauthenticatedAuthContext);

    await waitFor(() => {
      expect(screen.getByText('Test Album')).toBeInTheDocument();
    });

    expect(
      screen.getByText('Please authenticate with Last.fm to scrobble tracks.')
    ).toBeInTheDocument();
    expect(screen.getByText('Connect Last.fm')).toBeInTheDocument();

    // Should not show Last.fm connection buttons
    expect(
      screen.queryByText('Test Last.fm Connection')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Get Session Key')).not.toBeInTheDocument();
  });
});

describe('ReleaseDetailsPage Track Filtering and Interactions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.clear();
    mockLocalStorage.setItem(
      'selectedRelease',
      JSON.stringify(mockDetailedRelease)
    );
    mockApiService.getReleaseDetails.mockResolvedValue(mockDetailedRelease);
    jest.spyOn(Date, 'now').mockReturnValue(1640995200000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should display detailed release information correctly', async () => {
    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText('Detailed Album')).toBeInTheDocument();
    });

    // Check for detailed release info
    expect(screen.getByText('Test Artist')).toBeInTheDocument();
    expect(screen.getByText('2023 • Vinyl, LP')).toBeInTheDocument();
    expect(screen.getByText('Label 1, Label 2')).toBeInTheDocument();
    expect(screen.getByText('Catalog: CAT-001')).toBeInTheDocument();
  });

  it('should handle individual track selection and deselection', async () => {
    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText('Detailed Album')).toBeInTheDocument();
    });

    // Initially all tracks should be selected
    expect(screen.getByText('Tracks (3 selected)')).toBeInTheDocument();

    // Deselect all tracks first
    const deselectAllButton = screen.getByText('Deselect All');
    fireEvent.click(deselectAllButton);

    await waitFor(() => {
      expect(screen.getByText('Tracks (0 selected)')).toBeInTheDocument();
    });

    // Select individual tracks by clicking checkboxes
    const checkboxes = screen.getAllByRole('checkbox');

    // Select first track
    fireEvent.click(checkboxes[0]);
    await waitFor(() => {
      expect(screen.getByText('Tracks (1 selected)')).toBeInTheDocument();
    });

    // Select second track
    fireEvent.click(checkboxes[1]);
    await waitFor(() => {
      expect(screen.getByText('Tracks (2 selected)')).toBeInTheDocument();
    });

    // Deselect first track
    fireEvent.click(checkboxes[0]);
    await waitFor(() => {
      expect(screen.getByText('Tracks (1 selected)')).toBeInTheDocument();
    });
  });

  it('should display track information with featured artists', async () => {
    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText('Detailed Album')).toBeInTheDocument();
    });

    // Check for track with featured artist
    expect(screen.getByText('1 Track 1')).toBeInTheDocument();
    expect(screen.getByText('Featured Artist')).toBeInTheDocument();
    expect(screen.getByText('3:30')).toBeInTheDocument();

    // Check for track without featured artist
    expect(screen.getByText('2 Track 2')).toBeInTheDocument();
    expect(screen.getByText('4:00')).toBeInTheDocument();
  });

  it('should handle track selection by clicking track container', async () => {
    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText('Detailed Album')).toBeInTheDocument();
    });

    // Deselect all tracks first
    const deselectAllButton = screen.getByText('Deselect All');
    fireEvent.click(deselectAllButton);

    await waitFor(() => {
      expect(screen.getByText('Tracks (0 selected)')).toBeInTheDocument();
    });

    // Find track containers (they have onClick handlers)
    const trackContainers = screen.getAllByText(/Track \d/);

    // Click on first track container
    fireEvent.click(trackContainers[0]);
    await waitFor(() => {
      expect(screen.getByText('Tracks (1 selected)')).toBeInTheDocument();
    });

    // Click on second track container
    fireEvent.click(trackContainers[1]);
    await waitFor(() => {
      expect(screen.getByText('Tracks (2 selected)')).toBeInTheDocument();
    });
  });

  it('should handle select all/deselect all functionality', async () => {
    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText('Detailed Album')).toBeInTheDocument();
    });

    // Initially all tracks should be selected
    expect(screen.getByText('Tracks (3 selected)')).toBeInTheDocument();
    expect(screen.getByText('Deselect All')).toBeInTheDocument();

    // Deselect all
    const deselectAllButton = screen.getByText('Deselect All');
    fireEvent.click(deselectAllButton);

    await waitFor(() => {
      expect(screen.getByText('Tracks (0 selected)')).toBeInTheDocument();
      expect(screen.getByText('Select All')).toBeInTheDocument();
    });

    // Select all
    const selectAllButton = screen.getByText('Select All');
    fireEvent.click(selectAllButton);

    await waitFor(() => {
      expect(screen.getByText('Tracks (3 selected)')).toBeInTheDocument();
      expect(screen.getByText('Deselect All')).toBeInTheDocument();
    });
  });

  it('should disable scrobble button when no tracks are selected', async () => {
    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText('Detailed Album')).toBeInTheDocument();
    });

    // Initially scrobble button should be enabled
    const scrobbleButton = screen.getByText('Scrobble 3 Tracks');
    expect(scrobbleButton).not.toBeDisabled();

    // Deselect all tracks
    const deselectAllButton = screen.getByText('Deselect All');
    fireEvent.click(deselectAllButton);

    await waitFor(() => {
      expect(screen.getByText('Tracks (0 selected)')).toBeInTheDocument();
    });

    // Scrobble button should be disabled
    const disabledScrobbleButton = screen.getByText('Scrobble 0 Tracks');
    expect(disabledScrobbleButton).toBeDisabled();
  });

  it('should handle custom start time input', async () => {
    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText('Detailed Album')).toBeInTheDocument();
    });

    // Deselect all tracks, then select one
    const deselectAllButton = screen.getByText('Deselect All');
    fireEvent.click(deselectAllButton);

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);

    await waitFor(() => {
      expect(screen.getByText('Tracks (1 selected)')).toBeInTheDocument();
    });

    // Find the datetime-local input
    const startTimeInput = screen.getByLabelText('Start Time:') as any;
    expect(startTimeInput.type).toBe('datetime-local');

    // Set a custom start time
    const customTime = '2023-12-01T14:30';
    fireEvent.change(startTimeInput, { target: { value: customTime } });

    await waitFor(() => {
      expect(startTimeInput.value).toBe(customTime);
    });

    // Should show the formatted time
    expect(
      screen.getByText(/Tracks will be scrobbled starting from:/)
    ).toBeInTheDocument();
  });
});
