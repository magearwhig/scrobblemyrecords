import crypto from 'crypto';

import CryptoJS from 'crypto-js';

import { UserSettings } from '../../shared/types';
import { EncryptionKeyValidator } from '../utils/encryptionValidator';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

const logger = createLogger('AuthService');
const SETTINGS_PATH = 'settings/user-settings.json';

export class AuthService {
  private fileStorage: FileStorage;
  private encryptionKey: string;

  constructor(fileStorage: FileStorage) {
    this.fileStorage = fileStorage;

    // Validate encryption key at startup - no fallback defaults allowed
    const encryptionKey = process.env.ENCRYPTION_KEY;

    if (!encryptionKey) {
      EncryptionKeyValidator.validateAndThrow('', 'AuthService');
      throw new Error('ENCRYPTION_KEY environment variable is required'); // This won't be reached but satisfies TypeScript
    }

    // Validate key strength and security
    EncryptionKeyValidator.validateAndThrow(encryptionKey, 'AuthService');

    this.encryptionKey = encryptionKey;
  }

  private encrypt(text: string): string {
    return CryptoJS.AES.encrypt(text, this.encryptionKey).toString();
  }

  private decrypt(encryptedText: string): string {
    try {
      const bytes = CryptoJS.AES.decrypt(encryptedText, this.encryptionKey);
      const decrypted = bytes.toString(CryptoJS.enc.Utf8);

      // If decryption returns empty string for non-empty input, key may have changed
      if (!decrypted && encryptedText) {
        logger.warn(
          'Decryption returned empty string - encryption key may have changed'
        );
      }

      return decrypted;
    } catch (error) {
      logger.error('Decryption failed', error);
      return '';
    }
  }

  /**
   * Checks if settings contain any credentials (tokens/keys).
   */
  private hasCredentials(settings: UserSettings): boolean {
    return !!(
      settings.discogs.token ||
      settings.discogs.username ||
      settings.lastfm.apiKey ||
      settings.lastfm.sessionKey ||
      settings.lastfm.username
    );
  }

  /**
   * Checks if settings contain authentication tokens (not just usernames).
   * Used to detect decryption failures where tokens become empty but usernames remain.
   */
  private hasAuthTokens(settings: UserSettings): boolean {
    return !!(
      settings.discogs.token ||
      settings.lastfm.apiKey ||
      settings.lastfm.sessionKey
    );
  }

