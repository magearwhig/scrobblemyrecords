import crypto from 'crypto';

import axios, { AxiosInstance } from 'axios';

import { ScrobbleTrack, ScrobbleSession } from '../../shared/types';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';

import { AuthService } from './authService';

export class LastFmService {
  private axios: AxiosInstance;
  private fileStorage: FileStorage;
  private authService: AuthService;
  private baseUrl = 'https://ws.audioscrobbler.com/2.0/';
  private logger = createLogger('LastFmService');

  constructor(fileStorage: FileStorage, authService: AuthService) {
    this.fileStorage = fileStorage;
    this.authService = authService;

    this.axios = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
    });

    // Rate limiting interceptor
    this.axios.interceptors.request.use(async config => {
      // Conservative rate limiting: 1 request per second
      await new Promise(resolve => setTimeout(resolve, 1000));
      return config;
    });
  }

  private generateApiSig(
    params: Record<string, string>,
    secret: string
  ): string {
    // Remove format from signature calculation as it's not part of the API signature
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { format: _, ...signatureParams } = params;

    const sortedParams = Object.keys(signatureParams)
      .sort()
      .map(key => `${key}${signatureParams[key]}`)
      .join('');

    return crypto
      .createHash('md5')
      .update(sortedParams + secret)
      .digest('hex');
  }

  async getAuthUrl(): Promise<string> {
    const credentials = await this.authService.getLastFmCredentials();
    if (!credentials.apiKey) {
      throw new Error('Last.fm API key not configured');
    }

    const backendPort = process.env.BACKEND_PORT || process.env.PORT || '3001';
    const callbackUrl =
      process.env.LASTFM_CALLBACK_URL ||
      `http://localhost:${backendPort}/api/v1/auth/lastfm/callback`;

    return `http://www.last.fm/api/auth/?api_key=${credentials.apiKey}&cb=${encodeURIComponent(callbackUrl)}`;
  }

  async getSession(
    token: string
  ): Promise<{ sessionKey: string; username: string }> {
    try {
      this.logger.info('Getting Last.fm session for token');
      const credentials = await this.authService.getLastFmCredentials();
      this.logger.debug('Last.fm credentials check', {
        apiKey: credentials.apiKey ? 'present' : 'missing',
      });

      if (!credentials.apiKey) {
        throw new Error('Last.fm API key not configured');
      }

      const secret = process.env.LASTFM_SECRET || '';
      this.logger.debug('Last.fm secret check', {
        secret: secret ? 'present' : 'missing',
      });

      // Parameters for signature generation (exclude format)
      const signatureParams = {
        method: 'auth.getSession',
        api_key: credentials.apiKey,
        token,
      };

      // Note: Signature params and API signature contain sensitive data and are not logged
      const apiSig = this.generateApiSig(signatureParams, secret);

      const response = await this.axios.post('', null, {
        params: {
          ...signatureParams,
          api_sig: apiSig,
          format: 'json', // Add format after signature generation
        },
      });

      this.logger.debug('Last.fm API response received');

      if (response.data.error) {
        this.logger.error('Last.fm API error', {
          error: response.data.error,
          message: response.data.message,
        });
        throw new Error(
          `Last.fm API error ${response.data.error}: ${response.data.message || 'Unknown error'}`
        );
      }

      const session = response.data.session;
      return {
        sessionKey: session.key,
        username: session.name,
      };
    } catch (error: any) {
      this.logger.error('Error getting Last.fm session', error);
      if (error.response) {
        this.logger.error('Last.fm API response error', {
          status: error.response.status,
          data: error.response.data,
          // Headers omitted as they may contain sensitive data
        });
      }
      throw error;
    }
  }

  async scrobbleTrack(track: ScrobbleTrack): Promise<{
    success: boolean;
    accepted: number;
    ignored: number;
    message: string;
  }> {
    try {
      this.logger.info('Starting scrobble for track', {
        artist: track.artist,
        track: track.track,
        album: track.album,
      });

      const credentials = await this.authService.getLastFmCredentials();
      if (!credentials.apiKey || !credentials.sessionKey) {
        throw new Error('Last.fm credentials not configured');
      }

      this.logger.debug('Last.fm credentials found', {
        apiKey: credentials.apiKey ? 'present' : 'missing',
        sessionKey: credentials.sessionKey ? 'present' : 'missing',
      });

      const secret = process.env.LASTFM_SECRET || '';
      if (!secret) {
        this.logger.error('LASTFM_SECRET environment variable is not set');
        throw new Error('Last.fm API secret not configured');
      }

      // Use provided timestamp or current time if not provided
      const timestamp = track.timestamp || Math.floor(Date.now() / 1000);
      this.logger.debug('Using timestamp for track', {
        timestamp,
        artist: track.artist,
        track: track.track,
      });

      // Clean and validate track data
      const cleanArtist = track.artist.trim();
      const cleanTrack = track.track.trim();
      const cleanAlbum = track.album ? track.album.trim() : '';

      if (!cleanArtist || !cleanTrack) {
        throw new Error('Artist and track names are required');
      }

      // Build parameters for signature generation (without format)
      const signatureParams: Record<string, string> = {
        method: 'track.scrobble',
        api_key: credentials.apiKey,
        sk: credentials.sessionKey,
        'artist[0]': cleanArtist,
        'track[0]': cleanTrack,
        'timestamp[0]': timestamp.toString(),
      };

      if (cleanAlbum) {
        signatureParams['album[0]'] = cleanAlbum;
      }

      if (track.duration && track.duration > 0) {
        signatureParams['duration[0]'] = track.duration.toString();
      }

      // Note: Signature parameters and API signature contain sensitive data and are not logged
      // Generate signature
      const apiSig = this.generateApiSig(signatureParams, secret);

      // Add format for the actual request
      const requestParams = {
        ...signatureParams,
        api_sig: apiSig,
        format: 'json',
      };

      this.logger.debug('Sending scrobble request to Last.fm');

      const response = await this.axios.post('', null, {
        params: requestParams,
      });

      this.logger.debug('Last.fm scrobble response received');

      if (response.data.error) {
        this.logger.error('Last.fm scrobble error', {
          error: response.data.error,
          message: response.data.message,
        });
        throw new Error(response.data.message || 'Scrobbling failed');
      }

      // Check scrobble status
      const scrobble = response.data.scrobbles?.['@attr'];
      const accepted = scrobble?.accepted || 0;
      const ignored = scrobble?.ignored || 0;

      if (scrobble) {
        this.logger.debug('Scrobble status', { accepted, ignored });
        if (ignored > 0) {
          this.logger.warn(
            `Scrobble ignored: ${ignored} tracks ignored, ${accepted} accepted`
          );
        }
      }

      const message =
        accepted > 0
          ? `Successfully scrobbled ${cleanArtist} - ${cleanTrack}`
          : `Scrobble ignored: ${cleanArtist} - ${cleanTrack} (may be duplicate or invalid)`;

      this.logger.info('Scrobble result', {
        accepted,
        ignored,
        success: accepted > 0,
      });

      return {
        success: accepted > 0,
        accepted,
        ignored,
        message,
      };
    } catch (error: any) {
      this.logger.error('Error scrobbling track', error);
      if (error.response) {
        this.logger.error('Last.fm API response error', {
          status: error.response.status,
          data: error.response.data,
          // Headers omitted as they may contain sensitive data
        });
      }
      throw error;
    }
  }

  async scrobbleBatch(tracks: ScrobbleTrack[]): Promise<{
    success: number;
    failed: number;
    ignored: number;
    errors: string[];
    sessionId: string;
  }> {
    const results = {
      success: 0,
      failed: 0,
      ignored: 0,
      errors: [] as string[],
    };

    // Create scrobble session
    const session: ScrobbleSession = {
      id: this.authService.generateNonce(),
      tracks,
      timestamp: Date.now(),
      status: 'pending',
    };

    await this.fileStorage.writeJSON(
      `scrobbles/session-${session.id}.json`,
      session
    );

    try {
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        try {
          const scrobbleResult = await this.scrobbleTrack(track);
          if (scrobbleResult.success) {
            results.success++;
          } else if (scrobbleResult.ignored > 0) {
            results.ignored++;
            results.errors.push(
              `${track.artist} - ${track.track}: ${scrobbleResult.message}`
            );
          } else {
            results.failed++;
            results.errors.push(
              `${track.artist} - ${track.track}: ${scrobbleResult.message}`
            );
          }

          // Update session with progress
          session.status = 'in-progress';
          session.progress = {
            current: i + 1,
            total: tracks.length,
            success: results.success,
            failed: results.failed,
            ignored: results.ignored,
          };
          await this.fileStorage.writeJSON(
            `scrobbles/session-${session.id}.json`,
            session
          );
        } catch (error) {
          results.failed++;
          results.errors.push(
            `${track.artist} - ${track.track}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );

          // Update session with error progress
          session.status = 'in-progress';
          session.progress = {
            current: i + 1,
            total: tracks.length,
            success: results.success,
            failed: results.failed,
            ignored: results.ignored,
          };
          await this.fileStorage.writeJSON(
            `scrobbles/session-${session.id}.json`,
            session
          );
        }
      }

      // Update session status
      session.status = results.failed === 0 ? 'completed' : 'failed';
      session.error =
        results.errors.length > 0 ? results.errors.join('; ') : undefined;
      session.progress = {
        current: tracks.length,
        total: tracks.length,
        success: results.success,
        failed: results.failed,
        ignored: results.ignored,
      };
      await this.fileStorage.writeJSON(
        `scrobbles/session-${session.id}.json`,
        session
      );

      return {
        success: results.success,
        failed: results.failed,
        ignored: results.ignored,
        errors: results.errors,
        sessionId: session.id,
      };
    } catch (error) {
      session.status = 'failed';
      session.error = error instanceof Error ? error.message : 'Unknown error';
      await this.fileStorage.writeJSON(
        `scrobbles/session-${session.id}.json`,
        session
      );
      throw error;
    }
  }

  async resubmitTracks(tracks: ScrobbleTrack[]): Promise<{
    success: number;
    failed: number;
    ignored: number;
    errors: string[];
  }> {
    const results = {
      success: 0,
      failed: 0,
      ignored: 0,
      errors: [] as string[],
    };

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      try {
        const scrobbleResult = await this.scrobbleTrack(track);
        if (scrobbleResult.success) {
          results.success++;
        } else if (scrobbleResult.ignored > 0) {
          results.ignored++;
          results.errors.push(
            `${track.artist} - ${track.track}: ${scrobbleResult.message}`
          );
        } else {
          results.failed++;
          results.errors.push(
            `${track.artist} - ${track.track}: ${scrobbleResult.message}`
          );
        }
      } catch (error) {
        results.failed++;
        results.errors.push(
          `${track.artist} - ${track.track}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    return {
      success: results.success,
      failed: results.failed,
      ignored: results.ignored,
      errors: results.errors,
    };
  }

  async getScrobbleHistory(): Promise<ScrobbleSession[]> {
    try {
      const files = await this.fileStorage.listFiles('scrobbles');
      const sessions: ScrobbleSession[] = [];

      for (const file of files) {
        if (file.startsWith('session-')) {
          const session = await this.fileStorage.readJSON<ScrobbleSession>(
            `scrobbles/${file}`
          );
          if (session) {
            sessions.push(session);
          }
        }
      }

      return sessions.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      this.logger.error('Error getting scrobble history', error);
      return [];
    }
  }

  async testConnection(): Promise<{
    success: boolean;
    message: string;
    userInfo?: any;
  }> {
    try {
      this.logger.info('Testing Last.fm connection...');

      const credentials = await this.authService.getLastFmCredentials();
      if (!credentials.apiKey || !credentials.sessionKey) {
        return {
          success: false,
          message:
            'Last.fm credentials not configured. Please authenticate first.',
        };
      }

      const secret = process.env.LASTFM_SECRET || '';
      if (!secret) {
        return {
          success: false,
          message:
            'Last.fm API secret not configured. Please check your environment variables.',
        };
      }

      // Test by getting user info
      const userInfo = await this.getUserInfo();

      return {
        success: true,
        message: `Connected successfully to Last.fm as ${userInfo.name}`,
        userInfo,
      };
    } catch (error: any) {
      this.logger.error('Last.fm connection test failed', error);
      return {
        success: false,
        message: error.message || 'Failed to connect to Last.fm',
      };
    }
  }

  async getUserInfo(): Promise<any> {
    try {
      const credentials = await this.authService.getLastFmCredentials();
      if (!credentials.apiKey || !credentials.sessionKey) {
        throw new Error('Last.fm credentials not configured');
      }

      const response = await this.axios.get('', {
        params: {
          method: 'user.getInfo',
          api_key: credentials.apiKey,
          sk: credentials.sessionKey,
          format: 'json',
        },
      });

      if (response.data.error) {
        throw new Error(response.data.message || 'Failed to get user info');
      }

      return response.data.user;
    } catch (error) {
      this.logger.error('Error getting user info', error);
      throw error;
    }
  }

  async getRecentScrobbles(limit: number = 10): Promise<any[]> {
    try {
      const credentials = await this.authService.getLastFmCredentials();
      if (!credentials.apiKey || !credentials.username) {
        throw new Error('Last.fm credentials not configured');
      }

      const response = await this.axios.get('', {
        params: {
          method: 'user.getRecentTracks',
          api_key: credentials.apiKey,
          user: credentials.username,
          limit: limit.toString(),
          format: 'json',
        },
      });

      if (response.data.error) {
        throw new Error(
          response.data.message || 'Failed to get recent scrobbles'
        );
      }

      return response.data.recenttracks.track || [];
    } catch (error) {
      this.logger.error('Error getting recent scrobbles', error);
      throw error;
    }
  }

  async getTopTracks(
    period: '7day' | '1month' | '3month' | '6month' | '12month' = '7day',
    limit: number = 10
  ): Promise<any[]> {
    try {
      const credentials = await this.authService.getLastFmCredentials();
      if (!credentials.apiKey || !credentials.username) {
        throw new Error('Last.fm credentials not configured');
      }

      const response = await this.axios.get('', {
        params: {
          method: 'user.getTopTracks',
          api_key: credentials.apiKey,
          user: credentials.username,
          period,
          limit: limit.toString(),
          format: 'json',
        },
      });

      if (response.data.error) {
        throw new Error(response.data.message || 'Failed to get top tracks');
      }

      return response.data.toptracks.track || [];
    } catch (error) {
      this.logger.error('Error getting top tracks', error);
      throw error;
    }
  }

  async getTopArtists(
    period: '7day' | '1month' | '3month' | '6month' | '12month' = '7day',
    limit: number = 10
  ): Promise<any[]> {
    try {
      const credentials = await this.authService.getLastFmCredentials();
      if (!credentials.apiKey || !credentials.username) {
        throw new Error('Last.fm credentials not configured');
      }

      const response = await this.axios.get('', {
        params: {
          method: 'user.getTopArtists',
          api_key: credentials.apiKey,
          user: credentials.username,
          period,
          limit: limit.toString(),
          format: 'json',
        },
      });

      if (response.data.error) {
        throw new Error(response.data.message || 'Failed to get top artists');
      }

      return response.data.topartists.artist || [];
    } catch (error) {
      this.logger.error('Error getting top artists', error);
      throw error;
    }
  }

  async getLibraryArtists(
    limit: number = 50,
    page: number = 1
  ): Promise<{
    artists: Array<{ name: string; playcount: string; url: string }>;
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  }> {
    try {
      const credentials = await this.authService.getLastFmCredentials();
      if (!credentials.apiKey || !credentials.username) {
        throw new Error('Last.fm credentials not configured');
      }

      const response = await this.axios.get('', {
        params: {
          method: 'library.getArtists',
          api_key: credentials.apiKey,
          user: credentials.username,
          limit: limit.toString(),
          page: page.toString(),
          format: 'json',
        },
      });

      if (response.data.error) {
        throw new Error(
          response.data.message || 'Failed to get library artists'
        );
      }

      const attr = response.data.artists?.['@attr'] || {};
      return {
        artists: response.data.artists?.artist || [],
        total: parseInt(attr.total || '0', 10),
        page: parseInt(attr.page || '1', 10),
        perPage: parseInt(attr.perPage || '50', 10),
        totalPages: parseInt(attr.totalPages || '1', 10),
      };
    } catch (error) {
      this.logger.error('Error getting library artists', error);
      throw error;
    }
  }

  async getArtistPlaycount(artistName: string): Promise<number | null> {
    try {
      const credentials = await this.authService.getLastFmCredentials();
      if (!credentials.apiKey || !credentials.username) {
        return null;
      }

      // Search through library artists to find the specific one
      // This is a workaround since there's no direct "get playcount for artist X" API
      let page = 1;
      const limit = 100;
      const searchName = artistName.toLowerCase();

      while (page <= 10) {
        // Limit search to first 1000 artists
        const result = await this.getLibraryArtists(limit, page);

        for (const artist of result.artists) {
          if (artist.name.toLowerCase() === searchName) {
            return parseInt(artist.playcount, 10);
          }
        }

        if (page >= result.totalPages) {
          break;
        }
        page++;
      }

      return null; // Artist not found in library
    } catch (error) {
      this.logger.error('Error getting artist playcount', error);
      return null;
    }
  }
}
