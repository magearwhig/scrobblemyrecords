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
  getScrobbleProgress: jest.fn()
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

const mockAuthContext = {
  authStatus: {
    lastfm: { authenticated: true, username: 'testuser' },
    discogs: { authenticated: true, username: 'testuser' }
  },
  login: jest.fn(),
  logout: jest.fn()
};

const mockAppContext = {
  state: { serverUrl: 'http://localhost:3001' },
  dispatch: jest.fn()
};

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <AuthProvider value={mockAuthContext}>
      <AppProvider value={mockAppContext}>
        {component}
      </AppProvider>
    </AuthProvider>
  );
};

describe('ReleaseDetailsPage Auto Timing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(JSON.stringify(mockRelease));
    
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

    // Select some tracks
    const track1Checkbox = screen.getByLabelText(/Track 1/);
    const track2Checkbox = screen.getByLabelText(/Track 2/);
    
    fireEvent.click(track1Checkbox);
    fireEvent.click(track2Checkbox);

    // Click auto timing button
    const autoTimingButton = screen.getByText('Auto Timing (Just Finished)');
    fireEvent.click(autoTimingButton);

    // Verify that the start time input is populated
    const startTimeInput = screen.getByDisplayValue(/2021-12-31T23:52/);
    expect(startTimeInput).toBeInTheDocument();

    // The calculation should be:
    // Track 1: 3:30 = 210 seconds
    // Track 2: 4:00 = 240 seconds  
    // Total with gaps: 210 + 1 + 240 + 1 = 452 seconds
    // Start time should be current time (1640995200000) minus 452000ms
    // Which equals 1640994748000 = 2021-12-31T23:52:28
  });

  it('should disable auto timing button when no tracks are selected', async () => {
    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Album')).toBeInTheDocument();
    });

    const autoTimingButton = screen.getByText('Auto Timing (Just Finished)');
    expect(autoTimingButton).toBeDisabled();
  });

  it('should show clear button when start time is set', async () => {
    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Album')).toBeInTheDocument();
    });

    // Select a track and use auto timing
    const track1Checkbox = screen.getByLabelText(/Track 1/);
    fireEvent.click(track1Checkbox);

    const autoTimingButton = screen.getByText('Auto Timing (Just Finished)');
    fireEvent.click(autoTimingButton);

    // Clear button should appear
    const clearButton = screen.getByText('Clear');
    expect(clearButton).toBeInTheDocument();

    // Click clear button
    fireEvent.click(clearButton);

    // Start time should be cleared
    const startTimeInput = screen.getByRole('textbox', { name: /start time/i });
    expect(startTimeInput).toHaveValue('');
  });

  it('should show appropriate help text based on timing state', async () => {
    renderWithProviders(<ReleaseDetailsPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Album')).toBeInTheDocument();
    });

    // Select a track
    const track1Checkbox = screen.getByLabelText(/Track 1/);
    fireEvent.click(track1Checkbox);

    // Initially should show default timing message
    expect(screen.getByText(/Tracks will be scrobbled with realistic timing/)).toBeInTheDocument();

    // Use auto timing
    const autoTimingButton = screen.getByText('Auto Timing (Just Finished)');
    fireEvent.click(autoTimingButton);

    // Should show auto timing message
    expect(screen.getByText(/Auto timing: Tracks will end at current time/)).toBeInTheDocument();
  });
});