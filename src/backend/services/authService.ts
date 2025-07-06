import crypto from 'crypto';
import CryptoJS from 'crypto-js';
import { FileStorage } from '../utils/fileStorage';
import { UserSettings } from '../../shared/types';

export class AuthService {
  private fileStorage: FileStorage;
  private encryptionKey: string;

  constructor(fileStorage: FileStorage) {
    this.fileStorage = fileStorage;
    this.encryptionKey = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-me';
  }

  private encrypt(text: string): string {
    return CryptoJS.AES.encrypt(text, this.encryptionKey).toString();
  }

  private decrypt(encryptedText: string): string {
    const bytes = CryptoJS.AES.decrypt(encryptedText, this.encryptionKey);
    return bytes.toString(CryptoJS.enc.Utf8);
  }

  async getUserSettings(): Promise<UserSettings> {
    const settings = await this.fileStorage.readJSON<UserSettings>('settings/user-settings.json');
    
    if (!settings) {
      const defaultSettings: UserSettings = {
        discogs: {},
        lastfm: {},
        preferences: {
          defaultTimestamp: 'now',
          batchSize: 50,
          autoScrobble: false
        }
      };
      await this.saveUserSettings(defaultSettings);
      return defaultSettings;
    }

    // Decrypt stored tokens
    if (settings.discogs.token) {
      settings.discogs.token = this.decrypt(settings.discogs.token);
    }
    if (settings.lastfm.apiKey) {
      settings.lastfm.apiKey = this.decrypt(settings.lastfm.apiKey);
    }
    if (settings.lastfm.sessionKey) {
      settings.lastfm.sessionKey = this.decrypt(settings.lastfm.sessionKey);
    }

    return settings;
  }

  async saveUserSettings(settings: UserSettings): Promise<void> {
    // Encrypt sensitive data before saving
    const encryptedSettings = { ...settings };
    
    if (encryptedSettings.discogs.token) {
      encryptedSettings.discogs.token = this.encrypt(encryptedSettings.discogs.token);
    }
    if (encryptedSettings.lastfm.apiKey) {
      encryptedSettings.lastfm.apiKey = this.encrypt(encryptedSettings.lastfm.apiKey);
    }
    if (encryptedSettings.lastfm.sessionKey) {
      encryptedSettings.lastfm.sessionKey = this.encrypt(encryptedSettings.lastfm.sessionKey);
    }

    await this.fileStorage.writeJSON('settings/user-settings.json', encryptedSettings);
  }

  async setDiscogsToken(token: string, username?: string): Promise<void> {
    const settings = await this.getUserSettings();
    settings.discogs.token = token;
    if (username) {
      settings.discogs.username = username;
    }
    await this.saveUserSettings(settings);
  }

  async setLastFmCredentials(apiKey: string, sessionKey: string, username?: string): Promise<void> {
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

  async getLastFmCredentials(): Promise<{ apiKey?: string; sessionKey?: string; username?: string }> {
    const settings = await this.getUserSettings();
    return {
      apiKey: settings.lastfm.apiKey,
      sessionKey: settings.lastfm.sessionKey,
      username: settings.lastfm.username
    };
  }

  async clearTokens(): Promise<void> {
    const settings = await this.getUserSettings();
    settings.discogs = {};
    settings.lastfm = {};
    await this.saveUserSettings(settings);
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