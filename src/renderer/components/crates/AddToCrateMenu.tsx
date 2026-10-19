import { Boxes, Check, ChevronDown, Plus } from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import { CrateSummary } from '../../../shared/types';
import { useApp } from '../../context/AppContext';
import { ROUTES } from '../../routes';
import { getApiService } from '../../services/api';
import { createLogger } from '../../utils/logger';
import { Button } from '../ui';

import { apiErrorInfo } from './crateRuleModel';
import './AddToCrateMenu.css';

const logger = createLogger('AddToCrateMenu');

export interface AddToCrateMenuProps {
  /**
   * Owned release IDs of the album (at least one). The first is used to look
   * up the crates the album is in; all are stored on the include.
   */
  releaseIds: number[];
  /** Album title, for accessible labels */
  albumTitle: string;
  className?: string;
}

type CrateRef = { id: string; name: string };

/** Menu items in order, including aria-disabled ones (still focusable) */
function menuItems(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>('[role="menuitem"]'));
}

function crateHref(id: string): string {
  return `#${ROUTES.CRATES}?id=${encodeURIComponent(id)}`;
}

/**
 * "Add to crate" menu for an owned release: lists the user's crates (those
 * the album is already in are marked) and includes the album by hand in the
 * chosen one. Also shows "In crates" chips linking to each crate.
 */
