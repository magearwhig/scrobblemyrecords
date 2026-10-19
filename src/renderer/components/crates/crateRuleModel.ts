/**
 * Field/operator catalogue for the crate rule builder (plan section 4.4).
 *
 * Field labels and help text that talk about listening or dates come from the
 * reviewed phrases in crateCopy.ts; operator labels are neutral UI words.
 */
import { CRATE_LISTENING_FIELDS } from '../../../shared/crateTemplates';
import {
  CrateCoverage,
  CratePeriod,
  CrateRule,
  CrateRuleField,
  CrateUnknownPolicy,
} from '../../../shared/types';
import { CratePhraseKey, phrase } from '../../../shared/utils/crateCopy';

export const CRATE_FIELD_ORDER: CrateRuleField[] = [
  'format',
  'artist',
  'genre',
  'style',
  'pressingYear',
  'dateAdded',
  'rating',
  'runtime',
  'discardPile',
  'scrobbleCount',
  'scrobblesInPeriod',
  'lastRecordedPlay',
  'playsSinceAdded',
];

export interface CrateOpOption {
  op: string;
  label: string;
}

export const CRATE_OPS: Record<CrateRuleField, CrateOpOption[]> = {
  format: [
    { op: 'anyOf', label: 'is any of' },
    { op: 'noneOf', label: 'is none of' },
  ],
  artist: [{ op: 'anyOf', label: 'is any of' }],
  genre: [
    { op: 'anyOf', label: 'is any of' },
    { op: 'noneOf', label: 'is none of' },
  ],
  style: [
    { op: 'anyOf', label: 'is any of' },
    { op: 'noneOf', label: 'is none of' },
  ],
  pressingYear: [{ op: 'between', label: 'is between' }],
  dateAdded: [
    { op: 'withinDays', label: 'in the last' },
    { op: 'olderThanDays', label: 'more than … ago' },
    { op: 'between', label: 'between dates' },
  ],
  rating: [
    { op: 'atLeast', label: 'is at least' },
    { op: 'isUnrated', label: 'is not set' },
  ],
  runtime: [
    { op: 'atMost', label: 'is at most' },
    { op: 'atLeast', label: 'is at least' },
    { op: 'between', label: 'is between' },
  ],
  discardPile: [
    { op: 'exclude', label: 'leave out' },
    { op: 'only', label: 'only' },
  ],
  scrobbleCount: [
    { op: 'atLeast', label: 'at least' },
    { op: 'atMost', label: 'at most' },
    { op: 'topPercent', label: 'top percent' },
  ],
  scrobblesInPeriod: [
    { op: 'none', label: 'none' },
    { op: 'atLeast', label: 'at least' },
    { op: 'atMost', label: 'at most' },
  ],
  lastRecordedPlay: [
    { op: 'olderThanDays', label: 'more than … ago' },
    { op: 'withinDays', label: 'in the last' },
  ],
  playsSinceAdded: [
    { op: 'none', label: 'none' },
    { op: 'atLeast', label: 'at least' },
  ],
};

/** Suggestions for multi-value fields (users can type any value) */
export const CRATE_VALUE_SUGGESTIONS: Partial<
  Record<CrateRuleField, string[]>
> = {
  format: ['Vinyl', 'CD', 'Cassette', 'Box Set', 'File', 'All Media'],
  genre: [
    'Blues',
    "Children's",
    'Classical',
    'Electronic',
    'Folk, World, & Country',
    'Funk / Soul',
    'Hip Hop',
    'Jazz',
    'Latin',
    'Non-Music',
    'Pop',
    'Reggae',
    'Rock',
    'Stage & Screen',
  ],
};

/** Inclusive bounds the API accepts (plan section 11.2) */
export const CRATE_BOUNDS = {
  days: { min: 1, max: 36500 },
  percent: { min: 1, max: 100 },
  minutes: { min: 1, max: 1000 },
  rating: { min: 1, max: 5 },
  year: { min: 1, max: 9999 },
  count: { min: 0, max: 1_000_000 },
  /** playsSinceAdded atLeast: 0 would match every album */
  countSinceAdded: { min: 1, max: 1_000_000 },
} as const;

export function fieldLabel(field: CrateRuleField): string {
  return phrase(`builder.field.${field}` as CratePhraseKey);
}

export function fieldHelp(field: CrateRuleField): string {
  if (field === 'playsSinceAdded')
    return phrase('builder.help.playsSinceAdded');
  if (CRATE_LISTENING_FIELDS.has(field))
    return phrase('builder.help.listening');
  return phrase(`builder.help.${field}` as CratePhraseKey);
}

export function isMultiValueRule(
  rule: CrateRule
): rule is Extract<CrateRule, { values: string[] }> {
  return 'values' in rule;
}

/** Rules that can carry an `ifUnknown` policy */
export function supportsIfUnknown(rule: CrateRule): boolean {
  switch (rule.field) {
    case 'genre':
    case 'style':
    case 'pressingYear':
    case 'runtime':
      return true;
    case 'rating':
      return rule.op === 'atLeast';
    default:
      return false;
  }
}

