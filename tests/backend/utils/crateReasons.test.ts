import {
  CrateAlbumCopy,
  CrateCoverage,
  CrateRule,
  CrateRuleResult,
} from '../../../src/shared/types';
import {
  CrateReasonContext,
  describeCrateRule,
  formatCrateCoverage,
  formatCrateReason,
  formatMembership,
  formatScrobbleMatch,
  formatSuggestionDescription,
  formatSuggestionName,
  formatSuggestionReason,
  formatUnknownCount,
} from '../../../src/shared/utils/crateReasons';

const now = new Date(2026, 9, 18, 12, 0); // Oct 18, 2026, local time
const sec = (d: Date) => Math.floor(d.getTime() / 1000);
const HISTORY_FROM = sec(new Date(2005, 1, 20));

const vinyl: CrateAlbumCopy = {
  releaseId: 101,
  title: 'Bizarro',
  artist: 'The Wedding Present',
  year: 2023,
  format: ['Vinyl'],
  dateAdded: '2026-09-14T10:00:00',
  copyCount: 1,
};
const cd: CrateAlbumCopy = {
  releaseId: 102,
  title: 'Bizarro',
  artist: 'The Wedding Present',
  year: 1998,
  format: ['CD'],
  dateAdded: '2024-03-01T10:00:00',
  copyCount: 1,
};

const one: CrateReasonContext = { copies: [vinyl], now };
const two: CrateReasonContext = { copies: [vinyl, cd], now };

function result(
  outcome: CrateRuleResult['outcome'],
  evidence: CrateRuleResult['evidence'] = {}
): CrateRuleResult {
  return { ruleId: 'r', outcome, evidence };
}

/** A rule without its id (distributes over the union) */
type RuleInput = CrateRule extends infer R
  ? R extends CrateRule
    ? Omit<R, 'id'>
    : never
  : never;

function rule(r: RuleInput): CrateRule {
  return { id: 'r', ...r } as CrateRule;
}

