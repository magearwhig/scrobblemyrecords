/**
 * Client-side storage for the API token.
 *
 * Only needed when the backend is bound to a non-loopback address (e.g. a Pi on
 * the LAN) and therefore requires `Authorization: Bearer`. For the ordinary
 * localhost setup the backend requires no token and this stays empty.
 *
 * Kept in localStorage, so it is entered once per browser (a phone on the
 * home network, say) and lasts until Clear in Settings. A token saved by an
 * older build in sessionStorage is moved across on first read.
 */

const STORAGE_KEY = 'listenography.apiToken';

let cachedToken: string | null = null;
let loaded = false;

function readStorage(): string | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
    // Saved for one session by an older build: keep it for good
    const legacy = window.sessionStorage.getItem(STORAGE_KEY);
    if (legacy) {
      window.localStorage.setItem(STORAGE_KEY, legacy);
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
    return legacy;
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
      window.localStorage.setItem(STORAGE_KEY, cachedToken);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    window.sessionStorage.removeItem(STORAGE_KEY);
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
