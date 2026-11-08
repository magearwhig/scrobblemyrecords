import { Search } from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';

interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  disabled?: boolean;
  defaultValue?: string;
}

const SearchBar: React.FC<SearchBarProps> = ({
  onSearch,
  placeholder = 'Search...',
  disabled = false,
  defaultValue = '',
}) => {
  const [query, setQuery] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Debounce search to avoid too many API calls
  useEffect(() => {
    const timer = setTimeout(() => onSearch(query), 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const handleClear = () => {
    setQuery('');
    onSearch('');
    // Keep focus on the input after clearing
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  return (
    <div className='search-container'>
      <div className='search-input-wrapper'>
        <input
          ref={inputRef}
          type='text'
          className={`form-input search-padded ${query ? 'search-has-clear' : ''}`}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus
        />

        {/* Search icon */}
        <div className='search-icon'>
          <Search size={16} aria-hidden='true' />
        </div>

        {/* Clear button */}
        {query && (
          <button
            type='button'
            onClick={handleClear}
            disabled={disabled}
            className='search-clear'
            title='Clear search'
            aria-label='Clear search'
          >
            ✕
          </button>
        )}
      </div>

      {disabled && <div className='search-disabled-overlay' />}
    </div>
  );
};

export default SearchBar;
