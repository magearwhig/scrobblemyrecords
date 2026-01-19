import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';

import { AppProvider } from '../../../src/renderer/context/AppContext';
import { AuthProvider } from '../../../src/renderer/context/AuthContext';
import SettingsPage from '../../../src/renderer/pages/SettingsPage';

const mockAuthValue = {
  authStatus: {
    discogs: { authenticated: false },
    lastfm: { authenticated: false },
  },
  setAuthStatus: jest.fn(),
};

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <AppProvider>
      <AuthProvider value={mockAuthValue}>{ui}</AuthProvider>
    </AppProvider>
  );
};

describe('SettingsPage', () => {
  it('renders the settings page title', () => {
    renderWithProviders(<SettingsPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Settings' })
    ).toBeInTheDocument();
  });

  it('renders the description text', () => {
    renderWithProviders(<SettingsPage />);

    expect(
      screen.getByText(
        'Configure your connections, integrations, mappings, and preferences'
      )
    ).toBeInTheDocument();
  });

  it('renders all six tabs', () => {
    renderWithProviders(<SettingsPage />);

    expect(screen.getByText('Connections')).toBeInTheDocument();
    expect(screen.getByText('Integrations')).toBeInTheDocument();
    expect(screen.getByText('Mappings')).toBeInTheDocument();
    expect(screen.getByText('Filters')).toBeInTheDocument();
    expect(screen.getByText('Wishlist')).toBeInTheDocument();
    expect(screen.getByText('Backup')).toBeInTheDocument();
  });

  it('renders within a header card container', () => {
    renderWithProviders(<SettingsPage />);

    const headingElement = screen.getByRole('heading', {
      level: 1,
      name: 'Settings',
    });
    const cardElement = headingElement.closest('.settings-header-card');
    expect(cardElement).toBeInTheDocument();
  });

  it('has proper structure with main container', () => {
    const { container } = renderWithProviders(<SettingsPage />);

    const mainDiv = container.firstChild;
    expect(mainDiv?.nodeName).toBe('DIV');
    expect(mainDiv).toHaveClass('settings-page');

    const headerCard = mainDiv?.firstChild;
    expect(headerCard).toHaveClass('settings-header-card');
  });

  it('starts on Connections tab by default', () => {
    renderWithProviders(<SettingsPage />);

    // Connections tab should be active
    const connectionsTab = screen.getByRole('button', {
      name: /Connections/i,
    });
    expect(connectionsTab).toHaveClass('active');

    // Should show connection-related content
    expect(screen.getByText('Account Connections')).toBeInTheDocument();
  });

  it('can switch to Integrations tab', () => {
    renderWithProviders(<SettingsPage />);

    const integrationsTab = screen.getByRole('button', {
      name: /Integrations/i,
    });
    fireEvent.click(integrationsTab);

    expect(integrationsTab).toHaveClass('active');
    expect(screen.getByText('Last.fm Sync')).toBeInTheDocument();
  });

  it('can switch to Mappings tab', () => {
    renderWithProviders(<SettingsPage />);

    const mappingsTab = screen.getByRole('button', { name: /Mappings/i });
    fireEvent.click(mappingsTab);

    expect(mappingsTab).toHaveClass('active');
    expect(screen.getByText('Artist Name Mappings')).toBeInTheDocument();
  });

  it('can switch to Filters tab', () => {
    renderWithProviders(<SettingsPage />);

    const filtersTab = screen.getByRole('button', { name: /Filters/i });
    fireEvent.click(filtersTab);

    expect(filtersTab).toHaveClass('active');
    expect(screen.getByText('Hidden Discovery Items')).toBeInTheDocument();
  });

  it('can switch to Wishlist tab', () => {
    renderWithProviders(<SettingsPage />);

    const wishlistTab = screen.getByRole('button', { name: /Wishlist/i });
    fireEvent.click(wishlistTab);

    expect(wishlistTab).toHaveClass('active');
    expect(screen.getByText('Wishlist Settings')).toBeInTheDocument();
  });
});
