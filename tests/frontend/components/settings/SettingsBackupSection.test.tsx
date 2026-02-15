import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import '@testing-library/jest-dom';
import SettingsBackupSection from '../../../../src/renderer/components/settings/SettingsBackupSection';
import ApiService from '../../../../src/renderer/services/api';

jest.mock('../../../../src/renderer/services/api');

jest.mock(
  '../../../../src/renderer/components/settings/BackupImportDialog',
  () => {
    return function MockBackupImportDialog({
      onClose,
      onImportComplete,
    }: {
      onClose: () => void;
      onImportComplete: () => void;
    }) {
      return (
        <div data-testid='import-dialog'>
          <button onClick={onClose}>Close Dialog</button>
          <button onClick={onImportComplete}>Complete Import</button>
        </div>
      );
    };
  }
);

const createMockApi = (): jest.Mocked<ApiService> => {
  const mockApi = {
    getBackupPreview: jest.fn().mockResolvedValue({
      hasUserSettings: true,
      hasSuggestionSettings: false,
      hasAiSettings: false,
      hasWishlistSettings: false,
      hasSellerSettings: false,
      hasReleaseSettings: false,
      hasSyncSettings: false,
      albumMappingsCount: 10,
      artistMappingsCount: 5,
      historyArtistMappingsCount: 3,
      hiddenAlbumsCount: 2,
      hiddenArtistsCount: 1,
      localWantListCount: 4,
      monitoredSellersCount: 0,
      artistMbidMappingsCount: 0,
      hiddenReleasesCount: 0,
      excludedArtistsCount: 0,
    }),
    getBackupSettings: jest.fn().mockResolvedValue({
      schemaVersion: 1,
      enabled: true,
      frequency: 'weekly',
      retentionCount: 5,
    }),
    listAutoBackups: jest.fn().mockResolvedValue([]),
    exportBackup: jest.fn(),
    previewBackupImport: jest.fn(),
    importBackup: jest.fn(),
    updateBackupSettings: jest.fn(),
    runAutoBackup: jest.fn(),
    deleteAutoBackup: jest.fn(),
  } as unknown as jest.Mocked<ApiService>;
  return mockApi;
};

