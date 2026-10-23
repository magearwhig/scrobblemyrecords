import type { Browser } from 'playwright-core';

import {
  ChromiumPdfRenderer,
  PdfRenderError,
} from '../../../src/backend/services/pocketList/pocketListPdfRenderer';

const PDF = Buffer.from('%PDF fake');

type RouteHandler = (route: {
  request: () => { url: () => string };
  continue: () => Promise<void>;
  abort: (code?: string) => Promise<void>;
}) => unknown;

/** Minimal stand-ins for Playwright's Browser / BrowserContext / Page */
class FakePage {
  pdf = jest.fn(async (_opts: Record<string, unknown>) => PDF);
  setContent = jest.fn(async () => undefined);
  evaluate = jest.fn(async () => 'loaded');
  setDefaultTimeout = jest.fn();
}

class FakeContext {
  page = new FakePage();
  routeHandler: RouteHandler | null = null;
  closed = false;
  close = jest.fn(async () => {
    this.closed = true;
  });
  newPage = jest.fn(async () => this.page);
  route = jest.fn(async (_pattern: string, handler: RouteHandler) => {
    this.routeHandler = handler;
  });
}

class FakeBrowser {
  connected = true;
  contexts: FakeContext[] = [];
  contextOptions: unknown[] = [];
  nextContext: () => FakeContext = () => new FakeContext();
  private listeners: Array<() => void> = [];

  isConnected = () => this.connected;
  on = jest.fn((event: string, fn: () => void) => {
    if (event === 'disconnected') this.listeners.push(fn);
  });
  newContext = jest.fn(async (options: unknown) => {
    this.contextOptions.push(options);
    const context = this.nextContext();
    this.contexts.push(context);
    return context;
  });
  close = jest.fn(async () => this.disconnect());

  disconnect(): void {
    if (!this.connected) return;
    this.connected = false;
    this.listeners.forEach(fn => fn());
  }
}

function soon(ms = 5_000): number {
  return Date.now() + ms;
}

