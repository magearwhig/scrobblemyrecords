import React, { useState } from 'react';

import {
  BackupImportPreview,
  BackupImportOptions,
} from '../../../shared/types';
import ApiService from '../../services/api';

interface BackupImportDialogProps {
  api: ApiService;
  preview: BackupImportPreview;
  file: File;
  onClose: () => void;
  onImportComplete: () => void;
}

const BackupImportDialog: React.FC<BackupImportDialogProps> = ({
  api,
  preview,
  file,
  onClose,
  onImportComplete,
}) => {
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleImport = async () => {
    if (preview.includesCredentials && !password) {
      setError('Password is required for backup with credentials');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const content = await file.text();
      const options: BackupImportOptions = {
        mode,
        password: preview.includesCredentials ? password : undefined,
      };

      const result = await api.importBackup(content, options);

      if (!result.success) {
        setError(result.errors.join(', '));
        return;
      }

      onImportComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatSummaryLine = (
    label: string,
    summary: { new: number; existing: number }
  ): string => {
    const parts = [];
    if (summary.new > 0) parts.push(`+${summary.new} new`);
    if (summary.existing > 0) parts.push(`${summary.existing} existing`);
    return parts.length > 0 ? `${label}: ${parts.join(', ')}` : '';
  };

  // Calculate totals
  const totalNew =
    preview.summary.albumMappings.new +
    preview.summary.artistMappings.new +
    preview.summary.historyArtistMappings.new +
    preview.summary.hiddenAlbums.new +
    preview.summary.hiddenArtists.new +
    preview.summary.localWantList.new +
    preview.summary.vinylWatchList.new +
    preview.summary.monitoredSellers.new +
    preview.summary.artistMbidMappings.new +
    preview.summary.hiddenReleases.new +
    preview.summary.excludedArtists.new;

  const totalExisting =
    preview.summary.albumMappings.existing +
    preview.summary.artistMappings.existing +
    preview.summary.historyArtistMappings.existing +
    preview.summary.hiddenAlbums.existing +
    preview.summary.hiddenArtists.existing +
    preview.summary.localWantList.existing +
    preview.summary.vinylWatchList.existing +
    preview.summary.monitoredSellers.existing +
    preview.summary.artistMbidMappings.existing +
    preview.summary.hiddenReleases.existing +
    preview.summary.excludedArtists.existing;

  return (
    <div className='modal-overlay' onClick={onClose}>
      <div className='modal-content' onClick={e => e.stopPropagation()}>
        <div className='modal-header'>
          <h2>Import Backup</h2>
          <button className='modal-close' onClick={onClose}>
            &times;
          </button>
        </div>

        <div className='modal-body'>
          {/* File info */}
          <div className='backup-file-info'>
            <div className='info-row'>
              <span className='label'>File:</span>
              <span className='value'>{file.name}</span>
            </div>
            <div className='info-row'>
              <span className='label'>Created:</span>
              <span className='value'>{formatDate(preview.exportedAt)}</span>
            </div>
            <div className='info-row'>
              <span className='label'>App Version:</span>
              <span className='value'>{preview.appVersion}</span>
            </div>
          </div>

          {/* Validation status */}
          {!preview.valid && (
            <div className='error-message'>
              Invalid backup: {preview.error || 'Unknown error'}
            </div>
          )}

          {!preview.checksumValid && preview.valid && (
            <div className='warning-message'>
              Warning: Checksum mismatch - backup may be corrupted
            </div>
          )}

          {/* Import summary */}
          {preview.valid && (
            <div className='import-summary'>
              <h4>Import Summary</h4>
              <div className='summary-totals'>
                <span className='total-new'>+{totalNew} new items</span>
                <span className='total-existing'>
                  {totalExisting} existing items
                </span>
              </div>

              <ul className='summary-list'>
                {preview.summary.albumMappings.new > 0 ||
                preview.summary.albumMappings.existing > 0 ? (
                  <li>
                    {formatSummaryLine(
                      'Album mappings',
                      preview.summary.albumMappings
                    )}
                  </li>
                ) : null}
                {preview.summary.artistMappings.new > 0 ||
                preview.summary.artistMappings.existing > 0 ? (
                  <li>
                    {formatSummaryLine(
                      'Artist mappings',
                      preview.summary.artistMappings
                    )}
                  </li>
                ) : null}
                {preview.summary.historyArtistMappings.new > 0 ||
                preview.summary.historyArtistMappings.existing > 0 ? (
                  <li>
                    {formatSummaryLine(
                      'History-artist mappings',
                      preview.summary.historyArtistMappings
                    )}
                  </li>
                ) : null}
                {preview.summary.hiddenAlbums.new > 0 ||
                preview.summary.hiddenAlbums.existing > 0 ? (
                  <li>
                    {formatSummaryLine(
                      'Hidden albums',
                      preview.summary.hiddenAlbums
                    )}
                  </li>
                ) : null}
                {preview.summary.hiddenArtists.new > 0 ||
                preview.summary.hiddenArtists.existing > 0 ? (
                  <li>
                    {formatSummaryLine(
                      'Hidden artists',
                      preview.summary.hiddenArtists
                    )}
                  </li>
                ) : null}
                {preview.summary.localWantList.new > 0 ||
                preview.summary.localWantList.existing > 0 ? (
                  <li>
                    {formatSummaryLine(
                      'Local want list',
                      preview.summary.localWantList
                    )}
                  </li>
                ) : null}
                {preview.summary.vinylWatchList.new > 0 ||
                preview.summary.vinylWatchList.existing > 0 ? (
                  <li>
                    {formatSummaryLine(
                      'Vinyl watch list',
                      preview.summary.vinylWatchList
                    )}
                  </li>
                ) : null}
                {preview.summary.monitoredSellers.new > 0 ||
                preview.summary.monitoredSellers.existing > 0 ? (
                  <li>
                    {formatSummaryLine(
                      'Monitored sellers',
                      preview.summary.monitoredSellers
                    )}
                  </li>
                ) : null}
                {preview.summary.artistMbidMappings.new > 0 ||
                preview.summary.artistMbidMappings.existing > 0 ? (
                  <li>
                    {formatSummaryLine(
                      'MusicBrainz mappings',
                      preview.summary.artistMbidMappings
                    )}
                  </li>
                ) : null}
                {preview.summary.hiddenReleases.new > 0 ||
                preview.summary.hiddenReleases.existing > 0 ? (
                  <li>
                    {formatSummaryLine(
                      'Hidden releases',
                      preview.summary.hiddenReleases
                    )}
                  </li>
                ) : null}
                {preview.summary.excludedArtists.new > 0 ||
                preview.summary.excludedArtists.existing > 0 ? (
                  <li>
                    {formatSummaryLine(
                      'Excluded artists',
                      preview.summary.excludedArtists
                    )}
                  </li>
                ) : null}
                {preview.summary.settingsWillMerge && (
                  <li>Settings will be merged with existing</li>
                )}
              </ul>
            </div>
          )}

          {/* Import mode */}
          {preview.valid && (
            <div className='import-mode'>
              <h4>Import Mode</h4>
              <div className='radio-group'>
                <label className='radio-label'>
                  <input
                    type='radio'
                    name='mode'
                    value='merge'
                    checked={mode === 'merge'}
                    onChange={() => setMode('merge')}
                  />
                  <span>
                    <strong>Merge with existing data</strong>
                    <small>New items will be added, existing items kept</small>
                  </span>
                </label>
                <label className='radio-label'>
                  <input
                    type='radio'
                    name='mode'
                    value='replace'
                    checked={mode === 'replace'}
                    onChange={() => setMode('replace')}
                  />
                  <span>
                    <strong>Replace existing data</strong>
                    <small>All existing data will be overwritten</small>
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Password field for encrypted backups */}
          {preview.includesCredentials && preview.valid && (
            <div className='import-password'>
              <h4>This backup contains encrypted credentials</h4>
              <div className='form-group'>
                <label>Password:</label>
                <input
                  type='password'
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder='Enter backup password'
                />
              </div>
            </div>
          )}

          {error && <div className='error-message'>{error}</div>}
        </div>

        <div className='modal-footer'>
          <button
            className='btn btn-secondary'
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className='btn btn-primary'
            onClick={handleImport}
            disabled={loading || !preview.valid}
          >
            {loading ? 'Importing...' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BackupImportDialog;
