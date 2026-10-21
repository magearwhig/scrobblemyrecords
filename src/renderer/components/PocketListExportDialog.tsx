import { AlertTriangle, CheckCircle2, FileDown, RotateCcw } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import './PocketListExportDialog.css';

import {
  ExportSnapshotMeta,
  PocketListKind,
  PocketListOptions,
  PocketListWishlistSource,
} from '../../shared/types';
import { useApp } from '../context/AppContext';
import { getApiService } from '../services/api';
import { formatLocalDateOnly } from '../utils/dateUtils';
import { downloadBlob } from '../utils/downloadBlob';
import { createLogger } from '../utils/logger';

import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

const log = createLogger('PocketListExportDialog');

/** localStorage key for the last-used options (convenience only) */
export const POCKET_LIST_OPTIONS_KEY = 'listenography.pocketListOptions';

export type PocketListChoice = PocketListKind | 'both';

interface RememberedOptions {
  wishlistSources: PocketListWishlistSource[];
  details: PocketListOptions['details'];
  flagOwnedVersions: boolean;
}

const DEFAULT_OPTIONS: RememberedOptions = {
  wishlistSources: ['discogs-want', 'local-want'],
  details: { format: true, pressing: true, notes: false },
  flagOwnedVersions: true,
};

const SOURCE_LABELS: Record<PocketListWishlistSource, string> = {
  'discogs-want': 'Discogs wantlist',
  'local-want': 'Monitored (local) wants',
};

const DETAIL_LABELS: Record<keyof PocketListOptions['details'], string> = {
  format: 'Format',
  pressing: 'Pressing (year, label)',
  notes: 'Notes',
};

const LIST_CHOICES: { value: PocketListChoice; label: string }[] = [
  { value: 'wishlist', label: 'Wishlist' },
  { value: 'collection', label: 'Collection' },
  { value: 'both', label: 'Both' },
];

function readRememberedOptions(): RememberedOptions {
  try {
    const raw = localStorage.getItem(POCKET_LIST_OPTIONS_KEY);
    if (!raw) return DEFAULT_OPTIONS;
    const parsed = JSON.parse(raw) as Partial<RememberedOptions>;
    const sources = Array.isArray(parsed.wishlistSources)
      ? parsed.wishlistSources.filter(
          (s): s is PocketListWishlistSource => s in SOURCE_LABELS
        )
      : DEFAULT_OPTIONS.wishlistSources;
    const details = parsed.details ?? DEFAULT_OPTIONS.details;
    return {
      wishlistSources: sources,
      details: {
        format: details.format === true,
        pressing: details.pressing === true,
        notes: details.notes === true,
      },
      flagOwnedVersions:
        typeof parsed.flagOwnedVersions === 'boolean'
          ? parsed.flagOwnedVersions
          : DEFAULT_OPTIONS.flagOwnedVersions,
    };
  } catch {
    return DEFAULT_OPTIONS;
  }
}

function writeRememberedOptions(options: RememberedOptions): void {
  try {
    localStorage.setItem(POCKET_LIST_OPTIONS_KEY, JSON.stringify(options));
  } catch {
    // Storage unavailable (private mode, quota): remembering is optional
  }
}

function formatIsoDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : formatLocalDateOnly(date);
}

function listsForChoice(choice: PocketListChoice): PocketListKind[] {
  return choice === 'both' ? ['wishlist', 'collection'] : [choice];
}

type DownloadState =
  | { status: 'idle' }
  | { status: 'downloading' }
  | { status: 'success'; filename: string }
  | { status: 'error'; message: string };

export interface PocketListExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** The list preselected by the entry point */
  initialList: PocketListKind;
}

/**
 * Options dialog for the Pocket List PDF (an offline wishlist / collection
 * checklist for record shopping). See .plan/done/pocket-list-export-plan.md.
 */
