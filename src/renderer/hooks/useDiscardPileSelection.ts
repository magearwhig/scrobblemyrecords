import { useCallback, useState } from 'react';

import { DiscardPileItem, DiscardStatus } from '../../shared/types';

const HISTORY_STATUSES: DiscardStatus[] = [
  'sold',
  'gifted',
  'removed',
  'traded_in',
];

interface UseDiscardPileSelectionReturn {
  selectedIds: Set<string>;
  selectionMode: boolean;
  lastSelectedId: string | null;
  toggleSelectionMode: () => void;
  toggleSelect: (id: string, shiftKey: boolean) => void;
  clearSelection: () => void;
  selectableItems: (items: DiscardPileItem[]) => DiscardPileItem[];
  selectedItems: (allItems: DiscardPileItem[]) => DiscardPileItem[];
}

export function useDiscardPileSelection(
  filteredItems: DiscardPileItem[]
): UseDiscardPileSelectionReturn {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode(prev => {
      if (prev) {
        setSelectedIds(new Set());
        setLastSelectedId(null);
      }
      return !prev;
    });
  }, []);

  const toggleSelect = useCallback(
    (id: string, shiftKey: boolean) => {
      if (shiftKey && lastSelectedId) {
        const itemIds = filteredItems.map(i => i.id);
        const lastIndex = itemIds.indexOf(lastSelectedId);
        const currentIndex = itemIds.indexOf(id);
        if (lastIndex !== -1 && currentIndex !== -1) {
          const start = Math.min(lastIndex, currentIndex);
          const end = Math.max(lastIndex, currentIndex);
          const rangeIds = itemIds.slice(start, end + 1);
          setSelectedIds(prev => {
            const next = new Set(prev);
            for (const rangeId of rangeIds) {
              next.add(rangeId);
            }
            return next;
          });
          setLastSelectedId(id);
          return;
        }
      }

      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
      setLastSelectedId(id);
    },
    [lastSelectedId, filteredItems]
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setLastSelectedId(null);
  }, []);

  const selectableItemsFn = useCallback(
    (items: DiscardPileItem[]) =>
      items.filter(item => !HISTORY_STATUSES.includes(item.status)),
    []
  );

  const selectedItemsFn = useCallback(
    (allItems: DiscardPileItem[]) =>
      allItems.filter(item => selectedIds.has(item.id)),
    [selectedIds]
  );

  return {
    selectedIds,
    selectionMode,
    lastSelectedId,
    toggleSelectionMode,
    toggleSelect,
    clearSelection,
    selectableItems: selectableItemsFn,
    selectedItems: selectedItemsFn,
  };
}
