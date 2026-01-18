import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';

import SettingsIntegrationsSection from '../../../../src/renderer/components/settings/SettingsIntegrationsSection';
import { AppProvider } from '../../../../src/renderer/context/AppContext';
import { AuthProvider } from '../../../../src/renderer/context/AuthContext';

const mockAuthValueNoAuth = {
  authStatus: {
    discogs: { authenticated: false },
    lastfm: { authenticated: false },
  },
  setAuthStatus: jest.fn(),
};

const mockAuthValueWithLastfm = {
  authStatus: {
    discogs: { authenticated: false },
    lastfm: { authenticated: true, username: 'testuser' },
  },
  setAuthStatus: jest.fn(),
};

const mockApi = {
  getHistorySyncStatus: jest.fn().mockResolvedValue({
    sync: { status: 'idle' },
    storage: {
      totalAlbums: 100,
      totalScrobbles: 5000,
      oldestScrobble: null,
      newestScrobble: null,
      lastSync: null,
      estimatedSizeBytes: 1024,
    },
  }),
  getSyncSettings: jest.fn().mockResolvedValue({ autoSyncOnStartup: true }),
  getAISettings: jest.fn().mockResolvedValue({
    enabled: false,
    baseUrl: 'http://localhost:11434',
    model: 'mistral',
    timeout: 30000,
  }),
  getAIStatus: jest.fn().mockResolvedValue({ connected: false }),
  getAIModels: jest.fn().mockResolvedValue([]),
};

const renderWithProviders = (
  ui: React.ReactElement,
  authValue = mockAuthValueNoAuth
) => {
  return render(
    <AppProvider>
      <AuthProvider value={authValue}>{ui}</AuthProvider>
    </AppProvider>
  );
};

describe('SettingsIntegrationsSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders Last.fm Sync section', async () => {
    renderWithProviders(<SettingsIntegrationsSection api={mockApi as any} />);

    expect(screen.getByText('Last.fm Sync')).toBeInTheDocument();
  });

  it('renders Discogs Collection Cache section', async () => {
    renderWithProviders(<SettingsIntegrationsSection api={mockApi as any} />);

    expect(screen.getByText('Discogs Collection Cache')).toBeInTheDocument();
  });

  it('renders AI Recommendations section', async () => {
    renderWithProviders(<SettingsIntegrationsSection api={mockApi as any} />);

    expect(screen.getByText('AI Recommendations (Ollama)')).toBeInTheDocument();
  });

  it('shows setup prompt when Last.fm not authenticated', async () => {
    renderWithProviders(<SettingsIntegrationsSection api={mockApi as any} />);

    await waitFor(() => {
      expect(
        screen.getByText(
          'Please authenticate with Last.fm to sync your scrobble history.'
        )
      ).toBeInTheDocument();
    });
  });

  it('shows sync stats when Last.fm is authenticated', async () => {
    renderWithProviders(
      <SettingsIntegrationsSection api={mockApi as any} />,
      mockAuthValueWithLastfm
    );

    await waitFor(() => {
      expect(screen.getByText('Total Scrobbles')).toBeInTheDocument();
      expect(screen.getByText('5,000')).toBeInTheDocument();
    });
  });

  it('shows AI setup instructions when not connected', async () => {
    renderWithProviders(<SettingsIntegrationsSection api={mockApi as any} />);

    await waitFor(() => {
      expect(screen.getByText('Setup Instructions')).toBeInTheDocument();
    });
  });

  it('shows Ollama connection status', async () => {
    renderWithProviders(<SettingsIntegrationsSection api={mockApi as any} />);

    await waitFor(() => {
      expect(screen.getByText('Ollama is not connected')).toBeInTheDocument();
    });
  });
});
