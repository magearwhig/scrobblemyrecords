/**
 * Suggested crates (plan section 10): mine candidate crates from the album
 * table with six recipes, filter them, score them and pick a small batch by
 * deterministic least-recently-shown rotation. The daily batch and the
 * suggestion records (impressions, tombstones) live in
 * collections/crate-suggestions.json.
 *
 * The pure functions (mineCandidates, evaluateCandidate, filterCandidates,
 * scoreCandidate, selectBatch) take everything they need as arguments; the
 * service owns the file and the clock. There is no randomness.
 */

import { CRATE_TEMPLATES } from '../../shared/crateTemplates';
import {
  Crate,
  CrateRule,
  CrateSort,
  CrateSuggestion,
  CrateSuggestionBatch,
  CrateSuggestionRecipe,
  CrateSuggestionRecord,
  CrateSuggestionsResponse,
  CrateSuggestionStore,
} from '../../shared/types';
import { stripDiscogsSuffix } from '../../shared/utils/albumMapping';
import {
  CrateSuggestionCopyInput,
  formatSuggestionDescription,
  formatSuggestionName,
  formatSuggestionReason,
} from '../../shared/utils/crateReasons';
import { normalizeForMatching } from '../../shared/utils/trackNormalization';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

import { evaluateCrate } from './crateEvaluator';
import { CrateSuggestionHook } from './crateService';
import {
  CrateAlbumTable,
  CrateEvalContext,
  CrateReleaseFacts,
  CrateTableAlbum,
  CrateTableCopy,
} from './crateTableTypes';

export const CRATE_SUGGESTIONS_FILE = 'collections/crate-suggestions.json';

export const SUGGESTION_MIN_SIZE = 5;
export const SUGGESTION_MAX_SIZE = 60;
export const SUGGESTION_BATCH_SIZE = 3;
/** Most candidates one recipe yields */
export const SUGGESTION_RECIPE_CAP = 8;
/** Most candidates evaluated per mining pass */
export const SUGGESTION_TOTAL_CAP = 40;
/** Jaccard overlap at which two member sets count as the same crate */
export const SUGGESTION_OVERLAP_LIMIT = 0.7;
/** Overlap below which two picks in one batch count as diverse */
const DIVERSITY_OVERLAP = 0.5;
/** Mined candidates needed before templates stay out of the pool */
const FALLBACK_THRESHOLD = 3;
/** Active records unseen for longer than this are pruned */
const PRUNE_AFTER_DAYS = 365;
/** Style recipe prefilter minimum (plan section 10.1) */
const STYLE_MIN_ALBUMS = 8;
const QUIET_DAYS = 365;
const TOP_PERCENT = 20;
const TOP_QUIET_WINDOWS = [365, 730];
const ADDED_QUIET_WINDOWS = [90, 180];
const SHORT_MINUTES = 40;
const MAX_KEY_PARAM_LENGTH = 100;
const SAMPLE_COVERS = 4;

const DAY_MS = 24 * 60 * 60 * 1000;

const DISCARD_RULE: CrateRule = {
  id: 'discard',
  field: 'discardPile',
  op: 'exclude',
};

// ============================================
// Types
// ============================================

/** A parameterised crate a recipe (or a starter template) produced */
export interface CrateSuggestionCandidate {
  candidateKey: string;
  recipe: CrateSuggestionRecipe;
  /** Parameters for the reviewed copy (crateReasons) */
  copy: CrateSuggestionCopyInput;
  rules: CrateRule[];
  sort: CrateSort;
  /** For `template:` candidates */
  templateId?: string;
  /**
   * Prefilter count, which is also the signal denominator: owned albums with
   * the style / by the artist / pressed in the decade / in the top set /
   * added in the window / of the genre with a known runtime. 0 for templates.
   */
  pool: number;
  /** Prefilter count used for the per-recipe cap (defaults to `pool`) */
  prefilter?: number;
}

/** A candidate with its live evaluation (no overrides) and relevance */
export interface EvaluatedCandidate extends CrateSuggestionCandidate {
  count: number;
  memberKeys: Set<string>;
  sampleCovers: string[];
  /** Members with no scrobbles in the last 365 days (artist signal) */
  quietCount: number;
  hasHistory: boolean;
  relevance: number;
}

