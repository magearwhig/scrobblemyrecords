import React from 'react';

import { ScrobbleSession, ScrobbleTrack } from '../../shared/types';

interface UniqueAlbum {
  album: string;
  artist: string;
  cover: string;
}

interface ScrobbleSessionCardProps {
  session: ScrobbleSession;
  isExpanded: boolean;
  onToggleDetails: () => void;
  getStatusIcon: (status: string) => string;
  formatDate: (timestamp: number) => string;
  formatTrackTimestamp: (timestampMs: number) => string;
  onDelete: (sessionId: string) => void;
  onResubmit: (sessionId: string) => void;
  actionLoading: string | null;
  getUniqueAlbumCovers: (tracks: ScrobbleTrack[]) => UniqueAlbum[];
}

const getStatusClass = (status: string): string => {
  switch (status) {
    case 'completed':
      return 'history-session-status-text--completed';
    case 'failed':
      return 'history-session-status-text--failed';
    case 'pending':
      return 'history-session-status-text--pending';
    default:
      return 'history-session-status-text--default';
  }
};

const ScrobbleSessionCard: React.FC<ScrobbleSessionCardProps> = ({
  session,
  isExpanded,
  onToggleDetails,
  getStatusIcon,
  formatDate,
  formatTrackTimestamp,
  onDelete,
  onResubmit,
  actionLoading,
  getUniqueAlbumCovers,
}) => {
  const uniqueAlbums = getUniqueAlbumCovers(session.tracks);

  return (
    <div className='card'>
      <div className='history-session-header'>
        <div className='history-session-info'>
          <div className='history-session-status'>
            <span className='history-session-status-icon'>
              {getStatusIcon(session.status)}
            </span>
            <span
              className={`history-session-status-text ${getStatusClass(session.status)}`}
            >
              {session.status}
            </span>
          </div>

          <div className='history-session-timestamp'>
            {formatDate(session.timestamp)}
          </div>

          <div className='history-session-tracks'>
            <strong>{session.tracks.length}</strong> tracks
            {session.status === 'completed' && (
              <span className='history-session-success'>
                &bull; Successfully scrobbled
              </span>
            )}
            {session.status === 'failed' && session.error && (
              <span className='history-session-error'>
                &bull; {session.error}
              </span>
            )}
          </div>

          {uniqueAlbums.length > 0 && (
            <div className='history-session-covers'>
              {uniqueAlbums.slice(0, 5).map((album, idx) => (
                <div
                  key={idx}
                  title={`${album.album} by ${album.artist}`}
                  className='history-session-cover-thumbnail'
                  style={{ backgroundImage: `url(${album.cover})` }}
                />
              ))}
              {uniqueAlbums.length > 5 && (
                <div className='history-session-covers-more'>
                  +{uniqueAlbums.length - 5} more
                </div>
              )}
            </div>
          )}
        </div>

        <div className='history-session-actions'>
          <button
            className='btn btn-small btn-secondary'
            onClick={onToggleDetails}
          >
            {isExpanded ? 'Hide Details' : 'View Details'}
          </button>

          {(session.status === 'pending' || session.status === 'failed') && (
            <>
              <button
                className='btn btn-small btn-danger'
                onClick={() => onDelete(session.id)}
                disabled={actionLoading === `delete-${session.id}`}
              >
                {actionLoading === `delete-${session.id}`
                  ? 'Deleting...'
                  : 'Delete'}
              </button>
              <button
                className='btn btn-small'
                onClick={() => onResubmit(session.id)}
                disabled={actionLoading === `resubmit-${session.id}`}
              >
                {actionLoading === `resubmit-${session.id}`
                  ? 'Resubmitting...'
                  : 'Resubmit'}
              </button>
            </>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className='history-session-details'>
          <h4 className='history-session-details-header'>Session Details</h4>

          <div className='history-session-details-row'>
            <strong>Session ID:</strong> {session.id}
          </div>

          <div className='history-session-details-row'>
            <strong>Tracks ({session.tracks.length}):</strong>
          </div>

          <div className='history-session-tracklist'>
            {session.tracks.map((track, index) => (
              <div key={index} className='history-session-track'>
                <div className='history-session-track-title'>{track.track}</div>
                <div className='history-session-track-meta'>
                  {track.artist} &bull; {track.album}
                </div>
                {track.timestamp && (
                  <div className='history-session-track-timestamp'>
                    Scrobbled: {formatTrackTimestamp(track.timestamp * 1000)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(ScrobbleSessionCard);
