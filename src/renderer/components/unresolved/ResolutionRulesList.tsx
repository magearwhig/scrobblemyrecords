import { ArrowRight, Undo2 } from 'lucide-react';
import React from 'react';

import { UnresolvedTrackResolution } from '../../../shared/types';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ListItemSkeleton } from '../ui/Skeleton';

import './ResolutionRulesList.css';
import { formatDateMs } from './unresolvedFormat';

export interface ResolutionRulesListProps {
  rules: UnresolvedTrackResolution[];
  loading: boolean;
  /** Id of the rule currently being removed */
  removingId: string | null;
  onUndo: (rule: UnresolvedTrackResolution) => void;
}

/** Existing "artist + track -> album" rules, each with an Undo action. */
export const ResolutionRulesList: React.FC<ResolutionRulesListProps> = ({
  rules,
  loading,
  removingId,
  onUndo,
}) => {
  return (
    <section
      id='unresolved-rules-panel'
      className='card unresolved-rules'
      aria-labelledby='unresolved-rules-title'
    >
      <h3 id='unresolved-rules-title' className='unresolved-rules-title'>
        Album rules
      </h3>
      <p className='unresolved-rules-description'>
        Each rule attributes an artist and track to an album. Undo a rule to
        return its plays to the unresolved list.
      </p>

      {loading && rules.length === 0 && <ListItemSkeleton count={3} />}

      {!loading && rules.length === 0 && (
        <p className='unresolved-rules-empty'>No rules yet.</p>
      )}

      {rules.length > 0 && (
        <ul className='unresolved-rules-list'>
          {rules.map(rule => (
            <li key={rule.id} className='unresolved-rules-item'>
              <div className='unresolved-rules-item-text'>
                <span className='unresolved-rules-item-source'>
                  {rule.artist} – {rule.track}
                </span>
                <ArrowRight
                  size={16}
                  aria-hidden='true'
                  className='unresolved-rules-item-arrow'
                />
                <span className='unresolved-rules-item-album'>
                  {rule.album}
                </span>
                {rule.source === 'lastfm-track-info' && (
                  <Badge size='small' variant='info'>
                    Last.fm
                  </Badge>
                )}
                <span className='unresolved-rules-item-date'>
                  {formatDateMs(rule.createdAt)}
                </span>
              </div>
              <Button
                variant='ghost'
                size='small'
                onClick={() => onUndo(rule)}
                loading={removingId === rule.id}
                aria-label={`Undo rule for ${rule.track} by ${rule.artist}`}
                iconLeft={<Undo2 size={16} aria-hidden='true' />}
              >
                Undo
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default ResolutionRulesList;
