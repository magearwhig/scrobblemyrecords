import {
  authHeader,
  clearApiToken,
  getApiToken,
  setApiToken,
} from '../../../src/renderer/services/apiToken';

/**
 * The token is only needed when the backend is bound to a non-loopback address.
 * On the ordinary localhost setup none is set, and every request must go out
 * exactly as before — so "no token means no header" is as important here as the
 * storage behaviour itself.
 */
describe('apiToken', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    clearApiToken();
  });

  describe('storage', () => {
    it('round-trips a token', () => {
      setApiToken('secret-token');
      expect(getApiToken()).toBe('secret-token');
    });

    it('persists to sessionStorage, not localStorage', () => {
      // A bearer token grants full API access on its own; keeping it out of
      // localStorage means it does not outlive the browser session.
      setApiToken('secret-token');

      expect(window.sessionStorage.getItem('listenography.apiToken')).toBe(
        'secret-token'
      );
      // jsdom's localStorage shim yields undefined rather than null for a
      // missing key, so assert on the value rather than on null-ness.
      expect(window.localStorage.getItem('listenography.apiToken')).not.toBe(
        'secret-token'
      );
    });

    it('trims surrounding whitespace from a pasted token', () => {
      setApiToken('  padded-token \n');
      expect(getApiToken()).toBe('padded-token');
    });

    it('treats a whitespace-only token as unset', () => {
      setApiToken('   ');
      expect(getApiToken()).toBeNull();
    });

    it('clears the stored token', () => {
      setApiToken('secret-token');
      clearApiToken();

      expect(getApiToken()).toBeNull();
      expect(
        window.sessionStorage.getItem('listenography.apiToken')
      ).toBeNull();
    });
  });

  describe('authHeader', () => {
    it('is empty when no token is set', () => {
      expect(authHeader()).toEqual({});
    });

    it('produces a Bearer header when a token is set', () => {
      setApiToken('secret-token');
      expect(authHeader()).toEqual({ Authorization: 'Bearer secret-token' });
    });

    it('goes back to empty after clearing', () => {
      setApiToken('secret-token');
      clearApiToken();
      expect(authHeader()).toEqual({});
    });
  });
});
