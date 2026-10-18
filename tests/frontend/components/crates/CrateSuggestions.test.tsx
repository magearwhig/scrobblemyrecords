import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import '@testing-library/jest-dom';
import CrateSuggestionHistoryReset from '../../../../src/renderer/components/crates/CrateSuggestionHistoryReset';
import CrateSuggestions, {
  COLLECTION_LOADING_POLL_MS,
} from '../../../../src/renderer/components/crates/CrateSuggestions';
import {
  CrateSuggestion,
  CrateSuggestionsResponse,
} from '../../../../src/shared/types';

import { makeAlbum, makeCrate, makeEvaluation } from './crateFixtures';

const mockShowToast = jest.fn();
jest.mock('../../../../src/renderer/context/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

jest.mock('../../../../src/renderer/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

function makeSuggestion(
  overrides: Partial<CrateSuggestion> = {}
): CrateSuggestion {
  return {
    candidateKey: 'style-quiet:post-punk',
    recipe: 'style-quiet',
    name: 'Post-Punk with no scrobbles in 12 months',
    description:
      'Post-Punk albums you own with no scrobbles recorded in the last 12 months, ordered by last scrobble, oldest first.',
    reason:
      'You own 23 Post-Punk albums. 14 have no scrobbles recorded in the last 12 months.',
    rules: [
      { id: 'style', field: 'style', op: 'anyOf', values: ['Post-Punk'] },
      {
        id: 'quiet',
        field: 'scrobblesInPeriod',
        op: 'none',
        period: { kind: 'lastDays', days: 365 },
      },
    ],
    sort: 'lastPlayedAsc',
    count: 14,
    sampleCovers: ['https://example.com/1.jpg', 'https://example.com/2.jpg'],
    ...overrides,
  };
}

const first = makeSuggestion();
const second = makeSuggestion({
  candidateKey: 'artist:the fall',
  recipe: 'artist',
  name: 'The Fall shelf',
  description:
    'Albums you own by The Fall, ordered by last scrobble, oldest first.',
  reason: 'You own 9 albums by The Fall.',
  rules: [{ id: 'a', field: 'artist', op: 'anyOf', values: ['The Fall'] }],
  count: 9,
});
const third = makeSuggestion({
  candidateKey: 'short:jazz',
  recipe: 'short',
  name: 'Jazz that fits in 40 minutes',
  reason: 'You own 30 Jazz albums with a duration on Discogs for every track.',
  count: 11,
});
const backfill = makeSuggestion({
  candidateKey: 'decade-quiet:1980',
  recipe: 'decade-quiet',
  name: '1980s pressings with no scrobbles in 2 years',
  reason: 'You own 40 albums pressed in the 1980s.',
  count: 22,
});

function batch(
  suggestions: CrateSuggestion[],
  extra: Partial<CrateSuggestionsResponse> = {}
): CrateSuggestionsResponse {
  return { suggestions, exhausted: false, ...extra };
}

const api = {
  getCrateSuggestions: jest.fn(),
  rerollCrateSuggestions: jest.fn(),
  dismissCrateSuggestion: jest.fn(),
  resetCrateSuggestionHistory: jest.fn(),
  createCrate: jest.fn(),
  previewCrate: jest.fn(),
};

function renderSuggestions() {
  const onAdded = jest.fn();
  render(<CrateSuggestions api={api} onAdded={onAdded} />);
  return { onAdded };
}

describe('CrateSuggestions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.getCrateSuggestions.mockResolvedValue(batch([first, second, third]));
    api.previewCrate.mockResolvedValue(makeEvaluation());
  });

  it('renders up to three cards with name, reason and count', async () => {
    renderSuggestions();
    expect(
      await screen.findByRole('heading', { name: 'Suggested crates' })
    ).toBeInTheDocument();
    expect(api.getCrateSuggestions).toHaveBeenCalledWith(3);
    expect(screen.getAllByRole('article')).toHaveLength(3);

    const card = screen.getByRole('article', {
      name: `Suggested crate ${first.name}`,
    });
    expect(within(card).getByText(first.name)).toBeInTheDocument();
    expect(within(card).getByText(first.reason)).toBeInTheDocument();
    expect(within(card).getByText('14 albums')).toBeInTheDocument();
  });

  it('adds a crate from the suggestion and opens it', async () => {
    const user = userEvent.setup();
    const created = makeCrate({ id: 'new-crate', name: first.name });
    api.createCrate.mockResolvedValue(created);
    const { onAdded } = renderSuggestions();

    await user.click(
      await screen.findByRole('button', { name: `Add ${first.name}` })
    );

    expect(api.createCrate).toHaveBeenCalledWith({
      name: first.name,
      description: first.description,
      rules: first.rules,
      sort: first.sort,
      sourceSuggestionKey: first.candidateKey,
    });
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(created));
    expect(mockShowToast).toHaveBeenCalledWith(
      'success',
      'Crate added. Edit its rules any time.'
    );
  });

  it('shows an error and stays put when adding fails', async () => {
    const user = userEvent.setup();
    api.createCrate.mockRejectedValue(
      Object.assign(new Error('Conflict'), {
        response: {
          status: 409,
          data: { error: 'A crate with this name already exists' },
        },
      })
    );
    const { onAdded } = renderSuggestions();
    await user.click(
      await screen.findByRole('button', { name: `Add ${first.name}` })
    );
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(
        'error',
        'A crate with this name already exists'
      )
    );
    expect(onAdded).not.toHaveBeenCalled();
  });

  it('dismisses a suggestion and renders the backfilled batch', async () => {
    const user = userEvent.setup();
    api.dismissCrateSuggestion.mockResolvedValue(
      batch([second, third, backfill])
    );
    renderSuggestions();

    await user.click(
      await screen.findByRole('button', {
        name: `Not interested in ${first.name}`,
      })
    );
    expect(api.dismissCrateSuggestion).toHaveBeenCalledWith(first.candidateKey);
    expect(await screen.findByText(backfill.name)).toBeInTheDocument();
    expect(screen.queryByText(first.name)).not.toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(3);
  });

  it('shows different suggestions and disables itself once exhausted', async () => {
    const user = userEvent.setup();
    api.rerollCrateSuggestions.mockResolvedValue(
      batch([backfill], { exhausted: true })
    );
    renderSuggestions();

    const reroll = await screen.findByRole('button', {
      name: /show different suggestions/i,
    });
    expect(reroll).toBeEnabled();
    expect(
      screen.queryByText("That's all the suggestions for today.")
    ).not.toBeInTheDocument();

    await user.click(reroll);
    expect(api.rerollCrateSuggestions).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(backfill.name)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /show different suggestions/i })
    ).toBeDisabled();
    expect(
      screen.getByText("That's all the suggestions for today.")
    ).toBeInTheDocument();
  });

  it('keeps the current cards when a reroll is exhausted', async () => {
    const user = userEvent.setup();
    api.rerollCrateSuggestions.mockResolvedValue(
      batch([], { exhausted: true })
    );
    renderSuggestions();
    await user.click(
      await screen.findByRole('button', { name: /show different suggestions/i })
    );
    expect(
      await screen.findByText("That's all the suggestions for today.")
    ).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.getByText(first.name)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /show different suggestions/i })
    ).toBeDisabled();
  });

  it('checks again while the collection is loading', async () => {
    jest.useFakeTimers();
    try {
      api.getCrateSuggestions
        .mockResolvedValueOnce(batch([], { reason: 'collectionLoading' }))
        .mockResolvedValue(batch([first]));
      renderSuggestions();
      await act(async () => {
        await Promise.resolve();
      });
      expect(
        screen.getByText(
          'Suggestions appear once your collection has finished loading.'
        )
      ).toBeInTheDocument();
      await act(async () => {
        jest.advanceTimersByTime(COLLECTION_LOADING_POLL_MS);
      });
      expect(api.getCrateSuggestions).toHaveBeenCalledTimes(2);
      expect(screen.getByText(first.name)).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('refetches when the refresh key changes', async () => {
    const { rerender } = render(
      <CrateSuggestions api={api} onAdded={jest.fn()} refreshKey={0} />
    );
    expect(await screen.findByText(first.name)).toBeInTheDocument();
    api.getCrateSuggestions.mockResolvedValue(batch([backfill]));
    rerender(<CrateSuggestions api={api} onAdded={jest.fn()} refreshKey={1} />);
    expect(await screen.findByText(backfill.name)).toBeInTheDocument();
    expect(api.getCrateSuggestions).toHaveBeenCalledTimes(2);
  });

  it('shows the collection-loading message', async () => {
    api.getCrateSuggestions.mockResolvedValue(
      batch([], { reason: 'collectionLoading' })
    );
    renderSuggestions();
    expect(
      await screen.findByText(
        'Suggestions appear once your collection has finished loading.'
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /show different suggestions/i })
    ).not.toBeInTheDocument();
  });

  it('renders nothing when there are no candidates', async () => {
    api.getCrateSuggestions.mockResolvedValue(
      batch([], { reason: 'noCandidates' })
    );
    const { container } = render(
      <CrateSuggestions api={api} onAdded={jest.fn()} />
    );
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('renders nothing when suggestions fail to load', async () => {
    api.getCrateSuggestions.mockRejectedValue(new Error('down'));
    const { container } = render(
      <CrateSuggestions api={api} onAdded={jest.fn()} />
    );
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('previews a suggestion read-only and can add it from there', async () => {
    const user = userEvent.setup();
    api.previewCrate.mockResolvedValue(
      makeEvaluation({
        albums: [
          makeAlbum({ album: 'Bizarro', artist: 'The Wedding Present' }),
        ],
      })
    );
    api.createCrate.mockResolvedValue(makeCrate({ id: 'p1' }));
    const { onAdded } = renderSuggestions();

    await user.click(
      await screen.findByRole('button', { name: `Preview ${first.name}` })
    );
    const dialog = await screen.findByRole('dialog');
    expect(api.previewCrate).toHaveBeenCalledWith(first.rules, first.sort);
    expect(await within(dialog).findByText('Bizarro')).toBeInTheDocument();
    expect(within(dialog).getByText('Style is Post-Punk')).toBeInTheDocument();
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Add crate' }));
    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(api.createCrate).toHaveBeenCalledWith(
      expect.objectContaining({ sourceSuggestionKey: first.candidateKey })
    );
  });
});

describe('CrateSuggestionHistoryReset', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('asks for confirmation before resetting suggestion history', async () => {
    const user = userEvent.setup();
    const resetApi = {
      resetCrateSuggestionHistory: jest.fn().mockResolvedValue(undefined),
    };
    const onReset = jest.fn();
    render(<CrateSuggestionHistoryReset api={resetApi} onReset={onReset} />);

    await user.click(
      screen.getByRole('button', { name: /reset suggestion history/i })
    );
    let dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(resetApi.resetCrateSuggestionHistory).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole('button', { name: /reset suggestion history/i })
    );
    dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(onReset).toHaveBeenCalledTimes(1));
    expect(resetApi.resetCrateSuggestionHistory).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith(
      'success',
      'Suggestion history reset'
    );
  });
});
