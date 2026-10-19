import { Plus } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { CrateEvaluation, CrateSuggestion } from '../../../shared/types';
import { describeCrateRule } from '../../../shared/utils/crateReasons';
import type ApiService from '../../services/api';
import { Button, Modal } from '../ui';

import CrateCover from './CrateCover';
import CrateMightMatch from './CrateMightMatch';
import { sortLabel } from './CrateRuleBuilder';
import { apiErrorInfo, formatCoverageCounts } from './crateRuleModel';
import './CrateSuggestionPreview.css';

export interface CrateSuggestionPreviewProps {
  api: Pick<ApiService, 'previewCrate'>;
  /** The suggestion to preview; null closes the modal */
  suggestion: CrateSuggestion | null;
  adding?: boolean;
  onClose: () => void;
  onAdd: (suggestion: CrateSuggestion) => void;
}

const SAMPLE_SIZE = 12;

/**
 * Read-only look at a suggested crate: its description, rules, sort and the
 * albums it would hold now (evaluated with previewCrate, nothing saved).
 */
const CrateSuggestionPreview: React.FC<CrateSuggestionPreviewProps> = ({
  api,
  suggestion,
  adding = false,
  onClose,
  onAdd,
}) => {
  const [evaluation, setEvaluation] = useState<CrateEvaluation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!suggestion) return;
    let cancelled = false;
    setEvaluation(null);
    setError(null);
    api
      .previewCrate(suggestion.rules, suggestion.sort)
      .then(result => {
        if (!cancelled) setEvaluation(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(apiErrorInfo(err).message);
      });
    return () => {
      cancelled = true;
    };
  }, [api, suggestion]);

  if (!suggestion) return null;

  const count = evaluation?.albums.length ?? suggestion.count;
  const coverage = evaluation
    ? formatCoverageCounts(evaluation.coverage, suggestion.rules)
    : [];

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={suggestion.name}
      size='large'
      footer={
        <>
          <Button variant='secondary' onClick={onClose}>
            Close
          </Button>
          <Button
            iconLeft={<Plus size={16} aria-hidden='true' />}
            loading={adding}
            onClick={() => onAdd(suggestion)}
          >
            Add crate
          </Button>
        </>
      }
    >
      <div className='crate-suggestion-preview'>
        <div className='crate-suggestion-preview-side'>
          <p className='crate-suggestion-preview-description'>
            {suggestion.description}
          </p>
          <h3 className='crate-suggestion-preview-heading'>Rules</h3>
          <ul className='crate-suggestion-preview-rules'>
            {suggestion.rules.map(rule => (
              <li key={rule.id}>{describeCrateRule(rule)}</li>
            ))}
          </ul>
          <p className='crate-suggestion-preview-sort'>
            Sort: {sortLabel(suggestion.sort)}
          </p>
        </div>
        <div className='crate-suggestion-preview-main' aria-busy={!evaluation}>
          <p className='crate-suggestion-preview-count'>
            <strong>{count.toLocaleString('en-US')}</strong>{' '}
            {count === 1 ? 'album' : 'albums'}
          </p>
          {error && (
            <p className='crate-suggestion-preview-note'>
              Preview unavailable: {error}
            </p>
          )}
          {!evaluation && !error && (
            <p className='crate-suggestion-preview-note'>
              Checking your collection…
            </p>
          )}
          {evaluation && (
            <>
              <CrateMightMatch
                unknownOnly={evaluation.unknownOnly}
                rules={suggestion.rules}
                total={evaluation.unknownOnlyAlbums}
              />
              {coverage.length > 0 && (
                <ul className='crate-suggestion-preview-coverage'>
                  {coverage.map(line => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
              <ul
                className='crate-suggestion-preview-albums'
                aria-label='Albums in this crate'
              >
                {evaluation.albums.slice(0, SAMPLE_SIZE).map(album => (
                  <li key={album.albumKey}>
                    <CrateCover
                      url={album.coverUrl}
                      title={album.album}
                      size='small'
                    />
                    <span className='crate-suggestion-preview-album'>
                      <span className='crate-suggestion-preview-title'>
                        {album.album}
                      </span>
                      <span className='crate-suggestion-preview-artist'>
                        {album.artist}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              {evaluation.albums.length > SAMPLE_SIZE && (
                <p className='crate-suggestion-preview-note'>
                  and {evaluation.albums.length - SAMPLE_SIZE} more
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default CrateSuggestionPreview;