/** An existing crate's current members (its evaluation, overrides included) */
export interface ExistingCrateMembers {
  crate: Pick<Crate, 'id' | 'templateId' | 'sourceSuggestionKey'>;
  memberKeys: Set<string>;
}

export interface SelectBatchOptions {
  batchSize: number;
  /** Keys that may not be picked (previous day's batch, or shown today) */
  exclude: Iterable<string>;
  /** Daily batch only: serve excluded candidates when nothing else is left */
  allowExcludedFallback: boolean;
  /** Already in the batch; used only to prefer diverse picks (backfill) */
  alreadyPicked?: EvaluatedCandidate[];
}

/** What the service needs from CrateService */
export interface CrateSuggestionSource {
  getTable(): Promise<CrateAlbumTable>;
  getContext(
    crates: Array<{ rules: CrateRule[]; sort: CrateSort }>
  ): Promise<CrateEvalContext>;
  listCrates(): Promise<Crate[]>;
}

// ============================================
// Helpers
// ============================================

/** Local YYYY-MM-DD */
export function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Whole days from one YYYY-MM-DD to another */
function daysBetween(from: string, to: string): number {
  const utc = (day: string) => {
    const [y, m, d] = day.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(to) - utc(from)) / DAY_MS);
}

/** Key parameter: normalised, no slashes (the key travels in a URL path) */
function keyParam(value: string): string {
  return normalizeForMatching(value)
    .replace(/\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_KEY_PARAM_LENGTH)
    .trim();
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let shared = 0;
  for (const key of small) if (large.has(key)) shared++;
  return shared / (a.size + b.size - shared);
}

const compareKeys = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Relevance descending, then candidateKey ascending */
const byRelevance = (a: EvaluatedCandidate, b: EvaluatedCandidate) =>
  b.relevance - a.relevance || compareKeys(a.candidateKey, b.candidateKey);

/** Copies a rule with `discardPile exclude` can be witnessed by */
const keptCopies = (album: CrateTableAlbum) =>
  album.copies.filter(copy => !copy.inDiscardPile);

/**
 * Count albums per group value. `valuesOf` lists a copy's values; an album
 * counts once per value any kept copy has. Values are grouped the way the
 * evaluator compares them (lowercase, trimmed); the first spelling seen is
 * kept for display and for the rule.
 */
function countGroups(
  albums: CrateTableAlbum[],
  valuesOf: (copy: CrateTableCopy) => string[] | undefined
): Map<string, { label: string; count: number }> {
  const groups = new Map<string, { label: string; count: number }>();
  for (const album of albums) {
    const seen = new Set<string>();
    for (const copy of keptCopies(album)) {
      for (const value of valuesOf(copy) ?? []) {
        const id = value.toLowerCase().trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const group = groups.get(id);
        if (group) group.count++;
        else groups.set(id, { label: value.trim(), count: 1 });
      }
    }
  }
  return groups;
}

const rank = (c: CrateSuggestionCandidate) => c.prefilter ?? c.pool;

/** Largest prefilter count first, then key; at most the recipe cap */
function capRecipe(
  candidates: CrateSuggestionCandidate[]
): CrateSuggestionCandidate[] {
  // Two groups normalising to one key: keep the larger
  const byKey = new Map<string, CrateSuggestionCandidate>();
  for (const candidate of candidates) {
    const existing = byKey.get(candidate.candidateKey);
    if (!existing || rank(candidate) > rank(existing)) {
      byKey.set(candidate.candidateKey, candidate);
    }
  }
  return [...byKey.values()]
    .sort(
      (a, b) => rank(b) - rank(a) || compareKeys(a.candidateKey, b.candidateKey)
    )
    .slice(0, SUGGESTION_RECIPE_CAP);
}

// ============================================
// Mining (plan section 10.1)
// ============================================

/**
 * Mine candidates from the album table with the six recipes. Prefilters are
 * cheap counts; the size filter on the evaluated count decides. Recipes with
 * a listening rule are skipped when there is no history index.
 */