  async getUserSettings(): Promise<UserSettings> {
    const fileStats = await this.fileStorage.getStats(SETTINGS_PATH);

    // Try to read existing settings
    let settings: UserSettings | null = null;
    let parseError: Error | null = null;

    try {
      settings = await this.fileStorage.readJSON<UserSettings>(SETTINGS_PATH);
    } catch (error) {
      parseError = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to parse settings file', {
        error: parseError.message,
        fileExists: fileStats.exists,
        fileSize: fileStats.size,
      });
    }

    // If file exists but couldn't be parsed, don't overwrite with defaults
    if (fileStats.exists && !settings) {
      logger.error(
        'Settings file exists but could not be parsed - NOT overwriting with defaults',
        {
          fileSize: fileStats.size,
          mtime: fileStats.mtime,
          parseError: parseError?.message,
        }
      );

      // Return empty settings in memory but DON'T save them
      // This prevents data loss if there's a temporary issue
      return {
        discogs: {},
        lastfm: {},
        preferences: {
          defaultTimestamp: 'now',
          batchSize: 50,
          autoScrobble: false,
        },
      };
    }

    // File doesn't exist - create default settings
    if (!settings) {
      logger.info('No settings file found - creating default settings');
      const defaultSettings: UserSettings = {
        discogs: {},
        lastfm: {},
        preferences: {
          defaultTimestamp: 'now',
          batchSize: 50,
          autoScrobble: false,
        },
      };
      await this.saveUserSettings(defaultSettings);
      return defaultSettings;
    }

    // Decrypt stored tokens with validation
    const decryptedSettings = this.decryptSettings(settings);

    // Check if decryption may have failed (had tokens but now empty)
    // Use hasAuthTokens to check specifically for tokens, not usernames
    // This catches the case where tokens fail to decrypt but usernames survive
    if (
      this.hasAuthTokens(settings) &&
      !this.hasAuthTokens(decryptedSettings)
    ) {
      logger.error(
        'DECRYPTION FAILURE DETECTED: Settings had auth tokens but decryption returned empty values. ' +
          'This usually means the encryption key has changed.',
        {
          hadDiscogsToken: !!settings.discogs.token,
          hadLastfmApiKey: !!settings.lastfm.apiKey,
          hadLastfmSessionKey: !!settings.lastfm.sessionKey,
          // Don't log actual values, just presence
        }
      );
      // CRITICAL: Throw error to prevent any code path from accidentally saving empty tokens
      throw new Error(
        'Decryption failed: encryption key may have changed. ' +
          'Restore ENCRYPTION_KEY from backup or re-authenticate all services.'
      );
    }

    return decryptedSettings;
  }

  /**
   * Decrypts sensitive fields in settings, creating a deep copy.
   */
  private decryptSettings(settings: UserSettings): UserSettings {
    // Deep copy to avoid mutating the original
    const decrypted: UserSettings = {
      discogs: { ...settings.discogs },
      lastfm: { ...settings.lastfm },
      preferences: { ...settings.preferences },
      temp: settings.temp ? { ...settings.temp } : undefined,
    };

    if (decrypted.discogs.token) {
      decrypted.discogs.token = this.decrypt(decrypted.discogs.token);
    }
    if (decrypted.lastfm.apiKey) {
      decrypted.lastfm.apiKey = this.decrypt(decrypted.lastfm.apiKey);
    }
    if (decrypted.lastfm.sessionKey) {
      decrypted.lastfm.sessionKey = this.decrypt(decrypted.lastfm.sessionKey);
    }

    return decrypted;
  }

  async saveUserSettings(
    settings: UserSettings,
    options?: { allowCredentialClear?: boolean }
  ): Promise<void> {
    // Deep copy to avoid mutating the original settings object
    const encryptedSettings: UserSettings = {
      discogs: { ...settings.discogs },
      lastfm: { ...settings.lastfm },
      preferences: { ...settings.preferences },
      temp: settings.temp ? { ...settings.temp } : undefined,
    };

    // Encrypt sensitive data
    if (encryptedSettings.discogs.token) {
      encryptedSettings.discogs.token = this.encrypt(
        encryptedSettings.discogs.token
      );
    }
    if (encryptedSettings.lastfm.apiKey) {
      encryptedSettings.lastfm.apiKey = this.encrypt(
        encryptedSettings.lastfm.apiKey
      );
    }
    if (encryptedSettings.lastfm.sessionKey) {
      encryptedSettings.lastfm.sessionKey = this.encrypt(
        encryptedSettings.lastfm.sessionKey
      );
    }

    // SAFETY: Block saving empty tokens if existing file has them
    // This prevents accidental credential loss due to decryption failures
    // Uses hasAuthTokens to check specifically for tokens, not usernames
    // Can be bypassed with allowCredentialClear for intentional clears
    if (!options?.allowCredentialClear) {
      const fileStats = await this.fileStorage.getStats(SETTINGS_PATH);
      if (fileStats.exists && fileStats.size && fileStats.size > 200) {
        // File has substantial content
        const hasNewTokens = this.hasAuthTokens(encryptedSettings);
        if (!hasNewTokens) {
          // Read existing to check if it has tokens
          try {
            const existing =
              await this.fileStorage.readJSON<UserSettings>(SETTINGS_PATH);
            if (existing && this.hasAuthTokens(existing)) {
              logger.error(
                'BLOCKED: Refusing to overwrite auth tokens with empty values',
                {
                  existingSize: fileStats.size,
                  hasDiscogsToken: !!existing.discogs.token,
                  hasLastfmApiKey: !!existing.lastfm.apiKey,
                  hasLastfmSessionKey: !!existing.lastfm.sessionKey,
                }
              );
              // Don't save - this would destroy user credentials
              throw new Error(
                'Cannot save settings: would overwrite existing auth tokens with empty values. ' +
                  'This usually means the encryption key has changed. Restore from backup or re-authenticate.'
              );
            }
          } catch (readError) {
            // If it's our own error, re-throw it
            if (
              readError instanceof Error &&
              readError.message.includes('Cannot save settings')
            ) {
              throw readError;
            }
            // Other read errors - proceed with caution but log
            logger.warn(
              'Could not read existing settings to verify',
              readError
            );
          }
        }
      }
    }

    // Use backup-enabled write for settings
    logger.debug('Saving user settings with backup');
    await this.fileStorage.writeJSONWithBackup(
      SETTINGS_PATH,
      encryptedSettings
    );
  }

  async setDiscogsToken(token: string, username?: string): Promise<void> {
    const settings = await this.getUserSettings();
    settings.discogs.token = token;
    if (username) {
      settings.discogs.username = username;
    }
    await this.saveUserSettings(settings);
  }

  async setLastFmCredentials(
    apiKey: string,
    sessionKey: string,
    username?: string
  ): Promise<void> {
    const settings = await this.getUserSettings();
    settings.lastfm.apiKey = apiKey;
    settings.lastfm.sessionKey = sessionKey;
    if (username) {
      settings.lastfm.username = username;
    }
    await this.saveUserSettings(settings);
  }

  async getDiscogsToken(): Promise<string | undefined> {
    const settings = await this.getUserSettings();
    return settings.discogs.token;
  }

  async getLastFmCredentials(): Promise<{
    apiKey?: string;
    sessionKey?: string;
    username?: string;
  }> {
    const settings = await this.getUserSettings();
    return {
      apiKey: settings.lastfm.apiKey,
      sessionKey: settings.lastfm.sessionKey,
      username: settings.lastfm.username,
    };
  }

  async clearTokens(): Promise<void> {
    const settings = await this.getUserSettings();
    settings.discogs = {};
    settings.lastfm = {};
    // Intentional clear - bypass credential protection
    await this.saveUserSettings(settings, { allowCredentialClear: true });
  }

  generateNonce(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  // OAuth token secret storage (temporary)
  async storeOAuthTokenSecret(tokenSecret: string): Promise<void> {
    const settings = await this.getUserSettings();
    settings.temp = settings.temp || {};
    settings.temp.oauthTokenSecret = tokenSecret;
    await this.saveUserSettings(settings);
  }

  async getOAuthTokenSecret(): Promise<string | undefined> {
    const settings = await this.getUserSettings();
    return settings.temp?.oauthTokenSecret;
  }

  async clearOAuthTokenSecret(): Promise<void> {
    const settings = await this.getUserSettings();
    if (settings.temp) {
      delete settings.temp.oauthTokenSecret;
      if (Object.keys(settings.temp).length === 0) {
        delete settings.temp;
      }
    }
    await this.saveUserSettings(settings);
  }

  generateTimestamp(): string {
    return Math.floor(Date.now() / 1000).toString();
  }
}
