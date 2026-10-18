import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useState } from 'react';

import '@testing-library/jest-dom';
import CrateRuleBuilder, {
  PREVIEW_DEBOUNCE_MS,
} from '../../../../src/renderer/components/crates/CrateRuleBuilder';
import { CRATE_MAX_RULES } from '../../../../src/shared/crateTemplates';
import {
  CrateEvaluation,
  CrateRule,
  CrateSort,
} from '../../../../src/shared/types';
import { formatUnknownCount } from '../../../../src/shared/utils/crateReasons';

import { RULES, makeAlbum, makeEvaluation } from './crateFixtures';

const previewCrate = jest.fn<
  Promise<CrateEvaluation>,
  [CrateRule[], CrateSort | undefined]
>();
const api = { previewCrate };

let latestRules: CrateRule[] = [];

const Harness: React.FC<{ initialRules: CrateRule[] }> = ({ initialRules }) => {
  const [rules, setRules] = useState(initialRules);
  const [sort, setSort] = useState<CrateSort>('artist');
  latestRules = rules;
  return (
    <CrateRuleBuilder
      api={api}
      rules={rules}
      sort={sort}
      onRulesChange={setRules}
      onSortChange={setSort}
    />
  );
};

function rowSelect(index: number, part: 'field' | 'operator') {
  return screen.getByRole('combobox', {
    name: `Rule ${index} ${part}`,
  }) as globalThis.HTMLSelectElement;
}