export function mineCandidates(
  table: CrateAlbumTable,
  facts: Map<number, CrateReleaseFacts>,
  now: Date
): CrateSuggestionCandidate[] {
  const albums = table.albums;
  const recipes: CrateSuggestionCandidate[][] = [];

  // Quiet style: styles with >= 8 owned albums
  if (table.hasHistory) {
    const styles = countGroups(albums, c => facts.get(c.releaseId)?.styles);
    const candidates: CrateSuggestionCandidate[] = [];
    for (const { label, count } of styles.values()) {
      const param = keyParam(label);
      if (count < Math.max(STYLE_MIN_ALBUMS, SUGGESTION_MIN_SIZE) || !param) {
        continue;
      }
      candidates.push({
        candidateKey: `style-quiet:${param}`,
        recipe: 'style-quiet',
        copy: { recipe: 'style-quiet', style: label, days: QUIET_DAYS },
        rules: [
          { id: 'style', field: 'style', op: 'anyOf', values: [label] },
          {
            id: 'quiet',
            field: 'scrobblesInPeriod',
            period: { kind: 'lastDays', days: QUIET_DAYS },
            op: 'none',
          },
          DISCARD_RULE,
        ],
        sort: 'lastPlayedAsc',
        pool: count,
      });
    }
    recipes.push(capRecipe(candidates));
  }

  // Artist shelf: resolved artists with >= 5 owned albums
  {
    const artists = new Map<
      string,
      { ruleValue: string; display: string; count: number }
    >();
    for (const album of albums) {
      const seen = new Set<string>();
      for (const copy of keptCopies(album)) {
        const id = copy.resolvedArtist.toLowerCase().trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const group = artists.get(id);
        if (group) group.count++;
        else {
          artists.set(id, {
            // The evaluator resolves rule values the way the table resolved
            // the copy's artist, so the copy's own name always matches
            ruleValue: copy.artist,
            display: stripDiscogsSuffix(copy.resolvedArtist).trim(),
            count: 1,
          });
        }
      }
    }
    const candidates: CrateSuggestionCandidate[] = [];
    for (const { ruleValue, display, count } of artists.values()) {
      const param = keyParam(display);
      if (count < SUGGESTION_MIN_SIZE || !param) continue;
      candidates.push({
        candidateKey: `artist:${param}`,
        recipe: 'artist',
        copy: { recipe: 'artist', artist: display },
        rules: [
          { id: 'artist', field: 'artist', op: 'anyOf', values: [ruleValue] },
          DISCARD_RULE,
        ],
        sort: 'lastPlayedAsc',
        pool: count,
      });
    }
    recipes.push(capRecipe(candidates));
  }

  // Quiet decade: pressing-year decades with >= 5 owned albums
  if (table.hasHistory) {
    const decades = countGroups(albums, c =>
      c.year !== undefined ? [String(Math.floor(c.year / 10) * 10)] : undefined
    );
    const candidates: CrateSuggestionCandidate[] = [];
    for (const { label, count } of decades.values()) {
      if (count < SUGGESTION_MIN_SIZE) continue;
      const decade = Number(label);
      candidates.push({
        candidateKey: `decade-quiet:${decade}`,
        recipe: 'decade-quiet',
        copy: { recipe: 'decade-quiet', decade, days: QUIET_DAYS },
        rules: [
          {
            id: 'decade',
            field: 'pressingYear',
            op: 'between',
            from: decade,
            to: decade + 9,
          },
          {
            id: 'quiet',
            field: 'lastRecordedPlay',
            op: 'olderThanDays',
            days: QUIET_DAYS,
            includeNoRecordedPlays: true,
          },
          DISCARD_RULE,
        ],
        sort: 'scrobblesAsc',
        pool: count,
      });
    }
    recipes.push(capRecipe(candidates));
  }

  // Top albums gone quiet: the top-20% set has >= 5 albums
  if (table.hasHistory) {
    const cutoff = Math.ceil((table.totalAlbums * TOP_PERCENT) / 100);
    const topSet = albums.filter(
      a =>
        a.scrobbleRank !== undefined &&
        a.scrobbleRank <= cutoff &&
        keptCopies(a).length > 0
    ).length;
    if (topSet >= SUGGESTION_MIN_SIZE) {
      recipes.push(
        capRecipe(
          TOP_QUIET_WINDOWS.map(days => ({
            candidateKey: `top-quiet:${days}`,
            recipe: 'top-quiet',
            copy: { recipe: 'top-quiet', percent: TOP_PERCENT, days },
            rules: [
              {
                id: 'top',
                field: 'scrobbleCount',
                op: 'topPercent',
                percent: TOP_PERCENT,
              },
              {
                id: 'quiet',
                field: 'lastRecordedPlay',
                op: 'olderThanDays',
                days,
                includeNoRecordedPlays: false,
              },
              DISCARD_RULE,
            ],
            sort: 'scrobblesDesc',
            pool: topSet,
          }))
        )
      );
    }
  }

  // Added, no scrobbles since: windows 90 and 180 days
  if (table.hasHistory) {
    const candidates: CrateSuggestionCandidate[] = [];
    for (const days of ADDED_QUIET_WINDOWS) {
      const since = now.getTime() - days * DAY_MS;
      const added = albums.filter(a =>
        keptCopies(a).some(c => c.dateAddedMs >= since)
      ).length;
      if (added < SUGGESTION_MIN_SIZE) continue;
      candidates.push({
        candidateKey: `added-quiet:${days}`,
        recipe: 'added-quiet',
        copy: { recipe: 'added-quiet', days },
        rules: [
          { id: 'added', field: 'dateAdded', op: 'withinDays', days },
          { id: 'since', field: 'playsSinceAdded', op: 'none' },
          DISCARD_RULE,
        ],
        sort: 'dateAddedDesc',
        pool: added,
      });
    }
    recipes.push(capRecipe(candidates));
  }

  // Short records: genres with >= 5 owned albums of known runtime <= 40 min
  {
    const timed = countGroups(albums, c => {
      const f = facts.get(c.releaseId);
      return f?.runtime?.complete ? f.genres : undefined;
    });
    const short = countGroups(albums, c => {
      const f = facts.get(c.releaseId);
      return f?.runtime?.complete &&
        f.runtime.knownSeconds <= SHORT_MINUTES * 60
        ? f.genres
        : undefined;
    });
    const candidates: CrateSuggestionCandidate[] = [];
    for (const [id, { label, count }] of short) {
      const param = keyParam(label);
      if (count < SUGGESTION_MIN_SIZE || !param) continue;
      candidates.push({
        candidateKey: `short:${param}:${SHORT_MINUTES}`,
        recipe: 'short',
        copy: { recipe: 'short', genre: label, minutes: SHORT_MINUTES },
        rules: [
          { id: 'genre', field: 'genre', op: 'anyOf', values: [label] },
          {
            id: 'runtime',
            field: 'runtime',
            op: 'atMost',
            minutes: SHORT_MINUTES,
            ifUnknown: 'exclude',
          },
          DISCARD_RULE,
        ],
        sort: 'runtimeAsc',
        // Signal denominator: the genre's albums with a known runtime
        pool: timed.get(id)?.count ?? count,
        prefilter: count,
      });
    }
    recipes.push(capRecipe(candidates));
  }

  return recipes.flat().slice(0, SUGGESTION_TOTAL_CAP);
}

