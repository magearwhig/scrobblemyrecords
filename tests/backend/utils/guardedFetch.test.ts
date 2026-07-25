import * as http from 'http';
import type { AddressInfo } from 'net';

import { guardedFetchText } from '../../../src/backend/utils/guardedFetch';
import {
  assertPublicUrl,
  BlockedAddressError,
  createGuardedLookup,
  createPermissiveSsrfGuard,
  SsrfGuard,
} from '../../../src/backend/utils/ssrfGuard';

/**
 * Transport tests need a real server, which necessarily lives on 127.0.0.1 —
 * an address the real guard blocks by design. Rather than add a production
 * "allow private" escape hatch, the guard is injected: these tests supply a
 * permissive one to exercise redirects, timeouts and byte caps, while the real
 * guard is unit-tested in ssrfGuard.test.ts.
 */
const permissiveGuard: SsrfGuard = createPermissiveSsrfGuard();

/** Blocks one specific host, to prove redirect hops are revalidated. */
const guardBlockingHost = (blockedHost: string): SsrfGuard => ({
  assertPublicUrl: raw => {
    const url = new URL(raw);
    if (url.hostname === blockedHost) throw new BlockedAddressError(raw);
    return url;
  },
  createLookup: () => createGuardedLookup(() => false),
});

describe('guardedFetchText', () => {
  let server: http.Server;
  let baseUrl: string;
  let handler: (req: http.IncomingMessage, res: http.ServerResponse) => void;

  const baseOptions = {
    timeoutMs: 5000,
    maxBytes: 100_000,
    userAgent: 'test-agent',
    guard: permissiveGuard,
  };

  beforeAll(done => {
    server = http.createServer((req, res) => handler(req, res));
    server.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      done();
    });
  });

  afterAll(done => {
    server.close(() => done());
  });

  describe('basic behaviour', () => {
    it('returns the response body', async () => {
      handler = (_req, res) => {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<html>hello</html>');
      };

      await expect(guardedFetchText(baseUrl, baseOptions)).resolves.toBe(
        '<html>hello</html>'
      );
    });

    it('sends the configured User-Agent and Accept headers', async () => {
      const seen: Record<string, string | undefined> = {};
      handler = (req, res) => {
        seen.ua = req.headers['user-agent'];
        seen.accept = req.headers.accept;
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('ok');
      };

      await guardedFetchText(baseUrl, {
        ...baseOptions,
        accept: 'text/html,application/xhtml+xml',
      });

      expect(seen.ua).toBe('test-agent');
      expect(seen.accept).toBe('text/html,application/xhtml+xml');
    });

    it('rejects non-2xx responses', async () => {
      handler = (_req, res) => {
        res.writeHead(503, { 'content-type': 'text/html' });
        res.end('down');
      };

      await expect(guardedFetchText(baseUrl, baseOptions)).rejects.toThrow(
        /HTTP 503/
      );
    });

    it('rejects a disallowed content-type before parsing', async () => {
      handler = (_req, res) => {
        res.writeHead(200, { 'content-type': 'application/pdf' });
        res.end('%PDF-1.4');
      };

      await expect(
        guardedFetchText(baseUrl, {
          ...baseOptions,
          allowedContentType: /text\/html|text\/plain/i,
        })
      ).rejects.toThrow(/Unsupported content-type: application\/pdf/);
    });

    it('accepts an allowed content-type', async () => {
      handler = (_req, res) => {
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('plain body');
      };

      await expect(
        guardedFetchText(baseUrl, {
          ...baseOptions,
          allowedContentType: /text\/html|text\/plain/i,
        })
      ).resolves.toBe('plain body');
    });
  });

  describe('byte cap', () => {
    it('truncates a body larger than maxBytes', async () => {
      handler = (_req, res) => {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('x'.repeat(50_000));
      };

      const result = await guardedFetchText(baseUrl, {
        ...baseOptions,
        maxBytes: 1000,
      });

      expect(result).toHaveLength(1000);
    });

    it('does not truncate a body under the cap', async () => {
      handler = (_req, res) => {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('short');
      };

      await expect(
        guardedFetchText(baseUrl, { ...baseOptions, maxBytes: 1000 })
      ).resolves.toBe('short');
    });

    it('stops reading an endless response instead of exhausting memory', async () => {
      handler = (_req, res) => {
        res.writeHead(200, { 'content-type': 'text/html' });
        // Never call end(): the cap must terminate this, not the server.
        const pump = setInterval(() => res.write('y'.repeat(2000)), 1);
        res.on('close', () => clearInterval(pump));
      };

      const result = await guardedFetchText(baseUrl, {
        ...baseOptions,
        maxBytes: 5000,
      });

      expect(result).toHaveLength(5000);
    });
  });

  describe('timeout', () => {
    it('gives up on a server that never responds', async () => {
      handler = () => {
        // Deliberately no response.
      };

      await expect(
        guardedFetchText(baseUrl, { ...baseOptions, timeoutMs: 300 })
      ).rejects.toThrow(/timed out/i);
    });
  });

  describe('redirects', () => {
    it('follows a redirect and returns the final body', async () => {
      handler = (req, res) => {
        if (req.url === '/start') {
          res.writeHead(302, { location: '/end' });
          res.end();
          return;
        }
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('final');
      };

      await expect(
        guardedFetchText(`${baseUrl}/start`, baseOptions)
      ).resolves.toBe('final');
    });

    it('follows relative redirects against the current origin', async () => {
      handler = (req, res) => {
        if (req.url === '/a') {
          res.writeHead(301, { location: '/b' });
          res.end();
          return;
        }
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`landed on ${req.url}`);
      };

      await expect(guardedFetchText(`${baseUrl}/a`, baseOptions)).resolves.toBe(
        'landed on /b'
      );
    });

    it('gives up after too many hops', async () => {
      handler = (_req, res) => {
        res.writeHead(302, { location: '/loop' });
        res.end();
      };

      await expect(
        guardedFetchText(`${baseUrl}/loop`, baseOptions)
      ).rejects.toThrow(/Too many redirects/);
    });

    it('revalidates every hop — a redirect to a blocked host is refused', async () => {
      // The whole point of manual redirect following: a public URL must not be
      // able to bounce the fetch to somewhere the guard would have rejected.
      handler = (req, res) => {
        if (req.url === '/bounce') {
          res.writeHead(302, { location: 'http://169.254.169.254/latest/' });
          res.end();
          return;
        }
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('should not reach here');
      };

      await expect(
        guardedFetchText(`${baseUrl}/bounce`, {
          ...baseOptions,
          guard: {
            assertPublicUrl,
            createLookup: () => createGuardedLookup(() => false),
          },
        })
      ).rejects.toThrow(BlockedAddressError);
    });

    it('applies host-level blocking on a later hop', async () => {
      handler = (req, res) => {
        if (req.url === '/hop1') {
          res.writeHead(302, { location: `${baseUrl}/hop2` });
          res.end();
          return;
        }
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('reached hop2');
      };

      // First hop is allowed by URL, second is blocked by hostname.
      let seenFirst = false;
      const guard: SsrfGuard = {
        assertPublicUrl: raw => {
          const url = new URL(raw);
          if (seenFirst) throw new BlockedAddressError(raw);
          seenFirst = true;
          return url;
        },
        createLookup: () => createGuardedLookup(() => false),
      };

      await expect(
        guardedFetchText(`${baseUrl}/hop1`, { ...baseOptions, guard })
      ).rejects.toThrow(BlockedAddressError);
    });
  });

  describe('SSRF enforcement at the entry point', () => {
    it('refuses a blocked URL before making any request', async () => {
      let requested = false;
      handler = (_req, res) => {
        requested = true;
        res.end('nope');
      };

      await expect(
        guardedFetchText('http://169.254.169.254/latest/meta-data/', {
          ...baseOptions,
          guard: {
            assertPublicUrl,
            createLookup: () => createGuardedLookup(),
          },
        })
      ).rejects.toThrow(BlockedAddressError);

      expect(requested).toBe(false);
    });

    it('refuses a hostname that only resolves to a blocked address at connect time', async () => {
      // 'localhost' passes URL-level validation — it is a name, not a literal —
      // so this is caught by the lookup hook, which is the path that closes the
      // DNS-rebinding window.
      const port = (server.address() as AddressInfo).port;
      let requested = false;
      handler = (_req, res) => {
        requested = true;
        res.end('nope');
      };

      await expect(
        guardedFetchText(`http://localhost:${port}/`, {
          ...baseOptions,
          guard: {
            assertPublicUrl: raw => new URL(raw), // permissive at URL level
            createLookup: () => createGuardedLookup(), // real address blocklist
          },
        })
      ).rejects.toThrow(BlockedAddressError);

      expect(requested).toBe(false);
    });
  });
});
