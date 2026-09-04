import * as fs from 'fs';
import * as os from 'os';

// Retry flaky tests (supertest ephemeral port issues)
jest.retryTimes(2, { logErrorsBeforeRetry: true });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.PORT = '3002'; // Use different port for tests

// Use a proper 32+ character key for testing
process.env.ENCRYPTION_KEY =
  'test-encryption-key-for-testing-32-chars-minimum-length-required';

// Mock API credentials for testing environment
// These prevent 500 errors in DiscogsService and LastFmService during integration tests
process.env.DISCOGS_CLIENT_ID = 'test-discogs-client-id';
process.env.DISCOGS_CLIENT_SECRET = 'test-discogs-client-secret';
process.env.LASTFM_API_KEY = 'test-lastfm-api-key';
process.env.LASTFM_SECRET = 'test-lastfm-secret';

// Tear down the per-file temp data directory created by tests/setupEnv.ts.
// The path is captured here at module load, NOT read inside afterAll: a test
// that reassigns DATA_DIR must not be able to redirect this recursive delete.
const TEMP_DATA_DIR = process.env.DATA_DIR;

afterAll(() => {
  if (TEMP_DATA_DIR && TEMP_DATA_DIR.startsWith(os.tmpdir())) {
    fs.rmSync(TEMP_DATA_DIR, { recursive: true, force: true });
  }
});
