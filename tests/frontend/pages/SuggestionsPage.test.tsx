import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import '@testing-library/jest-dom';

import { AppProvider } from '../../../src/renderer/context/AppContext';
import SuggestionsPage from '../../../src/renderer/pages/SuggestionsPage';
import {
  SuggestionResult,
  SuggestionSettings,
  SuggestionWeights,
  CollectionItem,
} from '../../../src/shared/types';

// Mock API service
const mockGetSuggestions = jest.fn();
const mockGetSuggestionSettings = jest.fn();
const mockGetSuggestionDefaults = jest.fn();
const mockGetAIStatus = jest.fn();
const mockGetAISuggestion = jest.fn();
const mockDismissSuggestion = jest.fn();
const mockRefreshSuggestions = jest.fn();
const mockSaveSuggestionSettings = jest.fn();

jest.mock('../../../src/renderer/services/api', () => ({
  getApiService: () => ({
    getSuggestions: mockGetSuggestions,
    getSuggestionSettings: mockGetSuggestionSettings,
    getSuggestionDefaults: mockGetSuggestionDefaults,
    getAIStatus: mockGetAIStatus,
    getAISuggestion: mockGetAISuggestion,
    dismissSuggestion: mockDismissSuggestion,
    refreshSuggestions: mockRefreshSuggestions,
    saveSuggestionSettings: mockSaveSuggestionSettings,
  }),
}));

// Mock SuggestionCard
jest.mock('../../../src/renderer/components/SuggestionCard', () => {
  return function MockSuggestionCard({
    suggestion,
    onDismiss,
  }: {
    suggestion: SuggestionResult;
    onDismiss: (id: number) => void;
    showScore: boolean;
  }) {
    return (
      <div data-testid={`suggestion-card-${suggestion.album.id}`}>
        <span>{suggestion.album.release.artist}</span>
        <span>{suggestion.album.release.title}</span>
        <span>{suggestion.reason}</span>
        <button onClick={() => onDismiss(suggestion.album.id)}>Dismiss</button>
      </div>
    );
  };
});

// Mock AISuggestionCard
jest.mock('../../../src/renderer/components/AISuggestionCard', () => {
  return function MockAISuggestionCard({
    suggestion,
    loading,
    onRefresh,
  }: {
    suggestion: {
      album: CollectionItem | null;
      reasoning: string;
      confidence: string;
    };
    loading: boolean;
    onRefresh: () => void;
  }) {
    return (
      <div data-testid='ai-suggestion-card'>
        {loading && <span>Loading AI suggestion...</span>}
        {suggestion.album && <span>{suggestion.reasoning}</span>}
        <button onClick={onRefresh}>Refresh AI</button>
      </div>
    );
  };
});

// Mock SuggestionWeightControls
jest.mock('../../../src/renderer/components/SuggestionWeightControls', () => {
  return function MockSuggestionWeightControls({
    weights,
    onChange,
    onReset,
  }: {
    weights: SuggestionWeights;
    onChange: (w: SuggestionWeights) => void;
    onReset: () => void;
  }) {
    return (
      <div data-testid='weight-controls'>
        <span>Weight Controls</span>
        <button onClick={() => onChange({ ...weights, recencyGap: 2 })}>
          Change Weight
        </button>
        <button onClick={onReset}>Reset Weights</button>
      </div>
    );
  };
});

// Mock Skeleton
jest.mock('../../../src/renderer/components/ui/Skeleton', () => ({
  AlbumCardSkeleton: ({ count }: { count: number }) => (
    <div data-testid='skeleton-loader'>Loading {count} items...</div>
  ),
}));

// Mock EmptyState
jest.mock('../../../src/renderer/components/ui/EmptyState', () => ({
  EmptyState: ({
    title,
    description,
  }: {
    icon: string;
    title: string;
    description: string;
    suggestion: string;
    actions: Array<{ label: string; onClick: () => void; variant?: string }>;
  }) => (
    <div data-testid='empty-state'>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  ),
}));

