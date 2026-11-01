import { useCallback, useMemo, useRef, useState } from 'react';

import {
  WishlistPriorityChange,
  WishlistPriorityRecord,
  WishlistPrioritySnapshot,
} from '../../shared/types';
import { useToast } from '../context/ToastContext';
import { getApiService } from '../services/api';
import { createLogger } from '../utils/logger';

const logger = createLogger('useWishlistPriorities');

const EMPTY: WishlistPrioritySnapshot = { ranked: [], unranked: [] };

const byName = (a: WishlistPriorityRecord, b: WishlistPriorityRecord) =>
  a.artist.localeCompare(b.artist, undefined, { sensitivity: 'base' }) ||
  a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });

function findRecord(
  snapshot: WishlistPrioritySnapshot,
  key: string
): WishlistPriorityRecord | undefined {
  return [...snapshot.ranked, ...snapshot.unranked].find(r => r.key === key);
}

/** What the list looks like after a change, shown before the server replies */
export function applyChangeToSnapshot(
  snapshot: WishlistPrioritySnapshot,
  change: WishlistPriorityChange
): WishlistPrioritySnapshot {
  const record = findRecord(snapshot, change.key);
  if (!record) return snapshot;
  const ranked = snapshot.ranked.filter(r => r.key !== change.key);
  const unranked = snapshot.unranked.filter(r => r.key !== change.key);
  if (change.action === 'move') {
    ranked.splice(change.position - 1, 0, record);
  } else {
    unranked.push(record);
    unranked.sort(byName);
  }
  return {
    ranked: ranked.map((r, i) => ({ ...r, rank: i + 1 })),
    unranked: unranked.map(r => ({ ...r, rank: null })),
  };
}

function errorMessage(err: unknown, fallback: string): string {
  const serverError = (err as { response?: { data?: { error?: unknown } } })
    ?.response?.data?.error;
  if (typeof serverError === 'string' && serverError) return serverError;
  return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * The wishlist's priority order. Changes show at once and save one at a time,
 * in order; a failed save reloads the saved order.
 */
export function useWishlistPriorities(serverUrl: string) {
  const api = getApiService(serverUrl);
  const { showToast } = useToast();
  const [snapshot, setSnapshotState] =
    useState<WishlistPrioritySnapshot>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Changes once the server holds an order, not while moves are still queued
  const [confirmedRanking, setConfirmedRanking] = useState('');

  // Read by quick successive actions, ahead of the next render
  const snapshotRef = useRef(snapshot);
  // The order the server last confirmed, to go back to if a save fails
  const confirmedRef = useRef(snapshot);
  const setSnapshot = useCallback((next: WishlistPrioritySnapshot) => {
    snapshotRef.current = next;
    setSnapshotState(next);
  }, []);
  const publishConfirmed = useCallback(() => {
    setConfirmedRanking(confirmedRef.current.ranked.map(r => r.key).join());
  }, []);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const savesPending = useRef(0);
  const loadRequest = useRef(0);
  const reloadAfterSaves = useRef(false);

  const reload = useCallback(async () => {
    // A save's reply may predate whatever asked for this, so read after it
    if (savesPending.current > 0) {
      reloadAfterSaves.current = true;
      return;
    }
    reloadAfterSaves.current = false;
    const request = ++loadRequest.current;
    try {
      const next = await api.getWishlistPriorities();
      if (request !== loadRequest.current || savesPending.current > 0) return;
      confirmedRef.current = next;
      setSnapshot(next);
      publishConfirmed();
      setLoadError(null);
    } catch (err) {
      if (request !== loadRequest.current) return;
      logger.warn('Could not load wishlist priorities', err);
      setLoadError(errorMessage(err, 'Could not load your priorities'));
    } finally {
      if (request === loadRequest.current) setLoaded(true);
    }
  }, [api, publishConfirmed, setSnapshot]);

  const save = useCallback(
    (change: WishlistPriorityChange): Promise<boolean> => {
      setSnapshot(applyChangeToSnapshot(snapshotRef.current, change));
      savesPending.current++;
      // A read already on its way would bring back the order before this save
      loadRequest.current++;
      const run = saveQueue.current.then(async () => {
        try {
          const saved = await api.changeWishlistPriority(change);
          confirmedRef.current = saved;
          savesPending.current--;
          if (savesPending.current === 0) {
            setSnapshot(saved);
            publishConfirmed();
            if (reloadAfterSaves.current) void reload();
          }
          return true;
        } catch (err) {
          savesPending.current--;
          showToast(
            'error',
            errorMessage(err, 'Could not save your priorities')
          );
          if (savesPending.current === 0) {
            setSnapshot(confirmedRef.current);
            publishConfirmed();
          }
          await reload();
          return false;
        }
      });
      saveQueue.current = run;
      return run;
    },
    [api, publishConfirmed, reload, setSnapshot, showToast]
  );

  /**
   * Put a record back where it was: below the record it followed, which
   * still holds if other records have moved since. `rank` is the fallback for
   * when that record has gone too.
   */
  const restore = useCallback(
    (key: string, rank: number | null, followed: string | null) => {
      if (rank === null) {
        void save({ action: 'unrank', key });
        return;
      }
      const others = snapshotRef.current.ranked.filter(r => r.key !== key);
      const above = others.findIndex(r => r.key === followed);
      void save({
        action: 'move',
        key,
        position:
          followed === null
            ? 1
            : above >= 0
              ? above + 2
              : Math.min(rank, others.length + 1),
      });
    },
    [save]
  );

  /** The ranked record just above this one */
  const followedBy = (record: WishlistPriorityRecord): string | null =>
    record.rank && record.rank > 1
      ? (snapshotRef.current.ranked[record.rank - 2]?.key ?? null)
      : null;

  const move = useCallback(
    async (key: string, position: number) => {
      const record = findRecord(snapshotRef.current, key);
      if (!record) return;
      const last =
        snapshotRef.current.ranked.length + (record.rank === null ? 1 : 0);
      const target = Math.min(Math.max(position, 1), last);
      if (target === record.rank) return;
      const previous = record.rank;
      const followed = followedBy(record);
      if (await save({ action: 'move', key, position: target })) {
        showToast('success', `Moved to #${target}: ${record.title}`, {
          action: {
            label: 'Undo',
            onClick: () => restore(key, previous, followed),
          },
        });
      }
    },
    [restore, save, showToast]
  );

  const remove = useCallback(
    async (key: string) => {
      const record = findRecord(snapshotRef.current, key);
      if (!record || record.rank === null) return;
      const previous = record.rank;
      const followed = followedBy(record);
      if (await save({ action: 'unrank', key })) {
        showToast('success', `Priority removed: ${record.title}`, {
          action: {
            label: 'Undo',
            onClick: () => restore(key, previous, followed),
          },
        });
      }
    },
    [restore, save, showToast]
  );

  const { rankByWantId, rankByLocalId } = useMemo(() => {
    const wants = new Map<number, number>();
    const locals = new Map<string, number>();
    for (const record of snapshot.ranked) {
      if (record.rank === null) continue;
      for (const id of record.wantIds) wants.set(id, record.rank);
      for (const id of record.localIds) locals.set(id, record.rank);
    }
    return { rankByWantId: wants, rankByLocalId: locals };
  }, [snapshot.ranked]);

  return {
    snapshot,
    loaded,
    loadError,
    confirmedRanking,
    reload,
    move,
    remove,
    rankByWantId,
    rankByLocalId,
  };
}
