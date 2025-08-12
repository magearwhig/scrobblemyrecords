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
