import crypto from 'crypto';

import axios, { AxiosInstance } from 'axios';

import { ScrobbleTrack, ScrobbleSession } from '../../shared/types';
import { FileStorage } from '../utils/fileStorage';

import { AuthService } from './authService';

export class LastFmService {
  private axios: AxiosInstance;
  private fileStorage: FileStorage;
  private authService: AuthService;
  private baseUrl = 'https://ws.audioscrobbler.com/2.0/';

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
      console.log('Getting Last.fm session for token:', token);
      const credentials = await this.authService.getLastFmCredentials();
      console.log('Last.fm credentials:', {
        apiKey: credentials.apiKey ? 'present' : 'missing',
      });

      if (!credentials.apiKey) {
        throw new Error('Last.fm API key not configured');
      }

      const secret = process.env.LASTFM_SECRET || '';
      console.log('Last.fm secret:', secret ? 'present' : 'missing');

      // Parameters for signature generation (exclude format)
      const signatureParams = {
        method: 'auth.getSession',
        api_key: credentials.apiKey,
        token,
      };

      console.log('Last.fm signature params:', signatureParams);
      const apiSig = this.generateApiSig(signatureParams, secret);
      console.log('Generated API signature:', apiSig);

      const response = await this.axios.post('', null, {
        params: {
          ...signatureParams,
          api_sig: apiSig,
          format: 'json', // Add format after signature generation
        },
      });

      console.log('Last.fm API response:', response.data);

      if (response.data.error) {
        console.error('Last.fm API error:', response.data);
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
      console.error('Error getting Last.fm session:', error);
      if (error.response) {
        console.error('Last.fm API response error:', {
          status: error.response.status,
          data: error.response.data,
          headers: error.response.headers,
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
      console.log('Starting scrobble for track:', track);

      const credentials = await this.authService.getLastFmCredentials();
      if (!credentials.apiKey || !credentials.sessionKey) {
        throw new Error('Last.fm credentials not configured');
      }

      console.log('Last.fm credentials found:', {
        apiKey: credentials.apiKey ? 'present' : 'missing',
        sessionKey: credentials.sessionKey ? 'present' : 'missing',
      });

      const secret = process.env.LASTFM_SECRET || '';
      if (!secret) {
        console.error('LASTFM_SECRET environment variable is not set!');
        throw new Error('Last.fm API secret not configured');
      }

      // Use provided timestamp or current time if not provided
      const timestamp = track.timestamp || Math.floor(Date.now() / 1000);
      console.log(
        'Using timestamp:',
        timestamp,
        'for track:',
        track.artist,
        '-',
        track.track
      );

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

      console.log('Signature parameters:', signatureParams);

      // Generate signature
      const apiSig = this.generateApiSig(signatureParams, secret);
      console.log('Generated API signature:', apiSig);

      // Add format for the actual request
      const requestParams = {
        ...signatureParams,
        api_sig: apiSig,
        format: 'json',
      };

      console.log('Sending request to Last.fm with params:', requestParams);

      const response = await this.axios.post('', null, {
        params: requestParams,
      });

      console.log('Last.fm scrobble response:', response.data);

      if (response.data.error) {
        console.error('Last.fm scrobble error:', response.data);
        throw new Error(response.data.message || 'Scrobbling failed');
      }

      // Check scrobble status
      const scrobble = response.data.scrobbles?.['@attr'];
      const accepted = scrobble?.accepted || 0;
      const ignored = scrobble?.ignored || 0;

      if (scrobble) {
        console.log('Scrobble status:', scrobble);
        if (ignored > 0) {
          console.warn(
            `Scrobble ignored: ${ignored} tracks ignored, ${accepted} accepted`
          );
        }
      }

      const message =
        accepted > 0
          ? `Successfully scrobbled ${cleanArtist} - ${cleanTrack}`
          : `Scrobble ignored: ${cleanArtist} - ${cleanTrack} (may be duplicate or invalid)`;

      console.log('Scrobble result:', { accepted, ignored, message });

      return {
        success: accepted > 0,
        accepted,
        ignored,
        message,
      };
    } catch (error: any) {
      console.error('Error scrobbling track:', error);
      if (error.response) {
        console.error('Last.fm API response error:', {
          status: error.response.status,
          data: error.response.data,
          headers: error.response.headers,
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
      console.error('Error getting scrobble history:', error);
      return [];
    }
  }

  async testConnection(): Promise<{
    success: boolean;
    message: string;
    userInfo?: any;
  }> {
    try {
      console.log('Testing Last.fm connection...');

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
      console.error('Last.fm connection test failed:', error);
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
      console.error('Error getting user info:', error);
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
      console.error('Error getting recent scrobbles:', error);
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
      console.error('Error getting top tracks:', error);
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
      console.error('Error getting top artists:', error);
      throw error;
    }
  }
}
