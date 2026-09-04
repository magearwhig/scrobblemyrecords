import {
  AuthConfigurationError,
  isLoopbackHost,
  resolveAuthPolicy,
} from '../../../src/backend/utils/authPolicy';

describe('authPolicy', () => {
  describe('isLoopbackHost', () => {
    it.each(['127.0.0.1', '127.1.2.3', '::1', '[::1]', 'localhost'])(
      'treats %s as loopback',
      host => {
        expect(isLoopbackHost(host)).toBe(true);
      }
    );

    it.each([
      '0.0.0.0',
      '::',
      '192.168.1.50',
      '10.0.0.5',
      '', // empty means "all interfaces"
      'example.com',
      'garbage',
    ])('treats %p as exposed', host => {
      expect(isLoopbackHost(host)).toBe(false);
    });

    it('fails closed on an address it cannot parse', () => {
      // Guessing "safe" for an unrecognized value is the wrong direction.
      expect(isLoopbackHost('127.0.0.1.evil.com')).toBe(false);
    });
  });

  describe('resolveAuthPolicy', () => {
    const token = 'a'.repeat(64);

    describe('loopback bind', () => {
      it('requires no auth without a token — the ordinary local setup', () => {
        expect(resolveAuthPolicy('127.0.0.1', {})).toEqual({
          authRequired: false,
        });
      });

      it('still enforces a token if one is configured', () => {
        const policy = resolveAuthPolicy('127.0.0.1', { API_TOKEN: token });
        expect(policy.authRequired).toBe(true);
        expect(policy.token).toBe(token);
      });
    });

    describe('non-loopback bind', () => {
      it('enforces auth when a token is configured', () => {
        const policy = resolveAuthPolicy('0.0.0.0', { API_TOKEN: token });
        expect(policy).toEqual({
          authRequired: true,
          token,
          reason: 'non-loopback-bind',
        });
      });

      it.each(['0.0.0.0', '::', '192.168.1.50'])(
        'refuses to start on %s without a token',
        host => {
          expect(() => resolveAuthPolicy(host, {})).toThrow(
            AuthConfigurationError
          );
        }
      );

      it('explains what to do in the error', () => {
        expect(() => resolveAuthPolicy('0.0.0.0', {})).toThrow(
          /API_TOKEN.*openssl rand -hex 32/s
        );
      });

      it('rejects a token too short to be worth anything', () => {
        expect(() =>
          resolveAuthPolicy('0.0.0.0', { API_TOKEN: 'short' })
        ).toThrow(/too short/);
      });

      it('ignores a whitespace-only token', () => {
        expect(() =>
          resolveAuthPolicy('0.0.0.0', { API_TOKEN: '   ' })
        ).toThrow(AuthConfigurationError);
      });
    });

    describe('REQUIRE_AUTH', () => {
      it('demands a token even on loopback', () => {
        // Covers the reverse-proxy case: a loopback-bound process can still be
        // published to the internet, which the bind address cannot reveal.
        expect(() =>
          resolveAuthPolicy('127.0.0.1', { REQUIRE_AUTH: 'true' })
        ).toThrow(AuthConfigurationError);
      });

      it('is satisfied by a configured token', () => {
        const policy = resolveAuthPolicy('127.0.0.1', {
          REQUIRE_AUTH: 'true',
          API_TOKEN: token,
        });
        expect(policy.authRequired).toBe(true);
      });

      it('only triggers on the exact string "true"', () => {
        expect(resolveAuthPolicy('127.0.0.1', { REQUIRE_AUTH: '1' })).toEqual({
          authRequired: false,
        });
      });
    });
  });
});
