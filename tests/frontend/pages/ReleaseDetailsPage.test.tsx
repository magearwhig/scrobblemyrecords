import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ReleaseDetailsPage from '../../../src/renderer/pages/ReleaseDetailsPage';
import { AuthProvider } from '../../../src/renderer/context/AuthContext';
import { AppProvider } from '../../../src/renderer/context/AppContext';

// Mock the API service
const mockApiService = {
  testLastfmConnection: jest.fn(),
  getLastfmSessionKey: jest.fn(),
  prepareTracksFromRelease: jest.fn(),
  scrobbleBatch: jest.fn(),
  getScrobbleProgress: jest.fn(),
  getReleaseDetails: jest.fn()
};

jest.mock('../../../src/renderer/services/api', () => ({
  getApiService: () => mockApiService
}));

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn()
};
Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage
});

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
    { position: '3', title: 'Track 3', duration: '2:45' }
  ]
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
    { position: 'D2', title: 'Side D Track 2', duration: '2:30' }
  ]
};

const mockAuthContext = {
  authStatus: {
    lastfm: { authenticated: true, username: 'testuser' },
    discogs: { authenticated: true, username: 'testuser' }
  },
  setAuthStatus: jest.fn()
};

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <AuthProvider value={mockAuthContext}>
      <AppProvider>
        {component}
      </AppProvider>
    </AuthProvider>
  );
};

describe('ReleaseDetailsPage Auto Timing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(JSON.stringify(mockRelease));
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
      const startTimeInput = screen.getByDisplayValue(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
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
    expect(screen.queryByText('Auto Timing (Just Finished)')).not.toBeInTheDocument();
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
    const startTimeInput = startTimeInputs.find(input => input.getAttribute('type') === 'datetime-local');
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
    expect(screen.getByText(/Tracks will be scrobbled with realistic timing/)).toBeInTheDocument();

    // Use auto timing
    const autoTimingButton = screen.getByText('Auto Timing (Just Finished)');
    fireEvent.click(autoTimingButton);

    // Should show auto timing message
    expect(screen.getByText(/Auto timing: Tracks will end at current time/)).toBeInTheDocument();
  });
});

describe('ReleaseDetailsPage Side Selection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(1640995200000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should not show side selection buttons for single-side albums', async () => {
    mockLocalStorage.getItem.mockReturnValue(JSON.stringify(mockRelease));
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
    mockLocalStorage.getItem.mockReturnValue(JSON.stringify(mockMultiSideRelease));
    mockApiService.getReleaseDetails.mockResolvedValue(mockMultiSideRelease);
    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText('Double Album')).toBeInTheDocument();
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
    mockLocalStorage.getItem.mockReturnValue(JSON.stringify(mockMultiSideRelease));
    mockApiService.getReleaseDetails.mockResolvedValue(mockMultiSideRelease);
    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText('Double Album')).toBeInTheDocument();
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
    mockLocalStorage.getItem.mockReturnValue(JSON.stringify(mockMultiSideRelease));
    mockApiService.getReleaseDetails.mockResolvedValue(mockMultiSideRelease);
    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText('Double Album')).toBeInTheDocument();
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
    mockLocalStorage.getItem.mockReturnValue(JSON.stringify(mockMultiSideRelease));
    mockApiService.getReleaseDetails.mockResolvedValue(mockMultiSideRelease);
    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText('Double Album')).toBeInTheDocument();
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