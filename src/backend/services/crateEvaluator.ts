/**
 * Smart Crates rule evaluation. Pure: everything comes from the album table
 * and the evaluation context, so every edge case is testable with fixtures.
 * See .plan/smart-crates-plan.md sections 4, 6 and 9.
 */

import {
  CRATE_COPY_FIELDS,
  CRATE_MAX_RULES,
} from '../../shared/crateTemplates';
import {
  CrateAlbumResult,
  CrateEvaluation,
  CrateOverride,
  CratePeriod,
  CrateRule,
  CrateRuleOutcome,
  CrateRuleResult,
  CrateSort,
} from '../../shared/types';
import { stripDiscogsSuffix } from '../../shared/utils/albumMapping';

import {
  CrateEvalContext,
  CrateTableAlbum,
  CrateTableCopy,
} from './crateTableTypes';

const DAY_MS = 24 * 60 * 60 * 1000;
const UNKNOWN_SAMPLE_SIZE = 5;

export interface CrateEvalInput {
  id: string | null;
  rules: CrateRule[];
  overrides: CrateOverride[];
  sort: CrateSort;
}

/**
 * Whether evaluation needs release facts: a genre, style or runtime rule, or
 * a runtime sort (which shows nothing useful without runtimes)
 */
export function crateNeedsFacts(rules: CrateRule[], sort?: CrateSort): boolean {
  if (sort === 'runtimeAsc' || sort === 'runtimeDesc') return true;
  return rules.some(
    rule =>
      rule.field === 'genre' ||
      rule.field === 'style' ||
      rule.field === 'runtime'
  );
}

export function isCopyRule(rule: CrateRule): boolean {
  return CRATE_COPY_FIELDS.has(rule.field);
}

/** An unknown result keeps the album out unless the rule says otherwise */
function passes(rule: CrateRule, result: CrateRuleResult): boolean {
  if (result.outcome === 'match') return true;
  if (result.outcome === 'noMatch') return false;
  return 'ifUnknown' in rule && rule.ifUnknown === 'include';
}

/** AND of rule results with three-valued logic (plan section 4.2) */
function combine(
  rules: CrateRule[],
  results: CrateRuleResult[]
): CrateRuleOutcome {
  if (results.some(r => r.outcome === 'noMatch')) return 'noMatch';
  return results.every((r, i) => passes(rules[i], r)) ? 'match' : 'unknown';
}

const lower = (values: string[]) => values.map(v => v.toLowerCase().trim());

/** Local yyyy-mm-dd of a timestamp */
function localIsoDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight of an ISO yyyy-mm-dd date, in ms */
function localMidnight(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

/** Start of a listening period, in seconds */
export function periodStart(period: CratePeriod, now: Date): number {
  switch (period.kind) {
    case 'calendarYear':
      // Same as StatsService.getStartOfYear: Jan 1, server-local time
      return new Date(now.getFullYear(), 0, 1).getTime() / 1000;
    case 'lastDays':
      return (now.getTime() - period.days * DAY_MS) / 1000;
    case 'since':
      return localMidnight(period.date) / 1000;
  }
}

/** Number of sorted timestamps strictly after `after` (or at/after) */
function countFrom(sorted: number[], from: number, inclusive: boolean): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (inclusive ? sorted[mid] < from : sorted[mid] <= from) lo = mid + 1;
    else hi = mid;
  }
  return sorted.length - lo;
}

/** Artist comparison key: alias-resolved, Discogs suffix aware, lowercase */
function artistKey(name: string, resolveArtist: (n: string) => string) {
  const resolved = resolveArtist(name);
  const plain = stripDiscogsSuffix(name);
  const key =
    plain !== name && resolved.toLowerCase() === name.toLowerCase()
      ? resolveArtist(plain)
      : resolved;
  return key.toLowerCase().trim();
}

