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
  RECOMMENDATIONS: 'recommendations',
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

/**
 * Query parameters that can accompany navigation to a route.
 * Generic string record to accommodate any route-specific params.
 */
export type NavigateParams = Record<string, string>;

/**
 * Navigate to a hash-based route. Replaces direct `window.location.hash`
 * assignments throughout the codebase, making navigation mockable in tests
 * and enabling a future React Router migration as a single-file change.
 *
 * @param routeOrPath - A ROUTES value (e.g. ROUTES.STATS), a raw path string
 *   (e.g. 'marketplace?tab=sellers'), or any string route identifier.
 * @param params - Optional query parameters to append. Merged with any params
 *   already embedded in routeOrPath.
 *
 * @example
 *   navigate(ROUTES.STATS)                           // => #stats
 *   navigate(ROUTES.SETTINGS, { tab: 'connections' }) // => #settings?tab=connections
 *   navigate('marketplace?tab=wishlist')             // => #marketplace?tab=wishlist
 */
export function navigate(routeOrPath: string, params?: NavigateParams): void {
  // Strip leading '#' or '/' to normalise caller input
  const stripped = routeOrPath.replace(/^[#/]+/, '');

  if (!params || Object.keys(params).length === 0) {
    window.location.hash = stripped;
    return;
  }

  // If the path already contains a query string, merge params into it
  const [basePath, existingQuery] = stripped.split('?');
  const merged = new URLSearchParams(existingQuery ?? '');
  Object.entries(params).forEach(([key, value]) => {
    merged.set(key, value);
  });
  window.location.hash = `${basePath}?${merged.toString()}`;
}
