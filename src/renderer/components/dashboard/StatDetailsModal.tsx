import React, { useEffect, useState } from 'react';

import { NewArtistDetail } from '../../../shared/types';
import { statsApi } from '../../services/statsApi';
import { formatRelativeTime } from '../../utils/dateUtils';
import { Modal } from '../ui/Modal';

import './StatDetailsModal.css';

export type StatType = 'new-artists';

interface StatDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  statType: StatType;
}

/**
 * Modal component that displays detailed information about dashboard stats.
 * Currently supports:
 * - new-artists: List of artists discovered this month
 */
export const StatDetailsModal: React.FC<StatDetailsModalProps> = ({
  isOpen,
  onClose,
  statType,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newArtists, setNewArtists] = useState<NewArtistDetail[]>([]);

  useEffect(() => {
    if (isOpen && statType === 'new-artists') {
      loadNewArtists();
    }
  }, [isOpen, statType]);

  const loadNewArtists = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await statsApi.getNewArtistsDetails();

      if (response.success && response.data) {
        setNewArtists(response.data);
      } else {
        setError(response.error || 'Failed to load new artists');
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load new artists'
      );
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    switch (statType) {
      case 'new-artists':
        return 'New Artists This Month';
      default:
        return 'Details';
    }
  };

  const renderContent = () => {
    if (error) {
      return (
        <div className='stat-details-error'>
          <p>{error}</p>
          <button onClick={() => loadNewArtists()} className='retry-button'>
            Retry
          </button>
        </div>
      );
    }

    if (statType === 'new-artists') {
      if (newArtists.length === 0) {
        return (
          <div className='stat-details-empty'>
            <p>No new artists discovered this month yet.</p>
          </div>
        );
      }

      return (
        <div className='stat-details-list'>
          {newArtists.map((artist, index) => (
            <div
              key={`${artist.artist}-${index}`}
              className='stat-details-item'
            >
              <div className='stat-details-item-main'>
                <div className='stat-details-item-name'>{artist.artist}</div>
                <div className='stat-details-item-meta'>
                  First played{' '}
                  {formatRelativeTime(Math.floor(artist.firstPlayed / 1000))}
                </div>
              </div>
              <div className='stat-details-item-count'>
                {artist.playCount} {artist.playCount === 1 ? 'play' : 'plays'}
              </div>
            </div>
          ))}
        </div>
      );
    }

    return null;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={getTitle()}
      size='medium'
      loading={loading}
    >
      {renderContent()}
    </Modal>
  );
};

export default StatDetailsModal;
