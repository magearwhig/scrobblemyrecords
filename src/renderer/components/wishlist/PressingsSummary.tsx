import React from 'react';

import { DiscogsPressingsSummary } from '../../../shared/types';

import './PressingsSummary.css';

const DAY_MS = 24 * 60 * 60 * 1000;

interface Props {
  summary: DiscogsPressingsSummary;
  /** Actions for this page (refresh, check now) */
  children?: React.ReactNode;
}

const dueIn = (at: number): string => {
  const days = Math.floor((at - Date.now()) / DAY_MS);
  if (days <= 0) return 'today';
  return days === 1 ? 'in 1 day' : `in ${days} days`;
};

/**
 * What the shared Discogs pressings catalogue holds: the tracked records
 * (wishlist and want list) and the seller-listing lookups kept beside them
 */
export const PressingsSummary: React.FC<Props> = ({ summary, children }) => {
  const { tracked, sellerLookups } = summary;
  const fullFetch =
    tracked.fullFetchDue > 0
      ? `${tracked.fullFetchDue.toLocaleString()} due a full fetch`
      : tracked.nextFullFetchAt !== null
        ? `All fetched in full · next due ${dueIn(tracked.nextFullFetchAt)}`
        : 'Not fetched in full yet';

  return (
    <section className='pressings-summary' aria-label='Discogs pressings'>
      <div className='pressings-summary-header'>
        <h3>Discogs pressings</h3>
        <span className='pressings-summary-hint'>
          One catalogue used by the wishlist, New Releases, seller matching,
          prices and export
        </span>
      </div>
      <div className='pressings-summary-body'>
        <div className='pressings-summary-stats'>
          <div className='pressings-summary-stat'>
            <span className='pressings-summary-value'>
              {tracked.records.toLocaleString()}
            </span>
            <span className='pressings-summary-label'>
              Wishlist & want list
            </span>
          </div>
          <div className='pressings-summary-stat'>
            <span className='pressings-summary-value'>
              {tracked.releases.toLocaleString()}
            </span>
            <span className='pressings-summary-label'>Known pressings</span>
          </div>
        </div>
        <ul className='pressings-summary-status'>
          <li>
            <span className='pressings-summary-status-label'>Every page</span>
            {fullFetch}
          </li>
          <li>
            <span className='pressings-summary-status-label'>
              Newest pressings
            </span>
            {tracked.newestCheckedThisWeek.toLocaleString()} of{' '}
            {tracked.records.toLocaleString()} checked this week
          </li>
          <li className='pressings-summary-muted'>
            <span className='pressings-summary-status-label'>Other albums</span>
            {sellerLookups.releases.toLocaleString()} releases from{' '}
            {sellerLookups.albums.toLocaleString()} other albums (seller
            listings, past wishlist)
          </li>
        </ul>
      </div>
      {children && <div className='pressings-summary-actions'>{children}</div>}
    </section>
  );
};

export default PressingsSummary;
