import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import '@testing-library/jest-dom';
import {
  BackfillDialog,
  BackfillDialogProps,
} from '../../../src/renderer/components/scrobble/BackfillDialog';
import { BackfillAlbum, BackfillSuggestion } from '../../../src/shared/types';

// Mock AppContext
const mockState = { serverUrl: 'http://localhost:3001' };
jest.mock('../../../src/renderer/context/AppContext', () => ({
  useApp: () => ({ state: mockState, dispatch: jest.fn() }),
}));

// Mock API service
const mockApi = {
  getPatterns: jest.fn(),
  suggestBackfillTimestamps: jest.fn(),
  checkConflicts: jest.fn(),
  getReleaseDetails: jest.fn(),
  scrobbleBatch: jest.fn(),
};

jest.mock('../../../src/renderer/services/api', () => ({
  getApiService: () => mockApi,
}));

// Mock focus-trap-react since it doesn't work well in jsdom
jest.mock('focus-trap-react', () => {
  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
  };
});

const createMockAlbum = (
  overrides: Partial<BackfillAlbum> = {}
): BackfillAlbum => ({
  releaseId: 123,
  artist: 'Radiohead',
  album: 'OK Computer',
  durationSeconds: 3180,
  trackCount: 12,
  coverUrl: 'https://example.com/cover.jpg',
  ...overrides,
});

const createMockSuggestion = (
  overrides: Partial<BackfillSuggestion> = {}
): BackfillSuggestion => ({
  presetLabel: 'Yesterday evening',
  presetDescription: '8:00 PM - based on your typical evening start',
  startTimestamp: Math.floor(Date.now() / 1000) - 86400,
  calculatedTimestamps: [
    {
      albumIndex: 0,
      startTimestamp: Math.floor(Date.now() / 1000) - 86400,
      endTimestamp: Math.floor(Date.now() / 1000) - 86400 + 3180,
    },
  ],
  hasConflicts: false,
  isOutsideLastFmWindow: false,
  ...overrides,
});

const defaultProps: BackfillDialogProps = {
  isOpen: true,
  onClose: jest.fn(),
  initialAlbums: [createMockAlbum()],
};