const PocketListExportDialog: React.FC<PocketListExportDialogProps> = ({
  isOpen,
  onClose,
  initialList,
}) => {
  const { state } = useApp();
  const api = getApiService(state.serverUrl);

  const [choice, setChoice] = useState<PocketListChoice>(initialList);
  const [options, setOptions] = useState<RememberedOptions>(
    readRememberedOptions
  );
  const [meta, setMeta] = useState<ExportSnapshotMeta | null>(null);
  const [metaError, setMetaError] = useState(false);
  const [download, setDownload] = useState<DownloadState>({ status: 'idle' });
  const abortRef = useRef<AbortController | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const focusStatusRef = useRef(false);

  // Re-initialise each time the dialog opens
  useEffect(() => {
    if (!isOpen) return;
    setChoice(initialList);
    setOptions(readRememberedOptions());
    setDownload({ status: 'idle' });
    setMeta(null);
    setMetaError(false);

    let cancelled = false;
    api
      .getExportMeta()
      .then(result => {
        if (!cancelled) setMeta(result);
      })
      .catch(error => {
        log.warn('Failed to load export meta', error);
        if (!cancelled) setMetaError(true);
      });
    return () => {
      cancelled = true;
      // Closing (or unmounting) cancels a PDF still being generated, so it
      // isn't saved after the user dismissed the dialog
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [isOpen, initialList, api]);

  // "Try again" sits in the error alert, which unmounts on retry; move focus
  // to the status line once it renders so keyboard focus stays in the dialog
  useEffect(() => {
    if (focusStatusRef.current && download.status === 'downloading') {
      focusStatusRef.current = false;
      statusRef.current?.focus();
    }
  }, [download.status]);

  const lists = listsForChoice(choice);
  const includesWishlist = lists.includes('wishlist');
  const includesCollection = lists.includes('collection');
  const downloading = download.status === 'downloading';
  const missingSource =
    includesWishlist && options.wishlistSources.length === 0;
  const canDownload = lists.length > 0 && !missingSource && !downloading;

  const updateOptions = (patch: Partial<RememberedOptions>) => {
    setOptions(prev => ({ ...prev, ...patch }));
    if (download.status !== 'downloading') setDownload({ status: 'idle' });
  };

  const toggleSource = (source: PocketListWishlistSource) => {
    const has = options.wishlistSources.includes(source);
    // Keep a stable order regardless of click order
    const next = (
      Object.keys(SOURCE_LABELS) as PocketListWishlistSource[]
    ).filter(s => (s === source ? !has : options.wishlistSources.includes(s)));
    updateOptions({ wishlistSources: next });
  };

  const toggleDetail = (key: keyof PocketListOptions['details']) => {
    updateOptions({
      details: { ...options.details, [key]: !options.details[key] },
    });
  };

  const handleDownload = async () => {
    if (!canDownload) return;
    const payload: PocketListOptions = {
      lists,
      wishlistSources: includesWishlist ? options.wishlistSources : [],
      details: options.details,
      flagOwnedVersions: options.flagOwnedVersions,
    };
    writeRememberedOptions(options);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setDownload({ status: 'downloading' });
    try {
      const { blob, filename } = await api.exportPocketList(
        payload,
        controller.signal
      );
      // Superseded by a newer request, or the dialog was closed
      if (controller.signal.aborted) return;
      abortRef.current = null;
      downloadBlob(blob, filename);
      setDownload({ status: 'success', filename });
    } catch (error) {
      // Superseded by a newer request, or the dialog was closed
      if (controller.signal.aborted) return;
      abortRef.current = null;
      setDownload({
        status: 'error',
        message:
          error instanceof Error && error.message
            ? error.message
            : 'Pocket List export failed',
      });
    }
  };

  const renderFreshness = () => {
    if (metaError) {
      return (
        <p className='pocket-list-freshness-line'>
          Couldn&apos;t check how fresh your data is.
        </p>
      );
    }
    if (!meta) {
      return (
        <p className='pocket-list-freshness-line'>Checking data freshness…</p>
      );
    }

    const lines: React.ReactNode[] = [];
    if (includesWishlist) {
      const synced = formatIsoDate(meta.wishlistUpdatedAt);
      lines.push(
        <p key='wishlist' className='pocket-list-freshness-line'>
          {synced ? `Wishlist synced ${synced}` : 'Wishlist not synced yet'}
        </p>
      );
    }

    // The collection matters for collection exports, and for owned flags
    const collectionMatters =
      includesCollection || (includesWishlist && options.flagOwnedVersions);
    if (collectionMatters) {
      const cache = meta.collectionCache;
      if (cache.status === 'missing') {
        lines.push(
          <p
            key='collection'
            className='pocket-list-freshness-line pocket-list-freshness-line--warning'
          >
            <AlertTriangle size={16} aria-hidden='true' />
            {includesCollection
              ? 'No collection cache yet. Sync your collection first.'
              : 'No collection cache yet, so owned versions can’t be flagged.'}
          </p>
        );
      } else if (cache.status === 'partial') {
        const expected = cache.pagesExpected ?? '?';
        lines.push(
          <p
            key='collection'
            className='pocket-list-freshness-line pocket-list-freshness-line--warning'
          >
            <AlertTriangle size={16} aria-hidden='true' />
            {`${cache.pagesRead} of ${expected} collection pages cached`}
          </p>
        );
      } else {
        const cached = formatIsoDate(meta.collectionCachedAt);
        lines.push(
          <p key='collection' className='pocket-list-freshness-line'>
            {cached ? `Collection cached ${cached}` : 'Collection cached'}
          </p>
        );
      }
    }
    return lines;
  };

  const footer = (
    <>
      <Button variant='secondary' onClick={onClose}>
        {download.status === 'success' ? 'Done' : 'Cancel'}
      </Button>
      <Button
        onClick={handleDownload}
        disabled={!canDownload}
        loading={downloading}
        iconLeft={<FileDown size={16} aria-hidden='true' />}
      >
        {downloading ? 'Generating PDF…' : 'Download PDF'}
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title='Pocket List PDF'
      size='medium'
      className='pocket-list-dialog'
      closeOnOverlayClick={!downloading}
      closeOnEscape={!downloading}
      footer={footer}
    >
      <p className='pocket-list-intro'>
        A compact, offline checklist to take record shopping.
      </p>

      <fieldset className='pocket-list-fieldset'>
        <legend className='pocket-list-legend'>List</legend>
        <div className='pocket-list-options'>
          {LIST_CHOICES.map(({ value, label }) => (
            <label key={value} className='pocket-list-option'>
              <input
                type='radio'
                name='pocket-list-choice'
                value={value}
                checked={choice === value}
                onChange={() => {
                  setChoice(value);
                  if (!downloading) setDownload({ status: 'idle' });
                }}
                disabled={downloading}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {includesWishlist && (
        <fieldset className='pocket-list-fieldset'>
          <legend className='pocket-list-legend'>Wishlist sources</legend>
          <div className='pocket-list-options'>
            {(Object.keys(SOURCE_LABELS) as PocketListWishlistSource[]).map(
              source => (
                <label key={source} className='pocket-list-option'>
                  <input
                    type='checkbox'
                    checked={options.wishlistSources.includes(source)}
                    onChange={() => toggleSource(source)}
                    disabled={downloading}
                  />
                  {SOURCE_LABELS[source]}
                </label>
              )
            )}
          </div>
          {missingSource && (
            <p className='pocket-list-field-hint' role='status'>
              Choose at least one wishlist source.
            </p>
          )}
        </fieldset>
      )}

      <fieldset className='pocket-list-fieldset'>
        <legend className='pocket-list-legend'>Details</legend>
        <div className='pocket-list-options'>
          {(
            Object.keys(DETAIL_LABELS) as (keyof PocketListOptions['details'])[]
          ).map(key => (
            <label key={key} className='pocket-list-option'>
              <input
                type='checkbox'
                checked={options.details[key]}
                onChange={() => toggleDetail(key)}
                disabled={downloading}
              />
              {DETAIL_LABELS[key]}
            </label>
          ))}
        </div>
      </fieldset>

      {includesWishlist && (
        <label className='pocket-list-option pocket-list-flag-owned'>
          <input
            type='checkbox'
            checked={options.flagOwnedVersions}
            onChange={() =>
              updateOptions({ flagOwnedVersions: !options.flagOwnedVersions })
            }
            disabled={downloading}
          />
          Flag wanted albums I already own a version of
        </label>
      )}

      <div className='pocket-list-freshness' aria-live='polite'>
        {renderFreshness()}
        <p className='pocket-list-freshness-hint'>
          Sync first for an up-to-date list.
        </p>
      </div>

      <div
        ref={statusRef}
        tabIndex={-1}
        className='pocket-list-status'
        aria-live='polite'
      >
        {downloading && (
          <p className='pocket-list-status-text'>
            Generating your Pocket List. This can take up to a minute.
          </p>
        )}
        {download.status === 'success' && (
          <div className='pocket-list-result pocket-list-result--success'>
            <CheckCircle2 size={16} aria-hidden='true' />
            <div>
              <p className='pocket-list-result-title'>
                Saved {download.filename}
              </p>
              <p className='pocket-list-result-text'>
                Move it to your phone with AirDrop, email, or a cloud drive.
              </p>
            </div>
          </div>
        )}
      </div>
      {download.status === 'error' && (
        <div
          className='pocket-list-result pocket-list-result--error'
          role='alert'
        >
          <AlertTriangle size={16} aria-hidden='true' />
          <p className='pocket-list-result-text'>{download.message}</p>
          <Button
            size='small'
            variant='outline'
            onClick={() => {
              focusStatusRef.current = true;
              void handleDownload();
            }}
            disabled={!canDownload}
            iconLeft={<RotateCcw size={16} aria-hidden='true' />}
          >
            Try again
          </Button>
        </div>
      )}
    </Modal>
  );
};

export default PocketListExportDialog;
