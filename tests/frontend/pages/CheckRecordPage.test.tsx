import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { AppProvider } from '../../../src/renderer/context/AppContext';
import CheckRecordPage, {
  groupHeadline,
  ownedNote,
} from '../../../src/renderer/pages/CheckRecordPage';
import { RecordCheckGroup, RecordCheckResult } from '../../../src/shared/types';

const mockCheckRecord = jest.fn();

jest.mock('../../../src/renderer/services/api', () => ({
  getApiService: () => ({ checkRecord: mockCheckRecord }),
}));

jest.mock('../../../src/renderer/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

const group = (o: Partial<RecordCheckGroup> = {}): RecordCheckGroup => ({
  key: 'm:1',
  artist: 'U2',
  title: 'The Unforgettable Fire',
  year: 1984,
  coverImageUrl: null,
  matchedBy: 'text',
  owned: [],
  wants: [],
  monitored: [],
  discards: [],
  ...o,
});

const copy = (releaseId: number, isQueriedRelease = false) => ({
  rowId: `discogs-collection:${releaseId}:1`,
  releaseId,
  artist: 'U2',
  title: 'The Unforgettable Fire',
  year: 1984,
  formats: ['Vinyl'],
  labels: ['Island Records'],
  dateAdded: null,
  isQueriedRelease,
});

const result = (o: Partial<RecordCheckResult> = {}): RecordCheckResult => ({
  query: 'unforgettable',
  releaseId: null,
  releaseRecognized: null,
  groups: [],
  hasMore: false,
  collectionCache: {
    status: 'complete',
    pagesExpected: 1,
    pagesRead: 1,
    itemsExpected: 1,
    itemsRead: 1,
    oldestPageAt: null,
    newestPageAt: null,
  },
  generatedAt: '2026-10-23T12:00:00Z',
  ...o,
});

const renderPage = () =>
  render(
    <AppProvider>
      <CheckRecordPage />
    </AppProvider>
  );

const search = async (text: string) => {
  fireEvent.change(
    screen.getByRole('searchbox', { name: /artist, title or discogs/i }),
    { target: { value: text } }
  );
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
};

describe('groupHeadline', () => {
  it('leads with the strongest answer', () => {
    expect(groupHeadline(group({ owned: [copy(1, true)] }), true).label).toBe(
      'You own this pressing'
    );
    expect(
      groupHeadline(group({ owned: [copy(1)], matchedBy: 'master-id' }), true)
        .label
    ).toBe('You own another pressing');
    expect(
      groupHeadline(group({ owned: [copy(1), copy(2)] }), false).label
    ).toBe('In your collection (2 copies)');
    expect(groupHeadline(group(), false)).toEqual({
      label: 'Not owned',
      variant: 'default',
    });
  });

  it('only calls an owned card another pressing when Discogs ids tie it to the release', () => {
    expect(
      groupHeadline(group({ owned: [copy(1)], matchedBy: 'linked' }), true)
        .label
    ).toBe('In your collection');
    expect(
      groupHeadline(group({ owned: [copy(1)], matchedBy: 'master-id' }), true)
        .label
    ).toBe('You own another pressing');
  });

  it('words guessed ownership as possible, not certain', () => {
    expect(
      ownedNote({
        ownedMatch: 'owned-other-version',
        ownedMatchConfidence: 'likely',
      })
    ).toEqual({ text: 'Possibly own another version', certain: false });
    expect(
      ownedNote({
        ownedMatch: 'owned-other-version',
        ownedMatchConfidence: 'confident',
      })?.certain
    ).toBe(true);

    const monitored = {
      rowId: 'local-want:a',
      source: 'local-want' as const,
      releaseId: null,
      artist: 'U2',
      title: 'Boy',
      year: null,
      formats: [],
      ownedMatch: 'owned-other-version' as const,
      ownedMatchConfidence: 'likely' as const,
      lowestVinylPrice: null,
      priceCurrency: null,
      dateAdded: null,
    };
    expect(groupHeadline(group({ monitored: [monitored] }), false)).toEqual({
      label: 'Possibly own another version',
      variant: 'warning',
    });
  });

  it('says when a record was traded in, unless another copy is still owned', () => {
    const traded = {
      id: 'd',
      releaseId: 1,
      artist: 'U2',
      title: 'The Unforgettable Fire',
      year: null,
      status: 'traded_in' as const,
      reason: 'duplicate' as const,
      addedAt: 0,
      statusChangedAt: new Date(2026, 8, 11, 12).getTime(),
    };
    expect(groupHeadline(group({ discards: [traded] }), false).label).toMatch(
      /^Traded in /
    );
    expect(
      groupHeadline(group({ discards: [traded], owned: [copy(2)] }), false)
        .label
    ).toBe('In your collection');
  });
});

describe('CheckRecordPage', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockCheckRecord.mockReset();
    window.location.hash = '#check';
  });

  afterEach(() => {
    jest.useRealTimers();
    window.location.hash = '';
  });

  it('searches after typing stops and keeps the query in the URL', async () => {
    mockCheckRecord.mockResolvedValue(
      result({ groups: [group({ owned: [copy(507725)] })] })
    );
    renderPage();

    await search('unforgettable');

    expect(mockCheckRecord).toHaveBeenCalledTimes(1);
    expect(mockCheckRecord).toHaveBeenCalledWith('unforgettable');
    expect(window.location.hash).toBe('#check?q=unforgettable');
    expect(screen.getByText('The Unforgettable Fire')).toBeInTheDocument();
    expect(
      screen.getByText('In your collection', { selector: 'span' })
    ).toBeInTheDocument();
  });

  it('starts from a query in the URL', async () => {
    window.location.hash = '#check?q=cake';
    mockCheckRecord.mockResolvedValue(result({ query: 'cake' }));
    renderPage();

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(mockCheckRecord).toHaveBeenCalledWith('cake');
    expect(
      screen.getByText(
        'No match in your cached collection, wishlist or discard history.'
      )
    ).toBeInTheDocument();
  });

  it('ignores a slower earlier search', async () => {
    let resolveFirst: (r: RecordCheckResult) => void = () => {};
    mockCheckRecord
      .mockImplementationOnce(
        () => new Promise<RecordCheckResult>(r => (resolveFirst = r))
      )
      .mockResolvedValueOnce(
        result({ query: 'cake', groups: [group({ title: 'Comfort Eagle' })] })
      );
    renderPage();

    await search('u2');
    await search('cake');
    await act(async () => {
      resolveFirst(result({ groups: [group({ title: 'Boy' })] }));
    });

    expect(screen.getByText('Comfort Eagle')).toBeInTheDocument();
    expect(screen.queryByText('Boy')).not.toBeInTheDocument();
  });

  it('drops the previous answer when a search fails', async () => {
    mockCheckRecord
      .mockResolvedValueOnce(
        result({ groups: [group({ title: 'Comfort Eagle' })] })
      )
      .mockRejectedValueOnce(new Error('Network Error'));
    renderPage();

    await search('cake');
    expect(screen.getByText('Comfort Eagle')).toBeInTheDocument();
    await search('u2');

    expect(screen.getByRole('alert')).toHaveTextContent('Network Error');
    expect(screen.queryByText('Comfort Eagle')).not.toBeInTheDocument();
  });

  it('hides the previous answer as soon as the query changes', async () => {
    let resolveSecond: (r: RecordCheckResult) => void = () => {};
    mockCheckRecord
      .mockResolvedValueOnce(
        result({ query: 'u2', groups: [group({ owned: [copy(1)] })] })
      )
      .mockImplementationOnce(
        () => new Promise<RecordCheckResult>(r => (resolveSecond = r))
      );
    renderPage();

    await search('u2');
    expect(screen.getByText('The Unforgettable Fire')).toBeInTheDocument();

    // While waiting to search, then while the search is out
    fireEvent.change(
      screen.getByRole('searchbox', { name: /artist, title or discogs/i }),
      { target: { value: 'cake' } }
    );
    expect(
      screen.queryByText('The Unforgettable Fire')
    ).not.toBeInTheDocument();
    expect(screen.getByText('Searching…')).toBeInTheDocument();
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(
      screen.queryByText('The Unforgettable Fire')
    ).not.toBeInTheDocument();

    await act(async () => {
      resolveSecond(
        result({ query: 'cake', groups: [group({ title: 'Comfort Eagle' })] })
      );
    });
    expect(screen.getByText('Comfort Eagle')).toBeInTheDocument();
    expect(screen.queryByText('Searching…')).not.toBeInTheDocument();
  });

  it('says how old the collection is, and warns when it may be out of date', async () => {
    const daysAgo = (days: number) =>
      new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    mockCheckRecord
      .mockResolvedValueOnce(
        result({
          collectionCache: {
            ...result().collectionCache,
            oldestPageAt: daysAgo(1),
          },
        })
      )
      .mockResolvedValueOnce(
        result({
          collectionCache: {
            ...result().collectionCache,
            oldestPageAt: daysAgo(30),
          },
        })
      );
    renderPage();

    await search('cake');
    expect(screen.getByText(/Collection as of/)).toBeInTheDocument();
    expect(screen.queryByText(/last loaded/)).not.toBeInTheDocument();

    await search('u2');
    expect(
      screen.getByText(/Your collection was last loaded .* Browse Collection/)
    ).toBeInTheDocument();
  });

  it('warns that a missing record is unconfirmed while the collection is partly loaded', async () => {
    mockCheckRecord.mockResolvedValue(
      result({
        collectionCache: {
          ...result().collectionCache,
          status: 'partial',
          itemsRead: 500,
          itemsExpected: 1183,
        },
      })
    );
    renderPage();

    await search('cake');

    expect(
      screen.getByText(/Only 500 of 1183 collection items are loaded/)
    ).toBeInTheDocument();
  });

  it('explains a Discogs release link it does not recognize', async () => {
    mockCheckRecord.mockResolvedValue(
      result({
        query: 'https://www.discogs.com/release/999',
        releaseId: 999,
        releaseRecognized: false,
      })
    );
    renderPage();

    await search('https://www.discogs.com/release/999');

    expect(
      screen.getByText(/Release 999 isn’t in your cached/)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/^No match in your cached/)
    ).not.toBeInTheDocument();
  });
});