function result(
  rule: CrateRule,
  outcome: CrateRuleOutcome,
  evidence: CrateRuleResult['evidence'] = {}
): CrateRuleResult {
  return { ruleId: rule.id, outcome, evidence };
}

/**
 * Evaluate one rule. Copy-level rules (CRATE_COPY_FIELDS) judge `copy`;
 * listening rules judge the album as a whole and ignore it.
 */
export function evaluateRule(
  rule: CrateRule,
  album: CrateTableAlbum,
  copy: CrateTableCopy,
  ctx: CrateEvalContext
): CrateRuleResult {
  const { table, now } = ctx;
  const releaseId = copy.releaseId;
  const nowMs = now.getTime();

  switch (rule.field) {
    case 'format': {
      const formats = lower(copy.format);
      const hit = lower(rule.values).some(v => formats.includes(v));
      const ok = rule.op === 'anyOf' ? hit : !hit;
      return result(rule, ok ? 'match' : 'noMatch', {
        releaseId,
        value: copy.format,
      });
    }

    case 'artist': {
      const own = copy.resolvedArtist.toLowerCase().trim();
      const ok = rule.values.some(v => artistKey(v, ctx.resolveArtist) === own);
      return result(rule, ok ? 'match' : 'noMatch', {
        releaseId,
        value: copy.artist,
      });
    }

    case 'genre':
    case 'style': {
      const facts = ctx.facts.get(releaseId);
      const values = rule.field === 'genre' ? facts?.genres : facts?.styles;
      if (!values) return result(rule, 'unknown', { releaseId });
      const have = lower(values);
      const hit = lower(rule.values).some(v => have.includes(v));
      const ok = rule.op === 'anyOf' ? hit : !hit;
      return result(rule, ok ? 'match' : 'noMatch', {
        releaseId,
        value: values,
      });
    }

    case 'pressingYear': {
      if (copy.year === undefined)
        return result(rule, 'unknown', { releaseId });
      const ok =
        (rule.from === undefined || copy.year >= rule.from) &&
        (rule.to === undefined || copy.year <= rule.to);
      return result(rule, ok ? 'match' : 'noMatch', {
        releaseId,
        value: copy.year,
      });
    }

    case 'dateAdded': {
      let ok: boolean;
      if (rule.op === 'between') {
        const day = localIsoDate(copy.dateAddedMs);
        ok =
          (rule.from === undefined || day >= rule.from) &&
          (rule.to === undefined || day <= rule.to);
      } else {
        const cutoff = nowMs - rule.days * DAY_MS;
        ok =
          rule.op === 'withinDays'
            ? copy.dateAddedMs >= cutoff
            : copy.dateAddedMs < cutoff;
      }
      return result(rule, ok ? 'match' : 'noMatch', {
        releaseId,
        dateAdded: copy.dateAdded,
      });
    }

    case 'rating': {
      if (rule.op === 'isUnrated') {
        return result(rule, copy.rating === undefined ? 'match' : 'noMatch', {
          releaseId,
          value: copy.rating ?? 0,
        });
      }
      if (copy.rating === undefined)
        return result(rule, 'unknown', { releaseId });
      return result(rule, copy.rating >= rule.value ? 'match' : 'noMatch', {
        releaseId,
        value: copy.rating,
      });
    }

    case 'runtime': {
      const runtime = ctx.facts.get(releaseId)?.runtime;
      if (!runtime) return result(rule, 'unknown', { releaseId });
      const evidence = {
        releaseId,
        knownSeconds: runtime.knownSeconds,
        tracksWithDuration: runtime.tracksWithDuration,
        trackCount: runtime.trackCount,
      };
      const known = runtime.knownSeconds;
      const min =
        rule.op === 'atLeast'
          ? rule.minutes * 60
          : rule.op === 'between'
            ? rule.minMinutes * 60
            : undefined;
      const max =
        rule.op === 'atMost'
          ? rule.minutes * 60
          : rule.op === 'between'
            ? rule.maxMinutes * 60
            : undefined;
      if (runtime.complete) {
        const ok =
          (min === undefined || known >= min) &&
          (max === undefined || known <= max);
        return result(rule, ok ? 'match' : 'noMatch', evidence);
      }
      // Partial durations: missing tracks can only add time
      if (max !== undefined && known > max) {
        return result(rule, 'noMatch', evidence);
      }
      if (max === undefined && min !== undefined && known >= min) {
        return result(rule, 'match', evidence);
      }
      return result(rule, 'unknown', evidence);
    }

    case 'discardPile': {
      const ok = rule.op === 'only' ? copy.inDiscardPile : !copy.inDiscardPile;
      return result(rule, ok ? 'match' : 'noMatch', { releaseId });
    }
  }

  // Listening rules: the album as a whole
  if (!table.hasHistory) return result(rule, 'unknown');
  const listening = album.listening;
  const scrobbles = listening.scrobbleCount;
  const lastPlayed = listening.lastPlayed;
  const historyFrom = table.historyFrom;
  const predates = (startSeconds: number) =>
    historyFrom !== null && startSeconds < historyFrom ? { historyFrom } : {};

  switch (rule.field) {
    case 'scrobbleCount': {
      if (rule.op === 'topPercent') {
        const cutoff = Math.ceil((table.totalAlbums * rule.percent) / 100);
        const rank = album.scrobbleRank;
        const ok = rank !== undefined && rank <= cutoff;
        return result(rule, ok ? 'match' : 'noMatch', {
          scrobbles,
          rank,
          rankOf: table.rankedAlbumCount,
        });
      }
      const ok =
        rule.op === 'atLeast'
          ? scrobbles >= rule.value
          : scrobbles <= rule.value;
      return result(rule, ok ? 'match' : 'noMatch', { scrobbles });
    }

    case 'scrobblesInPeriod': {
      const start = periodStart(rule.period, now);
      const count = countFrom(listening.playTimestamps, start, true);
      const ok =
        rule.op === 'none'
          ? count === 0
          : rule.op === 'atLeast'
            ? count >= rule.value
            : count <= rule.value;
      return result(rule, ok ? 'match' : 'noMatch', {
        scrobbles: count,
        lastPlayed,
        ...predates(start),
      });
    }

    case 'lastRecordedPlay': {
      const cutoff = (nowMs - rule.days * DAY_MS) / 1000;
      let ok: boolean;
      if (lastPlayed === null) {
        ok = rule.op === 'olderThanDays' && rule.includeNoRecordedPlays;
      } else {
        ok =
          rule.op === 'olderThanDays'
            ? lastPlayed < cutoff
            : lastPlayed >= cutoff;
      }
      return result(rule, ok ? 'match' : 'noMatch', {
        lastPlayed,
        scrobbles,
        ...predates(cutoff),
      });
    }

    case 'playsSinceAdded': {
      // Since the newest copy was added to Discogs
      const addedSeconds = album.latestAddedMs / 1000;
      const since = countFrom(listening.playTimestamps, addedSeconds, false);
      const before = listening.playTimestamps.length - since;
      const ok = rule.op === 'none' ? since === 0 : since >= rule.value;
      return result(rule, ok ? 'match' : 'noMatch', {
        scrobbles: since,
        playsBeforeAdded: before,
        lastPlayed,
        dateAdded: new Date(album.latestAddedMs).toISOString(),
      });
    }
  }

  return result(rule, 'unknown');
}