describe('ChromiumPdfRenderer', () => {
  let browsers: FakeBrowser[];
  let launch: jest.Mock<Promise<Browser>, [number]>;
  let renderer: ChromiumPdfRenderer;

  function makeRenderer(
    options: Partial<ConstructorParameters<typeof ChromiumPdfRenderer>[0]> = {}
  ) {
    renderer = new ChromiumPdfRenderer({
      launch,
      executablePath: () => __filename, // any existing file
      idleMs: 60_000,
      closeGraceMs: 50,
      ...options,
    });
    return renderer;
  }

  beforeEach(() => {
    browsers = [];
    launch = jest.fn<Promise<Browser>, [number]>(async () => {
      const browser = new FakeBrowser();
      browsers.push(browser);
      return browser as unknown as Browser;
    });
  });

  afterEach(async () => {
    await renderer?.close();
  });

  it('launches lazily and reuses one browser with a fresh context per export', async () => {
    makeRenderer();
    expect(launch).not.toHaveBeenCalled();

    await expect(
      renderer.renderPdf('<p>a</p>', { deadline: soon() })
    ).resolves.toBe(PDF);
    await expect(
      renderer.renderPdf('<p>b</p>', { deadline: soon() })
    ).resolves.toBe(PDF);

    expect(launch).toHaveBeenCalledTimes(1);
    const [browser] = browsers;
    expect(browser.contexts).toHaveLength(2);
    expect(browser.contexts.every(c => c.closed)).toBe(true);
    expect(browser.contextOptions[0]).toEqual({ javaScriptEnabled: false });
  });

  it('waits for fonts and prints with the page box and outline options', async () => {
    makeRenderer();
    await renderer.renderPdf('<p>x</p>', { deadline: soon() });
    const page = browsers[0].contexts[0].page;
    expect(page.setContent).toHaveBeenCalledWith(
      '<p>x</p>',
      expect.objectContaining({ waitUntil: 'load' })
    );
    expect(page.evaluate).toHaveBeenCalledTimes(1);
    expect(page.pdf).toHaveBeenCalledWith(
      expect.objectContaining({
        preferCSSPageSize: true,
        width: '4in',
        height: '8in',
        printBackground: true,
        outline: true,
        tagged: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
      })
    );
    const footer = page.pdf.mock.calls[0][0].footerTemplate as string;
    expect(footer).toContain(
      'p. <span class="pageNumber"></span> / <span class="totalPages"></span>'
    );
  });

  it('aborts every request except data: URLs', async () => {
    makeRenderer();
    await renderer.renderPdf('<p>x</p>', { deadline: soon() });
    const handler = browsers[0].contexts[0].routeHandler!;
    const route = (url: string) => ({
      request: () => ({ url: () => url }),
      continue: jest.fn(async () => undefined),
      abort: jest.fn(async () => undefined),
    });

    const data = route('data:font/woff2;base64,AAAA');
    handler(data);
    expect(data.continue).toHaveBeenCalled();
    expect(data.abort).not.toHaveBeenCalled();

    for (const url of [
      'https://example.com/x.png',
      'file:///etc/passwd',
      'http://localhost:3001/api',
    ]) {
      const r = route(url);
      handler(r);
      expect(r.abort).toHaveBeenCalled();
      expect(r.continue).not.toHaveBeenCalled();
    }
  });

  it('drops the singleton when the browser disconnects and relaunches next time', async () => {
    makeRenderer();
    await renderer.renderPdf('x', { deadline: soon() });
    browsers[0].disconnect();
    expect(renderer.hasBrowser()).toBe(false);

    await renderer.renderPdf('x', { deadline: soon() });
    expect(launch).toHaveBeenCalledTimes(2);
  });

  it('closes the browser after the idle period', async () => {
    makeRenderer({ idleMs: 20 });
    await renderer.renderPdf('x', { deadline: soon() });
    expect(renderer.hasBrowser()).toBe(true);
    await new Promise(r => setTimeout(r, 60));
    expect(browsers[0].close).toHaveBeenCalled();
    expect(renderer.hasBrowser()).toBe(false);
  });

  it('reports a missing executable as browser-missing without launching', async () => {
    makeRenderer({ executablePath: () => '/nonexistent/chromium' });
    await expect(
      renderer.renderPdf('x', { deadline: soon() })
    ).rejects.toMatchObject({
      kind: 'browser-missing',
      message:
        'PDF renderer not installed: run `npx playwright install chromium`',
    });
    expect(launch).not.toHaveBeenCalled();
  });

  it("maps Playwright's missing-executable launch error to browser-missing", async () => {
    launch.mockRejectedValueOnce(
      new Error("Executable doesn't exist at /x/chrome")
    );
    makeRenderer();
    await expect(
      renderer.renderPdf('x', { deadline: soon() })
    ).rejects.toMatchObject({
      kind: 'browser-missing',
    });
  });

  it('maps other launch failures to crashed', async () => {
    launch.mockRejectedValueOnce(new Error('spawn failed'));
    makeRenderer();
    await expect(
      renderer.renderPdf('x', { deadline: soon() })
    ).rejects.toMatchObject({
      kind: 'crashed',
    });
    // The next export launches again
    await expect(renderer.renderPdf('x', { deadline: soon() })).resolves.toBe(
      PDF
    );
  });

  it('reports a crash mid-render and drops the browser', async () => {
    makeRenderer();
    await renderer.renderPdf('x', { deadline: soon() }); // launch
    const browser = browsers[0];
    browser.nextContext = () => {
      const context = new FakeContext();
      context.page.pdf.mockImplementation(async () => {
        browser.disconnect();
        throw new Error('Target page, context or browser has been closed');
      });
      return context;
    };
    const error = await renderer
      .renderPdf('x', { deadline: soon() })
      .catch(e => e);
    expect(error).toBeInstanceOf(PdfRenderError);
    expect(error.kind).toBe('crashed');
    expect(renderer.hasBrowser()).toBe(false);
  });

  it('enforces the deadline across steps and closes the context', async () => {
    makeRenderer();
    await renderer.renderPdf('x', { deadline: soon() }); // launch
    const browser = browsers[0];
    browser.nextContext = () => {
      const context = new FakeContext();
      context.page.pdf.mockImplementation(
        () => new Promise<Buffer>(() => undefined)
      );
      return context;
    };
    const started = Date.now();
    await expect(
      renderer.renderPdf('x', { deadline: Date.now() + 100 })
    ).rejects.toMatchObject({
      kind: 'deadline',
    });
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(browser.contexts[1].close).toHaveBeenCalled();
    expect(renderer.hasBrowser()).toBe(true); // context closed in time; browser kept
  });

  it('drops the browser when the context will not close after a deadline', async () => {
    makeRenderer();
    await renderer.renderPdf('x', { deadline: soon() }); // launch
    const browser = browsers[0];
    browser.nextContext = () => {
      const context = new FakeContext();
      context.page.pdf.mockImplementation(
        () => new Promise<Buffer>(() => undefined)
      );
      context.close.mockImplementation(
        () => new Promise<void>(() => undefined)
      );
      return context;
    };
    await expect(
      renderer.renderPdf('x', { deadline: Date.now() + 50 })
    ).rejects.toMatchObject({
      kind: 'deadline',
    });
    expect(browser.close).toHaveBeenCalled();
    expect(renderer.hasBrowser()).toBe(false);
  });

  it('stops when the signal aborts', async () => {
    makeRenderer();
    await renderer.renderPdf('x', { deadline: soon() }); // launch
    const browser = browsers[0];
    browser.nextContext = () => {
      const context = new FakeContext();
      context.page.setContent.mockImplementation(
        () => new Promise<undefined>(() => undefined)
      );
      return context;
    };
    const controller = new AbortController();
    const pending = renderer.renderPdf('x', {
      deadline: soon(),
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 20);
    await expect(pending).rejects.toMatchObject({ kind: 'aborted' });
    expect(browser.contexts[1].close).toHaveBeenCalled();
  });

  it("maps Playwright's own TimeoutError to deadline", async () => {
    makeRenderer();
    await renderer.renderPdf('x', { deadline: soon() }); // launch
    const browser = browsers[0];
    browser.nextContext = () => {
      const context = new FakeContext();
      context.page.setContent.mockImplementation(async () => {
        const error = new Error('page.setContent: Timeout 10ms exceeded.');
        error.name = 'TimeoutError';
        throw error;
      });
      return context;
    };
    await expect(
      renderer.renderPdf('x', { deadline: soon() })
    ).rejects.toMatchObject({ kind: 'deadline' });
    expect(renderer.hasBrowser()).toBe(true);
  });

  it('closes a stalled browser when context creation outlives the deadline', async () => {
    makeRenderer();
    await renderer.renderPdf('x', { deadline: soon() }); // launch
    const stall = (b: FakeBrowser) =>
      b.newContext.mockImplementationOnce(
        () => new Promise<FakeContext>(() => undefined)
      );

    stall(browsers[0]);
    await expect(
      renderer.renderPdf('x', { deadline: Date.now() + 30 })
    ).rejects.toMatchObject({ kind: 'deadline' });
    // Closed and dropped before settling
    expect(browsers[0].close).toHaveBeenCalled();
    expect(renderer.hasBrowser()).toBe(false);

    // The next export launches a fresh browser; a second stall does the same
    launch.mockImplementationOnce(async () => {
      const b = new FakeBrowser();
      stall(b);
      browsers.push(b);
      return b as unknown as Browser;
    });
    await expect(
      renderer.renderPdf('x', { deadline: Date.now() + 30 })
    ).rejects.toMatchObject({ kind: 'deadline' });
    expect(launch).toHaveBeenCalledTimes(2);
    expect(browsers[1].close).toHaveBeenCalled();

    await expect(renderer.renderPdf('x', { deadline: soon() })).resolves.toBe(
      PDF
    );
    expect(launch).toHaveBeenCalledTimes(3);
  });

  it('closes a context that arrives after the deadline', async () => {
    makeRenderer();
    await renderer.renderPdf('x', { deadline: soon() }); // launch
    const browser = browsers[0];
    let deliver!: (c: FakeContext) => void;
    const late = new FakeContext();
    browser.newContext.mockImplementationOnce(
      () => new Promise(resolve => (deliver = resolve))
    );
    await expect(
      renderer.renderPdf('x', { deadline: Date.now() + 30 })
    ).rejects.toMatchObject({ kind: 'deadline' });

    deliver(late);
    await new Promise(r => setTimeout(r, 10));
    expect(late.close).toHaveBeenCalled();
  });

  it('fails fast when the deadline has already passed', async () => {
    makeRenderer();
    await expect(
      renderer.renderPdf('x', { deadline: Date.now() - 1 })
    ).rejects.toMatchObject({
      kind: 'deadline',
    });
    expect(launch).not.toHaveBeenCalled();
  });
});
