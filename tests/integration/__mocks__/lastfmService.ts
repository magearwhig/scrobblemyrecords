export class LastFmService {
  constructor(fileStorage: any, authService: any) {}

  async getAuthUrl(): Promise<string> {
    return 'https://www.last.fm/api/auth?api_key=test-api-key';
  }

  async handleCallback(): Promise<{ username: string }> {
    throw new Error('Test connection failed - no valid session');
  }

  async scrobbleTrack(): Promise<any> {
    throw new Error('Test connection failed - no valid session');
  }

  async scrobbleBatch(): Promise<any> {
    throw new Error('Test connection failed - no valid session');
  }

  async getRecentTracks(): Promise<any[]> {
    throw new Error('Test connection failed - no valid session');
  }

  async getTopTracks(): Promise<any[]> {
    throw new Error('Test connection failed - no valid session');
  }

  async getTopArtists(): Promise<any[]> {
    throw new Error('Test connection failed - no valid session');
  }
}
