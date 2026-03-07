import React, { useCallback } from 'react';

import { RecommendationResult } from '../../../shared/types';
import { Button } from '../ui/Button';
import { ProgressBar } from '../ui/ProgressBar';

interface RecommendationCardProps {
  recommendation: RecommendationResult;
  onFeedback: (
    releaseId: number,
    action: 'played' | 'skipped' | 'not_interested',
    releaseTitle: string
  ) => void;
  onNavigate: (releaseId: number) => void;
}

const RecommendationCard: React.FC<RecommendationCardProps> = React.memo(
  ({ recommendation, onFeedback, onNavigate }) => {
    const { release, score, explanation } = recommendation;

    const handleNavigate = useCallback(() => {
      onNavigate(release.id);
    }, [onNavigate, release.id]);

    const handlePlayed = useCallback(() => {
      onFeedback(release.id, 'played', release.title);
    }, [onFeedback, release.id, release.title]);

    const handleNotInterested = useCallback(() => {
      onFeedback(release.id, 'not_interested', release.title);
    }, [onFeedback, release.id, release.title]);

    const scorePercent = Math.round(score * 100);

    const coverStyle = release.cover_image
      ? { backgroundImage: `url(${release.cover_image})` }
      : {};

    return (
      <div className='recommendation-card'>
        <button
          className='recommendation-card__image'
          style={coverStyle}
          onClick={handleNavigate}
          aria-label={`View details for ${release.title} by ${release.artist}`}
        >
          {!release.cover_image && (
            <span className='recommendation-card__image-placeholder'>
              &#9835;
            </span>
          )}
        </button>

        <div className='recommendation-card__info'>
          <button
            className='recommendation-card__title'
            onClick={handleNavigate}
            aria-label={`View ${release.title}`}
          >
            {release.title}
          </button>
          <div className='recommendation-card__artist'>{release.artist}</div>
          {release.year && (
            <div className='recommendation-card__year'>{release.year}</div>
          )}

          <div className='recommendation-card__score'>
            <span className='recommendation-card__score-label'>
              Match: {scorePercent}%
            </span>
            <ProgressBar
              value={scorePercent}
              max={100}
              variant={
                scorePercent >= 70
                  ? 'success'
                  : scorePercent >= 40
                    ? 'warning'
                    : 'primary'
              }
              size='small'
              aria-label={`Match score: ${scorePercent}%`}
            />
          </div>

          {explanation && (
            <p className='recommendation-card__explanation'>{explanation}</p>
          )}
        </div>

        <div className='recommendation-card__actions'>
          <Button
            variant='success'
            size='small'
            onClick={handlePlayed}
            aria-label={`Mark ${release.title} as played`}
          >
            I played this
          </Button>
          <Button
            variant='ghost'
            size='small'
            onClick={handleNotInterested}
            aria-label={`Mark ${release.title} as not interested`}
          >
            Not interested
          </Button>
        </div>
      </div>
    );
  }
);

RecommendationCard.displayName = 'RecommendationCard';

export default RecommendationCard;
