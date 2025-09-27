/* global HTMLInputElement, HTMLElement, requestAnimationFrame */
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
  const isTypingRef = useRef(false);
  const cursorPositionRef = useRef(0);

  useEffect(() => {
    // Debounce search to avoid too many API calls
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    const timer = setTimeout(() => {
      // Save cursor position before search
      if (inputRef.current && document.activeElement === inputRef.current) {
        cursorPositionRef.current = inputRef.current.selectionStart || 0;
      }
      onSearch(query);
      // Ensure focus is maintained after search
      setTimeout(() => {
        if (isTypingRef.current && inputRef.current) {
          inputRef.current.focus();
          // Restore cursor position
          inputRef.current.setSelectionRange(
            cursorPositionRef.current,
            cursorPositionRef.current
          );
        }
      }, 0);
    }, 500); // 500ms delay

    setDebounceTimer(timer);

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Force focus to be maintained during typing
  useEffect(() => {
    const interval = setInterval(() => {
      if (
        isTypingRef.current &&
        inputRef.current &&
        document.activeElement !== inputRef.current
      ) {
        const selectionStart = cursorPositionRef.current;
        inputRef.current.focus();
        // Use requestAnimationFrame to ensure the focus and selection happen after render
        requestAnimationFrame(() => {
          if (inputRef.current) {
            inputRef.current.setSelectionRange(selectionStart, selectionStart);
          }
        });
      }
    }, 50); // Check more frequently

    return () => clearInterval(interval);
  }, []);

  // Track when user is actively typing
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    isTypingRef.current = true;
    cursorPositionRef.current = e.target.selectionStart || 0;
    setQuery(e.target.value);
    // Keep typing flag active for much longer (5 seconds)
    // This ensures focus is maintained even when no results are found
    const typingTimeoutKey = 'typingTimeout' as const;
    if (inputRef.current && typingTimeoutKey in inputRef.current) {
      clearTimeout(
        (inputRef.current as unknown as { typingTimeout: NodeJS.Timeout })
          .typingTimeout
      );
    }
    const timeout = setTimeout(() => {
      isTypingRef.current = false;
    }, 5000);
    if (inputRef.current) {
      (
        inputRef.current as unknown as { typingTimeout: NodeJS.Timeout }
      ).typingTimeout = timeout;
    }
  };

  // Track focus state
  const handleFocus = () => {
    isTypingRef.current = true;
    // Save cursor position when focusing
    if (inputRef.current) {
      cursorPositionRef.current =
        inputRef.current.selectionStart || query.length;
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // Check if we're blurring to something within the search component
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (relatedTarget?.closest('.form-input')) {
      return; // Don't lose typing state if clicking within search
    }
    // Don't immediately set to false, wait a bit
    setTimeout(() => {
      isTypingRef.current = false;
    }, 200);
  };

  // Handle keyboard events to maintain typing state
  const handleKeyDown = () => {
    isTypingRef.current = true;
    // Reset the timeout on any keyboard activity
    const typingTimeoutKey = 'typingTimeout' as const;
    if (inputRef.current && typingTimeoutKey in inputRef.current) {
      clearTimeout(
        (inputRef.current as unknown as { typingTimeout: NodeJS.Timeout })
          .typingTimeout
      );
    }
    const timeout = setTimeout(() => {
      isTypingRef.current = false;
    }, 5000);
    if (inputRef.current) {
      (
        inputRef.current as unknown as { typingTimeout: NodeJS.Timeout }
      ).typingTimeout = timeout;
    }
  };

  const handleClear = () => {
    setQuery('');
    onSearch('');
    // Keep focus on the input after clearing
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  return (
    <div style={{ position: 'relative', marginBottom: '1rem' }}>
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          type='text'
          className='form-input'
          value={query}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus
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
