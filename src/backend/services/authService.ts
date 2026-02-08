import crypto from 'crypto';

import { UserSettings } from '../../shared/types';
import { EncryptionKeyValidator } from '../utils/encryptionValidator';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

const logger = createLogger('AuthService');
const SETTINGS_PATH = 'settings/user-settings.json';

/**
 * Thrown when decryption fails, distinguishing "wrong key" from "no credentials."
 */
export class DecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecryptionError';
  }
}

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

  /**
   * Encrypt using AES-256-GCM with scrypt key derivation.
   * Format: base64(salt(16) + iv(12) + authTag(16) + ciphertext)
   */
  private encrypt(text: string): string {
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(this.encryptionKey, salt, 32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([salt, iv, authTag, encrypted]).toString('base64');
  }

  /**
   * Decrypt data. Detects format automatically:
   * - Legacy CryptoJS (AES-CBC with EVP_BytesToKey): base64 decodes to "Salted__" prefix
   * - Native AES-256-GCM: salt(16) + iv(12) + authTag(16) + ciphertext
   */
  private decrypt(encryptedText: string): string {
    try {
      const data = Buffer.from(encryptedText, 'base64');

      // Detect legacy CryptoJS format: starts with "Salted__"
      if (
        data.length >= 16 &&
        data.subarray(0, 8).toString('ascii') === 'Salted__'
      ) {
        return this.decryptLegacyCryptoJS(data);
      }

      // Native AES-256-GCM: salt(16) + iv(12) + authTag(16) + ciphertext
      if (data.length < 45) {
        throw new DecryptionError('Encrypted data too short or malformed');
      }

      const salt = data.subarray(0, 16);
      const iv = data.subarray(16, 28);
      const authTag = data.subarray(28, 44);
      const ciphertext = data.subarray(44);

      const key = crypto.scryptSync(this.encryptionKey, salt, 32);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      const decrypted =
        decipher.update(ciphertext, undefined, 'utf8') + decipher.final('utf8');

      if (!decrypted && encryptedText) {
        throw new DecryptionError(
          'Decryption returned empty result - encryption key may have changed. ' +
            'Re-authenticate with Discogs and Last.fm, or restore from backup.'
        );
      }

      return decrypted;
    } catch (error) {
      if (error instanceof DecryptionError) throw error;
      throw new DecryptionError(
        `Decryption failed: ${error instanceof Error ? error.message : String(error)}. ` +
          'The encryption key may have changed. Re-authenticate or restore from backup.'
      );
    }
  }

  /**
   * Decrypt legacy CryptoJS AES format (EVP_BytesToKey + AES-256-CBC).
   * Retained for backward compatibility with existing encrypted credentials.
   */
  private decryptLegacyCryptoJS(data: Buffer): string {
    const salt = data.subarray(8, 16);
    const ciphertext = data.subarray(16);

    // EVP_BytesToKey: derive 32-byte key + 16-byte IV using MD5
    const password = Buffer.from(this.encryptionKey, 'utf8');
    const keyIv = Buffer.alloc(48);
    let hash = Buffer.alloc(0);
    let offset = 0;

    while (offset < 48) {
      const md5 = crypto.createHash('md5');
      if (hash.length > 0) md5.update(hash);
      md5.update(password);
      md5.update(salt);
      hash = md5.digest();
      hash.copy(keyIv, offset);
      offset += hash.length;
    }

    const key = keyIv.subarray(0, 32);
    const iv = keyIv.subarray(32, 48);

    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const decrypted =
      decipher.update(ciphertext, undefined, 'utf8') + decipher.final('utf8');

    if (!decrypted && data.length > 16) {
      throw new DecryptionError(
        'Decryption returned empty result - encryption key may have changed. ' +
          'Re-authenticate with Discogs and Last.fm, or restore from backup.'
      );
    }

    return decrypted;
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
    // Can be bypassed with allowCredentialClear for intentional clears
    if (
      !options?.allowCredentialClear &&
      !this.hasAuthTokens(encryptedSettings)
    ) {
      try {
        const existing =
          await this.fileStorage.readJSON<UserSettings>(SETTINGS_PATH);
        if (existing && this.hasAuthTokens(existing)) {
          logger.error(
            'BLOCKED: Refusing to overwrite auth tokens with empty values',
            {
              hasDiscogsToken: !!existing.discogs.token,
              hasLastfmApiKey: !!existing.lastfm.apiKey,
              hasLastfmSessionKey: !!existing.lastfm.sessionKey,
            }
          );
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
        // File doesn't exist or other read error - OK to proceed
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
