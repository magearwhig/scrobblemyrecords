import React, { useEffect, useState, useCallback, useMemo } from 'react';

import {
  TrackedRelease,
  ArtistDisambiguationStatus,
  MusicBrainzArtistMatch,
  ReleaseTrackingSyncStatus,
  HiddenRelease,
} from '../../shared/types';
import { Modal, ModalFooter } from '../components/ui';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import {
  useNotifications,
  createSuccessNotification,
  createAlertNotification,
} from '../hooks/useNotifications';
import { getApiService } from '../services/api';
import '../styles/NewReleasesPage.css';

type TabType = 'all' | 'upcoming' | 'recent' | 'vinyl';
type SortOption = 'releaseDate' | 'artistName' | 'title' | 'firstSeen';

interface DisambiguationModalState {
  isOpen: boolean;
  disambiguation: ArtistDisambiguationStatus | null;
  searchResults: MusicBrainzArtistMatch[];
  loading: boolean;
  searchQuery: string;
}

const NewReleasesPage: React.FC = () => {
  const { state } = useApp();
  const { authStatus } = useAuth();
  const { addNotification } = useNotifications();

  // Data state
  const [releases, setReleases] = useState<TrackedRelease[]>([]);
  const [hiddenReleases, setHiddenReleases] = useState<Set<string>>(new Set());
  const [disambiguations, setDisambiguations] = useState<
    ArtistDisambiguationStatus[]
  >([]);
  const [syncStatus, setSyncStatus] =
    useState<ReleaseTrackingSyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [sortBy, setSortBy] = useState<SortOption>('releaseDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['album', 'ep']);

  // Sync state
  const [isPolling, setIsPolling] = useState(false);
  const [syncStarting, setSyncStarting] = useState(false);
  const [fetchingCovers, setFetchingCovers] = useState(false);

  // Disambiguation modal state
  const [disambiguationModal, setDisambiguationModal] =
    useState<DisambiguationModalState>({
      isOpen: false,
      disambiguation: null,
      searchResults: [],
      loading: false,
      searchQuery: '',
    });

  const api = getApiService(state.serverUrl);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [releasesData, disambiguationsData, statusData, hiddenData] =
        await Promise.all([
          api.getTrackedReleases({ types: selectedTypes.join(',') }),
          api.getPendingDisambiguations(),
          api.getReleaseTrackingSyncStatus(),
          api.getHiddenReleases(),
        ]);

      setReleases(releasesData.releases);
      setDisambiguations(disambiguationsData.disambiguations);
      setSyncStatus(statusData);
      setHiddenReleases(new Set(hiddenData.map((h: HiddenRelease) => h.mbid)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load release data');
    } finally {
      setLoading(false);
    }
  }, [api, selectedTypes]);

  useEffect(() => {
    if (authStatus.discogs.authenticated) {
      loadData();
    }
  }, [authStatus.discogs.authenticated, loadData]);

  // Poll for sync status when syncing (2-second interval like history sync)
  useEffect(() => {
    if (!isPolling) return;

    const interval = setInterval(async () => {
      try {
        const status = await api.getReleaseTrackingSyncStatus();
        setSyncStatus(status as ReleaseTrackingSyncStatus);

        if (status.status === 'completed' || status.status === 'error') {
          setIsPolling(false);
          // Reload data after sync completes
          if (status.status === 'completed') {
            const [releasesData, disambiguationsData] = await Promise.all([
              api.getTrackedReleases({ types: selectedTypes.join(',') }),
              api.getPendingDisambiguations(),
            ]);
            setReleases(releasesData.releases);
            setDisambiguations(disambiguationsData.disambiguations);
            addNotification(
              createSuccessNotification(
                'Sync Complete',
                `Found ${status.releasesFound} releases`,
                status.releasesFound > 0
                  ? { route: '/releases', label: 'View Releases' }
                  : undefined
              )
            );
          }
        }
      } catch {
        // Error polling is non-critical, continue polling
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isPolling, api, selectedTypes, addNotification]);

  // Format time remaining for display
  const formatTimeRemaining = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  const handleSync = async () => {
    try {
      setSyncStarting(true);
      setError(null);
      const result = await api.startReleaseTrackingSync();
      setSyncStatus(result.status);
      setIsPolling(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start sync');
    } finally {
      setSyncStarting(false);
    }
  };

  // Filter releases based on active tab (excluding hidden)
  const filteredReleases = useMemo(() => {
    // First filter out hidden releases
    let filtered = releases.filter(r => !hiddenReleases.has(r.mbid));

    switch (activeTab) {
      case 'upcoming':
        filtered = filtered.filter(r => r.isUpcoming);
        break;
      case 'recent':
        filtered = filtered.filter(r => !r.isUpcoming);
        break;
      case 'vinyl':
        filtered = filtered.filter(r => r.vinylStatus === 'available');
        break;
    }

    // Sort
    const multiplier = sortOrder === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'releaseDate': {
          const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
          const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
          return (dateA - dateB) * multiplier;
        }
        case 'artistName':
          return a.artistName.localeCompare(b.artistName) * multiplier;
        case 'title':
          return a.title.localeCompare(b.title) * multiplier;
        case 'firstSeen':
          return (a.firstSeen - b.firstSeen) * multiplier;
        default:
          return 0;
      }
    });

    return filtered;
  }, [releases, hiddenReleases, activeTab, sortBy, sortOrder]);

  // Open disambiguation modal
  const openDisambiguationModal = (
    disambiguation: ArtistDisambiguationStatus
  ) => {
    setDisambiguationModal({
      isOpen: true,
      disambiguation,
      searchResults: disambiguation.candidates || [],
      loading: false,
      searchQuery: disambiguation.artistName,
    });
  };

  // Handle artist search in disambiguation modal
  const handleArtistSearch = async (query: string) => {
    if (!query.trim()) return;

    setDisambiguationModal(prev => ({
      ...prev,
      loading: true,
      searchQuery: query,
    }));

    try {
      const results = await api.searchMusicBrainzArtist(query);
      setDisambiguationModal(prev => ({
        ...prev,
        searchResults: results,
        loading: false,
      }));
    } catch {
      addNotification(
        createAlertNotification('Search Failed', 'Could not search MusicBrainz')
      );
      setDisambiguationModal(prev => ({ ...prev, loading: false }));
    }
  };

  // Resolve disambiguation
  const handleResolveDisambiguation = async (mbid: string | null) => {
    const { disambiguation } = disambiguationModal;
    if (!disambiguation) return;

    try {
      await api.resolveDisambiguation(disambiguation.id, mbid);
      addNotification(
        createSuccessNotification(
          'Artist Resolved',
          `${disambiguation.artistName} has been mapped`
        )
      );

      // Remove from pending list
      setDisambiguations(prev => prev.filter(d => d.id !== disambiguation.id));
      setDisambiguationModal({
        isOpen: false,
        disambiguation: null,
        searchResults: [],
        loading: false,
        searchQuery: '',
      });
    } catch {
      addNotification(
        createAlertNotification('Error', 'Could not resolve disambiguation')
      );
    }
  };

  // Skip disambiguation
  const handleSkipDisambiguation = async () => {
    const { disambiguation } = disambiguationModal;
    if (!disambiguation) return;

    try {
      await api.skipDisambiguation(disambiguation.id);
      setDisambiguations(prev => prev.filter(d => d.id !== disambiguation.id));
      setDisambiguationModal({
        isOpen: false,
        disambiguation: null,
        searchResults: [],
        loading: false,
        searchQuery: '',
      });
    } catch {
      addNotification(
        createAlertNotification('Error', 'Could not skip disambiguation')
      );
    }
  };

  // Add release to wishlist
  const handleAddToWishlist = async (mbid: string, title: string) => {
    try {
      await api.addReleaseToWishlist(mbid);
      addNotification(createSuccessNotification('Added to Wishlist', title));

      // Update local state
      setReleases(prev =>
        prev.map(r => (r.mbid === mbid ? { ...r, inWishlist: true } : r))
      );
    } catch {
      addNotification(
        createAlertNotification('Error', 'Could not add to wishlist')
      );
    }
  };

  // Check vinyl for a single release
  const handleCheckVinyl = async (mbid: string, title: string) => {
    try {
      // Update local state to show checking
      setReleases(prev =>
        prev.map(r =>
          r.mbid === mbid ? { ...r, vinylStatus: 'checking' as const } : r
        )
      );

      const updatedRelease = await api.checkSingleReleaseVinyl(mbid);

      // Update local state with result
      setReleases(prev =>
        prev.map(r => (r.mbid === mbid ? updatedRelease : r))
      );

      if (updatedRelease.vinylStatus === 'available') {
        addNotification(
          createSuccessNotification(
            'Vinyl Available',
            `${title} has vinyl available!`
          )
        );
      } else if (updatedRelease.vinylStatus === 'cd-only') {
        addNotification(
          createAlertNotification('CD Only', `${title} is only available on CD`)
        );
      }
    } catch {
      addNotification(
        createAlertNotification('Error', 'Could not check vinyl availability')
      );
      // Revert to unknown on error
      setReleases(prev =>
        prev.map(r =>
          r.mbid === mbid ? { ...r, vinylStatus: 'unknown' as const } : r
        )
      );
    }
  };

  // Fetch missing cover art
  const handleFetchCovers = async () => {
    setFetchingCovers(true);
    try {
      const { updated } = await api.fetchReleaseCoverArt();
      if (updated > 0) {
        addNotification(
          createSuccessNotification('Cover Art', `Updated ${updated} covers`)
        );
        // Reload releases to show new covers
        const releasesData = await api.getTrackedReleases({
          types: selectedTypes.join(','),
        });
        setReleases(releasesData.releases);
      } else {
        addNotification(
          createSuccessNotification('Cover Art', 'All covers are up to date')
        );
      }
    } catch {
      addNotification(
        createAlertNotification('Error', 'Could not fetch cover art')
      );
    } finally {
      setFetchingCovers(false);
    }
  };

  // Hide release from view
  const handleHideRelease = async (release: TrackedRelease) => {
    try {
      await api.hideRelease(release.mbid, release.title, release.artistName);
      setHiddenReleases(prev => new Set([...prev, release.mbid]));
      addNotification(
        createSuccessNotification('Release Hidden', `${release.title} hidden`)
      );
    } catch {
      addNotification(
        createAlertNotification('Error', 'Could not hide release')
      );
    }
  };

  // Exclude artist from release tracking
  const handleExcludeArtist = async (
    artistName: string,
    artistMbid: string
  ) => {
    try {
      await api.excludeArtist(artistName, artistMbid);
      // Hide all releases from this artist
      const artistReleases = releases.filter(r => r.artistMbid === artistMbid);
      const newHidden = new Set(hiddenReleases);
      artistReleases.forEach(r => newHidden.add(r.mbid));
      setHiddenReleases(newHidden);
      addNotification(
        createSuccessNotification(
          'Artist Excluded',
          `${artistName} will be skipped in future syncs`
        )
      );
    } catch {
      addNotification(
        createAlertNotification('Error', 'Could not exclude artist')
      );
    }
  };

  // Format date for display
  const formatReleaseDate = (dateStr: string | null): string => {
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Get vinyl status badge
  const getVinylBadge = (status: TrackedRelease['vinylStatus']) => {
    switch (status) {
      case 'available':
        return <span className='badge badge-success'>Vinyl Available</span>;
      case 'cd-only':
        return <span className='badge badge-warning'>CD Only</span>;
      case 'not-found':
        return <span className='badge badge-error'>Not Found</span>;
      case 'checking':
        return <span className='badge badge-info'>Checking...</span>;
      default:
        return <span className='badge'>Unknown</span>;
    }
  };

  // Not authenticated state
  if (!authStatus.discogs.authenticated) {
    return (
      <div className='new-releases-page'>
        <h1>New Releases</h1>
        <div className='empty-state'>
          <p>
            Connect your Discogs account to track new releases from artists in
            your collection.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className='new-releases-page'>
      <header className='page-header'>
        <h1>New Releases</h1>
        <div className='header-actions'>
          {syncStatus && syncStatus.status !== 'syncing' && (
            <span className='sync-info'>
              {syncStatus.lastSync ? (
                <>
                  Last sync:{' '}
                  {new Date(syncStatus.lastSync).toLocaleDateString()}
                </>
              ) : (
                'Never synced'
              )}
            </span>
          )}
          <button
            className='btn btn-secondary'
            onClick={handleFetchCovers}
            disabled={
              fetchingCovers ||
              syncStatus?.status === 'syncing' ||
              releases.length === 0
            }
            title='Fetch missing cover art from Cover Art Archive'
          >
            {fetchingCovers ? 'Fetching...' : 'Fetch Covers'}
          </button>
          <button
            className='btn btn-primary'
            onClick={handleSync}
            disabled={syncStarting || syncStatus?.status === 'syncing'}
          >
            {syncStatus?.status === 'syncing' ? 'Syncing...' : 'Sync Releases'}
          </button>
        </div>
      </header>

      {/* Sync Progress Bar */}
      {syncStatus && syncStatus.status === 'syncing' && (
        <div className='sync-progress-container'>
          <div className='sync-progress-info'>
            <span className='sync-label'>Syncing releases:</span>
            <span className='sync-percentage'>{syncStatus.progress}%</span>
            <span className='sync-detail'>
              ({syncStatus.artistsProcessed}/{syncStatus.totalArtists} artists)
            </span>
            {syncStatus.estimatedTimeRemaining !== undefined &&
              syncStatus.estimatedTimeRemaining > 0 && (
                <span className='sync-eta'>
                  ~{formatTimeRemaining(syncStatus.estimatedTimeRemaining)}{' '}
                  remaining
                </span>
              )}
          </div>
          {syncStatus.currentArtist && (
            <div className='sync-current-artist'>
              Processing: {syncStatus.currentArtist}
            </div>
          )}
          <div className='sync-progress-track'>
            <div
              className='sync-progress-bar'
              style={{ width: `${syncStatus.progress}%` }}
            />
          </div>
          <div className='sync-stats'>
            <span>{syncStatus.releasesFound} releases found</span>
            {syncStatus.pendingDisambiguations > 0 && (
              <span>
                {syncStatus.pendingDisambiguations} need disambiguation
              </span>
            )}
          </div>
        </div>
      )}

      {/* Pending Disambiguations Alert */}
      {disambiguations.length > 0 && (
        <div className='disambiguation-alert'>
          <div className='alert-content'>
            <span className='alert-icon'>⚠️</span>
            <span>
              {disambiguations.length} artist
              {disambiguations.length > 1 ? 's' : ''} need disambiguation
            </span>
          </div>
          <div className='disambiguation-list'>
            {disambiguations.slice(0, 5).map(d => (
              <button
                key={d.id}
                className='disambiguation-item'
                onClick={() => openDisambiguationModal(d)}
              >
                {d.artistName}
              </button>
            ))}
            {disambiguations.length > 5 && (
              <span className='more-count'>
                +{disambiguations.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className='tabs'>
        <button
          className={`tab ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          All ({releases.length})
        </button>
        <button
          className={`tab ${activeTab === 'upcoming' ? 'active' : ''}`}
          onClick={() => setActiveTab('upcoming')}
        >
          Upcoming ({releases.filter(r => r.isUpcoming).length})
        </button>
        <button
          className={`tab ${activeTab === 'recent' ? 'active' : ''}`}
          onClick={() => setActiveTab('recent')}
        >
          Recent ({releases.filter(r => !r.isUpcoming).length})
        </button>
        <button
          className={`tab ${activeTab === 'vinyl' ? 'active' : ''}`}
          onClick={() => setActiveTab('vinyl')}
        >
          Vinyl Available (
          {releases.filter(r => r.vinylStatus === 'available').length})
        </button>
      </div>

      {/* Filters */}
      <div className='filters'>
        <div className='filter-group'>
          <label>Sort by:</label>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortOption)}
          >
            <option value='releaseDate'>Release Date</option>
            <option value='artistName'>Artist Name</option>
            <option value='title'>Album Title</option>
            <option value='firstSeen'>Date Found</option>
          </select>
          <button
            className='sort-order-btn'
            onClick={() =>
              setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))
            }
            title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>

        <div className='filter-group'>
          <label>Types:</label>
          <div className='checkbox-group'>
            {['album', 'ep', 'single', 'compilation'].map(type => (
              <label key={type} className='checkbox-label'>
                <input
                  type='checkbox'
                  checked={selectedTypes.includes(type)}
                  onChange={e => {
                    if (e.target.checked) {
                      setSelectedTypes(prev => [...prev, type]);
                    } else {
                      setSelectedTypes(prev => prev.filter(t => t !== type));
                    }
                  }}
                />
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className='error-message'>
          <p>{error}</p>
          <button onClick={loadData}>Retry</button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className='loading-state'>
          <div className='spinner' />
          <p>Loading releases...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filteredReleases.length === 0 && (
        <div className='empty-state'>
          {releases.length === 0 ? (
            <>
              <p>No releases tracked yet.</p>
              <p>
                Click "Sync Releases" to scan your collection for new releases.
              </p>
            </>
          ) : (
            <p>No releases match the current filters.</p>
          )}
        </div>
      )}

      {/* Releases grid */}
      {!loading && !error && filteredReleases.length > 0 && (
        <div className='releases-grid'>
          {filteredReleases.map(release => (
            <div
              key={release.mbid}
              className={`release-card ${release.isUpcoming ? 'upcoming' : ''}`}
            >
              <div className='release-cover'>
                {release.coverArtUrl ? (
                  <img
                    src={release.coverArtUrl}
                    alt={release.title}
                    loading='lazy'
                  />
                ) : (
                  <div className='no-cover'>
                    <span>No Cover</span>
                  </div>
                )}
                {release.isUpcoming && (
                  <div className='upcoming-badge'>Upcoming</div>
                )}
              </div>

              <div className='release-info'>
                <h3 className='release-title' title={release.title}>
                  {release.title}
                </h3>
                <p className='release-artist' title={release.artistName}>
                  {release.artistName}
                </p>
                <p className='release-date'>
                  {formatReleaseDate(release.releaseDate)}
                </p>
                <div className='release-type'>
                  <span className='badge badge-type'>
                    {release.releaseType}
                  </span>
                  {getVinylBadge(release.vinylStatus)}
                </div>

                {release.vinylPriceRange && (
                  <p className='price-range'>
                    ${release.vinylPriceRange.min.toFixed(2)} - $
                    {release.vinylPriceRange.max.toFixed(2)}{' '}
                    {release.vinylPriceRange.currency}
                  </p>
                )}

                <div className='release-actions'>
                  {/* Check vinyl button for unchecked releases */}
                  {(release.vinylStatus === 'unknown' ||
                    release.vinylStatus === 'not-found') && (
                    <button
                      className='btn btn-secondary btn-sm'
                      onClick={() =>
                        handleCheckVinyl(release.mbid, release.title)
                      }
                    >
                      Check Vinyl
                    </button>
                  )}
                  {release.vinylStatus === 'checking' && (
                    <span className='checking-status'>Checking...</span>
                  )}
                  {release.discogsUrl && (
                    <a
                      href={release.discogsUrl}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='btn btn-secondary btn-sm'
                    >
                      View on Discogs
                    </a>
                  )}
                  {release.vinylStatus === 'available' &&
                    !release.inWishlist &&
                    release.discogsMasterId && (
                      <button
                        className='btn btn-primary btn-sm'
                        onClick={() =>
                          handleAddToWishlist(release.mbid, release.title)
                        }
                      >
                        Add to Wishlist
                      </button>
                    )}
                  {release.inWishlist && (
                    <span className='in-wishlist'>✓ In Wishlist</span>
                  )}
                </div>

                {/* Hide/Exclude actions */}
                <div className='release-hide-actions'>
                  <button
                    className='btn-icon btn-hide'
                    onClick={() => handleHideRelease(release)}
                    title='Hide this release'
                  >
                    ✕
                  </button>
                  <button
                    className='btn-icon btn-exclude'
                    onClick={() =>
                      handleExcludeArtist(
                        release.artistName,
                        release.artistMbid
                      )
                    }
                    title={`Exclude ${release.artistName} from release tracking`}
                  >
                    🚫
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Disambiguation Modal */}
      <Modal
        isOpen={disambiguationModal.isOpen}
        onClose={() =>
          setDisambiguationModal(prev => ({ ...prev, isOpen: false }))
        }
        title={`Select Artist: ${disambiguationModal.disambiguation?.artistName || ''}`}
        size='medium'
        loading={disambiguationModal.loading}
      >
        <div className='search-box'>
          <input
            type='text'
            value={disambiguationModal.searchQuery}
            onChange={e =>
              setDisambiguationModal(prev => ({
                ...prev,
                searchQuery: e.target.value,
              }))
            }
            placeholder='Search for artist...'
            onKeyDown={e => {
              if (e.key === 'Enter') {
                handleArtistSearch(disambiguationModal.searchQuery);
              }
            }}
          />
          <button
            onClick={() => handleArtistSearch(disambiguationModal.searchQuery)}
            disabled={disambiguationModal.loading}
          >
            Search
          </button>
        </div>

        {disambiguationModal.loading ? (
          <div className='loading-state'>
            <div className='spinner' />
            <p>Searching...</p>
          </div>
        ) : (
          <div className='artist-results'>
            {disambiguationModal.searchResults.map(artist => (
              <div
                key={artist.mbid}
                className='artist-result'
                onClick={() => handleResolveDisambiguation(artist.mbid)}
              >
                <div className='artist-info'>
                  <span className='artist-name'>{artist.name}</span>
                  {artist.disambiguation && (
                    <span className='disambiguation-text'>
                      ({artist.disambiguation})
                    </span>
                  )}
                  <span className='artist-details'>
                    {artist.country && <span>{artist.country}</span>}
                    {artist.beginYear && (
                      <span>
                        {artist.beginYear}
                        {artist.endYear ? ` - ${artist.endYear}` : ' - present'}
                      </span>
                    )}
                  </span>
                </div>
                <span className='match-score'>{artist.score}%</span>
              </div>
            ))}

            {disambiguationModal.searchResults.length === 0 && (
              <p className='no-results'>No artists found</p>
            )}
          </div>
        )}

        <ModalFooter>
          <button
            className='btn btn-secondary'
            onClick={handleSkipDisambiguation}
          >
            Skip for Now
          </button>
          <button
            className='btn btn-warning'
            onClick={() => handleResolveDisambiguation(null)}
          >
            None of These
          </button>
        </ModalFooter>
      </Modal>
    </div>
  );
};

export default NewReleasesPage;
