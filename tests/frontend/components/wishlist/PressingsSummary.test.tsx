import { render, screen } from '@testing-library/react';
import React from 'react';

import '@testing-library/jest-dom';
import { PressingsSummary } from '../../../../src/renderer/components/wishlist/PressingsSummary';
import { DiscogsPressingsSummary } from '../../../../src/shared/types';

const DAY = 24 * 60 * 60 * 1000;

const summary = (
  tracked: Partial<DiscogsPressingsSummary['tracked']> = {}
): DiscogsPressingsSummary => ({
  tracked: {
    records: 184,
    fetchedInFull: 184,
    fullFetchDue: 0,
    nextFullFetchAt: Date.now() + 23 * DAY + 60_000,
    newestCheckedThisWeek: 184,
    releases: 3766,
    releasesWithDetails: 3756,
    ...tracked,
  },
  sellerLookups: { albums: 13901, releases: 15421 },
});

describe('PressingsSummary', () => {
  it('shows tracked records apart from seller lookups', () => {
    render(<PressingsSummary summary={summary()} />);

    expect(screen.getByText('184')).toBeInTheDocument();
    expect(screen.getByText('3,766')).toBeInTheDocument();
    expect(
      screen.getByText(/15,421 releases from 13,901 other albums/)
    ).toBeInTheDocument();
  });

  it('says what uses it', () => {
    render(<PressingsSummary summary={summary()} />);

    expect(screen.getByText(/seller matching/i)).toBeInTheDocument();
  });

  it('says when the next full fetch is due', () => {
    render(<PressingsSummary summary={summary()} />);

    expect(
      screen.getByText(/all fetched in full · next due in 23 days/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/184 of 184 checked this week/i)
    ).toBeInTheDocument();
  });

  it('says how many records are due a full fetch now', () => {
    render(
      <PressingsSummary
        summary={summary({ fetchedInFull: 170, fullFetchDue: 14 })}
      />
    );

    expect(screen.getByText(/14 due a full fetch/i)).toBeInTheDocument();
  });

  it('shows the actions it is given', () => {
    render(
      <PressingsSummary summary={summary()}>
        <button>Refresh</button>
      </PressingsSummary>
    );

    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });
});
