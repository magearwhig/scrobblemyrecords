import {
  crateNeedsFacts,
  evaluateCrate,
  evaluateRule,
  validateCrateRules,
} from '../../../src/backend/services/crateEvaluator';
import {
  CrateAlbumTable,
  CrateEvalContext,
  CrateReleaseFacts,
  CrateTableAlbum,
  CrateTableCopy,
} from '../../../src/backend/services/crateTableTypes';
import { CRATE_TEMPLATES } from '../../../src/shared/crateTemplates';
import { CrateOverride, CrateRule, CrateSort } from '../../../src/shared/types';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 9, 18, 12, 0, 0); // Oct 18 2026, local noon
const sec = (d: Date) => Math.floor(d.getTime() / 1000);
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

let nextId = 1000;

function copy(overrides: Partial<CrateTableCopy> = {}): CrateTableCopy {
  const releaseId = overrides.releaseId ?? nextId++;
  const added = overrides.dateAddedMs ?? daysAgo(400).getTime();
  const artist = overrides.artist ?? 'Artist';
  return {
    releaseId,
    artist,
    title: 'Album',
    format: ['Vinyl'],
    dateAdded: new Date(added).toISOString(),
    dateAddedMs: added,
    copyCount: 1,
    inDiscardPile: false,
    resolvedArtist: artist.toLowerCase(),
    year: 2020,
    ...overrides,
  };
}

function album(
  copies: CrateTableCopy[],
  listening: Partial<CrateTableAlbum['listening']> = {},
  extra: Partial<CrateTableAlbum> = {}
): CrateTableAlbum {
  const sorted = [...copies].sort(
    (a, b) => a.dateAddedMs - b.dateAddedMs || a.releaseId - b.releaseId
  );
  const plays = listening.playTimestamps ?? [];
  return {
    albumKey:
      `${sorted[0].artist}|${sorted[0].title}|${sorted[0].releaseId}`.toLowerCase(),
    artist: sorted[0].artist,
    album: sorted[0].title,
    copies: sorted,
    firstAddedMs: sorted[0].dateAddedMs,
    latestAddedMs: Math.max(...sorted.map(c => c.dateAddedMs)),
    listening: {
      scrobbleCount: plays.length,
      lastPlayed: plays.length ? Math.max(...plays) : null,
      playTimestamps: plays,
      matchType: plays.length ? 'exact' : 'none',
      matchedKeys: [],
      ...listening,
    },
    ...extra,
  };
}

/** Assign competition ranks the way buildAlbumTable does */
function table(
  albums: CrateTableAlbum[],
  overrides: Partial<CrateAlbumTable> = {}
): CrateAlbumTable {
  const ranked = albums
    .filter(a => a.listening.scrobbleCount > 0)
    .sort((a, b) => b.listening.scrobbleCount - a.listening.scrobbleCount);
  ranked.forEach((a, i) => {
    const prev = ranked[i - 1];
    a.scrobbleRank =
      prev && prev.listening.scrobbleCount === a.listening.scrobbleCount
        ? prev.scrobbleRank
        : i + 1;
  });
  return {
    albums,
    rankedAlbumCount: ranked.length,
    totalAlbums: albums.length,
    totalReleases: albums.reduce((n, a) => n + a.copies.length, 0),
    hasHistory: true,
    historyFrom: sec(new Date(2005, 1, 1)),
    newestScrobbleAt: NOW.getTime(),
    lastSyncCompletedAt: NOW.getTime(),
    collection: { complete: true, pagesRead: 1, pagesExpected: 1 },
    fingerprint: 'fp',
    builtAt: NOW.getTime(),
    ...overrides,
  };
}

function ctx(
  t: CrateAlbumTable,
  facts: Record<number, CrateReleaseFacts> = {},
  extra: Partial<CrateEvalContext> = {}
): CrateEvalContext {
  return {
    table: t,
    facts: new Map(Object.entries(facts).map(([k, v]) => [Number(k), v])),
    resolveArtist: name => name.toLowerCase(),
    now: NOW,
    ...extra,
  };
}

function crate(
  rules: CrateRule[],
  overrides: CrateOverride[] = [],
  sort: CrateSort = 'artist'
) {
  return { id: 'crate-1', rules, overrides, sort };
}

function override(
  action: 'include' | 'exclude',
  releaseIds: number[],
  createdAt = 1
): CrateOverride {
  return {
    id: `${action}-${releaseIds.join('-')}`,
    action,
    releaseIds,
    snapshot: { artist: 'Snap', title: 'Shot' },
    createdAt,
  };
}

/** Outcome of a single rule against a single-copy album */
function outcomeOf(
  rule: CrateRule,
  c: CrateTableCopy,
  options: {
    facts?: Record<number, CrateReleaseFacts>;
    listening?: Partial<CrateTableAlbum['listening']>;
    table?: Partial<CrateAlbumTable>;
  } = {}
) {
  const a = album([c], options.listening);
  const t = table([a], options.table);
  return evaluateRule(rule, a, c, ctx(t, options.facts)).outcome;
}

const runtime = (knownSeconds: number, trackCount: number, timed: number) => ({
  knownSeconds,
  trackCount,
  tracksWithDuration: timed,
  complete: trackCount > 0 && timed === trackCount,
});

