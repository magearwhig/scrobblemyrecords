/**
 * Collection "Save as crate" (smart crates plan, section 11.3): turn the
 * Collection page's active filters into crate rules, and hand them to the
 * Crates editor through sessionStorage.
 */
import { CrateRule } from '../../shared/types';
import { newRuleId } from '../components/crates/crateRuleModel';

/** The Collection page's filter values (as stored in its presets) */
export interface CollectionCrateFilters {
  format: string;
  yearFrom: string;
  yearTo: string;
  /** '' | 'week' | 'month' | '3months' | 'year' */
  dateAdded: string;
}

const DATE_ADDED_DAYS: Record<string, number> = {
  week: 7,
  month: 30,
  '3months': 90,
  year: 365,
};

function parseYear(value: string): number | undefined {
  const trimmed = value.trim();
  if (!/^\d{1,4}$/.test(trimmed)) return undefined;
  const year = parseInt(trimmed, 10);
  return year >= 1 ? year : undefined;
}

/**
 * Map Collection filters to crate rules:
 * format → format anyOf [x]; yearFrom/yearTo → pressingYear between;
 * dateAdded week|month|3months|year → dateAdded withinDays 7|30|90|365.
 * Empty or unparseable filters produce no rule. A reversed year range is
 * swapped (Collection would show nothing; the crate keeps the intent).
 */
export function collectionFiltersToCrateRules(
  filters: CollectionCrateFilters,
  makeId: () => string = newRuleId
): CrateRule[] {
  const rules: CrateRule[] = [];

  const format = filters.format.trim();
  if (format) {
    rules.push({
      id: makeId(),
      field: 'format',
      op: 'anyOf',
      values: [format],
    });
  }

  let from = parseYear(filters.yearFrom);
  let to = parseYear(filters.yearTo);
  if (from !== undefined && to !== undefined && from > to) {
    [from, to] = [to, from];
  }
  if (from !== undefined || to !== undefined) {
    rules.push({
      id: makeId(),
      field: 'pressingYear',
      op: 'between',
      ...(from !== undefined ? { from } : {}),
      ...(to !== undefined ? { to } : {}),
      // Collection keeps releases with no year under an upper-only bound
      // (year 0 <= to), so the crate does too
      ...(from === undefined ? { ifUnknown: 'include' as const } : {}),
    });
  }

  const days = DATE_ADDED_DAYS[filters.dateAdded];
  if (days !== undefined) {
    rules.push({ id: makeId(), field: 'dateAdded', op: 'withinDays', days });
  }

  return rules;
}

const STORAGE_KEY = 'crates.pendingRulesFromCollection';

/** Stash rules for the crate editor; false when storage is unavailable */
export function stashCrateRulesFromCollection(rules: CrateRule[]): boolean {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
    return true;
  } catch {
    return false;
  }
}

/**
 * Rules stashed by the Collection page; [] when none. Not cleared on read, so
 * a re-render (or StrictMode's double render) sees the same rules; the next
 * "Save as crate" overwrites them.
 */
export function readCrateRulesFromCollection(): CrateRule[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (rule): rule is CrateRule =>
        typeof rule === 'object' &&
        rule !== null &&
        typeof (rule as { id?: unknown }).id === 'string' &&
        typeof (rule as { field?: unknown }).field === 'string'
    );
  } catch {
    return [];
  }
}
