import express from 'express';
import request from 'supertest';

import { requireApiToken } from '../../../src/backend/middleware/requireApiToken';
import { registerPocketListRoute } from '../../../src/backend/routes/pocketListRoute';
import {
  PdfRenderError,
  PocketListPdfRenderer,
  RenderPdfOptions,
} from '../../../src/backend/services/pocketList/pocketListPdfRenderer';
import {
  PocketListDataSource,
  PocketListModelBuilder,
  PocketListService,
  PocketListServiceOptions,
} from '../../../src/backend/services/pocketList/pocketListService';
import { PocketListModel } from '../../../src/backend/services/pocketList/pocketListTypes';
import {
  ExportCollectionCacheInfo,
  ExportSnapshotMeta,
} from '../../../src/shared/types';
import { buildPocketListFixture } from '../../integration/fixtures/pocketListFixture';

const PDF = Buffer.from('%PDF-1.7 fake pdf bytes');
/** Local time, so the filename date is 2026-10-20 in any time zone */
const NOW = new Date(2026, 9, 20, 23, 30);

function cache(
  status: ExportCollectionCacheInfo['status']
): ExportCollectionCacheInfo {
  return {
    status,
    pagesExpected: status === 'missing' ? null : 24,
    pagesRead: status === 'complete' ? 24 : status === 'partial' ? 3 : 0,
    itemsExpected: null,
    itemsRead: 0,
    oldestPageAt: null,
    newestPageAt: null,
  };
}

function snapshotMeta(
  status: ExportCollectionCacheInfo['status'] = 'complete'
): ExportSnapshotMeta {
  return {
    schemaVersion: 1 as ExportSnapshotMeta['schemaVersion'],
    generatedAt: NOW.toISOString(),
    collectionCachedAt: null,
    collectionCache: cache(status),
    wishlistUpdatedAt: null,
    historySyncedAt: null,
    discogsUsername: 'tester',
  };
}

/** A renderer whose behaviour each test scripts */
class FakeRenderer implements PocketListPdfRenderer {
  calls: Array<{ html: string; options: RenderPdfOptions }> = [];
  impl: (options: RenderPdfOptions) => Promise<Buffer> = async () => PDF;

  renderPdf(html: string, options: RenderPdfOptions): Promise<Buffer> {
    this.calls.push({ html, options });
    return this.impl(options);
  }
}

function crash(): Promise<Buffer> {
  return Promise.reject(new PdfRenderError('crashed', 'boom'));
}

