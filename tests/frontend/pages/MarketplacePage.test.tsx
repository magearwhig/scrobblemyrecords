import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import '@testing-library/jest-dom';

import { AppProvider } from '../../../src/renderer/context/AppContext';
import { AuthProvider } from '../../../src/renderer/context/AuthContext';
import MarketplacePage from '../../../src/renderer/pages/MarketplacePage';
import { AuthStatus } from '../../../src/shared/types';

// Mock child page components
jest.mock('../../../src/renderer/pages/WishlistPage', () => {
  return function MockWishlistPage({ embedded }: { embedded?: boolean }) {
    return (
      <div data-testid='wishlist-page'>
        Wishlist Page {embedded ? '(embedded)' : ''}
      </div>
    );
  };
});

jest.mock('../../../src/renderer/pages/NewReleasesPage', () => {
  return function MockNewReleasesPage({ embedded }: { embedded?: boolean }) {
    return (
      <div data-testid='new-releases-page'>
        New Releases Page {embedded ? '(embedded)' : ''}
      </div>
    );
  };
});

jest.mock('../../../src/renderer/pages/SellersPage', () => {
  return function MockSellersPage({ embedded }: { embedded?: boolean }) {
    return (
      <div data-testid='sellers-page'>
        Sellers Page {embedded ? '(embedded)' : ''}
      </div>
    );
  };
});

jest.mock('../../../src/renderer/pages/SellerMatchesPage', () => {
  return function MockSellerMatchesPage({ embedded }: { embedded?: boolean }) {
    return (
      <div data-testid='seller-matches-page'>
        Seller Matches Page {embedded ? '(embedded)' : ''}
      </div>
    );
  };
});

jest.mock(
  '../../../src/renderer/components/marketplace/MissingAlbumsContainer',
  () => {
    return function MockMissingAlbumsContainer() {
      return (
        <div data-testid='missing-albums-container'>
          Missing Albums Container
        </div>
      );
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

const defaultAuthStatus: AuthStatus = {
  discogs: { authenticated: true, username: 'testuser' },
  lastfm: { authenticated: true, username: 'testuser' },
};

const unauthenticatedStatus: AuthStatus = {
  discogs: { authenticated: false },
  lastfm: { authenticated: false },
};

const renderMarketplacePage = (authStatus: AuthStatus = defaultAuthStatus) => {
  return render(
    <AppProvider>
      <AuthProvider value={{ authStatus, setAuthStatus: jest.fn() }}>
        <MarketplacePage />
      </AuthProvider>
    </AppProvider>
  );
};

describe('MarketplacePage', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    jest.clearAllMocks();
    user = userEvent.setup();
    // Reset hash to default state
    window.location.hash = '';
  });

  it('renders page title', () => {
    renderMarketplacePage();

    expect(screen.getByText('Marketplace')).toBeInTheDocument();
  });

  it('renders page description', () => {
    renderMarketplacePage();

    expect(
      screen.getByText('Find, track, and buy vinyl records.')
    ).toBeInTheDocument();
  });

  it('shows unauthenticated state when not logged in', () => {
    renderMarketplacePage(unauthenticatedStatus);

    expect(screen.getByText('Marketplace')).toBeInTheDocument();
    expect(screen.getByText(/Please connect to Discogs/)).toBeInTheDocument();
  });

  it('renders all tab buttons', () => {
    renderMarketplacePage();

    expect(screen.getByRole('tab', { name: 'Wishlist' })).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'New Releases' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'Local Sellers' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'Seller Matches' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'Missing Albums' })
    ).toBeInTheDocument();
  });

  it('renders tablist with correct aria label', () => {
    renderMarketplacePage();

    expect(
      screen.getByRole('tablist', { name: 'Marketplace sections' })
    ).toBeInTheDocument();
  });

  it('shows Wishlist tab as active by default', () => {
    renderMarketplacePage();

    const wishlistTab = screen.getByRole('tab', { name: 'Wishlist' });
    expect(wishlistTab).toHaveAttribute('aria-selected', 'true');
  });

  it('renders WishlistPage when Wishlist tab is active', () => {
    renderMarketplacePage();

    expect(screen.getByTestId('wishlist-page')).toBeInTheDocument();
  });

  it('switches to New Releases tab when clicked', async () => {
    renderMarketplacePage();

    await user.click(screen.getByRole('tab', { name: 'New Releases' }));

    expect(screen.getByTestId('new-releases-page')).toBeInTheDocument();
    expect(screen.queryByTestId('wishlist-page')).not.toBeInTheDocument();
  });

  it('switches to Local Sellers tab when clicked', async () => {
    renderMarketplacePage();

    await user.click(screen.getByRole('tab', { name: 'Local Sellers' }));

    expect(screen.getByTestId('sellers-page')).toBeInTheDocument();
    expect(screen.queryByTestId('wishlist-page')).not.toBeInTheDocument();
  });

  it('switches to Seller Matches tab when clicked', async () => {
    renderMarketplacePage();

    await user.click(screen.getByRole('tab', { name: 'Seller Matches' }));

    expect(screen.getByTestId('seller-matches-page')).toBeInTheDocument();
  });

  it('switches to Missing Albums tab when clicked', async () => {
    renderMarketplacePage();

    await user.click(screen.getByRole('tab', { name: 'Missing Albums' }));

    expect(screen.getByTestId('missing-albums-container')).toBeInTheDocument();
  });

  it('marks active tab with correct aria-selected', async () => {
    renderMarketplacePage();

    const newReleasesTab = screen.getByRole('tab', {
      name: 'New Releases',
    });
    expect(newReleasesTab).toHaveAttribute('aria-selected', 'false');

    await user.click(newReleasesTab);

    expect(newReleasesTab).toHaveAttribute('aria-selected', 'true');

    const wishlistTab = screen.getByRole('tab', { name: 'Wishlist' });
    expect(wishlistTab).toHaveAttribute('aria-selected', 'false');
  });

  it('renders tabpanel with correct id', () => {
    renderMarketplacePage();

    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'id',
      'marketplace-panel-wishlist'
    );
  });

  it('updates tabpanel id when tab changes', async () => {
    renderMarketplacePage();

    await user.click(screen.getByRole('tab', { name: 'New Releases' }));

    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'id',
      'marketplace-panel-new-releases'
    );
  });

  it('passes embedded prop to child pages', () => {
    renderMarketplacePage();

    expect(screen.getByText(/\(embedded\)/)).toBeInTheDocument();
  });

  it('does not show tabs when unauthenticated', () => {
    renderMarketplacePage(unauthenticatedStatus);

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });
});
