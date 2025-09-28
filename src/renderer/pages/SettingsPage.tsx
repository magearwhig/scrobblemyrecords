import React, { useState, useEffect } from 'react';

import { ArtistMapping } from '../../backend/services/artistMappingService';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { getApiService } from '../services/api';

const SettingsPage: React.FC = () => {
  const { state } = useApp();
  const { authStatus } = useAuth();
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

  const api = getApiService(state.serverUrl);

  useEffect(() => {
    loadMappings();
    if (authStatus.discogs.authenticated && authStatus.discogs.username) {
      loadArtists();
    }
  }, [authStatus.discogs.authenticated, authStatus.discogs.username]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const loadArtists = async () => {
    try {
      if (!authStatus.discogs.username) return;

      const result = await api.getEntireCollection(authStatus.discogs.username);
      const uniqueArtists = Array.from(
        new Set(result.data.map(item => item.release.artist).filter(Boolean))
      ).sort();
      setArtists(uniqueArtists);
    } catch {
      // Silently fail for artist loading - not critical functionality
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

  const handleImportMappings = async (event: any) => {
    const files = (event.target as any).files;
    const file = files?.[0];
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
    (event.target as any).value = '';
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
    <div>
      <div className='card'>
        <h2>Settings</h2>
        <p>Application preferences and configuration options.</p>
      </div>

      {/* Artist Mappings Section */}
      <div className='card'>
        <h3>Artist Name Mappings</h3>
        <p>
          Manage mappings between Discogs and Last.fm artist names. When
          scrobbling, Discogs artist names will be automatically converted to
          their mapped Last.fm names.
        </p>

        {authStatus.discogs.authenticated && (
          <div
            style={{
              padding: '0.75rem',
              backgroundColor: '#fff3cd',
              color: '#856404',
              border: '1px solid #ffeaa7',
              borderRadius: '6px',
              marginBottom: '1rem',
              fontSize: '0.9rem',
            }}
          >
            💡{' '}
            {artists.length > 0
              ? `Artist suggestions available from your collection (${artists.length} artists loaded).`
              : 'Loading artist suggestions from your collection...'}
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
          <div
            style={{
              padding: '0.75rem',
              backgroundColor: '#d4edda',
              color: '#155724',
              border: '1px solid #c3e6cb',
              borderRadius: '6px',
              marginBottom: '1rem',
            }}
          >
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
          <div
            style={{
              backgroundColor: '#f8f9fa',
              padding: '1rem',
              borderRadius: '6px',
              marginBottom: '1rem',
              border: '1px solid #e9ecef',
            }}
          >
            <strong>Current Mappings:</strong> {stats.totalMappings}
            {stats.lastUpdated && (
              <span style={{ marginLeft: '1rem', color: '#666' }}>
                Last updated: {new Date(stats.lastUpdated).toLocaleDateString()}
              </span>
            )}
          </div>
        )}

        {/* Import/Export Controls */}
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            marginBottom: '1.5rem',
            flexWrap: 'wrap',
          }}
        >
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
        <div
          style={{
            backgroundColor: '#f8f9fa',
            padding: '1rem',
            borderRadius: '6px',
            marginBottom: '1.5rem',
            border: '1px solid #e9ecef',
          }}
        >
          <h4 style={{ marginTop: 0, marginBottom: '1rem' }}>
            Add New Mapping
          </h4>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr auto',
              gap: '0.5rem',
              alignItems: 'end',
            }}
          >
            <div style={{ position: 'relative' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '0.25rem',
                  fontSize: '0.9rem',
                  color: '#333',
                }}
              >
                Discogs Artist Name
              </label>
              <input
                type='text'
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
                style={{ width: '100%', color: '#333' }}
              />
              {showArtistSuggestions && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    backgroundColor: 'white',
                    border: '1px solid #e0e0e0',
                    borderRadius: '4px',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    zIndex: 1000,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  }}
                >
                  {filteredArtists.map((artist, index) => (
                    <div
                      key={index}
                      onClick={() => selectArtist(artist)}
                      style={{
                        padding: '0.5rem',
                        cursor: 'pointer',
                        borderBottom:
                          index < filteredArtists.length - 1
                            ? '1px solid #f0f0f0'
                            : 'none',
                        color: '#333',
                        fontSize: '0.9rem',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.backgroundColor = '#f8f9fa';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.backgroundColor = 'white';
                      }}
                    >
                      {artist}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  marginBottom: '0.25rem',
                  fontSize: '0.9rem',
                  color: '#333',
                }}
              >
                Last.fm Artist Name
              </label>
              <input
                type='text'
                value={newMapping.lastfmName}
                onChange={e =>
                  setNewMapping({ ...newMapping, lastfmName: e.target.value })
                }
                placeholder='e.g., Turnstile'
                style={{ width: '100%', color: '#333' }}
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

        {/* Mappings List */}
        {loading && mappings.length === 0 ? (
          <div className='loading'>
            <div className='spinner'></div>
            Loading artist mappings...
          </div>
        ) : mappings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
            No artist mappings configured yet. Add your first mapping above!
          </div>
        ) : (
          <div>
            <h4 style={{ color: '#333' }}>
              Current Mappings ({mappings.length})
            </h4>
            <div
              style={{
                maxHeight: '400px',
                overflowY: 'auto',
                border: '1px solid #e0e0e0',
                borderRadius: '6px',
                backgroundColor: 'white',
              }}
            >
              {mappings.map((mapping, index) => (
                <div
                  key={mapping.discogsName}
                  style={{
                    padding: '0.75rem',
                    borderBottom:
                      index < mappings.length - 1
                        ? '1px solid #f0f0f0'
                        : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontWeight: 500,
                        fontSize: '0.9rem',
                        color: '#333',
                      }}
                    >
                      {mapping.discogsName}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#666' }}>
                      maps to:{' '}
                      {editingMapping === mapping.discogsName ? (
                        <input
                          type='text'
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyPress={e => {
                            if (e.key === 'Enter')
                              handleUpdateMapping(mapping.discogsName);
                            if (e.key === 'Escape') cancelEditing();
                          }}
                          style={{ minWidth: '150px', color: '#333' }}
                          autoFocus
                        />
                      ) : (
                        <strong style={{ color: '#333' }}>
                          {mapping.lastfmName}
                        </strong>
                      )}
                    </div>
                    {mapping.lastUsed && (
                      <div style={{ fontSize: '0.75rem', color: '#999' }}>
                        Last used:{' '}
                        {new Date(mapping.lastUsed).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
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
  );
};

export default SettingsPage;
