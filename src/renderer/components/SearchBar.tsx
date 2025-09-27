/* global HTMLInputElement */
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
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(
    null
  );
  const inputRef = useRef<HTMLInputElement | null>(null);
  const shouldMaintainFocus = useRef(false);

  useEffect(() => {
    // Debounce search to avoid too many API calls
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    const timer = setTimeout(() => {
      // Set flag to maintain focus before triggering search
      if (inputRef.current && document.activeElement === inputRef.current) {
        shouldMaintainFocus.current = true;
      }
      onSearch(query);
    }, 500); // 500ms delay

    setDebounceTimer(timer);

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Restore focus after search updates
  useEffect(() => {
    if (shouldMaintainFocus.current && inputRef.current) {
      inputRef.current.focus();
      // Restore cursor position to end of text
      const length = inputRef.current.value.length;
      inputRef.current.setSelectionRange(length, length);
      shouldMaintainFocus.current = false;
    }
  });

  const handleClear = () => {
    setQuery('');
    onSearch('');
  };

  return (
    <div style={{ position: 'relative', marginBottom: '1rem' }}>
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          type='text'
          className='form-input'
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            paddingLeft: '2.5rem',
            paddingRight: query ? '2.5rem' : '1rem',
          }}
        />

        {/* Search icon */}
        <div
          style={{
            position: 'absolute',
            left: '0.75rem',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#666',
            fontSize: '1rem',
            pointerEvents: 'none',
          }}
        >
          🔍
        </div>

        {/* Clear button */}
        {query && (
          <button
            type='button'
            onClick={handleClear}
            disabled={disabled}
            style={{
              position: 'absolute',
              right: '0.75rem',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              color: '#666',
              fontSize: '1rem',
              cursor: 'pointer',
              padding: '0.25rem',
              borderRadius: '50%',
              width: '1.5rem',
              height: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title='Clear search'
          >
            ✕
          </button>
        )}
      </div>

      {disabled && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(255, 255, 255, 0.7)',
            borderRadius: '6px',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
};

export default SearchBar;
