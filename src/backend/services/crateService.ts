/**
 * Crate Service - saved, rule-based groups of owned albums (Smart Crates).
 *
 * Crates are stored in collections/crates.json and evaluated on read against
 * the album table (see crateAlbumTable.ts). Nothing about membership is
 * persisted. See .plan/done/smart-crates-plan.md.
 */

import crypto from 'crypto';

import {
  CRATE_MAX_RULES,
  CRATE_NAME_MAX_LENGTH,
  CRATE_SORTS,
} from '../../shared/crateTemplates';
import {
  Crate,
  CrateEvaluation,
  CrateInput,
  CrateOverride,
  CratePatch,
  CrateRule,
  CrateSort,
  CratesStore,
  CrateSummary,
} from '../../shared/types';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

import { CrateAlbumTableBuilder } from './crateAlbumTable';
import {
  crateNeedsFacts,
  evaluateCrate,
  validateCrateRules,
} from './crateEvaluator';
import { CrateAlbumTable, CrateEvalContext } from './crateTableTypes';

export const CRATES_FILE = 'collections/crates.json';

const MAX_OVERRIDE_RELEASE_IDS = 50;
const MAX_DESCRIPTION_LENGTH = 500;

/** An error with the HTTP status a route should answer with */
export class CrateError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 401 | 404 | 409,
    public readonly details?: string[]
  ) {
    super(message);
    this.name = 'CrateError';
  }
}

/** Notified when a crate is created from a suggestion */
export interface CrateSuggestionHook {
  markAdded(candidateKey: string, crateId: string): Promise<void>;
}

export class CrateService {
  private logger = createLogger('CrateService');
  private store: Promise<CratesStore> | null = null;
  private writeQueue: Promise<unknown> = Promise.resolve();
  private suggestionHook: CrateSuggestionHook | null = null;

  constructor(
    private fileStorage: FileStorage,
    private tableBuilder: CrateAlbumTableBuilder,
    private authService: {
      getUserSettings(): Promise<{ discogs: { username?: string } }>;
    },
    private now: () => Date = () => new Date()
  ) {}

  setSuggestionHook(hook: CrateSuggestionHook): void {
    this.suggestionHook = hook;
  }

  // ============================================
  // Store
  // ============================================

  // The cache holds the load promise, so concurrent readers share one read
  // and a slow first read can never replace a newer saved store
  private loadStore(): Promise<CratesStore> {
    this.store ??= this.readStoreFile();
    return this.store;
  }

  private async readStoreFile(): Promise<CratesStore> {
    try {
      const data = await this.fileStorage.readJSON<CratesStore>(CRATES_FILE);
      if (data && data.schemaVersion === 1 && Array.isArray(data.crates)) {
        return data;
      }
    } catch {
      this.logger.debug('No crates file found, creating new store');
    }
    return { schemaVersion: 1, crates: [] };
  }

  /** Apply a change to the store and save it, one write at a time */
  private update<T>(change: (store: CratesStore) => T): Promise<T> {
    const run = this.writeQueue.then(async () => {
      const store = await this.loadStore();
      const draft: CratesStore = {
        schemaVersion: 1,
        crates: store.crates.map(c => ({ ...c })),
      };
      const result = change(draft);
      await this.fileStorage.writeJSONWithBackup(CRATES_FILE, draft);
      this.store = Promise.resolve(draft);
      return result;
    });
    this.writeQueue = run.catch(() => undefined);
    return run;
  }

  /**
   * Drop the cached store so it is re-read (e.g. after a backup import).
   * Queued behind pending writes, so a write already waiting cannot save
   * its pre-restore copy after the reload.
   */
  reload(): Promise<void> {
    const run = this.writeQueue.then(() => {
      this.store = null;
    });
    this.writeQueue = run;
    return run;
  }

  /** Forget the album table so the next read rebuilds it */
  invalidate(): void {
    this.tableBuilder.invalidate();
  }

  // ============================================
  // CRUD
  // ============================================

  async listCrates(): Promise<Crate[]> {
    return (await this.loadStore()).crates;
  }

  async getCrate(id: string): Promise<Crate> {
    const crate = (await this.loadStore()).crates.find(c => c.id === id);
    if (!crate) throw new CrateError('Crate not found', 404);
    return crate;
  }

