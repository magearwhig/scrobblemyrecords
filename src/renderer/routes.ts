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
  MARKETPLACE: 'marketplace',
  WHAT_TO_PLAY: 'what-to-play',
  DISCOVERY: 'discovery',
  STATS: 'stats',
  DISCARD_PILE: 'discard-pile',
  COLLECTION_ANALYTICS: 'collection-analytics',
  WRAPPED: 'wrapped',
  ARTIST_DETAIL: 'artist',
  TRACK_DETAIL: 'track',
} as const;

/**
 * Maps legacy route hashes to their new consolidated equivalents.
 * Used in App.tsx to redirect old bookmarks/links.
 */
export const ROUTE_REDIRECTS: Record<string, string> = {
  wishlist: 'marketplace?tab=wishlist',
  releases: 'marketplace?tab=new-releases',
  sellers: 'marketplace?tab=sellers',
  'seller-matches': 'marketplace?tab=matches',
  suggestions: 'what-to-play?tab=suggestions',
};

export type RouteId = (typeof ROUTES)[keyof typeof ROUTES];

/** Default route when no hash is present. */
export const DEFAULT_ROUTE: RouteId = ROUTES.HOME;
