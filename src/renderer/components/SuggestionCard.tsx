import React, { useState } from 'react';

import { SuggestionResult, SuggestionFactors } from '../../shared/types';

interface SuggestionCardProps {
  suggestion: SuggestionResult;
  onDismiss?: (albumId: number) => void;
  showScore?: boolean;
}

const SuggestionCard: React.FC<SuggestionCardProps> = ({
  suggestion,
  onDismiss,
  showScore = false,
}) => {
  const [showFactors, setShowFactors] = useState(false);

  const { album, score, factors, reason } = suggestion;
  const { release } = album;

  const formatFactor = (
    name: keyof SuggestionFactors,
    value: number | boolean
  ): string => {
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }

    switch (name) {
      case 'recencyGap':
        if (value >= 365) return `${Math.floor(value / 365)}+ years`;
        if (value >= 30) return `${Math.floor(value / 30)} months`;
        return `${value} days`;
      case 'recentAddition':
        if (value < 7) return 'This week';
        if (value < 30) return `${Math.floor(value / 7)} weeks ago`;
        if (value < 365) return `${Math.floor(value / 30)} months ago`;
        return `${Math.floor(value / 365)} years ago`;
      case 'artistAffinity':
      case 'eraPreference':
      case 'timeOfDay':
      case 'albumCompleteness':
        return `${Math.round(value * 100)}%`;
      case 'userRating':
        return value > 0 ? `${value}/5` : 'Not rated';
      case 'diversityPenalty':
        return value > 0 ? `-${Math.round(value * 100)}%` : 'None';
      default:
        return String(value);
    }
  };

  const getFactorLabel = (name: keyof SuggestionFactors): string => {
    const labels: Record<keyof SuggestionFactors, string> = {
      recencyGap: 'Last Played',
      neverPlayed: 'Never Played',
      recentAddition: 'Added',
      artistAffinity: 'Artist Affinity',
      eraPreference: 'Era Preference',
      userRating: 'Your Rating',
      timeOfDay: 'Time Match',
      diversityPenalty: 'Diversity',
      albumCompleteness: 'Completion',
    };
    return labels[name] || name;
  };

  const handleViewInCollection = () => {
    // Navigate to collection with this album highlighted using hash routing
    window.location.hash = `collection?highlight=${album.id}`;
  };

  const handleViewDetails = () => {
    // Store the release data for the details page (use same key as AlbumCard in collection)
    console.log('[SuggestionCard] handleViewDetails called');
    console.log('[SuggestionCard] release object:', release);
    console.log(
      '[SuggestionCard] release.id:',
      release?.id,
      'release.title:',
      release?.title,
      'release.artist:',
      release?.artist
    );
    localStorage.setItem('selectedRelease', JSON.stringify(release));
    const stored = localStorage.getItem('selectedRelease');
    console.log(
      '[SuggestionCard] localStorage set, verifying:',
      stored ? JSON.parse(stored).title : 'null'
    );
    window.location.hash = 'release-details';
  };

  return (
    <div className='suggestion-card'>
      <div
        className='suggestion-card-cover'
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

      <div className='suggestion-card-content'>
        <div className='suggestion-card-title' title={release.title}>
          {release.title}
        </div>

        <div className='suggestion-card-artist' title={release.artist}>
          {release.artist}
        </div>

        <div className='suggestion-card-meta'>
          {release.year || 'Unknown Year'} •{' '}
          {release.format?.join(', ') || 'Unknown Format'}
        </div>

        <div className='suggestion-card-reason'>{reason}</div>

        {showScore && (
          <div className='suggestion-card-score'>Score: {score.toFixed(2)}</div>
        )}

        <button
          className='suggestion-factors-toggle'
          onClick={() => setShowFactors(!showFactors)}
        >
          {showFactors ? 'Hide details' : 'Why this suggestion?'}
        </button>

        {showFactors && (
          <div className='suggestion-factors'>
            <div className='suggestion-factors-grid'>
              {Object.entries(factors).map(([key, value]) => (
                <div key={key} className='suggestion-factor-item'>
                  <span className='suggestion-factor-name'>
                    {getFactorLabel(key as keyof SuggestionFactors)}:
                  </span>
                  <span className='suggestion-factor-value'>
                    {formatFactor(key as keyof SuggestionFactors, value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className='suggestion-card-actions'>
          <button className='btn btn-small' onClick={handleViewInCollection}>
            View in Collection
          </button>
          <button
            className='btn btn-small btn-secondary'
            onClick={handleViewDetails}
          >
            Details
          </button>
          {onDismiss && (
            <button
              className='btn btn-small btn-secondary'
              onClick={() => onDismiss(album.id)}
              title='Dismiss this suggestion'
            >
              Not now
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(SuggestionCard);