  async createCrate(input: CrateInput): Promise<Crate> {
    const name = this.validateName(input.name);
    const description = this.validateDescription(input.description);
    const rules = this.validateRules(input.rules);
    const sort = this.validateSort(input.sort ?? 'artist');

    const crate = await this.update(store => {
      this.assertNameFree(store, name);
      const timestamp = this.now().getTime();
      const created: Crate = {
        id: crypto.randomUUID(),
        name,
        ...(description ? { description } : {}),
        rules,
        overrides: [],
        sort,
        pinnedToWhatToPlay: input.pinnedToWhatToPlay === true,
        ...(input.templateId ? { templateId: input.templateId } : {}),
        ...(input.sourceSuggestionKey
          ? { sourceSuggestionKey: input.sourceSuggestionKey }
          : {}),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      store.crates.push(created);
      return created;
    });

    if (crate.sourceSuggestionKey && this.suggestionHook) {
      // The crate exists either way; a failed tombstone only means the
      // suggestion is hidden by the "already a crate" filter instead
      await this.suggestionHook
        .markAdded(crate.sourceSuggestionKey, crate.id)
        .catch(error =>
          this.logger.warn('Could not record the added suggestion', error)
        );
    }
    return crate;
  }

  async updateCrate(id: string, patch: CratePatch): Promise<Crate> {
    const changes: Partial<Crate> = {};
    if (patch.name !== undefined) changes.name = this.validateName(patch.name);
    if (patch.description !== undefined) {
      changes.description = this.validateDescription(patch.description);
    }
    if (patch.rules !== undefined) {
      changes.rules = this.validateRules(patch.rules);
    }
    if (patch.sort !== undefined) changes.sort = this.validateSort(patch.sort);
    if (patch.pinnedToWhatToPlay !== undefined) {
      changes.pinnedToWhatToPlay = patch.pinnedToWhatToPlay === true;
    }

    return this.update(store => {
      const index = store.crates.findIndex(c => c.id === id);
      if (index === -1) throw new CrateError('Crate not found', 404);
      if (changes.name !== undefined)
        this.assertNameFree(store, changes.name, id);
      const updated: Crate = {
        ...store.crates[index],
        ...changes,
        updatedAt: this.now().getTime(),
      };
      if (!updated.description) delete updated.description;
      store.crates[index] = updated;
      return updated;
    });
  }

  async deleteCrate(id: string): Promise<void> {
    await this.update(store => {
      const index = store.crates.findIndex(c => c.id === id);
      if (index === -1) throw new CrateError('Crate not found', 404);
      store.crates.splice(index, 1);
    });
  }

  // ============================================
  // Manual include / exclude
  // ============================================

  /**
   * Include or exclude an album by hand. `releaseIds` are the album's copies
   * as they are now. They are first removed from every existing override of
   * the crate, so after a mapping split the other half keeps its choice.
   */
  async setOverride(
    id: string,
    releaseIds: unknown,
    action: unknown
  ): Promise<Crate> {
    const ids = this.validateReleaseIds(releaseIds);
    if (action !== 'include' && action !== 'exclude') {
      throw new CrateError('action must be "include" or "exclude"', 400);
    }
    const table = await this.getTable();
    const album = table.albums.find(a =>
      a.copies.some(copy => ids.includes(copy.releaseId))
    );
    if (!album) {
      throw new CrateError(
        'None of these releases are in your collection',
        400
      );
    }

    // Cover every copy the album has now, so an earlier choice on another
    // copy of the same album can't outrank this one
    const groupIds = expandToAlbumCopies(table, ids);

    return this.update(store => {
      const crate = store.crates.find(c => c.id === id);
      if (!crate) throw new CrateError('Crate not found', 404);
      const override: CrateOverride = {
        id: crypto.randomUUID(),
        action,
        releaseIds: groupIds,
        snapshot: {
          artist: album.artist,
          title: album.album,
          ...(album.coverUrl ? { coverUrl: album.coverUrl } : {}),
        },
        createdAt: this.now().getTime(),
      };
      crate.overrides = [
        ...subtractReleaseIds(crate.overrides, groupIds),
        override,
      ];
      crate.updatedAt = this.now().getTime();
      return crate;
    });
  }

  /** Reset these albums to the rules (subtracts their release IDs) */
  async clearOverrides(id: string, releaseIds: unknown): Promise<Crate> {
    const ids = expandToAlbumCopies(
      await this.getTable(),
      this.validateReleaseIds(releaseIds)
    );
    return this.update(store => {
      const crate = store.crates.find(c => c.id === id);
      if (!crate) throw new CrateError('Crate not found', 404);
      crate.overrides = subtractReleaseIds(crate.overrides, ids);
      crate.updatedAt = this.now().getTime();
      return crate;
    });
  }

  /** Remove overrides whose records are no longer owned */
  async removeStaleOverrides(id: string): Promise<Crate> {
    const { evaluation } = await this.evaluate(id);
    if (!evaluation.coverage.collection.complete) {
      throw new CrateError(
        'Your collection is still loading; try again once it has finished',
        409
      );
    }
    const staleIds = new Set(evaluation.staleOverrides.map(o => o.id));
    return this.update(store => {
      const crate = store.crates.find(c => c.id === id);
      if (!crate) throw new CrateError('Crate not found', 404);
      if (staleIds.size > 0) {
        crate.overrides = crate.overrides.filter(o => !staleIds.has(o.id));
        crate.updatedAt = this.now().getTime();
      }
      return crate;
    });
  }

  // ============================================
  // Evaluation
  // ============================================

  private async getUsername(): Promise<string> {
    const settings = await this.authService.getUserSettings();
    const username = settings.discogs?.username;
    if (!username) {
      throw new CrateError('Discogs authentication required', 401);
    }
    return username;
  }

  /** The album table for the signed-in Discogs user */
  async getTable(): Promise<CrateAlbumTable> {
    return this.tableBuilder.getTable(await this.getUsername());
  }

  /**
   * Evaluation context; release facts are loaded only when a crate's rules
   * or sort need them
   */
  async getContext(
    crates: Array<{ rules: CrateRule[]; sort: CrateSort }>
  ): Promise<CrateEvalContext> {
    const table = await this.getTable();
    const needsFacts = crates.some(c => crateNeedsFacts(c.rules, c.sort));
    const facts = needsFacts
      ? await this.tableBuilder.getFacts(
          table.albums.flatMap(a => a.copies.map(c => c.releaseId))
        )
      : new Map();
    return {
      table,
      facts,
      resolveArtist: this.tableBuilder.getResolveArtist(),
      now: this.now(),
    };
  }

  async evaluate(
    id: string
  ): Promise<{ crate: Crate; evaluation: CrateEvaluation }> {
    const crate = await this.getCrate(id);
    const ctx = await this.getContext([crate]);
    return { crate, evaluation: evaluateCrate(crate, ctx) };
  }

  /** Evaluate unsaved rules (builder live preview, suggestion preview) */
  async preview(input: {
    rules: unknown;
    sort?: unknown;
    overrides?: CrateOverride[];
  }): Promise<CrateEvaluation> {
    const rules = this.validateRules(input.rules);
    const sort = this.validateSort(input.sort ?? 'artist');
    const ctx = await this.getContext([{ rules, sort }]);
    return evaluateCrate(
      { id: null, rules, overrides: input.overrides ?? [], sort },
      ctx
    );
  }

  async summaries(): Promise<CrateSummary[]> {
    const crates = await this.listCrates();
    if (crates.length === 0) return [];
    const ctx = await this.getContext(crates);
    return crates.map(crate => {
      const evaluation = evaluateCrate(crate, ctx);
      return {
        id: crate.id,
        name: crate.name,
        ...(crate.description ? { description: crate.description } : {}),
        pinnedToWhatToPlay: crate.pinnedToWhatToPlay,
        count: evaluation.albums.length,
        unknownCount: evaluation.unknownOnlyAlbums,
        staleOverrideCount: evaluation.staleOverrides.length,
        sampleCovers: evaluation.albums
          .map(a => a.coverUrl)
          .filter((url): url is string => !!url)
          .slice(0, 4),
        updatedAt: crate.updatedAt,
      };
    });
  }

  /**
   * Running time in seconds of each collection release whose cached
   * tracklist has a length for every track (the runtime crate sorts use)
   */
  async releaseRuntimes(): Promise<Record<number, number>> {
    const table = await this.getTable();
    const facts = await this.tableBuilder.getFacts(
      table.albums.flatMap(a => a.copies.map(c => c.releaseId))
    );
    const runtimes: Record<number, number> = {};
    for (const [releaseId, fact] of facts) {
      if (fact.runtime?.complete)
        runtimes[releaseId] = fact.runtime.knownSeconds;
    }
    return runtimes;
  }

  /** Crates whose members include an album with this release */
  async cratesForRelease(
    releaseId: number
  ): Promise<Array<Pick<Crate, 'id' | 'name'>>> {
    const crates = await this.listCrates();
    if (crates.length === 0) return [];
    const ctx = await this.getContext(crates);
    return crates
      .filter(crate =>
        evaluateCrate(crate, ctx).albums.some(album =>
          album.copies.some(copy => copy.releaseId === releaseId)
        )
      )
      .map(crate => ({ id: crate.id, name: crate.name }));
  }

  // ============================================
  // Validation
  // ============================================

  private validateName(name: unknown): string {
    if (typeof name !== 'string' || !name.trim()) {
      throw new CrateError('Crate name is required', 400);
    }
    const trimmed = name.trim();
    if (trimmed.length > CRATE_NAME_MAX_LENGTH) {
      throw new CrateError(
        `Crate name must be at most ${CRATE_NAME_MAX_LENGTH} characters`,
        400
      );
    }
    return trimmed;
  }

  private validateDescription(description: unknown): string | undefined {
    if (description === undefined || description === null) return undefined;
    if (typeof description !== 'string') {
      throw new CrateError('Description must be text', 400);
    }
    const trimmed = description.trim();
    if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
      throw new CrateError(
        `Description must be at most ${MAX_DESCRIPTION_LENGTH} characters`,
        400
      );
    }
    return trimmed || undefined;
  }

