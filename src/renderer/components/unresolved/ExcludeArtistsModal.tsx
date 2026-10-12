import { Ban } from 'lucide-react';
import React, { useCallback, useRef } from 'react';

import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

import './ExcludeArtistsModal.css';
import { formatCount, pluralize } from './unresolvedFormat';

/** An artist the user is about to stop tracking. */
export interface ExcludeTarget {
  /** Normalized artist key */
  artist: string;
  artistName: string;
  /** Plays without album info, when known */
  unresolvedPlays?: number;
  /** Plays that do have album info, when known (from a suggestion) */
  albumPlays?: number;
}

export interface ExcludeArtistsModalProps {
  /** Artists to confirm; null keeps the modal closed */
  targets: ExcludeTarget[] | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (targets: ExcludeTarget[]) => void;
}

const describeAlbumPlays = (target: ExcludeTarget): string => {
  if (target.albumPlays === undefined) {
    return ', including any plays with album info';
  }
  if (target.albumPlays > 0) {
    return `, including ${pluralize(target.albumPlays, 'play')} with album info`;
  }
  return '';
};

/** Confirms leaving one or more artists out of all listening stats. */
export const ExcludeArtistsModal: React.FC<ExcludeArtistsModalProps> = ({
  targets,
  busy,
  onCancel,
  onConfirm,
}) => {
  // The Modal's focus trap keeps the first onClose it sees (Escape), so the
  // close handler must be stable and read the latest busy/onCancel.
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const handleClose = useCallback(() => {
    if (!busyRef.current) onCancelRef.current();
  }, []);

  if (!targets || targets.length === 0) return null;

  const single = targets.length === 1 ? targets[0] : null;
  const title = single
    ? `Stop tracking ${single.artistName}?`
    : `Stop tracking ${formatCount(targets.length)} artists?`;

  const footer = (
    <>
      <Button variant='secondary' onClick={onCancel} disabled={busy}>
        Cancel
      </Button>
      <Button
        variant='danger'
        onClick={() => onConfirm(targets)}
        loading={busy}
        iconLeft={<Ban size={16} aria-hidden='true' />}
      >
        {single ? "Don't track" : "Don't track any of them"}
      </Button>
    </>
  );

  return (
    <Modal
      isOpen
      onClose={handleClose}
      title={title}
      size='small'
      footer={footer}
    >
      <div className='exclude-modal'>
        {single ? (
          <p className='exclude-modal-text'>
            Its plays will be left out of all listening stats (totals, streaks,
            top artists and tracks, Wrapped){describeAlbumPlays(single)}.
          </p>
        ) : (
          <>
            <p className='exclude-modal-text'>
              Their plays will be left out of all listening stats (totals,
              streaks, top artists and tracks, Wrapped), including plays with
              album info:
            </p>
            <ul className='exclude-modal-list' aria-label='Artists to exclude'>
              {targets.map(target => (
                <li key={target.artist} className='exclude-modal-list-item'>
                  <span className='exclude-modal-artist'>
                    {target.artistName}
                  </span>
                  {target.unresolvedPlays !== undefined && (
                    <span className='exclude-modal-plays'>
                      {pluralize(
                        target.unresolvedPlays + (target.albumPlays ?? 0),
                        'play'
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className='exclude-modal-hint'>
          Plays stay in your stored history, so you can undo this any time from
          the Not tracked list.
        </p>
      </div>
    </Modal>
  );
};

export default ExcludeArtistsModal;
