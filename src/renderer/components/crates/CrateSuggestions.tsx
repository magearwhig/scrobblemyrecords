import { Loader2, Shuffle } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import {
  Crate,
  CrateSuggestion,
  CrateSuggestionsResponse,
} from '../../../shared/types';
import { phrase } from '../../../shared/utils/crateCopy';
import { useToast } from '../../context/ToastContext';
import type ApiService from '../../services/api';
import { createLogger } from '../../utils/logger';
import { Button } from '../ui';
import { Skeleton } from '../ui/Skeleton';

import { apiErrorInfo } from './crateRuleModel';
import CrateSuggestionCard from './CrateSuggestionCard';
import CrateSuggestionPreview from './CrateSuggestionPreview';
import './CrateSuggestions.css';

const logger = createLogger('CrateSuggestions');

export type CrateSuggestionsApi = Pick<
  ApiService,
  | 'getCrateSuggestions'
  | 'rerollCrateSuggestions'
  | 'dismissCrateSuggestion'
  | 'createCrate'
  | 'previewCrate'
>;

export interface CrateSuggestionsProps {
  api: CrateSuggestionsApi;
  /** Called with the new crate after Add (the page opens it) */
  onAdded: (crate: Crate) => void;
  /** Change to refetch from scratch (e.g. after resetting the history) */
  refreshKey?: number;
}

/** How often to check again while the collection is still loading */
export const COLLECTION_LOADING_POLL_MS = 15_000;

type Busy = { key: string; action: 'add' | 'dismiss' } | null;

/**
 * Suggested crates above the user's crates (plan section 10.7): up to three
 * cards with Add / Preview / Not interested and "Show different suggestions".
 * Hidden when there is nothing to suggest. "Reset suggestion history" lives
 * in the page header (CrateSuggestionHistoryReset) so it stays reachable when
 * this row is hidden.
 */
const CrateSuggestions: React.FC<CrateSuggestionsProps> = ({
  api,
  onAdded,
  refreshKey = 0,
}) => {
  const { showToast } = useToast();
  const [response, setResponse] = useState<CrateSuggestionsResponse | null>(
    null
  );
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [rerolling, setRerolling] = useState(false);
  const [previewing, setPreviewing] = useState<CrateSuggestion | null>(null);

  const load = useCallback(async () => {
    try {
      setResponse(await api.getCrateSuggestions(3));
      setFailed(false);
    } catch (err) {
      // Suggestions are optional: hide the row rather than block the page
      logger.warn('Failed to load crate suggestions', err);
      setFailed(true);
    }
  }, [api]);

  useEffect(() => {
    // A fresh load (first render or after a reset) shows the skeleton, so no
    // card can be acted on while stale
    setResponse(null);
    setFailed(false);
    load();
  }, [load, refreshKey]);

  // The backend can't tell us when the collection finishes loading: poll
  const collectionLoading = response?.reason === 'collectionLoading';
  useEffect(() => {
    if (!collectionLoading) return;
    const timer = setInterval(load, COLLECTION_LOADING_POLL_MS);
    return () => clearInterval(timer);
  }, [collectionLoading, load]);

  const handleAdd = async (suggestion: CrateSuggestion) => {
    setBusy({ key: suggestion.candidateKey, action: 'add' });
    try {
      const crate = await api.createCrate({
        name: suggestion.name,
        description: suggestion.description,
        rules: suggestion.rules,
        sort: suggestion.sort,
        sourceSuggestionKey: suggestion.candidateKey,
      });
      setPreviewing(null);
      showToast('success', phrase('suggestion.added'));
      onAdded(crate);
    } catch (err) {
      showToast('error', apiErrorInfo(err).message);
    } finally {
      setBusy(null);
    }
  };

  const handleDismiss = async (suggestion: CrateSuggestion) => {
    setBusy({ key: suggestion.candidateKey, action: 'dismiss' });
    try {
      setResponse(await api.dismissCrateSuggestion(suggestion.candidateKey));
    } catch (err) {
      showToast('error', apiErrorInfo(err).message);
    } finally {
      setBusy(null);
    }
  };

  const handleReroll = async () => {
    setRerolling(true);
    try {
      const next = await api.rerollCrateSuggestions();
      // An exhausted reroll returns no cards: keep today's and say so
      setResponse(prev =>
        next.exhausted && next.suggestions.length === 0 && prev
          ? { ...prev, exhausted: true }
          : next
      );
    } catch (err) {
      showToast('error', apiErrorInfo(err).message);
    } finally {
      setRerolling(false);
    }
  };

  if (failed) return null;

  if (!response) {
    return (
      <section className='crate-suggestions' aria-hidden='true'>
        <div className='crate-suggestions-grid'>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} variant='rectangular' height={180} />
          ))}
        </div>
      </section>
    );
  }

  const { suggestions, exhausted, reason } = response;
  if (suggestions.length === 0 && reason === 'noCandidates') return null;

  const loading = reason === 'collectionLoading';

  return (
    <section
      className='crate-suggestions'
      aria-labelledby='crate-suggestions-title'
    >
      <div className='crate-suggestions-header'>
        <h2 id='crate-suggestions-title'>Suggested crates</h2>
        {!loading && (
          <div className='crate-suggestions-controls'>
            {exhausted && (
              <span className='crate-suggestions-exhausted'>
                {phrase('suggestion.exhausted')}
              </span>
            )}
            <Button
              size='small'
              variant='secondary'
              iconLeft={<Shuffle size={16} aria-hidden='true' />}
              onClick={handleReroll}
              loading={rerolling}
              disabled={exhausted || busy !== null}
            >
              Show different suggestions
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <p className='crate-suggestions-message' role='status'>
          <Loader2 size={16} aria-hidden='true' />
          {phrase('suggestion.collectionLoading')}
        </p>
      ) : (
        suggestions.length > 0 && (
          <div className='crate-suggestions-grid'>
            {suggestions.map(suggestion => (
              <CrateSuggestionCard
                key={suggestion.candidateKey}
                suggestion={suggestion}
                busy={
                  busy?.key === suggestion.candidateKey ? busy.action : null
                }
                disabled={
                  rerolling ||
                  (busy !== null && busy.key !== suggestion.candidateKey)
                }
                onAdd={handleAdd}
                onDismiss={handleDismiss}
                onPreview={setPreviewing}
              />
            ))}
          </div>
        )
      )}

      <CrateSuggestionPreview
        api={api}
        suggestion={previewing}
        adding={busy?.action === 'add'}
        onClose={() => setPreviewing(null)}
        onAdd={handleAdd}
      />
    </section>
  );
};

export default CrateSuggestions;