interface AlbumRuleEvaluation {
  outcome: CrateRuleOutcome;
  witness: CrateTableCopy;
  results: CrateRuleResult[];
}

/**
 * Evaluate all rules on an album. Copy-level rules must hold together on one
 * copy, the witness (plan section 4.3): the earliest-added (then lowest ID)
 * matching copy, or, failing that, the earliest unknown copy. Listening
 * rules are evaluated once for the album and ANDed in.
 */
export function evaluateAlbumRules(
  rules: CrateRule[],
  album: CrateTableAlbum,
  ctx: CrateEvalContext
): AlbumRuleEvaluation {
  const copyRules = rules.filter(isCopyRule);
  const albumRules = rules.filter(rule => !isCopyRule(rule));
  const first = album.copies[0];

  let witness = first;
  let copyResults: CrateRuleResult[] = [];
  let copyOutcome: CrateRuleOutcome = 'match';
  if (copyRules.length > 0) {
    let unknownCopy: {
      copy: CrateTableCopy;
      results: CrateRuleResult[];
    } | null = null;
    let firstResults: CrateRuleResult[] | null = null;
    copyOutcome = 'noMatch';
    // Copies are sorted by dateAdded, then release ID
    for (const copy of album.copies) {
      const results = copyRules.map(rule =>
        evaluateRule(rule, album, copy, ctx)
      );
      firstResults ??= results;
      const outcome = combine(copyRules, results);
      if (outcome === 'match') {
        witness = copy;
        copyResults = results;
        copyOutcome = 'match';
        break;
      }
      if (outcome === 'unknown' && !unknownCopy) {
        unknownCopy = { copy, results };
      }
    }
    if (copyOutcome !== 'match') {
      if (unknownCopy) {
        witness = unknownCopy.copy;
        copyResults = unknownCopy.results;
        copyOutcome = 'unknown';
      } else {
        copyResults = firstResults ?? [];
      }
    }
  }

  const albumResults = albumRules.map(rule =>
    evaluateRule(rule, album, witness, ctx)
  );

  let outcome: CrateRuleOutcome;
  if (
    copyOutcome === 'noMatch' ||
    albumResults.some(r => r.outcome === 'noMatch')
  ) {
    outcome = 'noMatch';
  } else if (
    copyOutcome === 'unknown' ||
    !albumResults.every((r, i) => passes(albumRules[i], r))
  ) {
    outcome = 'unknown';
  } else {
    outcome = 'match';
  }

  // Report results in the crate's rule order
  const byId = new Map(
    [...copyResults, ...albumResults].map(r => [r.ruleId, r])
  );
  return {
    outcome,
    witness,
    results: rules.map(rule => byId.get(rule.id) ?? result(rule, 'unknown')),
  };
}

