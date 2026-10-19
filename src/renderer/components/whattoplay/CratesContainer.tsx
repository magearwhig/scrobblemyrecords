import { Boxes, ExternalLink, Link2Off, Plus, Shuffle } from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  Crate,
  CrateAlbumResult,
  CrateEvaluation,
  CrateRuleOutcome,
  CrateSuggestion,
  CrateSummary,
} from '../../../shared/types';
import { formatCrateReason } from '../../../shared/utils/crateReasons';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { ROUTES, navigate } from '../../routes';
import { getApiService } from '../../services/api';
import { createLogger } from '../../utils/logger';
import AlbumLink from '../AlbumLink';
import ArtistLink from '../ArtistLink';
import CrateCover from '../crates/CrateCover';
import { apiErrorInfo } from '../crates/crateRuleModel';
import { openCrateRelease } from '../crates/openCrateRelease';
import { Button, EmptyState } from '../ui';
import { ErrorState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';

import './CratesContainer.css';

const logger = createLogger('CratesContainer');

const INLINE_REASONS = 2;

const OUTCOME_ORDER: Record<CrateRuleOutcome, number> = {
  match: 0,
  unknown: 1,
  noMatch: 2,
};

interface CrateDetail {
  crate: Crate;
  evaluation: CrateEvaluation;
}

type PickState =
  | { status: 'loading'; crateId: string }
  | { status: 'error'; crateId: string; message: string }
  | { status: 'empty'; crateId: string }
  | { status: 'picked'; crateId: string; index: number };

/** A random index in [0, count), different from `avoid` when possible */
export function pickIndex(count: number, avoid?: number): number {
  if (count <= 1 || avoid === undefined || avoid < 0 || avoid >= count) {
    return Math.floor(Math.random() * count);
  }
  const index = Math.floor(Math.random() * (count - 1));
  return index >= avoid ? index + 1 : index;
}

function crateHref(id: string): string {
  return `#${ROUTES.CRATES}?id=${encodeURIComponent(id)}`;
}

function firstReasons(album: CrateAlbumResult, detail: CrateDetail): string[] {
  const ctx = {
    copies: album.copies,
    historyFrom: detail.evaluation.coverage.historyFrom,
    listening: album.listening,
  };
  return album.results
    .map(result => ({
      result,
      rule: detail.crate.rules.find(r => r.id === result.ruleId),
    }))
    .filter(
      (
        entry
      ): entry is typeof entry & { rule: NonNullable<typeof entry.rule> } =>
        entry.rule !== undefined
    )
    .sort(
      (a, b) =>
        OUTCOME_ORDER[a.result.outcome] - OUTCOME_ORDER[b.result.outcome]
    )
    .slice(0, INLINE_REASONS)
    .map(({ rule, result }) => formatCrateReason(rule, result, ctx));
}

/**
 * What to Play > Crates: pinned crates with "Pick one", a random album from
 * the crate shown with why it's there and a link to its witness copy.
 */
const CratesContainer: React.FC = () => {
  const { state } = useApp();
  const { authStatus } = useAuth();
  const api = useMemo(() => getApiService(state.serverUrl), [state.serverUrl]);
  const discogsConnected = authStatus.discogs.authenticated;

  const [pinned, setPinned] = useState<CrateSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, CrateDetail>>({});
  const [pick, setPick] = useState<PickState | null>(null);
  const [suggestion, setSuggestion] = useState<CrateSuggestion | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  // Only the latest "Pick one" may update the panel
  const pickSeq = useRef(0);

  const loadPinned = useCallback(async () => {
    setListError(null);
    try {
      const list = await api.getCrates();
      const pins = list.filter(crate => crate.pinnedToWhatToPlay);
      setPinned(pins);
      if (pins.length === 0) {
        api
          .getCrateSuggestions(1)
          .then(response => setSuggestion(response.suggestions[0] ?? null))
          .catch(err => {
            // Suggestions are optional here; the empty state still works
            logger.warn('Failed to load crate suggestion', err);
            setSuggestion(null);
          });
      }
    } catch (err) {
      logger.error('Failed to load crates', err);
      setListError(apiErrorInfo(err).message);
    }
  }, [api]);

  useEffect(() => {
    if (!discogsConnected) return;
    loadPinned();
  }, [discogsConnected, loadPinned]);

  /**
   * "Pick one" re-evaluates the crate (scrobbles may have synced since);
   * "Pick another" reuses the loaded evaluation.
   */
  const handlePick = useCallback(
    async (crateId: string, reuse = false) => {
      const seq = ++pickSeq.current;
      const current = pick?.status === 'picked' ? pick : null;
      let detail: CrateDetail | undefined = reuse
        ? details[crateId]
        : undefined;
      if (!detail) {
        setPick({ status: 'loading', crateId });
        try {
          detail = await api.getCrate(crateId);
        } catch (err) {
          if (seq !== pickSeq.current) return;
          logger.error('Failed to load crate', err);
          setPick({
            status: 'error',
            crateId,
            message: apiErrorInfo(err).message,
          });
          return;
        }
        if (seq !== pickSeq.current) return;
        const loaded = detail;
        setDetails(prev => ({ ...prev, [crateId]: loaded }));
      }
      const count = detail.evaluation.albums.length;
      if (count === 0) {
        setPick({ status: 'empty', crateId });
        return;
      }
      const avoid =
        current && current.crateId === crateId ? current.index : undefined;
      setPick({ status: 'picked', crateId, index: pickIndex(count, avoid) });
    },
    [api, details, pick]
  );

  const handleAddSuggestion = useCallback(async () => {
    if (!suggestion) return;
    setAdding(true);
    setAddError(null);
    try {
      await api.createCrate({
        name: suggestion.name,
        description: suggestion.description,
        rules: suggestion.rules,
        sort: suggestion.sort,
        pinnedToWhatToPlay: true,
        sourceSuggestionKey: suggestion.candidateKey,
      });
      setSuggestion(null);
      await loadPinned();
    } catch (err) {
      logger.error('Failed to add suggested crate', err);
      setAddError(apiErrorInfo(err).message);
    } finally {
      setAdding(false);
    }
  }, [api, suggestion, loadPinned]);

  if (!discogsConnected) {
    return (
      <EmptyState
        icon={<Link2Off size={40} aria-hidden='true' />}
        title='Connect Discogs to use crates'
        description='Crates are built from your Discogs collection.'
        actions={[
          {
            label: 'Go to connections',
            onClick: () => navigate(ROUTES.SETTINGS, { tab: 'connections' }),
          },
        ]}
      />
    );
  }

  if (listError) {
    return (
      <ErrorState
        description={listError}
        actions={[{ label: 'Try again', onClick: loadPinned }]}
      />
    );
  }

  if (!pinned) {
    return (
      <div className='wtp-crates-loading' aria-hidden='true'>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} variant='rectangular' height={72} width='100%' />
        ))}
      </div>
    );
  }

  if (pinned.length === 0) {
    return (
      <div className='wtp-crates-empty'>
        <EmptyState
          icon={<Boxes size={40} aria-hidden='true' />}
          title='Pin a crate to see it here'
          description='Pinned crates appear on this tab, ready for a random pick.'
          actions={[
            { label: 'Go to Crates', onClick: () => navigate(ROUTES.CRATES) },
          ]}
        />
        {suggestion && (
          <section
            className='wtp-crates-suggestion'
            aria-label='Suggested crate'
          >
            <div className='wtp-crates-suggestion-body'>
              <span className='wtp-crates-eyebrow'>Suggested crate</span>
              <h3 className='wtp-crates-suggestion-name'>{suggestion.name}</h3>
              <p className='wtp-crates-suggestion-text'>
                {suggestion.description}
              </p>
              <p className='wtp-crates-suggestion-reason'>
                {suggestion.reason}
              </p>
              <p className='wtp-crates-count'>
                {suggestion.count.toLocaleString('en-US')}{' '}
                {suggestion.count === 1 ? 'album' : 'albums'}
              </p>
              {addError && (
                <p className='wtp-crates-error' role='alert'>
                  {addError}
                </p>
              )}
            </div>
            <Button
              size='small'
              iconLeft={<Plus size={16} aria-hidden='true' />}
              loading={adding}
              onClick={handleAddSuggestion}
              aria-label={`Add and pin crate ${suggestion.name}`}
            >
              Add and pin
            </Button>
          </section>
        )}
      </div>
    );
  }

  const renderPick = () => {
    if (!pick) {
      return (
        <div className='wtp-crates-pick-placeholder'>
          <Shuffle size={20} aria-hidden='true' />
          <p>Choose Pick one on a crate for a random album from it.</p>
        </div>
      );
    }
    const summary = pinned.find(crate => crate.id === pick.crateId);
    const crateName = details[pick.crateId]?.crate.name ?? summary?.name ?? '';

    if (pick.status === 'loading') {
      return (
        <div className='wtp-crates-pick-loading' aria-hidden='true'>
          <Skeleton variant='rectangular' width={160} height={160} />
          <div className='wtp-crates-pick-loading-text'>
            <Skeleton variant='text' height={24} width='60%' />
            <Skeleton variant='text' height={16} width='40%' />
            <Skeleton variant='text' height={14} width='80%' />
          </div>
        </div>
      );
    }
    if (pick.status === 'error') {
      return (
        <ErrorState
          size='small'
          description={pick.message}
          actions={[
            { label: 'Try again', onClick: () => handlePick(pick.crateId) },
          ]}
        />
      );
    }
    if (pick.status === 'empty') {
      return (
        <EmptyState
          size='small'
          icon={<Boxes size={32} aria-hidden='true' />}
          title='No albums in this crate right now'
          description={`"${crateName}" has no albums to pick from.`}
        />
      );
    }

    const detail = details[pick.crateId];
    const album = detail?.evaluation.albums[pick.index];
    if (!detail || !album) return null;
    const reasons = firstReasons(album, detail);
    const count = detail.evaluation.albums.length;

    return (
      <article className='wtp-crates-picked' aria-label='Picked album'>
        <CrateCover url={album.coverUrl} title={album.album} size='large' />
        <div className='wtp-crates-picked-body'>
          <span className='wtp-crates-eyebrow'>From {crateName}</span>
          <AlbumLink
            artist={album.artist}
            album={album.album}
            className='wtp-crates-picked-album'
          />
          <ArtistLink
            artist={album.artist}
            className='wtp-crates-picked-artist'
          />
          {reasons.length > 0 && (
            <ul className='wtp-crates-reasons'>
              {reasons.map(reason => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          <div className='wtp-crates-picked-actions'>
            <Button
              size='small'
              iconLeft={<ExternalLink size={16} aria-hidden='true' />}
              onClick={() => openCrateRelease(album, ROUTES.WHAT_TO_PLAY)}
            >
              Open release
            </Button>
            <Button
              size='small'
              variant='secondary'
              iconLeft={<Shuffle size={16} aria-hidden='true' />}
              onClick={() => handlePick(pick.crateId, true)}
              disabled={count < 2}
              title={count < 2 ? 'This crate has one album' : undefined}
            >
              Pick another
            </Button>
            <a className='wtp-crates-link' href={crateHref(pick.crateId)}>
              Open crate
            </a>
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className='wtp-crates'>
      <ul className='wtp-crates-list' aria-label='Pinned crates'>
        {pinned.map(crate => {
          const active = pick?.crateId === crate.id;
          return (
            <li
              key={crate.id}
              className={`wtp-crate-card ${active ? 'wtp-crate-card--active' : ''}`}
            >
              <CrateCover
                url={crate.sampleCovers[0]}
                title={crate.name}
                size='small'
              />
              <div className='wtp-crate-card-body'>
                <h3 className='wtp-crate-card-name'>{crate.name}</h3>
                <p className='wtp-crates-count'>
                  {crate.count.toLocaleString('en-US')}{' '}
                  {crate.count === 1 ? 'album' : 'albums'}
                </p>
                <a className='wtp-crates-link' href={crateHref(crate.id)}>
                  Open crate
                </a>
              </div>
              <Button
                size='small'
                variant={active ? 'primary' : 'secondary'}
                iconLeft={<Shuffle size={16} aria-hidden='true' />}
                onClick={() => handlePick(crate.id)}
                disabled={crate.count === 0}
                aria-label={`Pick one from ${crate.name}`}
              >
                Pick one
              </Button>
            </li>
          );
        })}
      </ul>
      <section className='wtp-crates-pick' aria-live='polite'>
        {renderPick()}
      </section>
    </div>
  );
};

export default CratesContainer;