/** Starter templates as fallback candidates (`template:<id>`) */
export function templateCandidates(): CrateSuggestionCandidate[] {
  return CRATE_TEMPLATES.map(template => ({
    candidateKey: `template:${keyParam(template.id)}`,
    recipe: 'template' as const,
    copy: { recipe: 'template' as const, templateId: template.id },
    rules: template.rules,
    sort: template.sort,
    templateId: template.id,
    pool: 0,
  }));
}

// ============================================
// Scoring (plan section 10.3)
// ============================================

/** 0.5 at n = 5, 1 for 10..30, 0.5 at n = 60 (linear in between) */
export function sizeFit(n: number): number {
  if (n >= 10 && n <= 30) return 1;
  if (n < 10) {
    return Math.max(0, 0.5 + (0.5 * (n - SUGGESTION_MIN_SIZE)) / 5);
  }
  return Math.max(0, 1 - (0.5 * (n - 30)) / 30);
}

/**
 * Relevance in 0..1: 0.5 × sizeFit(count) + 0.5 × signal, where the signal
 * is a share with a real denominator from the album table.
 */
export function scoreCandidate(input: {
  recipe: CrateSuggestionRecipe;
  count: number;
  pool: number;
  quietCount: number;
  hasHistory: boolean;
}): number {
  const { recipe, count, pool, quietCount, hasHistory } = input;
  const share = (part: number, whole: number) =>
    whole > 0 ? Math.min(1, Math.max(0, part / whole)) : 0;
  let signal: number;
  switch (recipe) {
    case 'artist':
      // With no history nothing is known to be quiet
      signal = hasHistory ? share(quietCount, count) : 0;
      break;
    case 'template':
      signal = 0.5;
      break;
    default:
      signal = share(count, pool);
  }
  return 0.5 * sizeFit(count) + 0.5 * signal;
}

