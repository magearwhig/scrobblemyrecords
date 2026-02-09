import React from 'react';

interface FilterOptions {
  formats: string[];
  years: { min: number; max: number };
}

interface CollectionFilterControlsProps {
  filterFormat: string;
  onFilterFormatChange: (value: string) => void;
  filterYearFrom: string;
  onFilterYearFromChange: (value: string) => void;
  filterYearTo: string;
  onFilterYearToChange: (value: string) => void;
  filterDateAdded: string;
  onFilterDateAddedChange: (value: string) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  filteredCount: number;
  totalCount: number;
  filterOptions: FilterOptions;
}

const CollectionFilterControls: React.FC<CollectionFilterControlsProps> = ({
  filterFormat,
  onFilterFormatChange,
  filterYearFrom,
  onFilterYearFromChange,
  filterYearTo,
  onFilterYearToChange,
  filterDateAdded,
  onFilterDateAddedChange,
  hasActiveFilters,
  onClearFilters,
  filteredCount,
  totalCount,
  filterOptions,
}) => {
  return (
    <div className='collection-filters'>
      <span className='collection-filters-label'>Filters:</span>

      {/* Format Filter */}
      <div className='collection-filter-group'>
        <label htmlFor='filter-format' className='collection-filter-label'>
          Format:
        </label>
        <select
          id='filter-format'
          value={filterFormat}
          onChange={e => onFilterFormatChange(e.target.value)}
          className='collection-filter-select'
        >
          <option value=''>All Formats</option>
          {filterOptions.formats.map(format => (
            <option key={format} value={format}>
              {format}
            </option>
          ))}
        </select>
      </div>

      {/* Year Range Filter */}
      <div className='collection-filter-group'>
        <label className='collection-filter-label'>Year:</label>
        <input
          type='number'
          placeholder={String(filterOptions.years.min)}
          value={filterYearFrom}
          onChange={e => onFilterYearFromChange(e.target.value)}
          min={filterOptions.years.min}
          max={filterOptions.years.max}
          className='collection-filter-input'
        />
        <span className='collection-filter-separator'>-</span>
        <input
          type='number'
          placeholder={String(filterOptions.years.max)}
          value={filterYearTo}
          onChange={e => onFilterYearToChange(e.target.value)}
          min={filterOptions.years.min}
          max={filterOptions.years.max}
          className='collection-filter-input'
        />
      </div>

      {/* Date Added Filter */}
      <div className='collection-filter-group'>
        <label htmlFor='filter-date-added' className='collection-filter-label'>
          Added:
        </label>
        <select
          id='filter-date-added'
          value={filterDateAdded}
          onChange={e => onFilterDateAddedChange(e.target.value)}
          className='collection-filter-select'
        >
          <option value=''>Any Time</option>
          <option value='week'>Last Week</option>
          <option value='month'>Last Month</option>
          <option value='3months'>Last 3 Months</option>
          <option value='year'>Last Year</option>
        </select>
      </div>

      {/* Clear Filters Button */}
      {hasActiveFilters && (
        <button
          className='btn btn-small btn-outline collection-filter-clear-btn'
          onClick={onClearFilters}
        >
          Clear Filters
        </button>
      )}

      {/* Filter Results Count */}
      {hasActiveFilters && (
        <span className='collection-filter-results'>
          Showing {filteredCount} of {totalCount} items
        </span>
      )}
    </div>
  );
};

export default React.memo(CollectionFilterControls);
