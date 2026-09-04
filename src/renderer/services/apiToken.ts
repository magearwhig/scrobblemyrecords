/**
 * Client-side storage for the API token.
 *
 * Only needed when the backend is bound to a non-loopback address (e.g. a Pi on
 * the LAN) and therefore requires `Authorization: Bearer`. For the ordinary
 * localhost setup the backend requires no token and this stays empty.
 *
 * sessionStorage, deliberately, not localStorage: the token survives a page
 * reload so the remote-backend setup is usable, but not a browser restart, and
 * it is scoped to this tab. Persisting a bearer token indefinitely on disk is a
 * worse trade for a credential that grants full API access on its own.
 */

const STORAGE_KEY = 'listenography.apiToken';

let cachedToken: string | null = null;
let loaded = false;

function readStorage(): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    // Private browsing or a blocked storage partition — fall back to memory.
    return null;
  }
}

export function getApiToken(): string | null {
  if (!loaded) {
    cachedToken = readStorage();
    loaded = true;
  }
  return cachedToken;
}

export function setApiToken(token: string | null): void {
  cachedToken = token && token.trim() ? token.trim() : null;
  loaded = true;

  try {
    if (cachedToken) {
      window.sessionStorage.setItem(STORAGE_KEY, cachedToken);
    } else {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Keep the in-memory value; it still works for this page load.
  }
}

export function clearApiToken(): void {
  setApiToken(null);
}

/** Authorization header for the current token, or nothing when unset. */
export function authHeader(): Record<string, string> {
  const token = getApiToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