/** Evaluate a candidate on the table with no overrides, and score it */
export function evaluateCandidate(
  candidate: CrateSuggestionCandidate,
  ctx: CrateEvalContext
): EvaluatedCandidate {
  const evaluation = evaluateCrate(
    { id: null, rules: candidate.rules, overrides: [], sort: candidate.sort },
    ctx
  );
  const quietBefore = (ctx.now.getTime() - QUIET_DAYS * DAY_MS) / 1000;
  const quietCount = evaluation.albums.filter(
    a => a.listening.lastPlayed === null || a.listening.lastPlayed < quietBefore
  ).length;
  const count = evaluation.albums.length;
  const hasHistory = ctx.table.hasHistory;
  return {
    ...candidate,
    count,
    memberKeys: new Set(evaluation.albums.map(a => a.albumKey)),
    sampleCovers: evaluation.albums
      .map(a => a.coverUrl)
      .filter((url): url is string => !!url)
      .slice(0, SAMPLE_COVERS),
    quietCount,
    hasHistory,
    relevance: scoreCandidate({
      recipe: candidate.recipe,
      count,
      pool: candidate.pool,
      quietCount,
      hasHistory,
    }),
  };
}

// ============================================
// Filtering (plan section 10.2)
// ============================================

/**
 * Keep only useful candidates, in the plan's order: size bounds, tombstones,
 * already a crate (sourceSuggestionKey or templateId), overlap >= 0.7 with
 * an existing crate's current members, and near-duplicates in the pool
 * (higher relevance, then lower key, wins).
 */
export function filterCandidates(
  candidates: EvaluatedCandidate[],
  crates: ExistingCrateMembers[],
  records: CrateSuggestionRecord[]
): EvaluatedCandidate[] {
  const tombstoned = new Set(
    records.filter(r => r.status !== 'active').map(r => r.candidateKey)
  );
  const usedKeys = new Set(
    crates.map(c => c.crate.sourceSuggestionKey).filter((k): k is string => !!k)
  );
  const usedTemplates = new Set(
    crates.map(c => c.crate.templateId).filter((t): t is string => !!t)
  );

  const survivors = candidates.filter(
    c =>
      c.count >= SUGGESTION_MIN_SIZE &&
      c.count <= SUGGESTION_MAX_SIZE &&
      !tombstoned.has(c.candidateKey) &&
      !usedKeys.has(c.candidateKey) &&
      !(c.templateId && usedTemplates.has(c.templateId)) &&
      !crates.some(
        existing =>
          jaccard(c.memberKeys, existing.memberKeys) >= SUGGESTION_OVERLAP_LIMIT
      )
  );

  const kept: EvaluatedCandidate[] = [];
  for (const candidate of [...survivors].sort(byRelevance)) {
    if (
      kept.every(
        other =>
          jaccard(candidate.memberKeys, other.memberKeys) <
          SUGGESTION_OVERLAP_LIMIT
      )
    ) {
      kept.push(candidate);
    }
  }
  return kept;
}

/**
 * The eligible set: filtered mined candidates, plus the starter templates
 * (through the same filters) when fewer than 3 mined candidates survive
 */
export function eligibleCandidates(
  mined: EvaluatedCandidate[],
  templates: EvaluatedCandidate[],
  crates: ExistingCrateMembers[],
  records: CrateSuggestionRecord[]
): EvaluatedCandidate[] {
  const eligible = filterCandidates(mined, crates, records);
  if (eligible.length >= FALLBACK_THRESHOLD) return eligible;
  return filterCandidates([...mined, ...templates], crates, records);
}

// ============================================
// Selection (plan section 10.3)
// ============================================

/**
 * Pick a batch: remove the excluded keys, group the rest into tiers by
 * lastShownDay (never shown first, then oldest), and fill tier by tier.
 * Inside a tier, prefer by relevance a candidate whose recipe is not yet in
 * the batch and that overlaps every pick by < 0.5. A short batch shrinks; it
 * is refilled from the excluded keys only for the daily batch when nothing
 * else is eligible.
 */
