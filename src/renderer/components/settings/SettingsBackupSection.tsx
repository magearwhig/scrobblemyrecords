import React, { useState, useEffect, useCallback, useRef } from 'react';

import {
  BackupPreview,
  BackupSettings,
  AutoBackupInfo,
  BackupImportPreview,
} from '../../../shared/types';
import ApiService from '../../services/api';

import BackupImportDialog from './BackupImportDialog';

interface SettingsBackupSectionProps {
  api: ApiService;
}

const SettingsBackupSection: React.FC<SettingsBackupSectionProps> = ({
  api,
}) => {
  // Export state
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [includeCredentials, setIncludeCredentials] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportSuccess, setExportSuccess] = useState('');

  // Import state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] =
    useState<BackupImportPreview | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-backup state
  const [settings, setSettings] = useState<BackupSettings | null>(null);
  const [autoBackups, setAutoBackups] = useState<AutoBackupInfo[]>([]);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [settingsSuccess, setSettingsSuccess] = useState('');

  const loadPreview = useCallback(async () => {
    try {
      const data = await api.getBackupPreview();
      setPreview(data);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Failed to load backup preview:', error);
    }
  }, [api]);

  const loadSettings = useCallback(async () => {
    try {
      setSettingsLoading(true);
      const data = await api.getBackupSettings();
      setSettings(data);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Failed to load backup settings:', error);
    } finally {
      setSettingsLoading(false);
    }
  }, [api]);

  const loadAutoBackups = useCallback(async () => {
    try {
      const data = await api.listAutoBackups();
      setAutoBackups(data);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Failed to load auto-backups:', error);
    }
  }, [api]);

  // Load initial data
  useEffect(() => {
    loadPreview();
    loadSettings();
    loadAutoBackups();
  }, [loadPreview, loadSettings, loadAutoBackups]);

  // Export handlers
  const handleExport = async () => {
    if (includeCredentials) {
      if (!password) {
        setExportError('Password is required when including credentials');
        return;
      }
      if (password !== confirmPassword) {
        setExportError('Passwords do not match');
        return;
      }
      if (password.length < 8) {
        setExportError('Password must be at least 8 characters');
        return;
      }
    }

    try {
      setExportLoading(true);
      setExportError('');
      setExportSuccess('');

      const blob = await api.exportBackup({
        includeCredentials,
        password: includeCredentials ? password : undefined,
      });

      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const date = new Date().toISOString().split('T')[0];
      a.download = `recordscrobbles-backup-${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportSuccess('Backup exported successfully');
      setPassword('');
      setConfirmPassword('');
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : 'Failed to export backup'
      );
    } finally {
      setExportLoading(false);
    }
  };

  // Import handlers
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);

    try {
      const content = await file.text();
      const preview = await api.previewBackupImport(content);
      setImportPreview(preview);
      setShowImportDialog(true);
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : 'Failed to read backup file'
      );
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImportComplete = () => {
    setShowImportDialog(false);
    setImportFile(null);
    setImportPreview(null);
    loadPreview();
    setExportSuccess('Backup imported successfully');
  };

  // Settings handlers
  const handleSaveSettings = async () => {
    if (!settings) return;

    try {
      setSettingsLoading(true);
      setSettingsError('');
      const updated = await api.updateBackupSettings(settings);
      setSettings(updated);
      setSettingsSuccess('Backup settings saved');
    } catch (error) {
      setSettingsError(
        error instanceof Error ? error.message : 'Failed to save settings'
      );
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleRunAutoBackup = async () => {
    try {
      setSettingsLoading(true);
      setSettingsError('');
      await api.runAutoBackup();
      setSettingsSuccess('Manual backup completed');
      loadAutoBackups();
    } catch (error) {
      setSettingsError(
        error instanceof Error ? error.message : 'Failed to run backup'
      );
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleDeleteAutoBackup = async (filename: string) => {
    if (!confirm(`Delete backup "${filename}"?`)) return;

    try {
      await api.deleteAutoBackup(filename);
      setAutoBackups(prev => prev.filter(b => b.filename !== filename));
      setSettingsSuccess('Backup deleted');
    } catch (error) {
      setSettingsError(
        error instanceof Error ? error.message : 'Failed to delete backup'
      );
    }
  };

  const clearMessages = () => {
    setExportError('');
    setExportSuccess('');
    setSettingsError('');
    setSettingsSuccess('');
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className='settings-section'>
      {/* Export Backup */}
      <div className='settings-card'>
        <h3>Export Backup</h3>
        <p className='settings-description'>
          Export your settings, mappings, and preferences. Cached data from APIs
          is not included.
        </p>

        {preview && (
          <div className='backup-preview'>
            <h4>What&apos;s included:</h4>
            <ul className='backup-preview-list'>
              {preview.albumMappingsCount > 0 && (
                <li>{preview.albumMappingsCount} album mappings</li>
              )}
              {preview.artistMappingsCount > 0 && (
                <li>{preview.artistMappingsCount} artist mappings</li>
              )}
              {preview.historyArtistMappingsCount > 0 && (
                <li>
                  {preview.historyArtistMappingsCount} history-artist mappings
                </li>
              )}
              {(preview.hiddenAlbumsCount > 0 ||
                preview.hiddenArtistsCount > 0) && (
                <li>
                  {preview.hiddenAlbumsCount} hidden albums,{' '}
                  {preview.hiddenArtistsCount} hidden artists
                </li>
              )}
              {preview.localWantListCount > 0 && (
                <li>{preview.localWantListCount} items in local want list</li>
              )}
              {preview.vinylWatchListCount > 0 && (
                <li>{preview.vinylWatchListCount} vinyl watch items</li>
              )}
              {preview.monitoredSellersCount > 0 && (
                <li>{preview.monitoredSellersCount} monitored sellers</li>
              )}
              {preview.artistMbidMappingsCount > 0 && (
                <li>
                  {preview.artistMbidMappingsCount} MusicBrainz artist mappings
                </li>
              )}
              {(preview.hiddenReleasesCount > 0 ||
                preview.excludedArtistsCount > 0) && (
                <li>
                  {preview.hiddenReleasesCount} hidden releases,{' '}
                  {preview.excludedArtistsCount} excluded artists
                </li>
              )}
              {(preview.hasUserSettings ||
                preview.hasSuggestionSettings ||
                preview.hasAiSettings) && <li>All preference settings</li>}
            </ul>
          </div>
        )}

        <div className='backup-credentials-option'>
          <label className='checkbox-label'>
            <input
              type='checkbox'
              checked={includeCredentials}
              onChange={e => setIncludeCredentials(e.target.checked)}
            />
            <span>Include API credentials (requires password)</span>
          </label>

          {includeCredentials && (
            <div className='backup-password-fields'>
              <div className='form-group'>
                <label>Password:</label>
                <input
                  type='password'
                  value={password}
                  onChange={e => {
                    setPassword(e.target.value);
                    clearMessages();
                  }}
                  placeholder='Enter encryption password'
                />
              </div>
              <div className='form-group'>
                <label>Confirm Password:</label>
                <input
                  type='password'
                  value={confirmPassword}
                  onChange={e => {
                    setConfirmPassword(e.target.value);
                    clearMessages();
                  }}
                  placeholder='Confirm password'
                />
              </div>
            </div>
          )}
        </div>

        {exportError && <div className='error-message'>{exportError}</div>}
        {exportSuccess && (
          <div className='success-message'>{exportSuccess}</div>
        )}

        <button
          className='btn btn-primary'
          onClick={handleExport}
          disabled={exportLoading}
        >
          {exportLoading ? 'Exporting...' : 'Export Backup'}
        </button>
      </div>

      {/* Import Backup */}
      <div className='settings-card'>
        <h3>Import Backup</h3>
        <p className='settings-description'>
          Restore settings and data from a backup file.
        </p>

        <input
          type='file'
          ref={fileInputRef}
          accept='.json'
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        <button
          className='btn btn-secondary'
          onClick={() => fileInputRef.current?.click()}
        >
          Choose Backup File...
        </button>
      </div>

      {/* Auto-Backup Settings */}
      <div className='settings-card'>
        <h3>Automatic Backups</h3>
        <p className='settings-description'>
          Configure automatic backups to protect your data.
        </p>

        {settings && (
          <>
            <div className='auto-backup-settings'>
              <label className='checkbox-label'>
                <input
                  type='checkbox'
                  checked={settings.enabled}
                  onChange={e =>
                    setSettings({ ...settings, enabled: e.target.checked })
                  }
                />
                <span>Enable automatic backups</span>
              </label>

              {settings.enabled && (
                <div className='auto-backup-options'>
                  <div className='form-group'>
                    <label>Frequency:</label>
                    <select
                      value={settings.frequency}
                      onChange={e =>
                        setSettings({
                          ...settings,
                          frequency: e.target.value as
                            | 'daily'
                            | 'weekly'
                            | 'monthly',
                        })
                      }
                    >
                      <option value='daily'>Daily</option>
                      <option value='weekly'>Weekly</option>
                      <option value='monthly'>Monthly</option>
                    </select>
                  </div>

                  <div className='form-group'>
                    <label>Keep last:</label>
                    <input
                      type='number'
                      min='1'
                      max='30'
                      value={settings.retentionCount}
                      onChange={e =>
                        setSettings({
                          ...settings,
                          retentionCount: parseInt(e.target.value) || 5,
                        })
                      }
                    />
                    <span className='form-hint'>backups</span>
                  </div>

                  <div className='form-group'>
                    <span className='form-label'>Location:</span>
                    <code>./data/backups/</code>
                  </div>

                  {settings.lastBackup && (
                    <div className='form-group'>
                      <span className='form-label'>Last backup:</span>
                      <span>{formatDate(settings.lastBackup)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {settingsError && (
              <div className='error-message'>{settingsError}</div>
            )}
            {settingsSuccess && (
              <div className='success-message'>{settingsSuccess}</div>
            )}

            <div className='button-group'>
              <button
                className='btn btn-primary'
                onClick={handleSaveSettings}
                disabled={settingsLoading}
              >
                {settingsLoading ? 'Saving...' : 'Save Settings'}
              </button>
              <button
                className='btn btn-secondary'
                onClick={handleRunAutoBackup}
                disabled={settingsLoading}
              >
                Backup Now
              </button>
            </div>
          </>
        )}

        {/* Auto-backup list */}
        {autoBackups.length > 0 && (
          <div className='auto-backup-list'>
            <h4>Saved Backups</h4>
            <ul>
              {autoBackups.map(backup => (
                <li key={backup.filename} className='auto-backup-item'>
                  <span className='backup-filename'>{backup.filename}</span>
                  <span className='backup-meta'>
                    {formatDate(backup.createdAt)} ({formatBytes(backup.size)})
                  </span>
                  <button
                    className='btn btn-danger btn-small'
                    onClick={() => handleDeleteAutoBackup(backup.filename)}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Import Dialog */}
      {showImportDialog && importPreview && importFile && (
        <BackupImportDialog
          api={api}
          preview={importPreview}
          file={importFile}
          onClose={() => {
            setShowImportDialog(false);
            setImportFile(null);
            setImportPreview(null);
          }}
          onImportComplete={handleImportComplete}
        />
      )}
    </div>
  );
};

export default SettingsBackupSection;
