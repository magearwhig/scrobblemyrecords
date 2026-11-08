import { ExternalLink, ShoppingBag } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import './BuyingShortlistPanel.css';
import { BuyingShortlist } from '../../../shared/types';
import { getApiService } from '../../services/api';
import AlbumLink from '../AlbumLink';
import ArtistLink from '../ArtistLink';
import { Button } from '../ui/Button';

const BUDGET_KEY = 'wishlistShortlistBudget';
/** Passed-over records listed before "and N more" */
const SKIPPED_SHOWN = 5;

function readBudget(): string {
  try {
    return localStorage.getItem(BUDGET_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeBudget(value: string): void {
  try {
    localStorage.setItem(BUDGET_KEY, value);
  } catch {
    // Only a convenience
  }
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function errorMessage(err: unknown): string {
  const serverError = (err as { response?: { data?: { error?: unknown } } })
    ?.response?.data?.error;
  if (typeof serverError === 'string' && serverError) return serverError;
  return err instanceof Error && err.message
    ? err.message
    : 'Could not build your shortlist';
}

interface BuyingShortlistPanelProps {
  serverUrl: string;
  currency: string;
  /** Changes with the ranking; picks showing are refreshed when it does */
  rankingKey: string;
}

const BuyingShortlistPanel: React.FC<BuyingShortlistPanelProps> = ({
  serverUrl,
  currency,
  rankingKey,
}) => {
  const api = getApiService(serverUrl);
  const [budget, setBudget] = useState(readBudget);
  const [shortlist, setShortlist] = useState<BuyingShortlist | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(
    async (amount: number) => {
      const request = ++requestRef.current;
      setLoading(true);
      setError(null);
      try {
        const result = await api.getBuyingShortlist(amount);
        if (request !== requestRef.current) return;
        setShortlist(result);
      } catch (err) {
        if (request !== requestRef.current) return;
        setShortlist(null);
        setError(errorMessage(err));
      } finally {
        if (request === requestRef.current) setLoading(false);
      }
    },
    [api]
  );

  // The picks showing, for refreshing them when the ranking changes
  const shownBudget = useRef<number | null>(null);
  const lastRanking = useRef(rankingKey);
  useEffect(() => {
    if (rankingKey === lastRanking.current) return;
    lastRanking.current = rankingKey;
    if (shownBudget.current !== null) void load(shownBudget.current);
  }, [load, rankingKey]);

  const amount = Number(budget);
  const valid = budget.trim() !== '' && amount > 0 && Number.isFinite(amount);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    writeBudget(budget);
    shownBudget.current = amount;
    void load(amount);
  };

  const hide = () => {
    requestRef.current++;
    shownBudget.current = null;
    setShortlist(null);
    setError(null);
    setLoading(false);
  };

  const skippedMore = (shortlist?.skipped.length ?? 0) - SKIPPED_SHOWN;

  return (
    <section className='buying-shortlist' aria-label='Buying shortlist'>
      <form className='buying-shortlist-form' onSubmit={handleSubmit}>
        <ShoppingBag size={18} aria-hidden='true' />
        <label htmlFor='buying-shortlist-budget'>Budget ({currency})</label>
        <input
          id='buying-shortlist-budget'
          type='number'
          min='0'
          step='any'
          className='buying-shortlist-budget'
          value={budget}
          onChange={e => setBudget(e.target.value)}
        />
        <Button type='submit' size='small' disabled={!valid || loading}>
          {loading ? 'Picking...' : 'Show picks'}
        </Button>
        {(shortlist || error) && (
          <Button type='button' size='small' variant='ghost' onClick={hide}>
            Hide
          </Button>
        )}
        {!shortlist && !error && (
          <span className='buying-shortlist-hint'>
            Goes down your ranking first, then suggests the best of the rest.
          </span>
        )}
      </form>

      {error && (
        <p className='error-message' role='alert'>
          {error}
        </p>
      )}

      {shortlist && shortlist.picks.length === 0 && (
        <p className='buying-shortlist-note'>
          No wishlist records are for sale at{' '}
          {money(shortlist.budget, shortlist.currency)} or less.
        </p>
      )}

      {shortlist && shortlist.picks.length > 0 && (
        <>
          <ul className='buying-shortlist-picks'>
            {shortlist.picks.map(pick => (
              <li key={pick.key} className='buying-shortlist-pick'>
                {pick.coverImage ? (
                  <img
                    className='buying-shortlist-cover'
                    src={pick.coverImage}
                    alt=''
                    loading='lazy'
                  />
                ) : (
                  <span className='buying-shortlist-cover buying-shortlist-cover-empty' />
                )}
                <div className='buying-shortlist-details'>
                  <a
                    className='buying-shortlist-title'
                    href={`https://www.discogs.com/sell/release/${pick.listing.releaseId}`}
                    target='_blank'
                    rel='noopener noreferrer'
                  >
                    {pick.title}
                  </a>
                  <span className='buying-shortlist-artist'>
                    <ArtistLink artist={pick.artist} />
                  </span>
                  <a
                    className='buying-shortlist-price'
                    href={`https://www.discogs.com/sell/release/${pick.listing.releaseId}`}
                    target='_blank'
                    rel='noopener noreferrer'
                  >
                    {money(pick.listing.price, pick.listing.currency)}
                    <ExternalLink size={14} aria-hidden='true' />
                  </a>
                  <span className='buying-shortlist-pressing'>
                    {[
                      pick.listing.year,
                      pick.listing.country,
                      pick.listing.format?.join(', '),
                      `${pick.listing.numForSale} for sale`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  <ul className='buying-shortlist-reasons'>
                    {pick.reasons.map(reason => (
                      <li
                        key={reason.kind}
                        className={`buying-shortlist-reason-${reason.kind}`}
                      >
                        {reason.text}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
          <p className='buying-shortlist-total'>
            Total {money(shortlist.total, shortlist.currency)} ·{' '}
            {money(shortlist.leftOver, shortlist.currency)} left
          </p>
          <p className='buying-shortlist-note'>
            {shortlist.picks.length < 3 &&
              `Only ${shortlist.picks.length} ${
                shortlist.picks.length === 1 ? 'record fits' : 'records fit'
              } this budget. `}
            Lowest asking prices before shipping, any condition, any seller
            country.
            {shortlist.ownershipUnknown &&
              ' Your collection is not fully loaded, so records you own may appear.'}
          </p>
        </>
      )}

      {shortlist && shortlist.skipped.length > 0 && (
        <div className='buying-shortlist-skipped'>
          <h4 className='buying-shortlist-skipped-heading'>
            Passed over from your ranking
          </h4>
          <ul>
            {shortlist.skipped.slice(0, SKIPPED_SHOWN).map(skip => (
              <li key={skip.key}>
                #{skip.rank} <ArtistLink artist={skip.artist} /> –{' '}
                <AlbumLink artist={skip.artist} album={skip.title} />:{' '}
                {skip.text}
              </li>
            ))}
            {skippedMore > 0 && <li>and {skippedMore} more</li>}
          </ul>
        </div>
      )}
    </section>
  );
};

export default BuyingShortlistPanel;
