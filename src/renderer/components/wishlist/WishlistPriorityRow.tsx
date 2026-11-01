import { DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import { ArrowUpToLine, GripVertical, Plus, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import { WishlistPriorityRecord } from '../../../shared/types';
import AlbumLink from '../AlbumLink';
import { Button } from '../ui/Button';

interface WishlistPriorityRowProps {
  record: WishlistPriorityRecord;
  /** Present when the row can be dragged */
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
  /** Put focus back on this row after it moved, without scrolling to it */
  takeFocus?: boolean;
  onFocusTaken?: () => void;
  onMove: (key: string, position: number) => void;
  onAdd: (key: string) => void;
  onRemove: (key: string) => void;
}

/** Click the number, type a position, press Enter */
const PositionControl: React.FC<{
  record: WishlistPriorityRecord;
  takeFocus?: boolean;
  onFocusTaken?: () => void;
  onMove: (key: string, position: number) => void;
}> = ({ record, takeFocus, onFocusTaken, onMove }) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const buttonRef = useRef<React.ComponentRef<'button'>>(null);
  const label = `${record.artist} – ${record.title}`;

  useEffect(() => {
    if (!takeFocus) return;
    buttonRef.current?.focus({ preventScroll: true });
    onFocusTaken?.();
  }, [takeFocus, onFocusTaken]);

  // Keyboard use: back on the button, not lost, when the field closes
  const refocus = useRef(false);
  useEffect(() => {
    if (!editing && refocus.current) {
      refocus.current = false;
      buttonRef.current?.focus({ preventScroll: true });
    }
  }, [editing]);

  const close = () => setEditing(false);

  if (!editing) {
    return (
      <button
        ref={buttonRef}
        type='button'
        className='wishlist-priority-position'
        aria-label={
          record.rank === null
            ? `Set a position for ${label}`
            : `Position ${record.rank}, change position of ${label}`
        }
        title='Click to type a position'
        onClick={() => {
          setValue(record.rank === null ? '' : String(record.rank));
          setEditing(true);
        }}
      >
        {record.rank ?? '–'}
      </button>
    );
  }

  return (
    <input
      type='number'
      min={1}
      autoFocus
      className='wishlist-priority-position-input'
      aria-label={`New position for ${label}`}
      value={value}
      onChange={e => setValue(e.target.value)}
      onFocus={e => e.target.select()}
      onBlur={close}
      onKeyDown={e => {
        if (e.key === 'Escape') {
          refocus.current = true;
          close();
        } else if (e.key === 'Enter') {
          // Focus returns to the button, which this Enter must not press
          e.preventDefault();
          refocus.current = true;
          const position = Number(value);
          close();
          if (Number.isInteger(position) && position >= 1) {
            onMove(record.key, position);
          }
        }
      }}
    />
  );
};

const WishlistPriorityRow: React.FC<WishlistPriorityRowProps> = ({
  record,
  dragHandleProps,
  takeFocus,
  onFocusTaken,
  onMove,
  onAdd,
  onRemove,
}) => {
  const label = `${record.artist} – ${record.title}`;
  const pressings = record.wantIds.length;

  return (
    <div className='wishlist-priority-row'>
      {dragHandleProps ? (
        <span
          {...dragHandleProps}
          className='wishlist-priority-handle'
          aria-label={`Drag ${label}`}
        >
          <GripVertical size={16} aria-hidden='true' />
        </span>
      ) : (
        <span className='wishlist-priority-handle-space' />
      )}
      <PositionControl
        record={record}
        takeFocus={takeFocus}
        onFocusTaken={onFocusTaken}
        onMove={onMove}
      />
      {record.coverImage ? (
        <img
          className='wishlist-priority-cover'
          src={record.coverImage}
          alt=''
          loading='lazy'
        />
      ) : (
        <span className='wishlist-priority-cover wishlist-priority-cover-empty' />
      )}
      <div className='wishlist-priority-name'>
        <AlbumLink
          artist={record.artist}
          album={record.title}
          className='wishlist-priority-title'
        />
        <span className='wishlist-priority-artist'>{record.artist}</span>
      </div>
      <div className='wishlist-priority-tags'>
        {pressings > 1 && (
          <span className='wishlist-priority-tag'>{pressings} pressings</span>
        )}
        {record.monitored && (
          <span className='wishlist-priority-tag'>Monitored</span>
        )}
      </div>
      <div className='wishlist-priority-actions'>
        {record.rank !== 1 && (
          <Button
            size='small'
            variant='secondary'
            iconLeft={<ArrowUpToLine size={16} aria-hidden='true' />}
            aria-label={`Move ${label} to the top`}
            title='Move to the top'
            onClick={() => onMove(record.key, 1)}
          >
            Top
          </Button>
        )}
        {record.rank === null ? (
          <Button
            size='small'
            variant='secondary'
            iconLeft={<Plus size={16} aria-hidden='true' />}
            aria-label={`Add ${label} to the end of your priorities`}
            title='Add to the end of your priorities'
            onClick={() => onAdd(record.key)}
          >
            Add
          </Button>
        ) : (
          <Button
            size='small'
            variant='secondary'
            iconLeft={<X size={16} aria-hidden='true' />}
            aria-label={`Remove priority from ${label}`}
            title='Remove priority (stays on your wishlist)'
            onClick={() => onRemove(record.key)}
          >
            Remove
          </Button>
        )}
      </div>
    </div>
  );
};

export default React.memo(WishlistPriorityRow);