  private validateRules(rules: unknown): CrateRule[] {
    if (!Array.isArray(rules)) {
      throw new CrateError('rules must be a list', 400);
    }
    if (rules.length > CRATE_MAX_RULES) {
      throw new CrateError(
        `A crate can have at most ${CRATE_MAX_RULES} rules`,
        400
      );
    }
    const errors = validateCrateRules(rules);
    if (errors.length > 0) {
      throw new CrateError('Invalid rules', 400, errors);
    }
    return rules as CrateRule[];
  }

  private validateSort(sort: unknown): CrateSort {
    if (!CRATE_SORTS.includes(sort as CrateSort)) {
      throw new CrateError(`Unknown sort: ${String(sort)}`, 400);
    }
    return sort as CrateSort;
  }

  private validateReleaseIds(releaseIds: unknown): number[] {
    if (
      !Array.isArray(releaseIds) ||
      releaseIds.length === 0 ||
      releaseIds.length > MAX_OVERRIDE_RELEASE_IDS ||
      !releaseIds.every(id => Number.isInteger(id) && id > 0)
    ) {
      throw new CrateError(
        `releaseIds must be 1-${MAX_OVERRIDE_RELEASE_IDS} positive integers`,
        400
      );
    }
    return Array.from(new Set(releaseIds as number[]));
  }

