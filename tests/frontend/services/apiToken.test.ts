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

    it('persists to localStorage so it outlives the browser session', () => {
      setApiToken('secret-token');

      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        'listenography.apiToken',
        'secret-token'
      );
      expect(
        window.sessionStorage.getItem('listenography.apiToken')
      ).toBeNull();
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
      expect(window.localStorage.removeItem).toHaveBeenCalledWith(
        'listenography.apiToken'
      );
    });
  });

  describe('loading a saved token', () => {
    const load = () => {
      let fresh: typeof import('../../../src/renderer/services/apiToken');
      jest.isolateModules(() => {
        fresh = require('../../../src/renderer/services/apiToken');
      });
      return fresh!;
    };

    it('reads the token saved in localStorage', () => {
      (window.localStorage.getItem as jest.Mock).mockReturnValue('kept-token');
      expect(load().getApiToken()).toBe('kept-token');
    });

    it('moves a token an older build saved for the session', () => {
      (window.localStorage.getItem as jest.Mock).mockReturnValue(null);
      window.sessionStorage.setItem('listenography.apiToken', 'old-token');

      expect(load().getApiToken()).toBe('old-token');
      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        'listenography.apiToken',
        'old-token'
      );
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