describe('formatCrateReason', () => {
  describe('format', () => {
    const anyOf = rule({ field: 'format', op: 'anyOf', values: ['Vinyl'] });
    const noneOf = rule({ field: 'format', op: 'noneOf', values: ['CD'] });

    it('names the witness format', () => {
      expect(
        formatCrateReason(anyOf, result('match', { releaseId: 101 }), one)
      ).toBe('Format: Vinyl');
    });

    it('names the witness pressing when there are several copies', () => {
      expect(
        formatCrateReason(noneOf, result('match', { releaseId: 101 }), two)
      ).toBe('Format: Vinyl · 2023 pressing');
    });

    it('explains a non-match', () => {
      const cdOnly = { copies: [cd], now };
      expect(
        formatCrateReason(
          rule({ field: 'format', op: 'anyOf', values: ['Vinyl', 'Cassette'] }),
          result('noMatch', { releaseId: 102 }),
          cdOnly
        )
      ).toBe('Format is CD, not Vinyl or Cassette');
      expect(
        formatCrateReason(noneOf, result('noMatch', { releaseId: 102 }), cdOnly)
      ).toBe('Format is CD, which this crate leaves out');
    });
  });

  describe('artist', () => {
    const r = rule({ field: 'artist', op: 'anyOf', values: ['Cinerama'] });
    it('match and noMatch', () => {
      expect(
        formatCrateReason(r, result('match', { releaseId: 101 }), one)
      ).toBe('Artist: The Wedding Present');
      expect(
        formatCrateReason(
          r,
          result('noMatch', { value: 'The Wedding Present' }),
          one
        )
      ).toBe('Artist is The Wedding Present, not Cinerama');
    });
  });

  describe('genre and style', () => {
    const jazz = rule({
      field: 'genre',
      op: 'anyOf',
      values: ['Jazz', 'Soul'],
    });
    const noJazz = rule({ field: 'genre', op: 'noneOf', values: ['Jazz'] });
    const postPunk = rule({
      field: 'style',
      op: 'anyOf',
      values: ['Post-Punk'],
    });

    it('shows the matching genre from Discogs', () => {
      expect(
        formatCrateReason(
          jazz,
          result('match', { value: ['Jazz', 'Funk / Soul'] }),
          one
        )
      ).toBe('Genre: Jazz (Discogs)');
      expect(
        formatCrateReason(
          noJazz,
          result('match', { value: ['Rock', 'Pop'] }),
          one
        )
      ).toBe('Genre: Rock, Pop (Discogs)');
      expect(
        formatCrateReason(
          postPunk,
          result('match', { value: ['post-punk'] }),
          one
        )
      ).toBe('Style: post-punk (Discogs)');
    });

    it('explains a non-match', () => {
      expect(
        formatCrateReason(jazz, result('noMatch', { value: ['Rock'] }), one)
      ).toBe('Genre on Discogs is Rock, not Jazz or Soul');
      expect(
        formatCrateReason(
          noJazz,
          result('noMatch', { value: ['Jazz', 'Rock'] }),
          one
        )
      ).toBe('Genre on Discogs includes Jazz, which this crate leaves out');
      expect(
        formatCrateReason(
          postPunk,
          result('noMatch', { value: ['Indie Rock'] }),
          one
        )
      ).toBe('Style on Discogs is Indie Rock, not Post-Punk');
    });

    it('explains an unknown genre or style', () => {
      expect(formatCrateReason(jazz, result('unknown'), one)).toBe(
        "Genre unknown: details for this release haven't been fetched from Discogs"
      );
      expect(
        formatCrateReason(postPunk, result('unknown', { releaseId: 102 }), two)
      ).toBe(
        "Style unknown: details for this release haven't been fetched from Discogs · 1998 pressing · CD"
      );
    });
  });

  describe('pressingYear', () => {
    const nineties = rule({
      field: 'pressingYear',
      op: 'between',
      from: 1990,
      to: 1999,
    });
    it('match, noMatch and unknown', () => {
      expect(
        formatCrateReason(nineties, result('match', { releaseId: 102 }), two)
      ).toBe('Pressing year: 1998 · 1998 pressing · CD');
      expect(
        formatCrateReason(nineties, result('noMatch', { value: 2023 }), one)
      ).toBe('Pressing year 2023, not between 1990 and 1999');
      expect(
        formatCrateReason(
          rule({ field: 'pressingYear', op: 'between', from: 2000 }),
          result('noMatch', { value: 1998 }),
          one
        )
      ).toBe('Pressing year 1998, not 2000 or later');
      expect(formatCrateReason(nineties, result('unknown'), one)).toBe(
        'Pressing year not listed on Discogs'
      );
    });
  });

  describe('dateAdded', () => {
    it('says "Added to Discogs" with the date', () => {
      const within = rule({ field: 'dateAdded', op: 'withinDays', days: 90 });
      expect(
        formatCrateReason(within, result('match', { releaseId: 101 }), one)
      ).toBe('Added to Discogs Sep 14, 2026');
      expect(
        formatCrateReason(
          within,
          result('noMatch', { dateAdded: '2024-03-01T10:00:00' }),
          one
        )
      ).toBe('Added to Discogs Mar 1, 2024, more than 90 days ago');
      expect(
        formatCrateReason(
          rule({ field: 'dateAdded', op: 'olderThanDays', days: 365 }),
          result('noMatch', { releaseId: 101 }),
          one
        )
      ).toBe('Added to Discogs Sep 14, 2026, within the last 12 months');
      expect(
        formatCrateReason(
          rule({
            field: 'dateAdded',
            op: 'between',
            from: '2026-01-01',
            to: '2026-03-01',
          }),
          result('noMatch', { releaseId: 101 }),
          one
        )
      ).toBe(
        'Added to Discogs Sep 14, 2026, not between Jan 1, 2026 and Mar 1, 2026'
      );
    });
  });

  describe('rating', () => {
    const four = rule({ field: 'rating', op: 'atLeast', value: 4 });
    const unrated = rule({ field: 'rating', op: 'isUnrated' });
    it('match, noMatch and unknown', () => {
      expect(formatCrateReason(four, result('match', { value: 5 }), one)).toBe(
        'Rated 5 of 5 on Discogs'
      );
      expect(
        formatCrateReason(four, result('noMatch', { value: 3 }), one)
      ).toBe('Rated 3 of 5 on Discogs, below 4');
      expect(formatCrateReason(four, result('unknown'), one)).toBe(
        'Not rated on Discogs'
      );
      expect(formatCrateReason(unrated, result('match'), one)).toBe(
        'Not rated on Discogs'
      );
      expect(
        formatCrateReason(unrated, result('noMatch', { value: 2 }), one)
      ).toBe('Rated 2 of 5 on Discogs');
    });
  });

  describe('runtime', () => {
    const forty = rule({ field: 'runtime', op: 'atMost', minutes: 40 });
    const long = rule({ field: 'runtime', op: 'atLeast', minutes: 40 });
    const between = rule({
      field: 'runtime',
      op: 'between',
      minMinutes: 30,
      maxMinutes: 40,
    });
    const timed = (
      knownSeconds: number,
      tracksWithDuration: number,
      trackCount: number
    ) => ({
      knownSeconds,
      tracksWithDuration,
      trackCount,
    });

    it('describes a complete runtime', () => {
      expect(
        formatCrateReason(forty, result('match', timed(2292, 9, 9)), one)
      ).toBe('Runtime 38:12 (all 9 tracks timed)');
      expect(
        formatCrateReason(forty, result('match', timed(192, 1, 1)), one)
      ).toBe('Runtime 3:12 (1 track)');
      expect(
        formatCrateReason(
          forty,
          result('match', { ...timed(2292, 9, 9), releaseId: 101 }),
          two
        )
      ).toBe('Runtime 38:12 (all 9 tracks timed) · 2023 pressing · Vinyl');
    });

    it('explains a complete runtime that does not match', () => {
      expect(
        formatCrateReason(forty, result('noMatch', timed(3130, 9, 9)), one)
      ).toBe('Runtime 52:10, longer than 40 minutes');
      expect(
        formatCrateReason(long, result('noMatch', timed(1445, 5, 5)), one)
      ).toBe('Runtime 24:05, shorter than 40 minutes');
      expect(
        formatCrateReason(between, result('noMatch', timed(3130, 9, 9)), one)
      ).toBe('Runtime 52:10, not between 30 and 40 minutes');
    });

    it('explains partial durations that still decide the rule', () => {
      expect(
        formatCrateReason(forty, result('noMatch', timed(2650, 6, 9)), one)
      ).toBe(
        'Runtime over 40 minutes: the 6 of 9 tracks with durations on Discogs add up to 44:10'
      );
      expect(
        formatCrateReason(long, result('match', timed(2650, 6, 9)), one)
      ).toBe(
        'Runtime at least 40 minutes: the 6 of 9 tracks with durations on Discogs add up to 44:10'
      );
    });

    it('explains an unknown runtime', () => {
      expect(
        formatCrateReason(forty, result('unknown', timed(1450, 6, 9)), one)
      ).toBe(
        'Runtime unknown: Discogs lists durations for 6 of 9 tracks (24:10 known)'
      );
      expect(
        formatCrateReason(forty, result('unknown', timed(0, 0, 9)), one)
      ).toBe(
        'Runtime unknown: Discogs lists no track durations for this release'
      );
      expect(
        formatCrateReason(forty, result('unknown', timed(0, 0, 0)), one)
      ).toBe('Runtime unknown: Discogs lists no tracks for this release');
      expect(formatCrateReason(forty, result('unknown'), one)).toBe(
        "Runtime unknown: details for this release haven't been fetched from Discogs"
      );
    });
  });

  describe('discardPile', () => {
    it('match and noMatch for both operators', () => {
      const exclude = rule({ field: 'discardPile', op: 'exclude' });
      const only = rule({ field: 'discardPile', op: 'only' });
      expect(formatCrateReason(exclude, result('match'), one)).toBe(
        'Not in your discard pile'
      );
      expect(formatCrateReason(exclude, result('noMatch'), one)).toBe(
        'In your discard pile'
      );
      expect(formatCrateReason(only, result('match'), one)).toBe(
        'In your discard pile'
      );
      expect(formatCrateReason(only, result('noMatch'), one)).toBe(
        'Not in your discard pile'
      );
    });
  });

  describe('scrobbleCount', () => {
    const top = rule({ field: 'scrobbleCount', op: 'topPercent', percent: 20 });
    const atLeast = rule({ field: 'scrobbleCount', op: 'atLeast', value: 100 });
    const atMost = rule({ field: 'scrobbleCount', op: 'atMost', value: 5 });

    it('ranks a top album', () => {
      expect(
        formatCrateReason(
          top,
          result('match', { scrobbles: 412, rank: 37, rankOf: 1150 }),
          one
        )
      ).toBe(
        'Top 20% by scrobbles: 412 scrobbles, #37 of 1,150 owned albums with scrobbles'
      );
      expect(
        formatCrateReason(
          top,
          result('noMatch', { scrobbles: 3, rank: 900, rankOf: 1150 }),
          one
        )
      ).toBe(
        'Not in your top 20% by scrobbles: 3 scrobbles, #900 of 1,150 owned albums with scrobbles'
      );
      expect(
        formatCrateReason(top, result('noMatch', { scrobbles: 0 }), one)
      ).toBe('Not in your top 20% by scrobbles: no scrobbles recorded');
    });

    it('counts scrobbles', () => {
      expect(
        formatCrateReason(atLeast, result('match', { scrobbles: 1412 }), one)
      ).toBe('1,412 scrobbles recorded');
      expect(
        formatCrateReason(atLeast, result('noMatch', { scrobbles: 1 }), one)
      ).toBe('1 scrobble recorded, fewer than 100');
      expect(
        formatCrateReason(atMost, result('noMatch', { scrobbles: 412 }), one)
      ).toBe('412 scrobbles recorded, more than 5');
    });

    it('explains albums with none recorded', () => {
      expect(
        formatCrateReason(atMost, result('match', { scrobbles: 0 }), one)
      ).toBe('No scrobbles recorded for this album');
      expect(
        formatCrateReason(atMost, result('match', { scrobbles: 0 }), {
          ...one,
          historyFrom: HISTORY_FROM,
          listening: { scrobbleCount: 0, lastPlayed: null, matchType: 'none' },
        })
      ).toBe(
        'No scrobbles recorded under this title or its mapped names (history starts Feb 2005)'
      );
    });
  });

  describe('scrobblesInPeriod', () => {
    const thisYear = rule({
      field: 'scrobblesInPeriod',
      period: { kind: 'calendarYear' },
      op: 'none',
    });
    const lastNinety = rule({
      field: 'scrobblesInPeriod',
      period: { kind: 'lastDays', days: 90 },
      op: 'atLeast',
      value: 10,
    });
    const since = rule({
      field: 'scrobblesInPeriod',
      period: { kind: 'since', date: '2001-01-01' },
      op: 'none',
    });
    const lastPlayed = sec(new Date(2025, 10, 3, 20, 0));

    it('no scrobbles this year, with the last scrobble', () => {
      expect(
        formatCrateReason(
          thisYear,
          result('match', { scrobbles: 0, lastPlayed }),
          one
        )
      ).toBe(
        'No scrobbles recorded since Jan 1, 2026 · last scrobble Nov 3, 2025'
      );
    });

    it('no scrobbles at all', () => {
      expect(
        formatCrateReason(
          thisYear,
          result('match', { scrobbles: 0, lastPlayed: null }),
          {
            ...one,
            historyFrom: HISTORY_FROM,
          }
        )
      ).toBe('No scrobbles recorded for this album (history starts Feb 2005)');
    });

    it('scrobbles in the period', () => {
      expect(
        formatCrateReason(
          thisYear,
          result('noMatch', {
            scrobbles: 3,
            lastPlayed: sec(new Date(2026, 9, 1, 9, 0)),
          }),
          one
        )
      ).toBe(
        '3 scrobbles recorded since Jan 1, 2026 · last scrobble Oct 1, 2026'
      );
      expect(
        formatCrateReason(lastNinety, result('noMatch', { scrobbles: 4 }), one)
      ).toBe('4 scrobbles recorded in the last 90 days, fewer than 10');
      expect(
        formatCrateReason(lastNinety, result('match', { scrobbles: 12 }), one)
      ).toBe('12 scrobbles recorded in the last 90 days');
    });

    it('appends the history start when the window predates it', () => {
      expect(
        formatCrateReason(
          since,
          result('match', {
            scrobbles: 0,
            lastPlayed: undefined,
            historyFrom: HISTORY_FROM,
          }),
          one
        )
      ).toBe(
        'No scrobbles recorded since Jan 1, 2001 (history starts Feb 2005)'
      );
      expect(
        formatCrateReason(
          since,
          result('noMatch', {
            scrobbles: 2,
            lastPlayed,
            historyFrom: HISTORY_FROM,
          }),
          one
        )
      ).toBe(
        '2 scrobbles recorded since Jan 1, 2001 (history starts Feb 2005) · last scrobble Nov 3, 2025'
      );
    });

    it('does not append the history start otherwise', () => {
      expect(
        formatCrateReason(
          thisYear,
          result('match', { scrobbles: 0, lastPlayed }),
          {
            ...one,
            historyFrom: HISTORY_FROM,
          }
        )
      ).not.toContain('history starts');
    });
  });

  describe('lastRecordedPlay', () => {
    const dusty = rule({
      field: 'lastRecordedPlay',
      op: 'olderThanDays',
      days: 365,
      includeNoRecordedPlays: true,
    });
    const recent = rule({
      field: 'lastRecordedPlay',
      op: 'withinDays',
      days: 90,
    });

    it('tells an old scrobble apart from none recorded', () => {
      expect(
        formatCrateReason(
          dusty,
          result('match', { lastPlayed: sec(new Date(2023, 4, 2, 21)) }),
          one
        )
      ).toBe('Last scrobble May 2, 2023');
      expect(
        formatCrateReason(dusty, result('match', { lastPlayed: null }), one)
      ).toBe('No scrobbles recorded for this album');
    });

    it('explains a non-match', () => {
      expect(
        formatCrateReason(
          dusty,
          result('noMatch', { lastPlayed: sec(new Date(2026, 9, 1, 9)) }),
          one
        )
      ).toBe('Last scrobble Oct 1, 2026, within the last 12 months');
      expect(
        formatCrateReason(
          recent,
          result('noMatch', { lastPlayed: sec(new Date(2023, 4, 2, 21)) }),
          one
        )
      ).toBe('Last scrobble May 2, 2023, more than 90 days ago');
      expect(
        formatCrateReason(
          recent,
          result('noMatch', { lastPlayed: null, historyFrom: HISTORY_FROM }),
          one
        )
      ).toBe('No scrobbles recorded for this album (history starts Feb 2005)');
    });
  });

  describe('playsSinceAdded', () => {
    const none = rule({ field: 'playsSinceAdded', op: 'none' });
    const atLeast = rule({
      field: 'playsSinceAdded',
      op: 'atLeast',
      value: 10,
    });

    it('mentions scrobbles from before the copy was added to Discogs', () => {
      expect(
        formatCrateReason(
          none,
          result('match', {
            scrobbles: 0,
            playsBeforeAdded: 23,
            lastPlayed: sec(new Date(2024, 2, 9, 18)),
            dateAdded: '2026-09-14T10:00:00',
          }),
          two
        )
      ).toBe(
        'Added to Discogs Sep 14, 2026 · no scrobbles recorded since · 23 scrobbles recorded before that (last Mar 2024)'
      );
    });

    it('uses the latest copy when evidence has no date', () => {
      expect(
        formatCrateReason(none, result('match', { scrobbles: 0 }), {
          ...two,
          copies: [cd, vinyl],
        })
      ).toBe('Added to Discogs Sep 14, 2026 · no scrobbles recorded since');
    });

    it('counts scrobbles since', () => {
      expect(
        formatCrateReason(
          none,
          result('noMatch', { scrobbles: 1, dateAdded: vinyl.dateAdded }),
          one
        )
      ).toBe('Added to Discogs Sep 14, 2026 · 1 scrobble recorded since');
      expect(
        formatCrateReason(
          atLeast,
          result('noMatch', { scrobbles: 3, dateAdded: vinyl.dateAdded }),
          one
        )
      ).toBe(
        'Added to Discogs Sep 14, 2026 · 3 scrobbles recorded since, fewer than 10'
      );
      expect(
        formatCrateReason(
          atLeast,
          result('match', { scrobbles: 12, dateAdded: vinyl.dateAdded }),
          one
        )
      ).toBe('Added to Discogs Sep 14, 2026 · 12 scrobbles recorded since');
    });
  });

  it('explains listening rules without a history index', () => {
    for (const r of [
      rule({ field: 'scrobbleCount', op: 'topPercent', percent: 20 }),
      rule({
        field: 'scrobblesInPeriod',
        period: { kind: 'calendarYear' },
        op: 'none',
      }),
      rule({ field: 'lastRecordedPlay', op: 'withinDays', days: 30 }),
      rule({ field: 'playsSinceAdded', op: 'none' }),
    ]) {
      expect(formatCrateReason(r, result('unknown'), one)).toBe(
        'No scrobble history yet: sync your Last.fm history'
      );
    }
  });
});