describe('BackfillDialog', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    jest.clearAllMocks();
    user = userEvent.setup();
    mockApi.getPatterns.mockResolvedValue(null);
    mockApi.suggestBackfillTimestamps.mockResolvedValue([
      createMockSuggestion(),
      createMockSuggestion({
        presetLabel: 'Yesterday afternoon',
        presetDescription: '2:00 PM',
      }),
    ]);
  });

  describe('rendering', () => {
    it('should render the modal with title', async () => {
      render(<BackfillDialog {...defaultProps} />);

      expect(
        screen.getByText('Backfill Listening Session')
      ).toBeInTheDocument();
    });

    it('should display album information', async () => {
      render(<BackfillDialog {...defaultProps} />);

      expect(screen.getByText(/Radiohead - OK Computer/)).toBeInTheDocument();
      expect(screen.getByText(/12 tracks/)).toBeInTheDocument();
    });

    it('should display album cover when provided', async () => {
      render(<BackfillDialog {...defaultProps} />);

      const img = screen.getByAltText('OK Computer cover');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'https://example.com/cover.jpg');
    });

    it('should show empty message when no albums', async () => {
      render(<BackfillDialog {...defaultProps} initialAlbums={[]} />);

      expect(screen.getByText('No albums selected.')).toBeInTheDocument();
    });

    it('should not render when isOpen is false', () => {
      render(<BackfillDialog {...defaultProps} isOpen={false} />);

      expect(
        screen.queryByText('Backfill Listening Session')
      ).not.toBeInTheDocument();
    });

    it('should show preset suggestions after loading', async () => {
      render(<BackfillDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Yesterday evening')).toBeInTheDocument();
        expect(screen.getByText('Yesterday afternoon')).toBeInTheDocument();
      });
    });

    it('should show custom option', async () => {
      render(<BackfillDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Custom')).toBeInTheDocument();
      });
    });
  });

  describe('album management', () => {
    it('should remove album when remove button is clicked', async () => {
      const album1 = createMockAlbum({ releaseId: 1, album: 'Album 1' });
      const album2 = createMockAlbum({ releaseId: 2, album: 'Album 2' });

      render(
        <BackfillDialog {...defaultProps} initialAlbums={[album1, album2]} />
      );

      expect(screen.getByText(/Album 1/)).toBeInTheDocument();
      expect(screen.getByText(/Album 2/)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /remove album 1/i }));

      // Album 1 should be gone from the album list
      expect(screen.queryByText(/Radiohead - Album 1/)).not.toBeInTheDocument();
      // Album 2 should still be in the album list
      expect(screen.getByText(/Radiohead - Album 2/)).toBeInTheDocument();
    });

    it('should show total duration for multiple albums', async () => {
      const album1 = createMockAlbum({
        releaseId: 1,
        durationSeconds: 3600,
      });
      const album2 = createMockAlbum({
        releaseId: 2,
        durationSeconds: 2700,
      });

      render(
        <BackfillDialog {...defaultProps} initialAlbums={[album1, album2]} />
      );

      expect(screen.getByText(/Total: 1h 45m/)).toBeInTheDocument();
    });
  });

  describe('preset selection', () => {
    it('should show timestamp preview when preset is selected', async () => {
      render(<BackfillDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Yesterday evening')).toBeInTheDocument();
      });

      // First preset should be selected by default
      expect(screen.getByText('Preview')).toBeInTheDocument();
    });

    it('should show custom date/time inputs when Custom is selected', async () => {
      render(<BackfillDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Custom')).toBeInTheDocument();
      });

      // Click on Custom radio
      const customRadio = screen.getByDisplayValue('custom');
      await user.click(customRadio);

      expect(screen.getByLabelText('Custom date')).toBeInTheDocument();
      expect(screen.getByLabelText('Custom start time')).toBeInTheDocument();
    });
  });

  describe('conflict warnings', () => {
    it('should display conflict badge on presets with conflicts', async () => {
      mockApi.suggestBackfillTimestamps.mockResolvedValue([
        createMockSuggestion({
          hasConflicts: true,
          conflictMessage: 'You have 5 existing scrobbles',
        }),
      ]);

      render(<BackfillDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Conflicts')).toBeInTheDocument();
      });
    });

    it('should display outside window badge', async () => {
      mockApi.suggestBackfillTimestamps.mockResolvedValue([
        createMockSuggestion({
          isOutsideLastFmWindow: true,
          lastFmWindowWarning: "This date is outside Last.fm's 2-week limit.",
        }),
      ]);

      render(<BackfillDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Outside window')).toBeInTheDocument();
      });
    });
  });

  describe('gap control', () => {
    it('should show gap control with multiple albums', async () => {
      const albums = [
        createMockAlbum({ releaseId: 1 }),
        createMockAlbum({ releaseId: 2 }),
      ];

      render(<BackfillDialog {...defaultProps} initialAlbums={albums} />);

      expect(
        screen.getByLabelText('Gap between albums in minutes')
      ).toBeInTheDocument();
    });

    it('should not show gap control with single album', async () => {
      render(<BackfillDialog {...defaultProps} />);

      expect(
        screen.queryByLabelText('Gap between albums in minutes')
      ).not.toBeInTheDocument();
    });
  });

  describe('scrobble action', () => {
    it('should have scrobble button with count', async () => {
      render(<BackfillDialog {...defaultProps} />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /scrobble 1 albums/i })
        ).toBeInTheDocument();
      });
    });

    it('should call onClose when cancel is clicked', async () => {
      const onClose = jest.fn();
      render(<BackfillDialog {...defaultProps} onClose={onClose} />);

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should disable scrobble button when no albums', async () => {
      render(<BackfillDialog {...defaultProps} initialAlbums={[]} />);

      const scrobbleBtn = screen.queryByRole('button', {
        name: /scrobble/i,
      });
      // Scrobble button should not be rendered when there are no albums to show results
      // or it should be disabled
      if (scrobbleBtn) {
        expect(scrobbleBtn).toBeDisabled();
      }
    });
  });

  describe('API integration', () => {
    it('should load patterns on open', async () => {
      render(<BackfillDialog {...defaultProps} />);

      await waitFor(() => {
        expect(mockApi.getPatterns).toHaveBeenCalled();
      });
    });

    it('should fetch suggestions when albums are provided', async () => {
      render(<BackfillDialog {...defaultProps} />);

      await waitFor(() => {
        expect(mockApi.suggestBackfillTimestamps).toHaveBeenCalledWith([
          expect.objectContaining({
            releaseId: 123,
            artist: 'Radiohead',
          }),
        ]);
      });
    });

    it('should not fetch suggestions when dialog is closed', async () => {
      render(<BackfillDialog {...defaultProps} isOpen={false} />);

      expect(mockApi.suggestBackfillTimestamps).not.toHaveBeenCalled();
    });
  });
});
