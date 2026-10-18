import { Archive, Trash2 } from 'lucide-react';
import React, { useState } from 'react';

import { CrateOverride } from '../../../shared/types';
import { phrase } from '../../../shared/utils/crateCopy';
import { Button, Modal } from '../ui';

import CrateCover from './CrateCover';
import './CrateStaleOverrides.css';

export interface CrateStaleOverridesProps {
  overrides: CrateOverride[];
  /** Removing is refused while the collection snapshot is incomplete */
  collectionComplete: boolean;
  busy?: boolean;
  onRemoveAll: () => void;
}

/**
 * Includes/excludes that point at records no longer in the collection
 * (plan section 9), with "Remove all".
 */
const CrateStaleOverrides: React.FC<CrateStaleOverridesProps> = ({
  overrides,
  collectionComplete,
  busy = false,
  onRemoveAll,
}) => {
  const [confirming, setConfirming] = useState(false);

  if (overrides.length === 0) return null;

  return (
    <section className='crate-stale' aria-labelledby='crate-stale-title'>
      <div className='crate-stale-header'>
        <h3 id='crate-stale-title' className='crate-stale-title'>
          <Archive size={16} aria-hidden='true' />
          No longer in your collection
        </h3>
        <Button
          size='small'
          variant='secondary'
          iconLeft={<Trash2 size={16} aria-hidden='true' />}
          onClick={() => setConfirming(true)}
          disabled={!collectionComplete || busy}
          loading={busy}
        >
          Remove all
        </Button>
      </div>
      <p className='crate-stale-note'>
        {collectionComplete
          ? 'Your choices for these records are kept in case they come back.'
          : 'Available once your collection has finished loading.'}
      </p>
      <ul className='crate-stale-list'>
        {overrides.map(override => (
          <li key={override.id}>
            <CrateCover
              url={override.snapshot.coverUrl}
              title={override.snapshot.title}
              size='small'
            />
            <span className='crate-stale-text'>
              <span className='crate-stale-album'>
                {override.snapshot.title}
              </span>
              <span className='crate-stale-artist'>
                {override.snapshot.artist}
              </span>
            </span>
            <span className='crate-stale-action'>
              {override.action === 'include'
                ? phrase('membership.included')
                : phrase('membership.excluded')}
            </span>
          </li>
        ))}
      </ul>
      <Modal
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        title='Remove choices for these records?'
        size='small'
        footer={
          <>
            <Button variant='secondary' onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              variant='danger'
              onClick={() => {
                setConfirming(false);
                onRemoveAll();
              }}
            >
              Remove {overrides.length}
            </Button>
          </>
        }
      >
        <p className='crate-stale-confirm-text'>
          Your include/exclude choices for these records will be removed. If one
          of them is still on your shelf, your collection may not have fully
          refreshed yet: cancel and try again later.
        </p>
        <ul className='crate-stale-confirm-list' aria-label='Records to remove'>
          {overrides.map(override => (
            <li key={override.id}>
              <span className='crate-stale-album'>
                {override.snapshot.title}
              </span>
              <span className='crate-stale-artist'>
                {override.snapshot.artist}
              </span>
            </li>
          ))}
        </ul>
      </Modal>
    </section>
  );
};

export default CrateStaleOverrides;
