import * as crypto from 'crypto';

import express from 'express';

import { sendError } from '../utils/apiResponse';
import { createLogger } from '../utils/logger';

const log = createLogger('ApiAuth');

/**
 * Bearer-token gate for the API.
 *
 * This app has no user accounts; it is single-user and self-hosted. When bound
 * to loopback only, the OS is the access control and no token is needed. The
 * moment it listens on a LAN address, anything that can reach the port can read
 * the collection, change settings, and clear credentials — so a token becomes
 * mandatory. See resolveAuthPolicy() in server.ts for when this is installed.
 *
 * Possession of the token alone grants access, and this app speaks plain HTTP,
 * so on an untrusted network the token is sniffable. Put TLS or an
 * authenticated reverse proxy in front for anything beyond a home LAN.
 */

/**
 * Longest Authorization header we will even look at.
 *
 * Bounded before any parsing or hashing so an enormous header cannot be used to
 * burn CPU.
 */
const MAX_AUTH_HEADER_LENGTH = 4096;

/**
 * Paths that must remain reachable without a token.
 *
 * The OAuth callbacks are here because the user's browser arrives at them by
 * redirect from Discogs/Last.fm and cannot attach an Authorization header.
 * They are NOT unprotected: each is bound to a one-use, expiring transaction
 * created by the authenticated route that started the flow. Without that
 * binding, exempting them would let anyone on the network attach their own
 * Discogs or Last.fm account to this instance.
 */
export const UNAUTHENTICATED_PATHS: readonly string[] = [
  '/health',
  '/api/v1/auth/discogs/callback',
  '/api/v1/auth/lastfm/callback',
];

function isExempt(req: express.Request): boolean {
  // A genuine CORS preflight carries no Authorization header by design.
  // Requiring the preflight header keeps this from becoming a blanket OPTIONS
  // hole if a state-changing OPTIONS handler is ever added.
  if (
    req.method === 'OPTIONS' &&
    req.headers['access-control-request-method'] !== undefined
  ) {
    return true;
  }

  // GET only, throughout: a POST to /health or to a callback path must not slip
  // through if such a handler is added later. The legacy POST callback is
  // called by our own frontend and can carry the header.
  return req.method === 'GET' && UNAUTHENTICATED_PATHS.includes(req.path);
}

/**
 * Constant-time comparison of two secrets of possibly differing length.
 *
 * timingSafeEqual throws unless both buffers are the same length, and the
 * length itself would leak. Hashing first makes both sides a fixed 32 bytes.
 */
function secretsMatch(presented: string, expected: string): boolean {
  const presentedHash = crypto.createHash('sha256').update(presented).digest();
  const expectedHash = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(presentedHash, expectedHash);
}

function extractBearerToken(header: string | undefined): string | null {
  if (!header || header.length > MAX_AUTH_HEADER_LENGTH) return null;

  const match = /^Bearer[ ]+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/**
 * Build the auth middleware for a given token.
 *
 * @param expectedToken - The configured API token. Callers must not install
 *                        this middleware at all when no token is configured.
 */
export function requireApiToken(expectedToken: string): express.RequestHandler {
  return (req, res, next) => {
    if (isExempt(req)) {
      next();
      return;
    }

    const presented = extractBearerToken(req.headers.authorization);

    if (!presented || !secretsMatch(presented, expectedToken)) {
      // Deliberately vague, and the token itself is never logged or echoed.
      log.warn('Rejected unauthenticated API request', {
        method: req.method,
        path: req.path,
      });
      sendError(res, 401, 'Unauthorized');
      return;
    }

    next();
  };
}
