import React from 'react';

import { SuggestionWeights } from '../../shared/types';

interface WeightControlsProps {
  weights: SuggestionWeights;
  onChange: (weights: SuggestionWeights) => void;
  onReset: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

const WEIGHT_INFO: Record<
  keyof SuggestionWeights,
  { label: string; description: string }
> = {
  recencyGap: {
    label: 'Recency Gap',
    description: 'Prioritize albums not played recently',
  },
  neverPlayed: {
    label: 'Never Played',
    description: 'Boost albums never scrobbled',
  },
  recentAddition: {
    label: 'Recent Addition',
    description: 'Prioritize recently added to collection',
  },
  artistAffinity: {
    label: 'Artist Affinity',
    description: 'Favor artists you listen to frequently',
  },
  eraPreference: {
    label: 'Era Preference',
    description: 'Match your decade listening preferences',
  },
  userRating: {
    label: 'Your Rating',
    description: 'Prioritize highly rated albums',
  },
  timeOfDay: {
    label: 'Time of Day',
    description: 'Match your listening time patterns',
  },
  diversityPenalty: {
    label: 'Diversity Penalty',
    description: 'Penalize recently suggested albums',
  },
  albumCompleteness: {
    label: 'Album Completeness',
    description: 'Favor albums you typically play in full',
  },
};

const SuggestionWeightControls: React.FC<WeightControlsProps> = ({
  weights,
  onChange,
  onReset,
  collapsed = false,
  onToggleCollapsed,
}) => {
  const handleWeightChange = (key: keyof SuggestionWeights, value: number) => {
    onChange({
      ...weights,
      [key]: value,
    });
  };

  if (collapsed && onToggleCollapsed) {
    return (
      <div className='weight-controls weight-controls-collapsed'>
        <button
          className='btn btn-small btn-secondary'
          onClick={onToggleCollapsed}
        >
          Show Weight Controls
        </button>
      </div>
    );
  }

  return (
    <div className='weight-controls'>
      <div className='weight-controls-header'>
        <h3>Suggestion Weights</h3>
        <div className='weight-controls-actions'>
          <button
            className='btn btn-small btn-secondary'
            onClick={onReset}
            title='Reset all weights to defaults'
          >
            Reset
          </button>
          {onToggleCollapsed && (
            <button
              className='btn btn-small btn-secondary'
              onClick={onToggleCollapsed}
            >
              Hide
            </button>
          )}
        </div>
      </div>

      {Object.entries(WEIGHT_INFO).map(([key, info]) => {
        const weightKey = key as keyof SuggestionWeights;
        const value = weights[weightKey];

        return (
          <div key={key} className='weight-slider-group'>
            <div className='weight-slider-label'>
              <span className='weight-slider-name' title={info.description}>
                {info.label}
              </span>
              <span className='weight-slider-value'>{value.toFixed(1)}</span>
            </div>
            <input
              type='range'
              className='weight-slider'
              min='0'
              max='2'
              step='0.1'
              value={value}
              onChange={e =>
                handleWeightChange(weightKey, parseFloat(e.target.value))
              }
              title={info.description}
            />
          </div>
        );
      })}

      <div className='weight-controls-footer'>
        <p className='weight-controls-hint'>
          Higher values increase factor importance. Set to 0 to disable.
        </p>
      </div>
    </div>
  );
};

export default SuggestionWeightControls;