function runtimeSecondsOf(
  album: CrateTableAlbum,
  witness: CrateTableCopy,
  ctx: CrateEvalContext
): number | undefined {
  const complete = (copy: CrateTableCopy) => {
    const runtime = ctx.facts.get(copy.releaseId)?.runtime;
    return runtime?.complete ? runtime.knownSeconds : undefined;
  };
  const own = complete(witness);
  if (own !== undefined) return own;
  for (const copy of album.copies) {
    const seconds = complete(copy);
    if (seconds !== undefined) return seconds;
  }
  return undefined;
}

function toResult(
  album: CrateTableAlbum,
  witness: CrateTableCopy,
  membership: CrateAlbumResult['membership'],
  results: CrateRuleResult[],
  ctx: CrateEvalContext,
  overrideAt?: number
): CrateAlbumResult {
  const { listening } = album;
  const albumResult: CrateAlbumResult = {
    albumKey: album.albumKey,
    artist: album.artist,
    album: album.album,
    coverUrl: album.coverUrl,
    copies: album.copies.map(copy => ({
      releaseId: copy.releaseId,
      title: copy.title,
      artist: copy.artist,
      year: copy.year,
      format: copy.format,
      dateAdded: copy.dateAdded,
      copyCount: copy.copyCount,
      coverUrl: copy.coverUrl,
    })),
    witnessReleaseId: witness.releaseId,
    membership,
    listening: {
      scrobbleCount: listening.scrobbleCount,
      lastPlayed: listening.lastPlayed,
      matchType: listening.matchType,
      matchedKeys: listening.matchedKeys,
    },
    runtimeSeconds: runtimeSecondsOf(album, witness, ctx),
    results,
  };
  if (overrideAt !== undefined) albumResult.overrideAt = overrideAt;
  return albumResult;
}