describe('formatScrobbleMatch', () => {
  it('explains fuzzy and missing name matches', () => {
    expect(
      formatScrobbleMatch({ matchType: 'exact', matchedKeys: ['a'] })
    ).toBeUndefined();
    expect(
      formatScrobbleMatch({
        matchType: 'fuzzy',
        matchedKeys: ['Bizarro (Deluxe)'],
      })
    ).toBe('Scrobbles matched as "Bizarro (Deluxe)"');
    expect(
      formatScrobbleMatch({
        matchType: 'fuzzy',
        matchedKeys: ['Bizarro (Deluxe)', 'Bizarro (Remastered)'],
      })
    ).toBe(
      'Scrobbles matched as "Bizarro (Deluxe)" and "Bizarro (Remastered)"'
    );
    expect(formatScrobbleMatch({ matchType: 'none', matchedKeys: [] })).toBe(
      'No scrobbles recorded under this title or its mapped names'
    );
  });
});

describe('formatMembership', () => {
  const at = new Date(2026, 9, 2, 15, 0).getTime();
  it('describes each membership', () => {
    expect(formatMembership({ membership: 'rules' })).toBe('Matches rules');
    expect(formatMembership({ membership: 'included' })).toBe(
      'Included by you'
    );
    expect(formatMembership({ membership: 'included', overrideAt: at })).toBe(
      'Included by you on Oct 2, 2026'
    );
    expect(formatMembership({ membership: 'includedAndRules' })).toBe(
      'Included by you · also matches rules'
    );
    expect(
      formatMembership({ membership: 'includedAndRules', overrideAt: at })
    ).toBe('Included by you on Oct 2, 2026 · also matches rules');
    expect(formatMembership({ membership: 'excluded' })).toBe(
      'Excluded by you'
    );
    expect(formatMembership({ membership: 'excluded', overrideAt: at })).toBe(
      'Excluded by you on Oct 2, 2026'
    );
  });
});