export function selectBatch(
  eligible: EvaluatedCandidate[],
  records: CrateSuggestionRecord[],
  options: SelectBatchOptions
): EvaluatedCandidate[] {
  const exclude = new Set(options.exclude);
  let remaining = eligible.filter(c => !exclude.has(c.candidateKey));
  if (remaining.length === 0 && options.allowExcludedFallback) {
    remaining = [...eligible];
  }

  const lastShown = new Map(
    records.map(r => [r.candidateKey, r.lastShownDay ?? ''])
  );
  const tiers = new Map<string, EvaluatedCandidate[]>();
  for (const candidate of remaining) {
    const day = lastShown.get(candidate.candidateKey) ?? '';
    const tier = tiers.get(day) ?? [];
    tier.push(candidate);
    tiers.set(day, tier);
  }

  const picked: EvaluatedCandidate[] = [];
  const context = [...(options.alreadyPicked ?? [])];
  for (const day of [...tiers.keys()].sort(compareKeys)) {
    const tier = tiers.get(day)!.sort(byRelevance);
    while (picked.length < options.batchSize && tier.length > 0) {
      const all = [...context, ...picked];
      const recipes = new Set(all.map(c => c.recipe));
      let index = tier.findIndex(
        c =>
          !recipes.has(c.recipe) &&
          all.every(
            p => jaccard(c.memberKeys, p.memberKeys) < DIVERSITY_OVERLAP
          )
      );
      if (index === -1) index = 0;
      picked.push(tier.splice(index, 1)[0]);
    }
    if (picked.length >= options.batchSize) break;
  }
  return picked;
}

/** The card sent to the client; all copy comes from crateReasons */
export function toSuggestion(candidate: EvaluatedCandidate): CrateSuggestion {
  const counts =
    candidate.recipe === 'artist'
      ? { pool: candidate.count, count: candidate.quietCount }
      : { pool: candidate.pool, count: candidate.count };
  return {
    candidateKey: candidate.candidateKey,
    recipe: candidate.recipe,
    name: formatSuggestionName(candidate.copy),
    description: formatSuggestionDescription(candidate.copy),
    reason: formatSuggestionReason(candidate.copy, {
      ...counts,
      hasHistory: candidate.hasHistory,
    }),
    rules: candidate.rules,
    sort: candidate.sort,
    count: candidate.count,
    sampleCovers: candidate.sampleCovers,
  };
}

// ============================================
// Service
// ============================================

/** Mined once per table fingerprint and local day; evaluated on every read */
interface CandidatePool {
  ctx: CrateEvalContext;
  mined: CrateSuggestionCandidate[];
  templates: CrateSuggestionCandidate[];
}

type Mode = 'read' | 'reroll';

export class CrateSuggestionService implements CrateSuggestionHook {
  private logger = createLogger('CrateSuggestionService');
  private store: Promise<CrateSuggestionStore> | null = null;
  private writeQueue: Promise<unknown> = Promise.resolve();
  private pool: { key: string; value: Promise<CandidatePool> } | null = null;

  constructor(
    private fileStorage: Pick<FileStorage, 'readJSON' | 'writeJSONWithBackup'>,
    private source: CrateSuggestionSource,
    private now: () => Date = () => new Date()
  ) {}

  // ---- Store ----

  private loadStore(): Promise<CrateSuggestionStore> {
    this.store ??= this.readStoreFile();
    return this.store;
  }

  private async readStoreFile(): Promise<CrateSuggestionStore> {
    try {
      const data = await this.fileStorage.readJSON<CrateSuggestionStore>(
        CRATE_SUGGESTIONS_FILE
      );
      if (data && data.schemaVersion === 1 && Array.isArray(data.records)) {
        return data;
      }
    } catch {
      this.logger.debug('No crate suggestions file found, creating new store');
    }
    return { schemaVersion: 1, records: [] };
  }

  /**
   * Run a change against a copy of the store, one at a time, and save it
   * only when the change reports that something changed
   */
  private update<T>(
    change: (store: CrateSuggestionStore) => { result: T; changed: boolean }
  ): Promise<T> {
    const run = this.writeQueue.then(async () => {
      const store = await this.loadStore();
      const draft: CrateSuggestionStore = {
        schemaVersion: 1,
        records: store.records.map(r => ({ ...r })),
        ...(store.batch
          ? {
              batch: {
                ...store.batch,
                keys: [...store.batch.keys],
                shownToday: [...store.batch.shownToday],
                previousKeys: [...store.batch.previousKeys],
              },
            }
          : {}),
      };
      const { result, changed } = change(draft);
      if (changed) {
        await this.fileStorage.writeJSONWithBackup(
          CRATE_SUGGESTIONS_FILE,
          draft
        );
        this.store = Promise.resolve(draft);
      }
      return result;
    });
    this.writeQueue = run.catch(() => undefined);
    return run;
  }