const compareText = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: 'base' });

/** Sort comparator for a crate sort; ties go by artist, then album */
export function compareCrateAlbums(
  sort: CrateSort,
  /** Latest date added (ms), counting duplicate entries; from the table */
  latestAddedOf?: (album: CrateAlbumResult) => number | undefined
): (a: CrateAlbumResult, b: CrateAlbumResult) => number {
  const byName = (a: CrateAlbumResult, b: CrateAlbumResult) =>
    compareText(a.artist, b.artist) ||
    compareText(a.album, b.album) ||
    (a.albumKey < b.albumKey ? -1 : a.albumKey > b.albumKey ? 1 : 0);
  const latestAdded = (a: CrateAlbumResult) =>
    latestAddedOf?.(a) ??
    Math.max(...a.copies.map(c => Date.parse(c.dateAdded) || 0));
  const earliestAdded = (a: CrateAlbumResult) =>
    Math.min(...a.copies.map(c => Date.parse(c.dateAdded) || Infinity));
  /** Pressing year of the witness copy; undefined when Discogs has none */
  const pressingYear = (a: CrateAlbumResult) =>
    (a.copies.find(c => c.releaseId === a.witnessReleaseId) ?? a.copies[0])
      ?.year || undefined;
  /** Ascending order with missing values last, in either direction */
  const missingLast = (
    va: number | undefined | null,
    vb: number | undefined | null,
    descending: boolean
  ) => {
    const ma = va === undefined || va === null;
    const mb = vb === undefined || vb === null;
    if (ma || mb) return ma === mb ? 0 : ma ? 1 : -1;
    if (va === vb) return 0;
    return (va < vb ? -1 : 1) * (descending ? -1 : 1);
  };

  const primary = (a: CrateAlbumResult, b: CrateAlbumResult): number => {
    switch (sort) {
      case 'artist':
        return 0;
      case 'album':
        return compareText(a.album, b.album);
      case 'lastPlayedDesc':
        // Newest scrobble first; none recorded last
        return missingLast(
          a.listening.lastPlayed,
          b.listening.lastPlayed,
          true
        );
      case 'lastPlayedAsc': {
        // No recorded scrobbles first
        const la = a.listening.lastPlayed ?? -Infinity;
        const lb = b.listening.lastPlayed ?? -Infinity;
        return la === lb ? 0 : la < lb ? -1 : 1;
      }
      case 'scrobblesDesc':
        return b.listening.scrobbleCount - a.listening.scrobbleCount;
      case 'scrobblesAsc':
        return a.listening.scrobbleCount - b.listening.scrobbleCount;
      case 'dateAddedDesc':
        return latestAdded(b) - latestAdded(a);
      case 'dateAddedAsc':
        return earliestAdded(a) - earliestAdded(b);
      case 'yearAsc':
        return missingLast(pressingYear(a), pressingYear(b), false);
      case 'yearDesc':
        return missingLast(pressingYear(a), pressingYear(b), true);
      case 'runtimeDesc':
        return missingLast(a.runtimeSeconds, b.runtimeSeconds, true);
      case 'runtimeAsc': {
        // Unknown runtime last
        const ra = a.runtimeSeconds ?? Infinity;
        const rb = b.runtimeSeconds ?? Infinity;
        return ra === rb ? 0 : ra < rb ? -1 : 1;
      }
    }
    return 0;
  };
  return (a, b) => primary(a, b) || byName(a, b);
}

/**
 * Evaluate a crate against the album table. Precedence (plan section 6):
 * manual exclude > manual include > rules. Overrides apply to every current
 * album containing one of their release IDs. A crate with no rules is
 * manual-only.
 */
