import axios, { AxiosInstance, AxiosResponse } from 'axios';

/**
 * Token-bucket rate limiter with adaptive throttling based on Discogs API headers.
 *
 * Allows bursting up to `maxTokens` requests, then throttles to
 * `refillRatePerSecond` requests per second on average.
 *
 * When X-Discogs-Ratelimit-Remaining drops below a threshold, the bucket
 * automatically slows down. When a 429 is received or remaining hits 0,
 * all requests are paused until the rate limit window resets.
 */
class TokenBucket {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRatePerMs: number;
  private lastRefill: number;

  /** When true, all requests are paused until rate limit resets */
  private paused = false;
  private pausedUntil = 0;

  constructor(maxTokens: number, refillRatePerSecond: number) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRatePerMs = refillRatePerSecond / 1000;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    // If paused due to rate limit, wait until the pause expires
    if (this.paused) {
      const waitMs = Math.max(0, this.pausedUntil - Date.now());
      if (waitMs > 0) {
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
      this.paused = false;
      // After pause, reset tokens to allow a fresh burst
      this.tokens = Math.min(this.maxTokens, 2);
      this.lastRefill = Date.now();
    }

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

  /**
   * Pause all requests for the specified duration.
   * Called when a 429 is received or remaining quota hits 0.
   */
  pause(durationMs: number): void {
    this.paused = true;
    this.pausedUntil = Date.now() + durationMs;
  }

  /**
   * Slow down the refill rate temporarily.
   * Called when approaching the rate limit (remaining < threshold).
   */
  throttle(): void {
    // Drain tokens to force waiting before next request
    this.tokens = Math.min(this.tokens, 0.5);
  }

  /** Check if the bucket is currently paused */
  isPaused(): boolean {
    if (!this.paused) return false;
    if (Date.now() >= this.pausedUntil) {
      this.paused = false;
      return false;
    }
    return true;
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

/** Current rate limit state from Discogs API headers */
export interface RateLimitState {
  /** Total requests allowed per minute */
  limit: number;
  /** Requests used in current window */
  used: number;
  /** Requests remaining in current window */
  remaining: number;
  /** Whether the bucket is currently paused due to rate limiting */
  isThrottled: boolean;
  /** Timestamp of last header update */
  lastUpdated: number;
}

/**
 * Shared rate-limited Axios instance for all Discogs API calls.
 * Uses a token-bucket algorithm with adaptive throttling:
 * - Allows bursting up to 5 rapid requests
 * - Throttles to 1 req/sec (Discogs allows 60 req/min authenticated)
 * - Reads X-Discogs-Ratelimit-Remaining from responses
 * - Proactively slows down when approaching the limit
 * - Pauses all requests when a 429 is received
 *
 * Individual requests can override the timeout via config:
 *   this.axios.get('/path', { timeout: 30000 })
 */
let sharedInstance: AxiosInstance | null = null;
const bucket = new TokenBucket(5, 1);

/** Threshold below which we start throttling proactively */
const RATE_LIMIT_THROTTLE_THRESHOLD = 10;

/** How long to pause on 429 (Discogs rate limit window is ~60 seconds) */
const RATE_LIMIT_PAUSE_MS = 30000;

/** Current rate limit state, updated from response headers */
let rateLimitState: RateLimitState = {
  limit: 60,
  used: 0,
  remaining: 60,
  isThrottled: false,
  lastUpdated: 0,
};

export function getDiscogsAxios(): AxiosInstance {
  if (sharedInstance) return sharedInstance;

  sharedInstance = axios.create({
    baseURL: 'https://api.discogs.com',
    timeout: 10000,
    headers: {
      'User-Agent': 'RecordScrobbles/1.0',
    },
  });

  // Request interceptor: token-bucket rate limiting
  sharedInstance.interceptors.request.use(async config => {
    await bucket.acquire();
    return config;
  });

  // Response interceptor: read rate limit headers and adapt behavior
  sharedInstance.interceptors.response.use(
    (response: AxiosResponse) => {
      updateRateLimitFromHeaders(response);
      return response;
    },
    error => {
      // On 429, pause the bucket to prevent further requests
      if (axios.isAxiosError(error) && error.response?.status === 429) {
        updateRateLimitFromHeaders(error.response);
        bucket.pause(RATE_LIMIT_PAUSE_MS);
        rateLimitState.isThrottled = true;
        rateLimitState.lastUpdated = Date.now();
      }
      return Promise.reject(error);
    }
  );

  return sharedInstance;
}

/**
 * Update rate limit state from Discogs response headers.
 * Proactively throttles when approaching the limit.
 */
function updateRateLimitFromHeaders(response: AxiosResponse): void {
  const limit = parseInt(response.headers['x-discogs-ratelimit'] as string, 10);
  const used = parseInt(
    response.headers['x-discogs-ratelimit-used'] as string,
    10
  );
  const remaining = parseInt(
    response.headers['x-discogs-ratelimit-remaining'] as string,
    10
  );

  if (!isNaN(remaining)) {
    rateLimitState = {
      limit: !isNaN(limit) ? limit : rateLimitState.limit,
      used: !isNaN(used) ? used : rateLimitState.used,
      remaining,
      isThrottled: remaining <= 0 || bucket.isPaused(),
      lastUpdated: Date.now(),
    };

    // Proactive throttling: slow down when approaching the limit
    if (remaining > 0 && remaining <= RATE_LIMIT_THROTTLE_THRESHOLD) {
      bucket.throttle();
    }

    // Emergency: remaining hit 0 - pause to prevent 429
    if (remaining <= 0) {
      bucket.pause(RATE_LIMIT_PAUSE_MS);
    }
  }
}

/**
 * Get the current rate limit state.
 * Used by services to report rate limit status to the UI.
 */
export function getRateLimitState(): RateLimitState {
  return {
    ...rateLimitState,
    isThrottled: rateLimitState.isThrottled || bucket.isPaused(),
  };
}

export function resetDiscogsAxios(): void {
  sharedInstance = null;
}
