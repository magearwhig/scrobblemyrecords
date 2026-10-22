import { AlertTriangle, CheckCircle2, Library, Square } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import './RecordStoreFilingStatus.css';

import { RecordStoreFilingStatus as FilingStatus } from '../../shared/types';
import { useApp } from '../context/AppContext';
import { getApiService } from '../services/api';
import { createLogger } from '../utils/logger';

import { Button } from './ui/Button';

const log = createLogger('RecordStoreFilingStatus');

const POLL_MS = 2000;

/** Rough minutes for a refresh: both queues run at about one request a second */
function estimateMinutes(status: FilingStatus): number {
  const seconds = Math.max(
    status.artists.missing * 1.2,
    status.masters.missing * 1.1
  );
  return Math.max(1, Math.round(seconds / 60));
}

const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;

interface RecordStoreFilingStatusProps {
  /** Called when a refresh finishes (or is stopped), e.g. to reload a list */
  onRefreshFinished?: () => void;
}

/**
 * How much record-store filing data is cached (MusicBrainz sort names,
 * Discogs original years), with a button to fetch what is missing. Used in
 * the Pocket List dialog and the Settings filing card.
 * See .plan/done/record-store-filing-plan.md, "UI".
 */
const RecordStoreFilingStatus: React.FC<RecordStoreFilingStatusProps> = ({
  onRefreshFinished,
}) => {
  const { state } = useApp();
  const api = getApiService(state.serverUrl);
  const [status, setStatus] = useState<FilingStatus | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const wasRunning = useRef(false);
  const onFinishedRef = useRef(onRefreshFinished);
  onFinishedRef.current = onRefreshFinished;

  const load = useCallback(async () => {
    try {
      const next = await api.getFilingStatus();
      setStatus(next);
      setLoadError(false);
      if (wasRunning.current && !next.job.running) {
        onFinishedRef.current?.();
      }
      wasRunning.current = next.job.running;
    } catch (error) {
      log.warn('Failed to load filing status', error);
      setLoadError(true);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const running = status?.job.running ?? false;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [running, load]);

  const start = async () => {
    setStarting(true);
    setActionError(null);
    try {
      const job = await api.startFilingRefresh();
      // Running from here on, even if the next status read fails or the job
      // finishes before it: polling starts, and the finish is reported
      wasRunning.current = true;
      setStatus(prev =>
        prev ? { ...prev, job: { ...job, running: true } } : prev
      );
      await load();
    } catch (error) {
      log.warn('Failed to start filing refresh', error);
      setActionError('Couldn’t start fetching filing data.');
    } finally {
      setStarting(false);
    }
  };

  const stop = async () => {
    try {
      await api.cancelFilingRefresh();
      await load();
    } catch (error) {
      log.warn('Failed to stop filing refresh', error);
    }
  };

  if (loadError && !status) {
    return (
      <div className='filing-status' aria-live='polite'>
        <p className='filing-status-line'>
          Couldn&apos;t check the record-store filing data.
        </p>
      </div>
    );
  }
  if (!status) {
    return (
      <div className='filing-status' aria-live='polite'>
        <p className='filing-status-line'>Checking record-store filing…</p>
      </div>
    );
  }

  const { artists, masters, job } = status;
  const missingAnything = artists.missing > 0 || masters.missing > 0;
  const filed = artists.musicbrainz + artists.override;

  return (
    <div className='filing-status' aria-live='polite'>
      <p className='filing-status-line'>
        <Library size={16} aria-hidden='true' />
        <span>
          Record-store filing: {filed.toLocaleString()} of{' '}
          {plural(artists.total, 'artist', 'artists')} filed by sort name
          {artists.override > 0 ? ` (${artists.override} yours)` : ''},{' '}
          {masters.cached.toLocaleString()} of{' '}
          {plural(masters.total, 'original year', 'original years')}
        </span>
      </p>

      {job.running ? (
        <div className='filing-status-progress'>
          <p className='filing-status-hint'>
            Fetching: artists {job.artistsDone.toLocaleString()} of{' '}
            {job.artistsTotal.toLocaleString()}, original years{' '}
            {job.mastersDone.toLocaleString()} of{' '}
            {job.mastersTotal.toLocaleString()}. You can close this and come
            back.
          </p>
          <Button
            size='small'
            variant='outline'
            onClick={() => void stop()}
            iconLeft={<Square size={16} aria-hidden='true' />}
          >
            Stop
          </Button>
        </div>
      ) : missingAnything ? (
        <div className='filing-status-progress'>
          <p className='filing-status-hint'>
            {artists.missing > 0 &&
              `${plural(artists.missing, 'artist', 'artists')} not looked up yet. `}
            {masters.missing > 0 &&
              `${plural(masters.missing, 'album', 'albums')} without an original year. `}
            Until then they file by name and pressing year.
          </p>
          <Button
            size='small'
            variant='outline'
            onClick={() => void start()}
            loading={starting}
            iconLeft={<Library size={16} aria-hidden='true' />}
          >
            Fetch filing data (about {estimateMinutes(status)} min)
          </Button>
        </div>
      ) : (
        <p className='filing-status-hint filing-status-hint--done'>
          <CheckCircle2 size={16} aria-hidden='true' />
          Filing data is up to date.
        </p>
      )}

      {!job.running && job.error && (
        <p className='filing-status-hint filing-status-hint--warning'>
          <AlertTriangle size={16} aria-hidden='true' />
          {job.error}
        </p>
      )}
      {!job.running && !job.error && job.failures > 0 && (
        <p className='filing-status-hint filing-status-hint--warning'>
          <AlertTriangle size={16} aria-hidden='true' />
          {plural(job.failures, 'lookup', 'lookups')} failed and will be tried
          again next time.
        </p>
      )}
      {actionError && (
        <p className='filing-status-hint filing-status-hint--warning'>
          <AlertTriangle size={16} aria-hidden='true' />
          {actionError}
        </p>
      )}
    </div>
  );
};

export default RecordStoreFilingStatus;
