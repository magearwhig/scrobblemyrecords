import React, { useState, useEffect } from 'react';

import {
  HiddenAlbum,
  HiddenArtist,
  HiddenRelease,
  ExcludedArtist,
} from '../../../shared/types';
import ApiService from '../../services/api';

interface SettingsFiltersSectionProps {
  api: ApiService;
}

const SettingsFiltersSection: React.FC<SettingsFiltersSectionProps> = ({
  api,
}) => {
  // Discovery hidden items
  const [hiddenAlbums, setHiddenAlbums] = useState<HiddenAlbum[]>([]);
  const [hiddenArtists, setHiddenArtists] = useState<HiddenArtist[]>([]);
  const [hiddenLoading, setHiddenLoading] = useState(false);

  // Release tracking filters
  const [hiddenReleases, setHiddenReleases] = useState<HiddenRelease[]>([]);
  const [excludedArtists, setExcludedArtists] = useState<ExcludedArtist[]>([]);
  const [releasesLoading, setReleasesLoading] = useState(false);

  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  useEffect(() => {
    loadHiddenItems();
    loadReleaseFilters();
  }, []);

  const loadHiddenItems = async () => {
    try {
      setHiddenLoading(true);
      const [albums, artists] = await Promise.all([
        api.getHiddenAlbums(),
        api.getHiddenArtists(),
      ]);
      setHiddenAlbums(albums);
      setHiddenArtists(artists);
    } catch (error) {
      console.warn('Failed to load hidden items:', error);
    } finally {
      setHiddenLoading(false);
    }
  };

  const loadReleaseFilters = async () => {
    try {
      setReleasesLoading(true);
      const [releases, artists] = await Promise.all([
        api.getHiddenReleases(),
        api.getExcludedArtists(),
      ]);
      setHiddenReleases(releases);
      setExcludedArtists(artists);
    } catch (error) {
      console.warn('Failed to load release filters:', error);
    } finally {
      setReleasesLoading(false);
    }
  };

  const handleUnhideAlbum = async (artist: string, album: string) => {
    try {
      await api.unhideAlbum(artist, album);
      setHiddenAlbums(prev =>
        prev.filter(a => !(a.artist === artist && a.album === album))
      );
      setSuccess(`Unhidden album: "${album}" by "${artist}"`);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to unhide album'
      );
    }
  };

  const handleUnhideArtist = async (artist: string) => {
    try {
      await api.unhideArtist(artist);
      setHiddenArtists(prev => prev.filter(a => a.artist !== artist));
      setSuccess(`Unhidden artist: "${artist}"`);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to unhide artist'
      );
    }
  };

  const handleUnhideRelease = async (mbid: string, title: string) => {
    try {
      await api.unhideRelease(mbid);
      setHiddenReleases(prev => prev.filter(r => r.mbid !== mbid));
      setSuccess(`Unhidden release: "${title}"`);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to unhide release'
      );
    }
  };

  const handleIncludeArtist = async (artistName: string) => {
    try {
      await api.includeArtist(artistName);
      setExcludedArtists(prev => prev.filter(a => a.artistName !== artistName));
      setSuccess(`Included artist: "${artistName}"`);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to include artist'
      );
    }
  };

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  const totalHiddenCount = hiddenAlbums.length + hiddenArtists.length;
  const totalReleaseFiltersCount =
    hiddenReleases.length + excludedArtists.length;

  return (
    <div className='settings-filters-section'>
      {/* Hidden Discovery Items */}
      <div className='settings-section-card'>
        <div className='settings-section-header'>
          <span className='settings-section-icon'>👁️‍🗨️</span>
          <div>
            <h3>Hidden Discovery Items</h3>
            <p className='settings-section-description'>
              Items hidden from Discovery (podcasts, compilations, etc.)
            </p>
          </div>
          {totalHiddenCount > 0 && (
            <span className='settings-section-badge'>{totalHiddenCount}</span>
          )}
        </div>

        <div className='settings-section-content'>
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

          {hiddenLoading ? (
            <div className='loading-container'>
              <div className='loading-spinner' />
              <p>Loading hidden items...</p>
            </div>
          ) : (
            <>
              {/* Hidden Albums */}
              <div className='settings-subsection'>
                <h4>Hidden Albums ({hiddenAlbums.length})</h4>
                {hiddenAlbums.length === 0 ? (
                  <div className='settings-empty-state-inline'>
                    <p>No hidden albums.</p>
                    <p className='settings-hint-text'>
                      Use the &quot;Hide&quot; button on the Discovery page to
                      hide items you don&apos;t want to see.
                    </p>
                  </div>
                ) : (
                  <div className='settings-hidden-list'>
                    {hiddenAlbums.map((item, index) => (
                      <div
                        key={`${item.artist}-${item.album}-${index}`}
                        className='settings-hidden-item'
                      >
                        <div className='settings-hidden-info'>
                          <span className='settings-hidden-title'>
                            &quot;{item.album}&quot; by {item.artist}
                          </span>
                          <span className='settings-hidden-date'>
                            Hidden:{' '}
                            {new Date(item.hiddenAt).toLocaleDateString()}
                          </span>
                        </div>
                        <button
                          className='btn btn-small btn-secondary'
                          onClick={() =>
                            handleUnhideAlbum(item.artist, item.album)
                          }
                          title='Unhide this album'
                        >
                          Unhide
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Hidden Artists */}
              <div className='settings-subsection'>
                <h4>Hidden Artists ({hiddenArtists.length})</h4>
                {hiddenArtists.length === 0 ? (
                  <div className='settings-empty-state-inline'>
                    <p>No hidden artists.</p>
                    <p className='settings-hint-text'>
                      Use the &quot;Hide&quot; button on the Discovery page to
                      hide artists you don&apos;t want to see.
                    </p>
                  </div>
                ) : (
                  <div className='settings-hidden-list'>
                    {hiddenArtists.map((item, index) => (
                      <div
                        key={`${item.artist}-${index}`}
                        className='settings-hidden-item'
                      >
                        <div className='settings-hidden-info'>
                          <span className='settings-hidden-title'>
                            {item.artist}
                          </span>
                          <span className='settings-hidden-date'>
                            Hidden:{' '}
                            {new Date(item.hiddenAt).toLocaleDateString()}
                          </span>
                        </div>
                        <button
                          className='btn btn-small btn-secondary'
                          onClick={() => handleUnhideArtist(item.artist)}
                          title='Unhide this artist'
                        >
                          Unhide
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

      {/* Release Tracking Filters */}
      <div className='settings-section-card'>
        <div className='settings-section-header'>
          <span className='settings-section-icon'>🎵</span>
          <div>
            <h3>Release Tracking Filters</h3>
            <p className='settings-section-description'>
              Hidden releases and excluded artists from New Releases
            </p>
          </div>
          {totalReleaseFiltersCount > 0 && (
            <span className='settings-section-badge'>
              {totalReleaseFiltersCount}
            </span>
          )}
        </div>

        <div className='settings-section-content'>
          {releasesLoading ? (
            <div className='loading-container'>
              <div className='loading-spinner' />
              <p>Loading release filters...</p>
            </div>
          ) : (
            <>
              {/* Hidden Releases */}
              <div className='settings-subsection'>
                <h4>Hidden Releases ({hiddenReleases.length})</h4>
                {hiddenReleases.length === 0 ? (
                  <div className='settings-empty-state-inline'>
                    <p>No hidden releases.</p>
                    <p className='settings-hint-text'>
                      Use the hide button (✕) on the New Releases page to hide
                      releases you&apos;re not interested in.
                    </p>
                  </div>
                ) : (
                  <div className='settings-hidden-list'>
                    {hiddenReleases.map((item, index) => (
                      <div
                        key={`${item.mbid}-${index}`}
                        className='settings-hidden-item'
                      >
                        <div className='settings-hidden-info'>
                          <span className='settings-hidden-title'>
                            &quot;{item.title}&quot; by {item.artistName}
                          </span>
                          <span className='settings-hidden-date'>
                            Hidden:{' '}
                            {new Date(item.hiddenAt).toLocaleDateString()}
                          </span>
                        </div>
                        <button
                          className='btn btn-small btn-secondary'
                          onClick={() =>
                            handleUnhideRelease(item.mbid, item.title)
                          }
                          title='Unhide this release'
                        >
                          Unhide
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Excluded Artists */}
              <div className='settings-subsection'>
                <h4>Excluded Artists ({excludedArtists.length})</h4>
                {excludedArtists.length === 0 ? (
                  <div className='settings-empty-state-inline'>
                    <p>No excluded artists.</p>
                    <p className='settings-hint-text'>
                      Use the exclude button (🚫) on the New Releases page to
                      exclude artists from future release sync checks.
                    </p>
                  </div>
                ) : (
                  <div className='settings-hidden-list'>
                    {excludedArtists.map((item, index) => (
                      <div
                        key={`${item.normalizedName}-${index}`}
                        className='settings-hidden-item'
                      >
                        <div className='settings-hidden-info'>
                          <span className='settings-hidden-title'>
                            {item.artistName}
                          </span>
                          <span className='settings-hidden-date'>
                            Excluded:{' '}
                            {new Date(item.excludedAt).toLocaleDateString()}
                          </span>
                        </div>
                        <button
                          className='btn btn-small btn-secondary'
                          onClick={() => handleIncludeArtist(item.artistName)}
                          title='Include this artist in release tracking'
                        >
                          Include
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
    </div>
  );
};

export default SettingsFiltersSection;
