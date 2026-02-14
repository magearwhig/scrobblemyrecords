import React from 'react';

import { DiscardPileItem, DiscardStatus } from '../../../shared/types';
import { useTabKeyNavigation } from '../../hooks/useTabKeyNavigation';

export type TabType = 'all' | 'marked' | 'listed' | 'history' | 'orphaned';
export type SortOption = 'date' | 'artist' | 'title' | 'value' | 'status';

const HISTORY_STATUSES: DiscardStatus[] = [
  'sold',
  'gifted',
  'removed',
  'traded_in',
];

interface DiscardFilterBarProps {
  items: DiscardPileItem[];
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

const TABS: { key: TabType; label: string }[] = [
  { key: 'all', label: 'Active' },
  { key: 'marked', label: 'Pending' },
  { key: 'listed', label: 'Listed' },
  { key: 'history', label: 'History' },
  { key: 'orphaned', label: 'Orphaned' },
];

const DiscardFilterBar: React.FC<DiscardFilterBarProps> = ({
  items,
  activeTab,
  onTabChange,
  sortBy,
  onSortChange,
  searchQuery,
  onSearchChange,
}) => {
  const handleTabKeyDown = useTabKeyNavigation();

  const getCount = (tab: TabType): number => {
    switch (tab) {
      case 'all':
        return items.filter(i => !HISTORY_STATUSES.includes(i.status)).length;
      case 'marked':
        return items.filter(i => i.status === 'marked').length;
      case 'listed':
        return items.filter(i => i.status === 'listed').length;
      case 'history':
        return items.filter(i => HISTORY_STATUSES.includes(i.status)).length;
      case 'orphaned':
        return items.filter(i => i.orphaned).length;
      default:
        return 0;
    }
  };

  return (
    <div className='filter-bar'>
      <div className='tabs' role='tablist'>
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => onTabChange(tab.key)}
            onKeyDown={handleTabKeyDown}
            role='tab'
            aria-selected={activeTab === tab.key}
          >
            {tab.label} ({getCount(tab.key)})
          </button>
        ))}
      </div>

      <div className='filter-controls'>
        <input
          type='text'
          placeholder='Search artist or album...'
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          className='search-input'
          aria-label='Search discard pile items'
        />
        <select
          value={sortBy}
          onChange={e => onSortChange(e.target.value as SortOption)}
          className='sort-select'
          aria-label='Sort discard pile items'
        >
          <option value='date'>Sort by Date Added</option>
          <option value='artist'>Sort by Artist</option>
          <option value='title'>Sort by Title</option>
          <option value='value'>Sort by Value</option>
          <option value='status'>Sort by Status</option>
        </select>
      </div>
    </div>
  );
};

export default React.memo(DiscardFilterBar);
