import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { AuthService } from '../../../src/backend/services/authService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';

/**
 * The OAuth callback routes are exempt from API authentication, so these
 * one-use, expiring transactions are the only thing standing between a
 * reachable callback and an attacker binding their own Discogs/Last.fm account
 * to this instance. Test the semantics directly.
 */
describe('AuthService pending OAuth transactions', () => {
  let dir: string;
  let authService: AuthService;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pending-oauth-'));
    authService = new AuthService(new FileStorage(dir));
  });

  afterEach(async () => {
    jest.useRealTimers();
    await fs.rm(dir, { recursive: true, force: true });
  });

  describe('Discogs', () => {
    it('accepts the request token that was stored', async () => {
      await authService.storePendingDiscogsRequest('req_token', 'secret');

      await expect(
        authService.consumePendingDiscogsRequest('req_token')
      ).resolves.toBe(true);
    });

    it('keeps the token secret needed to complete the exchange', async () => {
      await authService.storePendingDiscogsRequest('req_token', 'the_secret');

      await expect(authService.getOAuthTokenSecret()).resolves.toBe(
        'the_secret'
      );
    });

    it('rejects a different request token', async () => {
      await authService.storePendingDiscogsRequest('req_token', 'secret');

      await expect(
        authService.consumePendingDiscogsRequest('other_token')
      ).resolves.toBe(false);
    });

    it('rejects when no flow was ever started', async () => {
      await expect(
        authService.consumePendingDiscogsRequest('anything')
      ).resolves.toBe(false);
    });

    it('rejects an empty token even against empty state', async () => {
      await expect(authService.consumePendingDiscogsRequest('')).resolves.toBe(
        false
      );
    });

    it('is single-use — a replay fails', async () => {
      await authService.storePendingDiscogsRequest('req_token', 'secret');

      await expect(
        authService.consumePendingDiscogsRequest('req_token')
      ).resolves.toBe(true);
      await expect(
        authService.consumePendingDiscogsRequest('req_token')
      ).resolves.toBe(false);
    });

    it('leaves a pending flow intact after a wrong guess', async () => {
      // The callbacks are reachable without an API token, so consuming on
      // mismatch would let anyone cancel a sign-in in progress with one junk
      // request. The values are high-entropy; guessing is not the threat.
      await authService.storePendingDiscogsRequest('req_token', 'secret');

      await expect(
        authService.consumePendingDiscogsRequest('wrong')
      ).resolves.toBe(false);
      await expect(
        authService.consumePendingDiscogsRequest('req_token')
      ).resolves.toBe(true);
    });

    it('supports two flows started at once', async () => {
      await authService.storePendingDiscogsRequest('token_a', 'secret_a');
      await authService.storePendingDiscogsRequest('token_b', 'secret_b');

      // Starting the second must not invalidate the first.
      await expect(
        authService.consumePendingDiscogsRequest('token_a')
      ).resolves.toBe(true);
      await expect(
        authService.consumePendingDiscogsRequest('token_b')
      ).resolves.toBe(true);
    });

    it('drops expired entries rather than accumulating them', async () => {
      await authService.storePendingDiscogsRequest('old_token', 'secret');

      jest.useFakeTimers();
      jest.setSystemTime(Date.now() + 11 * 60 * 1000);
      await authService.storePendingDiscogsRequest('new_token', 'secret');
      jest.useRealTimers();

      const settings = await authService.getUserSettings();
      expect(settings.temp?.pendingDiscogsRequests).toHaveLength(1);
    });

    it('bounds how many transactions can be stored', async () => {
      for (let i = 0; i < 25; i++) {
        await authService.storePendingDiscogsRequest(`token_${i}`, 'secret');
      }

      const settings = await authService.getUserSettings();
      expect(
        (settings.temp?.pendingDiscogsRequests ?? []).length
      ).toBeLessThanOrEqual(10);
    });

    it('expires after the TTL', async () => {
      await authService.storePendingDiscogsRequest('req_token', 'secret');

      jest.useFakeTimers();
      jest.setSystemTime(Date.now() + 11 * 60 * 1000);

      await expect(
        authService.consumePendingDiscogsRequest('req_token')
      ).resolves.toBe(false);
    });
  });

  describe('Last.fm', () => {
    it('accepts the nonce it issued', async () => {
      const nonce = await authService.storePendingLastFmNonce();

      await expect(authService.consumePendingLastFmNonce(nonce)).resolves.toBe(
        true
      );
    });

    it('issues an unpredictable nonce', async () => {
      const nonces = new Set<string>();
      for (let i = 0; i < 20; i++) {
        nonces.add(await authService.storePendingLastFmNonce());
      }

      expect(nonces.size).toBe(20);
      for (const nonce of nonces) {
        expect(nonce.length).toBeGreaterThanOrEqual(32);
      }
    });

    it('rejects a guessed nonce', async () => {
      await authService.storePendingLastFmNonce();

      await expect(
        authService.consumePendingLastFmNonce('guessed')
      ).resolves.toBe(false);
    });

    it('rejects an empty nonce when none is pending', async () => {
      await expect(authService.consumePendingLastFmNonce('')).resolves.toBe(
        false
      );
    });

    it('rejects an empty nonce even while one is pending', async () => {
      await authService.storePendingLastFmNonce();

      await expect(authService.consumePendingLastFmNonce('')).resolves.toBe(
        false
      );
    });

    it('is single-use — a replay fails', async () => {
      const nonce = await authService.storePendingLastFmNonce();

      await expect(authService.consumePendingLastFmNonce(nonce)).resolves.toBe(
        true
      );
      await expect(authService.consumePendingLastFmNonce(nonce)).resolves.toBe(
        false
      );
    });

    it('leaves a pending flow intact after a wrong guess', async () => {
      const nonce = await authService.storePendingLastFmNonce();

      await expect(authService.consumePendingLastFmNonce('junk')).resolves.toBe(
        false
      );
      await expect(authService.consumePendingLastFmNonce(nonce)).resolves.toBe(
        true
      );
    });

    it('supports two flows started at once', async () => {
      const first = await authService.storePendingLastFmNonce();
      const second = await authService.storePendingLastFmNonce();

      await expect(authService.consumePendingLastFmNonce(first)).resolves.toBe(
        true
      );
      await expect(authService.consumePendingLastFmNonce(second)).resolves.toBe(
        true
      );
    });

    it('expires after the TTL', async () => {
      const nonce = await authService.storePendingLastFmNonce();

      jest.useFakeTimers();
      jest.setSystemTime(Date.now() + 11 * 60 * 1000);

      await expect(authService.consumePendingLastFmNonce(nonce)).resolves.toBe(
        false
      );
    });
  });

  it('keeps the two flows independent', async () => {
    await authService.storePendingDiscogsRequest('req_token', 'secret');
    const nonce = await authService.storePendingLastFmNonce();

    await expect(
      authService.consumePendingDiscogsRequest('req_token')
    ).resolves.toBe(true);
    await expect(authService.consumePendingLastFmNonce(nonce)).resolves.toBe(
      true
    );
  });
});
