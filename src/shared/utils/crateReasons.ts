/**
 * "Why this matches" and other crate copy, built only from the reviewed phrase
 * templates in crateCopy.ts (plan sections 8 and 10.4).
 *
 * Evidence read per rule (CrateRuleResult.evidence). Anything missing falls
 * back to the witness copy in `ctx.copies` (found by `evidence.releaseId`, or
 * the first copy) or to `ctx.listening`:
 * - format: witness copy `format`
 * - artist: `value` (string) or witness `artist`
 * - genre / style: `value` (string[]: the release's genres / styles)
 * - pressingYear: `value` (number) or witness `year`
 * - dateAdded: `dateAdded` (ISO) or witness `dateAdded`
 * - rating: `value` (number, 1-5)
 * - runtime: `knownSeconds`, `tracksWithDuration`, `trackCount`
 *   (`trackCount` undefined = details not fetched)
 * - discardPile: none
 * - scrobbleCount: `scrobbles`, `rank`, `rankOf` (albums with a rank)
 * - scrobblesInPeriod: `scrobbles` (in the period), `lastPlayed`, `historyFrom`
 * - lastRecordedPlay: `lastPlayed`, `historyFrom`
 * - playsSinceAdded: `scrobbles` (since added), `playsBeforeAdded`,
 *   `lastPlayed`, `dateAdded` (the latest copy's)
 * Listening rules are `unknown` only when there is no history index.
 */

import { CRATE_TEMPLATES } from '../crateTemplates';
import {
  CrateAlbumCopy,
  CrateAlbumResult,
  CrateCoverage,
  CratePeriod,
  CrateRule,
  CrateRuleResult,
  CrateSuggestionRecipe,
} from '../types';

import {
  CratePhraseKey,
  formatCrateDate,
  formatCrateMonth,
  formatRelative,
  formatRuntime,
  formatSpan,
  formatValueList,
  joinPhrases,
  joinSentences,
  phrase,
  phraseCount,
  secondsToMs,
  withNote,
} from './crateCopy';

export interface CrateReasonContext {
  /** The album's copies (to describe the witness: "2023 pressing · Vinyl") */
  copies: CrateAlbumCopy[];
  /** seconds; start of the scrobble history */
  historyFrom?: number | null;
  now?: Date;
  /** The album's listening summary, used when evidence leaves a value out */
  listening?: Pick<
    CrateAlbumResult['listening'],
    'scrobbleCount' | 'lastPlayed' | 'matchType'
  >;
}

const STALE_SYNC_MS = 3 * 24 * 60 * 60 * 1000;

// ---- Small helpers ----

function witnessCopy(
  result: CrateRuleResult,
  ctx: CrateReasonContext
): CrateAlbumCopy | undefined {
  const id = result.evidence.releaseId;
  return (
    (id !== undefined && ctx.copies.find(c => c.releaseId === id)) ||
    ctx.copies[0]
  );
}

/**
 * Describe the witness copy ("2023 pressing · Vinyl") when the album has more
 * than one copy; with a single copy the description adds nothing.
 */
function witnessSuffix(
  result: CrateRuleResult,
  ctx: CrateReasonContext,
  opts: { includeFormat: boolean } = { includeFormat: true }
): string | undefined {
  if (ctx.copies.length < 2 || result.evidence.releaseId === undefined) {
    return undefined;
  }
  const copy = ctx.copies.find(c => c.releaseId === result.evidence.releaseId);
  if (!copy) return undefined;
  const text = joinPhrases(
    copy.year ? phrase('copy.pressing', { year: String(copy.year) }) : '',
    opts.includeFormat ? formatValueList(copy.format) : ''
  );
  return text || undefined;
}

function evidenceStrings(
  value: CrateRuleResult['evidence']['value']
): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return [value];
  return [];
}

