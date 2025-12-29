import React, { useState, useEffect, useCallback } from 'react';

import { ArtistMapping } from '../../backend/services/artistMappingService';
import {
  AlbumMapping,
  ArtistMapping as DiscoveryArtistMapping,
  SyncStatus,
  SyncSettings,
} from '../../shared/types';
import SyncStatusBar from '../components/SyncStatusBar';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { getApiService } from '../services/api';

type SettingsTab = 'mappings' | 'sync' | 'settings';

const SettingsPage: React.FC = () => {
  const { state } = useApp();
  const { authStatus } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('mappings');

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

  // Sync settings state
  const [syncData, setSyncData] = useState<{
    sync: SyncStatus;
    storage: {
      totalAlbums: number;
      totalScrobbles: number;
      oldestScrobble: Date | null;
      newestScrobble: Date | null;
      lastSync: Date | null;
      estimatedSizeBytes: number;
    };
  } | null>(null);
  const [syncSettings, setSyncSettings] = useState<SyncSettings | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncError, setSyncError] = useState<string>('');
  const [syncSuccess, setSyncSuccess] = useState<string>('');

  // AI settings state
  const [aiSettings, setAiSettings] = useState<{
    enabled: boolean;
    baseUrl: string;
    model: string;
    timeout: number;
  } | null>(null);
  const [aiStatus, setAiStatus] = useState<{
    connected: boolean;
    error?: string;
  } | null>(null);
  const [aiModels, setAiModels] = useState<
    Array<{ name: string; sizeFormatted: string }>
  >([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string>('');
  const [aiSuccess, setAiSuccess] = useState<string>('');

  const api = getApiService(state.serverUrl);

  useEffect(() => {
    loadMappings();
    loadAISettings();
    loadDiscoveryMappings();
    if (authStatus.discogs.authenticated && authStatus.discogs.username) {
      loadArtists();
      loadSuggestions();
    }
    if (authStatus.lastfm.authenticated) {
      loadSyncStatus();
      loadSyncSettings();
    }
  }, [
    authStatus.discogs.authenticated,
    authStatus.discogs.username,
    authStatus.lastfm.authenticated,
  ]);

  // Handle query param for pre-filling artist name (e.g., from disambiguation warning)
  useEffect(() => {
    const hash = window.location.hash;
    const queryStart = hash.indexOf('?');
    if (queryStart !== -1) {
      const params = new URLSearchParams(hash.substring(queryStart));
      const prefillArtist = params.get('prefillArtist');
      if (prefillArtist) {
        setNewMapping(prev => ({ ...prev, discogsName: prefillArtist }));
        setActiveTab('mappings');
        // Clear the query param from URL without triggering navigation
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}#settings`
        );
      }
    }
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
      console.warn('Failed to load discovery mappings:', error);
    } finally {
      setDiscoveryLoading(false);
    }
  };

  const handleDeleteDiscoveryAlbumMapping = async (
    historyArtist: string,
    historyAlbum: string
  ) => {
    if (
      !window.confirm(`Are you sure you want to delete this album mapping?`)
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
      !window.confirm(`Are you sure you want to delete this artist mapping?`)
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

  const loadArtists = async () => {
    try {
      if (!authStatus.discogs.username) return;

      setArtistsLoading(true);
      setArtistsLoadError('');

      const result = await api.getEntireCollection(authStatus.discogs.username);
      const uniqueArtists = Array.from(
        new Set(result.data.map(item => item.release.artist).filter(Boolean))
      ).sort();
      setArtists(uniqueArtists);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to load collection';
      setArtistsLoadError(errorMessage);
      console.warn('Failed to load artists for typeahead:', error);
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
      console.warn('Failed to load mapping suggestions:', error);
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const loadSyncStatus = useCallback(async () => {
    try {
      const data = await api.getHistorySyncStatus();
      setSyncData(data);
    } catch (error) {
      console.warn('Failed to load sync status:', error);
    }
  }, [api]);

  const loadSyncSettings = useCallback(async () => {
    try {
      const settings = await api.getSyncSettings();
      setSyncSettings(settings);
    } catch (error) {
      console.warn('Failed to load sync settings:', error);
    }
  }, [api]);

  const handleStartSync = async () => {
    try {
      setSyncLoading(true);
      setSyncError('');
      await api.startHistorySync();
      setSyncSuccess('Sync started successfully');
      // Reload status after a brief delay
      setTimeout(loadSyncStatus, 500);
    } catch (error) {
      setSyncError(
        error instanceof Error ? error.message : 'Failed to start sync'
      );
    } finally {
      setSyncLoading(false);
    }
  };

  const handleClearHistoryIndex = async () => {
    if (
      !window.confirm(
        'Are you sure you want to clear the scrobble history index? This will require a full re-sync from Last.fm.'
      )
    ) {
      return;
    }

    try {
      setSyncLoading(true);
      setSyncError('');
      await api.clearHistoryIndex();
      setSyncSuccess('History index cleared successfully');
      await loadSyncStatus();
    } catch (error) {
      setSyncError(
        error instanceof Error ? error.message : 'Failed to clear history index'
      );
    } finally {
      setSyncLoading(false);
    }
  };

  const handleToggleAutoSync = async () => {
    if (!syncSettings) return;

    try {
      const newSettings = {
        ...syncSettings,
        autoSyncOnStartup: !syncSettings.autoSyncOnStartup,
      };
      await api.saveSyncSettings(newSettings);
      setSyncSettings(newSettings);
      setSyncSuccess(
        newSettings.autoSyncOnStartup
          ? 'Auto-sync enabled'
          : 'Auto-sync disabled'
      );
    } catch (error) {
      setSyncError(
        error instanceof Error ? error.message : 'Failed to update settings'
      );
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (date: Date | string | null): string => {
    if (!date) return 'Never';
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const clearSyncMessages = () => {
    setSyncError('');
    setSyncSuccess('');
  };

  // AI functions
  const loadAISettings = useCallback(async () => {
    try {
      const settings = await api.getAISettings();
      setAiSettings(settings);

      // Check connection status
      const status = await api.getAIStatus();
      setAiStatus({ connected: status.connected, error: status.error });

      // Load available models if connected
      if (status.connected) {
        try {
          const models = await api.getAIModels();
          setAiModels(models);
        } catch {
          // Models endpoint may fail if Ollama just came online
        }
      }
    } catch (error) {
      console.warn('Failed to load AI settings:', error);
    }
  }, [api]);

  const handleTestAIConnection = async () => {
    if (!aiSettings) return;

    // Get the current model from the select/input, which is stored in aiSettings.model
    const testModel = aiSettings.model;

    try {
      setAiLoading(true);
      setAiError('');
      const result = await api.testAIConnection(aiSettings.baseUrl, testModel);

      setAiStatus({ connected: result.connected, error: result.error });

      if (result.connected) {
        setAiSuccess(
          result.modelAvailable
            ? `Connected! Model "${testModel}" is available.`
            : `Connected, but model "${testModel}" is not installed. Available: ${result.availableModels?.join(', ') || 'none'}`
        );
        // Refresh models list
        if (result.availableModels) {
          const models = await api.getAIModels();
          setAiModels(models);
        }
      } else {
        setAiError(result.error || 'Connection failed');
      }
    } catch (error) {
      setAiError(
        error instanceof Error ? error.message : 'Failed to test connection'
      );
    } finally {
      setAiLoading(false);
    }
  };

  const handleToggleAI = async () => {
    if (!aiSettings) return;

    try {
      setAiLoading(true);
      setAiError('');
      const updated = await api.saveAISettings({
        enabled: !aiSettings.enabled,
      });
      setAiSettings(updated);
      setAiSuccess(
        updated.enabled ? 'AI suggestions enabled' : 'AI suggestions disabled'
      );
    } catch (error) {
      setAiError(
        error instanceof Error ? error.message : 'Failed to update settings'
      );
    } finally {
      setAiLoading(false);
    }
  };

  const handleSaveAISettings = async () => {
    if (!aiSettings) return;

    try {
      setAiLoading(true);
      setAiError('');
      const updated = await api.saveAISettings(aiSettings);
      setAiSettings(updated);
      setAiSuccess('AI settings saved');
    } catch (error) {
      setAiError(
        error instanceof Error ? error.message : 'Failed to save settings'
      );
    } finally {
      setAiLoading(false);
    }
  };

  const clearAIMessages = () => {
    setAiError('');
    setAiSuccess('');
  };

  const handleQuickAddMapping = async (
    discogsName: string,
    lastfmName: string
  ) => {
    try {
      await api.addArtistMapping(discogsName, lastfmName);
      setSuccess(`Mapping added: ${discogsName} → ${lastfmName}`);
      await loadMappings();
      await loadSuggestions(); // Refresh suggestions
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
        .slice(0, 10); // Limit to 10 suggestions
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
      // eslint-disable-next-line no-undef
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

      // Handle both direct arrays and wrapped objects
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

    // Reset the input
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

  // Render tab content based on active tab
  const renderTabContent = () => {
    switch (activeTab) {
      case 'mappings':
        return renderMappingsTab();
      case 'sync':
        return renderSyncTab();
      case 'settings':
        return renderSettingsTab();
      default:
        return null;
    }
  };

  const renderMappingsTab = () => (
    <>
      {/* Artist Name Mappings Section */}
      <div className='card'>
        <h3>Artist Name Mappings</h3>
        <p>
          Manage mappings between Discogs and Last.fm artist names. When
          scrobbling, Discogs artist names will be automatically converted to
          their mapped Last.fm names.
        </p>

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
            <button
              className='btn btn-small'
              onClick={clearMessages}
              style={{ marginLeft: '1rem' }}
            >
              Dismiss
            </button>
          </div>
        )}

        {success && (
          <div className='message success'>
            {success}
            <button
              className='btn btn-small'
              onClick={clearMessages}
              style={{ marginLeft: '1rem' }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Statistics */}
        {stats && (
          <div className='settings-stats-box'>
            <strong>Current Mappings:</strong>{' '}
            <span>{stats.totalMappings}</span>
            {stats.lastUpdated && (
              <span className='settings-stats-detail'>
                Last updated: {new Date(stats.lastUpdated).toLocaleDateString()}
              </span>
            )}
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

          <label className='btn btn-secondary' style={{ cursor: 'pointer' }}>
            Import Mappings
            <input
              type='file'
              accept='.json'
              onChange={handleImportMappings}
              style={{ display: 'none' }}
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
        <div className='settings-section-box'>
          <h4>Add New Mapping</h4>
          <div className='settings-add-mapping-grid'>
            <div style={{ position: 'relative' }}>
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
                    if (newMapping.discogsName && filteredArtists.length > 0) {
                      setShowArtistSuggestions(true);
                    }
                  }}
                  onBlur={() => {
                    // Delay hiding suggestions to allow clicks
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
          <div className='settings-section-box'>
            <h4>Possible Mappings</h4>
            <p className='settings-hint-text'>
              Artists in your collection with Discogs disambiguation suffixes
              (e.g., &quot;Artist (2)&quot;) that may need mappings for correct
              Last.fm scrobbling.
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
                {suggestions.map((suggestion, index) => (
                  <div
                    key={suggestion.artist}
                    className='settings-suggestion-item'
                    style={{
                      borderBottom:
                        index < suggestions.length - 1
                          ? '1px solid var(--border-color)'
                          : 'none',
                    }}
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
                          // Scroll to add mapping form
                          document
                            .querySelector('h4')
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

        {/* Mappings List */}
        {loading && mappings.length === 0 ? (
          <div className='loading'>
            <div className='spinner'></div>
            Loading artist mappings...
          </div>
        ) : mappings.length === 0 ? (
          <div className='settings-empty-state'>
            No artist mappings configured yet. Add your first mapping above!
          </div>
        ) : (
          <div>
            <h4>Current Mappings ({mappings.length})</h4>
            <div className='settings-mappings-list'>
              {mappings.map((mapping, index) => (
                <div
                  key={mapping.discogsName}
                  className='settings-mapping-item'
                  style={{
                    borderBottom:
                      index < mappings.length - 1
                        ? '1px solid var(--border-color)'
                        : 'none',
                  }}
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
                          className='form-input'
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyPress={e => {
                            if (e.key === 'Enter')
                              handleUpdateMapping(mapping.discogsName);
                            if (e.key === 'Escape') cancelEditing();
                          }}
                          style={{ minWidth: '150px' }}
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

      {/* Discovery Mappings Section */}
      <div className='card'>
        <h3>Discovery Mappings</h3>
        <p>
          These mappings link Last.fm scrobble history to your Discogs
          collection for albums/artists that have different naming. Created from
          the Discovery page.
        </p>

        {discoveryLoading ? (
          <div className='loading'>
            <div className='spinner'></div>
            Loading discovery mappings...
          </div>
        ) : (
          <>
            {/* Album Mappings */}
            <div className='settings-section-box'>
              <h4>Album Mappings ({discoveryAlbumMappings.length})</h4>
              {discoveryAlbumMappings.length === 0 ? (
                <div className='settings-empty-text'>
                  No album mappings. Create them from the Discovery page by
                  clicking &quot;Map&quot; on missing albums.
                </div>
              ) : (
                <div className='settings-discovery-list'>
                  {discoveryAlbumMappings.map((mapping, index) => (
                    <div
                      key={`${mapping.historyArtist}-${mapping.historyAlbum}`}
                      className='settings-discovery-item'
                      style={{
                        borderBottom:
                          index < discoveryAlbumMappings.length - 1
                            ? '1px solid var(--border-color)'
                            : 'none',
                      }}
                    >
                      <div className='settings-discovery-info'>
                        <div className='settings-discovery-source'>
                          <span className='settings-discovery-label'>
                            Last.fm:
                          </span>
                          {mapping.historyArtist} — {mapping.historyAlbum}
                        </div>
                        <div className='settings-discovery-target'>
                          <span className='settings-discovery-label'>
                            Discogs:
                          </span>
                          {mapping.collectionArtist} — {mapping.collectionAlbum}
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
            <div className='settings-section-box'>
              <h4>Artist Mappings ({discoveryArtistMappings.length})</h4>
              {discoveryArtistMappings.length === 0 ? (
                <div className='settings-empty-text'>
                  No artist mappings. Create them from the Discovery page by
                  clicking &quot;Map&quot; on missing artists.
                </div>
              ) : (
                <div className='settings-discovery-list'>
                  {discoveryArtistMappings.map((mapping, index) => (
                    <div
                      key={mapping.historyArtist}
                      className='settings-discovery-item'
                      style={{
                        borderBottom:
                          index < discoveryArtistMappings.length - 1
                            ? '1px solid var(--border-color)'
                            : 'none',
                      }}
                    >
                      <div className='settings-discovery-info'>
                        <div className='settings-discovery-source'>
                          <span className='settings-discovery-label'>
                            Last.fm:
                          </span>
                          {mapping.historyArtist}
                        </div>
                        <div className='settings-discovery-target'>
                          <span className='settings-discovery-label'>
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
    </>
  );

  const renderSyncTab = () => (
    <>
      {/* Scrobble History Sync Section */}
      {authStatus.lastfm.authenticated ? (
        <div className='card'>
          <h3>Scrobble History Sync</h3>
          <p>
            Sync your Last.fm listening history to enable intelligent play
            suggestions and album scrobble tracking. This indexes your scrobbles
            locally for fast lookups.
          </p>

          {syncError && (
            <div className='error-message'>
              {syncError}
              <button
                className='btn btn-small'
                onClick={clearSyncMessages}
                style={{ marginLeft: '1rem' }}
              >
                Dismiss
              </button>
            </div>
          )}

          {syncSuccess && (
            <div className='message success'>
              {syncSuccess}
              <button
                className='btn btn-small'
                onClick={clearSyncMessages}
                style={{ marginLeft: '1rem' }}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Sync Status Bar */}
          <SyncStatusBar compact={false} onSyncComplete={loadSyncStatus} />

          {/* Sync Statistics */}
          {syncData && (
            <div className='settings-sync-stats'>
              <div className='settings-sync-stat'>
                <span className='settings-sync-stat-label'>
                  Total Scrobbles
                </span>
                <span className='settings-sync-stat-value'>
                  {syncData.storage.totalScrobbles?.toLocaleString() || 0}
                </span>
              </div>
              <div className='settings-sync-stat'>
                <span className='settings-sync-stat-label'>Unique Albums</span>
                <span className='settings-sync-stat-value'>
                  {syncData.storage.totalAlbums?.toLocaleString() || 0}
                </span>
              </div>
              <div className='settings-sync-stat'>
                <span className='settings-sync-stat-label'>Last Synced</span>
                <span className='settings-sync-stat-value'>
                  {formatDate(syncData.storage.lastSync)}
                </span>
              </div>
              <div className='settings-sync-stat'>
                <span className='settings-sync-stat-label'>
                  Oldest Scrobble
                </span>
                <span className='settings-sync-stat-value'>
                  {syncData.storage.oldestScrobble
                    ? formatDate(syncData.storage.oldestScrobble)
                    : 'Unknown'}
                </span>
              </div>
              <div className='settings-sync-stat'>
                <span className='settings-sync-stat-label'>Index Size</span>
                <span className='settings-sync-stat-value'>
                  {formatBytes(syncData.storage.estimatedSizeBytes || 0)}
                </span>
              </div>
            </div>
          )}

          {/* Sync Controls */}
          <div className='settings-sync-controls'>
            <div className='settings-sync-toggle'>
              <label className='settings-toggle-label'>
                <input
                  type='checkbox'
                  checked={syncSettings?.autoSyncOnStartup ?? true}
                  onChange={handleToggleAutoSync}
                  disabled={syncLoading}
                />
                <span>Auto-sync on startup</span>
              </label>
              <span className='settings-toggle-hint'>
                Automatically fetch new scrobbles when the app starts
              </span>
            </div>

            <div className='settings-sync-actions'>
              <button
                className='btn'
                onClick={handleStartSync}
                disabled={syncLoading || syncData?.sync.status === 'syncing'}
              >
                {syncLoading ? 'Starting...' : 'Sync Now'}
              </button>
              <button
                className='btn btn-danger'
                onClick={handleClearHistoryIndex}
                disabled={
                  syncLoading ||
                  syncData?.sync.status === 'syncing' ||
                  !syncData?.storage.totalScrobbles
                }
              >
                Clear History Index
              </button>
            </div>
          </div>

          <div className='settings-sync-info'>
            <p>
              <strong>Note:</strong> The initial sync may take several minutes
              depending on your listening history. The app will fetch your
              scrobbles gradually to avoid rate limits.
            </p>
          </div>
        </div>
      ) : (
        <div className='card'>
          <h3>Scrobble History Sync</h3>
          <p className='settings-empty-state'>
            Please authenticate with Last.fm to sync your scrobble history.
          </p>
        </div>
      )}

      {/* Discogs Collection Cache Info */}
      <div className='card'>
        <h3>Discogs Collection Cache</h3>
        <p>
          Your Discogs collection is cached locally for fast access. The cache
          is automatically refreshed when expired.
        </p>

        <div className='settings-cache-info'>
          <p className='settings-hint-text'>
            Collection cache information is shown on the Collection page. Visit
            the Collection page to see cache status and manually refresh if
            needed.
          </p>
          <button
            className='btn btn-secondary'
            onClick={() => {
              window.location.hash = '#collection';
            }}
          >
            Go to Collection
          </button>
        </div>
      </div>
    </>
  );

  const renderSettingsTab = () => (
    <>
      {/* AI Recommendations Section */}
      <div className='card'>
        <h3>AI Recommendations (Ollama)</h3>
        <p>
          Enable AI-powered suggestions using Ollama, a locally-running AI. This
          is completely free and runs on your computer.
        </p>

        {aiError && (
          <div className='error-message'>
            {aiError}
            <button
              className='btn btn-small'
              onClick={clearAIMessages}
              style={{ marginLeft: '1rem' }}
            >
              Dismiss
            </button>
          </div>
        )}

        {aiSuccess && (
          <div className='message success'>
            {aiSuccess}
            <button
              className='btn btn-small'
              onClick={clearAIMessages}
              style={{ marginLeft: '1rem' }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Connection Status */}
        <div className='settings-ai-status'>
          <div className='settings-ai-status-indicator'>
            <span
              className={`settings-ai-dot ${aiStatus?.connected ? 'connected' : 'disconnected'}`}
            />
            <span>
              {aiStatus?.connected
                ? 'Ollama is running'
                : aiStatus?.error || 'Ollama is not connected'}
            </span>
          </div>
          <button
            className='btn btn-small btn-secondary'
            onClick={handleTestAIConnection}
            disabled={aiLoading}
          >
            {aiLoading ? 'Testing...' : 'Test Connection'}
          </button>
        </div>

        {/* Enable/Disable Toggle */}
        <div className='settings-ai-controls'>
          <div className='settings-sync-toggle'>
            <label className='settings-toggle-label'>
              <input
                type='checkbox'
                checked={aiSettings?.enabled ?? false}
                onChange={handleToggleAI}
                disabled={aiLoading || !aiStatus?.connected}
              />
              <span>Enable AI suggestions</span>
            </label>
            <span className='settings-toggle-hint'>
              Show AI-powered picks alongside algorithm suggestions
            </span>
          </div>
        </div>

        {/* Configuration */}
        {aiSettings && (
          <div className='settings-ai-config'>
            <h4>Configuration</h4>

            <div className='form-group'>
              <label className='form-label'>Ollama URL</label>
              <input
                type='text'
                className='form-input'
                value={aiSettings.baseUrl}
                onChange={e =>
                  setAiSettings({ ...aiSettings, baseUrl: e.target.value })
                }
                placeholder='http://localhost:11434'
              />
              <span className='form-hint'>Default: http://localhost:11434</span>
            </div>

            <div className='form-group'>
              <label className='form-label'>Model</label>
              {aiModels.length > 0 ? (
                <select
                  className='form-input'
                  value={aiSettings.model}
                  onChange={e =>
                    setAiSettings({ ...aiSettings, model: e.target.value })
                  }
                >
                  {/* Add current model as option if not in list */}
                  {!aiModels.some(m => m.name === aiSettings.model) &&
                    aiSettings.model && (
                      <option value={aiSettings.model}>
                        {aiSettings.model} (not installed)
                      </option>
                    )}
                  {aiModels.map(model => (
                    <option key={model.name} value={model.name}>
                      {model.name} ({model.sizeFormatted})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type='text'
                  className='form-input'
                  value={aiSettings.model}
                  onChange={e =>
                    setAiSettings({ ...aiSettings, model: e.target.value })
                  }
                  placeholder='mistral'
                />
              )}
              <span className='form-hint'>
                Recommended: mistral, llama3, or phi3
              </span>
            </div>

            <button
              className='btn'
              onClick={handleSaveAISettings}
              disabled={aiLoading}
            >
              Save Settings
            </button>
          </div>
        )}

        {/* Setup Instructions */}
        {!aiStatus?.connected && (
          <div className='settings-ai-setup'>
            <h4>Setup Instructions</h4>
            <ol>
              <li>
                Install Ollama from{' '}
                <a
                  href='https://ollama.com'
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  ollama.com
                </a>
              </li>
              <li>
                Run <code>ollama serve</code> in your terminal
              </li>
              <li>
                Pull a model: <code>ollama pull mistral</code>
              </li>
              <li>Click &quot;Test Connection&quot; above</li>
            </ol>
            <p className='settings-ai-tip'>
              <strong>Tip:</strong> Mistral 7B is a good balance of quality and
              speed. For faster responses, try Phi-3 or Llama 3.2 3B.
            </p>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className='settings-page'>
      <div className='card'>
        <h2>Settings</h2>
        <p>Application preferences and configuration options.</p>
      </div>

      {/* Tab Navigation */}
      <div className='settings-tabs'>
        <button
          className={`settings-tab ${activeTab === 'mappings' ? 'active' : ''}`}
          onClick={() => setActiveTab('mappings')}
        >
          Mappings
        </button>
        <button
          className={`settings-tab ${activeTab === 'sync' ? 'active' : ''}`}
          onClick={() => setActiveTab('sync')}
        >
          Sync
        </button>
        <button
          className={`settings-tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </button>
      </div>

      {/* Tab Content */}
      <div className='settings-tab-content'>{renderTabContent()}</div>
    </div>
  );
};

export default SettingsPage;