  private assertNameFree(store: CratesStore, name: string, exceptId?: string) {
    const lower = name.toLowerCase();
    if (
      store.crates.some(
        c => c.id !== exceptId && c.name.toLowerCase() === lower
      )
    ) {
      throw new CrateError(`A crate named "${name}" already exists`, 409);
    }
  }
}

/**
 * Remove release IDs from overrides, dropping overrides left with none.
 * Other IDs keep their override (plan section 5.4).
 */
export function subtractReleaseIds(
  overrides: CrateOverride[],
  releaseIds: number[]
): CrateOverride[] {
  const remove = new Set(releaseIds);
  const result: CrateOverride[] = [];
  for (const override of overrides) {
    const remaining = override.releaseIds.filter(id => !remove.has(id));
    if (remaining.length === 0) continue;
    result.push(
      remaining.length === override.releaseIds.length
        ? override
        : { ...override, releaseIds: remaining }
    );
  }
  return result;
}

/**
 * The given release IDs plus every other copy of the albums they belong to.
 * IDs that are no longer owned are kept as they are.
 */
export function expandToAlbumCopies(
  table: Pick<CrateAlbumTable, 'albums'>,
  releaseIds: number[]
): number[] {
  const wanted = new Set(releaseIds);
  const result = new Set(releaseIds);
  for (const album of table.albums) {
    if (album.copies.some(copy => wanted.has(copy.releaseId))) {
      album.copies.forEach(copy => result.add(copy.releaseId));
    }
  }
  return Array.from(result);
}
