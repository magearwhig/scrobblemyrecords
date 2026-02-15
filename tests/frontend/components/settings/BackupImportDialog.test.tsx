import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import '@testing-library/jest-dom';
import BackupImportDialog from '../../../../src/renderer/components/settings/BackupImportDialog';
import ApiService from '../../../../src/renderer/services/api';
import { BackupImportPreview } from '../../../../src/shared/types';

jest.mock('../../../../src/renderer/services/api');

// Modal renders children directly for testing
jest.mock('../../../../src/renderer/components/ui/Modal', () => ({
  Modal: ({
    children,
    title,
    footer,
    isOpen,
  }: {
    children: React.ReactNode;
    title: string;
    footer: React.ReactNode;
    isOpen: boolean;
  }) =>
    isOpen ? (
      <div data-testid='modal'>
        <h2>{title}</h2>
        <div>{children}</div>
        <div data-testid='modal-footer'>{footer}</div>
      </div>
    ) : null,
}));

const createSummaryCategory = (newCount: number, existing: number) => ({
  new: newCount,
  existing,
});

const makePreview = (
  overrides: Partial<BackupImportPreview> = {}
): BackupImportPreview => ({
  valid: true,
  exportedAt: 1705276800000,
  appVersion: '1.0.0',
  includesCredentials: false,
  checksumValid: true,
  summary: {
    albumMappings: createSummaryCategory(5, 3),
    artistMappings: createSummaryCategory(2, 1),
    historyArtistMappings: createSummaryCategory(0, 0),
    hiddenAlbums: createSummaryCategory(1, 0),
    hiddenArtists: createSummaryCategory(0, 0),
    localWantList: createSummaryCategory(3, 2),
    monitoredSellers: createSummaryCategory(0, 0),
    artistMbidMappings: createSummaryCategory(0, 0),
    hiddenReleases: createSummaryCategory(0, 0),
    excludedArtists: createSummaryCategory(0, 0),
    discardPileItems: createSummaryCategory(0, 0),
    settingsWillMerge: true,
  },
  ...overrides,
});

const mockFile = new File(['{}'], 'backup.json', { type: 'application/json' });
// Mock file.text() to return content
Object.defineProperty(mockFile, 'text', {
  value: jest.fn().mockResolvedValue('{}'),
});

const createMockApi = (): jest.Mocked<ApiService> => {
  return {
    importBackup: jest.fn(),
  } as unknown as jest.Mocked<ApiService>;
};

