import React from 'react';

import { MilestoneInfo } from '../../../shared/types';

interface MilestoneProgressProps {
  milestones: MilestoneInfo;
}

/**
 * Progress bar showing progress toward next scrobble milestone
 */
export const MilestoneProgress: React.FC<MilestoneProgressProps> = ({
  milestones,
}) => {
  const formatNumber = (n: number): string => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
    return n.toLocaleString();
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  return (
    <div className='milestone-progress'>
      <div className='milestone-progress-header'>
        <div>
          <h3>Milestone Progress</h3>
          <p className='milestone-progress-description'>
            Track your journey to the next scrobble milestone (1K, 5K, 10K,
            25K...)
          </p>
        </div>
        <span className='milestone-progress-total'>
          {milestones.total.toLocaleString()} total scrobbles
        </span>
      </div>

      <div className='milestone-progress-bar-container'>
        <div className='milestone-progress-labels'>
          <span>{formatNumber(milestones.total)}</span>
          <span>{formatNumber(milestones.nextMilestone)}</span>
        </div>
        <div className='milestone-progress-bar'>
          <div
            className='milestone-progress-bar-fill'
            style={{ width: `${milestones.progressPercent}%` }}
          />
        </div>
        <div className='milestone-progress-remaining'>
          {milestones.scrobblesToNext.toLocaleString()} scrobbles to reach{' '}
          {formatNumber(milestones.nextMilestone)}
        </div>
      </div>

      {milestones.history.length > 0 && (
        <div className='milestone-history'>
          <h4>Milestones Reached</h4>
          <ul className='milestone-history-list'>
            {milestones.history.map(({ milestone, reachedAt }) => (
              <li key={milestone} className='milestone-history-item'>
                <span className='milestone-history-badge'>
                  🏆 {formatNumber(milestone)}
                </span>
                <span className='milestone-history-date'>
                  {formatDate(reachedAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default MilestoneProgress;
