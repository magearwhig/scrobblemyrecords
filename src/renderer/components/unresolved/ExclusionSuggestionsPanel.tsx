import { Ban, ChevronDown, ChevronUp, Podcast } from 'lucide-react';
import React, { useState } from 'react';

import { ExclusionSuggestion } from '../../../shared/types';
import { Button } from '../ui/Button';

import './ExclusionSuggestionsPanel.css';
import { pluralize } from './unresolvedFormat';

/** A signal at or above this share is worth mentioning on its own. */
const STRONG_SIGNAL = 0.5;

const percent = (share: number): string => `${Math.round(share * 100)}%`;

/** Short, human reason why an artist looks like a podcast. */
export const suggestionReason = (suggestion: ExclusionSuggestion): string => {
  const reasons: string[] = [];
  const unresolved = `${percent(suggestion.unresolvedShare)} without album info`;
  const episodes = `${percent(suggestion.episodeTitleShare)} episode-like titles`;
  if (suggestion.unresolvedShare >= STRONG_SIGNAL) reasons.push(unresolved);
  if (suggestion.episodeTitleShare >= STRONG_SIGNAL) reasons.push(episodes);
  if (reasons.length === 0) {
    reasons.push(
      suggestion.episodeTitleShare > suggestion.unresolvedShare
        ? episodes
        : unresolved
    );
  }
  return reasons.join(' · ');
};

export interface ExclusionSuggestionsPanelProps {
  suggestions: ExclusionSuggestion[];
  /** Disable actions while an exclusion is in flight */
  busy: boolean;
  onExclude: (suggestion: ExclusionSuggestion) => void;
  onExcludeAll: () => void;
}

/** "Looks like a podcast" suggestions, each with an Exclude action. */
export const ExclusionSuggestionsPanel: React.FC<
  ExclusionSuggestionsPanelProps
> = ({ suggestions, busy, onExclude, onExcludeAll }) => {
  const [open, setOpen] = useState(true);

  if (suggestions.length === 0) return null;

  return (
    <section
      className='card unresolved-suggestions'
      aria-labelledby='unresolved-suggestions-title'
    >
      <div className='unresolved-suggestions-header'>
        <h3
          id='unresolved-suggestions-title'
          className='unresolved-suggestions-title'
        >
          <Podcast size={20} aria-hidden='true' />
          Looks like a podcast ({suggestions.length})
        </h3>
        <div className='unresolved-suggestions-header-actions'>
          {open && suggestions.length > 1 && (
            <Button
              variant='secondary'
              size='small'
              onClick={onExcludeAll}
              disabled={busy}
              iconLeft={<Ban size={16} aria-hidden='true' />}
            >
              Exclude all
            </Button>
          )}
          <Button
            variant='ghost'
            size='small'
            onClick={() => setOpen(value => !value)}
            aria-expanded={open}
            aria-controls='unresolved-suggestions-list'
            iconLeft={
              open ? (
                <ChevronUp size={16} aria-hidden='true' />
              ) : (
                <ChevronDown size={16} aria-hidden='true' />
              )
            }
          >
            {open ? 'Collapse' : 'Expand'}
          </Button>
        </div>
      </div>

      {open && (
        <div id='unresolved-suggestions-list'>
          <p className='unresolved-suggestions-description'>
            These artists&apos; plays look like podcast episodes. Excluding an
            artist leaves all of its plays out of your listening stats.
          </p>
          <ul className='unresolved-suggestions-list'>
            {suggestions.map(suggestion => (
              <li
                key={suggestion.artist}
                className='unresolved-suggestions-item'
              >
                <div className='unresolved-suggestions-item-info'>
                  <span className='unresolved-suggestions-item-name'>
                    {suggestion.artistName}
                  </span>
                  <span className='unresolved-suggestions-item-meta'>
                    {pluralize(suggestion.plays, 'play')} ·{' '}
                    {pluralize(suggestion.distinctTracks, 'track')}
                  </span>
                  <span className='unresolved-suggestions-item-reason'>
                    {suggestionReason(suggestion)}
                  </span>
                </div>
                <Button
                  variant='secondary'
                  size='small'
                  onClick={() => onExclude(suggestion)}
                  disabled={busy}
                  aria-label={`Exclude ${suggestion.artistName}`}
                  iconLeft={<Ban size={16} aria-hidden='true' />}
                >
                  Exclude
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

export default ExclusionSuggestionsPanel;