describe('GET /api/v1/export/pocket-list', () => {
  let renderer: FakeRenderer;
  let dataSource: jest.Mocked<PocketListDataSource>;
  let buildModel: jest.MockedFunction<PocketListModelBuilder>;
  let model: PocketListModel;

  function makeApp(
    serviceOptions: PocketListServiceOptions = {},
    token?: string
  ): express.Application {
    const service = new PocketListService(dataSource, renderer, {
      buildModel,
      loadFonts: () => ({ css: '' }),
      now: () => NOW,
      ...serviceOptions,
    });
    const router = express.Router();
    registerPocketListRoute(router, service);
    const app = express();
    if (token) app.use(requireApiToken(token));
    app.use('/api/v1/export', router);
    return app;
  }

  beforeEach(() => {
    renderer = new FakeRenderer();
    model = buildPocketListFixture();
    dataSource = {
      getCollectionRows: jest.fn().mockResolvedValue([]),
      getWishlistRows: jest.fn().mockResolvedValue([]),
      getSnapshotMeta: jest.fn().mockResolvedValue(snapshotMeta()),
    };
    buildModel = jest.fn<PocketListModel, Parameters<PocketListModelBuilder>>(
      () => model
    );
  });

  describe('success', () => {
    it('returns the PDF with download headers', async () => {
      const res = await request(makeApp())
        .get('/api/v1/export/pocket-list')
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="listenography-pocket-list-wishlist-2026-10-20.pdf"'
      );
      expect(res.headers['cache-control']).toBe('no-store');
      expect(Buffer.compare(res.body as Buffer, PDF)).toBe(0);
      expect(renderer.calls[0].html).toContain('<!doctype html>');
    });

    it.each([
      ['wishlist', 'wishlist'],
      ['collection', 'collection'],
      ['wishlist,collection', 'wishlist-collection'],
      ['collection,wishlist', 'wishlist-collection'],
    ])('names the file for lists=%s', async (lists, part) => {
      const res = await request(makeApp()).get(
        `/api/v1/export/pocket-list?lists=${lists}`
      );
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toBe(
        `attachment; filename="listenography-pocket-list-${part}-2026-10-20.pdf"`
      );
    });

    it('applies the documented defaults', async () => {
      await request(makeApp()).get('/api/v1/export/pocket-list').expect(200);
      expect(buildModel).toHaveBeenCalledWith(
        [],
        [],
        {
          lists: ['wishlist'],
          wishlistSources: ['discogs-want', 'local-want'],
          details: { format: true, pressing: true, notes: false },
          flagOwnedVersions: true,
        },
        snapshotMeta(),
        NOW
      );
      expect(dataSource.getWishlistRows).toHaveBeenCalledWith({
        sources: ['discogs-want', 'local-want'],
      });
      // Wishlist-only still reads the collection to name owned copies
      expect(dataSource.getCollectionRows).toHaveBeenCalled();
    });

    it('parses explicit options', async () => {
      await request(makeApp())
        .get(
          '/api/v1/export/pocket-list?lists=collection,wishlist&sources=local-want&details=notes&flagOwned=false'
        )
        .expect(200);
      expect(buildModel.mock.calls[0][2]).toEqual({
        lists: ['wishlist', 'collection'],
        wishlistSources: ['local-want'],
        details: { format: false, pressing: false, notes: true },
        flagOwnedVersions: false,
      });
      expect(dataSource.getCollectionRows).toHaveBeenCalled();
      expect(dataSource.getWishlistRows).toHaveBeenCalledWith({
        sources: ['local-want'],
      });
    });

    it('accepts an empty details list (all details off)', async () => {
      await request(makeApp())
        .get('/api/v1/export/pocket-list?details=')
        .expect(200);
      expect(buildModel.mock.calls[0][2].details).toEqual({
        format: false,
        pressing: false,
        notes: false,
      });
    });
  });

  describe('bad requests', () => {
    it.each([
      'lists=everything',
      'lists=',
      'lists=wishlist&lists=collection',
      'sources=spotify',
      'sources=',
      'details=catno',
      'flagOwned=maybe',
    ])('returns 400 for %s', async query => {
      const res = await request(makeApp()).get(
        `/api/v1/export/pocket-list?${query}`
      );
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(typeof res.body.error).toBe('string');
      expect(renderer.calls).toHaveLength(0);
    });
  });

  describe('collection cache', () => {
    it('starts the meta and row reads together so they share one snapshot read', async () => {
      let releaseMeta!: (m: ExportSnapshotMeta) => void;
      dataSource.getSnapshotMeta.mockImplementationOnce(
        () => new Promise<ExportSnapshotMeta>(r => (releaseMeta = r))
      );
      const pending = request(makeApp())
        .get('/api/v1/export/pocket-list?lists=wishlist,collection')
        .then(r => r);
      while (dataSource.getSnapshotMeta.mock.calls.length === 0) {
        await new Promise(r => setTimeout(r, 5));
      }
      // Rows are requested while meta is still pending
      expect(dataSource.getCollectionRows).toHaveBeenCalledTimes(1);
      expect(dataSource.getWishlistRows).toHaveBeenCalledTimes(1);
      releaseMeta(snapshotMeta());
      expect((await pending).status).toBe(200);
    });

    it('returns 409 for a collection-only export without a cache', async () => {
      dataSource.getSnapshotMeta.mockResolvedValue(snapshotMeta('missing'));
      const res = await request(makeApp()).get(
        '/api/v1/export/pocket-list?lists=collection'
      );
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Sync your collection first');
      expect(renderer.calls).toHaveLength(0);
    });

    it('still exports the wishlist when the cache is missing', async () => {
      dataSource.getSnapshotMeta.mockResolvedValue(snapshotMeta('missing'));
      await request(makeApp())
        .get('/api/v1/export/pocket-list?lists=wishlist,collection')
        .expect(200);
    });

    it('exports with a partial cache (the model adds the cover warning)', async () => {
      dataSource.getSnapshotMeta.mockResolvedValue(snapshotMeta('partial'));
      model.meta.warnings = [
        'Collection cache incomplete (3 of 24 pages): unflagged wants may still be owned',
      ];
      await request(makeApp())
        .get('/api/v1/export/pocket-list?lists=collection')
        .expect(200);
      expect(buildModel.mock.calls[0][3].collectionCache.status).toBe(
        'partial'
      );
      expect(renderer.calls[0].html).toContain('Collection cache incomplete');
    });
  });

  it('returns 422 when nothing is left to export', async () => {
    model = { ...model, sections: [] };
    const res = await request(makeApp()).get('/api/v1/export/pocket-list');
    expect(res.status).toBe(422);
    expect(renderer.calls).toHaveLength(0);
  });

  it('returns 503 with the install hint when Chromium is missing', async () => {
    renderer.impl = () =>
      Promise.reject(new PdfRenderError('browser-missing', 'missing'));
    const res = await request(makeApp()).get('/api/v1/export/pocket-list');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe(
      'PDF renderer not installed: run `npx playwright install chromium`'
    );
    expect(renderer.calls).toHaveLength(1);
  });

  it('returns 500 on an unexpected render error', async () => {
    renderer.impl = () => Promise.reject(new Error('weird'));
    const res = await request(makeApp()).get('/api/v1/export/pocket-list');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  describe('single flight', () => {
    it('refuses a concurrent export with 409 and releases the lock afterwards', async () => {
      let release!: () => void;
      let started!: () => void;
      const renderStarted = new Promise<void>(r => (started = r));
      renderer.impl = () =>
        new Promise<Buffer>(resolve => {
          release = () => resolve(PDF);
          started();
        });
      const app = makeApp();

      const first = request(app)
        .get('/api/v1/export/pocket-list')
        .then(r => r);
      await renderStarted;

      const second = await request(app).get('/api/v1/export/pocket-list');
      expect(second.status).toBe(409);
      expect(second.body.error).toBe('Export already running');

      release();
      expect((await first).status).toBe(200);

      renderer.impl = async () => PDF;
      await request(app).get('/api/v1/export/pocket-list').expect(200);
    });
  });

  describe('deadline', () => {
    it('returns 504 within the budget, then the next export succeeds', async () => {
      renderer.impl = () => new Promise<Buffer>(() => undefined); // never settles
      const app = makeApp({ deadlineMs: 300, renderGraceMs: 50 });

      const started = Date.now();
      const res = await request(app).get('/api/v1/export/pocket-list');
      expect(res.status).toBe(504);
      expect(res.body.error).toBe(
        'PDF took too long. Try again, or export fewer lists'
      );
      expect(Date.now() - started).toBeLessThan(2000);
      expect(renderer.calls[0].options.deadline).toBeGreaterThan(started);

      renderer.impl = async () => PDF;
      await request(app).get('/api/v1/export/pocket-list').expect(200);
    });

    it('returns 504 when loading rows stalls, and releases the lock', async () => {
      dataSource.getSnapshotMeta.mockImplementationOnce(
        () => new Promise<ExportSnapshotMeta>(() => undefined)
      );
      const app = makeApp({ deadlineMs: 200 });
      const res = await request(app).get('/api/v1/export/pocket-list');
      expect(res.status).toBe(504);
      expect(renderer.calls).toHaveLength(0);

      await request(app).get('/api/v1/export/pocket-list').expect(200);
    });

    it('maps a renderer deadline error to 504 without retrying', async () => {
      renderer.impl = () =>
        Promise.reject(new PdfRenderError('deadline', 'late'));
      const res = await request(makeApp()).get('/api/v1/export/pocket-list');
      expect(res.status).toBe(504);
      expect(renderer.calls).toHaveLength(1);
    });
  });

  describe('crash retry', () => {
    it('retries once after a crash and succeeds', async () => {
      renderer.impl = crash;
      const app = makeApp();
      renderer.impl = () => {
        renderer.impl = async () => PDF;
        return crash();
      };
      await request(app).get('/api/v1/export/pocket-list').expect(200);
      expect(renderer.calls).toHaveLength(2);
    });

    it('returns 503 when it crashes twice, and the lock is released', async () => {
      renderer.impl = crash;
      const app = makeApp();
      const res = await request(app).get('/api/v1/export/pocket-list');
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('PDF renderer crashed; try again');
      expect(renderer.calls).toHaveLength(2);

      renderer.impl = async () => PDF;
      await request(app).get('/api/v1/export/pocket-list').expect(200);
    });

    it('does not retry when less than the minimum budget remains', async () => {
      renderer.impl = crash;
      const res = await request(
        makeApp({ deadlineMs: 10_000, minRetryBudgetMs: 15_000 })
      ).get('/api/v1/export/pocket-list');
      expect(res.status).toBe(503);
      expect(renderer.calls).toHaveLength(1);
    });
  });

  describe('client disconnect', () => {
    it('aborts the render and releases the lock', async () => {
      let observedAbort!: () => void;
      const abortSeen = new Promise<void>(r => (observedAbort = r));
      renderer.impl = ({ signal }) =>
        new Promise<Buffer>((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            observedAbort();
            reject(new PdfRenderError('aborted', 'aborted'));
          });
        });
      const app = makeApp();
      const server = app.listen(0);
      try {
        const { port } = server.address() as { port: number };
        const controller = new AbortController();
        const pending = fetch(
          `http://127.0.0.1:${port}/api/v1/export/pocket-list`,
          { signal: controller.signal }
        ).catch(() => 'aborted');
        while (renderer.calls.length === 0) {
          await new Promise(r => setTimeout(r, 5));
        }
        controller.abort();
        expect(await pending).toBe('aborted');
        await abortSeen;
        expect(renderer.calls[0].options.signal?.aborted).toBe(true);

        renderer.impl = async () => PDF;
        const next = await fetch(
          `http://127.0.0.1:${port}/api/v1/export/pocket-list`
        );
        expect(next.status).toBe(200);
      } finally {
        await new Promise(r => server.close(r));
      }
    });
  });

  describe('API token', () => {
    it('rejects a request without the token', async () => {
      const res = await request(makeApp({}, 'secret-token')).get(
        '/api/v1/export/pocket-list'
      );
      expect(res.status).toBe(401);
      expect(renderer.calls).toHaveLength(0);
    });

    it('serves the PDF with a valid bearer token', async () => {
      const res = await request(makeApp({}, 'secret-token'))
        .get('/api/v1/export/pocket-list')
        .set('Authorization', 'Bearer secret-token');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
    });
  });
});
