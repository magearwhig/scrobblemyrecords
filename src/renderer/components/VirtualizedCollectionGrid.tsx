import { useVirtualizer } from '@tanstack/react-virtual';
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import {
  AlbumPlayCountResult,
  CollectionItem,
  DiscogsRelease,
} from '../../shared/types';

import AlbumCard from './AlbumCard';

interface VirtualizedCollectionGridProps {
  items: CollectionItem[];
  selectedAlbums: Set<number>;
  discardPileIds: Set<number>;
  onAlbumSelect: (releaseId: number) => void;
  onViewDetails: (release: DiscogsRelease, item: CollectionItem) => void;
  onAddToDiscardPile: (item: CollectionItem) => void;
  playCounts?: Map<string, AlbumPlayCountResult>;
  getPlayCountKey?: (artist: string, title: string) => string;
  /** Scroll offset to restore once the column count has been measured */
  initialScrollTop?: number;
  onInitialScrollApplied?: () => void;
}

const CARD_MIN_WIDTH = 280;
const CARD_GAP = 24; // 1.5rem
const ROW_HEIGHT = 400; // Slightly above min-height: 380px + gap

const getColumnCount = (width: number): number =>
  Math.max(1, Math.floor((width + CARD_GAP) / (CARD_MIN_WIDTH + CARD_GAP)));

const VirtualizedCollectionGrid: React.FC<VirtualizedCollectionGridProps> = ({
  items,
  selectedAlbums,
  discardPileIds,
  onAlbumSelect,
  onViewDetails,
  onAddToDiscardPile,
  playCounts,
  getPlayCountKey,
  initialScrollTop,
  onInitialScrollApplied,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(4);

  const updateColumns = useCallback(() => {
    if (!scrollRef.current) return;
    const cols = getColumnCount(scrollRef.current.clientWidth);
    setColumns(prev => (prev === cols ? prev : cols));
  }, []);

  useEffect(() => {
    updateColumns();
    const observer = new ResizeObserver(updateColumns);
    if (scrollRef.current) {
      observer.observe(scrollRef.current);
    }
    return () => observer.disconnect();
  }, [updateColumns]);

  const rowCount = Math.ceil(items.length / columns);

  // Restore scroll only after columns match the container width; otherwise the
  // content height (and therefore the offset) would be wrong.
  const pendingScrollTopRef = useRef<number | null>(initialScrollTop || null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (pendingScrollTopRef.current === null || !el) return;
    if (getColumnCount(el.clientWidth) !== columns) return;
    el.scrollTop = pendingScrollTopRef.current;
    pendingScrollTopRef.current = null;
    onInitialScrollApplied?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns]);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 3,
  });

  return (
    <div ref={scrollRef} className='virtualized-collection-grid'>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map(virtualRow => {
          const startIndex = virtualRow.index * columns;
          const rowItems = items.slice(startIndex, startIndex + columns);

          return (
            <div
              key={virtualRow.key}
              className='collection-grid'
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {rowItems.map((item, colIndex) => {
                const pcKey = getPlayCountKey?.(
                  item.release.artist,
                  item.release.title
                );
                const pcData = pcKey ? playCounts?.get(pcKey) : undefined;
                return (
                  <AlbumCard
                    key={`${item.id}-${item.date_added || startIndex + colIndex}`}
                    item={item}
                    selected={selectedAlbums.has(item.release.id)}
                    onSelect={() => onAlbumSelect(item.release.id)}
                    onViewDetails={release => onViewDetails(release, item)}
                    isInDiscardPile={discardPileIds.has(item.id)}
                    onAddToDiscardPile={onAddToDiscardPile}
                    playCount={pcData?.playCount}
                    lastPlayed={pcData?.lastPlayed}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VirtualizedCollectionGrid;
