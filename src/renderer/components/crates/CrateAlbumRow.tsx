import {
  ChevronDown,
  ChevronUp,
  CircleCheck,
  CircleHelp,
  CirclePlus,
  CircleX,
  ExternalLink,
  EyeOff,
  RotateCcw,
} from 'lucide-react';
import React, { useId, useMemo, useState } from 'react';

import {
  CrateAlbumResult,
  CrateRule,
  CrateRuleOutcome,
} from '../../../shared/types';
import { phrase } from '../../../shared/utils/crateCopy';
import {
  formatCrateReason,
  formatMembership,
  formatScrobbleMatch,
} from '../../../shared/utils/crateReasons';
import AlbumLink from '../AlbumLink';
import ArtistLink from '../ArtistLink';
import { Badge, BadgeVariant, Button, IconButton } from '../ui';

import CrateCover from './CrateCover';
import './CrateAlbumRow.css';

export interface CrateAlbumRowProps {
  album: CrateAlbumResult;
  /** The crate's rules, to describe each result */
  rules: CrateRule[];
  /** seconds; start of the scrobble history */
  historyFrom?: number | null;
  /** 'excluded' rows offer Restore/Include instead of Exclude */
  variant?: 'member' | 'excluded';
  busy?: boolean;
  onInclude: (album: CrateAlbumResult) => void;
  onExclude: (album: CrateAlbumResult) => void;
  onReset: (album: CrateAlbumResult) => void;
  onOpenRelease: (album: CrateAlbumResult) => void;
}

interface Reason {
  key: string;
  text: string;
  outcome: CrateRuleOutcome;
}

const INLINE_REASONS = 2;

const OUTCOME_ORDER: Record<CrateRuleOutcome, number> = {
  match: 0,
  unknown: 1,
  noMatch: 2,
};

const MEMBERSHIP_VARIANT: Record<CrateAlbumResult['membership'], BadgeVariant> =
  {
    rules: 'secondary',
    included: 'primary',
    includedAndRules: 'primary',
    excluded: 'warning',
  };

function OutcomeIcon({ outcome }: { outcome: CrateRuleOutcome }) {
  if (outcome === 'match') {
    return (
      <CircleCheck
        size={16}
        aria-hidden='true'
        className='crate-reason-icon crate-reason-icon--match'
      />
    );
  }
  if (outcome === 'noMatch') {
    return (
      <CircleX
        size={16}
        aria-hidden='true'
        className='crate-reason-icon crate-reason-icon--nomatch'
      />
    );
  }
  return (
    <CircleHelp
      size={16}
      aria-hidden='true'
      className='crate-reason-icon crate-reason-icon--unknown'
    />
  );
}

/** "2 pressings · owned ×3", or "owned ×2" for one release owned twice */
export function formatCopies(album: CrateAlbumResult): string | null {
  const pressings = album.copies.length;
  const owned = album.copies.reduce((sum, copy) => sum + copy.copyCount, 0);
  const parts: string[] = [];
  if (pressings > 1) parts.push(`${pressings} pressings`);
  if (owned > pressings || (pressings === 1 && owned > 1)) {
    parts.push(`owned ×${owned}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** "Vinyl, LP · 2023 pressing" for the witness copy */
function describeWitness(album: CrateAlbumResult): string | null {
  const witness =
    album.copies.find(copy => copy.releaseId === album.witnessReleaseId) ??
    album.copies[0];
  if (!witness) return null;
  const parts: string[] = [];
  if (witness.format.length > 0) parts.push(witness.format.join(', '));
  if (witness.year) {
    parts.push(phrase('copy.pressing', { year: String(witness.year) }));
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * One album in a crate: cover, names, copies, membership, the first reasons
 * inline and all of them under "Why?", plus Include/Exclude/Reset actions.
 */
const CrateAlbumRow: React.FC<CrateAlbumRowProps> = ({
  album,
  rules,
  historyFrom,
  variant = 'member',
  busy = false,
  onInclude,
  onExclude,
  onReset,
  onOpenRelease,
}) => {
  const [expanded, setExpanded] = useState(false);
  const whyId = useId();

  const reasons = useMemo<Reason[]>(() => {
    const ctx = {
      copies: album.copies,
      historyFrom: historyFrom ?? null,
      listening: album.listening,
    };
    const list: Reason[] = [];
    for (const result of album.results) {
      const rule = rules.find(r => r.id === result.ruleId);
      if (!rule) continue;
      list.push({
        key: result.ruleId,
        text: formatCrateReason(rule, result, ctx),
        outcome: result.outcome,
      });
    }
    return list.sort(
      (a, b) => OUTCOME_ORDER[a.outcome] - OUTCOME_ORDER[b.outcome]
    );
  }, [album, rules, historyFrom]);

  const nameMatch = formatScrobbleMatch(album.listening);
  const copies = formatCopies(album);
  const witness = describeWitness(album);
  const inline = reasons.slice(0, INLINE_REASONS);
  const hasMore = reasons.length > INLINE_REASONS || nameMatch !== undefined;
  const isIncluded =
    album.membership === 'included' || album.membership === 'includedAndRules';

  return (
    <li
      className={`crate-album-row crate-album-row--${variant} ${isIncluded ? 'crate-album-row--included' : ''}`}
    >
      <CrateCover url={album.coverUrl} title={album.album} />

      <div className='crate-album-main'>
        <div className='crate-album-names'>
          <AlbumLink
            artist={album.artist}
            album={album.album}
            className='crate-album-title'
          />
          <ArtistLink artist={album.artist} className='crate-album-artist' />
        </div>

        <div className='crate-album-meta'>
          <Badge
            size='small'
            pill
            variant={MEMBERSHIP_VARIANT[album.membership]}
            icon={
              isIncluded ? (
                <CirclePlus size={12} aria-hidden='true' />
              ) : album.membership === 'excluded' ? (
                <EyeOff size={12} aria-hidden='true' />
              ) : undefined
            }
          >
            {formatMembership(album)}
          </Badge>
          {witness && <span>{witness}</span>}
          {copies && <span>{copies}</span>}
        </div>

        {inline.length > 0 && (
          <ul className='crate-album-reasons'>
            {inline.map(reason => (
              <li key={reason.key}>
                <OutcomeIcon outcome={reason.outcome} />
                <span>{reason.text}</span>
              </li>
            ))}
          </ul>
        )}

        {hasMore && (
          <button
            type='button'
            className='crate-album-why'
            aria-expanded={expanded}
            aria-controls={whyId}
            onClick={() => setExpanded(open => !open)}
          >
            Why?
            {expanded ? (
              <ChevronUp size={16} aria-hidden='true' />
            ) : (
              <ChevronDown size={16} aria-hidden='true' />
            )}
          </button>
        )}
        {expanded && (
          <ul id={whyId} className='crate-album-reasons crate-album-why-list'>
            {reasons.map(reason => (
              <li key={reason.key}>
                <OutcomeIcon outcome={reason.outcome} />
                <span>{reason.text}</span>
              </li>
            ))}
            {nameMatch && (
              <li>
                <CircleHelp
                  size={16}
                  aria-hidden='true'
                  className='crate-reason-icon'
                />
                <span>{nameMatch}</span>
              </li>
            )}
          </ul>
        )}
      </div>

      <div className='crate-album-actions'>
        {variant === 'excluded' ? (
          <>
            <Button
              size='small'
              variant='secondary'
              iconLeft={<RotateCcw size={16} aria-hidden='true' />}
              onClick={() => onReset(album)}
              disabled={busy}
            >
              Restore
            </Button>
            <IconButton
              size='small'
              icon={<CirclePlus size={16} aria-hidden='true' />}
              aria-label={`Include ${album.album} in this crate`}
              title='Include'
              onClick={() => onInclude(album)}
              disabled={busy}
            />
          </>
        ) : (
          <>
            {album.membership === 'rules' && (
              <IconButton
                size='small'
                icon={<CirclePlus size={16} aria-hidden='true' />}
                aria-label={`Always include ${album.album}`}
                title='Always include'
                onClick={() => onInclude(album)}
                disabled={busy}
              />
            )}
            {isIncluded && (
              <IconButton
                size='small'
                icon={<RotateCcw size={16} aria-hidden='true' />}
                aria-label={`Reset ${album.album} to rules`}
                title='Reset to rules'
                onClick={() => onReset(album)}
                disabled={busy}
              />
            )}
            <IconButton
              size='small'
              icon={<EyeOff size={16} aria-hidden='true' />}
              aria-label={`Exclude ${album.album} from this crate`}
              title='Exclude'
              onClick={() => onExclude(album)}
              disabled={busy}
            />
          </>
        )}
        <IconButton
          size='small'
          icon={<ExternalLink size={16} aria-hidden='true' />}
          aria-label={`Open release ${album.album}`}
          title='Open release'
          onClick={() => onOpenRelease(album)}
        />
      </div>
    </li>
  );
};

export default CrateAlbumRow;
