import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';

import SettingsFiltersSection from '../../../../src/renderer/components/settings/SettingsFiltersSection';
import { AppProvider } from '../../../../src/renderer/context/AppContext';
import { AuthProvider } from '../../../../src/renderer/context/AuthContext';
import { getApiService } from '../../../../src/renderer/services/api';

jest.mock('../../../../src/renderer/services/api');

const mockAuthValue = {
  authStatus: {
    discogs: { authenticated: false },
    lastfm: { authenticated: false },
  },
  setAuthStatus: jest.fn(),
};

const mockApi = {
  getHiddenAlbums: jest.fn().mockResolvedValue([]),
  getHiddenArtists: jest.fn().mockResolvedValue([]),
};

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <AppProvider>
      <AuthProvider value={mockAuthValue}>{ui}</AuthProvider>
    </AppProvider>
  );
};

describe('SettingsFiltersSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getApiService as jest.Mock).mockReturnValue(mockApi);
  });

  it('renders the hidden items section', async () => {
    renderWithProviders(<SettingsFiltersSection api={mockApi as any} />);

    expect(screen.getByText('Hidden Discovery Items')).toBeInTheDocument();
  });

  it('renders hidden albums subsection', async () => {
    renderWithProviders(<SettingsFiltersSection api={mockApi as any} />);

    await waitFor(() => {
      expect(screen.getByText(/Hidden Albums/)).toBeInTheDocument();
    });
  });

  it('renders hidden artists subsection', async () => {
    renderWithProviders(<SettingsFiltersSection api={mockApi as any} />);

    await waitFor(() => {
      expect(screen.getByText(/Hidden Artists/)).toBeInTheDocument();
    });
  });

  it('shows empty state when no hidden items', async () => {
    renderWithProviders(<SettingsFiltersSection api={mockApi as any} />);

    await waitFor(() => {
      expect(screen.getByText('No hidden albums.')).toBeInTheDocument();
      expect(screen.getByText('No hidden artists.')).toBeInTheDocument();
    });
  });

  it('displays hidden albums when present', async () => {
    mockApi.getHiddenAlbums.mockResolvedValue([
      {
        artist: 'Test Artist',
        album: 'Test Album',
        hiddenAt: new Date().toISOString(),
      },
    ]);

    renderWithProviders(<SettingsFiltersSection api={mockApi as any} />);

    await waitFor(() => {
      expect(
        screen.getByText(/"Test Album" by Test Artist/)
      ).toBeInTheDocument();
    });
  });

  it('displays hidden artists when present', async () => {
    mockApi.getHiddenArtists.mockResolvedValue([
      { artist: 'Hidden Artist', hiddenAt: new Date().toISOString() },
    ]);

    renderWithProviders(<SettingsFiltersSection api={mockApi as any} />);

    await waitFor(() => {
      expect(screen.getByText('Hidden Artist')).toBeInTheDocument();
    });
  });
});
