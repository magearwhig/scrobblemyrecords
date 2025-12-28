import * as fs from 'fs/promises';

import { AuthService } from '../../src/backend/services/authService';
import { FileStorage } from '../../src/backend/utils/fileStorage';

describe('AuthService', () => {
  let authService: AuthService;
  let fileStorage: FileStorage;
  const testDataDir = './test-data-auth';

  beforeEach(async () => {
    fileStorage = new FileStorage(testDataDir);
    await fileStorage.ensureDataDir();
    authService = new AuthService(fileStorage);
  });

  afterEach(async () => {
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors if directory doesn't exist
    }
  });

  describe('Discogs Authentication', () => {
    it('should return undefined when no Discogs token exists', async () => {
      const token = await authService.getDiscogsToken();
      expect(token).toBeUndefined();
    });

    it('should store and retrieve Discogs token', async () => {
      const testToken = 'test-discogs-token';
      const testUsername = 'testuser';

      await authService.setDiscogsToken(testToken, testUsername);

      const retrievedToken = await authService.getDiscogsToken();
      expect(retrievedToken).toBe(testToken);

      const settings = await authService.getUserSettings();
      expect(settings.discogs.username).toBe(testUsername);
    });

    it('should clear Discogs token', async () => {
      await authService.setDiscogsToken('test-token', 'testuser');
      await authService.clearTokens();

      const token = await authService.getDiscogsToken();
      expect(token).toBeUndefined();
    });

    it('should handle OAuth token secret storage', async () => {
      const testSecret = 'test-oauth-secret';

      await authService.storeOAuthTokenSecret(testSecret);
      const retrievedSecret = await authService.getOAuthTokenSecret();
      expect(retrievedSecret).toBe(testSecret);

      await authService.clearOAuthTokenSecret();
      const clearedSecret = await authService.getOAuthTokenSecret();
      expect(clearedSecret).toBeUndefined();
    });
  });

  describe('Last.fm Authentication', () => {
    it('should return undefined when no Last.fm credentials exist', async () => {
      const credentials = await authService.getLastFmCredentials();
      expect(credentials.apiKey).toBeUndefined();
      expect(credentials.sessionKey).toBeUndefined();
      expect(credentials.username).toBeUndefined();
    });

    it('should store and retrieve Last.fm credentials', async () => {
      const apiKey = 'test-api-key';
      const sessionKey = 'test-session-key';
      const username = 'testuser';

      await authService.setLastFmCredentials(apiKey, sessionKey, username);

      const retrievedCredentials = await authService.getLastFmCredentials();
      expect(retrievedCredentials.apiKey).toBe(apiKey);
      expect(retrievedCredentials.sessionKey).toBe(sessionKey);
      expect(retrievedCredentials.username).toBe(username);
    });

    it('should clear Last.fm credentials', async () => {
      await authService.setLastFmCredentials(
        'test-key',
        'test-session',
        'testuser'
      );
      await authService.clearTokens();

      const credentials = await authService.getLastFmCredentials();
      expect(credentials.apiKey).toBeUndefined();
      expect(credentials.sessionKey).toBeUndefined();
      expect(credentials.username).toBeUndefined();
    });

    it('should handle partial Last.fm credentials', async () => {
      await authService.setLastFmCredentials('test-key', '', 'testuser');

      const credentials = await authService.getLastFmCredentials();
      expect(credentials.apiKey).toBe('test-key');
      expect(credentials.sessionKey).toBe('');
      expect(credentials.username).toBe('testuser');
    });
  });

  describe('User Settings', () => {
    it('should get default user settings', async () => {
      const settings = await authService.getUserSettings();
      expect(settings.preferences.defaultTimestamp).toBe('now');
      expect(settings.preferences.batchSize).toBe(50);
      expect(settings.preferences.autoScrobble).toBe(false);
    });

    it('should save and retrieve user settings', async () => {
      const testSettings = {
        discogs: { username: 'testuser' },
        lastfm: { username: 'testuser' },
        preferences: {
          defaultTimestamp: 'custom' as const,
          batchSize: 20,
          autoScrobble: true,
        },
      };

      await authService.saveUserSettings(testSettings);

      const settings = await authService.getUserSettings();
      expect(settings.preferences.defaultTimestamp).toBe('custom');
      expect(settings.preferences.batchSize).toBe(20);
      expect(settings.preferences.autoScrobble).toBe(true);
      expect(settings.discogs.username).toBe('testuser');
    });
  });

  describe('Utility Methods', () => {
    it('should generate unique nonce values', () => {
      const nonce1 = authService.generateNonce();
      const nonce2 = authService.generateNonce();

      expect(nonce1).toBeTruthy();
      expect(nonce2).toBeTruthy();
      expect(nonce1).not.toBe(nonce2);
      expect(nonce1.length).toBe(32); // 16 bytes in hex
    });

    it('should generate valid timestamp', () => {
      const timestamp = authService.generateTimestamp();
      const now = Math.floor(Date.now() / 1000);

      expect(parseInt(timestamp)).toBeCloseTo(now, -1);
    });
  });

  describe('Error Handling', () => {
    it('should gracefully handle file read errors and return default settings', async () => {
      // Mock file storage to throw an error on read but report file exists
      jest
        .spyOn(fileStorage, 'readJSON')
        .mockRejectedValue(new Error('File read error'));
      jest
        .spyOn(fileStorage, 'getStats')
        .mockResolvedValue({ exists: true, size: 500 });

      // AuthService should NOT propagate errors - it returns defaults to prevent crashes
      // but doesn't save them (to preserve the original file)
      const token = await authService.getDiscogsToken();
      const creds = await authService.getLastFmCredentials();

      expect(token).toBeUndefined();
      expect(creds.apiKey).toBeUndefined();
      expect(creds.sessionKey).toBeUndefined();
    });

    it('should handle file write errors by propagating them', async () => {
      // Mock file storage to throw an error on write
      jest
        .spyOn(fileStorage, 'writeJSONWithBackup')
        .mockRejectedValue(new Error('File write error'));

      // AuthService doesn't catch write errors, so they should propagate
      await expect(
        authService.setDiscogsToken('test-token', 'testuser')
      ).rejects.toThrow('File write error');
    });
  });
});
