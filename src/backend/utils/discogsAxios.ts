import axios, { AxiosInstance } from 'axios';

/**
 * Token-bucket rate limiter.
 * Allows bursting up to `maxTokens` requests, then throttles to
 * `refillRatePerSecond` requests per second on average.
 */
class TokenBucket {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRatePerMs: number;
  private lastRefill: number;

  constructor(maxTokens: number, refillRatePerSecond: number) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRatePerMs = refillRatePerSecond / 1000;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Wait until a token is available
    const waitMs = Math.ceil((1 - this.tokens) / this.refillRatePerMs);
    await new Promise(resolve => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens -= 1;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(
      this.maxTokens,
      this.tokens + elapsed * this.refillRatePerMs
    );
    this.lastRefill = now;
  }
}

/**
 * Shared rate-limited Axios instance for all Discogs API calls.
 * Uses a token-bucket algorithm: allows bursting up to 5 rapid requests,
 * then throttles to 1 req/sec (Discogs allows 60 req/min authenticated).
 *
 * Individual requests can override the timeout via config:
 *   this.axios.get('/path', { timeout: 30000 })
 */
let sharedInstance: AxiosInstance | null = null;
const bucket = new TokenBucket(5, 1);

export function getDiscogsAxios(): AxiosInstance {
  if (sharedInstance) return sharedInstance;

  sharedInstance = axios.create({
    baseURL: 'https://api.discogs.com',
    timeout: 10000,
    headers: {
      'User-Agent': 'RecordScrobbles/1.0',
    },
  });

  // Token-bucket rate limiting: burst up to 5, refill at 1/sec
  sharedInstance.interceptors.request.use(async config => {
    await bucket.acquire();
    return config;
  });

  return sharedInstance;
}