describe('crateEvaluator', () => {
  describe('evaluateRule: collection rules', () => {
    it('format anyOf / noneOf, case-insensitively', () => {
      const c = copy({ format: ['Vinyl', 'Box Set'] });
      const anyOf = (values: string[]): CrateRule => ({
        id: 'f',
        field: 'format',
        op: 'anyOf',
        values,
      });
      expect(outcomeOf(anyOf(['vinyl']), c)).toBe('match');
      expect(outcomeOf(anyOf(['CD']), c)).toBe('noMatch');
      expect(
        outcomeOf({ id: 'f', field: 'format', op: 'noneOf', values: ['cd'] }, c)
      ).toBe('match');
      expect(
        outcomeOf(
          { id: 'f', field: 'format', op: 'noneOf', values: ['BOX SET'] },
          c
        )
      ).toBe('noMatch');
    });

    it('artist anyOf compares through the resolver on both sides', () => {
      const c = copy({
        artist: 'The Afghan Whigs',
        resolvedArtist: 'the afghan whigs',
      });
      const a = album([c]);
      const resolveArtist = (name: string) =>
        name.toLowerCase().replace(/^afghan whigs$/, 'the afghan whigs');
      const rule = (values: string[]): CrateRule => ({
        id: 'a',
        field: 'artist',
        op: 'anyOf',
        values,
      });
      const evalCtx = ctx(table([a]), {}, { resolveArtist });
      expect(evaluateRule(rule(['Afghan Whigs']), a, c, evalCtx).outcome).toBe(
        'match'
      );
      expect(
        evaluateRule(rule(['THE AFGHAN WHIGS (2)']), a, c, evalCtx).outcome
      ).toBe('match');
      expect(evaluateRule(rule(['Whigs']), a, c, evalCtx).outcome).toBe(
        'noMatch'
      );
    });

    it('genre / style: match, noMatch, and unknown without facts', () => {
      const c = copy();
      const facts = {
        [c.releaseId]: { genres: ['Jazz'], styles: ['Hard Bop'] },
      };
      const genre = (op: 'anyOf' | 'noneOf', values: string[]): CrateRule => ({
        id: 'g',
        field: 'genre',
        op,
        values,
      });
      expect(outcomeOf(genre('anyOf', ['jazz']), c, { facts })).toBe('match');
      expect(outcomeOf(genre('anyOf', ['Rock']), c, { facts })).toBe('noMatch');
      expect(outcomeOf(genre('noneOf', ['Rock']), c, { facts })).toBe('match');
      expect(
        outcomeOf(
          { id: 's', field: 'style', op: 'anyOf', values: ['hard bop'] },
          c,
          { facts }
        )
      ).toBe('match');
      expect(outcomeOf(genre('anyOf', ['Jazz']), c)).toBe('unknown');
      expect(
        outcomeOf(genre('noneOf', ['Jazz']), c, {
          facts: { [c.releaseId]: {} },
        })
      ).toBe('unknown');
    });

    it('pressingYear between, inclusive; unknown without a year', () => {
      const rule: CrateRule = {
        id: 'y',
        field: 'pressingYear',
        op: 'between',
        from: 1980,
        to: 1989,
      };
      expect(outcomeOf(rule, copy({ year: 1980 }))).toBe('match');
      expect(outcomeOf(rule, copy({ year: 1989 }))).toBe('match');
      expect(outcomeOf(rule, copy({ year: 1990 }))).toBe('noMatch');
      expect(outcomeOf(rule, copy({ year: undefined }))).toBe('unknown');
      expect(
        outcomeOf(
          { id: 'y', field: 'pressingYear', op: 'between', from: 2000 },
          copy({ year: 2024 })
        )
      ).toBe('match');
    });

    it('dateAdded withinDays / olderThanDays / between', () => {
      const recent = copy({ dateAddedMs: daysAgo(10).getTime() });
      const old = copy({ dateAddedMs: daysAgo(200).getTime() });
      const within: CrateRule = {
        id: 'd',
        field: 'dateAdded',
        op: 'withinDays',
        days: 90,
      };
      const older: CrateRule = {
        id: 'd',
        field: 'dateAdded',
        op: 'olderThanDays',
        days: 90,
      };
      expect(outcomeOf(within, recent)).toBe('match');
      expect(outcomeOf(within, old)).toBe('noMatch');
      expect(outcomeOf(older, old)).toBe('match');
      expect(outcomeOf(older, recent)).toBe('noMatch');

      const onDay = copy({
        dateAddedMs: new Date(2026, 2, 31, 23, 30).getTime(),
      });
      const between = (from?: string, to?: string): CrateRule => ({
        id: 'd',
        field: 'dateAdded',
        op: 'between',
        from,
        to,
      });
      expect(outcomeOf(between('2026-03-01', '2026-03-31'), onDay)).toBe(
        'match'
      );
      expect(outcomeOf(between('2026-04-01'), onDay)).toBe('noMatch');
      expect(outcomeOf(between(undefined, '2026-03-31'), onDay)).toBe('match');
    });

    it('rating atLeast (unknown when unrated) and isUnrated', () => {
      const atLeast: CrateRule = {
        id: 'r',
        field: 'rating',
        op: 'atLeast',
        value: 4,
      };
      const unrated: CrateRule = { id: 'r', field: 'rating', op: 'isUnrated' };
      expect(outcomeOf(atLeast, copy({ rating: 5 }))).toBe('match');
      expect(outcomeOf(atLeast, copy({ rating: 3 }))).toBe('noMatch');
      expect(outcomeOf(atLeast, copy({ rating: undefined }))).toBe('unknown');
      expect(outcomeOf(unrated, copy({ rating: undefined }))).toBe('match');
      expect(outcomeOf(unrated, copy({ rating: 2 }))).toBe('noMatch');
    });

    it('runtime: complete, partial over atMost, partial undecidable, missing', () => {
      const c = copy();
      const atMost: CrateRule = {
        id: 'rt',
        field: 'runtime',
        op: 'atMost',
        minutes: 40,
      };
      const atLeast: CrateRule = {
        id: 'rt',
        field: 'runtime',
        op: 'atLeast',
        minutes: 40,
      };
      const between: CrateRule = {
        id: 'rt',
        field: 'runtime',
        op: 'between',
        minMinutes: 30,
        maxMinutes: 40,
      };
      const with_ = (r: ReturnType<typeof runtime>) => ({
        facts: { [c.releaseId]: { genres: [], styles: [], runtime: r } },
      });

      expect(outcomeOf(atMost, c, with_(runtime(2400, 9, 9)))).toBe('match');
      expect(outcomeOf(atMost, c, with_(runtime(2401, 9, 9)))).toBe('noMatch');
      expect(outcomeOf(atLeast, c, with_(runtime(2400, 9, 9)))).toBe('match');
      expect(outcomeOf(between, c, with_(runtime(2000, 9, 9)))).toBe('match');
      expect(outcomeOf(between, c, with_(runtime(1700, 9, 9)))).toBe('noMatch');

      // Partial: known part already over the limit
      expect(outcomeOf(atMost, c, with_(runtime(2500, 9, 6)))).toBe('noMatch');
      expect(outcomeOf(between, c, with_(runtime(2500, 9, 6)))).toBe('noMatch');
      // Partial: known part already reaches atLeast
      expect(outcomeOf(atLeast, c, with_(runtime(2400, 9, 6)))).toBe('match');
      // Partial and undecidable
      expect(outcomeOf(atMost, c, with_(runtime(1450, 9, 6)))).toBe('unknown');
      expect(outcomeOf(atLeast, c, with_(runtime(1450, 9, 6)))).toBe('unknown');
      expect(outcomeOf(between, c, with_(runtime(1900, 9, 6)))).toBe('unknown');
      // No tracklist / no details
      expect(outcomeOf(atMost, c, with_(runtime(0, 0, 0)))).toBe('unknown');
      expect(outcomeOf(atMost, c)).toBe('unknown');
    });

    it('runtime evidence carries the known part', () => {
      const c = copy();
      const a = album([c]);
      const r = evaluateRule(
        { id: 'rt', field: 'runtime', op: 'atMost', minutes: 40 },
        a,
        c,
        ctx(table([a]), {
          [c.releaseId]: { runtime: runtime(1450, 9, 6) },
        })
      );
      expect(r.evidence).toEqual({
        releaseId: c.releaseId,
        knownSeconds: 1450,
        tracksWithDuration: 6,
        trackCount: 9,
      });
    });

    it('discardPile exclude / only', () => {
      const kept = copy();
      const discarded = copy({ inDiscardPile: true });
      const exclude: CrateRule = {
        id: 'x',
        field: 'discardPile',
        op: 'exclude',
      };
      const only: CrateRule = { id: 'x', field: 'discardPile', op: 'only' };
      expect(outcomeOf(exclude, kept)).toBe('match');
      expect(outcomeOf(exclude, discarded)).toBe('noMatch');
      expect(outcomeOf(only, discarded)).toBe('match');
      expect(outcomeOf(only, kept)).toBe('noMatch');
    });
  });

  describe('evaluateRule: listening rules', () => {
    const plays = (...dates: Date[]) => dates.map(sec).sort((a, b) => a - b);

    it('scrobbleCount atLeast / atMost', () => {
      const listening = { playTimestamps: plays(daysAgo(1), daysAgo(2)) };
      expect(
        outcomeOf(
          { id: 's', field: 'scrobbleCount', op: 'atLeast', value: 2 },
          copy(),
          { listening }
        )
      ).toBe('match');
      expect(
        outcomeOf(
          { id: 's', field: 'scrobbleCount', op: 'atMost', value: 1 },
          copy(),
          { listening }
        )
      ).toBe('noMatch');
    });

    it('every listening rule is unknown without a history index', () => {
      const listeningRules: CrateRule[] = [
        { id: '1', field: 'scrobbleCount', op: 'atLeast', value: 1 },
        { id: '2', field: 'scrobbleCount', op: 'topPercent', percent: 20 },
        {
          id: '3',
          field: 'scrobblesInPeriod',
          period: { kind: 'calendarYear' },
          op: 'none',
        },
        {
          id: '4',
          field: 'lastRecordedPlay',
          op: 'olderThanDays',
          days: 30,
          includeNoRecordedPlays: true,
        },
        { id: '5', field: 'playsSinceAdded', op: 'none' },
      ];
      for (const rule of listeningRules) {
        expect(outcomeOf(rule, copy(), { table: { hasHistory: false } })).toBe(
          'unknown'
        );
      }
    });

    it('scrobblesInPeriod lastDays / since, with history-start evidence', () => {
      const c = copy();
      const a = album([c], {
        playTimestamps: plays(daysAgo(5), daysAgo(40)),
      });
      const t = table([a]);
      const run = (rule: CrateRule) => evaluateRule(rule, a, c, ctx(t));

      const last30 = run({
        id: 'p',
        field: 'scrobblesInPeriod',
        period: { kind: 'lastDays', days: 30 },
        op: 'atLeast',
        value: 1,
      });
      expect(last30.outcome).toBe('match');
      expect(last30.evidence.scrobbles).toBe(1);
      expect(last30.evidence.historyFrom).toBeUndefined();

      expect(
        run({
          id: 'p',
          field: 'scrobblesInPeriod',
          period: { kind: 'since', date: '2026-08-01' },
          op: 'atMost',
          value: 1,
        }).outcome
      ).toBe('noMatch');

      const long = run({
        id: 'p',
        field: 'scrobblesInPeriod',
        period: { kind: 'lastDays', days: 365 * 25 },
        op: 'none',
      });
      expect(long.outcome).toBe('noMatch');
      expect(long.evidence.historyFrom).toBe(t.historyFrom);
    });

    describe('scrobblesInPeriod calendarYear boundary', () => {
      afterEach(() => jest.useRealTimers());

      const yearRule: CrateRule = {
        id: 'y',
        field: 'scrobblesInPeriod',
        period: { kind: 'calendarYear' },
        op: 'none',
      };

      it.each([
        ['Dec 31 23:59 counts in the year that is ending', 2026, 'noMatch'],
        ['Jan 1 00:01 starts a new, empty year', 2027, 'match'],
      ])('%s', (_label, nowYear, expected) => {
        const now =
          nowYear === 2026
            ? new Date(2026, 11, 31, 23, 59, 30)
            : new Date(2027, 0, 1, 0, 1);
        jest.useFakeTimers().setSystemTime(now);
        const c = copy();
        // A scrobble at Dec 31 23:59 local
        const a = album([c], {
          playTimestamps: [sec(new Date(2026, 11, 31, 23, 59))],
        });
        const r = evaluateRule(
          yearRule,
          a,
          c,
          ctx(table([a]), {}, { now: new Date() })
        );
        expect(r.outcome).toBe(expected);
      });
    });

    it('lastRecordedPlay olderThanDays with includeNoRecordedPlays true/false', () => {
      const rule = (include: boolean): CrateRule => ({
        id: 'l',
        field: 'lastRecordedPlay',
        op: 'olderThanDays',
        days: 365,
        includeNoRecordedPlays: include,
      });
      const none = { playTimestamps: [] };
      const old = { playTimestamps: plays(daysAgo(400)) };
      const recent = { playTimestamps: plays(daysAgo(10)) };
      expect(outcomeOf(rule(true), copy(), { listening: none })).toBe('match');
      expect(outcomeOf(rule(false), copy(), { listening: none })).toBe(
        'noMatch'
      );
      expect(outcomeOf(rule(false), copy(), { listening: old })).toBe('match');
      expect(outcomeOf(rule(true), copy(), { listening: recent })).toBe(
        'noMatch'
      );
      const within: CrateRule = {
        id: 'l',
        field: 'lastRecordedPlay',
        op: 'withinDays',
        days: 30,
      };
      expect(outcomeOf(within, copy(), { listening: recent })).toBe('match');
      expect(outcomeOf(within, copy(), { listening: none })).toBe('noMatch');
    });

    it('playsSinceAdded counts only scrobbles after the newest copy was added', () => {
      const older = copy({ dateAddedMs: daysAgo(300).getTime() });
      const newer = copy({ dateAddedMs: daysAgo(30).getTime() });
      const a = album([older, newer], {
        playTimestamps: plays(daysAgo(200), daysAgo(100), daysAgo(31)),
      });
      const t = table([a]);
      const none = evaluateRule(
        { id: 'n', field: 'playsSinceAdded', op: 'none' },
        a,
        older,
        ctx(t)
      );
      expect(none.outcome).toBe('match');
      expect(none.evidence).toMatchObject({
        scrobbles: 0,
        playsBeforeAdded: 3,
        dateAdded: newer.dateAdded,
      });

      const after = album([newer], {
        playTimestamps: plays(daysAgo(100), daysAgo(5), daysAgo(1)),
      });
      const atLeast = evaluateRule(
        { id: 'n', field: 'playsSinceAdded', op: 'atLeast', value: 2 },
        after,
        newer,
        ctx(table([after]))
      );
      expect(atLeast.outcome).toBe('match');
      expect(atLeast.evidence).toMatchObject({
        scrobbles: 2,
        playsBeforeAdded: 1,
      });
    });
  });

  describe('topPercent', () => {
    const top = (percent: number): CrateRule => ({
      id: 't',
      field: 'scrobbleCount',
      op: 'topPercent',
      percent,
    });
    const withCount = (n: number, name: string) =>
      album([copy({ artist: name })], {
        scrobbleCount: n,
        lastPlayed: n ? sec(daysAgo(1)) : null,
        playTimestamps: Array(n).fill(sec(daysAgo(1))),
      });

    it('includes ties at the cut-off, excludes zero-scrobble albums', () => {
      // 10 albums, top 20% = rank <= 2; three tied at rank 2
      const albums = [
        withCount(50, 'A'),
        withCount(30, 'B'),
        withCount(30, 'C'),
        withCount(30, 'D'),
        withCount(10, 'E'),
        ...['F', 'G', 'H', 'I', 'J'].map(n => withCount(0, n)),
      ];
      const evaluation = evaluateCrate(crate([top(20)]), ctx(table(albums)));
      expect(evaluation.albums.map(a => a.artist)).toEqual([
        'A',
        'B',
        'C',
        'D',
      ]);
      const evidence = evaluation.albums[1].results[0].evidence;
      expect(evidence).toEqual({ scrobbles: 30, rank: 2, rankOf: 5 });

      // 100% still never includes zero-scrobble albums
      expect(
        evaluateCrate(crate([top(100)]), ctx(table(albums))).albums
      ).toHaveLength(5);
    });

    it('ranks over all owned albums, not the filtered set', () => {
      const albums = [
        withCount(50, 'A'),
        withCount(40, 'B'),
        withCount(30, 'C'),
        withCount(20, 'D'),
        withCount(10, 'E'),
      ];
      albums[0].copies[0].format = ['CD'];
      albums[1].copies[0].format = ['CD'];
      // Top 40% = ranks 1-2, both CDs: no vinyl album is in the top 40%
      const evaluation = evaluateCrate(
        crate([
          { id: 'f', field: 'format', op: 'anyOf', values: ['Vinyl'] },
          top(40),
        ]),
        ctx(table(albums))
      );
      expect(evaluation.albums).toHaveLength(0);
    });
  });

  describe('witness copy', () => {
    it('format noneOf [CD] matches through the vinyl copy', () => {
      const cd = copy({ format: ['CD'], dateAddedMs: daysAgo(500).getTime() });
      const vinyl = copy({ format: ['Vinyl'] });
      const evaluation = evaluateCrate(
        crate([{ id: 'f', field: 'format', op: 'noneOf', values: ['CD'] }]),
        ctx(table([album([cd, vinyl])]))
      );
      expect(evaluation.albums).toHaveLength(1);
      expect(evaluation.albums[0].witnessReleaseId).toBe(vinyl.releaseId);
      expect(evaluation.albums[0].results[0].evidence.releaseId).toBe(
        vinyl.releaseId
      );
    });

    it('needs one copy to satisfy all copy-level rules together', () => {
      const vinyl = copy({ format: ['Vinyl'] });
      const cd = copy({ format: ['CD'] });
      const facts = {
        [vinyl.releaseId]: { runtime: runtime(50 * 60, 8, 8) },
        [cd.releaseId]: { runtime: runtime(35 * 60, 8, 8) },
      };
      const evaluation = evaluateCrate(
        crate([
          { id: 'f', field: 'format', op: 'anyOf', values: ['Vinyl'] },
          { id: 'r', field: 'runtime', op: 'atMost', minutes: 40 },
        ]),
        ctx(table([album([vinyl, cd])]), facts)
      );
      expect(evaluation.albums).toHaveLength(0);
      expect(evaluation.unknownOnly).toEqual([]);
    });

    it('picks the earliest-added, then lowest-ID, matching copy', () => {
      const t0 = daysAgo(100).getTime();
      const late = copy({ releaseId: 1, dateAddedMs: daysAgo(10).getTime() });
      const earlyHigh = copy({ releaseId: 9, dateAddedMs: t0 });
      const earlyLow = copy({ releaseId: 5, dateAddedMs: t0 });
      const evaluation = evaluateCrate(
        crate([{ id: 'f', field: 'format', op: 'anyOf', values: ['Vinyl'] }]),
        ctx(table([album([late, earlyHigh, earlyLow])]))
      );
      expect(evaluation.albums[0].witnessReleaseId).toBe(5);
    });

    it('one copy unknown and the other noMatch → album unknown, "might match"', () => {
      const vinyl = copy({ format: ['Vinyl'] }); // no facts → unknown
      const cd = copy({ format: ['CD'] });
      const facts = { [cd.releaseId]: { runtime: runtime(30 * 60, 8, 8) } };
      const evaluation = evaluateCrate(
        crate([
          { id: 'f', field: 'format', op: 'anyOf', values: ['Vinyl'] },
          { id: 'r', field: 'runtime', op: 'atMost', minutes: 40 },
        ]),
        ctx(table([album([vinyl, cd])]), facts)
      );
      expect(evaluation.albums).toHaveLength(0);
      expect(evaluation.unknownOnly).toHaveLength(1);
      expect(evaluation.unknownOnly[0].ruleId).toBe('r');
      expect(evaluation.unknownOnly[0].count).toBe(1);
      expect(evaluation.unknownOnly[0].sample[0].witnessReleaseId).toBe(
        vinyl.releaseId
      );
    });

    it('counts an album missing data for two rules once in the total', () => {
      const c = copy(); // no release details → genre and runtime unknown
      const evaluation = evaluateCrate(
        crate([
          { id: 'g', field: 'genre', op: 'anyOf', values: ['Jazz'] },
          { id: 'r', field: 'runtime', op: 'atMost', minutes: 40 },
        ]),
        ctx(table([album([c])]), { 999999: {} })
      );
      expect(evaluation.unknownOnly.map(u => [u.ruleId, u.count])).toEqual([
        ['g', 1],
        ['r', 1],
      ]);
      expect(evaluation.unknownOnlyAlbums).toBe(1);
    });

    it('ifUnknown include lets unknown copies through', () => {
      const c = copy();
      const evaluation = evaluateCrate(
        crate([
          {
            id: 'g',
            field: 'genre',
            op: 'anyOf',
            values: ['Jazz'],
            ifUnknown: 'include',
          },
        ]),
        ctx(table([album([c])]))
      );
      expect(evaluation.albums).toHaveLength(1);
      expect(evaluation.albums[0].results[0].outcome).toBe('unknown');
      expect(evaluation.unknownOnly).toEqual([]);
    });

    it('reports runtimeSeconds from a complete copy', () => {
      const c = copy();
      const evaluation = evaluateCrate(
        crate([{ id: 'f', field: 'format', op: 'anyOf', values: ['Vinyl'] }]),
        ctx(table([album([c])]), {
          [c.releaseId]: { runtime: runtime(2292, 9, 9) },
        })
      );
      expect(evaluation.albums[0].runtimeSeconds).toBe(2292);
    });
  });

  describe('unknownOnly', () => {
    it('counts per rule and samples at most 5', () => {
      const albums = Array.from({ length: 7 }, (_, i) =>
        album([copy({ artist: `Artist ${i}`, year: undefined })])
      );
      const evaluation = evaluateCrate(
        crate([
          { id: 'y', field: 'pressingYear', op: 'between', from: 1990 },
          { id: 'g', field: 'genre', op: 'anyOf', values: ['Jazz'] },
        ]),
        ctx(table(albums))
      );
      expect(evaluation.unknownOnly.map(u => [u.ruleId, u.count])).toEqual([
        ['y', 7],
        ['g', 7],
      ]);
      expect(evaluation.unknownOnly[0].sample).toHaveLength(5);
      expect(evaluation.unknownOnly[0].sample[0].artist).toBe('Artist 0');
    });

    it('does not count albums that also fail a rule', () => {
      const c = copy({ year: undefined, format: ['CD'] });
      const evaluation = evaluateCrate(
        crate([
          { id: 'y', field: 'pressingYear', op: 'between', from: 1990 },
          { id: 'f', field: 'format', op: 'anyOf', values: ['Vinyl'] },
        ]),
        ctx(table([album([c])]))
      );
      expect(evaluation.unknownOnly).toEqual([]);
    });
  });

  describe('overrides and precedence', () => {
    const formatVinyl: CrateRule = {
      id: 'f',
      field: 'format',
      op: 'anyOf',
      values: ['Vinyl'],
    };

    it('exclude > include > rules', () => {
      const a = album([copy({ releaseId: 1, artist: 'A' })]);
      const b = album([copy({ releaseId: 2, artist: 'B', format: ['CD'] })]);
      const c = album([copy({ releaseId: 3, artist: 'C' })]);
      const evaluation = evaluateCrate(
        crate(
          [formatVinyl],
          [
            override('include', [1], 10),
            override('include', [2], 20),
            override('exclude', [3], 30),
            override('include', [3], 40),
          ]
        ),
        ctx(table([a, b, c]))
      );
      expect(
        evaluation.albums.map(r => [r.artist, r.membership, r.overrideAt])
      ).toEqual([
        ['A', 'includedAndRules', 10],
        ['B', 'included', 20],
      ]);
      expect(evaluation.excluded.map(r => [r.artist, r.membership])).toEqual([
        ['C', 'excluded'],
      ]);
      expect(evaluation.excluded[0].overrideAt).toBe(30);
    });

    it('a merged group with include + exclude is excluded', () => {
      const merged = album([
        copy({ releaseId: 101 }),
        copy({ releaseId: 102 }),
      ]);
      const evaluation = evaluateCrate(
        crate(
          [formatVinyl],
          [override('include', [101]), override('exclude', [102])]
        ),
        ctx(table([merged]))
      );
      expect(evaluation.albums).toHaveLength(0);
      expect(evaluation.excluded).toHaveLength(1);
    });

    it('a split carries the override to both halves', () => {
      const a = album([copy({ releaseId: 101, artist: 'A', format: ['CD'] })]);
      const b = album([copy({ releaseId: 102, artist: 'B', format: ['CD'] })]);
      const evaluation = evaluateCrate(
        crate([formatVinyl], [override('include', [101, 102])]),
        ctx(table([a, b]))
      );
      expect(evaluation.albums.map(r => r.membership)).toEqual([
        'included',
        'included',
      ]);
    });

    it('include-only members use the display copy as witness', () => {
      const first = copy({
        releaseId: 7,
        format: ['CD'],
        dateAddedMs: daysAgo(500).getTime(),
      });
      const second = copy({ releaseId: 3, format: ['CD'] });
      const evaluation = evaluateCrate(
        crate([formatVinyl], [override('include', [3])]),
        ctx(table([album([first, second])]))
      );
      expect(evaluation.albums[0].witnessReleaseId).toBe(7);
    });

    it('stale overrides are reported only on a complete snapshot and add nothing', () => {
      const a = album([copy({ releaseId: 1, format: ['CD'] })]);
      const stale = override('include', [999]);
      const complete = evaluateCrate(
        crate([formatVinyl], [stale]),
        ctx(table([a]))
      );
      expect(complete.staleOverrides).toEqual([stale]);
      expect(complete.albums).toHaveLength(0);

      const incomplete = evaluateCrate(
        crate([formatVinyl], [stale]),
        ctx(
          table([a], {
            collection: { complete: false, pagesRead: 1, pagesExpected: 3 },
          })
        )
      );
      expect(incomplete.staleOverrides).toEqual([]);
      expect(incomplete.coverage.collection.complete).toBe(false);
    });

    it('a re-acquired release ID makes the override apply again', () => {
      const back = album([copy({ releaseId: 999, format: ['CD'] })]);
      const evaluation = evaluateCrate(
        crate([formatVinyl], [override('include', [999])]),
        ctx(table([back]))
      );
      expect(evaluation.staleOverrides).toEqual([]);
      expect(evaluation.albums[0].membership).toBe('included');
    });

    it('an override touching one present ID is not stale', () => {
      const a = album([copy({ releaseId: 1 })]);
      const evaluation = evaluateCrate(
        crate([], [override('include', [1, 999])]),
        ctx(table([a]))
      );
      expect(evaluation.staleOverrides).toEqual([]);
    });

    it('a zero-rule crate holds only included albums', () => {
      const a = album([copy({ releaseId: 1, artist: 'A' })]);
      const b = album([copy({ releaseId: 2, artist: 'B' })]);
      const c = album([copy({ releaseId: 3, artist: 'C' })]);
      const evaluation = evaluateCrate(
        crate([], [override('include', [2]), override('exclude', [3])]),
        ctx(table([a, b, c]))
      );
      expect(evaluation.albums.map(r => [r.artist, r.membership])).toEqual([
        ['B', 'included'],
      ]);
      expect(evaluation.albums[0].results).toEqual([]);
      expect(evaluation.excluded.map(r => r.artist)).toEqual(['C']);
      expect(evaluation.unknownOnly).toEqual([]);
    });
  });

  it('without a history index listening rules are unknown and collection rules still work', () => {
    const vinyl = album([copy({ artist: 'V' })]);
    const cd = album([copy({ artist: 'C', format: ['CD'] })]);
    const t = table([vinyl, cd], {
      hasHistory: false,
      historyFrom: null,
      newestScrobbleAt: null,
      lastSyncCompletedAt: null,
    });

    const collectionOnly = evaluateCrate(
      crate([{ id: 'f', field: 'format', op: 'anyOf', values: ['Vinyl'] }]),
      ctx(t)
    );
    expect(collectionOnly.albums.map(a => a.artist)).toEqual(['V']);

    const withListening = evaluateCrate(
      crate([
        { id: 'f', field: 'format', op: 'anyOf', values: ['Vinyl'] },
        { id: 's', field: 'playsSinceAdded', op: 'none' },
      ]),
      ctx(t)
    );
    expect(withListening.albums).toEqual([]);
    expect(withListening.unknownOnly).toEqual([
      expect.objectContaining({ ruleId: 's', count: 1 }),
    ]);
    expect(withListening.coverage.hasHistory).toBe(false);
  });

  describe('sorting', () => {
    const mk = (
      artist: string,
      title: string,
      opts: {
        plays?: number[];
        added?: number;
        runtimeSec?: number;
      } = {}
    ) => {
      const c = copy({
        artist,
        title,
        dateAddedMs: opts.added ?? daysAgo(400).getTime(),
      });
      return {
        album: album([c], { playTimestamps: opts.plays ?? [] }),
        c,
        rt: opts.runtimeSec,
      };
    };
    const order = (sort: CrateSort, items: ReturnType<typeof mk>[]) => {
      const facts: Record<number, CrateReleaseFacts> = {};
      for (const i of items) {
        if (i.rt !== undefined)
          facts[i.c.releaseId] = { runtime: runtime(i.rt, 5, 5) };
      }
      return evaluateCrate(
        crate([{ id: 'x', field: 'discardPile', op: 'exclude' }], [], sort),
        ctx(table(items.map(i => i.album)), facts)
      ).albums.map(a => `${a.artist}/${a.album}`);
    };

    it('artist, then album, case-insensitively', () => {
      expect(
        order('artist', [mk('beta', 'Z'), mk('Alpha', 'b'), mk('alpha', 'A')])
      ).toEqual(['alpha/A', 'Alpha/b', 'beta/Z']);
    });

    it('lastPlayedAsc puts albums with none recorded first', () => {
      expect(
        order('lastPlayedAsc', [
          mk('A', '1', { plays: [sec(daysAgo(1))] }),
          mk('B', '1', { plays: [sec(daysAgo(100))] }),
          mk('C', '1'),
        ])
      ).toEqual(['C/1', 'B/1', 'A/1']);
    });

    it('scrobblesDesc / scrobblesAsc, ties by artist', () => {
      const items = () => [
        mk('B', '1', { plays: [1, 2] }),
        mk('A', '1', { plays: [1, 2] }),
        mk('C', '1', { plays: [1, 2, 3] }),
      ];
      expect(order('scrobblesDesc', items())).toEqual(['C/1', 'A/1', 'B/1']);
      expect(order('scrobblesAsc', items())).toEqual(['A/1', 'B/1', 'C/1']);
    });

    it('dateAddedDesc uses the latest copy', () => {
      const old = copy({ artist: 'Old', dateAddedMs: daysAgo(900).getTime() });
      const newer = copy({ artist: 'Old', dateAddedMs: daysAgo(5).getTime() });
      const two = album([old, newer]);
      const mid = album([
        copy({ artist: 'Mid', dateAddedMs: daysAgo(50).getTime() }),
      ]);
      const evaluation = evaluateCrate(
        crate(
          [],
          [override('include', [old.releaseId, mid.copies[0].releaseId])],
          'dateAddedDesc'
        ),
        ctx(table([mid, two]))
      );
      expect(evaluation.albums.map(a => a.artist)).toEqual(['Old', 'Mid']);
    });

    it('album sorts by title, then artist', () => {
      expect(
        order('album', [mk('A', 'Zed'), mk('C', 'beta'), mk('B', 'Beta')])
      ).toEqual(['B/Beta', 'C/beta', 'A/Zed']);
    });

    it('lastPlayedDesc puts the newest first and none recorded last', () => {
      expect(
        order('lastPlayedDesc', [
          mk('C', '1'),
          mk('B', '1', { plays: [sec(daysAgo(100))] }),
          mk('A', '1', { plays: [sec(daysAgo(1))] }),
        ])
      ).toEqual(['A/1', 'B/1', 'C/1']);
    });

    it('dateAddedAsc uses the earliest copy', () => {
      expect(
        order('dateAddedAsc', [
          mk('A', '1', { added: daysAgo(10).getTime() }),
          mk('B', '1', { added: daysAgo(500).getTime() }),
        ])
      ).toEqual(['B/1', 'A/1']);
    });

    it('pressing year either way, unknown year last', () => {
      const items = () => {
        const list = [mk('A', '1'), mk('B', '1'), mk('C', '1')];
        list[0].c.year = 1999;
        list[1].c.year = 1972;
        list[2].c.year = undefined;
        return list;
      };
      expect(order('yearAsc', items())).toEqual(['B/1', 'A/1', 'C/1']);
      expect(order('yearDesc', items())).toEqual(['A/1', 'B/1', 'C/1']);
    });

    it('runtimeDesc puts the longest first and unknown last', () => {
      expect(
        order('runtimeDesc', [
          mk('A', '1'),
          mk('B', '1', { runtimeSec: 1200 }),
          mk('C', '1', { runtimeSec: 3000 }),
        ])
      ).toEqual(['C/1', 'B/1', 'A/1']);
      expect(crateNeedsFacts([], 'runtimeDesc')).toBe(true);
    });

    it('runtimeAsc puts unknown runtime last', () => {
      expect(
        order('runtimeAsc', [
          mk('A', '1'),
          mk('B', '1', { runtimeSec: 3000 }),
          mk('C', '1', { runtimeSec: 1200 }),
        ])
      ).toEqual(['C/1', 'B/1', 'A/1']);
    });
  });

  it('reports coverage counts', () => {
    const rated = copy({ rating: 4 });
    const timed = copy();
    const genreOnly = copy();
    const evaluation = evaluateCrate(
      crate([]),
      ctx(table([album([rated]), album([timed]), album([genreOnly])]), {
        [timed.releaseId]: { genres: ['Rock'], runtime: runtime(100, 1, 1) },
        [genreOnly.releaseId]: { genres: [], runtime: runtime(100, 2, 1) },
      })
    );
    expect(evaluation.coverage).toMatchObject({
      totalAlbums: 3,
      totalReleases: 3,
      runtimeKnownAlbums: 1,
      genreKnownAlbums: 2,
      ratedAlbums: 1,
      hasHistory: true,
    });
    expect(evaluation.crateId).toBe('crate-1');
    expect(evaluation.evaluatedAt).toBe(NOW.getTime());
  });

  it('leaves genre and runtime coverage unset when release details were not loaded', () => {
    const evaluation = evaluateCrate(
      crate([]),
      ctx(table([album([copy()])]), {})
    );
    expect(evaluation.coverage.runtimeKnownAlbums).toBeNull();
    expect(evaluation.coverage.genreKnownAlbums).toBeNull();
  });

  it('crateNeedsFacts only for genre, style and runtime rules', () => {
    expect(crateNeedsFacts(CRATE_TEMPLATES[0].rules)).toBe(false);
    expect(crateNeedsFacts(CRATE_TEMPLATES[2].rules)).toBe(true);
    expect(
      crateNeedsFacts([{ id: 's', field: 'style', op: 'anyOf', values: ['x'] }])
    ).toBe(true);
  });

  describe('validateCrateRules', () => {
    it('accepts every template', () => {
      for (const template of CRATE_TEMPLATES) {
        expect(validateCrateRules(template.rules)).toEqual([]);
      }
    });

    it('accepts every field/op combination with valid values', () => {
      const rules: CrateRule[] = [
        { id: '1', field: 'format', op: 'noneOf', values: ['CD'] },
        { id: '2', field: 'artist', op: 'anyOf', values: ['X'] },
        {
          id: '3',
          field: 'style',
          op: 'anyOf',
          values: ['Dub'],
          ifUnknown: 'include',
        },
        { id: '4', field: 'pressingYear', op: 'between', from: 1970, to: 1979 },
        { id: '5', field: 'dateAdded', op: 'olderThanDays', days: 36500 },
        { id: '6', field: 'dateAdded', op: 'between', from: '2024-02-29' },
        { id: '7', field: 'rating', op: 'atLeast', value: 5 },
        { id: '8', field: 'rating', op: 'isUnrated' },
        {
          id: '9',
          field: 'runtime',
          op: 'between',
          minMinutes: 1,
          maxMinutes: 1000,
        },
        { id: '10', field: 'discardPile', op: 'only' },
        { id: '11', field: 'scrobbleCount', op: 'atMost', value: 0 },
        {
          id: '12',
          field: 'scrobblesInPeriod',
          period: { kind: 'since', date: '2020-01-01' },
          op: 'atLeast',
          value: 3,
        },
        {
          id: '13',
          field: 'scrobblesInPeriod',
          period: { kind: 'lastDays', days: 30 },
          op: 'none',
        },
        { id: '14', field: 'lastRecordedPlay', op: 'withinDays', days: 1 },
        { id: '15', field: 'playsSinceAdded', op: 'atLeast', value: 1 },
      ];
      expect(validateCrateRules(rules)).toEqual([]);
    });

    it.each([
      ['not an array', { id: 'x' }],
      [
        'unknown field',
        [{ id: 'a', field: 'mood', op: 'anyOf', values: ['x'] }],
      ],
      [
        'unknown op',
        [{ id: 'a', field: 'artist', op: 'noneOf', values: ['x'] }],
      ],
      ['empty values', [{ id: 'a', field: 'genre', op: 'anyOf', values: [] }]],
      ['days 0', [{ id: 'a', field: 'dateAdded', op: 'withinDays', days: 0 }]],
      [
        'days too large',
        [{ id: 'a', field: 'lastRecordedPlay', op: 'withinDays', days: 36501 }],
      ],
      [
        'percent 0',
        [{ id: 'a', field: 'scrobbleCount', op: 'topPercent', percent: 0 }],
      ],
      [
        'percent 101',
        [{ id: 'a', field: 'scrobbleCount', op: 'topPercent', percent: 101 }],
      ],
      [
        'minutes 1001',
        [{ id: 'a', field: 'runtime', op: 'atMost', minutes: 1001 }],
      ],
      ['rating 6', [{ id: 'a', field: 'rating', op: 'atLeast', value: 6 }]],
      [
        'bad ISO date',
        [{ id: 'a', field: 'dateAdded', op: 'between', from: '2024-02-30' }],
      ],
      [
        'bad period date',
        [
          {
            id: 'a',
            field: 'scrobblesInPeriod',
            op: 'none',
            period: { kind: 'since', date: 'yesterday' },
          },
        ],
      ],
      [
        'bad period kind',
        [
          {
            id: 'a',
            field: 'scrobblesInPeriod',
            op: 'none',
            period: { kind: 'decade' },
          },
        ],
      ],
      [
        'missing includeNoRecordedPlays',
        [{ id: 'a', field: 'lastRecordedPlay', op: 'olderThanDays', days: 5 }],
      ],
      [
        'duplicate ids',
        [
          { id: 'a', field: 'discardPile', op: 'only' },
          { id: 'a', field: 'discardPile', op: 'exclude' },
        ],
      ],
      ['missing id', [{ field: 'discardPile', op: 'only' }]],
      [
        'bad ifUnknown',
        [
          {
            id: 'a',
            field: 'genre',
            op: 'anyOf',
            values: ['x'],
            ifUnknown: 'maybe',
          },
        ],
      ],
      [
        'too many rules',
        Array.from({ length: 21 }, (_, i) => ({
          id: `r${i}`,
          field: 'discardPile',
          op: 'exclude',
        })),
      ],
    ])('rejects %s', (_label, rules) => {
      expect(validateCrateRules(rules).length).toBeGreaterThan(0);
    });
  });

  describe('regressions', () => {
    it('crateNeedsFacts is true for a runtime sort', () => {
      expect(crateNeedsFacts([], 'runtimeAsc')).toBe(true);
      expect(crateNeedsFacts([], 'artist')).toBe(false);
    });

    it('rejects prototype property names as fields without throwing', () => {
      for (const field of ['toString', 'constructor', '__proto__']) {
        expect(
          validateCrateRules([{ id: 'x', field, op: 'anyOf', values: ['a'] }])
        ).toEqual(['rules[0]: unknown field']);
      }
    });

    it('dateAddedDesc and playsSinceAdded use the table latestAddedMs', () => {
      const c = copy({ artist: 'Dup', dateAddedMs: daysAgo(900).getTime() });
      const dup = album(
        [c],
        { playTimestamps: [sec(daysAgo(100))] },
        {
          latestAddedMs: daysAgo(10).getTime(),
        }
      );
      const mid = album([
        copy({ artist: 'Mid', dateAddedMs: daysAgo(50).getTime() }),
      ]);
      const t = table([mid, dup]);
      const sorted = evaluateCrate(
        crate(
          [{ id: 'x', field: 'discardPile', op: 'exclude' }],
          [],
          'dateAddedDesc'
        ),
        ctx(t)
      );
      expect(sorted.albums.map(a => a.artist)).toEqual(['Dup', 'Mid']);

      const since = evaluateRule(
        { id: 'n', field: 'playsSinceAdded', op: 'none' },
        dup,
        c,
        ctx(t)
      );
      expect(since.outcome).toBe('match');
      expect(since.evidence.dateAdded).toBe(daysAgo(10).toISOString());
    });
  });
});