describe('describeCrateRule', () => {
  it.each<[RuleInput, string]>([
    [{ field: 'format', op: 'anyOf', values: ['Vinyl'] }, 'Format is Vinyl'],
    [
      { field: 'format', op: 'anyOf', values: ['Vinyl', 'Cassette'] },
      'Format is any of Vinyl, Cassette',
    ],
    [{ field: 'format', op: 'noneOf', values: ['CD'] }, 'Format is not CD'],
    [
      { field: 'format', op: 'noneOf', values: ['CD', 'File'] },
      'Format is none of CD, File',
    ],
    [
      { field: 'artist', op: 'anyOf', values: ['The Wedding Present'] },
      'Artist is The Wedding Present',
    ],
    [
      {
        field: 'artist',
        op: 'anyOf',
        values: ['The Wedding Present', 'Cinerama'],
      },
      'Artist is any of The Wedding Present, Cinerama',
    ],
    [
      { field: 'genre', op: 'anyOf', values: ['Jazz', 'Soul'] },
      'Genre is any of Jazz, Soul',
    ],
    [{ field: 'genre', op: 'noneOf', values: ['Jazz'] }, 'Genre is not Jazz'],
    [
      { field: 'style', op: 'anyOf', values: ['Post-Punk'] },
      'Style is Post-Punk',
    ],
    [
      { field: 'style', op: 'noneOf', values: ['Free Jazz', 'Noise'] },
      'Style is none of Free Jazz, Noise',
    ],
    [
      { field: 'genre', op: 'anyOf', values: ['Jazz'], ifUnknown: 'include' },
      'Genre is Jazz · missing data counts as a match',
    ],
    [
      { field: 'pressingYear', op: 'between', from: 1990, to: 1999 },
      'Pressing year between 1990 and 1999',
    ],
    [
      { field: 'pressingYear', op: 'between', from: 1990, to: 1990 },
      'Pressing year 1990',
    ],
    [
      { field: 'pressingYear', op: 'between', from: 2000 },
      'Pressing year 2000 or later',
    ],
    [
      { field: 'pressingYear', op: 'between', to: 1979 },
      'Pressing year 1979 or earlier',
    ],
    [
      { field: 'pressingYear', op: 'between' },
      'Pressing year listed on Discogs',
    ],
    [
      { field: 'dateAdded', op: 'withinDays', days: 90 },
      'Added to Discogs in the last 90 days',
    ],
    [
      { field: 'dateAdded', op: 'olderThanDays', days: 730 },
      'Added to Discogs more than 2 years ago',
    ],
    [
      {
        field: 'dateAdded',
        op: 'between',
        from: '2026-01-01',
        to: '2026-03-01',
      },
      'Added to Discogs between Jan 1, 2026 and Mar 1, 2026',
    ],
    [
      { field: 'dateAdded', op: 'between', from: '2026-01-01' },
      'Added to Discogs on or after Jan 1, 2026',
    ],
    [
      { field: 'dateAdded', op: 'between', to: '2026-03-01' },
      'Added to Discogs on or before Mar 1, 2026',
    ],
    [
      { field: 'rating', op: 'atLeast', value: 4 },
      'Rated 4 or higher on Discogs',
    ],
    [{ field: 'rating', op: 'atLeast', value: 5 }, 'Rated 5 on Discogs'],
    [{ field: 'rating', op: 'isUnrated' }, 'Not rated on Discogs'],
    [
      { field: 'runtime', op: 'atMost', minutes: 40 },
      'Runtime 40 minutes or less',
    ],
    [
      { field: 'runtime', op: 'atLeast', minutes: 60 },
      'Runtime 60 minutes or more',
    ],
    [
      { field: 'runtime', op: 'between', minMinutes: 30, maxMinutes: 45 },
      'Runtime between 30 and 45 minutes',
    ],
    [{ field: 'discardPile', op: 'exclude' }, 'Not in your discard pile'],
    [{ field: 'discardPile', op: 'only' }, 'In your discard pile'],
    [
      { field: 'scrobbleCount', op: 'atLeast', value: 1 },
      'At least 1 scrobble',
    ],
    [
      { field: 'scrobbleCount', op: 'atLeast', value: 1000 },
      'At least 1,000 scrobbles',
    ],
    [
      { field: 'scrobbleCount', op: 'atMost', value: 0 },
      'No scrobbles recorded',
    ],
    [{ field: 'scrobbleCount', op: 'atMost', value: 5 }, 'At most 5 scrobbles'],
    [
      { field: 'scrobbleCount', op: 'topPercent', percent: 20 },
      'Top 20% of owned albums by scrobbles',
    ],
    [
      {
        field: 'scrobblesInPeriod',
        period: { kind: 'calendarYear' },
        op: 'none',
      },
      'No scrobbles recorded since Jan 1',
    ],
    [
      {
        field: 'scrobblesInPeriod',
        period: { kind: 'lastDays', days: 365 },
        op: 'none',
      },
      'No scrobbles recorded in the last 12 months',
    ],
    [
      {
        field: 'scrobblesInPeriod',
        period: { kind: 'since', date: '2020-06-01' },
        op: 'atLeast',
        value: 10,
      },
      'At least 10 scrobbles since Jun 1, 2020',
    ],
    [
      {
        field: 'scrobblesInPeriod',
        period: { kind: 'lastDays', days: 30 },
        op: 'atMost',
        value: 1,
      },
      'At most 1 scrobble in the last 30 days',
    ],
    [
      {
        field: 'scrobblesInPeriod',
        period: { kind: 'lastDays', days: 30 },
        op: 'atMost',
        value: 0,
      },
      'No scrobbles recorded in the last 30 days',
    ],
    [
      {
        field: 'lastRecordedPlay',
        op: 'olderThanDays',
        days: 365,
        includeNoRecordedPlays: true,
      },
      'Last scrobble more than 12 months ago, or none recorded',
    ],
    [
      {
        field: 'lastRecordedPlay',
        op: 'olderThanDays',
        days: 730,
        includeNoRecordedPlays: false,
      },
      'Last scrobble more than 2 years ago',
    ],
    [
      { field: 'lastRecordedPlay', op: 'withinDays', days: 30 },
      'Last scrobble in the last 30 days',
    ],
    [
      { field: 'playsSinceAdded', op: 'none' },
      'No scrobbles recorded since it was added to Discogs',
    ],
    [
      { field: 'playsSinceAdded', op: 'atLeast', value: 3 },
      'At least 3 scrobbles since it was added to Discogs',
    ],
  ])('%j → %s', (r, expected) => {
    expect(describeCrateRule(rule(r))).toBe(expected);
  });
});

