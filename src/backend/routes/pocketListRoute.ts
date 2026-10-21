import express from 'express';

import {
  PocketListKind,
  PocketListOptions,
  PocketListWishlistSource,
} from '../../shared/types';
import {
  PocketListError,
  PocketListService,
} from '../services/pocketList/pocketListService';
import { sendError } from '../utils/apiResponse';
import { createLogger } from '../utils/logger';

const log = createLogger('PocketListRoute');

const LISTS: readonly PocketListKind[] = ['wishlist', 'collection'];
const SOURCES: readonly PocketListWishlistSource[] = [
  'discogs-want',
  'local-want',
];
const DETAILS = ['format', 'pressing', 'notes'] as const;
type DetailKey = (typeof DETAILS)[number];

class QueryError extends Error {}

/**
 * Parse a comma-separated query value into known values.
 * `undefined` → the default; unknown or repeated-parameter values → 400.
 */
function parseList<T extends string>(
  raw: unknown,
  name: string,
  allowed: readonly T[],
  fallback: readonly T[],
  { allowEmpty }: { allowEmpty: boolean }
): T[] {
  if (raw === undefined) return [...fallback];
  if (typeof raw !== 'string') {
    throw new QueryError(`${name} must be a single comma-separated value`);
  }
  const values = raw
    .split(',')
    .map(v => v.trim())
    .filter(v => v.length > 0);
  for (const value of values) {
    if (!(allowed as readonly string[]).includes(value)) {
      throw new QueryError(
        `Unknown ${name} value "${value}". Allowed: ${allowed.join(', ')}`
      );
    }
  }
  if (values.length === 0 && !allowEmpty) {
    throw new QueryError(
      `${name} needs at least one of: ${allowed.join(', ')}`
    );
  }
  // Keep the canonical order and drop duplicates
  return allowed.filter(v => values.includes(v));
}

function parseBoolean(raw: unknown, name: string, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new QueryError(`${name} must be true or false`);
}

/** Query → options, with the defaults from the plan's Route table */
export function parsePocketListQuery(
  query: express.Request['query']
): PocketListOptions {
  const lists = parseList(query.lists, 'lists', LISTS, ['wishlist'], {
    allowEmpty: false,
  });
  const wishlistSources = parseList(
    query.sources,
    'sources',
    SOURCES,
    SOURCES,
    {
      allowEmpty: false,
    }
  );
  const details = parseList<DetailKey>(
    query.details,
    'details',
    DETAILS,
    ['format', 'pressing'],
    { allowEmpty: true }
  );
  return {
    lists,
    wishlistSources,
    details: {
      format: details.includes('format'),
      pressing: details.includes('pressing'),
      notes: details.includes('notes'),
    },
    flagOwnedVersions: parseBoolean(query.flagOwned, 'flagOwned', true),
  };
}

/**
 * Register `GET /pocket-list` on the export router. Must be registered before
 * that router's `/:dataset` route, or it is captured as an unknown dataset.
 */
export function registerPocketListRoute(
  router: express.Router,
  pocketListService: Pick<PocketListService, 'exportPdf'>
): void {
  router.get('/pocket-list', async (req, res) => {
    let options: PocketListOptions;
    try {
      options = parsePocketListQuery(req.query);
    } catch (error) {
      if (error instanceof QueryError) {
        sendError(res, 400, error.message);
        return;
      }
      throw error;
    }

    // `res` 'close' fires when the response finishes or the connection drops;
    // only the latter (not yet finished) means the client went away.
    const abort = new AbortController();
    const onClose = () => {
      if (!res.writableFinished) abort.abort();
    };
    res.on('close', onClose);

    try {
      const { pdf, filename } = await pocketListService.exportPdf(options, {
        signal: abort.signal,
      });
      if (abort.signal.aborted) return;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`
      );
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Length', String(pdf.length));
      res.status(200).end(pdf);
    } catch (error) {
      if (abort.signal.aborted || res.headersSent) return;
      if (error instanceof PocketListError) {
        if (error.status === 499) return;
        sendError(res, error.status, error.message);
        return;
      }
      log.error('Pocket list export failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      sendError(res, 500, 'Failed to generate the pocket list');
    }
  });
}
