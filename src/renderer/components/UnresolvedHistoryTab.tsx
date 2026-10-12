import {
  Ban,
  CheckCircle2,
  Eye,
  EyeOff,
  Link2,
  SearchX,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import {
  ExcludedHistoryArtist,
  ExclusionSuggestion,
  UnresolvedHistoryGroup,
  UnresolvedHistoryPage,
  UnresolvedHistorySummary,
  UnresolvedHistoryTrack,
  UnresolvedTrackResolution,
} from '../../shared/types';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { getApiService } from '../services/api';
import { createLogger } from '../utils/logger';

import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { EmptyState } from './ui/EmptyState';
import { ListItemSkeleton } from './ui/Skeleton';
import {
  ExcludeArtistsModal,
  ExcludeTarget,
} from './unresolved/ExcludeArtistsModal';
import { ExcludedArtistsList } from './unresolved/ExcludedArtistsList';
import { ExclusionSuggestionsPanel } from './unresolved/ExclusionSuggestionsPanel';
import { ResolutionRulesList } from './unresolved/ResolutionRulesList';
import { ResolveTrackModal } from './unresolved/ResolveTrackModal';
import {
  formatCount,
  formatPlayedRange,
  pluralize,
} from './unresolved/unresolvedFormat';
import { UnresolvedSummaryBanner } from './unresolved/UnresolvedSummaryBanner';
import './UnresolvedHistoryTab.css';

const logger = createLogger('UnresolvedHistoryTab');

type SortOption = 'plays' | 'artist' | 'recent';

export const UNRESOLVED_PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

interface ResolveTarget {
  group: UnresolvedHistoryGroup;
  track: UnresolvedHistoryTrack;
}

const suggestionTarget = (suggestion: ExclusionSuggestion): ExcludeTarget => {
  const unresolvedPlays = Math.round(
    suggestion.plays * suggestion.unresolvedShare
  );
  return {
    artist: suggestion.artist,
    artistName: suggestion.artistName,
    unresolvedPlays,
    albumPlays: Math.max(0, suggestion.plays - unresolvedPlays),
  };
};

const targetsLabel = (targets: { artistName: string }[]): string =>
  targets.length === 1
    ? targets[0].artistName
    : pluralize(targets.length, 'artist');

/**
 * History tab listing plays that have no album info ("unresolved"), with
 * tools to attribute them to albums, hide them, and recover missing history.
 */
const UnresolvedHistoryTab: React.FC = () => {
  const { state } = useApp();
  const api = getApiService(state.serverUrl);
  const { showToast } = useToast();

  const [summary, setSummary] = useState<UnresolvedHistorySummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [data, setData] = useState<UnresolvedHistoryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('plays');
  const [page, setPage] = useState(1);
  const [showHidden, setShowHidden] = useState(false);

  const [rulesOpen, setRulesOpen] = useState(false);
  const [rules, setRules] = useState<UnresolvedTrackResolution[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [removingRuleId, setRemovingRuleId] = useState<string | null>(null);

  const [suggestions, setSuggestions] = useState<ExclusionSuggestion[]>([]);
  const [excludedOpen, setExcludedOpen] = useState(false);
  const [excludedArtists, setExcludedArtists] = useState<
    ExcludedHistoryArtist[]
  >([]);
  const [excludedLoading, setExcludedLoading] = useState(false);
  const [restoringArtist, setRestoringArtist] = useState<string | null>(null);
  const [excludeTargets, setExcludeTargets] = useState<ExcludeTarget[] | null>(
    null
  );
  const [excluding, setExcluding] = useState(false);

  const [resolveTarget, setResolveTarget] = useState<ResolveTarget | null>(
    null
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // Only the latest request of each kind may update state
  const listSeq = useRef(0);
  const summarySeq = useRef(0);
  const suggestionsSeq = useRef(0);
  const excludedSeq = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadSummary = useCallback(async () => {
    const seq = ++summarySeq.current;
    setSummaryLoading(true);
    try {
      const result = await api.getUnresolvedHistorySummary();
      if (seq === summarySeq.current) setSummary(result);
    } catch (err) {
      logger.warn('Failed to load unresolved summary', err);
    } finally {
      if (seq === summarySeq.current) setSummaryLoading(false);
    }
  }, [api]);

  const loadSuggestions = useCallback(async () => {
    const seq = ++suggestionsSeq.current;
    try {
      const result = await api.getHistoryExclusionSuggestions();
      if (seq === suggestionsSeq.current) setSuggestions(result ?? []);
    } catch (err) {
      // Suggestions are optional; the panel simply stays hidden
      logger.warn('Failed to load exclusion suggestions', err);
    }
  }, [api]);

  const loadExcluded = useCallback(async () => {
    const seq = ++excludedSeq.current;
    setExcludedLoading(true);
    try {
      const result = await api.getExcludedHistoryArtists();
      if (seq === excludedSeq.current) setExcludedArtists(result ?? []);
    } catch (err) {
      logger.warn('Failed to load excluded artists', err);
      if (seq === excludedSeq.current) {
        showToast('error', 'Failed to load artists that are not tracked');
      }
    } finally {
      if (seq === excludedSeq.current) setExcludedLoading(false);
    }
  }, [api, showToast]);

  const loadList = useCallback(async () => {
    const seq = ++listSeq.current;
    setLoading(true);
    setError(null);
    try {
      const result = await api.getUnresolvedHistory({
        search: debouncedSearch || undefined,
        sort,
        page,
        limit: UNRESOLVED_PAGE_SIZE,
        includeHidden: showHidden,
      });
      if (seq !== listSeq.current) return;
      setData(result);
    } catch (err) {
      if (seq !== listSeq.current) return;
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load plays without album info'
      );
    } finally {
      if (seq === listSeq.current) setLoading(false);
    }
  }, [api, debouncedSearch, sort, page, showHidden]);

  const loadRules = useCallback(async () => {
    setRulesLoading(true);
    try {
      setRules(await api.getUnresolvedResolutions());
    } catch (err) {
      logger.warn('Failed to load resolution rules', err);
      showToast('error', 'Failed to load album rules');
    } finally {
      setRulesLoading(false);
    }
  }, [api, showToast]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (rulesOpen) loadRules();
  }, [rulesOpen, loadRules]);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  useEffect(() => {
    if (excludedOpen) loadExcluded();
  }, [excludedOpen, loadExcluded]);

  /** Refresh everything that a rule/hide/exclude/backfill change can affect. */
  const refreshAll = useCallback(() => {
    loadSummary();
    loadList();
    loadSuggestions();
    if (rulesOpen) loadRules();
    if (excludedOpen) loadExcluded();
  }, [
    loadSummary,
    loadList,
    loadSuggestions,
    loadRules,
    loadExcluded,
    rulesOpen,
    excludedOpen,
  ]);

  // Latest refreshAll, for toast actions that outlive the render they came from
  const refreshAllRef = useRef(refreshAll);
  refreshAllRef.current = refreshAll;

  const trackArtistsAgain = async (
    targets: { artist: string; artistName: string }[]
  ) => {
    if (targets.length === 1) setRestoringArtist(targets[0].artist);
    try {
      await api.includeHistoryArtists(targets.map(t => t.artist));
      showToast(
        'success',
        `${targetsLabel(targets)} ${targets.length === 1 ? 'is' : 'are'} tracked again. ${targets.length === 1 ? 'Its' : 'Their'} plays count in your listening stats.`
      );
      refreshAllRef.current();
    } catch (err) {
      logger.error('Failed to track artists again', err);
      showToast(
        'error',
        err instanceof Error ? err.message : 'Failed to track artist again'
      );
    } finally {
      setRestoringArtist(null);
    }
  };

  const confirmExclude = async (targets: ExcludeTarget[]) => {
    setExcluding(true);
    try {
      await api.excludeHistoryArtists(targets.map(t => t.artist));
      setExcludeTargets(null);
      showToast(
        'success',
        `Stopped tracking ${targetsLabel(targets)}. ${targets.length === 1 ? 'Its' : 'Their'} plays are left out of your listening stats.`,
        {
          action: {
            label: 'Undo',
            onClick: () => {
              void trackArtistsAgain(targets);
            },
          },
        }
      );
      refreshAllRef.current();
    } catch (err) {
      logger.error('Failed to exclude artists', err);
      showToast(
        'error',
        err instanceof Error ? err.message : 'Failed to stop tracking artist'
      );
    } finally {
      setExcluding(false);
    }
  };

  const excludeGroup = (group: UnresolvedHistoryGroup) => {
    const suggestion = suggestions.find(s => s.artist === group.artist);
    setExcludeTargets([
      suggestion
        ? suggestionTarget(suggestion)
        : {
            artist: group.artist,
            artistName: group.artistName,
            unresolvedPlays: group.playCount,
          },
    ]);
  };

  const handleUndoRule = async (rule: UnresolvedTrackResolution) => {
    setRemovingRuleId(rule.id);
    try {
      await api.deleteUnresolvedResolution(rule.id);
      showToast(
        'success',
        `Removed rule: ${rule.track} is back in the unresolved list`
      );
      refreshAll();
    } catch (err) {
      logger.error('Failed to remove rule', err);
      showToast(
        'error',
        err instanceof Error ? err.message : 'Failed to remove rule'
      );
    } finally {
      setRemovingRuleId(null);
    }
  };

  const setTrackHidden = async (
    track: UnresolvedHistoryTrack,
    hidden: boolean
  ) => {
    setBusyKey(track.key);
    try {
      if (hidden) {
        await api.hideUnresolvedTracks([track.key]);
        showToast(
          'success',
          `Hid "${track.track}". Its plays still count in your listening totals.`,
          {
            action: {
              label: 'Undo',
              onClick: () => {
                void setTrackHidden(track, false);
              },
            },
          }
        );
      } else {
        await api.unhideUnresolvedTracks([track.key]);
        showToast('success', `"${track.track}" is shown again`);
      }
      refreshAll();
    } catch (err) {
      logger.error('Failed to change hidden state', err);
      showToast(
        'error',
        err instanceof Error ? err.message : 'Failed to update track'
      );
    } finally {
      setBusyKey(null);
    }
  };

  const groups = data?.groups ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(
    1,
    Math.ceil(total / (data?.limit ?? UNRESOLVED_PAGE_SIZE))
  );

  // If the current page emptied (e.g. its last artist was resolved), step back
  useEffect(() => {
    if (data && data.groups.length === 0 && data.total > 0 && page > 1) {
      setPage(Math.max(1, Math.ceil(data.total / data.limit)));
    }
  }, [data, page]);

  const renderEmpty = () => {
    if (debouncedSearch) {
      return (
        <EmptyState
          icon={<SearchX size={48} aria-hidden='true' />}
          title='No matches'
          description={`No unresolved artists or tracks match "${debouncedSearch}".`}
          suggestion='Try a different artist or track name.'
        />
      );
    }
    if (summary && summary.unresolvedCount > 0 && !showHidden) {
      return (
        <EmptyState
          icon={<EyeOff size={48} aria-hidden='true' />}
          title='All remaining tracks are hidden'
          description='Hidden plays still count in your listening totals.'
          actions={[
            { label: 'Show hidden', onClick: () => setShowHidden(true) },
          ]}
        />
      );
    }
    return (
      <EmptyState
        icon={<CheckCircle2 size={48} aria-hidden='true' />}
        title='Every play has album info'
        description='All of your indexed plays are counted in album stats.'
      />
    );
  };

  return (
    <div className='unresolved-history'>
      <ExclusionSuggestionsPanel
        suggestions={suggestions}
        busy={excluding}
        onExclude={suggestion =>
          setExcludeTargets([suggestionTarget(suggestion)])
        }
        onExcludeAll={() =>
          setExcludeTargets(suggestions.map(suggestionTarget))
        }
      />

      <UnresolvedSummaryBanner
        summary={summary}
        loading={summaryLoading}
        rulesOpen={rulesOpen}
        onToggleRules={() => setRulesOpen(open => !open)}
        excludedOpen={excludedOpen}
        onToggleExcluded={() => setExcludedOpen(open => !open)}
        onBackfillComplete={refreshAll}
      />

      {excludedOpen && (
        <ExcludedArtistsList
          artists={excludedArtists}
          loading={excludedLoading}
          restoringArtist={restoringArtist}
          onTrackAgain={artist => {
            void trackArtistsAgain([artist]);
          }}
        />
      )}

      {rulesOpen && (
        <ResolutionRulesList
          rules={rules}
          loading={rulesLoading}
          removingId={removingRuleId}
          onUndo={handleUndoRule}
        />
      )}

      <div className='card unresolved-controls'>
        <div className='unresolved-controls-row'>
          <div className='unresolved-search'>
            <input
              type='search'
              className='form-input unresolved-search-input'
              placeholder='Search artists or tracks...'
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              aria-label='Search plays without album info'
            />
            {searchQuery && (
              <button
                type='button'
                className='unresolved-search-clear'
                onClick={() => setSearchQuery('')}
                aria-label='Clear search'
              >
                <X size={16} aria-hidden='true' />
              </button>
            )}
          </div>

          <div className='unresolved-sort'>
            <label htmlFor='unresolved-sort-select' className='form-label'>
              Sort by
            </label>
            <select
              id='unresolved-sort-select'
              className='form-select unresolved-sort-select'
              value={sort}
              onChange={e => {
                setSort(e.target.value as SortOption);
                setPage(1);
              }}
            >
              <option value='plays'>Most plays</option>
              <option value='artist'>Artist (A–Z)</option>
              <option value='recent'>Recently played</option>
            </select>
          </div>

          <label className='unresolved-show-hidden'>
            <input
              type='checkbox'
              checked={showHidden}
              onChange={e => {
                setShowHidden(e.target.checked);
                setPage(1);
              }}
            />
            Show hidden
          </label>
        </div>
        <p className='unresolved-controls-hint'>
          Hiding a track only removes it from this list. Its plays still count
          in your listening totals.
        </p>
      </div>

      {error && (
        <div className='card'>
          <div className='error-message'>
            {error}
            <Button size='small' onClick={loadList}>
              Retry
            </Button>
          </div>
        </div>
      )}

      {loading && groups.length === 0 && !error && (
        <div className='card'>
          <ListItemSkeleton count={5} />
        </div>
      )}

      {!loading && !error && groups.length === 0 && total === 0 && (
        <div className='card'>{renderEmpty()}</div>
      )}

      {groups.length > 0 && (
        <ul
          className='unresolved-groups'
          aria-label='Artists with plays without album info'
          aria-busy={loading}
        >
          {groups.map(group => (
            <li key={group.artist} className='card unresolved-group'>
              <div className='unresolved-group-header'>
                <h3 className='unresolved-group-artist'>{group.artistName}</h3>
                <div className='unresolved-group-side'>
                  <span className='unresolved-group-meta'>
                    {pluralize(group.playCount, 'play')} ·{' '}
                    {pluralize(group.tracks.length, 'track')}
                  </span>
                  <Button
                    variant='ghost'
                    size='small'
                    onClick={() => excludeGroup(group)}
                    disabled={excluding}
                    aria-label={`Don't track this artist: ${group.artistName}`}
                    title='Leave all of this artist’s plays out of listening stats (e.g. podcasts)'
                    iconLeft={<Ban size={16} aria-hidden='true' />}
                  >
                    Don&apos;t track this artist
                  </Button>
                </div>
              </div>
              <ul
                className='unresolved-tracks'
                aria-label={`Tracks by ${group.artistName}`}
              >
                {group.tracks.map(track => (
                  <li
                    key={track.key}
                    className={`unresolved-track${track.hidden ? ' unresolved-track--hidden' : ''}`}
                  >
                    <div className='unresolved-track-info'>
                      <span className='unresolved-track-name'>
                        {track.track}
                        {track.hidden && (
                          <Badge size='small' variant='secondary'>
                            Hidden
                          </Badge>
                        )}
                      </span>
                      <span className='unresolved-track-meta'>
                        {pluralize(track.playCount, 'play')} ·{' '}
                        {formatPlayedRange(track.firstPlayed, track.lastPlayed)}
                      </span>
                    </div>
                    <div className='unresolved-track-actions'>
                      <Button
                        variant='secondary'
                        size='small'
                        onClick={() => setResolveTarget({ group, track })}
                        aria-label={`Add album for ${track.track} by ${group.artistName}`}
                        iconLeft={<Link2 size={16} aria-hidden='true' />}
                      >
                        Add album
                      </Button>
                      <Button
                        variant='ghost'
                        size='small'
                        onClick={() => setTrackHidden(track, !track.hidden)}
                        loading={busyKey === track.key}
                        aria-label={`${track.hidden ? 'Show' : 'Hide'} ${track.track} by ${group.artistName}`}
                        title={
                          track.hidden
                            ? 'Show this track in the list again'
                            : 'Hide from this list. Plays still count in totals.'
                        }
                        iconLeft={
                          track.hidden ? (
                            <Eye size={16} aria-hidden='true' />
                          ) : (
                            <EyeOff size={16} aria-hidden='true' />
                          )
                        }
                      >
                        {track.hidden ? 'Show' : 'Hide'}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav
          className='card unresolved-pagination'
          aria-label='Unresolved history pages'
        >
          <Button
            variant='secondary'
            size='small'
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
          >
            Previous
          </Button>
          <span className='unresolved-page-info'>
            Page {formatCount(page)} of {formatCount(totalPages)} (
            {pluralize(total, 'artist')})
          </span>
          <Button
            variant='secondary'
            size='small'
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
          >
            Next
          </Button>
        </nav>
      )}

      <ExcludeArtistsModal
        targets={excludeTargets}
        busy={excluding}
        onCancel={() => setExcludeTargets(null)}
        onConfirm={targets => {
          void confirmExclude(targets);
        }}
      />

      <ResolveTrackModal
        group={resolveTarget?.group ?? null}
        track={resolveTarget?.track ?? null}
        onClose={() => setResolveTarget(null)}
        onSaved={refreshAll}
      />
    </div>
  );
};

export default UnresolvedHistoryTab;