  /** Drop the cached store so it is re-read (e.g. after a backup import) */
  reload(): Promise<void> {
    const run = this.writeQueue.then(() => {
      this.store = null;
    });
    this.writeQueue = run;
    return run;
  }

  // ---- Candidate pool (memoised per table fingerprint and local day) ----

  private async getPool(
    table: CrateAlbumTable,
    day: string
  ): Promise<CandidatePool> {
    const key = `${table.fingerprint}\n${day}`;
    if (this.pool?.key === key) return this.pool.value;
    const value = this.buildPool().catch(error => {
      if (this.pool?.key === key) this.pool = null;
      throw error;
    });
    this.pool = { key, value };
    return value;
  }

  private async buildPool(): Promise<CandidatePool> {
    // Sorting by runtime makes getContext load release facts for every
    // release, which the style and short recipes need
    const ctx = await this.source.getContext([
      { rules: [], sort: 'runtimeAsc' },
    ]);
    const mined = mineCandidates(ctx.table, ctx.facts, ctx.now);
    return { ctx, mined, templates: templateCandidates() };
  }

  private async existingCrates(
    ctx: CrateEvalContext
  ): Promise<ExistingCrateMembers[]> {
    const crates = await this.source.listCrates();
    return crates.map(crate => ({
      crate,
      memberKeys: new Set(
        evaluateCrate(crate, ctx).albums.map(a => a.albumKey)
      ),
    }));
  }

  /** Everything a read needs, or null while the collection is loading */
  private async prepare(): Promise<{
    mined: EvaluatedCandidate[];
    templates: EvaluatedCandidate[];
    crates: ExistingCrateMembers[];
    day: string;
  } | null> {
    const table = await this.source.getTable();
    if (!table.collection.complete) return null;
    const now = this.now();
    const day = localDay(now);
    const pool = await this.getPool(table, day);
    if (!pool.ctx.table.collection.complete) return null;
    // Candidates are mined once a day, but counts are always live: evaluate
    // them (and the user's crates) against the current time on every read
    const ctx: CrateEvalContext = { ...pool.ctx, now };
    return {
      mined: pool.mined.map(c => evaluateCandidate(c, ctx)),
      templates: pool.templates.map(c => evaluateCandidate(c, ctx)),
      crates: await this.existingCrates(ctx),
      day,
    };
  }

  // ---- Public API ----

  /** Today's batch (built on the first request of a local day) */
  async getSuggestions(
    limit = SUGGESTION_BATCH_SIZE
  ): Promise<CrateSuggestionsResponse> {
    const response = await this.serve('read');
    return { ...response, suggestions: response.suggestions.slice(0, limit) };
  }

  /** A new batch sharing nothing with anything shown today */
  reroll(): Promise<CrateSuggestionsResponse> {
    return this.serve('reroll');
  }

  /** "Not interested": a permanent tombstone; returns the backfilled batch */
  async dismiss(candidateKey: string): Promise<CrateSuggestionsResponse> {
    await this.update(store => {
      const timestamp = this.now().getTime();
      const record = this.recordFor(store, candidateKey);
      if (record.status === 'active') {
        record.status = 'dismissed';
        record.dismissedAt = timestamp;
        record.updatedAt = timestamp;
        return { result: undefined, changed: true };
      }
      return { result: undefined, changed: false };
    });
    return this.serve('read');
  }

  /** The crate was created from this suggestion: a permanent tombstone */
  async markAdded(candidateKey: string, crateId: string): Promise<void> {
    await this.update(store => {
      const timestamp = this.now().getTime();
      const record = this.recordFor(store, candidateKey);
      if (record.status === 'added')
        return { result: undefined, changed: false };
      record.status = 'added';
      record.addedAt = timestamp;
      record.addedCrateId = crateId;
      record.updatedAt = timestamp;
      return { result: undefined, changed: true };
    });
  }

  /** "Reset suggestion history": forget every record and the batch */
  async resetHistory(): Promise<CrateSuggestionsResponse> {
    await this.update(store => {
      store.records = [];
      delete store.batch;
      return { result: undefined, changed: true };
    });
    return this.serve('read');
  }

  // ---- Internals ----