describe('CrateRuleBuilder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    previewCrate.mockResolvedValue(makeEvaluation());
  });

  describe('editing rules', () => {
    it('renders one row per rule with field and operator', () => {
      render(<Harness initialRules={RULES} />);
      expect(
        screen.getAllByRole('listitem', { name: /^Rule \d+$/ })
      ).toHaveLength(3);
      expect(rowSelect(1, 'field').value).toBe('format');
      expect(rowSelect(3, 'field').value).toBe('runtime');
      expect(rowSelect(3, 'operator').value).toBe('atMost');
      expect(screen.getByText('Vinyl')).toBeInTheDocument();
    });

    it('adds and removes rules with stable ids', async () => {
      const user = userEvent.setup();
      render(<Harness initialRules={[RULES[0]]} />);

      await user.click(screen.getByRole('button', { name: /add rule/i }));
      expect(latestRules).toHaveLength(2);
      const addedId = latestRules[1].id;
      expect(addedId).toBeTruthy();
      expect(addedId).not.toBe(RULES[0].id);

      await user.click(screen.getByRole('button', { name: 'Remove rule 1' }));
      expect(latestRules).toHaveLength(1);
      expect(latestRules[0].id).toBe(addedId);
    });

    it(`stops at ${CRATE_MAX_RULES} rules`, () => {
      const many: CrateRule[] = Array.from(
        { length: CRATE_MAX_RULES },
        (_, i) => ({ id: `d${i}`, field: 'discardPile', op: 'exclude' })
      );
      render(<Harness initialRules={many} />);
      expect(screen.getByRole('button', { name: /add rule/i })).toBeDisabled();
    });

    it('switches operators and shows the matching inputs', async () => {
      const user = userEvent.setup();
      render(<Harness initialRules={[RULES[2]]} />);
      expect(screen.getByRole('spinbutton', { name: 'Minutes' })).toHaveValue(
        40
      );

      await user.selectOptions(rowSelect(1, 'operator'), 'between');
      expect(latestRules[0]).toMatchObject({
        id: 'runtime',
        field: 'runtime',
        op: 'between',
        ifUnknown: 'exclude',
      });
      expect(
        screen.getByRole('spinbutton', { name: 'Minimum minutes' })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('spinbutton', { name: 'Maximum minutes' })
      ).toBeInTheDocument();
    });

    it('keeps the entered count when switching between count operators', async () => {
      const user = userEvent.setup();
      render(
        <Harness
          initialRules={[
            { id: 'sc', field: 'scrobbleCount', op: 'atLeast', value: 73 },
          ]}
        />
      );
      await user.selectOptions(rowSelect(1, 'operator'), 'atMost');
      expect(latestRules[0]).toEqual({
        id: 'sc',
        field: 'scrobbleCount',
        op: 'atMost',
        value: 73,
      });
    });

    it('requires at least 1 scrobble since added', () => {
      render(
        <Harness
          initialRules={[
            { id: 'p', field: 'playsSinceAdded', op: 'atLeast', value: 0 },
          ]}
        />
      );
      expect(
        screen.getByText('Enter a whole number from 1 to 1,000,000')
      ).toBeInTheDocument();
    });

    it('switches fields and resets the rule to that field', async () => {
      const user = userEvent.setup();
      render(<Harness initialRules={[RULES[0]]} />);

      await user.selectOptions(rowSelect(1, 'field'), 'scrobblesInPeriod');
      expect(latestRules[0]).toEqual({
        id: 'fmt',
        field: 'scrobblesInPeriod',
        op: 'none',
        period: { kind: 'calendarYear' },
      });

      await user.selectOptions(
        screen.getByRole('combobox', { name: 'Period' }),
        'lastDays'
      );
      expect(latestRules[0]).toMatchObject({
        period: { kind: 'lastDays', days: 30 },
      });
      expect(
        screen.getByRole('spinbutton', { name: 'Number of days' })
      ).toHaveValue(30);
    });

    it('toggles "Include albums with missing data" for unknown-capable rules', async () => {
      const user = userEvent.setup();
      render(<Harness initialRules={[RULES[0], RULES[2]]} />);

      // Format is never unknown: one checkbox only (for runtime)
      const checkbox = screen.getByRole('checkbox', {
        name: 'Include albums with missing data',
      });
      expect(checkbox).not.toBeChecked();
      await user.click(checkbox);
      expect(checkbox).toBeChecked();
      expect(latestRules[1]).toMatchObject({ ifUnknown: 'include' });
      await user.click(checkbox);
      expect(latestRules[1]).toMatchObject({ ifUnknown: 'exclude' });
    });

    it('toggles includeNoRecordedPlays for the last-scrobble rule', async () => {
      const user = userEvent.setup();
      render(
        <Harness
          initialRules={[
            {
              id: 'dusty',
              field: 'lastRecordedPlay',
              op: 'olderThanDays',
              days: 365,
              includeNoRecordedPlays: true,
            },
          ]}
        />
      );
      const checkbox = screen.getByRole('checkbox', {
        name: 'Include albums with no scrobbles recorded',
      });
      expect(checkbox).toBeChecked();
      await user.click(checkbox);
      expect(latestRules[0]).toMatchObject({ includeNoRecordedPlays: false });
    });

    it('adds and removes multi-value chips', async () => {
      const user = userEvent.setup();
      render(<Harness initialRules={[RULES[1]]} />);

      const input = screen.getByRole('combobox', { name: 'Genre values' });
      await user.type(input, 'Soul{Enter}');
      expect(latestRules[0]).toMatchObject({ values: ['Jazz', 'Soul'] });

      await user.click(screen.getByRole('button', { name: 'Remove Jazz' }));
      expect(latestRules[0]).toMatchObject({ values: ['Soul'] });
    });

    it('shows rule help text', () => {
      render(<Harness initialRules={[RULES[2]]} />);
      expect(
        screen.getByText(/sum of the track durations Discogs lists/)
      ).toBeInTheDocument();
    });
  });

  describe('live preview', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    async function flush(ms: number) {
      await act(async () => {
        jest.advanceTimersByTime(ms);
      });
    }

    it('debounces the preview request', async () => {
      render(<Harness initialRules={RULES} />);
      await flush(PREVIEW_DEBOUNCE_MS - 1);
      expect(previewCrate).not.toHaveBeenCalled();
      await flush(1);
      expect(previewCrate).toHaveBeenCalledTimes(1);
      expect(previewCrate).toHaveBeenCalledWith(RULES, 'artist');
    });

    it('sends only the latest rules after quick edits', async () => {
      render(<Harness initialRules={[RULES[2]]} />);
      const minutes = screen.getByRole('spinbutton', { name: 'Minutes' });
      await flush(100);
      fireEvent.change(minutes, { target: { value: '35' } });
      await flush(100);
      fireEvent.change(minutes, { target: { value: '30' } });
      await flush(PREVIEW_DEBOUNCE_MS);

      expect(previewCrate).toHaveBeenCalledTimes(1);
      expect(previewCrate.mock.calls[0][0][0]).toMatchObject({ minutes: 30 });
    });

    it('shows the count, missing-data counts and first matches', async () => {
      previewCrate.mockResolvedValue(
        makeEvaluation({
          albums: [
            makeAlbum(),
            makeAlbum({
              albumKey: 'b',
              album: 'Blue Train',
              artist: 'John Coltrane',
            }),
          ],
          unknownOnly: [{ ruleId: 'runtime', count: 31, sample: [] }],
        })
      );
      render(<Harness initialRules={RULES} />);
      await flush(PREVIEW_DEBOUNCE_MS);

      expect(screen.getByText('albums match')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(
        screen.getByText(formatUnknownCount(RULES[2], 31))
      ).toBeInTheDocument();
      expect(screen.getByText('Blue Train')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Runtime: 812 of 1,150 albums have a duration on Discogs for every track'
        )
      ).toBeInTheDocument();
    });

    it('does not preview incomplete rules', async () => {
      render(
        <Harness
          initialRules={[{ id: 'g', field: 'genre', op: 'anyOf', values: [] }]}
        />
      );
      await flush(PREVIEW_DEBOUNCE_MS * 2);
      expect(previewCrate).not.toHaveBeenCalled();
      expect(
        screen.getByText(/finish the highlighted rules/i)
      ).toBeInTheDocument();
      expect(screen.getByText('Add at least one value')).toBeInTheDocument();
    });

    it('does not preview a crate without rules', async () => {
      render(<Harness initialRules={[]} />);
      await flush(PREVIEW_DEBOUNCE_MS * 2);
      expect(previewCrate).not.toHaveBeenCalled();
      expect(screen.getByText(/no rules yet/i)).toBeInTheDocument();
    });

    it('shows an error when the preview fails', async () => {
      previewCrate.mockRejectedValue(new Error('Server down'));
      render(<Harness initialRules={RULES} />);
      await flush(PREVIEW_DEBOUNCE_MS);
      expect(
        screen.getByText('Preview unavailable: Server down')
      ).toBeInTheDocument();
    });
  });
});
