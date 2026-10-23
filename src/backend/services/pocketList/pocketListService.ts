/**
 * Pocket List export: rows → model → HTML → PDF.
 *
 * Owns the request-level policy from .plan/done/pocket-list-export-plan.md:
 * - one export at a time (409 "export already running"), lock released on
 *   every path
 * - one 60 s end-to-end deadline (504)
 * - one automatic retry after a browser crash when ≥ 15 s remain (else 503)
 * - client-abort handling
 * - 409 when a collection-only export has no collection cache
 * - 422 when nothing is left to export
 */

import {
  ExportCollectionRow,
  ExportSnapshotMeta,
  ExportWishlistRow,
  PocketListOptions,
  PocketListWishlistSource,
} from '../../../shared/types';
import { createLogger } from '../../utils/logger';
import { EMPTY_FILING_SNAPSHOT, FilingSnapshot } from '../filing/filingRules';

import {
  PocketListFonts,
  loadPocketListFonts,
  localIsoDate,
  renderPocketListHtml,
} from './pocketListHtml';
import { buildPocketListModel } from './pocketListModel';
import {
  PdfRenderError,
  PocketListPdfRenderer,
  RENDERER_NOT_INSTALLED_MESSAGE,
} from './pocketListPdfRenderer';
import { PocketListModel } from './pocketListTypes';

const log = createLogger('PocketList');

/** Rows and snapshot meta; implemented by ExportDataService */
export interface PocketListDataSource {
  getCollectionRows(): Promise<ExportCollectionRow[]>;
  getWishlistRows(opts?: {
    sources?: PocketListWishlistSource[];
  }): Promise<ExportWishlistRow[]>;
  getSnapshotMeta(): Promise<ExportSnapshotMeta>;
}

/** Record-store filing data; implemented by RecordStoreFilingService */
export interface PocketListFilingSource {
  getSnapshot(): Promise<FilingSnapshot>;
}

export type PocketListModelBuilder = (
  collectionRows: ExportCollectionRow[],
  wishlistRows: ExportWishlistRow[],
  options: PocketListOptions,
  meta: ExportSnapshotMeta,
  now?: Date,
  filing?: FilingSnapshot
) => PocketListModel;

export type PocketListErrorStatus = 400 | 409 | 422 | 499 | 500 | 503 | 504;

/**
 * Error with the HTTP status the route should send. Status 499 means the
 * client went away; the route sends nothing.
 */
export class PocketListError extends Error {
  constructor(
    message: string,
    public readonly status: PocketListErrorStatus
  ) {
    super(message);
    this.name = 'PocketListError';
  }
}

export const POCKET_LIST_MESSAGES = {
  busy: 'Export already running',
  syncCollection: 'Sync your collection first',
  empty: 'Nothing to export: no albums match these options',
  crashed: 'PDF renderer crashed; try again',
  deadline: 'PDF took too long. Try again, or export fewer lists',
  notInstalled: RENDERER_NOT_INSTALLED_MESSAGE,
  aborted: 'Export cancelled',
  failed: 'Failed to generate the PDF',
} as const;

export interface PocketListServiceOptions {
  buildModel?: PocketListModelBuilder;
  /** Filing caches; without one every artist files by its own name */
  filing?: PocketListFilingSource;
  loadFonts?: () => PocketListFonts;
  /** End-to-end budget per export (default 60 s) */
  deadlineMs?: number;
  /** Minimum remaining budget for a crash retry (default 15 s) */
  minRetryBudgetMs?: number;
  /**
   * How long past the deadline the service waits for the renderer to clean
   * up and settle before giving up on it (default 6 s; longer than the
   * renderer's 5 s context-close grace, so the lock is never released while
   * the renderer is still tearing down)
   */
  renderGraceMs?: number;
  now?: () => Date;
}

export interface PocketListExportResult {
  pdf: Buffer;
  filename: string;
}

