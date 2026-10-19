import { ChevronDown, ChevronRight, EyeOff } from 'lucide-react';
import React, { useId, useState } from 'react';

import { CrateAlbumResult, CrateRule } from '../../../shared/types';
import { phrase } from '../../../shared/utils/crateCopy';

import CrateAlbumList from './CrateAlbumList';
import './CrateExcludedSection.css';

export interface CrateExcludedSectionProps {
  albums: CrateAlbumResult[];
  rules: CrateRule[];
  historyFrom?: number | null;
  busyKeys?: ReadonlySet<string>;
  onRestore: (album: CrateAlbumResult) => void;
  onInclude: (album: CrateAlbumResult) => void;
  onOpenRelease: (album: CrateAlbumResult) => void;
}

/** Collapsed "Excluded by you" list with Restore (plan section 6) */
const CrateExcludedSection: React.FC<CrateExcludedSectionProps> = ({
  albums,
  rules,
  historyFrom,
  busyKeys,
  onRestore,
  onInclude,
  onOpenRelease,
}) => {
  const [open, setOpen] = useState(false);
  const listId = useId();

  if (albums.length === 0) return null;

  return (
    <section className='crate-excluded'>
      <button
        type='button'
        className='crate-section-toggle'
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(value => !value)}
      >
        {open ? (
          <ChevronDown size={16} aria-hidden='true' />
        ) : (
          <ChevronRight size={16} aria-hidden='true' />
        )}
        <EyeOff size={16} aria-hidden='true' />
        <span>{phrase('membership.excluded')}</span>
        <span className='crate-section-count'>{albums.length}</span>
      </button>
      {open && (
        <div id={listId} className='crate-excluded-body'>
          <CrateAlbumList
            albums={albums}
            rules={rules}
            historyFrom={historyFrom}
            busyKeys={busyKeys}
            variant='excluded'
            label={phrase('membership.excluded')}
            onReset={onRestore}
            onInclude={onInclude}
            onExclude={() => undefined}
            onOpenRelease={onOpenRelease}
          />
        </div>
      )}
    </section>
  );
};

export default CrateExcludedSection;
