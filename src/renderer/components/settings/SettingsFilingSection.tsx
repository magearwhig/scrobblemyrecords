import { Library, Pencil, X } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import './SettingsFilingSection.css';

import { ArtistFilingRow } from '../../../shared/types';
import { getApiService } from '../../services/api';
import { createLogger } from '../../utils/logger';
import RecordStoreFilingStatus from '../RecordStoreFilingStatus';
import { Button } from '../ui/Button';

const log = createLogger('SettingsFilingSection');

/** Rows shown at once; search narrows the rest */
const PAGE_SIZE = 150;

type FilingFilter = 'all' | 'review' | 'overrides';

const FILTER_LABELS: Record<FilingFilter, string> = {
  all: 'All',
  review: 'Filed by name',
  overrides: 'Your overrides',
};

function lookupLabel(row: ArtistFilingRow): string {
  switch (row.lookup) {
    case 'found':
      return row.type
        ? `MusicBrainz, ${row.type.toLowerCase()}`
        : 'MusicBrainz';
    case 'not-found':
      return 'Not on MusicBrainz';
    case 'ambiguous':
      return 'Several MusicBrainz matches';
    case 'none':
      return 'No MusicBrainz artist (release tracking)';
    default:
      return 'Not looked up yet';
  }
}

interface SettingsFilingSectionProps {
  api: ReturnType<typeof getApiService>;
}

/**
 * Record-store filing for the Pocket List: which bin each artist goes in,
 * where that came from, and the user's "file under" overrides.
 * See .plan/done/record-store-filing-plan.md, "UI".
 */
const SettingsFilingSection: React.FC<SettingsFilingSectionProps> = ({
  api,
}) => {
  const [rows, setRows] = useState<ArtistFilingRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<FilingFilter>('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [statusKey, setStatusKey] = useState(0);

  const loadRows = useCallback(async () => {
    try {
      setRows(await api.getFilingArtists());
      setLoadError(false);
    } catch (error) {
      log.warn('Failed to load filing artists', error);
      setLoadError(true);
    }
  }, [api]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const needle = query.trim().toLowerCase();
    return rows.filter(row => {
      if (filter === 'review' && row.source !== 'default') return false;
      if (filter === 'overrides' && row.source !== 'override') return false;
      return (
        !needle ||
        row.artist.toLowerCase().includes(needle) ||
        row.fileUnder.toLowerCase().includes(needle)
      );
    });
  }, [rows, filter, query]);

  const overrideCount = rows?.filter(r => r.source === 'override').length ?? 0;

  const startEdit = (row: ArtistFilingRow) => {
    setEditing(row.key);
    setDraft(row.override ?? row.fileUnder);
    setSaveError(null);
  };

  const save = async (row: ArtistFilingRow, value: string) => {
    setSaving(true);
    setSaveError(null);
    try {
      await api.setFilingOverride(row.artist, value);
      setEditing(null);
      await loadRows();
      setStatusKey(k => k + 1);
    } catch (error) {
      log.warn('Failed to save filing override', error);
      setSaveError('Couldn’t save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className='settings-section-card'>
      <div className='settings-section-header'>
        <span className='settings-section-icon'>
          <Library size={18} aria-hidden='true' />
        </span>
        <div>
          <h3>Record-Store Filing</h3>
          <p className='settings-section-description'>
            How the Pocket List files artists: people by surname, bands by name
          </p>
        </div>
        <span className='settings-section-badge'>{overrideCount}</span>
      </div>

      <div className='settings-section-content'>
        <div className='settings-info-box'>
          Sort names come from MusicBrainz (&quot;Smith, Elliott&quot; files
          Elliott Smith under S). Headings still print the artist&apos;s own
          name. Set &quot;File under&quot; to change where an artist goes, e.g.
          &quot;Cooper, Alice&quot;.
        </div>

        <RecordStoreFilingStatus
          key={statusKey}
          onRefreshFinished={() => void loadRows()}
        />

        <div className='filing-toolbar'>
          <div
            className='filing-filters'
            role='group'
            aria-label='Show artists'
          >
            {(Object.keys(FILTER_LABELS) as FilingFilter[]).map(key => (
              <Button
                key={key}
                size='small'
                variant={filter === key ? 'primary' : 'secondary'}
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
              >
                {FILTER_LABELS[key]}
              </Button>
            ))}
          </div>
          <input
            type='search'
            className='form-input filing-search'
            placeholder='Search artists'
            aria-label='Search artists'
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        {loadError ? (
          <div className='settings-empty-text'>
            Couldn&apos;t load the artist list.
          </div>
        ) : !rows ? (
          <div className='loading'>
            <div className='spinner'></div>
            Loading artists...
          </div>
        ) : filtered.length === 0 ? (
          <div className='settings-empty-text'>No artists match.</div>
        ) : (
          <>
            <ul className='filing-list'>
              {filtered.slice(0, PAGE_SIZE).map(row => (
                <li key={row.key} className='filing-row'>
                  <span className='filing-section-letter' aria-hidden='true'>
                    {row.section}
                  </span>
                  <div className='filing-row-main'>
                    <div className='filing-row-artist'>{row.artist}</div>
                    {editing === row.key ? (
                      <form
                        className='filing-edit'
                        onSubmit={e => {
                          e.preventDefault();
                          void save(row, draft);
                        }}
                      >
                        <label className='filing-edit-label'>
                          File under
                          <input
                            className='form-input'
                            value={draft}
                            maxLength={200}
                            placeholder='Surname, First name'
                            onChange={e => setDraft(e.target.value)}
                            disabled={saving}
                            autoFocus
                          />
                        </label>
                        <div className='filing-edit-actions'>
                          <Button size='small' type='submit' loading={saving}>
                            Save
                          </Button>
                          <Button
                            size='small'
                            variant='secondary'
                            onClick={() => setEditing(null)}
                            disabled={saving}
                          >
                            Cancel
                          </Button>
                        </div>
                        {saveError && (
                          <p className='filing-edit-error' role='alert'>
                            {saveError}
                          </p>
                        )}
                      </form>
                    ) : (
                      <div className='filing-row-meta'>
                        Files under <strong>{row.fileUnder}</strong>
                        {row.filedAs && ` (with ${row.filedAs})`} ·{' '}
                        {row.source === 'override'
                          ? 'Your override'
                          : lookupLabel(row)}{' '}
                        · {row.count} {row.count === 1 ? 'record' : 'records'}
                      </div>
                    )}
                  </div>
                  {editing !== row.key && (
                    <div className='filing-row-actions'>
                      <Button
                        size='small'
                        variant='outline'
                        onClick={() => startEdit(row)}
                        aria-label={`Change where ${row.artist} is filed`}
                        iconLeft={<Pencil size={16} aria-hidden='true' />}
                      >
                        Edit
                      </Button>
                      {row.override !== null && (
                        <Button
                          size='small'
                          variant='secondary'
                          onClick={() => void save(row, '')}
                          aria-label={`Remove the override for ${row.artist}`}
                          iconLeft={<X size={16} aria-hidden='true' />}
                        >
                          Reset
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {filtered.length > PAGE_SIZE && (
              <p className='filing-more'>
                Showing {PAGE_SIZE} of {filtered.length}. Search to find the
                rest.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SettingsFilingSection;