const DEFAULT_DEADLINE_MS = 60_000;
const DEFAULT_MIN_RETRY_BUDGET_MS = 15_000;
const DEFAULT_RENDER_GRACE_MS = 6_000;

/** listenography-pocket-list-{wishlist|collection|wishlist-collection}-{YYYY-MM-DD}.pdf */
export function pocketListFilename(
  options: Pick<PocketListOptions, 'lists'>,
  date: Date
): string {
  const parts: string[] = [];
  if (options.lists.includes('wishlist')) parts.push('wishlist');
  if (options.lists.includes('collection')) parts.push('collection');
  return `listenography-pocket-list-${parts.join('-')}-${localIsoDate(date)}.pdf`;
}

export class PocketListService {
  private running = false;
  private readonly buildModel: PocketListModelBuilder;
  private readonly filing: PocketListFilingSource | null;
  private readonly loadFonts: () => PocketListFonts;
  private readonly deadlineMs: number;
  private readonly minRetryBudgetMs: number;
  private readonly renderGraceMs: number;
  private readonly now: () => Date;

  constructor(
    private readonly dataSource: PocketListDataSource,
    private readonly renderer: PocketListPdfRenderer,
    options: PocketListServiceOptions = {}
  ) {
    this.buildModel = options.buildModel ?? buildPocketListModel;
    this.filing = options.filing ?? null;
    this.loadFonts = options.loadFonts ?? loadPocketListFonts;
    this.deadlineMs = options.deadlineMs ?? DEFAULT_DEADLINE_MS;
    this.minRetryBudgetMs =
      options.minRetryBudgetMs ?? DEFAULT_MIN_RETRY_BUDGET_MS;
    this.renderGraceMs = options.renderGraceMs ?? DEFAULT_RENDER_GRACE_MS;
    this.now = options.now ?? (() => new Date());
  }

  /** True while an export holds the single-flight lock */
  isRunning(): boolean {
    return this.running;
  }

  async exportPdf(
    options: PocketListOptions,
    { signal }: { signal?: AbortSignal } = {}
  ): Promise<PocketListExportResult> {
    if (this.running) {
      throw new PocketListError(POCKET_LIST_MESSAGES.busy, 409);
    }
    this.running = true;
    const startedAt = this.now();
    const deadline = Date.now() + this.deadlineMs;

    try {
      // Abandoning a slow read is harmless, so this phase stops at the
      // deadline (or abort) right away
      const html = await this.guard(
        this.buildHtml(options, startedAt),
        deadline,
        { signal, graceMs: 0 }
      ).catch((error: unknown) => {
        throw error instanceof PdfRenderError
          ? this.toPocketListError(error, error.kind)
          : error;
      });
      this.checkBudget(deadline, signal);
      const pdf = await this.renderWithRetry(html, deadline, signal);
      return { pdf, filename: pocketListFilename(options, startedAt) };
    } finally {
      this.running = false;
    }
  }

  private async buildHtml(
    options: PocketListOptions,
    now: Date
  ): Promise<string> {
    const wantsWishlist =
      options.lists.includes('wishlist') && options.wishlistSources.length > 0;
    const wantsCollection = options.lists.includes('collection');

    // Start meta and row reads in the same tick so ExportDataService serves
    // them from one shared collection read; otherwise a sync between the
    // reads could pair 'complete' meta with partial rows. A wishlist-only
    // export still needs the collection rows: the model applies
    // options.lists itself and names the owned copy in
    // "OWNED: another version (1994 · Vinyl)".
    const [meta, collectionRows, wishlistRows, filing] = await Promise.all([
      this.dataSource.getSnapshotMeta(),
      wantsCollection || wantsWishlist
        ? this.dataSource.getCollectionRows()
        : Promise.resolve([]),
      wantsWishlist
        ? this.dataSource.getWishlistRows({ sources: options.wishlistSources })
        : Promise.resolve([]),
      this.readFiling(),
    ]);

    if (
      wantsCollection &&
      !options.lists.includes('wishlist') &&
      meta.collectionCache.status === 'missing'
    ) {
      throw new PocketListError(POCKET_LIST_MESSAGES.syncCollection, 409);
    }

    const model = this.buildModel(
      collectionRows,
      wishlistRows,
      options,
      meta,
      now,
      filing
    );
    if (model.sections.length === 0) {
      throw new PocketListError(POCKET_LIST_MESSAGES.empty, 422);
    }
    return renderPocketListHtml(model, this.loadFonts());
  }

