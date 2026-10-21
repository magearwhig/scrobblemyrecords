/**
 * Headless Chromium PDF renderer for the Pocket List.
 *
 * - Launches Chromium lazily on the first export and reuses one browser.
 * - Closes it after a minute without exports.
 * - Drops the singleton when the browser disconnects (crash), so the next
 *   export relaunches.
 * - Renders each export in a fresh context with JavaScript disabled and every
 *   request except `data:` URLs aborted, so the PDF can't pull in anything
 *   external.
 * - Applies the caller's end-to-end deadline to every step (remaining budget,
 *   not per-step timeouts that add up) and honours an abort signal.
 *
 * The single-flight lock and the crash retry live in PocketListService.
 * See .plan/done/pocket-list-export-plan.md, "PDF Generation: options & decision".
 */

import * as fs from 'fs';

import { chromium } from 'playwright-core';
import type { Browser, BrowserContext, Page } from 'playwright-core';

import { createLogger } from '../../utils/logger';

const log = createLogger('PocketListPdf');

export type PdfRenderFailureKind =
  /** Chromium executable not installed */
  | 'browser-missing'
  /** Browser crashed, disconnected, or failed to launch */
  | 'crashed'
  /** The end-to-end deadline passed */
  | 'deadline'
  /** The caller aborted (client disconnected) */
  | 'aborted'
  /** Any other rendering error */
  | 'failed';

export const RENDERER_NOT_INSTALLED_MESSAGE =
  'PDF renderer not installed: run `npx playwright install chromium`';

export class PdfRenderError extends Error {
  /** The underlying error, if any */
  public readonly cause?: unknown;

  constructor(
    public readonly kind: PdfRenderFailureKind,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message);
    this.name = 'PdfRenderError';
    this.cause = options?.cause;
  }
}

export interface RenderPdfOptions {
  /** Absolute deadline (ms since epoch) for the whole render */
  deadline: number;
  /** Aborts the render (e.g. the client went away) */
  signal?: AbortSignal;
  /**
   * Diagnostic hook run after fonts are ready and before `page.pdf()`. Used by
   * the integration test to inspect glyph coverage over CDP.
   */
  beforePdf?: (page: Page) => Promise<void>;
}

/** Narrow interface so the service and route tests can use a fake */
export interface PocketListPdfRenderer {
  renderPdf(html: string, options: RenderPdfOptions): Promise<Buffer>;
}

export interface ChromiumPdfRendererOptions {
  /** Launch a browser; defaults to playwright-core's chromium.launch */
  launch?: (timeoutMs: number) => Promise<Browser>;
  /** Path checked before launching; defaults to chromium.executablePath() */
  executablePath?: () => string;
  /** Close the browser after this long without exports (default 60 s) */
  idleMs?: number;
  /** How long a context close may take before the browser is dropped (default 5 s) */
  closeGraceMs?: number;
}

/** "p. X / Y" running footer; Chromium fills pageNumber/totalPages */
export const FOOTER_TEMPLATE =
  '<div style="width:100%;margin:0 0.25in;font-family:Helvetica,Arial,\'Liberation Sans\',sans-serif;font-size:8pt;color:#555;text-align:center;">' +
  'p. <span class="pageNumber"></span> / <span class="totalPages"></span></div>';

const DEFAULT_IDLE_MS = 60_000;
const DEFAULT_CLOSE_GRACE_MS = 5_000;

/** Races promises against the deadline and the abort signal */
class Budget {
  constructor(
    private readonly deadline: number,
    private readonly signal: AbortSignal | undefined
  ) {}

  remaining(): number {
    return Math.max(0, this.deadline - Date.now());
  }

  check(): void {
    if (this.signal?.aborted) {
      throw new PdfRenderError('aborted', 'PDF export was cancelled');
    }
    if (this.remaining() <= 0) {
      throw new PdfRenderError('deadline', 'PDF deadline passed');
    }
  }

