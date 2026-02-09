/**
 * Centralized route identifiers for hash-based navigation.
 * All page route strings should reference these constants to prevent drift.
 */
export const ROUTES = {
  HOME: 'home',
  COLLECTION: 'collection',
  SCROBBLE: 'scrobble',
  HISTORY: 'history',
  SETTINGS: 'settings',
  RELEASE_DETAILS: 'release-details',
  SUGGESTIONS: 'suggestions',
  DISCOVERY: 'discovery',
  STATS: 'stats',
  WISHLIST: 'wishlist',
  RELEASES: 'releases',
  SELLERS: 'sellers',
  SELLER_MATCHES: 'seller-matches',
  DISCARD_PILE: 'discard-pile',
} as const;

export type RouteId = (typeof ROUTES)[keyof typeof ROUTES];

/** Default route when no hash is present. */
export const DEFAULT_ROUTE: RouteId = ROUTES.HOME;
