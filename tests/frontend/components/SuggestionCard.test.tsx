import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import SuggestionCard from '../../../src/renderer/components/SuggestionCard';
import { SuggestionResult, SuggestionFactors } from '../../../src/shared/types';

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  clear: jest.fn(),
  removeItem: jest.fn(),
  length: 0,
  key: jest.fn(),
};

const mockFactors: SuggestionFactors = {
  recencyGap: 30,
  neverPlayed: false,
  recentAddition: 10,
  artistAffinity: 0.8,
  eraPreference: 0.5,
  userRating: 4,
  timeOfDay: 0.7,
  diversityPenalty: 0.1,
  albumCompleteness: 0.9,
};

const mockSuggestion: SuggestionResult = {
  album: {
    id: 123,
    folder_id: 0,
    rating: 4,
    date_added: '2024-01-01T00:00:00Z',
    release: {
      id: 789,
      title: 'Test Album',
      artist: 'Test Artist',
      year: 2020,
      format: ['Vinyl'],
      label: ['Test Label'],
      resource_url: 'https://test.com',
    },
  },
  score: 0.85,
  factors: mockFactors,
  reason: "Highly rated album you haven't played in a while",
};

describe('SuggestionCard', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    jest.clearAllMocks();
    user = userEvent.setup();
    // Set up localStorage mock before each test
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true,
    });
  });

  it('renders suggestion with album title and artist', () => {
    render(<SuggestionCard suggestion={mockSuggestion} />);

    expect(screen.getByText('Test Album')).toBeInTheDocument();
    expect(screen.getByText('Test Artist')).toBeInTheDocument();
  });

  it('displays the reason for the suggestion', () => {
    render(<SuggestionCard suggestion={mockSuggestion} />);

    expect(
      screen.getByText("Highly rated album you haven't played in a while")
    ).toBeInTheDocument();
  });

  it('shows score when showScore is true', () => {
    render(<SuggestionCard suggestion={mockSuggestion} showScore={true} />);

    // Score is displayed as "Score: 0.85"
    expect(screen.getByText('Score: 0.85')).toBeInTheDocument();
  });

  it('does not show score when showScore is false', () => {
    render(<SuggestionCard suggestion={mockSuggestion} showScore={false} />);

    expect(screen.queryByText('Score: 0.85')).not.toBeInTheDocument();
  });

  it('toggles factor details when "Why this suggestion?" button is clicked', async () => {
    render(<SuggestionCard suggestion={mockSuggestion} />);

    // Factors should not be visible initially (factor labels have colon suffix)
    expect(screen.queryByText('Last Played:')).not.toBeInTheDocument();

    // Click "Why this suggestion?" button
    const whyButton = screen.getByText('Why this suggestion?');
    await user.click(whyButton);

    // Factors should now be visible
    expect(screen.getByText('Last Played:')).toBeInTheDocument();
    expect(screen.getByText('Artist Affinity:')).toBeInTheDocument();

    // Click again to hide
    await user.click(screen.getByText('Hide details'));
    expect(screen.queryByText('Last Played:')).not.toBeInTheDocument();
  });

  it('calls onDismiss when dismiss button is clicked', async () => {
    const onDismiss = jest.fn();
    render(
      <SuggestionCard suggestion={mockSuggestion} onDismiss={onDismiss} />
    );

    // Find and click dismiss button (title is "Dismiss this suggestion")
    const dismissButton = screen.getByTitle('Dismiss this suggestion');
    await user.click(dismissButton);

    expect(onDismiss).toHaveBeenCalledWith(123);
  });

  it('does not render dismiss button when onDismiss is not provided', () => {
    render(<SuggestionCard suggestion={mockSuggestion} />);

    expect(
      screen.queryByTitle('Dismiss this suggestion')
    ).not.toBeInTheDocument();
  });

  it('formats recency gap correctly for years', async () => {
    const suggestionWithYears = {
      ...mockSuggestion,
      factors: { ...mockFactors, recencyGap: 400 },
    };
    render(<SuggestionCard suggestion={suggestionWithYears} />);

    await user.click(screen.getByText('Why this suggestion?'));
    expect(screen.getByText('1+ years')).toBeInTheDocument();
  });

  it('formats recency gap correctly for months', async () => {
    const suggestionWithMonths = {
      ...mockSuggestion,
      factors: { ...mockFactors, recencyGap: 60 },
    };
    render(<SuggestionCard suggestion={suggestionWithMonths} />);

    await user.click(screen.getByText('Why this suggestion?'));
    expect(screen.getByText('2 months')).toBeInTheDocument();
  });

  it('formats recent addition correctly for weeks', async () => {
    const suggestionRecentWeeks = {
      ...mockSuggestion,
      factors: { ...mockFactors, recentAddition: 14 },
    };
    render(<SuggestionCard suggestion={suggestionRecentWeeks} />);

    await user.click(screen.getByText('Why this suggestion?'));
    expect(screen.getByText('2 weeks ago')).toBeInTheDocument();
  });

  it('formats recent addition correctly for months', async () => {
    const suggestionRecentMonths = {
      ...mockSuggestion,
      factors: { ...mockFactors, recentAddition: 60 },
    };
    render(<SuggestionCard suggestion={suggestionRecentMonths} />);

    await user.click(screen.getByText('Why this suggestion?'));
    expect(screen.getByText('2 months ago')).toBeInTheDocument();
  });

  it('formats recent addition correctly for years', async () => {
    const suggestionRecentYears = {
      ...mockSuggestion,
      factors: { ...mockFactors, recentAddition: 400 },
    };
    render(<SuggestionCard suggestion={suggestionRecentYears} />);

    await user.click(screen.getByText('Why this suggestion?'));
    expect(screen.getByText('1 years ago')).toBeInTheDocument();
  });

  it('formats user rating correctly when not rated', async () => {
    const suggestionNotRated = {
      ...mockSuggestion,
      factors: { ...mockFactors, userRating: 0 },
    };
    render(<SuggestionCard suggestion={suggestionNotRated} />);

    await user.click(screen.getByText('Why this suggestion?'));
    expect(screen.getByText('Not rated')).toBeInTheDocument();
  });

  it('formats diversity penalty correctly when none', async () => {
    const suggestionNoPenalty = {
      ...mockSuggestion,
      factors: { ...mockFactors, diversityPenalty: 0 },
    };
    render(<SuggestionCard suggestion={suggestionNoPenalty} />);

    await user.click(screen.getByText('Why this suggestion?'));
    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('formats neverPlayed boolean correctly', async () => {
    const suggestionNeverPlayed = {
      ...mockSuggestion,
      factors: { ...mockFactors, neverPlayed: true },
    };
    render(<SuggestionCard suggestion={suggestionNeverPlayed} />);

    await user.click(screen.getByText('Why this suggestion?'));
    expect(screen.getByText('Yes')).toBeInTheDocument();
  });

  it('shows album year and format combined', () => {
    render(<SuggestionCard suggestion={mockSuggestion} />);

    // Year and format are combined in one element: "2020 • Vinyl"
    expect(screen.getByText(/2020.*•.*Vinyl/)).toBeInTheDocument();
  });

  it('navigates to collection when View in Collection is clicked', async () => {
    render(<SuggestionCard suggestion={mockSuggestion} />);

    const viewButton = screen.getByText('View in Collection');
    await user.click(viewButton);

    expect(window.location.hash).toBe('#collection?highlight=123');
  });

  it('stores release data and navigates when Details button is clicked', async () => {
    render(<SuggestionCard suggestion={mockSuggestion} />);

    const detailsButton = screen.getByText('Details');
    await user.click(detailsButton);

    expect(localStorageMock.setItem).toHaveBeenCalled();
    // Component navigates to release-details (without the ID in hash)
    expect(window.location.hash).toBe('#release-details');
  });
});
