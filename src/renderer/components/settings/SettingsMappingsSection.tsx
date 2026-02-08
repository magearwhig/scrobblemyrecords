import React, { useState, useEffect } from 'react';

import { ArtistMapping } from '../../../backend/services/artistMappingService';
import {
  AlbumMapping,
  ArtistMapping as DiscoveryArtistMapping,
  ArtistMbidMapping,
  TrackMapping,
} from '../../../shared/types';
import { useAuth } from '../../context/AuthContext';
import ApiService from '../../services/api';
import { createLogger } from '../../utils/logger';

const logger = createLogger('SettingsMappingsSection');

interface SettingsMappingsSectionProps {
  api: ApiService;
}

const SettingsMappingsSection: React.FC<SettingsMappingsSectionProps> = ({
  api,
}) => {
  const { authStatus } = useAuth();

  // Artist name mapping state
  const [mappings, setMappings] = useState<ArtistMapping[]>([]);
  const [stats, setStats] = useState<{
    totalMappings: number;
    lastUpdated?: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [newMapping, setNewMapping] = useState({
    discogsName: '',
    lastfmName: '',
  });
  const [editingMapping, setEditingMapping] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [artists, setArtists] = useState<string[]>([]);
  const [filteredArtists, setFilteredArtists] = useState<string[]>([]);
  const [showArtistSuggestions, setShowArtistSuggestions] = useState(false);
  const [artistsLoading, setArtistsLoading] = useState(false);
  const [artistsLoadError, setArtistsLoadError] = useState<string>('');
  const [suggestions, setSuggestions] = useState<
    Array<{
      artist: string;
      localScrobbles: number;
      suggestedMapping: string;
    }>
  >([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  // Discovery mapping state
  const [discoveryAlbumMappings, setDiscoveryAlbumMappings] = useState<
    AlbumMapping[]
  >([]);
  const [discoveryArtistMappings, setDiscoveryArtistMappings] = useState<
    DiscoveryArtistMapping[]
  >([]);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);

  // MusicBrainz mapping state (for New Release Tracking)
  const [mbidMappings, setMbidMappings] = useState<ArtistMbidMapping[]>([]);
  const [mbidMappingsLoading, setMbidMappingsLoading] = useState(false);

  // Track mapping state (for Forgotten Favorites)
  const [trackMappings, setTrackMappings] = useState<TrackMapping[]>([]);
  const [trackMappingsLoading, setTrackMappingsLoading] = useState(false);

  useEffect(() => {
    loadMappings();
    loadDiscoveryMappings();
    loadTrackMappings();
    loadMbidMappings();
    if (authStatus.discogs.authenticated && authStatus.discogs.username) {
      loadArtists();
      loadSuggestions();
    }
  }, [authStatus.discogs.authenticated, authStatus.discogs.username]);

  // Handle query param for pre-filling artist name
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      const queryStart = hash.indexOf('?');
      if (queryStart !== -1) {
        const params = new URLSearchParams(hash.substring(queryStart));
        const prefillArtist = params.get('prefillArtist');
        if (prefillArtist) {
          setNewMapping(prev => ({ ...prev, discogsName: prefillArtist }));
          window.history.replaceState(
            null,
            '',
            `${window.location.pathname}#settings`
          );
        }
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const loadMappings = async () => {
    setLoading(true);
    setError('');

    try {
      const data = await api.getArtistMappings();
      setMappings(data.mappings);
      setStats(data.stats);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to load mappings'
      );
    } finally {
      setLoading(false);
    }
  };

  const loadDiscoveryMappings = async () => {
    try {
      setDiscoveryLoading(true);
      const [albums, artists] = await Promise.all([
        api.getDiscoveryAlbumMappings(),
        api.getDiscoveryArtistMappings(),
      ]);
      setDiscoveryAlbumMappings(albums);
      setDiscoveryArtistMappings(artists);
    } catch (error) {
      logger.warn('Failed to load discovery mappings', error);
    } finally {
      setDiscoveryLoading(false);
    }
  };

  const loadTrackMappings = async () => {
    try {
      setTrackMappingsLoading(true);
      const mappings = await api.getTrackMappings();
      setTrackMappings(mappings);
    } catch (error) {
      logger.warn('Failed to load track mappings', error);
    } finally {
      setTrackMappingsLoading(false);
    }
  };

  const loadMbidMappings = async () => {
    try {
      setMbidMappingsLoading(true);
      const result = await api.getArtistMbidMappings();
      setMbidMappings(result.mappings);
    } catch (error) {
      logger.warn('Failed to load MusicBrainz mappings', error);
    } finally {
      setMbidMappingsLoading(false);
    }
  };

  const handleDeleteTrackMapping = async (
    historyArtist: string,
    historyAlbum: string,
    historyTrack: string
  ) => {
    if (
      !window.confirm('Are you sure you want to delete this track mapping?')
    ) {
      return;
    }
    try {
      await api.removeTrackMapping(historyArtist, historyAlbum, historyTrack);
      setTrackMappings(prev =>
        prev.filter(
          m =>
            !(
              m.historyArtist === historyArtist &&
              m.historyAlbum === historyAlbum &&
              m.historyTrack === historyTrack
            )
        )
      );
      setSuccess('Track mapping deleted');
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to delete mapping'
      );
    }
  };

  const handleDeleteMbidMapping = async (artistName: string) => {
    if (
      !window.confirm(
        `Are you sure you want to delete the MusicBrainz mapping for "${artistName}"?`
      )
    ) {
      return;
    }
    try {
      await api.removeArtistMbidMapping(artistName);
      setMbidMappings(prev =>
        prev.filter(m => m.discogsArtistName !== artistName)
      );
      setSuccess('MusicBrainz mapping deleted');
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to delete mapping'
      );
    }
  };

  const loadArtists = async () => {
    try {
      if (!authStatus.discogs.username) return;

      setArtistsLoading(true);
      setArtistsLoadError('');

      const result = await api.getEntireCollection(authStatus.discogs.username);
      const uniqueArtists = Array.from(
        new Set(
          result.data
            .map((item: { release: { artist: string } }) => item.release.artist)
            .filter(Boolean)
        )
      ).sort() as string[];
      setArtists(uniqueArtists);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to load collection';
      setArtistsLoadError(errorMessage);
    } finally {
      setArtistsLoading(false);
    }
  };

  const loadSuggestions = async () => {
    try {
      if (!authStatus.discogs.username) return;

      setSuggestionsLoading(true);
      const result = await api.getArtistMappingSuggestions(
        authStatus.discogs.username
      );
      setSuggestions(result.suggestions);
    } catch (error) {
      logger.warn('Failed to load mapping suggestions', error);
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const handleDeleteDiscoveryAlbumMapping = async (
    historyArtist: string,
    historyAlbum: string
  ) => {
    if (
      !window.confirm('Are you sure you want to delete this album mapping?')
    ) {
      return;
    }
    try {
      await api.removeDiscoveryAlbumMapping(historyArtist, historyAlbum);
      setDiscoveryAlbumMappings(prev =>
        prev.filter(
          m =>
            !(
              m.historyArtist === historyArtist &&
              m.historyAlbum === historyAlbum
            )
        )
      );
      setSuccess('Album mapping deleted');
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to delete mapping'
      );
    }
  };

  const handleDeleteDiscoveryArtistMapping = async (historyArtist: string) => {
    if (
      !window.confirm('Are you sure you want to delete this artist mapping?')
    ) {
      return;
    }
    try {
      await api.removeDiscoveryArtistMapping(historyArtist);
      setDiscoveryArtistMappings(prev =>
        prev.filter(m => m.historyArtist !== historyArtist)
      );
      setSuccess('Artist mapping deleted');
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to delete mapping'
      );
    }
  };

  const handleQuickAddMapping = async (
    discogsName: string,
    lastfmName: string
  ) => {
    try {
      await api.addArtistMapping(discogsName, lastfmName);
      setSuccess(`Mapping added: ${discogsName} → ${lastfmName}`);
      await loadMappings();
      await loadSuggestions();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to add mapping'
      );
    }
  };

  const handleArtistInputChange = (value: string) => {
    setNewMapping({ ...newMapping, discogsName: value });

    if (value.length > 0) {
      const filtered = artists
        .filter(artist => artist.toLowerCase().includes(value.toLowerCase()))
        .slice(0, 10);
      setFilteredArtists(filtered);
      setShowArtistSuggestions(filtered.length > 0);
    } else {
      setShowArtistSuggestions(false);
    }
  };

  const selectArtist = (artist: string) => {
    setNewMapping({ ...newMapping, discogsName: artist });
    setShowArtistSuggestions(false);
  };

  const handleAddMapping = async () => {
    if (!newMapping.discogsName.trim() || !newMapping.lastfmName.trim()) {
      setError('Both Discogs and Last.fm names are required');
      return;
    }

    try {
      await api.addArtistMapping(
        newMapping.discogsName.trim(),
        newMapping.lastfmName.trim()
      );
      setNewMapping({ discogsName: '', lastfmName: '' });
      setSuccess('Artist mapping added successfully');
      await loadMappings();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to add mapping'
      );
    }
  };

  const handleUpdateMapping = async (discogsName: string) => {
    if (!editValue.trim()) {
      setError('Last.fm name is required');
      return;
    }

    try {
      await api.updateArtistMapping(discogsName, editValue.trim());
      setEditingMapping(null);
      setEditValue('');
      setSuccess('Artist mapping updated successfully');
      await loadMappings();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to update mapping'
      );
    }
  };

  const handleDeleteMapping = async (discogsName: string) => {
    if (
      !window.confirm(
        `Are you sure you want to delete the mapping for "${discogsName}"?`
      )
    ) {
      return;
    }

    try {
      await api.removeArtistMapping(discogsName);
      setSuccess('Artist mapping deleted successfully');
      await loadMappings();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to delete mapping'
      );
    }
  };

  const handleExportMappings = async () => {
    try {
      const data = await api.exportArtistMappings();

      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `artist-mappings-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSuccess('Artist mappings exported successfully');
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to export mappings'
      );
    }
  };

  const handleImportMappings = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const mappingsArray = Array.isArray(data) ? data : data.mappings || [];

      if (!Array.isArray(mappingsArray)) {
        throw new Error('Invalid file format. Expected an array of mappings.');
      }

      const result = await api.importArtistMappings(mappingsArray);

      setSuccess(
        `Import completed: ${result.imported} imported, ${result.skipped} skipped${result.errors.length > 0 ? `. Errors: ${result.errors.join(', ')}` : ''}`
      );
      await loadMappings();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to import mappings'
      );
    }

    event.target.value = '';
  };

  const handleClearMappings = async () => {
    if (
      !window.confirm(
        'Are you sure you want to clear ALL artist mappings? This action cannot be undone.'
      )
    ) {
      return;
    }

    try {
      await api.clearArtistMappings();
      setSuccess('All artist mappings cleared successfully');
      await loadMappings();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to clear mappings'
      );
    }
  };

  const startEditing = (discogsName: string, currentLastfmName: string) => {
    setEditingMapping(discogsName);
    setEditValue(currentLastfmName);
  };

  const cancelEditing = () => {
    setEditingMapping(null);
    setEditValue('');
  };

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  return (
    <div className='settings-mappings-section'>
      {/* Artist Name Mappings */}
      <div className='settings-section-card'>
        <div className='settings-section-header'>
          <span className='settings-section-icon'>🔄</span>
          <div>
            <h3>Artist Name Mappings</h3>
            <p className='settings-section-description'>
              Map Discogs artist names to Last.fm names for correct scrobbling
            </p>
          </div>
          {stats && (
            <span className='settings-section-badge'>
              {stats.totalMappings}
            </span>
          )}
        </div>

        <div className='settings-section-content'>
          {authStatus.discogs.authenticated && (
            <div className='settings-info-box'>
              {artistsLoadError ? (
                <>
                  Failed to load artist suggestions: {artistsLoadError}. You can
                  still manually type artist names.
                </>
              ) : artistsLoading ? (
                <>Loading artist suggestions from your collection...</>
              ) : artists.length > 0 ? (
                <>
                  Artist suggestions available from your collection (
                  {artists.length} artists loaded).
                </>
              ) : (
                <>
                  Artist suggestions will appear once your collection is loaded.
                </>
              )}
            </div>
          )}

          {error && (
            <div className='error-message'>
              {error}
              <button className='btn btn-small' onClick={clearMessages}>
                Dismiss
              </button>
            </div>
          )}

          {success && (
            <div className='message success'>
              {success}
              <button className='btn btn-small' onClick={clearMessages}>
                Dismiss
              </button>
            </div>
          )}

          {/* Import/Export Controls */}
          <div className='settings-actions-row'>
            <button
              className='btn btn-secondary'
              onClick={handleExportMappings}
              disabled={loading || mappings.length === 0}
            >
              Export Mappings
            </button>

            <label className='btn btn-secondary settings-import-btn'>
              Import Mappings
              <input
                type='file'
                accept='.json'
                onChange={handleImportMappings}
                disabled={loading}
              />
            </label>

            <button
              className='btn btn-danger'
              onClick={handleClearMappings}
              disabled={loading || mappings.length === 0}
            >
              Clear All
            </button>
          </div>

          {/* Add New Mapping */}
          <div className='settings-subsection'>
            <h4>Add New Mapping</h4>
            <div className='settings-add-mapping-grid'>
              <div className='settings-typeahead-container'>
                <label className='settings-input-label'>
                  Discogs Artist Name
                </label>
                <div className='settings-input-with-link'>
                  <input
                    type='text'
                    className='form-input'
                    value={newMapping.discogsName}
                    onChange={e => handleArtistInputChange(e.target.value)}
                    onFocus={() => {
                      if (
                        newMapping.discogsName &&
                        filteredArtists.length > 0
                      ) {
                        setShowArtistSuggestions(true);
                      }
                    }}
                    onBlur={() => {
                      setTimeout(() => setShowArtistSuggestions(false), 200);
                    }}
                    placeholder='Start typing artist name...'
                  />
                  {newMapping.discogsName.trim() && (
                    <a
                      href={`https://www.discogs.com/search/?q=${encodeURIComponent(newMapping.discogsName.trim())}&type=artist`}
                      target='_blank'
                      rel='noopener noreferrer'
                      title='Search for this artist on Discogs'
                      className='settings-external-link'
                    >
                      View on Discogs
                    </a>
                  )}
                </div>
                {showArtistSuggestions && (
                  <div className='settings-typeahead-dropdown'>
                    {filteredArtists.map((artist, index) => (
                      <div
                        key={index}
                        onClick={() => selectArtist(artist)}
                        className='settings-typeahead-item'
                      >
                        {artist}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className='settings-input-label'>
                  Last.fm Artist Name
                </label>
                <input
                  type='text'
                  className='form-input'
                  value={newMapping.lastfmName}
                  onChange={e =>
                    setNewMapping({ ...newMapping, lastfmName: e.target.value })
                  }
                  placeholder='e.g., Turnstile'
                  onKeyPress={e => e.key === 'Enter' && handleAddMapping()}
                />
              </div>
              <button
                className='btn'
                onClick={handleAddMapping}
                disabled={loading}
              >
                Add Mapping
              </button>
            </div>
          </div>

          {/* Possible Mappings Section */}
          {authStatus.discogs.authenticated && (
            <div className='settings-subsection'>
              <h4>Suggested Mappings</h4>
              <p className='settings-hint-text'>
                Artists with Discogs disambiguation suffixes (e.g., &quot;Artist
                (2)&quot;) that may need mappings.
              </p>

              {suggestionsLoading ? (
                <div className='settings-loading-text'>
                  Loading suggestions...
                </div>
              ) : suggestions.length === 0 ? (
                <div className='settings-empty-text'>
                  No disambiguation artists found that need mappings.
                </div>
              ) : (
                <div className='settings-suggestions-list'>
                  {suggestions.map(suggestion => (
                    <div
                      key={suggestion.artist}
                      className='settings-suggestion-item'
                    >
                      <div className='settings-suggestion-info'>
                        <div className='settings-suggestion-name'>
                          {suggestion.artist}
                        </div>
                        <div className='settings-suggestion-details'>
                          <span>
                            Local scrobbles:{' '}
                            <strong>{suggestion.localScrobbles}</strong>
                          </span>
                          <a
                            href={`https://www.discogs.com/search/?q=${encodeURIComponent(suggestion.artist)}&type=artist`}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='settings-external-link-small'
                          >
                            View on Discogs
                          </a>
                          {authStatus.lastfm.username && (
                            <a
                              href={`https://www.last.fm/user/${authStatus.lastfm.username}/library/music/${encodeURIComponent(suggestion.artist)}`}
                              target='_blank'
                              rel='noopener noreferrer'
                              className='settings-external-link-small'
                            >
                              View on Last.fm
                            </a>
                          )}
                        </div>
                      </div>
                      <div className='settings-suggestion-actions'>
                        <button
                          className='btn btn-small'
                          onClick={() =>
                            handleQuickAddMapping(
                              suggestion.artist,
                              suggestion.suggestedMapping
                            )
                          }
                          title={`Map to "${suggestion.suggestedMapping}"`}
                        >
                          Map to &quot;{suggestion.suggestedMapping}&quot;
                        </button>
                        <button
                          className='btn btn-small btn-secondary'
                          onClick={() => {
                            setNewMapping({
                              discogsName: suggestion.artist,
                              lastfmName: '',
                            });
                            document
                              .querySelector('.settings-add-mapping-grid')
                              ?.scrollIntoView({ behavior: 'smooth' });
                          }}
                          title='Customize mapping'
                        >
                          Custom
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Current Mappings List */}
          {loading && mappings.length === 0 ? (
            <div className='loading'>
              <div className='spinner'></div>
              Loading artist mappings...
            </div>
          ) : mappings.length === 0 ? (
            <div className='settings-empty-text'>
              No artist mappings configured yet. Add your first mapping above!
            </div>
          ) : (
            <div className='settings-subsection'>
              <h4>Current Mappings ({mappings.length})</h4>
              <div className='settings-mappings-list'>
                {mappings.map(mapping => (
                  <div
                    key={mapping.discogsName}
                    className='settings-mapping-item'
                  >
                    <div className='settings-mapping-info'>
                      <div className='settings-mapping-name'>
                        {mapping.discogsName}
                      </div>
                      <div className='settings-mapping-target'>
                        maps to:{' '}
                        {editingMapping === mapping.discogsName ? (
                          <input
                            type='text'
                            className='form-input settings-inline-edit'
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onKeyPress={e => {
                              if (e.key === 'Enter')
                                handleUpdateMapping(mapping.discogsName);
                              if (e.key === 'Escape') cancelEditing();
                            }}
                            autoFocus
                          />
                        ) : (
                          <strong>{mapping.lastfmName}</strong>
                        )}
                      </div>
                      {mapping.lastUsed && (
                        <div className='settings-mapping-meta'>
                          Last used:{' '}
                          {new Date(mapping.lastUsed).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    <div className='settings-mapping-actions'>
                      {editingMapping === mapping.discogsName ? (
                        <>
                          <button
                            className='btn btn-small'
                            onClick={() =>
                              handleUpdateMapping(mapping.discogsName)
                            }
                          >
                            Save
                          </button>
                          <button
                            className='btn btn-small btn-secondary'
                            onClick={cancelEditing}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className='btn btn-small btn-secondary'
                            onClick={() =>
                              startEditing(
                                mapping.discogsName,
                                mapping.lastfmName
                              )
                            }
                          >
                            Edit
                          </button>
                          <button
                            className='btn btn-small btn-danger'
                            onClick={() =>
                              handleDeleteMapping(mapping.discogsName)
                            }
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Discovery Mappings */}
      <div className='settings-section-card'>
        <div className='settings-section-header'>
          <span className='settings-section-icon'>🔗</span>
          <div>
            <h3>Discovery Mappings</h3>
            <p className='settings-section-description'>
              Link Last.fm history to Discogs collection for albums/artists with
              different names
            </p>
          </div>
          <span className='settings-section-badge'>
            {discoveryAlbumMappings.length + discoveryArtistMappings.length}
          </span>
        </div>

        <div className='settings-section-content'>
          {discoveryLoading ? (
            <div className='loading'>
              <div className='spinner'></div>
              Loading discovery mappings...
            </div>
          ) : (
            <>
              {/* Album Mappings */}
              <div className='settings-subsection'>
                <h4>Album Mappings ({discoveryAlbumMappings.length})</h4>
                {discoveryAlbumMappings.length === 0 ? (
                  <div className='settings-empty-text'>
                    No album mappings. Create them from the Discovery page.
                  </div>
                ) : (
                  <div className='settings-discovery-list'>
                    {discoveryAlbumMappings.map(mapping => (
                      <div
                        key={`${mapping.historyArtist}-${mapping.historyAlbum}`}
                        className='settings-discovery-item'
                      >
                        <div className='settings-discovery-info'>
                          <div className='settings-discovery-source'>
                            <span className='settings-discovery-label source'>
                              Last.fm:
                            </span>
                            {mapping.historyArtist} — {mapping.historyAlbum}
                          </div>
                          <div className='settings-discovery-target'>
                            <span className='settings-discovery-label target'>
                              Discogs:
                            </span>
                            {mapping.collectionArtist} —{' '}
                            {mapping.collectionAlbum}
                          </div>
                        </div>
                        <button
                          className='btn btn-small btn-danger'
                          onClick={() =>
                            handleDeleteDiscoveryAlbumMapping(
                              mapping.historyArtist,
                              mapping.historyAlbum
                            )
                          }
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Artist Mappings */}
              <div className='settings-subsection'>
                <h4>Artist Mappings ({discoveryArtistMappings.length})</h4>
                {discoveryArtistMappings.length === 0 ? (
                  <div className='settings-empty-text'>
                    No artist mappings. Create them from the Discovery page.
                  </div>
                ) : (
                  <div className='settings-discovery-list'>
                    {discoveryArtistMappings.map(mapping => (
                      <div
                        key={mapping.historyArtist}
                        className='settings-discovery-item'
                      >
                        <div className='settings-discovery-info'>
                          <div className='settings-discovery-source'>
                            <span className='settings-discovery-label source'>
                              Last.fm:
                            </span>
                            {mapping.historyArtist}
                          </div>
                          <div className='settings-discovery-target'>
                            <span className='settings-discovery-label target'>
                              Discogs:
                            </span>
                            {mapping.collectionArtist}
                          </div>
                        </div>
                        <button
                          className='btn btn-small btn-danger'
                          onClick={() =>
                            handleDeleteDiscoveryArtistMapping(
                              mapping.historyArtist
                            )
                          }
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Track Mappings (for Forgotten Favorites) */}
      <div className='settings-section-card'>
        <div className='settings-section-header'>
          <span className='settings-section-icon'>🎵</span>
          <div>
            <h3>Track Mappings</h3>
            <p className='settings-section-description'>
              Link Forgotten Favorites tracks to local scrobble cache when
              auto-matching fails
            </p>
          </div>
          <span className='settings-section-badge'>{trackMappings.length}</span>
        </div>

        <div className='settings-section-content'>
          <div className='settings-info-box'>
            Track mappings are created from the Forgotten Favorites page when
            automatic normalization fails to match a track. These mappings help
            the app recognize tracks with different naming (e.g.,
            &quot;[Explicit]&quot; suffixes).
          </div>

          {trackMappingsLoading ? (
            <div className='loading'>
              <div className='spinner'></div>
              Loading track mappings...
            </div>
          ) : trackMappings.length === 0 ? (
            <div className='settings-empty-text'>
              No track mappings yet. Create them from the Forgotten Favorites
              page when a track fails to match automatically.
            </div>
          ) : (
            <div className='settings-subsection'>
              <h4>Mapped Tracks ({trackMappings.length})</h4>
              <div className='settings-discovery-list'>
                {trackMappings.map(mapping => (
                  <div
                    key={`${mapping.historyArtist}-${mapping.historyAlbum}-${mapping.historyTrack}`}
                    className='settings-discovery-item'
                  >
                    <div className='settings-discovery-info'>
                      <div className='settings-discovery-source'>
                        <span className='settings-discovery-label source'>
                          Forgotten Favorites:
                        </span>
                        {mapping.historyArtist} — {mapping.historyAlbum} —{' '}
                        {mapping.historyTrack}
                      </div>
                      <div className='settings-discovery-target'>
                        <span className='settings-discovery-label target'>
                          Local Cache:
                        </span>
                        {mapping.cacheArtist} — {mapping.cacheAlbum} —{' '}
                        {mapping.cacheTrack}
                      </div>
                      <div className='settings-mapping-meta'>
                        Created on{' '}
                        {new Date(mapping.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      className='btn btn-small btn-danger'
                      onClick={() =>
                        handleDeleteTrackMapping(
                          mapping.historyArtist,
                          mapping.historyAlbum,
                          mapping.historyTrack
                        )
                      }
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MusicBrainz Mappings (for New Release Tracking) */}
      <div className='settings-section-card'>
        <div className='settings-section-header'>
          <span className='settings-section-icon'>🎵</span>
          <div>
            <h3>MusicBrainz Artist Mappings</h3>
            <p className='settings-section-description'>
              Link Discogs artists to MusicBrainz IDs for new release tracking
            </p>
          </div>
          <span className='settings-section-badge'>{mbidMappings.length}</span>
        </div>

        <div className='settings-section-content'>
          <div className='settings-info-box'>
            These mappings are created automatically when you sync releases or
            resolve artist disambiguations. Artists mapped to &quot;None&quot;
            will be skipped during release sync.
          </div>

          {mbidMappingsLoading ? (
            <div className='loading'>
              <div className='spinner'></div>
              Loading MusicBrainz mappings...
            </div>
          ) : mbidMappings.length === 0 ? (
            <div className='settings-empty-text'>
              No MusicBrainz mappings yet. They will be created when you sync
              releases from the New Releases page.
            </div>
          ) : (
            <div className='settings-subsection'>
              <h4>Mapped Artists ({mbidMappings.length})</h4>
              <div className='settings-discovery-list'>
                {mbidMappings.map(mapping => (
                  <div
                    key={mapping.discogsArtistName}
                    className='settings-discovery-item'
                  >
                    <div className='settings-discovery-info'>
                      <div className='settings-discovery-source'>
                        <span className='settings-discovery-label source'>
                          Discogs:
                        </span>
                        {mapping.discogsArtistName}
                      </div>
                      <div className='settings-discovery-target'>
                        <span className='settings-discovery-label target'>
                          MusicBrainz:
                        </span>
                        {mapping.mbid ? (
                          <a
                            href={`https://musicbrainz.org/artist/${mapping.mbid}`}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='settings-external-link-small'
                          >
                            {mapping.mbid.substring(0, 8)}...
                          </a>
                        ) : (
                          <span className='settings-mapping-skipped'>
                            (None / Skipped)
                          </span>
                        )}
                      </div>
                      <div className='settings-mapping-meta'>
                        {mapping.confirmedBy === 'auto'
                          ? 'Auto-matched'
                          : 'User confirmed'}{' '}
                        on {new Date(mapping.confirmedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      className='btn btn-small btn-danger'
                      onClick={() =>
                        handleDeleteMbidMapping(mapping.discogsArtistName)
                      }
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsMappingsSection;
