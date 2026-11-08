import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import '@testing-library/jest-dom';

import BuyingShortlistPanel from '../../../../src/renderer/components/wishlist/BuyingShortlistPanel';
import { BuyingShortlist } from '../../../../src/shared/types';

const mockGet = jest.fn();

jest.mock('../../../../src/renderer/services/api', () => {
  const api = { getBuyingShortlist: (budget: number) => mockGet(budget) };
  return { getApiService: () => api };
});

const shortlist = (o: Partial<BuyingShortlist> = {}): BuyingShortlist => ({
  budget: 100,
  currency: 'USD',
  picks: [
    {
      key: 'master:1',
      rank: 3,
      artist: 'Talk Talk',
      title: 'Spirit Of Eden',
      listing: {
        price: 38.5,
        currency: 'USD',
        releaseId: 77,
        numForSale: 4,
        totalForSale: 9,
        country: 'UK',
        year: 1988,
        format: ['LP'],
        checkedAt: 1,
        pressingsChecked: 1,
        pressingsTotal: 1,
      },
      reasons: [
        { kind: 'priority', text: 'Your #3 priority' },
        { kind: 'plays', text: '212 plays' },
      ],
    },
  ],
  skipped: [],
  total: 38.5,
  leftOver: 61.5,
  ownershipUnknown: false,
  ...o,
});

const skip = (rank: number) => ({
  key: `master:${rank}`,
  rank,
  artist: `Artist ${rank}`,
  title: `Album ${rank}`,
  reason: 'over-budget' as const,
  text: 'Too much',
});

describe('BuyingShortlistPanel', () => {
  let user: ReturnType<typeof userEvent.setup>;

  const renderPanel = (rankingKey = 'a') =>
    render(
      <BuyingShortlistPanel
        serverUrl='http://test'
        currency='USD'
        rankingKey={rankingKey}
      />
    );

  const ask = async (budget = '100') => {
    const input = screen.getByLabelText('Budget (USD)');
    await user.clear(input);
    await user.type(input, budget);
    await user.click(screen.getByRole('button', { name: 'Show picks' }));
  };

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockGet.mockResolvedValue(shortlist());
    user = userEvent.setup();
  });

  it('asks nothing until a budget is entered', async () => {
    renderPanel();
    expect(mockGet).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Show picks' })).toBeDisabled();
    await user.type(screen.getByLabelText('Budget (USD)'), '0');
    expect(screen.getByRole('button', { name: 'Show picks' })).toBeDisabled();
  });

  it('shows picks with reasons, price link and totals', async () => {
    renderPanel();
    await ask();
    expect(await screen.findByText('Spirit Of Eden')).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith(100);
    expect(screen.getByText('Your #3 priority')).toBeInTheDocument();
    expect(screen.getByText('212 plays')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '$38.50' })).toHaveAttribute(
      'href',
      'https://www.discogs.com/sell/release/77'
    );
    expect(
      screen.getByRole('link', { name: 'Spirit Of Eden' })
    ).toHaveAttribute('href', 'https://www.discogs.com/sell/release/77');
    expect(screen.getByText('1988 · UK · LP · 4 for sale')).toBeInTheDocument();
    expect(screen.getByText('Total $38.50 · $61.50 left')).toBeInTheDocument();
    expect(screen.getByText(/any seller country/)).toBeInTheDocument();
  });

  it('says when fewer than 3 fit', async () => {
    renderPanel();
    await ask();
    expect(await screen.findByText(/Only 1 record fits/)).toBeInTheDocument();
  });

  it('remembers the budget', async () => {
    const stored = new Map<string, string>();
    jest
      .mocked(localStorage.setItem)
      .mockImplementation((k, v) => void stored.set(k, v));
    jest
      .mocked(localStorage.getItem)
      .mockImplementation(k => stored.get(k) ?? null);
    const { unmount } = renderPanel();
    await ask('75');
    await screen.findByText('Spirit Of Eden');
    unmount();
    renderPanel();
    expect(screen.getByLabelText('Budget (USD)')).toHaveValue(75);
    jest.mocked(localStorage.getItem).mockReset();
    jest.mocked(localStorage.setItem).mockReset();
  });

  it('works without browser storage', async () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    jest.mocked(localStorage.getItem).mockImplementation(blocked);
    jest.mocked(localStorage.setItem).mockImplementation(blocked);
    renderPanel();
    await ask();
    expect(await screen.findByText('Spirit Of Eden')).toBeInTheDocument();
    jest.mocked(localStorage.getItem).mockReset();
    jest.mocked(localStorage.setItem).mockReset();
  });

  it('lists ranked records passed over, up to 5 and a count', async () => {
    mockGet.mockResolvedValue(
      shortlist({ skipped: [1, 2, 4, 5, 6, 7, 8].map(skip) })
    );
    renderPanel();
    await ask();
    const first = (
      await screen.findByRole('link', {
        name: 'View artist details for Artist 1',
      })
    ).closest('li');
    expect(first).toHaveTextContent('#1 Artist 1 – Album 1: Too much');
    expect(
      screen.getByRole('link', { name: 'View album details for Album 1' })
    ).toBeInTheDocument();
    expect(screen.getByText('and 2 more')).toBeInTheDocument();
    expect(screen.queryByText(/#7 Artist/)).not.toBeInTheDocument();
  });

  it('has an empty state', async () => {
    mockGet.mockResolvedValue(
      shortlist({ picks: [], total: 0, leftOver: 100 })
    );
    renderPanel();
    await ask();
    expect(
      await screen.findByText(
        'No wishlist records are for sale at $100.00 or less.'
      )
    ).toBeInTheDocument();
  });

  it('warns when ownership is unknown', async () => {
    mockGet.mockResolvedValue(shortlist({ ownershipUnknown: true }));
    renderPanel();
    await ask();
    expect(await screen.findByText(/not fully loaded/)).toBeInTheDocument();
  });

  it('shows a server error', async () => {
    mockGet.mockRejectedValue({
      response: { data: { error: 'Priorities file is damaged' } },
    });
    renderPanel();
    await ask();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Priorities file is damaged'
    );
  });

  it('refreshes picks when the ranking changes, and not otherwise', async () => {
    const { rerender } = renderPanel('a');
    const panel = (key: string) => (
      <BuyingShortlistPanel
        serverUrl='http://test'
        currency='USD'
        rankingKey={key}
      />
    );
    rerender(panel('b'));
    expect(mockGet).not.toHaveBeenCalled();

    await ask();
    await screen.findByText('Spirit Of Eden');
    rerender(panel('c'));
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    expect(mockGet).toHaveBeenLastCalledWith(100);

    await user.click(screen.getByRole('button', { name: 'Hide' }));
    expect(screen.queryByText('Spirit Of Eden')).not.toBeInTheDocument();
    rerender(panel('d'));
    await act(async () => {});
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('ignores a slow earlier reply', async () => {
    let finishFirst: (s: BuyingShortlist) => void = () => {};
    mockGet.mockImplementationOnce(
      () => new Promise(resolve => (finishFirst = resolve))
    );
    const { rerender } = renderPanel('a');
    await ask();
    mockGet.mockResolvedValueOnce(
      shortlist({ picks: [], total: 0, leftOver: 100 })
    );
    rerender(
      <BuyingShortlistPanel
        serverUrl='http://test'
        currency='USD'
        rankingKey='b'
      />
    );
    await screen.findByText(/No wishlist records/);
    await act(async () => finishFirst(shortlist()));
    expect(screen.queryByText('Spirit Of Eden')).not.toBeInTheDocument();
  });
});
