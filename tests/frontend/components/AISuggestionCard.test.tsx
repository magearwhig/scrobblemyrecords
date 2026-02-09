import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import '@testing-library/jest-dom';

import AISuggestionCard from '../../../src/renderer/components/AISuggestionCard';
import { AISuggestion } from '../../../src/shared/types';

describe('AISuggestionCard', () => {
  let user: ReturnType<typeof userEvent.setup>;
  const mockRelease = {
    id: 789,
    title: 'Test Album',
    artist: 'Test Artist',
    year: 2020,
    format: ['Vinyl', 'LP'],
    label: ['Test Label'],
    resource_url: 'https://test.com',
    cover_image: 'https://example.com/cover.jpg',
  };

  const mockSuggestion: AISuggestion = {
    album: {
      id: 123,
      folder_id: 0,
      rating: 4,
      date_added: '2024-01-01T00:00:00Z',
      release: mockRelease,
    },
    reasoning:
      'This album fits your recent listening patterns and the current time of day.',
    confidence: 'high',
    mood: 'relaxing',
  };

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    // Reset hash
    window.location.hash = '';
    user = userEvent.setup();
  });

  describe('loading state', () => {
    it('should show loading spinner when loading is true', () => {
      render(<AISuggestionCard suggestion={mockSuggestion} loading={true} />);
      expect(screen.getByText('AI is thinking...')).toBeInTheDocument();
    });

    it('should show loading class', () => {
      const { container } = render(
        <AISuggestionCard suggestion={mockSuggestion} loading={true} />
      );
      expect(
        container.querySelector('.ai-suggestion-loading')
      ).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('should show empty state when album is null', () => {
      const emptySuggestion = {
        ...mockSuggestion,
        album: null as any,
      };
      render(<AISuggestionCard suggestion={emptySuggestion} />);
      expect(
        screen.getByText('No AI suggestion available')
      ).toBeInTheDocument();
    });

    it('should show empty state when release is null', () => {
      const emptySuggestion = {
        album: {
          id: 123,
          folder_id: 0,
          rating: 4,
          date_added: '2024-01-01T00:00:00Z',
          release: undefined,
        },
        reasoning: mockSuggestion.reasoning,
        confidence: mockSuggestion.confidence,
      } as unknown as AISuggestion;
      render(<AISuggestionCard suggestion={emptySuggestion} />);
      expect(
        screen.getByText('No AI suggestion available')
      ).toBeInTheDocument();
    });

    it('should show Try Again button when onRefresh is provided in empty state', async () => {
      const onRefresh = jest.fn();
      const emptySuggestion = { ...mockSuggestion, album: null as any };
      render(
        <AISuggestionCard suggestion={emptySuggestion} onRefresh={onRefresh} />
      );

      const button = screen.getByRole('button', { name: 'Try Again' });
      expect(button).toBeInTheDocument();

      await user.click(button);
      expect(onRefresh).toHaveBeenCalled();
    });

    it('should not show Try Again button when onRefresh is not provided', () => {
      const emptySuggestion = { ...mockSuggestion, album: null as any };
      render(<AISuggestionCard suggestion={emptySuggestion} />);

      expect(
        screen.queryByRole('button', { name: 'Try Again' })
      ).not.toBeInTheDocument();
    });
  });

  describe('normal state', () => {
    it('should display album information', () => {
      render(<AISuggestionCard suggestion={mockSuggestion} />);

      expect(screen.getByText('Test Album')).toBeInTheDocument();
      expect(screen.getByText('Test Artist')).toBeInTheDocument();
      expect(screen.getByText(/2020.*•.*Vinyl, LP/)).toBeInTheDocument();
    });

    it('should display AI badge', () => {
      render(<AISuggestionCard suggestion={mockSuggestion} />);

      expect(screen.getByText('AI Pick')).toBeInTheDocument();
    });

    it('should display mood when provided', () => {
      render(<AISuggestionCard suggestion={mockSuggestion} />);

      expect(screen.getByText('relaxing')).toBeInTheDocument();
    });

    it('should not display mood when not provided', () => {
      const noMoodSuggestion = { ...mockSuggestion, mood: undefined };
      render(<AISuggestionCard suggestion={noMoodSuggestion} />);

      expect(screen.queryByText('relaxing')).not.toBeInTheDocument();
    });

    it('should display high confidence label', () => {
      render(<AISuggestionCard suggestion={mockSuggestion} />);
      expect(screen.getByText('High confidence')).toBeInTheDocument();
    });

    it('should display medium confidence label', () => {
      const mediumConfSuggestion = {
        ...mockSuggestion,
        confidence: 'medium' as const,
      };
      render(<AISuggestionCard suggestion={mediumConfSuggestion} />);
      expect(screen.getByText('Medium confidence')).toBeInTheDocument();
    });

    it('should display low confidence label', () => {
      const lowConfSuggestion = {
        ...mockSuggestion,
        confidence: 'low' as const,
      };
      render(<AISuggestionCard suggestion={lowConfSuggestion} />);
      expect(screen.getByText('Low confidence')).toBeInTheDocument();
    });

    it('should handle unknown confidence gracefully', () => {
      const unknownConfSuggestion = {
        ...mockSuggestion,
        confidence: 'unknown' as any,
      };
      render(<AISuggestionCard suggestion={unknownConfSuggestion} />);
      // Should show "Unknown" for unknown confidence
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });
  });

  describe('cover image', () => {
    it('should show cover image when provided', () => {
      const { container } = render(
        <AISuggestionCard suggestion={mockSuggestion} />
      );

      const cover = container.querySelector('.ai-suggestion-cover');
      expect(cover).toHaveStyle({
        backgroundImage: 'url(https://example.com/cover.jpg)',
      });
    });

    it('should show emoji fallback when no cover image', () => {
      const noCoverRelease = { ...mockRelease, cover_image: null };
      const noCoverSuggestion = {
        album: {
          id: 123,
          folder_id: 0,
          rating: 4,
          date_added: '2024-01-01T00:00:00Z',
          release: noCoverRelease,
        },
        reasoning: mockSuggestion.reasoning,
        confidence: mockSuggestion.confidence,
        mood: mockSuggestion.mood,
      } as unknown as AISuggestion;
      render(<AISuggestionCard suggestion={noCoverSuggestion} />);

      // The emoji is in the cover div as text content
      expect(screen.getByTitle('View album details')).toBeInTheDocument();
    });
  });

  describe('reasoning toggle', () => {
    it('should initially hide reasoning', () => {
      render(<AISuggestionCard suggestion={mockSuggestion} />);

      expect(
        screen.queryByText(mockSuggestion.reasoning)
      ).not.toBeInTheDocument();
      expect(screen.getByText('Why did AI pick this?')).toBeInTheDocument();
    });

    it('should show reasoning when toggle is clicked', async () => {
      render(<AISuggestionCard suggestion={mockSuggestion} />);

      await user.click(screen.getByText('Why did AI pick this?'));

      expect(screen.getByText(mockSuggestion.reasoning)).toBeInTheDocument();
      expect(screen.getByText('Hide AI reasoning')).toBeInTheDocument();
    });

    it('should hide reasoning when toggle is clicked again', async () => {
      render(<AISuggestionCard suggestion={mockSuggestion} />);

      // Show reasoning
      await user.click(screen.getByText('Why did AI pick this?'));
      expect(screen.getByText(mockSuggestion.reasoning)).toBeInTheDocument();

      // Hide reasoning
      await user.click(screen.getByText('Hide AI reasoning'));
      expect(
        screen.queryByText(mockSuggestion.reasoning)
      ).not.toBeInTheDocument();
    });
  });

  describe('actions', () => {
    it('should navigate to collection when View in Collection is clicked', async () => {
      render(<AISuggestionCard suggestion={mockSuggestion} />);

      await user.click(
        screen.getByRole('button', { name: 'View in Collection' })
      );

      expect(window.location.hash).toBe('#collection?highlight=123');
    });

    it('should navigate to release details when Details is clicked', async () => {
      render(<AISuggestionCard suggestion={mockSuggestion} />);

      await user.click(screen.getByRole('button', { name: 'Details' }));

      expect(window.location.hash).toBe('#release-details');
    });

    it('should navigate to release details when cover is clicked', async () => {
      render(<AISuggestionCard suggestion={mockSuggestion} />);

      await user.click(screen.getByTitle('View album details'));

      expect(window.location.hash).toBe('#release-details');
    });

    it('should not navigate when album id is falsy', async () => {
      const noIdSuggestion = {
        album: {
          id: 0, // Use falsy id
          folder_id: 0,
          rating: 4,
          date_added: '2024-01-01T00:00:00Z',
          release: mockRelease,
        },
        reasoning: mockSuggestion.reasoning,
        confidence: mockSuggestion.confidence,
      } as unknown as AISuggestion;
      render(<AISuggestionCard suggestion={noIdSuggestion} />);

      await user.click(
        screen.getByRole('button', { name: 'View in Collection' })
      );

      // Hash should be empty since navigation didn't happen (id is falsy)
      expect(window.location.hash).toBe('');
    });

    it('should show refresh button when onRefresh is provided', async () => {
      const onRefresh = jest.fn();
      render(
        <AISuggestionCard suggestion={mockSuggestion} onRefresh={onRefresh} />
      );

      const refreshButton = screen.getByTitle('Get another AI suggestion');
      expect(refreshButton).toBeInTheDocument();

      await user.click(refreshButton);
      expect(onRefresh).toHaveBeenCalled();
    });

    it('should not show refresh button when onRefresh is not provided', () => {
      render(<AISuggestionCard suggestion={mockSuggestion} />);

      expect(
        screen.queryByTitle('Get another AI suggestion')
      ).not.toBeInTheDocument();
    });
  });

  describe('year and format fallbacks', () => {
    it('should show Unknown Year when year is missing', () => {
      const releaseWithoutYear = { ...mockRelease, year: 0 };
      const noYearSuggestion = {
        ...mockSuggestion,
        album: {
          id: 123,
          folder_id: 0,
          rating: 4,
          date_added: '2024-01-01T00:00:00Z',
          release: releaseWithoutYear,
        },
      } as AISuggestion;
      render(<AISuggestionCard suggestion={noYearSuggestion} />);

      expect(screen.getByText(/Unknown Year/)).toBeInTheDocument();
    });

    it('should show Unknown Format when format is missing', () => {
      const releaseWithoutFormat = { ...mockRelease, format: undefined } as any;
      const noFormatSuggestion = {
        ...mockSuggestion,
        album: {
          id: 123,
          folder_id: 0,
          rating: 4,
          date_added: '2024-01-01T00:00:00Z',
          release: releaseWithoutFormat,
        },
      } as unknown as AISuggestion;
      render(<AISuggestionCard suggestion={noFormatSuggestion} />);

      expect(screen.getByText(/Unknown Format/)).toBeInTheDocument();
    });
  });
});