describe('SettingsBackupSection', () => {
  let user: ReturnType<typeof userEvent.setup>;
  let mockApi: jest.Mocked<ApiService>;

  beforeEach(() => {
    jest.clearAllMocks();
    user = userEvent.setup();
    mockApi = createMockApi();
  });

  it('renders export, import, and auto-backup sections', async () => {
    render(<SettingsBackupSection api={mockApi} />);

    expect(
      screen.getByRole('heading', { name: 'Export Backup' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Import Backup' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Automatic Backups' })
    ).toBeInTheDocument();
  });

  it('loads and displays backup preview on mount', async () => {
    render(<SettingsBackupSection api={mockApi} />);

    await waitFor(() => {
      expect(screen.getByText('10 album mappings')).toBeInTheDocument();
      expect(screen.getByText('5 artist mappings')).toBeInTheDocument();
      expect(screen.getByText('3 history-artist mappings')).toBeInTheDocument();
    });
  });

  it('hides preview items with zero counts', async () => {
    render(<SettingsBackupSection api={mockApi} />);

    await waitFor(() => {
      expect(screen.getByText('10 album mappings')).toBeInTheDocument();
    });

    // monitoredSellersCount is 0
    expect(screen.queryByText(/monitored sellers/)).not.toBeInTheDocument();
  });

  it('shows password fields when include credentials is checked', async () => {
    render(<SettingsBackupSection api={mockApi} />);

    const checkbox = screen.getByRole('checkbox', {
      name: /include api credentials/i,
    });
    await user.click(checkbox);

    expect(
      screen.getByPlaceholderText('Enter encryption password')
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Confirm password')).toBeInTheDocument();
  });

  it('hides password fields when include credentials is unchecked', () => {
    render(<SettingsBackupSection api={mockApi} />);

    expect(
      screen.queryByPlaceholderText('Enter encryption password')
    ).not.toBeInTheDocument();
  });

  it('shows error when exporting with credentials but no password', async () => {
    render(<SettingsBackupSection api={mockApi} />);

    await user.click(
      screen.getByRole('checkbox', { name: /include api credentials/i })
    );
    await user.click(screen.getByRole('button', { name: 'Export Backup' }));

    expect(
      screen.getByText('Password is required when including credentials')
    ).toBeInTheDocument();
  });

  it('shows error when passwords do not match', async () => {
    render(<SettingsBackupSection api={mockApi} />);

    await user.click(
      screen.getByRole('checkbox', { name: /include api credentials/i })
    );

    await user.type(
      screen.getByPlaceholderText('Enter encryption password'),
      'password123'
    );
    await user.type(
      screen.getByPlaceholderText('Confirm password'),
      'differentpass'
    );
    await user.click(screen.getByRole('button', { name: 'Export Backup' }));

    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
  });

  it('shows error when password is too short', async () => {
    render(<SettingsBackupSection api={mockApi} />);

    await user.click(
      screen.getByRole('checkbox', { name: /include api credentials/i })
    );

    await user.type(
      screen.getByPlaceholderText('Enter encryption password'),
      'short'
    );
    await user.type(screen.getByPlaceholderText('Confirm password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Export Backup' }));

    expect(
      screen.getByText('Password must be at least 8 characters')
    ).toBeInTheDocument();
  });

  it('exports backup without credentials successfully', async () => {
    const mockBlob = new Blob(['{}'], { type: 'application/json' });
    mockApi.exportBackup.mockResolvedValue(mockBlob);

    // Mock URL.createObjectURL and revokeObjectURL
    const mockCreateObjectURL = jest.fn().mockReturnValue('blob:test');
    const mockRevokeObjectURL = jest.fn();
    global.URL.createObjectURL = mockCreateObjectURL;
    global.URL.revokeObjectURL = mockRevokeObjectURL;

    render(<SettingsBackupSection api={mockApi} />);

    await user.click(screen.getByRole('button', { name: 'Export Backup' }));

    await waitFor(() => {
      expect(mockApi.exportBackup).toHaveBeenCalledWith({
        includeCredentials: false,
        password: undefined,
      });
    });

    await waitFor(() => {
      expect(
        screen.getByText('Backup exported successfully')
      ).toBeInTheDocument();
    });
  });

  it('shows export error on failure', async () => {
    mockApi.exportBackup.mockRejectedValue(new Error('Export failed'));

    render(<SettingsBackupSection api={mockApi} />);

    await user.click(screen.getByRole('button', { name: 'Export Backup' }));

    await waitFor(() => {
      expect(screen.getByText('Export failed')).toBeInTheDocument();
    });
  });

  it('loads and displays backup settings', async () => {
    render(<SettingsBackupSection api={mockApi} />);

    await waitFor(() => {
      expect(
        screen.getByRole('checkbox', { name: /enable automatic backups/i })
      ).toBeChecked();
    });
  });

  it('shows auto-backup options when enabled', async () => {
    render(<SettingsBackupSection api={mockApi} />);

    await waitFor(() => {
      expect(screen.getByText('Frequency:')).toBeInTheDocument();
      expect(screen.getByText('Keep last:')).toBeInTheDocument();
    });
  });

  it('hides auto-backup options when disabled', async () => {
    mockApi.getBackupSettings.mockResolvedValue({
      schemaVersion: 1,
      enabled: false,
      frequency: 'weekly',
      retentionCount: 5,
    });

    render(<SettingsBackupSection api={mockApi} />);

    await waitFor(() => {
      expect(
        screen.getByRole('checkbox', { name: /enable automatic backups/i })
      ).not.toBeChecked();
    });

    expect(screen.queryByText('Frequency:')).not.toBeInTheDocument();
  });

  it('saves backup settings', async () => {
    mockApi.updateBackupSettings.mockResolvedValue({
      schemaVersion: 1,
      enabled: true,
      frequency: 'weekly',
      retentionCount: 5,
    });

    render(<SettingsBackupSection api={mockApi} />);

    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Save Settings'));

    await waitFor(() => {
      expect(mockApi.updateBackupSettings).toHaveBeenCalled();
      expect(screen.getByText('Backup settings saved')).toBeInTheDocument();
    });
  });

  it('runs manual backup when Backup Now is clicked', async () => {
    mockApi.runAutoBackup.mockResolvedValue(undefined);

    render(<SettingsBackupSection api={mockApi} />);

    await waitFor(() => {
      expect(screen.getByText('Backup Now')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Backup Now'));

    await waitFor(() => {
      expect(mockApi.runAutoBackup).toHaveBeenCalled();
      expect(screen.getByText('Manual backup completed')).toBeInTheDocument();
    });
  });

  it('displays auto-backup list when backups exist', async () => {
    mockApi.listAutoBackups.mockResolvedValue([
      {
        filename: 'backup-2024-01-15.json',
        createdAt: 1705276800000,
        size: 1024,
      },
      {
        filename: 'backup-2024-01-14.json',
        createdAt: 1705190400000,
        size: 2048,
      },
    ]);

    render(<SettingsBackupSection api={mockApi} />);

    await waitFor(() => {
      expect(screen.getByText('Saved Backups')).toBeInTheDocument();
      expect(screen.getByText('backup-2024-01-15.json')).toBeInTheDocument();
      expect(screen.getByText('backup-2024-01-14.json')).toBeInTheDocument();
    });
  });

  it('hides auto-backup list when no backups', async () => {
    render(<SettingsBackupSection api={mockApi} />);

    await waitFor(() => {
      expect(mockApi.listAutoBackups).toHaveBeenCalled();
    });

    expect(screen.queryByText('Saved Backups')).not.toBeInTheDocument();
  });

  it('shows Choose Backup File button for import', () => {
    render(<SettingsBackupSection api={mockApi} />);

    expect(screen.getByText('Choose Backup File...')).toBeInTheDocument();
  });
});
