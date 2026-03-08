/**
 * Tests for the navigate() wrapper in routes.ts
 */
import { navigate, ROUTES } from '../../../src/renderer/routes';

describe('navigate()', () => {
  beforeEach(() => {
    // Reset hash before each test
    window.location.hash = '';
  });

  afterEach(() => {
    window.location.hash = '';
  });

  describe('simple routes (no params)', () => {
    it('should set window.location.hash to the given route', () => {
      // Arrange / Act
      navigate(ROUTES.STATS);

      // Assert
      expect(window.location.hash).toBe('#stats');
    });

    it('should strip a leading # from the route', () => {
      navigate('#home');
      expect(window.location.hash).toBe('#home');
    });

    it('should strip a leading / from the route', () => {
      navigate('/collection');
      expect(window.location.hash).toBe('#collection');
    });

    it('should handle an empty params object like no params', () => {
      navigate(ROUTES.HOME, {});
      expect(window.location.hash).toBe('#home');
    });
  });

  describe('parameterised routes', () => {
    it('should append query params to the route', () => {
      navigate(ROUTES.SETTINGS, { tab: 'connections' });
      expect(window.location.hash).toBe('#settings?tab=connections');
    });

    it('should merge params with existing query string in the route path', () => {
      navigate('marketplace?tab=wishlist', { seller: 'bob' });
      // Both tab (from path) and seller (from params) should be present
      const hash = window.location.hash.replace('#', '');
      const [base, qs] = hash.split('?');
      const params = new URLSearchParams(qs);
      expect(base).toBe('marketplace');
      expect(params.get('tab')).toBe('wishlist');
      expect(params.get('seller')).toBe('bob');
    });

    it('should overwrite a param from the path when the same key is passed in params', () => {
      navigate('marketplace?tab=sellers', { tab: 'matches' });
      const qs = window.location.hash.replace('#marketplace?', '');
      const params = new URLSearchParams(qs);
      expect(params.get('tab')).toBe('matches');
    });

    it('should handle multiple params', () => {
      navigate(ROUTES.ARTIST_DETAIL, { from: 'stats' });
      expect(window.location.hash).toBe('#artist?from=stats');
    });
  });
});
