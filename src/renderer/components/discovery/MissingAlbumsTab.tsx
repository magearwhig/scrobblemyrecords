import React from 'react';

import { MissingAlbum } from '../../../shared/types';

type AlbumSortOption = 'plays' | 'artist' | 'album' | 'recent';

interface MissingAlbumsTabProps {
  missingAlbums: MissingAlbum[];
  albumSort: AlbumSortOption;
  setAlbumSort: (sort: AlbumSortOption) => void;
  hideWantedItems: boolean;
  setHideWantedItems: (hide: boolean) => void;
  addingToWantList: Set<string>;
  addedToWantList: Set<string>;
  isInDiscogsWishlist: (artist: string, album: string) => boolean;
  formatDate: (timestamp: number) => string;
  openLink: (url: string) => void;
  getLastFmAlbumUrl: (artist: string, album: string) => string;
  getDiscogsAlbumUrl: (artist: string, album: string) => string;
  openAlbumMapping: (album: MissingAlbum) => void;
  handleAddToWantList: (album: MissingAlbum) => void;
  handleHideAlbum: (album: MissingAlbum) => void;
}

const MissingAlbumsTab: React.FC<MissingAlbumsTabProps> = ({
  missingAlbums,
  albumSort,
  setAlbumSort,
  hideWantedItems,
  setHideWantedItems,
  addingToWantList,
  addedToWantList,
  isInDiscogsWishlist,
  formatDate,
  openLink,
  getLastFmAlbumUrl,
  getDiscogsAlbumUrl,
  openAlbumMapping,
  handleAddToWantList,
  handleHideAlbum,
}) => {
  // Check if an album is wanted (in Discogs wantlist or local want list)
  const isWantedItem = (artist: string, album: string): boolean => {
    return (
      isInDiscogsWishlist(artist, album) ||
      addedToWantList.has(`${artist}:${album}`)
    );
  };

  // Sort and optionally filter albums based on selected options
  // Limit to 100 items for display
  const sortedAlbums = [...missingAlbums]
    .filter(album => {
      if (!hideWantedItems) return true;
      return !isWantedItem(album.artist, album.album);
    })
    .sort((a, b) => {
      switch (albumSort) {
        case 'plays':
          return b.playCount - a.playCount;
        case 'artist':
          return a.artist.localeCompare(b.artist);
        case 'album':
          return a.album.localeCompare(b.album);
        case 'recent':
          return b.lastPlayed - a.lastPlayed;
        default:
          return 0;
      }
    })
    .slice(0, 100);

  return (
    <div className='discovery-section'>
      <div className='discovery-section-header'>
        <h2>Albums You Listen To But Don't Own</h2>
        <div className='discovery-controls'>
          <label className='discovery-toggle'>
            <input
              type='checkbox'
              checked={hideWantedItems}
              onChange={e => setHideWantedItems(e.target.checked)}
            />
            <span>Hide wishlisted & monitored</span>
          </label>
          <div className='discovery-sort'>
            <label htmlFor='album-sort'>Sort by:</label>
            <select
              id='album-sort'
              value={albumSort}
              onChange={e => setAlbumSort(e.target.value as AlbumSortOption)}
            >
              <option value='plays'>Most Plays</option>
              <option value='artist'>Artist Name</option>
              <option value='album'>Album Name</option>
              <option value='recent'>Recently Played</option>
            </select>
          </div>
        </div>
      </div>
      {sortedAlbums.length === 0 ? (
        <p className='empty-state'>
          {hideWantedItems && missingAlbums.length > 0
            ? 'All albums are in your wishlist or being monitored. Turn off "Hide wishlisted & monitored" to see them.'
            : 'No missing albums found. Either you own everything you listen to, or you need to sync your history first!'}
        </p>
      ) : (
        <div className='missing-list'>
          {sortedAlbums.map((album, index) => (
            <div
              key={`${album.artist}-${album.album}-${index}`}
              className='missing-item'
            >
              <div className='missing-item-info'>
                <div className='missing-item-title'>
                  {album.album}
                  {isInDiscogsWishlist(album.artist, album.album) && (
                    <span
                      className='discovery-badge discovery-badge-wishlist'
                      title='In your Discogs wishlist'
                    >
                      In Wishlist
                    </span>
                  )}
                  {addedToWantList.has(`${album.artist}:${album.album}`) && (
                    <span
                      className='discovery-badge discovery-badge-monitoring'
                      title='Monitoring for vinyl availability'
                    >
                      Monitoring
                    </span>
                  )}
                </div>
                <div className='missing-item-artist'>{album.artist}</div>
              </div>
              <div className='missing-item-stats'>
                <span className='missing-item-playcount'>
                  {album.playCount} plays
                </span>
                <span>Last: {formatDate(album.lastPlayed)}</span>
              </div>
              <div className='missing-item-actions'>
                <button
                  className='btn btn-small btn-icon'
                  onClick={() =>
                    openLink(getLastFmAlbumUrl(album.artist, album.album))
                  }
                  title='View album on Last.fm'
                >
                  Last.fm
                </button>
                <button
                  className='btn btn-small btn-icon'
                  onClick={() =>
                    openLink(getDiscogsAlbumUrl(album.artist, album.album))
                  }
                  title='Search album on Discogs'
                >
                  Discogs
                </button>
                <button
                  className='btn btn-small btn-secondary'
                  onClick={() => openAlbumMapping(album)}
                  title='Map to collection item'
                >
                  Map
                </button>
                <button
                  className={`btn btn-small ${
                    addedToWantList.has(`${album.artist}:${album.album}`)
                      ? 'btn-success'
                      : 'btn-primary'
                  }`}
                  onClick={() => handleAddToWantList(album)}
                  disabled={
                    addingToWantList.has(`${album.artist}:${album.album}`) ||
                    addedToWantList.has(`${album.artist}:${album.album}`)
                  }
                  title='Monitor for vinyl availability'
                >
                  {addingToWantList.has(`${album.artist}:${album.album}`)
                    ? 'Adding...'
                    : addedToWantList.has(`${album.artist}:${album.album}`)
                      ? 'Monitoring'
                      : 'Monitor'}
                </button>
                <button
                  className='btn btn-small btn-link'
                  onClick={() => handleHideAlbum(album)}
                  title='Hide from discovery (e.g., podcasts)'
                >
                  Hide
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MissingAlbumsTab;