export function evaluateCrate(
  crate: CrateEvalInput,
  ctx: CrateEvalContext
): CrateEvaluation {
  const { table } = ctx;
  const rules = crate.rules;

  // Overrides by release ID
  const albumByRelease = new Map<number, CrateTableAlbum>();
  for (const album of table.albums) {
    for (const copy of album.copies) albumByRelease.set(copy.releaseId, album);
  }
  const includedAt = new Map<CrateTableAlbum, number>();
  const excludedAt = new Map<CrateTableAlbum, number>();
  const staleOverrides: CrateOverride[] = [];
  for (const override of crate.overrides) {
    const target = override.action === 'include' ? includedAt : excludedAt;
    let found = false;
    for (const id of override.releaseIds) {
      const album = albumByRelease.get(id);
      if (!album) continue;
      found = true;
      target.set(album, Math.max(target.get(album) ?? 0, override.createdAt));
    }
    // Absence proves nothing while the collection cache is incomplete
    if (!found && table.collection.complete) staleOverrides.push(override);
  }

  const albums: CrateAlbumResult[] = [];
  const excluded: CrateAlbumResult[] = [];
  const unknownByRule = new Map<string, CrateAlbumResult[]>();
  /** Albums kept out only by missing data, each counted once */
  let unknownOnlyAlbums = 0;

  for (const album of table.albums) {
    const evaluation =
      rules.length > 0 ? evaluateAlbumRules(rules, album, ctx) : null;
    const matchesRules = evaluation?.outcome === 'match';
    const display = album.copies[0];

    if (excludedAt.has(album)) {
      excluded.push(
        toResult(
          album,
          evaluation?.witness ?? display,
          'excluded',
          evaluation?.results ?? [],
          ctx,
          excludedAt.get(album)
        )
      );
      continue;
    }

    if (includedAt.has(album)) {
      albums.push(
        toResult(
          album,
          evaluation && matchesRules ? evaluation.witness : display,
          matchesRules ? 'includedAndRules' : 'included',
          evaluation?.results ?? [],
          ctx,
          includedAt.get(album)
        )
      );
      continue;
    }

    if (!evaluation) continue;
    if (matchesRules) {
      albums.push(
        toResult(album, evaluation.witness, 'rules', evaluation.results, ctx)
      );
    } else if (evaluation.outcome === 'unknown') {
      // Kept out only by missing data
      const albumResult = toResult(
        album,
        evaluation.witness,
        'rules',
        evaluation.results,
        ctx
      );
      unknownOnlyAlbums++;
      evaluation.results.forEach((r, i) => {
        if (r.outcome !== 'unknown' || passes(rules[i], r)) return;
        const list = unknownByRule.get(r.ruleId) ?? [];
        list.push(albumResult);
        unknownByRule.set(r.ruleId, list);
      });
    }
  }

  const latestAddedMs = new Map(
    table.albums.map(album => [album.albumKey, album.latestAddedMs])
  );
  const compare = compareCrateAlbums(crate.sort, album =>
    latestAddedMs.get(album.albumKey)
  );
  albums.sort(compare);
  excluded.sort(compare);
  const unknownOnly = rules
    .filter(rule => unknownByRule.has(rule.id))
    .map(rule => {
      const list = (unknownByRule.get(rule.id) ?? []).sort(compare);
      return {
        ruleId: rule.id,
        count: list.length,
        sample: list.slice(0, UNKNOWN_SAMPLE_SIZE),
      };
    });

  // Coverage over every owned album
  const factsLoaded = ctx.facts.size > 0;
  let runtimeKnownAlbums = 0;
  let genreKnownAlbums = 0;
  let ratedAlbums = 0;
  for (const album of table.albums) {
    const facts = album.copies.map(c => ctx.facts.get(c.releaseId));
    if (facts.some(f => f?.runtime?.complete)) runtimeKnownAlbums++;
    if (facts.some(f => f?.genres !== undefined)) genreKnownAlbums++;
    if (album.copies.some(c => c.rating !== undefined)) ratedAlbums++;
  }

  return {
    crateId: crate.id,
    evaluatedAt: ctx.now.getTime(),
    albums,
    excluded,
    unknownOnly,
    unknownOnlyAlbums,
    staleOverrides,
    coverage: {
      totalAlbums: table.totalAlbums,
      totalReleases: table.totalReleases,
      historyFrom: table.historyFrom,
      newestScrobbleAt: table.newestScrobbleAt,
      lastSyncCompletedAt: table.lastSyncCompletedAt,
      hasHistory: table.hasHistory,
      collection: table.collection,
      // Release details are loaded only for crates that need them
      runtimeKnownAlbums: factsLoaded ? runtimeKnownAlbums : null,
      genreKnownAlbums: factsLoaded ? genreKnownAlbums : null,
      ratedAlbums,
    },
  };
}

