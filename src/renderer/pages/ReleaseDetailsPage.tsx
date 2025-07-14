import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { getApiService } from '../services/api';
import { DiscogsRelease, ScrobbleTrack } from '../../shared/types';
import { formatLocalTimeClean } from '../utils/dateUtils';

const ReleaseDetailsPage: React.FC = () => {
  const { authStatus } = useAuth();
  const { state } = useApp();
  const [release, setRelease] = useState<DiscogsRelease | null>(null);
  const [loading, setLoading] = useState(true);
  const [scrobbling, setScrobbling] = useState(false);
  const [selectedTracks, setSelectedTracks] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string>('');
  const [scrobbleResult, setScrobbleResult] = useState<{
    success: number;
    failed: number;
    ignored: number;
    errors: string[];
  } | null>(null);
  const [connectionTest, setConnectionTest] = useState<any>(null);
  const [sessionKey, setSessionKey] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('');
  const [scrobbleProgress, setScrobbleProgress] = useState<{
    current: number;
    total: number;
    success: number;
    failed: number;
    ignored: number;
  } | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');

  const api = getApiService(state.serverUrl);

  useEffect(() => {
    loadReleaseDetails();
  }, []);

  const loadReleaseDetails = async () => {
    try {
      setLoading(true);
      setError('');

      // Get release from localStorage (set by AlbumCard)
      const releaseData = localStorage.getItem('selectedRelease');
      if (!releaseData) {
        setError('No release data found. Please go back and select an album.');
        return;
      }

      const releaseInfo = JSON.parse(releaseData);
      
      // Fetch full release details from API
      const fullRelease = await api.getReleaseDetails(releaseInfo.id);
      setRelease(fullRelease);
      
      // Select all tracks by default
      const allTrackIndices = fullRelease.tracklist?.map((_, index) => index) || [];
      setSelectedTracks(new Set(allTrackIndices));
      
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load release details');
    } finally {
      setLoading(false);
    }
  };

  const handleTrackToggle = (trackIndex: number) => {
    const newSelected = new Set(selectedTracks);
    if (newSelected.has(trackIndex)) {
      newSelected.delete(trackIndex);
    } else {
      newSelected.add(trackIndex);
    }
    setSelectedTracks(newSelected);
  };

  const handleSelectAllTracks = () => {
    if (selectedTracks.size === (release?.tracklist?.length || 0)) {
      setSelectedTracks(new Set());
    } else {
      const allTrackIndices = release?.tracklist?.map((_, index) => index) || [];
      setSelectedTracks(new Set(allTrackIndices));
    }
  };

  const handleScrobble = async () => {
    if (!release || selectedTracks.size === 0) return;

    try {
      setScrobbling(true);
      setScrobbleResult(null);
      setScrobbleProgress(null);

      // Parse start time
      let startTimestamp: number;
      if (startTime) {
        // If user provided a specific time, use it
        const date = new Date(startTime);
        startTimestamp = Math.floor(date.getTime() / 1000);
      } else {
        // Default to current time minus total duration of selected tracks
        const selectedTrackIndices = Array.from(selectedTracks);
        const selectedTracksList = selectedTrackIndices.map(i => release.tracklist?.[i]).filter(Boolean);
        const totalDuration = selectedTracksList.reduce((total, track) => {
          const duration = track?.duration ? parseTrackDuration(track.duration) : 180;
          return total + duration + 1; // +1 for gap between tracks
        }, 0);
        startTimestamp = Math.floor(Date.now() / 1000) - totalDuration;
      }

      // Prepare tracks for scrobbling with proper timing
      const selectedTrackIndices = Array.from(selectedTracks);
      const result = await api.prepareTracksFromRelease(release, selectedTrackIndices, startTimestamp);
      
      console.log('Prepared tracks with timing:', result.tracks.map(t => ({
        track: t.track,
                        timestamp: t.timestamp ? formatLocalTimeClean(t.timestamp * 1000) : 'No timestamp',
        duration: t.duration
      })));
      
      // Start scrobbling and get session ID
      const scrobbleResult = await api.scrobbleBatch(result.tracks);
      setCurrentSessionId(scrobbleResult.sessionId);
      
      // Start polling for progress
      const pollProgress = async () => {
        try {
          const progress = await api.getScrobbleProgress(scrobbleResult.sessionId);
          if (progress.progress) {
            setScrobbleProgress(progress.progress);
          }
          
          if (progress.status === 'completed' || progress.status === 'failed') {
            setScrobbleResult({
              success: progress.progress?.success || 0,
              failed: progress.progress?.failed || 0,
              ignored: progress.progress?.ignored || 0,
              errors: progress.error ? [progress.error] : []
            });
            setScrobbling(false);
            setScrobbleProgress(null);
            return;
          }
          
          // Continue polling
          setTimeout(pollProgress, 1000);
        } catch (error) {
          console.error('Error polling progress:', error);
          setScrobbling(false);
        }
      };
      
      // Start polling after a short delay
      setTimeout(pollProgress, 500);

    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to scrobble tracks');
      setScrobbling(false);
    }
  };

  // Helper function to parse track duration
  const parseTrackDuration = (duration: string): number => {
    if (typeof duration === 'number') {
      return duration;
    }
    
    if (typeof duration === 'string') {
      const parts = duration.split(':');
      if (parts.length === 2) {
        const minutes = parseInt(parts[0]);
        const seconds = parseInt(parts[1]);
        return minutes * 60 + seconds;
      }
    }
    
    return 180; // Default 3 minutes
  };

  // Handle auto timing button - calculates timing so tracks end at current time
  const handleAutoTiming = () => {
    if (selectedTracks.size === 0) {
      setStartTime('');
      return;
    }

    // Calculate total duration of selected tracks
    const selectedTrackIndices = Array.from(selectedTracks);
    const selectedTracksList = selectedTrackIndices.map(i => release?.tracklist?.[i]).filter(Boolean);
    const totalDuration = selectedTracksList.reduce((total, track) => {
      const duration = track?.duration ? parseTrackDuration(track.duration) : 180;
      return total + duration + 1; // +1 for gap between tracks
    }, 0);

    // Calculate start time so that scrobbles end at current time
    const now = new Date();
    const startDate = new Date(now.getTime() - (totalDuration * 1000));
    
    // Format for datetime-local input (YYYY-MM-DDTHH:MM)
    const year = startDate.getFullYear();
    const month = String(startDate.getMonth() + 1).padStart(2, '0');
    const day = String(startDate.getDate()).padStart(2, '0');
    const hours = String(startDate.getHours()).padStart(2, '0');
    const minutes = String(startDate.getMinutes()).padStart(2, '0');
    
    const formattedTime = `${year}-${month}-${day}T${hours}:${minutes}`;
    setStartTime(formattedTime);
  };

  const getLastfmProfileUrl = () => {
    if (authStatus.lastfm.username) {
      return `https://www.last.fm/user/${authStatus.lastfm.username}`;
    }
    return undefined;
  };

  const testLastfmConnection = async () => {
    try {
      const result = await api.testLastfmConnection();
      setConnectionTest(result);
    } catch (error) {
      setConnectionTest({
        success: false,
        message: error instanceof Error ? error.message : 'Connection test failed'
      });
    }
  };

  const getSessionKey = async () => {
    try {
      const result = await api.getLastfmSessionKey();
      setSessionKey(result.sessionKey);
    } catch (error) {
      setSessionKey('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  if (loading) {
    return (
      <div className="card">
        <div className="loading">
          <div className="spinner"></div>
          Loading release details...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="error-message">
          {error}
          <button 
            className="btn btn-small" 
            onClick={() => window.location.hash = '#collection'}
            style={{ marginLeft: '1rem' }}
          >
            Back to Collection
          </button>
        </div>
      </div>
    );
  }

  if (!release) {
    return (
      <div className="card">
        <div className="error-message">
          No release data available
          <button 
            className="btn btn-small" 
            onClick={() => window.location.hash = '#collection'}
            style={{ marginLeft: '1rem' }}
          >
            Back to Collection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2>Release Details</h2>
          <button
            className="btn btn-small btn-secondary"
            onClick={() => window.location.hash = '#collection'}
          >
            Back to Collection
          </button>
        </div>

        <div style={{ display: 'flex', gap: '2rem', marginBottom: '2rem' }}>
          <div style={{ flexShrink: 0 }}>
            <img 
              src={release.cover_image} 
              alt={release.title}
              style={{ 
                width: '200px', 
                height: '200px', 
                objectFit: 'cover',
                borderRadius: '8px',
                border: '1px solid var(--border-color)'
              }}
            />
          </div>
          
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.5rem' }}>
              {release.title}
            </h3>
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
              {release.artist}
            </p>
            <p style={{ margin: '0 0 0.5rem 0', color: 'var(--text-muted)' }}>
              {release.year} • {release.format.join(', ')}
            </p>
            {release.label && release.label.length > 0 && (
              <p style={{ margin: '0 0 0.5rem 0', color: 'var(--text-muted)' }}>
                {release.label.join(', ')}
              </p>
            )}
            {release.catalog_number && (
              <p style={{ margin: '0 0 0.5rem 0', color: 'var(--text-muted)' }}>
                Catalog: {release.catalog_number}
              </p>
            )}
          </div>
        </div>

        {scrobbleProgress && (
          <div className="message info" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <strong>Scrobbling Progress:</strong>
              <span>{scrobbleProgress.current} / {scrobbleProgress.total}</span>
            </div>
            <div style={{ 
              width: '100%', 
              height: '8px', 
              backgroundColor: 'var(--border-color)', 
              borderRadius: '4px',
              overflow: 'hidden',
              marginBottom: '0.5rem'
            }}>
              <div style={{
                width: `${(scrobbleProgress.current / scrobbleProgress.total) * 100}%`,
                height: '100%',
                backgroundColor: 'var(--accent-color)',
                transition: 'width 0.3s ease'
              }} />
            </div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              ✅ {scrobbleProgress.success} successful • 
              ⚠️ {scrobbleProgress.ignored} ignored • 
              ❌ {scrobbleProgress.failed} failed
            </div>
          </div>
        )}

        {scrobbleResult && (
          <div className={`message ${scrobbleResult.failed === 0 && scrobbleResult.ignored === 0 ? 'success' : scrobbleResult.failed > 0 ? 'error' : 'warning'}`} style={{ marginBottom: '1rem' }}>
            <strong>Scrobble Results:</strong> 
            {scrobbleResult.success > 0 && <span style={{ color: 'var(--success-color)' }}> {scrobbleResult.success} successful</span>}
            {scrobbleResult.ignored > 0 && <span style={{ color: 'var(--warning-color)' }}> {scrobbleResult.ignored} ignored</span>}
            {scrobbleResult.failed > 0 && <span style={{ color: 'var(--error-color)' }}> {scrobbleResult.failed} failed</span>}
            
            {scrobbleResult.errors.length > 0 && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                <strong>Details:</strong>
                <ul style={{ margin: '0.25rem 0', paddingLeft: '1.5rem' }}>
                  {scrobbleResult.errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {scrobbleResult.ignored > 0 && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: 'var(--warning-color)' }}>
                <strong>Note:</strong> Ignored scrobbles usually mean the track was scrobbled too recently or is a duplicate.
              </div>
            )}
            
            {getLastfmProfileUrl() && (
              <div style={{ marginTop: '0.5rem' }}>
                <a href={getLastfmProfileUrl()} target="_blank" rel="noopener noreferrer" className="btn btn-small">
                  View on Last.fm
                </a>
              </div>
            )}
          </div>
        )}

        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h4 style={{ margin: 0 }}>Tracks ({selectedTracks.size} selected)</h4>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                className="btn btn-small"
                onClick={handleSelectAllTracks}
                disabled={!release.tracklist?.length}
              >
                {selectedTracks.size === (release.tracklist?.length || 0) ? 'Deselect All' : 'Select All'}
              </button>
              
              <button
                className="btn btn-primary"
                onClick={handleScrobble}
                disabled={selectedTracks.size === 0 || scrobbling || !authStatus.lastfm.authenticated}
              >
                {scrobbling ? 'Scrobbling...' : `Scrobble ${selectedTracks.size} Track${selectedTracks.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>

          {selectedTracks.size > 0 && (
            <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <h5 style={{ margin: '0 0 0.5rem 0' }}>Scrobble Timing</h5>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                Set when you started listening to the first track, or leave empty to use realistic timing.
              </p>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div className="form-group" style={{ margin: 0, flex: 1 }}>
                  <label className="form-label" style={{ fontSize: '0.9rem' }}>Start Time:</label>
                  <input
                    type="datetime-local"
                    className="form-input"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    style={{ fontSize: '0.9rem' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
                  <button
                    className="btn btn-small btn-secondary"
                    onClick={handleAutoTiming}
                    disabled={selectedTracks.size === 0}
                    title={selectedTracks.size === 0 ? "Select tracks first" : "Set timing so tracks end at current time"}
                  >
                    Auto Timing (Just Finished)
                  </button>
                  {startTime && (
                    <button
                      className="btn btn-small btn-outline"
                      onClick={() => setStartTime('')}
                      title="Clear custom timing"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              {startTime && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Tracks will be scrobbled starting from: {formatLocalTimeClean(new Date(startTime))}
                </div>
              )}
              {!startTime && selectedTracks.size > 0 && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Tracks will be scrobbled with realistic timing (as if you just finished listening)
                </div>
              )}
              {startTime && selectedTracks.size > 0 && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--success-color)' }}>
                  Auto timing: Tracks will end at current time (as if you just finished listening)
                </div>
              )}
            </div>
          )}

          {!authStatus.lastfm.authenticated && (
            <div className="warning-message" style={{ marginBottom: '1rem' }}>
              Please authenticate with Last.fm to scrobble tracks.
              <button 
                className="btn btn-small" 
                onClick={() => window.location.hash = '#setup'}
                style={{ marginLeft: '1rem' }}
              >
                Go to Setup
              </button>
            </div>
          )}

          {authStatus.lastfm.authenticated && (
            <div style={{ marginBottom: '1rem' }}>
              <button
                className="btn btn-small btn-secondary"
                onClick={testLastfmConnection}
                style={{ marginRight: '0.5rem' }}
              >
                Test Last.fm Connection
              </button>
              <button
                className="btn btn-small btn-secondary"
                onClick={getSessionKey}
                style={{ marginRight: '0.5rem' }}
              >
                Get Session Key
              </button>
              {connectionTest && (
                <div className={`message ${connectionTest.success ? 'success' : 'warning'}`}>
                  {connectionTest.message}
                </div>
              )}
              {sessionKey && (
                <div className="message info" style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
                  <strong>Session Key:</strong> {sessionKey}
                  <br />
                  <small>Use this in the debug script to test scrobbling</small>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
          {release.tracklist?.map((track, index) => (
            <div 
              key={index}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0.75rem',
                borderBottom: index < (release.tracklist?.length || 0) - 1 ? '1px solid var(--border-color)' : 'none',
                backgroundColor: selectedTracks.has(index) ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                cursor: 'pointer'
              }}
              onClick={() => handleTrackToggle(index)}
            >
              <input
                type="checkbox"
                checked={selectedTracks.has(index)}
                onChange={() => handleTrackToggle(index)}
                style={{ marginRight: '1rem' }}
              />
              
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '500' }}>
                  {track.position} {track.title}
                </div>
                {track.artist && track.artist !== release.artist && (
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    {track.artist}
                  </div>
                )}
                {track.duration && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {track.duration}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ReleaseDetailsPage; 