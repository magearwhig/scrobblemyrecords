import React, { useState } from 'react';

import { AISuggestion } from '../../shared/types';

interface AISuggestionCardProps {
  suggestion: AISuggestion;
  loading?: boolean;
  onRefresh?: () => void;
}

const AISuggestionCard: React.FC<AISuggestionCardProps> = ({
  suggestion,
  loading = false,
  onRefresh,
}) => {
  const [showReasoning, setShowReasoning] = useState(false);

  const { album, reasoning, confidence, mood } = suggestion;
  const release = album?.release;

  const handleViewInCollection = () => {
    if (album?.id) {
      window.location.hash = `collection?highlight=${album.id}`;
    }
  };

  const handleViewDetails = () => {
    if (release) {
      // Store the release data for the details page (use same key as AlbumCard in collection)
      console.log('[AISuggestionCard] handleViewDetails called');
      console.log(
        '[AISuggestionCard] release.id:',
        release.id,
        'release.title:',
        release.title,
        'release.artist:',
        release.artist
      );
      localStorage.setItem('selectedRelease', JSON.stringify(release));
      const stored = localStorage.getItem('selectedRelease');
      console.log(
        '[AISuggestionCard] localStorage set, verifying:',
        stored ? JSON.parse(stored).title : 'null'
      );
      window.location.hash = 'release-details';
    }
  };

  const getConfidenceLabel = (conf: 'high' | 'medium' | 'low'): string => {
    const labels = {
      high: 'High confidence',
      medium: 'Medium confidence',
      low: 'Low confidence',
    };
    return labels[conf] || 'Unknown';
  };

  const getConfidenceClass = (conf: 'high' | 'medium' | 'low'): string => {
    return conf || 'low';
  };

  if (loading) {
    return (
      <div className='ai-suggestion-card ai-suggestion-loading'>
        <div className='ai-suggestion-loading-content'>
          <div className='ai-suggestion-loading-spinner'></div>
          <span>AI is thinking...</span>
        </div>
      </div>
    );
  }

  if (!album || !release) {
    return (
      <div className='ai-suggestion-card ai-suggestion-empty'>
        <div className='ai-suggestion-empty-content'>
          <span className='ai-suggestion-empty-icon'>🤖</span>
          <p>No AI suggestion available</p>
          {onRefresh && (
            <button className='btn btn-small' onClick={onRefresh}>
              Try Again
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className='ai-suggestion-card'>
      <div className='ai-suggestion-badge'>
        <span className='ai-badge-icon'>🤖</span>
        <span className='ai-badge-text'>AI Pick</span>
        {mood && <span className='ai-badge-mood'>{mood}</span>}
      </div>

      <div
        className='ai-suggestion-cover'
        onClick={handleViewDetails}
        style={{
          backgroundImage: release.cover_image
            ? `url(${release.cover_image})`
            : 'none',
        }}
        title='View album details'
      >
        {!release.cover_image && '🎵'}
      </div>

      <div className='ai-suggestion-content'>
        <div className='ai-suggestion-title' title={release.title}>
          {release.title}
        </div>

        <div className='ai-suggestion-artist' title={release.artist}>
          {release.artist}
        </div>

        <div className='ai-suggestion-meta'>
          {release.year || 'Unknown Year'} •{' '}
          {release.format?.join(', ') || 'Unknown Format'}
        </div>

        <div className='ai-suggestion-confidence'>
          <span
            className={`ai-confidence-indicator ${getConfidenceClass(confidence)}`}
          ></span>
          <span className='ai-confidence-text'>
            {getConfidenceLabel(confidence)}
          </span>
        </div>

        <button
          className='ai-reasoning-toggle'
          onClick={() => setShowReasoning(!showReasoning)}
        >
          {showReasoning ? 'Hide AI reasoning' : 'Why did AI pick this?'}
        </button>

        {showReasoning && (
          <div className='ai-reasoning-panel'>
            <p className='ai-reasoning-text'>{reasoning}</p>
          </div>
        )}

        <div className='ai-suggestion-actions'>
          <button className='btn btn-small' onClick={handleViewInCollection}>
            View in Collection
          </button>
          <button
            className='btn btn-small btn-secondary'
            onClick={handleViewDetails}
          >
            Details
          </button>
          {onRefresh && (
            <button
              className='btn btn-small btn-secondary'
              onClick={onRefresh}
              title='Get another AI suggestion'
            >
              🔄
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(AISuggestionCard);