describe('formatCrateCoverage', () => {
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const base: CrateCoverage = {
    totalAlbums: 1150,
    totalReleases: 1210,
    historyFrom: HISTORY_FROM,
    newestScrobbleAt: new Date(2026, 9, 9, 20, 0).getTime(),
    lastSyncCompletedAt: now.getTime() - 2 * HOUR,
    hasHistory: true,
    collection: { complete: true, pagesRead: 12, pagesExpected: 12 },
    runtimeKnownAlbums: 800,
    genreKnownAlbums: 1100,
    ratedAlbums: 0,
  };

  it('shows when the last sync finished', () => {
    expect(formatCrateCoverage(base, { hasListeningRules: true, now })).toEqual(
      {
        header:
          'Listening data: Last.fm scrobbles since Feb 2005 · last sync finished 2 hours ago',
      }
    );
  });

  it('shows the newest scrobble for an index without sync completion', () => {
    const coverage = { ...base, lastSyncCompletedAt: null };
    expect(
      formatCrateCoverage(coverage, { hasListeningRules: false, now })
    ).toEqual({
      header:
        'Listening data: Last.fm scrobbles since Feb 2005 · newest scrobble Oct 9, 2026',
    });
    expect(
      formatCrateCoverage(coverage, { hasListeningRules: true, now }).banner
    ).toBe(
      'Sync status unknown. Run a sync to make sure recent scrobbles are included.'
    );
  });

  it('shows no banner for an inactive listener whose sync finished today', () => {
    const coverage = {
      ...base,
      newestScrobbleAt: new Date(2025, 0, 5).getTime(),
      lastSyncCompletedAt: now.getTime() - HOUR,
    };
    expect(
      formatCrateCoverage(coverage, { hasListeningRules: true, now }).banner
    ).toBeUndefined();
  });

  it('warns after 3 days without a finished sync', () => {
    const at3 = { ...base, lastSyncCompletedAt: now.getTime() - 3 * DAY };
    expect(
      formatCrateCoverage(at3, { hasListeningRules: true, now }).banner
    ).toBeUndefined();
    const stale = {
      ...base,
      lastSyncCompletedAt: new Date(2026, 9, 11, 9, 0).getTime(),
    };
    const copy = formatCrateCoverage(stale, { hasListeningRules: true, now });
    expect(copy.header).toBe(
      'Listening data: Last.fm scrobbles since Feb 2005 · last sync finished 7 days ago'
    );
    expect(copy.banner).toBe(
      'Recent scrobbles may be missing. Last sync finished Oct 11, 2026.'
    );
    expect(
      formatCrateCoverage(stale, { hasListeningRules: false, now }).banner
    ).toBeUndefined();
  });

  it('asks for a sync when there is no history', () => {
    const coverage = {
      ...base,
      hasHistory: false,
      historyFrom: null,
      newestScrobbleAt: null,
      lastSyncCompletedAt: null,
    };
    expect(
      formatCrateCoverage(coverage, { hasListeningRules: true, now })
    ).toEqual({
      header: 'Listening data: no Last.fm scrobble history synced yet',
      banner: 'Sync your Last.fm history to use listening rules',
    });
    expect(
      formatCrateCoverage(coverage, { hasListeningRules: false, now }).banner
    ).toBeUndefined();
  });

  it('notes an incomplete collection', () => {
    expect(
      formatCrateCoverage(
        {
          ...base,
          collection: { complete: false, pagesRead: 3, pagesExpected: 12 },
        },
        { hasListeningRules: false, now }
      ).collectionNotice
    ).toBe(
      'Collection is still loading (3 of 12 pages). Some albums may be missing.'
    );
    expect(
      formatCrateCoverage(
        {
          ...base,
          collection: { complete: false, pagesRead: 0, pagesExpected: null },
        },
        { hasListeningRules: false, now }
      ).collectionNotice
    ).toBe('Collection is still loading. Some albums may be missing.');
  });
});

