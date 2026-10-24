import { Bot, Music, RefreshCw } from 'lucide-react';
import React, { useState } from 'react';

import { AISuggestion } from '../../shared/types';
import { navigate } from '../routes';

import { Button } from './ui/Button';

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

  const handleViewDetails = () => {
    if (release) {
      // Same keys as AlbumCard in the collection
      localStorage.setItem('selectedRelease', JSON.stringify(release));
      if (album) {
        localStorage.setItem('selectedCollectionItemId', album.id.toString());
      }
      navigate('release-details');
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
          <span className='ai-suggestion-empty-icon'>
            <Bot size={32} aria-hidden='true' />
          </span>
          <p>No AI suggestion available</p>
          {onRefresh && (
            <Button size='small' onClick={onRefresh}>
              Try Again
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className='ai-suggestion-card'>
      <div className='ai-suggestion-badge'>
        <span className='ai-badge-icon'>
          <Bot size={14} aria-hidden='true' />
        </span>
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
        {!release.cover_image && <Music size={32} aria-hidden='true' />}
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
          <Button size='small' onClick={handleViewDetails}>
            Open release
          </Button>
          {onRefresh && (
            <Button
              variant='secondary'
              size='small'
              onClick={onRefresh}
              title='Get another AI suggestion'
              aria-label='Get another AI suggestion'
            >
              <RefreshCw size={14} aria-hidden='true' />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(AISuggestionCard);
