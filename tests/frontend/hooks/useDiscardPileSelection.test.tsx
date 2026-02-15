import { renderHook, act } from '@testing-library/react';

import { useDiscardPileSelection } from '../../../src/renderer/hooks/useDiscardPileSelection';
import { DiscardPileItem, DiscardStatus } from '../../../src/shared/types';

function createItem(
  id: string,
  status: DiscardStatus = 'marked'
): DiscardPileItem {
  return {
    id,
    collectionItemId: parseInt(id, 10) || 0,
    releaseId: parseInt(id, 10) || 0,
    artist: `Artist ${id}`,
    title: `Title ${id}`,
    reason: 'not_playing' as DiscardPileItem['reason'],
    addedAt: Date.now(),
    status,
    statusChangedAt: Date.now(),
    currency: 'USD',
    orphaned: false,
  };
}

describe('useDiscardPileSelection', () => {
  const items: DiscardPileItem[] = [
    createItem('1'),
    createItem('2'),
    createItem('3'),
    createItem('4'),
    createItem('5'),
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    it('starts with empty selection', () => {
      const { result } = renderHook(() => useDiscardPileSelection(items));

      expect(result.current.selectedIds.size).toBe(0);
      expect(result.current.selectionMode).toBe(false);
      expect(result.current.lastSelectedId).toBeNull();
    });
  });

  describe('toggleSelectionMode', () => {
    it('enables selection mode', () => {
      const { result } = renderHook(() => useDiscardPileSelection(items));

      act(() => {
        result.current.toggleSelectionMode();
      });

      expect(result.current.selectionMode).toBe(true);
    });

    it('disables selection mode and clears selection', () => {
      const { result } = renderHook(() => useDiscardPileSelection(items));

      // Enable and select an item
      act(() => {
        result.current.toggleSelectionMode();
      });
      act(() => {
        result.current.toggleSelect('1', false);
      });

      expect(result.current.selectedIds.size).toBe(1);

      // Disable selection mode
      act(() => {
        result.current.toggleSelectionMode();
      });

      expect(result.current.selectionMode).toBe(false);
      expect(result.current.selectedIds.size).toBe(0);
      expect(result.current.lastSelectedId).toBeNull();
    });

    it('toggles back and forth', () => {
      const { result } = renderHook(() => useDiscardPileSelection(items));

      act(() => {
        result.current.toggleSelectionMode();
      });
      expect(result.current.selectionMode).toBe(true);

      act(() => {
        result.current.toggleSelectionMode();
      });
      expect(result.current.selectionMode).toBe(false);

      act(() => {
        result.current.toggleSelectionMode();
      });
      expect(result.current.selectionMode).toBe(true);
    });
  });

  describe('toggleSelect', () => {
    it('selects an item', () => {
      const { result } = renderHook(() => useDiscardPileSelection(items));

      act(() => {
        result.current.toggleSelect('1', false);
      });

      expect(result.current.selectedIds.has('1')).toBe(true);
      expect(result.current.lastSelectedId).toBe('1');
    });

    it('deselects a selected item', () => {
      const { result } = renderHook(() => useDiscardPileSelection(items));

      act(() => {
        result.current.toggleSelect('1', false);
      });
      act(() => {
        result.current.toggleSelect('1', false);
      });

      expect(result.current.selectedIds.has('1')).toBe(false);
    });

    it('selects multiple items individually', () => {
      const { result } = renderHook(() => useDiscardPileSelection(items));

      act(() => {
        result.current.toggleSelect('1', false);
      });
      act(() => {
        result.current.toggleSelect('3', false);
      });

      expect(result.current.selectedIds.has('1')).toBe(true);
      expect(result.current.selectedIds.has('3')).toBe(true);
      expect(result.current.selectedIds.size).toBe(2);
    });

    it('updates lastSelectedId on each selection', () => {
      const { result } = renderHook(() => useDiscardPileSelection(items));

      act(() => {
        result.current.toggleSelect('1', false);
      });
      expect(result.current.lastSelectedId).toBe('1');

      act(() => {
        result.current.toggleSelect('3', false);
      });
      expect(result.current.lastSelectedId).toBe('3');
    });
  });

  describe('shift-click range selection', () => {
    it('selects a range when shift is held', () => {
      const { result } = renderHook(() => useDiscardPileSelection(items));

      // Select item 1 first
      act(() => {
        result.current.toggleSelect('1', false);
      });

      // Shift-click item 4
      act(() => {
        result.current.toggleSelect('4', true);
      });

      expect(result.current.selectedIds.has('1')).toBe(true);
      expect(result.current.selectedIds.has('2')).toBe(true);
      expect(result.current.selectedIds.has('3')).toBe(true);
      expect(result.current.selectedIds.has('4')).toBe(true);
      expect(result.current.selectedIds.size).toBe(4);
    });

    it('selects range in reverse direction', () => {
      const { result } = renderHook(() => useDiscardPileSelection(items));

      // Select item 4 first
      act(() => {
        result.current.toggleSelect('4', false);
      });

      // Shift-click item 2
      act(() => {
        result.current.toggleSelect('2', true);
      });

      expect(result.current.selectedIds.has('2')).toBe(true);
      expect(result.current.selectedIds.has('3')).toBe(true);
      expect(result.current.selectedIds.has('4')).toBe(true);
      expect(result.current.selectedIds.size).toBe(3);
    });

    it('falls back to toggle when no lastSelectedId', () => {
      const { result } = renderHook(() => useDiscardPileSelection(items));

      // Shift-click with no prior selection
      act(() => {
        result.current.toggleSelect('3', true);
      });

      // Should just toggle the single item
      expect(result.current.selectedIds.has('3')).toBe(true);
      expect(result.current.selectedIds.size).toBe(1);
    });

    it('adds range to existing selection without removing', () => {
      const { result } = renderHook(() => useDiscardPileSelection(items));

      // Select item 5 individually
      act(() => {
        result.current.toggleSelect('5', false);
      });

      // Select item 1
      act(() => {
        result.current.toggleSelect('1', false);
      });

      // Shift-click item 3
      act(() => {
        result.current.toggleSelect('3', true);
      });

      // Items 1, 2, 3 should be selected, plus 5 from before
      expect(result.current.selectedIds.has('1')).toBe(true);
      expect(result.current.selectedIds.has('2')).toBe(true);
      expect(result.current.selectedIds.has('3')).toBe(true);
      expect(result.current.selectedIds.has('5')).toBe(true);
    });

    it('handles shift-click when lastSelectedId is not in filteredItems', () => {
      const shortList = [createItem('10'), createItem('20')];
      const { result } = renderHook(() => useDiscardPileSelection(shortList));

      // Select with an ID that is valid
      act(() => {
        result.current.toggleSelect('10', false);
      });

      // Now rerender with a list that still contains both
      // Shift-click with an ID not in the list
      act(() => {
        result.current.toggleSelect('99', true);
      });

      // 99 not found in items, indexOf returns -1, so fall through to normal toggle
      expect(result.current.selectedIds.has('99')).toBe(true);
    });
  });

  describe('clearSelection', () => {
    it('clears all selected items', () => {
      const { result } = renderHook(() => useDiscardPileSelection(items));

      act(() => {
        result.current.toggleSelect('1', false);
      });
      act(() => {
        result.current.toggleSelect('2', false);
      });
      act(() => {
        result.current.toggleSelect('3', false);
      });

      expect(result.current.selectedIds.size).toBe(3);

      act(() => {
        result.current.clearSelection();
      });

      expect(result.current.selectedIds.size).toBe(0);
      expect(result.current.lastSelectedId).toBeNull();
    });

    it('is a no-op when nothing is selected', () => {
      const { result } = renderHook(() => useDiscardPileSelection(items));

      act(() => {
        result.current.clearSelection();
      });

      expect(result.current.selectedIds.size).toBe(0);
      expect(result.current.lastSelectedId).toBeNull();
    });
  });

  describe('selectableItems', () => {
    it('filters out items with history statuses', () => {
      const mixedItems: DiscardPileItem[] = [
        createItem('1', 'marked'),
        createItem('2', 'listed'),
        createItem('3', 'sold'),
        createItem('4', 'gifted'),
        createItem('5', 'removed'),
        createItem('6', 'traded_in'),
      ];

      const { result } = renderHook(() => useDiscardPileSelection(mixedItems));

      const selectable = result.current.selectableItems(mixedItems);

      expect(selectable).toHaveLength(2);
      expect(selectable.map(i => i.id)).toEqual(['1', '2']);
    });

    it('returns all items when none have history statuses', () => {
      const activeItems: DiscardPileItem[] = [
        createItem('1', 'marked'),
        createItem('2', 'listed'),
      ];

      const { result } = renderHook(() => useDiscardPileSelection(activeItems));

      const selectable = result.current.selectableItems(activeItems);
      expect(selectable).toHaveLength(2);
    });

    it('returns empty array when all items have history statuses', () => {
      const historyItems: DiscardPileItem[] = [
        createItem('1', 'sold'),
        createItem('2', 'gifted'),
        createItem('3', 'removed'),
        createItem('4', 'traded_in'),
      ];

      const { result } = renderHook(() =>
        useDiscardPileSelection(historyItems)
      );

      const selectable = result.current.selectableItems(historyItems);
      expect(selectable).toHaveLength(0);
    });

    it('returns empty array for empty input', () => {
      const { result } = renderHook(() => useDiscardPileSelection([]));

      const selectable = result.current.selectableItems([]);
      expect(selectable).toHaveLength(0);
    });
  });

  describe('selectedItems', () => {
    it('returns items that match selectedIds', () => {
      const { result } = renderHook(() => useDiscardPileSelection(items));

      act(() => {
        result.current.toggleSelect('2', false);
      });
      act(() => {
        result.current.toggleSelect('4', false);
      });

      const selected = result.current.selectedItems(items);

      expect(selected).toHaveLength(2);
      expect(selected.map(i => i.id)).toEqual(['2', '4']);
    });

    it('returns empty array when nothing is selected', () => {
      const { result } = renderHook(() => useDiscardPileSelection(items));

      const selected = result.current.selectedItems(items);
      expect(selected).toHaveLength(0);
    });

    it('handles items not in the provided list', () => {
      const { result } = renderHook(() => useDiscardPileSelection(items));

      act(() => {
        result.current.toggleSelect('99', false);
      });

      // 99 is selected but not in items array
      const selected = result.current.selectedItems(items);
      expect(selected).toHaveLength(0);
    });
  });
});
