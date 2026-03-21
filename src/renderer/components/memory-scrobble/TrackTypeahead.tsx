import { Keyboard, PenLine, Search } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { TrackSearchResult } from '../../../shared/types';
import { createLogger } from '../../utils/logger';
import { Badge } from '../ui/Badge';
import './TrackTypeahead.css';

const log = createLogger('TrackTypeahead');

export interface TrackTypeaheadProps {
  onSelect: (result: TrackSearchResult) => void;
  onFreeformSubmit: (artist: string, track: string, album?: string) => void;
  searchFn: (query: string) => Promise<TrackSearchResult[]>;
  disabled?: boolean;
}

const DEBOUNCE_MS = 300;

export const TrackTypeahead: React.FC<TrackTypeaheadProps> = ({
  onSelect,
  onFreeformSubmit,
  searchFn,
  disabled = false,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TrackSearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [showFreeform, setShowFreeform] = useState(false);
  const [freeformArtist, setFreeformArtist] = useState('');
  const [freeformTrack, setFreeformTrack] = useState('');
  const [freeformAlbum, setFreeformAlbum] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Group results by source
  const historyResults = results.filter(r => r.source === 'history');
  const collectionResults = results.filter(r => r.source === 'collection');
  // Total items: grouped results + "Enter manually" option
  const totalItems = results.length + 1;

  const performSearch = useCallback(
    async (searchQuery: string) => {
      if (searchQuery.trim().length < 2) {
        setResults([]);
        setIsOpen(false);
        return;
      }

      setIsLoading(true);
      try {
        const searchResults = await searchFn(searchQuery);
        setResults(searchResults);
        setIsOpen(true);
        setHighlightIndex(-1);
      } catch (err) {
        log.error('Search failed', err);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    },
    [searchFn]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuery(value);
      setShowFreeform(false);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        performSearch(value);
      }, DEBOUNCE_MS);
    },
    [performSearch]
  );

  const handleSelectResult = useCallback(
    (result: TrackSearchResult) => {
      onSelect(result);
      setQuery('');
      setResults([]);
      setIsOpen(false);
      setShowFreeform(false);
      inputRef.current?.focus();
    },
    [onSelect]
  );

  const handleEnterManually = useCallback(() => {
    setShowFreeform(true);
    setIsOpen(false);
  }, []);

  const handleFreeformSubmit = useCallback(() => {
    const artist = freeformArtist.trim();
    const track = freeformTrack.trim();
    if (!artist || !track) return;

    onFreeformSubmit(artist, track, freeformAlbum.trim() || undefined);
    setFreeformArtist('');
    setFreeformTrack('');
    setFreeformAlbum('');
    setShowFreeform(false);
    setQuery('');
    inputRef.current?.focus();
  }, [freeformArtist, freeformTrack, freeformAlbum, onFreeformSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === 'ArrowDown' && results.length > 0) {
          setIsOpen(true);
          setHighlightIndex(0);
          e.preventDefault();
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightIndex(prev => (prev + 1) % totalItems);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightIndex(prev => (prev - 1 + totalItems) % totalItems);
          break;
        case 'Enter':
          e.preventDefault();
          if (highlightIndex >= 0 && highlightIndex < results.length) {
            handleSelectResult(results[highlightIndex]);
          } else if (highlightIndex === results.length) {
            handleEnterManually();
          }
          break;
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          setHighlightIndex(-1);
          break;
      }
    },
    [
      isOpen,
      results,
      highlightIndex,
      totalItems,
      handleSelectResult,
      handleEnterManually,
    ]
  );

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: globalThis.MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIndex >= 0 && dropdownRef.current) {
      const items = dropdownRef.current.querySelectorAll(
        '.typeahead-result-item, .typeahead-freeform-option'
      );
      items[highlightIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex]);

  // Build flat list index for rendering
  let flatIndex = 0;

  return (
    <div className='typeahead-container'>
      <div className='typeahead-input-wrapper'>
        <Search
          size={16}
          aria-hidden='true'
          className='typeahead-search-icon'
        />
        <input
          ref={inputRef}
          type='text'
          className='typeahead-input'
          placeholder='Search tracks or enter manually...'
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          aria-label='Search for tracks to add'
          aria-expanded={isOpen}
          aria-autocomplete='list'
          aria-controls='typeahead-results'
          role='combobox'
        />
        {isLoading && (
          <span className='typeahead-spinner' aria-label='Searching...' />
        )}
      </div>

      {isOpen && (
        <div
          ref={dropdownRef}
          id='typeahead-results'
          className='typeahead-dropdown'
          role='listbox'
        >
          {historyResults.length > 0 && (
            <div className='typeahead-group'>
              <div className='typeahead-group-header'>From History</div>
              {historyResults.map(result => {
                const idx = flatIndex++;
                return (
                  <button
                    key={`history-${result.artist}-${result.track}`}
                    className={`typeahead-result-item ${idx === highlightIndex ? 'typeahead-result-item--highlighted' : ''}`}
                    onClick={() => handleSelectResult(result)}
                    role='option'
                    aria-selected={idx === highlightIndex}
                    aria-label={`${result.artist} - ${result.track}, played ${result.playCount ?? 0} times`}
                  >
                    <div className='typeahead-result-info'>
                      <span className='typeahead-result-artist'>
                        {result.artist}
                      </span>
                      <span className='typeahead-result-separator'> - </span>
                      <span className='typeahead-result-track'>
                        {result.track}
                      </span>
                      {result.album && (
                        <span className='typeahead-result-album'>
                          {result.album}
                        </span>
                      )}
                    </div>
                    <Badge variant='info' size='small'>
                      {result.playCount ?? 0} plays
                    </Badge>
                  </button>
                );
              })}
            </div>
          )}

          {collectionResults.length > 0 && (
            <div className='typeahead-group'>
              <div className='typeahead-group-header'>From Collections</div>
              {collectionResults.map(result => {
                const idx = flatIndex++;
                return (
                  <button
                    key={`collection-${result.artist}-${result.track}-${result.sourceCollectionId}`}
                    className={`typeahead-result-item ${idx === highlightIndex ? 'typeahead-result-item--highlighted' : ''}`}
                    onClick={() => handleSelectResult(result)}
                    role='option'
                    aria-selected={idx === highlightIndex}
                    aria-label={`${result.artist} - ${result.track}, from ${result.sourceCollectionName ?? 'collection'}`}
                  >
                    <div className='typeahead-result-info'>
                      <span className='typeahead-result-artist'>
                        {result.artist}
                      </span>
                      <span className='typeahead-result-separator'> - </span>
                      <span className='typeahead-result-track'>
                        {result.track}
                      </span>
                      {result.album && (
                        <span className='typeahead-result-album'>
                          {result.album}
                        </span>
                      )}
                    </div>
                    <Badge variant='secondary' size='small'>
                      {result.sourceCollectionName ?? 'Collection'}
                    </Badge>
                  </button>
                );
              })}
            </div>
          )}

          {results.length === 0 && !isLoading && (
            <div className='typeahead-no-results'>No matching tracks found</div>
          )}

          <button
            className={`typeahead-freeform-option ${results.length === highlightIndex ? 'typeahead-freeform-option--highlighted' : ''}`}
            onClick={handleEnterManually}
            role='option'
            aria-selected={results.length === highlightIndex}
            aria-label='Enter track details manually'
          >
            <PenLine size={16} aria-hidden='true' />
            <span>Enter manually</span>
          </button>
        </div>
      )}

      {showFreeform && (
        <div className='typeahead-freeform'>
          <div className='typeahead-freeform-fields'>
            <input
              type='text'
              className='typeahead-freeform-input'
              placeholder='Artist (required)'
              value={freeformArtist}
              onChange={e => setFreeformArtist(e.target.value)}
              aria-label='Artist name'
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') handleFreeformSubmit();
              }}
            />
            <input
              type='text'
              className='typeahead-freeform-input'
              placeholder='Track (required)'
              value={freeformTrack}
              onChange={e => setFreeformTrack(e.target.value)}
              aria-label='Track name'
              onKeyDown={e => {
                if (e.key === 'Enter') handleFreeformSubmit();
              }}
            />
            <input
              type='text'
              className='typeahead-freeform-input'
              placeholder='Album (optional)'
              value={freeformAlbum}
              onChange={e => setFreeformAlbum(e.target.value)}
              aria-label='Album name'
              onKeyDown={e => {
                if (e.key === 'Enter') handleFreeformSubmit();
              }}
            />
          </div>
          <div className='typeahead-freeform-actions'>
            <button
              className='typeahead-freeform-add'
              onClick={handleFreeformSubmit}
              disabled={!freeformArtist.trim() || !freeformTrack.trim()}
              aria-label='Add track'
            >
              <Keyboard size={16} aria-hidden='true' />
              Add Track
            </button>
            <button
              className='typeahead-freeform-cancel'
              onClick={() => setShowFreeform(false)}
              aria-label='Cancel manual entry'
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrackTypeahead;