  run<T>(promise: Promise<T>): Promise<T> {
    // The losing promise may reject later (e.g. when the context is closed);
    // keep that from surfacing as an unhandled rejection.
    promise.catch(() => undefined);
    this.check();

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new PdfRenderError('deadline', 'PDF deadline passed'));
      }, this.remaining());
      const onAbort = () => {
        cleanup();
        reject(new PdfRenderError('aborted', 'PDF export was cancelled'));
      };
      const cleanup = () => {
        clearTimeout(timer);
        this.signal?.removeEventListener('abort', onAbort);
      };
      this.signal?.addEventListener('abort', onAbort, { once: true });
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
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  promise.catch(() => undefined);
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out after ${ms} ms`)),
      ms
    );
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/** Playwright's errors.TimeoutError (matched by name; no class import needed) */
function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === 'TimeoutError';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class ChromiumPdfRenderer implements PocketListPdfRenderer {
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private active = 0;
  private readonly idleMs: number;
  private readonly closeGraceMs: number;

  constructor(private readonly options: ChromiumPdfRendererOptions = {}) {
    this.idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
    this.closeGraceMs = options.closeGraceMs ?? DEFAULT_CLOSE_GRACE_MS;
  }

  /** True while a browser is running (for tests and diagnostics) */
  hasBrowser(): boolean {
    return this.browser !== null;
  }

  async renderPdf(html: string, options: RenderPdfOptions): Promise<Buffer> {
    this.cancelIdle();
    this.active += 1;
    const budget = new Budget(options.deadline, options.signal);
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let pendingContext: Promise<BrowserContext> | null = null;

    try {
      budget.check();
      browser = await budget.run(this.getBrowser(budget.remaining()));
      pendingContext = browser.newContext({ javaScriptEnabled: false });
      context = await budget.run(pendingContext);
      await budget.run(
        context.route('**/*', route =>
          route.request().url().startsWith('data:')
            ? route.continue()
            : route.abort('blockedbyclient')
        )
      );
      const page = await budget.run(context.newPage());
      page.setDefaultTimeout(Math.max(1, budget.remaining()));

      await budget.run(
        page.setContent(html, {
          waitUntil: 'load',
          timeout: Math.max(1, budget.remaining()),
        })
      );
      // Page scripts are disabled, but Playwright's evaluate still runs
      await budget.run(
        page.evaluate(async () => {
          await document.fonts.ready;
          return document.fonts.status;
        })
      );
      if (options.beforePdf) {
        await budget.run(options.beforePdf(page));
      }

      return await budget.run(
        page.pdf({
          preferCSSPageSize: true,
          width: '4in',
          height: '8in',
          printBackground: true,
          outline: true,
          tagged: true,
          displayHeaderFooter: true,
          headerTemplate: '<span></span>',
          footerTemplate: FOOTER_TEMPLATE,
        })
      );
    } catch (error) {
      throw this.classify(error, browser);
    } finally {
      if (context) {
        await this.closeContext(context, browser);
      } else if (pendingContext) {
        // The budget ran out while the context was still being created: the
        // browser is stalled, so close it (bounded) and drop the singleton
        // before settling, so the next export launches a fresh one. Close
        // the context too if it still turns up.
        pendingContext.then(
          late => late.close().catch(() => undefined),
          () => undefined
        );
        await this.closeBrowserNow(browser);
      }
      this.active -= 1;
      if (this.active === 0) this.scheduleIdle();
    }
  }

  /** Close the browser now (server shutdown, tests) */
  async close(): Promise<void> {
    this.cancelIdle();
    const browser = this.browser;
    this.browser = null;
    if (browser) {
      await withTimeout(browser.close(), this.closeGraceMs).catch(
        () => undefined
      );
    }
  }

  private classify(error: unknown, browser: Browser | null): PdfRenderError {
    if (error instanceof PdfRenderError) {
      if (error.kind === 'crashed') this.dropBrowser(browser);
      return error;
    }
    if (isTimeoutError(error)) {
      // A Playwright timeout (given the remaining budget) beat our own timer
      return new PdfRenderError('deadline', 'PDF deadline passed', {
        cause: error,
      });
    }
    if (browser && !browser.isConnected()) {
      this.dropBrowser(browser);
      return new PdfRenderError('crashed', 'PDF renderer crashed', {
        cause: error,
      });
    }
    log.error('PDF render failed', { error: errorMessage(error) });
    return new PdfRenderError('failed', 'PDF rendering failed', {
      cause: error,
    });
  }

  private async getBrowser(timeoutMs: number): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    this.browser = null;
    if (!this.launching) {
      this.launching = this.launch(timeoutMs).finally(() => {
        this.launching = null;
      });
    }
    return this.launching;
  }

  private async launch(timeoutMs: number): Promise<Browser> {
    const executablePath =
      this.options.executablePath ?? (() => chromium.executablePath());
    let path: string;
    try {
      path = executablePath();
    } catch (error) {
      throw new PdfRenderError(
        'browser-missing',
        RENDERER_NOT_INSTALLED_MESSAGE,
        {
          cause: error,
        }
      );
    }
    if (!path || !fs.existsSync(path)) {
      throw new PdfRenderError(
        'browser-missing',
        RENDERER_NOT_INSTALLED_MESSAGE
      );
    }

    const launch =
      this.options.launch ??
      ((timeout: number) => chromium.launch({ headless: true, timeout }));

    let browser: Browser;
    try {
      browser = await launch(Math.max(1, timeoutMs));
    } catch (error) {
      const message = errorMessage(error);
      if (isTimeoutError(error)) {
        throw new PdfRenderError('deadline', 'PDF deadline passed', {
          cause: error,
        });
      }
      if (/Executable doesn't exist|playwright install/i.test(message)) {
        throw new PdfRenderError(
          'browser-missing',
          RENDERER_NOT_INSTALLED_MESSAGE,
          { cause: error }
        );
      }
      log.error('Chromium failed to launch', { error: message });
      throw new PdfRenderError('crashed', 'PDF renderer failed to start', {
        cause: error,
      });
    }

    browser.on('disconnected', () => {
      if (this.browser === browser) {
        log.warn('Chromium disconnected');
        this.browser = null;
      }
    });
    this.browser = browser;
    log.info('Chromium launched');
    return browser;
  }

  /**
   * Close a context within the grace period. If it hangs (e.g. after a
   * deadline in the middle of page.pdf), close the whole browser and drop the
   * singleton so the next export relaunches.
   */
  private async closeContext(
    context: BrowserContext,
    browser: Browser | null
  ): Promise<void> {
    try {
      await withTimeout(context.close(), this.closeGraceMs);
    } catch (error) {
      log.warn('Context did not close; restarting Chromium', {
        error: errorMessage(error),
      });
      this.dropBrowser(browser);
    }
  }

  /** Drop the singleton and wait (bounded) for the browser to close */
  private async closeBrowserNow(browser: Browser | null): Promise<void> {
    if (!browser) return;
    if (this.browser === browser) this.browser = null;
    await withTimeout(browser.close(), this.closeGraceMs).catch(
      () => undefined
    );
  }

  private dropBrowser(browser: Browser | null): void {
    if (!browser) return;
    if (this.browser === browser) this.browser = null;
    withTimeout(browser.close(), this.closeGraceMs).catch(() => undefined);
  }

  private cancelIdle(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private scheduleIdle(): void {
    this.cancelIdle();
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.active === 0 && this.browser) {
        log.info('Closing idle Chromium');
        void this.close();
      }
    }, this.idleMs);
    this.idleTimer.unref?.();
  }
}