describe('BackupImportDialog', () => {
  let user: ReturnType<typeof userEvent.setup>;
  let mockApi: jest.Mocked<ApiService>;
  const mockOnClose = jest.fn();
  const mockOnImportComplete = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    user = userEvent.setup();
    mockApi = createMockApi();
  });

  const renderDialog = (overrides: Record<string, unknown> = {}) => {
    const props = {
      api: mockApi,
      preview: makePreview(),
      file: mockFile,
      onClose: mockOnClose,
      onImportComplete: mockOnImportComplete,
      ...overrides,
    };
    return render(<BackupImportDialog {...props} />);
  };

  it('renders modal with Import Backup title', () => {
    renderDialog();

    expect(screen.getByText('Import Backup')).toBeInTheDocument();
  });

  it('displays file info', () => {
    renderDialog();

    expect(screen.getByText('backup.json')).toBeInTheDocument();
    expect(screen.getByText('1.0.0')).toBeInTheDocument();
  });

  it('displays import summary with totals', () => {
    renderDialog();

    // Total new: 5+2+0+1+0+3+0+0+0+0 = 11
    expect(screen.getByText('+11 new items')).toBeInTheDocument();
    // Total existing: 3+1+0+0+0+2+0+0+0+0 = 6
    expect(screen.getByText('6 existing items')).toBeInTheDocument();
  });

  it('displays category summaries for non-zero categories', () => {
    renderDialog();

    expect(
      screen.getByText(/Album mappings: \+5 new, 3 existing/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Artist mappings: \+2 new, 1 existing/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Local want list: \+3 new, 2 existing/)
    ).toBeInTheDocument();
    expect(screen.getByText(/Hidden albums: \+1 new/)).toBeInTheDocument();
  });

  it('hides category summaries for zero categories', () => {
    renderDialog();

    expect(
      screen.queryByText(/History-artist mappings/)
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Monitored sellers/)).not.toBeInTheDocument();
  });

  it('shows settings will merge message', () => {
    renderDialog();

    expect(
      screen.getByText('Settings will be merged with existing')
    ).toBeInTheDocument();
  });

  it('shows merge and replace radio options', () => {
    renderDialog();

    expect(screen.getByText('Merge with existing data')).toBeInTheDocument();
    expect(screen.getByText('Replace existing data')).toBeInTheDocument();

    // Merge is default
    const mergeRadio = screen.getByRole('radio', { name: /merge/i });
    expect(mergeRadio).toBeChecked();
  });

  it('allows switching to replace mode', async () => {
    renderDialog();

    const replaceRadio = screen.getByRole('radio', { name: /replace/i });
    await user.click(replaceRadio);

    expect(replaceRadio).toBeChecked();
  });

  it('shows validation error for invalid backup', () => {
    const invalidPreview = makePreview({
      valid: false,
      error: 'Invalid format',
    });
    renderDialog({ preview: invalidPreview });

    expect(
      screen.getByText(/Invalid backup: Invalid format/)
    ).toBeInTheDocument();
  });

  it('shows checksum warning for valid but mismatched checksum', () => {
    const preview = makePreview({ checksumValid: false });
    renderDialog({ preview });

    expect(screen.getByText(/Warning: Checksum mismatch/)).toBeInTheDocument();
  });

  it('does not show checksum warning when checksum is valid', () => {
    renderDialog();

    expect(screen.queryByText(/Checksum mismatch/)).not.toBeInTheDocument();
  });

  it('shows password field when backup includes credentials', () => {
    const preview = makePreview({ includesCredentials: true });
    renderDialog({ preview });

    expect(
      screen.getByText('This backup contains encrypted credentials')
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Enter backup password')
    ).toBeInTheDocument();
  });

  it('does not show password field when backup has no credentials', () => {
    renderDialog();

    expect(
      screen.queryByPlaceholderText('Enter backup password')
    ).not.toBeInTheDocument();
  });

  it('shows error when importing with credentials but no password', async () => {
    const preview = makePreview({ includesCredentials: true });
    renderDialog({ preview });

    await user.click(screen.getByText('Import'));

    expect(
      screen.getByText('Password is required for backup with credentials')
    ).toBeInTheDocument();
  });

  it('calls importBackup and onImportComplete on successful import', async () => {
    mockApi.importBackup.mockResolvedValue({
      success: true,
      errors: [],
      itemsAdded: 0,
      itemsUpdated: 0,
      settingsMerged: false,
    });

    renderDialog();

    await user.click(screen.getByText('Import'));

    await waitFor(() => {
      expect(mockApi.importBackup).toHaveBeenCalledWith('{}', {
        mode: 'merge',
        password: undefined,
      });
      expect(mockOnImportComplete).toHaveBeenCalled();
    });
  });

  it('shows error when import returns errors', async () => {
    mockApi.importBackup.mockResolvedValue({
      success: false,
      errors: ['Schema mismatch', 'Missing data'],
      itemsAdded: 0,
      itemsUpdated: 0,
      settingsMerged: false,
    });

    renderDialog();

    await user.click(screen.getByText('Import'));

    await waitFor(() => {
      expect(
        screen.getByText('Schema mismatch, Missing data')
      ).toBeInTheDocument();
    });
  });

  it('shows error on import exception', async () => {
    mockApi.importBackup.mockRejectedValue(new Error('Network error'));

    renderDialog();

    await user.click(screen.getByText('Import'));

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('disables Import button when preview is invalid', () => {
    const invalidPreview = makePreview({ valid: false });
    renderDialog({ preview: invalidPreview });

    const importButton = screen.getByText('Import').closest('button');
    expect(importButton).toBeDisabled();
  });

  it('calls onClose when Cancel is clicked', async () => {
    renderDialog();

    await user.click(screen.getByText('Cancel'));

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('shows Importing... text while loading', async () => {
    mockApi.importBackup.mockReturnValue(new Promise(() => {}));

    renderDialog();

    await user.click(screen.getByText('Import'));

    await waitFor(() => {
      expect(screen.getByText('Importing...')).toBeInTheDocument();
    });
  });

  it('hides import summary and mode when preview is invalid', () => {
    const invalidPreview = makePreview({ valid: false });
    renderDialog({ preview: invalidPreview });

    expect(screen.queryByText('Import Summary')).not.toBeInTheDocument();
    expect(screen.queryByText('Import Mode')).not.toBeInTheDocument();
  });
});