// ---- Validation (plan section 11.2) ----

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

const isInt = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= min &&
  value <= max;

const OPS: Record<string, readonly string[]> = {
  format: ['anyOf', 'noneOf'],
  artist: ['anyOf'],
  genre: ['anyOf', 'noneOf'],
  style: ['anyOf', 'noneOf'],
  pressingYear: ['between'],
  dateAdded: ['withinDays', 'olderThanDays', 'between'],
  rating: ['atLeast', 'isUnrated'],
  runtime: ['atMost', 'atLeast', 'between'],
  discardPile: ['exclude', 'only'],
  scrobbleCount: ['atLeast', 'atMost', 'topPercent'],
  scrobblesInPeriod: ['none', 'atLeast', 'atMost'],
  lastRecordedPlay: ['olderThanDays', 'withinDays'],
  playsSinceAdded: ['none', 'atLeast'],
};

const UNKNOWN_CAPABLE = new Set([
  'genre',
  'style',
  'pressingYear',
  'rating',
  'runtime',
]);

const MAX_COUNT = 1_000_000;

function validatePeriod(period: unknown, at: string, errors: string[]): void {
  if (!period || typeof period !== 'object') {
    errors.push(`${at}: period is required`);
    return;
  }
  const p = period as Record<string, unknown>;
  if (p.kind === 'calendarYear') return;
  if (p.kind === 'lastDays') {
    if (!isInt(p.days, 1, 36500)) {
      errors.push(`${at}: period days must be an integer from 1 to 36500`);
    }
    return;
  }
  if (p.kind === 'since') {
    if (!isIsoDate(p.date)) {
      errors.push(`${at}: period date must be an ISO date (yyyy-mm-dd)`);
    }
    return;
  }
  errors.push(`${at}: unknown period kind`);
}

