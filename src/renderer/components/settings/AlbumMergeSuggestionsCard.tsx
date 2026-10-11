import { Merge } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import { AlbumMergeSuggestion } from '../../../shared/types';
import { useNotifications } from '../../hooks/useNotifications';
import ApiService from '../../services/api';
import { createLogger } from '../../utils/logger';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

const logger = createLogger('AlbumMergeSuggestionsCard');

/** Suggestions shown before "Show more" */
const PAGE_SIZE = 20;

interface AlbumMergeSuggestionsCardProps {
  api: ApiService;
  /** Called after a merge creates album mappings */
  onMerged?: () => void;
}

/**
 * Lists versions of the same album that are still counted separately (e.g.
 * "Old" and "Old [Explicit]"), so each can be merged with one click or
 * dismissed.
 */
const AlbumMergeSuggestionsCard: React.FC<AlbumMergeSuggestionsCardProps> = ({
  api,
  onMerged,
}) => {
  const { addNotification } = useNotifications();
  const [suggestions, setSuggestions] = useState<AlbumMergeSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  /** Id of the suggestion being merged or dismissed */
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadSuggestions = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      setSuggestions(await api.getAlbumMergeSuggestions());
    } catch (err) {
      logger.error('Failed to load album merge suggestions', err);
      setError('Failed to load suggested merges');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  const removeSuggestion = (id: string) =>
    setSuggestions(current => current.filter(s => s.id !== id));

  const handleMerge = async (suggestion: AlbumMergeSuggestion) => {
    try {
      setBusyId(suggestion.id);
      await api.createAlbumMappingsBatch(suggestion.mappings);
      removeSuggestion(suggestion.id);
      onMerged?.();
      addNotification({
        type: 'success',
        title: 'Albums merged',
        message: `Versions of "${suggestion.target.album}" now count as one album.`,
      });
    } catch (err) {
      logger.error('Failed to merge album versions', err);
      addNotification({
        type: 'alert',
        title: 'Merge failed',
        message: err instanceof Error ? err.message : 'Failed to merge albums',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleDismiss = async (suggestion: AlbumMergeSuggestion) => {
    try {
      setBusyId(suggestion.id);
      await api.dismissAlbumMergeSuggestion(suggestion.id);
      removeSuggestion(suggestion.id);
    } catch (err) {
      logger.error('Failed to dismiss album merge suggestion', err);
      addNotification({
        type: 'alert',
        title: 'Dismiss failed',
        message:
          err instanceof Error ? err.message : 'Failed to dismiss suggestion',
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className='settings-section-card'>
      <div className='settings-section-header'>
        <span className='settings-section-icon'>
          <Merge size={18} aria-hidden='true' />
        </span>
        <div>
          <h3>Suggested Album Merges</h3>
          <p className='settings-section-description'>
            Versions of the same album that are still counted separately
          </p>
        </div>
        <span className='settings-section-badge'>{suggestions.length}</span>
      </div>

      <div className='settings-section-content'>
        <div className='settings-info-box'>
          These albums differ only in an edition tag (Deluxe, Remastered,
          [Explicit]) or in how the artist name is written. Merging counts them
          as one album everywhere. Albums you own merge into your collection
          copy; the rest merge into the plain title. You can undo a merge from
          the album&apos;s page.
        </div>

        {loading ? (
          <div className='loading'>
            <div className='spinner'></div>
            Finding album versions...
          </div>
        ) : error ? (
          <div className='settings-empty-text'>{error}</div>
        ) : suggestions.length === 0 ? (
          <div className='settings-empty-text'>
            No unmerged album versions found.
          </div>
        ) : (
          <div className='settings-discovery-list'>
            {suggestions.slice(0, visibleCount).map(suggestion => (
              <div key={suggestion.id} className='settings-discovery-item'>
                <div className='settings-discovery-info'>
                  <div className='album-merge-title'>
                    {suggestion.target.artist} — {suggestion.target.album}
                    {suggestion.target.collectionId > 0 && (
                      <Badge variant='success' size='small'>
                        In collection
                      </Badge>
                    )}
                  </div>
                  <ul className='album-merge-versions'>
                    {suggestion.versions.map(version => (
                      <li
                        key={`${version.artist}|${version.album}`}
                        className='album-merge-version'
                      >
                        <span className='album-merge-version-name'>
                          {version.artist} — {version.album}
                        </span>
                        <span className='album-merge-version-plays'>
                          {version.playCount.toLocaleString()} plays
                        </span>
                        {version.isTarget && (
                          <Badge variant='info' size='small'>
                            Merge target
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                  <div className='settings-mapping-meta'>
                    {suggestion.totalPlays.toLocaleString()} plays in total
                  </div>
                </div>
                <div className='settings-suggestion-actions'>
                  <Button
                    size='small'
                    onClick={() => handleMerge(suggestion)}
                    disabled={busyId !== null}
                    loading={busyId === suggestion.id}
                  >
                    Merge
                  </Button>
                  <Button
                    variant='secondary'
                    size='small'
                    onClick={() => handleDismiss(suggestion)}
                    disabled={busyId !== null}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            ))}
            {suggestions.length > visibleCount && (
              <Button
                variant='outline'
                size='small'
                onClick={() => setVisibleCount(count => count + PAGE_SIZE)}
              >
                Show more ({suggestions.length - visibleCount} remaining)
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AlbumMergeSuggestionsCard;