describe('formatUnknownCount', () => {
  it.each<[RuleInput, number, string]>([
    [
      { field: 'runtime', op: 'atMost', minutes: 40 },
      31,
      '31 more albums might match: runtime unknown',
    ],
    [
      { field: 'runtime', op: 'atMost', minutes: 40 },
      1,
      '1 more album might match: runtime unknown',
    ],
    [
      { field: 'genre', op: 'anyOf', values: ['Jazz'] },
      4,
      '4 more albums might match: genre unknown',
    ],
    [
      { field: 'style', op: 'anyOf', values: ['Bop'] },
      2,
      '2 more albums might match: style unknown',
    ],
    [
      { field: 'rating', op: 'atLeast', value: 4 },
      1150,
      '1,150 more albums might match: not rated on Discogs',
    ],
    [
      { field: 'pressingYear', op: 'between', from: 1990, to: 1999 },
      7,
      '7 more albums might match: pressing year not listed on Discogs',
    ],
    [
      { field: 'lastRecordedPlay', op: 'withinDays', days: 30 },
      12,
      '12 more albums might match: no scrobble history yet',
    ],
  ])('%j × %d', (r, count, expected) => {
    expect(formatUnknownCount(rule(r), count)).toBe(expected);
  });
});

describe('suggestion copy', () => {
  it('style-quiet', () => {
    const input = {
      recipe: 'style-quiet',
      style: 'Post-Punk',
      days: 365,
    } as const;
    expect(formatSuggestionName(input)).toBe(
      'Post-Punk with no scrobbles in 12 months'
    );
    expect(formatSuggestionDescription(input)).toBe(
      'Post-Punk albums you own with no scrobbles recorded in the last 12 months, ordered by last scrobble, oldest first.'
    );
    expect(formatSuggestionReason(input, { pool: 23, count: 15 })).toBe(
      'You own 23 Post-Punk albums. 15 have no scrobbles recorded in the last 12 months.'
    );
  });

  it('artist', () => {
    const input = { recipe: 'artist', artist: 'The Wedding Present' } as const;
    expect(formatSuggestionName(input)).toBe('The Wedding Present shelf');
    expect(formatSuggestionDescription(input)).toBe(
      'Albums you own by The Wedding Present, ordered by last scrobble, oldest first.'
    );
    expect(formatSuggestionReason(input, { pool: 12, count: 4 })).toBe(
      'You own 12 albums by The Wedding Present. 4 have no scrobbles recorded in the last 12 months.'
    );
    expect(formatSuggestionReason(input, { pool: 12, count: 1 })).toBe(
      'You own 12 albums by The Wedding Present. 1 has no scrobbles recorded in the last 12 months.'
    );
    expect(formatSuggestionReason(input, { pool: 5, count: 0 })).toBe(
      'You own 5 albums by The Wedding Present. All of them have scrobbles recorded in the last 12 months.'
    );
  });

  it('decade-quiet', () => {
    const input = { recipe: 'decade-quiet', decade: 1990, days: 365 } as const;
    expect(formatSuggestionName(input)).toBe(
      '1990s pressings with no scrobbles in 12 months'
    );
    expect(formatSuggestionDescription(input)).toContain(
      'fewest scrobbles first'
    );
    expect(formatSuggestionReason(input, { pool: 140, count: 52 })).toBe(
      'You own 140 albums pressed in the 1990s. 52 have no scrobbles recorded in the last 12 months.'
    );
  });

  it('top-quiet', () => {
    const input = { recipe: 'top-quiet', percent: 20, days: 730 } as const;
    expect(formatSuggestionName(input)).toBe(
      'Most-scrobbled albums with nothing recorded for 2 years'
    );
    expect(formatSuggestionDescription(input)).toBe(
      'Your top 20% of owned albums by recorded scrobbles, with no scrobbles recorded in the last 2 years, most scrobbled first.'
    );
    expect(formatSuggestionReason(input, { pool: 230, count: 9 })).toBe(
      'Your top 20% by scrobbles is 230 albums. 9 have no scrobbles recorded in the last 2 years.'
    );
  });

  it('added-quiet', () => {
    const input = { recipe: 'added-quiet', days: 90 } as const;
    expect(formatSuggestionName(input)).toBe(
      'Added to Discogs in the last 90 days, no scrobbles recorded since'
    );
    expect(formatSuggestionDescription(input)).toContain(
      'Added to Discogs is not always'
    );
    expect(formatSuggestionReason(input, { pool: 6, count: 5 })).toBe(
      '6 albums were added to Discogs in the last 90 days. 5 have no scrobbles recorded since they were added.'
    );
  });

  it('short', () => {
    const input = { recipe: 'short', genre: 'Jazz', minutes: 40 } as const;
    expect(formatSuggestionName(input)).toBe('Jazz that fits in 40 minutes');
    expect(formatSuggestionDescription(input)).toContain(
      '40 minutes or less, shortest first'
    );
    expect(formatSuggestionReason(input, { pool: 18, count: 7 })).toBe(
      'You own 18 Jazz albums with a duration on Discogs for every track. 7 fit in 40 minutes.'
    );
  });

  it('template', () => {
    const input = { recipe: 'template', templateId: 'dusty-shelf' } as const;
    expect(formatSuggestionName(input)).toBe('Dusty shelf');
    expect(formatSuggestionDescription(input)).toContain(
      'no scrobbles recorded in the last year'
    );
    expect(formatSuggestionReason(input, { pool: 0, count: 41 })).toBe(
      '41 of your albums match this starter crate.'
    );
    expect(() =>
      formatSuggestionName({ recipe: 'template', templateId: 'nope' })
    ).toThrow();
  });
});
