import { render, screen } from '@testing-library/react';
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

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Settings' })
    ).toBeInTheDocument();
  });

  it('renders the description text', () => {
    renderWithProviders(<SettingsPage />);

    expect(
      screen.getByText('Application preferences and configuration options.')
    ).toBeInTheDocument();
  });

  it('renders artist mappings section', () => {
    renderWithProviders(<SettingsPage />);

    expect(screen.getByText('Artist Name Mappings')).toBeInTheDocument();
  });

  it('renders add new mapping section', () => {
    renderWithProviders(<SettingsPage />);

    expect(screen.getByText('Add New Mapping')).toBeInTheDocument();
  });

  it('renders within a card container', () => {
    renderWithProviders(<SettingsPage />);

    const cardElement = screen.getByText('Settings').closest('.card');
    expect(cardElement).toBeInTheDocument();
  });

  it('has proper structure with main container', () => {
    const { container } = renderWithProviders(<SettingsPage />);

    const mainDiv = container.firstChild;
    expect(mainDiv?.nodeName).toBe('DIV');

    const cardDiv = mainDiv?.firstChild;
    expect(cardDiv).toHaveClass('card');
  });
});