/** Validate crate rules from a request; returns [] when they are valid */
export function validateCrateRules(rules: unknown): string[] {
  if (!Array.isArray(rules)) return ['rules must be an array'];
  const errors: string[] = [];
  if (rules.length > CRATE_MAX_RULES) {
    errors.push(`A crate can have at most ${CRATE_MAX_RULES} rules`);
  }

  const ids = new Set<string>();
  rules.forEach((raw: unknown, i) => {
    const at = `rules[${i}]`;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      errors.push(`${at}: must be an object`);
      return;
    }
    const rule = raw as Record<string, unknown>;
    if (typeof rule.id !== 'string' || !rule.id.trim()) {
      errors.push(`${at}: id is required`);
    } else if (ids.has(rule.id)) {
      errors.push(`${at}: duplicate rule id "${rule.id}"`);
    } else {
      ids.add(rule.id);
    }

    const field = rule.field;
    const op = rule.op;
    if (
      typeof field !== 'string' ||
      !Object.prototype.hasOwnProperty.call(OPS, field)
    ) {
      errors.push(`${at}: unknown field`);
      return;
    }
    if (typeof op !== 'string' || !OPS[field].includes(op)) {
      errors.push(`${at}: unknown operator for ${field}`);
      return;
    }

    if (rule.ifUnknown !== undefined) {
      if (
        !UNKNOWN_CAPABLE.has(field) ||
        (field === 'rating' && op !== 'atLeast')
      ) {
        errors.push(`${at}: ifUnknown is not supported for ${field} ${op}`);
      } else if (rule.ifUnknown !== 'exclude' && rule.ifUnknown !== 'include') {
        errors.push(`${at}: ifUnknown must be "exclude" or "include"`);
      }
    }

    const days = () => {
      if (!isInt(rule.days, 1, 36500)) {
        errors.push(`${at}: days must be an integer from 1 to 36500`);
      }
    };
    const count = (min: number) => {
      if (!isInt(rule.value, min, MAX_COUNT)) {
        errors.push(
          `${at}: value must be an integer from ${min} to ${MAX_COUNT}`
        );
      }
    };

    switch (field) {
      case 'format':
      case 'artist':
      case 'genre':
      case 'style': {
        const values = rule.values;
        if (
          !Array.isArray(values) ||
          values.length === 0 ||
          !values.every(v => typeof v === 'string' && v.trim().length > 0)
        ) {
          errors.push(`${at}: values must be a non-empty list of names`);
        }
        break;
      }
      case 'pressingYear': {
        const { from, to } = rule;
        if (from === undefined && to === undefined) {
          errors.push(`${at}: from or to is required`);
        }
        if (from !== undefined && !isInt(from, 1, 9999)) {
          errors.push(`${at}: from must be a year`);
        }
        if (to !== undefined && !isInt(to, 1, 9999)) {
          errors.push(`${at}: to must be a year`);
        }
        if (isInt(from, 1, 9999) && isInt(to, 1, 9999) && from > to) {
          errors.push(`${at}: from must not be after to`);
        }
        break;
      }
      case 'dateAdded': {
        if (op !== 'between') {
          days();
          break;
        }
        const { from, to } = rule;
        if (from === undefined && to === undefined) {
          errors.push(`${at}: from or to is required`);
        }
        if (from !== undefined && !isIsoDate(from)) {
          errors.push(`${at}: from must be an ISO date (yyyy-mm-dd)`);
        }
        if (to !== undefined && !isIsoDate(to)) {
          errors.push(`${at}: to must be an ISO date (yyyy-mm-dd)`);
        }
        if (isIsoDate(from) && isIsoDate(to) && from > to) {
          errors.push(`${at}: from must not be after to`);
        }
        break;
      }
      case 'rating':
        if (op === 'atLeast' && !isInt(rule.value, 1, 5)) {
          errors.push(`${at}: rating must be an integer from 1 to 5`);
        }
        break;
      case 'runtime':
        if (op === 'between') {
          const { minMinutes, maxMinutes } = rule;
          if (!isInt(minMinutes, 1, 1000) || !isInt(maxMinutes, 1, 1000)) {
            errors.push(`${at}: minutes must be integers from 1 to 1000`);
          } else if (minMinutes > maxMinutes) {
            errors.push(`${at}: minMinutes must not exceed maxMinutes`);
          }
        } else if (!isInt(rule.minutes, 1, 1000)) {
          errors.push(`${at}: minutes must be an integer from 1 to 1000`);
        }
        break;
      case 'discardPile':
        break;
      case 'scrobbleCount':
        if (op === 'topPercent') {
          if (!isInt(rule.percent, 1, 100)) {
            errors.push(`${at}: percent must be an integer from 1 to 100`);
          }
        } else {
          count(0);
        }
        break;
      case 'scrobblesInPeriod':
        validatePeriod(rule.period, at, errors);
        if (op !== 'none') count(0);
        break;
      case 'lastRecordedPlay':
        days();
        if (
          op === 'olderThanDays' &&
          typeof rule.includeNoRecordedPlays !== 'boolean'
        ) {
          errors.push(`${at}: includeNoRecordedPlays must be true or false`);
        }
        break;
      case 'playsSinceAdded':
        if (op === 'atLeast') count(1);
        break;
    }
  });
  return errors;
}
