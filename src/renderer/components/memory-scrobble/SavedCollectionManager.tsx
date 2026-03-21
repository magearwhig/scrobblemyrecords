import {
  AlertTriangle,
  Check,
  CheckCircle,
  FileUp,
  FolderOpen,
  Music,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import {
  SavedCollection,
  SavedCollectionTrack,
  TrackSearchResult,
} from '../../../shared/types';
import { createLogger } from '../../utils/logger';
import { Badge } from '../ui/Badge';
import { Button, IconButton } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Modal } from '../ui/Modal';
import { Skeleton } from '../ui/Skeleton';
import './SavedCollectionManager.css';

const log = createLogger('SavedCollectionManager');

export interface SavedCollectionManagerProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'manage' | 'picker';
  onPickCollection?: (tracks: SavedCollectionTrack[]) => void;
  // API callbacks — passed in so this component doesn't import ApiService directly
  fetchCollections: () => Promise<SavedCollection[]>;
  createCollection: (
    name: string,
    description?: string
  ) => Promise<SavedCollection>;
  updateCollection: (
    id: string,
    name: string,
    description?: string
  ) => Promise<void>;
  deleteCollection: (id: string) => Promise<void>;
  importCsv: (
    id: string,
    csvContent: string
  ) => Promise<{
    imported: number;
    errors: string[];
    unmatched: SavedCollectionTrack[];
  }>;
  addTrack: (
    id: string,
    track: { artist: string; track: string; album?: string; duration?: number }
  ) => Promise<void>;
  removeTrack: (id: string, position: number) => Promise<void>;
  replaceTrack?: (
    id: string,
    position: number,
    track: {
      artist: string;
      track: string;
      album?: string;
      duration?: number;
      lastfmMatch?: boolean;
    }
  ) => Promise<void>;
  searchFn?: (query: string) => Promise<TrackSearchResult[]>;
}

type View =
  | 'list'
  | 'create'
  | 'edit'
  | 'detail'
  | 'import-preview'
  | 'pick-tracks';

interface CsvPreviewTrack {
  artist: string;
  track: string;
  album?: string;
  duration?: number;
  matched: boolean;
}

