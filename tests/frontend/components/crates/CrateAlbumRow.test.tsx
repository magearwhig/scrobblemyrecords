import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import '@testing-library/jest-dom';
import CrateAlbumRow, {
  formatCopies,
} from '../../../../src/renderer/components/crates/CrateAlbumRow';
import { CrateAlbumResult } from '../../../../src/shared/types';
import { formatCrateReason } from '../../../../src/shared/utils/crateReasons';

import { RULES, makeAlbum } from './crateFixtures';

function reasonText(album: CrateAlbumResult, index: number): string {
  const result = album.results[index];
  const rule = RULES.find(r => r.id === result.ruleId)!;
  return formatCrateReason(rule, result, {
    copies: album.copies,
    historyFrom: null,
    listening: album.listening,
  });
}

function renderRow(
  album: CrateAlbumResult = makeAlbum(),
  variant: 'member' | 'excluded' = 'member'
) {
  const handlers = {
    onInclude: jest.fn(),
    onExclude: jest.fn(),
    onReset: jest.fn(),
    onOpenRelease: jest.fn(),
  };
  render(
    <ul>
      <CrateAlbumRow
        album={album}
        rules={RULES}
        historyFrom={null}
        variant={variant}
        {...handlers}
      />
    </ul>
  );
  return handlers;
}

describe('CrateAlbumRow', () => {
  it('shows the album, artist and membership', () => {
    renderRow();
    expect(screen.getByText('Kind of Blue')).toBeInTheDocument();
    expect(screen.getByText('Miles Davis')).toBeInTheDocument();
    expect(screen.getByText('Matches rules')).toBeInTheDocument();
    expect(screen.getByText(/Vinyl · 2015 pressing/)).toBeInTheDocument();
  });

  it('shows two reasons inline and the rest under "Why?"', async () => {
    const user = userEvent.setup();
    const album = makeAlbum();
    renderRow(album);

    expect(screen.getByText(reasonText(album, 0))).toBeInTheDocument();
    expect(screen.getByText(reasonText(album, 1))).toBeInTheDocument();
    expect(screen.queryByText(reasonText(album, 2))).not.toBeInTheDocument();

    const why = screen.getByRole('button', { name: /why\?/i });
    expect(why).toHaveAttribute('aria-expanded', 'false');
    await user.click(why);
    expect(why).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(reasonText(album, 2))).toBeInTheDocument();

    await user.click(why);
    expect(screen.queryByText(reasonText(album, 2))).not.toBeInTheDocument();
  });

  it('lists the name-match note under "Why?" when no scrobbles matched', async () => {
    const user = userEvent.setup();
    renderRow(
      makeAlbum({
        results: makeAlbum().results.slice(0, 1),
        listening: {
          scrobbleCount: 0,
          lastPlayed: null,
          matchType: 'none',
          matchedKeys: [],
        },
      })
    );
    await user.click(screen.getByRole('button', { name: /why\?/i }));
    expect(
      screen.getByText(
        'No scrobbles recorded under this title or its mapped names'
      )
    ).toBeInTheDocument();
  });

  it('skips results whose rule is not in the crate', () => {
    renderRow(
      makeAlbum({
        results: [{ ruleId: 'gone', outcome: 'match', evidence: {} }],
      })
    );
    expect(
      screen.queryByRole('button', { name: /why\?/i })
    ).not.toBeInTheDocument();
  });

  it('calls Include and Exclude for a rules member', async () => {
    const user = userEvent.setup();
    const album = makeAlbum();
    const handlers = renderRow(album);
    expect(
      screen.getByText('Kind of Blue').closest('li.crate-album-row')
    ).not.toHaveClass('crate-album-row--included');

    expect(
      screen.queryByRole('button', { name: /reset kind of blue/i })
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Always include Kind of Blue' })
    );
    expect(handlers.onInclude).toHaveBeenCalledWith(album);

    await user.click(
      screen.getByRole('button', {
        name: 'Exclude Kind of Blue from this crate',
      })
    );
    expect(handlers.onExclude).toHaveBeenCalledWith(album);
  });

  it('offers Reset to rules for an included album', async () => {
    const user = userEvent.setup();
    const album = makeAlbum({
      membership: 'includedAndRules',
      overrideAt: new Date(2026, 9, 2).getTime(),
    });
    const handlers = renderRow(album);

    expect(
      screen.getByText('Included by you on Oct 2, 2026 · also matches rules')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /always include/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Kind of Blue').closest('li.crate-album-row')
    ).toHaveClass('crate-album-row--included');

    await user.click(
      screen.getByRole('button', { name: 'Reset Kind of Blue to rules' })
    );
    expect(handlers.onReset).toHaveBeenCalledWith(album);
  });

  it('offers Restore and Include for an excluded album', async () => {
    const user = userEvent.setup();
    const album = makeAlbum({ membership: 'excluded' });
    const handlers = renderRow(album, 'excluded');

    expect(
      screen.queryByRole('button', { name: /exclude kind of blue/i })
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /restore/i }));
    expect(handlers.onReset).toHaveBeenCalledWith(album);
    await user.click(
      screen.getByRole('button', { name: 'Include Kind of Blue in this crate' })
    );
    expect(handlers.onInclude).toHaveBeenCalledWith(album);
  });

  it('opens the release', async () => {
    const user = userEvent.setup();
    const album = makeAlbum();
    const handlers = renderRow(album);
    await user.click(
      screen.getByRole('button', { name: 'Open release Kind of Blue' })
    );
    expect(handlers.onOpenRelease).toHaveBeenCalledWith(album);
  });

  it('disables actions while busy', () => {
    render(
      <ul>
        <CrateAlbumRow
          album={makeAlbum()}
          rules={RULES}
          busy
          onInclude={jest.fn()}
          onExclude={jest.fn()}
          onReset={jest.fn()}
          onOpenRelease={jest.fn()}
        />
      </ul>
    );
    expect(
      screen.getByRole('button', { name: /exclude kind of blue/i })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /open release/i })
    ).not.toBeDisabled();
  });

  describe('formatCopies', () => {
    const copy = makeAlbum().copies[0];

    it('is empty for one copy owned once', () => {
      expect(formatCopies(makeAlbum())).toBeNull();
    });

    it('counts pressings and owned copies', () => {
      expect(
        formatCopies(
          makeAlbum({
            copies: [copy, { ...copy, releaseId: 102, copyCount: 2 }],
          })
        )
      ).toBe('2 pressings · owned ×3');
    });

    it('shows owned ×2 for one release owned twice', () => {
      expect(
        formatCopies(makeAlbum({ copies: [{ ...copy, copyCount: 2 }] }))
      ).toBe('owned ×2');
    });
  });
});
