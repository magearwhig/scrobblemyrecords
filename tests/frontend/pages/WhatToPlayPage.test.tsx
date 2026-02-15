import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import '@testing-library/jest-dom';

import WhatToPlayPage from '../../../src/renderer/pages/WhatToPlayPage';

// Mock child page components
jest.mock('../../../src/renderer/pages/SuggestionsPage', () => {
  return function MockSuggestionsPage({ embedded }: { embedded?: boolean }) {
    return (
      <div data-testid='suggestions-page'>
        Suggestions Page {embedded ? '(embedded)' : ''}
      </div>
    );
  };
});

jest.mock(
  '../../../src/renderer/components/whattoplay/ForgottenFavoritesContainer',
  () => {
    return function MockForgottenFavoritesContainer() {
      return (
        <div data-testid='forgotten-favorites'>
          Forgotten Favorites Container
        </div>
      );
    };
  }
);

jest.mock(
  '../../../src/renderer/components/whattoplay/DustyCornersContainer',
  () => {
    return function MockDustyCornersContainer() {
      return <div data-testid='dusty-corners'>Dusty Corners Container</div>;
    };
  }
);

// Mock tabUtils - dynamically parse the hash for tab value
jest.mock('../../../src/renderer/utils/tabUtils', () => ({
  getTabFromUrl: jest.fn((_validTabs: string[], defaultTab: string) => {
    const hash = window.location.hash;
    const queryStart = hash.indexOf('?');
    if (queryStart !== -1) {
      const params = new URLSearchParams(hash.substring(queryStart));
      const tab = params.get('tab');
      if (tab && _validTabs.includes(tab)) return tab;
    }
    return defaultTab;
  }),
}));

// Mock useTabKeyNavigation
jest.mock('../../../src/renderer/hooks/useTabKeyNavigation', () => ({
  useTabKeyNavigation: () => jest.fn(),
}));

describe('WhatToPlayPage', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    jest.clearAllMocks();
    user = userEvent.setup();
    window.location.hash = '';
  });

  it('renders page title', () => {
    render(<WhatToPlayPage />);

    expect(screen.getByText('What to Play')).toBeInTheDocument();
  });

  it('renders page description', () => {
    render(<WhatToPlayPage />);

    expect(
      screen.getByText('Discover what to spin next from your collection.')
    ).toBeInTheDocument();
  });

  it('renders all tab buttons', () => {
    render(<WhatToPlayPage />);

    expect(
      screen.getByRole('tab', { name: 'Play Suggestions' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'Forgotten Favorites' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'Dusty Corners' })
    ).toBeInTheDocument();
  });

  it('renders tablist with correct aria label', () => {
    render(<WhatToPlayPage />);

    expect(
      screen.getByRole('tablist', { name: 'What to Play sections' })
    ).toBeInTheDocument();
  });

  it('shows Play Suggestions tab as active by default', () => {
    render(<WhatToPlayPage />);

    const suggestionsTab = screen.getByRole('tab', {
      name: 'Play Suggestions',
    });
    expect(suggestionsTab).toHaveAttribute('aria-selected', 'true');
  });

  it('renders SuggestionsPage when suggestions tab is active', () => {
    render(<WhatToPlayPage />);

    expect(screen.getByTestId('suggestions-page')).toBeInTheDocument();
  });

  it('switches to Forgotten Favorites tab when clicked', async () => {
    render(<WhatToPlayPage />);

    await user.click(screen.getByRole('tab', { name: 'Forgotten Favorites' }));

    expect(screen.getByTestId('forgotten-favorites')).toBeInTheDocument();
    expect(screen.queryByTestId('suggestions-page')).not.toBeInTheDocument();
  });

  it('switches to Dusty Corners tab when clicked', async () => {
    render(<WhatToPlayPage />);

    await user.click(screen.getByRole('tab', { name: 'Dusty Corners' }));

    expect(screen.getByTestId('dusty-corners')).toBeInTheDocument();
    expect(screen.queryByTestId('suggestions-page')).not.toBeInTheDocument();
  });

  it('marks active tab with correct aria-selected', async () => {
    render(<WhatToPlayPage />);

    const forgottenTab = screen.getByRole('tab', {
      name: 'Forgotten Favorites',
    });
    expect(forgottenTab).toHaveAttribute('aria-selected', 'false');

    await user.click(forgottenTab);

    expect(forgottenTab).toHaveAttribute('aria-selected', 'true');

    const suggestionsTab = screen.getByRole('tab', {
      name: 'Play Suggestions',
    });
    expect(suggestionsTab).toHaveAttribute('aria-selected', 'false');
  });

  it('renders tabpanel with correct id', () => {
    render(<WhatToPlayPage />);

    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'id',
      'what-to-play-panel-suggestions'
    );
  });

  it('updates tabpanel id when tab changes', async () => {
    render(<WhatToPlayPage />);

    await user.click(screen.getByRole('tab', { name: 'Forgotten Favorites' }));

    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'id',
      'what-to-play-panel-forgotten'
    );
  });

  it('passes embedded prop to SuggestionsPage', () => {
    render(<WhatToPlayPage />);

    expect(screen.getByText(/\(embedded\)/)).toBeInTheDocument();
  });

  it('only renders one tab panel content at a time', async () => {
    render(<WhatToPlayPage />);

    // Only suggestions visible initially
    expect(screen.getByTestId('suggestions-page')).toBeInTheDocument();
    expect(screen.queryByTestId('forgotten-favorites')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dusty-corners')).not.toBeInTheDocument();

    // Switch to dusty corners
    await user.click(screen.getByRole('tab', { name: 'Dusty Corners' }));

    expect(screen.getByTestId('dusty-corners')).toBeInTheDocument();
    expect(screen.queryByTestId('suggestions-page')).not.toBeInTheDocument();
    expect(screen.queryByTestId('forgotten-favorites')).not.toBeInTheDocument();
  });

  it('has inactive tabs with tabIndex -1', () => {
    render(<WhatToPlayPage />);

    const forgottenTab = screen.getByRole('tab', {
      name: 'Forgotten Favorites',
    });
    const dustyTab = screen.getByRole('tab', { name: 'Dusty Corners' });

    expect(forgottenTab).toHaveAttribute('tabindex', '-1');
    expect(dustyTab).toHaveAttribute('tabindex', '-1');
  });

  it('has active tab with tabIndex 0', () => {
    render(<WhatToPlayPage />);

    const suggestionsTab = screen.getByRole('tab', {
      name: 'Play Suggestions',
    });
    expect(suggestionsTab).toHaveAttribute('tabindex', '0');
  });
});
