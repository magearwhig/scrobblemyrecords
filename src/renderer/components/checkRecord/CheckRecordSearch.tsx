import { ScanSearch } from 'lucide-react';
import React, { useState } from 'react';

import { navigate, ROUTES } from '../../routes';

import './CheckRecordSearch.css';

interface CheckRecordSearchProps {
  /** 'header': compact box in the app header; 'home': the Home page card */
  variant: 'header' | 'home';
}

/**
 * A search box that opens Check a Record with the query. Not
 * type="search" and no "Search" placeholder, so the "/" shortcut keeps
 * focusing the current page's own search box.
 */
export const CheckRecordSearch: React.FC<CheckRecordSearchProps> = ({
  variant,
}) => {
  const [query, setQuery] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    navigate(ROUTES.CHECK_RECORD, q ? { q } : undefined);
    setQuery('');
  };

  return (
    <form
      className={`check-record-search-form check-record-search-form--${variant}`}
      role='search'
      aria-label='Check a record'
      onSubmit={submit}
    >
      <ScanSearch size={16} aria-hidden='true' />
      <input
        type='text'
        inputMode='search'
        enterKeyHint='search'
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={
          variant === 'header'
            ? 'Check a record…'
            : 'Artist, title or Discogs release link'
        }
        aria-label='Check a record: artist, title or Discogs release link'
        autoComplete='off'
        autoCapitalize='none'
        spellCheck={false}
      />
    </form>
  );
};

export default CheckRecordSearch;