export const SavedCollectionManager: React.FC<SavedCollectionManagerProps> = ({
  isOpen,
  onClose,
  mode,
  onPickCollection,
  fetchCollections,
  createCollection,
  updateCollection,
  deleteCollection,
  importCsv,
  addTrack,
  removeTrack,
  replaceTrack,
  searchFn,
}) => {
  const [collections, setCollections] = useState<SavedCollection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('list');
  const [selectedCollection, setSelectedCollection] =
    useState<SavedCollection | null>(null);

  // Create/edit form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formSaving, setFormSaving] = useState(false);

  // CSV import state
  const [csvPreview, setCsvPreview] = useState<CsvPreviewTrack[]>([]);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Track remap state — position of the track being remapped
  const [remapPosition, setRemapPosition] = useState<number | null>(null);
  const [remapOriginal, setRemapOriginal] = useState<{
    artist: string;
    track: string;
  } | null>(null);
  const [remapQuery, setRemapQuery] = useState('');
  const [remapResults, setRemapResults] = useState<TrackSearchResult[]>([]);
  const [remapLoading, setRemapLoading] = useState(false);
  const remapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Picker track selection state
  const [pickerSelected, setPickerSelected] = useState<Set<number>>(new Set());

  const loadCollections = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCollections();
      setCollections(data);
    } catch (err) {
      log.error('Failed to load collections', err);
      setError('Failed to load collections. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [fetchCollections]);

  useEffect(() => {
    if (isOpen) {
      loadCollections();
      setView('list');
      setSelectedCollection(null);
    }
  }, [isOpen, loadCollections]);

  const handleCreate = useCallback(async () => {
    if (!formName.trim()) return;
    setFormSaving(true);
    try {
      await createCollection(
        formName.trim(),
        formDescription.trim() || undefined
      );
      await loadCollections();
      setView('list');
      setFormName('');
      setFormDescription('');
    } catch (err) {
      log.error('Failed to create collection', err);
      setError('Failed to create collection.');
    } finally {
      setFormSaving(false);
    }
  }, [formName, formDescription, createCollection, loadCollections]);

  const handleUpdate = useCallback(async () => {
    if (!selectedCollection || !formName.trim()) return;
    setFormSaving(true);
    try {
      await updateCollection(
        selectedCollection.id,
        formName.trim(),
        formDescription.trim() || undefined
      );
      await loadCollections();
      setView('list');
      setFormName('');
      setFormDescription('');
      setSelectedCollection(null);
    } catch (err) {
      log.error('Failed to update collection', err);
      setError('Failed to update collection.');
    } finally {
      setFormSaving(false);
    }
  }, [
    selectedCollection,
    formName,
    formDescription,
    updateCollection,
    loadCollections,
  ]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteCollection(id);
        await loadCollections();
        setDeleteConfirmId(null);
        if (selectedCollection?.id === id) {
          setSelectedCollection(null);
          setView('list');
        }
      } catch (err) {
        log.error('Failed to delete collection', err);
        setError('Failed to delete collection.');
      }
    },
    [deleteCollection, loadCollections, selectedCollection]
  );

  const handleRemoveTrack = useCallback(
    async (collectionId: string, position: number) => {
      try {
        await removeTrack(collectionId, position);
        // Refresh the selected collection
        const updated = await fetchCollections();
        setCollections(updated);
        const refreshed = updated.find(c => c.id === collectionId);
        if (refreshed) setSelectedCollection(refreshed);
      } catch (err) {
        log.error('Failed to remove track', err);
        setError('Failed to remove track.');
      }
    },
    [removeTrack, fetchCollections]
  );

  const handleStartRemap = useCallback(
    (position: number, artist: string, track: string) => {
      setRemapPosition(position);
      setRemapOriginal({ artist, track });
      setRemapQuery(track);
      setRemapResults([]);
      // Trigger initial search with track name
      if (searchFn) {
        setRemapLoading(true);
        searchFn(track)
          .then(results => setRemapResults(results))
          .catch(err => log.error('Remap search failed', err))
          .finally(() => setRemapLoading(false));
      }
    },
    [searchFn]
  );

  const handleRemapSearch = useCallback(
    (query: string) => {
      setRemapQuery(query);
      if (remapTimerRef.current) clearTimeout(remapTimerRef.current);
      if (!searchFn || !query.trim()) {
        setRemapResults([]);
        return;
      }
      remapTimerRef.current = setTimeout(() => {
        setRemapLoading(true);
        searchFn(query)
          .then(results => setRemapResults(results))
          .catch(err => log.error('Remap search failed', err))
          .finally(() => setRemapLoading(false));
      }, 300);
    },
    [searchFn]
  );

  const handleRemapSelect = useCallback(
    async (result: TrackSearchResult) => {
      if (!selectedCollection || remapPosition === null) return;
      try {
        if (replaceTrack) {
          // Replace in-place at the same position
          await replaceTrack(selectedCollection.id, remapPosition, {
            artist: result.artist,
            track: result.track,
            album: result.album,
            duration: result.duration,
            lastfmMatch: true,
          });
        } else {
          // Fallback: remove + add (will go to end)
          await removeTrack(selectedCollection.id, remapPosition);
          await addTrack(selectedCollection.id, {
            artist: result.artist,
            track: result.track,
            album: result.album,
            duration: result.duration,
          });
        }
        // Refresh
        const updated = await fetchCollections();
        setCollections(updated);
        const refreshed = updated.find(c => c.id === selectedCollection.id);
        if (refreshed) setSelectedCollection(refreshed);
        setRemapPosition(null);
        setRemapOriginal(null);
        setRemapQuery('');
        setRemapResults([]);
      } catch (err) {
        log.error('Failed to remap track', err);
        setError('Failed to remap track.');
      }
    },
    [
      selectedCollection,
      remapPosition,
      replaceTrack,
      removeTrack,
      addTrack,
      fetchCollections,
    ]
  );

  const handleCsvFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = event => {
        const content = event.target?.result as string;
        if (!content) return;

        // Parse CSV for preview
        const lines = content.split('\n').filter(l => l.trim());
        const tracks: CsvPreviewTrack[] = [];

        for (const line of lines) {
          // Skip header row if detected
          if (
            line.toLowerCase().startsWith('artist,') ||
            line.toLowerCase().startsWith('"artist"')
          ) {
            continue;
          }

          const parts = line
            .split(',')
            .map(p => p.trim().replace(/^"|"$/g, ''));
          if (parts.length >= 2) {
            tracks.push({
              artist: parts[0],
              track: parts[1],
              album: parts[2] || undefined,
              duration: parts[3] ? parseDurationField(parts[3]) : undefined,
              matched: false, // Will be determined after import
            });
          }
        }

        setCsvPreview(tracks);
        setCsvError(null);
        setView('import-preview');
      };
      reader.onerror = () => {
        setCsvError('Failed to read file.');
      };
      reader.readAsText(file);

      // Reset file input so the same file can be re-selected
      e.target.value = '';
    },
    []
  );

  const handleCsvImport = useCallback(async () => {
    if (!selectedCollection || csvPreview.length === 0) return;
    setCsvImporting(true);
    setCsvError(null);
    try {
      // Reconstruct CSV content from preview
      const csvContent = csvPreview
        .map(t => {
          const parts = [t.artist, t.track];
          if (t.album) parts.push(t.album);
          if (t.duration) parts.push(String(t.duration));
          return parts.join(',');
        })
        .join('\n');

      const result = await importCsv(selectedCollection.id, csvContent);

      if (result.errors.length > 0) {
        setCsvError(
          `Imported ${result.imported} tracks. ${result.errors.length} errors.`
        );
      }

      // Refresh collections
      await loadCollections();
      const refreshed = collections.find(c => c.id === selectedCollection.id);
      if (refreshed) setSelectedCollection(refreshed);

      setCsvPreview([]);
      setView('detail');
    } catch (err) {
      log.error('CSV import failed', err);
      setCsvError('Import failed. Please check your CSV format.');
    } finally {
      setCsvImporting(false);
    }
  }, [selectedCollection, csvPreview, importCsv, loadCollections, collections]);

  const handlePickCollection = useCallback((collection: SavedCollection) => {
    setSelectedCollection(collection);
    setPickerSelected(new Set());
    setView('pick-tracks');
  }, []);

  const handleTogglePickerTrack = useCallback((position: number) => {
    setPickerSelected(prev => {
      const next = new Set(prev);
      if (next.has(position)) {
        next.delete(position);
      } else {
        next.add(position);
      }
      return next;
    });
  }, []);

  const handleToggleAllPickerTracks = useCallback(() => {
    if (!selectedCollection) return;
    setPickerSelected(prev => {
      if (prev.size === selectedCollection.tracks.length) {
        return new Set();
      }
      return new Set(selectedCollection.tracks.map(t => t.position));
    });
  }, [selectedCollection]);

  const handleConfirmPickedTracks = useCallback(() => {
    if (!selectedCollection || !onPickCollection) return;
    const selected = selectedCollection.tracks.filter(t =>
      pickerSelected.has(t.position)
    );
    onPickCollection(selected);
    onClose();
  }, [selectedCollection, pickerSelected, onPickCollection, onClose]);

  const openDetail = useCallback((collection: SavedCollection) => {
    setSelectedCollection(collection);
    setView('detail');
  }, []);

  const openEdit = useCallback((collection: SavedCollection) => {
    setSelectedCollection(collection);
    setFormName(collection.name);
    setFormDescription(collection.description ?? '');
    setView('edit');
  }, []);

  const openCreate = useCallback(() => {
    setFormName('');
    setFormDescription('');
    setView('create');
  }, []);

  const renderList = () => {
    if (loading) {
      return (
        <div className='collection-manager-loading'>
          <Skeleton width='100%' height={48} />
          <Skeleton width='100%' height={48} />
          <Skeleton width='100%' height={48} />
        </div>
      );
    }

    if (collections.length === 0) {
      return (
        <EmptyState
          icon={<FolderOpen size={40} aria-hidden='true' />}
          title='No saved collections'
          description='Create a collection to save track lists for offline listening sessions.'
          actions={
            mode === 'manage'
              ? [{ label: 'Create Collection', onClick: openCreate }]
              : undefined
          }
        />
      );
    }

    return (
      <div className='collection-manager-list'>
        {collections.map(collection => (
          <div key={collection.id} className='collection-manager-item'>
            <button
              className='collection-manager-item-info'
              onClick={() =>
                mode === 'picker'
                  ? handlePickCollection(collection)
                  : openDetail(collection)
              }
              aria-label={`${collection.name}, ${collection.tracks.length} tracks`}
            >
              <Music size={16} aria-hidden='true' />
              <span className='collection-manager-item-name'>
                {collection.name}
              </span>
              <Badge variant='default' size='small'>
                {collection.tracks.length} tracks
              </Badge>
            </button>
            {mode === 'manage' && (
              <div className='collection-manager-item-actions'>
                <IconButton
                  icon={<Trash2 size={16} aria-hidden='true' />}
                  variant='ghost'
                  size='small'
                  aria-label={`Delete ${collection.name}`}
                  onClick={() => setDeleteConfirmId(collection.id)}
                />
              </div>
            )}
            {deleteConfirmId === collection.id && (
              <div className='collection-manager-delete-confirm'>
                <span>Delete this collection?</span>
                <Button
                  variant='danger'
                  size='small'
                  onClick={() => handleDelete(collection.id)}
                >
                  Delete
                </Button>
                <Button
                  variant='ghost'
                  size='small'
                  onClick={() => setDeleteConfirmId(null)}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderCreateEdit = () => {
    const isEdit = view === 'edit';
    return (
      <div className='collection-manager-form'>
        <label className='collection-manager-label'>
          Name
          <input
            type='text'
            className='collection-manager-input'
            value={formName}
            onChange={e => setFormName(e.target.value)}
            placeholder='e.g., OpenSwim Pro'
            aria-label='Collection name'
            autoFocus
          />
        </label>
        <label className='collection-manager-label'>
          Description (optional)
          <textarea
            className='collection-manager-textarea'
            value={formDescription}
            onChange={e => setFormDescription(e.target.value)}
            placeholder='Describe this collection...'
            aria-label='Collection description'
            rows={3}
          />
        </label>
        <div className='collection-manager-form-actions'>
          <Button
            variant='primary'
            onClick={isEdit ? handleUpdate : handleCreate}
            disabled={!formName.trim() || formSaving}
            loading={formSaving}
          >
            {isEdit ? 'Save Changes' : 'Create Collection'}
          </Button>
          <Button variant='ghost' onClick={() => setView('list')}>
            Cancel
          </Button>
        </div>
      </div>
    );
  };

  const renderDetail = () => {
    if (!selectedCollection) return null;

    return (
      <div className='collection-manager-detail'>
        <div className='collection-manager-detail-header'>
          <div>
            <h3 className='collection-manager-detail-title'>
              {selectedCollection.name}
            </h3>
            {selectedCollection.description && (
              <p className='collection-manager-detail-desc'>
                {selectedCollection.description}
              </p>
            )}
          </div>
          <div className='collection-manager-detail-actions'>
            <Button
              variant='outline'
              size='small'
              onClick={() => openEdit(selectedCollection)}
            >
              Edit
            </Button>
            <Button
              variant='outline'
              size='small'
              iconLeft={<FileUp size={16} aria-hidden='true' />}
              onClick={() => fileInputRef.current?.click()}
            >
              Import CSV
            </Button>
            <input
              ref={fileInputRef}
              type='file'
              accept='.csv,text/csv'
              className='collection-manager-file-input'
              onChange={handleCsvFileSelect}
              aria-label='Select CSV file to import'
            />
          </div>
          <p className='collection-manager-csv-hint'>
            CSV format: <code>artist,track,album,duration</code> — album and
            duration are optional. Duration can be <code>MM:SS</code> or
            seconds.
          </p>
        </div>

        {selectedCollection.tracks.length === 0 ? (
          <EmptyState
            icon={<Music size={32} aria-hidden='true' />}
            title='No tracks yet'
            description='Import a CSV file to add tracks. Format: artist,track,album,duration (album and duration are optional).'
            size='small'
          />
        ) : (
          <>
            <div className='collection-manager-track-legend'>
              <span className='collection-manager-track-legend-item'>
                <CheckCircle
                  size={14}
                  aria-hidden='true'
                  className='collection-manager-track-matched'
                />
                In Last.fm history
              </span>
              <span className='collection-manager-track-legend-item'>
                <AlertTriangle
                  size={14}
                  aria-hidden='true'
                  className='collection-manager-track-unmatched'
                />
                Not in history
              </span>
            </div>
            <div className='collection-manager-tracks'>
              {selectedCollection.tracks.map((track, idx) => (
                <React.Fragment key={idx}>
                  <div className='collection-manager-track'>
                    <span className='collection-manager-track-position'>
                      {track.position}
                    </span>
                    <div className='collection-manager-track-info'>
                      <span className='collection-manager-track-artist'>
                        {track.artist}
                      </span>
                      <span className='collection-manager-track-separator'>
                        {' - '}
                      </span>
                      <span className='collection-manager-track-name'>
                        {track.track}
                      </span>
                    </div>
                    {track.lastfmMatch ? (
                      <span title='Found in Last.fm history'>
                        <CheckCircle
                          size={16}
                          aria-label='Found in Last.fm history'
                          className='collection-manager-track-matched'
                        />
                      </span>
                    ) : (
                      <span className='collection-manager-track-unmatched-actions'>
                        <span title='Not found in Last.fm history'>
                          <AlertTriangle
                            size={16}
                            aria-label='Not found in Last.fm history'
                            className='collection-manager-track-unmatched'
                          />
                        </span>
                        {mode === 'manage' && searchFn && (
                          <button
                            className='collection-manager-remap-btn'
                            onClick={() =>
                              remapPosition === track.position
                                ? setRemapPosition(null)
                                : handleStartRemap(
                                    track.position,
                                    track.artist,
                                    track.track
                                  )
                            }
                            title='Fix match — search for correct track'
                            aria-label={`Fix match for ${track.artist} - ${track.track}`}
                          >
                            <RefreshCw size={14} aria-hidden='true' />
                            Fix
                          </button>
                        )}
                      </span>
                    )}
                    {mode === 'manage' && (
                      <IconButton
                        icon={<X size={14} aria-hidden='true' />}
                        variant='ghost'
                        size='small'
                        aria-label={`Remove ${track.artist} - ${track.track}`}
                        onClick={() =>
                          handleRemoveTrack(
                            selectedCollection.id,
                            track.position
                          )
                        }
                      />
                    )}
                  </div>
                  {remapPosition === track.position && (
                    <div className='collection-manager-remap-panel'>
                      <div className='collection-manager-remap-header'>
                        <span className='collection-manager-remap-label'>
                          Replace with correct track:
                        </span>
                        <button
                          className='collection-manager-remap-close'
                          onClick={() => setRemapPosition(null)}
                          aria-label='Cancel remap'
                        >
                          <X size={14} aria-hidden='true' />
                        </button>
                      </div>
                      {remapOriginal && (
                        <div className='collection-manager-remap-original'>
                          Original: <strong>{remapOriginal.artist}</strong> —{' '}
                          {remapOriginal.track}
                        </div>
                      )}
                      <input
                        type='text'
                        className='collection-manager-remap-input'
                        value={remapQuery}
                        onChange={e => handleRemapSearch(e.target.value)}
                        placeholder='Search for correct track...'
                        aria-label='Search for correct track'
                        autoFocus
                      />
                      {remapLoading && (
                        <div className='collection-manager-remap-loading'>
                          Searching...
                        </div>
                      )}
                      {remapResults.length > 0 && (
                        <div className='collection-manager-remap-results'>
                          {remapResults.map((result, ri) => (
                            <button
                              key={ri}
                              className='collection-manager-remap-result'
                              onClick={() => handleRemapSelect(result)}
                              aria-label={`Select ${result.artist} - ${result.track}`}
                            >
                              <span className='collection-manager-remap-result-artist'>
                                {result.artist}
                              </span>
                              <span className='collection-manager-remap-result-separator'>
                                {' \u2014 '}
                              </span>
                              <span className='collection-manager-remap-result-track'>
                                {result.track}
                              </span>
                              {result.album && (
                                <span className='collection-manager-remap-result-album'>
                                  {result.album}
                                </span>
                              )}
                              {result.source === 'history' &&
                                result.playCount && (
                                  <Badge variant='default' size='small'>
                                    {result.playCount} plays
                                  </Badge>
                                )}
                            </button>
                          ))}
                        </div>
                      )}
                      {!remapLoading &&
                        remapQuery &&
                        remapResults.length === 0 && (
                          <div className='collection-manager-remap-empty'>
                            No matches found. Try a different search.
                          </div>
                        )}
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  const renderImportPreview = () => (
    <div className='collection-manager-import-preview'>
      <h3 className='collection-manager-import-title'>
        CSV Import Preview
        <Badge variant='default' size='small'>
          {csvPreview.length} tracks
        </Badge>
      </h3>

      {csvError && (
        <div className='collection-manager-import-error'>
          <AlertTriangle size={16} aria-hidden='true' />
          {csvError}
        </div>
      )}

      {csvPreview.length === 0 ? (
        <p className='collection-manager-import-empty'>
          No valid tracks found in the CSV file.
        </p>
      ) : (
        <>
          <div className='collection-manager-import-list'>
            {csvPreview.map((track, idx) => (
              <div key={idx} className='collection-manager-import-row'>
                <span className='collection-manager-import-num'>{idx + 1}</span>
                <span className='collection-manager-import-artist'>
                  {track.artist}
                </span>
                <span className='collection-manager-import-separator'>
                  {' - '}
                </span>
                <span className='collection-manager-import-track'>
                  {track.track}
                </span>
                {track.album && (
                  <span className='collection-manager-import-album'>
                    {track.album}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className='collection-manager-import-actions'>
            <Button
              variant='primary'
              onClick={handleCsvImport}
              loading={csvImporting}
              disabled={csvImporting}
            >
              Import {csvPreview.length} Tracks
            </Button>
            <Button
              variant='ghost'
              onClick={() => {
                setCsvPreview([]);
                setView('detail');
              }}
            >
              Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  );

  const renderPickTracks = () => {
    if (!selectedCollection) return null;

    const allSelected =
      pickerSelected.size === selectedCollection.tracks.length;

    return (
      <div className='collection-manager-picker'>
        <div className='collection-manager-picker-header'>
          <button
            className='collection-manager-picker-select-all'
            onClick={handleToggleAllPickerTracks}
            aria-label={
              allSelected ? 'Deselect all tracks' : 'Select all tracks'
            }
          >
            <span
              className={`collection-manager-picker-checkbox ${allSelected ? 'collection-manager-picker-checkbox--checked' : ''}`}
            >
              {allSelected && <Check size={12} aria-hidden='true' />}
            </span>
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
          <span className='collection-manager-picker-count'>
            {pickerSelected.size} of {selectedCollection.tracks.length} selected
          </span>
        </div>
        <div className='collection-manager-picker-tracks'>
          {selectedCollection.tracks.map(track => {
            const isSelected = pickerSelected.has(track.position);
            return (
              <button
                key={track.position}
                className={`collection-manager-picker-track ${isSelected ? 'collection-manager-picker-track--selected' : ''}`}
                onClick={() => handleTogglePickerTrack(track.position)}
                aria-label={`${isSelected ? 'Deselect' : 'Select'} ${track.artist} - ${track.track}`}
              >
                <span
                  className={`collection-manager-picker-checkbox ${isSelected ? 'collection-manager-picker-checkbox--checked' : ''}`}
                >
                  {isSelected && <Check size={12} aria-hidden='true' />}
                </span>
                <span className='collection-manager-picker-track-position'>
                  {track.position}
                </span>
                <span className='collection-manager-picker-track-info'>
                  <span className='collection-manager-picker-track-artist'>
                    {track.artist}
                  </span>
                  <span className='collection-manager-track-separator'>
                    {' - '}
                  </span>
                  <span className='collection-manager-picker-track-name'>
                    {track.track}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <div className='collection-manager-picker-actions'>
          <Button
            variant='primary'
            onClick={handleConfirmPickedTracks}
            disabled={pickerSelected.size === 0}
          >
            Load {pickerSelected.size}{' '}
            {pickerSelected.size === 1 ? 'Track' : 'Tracks'}
          </Button>
          <Button
            variant='ghost'
            onClick={() => {
              setView('list');
              setSelectedCollection(null);
              setPickerSelected(new Set());
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  };

  const getTitle = () => {
    if (view === 'pick-tracks')
      return selectedCollection?.name ?? 'Select Tracks';
    if (mode === 'picker') return 'Load from Collection';
    switch (view) {
      case 'create':
        return 'New Collection';
      case 'edit':
        return 'Edit Collection';
      case 'detail':
        return selectedCollection?.name ?? 'Collection';
      case 'import-preview':
        return 'Import Preview';
      default:
        return 'Saved Collections';
    }
  };

  const showBackButton = view !== 'list';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={getTitle()}
      size='large'
      className='collection-manager-modal'
      footer={
        mode === 'manage' && view === 'list' ? (
          <div className='collection-manager-footer'>
            <Button
              variant='primary'
              size='small'
              iconLeft={<Plus size={16} aria-hidden='true' />}
              onClick={openCreate}
            >
              New Collection
            </Button>
          </div>
        ) : undefined
      }
    >
      {error && (
        <div className='collection-manager-error'>
          <AlertTriangle size={16} aria-hidden='true' />
          <span>{error}</span>
          <button
            className='collection-manager-error-dismiss'
            onClick={() => setError(null)}
            aria-label='Dismiss error'
          >
            <X size={14} aria-hidden='true' />
          </button>
        </div>
      )}

      {showBackButton && (
        <button
          className='collection-manager-back'
          onClick={() => {
            setView('list');
            setSelectedCollection(null);
            setCsvPreview([]);
            setPickerSelected(new Set());
          }}
          aria-label='Back to collection list'
        >
          Back to collections
        </button>
      )}

      {view === 'list' && renderList()}
      {(view === 'create' || view === 'edit') && renderCreateEdit()}
      {view === 'detail' && renderDetail()}
      {view === 'import-preview' && renderImportPreview()}
      {view === 'pick-tracks' && renderPickTracks()}
    </Modal>
  );
};

/**
 * Parse a duration field from CSV: supports "MM:SS" or raw seconds
 */
function parseDurationField(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  // MM:SS format
  const mmss = trimmed.match(/^(\d+):(\d{2})$/);
  if (mmss) {
    return parseInt(mmss[1], 10) * 60 + parseInt(mmss[2], 10);
  }

  // Raw seconds
  const num = parseInt(trimmed, 10);
  return isNaN(num) ? undefined : num;
}

export default SavedCollectionManager;