function sameValue(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function intersect(have: string[], want: string[]): string[] {
  return have.filter(h => want.some(w => sameValue(h, w)));
}

function minutesPhrase(minutes: number): string {
  return phraseCount('count.minutes', minutes);
}

function historyNote(
  evidence: CrateRuleResult['evidence']
): string | undefined {
  return evidence.historyFrom
    ? phrase('note.historyStarts', {
        month: formatCrateMonth(secondsToMs(evidence.historyFrom)),
      })
    : undefined;
}

function periodPhrase(period: CratePeriod, now?: Date): string {
  switch (period.kind) {
    case 'calendarYear':
      return now
        ? phrase('period.since', {
            date: formatCrateDate(new Date(now.getFullYear(), 0, 1)),
          })
        : phrase('period.sinceJan1');
    case 'lastDays':
      return phrase('period.last', { span: formatSpan(period.days) });
    case 'since':
      return phrase('period.since', { date: formatCrateDate(period.date) });
  }
}

function yearRangePhrase(from?: number, to?: number): string | undefined {
  if (from !== undefined && to !== undefined) {
    return from === to
      ? phrase('range.year.exact', { year: String(from) })
      : phrase('range.year.between', { from: String(from), to: String(to) });
  }
  if (from !== undefined)
    return phrase('range.year.from', { from: String(from) });
  if (to !== undefined) return phrase('range.year.to', { to: String(to) });
  return undefined;
}

function dateRangePhrase(from?: string, to?: string): string | undefined {
  if (from && to) {
    return phrase('range.date.between', {
      from: formatCrateDate(from),
      to: formatCrateDate(to),
    });
  }
  if (from) return phrase('range.date.from', { from: formatCrateDate(from) });
  if (to) return phrase('range.date.to', { to: formatCrateDate(to) });
  return undefined;
}

/** "No scrobbles recorded for this album", with the name-match explanation */
function noneRecordedPhrase(
  ctx: CrateReasonContext,
  evidence: CrateRuleResult['evidence']
): string {
  const base =
    ctx.listening?.matchType === 'none'
      ? phrase('reason.scrobbles.noNameMatch')
      : phrase('reason.scrobbles.noneRecorded');
  const from = evidence.historyFrom ?? ctx.historyFrom;
  return withNote(
    base,
    from
      ? phrase('note.historyStarts', {
          month: formatCrateMonth(secondsToMs(from)),
        })
      : undefined
  );
}

function lastPlayedOf(
  evidence: CrateRuleResult['evidence'],
  ctx: CrateReasonContext
): number | null | undefined {
  if (evidence.lastPlayed !== undefined) return evidence.lastPlayed;
  return ctx.listening?.lastPlayed;
}

// ---- Reasons per rule ----

function copyReason(
  rule: CrateRule,
  result: CrateRuleResult,
  ctx: CrateReasonContext
): string {
  const { outcome, evidence } = result;
  const copy = witnessCopy(result, ctx);
  // "not Vinyl or Cassette"
  const values = 'values' in rule ? formatValueList(rule.values, 'or') : '';

  switch (rule.field) {
    case 'format': {
      const format = formatValueList(copy?.format ?? []);
      const text =
        outcome === 'match'
          ? phrase('reason.format.match', { format })
          : rule.op === 'anyOf'
            ? phrase('reason.format.noMatch.anyOf', { format, values })
            : phrase('reason.format.noMatch.noneOf', { format });
      return joinPhrases(
        text,
        witnessSuffix(result, ctx, { includeFormat: false })
      );
    }
    case 'artist': {
      const artist =
        typeof evidence.value === 'string'
          ? evidence.value
          : (copy?.artist ?? '');
      return outcome === 'match'
        ? phrase('reason.artist.match', { artist })
        : phrase('reason.artist.noMatch', { artist, values });
    }
    case 'genre':
    case 'style': {
      const isGenre = rule.field === 'genre';
      if (outcome === 'unknown') {
        return joinPhrases(
          phrase(isGenre ? 'reason.genre.unknown' : 'reason.style.unknown'),
          witnessSuffix(result, ctx)
        );
      }
      const have = evidenceStrings(evidence.value);
      const shared = intersect(have, rule.values);
      let text: string;
      if (outcome === 'match') {
        const shown =
          rule.op === 'anyOf' ? (shared.length ? shared : rule.values) : have;
        text = phrase(isGenre ? 'reason.genre.match' : 'reason.style.match', {
          values: formatValueList(shown),
        });
      } else if (rule.op === 'anyOf') {
        text = isGenre
          ? phrase('reason.genre.noMatch.anyOf', {
              genres: formatValueList(have),
              values,
            })
          : phrase('reason.style.noMatch.anyOf', {
              styles: formatValueList(have),
              values,
            });
      } else {
        text = phrase(
          isGenre
            ? 'reason.genre.noMatch.noneOf'
            : 'reason.style.noMatch.noneOf',
          {
            values: formatValueList(
              shared.length ? shared : rule.values,
              'and'
            ),
          }
        );
      }
      return joinPhrases(text, witnessSuffix(result, ctx));
    }
    case 'pressingYear': {
      if (outcome === 'unknown') {
        return joinPhrases(
          phrase('reason.pressingYear.unknown'),
          witnessSuffix(result, ctx)
        );
      }
      const year = String(
        typeof evidence.value === 'number' ? evidence.value : (copy?.year ?? '')
      );
      const text =
        outcome === 'match'
          ? phrase('reason.pressingYear.match', { year })
          : phrase('reason.pressingYear.noMatch', {
              year,
              range: yearRangePhrase(rule.from, rule.to) ?? '',
            });
      return joinPhrases(text, witnessSuffix(result, ctx));
    }
    case 'dateAdded': {
      const date = formatCrateDate(evidence.dateAdded ?? copy?.dateAdded ?? '');
      let text: string;
      if (outcome === 'match') {
        text = phrase('reason.dateAdded.match', { date });
      } else if (rule.op === 'between') {
        text = phrase('reason.dateAdded.noMatch.range', {
          date,
          range: dateRangePhrase(rule.from, rule.to) ?? '',
        });
      } else {
        text = phrase(
          rule.op === 'withinDays'
            ? 'reason.dateAdded.noMatch.withinDays'
            : 'reason.dateAdded.noMatch.olderThanDays',
          { date, span: formatSpan(rule.days) }
        );
      }
      return joinPhrases(text, witnessSuffix(result, ctx));
    }
    case 'rating': {
      const value = typeof evidence.value === 'number' ? evidence.value : 0;
      let text: string;
      if (
        outcome === 'unknown' ||
        (rule.op === 'isUnrated' && outcome === 'match')
      ) {
        text = phrase('reason.rating.unrated');
      } else if (outcome === 'match') {
        text = phrase('reason.rating.match', { value });
      } else if (rule.op === 'atLeast') {
        text = value
          ? phrase('reason.rating.noMatch.atLeast', { value, min: rule.value })
          : phrase('reason.rating.unrated');
      } else {
        text = phrase('reason.rating.match', { value });
      }
      return joinPhrases(text, witnessSuffix(result, ctx));
    }
    case 'runtime':
      return joinPhrases(
        runtimeReason(rule, result),
        witnessSuffix(result, ctx)
      );
    case 'discardPile': {
      const inPile = (rule.op === 'only') === (outcome === 'match');
      return phrase(
        inPile ? 'reason.discardPile.in' : 'reason.discardPile.notIn'
      );
    }
    default:
      return '';
  }
}

function runtimeReason(
  rule: Extract<CrateRule, { field: 'runtime' }>,
  result: CrateRuleResult
): string {
  const { outcome, evidence } = result;
  const trackCount = evidence.trackCount;
  const timed = evidence.tracksWithDuration ?? 0;
  const known = evidence.knownSeconds ?? 0;
  if (trackCount === undefined) {
    return phrase('reason.runtime.unknownNotFetched');
  }
  if (trackCount === 0) return phrase('reason.runtime.unknownNoTracks');
  const complete = timed === trackCount;
  const runtime = formatRuntime(known);

  if (complete) {
    const base = phraseCount('reason.runtime.complete', trackCount, {
      runtime,
    });
    if (outcome !== 'noMatch') return base;
    if (rule.op === 'between') {
      return phrase('reason.runtime.outside', {
        runtime,
        min: rule.minMinutes,
        max: rule.maxMinutes,
      });
    }
    return phrase(
      rule.op === 'atMost'
        ? 'reason.runtime.tooLong'
        : 'reason.runtime.tooShort',
      { runtime, limit: minutesPhrase(rule.minutes) }
    );
  }

  // Partial durations: the known part may still decide the rule
  const partialSlots = { timed, total: trackCount, known: runtime };
  if (
    outcome === 'noMatch' &&
    (rule.op === 'atMost' || rule.op === 'between')
  ) {
    const limit = rule.op === 'between' ? rule.maxMinutes : rule.minutes;
    return phrase('reason.runtime.partialOver', {
      ...partialSlots,
      limit: minutesPhrase(limit),
    });
  }
  if (outcome === 'match' && rule.op === 'atLeast') {
    return phrase('reason.runtime.partialAtLeast', {
      ...partialSlots,
      limit: minutesPhrase(rule.minutes),
    });
  }
  if (timed === 0) return phrase('reason.runtime.unknownNoDurations');
  return phrase('reason.runtime.unknownPartial', partialSlots);
}

function listeningReason(
  rule: CrateRule,
  result: CrateRuleResult,
  ctx: CrateReasonContext
): string {
  const { outcome, evidence } = result;
  if (outcome === 'unknown') return phrase('reason.listening.noHistory');
  const note = historyNote(evidence);

  switch (rule.field) {
    case 'scrobbleCount': {
      const scrobbles = evidence.scrobbles ?? ctx.listening?.scrobbleCount ?? 0;
      if (rule.op === 'topPercent') {
        if (scrobbles === 0 || evidence.rank === undefined) {
          return phrase('reason.scrobbles.notTopNone', {
            percent: rule.percent,
          });
        }
        return phrase(
          outcome === 'match'
            ? 'reason.scrobbles.top'
            : 'reason.scrobbles.notTop',
          {
            percent: rule.percent,
            scrobbles: phraseCount('count.scrobbles', scrobbles),
            rank: evidence.rank,
            rankOf: evidence.rankOf ?? 0,
          }
        );
      }
      if (scrobbles === 0) return noneRecordedPhrase(ctx, evidence);
      if (outcome === 'match' || (rule.op === 'atMost' && rule.value === 0)) {
        return phraseCount('reason.scrobbles.count', scrobbles);
      }
      return rule.op === 'atLeast'
        ? phraseCount('reason.scrobbles.fewerThan', scrobbles, {
            value: rule.value,
          })
        : phraseCount('reason.scrobbles.moreThan', scrobbles, {
            value: rule.value,
          });
    }
    case 'scrobblesInPeriod': {
      const period = periodPhrase(rule.period, ctx.now);
      const scrobbles = evidence.scrobbles ?? 0;
      const lastPlayed = lastPlayedOf(evidence, ctx);
      let text: string;
      if (scrobbles === 0) {
        if (lastPlayed === null) return noneRecordedPhrase(ctx, evidence);
        text = withNote(phrase('reason.period.none', { period }), note);
        return lastPlayed === undefined
          ? text
          : joinPhrases(
              text,
              phrase('reason.lastScrobble.fragment', {
                date: formatCrateDate(secondsToMs(lastPlayed)),
              })
            );
      }
      if (outcome === 'noMatch' && rule.op === 'atLeast') {
        text = phraseCount('reason.period.fewerThan', scrobbles, {
          period,
          value: rule.value,
        });
      } else if (
        outcome === 'noMatch' &&
        rule.op === 'atMost' &&
        rule.value > 0
      ) {
        text = phraseCount('reason.period.moreThan', scrobbles, {
          period,
          value: rule.value,
        });
      } else {
        text = phraseCount('reason.period.count', scrobbles, { period });
      }
      text = withNote(text, note);
      return lastPlayed == null
        ? text
        : joinPhrases(
            text,
            phrase('reason.lastScrobble.fragment', {
              date: formatCrateDate(secondsToMs(lastPlayed)),
            })
          );
    }
    case 'lastRecordedPlay': {
      const lastPlayed = lastPlayedOf(evidence, ctx);
      if (lastPlayed == null) return noneRecordedPhrase(ctx, evidence);
      const date = formatCrateDate(secondsToMs(lastPlayed));
      const span = formatSpan(rule.days);
      let text: string;
      if (outcome === 'match') {
        text = phrase('reason.lastScrobble', { date });
      } else if (rule.op === 'olderThanDays') {
        text = phrase('reason.lastScrobble.recent', { date, span });
      } else {
        text = phrase('reason.lastScrobble.old', { date, span });
      }
      return withNote(text, note);
    }
    case 'playsSinceAdded': {
      const latest = ctx.copies.reduce<CrateAlbumCopy | undefined>(
        (best, c) =>
          !best || toMs(c.dateAdded) > toMs(best.dateAdded) ? c : best,
        undefined
      );
      const addedIso = evidence.dateAdded ?? latest?.dateAdded;
      const added = addedIso
        ? phrase('reason.sinceAdded.added', { date: formatCrateDate(addedIso) })
        : undefined;
      const since = evidence.scrobbles ?? 0;
      let sinceText: string;
      if (since === 0) {
        sinceText = phrase('reason.sinceAdded.none');
      } else if (outcome === 'noMatch' && rule.op === 'atLeast') {
        sinceText = phraseCount('reason.sinceAdded.fewerThan', since, {
          value: rule.value,
        });
      } else {
        sinceText = phraseCount('reason.sinceAdded.count', since);
      }
      const before = evidence.playsBeforeAdded ?? 0;
      const lastPlayed = lastPlayedOf(evidence, ctx);
      const beforeText =
        since === 0 && before > 0 && lastPlayed != null
          ? phraseCount('reason.sinceAdded.before', before, {
              month: formatCrateMonth(secondsToMs(lastPlayed)),
            })
          : undefined;
      return joinPhrases(added, sinceText, beforeText);
    }
    default:
      return '';
  }
}

function toMs(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
}

const LISTENING_FIELDS = new Set<CrateRule['field']>([
  'scrobbleCount',
  'scrobblesInPeriod',
  'lastRecordedPlay',
  'playsSinceAdded',
]);

/**
 * One line explaining a rule result for an album, e.g.
 * "Top 20% by scrobbles: 412 scrobbles, #37 of 1,150 owned albums with scrobbles".
 * Copy-level reasons name the witness copy ("· 2023 pressing · Vinyl") when
 * the album has more than one copy.
 */
export function formatCrateReason(
  rule: CrateRule,
  result: CrateRuleResult,
  ctx: CrateReasonContext
): string {
  return LISTENING_FIELDS.has(rule.field)
    ? listeningReason(rule, result, ctx)
    : copyReason(rule, result, ctx);
}

/**
 * Optional line about how the album's scrobbles were found: "Scrobbles matched
 * as "{name}"" for fuzzy matches, or the no-name-match explanation.
 */
export function formatScrobbleMatch(
  listening: Pick<CrateAlbumResult['listening'], 'matchType' | 'matchedKeys'>
): string | undefined {
  if (listening.matchType === 'none') {
    return phrase('reason.scrobbles.noNameMatch');
  }
  if (listening.matchType === 'fuzzy' && listening.matchedKeys.length > 0) {
    return phrase('reason.scrobbles.fuzzyMatch', {
      names: formatValueList(
        listening.matchedKeys.map(text => phrase('quote', { text })),
        'and'
      ),
    });
  }
  return undefined;
}

// ---- Membership ----

/**
 * "Matches rules" | "Included by you" | "Included by you · also matches rules"
 * | "Excluded by you", with "on {date}" when `overrideAt` (ms) is given.
 */
export function formatMembership(
  album: Pick<CrateAlbumResult, 'membership' | 'overrideAt'>
): string {
  const date =
    album.overrideAt !== undefined ? formatCrateDate(album.overrideAt) : null;
  switch (album.membership) {
    case 'rules':
      return phrase('membership.rules');
    case 'included':
      return date
        ? phrase('membership.includedOn', { date })
        : phrase('membership.included');
    case 'includedAndRules':
      return joinPhrases(
        date
          ? phrase('membership.includedOn', { date })
          : phrase('membership.included'),
        phrase('membership.alsoRules')
      );
    case 'excluded':
      return date
        ? phrase('membership.excludedOn', { date })
        : phrase('membership.excluded');
  }
}

// ---- Rule descriptions ----

function listRule(
  keys: { is: CratePhraseKey; anyOf: CratePhraseKey },
  values: string[]
): string {
  return phrase(values.length === 1 ? keys.is : keys.anyOf, {
    values: formatValueList(values),
  });
}

/** Short description of a rule for the builder/summary, e.g. "Genre is any of Jazz, Soul" */
export function describeCrateRule(rule: CrateRule): string {
  const text = describeRuleText(rule);
  return 'ifUnknown' in rule && rule.ifUnknown === 'include'
    ? joinPhrases(text, phrase('note.ifUnknownInclude'))
    : text;
}

function describeRuleText(rule: CrateRule): string {
  switch (rule.field) {
    case 'format':
      return rule.op === 'anyOf'
        ? listRule(
            { is: 'rule.format.is', anyOf: 'rule.format.anyOf' },
            rule.values
          )
        : listRule(
            { is: 'rule.format.isNot', anyOf: 'rule.format.noneOf' },
            rule.values
          );
    case 'artist':
      return listRule(
        { is: 'rule.artist.is', anyOf: 'rule.artist.anyOf' },
        rule.values
      );
    case 'genre':
      return rule.op === 'anyOf'
        ? listRule(
            { is: 'rule.genre.is', anyOf: 'rule.genre.anyOf' },
            rule.values
          )
        : listRule(
            { is: 'rule.genre.isNot', anyOf: 'rule.genre.noneOf' },
            rule.values
          );
    case 'style':
      return rule.op === 'anyOf'
        ? listRule(
            { is: 'rule.style.is', anyOf: 'rule.style.anyOf' },
            rule.values
          )
        : listRule(
            { is: 'rule.style.isNot', anyOf: 'rule.style.noneOf' },
            rule.values
          );
    case 'pressingYear': {
      const range = yearRangePhrase(rule.from, rule.to);
      return range
        ? phrase('rule.pressingYear.range', { range })
        : phrase('rule.pressingYear.any');
    }
    case 'dateAdded': {
      if (rule.op === 'between') {
        const range = dateRangePhrase(rule.from, rule.to);
        return range
          ? phrase('rule.dateAdded.range', { range })
          : phrase('rule.dateAdded.any');
      }
      return phrase(
        rule.op === 'withinDays'
          ? 'rule.dateAdded.withinDays'
          : 'rule.dateAdded.olderThanDays',
        { span: formatSpan(rule.days) }
      );
    }
    case 'rating':
      if (rule.op === 'isUnrated') return phrase('rule.rating.isUnrated');
      return rule.value >= 5
        ? phrase('rule.rating.exactly', { value: 5 })
        : phrase('rule.rating.atLeast', { value: rule.value });
    case 'runtime':
      if (rule.op === 'between') {
        return phrase('rule.runtime.between', {
          min: rule.minMinutes,
          max: rule.maxMinutes,
        });
      }
      return phrase(
        rule.op === 'atMost' ? 'rule.runtime.atMost' : 'rule.runtime.atLeast',
        { limit: minutesPhrase(rule.minutes) }
      );
    case 'discardPile':
      return phrase(
        rule.op === 'exclude'
          ? 'rule.discardPile.exclude'
          : 'rule.discardPile.only'
      );
    case 'scrobbleCount':
      if (rule.op === 'topPercent') {
        return phrase('rule.scrobbleCount.topPercent', {
          percent: rule.percent,
        });
      }
      if (rule.op === 'atMost' && rule.value === 0) {
        return phrase('rule.scrobbleCount.atMostZero');
      }
      return phraseCount(
        rule.op === 'atLeast'
          ? 'rule.scrobbleCount.atLeast'
          : 'rule.scrobbleCount.atMost',
        rule.value
      );
    case 'scrobblesInPeriod': {
      const period = periodPhrase(rule.period);
      if (rule.op === 'none') {
        return phrase('rule.scrobblesInPeriod.none', { period });
      }
      if (rule.op === 'atMost' && rule.value === 0) {
        return phrase('rule.scrobblesInPeriod.none', { period });
      }
      return phraseCount(
        rule.op === 'atLeast'
          ? 'rule.scrobblesInPeriod.atLeast'
          : 'rule.scrobblesInPeriod.atMost',
        rule.value,
        { period }
      );
    }
    case 'lastRecordedPlay': {
      const span = formatSpan(rule.days);
      if (rule.op === 'withinDays') {
        return phrase('rule.lastRecordedPlay.withinDays', { span });
      }
      return phrase(
        rule.includeNoRecordedPlays
          ? 'rule.lastRecordedPlay.olderThanDays'
          : 'rule.lastRecordedPlay.olderThanDaysRecorded',
        { span }
      );
    }
    case 'playsSinceAdded':
      return rule.op === 'none'
        ? phrase('rule.playsSinceAdded.none')
        : phraseCount('rule.playsSinceAdded.atLeast', rule.value);
  }
}

// ---- Coverage ----

export interface CrateCoverageCopy {
  /** "Listening data: Last.fm scrobbles since Feb 2005 · last sync finished 2 hours ago" */
  header: string;
  /** Stale or unknown sync, or no history; only for crates with listening rules */
  banner?: string;
  /** Shown while the collection snapshot is incomplete */
  collectionNotice?: string;
}

/** Crate header coverage text and optional banners (plan section 8.1) */
export function formatCrateCoverage(
  coverage: CrateCoverage,
  opts: { hasListeningRules: boolean; now?: Date }
): CrateCoverageCopy {
  const now = opts.now ?? new Date();
  let header: string;
  if (!coverage.hasHistory) {
    header = phrase('coverage.noHistory');
  } else {
    const start =
      coverage.historyFrom !== null
        ? phrase('coverage.history', {
            month: formatCrateMonth(secondsToMs(coverage.historyFrom)),
          })
        : phrase('coverage.historyNoStart');
    const freshness =
      coverage.lastSyncCompletedAt !== null
        ? phrase('coverage.lastSync', {
            relative: formatRelative(coverage.lastSyncCompletedAt, now),
          })
        : coverage.newestScrobbleAt !== null
          ? phrase('coverage.newestScrobble', {
              date: formatCrateDate(coverage.newestScrobbleAt),
            })
          : undefined;
    header = joinPhrases(start, freshness);
  }

  let banner: string | undefined;
  if (opts.hasListeningRules) {
    if (!coverage.hasHistory) {
      banner = phrase('coverage.banner.noHistory');
    } else if (coverage.lastSyncCompletedAt === null) {
      banner = phrase('coverage.banner.unknown');
    } else if (now.getTime() - coverage.lastSyncCompletedAt > STALE_SYNC_MS) {
      banner = phrase('coverage.banner.stale', {
        date: formatCrateDate(coverage.lastSyncCompletedAt),
      });
    }
  }

  let collectionNotice: string | undefined;
  if (!coverage.collection.complete) {
    const { pagesRead, pagesExpected } = coverage.collection;
    collectionNotice =
      pagesExpected !== null && pagesExpected > 0
        ? phrase('coverage.collection.loadingPages', {
            read: pagesRead,
            expected: pagesExpected,
          })
        : phrase('coverage.collection.loading');
  }

  return {
    header,
    ...(banner ? { banner } : {}),
    ...(collectionNotice ? { collectionNotice } : {}),
  };
}

/** Unknown-only panel line per rule, e.g. "31 more albums might match: runtime unknown" */
export function formatUnknownCount(rule: CrateRule, count: number): string {
  let reason: string;
  if (LISTENING_FIELDS.has(rule.field)) {
    reason = phrase('unknownCount.listening');
  } else {
    switch (rule.field) {
      case 'runtime':
        reason = phrase('unknownCount.runtime');
        break;
      case 'genre':
        reason = phrase('unknownCount.genre');
        break;
      case 'style':
        reason = phrase('unknownCount.style');
        break;
      case 'rating':
        reason = phrase('unknownCount.rating');
        break;
      case 'pressingYear':
        reason = phrase('unknownCount.pressingYear');
        break;
      default:
        reason = phrase('unknownCount.other');
    }
  }
  return phraseCount('unknownCount.line', count, { reason });
}

// ---- Suggested crates (plan sections 10.1 and 10.4) ----

/** The parameters of a suggestion candidate, per recipe */
export type CrateSuggestionCopyInput =
  /** `style anyOf [style]` AND no scrobbles in the last `days` */
  | { recipe: 'style-quiet'; style: string; days: number }
  | { recipe: 'artist'; artist: string }
  /** `pressingYear between {decade, decade+9}` AND last scrobble older than `days` */
  | { recipe: 'decade-quiet'; decade: number; days: number }
  /** `scrobbleCount topPercent percent` AND last scrobble older than `days` */
  | { recipe: 'top-quiet'; percent: number; days: number }
  /** `dateAdded withinDays days` AND `playsSinceAdded none` */
  | { recipe: 'added-quiet'; days: number }
  /** `genre anyOf [genre]` AND `runtime atMost minutes` */
  | { recipe: 'short'; genre: string; minutes: number }
  /** A starter template from CRATE_TEMPLATES */
  | { recipe: 'template'; templateId: string };

/**
 * Counts for a suggestion's reason, from the candidate's live evaluation.
 * - `pool`: the denominator of the recipe's signal (owned albums with the
 *   style / pressed in the decade / in the top set / added in the window /
 *   of the genre with a known runtime). For `artist` it is the member count;
 *   for `template` it is ignored.
 * - `count`: the members (for `artist`: members with no scrobbles in the
 *   last 365 days).
 */
export interface CrateSuggestionCounts {
  pool: number;
  count: number;
  /**
   * false when there is no history index: the artist reason then states only
   * what is owned, since nothing is known about scrobbles. Default true.
   */
  hasHistory?: boolean;
}

// Compile-time check that every recipe has copy
type MissingRecipe = Exclude<
  CrateSuggestionRecipe,
  CrateSuggestionCopyInput['recipe']
>;
const _allRecipesCovered: MissingRecipe extends never ? true : false = true;
void _allRecipesCovered;

function templateById(id: string) {
  const template = CRATE_TEMPLATES.find(t => t.id === id);
  if (!template) throw new Error(`Unknown crate template "${id}"`);
  return template;
}

/** Card title, e.g. "Post-Punk with no scrobbles in 12 months" */
export function formatSuggestionName(input: CrateSuggestionCopyInput): string {
  switch (input.recipe) {
    case 'style-quiet':
      return phrase('suggestion.styleQuiet.name', {
        style: input.style,
        span: formatSpan(input.days),
      });
    case 'artist':
      return phrase('suggestion.artist.name', { artist: input.artist });
    case 'decade-quiet':
      return phrase('suggestion.decadeQuiet.name', {
        decade: String(input.decade),
        span: formatSpan(input.days),
      });
    case 'top-quiet':
      return phrase('suggestion.topQuiet.name', {
        span: formatSpan(input.days),
      });
    case 'added-quiet':
      return phrase('suggestion.addedQuiet.name', {
        span: formatSpan(input.days),
      });
    case 'short':
      return phrase('suggestion.short.name', {
        genre: input.genre,
        limit: minutesPhrase(input.minutes),
      });
    case 'template':
      return templateById(input.templateId).name;
  }
}

/** Description saved with the crate when the suggestion is added */
export function formatSuggestionDescription(
  input: CrateSuggestionCopyInput
): string {
  switch (input.recipe) {
    case 'style-quiet':
      return phrase('suggestion.styleQuiet.description', {
        style: input.style,
        span: formatSpan(input.days),
      });
    case 'artist':
      return phrase('suggestion.artist.description', { artist: input.artist });
    case 'decade-quiet':
      return phrase('suggestion.decadeQuiet.description', {
        decade: String(input.decade),
        span: formatSpan(input.days),
      });
    case 'top-quiet':
      return phrase('suggestion.topQuiet.description', {
        percent: input.percent,
        span: formatSpan(input.days),
      });
    case 'added-quiet':
      return phrase('suggestion.addedQuiet.description', {
        span: formatSpan(input.days),
      });
    case 'short':
      return phrase('suggestion.short.description', {
        genre: input.genre,
        limit: minutesPhrase(input.minutes),
      });
    case 'template':
      return templateById(input.templateId).description;
  }
}

/**
 * Why the card was suggested, e.g. "You own 23 Post-Punk albums. 15 have no
 * scrobbles recorded in the last 12 months."
 */
export function formatSuggestionReason(
  input: CrateSuggestionCopyInput,
  counts: CrateSuggestionCounts
): string {
  const { pool, count } = counts;
  const quiet = (days: number) =>
    phraseCount('suggestion.reason.quiet', count, { span: formatSpan(days) });
  switch (input.recipe) {
    case 'style-quiet':
      return joinSentences(
        phraseCount('suggestion.reason.ownStyle', pool, { style: input.style }),
        quiet(input.days)
      );
    case 'artist':
      return joinSentences(
        phraseCount('suggestion.reason.ownArtist', pool, {
          artist: input.artist,
        }),
        counts.hasHistory === false
          ? ''
          : count > 0
            ? quiet(365)
            : phrase('suggestion.reason.noneQuiet', { span: formatSpan(365) })
      );
    case 'decade-quiet':
      return joinSentences(
        phraseCount('suggestion.reason.ownDecade', pool, {
          decade: String(input.decade),
        }),
        quiet(input.days)
      );
    case 'top-quiet':
      return joinSentences(
        phraseCount('suggestion.reason.topSet', pool, {
          percent: input.percent,
        }),
        quiet(input.days)
      );
    case 'added-quiet':
      return joinSentences(
        phraseCount('suggestion.reason.addedSet', pool, {
          span: formatSpan(input.days),
        }),
        phraseCount('suggestion.reason.quietSinceAdded', count)
      );
    case 'short':
      return joinSentences(
        phraseCount('suggestion.reason.ownTimed', pool, { genre: input.genre }),
        phraseCount('suggestion.reason.fits', count, {
          limit: minutesPhrase(input.minutes),
        })
      );
    case 'template':
      return phraseCount('suggestion.reason.template', count);
  }
}