  private recordFor(
    store: CrateSuggestionStore,
    candidateKey: string
  ): CrateSuggestionRecord {
    let record = store.records.find(r => r.candidateKey === candidateKey);
    if (!record) {
      record = {
        candidateKey,
        status: 'active',
        daysShown: 0,
        updatedAt: this.now().getTime(),
      };
      store.records.push(record);
    }
    return record;
  }

  private async serve(mode: Mode): Promise<CrateSuggestionsResponse> {
    const prepared = await this.prepare();
    if (!prepared) {
      return { suggestions: [], exhausted: false, reason: 'collectionLoading' };
    }
    const { mined, templates, crates, day } = prepared;
    const timestamp = this.now().getTime();

    return this.update<CrateSuggestionsResponse>(store => {
      let changed = this.prune(store, day);
      const eligible = eligibleCandidates(
        mined,
        templates,
        crates,
        store.records
      );
      const byKey = new Map(eligible.map(c => [c.candidateKey, c]));
      const show = (keys: string[]) => {
        for (const key of keys) {
          const record = this.recordFor(store, key);
          if (record.lastShownDay === day) continue;
          record.lastShownDay = day;
          record.daysShown += 1;
          record.updatedAt = timestamp;
        }
      };

      let batch: CrateSuggestionBatch;
      // A reroll as the first request of a day just serves the new day's
      // batch: nothing of today has been shown yet
      let builtToday = false;
      if (!store.batch || store.batch.day !== day) {
        builtToday = true;
        // First request of the day
        const previousKeys = store.batch?.keys ?? [];
        const keys = selectBatch(eligible, store.records, {
          batchSize: SUGGESTION_BATCH_SIZE,
          exclude: previousKeys,
          allowExcludedFallback: true,
        }).map(c => c.candidateKey);
        batch = { day, keys, shownToday: [...keys], previousKeys };
        store.batch = batch;
        show(keys);
        changed = true;
      } else {
        // Revalidate today's batch; backfill what dropped out
        batch = store.batch;
        const kept = batch.keys.filter(key => byKey.has(key));
        const dropped = batch.keys.length - kept.length;
        if (dropped > 0 && mode === 'reroll') {
          // The reroll replaces the batch anyway; a backfill the client
          // never sees must not count as shown
          batch.keys = kept;
          changed = true;
        } else if (dropped > 0) {
          const backfill = selectBatch(eligible, store.records, {
            batchSize: dropped,
            exclude: [...batch.shownToday, ...batch.previousKeys, ...kept],
            allowExcludedFallback: false,
            alreadyPicked: kept.map(key => byKey.get(key)!),
          }).map(c => c.candidateKey);
          batch.keys = [...kept, ...backfill];
          batch.shownToday = [...new Set([...batch.shownToday, ...backfill])];
          show(backfill);
          changed = true;
        }
      }

      let exhausted = false;
      if (mode === 'reroll' && !builtToday) {
        const keys = selectBatch(eligible, store.records, {
          batchSize: SUGGESTION_BATCH_SIZE,
          exclude: batch.shownToday,
          allowExcludedFallback: false,
        }).map(c => c.candidateKey);
        if (keys.length === 0) {
          // Keep today's cards; the client says that's all for today
          return {
            result: {
              suggestions: [],
              exhausted: true,
              ...(eligible.length === 0
                ? { reason: 'noCandidates' as const }
                : {}),
            },
            changed,
          };
        }
        batch.keys = keys;
        batch.shownToday = [...batch.shownToday, ...keys];
        show(keys);
        changed = true;
      }

      const suggestions = batch.keys
        .map(key => byKey.get(key))
        .filter((c): c is EvaluatedCandidate => !!c)
        .map(toSuggestion);
      if (eligible.length === 0) {
        return {
          result: { suggestions, exhausted: false, reason: 'noCandidates' },
          changed,
        };
      }
      if (suggestions.length === 0) exhausted = true;
      return { result: { suggestions, exhausted }, changed };
    });
  }

  /** Active records unseen for over a year look "never shown" again */
  private prune(store: CrateSuggestionStore, day: string): boolean {
    const before = store.records.length;
    store.records = store.records.filter(
      r =>
        r.status !== 'active' ||
        !r.lastShownDay ||
        daysBetween(r.lastShownDay, day) <= PRUNE_AFTER_DAYS
    );
    return store.records.length !== before;
  }
}
