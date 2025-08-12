export class DiscogsService {
  constructor(fileStorage: any, authService: any) {}

  async getAuthUrl(): Promise<string> {
    return 'https://discogs.com/oauth/authorize?oauth_token=test-request-token';
  }

  async handleCallback(): Promise<{ username: string }> {
    throw new Error('Test connection failed - no valid token');
  }

  async getUserCollection(): Promise<any[]> {
    throw new Error('Test connection failed - no valid token');
  }

  async searchCollection(): Promise<any[]> {
    throw new Error('Test connection failed - no valid token');
  }

  async getReleaseDetails(): Promise<any> {
    throw new Error('Test connection failed - no valid token');
  }

  async getCachedCollection(): Promise<any[]> {
    return [];
  }

  async clearCache(): Promise<void> {
    return;
  }

  async checkForNewItems(): Promise<any> {
    throw new Error('Test connection failed - no valid token');
  }

  async updateCacheWithNewItems(): Promise<void> {
    return;
  }
}
