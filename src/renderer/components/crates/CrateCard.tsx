import { Archive, CircleHelp, Disc3, Pin } from 'lucide-react';
import React from 'react';

import { CrateSummary } from '../../../shared/types';
import { Badge, IconButton } from '../ui';

import './CrateCard.css';

export interface CrateCardProps {
  crate: CrateSummary;
  pinBusy?: boolean;
  onOpen: (crate: CrateSummary) => void;
  onTogglePin: (crate: CrateSummary) => void;
}

const MOSAIC_SIZE = 4;

/** A crate in the list: cover mosaic, name, count, badges and pin toggle */
const CrateCard: React.FC<CrateCardProps> = ({
  crate,
  pinBusy = false,
  onOpen,
  onTogglePin,
}) => {
  const covers = crate.sampleCovers.slice(0, MOSAIC_SIZE);
  const pinLabel = crate.pinnedToWhatToPlay
    ? `Unpin ${crate.name} from What to Play`
    : `Pin ${crate.name} to What to Play`;

  return (
    <article className='crate-card'>
      <button
        type='button'
        className='crate-card-open'
        onClick={() => onOpen(crate)}
        aria-label={`Open crate ${crate.name}`}
      >
        <div className='crate-card-mosaic' aria-hidden='true'>
          {Array.from({ length: MOSAIC_SIZE }).map((_, i) =>
            covers[i] ? (
              <img key={i} src={covers[i]} alt='' loading='lazy' />
            ) : (
              <span key={i} className='crate-card-mosaic-empty'>
                {i === 0 && covers.length === 0 && (
                  <Disc3 size={20} aria-hidden='true' />
                )}
              </span>
            )
          )}
        </div>
        <div className='crate-card-body'>
          <h3 className='crate-card-name'>{crate.name}</h3>
          <p className='crate-card-count'>
            {crate.count.toLocaleString('en-US')}{' '}
            {crate.count === 1 ? 'album' : 'albums'}
          </p>
          {crate.description && (
            <p className='crate-card-description'>{crate.description}</p>
          )}
          {(crate.unknownCount > 0 ||
            crate.staleOverrideCount > 0 ||
            crate.pinnedToWhatToPlay) && (
            <div className='crate-card-badges'>
              {crate.pinnedToWhatToPlay && (
                <Badge
                  size='small'
                  pill
                  variant='primary'
                  icon={<Pin size={12} aria-hidden='true' />}
                >
                  What to Play
                </Badge>
              )}
              {crate.unknownCount > 0 && (
                <Badge
                  size='small'
                  pill
                  variant='warning'
                  icon={<CircleHelp size={12} aria-hidden='true' />}
                >
                  {crate.unknownCount.toLocaleString('en-US')} might match
                </Badge>
              )}
              {crate.staleOverrideCount > 0 && (
                <Badge
                  size='small'
                  pill
                  variant='secondary'
                  icon={<Archive size={12} aria-hidden='true' />}
                >
                  {crate.staleOverrideCount.toLocaleString('en-US')} no longer
                  owned
                </Badge>
              )}
            </div>
          )}
        </div>
      </button>
      <IconButton
        className='crate-card-pin'
        size='small'
        variant={crate.pinnedToWhatToPlay ? 'primary' : 'ghost'}
        icon={<Pin size={16} aria-hidden='true' />}
        aria-label={pinLabel}
        aria-pressed={crate.pinnedToWhatToPlay}
        title={pinLabel}
        disabled={pinBusy}
        onClick={() => onTogglePin(crate)}
      />
    </article>
  );
};

export default CrateCard;