let idCounter = 0;

/** A new rule id, unique within the crate */
export function newRuleId(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  idCounter += 1;
  return `rule-${Date.now().toString(36)}-${idCounter}`;
}

/** ISO yyyy-mm-dd for a local date */
export function isoDate(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/** A rule with sensible defaults for a field and operator */
export function defaultRule(
  field: CrateRuleField,
  id: string,
  op?: string
): CrateRule {
  const useOp = op ?? CRATE_OPS[field][0].op;
  switch (field) {
    case 'format':
    case 'genre':
    case 'style':
      return {
        id,
        field,
        op: useOp as 'anyOf' | 'noneOf',
        values: [],
      } as CrateRule;
    case 'artist':
      return { id, field, op: 'anyOf', values: [] };
    case 'pressingYear':
      return { id, field, op: 'between', from: 1990, to: 1999 };
    case 'dateAdded':
      if (useOp === 'between') {
        return { id, field, op: 'between', from: isoDate(new Date()) };
      }
      return {
        id,
        field,
        op: useOp as 'withinDays' | 'olderThanDays',
        days: useOp === 'withinDays' ? 90 : 365,
      };
    case 'rating':
      return useOp === 'isUnrated'
        ? { id, field, op: 'isUnrated' }
        : { id, field, op: 'atLeast', value: 4 };
    case 'runtime':
      return useOp === 'between'
        ? { id, field, op: 'between', minMinutes: 30, maxMinutes: 45 }
        : { id, field, op: useOp as 'atMost' | 'atLeast', minutes: 40 };
    case 'discardPile':
      return { id, field, op: useOp as 'exclude' | 'only' };
    case 'scrobbleCount':
      return useOp === 'topPercent'
        ? { id, field, op: 'topPercent', percent: 20 }
        : { id, field, op: useOp as 'atLeast' | 'atMost', value: 10 };
    case 'scrobblesInPeriod': {
      const period: CratePeriod = { kind: 'calendarYear' };
      return useOp === 'none'
        ? { id, field, op: 'none', period }
        : { id, field, op: useOp as 'atLeast' | 'atMost', period, value: 1 };
    }
    case 'lastRecordedPlay':
      return useOp === 'withinDays'
        ? { id, field, op: 'withinDays', days: 30 }
        : {
            id,
            field,
            op: 'olderThanDays',
            days: 365,
            includeNoRecordedPlays: true,
          };
    case 'playsSinceAdded':
      return useOp === 'atLeast'
        ? { id, field, op: 'atLeast', value: 1 }
        : { id, field, op: 'none' };
  }
}

/**
 * Switch a rule's operator, keeping what still applies (values, period,
 * ifUnknown, a day count or a minute limit).
 */
export function changeRuleOp(rule: CrateRule, op: string): CrateRule {
  const next = defaultRule(rule.field, rule.id, op) as unknown as Record<
    string,
    unknown
  >;
  const prev = rule as unknown as Record<string, unknown>;
  for (const key of ['values', 'period', 'days', 'minutes', 'value']) {
    if (key in prev && key in next) next[key] = prev[key];
  }
  if ('ifUnknown' in prev && supportsIfUnknown(next as unknown as CrateRule)) {
    next.ifUnknown = prev.ifUnknown;
  }
  return next as unknown as CrateRule;
}

export function setIfUnknown(
  rule: CrateRule,
  policy: CrateUnknownPolicy
): CrateRule {
  return { ...rule, ifUnknown: policy } as CrateRule;
}

function isIntIn(
  value: unknown,
  bounds: { min: number; max: number }
): boolean {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= bounds.min &&
    value <= bounds.max
  );
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function rangeMessage(bounds: { min: number; max: number }): string {
  return `Enter a whole number from ${bounds.min} to ${bounds.max.toLocaleString('en-US')}`;
}

/**
 * Client-side check of one rule, mirroring the API's bounds, so the builder
 * can flag a problem before saving and skip previews of incomplete rules.
 */
export function ruleProblem(rule: CrateRule): string | null {
  switch (rule.field) {
    case 'format':
    case 'artist':
    case 'genre':
    case 'style':
      return rule.values.length === 0 ? 'Add at least one value' : null;
    case 'pressingYear': {
      if (rule.from === undefined && rule.to === undefined) {
        return 'Enter a start year, an end year or both';
      }
      if (rule.from !== undefined && !isIntIn(rule.from, CRATE_BOUNDS.year)) {
        return 'Enter a valid start year';
      }
      if (rule.to !== undefined && !isIntIn(rule.to, CRATE_BOUNDS.year)) {
        return 'Enter a valid end year';
      }
      if (
        rule.from !== undefined &&
        rule.to !== undefined &&
        rule.from > rule.to
      ) {
        return 'The start year must not be after the end year';
      }
      return null;
    }
    case 'dateAdded':
      if (rule.op === 'between') {
        if (!rule.from && !rule.to)
          return 'Enter a start date, an end date or both';
        if (rule.from && !ISO_DATE.test(rule.from))
          return 'Enter a valid start date';
        if (rule.to && !ISO_DATE.test(rule.to)) return 'Enter a valid end date';
        if (rule.from && rule.to && rule.from > rule.to) {
          return 'The start date must not be after the end date';
        }
        return null;
      }
      return isIntIn(rule.days, CRATE_BOUNDS.days)
        ? null
        : rangeMessage(CRATE_BOUNDS.days);
    case 'rating':
      return rule.op === 'atLeast' && !isIntIn(rule.value, CRATE_BOUNDS.rating)
        ? rangeMessage(CRATE_BOUNDS.rating)
        : null;
    case 'runtime':
      if (rule.op === 'between') {
        if (
          !isIntIn(rule.minMinutes, CRATE_BOUNDS.minutes) ||
          !isIntIn(rule.maxMinutes, CRATE_BOUNDS.minutes)
        ) {
          return rangeMessage(CRATE_BOUNDS.minutes);
        }
        return rule.minMinutes > rule.maxMinutes
          ? 'The minimum must not exceed the maximum'
          : null;
      }
      return isIntIn(rule.minutes, CRATE_BOUNDS.minutes)
        ? null
        : rangeMessage(CRATE_BOUNDS.minutes);
    case 'discardPile':
      return null;
    case 'scrobbleCount':
      if (rule.op === 'topPercent') {
        return isIntIn(rule.percent, CRATE_BOUNDS.percent)
          ? null
          : rangeMessage(CRATE_BOUNDS.percent);
      }
      return isIntIn(rule.value, CRATE_BOUNDS.count)
        ? null
        : rangeMessage(CRATE_BOUNDS.count);
    case 'scrobblesInPeriod': {
      const { period } = rule;
      if (
        period.kind === 'lastDays' &&
        !isIntIn(period.days, CRATE_BOUNDS.days)
      ) {
        return rangeMessage(CRATE_BOUNDS.days);
      }
      if (period.kind === 'since' && !ISO_DATE.test(period.date)) {
        return 'Enter a valid date';
      }
      if (rule.op !== 'none' && !isIntIn(rule.value, CRATE_BOUNDS.count)) {
        return rangeMessage(CRATE_BOUNDS.count);
      }
      return null;
    }
    case 'lastRecordedPlay':
      return isIntIn(rule.days, CRATE_BOUNDS.days)
        ? null
        : rangeMessage(CRATE_BOUNDS.days);
    case 'playsSinceAdded':
      return rule.op === 'atLeast' &&
        !isIntIn(rule.value, CRATE_BOUNDS.countSinceAdded)
        ? rangeMessage(CRATE_BOUNDS.countSinceAdded)
        : null;
  }
}

export function hasListeningRules(rules: CrateRule[]): boolean {
  return rules.some(rule => CRATE_LISTENING_FIELDS.has(rule.field));
}

/**
 * Split the API's validation `details` ("rules[2]: days must be …") into
 * per-rule messages (by rule id) and the rest.
 */
export function splitRuleErrors(
  details: string[],
  rules: CrateRule[]
): { byRule: Record<string, string[]>; other: string[] } {
  const byRule: Record<string, string[]> = {};
  const other: string[] = [];
  for (const detail of details) {
    const match = /^rules\[(\d+)\]:\s*(.*)$/.exec(detail);
    const rule = match ? rules[Number(match[1])] : undefined;
    if (match && rule) {
      (byRule[rule.id] ??= []).push(match[2]);
    } else {
      other.push(detail);
    }
  }
  return { byRule, other };
}

/** HTTP status and validation details from an API error, if any */
export function apiErrorInfo(err: unknown): {
  status?: number;
  message: string;
  details: string[];
} {
  const response = (
    err as {
      response?: {
        status?: number;
        data?: { error?: string; details?: unknown };
      };
    }
  )?.response;
  const details = Array.isArray(response?.data?.details)
    ? (response?.data?.details as unknown[]).filter(
        (d): d is string => typeof d === 'string'
      )
    : [];
  const message =
    response?.data?.error ??
    (err instanceof Error ? err.message : 'Something went wrong');
  return { status: response?.status, message, details };
}

/**
 * Coverage lines for the data the rules depend on, e.g. "Rating: 0 of 1,150
 * albums rated on Discogs", so missing data is visible (plan section 4.4).
 */
export function formatCoverageCounts(
  coverage: CrateCoverage,
  rules: CrateRule[]
): string[] {
  const fields = new Set(rules.map(rule => rule.field));
  const total = coverage.totalAlbums;
  const lines: string[] = [];
  if (fields.has('runtime') && coverage.runtimeKnownAlbums !== null) {
    lines.push(
      phrase('coverage.runtimeKnown', {
        count: coverage.runtimeKnownAlbums,
        total,
      })
    );
  }
  if (
    (fields.has('genre') || fields.has('style')) &&
    coverage.genreKnownAlbums !== null
  ) {
    lines.push(
      phrase('coverage.genreKnown', { count: coverage.genreKnownAlbums, total })
    );
  }
  if (fields.has('rating')) {
    lines.push(
      phrase('coverage.rated', { count: coverage.ratedAlbums, total })
    );
  }
  return lines;
}
