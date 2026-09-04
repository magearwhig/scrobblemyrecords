import * as http from 'http';
import * as https from 'https';

import { createLogger } from './logger';
import { defaultSsrfGuard, SsrfGuard } from './ssrfGuard';

const log = createLogger('GuardedFetch');

/** Redirect hops to follow before giving up. */
const MAX_REDIRECTS = 5;

export interface GuardedFetchOptions {
  timeoutMs: number;
  maxBytes: number;
  userAgent: string;
  accept?: string;
  /** Content types to accept; anything else is rejected before parsing. */
  allowedContentType?: RegExp;
  /** Injected for tests — see {@link SsrfGuard}. */
  guard?: SsrfGuard;
}

interface ResponseHead {
  statusCode: number;
  statusMessage: string;
  headers: http.IncomingHttpHeaders;
}

/**
 * Fetch a user-supplied URL with SSRF protection, a timeout and a byte cap.
 *
 * Uses node:http/node:https rather than global fetch for one reason: the
 * `lookup` option lets us validate the resolved address at the moment of
 * connection. Node's fetch offers no equivalent hook, so validating DNS
 * separately would leave a rebinding window between check and connect.
 *
 * Redirects are followed manually so that every hop is revalidated. Automatic
 * following would let a public URL bounce straight to 169.254.169.254.
 */
export async function guardedFetchText(
  rawUrl: string,
  options: GuardedFetchOptions
): Promise<string> {
  const guard = options.guard ?? defaultSsrfGuard;
  const lookup = guard.createLookup();

  let currentUrl = guard.assertPublicUrl(rawUrl);
  const deadline = Date.now() + options.timeoutMs;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new Error(`Fetch timed out after ${options.timeoutMs}ms`);
    }

    const { head, body } = await requestOnce(currentUrl, {
      ...options,
      lookup,
      timeoutMs: remainingMs,
    });

    const location = head.headers.location;
    const isRedirect =
      head.statusCode >= 300 && head.statusCode < 400 && location;

    if (isRedirect) {
      body.destroy();

      if (hop === MAX_REDIRECTS) {
        throw new Error(`Too many redirects (>${MAX_REDIRECTS})`);
      }

      // Revalidate every hop. A resolved relative Location keeps the current
      // origin, which has already been validated, but an absolute one can
      // point anywhere.
      const next = new URL(location, currentUrl).toString();
      currentUrl = guard.assertPublicUrl(next);
      log.debug(`Following redirect to ${currentUrl.origin}`);
      continue;
    }

    if (head.statusCode < 200 || head.statusCode >= 300) {
      body.destroy();
      throw new Error(
        `Fetch failed: HTTP ${head.statusCode} ${head.statusMessage}`
      );
    }

    const contentType = String(head.headers['content-type'] || '');
    if (
      contentType &&
      options.allowedContentType &&
      !options.allowedContentType.test(contentType)
    ) {
      body.destroy();
      throw new Error(`Unsupported content-type: ${contentType}`);
    }

    return readCapped(body, options.maxBytes, currentUrl.toString());
  }

  // Unreachable: the loop either returns or throws.
  throw new Error(`Too many redirects (>${MAX_REDIRECTS})`);
}

function requestOnce(
  url: URL,
  options: GuardedFetchOptions & {
    lookup: ReturnType<SsrfGuard['createLookup']>;
    timeoutMs: number;
  }
): Promise<{ head: ResponseHead; body: http.IncomingMessage }> {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;

    const request = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname.replace(/^\[|\]$/g, ''),
        port: Number(url.port) || (url.protocol === 'https:' ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: {
          'User-Agent': options.userAgent,
          ...(options.accept ? { Accept: options.accept } : {}),
          Host: url.host,
        },
        // The SSRF check that actually matters: this runs at connect time.
        lookup: options.lookup,
      },
      response => {
        resolve({
          head: {
            statusCode: response.statusCode ?? 0,
            statusMessage: response.statusMessage ?? '',
            headers: response.headers,
          },
          body: response,
        });
      }
    );

    request.setTimeout(options.timeoutMs, () => {
      request.destroy(
        new Error(`Fetch timed out after ${options.timeoutMs}ms`)
      );
    });

    request.on('error', reject);
    request.end();
  });
}

/**
 * Read a response body, stopping hard at maxBytes.
 *
 * Destroys the stream on overflow rather than buffering and slicing, so an
 * endless response cannot exhaust memory before we notice.
 */
function readCapped(
  body: http.IncomingMessage,
  maxBytes: number,
  url: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let truncated = false;

    body.on('data', (chunk: Buffer) => {
      if (truncated) return;

      const remaining = maxBytes - total;
      if (chunk.byteLength >= remaining) {
        chunks.push(chunk.subarray(0, remaining));
        total = maxBytes;
        truncated = true;
        log.debug(`Body capped at ${maxBytes} bytes for ${url}`);
        body.destroy();
        resolve(Buffer.concat(chunks).toString('utf-8'));
        return;
      }

      chunks.push(chunk);
      total += chunk.byteLength;
    });

    body.on('end', () => {
      if (!truncated) resolve(Buffer.concat(chunks).toString('utf-8'));
    });

    body.on('error', error => {
      if (!truncated) reject(error);
    });
  });
}
