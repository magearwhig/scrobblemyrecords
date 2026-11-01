import {
  DragDropContext,
  Draggable,
  Droppable,
  DropResult,
} from '@hello-pangea/dnd';
import React, { useCallback, useMemo, useState } from 'react';

import './WishlistPriorityView.css';
import { WishlistPriorityRecord } from '../../../shared/types';
import { useWishlistPriorities } from '../../hooks/useWishlistPriorities';
import { Button } from '../ui/Button';

import BuyingShortlistPanel from './BuyingShortlistPanel';
import WishlistPriorityRow from './WishlistPriorityRow';

interface WishlistPriorityViewProps {
  priorities: ReturnType<typeof useWishlistPriorities>;
  serverUrl: string;
  currency: string;
  /** Text in the page's search box */
  searchQuery: string;
  matchesSearch: (artist: string, title: string) => boolean;
}

const WishlistPriorityView: React.FC<WishlistPriorityViewProps> = ({
  priorities,
  serverUrl,
  currency,
  searchQuery,
  matchesSearch,
}) => {
  const {
    snapshot,
    loaded,
    loadError,
    confirmedRanking,
    reload,
    move,
    remove,
  } = priorities;
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const searching = searchQuery.trim() !== '';

  const handleMove = useCallback(
    (key: string, position: number) => {
      setFocusKey(key);
      void move(key, position);
    },
    [move]
  );

  const clearFocusKey = useCallback(() => setFocusKey(null), []);

  const rankedCount = snapshot.ranked.length;
  const handleAdd = useCallback(
    (key: string) => handleMove(key, rankedCount + 1),
    [handleMove, rankedCount]
  );

  const handleRemove = useCallback(
    (key: string) => {
      setFocusKey(key);
      void remove(key);
    },
    [remove]
  );

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      const { destination, source, draggableId } = result;
      if (!destination || destination.index === source.index) return;
      handleMove(draggableId, destination.index + 1);
    },
    [handleMove]
  );

  const matching = useCallback(
    (records: WishlistPriorityRecord[]) =>
      records.filter(r => matchesSearch(r.artist, r.title)),
    [matchesSearch]
  );
  const ranked = useMemo(
    () => (searching ? matching(snapshot.ranked) : snapshot.ranked),
    [matching, searching, snapshot.ranked]
  );
  const unranked = useMemo(
    () => (searching ? matching(snapshot.unranked) : snapshot.unranked),
    [matching, searching, snapshot.unranked]
  );

  if (loadError && !rankedCount && !snapshot.unranked.length) {
    return (
      <div className='error-message' role='alert'>
        <p>{loadError}</p>
        <Button size='small' variant='secondary' onClick={() => void reload()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!loaded) {
    return <p className='wishlist-priority-hint'>Loading your priorities...</p>;
  }

  const row = (record: WishlistPriorityRecord) => (
    <WishlistPriorityRow
      record={record}
      takeFocus={focusKey === record.key}
      onFocusTaken={clearFocusKey}
      onMove={handleMove}
      onAdd={handleAdd}
      onRemove={handleRemove}
    />
  );

  return (
    <div className='wishlist-priority'>
      <BuyingShortlistPanel
        serverUrl={serverUrl}
        currency={currency}
        rankingKey={confirmedRanking}
      />
      <p className='wishlist-priority-summary'>
        {rankedCount} ranked · {snapshot.unranked.length} not ranked
      </p>
      <p className='wishlist-priority-hint'>
        {searching
          ? 'Dragging is off while searching. Top and the position number still work.'
          : 'Drag by the handle, click a number to type a position, or use Top.'}
      </p>

      {searching && !ranked.length && !unranked.length && (
        <div className='empty-state'>
          <p>No records match your search.</p>
        </div>
      )}

      {(ranked.length > 0 || !searching) && (
        <section aria-labelledby='wishlist-priority-ranked'>
          <h3
            id='wishlist-priority-ranked'
            className='wishlist-priority-heading'
          >
            Ranked
          </h3>
          {rankedCount === 0 && (
            <div className='empty-state'>
              <p>Nothing ranked yet. Click Top on the record you want most.</p>
            </div>
          )}
          {searching ? (
            <div role='list' className='wishlist-priority-list'>
              {ranked.map(record => (
                <div role='listitem' key={record.key}>
                  {row(record)}
                </div>
              ))}
            </div>
          ) : (
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId='wishlist-priority-ranked'>
                {droppable => (
                  <div
                    ref={droppable.innerRef}
                    {...droppable.droppableProps}
                    role='list'
                    className='wishlist-priority-list'
                  >
                    {ranked.map((record, index) => (
                      <Draggable
                        key={record.key}
                        draggableId={record.key}
                        index={index}
                      >
                        {(draggable, state) => (
                          <div
                            ref={draggable.innerRef}
                            {...draggable.draggableProps}
                            role='listitem'
                            className={
                              state.isDragging
                                ? 'wishlist-priority-dragging'
                                : undefined
                            }
                          >
                            <WishlistPriorityRow
                              record={record}
                              dragHandleProps={draggable.dragHandleProps}
                              takeFocus={focusKey === record.key}
                              onFocusTaken={clearFocusKey}
                              onMove={handleMove}
                              onAdd={handleAdd}
                              onRemove={handleRemove}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {droppable.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </section>
      )}

      {unranked.length > 0 && (
        <section aria-labelledby='wishlist-priority-unranked'>
          <h3
            id='wishlist-priority-unranked'
            className='wishlist-priority-heading'
          >
            Not ranked yet
          </h3>
          <div role='list' className='wishlist-priority-list'>
            {unranked.map(record => (
              <div role='listitem' key={record.key}>
                {row(record)}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default WishlistPriorityView;