// Mock logger
jest.mock('../../../src/renderer/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

const createMockAlbum = (
  id: number,
  artist: string,
  title: string
): CollectionItem => ({
  id,
  date_added: '2024-01-01',
  release: {
    id,
    title,
    artist,
    year: 2020,
    format: ['Vinyl', 'LP'],
    label: ['Test Label'],
    cover_image: `https://example.com/cover-${id}.jpg`,
    resource_url: `https://api.discogs.com/releases/${id}`,
  },
});

const mockSuggestions: SuggestionResult[] = [
  {
    album: createMockAlbum(1, 'Radiohead', 'OK Computer'),
    score: 85.5,
    factors: {
      recencyGap: 30,
      neverPlayed: false,
      recentAddition: 365,
      artistAffinity: 0.8,
      eraPreference: 0.7,
      userRating: 4,
      timeOfDay: 0.6,
      diversityPenalty: 0.1,
      albumCompleteness: 0.9,
    },
    reason: "You haven't played this in a while",
  },
  {
    album: createMockAlbum(2, 'The Beatles', 'Abbey Road'),
    score: 72.3,
    factors: {
      recencyGap: 60,
      neverPlayed: true,
      recentAddition: 30,
      artistAffinity: 0.9,
      eraPreference: 0.5,
      userRating: 5,
      timeOfDay: 0.4,
      diversityPenalty: 0.0,
      albumCompleteness: 0.0,
    },
    reason: 'Never played from your collection',
  },
];

const mockSettings: SuggestionSettings = {
  weights: {
    recencyGap: 1.0,
    neverPlayed: 1.5,
    recentAddition: 0.5,
    artistAffinity: 1.0,
    eraPreference: 0.5,
    userRating: 1.0,
    timeOfDay: 0.3,
    diversityPenalty: 0.5,
    albumCompleteness: 0.5,
  },
  excludeRecentlyPlayed: true,
  preferNeverPlayed: true,
};

const mockDefaults = {
  weights: { ...mockSettings.weights },
};

const renderSuggestionsPage = () => {
  return render(
    <AppProvider>
      <SuggestionsPage />
    </AppProvider>
  );
};

describe('SuggestionsPage', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    jest.clearAllMocks();
    user = userEvent.setup();

    mockGetSuggestions.mockResolvedValue(mockSuggestions);
    mockGetSuggestionSettings.mockResolvedValue(mockSettings);
    mockGetSuggestionDefaults.mockResolvedValue(mockDefaults);
    mockGetAIStatus.mockResolvedValue({ enabled: false, connected: false });
  });

  it('renders page title', async () => {
    renderSuggestionsPage();

    expect(screen.getByText('Play Suggestions')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockGetSuggestions).toHaveBeenCalled();
    });
  });

  it('renders loading state initially', () => {
    renderSuggestionsPage();

    expect(screen.getByTestId('skeleton-loader')).toBeInTheDocument();
  });

  it('renders suggestions after loading', async () => {
    renderSuggestionsPage();

    await waitFor(() => {
      expect(screen.getByTestId('suggestion-card-1')).toBeInTheDocument();
    });

    expect(screen.getByTestId('suggestion-card-2')).toBeInTheDocument();
  });

  it('shows error state when API fails', async () => {
    mockGetSuggestions.mockRejectedValue(
      new Error('Failed to load suggestions')
    );

    renderSuggestionsPage();

    await waitFor(() => {
      expect(
        screen.getByText('Failed to load suggestions')
      ).toBeInTheDocument();
    });

    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('retries loading when clicking Retry', async () => {
    mockGetSuggestions.mockRejectedValueOnce(new Error('Failed to load'));
    mockGetSuggestions.mockResolvedValueOnce(mockSuggestions);

    renderSuggestionsPage();

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByTestId('suggestion-card-1')).toBeInTheDocument();
    });
  });

  it('shows empty state when no suggestions', async () => {
    mockGetSuggestions.mockResolvedValue([]);

    renderSuggestionsPage();

    await waitFor(() => {
      expect(screen.getByText('No Suggestions Available')).toBeInTheDocument();
    });
  });

  it('shows Refresh button after loading', async () => {
    renderSuggestionsPage();

    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });
  });

  it('refreshes suggestions when clicking Refresh', async () => {
    mockRefreshSuggestions.mockResolvedValue(undefined);

    renderSuggestionsPage();

    await waitFor(() => {
      expect(screen.getByTestId('suggestion-card-1')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Refresh'));

    expect(mockRefreshSuggestions).toHaveBeenCalled();
  });

  it('shows Adjust Weights button', async () => {
    renderSuggestionsPage();

    expect(screen.getByText('Adjust Weights')).toBeInTheDocument();
  });

  it('toggles weight controls visibility', async () => {
    renderSuggestionsPage();

    await waitFor(() => {
      expect(screen.getByTestId('suggestion-card-1')).toBeInTheDocument();
    });

    // Weight controls should not be visible initially
    expect(screen.queryByTestId('weight-controls')).not.toBeInTheDocument();

    await user.click(screen.getByText('Adjust Weights'));

    // Now weight controls should be visible
    expect(screen.getByTestId('weight-controls')).toBeInTheDocument();
    expect(screen.getByText('Hide Weights')).toBeInTheDocument();
  });

  it('dismisses a suggestion', async () => {
    mockDismissSuggestion.mockResolvedValue(undefined);
    mockGetSuggestions.mockResolvedValueOnce(mockSuggestions);
    mockGetSuggestions.mockResolvedValueOnce([]); // Replacement fetch

    renderSuggestionsPage();

    await waitFor(() => {
      expect(screen.getByTestId('suggestion-card-1')).toBeInTheDocument();
    });

    const dismissButtons = screen.getAllByText('Dismiss');
    await user.click(dismissButtons[0]);

    expect(mockDismissSuggestion).toHaveBeenCalledWith(1);
  });

  it('shows Algorithm Picks section header', async () => {
    renderSuggestionsPage();

    await waitFor(() => {
      expect(screen.getByText('Algorithm Picks')).toBeInTheDocument();
    });

    expect(screen.getByText('9 Weighted Factors')).toBeInTheDocument();
  });

  it('shows AI section when AI is enabled', async () => {
    mockGetAIStatus.mockResolvedValue({ enabled: true, connected: true });
    mockGetAISuggestion.mockResolvedValue({
      suggestions: [
        {
          album: createMockAlbum(3, 'Pink Floyd', 'Dark Side of the Moon'),
          reasoning: 'Perfect for this time of evening',
          confidence: 'high',
        },
      ],
    });

    renderSuggestionsPage();

    await waitFor(() => {
      expect(screen.getByText('AI Pick')).toBeInTheDocument();
    });

    expect(screen.getByText('Powered by Ollama')).toBeInTheDocument();
  });

  it('does not show AI section when AI is disabled', async () => {
    mockGetAIStatus.mockResolvedValue({ enabled: false, connected: false });

    renderSuggestionsPage();

    await waitFor(() => {
      expect(screen.getByTestId('suggestion-card-1')).toBeInTheDocument();
    });

    expect(screen.queryByText('AI Pick')).not.toBeInTheDocument();
  });

  it('shows footer hint text', () => {
    renderSuggestionsPage();

    expect(
      screen.getByText(/Suggestions are based on your listening history/)
    ).toBeInTheDocument();
  });
});
