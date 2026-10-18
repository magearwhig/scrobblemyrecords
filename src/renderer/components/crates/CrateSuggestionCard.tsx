import { Disc3, Eye, EyeOff, Plus, Sparkles } from 'lucide-react';
import React from 'react';

import { CrateSuggestion } from '../../../shared/types';
import { Button } from '../ui';

import './CrateSuggestionCard.css';

export interface CrateSuggestionCardProps {
  suggestion: CrateSuggestion;
  /** Which action is in flight for this card */
  busy?: 'add' | 'dismiss' | null;
  /** Disable actions while another card is busy */
  disabled?: boolean;
  onAdd: (suggestion: CrateSuggestion) => void;
  onDismiss: (suggestion: CrateSuggestion) => void;
  onPreview: (suggestion: CrateSuggestion) => void;
}

const MOSAIC_SIZE = 4;

/** One suggested crate: covers, name, reason, count and actions */
const CrateSuggestionCard: React.FC<CrateSuggestionCardProps> = ({
  suggestion,
  busy = null,
  disabled = false,
  onAdd,
  onDismiss,
  onPreview,
}) => {
  const covers = suggestion.sampleCovers.slice(0, MOSAIC_SIZE);
  const locked = disabled || busy !== null;

  return (
    <article
      className='crate-suggestion-card'
      aria-label={`Suggested crate ${suggestion.name}`}
    >
      <div className='crate-suggestion-top'>
        <div className='crate-suggestion-mosaic' aria-hidden='true'>
          {Array.from({ length: MOSAIC_SIZE }).map((_, i) =>
            covers[i] ? (
              <img key={i} src={covers[i]} alt='' loading='lazy' />
            ) : (
              <span key={i} className='crate-suggestion-mosaic-empty'>
                {i === 0 && covers.length === 0 && (
                  <Disc3 size={20} aria-hidden='true' />
                )}
              </span>
            )
          )}
        </div>
        <div className='crate-suggestion-body'>
          <span className='crate-suggestion-kicker'>
            <Sparkles size={12} aria-hidden='true' />
            Suggested
          </span>
          <h3 className='crate-suggestion-name'>{suggestion.name}</h3>
          <p className='crate-suggestion-count'>
            {suggestion.count.toLocaleString('en-US')}{' '}
            {suggestion.count === 1 ? 'album' : 'albums'}
          </p>
        </div>
      </div>
      <p className='crate-suggestion-reason'>{suggestion.reason}</p>
      <div className='crate-suggestion-actions'>
        <Button
          size='small'
          iconLeft={<Plus size={16} aria-hidden='true' />}
          loading={busy === 'add'}
          disabled={locked}
          onClick={() => onAdd(suggestion)}
          aria-label={`Add ${suggestion.name}`}
        >
          Add
        </Button>
        <Button
          size='small'
          variant='secondary'
          iconLeft={<Eye size={16} aria-hidden='true' />}
          disabled={locked}
          onClick={() => onPreview(suggestion)}
          aria-label={`Preview ${suggestion.name}`}
        >
          Preview
        </Button>
        <Button
          size='small'
          variant='ghost'
          iconLeft={<EyeOff size={16} aria-hidden='true' />}
          loading={busy === 'dismiss'}
          disabled={locked}
          onClick={() => onDismiss(suggestion)}
          aria-label={`Not interested in ${suggestion.name}`}
        >
          Not interested
        </Button>
      </div>
    </article>
  );
};

export default CrateSuggestionCard;
