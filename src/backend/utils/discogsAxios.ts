import axios, { AxiosInstance } from 'axios';

/**
 * Shared rate-limited Axios instance for all Discogs API calls.
 * Enforces a global 1 request/second rate limit across all services
 * to avoid Discogs 429 errors.
 *
 * Individual requests can override the timeout via config:
 *   this.axios.get('/path', { timeout: 30000 })
 */
let sharedInstance: AxiosInstance | null = null;
let lastRequestTime = 0;

export function getDiscogsAxios(): AxiosInstance {
  if (sharedInstance) return sharedInstance;

  sharedInstance = axios.create({
    baseURL: 'https://api.discogs.com',
    timeout: 10000,
    headers: {
      'User-Agent': 'RecordScrobbles/1.0',
    },
  });

  // Global rate limiting interceptor: 1 req/sec across all callers
  sharedInstance.interceptors.request.use(async config => {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < 1000) {
      await new Promise(resolve => setTimeout(resolve, 1000 - elapsed));
    }
    lastRequestTime = Date.now();
    return config;
  });

  return sharedInstance;
}
