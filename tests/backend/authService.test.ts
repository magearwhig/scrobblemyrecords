import { AuthService } from '../../src/backend/services/authService';
import { FileStorage } from '../../src/backend/utils/fileStorage';
import * as fs from 'fs/promises';

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

  describe('getUserSettings', () => {
    it('should return default settings when no settings file exists', async () => {
      const settings = await authService.getUserSettings();
      
      expect(settings).toEqual({
        discogs: {},
        lastfm: {},
        preferences: {
          defaultTimestamp: 'now',
          batchSize: 50,
          autoScrobble: false
        }
      });
    });

    it('should read existing settings', async () => {
      const testSettings = {
        discogs: { username: 'testuser' },
        lastfm: { username: 'testuser' },
        preferences: {
          defaultTimestamp: 'custom' as const,
          batchSize: 100,
          autoScrobble: true
        }
      };
      
      await fileStorage.writeJSON('settings/user-settings.json', testSettings);
      const settings = await authService.getUserSettings();
      
      expect(settings.discogs.username).toBe('testuser');
      expect(settings.lastfm.username).toBe('testuser');
      expect(settings.preferences.batchSize).toBe(100);
    });
  });

  describe('setDiscogsToken', () => {
    it('should save Discogs token and username', async () => {
      const token = 'test-token';
      const username = 'testuser';
      
      await authService.setDiscogsToken(token, username);
      
      const settings = await authService.getUserSettings();
      expect(settings.discogs.token).toBe(token);
      expect(settings.discogs.username).toBe(username);
    });

    it('should save token without username', async () => {
      const token = 'test-token';
      
      await authService.setDiscogsToken(token);
      
      const settings = await authService.getUserSettings();
      expect(settings.discogs.token).toBe(token);
      expect(settings.discogs.username).toBeUndefined();
    });
  });

  describe('setLastFmCredentials', () => {
    it('should save Last.fm credentials', async () => {
      const apiKey = 'test-api-key';
      const sessionKey = 'test-session-key';
      const username = 'testuser';
      
      await authService.setLastFmCredentials(apiKey, sessionKey, username);
      
      const settings = await authService.getUserSettings();
      expect(settings.lastfm.apiKey).toBe(apiKey);
      expect(settings.lastfm.sessionKey).toBe(sessionKey);
      expect(settings.lastfm.username).toBe(username);
    });
  });

  describe('getDiscogsToken', () => {
    it('should return stored Discogs token', async () => {
      const token = 'test-token';
      await authService.setDiscogsToken(token);
      
      const retrievedToken = await authService.getDiscogsToken();
      expect(retrievedToken).toBe(token);
    });

    it('should return undefined when no token exists', async () => {
      const token = await authService.getDiscogsToken();
      expect(token).toBeUndefined();
    });
  });

  describe('getLastFmCredentials', () => {
    it('should return stored Last.fm credentials', async () => {
      const apiKey = 'test-api-key';
      const sessionKey = 'test-session-key';
      const username = 'testuser';
      
      await authService.setLastFmCredentials(apiKey, sessionKey, username);
      
      const credentials = await authService.getLastFmCredentials();
      expect(credentials.apiKey).toBe(apiKey);
      expect(credentials.sessionKey).toBe(sessionKey);
      expect(credentials.username).toBe(username);
    });

    it('should return empty object when no credentials exist', async () => {
      const credentials = await authService.getLastFmCredentials();
      expect(credentials).toEqual({});
    });
  });

  describe('clearTokens', () => {
    it('should clear all authentication tokens', async () => {
      await authService.setDiscogsToken('test-token', 'user1');
      await authService.setLastFmCredentials('api-key', 'session-key', 'user2');
      
      await authService.clearTokens();
      
      const settings = await authService.getUserSettings();
      expect(settings.discogs).toEqual({});
      expect(settings.lastfm).toEqual({});
    });
  });

  describe('generateNonce', () => {
    it('should generate unique nonce values', () => {
      const nonce1 = authService.generateNonce();
      const nonce2 = authService.generateNonce();
      
      expect(nonce1).toBeTruthy();
      expect(nonce2).toBeTruthy();
      expect(nonce1).not.toBe(nonce2);
      expect(nonce1.length).toBe(32); // 16 bytes in hex
    });
  });

  describe('generateTimestamp', () => {
    it('should generate valid timestamp', () => {
      const timestamp = authService.generateTimestamp();
      const now = Math.floor(Date.now() / 1000);
      
      expect(parseInt(timestamp)).toBeCloseTo(now, -1);
    });
  });
});