const AddToCrateMenu: React.FC<AddToCrateMenuProps> = ({
  releaseIds,
  albumTitle,
  className,
}) => {
  const { state } = useApp();
  const api = useMemo(() => getApiService(state.serverUrl), [state.serverUrl]);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [crates, setCrates] = useState<CrateSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [memberOf, setMemberOf] = useState<CrateRef[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);

  const primaryId = releaseIds[0];
  const releaseKey = releaseIds.join(',');

  // Only the latest membership lookup may update the chips
  const membershipSeq = useRef(0);

  const loadMembership = useCallback(async () => {
    const seq = ++membershipSeq.current;
    if (primaryId === undefined) return;
    try {
      const list = await api.getCratesForRelease(primaryId);
      if (seq === membershipSeq.current) setMemberOf(list);
    } catch (err) {
      // Chips are informational; the menu still works without them
      logger.warn('Failed to load crates for release', err);
    }
  }, [api, primaryId]);

  useEffect(() => {
    setMemberOf([]);
    setStatus(null);
    loadMembership();
  }, [loadMembership, releaseKey]);

  const loadCrates = useCallback(async () => {
    setLoadError(null);
    try {
      setCrates(await api.getCrates());
    } catch (err) {
      logger.error('Failed to load crates', err);
      setLoadError(apiErrorInfo(err).message);
    }
  }, [api]);

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) {
      rootRef.current
        ?.querySelector<globalThis.HTMLButtonElement>('.add-to-crate-trigger')
        ?.focus();
    }
  }, []);

  const toggle = () => {
    if (open) {
      close(false);
      return;
    }
    setOpen(true);
    setStatus(null);
    loadCrates();
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handlePointer = (e: globalThis.MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        close(false);
      }
    };
    document.addEventListener('mousedown', handlePointer);
    return () => document.removeEventListener('mousedown', handlePointer);
  }, [open, close]);

  // Focus the first enabled item (or the first item) once the list is shown
  useEffect(() => {
    if (!open || !crates) return;
    const items = menuItems(rootRef.current);
    (
      items.find(item => item.getAttribute('aria-disabled') !== 'true') ??
      items[0]
    )?.focus();
  }, [open, crates]);

  const memberIds = useMemo(
    () => new Set(memberOf.map(crate => crate.id)),
    [memberOf]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
      return;
    }
    if (e.key === 'Tab') {
      close(false);
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = menuItems(rootRef.current);
    if (items.length === 0) return;
    e.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === 'ArrowDown'
        ? (index + 1) % items.length
        : (index - 1 + items.length) % items.length;
    items[next].focus();
  };

  /**
   * All current copies of the album in this crate's view, so an include
   * replaces an earlier exclude of any copy (overrides are per release ID).
   */
  const albumReleaseIds = async (crateId: string): Promise<number[]> => {
    try {
      const { evaluation } = await api.getCrate(crateId);
      const album = [...evaluation.albums, ...evaluation.excluded].find(a =>
        a.copies.some(copy => releaseIds.includes(copy.releaseId))
      );
      if (!album) return releaseIds;
      return Array.from(
        new Set([...releaseIds, ...album.copies.map(copy => copy.releaseId)])
      );
    } catch (err) {
      logger.warn('Failed to resolve album copies; using this release', err);
      return releaseIds;
    }
  };

  const handleChoose = async (crate: CrateSummary) => {
    if (busyId !== null || memberIds.has(crate.id)) return;
    setBusyId(crate.id);
    try {
      const ids = await albumReleaseIds(crate.id);
      await api.setCrateOverride(crate.id, ids, 'include');
      setStatus({ kind: 'success', text: `Added to ${crate.name}` });
      close(true);
      await loadMembership();
    } catch (err) {
      logger.error('Failed to add to crate', err);
      setStatus({ kind: 'error', text: apiErrorInfo(err).message });
    } finally {
      setBusyId(null);
    }
  };

  if (primaryId === undefined) return null;

  return (
    <div
      ref={rootRef}
      className={`add-to-crate ${className ?? ''}`}
      onKeyDown={handleKeyDown}
    >
      <div className='add-to-crate-anchor'>
        <Button
          className='add-to-crate-trigger'
          variant='outline'
          size='small'
          aria-haspopup='menu'
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-label={`Add ${albumTitle} to a crate`}
          onClick={toggle}
          iconLeft={<Boxes size={16} aria-hidden='true' />}
          iconRight={<ChevronDown size={16} aria-hidden='true' />}
        >
          Add to crate
        </Button>

        {open && (
          <div
            id={menuId}
            className='add-to-crate-menu'
            role='menu'
            aria-label='Crates'
          >
            {loadError ? (
              <p className='add-to-crate-note add-to-crate-note--error'>
                {loadError}
              </p>
            ) : !crates ? (
              <p className='add-to-crate-note'>Loading crates…</p>
            ) : crates.length === 0 ? (
              <p className='add-to-crate-note'>No crates yet.</p>
            ) : (
              crates.map(crate => {
                const isMember = memberIds.has(crate.id);
                return (
                  <button
                    key={crate.id}
                    type='button'
                    role='menuitem'
                    className='add-to-crate-item'
                    tabIndex={-1}
                    aria-disabled={isMember || busyId !== null || undefined}
                    onClick={() => handleChoose(crate)}
                  >
                    {isMember ? (
                      <Check size={16} aria-hidden='true' />
                    ) : (
                      <Plus size={16} aria-hidden='true' />
                    )}
                    <span className='add-to-crate-item-name'>{crate.name}</span>
                    {isMember && (
                      <span className='add-to-crate-item-note'>In crate</span>
                    )}
                  </button>
                );
              })
            )}
            <a
              className='add-to-crate-new'
              href={`#${ROUTES.CRATES}?new=1`}
              role='menuitem'
              tabIndex={-1}
            >
              New crate…
            </a>
          </div>
        )}
      </div>

      {memberOf.length > 0 && (
        <ul className='add-to-crate-chips' aria-label='In crates'>
          <li className='add-to-crate-chips-label' aria-hidden='true'>
            In crates:
          </li>
          {memberOf.map(crate => (
            <li key={crate.id}>
              <a className='add-to-crate-chip' href={crateHref(crate.id)}>
                {crate.name}
              </a>
            </li>
          ))}
        </ul>
      )}

      {status && (
        <p
          className={`add-to-crate-status add-to-crate-status--${status.kind}`}
          role={status.kind === 'error' ? 'alert' : 'status'}
        >
          {status.text}
        </p>
      )}
    </div>
  );
};

export default AddToCrateMenu;