  /** A filing read failure only costs the record-store order, never the export */
  private async readFiling(): Promise<FilingSnapshot> {
    if (!this.filing) return EMPTY_FILING_SNAPSHOT;
    try {
      return await this.filing.getSnapshot();
    } catch (error) {
      log.warn('Filing data unreadable; filing artists by name', {
        error: error instanceof Error ? error.message : String(error),
      });
      return EMPTY_FILING_SNAPSHOT;
    }
  }

  private checkBudget(deadline: number, signal: AbortSignal | undefined) {
    if (signal?.aborted) {
      throw new PocketListError(POCKET_LIST_MESSAGES.aborted, 499);
    }
    if (Date.now() >= deadline) {
      throw new PocketListError(POCKET_LIST_MESSAGES.deadline, 504);
    }
  }

  private async renderWithRetry(
    html: string,
    deadline: number,
    signal: AbortSignal | undefined
  ): Promise<Buffer> {
    for (let attempt = 1; ; attempt++) {
      try {
        // The renderer enforces the deadline and abort itself and cleans up
        // before settling; this is only a backstop for a renderer that never
        // settles, so it doesn't react to abort and allows a cleanup grace.
        return await this.guard(
          this.renderer.renderPdf(html, { deadline, signal }),
          deadline,
          { graceMs: this.renderGraceMs }
        );
      } catch (error) {
        const kind = error instanceof PdfRenderError ? error.kind : 'failed';
        const remaining = deadline - Date.now();
        if (
          kind === 'crashed' &&
          attempt === 1 &&
          remaining >= this.minRetryBudgetMs &&
          !signal?.aborted
        ) {
          log.warn('PDF renderer crashed; retrying once', { remaining });
          continue;
        }
        throw this.toPocketListError(error, kind);
      }
    }
  }

  /**
   * Settle with a 'deadline' error at deadline + graceMs, and with an
   * 'aborted' error when `signal` aborts, whichever comes before `promise`.
   */
  private guard<T>(
    promise: Promise<T>,
    deadline: number,
    { signal, graceMs }: { signal?: AbortSignal; graceMs: number }
  ): Promise<T> {
    promise.catch(() => undefined);
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        cleanup();
        reject(new PdfRenderError('aborted', POCKET_LIST_MESSAGES.aborted));
      };
      const timer = setTimeout(
        () => {
          cleanup();
          reject(new PdfRenderError('deadline', POCKET_LIST_MESSAGES.deadline));
        },
        Math.max(0, deadline - Date.now()) + graceMs
      );
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      };
      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener('abort', onAbort, { once: true });
      promise.then(
        value => {
          cleanup();
          resolve(value);
        },
        (error: unknown) => {
          cleanup();
          reject(error);
        }
      );
    });
  }

  private toPocketListError(
    error: unknown,
    kind: PdfRenderError['kind']
  ): PocketListError {
    switch (kind) {
      case 'browser-missing':
        return new PocketListError(POCKET_LIST_MESSAGES.notInstalled, 503);
      case 'crashed':
        return new PocketListError(POCKET_LIST_MESSAGES.crashed, 503);
      case 'deadline':
        return new PocketListError(POCKET_LIST_MESSAGES.deadline, 504);
      case 'aborted':
        return new PocketListError(POCKET_LIST_MESSAGES.aborted, 499);
      default:
        log.error('Pocket list render failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        return new PocketListError(POCKET_LIST_MESSAGES.failed, 500);
    }
  }
}
